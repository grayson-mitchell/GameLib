---
quick: 260916-cdb
plan: .planning/quick/260916-cdb-rename-import-game-label-and-demote-it-t/260916-cdb-PLAN.md
worktree: /Users/graysonmitchell/Projects/GameLib-wt/import-rename
branch: wt/import-rename
base_commit: eacb1fbe1
commits:
  - 9b1e52c48 feat(quick-260916-cdb) rename import door label, demote to GameSubMenu
  - 4301221c9 i18n(quick-260916-cdb) fill installFlows.import* across 48 non-English locales
  - 06addb1d9 test(quick-260916-cdb) pin MainButton import-door demotion, close todo, file Trans follow-up
completed: 2026-09-16
---

# Quick 260916-cdb: rename "Import Game" label, demote it from the Game-page primary row into GameSubMenu

## One-liner

Renamed the unlabelled "Import Game" door to "Locate existing installation…", added an
explainer line to `ImportDialog`, demoted the `MainButton` door into `GameSubMenu` for every
non-Steam runner (including `sideload` and `thirdPartyManagedApp`, which never reach
`DownloadDialog`), filled the 3 new `gamelib.json` keys by hand across all 49 catalogs, and pinned
the demotion with a non-vacuity-proven element-graph test.

## Operator decisions honored (locked, not revisited)

1. **Keep** the import feature — no backend/IPC/store-manager code touched.
2. **Demote** the `MainButton` door into `GameSubMenu`, not delete it in favor of the
   `DownloadDialog` hatch — `sideload` and `thirdPartyManagedApp` runners never reach
   `DownloadDialog` (`InstallModal/index.tsx:629`, `:706-761`).
3. All three new keys shipped, including the explainer line.

## Task 1 — rename, demote, repoint 5 call sites

New English keys in `public/locales/en/gamelib.json` under `installFlows`:
- `importDoorLabel`: "Locate existing installation…" (both doors)
- `importConfirmLabel`: "Use this installation" (ImportDialog confirm — deliberately a
  DIFFERENT string from the door label)
- `importExplainer`: the explanatory line, rendered inside `ImportDialog` above the path picker

Five call sites repointed:
- `MainButton.tsx` — the primary-install-row import door **removed entirely**.
- `GameSubMenu/index.tsx` — import door **added**, gated `!isInstalled && !isSteam`, with **no**
  `isThirdPartyManaged` exclusion (D-02).
- `DownloadDialog/index.tsx` — footer hatch relabelled.
- `ImportDialog/index.tsx` — explainer paragraph added between `{children}` and
  `PathSelectionBox`; confirm button relabelled.
- `SideloadDialog/index.tsx` — hint copy's quoted button name relabelled (the `key=`/`i18nKey=`
  bug in the same `<Trans>` block was deliberately left untouched — see Task 3 follow-up todo).

Confirmed exactly **2 production `action: 'import'` sites** remain in `src/frontend`:
`GameSubMenu/index.tsx:429` and `DownloadDialog/index.tsx:310`.

## Task 2 — fill 3 new keys across 48 non-English locales

All 144 strings (3 keys × 48 locales) were **hand-translated**, not machine-filled — matching
each locale's own established vocabulary/formality conventions sampled from
`installFlows.pathRejectedBodyImport` and `steam.install.withOptionsLabel`. Because they are
hand-written, they are **permanent** under `machineFillGamelib.ts`'s never-overwrite rule (that
tool only fills keys it finds empty/absent; it will never touch these).

Ellipsis convention: `sl` and `sv` use a space before `…` (matching their own
`steam.install.withOptionsLabel` precedent); all other 46 locales attach `…` directly.

