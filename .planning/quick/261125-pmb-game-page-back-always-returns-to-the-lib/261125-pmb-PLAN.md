---
phase: quick-261125-pmb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx
  - src/frontend/screens/Game/GamePage/__tests__/gamePageBackButton.test.ts
  - public/locales/en/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
  - src/frontend/components/UI/NavShell/tabLocationMemory.ts
  - .planning/todos/pending/2026-11-24-game-page-opened-from-downloads-has-no-way-back-to-the-library.md
  - .planning/todos/completed/2026-11-24-game-page-opened-from-downloads-has-no-way-back-to-the-library.md
autonomous: true
requirements:
  - "quick:261125-pmb"
  - "todo:2026-11-24-game-page-opened-from-downloads-has-no-way-back-to-the-library"

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 2
  confidence: low
  # estimate-calibration 2026-11-25: factor 1, 0 samples, confidence low. basis: fixed 28k (workflow, summary
  # template, this plan, conventions skill, the todo) + T1 13k (GamePage/index.tsx slices, DownloadManagerItem
  # slice, one new source-gate test, pnpm i18n / churn guard / baseline regen / jest / tsc / eslint output)
  # + T2 4k (one doc comment, the todo move and Resolution, planning-gates output)

must_haves:
  truths:
    - "Per the locked user decision (Always back to Library): a game page opened from the Downloads screen has a Back control that goes to `/library`, exactly as one opened from the Library, the Redeem dialog or a remembered tab does. `/library` is the route the non-Downloads case already used; the `*` catch-all in src/frontend/App.tsx redirects it to `/`, the Library index"
    - "The Back control's tooltip (`title`) and accessible name (`aria-label`) both read \"Back to Library\", from the fork-owned key `gamelib:gamepage.backToLibrary` (default `Back to Library`); the generic `webview.controls.back` / \"Go Back\" no longer labels it"
    - "Opening a game page from Downloads still carries `gameInfo` (and only `gameInfo`) in router state, so GamePage's `location.state` destructure and tabLocationMemory's remember rule keep working; no production file under `src/` reads or writes the Downloads-origin flag any more"
    - "The new key lives only in `public/locales/en/gamelib.json` (extracted by `pnpm i18n`); no upstream catalog changed (`pnpm i18n-churn-guard` clean) and `meta/i18nCatalogPresenceBaseline.json` records it as missing from the 48 non-en locales (`pnpm lint-translations:gamelib` exit 0)"
    - "The Back control stays icon-only on the art band: `className=\"backButton\"`, the `ArrowBackIosNew` icon and its place between `.gameArtBand` and `.mainInfoBody` are unchanged, and `GamePage/index.css` is byte-identical to 5cafbfacc"
    - "tabLocationMemory.ts's ownership comment states the new behaviour truthfully, and the todo sits in `.planning/todos/completed/` with a `## Resolution (2026-11-25)` section"
  artifacts:
    - path: src/frontend/screens/Game/GamePage/__tests__/gamePageBackButton.test.ts
      provides: "Source gate (comment-stripped) pinning the Back route, label, router-state shape and catalog entry"
      contains: "gamelib:gamepage.backToLibrary"
    - path: src/frontend/screens/Game/GamePage/index.tsx
      provides: "Back NavLink to /library labelled Back to Library"
      contains: "to=\"/library\""
    - path: public/locales/en/gamelib.json
      provides: "gamepage.backToLibrary = Back to Library"
      contains: "backToLibrary"
    - path: .planning/todos/completed/2026-11-24-game-page-opened-from-downloads-has-no-way-back-to-the-library.md
      provides: "Closed todo with the resolution note"
      contains: "## Resolution (2026-11-25)"
  key_links:
    - from: src/frontend/screens/Game/GamePage/index.tsx
      to: public/locales/en/gamelib.json
      via: "tGamelib('gamelib:gamepage.backToLibrary', 'Back to Library'), extracted by `pnpm i18n` into the gamelib namespace because of the explicit `gamelib:` prefix"
    - from: src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx
      to: src/frontend/screens/Game/GamePage/index.tsx
      via: "navigate(`/gamepage/${runner}/${appName}`, { state: { gameInfo } }); GamePage destructures location.state.gameInfo"
