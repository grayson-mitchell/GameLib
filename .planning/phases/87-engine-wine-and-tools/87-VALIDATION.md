---
phase: "87"
slug: "engine-wine-and-tools"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-23"
---

# Phase 87 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Seeded from
> `87-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7 (TS goldens, shims, gates) + `cargo test` (Rust goldens, units) |
| **Config file** | `src/backend/jest.config.js`; Rust per crate (`src-tauri/crates/gamelib-engine/`, `src-tauri/crates/gamelib-wine/`) |
| **Quick run command** | `pnpm jest src/backend/engine src/backend/tools src/backend/wine --silent` ; `cd src-tauri && cargo test -p gamelib-engine -p gamelib-wine` |
| **Full suite command** | `pnpm test:ci` ; `cd src-tauri && cargo test -p gamelib-safety -p gamelib-testutil -p gamelib-proc -p gamelib-engine -p gamelib-engine-cli -p gamelib-wine -p gamelib-wine-cli && cargo test --bin gamelib-shell` ; `pnpm check:ipc-contract` ; `pnpm planning-gates` |
| **Estimated runtime** | ~300 seconds (full); ~60 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** the touched crate's `cargo test -p <crate>` plus the touched Jest folder, and `npx prettier --check` over the exact written paths (`--file-info` first; omit over prettier-ignored paths such as `.planning`)
- **After every plan wave:** full Rust set above, `pnpm test:ci`, `pnpm codecheck`, `pnpm lint`
- **Before `/gsd-verify-work`:** full suite green, three-OS CI green, then `87-HUMAN-UAT.md` run on the signed Phase 87 build installed over a signed Phase 86 build (D-12)
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

| Req / SC | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| SVC-02 / SC1 | decision matrix, CrossOver-first, fallback to pin | Rust golden replay | `cargo test -p gamelib-engine --test golden_decision` | ✅ | ✅ green (87-58: local proof at 1e586bf8d, three-OS CI at f9f1cce2e) |
| SVC-02 / SC1 | launch step, deadline, process watch | Rust unit + golden | `cargo test -p gamelib-engine --test golden_launch` | ✅ | ✅ green (87-58: local proof at 1e586bf8d, three-OS CI at f9f1cce2e) |
| SVC-02 / SC1 | fallback download/verify/extract + events | Rust replay | `cargo test -p gamelib-engine --test golden_fallback` | ✅ | ✅ green (87-58: local proof at 1e586bf8d, three-OS CI at f9f1cce2e) |
| SVC-02 / SC1 | live healthy/fallback/adopt, expired trial | live gate (operator, signed build) | `87-HUMAN-UAT.md` items 1–2 | ❌ W0 (authored before coding) | ⬜ pending (live gate, 87-59) |
| SVC-02 / SC2 | bottle create/reuse/remove, sibling-safe, markers byte-equal, newer marker kept | Rust golden + safety table | `cargo test -p gamelib-engine --test golden_bottles` | ✅ | ✅ green (87-58: local proof at 1e586bf8d, three-OS CI at f9f1cce2e) |
| SVC-02 / SC2 | TS pure-helper twin == Rust vectors (D-24) | Jest + Rust shared JSON | `pnpm jest src/backend/enginewine/__tests__/twinVectors.test.ts` | ✅ | ✅ green (87-58: local proof at 1e586bf8d, three-OS CI at f9f1cce2e) |
| SVC-02 / SC3 | wine core, discovery, wine-manager, runtimes, winetricks, DXVK/DXMT/vkd3d goldens | Rust golden replay | `cargo test -p gamelib-wine` | ✅ | ✅ green (87-58: local proof at 1e586bf8d, three-OS CI at f9f1cce2e) |
| SVC-02 / SC3 | live tools and downloads | live gate item 4 | `87-HUMAN-UAT.md` | ❌ W0 | ⬜ pending (live gate, 87-59) |
| SVC-02 / SC4 | TS and registrations deleted; only scheduled shims/resolvers/twin remain | Jest gate | `pnpm jest src/backend/__tests__/engineWinePortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts` | ✅ | ✅ green (87-58: local proof at 1e586bf8d, three-OS CI at f9f1cce2e) |
| FND-04 | no orphan winetricks/tar/wine helper after quit | `gamelib-proc` orphan harness arm | `cargo test -p gamelib-proc` | ✅ | ✅ green (87-58: local proof at 1e586bf8d, three-OS CI at f9f1cce2e) |
| FND-06 | markers/notices/wine-downloader-info round trip, newer never overwritten, corrupt kept | Rust golden | `cargo test -p gamelib-engine --test roundtrip_state` | ✅ | ✅ green (87-58: local proof at 1e586bf8d, three-OS CI at f9f1cce2e) |
| D-14 | channel parity (OPS == constants == arms), IPC snapshot | Jest + gen | `pnpm check:ipc-contract` | ✅ | ✅ green (87-58: local proof at 1e586bf8d, three-OS CI at f9f1cce2e) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/__tests__/engineWinePortComplete.test.ts`, `engineWineShimSchedule.test.ts` (copy `infoPortComplete` / `infoShimSchedule`, with planted-fixture detector self-tests and walk floors)
- [ ] TS golden harness: spawn-trace and tree recorders, `MANIFEST.json` floors, `assertAtOrAboveFloor` (82 D-05 vacuous-pass guards)
- [ ] `tests/fixtures/{recorded,golden,state}/<slice>/` in both crates, with a redaction test
- [ ] `ProcSpec` runner (env, cwd, stdin, abort, streaming) in `gamelib-core` / `gamelib-proc`, with its orphan arm
- [ ] cross-language vector file for the bottle-path twin (D-24)
- [ ] `87-HUMAN-UAT.md` (inline `expected:`, `result:` opens with a status word) with the Structural Reachability table

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CrossOver healthy → no-CrossOver fallback → re-adopt, incl. a D3D11 title and a bridge Steam title | SVC-02 / SC1 | real CrossOver, wineserver timing, CrossOver adopting a fallback bottle | `87-HUMAN-UAT.md` item 1 (`no-crossover.sb`) |
| Expired trial routes to Staging; ≤7-day notice | SVC-02 / SC1 | trial licence read from the real HOME | `87-HUMAN-UAT.md` item 2 (`nolicence.sb`, `backdate.py`, operator approval) |
| Bottle reuse and sibling-safe removal on real bottles | SVC-02 / SC2 | real bottles written by a signed 86 build | `87-HUMAN-UAT.md` item 3 |
| Winetricks verb, DXVK/DXMT install/remove, wine-manager download with progress | SVC-02 / SC3 | real network, real winetricks | `87-HUMAN-UAT.md` item 4 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending


---

## Phase proof

Measured by plan 87-58 Task 1, 2026-11-24, from a clean `git worktree add --detach` checkout (removed afterwards) with its own
`pnpm install --frozen-lockfile`, `pnpm exec vite build`, `pnpm build:sidecar-sea` and a cold `src-tauri/target`.

**Candidate head P = `1e586bf8d82553e7cef1e036dbaac9f5be0a9f9b`** (main). It is `20fc9d890` (the 87-57 SUMMARY commit) plus one
commit, `1e586bf8d`, which touches only `src-tauri/src/engine_dispatch.rs` and `src-tauri/src/wine_dispatch.rs` (eight test lines,
`&[x.clone()]` to `std::slice::from_ref(&x)`); see "## Findings at the candidate head". Every command below was re-run at P after that
commit, so the proof is at one head.

Ancestry: 286 distinct commit hashes found in the 87-01..87-57 SUMMARYs resolve in this repo and every one is an ancestor of P
(`git merge-base --is-ancestor`, 0 exceptions). 87-01 base (`plan_head_before`): `ca6cc1d43a0f4a34a3c4914954d2181b41f685c3`.

