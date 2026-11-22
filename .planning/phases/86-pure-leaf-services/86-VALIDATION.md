---
phase: "86"
slug: "pure-leaf-services"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: true
created: "2026-11-22"
---

# Phase 86 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Seeded from
> `86-RESEARCH.md` § Validation Architecture; the planner fills the per-task map.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust `cargo test` (workspace); jest 29.7 (projects `Backend`, `Common`, `Frontend`, `Preload`, `Meta`) |
| **Config file** | `src-tauri/Cargo.toml`, `jest.config.js`, `src/backend/jest.config.js` |
| **Quick run command** | `cd src-tauri && cargo test -p gamelib-info <module>` ; `pnpm exec jest --runTestsByPath <scoped test>` |
| **Full suite command** | `cd src-tauri && cargo test -p gamelib-info -p gamelib-info-cli -p gamelib-store && cargo test --bin gamelib-shell` ; `pnpm codecheck && pnpm lint && pnpm test:ci && pnpm check:ipc-contract && pnpm planning-gates` |
| **Estimated runtime** | ~60 s quick, ~10 min full |

---

## Sampling Rate

- **After every task commit:** the touched `cargo test -p gamelib-info <module>` plus the scoped jest file; `cargo clippy -p gamelib-info --all-targets -- -D warnings`; `cargo fmt -p gamelib-info --check`; `npx prettier --check <exact paths>` after `--file-info` (never `.`).
- **After every plan wave:** the full Rust command plus `pnpm codecheck && pnpm check:ipc-contract`.
- **Before `/gsd-verify-work`:** full suite green on the three-OS CI matrix and the signed-build live gate recorded.
- **Max feedback latency:** 120 seconds per task.

---

## Requirement → Test Map (from research)

| Req / SC | Behavior | Test Type | Automated Command | File Exists |
|----------|----------|-----------|-------------------|-------------|
| SVC-01 / SC1 | Wiki, CrossOver, ITAD, discounts, anticheat, SteamGridDB results equal TS goldens on recorded responses | golden replay | `cargo test -p gamelib-info --test golden_<slice>` | ❌ W0 |
| SVC-01 / SC1 | Same method, URL, decoded query, body, pinned headers as TS (D-10; D-23 TS-only-requests list for GOG) | request pin | `cargo test -p gamelib-info --test requests_<slice>` | ❌ W0 |
| SVC-01 / SC2 | Recent games, overrides and cache stores round-trip existing bytes | file round-trip | `cargo test -p gamelib-info --test roundtrip_<slice>` | ❌ W0 |
| SVC-01 / SC2 | `CacheView` TTL, `invalidateCheck`, dotted `__timestamp` keys, UTC `Date()` write | unit | `cargo test -p gamelib-info cache_view::` | ❌ W0 |
| SVC-01 / SC3 | Zero-test slices get a TS golden harness before Rust (D-11) | oracle | `pnpm exec jest --runTestsByPath src/backend/info/__tests__/oracle/<slice>.oracle.test.ts` (per slice; deleted with its slice, 86-09..86-24) | ❌ W0 |
| SVC-01 / SC3 | Goldens cannot pass vacuously (manifest floor, empty-input negative) | guard | manifest/floor test in `gamelib-info` | ❌ W0 |
| SVC-01 / SC4 | Per-slice TS, registrations, zod entries gone; shims/resolvers typed-call only (D-06, D-24); store-table rows kept (EXTRA_ROWS) | delete gate | `pnpm exec jest --runTestsByPath src/backend/__tests__/infoPortComplete.test.ts src/backend/__tests__/infoShimSchedule.test.ts` | ❌ W0 |
| SVC-01 / SC4 | Native channel args validated, one owner per channel, IPC snapshot regenerated | contract | `pnpm check:ipc-contract` | ✅ extend |
| D-08 | Rust emits `recentGamesChanged`; tray updates | unit + source gate | `cargo test --bin gamelib-shell tray::` | ✅ update |
| D-19/D-26 | No keyring in `-cli`; keys never in fixtures or logs | secrets | `cargo tree -p gamelib-info-cli \| grep -c keyring` == 0; fixture redaction test | ❌ W0 |
| D-12 | Live drift check on demand | opt-in | `cargo run -p gamelib-info-cli -- drift` | ❌ W0 |

---

## Per-Task Verification Map

