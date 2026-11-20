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

Filled by the planner (2026-11-17); renumbered the same day when the scope_sanity revision split the plan set from 13 plans to 20 (old 81-02 -> 02+03, old 03-06 -> 04-07, old 07 -> 08+09, old 08 -> 10+11, old 09 -> 12+13, old 10+11 -> 13 (Task 2), 14-18, old 12-13 -> 19-20). One row per task; every task carries an `<automated>` command with a stated `<fails_when>` in its PLAN.md (copy the full command from there). Wave 0 test files are created inside the task that first needs them (tests are written before or with the code, `tdd="true"`).

| Task | Plan | Wave | Decisions | Behavior proved | Test type | Automated command (short form) | File exists | Status |
|------|------|------|-----------|-----------------|-----------|--------------------------------|-------------|--------|
| 81-01-T1 | 01 | 1 | D-07 | adoptionState round-trips Rust -> zod -> handler clears record | cargo + Jest | `cargo test -p gamelib-steampoll --test contracts`; `pnpm exec jest steamPollStateEventParity steamPollEventRegistration` | ✅ extend | ⬜ pending |
| 81-01-T2 | 01 | 1 | D-07, D-10, D-14 | watch lifecycle; ACF rewrite all OS; Mac pid; Win/Linux pid not evidence; mtime trap | cargo (paused time) | `cargo test -p gamelib-steampoll --test adoption` | ❌ W0 (created here) | ⬜ pending |
| 81-02-T1 | 02 | 2 | D-07 | watch op on crate, shell, TS; bad-args at every layer | cargo + Jest | `cargo test -p gamelib-steampoll --test dispatch`; `cargo test --bin gamelib-shell steampoll`; `pnpm exec jest steamPollChannelParity rustInvokeSchemas` | ✅ extend | ⬜ pending |
| 81-02-T2 | 02 | 2 | D-07, D-10 | unwatch and read ops; read fails as an error string | cargo + Jest | same as 81-02-T1 | ✅ extend | ⬜ pending |
| 81-03-T1 | 03 | 3 | D-07, D-10 | install-end record write watches, clear unwatches; read null on failure | Jest | `pnpm exec jest adoptionWatch games moduleStateCensus` | ❌ W0 (adoptionWatch.test.ts) | ⬜ pending |
| 81-03-T2 | 03 | 3 | D-07 | every other clear unwatches, boot resumes, orphan cleared | Jest | `pnpm exec jest adoptionWatch macSteamAdoption games bootSourceShape` | ✅ (from T1) | ⬜ pending |
| 81-04-T1 | 04 | 2 | D-08 | real compiled `--steam-appstate` (fake HOME); Rust reader parse/fail-safe | Jest + cargo | `pnpm exec jest steamAppStateHelper`; `cargo test -p gamelib-steampoll --test app_state` | ❌ W0 (both created here) | ⬜ pending |
| 81-04-T2 | 04 | 2 | D-03, D-07, D-08, D-09, D-10 | helper state 4 adopts; signedIn; pid re-check; one guarded InstallApp | cargo | `cargo test -p gamelib-steampoll --test adoption --test app_state --test update` | ✅ (from 81-01) | ⬜ pending |
| 81-05-T1 | 05 | 3 | D-07, D-14 | content_log rescan rule (offset + count), rotation, window cap | cargo | `cargo test -p gamelib-steampoll --test adoption_evidence --test adoption` | ❌ W0 (adoption_evidence.rs) | ⬜ pending |
| 81-05-T2 | 05 | 3 | D-03, D-14, D-15 | Linux libraryfolders; Win ActiveUser; Linux connection_log; pid change not evidence (4 tests) | cargo | `cargo test -p gamelib-steamfiles --test library`; `cargo test -p gamelib-steampoll --test adoption_evidence --test adoption` | ✅ extend | ⬜ pending |
| 81-06-T1 | 06 | 4 | D-03, D-04, D-05, D-10, D-14 | Play gate all OSes, reading-first decision, 'open-steam', refusals | Jest | `pnpm exec jest macSteamAdoption playAdoption games adoptionReplay fakeHomeIsolation` | ❌ W0 (playAdoption.test.ts) | ⬜ pending |
| 81-06-T2 | 06 | 4 | D-06, D-14 | record writer all OSes; unadopted uninstall all OSes (operator-confirmed 2026-11-17); D-06 single point | Jest | `pnpm exec jest games launchDispatch launchWithoutSteam` | ✅ extend | ⬜ pending |
| 81-07-T1 | 07 | 5 | D-05 | refusal -> in-app notice with today's copy | Jest | `pnpm exec jest playAdoption SteamEngineLaunchNotice src/frontend/state/` | ✅ extend | ⬜ pending |
| 81-07-T2 | 07 | 5 | D-05, D-06 | "Launch without Steam" one-shot, eligible only, single flight | Jest | `pnpm exec jest launchDispatch playAdoption SteamEngineLaunchNotice rendererAllowList` | ✅ extend | ⬜ pending |
| 81-08-T1 | 08 | 6 | D-01 | status query + note under GameStatus | Jest (RTL) | `pnpm exec jest adoptionStatus AdoptionNote rendererAllowList` | ❌ W0 (both created here) | ⬜ pending |
| 81-08-T2 | 08 | 6 | D-02, D-03, D-04 | Restart Steam now / Open Steam, signed-out text, no prompt, re-query after an action | Jest | `pnpm exec jest adoptionStatus AdoptionNote rendererAllowList` | ✅ (from T1) | ⬜ pending |
| 81-09-T1 | 09 | 7 | D-07 | push on record write/clear; renderer validation; note hides on pending false | Jest | `pnpm exec jest adoptionStatus adoptionWatch AdoptionNote src/frontend/state/` | ✅ extend | ⬜ pending |
| 81-09-T2 | 09 | 7 | D-03, D-07 | adoptionState signedIn cached and pushed; signed-out note live | Jest | `pnpm exec jest adoptionStatus steamPollEventRegistration AdoptionNote` | ✅ extend | ⬜ pending |
| 81-10-T1 | 10 | 8 | D-11, D-14 | Installed on first fully-installed tick, every OS; 1026 unchanged; hold scenarios deleted | cargo | `cargo test -p gamelib-steampoll --test install_once_complete --test install_loop`; `cargo test -p gamelib-steampoll-cli --test frozen_parity` | ✅ extend | ⬜ pending |
| 81-10-T2 | 10 | 8 | D-11, D-14 | restart toast bottle-only; install-depot-skipped stream edit recorded | cargo | same as 81-10-T1 | ✅ extend | ⬜ pending |
| 81-11-T1 | 11 | 9 | D-11, D-13 | boot re-arm deleted (crate, CLI, shell) | cargo + Jest | `cargo test -p gamelib-steampoll -p gamelib-steampoll-cli`; `cargo test --bin gamelib-shell steampoll`; `pnpm exec jest tauriShellSource -t 'steampoll lifecycle'` | ✅ | ⬜ pending |
| 81-11-T2 | 11 | 9 | D-11 | no re-arm state in the install loop; restoredSteamHold accepted and ignored | cargo | `cargo test -p gamelib-steampoll` | ✅ extend | ⬜ pending |
| 81-12-T1 | 12 | 10 | D-12 | drain op, decision mapping, path from profile only | cargo + Jest | `cargo test -p gamelib-steampoll --test hold_migration --test dispatch`; `pnpm exec jest steamPollChannelParity` | ❌ W0 (hold_migration.rs) | ⬜ pending |
| 81-12-T2 | 12 | 10 | D-12 | discard op: delete, missing file, I/O failure | cargo + Jest | same as 81-12-T1 | ✅ (from T1) | ⬜ pending |
| 81-13-T1 | 13 | 11 | D-12, D-13 | boot migration: acf-gone, already-adopted, drain-rejected, idempotent re-run | Jest | `pnpm exec jest adoptionWatch bootSourceShape` | ✅ (from 81-03) | ⬜ pending |
| 81-13-T2 | 13 | 11 | D-11 | rearmSettled gone from both sides of the wire | cargo + Jest | `cargo test -p gamelib-steampoll --test contracts`; `pnpm exec jest steamPollStateEventParity steamPollEventRegistration ipcSchemas/sidecarInternal` | ✅ extend | ⬜ pending |
| 81-14-T1 | 14 | 12 | D-11 | no hold state machine; 1026 wait and bottle toast unchanged; only `file` records leave frozen streams | cargo | `cargo test -p gamelib-steampoll -p gamelib-steampoll-cli` | ✅ extend | ⬜ pending |
| 81-14-T2 | 14 | 12 | D-11, D-14 | start contract has no hold field; invariant over darwin/win32/linux | cargo + Jest | `cargo test -p gamelib-steampoll --test install_loop`; `pnpm exec jest games pollsRustBranch.install` | ✅ extend | ⬜ pending |
| 81-15-T1 | 15 | 13 | D-11 | no hold sink in effects, install loop, facade, shell or CLI replay | cargo | `cargo test -p gamelib-steampoll -p gamelib-steampoll-cli`; `cargo test --bin gamelib-shell steampoll` | ✅ | ⬜ pending |
| 81-15-T2 | 15 | 13 | D-11 | hold-probe interval constant gone | cargo | `cargo test -p gamelib-steampoll --test contracts` | ✅ | ⬜ pending |
| 81-16-T1 | 16 | 14 | D-11 | probes moved to steam_process.rs with their tests | cargo | `cargo test -p gamelib-steampoll` | ❌ W0 (tests/steam_process.rs, split from tests/hold.rs) | ⬜ pending |
| 81-16-T2 | 16 | 14 | D-11, D-13 | hold.rs deleted; records and read_hold_store in hold_migration.rs | cargo | `cargo test -p gamelib-steampoll -p gamelib-steampoll-cli`; `cargo test --bin gamelib-shell steampoll` | ✅ | ⬜ pending |
| 81-16-T3 | 16 | 14 | D-11 | the recorder's hold-file record dropped | cargo | `cargo test -p gamelib-steampoll` | ✅ | ⬜ pending |
| 81-17-T1 | 17 | 15 | D-11 | refresh not hold-filtered | Jest | `pnpm exec jest library.refresh library.installedMap` | ✅ extend | ⬜ pending |
| 81-17-T2 | 17 | 15 | D-11 | status without holding / steamHold on both sides | cargo + Jest | `cargo test -p gamelib-steampoll --test install_loop`; `pnpm exec jest pollsRustBranch.status updateNative` | ✅ extend | ⬜ pending |
| 81-18-T1 | 18 | 16 | D-11 | dead TS start-token probe and its mock keys removed | Jest | `pnpm exec jest steamClientProcess library rustSecondary` | ✅ extend | ⬜ pending |
| 81-18-T2 | 18 | 16 | D-11, D-13 | Phase 81 deletion gate | Jest (grep gate) | `pnpm exec jest steamPollsPortComplete` | ✅ extend | ⬜ pending |
| 81-19-T1 | 19 | 17 | D-01..D-09, D-12, D-14 | live-gate contract parses (>= 11 items) | audit-uat | `gsd-tools audit-uat --raw` (81-HUMAN-UAT.md, no parse gap) | ❌ (created here) | ⬜ pending |
| 81-19-T2 | 19 | 17 | — | reachability review, no IMPOSSIBLE row | grep | heading + row counts in 81-HUMAN-UAT.md | ✅ (from T1) | ⬜ pending |
| 81-20-T1 | 20 | 18 | D-08 | fresh builds, one instance, helper live reading | build + live | `pnpm build-steam-bridge && pnpm build:sidecar` + item 1 result | ✅ | ⬜ pending |
| 81-20-T2 | 20 | 18 | D-01..D-05, D-07, D-09, D-12, D-14 | operator live gate on macOS, Windows 11, Linux | manual (checkpoint) | — (see Manual-Only Verifications) | ✅ | ⬜ pending |
| 81-20-T3 | 20 | 18 | — | results recorded, issues filed | grep + planning-gates | no `result: pending`; `pnpm planning-gates` | ✅ | ⬜ pending |

