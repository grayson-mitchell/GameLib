---
phase: 85-store-host-config-and-versioned-migrations
plan: 03
subsystem: testing
tags: [policy-vectors, frame-contract, live-gate, uat, keychain, store-host, jest]

requires:
  - phase: 84-logger
    provides: the shared-fixture shape (logFrameVectors.json) and the 84-HUMAN-UAT.md contract layout this copies
provides:
  - storePolicyVectors.json, 167 renderer store-policy vectors (read, write, key path, cache name, read-only area) proven against today's TS in jest
  - storeFrameVectors.json, the `kind:"store"` sidecar frame contract (16 valid, 31 invalid frames with nine stable reason categories)
  - 85-HUMAN-UAT.md, the authored-not-run macOS live gate for FND-06 and FND-07 with eight pending items
affects: [85-10, 85-16, 85-17, 85-19, 85-20, 85-24]

actuals:
  tokens: 17500
  tasks: 3
  commits: 3
plan_head_before: 1945ad92335c192af1762ad6ee7a046adc26b1c9
plan_head_after: 4658ea8473b29dbd471eab75a71d6d84824f8900

tech-stack:
  added: []
  patterns:
    - "Policy vectors: inputs are hand-curated constants in the jest file, expected values are computed from the TS code and only rewritten under GAMELIB_WRITE_STORE_GOLDEN=1; compare mode asserts the committed file equals the freshly built document"
    - "Frame vectors carry values as JSON text (valueJson) so a serde_json::Value parse on the shell side never reorders nested keys; the oversized frame is a `generate` stanza the consumer expands"
    - "A live-gate contract for a signed build has no terminal transcript: every line is demanded of gamelib.log and notes.log is the only hand-written transcript"

key-files:
  created:
    - src/common/__fixtures__/storePolicyVectors.json
    - src/backend/stores/__tests__/storePolicyVectors.test.ts
    - src/common/__fixtures__/storeFrameVectors.json
    - .planning/phases/85-store-host-config-and-versioned-migrations/85-HUMAN-UAT.md
  modified: []

key-decisions:
  - "Item 6 reads the read-only AREA from the log line, not the notice: ReadOnlyStoresNotice shows one generic sentence for reason newer and lists area labels only for reason failed"
  - "The signed-build gate has no terminal.log; the dual-sink standard is adapted so shell and sidecar lines are both demanded of gamelib.log and the delimiter goes to notes.log"
  - "Item 3's library counts are read while launch 1 runs, before Refresh and Humble sync, so item 2 cannot move them"
  - "The largest valid frame seq is 2^53-1, not u64 max, so JS and Rust parse the same number"

patterns-established:
  - "Test 5 pairing pass stated as a reduction with counts: 22 state-mutating requirements against 19 evidence-bearing ones, 418 pairs considered, 10 flagged with resolutions"

requirements-completed: [FND-06, FND-07]

coverage:
  - id: D1
    description: "Renderer store policy as shared vectors (read, write, key path, cache name, read-only area) asserted against today's TS on every jest run, with refreshToken write-denied checked explicitly"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/stores/__tests__/storePolicyVectors.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "The store frame contract as shared vectors with all nine reason categories and a 10 MiB cap, ready for the 85-10 jest and cargo consumers"
    requirement: FND-06
    verification:
      - kind: other
        ref: "node check in 85-03 Task 2 <verify> (counts, reasons, prettier)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A live macOS gate contract for the credential upgrade and the store behaviours, authored before any Phase 85 code and never run by its author"
    requirement: FND-07
    verification:
      - kind: other
        ref: "uat.cjs parseUatItemsWithStats returns 8 items, headingsSeen 0; frontmatter parses as YAML"
        status: pass
    human_judgment: true
    rationale: "The gate is a human-run live macOS contract; plan 85-20 runs it on signed builds and no automation can substitute (SC3 is provable only live)"

duration: 35min
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 03: Store Policy and Frame Vectors, and the FND-06/FND-07 Live Gate Summary

**Shared renderer-policy vectors proven against today's TS, the sidecar `kind:"store"` frame contract as 16 valid and 31 invalid vectors, and an authored-not-run 8-item macOS gate for the Keychain upgrade and store behaviours.**

## Performance

- **Duration:** about 35 min (start time was not captured at spawn; estimated)
- **Completed:** 2026-11-22
- **Tasks:** 3
- **Files created:** 4

## Accomplishments

- `storePolicyVectors.json` holds 167 vectors (53 read, 56 write, 18 key-path, 16 cache-name, 24 area). The jest test rebuilds the document from its hand-curated inputs and today's `isAllowedStoreField`, `isWritableStoreField`, `isSafeKeyPath`, `CACHE_STORE_NAME_PATTERN` plus `RECOGNIZED_CACHE_STORE_NAMES`, and `areaForStoreKey`, and requires the committed file to equal it. It also asserts every `STORE_ALLOWLIST` store has an input, so a new store cannot skip the vectors.
- `storeFrameVectors.json` fixes the frame contract before either side exists: `maxFrameBytes` 10485760, ops set/delete/clear/replace/flush, valid frames including out-of-order nested keys, an integer-like key and a per-game document, and invalid frames covering unknown-field, shape, seq, op, store-key, key-path, reserved-key, value-json and too-large.
- `85-HUMAN-UAT.md` is the live gate: signed-build preconditions (D-08, D-16), a preflight that copies the profile first and inventories the Keychain without reading a secret, the dual-sink capture adapted to a signed app, a required-literals table, eight pending items each naming its launch ordinal, byte copy and restore, withdrawals, and a Structural Reachability Review with the seven tests and the pairing pass.
- Flip check (acceptance criterion): setting the `steamConfigStore`/`refreshToken` write vector to `allowed: true` made 3 of 9 tests fail (the explicit guard, the write section, the whole-document check); the file was restored and all 9 pass.

