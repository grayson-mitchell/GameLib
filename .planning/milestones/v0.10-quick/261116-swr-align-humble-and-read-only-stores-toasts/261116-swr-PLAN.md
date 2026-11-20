---
phase: quick-261116-swr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/NoticeStack/index.scss
  - src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.scss
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
  - src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/launchNoticeThemeTokens.test.ts
  - src/frontend/components/UI/ReadOnlyStoresNotice/index.scss
  - src/frontend/components/UI/ReadOnlyStoresNotice/index.tsx
  - src/frontend/components/UI/HumbleExpiryToast/index.scss
  - src/frontend/components/UI/HumbleExpiryToast/index.tsx
  - src/frontend/components/UI/HumbleExpiryToast/__tests__/humbleExpiryToastSuppression.test.tsx
  - public/locales/en/translation.json
  - src/frontend/dev/noticePreview.ts
  - src/frontend/dev/__tests__/noticePreview.test.ts
  - .claude/skills/sketch-findings-gamelib/references/notices-and-toasts.md
autonomous: true
requirements: [QUICK-261116-SWR]

must_haves:
  truths:
    - "All three notices (Steam launch, read-only stores, Humble expiry) render their icon, title and body through the same shared region classes, so they share one icon size and colour and one type scale"
    - "The Humble toast shows the title 'Humble Bundle session expired', the body 'Reconnect to keep your keys in sync.' and an accent-outlined 'Reconnect' button"
    - "The Login screen's 'Session expired — Reconnect' label (login.humble_reconnect) is unchanged"
    - "A notice that restyles its own icon, text, title, body or action, or drops a shared class, fails noticeStackStylesheetGate"
    - "The stripe and the Steam countdown bar stay --status-warning; no literal colours are added"
    - "In dev, __gamelibNotices.all() puts all three notices on screen together"
  artifacts:
    - path: "src/frontend/components/UI/NoticeStack/index.scss"
      provides: "Shared .noticeStackIcon, .noticeStackText, .noticeStackTitle, .noticeStackBody, .noticeStackAction"
      contains: ".noticeStackAction {"
    - path: "src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts"
      provides: "Shared icon/text/action gate per slot, with a derived-specimen self-test"
      contains: "noticeStackIcon"
    - path: "src/frontend/dev/noticePreview.ts"
      provides: "readOnly() and all() preview triggers"
      contains: "handleReadOnlyStoresNoticeSignal"
  key_links:
    - from: "src/frontend/components/UI/HumbleExpiryToast/index.tsx"
      to: "public/locales/en/translation.json"
      via: "t('login.humble_expired_title' / 'login.humble_expired_body' / 'login.humble_reconnect_short')"
      pattern: "humble_expired_title|humble_expired_body|humble_reconnect_short"
    - from: "src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/launchNoticeThemeTokens.test.ts"
      to: "src/frontend/components/UI/NoticeStack/index.scss"
      via: "ruleBody(region, '.noticeStackIcon' / '.noticeStackTitle')"
      pattern: "ruleBody\\(region, '\\.noticeStack(Icon|Title)'\\)"
---

<objective>
Make the Humble expiry toast and the read-only stores notice look like the Steam launch notice, so the
three toasts in the bottom-right NoticeStack read as one family. Follow the pattern commit e69d926b8
set for the dismiss X: the shared look lives once in the region sheet (NoticeStack/index.scss), each
notice keeps its own classes only as hooks, and noticeStackStylesheetGate fails if a notice restyles
a shared part.

Purpose: the user locked five decisions (icon, text, Humble copy split, Humble action button,
alignment). Each one maps to a task below.
Output: shared region rules, three migrated notices, the split Humble copy, an extended gate, and
dev preview triggers so all three notices can be checked by eye together.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.claude/skills/sketch-findings-gamelib/references/notices-and-toasts.md
@src/frontend/components/UI/NoticeStack/index.scss
@src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts
@src/frontend/components/UI/SteamEngineLaunchNotice/index.scss
@src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/launchNoticeThemeTokens.test.ts
@src/frontend/components/UI/HumbleExpiryToast/index.tsx
@src/frontend/components/UI/HumbleExpiryToast/index.scss
@src/frontend/components/UI/ReadOnlyStoresNotice/index.tsx
@src/frontend/components/UI/ReadOnlyStoresNotice/index.scss
@src/frontend/dev/noticePreview.ts
@src/frontend/dev/__tests__/noticePreview.test.ts

