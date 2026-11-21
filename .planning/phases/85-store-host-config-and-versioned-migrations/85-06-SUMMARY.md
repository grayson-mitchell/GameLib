---
phase: 85-store-host-config-and-versioned-migrations
plan: 06
subsystem: storage
tags: [rust, serde_json, indexmap, dot-prop, atomic-write, byte-exact-json, ci]

requires:
  - phase: 85-01
    provides: "golden expected tree and the numbers, keyorder and dotpath oracle vectors this plan replays"
  - phase: 85-02
    provides: "store corpus (not consumed here; 85-07/08 use it)"
provides:
  - "gamelib-store crate: json (Json, Num, Obj, parse, to_store_bytes, to_settings_bytes, to_compact_bytes, js_number_text, Obj::insert_js), dotpath (segments, get, has, set, delete, is_reserved_internal), atomic (write_atomic, write_atomic_with, Durability)"
  - "gamelib-store-cli: roundtrip <file> --flavour store|settings|compact"
  - "golden.rs and vectors.rs: every golden expected file and every oracle vector replayed in Rust"
  - "CI, jest workflow gate, lockfile name gate and crates README cover both crates"
affects: [85-07, 85-08, 85-09, store host, store engine, migrations]

tech-stack:
  added: []
  patterns:
    - "Store-private ordered Json (IndexMap objects) parsed by a custom Deserialize visitor; serde_json::Value and preserve_order never used"
    - "Writers print JS bytes: tab, two-space and compact, ECMAScript Number::toString, no trailing newline"
    - "JS key order kept as an invariant: integer-like keys (0..=4294967294) are a sorted prefix, maintained by insert_js and by parse"
    - "Atomic write with an injectable rename seam, bounded retry, direct-write fallback and a Durability argument"

key-files:
  created:
    - src-tauri/crates/gamelib-store/Cargo.toml
    - src-tauri/crates/gamelib-store/src/lib.rs
    - src-tauri/crates/gamelib-store/src/json.rs
    - src-tauri/crates/gamelib-store/src/dotpath.rs
    - src-tauri/crates/gamelib-store/src/atomic.rs
    - src-tauri/crates/gamelib-store/tests/golden.rs
    - src-tauri/crates/gamelib-store/tests/vectors.rs
    - src-tauri/crates/gamelib-store-cli/Cargo.toml
    - src-tauri/crates/gamelib-store-cli/src/main.rs
    - src-tauri/crates/gamelib-store-cli/tests/cli.rs
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - .github/workflows/rust-test.yml
    - meta/__tests__/rustTestWorkflow.test.ts
    - src/backend/__tests__/cargoFeatures.test.ts
    - src-tauri/crates/README.md

key-decisions:
  - "parse is JS-faithful, not plain insertion: it orders integer-like keys first and ascending and lets the last duplicate win at the first position, exactly as JSON.parse does, because the keyorder valueText vectors and D-05 (read TS-written files, write the same bytes) need it; a TS-written file is already in that order so the common case is one scan"
  - "dot_paths false treats __proto__ as an ordinary key (the nodot-proto-key-is-an-ordinary-key vector), not a refused one as the plan's truth text said; the oracle wins"
  - "Arrays hold holes as Json::Null (JSON.stringify prints a hole as null), so set past the end and delete of an element match the vectors"
  - "The conf rule that dotted __internal__. keys are refused lives in dotpath::is_reserved_internal because the dotpath vectors encode it as a TypeError"
  - "write_atomic always leaves the file 0600, including a file TS wrote 0644: stores are private to the user (D-13)"

