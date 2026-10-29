---
created: 2026-10-29
title: "D-UAT-12: library card shows plain Install for an incomplete Steam install (no Resume Install)"
source: Phase 21 Windows UAT pass 2026-10-29 (21-UAT.md D-UAT-12)
area: steam
files:
  - .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md
  - src/frontend/screens/Library/components/GameCard/index.tsx
severity: minor
platform: any
ready: code
---

With an incomplete (StateFlags 1026) install, the detail page correctly shows Resume Install, but the
card shows only the download icon and the tooltip "Install (Darkest Dungeon)". GameCard/index.tsx:301
hardcodes t('button.install'), and the hasStatus label ("Resume Install" for statusContext
steam-incomplete) renders at line 539 only under haveStatus, which notInstalled does not appear to set.

## Resolution

- **Fix commit:** e704b397e (quick-261029-ocq).
- **Root cause:** GameCard dropped `statusContext` from `hasStatus`; the tooltip and context-menu
  hardcoded `button.install`; `haveStatus` excludes `notInstalled`, so the "Resume Install" label
  never rendered.
- **Fix:** `isSteamIncompleteCard` predicate drives the tooltip, context-menu label and status text.
- **Status:** code fix only, not live re-tested on Windows.
