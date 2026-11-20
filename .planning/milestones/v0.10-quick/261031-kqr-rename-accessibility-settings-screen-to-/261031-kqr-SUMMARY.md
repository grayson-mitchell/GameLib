---
status: complete
task: 261031-kqr
---
# Quick 261031-kqr Summary

Renamed the user-visible Accessibility settings screen to "Appearance" (nav row, heading, help title/content, tour copy, English locale values; keys/route/classes unchanged) and removed the duplicate ThemeSelector from General settings.

Commits: 578e3a747 (rename), plus the ThemeSelector removal commit.

Deviation: prettier reflowed the help-content line in Accessibility/index.tsx (formatting only).

Verify: jest (33 suites, 699 tests) pass; prettier, eslint, tsc clean; ThemeSelector now rendered only in screens/Accessibility.
