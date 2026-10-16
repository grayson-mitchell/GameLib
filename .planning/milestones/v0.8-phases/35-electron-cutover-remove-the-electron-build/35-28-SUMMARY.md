---
phase: 35-electron-cutover-remove-the-electron-build
plan: 28
subsystem: records-hygiene
tags: [planning-docs, requirements-tracking, gap-closure, status-table, state-reconciliation]

requires:
  - phase: 35-electron-cutover-remove-the-electron-build (plans 35-20, 35-24, 35-25, 35-26, 35-27)
provides:
  - "A Phase 35 REQUIREMENTS.md status table where every row's status is cited to concrete on-disk evidence"
  - "A reconciled STATE.md completed_plans counter (399, up from an undercounted 396)"
affects: [35-29, 39, "any future phase-35 status read"]

tech-stack:
  added: []
  patterns:
    - "Disk-wins reconciliation: when a plan's own <interfaces> premise disagrees with a dependency's SUMMARY.md, the SUMMARY (primary evidence) wins, and the disagreement is recorded rather than silently resolved"
    - "Live-gate criterion vs. code-level fix distinction carried into status-table prose: a Partial cell explicitly names which live-gate criterion is still unmeasured and which plan owns the re-run"

key-files:
  created: []
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - .planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md

key-decisions:
  - "REQ-35-20 stays Partial (was already correct, left untouched) -- closure depends on a full live-gate re-run with zero FAILs, which is plan 35-29's job, not this plan's"
  - "REQ-35-16 corrected to a three-clause Partial, not Complete, despite this plan's own stale <interfaces> section asserting 35-25 had already discharged it -- disk (35-25-SUMMARY.md's own Task 4 text) wins over the plan's premise"
  - "REQ-35-04 and REQ-35-05 corrected to Partial, not Complete, because 35-20 only fixed the code-level causes of their live-gate criteria (6 and 10) without re-measuring them live"
  - "completed_plans reconciled 396 -> 399 (+3) to recover the undocumented 35-21/35-22/35-23 increment gap, re-derived from each plan's own SUMMARY.md rather than trusted from either the pre- or post-gap figure"
  - "No gsd-sdk state.*/roadmap.*/requirements.* verb was invoked anywhere in this plan -- every edit was hand-applied via a cp snapshot + plain diff, per this project's standing corruption record for those verbs"

requirements-completed: []
# This plan's own frontmatter nominally names REQ-35-20, but this plan does NOT complete it --
# REQ-35-20 stays Partial by explicit instruction (its closure depends on plan 35-29's live-gate
# re-run). No requirement is completed by this records-hygiene plan, so requirements-completed is
# deliberately empty and no `gsd-sdk query requirements.mark-complete` call was made.

metrics:
  duration: "~45min (continuation from a prior session's investigation phase)"
  completed: 2026-08-31
---

# Phase 35 Plan 28: Records hygiene — correct the Phase 35 status column against evidence Summary

**Rewrote all 21 Phase 35 REQUIREMENTS.md status-table cells with evidence citations, corrected `STATE.md`'s `completed_plans` counter to recover an undocumented +3 gap, and recorded one disk-vs-plan-text disagreement this plan's own premise got wrong.**

## Performance

- **Duration:** ~45 min
- **Started:** continuation from a prior session (investigation phase pre-dates this session)
- **Completed:** 2026-08-31T (session date)
- **Tasks:** 2/2 completed
- **Files modified:** 4 (`.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md`)

## Accomplishments

- Corrected 15 of 21 Phase 35 `REQUIREMENTS.md` status-table rows from boilerplate `Planned (2026-08-28 -- minted during...)` to evidence-cited `Complete`/`Partial` cells, leaving the 6 already-correct rows (`REQ-35-02`, `-07`, `-17`, `-18`, `-19`, `-20`) untouched.
- Reconciled `STATE.md`'s `completed_plans` frontmatter field (396 -> 399), recovering three missed increments (`35-21`/`35-22`/`35-23`) that two prior gap-closure plans (`35-24`, `35-27`) had found and explicitly routed here rather than backfilling themselves.
- Identified and recorded a disagreement between this plan's own `<interfaces>` premise (written before `35-20`/`35-25`/`35-26` executed) and the actual disk evidence in `35-25-SUMMARY.md`'s Task 4 section — the plan assumed `REQ-35-16` was already fully discharged; the SUMMARY explicitly deferred that reconciliation to this plan. Disk won.

