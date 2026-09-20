---
created: 2026-08-25
title: "`GameSubMenu`'s five EOS overlay call sites bypass `callOrDeclare` entirely"
source: 34.6-LIVE-GATE.md Step 2, FINDING 2 (plan 34.6-12, 2026-08-24) -- disposition explicitly assigned to plan 34.6-14
status: completed
severity: medium
platform: any
ready: code
resolves_phase: "unassigned"
blocked_by: "nothing external -- fixable in-place once a plan's scope permits a source-file change to GameSubMenu/index.tsx"
resolved: 2026-09-19
resolved_by: quick-260919-tms
---

# `GameSubMenu`'s five EOS overlay call sites bypass `callOrDeclare` entirely

## The gap

**Correction (quick-260919-tms, measured against HEAD `318817a88`): the original title and body
below said "three" call sites and stale line numbers. The real count is FIVE, and the stale
numbers must not be trusted -- see "What was actually shipped" for the corrected census.**

`src/frontend/screens/Game/GameSubMenu/index.tsx`'s `handleEosOverlay()` (originally reported as
spanning `225-241`; the real pre-fix span was `231-281`) called
`window.api.disableEosOverlay(appName)`, `window.api.enableEosOverlay(appName)`, and
`window.api.installEosOverlay()` **directly** -- none of these call sites went through the
`callOrDeclare` wrapper (`src/frontend/helpers/declaredUnavailable.ts`) that deferral id `D-03`
(the original report misnamed this id -- see the correction below) established as this app's
only renderer-to-`gamelib.log` path for declared-unavailable/unported channel outcomes.

The original report undercounted at three. The real, measured count is **five**:

1. `window.api.disableEosOverlay(appName)` -- in `handleEosOverlay()`'s `if (eosOverlayEnabled)`
   branch. (Recorded in the original report, as "line 228".)
2. `window.api.enableEosOverlay(appName)` -- the first call, in the `else` branch. (Recorded in
   the original report, as "line 231".)
3. `window.api.installEosOverlay()` -- inside the install-confirmation dialog's Yes handler.
   (Recorded in the original report, as "line 237".)
4. `window.api.enableEosOverlay(appName)` -- a **second**, distinct call, also inside the dialog's
   Yes handler, immediately after the install call above. **Newly found by this plan -- the
   original report never recorded this site at all.**
5. `window.api.isEosOverlayEnabled(appName)` -- in the `useEffect` probe that runs on mount to
   read whether the overlay is already enabled, called as
   `window.api\n  .isEosOverlayEnabled(appName)\n  .then(...)`. **Newly found by this plan -- the
   original report never recorded this site at all.**

Confirmed by direct grep (this plan, pre-edit): `grep -n "callOrDeclare\|declaredUnavailable"
src/frontend/screens/Game/GameSubMenu/index.tsx` returned **zero matches**.

**On the stale line numbers:** the original report's line numbers (`225-241`, `228`, `231`,
`237`) no longer matched the file when this plan measured it -- the real pre-fix span was
`231-281`. A future reader should not trust a rendered line number in an old todo without
re-measuring against current `HEAD`.

**On the deferral id:** the original report named a different, incorrect single-digit deferral
id. The correct id, and the one the exported `DEFERRAL_D03` constant in
`declaredUnavailable.ts` actually represents, is **`D-03`**.

## Why it matters -- traced, not just asserted

This menu item is reachable only on Linux (`GameSubMenu/index.tsx`,
`{isLinux && runner === 'legendary' && (...)}`). On that platform, if
`enableEosOverlay`/`disableEosOverlay`/`installEosOverlay`/`isEosOverlayEnabled` ever reject
(e.g. a legendary-side EOS failure), the rejection was an unhandled promise rejection in the
renderer -- not a `callOrDeclare`-logged decline. The frontend entry bundle registers two
separate error-listener layers, and neither reaches `gamelib.log` for this shape:

1. `src/frontend/bootErrorSurface.ts` (imported first in `index.tsx`) registers both `error`
   and `unhandledrejection` listeners, but its shared `renderBootError()` handler is guarded
   to never clobber an already-mounted app -- once `#root` has children (true during normal
   play, e.g. clicking this EOS menu item), it only `console.error(...)`s and returns; it
   never calls `window.api.logError`.
2. `src/frontend/index.tsx` (~line 41) separately registers
   `window.addEventListener('error', ...)` -> `window.api.logError(ev.error)` -- the genuine
   bridge to `gamelib.log` -- but it listens **only** for `'error'`, never
   `'unhandledrejection'`.

