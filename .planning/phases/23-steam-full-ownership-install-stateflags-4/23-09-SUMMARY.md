---
phase: 23-steam-full-ownership-install-stateflags-4
plan: 09
subsystem: steam
tags: [steam, depot, eresult, i18n, logging, g-23-01, observability]

# Dependency graph
requires:
  - phase: 23-08
    provides: "G-23-02 fixed (fail-closed allModesApplied gate + Mach-O executable fallback) — this plan edits the same depot.ts, read its post-23-08 shape rather than assuming a pre-23-08 layout"
provides:
  - "A dedicated steam.download.error.depotBlocked classification for EResult 40 (Blocked), naming the specific blocked depot id and telling the user the game may still be installable directly through the Steam client"
  - "A failure-site log line (wrapDepotKeyError) naming the depot id, owning appId, and EResult at the moment getDepotDecryptionKey/getRawManifest rejects — not only inside the eventual install-failed message"
  - "The G-23-01 skip-and-warn selection-policy follow-up written down in deferred-items.md, explicitly gated on 23-10 Task 3's official-Steam-client diagnostic verdict"
affects: [23-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Compose depot/app/eresult context OUTSIDE i18next.t (string concatenation after i18next.t resolves the base copy), so the identifying detail survives even where i18next is stubbed/mocked without interpolation support — same pattern the pre-existing depotUnavailable branch already used, now reused for depotBlocked."
    - "Log at the failure site (inside the shared wrapDepotKeyError helper, which both getDepotDecryptionKey and getRawManifest reject paths call) rather than duplicating a logWarning call at each call site."

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/depotErrors.ts
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - public/locales/en/translation.json
    - .planning/phases/23-steam-full-ownership-install-stateflags-4/deferred-items.md
    - .planning/phases/23-steam-full-ownership-install-stateflags-4/23-UAT.md

key-decisions:
  - "Placed the new eresult===40 check INSIDE the existing isNonRetryableDepotError(err) branch (checked first, before the generic depotUnavailable return), rather than as a separate top-level branch — preserves the file's own documented invariant that terminal-EResult classification must run before the connection-dropped pattern, and keeps NON_RETRYABLE_ERESULTS as the single source of truth for what's non-retryable."
  - "Put the failure-site log inside wrapDepotKeyError (shared by both the getDepotDecryptionKey and getRawManifest reject paths in fetchDepotPlanEntry) rather than duplicating a logWarning call at each of the two `new Promise` reject sites — one log line, both call sites covered, per the plan's own suggested alternative."
  - "depotBlocked copy text is intentionally short and generic (\"appears to be blocked for your account or region\") rather than asserting a cause — the diagnostic in 23-10 Task 3 is what determines whether this is a genuine region block or a GameLib over-selection defect, and the user-facing copy should not presume an answer that diagnostic hasn't reached yet."

requirements-completed: [REQ-23-06, REQ-23-07]

# Metrics
duration: ~35min
completed: 2026-08-16
---

# Phase 23 Plan 09: G-23-01 Observability — Blocked Depot Copy + Failure-Site Log Summary

**Closed the observability half of gap G-23-01: EResult 40 (Blocked) depot-key failures now produce a dedicated `steam.download.error.depotBlocked` message naming the blocked depot and a failure-site log line, with zero change to depot selection, retry, or abort behavior.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-16T10:29:15Z
- **Tasks:** 2 (Task 1 TDD, Task 2 docs-only)
- **Files modified:** 6

## Accomplishments

- **Task 1 — dedicated Blocked (EResult 40) copy + failure-site log:**
  - `depotErrors.ts`: `classifyDepotError` now checks `eresult === 40` first inside the existing `isNonRetryableDepotError(err)` branch and returns `key: 'steam.download.error.depotBlocked'`. The message names the specific blocked depot id (via the same `(${text})` composition the existing `depotUnavailable` branch already used) and states the game may still be installable directly through the Steam client. Every other terminal EResult (8, 9, 15, 17, 42, 43) is unaffected and still classifies as `depotUnavailable`. `NON_RETRYABLE_ERESULTS` itself is unchanged — `isNonRetryableDepotError(40)` still returns `true`, so retry/abort behavior is provably unchanged.
  - `depot.ts`: `wrapDepotKeyError` (called by both `fetchDepotPlanEntry` reject paths — `getDepotDecryptionKey` and `getRawManifest`) now emits a `logWarning` at the failure site naming `descriptor.id`, `descriptor.ownerAppId`, and the numeric EResult, before the error propagates. When `eresult === 40`, the log also notes GameLib selected the depot via the package-ownership gate and that owning a depot does not guarantee Steam will issue its key. Never logs the decryption key, manifest GID payload, or any account identifier (T-23-31).
  - `translation.json`: adds `steam.download.error.depotBlocked` as a sibling of `depotUnavailable`, alphabetically ordered between `connectionDropped` and `depotUnavailable`, with the same English text used as the `i18next.t` fallback so the two can never drift.
  - `depot.test.ts`: 3 new tests — 2 confirm the new classification (`depotBlocked` key, depot id present, "installable directly through the Steam client" substring) and the new failure-site log (both depot id `1771304` and owning appId `1771300` present, `eresult=40` present); 1 confirms every other terminal EResult is unaffected. RED-first verified: temporarily reverted both source fixes via targeted Edit (not git), re-ran the 3 new tests, confirmed the 2 new-behavior tests FAILED (the 3rd, a negative no-regression guard, was correctly already-green pre-fix), then restored both fixes and re-ran to confirm all 3 PASS.
- **Task 2 — recorded the gated G-23-01 follow-up:**
  - `deferred-items.md`: new section "Skip-and-warn policy for a Blocked key on a non-essential owned depot (G-23-01) — GATED on the official-Steam-client diagnostic" recording the symptom, why it's out of scope this cycle (user-locked diagnostic-and-observability-only decision), the two branches the 23-10 Task 3 diagnostic decides (genuine region block → close as not-a-bug; official client installs fully → GameLib over-selection defect needing required-vs-optional depot classification + skip-and-warn at selection time), and the explicit gate sentence: do not start this work until 23-10 Task 3 records the diagnostic verdict.
  - `23-UAT.md`: the `G-23-01` YAML entry updated in place with a new `observability_shipped_23_09` field summarizing what shipped, and a new `missing` bullet pointing at the deferred-items follow-up. `status: open` and `severity: unknown` left unchanged, since the diagnostic (not this plan) resolves both. `G-23-02`, the `open_gaps` frontmatter list, and all Gate `Result:` fields untouched (confirmed via `git diff` scoped to the `G-23-01` entry only).

## Task Commits

Task 1 followed a single combined RED-verified commit (not a separate RED/GREEN commit pair) since the plan did not mark this task with an explicit RED-then-GREEN acceptance criterion the way 23-08 did — RED-first was still independently confirmed before committing, per the testing notes' "RED-first" instruction, via a temporary manual revert (see Accomplishments above), not via a separate commit.

1. **Task 1: dedicated Blocked (EResult 40) copy + failure-site log** — `3e6fbe9c4` (feat)
2. **Task 2: record the gated G-23-01 follow-up** — `47ae9dbb8` (docs)

**Plan metadata:** committed as part of this SUMMARY.md commit, per the sequential_execution protocol (write → commit → narrate).

## Files Created/Modified

- `src/backend/storeManagers/steam/depotErrors.ts` — new `eresult === 40` branch inside `classifyDepotError`'s existing `isNonRetryableDepotError(err)` check, returning `steam.download.error.depotBlocked`.
- `src/backend/storeManagers/steam/depot.ts` — `wrapDepotKeyError` now logs a warning naming depot id, owning appId, and EResult at the failure site.
- `src/backend/storeManagers/steam/__tests__/depot.test.ts` — 3 new tests (2 in the `classifyDepotError` describe block, 1 in the `D-UAT-08` describe block mirroring its established mock/assertion style).
- `public/locales/en/translation.json` — new `steam.download.error.depotBlocked` key. **Also carries an unrelated, uncommitted concurrent-session line** (`steam.uninstall.uninstallNotConfirmed`, ~line 774) that was necessarily co-staged and co-committed since it lives in the same file as an uncommitted change at edit time — this was expected per the plan's own warning and was verified byte-identical before and after (`grep -c "uninstallNotConfirmed"` returns `1` both times).
- `.planning/phases/23-steam-full-ownership-install-stateflags-4/deferred-items.md` — new gated G-23-01 follow-up entry.
- `.planning/phases/23-steam-full-ownership-install-stateflags-4/23-UAT.md` — `G-23-01` entry updated in place with the shipped-observability note and a deferred-items pointer.

## Decisions Made

See `key-decisions` in frontmatter. Summarized:
1. New Blocked branch lives inside the existing terminal-EResult check, not as a separate top-level branch, preserving the file's documented ordering invariant.
2. Failure-site log lives in the shared `wrapDepotKeyError` helper (one log line covers both reject paths in `fetchDepotPlanEntry`).
3. `depotBlocked` copy deliberately does not assert a cause (region block vs. over-selection defect) — that's what the 23-10 diagnostic is for.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' `<action>` and `<acceptance_criteria>` were followed directly; no Rule 1/2/3 auto-fixes were needed.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The observability half of G-23-01 is shipped: a Blocked depot key now produces user-facing copy naming the depot and a real next step, plus a diagnosable log line, with zero change to selection or retry behavior. `depot/select.ts` is provably untouched (`git diff` empty) and `NON_RETRYABLE_ERESULTS` is byte-identical to before (`[8, 9, 15, 17, 40, 42, 43]`).
- The open policy question (should a Blocked key on a non-essential owned depot skip-and-warn rather than abort?) remains genuinely open and is now correctly gated in `deferred-items.md` on 23-10 Task 3's human diagnostic run (install KCD2 in the official Steam client, observe whether depot 1771304 downloads).
- Full steam backend suite: 1172/1172 passing (up from 1169 at 23-08, +3 new tests). `tsc --noEmit`: 0 errors. `eslint` on all 4 touched source/test files: 0 errors (126 pre-existing-class warnings unchanged in kind, none new beyond the expected `i18next.t` named-export-caution warning already present on every other `classifyDepotError` branch).
- Grep gates all pass: `depotBlocked` present (2 occurrences in `depotErrors.ts`, 1 in `translation.json`); `NON_RETRYABLE_ERESULTS = new Set([8, 9, 15, 17, 40, 42, 43])` unchanged; `git diff depot/select.ts` empty; `uninstallNotConfirmed` count is `1` (concurrent line preserved).
- `library.ts` and `library.test.ts` (concurrent session's uncommitted work) were never read, modified, or staged by this plan.

---
*Phase: 23-steam-full-ownership-install-stateflags-4*
*Completed: 2026-08-16*

## Self-Check: PASSED

- FOUND: `.planning/phases/23-steam-full-ownership-install-stateflags-4/23-09-SUMMARY.md`
- FOUND: `3e6fbe9c4` (Task 1)
- FOUND: `47ae9dbb8` (Task 2)
- FOUND: `97416c9d9` (this docs commit, prior to this self-check append)
