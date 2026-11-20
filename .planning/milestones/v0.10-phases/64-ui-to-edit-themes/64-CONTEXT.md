# Phase 64: UI to edit themes - Context

**Gathered:** 2026-11-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can make their own theme by duplicating a theme and editing its colours. The 10 built-in
themes in `src/frontend/themes.scss` never change. Three parts, fixed by ROADMAP.md:

1. **Theme gallery.** A preview thumbnail for every theme, drawn from that theme's real token
   values: body, sidebar, active nav row, accent and search outline, library tiles, and the
   primary / secondary / success / danger buttons. THEME-01.
2. **Duplicate, then edit.** Duplicate creates a custom theme seeded with the source's resolved
   token values. It opens a token editor whose preview thumbnail updates as values change.
   THEME-02.
3. **Use it.** Saved custom themes appear beside the built-ins and apply app-wide. They are
   stored as token data, not CSS files.

Out of scope: exporting or importing themes (deferred), editing built-in themes, and fonts,
spacing or other non-colour styling.

</domain>

<decisions>
## Implementation Decisions

### Gallery & editor home
- **D-01:** The gallery **replaces** the theme `SelectField` on the Appearance screen
  (`src/frontend/screens/Accessibility/index.tsx`, `<ThemeSelector />`). It becomes the only
  way to pick a theme. — **Reversibility:** costly — tests and the a11y gates target the
  current `#theme_selector` dropdown.
- **D-02:** The grid has two labelled groups: **Built-in** and **Your themes**. Built-in cards
  carry a read-only cue, such as a lock.
- **D-03:** Clicking a card **applies** that theme, as the dropdown does today. Every card has a
  **Duplicate** action. Custom cards also have **Edit**, **Rename** and **Delete**.
- **D-04:** The editor is a **split-pane page** in the Appearance area: the grouped token list
  on one side, a large live preview thumbnail on the other.
- **D-05:** While editing, changes update **only the preview thumbnail**. The real app changes
  on **Save**, and only if the edited theme is the active one. A bad value must never make the
  editor itself unreadable.
- **D-06:** Leaving the editor with unsaved changes shows a **Save / Discard / Cancel** prompt.
- **D-07:** Management actions in scope are Rename, Delete (with confirmation) and Duplicate. A
  custom theme can be duplicated too. A copy's default name is "<source name> copy", which must
  go through i18n.

### Copies and nested component overrides
- **D-08:** A custom theme records its **base built-in** theme. Applying a custom theme puts the
  base's class on `body` (e.g. `nord-light`) and sets the custom token values as CSS custom
  properties over it. The base's nested component rules, such as Nord Light's ~22 rules
  (`.MuiDialog-paper`, `.genre`, `.contextMenu`, …), keep working, and those that read `var()`
  follow the user's edits. A copy of a custom theme keeps the original built-in base. —
  **Reversibility:** costly — the stored shape (base key plus tokens) becomes persisted user
  data, so changing it later needs a Phase 68 store migration.
- **D-09:** Nested overrides are **not** turned into tokens in this phase. Hard-coded hex values
  inside nested rules (`.genre #2e3440`, `.runnerIcon #88c0d0`, the log-box `#dde1e7`, …) stay
  fixed for copies.
- **D-10:** Copies are **frozen snapshots**. Duplicate stores every resolved token value, so a
  later release that changes a built-in never changes a user's copy. Only the inherited nested
  rules can shift.
- **D-11:** Duplicate **flattens `var()` chains to literal values**, resolved through
  `styles/_colors.scss` and the theme block, as ROADMAP specifies. In a copy each token is
  independent, so editing `--text-title` does not move `--text-default`. — **Reversibility:**
  one-way — once flattened, saved copies lose the link structure, and it cannot be recovered
  from stored data.

### Editable tokens
- **D-12:** The editor groups a **core set of about 25 tokens**: Surfaces, Navigation, Text,
  Buttons, Accent and Status. These are the tokens every built-in sets and the thumbnail draws.
  A collapsed **Advanced** section lists every other resolved token, about 130 in the union of
  `themes.scss` and the base `colorSystem`.
- **D-13:** Each colour token has a **swatch that opens a picker with an alpha channel**, plus a
  text field that accepts hex or rgba. Input is validated. Native `<input type=color>` alone is
  rejected because it has no alpha, and many tokens use alpha (`#000000cc`, `#484daf5b`).
- **D-14:** **Gradient tokens** (e.g. `--gradient-body-background`) are shown only in Advanced,
  as **raw CSS text**, and accepted only if `CSS.supports` validates them. There is no gradient
  picker.

### Contrast floors
- **D-15:** The editor shows **live inline warnings** next to a token that breaks a contrast
  floor, e.g. "Border vs body 2.1:1, needs 3:1". Warnings **never block Save**.
- **D-16:** The contrast math and floor table move out of
  `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` into a **shared module**
  that both the test and the editor import, so there is one source of truth. No new floors are
  added: no WCAG 4.5:1 text check in this phase.

### Claude's Discretion
- **Thumbnail rendering:** a scaled DOM mini-launcher styled by scoped CSS variables, or an
  SVG, as long as it draws the elements listed in the domain from real token values. The
  2026-11-05 comparison artifact is the visual reference.
- **Storage shape and key:** keep it in the settings/theme store (Phase 69 D-13) and persist it
  through the configStore with a Phase 68 store version. The shape must be JSON-friendly and
  self-describing (id, name, base, tokens) so a later export is trivial. Also choose how the
  active theme references a custom one, e.g. a `custom:<id>` key.
