---
phase: quick-261011-txc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/winetricks/deriveRowState.ts
  - src/common/winetricks/__tests__/deriveRowState.test.ts
  - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/SuggestedGroup/index.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/GroupHeader/index.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/InstalledGroup/index.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/groups.test.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/everythingElse.test.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts
  - public/locales/*/gamelib.json
  - meta/i18nGateScope.json
  - meta/i18nForkTouchedFiles.json
  - .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-UAT.md
  - .planning/todos/pending/2026-10-11-winetricks-settings-window-not-resizable-by-drag-on-macos.md
  - .planning/todos/completed/2026-10-11-winetricks-tab-ux-observations-from-the-45-live-gate.md
  - .planning/todos/pending/2026-10-11-winetricks-tab-ux-observations-from-the-45-live-gate.md
autonomous: true
requirements: [45-UAT-13, TODO-2026-10-11-winetricks-tab-ux-observations]

estimate:
  tokens: 170000
  raw_tokens: 170000
  tasks: 3
  confidence: low # `gsd-sdk query estimate-calibration` at planning: "Unknown command: estimate-calibration" -- no factor, no samples

must_haves:
  truths:
    - "Unsearched, Everything else lists only verbs that appear in neither Suggested (game-specific + curated) nor any of the five task groups, in parser order, and its header badge is that count; a two-character search still matches across the WHOLE catalog (a task-group member such as vcrun2019 is absent unsearched and present once searched)"
    - "Every row shows its verb id as a text node in the title line (so the two `MS GDI+` rows read `gdiplus` and `gdiplus_winxp`), in every template and every state; the row root keeps `data-verb`"
    - "An errored row has an unchecked, enabled checkbox in its lead slot plus the danger icon, the Install failed tag and Retry in its status slot; ticking it derives `selected`, Apply sends it in the batch with other ticked verbs, and unticking returns it to `errored`"
    - "deriveRowState ranks `selected` above `errored` (rule 4) and `errored` above `available` (rule 5); every other rule is unchanged"
    - "The tab's groups no longer inherit the GamesSettings `padding-top: var(--space-xl)`; the 0,3,0 override declares exactly `min-width: 0` and `padding-top: 0` and covers Suggested, Installed, the task groups and Everything else; GamesSettings/index.scss is byte-unchanged"
    - "An Installed group renders between Suggested and the first task group, collapsed by default with the installed count, lists installed verbs (pre-existing and this-run) as Installed rows with no checkbox, and renders nothing when nothing is installed"
    - "Suggested for this game is a disclosure button, expanded by default with aria-expanded true and a count badge; toggling it hides its rows; GroupHeader has no non-collapsible branch left"
    - "The dock paints opaque (`--body-background`) with a top divider and `z-index: 2`, above the Everything else search box's `z-index: 1`"
    - "`installedHeading` exists in all 49 public/locales/<locale>/gamelib.json catalogues, each non-English value equal to that locale's own `winetricksBrowse.installedTag`; `pnpm lint-translations:gamelib` reports 0 hard failures; `pnpm i18n --fail-on-update` exits 0"
    - "The source todo sits in .planning/todos/completed/ with a `## Resolution` section; item 9 lives in a new pending todo carrying severity/platform/ready in order; `pnpm planning-gates` passes"
  artifacts:
    - path: src/frontend/screens/Settings/sections/WinetricksSettings/InstalledGroup/index.tsx
      provides: "Collapsible Installed group (A-45-01: zero members renders nothing)"
      contains: "winetricks-group-installed"
    - path: src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.tsx
      provides: "Two-prop partition: `components` (ungrouped, unsearched list + badge) and `catalog` (search domain)"
      contains: "catalog"
    - path: src/common/winetricks/deriveRowState.ts
      provides: "Precedence with selected outranking errored"
    - path: src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.tsx
      provides: "Verb id span in the title line; tickable errored row"
      contains: "WinetricksRow__verb"
    - path: .planning/todos/pending/2026-10-11-winetricks-settings-window-not-resizable-by-drag-on-macos.md
      provides: "Split-out todo for the window-resize observation (item 9)"
  key_links:
    - from: src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx
      to: EverythingElseGroup
      via: "`components` = catalog minus the shown-above set; `catalog` = allComponents"
    - from: src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx
      to: InstalledGroup
      via: "`allComponents.filter(c => installedForRows.includes(c.verb))`, mounted right after SuggestedGroup"
    - from: src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.tsx
      to: toggleVerb in index.tsx
      via: "errored case's checkbox calls `onToggle`; applyVerbs already clears the error flag for the batch (D-15)"
    - from: src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
      to: GamesSettings section floor
      via: "0,3,0 `:is(.settingsDialogContent, .settingsWrapper) .WinetricksSettings :is(...)` override, pinned by tokenCensus.test.ts"
---

<objective>
Land the eight decided items from the Phase 45 live gate 45-12 Winetricks-tab UX todo and split the ninth out.

Purpose: the operator installed the wrong `MS GDI+` verb, could not re-batch a failed verb, saw "Everything else" repeat every grouped verb, measured "huge" whitespace between collapsed headers, wanted an Installed view and a collapsible Suggested group, and captured content showing through the docked bar (45-UAT.md item 13 is `issue`).

Output: one feature commit for row logic (items 2, 3), one feature commit for tab structure + catalogue fill + gate scope + UAT note (items 1, 4, 5, 6, 7), one docs commit for the todo split and closure (items 8, 9).

Every decision below is locked by the orchestrator (`locked item N` = the Nth numbered item of the todo and of the orchestrator's decision list). Do not revisit them.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md (top 80 lines only -- the file is 1874 lines)
@CLAUDE.md
@.planning/todos/pending/2026-10-11-winetricks-tab-ux-observations-from-the-45-live-gate.md
Load `Skill("gamelib-conventions")` before writing the new todo (task 3), editing 45-UAT.md (task 2) and running any `<verify>` prettier check.

Facts measured at planning time (2026-10-11) that the tasks rely on:
- Jest projects are `Common` (src/common) and `Frontend` (src/frontend) and `Meta` (meta); select with `--selectProjects`.
- The fixture catalog (`src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tabFixtures.ts` `buildCatalog`) is every `TASK_GROUP_MEMBERS` verb plus exactly two extras, `foobar2000` and `gdiplus_winxp`. Every `CURATED_WINETRICKS_VERBS` entry is a task-group member, so no fixture verb is both ungrouped and in Suggested: the ungrouped list under the default mount is exactly `['foobar2000', 'gdiplus_winxp']`.
- No monospace custom property is declared under `src/frontend/styles/` (`_typography.scss` gives `code` a literal stack ending in `monospace`), so the verb span uses the bare `monospace` keyword with no `var()`.
- The only consumer of GroupHeader's static (non-collapsible) branch is SuggestedGroup; no stylesheet rule targets its modifier class; tests touch it at `groups.test.tsx` lines 147 and 163-167.
- `tokenCensus.test.ts:698` pins the status slot as `width 12rem`; `Row/index.scss:207` mentions "the fixed 12rem status slot" in the 261011-jj1 cached-badge comment.
- `tokenCensus.test.ts:600` "the override declares min-width only, leaving padding-top to the floor" asserts `rule.decls` toEqual `{ 'min-width': '0' }` over a three-group list; `:591` `it.each` lists the same three groups; `:542` "the floor rule is unchanged..." must stay as-is.
- All 49 `public/locales/*/gamelib.json` have `winetricksBrowse.installedTag`; none has `installedHeading`; in every file the first `winetricksBrowse` key (file order) sorting after `installedHeading` is `installedTag`; no non-English `installedTag` equals the English `Installed`. Only one locale tree is tracked in git.
- `meta/i18nGateScope.json` is HAND-CURATED: its `generatedBy` is a long "hand-edited (...)" provenance string, so `pnpm gen-i18n-scope:rewrite` REFUSES to touch it (exit 1, writes nothing -- see `meta/genI18nGateScope.ts` header and `meta/__tests__/genI18nGateScope.test.ts` A2). The repo precedent for a new tab file (Plan 45-11, Phase 49 plan 01) is a hand insert into both `meta/i18nGateScope.json` and `meta/i18nForkTouchedFiles.json` plus one appended provenance clause. `pnpm gen-i18n-gate-scope` derives `meta/i18nForkTouchedFiles.json` from `git diff --name-status <merge-base> HEAD`, i.e. COMMITTED state only.
- `.husky/pre-push` runs `pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update && pnpm find-deadcode`.
- `themes.scss:10-28` records that `--divider` is declared in only 2 theme blocks, one resolving to midnightMirage's `--neutral-03` (measured 1.45:1 against `--body-background`). Locked item 7 still names `var(--divider, ...)`; keep it and record this as an open observation (see task 2).
- prettier: every `src/` and `meta/*.json` path below reports `"ignored": false`; `public/locales/` and `.planning/` are prettier-ignored, so `--check` over them is vacuous and is omitted on purpose.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Tickable failed rows and verb ids on every row, end to end from deriveRowState through Row to Apply (locked items 2, 3)</name>
  <files>src/common/winetricks/deriveRowState.ts, src/common/winetricks/__tests__/deriveRowState.test.ts, src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.tsx, src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss, src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx, src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/groups.test.tsx, src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts</files>
  <behavior>
    - deriveRowState: verb flagged in erroredVerbs AND selected true, run null -> 'selected' (new rule 4; reds against today's ordering)
    - deriveRowState: verb flagged, selected false, run null -> 'errored' (new rule 5)
    - Row 'errored': exactly one role=checkbox button with aria-checked false and not disabled; a circle-exclamation icon; text contains 'Install failed'; one WinetricksRow__retry whose text is 'Retry'
    - Row: checkbox-bearing states are exactly available, selected, queued, errored (installed and installing have none)
    - Row: the title line holds a WinetricksRow__verb span whose text is the component's verb; the row root's data-verb is unchanged
    - Tab: after a pushed failed outcome for vcrun2019 (status done), ticking its Suggested row gives WinetricksRow--selected; unticking gives WinetricksRow--errored again; ticking it plus vcrun2013 and pressing Apply calls winetricksApply('legendary', 'fake-app', ['vcrun2019', 'vcrun2013'])
  </behavior>
  <action>
RED first: write the new and re-pointed tests below, run them, confirm the deriveRowState rule-4 case and the Row errored/checkbox cases fail, then implement.

(a) deriveRowState (locked item 3a). In `src/common/winetricks/deriveRowState.ts`, swap the two blocks so the `selected` check comes before the `erroredVerbs[verb]` check. Renumber the inline comments: "(4) Ticked for the next batch -- a tick means 'will be installed on Apply', so it outranks a prior failure; unticking returns the row to errored because the flag is untouched (quick 261011-txc)" and "(5) Flagged by a prior run's failed outcome". Leave rules 1-3 and 6, `foldRunOutcomes` and `clearVerbError` untouched. In `src/common/winetricks/__tests__/deriveRowState.test.ts` rewrite in place, keeping the file's "one case per precedence rule that a wrong ordering would fail" property: "rule 4: errored beats selected" becomes "rule 4: selected beats errored (a tick on a failed verb re-batches it)" with `selected: true`, `erroredVerbs: flagged('vcrun2019')`, expecting `'selected'`; "rule 5: selected when ticked and nothing outranks it" becomes "rule 5: errored when flagged and not ticked" with `selected: false`, `erroredVerbs: flagged('vcrun2019')`, expecting `'errored'`. Check rule 2 and rule 3 titles still read true ("installed beats queued, errored and selected", "queued beats errored and selected") -- they do; leave them.

(b) Row errored case (locked item 3b). In `src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.tsx` `case 'errored'`: the lead becomes the same `<button type="button" role="checkbox">` as the available/selected/queued case, with `aria-checked={false}`, `aria-labelledby={titleId}`, `disabled={locked}`, class `WinetricksRow__checkbox`, the `activate(() => onToggle(component.verb))` spread and the inner `WinetricksRow__box` span. The status fragment becomes: the `FontAwesomeIcon` with `faCircleExclamation` and class `WinetricksRow__icon WinetricksRow__icon--errored`, then the existing failed tag span, then the existing Retry button unchanged (still `onRetry`). Prefer extracting the checkbox JSX into one local helper used by both cases over duplicating it. `index.tsx` needs no change (locked item 3d): `toggleVerb` already admits any non-installed verb and `applyVerbs` already clears the batch's error flags (D-15).

(c) Verb id (locked item 2). In the same file, inside `WinetricksRow__titleLine`, render a span with class `WinetricksRow__verb` whose only child is `component.verb` immediately after the title span (before meta, cached and category), in every template and state. Do not add it to the checkbox's `aria-labelledby` (not decided; tests pin the label). In `src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss` add a `.WinetricksRow__verb` rule next to `.WinetricksRow__meta`: `flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; font-size: var(--text-xs, 0.6875rem); color: var(--text-secondary, #a8aeaf);` with a one-line comment citing live gate 45-12 G5 (two upstream rows titled "MS GDI+", the operator installed `gdiplus` instead of `gdiplus_winxp`). The bare `monospace` keyword is used because no monospace token is declared in `src/frontend/styles/`. D-21 discipline: every `var()` carries a fallback; no navbar-family, hover-text, raw status or generic border token.

(d) Status slot width (locked item 3c). In `Row/index.scss` `.WinetricksRow__status` change `width: 12rem` to `width: 13rem` and rewrite its comment to "Trailing status slot: fixed width sized to its widest content -- the danger icon, the failed tag and the Retry button -- so no state ever reflows the row horizontally." Update the 261011-jj1 cached-badge comment's "fixed 12rem status slot" to "fixed 13rem status slot". In `__tests__/tokenCensus.test.ts` retitle "the status slot is unchanged: flex 0 0 auto, width 12rem" to "the status slot: flex 0 0 auto, width 13rem (261011-txc: room for icon, failed tag and Retry)" and expect `'13rem'`.

(e) Tests in `__tests__/rowStates.test.tsx`, edited in place: "errored: a danger icon, the Install failed tag and a Retry button, no checkbox" becomes "errored: an unchecked enabled checkbox, the danger icon, the Install failed tag and Retry" asserting `checkboxes(tree)` has length 1 with `aria-checked` false and `disabled` false, plus the existing icon/text/Retry assertions. "only the installed state has no checkbox among the five that could show one" becomes "only installed and installing have no checkbox" with `withBox` toEqual `['available', 'selected', 'queued', 'errored']` (keep the length-6 sanity line). Add next to "exposes the verb on the row root so a selection is identifiable by verb (D-07)" a case "shows the verb id as a text node in the title line, beside the title (261011-txc)": mount `baseProps('available')`, find `WinetricksRow__titleLine`, assert it contains exactly one `WinetricksRow__verb` whose `collectText` is `'vcrun2019'`, and the root still has `data-verb` `'vcrun2019'`; repeat for `'errored'` and `'installed'` to cover "every state". Add to the existing "locked" describe that the errored row's checkbox is disabled when `locked` is true.

(f) Tab-level test in `__tests__/groups.test.tsx`, in the "run state on the rows (D-10, D-12, D-13, D-18)" describe after "E6-error: a failed outcome shows Retry, and Retry starts a fresh one-verb run that clears the failed state": add "a failed row is tickable: ticking re-batches it with another verb, unticking returns it to failed (261011-txc)". Reuse that test's setup (`await mount()`, `capturedQueueChangedListener(api)({}, queueStateWith({ verbs: ['vcrun2019'], outcomes: { vcrun2019: 'failed' }, status: 'done' }))`), then `tick(rowFor(suggested(again()), 'vcrun2019'))` and assert className contains `WinetricksRow--selected`; tick again and assert `WinetricksRow--errored`; tick vcrun2019 and vcrun2013, press `applyButton(again())`, `await flush()`, and assert `api.winetricksApply` was called once with `['vcrun2019', 'vcrun2013']`.

(g) Regression sweep: the swap and the new checkbox can red other tab suites that assumed an errored row has no checkbox or that errored outranks selected (`selectionLock`, `remountSafety`, `queueStateOrdering`, `stickyBar`, `winetricksInstallMouseRace` all mention errored/failed rows), and the verb span adds text to any `collectText` over a whole row. Run the whole tab test directory; re-point any such assertion IN PLACE to the new contract, add that file to this task's commit and prettier list, and name it in the SUMMARY. Never weaken an assertion to make it pass.

Commit: `feat(261011-txc): an errored Winetricks row is tickable and every row shows its verb id`, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
  </action>
  <verify>
    <automated>npx jest src/common/winetricks/__tests__/deriveRowState.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__ --selectProjects Common Frontend 2>&1 | grep -E '^(PASS|FAIL)|Test Suites:|Tests:'</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx prettier --check src/common/winetricks/deriveRowState.ts src/common/winetricks/__tests__/deriveRowState.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.tsx src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/groups.test.tsx src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts</automated>
    (append any regression-sweep file from step g to the prettier list)
  </verify>
  <done>Rule-4 case observed RED before the swap and GREEN after; both jest projects green over the whole tab directory plus deriveRowState; `pnpm codecheck` exits 0; prettier clean over every path written; one `feat(261011-txc)` commit.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Tab structure -- ungrouped Everything else, Installed group, collapsible Suggested, group spacing, opaque dock, catalogue fill and gate scope (locked items 1, 4, 5, 6, 7)</name>
  <files>src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx, src/frontend/screens/Settings/sections/WinetricksSettings/index.scss, src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.tsx, src/frontend/screens/Settings/sections/WinetricksSettings/SuggestedGroup/index.tsx, src/frontend/screens/Settings/sections/WinetricksSettings/GroupHeader/index.tsx, src/frontend/screens/Settings/sections/WinetricksSettings/InstalledGroup/index.tsx, src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/groups.test.tsx, src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/everythingElse.test.tsx, src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts, public/locales/*/gamelib.json, meta/i18nGateScope.json, meta/i18nForkTouchedFiles.json, .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-UAT.md</files>
  <behavior>
    - Everything else, default mount: badge '2'; expanded rows ['foobar2000', 'gdiplus_winxp']; vcrun2019 absent; typing 'vcrun2019' shows it with a category tag
    - Installed: absent by default; with winetricksListInstalled -> ['vcrun2019','foobar2000'] it renders after Suggested and before the first task group, collapsed, badge '2'; expanded shows both as WinetricksRow--installed with no checkbox, in catalog order; a run outcome {vcrun2019: 'installed'} with an empty installed list makes it appear with vcrun2019
    - Suggested: header is a button with aria-expanded true and count '8' (curated, no signal); toggling sets aria-expanded false and renders no rows; toggling again restores them
    - Stylesheet: the 0,3,0 override decls equal { min-width: 0, padding-top: 0 } and beat the floor for all four group classes; the dock declares z-index 2, an opaque --body-background and a box-shadow, and the search box's z-index is 1
  </behavior>
  <action>
