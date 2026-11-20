---
phase: quick-261029-ocq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Library/components/GameCard/steamIncompleteCard.ts
  - src/frontend/screens/Library/components/GameCard/__tests__/steamIncompleteCard.test.ts
  - src/frontend/screens/Library/components/GameCard/index.tsx
  - .planning/todos/pending/2026-10-29-steam-gamecard-incomplete-install-label.md
  - .planning/todos/completed/2026-10-29-steam-gamecard-incomplete-install-label.md
  - .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md
autonomous: true
requirements: [D-UAT-12]

must_haves:
  truths:
    - "A Steam game with an incomplete on-disk install (hasStatus status 'notInstalled' + statusContext 'steam-incomplete') shows the hover tooltip 'Resume Install (<title>)' on its library card install button, not 'Install (<title>)'"
    - "The same card shows the 'Resume Install' status text (the label hasStatus already computes) in both grid and list layouts"
    - "The card's right-click context-menu install entry reads 'Resume Install' for that game"
    - "A plain not-installed Steam game, and every non-Steam game, still shows 'Install' with no status pill (no regression)"
  artifacts:
    - path: "src/frontend/screens/Library/components/GameCard/steamIncompleteCard.ts"
      provides: "Pure predicate isSteamIncompleteCard({ runner, status, statusContext })"
      exports: ["isSteamIncompleteCard"]
    - path: "src/frontend/screens/Library/components/GameCard/__tests__/steamIncompleteCard.test.ts"
      provides: "Unit test for the predicate"
    - path: ".planning/todos/completed/2026-10-29-steam-gamecard-incomplete-install-label.md"
      provides: "Closed todo with ## Resolution section"
  key_links:
    - from: "src/frontend/screens/Library/components/GameCard/index.tsx"
      to: "hasStatus statusContext"
      via: "destructure statusContext from hasStatus(gameInfo, size) and pass to isSteamIncompleteCard"
      pattern: "isSteamIncompleteCard\\("
    - from: "src/frontend/screens/Library/components/GameCard/index.tsx"
      to: "gamelib:steam.status.resumeInstall"
      via: "tGamelib for tooltip + context-menu label"
      pattern: "steam\\.status\\.resumeInstall"
---

<objective>
Fix D-UAT-12: the library card shows a plain "Install" for an incomplete Steam install, while the
detail page correctly shows "Resume Install". Make the card mirror the detail page.

Purpose: the card is the first thing a user sees; an incomplete install that reads as "Install" looks
like a from-scratch download (the exact confusion D-UAT-09 fixed on the detail page).
Output: a pure predicate + unit test, GameCard wiring, the todo closed, and the fix recorded on the
UAT finding.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-10-29-steam-gamecard-incomplete-install-label.md
@src/frontend/screens/Library/components/GameCard/index.tsx
@src/frontend/screens/Library/components/GameCard/constants.ts

Load `Skill("gamelib-conventions")` before writing the todo or UAT edits and before running verify.

<interfaces>
Root cause (verified during planning):

- `src/frontend/hooks/hasStatus.ts` (`hasStatus(gameInfo, gameSize)`) returns `{ status, statusContext, folder, label }`.
  Its notInstalled branch (~lines 175-197) sets `statusContext: 'steam-incomplete'` when
  `runner === 'steam' && newGameInfo.install.steamResumePending`, and `label` is then
  "Resume Install" via `getStatusLabel` (`src/frontend/hooks/constants.ts` ~line 75-78, key
  `gamelib:steam.status.resumeInstall`, fallback 'Resume Install').
- GameCard (`index.tsx` line 171) destructures only `{ status, folder, label }` — `statusContext` is dropped.
- `getCardStatus(status, isInstalled, layout)` in `GameCard/constants.ts` computes `haveStatus`;
  `'notInstalled'` is not in its OR-list, so the status pill (`{haveStatus && <span className="gameCardStatus">{label}</span>}`, ~line 559)
  and list-layout `gameListInfo` span (~line 619-628) never render "Resume Install".
- `renderIcon()` not-installed branch (~line 318-326) hardcodes `title={\`${t('button.install')} (${title})\`}` on the `DownIcon` SvgButton.
- Context-menu install item (~line 403-409) hardcodes `label: t('button.install')`.
- `tGamelib` (`useTranslation('gamelib')`) is already in scope (line 116) and used as
  `tGamelib('gamelib:steam.install.withOptionsLabel', 'Install with options…')` — follow that form.
