---
phase: 49-cross-store-signed-out-offline-mode
reviewed: 2026-10-09T22:41:57Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - src/common/signInState.ts
  - src/common/signInDismissal.ts
  - src/common/types/storePolicy.ts
  - src/common/types/ipc.ts
  - src/backend/signInProbe/classify.ts
  - src/backend/signInProbe/sessionEpoch.ts
  - src/backend/signInProbe/outcomes.ts
  - src/backend/signInProbe/verdict.ts
  - src/backend/signInProbe/pass.ts
  - src/backend/signInProbe/runnerProbes.ts
  - src/backend/storeManagers/steam/authTrigger.ts
  - src/backend/storeManagers/steam/user.ts
  - src/backend/storeManagers/legendary/epicOfflineMode.ts
  - src/backend/storeManagers/nile/library.ts
  - src/backend/storeManagers/nile/user.ts
  - src/backend/humble/user.ts
  - src/backend/humble/secretStore.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/launcher.ts
  - src/frontend/screens/Library/librarySignInRows.ts
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/components/LibrarySignInNotice/index.tsx
  - src/frontend/screens/Login/signInTileState.ts
  - src/frontend/screens/Login/loginOpenParam.ts
  - src/frontend/state/GlobalState.tsx
  - src/frontend/helpers/signInInputs.ts
  - src/frontend/helpers/electronStores.ts
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-SPEC.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-01-SUMMARY.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-02-SUMMARY.md through 49-12-SUMMARY.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-LIVE-GATE.md (Run 1, Post-run disposition sections)
  - .planning/todos/pending/2026-10-10-nile-classifier-flips-on-stdout-stderr-interleaving.md
  - .planning/todos/pending/2026-10-10-amazon-probe-is-a-no-op-with-nothing-installed.md
  - .planning/todos/pending/2026-10-10-library-sign-in-rows-do-not-rederive-a-mid-session-clear.md
findings:
  critical: 0
  warning: 4
  info: 0
  total: 4
status: issues_found
---

# Phase 49: Code Review Report

**Reviewed:** 2026-10-09T22:41:57Z
**Depth:** standard
**Files Reviewed:** 34 (plus required planning/spec reading)
**Status:** issues_found

## Scope note

The task's SUMMARY-declared scope for Phase 49 is 91 files. A `git diff 0cc76f1f6..HEAD`
cross-check surfaces a larger raw changed-file set (it includes 49 locale directories × 2
catalogue files each, which inflates the count well past 91 on their own). Per the explicit
scoping instruction given for this review, the following categories are **deliberately
EXCLUDED** as Phase 48 work or unrelated fixes merged from `main` during this phase's window,
not Phase 49 work:

- `FocusRowStrip` component and its tests (`focusRowOverflow.ts`, `index.tsx`, `index.css`,
  `__tests__/focusRow*.test.ts`)
- `GameCard` focus-ring CSS/test (`index.css`, `__tests__/gameCardFocusRing.test.ts`)
- The Steam depot LZMA loader/native-binding surface (`depot/lzmaLoader.ts`,
  `depot/lzmaNativeBinding.ts`, `decompressPool.test.ts`, `lzmaNativeBinding.test.ts`,
  `lzmaNativeSeaRealBuild.test.ts`)
- CSP and Dock-quit changes (outside the diff window reviewed here)
- `Login/components/Runner` a11y changes and its test

This review covers the Phase 49 sign-in/offline-mode logic surface: the common selector
(`signInState.ts`, `signInDismissal.ts`), the sidecar probe pipeline
(`signInProbe/{classify,sessionEpoch,outcomes,verdict,pass,runnerProbes}.ts`), the five store
managers' sign-in/clear/latch sites, the sidecar boot wiring (`bootstrap.ts`), the renderer
consumers (`LibrarySignInNotice`, `Library/index.tsx`, `signInTileState.ts`, `loginOpenParam.ts`,
`GlobalState.tsx`, `signInInputs.ts`, `electronStores.ts`), `storePolicy.ts`'s allow-list
widening, and `launcher.ts`'s `callRunner` (read for its command-dedup behavior, which several
findings below depend on). The 49 locale catalogues were not read file-by-file; they are
mechanical, generated content gated by `pnpm lint-translations:gamelib` and the hardcoded-string
gate, which is the appropriate verification surface for that content, not a line-by-line manual
read. Test files are read where needed to understand behavior, but per review policy are not
separately flagged unless they affect test reliability — none found here.

