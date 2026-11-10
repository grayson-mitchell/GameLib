---
created: 2026-11-10T00:00:00.000Z
title: 'Library filter panel says "Collections" while menus and the manager say "Categories"'
area: frontend
severity: minor
platform: any
ready: code
found_by: 'Operator, during the Phase 69 D-16 live gate (69-UAT.md item 1); pre-existing, not a Phase 69 regression'
files:
  - src/frontend/components/UI/NavShell/components/FilterCollectionList/index.tsx (gamelib:library.filterPanel.collections, gamelib:library.filterPanel.manageCollections)
  - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx (gamelib:library.filterPanel.collections)
  - src/frontend/screens/Game/GameSubMenu/index.tsx (submenu.categories)
  - src/frontend/screens/Library/components/GameCard/index.tsx (submenu.categories)
  - src/frontend/screens/Library/components/CategoriesManager/index.tsx (categories-manager.*)
  - src/frontend/screens/Settings/components/SettingsModal/index.tsx (header.categories)
---

## Problem

The same user concept is named two ways. The left library filter panel header
and its "Manage collections" action say "Collections"
(`gamelib:library.filterPanel.collections`, `...manageCollections`), and the
tour copy says "custom Collections". The game submenu, game card menu, the
manager dialog ("Manage Categories") and settings say "Categories".

## Solution

Pick one term and use it everywhere (user-facing strings and the en locale in
`public/locales/en/translation.json`; keep internal identifiers as they are).
Not fixed here; filed from the UAT only.

## Resolution

Term chosen: Categories (operator decision; already translated in the inherited locales). Keys and identifiers unchanged. Resolved by quick task 261110-vnl.

- en values changed: `filterPanel.collections`, `filterPanel.manageCollections`, `filterPanel.newCollection`, `tour.library.quickFiltersCollections` (gamelib.json) and `tour.library.viewsCollections` (translation.json).
- Non-en locales mapped from `header.categories` / `categories-manager.title` / "+ " + `category-settings.new-category`. Locales with no such wording keep their existing translation, per key: collections skipped for br, bs, eu, fa, he, ro, sl, uz; manageCollections skipped for az, br, bs, eu, fa, he, hr, ka, sl, sr, th, uz; newCollection skipped for az, br, bs, eu, fa, he, hr, ka, sl, sr, th, uz.
