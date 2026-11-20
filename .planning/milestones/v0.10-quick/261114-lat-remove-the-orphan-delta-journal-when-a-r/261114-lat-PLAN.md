---
phase: quick-261114-lat
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/crates/gamelib-depot/Cargo.toml
  - src-tauri/crates/gamelib-depot/src/lib.rs
  - src-tauri/crates/gamelib-depot/src/test_hooks.rs
  - src-tauri/crates/gamelib-depot/src/delta.rs
  - src-tauri/crates/gamelib-depot/tests/support/delta_env.rs
  - src-tauri/crates/gamelib-depot/tests/delta_resume.rs
  - .planning/todos/pending/2026-11-13-orphan-delta-journal-after-cancel.md
  - .planning/todos/completed/2026-11-13-orphan-delta-journal-after-cancel.md
autonomous: true
requirements: [IN-02-orphan-journal]

must_haves:
  truths:
    - "A delta run cancelled after it wrote its commit journal, but before any rename, leaves no journal at <steamapps>/gamelib-delta/<appId>.json"
    - "The next run of the same build after such a cancel is a plain Chunk delta (mode Chunk, not CommitResume). It does not run the resume hash pass, and it reuses the paused run's verified temps (WR-03)"
    - "The next run of a newer build after such a cancel is a Chunk delta, not FileFallback"
    - "A cancelled commit-resume run (one that started with a matching journal) still keeps its journal, and a retry still finishes the commit"
    - "The WR-03 pause and resume path (pause_keeps_verified_temps_and_resume_skips_them) stays green"
  artifacts:
    - path: "src-tauri/crates/gamelib-depot/src/delta.rs"
      provides: "Abort branch removes a journal this run wrote when the run was not resuming"
      contains: "wrote_journal"
    - path: "src-tauri/crates/gamelib-depot/src/test_hooks.rs"
      provides: "Deterministic cancel-after-journal-write seam, compiled only with feature test-hooks"
      contains: "cancel_after_journal_write"
    - path: "src-tauri/crates/gamelib-depot/tests/delta_resume.rs"
      provides: "Orphan-journal regression tests"
      contains: "cancel_after_journal_write"
  key_links:
    - from: "src-tauri/crates/gamelib-depot/src/delta.rs (journal write)"
      to: "test_hooks::after_journal_write"
      via: "#[cfg(feature = \"test-hooks\")] call right after write_journal returns Ok"
      pattern: "after_journal_write"
    - from: "src-tauri/crates/gamelib-depot/Cargo.toml [dev-dependencies]"
      to: "feature test-hooks"
      via: "self dev-dependency so cargo test -p gamelib-depot enables the hook with no extra flags"
      pattern: "test-hooks"
---

<objective>
Close 74-REVIEW IN-02. A delta run that is cancelled after it writes the commit journal, but
before the first rename, leaves an orphan journal. The next run of the same build treats the
orphan as a commit-resume and SHA-1-hashes every work file. The next run of a newer build reads
it as Stale and forces the whole-install file fallback.

Chosen fix (option a): the abort branch removes the journal when THIS run wrote it and the run
was not resuming. At that point no rename has happened, so the tree is still the old build and
the journal describes nothing.

Option (b), keying resume on the target build, is rejected. The journal is already keyed on the
target: `Journal::matches` compares `new_gids` and `old_gids`. The Stale-for-another-build path
exists for a real reason. A journal for a different build can be a genuine mid-commit kill, which
leaves a mixed tree, and only a file reconcile is safe for that. Discarding such a journal would
be unsafe.

WR-03 does not conflict with option (a). Its pause state lives in the separate, target-keyed
ledger `{appId}.temps.json`, not in the journal. No journal is ever intentionally kept on pause.

Back-compat: the journal format is unchanged, so no new key and no migration. An orphan already
on a user's disk is still treated conservatively. It costs one resume hash pass (same build) or
one fallback (other build), and the run then removes it. On disk it cannot be told apart from a
genuine interrupted commit.

Purpose: a pause during the brief window around the journal write must not turn the next update
into a full rehash or a whole-install reconcile.