## Task Commits

1. **Task 1: Tracer, renderer policy vectors** - `eb4159ec0` (test)
2. **Task 2: Store frame contract vectors** - `8d0be0420` (test)
3. **Task 3: Live macOS gate contract** - `4658ea847` (docs)

**Plan metadata:** recorded in the docs commit that follows this summary.

## Files Created/Modified

- `src/common/__fixtures__/storePolicyVectors.json` - policy vectors shared by jest now and cargo in 85-16
- `src/backend/stores/__tests__/storePolicyVectors.test.ts` - compare and write modes over those vectors
- `src/common/__fixtures__/storeFrameVectors.json` - the store frame contract for 85-10
- `.planning/phases/85-store-host-config-and-versioned-migrations/85-HUMAN-UAT.md` - the gate plan 85-20 runs

## Decisions Made

- Item 6 (newer-version store) reads the affected area from the read-only log line. `ReadOnlyStoresNotice` renders a single generic sentence for reason `newer` and lists area labels only for `failed` (`src/frontend/components/UI/ReadOnlyStoresNotice/index.tsx:71-90`), so the plan's "notice names downloads with reason newer" could never be observed. Item 5 (corrupt, reason `failed`) does read `Play history` from the notice.
- A signed build launched from `/Applications` has no `tauri:dev` terminal, so the contract drops `terminal.log` and demands every line of `gamelib.log`; the only transcript is a hand-written `notes.log`.
- The frame vector for the largest sequence number is 2^53-1: a u64-max literal cannot be parsed exactly by `JSON.parse`, which would make the TS and Rust consumers disagree about the same file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Item 6 expected text could never be observed**
- **Found during:** Task 3 (tracing the notice to its renderer component, Test 7)
- **Issue:** The plan asked item 6 to observe "the notice names downloads with reason newer". The component renders no area label for `newer`.
- **Fix:** Item 6 expects the newer-GameLib sentence in the notice and a read-only log line for `store/download-manager` with reason newer; the review row and the Test 7 paragraph record why.
- **Files modified:** `85-HUMAN-UAT.md`
- **Committed in:** `4658ea847`

**2. [Rule 2 - Missing critical] An extra `## Test procedures` section**
- **Found during:** Task 3
- **Issue:** The plan's one-line `expected:` for each item cannot hold the copy-before and restore text its own must_have and threat T-85-07 require, and the plan's section list has no home for it.
- **Fix:** Added `## Test procedures` between `## Tests` and `## Withdrawn from live scoring`, in run order, naming each item's byte copy and restore. The eight `### N.` items still parse (8 items, headingsSeen 0).
- **Files modified:** `85-HUMAN-UAT.md`
- **Committed in:** `4658ea847`

---

**Total deviations:** 2 auto-fixed (1 bug in the plan's expectation, 1 missing section)
**Impact on plan:** Both keep the gate runnable by 85-20 without re-authoring. No scope creep.

## Issues Encountered

- `pnpm backend-di-ceilings` was not run here; it is the known pre-existing failure from commit `fb7f9b243` (three steam bridge test files), logged in the phase's `deferred-items.md`, and is outside this plan's gates.
- The Required literals table could not be made REACHABLE for `store boot: `, `store frame rejected`, `store write failed` or the Rust read-only line: their emitters do not exist until 85-09, 85-10 and 85-16, so those rows are CONDITIONAL with 85-20 Task 1 as the re-check. `exit finished in ` (`main.rs:892`) and `still running at exit deadline:` (`main.rs:895`) already exist.
- The Keychain-prompt absence check (item 1) is only meaningful if `securityd` logs an authorization request at info level; this was not demonstrated at authoring. The review row says a missing stream is recorded as unconfirmed, never as a pass, and the operator's own report is part of the criterion.
- `graphify update .` was not run: this plan changed two fixtures, one jest file and a planning doc, none of which shape the code graph.

## User Setup Required

None - no external service configuration required. The gate itself needs the signed v0.10 baseline (plan 85-05) and the signed Phase 85 build (plan 85-19); until both are recorded, items 1 and 2 are `blocked` and SC3 is unproven (D-16).

## Next Phase Readiness

- Plans 85-10 (store frame consumers), 85-16 (Rust `store_policy.rs`) and 85-17 can implement against the two vector files; 85-24 retargets the `area` half of the policy test when `readOnlyStores.ts` is deleted.
- Plan 85-20 owns the gate; its Task 1 must re-grep the CONDITIONAL literals and re-check item 7's precondition (a `steam_library.v1.*.bak.json` in the operator's profile).

## Known Stubs

None. No code path in this plan renders data.

## Threat Flags

None. The plan adds fixtures, a test and a contract; no network endpoint, auth path or file access in the product changed.

## Self-Check: PASSED

- FOUND: `src/common/__fixtures__/storePolicyVectors.json`
- FOUND: `src/backend/stores/__tests__/storePolicyVectors.test.ts`
- FOUND: `src/common/__fixtures__/storeFrameVectors.json`
- FOUND: `.planning/phases/85-store-host-config-and-versioned-migrations/85-HUMAN-UAT.md`
- FOUND commits: `eb4159ec0`, `8d0be0420`, `4658ea847`
- `pnpm codecheck`, `pnpm lint` (0 errors), `pnpm find-deadcode` (PASS) and `pnpm planning-gates` (12/12) exit 0 over the tree.

---
*Phase: 85-store-host-config-and-versioned-migrations*
*Completed: 2026-11-22*
