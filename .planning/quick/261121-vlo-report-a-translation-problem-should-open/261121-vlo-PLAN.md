---
phase: quick-261121-vlo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 (tracer)
  - src/frontend/components/UI/LanguageSelector/translationIssue.ts
  - src/frontend/components/UI/LanguageSelector/__tests__/translationIssue.test.ts
  - src/frontend/components/UI/LanguageSelector/index.tsx
  - src/frontend/screens/Settings/sections/ReportProblem/index.tsx
  - src/frontend/screens/Settings/sections/ReportProblem/__tests__/ReportProblem.test.tsx
  # Task 2
  - src/frontend/components/UI/LanguageSelector/__tests__/reportLinkWiring.test.ts
  - .planning/todos/pending/2026-11-21-translation-report-link-use-in-app-issue-form.md
  - .planning/todos/completed/2026-11-21-translation-report-link-use-in-app-issue-form.md
autonomous: true
requirements:
  - QUICK-261121-vlo

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "In any non-English UI language, activating 'Report a translation problem' (click, Enter or Space) opens Settings > Report a problem inside GameLib. No browser opens and no GitHub page loads"
    - "The form's 'What happened?' box arrives prefilled with '[Translation] <label> (<code>): ', for example '[Translation] Deutsch (de): ', and the user can type after it and Send"
    - "The game page's 'Report a problem' link still preselects its game, and the form opened with no route state still starts empty"
    - "No GitHub issue URL builder or GitHub URL remains in the LanguageSelector folder, and shouldShowMtNotice behaves exactly as before"
    - "The todo sits in .planning/todos/completed/ with its frontmatter unchanged and a Resolution section that names the retired Phase 83 live-gate subject"
  artifacts:
    - path: src/frontend/components/UI/LanguageSelector/translationIssue.ts
      provides: "shouldShowMtNotice (unchanged), buildTranslationReportMessage(code, label), reportTranslationProblem(navigate, code, label)"
      contains: "/settings/report"
    - path: src/frontend/screens/Settings/sections/ReportProblem/index.tsx
      provides: "route-state reportMessage seeds the message textarea's initial state"
      contains: "reportMessage"
    - path: src/frontend/components/UI/LanguageSelector/__tests__/reportLinkWiring.test.ts
      provides: "comment-stripped source pin that the link navigates in-app and never opens an external URL"
    - path: .planning/todos/completed/2026-11-21-translation-report-link-use-in-app-issue-form.md
      provides: "closed todo with a Resolution section"
  key_links:
    - from: src/frontend/components/UI/LanguageSelector/index.tsx
      to: src/frontend/components/UI/LanguageSelector/translationIssue.ts
      via: "handleReportTranslationProblem calls reportTranslationProblem(navigate, currentLanguage, label), with navigate from useNavigate()"
    - from: src/frontend/components/UI/LanguageSelector/translationIssue.ts
      to: src/frontend/screens/Settings/sections/ReportProblem/index.tsx
      via: "navigate('/settings/report', { state: { reportMessage } }) is read back as location.state.reportMessage, then becomes useState's initial message"
    - from: src/frontend/screens/Settings/sections/ReportProblem/index.tsx
      to: src/frontend/App.tsx
      via: "route 'settings/:type' with Settings/index.tsx checking type === 'report' (existing; the target the game page link already uses)"
---

<objective>
Point the machine-translation notice's "Report a translation problem" link at GameLib's own in-app
report form (Settings > Report a problem, route `/settings/report`) with the language prefilled,
instead of a GitHub new-issue page.

Purpose: the operator found during the Phase 83 live gate (83-11 item 3) that a signed-out user lands on
GitHub's sign-in page: "only a small % of users will know what github is". The orchestrator settled the
todo's open design question: drop GitHub for this link entirely, with no secondary option.

Output: a pure prefill/navigate helper in `translationIssue.ts` replacing the URL builder; LanguageSelector
navigating through `useNavigate`; ReportProblem seeding its message from route state; tests on both
halves plus a cross-half contract test; a source-scan wiring pin; the todo moved to `completed/`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-11-21-translation-report-link-use-in-app-issue-form.md
@src/frontend/components/UI/LanguageSelector/index.tsx
@src/frontend/components/UI/LanguageSelector/translationIssue.ts
@src/frontend/components/UI/LanguageSelector/__tests__/translationIssue.test.ts
@src/frontend/screens/Settings/sections/ReportProblem/index.tsx
@src/frontend/screens/Settings/sections/ReportProblem/__tests__/ReportProblem.test.tsx
@src/frontend/screens/Game/GamePage/components/ReportIssue.tsx
@src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts

