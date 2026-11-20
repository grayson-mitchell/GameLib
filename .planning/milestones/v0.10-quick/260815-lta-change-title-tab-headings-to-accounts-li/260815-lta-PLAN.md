---
phase: quick-260815-lta
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/NavShell/components/NavTabs/index.tsx
  - src/frontend/components/UI/NavShell/components/NavTabs/index.scss
  - src/frontend/components/UI/NavShell/__tests__/NavTabsComponent.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx
  - public/locales/en/translation.json
autonomous: false
requirements: [QUICK-260815-lta-01, QUICK-260815-lta-02, QUICK-260815-lta-03]

must_haves:
  truths:
    - "The tier-1 nav tab strip reads ACCOUNTS, LIBRARY, STORES, SETTINGS, left to right, in that order."
    - "The all-caps presentation comes from `text-transform: uppercase` in `NavTabs/index.scss`, NOT from any uppercase string literal in source and NOT from any uppercase value in a locale catalog."
    - "Every one of the four labels is still resolved through a `t('key', 'Default')` call — no bare string literal reaches a `label=` prop."
    - "The shared, app-wide keys `stores` and `Settings` keep their existing keys AND values — `Settings` is also consumed by `SettingsModal/index.tsx`, and nothing outside this tab strip changes."
    - "The two renamed labels resolve through new fork-minted keys `nav.tabs.accounts` and `nav.tabs.library`; `nav.tabs.games` and `userselector.manageaccounts` are no longer referenced from `NavTabs/index.tsx`."
    - "`userselector.manageaccounts` keeps its value in all 45 locales that translate it — it is abandoned by this component, never repurposed."
    - "`git diff --name-only -- public/locales` is EMPTY whenever a test command runs, so `meta/__tests__/i18nCatalogChurnGuard.test.ts`'s `live tree` assertion stays satisfied; the only staged locale path is `public/locales/en/translation.json`."
    - "Tab routing is untouched: the four `value`/`id`/`to` props still read accounts|games|stores|settings, tab-0..tab-3, /login | / | /store/{default} | /settings/general."
    - "The targeted jest suites pass: the whole `NavShell/__tests__` directory, `src/frontend/__tests__/muiTabsSelectorScoping.test.ts`, and the Meta project's `i18nCatalogChurnGuard` + `hardcodedStringGate`."
  artifacts:
    - path: "src/frontend/components/UI/NavShell/components/NavTabs/index.tsx"
      provides: "Four tab labels, two re-keyed to nav.tabs.accounts / nav.tabs.library with natural-case English defaults"
      contains: "nav.tabs.library"
    - path: "src/frontend/components/UI/NavShell/components/NavTabs/index.scss"
      provides: "text-transform: uppercase on .NavTabs .MuiTab-root, replacing the retired `none` override, with a comment that no longer contradicts the behaviour"
      contains: "text-transform: uppercase"
    - path: "public/locales/en/translation.json"
      provides: "nav.tabs.accounts + nav.tabs.library, replacing the now-dead nav.tabs.games this fork minted in 34.10-10"
      contains: "\"library\": \"Library\""
    - path: "src/frontend/components/UI/NavShell/__tests__/NavTabsComponent.test.tsx"
      provides: "Updated label expectations, a re-pointed source key gate read through stripSourceComments, an all-caps-is-CSS-not-content gate, and the flipped stylesheet text-transform gate — each prohibition with its SANITY counter-check"
    - path: "src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx"
      provides: "Updated destination-union expectation (Accounts / Library)"
  key_links:
    - from: "src/frontend/components/UI/NavShell/components/NavTabs/index.tsx"
      to: "public/locales/en/translation.json"
      via: "i18next default-namespace key lookup"
      pattern: "nav\\.tabs\\.(accounts|library)"
    - from: "src/frontend/components/UI/NavShell/components/NavTabs/index.scss"
      to: "the rendered tab labels"
      via: "text-transform on .NavTabs .MuiTab-root"
      pattern: "text-transform:\\s*uppercase"
---

