# Phase 64: UI to edit themes - Research

**Researched:** 2026-11-17
**Domain:** Renderer theming (CSS custom properties on `body`), colour math, zustand + configStore persistence, React gallery/editor UI
**Confidence:** HIGH (everything in-repo was read this session; one new dependency verified against registry, README and its shipped dist)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The gallery **replaces** the theme `SelectField` on the Appearance screen (`src/frontend/screens/Accessibility/index.tsx`, `<ThemeSelector />`). It becomes the only way to pick a theme. Reversibility: costly, tests and the a11y gates target the current `#theme_selector` dropdown.
- **D-02:** The grid has two labelled groups: **Built-in** and **Your themes**. Built-in cards carry a read-only cue, such as a lock.
- **D-03:** Clicking a card **applies** that theme, as the dropdown does today. Every card has a **Duplicate** action. Custom cards also have **Edit**, **Rename** and **Delete**.
- **D-04:** The editor is a **split-pane page** in the Appearance area: the grouped token list on one side, a large live preview thumbnail on the other.
- **D-05:** While editing, changes update **only the preview thumbnail**. The real app changes on **Save**, and only if the edited theme is the active one. A bad value must never make the editor itself unreadable.
- **D-06:** Leaving the editor with unsaved changes shows a **Save / Discard / Cancel** prompt.
- **D-07:** Management actions in scope are Rename, Delete (with confirmation) and Duplicate. A custom theme can be duplicated too. A copy's default name is "<source name> copy", which must go through i18n.
- **D-08:** A custom theme records its **base built-in** theme. Applying a custom theme puts the base's class on `body` (e.g. `nord-light`) and sets the custom token values as CSS custom properties over it. The base's nested component rules, such as Nord Light's ~22 rules (`.MuiDialog-paper`, `.genre`, `.contextMenu`, ...), keep working, and those that read `var()` follow the user's edits. A copy of a custom theme keeps the original built-in base. Reversibility: costly, the stored shape (base key plus tokens) becomes persisted user data, so changing it later needs a Phase 68 store migration.
- **D-09:** Nested overrides are **not** turned into tokens in this phase. Hard-coded hex values inside nested rules (`.genre #2e3440`, `.runnerIcon #88c0d0`, the log-box `#dde1e7`, ...) stay fixed for copies.
- **D-10:** Copies are **frozen snapshots**. Duplicate stores every resolved token value, so a later release that changes a built-in never changes a user's copy. Only the inherited nested rules can shift.
- **D-11:** Duplicate **flattens `var()` chains to literal values**, resolved through `styles/_colors.scss` and the theme block, as ROADMAP specifies. In a copy each token is independent, so editing `--text-title` does not move `--text-default`. Reversibility: one-way.
- **D-12:** The editor groups a **core set of about 25 tokens**: Surfaces, Navigation, Text, Buttons, Accent and Status. These are the tokens every built-in sets and the thumbnail draws. A collapsed **Advanced** section lists every other resolved token, about 130 in the union of `themes.scss` and the base `colorSystem`.
- **D-13:** Each colour token has a **swatch that opens a picker with an alpha channel**, plus a text field that accepts hex or rgba. Input is validated. Native `<input type=color>` alone is rejected because it has no alpha, and many tokens use alpha (`#000000cc`, `#484daf5b`).
- **D-14:** **Gradient tokens** (e.g. `--gradient-body-background`) are shown only in Advanced, as **raw CSS text**, and accepted only if `CSS.supports` validates them. There is no gradient picker.
- **D-15:** The editor shows **live inline warnings** next to a token that breaks a contrast floor, e.g. "Border vs body 2.1:1, needs 3:1". Warnings **never block Save**.
- **D-16:** The contrast math and floor table move out of `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` into a **shared module** that both the test and the editor import, so there is one source of truth. No new floors are added: no WCAG 4.5:1 text check in this phase.

### Claude's Discretion

- **Thumbnail rendering:** a scaled DOM mini-launcher styled by scoped CSS variables, or an SVG, as long as it draws the elements listed in the domain from real token values. The 2026-11-05 comparison artifact is the visual reference.
- **Storage shape and key:** keep it in the settings/theme store (Phase 69 D-13) and persist it through the configStore with a Phase 68 store version. The shape must be JSON-friendly and self-describing (id, name, base, tokens) so a later export is trivial. Also choose how the active theme references a custom one, e.g. a `custom:<id>` key.
- **`window.setTheme` custom branch** (`src/frontend/index.tsx:317`): resolve a custom key to its base class plus applied variables. An unknown or deleted custom id falls back to `DEFAULT_THEME`, as unknown keys do today.
- **Deleting the active theme:** fall back to its base built-in, or to the default if that fails, and say so in the confirmation text.
- Which exact tokens make up the "core ~25". Start from the tokens declared in all 10 themes and the tokens the thumbnail draws.
- How the titlebar overlay (`--titlebar-*`) is refreshed after applying a custom theme.

### Deferred Ideas (OUT OF SCOPE)

- **Export / import custom themes as JSON files.**
- **Turning nested component overrides into tokens** (the Tokenize option in D-08/D-09).
- **WCAG 4.5:1 text-against-background floor.** Not added (D-16).
- Out of scope per the phase boundary: editing built-in themes, fonts, spacing or other non-colour styling.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| THEME-01 | User can browse every theme in a gallery of preview thumbnails | SVG `ThemeThumbnail` drawn from a resolved-token map per theme (Standard Stack, Pattern 1, Pattern 2). Built-in token maps come from a generated, drift-gated data file because `body.<theme>` selectors cannot be applied to a non-body element (Pitfall 1). |
| THEME-02 | User can duplicate a theme and edit its colours; built-in themes never change | Flatten-on-duplicate through a shared resolver, a `CustomTheme { id, name, base, tokens }` record in `configStore.customThemes`, an `applyTheme` helper that sets the base class plus inline custom properties on `body`, draft-only editing with Save-applies (Patterns 3-5; Pitfalls 2-8). |
</phase_requirements>

## Summary

The phase is mostly a front-end data-plumbing problem, not a styling problem. Themes are `body.<key> { --token: value }` blocks, which means a thumbnail for a theme other than the active one cannot be styled by "putting the theme class on a wrapper": the selector only matches `<body>`. Every thumbnail therefore needs the resolved token values as JavaScript data. The repo already has a correct SCSS-source resolver, but it is private to a 3,674-line test file. The first job is to lift that resolver (plus the colour math) into a pure shared module and generate a committed token map for the 10 built-ins, with a drift test so it cannot go stale.

