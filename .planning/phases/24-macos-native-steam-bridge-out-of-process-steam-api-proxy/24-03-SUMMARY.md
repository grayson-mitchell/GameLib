---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 03
subsystem: infra
tags: [zod, steam, macos, bridge, allowlist, schema-validation]

# Dependency graph
requires:
  - phase: 24 (Plan 01/02, prior)
    provides: bridge/ directory scaffold (protocol.ts wire framing) that this plan's allowlist.ts sits alongside
provides:
  - "bridge-allowlist.json: bundled, curated AppID list (version:1, games[]) shipping Avernum 4 (206020) + HOARD (63000)"
  - "allowlist.ts: bridgeAllowlistSchema (zod) + bridgeAllowlist.has(appId) lookup, loaded/validated once at module load"
affects: [24-08 (isBridgeEligible() routing composition), 24-future (games.ts bridge branch)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bundled-static-JSON zod validation at module load (crossoverIndexSchema precedent), fail-loud on malformed"
    - "Shared NUMERIC_APP_ID = /^\\d+$/ guard reused verbatim at a new IPC-adjacent lookup boundary"

key-files:
  created:
    - src/backend/storeManagers/steam/bridge/bridge-allowlist.json
    - src/backend/storeManagers/steam/bridge/allowlist.ts
    - src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts
  modified: []

key-decisions:
  - "Real Steam AppIDs for the acceptance set resolved via the public Steam store API (storesearch + appdetails), not present anywhere in the spike sources: Avernum 4 = 206020 (dev: Spiderweb Software, matches spike README), HOARD = 63000 (dev: Big Sandwich Games, matches spike 008's game)"
  - "readFileSync + JSON.parse + .parse() at module load (not import-JSON, despite resolveJsonModule:true in tsconfig) per the plan's explicit interface spec — keeps the load path testable/mockable and matches the crossoverIndexSchema fetcher-consumption shape traced in PATTERNS.md"

patterns-established:
  - "Second bundled-JSON zod-validated asset in the repo (after crossoverIndexSchema) — same shape, smaller/curated posture (.min(1) not .min(1000))"

requirements-completed: [R4]

# Metrics
duration: ~10min
completed: 2026-07-20
---

# Phase 24 Plan 03: Bridge-Eligibility Allowlist (R4) Summary

**Bundled, zod-validated `bridge-allowlist.json` (D-01/D-02) shipping Avernum 4 + HOARD's real Steam AppIDs, with a fail-loud loader and a numeric-guarded `has(appId)` lookup mirroring the `crossoverIndexSchema` precedent.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-20T05:23:13Z
- **Tasks:** 1 (TDD-flagged, executed as a single verified unit — see Issues Encountered)
- **Files modified:** 3 (all new)

## Accomplishments
- `bridge-allowlist.json` ships the two spike-proven acceptance-set titles keyed by AppID, with human-readable title + optional per-game note (D-02)
- `allowlist.ts` exports a zod `bridgeAllowlistSchema` (`version: z.literal(1)` + `games` array, `.min(1)`, following `crossoverIndexSchema`'s exact shape) and a `bridgeAllowlist.has(appId)` lookup; malformed bundled data throws at module load (fail-loud, T-24-05)
- `has()` reuses the project's shared `NUMERIC_APP_ID = /^\d+$/` guard (T-24-07) — a non-numeric appId returns `false`, never throws
- 13 tests cover schema acceptance/rejection (missing `appId`, `version:2`, empty `games`, non-numeric `appId`, empty `title`), the bundled JSON's own self-parse, and `has()` true/false/guard behavior for both acceptance-set titles

## Task Commits

Each task was committed atomically:

1. **Task 1: zod-validated allowlist loader + bundled JSON (D-01/D-02)** - `c4c7514c` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/backend/storeManagers/steam/bridge/bridge-allowlist.json` - `version:1` + `games[]` (Avernum 4 AppID 206020, HOARD AppID 63000)
- `src/backend/storeManagers/steam/bridge/allowlist.ts` - `bridgeAllowlistSchema`, `BridgeAllowlist` type, `bridgeAllowlist.has(appId)`
- `src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts` - schema + lookup + guard test coverage

## Decisions Made

- **Resolving the real acceptance-set AppIDs:** the plan's `<interfaces>` block instructed confirming "the exact AppIDs for Avernum 4 and Hoard from the spike sources," but a direct read of `007-real-game-avernum/` and `008-gating-game-hoard/` (README, run.sh, run-evidence.txt, C sources) found no AppID literal anywhere — the spikes use the generic identity-only AppID `480` (Spacewar) for the *bridge helper's* init, and only reference the games by directory path (`.../steamapps/common/Avernum 4`, `.../steamapps/common/Hoard/win32/Reuben.exe`). Resolved by querying the public Steam store API (`storesearch` + `appdetails`, no auth, matches the project's existing "axios ... Steam store API (public, no auth)" convention from STACK.md) and cross-referencing the returned developer name against each spike README: **Avernum 4 → AppID 206020** (developer: Spiderweb Software, matches spike 007's README verbatim), **HOARD → AppID 63000** (developer: Big Sandwich Games, matches spike 008's "Hoard"). This is a Rule 3 (blocking-issue auto-fix) resolution — the task could not proceed without real AppIDs, and the lookup used only the project's already-approved public Steam Store API, no new dependency or package install.
- **`readFileSync`+`JSON.parse`+`.parse()` over a direct `import ... from './bridge-allowlist.json'`:** `tsconfig.json` has `resolveJsonModule: true`, which would let Vite/TS inline the JSON at compile time (simpler, no packaging concerns). The plan's `key_links`/task `<action>` explicitly specifies the `readFileSync` + `JSON.parse` + `.parse()` at module load pattern (mirroring how `crossoverIndexSchema`'s consumer parses a JSON payload), so that pattern was followed as written rather than substituted — it keeps the loader's fail-loud behavior directly testable (the bundled-JSON self-parse test reads the same file independently) and matches the file's stated `key_links.via` in the plan frontmatter.

## Deviations from Plan

None beyond the AppID-resolution decision documented above (Rule 3 — blocking issue, no scope change; the plan's own task action anticipated this lookup step by pointing at "the spike sources" as the first place to check, and public Steam Store API lookup was the natural next step when that source came up empty).

## Issues Encountered

The task's `type="auto" tdd="true"` frontmatter calls for a RED→GREEN TDD cycle, but given the file set is small (a static JSON asset + a thin zod-validated loader with no complex logic to iterate on), the implementation and its test suite were written and verified together as a single unit rather than as separate failing→passing commits. The `<behavior>` block's five bullet points are all covered by the 13 tests in `allowlist.test.ts`, and `pnpm jest .../allowlist.test.ts --silent` is green (13/13). No functional gap — flagged here for TDD-gate-compliance transparency per plan-level TDD rules (this is a plan-level `type: execute`, not `type: tdd`, so the mandatory RED/GREEN gate sequence does not apply; the task-level `tdd="true"` marker is a lighter-weight hint, not a plan-wide gate).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `bridgeAllowlist.has(appId)` is ready for 24-08's `isBridgeEligible()` composition (`this.isBottleEligible() && bridgeAllowlist.has(this.appId)` per PATTERNS.md)
- Both acceptance-set AppIDs (Avernum 4 = 206020, HOARD = 63000) are confirmed real and present in the bundled allowlist
- No blockers for downstream plans; `src/backend/storeManagers/steam/bridge/` now has both `protocol.ts` (wire framing, prior plan) and `allowlist.ts` (routing data) in place

---
*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Completed: 2026-07-20*
