---
phase: 64-ui-to-edit-themes
reviewed: 2026-11-19T09:40:49Z
depth: standard
files_reviewed: 82
files_reviewed_list:
  - knip.jsonc
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/genThemeTokens.ts
  - src-tauri/src/ipc_contract.rs
  - src/backend/sidecar/__tests__/ipcSchemas/sidecarInternal.test.ts
  - src/backend/sidecar/__tests__/storeLayer.test.ts
  - src/backend/sidecar/storeWriteHandlers.ts
  - src/common/types.ts
  - src/common/types/__tests__/storePolicy.test.ts
  - src/common/types/customTheme.ts
  - src/common/types/ipc/sidecarInternal.ts
  - src/common/types/sidecarTransport.ts
  - src/common/types/storePolicy.ts
  - src/common/types/typed_store.ts
  - src/frontend/App.tsx
  - src/frontend/components/UI/DialogHandler/components/MessageBoxModal/__tests__/autoFocus.test.tsx
  - src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.tsx
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
  - src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx
  - src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts
  - src/frontend/components/UI/NoticeStack/index.tsx
  - src/frontend/components/UI/ThemeSaveFailedNotice/__tests__/ThemeSaveFailedNotice.test.tsx
  - src/frontend/components/UI/ThemeSaveFailedNotice/index.scss
  - src/frontend/components/UI/ThemeSaveFailedNotice/index.tsx
  - src/frontend/components/UI/ThemeSelector/RenameThemeDialog.tsx
  - src/frontend/components/UI/ThemeSelector/ThemeCard.tsx
  - src/frontend/components/UI/ThemeSelector/ThemeCardActions.tsx
  - src/frontend/components/UI/ThemeSelector/ThemeGallery.tsx
  - src/frontend/components/UI/ThemeSelector/ThemeThumbnail.tsx
  - src/frontend/components/UI/ThemeSelector/__tests__/RenameThemeDialog.test.tsx
  - src/frontend/components/UI/ThemeSelector/__tests__/ThemeGallery.test.tsx
  - src/frontend/components/UI/ThemeSelector/__tests__/ThemeGalleryCustom.test.tsx
  - src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx
  - src/frontend/components/UI/ThemeSelector/index.scss
  - src/frontend/components/UI/ThemeSelector/index.tsx
  - src/frontend/components/UI/ThemeSelector/themeDialogs.ts
  - src/frontend/customThemes/__tests__/applyTheme.test.ts
  - src/frontend/customThemes/__tests__/builtinTokens.test.ts
  - src/frontend/customThemes/__tests__/colour.test.ts
  - src/frontend/customThemes/__tests__/contrastFloors.test.ts
  - src/frontend/customThemes/__tests__/customTheme.test.ts
  - src/frontend/customThemes/__tests__/flatten.test.ts
  - src/frontend/customThemes/__tests__/thumbnailPalette.test.ts
  - src/frontend/customThemes/__tests__/validate.test.ts
  - src/frontend/customThemes/applyTheme.ts
  - src/frontend/customThemes/builtinTokens.ts
  - src/frontend/customThemes/colour.ts
  - src/frontend/customThemes/contrastFloors.ts
  - src/frontend/customThemes/customTheme.ts
  - src/frontend/customThemes/flatten.ts
  - src/frontend/customThemes/thumbnailPalette.ts
  - src/frontend/customThemes/tokenResolve.ts
  - src/frontend/customThemes/tokens.ts
  - src/frontend/customThemes/validate.ts
  - src/frontend/helpers/stores.ts
  - src/frontend/index.tsx
  - src/frontend/screens/Accessibility/ThemeEditor/AdvancedSection.tsx
  - src/frontend/screens/Accessibility/ThemeEditor/ColourField.tsx
  - src/frontend/screens/Accessibility/ThemeEditor/GradientField.tsx
  - src/frontend/screens/Accessibility/ThemeEditor/PreviewPane.tsx
  - src/frontend/screens/Accessibility/ThemeEditor/TokenList.tsx
  - src/frontend/screens/Accessibility/ThemeEditor/TokenRow.tsx
  - src/frontend/screens/Accessibility/ThemeEditor/__tests__/AdvancedSection.test.tsx
  - src/frontend/screens/Accessibility/ThemeEditor/__tests__/ColourField.test.tsx
  - src/frontend/screens/Accessibility/ThemeEditor/__tests__/GradientField.test.tsx
  - src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditor.test.tsx
  - src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditorLeave.test.tsx
  - src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditorWarnings.test.tsx
  - src/frontend/screens/Accessibility/ThemeEditor/index.scss
  - src/frontend/screens/Accessibility/ThemeEditor/index.tsx
  - src/frontend/screens/Accessibility/ThemeEditor/tokenLabels.ts
  - src/frontend/screens/Accessibility/ThemeEditor/unsavedChangesDialog.ts
  - src/frontend/screens/Accessibility/index.css
  - src/frontend/screens/Accessibility/index.tsx
  - src/frontend/state/ThemeSaveFailedNotice.ts
  - src/frontend/state/__tests__/customThemesState.test.ts
  - src/frontend/state/settingsState.ts
  - src/frontend/testUtils/scssTokenSource.ts
  - src/preload/__tests__/storeApi.test.ts
  - src/preload/__tests__/tauriTransport.test.ts
  - src/preload/api/misc.ts
  - src/preload/tauriTransport.ts