Output: the delta.rs fix, a feature-gated test seam, three regression tests, and the todo moved
to completed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-11-13-orphan-delta-journal-after-cancel.md
@.planning/todos/completed/2026-11-13-bridge-update-resume-keeps-verified-temps.md
@src-tauri/crates/gamelib-depot/src/delta.rs
@src-tauri/crates/gamelib-depot/tests/delta_resume.rs
@src-tauri/crates/gamelib-depot/tests/support/delta_env.rs

Load `Skill("gamelib-conventions")` before writing any `<verify>` content. The prettier rule
applies. Every path here is either a `.rs` file, a `.toml` file (prettier has no parser for
either) or a file under the prettier-ignored `.planning/`. Confirm with `npx prettier --file-info`
and omit the check if every path comes back ignored or null-parser.

<interfaces>
Line numbers below are as of e1bef5bcf. Re-locate them with grep before editing.

src/delta.rs:
- `struct Journal { app_id, new_gids, old_gids, retired, started_at }` (~738). `Journal::matches(job)` compares app_id, new_gids and old_gids. `read_journal_state(job, path) -> JournalState { Absent, Resume, Stale }` (~815). `write_journal(job, path) -> io::Result<()>` (~827). `pub fn clear_journal(job)` (~858).
- `delta_body` (~1071):
  - `let journal_file = journal_path(spec, &job.app_id);`
  - `let resuming = match ... { Resume => true, Stale => { warn; discard_temp_ledger; *fallback = true; return Cancelled } ... }` (~1095-1105).
  - The resume hash pass is gated on `resuming` (~1363-1404).
  - Journal write (~1733-1748): `if failures.is_empty() && !cancel.is_cancelled() && unattempted == 0 { if let Some(path) = journal_file.clone() { spawn_blocking(write_journal) ; match written { Ok(Ok(())) => {}, Ok(Err(e)) => failures.push(..), Err(_) => failures.push(..) } } }`
  - Abort branch (~1752-1846): `if !failures.is_empty() || cancel.is_cancelled() || unattempted > 0 { pause = failures.is_empty(); ... keep/doomed temps; ledger spawn_blocking; ... if resuming { finalize_interrupted(...) } ... return finish(o, started); }`
  - Commit (~1849+): the ledger is removed, then `run_commit` runs. It never observes `cancel`. On success the journal is removed after `acf::finalize`.
- The orphan race: a cancel that lands between the journal-write check and the abort check sends a run that just wrote the journal into the abort branch, and the journal is left behind.

src/registry.rs: `pub fn cancel(job_id: &str) -> bool` (~85) cancels the running job's token. It is the same token `delta_body` checks, as the existing pause test proves.

tests/support/delta_env.rs:
- `case(name, gid_tag, depots)`: builds of one app share `name`, so the depot keys match, and differ only by gid.
- `round_trip_cases(name) -> (old gid_tag 1, new gid_tag 2)` on depot 940001 with files a, b, c, d.
- `setup(old, new) -> Env`: renders both builds and scripts the old and new manifests plus the NEW build's chunks on `env.cdn` under `/depot/{d}/manifest/{g}/5/123` and `/depot/{d}/chunk/{sha}`.
- `Env::job_json(job_id) -> serde_json::Value`, `Env::job`, `Env::run`, `journal_path`, `temp_ledger_path`, `write_journal`, `new_gid`, `old_gid`.
- `fixture_builder::render(case)` returns a map of rel path to bytes, with `case.json`, `manifests/{d}_{g}.bin` and `chunks/{sha}.bin`.

tests/delta_resume.rs helpers: `interrupt(env, new, renamed)` builds the mid-commit-kill state (temps for b, c and d, some renamed, plus a matching journal). Also `assert_finished`, `chunk_target(bytes)`, `new_content(new, path)`, `temp_path(env, rel)`, `piece_d1()`. `DEPOT = "940001"`.

