---
created: 2026-10-22
title: "First run should show a welcome screen (log into your stores first; macOS: install and buy CrossOver), not the changelog"
source: operator request during phase 51-19 live gates on a fresh Mac
area: onboarding
files:
  - src/frontend/components/UI/NavShell/components/HeroicVersion/index.tsx
  - src/frontend/screens/Settings/components/HideChangelogOnStartup.tsx
  - src/frontend/state/GlobalState.tsx
severity: minor
platform: any
ready: code
---

On a fresh install, GameLib opens the inherited Heroic changelog modal
(`HeroicVersion/index.tsx`, `showChangelogModal` starts as `true`; the same path logs "Updated to a
new version, cleaaning up the cache."). For someone who has never run the app, a changelog
explains nothing. They have no games yet and no idea why.

Operator ask: on the first ever launch, show a welcome message instead of the changelog that:

1. Explains that you should first log into the game services you use (Epic, GOG, Amazon, Steam)
   so your libraries appear.
2. On macOS only: explains that Windows games need CrossOver, and asks users to support it by
   buying the software (link to codeweavers.com).

Notes:
- First run must be told apart from an upgrade. Upgrades keep showing the changelog as they do
  today, and "Hide changelog on startup" keeps its meaning.
- The CrossOver line should only show when no CrossOver install is detected, or should at least
  read sensibly when one is.
- New strings belong in the `gamelib` namespace, with all locales filled, as in phase 51-04.
- Related: `2026-10-22-no-crossover-notice-falsely-promises-gamelib-will-set-it-up.md`. The
  install dialog currently claims GameLib sets CrossOver up itself, and the welcome text must not
  repeat that claim.
