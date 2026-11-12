---
phase: 74
slug: steam-game-updates
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-12
---

# Phase 74 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `74-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `cargo test` (`gamelib-depot`, `gamelib-depot-cli`) and Jest 29 + ts-jest |
| **Config file** | `src-tauri/Cargo.toml` (workspace), `jest.config.js` |
| **Quick run command** | `cd src-tauri && cargo test -p gamelib-depot --test delta` ; `pnpm exec jest <touched test path>` |
| **Full suite command** | `pnpm test:ci && cd src-tauri && cargo test -p gamelib-scan -p gamelib-scan-cli -p gamelib-depot -p gamelib-depot-cli && cargo test --bin gamelib-shell` |
| **Also per wave** | `pnpm check:ipc-contract`, `pnpm find-deadcode`, `pnpm steam-line-ceiling`, `pnpm smoke:sidecar`, `pnpm planning-gates`, clippy ratchet (`meta/clippyRatchet.cjs`) |
| **Estimated runtime** | ~300 seconds (full); ~30 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** the quick command for the touched layer, plus `npx prettier --check` over the exact written paths (`--file-info` first, per `gamelib-conventions`).
- **After every plan wave:** full suite + clippy ratchet + `pnpm check:ipc-contract` + `pnpm find-deadcode` + `pnpm steam-line-ceiling`.
- **Before `/gsd-verify-work`:** full suite green and live gate done.
- **Max feedback latency:** 60 seconds for the quick command.

---

## Per-Task Verification Map

Filled in by the planner/executor against the plan task IDs. Requirement → test map:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| STEAM-01a | Bridge stale iff ACF buildid ≠ PICS branch buildid; BetaKey branch; unresolved → unknown; PICS timeout → last-known/unknown, never stale | Jest unit | `pnpm exec jest src/backend/storeManagers/steam/__tests__/updateDetection.test.ts` | ❌ W0 | ⬜ pending |
| STEAM-01a | Detection leaves no live handle at exit (sidecar exit contract) | Jest + smoke | `pnpm exec jest …updateDetection.exit.test.ts`; `pnpm smoke:sidecar` | ❌ W0 | ⬜ pending |
| STEAM-01b | ACF → registered stale (StateFlags 6, TargetBuildID ≠ buildid, BytesToDownload, ScheduledAutoUpdate); up-to-date → current | Jest unit (069 ACF fixtures) | `pnpm exec jest …updateDetection.acf.test.ts` | ❌ W0 | ⬜ pending |
| STEAM-01c | Stale result reaches `gameUpdates`; updates filter; card/game page render sizes (D-09) | Jest backend + frontend | `pnpm exec jest src/backend/utils src/frontend/state/__tests__/libraryState.test.ts src/frontend/screens/Library` | partial | ⬜ pending |
| STEAM-01c | Pre-launch check: timeout → last-known, launches; "don't ask again" keyed by build id | Jest | `pnpm exec jest …gameBridgeLaunch*.test.ts` | ❌ W0 | ⬜ pending |
| STEAM-01d | `autoUpdateGames: true` queues stale bridge game, never a stale registered game; both badged | Jest | `pnpm exec jest src/backend/utils/__tests__/checkGameUpdates.test.ts` | partial | ⬜ pending |
| STEAM-02a | Delta result = new manifest byte-for-byte; reused chunks SHA-verified; corrupt local chunk → CDN; removed owned files deleted; unowned kept; modes applied | cargo integration | `cd src-tauri && cargo test -p gamelib-depot --test delta` | ❌ W0 | ⬜ pending |
| STEAM-02a | Interrupt before commit: old tree intact, temps cleaned; mid-commit: reconcile finishes | cargo integration | `cargo test -p gamelib-depot --test delta resume` | ❌ W0 | ⬜ pending |
| STEAM-02a | Peak-disk check refuses before any write (D-13) | cargo + Jest | `cargo test -p gamelib-depot --test delta disk` | ❌ W0 | ⬜ pending |
| STEAM-02a | Multi-depot, depot added/dropped, flag-only change, symlink, case collision | cargo integration | `cargo test -p gamelib-depot --test delta multi_depot` | ❌ W0 | ⬜ pending |
| STEAM-02a | `ManifestStore::prune` never removes a protected GID | cargo | `cargo test -p gamelib-depot --test manifest prune` | partial | ⬜ pending |
| STEAM-02a | `fromManifest` no longer yields `delta_unsupported`; schema `deny_unknown_fields`; error-kind parity | cargo + Jest | `cargo test -p gamelib-depot job_schema`; `pnpm exec jest src/backend/storeManagers/steam/depotRust/__tests__` | exists (update) | ⬜ pending |
| STEAM-02b | `update()` refuses while running; queues as 'update'; pause/resume/cancel; D-14 fallback; error leaves old build launchable | Jest | `pnpm exec jest src/backend/storeManagers/steam/__tests__/updateBridge.test.ts` | ❌ W0 | ⬜ pending |
| STEAM-02c | Post-update: shim handover iff DLL changed, `gamelib_bridge.cfg` rewritten, redist ledger + DRM/known-fix verdicts re-keyed, ACF buildid + GIDs (GID as string) | Jest | `pnpm exec jest src/backend/storeManagers/steam/bridge/__tests__` | partial | ⬜ pending |
| STEAM-02d | Registered Update: InstallApp ok → polling; 'unavailable' → hand-off; opt-in off / non-mac → hand-off; refuse while running | Jest | `pnpm exec jest …updateNative.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src-tauri/crates/gamelib-depot/tests/delta.rs` + fixture builders in `fixtures_gen.rs` (old/new manifest pair, multi-depot, removed file, flag-only change, symlink, corrupt local chunk)
- [ ] `updateDetection.test.ts` (+ acf and exit-contract variants) with ACF fixtures copied from spike 069
- [ ] `updateBridge.test.ts`, `updateNative.test.ts`, launch-gate prompt tests
- [ ] Any new test spawning a process in `src/` or `meta/` uses `createFakeHomeProfile()`
- [ ] `74-UAT.md` following the UAT item shape rule
- Framework install: none (infra exists)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bridge game with pending update shows "Update available", updates, keeps saves/user files, launches through the bridge | STEAM-01, STEAM-02 | Needs live CDN, real stale install (spike 070 fixtures) and CrossOver | `74-UAT.md` — Manor Lords / Mining Mechs |
| Mac-native game shows the update state; Update gets Steam to update it | STEAM-01b, STEAM-02d | Needs running Mac Steam with a deferred pending update | `74-UAT.md` — registered fixture per spike 069 step 4 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
