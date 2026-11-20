---
phase: quick-261114-lsl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/crates/gamelib-depot/src/manifest.rs
  - src-tauri/crates/gamelib-depot/src/download.rs
  - src-tauri/crates/gamelib-depot/tests/manifest.rs
  - src-tauri/crates/gamelib-depot/tests/delta.rs
  - .planning/todos/pending/2026-11-13-manifest-store-prune-has-no-caller.md
  - .planning/todos/completed/2026-11-13-manifest-store-prune-has-no-caller.md
autonomous: true
requirements: [TODO-2026-11-13-manifest-store-prune-has-no-caller]

must_haves:
  truths:
    - "After a successful install or update job, the manifest cache dir of every job depot is pruned: superseded GIDs are deleted"
    - "A GID named in InstalledDepots of ANY appmanifest in any steamapps dir GameLib has finalized into is never deleted (cross-app protection)"
    - "A prune failure (unreadable ACF, IO error) never changes a Completed outcome; it is logged as a depot warning event"
    - "After several updates of one game the depot cache dir holds only the installed GID(s) plus at most one other (prune's existing KEEP_GIDS newest-other slot), never the older builds"
    - "Cancelled, errored, verify_only, select_files and no-finalize (shared redist) jobs never prune"
  artifacts:
    - path: "src-tauri/crates/gamelib-depot/src/manifest.rs"
      provides: "prune_after_install(cache_dir, job) and the steamapps-dir registry"
      contains: "pub fn prune_after_install"
    - path: "src-tauri/crates/gamelib-depot/src/download.rs"
      provides: "production caller in run_install"
      contains: "prune_after_install"
    - path: "src-tauri/crates/gamelib-depot/tests/manifest.rs"
      provides: "several-updates and cross-app protection tests"
      contains: "prune_after_install_several_updates"
    - path: "src-tauri/crates/gamelib-depot/tests/delta.rs"
      provides: "end-to-end proof through run_job"
      contains: "delta_prunes_superseded_manifests"
  key_links:
    - from: "src-tauri/crates/gamelib-depot/src/download.rs run_install"
      to: "manifest::prune_after_install"
      via: "spawn_blocking after run_install_inner returns Completed, before emitter.close()"
      pattern: "prune_after_install"
    - from: "manifest::prune_after_install"
      to: "gamelib_steamfiles::library::scan_acfs"
      via: "protected set = every InstalledDepots manifest across registered steamapps dirs"
      pattern: "scan_acfs"
---

<objective>
Give `ManifestStore::prune` a production caller so the shell's manifest cache
(`<app_data_dir>/depot-manifests/<depotId>/<gid>.manifest`) stops growing without bound
(74-REVIEW IN-01, todo `2026-11-13-manifest-store-prune-has-no-caller.md`).

Purpose: every update fetches a new manifest (and the delta path also loads the old one); today
nothing ever deletes them.
Output: `manifest::prune_after_install`, its call in `download::run_install`, Rust tests, the todo
moved to completed with a resolution note.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-11-13-manifest-store-prune-has-no-caller.md
@src-tauri/crates/gamelib-depot/src/manifest.rs
@src-tauri/crates/gamelib-depot/tests/delta.rs

## Findings that fix the design (planner, from the code)

- Production entry: shell `src-tauri/src/depot_dispatch.rs` `rpc_depot_job_run` builds
  `JobContext { cache_dir: manifest_cache_dir(app)? }` (ONE global dir `<app_data_dir>/depot-manifests`,
  shared by every app and every Steam library) and calls `gamelib_depot::dispatch` -> `lib.rs run_job`
  -> `download::run_install` (download.rs:801). `run_install` wraps `run_install_inner`, which routes
  delta jobs to `delta::run_delta` and RECURSES for the D-14 file fallback — so the hook belongs in the
  outer `run_install`, once per job, not in `run_install_inner` or `run_delta`.
- The other `ManifestStore::new` sites (`lib.rs run_summary`, `depot_finalize`) are not install
  completions; do not prune there.
