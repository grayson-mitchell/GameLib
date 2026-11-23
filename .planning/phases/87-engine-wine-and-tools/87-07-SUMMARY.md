---
phase: 87-engine-wine-and-tools
plan: 07
subsystem: testing
tags: [oracle, golden, jest, wine-manager, github-releases, sha512, spawn-trace, fake-home, gamelib-wine]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the oracle harness, HTTP recorder, spawn tracer, tree snapshot and redaction scan (87-05), and the gamelib-wine fixtures tree (87-02)
provides:
  - the wine-manager oracle test and 19 committed goldens (4 refresh, 12 install, 3 remove) under gamelib-wine/tests/fixtures/{golden,recorded}/wine_manager
  - the seven GitHub release feeds recorded live once, with the request headers (GameLib User-Agent) the Rust Replay pins
  - two recorded TS quirks the 87-19 port must decide on as D-19 deltas
affects: [87-19, the Rust gamelib-wine wine-manager slice, every later Phase 87 golden plan]

actuals:
  tokens: 78622
  tasks: 2
  commits: 2

plan_head_before: 8e108a79ba3f28c4425f8f2636fbb027939c0cc3
plan_head_after: 7e19f9753f4eedca24eef543bc4bf63bc51091fa

tech-stack:
  added: []
  patterns:
    - "wine-manager cases run through the handlers the sidecar registers (registerWineToolsFlows over a minimal deps), so notifications and the event order are recorded, not reconstructed"
    - "the multi-connection downloader (EasyDl) is replaced at the downloadFile seam by a stand-in that makes the same HEAD and one GET through the recorder, so a replay has exchanges for the archive"
    - "progress is D-10: a run of identical progressOfWineManager statuses collapses to one event, so the golden pins the sequence and not the count"
    - "a store file that holds absolute installDir paths is hashed over its normalised text in tree.json"

key-files:
  created:
    - src/backend/wine/__tests__/oracle/wineManager.oracle.test.ts
    - src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager/ (MANIFEST.json, cases.json, expected/ for 19 cases)
    - src-tauri/crates/gamelib-wine/tests/fixtures/recorded/wine_manager/ (19 cases)
  modified:
    - src/backend/__tests__/engineWineFixtureRedaction.test.ts

key-decisions:
  - "Refresh and install cases use per_page=3 (the count argument) for the live feeds, not the handler's 50: the seven live bodies at 50 would be over a megabyte of release notes; the Rust replay takes count as a parameter"
  - "Install and remove run through the registered handlers; refresh calls updateWineVersionInfos directly because the handler cannot pick repositories and only wraps it in a try/catch"
  - "du is scripted (it measures the machine's block size); tar runs for real against the 200-byte ArchiveWithSubfolder.tar.xz used in 87-05, so no archive in the fixtures is a download"
  - "Seeds and starting stores live in cases.json (`seed`, `store`), as in 87-05, so no separate fixtures/state/wine_manager tree was created"

patterns-established:
  - "An oracle case that needs a non-throwing runner failure scripts the exit code; one that needs the runner to reject wraps the tracer runner and the call is then absent from spawns.json (documented in the case note)"

requirements-completed: [SVC-02]

duration: 36 min
completed: 2026-11-23
status: complete

coverage:
  - id: D1
    description: "The seven GitHub release feeds, a merge against a stored list, offline keeps the cache, and a local-only read, with the store bytes, wineVersionsUpdated, requests and recorded headers"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/wine/__tests__/oracle/wineManager.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Install with the sha512 checksum present, mismatched and absent; overwrite, abort, skip, download failures, proton-to-steam; remove by the stored installDir, a missing dir and a version not in the store"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/wine/__tests__/oracle/wineManager.oracle.test.ts"
        status: pass
    human_judgment: false
---

# Phase 87 Plan 07: Wine-manager goldens Summary

**The wine manager's TS behaviour is pinned by 19 committed goldens (seven live GitHub feeds, store bytes, event sequence, notifications, requests with the GameLib User-Agent, spawn traces and trees) before any Rust for it exists.**

## Performance

- **Duration:** 36 min (2026-11-23T01:05Z to 01:41Z)
- **Tasks:** 2 of 2
- **Files:** 2 test files, 143 fixture files

## Accomplishments

- `wineManager.oracle.test.ts` drives the real `registerWineToolsFlows` handlers (`installWineVersion`, `removeWineVersion`) and `updateWineVersionInfos` over a fake HOME, a real wine-manager store on a test store root, the 87-05 recorder, spawn tracer and tree snapshot. Every case records result, events, requests, spawns and tree; `process.arch` is pinned to x64 (GE-Proton picks its asset by it) and the clock is pinned for installs.
- Refresh (Task 1, the tracer): `refresh-all-seven-feeds` was recorded live once from all seven `api.github.com` feeds (`?per_page=3`); `refresh-merge-existing` (synthetic GE and CachyOS feeds against a stored list: the dropped `Proton-` prefix still matches, an installed release the feed dropped is kept, `-latest` is added, the list is date-sorted); `refresh-offline-keeps-cache` (the three default mac feeds fail at the transport, the stored list is kept whole); `refresh-local-only`.
- Install and remove (Task 2): checksum match, mismatch and absent (Wine-Staging-macOS); overwrite; unzip-rejects; tar non-zero; abort; abort during an update; already installed (skip); HTTP 500; HEAD fails; proton-to-steam; remove by the stored `installDir` while the renderer sends another (the other directory survives), remove of a missing dir, remove of a version not in the store.
- `MANIFEST.json` is `{count: 19, floor: 19}`, asserted by `assertManifest` through `assertAtOrAboveFloor`. The redaction `FILE_FLOOR` went 67 to 210 (the files this plan commits); the scan passes over the live GitHub bodies.