`outcome::DeltaMode { Chunk, CommitResume, FileFallback, .. }` is read from `out.delta.as_ref().unwrap().mode`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Feature-gated cancel-after-journal-write seam plus failing orphan tests (RED)</name>
  <files>src-tauri/crates/gamelib-depot/Cargo.toml, src-tauri/crates/gamelib-depot/src/lib.rs, src-tauri/crates/gamelib-depot/src/test_hooks.rs, src-tauri/crates/gamelib-depot/src/delta.rs, src-tauri/crates/gamelib-depot/tests/support/delta_env.rs, src-tauri/crates/gamelib-depot/tests/delta_resume.rs</files>
  <behavior>
    - orphan_journal_removed_and_same_build_runs_as_chunk: arm the hook for "dr-orphan" and run the job. Expect Status::Cancelled. The journal path does not exist (FAILS before the fix). The root files and ACF bytes are unchanged from before the run. The temp ledger exists, because the WR-03 pause kept the verified b, c and d temps. Then clear the emits and run "dr-orphan-2" on the same build. Expect Completed, mode == DeltaMode::Chunk (FAILS before the fix: it is CommitResume), tree matching `new`, no journal, no ledger, no temp files. A Warning containing "reusing 3 verified files" is emitted, and the hit counts for chunk_target(piece("b3")), piece("c1n") and piece_d1() do not grow on the second run.
    - orphan_journal_does_not_force_fallback_for_newer_build: arm the hook for "dr-orphan-nb", run it (Cancelled, no journal), then serve a newer build. Use `case(name, 3, ...)` with the same file list as `new`, but d.bin rebuilt from different pieces, for example `piece("d0")` plus `synth("d2", 700)`. Run a job whose depot manifestId is the newer gid. Expect Completed and mode == DeltaMode::Chunk (FAILS before the fix: it is FileFallback), the tree matching the newer case, and no journal, ledger or temps.
    - cancelled_commit_resume_keeps_journal: call `interrupt(&env, &new, &["b.bin"])` (a genuine mid-commit kill, which writes a matching journal). Arm the hook and run. Expect Cancelled, the journal STILL present, and the ACF naming the old builds as unfinished, as finalize_interrupted writes it. Disarm (the hook is one-shot), run again, and `assert_finished` (mode CommitResume, committed, journal removed). This PASSES both before and after the fix and guards the resuming arm.
  </behavior>
  <action>
Add the test seam:

1. Cargo.toml:
   - Add `[features]` with `test-hooks = []`.
   - Under `[dev-dependencies]`, add a self dev-dependency `gamelib-depot = { path = ".", features = ["test-hooks"] }`. With it, a plain `cargo test -p gamelib-depot` (the CI command in .github/workflows/rust-test.yml line 117) compiles the hook for integration tests with no extra flag, and release and shell builds never see it.
   - If cargo rejects the self dev-dependency, drop it and the feature. Instead make `test_hooks` an always-compiled `#[doc(hidden)] pub mod` whose check is a no-op unless armed. Record that deviation in the SUMMARY.

2. src/test_hooks.rs (new):
   - A `static ARMED: std::sync::Mutex<Vec<String>>` (const-constructed).
   - `pub fn cancel_after_journal_write(job_id: &str)` pushes the id.
   - `pub(crate) fn after_journal_write(job_id: &str)` removes the id if present (one-shot) and, when it was armed, calls `crate::registry::cancel(job_id)`.
   - Module doc: it exists only to land a cancel deterministically in the window between the journal write and the abort check (IN-02).
   - lib.rs gets `#[cfg(feature = "test-hooks")] #[doc(hidden)] pub mod test_hooks;`.

3. delta.rs, journal-write match: on the `Ok(Ok(()))` arm add `#[cfg(feature = "test-hooks")] crate::test_hooks::after_journal_write(&job.job_id);`. Hoist `job.job_id` out before the `job.clone()` move if needed. Change no behavior yet.

4. tests/support/delta_env.rs: add `Env::serve_build(&self, case: &FixtureCase) -> Vec<(String, String)>`, returning (depotId, gid). It renders `case` and scripts its manifests and chunks on `self.cdn` exactly the way `setup` does for the new build. Add `Env::job_for(&self, job_id, gids: &[(String, String)]) -> DepotJob`: it takes `job_json(job_id)`, overwrites each depot's `manifestId` from `gids` (the keys are unchanged because the case name is shared), and deserializes.