Insertion was order-preserving (new keys placed at the position their alphabetical sort would
occupy in each locale's existing key order — not a global reflow), and JSON serialization format
(indent/`ensure_ascii`/trailing-newline) was **detected per file, not assumed**, refusing to write
any file until all 48 detected successfully. Verified via `git diff --stat -- public/locales`:
exactly `48 files changed, 144 insertions(+)`, no reflows.

`meta/i18nCatalogPresenceBaseline.json` was **never touched** — `git diff --exit-code` on it is
clean throughout, confirmed repeatedly (T-cdb-02 mitigation).

## Task 3 — element-graph test, todo closure, follow-up todo

**`MainButton.importDemotion.test.tsx`** (new): asserts that for an uninstalled `gog` game, an
uninstalled `sideload` game, and an uninstalled `thirdPartyManagedApp` game, walking every
`<button>` in `MainButton`'s returned element graph and `await`-ing its `onClick` never calls
`openInstallGameModal` with `action: 'import'`, and that the door label (resolved through the
suite's own faithful-catalog `t` mock, not retyped) never appears among the graph's text leaves.

**Non-vacuity proof (real, executed, not assumed):** the deleted `MainButton` import-door block
was temporarily restored (`Edit`, then reverted with a second `Edit` — confirmed
byte-identical to the pre-edit state via `git diff` exit 0 afterward) and the suite re-run:

```
FAIL  MainButton.importDemotion.test.tsx
  ✕ R1: gog, uninstalled ...
  ✕ R2: sideload, uninstalled ...
  ✕ R3: thirdPartyManagedApp, uninstalled ...
Tests: 3 failed, 3 total
```

All 3 specs failed with `openInstallGameModal` recorded as called with
`{action: 'import', ...}` — proving the assertion is load-bearing, not vacuous. The block was
then removed again and `git diff` on `MainButton.tsx` confirmed a clean (empty) diff before
committing.

**Pre-existing sibling test fixed (in-scope, Rule 1):**
`MainButton.steamSplitButton.test.tsx`'s `S9` asserted "the Import button is ... still present for
gog" — true before this quick, false after it (the door is now demoted for every runner, not just
Steam). Updated the assertion to expect zero import buttons for both `steam` and `gog`. This is
squarely in-scope: it is a test made false by this quick's own operator-directed change, and the
plan's own `<done>` criterion for Task 3 requires "every `MainButton*` suite is green."

**Todo closure:** `.planning/todos/pending/2026-08-29-import-game-is-unlabelled-and-over-promoted-rename-demote-an.md`
received a `## Resolution` section (operator decision, 3 keys, 5 call sites, both Related todos
left explicitly **OPEN**, and the deliberate `gamepage.json` orphan noted), then was moved to
`.planning/todos/completed/` with a **plain `mv`** (never `git mv` — which would have staged the
stale HEAD content and silently dropped the Resolution section just written). Verified the
**staged** blob, not the worktree, via `git show :<newpath> | grep -c Resolution` → `1`, both
before and after the commit (`git show HEAD:<path> | grep -c Resolution` → `1`).

**Follow-up todo filed:** `.planning/todos/pending/2026-09-16-sideload-import-hint-trans-uses-key-not-i18nkey.md`
— `SideloadDialog/index.tsx:376`'s `<Trans key="...">` should be `i18nKey="..."`; the trap
documented is that all 47 translated copies of that key still quote the OLD "Import Game" label,
so fixing the prop alone would ship 47 locales pointing at a button name that no longer exists.
Frontmatter carries `severity: minor`, `platform: any`, `ready: code` in that exact order, plus
`found_by: "quick-260916-cdb"`.

## Gates actually run, with real output (not assumed)

| Gate | Command | Result |
|---|---|---|
| Task 2 python fill verification | (scratchpad script) | OK 49/49 × 3 — all catalogs non-empty for all 3 keys |
| R13 zero-drift (isolated) | `npx jest --testPathPattern "meta/__tests__/lintTranslations.test.ts" -t "R13" --passWithNoTests` | **RED**, 624 findings — see "Known red, out of scope" below |
| Catalog parity | `npx jest --testPathPattern "gamelibCatalogParity" --passWithNoTests` | **GREEN**, exit 0, 198/198 |
| lint-translations:gamelib | `pnpm lint-translations:gamelib` | **RED**, exit 1, "624 findings, 624 hard failures" — see below |
| Baseline untouched | `git diff --exit-code meta/i18nCatalogPresenceBaseline.json` | exit 0 (clean) |
| Locale diff shape | `git diff --stat -- public/locales \| tail -3` | `48 files changed, 144 insertions(+)` |
| MainButton.importDemotion (standalone) | `npx jest --testPathPattern "MainButton.importDemotion" --passWithNoTests` | GREEN, 3/3, exit 0 |
| Non-vacuity probe | same, with block temporarily restored | **RED**, 3/3 failed, exit 1 (expected — the proof) |
| All MainButton* suites | `npx jest --testPathPattern "MainButton" --passWithNoTests` | GREEN, 6 suites / 50 tests, exit 0 |
| Planning gates | `pnpm planning-gates` | GREEN, 11/11, exit 0 |
| Todo file-existence/grep assertions | (plan's exact Task 3 verify commands) | all `OK` |
| Full lintTranslations suite | `npx jest --testPathPattern "meta/__tests__/lintTranslations.test.ts" --passWithNoTests` | 2 failed / 30 passed — both failures are the same 624-count `winetricksBrowse.*` drift (see below); zero `installFlows.import` mentions in either failure's output (`grep -c` confirmed) |
| Typecheck | `pnpm codecheck` | GREEN, exit 0 |
| Lint | `pnpm lint:src` | GREEN, exit 0, 1123 warnings / 0 errors — none newly introduced in any file this quick touched (confirmed against base commit `eacb1fbe1` byte-for-byte for the two pre-existing `MainButton.tsx` warning lines) |

**`pnpm test:ci` was intentionally NOT run as a gate** — it is documented RED at HEAD for an
unrelated leaked store-embed timer, per this quick's own constraints; targeted `--testPathPattern`
runs were used throughout instead.

## Known red at baseline (pre-existing, NOT caused by this quick)

Both `pnpm lint-translations:gamelib` and the R13 (and its sibling REQ-41-02 "zero hard
failures") tests are RED, each reporting **624 hard failures / missing pairs**. Investigated and
characterized explicitly:

- Every single one of the 624 findings is a `winetricksBrowse.*` key (verified: `grep -oE` over
  the full `lint-translations:gamelib` output and over the full `lintTranslations.test.ts`
  failure output both reduce to the single distinct prefix `winetricksBrowse.`; `grep -c
  "installFlows.import"` against both outputs returns `0`).
- This predates this quick's worktree: `git show eacb1fbe1:public/locales/en/gamelib.json | grep
  -c winetricksBrowse` → `1` (key exists in `en` at the worktree's base commit) vs. `git show
  eacb1fbe1:public/locales/ar/gamelib.json | grep -c winetricksBrowse` → `0` (absent in `ar` at
  that same base commit, before any of this quick's edits). The gap was inherited from concurrent
  Phase 44 (in-app Winetricks browse UI) work already merged into shared history
  (`5fe16754d feat(44-02): add winetricksBrowse copy block to gamelib.json`, etc.) — a second
  session's commits landed in this worktree's base, not this quick's own changes.
- **This quick's own 3 keys (`installFlows.importDoorLabel`, `importConfirmLabel`,
  `importExplainer`) show zero drift** across all 49 catalogs — confirmed by the Task 2 python
  fill-verification script (`OK 49/49 × 3`) and by the `grep -c "installFlows.import"` = `0`
  checks against both red gates' full output.
- `meta/i18nCatalogPresenceBaseline.json` was **not** regenerated to hide this — per T-cdb-02,
  doing so was explicitly forbidden regardless of whose gap it is. The gate stays red, honestly,
  for a defect this quick did not introduce and is not scoped to fix.

## Acknowledged weakness: GameSubMenu reachability evidence

`GameSubMenu`'s half of the demotion (that it now carries the import door, reachable for
`sideload` and `thirdPartyManagedApp` without any `isThirdPartyManaged` exclusion) is **NOT**
covered by a render or element-graph test. `GameSubMenu/index.tsx` cannot be called bare in this
repo's jest setup: it does `import './index.css'` with no `moduleNameMapper` registered for CSS
(unparseable under `testEnvironment: 'node'`), and it holds six `useState` hooks plus effects that
a bare function call cannot satisfy without a full render harness (which this project does not
have — no jsdom / react-test-renderer installed).

Its evidence is instead a **source-shaped census**: reading the actual `GameSubMenu/index.tsx`
source and confirming, by inspection, that the new door block's JSX condition is literally
`{!isInstalled && !isSteam && (`, with no `isThirdPartyManaged` term anywhere in that
conditional, and that `isSteam`/`isInstalled` are the same booleans the file's own
`showSteamSubMenuInstallOptions(...)` sibling call already uses (so their derivation is not novel
or untested elsewhere in the file). This is **weaker** than a render test: it proves the
*condition as written* excludes nothing, but it cannot exercise the component's actual runtime
behavior, its interaction with the six `useState` hooks, or catch a mistake in some other gate
(e.g., an ancestor conditionally unmounting `GameSubMenu` itself for those runners) that a render
test would catch. This weakness is inherent to the repo's current test infrastructure, not a
shortcut taken by this quick — and is explicitly not overclaimed as equivalent to the
`MainButton` suite's proof.

## What could not be verified, and why

- **Live/visual confirmation** that the demoted button actually renders correctly inside
  `GameSubMenu`'s dropdown in a running app was not performed — no live app run was available in
  this worktree-only, no-package-install execution context, and the plan did not request a
  checkpoint for it (Pattern A, fully autonomous, no `checkpoint:*` tasks in this plan).
- **`gamepage.json` untouched in all 49 locales** (a stated success criterion) was not
  independently re-diffed catalog-by-catalog beyond `git status`/`git diff --stat` showing zero
  touched files under `public/locales/*/gamepage.json` for the entirety of this session — no
  command in this quick ever wrote to that filename.

## Success criteria checklist

- [x] Nothing in the primary install row on an uninstalled non-Steam game page opens the import modal
- [x] `GameSubMenu` carries exactly one import door, gated `!isInstalled && !isSteam`, reachable for `sideload` and `thirdPartyManagedApp` runners (source-shaped census, see weakness above)
- [x] Exactly two production `action: 'import'` sites in `src/frontend`
- [x] Both doors read "Locate existing installation…"; the ImportDialog confirm reads a DIFFERENT string ("Use this installation")
- [x] The ImportDialog explains what import does, above the path picker and below `{children}`
- [x] The SideloadDialog hint quotes the new label
- [x] All 3 new keys non-empty in all 49 `gamelib.json` catalogs; baseline file unchanged (R13 stays red, but only for the pre-existing, unrelated `winetricksBrowse.*` gap)
- [x] `gamepage.json` untouched in all 49 locales
- [x] `MainButton.importDemotion.test.tsx` green AND proven non-vacuous by a revert run
- [x] The 2026-08-29 todo is in `completed/` with a staged Resolution section; its two Related todos still in `pending/`
- [x] The `key=` vs `i18nKey=` follow-up todo filed with gate-valid frontmatter
- [x] No backend, IPC or store-manager file modified
- [x] No new npm package installed

## Self-Check

Verified all 8 sampled created/modified files exist on disk (test file, both todo paths at their
final locations, en/ar/zh_Hant `gamelib.json`, `MainButton.tsx`, `GameSubMenu/index.tsx`), all 3
commit hashes (`9b1e52c48`, `4301221c9`, `06addb1d9`) are present in `git log --oneline --all`,
and the old pending todo path is confirmed absent.

## Self-Check: PASSED
