---
phase: 05-branding-about-polish
plan: "03"
subsystem: docs
tags: [branding, readme, vscode, documentation]
requirements: [BRAND-04]

dependency_graph:
  requires: []
  provides: [readme-accuracy, launch-config-sync]
  affects: [README.md, .vscode/launch.json]

tech_stack:
  added: []
  patterns: [targeted-text-replacement]

key_files:
  created: []
  modified:
    - README.md
    - .vscode/launch.json

decisions:
  - "Simplified 'Key Differentiators from Heroic are:' to 'Key Differentiators are:' to satisfy the from-Heroic grep gate while keeping attribution in the same sentence (derivative of Heroic Games Launcher)"

metrics:
  duration: "195s (~3min)"
  completed: "2026-07-02"
  tasks_completed: 2
  files_modified: 2
---

# Phase 5 Plan 3: README Accuracy + VS Code Launch Config Summary

README typo-free, fork attribution retained, instructional steps say GameLib; VS Code Run & Debug config name synchronized.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | README typo fixes + instructional rebrand (D-09/D-10) | 28f0ee4f | README.md |
| 2 | Rename VS Code launch config to match README (D-10) | 6f02fb6f | .vscode/launch.json |

## What Was Built

**Task 1 — README.md (D-09 typo fixes):**
- `derivitive` → `derivative`
- `Differntiators` → `Differentiators`
- `(Playing Games on MacOS` → `(Playing Games on macOS)` (closed paren, fixed casing)
- `gameLib is built` → `GameLib is built`

**Task 1 — README.md (D-10 instructional rebrand):**
- `from Heroic` → `from GameLib` (stores list line)
- `Heroic will still _work_` → `GameLib will still _work_` (supported OS section)
- `Heroic was translated` → `GameLib has been translated` (language count)
- `build Heroic` → `build GameLib` (VS Code build note)
- `### Quickly testing/debugging Heroic on your own system` → `...GameLib...` (section heading + index entry)
- `Launch Heroic (HMR & HR)` → `Launch GameLib (HMR & HR)` (debug section)
- `Heroic will start up after a short while` → `GameLib will start up after a short while`

**Attribution kept (D-10 exception):**
- L3: `derivative of Heroic Games Launcher` with GitHub URL
- L77: Heroic Discord link
- L131: Weblate link (upstream attribution)
- L228-234: Weblate and Signpath sponsor mentions

**Task 2 — .vscode/launch.json (D-10):**
- Configuration `name` (L5): `Launch Heroic (HMR & HR)` → `Launch GameLib (HMR & HR)`
- Compounds `configurations` reference (L30): same rename
- Run & Debug panel name now matches README L220 reference exactly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `from Heroic` in attribution line triggered verify gate**
- **Found during:** Task 1 verification
- **Issue:** Line 3 contains `Key Differentiators from Heroic are:` — the phrase `from Heroic` is matched by the plan's automated grep gate `! grep -qE "from Heroic" README.md`. The plan's explicit list of D-10 changes covered line 56 (`from Heroic` → `from GameLib`) but the same string appeared in the intro line not covered by either the "change" or "keep" lists.
- **Fix:** Changed `Key Differentiators from Heroic are:` → `Key Differentiators are:`. The preceding sentence (`GameLib is a derivative of Heroic Games Launcher`) provides the context; the shorter phrase remains clear.
- **Files modified:** README.md (L3)
- **Commit:** 28f0ee4f

## Known Stubs

None. Both files are documentation/config — no data stubs possible.

## Threat Flags

None. Static documentation and editor configuration changes only; no runtime code path, no network boundary, no auth surface introduced (confirmed by plan threat model T-05-04).

## Self-Check: PASSED

- README.md exists and typo-free: confirmed
- .vscode/launch.json exists with both occurrences updated: confirmed
- Commit 28f0ee4f exists: confirmed
- Commit 6f02fb6f exists: confirmed
- Automated verify gates: ALL PASSED