5. tests/delta_resume.rs: import `gamelib_depot::test_hooks` and add the three tests from `<behavior>`. Use `round_trip_cases` and `setup` like the neighbouring tests, with distinct case names `dr-orphan`, `dr-orphan-nb` and `dr-orphan-cr`. Use the existing `JobEventBody::Warning` match pattern for the reuse message.

Run the tests and confirm the first two FAIL on the journal/mode assertions and the third passes. Commit as `test(quick-261114-lat): ...`.
  </action>
  <verify>
    <automated>cd src-tauri && cargo test -p gamelib-depot --test delta_resume --no-run && (cargo test -p gamelib-depot --test delta_resume 2>&1 | grep -E "orphan_journal_removed_and_same_build_runs_as_chunk|orphan_journal_does_not_force_fallback_for_newer_build" | grep -c FAILED | grep -q 2) && cargo test -p gamelib-depot --test delta_resume cancelled_commit_resume_keeps_journal</automated>
    <automated>cd src-tauri && cargo fmt -p gamelib-depot -- --check</automated>
    Formatter note per gamelib-conventions: run `npx prettier --file-info` on Cargo.toml and one `.rs` path. Both are expected to report `inferredParser: null` (no TOML or Rust parser), so a prettier `--check` would be vacuous and is omitted. `cargo fmt --check` is the formatter gate.
  </verify>
  <done>The seam compiles under a plain `cargo test -p gamelib-depot`. The two orphan tests fail on the journal or mode assertion (not on setup). cancelled_commit_resume_keeps_journal passes. The commit is made.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Remove the orphan journal in the abort branch (GREEN)</name>
  <files>src-tauri/crates/gamelib-depot/src/delta.rs</files>
  <behavior>
    - The three Task 1 tests pass.
    - All existing gamelib-depot tests stay green, in particular pause_keeps_verified_temps_and_resume_skips_them, resume_after_kill_mid_commit*, stale_journal_falls_back and commit_failure_writes_1026.
  </behavior>
  <action>
In `delta_body` (option a, as justified in the objective):

- Declare `let mut wrote_journal = false;` before the journal-write block. Set it to true on the `Ok(Ok(()))` arm.
- In the abort branch (`if !failures.is_empty() || cancel.is_cancelled() || unattempted > 0`), when `wrote_journal && !resuming`, remove `journal_file`. Ignore the error, as the other cleanup does. Do it inside the existing ledger `spawn_blocking` closure, or in its own small blocking step before it; pass the path in by move.
- When `resuming` is true the journal predates this run and the tree may be mixed, so it must stay. This applies whether or not this run rewrote it (the rewrite is identical).
- When the journal write itself failed (`Ok(Err)`), no journal file was renamed into place, so nothing extra is needed. Do not touch that arm beyond the hook from Task 1.

Do NOT re-key or change the `Journal` format or `read_journal_state`. The Stale-for-another-build fallback stays, because it protects genuine mid-commit kills.

Update comments:
- The module doc near lines 11-12 should say a cancel before the commit leaves no journal unless the run was a commit-resume.
- The comment above the journal write, and the "Any failure or cancel before the commit" comment, should name IN-02: a cancel landing after the journal write removes the journal the run just wrote, because no rename has happened.

Before editing, capture the clippy baseline for the touched files with the command in `<verify>` (the before-count). Commit as `fix(quick-261114-lat): ...`.
  </action>
  <verify>
    <automated>cd src-tauri && cargo test -p gamelib-depot</automated>
    <automated>cd src-tauri && cargo fmt -p gamelib-depot -- --check</automated>
    <automated>cd src-tauri && cargo +1.99.1 clippy -p gamelib-depot --all-targets --message-format=short 2>&1 | grep -E "(src/delta\.rs|src/test_hooks\.rs|src/lib\.rs|tests/delta_resume|tests/support/delta_env)" | grep -c "warning" ; echo "after-count must be <= the before-count captured prior to editing (CI runs the workspace clippy ratchet, shrink-only)"</automated>
    Formatter note per gamelib-conventions: the only written path is a `.rs` file with `inferredParser: null`, so the prettier check is omitted as vacuous. `cargo fmt --check` is the formatter gate.
  </verify>
  <done>`cargo test -p gamelib-depot` is fully green, including the three new tests. fmt is clean. There are no new clippy warnings in the touched files. `grep -n wrote_journal src-tauri/crates/gamelib-depot/src/delta.rs` shows the flag set on the successful write and read in the abort branch together with `!resuming`.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo</name>
  <files>.planning/todos/pending/2026-11-13-orphan-delta-journal-after-cancel.md, .planning/todos/completed/2026-11-13-orphan-delta-journal-after-cancel.md</files>
  <action>
