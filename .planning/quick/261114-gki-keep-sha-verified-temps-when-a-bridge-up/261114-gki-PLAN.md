---
phase: quick-261114-gki
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/crates/gamelib-depot/src/delta.rs
  - src-tauri/crates/gamelib-depot/tests/delta_resume.rs
  - src-tauri/crates/gamelib-depot/tests/delta.rs
  - src-tauri/crates/gamelib-depot/tests/support/delta_env.rs
  - src-tauri/crates/gamelib-depot/tests/support/fake_cdn.rs
  - .planning/todos/pending/2026-11-13-bridge-update-resume-keeps-verified-temps.md
  - .planning/todos/completed/2026-11-13-bridge-update-resume-keeps-verified-temps.md
autonomous: true
requirements:
  - TODO-2026-11-13-bridge-update-resume-keeps-verified-temps
must_haves:
  truths:
    - "Pausing (cancelling) a delta update part-way keeps every temp that already passed the whole-file SHA-1, and deletes every partial temp"
    - "Resuming the same target build re-hashes each kept temp and reuses it when size and SHA-1 both match: none of its chunks is requested from the CDN"
    - "On resume the progress counters start at the reused bytes/files (done_bytes, files_done seeded), net bytes count only the fresh transfer, and a log line names how many files/bytes were reused"
    - "A kept temp whose size or SHA-1 does not match the manifest is deleted and rebuilt, never trusted"
    - "A run for a different target build (or with no / unreadable / malformed ledger) deletes every kept temp and starts clean"
    - "A run that ends in error still deletes every temp, including reused ones, and the ledger"
    - "A delta run that falls back to a file-level install (stale journal, old manifest unavailable) deletes the kept temps and the ledger first"
  artifacts:
    - path: "src-tauri/crates/gamelib-depot/src/delta.rs"
      provides: "TempLedger (kept-temp record keyed on target GIDs), reuse pass, verified tracking, cancel/error cleanup split"
      contains: "TempLedger"
    - path: "src-tauri/crates/gamelib-depot/tests/delta_resume.rs"
      provides: "Integration tests for pause-keeps, resume-reuses, tampered-rebuilt, changed-target-clean, error-deletes"
  key_links:
    - from: "delta_body cancel branch"
      to: "{steamapps}/gamelib-delta/{appId}.temps.json"
      via: "write_temp_ledger with the manifest-form names of verified temps"
      pattern: "temps\\.json"
    - from: "delta_body reuse pass"
      to: "Work temps"
      via: "metadata len == file.size && sha1_file(tmp) == file.sha_content"
      pattern: "sha1_file"
---

<objective>
Stop a paused bridge update from throwing away built, SHA-verified temps. Today `delta_body`
deletes every temp at run start (delta.rs ~1299-1313, "never reused") and on any cancel or failure
before commit (~1551-1561). Pause maps to cancel, so a resume re-downloads the whole delta. UAT 6a
measured about 70 MB lost on a 101 MB delta, and about 916 MiB lost on Manor Lords.

Purpose: Closes todo `2026-11-13-bridge-update-resume-keeps-verified-temps.md`. That todo is
deferred WR-03 from the Phase 74 gap-closure. It is not the 74-REVIEW.md narrative WR-03, which is a
queue issue. The todo's "Done when" sets the bar: pause, then resume, transfers only the bytes not
already in verified temps, as the progress counters and the log show. A changed target build
still starts clean.

Output: A delta.rs change, integration tests in the crate, and the todo moved to completed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-11-13-bridge-update-resume-keeps-verified-temps.md
@src-tauri/crates/gamelib-depot/src/delta.rs
@src-tauri/crates/gamelib-depot/tests/delta_resume.rs
@src-tauri/crates/gamelib-depot/tests/support/delta_env.rs

<design_settled>
These decisions come from reading delta.rs at HEAD `4c0d4c702`. They are settled. Do not re-open them.