patterns-established:
  - "Golden walk classifies by what the oracle wrote: non-backup files must round-trip in the settings, store or compact flavour; a backup is the pre-migration bytes in their original layout, so it must parse and survive a store re-serialisation, not match byte for byte"

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "Every golden expected file the TS store stack wrote parses and re-serialises byte-identical in Rust (settings, store and compact flavours); backups parse"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-store/tests/golden.rs#every_golden_expected_file_round_trips_byte_identical"
        status: pass
    human_judgment: false
  - id: D2
    description: "JS number text: every numbers.json vector matches, the lone-surrogate vector is a parse error, and a 200-deep document is a parse error"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-store/tests/vectors.rs#numbers_print_as_js_prints_them"
        status: pass
      - kind: unit
        ref: "src-tauri/crates/gamelib-store/tests/vectors.rs#a_200_deep_document_is_a_parse_error_not_a_stack_overflow"
        status: pass
    human_judgment: false
  - id: D3
    description: "JS key order at every depth, including keys created by a dot-path set: every keyorder.json vector matches"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-store/tests/vectors.rs#key_order_vectors_match"
        status: pass
    human_judgment: false
  - id: D4
    description: "dot-prop 6 semantics: every dotpath.json vector matches, with dotNotation true and false"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-store/tests/vectors.rs#dot_prop_vectors_match"
        status: pass
    human_judgment: false
  - id: D5
    description: "Atomic write: 0600 file, 0700 new directories, symlink target replaced not the link, retry then direct-write fallback, no temp file on any outcome"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-store atomic::"
        status: pass
    human_judgment: false
  - id: D6
    description: "Windows: a destination held open without FILE_SHARE_DELETE is retried then written through the fallback with the right bytes"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-store/src/atomic.rs#windows::a_destination_held_without_share_delete_is_retried_then_written_directly"
        status: unknown
    human_judgment: true
    rationale: "The test compiles and passes clippy for x86_64-pc-windows-msvc but only runs on CI's Windows leg (85-19), not on this Mac"
  - id: D7
    description: "Both crates are in the workspace, the multi-crate CI step, the jest workflow gate, the lockfile name gate and the README; preserve_order is off and neither crate depends on keyring"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "pnpm exec jest --runTestsByPath meta/__tests__/rustTestWorkflow.test.ts src/backend/__tests__/cargoFeatures.test.ts"
        status: pass
      - kind: other
        ref: "cargo tree -e features -i serde_json | grep -c 'serde_json feature \"preserve_order\"' == 0; cargo tree -p gamelib-store | grep -c keyring == 0"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-11-22
status: complete
actuals:
  tokens: 18000
  tasks: 3
  commits: 8
plan_head_before: 5d85dadd79ad99770946675a0c5ff736b0ced24e
plan_head_after: c6c72c6f0308f68c46cfd5893784e97db58f1772
---

# Phase 85 Plan 06: gamelib-store Byte-Level Primitives Summary

**Tauri-free `gamelib-store` crate with an order-preserving Json type, JS-exact number text and key order, dot-prop 6 paths and a hardened atomic write, proven against all 100 golden files and every oracle vector, plus a headless `gamelib-store-cli` and CI wiring on all three OS legs.**

## Performance

- **Duration:** about 25 min
- **Completed:** 2026-11-22
- **Tasks:** 3 (one tracer, two TDD)
- **Files modified:** 16 (10 created)
- **Commits:** `commits: 8` is the measured `rev-list` count over the plan's range. Six are this plan's (below); two (`01c12f259`, `819c2dd5f`) are another session's `docs(todo)`/`docs(state)` commits that landed on main in the same window.

## Accomplishments

- **D-05 is a tested contract.** All 100 golden expected files parse and re-serialise byte-identical: 57 in the store (tab) flavour, 7 in the settings (two-space) flavour, 2 compact, and 34 backups that must parse and survive a store re-serialisation. Numbers (1e21 -> `1e+21`, 1e20 -> `100000000000000000000`, 100.0 -> `100`, -0 -> `0`, integers past 2^53 as the nearest double) and integer-key ordering match the TS oracle.
- **dot-prop 6 over `Json`:** backslash-dot escapes, refused `__proto__`/`prototype`/`constructor`, array index traversal with null holes, a non-object replaced on set, delete that never prunes, and a per-store `dot_paths: false`.
- **Atomic write** copied from `gamelib-steamfiles` and hardened: 0600 temp with `create_new`, 0700 new directories, `Durability::{Synced, Unsynced}`, bounded rename retry (25/50/100 ms) on permission and Windows sharing errors, direct-write fallback, no temp on any path.
- **CI coverage:** `-p gamelib-store -p gamelib-store-cli` in the multi-crate step, a "tests gamelib-store (Phase 85)" jest case with its omission mutation, the lockfile name gate and the README.
- Parsing never disables serde_json's recursion limit: 200-deep errors, 100-deep parses (T-85-13).

## Task Commits

1. **Task 1: Tracer, scaffold and golden round-trip** - `2662cd31c` (feat)
2. **Task 2: JS number text and JS key order** (TDD) - RED `c1b7a779e` (test), GREEN `26efeff33` (feat), `df428d463` (refactor, renames one test so `grep -c "fn insert_js"` is 1)
3. **Task 3: dot-prop 6 paths and the atomic write** (TDD) - RED `510c1ea92` (test), GREEN `c6c72c6f0` (feat)

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md and ROADMAP.md.

