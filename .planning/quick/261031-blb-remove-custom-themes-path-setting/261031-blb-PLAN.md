---
quick_id: 261031-blb
slug: remove-custom-themes-path-setting
mode: quick
files_modified:
  - src/frontend/components/UI/ThemeSelector/index.tsx
---

# Quick 261031-blb: Remove the Custom Themes Path setting

## Task 1: Drop the path field, its help entry, and the two info boxes beneath it

<files>src/frontend/components/UI/ThemeSelector/index.tsx</files>

<action>
Remove the `PathSelectionBox` (Custom Themes Path), its `afterInput` wiki-link InfoBox and
"untrusted CSS" warning InfoBox, the `customThemesPath` `hasHelp` registration, and the
config read/write state that only fed the field. Keep the Select Theme dropdown and keep
listing themes from `getCustomThemes()` so a custom theme already chosen stays selectable.
Backend IPC (`getCustomThemes`, `openCustomThemesWiki`) and the `customThemesPath` config key
are left in place.
</action>

<verify>
- `npx prettier --check src/frontend/components/UI/ThemeSelector/index.tsx`
- scoped eslint, `tsc --noEmit`, ThemeSelector + Accessibility jest
</verify>

<done>Settings shows only the theme dropdown; no path field, help entry, or warning boxes.</done>
