---
phase: quick-261027-thn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/261027-thn-localise-the-7-downloadmanager-canceldia/261027-thn-i18n-fill.json
  - public/locales/*/gamelib.json (48 non-en; en is NOT touched)
  - public/locales/*/gamelib.mt.json (48)
  - meta/i18nCatalogPresenceBaseline.json
  - .planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-VALIDATION.md
  - .planning/todos/pending/2026-10-26-localise-cancel-download-dialog-keys.md (moved)
  - .planning/todos/completed/2026-10-26-localise-cancel-download-dialog-keys.md
autonomous: true
requirements:
  - TODO-2026-10-26-localise-cancel-download-dialog-keys
  - l10n standing req (51-04-02)

must_haves:
  truths:
    - "All 48 non-en gamelib.json catalogs carry a real, per-language translation of each of the 6 downloadManager.cancelDialog keys (deleteFiles, keepDownloading, message, stopDownload, stopKeepFiles, title); none is an English copy"
    - "Every translated `message` keeps the `{{title}}` placeholder verbatim; every value passes the real validateTranslation() from meta/machineFillGamelib.ts"
    - "meta/i18nCatalogPresenceBaseline.json no longer records any downloadManager.cancelDialog.* pair, and every OTHER recorded pair is unchanged (it shrinks by exactly 288 pairs, 1920 -> 1632)"
    - "pnpm lint-translations:gamelib exits 0 and reports no cancelDialog finding"
    - "Row 51-04-02 of 51-VALIDATION.md reads ✅ green with a dated audit-trail note; the todo lives in .planning/todos/completed/ with a Closed section"
  artifacts:
    - path: ".planning/quick/261027-thn-localise-the-7-downloadmanager-canceldia/261027-thn-i18n-fill.json"
      provides: "Provenance fill record, same shape as 52-33-i18n-fill.json: en + 48 locales x 6 dotted keys"
      contains: "downloadManager.cancelDialog.stopKeepFiles"
    - path: "meta/i18nCatalogPresenceBaseline.json"
      provides: "Presence baseline with the 288 cancelDialog pairs removed (filled, not hidden)"
  key_links:
    - from: "261027-thn-i18n-fill.json"
      to: "public/locales/<48>/gamelib.json downloadManager.cancelDialog"
      via: "scratchpad round-trip-verified apply script"
      pattern: "cancelDialog"
    - from: "public/locales/<48>/gamelib.json"
      to: "meta/i18nCatalogPresenceBaseline.json"
      via: "REQ-41-01 drift check: filled pairs must leave the baseline in the same commit"
      pattern: "downloadManager.cancelDialog"
---

<objective>
Close todo `2026-10-26-localise-cancel-download-dialog-keys.md`: translate the cancel-download
dialog strings into all 48 non-English `gamelib.json` catalogs, following the Phase 51-04 / 52-33
fill-record pattern, then sync the presence baseline, flip 51-VALIDATION row 51-04-02 to green and
move the todo to completed/.

Purpose: non-English users currently see English buttons on the cancel-download dialog
(`src/frontend/helpers/library.ts` L115-142, `src/frontend/screens/ConsoleMode/index.tsx` L566-570).

Output: one fill record, 96 locale files, a shrunk baseline, a green validation row, a closed todo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-10-26-localise-cancel-download-dialog-keys.md
@.planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-33-PLAN.md

Load `Skill("gamelib-conventions")` before writing or running any `<verify>` block (prettier rule).

## Facts measured at plan time (2026-10-27, HEAD 2fe994773, clean tree)

**The true key count is 6, not 7.** Quick 261026-t7b (`565421d16`) added 7 keys to en, including
`messageSteam`; quick 261027-cux (`9271b7e67`) later removed `messageSteam`. The live en block
(`public/locales/en/gamelib.json` L72-79, nested, indent 4, keys sorted) is exactly:

| dotted key | en value |
|---|---|
| downloadManager.cancelDialog.deleteFiles | Delete Files |
| downloadManager.cancelDialog.keepDownloading | Keep Downloading |
| downloadManager.cancelDialog.message | {{title}} is partly downloaded. Keep the downloaded files to resume later, or delete them to free up disk space. |
| downloadManager.cancelDialog.stopDownload | Stop Download |
| downloadManager.cancelDialog.stopKeepFiles | Stop & Keep Files |
| downloadManager.cancelDialog.title | Cancel download? |

`{{title}}` (a game title) is the only placeholder. No glossary term appears in any value. 48
non-en locale dirs exist (`ls public/locales`, exclude `en`); none has a `cancelDialog` block and
none has `cancelDialog` in its `gamelib.mt.json` `keys`. Do NOT add `messageSteam` anywhere.