---

<objective>
The game page's Back control always returns to the Library and says so. Per the locked user decision ("Always back
to Library"): drop the Downloads-origin special case, so Back goes to `/library` whatever screen opened the page, and
Downloads is reached through its app-level tab. The icon-only `‹` keeps its place on the art band, but its tooltip
and accessible name change from the generic "Go Back" to "Back to Library", from a game-page key in the fork-owned
`gamelib` namespace.

Purpose: resolves `.planning/todos/pending/2026-11-24-game-page-opened-from-downloads-has-no-way-back-to-the-library.md`
(87-59 live gate observation). A game page opened from Downloads offered no route to the Library except the tabs.

Output: the GamePage and DownloadManagerItem edits, a new comment-stripped source-gate test, the extracted catalog
key and the regenerated presence baseline (Task 1, one commit). Then the tabLocationMemory doc comment and the todo
moved to completed/ with a Resolution (Task 2, one commit).

Working tree: everything happens in the git worktree `/Users/graysonmitchell/Projects/GameLib-quick-backlib`
(branch `quick/gamepage-back-to-library`, cut from main 5cafbfacc). Every path below is relative to that root and
every command assumes it as cwd. Never read or write under `/Users/graysonmitchell/Projects/GameLib`: main has a large
uncommitted Phase 94 change set staged there.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-11-24-game-page-opened-from-downloads-has-no-way-back-to-the-library.md

Load `Skill("gamelib-conventions")` before writing a `<verify>` result or moving the todo (the formatter rule and
the todo rules apply).

Measured at plan time (2026-11-25, HEAD 5cafbfacc, in this worktree), so the executor does not re-derive it:

- `src/frontend/screens/Game/GamePage/index.tsx`: the `useLocation()` cast is lines 105-107 (its `state` type names
  the Downloads-origin boolean and `gameInfo`); the three hooks are 108-110 (`t` = `gamepage`, `t2` = default
  `translation`, `tGamelib` = `gamelib`); `location.state` is destructured at 113; `backRoute` is defined at 208 and
  used only by the back `NavLink` at 545-552 (`className="backButton"`, `to={backRoute}`,
  `title={t2('webview.controls.back', 'Go Back')}`, child `<ArrowBackIosNew />`). Every existing `tGamelib` call
  in this file carries the explicit namespace prefix, e.g. 640-643 `tGamelib('gamelib:gamepage.tabsAriaLabel', ...)`.
  `t2` is still used elsewhere (line 380), so it stays.
- The Downloads-origin flag is set in exactly one place: `src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx`
  line 142, inside `goToGamePage` (136-144). The other game-page entry points already pass only `gameInfo`
  (`GameCard/index.tsx:471`, `RedeemSteamKeyDialog/index.tsx:110`). A production-wide grep (excluding `__tests__`)
  finds the flag on 4 lines: GamePage 106 and 208, DownloadManagerItem 142, tabLocationMemory.ts 11. No test
  references it.
- `/library` is not a declared route. `src/frontend/App.tsx` maps the index route to `screens/Library` and a `*`
  catch-all to `<Navigate replace to="/" />`; the non-Downloads Back case and Settings' own back link already rely on
  that. Keep `/library` as the target: it is the route the user named, and it already works.
- `.backButton` in `GamePage/index.css` (45-65, art-band overrides 67-73) is a fixed 44x44 grid. Visible text would
  need new layout, so it is not trivial: keep the control icon-only (the user allowed this). Do not edit index.css.