1. **Temp names do not key on the target build.** A temp is `<dest> + DELTA_TMP_SUFFIX`
   (`.gamelib-delta-tmp`, delta.rs:57, built at ~1239-1247). So the "target build changed"
   check needs a sidecar record, which this plan calls the **temp ledger**.
   - Path: `{finalize.steamapps_dir}/gamelib-delta/{appId}.temps.json`. That is the same dir as
     the journal (`JOURNAL_DIR`, `journal_path`, ~732-803). Gate it on `all_numeric(app_id)` the
     same way.
   - Shape: serde camelCase with `deny_unknown_fields`:
     `{ appId: String, newGids: BTreeMap<depotId, manifestGid>, temps: Vec<String> }`. `temps`
     holds **manifest-form filenames** (`ManifestFile.filename`), never absolute paths.
   - `well_formed()`: numeric appId, numeric keys and values, as in `Journal::well_formed`.
   - `matches(job)`: same appId and same `newGids` as the job's `depots[*].manifest_id`.
     `old_gids` is deliberately NOT compared. Every reused temp is re-hashed against the NEW
     manifest's `sha_content`, so the installed build has no bearing on whether a temp is correct.
   - Write it atomically. Copy `write_journal`'s pattern: 0o700 dir, temp file, fsync, rename. Use
     a DIFFERENT temp name (`.{appId}.temps.tmp`) so it can never collide with the journal's
     `.{appId}.tmp`. You may factor one private `write_state_file(path, bytes, tmp_name)` helper
     out of `write_journal`, which keeps its behaviour.
   - **Security:** a ledger name is turned into a path ONLY through
     `resolve_contained_path(&root, name)`, then `DELTA_TMP_SUFFIX` is appended. Never remove a
     path that does not end in `DELTA_TMP_SUFFIX`. An unreadable or malformed ledger is never
     trusted: treat it as "no ledger" (start clean) and delete the file.

2. **Pause vs cancel vs error at the cleanup site.** The crate has no "pause". A pause is
   `registry::cancel`, so it reaches the cleanup branch as `cancel.is_cancelled()` or
   `unattempted > 0` with `failures.is_empty()`. Error means `!failures.is_empty()`, which
   includes a journal-write failure. Split the branch at ~1553:
   - **Cancel** (no failures): delete the temps of works that were NOT verified. That includes the
     temp of any file mid-build, which is partial. Keep verified and reused temps. Write the ledger
     naming the kept temps, or remove the ledger if none are kept. Emit one
     `emitter.warn(format!("update paused: kept {n} verified files ({bytes} bytes) for resume"))`.
     Warnings are the crate's log channel: `progressBridge.ts` `case 'warning'` → `logWarning`.
     Do NOT add a TS-visible field.
   - **Error**: delete every work temp, including reused ones, and remove the ledger. This keeps
     today's behaviour.
   - Both keep the rest of the branch exactly as is: `resuming` → `finalize_interrupted`, status,
     outcome fields. Also delete the duplicated deletion while you are there. ~1554-1561 removes the
     temps twice, once in `spawn_blocking` and once in `remove_temps`. Keep one `spawn_blocking`
     sweep.
   - "Verified" is tracked per work. `build_file` returns `Ok(())` only after the whole-file SHA-1
     passes (~589-606), or for a zero-size file. Make the build-pool future yield
     `(index, Result)`, and record each index whose result is `Ok`.

3. **Reuse pass** (replaces the unconditional deletion at ~1299-1313):
   - **When the ledger is present, `well_formed` and `matches(job)`:** for every work whose
     `file.filename` is in `ledger.temps` and whose `file.size != 0`, check two things inside one
     `spawn_blocking`:
     - `fs::metadata(tmp).len() == file.size`
     - `sha1_file(tmp) == file.sha_content`

     Follow the `resuming` probe's pattern at ~1259-1288: check `cancel.is_cancelled()` between
     files and call `stall.record_progress()` after each one.

     A temp that passes both checks is **prebuilt**. A temp that fails either check is deleted.
     Then delete the temp of every work NOT in the ledger, every `already` temp, and every ledger
     name that maps to no work. The last case covers files that left the work set; resolve those
     names contained, as design point 1 requires.
   - **Otherwise** (no ledger, mismatch, unreadable or malformed): delete every work temp, every
     `already` temp and every ledger-named temp, then remove the ledger. This is today's behaviour
     plus the orphan sweep. On a parseable mismatch, emit
     `emitter.warn("a paused update for a different build left temps; starting clean")`.
   - **If cancel fires during the re-hash**, return `outcome_shell(.., Cancelled, ..)` and leave the
     ledger in place. A temp deleted as mismatched before that point is simply rebuilt next time.
   - Represent prebuilt as a `HashSet<usize>` or `Vec<bool>` indexed like `works`, and KEEP the
     prebuilt works inside `works`. The commit (`CommitPlan.renames`, `modes`) and
     `DeltaReport.changed_files` then include them with no further change. Only the plan pass's
     `wanted` (~1341-1346) and the build pool's input skip prebuilt works. Skipping them in
     `wanted` is what keeps their chunks out of the CDN plan.