(1) Everything else partition (locked item 1). In `src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx` resolve the five task groups ONCE per render (pairs of id and `resolveTaskGroup(allComponents, id)`), feed those to the `TaskGroup` map, and build a `Set` of verbs shown above from `suggested.gameSpecific`, `suggested.curated` and every task-group member. Pass `EverythingElseGroup` two props: `components={allComponents.filter(c => !shownAbove.has(c.verb))}` (parser order; the unsearched list and the badge) and `catalog={allComponents}` (the search domain). Installed-group members are deliberately NOT subtracted -- the locked set is Suggested + task groups only. In `EverythingElseGroup/index.tsx` add the `catalog` prop, filter `catalog` (not `components`) when `searching`, keep `count={components.length}` and the unsearched list as `components`. Rewrite the Props comments and the header comment: unsearched it lists only verbs no tier above shows; the search stays catalog-wide on purpose because live gate 45-12 found `gdiplus` by id through it, and a search hit carries its category tag (`showCategory` is `searching`), so a hit that duplicates a row shown above is identifiable. Remove the old claim that a search hit cannot duplicate a row already visible elsewhere; keep the paragraphs on the plain searchbox, the WKWebView recent-searches chip and no virtualisation.

(2) Installed group (locked item 5). Create `src/frontend/screens/Settings/sections/WinetricksSettings/InstalledGroup/index.tsx` mirroring `TaskGroup/index.tsx`: props `components: WinetricksComponent[]` and `renderRow: RenderWinetricksRow`; `useState(false)` for expanded; after the hooks, return `null` when `components.length === 0` (A-45-01); a `<section className="WinetricksInstalled">` (a `section`, so the GamesSettings floor selector matches it and the override in step 4 must cover it) with `GroupHeader` label `tGamelib('winetricksBrowse.installedHeading', 'Installed')`, `count={components.length}`, `expanded`, `onToggle`, `controlsId="winetricks-group-installed"`; body `div` with `id="winetricks-group-installed"`, class `WinetricksInstalled__body`, `hidden={!expanded}`, rendering `renderRow(component, 'twoLine', false)` for each component only while expanded. Header comment: operator request from live gate 45-12 (todo 2026-10-11 item 5) -- everything installed on the bottle in one place, pre-existing and installed by this run (`installedForRows`); a status view, not a partition, so its verbs still appear in their other tiers. No stylesheet of its own. In `index.tsx` import it and mount `<InstalledGroup components={allComponents.filter(c => installedForRows.includes(c.verb))} renderRow={renderRow} />` directly after `SuggestedGroup`, before the task-group map.