- `webview.controls.back` stays live elsewhere (`StoreEmbedControls/index.tsx:93` and its test), and
  `i18next-parser.config.js` has `keepRemoved: true`, so dropping the GamePage call changes no catalog.
- i18n pipeline: `pnpm i18n` (i18next-parser, `functions: ['t', 'tGamelib']`, sorted, 4-space indent) writes
  `public/locales/en/*.json`; at HEAD it produces zero diff (measured). `pnpm i18n-churn-guard` fails if any non-gamelib
  catalog changed (measured clean at HEAD, 0.2 s). A new `gamelib` en key is missing in the 48 other locales, so
  `meta/i18nCatalogPresenceBaseline.json` (`missing: { key: [locales] }`) must be regenerated with
  `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`. This is the house pattern (13 prior plans;
  e.g. efb1f4229 touched only en/gamelib.json plus the baseline). Do not add translations to other locales.
  `pnpm lint-translations:gamelib` exits 0 at HEAD.
- The hardcoded-string gate (`meta/__tests__/hardcodedStringGate.test.ts`, about 3.5 min) treats `title` and
  `aria-label` as user-facing and `to` as not. A `tGamelib(...)` value satisfies it. It is too slow for a task gate
  and the change cannot trip it, so it is not run here; CI's `test:ci` runs it.
- prettier `--file-info` (measured): `GamePage/index.tsx`, `DownloadManagerItem/index.tsx`, `tabLocationMemory.ts`,
  the new `__tests__/gamePageBackButton.test.ts` and `meta/i18nCatalogPresenceBaseline.json` are all
  `"ignored": false` and carry the check. `public/locales/en/gamelib.json` and everything under `.planning/` are
  `"ignored": true`, so the check would prove nothing over them and is omitted for them. prettier uses
  `trailingComma: none`.
- Test harness to copy: `src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts` (reads source via
  `stripSourceComments` from `backend/testUtils/stripSourceComments`, `join(__dirname, '..', name)`), and for the
  catalog path `src/frontend/screens/Settings/components/__tests__/framelessWindowCopy.test.ts` (six `'..'` up from
  `__tests__`, then `public/locales/en/gamelib.json`). Its L6 test pins `gameArtBand` -> `backButton` ->
  `mainInfoBody` order; keep it green.
- Timings: Frontend jest over 2-3 files about 2 s; `npx tsc --noEmit -p .` about 11 s (exit 0 at HEAD); eslint over the
  touched files about 5 s (0 errors, 20 pre-existing warnings at HEAD, hence `--quiet`); `pnpm planning-gates` about 13 s
  (12/12 at HEAD).
</context>

<tasks>
<!-- planner-discipline-allow: fromDM -->

