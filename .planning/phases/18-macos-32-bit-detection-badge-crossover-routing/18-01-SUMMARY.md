---
phase: 18-macos-32-bit-detection-badge-crossover-routing
plan: 01
subsystem: steam
tags: [steam-user, getProductInfo, pics-appinfo, mac-arch, electron-store, types]

# Dependency graph
requires:
  - phase: 07-game-details-enrichment
    provides: SteamMetadataCacheEntry + is_mac_native platform-capture pattern
  - phase: 17-steam-on-macos-via-crossover
    provides: isBottleEligible() D-11 routing gate the mac_arch signal will extend
provides:
  - GameInfo.mac_arch ('32' | '64' | 'unknown') type contract
  - SteamMetadataCacheEntry.{mac_arch, mac_arch_verified, mac_arch_source} cache fields
  - scripts/steam-appinfo-dump.cjs — self-authenticating PICS getProductInfo dump harness with scannable terminal QR
  - Four real captured appinfo fixtures documenting that PICS appinfo carries NO mac-arch signal
affects: [18-02, 18-03, 18-04, phase-19-community-override-export]

# Tech tracking
tech-stack:
  added: [qrcode-generator (dev harness only — already installed)]
  patterns:
    - "flat optional mac_arch fields mirroring is_mac_native/platformsCaptured (not a nested object)"
    - "standalone .cjs dev harness authenticating via steam-session QR outside Electron"
    - "half-block terminal QR rendering for mobile-app scanning"

key-files:
  created:
    - scripts/steam-appinfo-dump.cjs
    - src/backend/storeManagers/steam/__tests__/fixtures/appinfo-32bit.json
    - src/backend/storeManagers/steam/__tests__/fixtures/appinfo-64bit.json
    - src/backend/storeManagers/steam/__tests__/fixtures/appinfo-no-osarch.json
    - src/backend/storeManagers/steam/__tests__/fixtures/appinfo-false-flag.json
  modified:
    - src/common/types.ts
    - src/backend/storeManagers/steam/electronStores.ts

key-decisions:
  - "PIVOT: Steam PICS appinfo carries NO 32-vs-64 mac-arch signal — osarch is absent on ALL macOS launch entries (confirmed against a real 32-bit AND a real 64-bit game). Drop osarch parsing entirely."
  - "18-02 re-planned: pre-install source becomes store-API mac_requirements min-OS heuristic (≥10.15 ⟹ '64'; ≤10.14/unparseable ⟹ 'unknown' + soft hint). NEVER assert '32' pre-install."
  - "18-03 post-install Mach-O (lipo/file) ground-truth is the only path that asserts '32' and drives CrossOver/Wine routing — unchanged in intent."
  - "V2 (deferred): definitive pre-install detection via mac-depot Mach-O magic peek (steam-user depot manifest + partial chunk download)."

patterns-established:
  - "mac_arch signal: flat optional fields, false-flag-safe (missing signal is NEVER coerced to '32')"
  - "dev-only Steam harness pattern: steam-session QR auth + steam-user client, standalone from Electron/safeStorage"

requirements-completed: []  # MAC32-01 pre-work only; requirement not fully satisfied — re-planned into 18-02/18-03

# Metrics
duration: ~90min (incl. human-run capture checkpoint)
completed: 2026-07-12
---

# Phase 18 Plan 01: macOS Arch-Signal Contracts & appinfo Capture Summary

**Established the `mac_arch` type contracts on GameInfo/SteamMetadataCacheEntry and built a self-authenticating PICS `getProductInfo` dump harness — whose real captures proved Steam appinfo carries NO 32-vs-64 mac-arch signal, forcing a re-plan of the pre-install detection source.**

## Performance

- **Duration:** ~90 min (spanning the human-run capture checkpoint)
- **Completed:** 2026-07-12
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint, now resolved)
- **Files modified:** 2 modified, 5 created

## Accomplishments