<objective>
Change the tier-1 nav tab headings to read **ACCOUNTS**, **LIBRARY**, **STORES**, **SETTINGS**.

Purpose: two distinct changes ride together — a *label rename* for the first two tabs
("Manage Accounts" → "Accounts", "Games" → "Library"), and an *all-caps presentation* for
all four. Keeping these concerns separate is the point of the plan: the rename is content
(i18n keys + catalog), the caps are presentation (CSS). Conflating them — by writing
`'ACCOUNTS'` into a source string or `"LIBRARY"` into a catalog — would force ASCII caps
onto 48 non-English locales and destroy translator-authored casing.

Output: renamed + re-keyed labels, an `uppercase` stylesheet rule with a truthful comment,
an en-only catalog sync, and updated gates in the two suites that pin the old text.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

@src/frontend/components/UI/NavShell/components/NavTabs/index.tsx
@src/frontend/components/UI/NavShell/components/NavTabs/index.scss
@src/frontend/components/UI/NavShell/__tests__/NavTabsComponent.test.tsx
@src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx

Project skill (nav shell design decisions): `.claude/skills/sketch-findings-gamelib/references/navigation-shell.md`
</context>

<scouting_findings>

Verified against the tree during planning. Do NOT re-derive, but DO re-verify anything you
intend to depend on.

### 1. The defaultValue argument alone CANNOT change the rendered English text

`src/frontend/index.tsx:137-200` initialises i18next with no `ns`/`defaultNS` override, so
the default namespace is `translation`, backed by `public/locales/{lng}/translation.json`.
Both current keys are already present there:

| Key | en value | Locales carrying it |
|-----|----------|---------------------|
| `nav.tabs.games` | `"Games"` | **en only** (minted by this fork in `3202f2ed6`, "feat(34.10-10): sync nav.tabs.games translation key") |
| `userselector.manageaccounts` | `"Manage Accounts"` | **45 locales**, genuinely translated (`ar` = "أدر الحسابات", `az` = "Hesabları idarə et", …) |

i18next's second `t()` argument is a *defaultValue* — consulted **only when the key is
missing**. Both keys exist, so `t('nav.tabs.games', 'Library')` would still render "Games".
The rename requires new keys, not new defaults.

### 2. Reusing `userselector.manageaccounts` is not an option

45 locales translate it as *Manage Accounts*. Repurposing it would leave every non-English
user reading the old, longer phrase and would require touching 45 upstream catalogs.
Abandon the key instead — nothing else in `src/` references it (grep-verified).

### 3. `stores` and `Settings` are shared app-wide — their values must NOT change

`t('Settings', 'Settings')` is also called by
`src/frontend/screens/Settings/components/SettingsModal/index.tsx:40`. Both are plain
upstream `translation.json` keys. Uppercasing via CSS is what makes this safe: **neither key
is touched at all.** This is the strongest reason the caps must be presentation, not content.

### 4. The upstream-catalog churn guard is a live working-tree assertion

`meta/__tests__/i18nCatalogChurnGuard.test.ts`'s `live tree` block runs
`git diff --name-only -- public/locales` and requires the *upstream* bucket (anything not
`gamelib.json`/`gamelib.mt.json`) to be **empty**. It rides `pnpm test:ci`.

`git diff` compares **worktree vs index**, so an edit to `public/locales/en/translation.json`
trips it *while unstaged* and passes once staged. **Stage the catalog file before running any
test command.** Task 1 makes this an explicit, ordered step.

### 5. Namespace decision: default `translation` namespace, NOT `gamelib:`

D-06's split-brain rule normally sends new fork strings to `gamelib.json`. This component is
a deliberate, recorded exception:

- `NavTabsComponent.test.tsx:277` asserts `expect(source).not.toMatch(/gamelib:/)` — a local
  decision about this one file.
- `nav.tabs.games` was itself minted in the default namespace and hand-synced en-only in
  `3202f2ed6`. That commit is the exact precedent this task follows.
- All four labels resolving from one namespace keeps the strip coherent; two of four
  arriving via `gamelib:` would not.