4. **Progress accounting.**
   - `work_bytes`, `emitter.planned(..)`, `Build.total_bytes`, `files_total` and `peak_bytes` stay
     the totals over ALL works, prebuilt included.
   - Before the build starts, seed `counters.done_bytes` with the prebuilt bytes and
     `counters.files_done` with the prebuilt count. Then emit one `emitter.progress(build.snapshot())`
     so the bar resumes where it paused.
   - `net_bytes` (and therefore `DeltaReport.cdn_bytes` and `Stats.bytes_fetched`) counts only
     fresh transfer, with no change needed.
   - `DeltaReport.reused_bytes` keeps its meaning: chunk reuse from the old tree. Do NOT add
     prebuilt bytes to it.
   - When `prebuilt` is non-empty, emit one log line:
     `emitter.warn(format!("resuming paused update: reusing {n} verified files ({bytes} bytes)"))`.

5. **Ledger lifetime.**
   - Remove the ledger just before `run_commit`, at step (6) "Commit" (~1587). After that point
     the journal governs a resume. This is today's behaviour for any temps left after a failed
     rename: they get rebuilt.
   - Both early `*fallback = true` returns sweep the ledger and its named temps before returning:
     the Stale journal at ~993-996 and the definitive old-manifest failure at ~1106-1110. The
     file-level fallback in download.rs knows nothing about `.gamelib-delta-tmp` files, so without
     the sweep they would be orphaned in the game dir. The sweep needs only `root` and the ledger
     names. Use one helper, e.g. `discard_temp_ledger(spec, app_id, root)`. It is idempotent and
     ignores errors.
   - Cancels BEFORE the reuse pass return `Cancelled` and leave ledger and temps untouched. That
     covers manifest load and old-manifest load (~1046, 1103, 1128).

6. **Out of scope:** the orphan-journal todo (`2026-11-13-orphan-delta-journal-after-cancel.md`),
   the estimate accuracy gap (UAT 6a GAP), and any TS change. The journal is not touched.
</design_settled>

<interfaces>
From src/delta.rs (private unless marked pub):
- `pub const DELTA_TMP_SUFFIX: &str = ".gamelib-delta-tmp";`
- `const JOURNAL_DIR: &str = "gamelib-delta";`
- `fn journal_path(spec: &crate::job::FinalizeSpec, app_id: &str) -> Option<PathBuf>`
- `fn write_journal(job: &DepotJob, path: &Path) -> io::Result<()>`. This is the atomic-write pattern to copy.
- `struct Journal { app_id, new_gids: BTreeMap<String,String>, old_gids, retired, started_at }` with `for_job`, `matches`, `well_formed`
- `fn all_numeric(s: &str) -> bool`
- `struct Work<'a> { di, file: &'a ManifestFile, dest: PathBuf, tmp: PathBuf, seed }`
- `Build::build_file(&self, w: &Work<'_>, fc: &CancellationToken) -> Result<(), FileErr>`. Ok means whole-file SHA-1 passed.
- `struct Counters { done_bytes, net_bytes, files_done, .. : AtomicU64 }` (from download.rs)
- `fn remove_temps(works: &[Work<'_>])`
- `crate::reconcile::sha1_file(path) -> io::Result<[u8; 20]>`
- `resolve_contained_path(&root, name) -> Result<PathBuf, _>`