- **`window.setTheme` custom branch** (`src/frontend/index.tsx:317`): resolve a custom key to
  its base class plus applied variables. An unknown or deleted custom id falls back to
  `DEFAULT_THEME`, as unknown keys do today.
- **Deleting the active theme:** fall back to its base built-in, or to the default if that
  fails, and say so in the confirmation text.
- Which exact tokens make up the "core ~25". Start from the tokens declared in all 10 themes
  (`--body-background`, `--navbar-*`, `--modal-*`, `--input-background`, `--primary`,
  `--secondary-button`, `--success*`, `--accent*`, `--action-icon*`, …) and the tokens the
  thumbnail draws.
- How the titlebar overlay (`--titlebar-*`) is refreshed after applying a custom theme.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Theme definitions and application
- `src/frontend/themes.scss` — the 10 read-only built-in themes. `body.nord-light` (L417–573)
  holds the nested component overrides D-08 depends on.
- `src/frontend/styles/_colors.scss` — the `colorSystem` base tokens that `var()` chains
  resolve through (D-11).
- `src/frontend/index.tsx` §`window.setTheme` (L317–357) — today's built-in-only fallback, the
  titlebar overlay and the boot-time `migrateThemeKey`.
- `src/frontend/components/UI/ThemeSelector/index.tsx`, `themeLabels.ts` — the current dropdown
  that D-01 replaces, `defaultThemes`, `resolveThemeLabel` and the i18n gate notes.
- `src/frontend/screens/Accessibility/index.tsx` — the Appearance screen that hosts the gallery.

### State and persistence
- `src/frontend/state/settingsState.ts` — the theme store, where custom-theme state goes
  (Phase 69 D-13).
- `.planning/phases/69-consolidate-frontend-state-onto-globalstatev2/69-CONTEXT.md` §D-13 —
  Phase 64 state belongs in the settings/theme zustand store, never in GlobalState.
- `.planning/phases/68-versioned-persisted-stores-and-migrations/68-CONTEXT.md` — store
  versioning and migrations. Custom themes are the first known shape change it anticipates.

### Contrast floors
- `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` — `contrastRatio`,
  `resolveValue`, `resolveColour` and the floor checks to extract into a shared module (D-16).

### Design
- `.claude/skills/sketch-findings-gamelib/SKILL.md` — multi-theme survival rules. Themes such as
  Dracula draw the navbar lighter than the body, so thumbnails must show this truthfully.
- Theme comparison artifact, 2026-11-05: https://claude.ai/artifact/Ji88yFXU7ymdVoTn1kV4kY —
  the visual reference for the thumbnails.

### Requirements
- `.planning/REQUIREMENTS.md` — THEME-01 (gallery), THEME-02 (duplicate and edit; built-ins
  never change).
- `.planning/ROADMAP.md` §Phase 64.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `themeTokens.test.ts` already has a SCSS block parser (`cssBlock`, `declsAtDepthZero`,
  `nestedRules`) and colour resolution (`resolveValue`, `resolveColour`, `contrastRatio`). The
  same resolution logic can seed Duplicate. At runtime, `getComputedStyle` on an element with
  the theme class gives resolved values without parsing SCSS.
- `SelectField`, the MUI `Dialog` pattern and `useOpenDialog` are available for the
  confirmations in D-06 and D-07.
- `defaultThemes` / `resolveThemeLabel` give the built-in keys and their i18n labels.

### Established Patterns
- Theme = class on `document.body`. Tokens are CSS custom properties declared in
  `body.<key> { … }`.
- Setters in `settingsState` write `configStore` themselves; there is no persist middleware
  (Phase 69 D-02).
- User-visible strings must pass `meta/hardcodedStringGate.ts`. Use the
  `t('gamelib:…', 'English')` literal-call pattern (see the `themeLabels.ts` header).
- Contrast floors are enforced in CI only for the built-ins; the editor adds a runtime check
  (D-15).

### Integration Points
- `window.setTheme` needs a custom-theme branch. Applying a theme must clear the previous custom
  theme's inline variables.
- Boot (`index.tsx` L352–357) reads `configStore.get('theme')` before rendering, so custom
  theme data must be readable synchronously at that point.
- The Appearance screen swaps `<ThemeSelector />` for the gallery, and the editor route or page
  is reached from it.

</code_context>

<specifics>
## Specific Ideas

- Thumbnails should look like the theme comparison page from 2026-11-05
  (https://claude.ai/artifact/Ji88yFXU7ymdVoTn1kV4kY): a small launcher drawn from real token
  values.
- Contrast warnings name the pair and the numbers, e.g. "Border vs body 2.1:1, needs 3:1".

</specifics>

<deferred>
## Deferred Ideas

- **Export / import custom themes as JSON files.** Raised during discussion and deferred to the
  backlog: it needs file dialogs, an import schema and validation of untrusted input. D-08's
  self-describing storage shape keeps it cheap later.
- **Turning nested component overrides into tokens** (the Tokenize option in D-08/D-09). It
  would make every Nord Light component colour editable, but it is a refactor of all 10 themes.
- **WCAG 4.5:1 text-against-background floor.** Not added (D-16). The built-ins may not all meet
  it today.

### Reviewed Todos (not folded)
- `todo.match-phase 64` returned only keyword-noise matches: Windows signing, a blank packaged
  app, depot optional DLC, the winebus pad wedge, Amazon store-exit refresh, Steam
  verify/move, and the CI HEAD-check. None relate to themes, so none were folded.

</deferred>

---

*Phase: 64-ui-to-edit-themes*
*Context gathered: 2026-11-17*
