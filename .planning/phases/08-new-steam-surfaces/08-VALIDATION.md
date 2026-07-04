---
phase: 8
slug: new-steam-surfaces
status: approved
nyquist_compliant: false
wave_0_complete: true
created: 2026-07-04
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Reconstructed retroactively (State B) from 08-01..06 PLAN/SUMMARY, 08-VERIFICATION.md
> (16/16 truths), 08-UAT.md, and 08-HUMAN-UAT.md. Covers STORE-01 (Steam storefront tab)
> and CONSOLE-01 (Steam in Console mode) plus gap-closure plans 08-03..06 (UAT gaps A–D, F).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | `jest.config.js` (`resetMocks: true`) |
| **Quick run command** | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts --no-coverage` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~1 second (touched suite); full suite longer |

> **Note:** This project has **no frontend (React) test infrastructure** — jest coverage is
> backend-only (steam managers, wiki_game_info). Phase 8 is predominantly frontend, so most
> of its surfaces are verified via `08-VERIFICATION.md` (code inspection, 16/16) and runtime
> HUMAN-UAT rather than automated unit tests.

---

## Sampling Rate

- **After every task commit:** Run the quick command for the touched backend area
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~1 second (targeted backend suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01 | 01 | 1 | STORE-01 (Steam store tab + WebView + last-URL) | — | No LoginWarning for steam; store URL is a fixed literal | manual | — | — | 📋 manual |
| 08-02 | 02 | 2 | CONSOLE-01 (ConsoleMode grid + launch/install overlays) | — | InstallOverlay routes through `install()` helper; no raw `steam://` | manual | — | — | 📋 manual |
| 08-03 | 03 | 1 | CONSOLE-01 (branded fallback art + greyed variant + onError) | — | N/A | manual | — | — | 📋 manual |
| 08-04 | 04 | 1 | CONSOLE-01 (is_delisted backend detection) | — | Transient API failure must NOT mark owned games delisted | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts` | ✅ | ✅ green |
| 08-05 | 05 | 1 | CONSOLE-01 (LaunchOverlay blur-dismiss + 8s safety) | — | N/A | manual | — | — | 📋 manual |
| 08-06 | 06 | 1 | STORE-01 (Deals "Hide Owned" all-store) | — | N/A | manual | — | — | 📋 manual |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · 📋 manual*

---

## Wave 0 Requirements

Existing backend infrastructure covers the one automatable Phase 8 behavior. One coverage gap
was filled retroactively during this validation audit (2026-07-04):

- [x] `src/backend/storeManagers/steam/__tests__/games.test.ts` — new describe `SteamGame.fetchMetadataIfNeeded — is_delisted detection (CONSOLE-01 Gap B)`, 4 behavioral tests replacing the prior grep-only verification:
  - B1: `success:false` → `is_delisted:true` persisted to steamMetadataStore + library + pushGameToLibrary
  - B2: `success:true` → `is_delisted` cleared to `false` on all three sinks
  - B3: ambiguous empty envelope (no success, no data) → is_delisted NOT written (transient must not hide owned games)
  - B4: network throw → catch block never marks games delisted

All frontend surfaces (React) have no unit-test infrastructure and are covered by 08-VERIFICATION.md + HUMAN-UAT.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Steam Store tab loads store.steampowered.com in WebView; no LoginWarning; last-URL persists | STORE-01 | React WebView + running renderer; no frontend test infra | Sidebar → Stores → Steam Store; confirm storefront loads, no login warning (08-VERIFICATION truths 1–3, HUMAN-UAT) |
| Owned Steam games appear in Console grid with Steam chip; empty library triggers refresh | CONSOLE-01 | React ConsoleMode + real Steam library at runtime | Open Console mode; confirm Steam games + chip (08-VERIFICATION truths 4–6) |
| Branded GameLib fallback art + greyed "Artwork unavailable" variant on broken/404 art | CONSOLE-01 | CachedImage onError fires on real CDN 404; running renderer | Observe a game with broken art URL → greyed placeholder; no blank tiles (truths 9–12) |
| Delisted games hidden from Console grid; activation is a no-op | CONSOLE-01 | Requires a real Steam account owning a delisted game | Confirm delisted game absent from Console; valid games stay visible offline (truths 14–15; backend detection is unit-tested via 08-04) |
| LaunchOverlay "Launched in Steam" dismisses on window blur, not fixed 1500ms; 8s safety ceiling | CONSOLE-01 | Window blur + Steam client foregrounding require running Electron + Steam | Activate installed Steam game; overlay persists until blur/8s (truth 7, HUMAN-UAT Gap D) |
| Deals "Hide Owned" hides catalog matches across all 5 stores; gated on any-store ownership | STORE-01 | React Discounts + multi-store libraries at runtime | Enable Hide Owned on Deals; confirm cross-store hiding (truth 16, HUMAN-UAT Gap F) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a documented manual-only justification
- [x] Sampling continuity: backend logic (the only automatable surface) has automated verify
- [x] Wave 0 covers all MISSING references (is_delisted gap filled 2026-07-04)
- [x] No watch-mode flags
- [x] Feedback latency < 5s (targeted suite)
- [ ] `nyquist_compliant: true` — PARTIAL: the single backend behavior is automated; the 5 frontend tasks are inherently manual (no React test infra in this project) and are covered by 08-VERIFICATION.md (16/16) + HUMAN-UAT

**Approval:** approved 2026-07-04 (partial — frontend manual-only items justified above)

---

## Validation Audit 2026-07-04

| Metric | Count |
|--------|-------|
| Gaps found | 1 |
| Resolved | 1 |
| Escalated (→ manual-only) | 0 |

CONSOLE-01 Gap B (is_delisted delisted-detection) was filled with 4 behavioral unit tests
covering all branches, replacing the prior grep-only verification. Run green:
games.test.ts 59/59 (incl. 4 new). All other Phase 8 surfaces are frontend React with no
unit-test infrastructure — verified via 08-VERIFICATION.md (16/16 truths) and HUMAN-UAT.