<interfaces>
Steam notice render (src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx, inside renderSlot, about lines 640-665):
  FontAwesomeIcon className="steamEngineLaunchNoticeIcon"
  span className="steamEngineLaunchNoticeText"
    span className="steamEngineLaunchNoticeTitle" {o.title}  {' '}  span className="steamEngineLaunchNoticeBody" {o.body}
  button className="noticeStackDismiss steamEngineLaunchNoticeDismiss"
  span className="steamEngineLaunchNoticeBar"  (position absolute; stays in the Steam sheet)

Steam rules to move to the region sheet (exact values; the region versions are the reference look):
  .steamEngineLaunchNoticeIcon  { flex: none; width: 16px; height: 16px; padding-top: 1px; color: var(--accent); }
  .steamEngineLaunchNoticeText  { flex: 1; min-width: 0; line-height: 1.4; }
  .steamEngineLaunchNoticeTitle { display: block; font-family: var(--primary-font-family); color: var(--text-title, var(--text-default)); font-weight: var(--bold); }
  .steamEngineLaunchNoticeBody  { display: block; margin-top: 2px; font-family: var(--secondary-font-family); color: var(--text-secondary); }

Shared X (already in the region sheet, the template for the action button):
  .noticeStackDismiss: hover background color-mix(in srgb, var(--accent) 16%, transparent); :focus-visible outline 2px solid var(--accent), outline-offset 1px.

Read-only stores store (src/frontend/state/ReadOnlyStoresNotice.ts):
  export const useReadOnlyStoresNotice  (zustand; state { entries, visible, dismissed, set, dismiss }; initial entries [], visible false, dismissed false)
  export const handleReadOnlyStoresNoticeSignal(_e: IpcRendererEvent, payload: unknown): void  (closed-set validator, then set(entries))
  Valid entries used by existing tests: { area: 'settings', reason: 'newer' }, { area: 'steam-library', reason: 'failed' }
  The component shows once per visible=true; it leaves ONLY via its X (D-15: no auto-hide). After dismiss(), dismissed=true blocks re-showing.

Humble test (HumbleExpiryToast/__tests__/humbleExpiryToastSuppression.test.tsx): t is mocked as (key, defaultValue) => defaultValue; byClass(tree, part) matches className.includes(part); it already queries 'humbleExpiryToastAction' and 'humbleExpiryToastDismiss' (keep both hook classes).

i18n facts (verified while planning):
  - i18next-parser config: locales ['en'], keepRemoved: true, sort: true, indentation 4. `pnpm i18n` writes only the en catalogs and never deletes keys.
  - login.humble_expired_toast exists only in public/locales/en/translation.json (1 of 49 locales) and only HumbleExpiryToast/index.tsx uses it.
  - login.humble_reconnect is also used by src/frontend/screens/Login/index.tsx: do NOT change it.
  - CI runs `pnpm i18n` then `pnpm i18n-churn-guard`, and meta/__tests__/i18nCatalogChurnGuard.test.ts has a live-tree test: ANY uncommitted change under public/locales/ outside gamelib.json fails it. So translation.json must equal parser output and be committed before that guard or the full suite runs.
  - lint-translations in CI is gamelib-only, so translation.json keys are not linted per locale.
  - public/locales/en/translation.json and .claude/skills/.../notices-and-toasts.md are both prettier-ignored (checked with --file-info), so no prettier check is listed for them.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Shared icon, text and action rules in the region sheet; migrate the Steam and read-only notices</name>
  <files>src/frontend/components/UI/NoticeStack/index.scss, src/frontend/components/UI/SteamEngineLaunchNotice/index.scss, src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx, src/frontend/components/UI/ReadOnlyStoresNotice/index.scss, src/frontend/components/UI/ReadOnlyStoresNotice/index.tsx, src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/launchNoticeThemeTokens.test.ts, src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts</files>
  <action>