*Seeded by the planner from the PLAN.md `<verify>` blocks (2026-11-22); commands abbreviated, the plan's `<automated>` block is authoritative. 86-25 updates the Status column.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 86-01-T1 | 86-01 | 1 | SVC-01 | T-86-01 | host API re-read recorded before slice work (D-29) | doc gate | `grep '## Host API re-read (D-29)' 86-VALIDATION.md (13+ statused rows)` | ❌ W0 | ✅ green |
| 86-01-T2 | 86-01 | 1 | SVC-01 | — | ownership table amended (D-04, D-27) | doc gate | `grep '## Amendments' + the umu/macArch/runsForMe cells in 82-STATE-OWNERSHIP.md` | ✅ | ✅ green |
| 86-01-T3 | 86-01 | 1 | SVC-01 | T-86-01 | operator approves the reconciliation | manual | `checkpoint:decision (blocking-human)` | — | ✅ green |
| 86-02-T1 | 86-02 | 1 | SVC-01 | T-86-03 | four D-14 items UAT-shaped | uat parse | `node parseUatItemsWithStats 86-HUMAN-UAT.md (4 items, headingsSeen 0)` | ❌ W0 | ✅ green |
| 86-02-T2 | 86-02 | 1 | SVC-01 | T-86-02 | reachability review, literals, capture standard | uat parse | `section greps + pnpm planning-gates` | ❌ W0 | ✅ green |
| 86-03-T1 | 86-03 | 2 | SVC-01 | T-86-07 | no keyring/tauri in either crate (D-19) | unit + cli | `cd src-tauri && cargo test -p gamelib-info -p gamelib-info-cli; jest rustTestWorkflow cargoFeatures` | ❌ W0 | ✅ green |
| 86-03-T2 | 86-03 | 2 | SVC-01 | — | CacheView TTL, dotted keys, UTC Date() | unit | `cargo test -p gamelib-info --test cache_view` | ❌ W0 | ✅ green |
| 86-03-T3 | 86-03 | 2 | SVC-01 | T-86-04, T-86-05, T-86-07 | key never in error text; body cap; shutdown cancel | unit | `cargo test -p gamelib-info --features testing --test http_replay` | ❌ W0 | ✅ green |
| 86-04-T1 | 86-04 | 2 | SVC-01 | T-86-08 | recent_games golden before Rust (SC3) | oracle | `pnpm exec jest --runTestsByPath src/backend/info/__tests__/oracle/recentGames.oracle.test.ts` | ❌ W0 | ✅ green |
| 86-04-T2 | 86-04 | 2 | SVC-01 | T-86-09 | overrides and anticheat goldens (SC3) | oracle | `jest gameOverrides.oracle.test.ts anticheat.oracle.test.ts` | ❌ W0 | ✅ green |
| 86-04-T3 | 86-04 | 2 | SVC-01 | T-86-08 | no secret in any fixture | guard | `jest src/backend/info/__tests__/fixtureRedaction.test.ts` | ❌ W0 | ✅ green |
| 86-05-T1 | 86-05 | 2 | SVC-01 | T-86-10 | delete gate proven on images_cache (D-22) | delete gate | `jest infoPortComplete.test.ts appRuntime.test.ts diPhaseGates.test.ts; codecheck; find-deadcode` | ❌ W0 | ✅ green |
| 86-05-T2 | 86-05 | 2 | SVC-01 | T-86-10 | shim/resolver shape and schedule (D-06, D-24) | delete gate | `jest infoShimSchedule.test.ts` | ❌ W0 | ✅ green |
| 86-06-T1 | 86-06 | 3 | SVC-01 | T-86-11 | discounts recorded and golden | oracle | `jest discounts.oracle.test.ts fixtureRedaction.test.ts` | ❌ W0 | ✅ green |
| 86-06-T2 | 86-06 | 3 | SVC-01 | T-86-11 | crossover recorded and golden | oracle | `jest crossover.oracle.test.ts` | ❌ W0 | ✅ green |
| 86-06-T3 | 86-06 | 3 | SVC-01 | T-86-11, T-86-12 | wiki + umu recorded, D-23 tsOnly/rustOnly | oracle | `jest wiki.oracle.test.ts` | ❌ W0 | ✅ green |
| 86-07-T1 | 86-07 | 3 | SVC-01 | T-86-14 | steamgrid synthetic goldens | oracle | `jest steamgrid.oracle.test.ts -t synthetic` | ❌ W0 | ✅ green |
| 86-07-T2 | 86-07 | 3 | SVC-01 | T-86-14 | ITAD synthetic goldens | oracle | `jest storeSearch.oracle.test.ts -t synthetic` | ❌ W0 | ✅ green |
| 86-07-T3 | 86-07 | 3 | SVC-01 | T-86-13 | operator records keyed cases; no key committed | manual + oracle | `checkpoint:human-action, then jest both oracles + fixtureRedaction offline` | ❌ W0 | ✅ green |
| 86-08-T1 | 86-08 | 3 | SVC-01 | T-86-17 | recent add bytes = golden; Rust emit + tray (D-08) | golden + shell | `cargo test -p gamelib-info --features testing --test golden_recent; cargo test --bin gamelib-shell info_dispatch; pnpm check:ipc-contract` | ❌ W0 | ✅ green |
| 86-08-T2 | 86-08 | 3 | SVC-01 | T-86-15, T-86-16 | removeRecent native, one owner, no lost update | contract | `cargo test --bin gamelib-shell native_manifest_vectors; jest nativeChannelOwnership ipcDomainCensus` | ✅ extend | ✅ green |
| 86-08-T3 | 86-08 | 3 | SVC-01 | — | tray seed through the host (Pitfall 8) | unit | `cargo test --bin gamelib-shell tray::` | ✅ extend | ✅ green |
| 86-09-T1 | 86-09 | 4 | SVC-01 | T-86-18 | addRecentGame shim forwards only | unit | `jest src/backend/info/__tests__/recentGames.test.ts` | ❌ W0 | ✅ green |
| 86-09-T2 | 86-09 | 4 | SVC-01 | T-86-18 | recent TS + sidecar sniff deleted (SC4, D-08) | delete gate | `jest infoPortComplete infoShimSchedule tauriShellSource; cargo test --bin gamelib-shell tray::` | ✅ extend | ✅ green |
| 86-10-T1 | 86-10 | 5 | SVC-01 | T-86-20 | getAllGameOverrides native = golden | golden + contract | `cargo test --test golden_overrides; native_manifest_vectors` | ❌ W0 | ✅ green |
| 86-10-T2 | 86-10 | 5 | SVC-01 | T-86-19, T-86-20 | image cleanup confined to its dir | golden | `cargo test -p gamelib-info --features testing --test golden_overrides; overrides::` | ❌ W0 | ✅ green |
| 86-11-T1 | 86-11 | 6 | SVC-01 | T-86-22 | async override shims, gamedetails awaits | unit | `jest gameOverrides.test.ts; jest src/backend/gamedetails` | ❌ W0 | ✅ green |
| 86-11-T2 | 86-11 | 6 | SVC-01 | T-86-21 | overrides TS deleted, store row kept byte-identical | delete gate | `genStoreTable --check; git diff --quiet storeTable.json; jest storeTable storeKinds infoPortComplete` | ✅ extend | ✅ green |
| 86-12-T1 | 86-12 | 7 | SVC-01 | T-86-25 | getAnticheatInfo native = golden | golden + contract | `cargo test --test golden_anticheat; native_manifest_vectors` | ❌ W0 | ✅ green |
| 86-12-T2 | 86-12 | 7 | SVC-01 | T-86-23, T-86-24 | status/download, temp-then-rename, md-5 pinned | golden | `cargo test --test golden_anticheat anticheat::; jest cargoFeatures` | ❌ W0 | ✅ green |
| 86-12-T3 | 86-12 | 7 | SVC-01 | — | drift command opt-in (D-12) | cli | `cargo test -p gamelib-info-cli; drift --list` | ❌ W0 | ✅ green |
| 86-13-T1 | 86-13 | 8 | SVC-01 | T-86-26 | status before online wait (D-07, D-28) | unit | `jest anticheat.test.ts bootstrapWirings.test.ts sidecarRejectionGuard.test.ts` | ❌ W0 | ✅ green |
| 86-13-T2 | 86-13 | 8 | SVC-01 | — | anticheat TS deleted (SC4) | delete gate | `jest infoPortComplete infoShimSchedule enrichmentFlows` | ✅ extend | ✅ green |
| 86-14-T1 | 86-14 | 9 | SVC-01 | T-86-27, T-86-29 | keyring slots unchanged; owner semantics | unit | `cargo test --features testing --test secrets; cargo test --bin gamelib-shell info_secrets keyring` | ❌ W0 | ✅ green |
| 86-14-T2 | 86-14 | 9 | SVC-01 | T-86-28 | dev vault only when dev; migration proof order | unit | `cargo test --test secrets; cargo test --bin gamelib-shell info_secrets` | ❌ W0 | ✅ green |
| 86-14-T3 | 86-14 | 9 | SVC-01 | T-86-30 | baked ITAD key in the shell build (D-25) | meta | `jest --selectProjects Meta meta/__tests__/releaseItadKey.test.ts` | ❌ W0 | ✅ green |
| 86-15-T1 | 86-15 | 10 | SVC-01 | T-86-31 | steamgrid search native = golden | golden + contract | `cargo test --test golden_steamgrid; native_manifest_vectors` | ❌ W0 | ✅ green |
| 86-15-T2 | 86-15 | 10 | SVC-01 | T-86-32, T-86-33 | zod bounds in Rust decode | golden + contract | `cargo test --test golden_steamgrid steamgrid::; native_manifest_vectors` | ❌ W0 | ✅ green |
| 86-15-T3 | 86-15 | 10 | SVC-01 | T-86-34 | migration moved to Rust boot; TS deleted | delete gate | `jest infoPortComplete diPhaseGates + sidecar tests; cargo test --bin gamelib-shell info_dispatch` | ✅ extend | ✅ green |
| 86-16-T1 | 86-16 | 11 | SVC-01 | T-86-35 | searchStores native = golden; key never in errors | golden + contract | `cargo test --features testing --test golden_storeSearch; native_manifest_vectors` | ❌ W0 | ✅ green |
| 86-16-T2 | 86-16 | 11 | SVC-01 | T-86-36, T-86-38 | single-flight; comparator; bounds | golden | `cargo test --test golden_storeSearch itad::` | ❌ W0 | ✅ green |
| 86-16-T3 | 86-16 | 11 | SVC-01 | T-86-38 | key status = two booleans only | contract | `native_manifest_vectors; jest nativeChannelOwnership ipcDomainCensus` | ✅ extend | ✅ green |
| 86-17-T1 | 86-17 | 12 | SVC-01 | — | one ITAD coverage file for TS and Rust | unit | `jest storeMapping.test.ts storeRegion.test.ts; cargo test -p gamelib-info itad::` | ✅ extend | ✅ green |
| 86-17-T2 | 86-17 | 12 | SVC-01 | T-86-40 | storeSearch TS deleted; rows byte-identical | delete gate | `genStoreTable --check; git diff --quiet storeTable.json; jest storeTable storeKinds` | ✅ extend | ✅ green |
| 86-17-T3 | 86-17 | 12 | SVC-01 | T-86-39, T-86-41 | bake only in shell; gate passes | meta + delete gate | `jest releaseItadKey buildSidecarSea infoPortComplete; pnpm build:sidecar` | ✅ extend | ✅ green |
| 86-18-T1 | 86-18 | 13 | SVC-01 | T-86-42 | discounts = golden; resolver token only | golden + unit | `cargo test --features testing --test golden_discounts; jest src/backend/info/__tests__/discounts.test.ts` | ❌ W0 | ✅ green |
| 86-18-T2 | 86-18 | 13 | SVC-01 | — | fetcher deleted; resolver scheduled (D-24) | delete gate | `jest infoPortComplete infoShimSchedule electronReachLedger` | ✅ extend | ✅ green |
| 86-19-T1 | 86-19 | 14 | SVC-01 | T-86-47 | rating map via resolver; runner table drift | golden + unit | `jest runnerCapabilities.test.ts crossover.test.ts; cargo test --test golden_crossover` | ❌ W0 | ✅ green |
| 86-19-T2 | 86-19 | 14 | SVC-01 | T-86-44, T-86-45, T-86-46 | schema bounds, caps, bundled path | golden | `cargo test --features testing --test golden_crossover crossover::; jest cargoFeatures` | ❌ W0 | ✅ green |
| 86-19-T3 | 86-19 | 14 | SVC-01 | — | crossover drift cases | cli | `cargo test -p gamelib-info-cli; drift --list` | ✅ extend | ✅ green |
| 86-20-T1 | 86-20 | 15 | SVC-01 | T-86-50 | umu = golden (D-04) | golden | `cargo test -p gamelib-info --features testing --test golden_umu` | ❌ W0 | ✅ green |
| 86-20-T2 | 86-20 | 15 | SVC-01 | T-86-48 | JS regex parity (Pitfall 4); pcgw/agw = golden | vectors + golden | `cargo test --features testing --test regex_vectors --test golden_wiki_sources` | ❌ W0 | ✅ green |
| 86-20-T3 | 86-20 | 15 | SVC-01 | T-86-49 | protondb/deck/slug = golden | golden | `cargo test --features testing --test golden_wiki_sources; wiki::` | ❌ W0 | ✅ green |
| 86-21-T1 | 86-21 | 16 | SVC-01 | T-86-53 | gamesdb via D-23 GET, no GOG write | golden | `cargo test -p gamelib-info --features testing --test golden_wiki_sources` | ✅ extend | ✅ green |
| 86-21-T2 | 86-21 | 16 | SVC-01 | T-86-51, T-86-52 | HLTB headers pinned; creds memory-only | golden | `cargo test --features testing --test golden_wiki_sources; wiki::` | ✅ extend | ✅ green |
| 86-21-T3 | 86-21 | 16 | SVC-01 | T-86-53 | GOG HLTB via D-23 store link | golden | `cargo test --features testing --test golden_wiki_sources` | ✅ extend | ✅ green |
| 86-22-T1 | 86-22 | 17 | SVC-01 | T-86-54, T-86-56 | aggregator = golden; native one owner | golden + contract | `cargo test --features testing --test golden_wiki; native_manifest_vectors` | ❌ W0 | ✅ green |
| 86-22-T2 | 86-22 | 17 | SVC-01 | — | wiki get/clear ops | golden | `cargo test --test golden_wiki wiki::; check:ipc-contract` | ✅ extend | ✅ green |
| 86-22-T3 | 86-22 | 17 | SVC-01 | T-86-52 | one live drift run (Pitfall 11) | opt-in live | `cargo run -p gamelib-info-cli -- drift (recorded in summary); drift --list` | ✅ extend | ✅ green |
| 86-23-T1 | 86-23 | 18 | SVC-01 | T-86-57 | getUmuId shim forwards only | unit | `jest src/backend/info/__tests__/wiki.test.ts` | ❌ W0 | ✅ green |
| 86-23-T2 | 86-23 | 18 | SVC-01 | T-86-57 | wiki resolver + clear shim scheduled | unit + gate | `jest wiki.test.ts infoShimSchedule.test.ts; codecheck; lint` | ✅ extend | ✅ green |
| 86-24-T1 | 86-24 | 19 | SVC-01 | T-86-58 | wiki + crossover TS deleted; rows byte-identical | delete gate | `genStoreTable --check; git diff --quiet storeTable.json; codecheck; jest storeTable storeKinds createStores appRuntime` | ✅ extend | ✅ green |
| 86-24-T2 | 86-24 | 19 | SVC-01 | T-86-59 | census agrees with the tree | census | `jest diPhaseGates bootSourceShape storeLayer shortcutsFlows enrichmentFlows; find-deadcode` | ✅ extend | ✅ green |
| 86-24-T3 | 86-24 | 19 | SVC-01 | T-86-59 | oracle retired; nine describes pass (SC4) | delete gate | `jest infoPortComplete infoShimSchedule fixtureRedaction; cargo test -p gamelib-info --features testing` | ✅ extend | ✅ green |
| 86-25-T1 | 86-25 | 20 | SVC-01 | T-86-62 | clean-worktree proof, SC4 sweep, drift run | phase proof | `full suite at P (see plan); grep '## Phase proof' '## SC4 sweep' '## Drift run'` | — | ⚠️ red at P; R1-R4 fixed (`dd7872126`, `1a58fe646`), R5 deferred |
| 86-25-T2 | 86-25 | 20 | SVC-01 | T-86-60 | push and release authorised | manual | `checkpoint:decision` | — | ✅ green (`push-and-build-ask`) |
| 86-25-T3 | 86-25 | 20 | SVC-01 | T-86-61 | three-OS CI (D-16); signed identity (D-15) | CI proof | `gh run view per leg; grep '## CI proof' 'Gate item 4:'` | — | ✅ CI green; identity matched at 86-26 (run 45056179067, v0.12.0; was blocked at 86-25: dry run, no artifact) |
| 86-26-T1 | 86-26 | 21 | SVC-01 | — | literals re-checked before the run | uat | `grep '## Pre-run re-check'; no CONDITIONAL in Required literals` | — | ⬜ pending |
| 86-26-T2 | 86-26 | 21 | SVC-01 | T-86-63, T-86-64 | operator runs the four items | manual | `checkpoint:human-action (blocking-human)` | — | ⬜ pending |
| 86-26-T3 | 86-26 | 21 | SVC-01 | T-86-63 | items scored in UAT shape | uat parse | `node parseUatItemsWithStats; no result: pending; pnpm planning-gates` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src-tauri/crates/gamelib-info{,-cli}` scaffold plus the CI/Cargo/README/`cargoFeatures` registration checklist (86-03)
- [ ] `src/backend/info/__tests__/oracle/{recorder,harness}.ts`, per-slice `<slice>.oracle.test.ts`, permanent `fixtureRedaction.test.ts` (86-04)
- [ ] TS golden harnesses for `anticheat`, `recent_games`, `game_overrides` (D-11, 86-04); recorded fixtures then TS goldens for discounts, crossover, wiki + umu (86-06) and ITAD, SteamGridDB (86-07, operator records the keyed cases). No `images_cache` harness (D-22: deleted)
- [ ] State fixtures: synthetic or from the 85 redacted corpus (86-04, 86-06, 86-07)
- [ ] `86-HUMAN-UAT.md` (four D-14 items, UAT-shape convention) (86-02)
- [ ] `infoPortComplete.test.ts`, `infoShimSchedule.test.ts`, `src/backend/testUtils/infoPortGate.ts` (86-05)
- [ ] `src/common/runnerCapabilities.json` with a TS drift test, read by Rust (86-19)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| D-14 live gate on a signed 86 build over a signed 85 build | SVC-01 | Keychain prompts and signing cannot run in CI | `86-HUMAN-UAT.md`, four items |
| D-12 live drift check against real services | SVC-01 | Needs live keys and network; kept out of CI | `cargo run -p gamelib-info-cli -- drift` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

---

## Host API re-read (D-29)

Re-read 2026-11-22 (86-01, Task 1) at HEAD `8805d74cdee363f3119e7967c3fc8844ea8d5282`, after Phase 85 shipped: 85-01 through 85-25 each have a SUMMARY (`status: complete`, 85-19 to 85-25 completed 2026-11-22) and `85-VERIFICATION.md` reads `human_needed`, 8/8. Status words: MATCH = the shipped symbol is what 86 assumes, RENAMED = it exists under another name or shape (the plans must use the shipped one), MISSING = not shipped. Paths are relative to the repo root; `host.rs` is `src-tauri/crates/gamelib-store/src/host.rs`.

| # | assumed by 86 | used in | shipped name and file:line | status |
|---|---------------|---------|----------------------------|--------|
| 1 | `StoreHost` with open / get / set / remove / apply / snapshot / on_change | 86-03 (`CacheView`), 86-08, 86-10, 86-12, 86-16 | `StoreHost` struct `host.rs:555` (`new` 572, `with_writer` 582, `on_any_change` 600, `post` 608, `wait_idle` 619, `evict_path` 640). Open is split three ways: `open_cache(dir, name)` 678, `open_doc(key, path)` 705 (settings documents only), `open_row(&TableRow, path)` 733. The per-store handle is `Store` `host.rs:279`: `get` 305, `set` 313, `remove` 327, `apply(op, origin)` 341, `apply_reporting` 349, `snapshot` 401, `snapshot_with_rev` 407, `on_change` 421, `rev` 431. A `CacheView` opens a cache through `open_cache` and a user-state store (`game-overrides`, `store/config`) through `open_row` with the table row, never through `open_doc` | RENAMED |
| 2 | the write-origin type 85-09 calls `Origin` | 86-08, 86-10 (Rust-originated writes) | `Origin { Rust, Sidecar { seq }, Renderer }` `host.rs:44`. `Store::set` and `Store::remove` apply as `Origin::Rust` (`host.rs:313-340`). A leaf's write uses `Origin::Rust` | MATCH |
| 3 | the accessor for the booted host, and where `open_all` runs | 86-03 CLI-free context, 86-08 tray seed, every shell dispatcher | `store_boot::host()` `src-tauri/src/store_boot.rs:242` (a `OnceLock<Arc<StoreHost>>` at :238, created on first ask). `store_boot::open_all` `store_boot.rs:168` (bounded wrapper over `open_all_with` :119) runs in `run_setup` at `src-tauri/src/main.rs:1867`, before `store_dispatch::configure` (:1886), `install_renderer_push` (:1890) and the sidecar spawn (:1913). `run_setup` starts at `main.rs:1837` | MATCH |
| 4 | the `NativeCtx` field that carries the host and the `emitter` field | 86-08 (`recentGamesChanged`), every native channel | `NativeCtx` `src-tauri/src/native_router.rs:61`: `store_host: Arc<StoreHost>` :65, `emitter: Arc<dyn FrontendEmitter>` :67, `store_reads: store_native::StoreReads` :74. Built at `main.rs:1899-1902` from `store_boot::host()` and `steampoll_dispatch::TauriFrontendEmitter`. `NativeCtx::for_tests` :81 gives a fresh `StoreHost::new()` and a `NullEmitter` | MATCH |
| 5 | a mechanism that keeps a `storeTable.json` row when its TS registration is deleted, and the regen command | 86-11, 86-17, 86-24 (delete wikigameinfo, umu, crossover_index, itad_prices, itad_steam_gids, game-overrides) | `EXTRA_ROWS` `meta/genStoreTable.ts:114` (typed `Omit<Row, 'family' \| 'chain'>[]`; today it holds `steam_update_prompt_ack`, `steam_engine_notices`, `store/migrations`, `store/uploadedLogs`, `settings/global`, `settings/game`). `buildStoreTable` :222 merges the rows built from `registeredStores.json` with `EXTRA_ROWS`; `familyOf` :168 derives `family` from `kind` (cache stays `cache`, user-state stays `user-state`). Regen: `node meta/runTs.cjs --bundle --platform=node --target=node22 meta/genStoreTable.ts`, `--check` fails on any difference. None of the six stores is in `EXTRA_ROWS` yet: their rows come from the TS registrations, so deleting a registration drops the row unless the same commit adds it. Each added row must carry the current `tsNames`: `resolve_renderer_store` (`store_native.rs:74`) finds the renderer's name through `ts_names`, so a row without `wikigameinfo` breaks the renderer's wiki read. Current values to copy: `store_cache/wikigameinfo` (`storeTable.json:676`), `store_cache/umu` (:664), `store_cache/crossover_index` (:256), `store_cache/itad_prices` (:448), `store_cache/itad_steam_gids` (:460), `store/game-overrides` (:172, `tsNames: ["gameOverridesStore"]`, user-state). `src/backend/__tests__/storeMirrorSchedule.test.ts` pins the mirror-deletion cell of each (see Task 2 deviation) | MATCH |
| 6 | a `storeOwnership.json` flag for each of the six stores and for `store/config` | 86-11, 86-17, 86-24 delete-gate wording; 86-01 plan text only | The flag does not exist. 85-21 (D-03) deleted `storeOwnership.json`, the rollback flag and `GAMELIB_STORE`; `src/backend/stores/storeFrames.ts:18-24` states it: "no rollback flag and no ownership file: every row the shell opens is Rust's". Ownership is now the table's `family`: `is_rust_owned(row)` is `row.family != Family::Excluded` (`store_boot.rs:39`), and only `store/migrations` is `excluded`. All six stores are Rust's: `store_cache/wikigameinfo`, `umu`, `crossover_index`, `itad_prices`, `itad_steam_gids` are family `cache`; `store/game-overrides` is `user-state` (`storeTable.json:180`); `store/config` is family `settings` with flavour `store` (`storeTable.json:148-157`, so `Op::Set` is accepted: `host.rs:363` refuses non-Replace only for flavour `settings`). No later 86 plan names the flag; no slice needs to flip anything | RENAMED |
| 7 | whether a Rust-originated write to `store/config.json` (`games.recent`, D-08) and `store/game-overrides.json` can be overwritten by a later TS mirror write | 86-08 (recent), 86-10 (overrides), 86-09 and 86-11 (the TS writers die) | A Rust write reaches the TS mirror: a `StoreHost` change from any origin but the sidecar becomes `storeMirrorEvent {op:"changed", store, rev, key?, valueJson?}` (`src-tauri/src/store_dispatch.rs:333-366`, one ordered queue), and `MirrorCell` applies it when its rev is above `baseRev` (`src/backend/stores/mirrorCell.ts`, rule 8). 85-17 SUMMARY: "Everything the sidecar's mirror hears now leaves from the host's single dispatcher thread, in order ... A renderer or Rust change is sent as `changed`". A TS mirror write cannot clobber it by replace or clear: nothing in `src/backend` outside tests calls `clear()`, `reset()`, `replace()` or `.store =` on `kvs.configStore` or `gameOverridesStore` (checked by search, 2026-11-22; the `.clear()` hits are `humble`, `gog` and `steam` account stores). It can overwrite by a per-key `set` computed from a stale mirror view: `recent_games.ts:23` sets the whole `games.recent` list and `game_overrides/index.ts:103` sets the whole `overrides` object, each after a read-modify-write on the mirror. That only loses an update if a Rust write lands between the TS read and its `set` frame, so the carried precondition is below | MATCH |
| 8 | the jest store sink the TS oracle harness writes through | 86-04 (oracle harness), every oracle test | `createDiskStoreSink(options)` `src/backend/testUtils/diskStoreSink.ts:59` (`DiskStoreSink` :30, `DiskStoreSinkOptions` :36), the in-process stand-in for the Rust owner. It is `createTestStoreRoot`'s default frame sink (`src/backend/testUtils/testStoreRoot.ts:46`), with a `recordFrames` option. It applies each frame to the store's file the way the shell's writer does, so an oracle reads before and after bytes from the real file | MATCH |
| 9 | the renderer read path for `wikigameinfo` (85-16) | 86-22 (wiki get and clear), 86-24 | The renderer reads through the native `store_fetch` `src-tauri/src/store_native.rs:694` (served from `StoreHost`, reply `{ values, rev? }`) and the boot snapshot, both resolved by `resolve_renderer_store` `store_native.rs:74` through the row's `ts_names`. Policy: `wikigameinfo` is allow-listed as `"*"` in `src/common/types/ipc/storeChannels.json:49` and listed at :91 (lazy tier). Consumer: `src/frontend/screens/Library/useWikiMetacriticScores.ts` (`storeEnsureHydrated('wikigameinfo')` :58, `storeGet` :102, `storeOnChanged` :45). So Rust writing `store_cache/wikigameinfo.json` through the host reaches the renderer by `storeChanged` with no TS | MATCH |
| 10 | `src/backend/cache.ts` `CacheStore` still present for other caches (86 reimplements its semantics, never deletes it, D-01) | 86-03 (`CacheView`), Pitfall 5 | `export default class CacheStore` `src/backend/cache.ts:6`; its `set` and `get` are the TTL layer `CacheView` copies (key plus `__timestamp.<key>`, `lifespan`, `invalidateCheck`). Still the base of every other cache store. The working tree has an uncommitted edit to `cache.ts` and `src/backend/__tests__/cache.test.ts` from a separate GOG-offline debug session; 86 does not touch either file | MATCH |
| 11 | the current form of `tray/recent.rs` `load_recent_games_from_disk` and whether it reads through the host | 86-08 Task 3 (Pitfall 8) | Unchanged: `load_recent_games_from_disk(limit)` `src-tauri/src/tray/recent.rs:431` still reads `<appFolder>/store/config.json` directly (`read_json_file`, `games.recent`). It is NOT through the host. Its only caller, `seed_tray_recent_games` `main.rs:1534`, is called at `main.rs:1959` inside `run_setup`, after `open_all` (:1867), so the order is already safe and 86-08 only has to swap the read for `store_boot::host()`. The live relay is still present: `RECENT_GAMES_CHANGED_CHANNEL` `tray/recent.rs:37`, observed at `src-tauri/src/sidecar.rs:533` (D-08 deletes it) | MATCH |
| 12 | the per-kind durability rule and the `store` exit drain (D-20 interplay) | 86-03 (cache writes), 86-08, 86-10 | `durability_of(kind)` `host.rs:458`: `Cache` is `Unsynced`, `UserState`, `Account` and `Settings` are `Synced`. So the five caches write unsynced and `game-overrides` and `store/config` (`games.recent`) write synced. Every apply holds an `InFlight` guard (`host.rs:354`, type :247) and `store_boot::drain(bound)` `store_boot.rs:252` (called from `handle_exit`, `main.rs:959`) waits for the sidecar's queued frames and then for `StoreHost::wait_idle`. A leaf that writes through `Store::apply` or `set` is therefore covered by the existing `store` drain and needs no registrant of its own for the file write; its network tasks still hold a `gamelib_core::shutdown::global()` Registrant (D-20) | MATCH |
| 13 | which of 85-21 to 85-25 have a SUMMARY, and which TS files they changed that 86 also edits | every 86 plan that edits `createStores.ts`, `services/types.ts`, `testServices.ts`, store types | All of 85-19, 85-20, 85-21, 85-22, 85-23, 85-24 and 85-25 have a SUMMARY with `status: complete`, so nothing from Phase 85 is still open and no 86 edit can overlap a running 85 plan. Files 85 changed that 86 also edits: `src/backend/stores/createStores.ts` (85-21, `eea0c79c7`), `src/backend/stores/storeRoot.ts` (85-21, 85-23, 85-24), `src/backend/stores/types.ts` (85-24), `src/backend/services/types.ts` (85-23), `src/backend/testUtils/testServices.ts` (85-22, 85-23), `src/backend/store_backend.ts` (85-21, 85-24), `src/common/types/typed_store.ts` (85-21). 86's plans were written against this post-85 shape (no `GAMELIB_STORE` or ownership symbol appears in any 86 plan except 86-01 itself) | MATCH |

### Scope check (D-01)

`git ls-files` at HEAD `8805d74cd`, files (non-test) per slice: `src/backend/wiki_game_info` 24 (14), `crossover_index` 12 (6), `storeSearch` 20 (7), `discounts` 3 (1), `anticheat` 1 (1), `recent_games` 1 (1), `game_overrides` 2 (2), `steamgrid` 5 (3); plus `src/backend/images_cache.ts` 1 (deleted, not ported, D-22) and `src/backend/sidecar/steamgridSecretStore.ts` 1 (D-19). That is the eight slice directories of D-01. Not 86's: `online_monitor.ts` and `connectivityNow.ts` (88), `gamedetails/` 3 files, `macArch/` 3, `signInProbe/` 13, `runsForMe/` 3, `appshell/` 6 and `cache.ts`. A scan of every `86-*-PLAN.md` `files_modified` for those names finds exactly two hits, `src/backend/gamedetails/dispatch.ts` and `src/backend/gamedetails/overrides.ts` in 86-11 (the await ripple, Pitfall 9), and none for `online_monitor`, `macArch`, `signInProbe`, `runsForMe`, `appshell` or `cache.ts`. The scope holds.

### Result and carried preconditions

No row is MISSING and no Phase 85 plan is open. Two rows differ from the 86 plans' wording and need no plan revision: row 1 (open is `open_cache`, `open_row` or `open_doc`) and row 6 (there is no ownership flag; the table `family` replaced it). Carried into later plans:

- **86-08 and 86-10 (row 7):** a Rust op that writes `games.recent` or `overrides` must not go live while the TS writer for the same key (`recent_games.ts:23`, `game_overrides/index.ts:103`) is still a reachable path, because both are whole-key read-modify-write writes from the mirror view. The Rust ops are added first and unreachable from callers until 86-09 and 86-11 turn the TS writers into forwarding shims in the same change that routes callers to them. The mirror itself stays current through `changed` events, so TS reads after a Rust write are correct.
- **86-11, 86-17, 86-24 (row 5):** the commit that deletes a store's TS registration also adds its `EXTRA_ROWS` entry, with the current `tsNames`, and regenerates `storeTable.json` with the row byte-identical (`git diff --quiet src/common/types/ipc/storeTable.json`). It also moves the store's cell in `storeMirrorSchedule.test.ts` if the cell is not already 86.
- **86-08 Task 3 (row 11):** the tray seed becomes a read through `store_boot::host()`, called after `open_all` as it already is.

---

## Phase proof

Measured 2026-11-23 (86-25 Task 1) at the candidate head **P = `6d9654265f689b5df4aff1293e1ac672bd36e008`** (`docs(86-24): complete the wiki and CrossOver TS delete plan`), the HEAD of `main` after 86-24's SUMMARY commit. All 24 plan SUMMARYs (86-01..86-24) exist; every commit hash those SUMMARYs cite and that resolves to a commit (125 of them) is an ancestor of P, none is not. The phase base is `8805d74cd` (86-01's `plan_head_before`); P is 138 commits above it, several of them Phase 85 review-fix commits from another session.

Clean worktree: `git worktree add --detach <scratchpad>/clean-86 6d9654265f689b5df4aff1293e1ac672bd36e008`, `git status` empty before and after the run, HEAD read back as `6d9654265f689b5df4aff1293e1ac672bd36e008`, then removed (`git worktree remove --force`, `git worktree list` no longer shows it). Because the worktree is a checkout of the commit, it carries none of the main tree's foreign-dirty edits (cache.ts, handlers.ts, the gog files, controls.rs, meta/i18n*): P is what a push would publish. Prep inside it: `pnpm install --frozen-lockfile` (lockfile up to date), `pnpm exec vite build`, `pnpm build:sidecar-sea` (arm64 SEA sidecar, real, not a placeholder).

| # | Command (cwd = the clean worktree; Rust steps in `src-tauri`) | Result | Counts |
|---|---------------------------------------------------------------|--------|--------|
| 1 | `pnpm exec vite build` | pass | built |
| 2 | `pnpm build:sidecar-sea` | pass | arm64 verified |
| 3 | `cargo test -p gamelib-safety -p gamelib-testutil` (rust-test.yml step 1) | pass | 95 passed, 0 failed |
| 4 | `cargo test -p gamelib-proc` (step 2) | pass | 29 passed, 0 failed |
| 5 | multi-crate `cargo test -p gamelib-scan ... -p gamelib-store -p gamelib-store-cli -p gamelib-info -p gamelib-info-cli` (step 3, verbatim) | pass | 2206 passed, 0 failed, 7 ignored |
| 6 | `cargo test -p gamelib-info --features testing` | pass | 360 passed, 0 failed |
| 7 | static codec linkage: `cargo build -p gamelib-depot-cli` + `otool -L` grep for lzma/zstd/zlib | pass | no dynamic codec |
| 8 | `cargo test --bin gamelib-shell` | pass | 763 passed, 0 failed, 2 ignored |
| 9 | darwin clippy ratchet: `cargo +1.99.1 clippy --workspace --all-targets --message-format=json` then `node ../meta/clippyRatchet.cjs <json> --list` | **FAIL** | 3 ceilings exceeded, see Red items |
| 10 | `pnpm codecheck` | pass | |
| 11 | `pnpm lint` | pass | 0 errors, 7 warnings |
| 12 | `pnpm prettier` (`prettier --check .`) | pass | |
| 13 | `pnpm i18n --fail-on-update` | pass | |
| 14 | `pnpm find-deadcode` | pass | 310 baselined knip findings |
| 15 | `pnpm boundaries` | pass | 1370 modules, 8388 dependencies, no violations |
| 16 | `pnpm steam-line-ceiling` | pass | 206 files, 0 allowlisted over 1000 |
| 17 | `pnpm backend-di-ceilings` | **FAIL** | 2 violations, both foreign, see Red items |
| 18 | `pnpm gameinfo-narrowing-ceiling` | pass | 866 files, 42 allowlisted |
| 19 | `pnpm check:ipc-contract` | pass | ipc_contract.rs and ipcSchemaSnapshot.json up to date |
| 20 | `pnpm smoke:exit-check -- --mode eof` | pass | verdict PASS, exit latency 9 ms |
| 21 | `pnpm smoke:sidecar` | pass | built, READY written, exit 0 on stdin EOF |
| 22 | `pnpm planning-gates` | pass | 12/12 |
| 23 | `pnpm test` (all 6 jest projects) | **FAIL (1 test)** | 1131 suites: 1124 passed, 6 skipped, 1 failed; 24397 tests: 24356 passed, 40 skipped, 1 failed |
| 24 | `cargo tree -p gamelib-info-cli \| grep -c keyring` (D-19) | pass | 0 |

The pre-push hook (`.husky/pre-push`) runs rows 10-18 (codecheck, lint, prettier, i18n, find-deadcode, boundaries, steam-line-ceiling, backend-di-ceilings, gameinfo-narrowing-ceiling) and exits non-zero on any failure, so **row 17 would stop a push (the hook never runs with `--no-verify` here)**. The clippy ratchet (row 9) is the last step of rust-test.yml's macOS and Windows legs, so it would turn those two legs red.

### Red items at P

| # | Item | Cause | Classification | Fix |
|---|------|-------|----------------|-----|
| R1 | clippy `cloned_ref_to_slice_refs` 6 found, ceiling 2 | `info_dispatch.rs:1861` (86-15, `b425fa3d2`), `:2031`, `:2033`, `:2035` (86-16, `2ca381f61`), all in `#[cfg(test)]` code (`&[arg.clone()]`); the other 2 are `single_instance.rs:686`, `:870` (71-16, predate the phase) | 4 **phase-86-caused**, 2 pre-existing | `std::slice::from_ref(&arg)` at the four sites |
| R2 | clippy `type_complexity` 4 found, ceiling 2 | `info_dispatch.rs:1122` `recording_sink()` return tuple (86-08, `604e8f425`, test code) and `native_router.rs:137` `CheckedReply` (`fix(85): B-WR-08`, `a8fcd4a2b`, a Phase 85 review fix landed after the 86 base); `shell_state.rs:14` and `store_embed/state.rs:653` predate the phase | 1 **phase-86-caused**, 1 **phase-85-review-fix-caused (in the 86 range)**, 2 pre-existing | type aliases for the two new tuples/sender |
| R3 | clippy `dead_code` 2 found, ceiling 1 | `native_router.rs:255` `spawn_slice_worker` is now used only from tests (`fix(85): B-WR-01`, `4a743b730`, switched the one production call to `spawn_slice_worker_with`); `store_embed/state.rs:303` `observe_live_url` (71-12) predates the phase | 1 **phase-85-review-fix-caused (in the 86 range)**, 1 pre-existing | `#[cfg(test)]` on `spawn_slice_worker` |
| R4 | `pnpm backend-di-ceilings` | `src/backend/storeManagers/steam/__tests__/optInDlc.test.ts` (6 jestMock) and `src/frontend/state/__tests__/libraryStoreFollowers.test.ts` (2 jestMock) have no baseline entry; both files were last touched before the 86 base (`3d4340bc0`, `c4dc3df27`, 2026-11-22) | pre-existing, foreign | baseline them or remove the mocks (not Phase 86 work) |
| R5 | `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT | the committed `meta/i18nForkTouchedFiles.json` lacks `src/frontend/components/UI/WikiGameInfo/components/HowLongToBeat/index.tsx`, which 86-23 (`3dbdd45c4`) modified. It fails in the **clean** worktree too, so it is the stale committed artifact, not the main tree's foreign-dirty meta/i18n files | **phase-86-caused** (86-23) | `pnpm gen-i18n-gate-scope`, then commit `meta/i18nForkTouchedFiles.json` (and `i18nGateScope.json` if it moves), as `ee1995796` did |

How R1-R3 were attributed: each flagged `file:line` from the ratchet's `--list` was `git blame`d at P; a line whose commit is in `8805d74cd..P` is "in the 86 range". The ratchet's per-lint ceilings (2 / 2 / 1) equal the number of lines that predate the range, so the excess is exactly the in-range lines. The base itself was not re-measured with clippy, so "pre-existing" is by blame and by that arithmetic, not by a baseline run. The other darwin ratchet entries (doc_lazy_continuation 5, unnecessary_to_owned 2, non_snake_case 2, incompatible_msrv 1, manual_hash_one 1, bool_comparison 1, needless_borrows_for_generic_args 1, if_same_then_else 1) are at their ceilings and all predate the phase. At P `non_snake_case` is 2 (`wake_lock.rs:375`, `main.rs:3746`), not the 19 the carry-forward notes recorded for `--all-targets -D warnings`. Windows has its own ceiling map (win32) that was not measured here; the windows-latest leg is its measurement.

Fix status: **none of R1-R5 is fixed at P** (86-25 Task 1 records them; a source edit to `info_dispatch.rs` / `native_router.rs` was attempted and refused by the permission system, so it was not retried). Landing R1-R3 at once brings the counts to exactly the ceilings (2 / 2 / 1) with no ceiling change; R5 needs a regenerated artifact; R4 needs a baseline decision before any push, because the hook runs it.

Fix status after Task 2 (operator decision `push-and-build-ask`, fixes authorised before the push): **R1-R3 fixed** in `dd7872126` (`std::slice::from_ref` at the four sites, two type aliases, `#[cfg(test)]` on `spawn_slice_worker`; local darwin ratchet on 1.99.1 PASS at `cloned_ref_to_slice_refs` 2/2, `type_complexity` 2/2, `dead_code` 1/1, no ceiling changed). **R4 fixed** in `1a58fe646` by removing the `jest.mock` calls (DI seams in `optInDlc.ts` and `tauriIpcRoute.ts`), not by baselining them; `pnpm backend-di-ceilings` PASS. **R5 deferred** by the operator ("later"): `meta/i18nForkTouchedFiles.json` is still stale and is an open item; it does not turn CI red because A-17's git-based ANTI-ROT block skips in CI's shallow clone (the Test run below shows `PASS Meta meta/__tests__/genI18nGateScope.test.ts`), so it is red locally only.

