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
| SVC-02 / SC1 | decision matrix, CrossOver-first, fallback to pin | Rust golden replay | `cargo test -p gamelib-engine --test golden_decision` | ✅ | ✅ green at 1e586bf8d (87-58 Task 1) |
| SVC-02 / SC1 | launch step, deadline, process watch | Rust unit + golden | `cargo test -p gamelib-engine --test golden_launch` | ✅ | ✅ green at 1e586bf8d (87-58 Task 1) |
| SVC-02 / SC1 | fallback download/verify/extract + events | Rust replay | `cargo test -p gamelib-engine --test golden_fallback` | ✅ | ✅ green at 1e586bf8d (87-58 Task 1) |
| SVC-02 / SC1 | live healthy/fallback/adopt, expired trial | live gate (operator, signed build) | `87-HUMAN-UAT.md` items 1–2 | ❌ W0 (authored before coding) | ⬜ pending (live gate, 87-59) |
| SVC-02 / SC2 | bottle create/reuse/remove, sibling-safe, markers byte-equal, newer marker kept | Rust golden + safety table | `cargo test -p gamelib-engine --test golden_bottles` | ✅ | ✅ green at 1e586bf8d (87-58 Task 1) |
| SVC-02 / SC2 | TS pure-helper twin == Rust vectors (D-24) | Jest + Rust shared JSON | `pnpm jest src/backend/enginewine/__tests__/twinVectors.test.ts` | ✅ | ✅ green at 1e586bf8d (87-58 Task 1) |
| SVC-02 / SC3 | wine core, discovery, wine-manager, runtimes, winetricks, DXVK/DXMT/vkd3d goldens | Rust golden replay | `cargo test -p gamelib-wine` | ✅ | ✅ green at 1e586bf8d (87-58 Task 1) |
| SVC-02 / SC3 | live tools and downloads | live gate item 4 | `87-HUMAN-UAT.md` | ❌ W0 | ⬜ pending (live gate, 87-59) |
| SVC-02 / SC4 | TS and registrations deleted; only scheduled shims/resolvers/twin remain | Jest gate | `pnpm jest src/backend/__tests__/engineWinePortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts` | ✅ | ✅ green at 1e586bf8d (87-58 Task 1) |
| FND-04 | no orphan winetricks/tar/wine helper after quit | `gamelib-proc` orphan harness arm | `cargo test -p gamelib-proc` | ✅ | ✅ green at 1e586bf8d (87-58 Task 1) |
| FND-06 | markers/notices/wine-downloader-info round trip, newer never overwritten, corrupt kept | Rust golden | `cargo test -p gamelib-engine --test roundtrip_state` | ✅ | ✅ green at 1e586bf8d (87-58 Task 1) |
| D-14 | channel parity (OPS == constants == arms), IPC snapshot | Jest + gen | `pnpm check:ipc-contract` | ✅ | ✅ green at 1e586bf8d (87-58 Task 1) |

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

## Findings at the candidate head

1. **Darwin clippy ratchet was red at `20fc9d890`** (first run, same worktree): `clippy::cloned_ref_to_slice_refs` 10 found against a
   ceiling of 2 (`FAIL: 8 new warning(s)`). Eight were Phase 87 test code: `engine_dispatch.rs` 1312, 1424, 1426, 1567, 1569, 1572 and
   `wine_dispatch.rs` 1945, 2512; the other two are the standing `single_instance.rs:686`, `:870`. Fixed in `1e586bf8d`
   (`std::slice::from_ref(&x)`, rustfmt-clean, test behaviour unchanged), no ceiling moved. The ratchet, `cargo test --bin gamelib-shell`
   and the whole list above were then re-run at `1e586bf8d`. This is the same class as Phase 86's R1.
2. **Renderer boundary (D-10), literal check not met.** See "## SC4 sweep": two Phase 87 commits touch `src/frontend`, both comment-only.

## SC4 sweep

All at P `1e586bf8d`, in the clean worktree unless stated.

| Check | Command | Output | Result |
|-------|---------|--------|--------|
| engineWinePortComplete describes and the schedule | `pnpm test` (full), suites `engineWinePortComplete.test.ts`, `engineWineShimSchedule.test.ts` | both PASS; survivors table agrees with SCHEDULE both ways (87-57) | pass |
| `src/backend/engine`, `src/backend/tools`, `src/backend/wine/manager` absent | `[ -e <path> ]` | all three absent | pass |
| `engineFlowRegistration.ts`, `wineToolsFlowRegistration.ts` absent | `find . -name ... -not -path ./node_modules` | no hits | pass |
| neither `GAMELIB_ENGINE` nor `GAMELIB_WINE` in `src/` or `src-tauri/src` | `grep -rIl -E 'GAMELIB_ENGINE\|GAMELIB_WINE' src src-tauri/src` | one hit, `src/backend/__tests__/engineWinePortComplete.test.ts`, the guard itself (its `FORBIDDEN_FLAGS` constant and planted-fixture self-tests); 0 hits in `src-tauri/src` and 0 in any non-guard file | pass (the only occurrence is the detector's own text, which the gate excludes from its scan) |
| DXMT wine-install gap (opened 87-20, closed 87-31) closed at P | `grep -c on_wine_installed src-tauri/crates/gamelib-wine/src/manager/install.rs`; `grep -c on_wine_uninstalled src-tauri/crates/gamelib-wine/src/manager/remove.rs`; `cargo test -p gamelib-wine --test golden_wine_manager` | 1; 1; golden_wine_manager passes (9 tests, within the 326 of step 9) | pass |
| no renderer file under `src/frontend` changed since the 87-01 base | `git diff --name-only ca6cc1d43..20fc9d890 -- src/frontend` (the P-only commit touches no frontend path) | 14 files, attributed below | **literal check not met; see attribution** |

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
  Task 2 checkpoint.

## Per-task map statuses

The ten automated rows of the Per-Task Verification Map are `✅ green at 1e586bf8d`; rows 4 and 8 (live gate items 1-2 and 4) stay
`⬜ pending (live gate, 87-59)`. Status of D-13 (three-OS CI) and D-12 (signed build) is recorded by Task 3 after the operator's decision.