**Focus-area disposition.** The task asked me to verify three live-gate findings (already filed
as `ready: code` todos) against source, and to reference — not duplicate — the existing todo
files. All three are confirmed below as WR-01, WR-02, WR-03. In each case I traced the mechanism
further than the live-gate record did, because the live-gate's own hypothesis (stdout/stderr
interleaving, for the nile case) does not match what the code actually does; the real mechanism
is more specific and points at a different fix than the todo currently suggests. That correction
is called out explicitly in WR-01 so it isn't lost.

## Summary

The core selector logic (`signInState.ts`, `signInDismissal.ts`, `librarySignInRows.ts`,
`verdict.ts`'s `decide()`) is small, pure, well-documented, and — on direct reading — correct for
every branch I traced, including the documented ordering rationale (expiry flag outranks
`loggedIn: false` because legendary deletes `user.json` on the same verdict that latches the
flag). The epoch-fencing (`sessionEpoch.ts` + `isSignInEpochCurrent`) correctly guards
`applySignInVerdict` against a probe that started before a sign-in/sign-out completed. The
sidecar boot-ordering (handler registration → `READY_SENTINEL` write → probe pass start →
`deliverStartupProtocolUrl()`) matches the spec's "READY first" constraint exactly.

The issues found are concentrated exactly where the live-gate's own finding said they would be:
in how a correct backend verdict reaches the renderer, and in one runner-specific probe-command
collision. All four findings below are WARNING severity — none is a security vulnerability or a
crash; all four are either a user-visible staleness/non-determinism defect or a defensive-coding
gap that fails closed today but shouldn't be relied on to keep doing so.

## Warnings

### WR-01: nile sign-in probe's "flip" is a runner-command dedup collision, not stdout/stderr ordering (F-49-R1-5)

**File:** `src/backend/storeManagers/nile/library.ts:173-197` (esp. 179-182),
`src/backend/signInProbe/runnerProbes.ts:78-100`, `src/backend/launcher.ts:1727-1731`

**Issue:** `probeNileSession()` (`runnerProbes.ts`) and `NileLibraryManager.listUpdateableGames()`
(`nile/library.ts:179-182`) both issue the **identical** runner command —
`['list-updates', '--json']` — through `runRunnerCommand` → `callRunner`. `callRunner`
deduplicates in-flight commands by `const key = [runner.name, commandParts].join(' ')`
(`launcher.ts:1727`), which does **not** include `abortId` or any other option. When the two
calls race (which they will: `listUpdateableGames()` is reached via
`checkGameUpdates`/`checkForUpdatesOnStartup`, which runs around the same boot window as the
sign-in probe pass started right after `READY`), the second caller to reach line 1730
(`if (key in commandsRunning) return currentPromise`) gets back the **same settled `ExecResult`**
but its own `onOutput` callback is never invoked — the only two places `options.onOutput` is read
are at `launcher.ts:1755` and `:1770`, both unreachable once the early return at line 1731 has
already fired for that caller. Whichever of the two calls is the "loser" therefore has
`capture.observed() === false`, and `classifyNileOutput` (`classify.ts:181-183`) returns
`'unknown'` purely because of this race — not because of anything about stdout/stderr interleave
order within one call's own captured text. The live-gate's own hypothesis ("the classifier
appears to decide on the first chunk seen") describes a symptom, not the cause: `classifyNileOutput`
operates on the single joined capture string and uses `matchAll` on a `g`-flag regex, which does
not retain state across calls, so within one *observed* capture the result is already
order-independent.

This matters for the fix: the todo
(`2026-10-10-nile-classifier-flips-on-stdout-stderr-interleaving.md`) proposes "make the nile
classification order-independent and pin it with a test that feeds both orders" — that test will
pass today (the classifier already is order-independent over one capture) and will not touch the
actual defect, which is upstream of the classifier, in the command-dedup collision between two
unrelated callers.

**Fix:** Give the sign-in probe's nile command a cache-busting or otherwise non-colliding
identity so it can never join `listUpdateableGames()`'s in-flight command — e.g. pass a distinct
dummy argument, or (better) widen `callRunner`'s dedup key to include `abortId` so two logically
different callers of the same command are never joined:
```ts
// launcher.ts
const key = [runner.name, options?.abortId ?? '', commandParts].join(' ')
```
Either change should be paired with a regression test that starts both calls concurrently and
asserts both callers' `onOutput` fires (today only one will).

### WR-02: Amazon sign-in probe reports `healthy` with zero installed games, independent of credential state (A4 / F-49-R1-4)

**File:** `src/backend/signInProbe/classify.ts:181-205` (the `classifyNileOutput` fallthrough at
line 205), `src/backend/signInProbe/runnerProbes.ts:78-100`

**Issue:** Confirmed by direct read of `classifyNileOutput`: when `nile list-updates --json` is
run against an account with `installed.json = []`, nile prints `[]` on stdout and
`ERROR [CLI]: No games installed` on stderr and exits 0 without ever attempting a token refresh.
None of the three guard conditions in the classifier match this text —
`NILE_REFRESH_RESPONSE_PATTERN` (needs `<Response [NNN]>`), `NILE_REFRESH_FAILURE_MARKER`
(needs the refresh-failure line), or `input.errored` (exit code is 0) — so control falls through
to the unconditional `return 'healthy'` at line 205. A user with no installed Amazon game whose
refresh token is actually dead is reported `healthy`, and per `signInState.ts`'s branch-3 rule
that outcome maps straight to `'connected'` — the row never shows. This is exactly the behavior
the already-filed todo
(`2026-10-10-amazon-probe-is-a-no-op-with-nothing-installed.md`) describes, confirmed against the
current source rather than just the live-gate transcript.

**Fix:** As the todo already suggests, either probe with a command that always reaches auth
regardless of library size (`nile library sync`, which the app runs at boot anyway and does
exercise the token per the live-gate's own observed `Successfully synced` line), or special-case
the "no games installed, no refresh attempted" shape in the classifier and return `'unknown'`
rather than falling through to `'healthy'`:
```ts
if (input.output.includes('No games installed') && !input.errored) {
  return 'unknown' // no refresh was attempted; this is not evidence of health
}
```

### WR-03: A cleared verdict for a non-Humble store is invisible to the renderer until the whole probe pass finishes (F-49-R1-2)

**File:** `src/backend/signInProbe/verdict.ts:85-127` (`decide()`'s `'cleared'`/`'latched'`
branches), `src/backend/signInProbe/pass.ts:203-241` (`runSignInProbePass`)

**Issue:** `applySignInVerdict`/`decide()` writes the persisted flag (`flag.clear()` /
`flag.latch()`) synchronously, but only pushes an immediate frontend notification for
`store === 'humble'` (`pushHumbleAuthState`, lines 113-116 and 123-126 of `verdict.ts`). For
legendary/gog/nile/steam, the only way the renderer learns a flag changed is the single
`publishSignInProbeOutcomes()` call at `pass.ts:237`, which fires **once, after the entire
`Promise.all` over every logged-in store has settled** (`pass.ts:203-235`). Each store's own
probe is independently bounded at `SIGN_IN_PROBE_BOUND_MS` (45 000 ms), but the pass as a whole
waits for the slowest store before publishing anything — so a store that clears in the first
second of the pass still waits behind, e.g., a Steam probe that rides its full 45 s bound (a slow
or ignored Keychain prompt) before the renderer hears about either one. `runSignInProbePass` can
also be re-triggered mid-session (`startSignInProbePass`'s connectivity-edge listener,
`pass.ts:299-305`, plus `requestSignInProbePass`'s single-flight re-run), so this is not only a
boot-time delay: the `[signInProbe] steam verdict=cleared` log line the live-gate observed in
launch 9, well into the session, is consistent with exactly this — a re-run pass that cleared
Steam's flag but had not yet published because another store in that same `Promise.all` was still
running. `LibrarySignInNotice` itself is implemented correctly for this (it re-derives from
context on every render, per its own header comment, and `collectSignInInputs` re-reads the
persisted flag fresh every call) — the gap is entirely upstream, in when the renderer is told to
re-render at all. Navigating away and back forces a fresh mount/render, which is why that
"fixed" it in the live gate without the underlying publish timing changing.

**Fix:** Publish (or otherwise notify) per-store as each store's `decide()` call resolves, instead
of batching the single `publishSignInProbeOutcomes()` call behind the full `Promise.all`:
```ts
// inside the stores.map(async (store) => { ... }) callback in pass.ts, after recordSignInProbeOutcome
recordSignInProbeOutcome(store, outcome)
publishSignInProbeOutcomes() // publish this store's update immediately, not at the end
return `${store}:${outcome}`
```
`publishSignInProbeOutcomes()` already just serializes the whole current map, so calling it once
per store is cheap and makes the push latency bounded by that one store's own probe time instead
of the slowest store in the pass.

### WR-04: `authTrigger.ts`'s origin lookup is a plain-object bracket access on untrusted input, unlike every other untrusted-key lookup this phase added

**File:** `src/backend/storeManagers/steam/authTrigger.ts:69-76` (`ORIGIN_TO_TRIGGER`),
`:138-143` (`mapRefreshOriginToTrigger`)

**Issue:** `mapRefreshOriginToTrigger(origin)` returns `ORIGIN_TO_TRIGGER[origin] ?? 'startup'`,
where `ORIGIN_TO_TRIGGER` is a plain object literal and `origin` is renderer-supplied (reached via
a `refreshLibrary` dispatch's `origin` field, per the module's own doc comment on
`noteRefreshTrigger`). A plain-object bracket lookup resolves inherited keys:
`ORIGIN_TO_TRIGGER['__proto__']` returns `Object.prototype`, `ORIGIN_TO_TRIGGER['constructor']`
returns `Object`'s constructor function, `ORIGIN_TO_TRIGGER['toString']` returns a function —
none of these is `undefined`, so the `?? 'startup'` fallback never fires for them, and the
function returns a non-string value typed as `SteamAuthTrigger`. `noteSteamAuthTrigger` then
unconditionally runs `lastTrigger = trigger` (line 92, before the `DELIBERATE_TRIGGERS.has()`
check), so `currentTriggerLabel()` — declared to return `string` and documented as "never a token
value; this is a log label only" — can return an object/function for the rest of the process's
life (it is only ever reset by `resetSteamAuthTrigger()` on logout), and that value gets
interpolated into `keyring_get` log lines. This does **not** escalate privilege: `DELIBERATE_
TRIGGERS` is a `Set` of specific strings, so `.has(Object.prototype)` is `false` and the gate
correctly stays locked. But it is a real, confirmable gap in a module whose own comments show the
author was alert to exactly this class of bug — `signInState.ts`'s `parseSignInStore` (used for
the same "untrusted store id" purpose, cited there as T-49-01: "no `in` operator and no
object-key lookup, so `__proto__` and `constructor` cannot pass") and
`sanitizeSignInProbeOutcomeMap`'s `Object.prototype.hasOwnProperty.call` guard both defend against
this in the same phase, but `authTrigger.ts`'s allow-list lookup, added by the same phase's
reversal (D-14), does not.

**Fix:** Guard the lookup the same way the sibling modules do:
```ts
export function mapRefreshOriginToTrigger(
  origin?: string | null
): SteamAuthTrigger {
  if (!origin) return 'startup'
  if (!Object.prototype.hasOwnProperty.call(ORIGIN_TO_TRIGGER, origin)) {
    return 'startup'
  }
  return ORIGIN_TO_TRIGGER[origin]
}
```
or declare `ORIGIN_TO_TRIGGER` with `Object.create(null)` as its prototype.

---

_Reviewed: 2026-10-09T22:41:57Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
