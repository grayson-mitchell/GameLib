---
phase: "86"
slug: "pure-leaf-services"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 86-01-T1 | 86-01 | 1 | SVC-01 | T-86-01 | host API re-read recorded before slice work (D-29) | doc gate | `grep '## Host API re-read (D-29)' 86-VALIDATION.md (13+ statused rows)` | ❌ W0 | ⬜ pending |
| 86-01-T2 | 86-01 | 1 | SVC-01 | — | ownership table amended (D-04, D-27) | doc gate | `grep '## Amendments' + the umu/macArch/runsForMe cells in 82-STATE-OWNERSHIP.md` | ✅ | ⬜ pending |
| 86-01-T3 | 86-01 | 1 | SVC-01 | T-86-01 | operator approves the reconciliation | manual | `checkpoint:decision (blocking-human)` | — | ⬜ pending |
| 86-02-T1 | 86-02 | 1 | SVC-01 | T-86-03 | four D-14 items UAT-shaped | uat parse | `node parseUatItemsWithStats 86-HUMAN-UAT.md (4 items, headingsSeen 0)` | ❌ W0 | ⬜ pending |
| 86-02-T2 | 86-02 | 1 | SVC-01 | T-86-02 | reachability review, literals, capture standard | uat parse | `section greps + pnpm planning-gates` | ❌ W0 | ⬜ pending |
| 86-03-T1 | 86-03 | 2 | SVC-01 | T-86-07 | no keyring/tauri in either crate (D-19) | unit + cli | `cd src-tauri && cargo test -p gamelib-info -p gamelib-info-cli; jest rustTestWorkflow cargoFeatures` | ❌ W0 | ⬜ pending |
| 86-03-T2 | 86-03 | 2 | SVC-01 | — | CacheView TTL, dotted keys, UTC Date() | unit | `cargo test -p gamelib-info --test cache_view` | ❌ W0 | ⬜ pending |
| 86-03-T3 | 86-03 | 2 | SVC-01 | T-86-04, T-86-05, T-86-07 | key never in error text; body cap; shutdown cancel | unit | `cargo test -p gamelib-info --features testing --test http_replay` | ❌ W0 | ⬜ pending |
| 86-04-T1 | 86-04 | 2 | SVC-01 | T-86-08 | recent_games golden before Rust (SC3) | oracle | `pnpm exec jest --runTestsByPath src/backend/info/__tests__/oracle/recentGames.oracle.test.ts` | ❌ W0 | ⬜ pending |
| 86-04-T2 | 86-04 | 2 | SVC-01 | T-86-09 | overrides and anticheat goldens (SC3) | oracle | `jest gameOverrides.oracle.test.ts anticheat.oracle.test.ts` | ❌ W0 | ⬜ pending |
| 86-04-T3 | 86-04 | 2 | SVC-01 | T-86-08 | no secret in any fixture | guard | `jest src/backend/info/__tests__/fixtureRedaction.test.ts` | ❌ W0 | ⬜ pending |
| 86-05-T1 | 86-05 | 2 | SVC-01 | T-86-10 | delete gate proven on images_cache (D-22) | delete gate | `jest infoPortComplete.test.ts appRuntime.test.ts diPhaseGates.test.ts; codecheck; find-deadcode` | ❌ W0 | ⬜ pending |
| 86-05-T2 | 86-05 | 2 | SVC-01 | T-86-10 | shim/resolver shape and schedule (D-06, D-24) | delete gate | `jest infoShimSchedule.test.ts` | ❌ W0 | ⬜ pending |
| 86-06-T1 | 86-06 | 3 | SVC-01 | T-86-11 | discounts recorded and golden | oracle | `jest discounts.oracle.test.ts fixtureRedaction.test.ts` | ❌ W0 | ⬜ pending |
| 86-06-T2 | 86-06 | 3 | SVC-01 | T-86-11 | crossover recorded and golden | oracle | `jest crossover.oracle.test.ts` | ❌ W0 | ⬜ pending |
| 86-06-T3 | 86-06 | 3 | SVC-01 | T-86-11, T-86-12 | wiki + umu recorded, D-23 tsOnly/rustOnly | oracle | `jest wiki.oracle.test.ts` | ❌ W0 | ⬜ pending |
| 86-07-T1 | 86-07 | 3 | SVC-01 | T-86-14 | steamgrid synthetic goldens | oracle | `jest steamgrid.oracle.test.ts -t synthetic` | ❌ W0 | ⬜ pending |
| 86-07-T2 | 86-07 | 3 | SVC-01 | T-86-14 | ITAD synthetic goldens | oracle | `jest storeSearch.oracle.test.ts -t synthetic` | ❌ W0 | ⬜ pending |
| 86-07-T3 | 86-07 | 3 | SVC-01 | T-86-13 | operator records keyed cases; no key committed | manual + oracle | `checkpoint:human-action, then jest both oracles + fixtureRedaction offline` | ❌ W0 | ⬜ pending |
| 86-08-T1 | 86-08 | 3 | SVC-01 | T-86-17 | recent add bytes = golden; Rust emit + tray (D-08) | golden + shell | `cargo test -p gamelib-info --features testing --test golden_recent; cargo test --bin gamelib-shell info_dispatch; pnpm check:ipc-contract` | ❌ W0 | ⬜ pending |
| 86-08-T2 | 86-08 | 3 | SVC-01 | T-86-15, T-86-16 | removeRecent native, one owner, no lost update | contract | `cargo test --bin gamelib-shell native_manifest_vectors; jest nativeChannelOwnership ipcDomainCensus` | ✅ extend | ⬜ pending |
| 86-08-T3 | 86-08 | 3 | SVC-01 | — | tray seed through the host (Pitfall 8) | unit | `cargo test --bin gamelib-shell tray::` | ✅ extend | ⬜ pending |
| 86-09-T1 | 86-09 | 4 | SVC-01 | T-86-18 | addRecentGame shim forwards only | unit | `jest src/backend/info/__tests__/recentGames.test.ts` | ❌ W0 | ⬜ pending |
| 86-09-T2 | 86-09 | 4 | SVC-01 | T-86-18 | recent TS + sidecar sniff deleted (SC4, D-08) | delete gate | `jest infoPortComplete infoShimSchedule tauriShellSource; cargo test --bin gamelib-shell tray::` | ✅ extend | ⬜ pending |
| 86-10-T1 | 86-10 | 5 | SVC-01 | T-86-20 | getAllGameOverrides native = golden | golden + contract | `cargo test --test golden_overrides; native_manifest_vectors` | ❌ W0 | ⬜ pending |
| 86-10-T2 | 86-10 | 5 | SVC-01 | T-86-19, T-86-20 | image cleanup confined to its dir | golden | `cargo test -p gamelib-info --features testing --test golden_overrides; overrides::` | ❌ W0 | ⬜ pending |
| 86-11-T1 | 86-11 | 6 | SVC-01 | T-86-22 | async override shims, gamedetails awaits | unit | `jest gameOverrides.test.ts; jest src/backend/gamedetails` | ❌ W0 | ⬜ pending |
| 86-11-T2 | 86-11 | 6 | SVC-01 | T-86-21 | overrides TS deleted, store row kept byte-identical | delete gate | `genStoreTable --check; git diff --quiet storeTable.json; jest storeTable storeKinds infoPortComplete` | ✅ extend | ⬜ pending |
| 86-12-T1 | 86-12 | 7 | SVC-01 | T-86-25 | getAnticheatInfo native = golden | golden + contract | `cargo test --test golden_anticheat; native_manifest_vectors` | ❌ W0 | ⬜ pending |
| 86-12-T2 | 86-12 | 7 | SVC-01 | T-86-23, T-86-24 | status/download, temp-then-rename, md-5 pinned | golden | `cargo test --test golden_anticheat anticheat::; jest cargoFeatures` | ❌ W0 | ⬜ pending |
| 86-12-T3 | 86-12 | 7 | SVC-01 | — | drift command opt-in (D-12) | cli | `cargo test -p gamelib-info-cli; drift --list` | ❌ W0 | ⬜ pending |
| 86-13-T1 | 86-13 | 8 | SVC-01 | T-86-26 | status before online wait (D-07, D-28) | unit | `jest anticheat.test.ts bootstrapWirings.test.ts sidecarRejectionGuard.test.ts` | ❌ W0 | ⬜ pending |
| 86-13-T2 | 86-13 | 8 | SVC-01 | — | anticheat TS deleted (SC4) | delete gate | `jest infoPortComplete infoShimSchedule enrichmentFlows` | ✅ extend | ⬜ pending |
| 86-14-T1 | 86-14 | 9 | SVC-01 | T-86-27, T-86-29 | keyring slots unchanged; owner semantics | unit | `cargo test --features testing --test secrets; cargo test --bin gamelib-shell info_secrets keyring` | ❌ W0 | ⬜ pending |
| 86-14-T2 | 86-14 | 9 | SVC-01 | T-86-28 | dev vault only when dev; migration proof order | unit | `cargo test --test secrets; cargo test --bin gamelib-shell info_secrets` | ❌ W0 | ⬜ pending |
| 86-14-T3 | 86-14 | 9 | SVC-01 | T-86-30 | baked ITAD key in the shell build (D-25) | meta | `jest --selectProjects Meta meta/__tests__/releaseItadKey.test.ts` | ❌ W0 | ⬜ pending |
| 86-15-T1 | 86-15 | 10 | SVC-01 | T-86-31 | steamgrid search native = golden | golden + contract | `cargo test --test golden_steamgrid; native_manifest_vectors` | ❌ W0 | ⬜ pending |
| 86-15-T2 | 86-15 | 10 | SVC-01 | T-86-32, T-86-33 | zod bounds in Rust decode | golden + contract | `cargo test --test golden_steamgrid steamgrid::; native_manifest_vectors` | ❌ W0 | ⬜ pending |
| 86-15-T3 | 86-15 | 10 | SVC-01 | T-86-34 | migration moved to Rust boot; TS deleted | delete gate | `jest infoPortComplete diPhaseGates + sidecar tests; cargo test --bin gamelib-shell info_dispatch` | ✅ extend | ⬜ pending |
| 86-16-T1 | 86-16 | 11 | SVC-01 | T-86-35 | searchStores native = golden; key never in errors | golden + contract | `cargo test --features testing --test golden_storeSearch; native_manifest_vectors` | ❌ W0 | ⬜ pending |
| 86-16-T2 | 86-16 | 11 | SVC-01 | T-86-36, T-86-38 | single-flight; comparator; bounds | golden | `cargo test --test golden_storeSearch itad::` | ❌ W0 | ⬜ pending |
| 86-16-T3 | 86-16 | 11 | SVC-01 | T-86-38 | key status = two booleans only | contract | `native_manifest_vectors; jest nativeChannelOwnership ipcDomainCensus` | ✅ extend | ⬜ pending |
| 86-17-T1 | 86-17 | 12 | SVC-01 | — | one ITAD coverage file for TS and Rust | unit | `jest storeMapping.test.ts storeRegion.test.ts; cargo test -p gamelib-info itad::` | ✅ extend | ⬜ pending |
| 86-17-T2 | 86-17 | 12 | SVC-01 | T-86-40 | storeSearch TS deleted; rows byte-identical | delete gate | `genStoreTable --check; git diff --quiet storeTable.json; jest storeTable storeKinds` | ✅ extend | ⬜ pending |
| 86-17-T3 | 86-17 | 12 | SVC-01 | T-86-39, T-86-41 | bake only in shell; gate passes | meta + delete gate | `jest releaseItadKey buildSidecarSea infoPortComplete; pnpm build:sidecar` | ✅ extend | ⬜ pending |
| 86-18-T1 | 86-18 | 13 | SVC-01 | T-86-42 | discounts = golden; resolver token only | golden + unit | `cargo test --features testing --test golden_discounts; jest src/backend/info/__tests__/discounts.test.ts` | ❌ W0 | ⬜ pending |
| 86-18-T2 | 86-18 | 13 | SVC-01 | — | fetcher deleted; resolver scheduled (D-24) | delete gate | `jest infoPortComplete infoShimSchedule electronReachLedger` | ✅ extend | ⬜ pending |
| 86-19-T1 | 86-19 | 14 | SVC-01 | T-86-47 | rating map via resolver; runner table drift | golden + unit | `jest runnerCapabilities.test.ts crossover.test.ts; cargo test --test golden_crossover` | ❌ W0 | ⬜ pending |
| 86-19-T2 | 86-19 | 14 | SVC-01 | T-86-44, T-86-45, T-86-46 | schema bounds, caps, bundled path | golden | `cargo test --features testing --test golden_crossover crossover::; jest cargoFeatures` | ❌ W0 | ⬜ pending |
| 86-19-T3 | 86-19 | 14 | SVC-01 | — | crossover drift cases | cli | `cargo test -p gamelib-info-cli; drift --list` | ✅ extend | ⬜ pending |
| 86-20-T1 | 86-20 | 15 | SVC-01 | T-86-50 | umu = golden (D-04) | golden | `cargo test -p gamelib-info --features testing --test golden_umu` | ❌ W0 | ⬜ pending |
| 86-20-T2 | 86-20 | 15 | SVC-01 | T-86-48 | JS regex parity (Pitfall 4); pcgw/agw = golden | vectors + golden | `cargo test --features testing --test regex_vectors --test golden_wiki_sources` | ❌ W0 | ⬜ pending |
| 86-20-T3 | 86-20 | 15 | SVC-01 | T-86-49 | protondb/deck/slug = golden | golden | `cargo test --features testing --test golden_wiki_sources; wiki::` | ❌ W0 | ⬜ pending |
| 86-21-T1 | 86-21 | 16 | SVC-01 | T-86-53 | gamesdb via D-23 GET, no GOG write | golden | `cargo test -p gamelib-info --features testing --test golden_wiki_sources` | ✅ extend | ⬜ pending |
| 86-21-T2 | 86-21 | 16 | SVC-01 | T-86-51, T-86-52 | HLTB headers pinned; creds memory-only | golden | `cargo test --features testing --test golden_wiki_sources; wiki::` | ✅ extend | ⬜ pending |
| 86-21-T3 | 86-21 | 16 | SVC-01 | T-86-53 | GOG HLTB via D-23 store link | golden | `cargo test --features testing --test golden_wiki_sources` | ✅ extend | ⬜ pending |
| 86-22-T1 | 86-22 | 17 | SVC-01 | T-86-54, T-86-56 | aggregator = golden; native one owner | golden + contract | `cargo test --features testing --test golden_wiki; native_manifest_vectors` | ❌ W0 | ⬜ pending |
| 86-22-T2 | 86-22 | 17 | SVC-01 | — | wiki get/clear ops | golden | `cargo test --test golden_wiki wiki::; check:ipc-contract` | ✅ extend | ⬜ pending |
| 86-22-T3 | 86-22 | 17 | SVC-01 | T-86-52 | one live drift run (Pitfall 11) | opt-in live | `cargo run -p gamelib-info-cli -- drift (recorded in summary); drift --list` | ✅ extend | ⬜ pending |
| 86-23-T1 | 86-23 | 18 | SVC-01 | T-86-57 | getUmuId shim forwards only | unit | `jest src/backend/info/__tests__/wiki.test.ts` | ❌ W0 | ⬜ pending |
| 86-23-T2 | 86-23 | 18 | SVC-01 | T-86-57 | wiki resolver + clear shim scheduled | unit + gate | `jest wiki.test.ts infoShimSchedule.test.ts; codecheck; lint` | ✅ extend | ⬜ pending |
| 86-24-T1 | 86-24 | 19 | SVC-01 | T-86-58 | wiki + crossover TS deleted; rows byte-identical | delete gate | `genStoreTable --check; git diff --quiet storeTable.json; codecheck; jest storeTable storeKinds createStores appRuntime` | ✅ extend | ⬜ pending |
| 86-24-T2 | 86-24 | 19 | SVC-01 | T-86-59 | census agrees with the tree | census | `jest diPhaseGates bootSourceShape storeLayer shortcutsFlows enrichmentFlows; find-deadcode` | ✅ extend | ⬜ pending |
| 86-24-T3 | 86-24 | 19 | SVC-01 | T-86-59 | oracle retired; nine describes pass (SC4) | delete gate | `jest infoPortComplete infoShimSchedule fixtureRedaction; cargo test -p gamelib-info --features testing` | ✅ extend | ⬜ pending |
| 86-25-T1 | 86-25 | 20 | SVC-01 | T-86-62 | clean-worktree proof, SC4 sweep, drift run | phase proof | `full suite at P (see plan); grep '## Phase proof' '## SC4 sweep' '## Drift run'` | — | ⬜ pending |
| 86-25-T2 | 86-25 | 20 | SVC-01 | T-86-60 | push and release authorised | manual | `checkpoint:decision` | — | ⬜ pending |
| 86-25-T3 | 86-25 | 20 | SVC-01 | T-86-61 | three-OS CI (D-16); signed identity (D-15) | CI proof | `gh run view per leg; grep '## CI proof' 'Gate item 4:'` | — | ⬜ pending |
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