- Added `mac_arch?: '32' | '64' | 'unknown'` to `GameInfo` with a false-flag-safe doc comment (absent = unknown, never coerced to '32').
- Added `mac_arch` / `mac_arch_verified` / `mac_arch_source` flat optional fields to `SteamMetadataCacheEntry`, mirroring the existing `is_mac_native`/`platformsCaptured` convention.
- Built `scripts/steam-appinfo-dump.cjs`: a standalone Node harness that authenticates via `steam-session` QR login (no Electron/safeStorage), guards argv AppIDs with `/^\d+$/`, calls `getProductInfo([appIdNum], [])`, writes the unwrapped `appinfo` object to `--out`, and logs observed `oslist`/`osarch` key presence + casing. Enhanced with scannable half-block terminal-QR rendering (`qrcode-generator`) so the Steam mobile app can actually scan the login challenge.
- Captured real appinfo for 7 titles via authenticated Steam sessions, including a CONFIRMED 32-bit game (226840, Age of Wonders III) and a CONFIRMED 64-bit game (570, Dota 2). Committed four fixtures as evidence.

## Pivotal Finding (state prominently)

**Steam PICS appinfo carries NO signal that distinguishes a 32-bit macOS build from a 64-bit one.**

Evidence, directly verifiable in the four committed fixtures:

| Fixture (AppID) | Title | macOS launch entry | osarch on macOS entry | osarch elsewhere |
|-----------------|-------|--------------------|-----------------------|------------------|
| `appinfo-32bit.json` (226840) | Age of Wonders III — **confirmed 32-bit** | present, `{"oslist":"macos"}` | **ABSENT** | absent on all entries |
| `appinfo-64bit.json` (570) | Dota 2 — **confirmed 64-bit** | present, `{"oslist":"macos"}` | **ABSENT** | `"64"` only on windows/linux |
| `appinfo-no-osarch.json` (220) | Half-Life 2 | present | ABSENT | absent everywhere |
| `appinfo-false-flag.json` (253230) | A Hat in Time | present | ABSENT | `"64"` on windows/linux only |

- `config.launch[N].config.osarch` is **absent on every macOS entry** for BOTH the confirmed 32-bit and the confirmed 64-bit game.
- `osarch="64"` appears **only on windows/linux entries**, never on macOS.
- The mac depot `config` block is `{"oslist":"macos"}` — **structurally identical** for the 32-bit and the 64-bit game.
- No `common.sysreqs.mac` arch data present.

**Conclusion:** The confirmed-32-bit game's mac appinfo is structurally indistinguishable from a 64-bit game's. This invalidates the 18-RESEARCH.md `osarch` assumption (Assumption A1), which was community/tooling-sourced, not derived from a canonical Valve schema. The four committed fixtures are now **evidence of this negative result**, not inputs to an osarch parser.

## Decision / Phase Pivot (direction B, user-chosen)

- **Plan 18-02 must be re-planned** — drop appinfo/osarch entirely. New pre-install source = Steam **store API `mac_requirements`** minimum-OS heuristic:
  - min-OS **≥ 10.15 (Catalina)** ⟹ `mac_arch: '64'` (confident — Catalina removed 32-bit support).
  - min-OS **≤ 10.14 or unparseable** ⟹ `mac_arch: 'unknown'` + a **SOFT** "may be 32-bit, verify after install" hint.
  - **Never assert `'32'` pre-install.** A 64-bit game (A Hat in Time, min-OS 10.11.6) lives in the ≤10.14 bucket, so asserting 32 there would reproduce the documented false-flag.
  - Store-API OS strings are inconsistent HTML (`"10.9.3 (Mavericks)"`, `"MAC OS X 10.11.6 or higher"`, `"Leopard 10.5.8, Snow Leopard 10.6.3, or higher"`); ~2/7 titles had no parseable OS line → the redesigned parser needs robust extraction + fallback-to-unknown.
- **Plan 18-03** (post-install Mach-O ground-truth via `lipo -archs`/`file`) is the DEFINITIVE detector and the only path that asserts `'32'`; it powers CrossOver/Wine routing. Unchanged in intent.
- **Plan 18-04** (badge) reflects the tiers: confident 64 → normal; unknown/suspect → soft hint; confirmed-32 (post-install, macOS host) → actionable warning.
- **V2 enhancement (deferred, documented):** definitive pre-install detection by peeking the mac depot binary's Mach-O magic via steam-user (depot manifest + partial chunk download) — heavy, owned-games-only.

## Task Commits

1. **Task 1: Add the mac_arch signal to GameInfo and SteamMetadataCacheEntry** — `ec1b05d9` (feat)
2. **Task 2: Build the getProductInfo appinfo dump harness** — `ebaeadc3` (feat)
3. **Task 2 (coordinator usability fix): Render scannable terminal QR** — `188472a6` (feat)
4. **Task 3: Capture real appinfo fixtures (human-run dump)** — committed with this SUMMARY (test)

