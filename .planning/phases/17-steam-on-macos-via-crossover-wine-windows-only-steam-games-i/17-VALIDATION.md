---
phase: 17
slug: steam-on-macos-via-crossover-wine-windows-only-steam-games-i
status: automated-pass
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-10
automated_verified: 2026-07-10
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 via ts-jest, two projects (`src/backend`, `src/frontend`) |
| **Config file** | `jest.config.js` (repo root) |
| **Quick run command** | `npm test -- --testPathPattern=steam` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30-90 seconds (quick), full suite ~2-4 min |
| **Actual full-suite runtime (17-07 Task 1)** | 15.2s (`npm test`) — 45 suites / 908 tests passed, 0 failed; `npm run codecheck` (tsc --noEmit) exit 0, no errors |
| **Re-confirmed after gap-closure (2026-07-11)** | `npm test` — 48 suites / 934 tests passed, 0 failed (6.0s); `npm run codecheck` exit 0. Re-run after 17-08/09/10 + debug fixes (`ac35a8ce`, `432f0870`) to keep "suite green before sign-off" honest. |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=steam` (or `=InstallGameModal` for the frontend routing task) + `npm run codecheck`
- **After every plan wave:** Run `npm test` (full suite) + `npm run codecheck`
- **Before `/gsd:verify-work`:** Full suite must be green (17-07 Task 1 gate)
- **Max feedback latency:** ~90 seconds (quick command)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-02 | 01 | 0 | MACSTEAM-02 | T-17-01 | cxbottle argv is discrete-word, name is a constant | manual (spike) | `bash -n spike/steam-bottle/probe-cxbottle.sh` | ✅ (new) | ✅ green |
| 17-02-01 | 02 | 1 | MACSTEAM-02 | T-17-SC | constants distinct from shared bottle; HTTPS-only URL | unit | `npm run codecheck` | ✅ existing | ✅ green |
| 17-02-02 | 02 | 1 | MACSTEAM-05 | T-17-01 | sanitizeBottleName rejects path traversal | unit | `npm test -- --testPathPattern=steam/bottle` | ✅ (new bottle.test.ts) | ✅ green |
| 17-03-01 | 03 | 2 | MACSTEAM-05 | T-17-05 | bottle ACF scan distinct from native; corrupt-file skip | unit | `npm test -- --testPathPattern=steam/library` | ✅ existing (extend) | ✅ green |
| 17-03-02 | 03 | 2 | MACSTEAM-05 | T-17-03 | bottle install labelled Windows; gated on provisioned | unit | `npm test -- --testPathPattern=steam/library` | ✅ existing (extend) | ✅ green |
| 17-04-01 | 04 | 2 | MACSTEAM-02 | T-17-02 | HTTPS-only SteamSetup; non-silent; provisioned only on cxbottle.conf | unit | `npm test -- --testPathPattern=steam/bottle` | ✅ (extend bottle.test.ts) | ✅ green |
| 17-04-02 | 04 | 2 | MACSTEAM-04 | T-17-04 | appId numeric-guard before command; provisioned pre-flight | unit | `npm test -- --testPathPattern=steam/bottle` | ✅ (extend) | ✅ green |
| 17-04-03 | 04 | 2 | MACSTEAM-03 | T-17-06 | no bottled-credential inspection (D-04 opaque) | unit | `npm run codecheck` | ✅ existing | ✅ green |
| 17-05-01 | 05 | 3 | MACSTEAM-01 | T-17-08 | confirmed-not-native requires platformsCaptured (D-11) | unit | `npm test -- --testPathPattern=steam/games` | ✅ existing (extend) | ✅ green |
| 17-05-02 | 05 | 3 | MACSTEAM-04 | T-17-04 | bottle routing vs native path; scope-fence regression guard | unit | `npm test -- --testPathPattern=steam/games` | ✅ existing (extend) | ✅ green |
| 17-05-03 | 05 | 3 | MACSTEAM-01 | T-17-07 | runWineCommandOnGame refuses steam | unit | `npm run codecheck` | ✅ existing | ✅ green |
| 17-06-01 | 06 | 3 | MACSTEAM-04 | T-17-09/08 | guided flow fires from backend signal for ALL entry points; frontend does NOT gate on raw is_mac_native (D-11 backend-owned) | unit (frontend) | `npm test -- --testPathPattern=SteamBottleSetup` | ✅ (new test file, 5/5 pass) | ✅ green |
| 17-06-02 | 06 | 3 | MACSTEAM-02/03 | T-17-01 | provision via IPC; name re-sanitized backend-side | unit + visual | `npm run codecheck` | ✅ (new component) | ✅ green (unit); visual = manual-only (see below) |
| 17-06-03 | 06 | 3 | MACSTEAM-06 | — | indicator gated on confirmed-not-native | unit + visual | `npm run codecheck` | ✅ existing | ✅ green (unit); visual = manual-only (see below) |
| 17-07-01 | 07 | 4 | ALL | — | full-suite gate | suite | `npm test && npm run codecheck` | ✅ | ✅ green — 45 suites / 908 tests pass, 0 failed; `tsc --noEmit` exit 0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Automated gate result (17-07 Task 1, 2026-07-10):** `npm test` → 45 suites, 908 tests, 0 failures, 15.2s. `npm run codecheck` (`tsc --noEmit`) → exit 0, no type errors. All MACSTEAM-01..06 rows above that have an automated test are green; MACSTEAM-02/03/04/05/06's real-runtime surface (bottle creation, login persistence, install/launch through the bottle, visual indicator) remains manual-only per the table below and is deferred to Task 2's human UAT.

---

## Wave 0 Requirements

- [x] `spike/steam-bottle/probe-cxbottle.sh` + `FINDINGS.md` — resolve Assumption A1 (cxbottle create mechanism) before 17-04 provisioning (plan 17-01)
- [x] `src/backend/storeManagers/steam/__tests__/bottle.test.ts` — new test file for the bottle foundation (created in 17-02)
- [x] `src/frontend/state/__tests__/SteamBottleSetup.test.ts` — new test file for the guided-setup store + the global `steamBottleSetupRequired` listener wiring (created in 17-06). NOTE: `InstallGameModal.ts` is no longer patched — the guided flow is driven by the backend signal + global listener (single point of truth), so the earlier InstallGameModal.test.ts gap is superseded.
- [x] Bottle-path ACF fixtures added to `src/backend/storeManagers/steam/__tests__/library.test.ts` (17-03)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| cxbottle bottle creation | MACSTEAM-02 | Requires a real CrossOver install; not mockable | 17-01 spike probe on real CrossOver |
| Guided provisioning + SteamSetup click-through | MACSTEAM-02 | Real installer window under Wine | 17-07 UAT step 1 |
| One-time bottled-Steam login persistence | MACSTEAM-03 | Real Steam client state inside the bottle; opaque by design (D-04) | 17-07 UAT step 2 |
| Install/launch through the bottled Steam client | MACSTEAM-04 | Real bottled Steam + real depot | 17-07 UAT steps 3-4 |
| Bottle-scoped badge = Windows install | MACSTEAM-05 | Requires a real bottle ACF | 17-07 UAT step 3 (Install Info platform/path) |
| D-08 "runs via Windows Steam bottle" indicator | MACSTEAM-06 | Visual/GUI (codebase convention: "Runtime visual UAT pending") | 17-07 UAT step 5 |
| Guided flow fires from ALL entry points (game-details button, library grid, install modal) | MACSTEAM-04 | Requires the running app; the three entry points differ in code path | 17-07 UAT step 1 (drive from game page AND grid) |
| Scope fences (native-Mac steam://, GOG/Epic shared bottle, Linux Proton) | MACSTEAM-01/04 | Requires the running app on each platform | 17-07 UAT step 7 |

---

## Out-of-Scope (documented, not gaps)

- **GAME-05 "Playing" badge parity for bottled games** — the native running-game poller reads the native Steam `registry.vdf`; a bottled client writes its RunningAppID to a Windows-side registry inside the prefix (RESEARCH.md Open Question 3, PATTERNS.md "No Analog Found"). Explicitly deferred: Phase 17 scope is "install and launch" only (ROADMAP + CONTEXT do not mention GAME-05). Tracked as a known limitation / follow-up, not an under-delivery.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every row in the Per-Task Verification Map has a concrete automated command)
- [x] Wave 0 covers all MISSING references (bottle.test.ts, SteamBottleSetup.test.ts, library bottle fixtures) — all three now exist and pass
- [x] No watch-mode flags
- [x] Feedback latency < 90s (full suite ran in 15.2s)
- [x] `nyquist_compliant: true` set in frontmatter (17-07 Task 1)

**Automated half status:** COMPLETE (2026-07-10) — full suite green (45/45 suites, 908/908 tests), `npm run codecheck` exit 0. All six MACSTEAM requirements have at least one automated test covering their code-level behavior; the real-hardware runtime surface (bottle creation, bottled login, install/launch through the bottle, visual indicator, scope-fence regressions on real CrossOver) is enumerated in Manual-Only Verifications above and awaits Task 2's human UAT.

**Approval:** pending (blocked on Task 2 — end-to-end macOS UAT on real CrossOver)
