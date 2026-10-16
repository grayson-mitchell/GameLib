---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
plan: 14
subsystem: infra
tags: [tauri, github-actions, auto-update, minisign, release-pipeline, gap-closure]

# Dependency graph
requires:
  - phase: 34 (plan 34-12)
    provides: post-GAP-1 release-tauri.yml (renderer/steam-bridge/crossover-index build steps ahead of tauri-action), read here to confirm releaseDraft:true/prerelease:true are still both present
provides:
  - "plugins.updater.endpoints[0] repointed to a fixed-tag asset URL (/releases/download/updater/latest.json) that a draft+prerelease-only pipeline can actually serve"
  - "a new release: published-triggered promote-updater-feed.yml workflow that copies latest.json to the updater tag byte-for-byte, with no signing key in scope"
  - "a 9-test cross-file regression describe block in tauriConf.test.ts guarding both the endpoint form and D-09's prerelease:true against reintroduction of GAP-3"
affects: ["34-07 live tag-push gate (prerequisite closed; one new post-publish check added to its resume procedure)", 34-15]

# Tech tracking
tech-stack:
  added: []
  patterns: ["derive the promotion-target tag from the endpoint URL via regex capture group rather than hardcoding it in the test, so the test proves the two files agree instead of both happening to say the same literal string"]

key-files:
  created:
    - .github/workflows/promote-updater-feed.yml
  modified:
    - src-tauri/tauri.conf.json
    - src/backend/__tests__/tauriConf.test.ts

key-decisions:
  - "Kept the fixed feed-holder tag literally 'updater' (not derived from package.json or the version) since it must never collide with a v* release tag and must stay stable release-over-release."
  - "Comment-stripped test 7's assertion (TAURI_SIGNING/jq/sed/redirect-into-latest.json) but left tests 4-6's literal string checks unstripped -- surfaced during Task 2 when the workflow's own header prose accidentally tripped test 6 (mentioning '--draft') and Task 2's own grep acceptance criterion (mentioning 'TAURI_SIGNING_PRIVATE_KEY'); reworded both comments to describe the same invariant without using the literal flag/token string, rather than loosening the tests."
  - "Left the promotion workflow's 'Ensure the feed-holder release exists' step idempotent (gh release view, only gh release create on failure) so re-publishing a v* tag after the updater release already exists is a no-op rather than an error."

patterns-established:
  - "A promotion/consumer workflow that must never hold a signing secret documents that constraint by explicitly stating what env vars it does NOT declare, rather than naming the secret string itself in a comment -- naming it trips the same grep-based regression tests meant to prevent its introduction."

requirements-completed: [REQ-34-05, REQ-34-06]

# Metrics
duration: 20min
completed: 2026-07-24
---

# Phase 34 Plan 14: Fix the dead auto-update feed (GAP-3) Summary

**Repointed `plugins.updater.endpoints[0]` from GitHub's non-prerelease-only `/releases/latest/download/` (a permanent 404 given D-09's locked `prerelease: true`) to a fixed-tag `/releases/download/updater/latest.json`, and added a `release: published`-triggered workflow that promotes each publish's manifest there without ever touching the minisign signing key.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-24T08:33:00Z (approx, session start)
- **Completed:** 2026-07-24T08:53:51Z
- **Tasks:** 2 completed
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `src-tauri/tauri.conf.json`'s updater endpoint no longer uses the `/releases/latest/download/` form that GitHub resolves only to non-prerelease, non-draft releases -- a form that could never work given D-09's locked `prerelease: true`.
- New `.github/workflows/promote-updater-feed.yml` copies `latest.json` byte-for-byte to a stable `updater` release tag only after a human publishes the draft release, preserving D-09's review gate while making the manifest's own inner installer URLs resolvable (they only become public once the source release is published).
- `tauriConf.test.ts` gained a 9-test regression `describe` block that failed 7/9 against the pre-fix config+workflow (RED, recorded below) and is now 21/21 green, including a dedicated D-09 guard (test 8) against a future "just drop prerelease: true" simplification.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the RED cross-file endpoint/flags compatibility tests** - `df893a8c` (test)
2. **Task 2: Repoint the feed at a fixed-tag asset and add the post-publish promotion workflow** - `42085324` (feat)