- `ManifestStore::prune(depot_id, keep_gid, protected)` (manifest.rs:550) keeps `keep_gid`, every
  numeric protected GID, plus the newest other GID by mtime (`KEEP_GIDS = 2`); its contract is
  locked by `tests/manifest.rs` `prune_keeps_two_gids` and `prune_keeps_protected_gid`. Do NOT change
  its signature or semantics. Consequence (state it in the resolution note): after updates the depot
  dir holds the installed GID(s) plus at most one other, a fixed bound, not growth.
- The depot crate cannot see which games are installed globally. TS knows every library
  (`getSteamLibraries` + bridge-bottle steamapps, `library/installedMap.ts`), but plumbing that
  through the job wire is a TS+wire change this quick task does not need: the cache only ever
  receives manifests from GameLib's own jobs, and every GameLib install finalizes into
  `job.finalize.steamapps_dir`. So the crate keeps its own registry of steamapps dirs it has
  finalized into and protects every GID named by any ACF in them (covers other apps, other
  libraries, CrossOver bottle steamapps, custom locations).
- Reusable readers (gamelib-depot already depends on gamelib-steamfiles):
  `gamelib_steamfiles::library::scan_acfs(&[String]) -> ScanResult { records: Vec<ScannedAcf>, skipped: Vec<SkippedAcf>, missing_dirs: Vec<String> }`;
  `ScannedAcf.record.installed_depots: Vec<AcfDepot { depot_id, manifest, size, dlc_app_id }>`.
  A garbage ACF lands in `skipped` with reason "no AppState" (or a parse error); a dir over the
  entry cap adds a `skipped` entry with reason "too-many-entries".
- Logging: the crate has no logger. Warnings go through `ProgressEmitter::warn(msg)` (events.rs:272),
  which TS logs via `logWarning('[depot-rust] ...')` (progressBridge.ts:67). `warn` is a no-op after
  `close()`, so warn BEFORE `emitter.close()`.
- `DepotJob` fields used: `mode: JobMode` (`JobMode::Install`), `depots: Vec<DepotRef { depot_id, manifest_id, .. }>`,
  `finalize: Option<FinalizeSpec { steamapps_dir: String, .. }>`. `Outcome { status: Status, acf: Option<AcfResult>, .. }`,
  `Status::{Completed, Cancelled, Error}`.
- Existing helpers in manifest.rs to reuse: `is_numeric_id`, `ensure_dir` (0700), `TMP_SEQ` (atomic
  temp naming as in `write_atomic`).