## Task Commits

Each task committed atomically:

1. **Task 1 (measurement only, no file changes) + Task 2: correct the Phase 35 status table** — `8def8e81b` (docs)
2. **`completed_plans` reconciliation + ROADMAP.md plan-progress update** — `64bc2dc8a` (docs)

**Plan metadata:** this SUMMARY's own commit (below)

_Task 1 (build the 21-row evidence map) produced no file of its own per the plan's own spec — "measurement only" — and its output is folded into this SUMMARY's Evidence Map below rather than committed separately._

## The 21-Row Evidence Map

Re-derived from disk (`35-VERIFICATION.md`'s Requirements Coverage table, each gap-closure plan's own `SUMMARY.md`, and `35-LIVE-GATE.md`'s criteria table) rather than trusted from this plan's own text, which was authored 2026-08-30 before plans `35-20`..`35-27` executed.

| Req | Before | After | Basis |
|---|---|---|---|
| REQ-35-01 | Planned (boilerplate) | **Complete** | `35-13`/`35-15`; `35-VERIFICATION.md` `✓ SATISFIED` |
| REQ-35-02 | Complete (already correct) | unchanged | `35-15`/`35-16` |
| REQ-35-03 | Planned (boilerplate) | **Complete** | `35-05`/`35-16`; `35-VERIFICATION.md` `✓ SATISFIED` |
| REQ-35-04 | Planned (boilerplate) | **Partial** | `35-06` landed the tray/About surface; gate criterion 6 (recent-games for Steam) FAILED at verification; `35-20` fixed the code-level cause (`dispatchSteamLaunch`) but criterion 6 has not been re-measured live — `35-29`'s job |
| REQ-35-05 | Planned (boilerplate) | **Partial** | `35-07` landed OS registration (live-proven, criterion 10's delivery half); `RUNNERS` omitted `steam` so the resolve half FAILED; `35-20` fixed the code-level cause but criterion 10 has not been re-measured live — `35-29`'s job |
| REQ-35-06 | Planned (boilerplate) | **Complete** | `35-08`; `35-VERIFICATION.md` `✓ SATISFIED`; addendum noting `35-27`'s adjacent criterion-16 fix does not change this requirement's own closure |
| REQ-35-07 | Partial (already correct) | unchanged | `35-22`/`35-23` |
| REQ-35-08 | Planned (boilerplate) | **Complete** | `35-03`; `35-VERIFICATION.md` `✓ SATISFIED` |
| REQ-35-09 | Planned (boilerplate) | **Complete** | `35-03`; `35-VERIFICATION.md` `✓ SATISFIED` |
| REQ-35-10 | Planned (boilerplate) | **Complete** | `35-04`, `R-34.5-G1-PKG` half (a); `35-VERIFICATION.md` truth 5, artifact-level |
| REQ-35-11 | Planned (boilerplate) | **Complete** | `35-01`/`35-04`, `R-34.5-G1-PKG` half (b); `35-VERIFICATION.md` truth 6 |
| REQ-35-12 | Planned (boilerplate) | **Complete** | `35-12`; `35-VERIFICATION.md` `✓ SATISFIED` |
| REQ-35-13 | Planned (boilerplate) | **Complete** | `35-14`; `35-VERIFICATION.md` `✓ SATISFIED` |
| REQ-35-14 | Planned (boilerplate) | **Complete** | `35-14`; `35-VERIFICATION.md` truth 11 |
| REQ-35-15 | Planned (boilerplate) | **Complete** | `35-02`; `35-VERIFICATION.md` truth 10 |
| REQ-35-16 | Planned (boilerplate) | **Partial** (3-clause reconciliation, see below) | `35-07` (openDialog, Complete), `35-25` (winetricks, Complete/SCOPED), `35-20`+`35-LIVE-GATE.md` criterion 14 (installed.json UI half, code-fixed/not re-measured) |
| REQ-35-17 | Complete (already correct) | unchanged | `35-26` |
| REQ-35-18 | Complete (already correct) | unchanged | `35-05`/`35-16` |
| REQ-35-19 | Complete (already correct) | unchanged | `35-17` |
| REQ-35-20 | Partial (already correct) | unchanged, **must stay Partial** | `35-20` closed code-level causes only; full live-gate re-run with 0 FAILs is `35-29`'s job |
| REQ-35-21 | Planned (boilerplate) | **Complete** | `35-18`; `35-VERIFICATION.md` `✓ SATISFIED` |

**Before/after `minted during` counts:** whole-file count 44 -> 29 (a decrease of exactly 15, matching the 15 corrected rows); status-table-range (lines 420-446) count 15 -> 0.

**Diff hunk line range:** `git diff .planning/REQUIREMENTS.md` for commit `8def8e81b` produced exactly one hunk, `@@ -420,27 +420,27 @@`, confirming the edit stayed entirely inside the Phase 35 status-table range and touched no body-bullet or footer text.

### REQ-35-16 — the three-clause reconciliation (and the plan-premise disagreement)

This plan's own `<interfaces>` section asserted that `35-25`'s Task 4 "records that the `openDialog` and `installed.json` clauses are ALREADY discharged." **This is wrong, and disk wins over it.** `35-25-SUMMARY.md`'s own Task 4 text says the opposite, verbatim: *"REQ-35-16's checkbox stays `[ ]` (not flipped to complete) — the `openDialog` clause ... and the `installed.json` watcher clause ... are not confirmed complete, and reconciling REQ-35-16's overall status against evidence is plan `35-28`'s (records hygiene) scope, not this plan's."* That sentence is a direct, explicit handoff to this plan, not evidence that the handoff was already fulfilled.

Re-deriving the three clauses from primary evidence:

1. **`openDialog`** — Complete, live-proven. Joined `LONG_RUNNING_CHANNELS` in `35-07`. `35-LIVE-GATE.md` criterion 13: "picker held open 143 seconds ... Verdict: PASS."
2. **`winetricksInstall`** — Complete, but explicitly **SCOPED to the Winetricks consumer only**. `35-25` fixed the mouse-dead Install button (capture on `mousedown` instead of `click`, commit `366e719bb`) and proved it live twice by real mouse click (`vcrun2005`, `vcrun2008`, both confirmed via `gamelib.log`). The shared `SearchBar` primitive itself is **not** certified sound — the Library consumer of the same component is separately, pre-existingly broken by mouse (35-25's own Task 3 regression check for the Library consumer `DID NOT WORK`, dispositioned not-a-regression-from-this-plan, filed as its own unowned todo at commit `6d9584f75`).
3. **`installed.json` watcher** — backend half Complete (ported with its debounce intact). UI half was code-fixed by `35-20` (`sendFrontendMessage('refreshLibrary', 'legendary')` added, commit `b6507de63`) but **not yet live-re-measured** — `35-LIVE-GATE.md` still records criterion 14's UI half as FAIL, and that re-run is `35-29`'s job.

Because clause 3 has not been live-discharged, `REQ-35-16` stays **Partial**, not Complete, contradicting this plan's own stale premise.

## `completed_plans` Reconciliation

`STATE.md`'s frontmatter `completed_plans: 396` did not include the `35-21`/`35-22`/`35-23` increments. This gap was found and documented by plan `35-24` (deferred-items.md Item 4) and re-confirmed still open by plan `35-27`, both of which explicitly declined to backfill it and routed it here.

Re-derived from disk rather than trusted from either 393 or 396:
- `35-21-SUMMARY.md`, `35-22-SUMMARY.md`, `35-23-SUMMARY.md` all exist, each with `completed: 2026-08-30` and `## Self-Check: PASSED`.
- The progress-block comment log's chronology confirms no increment entry exists for any of the three — the entry immediately before the gap is `35-20`'s `391 -> 392`, and the next entry after it is `35-24`'s `392 -> 393` (that entry itself, not any of the three plans that landed in between).

**Arithmetic:** 396 (current) + 3 (the three missing increments) = **399**. `percent = floor(399 / 431 * 100) = floor(92.575...) = 92`.

`total_plans` (431) was left unchanged — this is a recovery of missed increments against the existing denominator, not a recount of the denominator itself. A global `ls .planning/phases/*/*-SUMMARY.md | wc -l` count (584) was considered and rejected as a substitute, because `total_plans`/`completed_plans` are scoped to the current v0.8 milestone (phases 27-35), not the project's entire history including many already-closed older phases.

## Files Created/Modified

- `.planning/REQUIREMENTS.md` — 15 Phase 35 status-table rows corrected from boilerplate to evidence-cited status (commit `8def8e81b`)
- `.planning/STATE.md` — `completed_plans` 396 -> 399, `percent` 91 -> 92, with arithmetic recorded inline in the progress block (commit `64bc2dc8a`)
- `.planning/ROADMAP.md` — `35-28` checkbox flipped `[ ]` -> `[x]` with completion detail; "8/10 gap-closure plans executed on disk" running count corrected to "9/10" (commit `64bc2dc8a`)
- `.planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md` — Item 6 logged (pre-existing `genI18nGateScope` A-17 failure, out of scope, not fixed) (commit `8def8e81b`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — scope-boundary logging, not a fix] `pnpm test --selectProjects Meta` fails one pre-existing, unrelated test**
- **Found during:** Task 2's verification step
- **Issue:** `meta/__tests__/genI18nGateScope.test.ts`'s A-17 anti-rot assertion fails — the committed `meta/i18nForkTouchedFiles.json` pin is missing `src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx`, which `35-25` modified (commit `366e719bb`) after the pin was last regenerated by `35-24`.
- **Fix:** Not fixed — this is out of scope for a plan whose `files_modified` is `.planning/REQUIREMENTS.md` only, and `git status --short` at the time confirmed only that one file was modified when the failure occurred, proving it pre-dates and is independent of this plan's own edit. Logged as deferred-items.md Item 6 instead, per the SCOPE BOUNDARY rule.
- **Files modified:** `.planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md`
- **Commit:** `8def8e81b`

No other deviations. This plan's Task 2 edit and the `completed_plans` reconciliation both matched the plan's own success criteria once re-derived from disk; the only substantive correction was to the plan's own stale `<interfaces>` premise on `REQ-35-16`, documented above rather than silently applied.

## Known Stubs

None — this plan modifies planning documents only, no application code.

## Threat Flags

None — this plan modifies planning documents only (`.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `deferred-items.md`), introducing no new network endpoints, auth paths, file-access patterns, or schema changes at any trust boundary.

## Next Phase Readiness

- `REQ-35-20` remains Partial. Its closure — along with the live-gate re-measurement of criteria 6, 10, 14, and 16, plus criterion 21 with a seeded non-primary Epic domain — is entirely plan `35-29`'s scope, not touched here.
- `pnpm test --selectProjects Meta`'s one pre-existing failure (`genI18nGateScope` A-17) is unresolved and unowned by this plan; whoever next touches the i18n fork-gate scope (or `35-29`, if convenient) should run `pnpm gen-i18n-gate-scope` and verify the resulting diff is limited to adding `WinetricksSearch/index.tsx`.
- No further `completed_plans`/`percent` reconciliation is owed as of this plan's landing — the arithmetic above is the full recovery of the known gap.

## Self-Check: PASSED

- FOUND: `.planning/phases/35-electron-cutover-remove-the-electron-build/35-28-SUMMARY.md`
- FOUND: `.planning/REQUIREMENTS.md`
- FOUND: `.planning/STATE.md`
- FOUND: `.planning/ROADMAP.md`
- FOUND: `.planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md`
- FOUND commit `8def8e81b` (REQUIREMENTS.md status-table correction + deferred-items.md Item 6)
- FOUND commit `64bc2dc8a` (STATE.md completed_plans reconciliation + ROADMAP.md update)
