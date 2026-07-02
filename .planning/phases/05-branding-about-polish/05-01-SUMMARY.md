---
phase: 05-branding-about-polish
plan: "01"
subsystem: backend
tags: [branding, changelog, tray, discord, tdd]
dependency_graph:
  requires: []
  provides:
    - bundled GameLib 1.0.0 release notes (public/changelog.json)
    - getCurrentChangelog local-file read (no GitHub API)
    - getLatestReleases suppression (returns [])
    - GameLib tray tooltip (D-11)
    - GameLib Discord Rich Presence (D-06)
    - rebranded utils.ts user-facing strings (D-05)
  affects:
    - src/backend/utils.ts
    - src/backend/tray_icon/tray_icon.ts
    - src/backend/storeManagers/gog/presence.ts
tech_stack:
  added: []
  patterns:
    - TDD red/green cycles for all 3 tasks
    - jest.mock('graceful-fs', factory) for cross-module readFileSync interception
    - jest.mock via factory with jest.requireActual spread to mock only readFileSync
    - as unknown as { tooltip: string } cast for accessing mock Tray property not on Electron type
key_files:
  created:
    - public/changelog.json
  modified:
    - src/backend/utils.ts
    - src/backend/__tests__/utils.test.ts
    - src/backend/tray_icon/tray_icon.ts
    - src/backend/tray_icon/__tests__/tray_icon.test.ts
    - src/backend/storeManagers/gog/presence.ts
decisions:
  - getCurrentChangelog rewrites GitHub tags API call to readFileSync(join(publicDir, changelog.json)) — eliminates 404 at version 1.0.0
  - getLatestReleases suppressed at function level not IPC handler per pitfall 5 in RESEARCH
  - jest.mock factory with jest.requireActual spread chosen over jest.spyOn because readFileSync property is non-configurable on the graceful-fs module
  - Tooltip test casts to unknown then typed object rather than Electron.CrossProcessExports.Tray because tooltip is not on real Tray type (only setToolTip method exists)
metrics:
  duration: "22 min"
  completed: "2026-07-02T09:37:41Z"
  tasks: 3
  files: 5
---

# Phase 05 Plan 01: Backend Utils Rebrand + Bundled Changelog Summary

**One-liner:** Local `changelog.json` replaces GitHub API, `getLatestReleases` suppressed, tray tooltip and Discord presence read GameLib — all 3 tasks delivered as TDD red/green cycles with 6 commits.

## What Was Built

### Task 1: Bundled changelog + getCurrentChangelog rewrite (D-01/D-02/D-03)

**public/changelog.json** — New file satisfying all 8 required `Release` type fields:
- `name`: "GameLib 1.0.0", `tag_name`: "gamelib-v1.0.0"
- `body`: 5-bullet markdown covering Steam support, CrossOver/Proton integration, Heroic→GameLib rebrand
- Upstream link in body: "Built on Heroic 2.22.0 — see upstream release notes" → `releases/tag/v2.22.0`
- All required fields: `id=1`, `type="stable"`, `prerelease=false`, `published_at="2026-06-30T00:00:00Z"`, `html_url`, `body`

**getCurrentChangelog rewrite** — Replaced `axiosClient.get(GITHUB_API/tags/v${current})` with:
```typescript
const content = readFileSync(join(publicDir, 'changelog.json'), 'utf-8')
return JSON.parse(content) as Release
```
No new imports needed (`readFileSync`, `publicDir`, `join`, `logError`, `LogPrefix` all pre-imported). E2e guard preserved. Error logged as "Error reading local GameLib changelog:".

**Tests added** to utils.test.ts via `jest.mock('graceful-fs', factory)` pattern:
- "returns null in e2e CI mode" — e2e guard regression test
- "reads Release from local bundled file (not GitHub API)" — mocks readFileSync; was RED with current impl (GitHub 404)
- "returns null on file read failure" — mocks readFileSync to throw

### Task 2: Suppress getLatestReleases (D-04) + rebrand utils.ts strings (D-05/D-06)

**getLatestReleases suppression** — Replaced the 44-line function body with:
```typescript
// Suppressed: GameLib at 1.0.0 vs Heroic 2.22+ always triggers update notice
// pointing at Heroic downloads. Re-enable when GameLib release pipeline ships.
return []
```
Eliminates sidebar "Update Available!" block and "A new Heroic version was released!" notification.

**D-05 string rebrands in utils.ts** (3 locations):
- Epic offline notification body: "Heroic will maybe not work probably!" → "GameLib..."
- Rosetta dialog: "Heroic requires Rosetta...restart Heroic." → "GameLib...restart GameLib."
- writeConfig log: `appName==='default' ? 'Heroic'` → `'GameLib'`

**D-06 Discord Rich Presence strings in utils.ts** (2 locations):
- `versionText`: `` `Heroic ${app.getVersion()}` `` → `` `GameLib ${app.getVersion()}` ``
- `state`: `'via Heroic on '` → `'via GameLib on '`

