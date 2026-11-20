---
phase: quick-260916-cdb
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: []
files_modified:
  - public/locales/en/gamelib.json
  - public/locales/*/gamelib.json
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
  - src/frontend/screens/Game/GameSubMenu/index.tsx
  - src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/ImportDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/MainButton.importDemotion.test.tsx
  - .planning/todos/pending/2026-08-29-import-game-is-unlabelled-and-over-promoted-rename-demote-an.md
  - .planning/todos/completed/2026-08-29-import-game-is-unlabelled-and-over-promoted-rename-demote-an.md
  - .planning/todos/pending/2026-09-16-sideload-import-hint-trans-uses-key-not-i18nkey.md

must_haves:
  truths:
    - "On an uninstalled non-Steam game page, the primary install row no longer carries an import button"
    - "That same user can still reach the import flow, from the game page's ... submenu"
    - "Both doors into the import dialog (submenu item, DownloadDialog footer) read the same self-describing label, not 'Import Game'"
    - "The import dialog explains what import does, above the path picker, before the user commits"
    - "The import dialog's confirm button says something DIFFERENT from the door that opened it (today both render 'Import Game')"
    - "The SideloadDialog hint quotes a label that actually exists in the UI"
    - "sideload and thirdPartyManagedApp games — which never reach DownloadDialog — still have a reachable import door"
  artifacts:
    - path: "public/locales/en/gamelib.json"
      provides: "3 new installFlows.import* keys"
      contains: "importDoorLabel"
    - path: "src/frontend/screens/Game/GameSubMenu/index.tsx"
      provides: "the demoted import door"
      contains: "installFlows.importDoorLabel"
    - path: "src/frontend/screens/Game/GamePage/components/__tests__/MainButton.importDemotion.test.tsx"
      provides: "element-graph proof the MainButton door is gone"
  key_links:
    - from: "src/frontend/screens/Game/GameSubMenu/index.tsx"
      to: "openInstallGameModal"
      via: "action: 'import'"
      pattern: "action: 'import'"
    - from: "src/frontend/screens/Game/GamePage/components/MainButton.tsx"
      to: "openInstallGameModal"
      via: "MUST NOT contain action: 'import' any more"
      pattern: "action: 'import'"
---

<objective>
Rename the "Import Game" label to something that states its precondition and its payoff, and
move the Game-page instance out of the primary install row into `GameSubMenu`.

Purpose: closes pending todo
`.planning/todos/pending/2026-08-29-import-game-is-unlabelled-and-over-promoted-rename-demote-an.md`.
The operator answered its open product question on 2026-09-16: **keep the feature, rename it,
demote it.** The word "Import" means import/export of *data* in almost every other app; what this
actually does is adopt an existing on-disk copy instead of re-downloading. And it currently draws
the same visual weight as the action ~99% of visits want.

Output: 3 new `gamelib` keys filled in all 49 locales, 5 call sites repointed, the MainButton door
removed and rebuilt in `GameSubMenu`, an element-graph test pinning the demotion, the todo closed,
and one follow-up todo filed.

**Context-budget warning, read before starting.** This is filed as a "quick" task but it is not a
cheap one, for one reason: `meta/i18nCatalogPresenceBaseline.json` sits at `totalPairs: 0`, so
**every new `gamelib` key must be filled in all 49 locales or CI goes red** (Task 2). 3 keys x 48
non-English locales = 144 strings. Do Task 2 with a script, not by hand-editing 48 files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-08-29-import-game-is-unlabelled-and-over-promoted-rename-demote-an.md
@CLAUDE.md

Read these before editing. Several facts in the todo body have ROTTED — the findings below were
re-verified against the working tree at HEAD `f93fd73b2` and WIN wherever they conflict with it.

<locked_decisions>
LOCKED by the operator, 2026-09-16. Do not re-litigate either of these.

**D-01 — KEEP the feature.** Plan no work that removes `importGame` from backend, IPC or store
managers. The two related todos (`2026-08-24-importgame-does-not-validate...`,
`2026-08-24-importgame-wineprefix-wineversion...`) stay OPEN because the feature survives.

**D-02 — DEMOTE the MainButton instance INTO `GameSubMenu`. Do NOT delete it in favour of the
DownloadDialog escape hatch.** The todo body floats deletion as a candidate resolution; it is
wrong, and here is the measurement that kills it. `InstallModal/index.tsx:629` computes
`showDownloadDialog = !isSideload && gameInfo`, and the render ternary at `:706-761` orders
SteamDialog -> ThirdPartyDialog -> ImportDialog -> DownloadDialog. So `runner === 'sideload'` games
and `thirdPartyManagedApp` games **never reach DownloadDialog** and therefore never see its hatch.
`sideload/games.ts:225` does implement `importGame`. Deleting the Game-page door makes import
unreachable for those runners.
</locked_decisions>

<verified_call_site_map>
FIVE sites, not the three the todo lists. Full census, `grep -rn "button\.import\|Import Game\|action: 'import'" src/ public/locales/en/`:

| # | site | today | what it is |
|---|------|-------|------------|
| 1 | `MainButton.tsx:427` | `t('button.import', 'Import Game')` | the door to DEMOTE (button at `:411-427`, inside `<span className="installButtons">` opened at `:301`, gated `gameInfo.runner !== 'steam'`) |
| 2 | `DownloadDialog/index.tsx:795` | `t('button.import', 'Import Game')` | the in-flow hatch; keep in place, relabel. Handler `handleSwitchToImport` at `:303` |
| 3 | `ImportDialog/index.tsx:127` | `t('button.import', 'Import')` | the CONFIRM button. **The second arg is a DEFAULT and is INERT because the key exists**, so this actually renders "Import Game" too — one key serving two different meanings |
| 4 | `SideloadDialog/index.tsx:375-383` | hardcoded English inside a `<Trans>` | quotes the label verbatim: `...open the installation dialog, and click the &quot;Import Game&quot; button`. Absent from the todo entirely |
| 5 | `ImportDialog/index.tsx:106` | (nothing) | needs the new explanatory line ABOVE `PathSelectionBox` — todo item 2 |

The todo's `files:` list names the wrong locale file: `button.import` lives in
`public/locales/en/gamepage.json:121`, NOT `translation.json`.
</verified_call_site_map>

<repo_rules_that_bind_this>
Violating any of these turns CI red. All re-verified live today.

1. **New strings go in `public/locales/en/gamelib.json`.** Never `translation.json`, and never by
   editing the existing `gamepage.json` `button.import` value in place.
2. **The call site must use the `gamelib:` namespace PREFIX** and the alias must be literally
   `tGamelib`. `i18next-parser.config.js:61,70` declares `functions: ['t', 'tGamelib']` — any other
   alias is invisible to the lexer and the key never reaches translators. Precedent in this exact
   file: `MainButton.tsx:380` / `:405` / GameSubMenu `:408`,
   `tGamelib('gamelib:steam.install.withOptionsLabel', 'Install with options…')`.
3. **ALL 49 LOCALES, not just de/fr.** `meta/i18nCatalogPresenceBaseline.json` is at
   `totalPairs: 0` with `missing: {}` (verified). R13 in `meta/__tests__/lintTranslations.test.ts`
   re-derives missing (locale, key) pairs live and demands exact equality with that baseline, in
   both directions. Confirmed green at HEAD. An en-only add = 3 keys x 46 locales of unrecorded
   pairs, every one named. `steam.install.withOptionsLabel` is present in **49 of 49** — that is
   the standard.
4. **Do NOT "fix" a red R13 by regenerating the baseline.** The file's own `reason` string says it
   is "a RECORD of a known gap, not a permission to grow it."
5. **`lint-translations:gamelib` is structurally blind to an ABSENT key** — it walks each
   translated catalog's OWN keys. It will report green at zero coverage. Do not use it to prove
   parity. Diff the key SETS directly.
6. **Leave `gamepage.json`'s `button.import` orphaned in all 47 locales that carry it.** This is
   the SAFE default and is explicitly sanctioned. Removing a locale key has known traps (47 files
   carry `gamepage.json`, not 49 — `br` and `sl` have none at all). Do not run a 47-file removal
   sweep.
7. **Do not run `pnpm i18n`.** `i18next-parser.config.js` `keepRemoved` behaviour has deleted real
   fork keys before.
8. **No jsdom in this project.** `src/frontend/jest.config.js` is `testEnvironment: 'node'`.
   Component tests call the function component directly and walk the returned React-element object
   graph. See `MainButton.installClickRouting.test.tsx` for the working idiom.
9. **Todo-triage frontmatter** (`severity`, then `platform`, then `ready` — bare, lowercase, exact)
   is CI-gated by `pnpm planning-gates` for anything in `.planning/todos/pending/`.
</repo_rules_that_bind_this>

<latent_bug_do_not_fix>
`SideloadDialog/index.tsx:376` passes `key="sideload.import-hint.content"` where i18next needs
`i18nKey=`. `key` is React's reserved prop, so that `<Trans>` has NO i18n key and renders its
inline English children — the 47 translated copies of `sideload.import-hint.content` are currently
dead.

Two consequences, both binding:
- **Editing the inline English children IS what changes what users see.** Editing
  `en/gamepage.json:343` would change nothing.
- **Do NOT repair it in this task.** File it as a follow-up todo (Task 3). Widening scope to fix it
  would resurrect 47 dead translations that all quote the OLD label, which is a strictly worse
  outcome than leaving them dead.
</latent_bug_do_not_fix>

<naming_decision>
Three new keys under `installFlows` in `gamelib.json` (it already hosts `pathRejectedBodyImport`,
so the neighbourhood is right). All three sort alphabetically before `pathRejectedBodyImport`, so
inserting them at the head of the `installFlows` object is order-preserving in every locale.

| key | English | used at |
|-----|---------|---------|
| `installFlows.importDoorLabel` | `Locate existing installation…` | sites 1 (in its new GameSubMenu home) and 2 |
| `installFlows.importConfirmLabel` | `Use this installation` | site 3 |
| `installFlows.importExplainer` | `Already have this game on disk — from another launcher, or another drive? Point to those files instead of downloading it again.` | site 5 |

**Why these, and not the todo's floated alternatives.**
- The todo floats "Already Installed?". Rejected: `GameSubMenu` is a list of verb phrases with
  icons ("Browse Files", "Modify Installation", "Install with options…"). A question reads as an
  error message in that list.
- "Locate existing installation…" is a verb phrase that states the precondition ("existing
  installation" — you must already have it) and the payoff ("locate" — point at it). It reads
  correctly in BOTH slots: a submenu item, and a secondary footer button sitting next to "Install
  45 GB". The trailing `…` follows this catalog's own convention for a control that opens further
  UI (`Install with options…`, `Remove all copies…`).
- Sites 1/2 and site 3 get DIFFERENT strings on purpose — that is the whole point of splitting the
  key. Site 3 is a confirm, and the user has already picked a path by then, hence "Use this
  installation". Not "Use this folder": `ImportDialog`'s `pickFile` is true on Mac
  (`platformToInstall === 'Mac'`), where the target is an `.app` bundle, not a folder.
- **None of the three strings contains a glossary term.** This is deliberate.
  `meta/i18nGlossary.json` pins `GameLib`, `Steam`, `Epic`, `macOS` etc. as do-not-translate, and
  `meta/__tests__/gamelibCatalogParity.test.ts:60-82` applies `validateTranslation` to every
  non-empty value in every locale — a glossary term must survive verbatim in all 48 translations.
  Drafting the explainer without naming "GameLib" removes that entire class of gate failure across
  144 strings at zero cost to clarity. Keep it that way.
- No `{{placeholders}}`, no `<N></N>` tags, no `_one`/`_other` plural siblings. `{{count}}` is a
  reserved i18next interpolation name — do not introduce it.
</naming_decision>

<interfaces>
`GameSubMenu/index.tsx` already has everything the demoted door needs — no new imports required
beyond possibly the icon:

```typescript
// :16 — already imported
import { openInstallGameModal, openSteamInstallOptions } from 'frontend/state/InstallGameModal'
// :95-96 — both t's already in scope
const { t } = useTranslation('gamepage')
const { t: tGamelib } = useTranslation('gamelib')
// :101-103 — gates already computed
const isSteam = runner === 'steam'
const isThirdPartyManaged = !!gameInfo.thirdPartyManagedApp
// :81 — GameContext, carries is.installing / is.importing / is.queued
const { is, gameSettings } = useContext(GameContext)
// :25-41 — FindInPageIcon is already in the @mui/icons-material import block
```

Props (`:55-74`): `appName`, `isInstalled`, `runner`, `gameInfo`, ... — `isInstalled` is the gate
you want, and it is a prop, not derived.

Existing item shape to copy, `GameSubMenu/index.tsx:404-413`:
```tsx
<button
  onClick={() => openSteamInstallOptions(appName, gameInfo)}
  className="link button is-text is-link buttonWithIcon"
>
  <DownloadIcon />
  {tGamelib('gamelib:steam.install.withOptionsLabel', 'Install with options…')}
</button>
```

Both doors call the same thing:
```typescript
openInstallGameModal({ appName, runner, gameInfo, action: 'import' })
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Mint the three English keys, demote the MainButton door into GameSubMenu, repoint all five call sites</name>
  <files>
public/locales/en/gamelib.json,
src/frontend/screens/Game/GamePage/components/MainButton.tsx,
src/frontend/screens/Game/GameSubMenu/index.tsx,
src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx,
src/frontend/screens/Library/components/InstallModal/ImportDialog/index.tsx,
src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx
  </files>
  <action>
Add the three keys from `<naming_decision>` to `public/locales/en/gamelib.json` under
`installFlows`, inserted at the head of that object (alphabetical, before `pathRejectedBodyImport`).
Preserve the file's exact serialisation — detect `(indent, ensure_ascii, trailing-newline)` by
finding the combo where `json.dumps(json.load(f))` reproduces the original bytes, rather than
assuming. Do not touch `public/locales/en/gamepage.json`.

**Site 1 — DELETE from MainButton.** Remove the whole `{gameInfo.runner !== 'steam' && (<button ...
{t('button.import', 'Import Game')}</button>)}` block at `MainButton.tsx:410-429`, including its
`{/* Import makes no sense for Steam games ... */}` comment at `:410`. Leave the rest of the
`installButtons` span untouched — in particular the D-21 Steam split-button caret directly above it
must keep working. Note the in-situ comment at `:348-351` says the caret "takes the visual slot the
Import button leaves empty for Steam": with Import gone for every runner that slot is now free for
all of them, which is the intended visual outcome, not a regression. If `t` or any icon import
becomes unused as a result, remove it — `pnpm lint:src` will flag it otherwise.

**Site 1' — REBUILD in GameSubMenu.** Add one item to `GameSubMenu/index.tsx`, placed AFTER the
`showSteamSubMenuInstallOptions(...)` block that ends at `:414` and BEFORE the `{isInstalled && (`
cluster that opens at `:415`. Document order is load-bearing here — the in-situ comment at
`:337-350` explains that document order IS the gamepad/keyboard traversal mechanism, and that this
file is reached for uninstalled games via `GamePage:482 -> DotsMenu:41 -> GameSubMenu` with no gate
of its own. The Steam-only block above is mutually exclusive with yours, so the two never both
render.

Gate it `{!isInstalled && !isSteam && (`. **Do NOT also exclude `isThirdPartyManaged`** — per D-02
those games never reach DownloadDialog, so this is their ONLY door. Preserve the Steam exclusion:
`steam/games.ts:945` throws "not implemented" for import.

Mirror MainButton's disabled logic onto the new item:
`disabled={is.installing || is.importing || is.queued}`. Use the exact class vocabulary of its
siblings, `className="link button is-text is-link buttonWithIcon"`, and `<FindInPageIcon />` (already
imported at `:25-41`; semantically "locate"). Label:
`tGamelib('gamelib:installFlows.importDoorLabel', 'Locate existing installation…')`.
onClick: `openInstallGameModal({ appName, runner, gameInfo, action: 'import' })`.

**Site 2 — DownloadDialog `:795`.** Relabel only; the button, its position and `handleSwitchToImport`
all stay. Replace `t('button.import', 'Import Game')` with
`tGamelib('gamelib:installFlows.importDoorLabel', 'Locate existing installation…')`. Add
`const { t: tGamelib } = useTranslation('gamelib')` beside the existing `useTranslation` call. The
alias MUST be spelled `tGamelib` (rule 2).

**Site 3 — ImportDialog `:127`.** Replace `t('button.import', 'Import')` with
`tGamelib('gamelib:installFlows.importConfirmLabel', 'Use this installation')`. Add the `tGamelib`
alias to this file too (it currently has only `const { t } = useTranslation('gamepage')` at `:57`).
Leave the `isImportingThisGame` spinner and the `disabled={!importPath || isImportingThisGame}`
logic alone.

**Site 5 — ImportDialog explanatory line.** Insert one paragraph between `{children}` (`:97`) and
`<PathSelectionBox>` (`:106`), rendering
`tGamelib('gamelib:installFlows.importExplainer', '...')`. It must sit BELOW `{children}` — the
quick-260824-u8b comment at `:98-105` establishes that the platform selector passed in as
`children` renders FIRST by contract because it reshapes the fields below it. Your explainer is
prose, not a field, so below `children` and above the picker is correct.

**Site 4 — SideloadDialog `:375-383`.** Change ONLY the quoted label inside the `<Trans>`'s inline
English children: `&quot;Import Game&quot;` becomes `&quot;Locate existing installation…&quot;`.
Leave the surrounding instruction ("...open the installation dialog, and click the ... button")
intact and correct — it addresses Epic/GOG/Amazon users, and for those runners the DownloadDialog
hatch (site 2) is still exactly where it says it is. Do NOT change the `key=` prop to `i18nKey=`
(see `<latent_bug_do_not_fix>`), and do NOT edit `en/gamepage.json:343`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck && pnpm lint:src && python3 -c "
import json,subprocess,sys
d=json.load(open('public/locales/en/gamelib.json'))['installFlows']
for k in ['importDoorLabel','importConfirmLabel','importExplainer']:
    assert d.get(k), f'missing en key {k}'
src=open('src/frontend/screens/Game/GamePage/components/MainButton.tsx').read()
assert \"action: 'import'\" not in src, 'MainButton still opens the import modal'
assert 'button.import' not in src, 'MainButton still uses the old key'
gsm=open('src/frontend/screens/Game/GameSubMenu/index.tsx').read()
assert gsm.count(\"action: 'import'\")==1, 'GameSubMenu import door missing or duplicated'
assert 'installFlows.importDoorLabel' in gsm
out=subprocess.run(['grep','-rn',\"action: 'import'\",'src/frontend'],capture_output=True,text=True).stdout
prod=[l for l in out.splitlines() if '__tests__' not in l]
assert len(prod)==2, f'expected exactly 2 production import doors, got {len(prod)}:\n'+out
print('OK')
"</automated>
  </verify>
  <done>
`en/gamelib.json` carries the three new `installFlows.import*` keys. `MainButton.tsx` contains no
import door and no `button.import` reference. `GameSubMenu/index.tsx` carries exactly one, gated
`!isInstalled && !isSteam`. Exactly two production `action: 'import'` sites remain in
`src/frontend` (GameSubMenu + DownloadDialog). `ImportDialog` renders the explainer above the path
picker and a confirm label distinct from the door label. `SideloadDialog`'s inline hint quotes the
new label. `pnpm codecheck` and `pnpm lint:src` both pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fill the three new keys across all 48 non-English locales</name>
  <files>public/locales/*/gamelib.json</files>
  <action>
This is the task that keeps CI green. Skipping it, or filling only de/fr, turns R13 red with 138
named unrecorded pairs.

**Do it with one script, not 48 hand edits.** Write a single throwaway Python script (put it in the
scratchpad, not the repo) that takes a literal table of 48 locales x 3 strings and applies it. The
script must:

1. **Round-trip before mutating, per file, and refuse to write ANY file until ALL 48 pass.** Detect
   each catalog's `(indent, ensure_ascii, trailing-newline)` combo by finding the one where
   `json.dumps(json.load(f), **combo)` reproduces the original bytes exactly. Every locale measured
   in a prior sweep was `(4, False, True)` — verify, do not assume.
2. **Insert order-preservingly**: place the new keys inside the existing `installFlows` object,
   before the first existing key that sorts after them. Do NOT rebuild the object in `en` key order
   — several locales' key order is not a subsequence of `en`, and a global `sorted()` reflows them
   and turns a 3-line diff into a large one.
3. Assert `installFlows` already exists in every locale before writing (it does — the baseline is at
   `totalPairs: 0`), and fail loudly rather than creating it if not.

**Translation content rules:**
- Read house style from each locale's OWN existing strings — particularly its existing
  `installFlows.pathRejectedBodyImport` and `steam.install.withOptionsLabel` — and follow the
  formality it already uses (`de` Sie, `es`/`it` tú/tu, `id` Anda). Do not impose a dictionary.
- There is NO identical-to-English check in `validateTranslation`, so a locale that genuinely uses
  the English term is legal — but do not use that as a shortcut for all 48.
- Keep the trailing `…` on `importDoorLabel` for consistency with each locale's own
  `withOptionsLabel`.
- No placeholders, no tags, no glossary terms — so `validateTranslation` constrains only
  non-emptiness. Every value must be non-empty; an empty string is treated as unfilled and counts
  as a missing pair.

**Pre-flight the whole table before the first write**: locale set vs the real directories on disk,
`installFlows` presence per locale, no empties, and all three keys present in the table for all 48.
Target zero errors before writing anything.

Do NOT touch `public/locales/*/gamelib.mt.json`. `gamelibCatalogParity.test.ts` checks manifest ⊆
catalog and never catalog ⊆ manifest, so extra catalog keys are fine — and not stamping
machine-translation provenance on hand-written strings is the honest record. Note in the SUMMARY
that `machineFillGamelib.ts`'s never-overwrite behaviour means these strings are permanent until
someone deliberately deletes them.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && python3 -c "
import json,glob
keys=['importDoorLabel','importConfirmLabel','importExplainer']
bad=[]
paths=sorted(glob.glob('public/locales/*/gamelib.json'))
assert len(paths)==49, f'expected 49 catalogs, found {len(paths)}'
for p in paths:
    loc=p.split('/')[2]; d=json.load(open(p)).get('installFlows',{})
    for k in keys:
        if not d.get(k): bad.append(f'{loc}:{k}')
assert not bad, 'unfilled: '+', '.join(bad)
print('OK 49/49 x 3')
" && npx jest --testPathPattern "meta/__tests__/lintTranslations.test.ts" -t "R13" --passWithNoTests && npx jest --testPathPattern "gamelibCatalogParity" --passWithNoTests && pnpm lint-translations:gamelib</automated>
  </verify>
  <done>
All 49 `gamelib.json` catalogs carry non-empty `installFlows.importDoorLabel`,
`installFlows.importConfirmLabel` and `installFlows.importExplainer`. R13 reports zero drift against
the committed baseline, which is still at `totalPairs: 0` and UNCHANGED (`git diff --exit-code
meta/i18nCatalogPresenceBaseline.json` is clean). `gamelibCatalogParity` passes. No
`gamelib.mt.json` was modified. Per-locale diffs are ~3 lines each, not reflows.
  </done>
</task>

<task type="auto">
  <name>Task 3: Pin the demotion with an element-graph test, close the todo, file the Trans follow-up</name>
  <files>
src/frontend/screens/Game/GamePage/components/__tests__/MainButton.importDemotion.test.tsx,
.planning/todos/pending/2026-08-29-import-game-is-unlabelled-and-over-promoted-rename-demote-an.md,
.planning/todos/completed/2026-08-29-import-game-is-unlabelled-and-over-promoted-rename-demote-an.md,
.planning/todos/pending/2026-09-16-sideload-import-hint-trans-uses-key-not-i18nkey.md
  </files>
  <action>
**The test.** Create `MainButton.importDemotion.test.tsx`, copying the harness from its sibling
`MainButton.installClickRouting.test.tsx` — that file already mocks `react` (useContext),
`react-i18next` (useTranslation), `frontend/state/InstallGameModal` (so `openInstallGameModal` is a
jest.Mock), and `Dropdown/index.tsx` (it imports `./index.scss`, which kills the suite under
`testEnvironment: 'node'`). Do not invent a new harness; do not reach for jsdom, it is not
installed.

Assert, for an UNINSTALLED non-Steam game (`runner: 'gog'`, `is_installed: false`, default `is`):
1. Walk every `<button>` in the returned element graph, `await` each one's `onClick`, and assert
   `openInstallGameModal` is never called with an object whose `action` is `'import'`. Clear the
   mock between buttons. This is the real gate — it proves the ROUTING is gone, not merely that a
   string is absent.
2. No element in the graph renders the door label. Assert on the label the component actually
   produces under the test's `useTranslation` mock, whatever that mock returns — do not assert on a
   retyped display copy of the string; an anchor retyped from rendered output silently no-ops.
3. Repeat (1) for `runner: 'sideload'` and for a `thirdPartyManagedApp` game, so the suite records
   that these runners lost the MainButton door — this is the assertion that will go red if someone
   later "restores" it, and the D-02 rationale for why GameSubMenu had to receive it.

Write a VACUITY BOUNDARY docstring in the same style as the sibling suites: state plainly that this
proves the element graph of `MainButton` only, and proves NOTHING about `GameSubMenu` (which cannot
be called bare — it imports `./index.css` with no moduleNameMapper for it, and uses six `useState`
hooks plus effects). GameSubMenu's half is covered by Task 1's `action: 'import'` census, and that
census is source-shaped, which is weaker. Say so; do not overclaim.

**Prove the test is not vacuous before moving on**: temporarily re-add the deleted MainButton block,
confirm the new suite goes RED, then revert. Record that in the SUMMARY. A test named for a bug it
sits upstream of passes unfixed.

**Close the todo.** Append a `## Resolution` section to
`.planning/todos/pending/2026-08-29-import-game-is-unlabelled-and-over-promoted-rename-demote-an.md`
naming quick ID `260916-cdb`, the operator's 2026-09-16 decision on item 3 (keep + rename + demote),
the three new keys, and the five call sites. Explicitly record that its two Related todos
(`2026-08-24-importgame-does-not-validate...` and `2026-08-24-importgame-wineprefix-wineversion...`)
**stay OPEN**, because those said "if import is deleted, that todo dies with it" and import was not
deleted. Also record what was NOT done: `gamepage.json`'s `button.import` is left orphaned in 47
locales by design.

Then move the file to `.planning/todos/completed/` with plain `mv`, and `git add` both the old and
new paths. **Do NOT use `git mv`** — it stages HEAD content and would drop the Resolution section
you just wrote. After staging, verify the staged blob actually contains "Resolution" via
`git show :<newpath> | grep -c Resolution`, not the worktree.

**File the follow-up.** Create
`.planning/todos/pending/2026-09-16-sideload-import-hint-trans-uses-key-not-i18nkey.md` for the
latent bug: `SideloadDialog/index.tsx:376` passes `key=` where i18next needs `i18nKey=`, so that
`<Trans>` has no i18n key, renders its inline English children, and the 47 translated
`sideload.import-hint.content` strings are dead. Record the trap that makes it more than a one-char
fix: **all 47 translated copies quote the OLD "Import Game" label**, so repairing the prop without
sweeping them would ship 47 locales pointing users at a button that no longer exists — which is
strictly worse than the current dead-but-harmless state. That is why it was fenced out of this task.

Frontmatter must carry, in this exact order and bare/lowercase (CI-gated by `pnpm planning-gates`
via `.planning/todos/todo-frontmatter-gate.py`):
```yaml
severity: minor
platform: any
ready: code
```
with `created`, `title`, `area`, `files` around them per the observed convention, plus a `found_by:`
line naming `quick-260916-cdb`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --testPathPattern "MainButton" --passWithNoTests && pnpm planning-gates && test ! -f .planning/todos/pending/2026-08-29-import-game-is-unlabelled-and-over-promoted-rename-demote-an.md && grep -qc Resolution .planning/todos/completed/2026-08-29-import-game-is-unlabelled-and-over-promoted-rename-demote-an.md && test -f .planning/todos/pending/2026-09-16-sideload-import-hint-trans-uses-key-not-i18nkey.md && grep -v '^#' .planning/todos/pending/2026-09-16-sideload-import-hint-trans-uses-key-not-i18nkey.md | grep -qc '^ready: code$' && echo ALL_OK</automated>
  </verify>
  <done>
`MainButton.importDemotion.test.tsx` exists, passes, and was proven non-vacuous by a revert-the-fix
run recorded in the SUMMARY. Every `MainButton*` suite is green. The 2026-08-29 todo is in
`completed/` with a Resolution section present in the STAGED blob, and the two Related todos remain
in `pending/`. The new Trans follow-up todo is in `pending/` and `pnpm planning-gates` passes.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none crossed | Frontend label and placement change only. No new input is parsed, no network call, no filesystem path is constructed, no IPC surface changes. `importGame`'s existing path hardening is untouched. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cdb-01 | Denial of Service | import reachability for `sideload` / `thirdPartyManagedApp` runners | mitigate | These runners never reach DownloadDialog (`InstallModal/index.tsx:629`, `:706-761`), so deleting the Game-page door without a replacement would make import unreachable for them. Task 1 rebuilds the door in `GameSubMenu` with NO `isThirdPartyManaged` exclusion; Task 3 spec 3 asserts it for both runners. |
| T-cdb-02 | Tampering | `meta/i18nCatalogPresenceBaseline.json` | mitigate | A red R13 invites "fixing" the gate by regenerating the baseline, converting a 49/49 parity win into a permanent recorded gap behind a green check. Task 2's `<done>` requires `git diff --exit-code` on that file to be clean. |
| T-cdb-03 | Information Disclosure | n/a | accept | No secrets, no PII, no credentials touched. |
| T-cdb-SC | Tampering | npm/pip/cargo installs | mitigate | **No package installs in this plan.** If any task appears to need one, stop — jsdom in particular is deliberately absent and adding it requires a blocking human package-legitimacy checkpoint. |
</threat_model>

<verification>
```bash
pnpm codecheck
pnpm lint:src
npx jest --testPathPattern "MainButton" --passWithNoTests
npx jest --testPathPattern "meta/__tests__/lintTranslations.test.ts" --passWithNoTests
npx jest --testPathPattern "gamelibCatalogParity" --passWithNoTests
pnpm lint-translations:gamelib
pnpm planning-gates
git diff --exit-code meta/i18nCatalogPresenceBaseline.json
git diff --stat -- public/locales | tail -3
```

`pnpm test:ci` is RED at HEAD for an unrelated reason (a leaked store-embed timer). Do not attribute
that to this work, and do not use a full-suite run as this plan's gate — run the targeted patterns
above. If you do run the full suite, name the baseline sha you compared against.

`git diff --stat -- public/locales` should show ~49 files with small (~3-6 line) changes each. A
locale showing a large diff means the order-preserving insert failed and reflowed that file — fix it
rather than committing the reflow.
</verification>

<success_criteria>
- [ ] Nothing in the primary install row on an uninstalled non-Steam game page opens the import modal
- [ ] `GameSubMenu` carries exactly one import door, gated `!isInstalled && !isSteam`, reachable for `sideload` and `thirdPartyManagedApp` runners
- [ ] Exactly two production `action: 'import'` sites in `src/frontend`
- [ ] Both doors read "Locate existing installation…"; the ImportDialog confirm reads a DIFFERENT string
- [ ] The ImportDialog explains what import does, above the path picker and below `{children}`
- [ ] The SideloadDialog hint quotes the new label
- [ ] All 3 new keys non-empty in all 49 `gamelib.json` catalogs; R13 green; baseline file unchanged
- [ ] `gamepage.json` untouched in all 49 locales
- [ ] `MainButton.importDemotion.test.tsx` green AND proven non-vacuous by a revert run
- [ ] The 2026-08-29 todo is in `completed/` with a staged Resolution section; its two Related todos still in `pending/`
- [ ] The `key=` vs `i18nKey=` follow-up todo filed with gate-valid frontmatter
- [ ] No backend, IPC or store-manager file modified
- [ ] No new npm package installed
</success_criteria>

<output>
Create `.planning/quick/260916-cdb-rename-import-game-label-and-demote-it-t/260916-cdb-SUMMARY.md` when done.

The SUMMARY must record, at minimum:
- The non-vacuity result for `MainButton.importDemotion.test.tsx` (what turned red when the deleted
  block was temporarily restored)
- That the 48-locale strings were HAND-WRITTEN, not machine-filled, and are therefore permanent
  under `machineFillGamelib.ts`'s never-overwrite rule
- That `gamepage.json`'s `button.import` is deliberately left orphaned in 47 locales
- The `SideloadDialog` `key=`/`i18nKey=` follow-up todo filename
- That GameSubMenu's half of the demotion rests on a source-shaped census, not a render test,
  because the component cannot be called bare in this repo's jest setup
</output>