From tests/support/delta_env.rs:
- `setup(old, new) -> Env`; `round_trip_cases(name) -> (old, new)`. In new: a unchanged; b = [b2,b0,b3], so b3 is CDN-only; c = [b1,c1n], so c1n is CDN-only; d = [d0, synth("d1",500)] is new.
- `Env { dir, cdn, host, .. }`; `env.job(id)`, `env.run(job) -> Outcome`, `env.journal_path()`, `env.plant_temp(rel, bytes) -> PathBuf`, `env.root_file(rel)`, `env.acf_bytes()`, `env.new_gid(depot)`, `env.chunk_hits()`, `env.cdn.hit_count(target)`, `env.cdn.script(target, Vec<Reply>)`
- `tmp_files(dir) -> Vec<PathBuf>`, `wait_for(what, cond)`, `assert_tree_matches(env, case)`, `sha_hex`, `synth`, `piece`
- FakeHost: `pub emits: Mutex<Vec<JobEvent>>`. Clear it between runs to isolate the second run's frames.
- FakeCdn `script`: a queue with len > 1 pops its front, and a queue with len 1 repeats it. So `vec![Reply::Hang, <original 200 reply>]` hangs the first request only.
- Chunk target form: `/depot/940001/chunk/{sha_hex}`. Depot id `940001` (the `DEPOT` const in tests).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED — integration tests for keep-on-pause, reuse-on-resume, rebuild, clean-on-target-change, delete-on-error</name>
  <files>src-tauri/crates/gamelib-depot/tests/delta_resume.rs, src-tauri/crates/gamelib-depot/tests/delta.rs, src-tauri/crates/gamelib-depot/tests/support/delta_env.rs, src-tauri/crates/gamelib-depot/tests/support/fake_cdn.rs</files>
  <behavior>
    - pause_keeps_verified_temps_and_resume_skips_them: the d1 chunk is scripted [Hang, original reply]. The test waits until host.emits holds a progress frame with filesDone >= 2 and the d1 target was hit, then calls registry::cancel. Expect status Cancelled, the old tree and ACF unchanged, and both the b.bin and c.bin temps present, each holding exactly its new content. Expect no d.bin temp and the ledger file present. Then snapshot hit counts for the b3 and c1n targets, clear host.emits and run a second job (new job id, same target). Expect status Completed, the tree matching new, tmp_files empty, the ledger and journal gone, and the b3/c1n hit counts UNCHANGED. In the second run, the first progress frame has doneBytes >= size(b)+size(c) and filesDone >= 2. One warning frame contains "reusing 2 verified files".
    - resume_rebuilds_mismatched_temps: a ledger is planted naming b.bin and c.bin for the job's real new gid. The b.bin temp is planted with its exact new bytes; the c.bin temp has the right length with one byte flipped. Expect the run to complete with the tree matching new: b3 not requested (b reused), c1n requested (c rebuilt). A second variant plants c.bin truncated by one byte, with the same expectation for c.
    - changed_target_starts_clean: a ledger is planted with newGids {940001: "999"}, naming b.bin and an orphan "zzz.bin". A correct b.bin temp and a zzz.bin temp are planted. Expect the run to complete with b3 requested (not reused), the zzz.bin temp gone, the ledger gone, and tmp_files empty.
    - error_deletes_all_temps: a ledger plus a correct b.bin temp are planted for the real gid, and the d1 chunk is scripted to a 200 with an undecodable body (a non-retryable DecodeFailed). Expect status Error, tmp_files empty and the ledger gone.
    - stale_journal_falls_back (existing, delta_resume.rs): additionally plant a ledger plus a temp before the run and assert both are gone afterwards.
    - delta_cancel_before_commit_keeps_old (existing, tests/delta.rs ~707): replace `assert!(tmp_files(..).is_empty())`. The new assertion: no d.bin temp, and every remaining temp's bytes equal its file's new content. The b and c builds race the cancel, so do not assert a count.
  </behavior>
  <action>
    Add these Env helpers in tests/support/delta_env.rs: `temp_ledger_path()`, which returns `steamapps()/gamelib-delta/{APP}.temps.json`, and `write_temp_ledger(new: &[(&str, String)], temps: &[&str])`. The latter writes the camelCase JSON `{ "appId", "newGids", "temps" }` from design point 1. Model both on `journal_path` and `write_journal`.

    The pause test must restore the d1 reply after the hang. Read `setup()` to see how chunk replies are scripted. If the original 200 reply is not reachable from the test, add a minimal accessor on FakeCdn in fake_cdn.rs that returns a clone of the current script queue for a target, e.g. `pub fn replies(&self, target: &str) -> Vec<Reply>`. Snapshot it, then script `[Reply::Hang, original]`. Reply needs `Clone`, which it already uses.

    Get b/c new contents and sizes from the `new` FixtureCase returned by `round_trip_cases`. Read fixture_builder.rs for the field names. Write all tests listed in <behavior>. Run them: the new reuse, keep and clean tests must FAIL against current delta.rs. That is RED. Existing tests must still compile.

    Commit with ONLY these paths staged, via explicit `git add <path>`. Never use `git add -A` or `.`: the tree carries many unrelated dirty files. The commit message is `test(quick-261114-gki): failing tests for kept verified temps on pause`.
  </action>
  <verify>
    <automated>cd src-tauri && cargo test -p gamelib-depot --test delta_resume --test delta --no-run && (cargo test -p gamelib-depot --test delta_resume 2>&1 | grep -E "pause_keeps_verified_temps_and_resume_skips_them|resume_rebuilds_mismatched_temps" | grep -q FAILED)</automated>
    <automated>cd src-tauri && cargo fmt -p gamelib-depot -- --check</automated>
    Formatter note per gamelib-conventions: every path this task writes is a `.rs` file. `npx prettier --file-info` reports `inferredParser: null` for them, so prettier has no parser for Rust and a `--check` would prove nothing. The prettier check is omitted; `cargo fmt --check` is the formatter gate.
  </verify>
  <done>The new tests compile, and at least the pause/resume and mismatch tests fail on current delta.rs. The helpers exist. The commit contains only the test and support files.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — temp ledger, reuse pass, verified tracking and cancel/error split in delta.rs</name>
  <files>src-tauri/crates/gamelib-depot/src/delta.rs</files>
  <behavior>
    - All Task 1 tests pass, plus every pre-existing gamelib-depot test.
  </behavior>
  <action>
    Implement design points 1-5 of <design_settled> exactly, in this order.

    (a) Add a `TempLedger` struct next to `Journal`, with `well_formed` and `matches`. Add `temp_ledger_path(spec, app_id)`, `read_temp_ledger(path) -> LedgerState` (Absent / Valid(TempLedger) / Untrusted, where Untrusted covers both unreadable and malformed), `write_temp_ledger(job, names, path)` (atomic, `.{appId}.temps.tmp`), and `discard_temp_ledger(spec, app_id, root)`. Resolve names only through `resolve_contained_path`, and remove only `*.gamelib-delta-tmp` paths.

    (b) In the two `*fallback = true` early returns, call `discard_temp_ledger` first (design point 5).

    (c) Replace the "never reused" block at ~1299-1313 with the reuse pass (design point 3). It produces `prebuilt: Vec<bool>` aligned with `works`. Update the doc comment there and the module doc at the top of delta.rs (line ~11 says a cancel leaves the old build launchable, which is still true). Add one sentence saying verified temps survive a cancel for the next run of the same target.

    (d) The plan pass `wanted` and the build pool iterate only non-prebuilt works. The pool future returns `(i, Result)`. Collect a `verified: Vec<bool>` initialised from `prebuilt`. Seed `counters.done_bytes` and `files_done` with prebuilt totals before the pool, emit one progress snapshot, and emit the "resuming paused update" warn when any are prebuilt (design point 4).

    (e) Split the pre-commit cleanup branch into the cancel and error arms (design point 2), and drop the duplicate deletion. In the cancel arm, an empty kept set removes the ledger rather than writing an empty one. Do the ledger write in `spawn_blocking`. If the write fails, delete the kept temps too, because an unrecorded temp would be swept as untrusted next run anyway, and emit a warn. It is not a failure, since the outcome is already Cancelled.

    (f) Remove the ledger immediately before `run_commit`.

    Keep every existing behaviour not named here byte-for-byte: the journal, finalize_interrupted, status mapping and the outcome fields. `Counters` lives in download.rs. Do not change its definition; only seed its atomics.

    Capture the clippy warning count for the crate's touched files BEFORE editing (see verify) so the after-count can be compared. Commit only delta.rs, via explicit `git add`. The commit message is `fix(quick-261114-gki): keep SHA-verified temps when a bridge update is paused`.
  </action>
  <verify>
    <automated>cd src-tauri && cargo test -p gamelib-depot</automated>
    <automated>cd src-tauri && cargo fmt -p gamelib-depot -- --check</automated>
    <automated>cd src-tauri && cargo +1.99.1 clippy -p gamelib-depot --all-targets --message-format=short 2>&1 | grep -E "(src/delta\.rs|tests/delta|tests/support/delta_env|tests/support/fake_cdn)" | grep -c "warning" ; echo "after-count must be <= the before-count captured prior to editing (CI runs the workspace clippy ratchet, shrink-only)"</automated>
    Formatter note per gamelib-conventions: the only written path is a `.rs` file. Prettier infers no parser for it (`--file-info` gives `inferredParser: null`), so the prettier check is omitted as vacuous. `cargo fmt --check` covers formatting.
  </verify>
  <done>`cargo test -p gamelib-depot` is fully green, including the Task 1 tests. fmt is clean. There are no new clippy warnings in the touched files. Grepping delta.rs shows `TempLedger`, `temps.json` and `resuming paused update`, and the "never reused" comment is gone.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo</name>
  <files>.planning/todos/pending/2026-11-13-bridge-update-resume-keeps-verified-temps.md, .planning/todos/completed/2026-11-13-bridge-update-resume-keeps-verified-temps.md</files>
  <action>
    Run `git mv` to move the todo from `.planning/todos/pending/` to `.planning/todos/completed/`. Leave its frontmatter as is, including the three triage keys.

    Append a `## Resolution` section in the style of the other completed todos, e.g. `2026-11-13-bridge-update-hero-planning-label.md`. It should cover:
    - quick task 261114-gki with the Task 1 and Task 2 commit hashes;
    - the ledger file path and its target-GID key;
    - the reuse rule (size and re-hash against the new manifest);
    - the cleanup rules: error deletes all, a target change or fallback starts clean;
    - how a resume shows in the log (the "resuming paused update: reusing N verified files" warning line) and in progress (seeded doneBytes and filesDone).

    State plainly that the operator has NOT yet live-verified a pause and resume on a real bridge update. Coverage so far is the crate integration tests.

    Stage only the two todo paths, then commit with `docs(quick-261114-gki): close bridge-update verified-temps todo`.
  </action>
  <verify>
    <automated>test ! -e .planning/todos/pending/2026-11-13-bridge-update-resume-keeps-verified-temps.md && grep -q "## Resolution" .planning/todos/completed/2026-11-13-bridge-update-resume-keeps-verified-temps.md && head -8 .planning/todos/completed/2026-11-13-bridge-update-resume-keeps-verified-temps.md | grep -E "^(severity|platform|ready):" | wc -l | grep -q 3 && pnpm planning-gates</automated>
    Formatter note per gamelib-conventions: `npx prettier --file-info` reports `{ "ignored": true, "inferredParser": null }` for the completed-todo path, because `.planning/` is prettier-ignored. A `--check` would be vacuous, so it is omitted.
  </verify>
  <done>The todo is in completed/ with a Resolution section and intact triage frontmatter. `pnpm planning-gates` passes. Only the todo paths are in the commit.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| on-disk ledger → delta_body | `{steamapps}/gamelib-delta/{appId}.temps.json` persists across runs. It could be stale, corrupted or planted. |