---

## SC4 sweep

Run in the clean worktree at P `6d9654265f689b5df4aff1293e1ac672bd36e008`.

| Check | Result |
|-------|--------|
| nine `infoPortComplete` describes (`imagesCache`, `recentGames`, `gameOverrides`, `anticheat`, `steamgrid`, `storeSearch`, `discounts`, `wiki`, `crossover`) plus `oraclePortComplete` and the scans describe, and `infoShimSchedule` | `jest --runTestsByPath infoPortComplete.test.ts infoShimSchedule.test.ts`: 2 suites, 237 tests, all passed |
| no file under `src/backend/{wiki_game_info,crossover_index,storeSearch,anticheat,recent_games,game_overrides,steamgrid}` | none of the seven directories exists; `git ls-files src/backend` filtered to them prints nothing |
| `src/backend/images_cache.ts` | gone |
| `src/backend/discounts/fetchDiscounts.ts` | gone (`src/backend/discounts/` holds only `__tests__/badges.test.ts` and `__tests__/storeSearchBadges.test.ts`) |
| every survivor is a scheduled shim or resolver | `src/backend/info/` holds exactly `anticheat.ts`, `crossover.ts`, `discounts.ts`, `gameOverrides.ts`, `recentGames.ts`, `wiki.ts`; `infoShimSchedule.test.ts` passes (it pins each to a `deletedBy` row) |
| `cache_view.rs` contains no `std::fs` | `grep -c "std::fs" src-tauri/crates/gamelib-info/src/cache_view.rs` = 0 (no `fs::` use either) |
| D-01 out-of-scope list untouched: `git diff --name-only 8805d74cd..P` against online_monitor, macArch, runsForMe, appshell, signInProbe, `cache.ts` | no path matches any of the six names |
| `gamedetails` changed only in `dispatch.ts` and `overrides.ts` | `git diff --stat 8805d74cd..P -- src/backend/gamedetails`: `dispatch.ts` (10), `overrides.ts` (53) and **also** `__tests__/gameDetailsModules.test.ts` (26), all from 86-11 `73e25675a` (the await ripple of the async override shims). The test change follows the two source files it exercises, so it is within the D-01 intent; it is recorded because the literal list names only the two source files |
| `cargo tree -p gamelib-info-cli \| grep -c keyring` (D-19) | 0 |