**Test replacements**: Removed 4 old inline-snapshot tests for getLatestReleases (asserted live GitHub fetch) and replaced with 1 test asserting `result.toEqual([])`. Removed now-unused imports: `axiosClient`, `app`, `logError`, `test_data`. The new test confirmed RED with live network (GitHub API returned real Heroic v2.20+ releases, which are newer than 1.0.0, so old impl returned non-empty array).

### Task 3: Tray tooltip (D-11) + Discord presence (D-06 in presence.ts)

**tray_icon.ts** — Single string change: `setToolTip('Heroic')` → `setToolTip('GameLib')`.

**presence.ts** — Single string change: `application_type: 'Heroic Games Launcher'` → `application_type: 'GameLib'`.

**Tooltip test added** to tray_icon.test.ts:
- Sets `noTrayIcon=false` and `setRecentGames([])` (needed because configStore.get is reset between tests and loadContextMenu calls getRecentGames with `{limited: true}`)
- Casts result to `unknown as { tooltip: string }` because `tooltip` is not on the real `Electron.CrossProcessExports.Tray` type (only `setToolTip()` method exists; mock stores it in `.tooltip`)
- Asserts `appIcon.tooltip === 'GameLib'`

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `99ee1253` | test | add failing tests for getCurrentChangelog local-file behavior (RED) |
| `bf56c85f` | feat | bundled changelog.json + getCurrentChangelog local-file read (D-01/D-02/D-03) (GREEN) |
| `6f6c1331` | test | replace getLatestReleases tests for suppressed behavior (D-04) (RED) |
| `054f9740` | feat | suppress getLatestReleases + rebrand utils.ts strings (D-04/D-05/D-06) (GREEN) |
| `2c1db3b5` | test | add failing test for GameLib tray tooltip (D-11) (RED) |
| `43227579` | feat | tray tooltip GameLib (D-11) + Discord presence rebrand (D-06) + tooltip test (GREEN) |

## Verification Results

- `pnpm test --testPathPattern="utils|tray_icon"`: 66 tests pass (12 suites)
- `pnpm codecheck` (tsc --noEmit): exits 0 — clean
- `public/changelog.json`: all 8 Release fields satisfied; upstream v2.22.0 link present; `name` = "GameLib 1.0.0"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] jest.spyOn failed on graceful-fs readFileSync**
- **Found during:** Task 1 RED phase first attempt
- **Issue:** `TypeError: Cannot redefine property: readFileSync` — graceful-fs exports readFileSync as a non-configurable property; `jest.spyOn()` cannot spy on it
- **Fix:** Switched to `jest.mock('graceful-fs', () => ({ ...jest.requireActual('graceful-fs'), readFileSync: jest.fn() }))` factory pattern — creates a controllable jest.fn() replacement
- **Files modified:** `src/backend/__tests__/utils.test.ts`
- **Commit:** `99ee1253` (RED), `bf56c85f` (GREEN)

**2. [Rule 1 - Bug] Tray tooltip test failed with wrong error (setRecentGames not set up)**
- **Found during:** Task 3 RED phase first attempt
- **Issue:** Test failed with `TypeError: Cannot read properties of undefined (reading 'slice')` instead of the expected tooltip mismatch; `loadContextMenu` calls `getRecentGames({ limited: true })` which reads `configStore.get('games.recent', [])` — after `resetMocks: true` resets the previous test's `afterEach` mock, `configStore.get` returns undefined
- **Fix:** Added `setRecentGames([])` before `initTrayIcon` call to set up the mock properly
- **Files modified:** `src/backend/tray_icon/__tests__/tray_icon.test.ts`
- **Commit:** `2c1db3b5`

**3. [Rule 1 - Bug] TypeScript error: `tooltip` not on `Electron.CrossProcessExports.Tray` type**
- **Found during:** Task 3 GREEN codecheck
- **Issue:** PATTERNS.md showed `as Electron.CrossProcessExports.Tray` cast for tooltip access, but `tooltip` is only on the mock Tray (the real Electron type only has `setToolTip()` method, not a readable `tooltip` property)
- **Fix:** Changed cast to `as unknown as { tooltip: string }` — expresses intent clearly without widening to `any`
- **Files modified:** `src/backend/tray_icon/__tests__/tray_icon.test.ts`
- **Commit:** `43227579`

## Self-Check: PASSED

- `public/changelog.json` exists and is valid: FOUND
- Commit `99ee1253` exists: FOUND
- Commit `bf56c85f` exists: FOUND
- Commit `6f6c1331` exists: FOUND
- Commit `054f9740` exists: FOUND
- Commit `2c1db3b5` exists: FOUND
- Commit `43227579` exists: FOUND
- `tsc --noEmit` exits 0: CONFIRMED
- 66 tests pass: CONFIRMED