1. `git mv` the todo from `.planning/todos/pending/` to `.planning/todos/completed/`. This plan owns the move, not the orchestrator.
2. Keep the frontmatter as-is: `severity:`, `platform:` and `ready:` stay bare, lowercase and in order, per gamelib-conventions.
3. Append a `## Resolution` section in the style of the WR-03 completed todo. It should cover:
   - Which commits fixed it: the test commit and the fix commit, by short SHA.
   - The rule: the abort branch removes a journal the run itself wrote when it was not a commit-resume, because no rename has happened.
   - Why re-keying on the target build was rejected: the journal is already target-keyed, and a different-build journal may be a genuine mid-commit kill.
   - Back-compat: an orphan already on disk costs one conservative resume hash or fallback, then is removed.
   - The test seam: feature `test-hooks`.
   - Coverage: the three delta_resume tests.
   - Not live-verified.
4. Commit with `git add` and `git commit` on the two paths only. Do NOT use gsd-sdk commit, which sweeps every dirty `.planning` file (see memory). Use the message `docs(quick-261114-lat): close orphan delta journal todo`.
  </action>
  <verify>
    <automated>test -f .planning/todos/completed/2026-11-13-orphan-delta-journal-after-cancel.md && ! test -f .planning/todos/pending/2026-11-13-orphan-delta-journal-after-cancel.md && grep -q "^## Resolution" .planning/todos/completed/2026-11-13-orphan-delta-journal-after-cancel.md && pnpm planning-gates</automated>
    Formatter note per gamelib-conventions: `.planning/` is prettier-ignored (`--file-info` gives `ignored: true`), so a `--check` would be vacuous and is omitted.
  </verify>
  <done>The todo is in completed/ with its frontmatter intact and a Resolution section. planning-gates passes. Only the two todo paths are in the commit.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| on-disk journal -> delta_body | The journal under `<steamapps>/gamelib-delta/` steers resume or fallback and is untrusted input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-lat-01 | Tampering | delta.rs abort-branch journal removal | mitigate | Remove only the `journal_file` path this run computed and wrote (`wrote_journal && !resuming`). A pre-existing journal (resume) is never deleted, so a mixed tree keeps its fallback or resume protection. |
| T-lat-02 | Elevation | test_hooks seam | mitigate | Compiled only under feature `test-hooks`, which is enabled only by the crate's own dev-dependency. Release and shell builds do not contain it. |
| T-lat-03 | Tampering | Journal parsing | accept | Unchanged: `well_formed` and `deny_unknown_fields` already reject planted journals, and the format is not changed. |
</threat_model>

<verification>
- `cd src-tauri && cargo test -p gamelib-depot` is fully green.
- `cargo fmt -p gamelib-depot -- --check` is clean. There are no new clippy warnings in the touched files (`cargo +1.99.1 clippy -p gamelib-depot --all-targets`).
- `pnpm planning-gates` passes after the todo move.
</verification>

<success_criteria>
- Cancel, then a fresh run of the same build: mode Chunk, no resume hash pass, verified temps reused, no fallback.
- Cancel, then a run of a newer build: mode Chunk, not FileFallback.
- A cancelled commit-resume keeps its journal, and the retry finishes the commit.
- The WR-03 pause and resume test is unchanged and green.
- The todo is closed in completed/.
</success_criteria>

<output>
Create `.planning/quick/261114-lat-remove-the-orphan-delta-journal-when-a-r/261114-lat-SUMMARY.md` when done.
</output>