| Step | Command (as rust-test.yml / pre-push run it) | Outcome at P |
|------|-----------------------------------------------|--------------|
| 1 | `pnpm install --frozen-lockfile` | pass |
| 2 | `pnpm exec vite build` | pass |
| 3 | `pnpm build:sidecar-sea` | pass (arm64 SEA sidecar built) |
| 4 | `cargo test -p gamelib-safety -p gamelib-testutil` | pass, 95 passed, 0 red |
| 5 | `cargo test -p gamelib-proc` (orphan harness, spec-runner arms) | pass, 47 passed, 0 red |
| 6 | `cargo test -p gamelib-scan -p gamelib-scan-cli -p gamelib-depot -p gamelib-depot-cli -p gamelib-steamfiles -p gamelib-steamfiles-cli -p gamelib-steamcm -p gamelib-steamcm-cli -p gamelib-steampoll -p gamelib-steampoll-cli -p gamelib-i18n -p gamelib-core -p gamelib-log -p gamelib-store -p gamelib-store-cli -p gamelib-info -p gamelib-info-cli -p gamelib-engine -p gamelib-engine-cli -p gamelib-wine -p gamelib-wine-cli` | pass, 2898 passed, 0 red, 7 ignored (networked/dev-vault/fixture-regen tests, none engine or wine golden) |
| 7 | static codec linkage (`cargo build -p gamelib-depot-cli`, `otool -L`, no lzma/zstd/zlib) | pass (macOS leg form) |
| 8 | `cargo test -p gamelib-engine --features testing` | pass, 338 passed, 0 red |
| 9 | `cargo test -p gamelib-wine --features testing` | pass, 326 passed, 0 red |
| 10 | `cargo test --bin gamelib-shell` | pass, 837 passed, 0 red, 2 ignored |
| 11 | darwin clippy ratchet: `cargo +1.99.1 clippy --workspace --all-targets --message-format=json` then `node meta/clippyRatchet.cjs --list` | pass, `PASS (darwin, toolchain 1.99.1)`, every lint at its ceiling (cloned_ref_to_slice_refs 2 of 2) |
| 12 | `pnpm check:ipc-contract` | pass (ipc_contract.rs and ipcSchemaSnapshot.json up to date) |
| 13 | `pnpm test` (jest, 6 projects) | pass, 1107 suites passed (6 skipped), 24246 tests passed (40 skipped), 0 red, 222 s |
| 14 | `pnpm smoke:exit-check -- --mode eof` | pass, `sidecarExitCheck [eof]: PASS (exit latency 44 ms)` |
| 15 | `pnpm smoke:sidecar` | pass, built, READY written, exited 0 on stdin EOF |
| 16 | pre-push gate set: `pnpm codecheck`, `lint`, `prettier`, `i18n` (strict update-check flag, as the hook passes it), `find-deadcode`, `boundaries`, `steam-line-ceiling`, `backend-di-ceilings`, `gameinfo-narrowing-ceiling` | all nine pass (exit 0 each) |
| 17 | `pnpm planning-gates` | pass, 12/12 |

Golden replays observed running locally (step 6 and steps 8-9 logs): gamelib-engine `golden_bottles`, `golden_config`, `golden_decision`,
`golden_demo_status`, `golden_fallback`, `golden_launch`, `golden_state`, `golden_switch`, plus `roundtrip_state` and `twin_vectors`;
gamelib-wine `golden_discovery`, `golden_dxmt`, `golden_dxvk`, `golden_runtimes`, `golden_wine_core`, `golden_wine_manager`,
`golden_winetricks`. Jest: `engineWinePortComplete`, `engineWineShimSchedule`, `engineWineFixtureRedaction`, `twinVectors`,
`fakeHomeIsolation` and `helperIntegration` all pass in the full run (the two that have been load-sensitive did not recur).

Not run here by design: `cargo check --all-targets` (Linux leg only) and the Windows/Linux legs of every step above (D-13, CI after the push).
`cargo fmt --check -p gamelib-shell` is not part of rust-test.yml and is known to differ only on the `@generated` ipc_contract.rs.

### Re-run at the final head `f9f1cce2e45ebee3712e791c6e63b6c5fb88b9fc`

The three-OS CI described under "## CI proof" forced twelve further commits (all `fix(87-58)`, test-side or Windows-only except one, see "## Findings
at the candidate head" items 3-4). The table above was measured at `1e586bf8d`; these steps were re-run at the final head, in the main working tree
(warm target) after the worktree was removed, and the full cargo and jest proof at the final head is also the CI run `45307026824`.

| Step | Outcome at `f9f1cce2e` |
|------|------------------------|
| `cargo test -p gamelib-safety -p gamelib-testutil` | pass, 95 passed, 0 red |
| `cargo test -p gamelib-proc` | pass, 47 passed, 0 red |
| `cargo test -p gamelib-engine --features testing` | pass, 338 passed, 0 red |
| `cargo test -p gamelib-wine --features testing` | pass, 326 passed, 0 red |
| `cargo test --bin gamelib-shell` | pass, 837 passed, 0 red, 2 ignored |
| darwin clippy ratchet | pass, `PASS (darwin, toolchain 1.99.1)` |
| `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm lint` | pass |
| `pnpm test` | pass, 1108 suites passed (5 skipped), 24256 tests passed (30 skipped), 0 red |
| the 21-crate multi-crate `cargo test` step | pass on all three CI legs (run `45307026824`); locally two gamelib-depot timing tests are red in this one invocation, see Findings item 5 |

## Findings at the candidate head

1. **Darwin clippy ratchet was red at `20fc9d890`** (first run, same worktree): `clippy::cloned_ref_to_slice_refs` 10 found against a
   ceiling of 2 (`FAIL: 8 new warning(s)`). Eight were Phase 87 test code: `engine_dispatch.rs` 1312, 1424, 1426, 1567, 1569, 1572 and
   `wine_dispatch.rs` 1945, 2512; the other two are the standing `single_instance.rs:686`, `:870`. Fixed in `1e586bf8d`
   (`std::slice::from_ref(&x)`, rustfmt-clean, test behaviour unchanged), no ceiling moved. The ratchet, `cargo test --bin gamelib-shell`
   and the whole list above were then re-run at `1e586bf8d`. This is the same class as Phase 86's R1.
2. **Renderer boundary (D-10), literal check not met.** See "## SC4 sweep": two Phase 87 commits touch `src/frontend`, both comment-only.
3. **Windows CI found what no macOS run could (D-13).** Pushing exposed eight classes of Windows-only reds in code that had only ever run on macOS and
   Linux; each was fixed in its own commit and re-pushed (the operator authorised CI-fix commits): the five `gamelib-engine` `lib.rs` dispatch tests with
   POSIX `/cx/bin` fixtures (`833fbb98a`, `#[cfg(unix)]`); `golden_config` and `golden_discovery`, whose headers already said "POSIX only" but lacked
   `#![cfg(unix)]` (`ec957163e`); five `gamelib-wine` unit tests with POSIX `PATH` and separator fixtures (`14527ed15`); `dxvk_incidents` (`feb5c76a7`);
   a real bug, `tools/dxvk.rs` replaced the first `~` anywhere in the wine prefix, so the 8.3 runner temp name `C:\Users\RUNNER~1\...` was rewritten
   (`9c9fd376f`, now only a leading `~`); the Windows separator fold in six wine golden suites that also folded the registry key's backslashes (`af3ff09e9`, folds
   only a string that holds a profile root); `ScriptedSpecRunner` matched programs byte-exactly across `/` and `\\` (`8042d7267`); `golden_wine_manager`, whose store text
   JSON-escapes the Windows HOME (`cbd73bc3c`, `#![cfg(unix)]`); `golden_winetricks` (`f6e71594d`); two shell tests and one shell test helper
   (`39a3b1a7c`, `87abb588a`); and an `unused_imports` the Windows clippy ratchet caught in `gamelib-proc/tests/spec_runner.rs` (`f9f1cce2e`).
   Consequence for D-13's "goldens observed running on every leg": see "## CI proof" (the gamelib-engine goldens are compiled out on Windows).
4. **Gating is a coverage trade, recorded not hidden.** On the Windows leg these binaries now compile to zero tests: every `gamelib-engine` golden
   and incident suite (gated by earlier plans, plus `golden_config` here), `gamelib-wine` `golden_discovery`, `golden_wine_manager` and `dxvk_incidents`.
   The same cases still replay on macos-latest and ubuntu-latest. `gamelib-wine` `golden_dxmt`, `golden_dxvk`, `golden_runtimes`, `golden_wine_core`
   (16 of 18) and `golden_winetricks` do run on Windows.
