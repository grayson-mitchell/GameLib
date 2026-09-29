---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-09-29T06:01:11.010Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | quick-260929-okd | deviation | meta/i18nForkTouchedFiles.json |  | A-17 ANTI-ROT test fails: the committed snapshot (215 entries) is MISSING 9 src/frontend files that the live git derivation finds. jest reports `- Expected - 9 / + Received + 0`, and all 9 return 0 hits when grepped against the committed JSON, so the drift is NOT 'extra files in the snapshot' -- it is the other direction. Pre-existing and unrelated to this plan's backend-only changes: the snapshot was last refreshed 2026-09-21 (c20a46bbb) while every drifting file was last modified 2026-09-23..2026-09-26, so it went stale days before this task; and none of the four branch merges made earlier the same day touched src/frontend. Fix is to regenerate the snapshot and re-derive its count pins, as quick task 260921-saw did. | open |  | 2026-09-29T06:01:11.010Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "quick-260929-okd",
    "file": "meta/i18nForkTouchedFiles.json",
    "line": null,
    "description": "A-17 ANTI-ROT test fails: the committed snapshot (215 entries) is MISSING 9 src/frontend files that the live git derivation finds. jest reports `- Expected - 9 / + Received + 0`, and all 9 return 0 hits when grepped against the committed JSON, so the drift is NOT 'extra files in the snapshot' -- it is the other direction. Pre-existing and unrelated to this plan's backend-only changes: the snapshot was last refreshed 2026-09-21 (c20a46bbb) while every drifting file was last modified 2026-09-23..2026-09-26, so it went stale days before this task; and none of the four branch merges made earlier the same day touched src/frontend. Fix is to regenerate the snapshot and re-derive its count pins, as quick task 260921-saw did.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-29T06:01:11.010Z",
    "resolved_at": null,
    "milestone": "v0.8"
  }
]
````
