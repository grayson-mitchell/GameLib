# 260907-seq Summary: Close the importGame wineprefix/wineVersion todo

## What was done

Closed pending todo `2026-08-24-importgame-wineprefix-wineversion-not-contained-by-34-6-11.md` as
an accepted-residual RE-DISPOSITION (NO GATE AT `importGame`), and repaired the two records that
closing it falsified:

1. **`src/backend/sidecar/installFlowRegistration.ts`** — rewrote the `T-34.5-C6-49-03` comment's
   `Note:` sentence (immediately above `ipcMain.handle('importGame', ...)`, previously lines
   418-422) to state that `winePrefix`/`wineVersion.bin`/`.wineserver` ARE renderer-supplied
   filesystem paths consumed at launch (citing `launcher.ts:1115`/`:1134`/`:1136`/`:1142`/`:1510`/
   `:1576`, `utils.ts:919`), that `wineCrossoverBottle` is a bottle NAME not a path
   (`launcher.ts:820`), and that the absence of a gate here is now a deliberate, re-dispositioned
   accepted residual per F3 (the identical setting is reachable unchecked via
   `settingsFlowRegistration.ts:160`/`:195`). Also extended the file-header `importGame` bullet
   (previously lines 75-76) with a clause pointing at the same closed-todo path so the header does
   not lag the block it summarizes.
2. **`src/backend/sidecar/rendererPathGuard.ts`** — replaced the module-docstring forward
   reference that named this todo as `assertContainedPath`'s future consumer with an honest
   statement that it has no named future consumer (containing the exact phrase `no named future
   consumer`), while retaining the surrounding retention rationale (ZERO production call sites,
   the `startsWith` anti-pattern warning, the `depot.ts` mirror) unchanged in substance.
3. **The todo** — moved with `git mv` from `.planning/todos/pending/` to
   `.planning/todos/completed/`, filename unchanged. Frontmatter: `status: RESOLVED`,
   `resolved: 2026-09-07`, `resolved_by: quick 260907-seq` added; `created`, `title`, `area`,
   `severity`, `resolves_phase`, `planned_as`, `files` left untouched. Appended a `## Resolution`
   section (body preserved, not rewritten) recording: the verdict (re-disposition, not discharge),
   the F3 rationale with line citations, this todo's own `wineCrossoverBottle` premise defect
   (F2), what was true all along about `winePrefix`/`wineVersion` (F1) and what it cost, the two
   collateral records repaired, and the stale `planned_as: 34.6-14` field.

All three tasks landed in a single commit, staged with explicit pathspecs.

**Commit:** `19b2db3e9` — `docs(quick-260907-seq): close importGame wineprefix/wineVersion todo as accepted residual`

## Deviation from the plan (self-corrected before commit)

While drafting Task 2's replacement docstring paragraph, I initially cited the completed-todo's
full file path (`.planning/todos/completed/2026-08-24-importgame-wineprefix-wineversion-not-contained-by-34-6-11.md`)
inline, per the action text's "cite the completed-todo path, **or** the closed disposition" phrasing.
Running Task 2's verify block (a) — `grep -c '2026-08-24-importgame' src/backend/sidecar/rendererPathGuard.ts`,
expected 0 per the `<done>` criteria — caught that this citation itself contains the string
`2026-08-24-importgame`, tripping the check the plan requires to be 0 (Rule 1: auto-fixed before
proceeding). I re-read the action text's "or" as requiring the non-path-citing branch given the
verify block's explicit expectation, and rewrote the paragraph to describe the closed disposition
by reference ("the closed re-disposition record in the completed todos directory") without
reproducing the todo's date-stamped filename. Re-ran (a): both greps returned 0. This is the only
deviation from a literal first reading of the plan; it was resolved using the plan's own verify
block as the tiebreak, not a new decision outside the plan's stated criteria.

## Pre-verified null finding (Task 2) — NOT work performed

Per the plan's explicit instruction, `rendererPathGuard.test.ts`'s own header grep
(`grep -c '2026-08-24-importgame' src/backend/sidecar/__tests__/rendererPathGuard.test.ts`) was a
**pre-verified null finding measured at 0 during planning**. I re-ran it during this execution
(also 0) purely to confirm the baseline claim before relying on "the test file needs no edit" —
that re-run proves nothing new and is not counted as work performed. The test file was not
touched; `git diff --name-only -- src/backend/sidecar/__tests__/rendererPathGuard.test.ts` printed
nothing, confirming it.

## Measured before/after per HEAD-baselined verification