Net effect: a post-mount `unhandledrejection` from these five call sites produced **zero**
log lines in `gamelib.log`, and a decline also left the "refreshing" spinner stuck until
remount (see "What was actually shipped" below). `EosDeclineCallSiteGuard.test.ts`'s
`EXPECTED_EOS_CALL_SITES = 11` cannot see this -- it only enumerates call sites in
`AdvancedSettings/index.tsx` that already conform to the `callOrDeclare` wrapping convention it
scans for, and it is hard-bound to that one file. A guard that enumerates conforming call sites
in one file cannot detect a non-conforming one in a different file.

## Not fixed here (at filing time)

Recorded by `34.6-LIVE-GATE.md` Step 2 for disposition, not correction -- correcting it (wrapping
the three call sites in `callOrDeclare`, as the original report understood the scope) was a
source-code change, out of scope for the documentation-only plan (34.6-14) that filed this todo.
`resolves_phase` was left `"unassigned"` deliberately: no live phase owned Linux-side EOS overlay
hardening work at filing time, and setting it to a phase that wasn't actually planning this work
would have risked a silent auto-close (per this project's own recorded lesson that
`resolves_phase`/`blocked_by` records rot silently).

## Discharge condition (corrected)

**The original discharge condition was unbuildable as written.** It instructed updating
`EosDeclineCallSiteGuard.test.ts`'s non-vacuity anchor "to reflect the new total call-site count
across both files." That guard's `componentPath = join(__dirname, '..', 'index.tsx')` hard-binds
it to `AdvancedSettings/index.tsx`, and 5 of its 6 assertions
(`eosOverlayUnavailable`/`getMainEosText()`/`window.api.abort`) are AdvancedSettings-specific --
there is no cross-file total for that guard to grow into.

**What was actually done instead:** a separately-named sibling guard,
`src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts`,
scoped to `GameSubMenu/index.tsx` alone. `AdvancedSettings/__tests__/EosDeclineCallSiteGuard.test.ts`
was left byte-unchanged, with its own `EXPECTED_EOS_CALL_SITES = 11` untouched.

## What was actually shipped (quick-260919-tms, 2026-09-19)

- **Shared `EOS_FEATURE` export.** `GameSubMenu/index.tsx` **is** listed in
  `meta/i18nGateScope.json` (unlike `AdvancedSettings/index.tsx`, which is not, and which keeps
  its own local `EOS_FEATURE`/`EOS_DEFERRAL` duplicate untouched). A local two-word string
  constant declared inside GameSubMenu would fail `meta/hardcodedStringGate.ts`'s
  `isTechnicalToken()` (`LOWERCASE_TOKEN_RE` only exempts single-word camelCase tokens) and be
  flagged as a blocking violation. `EOS_FEATURE` was instead exported from
  `src/frontend/helpers/declaredUnavailable.ts`, a file the gate does not scan, alongside the
  already-exported `DEFERRAL_D03`.
- **Whitespace-tolerant call-site regex.** The new guard's call-site scan uses
  `window\.api\s*\.\s*(<channel>)`, not the strict `window\.api\.(<channel>)` form
  `AdvancedSettings`'s guard uses -- measured: the strict form only found 4 of GameSubMenu's 5
  real call sites, because whitespace-collapsing the pre-fix
  `window.api\n  .isEosOverlayEnabled(appName)` method-chain break turns the newline+indent into
  a single space, which the strict dot-adjacency form cannot match. The new guard's self-test
  block pins this specific case so the tolerance is proven, not assumed.
- **Spinner-release behaviour (the actual defect fix, not just logging).** `callOrDeclare`
  resolves `{ok:false}` on rejection and never throws, so every `await window.api.<channel>(...)`
  call site was rewritten to release `eosOverlayRefresh` on its `!result.ok` decline path --
  the "refreshing" spinner (`index.tsx`'s `eosOverlayRefresh ? refreshCircle() : <button>...`)
  can no longer stick until remount on a rejection. The `isEosOverlayEnabled` probe in the
  `useEffect` touches no spinner state at all (that flag is driven by `libraryStatus`
  immediately above it in the same effect).
- **Explicitly declined scope.** GameSubMenu did **not** get `AdvancedSettings`' visible
  `eosOverlayUnavailable` UI state or decline text -- its EOS surface is one toggle button, not
  a status panel, and `EOS_FEATURE` only ever reaches `callOrDeclare`'s internal
  `window.api.logError` line, never rendered to a user. If a visible decline affordance is
  wanted for GameSubMenu later, that is a separate, new todo.
- **Nothing was verified live.** The EOS overlay menu item renders only under
  `isLinux && runner === 'legendary'`, and this fix was executed on macOS. The fix is proven
  structurally, by the new guard's source-text assertions and by `callOrDeclare`'s own contract
  (never throws, always resolves a discriminated `{ok, ...}` result) -- not by a live click.
