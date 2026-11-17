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

Filled by the planner (2026-11-17). One row per task; every task carries an `<automated>` command with a stated `<fails_when>` in its PLAN.md (copy the full command from there). Wave 0 test files are created inside the task that first needs them (tests are written before or with the code, `tdd="true"`).

| Task | Plan | Wave | Decisions | Behavior proved | Test type | Automated command (short form) | File exists | Status |
|------|------|------|-----------|-----------------|-----------|--------------------------------|-------------|--------|
| 81-01-T1 | 01 | 1 | D-07 | adoptionState round-trips Rust -> zod -> handler clears record | cargo + Jest | `cargo test -p gamelib-steampoll --test contracts`; `pnpm exec jest steamPollStateEventParity steamPollEventRegistration` | ✅ extend | ⬜ pending |
| 81-01-T2 | 01 | 1 | D-07, D-10, D-14 | watch lifecycle; ACF rewrite all OS; Mac pid; Win/Linux pid not evidence; mtime trap | cargo (paused time) | `cargo test -p gamelib-steampoll --test adoption` | ❌ W0 (created here) | ⬜ pending |
| 81-02-T1 | 02 | 2 | D-07 | three adoption ops on crate, shell, TS | cargo + Jest | `cargo test -p gamelib-steampoll --test dispatch`; `cargo test --bin gamelib-shell steampoll`; `pnpm exec jest steamPollChannelParity rustInvokeSchemas` | ✅ extend | ⬜ pending |
| 81-02-T2 | 02 | 2 | D-07, D-10 | record write watches, clear unwatches, boot resumes, orphan cleared | Jest | `pnpm exec jest adoptionWatch macSteamAdoption games bootSourceShape` | ❌ W0 (adoptionWatch.test.ts) | ⬜ pending |
| 81-03-T1 | 03 | 2 | D-08 | real compiled `--steam-appstate` (fake HOME); Rust reader parse/fail-safe | Jest + cargo | `pnpm exec jest steamAppStateHelper`; `cargo test -p gamelib-steampoll --test app_state` | ❌ W0 (both created here) | ⬜ pending |
| 81-03-T2 | 03 | 2 | D-03, D-07, D-08, D-09, D-10 | helper state 4 adopts; signedIn; pid re-check; one guarded InstallApp | cargo | `cargo test -p gamelib-steampoll --test adoption --test app_state --test update` | ✅ (from 81-01) | ⬜ pending |
| 81-04-T1 | 04 | 3 | D-07, D-14 | content_log rescan rule (offset + count), rotation, window cap | cargo | `cargo test -p gamelib-steampoll --test adoption_evidence --test adoption` | ❌ W0 (adoption_evidence.rs) | ⬜ pending |
| 81-04-T2 | 04 | 3 | D-03, D-14, D-15 | Linux libraryfolders; Win ActiveUser; Linux connection_log; pid change not evidence (4 tests) | cargo | `cargo test -p gamelib-steamfiles --test library`; `cargo test -p gamelib-steampoll --test adoption_evidence --test adoption` | ✅ extend | ⬜ pending |
| 81-05-T1 | 05 | 3 | D-03, D-04, D-05, D-10, D-14 | Play gate all OSes, reading-first decision, 'open-steam', refusals | Jest | `pnpm exec jest macSteamAdoption playAdoption games adoptionReplay fakeHomeIsolation` | ❌ W0 (playAdoption.test.ts) | ⬜ pending |
| 81-05-T2 | 05 | 3 | D-06, D-14 | record writer all OSes; unadopted uninstall all OSes; D-06 single point | Jest | `pnpm exec jest games launchDispatch launchWithoutSteam` | ✅ extend | ⬜ pending |
| 81-06-T1 | 06 | 4 | D-05 | refusal -> in-app notice with today's copy | Jest | `pnpm exec jest playAdoption SteamEngineLaunchNotice src/frontend/state/` | ✅ extend | ⬜ pending |
| 81-06-T2 | 06 | 4 | D-05, D-06 | "Launch without Steam" one-shot, eligible only, single flight | Jest | `pnpm exec jest launchDispatch playAdoption SteamEngineLaunchNotice rendererAllowList` | ✅ extend | ⬜ pending |
| 81-07-T1 | 07 | 5 | D-01 | status query + note under GameStatus | Jest (RTL) | `pnpm exec jest adoptionStatus AdoptionNote rendererAllowList` | ❌ W0 (both created here) | ⬜ pending |
| 81-07-T2 | 07 | 5 | D-03, D-07 | push on write/clear/adoptionState; signed-out note; auto-clear | Jest | `pnpm exec jest adoptionStatus adoptionWatch steamPollEventRegistration AdoptionNote src/frontend/state/` | ✅ (from T1) | ⬜ pending |
| 81-07-T3 | 07 | 5 | D-02, D-03, D-04 | Restart Steam now / Open Steam, no prompt | Jest | `pnpm exec jest adoptionStatus AdoptionNote rendererAllowList` | ✅ (from T1) | ⬜ pending |
| 81-08-T1 | 08 | 6 | D-11, D-14 | Installed on first fully-installed tick, every OS; 1026 unchanged | cargo | `cargo test -p gamelib-steampoll --test install_once_complete --test install_loop`; `cargo test -p gamelib-steampoll-cli --test frozen_parity` | ✅ extend | ⬜ pending |
| 81-08-T2 | 08 | 6 | D-11, D-13 | boot re-arm deleted (crate, CLI, shell) | cargo + Jest | `cargo test -p gamelib-steampoll -p gamelib-steampoll-cli`; `cargo test --bin gamelib-shell steampoll`; `pnpm exec jest tauriShellSource -t 'steampoll lifecycle'` | ✅ | ⬜ pending |
| 81-09-T1 | 09 | 7 | D-12 | drain/discard ops, decision mapping, path from profile only | cargo + Jest | `cargo test -p gamelib-steampoll --test hold_migration --test dispatch`; `pnpm exec jest steamPollChannelParity` | ❌ W0 (hold_migration.rs) | ⬜ pending |
| 81-09-T2 | 09 | 7 | D-12, D-13 | boot migration: acf-gone, already-adopted, idempotent re-run | Jest | `pnpm exec jest adoptionWatch bootSourceShape` | ✅ (from 81-02) | ⬜ pending |
| 81-10-T1 | 10 | 8 | D-11, D-13 | no hold symbol in crate/CLI/shell; probes and migration reader kept | cargo | `cargo test -p gamelib-steampoll -p gamelib-steampoll-cli`; `cargo test --bin gamelib-shell steampoll` | ✅ (steam_process.rs split from hold.rs) | ⬜ pending |
| 81-10-T2 | 10 | 8 | D-11 | status without holding; refresh not hold-filtered | cargo + Jest | `cargo test -p gamelib-steampoll --test install_loop`; `pnpm exec jest library.refresh pollsRustBranch.status` | ✅ extend | ⬜ pending |
| 81-11-T1 | 11 | 9 | D-11, D-14 | start contract has no hold field; invariant over darwin/win32/linux | cargo + Jest | `cargo test -p gamelib-steampoll --test install_loop`; `pnpm exec jest games pollsRustBranch.install` | ✅ extend | ⬜ pending |
| 81-11-T2 | 11 | 9 | D-11 | rearmSettled gone from both sides of the wire | cargo + Jest | `cargo test -p gamelib-steampoll --test contracts`; `pnpm exec jest steamPollStateEventParity steamPollEventRegistration` | ✅ extend | ⬜ pending |
| 81-11-T3 | 11 | 9 | D-11, D-13 | Phase 81 deletion gate; dead TS probe removed | Jest (grep gate) | `pnpm exec jest steamPollsPortComplete steamClientProcess` | ✅ extend | ⬜ pending |
| 81-12-T1 | 12 | 10 | D-01..D-09, D-12, D-14 | live-gate contract parses (>= 11 items) | audit-uat | `gsd-tools audit-uat --raw` (81-HUMAN-UAT.md, no parse gap) | ❌ (created here) | ⬜ pending |
| 81-12-T2 | 12 | 10 | — | reachability review, no IMPOSSIBLE row | grep | heading + row counts in 81-HUMAN-UAT.md | ✅ (from T1) | ⬜ pending |
| 81-13-T1 | 13 | 11 | D-08 | fresh builds, one instance, helper live reading | build + live | `pnpm build-steam-bridge && pnpm build:sidecar` + item 1 result | ✅ | ⬜ pending |
| 81-13-T2 | 13 | 11 | D-01..D-05, D-07, D-09, D-12, D-14 | operator live gate on macOS, Windows 11, Linux | manual (checkpoint) | — (see Manual-Only Verifications) | ✅ | ⬜ pending |
| 81-13-T3 | 13 | 11 | — | results recorded, issues filed | grep + planning-gates | no `result: pending`; `pnpm planning-gates` | ✅ | ⬜ pending |

Sampling continuity: no three consecutive tasks lack an automated command (the only manual task, 81-13-T2, sits between two automated ones). D-15 is satisfied by not building the simplified hold (81-04 truth), so it has no test row of its own.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src-tauri/crates/gamelib-steampoll/tests/adoption.rs` — watch lifecycle, per-platform evidence, helper parse, fail-safe (81-01-T2, extended by 81-03-T2, 81-04)
- [ ] `src-tauri/crates/gamelib-steampoll/tests/hold_migration.rs` — drain/discard (81-09-T1)
- [ ] Jest: Play gate per platform, `'open-steam'` decision, D-06 bypass, note component, "Restart Steam now" channel (81-05, 81-06, 81-07: playAdoption.test.ts, adoptionWatch.test.ts, adoptionStatus.test.ts, AdoptionNote.test.tsx, steamAppStateHelper.test.ts)
- [ ] Fixture edits: `state-events.json` (81-01, 81-11), timelines/expected-ts for deleted hold scenarios and `divergences.json` (81-08)
- [ ] Fake helper for Rust tests: ScriptedRunner canned JSON lines plus a temp helper path (81-03); no real Steam in unit tests

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