findings:
  critical: 1
  warning: 5
  info: 6
  total: 12
  necessity: 1
status: issues_found
---

# Phase 64: Code Review Report

**Reviewed:** 2026-11-19T09:40:49Z
**Depth:** standard
**Files Reviewed:** 82
**Status:** issues_found

## Summary

I reviewed the Phase 64 changes since `2e3460388`: the theme gallery, Duplicate/Rename/Delete, the token editor, the confirmed-write channel (`sidecar:store-set-checked`), `applyTheme`, the token parsing and validation layer, and the built-in token generator. The diff also includes some hunks from Phase 81 commits (`steampoll_hold_*` channels and the removal of `rearmSettled` in `ipc_contract.rs`, `sidecarTransport.ts` and `sidecarInternal.ts`). I did not review those, because they are outside this phase.

Most of the design holds up. Theme names reach the DOM only as React text. Token names are checked against a closed set before they reach `body.style`. The confirmed-write path goes through the same `applyStoreWrite` guards as `storeSet`. Built-in seeds are canonical, and Duplicate copies them without changing them.

The main defect is in the gradient validator, which is the phase's own control for threat T-64-12. It does not stop a network fetch. I confirmed the bypass against a real WKWebView. Next in importance are three ways the editor can lose edits or report them inaccurately: a save still in flight when the user leaves, an over-length gradient that is dropped without notice, and a race across the `await` in the save path. Duplicate, Rename and Delete also persist differently from Save, because they do not wait for the write to be confirmed.

## Critical Issues

### CR-01: Gradient validator lets a layered `image-set("https://...")` through, so a token value can fetch from the network (T-64-12 bypass)