## Tracer feedback gate

Task 1 is `type="tracer"` with an automated-only `<verify>` and `human_verify_mode` = `end-of-phase`, not auto mode: the verify was re-run end to end after the commit (golden 100 files, CLI 4 tests, clippy, fmt, no `preserve_order`, no keyring, jest 39 tests, prettier). It passed, so expansion proceeded with no checkpoint.

## TDD Gate Compliance

Tasks 2 and 3 are `tdd="true"` inside an `execute` plan (not plan-level `type: tdd`), so the classifier-based `check tdd-red-evidence` contract does not apply; the RED/GREEN sequence was followed by commit.

- **Task 2 RED** (`c1b7a779e`): `insert_js` was a skeleton that appended. `undotted_key_order_vectors_match` failed on its assertion: left `{"b","2","a","1"}` in insertion order, right the JS order `{"1","2","b","a"}`. Number vectors and the 200-deep case already held (the number writer was implemented in the tracer, which the plan allows when a golden file carries a float).
- **Task 3 RED** (`510c1ea92`): `dotpath` skeletons returned `None`/`false` and `write_atomic` wrote nothing. `dot_prop_vectors_match` and `key_order_vectors_match` failed on their assertions (`left: "{}"` against the dotted `x.y.z` document) and nine `atomic::` tests failed on assertions (file content and call-count mismatches).
- **GREEN** commits `26efeff33` and `c6c72c6f0` pass the named tests and the whole crate (26 lib tests, 1 golden, 5 vectors).

## Files Created/Modified

- `src-tauri/crates/gamelib-store/src/json.rs` - Json/Num/Obj, the ordered parser, three writers, `js_number_text`, `insert_js`
- `src-tauri/crates/gamelib-store/src/dotpath.rs` - dot-prop 6 `segments/get/has/set/delete` and conf's reserved-key rule
- `src-tauri/crates/gamelib-store/src/atomic.rs` - `write_atomic`, retry, fallback, `Durability`, unit and Windows tests
- `src-tauri/crates/gamelib-store/tests/golden.rs` - walks `expected/`, asserts byte-identical re-serialisation and a recorded-file floor
- `src-tauri/crates/gamelib-store/tests/vectors.rs` - numbers, keyorder (dotted and undotted), dotpath and recursion-limit vectors
- `src-tauri/crates/gamelib-store-cli/src/main.rs`, `tests/cli.rs` - `roundtrip` subcommand (exit 0 identical, 1 differs, 2 unparseable, 64 usage) run with a cleared env
- `src-tauri/Cargo.toml`, `Cargo.lock` - workspace members and the shell path dependency; the lockfile gains only the two in-repo crates
- `.github/workflows/rust-test.yml`, `meta/__tests__/rustTestWorkflow.test.ts`, `src/backend/__tests__/cargoFeatures.test.ts`, `src-tauri/crates/README.md` - CI and gate registration

## Decisions Made

See `key-decisions`. The one worth restating for 85-07/08: `json::parse` already applies JS key order, so engine code that loads a store file and writes it back gets TS's bytes without extra work, and any code that builds an object must go through `Obj::insert_js` (or `dotpath::set`) to keep that invariant.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `parse` orders keys like JSON.parse instead of plain insertion**
- **Found during:** Task 2
- **Issue:** The plan says the parse visitor builds objects with plain insertion in file order. The keyorder `valueText` vectors (`whole-object-replace-reorders-integer-keys` and two more) are JSON text whose parse must reorder integer keys, and a hand-edited store with out-of-order integer keys would otherwise be written back in a different order than TS writes it.
- **Fix:** `Obj::from_document_order` (one ordered-scan fast path, a sort only when needed); duplicates keep the first position and the last value.
- **Files modified:** `src-tauri/crates/gamelib-store/src/json.rs`
- **Verification:** `key_order_vectors_match`, `parse_orders_keys_like_json_parse_and_keeps_the_last_duplicate`, golden still byte-identical
- **Committed in:** `26efeff33`

**2. [Rule 1 - Bug] `dot_paths: false` does not refuse `__proto__`**
- **Found during:** Task 3
- **Issue:** The plan's truth says a `dot_paths: false` store "still refuses a `__proto__` key". The oracle vector `nodot-proto-key-is-an-ordinary-key` records the opposite: conf writes it as an own key.
- **Fix:** follow the vector; the module doc says so.
- **Files modified:** `src-tauri/crates/gamelib-store/src/dotpath.rs`
- **Verification:** `dot_prop_vectors_match`
- **Committed in:** `c6c72c6f0`