Sampling continuity: no three consecutive tasks lack an automated command (the only manual task, 81-20-T2, sits between two automated ones). D-15 is satisfied by not building the simplified hold (81-05 truth), so it has no test row of its own. Release coupling: 81-10..81-13 ship in the same release (operator decision 2026-11-17).

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src-tauri/crates/gamelib-steampoll/tests/adoption.rs` — watch lifecycle, per-platform evidence, helper parse, fail-safe (81-01-T2, extended by 81-04-T2, 81-05)
- [ ] `src-tauri/crates/gamelib-steampoll/tests/hold_migration.rs` — drain/discard (81-12-T1), later the record parser and read_hold_store (81-16-T2)
- [ ] `src-tauri/crates/gamelib-steampoll/tests/steam_process.rs` — probes and parsers moved from tests/hold.rs (81-16-T1)
- [ ] Jest: Play gate per platform, `'open-steam'` decision, D-06 bypass, note component, "Restart Steam now" channel (81-03, 81-06, 81-07, 81-08, 81-09: adoptionWatch.test.ts, playAdoption.test.ts, adoptionStatus.test.ts, AdoptionNote.test.tsx; 81-04: steamAppStateHelper.test.ts)
- [ ] Fixture edits: `state-events.json` (81-01, 81-13); hold and rearm scenario deletions (81-10, 81-11); frozen-stream edits that drop records the Rust replay no longer emits, listed in each SUMMARY (install-depot-skipped in 81-10; `file` records in 81-14); `divergences.json` and frozen_parity.rs untouched
- [ ] Fake helper for Rust tests: ScriptedRunner canned JSON lines plus a temp helper path (81-04); no real Steam in unit tests

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