**The gap is currently hidden, not gone.** `pnpm lint-translations:gamelib` exits 0 today
("1920 findings, 0 hard failures") because commit `6de4cce9b` regenerated
`meta/i18nCatalogPresenceBaseline.json` and recorded the 6 x 48 = 288 cancelDialog pairs as
known-missing (the exact thing the todo forbade). The lint still lists 288 cancelDialog
"Missing translation" findings. Filling the catalogs makes those 288 recorded pairs "no longer
missing live", which the REQ-41-01 drift check (`comparePresenceBaseline`, meta/lintTranslations.ts
~L497-515) reports as `removed` drift. So the baseline MUST be re-synced in the same commit, by
running the writer AFTER the fill: `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`.
This is the sanctioned direction (it records the gap as closed); what the todo forbids is
regenerating INSTEAD of filling. The expected result is exactly the HEAD baseline minus the six
`downloadManager.cancelDialog.*` entries, `totalPairs` 1920 -> 1632, `generatedAt` refreshed. Any
other difference means something else drifted: stop and report.

**Fill-record shape** (from `52-33-i18n-fill.json`): `{ "en": { "<dotted key>": "<en>" , ... },
"ar": { ... }, ... }`, flat dotted keys per locale. **mt manifest shape**
(`public/locales/de/gamelib.mt.json`): `{ locale, model, filledAt, keys: [sorted dotted keys] }`,
indent 2; `model` and `filledAt` stay untouched.

**machine-fill fallback:** `pnpm machine-fill-gamelib` needs an API key; prior quick tasks
(c4g, b9r, ch9) and 52-33 got 401 / no key and hand-authored in session. That is the sanctioned
fallback. Validate with the real `validateTranslation(source, target, glossary, options)` exported
from `meta/machineFillGamelib.ts` (L517), importing it with `JEST_WORKER_ID` set so its `main()`
does not fire, from a scratchpad script (never committed). 52-33 recorded "96/96 passed" plus a
sabotage control; copy that.

**Prettier:** every path this plan writes is under `public/locales/`, `meta/i18nCatalogPresenceBaseline.json`
or `.planning/`. Confirm with `npx prettier --file-info` per path; if all report `"ignored": true`,
omit the `--check` and say so in the SUMMARY (a check over ignored files proves nothing). If
`meta/i18nCatalogPresenceBaseline.json` is NOT ignored, add a scoped
`npx prettier --check meta/i18nCatalogPresenceBaseline.json` to Task 2's verify run.

**Todo close precedent** (`2141cdf84`, `b78a7ee37`): `git mv` the file unchanged-named into
`.planning/todos/completed/`, leave frontmatter as is, append `## Closed 2026-10-27 (quick 261027-thn)`.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author and validate the 261027-thn fill record (6 keys x 48 locales)</name>
  <files>.planning/quick/261027-thn-localise-the-7-downloadmanager-canceldia/261027-thn-i18n-fill.json</files>
  <read_first>
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-33-i18n-fill.json (shape; first ~20 lines are enough)
    - public/locales/en/gamelib.json L60-85 (the cancelDialog block and its neighbours)
    - meta/machineFillGamelib.ts L500-560 (validateTranslation signature and checks)
    - meta/i18nGlossary.json (glossary terms list)
  </read_first>
  <action>
    Create `261027-thn-i18n-fill.json` holding `en` with the six dotted keys and the exact en values from the table above, plus one object per non-en locale dir (48) with the same six keys. Try `pnpm machine-fill-gamelib` against a scratch copy first only if a key is available; on 401 / missing key, author the translations in session (sanctioned fallback). Translations must be genuine for each language — never the English text — and terminology-consistent: use each locale's existing `gamelib.json` and legacy `translation.json` / `gamepage.json` (e.g. existing "download", "cancel", "delete", "files", "keep" strings) as read-only translation memory. Button labels stay short imperative verb phrases like the en ones. `message` must contain `{{title}}` exactly once, unaltered (no spaces inside braces, not translated). For `stopKeepFiles`, use the locale's natural conjunction or `&`. RTL locales (ar, fa, he) keep `{{title}}` as literal ASCII.
    Validate every (locale, key) pair with the real `validateTranslation` via a scratchpad TypeScript script run through `node meta/runTs.cjs --bundle --platform=node --target=node21 <scratch.ts>` with `JEST_WORKER_ID=1` in the env, passing the glossary from `meta/i18nGlossary.json`. Also have the script assert, per locale, that no value equals its en source (case-insensitive), except where a locale legitimately shares the word (record any such exception explicitly in the SUMMARY with the reason). Sabotage control: in the same run, validate one deliberately broken value (de `message` with `{{title}}` removed) and require it to be REJECTED; then discard it. Record the pass count (expected 288/288) and the sabotage result for the SUMMARY. Write nothing in the repo except the fill record.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && python3 -c "import json,os;d=json.load(open('.planning/quick/261027-thn-localise-the-7-downloadmanager-canceldia/261027-thn-i18n-fill.json'));en=d['en'];K={'downloadManager.cancelDialog.'+k for k in ['deleteFiles','keepDownloading','message','stopDownload','stopKeepFiles','title']};assert set(en)==K,set(en);src=json.load(open('public/locales/en/gamelib.json'))['downloadManager']['cancelDialog'];assert all(en['downloadManager.cancelDialog.'+k]==v for k,v in src.items()) and len(src)==6;locs=[l for l in os.listdir('public/locales') if l!='en'];assert len(locs)==48 and set(d)-{'en'}==set(locs),set(d)^set(locs+['en']);bad=[(l,k) for l in locs for k in K if not d[l].get(k) or set(d[l])!=K];assert not bad,bad[:5];m=[l for l in locs if d[l]['downloadManager.cancelDialog.message'].count('{{title}}')!=1];assert not m,m;same=[(l,k) for l in locs for k in K if d[l][k].strip().lower()==en[k].strip().lower()];print('ok',len(locs),'en-identical:',same)"</automated>
    Prettier omitted: the fill record is under `.planning/` (prettier-ignored; confirm with `npx prettier --file-info` on it). The `en-identical` list must be empty or every entry justified in the SUMMARY.
  </verify>
  <done>Fill record exists with en + 48 locales x 6 keys; 288/288 pass validateTranslation; the sabotage value was rejected; `{{title}}` present once in every message; no unexplained English copies.</done>