---

## Drift run

`cargo run -q -p gamelib-info-cli -- drift` at P, 2026-11-23, network on, with `GAMELIB_INFO_ITAD_KEY` and `GAMELIB_INFO_SGDB_KEY` unset in that process (`env -u`), so the keyed cases print their skip line. No key was read or used. Exit 0.

```
PASS anticheat-download-mac
PASS anticheat-download-linux
PASS anticheat-lookup
SKIP steamgrid-search: GAMELIB_INFO_SGDB_KEY is not set
SKIP steamgrid-grids: GAMELIB_INFO_SGDB_KEY is not set
SKIP steamgrid-heroes: GAMELIB_INFO_SGDB_KEY is not set
SKIP itad-search: GAMELIB_INFO_ITAD_KEY is not set
SKIP itad-deals: GAMELIB_INFO_ITAD_KEY is not set
SKIP itad-gids: GAMELIB_INFO_ITAD_KEY is not set
PASS gog-discounts
PASS crossover-index-fetch
PASS crossover-rating-map
PASS wiki-steam-mac
PASS wiki-steam-linux
PASS wiki-steam-windows
PASS wiki-epic-mac
PASS wiki-epic-linux
PASS wiki-gog-mac
PASS wiki-gog-linux
PASS wiki-umu
```

