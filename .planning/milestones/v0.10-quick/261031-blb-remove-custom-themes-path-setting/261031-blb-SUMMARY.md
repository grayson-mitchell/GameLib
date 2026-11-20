---
quick_id: 261031-blb
status: complete
commit: d3d84d8c1
---

# Quick 261031-blb: Remove the Custom Themes Path setting

Removed the Custom Themes Path field from the theme settings, together with its help-panel
entry, the "Check the Wiki" info box, and the "Do not use CSS files from untrusted sources"
warning. The component is now just the Select Theme dropdown.

Kept on purpose: themes found in a `customThemesPath` already saved in config still show in
the dropdown, so a custom theme someone already picked doesn't silently disappear. The backend
IPC (`getCustomThemes`, `openCustomThemesWiki`, `customThemesWikiLink`), the config key, and
the now-unused locale strings were not touched.

**Verified:** scoped prettier + eslint clean, `tsc --noEmit` clean for the file, ThemeSelector +
Accessibility jest 28/28. **Not live-checked in the app.**
