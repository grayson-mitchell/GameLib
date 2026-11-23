---
phase: 87-engine-wine-and-tools
plan: 14
subsystem: testing
tags: [oracle, golden, jest, fallback-engine, engine-state, notice-store, fnd-06, fake-home, gamelib-engine]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the oracle harness, spawn tracer, tree snapshot, download stub and redaction scan (87-05); a worked engine golden plan (87-13)
provides:
  - the fallback-engine oracle test and 39 goldens under gamelib-engine/tests/fixtures/golden/fallback (download ok, offline, size and sha256 mismatch, network failure, aborts at every phase, tar failure, a symlink escaping the root, stale directories, prune, the boot sweep, joined callers, the installed check)
  - three synthetic archives under recorded/fallback/archives (a tar.xz Wine tree, a tar.xz with an escaping symlink, a tar.gz DXVK tree)
  - the engine-state oracle test and 41 goldens under golden/state (trial notice at 8, 7 and 0 days and expired, untested-build notice and its dismissal capped at 50, the no-CrossOver note, the notice store bytes, launch decisions and the engineStateChanged sequence, the overlay, exit and deadline notices, the preflight cache, getGameEngineState)
affects: [87-15, the Rust fallback engine and engine state slices (87-47 to 87-49)]

actuals:
  tokens: 95362
  tasks: 2
  commits: 2

plan_head_before: 5bbf6f066c15335e46df78f6aa8081a8aa93707e
plan_head_after: 23a4daa770b17bcddac6f74deb56b4e6db8543cb

tech-stack:
  added: []
  patterns:
    - "the pinned engine table is overridden for the test only (jest.replaceProperty on ENGINE_PINS) with the real pin's ids, URLs and archive names and the size and sha256 of synthetic archives, so the real verify, extract and retention code runs; downloadFile is spied and served by stubDownloadFile keyed by the pinned URL"
    - "the synthetic archives are committed bytes (a ustar writer builds the tar; xz is made once in write mode if the fixture is absent; the gzip header OS byte is pinned to 3); a fixture that exists is never rewritten because the goldens hold its sha256"
    - "tar runs for real over the fake profile; a failing tar is scripted so its stderr does not depend on the host's tar"
    - "mkdtemp's random suffix is replaced by XXXXXX in every recorded value, and the tree snapshot goes through normalisePaths because a symlink target is stored as an absolute path"
    - "the notice store is the real CacheStore over a StoreRoot at the fake userData; Date.prototype.toString is replaced by the same format in UTC so the __timestamp values do not depend on the machine's zone"

key-files:
  created:
    - src/backend/engine/__tests__/oracle/fallbackEngine.oracle.test.ts
    - src/backend/engine/__tests__/oracle/engineState.oracle.test.ts
    - src-tauri/crates/gamelib-engine/tests/fixtures/golden/fallback/ (MANIFEST.json, cases.json, expected/ for 39 cases)
    - src-tauri/crates/gamelib-engine/tests/fixtures/golden/state/ (MANIFEST.json, cases.json, expected/ for 41 cases)
    - src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fallback/archives/ (3 archives)
  modified:
    - src/backend/__tests__/engineWineFixtureRedaction.test.ts

key-decisions:
  - "the fallback cases are authored in cases.json (inputs only); expected/ is only ever written by the harness. A case names what is served per artifact (ok, escape, wrong-size, wrong-sha, fail-network, fail-stopped, tar-fails), what is already installed, the callers and their abort point, and a seed"
  - "the reporter is run for real (ensurePinnedEngineReportingStatus) over the real fallback engine, with a tap on the engine's progress, so each case records both the engine's raw outcome and progress and the gameStatusUpdate sequence the reporter sent"
  - "the escaping symlink is a relative link (../../../outside) that resolves to <TOOLS>/outside: inside the fake profile, outside the extraction root, never a real system path (T-87-16)"
  - "the notices store is recorded through the real CacheStore, not a double, so the recorded bytes include the __internal__ version envelope and the nested __timestamp object a boot writes"
  - "a corrupt notices file is two cases: read only (kept byte for byte, the FND-06 acceptance) and the first dismissal (overwritten, as shipped)"

requirements-completed: [SVC-02]

duration: 9 min
completed: 2026-11-23

status: complete

