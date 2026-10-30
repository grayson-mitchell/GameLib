---
quick_id: 261031-bst
status: complete
commits: [17aff87d6, 4ee4002af]
---

# Quick 261031-bst: Remove custom themes and Custom CSS

**Removed:** the custom-themes folder loader and the Custom CSS setting, end to end. That covers
the Advanced settings textarea, the `<style id="customCSS">` slot, the boot-time CSS read, the
custom-theme branch in `setTheme`, the themes-wiki link, the four IPC channels
(`getCustomThemes`, `getThemeCSS`, `getCustomCSS`, `openCustomThemesWiki`) with their preload
and types, and the `customCSS`/`customThemesPath` settings keys. `setTheme` now falls back to
the default theme for any key that isn't built in, so a stale stored filename can't leave the
UI unstyled.

**Deliberately unchanged:**
- CSP `style-src 'unsafe-inline'`: MUI/emotion's runtime `<style>` injection still needs it.
  Only the rationale comment and one test title changed.
- `public/locales/*/translation.json`: upstream catalogs keep removed keys (keepRemoved, D-03).
  A first pass deleted 7 keys across 47 locales; the churn guard flagged it, so the change
  was reverted before commit.

**Gate artifacts (4ee4002af):** `CustomCSS.tsx` leaves both i18n lists (scope 247 -> 246).
Pre-existing drift fixed along the way: `storeExitRefresh.ts` (261030-qqh) was missing from
fork-touched, so A-17 was already red. It is now listed and declared unscanned debt
(3 log-line findings), and fork-touched stays 293.

**Verified:** app and meta `tsc --noEmit` clean, scoped eslint 0 errors, scoped prettier clean,
31 affected jest suites / 524 tests pass, Meta i18n gate suite green. Remaining Meta failures
belong to other work: the `steamclientLayerCatalogue` pins (concurrent Phase 58 session) and the
churn-guard live-tree check (pre-existing uncommitted `en/gamepage.json`).
**Not live-checked in the app.**
