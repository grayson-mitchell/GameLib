---
created: 2026-09-06
title: "GOG presence is never set at startup, and its 5-minute keep-alive never arms until the user launches a GOG game"
area: tauri-sidecar
status: "RESOLVED 2026-09-09 by quick-260909-k5x -- ported the deleted main.ts:477 call
  (`runOnceWhenOnline(gogPresence.setPresence)`) into bootstrap.ts's init() as Block H
  (`setGogPresenceWhenOnline()`), appended after Block G. Block H has NO load-bearing ordering
  constraint of its own (D-K5X-01) -- only the generic three every boot-time block in this file
  already satisfies (after initLogger(), after initOnlineMonitor(), before READY_SENTINEL); each
  of Blocks D/E/F/G was individually checked and refuted as a dependency. NO settings read was
  hoisted to the call site, unlike Block G's D5 -- on port-fidelity grounds, because the deleted
  main.ts:477 line was a bare call with zero settings access, so the disableGOGPresence /
  disablePlaytimeSync gate stays exactly where the deleted source left it, inside setPresence()
  itself, evaluated at online time (D-K5X-02). Three guard layers protect the call site: the
  module-scope gogPresenceInitialized flag (prevents duplicate registrations across repeated
  init() calls), an outer try/catch around registration, and an inner try/catch plus an explicit
  .catch() around the deferred callback body (defence-in-depth; setPresence() cannot reject as
  currently written, since its own try/catch already swallows). BOTH halves of this todo's title
  are closed: presence.ts's `interval` is undefined at process start, so the boot-time call is
  also what arms the 5-minute keep-alive. Proven by a new dedicated suite,
  gogPresenceBootWire.test.ts (5 cases: init()-driven wiring, direct-call wiring, the D-K5X-02
  no-settings-hoist receipt, and both never-fails-boot arms -- rejection and synchronous throw),
  plus 4 required mutations (delete the call site, delete the inner try/catch, hoist a settings
  read, destructure setPresence at import) each observed RED on its targeted case and reverted.
  A SEPARATE, NOT-fixed-here defect was found and filed during this triage:
  deletePresence() never resets `interval` after clearInterval(), so setPresence()'s
  `if (!interval)` guard stays falsy-blocked and the keep-alive cannot re-arm after any
  deletePresence() call within the same process -- see
  `2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md`."
resolved_by: quick-260909-k5x
severity: medium
platform: any
ready: code
source: "quick-260906-gej, sweep FINDINGS.md section A row A3"
files:
  - src/backend/storeManagers/gog/presence.ts (setPresence, its internal setInterval)
resolves_phase: null
---

# GOG presence is never set at startup, and its 5-minute keep-alive never arms until the user launches a GOG game

## The unported side effect

Old `main.ts` called `runOnceWhenOnline(gogPresence.setPresence)` at startup (`main.ts:477`), so
GOG presence would go online as soon as GameLib started (once online).

## Bundle-level evidence

Evidence taken against `build/main/sidecar.js` (1351269 bytes, 2026-09-06 10:27):

`setPresence` call sites in the bundle: `:2434` (its own 5-minute `setInterval`, armed only from
inside a first call), `:2496` (`settingChanged` listener), `:8205`/`:8220` (`launcher.ts`, game
start/stop). **No startup call.**

## Consequence

GOG presence never goes online while GameLib runs, unless and until the user launches a GOG game
(which triggers `setPresence` from `launcher.ts`). Because the 5-minute keep-alive interval is
armed *inside* `setPresence` itself, nothing arms it either until that first call happens. The
feature only works after the user launches a GOG game — it does not work simply from having
GameLib open.