5. **Not Phase 87, deferred.** (a) The `Supply-chain audit` workflow (cargo-deny, RUSTSEC-2026-0594) is red on every push including `origin/main`
   `4e1af5463` before this plan pushed (run `45228612462`), so it is not caused by Phase 87. (b) `gamelib-depot` `tests/fetch.rs`
   (`a_long_outage_after_fetching_began_demotes_no_host`, `errors_before_any_success_still_demote_a_dead_host_after_a_late_start`) are 200-300 ms
   timing tests: red once on macos-latest (run `45285696051`, green on the next push), and red in the main working tree only in the 21-crate invocation
   on this Mac (pass alone, 4 of 4, and under `-p gamelib-depot`); `gamelib-depot` has no diff since the 87-01 base. Logged in `deferred-items.md`.


## SC4 sweep

All at P `1e586bf8d`, in the clean worktree unless stated.

| Check | Command | Output | Result |
|-------|---------|--------|--------|
| engineWinePortComplete describes and the schedule | `pnpm test` (full), suites `engineWinePortComplete.test.ts`, `engineWineShimSchedule.test.ts` | both PASS; survivors table agrees with SCHEDULE both ways (87-57) | pass |
| `src/backend/engine`, `src/backend/tools`, `src/backend/wine/manager` absent | `[ -e <path> ]` | all three absent | pass |
| `engineFlowRegistration.ts`, `wineToolsFlowRegistration.ts` absent | `find . -name ... -not -path ./node_modules` | no hits | pass |
| neither `GAMELIB_ENGINE` nor `GAMELIB_WINE` in `src/` or `src-tauri/src` | `grep -rIl -E 'GAMELIB_ENGINE\|GAMELIB_WINE' src src-tauri/src` | one hit, `src/backend/__tests__/engineWinePortComplete.test.ts`, the guard itself (its `FORBIDDEN_FLAGS` constant and planted-fixture self-tests); 0 hits in `src-tauri/src` and 0 in any non-guard file | pass (the only occurrence is the detector's own text, which the gate excludes from its scan) |
| DXMT wine-install gap (opened 87-20, closed 87-31) closed at P | `grep -c on_wine_installed src-tauri/crates/gamelib-wine/src/manager/install.rs`; `grep -c on_wine_uninstalled src-tauri/crates/gamelib-wine/src/manager/remove.rs`; `cargo test -p gamelib-wine --test golden_wine_manager` | 1; 1; golden_wine_manager passes (9 tests, within the 326 of step 9) | pass |
| no renderer file under `src/frontend` changed since the 87-01 base | `git diff --name-only ca6cc1d43..20fc9d890 -- src/frontend` (the P-only commit touches no frontend path) | 14 files, attributed below | literal check not met; **D-10 accepted as met by the operator, 2026-11-24** (see below) |

Attribution of the 14 `src/frontend` paths in `ca6cc1d43..P` (`git log --format='%h %s' ca6cc1d43..P -- src/frontend`, 5 commits):

- 12 paths are three commits of a different task, quick `261123-pnl` (`f968c55c1`, `275149830`, `ddb6e3db2`: GameLib Light theme chrome and
  thumbnail, `themes.scss`, `_buttons.scss`, `NavShell`, `customThemes/*`, `LibrarySignInNotice/index.scss`). They landed on main inside
  the phase's commit range and are not Phase 87 work.
- 2 paths are Phase 87, **comment-only, one line each**: `src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx` (87-37,
  `0e6b9b56d`, the pointer `backend/tools/winetricksQueue.ts` became "the Rust queue in `gamelib-wine`, `winetricks/queue.rs`") and
  `.../WinetricksSettings/visibility.ts` (87-57, `f720c6690`, `backend/engine/toolSettings.ts` became
  `resolveEngineToolSettings, backend/enginewine/toolSettings.ts`). No code, import, prop or string changed; `src/preload` has no change in range.
  The rest of the phase left the renderer alone, so D-10's behaviour ("renderer is untouched") holds, but the truth as worded (no
  `src/frontend` file in the diff) does not, because stale source-path comments were corrected in two files. Raised to the operator at the
  Task 2 checkpoint, who answered `Accept as met` (2026-11-24): D-10 is recorded as **met by operator acceptance**, on the evidence that the two
  Phase 87 edits are comment-only and the other 12 files are quick 261123-pnl, not Phase 87.

## Per-task map statuses

The ten automated rows of the Per-Task Verification Map are `✅ green at 1e586bf8d`; rows 4 and 8 (live gate items 1-2 and 4) stay
`⬜ pending (live gate, 87-59)`. Status of D-13 (three-OS CI) and D-12 (signed build) is recorded by Task 3 after the operator's decision.

## CI proof

Collected 2026-11-24 (87-58 Task 3) with `gh run list --commit <sha>` and `gh run view <id> --json jobs`; operator decision `push-and-build` (CI-fix
commits allowed without asking). Push 1 carried 337 commits (`4e1af5463..6d9f12f49`); each later push carried one fix commit. Immediately before push 1,
`git diff --name-only 1e586bf8d HEAD` listed only `.planning/phases/87-engine-wine-and-tools/87-VALIDATION.md`; before each later push it listed exactly the
one fix commit's paths (the authorised CI fix), `main..origin/main` was 0, and the pre-push hook ran every time (no `--no-verify`).

**Final head `f9f1cce2e45ebee3712e791c6e63b6c5fb88b9fc`, all green:**

| Workflow | Run | Result |
|----------|-----|--------|
| Rust test (rust-test.yml) | `45307026824` | success: `cargo-test (macos-latest)` `138153251538` success; `cargo-test (windows-latest)` `138153251909` success; `cargo-test (ubuntu-latest)` `138153252222` success |
| Code check (codecheck.yml) | `45307026828` | success |
| Test (test.yml) | `45307026813` | success |
| Lint | `45307026740` | success |
| Supply-chain audit | `45307026830` | failure, pre-existing (RUSTSEC-2026-0594 in cargo-deny; red at `4e1af5463` before this push, run `45228612462`); not one of the three required workflows, deferred |

**Golden replays per leg, from the leg logs of run `45307026824`** (tests passed in each binary, read from the leg logs, whose lines interleave on macOS; `0` means the binary compiled to no tests under `cfg(unix)`):

| Binary | macos-latest | windows-latest | ubuntu-latest |
|--------|--------------|----------------|---------------|
| gamelib-engine `golden_bottles` / `golden_decision` / `golden_fallback` / `golden_launch` / `golden_state` / `golden_switch` / `roundtrip_state` | 14 / 3 / 8 / 8 / 9 / 6 / 7 | 0 (unix-gated) | 14 / 3 / 8 / 8 / 9 / 6 / 7 |
| gamelib-engine `golden_config`, `golden_demo_status` | 7, 2 | 0, 0 (unix-gated) | 7, 2 |
| gamelib-engine `twin_vectors` | 12 | 9 | 12 |
| gamelib-wine `golden_dxmt` / `golden_dxvk` / `golden_runtimes` / `golden_winetricks` | 9 / 6 / 5 / 8 | 9 / 6 / 5 / 8 | 9 / 6 / 5 / 8 |
| gamelib-wine `golden_wine_core` | 18 | 16 | 18 |
| gamelib-wine `golden_discovery` / `golden_wine_manager` / `dxvk_incidents` | 11 / 9 / 39 | 0 / 0 / 0 (unix-gated) | 11 / 9 / 39 |

So D-13's "gamelib-engine and gamelib-wine goldens observed running on every leg" holds for **gamelib-wine on all three legs** (five golden suites plus
two-thirds of `golden_wine_core`) and for **gamelib-engine on macos-latest and ubuntu-latest only**: on windows-latest every engine golden compiles to
zero tests, as the earlier plans' `#![cfg(unix)]` decided (the bottle and CrossOver code is macOS-only) and as `golden_config` now matches. Windows runs
`twin_vectors` (9) and the engine lib tests, the wine lib tests, the shell tests (clippy ratchet `PASS (win32, toolchain 1.99.1)`, every lint at its ceiling).

**The route to green (every red, its cause and its fix):**

