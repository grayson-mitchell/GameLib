---
phase: 37-steam-defect-cluster-depot-decode-failure-false-delisted-gam
plan: 02
subsystem: steam
tags: [depot-download, error-classification, i18n, ipc, jest, tdd]

# Dependency graph
requires:
  - phase: 37-04
    provides: "prior depot-download error-classification surface this plan re-branches"
  - phase: 37-10
    provides: "resolveContainedPath / resolveSteamInstallTarget / UnsafeInstalldirError — confirmed no line-level conflict with this plan's depot.ts/games.ts edits"
provides:
  - "classifyDepotError branching on the failure's preserved cause object (not its stringified message) — a decode-stage ChunkDecodeError and a no-authenticated-CM auth abort each get their own branch ahead of the network alternation"
  - "DepotDownloadFailure.cause — the original thrown value threaded alongside the existing flattened `error` string, so `.code`/`.eresult` survive to the classifier (closes the D-08 landmine)"
  - "DepotErrorAction / InstallErrorAction — a structured `action: 'retry' | 'signIn' | 'none'` field carried on every classified error and forwarded through InstallResult/DepotDownloadOutcome, replacing affordance-in-translated-prose (D-06)"
  - "ButtonOptions.action — serializable button discriminator ('steamSignIn') that survives the showDialog structured-clone/JSON IPC hop; DialogHandler maps it to a real navigate('/login') call before rendering (closes the D-07 dead-button landmine)"
affects: [steam-install, steam-download-manager, dialog-handler, i18n-catalog]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Duck-typed cause preservation across a stringify boundary: DepotDownloadFailure keeps both the pre-existing flattened `error: string` (unchanged consumers) and a new optional `cause: unknown` (the original thrown value) so a later classifier can read `.code`/`.eresult` without an instanceof check that wouldn't survive worker_threads serialization anyway"
    - "V2 locale-key split as the sanctioned way to change default copy without touching public/locales/en/translation.json: `.key` stays the old identifier (existing consumers unaffected) while the actual i18next.t() lookup uses a new `*V2` key with no catalog entry, so i18next falls through to the new call-site default instead of the old catalog string being silently reasserted"
    - "Canonical type declared in common/, aliased (not redeclared) in backend/: InstallErrorAction lives in common/types/game_manager.ts; depotErrors.ts's DepotErrorAction is `export type DepotErrorAction = InstallErrorAction` so the two unions can never drift apart (backend/ may import from common/, not the reverse)"
    - "IPC-unsafe fields (function values) never cross sendFrontendMessage: backend composes a serializable action discriminator on ButtonOptions instead of an onClick closure; the renderer-side DialogHandler owns the discriminator-to-handler mapping, with a `const _exhaustive: never = action` guard in its switch's default case so a future unhandled action value is a tsc error, not a silently dropped button"
    - "Branch on cause, not on message shape: classifyDepotError's branch order is now non-retryable (depotBlocked/depotUnavailable) -> auth abort (no authenticated Steam CM connection) -> ENOSPC -> traversal -> SHA1 mismatch -> decode-stage (isDecodeStageError via .code) -> network signature alternation -> generic fallback, so a decode-stage exhaustion no longer inherits the network branch's copy just because it shares fetchChunk's generic retry-wrapper message shape"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/depotErrors.ts
    - src/backend/storeManagers/steam/games.ts
    - src/common/types.ts
    - src/common/types/game_manager.ts
    - src/backend/downloadmanager/utils.ts
    - src/frontend/components/UI/DialogHandler/index.tsx
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - src/backend/downloadmanager/__tests__/utils.test.ts

key-decisions:
  - "Removed the cause-agnostic 'failed after \\d+ attempts' term from the network regex alternation entirely, rather than trying to make it decode-aware — the term matched on the generic exhaustion-wrapper's own wording, which a decode-stage failure shares by construction, so no regex refinement could distinguish them from message text alone; the fix is structural (check isDecodeStageError first), not lexical"
  - "Left connectionDropped's regex alternation matching 'CDN \\d' alone even though this reduces overlap with the removed term for one existing red-herring test case (a message containing both 'failed N attempts' and 'CDN 503') — verified via grep before editing that the CDN-503 fragment alone still satisfies the existing test's expectation, avoiding an unnecessary regex change"
  - "action field is non-optional (`action: DepotErrorAction`, not `action?:`) on ClassifiedDepotError — every branch, including the pre-existing depotBlocked/depotUnavailable/ENOSPC/traversal ones, now explicitly returns action:'none' rather than leaving it undefined, so a consumer can never forget to handle the affordance"
  - "DialogHandler's useEffect dependency array changed from [] to [navigate] because the handler now closes over navigate; confirmed by restoring the original file and diffing eslint output that the resulting react-hooks/exhaustive-deps warning (missing showDialogModal dep) is pre-existing and unrelated to this change, so it was left alone per the scope-boundary rule rather than fixed as a drive-by"
  - "Did not touch public/locales/en/translation.json — confirmed via `git status --short public/locales/` producing no output — new copy is delivered entirely through the *V2 key + call-site-default mechanism per the plan's explicit instruction"

