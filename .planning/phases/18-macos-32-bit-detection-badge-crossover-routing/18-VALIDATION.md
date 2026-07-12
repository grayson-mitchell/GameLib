---
phase: 18
slug: macos-32-bit-detection-badge-crossover-routing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-12
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.7.0 (ts-jest 29.3.2) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npm test -- --testPathPattern=steam` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–60 seconds (steam scope), full suite longer |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=steam`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green + `npm run codecheck`
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Task IDs finalized by the planner; rows below are requirement-anchored seeds. `✅ W0` = fixture/scaffold created in Wave 0.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-02-xx | 02 | 1 | MAC32-01 | T-06-02 | `parseSteamMacMinOSVersion` bounded-regex parse of untrusted `mac_requirements.minimum` HTML; never throws/renders; unparseable→`null` | unit | `npm test -- --testPathPattern=steam/games` | ❌ W0 | ⬜ pending |
| 18-02-xx | 02 | 1 | MAC32-01 | — | `macArchFromMinOS`: min-OS ≥10.15→`'64'`; ≤10.14/absent/`[]`→`'unknown'` (type-level impossible to return `'32'`); AoW III 10.9.3 & A Hat in Time 10.11.6 both →`'unknown'` | unit | `npm test -- --testPathPattern=steam/games` | ❌ W0 | ⬜ pending |
| 18-02-xx | 02 | 1 | MAC32-02 | — | `isBottleEligible()` returns true for `mac_arch==='32'` via independent OR-branch; unchanged for win/linux/64/unknown | unit | `npm test -- --testPathPattern=steam/games` | ❌ W0 | ⬜ pending |
| 18-03-xx | 03 | 2 | MAC32-03 | — | Mach-O `lipo -archs` output `i386`-only → re-route verdict `'32'`; `x86_64`/`arm64` present → `native`; verdict cached | unit | `npm test -- --testPathPattern=steam` | ❌ W0 | ⬜ pending |
| 18-04-xx | 04 | 2 | MAC32-04 | — | Badge renders "32" when `mac_arch==='32'`; warning styling only when host is macOS | unit (RTL) | `npm test -- --testPathPattern=Game` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/storeManagers/steam/__tests__/fixtures/appinfo-*.json` — captured by 18-01; retained as evidence that PICS carries no mac-arch signal (direction-B pivot). The min-OS parser (MAC32-01) is validated against these titles' real `mac_requirements.minimum` strings, seeded literally in `games.test.ts`.
- [ ] Extend `src/backend/storeManagers/steam/__tests__/games.test.ts` — RED scaffolds for the min-OS heuristic parser `parseSteamMacMinOSVersion`/`macArchFromMinOS` (MAC32-01) and the `isBottleEligible()` 32-bit OR-branch (MAC32-02).
- [ ] Extend `src/backend/storeManagers/steam/__tests__/library.test.ts` — RED scaffolds for the Mach-O verdict logic (MAC32-03).
- [ ] Frontend RTL test scaffold for the OS/arch badge (MAC32-04).

*Existing jest infrastructure covers the framework — only fixtures + new specs needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A real 32-bit-only mac Steam game routes to the bottle instead of native install on actual macOS | MAC32-02 | Requires macOS host + real Steam + a known 32-bit title; not reproducible in CI | On macOS, open a known 32-bit-only mac title, click Install, confirm it routes through the CrossOver bottle (not native `steam://`) |
| Post-install Mach-O re-route catches a Steam-mistagged i386 game | MAC32-03 | Requires a real i386 `.app` on disk + macOS `lipo` | Install a native game whose `osarch` is blank but binary is i386-only; confirm GameLib flips it to bottle-routed after install |
| Badge "32" mark renders correctly beside the game logo | MAC32-04 | Visual placement over `.gamePicture` | On the game page, verify the "32" mark overlays near `.store-icon` for a 32-bit title |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (appinfo fixtures)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