(3) Suggested disclosure (locked item 6). In `SuggestedGroup/index.tsx` add `useState(true)`, pass `count={gameSpecific.length + curated.length}`, `expanded`, `onToggle`, `controlsId="winetricks-group-suggested"` to `GroupHeader`; the body `div` gains `id="winetricks-group-suggested"` and `hidden={!expanded}` and renders its rows, sub-heading and hint only while expanded (mirror `TaskGroup`). Rewrite the header comment: expanded by default and collapsible like the other groups (operator request, live gate 45-12, todo item 6); game-specific rows still prepend with no heading of their own. Then remove GroupHeader's now-dead non-collapsible branch: in `GroupHeader/index.tsx` delete the early-return `h3` branch, make `expanded: boolean`, `onToggle: () => void` and `controlsId: string` required, and rewrite the Props comment that named Suggested as the static consumer. Keep the `WinetricksGroupHeader--button` modifier.

(4) Spacing (locked item 4). In `index.scss` the 261011-jj1 override `:is(.settingsDialogContent, .settingsWrapper) .WinetricksSettings :is(...)` adds `.WinetricksInstalled` to its `:is()` list and declares `padding-top: 0` beside `min-width: 0`. Rewrite the paragraph that says `padding-top` is deliberately not overridden: the leaked `padding-top: var(--space-xl)` (3em) above every group was the "huge" whitespace the operator measured in live gate 45-12 (todo 2026-10-11, item 4); it is now released, and the tab's own `gap: var(--space-sm)` (0.75em, roughly half the ~1.6em header) carries the spacing. Update the comment's group enumeration to four classes. Do NOT edit `src/frontend/screens/Settings/sections/GamesSettings/index.scss`. Also add `.WinetricksInstalled` to the `.WinetricksSuggested, .WinetricksTaskGroup` flex-column rule, `.WinetricksInstalled__body` to the matching body rule, and `[hidden] { display: none; }` rules for `.WinetricksSuggested__body` and `.WinetricksInstalled__body` beside the existing `.WinetricksTaskGroup__body[hidden]`.