<task type="tracer" tdd="true">
  <name>Task 1: Back always goes to /library and is labelled "Back to Library" (Downloads entry, router state, GamePage, catalog)</name>
  <files>src/frontend/screens/Game/GamePage/__tests__/gamePageBackButton.test.ts, src/frontend/screens/Game/GamePage/index.tsx, src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx, public/locales/en/gamelib.json, meta/i18nCatalogPresenceBaseline.json</files>
  <read_first>
    - src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts (lines 1-40 for the harness, 120-140 for the L6 order test)
    - src/frontend/screens/Game/GamePage/index.tsx lines 100-115, 200-212, 538-556, 636-645
    - src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx lines 134-146
    - src/frontend/screens/Settings/components/__tests__/framelessWindowCopy.test.ts lines 16-52 (catalog path idiom)
  </read_first>
  <behavior>
    New file `src/frontend/screens/Game/GamePage/__tests__/gamePageBackButton.test.ts`, one `describe` titled
    `quick 261125-pmb: the game page Back control always returns to the Library`, exactly four `it` blocks, every
    source read through `stripSourceComments` so comment prose can neither satisfy nor trip a gate:
    - Test 1: the stripped `GamePage/index.tsx` contains no `fromDM` and no `/download-manager`.
    - Test 2: the back link, sliced from the last `<NavLink` before `className="backButton"` to the next
      `</NavLink>`, contains `to="/library"`, `title={backToLibraryLabel}` and `aria-label={backToLibraryLabel}`, and
      does not contain `webview.controls.back`. The whole stripped file matches
      `/const backToLibraryLabel = tGamelib\(\s*'gamelib:gamepage\.backToLibrary',\s*'Back to Library',?\s*\)/`.
    - Test 3: the stripped `DownloadManagerItem/index.tsx` contains no `fromDM`, and its game-page navigate matches
      `/navigate\(\s*`\/gamepage\/\$\{runner\}\/\$\{appName\}`,\s*\{\s*state:\s*\{\s*gameInfo(?::\s*gameInfo)?\s*\}/`,
      so the state carries `gameInfo` and nothing else.
    - Test 4: `public/locales/en/gamelib.json` parses with `gamepage.backToLibrary === 'Back to Library'`, and the raw
      text of `public/locales/en/gamepage.json` does not contain `backToLibrary` (the key must not land in the
      upstream catalog).
    RED: on HEAD all four fail. GREEN: all four pass after the steps below.
  </behavior>
  <action>
    Step 1 (RED). Write the test file described in behavior, modelled on gamePageActionDock.test.ts (same imports,
    `join(__dirname, '..', 'index.tsx')` for GamePage, `join(__dirname, '..', '..', '..', 'DownloadManager',
    'components', 'DownloadManagerItem', 'index.tsx')` for the Downloads item, and the six-`'..'` catalog path idiom
    from framelessWindowCopy.test.ts for `public/locales/en/gamelib.json` and `public/locales/en/gamepage.json`). Add
    a short head comment naming quick 261125-pmb and the locked decision. Run it: all four tests must fail.

    Step 2 (GamePage, per the locked user decision "Always back to Library"). In
    `src/frontend/screens/Game/GamePage/index.tsx`:
    (a) narrow the `useLocation()` cast (105-107) so `state` is `{ gameInfo: GameInfo }`. Remove the boolean member
    and nothing else; prettier may collapse the cast onto one line, which is fine.
    (b) delete the `backRoute` const (208). Its only consumer is the back NavLink. In its place declare
    `const backToLibraryLabel = tGamelib('gamelib:gamepage.backToLibrary', 'Back to Library')`. The explicit
    `gamelib:` prefix is mandatory. This file runs three `useTranslation` hooks, and every existing `tGamelib` call
    here carries the prefix. Without it `pnpm i18n` writes the key into the upstream `gamepage.json` and the churn
    guard fails.
    (c) on the back `NavLink` (545-552) set `to="/library"` (string attribute), replace the `t2('webview.controls.back',
    'Go Back')` title with `title={backToLibraryLabel}`, and add `aria-label={backToLibraryLabel}`. Keep
    `className="backButton"`, the `<ArrowBackIosNew />` child and the element's position inside `.gameArtBand`. Keep it
    icon-only: `.backButton` is a fixed 44x44 grid, so visible text is not trivial, and index.css stays untouched.
    Leave the `t2` hook in place, because line 380 uses it.

    Step 3 (Downloads entry). In `DownloadManagerItem/index.tsx` `goToGamePage` (136-144), make the navigate state
    exactly `{ gameInfo }`: remove the Downloads-origin boolean and keep `gameInfo`. GamePage destructures
    `location.state.gameInfo`, and tabLocationMemory refuses to remember a game page without it. Leave the
    `is_dlc` early return alone.

    Do not write the removed flag's name, or the old Downloads back route, into any source comment. tabLocationMemory.ts
    is Task 2's file, so do not touch it here.

    Step 4 (catalog). Run `pnpm i18n`; never hand-edit the catalog. It must add only `gamepage.backToLibrary: "Back to
    Library"` (sorted) to `public/locales/en/gamelib.json`. Then run `pnpm i18n-churn-guard`: it must print
    `clean`. If it names an upstream catalog, run `git checkout -- public/locales/`, fix the call site's prefix and
    rerun.

    Step 5 (presence baseline). Run `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`. That
    regenerates `meta/i18nCatalogPresenceBaseline.json` so it records the new key as missing from the 48 non-en
    locales. Then `pnpm lint-translations:gamelib` must exit 0. prettier sees this JSON: if `npx prettier --check
    meta/i18nCatalogPresenceBaseline.json` fails, run `npx prettier --write` on that one path. Do not add
    translations to any other locale.

    Step 6 (GREEN and commit). Run every verify line below. Stage exactly the five paths in `<files>` with
    `git add <path> ...` (never `-A` or `.`). Commit as
    `fix(quick-261125-pmb): game page Back always returns to the Library`, using the attribution trailers from the
    session.
  </action>
  <verify>
    <automated>npx jest --selectProjects Frontend --runTestsByPath src/frontend/screens/Game/GamePage/__tests__/gamePageBackButton.test.ts src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts src/frontend/components/UI/NavShell/__tests__/tabLocationMemory.test.ts   # tests passed, 2 suites at HEAD (new file absent) and 3 after [HEAD=21 EXPECT==25 GUARD MUTATION: before steps 2-5 (the RED run) all 4 gamePageBackButton tests fail; restoring `to={backRoute}` turns Test 2 red]</automated>
    <automated>pnpm -s i18n && pnpm -s i18n-churn-guard   # [HEAD: i18n zero diff, guard prints "clean" EXPECT guard prints "i18n-churn-guard: clean"; a second pnpm i18n after the commit leaves git status empty]</automated>
    <automated>pnpm -s lint-translations:gamelib && python3 -c "import json; d=json.load(open('meta/i18nCatalogPresenceBaseline.json')); n=len(d['missing']['gamepage.backToLibrary']); assert n == 48, n"   # baseline locales recorded for the key [HEAD=absent EXPECT==48]; the lint's exit code is 0 at HEAD and after, and running step 4 without step 5 makes its drift check exit non-zero</automated>
    <automated>! grep -n 'fromDM' src/frontend/screens/Game/GamePage/index.tsx src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx   # matching lines [HEAD=2 EXPECT==0]; tabLocationMemory.ts:11 is Task 2's and is swept there</automated>
    <automated>git diff --quiet 5cafbfacc -- src/frontend/screens/Game/GamePage/index.css   # exit [HEAD=0 EXPECT==0 GUARD MUTATION: any edit to index.css (e.g. widening .backButton for visible text) makes git diff exit 1]: the art-band Back button CSS is untouched</automated>
    <automated>npx tsc --noEmit -p .   # exit, about 11 s [HEAD=0 EXPECT==0 GUARD MUTATION: narrowing the location.state cast while line 208 still reads the removed member is a type error]</automated>
    <automated>npx eslint --quiet src/frontend/screens/Game/GamePage/index.tsx src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx src/frontend/screens/Game/GamePage/__tests__/gamePageBackButton.test.ts   # errors [HEAD=0 EXPECT==0 GUARD MUTATION: leaving the old backRoute const behind once the NavLink stops reading it is a @typescript-eslint/no-unused-vars error (severity error in eslint.config.mjs:46-47)]</automated>
    <automated>npx prettier --check src/frontend/screens/Game/GamePage/index.tsx src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx src/frontend/screens/Game/GamePage/__tests__/gamePageBackButton.test.ts meta/i18nCatalogPresenceBaseline.json   # clean at HEAD and after; public/locales/en/gamelib.json is prettier-ignored (measured with --file-info), so it is generated by pnpm i18n and carries no check</automated>
  </verify>
  <done>One commit holding only the five paths. A game page opened from Downloads (or anywhere) has a Back control
  that goes to `/library`, with title and aria-label "Back to Library" from `gamelib:gamepage.backToLibrary`. The
  Downloads item navigates with `{ gameInfo }` only. The key is in en/gamelib.json, no upstream catalog changed, the
  presence baseline records it, and the new source gate plus the existing GamePage and tab-memory suites, tsc, eslint
  and prettier are green.</done>