| kept temp bytes → commit rename | A temp from an earlier run is renamed over a game file. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gki-01 | Tampering | reuse pass | mitigate | A kept temp is reused only when its metadata length equals `file.size` AND `sha1_file` equals the NEW manifest's `sha_content`. Anything else is deleted and rebuilt. The ledger is a hint for reuse and cleanup, never proof of correctness. |
| T-gki-02 | Tampering / Elevation | ledger-driven deletion | mitigate | Ledger names are resolved only via `resolve_contained_path(&root, name)` with `DELTA_TMP_SUFFIX` appended, and only `*.gamelib-delta-tmp` paths are removed. `deny_unknown_fields` plus `well_formed` (all-numeric ids) mean a planted or malformed ledger is untrusted, which means "start clean". |
| T-gki-03 | Tampering | target build change | mitigate | Reuse is gated on `ledger.newGids == job depots' manifest_id`. On a mismatch every ledger-named and work temp is swept before the build. |
| T-gki-04 | Denial of Service | disk space | accept | Kept temps occupy space until the next run for that app reuses or sweeps them, or the game is uninstalled. That is at most one delta's worth, which already had to fit for the paused run. |
</threat_model>

<verification>
- `cd src-tauri && cargo test -p gamelib-depot` is fully green.
- `cargo fmt -p gamelib-depot -- --check` is clean. There are no new clippy warnings in the touched files (`cargo +1.99.1 clippy -p gamelib-depot --all-targets`).
- `git log -3 --stat` shows three commits touching only the files in `files_modified`.
</verification>

<success_criteria>
- Pause, then resume of the same target build fetches no chunk for files whose verified temps were kept. Progress starts at the reused bytes, and a log warning reports the reuse. (Test: `pause_keeps_verified_temps_and_resume_skips_them`)
- A tampered or truncated temp is rebuilt. (`resume_rebuilds_mismatched_temps`)
- A changed target, or a fallback, starts clean. (`changed_target_starts_clean`, `stale_journal_falls_back`)
- An error deletes everything. (`error_deletes_all_temps`)
- The todo is closed in completed/.
</success_criteria>

<output>
Create `.planning/quick/261114-gki-keep-sha-verified-temps-when-a-bridge-up/261114-gki-SUMMARY.md` when done
</output>
