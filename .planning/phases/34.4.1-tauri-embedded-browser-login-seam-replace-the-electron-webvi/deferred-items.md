# Deferred Items

Out-of-scope discoveries logged here per the executor's scope-boundary rule (only auto-fix
issues directly caused by the current task's changes).

## Plan 15 — `depot.test.ts` full-suite-only flake (2026-07-30)

- **Found during:** Plan 15's `npm run test:ci` verification run.
- **Symptom:** `src/backend/storeManagers/steam/__tests__/depot.test.ts` — test `D-UAT-06: a
  PERSISTENT CM drop during plan-build exhausts the bounded retry and resolves status error
  (classified, actionable message) — never cancelled, never an unhandled throw` failed once in a
  full `npm run test:ci` run (1 failed / 3350 passed / 3351 total).
- **Isolation check performed** (per project memory `flake-baselines-can-be-undiagnosed-bugs` —
  never accept a baseline flake without running the single-file repro first): `npx jest
  src/backend/storeManagers/steam/__tests__/depot.test.ts` in isolation → **106/106 passed**,
  including this exact test.
- **Scope:** `src/backend/storeManagers/steam/depot.ts` and its test file are entirely outside
  this plan's `files_modified` (`src-tauri/src/main.rs`,
  `src/common/types/sidecarTransport.ts`, `src/backend/humble/loginWindowSeam.ts`,
  `src/backend/sidecar/humbleLoginFlowRegistration.ts`,
  `src/backend/sidecar/__tests__/humbleLoginFlows.test.ts`, plus the three out-of-scope
  interface-completeness follow-throughs listed in this plan's SUMMARY). Not fixed here per the
  scope-boundary rule.
- **Disposition:** logged, not fixed. A future session touching `depot.test.ts` or its
  suite-ordering/timing assumptions should re-run this repro before assuming it is unrelated.

## Plan 18 — `seam-parity-sweep.py` category/term tables are stale relative to plans 12/13/15/16 (2026-07-30)

