---
created: 2026-08-29
title: "The Pause/Cancel button opens the install modal instead of pausing (non-Steam games)"
found_during: phase 35 plan 11, Task 3 live gate (boot auto-resume verification)
severity: high
area: frontend/game-page
---

# The Pause/Cancel button opens the install modal instead of pausing (non-Steam games)

## Symptom

Operator-observed 2026-08-29 while installing **Alan Wake** (non-Steam). Mid-download, the game
page's main button reads **Pause / Cancel** — clicking it **opens the install dialog** instead of
pausing or cancelling the download.

## Diagnosis — a missing guard, and the label/action disagree

`src/frontend/screens/Game/GamePage/components/MainButton.tsx:305`:

```js
onClick={async () => {
  if (!is_installed && !is.queued && gameInfo.runner !== 'steam') {
    openInstallGameModal({ appName, runner, gameInfo, action: 'install' })
    return
  }
  handleInstall(is_installed)
}}
```

The guard tests `!is_installed`, `!is.queued` and `runner !== 'steam'`. It does **not** test
`!is.installing`. During a download of a non-Steam game all three hold, so the early return fires
and `handleInstall` — which contains the pause/cancel path — is never reached.

The same component's `getButtonLabel()` (:222) *does* consult that flag:

```js
if (is.installing) {
  return <span className="buttonWithIcon"><Pause />{t('button.cancel')}</span>
}
```

So the label is computed from `is.installing` and the action ignores it. The button is rendered at
all during install because its wrapper condition is `(!is_installed || is.queued)`.

## Scope — Steam is the ONLY runner that works

Counter-intuitively, `runner !== 'steam'` is what SHIELDS Steam games: it sends them to
`handleInstall`, whose own guard (`GamePage/index.tsx:705`) correctly tests both
`!is_installed && !isInstalling` and falls through to `install({ ..., isInstalling, ... })`.

So: **legendary / gog / nile / sideload are broken; steam is correct.** An initial diagnosis
against the Steam branch at `GamePage/index.tsx:701` was WRONG and is recorded here so it is not
re-derived — that branch guards `!is_installed` without `!isInstalling` too, but it is unreachable
in this scenario and is not what the operator hit.

## Fix

Add `&& !is.installing` to the `MainButton.tsx:305` guard. One line. The deeper point is that a
button computing its LABEL from a status flag its ONCLICK ignores is a defect shape worth grepping
for elsewhere in this component — `is.updating`, `is.repairing` and `is.moving` deserve the same
question.

## Survives the cutover

Shared frontend code. Nothing here is Electron-specific, so this outlives plan 35-14 exactly as the
`moveInstall` rsync defect does. Filed WITHOUT `resolves_phase:` so it cannot be auto-closed by
association with phase 35.

## Resolution (quick 260907-dbh)

**Final fix** — `MainButton.tsx:305`, one conjunct added:

```js
if (
  !is_installed &&
  !is.queued &&
  !is.installing &&
  gameInfo.runner !== 'steam'
) {
```

Steam stays unaffected: it was already excluded by `runner !== 'steam'`, and its install button is
separately disabled while installing via `disabledInstallButtons`'s
`(gameInfo.runner === 'steam' && is.installing)` conjunct (D-07) — so its `onClick` never fires
during a Steam install regardless of this guard.

**Commits:**

- `f638420bb` — `test(260907-dbh)`: new `MainButton.installClickRouting.test.tsx`, RED against
  unmodified `MainButton.tsx`.
- `7993607ec` — `fix(260907-dbh)`: the one-line guard change.

**RED → GREEN evidence.** The test file is byte-identical between both jest runs (`git diff
f638420bb -- src/frontend/screens/Game/GamePage/components/__tests__/MainButton.installClickRouting.test.tsx`
is empty), so the transition below is attributable to the source change alone:

- RED (against `f638420bb`, before `7993607ec`): `Tests: 2 failed, 6 passed, 8 total`. Failing:
  `R1` (direct defect — `handleInstall` was never called, `expect(received).toBe(expected)` /
  `Expected: true, Received: false`) and `R2` (census), whose violation array was exactly
  `["installing"]` — no other flag surfaced a disagreement. `R3`/`R4`/`R5a`/`R5b` already passed at
  HEAD.
- GREEN (after `7993607ec`, same test file): `Tests: 8 passed, 8 total`.
- Note: an earlier RED attempt (before the mock-leak fix below) mis-reported the R2 violation array
  as `["installing", "queued"]`. That was a bug in the test's `probe()` helper — the
  `openInstallGameModal` jest mock is module-level and shared across every `probe()` call inside the
  same `it()`, and R2/R3 call `probe()` once per flag in a loop; without an explicit
  `(openInstallGameModal as jest.Mock).mockClear()` at the top of `probe()`, a call recorded for an
  earlier flag (`installing`, processed first) leaked into every later flag's `opensModal` reading.
  Fixed before the RED commit was made — the committed RED output above is the corrected one — but
  recorded here because it is exactly the "R2 names a flag other than `installing` → stop and report"
  trip-wire the plan called for, and the honest answer is "the test was wrong, not the source."