## Facts verified at planning time (HEAD c14ece74d); do not re-derive

- **Precedent to copy:** `ReportIssue.tsx` calls `navigate('/settings/report', { state: { reportGame: ... } })`.
  ReportProblem reads `location.state?.reportGame` as `unknown` and uses it only when it is a string.
- **Router context:** LanguageSelector renders in `GeneralSettings` (under route `settings/:type`) and in
  `screens/Login/index.tsx` (route `login`). Both are children of the one `createHashRouter` root in
  `src/frontend/App.tsx`, and Login already calls `useNavigate()` itself. `useNavigate` in LanguageSelector is safe.
- **No test renders LanguageSelector.** The four tests that mention it or GeneralSettings
  (`loginInFlightUiReachability`, `gameStartWindowSetting`, `windowSettingsPlacement`, `tourContextSuppression`)
  are source scans or never reach it. Adding `useNavigate` breaks no existing suite.
- **Test harness:** no jsdom. ReportProblem.test.tsx calls the component as a plain function with a
  slot-based `useState` fake. `react-router-dom` is jest-mocked there (`useLocation` returns `mockLocationState`),
  so `useLocation()` takes no hook slot. Moving it above the `message` useState leaves every slot index unchanged.
- **jest.mock ceiling (`pnpm backend-di-ceilings`, shrink-only, covers every .ts/.tsx under src/):**
  ReportProblem.test.tsx is pinned at exactly 5 calls. Growing or shrinking it fails. A new test file with any
  jest.mock call and no shard entry fails as a "new violation". So: add **no** jest.mock call anywhere and remove none.
  That command is **already red at HEAD** for three unrelated src/backend steam tests, so the gates below grep
  its output for this plan's paths (HEAD=0 lines) instead of trusting its exit code.
- **knip ratchet (`pnpm find-deadcode`, PASS at HEAD):** exports used only by test files count as used (jest
  plugin; test files are entries). An exported TYPE used only in its own file IS a finding. Keep the navigate
  parameter type module-private.
- **i18n gate:** `LanguageSelector/index.tsx` and `translationIssue.ts` are in `DECLARED_UNSCANNED_DEBT`
  (`meta/__tests__/genI18nGateScope.test.ts`). The ratchet is set-based (file membership, not violation count),
  so the change needs no meta edit. `ReportProblem/index.tsx` IS in the scanned scope; this plan adds no
  user-facing literal to it. New `__tests__/` files never enter either i18n artifact. No new i18n keys.
- **Lint:** `pnpm lint` exits 0 at HEAD (production 949/1130, tests 628/661, ~41 s). Scoped
  `npx eslint` over the five Task 1 files reports exactly 10 warnings at HEAD (9 in ReportProblem.test.tsx,
  1 exhaustive-deps in ReportProblem/index.tsx).
- **Prettier:** all six src paths report `"ignored": false` (typescript). Both todo paths report
  `"ignored": true`, so the formatter check is omitted for them on purpose.
- **Working tree:** unrelated in-flight Phase 100 and .planning files are dirty. Stage ONLY this plan's
  paths, by explicit pathspec. Never `git add -A` or `git add .`, and never `gsd-tools commit` without `--files`
  (it sweeps all dirty .planning). Do not touch `.planning/STATE.md` or `.planning/state.json`; the orchestrator owns them.
</context>