coverage:
  - id: F1
    description: "D-08/D-10 fallback engine outcomes: download ok, offline, size mismatch, sha256 mismatch, network failure, abort before start, during download, verify and extract, tar failure, a symlink escaping the root, a stale directory replaced, each with the result, the gameStatusUpdate sequence (downloading:N ... verifying -> extracting -> setting-up, a done on failure or abort), the .gamelib-pin.json bytes, the steam-engines tree and the tar spawn trace"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/fallbackEngine.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: F2
    description: "D-08 retention and the boot sweep: prune after a current or previous pin installs keeps both and removes unpinned directories and a stale temp dir (a symlink and a file stay, the symlink target untouched), no prune after an unlisted pin, the sweep removes .tmp-<kind>-* directories only and skips while a download is in flight"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/fallbackEngine.oracle.test.ts#prune-after-install-keeps-current-and-previous"
        status: pass
    human_judgment: false
  - id: F3
    description: "single flight: two callers in one tick share one download per artifact, an early abort of one of three resolves only that caller, and aborting every joined caller aborts the shared download"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/fallbackEngine.oracle.test.ts#joined-caller-aborts-early"
        status: pass
    human_judgment: false
  - id: F4
    description: "prohibition: the real 228 MB pinned engine is never downloaded; every body is a synthetic archive under 16 KB served by the stubbed downloader, asserted by a test over the fixtures and the real pin's size"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/fallbackEngine.oracle.test.ts#no recorded archive is the real pinned engine: each fixture is a few KB"
        status: pass
    human_judgment: false
  - id: S1
    description: "D-08 trial notice and untested-build notice: the trial notice at 8 (hidden), 7, 0 days (shown) and expired, a licensed CrossOver with no days, the untested build shown, dismissed, never shown for the tested or an unreadable build"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineState.oracle.test.ts#trial-notice-7-days"
        status: pass
    human_judgment: false
  - id: S2
    description: "D-08 the notice store bytes: dismissedUntestedCrossoverBuilds capped at 50 (MAX_DISMISSED) with the __timestamp pair, the 51st dismissal dropping the oldest, a store already over the cap trimmed on the next write, non-string entries dropped, noCrossoverNoteDismissed, refused argument shapes writing nothing"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineState.oracle.test.ts#untested-dismissal-cap-50"
        status: pass
    human_judgment: false
  - id: S3
    description: "FND-06 acceptance: a corrupt notices file that is only read is kept byte for byte (asserted over the committed golden); the first write is recorded separately"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineState.oracle.test.ts#the corrupt notices file is kept byte for byte when it is only read (FND-06)"
        status: pass
    human_judgment: false
  - id: S4
    description: "D-08 launch decisions and notices: recordLaunchDecision publishing the state with the shared seq counter, the overlay, exit and deadline notices (false before a published state, the 200 character title cut), a throwing publisher logged and returning false, the unhealthy preflight TTL, single flight, inconclusive probes never cached, getGameEngineState for a non-Steam game and the bridge Steam game's adapter facts as values"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineState.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: M1
    description: "82 D-05: golden/fallback carries MANIFEST {count: 39, floor: 30} and golden/state {count: 41, floor: 35}, each asserted through assertManifest with an empty-list negative; the redaction FILE_FLOOR is 3907, the exact file count of both crates' fixture trees"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/engineWineFixtureRedaction.test.ts"
        status: pass
    human_judgment: false
---

# Phase 87 Plan 14: Fallback engine and engine state goldens Summary

**The first-need fallback engine download (verify, contained extraction, markers, retention, the boot sweep, single flight, the gameStatusUpdate sequence) is pinned by 39 TS-produced goldens over synthetic archives, and engine state, the trial and untested-build notices and the notice store bytes by 41 more, before any Rust for either exists; recording the notice store also surfaced that the TS overwrites a corrupt file on its first write, which the port must not.**

## Performance

- **Duration:** 9 min (2026-11-23T03:11Z to 03:20Z)
- **Tasks:** 2 of 2
- **Files:** 2 new oracle tests, 1 edited test, 3 archive fixtures, 80 golden case folders (5 files each), 2 hand-authored `cases.json`, 2 MANIFESTs

## Accomplishments