**Do not mint `gamelib:`-prefixed keys in this file.** Do not run `pnpm i18n` — it emits
broad pre-existing upstream drift that `3202f2ed6` had to revert by hand. The Task 1 edit
reproduces exactly what the parser would emit for these keys, so a future parser run is a
no-op for `nav.tabs`.

### 6. Every place that asserts the old text — enumerated, not "any failing test"

All paths below are under `src/frontend/components/UI/NavShell/__tests__/`.

| File | Line(s) | What it pins |
|------|---------|--------------|
| `NavTabsComponent.test.tsx` | 170-178 | label array `['Manage Accounts','Games','Stores','Settings']` |
| `NavTabsComponent.test.tsx` | 271-283 | source gate: exactly one `nav.tabs.games`, no `gamelib:`, + its SANITY twin |
| `NavTabsComponent.test.tsx` | 293-296 | SANITY knownBad `<Tab label="Games" …>` |
| `NavTabsComponent.test.tsx` | 355-358 | stylesheet gate: `text-transform: none` must be present |
| `destinationCoverage.test.tsx` | 249-252 | destination union starts `'Manage Accounts','Games','Stores','Settings'` |
| `destinationCoverage.test.tsx` | 27-28, 290 | prose only (comment + `describe` name) — no gate reads these |

**Explicitly NOT affected** (checked — leave alone):
- `NavItem.test.tsx`'s `label: 'Games'` — a synthetic `NavItem` fixture, unrelated to the tab strip.
- `navTabs.ts` / `navTabs.test.ts` / `NavShell.test.tsx` — these pin tab **ids** (`'games'`), not labels. Ids do not change.
- `appShellLayout.test.ts` and `muiTabsSelectorScoping.test.ts` — they scan `NavTabs/index.scss` for MUI-selector scoping, literal colours and the seam recipe. The Task 2 edit stays inside the existing nested `.MuiTab-root` block, so they stay green; run them anyway as the regression net.
- `e2e/` — no Playwright spec references any tab label (grep-verified).

### 7. Verified jest invocations (both run in well under a second)

```
npx jest --selectProjects Frontend --silent NavShell muiTabsSelectorScoping
npx jest --selectProjects Meta --silent i18nCatalogChurnGuard hardcodedStringGate
```

Display names confirmed at `src/frontend/jest.config.js:16` and `meta/jest.config.js:6`;
both commands were executed during planning and passed. `NavTabs/index.tsx` is in the
hardcoded-string gate's committed scope (`meta/i18nGateScope.json`), so that gate really
does cover this file.

</scouting_findings>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Re-key the two renamed labels and sync the en catalog</name>
  <files>
src/frontend/components/UI/NavShell/components/NavTabs/index.tsx,
public/locales/en/translation.json,
src/frontend/components/UI/NavShell/__tests__/NavTabsComponent.test.tsx,
src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx
  </files>
  <behavior>
    - `NavTabs()`'s four tab labels resolve, in order, to `Accounts`, `Library`, `Stores`, `Settings` (natural case — the caps arrive in Task 2).
    - `NavTabs/index.tsx`, read through `stripSourceComments`, contains exactly one `nav.tabs.accounts`, exactly one `nav.tabs.library`, zero `nav.tabs.games`, zero `userselector.manageaccounts`, zero `gamelib:`.
    - `NavTabs/index.tsx`, read through `stripSourceComments`, contains no ALL-CAPS user-facing string literal (`'ACCOUNTS'`, `'LIBRARY'`, `'STORES'`, `'SETTINGS'`).
    - Each new prohibition has a SANITY counter-check that fires against a known-bad literal, matching this file's established convention.
    - Tab `value`, `id` and `to` props are byte-for-byte unchanged.
  </behavior>
  <action>
**A. `src/frontend/components/UI/NavShell/components/NavTabs/index.tsx`**

Change exactly two `label=` props; touch nothing else in the JSX:

- line 90: `label={t('userselector.manageaccounts', 'Manage Accounts')}` becomes `label={t('nav.tabs.accounts', 'Accounts')}`
- line 100: `label={t('nav.tabs.games', 'Games')}` becomes `label={t('nav.tabs.library', 'Library')}`