</task>

<task type="auto">
  <name>Task 2: keep tabLocationMemory's comment true and close the todo with a Resolution</name>
  <files>src/frontend/components/UI/NavShell/tabLocationMemory.ts, .planning/todos/pending/2026-11-24-game-page-opened-from-downloads-has-no-way-back-to-the-library.md, .planning/todos/completed/2026-11-24-game-page-opened-from-downloads-has-no-way-back-to-the-library.md</files>
  <read_first>
    - src/frontend/components/UI/NavShell/tabLocationMemory.ts lines 1-22 (the doc comment)
    - .planning/todos/completed/2026-11-20-implement-steam-move-install.md from line 109 (house shape of a Resolution section)
  </read_first>
  <action>
    Step 1 (comment only, no code change). In `src/frontend/components/UI/NavShell/tabLocationMemory.ts`, rewrite the
    ownership bullet (lines 8-11) so it stays true after Task 1. Every game page still belongs to Games, including
    one opened from Downloads or the Redeem dialog, and its Back button now returns to the Library whatever opened it
    (quick 261125-pmb). Replace the parenthetical that credited router state with keeping Back honest; do not name the
    removed flag. In the next bullet (line 12), drop the stale line number from `GamePage/index.tsx:107`. The
    destructure is at 113 at HEAD and moves again after Task 1, so write `GamePage/index.tsx` destructures
    `location.state` with no line reference. Keep the wrap and ` * ` style of the surrounding block.

    Step 2 (close the todo). Run `git mv` to move
    `.planning/todos/pending/2026-11-24-game-page-opened-from-downloads-has-no-way-back-to-the-library.md` into
    `.planning/todos/completed/` under the same filename. Leave its frontmatter unchanged (completed/ is exempt from the
    triage gate). Append a section headed `## Resolution (2026-11-25): Back always returns to the Library`, in plain
    sentences wrapped at about 110 columns like the existing completed todos. It records:
    - the decision: the user chose always-back-to-Library over remembering the opening screen, and Downloads is
      reached through its app-level tab;
    - what changed: the Downloads item no longer marks its origin in router state, and passes `gameInfo` only;
      GamePage's Back NavLink always targets `/library`; its tooltip and accessible name read "Back to Library" from
      `gamelib:gamepage.backToLibrary`; and it stays icon-only on the art band;
    - the guard: `src/frontend/screens/Game/GamePage/__tests__/gamePageBackButton.test.ts`;
    - Task 1's short commit hash, from `git log -1 --format=%h -- src/frontend/screens/Game/GamePage/index.tsx`.

    Step 3 (commit). Stage `src/frontend/components/UI/NavShell/tabLocationMemory.ts` plus both sides of the
    `git mv` by explicit path (never `-A` or `.`). Commit as
    `docs(quick-261125-pmb): tab memory comment and close the Back-to-Library todo`, using the session's
    attribution trailers.
  </action>
  <verify>
    <automated>! grep -rn --exclude-dir=__tests__ 'fromDM' src   # production lines; 1 after Task 1 (tabLocationMemory.ts:11) [HEAD=4 EXPECT==0]</automated>
    <automated>test ! -e .planning/todos/pending/2026-11-24-game-page-opened-from-downloads-has-no-way-back-to-the-library.md && grep -q '^## Resolution (2026-11-25)' .planning/todos/completed/2026-11-24-game-page-opened-from-downloads-has-no-way-back-to-the-library.md   # [HEAD: pending present, completed absent EXPECT exit 0]</automated>
    <automated>pnpm -s planning-gates   # gates passed of 12, about 13 s [HEAD=12 EXPECT==12 GUARD MUTATION: a copy left in pending/ with its triage keys edited off turns todo-frontmatter-gate.py red]</automated>
    <automated>npx jest --selectProjects Frontend --runTestsByPath src/frontend/components/UI/NavShell/__tests__/tabLocationMemory.test.ts src/frontend/screens/Game/GamePage/__tests__/gamePageBackButton.test.ts   # both suites pass; the comment edit changes no behaviour</automated>
    <automated>npx prettier --check src/frontend/components/UI/NavShell/tabLocationMemory.ts && npx eslint --quiet src/frontend/components/UI/NavShell/tabLocationMemory.ts   # clean at HEAD and after; the todo is under .planning/, which is prettier-ignored (measured), so no prettier check is carried for it</automated>
  </verify>
  <done>One commit holding tabLocationMemory.ts and the todo move. No production file under `src/` mentions the
  removed flag. The ownership comment states that Back returns to the Library. The todo is in completed/ with a
  Resolution naming the decision, the change, the guard test and Task 1's commit. Planning gates are 12/12.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| in-app router state (DownloadManagerItem -> GamePage) | Same-renderer UI state set by GameLib's own `navigate`; no external or untrusted input crosses it |