Persistence is cheap: add one key, `customThemes`, to `configStore`. The renderer reads it synchronously from the hydrated snapshot at boot (the boot code already does a top-level `await hydrateStoreSnapshot()` before `window.setTheme`). The one trap is `STORE_ALLOWLIST`: a `configStore` key that is not in `src/common/types/storePolicy.ts` is silently not persisted (the renderer logs a `console.warn` and skips the write). No Phase 68 migration is needed for an additive key.

The measured census changes several CONTEXT assumptions, and the planner should know them before writing tasks. (1) The 'floor table' D-16 refers to does not exist as a table: contrast floors are ~40 `describe`/`it.each` blocks that each re-derive a pair from a consumer SCSS rule, and only three floors are pure token pairs that all 10 built-ins satisfy. (2) The union is 123 declared names, not ~130, and only 16 tokens are declared by all 10 themes, so the 'core set' cannot be defined as "tokens every built-in sets". (3) Flattening every token literally (D-11) would break two things users will test first: the Library header and game-page background paint from `--gradient-body-background`, not `--body-background`, and the focus ring derives from `--accent`. Both need a small, explicit exception to "flatten everything" (Pitfall 2, flagged in Assumptions and Open Questions for confirmation).

**Primary recommendation:** Build in this order: (1) pure `customThemes/` shared module (colour math, resolver, floors) + refactor `themeTokens.test.ts` onto it + generated built-in token map with a drift test; (2) `CustomTheme` data layer (validated parse, configStore key, allowlist, settings-store slice, `applyTheme` helper behind `window.setTheme`); (3) SVG thumbnail and gallery; (4) editor route with `react-colorful` and live floors; (5) i18n, a11y and live UAT on `pnpm tauri:dev`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Resolve a built-in theme's tokens (var chains, fallbacks) | Build/test tooling (generator + drift test) | Browser (consumes generated data) | Selectors are `body.<theme>`, so runtime cannot resolve a non-active theme without swapping the body class. Resolve once at build, ship data. |
| Colour parsing, contrast math, floor checks | Browser (pure TS module) | Test tier (same module) | One module imported by the editor and by `themeTokens.test.ts` (D-16). No fs, no DOM. |
| Custom-theme persistence | Sidecar `configStore` (file) | Browser snapshot (sync read/optimistic write) | Existing path: `snapshotSet` writes the local snapshot synchronously then sends `storeSet`; the sidecar persists. |
| Store access policy (key allow-list) | `src/common/types/storePolicy.ts` | Sidecar write guard, preload transport | Fail-closed allow-list shared by both sides. |
| Applying a theme app-wide | Browser (`document.body` class + inline custom properties) | - | Theme is a body class today; custom values layer on as inline properties on `body`. |
| Theme state (list, active key, CRUD) | Browser zustand `settingsState` | - | Phase 69 D-13: Phase 64 state lives in the settings/theme store. |
| Gallery, thumbnail, editor, dialogs | Browser (React, Appearance area) | - | Pure presentation over the store. |
| Titlebar overlay refresh | Browser (existing tail of `setTheme`) | Sidecar no-op | `setTitleBarOverlay` is a logged no-op under Tauri; nothing new to build. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-colorful | 5.8.1 | Alpha colour picker popover content (`HexAlphaColorPicker`) | 3.1 KB gzipped, no dependencies, tree-shakeable [VERIFIED: github.com/omgovich/react-colorful README]. Emits `#rrggbb` or `#rrggbbaa` (alpha appended only when a<1) [VERIFIED: dist/index.mjs of react-colorful@5.8.1, `B=function(e){...a=o<1?K(b(255*o)):""...}`]. Injects its own `<style>`; the app CSP is `"style-src": "'self' 'unsafe-inline'"` [VERIFIED: src-tauri/tauri.conf.json csp block] so this is allowed. |
| react-router-dom | ^7.18.5 (installed) | `useBlocker` for the D-06 unsaved-changes prompt; new flat route | App uses `createHashRouter` (data router) [VERIFIED: package.json:138, src/frontend/App.tsx:6 `createHashRouter`], which `useBlocker` requires. |
| zustand | ^4.5.6 (installed) | `customThemes` slice in `settingsState` | Phase 69 D-13. |
| @mui/material | ^5.17.1 (installed) | Popover for the picker, Dialog for rename, existing form controls | Already the app's UI kit. |
| react-dom/server | (installed with react 18.3) | `renderToStaticMarkup` for node-env thumbnail tests | No jsdom needed for SVG assertions. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jest-environment-jsdom | 29.7.0 (installed, devDependency) | Per-file `@jest-environment jsdom` docblock | Gallery/editor interaction tests and `applyTheme` body-style tests. Frontend jest default is node; two existing tests already opt in [VERIFIED: package.json:183; `@jest-environment jsdom` in NoticeStackTwoToast.test.tsx]. |
| jsdom | 20.0.3 (installed) | - | Verified this session: `body.style.setProperty('--accent','#ff00ff')` and `removeProperty` work; `window.CSS` is `undefined`, so `CSS.supports` must be injected or guarded in tests. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-colorful | Hand-rolled HSV area + alpha slider | Rejected: Don't Hand-Roll (pointer capture, keyboard a11y, alpha checkerboard). |
| react-colorful | Native `<input type=color>` | Rejected by D-13 (no alpha). Keep it out entirely. |
| Generated built-in token map | Vite `?raw` import of `themes.scss` + runtime parse | Works and has zero drift, but ships ~30 KB of SCSS text and puts an SCSS parser in the production renderer; jest needs a `?raw` mapper. Choose the generated map; see Pattern 1. |
| Generated built-in token map | Swap `body.className` and read `getComputedStyle` per theme | Forces 10 full-subtree style recalcs, cannot be tested in jsdom (no var() resolution), and `:root`-scope custom properties resolve against root, not body (Pitfall 1). |
| SVG thumbnail | Scaled DOM mini-launcher with inline custom properties | DOM needs `transform: scale` (blurry text) and relies on inline `--x` plumbing; SVG takes colour attributes directly, is trivially testable, and an invalid colour is sanitised once in `thumbnailPalette`. |

**Installation:**
```bash
pnpm add react-colorful@5.8.1
```

**Version verification:** `npm view react-colorful version` returned `5.8.1`; registry `time.modified` 2026-09-01; license MIT; repository `git+https://github.com/omgovich/react-colorful.git`; `scripts.postinstall` empty. [VERIFIED: npm registry]

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| react-colorful | npm | multi-year, 5.x line (registry `modified` 2026-09-01) | 8,776,642/wk | github.com/omgovich/react-colorful | OK (`gsd-tools query package-legitimacy check --ecosystem npm react-colorful`: exists, not deprecated, no postinstall) | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