**Plan metadata:** (pending — see final commit below)

## RED Evidence (Task 1, captured verbatim)

`npx jest --testPathPattern=tauriConf` against the pre-fix config/workflow:

```
Test Suites: 1 failed, 1 total
Tests:       7 failed, 14 passed, 21 total
```

The 7 failing tests (all in the new `updater feed reachability given the release flags (CR-03 / GAP-3 regression guard)` describe block):
```
✕ test 1: if release-tauri.yml sets prerelease: true, the endpoint must not use /releases/latest/download/
✕ test 2: endpoints[0] is a fixed-tag asset URL a prerelease-only pipeline can serve
✕ test 3: a promotion workflow uploads latest.json to exactly the tag captured from the endpoint
✕ test 4: the promotion workflow triggers only on published releases
✕ test 5: the promotion workflow is guarded against re-triggering off the feed-holder release
✕ test 6: the feed-holder release stays a non-draft prerelease
✕ test 7 (signature-integrity guard): the promotion workflow never holds the signing key or rewrites the manifest
```
Tests 8 (D-09 guard) and 9 (pre-existing invariants) passed both before and after, as designed.

One-liner RED proof (test 1's exact stated reason), run against the pre-fix files:
```js
node -e "
const fs = require('fs');
const conf = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf-8'));
const workflow = fs.readFileSync('.github/workflows/release-tauri.yml','utf-8');
const endpoint = conf.plugins.updater.endpoints[0];
console.log(workflow.includes('prerelease: true') && endpoint.includes('/releases/latest/download/'));
"
```
printed `true`.

## GREEN Evidence (Task 2)

- `node -e "require('js-yaml').load(...)"` on `promote-updater-feed.yml` → `PARSE OK`
- `npx jest --testPathPattern=tauriConf` → `21 passed, 21 total` (12 pre-existing + 9 new)
- Cross-plan regression sweep `npx jest --testPathPattern="tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource|electronUntouched"` → `113 passed, 113 total`
- `grep -c "releases/download/updater/latest.json" src-tauri/tauri.conf.json` → `1`
- `grep -c "gh release upload updater" .github/workflows/promote-updater-feed.yml` → `1`
- `grep -c "releases/latest/download" src-tauri/tauri.conf.json` → `0`
- `grep -c "TAURI_SIGNING" .github/workflows/promote-updater-feed.yml` → `0`
- `grep -c -- "--draft" .github/workflows/promote-updater-feed.yml` → `0`
- `grep -c -- "--prerelease" .github/workflows/promote-updater-feed.yml` → `2` (the one `gh release create ... --prerelease` flag plus one explanatory comment mention)
- `grep -c "types: \[published\]" .github/workflows/promote-updater-feed.yml` → `2` (the trigger declaration plus one comment reference)
- `grep -c "Heroic" .github/workflows/promote-updater-feed.yml` → `0`
- `git diff .github/workflows/release-tauri.yml` → empty; `grep -c "prerelease: true" .github/workflows/release-tauri.yml` → `1` (D-09 untouched)
- `git diff --numstat src-tauri/tauri.conf.json` → `1  1` (exactly one changed line, the endpoint string)

## Files Created/Modified
- `.github/workflows/promote-updater-feed.yml` - New workflow: triggers on `release: types: [published]` only; downloads the published tag's `latest.json` (non-fatal if absent); logs its SHA-256; ensures the `updater` release exists as a published prerelease (never draft); uploads the manifest byte-for-byte via `gh release upload updater feed/latest.json --clobber`. Declares only `GH_TOKEN: ${{ github.token }}` -- no Apple/Windows/Tauri signing secrets anywhere in the file.
- `src-tauri/tauri.conf.json` - Changed exactly one string: `plugins.updater.endpoints[0]` from `.../releases/latest/download/latest.json` to `.../releases/download/updater/latest.json`. `pubkey`, `windows.installMode`, `bundle`, and `build` are byte-identical.
- `src/backend/__tests__/tauriConf.test.ts` - Added `RELEASE_WORKFLOW_PATH`/`PROMOTE_WORKFLOW_PATH` constants, a `stripComments()` helper, and a 9-test `describe` block asserting the endpoint form, the promotion workflow's existence/trigger/guard/prerelease-flag/signature-integrity properties, and the D-09 + pre-existing invariant guards. Insertions only (`git diff | grep -c '^-[^-]'` = 0).

## Decisions Made
- Derived the promotion-target tag from the endpoint URL via regex capture group in test 3, rather than hardcoding `updater`, so the test proves the two files agree with each other rather than both happening to say the same literal string.
- Kept the feed-holder tag literally `updater` -- stable across releases, and structurally distinct from any `v*` tag so it can never collide with or be mistaken for a real release.
- During Task 2's acceptance-criteria pass, the workflow's own explanatory comments initially tripped two of the *literal-string* assertions: mentioning `--draft` (in "never pass `--draft`") failed test 6's `not.toContain('--draft')`, and mentioning `TAURI_SIGNING_PRIVATE_KEY` (in "this workflow never sees TAURI_SIGNING_PRIVATE_KEY") failed Task 2's own `grep -c "TAURI_SIGNING"` acceptance criterion. Both comments were reworded to describe the same invariant without using the literal flag/secret-name string (e.g., "never mark the feed-holder release as a draft" / "declares no updater-signing secret anywhere above") rather than weakening either test -- this is the correct fix since test 7 (which needs to discuss `jq`/`sed`/`TAURI_SIGNING` in prose) is comment-stripped specifically to allow that discussion, while tests 4-6 are intentionally strict on the literal executable content.
- Made the "ensure feed-holder release exists" step idempotent (`gh release view` first, `gh release create` only on failure) so re-running the promotion workflow across multiple `v*` publishes never errors on an already-existing `updater` release.

## Deviations from Plan

None - plan executed exactly as written. The comment-wording adjustments above were corrections made *during* Task 2 execution to satisfy Task 2's own stated acceptance criteria (not a deviation from the plan's design) -- no additional scope, no architectural change, no rule-1/2/3/4 deviation triggered.