(5) Opaque dock (locked item 7). In `index.scss` `&__dock` add `z-index: 2;`, `background: var(--body-background, #070a0b);` and `box-shadow: 0 -1px 0 var(--divider, color-mix(in srgb, currentColor 14%, transparent));`. Extend the dock comment: live gate 45-12 (45-UAT.md item 13) captured rows and a group header showing through the docked bar; the dock now paints opaque with a top divider so content scrolling beneath reads as docked, not overlapped; `z-index: 2` because the Everything else search box is sticky at `z-index: 1`. Then record in the SUMMARY under `## Open observations` that `themes.scss:10-28` measures `--divider` as declared in only 2 theme blocks, one being midnightMirage's near-invisible `--neutral-03`, so the divider may not show in midnightMirage -- for the 45-12 re-capture to check; the opaque background is the load-bearing half.

(6) Tests, edited in place (quote-exact titles):
- `__tests__/everythingElse.test.tsx`: add a literal `UNGROUPED = ['foobar2000', 'gdiplus_winxp']` with a sanity case proving it equals `CATALOG` minus every `TASK_GROUP_MEMBERS` verb minus `CURATED_WINETRICKS_VERBS`. "is collapsed by default with the catalog count as its badge and no rows or search box" becomes "...with the ungrouped count as its badge..." expecting `String(UNGROUPED.length)`. "shows every catalog verb as a one-line row in parser order with no category tags and no results heading" becomes "shows only the ungrouped verbs as one-line rows in parser order..." expecting `UNGROUPED`. "a one-character query leaves the full list untouched (threshold)" expects `UNGROUPED`. "E5-empty: zero matches shows the heading with the query and a Clear search button that empties it" expects `UNGROUPED` after clearing. "shares one selection with the other tiers: ticking a curated verb here marks it in Suggested, and Apply sends it" first types `vcrun2019` into the search, ticks the hit, then asserts as today. Add "a task-group member is absent from the unsearched list and present once a search matches it (261011-txc)": vcrun2019 absent from `rowVerbs` unsearched; after typing `vcrun2019` present, with a `WinetricksRow__category` tag. "a two-character query filters on verb OR title..." and "matches on title text too..." stay catalog-wide; leave them unless they red.
- `__tests__/groups.test.tsx`: "non-vacuity: renders a static header and the curated 8 under the sub-heading when there is no per-game signal" becomes "non-vacuity: renders the Suggested header and the curated 8 under the sub-heading when there is no per-game signal", reading the label from `WinetricksGroupHeader__label` (the header now also holds the count badge). "is always open: its header is a static heading, never a disclosure button" becomes "is expanded by default and collapsible: a disclosure button with aria-expanded true, toggling hides the rows", asserting `disclosure(group)` aria-expanded true, `aria-controls` `winetricks-group-suggested`, count badge `'8'`, then after `onClick` + `again()` aria-expanded false, body `hidden` true and zero rows, and a second toggle restores `CURATED_ORDER` -- and delete the old static-modifier-class count assertion. Add `describe('Installed group (261011-txc)')` with: absent when nothing is installed (no `WinetricksInstalled`); with `api.winetricksListInstalled.mockImplementation(() => Promise.resolve(['vcrun2019', 'foobar2000']))` it is collapsed with badge `'2'` and sits after `WinetricksSuggested` and before the first `WinetricksTaskGroup` in document order; expanded it lists `['vcrun2019', 'foobar2000']` in catalog order as `WinetricksRow--installed` rows with no checkbox; a pushed `queueStateWith({ verbs: ['vcrun2019'], outcomes: { vcrun2019: 'installed' }, status: 'done' })` on an empty installed list makes the group appear containing vcrun2019. If "disclosure mouse race (D-04: every disclosure header)" or "prohibitions..." reds because Suggested now has a disclosure, re-point in place.
- `__tests__/tokenCensus.test.ts` (describe "GamesSettings section floor vs the tab's groups (261011-jj1)"): add `'WinetricksInstalled'` to the `it.each` group list and to the `groups` array in "the override declares min-width only, leaving padding-top to the floor", retitle that case "the override declares min-width: 0 and padding-top: 0, releasing the floor's leaked padding (261011-txc)" and expect `{ 'min-width': '0', 'padding-top': '0' }`. Leave "the floor rule is unchanged: one rule, both selectors, both decls, specificity 0,2,1" as is. Add a small describe "dock paints above the sticky search (261011-txc)" using the file's existing `effectiveDecls`/`parseRules`/`sass.compile` helpers: compiled `index.scss` `.WinetricksSettings__dock` has `z-index` `'2'`, a `background` containing `--body-background`, and a `box-shadow`; compiled `EverythingElseGroup/index.scss` search rule has `z-index` `'1'`; assert `2 > 1` numerically. The census ban-list checks must stay green over the new `var()`s.

