---
phase: quick-261114-twk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/updateLaunchPrompt.ts
  - src/backend/storeManagers/steam/__tests__/updateLaunchPrompt.test.ts
  - public/locales/*/gamelib.json (49)
  - public/locales/*/gamelib.mt.json (48)
  - .planning/quick/261114-twk-reword-the-pre-launch-update-prompt-for-/261114-twk-i18n-fill.json
  - .planning/todos/pending/2026-11-13-update-prompt-wording-for-part-downloaded-updates.md (git mv to completed/)
autonomous: true
requirements: [TODO-2026-11-13-update-prompt-wording-for-part-downloaded-updates]

must_haves:
  truths:
    - "Launching a bridge game whose update is paused with a surviving delta temps ledger shows a prompt saying the update is partly downloaded and that Update now resumes it"
    - "A bridge game with an untouched pending update (or a paused element with no ledger) shows the original prompt wording"
    - "Any error checking the ledger (null acf, missing steamappsDir, existsSync throwing) falls back to the original wording and never blocks Play"
    - "Every one of the 49 gamelib catalogs carries steam.update.prompt.messagePartial with {{title}} and {{targetBuild}}"
  artifacts:
    - path: "src/backend/storeManagers/steam/updateLaunchPrompt.ts"
      provides: "ledger check + messagePartial wording"
      contains: "gamelib:steam.update.prompt.messagePartial"
    - path: ".planning/quick/261114-twk-reword-the-pre-launch-update-prompt-for-/261114-twk-i18n-fill.json"
      provides: "in-session translation record, en + 48 locales"
    - path: ".planning/todos/completed/2026-11-13-update-prompt-wording-for-part-downloaded-updates.md"
      provides: "closed todo with ## Resolution"
  key_links:
    - from: "src/backend/storeManagers/steam/updateLaunchPrompt.ts"
      to: "gamelib-depot delta.rs ledger (<steamappsDir>/gamelib-delta/<appId>.temps.json)"
      via: "existsSync(join(acf.steamappsDir, 'gamelib-delta', `${appId}.temps.json`))"
      pattern: "gamelib-delta"
---

<objective>
Close todo 2026-11-13-update-prompt-wording-for-part-downloaded-updates (74-UAT item 6c): the bridge
pre-launch update prompt must say when an update is paused part-way and that "Update now" resumes it.

Purpose: the user cannot currently tell a paused, part-downloaded update from an untouched one.
Output: backend wording switch + tests, one new i18n key in all 49 gamelib catalogs, the todo closed.

Design is LOCKED by the orchestrator (do not re-research): signal = Rust delta temps ledger exists;
buttons unchanged ("Update now" already resumes: a paused update stays in the queue and
`addToQueue` replaces the element and calls `initQueue` when idle, downloadqueue.ts:296-392);
one new key `gamelib:steam.update.prompt.messagePartial`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-11-13-update-prompt-wording-for-part-downloaded-updates.md
@src/backend/storeManagers/steam/updateLaunchPrompt.ts
@src/backend/storeManagers/steam/__tests__/updateLaunchPrompt.test.ts

Load `Skill("gamelib-conventions")` before writing any `<verify>` run or touching the todo
(prettier rule; todo frontmatter rule).

<interfaces>
updateLaunchPrompt.ts (144 lines): `gateBridgeLaunchOnUpdate(steamGame)` reads
`const acf = await readAcfUpdateState(deps, appId, 'bridge')` at line 40 (AcfUpdateFields has
`stateFlags` and `steamappsDir`). The prompt is built at lines 92-111; `message` is
`i18next.t('gamelib:steam.update.prompt.message', '{{title}} has an update (build {{targetBuild}}). Update now, or play the build you have?', { title, targetBuild })`.

Test file (262 lines): mocks `i18next` so `t(k, d)` returns the default `d`; mocks
`../library/acfUpdateState` (readAcfUpdateState) and the beforeEach default is
`mockResolvedValue({ stateFlags: 4 })` (line 93, no steamappsDir). `setup()` returns
`{ game, showMessageBox, ... }`; the prompt tests use `jest.mocked(detectSteamUpdates)` returning a
`stale` state with a `targetBuild` and `t.showMessageBox.mockResolvedValue({ response: 0 })`, then
read `t.showMessageBox.mock.calls[0][0].message`.