## Issues Encountered

None beyond the comment-wording self-corrections documented above, which were caught and fixed before the task commit (verification was re-run and passed clean afterward).

## User Setup Required

None - no external service configuration required. This plan modifies only a Tauri config file, a GitHub Actions workflow, and a test file; no secrets or dashboard configuration are introduced. (The `updater` feed-holder release itself will be created automatically by the new workflow's first run against a real publish event -- no manual pre-creation needed.)

## Next Phase Readiness

- GAP-3 (the dead update feed, 34-VERIFICATION.md failed truth #9 / 34-REVIEW.md CR-03) is closed in code and test-guarded. Both `missing:` items under that failed truth are now present: a stable non-`/latest/` asset location that a publish step updates, and a cross-file test asserting the endpoint form and the release prerelease flag are mutually compatible.
- **Follow-on note for whoever resumes 34-07's deferred live gate:** step 3 of that procedure ("Confirm the Release") now has an additional post-publish check -- after the human manually publishes the draft release, `https://github.com/grayson-mitchell/GameLib/releases/download/updater/latest.json` must return 200 with the just-published manifest (proving `promote-updater-feed.yml` actually ran and the endpoint resolves). This is a new verification step within 34-07's existing procedure, not a new plan -- no plan was created for it, per the plan's `<output>` instruction.
- 34-15 (parallel wave-2 sibling, GAP-4 Windows signing-secret gate) shares no `files_modified` with this plan and is unaffected by these changes.
- This plan remains a **prerequisite** to 34-07's live gate, not a replacement for it -- the promotion workflow is code-complete and unit-tested but, like the rest of this gap cycle's fixes, is `UNPROVEN LIVE` until that gate actually runs against a real `v*` tag push.

---
*Phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: .github/workflows/promote-updater-feed.yml
- FOUND: src-tauri/tauri.conf.json
- FOUND: src/backend/__tests__/tauriConf.test.ts
- FOUND: .planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/34-14-SUMMARY.md
- FOUND commit: df893a8c (Task 1)
- FOUND commit: 42085324 (Task 2)
