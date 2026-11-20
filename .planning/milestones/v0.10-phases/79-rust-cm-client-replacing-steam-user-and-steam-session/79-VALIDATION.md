---
phase: 79
slug: rust-cm-client-replacing-steam-user-and-steam-session
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-11-14
---

# Phase 79 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `79-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `cargo test` (Rust crates) + Jest 29 (TS callers, parity replay, delete gate) |
| **Config file** | `src-tauri/Cargo.toml` workspace; `jest.config.js` at repo root |
| **Quick run command** | `cd src-tauri && cargo test -p gamelib-steamcm -p gamelib-steamcm-cli` (+ `pnpm jest <touched test>`) |
| **Full suite command** | `cd src-tauri && cargo test -p gamelib-scan -p gamelib-scan-cli -p gamelib-depot -p gamelib-depot-cli -p gamelib-steamfiles -p gamelib-steamfiles-cli -p gamelib-steamcm -p gamelib-steamcm-cli && cd .. && pnpm test:ci` |
| **Type/lint gates** | `pnpm tsc`, `pnpm lint:src`, `cd src-tauri && cargo clippy --workspace` (shrink-only ratchet), `pnpm find-deadcode`, `pnpm planning-gates` |
| **Estimated runtime** | quick ~60 s; full several minutes |

---

## Sampling Rate

- **After every task commit:** Run `cargo test -p gamelib-steamcm` plus the touched Jest file
- **After every plan wave:** Run the full suite command, `cargo clippy --workspace`, `pnpm tsc`
- **Before `/gsd-verify-work`:** Full suite green on all three CI legs, parity sweeps clean with divergences accepted, live UAT passed
- **Max feedback latency:** 120 seconds (quick command)

---

## Per-Task Verification Map

Filled in by the planner per task. Decision → test map from research:

| Req / Decision | Plan(s) | Behavior | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|---|
| CF-01/CF-02 | 79-01 | crate pair builds; pinned steam-vent API shapes compile; anon logon live | unit + ignored live | `cd src-tauri && cargo test -p gamelib-steamcm -p gamelib-steamcm-cli` and `cargo test -p gamelib-steamcm --test vent_api_shapes` | ❌ W0 | ⬜ pending |
| backend seam | 79-04 | error mapping, FakeBackend, vent backend | unit (+ ignored live) | `cargo test -p gamelib-steamcm error::` / `fake::` / `vent::` | ❌ W0 | ⬜ pending |
| D-01/D-03 | 79-06 | lease share, 60 s idle close, generation, shutdown ordering | unit (fake backend, paused clock) | `cargo test -p gamelib-steamcm session::` | ❌ W0 | ⬜ pending |
| D-02 | 79-11 | dead call → probe → rebuild → retry once; backoff 5→60 s; 34 terminal | unit (fake backend) | `cargo test -p gamelib-steamcm liveness::` and `cargo test -p gamelib-steamcm session::` | ❌ W0 | ⬜ pending |
| D-04 | 79-07 | anonymous client shared, 15 s connect bound, 60 s idle | unit | `cargo test -p gamelib-steamcm anon::` | ❌ W0 | ⬜ pending |
| D-05 | 79-05, 79-10 | QR rotation, credentials, guard types, poll states | unit with mock HTTP | `cargo test -p gamelib-steamcm webauth::` | ❌ W0 | ⬜ pending |
| CM op shapes | 79-08, 79-09, 79-21 | PICS / depot key / request code / owned / redeem JSON = steam-user's | unit + golden (Tier 1) | `cargo test -p gamelib-steamcm ops::` and `cargo test -p gamelib-steamcm --test golden` + Jest golden replay | ❌ W0 | ⬜ pending |
| runtime/facade | 79-14 | global runtime, dispatch, op registration | unit | `cargo test -p gamelib-steamcm facade::` / `runtime::` | ❌ W0 | ⬜ pending |
| D-06/07/08 | 79-18, 79-20 | persona fallback, token reuse, `credentialsMissing` | Jest | `pnpm exec jest src/backend/storeManagers/steam/__tests__/user src/backend/storeManagers/steam/__tests__/credentialsMissing.test.ts` | ✅ (adapt) | ⬜ pending |
| D-09/10/11 | 79-12, 79-13 | wrap: 5 s refusal, owed record, 15 s spacing, reconnect wrapped | unit (fake clock + log) | `cargo test -p gamelib-steamcm wrap::` and `cargo test -p gamelib-steamcm session::` (only if wrap kept) | ❌ | ⬜ pending |
| CM ops parity | 79-24 | CM op results equal TS on the operator's account | Tier 2 sweep | `pnpm steamcm-parity-sweep` | ❌ | ⬜ pending |
| D-12 (Rust Refresh) | 79-27..79-30 | owned+demos, capture scope/merge, enrichment merge + bounded stage, assembly, orchestration | unit (fake backend, mock HTTP) | `cargo test -p gamelib-steamcm refresh::` | ❌ | ⬜ pending |
| D-12 (TS callers) | 79-31, 79-32 | refresh() thin caller persists the Rust library; lazy enrichment via steamcm_store_enrich | Jest (replayed Rust results) | `pnpm exec jest src/backend/storeManagers/steam/__tests__/library src/backend/storeManagers/steam/__tests__/gameMetadata` | ❌ | ⬜ pending |
| D-16 | 79-33 | Rust-returned finished library equals TS Refresh's on the CM path, divergences accepted | Tier 2 sweep | `pnpm steamcm-refresh-parity-sweep` | ❌ | ⬜ pending |
| D-14/D-15 | 79-35, 79-36 | Mac Steam guard order + fallback; macSteam source in the Rust Refresh | unit + Jest + live | `cargo test -p gamelib-steamcm macowned::` and `cargo test -p gamelib-steamcm refresh::` + `pnpm exec jest src/backend/storeManagers/steam/__tests__/library` | ❌ | ⬜ pending |
| D-18 | 79-03 | flag defaults, env override | Jest | `pnpm exec jest src/backend/storeManagers/steam/cm/__tests__/steamCmFlags.test.ts` | ❌ W0 | ⬜ pending |
| Channel parity | 79-15, 79-16, 79-30, 79-35 | OPS == constants == match arms | Jest static | `pnpm exec jest src/backend/__tests__/steamCmChannelParity.test.ts` | ❌ W0 | ⬜ pending |
| Delete gate | 79-43 | TS clients, flags, packages, patches gone | Jest | `pnpm exec jest src/backend/__tests__/steamCmPortComplete.test.ts` | ❌ last plan | ⬜ pending |
| Sidecar contract | 79-39, 79-42 | no handle survives stdin EOF | existing | `pnpm smoke:exit-check`, `pnpm smoke:sidecar` | ✅ | ⬜ pending |
| Lease policy | 79-18, 79-23, 79-31 | production callers use lease API | existing | `pnpm exec jest src/backend/__tests__/steamAuthSessionPolicy.test.ts` | ✅ (adapt) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src-tauri/crates/gamelib-steamcm{,-cli}` scaffolds, `-p` entries in `rust-test.yml`, `EXPECTED_LOCKFILE_CRATE_NAMES` update
- [ ] `FakeBackend`, paused-clock harness, mock HTTP server helper
- [ ] `src-tauri/deny.toml` rsa (RUSTSEC-2023-0071) justified ignore
- [ ] `steamCmChannelParity.test.ts` and `steamCmFlags.test.ts` shells
- [ ] `meta/gamelibSteamcmCli.ts` spawning via `createFakeHomeProfile()`
- [ ] Every `<verify>`: scoped `npx prettier --check` over the written paths after `--file-info`

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Existing signed-in user stays signed in, no new sign-in | D-07 | needs operator's real refresh token | `pnpm tauri:dev`, Refresh, log shows Rust logon |
| QR and credentials + typed Steam Guard sign-in | D-05 | needs phone / Steam Guard | sign out, sign in each way |
| Unwrapped full-Refresh Friends retest | D-09 | needs running Mac Steam + Friends | TS arm in Wave 0, CM arm in Wave 3 |
| Mid-lease reconnect after network off/on and after sleep | D-02/D-11 | physical network + sleep | network off only for the action, then back on |
| Mac Steam owned-apps path + fallback on account mismatch | D-14 | needs Mac Steam signed in | Refresh with matched / mismatched account |
| Real key redeem | redeem | needs an unused key | only if the operator has one |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