- **Found during:** Plan 18's Task 4 (S-09 closure), regenerating `34.4.1-SEAM-PARITY-SWEEP.md` for
  the first time since Plan 10 wrote the script (the addendum's own instruction — "fix the script,
  never hand-edit"). Getting the regeneration to complete at all required three BLOCKING fixes
  (line-hint refreshes for 6 sites shifted by intervening plans' edits, widening
  `CONFIGSTORE_SET_RE` to also match `storeHumbleSecret(...)` calls since Plan 12's secret-store
  seam replaced the literal `configStore.set('csrfToken', ...)` shape the script was written
  against, and a new `SITE_PROFILES` entry for Plan 17's `library.ts:1202` diagnostic-label
  ternary) — all committed in this plan's Task 4 commit as required, script-only fixes.
- **Two CONTENT-level staleness issues surfaced that are separate from the above (they don't hard-
  stop the script — it completes and produces output — but the output is misleading for
  already-closed findings) and are OUT OF this plan's scope (F-2/F-3/F-4/S-09), left for plan 19
  ("declare/reconcile" per STATE.md's gap-cycle order) to fix in the script itself:**
  1. **F-6 (S-07/S-10) still reports `authCache`/`cache`/`hostResolver`/`storage` as dropped**, even
     though Plan 16 already closed `storage`/`cache` via a SECOND wipeSteps entry
     (`clearHumbleStorage`/`clearEpicStorage`). The script's `categories_for_labels()` mapping table
     (built in Plan 10, before Plan 15/16 added these step labels) does not recognize either label,
     so both fall into an `UNKNOWN:*` bucket that never counts toward closing `storage`/`cache` in
     the dropped-category diff — the regenerated table under-reports Plan 16's real fix.
  2. **F-1 (S-11, `secretStore.ts`) reports SILENTLY-DROPPED**, even though Plan 13 already closed
     F-1 via a real OS-keyring-backed `HumbleSecretStore` implementation (34.4 D-09 struck per
     STATE.md). `secretStore.ts`'s own module doc comment thoroughly describes the keyring seam,
     the sidecar install path, and Plan 13's role, but carries no token matching the script's strict
     `T-\d.../D-\d+` ID pattern — `is_axis_b_declared()`'s alternate-seam-term path requires BOTH an
     id AND a term, so an id-less (however well-written) doc comment cannot pass, per the same
     strict-by-design discipline that correctly keeps F-6's own near-miss (`T-34.4.1-30` present,
     no category term) SILENTLY-DROPPED. Recommend either adding a formal decision id to
     `secretStore.ts`'s header, or having plan 19 decide the classification is out of this script's
     mechanical reach and record it by hand in that plan's own gap-reconciliation document instead.
- **Scope:** neither `categories_for_labels()`'s mapping table nor `secretStore.ts`'s header is
  touched by this plan — both are pre-existing symptoms of plans 12/13/15/16 (already committed, all
  outside this plan's `files_modified`) never having regenerated this sweep. Not fixed here.
- **Disposition:** logged, not fixed. The regenerated `34.4.1-SEAM-PARITY-SWEEP.md` is committed
  as-is (mechanically honest per the script's own current rules) — plan 19 owns reconciling S-07/
  S-10/S-11's disposition text against the fact that F-6 and F-1 are both already closed.

## Plan 19 — `seam-parity-sweep.py`'s S-07/S-10/S-11 staleness re-forwarded, not fixed (2026-07-30)

- **Found during:** Plan 19's own read of this file's Plan 18 entry (above) while writing
  `34.4.1-19-PLAN.md` Task 1's declaration into `34.4.1-PORTED-CHANNELS.md`.
- **Issue, unchanged from Plan 18's own description:** `seam-parity-sweep.py`'s
  `categories_for_labels()` mapping table predates plans 15/16's `clearHumbleStorage`/
  `clearEpicStorage` step labels, so the regenerated `34.4.1-SEAM-PARITY-SWEEP.md` still reports
  S-07/S-10 as SILENTLY-DROPPED for `storage`/`cache` even though plan 16 closed both. Separately,
  `is_axis_b_declared()`'s strict id+term bar (by design) cannot recognize `secretStore.ts`'s
  prose-only module doc comment, so S-11 still reports SILENTLY-DROPPED even though plan 13 closed
  F-1.
- **Why not fixed here, despite plan 18 explicitly routing it to "plan 19":** `34.4.1-19-PLAN.md`'s
  own `files_modified` frontmatter and task list name exactly three files
  (`34.4.1-PORTED-CHANNELS.md`, `REQUIREMENTS.md`, `ROADMAP.md`) — `seam-parity-sweep.py` and
  `34.4.1-SEAM-PARITY-SWEEP.md` are not among them, and this plan's own objective is explicit that
  it must "change nothing whose truth the gate has not yet established" and must not expand scope
  beyond what its own task list declares. `34.4.1-PORTED-CHANNELS.md`'s new gap-cycle section
  records this staleness in prose (so a reader of the declared record is not misled) but does not
  touch the script or the generated sweep document.
- **Scope:** `seam-parity-sweep.py` and `34.4.1-SEAM-PARITY-SWEEP.md` are outside this plan's
  declared files. Not fixed here.
- **Disposition:** logged, re-forwarded. No plan currently owns this — neither plan 19 (this one)
  nor plan 20 (the live-gate re-run, which touches `34.4.1-LIVE-GATE-RERUN.md`,
  `34.4.1-LIVE-GATE.md`, `34.4.1-PORTED-CHANNELS.md` and `IPC-PORT-INVENTORY.md` only) lists this
  file in scope. A future plan should fix `categories_for_labels()` for
  `clearHumbleStorage`/`clearEpicStorage`, decide whether to add a formal decision id to
  `secretStore.ts`'s header or accept S-11's SILENTLY-DROPPED read as a known false-negative of
  the script's strict-by-design matching, and regenerate the sweep document.

## Plan 18 — `helperProcess.test.ts` full-suite-only flake (2026-07-30)

- **Found during:** Plan 18's Task 4 `npm run test:ci` verification run (3386 passed / 3387 total,
  1 failed).
- **Symptom:** `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts` — test
  `HEALTH never answers at all (probe timeout every attempt) -> unreachable, ready:false` failed
  once under full-suite timing pressure.
- **Isolation check performed** (per project memory `flake-baselines-can-be-undiagnosed-bugs`):
  `npx jest src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts` in isolation →
  **9/9 passed**, including this exact (timeout-sensitive) test.
- **Scope:** the Steam bridge helper process and its test file are entirely outside this plan's
  files (`src-tauri/src/main.rs`, `src/backend/humble/user.ts`, `src/backend/humble/adapter.ts`,
  and their tests). Not fixed here per the scope-boundary rule.
- **Disposition:** logged, not fixed.