(7) Catalogue fill (locked item 5). Write a throwaway python script in the scratchpad (not the repo) that, for each of the 49 `public/locales/*/gamelib.json` files, works on raw TEXT -- never `json.load` + `json.dump` the file (prettier-ignored catalogues, per-locale key order): locate the `"winetricksBrowse": {` line, then within that object the first key line (file order) whose key sorts after `installedHeading` -- detect per file, do not assume -- and insert before it one line with the same indentation: `"installedHeading": ` followed by the RAW value text copied verbatim from that file's own `installedTag` line (so English gets `"Installed"` and every other locale its own translated word, with its own escaping), then a trailing comma. Abort with a message if any file lacks `installedTag` (planning measured none). Afterwards: every file must re-parse (`python3 -c 'import json; json.load(open(p))'` over all 49), `git diff --numstat -- public/locales` must show exactly 49 lines each `1	0`, and `json.load` of each must give `winetricksBrowse.installedHeading == winetricksBrowse.installedTag`. Do NOT touch any `gamelib.mt.json` manifest; do NOT regenerate `meta/i18nCatalogPresenceBaseline.json`. Precedent shape: commit `1cbc0494c`.

(8) i18n gate scope. Do NOT run `pnpm gen-i18n-scope:rewrite`: `meta/i18nGateScope.json` is hand-curated and the rewrite refuses it (exit 1, writes nothing). Follow the Plan 45-11 precedent instead: insert `"src/frontend/screens/Settings/sections/WinetricksSettings/InstalledGroup/index.tsx",` into the `files` array of BOTH `meta/i18nGateScope.json` and `meta/i18nForkTouchedFiles.json` in sorted position (after the `.../GroupHeader/index.tsx` line, before `.../LogPanel/index.tsx`), matching indentation, as a text edit. Append one clause to the end of `meta/i18nGateScope.json`'s `generatedBy` string (before its closing quote): ` Quick 261011-txc added WinetricksSettings/InstalledGroup/index.tsx (the new Installed group) to this list and to meta/i18nForkTouchedFiles.json, promoted straight into scope rather than left as unscanned debt -- still NOT a pnpm gen-i18n-gate-scope run.` (no backticks inside the JSON string beyond what the string already uses; keep it valid JSON). After the task commit lands (the generator diffs committed HEAD only), run `pnpm gen-i18n-gate-scope` and `git diff --exit-code -- meta/i18nForkTouchedFiles.json meta/i18nGateScope.json`: empty means the hand insert matches the derivation. If the generator's output differs ONLY by the InstalledGroup line, commit its output as `chore(261011-txc): regenerate i18nForkTouchedFiles.json` with the same trailer; if it differs in anything else, or the generator cannot reach the merge-base, restore with `git checkout -- meta/i18nForkTouchedFiles.json` (nothing else uncommitted at that point) and record it in the SUMMARY.