| i18n extraction -> `public/locales/` | `pnpm i18n` writes shipped catalogs; a mis-namespaced call writes into an upstream-owned catalog |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261125-pmb-01 | Tampering | `public/locales/en/{gamepage,translation}.json` (upstream catalogs) | low | mitigate | Explicit `gamelib:` prefix on the `tGamelib` call; Task 1 runs `pnpm i18n && pnpm i18n-churn-guard`, and Test 4 asserts `backToLibrary` is absent from en/gamepage.json |
| T-261125-pmb-02 | Denial of Service | GamePage `location.state` destructure (index.tsx:113) | medium | mitigate | Test 3 pins the Downloads navigate state to exactly `{ gameInfo }`, so the game page and tabLocationMemory keep their `gameInfo` |
| T-261125-pmb-03 | Information Disclosure | Back control label | low | accept | Static UI string, no user or account data involved |
| T-261125-pmb-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed or upgraded by this plan; no install task exists, so the legitimacy gate has nothing to check |
</threat_model>

<verification>
- Task 1 and Task 2 verify lines all green, in order, in the worktree.
- `git log --oneline 5cafbfacc..HEAD` shows exactly two commits (Task 1 fix, Task 2 docs), and `git status --short` is
  empty apart from the orchestrator's own quick-task artifacts (PLAN/SUMMARY/STATE).
- Optional live spot-check by the operator (not a completion gate): launch with `pnpm tauri:dev` (never
  `tauri:dev:run`). Open Downloads and click a finished item. On the game page, hover `‹`, which reads "Back to
  Library"; clicking it lands on the Library. Downloads is still one click away on its tab.
</verification>

<success_criteria>
- Back on every game page goes to `/library` (the Library), whatever opened it; the Downloads-origin special case is gone
  from `src/` (production grep 0 lines).
- The Back control's tooltip and accessible name read "Back to Library" via `gamelib:gamepage.backToLibrary`; it stays
  icon-only and on the art band; index.css unchanged.
- en/gamelib.json carries the key, no upstream catalog changed, the presence baseline records 48 missing locales,
  `pnpm lint-translations:gamelib` exits 0.
- New source gate (4 tests) plus gamePageActionDock and tabLocationMemory suites green; tsc, eslint (errors), scoped
  prettier and planning-gates green.
- The todo is in `.planning/todos/completed/` with its Resolution.
</success_criteria>

<output>
Create `.planning/quick/261125-pmb-game-page-back-always-returns-to-the-lib/261125-pmb-SUMMARY.md` when done
</output>
