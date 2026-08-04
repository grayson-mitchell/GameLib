# Deferred Items

Out-of-scope discoveries logged here per the executor's scope-boundary rule (only auto-fix
issues directly caused by the current task's changes).

## Phase scope — Epic pristine login surface deferred by user decision (2026-08-04)

**Disposition: deferred to a follow-up phase, not fixed here.**

Epic is implemented LAST, after all other accounts/runners (Humble/GOG/Amazon) are ported and
proven — a locked user decision, not a planner judgement. See `34.4.2-PLATFORM-SCOPE.md`'s
**EPIC-DEFERRED** section for the full record: the decision text, why (the parked deterministic
pre-auth 403, the zero-injection constraint the pristine surface exists to satisfy, the standing
hCaptcha/UA constraint), the six things consequently not built (one per plan), what stays true for
Epic in the meantime (its login window is byte-unchanged, machine-enforced by
`PHASE_34_4_2_NEW_SYMBOLS`), and what a future Epic phase inherits. Not duplicated here.

## Plan 05 — `helperProcess.test.ts` full-suite-only flake, reproduced again (2026-08-04)

- **Found during:** Task 2's `npm run test:ci` verification run (189 passed / 190 suites, 1
  failed — 3715/3716 tests).
- **Symptom:** `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts` — test
  `HEALTH never answers at all (probe timeout every attempt) -> unreachable, ready:false` exceeded
  its 10000ms Jest timeout under full-suite timing pressure.
- **Isolation check performed** (per project memory `flake-baselines-can-be-undiagnosed-bugs` —
  never accept a baseline flake without running the single-file repro first): `npx jest
  src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts` in isolation →
  **9/9 passed**, including this exact test, in 6.2s.
- **This is the SAME flake already recorded** in
  `34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/deferred-items.md`
  ("Plan 18 — `helperProcess.test.ts` full-suite-only flake"), reproducing again on this phase's
  own verification run.
- **Scope:** the Steam bridge helper process and its test file are entirely outside this plan's
  `files_modified` (`src/backend/__tests__/dummyStoreHarnessContainment.test.ts`,
  `src/backend/sidecar/__tests__/testContainment.test.ts`, `34.4.2-LIVE-GATE.md`,
  `34.4.2-PLATFORM-SCOPE.md`, this file). Not fixed here per the scope-boundary rule.
- **Disposition:** logged, not fixed. A future session touching `helperProcess.test.ts` or its
  suite-ordering/timing assumptions should re-run this repro before assuming it is unrelated.

## Plan 05 — `seam-parity-sweep.py` real-tree run fails on a site outside this phase's diff (2026-08-04)

- **Found during:** Task 2's Electron-unchanged evidence gathering — `34.4.2-PLATFORM-SCOPE.md`'s
  own instruction to run `seam-parity-sweep.py` and record its exact output.
- **Symptom:** the script exits 1 with `GATE FAILED: Axis A site
  src/backend/sidecar/humbleLoginFlowRegistration.ts:449 matched none of the mechanical tiers
  (wipeSteps/configStore/return-snippet/ternary) AND has no SITE_PROFILES entry`. Its own
  `--self-test` harness passes clean (13/13 checks confirmed capable of rejecting bad input),
  so the script's own logic is not in question — its `SITE_PROFILES` table is stale relative to
  a site this phase never touches.
- **This is the SAME class of staleness** already logged and resolved-then-recurring in
  34.4.1's own `deferred-items.md` (Plan 18 → re-forwarded by Plan 19 → finally fixed by Plan 28,
  for a *different* pair of sites: `clearHumbleStorage`/`clearEpicStorage`). The lesson recorded
  there applies unchanged: **"the file was never listed in a plan's `files_modified`"** is why it
  keeps recurring, not a defect in the fix discipline itself.
- **Scope:** `seam-parity-sweep.py` and any generated `34.4.2-SEAM-PARITY-SWEEP.md` are not in
  this plan's `files_modified`. This phase's own `git diff --stat` (scoped to its base commit,
  recorded in `34.4.2-PLATFORM-SCOPE.md` §4) confirms `humbleLoginFlowRegistration.ts` is
  untouched by plans 01-05 — the stale site is pre-existing, not introduced by this phase. Not
  fixed here.
- **Disposition:** logged, not fixed, no owning plan yet. A future plan that DOES declare
  `seam-parity-sweep.py` in its `files_modified` should add a `SITE_PROFILES` entry for
  `humbleLoginFlowRegistration.ts:449` (or classify it as a legitimate mechanical-tier miss) before
  trusting the sweep's completeness again.

## Plan 05 — pre-existing REQUIREMENTS.md checkbox/prose mismatches found, not fixed (2026-08-04)

- **Found during:** Task 2, cross-checking this phase's requirement rows against the artifacts
  that are supposed to close them.
- **Symptom:** two rows in `.planning/REQUIREMENTS.md` are marked `[x]` while their own prose
  states the box should stay UNCHECKED until a later plan's artifact lands:
  - **REQ-34.4.2-06** ("Cmd+V paste continues to work... **Live-only claim — box stays UNCHECKED
    until plan 06's live gate observes it.**") is `[x]` even though plan 06 has not yet run.
  - **REQ-34.4.2-07** ("No credential store is built or read... **Plan 05's containment-guard
    deliverable — box stays UNCHECKED until then.**") was already `[x]` before this plan's own
    Task 1 (the containment guard) had been written.
- **This is the same class of defect** `34.4.1-.../deferred-items.md` recorded as D-29-09
  ("REQUIREMENTS checkboxes were `[x]` while their own riders said 'stays UNCHECKED'"): a claim
  not matched by its artifact. Unlike D-29-09 (found after a gate had FAILED twice), the precondition
  gap here is temporal — the checkbox was set before its own stated precondition plan had run at
  all, most likely a copy/paste of an adjacent already-closed row's `[x]` state during phase
  planning or a subsequent checker-fix commit.
- **Scope:** `.planning/REQUIREMENTS.md` is not in this plan's `files_modified` (`34.4.2-05-PLAN.md`
  frontmatter). This plan's own end-of-execution `requirements mark-complete` step is scoped
  narrowly to avoid compounding the problem: only `REQ-34.4.2-07` is passed (genuinely satisfied by
  this plan's own Task 1), and `REQ-34.4.2-09` is deliberately withheld from that call despite
  appearing in this plan's frontmatter `requirements:` list, because REQ-34.4.2-09's own row text
  is explicit that it is "Plan 06's deliverable — box stays UNCHECKED until then," and this plan
  writes only the gate CONTRACT, not a gate RESULT. REQ-34.4.2-06's pre-existing incorrect `[x]` is
  left as found — fixing it would require editing a row this plan's own scope does not cover, and
  toggling one bit without addressing the underlying "why was this checked early" question would
  not be a real fix.
- **Disposition:** logged, not fixed. A future plan (ideally plan 06, which DOES touch
  `REQUIREMENTS.md` per the phase's own established convention) should correct REQ-34.4.2-06's
  premature `[x]` back to `[ ]` if plan 06's live gate has not yet recorded a PASS for item 4 by the
  time that plan starts, and should investigate how REQ-34.4.2-07 came to be checked before this
  plan (05) had produced any artifact at all.
