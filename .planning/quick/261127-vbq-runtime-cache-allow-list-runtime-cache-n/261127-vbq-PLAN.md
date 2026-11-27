---
phase: quick-261127-vbq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/store_dispatch.rs
  - src/backend/stores/storeFrames.ts
  - src/backend/stores/__tests__/storeKeys.test.ts
  - .planning/todos/pending/2026-11-22-runtime-cache-names-allow-list-owns-nothing.md
  - .planning/todos/completed/2026-11-22-runtime-cache-names-allow-list-owns-nothing.md
autonomous: true
requirements:
  - "quick:261127-vbq"
  - "todo:2026-11-22-runtime-cache-names-allow-list-owns-nothing"

estimate:
  tokens: 49000
  raw_tokens: 49000
  tasks: 3
  confidence: low
  # estimate-calibration 2026-11-27: factor 1, 0 samples, confidence low. basis: fixed 20k (workflow, summary
  # template, this plan, the conventions skill, the todo) + T1 16k (store_dispatch.rs lines 120-200, 535-545 and
  # 1425-1545, one full gamelib-shell cargo test, rustfmt) + T2 9k (storeFrames.ts 1-140, storeKeys.test.ts, the
  # 20-suite jest run, codecheck, eslint, prettier) + T3 4k (todo move, Resolution, planning-gates)

must_haves:
  truths:
    - "A store frame naming a `store_cache/<name>` the table does not list still parses on both sides (the shared vector `store_cache/custom_cache` stays valid) and the shell still refuses it `not-owned` and writes no file (T-85-30)"
    - "The shell decides store-frame ownership from the store table alone: `owned_row` takes one argument and resolves through a table-only lookup, and `src-tauri/src/store_dispatch.rs` carries no hand-copied cache-name list and no recognised-name helper (13 matching lines at HEAD, 0 after)"
    - "Every name in `recognizedCacheStoreNames` (`src/common/types/ipc/storeChannels.json`) is a store-table row the shell owns, pinned by a Rust test and a TS test that both read the policy file, so a recognised name added without a table row turns both red"
    - "The sidecar's `isRustOwnedStoreKey` follows the same rule with no runtime-names parameter: a `store_cache/` key is the shell's only when the table lists it, and every table row, `GamesConfig/<app>`, `settings/global` and `isRustOwnedStoreName` keep their current answers"
    - "`storeChannels.json` and its `recognizedCacheStoreNames` list are unchanged, because the sidecar's storeNew gate (`storePolicy.ts`), `store_policy.rs` and the native storeNew path (`store_native.rs`) still read it"
    - "The source todo sits in `.planning/todos/completed/` with a Resolution, and `pnpm planning-gates` reports 12/12"
  artifacts:
    - path: src-tauri/src/store_dispatch.rs
      provides: "Table-only ownership (`table_row_for_store_key`, one-argument `owned_row`), the unchanged shape-level `row_for_store_key`, and the recognised-names invariant test"
      contains: "fn store_frame_every_recognised_cache_name_is_an_owned_table_row"
    - path: src/backend/stores/storeFrames.ts
      provides: "`isRustOwnedStoreKey` with the test seam gone: a runtime cache key is owned only when the table lists it"
      contains: "export function isRustOwnedStoreKey(storeKey: string): boolean"
    - path: src/backend/stores/__tests__/storeKeys.test.ts
      provides: "The T-85-30 case rewritten for table-only ownership, plus the TS half of the invariant"
      contains: "T-85-30"
    - path: .planning/todos/completed/2026-11-22-runtime-cache-names-allow-list-owns-nothing.md
      provides: "Closed todo with its Resolution"
      contains: "## Resolution"
  key_links:
    - from: src-tauri/src/store_dispatch.rs
      to: src/common/types/ipc/storeChannels.json
      via: "the invariant test reads `crate::store_policy::policy().recognized_cache_store_names()` (parsed from this file) and asserts each `store_cache/<name>` is a table row that `owned_row` returns"
      pattern: "recognized_cache_store_names\\(\\)"
    - from: src-tauri/src/store_dispatch.rs
      to: src/common/__fixtures__/storeFrameVectors.json
      via: "`parse_store_frame` keeps checking keys with `row_for_store_key`, whose runtime branch is what lets the shared `store_cache/custom_cache` vector parse; `store_frame_every_valid_vector_parses` proves it"
      pattern: "row_for_store_key\\(store\\)\\.is_none\\(\\)"
    - from: src/backend/stores/__tests__/storeKeys.test.ts
      to: src/common/types/ipc/storeChannels.json
      via: "`RECOGNIZED_CACHE_STORE_NAMES` (storePolicy.ts reads it from this file); each name must be a table row the sidecar reports as Rust-owned"
      pattern: "RECOGNIZED_CACHE_STORE_NAMES"
