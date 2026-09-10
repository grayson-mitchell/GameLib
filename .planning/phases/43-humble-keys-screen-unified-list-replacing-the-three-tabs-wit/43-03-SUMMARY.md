---
phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit
plan: 03
subsystem: humble-integration
tags: [humble, gog, gog_keyless, redeem, live-probe, adapter, D-43-11]

# Dependency graph
requires:
  - phase: 40
    provides: The embedded store browser machinery (`Window::add_child`, process-wide cookie jar) that candidate B depends on
provides:
  - "A measured, evidence-backed answer to D-43-11: candidate A (reuse the reveal endpoint for gog_keyless) is rejected by the live Humble server, not by client-side schema incompatibility"
  - "SELECTED BRANCH: candidate B (Phase 40 embedded store browser) for plan 43-09's gog_keyless KEY destination"
  - "A documented, out-of-scope defect finding: a rejected reveal still strands the key in REVEALED state"
affects: [43-09]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-PROBE-D-43-11.md
  modified: []

key-decisions:
  - "D-43-11 settled by live measurement: candidate A (reuse POST /humbler/redeemkey) is rejected -- Humble's server returns a well-formed, successfully-parsed success=false denial for the one live gog_keyless entitlement tested, not a schema-parse failure as CONTEXT.md predicted"
  - "SELECTED BRANCH for plan 43-09: candidate B, the Phase 40 embedded store browser -- keeps the operator in-app per their explicit request, and the embed inherits the process-wide Humble session cookie jar"
  - "External-browser fallback retained only as a documented last resort if candidate B hits its hide()-before-modal compositing cost during 43-09's implementation"

requirements-completed: [REQ-43-24]

# Metrics
duration: ~15min active work; ~4h37m wall-clock (includes an operator checkpoint waiting on a live, single-shot Humble session and an in-app Humble re-login)
completed: 2026-09-10
---

# Phase 43 Plan 03: D-43-11 `gog_keyless` in-app redeem probe Summary

**Live measurement rejects candidate A (reuse the reveal endpoint) for `gog_keyless` -- the server returned a definitive `success=false` denial on a well-formed, successfully-parsed response, not a schema failure -- so plan 43-09 will implement candidate B, the Phase 40 embedded store browser.**

## Performance

- **Duration:** ~15 min of executor work; ~4h37m wall-clock end to end (Task 1 commit `af56878bd` at 08:11:59+12:00, Task 3 commit `ca078cdc3` at 12:49:46+12:00), dominated by the Task 2 human-verify checkpoint: a live, single-shot, irreversible Humble reveal that also required an in-app Humble re-login mid-run.
- **Started:** 2026-09-10 (Task 1)
- **Completed:** 2026-09-10T00:49Z (this summary)
- **Tasks:** 3/3 completed
- **Files modified:** 1 (created)

## Accomplishments

- Settled D-43-11 by direct measurement against the operator's one live `gog_keyless`
  entitlement (Racine, `racine_gog`), rather than by inference or re-derivation of the UI-SPEC's
  already-fixed candidate columns.
- Disproved the predicted failure mode: `43-CONTEXT.md` expected `RevealResponseSchema` might
  fail to parse a keyless response. It parsed cleanly. The actual failure is a Humble server
  policy denial (`success=false`), a different kind of failure than the one the phase was
  planned around.
- Selected an unambiguous branch (candidate B) for plan 43-09, with both rejected branches
  (candidate A, external-browser) recorded with reasons, so 43-09 has nothing to guess.
- Surfaced and documented (without fixing, per scope) a real defect: a server-rejected reveal
  still moves the key's cache state to `REVEALED` and writes a `revealedAt` annotation,
  permanently stranding that key inside GameLib even though nothing was granted.

## Task Commits

Each task was committed atomically:

1. **Task 1: Record explicit operator go-ahead** - `af56878bd` (docs)
2. **Task 2: Drive the single reveal and capture log evidence** - human-verify checkpoint, no
   separate commit (evidence folded into Task 3's document)
3. **Task 3: Write the verdict and select the branch** - `ca078cdc3` (docs)

**Plan metadata:** this file's own commit (see below)

_Note: this plan is `type: execute` with no source-code tasks; all task commits are `docs`._

## Files Created/Modified

- `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-PROBE-D-43-11.md` - The full probe record: go-ahead, preconditions, raw log evidence (both the credential-guard abort and the actual rejected POST), VERDICT (`CANDIDATE A REJECTED`), SELECTED BRANCH (`candidate B`), rejected-branch reasons, implementation consequences for 43-09, the observed stranded-key defect, and four residual unknowns.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue, resolved by the operator mid-checkpoint, not by this executor]
Click count was 2, not the plan's target of exactly 1**
- **Found during:** Task 2 (live checkpoint)
- **Issue:** The plan's Task 2 required "click exactly once." The first click (12:19:05) was
  refused before any network call: `pnpm tauri:dev` now defaults to the dev secret vault
  (`GAMELIB_DEV_SECRET_VAULT`), which was empty at that moment, so `HumbleUser.getCredentials()`
  returned undefined and `library.ts`'s guard refused the call. The UI correctly reported
  "nothing was used up." The operator then logged into Humble in-app to populate the vault, and
  the second click (12:24:22) made the one and only POST this probe measures.