- Detail-page reference: `MainButton.tsx` ~line 280-295 (steam && !is_installed && steamResumePending && !installing && !queued → 'Resume Install');
  `GameStatus.tsx` ~line 244 keys off `statusContext === 'steam-incomplete'`. hasStatus only produces
  status 'notInstalled' when the game is not installing/queued, so `status === 'notInstalled'` covers MainButton's
  `!installing && !queued` guards.

Test harness: frontend jest runs `testEnvironment: node`, no jsdom; GameCard/index.tsx imports `./index.css`
and cannot be required in jest (see `__tests__/cardVisibility.test.ts` header). So the testable unit is a pure
predicate module with no CSS/asset imports — do NOT put it in `GameCard/constants.ts` (that imports an `.svg?url`).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure isSteamIncompleteCard predicate + unit test</name>
  <files>src/frontend/screens/Library/components/GameCard/steamIncompleteCard.ts, src/frontend/screens/Library/components/GameCard/__tests__/steamIncompleteCard.test.ts</files>
  <behavior>
    - runner 'steam', status 'notInstalled', statusContext 'steam-incomplete' → true
    - runner 'steam', status 'notInstalled', statusContext undefined → false (plain not-installed)
    - runner 'steam', status 'installing' (or 'queued'), statusContext 'steam-incomplete' → false
    - runner 'steam', status 'notInstalled', statusContext 'steam-paused' / 'steam-waiting-for-restart' → false
    - runner 'gog' (and 'legendary'), status 'notInstalled', statusContext 'steam-incomplete' → false
    - status undefined → false
  </behavior>
  <action>
    Write the test first (RED), then create `steamIncompleteCard.ts` exporting
    `isSteamIncompleteCard(args: { runner: Runner | string | undefined; status: string | undefined; statusContext: string | undefined }): boolean`
    returning true only when runner === 'steam' AND status === 'notInstalled' AND statusContext === 'steam-incomplete'.
    Import `Runner` type from 'common/types' only (type import; no CSS/asset imports so jest can load it).
    Add a short header comment citing D-UAT-12 and that it mirrors the detail page's
    statusContext 'steam-incomplete' signal (GameStatus.tsx / MainButton.tsx, D-UAT-09) using the value
    hasStatus already threads — single source of truth, no second read of install.steamResumePending.
    Test file header: state what it proves (the predicate) and what it cannot (GameCard is not mountable in
    the node jest env — the wiring is checked by grep in Task 2).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Frontend --runTestsByPath src/frontend/screens/Library/components/GameCard/__tests__/steamIncompleteCard.test.ts && npx prettier --check src/frontend/screens/Library/components/GameCard/steamIncompleteCard.ts src/frontend/screens/Library/components/GameCard/__tests__/steamIncompleteCard.test.ts</automated>
  </verify>
  <done>Test file covers all behavior cases and passes; both files prettier-clean.</done>
</task>

