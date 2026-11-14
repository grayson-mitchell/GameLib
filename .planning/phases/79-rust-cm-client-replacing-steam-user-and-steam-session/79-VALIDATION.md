---
phase: 79
slug: rust-cm-client-replacing-steam-user-and-steam-session
status: draft
nyquist_compliant: false
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

| Req / Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|
| D-01/D-03 | lease share, 60 s idle close, generation, shutdown ordering | unit (fake backend, paused clock) | `cargo test -p gamelib-steamcm --test session_fake` | ❌ W0 | ⬜ pending |
| D-02 | dead call → probe → rebuild → retry once; backoff 5→60 s | unit (fake backend) | same | ❌ W0 | ⬜ pending |
| D-04 | anonymous client shared, 15 s connect bound, 60 s idle | unit | `cargo test -p gamelib-steamcm --test anon_fake` | ❌ W0 | ⬜ pending |
| D-05 | QR rotation, credentials, guard types, poll states | unit with mock HTTP | `cargo test -p gamelib-steamcm --test webauth_mock` | ❌ W0 | ⬜ pending |
| D-06/07/08 | persona fallback, token reuse, `credentialsMissing` | unit + Jest | `pnpm jest src/backend/storeManagers/steam/__tests__/credentialsMissing.test.ts` | ✅ (adapt) | ⬜ pending |
| CM op shapes | PICS / depot key / request code / owned / redeem JSON = steam-user's | golden (Tier 1) | `cargo test -p gamelib-steamcm --test golden` + Jest golden replay | ❌ W0 | ⬜ pending |
| D-09/10/11 | wrap: 5 s refusal, owed record, 15 s spacing, reconnect wrapped | unit (fake clock + log) | `cargo test -p gamelib-steamcm --test wrap` (only if wrap kept) | ❌ | ⬜ pending |
| D-12/D-16 | final Refresh library equals TS on CM path | Tier 2 sweep | `pnpm steamcm-parity-sweep` | ❌ | ⬜ pending |
| D-14/D-15 | Mac Steam guard order + fallback | unit + live | `cargo test -p gamelib-steamcm --test macowned` | ❌ | ⬜ pending |
| D-18 | flag defaults, env override | Jest | `pnpm jest …/steamCmFlags.test.ts` | ❌ W0 | ⬜ pending |
| Channel parity | OPS == constants == match arms | Jest static | `pnpm jest src/backend/__tests__/steamCmChannelParity.test.ts` | ❌ W0 | ⬜ pending |
| Delete gate | TS clients, flags, packages, patches gone | Jest | `pnpm jest src/backend/__tests__/steamCmPortComplete.test.ts` | ❌ last plan | ⬜ pending |
| Sidecar contract | no handle survives stdin EOF | existing | `pnpm smoke:exit-check`, `pnpm smoke:sidecar` | ✅ | ⬜ pending |
| Lease policy | production callers use lease API | existing | `pnpm jest src/backend/__tests__/steamAuthSessionPolicy.test.ts` | ✅ (adapt) | ⬜ pending |

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
