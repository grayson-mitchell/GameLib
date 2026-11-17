# Phase 64: UI to edit themes - Pattern Map

**Mapped:** 2026-11-18
**Files analyzed:** 30 (new and modified)
**Analogs found:** 28 / 30 (all analog paths verified git-tracked via `git ls-files`)

Paths and line numbers are from the working tree at HEAD `031ef980a`. Excerpts come from files read this session; where a range was not read, the entry says so.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/frontend/customThemes/colour.ts` | utility | transform | `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` L528-572 (lift) | exact (lift) |
| `src/frontend/customThemes/tokenResolve.ts` | utility | transform | same file L425-526, L1539-1657 (lift) | exact (lift) |
| `src/frontend/customThemes/contrastFloors.ts` | utility | transform | same file L644 / L733 floor sites | role-match |
| `src/frontend/customThemes/tokens.ts` | config | transform | `src/frontend/components/UI/ThemeSelector/themeLabels.ts` (key table, `t()` literal pattern) | role-match |
| `src/frontend/customThemes/customTheme.ts` | model/utility | CRUD (validated parse) | `themeLabels.ts` `migrateThemeKey` (total fallback) + `src/common/types/storePolicy.ts` | partial |
| `src/frontend/customThemes/applyTheme.ts` | utility | request-response (DOM write) | `src/frontend/index.tsx` L317-339 `window.setTheme` | exact (extract) |
| `src/frontend/customThemes/thumbnailPalette.ts` | utility | transform | `NavShell/index.scss` and `_buttons.scss` fallback chains (CSS, not TS) | partial |
| `src/frontend/customThemes/builtinTokens.generated.ts` | generated data | batch | none for data; generator analog `meta/genIpcContract.ts` | role-match |
| `meta/genThemeTokens.ts` | script | batch | `meta/genIpcContract.ts` | role-match |
| `src/frontend/testUtils/scssTokenSource.ts` | utility | transform | `themeTokens.test.ts` L123-140, L425-504 (lift, make fs-free) | exact (lift) |
| `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` (modify) | test | transform | itself | exact |
| `src/frontend/components/UI/ThemeSelector/index.tsx` (modify) | component | CRUD | itself (current dropdown) | exact |
| `src/frontend/components/UI/ThemeSelector/ThemeGallery.tsx`, `ThemeCard.tsx` | component | CRUD | `ThemeSelector/index.tsx` + `SelectField/index.tsx` (RTL, FieldLabel) | role-match |
| `src/frontend/components/UI/ThemeSelector/ThemeThumbnail.tsx` | component | transform | none (no SVG analog); use RESEARCH Pattern 2 | no analog |
| `src/frontend/screens/Accessibility/index.tsx` (modify) | component | request-response | itself | exact |
| `src/frontend/screens/Accessibility/ThemeEditor/*` | component | CRUD | `Accessibility/index.tsx` (state hooks, i18n) + `TextInputField` | role-match |
| `src/frontend/App.tsx` (add route) | config | request-response | `App.tsx` L317-320 `accessibility` route | exact |
| `src/frontend/state/settingsState.ts` (modify) | store | CRUD | itself L90-102, L208-240 | exact |
| `src/frontend/index.tsx` (modify setTheme, boot) | config | request-response | itself L317-357 | exact |
| `src/common/types/typed_store.ts` (modify) | config | CRUD | itself L34 `theme: string` | exact |
| `src/common/types/storePolicy.ts` (modify) | config | CRUD | itself L88-110 allowlist | exact |
| `src/common/types/__tests__/storePolicy.test.ts` (modify) | test | CRUD | itself L293-297 `it.each` | exact |
| `public/locales/en/gamelib.json` (modify) | config | i18n | `themeSelector.*` keys (existing) | exact |
| `src/frontend/customThemes/__tests__/*.test.ts` | test | transform | `themeTokens.test.ts` (node env) | role-match |
| `ThemeSelector/__tests__/ThemeGallery.test.tsx`, `ThemeEditor/__tests__/*.test.tsx` | test | CRUD | `NoticeStack/__tests__/NoticeStackTwoToast.test.tsx` (jsdom docblock) | role-match |
| `src/frontend/state/__tests__/customThemesState.test.ts` | test | CRUD | `src/frontend/state/__tests__/uiState.test.ts` | role-match (not read) |

## Pattern Assignments

### `customThemes/colour.ts`, `tokenResolve.ts`, `testUtils/scssTokenSource.ts` (utility, transform)

**Analog:** `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` (private helpers; lift unchanged, tests pin exact ratios).

**Resolver to lift** (L507-526, `resolveValue`):
```typescript
const resolveValue = (value, scope: Map<string,string>, globals: Map<string,string>, seen = new Set<string>()): string | null => {
  const v = value.trim()
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(v)
  if (!m) return v
  const name = defined(m[1])           // src code must NOT import `defined` from __tests__: use an explicit guard
  const fallback = m[2]
  if (!seen.has(name)) {
    const next = scope.get(name) ?? globals.get(name)
    if (next !== undefined) {
      const r = resolveValue(next, scope, globals, new Set(seen).add(name))
      if (r !== null) return r
    }
  }
  return fallback ? resolveValue(fallback, scope, globals, seen) : null
}
```
**Merge order** (L496-504 `themeTokens`): `:root` colorSystem (`globalTokens`, L453), `body {}` base, then `body.<theme>` blocks, last wins.
**Colour math** (L528-572): `NAMED_COLOURS`, `toRgb` (drops 8-digit alpha, returns null on non-hex), `relativeLuminance`, `contrastRatio` (throws on uncomparable). Extract these legacy functions unchanged; add NEW total `parseColour` and `tryContrast` (returns null) for the editor (RESEARCH Pitfall 4). Also lift `mixSrgb`, `splitTopLevelCommas`, `parseColourMixArg`, `resolveColour` (L1539-1657) and `cssBlock` (L123), `customProps` (L425), `allBlocksFor` (L471), `declsAtDepthZero`, `nestedRules`. The test file reads SCSS via `read(relPath)` and `REPO_ROOT` (L29-34); the shared parsers take strings so the generator and the test both feed them.
**Gate to satisfy:** after refactor, `themeTokens.test.ts` must import these and define no local `contrastRatio`; every pinned number stays identical. knip: export only what has a consumer.

---

### `customThemes/applyTheme.ts` and `src/frontend/index.tsx` (modify)

**Analog:** `src/frontend/index.tsx` L317-357.
```typescript
window.setTheme = async (themeClass: string) => {
  if (!Object.keys(defaultThemes).includes(themeClass)) {
    themeClass = DEFAULT_THEME
  }
  document.body.className = themeClass
  if (navigator.windowControlsOverlay?.visible) {   // `?.` is required under Tauri WKWebView
    const titlebarOverlay = Object.fromEntries(
      ['height', 'color', 'symbol-color'].map((item) => [
          item === 'symbol-color' ? 'symbolColor' : item,
          getComputedStyle(document.body).getPropertyValue(`--titlebar-${item}`).trim()
        ]).filter(([, val]) => !!val))
    window.api.setTitleBarOverlay(titlebarOverlay)
  }
}
// boot, L352-357
const storedThemeClass = configStore.get('theme', DEFAULT_THEME)
const themeClass = migrateThemeKey(storedThemeClass)
if (themeClass !== storedThemeClass) configStore.set('theme', themeClass)
window.setTheme(themeClass)
```
Keep `setTheme` a thin wrapper that calls `applyTheme(document.body, key, customThemes, DEFAULT_THEME)` and keeps the titlebar tail unchanged. `index.tsx` is never imported by tests (comment at L62-67), so tests target `applyTheme.ts` under `@jest-environment jsdom`. Replace `document.body.className = ...` with removing only the 10 theme-key classes (RESEARCH Pitfall 5) and clear previously applied inline properties first. Boot reads `configStore.get('customThemes', [])` through `parseCustomThemes` synchronously (the store is hydrated before this line).

---

### `src/frontend/state/settingsState.ts` (store, CRUD)

**Analog:** itself.
**Setter pattern** (L99-102): write `configStore` first, then `set`, then side effect.
```typescript
setTheme: (newThemeName) => {
  configStore.set('theme', newThemeName)
  set({ theme: newThemeName })
  window.setTheme(newThemeName)
},
```
**Hydration pattern** (L208-216): initial state reads `configStore.get('theme', 'midnightMirage')`; add `customThemes: parseCustomThemes(configStore.get('customThemes', []))`. The file header (L11-14) already notes Phase 64 adds custom-theme state here; no persist middleware (setters write the store themselves). Add `customThemes` to the key union near L178 (`| 'theme'`). New setters (`addCustomTheme`, `updateCustomTheme`, `renameCustomTheme`, `deleteCustomTheme`) must build a new array (never mutate what `configStore.get` returns), write the whole `customThemes` key (never dotted per-id paths), and re-call `window.setTheme(theme)` only when `theme === 'custom:<id>'`. Save must await the write and surface the `saveFailed` toast on rejection (UI-SPEC).

---

### `src/common/types/storePolicy.ts`, `typed_store.ts`, `__tests__/storePolicy.test.ts` (config, CRUD)

**Analog:** the same files. Silent-no-persist trap (RESEARCH Pitfall 6): do all three in one task.
`storePolicy.ts` L88-110, append inside `configStore: [...]`:
```typescript
    'skipVcRuntime',
    'showSnapWarning',
    'customThemes'
  ],
```
`typed_store.ts` L34: add `customThemes: CustomTheme[]` beside `theme: string` (type-only import; keep `common/` free of `frontend/` imports, so define the interface under `src/common/types/` or type it as a structural literal).
`storePolicy.test.ts` L293-297 (writable `it.each`): add `['configStore', 'customThemes']`; also add an `isAllowedStoreField` assertion.

---

### `ThemeSelector/index.tsx`, `ThemeGallery.tsx`, `ThemeCard.tsx` (component, CRUD)

**Analog:** `src/frontend/components/UI/ThemeSelector/index.tsx` (whole file, 33 lines) and `themeLabels.ts`.
```typescript
import { useTranslation } from 'react-i18next'
import useSettingsState from 'frontend/state/settingsState'
import { defaultThemes, resolveThemeLabel } from './themeLabels'
export { defaultThemes }
export const ThemeSelector = () => {
  const { theme, setTheme } = useSettingsState.keys('theme', 'setTheme')
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  ...
```
Keep the `ThemeSelector` export and folder (placement test asserts `<ThemeSelector />` precedes `<UseFramelessWindow />`; `meta/i18nGateScope.json` entries). Render `<ThemeGallery/>` instead of `SelectField`; heading `t('setting.select_theme', 'Select Theme')`. RTL: `const isRTL = useSettingsState(selectIsRTL)` with `classnames({ isRTL })` as in `SelectField/index.tsx` L28-38; use logical CSS properties. Cards: `data-theme-key`, apply-button wrapper, action row outside the button. Note `.Accessibility label, span, select, option` is forced to `--text-xl !important` (Accessibility/index.css:40-45): gallery uses `div/p/h2/h3/button/small`. New strings: literal `t('gamelib:customThemes.<slug>', 'English', {...})` calls (hardcoded-string gate Pattern 1, see `themeLabels.ts` header L1-31; do not use tuple tables with `gamelib:` prefix).

---

### `ThemeSelector/ThemeThumbnail.tsx`, `customThemes/thumbnailPalette.ts` (component/utility, transform)

**Analog:** none in TS/TSX (no SVG component exists). Use RESEARCH Pattern 2 and UI-SPEC "Thumbnail Anatomy" table for geometry and fallback chains. Fallback chains copy real consumers (CSS, verified by research): `NavItem/index.scss:43` `var(--navbar-inactive, var(--navbar-accent))`, `NavShell/index.scss:229`, `_buttons.scss` L16/52/93/103. Every colour through `safeColour(value, fallback)` built on `parseColour`. Test in node env with `renderToStaticMarkup` (no jsdom).

---

### `screens/Accessibility/ThemeEditor/*` and `App.tsx` route (component, CRUD)

**Route analog:** `src/frontend/App.tsx` L317-320:
```typescript
{
  path: 'accessibility',
  lazy: makeLazyFunc(import('./screens/Accessibility'))
},
```
Add a sibling `path: 'accessibility/themes/:id'` with `lazy: makeLazyFunc(import('./screens/Accessibility/ThemeEditor'))`. App uses `createHashRouter` (L6/L335), so `useBlocker` is available; verify its signature against the installed react-router first (RESEARCH A3).
**Screen conventions analog:** `Accessibility/index.tsx` L1-30 (imports `useTranslation`, `useSettingsState`, `./index.css`, `selectIsRTL`). The editor is its own route and must not carry the `.Accessibility` class.
**Text input analog:** `TextInputField` (`UI/TextInputField/index.tsx` L1-40): props `htmlId, label, labelHelp, warning, value, onChange(newValue)`; it listens to the native `input` event (virtual keyboard), required for the Rename field and the colour text field. Help via `FieldLabel` `labelHelp` + `InfoIcon` (icon-only (i)).
**Dialogs analog:** `useUiState.showDialogModal` (`state/uiState.ts` L73, example L85-95):
```typescript
get().showDialogModal({
  title: t('box.reset-heroic.question.title', 'Reset GameLib'),
  message: t('...', '...'),
  buttons: [{ text: t('box.yes'), onClick: window.api.resetHeroic }, { text: t('box.no') }]
})
```
Use for Delete, Unsaved changes and limit dialogs (UI-SPEC button keys). Rename uses MUI `Dialog` + `TextInputField` (it has an input). Do not use `useOpenDialog` (file picker). Colour picker: MUI `Popover` hosting `react-colorful` `HexAlphaColorPicker`; `PopoverComponent` exists at `UI/PopoverComponent/index.tsx` (not read). Icons: Font Awesome as in NavShell/SettingsPanel (not read).

---

### Tests

- **Node-env pure tests** (`customThemes/__tests__/*`): style of `themeTokens.test.ts` (reads SCSS from `REPO_ROOT`); import `at`/`defined` from `src/frontend/components/__tests__/fixtures/indexed.ts` (tests only, `noUncheckedIndexedAccess` is on).
- **jsdom component tests**: `NoticeStack/__tests__/NoticeStackTwoToast.test.tsx` L1-3 docblock `@jest-environment jsdom`, then `import 'frontend/testUtils/jsdomNoticeEnv'`, real i18next via `initReactI18next`, `cleanup`/`render`/`fireEvent` from `@testing-library/react`, `resetAllStores` from `frontend/state/storeKit`. `window.CSS` is undefined in jsdom: inject `supports`.
- **Drift test**: re-derive built-in tokens from `themes.scss` + `_colors.scss` via `scssTokenSource` and `toEqual` the generated map.
- Run: `npx jest --selectProjects Frontend <path>`.

---

### `meta/genThemeTokens.ts` (script, batch)

**Analog:** `meta/genIpcContract.ts` (not read this session; read its header before copying). Script entry mirrors `package.json` L63:
`"gen:ipc-contract": "node meta/runTs.cjs --bundle --platform=node --target=node22 meta/genIpcContract.ts"`. Add `gen:theme-tokens` the same way (RESEARCH used `target=node21` and name `gen-theme-tokens`; match the repo's `gen:` colon convention and `node22`), add a knip entry in `knip.jsonc`, and prettier-format the generated output.

## Shared Patterns

### i18n literal calls
**Source:** `ThemeSelector/themeLabels.ts` (header L1-31, `resolveThemeLabel`). **Apply to:** every user-visible string. `t('gamelib:customThemes.<slug>', 'English', { name })`, add keys to `public/locales/en/gamelib.json`, then `pnpm i18n`, `pnpm i18n-churn-guard`, `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`. Default copy name "{{name}} copy" must use this path.

### Store write then set
**Source:** `settingsState.ts` L99-102. **Apply to:** all custom-theme setters.

### Total (never-throwing) parse of persisted data
**Source:** `migrateThemeKey` in `themeLabels.ts` (L60+, unmapped keys pass through) and `window.setTheme` fallback to `DEFAULT_THEME`. **Apply to:** `parseCustomThemes`, `applyTheme`, editor not-found state.

### Gates every new file trips
knip shrink-only ratchet (no speculative exports), `npx prettier --check <exact paths>` per task (`--file-info` first, one path per call), hardcoded-string gate, `noUncheckedIndexedAccess` (no `!`, no importing `__tests__` helpers into src), logical CSS properties for RTL, `unref()` rules not applicable (renderer only).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `ThemeSelector/ThemeThumbnail.tsx` | component | transform | No SVG-drawing component in repo; use RESEARCH Pattern 2 and UI-SPEC geometry |
| `customThemes/thumbnailPalette.ts` | utility | transform | Fallback chains exist only in SCSS; port from the cited consumer files |
| `ThemeEditor` colour picker | component | event-driven | No colour-picker in repo; new dependency `react-colorful@5.8.1` |

## Metadata

**Analog search scope:** `src/frontend/{components/UI/ThemeSelector,screens/Accessibility,state,index.tsx,App.tsx}`, `src/common/types`, `meta`.
**Not read (follow-up needed by planner/executor):** `meta/genIpcContract.ts`, `UI/PopoverComponent/index.tsx`, `UI/InfoIcon`, `UI/FieldLabel`, NavShell/SettingsPanel icon usage, `state/__tests__/uiState.test.ts`, `ThemeSelector/__tests__/index.test.tsx` (subject changes with D-01).
**Tracked-source check:** all named paths come from `git ls-files` output; none are gitignored mirrors.
**Pattern extraction date:** 2026-11-18
