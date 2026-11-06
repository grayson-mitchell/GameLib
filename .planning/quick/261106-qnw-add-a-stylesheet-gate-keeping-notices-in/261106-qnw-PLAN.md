---
phase: quick-261106-qnw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts
autonomous: true
requirements: [QUICK-261106-qnw]

must_haves:
  truths:
    - "The Frontend jest project fails if any rule other than the `.noticeStack` region in NoticeStack/index.scss sets `position: fixed`"
    - "The gate fails if a region/slot/toast-root rule sets position fixed/absolute/sticky or a top/bottom/left/right/inset* anchor"
    - "The Steam countdown bar (`.steamEngineLaunchNoticeBar`, position: absolute inside the position: relative `.noticeStackToast`) passes the gate"
    - "A new non-test caller of renderNoticeSlot (or a new child of AppNoticeStack) whose stylesheet is not in the gate's table fails the gate"
    - "Reintroducing `position: fixed; bottom; right` on `.humbleExpiryToast` makes the gate fail (recorded in SUMMARY, mutation not committed)"
  artifacts:
    - path: "src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts"
      provides: "Stylesheet gate + discovery guard + derived-specimen self-tests"
      contains: "stripSourceComments"
  key_links:
    - from: "noticeStackStylesheetGate.test.ts"
      to: "backend/testUtils/stripSourceComments"
      via: "import { stripSourceComments, stripTrailingLineCommentTs }"
      pattern: "from 'backend/testUtils/stripSourceComments'"
    - from: "noticeStackStylesheetGate.test.ts"
      to: "the three index.scss files"
      via: "readFileSync from repo root"
      pattern: "readFileSync"
---

<objective>
Add a jest source gate (Frontend project, testEnvironment node, no new dependencies) that keeps every
notice inside the shared NoticeStack region: only `.noticeStack` positions itself (`position: fixed`
plus its bottom/right anchor); no slot or toast-root rule positions or anchors itself; inner
decorative elements inside the toast surface (the Steam countdown bar) stay allowed.

Purpose: follow-up to quick 261106-pr4 (e4b4ec81b, 7dc212ce7), which moved the Humble toast into
NoticeStack after it overlapped the Steam notices by positioning itself independently. This gate
stops that regression class from returning silently.
Output: one new test file. No production file changes. The todo
`.planning/todos/pending/2026-11-05-humble-expiry-toast-overlaps-steam-notice-stack.md` stays pending
(its live gate is separate) — do not move or edit it.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/quick/261106-pr4-stack-the-humble-expiry-toast-in-a-share/261106-pr4-SUMMARY.md
@src/frontend/components/UI/NoticeStack/index.tsx
@src/frontend/components/UI/NoticeStack/noticeSlot.tsx
@src/frontend/components/UI/NoticeStack/index.scss
@src/frontend/components/UI/SteamEngineLaunchNotice/index.scss
@src/frontend/components/UI/HumbleExpiryToast/index.scss
@src/backend/testUtils/stripSourceComments.ts
@src/frontend/state/__tests__/steamSyncStatusWiring.test.ts (source-gate idiom + derived-specimen self-test convention; read its header only)

<interfaces>
Facts extracted during planning (executor need not re-derive):