---

<objective>
Remove the shell's runtime-cache allow-list, which decides nothing in production. Phase 85 review B-WR-10 is a
necessity finding: every name in the list is already a store-table row, so its half of the ownership check never
changes an answer. Ownership then rests on one source, the store table. The fact that made the list dead (every
recognised cache name is a table row) is pinned by a test on each side that reads the one policy file.

Purpose: delete the machinery a hypothetical future runtime cache would need, keep the T-85-30 refusal intact,
and keep the shell and the sidecar refusing the same names by the same rule. A real runtime cache gets added as a
table row when one exists.

Output: table-only ownership in `src-tauri/src/store_dispatch.rs`, the matching simplification of
`isRustOwnedStoreKey` in `src/backend/stores/storeFrames.ts` with its test, and the source todo moved to
`completed/` with a Resolution.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-11-22-runtime-cache-names-allow-list-owns-nothing.md

Load `Skill("gamelib-conventions")` before writing any `<verify>` evidence. The formatter section governs the
prettier checks below, the Rust shutdown section does not apply (this plan spawns nothing and adds no exit work),
and the todo-frontmatter section explains why `completed/` is exempt from the triage gate.

Facts measured at HEAD (aaf7eed2e) while planning, so the executor does not have to work them out again:

- **The todo's one-line fix is not safe as written, so this plan does something slightly different.** The
  runtime row `row_for_store_key` builds for an unlisted `store_cache/<name>` (`runtime_cache_row` in
  `src-tauri/crates/gamelib-store/src/host.rs:480`) is `Family::Cache`. Its `store_kind()` is `Some` and
  `store_boot::is_rust_owned` is true for every family except `Excluded`. So the "row check" does NOT refuse
  unknown names. They are refused by the left side of the helper's `||` (`row_for_key(key).is_some()`). Only the
  right side, the list lookup, is dead. Making `owned_row` into `row_for_store_key(key).filter(is_rust_owned)`
  while the runtime branch is still there would OWN `store_cache/custom_cache` and create its file, which is a
  T-85-30 regression.
