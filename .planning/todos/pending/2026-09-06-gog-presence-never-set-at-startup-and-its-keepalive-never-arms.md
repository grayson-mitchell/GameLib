---
created: 2026-09-06
title: "GOG presence is never set at startup, and its 5-minute keep-alive never arms until the user launches a GOG game"
area: tauri-sidecar
status: OPEN
severity: medium
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