| Run | Head | Leg | Red | Fix commit |
|-----|------|-----|-----|-----------|
| `45279040013` | `6d9f12f49` | windows | 5 engine `lib.rs` tests: `/cx/bin` is not absolute on Windows | `833fbb98a` |
| `45281469037` | `833fbb98a` | windows | engine `golden_config`: seeded JSON with a Windows path is read as corrupt and quarantined | `ec957163e` (+ `golden_discovery`) |
| `45283302812` | `ec957163e` | windows | 5 wine lib tests (POSIX PATH, mixed separators, vulkan helper path) | `14527ed15` |
| `45285696051` | `14527ed15` | windows, macos | windows: 29 `dxvk_incidents`; macos: depot timing test (flake, green next push) | `feb5c76a7` |
| `45288136386` | `feb5c76a7` | windows | `golden_dxvk`: `~` in `RUNNER~1` rewritten by `replacen('~')` | `9c9fd376f` |
| `45290433873` | `9c9fd376f` | windows | `golden_dxvk`: separator fold also folded registry-key backslashes | `af3ff09e9` |
| `45292773551` | `af3ff09e9` | windows | `golden_wine_core`: scripted program matched byte-exactly | `8042d7267` |
| `45295513894` | `8042d7267` | windows | `golden_wine_manager`: JSON-escaped HOME in the store text | `cbd73bc3c` |
| `45297645210` | `cbd73bc3c` | windows | `golden_winetricks`: mixed-separator program | `f6e71594d` |
| `45299193209` | `f6e71594d` | windows | shell tests did not compile (`engine_with_path` is unix-only) | `39a3b1a7c` |
| `45301731253` | `39a3b1a7c` | windows | 2 shell tests (CrossOver locate, winemac scan) | `87abb588a` |
| `45303966424` | `87abb588a` | windows | clippy ratchet: one new `unused_imports` (`spec_runner.rs`) | `f9f1cce2e` |
| `45307026824` | `f9f1cce2e` | all | none: macos, windows, ubuntu all success | |

## Gap closure proof (87-68)

Measured by plan 87-68 Task 1, 2026-11-25, from a `git worktree add --detach` checkout (removed afterwards) with its own
`pnpm install --frozen-lockfile`, `pnpm exec vite build`, `pnpm build:sidecar-sea` and a cold `src-tauri/target` (the repo's `post-checkout` hook
also runs `pnpm i` and `pnpm download-helper-binaries`; the step 1 row is the explicit frozen-lockfile run on top of that). 87-58's table, copied
verbatim, with the 87-58 counts for comparison.

**Candidate head P = `4cf38d88c6009cef56b2f55193c2a5b60568077b`** (main). It is `f3a1a361d` (the post-merge conflict fix after the SUMMARYs of 87-60 to
87-67 and 87-70) plus one commit, `4cf38d88c` `fix(87-68): baseline the jest.mock sites of the 87-67 uninstall dialog bottle toggle test`, which touches only
`meta/backendDiCeilings/frontend-components-ui.json` (one entry, `bottleToggle.test.tsx` 6); see "Findings" below. Every step was re-run at P after that
commit, so the proof is at one head. The gap closure is 58 commits on top of 87-60's `plan_head_before` (`b81419c02`); the unpushed range on top of
`origin/main` (`b4ed940a4`, 87-59) is 59 commits.

Ancestry: 62 distinct commit hashes found in the 87-60..87-67 and 87-70 SUMMARYs resolve in this repo and every one is an ancestor of P
(`git merge-base --is-ancestor`, 0 exceptions).

| Step | Command (as rust-test.yml / pre-push run it) | Outcome at P (87-58 at its P) |
|------|-----------------------------------------------|-------------------------------|
| 1 | `pnpm install --frozen-lockfile` | pass |
| 2 | `pnpm exec vite build` | pass |
| 3 | `pnpm build:sidecar-sea` | pass (arm64 SEA sidecar built) |
| 4 | `cargo test -p gamelib-safety -p gamelib-testutil` | pass, 95 passed, 0 red (95) |
| 5 | `cargo test -p gamelib-proc` | pass, 47 passed, 0 red (47) |
| 6 | the 21-crate `cargo test -p gamelib-scan ... -p gamelib-wine-cli` step of rust-test.yml | pass, 2956 passed, 0 red, 7 ignored (2898, 7) |
| 7 | static codec linkage (`cargo build -p gamelib-depot-cli`, `otool -L`, no lzma/zstd/zlib) | pass (macOS leg form) |
| 8 | `cargo test -p gamelib-engine --features testing` | pass, 381 passed, 0 red (338) |
| 9 | `cargo test -p gamelib-wine --features testing` | pass, 341 passed, 0 red (326) |
| 10 | `cargo test --bin gamelib-shell` | pass, 870 passed, 0 red, 2 ignored (837, 2) |
| 11 | darwin clippy ratchet: `cargo +1.99.1 clippy --workspace --all-targets --message-format=json` then `node meta/clippyRatchet.cjs --list` | pass, `PASS (darwin, toolchain 1.99.1)` |
| 12 | `pnpm check:ipc-contract` | pass (ipc_contract.rs and ipcSchemaSnapshot.json up to date) |
| 13 | `pnpm test` (jest, 6 projects) | pass, 1109 suites passed (6 skipped), 24298 tests passed (40 skipped), 0 red, 245 s (1108 / 24256) |
| 14 | `pnpm smoke:exit-check -- --mode eof` | pass, `sidecarExitCheck [eof]: PASS (exit latency 19 ms)` |
| 15 | `pnpm smoke:sidecar` | pass, built, READY written, exited 0 on stdin EOF |
| 16 | pre-push gate set: `pnpm codecheck`, `lint`, `prettier`, `i18n --fail-on-update`, `find-deadcode`, `boundaries`, `steam-line-ceiling`, `backend-di-ceilings`, `gameinfo-narrowing-ceiling` | all nine pass (exit 0 each); lint 0 errors (828 production and 570 test warnings, the same counts as main) |
| 17 | `pnpm planning-gates` | pass, 12/12 |

The worktree was clean after the run (`git status --short` empty) and was removed with `git worktree remove`; `git worktree list` shows the main checkout and the
worktrees that existed before.

### Findings

1. **A gap plan broke a pre-push gate (87-67), Rule 1.** `pnpm backend-di-ceilings` failed at `f3a1a361d`: `src/frontend/components/UI/UninstallModal/__tests__/bottleToggle.test.tsx
   has 6 (jestMock) and no baseline entry`. 87-67's test file mocks six modules (react, react-i18next, react-router-dom, libraryState, Dialog, ToggleSwitch) in the same plain-function
   harness as `AboutDialog.test.tsx` (5) and was not baselined. Left alone the pre-push hook would have blocked the push. Fixed on main in `4cf38d88c` the way `2679311c7`
   (79-38) baselined new jest.mock suites; `pnpm backend-di-ceilings` and the two `backendDiCeilings` jest suites pass, and P moved to that commit.
2. **The first full run was invalid and was discarded (proof harness, not code).** The run set `TMPDIR` to the session scratchpad, which contains the worktree. `fakeSafetyRust.test.ts`
   "refuses to delete a path outside the OS temp dir" resolves the repo's own `src/` as inside the OS temp dir, so the fake `remove tree` performed the real delete and removed the
   worktree's whole `src/` (2618 tracked files) during `pnpm test`; everything after it was meaningless. The deletion was located with an `fs.rmSync` trace (`fakeSafetyRust.ts:241`),
   the worktree was restored with `git checkout -- src`, and every step was re-run with the default `TMPDIR` (`/var/folders/...`), where the repo is not inside the temp dir. Not caused by any gap plan
   (the test and fake date from 82-05/82-19); logged in `deferred-items.md` (the test is only safe while the checkout sits outside `os.tmpdir()`).
3. **Cold zig toolchain in a clean worktree.** `shimAbiGate`, `wireExtendedCompile` and `msvcCallbackBaseLayout` call `downloadZig()` into `.build-tools/zig` (gitignored). In a fresh worktree three suites race on one
   `zig-0.16.0.tar.xz` download and exceed their 180 s hook timeout on this network (the tarball took 3 min 53 s alone). With the pinned zig present all three pass (the final run). `phase70PassthroughCensus` failed once on
   `ENOENT meta/runTs.__probe__.cjs`, a transient file another suite writes while the census walks `meta/`; it passed on the re-run. Environment and load, none caused by a gap plan; logged in `deferred-items.md`.