## Files Created/Modified

- `src/common/types.ts` — added `GameInfo.mac_arch` optional field + false-flag-safe doc comment.
- `src/backend/storeManagers/steam/electronStores.ts` — added `mac_arch` / `mac_arch_verified` / `mac_arch_source` to `SteamMetadataCacheEntry`.
- `scripts/steam-appinfo-dump.cjs` — self-authenticating PICS `getProductInfo` dump harness + scannable terminal QR.
- `src/backend/storeManagers/steam/__tests__/fixtures/appinfo-32bit.json` — real capture, confirmed 32-bit (226840).
- `src/backend/storeManagers/steam/__tests__/fixtures/appinfo-64bit.json` — real capture, confirmed 64-bit (570).
- `src/backend/storeManagers/steam/__tests__/fixtures/appinfo-no-osarch.json` — real capture, all osarch absent (220).
- `src/backend/storeManagers/steam/__tests__/fixtures/appinfo-false-flag.json` — real capture, false-flag case (253230): mac entry has no osarch, must parse to 'unknown'.

## Decisions Made

See "Decision / Phase Pivot" above. The `mac_arch` type contracts (Task 1) stand and remain the foundation for the redesigned phase; only the *source* of the pre-install hint (Task 3's intended osarch parser) is discarded.

## Deviations from Plan

### Task 3 — purpose changed by empirical finding (Rule 1-adjacent: discovery invalidates a plan assumption)

**1. [Deviation — finding invalidates plan assumption] Fixtures repurposed from "osarch parser inputs" to "no-signal evidence"; forces 18-02 re-plan**
- **Found during:** Task 3 (human-run appinfo capture checkpoint)
- **Issue:** The plan (and 18-RESEARCH.md Assumption A1) assumed `config.launch[N].config.osarch` on the macOS entry would distinguish 32-bit from 64-bit builds. Real captures of a confirmed 32-bit AND a confirmed 64-bit game proved `osarch` is absent on ALL macOS entries — there is no such signal in PICS appinfo.
- **Fix:** The four required fixtures were captured and committed exactly as the acceptance shape demanded, but their role changed from "gate the osarch parser (Plan 02)" to "documented evidence of the no-signal result." The finding triggers a re-plan of 18-02 (store-API `mac_requirements` min-OS heuristic replaces osarch parsing) — see the Decision / Phase Pivot section.
- **Files modified:** the four `appinfo-*.json` fixtures.
- **Verification:** Each fixture parses as JSON and is the unwrapped single-app appinfo object (top-level `appid`/`common`/`config`/`depots`). Cross-checked that `osarch` is absent on every `oslist:"macos"` entry in all four; `osarch="64"` appears only on windows/linux entries.
- **Committed in:** this plan's fixture+SUMMARY commit.

---

**Total deviations:** 1 (a finding that invalidates a plan assumption).
**Impact on plan:** Task 1's type contracts and Task 2's harness are fully intact and reused. Only 18-02's detection *source* is discarded; the phase's shape (18-03 Mach-O ground truth, 18-04 badge tiers) is preserved. No scope creep — the pivot narrows and de-risks the phase.

## Issues Encountered

- The dump harness initially printed only the raw `qrChallengeUrl`, which opens a generic Steam page with nothing to approve; the Steam mobile app needs to scan an actual QR image. Resolved by adding half-block terminal-QR rendering (commit `188472a6`) before the human ran the captures.

## Next Phase Readiness

- **18-02 requires re-planning** before execution: drop osarch, adopt the store-API `mac_requirements` min-OS heuristic with the never-assert-'32' rule.
- Type contracts (`mac_arch` + provenance) are ready for 18-02/18-03/18-04 to compile against.
- Fixtures are available as regression evidence and as negative-case test inputs (the false-flag fixture in particular must parse to 'unknown').

## Self-Check: PASSED

- All four fixtures present and parse as unwrapped single-app appinfo objects.
- SUMMARY.md present.
- Task commits `ec1b05d9`, `ebaeadc3`, `188472a6` all exist in git.

---
*Phase: 18-macos-32-bit-detection-badge-crossover-routing*
*Completed: 2026-07-12*