**Downstream path, re-verified at execution time (both cites unmoved from the plan's citation):**

1. `src/backend/downloadmanager/utils.ts:178-183` still emits
   `sendGameStatusUpdate({ appName, runner, status: 'installing', folder: path })` (the `folder:
   path` line is at `:182`).
2. `src/frontend/helpers/library.ts:50-56` still has `install()` return early on `!installPath`
   (`:50`), then `if (isInstalling) { ...; return handleStopInstallation(...) }` (`:55`).

So the fixed click travels: `onClick` → guard now false (`is.installing` true) → `handleInstall(false)`
→ not queued, not `settingUpBottle`, not steam → `!is_installed && !isInstalling` is false (installing
is true) so `handleModal()` is skipped (`GamePage/index.tsx:705`) → `folder` truthy (populated by the
status update above) → `install({ installPath: folder, isInstalling: true, ... })` →
`handleStopInstallation`. That final hop is read-verified, not runtime-verified — see Limits.

## The audit the todo asked for — MEASURED, not assumed

Census over every key of `GameContextType['is']` (24 flags), probed one at a time against a `gog`
game with `is_installed: false` — the shape `getButtonLabel()`/the install `onClick` actually see.
`R2`/`R3` in `MainButton.installClickRouting.test.tsx` assert this table's two invariants
(no-disagreement, and the exact label-changing partition); this prose restates the per-flag verdict.

| flag | changes label? | button disabled? | click opens modal (if fired)? | verdict |
|---|---|---|---|---|
| `installing` | YES (Pause/cancel) | no | **YES (pre-fix) / no (post-fix)** | **THE DEFECT — fixed** |
| `notInstallable` | YES | YES | — (unreachable) | cleared — unreachable |
| `notSupportedGame` | YES | YES | — (unreachable) | cleared — unreachable |
| `settingUpBottle` | YES | YES | — (unreachable) | cleared — unreachable |
| `queued` | YES (Remove from Queue) | no | no (guard already tests `!is.queued`) | cleared — correct routing (unchanged by this fix) |
| `updating` | no | YES | — (unreachable) | cleared — unreachable, R4-asserted |
| `reparing` | no | YES | — (unreachable) | cleared — unreachable, R4-asserted |
| `moving` | no | YES | — (unreachable) | cleared — unreachable, R4-asserted |
| `playing` | no | YES | — (unreachable) | cleared — unreachable |
| `uninstalling` | no | YES | — (unreachable) | cleared — unreachable |
| `importing` | no | YES | — (unreachable) | cleared — unreachable |
| `installingWinetricksPackages` | no | no | yes | consistent — label and action agree (fresh install) |
| `installingRedist` | no | no | yes | consistent |
| `launching` | no | no | yes | consistent |
| `syncing` | no | no | yes | consistent |
| `linux` | no | no | yes | consistent |
| `linuxNative` | no | no | yes | consistent |
| `mac` | no | no | yes | consistent |
| `macNative` | no | no | yes | consistent |
| `native` | no | no | yes | consistent |
| `notAvailable` | no | no | yes | consistent |
| `sideloaded` | no | no | yes | consistent |
| `win` | no | no | yes | consistent |
| `notPlayableOffline` | no | no | yes | consistent |

In prose:

- The single reachable disagreement was `is.installing` on a non-steam runner — now fixed.
- `notInstallable`, `notSupportedGame` and `settingUpBottle` change the label but sit inside
  `disabledInstallButtons`, so the `onClick` cannot fire in a real UI — **cleared by
  unreachability, and R2 asserts the `disabled` arm rather than trusting it.**
- `queued` changes the label and IS reachable, but the `onClick` guard already tests `!is.queued`
  independently of this fix and routes straight to `handleInstall` — **cleared by correct routing.**
- The todo's three named siblings, `is.updating`, `is.reparing` (upstream's own single-`i`
  misspelling, preserved verbatim) and `is.moving`, appear in **neither** `getButtonLabel()` nor
  `getPlayLabel()` — no disagreement is even expressible — and all three sit inside both
  `disabledPlayButtons` and `disabledInstallButtons` — **cleared, and R4 asserts both halves
  (fresh-install label AND `disabled === true`) for all three.**
- The **play** button was read and found to already agree: `handlePlay`
  (`GamePage/index.tsx:662`) opens with `if (isPlaying || isUpdating) return sendKill(...)`,
  matching the `Stop` label exactly, and every other flag `getPlayLabel()` reads (`syncing`,
  `launching`, `installingRedist`, `installingWinetricksPackages`) sits in `disabledPlayButtons`.
  No test was added for this — it is out of the defect shape (label and action already agree) and
  is recorded here as a read-verified finding, not a measured one.

This census is over the **whole `is` type**, and it is type-enforced: `DEFAULT_IS` in the test file
is annotated `GameContextType['is']`, so a future flag added to that type fails `tsc` until the test
file adds it too — it cannot silently slip past the census. The one way it still could: if someone
widens that annotation away from `GameContextType['is']` (e.g. to `Record<string, boolean>`).

## Limits

The suite proves click **routing** (which handler a click reaches) and the **disabled** attribute
on the element graph — it calls `MainButton` as a plain function and walks the returned React
element object graph (`testEnvironment: 'node'`, no jsdom / react-test-renderer in this project).
It does **not** render, does **not** simulate a real pointer event, and does **not** prove a live
download actually pauses or stops. That last half rests on the two re-verified source cites above
(`downloadmanager/utils.ts` emitting `folder`, `helpers/library.ts` routing `isInstalling` to
`handleStopInstallation`), which are **read evidence, not runtime evidence**. No live UAT was run
for this quick task.