<task type="auto">
  <name>Task 2: Wire the predicate into GameCard (tooltip, context menu, status text)</name>
  <files>src/frontend/screens/Library/components/GameCard/index.tsx</files>
  <action>
    In GameCard/index.tsx:
    1. Line ~171: destructure `statusContext` too: `const { status, statusContext, folder, label } = hasStatus(gameInfo, size)`.
    2. Right after the `getCardStatus(...)` destructure (~line 202), compute
       `const isSteamIncomplete = isSteamIncompleteCard({ runner, status, statusContext })` and
       `const installLabel = isSteamIncomplete ? tGamelib('gamelib:steam.status.resumeInstall', 'Resume Install') : t('button.install')`.
       Import `isSteamIncompleteCard` from './steamIncompleteCard'.
    3. renderIcon() not-installed branch (~line 322): tooltip becomes `${installLabel} (${title})`. Keep the
       `DownIcon` and `downIcon` class and the onClick unchanged (the click already routes Steam to the resume
       install path, same as MainButton). Do not touch the isDelisted early-return.
    4. Context-menu install item (~line 405): `label: installLabel`. Leave the "Install with options…" entry
       and its D-27 comment untouched.
    5. Status text: change the grid pill condition (~line 559) to `(haveStatus || isSteamIncomplete) && <span className="gameCardStatus">{label}</span>`
       and the list-layout `gameListInfo` span condition (~line 619) likewise, with its `active` class set to
       `haveStatus || isSteamIncomplete`. Leave the `gameTitle`/`runner` spans' `active: haveStatus` alone.
       `label` is already "Resume Install" from hasStatus for this state — do not recompute it.
       Do NOT add 'notInstalled' to getCardStatus's haveStatus (that would put a "Not installed" pill on every
       uninstalled card).
    Do not add new eslint warnings (the production lint ceiling was just re-pinned in 06572d835).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && f=src/frontend/screens/Library/components/GameCard/index.tsx && grep -c "isSteamIncompleteCard(" $f && grep -c "steam.status.resumeInstall" $f && test "$(grep -c 'haveStatus || isSteamIncomplete' $f)" -ge 2 && npx tsc --noEmit -p . && npx eslint $f src/frontend/screens/Library/components/GameCard/steamIncompleteCard.ts && npx jest --selectProjects Frontend --runTestsByPath src/frontend/screens/Library/components/GameCard/__tests__/steamIncompleteCard.test.ts && npx prettier --check $f</automated>
  </verify>
  <done>Card tooltip, context-menu install label, and status text read "Resume Install" for a steam-incomplete game; typecheck, eslint, test and prettier pass.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo and record the fix on D-UAT-12</name>
  <files>.planning/todos/pending/2026-10-29-steam-gamecard-incomplete-install-label.md, .planning/todos/completed/2026-10-29-steam-gamecard-incomplete-install-label.md, .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md</files>
  <action>
    Mirror quick-261029-o5a's close of D-UAT-11 (commit 479322d5d):
    1. `git mv` the todo from `.planning/todos/pending/` to `.planning/todos/completed/` (same filename),
       keep its frontmatter byte-identical (severity/platform/ready lines unchanged), and append a
       `## Resolution` section: fix commit (Task 2's hash, quick-261029-ocq); root cause (GameCard dropped
       hasStatus's statusContext; tooltip and context-menu hardcoded button.install; haveStatus excludes
       notInstalled so the "Resume Install" label never rendered); fix (isSteamIncompleteCard predicate drives
       tooltip, menu label and status text); status: code fix only, not live re-tested on Windows.
    2. In 21-UAT.md frontmatter `open_findings`, change only the D-UAT-12 entry to
       `D-UAT-12 (MINOR open — library card shows plain Install for an incomplete install; code fix <hash> quick-261029-ocq, awaiting Windows re-test)`.
    3. In the D-UAT-12 blockquote (~line 714-723), replace "Code-localized, not yet fixed:" wording minimally if needed and append
       `>` + `> **Code fix (quick-261029-ocq, <hash>, 2026-10-29):** ...` one paragraph: what changed and how to re-verify
       (incomplete Steam install → card tooltip "Resume Install (<title>)", "Resume Install" status text, context menu
       "Resume Install"); finding stays MINOR open until re-tested. Do not touch any `### N.` item heading,
       `expected:` or `result:` line (UAT item shape convention). Both .planning paths are prettier-ignored
       (checked with `npx prettier --file-info`: ignored: true), so no prettier check is carried for this task.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test ! -e .planning/todos/pending/2026-10-29-steam-gamecard-incomplete-install-label.md && grep -c "## Resolution" .planning/todos/completed/2026-10-29-steam-gamecard-incomplete-install-label.md && grep -c "quick-261029-ocq" .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md && pnpm planning-gates</automated>
  </verify>
  <done>Todo lives in completed/ with a Resolution section; D-UAT-12 in 21-UAT.md (frontmatter + finding body) records the code fix and awaits Windows re-test; planning-gates passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | Display-only label change in the renderer; no new input, IPC or process boundary |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261029-ocq-01 | Spoofing (UI) | GameCard install label | accept | Label derives from the existing hasStatus statusContext; click handler unchanged, so the label cannot misroute an action |
</threat_model>

<verification>
- `npx jest --selectProjects Frontend --runTestsByPath src/frontend/screens/Library/components/GameCard/__tests__/steamIncompleteCard.test.ts` passes
- `npx tsc --noEmit -p .` clean; eslint on touched files adds no warnings
- Manual (later, Windows UAT re-test): incomplete Steam install card shows "Resume Install" tooltip/status/menu
</verification>

<success_criteria>
- Card for a steam-incomplete game reads "Resume Install" (tooltip, status text, context menu); all other cards unchanged
- Todo moved to completed/ with Resolution; D-UAT-12 records the code fix, still MINOR open pending re-test
</success_criteria>

<output>
Create `.planning/quick/261029-ocq-d-uat-12-library-card-shows-install-for-/261029-ocq-SUMMARY.md` when done
</output>