The package name was confirmed against the official repository README (exports `HexAlphaColorPicker`, `RgbaStringColorPicker`, `onChange`/`onChangeEnd`), not only the registry. No other new packages are recommended; do not add a colour-manipulation library (the repo's own `mixSrgb`/`relativeLuminance` cover the need).

## Architecture Patterns

### System Architecture Diagram

```
 BUILD / TEST TIME                                   RUNTIME (renderer)
 -----------------                                   ------------------
 themes.scss + _colors.scss                          boot: await hydrateStoreSnapshot()
        |                                                    |
        v  scssTokenSource (pure parse, strings in)          v
 customThemes/colour.ts + tokenResolve.ts  <------------ window.setTheme(key)  [index.tsx, thin wrapper]
        |   (shared: toRgb/contrast/resolve/flatten)                |
        +--> gen script ----> builtinTokens.generated.ts            v
        |         ^                     |                  applyTheme(body, key, customThemes)
        |   drift test (re-derive,      |                     |-- built-in key  -> class = key, clear inline vars
        |   assert equal)               |                     |-- custom:<id>   -> class = base, set inline vars
        +--> themeTokens.test.ts        |                     '-- unknown/deleted -> DEFAULT_THEME
             (imports same module)      |
                                        v
              Appearance screen --> ThemeGallery ---- reads ---> settingsState { theme, customThemes }
                    |   (Built-in | Your themes)                         |  setters write configStore
                    |  card click = apply; Duplicate/Edit/Rename/Delete  |  (snapshotSet -> sidecar storeSet)
                    v                                                    v
              route accessibility/themes/:id  --> ThemeEditor        configStore.customThemes
                    |  draft tokens (component state)                  (allow-listed key, validated on read)
                    |-- ThemeThumbnail(draft)   <- thumbnailPalette(draft) (sanitised)
                    |-- TokenRow x ~25 + Advanced -> ColourField (react-colorful + text)
                    |-- contrast floors(draft) -> inline warnings (never block)
                    '-- Save -> updateCustomTheme -> if active: applyTheme again
```

### Recommended Project Structure

```
src/frontend/
├── customThemes/                  # NOT `themes/` (avoid confusion with themes.scss)
│   ├── colour.ts                  # pure: parseColour, toRgb (legacy), contrast, mix, normaliseColour
│   ├── tokenResolve.ts            # pure: resolveValue, resolveColour, flattenTheme
│   ├── contrastFloors.ts          # CONTRAST_FLOORS table + checkFloors(tokens)
│   ├── tokens.ts                  # CORE_TOKEN_GROUPS, LIVE_DERIVED_TOKENS, isEditableColourToken
│   ├── customTheme.ts             # CustomTheme type, parseCustomThemes, makeCopy, limits
│   ├── applyTheme.ts              # applyTheme(body, key, themes) -> {baseClass, applied}
│   ├── thumbnailPalette.ts        # tokens -> palette with consumer fallback chains
│   └── builtinTokens.generated.ts # generated, committed
├── components/UI/ThemeSelector/   # keep the folder and the `ThemeSelector` export name
│   ├── index.tsx                  # now renders <ThemeGallery/>
│   ├── ThemeGallery.tsx, ThemeCard.tsx, ThemeThumbnail.tsx
├── screens/Accessibility/ThemeEditor/   # split-pane page
└── testUtils/scssTokenSource.ts   # fs-free string parsers shared by test + generator
```

### Pattern 1: Resolved built-in token map as generated data

**What:** `builtinTokens.generated.ts` exports `BUILTIN_TOKENS: Record<BuiltInKey, Record<string,string>>` with every resolved colour token per theme (merge order: `:root` colorSystem, `body {}` base, `body.<theme>`; identical to `themeTokens()` + `globalTokens()` in the test). A jest drift test re-derives the map from `themes.scss` and `_colors.scss` and `toEqual`s it, failing with "run `pnpm gen-theme-tokens`".
**When to use:** the gallery (10 thumbnails), Duplicate seeding, and the `checkFloors` run over built-ins.
**Why not runtime:** theme blocks are `body.midnightMirage {` etc. [VERIFIED: src/frontend/themes.scss:113 `body.midnightMirage {`, :203 `body.cyberSpaceOasis {`, :417 `body.nord-light {`], so only `<body>` can carry a theme. `colorSystem` is included on `:root` [VERIFIED: src/frontend/index.scss:5-8 `:root { ... @include colors.colorSystem;`], so root-scope tokens resolve against root, not body.
**Generator output must be prettier-clean** (write through prettier or add the file to `.prettierignore`); see Pitfall 9.

```typescript
// Source: composition of the existing resolvers in themeTokens.test.ts (lines 506-526, 1598-1657)
export function flattenTheme(
  scope: Map<string, string>,
  globals: Map<string, string>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, raw] of scope) {
    if (isNonColourToken(name)) continue          // e.g. --focus-ring-width: 3px
    const resolved = resolveColour(raw, scope, globals)   // var() + color-mix(in srgb)
    if (resolved === null) continue
    const norm = normaliseColour(resolved)        // gray/white/transparent -> hex, rgb()->canonical
    out[name] = norm ?? resolved                  // gradients keep text, var() fully substituted
  }
  return out
}
```

### Pattern 2: SVG thumbnail from a sanitised palette

**What:** `ThemeThumbnail({ tokens })` calls `thumbnailPalette(tokens)`, which applies the same fallback chains the real consumers use, then draws `<rect fill=...>`. Each colour goes through `safeColour(value, fallback)` so a half-typed value in the editor draws the previous good value, never garbage. Give the `<svg>` `role="img"` and an `aria-label` naming the theme.
**Fallback chains the palette must copy** (each verified in source):

| Element | Token(s) | Source |
|---------|----------|--------|
| Body | `--body-background` | `_colors.scss` `body { background: var(--body-background) }` [VERIFIED: _colors.scss] |
| Sidebar / tier-2 panel | `--navbar-background` | NavShell/index.scss:229 `background: var(--navbar-background);` |
| Active nav row | `--navbar-active-background` (label: `--navbar-active`, falling back through `--accent-overlay` to `--accent`) | NavItem/index.scss:49 `--navitem-active-background: var(--navbar-active-background);`; `NAVBAR_ACTIVE_FALLBACK_CHAIN` in themeTokens.test.ts |
| Inactive nav label | `--navbar-inactive`, fallback `--navbar-accent` | NavItem/index.scss:43 `--navitem-inactive-color: var(--navbar-inactive, var(--navbar-accent));` |
| Search outline | `--search-bar-border` (base: `var(--accent, #0080ff)`) | SearchBar/index.scss:47; themes.scss base block |
| Search fill | `--search-bar-background`, fallback `--input-background` | SearchBar/index.scss:6 |
| Primary button | bg `--primary`, text `--text-tertiary` | styles/_buttons.scss:16-17 |
| Secondary button | bg `--secondary-button`, text `--text-tertiary` | _buttons.scss:52-53 |
| Success button | bg `--success-button`, fallback `--status-success` | _buttons.scss:103 |
| Danger button | bg `--cancel-button`, fallback `--status-danger` | _buttons.scss:93 |
| Library tile | `--background` surface + title strip `--gamecard-title-color` | Claude's discretion; GameCard uses `--gradient-gamecard` (an alpha gradient), draw a flat approximation |

Dracula draws the navbar lighter than the body (see `sketch-findings-gamelib`: "Some shipped themes make the navbar lighter than the body (dracula most severely)"), so the thumbnail must paint navbar and body from their own tokens, never assume navbar is the darker band.

### Pattern 3: `CustomTheme` record and boot-safe parse

```typescript
// Stored under configStore key `customThemes` (one array value; no dotted per-id paths)
export interface CustomTheme {
  id: string                       // 8+ hex chars from crypto.getRandomValues, collision-checked
  name: string                     // user text, <= 60 chars
  base: BuiltInThemeKey            // one of the 10 defaultThemes keys; a copy of a custom keeps its base
  tokens: Record<string, string>   // token name -> literal value
}
export const CUSTOM_THEME_PREFIX = 'custom:'   // settingsState.theme === 'custom:<id>'
```

`parseCustomThemes(raw: unknown): CustomTheme[]` must be total (never throws): drop entries whose `base` is not a `defaultThemes` key, whose token names fail `/^--[a-z0-9-]+$/` or are not in the known token universe, or whose values fail `normaliseColour`/gradient validation; cap list length and name length. A hand-edited or corrupt `config.json` must degrade to "that theme missing", not a blank app at boot.

### Pattern 4: `applyTheme` extracted from `index.tsx`

`src/frontend/index.tsx` is never imported by a test (documented at index.tsx:62-67), so keep it a thin wrapper and test the extracted function under `@jest-environment jsdom`.

```typescript
// body.style custom properties work in jsdom 20.0.3 (verified this session)
let applied: string[] = []
export function applyTheme(body: HTMLElement, key: string, customs: CustomTheme[], fallback: string) {
  for (const name of applied) body.style.removeProperty(name)   // always clear the previous custom
  applied = []
  const custom = key.startsWith(CUSTOM_THEME_PREFIX)
    ? customs.find((c) => c.id === key.slice(CUSTOM_THEME_PREFIX.length))
    : undefined
  const builtIn = Object.keys(defaultThemes).includes(key) ? key : undefined
  const baseClass = custom ? custom.base : (builtIn ?? fallback)   // unknown or deleted id -> DEFAULT_THEME
  // replace ONLY the theme class (see Pitfall 5), keep isRTL / input-modality / console-* classes
  for (const k of Object.keys(defaultThemes)) body.classList.remove(k)
  body.classList.add(baseClass)
  if (custom) for (const [n, v] of Object.entries(custom.tokens)) { body.style.setProperty(n, v); applied.push(n) }
}
```

Apply on `document.body`, not `documentElement`: `body.<theme>` declares the variables directly on body, so an inline value on `<html>` would lose to the class rule on body (an inherited value never beats a declared one). Body inline style outranks the `body.<theme>` rule. Fonts use `documentElement.style` and `useStoreEmbedHost` observes `documentElement`'s `style` attribute [VERIFIED: useStoreEmbedHost.ts:683-688 `zoomObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })`], so writing theme values to `body.style` also avoids waking that observer.

### Pattern 5: Draft-only editor with Save-applies

Editor holds `draft: Record<string,string>` in component state. Thumbnail and warnings read `draft`. The real app is untouched until Save (D-05). Save calls `updateCustomTheme(id, { tokens })`; the setter writes `configStore.set('customThemes', next)` first (synchronous optimistic snapshot write), `set({ customThemes: next })`, then, only if `theme === 'custom:<id>'`, calls `window.setTheme(theme)` again so the new inline values apply. The editor's own chrome keeps rendering with the active (saved) theme, so a draft can never make it unreadable. D-06 needs both `useBlocker` (route changes) and an in-page Back button handler sharing one Save/Discard/Cancel dialog.

### Anti-Patterns to Avoid

- **Resolving theme tokens by `getComputedStyle` on a thumbnail element:** the theme selectors match only `body`.
- **Storing `--gradient-body-background` and the focus-ring trio flattened:** see Pitfall 2.
- **Writing theme data under dotted per-id keys** (`customThemes.<id>`): ids are user-influenced and the store uses dot-notation with a prototype-pollution guard (`isSafeKeyPath`). Always write the whole array under the single key.
- **Mutating the array returned by `configStore.get`:** `getAtPath` returns the snapshot object by reference; always build a new array.
- **`crypto.randomUUID()` for ids:** secure-context availability under the `tauri://` origin is unverified here; use `crypto.getRandomValues` [ASSUMED risk, avoid by construction].

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Alpha colour picker (area + hue + alpha, keyboard a11y) | Custom HSV widget | `react-colorful` `HexAlphaColorPicker` | Pointer capture, arrow-key support, alpha checkerboard. |
| `var()` chain + `color-mix` resolution | A second resolver | Lift `resolveValue` / `resolveColour` / `mixSrgb` / `splitTopLevelCommas` / `parseColourMixArg` from `themeTokens.test.ts` (lines 506-526 and 1539-1657) | Already measured against all 10 themes; tests pin its numbers. |
| Contrast ratio | Another luminance implementation | The existing `relativeLuminance` / `contrastRatio` (lines 554-572) | One source of truth (D-16). |
| Unsaved-changes route guard | `beforeunload` hacks | `useBlocker` (data router) | App already uses `createHashRouter`. |
| Confirmation dialogs | A bespoke modal | `useUiState.showDialogModal({ title, message, buttons: [{ text, onClick }, ...] })` | Pattern used by GameSubMenu (`buttons: [{ text: t('box.yes'), onClick: ... }, { text: t('box.no') }]`). Note CONTEXT's `useOpenDialog` is the **file-picker** wrapper, not a confirm dialog. |
| SCSS token block parsing | New regex parser | `cssBlock`/`customProps`/`allBlocksFor`/`themeTokens` (lines 123-140, 425-504), made fs-free | Already handles brace depth and last-wins merging. |

**Key insight:** every hard problem here (resolution, contrast, parsing) is already solved in a private test file; the phase's risk is in how it is lifted and extended without changing the numbers existing tests pin.

## Runtime State Inventory

Not a rename/refactor/migration phase. One related fact: this phase **adds** persisted user data (`customThemes`) and changes what the existing `theme` key may hold (`custom:<id>`). Stored `theme` values from the retired custom-CSS-file era already fall back to `DEFAULT_THEME` [VERIFIED: index.tsx:318-323 comment and branch]; a `custom:` prefix cannot collide with those (they were bare filenames).

## Common Pitfalls

### Pitfall 1: Theme selectors only match `<body>`
**What goes wrong:** A plan that says "wrap each thumbnail in a div with the theme class and let CSS do it" renders nothing themed.
**Why:** every block is `body.<key> {`, and `colorSystem` tokens live on `:root`, so even `getComputedStyle` after a class swap resolves root-level `var()`s against root scope (e.g. a `:root` `--gradient-body-background` would reference `--background-darker`, undefined at root; nine of the ten themes redeclare it on body for exactly this reason [VERIFIED: grep of themes.scss shows `--gradient-body-background:` at lines 255, 302, 346, 385, 425, 584, 621, 655, 693, i.e. every block except midnightMirage, plus the root default in `_colors.scss`]; midnightMirage never declares it, so its root-level value is invalid at body and every consumer's `var(--gradient-body-background, var(--body-background))` falls back to the plain body colour. The merge-scope resolver the tests use would nonetheless produce a gradient for midnightMirage, so the generated map must not be treated as 'what the browser computes' for derived tokens).
**How to avoid:** generated resolved-token map (Pattern 1). **Warning sign:** a thumbnail test that passes only in the active theme.

### Pitfall 2: Flattening everything breaks two core edits
**What goes wrong:** (a) `--gradient-body-background`, not `--body-background`, paints the Library header, the game-page panel and the scrollbar corner [VERIFIED: Library/index.css:54, App.css:99, index.scss:107, each `background: var(--gradient-body-background, var(--body-background));`]. A copy that stores the flattened gradient ignores edits to Body background in those places. (b) `--focus-ring-color`, `--focus-ring-halo`, `--focus-ring-fill` are `var()`/`color-mix()` derivations of `--accent` and `--body-background` in the base `body` block; flattened, the focus ring stays on the old accent.
**How to avoid:** `LIVE_DERIVED_TOKENS` = `--gradient-body-background`, `--focus-ring-color`, `--focus-ring-halo`, `--focus-ring-fill`, `--alphabet-filter-accent-color`, `--alphabet-filter-accent-hover`. Do not store them on Duplicate; they keep deriving from the (inline-overridden) core tokens because they are declared on body and evaluate there. They appear in Advanced as "derived, edit to override"; only a user edit stores them (this still satisfies D-14's raw-text gradient editing). Excluding the gradient also matters for midnightMirage copies: the theme declares none, the real app paints the `--body-background` fallback, and a flattened merge-scope gradient would silently introduce one. Also exclude non-colour tokens (`--focus-ring-width: 3px`). This is a deliberate, small exception to D-10/D-11 wording: **needs user confirmation** (Assumption A1, Open Question 1).

### Pitfall 3: The "floor table" does not exist
**What goes wrong:** D-16 says "move the floor table"; a plan task of that shape cannot be executed. `themeTokens.test.ts` has ~40 describe/it blocks; most re-derive a pair from a consumer SCSS rule, with per-theme overrides (e.g. FOCUS ROW divider label uses `body.dracula &` / `body.nord-light &` overrides, so the plain token pair `--text-secondary` vs `--navbar-background` measures 4.27 on dracula and 1.52 on nord-light and fails).
**How to avoid:** the shared module extracts the **math and resolver** and defines a **new** `CONTRAST_FLOORS` table limited to pure token pairs, then a new test asserts all 10 built-ins satisfy it. Measured this session over the 10 built-ins (merge `:root` + `body` + theme):

| Floor (existing test it mirrors) | Min | Worst built-in |
|---|---|---|
| `--border-color` vs `--body-background` (test line 644) | 3:1 | nord-light 3.43 |
| `--border-color` vs `--modal-background` (line 644) | 3:1 | nord-light 3.43 |
| `--accent` vs `--body-background` (chevron glyph, line 733, G-48-4a) | 3:1 | gruvbox_dark 3.91 |

Leave consumer-rule floors (selected tab label, divider labels, Apply text, sign-in row, danger text, game-menu text) in the test only; warn the user about them in a later phase. Example D-15 text ("Border vs body 2.1:1, needs 3:1") matches the first row.

### Pitfall 4: Existing helpers throw or truncate on user colours
**What goes wrong:** `toRgb` handles only hex/named, drops 8-digit alpha ("opaque alpha": `hex.slice(0, 6)`), and `contrastRatio` **throws** on anything else (the modal-border test even notes `rgba() ... would make toRgb throw`). `resolveColour` throws on `transparent` inside `color-mix`.
**How to avoid:** extract the legacy functions unchanged (tests pin exact ratios such as the 3.79 dracula and 4.35 gruvbox pre-fix values), and **add** total variants: `parseColour(str) -> {r,g,b,a} | null` (hex 3/4/6/8, `rgb()`/`rgba()`, `gray`/`white`/`black`/`transparent`), `tryContrast(fg, bg)` that composites alpha over the background and returns `null` instead of throwing. The editor must never throw on any keystroke.

### Pitfall 5: `window.setTheme` overwrites every body class
**What goes wrong:** `document.body.className = themeClass` [VERIFIED: index.tsx:325] discards `isRTL` (toggled by a store subscription, settingsState.ts:273), the keyboard-nav class (inputModality.ts:88) and others on every runtime theme switch. Pre-existing; a custom branch that also clears inline variables is the natural place to switch to `classList` removal of only the 10 theme keys (Pattern 4). Log the pre-existing behaviour as a todo if the planner prefers not to change it for built-ins.

### Pitfall 6: A `configStore` key outside the allow-list silently does not persist
**What goes wrong:** `snapshotSet` calls `rejectSnapshotWrite` (a `console.warn`) and returns; the sidecar also rejects. The UI shows the theme until restart, then it is gone.
**How to avoid:** in one task add `customThemes` to `StoreStructure.configStore` (src/common/types/typed_store.ts, next to `theme: string`), to `STORE_ALLOWLIST.configStore` in `src/common/types/storePolicy.ts` (the verbatim list currently ends `'window-props', 'settings', 'skipVcRuntime', 'showSnapWarning'`), and add `['configStore', 'customThemes']` to the "stays writable" `it.each` and an `isAllowedStoreField` assertion in `src/common/types/__tests__/storePolicy.test.ts`.

### Pitfall 7: Nested base-theme overrides make the thumbnail lie
**What goes wrong:** nord-light carries `.button.is-success { color: var(--text-default); background-color: #81a1c1; }` and `button.is-primary { color: var(--text-default); }` [VERIFIED: themes.scss:496-504]. A copy of nord-light keeps the base class, so editing `--success-button` changes nothing on the real success button while the thumbnail shows the edit. D-09 accepts hard-coded values staying fixed, not a misleading preview. Eleven component stylesheets also carry `body.<theme> &` overrides [VERIFIED: grep, 22 occurrences across 11 files] that likewise stay on for copies.
**How to avoid (recommended):** a small `BASE_PREVIEW_OVERRIDES` table for the known nested overrides that touch thumbnail elements (nord-light success and primary button text), with a source-text test asserting it matches the nord-light block. Alternative: mark the affected editor rows "overridden by the base theme". Open Question 2.

### Pitfall 8: Validation of free-text colour/gradient values
**What goes wrong:** gradient text with `url(...)` triggers a network fetch (CSP `img-src` allows `https:`); `var(`, `;`, `{`, `}` or `@` can reference other tokens or break out; `CSS.supports('background-image', 'var(--x)')` returns true for any `var()` text.
**How to avoid:** `isValidGradient(text, supports)` rejects `/var\(|url\(|[;{}@]|!important/i` first, then requires `supports('background-image', text)` (injected; `window.CSS` is undefined in jsdom, so default `supports` to a guard that returns false-closed and stub it in tests). Colour fields: parse with `parseColour`, store the canonical form (`#rrggbb` / `#rrggbbaa`), never the raw typed string.

### Pitfall 9: Repo gates a new file set will trip
- **knip shrink-only ratchet** (`pnpm find-deadcode`): every new export must have a consumer; do not export speculative helpers.
- **Prettier**: `.prettierignore` covers `public/locales/` but not `src/frontend/**`; the generated TS file must be formatted (pipe generator output through prettier) and each task's `<verify>` runs `npx prettier --check` over the exact written paths (Skill gamelib-conventions; use `--file-info` per path first, one path per call).
- **i18n**: user strings use `t('gamelib:customThemes.<slug>', 'English', { name })` literal calls (pattern in `themeLabels.ts`), added to `public/locales/en/gamelib.json`, then `pnpm i18n`, `pnpm i18n-churn-guard`, and refresh the presence baseline with `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib` (as commit `8835f1dfb` did for Phase 68). `meta/hardcodedStringGate.ts` blocks hardcoded literals in scoped files.
- **`windowSettingsPlacement.test.ts`** asserts the source text contains `<ThemeSelector />` before `<UseFramelessWindow />` and `<UseDarkTrayIcon />` [VERIFIED: Accessibility/__tests__/windowSettingsPlacement.test.ts:39-46]. Keep the `ThemeSelector` name for the gallery container, which also keeps `meta/i18nGateScope.json` entries valid.
- **Strict TS**: `noUncheckedIndexedAccess: true` [VERIFIED: tsconfig.json:23]. The test file imports `at`/`defined` from `src/frontend/components/__tests__/fixtures/indexed.ts`; **src code must not import from `__tests__`**, so write the lifted code with explicit guards.

### Pitfall 10: `#theme_selector` is used by operator UAT, not by automated tests
**What goes wrong:** earlier UAT (48-UAT.md) switched themes by driving `document.getElementById('theme_selector')`. No in-repo automated test references it (grep across src, meta, e2e found only the component itself). After D-01 the id is gone.
**How to avoid:** give each card `data-theme-key="<key>"` and keep `window.setTheme(key)` callable from the console; state both in the UAT steps. Update `ThemeSelector/__tests__/index.test.tsx` only if its subject changes.

## Code Examples

### `useBlocker` for D-06
```typescript
// Source: react-router v7 data-router API (App uses createHashRouter)
const blocker = useBlocker(({ currentLocation, nextLocation }) =>
  dirty && currentLocation.pathname !== nextLocation.pathname
)
useEffect(() => {
  if (blocker.state === 'blocked') openSaveDiscardCancel({
    onSave: () => { save(); blocker.proceed() },
    onDiscard: () => blocker.proceed(),
    onCancel: () => blocker.reset()
  })
}, [blocker])
```
Verify exact `useBlocker` signature against the installed `react-router` before coding (not fetched this session) [ASSUMED API shape from training].

### Live floor warning
```typescript
export const CONTRAST_FLOORS = [
  { id: 'border-body',  fg: '--border-color', bg: '--body-background',  min: 3 },
  { id: 'border-modal', fg: '--border-color', bg: '--modal-background', min: 3 },
  { id: 'accent-body',  fg: '--accent',       bg: '--body-background',  min: 3 }
] as const
export function checkFloors(tokens: Record<string, string>) {
  return CONTRAST_FLOORS.flatMap((f) => {
    const ratio = tryContrast(tokens[f.fg], tokens[f.bg])   // null on anything uncomparable
    return ratio !== null && ratio < f.min ? [{ ...f, ratio }] : []
  })
}
```

### Proposed core token set (planner finalises; 27 names)
Surfaces: `--body-background`, `--background`, `--input-background`, `--modal-background`, `--modal-border`, `--border-color`. Navigation: `--navbar-background`, `--navbar-active-background`, `--navbar-active`, `--navbar-inactive`, `--navbar-accent`. Text: `--text-default`, `--text-secondary`, `--text-tertiary`, `--text-hover`. Buttons: `--primary`, `--primary-hover`, `--secondary-button`, `--success-button`, `--cancel-button`, `--danger`. Accent: `--accent`, `--accent-overlay`, `--search-bar-border`. Status: `--status-success`, `--status-warning`, `--status-danger`.
Measured this session (declared per theme out of 10): `--body-background` 10, `--background` 10, `--input-background` 10, `--modal-background` 10, `--navbar-background` 10, `--navbar-active-background` 10, `--secondary-button` 10, `--primary` 9, `--success-button` 9, `--accent` 9 (+ `:root`), `--navbar-active` 4, `--navbar-inactive` 2, `--text-hover` 4, `--cancel-button` 1 (+ base), `--status-success`/`--status-danger` 0 (`:root` only). So membership cannot be "tokens every built-in declares" (only 16 are); define it as "tokens a thumbnail element or a floor reads", and add a census test that each core token resolves (after fallbacks) in all 10 built-ins.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom-CSS-file themes with IPC channels | Built-ins only; non-built-in key maps to default | quick 261031-bst | Phase 64 reintroduces custom themes as token data, not files. |
| Heroic-style ad hoc store fix-ups | Phase 68 versioned stores (`STORE_MIGRATIONS`, `__internal__.gamelib.schemaVersion`) | Phase 68, 2026-11-08 | Additive key needs no migration; the first reshape of `CustomTheme` adds a `store/config` chain entry. |
| `GlobalState` class | zustand `settingsState` | Phase 69 | Custom-theme state goes in `settingsState` (D-13). |

**Deprecated/outdated:** the `ThemeSelector` header comment still says `window.setTheme` treats non-`defaultThemes` keys as custom CSS filenames; the code at `index.tsx:318-323` already maps them to the default.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Excluding `LIVE_DERIVED_TOKENS` (gradient body background, focus-ring trio, alphabet-filter pair) and non-colour tokens from the stored set is acceptable despite D-10/D-11 saying "every resolved token" | Pitfall 2 | If the user wants strictly all tokens frozen, editing Body background or Accent will not fully propagate (Library header band, focus ring). Needs user confirmation. |
| A2 | The three pure-pair floors are the right editor floor set; consumer-rule floors stay test-only | Pitfall 3 | If the user expects all existing floors live, more extraction work and per-base-override handling is needed. |
| A3 | `useBlocker` signature as sketched | Code Examples | Minor; verify against installed react-router. |
| A4 | `crypto.randomUUID` may be unavailable on the Tauri origin | Anti-Patterns | None if `getRandomValues` is used; harmless either way. |
| A5 | An older build (pre-Phase 64) opening a newer `config.json` keeps the unknown `customThemes` key on rewrite (conf retains unknown keys) | Summary / State of the Art | Older builds could drop saved custom themes; low, accepted by Phase 68 D-03 for versioned changes. |
| A6 | The 2026-11-05 comparison artifact could not be opened (claude.ai artifact); the thumbnail element-to-token map in Pattern 2 is derived from consumer CSS, not from the artifact | Pattern 2 | Visual layout may differ from the artifact; the planner/UI-SPEC should reconcile. |

## Open Questions

1. **Live-derived exceptions to flatten-everything (A1).** Recommendation: adopt `LIVE_DERIVED_TOKENS` as in Pitfall 2 and say so in the editor ("derived from Body background until you edit it"). Needs a user yes before planning locks it.
2. **Thumbnail truth for nord-light copies (Pitfall 7).** Recommendation: `BASE_PREVIEW_OVERRIDES` table plus a source-text test. Alternative: "overridden by base" labels on those rows.
3. **Floor scope (A2).** Recommendation: three pure pairs now; list the consumer-rule floors in a follow-up todo.
4. **Core set membership.** Proposed 27 names above; confirm or trim to ~25. Tokens the base theme leaves undeclared (e.g. `--navbar-inactive` in 8 themes) are stored with their fallback-resolved value on Duplicate so the editor always has a value.
5. **Where Rename lives.** A MUI Dialog with a `TextInputField` from the gallery card and from the editor header is simplest; confirm UX with the UI contract if `/gsd-ui-phase` runs.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | tests, generator | yes | v22.23.4 | - |
| pnpm | install/scripts | yes | 10.28.0 | - |
| jest | tests | yes | 29.7.0 | - |
| jest-environment-jsdom / jsdom | interaction tests (per-file docblock) | yes | 29.7.0 / 20.0.3 | node-env `renderToStaticMarkup` + pure-function tests |
| `pnpm tauri:dev` live app | UAT (3-theme survival, custom copy) | operator-run on macOS | - | none; live gate is a human step |
| npm registry | `pnpm add react-colorful` | yes | 5.8.1 | - |

**Missing dependencies with no fallback:** none. Live visual verification is human-only (jsdom has no CSS engine; same limitation `themeTokens.test.ts` documents).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest 29.7.0 + ts-jest; projects `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta`, `relay` [VERIFIED: jest.config.js projects list] |
| Config file | `/Users/graysonmitchell/Projects/GameLib/src/frontend/jest.config.js` (displayName `Frontend`, `testEnvironment` default node; `.s?css` mapped to a stub; per-file `@jest-environment jsdom` available) |
| Quick run command | `npx jest --selectProjects Frontend <path>` (the repo already uses `--selectProjects Meta`, package.json:48) |
| Full suite command | `pnpm test:ci` plus `pnpm codecheck` and `pnpm find-deadcode` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| THEME-01 | Generated built-in token map equals a fresh derivation from `themes.scss` + `_colors.scss` | unit (drift) | `npx jest --selectProjects Frontend src/frontend/customThemes/__tests__/builtinTokens.test.ts` | Wave 0 |
| THEME-01 | `thumbnailPalette` applies consumer fallback chains; navbar and body painted from own tokens (dracula) | unit | `npx jest --selectProjects Frontend src/frontend/customThemes/__tests__/thumbnailPalette.test.ts` | Wave 0 |
| THEME-01 | `ThemeThumbnail` markup carries each token's colour as a fill (`renderToStaticMarkup`, node env) | unit | `npx jest --selectProjects Frontend src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx` | Wave 0 |
| THEME-01 | Gallery shows Built-in (10, lock cue) and Your themes groups; card click applies; actions per D-03 | jsdom component | `npx jest --selectProjects Frontend src/frontend/components/UI/ThemeSelector/__tests__/ThemeGallery.test.tsx` | Wave 0 |
| THEME-02 | `flattenTheme` leaves no `var(`; frozen: copy values equal source resolved values; excludes `LIVE_DERIVED_TOKENS` | unit | `npx jest --selectProjects Frontend src/frontend/customThemes/__tests__/flatten.test.ts` | Wave 0 |
| THEME-02 | `parseCustomThemes` drops malformed entries, never throws; caps enforced | unit | `npx jest --selectProjects Frontend src/frontend/customThemes/__tests__/customTheme.test.ts` | Wave 0 |
| THEME-02 | `applyTheme`: built-in class swap clears inline vars; custom sets base class + vars; unknown/deleted id falls back to `midnightMirage`; non-theme body classes preserved | jsdom | `npx jest --selectProjects Frontend src/frontend/customThemes/__tests__/applyTheme.test.ts` | Wave 0 |
| THEME-02 | `customThemes` allowed and writable on `configStore` | unit | `npx jest --selectProjects Common src/common/types/__tests__/storePolicy.test.ts` | exists, extend |
| THEME-02 | Built-ins never change: store actions reject non-custom ids; `themes.scss` has no diff in the phase | unit + git | `npx jest --selectProjects Frontend src/frontend/state/__tests__/customThemesState.test.ts`; `git diff --stat main -- src/frontend/themes.scss` empty | Wave 0 |
| THEME-02 | Editor: draft changes thumbnail only; Save applies only when active; dirty leave opens Save/Discard/Cancel | jsdom | `npx jest --selectProjects Frontend src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditor.test.tsx` | Wave 0 |
| THEME-02 | Colour field validation, gradient validator rejects `url(`/`var(`/`;`, CSS.supports injected | unit | `npx jest --selectProjects Frontend src/frontend/customThemes/__tests__/validate.test.ts` | Wave 0 |
| THEME-02 (D-15/16) | `CONTRAST_FLOORS` hold for all 10 built-ins; editor flags a 2.1:1 border pair; `themeTokens.test.ts` imports the shared module and defines no local `contrastRatio` | unit + source gate | `npx jest --selectProjects Frontend src/frontend/customThemes/__tests__/contrastFloors.test.ts src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` | Wave 0 + existing (must stay green with identical pinned ratios) |
| both | i18n: no hardcoded strings; catalog + presence baseline | gate | `npx jest --selectProjects Meta meta/__tests__/hardcodedStringGate.test.ts`; `pnpm i18n-churn-guard` | exists |
| both | Appearance placement test still passes | source gate | `npx jest --selectProjects Frontend src/frontend/screens/Accessibility/__tests__/windowSettingsPlacement.test.ts` | exists |
| both | Live: three-theme survival (midnightMirage, gruvbox_dark, dracula), duplicate nord-light then edit and apply, restart persists, delete active falls back | manual (macOS `pnpm tauri:dev`; `pnpm tauri:dev` not `tauri:dev:run`, see memory) | UAT file, items in the repo's `### N.` / `expected:` / `result:` shape | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest --selectProjects Frontend <the task's test files>` and `npx prettier --check <exact written paths>`
- **Per wave merge:** `pnpm test:ci && pnpm codecheck && pnpm lint:src && pnpm find-deadcode`
- **Phase gate:** full suite green plus the live UAT before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/frontend/customThemes/__tests__/*` (listed above), `ThemeThumbnail`/`ThemeGallery`/`ThemeEditor` tests
- [ ] `src/frontend/testUtils/scssTokenSource.ts` (fs-free string parsers) so the generator and tests share one parser
- [ ] `pnpm gen-theme-tokens` script entry (`node meta/runTs.cjs --bundle --platform=node --target=node21 meta/genThemeTokens.ts`) and its knip entry in `knip.jsonc`
- [ ] Refactor `themeTokens.test.ts` to import the lifted helpers without changing any pinned number
- [ ] Framework install: only `pnpm add react-colorful@5.8.1`

## Security Domain

`security_enforcement` is not disabled in `.planning/config.json`, so this applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | - |
| V3 Session Management | no | - |
| V4 Access Control | yes (store policy) | `STORE_ALLOWLIST` / `isWritableStoreField` fail-closed; add `customThemes` deliberately, nothing else |
| V5 Input Validation | yes | `parseColour` canonicalisation; gradient validator (`CSS.supports` plus deny-list); `parseCustomThemes` validation on read; token-name allow-list; length caps |
| V6 Cryptography | no | id generation is not security-relevant; use `crypto.getRandomValues` for uniqueness only |
| V12 Data/Resources | yes | cap theme count and token-map size so a corrupt config cannot bloat boot |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Hand-edited/corrupt `config.json` crashes boot | Tampering / DoS | Total `parseCustomThemes`; invalid theme dropped; unknown active key falls back to `DEFAULT_THEME` |
| Gradient text with `url()` causes outbound fetch (CSP allows `img-src https:`) | Information disclosure | Reject `url(`, `var(`, `;`, `{`, `}`, `@`, `!important` before `CSS.supports` |
| Prototype pollution via store key paths | Tampering | Single fixed key `customThemes`; never build dotted keys from ids (`isSafeKeyPath` exists as backstop) |
| Arbitrary CSS property names applied to `body` | Tampering | Only `setProperty` for names in the known token universe matching `/^--[a-z0-9-]+$/` |
| Malicious theme via future import (deferred) | Tampering | The same `parseCustomThemes` gate is the import schema when export/import lands |

## Sources

### Primary (HIGH confidence)
- In-repo files read this session: `64-CONTEXT.md`; `src/frontend/themes.scss`; `src/frontend/styles/_colors.scss`; `src/frontend/index.tsx` (1-70, 140-210, 290-413); `src/frontend/components/UI/ThemeSelector/index.tsx` and `themeLabels.ts`; `src/frontend/state/settingsState.ts`; `src/frontend/screens/Accessibility/index.tsx` and its two tests; `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` (helpers 123-140, 420-692, 700-925, 1530-1660, 2484-2548, 3600-3674); `src/common/types/storePolicy.ts`; `src/common/types/typed_store.ts`; `src/preload/tauriTransport.ts` (snapshotSet/Get); `src/backend/sidecar/storeWriteHandlers.ts`; `src/backend/storeMigrations/index.ts`; `src/backend/storeVersioning/types.ts`; `src/frontend/helpers/stores.ts`; `src-tauri/tauri.conf.json` (CSP); `package.json`, `tsconfig.json`, `jest.config.js`, `src/frontend/jest.config.js`; `.planning/phases/68-*/68-CONTEXT.md`; `.claude/skills/sketch-findings-gamelib/SKILL.md`.
- Measurements this session (node script over `themes.scss` + `_colors.scss`, scratchpad `census.cjs`): `:root` colorSystem 42 tokens, base `body` 22, per-theme declared 25-56, union 123, 16 declared by all 10, resolved per theme 86-107, value shapes (hex, rgba, named `gray`/`white`/`transparent`, gradient 3-4, color-mix 1-2, non-colour 1 (`--focus-ring-width`)), three pure-pair floor ratios.
- `react-colorful` 5.8.1: npm registry, `gsd-tools query package-legitimacy check`, GitHub README, and the shipped `dist/index.mjs` (alpha hex rule, runtime `<style>` injection, nonce support).
- jsdom 20.0.3 behaviour verified by running it (custom property set/remove on `body.style`; `window.CSS` undefined).

### Secondary (MEDIUM confidence)
- None.

### Tertiary (LOW confidence)
- `useBlocker` API shape and `crypto.randomUUID` availability (training knowledge, flagged `[ASSUMED]`).
- The 2026-11-05 comparison artifact (could not be opened).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, one new dependency verified three ways; everything else already installed.
- Architecture: HIGH, every integration point (boot order, snapshot write path, allow-list, body class handling, CSP) was read in source.
- Pitfalls: HIGH for 1-6, 8-10 (verified in source or by measurement); MEDIUM for 7 (visual consequence reasoned from specificity, confirm in live UAT).

**Research date:** 2026-11-17
**Valid until:** 2026-12-17 (stable; revisit if Phase 68 store versioning or `themes.scss` structure changes)