4. **Pre-existing reds, recorded not fixed:** the `Supply-chain audit` workflow (cargo-deny, RUSTSEC-2026-0594) and the `gamelib-depot` `tests/fetch.rs` timing tests are as recorded under "## Findings at the candidate head" item 5 and in `deferred-items.md`; the
   depot timing tests passed in step 6 here. The known `steamLoginPollLifecycle.test.tsx` load flake did not recur.

## CI proof (gap closure)

Collected 2026-11-25 (87-68 Task 3) with `gh run list --commit <sha>`, `gh run view <id> --json jobs` and the job logs. Operator decision at the Task 2 checkpoint, recorded verbatim:
**`push-and-build`** ("Push and dispatch now; allow follow-up CI-fix commits within this plan without asking again", asked through the orchestrator's question dialog on
2026-11-24, before this plan was dispatched). `gh release list` before: 11 entries (drafts `GameLib v0.13.0`, `v0.12.0`, `v0.11.0`, `v0.10.0`, `v0.8.0` and the standing pre-releases); `origin/main`
was `b4ed940a4` (87-59) and `main` 60 commits ahead.

**Push 1** carried 60 commits (`b4ed940a4..9dda41aaa`). Immediately before it, `git diff --name-only 4cf38d88c HEAD` (P to HEAD) listed only `.planning/phases/87-engine-wine-and-tools/87-VALIDATION.md` and
`deferred-items.md`, `origin/main` was not ahead (`main..origin/main` 0), and the pre-push hook ran all nine checks (no `--no-verify`; the push output shows the hook's graphify refresh, which runs only when
every check passed).

**One CI red, one fix:** run `45447603838` at `9dda41aaa`: ubuntu-latest and macos-latest green, `cargo-test (windows-latest)` red in `cargo test --bin gamelib-shell` (833 passed, 2 failed):
`engine_log::tests::a_crate_line_written_during_an_op_reaches_gamelib_log_as_a_shell_warning` and `...a_crate_line_with_no_logger_installed_writes_nothing_and_does_not_panic` panicked
`the op answers: "engine_bottle_kill_wineserver:bad-args"` (`engine_log.rs:599`, `:645`). Cause: 87-61's two tests pass `"/cx/bin/wineserver"`, which is not an absolute path on Windows, and the op refuses a
relative `wineserverBin` before it reads the bottle name; the same class as 87-58's `/cx/bin` fixes (`833fbb98a`). Fixed in `07b194604` (`fix(87-68)`: a `cfg!(windows)` absolute path helper, the tests still run on every leg).
**Push 2** (`9dda41aaa..07b194604`): `git diff --name-only 4cf38d88c HEAD` listed exactly `src-tauri/src/engine_log.rs` (the authorised CI fix) and nothing else outside `.planning/`; `main..origin/main` was 0; the pre-push hook ran again.

**Final head `07b194604c8b982ae3f1b4b45ea0ecdd45b97909`** — see the table; the shipped code at this head equals P `4cf38d88c` plus the test-only `engine_log.rs` change (no production line changed after the clean-worktree proof).

| Workflow | Run | Result |
|----------|-----|--------|
| Rust test (rust-test.yml) | `45451701819` | success: `cargo-test (macos-latest)` `138650244730` success; `cargo-test (windows-latest)` `138650245299` success; `cargo-test (ubuntu-latest)` `138650245738` success |
| Code check (codecheck.yml) | `45451703623` | success |
| Test (test.yml) | `45451702048` | success |
| Lint | `45451701683` | success |
| Supply-chain audit | `45451702304` | failure, pre-existing (RUSTSEC-2026-0594 in cargo-deny; red on every push since before 87-58, run `45228612462`); not one of the three required workflows, deferred (see `deferred-items.md` 87-58) |

Per-leg results of the platform steps, from the leg logs: `cargo test --bin gamelib-shell` 870 passed / 2 ignored (macos-latest), 835 passed / 4 ignored (windows-latest), 854 passed / 3 ignored (ubuntu-latest), 0 failed on all three;
clippy ratchet `PASS (darwin, toolchain 1.99.1)` and `PASS (win32, toolchain 1.99.1)` (Linux runs no clippy by design); every `test result` line of the whole job log reads `ok` (sum of passed: 3968 macos, 3589 windows, 3950 ubuntu; 0 failed).

**Golden replays per leg** (tests run in each binary, from the leg logs of run `45451701819`; each `Running` line is paired with its own `running N tests` line because stdout and stderr interleave; `0` means the binary compiled to no tests under `cfg(unix)`):

| Binary | macos-latest | windows-latest | ubuntu-latest |
|--------|--------------|----------------|---------------|
| gamelib-engine `golden_bottles` / `golden_decision` / `golden_fallback` / `golden_launch` / `golden_state` / `golden_switch` / `roundtrip_state` | 14 / 3 / 8 / 8 / 9 / 6 / 7 | 0 (unix-gated) | 14 / 3 / 8 / 8 / 9 / 6 / 7 |
| gamelib-engine `golden_config`, `golden_demo_status` | 7, 2 | 0, 0 (unix-gated) | 7, 2 |
| gamelib-engine `bottle_removal` (87-66), `decision_incidents`, `offline_refusal` (87-63), `run_tool_arms`, `switch_incidents` | 26, 26, 17, 6, 4 | 0, 0, 0, 0, 0 (unix-gated) | 26, 26, 17, 6, 4 |
| gamelib-engine `twin_vectors` | 12 | 9 | 12 |
| gamelib-wine `golden_dxmt` / `golden_dxvk` / `golden_runtimes` / `golden_winetricks` | 9 / 6 / 5 / 8 | 9 / 6 / 5 / 8 | 9 / 6 / 5 / 8 |
| gamelib-wine `golden_wine_core` | 18 | 16 | 18 |
| gamelib-wine `golden_discovery` / `golden_wine_manager` / `dxvk_incidents` / `tool_bottle_target` (87-64) | 11 / 10 / 39 / 13 | 0 / 0 / 0 / 0 (unix-gated) | 11 / 10 / 39 / 13 |
| gamelib-wine `run_for_game_guard` / `winetricks_pure` | 25 / 27 | 25 / 27 | 25 / 27 |

D-13's "gamelib-engine and gamelib-wine goldens observed running on every leg" holds as in 87-58: for **gamelib-wine on all three legs** (the Winetricks, DXVK, DXMT and runtime goldens, the per-game guard and the pure winetricks suite
run on Windows too) and for **gamelib-engine on macos-latest and ubuntu-latest only**, because the bottle and CrossOver code is macOS-only and every engine golden is `#![cfg(unix)]`; Windows runs `twin_vectors` (9), the engine and wine lib tests and the shell tests.

## Gap closure proof (cycle 2, 87-78)

Measured by plan 87-78 Task 1, 2026-11-26, from a `git worktree add --detach` checkout (removed afterwards, `git worktree list` shows the main checkout and the eight worktrees that existed before)
with its own `pnpm install --frozen-lockfile`, `pnpm exec vite build`, `pnpm build:sidecar-sea` and a cold `src-tauri/target`. The default `TMPDIR` (`/var/folders/...`) was kept, so the checkout is not inside
`os.tmpdir()` (the 87-68 finding 2 hazard). 87-68's table, copied verbatim and extended with step 18 (`pnpm lint-translations`), with the 87-68 counts for comparison.

**Candidate head P = `02d0bd26da05e259004ba29cd6465b89bcb37d41`** (main). It is `756c4b2c8` (88.1's last docs commit when the proof's first pass finished) plus one commit, `02d0bd26d`
`fix(87-78): 87-74's three pre-push gate reds, a dead export and two ratchet baselines`, which touches only `src/frontend/screens/Game/GamePage/actions/rowActivation.ts`,
`meta/knip-baseline.txt` and `meta/backendDiCeilings/frontend-screens-game.json`; see "Findings" below. Every step was re-run at P after that commit (the worktree was moved to P with
`git checkout --detach` and every step 1 to 18 ran again from the frozen-lockfile install), so the proof is at one head. The first pass ran at `0521d20d3` (88.1's docs head, the `main` HEAD after the
last SUMMARY commit of 87-71..87-77) and found the three reds the fix removes; its Rust counts were identical to P's.