## Task Commits

1. **Task 1 (tracer): the refresh goldens end to end** - `352f6b420` (test)
2. **Task 2: install, overwrite, abort and remove goldens** - `7e19f9753` (test)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only, so it was run end to end before the commit and again with Task 2's superset (21 of 21 offline, three runs, stable). Tracer verified end-to-end, expansion followed.

## Verification

- `GAMELIB_WRITE_ENGINE_GOLDEN= GAMELIB_ENGINE_ORACLE= pnpm exec jest --runTestsByPath` over the oracle, `engineWineFixtureRedaction.test.ts` and `fakeHomeIsolation.test.ts`: 3 suites, 38 tests passed, offline.
- Acceptance: the recorded refresh case holds exchanges for all seven feed URLs (7 distinct); MANIFEST count 19 (>= 10); the remove case removes only the stored `installDir` (`<HOME>/precious/keep-me` survives, the stored tree is gone).
- `npx prettier --check` over both `.ts` files: clean (the fixtures are prettier-ignored from 87-05). `npx eslint` over the oracle: clean. `npx tsc --noEmit -p tsconfig.json`: clean.
- Non-vacuity by mutation: editing a notification key in a committed golden failed `install-checksum-match` (and was restored). Reproducibility: the compare run was repeated three times and stayed green.

## Findings the port must decide on (D-19 deltas, recorded as goldens, not fixed)

1. **Restore on unzip failure never restores.** `installVersion`'s unzip `.catch` tests `error.includes('AbortError')` on an `Error` object; `.includes` does not exist, so a `TypeError` is thrown before the backup is renamed back. `install-overwrite-unzip-throws` records the old tree left as `<dir>_backup`, the archive left behind and a half-made install directory.
2. **Abort during an update deletes the existing install.** The abort handler removes `installSubDir`, which on an update is the previous install, while the store keeps `isInstalled: true` (`install-overwrite-aborted`).
3. **A failing tar is a success.** `extractFiles` returns `{status: 'error'}` instead of throwing, so `install-tar-nonzero-swallowed` ends with an empty install directory and the finished notification.
4. The checksum asset is fetched even when the install is then skipped as already installed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Store file hash depended on the temp directory**
- **Found during:** Task 1 (compare run after the first write)
- **Issue:** the stored `installDir` is an absolute path, so `tree.json`'s sha256 of `wine-downloader-info.json` changed with every profile, though `result.json` (normalised) matched.
- **Fix:** `treeOf` hashes that one file over its normalised text; every other entry is unchanged.
- **Files modified:** `src/backend/wine/__tests__/oracle/wineManager.oracle.test.ts`
- **Commit:** `352f6b420`

### Plan interpretation (not defects)

- **No `fixtures/state/wine_manager` tree.** The plan lists one; as in 87-05, a case's starting state is `seed` and `store` in the hand-authored `cases.json`.
- **The download is a stand-in at `downloadFile`.** `stubDownloadFile` from 87-05 was not used: the stand-in instead makes the HEAD and one GET through the recorder so the archive is a recorded exchange the Rust Replay can serve (HEAD plus one GET, where a real download is HEAD plus ranged GETs).
- **Refresh feeds are `per_page=3`, not 50** (see key decisions). The offline and local cases still record the default `per_page=50` request URLs.
- **Task 2 grew to 15 cases and Task 1 to 4** (19 against the plan's minimum of 10), adding the quirk cases above and proton-to-steam.
- **A "restore on failure" case needed a throwing runner.** A scripted exit code cannot reproduce it, so the tar spawn rejects in a wrapper and is absent from `spawns.json` (noted in the case).

**Total deviations:** 1 auto-fixed (Rule 1). **Impact:** none on scope.

## Issues Encountered

- `pnpm find-deadcode` still reports only the 87-05 finding (`portSliceGate.ts` `manifest`), already in `deferred-items.md`; nothing new from this plan.

## Known Stubs

None.

## Threat Flags

None. Record mode reaches only the seven `api.github.com` feed URLs through `allowLive`, which was in the plan's trust boundaries; archive bodies are the 200-byte in-repo archive.

## Next Phase Readiness

87-19 ports the wine manager against these goldens; the four findings above are its D-19 delta decisions. `golden/wine_manager/deltas.json` was not created: no Rust-side difference exists yet to record.

## Self-Check: PASSED

The oracle test, `cases.json`, `MANIFEST.json` and the 19 golden and recorded case directories exist on disk; commits `352f6b420` and `7e19f9753` are ancestors of HEAD; acceptance criteria and plan-level verification re-run green.