- Prettier: `npx prettier --file-info src-tauri/crates/gamelib-depot/src/manifest.rs` reports
  `{ "ignored": false, "inferredParser": null }` — prettier has no Rust parser, so `--check` on the
  `.rs` paths proves nothing; `cargo fmt --check` is the formatter gate for them. The `.planning`
  todo paths report `"ignored": true`. Per the gamelib-conventions `<verify>` rule, every path this
  plan writes is outside prettier's reach, so the prettier check is deliberately omitted (not
  forgotten) and each task says so.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: prune_after_install with a steamapps-dir registry and ACF-derived protected set</name>
  <files>src-tauri/crates/gamelib-depot/src/manifest.rs, src-tauri/crates/gamelib-depot/tests/manifest.rs</files>
  <behavior>
    - prune_after_install_several_updates: one steamapps dir A with `appmanifest_570.acf`; for builds GID 101,102,103,104 in turn: write `<cache>/10/<gid>.manifest` (set_modified to strictly increasing times, older for earlier builds), rewrite the ACF so InstalledDepots names depot 10 manifest <gid>, call prune_after_install with a job whose depot 10 manifestId is <gid> and finalize.steamappsDir = A. After the 4th call the depot dir's `.manifest` names are exactly {103, 104} (installed + prune's one newest-other slot); 101 and 102 are gone. After every call the count is <= 2.
    - prune_after_install_protects_other_apps_gids: dir B holds `appmanifest_900.acf` naming depot 10 manifest 50; first call prune_after_install for an app-900 job finalized into B (registers B); then seed 50.manifest with the OLDEST mtime plus 60,61,62 and run app-570 updates into dir A as above. 50.manifest survives every call (it is protected by B's ACF even though no app-570 job ever mentions B).
    - prune_after_install_skips_on_unreadable_acf: a garbage `appmanifest_1.acf` ("not vdf") in the job's steamapps dir -> returns Err, every seeded `.manifest` file is still present.
    - prune_after_install_drops_missing_dirs: registry contains a dir that no longer exists -> prune still runs and the rewritten `steamapps-dirs.json` no longer lists it.
    - non-install / no-finalize: a job with `finalize: null` (or mode verify_only) -> returns Ok(0) and deletes nothing.
  </behavior>
  <action>
In manifest.rs add `pub fn prune_after_install(cache_dir: &Path, job: &DepotJob) -> Result<usize, String>` (returns the number of files removed; import `crate::job::{DepotJob, JobMode}` and `gamelib_steamfiles::library::scan_acfs`). It is synchronous filesystem work; the caller runs it on the blocking pool.

Behaviour, in order:
1. Gate: return Ok(0) unless `job.mode == JobMode::Install` and `job.finalize` is Some.
2. Serialize the whole body with a process-wide `static PRUNE_LOCK: Mutex<()>` (poison-tolerant via `unwrap_or_else(|e| e.into_inner())`) so two jobs finishing together cannot lose each other's registry entry or prune against a half-written registry.
3. Registry: file `<cache_dir>/steamapps-dirs.json`, a JSON array of strings. Load it; any read/parse failure or non-array means an empty list (do not error — the job's own dir is always added). Keep only entries that are absolute paths and at most 4096 bytes. Append `finalize.steamapps_dir` if absolute and not already present (exact string compare), dedupe, and cap at 64 entries keeping the most recently appended. Name the constants (e.g. `REGISTRY_FILE`, `MAX_REGISTRY_DIRS`).
4. `scan_acfs(&dirs)`. If `skipped` is non-empty, return Err with a short message naming the count and first reason (no paths beyond the file name; never keys) WITHOUT deleting anything — an unreadable ACF might name a GID we would otherwise delete; failing closed only costs cache size.
5. Rewrite the registry without the scan's `missing_dirs` (an uninstalled library stops being consulted). Write it atomically: `ensure_dir(cache_dir)`, write a `.tmp-<pid>-<TMP_SEQ>` sibling, rename over; remove the temp on rename failure. A registry write failure is returned as Err AFTER pruning (still prune — protection for this run was computed from the in-memory list).
6. Build `protected: HashMap<String, Vec<String>>` depot_id -> every `installed_depots[].manifest` across all scanned records (any StateFlags — a partly installed or 1026 mixed tree still needs its GIDs).
7. For each `job.depots` entry with numeric depot_id and manifest_id: count the `.manifest` files before, call the existing `ManifestStore::prune` logic with keep_gid = manifest_id and protected = that depot's list, count after, sum the removals. Because `prune` is a `&self` method needing a Fetcher, refactor its body into a free fn `prune_dir(cache_dir: &Path, depot_id: &str, keep_gid: &str, protected: &[&str])` and make `ManifestStore::prune` delegate to it (signature and behaviour unchanged; the two existing prune tests must stay green untouched). Retired depots are not pruned (their dir is already bounded by the slot rule and nothing new lands there).

Doc-comment the fn: what it protects, that it fails closed on an unreadable ACF, and that the cache stays bounded at installed GIDs + one newest other per depot.

Tests (in tests/manifest.rs, following the existing `prune_keeps_protected_gid` style with `tempfile` and `File::set_modified`): build jobs via `serde_json::from_value::<gamelib_depot::job::DepotJob>(json!({...}))` with the full required shape (jobId, mode "install", appId, installRoot, depots with depotId/manifestId/requestCode null/key = 64 hex chars/ownerAppId/fromManifest null, hosts [], selectPaths null, finalize { steamappsDir, installdir, name, buildid, lastOwner, allowFullOwnership }, limits null). Write ACFs as minimal Valve text: `"AppState"` block with `"appid"`, `"StateFlags" "4"`, and `"InstalledDepots" { "10" { "manifest" "<gid>" "size" "1" } }`. Write the behaviours above first and watch them fail (RED), then implement (GREEN).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/src-tauri && cargo test -p gamelib-depot --test manifest prune && cargo fmt -p gamelib-depot -- --check && cargo clippy -p gamelib-depot --all-targets -- -D warnings</automated>
    Prettier: omitted by design — both paths are `.rs`; `npx prettier --file-info` reports `"inferredParser": null` (no Rust parser), so a `--check` would prove nothing. `cargo fmt --check` above is the formatter gate.
  </verify>
  <done>All five new tests plus `prune_keeps_two_gids` and `prune_keeps_protected_gid` pass; fmt and clippy clean; `ManifestStore::prune` signature unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Call prune from run_install, prove it end-to-end, close the todo</name>
  <files>src-tauri/crates/gamelib-depot/src/download.rs, src-tauri/crates/gamelib-depot/tests/delta.rs, .planning/todos/pending/2026-11-13-manifest-store-prune-has-no-caller.md, .planning/todos/completed/2026-11-13-manifest-store-prune-has-no-caller.md</files>
  <behavior>
    - delta_prunes_superseded_manifests: using the existing `round_trip_cases` + `setup` harness, pre-seed `<dir>/cache/<depot>/1.manifest`, `2.manifest`, `3.manifest` (bytes "x", mtimes 1000s in the past; assert first that 1/2/3 differ from the fixture's old and new GIDs). Run the delta job. Outcome is Completed, and for each new depot the cache dir's `.manifest` names are exactly {new gid, old gid} — the stale 1/2/3 are gone.
    - delta_prune_failure_keeps_completed_outcome: same setup plus a garbage `appmanifest_999.acf` written into `env.steamapps()` before the run. Outcome is still Completed, the ACF for the app is written (StateFlags 4), 1/2/3.manifest are all still present, and `env.host.emits` holds a `JobEventBody::Warning` whose message starts with "manifest cache prune skipped".
  </behavior>
  <action>
In download.rs `run_install` (line ~801), after `let out = run_install_inner(...).await;` and BEFORE `emitter.close()`: if `out.status == Status::Completed && out.acf.is_some()` (the job finalized its ACF; prune_after_install itself re-checks mode Install and finalize Some), run `crate::manifest::prune_after_install(&cache_dir, &job_clone)` inside `tokio::task::spawn_blocking` (clone `jctx.cache_dir` and the job; the prune walks dirs and parses ACFs, which must not block the 2 async workers). On `Ok(_)` do nothing. On `Err(msg)` or a JoinError call `emitter.warn(format!("manifest cache prune skipped: {msg}"))`. Never alter `out` — a prune failure must not fail a successful install or update (constraint; todo "log and continue"). Cancelled/Error outcomes, verify_only and select_files jobs skip it. Hook in the outer `run_install` only — `run_install_inner` recurses for the D-14 file fallback and must not prune twice.

Add the two tests above to tests/delta.rs next to `delta_round_trip`, reusing `Env` (`env.dir.path().join("cache")` is the job's cache_dir, `env.steamapps()`, `env.new_depots`, `env.old_gid(d)`, `env.host.emits`). Write them first and confirm the first fails on unmodified run_install (RED), then wire (GREEN). Run the whole delta, delta_fallback, delta_resume and job_install suites to confirm no regression.

Then close the todo: `git mv .planning/todos/pending/2026-11-13-manifest-store-prune-has-no-caller.md .planning/todos/completed/` and append a `## Resolution` section in the style of the recently closed orphan-journal todo (short paragraphs: Rule / Protected set / Bound / Coverage / "Not live-verified."). It must say: prune runs in `download::run_install` after a Completed install or update that wrote its ACF; protected = every InstalledDepots GID in every appmanifest across steamapps dirs GameLib has finalized into (registry `<cache>/steamapps-dirs.json`, missing dirs dropped); fails closed (no deletion, warning logged) when any ACF there is unreadable; failure never changes the outcome; the bound is installed GID(s) + one newest other per depot (prune's KEEP_GIDS slot, unchanged), so after several updates older builds are gone; known gaps — a library GameLib never finalized into is not consulted (cost if it bit: one manifest refetch, or the D-14 file fallback), and retired depots' dirs are not pruned; tests named in both files. Hand-match the existing todo's wrap (the file is prettier-ignored).

Finally run `graphify update .` from the repo root (CLAUDE.md: after modifying code).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/src-tauri && cargo test -p gamelib-depot && cargo fmt -p gamelib-depot -- --check && cargo clippy -p gamelib-depot --all-targets -- -D warnings && test -f ../.planning/todos/completed/2026-11-13-manifest-store-prune-has-no-caller.md && test ! -f ../.planning/todos/pending/2026-11-13-manifest-store-prune-has-no-caller.md && grep -q '^## Resolution' ../.planning/todos/completed/2026-11-13-manifest-store-prune-has-no-caller.md && cd .. && pnpm planning-gates</automated>
    Prettier: omitted by design — the `.rs` paths have no prettier parser (`"inferredParser": null`; `cargo fmt --check` is their gate) and both todo paths sit under `.planning`, which `npx prettier --file-info` reports as `"ignored": true`, so a `--check` would be a vacuous green.
  </verify>
  <done>run_install prunes after a Completed job with an ACF and logs (never fails) on prune error; both new delta tests and the full gamelib-depot suite pass; todo lives in completed/ with a Resolution section; planning-gates green; graph updated.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| on-disk ACFs / registry -> prune | ACF contents and `steamapps-dirs.json` are files another process (Steam, the user) can write; their values become path components and deletion decisions |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-lsl-01 | Tampering | prune_dir path building | mitigate | depot_id/keep_gid must pass `is_numeric_id`; ACF-derived protected GIDs are only compared, never joined into a path; prune only deletes `<numeric>.manifest` names inside `<cache>/<numeric depot>` |
| T-lsl-02 | Tampering | steamapps-dirs.json | mitigate | non-array / non-string / relative / >4096-byte entries dropped; capped at 64; atomic tmp+rename write |
| T-lsl-03 | Denial of Service | deleting a manifest another installed app needs | mitigate | protected set from every ACF in every registered dir; fail closed (no deletion) on any unreadable ACF; worst case is a refetch or the D-14 file fallback, never data loss in an install tree |
| T-lsl-04 | Denial of Service | prune error turning a good install into a failure | mitigate | outcome is never modified; errors and JoinErrors become a warning event only |
| T-lsl-05 | Information Disclosure | warning message | mitigate | message carries a count and reason only; no keys, tokens or request codes |
</threat_model>

<verification>
- `cargo test -p gamelib-depot` green (includes new manifest.rs and delta.rs tests and the untouched prune contract tests).
- `cargo fmt --check` and `cargo clippy -D warnings` clean for gamelib-depot.
- `grep -n prune_after_install src-tauri/crates/gamelib-depot/src/download.rs` shows exactly one call, inside `run_install` (not `run_install_inner`).
- Todo moved to completed with a Resolution section; `pnpm planning-gates` green.
</verification>

<success_criteria>
The manifest cache is pruned after every successful install/update; after several updates of one game the depot dir holds only the installed manifest(s) plus prune's one newest-other slot; GIDs installed by any other app in any GameLib-finalized library survive; a prune failure never fails the job.
</success_criteria>

<output>
Create `.planning/quick/261114-lsl-call-manifeststore-prune-from-production/261114-lsl-SUMMARY.md` when done
</output>