Ancestry: 36 distinct commit hashes found in the 87-71 to 87-77 SUMMARYs resolve in this repo and every one is an ancestor of P (`git merge-base --is-ancestor`, 0 exceptions).
P carries 360 commits beyond 0.13.1's source (`07b194604`): 195 are Phase 88 and 88.1 (scope `88` or `88.1` in the subject), 91 are Phase 94, and 29 are 87-71 to 87-78. `git diff --name-only 07b194604 P`
lists 13543 files outside `.planning/` because of that history. `origin/main` is `c0f863946` (88.1-20), an ancestor of P; P is 16 commits ahead of it (13 at the start of the plan, plus 3 added while it ran).

| Step | Command (as rust-test.yml / pre-push run it) | Outcome at P (87-68 at its P) |
|------|-----------------------------------------------|-------------------------------|
| 1 | `pnpm install --frozen-lockfile` | pass |
| 2 | `pnpm exec vite build` | pass |
| 3 | `pnpm build:sidecar-sea` | pass (arm64 SEA sidecar built) |
| 4 | `cargo test -p gamelib-safety -p gamelib-testutil` | pass, 95 passed, 0 red (95) |
| 5 | `cargo test -p gamelib-proc` | pass, 50 passed, 0 red (47) |
| 6 | the 28-package `cargo test -p gamelib-scan ... -p gamelib-humble -p gamelib-shortcuts --no-fail-fast` step of rust-test.yml (194 test binaries) | pass, 3728 passed, 0 red, 9 ignored (2956, 7; the step gained gamelib-humble and gamelib-shortcuts) |
| 7 | static codec linkage (`cargo build -p gamelib-depot-cli`, `otool -L`, no lzma/zstd/zlib) | pass (macOS leg form; links Security, CoreFoundation, libiconv, libSystem only) |
| 8 | `cargo test -p gamelib-engine --features testing` | pass, 404 passed, 0 red (381) |
| 9 | `cargo test -p gamelib-wine --features testing` | pass, 341 passed, 0 red (341) |
| 10 | `cargo test --bin gamelib-shell` | pass, 1009 passed, 0 red, 2 ignored (870, 2) |
| 11 | darwin clippy ratchet: `cargo +1.99.1 clippy --workspace --all-targets --message-format=json` then `node meta/clippyRatchet.cjs --list` | pass, `PASS (darwin, toolchain 1.99.1)` |
| 12 | `pnpm check:ipc-contract` | pass (ipc_contract.rs and ipcSchemaSnapshot.json up to date) |
| 13 | `pnpm test` (jest, 6 projects) | red, pre-existing and environmental only: 1109 suites passed (5 skipped), 25532 tests passed (38 skipped), 245 s; 5 suites red (16 tests), none caused by a cycle 2 commit, see "Findings" 2 to 5 (1108 suites / 24256 tests, 0 red at 87-68's P). `nativeSeamPortComplete.test.ts` (8 tests, a transient file race) and `phase70PassthroughCensus.test.ts` re-ran green alone, 118 passed |
| 14 | `pnpm smoke:exit-check -- --mode eof` | pass, `sidecarExitCheck [eof]: PASS (exit latency 8 ms)` |
| 15 | `pnpm smoke:sidecar` | pass, built, READY written, exited 0 on stdin EOF |
| 16 | pre-push gate set: `pnpm codecheck`, `lint`, `prettier`, `i18n --fail-on-update`, `find-deadcode`, `boundaries`, `steam-line-ceiling`, `backend-di-ceilings`, `gameinfo-narrowing-ceiling` | all nine pass (exit 0 each) at P; lint 0 errors, 578 warnings. At `0521d20d3` `find-deadcode` and `backend-di-ceilings` were red (Finding 1) |
| 17 | `pnpm planning-gates` | pass, 12/12 |
| 18 | `pnpm lint-translations` | pass |

The worktree was clean after the run (`git status --short` empty) and was removed with `git worktree remove`.

### Findings

1. **A gap plan broke two pre-push gates and one more ratchet (87-74), Rule 1.** At `0521d20d3` `pnpm find-deadcode` failed on three lines and `pnpm backend-di-ceilings` on one: `exports | src/frontend/screens/Game/GamePage/actions/rowActivation.ts | describeActivation`
   (the function is used only inside the file, so it need not be exported); two `knip-baseline.txt` lines (`@testing-library/dom`, `@testing-library/user-event`) that no longer match because 87-74's `uninstallCancelKeepsSteamShortcut.test.tsx`
   now imports both (the ratchet is shrink-only and asks for their removal); and `uninstallCancelKeepsSteamShortcut.test.tsx has 1 (jestMock) and no baseline entry`. Left alone, the pre-push hook would have blocked the push of the 87-74 commits.
   Fixed on main in `02d0bd26d` (un-export, drop the two baseline lines, one `jestMock` baseline entry in `frontend-screens-game.json` as 87-68's `4cf38d88c` did for 87-67). `pnpm find-deadcode`, `pnpm backend-di-ceilings`,
   `prettier --check` on the two checkable files (the `.txt` baseline has no prettier parser) and the 14 jest suites under `GamePage/actions`, `GamePage/components/InstallTab` and the two `backendDiCeilings` meta suites (373 tests) pass, and P moved to that commit.
2. **`genI18nGateScope` "A-17 ANTI-ROT" is red, pre-existing** (`meta/i18nForkTouchedFiles.json` last changed in `2b1d7ce01`, 2026-11-23, no cycle 2 commit touches it): recorded in `deferred-items.md` under 87-17 and carried by the orchestrator as known red on main. Not fixed here.
3. **`loginWindowSeamPredicateRemoved` (REQ-39-03, scope `src/backend/humble`) is red, pre-existing**: `src/backend/humble/__tests__/oracle/userHarness.ts:360` (`options.seam ?? {}`) comes from `1eb10a76a` (`test(94-09)`, Phase 94), not from 87-71 to 87-78. Not fixed here.
4. **`iconGeometry.oracle.test.ts` is red (5 tests), pre-existing**: the `icon_geometry` golden folder under `src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/` was never committed (`git ls-files` lists none; `5cadce7b4` `feat(94-14)` says "golden replay pending Mac goldens"; test from `92ab71110`, Phase 94). It fails the same way in the main checkout. Not fixed here.
5. **`valveClient.test.ts` "rejects a symlink entry" is red, environmental**: `/usr/bin/unzip` reports `symlink error: Permission denied` when extracting `bins_win64.symlink.fixture.zip` (reproduced by hand outside jest, in this executor's shell), so the cause string is `unzip extraction failed` and not `regular file`. The test and `valveClient.ts` are unchanged since `a3f93e43f` (2026-11-14), and the suite fails the same way in the main checkout. Not caused by any cycle 2 commit; not fixed here.
6. **`nativeSeamPortComplete.test.ts` read the transient `meta/runTs.__probe__.cjs`** another suite writes and deletes (`ENOENT`, 8 tests): the race already logged in `deferred-items.md` under 87-68. It and `phase70PassthroughCensus.test.ts` passed on a re-run alone (118 tests).
7. **Pre-existing reds, recorded not fixed:** the `Supply-chain audit` workflow (cargo-deny, RUSTSEC-2026-0594) and the `gamelib-depot` `tests/fetch.rs` timing tests (`deferred-items.md` 87-58); the depot timing tests passed in step 6 here.
   No red step was caused by a Phase 88 or 88.1 commit; 88.1's open verification gap (CR-01 Windows `setupEnvVars`) is a Windows-leg matter this macOS proof cannot show and CI will.

## Signed builds (D-12)

### Phase 87 build (87-59, 2026-11-24)

The operator chose `Cut a signed build` after 87-58 recorded the dry run as `blocked`. Same workflow (`release-tauri.yml`), same Apple secrets, run with
`dry_run=false` from a version-bumped release branch, as 85-19 (`release/v0.10`) and 86-26 (`release/v0.12`) did. Exactly one dispatch was made.

- **Source:** branch `release/v0.13` at `8a0096baee3a6ea347fd477e9178d464b443ae24` = `main` at `65b47bfa1` (contains every Phase 87 source commit and
  `f9f1cce2e`, the shipped `tools/dxvk.rs` leading-`~` fix; `origin/main` was equal to it) + `8a0096bae` `chore(87-59): bump version to 0.13.0` (package.json,
  src-tauri/Cargo.toml, src-tauri/tauri.conf.json and the `gamelib-shell` entry of src-tauri/Cargo.lock, one line each). 0.13.0 is strictly greater than the
  shipped Phase 86 build (0.12.0, run `45056179067`). The branch was cut in a separate worktree, so the main checkout never left `main`.
- **Run:** release-tauri.yml `45314401170`, `workflow_dispatch` on `release/v0.13`, headSha `8a0096baee3a6ea347fd477e9178d464b443ae24`, `dry_run=false`.
  Leg conclusions: `release (ubuntu-22.04, x86_64-unknown-linux-gnu)` success (02:55:09Z), `release (windows-latest, x86_64-pc-windows-msvc)` success
  (02:55:54Z), `release (macos-latest, --target aarch64-apple-darwin, aarch64-apple-darwin)` success (02:59:09Z).
- **Artifact:** draft release `GameLib v0.13.0` (tag `v0.13.0`, draft and prerelease, NOT published; target `8a0096bae`; 8 assets: the aarch64 app tar and
  dmg, the AppImage, the NSIS setup, their `.sig` files and `latest.json`). The `v0.10.0`, `v0.11.0` and `v0.12.0` drafts are untouched (the newest asset
  of v0.12.0 is still 2026-11-22T18:57:25Z, of v0.11.0 2026-11-22T03:23:25Z; each still holds its 8 assets). Downloaded with
  `gh release download v0.13.0 -p 'GameLib_0.13.0_aarch64.app.tar.gz' -p 'GameLib_0.13.0_aarch64.dmg'` into the session scratchpad:
  - `GameLib_0.13.0_aarch64.app.tar.gz` (101111510 bytes), sha256 `a48937edd93b760b41bdd60c67896a04f04d8dc73b39baa86b683e53af94027c`
  - `GameLib_0.13.0_aarch64.dmg` (100002164 bytes), sha256 `0b24d7897a33789b730d1ce9140d1e523f46215fdbd3598c313136c0e325ec4a`
  - The checks below ran on `GameLib.app` extracted from the app tar (like with like with the 85 and 86 records). `CFBundleShortVersionString` = `0.13.0`.
    Nothing was installed, opened or launched by this plan's executor.
- **`codesign -dv --verbose=4 GameLib.app`:** `Identifier=com.gamelib.shell`; `Format=app bundle with Mach-O thin (arm64)`; `Authority=Developer ID
  Application: grayson mitchell (S7U223QWXJ)` -> `Developer ID Certification Authority` -> `Apple Root CA`; `TeamIdentifier=S7U223QWXJ`; `Timestamp=24 Nov 2026
  at 3:56:24 PM` (local); flags `0x10000(runtime)`; `Notarization Ticket=stapled`; `CDHash=18d7ea76c1f0758325b0976c643496d28c3b861d`. `codesign --verify
  --deep --strict` passes.
- **Designated requirement (`codesign -d -r-`):** `identifier "com.gamelib.shell" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6]
  /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = S7U223QWXJ`
- **`spctl -a -vv GameLib.app`:** `accepted`, `source=Notarized Developer ID`, `origin=Developer ID Application: grayson mitchell (S7U223QWXJ)`.
- **`xcrun stapler validate GameLib.app`:** stapled (`The validate action worked!`).
- **Install-over source on this Mac (read-only check):** `/Applications/GameLib.app` is `0.12.0` with `CDHash=06c8dcf06883e6e2ad44d47616b93e9eca7f685b`, the Phase 86
  build's CDHash recorded in 86-VALIDATION.md, so the signed Phase 86 build is what the gate upgrades from.

**Comparison with the Phase 86 build (baseline):**

| Property | Phase 86 build (run 45056179067, `/Applications` read now) | Phase 87 build (run 45314401170) | Equal |
|----------|------------------------------------------------------------|----------------------------------|-------|
| Identifier | `com.gamelib.shell` | `com.gamelib.shell` | yes |
| Leaf authority | Developer ID Application: grayson mitchell (S7U223QWXJ) | same | yes |
| Chain | Developer ID Certification Authority -> Apple Root CA | same | yes |
| TeamIdentifier | `S7U223QWXJ` | `S7U223QWXJ` | yes |
| Designated requirement | the string in 86-VALIDATION.md | byte-identical (compared by script on the installed 86 app and the 87 app: both `codesign -d -r-` `designated =>` lines hash to sha256 `68d712d0b6d7e715a10a8e79e81b6a50faf2098af411591169238f56d7888b91`) | yes |
| spctl | accepted, Notarized Developer ID | accepted, Notarized Developer ID | yes |
| stapler | stapled | stapled | yes |
| Version | 0.12.0 | 0.13.0 | differs, as intended (an upgrade) |
| CDHash | `06c8dcf0...` | `18d7ea76...` | differs, as expected for a different build; the Keychain ACL binds to the designated requirement |

The identities match, so the gate is `pending`: the live gate is owed by 87-59 Task 2.

Gate: pending (identities match: signed Phase 87 build v0.13.0, run 45314401170, `release/v0.13` at 8a0096bae, same Identifier, Developer ID leaf, TeamIdentifier S7U223QWXJ and byte-identical designated requirement as the signed Phase 86 build v0.12.0, run 45056179067; both notarized and stapled)

#### Superseded: the 87-58 dry run (kept for the record)

**Operator decision at the Task 2 checkpoint (2026-11-24): `push-and-build`, with `dry_run=true`.** Exactly one dispatch was made:
`gh workflow run release-tauri.yml --ref main -f dry_run=true`. No `dry_run=false` dispatch, no tag, no change to the `GameLib v0.11.0`, `v0.12.0` or
`v0.10.0` draft releases (`gh release list` before and after is identical).

- **Phase 87 dry-run build:** release-tauri.yml run `45279091996`, `workflow_dispatch` on `main`, headSha `6d9f12f493ed1ac41b22f272107f27b1038446b8`,
  `GAMELIB_DRY_RUN: true`. Conclusions: `release (windows-latest, x86_64-pc-windows-msvc)` success (22:40:32Z), `release (ubuntu-22.04,
  x86_64-unknown-linux-gnu)` success (22:33:15Z), `release (macos-latest, --target aarch64-apple-darwin, aarch64-apple-darwin)` success (22:47:24Z).
  The macOS log shows the bundler signing (`Signing with identity "***"`, masked) and `Notarizing .../GameLib.app` -> `Notarizing Finished with status
  Accepted for id 0f9f1f45-4aeb-4e9b-811a-aa34fac4d235`, then `Finished 2 bundles`.
- **What a dry run does not give:** it uploads nothing (the workflow bans artifact upload; tagName and releaseName are empty), so there is **no downloadable
  Phase 87 macOS artifact**. `codesign` Authority, TeamIdentifier, the designated requirement, `spctl -a -vv` and `xcrun stapler validate` cannot be read from
  it, and nothing was installed over the signed Phase 86 build. The dry run proves the Phase 87 tree packages, signs and notarizes on the same
  secrets; it does not prove the artifact's identity.
- **Head caveat:** the dry run built `6d9f12f49`, before the Windows CI fixes. Of those, only `gamelib-wine` `tools/dxvk.rs` (`9c9fd376f`, leading-`~`
  expansion) is shipped code; the others are `cfg(test)`, test files or the `testing` feature. A build of the final head would include it.

**Phase 86 identity (the baseline), by reference to `86-VALIDATION.md` "## Signed builds (D-15)", "### Phase 86 build (86-26, 2026-11-23)":** run
`45056179067` (`dry_run=false`, `release/v0.12` at `7c50262f4`), `Identifier=com.gamelib.shell`, `Authority=Developer ID Application: grayson mitchell
(S7U223QWXJ)` -> `Developer ID Certification Authority` -> `Apple Root CA`, `TeamIdentifier=S7U223QWXJ`, designated requirement `identifier
"com.gamelib.shell" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate
leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = S7U223QWXJ` (sha256 `af622dc08488b1a2859794a68b60fdfe18f4fede01abbece63d126730527d131`),
`spctl` accepted (Notarized Developer ID), stapled, `CDHash=06c8dcf06883e6e2ad44d47616b93e9eca7f685b`.

| Property | Phase 86 build (run 45056179067) | Phase 87 build | Equal |
|----------|----------------------------------|----------------|-------|
| Identifier | `com.gamelib.shell` | not obtainable (dry run, no artifact) | unknown |
| Leaf authority / TeamIdentifier | Developer ID Application: grayson mitchell (S7U223QWXJ) / `S7U223QWXJ` | not obtainable | unknown |
| Designated requirement | the string above | not obtainable | unknown |
| spctl / stapler | accepted, Notarized Developer ID / stapled | not obtainable (notarization itself: Accepted, id `0f9f1f45-4aeb-4e9b-811a-aa34fac4d235`) | unknown |

To obtain an artifact a non-dry-run dispatch is needed, from a version-bumped release branch as 85-19 (`release/v0.10`) and 86-26 (`release/v0.12`) did,
because a `dry_run=false` dispatch on `main` at version 0.11.0 would write into the existing `GameLib v0.11.0` draft. That was not authorised here.

(87-58 recorded `Gate: blocked (no artifact from a dry run)`; superseded by the line above.)

### Phase 87 gap build (87-68)

Operator decision `push-and-build` (see "## CI proof (gap closure)"). Same workflow (`release-tauri.yml`), same Apple secrets, `dry_run=false` from a version-bumped release branch, as 87-59 (`release/v0.13`).
Exactly one dispatch was made: `gh workflow run release-tauri.yml --ref release/v0.13.1 -f dry_run=false`.

- **Source:** branch `release/v0.13.1` at `97d6d2052fdf92b7f7e28ef584ab4df5674f577d` = `07b194604c8b982ae3f1b4b45ea0ecdd45b97909` (main, the head of the three-OS green CI proof; production code identical to the
  clean-worktree proof head P `4cf38d88c`, see "## Gap closure proof (87-68)") + `97d6d2052` `chore(87-68): bump version to 0.13.1 for the signed Phase 87 gap-closure build (D-12)` (package.json, src-tauri/Cargo.toml,
  src-tauri/tauri.conf.json and the `gamelib-shell` entry of src-tauri/Cargo.lock, one line each; `git diff --name-only 07b194604 HEAD` lists exactly those four). 0.13.1 is greater than the 0.13.0 build the operator last ran.
  The branch was cut in a separate worktree (removed afterwards), so the main checkout never left `main`.
- **Run:** release-tauri.yml `45455431706`, `workflow_dispatch` on `release/v0.13.1`, headSha `97d6d2052fdf92b7f7e28ef584ab4df5674f577d`, `dry_run=false`. Leg conclusions: `release (windows-latest, x86_64-pc-windows-msvc)` success
  (18:12:39Z), `release (ubuntu-22.04, x86_64-unknown-linux-gnu)` success (18:16:23Z), `release (macos-latest, --target aarch64-apple-darwin, aarch64-apple-darwin)` success (18:28:48Z).
- **Artifact:** draft release `GameLib v0.13.1` (tag `v0.13.1`, draft and prerelease, NOT published; target `97d6d2052`; 8 assets: the aarch64 app tar and dmg, the AppImage, the NSIS setup, their `.sig` files and `latest.json`).
  `gh release list` after differs from before only by that new draft (`diff` of the two listings: one added line, `GameLib v0.13.1  Draft  v0.13.1  2026-11-24T18:12:26Z`). The `v0.10.0`, `v0.11.0`, `v0.12.0` and `v0.13.0` drafts are untouched
  (each still holds 8 assets, newest asset timestamps unchanged: v0.10.0 2026-11-21T23:14:36Z, v0.11.0 2026-11-22T03:23:25Z, v0.12.0 2026-11-22T18:57:25Z, v0.13.0 2026-11-24T02:59:00Z); the remote tag count is 23 before and after (no tag was created or moved);
  `origin/main` was not touched by the dispatch. Downloaded with `gh release download v0.13.1 -p 'GameLib_0.13.1_aarch64.app.tar.gz' -p 'GameLib_0.13.1_aarch64.dmg'` into a fresh directory under the session scratchpad:
  - `GameLib_0.13.1_aarch64.app.tar.gz` (101132176 bytes), sha256 `54d6fe17a519217eb9837c4be6e0594b05ca0e3cca9d9d5c530d732440782235`
  - `GameLib_0.13.1_aarch64.dmg` (100016050 bytes), sha256 `c043b8c4f0c2e13b0e67e4fa916eb19c01c1d2fcde16212eb9c1a715941297b4`
  - The checks below ran on `GameLib.app` extracted from the app tar (like with like with the 85, 86 and 87-59 records). `CFBundleShortVersionString` = `0.13.1`. Nothing was installed, opened or launched by this plan.
    The gap fixes are in the artifact: the string `engine_bottle_remove_per_game` (87-66/87-70's per-game bottle removal op) is present in `Contents/MacOS/gamelib-shell` and `gamelib-sidecar` of 0.13.1 and absent from both in the installed 0.13.0.
- **`codesign -dv --verbose=4 GameLib.app`:** `Identifier=com.gamelib.shell`; `Format=app bundle with Mach-O thin (arm64)`; `Authority=Developer ID Application: grayson mitchell (S7U223QWXJ)` -> `Developer ID Certification Authority` -> `Apple Root CA`;
  `TeamIdentifier=S7U223QWXJ`; `Timestamp=25 Nov 2026 at 7:25:30 AM` (local); flags `0x10000(runtime)`; `Notarization Ticket=stapled`; `CDHash=266b7378d08b90e305efe37d2573270b01b146dd`. `codesign --verify --deep --strict` passes (exit 0).
- **Designated requirement (`codesign -d -r-`):** `identifier "com.gamelib.shell" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = S7U223QWXJ`
- **`spctl -a -vv GameLib.app`:** `accepted`, `source=Notarized Developer ID`, `origin=Developer ID Application: grayson mitchell (S7U223QWXJ)`.
- **`xcrun stapler validate GameLib.app`:** stapled (`The validate action worked!`).
- **Install-over source on this Mac (read-only check):** `/Applications/GameLib.app` is `0.13.0` with `CDHash=18d7ea76c1f0758325b0976c643496d28c3b861d`, the 87-59 build's CDHash, so the signed 0.13.0 build is what the re-run upgrades from.

**Comparison with the installed 0.13.0 build and the Phase 86 record (baseline):**

| Property | Installed 0.13.0 (87-59, run 45314401170, `/Applications` read now) / Phase 86 record | Phase 87 gap build (run 45455431706) | Equal |
|----------|-------------------------------------------------------------------------------------|--------------------------------------|-------|
| Identifier | `com.gamelib.shell` | `com.gamelib.shell` | yes |
| Leaf authority | Developer ID Application: grayson mitchell (S7U223QWXJ) | same | yes |
| Chain | Developer ID Certification Authority -> Apple Root CA | same | yes |
| TeamIdentifier | `S7U223QWXJ` | `S7U223QWXJ` | yes |
| Designated requirement | the `designated =>` line of the installed 0.13.0 app hashes to sha256 `68d712d0b6d7e715a10a8e79e81b6a50faf2098af411591169238f56d7888b91` (the Phase 86 record's value, per 87-59) | the gap build's `designated =>` line hashes to sha256 `68d712d0b6d7e715a10a8e79e81b6a50faf2098af411591169238f56d7888b91` (compared by script, `shasum -a 256` of the same extracted line from both apps) | yes (byte-identical) |
| spctl | accepted, Notarized Developer ID | accepted, Notarized Developer ID | yes |
| stapler | stapled | stapled | yes |
| Version | 0.13.0 | 0.13.1 | differs, as intended (an upgrade) |
| CDHash | `18d7ea76...` | `266b7378...` | differs, as expected for a different build; the Keychain ACL binds to the designated requirement |

The identities match, so the gate is `pending`: the live re-run (87-69) is owed.

Gate (gap build): pending (identities match: signed Phase 87 gap build v0.13.1, run 45455431706, `release/v0.13.1` at 97d6d2052 = main 07b194604 + the version bump, same Identifier, Developer ID leaf, TeamIdentifier S7U223QWXJ and byte-identical designated requirement (sha256 68d712d0...) as the installed signed 0.13.0 build (run 45314401170) and the signed Phase 86 build v0.12.0 (run 45056179067); notarized and stapled; contains every 87-60 to 87-67 and 87-70 gap fix)