- **The runtime branch of `row_for_store_key` must stay.** `parse_store_frame` (line 254) rejects with
  `store-key` when `row_for_store_key` is `None`. The shared vector `store_cache/custom_cache` in
  `src/common/__fixtures__/storeFrameVectors.json` (line 141, "set on a runtime cache store that is not in the
  recognized list") is a VALID frame on both sides. TS `isStoreKey` accepts it, and
  `store_frame_every_valid_vector_parses` (line 1224) asserts Rust does too. Removing the branch would break that
  contract. So ownership gets its own table-only lookup, and `row_for_store_key` keeps the shape check. This
  matches the native storeNew path, which already resolves a recognised cache name with
  `row_for_key(&key).filter(|row| is_rust_owned(row))` (`src-tauri/src/store_native.rs:538`).
- `storeChannels.json` `recognizedCacheStoreNames` (5 names) stays. Its consumers are `storePolicy.ts:170/236`
  (the sidecar's storeNew gate), `store_policy.rs:90-149`, `store_native.rs:85/525/567`, and the tests
  `storePolicyVectors.test.ts`, `GlobalStateSteamCacheHydration.test.ts` and `storeKeys.test.ts`. All five names
  are `user-state` table rows with a file name (checked against `src/common/types/ipc/storeTable.json`).
  `store_cache/umu` is a `cache` table row that is not in the list.
- Every reference to the list and the helper is in `src-tauri/src/store_dispatch.rs` (13 lines). The TS mirror
  of the dead half is the optional second parameter of `isRustOwnedStoreKey` (`storeFrames.ts:111-126`). Only
  `storeKeys.test.ts` lines 33, 36 and 38 pass it. `settingsDocs.ts:58` and `isRustOwnedStoreName` use the
  default. `tauriShellSource.test.ts` pins only `main.rs`'s `store_dispatch::configure(...)` call and reads
  nothing this plan changes. No source-text gate names the list, the helper or the seam.
- All 25 `#[test]` items in `store_dispatch.rs` sit in `mod tests` (line 773), and none is `#[ignore]`.
  `cargo fmt --manifest-path src-tauri/Cargo.toml -p gamelib-shell -- --check` reports no diff in
  `store_dispatch.rs` at HEAD. Its only diffs are pre-existing ones in `ipc_contract.rs`, which are not this
  plan's to fix.
- Prettier: `npx prettier --file-info` reports `{ "ignored": false, "inferredParser": "typescript" }` for
  `src/backend/stores/storeFrames.ts` and `src/backend/stores/__tests__/storeKeys.test.ts`. Both are clean under
  `--check` and under scoped `npx eslint` at HEAD. `src-tauri/src/store_dispatch.rs` reports
  `{ "ignored": false, "inferredParser": null }`: prettier has no parser for Rust, so `--check` over it would
  error and prove nothing. rustfmt is its formatter check. The `.planning/` todo paths are prettier-ignored.
- Jest trap: `--selectProjects` takes an array and swallows every path written after it. At HEAD,
  `npx jest --selectProjects Backend src/backend/stores ...` ran the whole Backend project (588 suites, with 4
  unrelated suites failing). Put the paths FIRST, then `--selectProjects Backend`. Written that way, the 20
  targeted suites pass at HEAD with 688 tests.

Working-tree hazard: the tree has unrelated uncommitted edits in `.planning/` (including `.planning/state.json`)
and untracked files, among them another quick task's directory (`261127-uzm`) and
`src-tauri/crates/gamelib-humble/tests/fixtures/recorded/real/`. Stage every commit by explicit path with
`git add <path>...`. Never use `git add -A`, `git add .`, `git commit -a`, or a gsd-tools commit without
`--files`. Before each commit, confirm with `git diff --cached --name-only` that only this task's paths are staged.
</context>

<tasks>

<!-- planner-discipline-allow: RUNTIME_CACHE_NAMES -->
<!-- planner-discipline-allow: runtime_cache_recognised -->
<!-- planner-discipline-allow: recognizedRuntimeCaches -->
<!-- planner-discipline-allow: RECOGNIZED_CACHE_STORE_NAMES -->

<task type="tracer" tdd="true">
  <name>Task 1: The shell owns a store frame's file only when the store table lists it (one-argument owned_row, list gone)</name>
  <files>src-tauri/src/store_dispatch.rs</files>
  <behavior>
    - `owned_row(key)` returns the row for each of `store_cache/steam_metadata`, `store/wine-downloader-info`, `store_cache/gog_library`, `steam_store/config`, `store/config`, `settings/global` and `GamesConfig/480` (unchanged table answers).
    - `owned_row` is `None` for `store/uploadedLogs` (native) and `store/migrations` (excluded), and for `store_cache/fresh_runtime_cache`, `store_cache/custom_cache`, `store_cache/brand_new_cache`, `store_cache/a.b`, `store_cache/../../etc`, `store_cache/`, `store_cache/a/b` and `elsewhere/fresh_runtime_cache`.
    - `row_for_store_key("store_cache/fresh_runtime_cache")` is still `Some`, with family `Cache` and dir `store_cache`. The key is shape-valid but not owned, which pins the split between parsing and ownership.
    - For every name in `crate::store_policy::policy().recognized_cache_store_names()` (asserted non-empty), the name passes `crate::store_policy::is_plausible_cache_name`, `row_for_key("store_cache/<name>")` is `Some`, and `owned_row("store_cache/<name>")` is `Some`. A failure message names the offending name and says it must be added as a store-table row.
    - End to end, unchanged: a `store_cache/custom_cache` frame is answered `refused`/`not-owned` and no `store_cache/custom_cache.json` appears (`store_frame_applies_to_every_family_and_refuses_an_unrecognised_runtime_cache` and `store_frame_for_a_store_rust_does_not_own_is_refused_not_owned_and_writes_nothing`), and every shared valid vector still parses.
  </behavior>
  <action>
    The end-to-end slice: one store frame through parse, the worker's ownership check, and the reply or the file write, with ownership resolved through the table alone. All line numbers are at HEAD aaf7eed2e.

    Test first. It starts red because `owned_row` still takes two arguments.

    1. In the `mod tests` block, replace `store_frame_runtime_cache_names_equal_the_recognised_names_of_the_policy_file` (lines 1428-1443) with a test named `store_frame_every_recognised_cache_name_is_an_owned_table_row` that asserts the fourth behavior bullet. Open it with a two-line comment saying what it records: the policy file's recognised cache names are all store-table rows, which is why the shell needs no list of its own; a new recognised name must arrive as a table row.
    2. Rewrite `store_frame_owned_row_takes_every_openable_row_and_refuses_unrecognised_runtime_names` (lines 1445-1497) and rename it `store_frame_owned_row_takes_every_openable_row_and_refuses_every_runtime_name_the_table_does_not_list`. Its closure calls the one-argument `owned_row(key)`. Keep the seven-key table loop and the native and excluded asserts. Replace the "recognised runtime name opens as a cache" block with the `row_for_store_key` shape assertion from the behavior block. Add `store_cache/fresh_runtime_cache` and `store_cache/custom_cache` to the not-owned loop. Delete the trailing loop and asserts that exercised the recognised-name helper.
    3. Run `cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-shell store_dispatch::` and see it fail to compile on the one-argument call. That is the red step; record it in the SUMMARY.

    Then the production code:

    4. Add a private `fn table_row_for_store_key(key: &str) -> Option<TableRow>` holding the two table branches of today's `row_for_store_key`. A `GamesConfig/<app>` key resolves to the `settings/game` pattern row when `plain_name(app)`, else `None`. A key the table lists resolves to its row only when the row has a file name, else `None`. Its doc comment says this is the table's answer alone and that ownership uses it.
    5. Make `row_for_store_key` call `table_row_for_store_key` for those keys and keep its runtime branch exactly as it is: an unlisted `store_cache/<name>` whose name passes `cache_name` becomes `runtime_cache_row`. Keep today's early returns. A `GamesConfig/` key, or a key the table lists, never falls through to the runtime branch, even when it resolves to `None`. Keep its doc comment, and add one sentence: the runtime branch is a shape check (the frame parser and the shared vectors), not ownership.
    6. Delete the allow-list constant `RUNTIME_CACHE_NAMES` together with its 12-line doc comment (lines 155-171), and the helper `runtime_cache_recognised` together with its doc comment (lines 173-182).
    7. Rewrite `owned_row` as `fn owned_row(key: &str) -> Option<TableRow>`, returning `table_row_for_store_key(key)` filtered to rows with `store_kind().is_some()` and `store_boot::is_rust_owned`. Its doc comment records the invariant in prose: the store table alone decides ownership; a `store_cache/<name>` the table does not list is shape-valid (it parses, as the shared vector requires) but is refused `not-owned` and never gets a file (T-85-30); every recognised cache name in `storeChannels.json` is a table row (the test from step 1 pins it), which is also what the native storeNew path in `store_native.rs` relies on; a future runtime cache is added as a table row. Do not name the deleted constant or helper in any comment. Say "the old allow-list" if you need a back-reference.
    8. At the worker call site (line 541) call `owned_row(&store)`.
    9. In `store_frame_applies_to_every_family_and_refuses_an_unrecognised_runtime_cache`, reword the comment above frame 3 (lines 1509-1510) to say the name is one the table does not list, instead of "outside the recognised list". Leave that test's name and assertions alone.
    10. Keep the `runtime_cache_row` import, which the runtime branch still uses, and `cache_name`. Remove nothing else. Run `cargo fmt --manifest-path src-tauri/Cargo.toml -p gamelib-shell` only if the check in verify reports a diff in this file, and if it does, stage only `src-tauri/src/store_dispatch.rs` (rustfmt also rewrites the pre-existing `ipc_contract.rs` diffs; restore that file with `git checkout -- src-tauri/src/ipc_contract.rs`).
    11. Run `graphify update .` so the local graph drops the deleted symbols (graphify-out is gitignored, so there is nothing to stage). If it fails, note that in the SUMMARY; it does not block the task.

    Commit, after `git diff --cached --name-only` shows exactly this one path: `git add src-tauri/src/store_dispatch.rs`, subject `refactor(quick-261127-vbq): the shell owns a store frame's file only when the store table lists it`.
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-shell > "${TMPDIR:-/tmp}/vbq-t1.txt" 2>&1; grep -E '^test result' "${TMPDIR:-/tmp}/vbq-t1.txt" | awk '{p+=$4; f+=$6} END {exit !(f==0 && p>0)}' && test "$(grep -c -E '^test store_dispatch::tests::.* \.\.\. ok$' "${TMPDIR:-/tmp}/vbq-t1.txt")" -ge 25 && test "$(grep -c -E -- '--> .*store_dispatch\.rs' "${TMPDIR:-/tmp}/vbq-t1.txt")" = 0 && test "$(grep -c -E 'RUNTIME_CACHE_NAMES|runtime_cache_recognised' src-tauri/src/store_dispatch.rs)" = 0 && grep -q -E 'fn owned_row\(key: &str\) -> Option<TableRow>' src-tauri/src/store_dispatch.rs && grep -q -E 'fn table_row_for_store_key\(' src-tauri/src/store_dispatch.rs && grep -q -E 'fn store_frame_every_recognised_cache_name_is_an_owned_table_row\(' src-tauri/src/store_dispatch.rs && test "$(cargo fmt --manifest-path src-tauri/Cargo.toml -p gamelib-shell -- --check 2>&1 | grep '^Diff in' | grep -c 'store_dispatch\.rs')" = 0</automated>
    Baselines: lines naming the list or the helper, `grep -c -E 'RUNTIME_CACHE_NAMES|runtime_cache_recognised' src-tauri/src/store_dispatch.rs` [HEAD=13 EXPECT==0 @aaf7eed2e]; each of the three new signatures, `grep -q -E` for the one-argument `owned_row`, for `table_row_for_store_key` and for the invariant test [HEAD=absent EXPECT==present @aaf7eed2e] (measured with `grep -c` over all three: 0 at HEAD); rustfmt diffs in this file [HEAD=0 EXPECT==0 @aaf7eed2e GUARD MUTATION: any hand-wrapped line in the rewritten owned_row or the new test]. Regression guards with no bracket baseline, because measuring them means building, which planning does not do: the whole gamelib-shell run reports 0 failures and a nonzero pass count; `store_dispatch::tests` reports at least 25 passing (25 `#[test]` items at HEAD counted from the source; this task replaces one and renames one, so 25 is the expected number); no compiler warning points into `store_dispatch.rs`. If the warning guard fires, the warning is this task's to fix, since no warning there is known at HEAD.
    Formatter: prettier is omitted on purpose. `npx prettier --file-info src-tauri/src/store_dispatch.rs` reports `{ "ignored": false, "inferredParser": null }`: prettier has no Rust parser, so `--check` would error and prove nothing. The rustfmt check above is this file's formatter gate.
  </verify>
  <done>`store_dispatch.rs` has no allow-list constant and no recognised-name helper. `owned_row` takes one argument and resolves through `table_row_for_store_key`, and `row_for_store_key` keeps its runtime shape branch. The invariant test reads `storeChannels.json` through `store_policy` and passes. An unlisted runtime cache frame still parses and is still refused `not-owned` with no file. The whole gamelib-shell suite and the 25 `store_dispatch::tests` pass, rustfmt is clean for the file, and one commit holds only this path.</done>
</task>

<task type="auto">
  <name>Task 2: The sidecar's isRustOwnedStoreKey uses the same table-only rule, and its test records the invariant</name>
  <files>src/backend/stores/storeFrames.ts, src/backend/stores/__tests__/storeKeys.test.ts</files>
  <action>
    The shell's rule changed in Task 1. This task makes the sidecar's half match it, so both sides refuse the same names by the same rule, and not only because the invariant happens to hold. Line numbers are at HEAD aaf7eed2e.

    1. In `src/backend/stores/storeFrames.ts`, change `isRustOwnedStoreKey` (lines 111-126) to the single-parameter signature `export function isRustOwnedStoreKey(storeKey: string): boolean`. Keep the first two refusals (no row resolves, or the row is `excluded`). Then return true when the key is not under `store_cache/` or when `rowByKey(storeKey)` finds a listed table row. Drop the `recognizedRuntimeCaches` parameter and its lookup. Rewrite the JSDoc: the shell owns every resolvable row but an `excluded` one; a runtime `store_cache/<name>` the table does not list is never the shell's (T-85-30), the same rule as `owned_row` in `src-tauri/src/store_dispatch.rs`.
    2. In the same file, remove `RECOGNIZED_CACHE_STORE_NAMES` from the `common/types/storePolicy` import and keep `CACHE_STORE_NAME_PATTERN`, which `rowForStoreKey` still uses. Leave `RUNTIME_CACHE_ROW` and the runtime branch of `rowForStoreKey` exactly as they are: `isStoreKey`, `isMirrorStoreKey` and `dotPathsFor` depend on them, and the shared `store_cache/custom_cache` vector must still validate.
    3. Fix the two doc comments that describe the old rule. In the module doc (lines 20-23), a runtime `store_cache/<name>` key the table does not list is a cache-family store (the stores `storeNew` builds) that the shell never owns: it refuses its frames `not-owned` and creates no file (T-85-30); every recognised cache name is a table row, which `storeKeys.test.ts` pins. In the `isMirrorStoreKey` JSDoc (lines 100-105), change "A runtime cache outside the recognised list resolves too" to say a runtime cache the table does not list resolves too. Leave the rest of that sentence about storeNew as it is.
    4. In `src/backend/stores/__tests__/storeKeys.test.ts`, replace the case `owns a recognised runtime store_cache name the table does not list, and no other (T-85-30)` (lines 30-43) with one named `owns no runtime store_cache name the table does not list (T-85-30)`. It asserts that `store_cache/fresh_runtime_cache` and `store_cache/brand_new_cache` are not Rust-owned but are still `isStoreKey` (shape-valid, as the shared vectors need), and that `store_cache/umu` is Rust-owned (a table row not in the recognised list). It asserts `RECOGNIZED_CACHE_STORE_NAMES.length` is above 0, so the loop cannot pass empty. Then, for each recognised name, it asserts `tableFile.rows` has a row keyed `store_cache/<name>`, `isStoreKey` is true and `isRustOwnedStoreKey` is true. Every `isRustOwnedStoreKey` call in the file takes one argument. Leave the other cases and the `isRustOwnedStoreName` describe untouched.

    Commit, after `git diff --cached --name-only` shows exactly these two paths: `git add src/backend/stores/storeFrames.ts src/backend/stores/__tests__/storeKeys.test.ts`, subject `refactor(quick-261127-vbq): the sidecar's isRustOwnedStoreKey owns a runtime cache only when the table lists it`.
  </action>
  <verify>
    <automated>npx jest src/backend/stores/ src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/storeChangeNotifier.test.ts src/backend/__tests__/storeBackendAccessors.test.ts src/backend/sidecar/__tests__/sidecarStdoutFramesOnly.test.ts --selectProjects Backend && pnpm -s codecheck && npx eslint src/backend/stores/storeFrames.ts src/backend/stores/__tests__/storeKeys.test.ts && npx prettier --check src/backend/stores/storeFrames.ts src/backend/stores/__tests__/storeKeys.test.ts && test "$(grep -c 'recognizedRuntimeCaches' src/backend/stores/storeFrames.ts)" = 0 && test "$(grep -v -E '^[[:space:]]*(\*|/\*\*|//)' src/backend/stores/storeFrames.ts | grep -c 'RECOGNIZED_CACHE_STORE_NAMES')" = 0 && test "$(grep -c -E 'isRustOwnedStoreKey\([^)]*, ' src/backend/stores/__tests__/storeKeys.test.ts)" = 0</automated>
    Baselines: seam mentions in storeFrames.ts, `grep -c 'recognizedRuntimeCaches' src/backend/stores/storeFrames.ts` [HEAD=3 EXPECT==0 @aaf7eed2e]; non-comment uses of the recognised list in storeFrames.ts, `grep -v -E '^[[:space:]]*(\*|/\*\*|//)' src/backend/stores/storeFrames.ts | grep -c 'RECOGNIZED_CACHE_STORE_NAMES'` [HEAD=2 EXPECT==0 @aaf7eed2e]; two-argument calls in the test, `grep -c -E 'isRustOwnedStoreKey\([^)]*, ' src/backend/stores/__tests__/storeKeys.test.ts` [HEAD=3 EXPECT==0 @aaf7eed2e]. Regression guards already true at HEAD, which must stay true: the 20 targeted suites pass with 0 failures (688 tests at HEAD; the count stays at least 688, since one case is rewritten in place). The paths come BEFORE `--selectProjects`, which otherwise swallows them and runs the whole Backend project. `pnpm codecheck`, scoped eslint and scoped prettier pass. `npx prettier --file-info` reports `{ "ignored": false, "inferredParser": "typescript" }` for both paths, so the prettier check is real.
  </verify>
  <done>`isRustOwnedStoreKey` takes one argument and owns a `store_cache/` key only when the table lists it. `storeFrames.ts` no longer imports the recognised list, and its doc comments describe the table-only rule. `storeKeys.test.ts` pins T-85-30 with one-argument calls and checks that every recognised name is a table row the sidecar reports as Rust-owned. The 20 suites, codecheck, eslint and prettier are green, and one commit holds only these two paths.</done>
</task>

<task type="auto">
  <name>Task 3: Close the source todo with a Resolution</name>
  <files>.planning/todos/pending/2026-11-22-runtime-cache-names-allow-list-owns-nothing.md, .planning/todos/completed/2026-11-22-runtime-cache-names-allow-list-owns-nothing.md</files>
  <action>
    1. Move the todo and keep its history: `git mv .planning/todos/pending/2026-11-22-runtime-cache-names-allow-list-owns-nothing.md .planning/todos/completed/2026-11-22-runtime-cache-names-allow-list-owns-nothing.md`. Keep its frontmatter and its Problem and Fix sections byte for byte.
    2. Append a section headed `## Resolution (2026-11-27): ownership is the store table's alone`, in the shape of `.planning/todos/completed/2026-11-22-dead-imagecache-scheme-branch-in-renderer.md`. Keep lines near 115 columns, matching the existing sections. Cover these points in plain prose:
       - what was removed from `store_dispatch.rs`: the allow-list, its helper, the second parameter of `owned_row`, and the test that pinned the list to `storeChannels.json`. Say that `owned_row` now resolves through a table-only lookup, the shape that `store_native.rs` already used;
       - the correction to the todo's premise. Unknown names were not refused by the row check, because the runtime row is cache-family and would have counted as owned. The left side of the helper's `||` refused them. The suggested one-liner would also have needed the runtime branch gone from `row_for_store_key`, but the frame parser and the shared `store_cache/custom_cache` vector rely on that branch. So the branch stays as a shape check, and ownership got its own lookup;
       - how the invariant is recorded: one Rust test and one TS test, both reading `recognizedCacheStoreNames` from `storeChannels.json`, assert that every recognised name is an owned table row;
       - that `storeChannels.json` and its list are unchanged, and why (the storeNew gate in `storePolicy.ts`, `store_policy.rs` and `store_native.rs` read it);
       - that the sidecar's `isRustOwnedStoreKey` lost its test-only parameter and now follows the same table-only rule;
       - that T-85-30 still holds, verified by the unchanged end-to-end refusal tests, and that this was verified by tests, not by a live app run;
       - the two fix commits, by subject, because the branch may be rebased on merge.
    3. Run `pnpm planning-gates`. `completed/` is exempt from the triage-frontmatter gate, and the move takes a file out of `pending/`, so the count stays at 12/12.

    Commit with explicit paths only. `git mv` has already staged both sides, so add only the edited completed file: `git add .planning/todos/completed/2026-11-22-runtime-cache-names-allow-list-owns-nothing.md`. Then confirm with `git diff --cached --name-only` that exactly the pending deletion and the completed file are staged, and that `.planning/state.json` and every other dirty `.planning/` path are NOT. Subject: `docs(quick-261127-vbq): close the runtime-cache allow-list todo`.
  </action>
  <verify>
    <automated>test ! -e .planning/todos/pending/2026-11-22-runtime-cache-names-allow-list-owns-nothing.md && grep -q '^## Resolution (2026-11-27)' .planning/todos/completed/2026-11-22-runtime-cache-names-allow-list-owns-nothing.md && pnpm -s planning-gates</automated>
    Baselines: pending copies of this todo, `test -e .planning/todos/pending/2026-11-22-runtime-cache-names-allow-list-owns-nothing.md` [HEAD=present EXPECT==absent @aaf7eed2e]; the Resolution heading in the completed file, `grep -q '^## Resolution (2026-11-27)'` [HEAD=error:2 EXPECT==present @aaf7eed2e] (the file does not exist at HEAD). Regression guard, already true at HEAD: `pnpm planning-gates` stays at 12/12. The formatter check is omitted on purpose. Both paths are under `.planning/`, for which `npx prettier --file-info` reports `{ "ignored": true, "inferredParser": null }`, so `--check` would be vacuous there.
  </verify>
  <done>The todo is in `.planning/todos/completed/` with its original frontmatter and a dated Resolution that covers what was removed, the corrected premise, where the invariant is pinned, why the policy file stays, the TS change, the tests-not-live verification and both fix commits. `pnpm planning-gates` is 12/12, and one docs commit holds only the move.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar stdout -> shell store-frame worker | A `store` frame names a store key; the shell decides whether it owns the file behind it before writing anything under the user-data directory |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-261127-vbq-01 | Tampering | `owned_row` in `src-tauri/src/store_dispatch.rs` | medium | mitigate | Ownership resolves through `table_row_for_store_key` only, never through the runtime shape row, so a frame naming an unlisted `store_cache/<name>` is refused `not-owned` and creates no file (T-85-30 kept). Task 1's rewritten unit test checks eight refused keys, and the two unchanged end-to-end tests check the `not-owned` reply and that no file is created. |
| T-quick-261127-vbq-02 | Tampering | shell/sidecar ownership parity | low | mitigate | Both sides now apply the same table-only rule, and a Rust test plus a TS test, each reading `recognizedCacheStoreNames` from `storeChannels.json`, fail if a recognised name is not a table row. A drift where the sidecar suppresses its own push for a store the shell refuses cannot land silently. |
| T-quick-261127-vbq-03 | Repudiation | shared working tree with other dirty `.planning/` and untracked paths | low | mitigate | Every commit stages explicit paths and checks `git diff --cached --name-only` first. If rustfmt runs, it touches `ipc_contract.rs`, which is restored and never staged. |
| T-quick-261127-vbq-SC | Tampering | npm/pip/cargo installs | high | accept | This plan installs, adds and upgrades no package, so the legitimacy gate has nothing to inspect. |
</threat_model>

<verification>
- `cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-shell` is green, with `store_dispatch::tests` at 25 passing, including `store_frame_every_valid_vector_parses`, `store_frame_applies_to_every_family_and_refuses_an_unrecognised_runtime_cache` and `store_frame_for_a_store_rust_does_not_own_is_refused_not_owned_and_writes_nothing`.
- `npx jest src/backend/stores/ src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/storeChangeNotifier.test.ts src/backend/__tests__/storeBackendAccessors.test.ts src/backend/sidecar/__tests__/sidecarStdoutFramesOnly.test.ts --selectProjects Backend` is green across 20 suites, with paths before the project flag.
- `pnpm -s codecheck` passes. Scoped `npx eslint` and `npx prettier --check` over the two TS paths pass. rustfmt reports no diff in `store_dispatch.rs`.
- `grep -c -E 'RUNTIME_CACHE_NAMES|runtime_cache_recognised' src-tauri/src/store_dispatch.rs` prints 0, and `git diff aaf7eed2e -- src/common/types/ipc/storeChannels.json src/common/__fixtures__/storeFrameVectors.json` is empty.
- `pnpm planning-gates` is 12/12.
- `git log -3 --stat` shows three commits holding only this plan's paths, and `git status` still shows the other dirty `.planning/` and untracked paths, unstaged and untouched.
</verification>

<success_criteria>
- The shell decides store-frame ownership from the store table alone, with no hand-copied list of cache names, and still refuses unlisted runtime cache names `not-owned` with no file.
- `row_for_store_key` keeps its runtime shape branch, so the frame contract shared with TS is unchanged.
- The sidecar's `isRustOwnedStoreKey` applies the same table-only rule and has no test-only parameter.
- The invariant that every recognised cache name is an owned table row is pinned on both sides from the one policy file, which is unchanged.
- The todo is closed in `completed/` with a Resolution, and planning gates are 12/12.
</success_criteria>

<output>
Create `.planning/quick/261127-vbq-runtime-cache-allow-list-runtime-cache-n/261127-vbq-SUMMARY.md` when done. Record
the red-step compile failure from Task 1, the measured gate outputs (the gamelib-shell pass count, the 25
store_dispatch tests, the jest suite and test counts, the grep baselines after), both fix commit hashes and
subjects, and whether `graphify update .` ran. When the quick workflow commits this SUMMARY, PLAN and STATE, the
commit must use `--files` with explicit paths, because `.planning/state.json` and other `.planning/` files carry
unrelated uncommitted edits.
</output>