Leave lines 111 (`t('stores', 'Stores')`) and 121 (`t('Settings', 'Settings')`) **exactly as
they are** — see scouting §3. Leave every `value`, `id`, `to`, `icon`, `iconPosition`,
`disableRipple` and `onClick` untouched: `value="games"` and `NAV_TAB_INDEX.games` are
route/DOM identifiers, not labels, and six other suites pin them.

Amend the file's JSDoc (lines 21-43): the phrase at line 27 about "the separate Manage
Accounts item" is historically accurate about the *retired sidebar item* it promoted — keep
that, but add one clause noting the tab is now labelled "Accounts" and that the caps are
applied by the colocated stylesheet, not by the string. Because the Task 1 source gate reads
this file through `stripSourceComments`, naming the retired keys in a comment is safe — but
keep it short.

**B. `public/locales/en/translation.json`** (en ONLY — never any other locale)

The `nav` block is at line 728. Replace its single `games` entry with the two new keys,
alphabetically sorted, preserving the file's 4-space-per-level indentation:

```
    "nav": {
        "tabs": {
            "accounts": "Accounts",
            "library": "Library"
        }
    },
```

Rationale for deleting `"games": "Games"` rather than leaving it: this fork minted it in
`3202f2ed6` solely for this tab, it exists in **no other locale**, and nothing in `src/`
references it after step A. `keepRemoved: true` would otherwise preserve a dead "Games"
entry beside a live "Library" one forever.

Do **not** open, and do not let any tool touch,
`public/locales/{ar,az,…}/translation.json`, `gamepage.json`, `login.json` or `gamelib.json`.
Do **not** run `pnpm i18n`.

**C. Stage the catalog file immediately, before running any test command**

```
git add public/locales/en/translation.json
```

Load-bearing, not hygiene: the churn guard's `live tree` block diffs worktree-vs-index and
fails while this edit is unstaged (scouting §4). Stage ONLY this path — the working tree
carries unrelated uncommitted changes from a concurrent session
(`src/backend/appshell/themes.ts`, `src/backend/config.ts`, `src/backend/main.ts`,
`src/backend/sidecar/appShellFlowRegistration.ts`, `src/common/types.ts`,
`src/common/types/ipc.ts`, `src/preload/api/helpers.ts`).
**Never `git add -A` or `git add .` anywhere in this plan.**

**D. `NavTabsComponent.test.tsx`**

1. Hoist two new detectors beside the existing ones (lines 28-32):

```ts
const RETIRED_LABEL_KEY_PATTERN = /nav\.tabs\.games|userselector\.manageaccounts/
const BAKED_CAPS_PATTERN = /'(ACCOUNTS|LIBRARY|STORES|SETTINGS)'/
```

2. Lines 170-178 — retitle to `'resolves labels to Accounts, Library, Stores, Settings in that order'`
   and change the expected array to `['Accounts', 'Library', 'Stores', 'Settings']`.

3. Lines 271-278 — replace the `nav.tabs.games` source gate. Read through
   `stripSourceComments` (already imported at line 22) so the gate measures code, not prose:

```ts
it('mints exactly one nav.tabs.accounts and one nav.tabs.library key, references no retired label key, and uses no gamelib: prefix', () => {
  const source = stripSourceComments(
    readFileSync(join(__dirname, '..', 'components', 'NavTabs', 'index.tsx'), 'utf8')
  )
  expect((source.match(/nav\.tabs\.accounts/g) ?? []).length).toBe(1)
  expect((source.match(/nav\.tabs\.library/g) ?? []).length).toBe(1)
  expect(source).not.toMatch(RETIRED_LABEL_KEY_PATTERN)
  expect(source).not.toMatch(GAMELIB_PREFIX_PATTERN)
})
```

4. Add the retired-key SANITY twin immediately after it:

```ts
it('SANITY: the retired-label-key prohibition above fires against a known-bad input -- proves it is not vacuously true', () => {
  expect("t('nav.tabs.games', 'Library')").toMatch(RETIRED_LABEL_KEY_PATTERN)
  expect("t('userselector.manageaccounts', 'Accounts')").toMatch(RETIRED_LABEL_KEY_PATTERN)
})
```