14 PASS, 6 SKIP (all keyed, as designed), 0 FAIL. The six keyed cases stay unproved live until the operator runs them in their own terminal with their own keys; their replay proofs are in `cargo test -p gamelib-info --features testing` (row 6 above).

---

## CI proof

Collected 2026-11-23 (86-25 Task 3) with `gh run list --commit <sha>` and `gh run view <id> --json jobs`; times are UTC.

**Pushes (operator decision `push-and-build-ask`).** Immediately before the first push, `git diff --name-only P HEAD` listed `86-VALIDATION.md` plus the six R1-R4 fix paths (`src-tauri/src/info_dispatch.rs`, `src-tauri/src/native_router.rs`, `src/backend/storeManagers/steam/optInDlc.ts`, its `__tests__/optInDlc.test.ts`, `src/frontend/state/__tests__/libraryStoreFollowers.test.ts`, `src/frontend/testUtils/tauriIpcRoute.ts`). The plan's rule is to push only if every path is under `.planning/`; the non-`.planning` paths were exactly the fixes the operator authorised before the push, so the push went ahead on that authorisation. The verbatim list is in 86-25-SUMMARY.md.

| Push | Range | Pre-push hook | Contents |
|------|-------|---------------|----------|
| 1 | `88b48b70d..1a58fe646` | passed (never `--no-verify`) | 86-25 Task 1 (`5303061fa`), R1-R3 (`dd7872126`), R4 (`1a58fe646`) |
| 2 | `1a58fe646..0f3e6e9e9` | passed | `0f3e6e9e9` (url 2.5.8 -> 2.5.9, form_urlencoded 1.2.3, for RUSTSEC-2026-0592; authorised by the operator after push 1's Supply-chain audit failed on that advisory) plus another session's commits `49f03ab67..f7c4f6b18` (quick-261123-928 and fast tasks) |
| (foreign) | `0f3e6e9e9..4e1af5463` | n/a | another session's quick-261123-9i7 (`3a4d64220`, `4e1af5463`), pushed seconds later; GitHub triggered no runs for `0f3e6e9e9` itself |

**Runs at `1a58fe646`** (push 1):

| Workflow | Run id | Leg | Conclusion |
|----------|--------|-----|------------|
| Test (test.yml) | 45051034925 | ci | success |
| Code check (codecheck.yml) | 45051034871 | codecheck | success |
| Lint | 45051034868 | lint | success |
| Rust test (rust-test.yml) | 45051034867 | cargo-test (ubuntu-latest) | success |
| | | cargo-test (macos-latest) | success |
| | | cargo-test (windows-latest) | cancelled (superseded by the push-2 run) |
| Supply-chain audit | 45051034887 | cargo-deny | **failure** (RUSTSEC-2026-0592, url 2.5.8; fixed by `0f3e6e9e9`) |
| | | pnpm-audit | success |
| Release Tauri (release-tauri.yml, `workflow_dispatch`, `dry_run=true`) | 45051040572 | macOS `aarch64-apple-darwin` | success (completed 17:58:40) |
| | | Linux `ubuntu-22.04` | success |
| | | Windows `windows-latest` | success |

**Runs at `4e1af5463`** (the first head with runs that contains every 86-25 commit; its only commits above `0f3e6e9e9` are the foreign quick-261123-9i7 pair):

| Workflow | Run id | Leg | Conclusion |
|----------|--------|-----|------------|
| Rust test (rust-test.yml) | 45052890985 | cargo-test (ubuntu-latest) | success |
| | | cargo-test (windows-latest) | success |
| | | cargo-test (macos-latest) | success |
| Code check (codecheck.yml) | 45052890933 | codecheck | success |
| Test (test.yml) | 45052890886 | ci | success (1118 suites passed, 13 skipped; 24152 tests passed, 245 skipped) |
| Lint | 45052891061 | lint | success |
| Supply-chain audit | 45052890967 | cargo-deny | success |
| | | pnpm-audit | success |

The clippy ratchet is the last step of the macOS and Windows rust-test legs, so both legs being green is the CI measurement of R1-R3 on darwin and win32 (the win32 ceiling map was never measured locally).

**gamelib-info golden replay per leg** (run 45052890985, step "cargo test (gamelib-core, ... gamelib-store and gamelib-info crates)", read from each job's log with ANSI stripped; one row per test binary):

| Binary | ubuntu-latest | windows-latest | macos-latest |
|--------|---------------|----------------|--------------|
| `gamelib-info` unit tests (`src/lib.rs`) | 129 passed | 128 passed | 129 passed |
| `tests/cache_view.rs` | 20 | 20 | 20 |
| `tests/golden_anticheat.rs` | 12 | 12 | 12 |
| `tests/golden_crossover.rs` | 7 | 7 | 7 |
| `tests/golden_discounts.rs` | 13 | 13 | 13 |
| `tests/golden_overrides.rs` | 16 | 16 | 16 |
| `tests/golden_recent.rs` | 8 | 8 | 8 |
| `tests/golden_steamgrid.rs` | 13 | 13 | 13 |
| `tests/golden_storeSearch.rs` | 24 | 24 | 24 |
| `tests/golden_umu.rs` | 6 | 6 | 6 |
| `tests/golden_wiki.rs` | 11 | 11 | 11 |
| `tests/golden_wiki_sources.rs` | 8 | 8 | 8 |
| `tests/http_replay.rs` | 31 | 31 | 31 |
| `tests/regex_vectors.rs` | 5 | 5 | 5 |
| `tests/secrets.rs` | 36 | 36 | 36 |
| `tests/wiki_hltb_edges.rs` | 13 | 13 | 13 |
| `tests/wiki_source_edges.rs` | 12 | 12 | 12 |
| `gamelib-info-cli` unit tests + `tests/cli.rs` | 21 + 11 | 21 + 11 | 21 + 11 |
| **gamelib-info total** | **364** | **363** | **364** |

Every binary reported `0 failed; 0 ignored; 0 filtered out`. The ten `golden_*` binaries (118 tests per leg) ran on windows-latest and ubuntu-latest, including `golden_overrides` (the override images' Windows path handling) and `golden_crossover` (the bundled crossover path), which is D-16's Windows/Linux proof. The one Windows difference is `overrides::tests::a_symlink_out_of_the_folder_loses_the_link_and_keeps_the_target`, a unix-only symlink unit test (diffed by name against the ubuntu list). On macOS the job log interleaves cargo's stderr `Running` lines with each binary's stdout, so its per-binary counts were matched in log order; they equal the ubuntu numbers.

---

## Signed builds (D-15)

**Phase 85 build:** the block "### Phase 85 build (85-19 Task 3, 2026-11-22)" in `85-VALIDATION.md` § "Signed baseline (D-16)", by reference: release-tauri.yml run `44978855761` (`dry_run=false`, `main` at `ffb8573d2`), draft release `GameLib v0.11.0`; `Identifier=com.gamelib.shell`, leaf `Developer ID Application: grayson mitchell (S7U223QWXJ)`, `TeamIdentifier=S7U223QWXJ`, designated requirement `identifier "com.gamelib.shell" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = S7U223QWXJ`, `spctl` accepted (Notarized Developer ID), stapled.

### Phase 86 build (86-26, 2026-11-23)

The operator chose `bump-and-build` to unblock item 4 (the caveat recorded at 86-25 below). Same workflow (`release-tauri.yml`), same Apple secrets, run with `dry_run=false`, from a version-bumped release branch as Phase 85 did with `release/v0.10`.

- **Source:** branch `release/v0.12` at `7c50262f4aa5e30f6c0003e738614760e98f6f28` = `4e1af5463` (`origin/main`, contains every Phase 86 source commit and the quick fixes through `quick-261123-9i7`) + `7c50262f4` `chore(86-26): bump version to 0.12.0` (package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json, and the `gamelib-shell` entry of src-tauri/Cargo.lock, one line each). Not in this build: the later `main` commits `aacc9c11f` (PCGamingWiki search term URL-encoding) and `31e9f7a2e`/`31bd2e304` (resetHeroic settings cells, `quick-261123-9x9`); everything else after `4e1af5463` is `.planning/` only.
- **Run:** release-tauri.yml `45056179067`, `workflow_dispatch` on `release/v0.12`, headSha `7c50262f4aa5e30f6c0003e738614760e98f6f28`, `dry_run=false`. Leg conclusions: `release (ubuntu-22.04, x86_64-unknown-linux-gnu)` success (18:49:01Z), `release (windows-latest, x86_64-pc-windows-msvc)` success (18:52:48Z), `release (macos-latest, --target aarch64-apple-darwin, aarch64-apple-darwin)` success (2026-11-22T18:58:22Z).
- **Artifact:** draft release `GameLib v0.12.0` (tag `v0.12.0`, draft and prerelease, NOT published; target `7c50262f4`). Downloaded with `gh release download v0.12.0 -p 'GameLib_0.12.0_aarch64.app.tar.gz' -p 'GameLib_0.12.0_aarch64.dmg'` into the session scratchpad:
  - `GameLib_0.12.0_aarch64.app.tar.gz` (100232157 bytes), sha256 `3887a0e319b04f4f4c470324a3266a1bd81f3099443a6ebda327188922b32231`
  - `GameLib_0.12.0_aarch64.dmg` (99173408 bytes), sha256 `e8699ad2754d94113b98d7e9c312c4297492ad507eef38a9e9308aa61c95f2f9`
  - The checks below ran on `GameLib.app` extracted from the app tar (like with like with the Phase 85 record, which also inspected the app from the app tar). `CFBundleShortVersionString` = `0.12.0`. Nothing was installed, opened or launched.
- **`codesign -dv --verbose=4 GameLib.app`:** `Identifier=com.gamelib.shell`; `Format=app bundle with Mach-O thin (arm64)`; `Authority=Developer ID Application: grayson mitchell (S7U223QWXJ)` -> `Developer ID Certification Authority` -> `Apple Root CA`; `TeamIdentifier=S7U223QWXJ`; `Timestamp=23 Nov 2026 at 7:54:31 AM` (local); flags `0x10000(runtime)`; `Notarization Ticket=stapled`; `CDHash=06c8dcf06883e6e2ad44d47616b93e9eca7f685b`. `codesign --verify --deep --strict` passes.
- **Designated requirement (`codesign -d -r-`):** `identifier "com.gamelib.shell" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = S7U223QWXJ`
- **`spctl -a -vv GameLib.app`:** `accepted`, `source=Notarized Developer ID`, `origin=Developer ID Application: grayson mitchell (S7U223QWXJ)`.
- **`xcrun stapler validate GameLib.app`:** stapled (`The validate action worked!`).
- **Install-over source on this Mac (read-only check, not launched):** `/Applications/GameLib.app` is `0.11.0` with `CDHash=4ca4869a7ce92359eb2ca453ac9dcaf5978bfb4e`, the Phase 85 build's CDHash recorded in 85-VALIDATION.md, so the Phase 85 signed build is what item 4 upgrades from. The `GameLib v0.11.0` draft still holds its assets (uploaded 2026-11-22T03:23Z), untouched by run 45056179067.

**Comparison with the Phase 85 build:**

| Property | Phase 85 build (run 44978855761) | Phase 86 build (run 45056179067) | Equal |
|----------|----------------------------------|----------------------------------|-------|
| Identifier | `com.gamelib.shell` | `com.gamelib.shell` | yes |
| Leaf authority | Developer ID Application: grayson mitchell (S7U223QWXJ) | same | yes |
| Chain | Developer ID Certification Authority -> Apple Root CA | same | yes |
| TeamIdentifier | `S7U223QWXJ` | `S7U223QWXJ` | yes |
| Designated requirement | (85-VALIDATION.md string) | byte-identical (compared by script: both sha256 `af622dc08488b1a2859794a68b60fdfe18f4fede01abbece63d126730527d131`) | yes |
| spctl | accepted, Notarized Developer ID | accepted, Notarized Developer ID | yes |
| stapler | stapled | stapled | yes |
| Version | 0.11.0 | 0.12.0 | differs, as intended (an upgrade) |
| CDHash | `4ca4869a...` | `06c8dcf0...` | differs, as expected for a different build; the Keychain ACL binds to the designated requirement, not the CDHash |

The identities match, so item 4 is `pending`: the live upgrade gate is owed by 86-26 Task 2.

Gate item 4: pending (signed Phase 86 build v0.12.0, run 45056179067, identity equal to the signed Phase 85 build v0.11.0, run 44978855761: same Identifier, Developer ID leaf, TeamIdentifier S7U223QWXJ and byte-identical designated requirement; both notarized and stapled)

#### Superseded: the 86-25 dry run (kept for the record)

- **Run:** release-tauri.yml `45051040572`, `workflow_dispatch` on `main`, `dry_run=true`, headSha `1a58fe646ef7ae0769bc42a8c5b979d3cb0fa6ad`. All three legs `success`. **No artifact** (`total_count: 0`): a dry run uploads nothing by design (no `upload-artifact` step; the macOS log ends with `No releaseId or tagName provided, skipping all uploads...`), so none of the five checks could run, and 86-25 recorded `Gate item 4: blocked`.
- Log evidence only (not an identity record): the macOS leg signed with `Mac Developer ID Application: grayson mitchell`, notarized `GameLib.app` (`Accepted`, id `155b67c6-c03f-4f22-be3d-458fa5688c58`) and stapled it.
- 86-25's unblock caveat: `tauri.conf.json` on `main` was still `0.11.0`, so a non-dry run from `main` would have overwritten the `GameLib v0.11.0` draft's Phase 85 assets. The operator resolved it by bumping on `release/v0.12` (above).