(9) 45-UAT.md item 13 (locked item 7). In `.planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-UAT.md`, item `### 13.` (line ~100), append to the END of its existing single `result:` line, after one space: "Quick 261011-txc paints the dock opaque with a top divider above the sticky search; re-capture owed at the next 45-12 run." The line must still open `result: issue`. Do not restructure the item, the heading or `expected:`.

(10) `graphify update .` once after the code edits.

Commit the code, tests, 49 catalogues, two meta JSON files and 45-UAT.md together: `feat(261011-txc): Winetricks tab lists ungrouped verbs in Everything else, adds an Installed group, makes Suggested collapsible, tightens group spacing and docks the bar opaque`, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Then run step 8's post-commit check.
  </action>
  <verify>
    <automated>npx jest src/common/winetricks/__tests__/deriveRowState.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__ --selectProjects Common Frontend 2>&1 | grep -E '^(PASS|FAIL)|Test Suites:|Tests:'</automated>
    <automated>pnpm lint-translations:gamelib 2>&1 | tail -15   # must report 0 hard failures</automated>
    <automated>for p in public/locales/*/gamelib.json; do python3 -c 'import json,sys; d=json.load(open(sys.argv[1]))["winetricksBrowse"]; assert d["installedHeading"]==d["installedTag"], sys.argv[1]' "$p" || echo "BAD $p"; done; git diff --numstat -- public/locales | awk '$1!=1||$2!=0{bad=1} END{print NR" files"; exit bad}'</automated>
    <automated>pnpm i18n --fail-on-update && pnpm codecheck && pnpm lint && pnpm find-deadcode</automated>
    <automated>npx prettier --check src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx src/frontend/screens/Settings/sections/WinetricksSettings/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.tsx src/frontend/screens/Settings/sections/WinetricksSettings/SuggestedGroup/index.tsx src/frontend/screens/Settings/sections/WinetricksSettings/GroupHeader/index.tsx src/frontend/screens/Settings/sections/WinetricksSettings/InstalledGroup/index.tsx src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/groups.test.tsx src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/everythingElse.test.tsx src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts meta/i18nGateScope.json meta/i18nForkTouchedFiles.json</automated>
    (public/locales/*/gamelib.json and 45-UAT.md are prettier-ignored -- `--file-info` reports `"ignored": true` -- so they are deliberately absent from the prettier check; their consistency is the numstat/re-parse check above and hand-matching the surrounding lines.)
    <automated>grep -n '^result: issue .*Quick 261011-txc paints the dock opaque' .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-UAT.md</automated>
    <automated>git diff --quiet HEAD -- src/frontend/screens/Settings/sections/GamesSettings/index.scss && echo GamesSettings-untouched</automated>
    After the commit: <automated>npx jest meta/__tests__/genI18nGateScope.test.ts meta/__tests__/hardcodedStringGate.test.ts --selectProjects Meta 2>&1 | grep -E '^(PASS|FAIL)|Test Suites:|Tests:'</automated> and step 8's `pnpm gen-i18n-gate-scope` diff check.
  </verify>
  <done>Whole tab test directory and deriveRowState green; lint-translations:gamelib 0 hard failures; 49 catalogues each +1/-0, each re-parses, each `installedHeading` equals its own `installedTag`; i18n parser, codecheck, lint, find-deadcode green; prettier clean over every non-ignored path; Meta gate-scope tests green after the commit; GamesSettings/index.scss unchanged; UAT item 13 still opens `result: issue` with the appended sentence; one `feat(261011-txc)` commit (plus an optional `chore` regeneration commit).</done>
