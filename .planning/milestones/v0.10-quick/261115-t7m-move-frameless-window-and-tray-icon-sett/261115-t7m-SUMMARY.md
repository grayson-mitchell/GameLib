---
audit_acknowledged:
  milestone: v0.10
  at: 2026-11-20
  status: unknown
---

# Quick 261115-t7m Summary

Moved "Use frameless window" and "Tray Icon" from Settings > General to Appearance (/accessibility), rendered bare after the Zoom slider and before Fonts. Pure relocation; component files, i18n and backend untouched.

## Task 1 (done)
Files: Accessibility/index.tsx, GeneralSettings/index.tsx, Accessibility/__tests__/windowSettingsPlacement.test.ts (new). TDD: RED confirmed (3 of 4 failed), then GREEN.
Verify: jest (5 suites, 20 tests), tsc, eslint (0 errors; 3 pre-existing warnings), scoped prettier all pass.

## Task 2 (PENDING human verification)
Restart with `pnpm tauri:dev`. On macOS:
1. Settings > General lists neither setting.
2. Appearance shows "Use frameless window" below Zoom, above Fonts, no doubled label/spacing; no Tray Icon on macOS.
3. Frameless OFF -> ON live; check traffic-light inset and no 28px-high embed.
4. ON -> OFF live; re-check same.
5. Restart; state persists.
6. Optional Windows/Linux: Tray Icon select on Appearance swaps glyph immediately.

## Deviations
None.