Region sheet (NoticeStack/index.scss). Add five top-level rules after `.noticeStackDismiss`, each written exactly as `.<name> {` (launchNoticeThemeTokens' ruleBody looks up `${selector} {`). Lead them with a comment in the style of the X comment: the icon, text and action look for every notice lives here; notices add these classes and keep their own classes only as hooks; none restyles them (quick 261116-swr).
- `.noticeStackIcon`: Steam's icon rule, values unchanged (flex none, 16px by 16px, padding-top 1px, color var(--accent)). Per decision 1.
- `.noticeStackText`, `.noticeStackTitle`, `.noticeStackBody`: Steam's text, title and body rules, values unchanged. `.noticeStackBody` is display block with margin-top 2px, so the read-only notice's two bodies stack with the same spacing. Per decision 2.
- `.noticeStackAction`, per decision 4: flex none; align-self flex-start; background transparent; border 1px solid var(--accent); border-radius 6px; color var(--accent); padding var(--space-3xs) var(--space-sm); font-family inherit; font-size var(--text-sm); line-height 1.4; white-space nowrap; cursor pointer; transition on background 120ms like the X. `&:hover` background is the X's color-mix(in srgb, var(--accent) 16%, transparent), and the text stays --accent. `&:focus-visible` uses the X's outline (2px solid var(--accent), outline-offset 1px).
Theme variables only. No literal colours: the theme-token test bans them.

Steam sheet: delete `.steamEngineLaunchNoticeIcon`, `.steamEngineLaunchNoticeText`, `.steamEngineLaunchNoticeTitle` and `.steamEngineLaunchNoticeBody`. Keep `--overlay`, the bar, the paused and waiting modifiers and the keyframes. Rewrite the header comment's "Mapping" line: the icon, title, body and dismiss tokens now live on the shared rules in ../NoticeStack/index.scss, and the stripe and countdown bar stay --status-warning on purpose.
Steam TSX (renderSlot children): the class names become `noticeStackIcon steamEngineLaunchNoticeIcon`, `noticeStackText steamEngineLaunchNoticeText`, `noticeStackTitle steamEngineLaunchNoticeTitle` and `noticeStackBody steamEngineLaunchNoticeBody`. Shared class first, hook kept. Change nothing else.

Read-only sheet: delete `.readOnlyStoresNoticeIcon` (its --status-warning colour and margin-top go, per decision 1), `.readOnlyStoresNoticeText` (its flex column and gap go), `.readOnlyStoresNoticeTitle` and `.readOnlyStoresNoticeBody`. Keep the `.readOnlyStoresNotice { align-items: flex-start; }` root rule. Update the header comment to say the icon and text come from the shared region rules.
Read-only TSX: icon `noticeStackIcon readOnlyStoresNoticeIcon`. Text wrapper div `noticeStackText readOnlyStoresNoticeText`. Title div `noticeStackTitle readOnlyStoresNoticeTitle`. Each body div `noticeStackBody readOnlyStoresNoticeBody`. Keep the div elements and the conditional bodies as they are. Its title goes from font-weight 600 to var(--bold), which is intended.

launchNoticeThemeTokens.test.ts: the 'title uses heading font and title colour' test reads `ruleBody(region, '.noticeStackTitle')` and the 'icon takes the accent' test reads `ruleBody(region, '.noticeStackIcon')`. Keep the same assertions. Add one test, 'action button takes the accent', asserting `ruleBody(region, '.noticeStackAction')` matches border 1px solid var(--accent) and `color: var(--accent);`. Extend the literal-colour loop to also cover the HumbleExpiryToast and ReadOnlyStoresNotice sheets (add their paths as constants).

noticeStackStylesheetGate.test.ts, a minimal fix in this task (the gate itself is extended in Task 3): the derived specimens 'flags position sticky even on an inner rule' and 'flags a stray anchor on an inner rule that is not absolute' anchor on '.steamEngineLaunchNoticeIcon {', which no longer exists. Re-anchor both on '.steamEngineLaunchNotice--waiting .steamEngineLaunchNoticeBar {'. Its subject class is the bar, so it is INNER and not a toast root. It is also not the exact selector `.steamEngineLaunchNoticeBar` that carries position absolute, so the stray `top: 0` is still flagged as an inner non-absolute anchor. Keep each test's expectation unchanged.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --runTestsByPath src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/launchNoticeThemeTokens.test.ts src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx src/frontend/components/UI/ReadOnlyStoresNotice/__tests__/ReadOnlyStoresNotice.test.tsx src/frontend/components/UI/NoticeStack/__tests__/NoticeStackTwoToast.test.tsx && npx eslint src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx src/frontend/components/UI/ReadOnlyStoresNotice/index.tsx src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/launchNoticeThemeTokens.test.ts src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts && npx prettier --check src/frontend/components/UI/NoticeStack/index.scss src/frontend/components/UI/SteamEngineLaunchNotice/index.scss src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx src/frontend/components/UI/ReadOnlyStoresNotice/index.scss src/frontend/components/UI/ReadOnlyStoresNotice/index.tsx src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/launchNoticeThemeTokens.test.ts src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts</automated>
  </verify>
  <done>The region sheet defines the five shared rules. The Steam and read-only sheets no longer style the icon, text, title or body. Both TSX files carry shared and hook classes. The theme-token test reads the shared rules and passes, including the new action assertion and the wider literal-colour scan. The gate passes with its re-anchored specimens. Scoped eslint and prettier are clean.</done>
</task>

<task type="auto">
  <name>Task 2: Humble toast uses the shared parts, split title and body copy, and the "Reconnect" action</name>
  <files>src/frontend/components/UI/HumbleExpiryToast/index.tsx, src/frontend/components/UI/HumbleExpiryToast/index.scss, src/frontend/components/UI/HumbleExpiryToast/__tests__/humbleExpiryToastSuppression.test.tsx, public/locales/en/translation.json</files>
  <action>
Humble TSX children, in order:
- Icon: `noticeStackIcon humbleExpiryToastIcon`.
- Text block, per decision 3: `span.noticeStackText.humbleExpiryToastText` (written as a className string) holds `span` `noticeStackTitle humbleExpiryToastTitle` with `t('login.humble_expired_title', 'Humble Bundle session expired')`, then `{' '}`, then `span` `noticeStackBody humbleExpiryToastBody` with `t('login.humble_expired_body', 'Reconnect to keep your keys in sync.')`. This is the same span structure as Steam.
- Action, per decision 4: button className `noticeStackAction humbleExpiryToastAction`, label `t('login.humble_reconnect_short', 'Reconnect')`. Leave `login.humble_reconnect` alone: Login/index.tsx:510 uses it.
- The dismiss button stays exactly as it is.
Remove the `humbleExpiryToastMessage` span and its `login.humble_expired_toast` call.

Humble sheet: delete `.humbleExpiryToastIcon`, `.humbleExpiryToastMessage`, `.humbleExpiryToastAction` and `.humbleExpiryToastAction:hover`. Change the root rule to `.humbleExpiryToast { align-items: flex-start; }` and replace its comment. Decision 5 resolved: with a two-line title and body block, `center` would float the icon, the X and the button to the middle of the block, which is unlike the other two notices. So Humble aligns to the top like they do. The rule restates the surface default on purpose, as `.readOnlyStoresNotice` already does: it records the decision, and the gate's derived specimens and its vacuity check anchor on `.humbleExpiryToast {`.

Catalog (decision 3, i18n), in this order:
(a) Run `git status --porcelain public/locales` and note the output.
(b) Run `pnpm i18n`. Because keepRemoved is true and locales is ['en'], it adds the three new keys to public/locales/en/translation.json with the defaults above, sorted.
(c) Run `git status --porcelain public/locales` again. Only en/translation.json may have changed. If the parser touched any other locale file that was clean in (a), run `git checkout --` on just that path and report it as pre-existing parser drift.
(d) Delete the line `"humble_expired_toast": ...` from the en translation.json by hand (keepRemoved means the parser will not remove it). This retires the key: no source uses it any more, no other locale has it, and lint-translations in CI covers only gamelib, so nothing reads it.
(e) Run `pnpm i18n` a second time and confirm translation.json is byte-identical before and after (shasum). That proves the committed catalog equals parser output, which is what CI's `pnpm i18n` followed by `pnpm i18n-churn-guard` needs.
(f) Commit translation.json together with the TSX in this task's commit. The live-tree churn test fails on any uncommitted change to translation.json.
The keys stay in translation.json, not gamelib.json, because the existing Humble toast keys live there (en only, the other 48 locales fall back) and moving namespaces is out of scope. Record this in the SUMMARY.

Humble test (humbleExpiryToastSuppression.test.tsx): add one test, 'renders the split title and body and the short Reconnect label'. Set expired to true and settle, the same way the existing tests do. Then use the file's textOf helper if it has one; if not, add a small one modelled on ReadOnlyStoresNotice.test.tsx's textOf. Assert that byClass(tree, 'noticeStackTitle') reads 'Humble Bundle session expired', byClass(tree, 'noticeStackBody') reads 'Reconnect to keep your keys in sync.', byClass(tree, 'humbleExpiryToastAction') reads 'Reconnect' and its className includes 'noticeStackAction', and byClass(tree, 'noticeStackIcon') is defined. The existing Action and Dismiss lookups stay as they are.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --runTestsByPath src/frontend/components/UI/HumbleExpiryToast/__tests__/humbleExpiryToastSuppression.test.tsx src/frontend/components/UI/NoticeStack/__tests__/NoticeStackTwoToast.test.tsx src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/launchNoticeThemeTokens.test.ts meta/__tests__/hardcodedStringGate.test.ts && test "$(grep -c 'humble_expired_toast' public/locales/en/translation.json)" = 0 && grep -q '"humble_expired_title": "Humble Bundle session expired"' public/locales/en/translation.json && grep -q '"humble_expired_body": "Reconnect to keep your keys in sync."' public/locales/en/translation.json && grep -q '"humble_reconnect_short": "Reconnect"' public/locales/en/translation.json && grep -q '"humble_reconnect": "Session expired — Reconnect"' public/locales/en/translation.json && test -z "$(grep -rn 'humble_expired_toast' src --include='*.tsx' --include='*.ts')" && npx eslint src/frontend/components/UI/HumbleExpiryToast/index.tsx src/frontend/components/UI/HumbleExpiryToast/__tests__/humbleExpiryToastSuppression.test.tsx && npx prettier --check src/frontend/components/UI/HumbleExpiryToast/index.tsx src/frontend/components/UI/HumbleExpiryToast/index.scss src/frontend/components/UI/HumbleExpiryToast/__tests__/humbleExpiryToastSuppression.test.tsx</automated>
    After the task commit, run: `pnpm i18n && git status --porcelain public/locales` (expect no output) and then `pnpm i18n-churn-guard` (expect exit 0). public/locales/en/translation.json is prettier-ignored, so it has no prettier check.
  </verify>
  <done>The Humble toast renders shared icon, text, title, body and action classes with the split copy and the "Reconnect" label. Its sheet keeps only the flex-start root rule. The en catalog has the three new keys and no longer has humble_expired_toast, and login.humble_reconnect is unchanged. After the commit, a second parser run changes nothing and the churn guard passes. The new Humble test passes.</done>
</task>

<task type="auto">
  <name>Task 3: Extend the stylesheet gate to the shared parts (with sabotage proof); add readOnly() and all() preview triggers</name>
  <files>src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts, src/frontend/dev/noticePreview.ts, src/frontend/dev/__tests__/noticePreview.test.ts, .claude/skills/sketch-findings-gamelib/references/notices-and-toasts.md</files>
  <action>
Gate. Add a describe block, 'NoticeStack stylesheet gate (shared icon, text and action)', modelled on the 'shared dismiss X' block, with a header comment naming quick 261116-swr.
- Define `const SHARED_PARTS = ['Icon', 'Text', 'Title', 'Body', 'Action'] as const`.
- Add a pure helper `restylesSharedPart(scss: string): string[]`. It runs strip(scss), then returns every rule header that matches `/[A-Za-z0-9_-]*(Icon|Text|Title|Body|Message|Action)\b[^{;]*\{/g`. Message is included so the retired Humble message rule cannot come back.
- Test: the region sheet defines `.noticeStackIcon {`, `.noticeStackText {`, `.noticeStackTitle {`, `.noticeStackBody {` and `.noticeStackAction {`.
- Test, it.each over SLOTS: the slot TSX (stripped) contains `noticeStackIcon`, `noticeStackText`, `noticeStackTitle` and `noticeStackBody`. Every `className="..."` whose value contains `Icon`, `Text`, `Title` or `Body` must include the matching `noticeStack<Part>` (the regex is analogous to the Dismiss one). Every `className="..."` that contains `Action` must include `noticeStackAction`. Finally, `restylesSharedPart(read(slot.scss))` must equal []. The Steam icon/title/body classes are string literals in JSX, so the className regex sees them.
- Derived-specimen self-tests. Specimen 1 uses the existing `derive(read(humble.scss), '.humbleExpiryToast {', '  .humbleExpiryToastTitle { color: var(--accent); }')`, which nests a title rule inside the real root rule, and asserts `restylesSharedPart` returns a non-empty array. Specimen 2 removes `noticeStackIcon ` from the real ReadOnlyStoresNotice TSX with replace, asserts the text changed, and asserts the TSX check now reports `noticeStackIcon`. To make that check callable on a string, factor the per-slot TSX check into a helper `missingSharedClasses(tsx: string): string[]` that the it.each uses too.

Preview (noticePreview.ts): import `handleReadOnlyStoresNoticeSignal` and `useReadOnlyStoresNotice` from 'frontend/state/ReadOnlyStoresNotice'.
- `readOnly()`: first reset the store to its initial `{ entries: [], visible: false, dismissed: false }`, so a dismissed notice can be shown again in the same dev session. Then call `handleReadOnlyStoresNoticeSignal({} as IpcRendererEvent, { entries: [{ area: 'settings', reason: 'newer' }, { area: 'steam-library', reason: 'failed' }] })`. It goes through the real validator, like steam() does, and shows both bodies so the stacked-body spacing can be checked. Return `useReadOnlyStoresNotice.getState().visible`.
- `all()`: steam(), then readOnly(), then humble().
- Leave `both()` unchanged.
- `clear()` also resets the read-only store to its initial state. Document in its JSDoc that a read-only notice already on screen leaves only through its X (D-15: no auto-hide), as a real one does.
- Add `readOnly(): boolean` and `all(): void` to NoticePreviewApi.
Adding these triggers was trivial (the store is a plain zustand store with an exported validator), so it is in scope.

Preview test: the key list becomes ['all', 'both', 'clear', 'humble', 'readOnly', 'steam']. Add these tests:
- readOnly() returns true and leaves two validated entries with visible true.
- readOnly() after `useReadOnlyStoresNotice.getState().dismiss()` shows again.
- all() sets the Steam latest, the read-only visible flag and humble.expired.
- clear() resets the read-only store.
Add the read-only store reset to afterEach.

Sketch reference (notices-and-toasts.md, "CSS Patterns (as shipped)"): change the sentence "The icon, title, body and dismiss styles live in `SteamEngineLaunchNotice/index.scss`." to say that the icon, text, title, body, action button and dismiss styles live once in `NoticeStack/index.scss` as `.noticeStackIcon` / `.noticeStackText` / `.noticeStackTitle` / `.noticeStackBody` / `.noticeStackAction` / `.noticeStackDismiss` (quick 261116-swr), and that notices keep their own classes only as hooks. Change no other lines.

Sabotage check (run it, report it, restore the files). Use the scratchpad for backups and never `git checkout` (Tasks 1 and 2 may be uncommitted):
(1) Copy HumbleExpiryToast/index.scss to the scratchpad. Append `.humbleExpiryToastTitle { color: var(--accent); }`, run the gate and see it FAIL, then copy the original back.
(2) Do the same with ReadOnlyStoresNotice/index.tsx: delete `noticeStackIcon ` with sed and see it FAIL, then restore.
(3) Run the gate again and see it PASS.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && S=/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/97e6b1ca-dce6-4162-a99e-0ca81f9d53d5/scratchpad && G=src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts && H=src/frontend/components/UI/HumbleExpiryToast/index.scss && R=src/frontend/components/UI/ReadOnlyStoresNotice/index.tsx && cp $H $S/h.scss && printf '\n.humbleExpiryToastTitle {\n  color: var(--accent);\n}\n' >> $H && (npx jest --runTestsByPath $G >/dev/null 2>&1 && echo "SABOTAGE-1 NOT CAUGHT" && cp $S/h.scss $H && exit 1 || true) && cp $S/h.scss $H && cp $R $S/r.tsx && sed -i '' 's/noticeStackIcon //' $R && (npx jest --runTestsByPath $G >/dev/null 2>&1 && echo "SABOTAGE-2 NOT CAUGHT" && cp $S/r.tsx $R && exit 1 || true) && cp $S/r.tsx $R && npx jest --runTestsByPath $G src/frontend/dev/__tests__/noticePreview.test.ts src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/launchNoticeThemeTokens.test.ts src/frontend/components/UI/HumbleExpiryToast/__tests__/humbleExpiryToastSuppression.test.tsx src/frontend/components/UI/ReadOnlyStoresNotice/__tests__/ReadOnlyStoresNotice.test.tsx src/frontend/components/UI/NoticeStack/__tests__/NoticeStackTwoToast.test.tsx src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx && cmp $H $S/h.scss && cmp $R $S/r.tsx && npx eslint $G src/frontend/dev/noticePreview.ts src/frontend/dev/__tests__/noticePreview.test.ts && npx prettier --check $G src/frontend/dev/noticePreview.ts src/frontend/dev/__tests__/noticePreview.test.ts</automated>
    The `cmp` steps prove the Humble sheet and the read-only TSX were restored byte-identical after sabotage. The sketch reference .md is prettier-ignored, so it has no prettier check.
  </verify>
  <done>The gate fails when a slot restyles a shared part or drops a shared class. Both sabotages were seen to fail and both files were restored. The gate passes on the real sources. The preview exposes readOnly() and all(), and its tests cover both. The sketch reference names the shared rules. Scoped eslint and prettier are clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| backend push to read-only store | the preview reuses the real closed-set validator; no new input path |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-swr-01 | Tampering | noticePreview.readOnly() | mitigate | routes through handleReadOnlyStoresNoticeSignal (T-68-25 closed-set validator), never sets entries directly; registered only under import.meta.env.DEV (unchanged) |
| T-swr-02 | Information disclosure | Humble toast copy | accept | static copy, no account data rendered |
</threat_model>

<verification>
- Every scoped jest run above passes, and the Task 3 sabotage runs were each seen to FAIL before the restore.
- After the commits: `pnpm i18n` leaves `git status --porcelain public/locales` empty, and `pnpm i18n-churn-guard` exits 0.
- `grep -rn "status-warning" src/frontend/components/UI/HumbleExpiryToast src/frontend/components/UI/ReadOnlyStoresNotice` returns nothing. In NoticeStack/index.scss, --status-warning appears only in the stripe. In the Steam sheet, it appears only in the bar.
- Live look (HUMAN check, not provable in jest; do not claim it): run `pnpm tauri:dev`, open DevTools on the main window, and run `__gamelibNotices.all()`. Check that the three toasts share the icon size and accent colour, the title and body fonts, and the X. Check that the Humble title and body sit top-aligned with the "Reconnect" button, which is accent-outlined with an accent hover tint and a focus ring on Tab. Check that the read-only notice's two bodies are spaced like the Steam body. Repeat on at least one light theme and the high-contrast theme. `__gamelibNotices.clear()` resets the stores; Steam and read-only toasts already on screen leave via their X.
</verification>

<success_criteria>
- Decisions 1-4 are implemented as locked. Decision 5 is resolved as flex-start, and the reason is recorded in the SUMMARY.
- The shared look is defined once, in NoticeStack/index.scss. No notice sheet styles its icon, text, title, body or action.
- The Humble copy is split, en-only, and parser-stable. humble_expired_toast is retired and login.humble_reconnect is untouched.
- noticeStackStylesheetGate guards the new shared parts, and the sabotage proved it bites.
- The SUMMARY lists the live-look check as pending human verification.
</success_criteria>

<output>
Create `.planning/quick/261116-swr-align-humble-and-read-only-stores-toasts/261116-swr-SUMMARY.md` when done
</output>
