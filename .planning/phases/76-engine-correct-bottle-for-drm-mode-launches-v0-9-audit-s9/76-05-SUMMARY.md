---
phase: 76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
plan: 05
subsystem: steam-bridge-engine
tags: [uat, drm, engine-switch, crossover, live-verification]
requires: [76-03, 76-04]
provides:
  - live proof that a DRM launch switches a pinned-engine bottle to CrossOver
  - DEBT-01 complete
affects: [.planning/REQUIREMENTS.md]
key-files:
  modified:
    - .planning/phases/76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9/76-UAT.md
    - .planning/REQUIREMENTS.md
decisions:
  - "DEBT-01 flipped to complete: items 7 and 8 pass, item 6 passes"
metrics:
  completed: 2026-11-17
  tasks: 3
---

# Phase 76 Plan 05: Live gap re-test Summary

Live re-run of UAT items 6-8 on the 76-03/76-04 sidecar passed, so DEBT-01 is complete.

## Results

- Task 1 (sidecar rebuild, items 6-8 added as pending): done earlier, recorded in the UAT.
- Task 2 (operator run): done, no dialogs or toasts reported for items 6, 7, 8.
- Task 3: results recorded with log and bottle-file evidence; DEBT-01 flipped.

| Item | Time | Outcome |
| ---- | ---- | ------- |
| 6 heal mislabelled bottle | 06:48 | marker reconciled to pinned:wine-staging-11.20, switch pinned -> crossover, DXVK-macOS gone, marker crossover, game-process trace beyond init (events=41, rejected=0) |
| 7 creation records marker | 06:51 | `cx-missing` pinned creation, Wine-Staging 11.20 + DXVK-macOS 1.10.3, marker recorded at creation (kind pinned) |
| 8 fresh pinned -> crossover | 07:00 | switch pinned -> crossover, DRM launch on CrossOver 26.3.0.39832, DXVK gone, marker crossover, trace beyond init (events=41, rejected=0) |

76-UAT.md is now `status: complete` with 7 passed, 1 historical issue (item 3, the original gap), 0 pending. The item 3 entry in `## Gaps` is left untouched as the historical record that items 6-8 close. REQUIREMENTS.md DEBT-01 checkbox and traceability row are `[x]` / `Complete`.

Commit: 994b1d6f3 (76-UAT.md and REQUIREMENTS.md only).

## Deviations from Plan

None. The unchanged-Gaps rule was kept, so the item 3 gap entry still reads `status: failed` although it is now resolved by items 6-8.

## Observations (out of scope)

- Item 6 exit logged `overlay-exit-abnormal` (pushed=false); no toast shown. Not investigated here.
- Unrelated dirty and untracked `.planning` files were left unstaged.

## Self-Check: PASSED

Commit 994b1d6f3 exists; UAT and REQUIREMENTS edits verified in the diff.
