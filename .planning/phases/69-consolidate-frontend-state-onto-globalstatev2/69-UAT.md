---
status: complete
phase: 69-consolidate-frontend-state-onto-globalstatev2
source: [69-26-PLAN.md]
started: 2026-11-10
updated: 2026-11-10
---

# Phase 69 UAT: D-16 live gate on the fully migrated app

Run in `pnpm tauri:dev` (never `tauri:dev:run`). Items 1-20 with Settings > Use frameless window ON, then item 21 with it OFF (re-check 5, 17, 18 in that mode). Quit and relaunch between change and check for items 8 and 16. Record status words and symptoms only; no usernames, keys or tokens.

## Current Test

[testing complete]

## Tests

### 1. Library filters
expected: Search, store facets and views narrow the grid, and clearing them restores the full grid.
result: pass (operator noted, outside this test: the left library panel labels categories "Collections" while the menu calls them "Categories"; pre-existing, filed as a todo, not a phase gap)

### 2. Hide and unhide a game
expected: A hidden game leaves the grid, reappears when 'show hidden' is on, and unhiding returns it to the normal grid.
result: pass

### 3. Favourite and unfavourite
expected: Favouriting adds the game to the favourites view and unfavouriting removes it, with no reload.
result: pass

### 4. Categories
expected: Add, rename, assign a game, filter by it, and remove a category; the grid and sidebar update each time.
result: pass

### 5. Game page and modals
expected: The game page opens; the settings, logs and categories modals open and close without stale content.
result: pass

### 6. Downloads progress
expected: Installing a game shows progress in the Downloads queue and in the header indicator.
result: pass

### 7. D-15 completed downloads survive a tab switch
expected: Completed downloads remain listed after switching to another tab and back.
result: pass

### 8. D-15 completed downloads survive a restart
expected: Completed downloads are still listed after quitting and relaunching the app.
result: pass

### 9. D-15 Clear empties the list
expected: Clear empties the finished list and it stays empty after a tab switch.
result: pass

### 10. Sign out and in: Epic
expected: After sign out then sign in, the library and sign-in notice update without a relaunch.
result: pass

### 11. Sign out and in: GOG
expected: After sign out then sign in, the library and sign-in notice update without a relaunch.
result: pass

### 12. Sign out and in: Amazon
expected: After sign out then sign in, the library and sign-in notice update without a relaunch.
result: pass

### 13. Sign out and in: Steam
expected: After sign out then sign in, the library and sign-in notice update without a relaunch.
result: pass

### 14. Sign out and in: Humble
expected: After sign out then sign in, the library and sign-in notice update without a relaunch.
result: pass

### 15. ConsoleMode
expected: Gamepad focus moves across rows and launching a game shows the overlay.
result: pass

### 16. Settings survive relaunch
expected: Theme, zoom and both fonts changed in Settings are unchanged after a relaunch.
result: pass

### 17. Generic dialogs
expected: Opening a dialog and queuing a second works; they close in order.
result: pass

### 18. External link confirmation
expected: Clicking an external link shows the external-link confirmation dialog before opening.
result: pass

### 19. Redeem Steam key dialog
expected: The redeem-Steam-key dialog opens from the Stores panel and closes.
result: pass

### 20. Frameless titlebar ON
expected: GameLib window controls shown (non-darwin) or traffic-light inset correct (darwin); store embed positioned correctly.
result: pass

### 21. Frameless titlebar OFF
expected: Native frame, no duplicate controls, store embed not overlapping the controls row.
result: pass

## Summary

total: 21
passed: 21
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

none. Operator reply: "1. not this test, but left panel calls 'catagories' collections... menu calls it categories - inconsistant naming. approved". The naming note is pre-existing and out of Phase 69 scope; filed as .planning/todos/pending/2026-11-10-collections-vs-categories-naming-inconsistent.md.
