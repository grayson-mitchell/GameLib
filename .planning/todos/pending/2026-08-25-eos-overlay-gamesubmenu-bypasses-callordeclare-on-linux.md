---
created: 2026-08-25
title: "`GameSubMenu`'s three EOS overlay call sites bypass `callOrDeclare` entirely"
source: 34.6-LIVE-GATE.md Step 2, FINDING 2 (plan 34.6-12, 2026-08-24) -- disposition explicitly assigned to plan 34.6-14
status: pending
severity: medium
resolves_phase: "unassigned"
blocked_by: "nothing external -- fixable in-place once a plan's scope permits a source-file change to GameSubMenu/index.tsx"
---

# `GameSubMenu`'s three EOS overlay call sites bypass `callOrDeclare` entirely

## The gap

`src/frontend/screens/Game/GameSubMenu/index.tsx:225-241`'s `handleEosOverlay()` calls
`window.api.disableEosOverlay(appName)` (line 228), `window.api.enableEosOverlay(appName)`
(line 231), and `window.api.installEosOverlay()` (line 237) **directly** -- none of the three
call sites go through the `callOrDeclare` wrapper
(`src/frontend/helpers/declaredUnavailable.ts`) that D-08 established as this app's only
renderer-to-`gamelib.log` path for declared-unavailable/unported channel outcomes.

Confirmed by direct grep: `grep -n "callOrDeclare\|declaredUnavailable"
src/frontend/screens/Game/GameSubMenu/index.tsx` returns **zero matches**.

## Why it matters -- traced, not just asserted

This menu item is reachable only on Linux (`GameSubMenu/index.tsx:461`,
`{isLinux && runner === 'legendary' && (...)}`). On that platform, if
`enableEosOverlay`/`disableEosOverlay` ever reject (e.g. a legendary-side EOS failure), the
rejection is an unhandled promise rejection in the renderer -- not a `callOrDeclare`-logged
decline. The frontend entry bundle registers two separate error-listener layers, and neither
reaches `gamelib.log` for this shape:

1. `src/frontend/bootErrorSurface.ts` (imported first in `index.tsx`) registers both `error`
   and `unhandledrejection` listeners, but its shared `renderBootError()` handler is guarded
   to never clobber an already-mounted app -- once `#root` has children (true during normal
   play, e.g. clicking this EOS menu item), it only `console.error(...)`s and returns; it
   never calls `window.api.logError`.
2. `src/frontend/index.tsx` (~line 41) separately registers
   `window.addEventListener('error', ...)` -> `window.api.logError(ev.error)` -- the genuine
   bridge to `gamelib.log` -- but it listens **only** for `'error'`, never
   `'unhandledrejection'`.

Net effect: a post-mount `unhandledrejection` from these three call sites produces **zero**
log lines in `gamelib.log`. `EosDeclineCallSiteGuard.test.ts:46`'s `EXPECTED_EOS_CALL_SITES = 11`
cannot see this -- it only enumerates call sites that already conform to the `callOrDeclare`
wrapping convention it scans for, so a non-conforming call site never appears in its count at
all. A guard that enumerates conforming call sites cannot detect a non-conforming one.

## Not fixed here

Recorded by `34.6-LIVE-GATE.md` Step 2 for disposition, not correction -- correcting it (wrapping
the three call sites in `callOrDeclare`) is a source-code change, out of scope for the
documentation-only plan (34.6-14) that filed this todo. `resolves_phase` is left `"unassigned"`
deliberately: no live phase currently owns Linux-side EOS overlay hardening work, and setting it
to a phase that isn't actually planning this work would risk a silent auto-close (per this
project's own recorded lesson that `resolves_phase`/`blocked_by` records rot silently).

## Discharge condition

All three call sites (`disableEosOverlay`, `enableEosOverlay`, `installEosOverlay`) in
`GameSubMenu/index.tsx` are wrapped in `callOrDeclare`, matching the convention already used by
`AdvancedSettings/index.tsx`'s 11 EOS call sites, with `EosDeclineCallSiteGuard.test.ts`'s
non-vacuity anchor updated to reflect the new total call-site count across both files.