<!-- planner-discipline-allow: openExternalUrl -->
<!-- planner-discipline-allow: buildTranslationIssueUrl -->
<!-- planner-discipline-allow: GAMELIB_ISSUES_NEW_URL -->
<!-- planner-discipline-allow: TRANSLATION_ISSUE_TEMPLATE -->
<!-- planner-discipline-allow: github.com -->

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: End-to-end "Report a translation problem" opens the prefilled in-app form (one path)</name>
  <files>src/frontend/components/UI/LanguageSelector/translationIssue.ts, src/frontend/components/UI/LanguageSelector/__tests__/translationIssue.test.ts, src/frontend/components/UI/LanguageSelector/index.tsx, src/frontend/screens/Settings/sections/ReportProblem/index.tsx, src/frontend/screens/Settings/sections/ReportProblem/__tests__/ReportProblem.test.tsx</files>
  <precondition>`git status --porcelain -- src/frontend/components/UI/LanguageSelector src/frontend/screens/Settings/sections/ReportProblem` prints nothing (these paths were clean at planning; another session's edits here mean halt and report).</precondition>
  <behavior>
    translationIssue.test.ts (keep the seven shouldShowMtNotice cases byte-identical; replace the whole URL-builder describe):
    - buildTranslationReportMessage('de', 'Deutsch') returns exactly '[Translation] Deutsch (de): ' (one trailing space)
    - buildTranslationReportMessage('nb_NO', 'bokmål') returns '[Translation] bokmål (nb_NO): '
    - a label holding markup or URL-special characters (e.g. '<b>x</b>&#?') comes back verbatim inside the same shape. Nothing is escaped, encoded or dropped (React escapes at render)
    - reportTranslationProblem(navigate, 'de', 'Deutsch') calls navigate exactly once, with '/settings/report' and { state: { reportMessage: '[Translation] Deutsch (de): ' } }, and returns undefined
    ReportProblem.test.tsx (existing nine cases unchanged):
    - route state { reportMessage: '[Translation] Deutsch (de): ' } seeds the report-message textarea value
    - a non-string reportMessage (42, and an object) leaves the textarea ''
    - route state carrying both reportGame 'steam/70' and a reportMessage applies both
    - no route state: the textarea is '' (add this assertion to the existing "defaults to no game" case or a sibling case)
    - CONTRACT (the two halves end to end): import the real reportTranslationProblem from 'frontend/components/UI/LanguageSelector/translationIssue', call it with a capturing navigate, assert the captured target is '/settings/report', set mockLocationState to the captured options.state, render, and assert the textarea equals '[Translation] Deutsch (de): '. Then type the prefill plus 'the Save button is cut off', render, click Send, flush, and assert mockSubmit received message '[Translation] Deutsch (de): the Save button is cut off'
  </behavior>
  <action>
RED first. Write the behavior cases above, run the jest command from verify, confirm they fail (missing
exports, empty textarea), and commit only the two test files: `test(quick-261121-vlo): add failing tests for the in-app translation report prefill`.
Type the capturing navigate so its calls are not `any`. @types/jest is 29.5.14, so use
`jest.fn<void, [string, { state: { reportMessage: string } }]>()`. That adds no new unsafe-* lint warnings.
Add no jest.mock call to either test file (see the ceiling fact in context). The contract case reuses the file's
existing `react-router-dom` mock by assigning `mockLocationState`.

GREEN, translationIssue.ts. Delete `GAMELIB_ISSUES_NEW_URL`, `TRANSLATION_ISSUE_TEMPLATE` and
`buildTranslationIssueUrl` with their doc comments. Keep `shouldShowMtNotice` and its doc comment unchanged. Add:
- a module-private const for the route `'/settings/report'`, the same target ReportIssue.tsx uses
- a module-private navigate type: a function taking `(to: string, options: { state: { reportMessage: string } }) => void`.
  It must not be exported (knip flags an exported type used only in its own file). React Router's `NavigateFunction`
  is assignable to it, so the file still imports nothing from React or the router.
- exported `buildTranslationReportMessage(code: string, label: string): string`, returning
  `[Translation] ${label} (${code}): `. Same `[Translation]` tag the old issue title used; code added so the report
  names the shipped locale even when the label is ambiguous.
- exported `reportTranslationProblem(navigate, code, label): void`, which calls navigate once with the route const and
  `{ state: { reportMessage: buildTranslationReportMessage(code, label) } }`.
Rewrite the file header: same purity note (no React, no i18next, no window/DOM). Replace the T-88h-01 paragraph with
the new invariant. The prefill is a plain string that reaches the report form only through in-app router state, is
used solely as a React-controlled textarea's initial value, and is never parsed as HTML or as a URL. Describe the
removed GitHub path by concept ("the former GitHub new-issue link"). Never name the deleted identifiers, the old
host, or the IPC call in any comment. The verify gates grep for them.

GREEN, LanguageSelector/index.tsx. Import `useNavigate` from 'react-router-dom'. Call `const navigate = useNavigate()`
beside the other top-of-component hooks, before any conditional. Change the './translationIssue' import to
`reportTranslationProblem, shouldShowMtNotice`. `handleReportTranslationProblem`'s whole body becomes
`reportTranslationProblem(navigate, currentLanguage, label)`, which deletes the `window.api` external-URL call.
Leave the anchor (role="button", tabIndex 0, onClick, onKeyDown with Enter/Space) and its keydown handler exactly as
they are. Append one sentence to the comment block above `afterSelect`: quick 261121-vlo routes the report link to
the in-app report form (Settings > Report a problem) with the language prefilled, instead of GitHub. Follow the
same comment rule as above.

GREEN, ReportProblem/index.tsx. Widen the location cast to `{ state?: { reportGame?: unknown; reportMessage?: unknown } | null }`.
Move the `useLocation()` line, with its comment, above `const [message, setMessage]`. Seed message with
`useState(typeof initialMessage === 'string' ? initialMessage : '')`, where `initialMessage = location.state?.reportMessage`,
the same defensive `typeof` shape as `initialGame`. Reword the comment: the game page's link preselects the game,
and the language picker's "Report a translation problem" link prefills the message, both through route state.
Change nothing else. Discretion, documented: `canSend` keeps its existing non-whitespace rule, so the prefill alone
enables Send. A report naming only the language still identifies it, and changing Send's rule is outside this
todo. The success path still clears message to ''. No new user-facing literal goes into this file, because it is in
the scanned i18n scope.

Run verify. Commit only the five files, by explicit pathspec: `feat(quick-261121-vlo): report a translation problem opens the in-app report form, prefilled`.
  </action>
  <verify>
    <automated>npx jest --runTestsByPath src/frontend/components/UI/LanguageSelector/__tests__/translationIssue.test.ts src/frontend/screens/Settings/sections/ReportProblem/__tests__/ReportProblem.test.tsx && pnpm -s codecheck && { git grep -nE 'buildTranslationIssueUrl|GAMELIB_ISSUES_NEW_URL|TRANSLATION_ISSUE_TEMPLATE' -- src; test $? -eq 1; } && { git grep -n 'github.com' -- src/frontend/components/UI/LanguageSelector/translationIssue.ts src/frontend/components/UI/LanguageSelector/__tests__/translationIssue.test.ts; test $? -eq 1; } && test "$(grep -vE '^\s*(//|\*|/\*|\{/\*)' src/frontend/components/UI/LanguageSelector/index.tsx | grep -c 'openExternalUrl')" -eq 0 && test "$(grep -c 'useNavigate()' src/frontend/components/UI/LanguageSelector/index.tsx)" -eq 1 && test "$(grep -c 'reportMessage' src/frontend/screens/Settings/sections/ReportProblem/index.tsx)" -ge 2 && D="${TMPDIR:-/tmp}/gamelib-261121-vlo-di.log" && { pnpm -s backend-di-ceilings > "$D" 2>&1; grep -qE '^(FAIL: |backend-di-ceilings: PASS)' "$D"; } && { ! grep -E 'LanguageSelector|ReportProblem' "$D"; } && F="src/frontend/components/UI/LanguageSelector/translationIssue.ts src/frontend/components/UI/LanguageSelector/__tests__/translationIssue.test.ts src/frontend/components/UI/LanguageSelector/index.tsx src/frontend/screens/Settings/sections/ReportProblem/index.tsx src/frontend/screens/Settings/sections/ReportProblem/__tests__/ReportProblem.test.tsx" && npx eslint --max-warnings 10 $F && for f in $F; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || { echo "ignored: $f"; exit 1; }; done && npx prettier --check $F</automated>
    <baselines>
      - removed-identifier git grep hit lines over src [HEAD=22 EXPECT==0 @c14ece74d]
      - 'github.com' hit lines in translationIssue.ts plus its test [HEAD=2 EXPECT==0 @c14ece74d]
      - non-comment openExternalUrl lines in LanguageSelector/index.tsx [HEAD=1 EXPECT==0 @c14ece74d]
      - useNavigate() lines in LanguageSelector/index.tsx [HEAD=0 EXPECT==1 @c14ece74d]
      - reportMessage lines in ReportProblem/index.tsx [HEAD=0 EXPECT>=2 @c14ece74d]
      - jest passing cases across the two suites [HEAD=25 EXPECT>25 @c14ece74d]
      - backend-di-ceilings output lines naming LanguageSelector or ReportProblem [HEAD=0 EXPECT==0 @c14ece74d GUARD MUTATION: one jest.mock call added to translationIssue.test.ts prints "new violation" naming it]. The command's own exit code is non-zero at HEAD for three unrelated src/backend steam tests, so the gate first proves the census ran (a FAIL: or PASS line) and then greps.
      - scoped eslint warnings over the five files [HEAD=10 EXPECT<=10 @c14ece74d GUARD MUTATION: an untyped jest.fn() capture read through mock.calls adds no-unsafe-member-access warnings]
    </baselines>
    <fails_when>non-zero exit; a jest case fails; codecheck prints "error TS"; either git grep finds a hit; the openExternalUrl count is above 0; useNavigate() count is not 1; reportMessage count is below 2; the ceiling log has neither a "FAIL: " nor a PASS line (the census crashed), or names LanguageSelector or ReportProblem ("grew", "shrank" or "new violation"); eslint reports an error or more than 10 warnings; prettier prints "Code style issues found" or "ignored: &lt;path&gt;"</fails_when>
  </verify>
  <done>Clicking or keyboard-activating the link navigates to /settings/report with state.reportMessage '[Translation] &lt;label&gt; (&lt;code&gt;): ', and ReportProblem seeds its textarea from that string, proven by the contract test through to a submitted message. The GitHub URL builder and its constants are gone from src. The jest.mock ceiling counts for both test files are unchanged. RED and GREEN commits each contain only their named paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Pin the link's in-app wiring with a source scan, run the repo gates, close the todo</name>
  <files>src/frontend/components/UI/LanguageSelector/__tests__/reportLinkWiring.test.ts, .planning/todos/pending/2026-11-21-translation-report-link-use-in-app-issue-form.md, .planning/todos/completed/2026-11-21-translation-report-link-use-in-app-issue-form.md</files>
  <behavior>
    reportLinkWiring.test.ts. Every source goes through stripSourceComments first, so prose can neither trip nor hide a gate:
    - LanguageSelector/index.tsx imports useNavigate from 'react-router-dom' and calls useNavigate() exactly once
    - its report handler calls reportTranslationProblem(navigate, currentLanguage, label)
    - the anchor still binds onClick={handleReportTranslationProblem} and onKeyDown={handleReportTranslationProblemKeyDown} (keyboard path kept)
    - the external-URL IPC pattern matches nothing in index.tsx, and the GitHub host pattern and the issues/new path match nothing in translationIssue.ts
    - SANITY (non-vacuity): each hoisted absence pattern DOES match a positive fixture string, so a broken regex cannot make the absence checks pass by accident
    - reachability: translationIssue.ts contains the literal '/settings/report'; App.tsx declares both path 'login' and path 'settings/:type'; Settings/index.tsx checks type === 'report'
  </behavior>
  <action>
Create `src/frontend/components/UI/LanguageSelector/__tests__/reportLinkWiring.test.ts` in the house source-scan
style of `downloadManagerLayout.test.ts`. That means `readFileSync` and `join` from fs/path, `stripSourceComments`
from 'backend/testUtils/stripSourceComments', and the absence patterns hoisted to module consts that both the
prohibition and its SANITY counter-test consume. Resolve paths from `__dirname`. `src/frontend` is
`join(__dirname, '../../../..')`, which reaches LanguageSelector/index.tsx, LanguageSelector/translationIssue.ts,
App.tsx and screens/Settings/index.tsx. Build the GitHub-host SANITY fixture so this test file never contains the
plain host spelling or any removed identifier name. Concatenating two string halves is enough, and it keeps
Task 1's repo-wide git grep gate true. Add a short header comment: what the scan proves, and that the
no-jsdom harness is why it is a source scan. No jest.mock call (ceiling fact in context). Write it RED-first
against a deliberately wrong expectation only if useful; otherwise it passes on the Task 1 tree. Commit it by
pathspec: `test(quick-261121-vlo): pin the translation report link's in-app wiring`.

Close the todo. Run `git mv .planning/todos/pending/2026-11-21-translation-report-link-use-in-app-issue-form.md .planning/todos/completed/`.
Keep every frontmatter line byte-identical, including `ready: human`. Append a `## Resolution` section in the
style of `.planning/todos/completed/2026-11-21-migrate-filestore-test-mocks-then-delete-filestore.md`:
- the resolving quick task and commit hashes
- the design call: the orchestrator relayed the operator's choice to drop GitHub for this link entirely, with the quote
- the link now navigates to Settings > Report a problem with the message prefilled as '[Translation] &lt;label&gt; (&lt;code&gt;): '
- the Phase 83 live gate's test subject for the external-URL IPC channel is gone, so a later live gate exercising
  that channel needs a different subject. Candidates measured at planning: the CrossOver link in
  `src/frontend/components/UI/WelcomeModal/index.tsx` and in
  `src/frontend/screens/Game/GamePage/components/EngineNotices.tsx`, and the NativePortInfo entry link
- `.github/ISSUE_TEMPLATE/translation_problem.yaml` is left in place for people who file directly on GitHub. Nothing in the app links to it any more.
Commit both sides of the move by explicit pathspec: `docs(quick-261121-vlo): close the translation-report-link todo`.
  </action>
  <verify>
    <automated>npx jest --runTestsByPath src/frontend/components/UI/LanguageSelector/__tests__/reportLinkWiring.test.ts src/frontend/components/UI/LanguageSelector/__tests__/translationIssue.test.ts src/frontend/screens/Settings/sections/ReportProblem/__tests__/ReportProblem.test.tsx && pnpm -s codecheck && pnpm -s find-deadcode && pnpm -s lint && D="${TMPDIR:-/tmp}/gamelib-261121-vlo-di.log" && { pnpm -s backend-di-ceilings > "$D" 2>&1; grep -qE '^(FAIL: |backend-di-ceilings: PASS)' "$D"; } && { ! grep -E 'LanguageSelector|ReportProblem' "$D"; } && { git grep -nE 'buildTranslationIssueUrl|GAMELIB_ISSUES_NEW_URL|TRANSLATION_ISSUE_TEMPLATE' -- src; test $? -eq 1; } && test ! -e .planning/todos/pending/2026-11-21-translation-report-link-use-in-app-issue-form.md && grep -q '^## Resolution' .planning/todos/completed/2026-11-21-translation-report-link-use-in-app-issue-form.md && grep -q '^ready: human$' .planning/todos/completed/2026-11-21-translation-report-link-use-in-app-issue-form.md && pnpm -s planning-gates && F="src/frontend/components/UI/LanguageSelector/__tests__/reportLinkWiring.test.ts" && npx eslint --max-warnings 0 $F && for f in $F; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || { echo "ignored: $f"; exit 1; }; done && npx prettier --check $F # both todo paths are prettier-ignored (.planning), so they are excluded on purpose</automated>
    <baselines>
      - reportLinkWiring.test.ts [HEAD=absent EXPECT==present @c14ece74d]
      - pending todo file [HEAD=present EXPECT==absent @c14ece74d]
      - `grep -c '^## Resolution'` on the completed todo path [HEAD=error:2 EXPECT==1 @c14ece74d]
      - removed-identifier git grep hit lines over src, now including the new test [HEAD=22 EXPECT==0 @c14ece74d]
      - find-deadcode baselined findings [HEAD=312 EXPECT==312 @c14ece74d GUARD MUTATION: exporting the module-private navigate type from translationIssue.ts prints "new knip finding"]
      - pnpm lint tests-scope warnings [HEAD=628 EXPECT<=661 @c14ece74d GUARD MUTATION: 34 or more new test-file warnings print the tests FAIL line]
      - planning-gates passed [HEAD=12 EXPECT==12 @c14ece74d GUARD MUTATION: a todo left in pending/ without its ready: line fails todo-frontmatter-gate.py]
      - backend-di-ceilings output lines naming LanguageSelector or ReportProblem [HEAD=0 EXPECT==0 @c14ece74d GUARD MUTATION: any jest.mock call in reportLinkWiring.test.ts prints "new violation" naming it]
    </baselines>
    <fails_when>non-zero exit; a jest case fails; codecheck prints "error TS"; find-deadcode prints "new knip finding" or "remove this line"; lint prints FAIL for either scope; the ceiling log shows no FAIL:/PASS line, or names LanguageSelector or ReportProblem; the git grep finds a removed identifier anywhere under src (including the new test); the pending todo still exists, or the completed one lacks a Resolution heading or its ready line; planning-gates prints a FAIL line; eslint warns on the new test; prettier prints "Code style issues found" or "ignored: &lt;path&gt;"</fails_when>
  </verify>
  <done>The wiring test passes and proves the link calls the navigate helper, keeps its keyboard path, and has no external-URL call or GitHub host. Its SANITY cases prove the patterns can match. knip, lint, typecheck and planning gates are green. The todo is in completed/ with unchanged frontmatter and a Resolution section. Each commit contains only its named paths.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| in-app router state to ReportProblem | `location.state` is typed `unknown`. Only in-app `navigate()` calls set it; with createHashRouter it lives in history state, not in the URL |
| ReportProblem to report service | the user-reviewed message (now possibly prefilled) leaves the machine on Send, through the existing submitReport path |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-vlo-01 | Tampering | ReportProblem route-state read | low | mitigate | `reportMessage` is read as `unknown` and used only when `typeof === 'string'` (same shape as `reportGame`). It becomes a React-controlled textarea `value`, which React escapes. It is never HTML and never a URL. Task 1's non-string cases (42, an object) pin the guard. |
| T-vlo-02 | Information Disclosure | prefilled report content | low | accept | The prefill adds only the UI language label and code, which the user sees and can edit before an explicit Send. Diagnostics redaction and the "What will be sent" preview are untouched. |
| T-vlo-03 | Tampering | shared working tree with in-flight Phase 100 work | medium | mitigate | Task 1's precondition requires this plan's src paths to be clean. Every commit uses explicit pathspecs (never `git add -A` or `.`, never an unscoped `gsd-tools commit`). STATE.md and state.json are not touched. |
| T-vlo-04 | Spoofing | former external report link | low | mitigate | The external hop is removed, so its query-injection threat (old T-88h-01) retires with the URL builder. Task 2's wiring scan, with SANITY non-vacuity, fails if an external-URL call or the GitHub host returns. |
| T-vlo-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed, added or upgraded. `react-router-dom` is already a dependency, used by ReportIssue.tsx and Login. The legitimacy gate has nothing to check. |
</threat_model>

<verification>
- Both tasks' automated blocks exit 0, run in order on the final tree.
- Once, after Task 2 (too slow for a per-task gate: about 3 minutes at planning, 178 passing at HEAD), run
  `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/hardcodedStringGate.test.ts`. It must still pass,
  because `ReportProblem/index.tsx` is in that gate's scanned scope. Record the result in the SUMMARY.
- `git log --stat -4` shows four commits (RED test, GREEN feat, wiring test, todo close), each touching only its named paths. No unrelated Phase 100 file appears in any of them.
- Live (operator, optional, not a gate): in a non-English language, Settings > General > "Report a translation problem" lands on Settings > Report a problem with '[Translation] &lt;label&gt; (&lt;code&gt;): ' in the box. No browser opens. Repeat from the Login screen's picker.
</verification>

<success_criteria>
- The link navigates in-app to /settings/report. No GitHub URL is built anywhere under src/frontend/components/UI/LanguageSelector.
- ReportProblem seeds its message from route state `reportMessage` (string only) and still preselects `reportGame`.
- The contract test proves that the navigate helper's state, fed to ReportProblem, produces the prefilled textarea and a submitted message.
- jest.mock ceilings, knip ratchet, lint ceilings, typecheck and planning gates stay green for this plan's files.
- The todo is moved to completed/ with a Resolution section.
</success_criteria>

<output>
Create `.planning/quick/261121-vlo-report-a-translation-problem-should-open/261121-vlo-SUMMARY.md` when done. It must state:
- that the Phase 83 live gate's external-URL test subject (this link) is gone, with the candidate replacements listed in the todo's Resolution
- the canSend discretion (the prefill alone enables Send)
- that `.github/ISSUE_TEMPLATE/translation_problem.yaml` was left in place
- that no i18n key or i18n gate artifact changed
</output>
