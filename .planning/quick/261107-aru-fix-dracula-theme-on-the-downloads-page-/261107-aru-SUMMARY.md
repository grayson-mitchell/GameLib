---
phase: quick-261107-aru
plan: 01
subsystem: frontend/themes, DownloadManager
tags: [css, themes, dracula, downloads]
requires: []
provides:
  - "base body --danger-hover default (var(--status-danger-hover))"
  - "body.dracula --danger-hover: #ff6e6e"
  - "source gate for --danger-hover theme coverage"
affects:
  - src/frontend/screens/DownloadManager
tech-stack:
  added: []
  patterns: ["var(--token, var(--status-*)) fallback for theme tokens not declared in every theme"]
key-files:
  created: []
  modified:
    - src/frontend/themes.scss
    - src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.css
    - src/frontend/screens/DownloadManager/components/DownloadHero/index.css
    - src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts
decisions:
  - "Base body --danger-hover defaults to var(--status-danger-hover), the same value cyberSpaceOasis uses; no base --danger added (out of scope)"
  - "Hover fallback is --status-danger-hover, not --danger, because base body declares no --danger"
metrics:
  completed: 2026-11-07
  tasks: 2
  files: 4
---

# Quick 261107-aru: Dracula Downloads cancel hover fix Summary

The Downloads cancel "x" hover read `var(--danger-hover)`, which only 3 of 10 themes declared, so the disc vanished on hover under Dracula and six other themes. Now there is a base `body` default (`var(--status-danger-hover)`), Dracula has its own bright red (`#ff6e6e`), both hover rules use `var(--danger-hover, var(--status-danger-hover))`, and a source-text gate guards it.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Source gate for --danger-hover coverage (RED) | 67771647b | downloadManagerLayout.test.ts |
| 2 | Declare --danger-hover for every theme, harden hover rules (GREEN) | 783a48dc1 | themes.scss, DownloadManagerItem/index.css, DownloadHero/index.css |

## Verification

- RED: 4 new cases failed for the expected reasons (base/dracula missing the declaration, bare `var(--danger-hover)` in both hover rules); all 20 existing cases and the 3 non-vacuity cases passed.
- GREEN: downloadManagerLayout + themeTokens + cssTokenSweep: 3 suites, 300/300 tests passed.
- `npx prettier --check` on the 4 touched paths: clean. `--file-info` confirmed none are ignored.
- `grep -c -- '--danger-hover' src/frontend/themes.scss` = 5. midnightMirage, cyberSpaceOasis and gruvbox_dark lines are unchanged.
- `graphify update .` ran.
- Live check (optional human-check) not performed: hover under Dracula in `pnpm tauri:dev`.

## Deviations from Plan

- Small one: I worded the base-block comment as "themes that set no hover-danger token" rather than naming `--danger-hover` literally, so the plan's grep count of 5 holds. No behavior change.

## TDD Gate Compliance

test(...) commit 67771647b precedes fix(...) commit 783a48dc1. (GREEN used `fix` rather than `feat` because it is a bug fix.)

## Self-Check: PASSED

- FOUND: all 4 modified files
- FOUND: 67771647b, 783a48dc1