5. Line 281 — repoint the existing `gamelib:` SANITY knownBad to
   `"t('gamelib:nav.tabs.library', 'Library')"` so it stays aligned with the live keys.

6. Add the all-caps-is-not-content gate plus its SANITY twin. This is the localisation
   invariant the whole plan exists to protect:

```ts
it('never bakes the all-caps presentation into a source string literal -- the caps are CSS', () => {
  const source = stripSourceComments(
    readFileSync(join(__dirname, '..', 'components', 'NavTabs', 'index.tsx'), 'utf8')
  )
  expect(source).not.toMatch(BAKED_CAPS_PATTERN)
})

it('SANITY: the baked-caps prohibition above fires against a known-bad input -- proves it is not vacuously true', () => {
  expect("t('nav.tabs.library', 'LIBRARY')").toMatch(BAKED_CAPS_PATTERN)
})
```

7. Line 294 — update the bare-`label=` SANITY knownBad to `'<Tab label="Library" value="games" />'`.

Leave the stylesheet `describe` block (lines 299-359) alone in this task — the SCSS still
says `text-transform: none`, so its gate is still true and the tree stays green after Task 1.

**E. `destinationCoverage.test.tsx`**

- Lines 249-252 of the union array: `'Manage Accounts'` becomes `'Accounts'`, `'Games'`
  becomes `'Library'`. All 20 other entries are unchanged.
- Prose coherence (no gate reads these, but stale prose misleads): the comment at lines 27-28
  and the `describe` title at line 290 ("Manage Accounts entry point") should say "Accounts".
  The assertions inside that block target `to === '/login'` and `not.toContain('Login')` —
  both still correct, do not change them.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; git add public/locales/en/translation.json &amp;&amp; npx jest --selectProjects Frontend --silent NavShell muiTabsSelectorScoping &amp;&amp; npx jest --selectProjects Meta --silent i18nCatalogChurnGuard hardcodedStringGate &amp;&amp; test -z "$(git diff --name-only -- public/locales)" &amp;&amp; test "$(git diff --cached --name-only -- public/locales)" = "public/locales/en/translation.json" &amp;&amp; node -e "const t=require('./public/locales/en/translation.json').nav.tabs; if(t.accounts!=='Accounts'||t.library!=='Library'||'games' in t){throw new Error('nav.tabs is '+JSON.stringify(t))}" &amp;&amp; node -e "const s=require('fs').readFileSync('src/frontend/components/UI/NavShell/components/NavTabs/index.tsx','utf8'); for(const p of [/value=\"accounts\"/,/value=\"games\"/,/value=\"stores\"/,/value=\"settings\"/,/to=\"\/login\"/,/to=\"\/settings\/general\"/,/t\('stores', 'Stores'\)/,/t\('Settings', 'Settings'\)/]) if(!p.test(s)) throw new Error('untouched-prop regression: '+p)"</automated>
  </verify>
  <done>
Every NavShell suite, `muiTabsSelectorScoping`, and the Meta churn-guard + hardcoded-string
gate pass. `public/locales` has zero unstaged changes and exactly one staged path
(`en/translation.json`). `nav.tabs` is `{accounts, library}` with no `games`. All four tab
`value`/`to` props and the two shared `stores`/`Settings` `t()` calls are provably unchanged.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Flip the stylesheet to uppercase and retire the comment that contradicts it</name>
  <files>