From src/backend/testUtils/stripSourceComments.ts (import path `backend/testUtils/stripSourceComments`,
used this way by ~108 tests including src/frontend/state/__tests__/*):
- `stripSourceComments(source: string): string` — removes `/* */` blocks, then drops WHOLE lines
  starting with `//`, `*` or `/*`. Does NOT strip trailing `// note` after code. SCSS uses the same
  comment syntax, so it handles the scss whole-line `//` comments in all three stylesheets.
- `stripTrailingLineCommentTs(line: string): string` — quote-aware ('/"/`) trailing `//` cutter; apply
  per line after stripSourceComments so a trailing `// position: fixed` note cannot trip or satisfy
  the gate, and `url('https://…')` is not truncated.

Current stylesheet shape (planning-time read):
- NoticeStack/index.scss: `.noticeStack { position: fixed; bottom: var(--space-lg); right: var(--space-lg); … }`;
  `.noticeStackSlot { … &:not(:first-child) {…} > div {…} }`; `.noticeStackSlot--collapsing`;
  `.noticeStackToast { position: relative; overflow: hidden; … }`; `.noticeStackToast--leaving`;
  several `@keyframes` (from/to with transform/opacity/grid-template-rows/margin-top); one
  `@media (prefers-reduced-motion: reduce)` wrapping toast/slot rules.
- SteamEngineLaunchNotice/index.scss: `.steamEngineLaunchNotice--overlay { order: 0; }`; inner classes
  `steamEngineLaunchNoticeIcon/Text/Title/Body/Dismiss` (Dismiss has nested `&:hover`, `&:focus-visible`, `svg`);
  `.steamEngineLaunchNoticeBar { position: absolute; left: 0; right: 0; bottom: 0; … }` (the legitimate
  inner absolute — anchored to `.noticeStackToast`'s position: relative); compound selectors
  `.steamEngineLaunchNotice--paused .steamEngineLaunchNoticeBar` etc.; one `@keyframes`.
- HumbleExpiryToast/index.scss: `.humbleExpiryToast { align-items: center; }` (the toast root) plus inner
  `humbleExpiryToastIcon/Message/Action/Dismiss` and `:hover` rules.

Toast-root classes (what each caller passes as `toastClassName` to renderNoticeSlot):
- HumbleExpiryToast/index.tsx line ~87: `toastClassName: 'humbleExpiryToast'`.
- SteamEngineLaunchNotice/index.tsx: `const TOAST_CLASS = 'steamEngineLaunchNotice'` and modifiers
  `${TOAST_CLASS}--overlay|--paused|--waiting`, joined into `toastClassName`.
So a class is toast-root iff it equals the base or starts with `base + '--'`. `steamEngineLaunchNoticeBar`
(no `--`) is therefore inner. Both callers `import './index.scss'`.

renderNoticeSlot callers today (non-test): SteamEngineLaunchNotice/index.tsx, HumbleExpiryToast/index.tsx
(noticeSlot.tsx defines it). AppNoticeStack in NoticeStack/index.tsx renders `<SteamEngineLaunchNotice />`
and `<HumbleExpiryToast />` inside `<NoticeStack>`.

Prettier: the new test file and the three scss files all report `"ignored": false`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write the NoticeStack stylesheet gate, discovery guard and self-tests</name>
  <files>src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts</files>
  <behavior>
    - Real sources pass: `.noticeStack` is the only `position: fixed`; `.steamEngineLaunchNoticeBar` absolute is allowed.
    - Non-vacuity: the parser reports exactly one fixed declaration (selector `.noticeStack`) and at least one
      absolute declaration (`.steamEngineLaunchNoticeBar`) across the three sheets, and finds `.humbleExpiryToast`,
      `.noticeStackToast`, `.noticeStackSlot > div` as resolved selectors (proves nesting/`&`/`>` resolution works).
    - Containment premise: `.noticeStackToast` declares `position: relative` (inner absolute is only safe because of it).
    - Specimen derived from the real Humble sheet with `position: fixed; bottom: 0; right: 0;` inserted into the
      `.humbleExpiryToast {` block yields violations naming position and both anchors.
    - Specimen derived from the real NoticeStack sheet with `position: absolute;` inserted into the `> div {` block yields a violation.
    - Specimen derived from the real Steam sheet with `position: sticky;` inserted into `.steamEngineLaunchNoticeIcon {` yields a violation (sticky/fixed forbidden even on inner rules).
    - Specimen derived from the real Steam sheet with `top: 0;` inserted into `.steamEngineLaunchNoticeIcon {` (no position absolute in that rule) yields a violation.
    - Specimen with `align-items: center; // position: fixed` (trailing comment) on `.humbleExpiryToast` yields NO violation.
    - Discovery: the set of non-test .ts/.tsx files under src/frontend containing `renderNoticeSlot(` (excluding
      NoticeStack/noticeSlot.tsx) equals the table's component set; every JSX child tag inside `<NoticeStack>` in
      AppNoticeStack resolves to a table entry; each table component imports `'./index.scss'` and contains its root
      base as a quoted literal.
  </behavior>
  <action>
Create the test file following the repo's frontend source-gate idiom (readFileSync from repo root via
`path.resolve(__dirname, …)` or `process.cwd()`, comment stripping via `stripSourceComments` then per-line
`stripTrailingLineCommentTs`, both imported from `backend/testUtils/stripSourceComments`; do not hand-roll a
`/\/\/.*$/` replace). Open with a header doc comment stating WHY (the 261106-pr4 Humble overlap; sketch 006 L1
"one region, no notice positions itself"), what each gate proves, the toast-root vs inner scoping rule, and that
the self-tests use specimens derived from real source by string manipulation (never hand-authored), mirroring
steamSyncStatusWiring.test.ts's anti-vacuity convention. No new dependencies; no postcss/sass import.

Table (hard-coded, the single source of truth): NoticeStack region sheet `src/frontend/components/UI/NoticeStack/index.scss`
with role `region`; slot sheets `SteamEngineLaunchNotice` (tsx + scss, rootBase `steamEngineLaunchNotice`) and
`HumbleExpiryToast` (tsx + scss, rootBase `humbleExpiryToast`) with role `slot`.

Parser (a small pure function in the test file, e.g. `parseScssDeclarations(text) -> {selectors: string[], prop, value}[]`):
walk the stripped text character by character tracking a block stack. On `{`, take the trimmed preamble since the
last `;`/`{`/`}` as the block header: `@keyframes …` blocks and everything inside them are skipped; other `@…` at-rules
(`@media`, `@supports`) are transparent (inherit parent selectors); otherwise split the header on commas and resolve
against the parent selector list by cross-product — replace `&` with the parent selector when present, else join
parent + ' ' + child. On `}` pop. On `;` (or a `}` closing a block that has a pending `prop: value` without `;`), record a
declaration with the current resolved selectors, lowercased prop, trimmed value. Ignore `$var:` and `@include` lines.
Export nothing; keep it inside the test.

Classification: the subject compound of a resolved selector is its last compound after splitting on whitespace and
combinators `>`, `+`, `~`; its classes are `\.([A-Za-z0-9_-]+)` matches (pseudo-classes stripped). For the region sheet
every rule counts as stack-level. For a slot sheet a rule is toast-root when any subject class equals rootBase or starts
with `rootBase + '--'`; otherwise it is inner. Anchor props: top, bottom, left, right, inset, inset-block*, inset-inline*.

Violation rules (`findViolations(sheetRole, rootBase, declarations) -> string[]`, each message naming file, selector,
prop, value):
1. `position: fixed` anywhere, except the region sheet's rule whose only selector is exactly `.noticeStack`.
2. `position: sticky` anywhere.
3. `position: absolute` on any region-sheet rule or any toast-root rule.
4. Anchor props on any region-sheet rule other than `.noticeStack`, and on any toast-root rule.
5. Anchor props on an inner slot rule only when that same rule (same resolved selector) does not also declare
   `position: absolute` — so the Steam bar's left/right/bottom stay allowed, and a stray anchor elsewhere bites.
Also assert `.noticeStack` in the region sheet declares `position: fixed` (the region must still exist) and
`.noticeStackToast` declares `position: relative` (the premise that keeps inner absolutes inside the toast surface).

Discovery guard: recursively list src/frontend with fs.readdirSync (skip `__tests__`, `__mocks__`, node_modules,
`*.test.*`), collect .ts/.tsx files whose stripped source contains `renderNoticeSlot(`, drop
`NoticeStack/noticeSlot.tsx`, and assert the set equals the table's slot components — on failure the message must
tell the reader to add the new caller's stylesheet and rootBase to the table. Also extract the JSX tags between
`<NoticeStack>` and `</NoticeStack>` in NoticeStack/index.tsx, map each tag to its import specifier in that file, and
assert each maps to a table entry. For each slot entry assert its tsx contains `import './index.scss'` and the quoted
literal `'<rootBase>'`.

Self-tests per the behavior list, each specimen built by `String.prototype.replace` on the real file text at a real
anchor (e.g. replace `.humbleExpiryToast {` with `.humbleExpiryToast {\n  position: fixed;\n  bottom: 0;\n  right: 0;`),
and each first asserting the replace actually changed the text (so a renamed anchor fails loudly instead of passing).

Then prove the gate bites against the real file, per the task: edit src/frontend/components/UI/HumbleExpiryToast/index.scss
to add `position: fixed; bottom: var(--space-lg); right: var(--space-lg);` inside `.humbleExpiryToast {`, run the jest
command below, capture the failing output (test name + violation messages) for the SUMMARY, then
`git checkout -- src/frontend/components/UI/HumbleExpiryToast/index.scss` and confirm `git diff --exit-code` on it. Never
commit the mutation. Commit only the new test file.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --check src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts && npx jest --selectProjects Frontend src/frontend/components/UI/NoticeStack/__tests__ && git diff --exit-code -- src/frontend/components/UI/HumbleExpiryToast/index.scss src/frontend/components/UI/SteamEngineLaunchNotice/index.scss src/frontend/components/UI/NoticeStack/index.scss && pnpm codecheck && pnpm lint</automated>
  </verify>
  <done>
New gate passes on the real sources alongside the existing NoticeStack.test.tsx; all self-test specimens produce the
expected violation/no-violation; discovery guard passes; the temporary Humble mutation was shown to fail the gate and
reverted (all three scss files clean in git diff); prettier --check, pnpm codecheck and pnpm lint are green; SUMMARY
records the mutation's failing jest output.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | Test-only change; reads repo source files, no runtime or user input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-qnw-01 | Tampering | gate vacuity (a parser bug that sees no declarations passes everything) | mitigate | non-vacuity assertions (exactly one fixed, at least one absolute, named resolved selectors) and derived specimens that must each change the text before asserting |
| T-qnw-02 | Repudiation | committed mutation | mitigate | `git diff --exit-code` on the three scss files in `<verify>` |
</threat_model>

<verification>
- `npx jest --selectProjects Frontend src/frontend/components/UI/NoticeStack/__tests__` green.
- Mutation run recorded in SUMMARY as failing; scss files unchanged afterwards.
- `pnpm codecheck`, `pnpm lint`, scoped `npx prettier --check` green.
</verification>

<success_criteria>
A notice that positions itself independently of the NoticeStack region (fixed/sticky anywhere, absolute or anchors on
a slot/toast root) fails the Frontend jest project; the legitimate inner countdown bar passes; a new renderNoticeSlot
caller or AppNoticeStack child not registered in the gate fails it.
</success_criteria>

<output>
Create `.planning/quick/261106-qnw-add-a-stylesheet-gate-keeping-notices-in/261106-qnw-SUMMARY.md` when done, including
the failing jest output from the Humble mutation run.
</output>