</task>

<task type="auto">
  <name>Task 3: Split item 9 into its own todo and close the source todo (locked items 8, 9)</name>
  <files>.planning/todos/pending/2026-10-11-winetricks-settings-window-not-resizable-by-drag-on-macos.md, .planning/todos/completed/2026-10-11-winetricks-tab-ux-observations-from-the-45-live-gate.md</files>
  <action>
(1) Create `.planning/todos/pending/2026-10-11-winetricks-settings-window-not-resizable-by-drag-on-macos.md`. Frontmatter keys in EXACTLY this order, values bare and lowercase where vocabulary-bound: `created:` (ISO timestamp now), `title: Winetricks settings window not resizable by dragging on macOS, yet captures show three distinct widths`, `area: ui`, `severity: minor`, `platform: macos`, `ready: human`, `found_by: "Phase 45 live gate 45-12 operator remark, launch 4, 2026-10-10 (split from 2026-10-11-winetricks-tab-ux-observations-from-the-45-live-gate item 9 by quick 261011-txc)"`. Body: item 9's text verbatim from the source todo ("**Window not resizable by dragging** (operator, launch 4), yet captures show three distinct window widths across launches 3-4. Unexplained; `tauri.conf.json` has `resizable: true`. Worth a live check on its own."), then the three facts as a list: `src-tauri/tauri.conf.json` declares `"resizable": true` (line 20); the gate's captures show three distinct window widths across launches 3-4; it needs a live check on its own (no code hypothesis yet). Add the evidence pointer from the source todo (`/tmp/gamelib-gate-45-20261010T194049Z/terminal.log`).

