---
phase: "81"
slug: "unify-the-steam-restart-hold-into-restart-on-play"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-17"
---

# Phase 81 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Seeded from `81-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 (sidecar, frontend) and `cargo test` (Rust crates) |
| **Config file** | `package.json` (`"test": "jest"`); `src-tauri/crates/gamelib-steampoll/Cargo.toml` (feature `testing`: `RecordingHost`, `ScriptedRunner`, `FakeClock`) |
| **Quick run command** | `pnpm exec jest <path>` / `cargo test -p gamelib-steampoll --manifest-path src-tauri/Cargo.toml --test <name>` |
| **Full suite command** | `pnpm test:ci` and `cargo test -p gamelib-steampoll --manifest-path src-tauri/Cargo.toml` |
| **Estimated runtime** | ~120 seconds (per-wave subset) |

Gates to keep green: `pnpm lint`, `pnpm find-deadcode`, `pnpm backend-di-ceilings`, `pnpm gameinfo-narrowing-ceiling`, `pnpm i18n --fail-on-update`, `pnpm codecheck`, `pnpm planning-gates`, scoped `npx prettier --check` on edited paths. Known red, not Phase 81: see `80-HANDOFF.md`.

---

## Sampling Rate

- **After every task commit:** the single test file the task touches
- **After every plan wave:** `cargo test -p gamelib-steampoll --manifest-path src-tauri/Cargo.toml` + `pnpm exec jest src/backend/storeManagers/steam src/backend/sidecar src/frontend/screens/Game` + `pnpm codecheck`
- **Before `/gsd-verify-work`:** full Jest and cargo green, plus the live gate
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

Filled by the planner per task. Decision-to-test mapping from research:

| Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| D-01 | Pending record: badge Installed, Play enabled, note shown | Jest (RTL) | `pnpm exec jest src/frontend/screens/Game/GamePage/components/__tests__/` | ❌ W0 (rewrite + new) | ⬜ pending |
| D-02 | "Restart Steam now": shared restart, Steam alone, clear record on success only | Jest | `pnpm exec jest src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts` | ✅ extend | ⬜ pending |
| D-03 | Signed out: "Sign in" note + Open Steam; Play opens Steam, no restart | Jest + live | same + live gate | ✅ extend | ⬜ pending |
| D-04/D-05 | Refused cases never call plain rungameid; notice kept | Jest | `pnpm exec jest src/backend/storeManagers/steam/__tests__/games.test.ts` | ✅ extend | ⬜ pending |
| D-06 | `launchWithoutSteam` bypasses gate; ineligible falls back | Jest | `pnpm exec jest src/backend/storeManagers/steam/directLaunch/` | ❌ W0 | ⬜ pending |
| D-07 | Adoption watch lifecycle, `adoptionState` emission | cargo | `cargo test -p gamelib-steampoll --manifest-path src-tauri/Cargo.toml --test adoption` | ❌ W0 | ⬜ pending |
| D-08 | Helper parse ok/unavailable/garbage/timeout/signed-out | cargo | same `--test adoption` | ❌ W0 | ⬜ pending |
| D-09 | No automatic InstallApp retry at sign-in except one guarded fire | cargo | `--test adoption` | ❌ W0 | ⬜ pending |
| D-10 | Helper missing: record kept, Play = `decidePlayAdoption` | cargo + Jest | `--test adoption`; `macSteamAdoption.test.ts` | ✅/❌ | ⬜ pending |
| D-11 | Hold, store, re-arm deleted; Installed on ACF | cargo + Jest | `pnpm exec jest src/backend/__tests__/steamPollsPortComplete.test.ts` | ✅ extend | ⬜ pending |
| D-12 | Migration drain/write/discard, crash-safe | cargo + Jest | `cargo test ... --test hold_migration` | ❌ W0 | ⬜ pending |
| D-13 | No hold survives | grep gate | `steamPollsPortComplete.test.ts` | ✅ extend | ⬜ pending |
| D-14 | Win/Linux restart-on-Play; per-OS evidence; pid change not evidence | cargo + Jest | `--test adoption`; `macSteamAdoption.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src-tauri/crates/gamelib-steampoll/tests/adoption.rs` — watch lifecycle, per-platform evidence, helper parse, fail-safe
- [ ] `src-tauri/crates/gamelib-steampoll/tests/hold_migration.rs` — drain/discard
- [ ] Jest: Play gate per platform, `'open-steam'` decision, D-06 bypass, note component, "Restart Steam now" channel
- [ ] Fixture edits: `state-events.json`, timelines/expected-ts for deleted hold scenarios, `divergences.json`
- [ ] Fake helper script for Rust tests (canned JSON lines); no real Steam in unit tests

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Signed-in Mac install, InstallApp off: Installed + Play + note; Play restarts Steam once, game starts | D-01/D-02 | Needs real Steam | Live gate 1 |
| Appid 112100: Steam at sign-in screen, install finishes, sign in; note clears, same pid | D-07/D-08 | Real sign-in rescan | Live gate 2 |
| "Restart Steam now" without launching; record cleared | D-02 | Real Steam restart | Live gate 3 |
| Refused restart (game running in Steam): notice, no plain rungameid, record kept | D-04/D-05 | Real Steam state | Live gate 4 |
| Migration of a real `steam_restart_hold.json` at boot | D-12 | Real app boot | Live gate 5 |
| InstallApp ON path unchanged; fallback writes record | D-09 | Real helper | Live gate 6 |
| `steam-bridge-helper --steam-appstate <id>` prints one JSON line | D-08 | Native helper build | `pnpm build-steam-bridge`, then run it |
| Windows 11 and Linux, items 1–4 (Linux: a real game after relaunch) | D-14 | Operator's other machines | Live gate 7 |

UAT items follow `gamelib-conventions` shape. Offline steps: network off only for the action. Restart `pnpm tauri:dev` after `pnpm build:sidecar` and `pnpm build-steam-bridge`.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