- `fallbackEngine.oracle.test.ts` runs the real `createFallbackEngine` and `ensurePinnedEngineReportingStatus` over a fresh `createFakeHomeProfile()` per case. `ENGINE_PINS` is replaced for the test only (the real current pin's ids, URLs and file names; the size and sha256 of three synthetic archives), `downloadFile` is spied and served by `stubDownloadFile` by the pinned URL, and `tar` runs for real inside the fake profile.
- 39 goldens in `golden/fallback`:
  - **ensure (24):** nothing installed, DXVK or Wine already installed, both installed (ok with no events), offline (nothing, DXVK only), size mismatch (DXVK, Wine), sha256 mismatch (DXVK, Wine), a network error, a stop with no signal, an abort before start, during download, verify and extract, a scripted tar failure (DXVK, Wine), a symlink escaping the root, a stale Wine or DXVK directory replaced, two joined callers, an early abort of one of three, every caller aborting.
  - **retention (7):** prune after a current pin installs (previous kept, old pins, a stale temp dir, a file and a symlink), no prune after an unlisted pin, prune on its own, prune with no root, the sweep, the sweep with no root, the sweep skipped while a download is in flight.
  - **installed and paths (8):** both, nothing, a wrong sha256, a corrupt marker, no marker, no wineserver, no x64, the path layout.
- `engineState.oracle.test.ts` runs the real `createEngineState`, `getGameEngineState` and the tested-version helpers over the real `CacheStore` notice store at the fake userData; the preflight, the CrossOver bin dir and bottle readiness are scripted values (87-13 owns the decision layer).
- 41 goldens in `golden/state`: trial notice (8, 7, 0 days, licensed, expired), untested build (shown, tested, unreadable, dismissed, dismissed twice, the 51st with the cap, a store over the cap, bad entries, a non-array), no-CrossOver (dismissed, with a populated store), refused dismissal shapes, the corrupt store (read, first write), an absent store, launch decisions (healthy, fallback notice seq, unavailable, inconclusive, label), overlay, exit and deadline notices, a throwing publisher, the unhealthy preflight TTL, single flight, an inconclusive and a throwing probe, missing CrossOver and unready bottles, forced CrossOver warnings, unsupported and Legacy engines, no bottle, refused inputs, a bridge Steam game, `getGameEngineState` for an Epic and a GOG game and its refusals.
- The redaction `FILE_FLOOR` went 3500 to 3907, the exact count of files in both crates' fixture trees.

## Task Commits

1. **Task 1 (tracer): the fallback engine goldens end to end** - `b4c94e277` (test)
2. **Task 2: engine state and notices goldens** - `23a4daa77` (test)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only, so it was re-run end to end after the commit (jest in compare mode, MANIFEST present, prettier clean) and passed. Tracer verified end-to-end, expansion followed.

## Verification

- `GAMELIB_WRITE_ENGINE_GOLDEN= pnpm exec jest --runTestsByPath` over both oracles, `engineWineFixtureRedaction.test.ts` and `fakeHomeIsolation.test.ts`: 106 passed, offline, compare mode, also under `TZ=Pacific/Auckland`; a write run left the committed tree byte-identical.
- Acceptance: `golden/fallback/MANIFEST.json` count 39 (>= 12); `golden/state/MANIFEST.json` count 41 (>= 15); the corrupt-store case `store-corrupt-read-keeps-file` records `storeFile` as the corrupt text unchanged (asserted over the committed golden).
- `npx prettier --check` over both oracle tests and the redaction test: clean (the fixtures are prettier-ignored per `--file-info`). `npx eslint` over both oracle tests and `npx tsc --noEmit -p tsconfig.json`: clean.
- Non-vacuity by mutation: changing `sha256 mismatch` in `sha256-mismatch-wine` and `showTrialNotice` in `trial-notice-7-days` each failed exactly that case; both restored.

## Findings the port must decide on (D-19 deltas, recorded as goldens, not fixed)

1. **FND-06: the TS notices store overwrites a corrupt file on its first write.** Reading is safe (the file is kept byte for byte and every notice reads as not dismissed, `store-corrupt-read-keeps-file`), but the first `dismissEngineNotice` replaces the whole file with a fresh document holding only the new key and leaves no copy (`store-corrupt-dismiss-overwrites-as-shipped`). 87-49 requires a corrupt notices file to be kept, never reset, so that one case is a deliberate Rust-side difference. `deltas.json` was not created; the port names it.
2. **The `__timestamp.<key>` pair is a nested object, not a dotted key**, and the value is a JavaScript `Date()` string in the machine's zone (`Mon Nov 23 2026 12:00:00 GMT+0000 (Coordinated Universal Time)`). The goldens pin it to UTC; byte equality for a user in another zone is the port's decision. The file is tab-indented with the values first, then `__internal__` (`{gamelib: {schemaVersion: 1}}`), then `__timestamp`, and no trailing newline.
3. **The dismissed list is capped on write only.** A store that already holds 60 builds reads all 60 and is cut to the last 50 on the next dismissal; non-string entries and a non-array value read as empty and are dropped on that write; dismissing a listed build again keeps one copy but rewrites the timestamp.
4. **Reporter sequence:** a success sends `downloading:N` (never decreasing, one weighted percent across DXVK then Wine), `verifying`, `extracting` for each artifact (deduped when two in a row are equal) and `setting-up`, and no `done`; an abort or any failure sends `done` instead of `setting-up`. An already-installed engine sends nothing at all.
5. **A failed Wine install leaves DXVK installed** (a size or sha256 mismatch, a tar failure or an escaping symlink on Wine); DXVK always installs first. The temp dirs are always removed.
6. **`Download stopped` in a downloader error is an abort even with no signal** (`download-stopped-without-signal`); any other downloader error is `download-failed` with its message.
7. **Joined callers:** with one caller, its abort aborts the shared download; with three, one early abort resolves only that caller with `aborted by caller` and the other two finish (`joined-caller-aborts-early`).
8. **Prune runs only after a successful install of the table's current or previous pin**, by identity; it skips `.tmp-*` only while an artifact install holds one, and it never removes a symlink or a file.
9. **An unhealthy preflight is cached for 60 s** from the clock the owner is given (a state at +30 s probes nothing, at +61 s probes again); a healthy one never expires; an inconclusive one is never cached and never badges; a probe that rejects releases the in-flight slot.
10. **The launch notice seq is one counter shared by the launch, overlay, exit and deadline notices** (1, 2, then 2 and 3 in `overlay-notice-needs-published-state`); a forced CrossOver, a forced pin and `cx-inconclusive` carry no launch notice; a throwing renderer push is logged per notice and returns false while the decision is still recorded.

## Deviations from Plan

### Auto-fixed Issues

None.

### Plan interpretation (not defects)

- **The xz archives are committed bytes.** Node cannot write xz, so `wine-synthetic.tar.xz` and `wine-escape.tar.xz` were made once by `xz -9e` over the tar the test's own ustar writer builds (write mode does this when a fixture is absent); the gzip header OS byte is pinned to 3 so the DXVK archive does not change with the platform. Each is a few hundred bytes and holds text stubs, never a real binary.
- **Compare mode needs a `tar` that reads xz** (bsdtar or GNU tar with xz installed). Both are standard on macOS and Linux; the oracle is skipped on Windows like the other Phase 87 oracles.
- **The corrupt-store acceptance is read-only.** The criterion says the corrupt file is kept, not reset; the TS keeps it only while it is read, so the golden that meets the criterion is the read-only case and the write is recorded as its own case and finding rather than hidden.
- **`getGameEngineState` for a bridge Steam game returns null by design** (Steam answers through its own adapter), so the bridge game's state is recorded through the owner's `getEngineState` with the adapter's facts as values, and `getGameEngineState` is recorded as refusing it.
- **TDD flag not set.** Neither task carries `tdd="true"`; the oracles were proved non-vacuous by mutation, as in 87-05, 87-12 and 87-13.

**Total deviations:** 0 auto-fixed. **Impact:** none on scope.

## Issues Encountered

- Two defects in my own first draft were caught by the compare run before commit: the marker map was keyed by absolute paths, and a symlink target in the tree snapshot is stored as an absolute path, so the golden differed per run. Both now go through `normalisePaths`.
- `actuals.tokens` is `estimateTokens` (chars/4) over the whole realized diff (381,447 characters, 410 files); the generated goldens are almost all of it, which is why it is above the plan's 80,000 estimate.
- `pnpm exec` re-ran the root `prepare` (husky install) on some runs; it changed nothing tracked.

## Known Stubs

None.

## Threat Flags

None. Nothing reaches the network (the downloader is stubbed) and no real engine is downloaded (T-87-16: the escaping symlink is relative and resolves to `<TOOLS>/outside` inside the fake profile, asserted by a test); every path, bottle name and build is synthetic, the redaction scan (floor 3907) passes over every committed file.

## Next Phase Readiness

87-15 records the launch-step goldens. The Rust fallback engine and engine state slices port against `golden/fallback` and `golden/state`; the ten findings above are their D-19 delta decisions, and finding 1 is a required Rust-side difference for FND-06.

## Self-Check: PASSED

Both oracle tests, both `MANIFEST.json` files and the three archive fixtures exist on disk; commits `b4c94e277` and `23a4daa77` are ancestors of HEAD; the acceptance criteria and the plan-level verification re-ran green.