All baselines below were captured against HEAD `c8d1170d8` (this plan's stated baseline) either by
the plan's own text or by re-measurement at the start of execution; "after" is measured against
the final commit `19b2db3e9`.

| Check | Baseline (HEAD `c8d1170d8`) | After (`19b2db3e9`) |
|---|---|---|
| `installFlowRegistration.ts`: `'never a filesystem path'` (de-wrapped) | present (the false claim) | **0** — removed |
| `installFlowRegistration.ts`: `PROTONPATH` / `wineserver` / `launcher.ts:1115` / `bottle_name` (de-wrapped) | 0 each (plan's stated measurement — any hit is new text) | **1 each** — present |
| `installFlowRegistration.ts`: `todos/pending/2026-08-24-importgame-wineprefix` | present (1) | **0** |
| `installFlowRegistration.ts`: `todos/completed/2026-08-24-importgame-wineprefix` | 0 | **2** (registration comment + header bullet) |
| `installFlowRegistration.ts` diff: non-comment line count (`git diff -U0` filtered) | n/a (no diff yet) | **0** — comment-only, confirmed |
| `installFlows.test.ts` suite | HEAD baseline: 1 suite / 23 tests passed | **1 suite / 23 tests passed** — unchanged |
| `rendererPathGuard.ts`: `2026-08-24-importgame` / `todos/pending` | present (1) / 0 | **0 / 0** (after the deviation fix above; an earlier intermediate draft measured 1/0, corrected) |
| `rendererPathGuard.ts`: `'no named future consumer'` (de-wrapped) | 0 at HEAD (plan-stated) | **1** — present |
| `rendererPathGuard.ts`: `'ZERO production call sites'` / `'startsWith'` (de-wrapped) | present at HEAD (retained rationale, pre-existing) | **1 each** — still present |
| `rendererPathGuard.ts`: `export function assertContainedPath` | present (1) | **1** — unchanged, not deleted |
| `rendererPathGuard.ts`: `allowlist` (TRAP A) | 0 at HEAD | **0** — not introduced |
| `rendererPathGuard.ts` diff: non-comment line count | n/a | **0** — comment-only, confirmed |
| `rendererPathGuard.test.ts` suite | HEAD baseline: 1 suite / 38 tests passed | **1 suite / 38 tests passed** — unchanged; file diff empty |
| Combined suite run (`rendererPathGuard.test.ts` + `installFlows.test.ts`) | 2 suites / 61 tests (38+23) expected per plan | **2 suites / 61 tests passed** |
| `todos/completed/...`: `status: RESOLVED` / `resolved_by: quick 260907-seq` | n/a (file was OPEN, in `pending/`) | **1 / 1** |
| `todos/completed/...`: `## Resolution` / `bottle_name` / `settingsFlowRegistration.ts:160` / `34.6-14` | n/a | **1 / 1 / 1 / 5** |
| `todos/completed/...` line count | original (60 lines) | **111 lines** (>= 85 required) — body appended to, not replaced |
| `git diff c8d1170d8..HEAD --stat -- src/` | n/a | exactly 2 files: `installFlowRegistration.ts` (+26/-10 approx), `rendererPathGuard.ts` (+13/-5 approx) |
| `git diff c8d1170d8..HEAD -- src/` non-comment lines | n/a | **0** |
| `git diff c8d1170d8..HEAD --name-only` contains STATE.md/ROADMAP.md | n/a | **absent** — 4 files only: the two `.ts` files and the todo rename pair |
| `pnpm codecheck` | n/a (comment-only edits) | **exit 0** |
| `npx prettier --check` on both `.ts` files | n/a | **clean, exit 0** |
| `npx eslint` on both `.ts` files | pre-existing warnings (i18next `import-x/no-named-as-default-member`, unrelated to this task) | **0 errors, 12 warnings** — same pre-existing warning class, not "fixed" per plan's prohibition |
| `git show --stat --format= HEAD \| grep -c '.planning/(STATE\|ROADMAP).md'` | n/a | **0** — neither file in this commit |

## Records I believed might need updating but did NOT touch (per prohibitions)

- **`.planning/STATE.md` / `.planning/ROADMAP.md`** — both have pre-existing unrelated
  modifications in the working tree (visible in `git status` at session start) that are not part
  of this task. Per the plan's `<prohibitions>` and this execution's hard prohibitions, neither
  file was read into the commit, edited, or staged. They remain exactly as the orchestrator left
  them; the orchestrator owns any update reflecting this quick task's completion.
- **`34.6-11-SUMMARY.md`** — the file-header bullet in `installFlowRegistration.ts` still cites
  this as the source of the original residual (c). The plan's Task 1 instructions said only to
  "extend it by one clause," not to edit or supersede the SUMMARY itself, so `34.6-11-SUMMARY.md`
  was not touched.
- **`storeWriteHandlers.ts:169`** — cited in the Resolution section as evidence the *raw store*
  route is already blocked for these fields. No task named this file for editing, and it required
  no change (it was cited only as supporting rationale, already correct at HEAD).

## Self-check

- `test -f src/backend/sidecar/installFlowRegistration.ts` → FOUND
- `test -f src/backend/sidecar/rendererPathGuard.ts` → FOUND
- `test -f .planning/todos/completed/2026-08-24-importgame-wineprefix-wineversion-not-contained-by-34-6-11.md` → FOUND
- `test ! -e .planning/todos/pending/2026-08-24-importgame-wineprefix-wineversion-not-contained-by-34-6-11.md` → CONFIRMED GONE
- `git log --oneline --all | grep -q 19b2db3e9` → FOUND

## Self-Check: PASSED
