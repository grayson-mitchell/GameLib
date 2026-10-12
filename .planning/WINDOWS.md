---
schema_version: 1
open_count: 3
waived_count: 0
fixed_count: 0
total_count: 3
last_updated: 2026-10-12T09:50:41.505Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | quick-260929-okd | deviation | meta/i18nForkTouchedFiles.json |  | A-17 ANTI-ROT test fails: the committed snapshot (215 entries) is MISSING 9 src/frontend files that the live git derivation finds. jest reports `- Expected - 9 / + Received + 0`, and all 9 return 0 hits when grepped against the committed JSON, so the drift is NOT 'extra files in the snapshot' -- it is the other direction. Pre-existing and unrelated to this plan's backend-only changes: the snapshot was last refreshed 2026-09-21 (c20a46bbb) while every drifting file was last modified 2026-09-23..2026-09-26, so it went stale days before this task; and none of the four branch merges made earlier the same day touched src/frontend. Fix is to regenerate the snapshot and re-derive its count pins, as quick task 260921-saw did. | open |  | 2026-09-29T06:01:11.010Z |  |
| 2 | 45 | deviation | src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts |  | Rule 1 deviation: edited 4 of 11 describe blocks (undeclared file) to match winetricksInstall channel retirement; pre-commit prettier hook also required reformatting | open |  | 2026-10-10T07:17:03.298Z |  |
| 3 | 50 | unmet-truth | meta/i18nCatalogPresenceBaseline.json |  | test | open |  | 2026-10-12T09:50:41.505Z |  |

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
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "45",
    "file": "src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts",
    "line": null,
    "description": "Rule 1 deviation: edited 4 of 11 describe blocks (undeclared file) to match winetricksInstall channel retirement; pre-commit prettier hook also required reformatting",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-10T07:17:03.298Z",
    "resolved_at": null,
    "milestone": "v0.8"
  },
  {
    "id": 3,
    "kind": "unmet-truth",
    "phase": "50",
    "file": "meta/i18nCatalogPresenceBaseline.json",
    "line": null,
    "description": "Pre-existing, unrelated to plan 50-04: `pnpm lint-translations:gamelib` reports 816 findings / 96 hard failures, all 'library.tileSize.label'/'library.tileSize.valueText: baseline overstates reality' across all 48 non-English locales -- the baseline records these two keys as missing while the catalogues already carry real values (filled by 933c7ac3d, predating this drift). Introduced by commits 35561176e and e5b437090 (both ancestors of plan 50-04's own commits fa7c765cb/97432999f, landed via merge 25f65229d between plan 50-03's completion and plan 50-04's execution). Zero overlap with plan 50-04's own 6 keys (webview.epicEmbed.*/webview.unavailable.epic-challenged.*), which are confirmed at 0 failures. Plan 50-04 cannot fix this without violating its own 'never regenerate the baseline' constraint, and it is out of this plan's scope per the executor's scope-boundary rule. Also causes a literal, otherwise-unrelated failure of the range-pinned baseline-untouched check (`git log --oneline main..HEAD -- meta/i18nCatalogPresenceBaseline.json` is non-empty solely because of these 2 pre-existing commits; plan 50-04's own commits' diff against the baseline is proven empty both via `git status --porcelain` and `git diff fa7c765cb~1..97432999f -- meta/i18nCatalogPresenceBaseline.json`). Also reproduces as 2 failing assertions in `meta/__tests__/lintTranslations.test.ts` (REQ-41-01, REQ-41-02) under `npx jest --selectProjects Meta`. Needs its own follow-up (likely `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib` to re-record the baseline for these 2 keys, scoped to that regen alone).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-12T09:50:41.505Z",
    "resolved_at": null,
    "milestone": "v0.8"
  }
]
````