metrics:
  duration: "~1h10m (Tasks 1-3; Task 4 not executed — advisory checkpoint, see below)"
  completed: "2026-08-22"
---

# Phase 37 Plan 02: Depot Error Cause Classification and Structured Affordances Summary

Stops the Steam depot error classifier from telling users "Steam servers dropped the connection" for decode-stage and auth-abort failures that have nothing to do with the network, and replaces the Retry/Sign-in affordance's prior encoding in translated prose with a structured `action` field carried end-to-end from `classifyDepotError` to a real "Sign in to Steam" button that navigates.

## What Was Built

### Task 1 — Preserve the failure cause through to the classifier (D-08)

`DepotDownloadFailure` gained an optional `cause: unknown` field carrying the original thrown value, alongside the pre-existing flattened `error: string`. The per-file failure push and the `classifyDepotError(result.failures[0].cause ?? result.failures[0].error)` call site now thread `cause` through, so the classifier can read `.code`/`.eresult` off the real error object instead of only ever seeing an already-stringified message. No classification outcome changed in this task — it only restores the information the next task branches on. Proven by a two-directional test: `isDecodeStageError` returns `true` when given `.cause` (a real `ChunkDecodeError`-shaped object) and `false` when given only the flattened `.error` string, confirming the fix actually changes what reaches the classifier rather than being inert plumbing.

Commit: `af588d862`

### Task 2 — Branch on cause; add decode-stage and auth branches; structured action field (D-06, D-08)

`classifyDepotError`'s branch order is now: non-retryable errors (`depotBlocked`/`depotUnavailable`, unchanged) → a new auth branch matching "no authenticated Steam CM connection" (`notSignedIn`, `action: 'signIn'`, message carries no "retry" wording) → `ENOSPC` → path traversal → SHA1 mismatch → a new decode-stage branch using `isDecodeStageError(err)` from `depot/decompress.ts` (`decodeFailed`, `action: 'retry'`, message "Downloaded game data could not be unpacked. This is not a network problem.") → the network signature alternation (now `CDN \d|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|no content servers`, with the cause-agnostic `failed after \d+ attempts` term removed) → a generic fallback. `connectionDropped` and `generic` now resolve their user-facing message through new `*V2` locale keys with no catalog entry (`i18next.t()` prefers a catalog hit over the call-site default, so introducing a new key is the only way to change copy without editing `public/locales/en/translation.json`); `.key` itself is unchanged for every existing consumer that pattern-matches on it. `ClassifiedDepotError.action` is a non-optional `DepotErrorAction` (`'retry' | 'signIn' | 'none'`) — every branch, old and new, now explicitly sets it.

Commit: `6e257ef8f`

### Task 3 — Thread the action to the dialog; make Sign in to Steam navigate (D-07)

`InstallErrorAction` is declared canonically in `common/types/game_manager.ts` (shared by `InstallResult.errorAction`); `depotErrors.ts`'s `DepotErrorAction` is a true type alias (`export type DepotErrorAction = InstallErrorAction`) so the two unions cannot drift apart across the common/↔backend/ import boundary. The classified `action` is forwarded untouched from `classifyDepotError` through `depot.ts`'s `DepotDownloadOutcome` and `games.ts` to the `InstallResult` returned to `installmanager`/`downloadmanager`. `ButtonOptions` (in `common/types.ts`) gained a serializable `action?: 'steamSignIn'` discriminator, since a backend-composed button's `onClick` function cannot survive `sendFrontendMessage('showDialog', ...)`'s structured-clone/JSON hop. `downloadmanager/utils.ts` composes a button with `action: 'steamSignIn'` only when `errorAction === 'signIn'`; every other failure dialog gets no `buttons` key at all, byte-identical to before. `DialogHandler` (frontend) now calls `useNavigate()` and maps any incoming button's `action` to a real handler (`'steamSignIn' → () => navigate('/login')`) before calling `showDialogModal`, via a switch with a `const _exhaustive: never = action` guard in its default case so an unhandled future `action` value is a compile error rather than a silently dropped button. The effect's dependency array changed from `[]` to `[navigate]`.