(2) `git mv .planning/todos/pending/2026-10-11-winetricks-tab-ux-observations-from-the-45-live-gate.md .planning/todos/completed/`, then append `## Resolution (2026-10-11, quick 261011-txc)` with one line per item: 1 -- Everything else lists only verbs no tier above shows when not searching; search stays catalog-wide (task 2 commit hash); 2 -- every row shows its verb id beside the title (task 1 hash); 3 -- an errored row is tickable, selected outranks errored, Retry kept (task 1 hash); 4 -- the leaked 3em section padding-top is released, the tab's 0.75em gap spaces the groups (task 2 hash); 5 -- new collapsed Installed group after Suggested (task 2 hash); 6 -- Suggested is a disclosure, expanded by default (task 2 hash); 7 -- the dock paints opaque with a top divider above the sticky search, 45-UAT item 13 annotated, re-capture owed at the next 45-12 run (task 2 hash); 8 -- kept, recorded: `Done` is this run's live feedback, `Installed` is the steady state, both stay; 9 -- split to `.planning/todos/pending/2026-10-11-winetricks-settings-window-not-resizable-by-drag-on-macos.md`. Add one line that nothing here is live-verified: items 1-7 owe a look at the next 45-12 run. Use the real short hashes from `git log`. Leave the source frontmatter as is (completed/ is exempt from the gate).

(3) Record item 8's decision in the SUMMARY too (no code).

Commit: `docs(261011-txc): split the window-resize observation into its own todo and close the Winetricks tab UX todo`, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
  </action>
  <verify>
    <automated>pnpm planning-gates</automated>
    <automated>awk '/^---$/{n++; next} n==1' .planning/todos/pending/2026-10-11-winetricks-settings-window-not-resizable-by-drag-on-macos.md | grep -E '^(severity|platform|ready):' | tr '\n' ' ' | grep -qx 'severity: minor platform: macos ready: human ' && echo frontmatter-ok</automated>
    <automated>test ! -e .planning/todos/pending/2026-10-11-winetricks-tab-ux-observations-from-the-45-live-gate.md && grep -c '^## Resolution' .planning/todos/completed/2026-10-11-winetricks-tab-ux-observations-from-the-45-live-gate.md</automated>
    (Both files are under `.planning/`, which is prettier-ignored, so no prettier check applies; this is stated, not omitted silently.)
  </verify>
  <done>`pnpm planning-gates` passes; the new pending todo carries `severity: minor`, `platform: macos`, `ready: human` in that order; the source todo is in completed/ with a Resolution listing items 1-9; one `docs(261011-txc)` commit.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| winetricks catalog -> renderer | Verb ids and titles come from parsing upstream winetricks output in the sidecar |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-txc-01 | Tampering | Row verb-id span | low | mitigate | `component.verb` renders only as a React text child (T-45-20 rule); no `dangerouslySetInnerHTML`; the existing rowStates T-45-20 test keeps covering the row |
| T-txc-02 | Elevation | errored-row checkbox | low | mitigate | checkbox honours `disabled={locked}`; `toggleVerb` still refuses while locked or for installed verbs; locked case asserted in rowStates |
| T-txc-03 | Tampering | locale catalogues | low | mitigate | raw-text single-line insert, re-parse of all 49, numstat `1 0` per file, lint-translations 0 hard failures |
| T-txc-SC | Tampering | npm/pip/cargo installs | high | accept | no package is installed by this plan |
</threat_model>

<verification>
- Whole Winetricks tab test directory plus deriveRowState green under `--selectProjects Common Frontend`; Meta gate-scope tests green after the task 2 commit.
- Pre-push chain run step by step before any push: `pnpm codecheck`, `pnpm lint`, scoped prettier, `pnpm i18n --fail-on-update`, `pnpm find-deadcode`.
- `pnpm lint-translations:gamelib` 0 hard failures; `pnpm planning-gates` passes.
- No live verification is claimed: every visual item (spacing, dock opacity, divider visibility in midnightMirage, Installed group, verb id width) is owed at the next 45-12 run.
</verification>

<success_criteria>
- Items 1-7 implemented exactly as locked; item 8 recorded with no code; item 9 split into a gate-valid pending todo.
- Three atomic commits (plus at most one `chore` regeneration of i18nForkTouchedFiles.json), each with the `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer.
- SUMMARY lists every re-pointed test by title, any regression-sweep file touched, the `--divider` open observation, and the item 8 decision.
</success_criteria>

<output>
Create `.planning/quick/261011-txc-winetricks-tab-ux-from-the-45-live-gate-/261011-txc-SUMMARY.md` when done.
</output>