en catalog `public/locales/en/gamelib.json` lines 867-876: `steam.update.prompt` keys are
alphabetical (dontAskAgain, finishFirst, message, playAnyway, queued, title, updateNow, updating),
4-space indent. Non-en catalogs keep their own (non-alphabetical) order, e.g. de has
dontAskAgain, finishFirst, queued, updating, message, playAnyway, title, updateNow.

`validateTranslation(source, target, glossary: string[], options: { countOptional?: boolean } = {}): string[]`
in meta/machineFillGamelib.ts:538 (returns a problem list; empty = pass). Glossary terms come from
meta/i18nGlossary.json (check its shape and load the term list the way 74-28 did).

74-20 apply rules (74-20-PLAN.md Task 3 step 2, 74-20-SUMMARY Validation): round-trip assert
`json.dumps(obj, indent=4, ensure_ascii=False) + "\n"` for gamelib.json and indent 2 for
gamelib.mt.json before writing; insert each key at the position mirroring en, abort if it already
exists, never reorder existing keys; insert the dotted key into each mt manifest `keys` at its
sorted position without reordering, and assert removing it restores the original list.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Detect the delta temps ledger and switch the prompt wording</name>
  <files>src/backend/storeManagers/steam/updateLaunchPrompt.ts, src/backend/storeManagers/steam/__tests__/updateLaunchPrompt.test.ts</files>
  <behavior>
    - Ledger present (acf `{ stateFlags: 4, steamappsDir: '/lib/steamapps' }`, existsSync true): showMessageBox `message` equals "Game has a partly downloaded update (build <targetBuild>). Update now to resume it, or play the build you have?" with the real title and targetBuild substituted by the test's i18next mock behaviour (the mock returns the raw default, so assert the default text with the literal `{{title}}`/`{{targetBuild}}` placeholders OR extend the mock to interpolate; pick one and keep existing tests green), AND existsSync was called with `join('/lib/steamapps', 'gamelib-delta', '1603180.temps.json')`
    - Ledger absent (existsSync false): message is the original `steam.update.prompt.message` default
    - existsSync throws: message is the original default and the gate still returns per the button (Play anyway -> 'launch')
    - acf without steamappsDir (the existing beforeEach default) keeps the original wording and existsSync is not called with a path containing "undefined"
    - Buttons, defaultId/cancelId and title are unchanged in all cases
  </behavior>
  <action>
    RED first: in the test file add `jest.mock('graceful-fs', () => ({ ...jest.requireActual('graceful-fs'), existsSync: jest.fn(() => false) }))` and import `existsSync` from 'graceful-fs' (plus `join` from 'path'); reset it to return false in beforeEach. Add the four cases above in a `describe('part-downloaded wording (261114-twk)')` block. Run the file against the unfixed source and confirm the ledger-present case fails (record that in the SUMMARY).

    GREEN: in updateLaunchPrompt.ts import `existsSync` from 'graceful-fs' (as bridgeBottle.ts does) and `join` from 'path'. Add a small module-level helper `hasPartialUpdate(steamappsDir: string | undefined, appId: string): boolean` that returns false when steamappsDir is falsy and otherwise returns `existsSync(join(steamappsDir, 'gamelib-delta', `${appId}.temps.json`))` inside try/catch (any throw -> false). Comment it: the ledger is written by gamelib-depot delta.rs (JOURNAL_DIR "gamelib-delta", quick 261114-gki) only when a paused run kept SHA-verified temps and is removed before commit and on fallbacks, so a paused queue element with no ledger restarts from 0 and keeps the original wording. Just before showMessageBox compute `const partial = hasPartialUpdate(acf?.steamappsDir, appId)` and choose the message: when partial, `i18next.t('gamelib:steam.update.prompt.messagePartial', '{{title}} has a partly downloaded update (build {{targetBuild}}). Update now to resume it, or play the build you have?', { title, targetBuild })`; otherwise the existing `message` call unchanged. Keep both keys as literal string arguments to i18next.t (the i18n parser must see them; no computed key). The inline default must equal the en catalog value byte-for-byte. Update the header comment's "A paused update ... falls through to the normal prompt" sentence to mention the part-downloaded wording. Do not change buttons or switch logic (locked design point 2).

    Add the en catalog line now so the parser/default parity holds: in public/locales/en/gamelib.json insert `"messagePartial": "{{title}} has a partly downloaded update (build {{targetBuild}}). Update now to resume it, or play the build you have?",` directly after the `"message"` line under steam.update.prompt (alphabetical, 4-space indent, hand-edited: the file is prettier-ignored). Snapshot the resulting en file to the scratchpad as `en-after-t1.json` for Task 2's unchanged-en check. The en edit is committed in Task 2 with the other catalogs.

    Commit only the two src paths: `git add src/backend/storeManagers/steam/updateLaunchPrompt.ts src/backend/storeManagers/steam/__tests__/updateLaunchPrompt.test.ts && git commit` with message `fix(quick-261114-twk): word the pre-launch update prompt for a part-downloaded update` ending with the two attribution lines (Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com> / Claude-Session: https://claude.ai/code/session_013cjweF3Q4oAxHErhG32Utb). Never `git add -A`, never `gsd-sdk commit`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm exec jest src/backend/storeManagers/steam/__tests__/updateLaunchPrompt.test.ts && npx tsc --noEmit -p . && npx eslint src/backend/storeManagers/steam/updateLaunchPrompt.ts src/backend/storeManagers/steam/__tests__/updateLaunchPrompt.test.ts</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --file-info src/backend/storeManagers/steam/updateLaunchPrompt.ts && npx prettier --file-info src/backend/storeManagers/steam/__tests__/updateLaunchPrompt.test.ts && npx prettier --check src/backend/storeManagers/steam/updateLaunchPrompt.ts src/backend/storeManagers/steam/__tests__/updateLaunchPrompt.test.ts   # public/locales/en/gamelib.json is prettier-ignored (file-info ignored:true): no check for it</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && grep -c "gamelib:steam.update.prompt.messagePartial" src/backend/storeManagers/steam/updateLaunchPrompt.ts && python3 -c "import json;v=json.load(open('public/locales/en/gamelib.json'))['steam']['update']['prompt']['messagePartial'];assert v=='{{title}} has a partly downloaded update (build {{targetBuild}}). Update now to resume it, or play the build you have?';print('en ok')"</automated>
  </verify>
  <done>Ledger present -> partial wording with the ledger path asserted; absent/throw/no steamappsDir -> original wording; the partial test was shown failing on the unfixed source; jest, tsc, eslint, scoped prettier green; one commit with only the two src paths.</done>
</task>

<task type="auto">
  <name>Task 2: Fill steam.update.prompt.messagePartial in all 48 non-en gamelib catalogs</name>
  <files>public/locales/*/gamelib.json (49 incl. en from Task 1), public/locales/*/gamelib.mt.json (48), .planning/quick/261114-twk-reword-the-pre-launch-update-prompt-for-/261114-twk-i18n-fill.json</files>
  <read_first>
    - .planning/phases/74-steam-game-updates/74-28-PLAN.md line 154 and 74-28-SUMMARY.md (the method being copied)
    - .planning/phases/74-steam-game-updates/74-20-PLAN.md Task 3 step 2 and 74-20-SUMMARY.md Validation (insert-only mt rule)
    - head of .planning/phases/74-steam-game-updates/74-28-i18n-fill.json (shape: `{ "<locale>": { "<dotted.key>": "<text>" } }`, en first)
    - meta/machineFillGamelib.ts lines 530-640; meta/i18nGlossary.json shape
    - each locale's existing `steam.update.prompt.message` value (keep its tone, address form and "Build" term consistent with it)
  </read_first>
  <action>
    Author in-session the 48 non-en translations of "{{title}} has a partly downloaded update (build {{targetBuild}}). Update now to resume it, or play the build you have?" (no API key; same as 74-20/74-28), keeping each locale's wording for "update", "build", "Update now" and "play the build you have" consistent with that locale's existing `steam.update.prompt.message` / `updateNow` values, and adding the "partly downloaded ... resume" meaning. Write them to `.planning/quick/261114-twk-reword-the-pre-launch-update-prompt-for-/261114-twk-i18n-fill.json` in 74-28-i18n-fill.json's shape with key `steam.update.prompt.messagePartial`, en first. No translation may equal the English source.

    Validate with a scratchpad script (under /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/0168aa35-e4c0-40ee-9e88-8c754d9600a9/scratchpad, never committed) that imports the real `validateTranslation` from meta/machineFillGamelib.ts (run via `node meta/runTs.cjs` or the same runner 74-28 used) with the glossary from meta/i18nGlossary.json: 48 pairs, 0 failures required. Include one sabotage control (a copy of one translation with `{{targetBuild}}` removed) that must be rejected; abort if it passes.

    Apply with a second scratchpad script (never committed), per 74-20's rule (the key is new in every locale, so the mt insert-only rule applies; if 74-20's rule turns out to say otherwise on reading, follow 74-20 and record why in the SUMMARY): for each of the 48 locales, assert `json.dumps(obj, indent=4, ensure_ascii=False) + "\n"` reproduces gamelib.json byte-for-byte and the indent-2 form reproduces gamelib.mt.json, aborting before any write on mismatch; abort if `steam.update.prompt.messagePartial` already exists; insert it directly after that locale's `message` key (the en-mirroring position: en's predecessor is `message`), never reordering existing keys; insert `steam.update.prompt.messagePartial` into the mt manifest `keys` at its sorted position without reordering, and assert removing it restores the original list. After writing, assert per locale that the parsed catalog minus the new key equals the pre-write parse (only the new key changed). en must stay byte-identical to `en-after-t1.json` from Task 1 (`cmp`).

    Do not hand-edit meta/i18nCatalogPresenceBaseline.json or meta/i18nForkTouchedFiles.json (the key is filled everywhere so nothing enters the baseline; updateLaunchPrompt.ts is a backend file outside the fork-touched list's scope). If a gate below demands either change, use only its writer/generator and record it.

    Commit by explicit paths only: the 49 gamelib.json, the 48 gamelib.mt.json and the fill record (`git add public/locales/*/gamelib.json public/locales/*/gamelib.mt.json <fill-record>`; confirm `git diff --cached --name-only` has no other path, notably no translation.json/gamepage.json/login.json and nothing under src/, spikes or debug). Message `feat(quick-261114-twk): translate the part-downloaded update prompt in all gamelib catalogs` with the two attribution lines.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm exec jest meta/__tests__/gamelibCatalogParity.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts --silent && pnpm i18n-churn-guard; echo "i18n-churn-guard exit=$?"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && python3 -c "import json,glob;fs=glob.glob('public/locales/*/gamelib.json');v=[json.load(open(f))['steam']['update']['prompt']['messagePartial'] for f in fs];assert len(fs)==49 and all('{{title}}' in s and '{{targetBuild}}' in s for s in v);m=glob.glob('public/locales/*/gamelib.mt.json');assert len(m)==48 and all('steam.update.prompt.messagePartial' in json.load(open(f))['keys'] for f in m);print('49 catalogs + 48 manifests ok')" && test "$(git diff -U0 HEAD -- 'public/locales/*/gamelib.json' | grep -c '^+ ')" = 49 && echo "one added line per catalog"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && O=$(mktemp); pnpm lint-translations:gamelib > "$O" 2>&1; echo "lint-translations:gamelib exit=$?"; grep -c "messagePartial" "$O"   # pre-existing hard failures may make this non-zero; record exit and hard-failure count in the SUMMARY (no higher than before, none for messagePartial)</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --file-info public/locales/de/gamelib.json && npx prettier --file-info public/locales/de/gamelib.mt.json && npx prettier --file-info .planning/quick/261114-twk-reword-the-pre-launch-update-prompt-for-/261114-twk-i18n-fill.json   # all expected ignored:true (public/locales/** and .planning/** are prettier-ignored); if so, no prettier --check applies to this task's paths; if any reports ignored:false, run npx prettier --check on exactly those paths</automated>
  </verify>
  <done>All 49 catalogs carry the key at the en-mirroring position, 48 mt manifests list it (insert-only), validateTranslation 48/0 with the sabotage control rejected, round-trip and only-new-key assertions passed, parity test and churn guard green, one explicit-path commit.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo</name>
  <files>.planning/todos/pending/2026-11-13-update-prompt-wording-for-part-downloaded-updates.md -> .planning/todos/completed/2026-11-13-update-prompt-wording-for-part-downloaded-updates.md</files>
  <action>
    `git mv .planning/todos/pending/2026-11-13-update-prompt-wording-for-part-downloaded-updates.md .planning/todos/completed/`. Keep the frontmatter intact (severity/platform/ready stay bare, lowercase, in order per gamelib-conventions). Append a `## Resolution` section: quick 261114-twk; signal = the gamelib-depot delta temps ledger `<steamappsDir>/gamelib-delta/<appId>.temps.json` (exists only when a paused run kept SHA-verified temps); new key `steam.update.prompt.messagePartial` used in place of `.message` when present, filled in all 49 catalogs; buttons unchanged because "Update now" already resumes a paused queue element; a paused update with no ledger keeps the original wording since it restarts from 0; the two commit hashes from Tasks 1 and 2. Commit by explicit paths (`git add` both the old and new paths, i.e. the rename) with message `docs(todos): close update-prompt-wording-for-part-downloaded-updates` plus the two attribution lines. Then run `graphify update .`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test -f .planning/todos/completed/2026-11-13-update-prompt-wording-for-part-downloaded-updates.md && test ! -e .planning/todos/pending/2026-11-13-update-prompt-wording-for-part-downloaded-updates.md && grep -c '^## Resolution' .planning/todos/completed/2026-11-13-update-prompt-wording-for-part-downloaded-updates.md && pnpm -s planning-gates 2>&1 | tail -6</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --file-info .planning/todos/completed/2026-11-13-update-prompt-wording-for-part-downloaded-updates.md   # expected ignored:true (.planning is prettier-ignored): no prettier --check for this task</automated>
  </verify>
  <done>Todo lives in completed/ with a Resolution section naming both commits; planning-gates passes; rename committed alone.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| filesystem -> launch gate | ledger existence read from the Steam library folder |
| translation authoring -> shipped catalogs | in-session text enters 48 shipped locale files |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-twk-01 | Denial of service | hasPartialUpdate | mitigate | existsSync only, wrapped in try/catch; null acf / missing steamappsDir / throw -> original wording; outer gate catch still launches |
| T-twk-02 | Tampering | locale catalogs | mitigate | validateTranslation over all 48 pairs + sabotage control; byte-for-byte round trip; only-new-key assertion; churn guard |
| T-twk-03 | Spoofing | ledger file | accept | a planted ledger only changes prompt wording; buttons and resume behaviour are unchanged |
</threat_model>

<verification>
- jest updateLaunchPrompt.test.ts (partial case shown failing pre-fix), gamelibCatalogParity, i18nCatalogChurnGuard
- `npx tsc --noEmit -p .`, eslint on the two src files, scoped prettier on the two src files
- `pnpm i18n-churn-guard`, `pnpm lint-translations:gamelib` (no new failures), `pnpm planning-gates`
- `graphify update .`
</verification>

<success_criteria>
- Paused update with a surviving ledger -> prompt says partly downloaded / Update now resumes it
- Untouched pending update, or paused with no ledger -> original wording
- 49 catalogs carry the key; 48 mt manifests list it
- Todo closed with Resolution; three explicit-path commits; nothing pushed
</success_criteria>

<output>
Create `.planning/quick/261114-twk-reword-the-pre-launch-update-prompt-for-/261114-twk-SUMMARY.md` when done (record the RED run, validation counts, gate exits).
</output>