**File:** `src/frontend/customThemes/validate.ts:13-40` (also used by `customTheme.ts:82` and `GradientField.tsx:42-66,114`)
**Issue:** `isValidGradient` checks three things. The value must not match `GRADIENT_DENY` (`var(`, `url(`, `;`, `{`, `}`, `@`, `!important`, `\`), it must start with `*-gradient(` and end with `)`, and `CSS.supports('background-image', value)` must accept it. None of these checks limits the value to a single gradient. A comma-separated second layer passes all three:

```
linear-gradient(red, blue), image-set("https://attacker.example/p.png" 1x)
```

There is no `url(` in this value, so the deny list does not match. It starts with `linear-gradient(` and ends with `)`. I ran `CSS.supports` in a WKWebView on this machine (a Swift probe in the scratchpad) for three values: this payload, the `-webkit-image-set(` form, and a plain gradient. All three returned `true`. The CSP allows `img-src 'self' data: https: http:` (`src-tauri/tauri.conf.json:32`), so the browser fetches the image.

The payload is reachable in two ways:
- **When the app starts.** If the value is stored in `config.json`, `parseCustomThemes` → `cleanTokens` → `isValidGradient` accepts it. `applyTheme` then sets it inline on `<body>`. `--gradient-gamecard` is drawn as `background-image` (`GameCard/index.css:283`) and `--gradient-body-background` as `background` (`App.css:99`, `index.scss:107`). This is the exact "a network fetch on every app start" scenario that the comment on `validate.ts:9-12` says is refused.
- **While editing, with no Save.** `GradientField` sets `lastValid` once the text validates and paints it into `style={{ backgroundImage: lastValid }}`. Pasting the string into an Advanced gradient row fetches the image immediately. That also breaks T-64-21.

**Fix:** Accept exactly one gradient function whose matching `)` is the last character, and refuse quoted strings. Every image-set or cross-fade source is either a `url(` or a string.
```ts
const GRADIENT_DENY = /var\(|url\(|image-set\(|cross-fade\(|element\(|src\(|["';{}@\\]|!important/i

export function isValidGradient(text: string, supports: SupportsFn = defaultSupports): boolean {
  const candidate = text.trim()
  if (GRADIENT_DENY.test(candidate)) return false
  const m = GRADIENT_START.exec(candidate)
  if (!m || !candidate.endsWith(')')) return false
  // the paren opened by the gradient function must close at the very end: one layer only
  let depth = 0
  for (let i = m[0].length - 1; i < candidate.length; i++) {
    if (candidate[i] === '(') depth++
    else if (candidate[i] === ')' && --depth === 0 && i !== candidate.length - 1) return false
  }
  return depth === 0 && supports('background-image', candidate)
}
```
Add regression cases for `image-set("…")`, `-webkit-image-set("…")` and the multi-layer form to `validate.test.ts`. jsdom has no `CSS.supports`, so these cases need an injected `supports` that returns `true`. Otherwise they pass whether or not the code is fixed.

## Warnings

### WR-01: Leaving the editor while a Save is in flight loses the draft, and a later failure notice says the changes are "still here"

**File:** `src/frontend/screens/Accessibility/ThemeEditor/index.tsx:79-82` with `src/frontend/components/UI/ThemeSaveFailedNotice/index.tsx:68-72`
**Issue:** The blocker predicate is `dirty && !saving && …`, so the editor never blocks navigation while a save is running. If the user clicks Save and then clicks Back or a nav tab before the invoke resolves, the editor unmounts and the draft is gone. If the write is then refused (for example a read-only store or a guard rejection), `save()` still calls `useThemeSaveFailedNotice.getState().show(theme.name)`. The notice reads "Your changes are still here, so try again", but nothing is left to try again with.
**Fix:** Keep blocking while `saving` is true, and continue the blocked navigation only after the save settles. For example, record a pending blocker and call `proceed()` on `'saved' | 'applied'` and `reset()` on `'failed'`. The other option is to give the notice different wording when the editor that raised it has unmounted.

### WR-02: A gradient over 512 characters is dropped on Save, but Save still reports "Saved"

**File:** `src/frontend/screens/Accessibility/ThemeEditor/GradientField.tsx:59-81`, `src/frontend/customThemes/customTheme.ts:79-81`, `src/frontend/state/settingsState.ts:208-219`
**Issue:** `GradientField` accepts any value `isValidGradient` passes and has no length limit. `saveCustomThemeTokens` runs `cleanTokens`, and `cleanTokenValue` returns `null` for anything over `MAX_TOKEN_VALUE_LENGTH` (512), so the token is removed without a message. The function still returns `'saved'`/`'applied'`, and the editor shows "Saved". Afterwards `draft` still holds the token and `theme.tokens` does not, so the editor shows both "Saved" and "Unsaved changes". On the leave-dialog path, `onSave` gets `'saved'` and calls `blocker.proceed()`, so the user leaves and the gradient is lost.
**Fix:** Apply the same limit in the field, so an over-long value is shown as invalid and never committed. In `saveCustomThemeTokens`, return `'failed'` (or a distinct outcome) when `Object.keys(cleaned).length !== Object.keys(tokens).length`, so nothing is dropped without the user knowing:
```ts
const accepts = (c: string) =>
  (allowEmpty && c.trim() === '') ||
  (c.trim().length <= MAX_TOKEN_VALUE_LENGTH && isValidGradient(c, supports))
```

### WR-03: `saveCustomThemeTokens` builds its write from a snapshot taken before the `await`, which can undo a concurrent rename or delete

**File:** `src/frontend/state/settingsState.ts:208-219`, `src/preload/tauriTransport.ts:558-575`
**Issue:** The function reads `existing = get().customThemes`, builds `next`, waits for `configStore.setChecked`, and then calls `set({ customThemes: next })`. In the transport, `snapshotSetChecked` likewise writes `value` into the snapshot after its `await`. If anything changes `customThemes` during the round trip, the late writes overwrite it. Examples are a rename from the editor header (`RenameThemeDialog`) or a delete or duplicate in another window. A rename sent with `storeSet` after the invoke reaches disk with the old tokens. The renderer then sets state and snapshot to `next`, which has the old name. Disk and renderer disagree, and a delete made during the window comes back in the renderer.
**Fix:** After the await, merge only this theme's tokens into the current state, and skip the merge if the theme no longer exists:
```ts
if (!(await configStore.setChecked('customThemes', next))) return 'failed'
const current = get().customThemes
if (!current.some((t) => t.id === id)) return 'failed'
const merged = current.map((t) => (t.id === id ? { ...t, tokens: cleaned } : t))
set({ customThemes: merged })
```
Alternatively, serialise every `customThemes` mutation through one queue. The transport's snapshot write has the same problem; one fix is to apply the post-await snapshot write only if the snapshot still holds the value that was there before the invoke.

### WR-04: Duplicate, Rename and Delete persist without confirmation, while Save waits for confirmation

**File:** `src/frontend/state/settingsState.ts:141-195`
**Issue:** Decision D-05 introduced `setChecked` so that the UI never says something reached disk when it did not. `duplicateTheme`, `renameCustomTheme` and `deleteCustomTheme` still use `configStore.set`. `snapshotSet` updates the renderer snapshot before the write is confirmed, and the sidecar refuses the write without telling the renderer: guard (e), a read-only store, returns `false` and logs only to stderr. With a read-only config store (Phase 68), a user can duplicate a theme, see it in the gallery and open its editor. Save then fails with "Couldn't save". On the next launch the duplicate is gone, a deleted theme is back, and a rename is undone, with no warning at any point.
**Fix:** Route these three setters through `setChecked` as well. Update zustand state only on `true`, and report failure through the same notice or the dialog result. This makes all four mutations behave like Save.

### WR-05: Impossible-state guard: `THEME_ID_PATTERN` check on a freshly generated id

**File:** `src/frontend/customThemes/customTheme.ts:196`
**Category:** necessity
**Issue:** `newCustomThemeId` maps exactly 8 bytes through `b.toString(16).padStart(2, '0')`. Every byte is 0-255, so each one gives exactly two lowercase hex digits, and the result is always 16 lowercase hex characters (lines 191-195). `THEME_ID_PATTERN.test(id)` can therefore never fail, even with the injected `random` test seam, which only fills the same `Uint8Array(8)`. The guard that matters is the `parseCustomThemes` check at line 123, where stored data crosses a trust boundary, and that one should stay.
**Fix:** Drop `THEME_ID_PATTERN.test(id) &&` from line 196. Keep only the collision check.

## Info

### IN-01: For built-in sources, Duplicate passes the theme key to `nextCopyName` but the formatter uses the display label

**File:** `src/frontend/state/settingsState.ts:153`, `src/frontend/components/UI/ThemeSelector/ThemeGallery.tsx:44-52`
**Issue:** For a built-in source, `sourceName = resolved.key` (for example `gruvbox_dark`). The gallery's `copyName` formatter closes over the localised label ("Gruvbox Dark"). `nextCopyName`'s `fit()` looks for `sourceName` in the formatted text, does not find it, and falls back to `candidate.slice(0, 60)`, which cuts off the copy suffix. That is the opposite of what the function's doc comment says. It is harmless with the current label lengths, but wrong for long localisations.
**Fix:** Pass the label into `duplicateTheme`, or have the gallery call `resolveThemeLabel` inside the store action, so that `sourceName` is the same string the formatter puts in.

### IN-02: The gallery marks no card as active when the stored key falls back to the default theme

**File:** `src/frontend/components/UI/ThemeSelector/ThemeGallery.tsx:41,71,117-120`
**Issue:** `applyTheme` paints `DEFAULT_THEME_KEY` for an unknown key, such as a custom theme dropped by `parseCustomThemes` or a leftover custom CSS filename. `resolved.kind === 'unknown'` then matches no card, so the app shows Midnight Mirage while no card carries the "Active" mark.
**Fix:** Treat `resolved.kind === 'unknown'` as active for `DEFAULT_THEME_KEY`, or normalise the stored `theme` to the fallback at boot.

### IN-03: `cleanTokens` accepts a gradient for any token, including colour tokens

**File:** `src/frontend/customThemes/validate.ts:45-53`, `src/frontend/customThemes/customTheme.ts:82`
**Issue:** `isValidTokenValue` ignores `_name` and decides by the value's shape alone. A hand-edited `--accent: linear-gradient(...)` passes `cleanTokens`, and `applyTheme` applies it. Every `color: var(--accent)` consumer then becomes invalid at computed-value time. Meanwhile the editor's `ColourField` shows the stored value as an error that the user cannot clear. This also widens where a CR-01 payload can be planted.
**Fix:** Allow gradient values only for gradient tokens: names starting with `--gradient-`, or tokens whose base seed value is a gradient.

### IN-04: The `label` prop of `GradientField` is unused

**File:** `src/frontend/screens/Accessibility/ThemeEditor/GradientField.tsx:9-10,30-37`
**Issue:** `label` is declared and passed by `TokenRow`, but never destructured or read. The comment says it is "kept for symmetry".
**Fix:** Remove the prop, or use it, for example in the error text.

### IN-05: Copy-name truncation can split a surrogate pair

**File:** `src/frontend/customThemes/customTheme.ts:169-171`
**Issue:** `sourceName.slice(0, sourceName.length - excess)` counts UTF-16 code units. A 60-character name that ends in an emoji can be cut to a lone surrogate, which then gets stored as the theme name.
**Fix:** Truncate by code points, for example `Array.from(sourceName).slice(0, n).join('')`, and measure length the same way.

### IN-06: A module in the production `customThemes` tree imports from `testUtils`

**File:** `src/frontend/customThemes/flatten.ts:15-20`
**Issue:** `flatten.ts` sits next to the runtime modules but depends on `src/frontend/testUtils/scssTokenSource`. Only `meta/genThemeTokens.ts` and the tests use it today. If a runtime import is ever added, test utilities get bundled, and the placement suggests the module is runtime code.
**Fix:** Move `flatten.ts` and `scssTokenSource.ts` into a shared non-test location such as `src/common/themeTokens/`, or add a comment and a lint boundary saying it is generator-only.

---

_Reviewed: 2026-11-19T09:40:49Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