Commit: `1708ada9a`

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean after every task (ts-jest is transpile-only in this repo, so this is the load-bearing type-safety check, not the jest run).
- `npx jest src/backend/storeManagers/steam/__tests__/depot.test.ts` and `src/backend/downloadmanager/__tests__/utils.test.ts` — green after each task, including the new cause-preservation, decode-branch, auth-branch, and structured-action-forwarding tests, and the existing D-UAT-08/connectionDropped/generic regression cases.
- `eslint` — clean; the `DialogHandler` `useEffect` deps warning was confirmed pre-existing (present before this plan's change too) and left untouched per scope-boundary rules.
- `git status --short public/locales/` — no output; no locale catalog file was modified.
- `grep -v '^\s*[*/]' src/backend/storeManagers/steam/depotErrors.ts | grep -c "failed after"` — 0; the term is gone outside comments (raw count is 2, both in comments).
- Full `pnpm test:ci` run (background, ~131s): **315/316 suites green, 6506/6510 tests passed, 3 skipped.** The single failing suite is `meta/__tests__/genI18nGateScope.test.ts`'s pre-existing "A-17 ANTI-ROT" staleness-guard assertion, which was already red on this branch before this plan's work and is unrelated to any file this plan touches (it compares a committed fork-touched-files snapshot against a live git derivation over unrelated frontend files). No regression attributable to Tasks 1–3.

## Deviations from Plan

None — Tasks 1–3 were implemented exactly as specified, including the V2-locale-key mechanism, the `common/`↔`backend/` type-alias direction, and the exhaustiveness-guarded `DialogHandler` switch, all of which were explicit plan instructions rather than deviations.

## Task 4 — Outstanding Advisory Manual Item (NOT executed, NOT self-certified)

Task 4 is `type="checkpoint:human-verify" gate="advisory"`, explicitly recorded in `37-VALIDATION.md` as **Manual-Only row 4, non-blocking**. Per the plan's own acceptance criteria, this task's automated contract is Task 2's `npx jest src/backend/storeManagers/steam/__tests__/depot.test.ts -t classifyDepotError --silent` (confirmed green above) — the live observation below is opportunistic, not a gate this plan's completion depends on.

**This item was NOT executed during this session** and is **not marked PASS**. It requires a live `pnpm tauri:dev` session with either a real native Steam depot-download failure or a deliberate sign-out-and-install-attempt, neither of which occurred in this execution session. Recording per the plan's own acceptable-outcome clause (step 5): **"not observed this session."**

To discharge this item, a human operator (or a future live-session task) should:

1. During any live `pnpm tauri:dev` session already scheduled for this phase (e.g. the 37-03b Dead Island restart), if a native Steam install fails, capture the failure dialog's exact text.
2. Confirm it does NOT read "Steam servers dropped the connection" unless the log for that run actually shows a network signature (`ECONNRESET` / `ETIMEDOUT` / `CDN <status>` / `fetch failed` / `no content servers`).
3. If the failure was decode-stage, confirm the dialog reads "Downloaded game data could not be unpacked. This is not a network problem."
4. To exercise the auth branch deliberately and cheaply: sign out of Steam in the app, click Install on any Steam title, and confirm the dialog says the user is not signed in and shows a "Sign in to Steam" button that navigates to the login screen rather than closing silently.
5. If no install failure occurs and step 4 is not run, "not observed this session" (the outcome recorded here) remains an acceptable final state for this row.

If step 4 is ever run and the "Sign in to Steam" button is found to only close the dialog instead of navigating, that must be recorded as a FAIL and opened as a new gap — not silently patched, since Task 3's automated cases are the contract and a live-only patch would ship untested.

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/depot.ts
- FOUND: src/backend/storeManagers/steam/depotErrors.ts
- FOUND: src/backend/storeManagers/steam/games.ts
- FOUND: src/common/types.ts
- FOUND: src/common/types/game_manager.ts
- FOUND: src/backend/downloadmanager/utils.ts
- FOUND: src/frontend/components/UI/DialogHandler/index.tsx
- FOUND: src/backend/storeManagers/steam/__tests__/depot.test.ts
- FOUND: src/backend/downloadmanager/__tests__/utils.test.ts
- FOUND commit: af588d862
- FOUND commit: 6e257ef8f
- FOUND commit: 1708ada9a
