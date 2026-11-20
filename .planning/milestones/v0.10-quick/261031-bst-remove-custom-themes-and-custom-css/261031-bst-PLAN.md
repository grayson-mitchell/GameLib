---
quick_id: 261031-bst
slug: remove-custom-themes-and-custom-css
mode: quick
---

# Quick 261031-bst: Remove custom themes and Custom CSS

User decision (2026-10-31): keep the app simple and avoid supporting user-authored CSS. No
other users have the app yet, so there is nothing to migrate. Restoring is a `git revert`.

## Task 1: Remove both features end to end

<action>
- Frontend: delete `Settings/components/CustomCSS.tsx` and its Advanced settings slot, CSS rules,
  `window.setCustomCSS`, the boot-time `getCustomCSS` read, `<style id="customCSS">` in
  `index.html`, the custom-theme branch of `window.setTheme` (unknown key -> DEFAULT_THEME), and
  the ThemeSelector's custom-theme listing.
- Backend/IPC: drop `getCustomThemes`, `getThemeCSS`, `getCustomCSS`, `openCustomThemesWiki`
  (handlers, preload, `ipc.ts` types, `customThemesWikiLink`), and the `customCSS` /
  `customThemesPath` keys from `AppSettings`. `themes.ts` keeps `getLoginBackground`.
- Tests: remove the tests of the deleted functions; census 10+15 -> 7+14.
- CSP: config unchanged (MUI/emotion still needs style-src 'unsafe-inline'); rationale updated.
- Locales: upstream `translation.json` catalogs are NOT edited (keepRemoved, D-03; churn guard).
</action>

## Task 2: Refresh i18n gate artifacts

<action>Regenerate `meta/i18nForkTouchedFiles.json`, hand-edit `meta/i18nGateScope.json`, update
pinned counts and the ledger in `genI18nGateScope.test.ts`.</action>

<verify>
- `npx prettier --check` over the exact paths written
- `tsc --noEmit` (app + meta), scoped eslint, affected jest suites, Meta i18n gate suite
</verify>