- **Resolution:** Recorded both attempts explicitly in the probe document as separate,
  timestamped findings, per the coordinator's instruction that "the abort is itself a finding."
  The invariant this plan actually protects (never fire the irreversible POST more than once)
  was not violated -- only one network call occurred. No source file was touched to resolve
  this; the operator's own in-app login was the fix.
- **Files modified:** none (documentation only)
- **Commit:** `ca078cdc3` (recorded in the probe document)

### Not fixed (explicitly out of scope for this plan)

**2. [Deferred] A server-rejected reveal still strands the key in `REVEALED` state**
- **Found during:** Task 2/3, from the post-sync row state and `humble_revealed.json` contents
  reported by the operator.
- **Issue:** Despite the server's definitive `success=false` denial and no game being granted
  (confirmed absent from the operator's GOG library), the cache moved `racine_gog` from
  `UNREVEALED` to `REVEALED` and wrote a `revealedAt` timestamp. Because `doRevealKey` refuses
  any key not in `UNREVEALED` state, the operator can no longer retry this claim through
  GameLib at all.
- **Why not fixed here:** This plan's only artifact is the probe document; `git status
  --porcelain src/` is required to stay empty by this plan's own acceptance criteria. Fixing
  the underlying cache-write logic is a source change out of this plan's scope.
- **Disposition:** Recorded in the probe document's "Observed defect" section with full
  evidence. Per the coordinator's message, this is being filed separately as a todo, and the
  operator's local cache-state restoration is being handled outside this plan.

No other deviations. Plan executed per `43-03-PLAN.md`'s tasks in order.

## Auth Gates

None. The operator's mid-run Humble re-login (populating the dev secret vault) was a live
precondition fix reported by the operator as part of the Task 2 checkpoint result, not a gate
this executor encountered and had to hand back.

## Known Stubs

None. This plan produces no UI or data-flow code; its only artifact is a decision document.

## Threat Flags

None. This plan introduces no new network endpoints, auth paths, or schema changes -- it
exercises an already-shipped endpoint (`POST /humbler/redeemkey`) exactly once, per the plan's
own T-43-01/T-43-10/T-43-11/T-43-12 threat register, all of which were satisfied:

- **T-43-01 (C5 isolation wall):** independently re-verified. The scoped grep
  (`grep -ciE '(^|[^a-z])key=[A-Za-z0-9]|redeemed_key_val|[A-Z0-9]{5}-[A-Z0-9]{5}'`) against the
  probe document's fenced evidence blocks returned exactly 1 match, confirmed as a false
  positive (`login-windo` substring inside `login-window seam transport`). No key-shaped token
  appears anywhere in the captured evidence.
- **T-43-10 (double-fire):** the in-flight guard's actual concern -- a second concurrent or
  sequential POST -- did not occur. Only one network call was made; the first "attempt" never
  reached the network.
- **T-43-11 (misreading a schema_error as "impossible"):** avoided -- the captured line was
  `rejected_by_server`, not `schema_error`, and this was corroborated by the post-sync row
  state (moved to REVEALED, i.e., the server's response body was accepted as authoritative) and
  the GOG-grant check (no game granted), matching the plan's own mapping table.
- **T-43-12 (absence-of-log-line fallacy):** not applicable -- a log line was captured on both
  attempts.

## Self-Check: PASSED

- FOUND: `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-PROBE-D-43-11.md`
- FOUND: commit `af56878bd` (Task 1)
- FOUND: commit `ca078cdc3` (Task 3)
- Verified: `git status --porcelain src/` is empty (no source file was ever modified in this
  plan).
- Verified: exactly one `^**VERDICT:**` line and one `^**SELECTED BRANCH:**` line in the probe
  document (plan's own `PROBE11_OK` automated check passed).
- Verified: `.planning/STATE.md` and `.planning/ROADMAP.md` were not touched by this executor.
- Verified: plan 43-02's diagnostic files (`src/backend/humble/classify.ts`,
  `src/backend/humble/library.ts`, commit `f385991a6`) were not modified by this plan.
- Verified: no `gsd-sdk` `state.*`/`roadmap.*`/`phase.complete` verb was invoked at any point in
  this execution.