src/frontend/components/UI/NavShell/components/NavTabs/index.scss,
src/frontend/components/UI/NavShell/__tests__/NavTabsComponent.test.tsx
  </files>
  <behavior>
    - `NavTabs/index.scss`, comment-stripped, matches `/text-transform:\s*uppercase/`.
    - `NavTabs/index.scss`, comment-stripped, does NOT match `/text-transform:\s*none/`.
    - The `none` prohibition has a SANITY counter-check that fires against a known-bad literal.
    - Every `MuiTab*`/`MuiTabs*` selector in the file remains nested under `.NavTabs` (`appShellLayout.test.ts`'s "F-34.10-04 MUI scoping" gate), and the file still contains no hex colour literal.
  </behavior>
  <action>
**A. `src/frontend/components/UI/NavShell/components/NavTabs/index.scss`, lines 194-196**

Inside the existing `.NavTabs { … .MuiTab-root { … } }` block — do **not** add a new
top-level rule, `appShellLayout.test.ts:447-469` structurally forbids it — replace:

```scss
    // MUI uppercases tab labels by default, which would fight the
    // translated strings' own casing (e.g. "Manage Accounts").
    text-transform: none;
```

with an explicit `uppercase` declaration and a comment whose premise is the *new* behaviour.
It must state (a) the caps are a presentation decision, (b) *why* they are not baked into
the strings or catalogs, (c) that MUI's own uppercase default is deliberately not relied on.
Equivalent to:

```scss
    // Tier-1 tab labels are presented in all-caps (quick task 260815-lta).
    // Deliberately a PRESENTATION decision in CSS, not content: baking caps
    // into the English defaults or into public/locales/*/translation.json
    // would force ASCII caps onto all 48 non-English catalogs and destroy the
    // translators' own casing, whereas text-transform lets the engine apply
    // each language's own uppercasing rules. It also keeps the shared,
    // app-wide `stores` and `Settings` keys (the latter also consumed by
    // SettingsModal/index.tsx) completely untouched -- changing THEIR values
    // would have leaked well outside this tab strip. MUI's <Tab> happens to
    // default to uppercase, but that default is NOT relied on: it is restated
    // here so this file owns the decision and NavTabsComponent.test.tsx can
    // assert it from source.
    text-transform: uppercase;
```

Touch nothing else in the file. In particular leave
`min-height: calc((2 * var(--space-xs)) + 1.25em + 1px)` alone: uppercasing does not change
the label's line-box, so the F-34.10-04 seam arithmetic is unaffected.

Out of scope, do NOT add: `letter-spacing`, `font-size` or `font-weight` changes. The
sketch's uppercase micro-labels pair caps with `letter-spacing: .12em`, but that widens the
strip and is a separate design call — raise it at the Task 3 checkpoint if it reads badly.

**B. `NavTabsComponent.test.tsx`**

1. Hoist one more detector beside the others (lines 28-32):

```ts
const TEXT_TRANSFORM_NONE_PATTERN = /text-transform:\s*none/
```

2. Replace the stylesheet gate at lines 355-358 with a positive assertion plus a prohibition,
   and add the SANITY twin the prohibition requires:

```ts
it('presents tab labels in all-caps via CSS -- text-transform: uppercase is present and the retired none override is gone', () => {
  const source = readStripped()
  expect(source).toMatch(/text-transform:\s*uppercase/)
  expect(source).not.toMatch(TEXT_TRANSFORM_NONE_PATTERN)
})

it('SANITY: the text-transform none prohibition above fires against a known-bad input -- proves it is not vacuously true', () => {
  const knownBad = '.MuiTab-root { text-transform: none; }'
  expect(knownBad).toMatch(TEXT_TRANSFORM_NONE_PATTERN)
})
```

`readStripped()` (line 308) already comment-strips, so the new SCSS comment's prose cannot
satisfy or violate either assertion — but re-read your comment anyway and confirm it contains
no literal `text-transform: none` sequence. A prose/verification collision in this exact file
is a known recurring defect class in this project.

**C.** Re-check the staging invariant before finishing: `public/locales` must still show zero
unstaged paths. This task touches no catalog; the check exists to catch an accidental
`pnpm i18n` or a stray tool write.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; npx jest --selectProjects Frontend --silent NavShell muiTabsSelectorScoping &amp;&amp; npx jest --selectProjects Meta --silent i18nCatalogChurnGuard hardcodedStringGate &amp;&amp; test -z "$(git diff --name-only -- public/locales)" &amp;&amp; node -e "const s=require('fs').readFileSync('src/frontend/components/UI/NavShell/components/NavTabs/index.scss','utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*\$/gm,''); if(!/text-transform:\s*uppercase/.test(s)) throw new Error('uppercase rule missing'); if(/text-transform:\s*none/.test(s)) throw new Error('retired none override still present'); if(/^\.MuiTabs?-[a-zA-Z-]+\s*\{/m.test(s)) throw new Error('unscoped MUI selector introduced')" &amp;&amp; pnpm codecheck &amp;&amp; npx eslint src/frontend/components/UI/NavShell/components/NavTabs src/frontend/components/UI/NavShell/__tests__/NavTabsComponent.test.tsx src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx</automated>
  </verify>
  <done>
`.NavTabs .MuiTab-root` declares `text-transform: uppercase` with no surviving `none`
override, its comment states the presentation-vs-content rationale rather than the retired
one, every MUI selector is still nested under `.NavTabs`, the NavShell + scoping + Meta
suites pass, `pnpm codecheck` is clean, and eslint reports nothing on the touched files.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human verification -- the all-caps tab strip across three themes</name>
  <files>(none -- verification only)</files>
  <action>Pause. Present the <what-built> summary and the numbered <how-to-verify> steps below to the developer and wait for the resume signal. Do not self-approve, and do not proceed to the commit until the developer responds.</action>
  <what-built>
The tier-1 nav tab strip now renders **ACCOUNTS · LIBRARY · STORES · SETTINGS**. The two
renamed labels resolve through new fork keys (`nav.tabs.accounts`, `nav.tabs.library`) synced
into `public/locales/en/translation.json`; the all-caps look is `text-transform: uppercase`
on `.NavTabs .MuiTab-root`, so no string literal and no catalog value carries the caps, and
the shared `stores` / `Settings` keys were not touched at all.

Automated coverage already proves label order and text, key minting, absence of retired keys,
absence of baked caps, the stylesheet rule, MUI selector scoping, zero upstream catalog churn,
typecheck and lint. What it CANNOT prove — there is no CSS transform and no DOM in this jest
project — is how it looks.
  </what-built>
  <how-to-verify>
1. `pnpm tauri:dev` — **not** `tauri dev`, which serves a stale static bundle from
   `frontendDist` and would show you the old labels.
2. Look at the navbar. Confirm the four tabs read **ACCOUNTS**, **LIBRARY**, **STORES**,
   **SETTINGS**, in that left-to-right order.
3. Click each tab in turn and confirm routing is unchanged: ACCOUNTS goes to the Manage
   Accounts page, LIBRARY to the game library, STORES to your default store, SETTINGS to
   Settings → General.
4. Confirm the active tab still merges into the content surface with no visible seam or 1px
   gap along the navbar's bottom edge, and that the wordmark and Downloads ring still sit
   level with the tab strip (F-34.10-03 / F-34.10-04 regression check — the uppercase change
   should not have moved anything, but this is the surface those findings live on).
5. Confirm the four tabs still fit the navbar width without wrapping or clipping. ALL-CAPS is
   wider than mixed case and "SETTINGS" is the rightmost tab. If it is tight, say so.
6. Repeat steps 2, 4 and 5 in **each** of these themes (Settings → General → Theme), one at a
   time, because the navbar/body lightness inversion differs per theme:
   `midnightMirage`, `dracula`, `gruvbox_dark`.
7. Open Settings and confirm the Settings modal's own tab labels, and any other `<Tabs>` in
   the app (Wine Manager, Download Manager, Games settings), are **NOT** uppercased — the
   rule must stay scoped to `.NavTabs`.
8. Optional design call: if the caps read cramped, note whether you want
   `letter-spacing: .12em` added (the sketch's uppercase convention). It was deliberately
   left out of scope.
  </how-to-verify>
  <resume-signal>Type "approved", or describe what looks wrong (per theme, with the step number)</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| locale catalog files → renderer | JSON fetched by `i18next-http-backend` from `locales/{lng}/{ns}.json` and rendered as tab labels |
| (none new) | This plan adds no IPC surface, no network call, no user input path, no runtime filesystem write |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-260815-lta-01 | Tampering | `public/locales/en/translation.json` — a hand edit to a 1300-line shared catalog could corrupt unrelated keys or invalidate the JSON | mitigate | Task 1's verify parses the file with `node -e require(...)` (a parse failure throws) and asserts `nav.tabs` is exactly `{accounts, library}`; `git diff --cached --name-only -- public/locales` is asserted to equal exactly one path, so no other catalog can have been touched |
| T-260815-lta-02 | Tampering | Staging scope — the tree carries 7 unrelated modified files from a concurrent session; a broad `git add` would sweep another session's in-flight work into this commit | mitigate | Every staging instruction names an explicit path; `git add -A` / `git add .` are prohibited by name in Tasks 1 and 2 and in `<success_criteria>` |
| T-260815-lta-03 | Information disclosure | Rendered tab labels | accept | The four labels are static UI nouns with no user, account or path data; nothing to disclose |
| T-260815-lta-04 | Denial of service | `text-transform: uppercase` widening the tab strip until it wraps or clips on a narrow window | mitigate | Task 3 checkpoint steps 5 and 6 require a per-theme visual width check across `midnightMirage`, `dracula`, `gruvbox_dark` |
| T-260815-lta-05 | Elevation of privilege | — | accept | No permission, capability, IPC channel or Tauri command is added, removed or altered |
| T-260815-lta-SC | Tampering | npm/pip/cargo installs | n/a | **No package installs.** This plan adds zero dependencies — `package.json` and every lockfile are outside `files_modified`, so the package legitimacy gate has nothing to audit |
</threat_model>

<verification>
Run from the repo root after Task 2, before the checkpoint:

1. `npx jest --selectProjects Frontend --silent NavShell muiTabsSelectorScoping` — all
   NavShell suites plus the app-wide MUI-selector-scoping guard.
2. `npx jest --selectProjects Meta --silent i18nCatalogChurnGuard hardcodedStringGate` — the
   upstream-catalog churn guard's live-tree assertion and the ts-morph hardcoded-string gate
   that covers `NavTabs/index.tsx`.
3. `git status --porcelain public/locales` — must show exactly one line,
   `M  public/locales/en/translation.json`, with the `M` in the **staged** (first) column and
   a space in the second. Any unstaged locale change fails the churn guard.
4. `pnpm codecheck`, plus `npx eslint` on the four touched source/test files.
5. `git diff --cached --name-only && git diff --name-only` must together list only the five
   paths in `files_modified` plus the seven pre-existing unrelated files named in scouting §C.

A full `pnpm test:ci` is optional — the targeted runs above cover every suite that reads the
changed files — but if you do run it, make sure the catalog edit is staged first.
</verification>

<success_criteria>
- The nav tab strip reads ACCOUNTS, LIBRARY, STORES, SETTINGS in the running app.
- No uppercase literal exists in `NavTabs/index.tsx` and no uppercase value was written to any
  catalog — proven by the `BAKED_CAPS_PATTERN` gate and by `git diff` showing only
  `en/translation.json` under `public/locales`.
- `stores` and `Settings` keys and values are byte-identical to `main`.
- `userselector.manageaccounts` is unreferenced from this component and unchanged in all 45
  locales that translate it.
- All five verification steps above pass.
- The Task 3 human-verify checkpoint is approved for all three swept themes.
- The commit stages only the five paths in `files_modified` — no `git add -A`, no `git add .`.
</success_criteria>

<output>
Create `.planning/quick/260815-lta-change-title-tab-headings-to-accounts-li/260815-lta-SUMMARY.md` when done.

Record in it:
- The namespace decision and its rationale (default `translation` namespace, not `gamelib:`,
  following `3202f2ed6`'s precedent and this component's own recorded no-`gamelib:` gate).
- That `nav.tabs.games` was deleted from `en/translation.json`, and that
  `userselector.manageaccounts` was abandoned but left intact in all 45 locales.
- The checkpoint result per theme.
- Whether `letter-spacing` was requested at the checkpoint (carry-forward if so).
</output>