**3. [Rule 2 - Missing critical] conf's `__internal__.` reserved-key rule and `Obj::get_mut` added**
- **Found during:** Task 3
- **Issue:** Two dotpath vectors expect a TypeError for `set` with a dotted `__internal__.x` key; that is conf, not dot-prop, but nothing else in the plan owns it before the engine exists. `set` also needed a mutable child accessor.
- **Fix:** `dotpath::is_reserved_internal(path, dot_paths)` (only dotted keys, only with dot paths on) and `Obj::get_mut`.
- **Files modified:** `dotpath.rs`, `json.rs`
- **Committed in:** `510c1ea92`, `c6c72c6f0`

**4. [Rule 3 - Blocking] Golden flavour rule refined**
- **Found during:** Task 1
- **Issue:** The plan says pick the flavour from the path (`GamesConfig/*` and top-level `config.json` are settings, the rest store). 28 expected files are backups holding the pre-migration bytes in their original layout (hand-written inputs, trailing newlines), 4 are untouched compact inputs, and a migrated settings document is tab-indented (NOTES.md says so).
- **Fix:** non-backup files must round-trip in the path's flavour or, for settings documents, the store flavour, or compact for an untouched input; backups must parse and re-serialise to the same document. The test asserts every flavour is exercised (57 store, 7 settings, 2 compact).
- **Files modified:** `src-tauri/crates/gamelib-store/tests/golden.rs`
- **Committed in:** `2662cd31c`

**5. [Rule 1 - Bug] `fn insert_js` grep acceptance**
- **Found during:** Task 2 acceptance check
- **Issue:** a test named `insert_js_places_...` matched `grep -c "fn insert_js"`, giving 2 instead of 1.
- **Fix:** renamed the test.
- **Committed in:** `df428d463`

---

**Total deviations:** 5 auto-fixed (3 Rule 1, 1 Rule 2, 1 Rule 3)
**Impact on plan:** no scope creep. Items 1 and 2 correct the plan's text to match the oracle, which the plan itself names the authority.

## Issues Encountered

- `float_roundtrip` appeared twice in `gamelib-store/Cargo.toml` (a comment and the dependency), so the `grep -c == 1` criterion read 2. The comment was reworded.
- The Windows held-file test cannot run on this Mac. `cargo check --tests` and `cargo clippy --tests -D warnings` for `x86_64-pc-windows-msvc` pass, so it compiles; it runs on CI's Windows leg (85-19).
- Other sessions have uncommitted changes (`gamelib-log` moving from chrono to jiff, with a `Cargo.lock` diff; `gamelib-steampoll/tests/monitor.rs`). They are not part of this plan and were left alone. The jiff change will add crate names to `Cargo.lock`, so `cargoFeatures.test.ts` `EXPECTED_LOCKFILE_CRATE_NAMES` will need that session's re-pin.

## Known Stubs

None. Unused-for-now dependencies (`gamelib-core`, `serde` derive) are declared as the plan specifies for the engine and host plans that follow.

## Threat Flags

None. T-85-12 (temp/symlink handling: `create_new` pid+seq temp, symlink resolution, temp removed on every path, 0600/0700, tested), T-85-13 (200-deep document errors, recursion limit never disabled) and T-85-14 (prototype segments refused, vector-proven) are mitigated as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 85-07 and 85-08 can build the envelope, engine and host on `Json`, `dotpath` and `write_atomic`; the corpus from 85-02 is the next replay target.
- Plan 85-05 is open at its human checkpoint and its files and 85-VALIDATION.md's signed baseline were not touched.

## Self-Check: PASSED

All ten created files and the six modified files exist; commits `2662cd31c`, `c1b7a779e`, `26efeff33`, `df428d463`, `510c1ea92` and `c6c72c6f0` are ancestors of HEAD; `cargo test -p gamelib-store -p gamelib-store-cli` (26 lib, 1 golden, 5 vectors, 4 cli), `cargo clippy --all-targets -D warnings`, `cargo fmt --check`, the two jest suites (39 tests), `pnpm codecheck` and `pnpm find-deadcode` all pass.

---
*Phase: 85-store-host-config-and-versioned-migrations*
*Completed: 2026-11-22*