</task>

<task type="auto">
  <name>Task 2: Apply to 48 catalogs + mt manifests, re-sync baseline, flip 51-04-02, close todo, commit</name>
  <files>public/locales/*/gamelib.json, public/locales/*/gamelib.mt.json, meta/i18nCatalogPresenceBaseline.json, .planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-VALIDATION.md, .planning/todos/completed/2026-10-26-localise-cancel-download-dialog-keys.md</files>
  <read_first>
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-33-PLAN.md Task 2 (the apply procedure this copies)
    - public/locales/de/gamelib.json (around its downloadManager block) and public/locales/de/gamelib.mt.json (first 10 lines)
    - .planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-VALIDATION.md L50-56 and L164-176 (row 51-04-02 and the 2026-10-26 audit section)
  </read_first>
  <action>
    1. Scratchpad Python apply script (never committed). For each of the 48 non-en locales, load `gamelib.json` and first assert `json.dumps(obj, indent=4, ensure_ascii=False) + "\n"` reproduces the file byte-for-byte; abort the whole run before writing anything on any mismatch. Insert the six keys as `downloadManager.cancelDialog.<leaf>` (create the `cancelDialog` object; place keys so the `downloadManager` object and the new object are in sorted key order, matching en). Re-dump with the same parameters. Leave `public/locales/en/gamelib.json` untouched. For each `gamelib.mt.json`, add the six dotted keys to `keys` (dedup, keep sorted), `model`/`filledAt` untouched, re-dump with indent 2 matching the file's existing round-trip (assert round-trip first the same way). Touch no other file under `public/locales`.
    2. Re-sync the baseline: run `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`. Then prove it only removed the cancelDialog pairs (see verify): `missing` must equal HEAD's `missing` minus every `downloadManager.cancelDialog.*` key, `totalPairs` must be 1632. If anything else changed, stop and report rather than commit. Never hand-edit the baseline.
    3. 51-VALIDATION.md: in row 51-04-02 (L54) replace the final status cell `❌ red — 336 hard failures, ...` with `✅ green — 2026-10-27 quick 261027-thn filled the 6 downloadManager.cancelDialog.* keys in all 48 locales; jest catalog/glossary/churn gates and lint-translations:gamelib green`. Leave every other cell and row unchanged. Below the 2026-10-26 "One red row" paragraph (L174) append a dated note: `**Update 2026-10-27 (quick 261027-thn):** row 51-04-02 is green.` followed by: the key count was 6 at fill time (261027-cux, 9271b7e67, removed messageSteam, so 288 pairs, not 336); commit 6de4cce9b had recorded the 288 pairs in the presence baseline, masking the hard failures; this quick filled all 288 and the re-synced baseline dropped exactly those pairs (1920 -> 1632); list the commands run and their results. Do not edit the earlier paragraph's text.
    4. Close the todo: `git mv .planning/todos/pending/2026-10-26-localise-cancel-download-dialog-keys.md .planning/todos/completed/`, frontmatter unchanged, append `## Closed 2026-10-27 (quick 261027-thn)` stating: 6 keys (not 7, messageSteam removed by 261027-cux) filled in 48 locales via `261027-thn-i18n-fill.json`; validator pass count; the 6de4cce9b baseline masking and its reversal; gates run green; 51-04-02 flipped.
    5. Run the verify gates. Commit by explicit paths only (the 48 gamelib.json, 48 gamelib.mt.json, the baseline, the fill record, 51-VALIDATION.md, both sides of the todo rename) in ONE commit, never `git add -A`/`.`. Message: `feat(quick-261027-thn): cancel-download dialog strings in all 48 non-en gamelib catalogs; close todo`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest meta/__tests__/lintTranslations.test.ts meta/__tests__/gamelibCatalogParity.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts meta/__tests__/i18nGlossary.test.ts --silent && pnpm lint-translations:gamelib && ! pnpm -s lint-translations:gamelib 2>&1 | grep -q cancelDialog && pnpm i18n-churn-guard && pnpm planning-gates && echo GATES-OK</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && python3 -c "import json,subprocess;old=json.loads(subprocess.run(['git','show','2fe994773:meta/i18nCatalogPresenceBaseline.json'],capture_output=True,text=True,check=True).stdout);new=json.load(open('meta/i18nCatalogPresenceBaseline.json'));exp={k:v for k,v in old['missing'].items() if not k.startswith('downloadManager.cancelDialog.')};assert new['missing']==exp,'unexpected baseline drift';assert new['totalPairs']==1632,new['totalPairs'];print('baseline ok')"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test "$(grep -l '\"cancelDialog\"' public/locales/*/gamelib.json | wc -l | tr -d ' ')" = 49 && test "$(grep -l 'downloadManager.cancelDialog.stopKeepFiles' public/locales/*/gamelib.mt.json | wc -l | tr -d ' ')" = 48 && git diff --quiet 2fe994773 -- public/locales/en/gamelib.json && ! grep -rq messageSteam public/locales && test ! -e .planning/todos/pending/2026-10-26-localise-cancel-download-dialog-keys.md && grep -q 'Closed 2026-10-27 (quick 261027-thn)' .planning/todos/completed/2026-10-26-localise-cancel-download-dialog-keys.md && grep '^| 51-04-02 ' .planning/phases/51-*/51-VALIDATION.md | grep -q '✅ green' && grep -q 'Update 2026-10-27 (quick 261027-thn)' .planning/phases/51-*/51-VALIDATION.md && test -z "$(git status --porcelain -- public/locales meta)" && echo DONE-OK</automated>
    Prettier: run `npx prettier --file-info` on `public/locales/de/gamelib.json`, `public/locales/de/gamelib.mt.json`, `meta/i18nCatalogPresenceBaseline.json` and the 51-VALIDATION.md path. Every path reported `"ignored": true` is left out of the check (state this in the SUMMARY); any reported `"ignored": false` gets a scoped `npx prettier --check <that path>` that must pass.
  </verify>
  <done>48 non-en catalogs and 48 mt manifests carry the six keys; en untouched; baseline shrank by exactly the 288 cancelDialog pairs; lint-translations:gamelib exits 0 with no cancelDialog finding; the four jest suites, i18n-churn-guard and planning-gates are green; 51-04-02 is ✅ green with a dated note; the todo is in completed/ with its Closed section; all of it in one explicit-path commit.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| translation text -> i18next render | Catalog strings are interpolated into dialog UI; `{{title}}` carries a game title |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-thn-01 | Tampering | 48 gamelib.json catalogs | mitigate | Real validateTranslation() over all 288 pairs plus a sabotage control; byte-for-byte round-trip assert before writing; `{{title}}` count check in Task 1 verify |
| T-thn-02 | Repudiation | presence baseline | mitigate | Baseline only via the writer, then a HEAD-diff proof that exactly the cancelDialog keys left and totalPairs is 1632; never hand-edited |
| T-thn-03 | Information disclosure | none | accept | Static UI strings, no secrets or PII; no package installs |
</threat_model>

<verification>
- `pnpm lint-translations:gamelib` exits 0 and prints no cancelDialog line
- `pnpm jest meta/__tests__/lintTranslations.test.ts meta/__tests__/gamelibCatalogParity.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts --silent` green
- Baseline diff vs 2fe994773 is exactly the six cancelDialog entries
- 51-04-02 ✅ green with dated note; todo in completed/
</verification>

<success_criteria>
Non-English users see the cancel-download dialog in their language, `{{title}}` intact, every i18n
gate green without hiding any gap, and the Phase 51 validation map has no red rows.
</success_criteria>

<output>
Create `.planning/quick/261027-thn-localise-the-7-downloadmanager-canceldia/261027-thn-SUMMARY.md` when done
(include validator pass count, sabotage result, en-identical exceptions if any, baseline totals, prettier file-info results).
</output>
