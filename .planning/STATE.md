---
gsd_state_version: "1.0"
milestone: v0.8
current_phase_name: "Epic store in-app on macOS: a Rust-managed raw WKWebView subview for /store/epic"
status: Awaiting next milestone
stopped_at: Completed quick task 261016-t3e -- bottled-Steam install-dir process monitor landed (fixture-verified, live CrossOver gate still owed)
last_updated: "2026-10-16T08:34:16.609Z"
last_activity: 2026-10-16
last_activity_desc: Quick task 261016-t3e bottled-Steam process monitor landed; Milestone v0.8 completed and archived
state_head: f272eb6389578b1e900d8ce592cfbe78a32d8e81
progress:
  total_phases: 45
  completed_phases: 36
  total_plans: 554
  completed_plans: 545
  percent: 80
milestone_name: Tauri Shell
current_phase: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-16)

**Core value:** One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.
**Current focus:** Planning the next milestone — run `/gsd-new-milestone`. v0.8 Tauri Shell shipped 2026-10-16 as an **override closeout** (26 of 45 phases unverified; 429 artifacts acknowledged; 140 evidence-table rows left open — see `## Deferred Items`). Phase dirs 27–50 (+22) now live under `milestones/v0.8-phases/`; 5–26 stay in `phases/`.

> **Version renumber (2026-07-20):** the whole project was renumbered from the
> inflated `v1.x` planning labels to `0.x` to reflect pre-release status (map:
> v1.N → v0.(N+1)). Milestones are now: **v0.1** Steam Platform · **v0.2** Polish ·
> **v0.3** Humble · **v0.4** Compatibility Data · **v0.5** macOS Compat Runtime (17–19,
> done) · **v0.6** Store Search · **v0.7** Steam Native Install (21–26, never formally
> closed) · **v0.8** Tauri Shell (27–50, shipped 2026-10-16, override closeout).
> The earlier v0.5-vs-v0.7 taxonomy split is resolved: macOS-compat = v0.5 (complete),
> native-install = **v0.7**. `package.json` is 0.8.0.

> # ✅ PHASE 34.4.2 COMPLETE — 2026-08-19. BLOCKING LIVE GATE: **PASS 5/5**.
>
> `34.4.2-LIVE-GATE-RERUN-6.md` PASSED on real macOS hardware — the **first full PASS in this
> phase's history**, on the **ninth gate attempt across eight contracts**. Verdict history:
> **FAIL 0/6 → FAIL → FAIL 5/6 → FAIL 5/6 → FAIL 1/6 → FAIL 0/5 → PASS 5/5.**
>
> | Item | Result |
> |---|---|
> | 1 — sheet presentation + minimize/restore | PASS |
> | 2 — dismissability | PASS |
> | 3(a) — no injected affordance | PASS |
> | 4 — Cmd+V as sole credential route | PASS |
> | 6(a) — Humble disconnect route | PASS |
>
> **Item 6(a) was the only never-measured behaviour in the phase**, unreached across eight prior
> attempts. Its PASS live-discharges F-34.4.2-12's fix `6bad86227` and T-34.4.2-43, and meets
> F-34.4.2-10's taking-condition (storage-clear SUCCESS line fired, not the timeout).
>
> **What made it winnable was DELETING work, not doing more.** D-G4 retired REQ-34.4.2-05 and
> REQ-34.4.2-04's glyph half — a retirement ORDERED on 2026-08-05 when the mechanism was deleted,
> but never actioned, leaving both requirements awaiting a live discharge of code that did not
> exist. That dropped sub-checks 3(b)/3(c) as unfalsifiable; 3(c) alone had justified an entire app
> launch and had never run in eight attempts. D-G5 inherited item 6(b), retiring F-34.4.2-20.
> Five launches collapsed to one.
>
> **All 10/10 REQ-34.4.2 boxes ticked. `34.4.2-VERIFICATION.md` amended IN PLACE to
> `status: passed`** (10/11 truths verified, 1 uncertain by design, 0 failed) — never regenerated,
> because `7e1781fbb` had hand-corrected it.
>
> **Two NEW findings the run produced:** F-34.4.2-25 — a required literal can go stale by
> **BEHAVIOUR**, not just line number (verifying it EXISTS ≠ verifying it FIRES on the route the
> item drives); F-34.4.2-26 — Humble's login has an out-of-band 2FA email round-trip that nearly
> consumed `LOGIN_WATCH_TIMEOUT_MS`.
>
> **Next action:** Phase 34.4.2 needs nothing further. Outstanding elsewhere: the 34.13 UAT gate
> (paused at row 5 of 72, awaiting a USB drive for the multi-library fixture) and Phase 23.2 wave 4.

## Current Position

Phase: Milestone v0.8 complete — no active phase (next: `/gsd-new-milestone`)
Plan: 0 of 0
Status: Awaiting next milestone — v0.8 Tauri Shell shipped 2026-10-16 as an override closeout (see `## Deferred Items`); tag `v0.8` is local and unpushed
Last activity: 2026-10-16 — Completed quick task 261016-t3e: bottled-Steam install-directory process monitor (Playnite pattern) gives Play real `playing`/`done` feedback; fixture-verified only, live CrossOver gate owed (commits 87c3d4fda, cf8d2e67c, 7d0bdc873). Previously: Milestone v0.8 completed and archived (safety commit 39e1d5273, REQUIREMENTS.md removed in 35ad4aa85)

Progress: [████████░░] 80%

History: the 2026-09-24 → 2026-10-16 "Previous activity" narrative that stood here until the close lives verbatim in STATE-HISTORY.md § Current Position narrative archive, 2026-09-24 → 2026-10-16; the pre-2026-09-24 narrative in § Current Position archive.

## Native-Install Arc Phase Map (21–25)

| Phase | Name | Plans | Summaries | Status |
|-------|------|-------|-----------|--------|
| 21 | Steam Native Install (depot download) | 17 | 17 | ✅ Complete (2026-07-20) — code-review clean, secure-phase 41/41 threats_open:0; hardware UAT (7 native-install items) DEFERRED to Windows post-production + D-UAT-10 bottled-launch deferred as tracked macOS debt |
| 22 | Steam Game Families (multiple bottle configs) | 8 | 0 | ⛔ **PARKED 2026-07-21 — superseded by Phase 24.** Bridge's one shared bottle (D-03) eliminates the per-family bottle matrix; plans retained unexecuted (`22-multiple-steam-bottles/PARKED.md`) |
| 23 | Steam full-ownership install (StateFlags=4) | 10 | 10 | ✅ Complete 2026-08-19 — 10/10 plans; all three D-07 hardware gates PASS on real macOS; G-23-01 closed by Phase 23.2, G-23-02 closed in Gate 2 attempt 3; REQ-23-07 satisfied. (Row rewritten 2026-10-16: it still read "In progress, Gate 3 pending" from 2026-07-21.) |
| 24 | macOS native Steam bridge (steam_api proxy) | 17 | 17 | ✅ Complete 2026-07-21 — Gates 0/1/2/3 PASS on real hardware; gap cycles 24-11..24-17 closed shim-overwrite/install-poll + CrossOver-launch/library-sync clusters; secure-phase done (threats_open:0). Gate 4 (Hoard) out of scope — bridge proxies only ISteamUser + ISteamFriends. Gate 3 = **Avernum 6** (RETEST RUN 3, 19:02 rebuild w/ 24-17); `24-UAT.md` `status: complete`, `pending_gates: 0`. Deferred (not open): **D-UAT-24-09** full Hoard support needs 6 more interface proxies (follow-on phase; Hoard delisted `30cdda6a`); **WR-01** helper concurrency skipped at review-fix (`24-REVIEW-FIX.md` partial — single-threaded helper serializes a 2nd concurrent bridge game); **D-UAT-24-08** helper-reuse-on-bind never built (teardown wired at `main.ts:716-722`; no 127.0.0.1:54550 reuse path in `helperProcess.ts`), never dispositioned in `24-UAT.md` |
| 25 | Steam depot multi-host fan-out (throughput) | 3 | 3 | ✅ Complete + HW-verified 2026-07-19 (hosts=3, ~10 MiB/s vs 1.5–2.9 baseline) |

## Earlier macOS-Compat Phase Map (17–19)

| Phase | Name | Status |
|-------|------|--------|
| 17 | Steam on macOS via CrossOver/Wine | Complete & secured (2026-07-13) — 17 plans, UAT 7/7, VERIFICATION 6/6, code-review CR-01/WR resolved (17-17), SECURITY threats_open:0 (21/21) |
| 18 | macOS 32-bit detection, badge & CrossOver routing | Complete (UAT 5/5, secured) |
| 19 | CrossOver Compatibility Index (macOS) | Complete (2026-07-14) — 8/8 plans executed, index Action live on public fork; WR-05 live check still open |

## v0.2 Phase Map

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 5 | Branding & About Polish | BRAND-02, BRAND-03, BRAND-04, APP-01 | Complete (2026-07-02) |
| 6 | Library & Game Status UX | LIB-05, LIB-06, GAME-05 | Complete (2026-07-03) |
| 7 | Game Details Enrichment | DETAIL-01, DETAIL-02 | Executed (UAT pending) |
| 8 | New Steam Surfaces | STORE-01, CONSOLE-01 | Not started |
| 9 | Quality Gate | QA-01 | Not started |

## v0.3 Phase Map

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 10 | Humble Auth + Adapter Scaffold | HACCT-01, HACCT-02, HACCT-03 | Not started |
| 11 | Library Sync + 5-State Key Model | HSYNC-01, HSYNC-02, HSYNC-03, HSYNC-04 | Not started |
| 12 | Ownership Dedup | HDEDUP-01, HDEDUP-02 | Not started |
| 13 | Keys-Waiting + Giftable-Spares Views | HVIEW-01, HVIEW-02 | Not started |
| 14 | Guided Claim Flow | HCLAIM-01, HCLAIM-02, HCLAIM-03, HCLAIM-04, HCLAIM-05 | Not started |
| 15 | Store Overlay + Expiration Alerts | HSTORE-01, HSTORE-03 | Not started |

## Performance Metrics

**Velocity (v0.1):**

- Total plans completed: 268 (phases 1-4)
- Average duration: ~5-15 min/plan
- Total execution time: ~5 days (2026-06-24 → 2026-06-29)

**By Phase (v0.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | - | - |
| 02 | 6 | - | - |
| 03 | 4 | - | - |
| 04 | 2 | - | - |
| 05 | 4 | - | - |
| 06 | 2 | - | - |
| 08.1 | 4 | - | - |
| 10 | 6 | - | - |
| 11 | 5 | - | - |
| 12 | 5 | - | - |
| 14 | 6 | - | - |
| 15 | 6 | - | - |
| 16 | 3 | - | - |
| 18 | 6 | - | - |
| 17 | 17 | - | - |
| 19 | 8 | - | - |
| 20 | 7 | - | - |
| 21 | 17 | - | - |
| 26 | 5 | - | - |
| 24 | 16 | - | - |
| 29 | 7 | - | - |
| 31 | 4 | - | - |
| 32 | 3 | - | - |
| 34.2 | 30 | - | - |
| 34.3 | 9 | - | - |
| 34.4 | 10 | - | - |
| 34.10 | 27 | - | - |
| 34.11 | 9 | - | - |
| 41 | 7 | - | - |
| 48 | 18 | - | - |
| 49 | 12 | - | - |

**v0.1 Detail Log:**

| Phase 01 P03 | 8min | 3 tasks | 8 files |
| Phase 02-steam-library P01 | 4min | 3 tasks | 5 files |
| Phase 02-steam-library P02 | 15min | 2 tasks | 3 files |
| Phase 02-steam-library P03 | 5min | 2 tasks | 3 files |
| Phase 02-steam-library P04 | 2min | 2 tasks | 4 files |
| Phase 02-steam-library P05 | 5min | 3 tasks | 9 files |

**v0.2 Trend:**

- Plans completed: 1
- Trend: —

**v0.2 Detail Log:**

| Phase 07 P01 | — | 4 tasks | 21 files (3 new components) |

*Updated after each plan completion*
| Phase 08-new-steam-surfaces P01 | 5min | 2 tasks | 3 files |
| Phase 08-new-steam-surfaces P02 | 5min | 3 tasks | 4 files |
| Phase 10 P06 | ~55min | 2 tasks | 5 files |
| Phase 14 P06 | 30min | 2 tasks | 2 files |
| Phase 14 P07 | 35min | 3 tasks | 12 files |
| Phase 14 P08 | ~30min | 2 tasks | 6 files |
| Phase 19 P05 | 35min | 3 tasks | 6 files |
| Phase 19 P06 | ~30min | 2 tasks | 11 files |
| Phase 19 P07 | 15min | 3 tasks | 5 files |
| Phase 19 P08 | 20min | 2 tasks | 6 files |
| Phase 20 P01 | 10min | 2 tasks | 4 files |
| Phase 20 P02 | 10min | 2 tasks | 4 files |
| Phase 20 P03 | 15min | 1 tasks | 2 files |
| Phase 20 P04 | 15min | 2 tasks | 6 files |
| Phase 20 P05 | 15min | 2 tasks | 6 files |
| Phase 20 P06 | 45min | 2 tasks | 9 files |
| Phase 20 P07 | 20min | 2 tasks | 4 files |
| Phase 21 P01 | 35min | 3 tasks | 5 files |
| Phase 21 P02 | 40min | 1 tasks | 2 files |
| Phase 21 P03 | 20min | 2 tasks | 8 files |
| Phase 21 P04 | 20min | 2 tasks | 3 files |
| Phase 21 P05 | ~30min | 2 tasks | 2 files |
| Phase 21 P06 | 45min | 2 tasks | 4 files |
| Phase 21 P07 | 40min | 2 tasks | 4 files |
| Phase 21 P08 | ~30min | 2 tasks | 2 files |
| Phase 21 P09 | ~50min | 2 tasks | 9 files |
| Phase 21 P11 | 25min | 1 tasks | 2 files |
| Phase 21 P10 | 55min | 2 tasks | 12 files |
| Phase 21 P12 | ~15min | 1 task (UAT prep; 3 human-verify deferred) | 1 file |
| Phase 21 P13 | 20min | 2 tasks | 2 files |
| Phase 21 P14 | 20min | 2 tasks | 4 files |
| Phase 21 P15 | 45min | 3 tasks | 8 files |
| Phase 21 P16 | 30min | 3 tasks | 9 files |
| Phase 23 P01 | 10min | 2 tasks | 4 files |
| Phase 23 P02 | 15min | 3 tasks | 5 files |
| Phase 23 P03 | ~40min | 3 tasks | 6 files |
| Phase 25 P01 | 12min | 2 tasks | 2 files |
| Phase 25 P02 | ~20min | 3 tasks | 4 files |
| Phase 21 P17 | 30min | 2 tasks | 10 files |
| Phase 26 P01 | 15min | 2 tasks | 3 files |
| Phase 26 P02 | 8min | 1 tasks | 2 files |
| Phase 26 P03 | 8min | 1 tasks | 3 files |
| Phase 26 P04 | 25min | 2 tasks | 7 files |
| Phase 26 P05 | ~10min | 2 tasks | 2 files |
| Phase 24 P01 | 25min | 3 tasks | 10 files |
| Phase 24 P02 | 20min | 2 tasks | 3 files |
| Phase 24 P03 | 10min | 1 tasks | 3 files |
| Phase 24 P04 | 20min | 1 tasks | 2 files |
| Phase 24 P05 | ~20min | 2 tasks | 5 files |
| Phase 24 P06 | 35min | 3 tasks | 5 files |
| Phase 24 P07 | 35min | 2 tasks | 7 files |
| Phase 24 P08 | 45min | 3 tasks | 4 files |
| Phase 24 P09 | 40min | 2 tasks | 8 files |
| Phase 27 P01 | 9min | 3 tasks | 16 files |
| Phase 27 P02 | 50min | 3 tasks | 21 files |
| Phase 27 P03 | 30min | 3 tasks | 10 files |
| Phase 27 P04 | ~75min | 2 tasks | 5 files |
| Phase 24 P11 | 10min | 1 tasks | 2 files |
| Phase 24 P12 | 20min | 1 tasks | 2 files |
| Phase 24 P13 | ~25min | 2 tasks | 2 files |
| Phase 24 P14 | 15min | 1 tasks | 1 files |
| Phase 24 P15 | 12min | 1 tasks | 2 files |
| Phase 24 P16 | 25min | 2 tasks | 4 files |
| Phase 24 P17 | 20min | 2 tasks | 2 files |
| Phase 28 P01 | 35min | 3 tasks | 3 files |
| Phase 28 P02 | 30min | - tasks | - files |
| Phase 28 P03 | 40min | 3 tasks | 4 files |
| Phase 28 P04 | 45min | 3 tasks | 4 files |
| Phase 28 P05 | 35min | 1 tasks | 1 files |
| Phase 28 P06 | 45min | 2 tasks | 3 files |
| Phase 29 P01 | 8min | 2 tasks | 2 files |
| Phase 29 P02 | 15min | 2 tasks | 9 files |
| Phase 29 P03 | ~20min | 3 tasks | 5 files |
| Phase 29 P04 | 35min | 3 tasks | 3 files |
| Phase 29 P05 | 40min | 3 tasks | 3 files |
| Phase 29 P06 | ~30min | 3 tasks | 3 files |
| Phase 29 P07 | ~45min | 3 tasks | 1 files |
| Phase 30 P01 | 20min | 2 tasks | 4 files |
| Phase 30 P03 | 9min | 3 tasks | 8 files |
| Phase 30 P02 | 19min | 3 tasks | 5 files |
| Phase 30 P04 | ~25min (+ multi-hour checkpoint pause) | 3 tasks | 4 files |
| Phase 30 P05 | 10min | 2 tasks | 2 files |
| Phase 30 P06 | 20min | 3 tasks | 7 files |
| Phase 30 P07 | 25min | 2 tasks | 8 files |
| Phase 31 P01 | 45min | 3 tasks | 4 files |
| Phase 31 P04 | 20min | 3 tasks | 7 files |
| Phase 32 P01 | 30min | 2 tasks | 5 files |
| Phase 32 P02 | ~30min | 2 tasks | 3 files |
| Phase 32 P03 | ~15min | 2 tasks | 3 files |
| Phase 33 P01 | ~20min | 3 tasks | 2 files |
| Phase 33 P02 | ~25min | 2 tasks | 3 files |
| Phase 33 P03 | 15min | 3 tasks | 5 files |
| Phase 33 P04 | ~40min | 3 tasks | 8 files |
| Phase 33 P06 | ~15min | 2 tasks | 2 files |
| Phase 34 P01 | 17min | 2 tasks | 4 files |
| Phase 34 P02 | ~50min | 2 tasks | 9 files |
| Phase 34 P05 | 10min | 2 tasks | 3 files |
| Phase 34 P06 | ~15min | 1 tasks | 1 files |
| Phase 34 P08 | 15min | 3 tasks | 2 files |
| Phase 34 P09 | 8min | 2 tasks | 3 files |
| Phase 34 P10 | 25min | 3 tasks | 2 files |
| Phase 34 P14 | 20min | 2 tasks | 3 files |
| Phase 34.1 P05 | 45min | 3 tasks | 4 files |
| Phase 34.1 P06 | 45min | 3 tasks | 7 files |
| Phase 34.1 P07 | 45min | 3 tasks | 7 files |
| Phase 34.1 P08 | 50min | 3 tasks | 4 files |
| Phase 34.2 P01 | ~75min | 3 tasks | 2 files |
| Phase 34.2 P04 | 50min | 3 tasks | 5 files |
| Phase 34.2 P05 | 25min | 2 tasks | 2 files |
| Phase 34.2 P06 | 35min | 3 tasks | 5 files |
| Phase 34.2 P07 | ~9min | 3 tasks | 5 files |
| Phase 34.2 P08 | 12min | 2 tasks | 3 files |
| Phase 34.2 P09 | 25min | 3 tasks | 7 files |
| Phase 34.2 P10 | 25min | 2 tasks | 2 files |
| Phase 34.2 P11 | 35min | 2 tasks | 4 files |
| Phase 34.2 P12 | 25min | 2 tasks | 2 files |
| Phase 34.2 P13 | 20min | 2 tasks | 4 files |
| Phase 34.2 P14 | 40min | 2 tasks | 1 files |
| Phase 34.2 P15 | 25m | 2 tasks | 2 files |
| Phase 34.2 P16 | 45min | 3 tasks | 6 files |
| Phase 34.2 P17 | ~35min | 2 tasks | 4 files |
| Phase 34.2 P18 | 30min | 3 tasks | 6 files |
| Phase 34.2 P19 | 100min | 3 tasks | 6 files |
| Phase 34.2 P20 | 8min | 2 tasks | 2 files |
| Phase 34.2 P21 | 15min | 2 tasks | 2 files |
| Phase 34.2 P22 | 10min | 2 tasks | 2 files |
| Phase 34.2 P23 | 50min | 2 tasks | 1 files |
| Phase 34.2 P24 | 55min | 3 tasks | 4 files |
| Phase 34.2 P25 | 90m | 3 tasks | 2 files |
| Phase 34.2 P26 | 45min | 3 tasks | 4 files |
| Phase 34.2 P27 | 15min | 2 tasks | 2 files |
| Phase 34.3 P01 | 55min | 3 tasks | 8 files |
| Phase 34.3 P03 | 45min | 3 tasks | 5 files |
| Phase 34.3 P04 | 40min | 3 tasks | 5 files |
| Phase 34.3 P02 | 90min | 2 tasks | 2 files |
| Phase 34.3 P05 | ~50min | 3 tasks | 3 files |
| Phase 34.3 P06 | 35min | 2 tasks | 4 files |
| Phase 34.3 P07 | ~50min | 3 tasks | 2 files |
| Phase 34.3 P08 | 70min | 3 tasks | 5 files |
| Phase 34.4.1 P01 | 45m | 3 tasks | 3 files |
| Phase 34.4.1 P02 | 42min | 4 tasks | 3 files |
| Phase 34.4.1 P03 | 21min | 2 tasks | 2 files |
| Phase 34.4.1 P04 | 40min | 2 tasks | 10 files |
| Phase 34.4.1 P05 | 35min | 3 tasks | 7 files |
| Phase 34.4.1 P09 | 70min | 3 tasks | 13 files |
| Phase 34.4.1 P06 | 70min | 3 tasks | 4 files |
| Phase 34.4.1 P07 | 110min | 3 tasks | 3 files |
| Phase 34.5 P01 | 30min | 3 tasks | 3 files |
| Phase 34.5 P02 | 25min | 2 tasks | 2 files |
| Phase 34.5 P03 | 15min | 3 tasks | 3 files |
| Phase 34.5 P04 | 35min | 2 tasks | 8 files |
| Phase 34.5 P05 | 55min | 3 tasks | 3 files |
| Phase 34.5 P06 | 65min | 3 tasks | 7 files |
| Phase 34.5 P07 | 20min | 2 tasks | 8 files |
| Phase 34.5 P08 | 55min | 3 tasks | 5 files |
| Phase 34.5 P09 | ~55min | 3 tasks | 2 files |
| Phase 34.5 P10 | 35min | 2 tasks | 2 files |
| Phase 34.5 P11 | 45min | 2 tasks | 3 files |
| Phase 34.5 P12 | 45min | 3 tasks | 2 files |
| Phase 34.5 P13 | 55min | 3 tasks | 2 files |
| Phase 34.5 P14 | 13min | 2 tasks | 2 files |
| Phase 34.4.1 P10 | 65min | 2 tasks | 4 files |
| Phase 34.4.1 P11 | 35min | 2 tasks | 4 files |
| Phase 34.4.1 P12 | ~20min | 2 tasks | 8 files |
| Phase 34.4.1 P13 | 40min | 2 tasks | 6 files |
| Phase 34.4.1 P14 | 20min | 2 tasks | 2 files |
| Phase 34.4.1 P15 | 55min | 2 tasks | 10 files |
| Phase 34.4.1 P16 | 50min | 3 tasks | 5 files |
| Phase 34.4.1 P17 | 45min | 2 tasks | 4 files |
| Phase 34.4.1 P18 | 30min | 4 tasks | 8 files |
| Phase 34.4.1 P19 | 55min | 2 tasks | 3 files |
| Phase 34.4.1 P21 | 75min | 3 tasks | 7 files |
| Phase 34.4.1 P22 | 30min | 3 tasks | 11 files |
| Phase 34.4.1 P23 | 50min | 3 tasks | 6 files |
| Phase 34.4.1 P24 | 40min | 3 tasks | 2 files |
| Phase 34.4.1 P26 | 55min | 2 tasks | 8 files |
| Phase 34.4.1 P27 | ~50min | 3 tasks | 9 files |
| Phase 34.5 P16 | 45min | 3 tasks | 5 files |
| Phase 34.5 P17 | 40min | 2 tasks | 3 files |
| Phase 34.5 P18 | 55min | 2 tasks | 2 files |
| Phase 34.5 P19 | 35min | 2 tasks | 1 files |
| Phase 34.5 P20 | 55min | 3 tasks | 1 files |
| Phase 34.5 P22 | 50min | 3 tasks | 1 files |
| Phase 34.5 P23 | 55min | 3 tasks | 4 files |
| Phase 34.5 P25 | 35min | 2 tasks | 4 files |
| Phase 34.5 P26 | 50min | 3 tasks | 6 files |
| Phase 34.5 P27 | 45min | 2 tasks | 2 files |
| Phase 34.5 P28 | 25min | 4 tasks | 1 files |
| Phase 34.5 P32 | 25m | 2 tasks | 2 files |
| Phase 34.5 P33 | 50min | 2 tasks | 5 files |
| Phase 34.5 P34 | 35min | 2 tasks | 3 files |
| Phase 34.5 P35 | 55min | 2 tasks | 5 files |
| Phase 34.5 P36 | 45min | 3 tasks | 6 files |
| Phase 34.4.2 P01 | 25min | 3 tasks | 3 files |
| Phase 34.4.2 P02 | 55min | 3 tasks | 2 files |
| Phase 34.4.2 P03 | 30min | 3 tasks | 2 files |
| Phase 34.4.2 P04 | 60min | 3 tasks | 4 files |
| Phase 34.4.2 P05 | 23min | 3 tasks | 4 files |
| Phase 34.4.2 P06 | ~25min | 3 tasks (Task 2 human checkpoint) | 5 files |
| Phase 34.4.2 P07 | 50min | 3 tasks | 3 files |
| Phase 34.4.2 P08 | 35min | 3 tasks | 3 files |
| Phase 34.4.2 P09 | 40min | 3 tasks | 4 files |
| Phase 34.4.2 P10 | ~70min | 3 tasks (Task 2 human checkpoint) | 5 files (`34.4.2-LIVE-GATE-RERUN.md`, `34.4.2-PLATFORM-SCOPE.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`) |
| Phase 34.4.2 P11 | 120min | 3 tasks | 5 files |
| Phase 34.4.2 P12 | ~180min | 3 tasks (Task 2 blocking live gate, multiple in-run checkpoints) | 6 files (`34.4.2-LIVE-GATE-RERUN-2.md`, `34.4.2-PLATFORM-SCOPE.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `34.4.2-12-SUMMARY.md`) |
| Phase 34.4.2 P13 | 55min | 3 tasks | 7 files |
| Phase 34.4.2 P14 | 50min | 2 tasks | 4 files |
| Phase 34.4.2 P15 | 12min | 3 tasks | 4 files |
| Phase 34.4.2 P16 | ~40min | 3 tasks (Task 2 blocking live gate, human-driven) | 6 files (`34.4.2-LIVE-GATE-RERUN-3.md`, `34.4.2-PLATFORM-SCOPE.md`, `deferred-items.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`) |
| Phase 34.4.2 P19 | 1h | 3 tasks | 3 files |
| Phase 34.4.2 P21 | 20min | 2 tasks | 1 files |
| Phase 34.4.2 P22 | 15min | 2 tasks | 1 files |
| Phase 34.4.2 P23 | 70min | 3 tasks | 4 files |
| Phase 34.8 P01 | 4min | 2 tasks | 4 files |
| Phase 34.8 P02 | 25min | 2 tasks | 4 files |
| Phase 34.8 P03 | 15min | 2 tasks | 2 files |
| Phase 34.8 P04 | 35min | 2 tasks | 2 files |
| Phase 34.8 P05 | 25min | 3 tasks | 3 files |
| Phase 34.8 P06 | ~50min | 3 tasks | 4 files |
| Phase 34.8 P08b | 50min | 3 tasks | 17 files |
| Phase 34.8 P08c | 30min | 2 tasks | 4 files |
| Phase 34.8 P12 | ~75min | 3 tasks (Task 3 blocking human checkpoint) | 8 files |
| Phase 34.10 P01 | 20min | 2 tasks | 5 files |
| Phase 34.10 P02 | 35min | 2 tasks | 5 files |
| Phase 34.10 P03 | 40min | 2 tasks | 3 files |
| Phase 34.10 P04 | 55min | 2 tasks | 3 files |
| Phase 34.10 P05 | 35min | 2 tasks | 5 files |
| Phase 34.10 P06 | 25min | 2 tasks | 5 files |
| Phase 34.10 P07 | ~50min | 2 tasks | 4 files |
| Phase 34.10 P08 | 25min | 3 tasks | 4 files |
| Phase 34.10 P09 | 35min | 3 tasks | 15 files |
| Phase 34.10 P10 | 25min | 2 tasks | 2 files |
| Phase 34.10 P11 | 66min | 2 tasks | 2 files |
| Phase 34.10 P13 | 24min | 3 tasks | 8 files |
| Phase 34.10 P14 | ~15min | 2 tasks | 2 files |
| Phase 34.10 P15 | ~35min | 2 tasks | 2 files |
| Phase 34.10 P16 | ~1h10min | 2 tasks | 3 files |
| Phase 34.10 P17 | 70min | 3 tasks | 2 files |
| Phase 34.10 P18 | ~40min | 3 tasks + 1 correction | 6 files |
| Phase 34.10 P19 | 25min | 2 tasks | 2 files |
| Phase 34.10 P21 | ~35min | 3 tasks | 1 files |
| Phase 34.10 P23 | 24min | 2 tasks | 3 files |
| Phase 34.10 P24 | 18min | 2 tasks | 2 files |
| Phase 34.10 P25 | 95min | 2 tasks | 1 files |
| Phase 34.10 P26 | ~140min | 2 tasks | 2 files |
| Phase 34.11 P01 | 20min | 3 tasks | 3 files |
| Phase 34.11 P02 | 15min | 2 tasks | 2 files |
| Phase 34.11 P03 | 35min | 3 tasks | 3 files |
| Phase 34.11 P04 | 20min | 3 tasks | 4 files |
| Phase 34.11 P05 | 20min | 3 tasks | 2 files |
| Phase 34.11 P06 | 45min | 3 tasks | 8 files |
| Phase 34.11 P07 | 55min | 3 tasks | 12 files |
| Phase 34.11 P08 | 18min | 3 tasks | 9 files |
| Phase 34.11 P09 | checkpoint-spanning | 3 tasks | 11 files |
| Phase 34.9 P04 | 25min | 2 tasks | 3 files |
| Phase 34.9 P06 | ~55min | 3 tasks | 4 files |
| Phase 34.9 P07 | 45min | 3 tasks | 4 files |
| Phase 34.9 P08 | 50min | 2 tasks | 3 files |
| Phase 34.9 P09 | 70min | 2 tasks | 2 files |
| Phase 34.9 P10 | 90min | 2 tasks | 1 files |
| Phase 34.5 P43 | 55min | 3 tasks | 10 files |
| Phase 34.5 P46 | 1h34m | 3 tasks | 5 files |
| Phase 34.5 P47 | 21min | 3 tasks | 15 files |
| Phase 34.5 P48 | 35min | 3 tasks | 6 files |
| Phase 34.5 P49 | 70min | 3 tasks | 4 files |
| Phase 34.5 P50 | 2h40m | 3 tasks | 4 files |
| Phase 34.9 P18 | 25min | 3 tasks | 2 files |
| Phase 34.9 P19 | 25min | 2 tasks | 4 files |
| Phase 34.9 P20 | 55min | 3 tasks | 3 files |
| Phase 34.9 P21 | 73min | 3 tasks | 3 files |
| Phase 34.9 P23 | 45min | 2 tasks | 1 files |
| Phase 34.9 P25 | 26min | 2 tasks | 13 files |
| Phase 34.9 P26 | 75min | 3 tasks | 2 files |
| Phase 34.9 P27 | 20min | 3 tasks | 2 files |
| Phase 46 P01 | 6min | 2 tasks | 2 files |
| Phase 46 P02 | 45min | 2 tasks | 3 files |
| Phase 46 P03 | 25min | 2 tasks | 3 files |
| Phase 46 P04 | 11min | 2 tasks | 4 files |
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 260929-qth P01 | ~16min | 3 tasks | 5 files |
| Phase 48 P01 | 11min | 3 tasks | 97 files |
| Phase 48 P02 | 52min | 3 tasks | 21 files |
| Phase 48 P03 | 25 min | 2 tasks | 3 files |
| Phase 48 P04 | 72 min | 3 tasks | 8 files |
| Phase 48 P05 | 9 min | 3 tasks | 14 files |
| Phase 48 P06 | 5 min | 1 tasks | 7 files |
| Phase 48 P07 | 21 min | 3 tasks | 10 files |
| Phase 48 P08 | 2h 11m | 2 tasks | 1 files |
| Phase 48 P09 | 85min | 2 tasks | 5 files |
| Phase 48 P10 | 15 min | 2 tasks | 4 files |
| Phase 48 P11 | 8 min | 3 tasks | 7 files |
| Phase 48 P12 | 12 min | 3 tasks | 6 files |
| Phase 49 P01 | 20 min | 3 tasks | 17 files |
| Phase 49 P02 | 25 min | 3 tasks | 97 files |
| Phase 48 P14 | 70min | 2 tasks | 10 files |
| Phase 48 P15 | 4h | 3 tasks | 1 files |
| Phase 48 P16 | 75min | 3 tasks | 16 files |
| Phase 48 P17 | ~45min | 3 tasks | 12 files |
| Phase 48 P18 | 2h | 3 tasks | 1 files |
| Phase 49 P03 | 25 min | 3 tasks | 12 files |
| Phase 49 P04 | 14 min | 3 tasks | 10 files |
| Phase 49 P05 | 13 min | 2 tasks | 12 files |
| Phase 49 P06 | 12 min | 2 tasks | 15 files |
| Phase 49 P07 | 9 min | 3 tasks | 11 files |
| Phase 49 P08 | 7 min | 3 tasks | 12 files |
| Phase 49 P09 | 30 min | 3 tasks | 10 files |
| Phase 49 P10 | 45min | 2 tasks | 13 files |
| Phase 49 P11 | 45 min | 2 tasks | 3 files |
| Phase 45 P01 | 57min | 3 tasks | 21 files |
| Phase 45 P03 | 15min | 2 tasks | 3 files |
| Phase 45 P04 | ~50min | 2 tasks | 5 files |
| Phase 45 P02 | 95min | 3 tasks | 32 files |
| Phase 45 P09 | 95min | 3 tasks | 72 files |
| Phase 45 P10 | 9 min | 3 tasks | 72 files |
| Phase 45 P05 | 35 min | 2 tasks | 5 files |
| Phase 45 P06 | 13 min | 3 tasks | 9 files |
| Phase 45 P07 | 38 min | 3 tasks | 21 files |
| Phase 45 P08 | 30 min | 3 tasks | 20 files |
| Phase 45 P11 | 26 min | 3 tasks | 106 files |
| Phase quick-261015-7tt P01 | 2h40min | 3 tasks | 5 files |
| Phase quick-261015-pwy P01 | 22min | 3 tasks | 7 files |
| Phase quick-261015-rud P01 | - | 3 tasks | 7 files |

## Accumulated Context

### Roadmap Evolution

Entries for phases before 44 live in STATE-HISTORY.md § Roadmap Evolution archive (2026-10-15).

- Phase 44 closed 2026-10-11: **superseded by Phase 45** (hand edit, D-22). This is the closure record; the 2026-09-18 bullet below is the roadmap edit that marked the heading. What stands: waves 1-5, plans 44-01..44-07 shipped, the D-22 gate itself passed on its fourth attempt, and eight of nine contrast defects were fixed and verified across a light AND a dark arm. Abandoned with the screen, by name: contrast defect 9 (Install button `:hover` at 3.50:1 in nord-light, no token resolves it), the D-24 `Needs GUI` / `Errored` / `Installing-elsewhere` cells (never reached), and D-23 (never covered). Phase 44 is NOT recorded as verified or passed, and plan 44-08 is not completed; `44-LIVE-GATE.md` is `status: superseded` and both it and `44-VALIDATION.md` carry a dated closure section. Live verification of the replacement surface is plan 45-12.
- Phase 48 added 2026-10-03: **Library rows — user-composed filter rows in the tiles panel.** The shelf model from Steam, Netflix and Apple TV: each row is a saved filter rendered as a horizontal strip with a small header, composed from a `ROWS` section in the Games tier-2 panel with a `+`. **This is a generalisation of shipped code, not a greenfield feature** — `libraryTopSection` (`Settings/components/LibraryTopSection.tsx:30-46`) is already a four-option dropdown (`recently_played`, `recently_played_installed`, `favourites`, `disabled`) rendering ONE lane via `RecentlyPlayed/index.tsx`, and the lane concept is already load-bearing: `GamesList` takes `isFirstLane`/`isRecent`/`isFavourite`, there is a `firstLane` CSS class, and `filterEngine.ts` exports `passesHiddenLaneFilter`. Those four values are the migration seed. **`Depends on` was hand-corrected at filing time, the same positional-guess trap Phase 47 above records:** `phase.add` wrote Phase 47 (the IsThereAnyDeal migration, unrelated); the real dependency is **Phase 34.11**, whose filter engine each row is defined over. `**Goal:** [To be planned]` was hand-written too, and the title was shortened from 84 chars after `phase.add` warned it had written a goal-shaped description verbatim as the header. **SUPERSEDES ONLY HALF of the `library-sorting-is-title-only` todo, and the half it supersedes is the easy one.** It kills the sort-field-menu UI — a `Recently Added` row beats a global sort for the common case — but NOT that todo's actual blocker, which is why it is `ready: human`: the open question is cross-store data coverage, not the control. Rows inherit that hole unchanged and arguably worsen it: acquisition date does not exist for Epic, Amazon or sideloaded, is license-grant-not-purchase for Steam, and is clean only for GOG (already fetched and discarded). A sort can put unknowns last where they are visible; a row silently omits three stores with nothing on screen saying it is incomplete. **Rewrite that todo down to the data-coverage decision, do not close it** — its measured per-store inventory (2026-10-03) is the expensive part and this phase needs it verbatim. **Three open scope questions must be settled in `/gsd-spec-phase 48` before planning, and question 1 is load-bearing:** (1) is Rows a FIFTH VIEW that swaps the grid for shelves, or does it REPLACE the grid with Views filtering within every row — this decides whether sketch 005 variant D ships as drawn, because under the second model Views stops meaning `which slice am I looking at` and D's you-are-here premise weakens; (2) row cap and duplicate policy, since Steam/Netflix rows are platform-curated and user-composed rows over a 400-game library can put one game in six rows with nothing above the fold; (3) each row needs an internal order, and `Recently Added` is a row WHOSE DEFINITION IS A SORT — which is how the data-coverage problem walks back in through the side door. **Sketch 005 variant D is deliberately HELD, not discarded,** pending question 1; the sketch is committed (`4f8dac642`) and costs nothing to park, whereas building it twice is the expensive outcome. Applied by hand: the add-phase workflow's `update_project_state` step is a hand-write by design, and `state.*` is banned here for corrupting this file.
- Phase 47 added 2026-09-24: **Migrate aggregated store search from CheapShark to IsThereAnyDeal — Stage 1 of the store-price direction.** Retires the D-13 USD-only debt on `/store-search`, which is the live inconsistency `questions.md` Q2 was raised for: a UK user sees dollars on the price-checker while the Deals tab shows them pounds correctly. Research is **already complete** (quick `260916-gdg`, which marked Q2 ANSWERED) and its claims are graded MEASURED / SPEC / UNKNOWN — preserve the grades when quoting it; the single remaining UNKNOWN is the covered country/currency list, because a 14-country sweep of `/service/shops/v1` returned an identical 34-shop list every time, disproving that endpoint as a coverage measure. **Two `Depends on` corrections were applied by hand at filing time:** `phase.add` writes the immediately-preceding phase number as a positional guess, so the stub claimed Phase 46 (Windows single-instance guard, unrelated); the real dependency is **Phase 20**, which minted the provider-neutral `common/types/storeSearch` vocabulary this phase is the second implementation of — and the migration turns out to *validate* that speculative D-11/D-12/D-13 bet rather than strain it. Also hand-corrected `**Goal:** [To be planned]`. **The phase carries three human gates and one is IN FLIGHT:** the email to `api@isthereanydeal.com` was SENT 2026-09-24 and returned an out-of-office. Its answer to "does the rate limit follow the key or the authenticated account" **determines what this phase builds** — 1000 req/5min is per-key and a desktop app ships one key in the binary, so the budget is shared across every install; if OAuth moves it to the user's own ITAD account the phase builds an OAuth flow (gaining `hideOwned`/`wishlistOnly` for free), otherwise an embedded key plus hard caching and a raised-limit request. Those are different phases: **plan around the open question, do not guess it.** Scope is the price-checker ONLY — `/discounts` stays GOG-only and locale-correct, gated on the same email's answer about the "MUST NOT build a competition to IsThereAnyDeal" clause, and **Stage 2** (a GameLib-owned affiliate-feed/mirroring service) is explicitly out: it needs partner approvals requiring traffic this project does not have and a server it does not run. Operator decision 2026-09-24 accepts ITAD's Amazon coverage gap — Amazon is retained-because-built, not a first-class store. Applied by hand: the add-phase workflow's `update_project_state` step is a hand-write by design, and `state.*` is banned here for corrupting this file.
- Phase 44 edited 2026-09-18: **marked ⛔ SUPERSEDED BY PHASE 45**, with its now-doubly-stale `**Plans:**` status line corrected — it still read "EXECUTING, 2/8 (wave 1 COMPLETE 2026-09-16)" when 7 of 8 plans had in fact shipped. Superseded rather than completed: `44-08` (the D-22 live gate + D-24 theme spot-check) is **abandoned, not failed**, because Phase 45 replaces the entire screen it was gating. The entry records what stands — waves 1–5, plans 44-01..44-07, the D-22 gate itself PASSING on its fourth attempt with zero px reflow, and eight of nine contrast defects fixed and verified across a light AND a dark arm — and names what is being abandoned rather than dropping it quietly: contrast defect 9 is UNFIXED and shipped (install button `:hover` at 3.50:1 in nord light, no token resolves it), the D-24 `Needs GUI` / `Errored` / `Installing-elsewhere` cells were never reached, and D-23 was never covered. **Phase 44 must NOT be recorded as fully verified — it is superseded with known residue.** All artifacts retained, nothing deleted. Applied by hand: the edit-phase workflow prescribes `gsd-sdk query state.add-roadmap-evolution` at its `write_updated_phase` step, and `state.*` is banned here for corrupting this file.
- Phase 45 added 2026-09-17: **Native in-app Winetricks UI redesigned from scratch — one self-explanatory surface replacing BOTH the Phase 44 browse panel AND the `Open Winetricks GUI` escape hatch.** Added on the operator's verdict against a live packaged build ("this ux is rubbish"), which the evidence supports beyond colour: raw upstream labels pre-truncated by winetricks itself at 95 chars, 567 verbs behind five raw parser-string headers (D-09), a raw wine/curl stderr dump as the progress UI, and no guidance on what to install or why. **Process constraint recorded on the entry: this phase MUST run `/gsd-discuss-phase` BEFORE `/gsd-ui-phase`** — Phase 44's weak design traces to `44-UI-SPEC.md` being written with no CONTEXT.md, citing constraint IDs `C-1`..`C-6` that exist in no artifact on disk. Three findings were folded into its scope rather than filed as separate todos: winetricks stderr logged wholesale at `[ERROR]` and echoed to the UI (846 lines, 40% of one log, 125 `fixme:` + 178 curl progress bars); `['-q', '--gui']` making winetricks' own warnings self-dismiss in 5s via `zenity --timeout 5`; and the `needsGui` list matching no derivable signal (6 verbs call `w_download_manual`, not the 8 claimed). The upstream UI inventory is already done and lives on the roadmap entry. Only the intermittent blank-render finding was filed separately (app-wide, not Winetricks). Phase 44 remains open on 44-08 and should be closed as superseded by 45.

- Phase 44 added 2026-09-15: **In-app Winetricks browse UI replacing the search-only panel**. Motivated by operator feedback the same day: the winetricks zenity GUI's categorised checklist is markedly better than our own panel. The architectural call was to rebuild that shape IN-APP rather than lean harder on zenity -- zenity is already a declared-but-optional dependency the code warns about (`src/backend/tools/index.ts:779`, "zenity not installed! Winetricks might fail to install some packages or even open"), so adopting it as the primary UI would promote a soft dependency to a hard one and discard all ten app themes. Rendering work only: the data layer landed in `quick-260915-ajd` (`listAvailable()` now returns `{verb, title, category, cached}` across 567 verbs, up from 370 verb-only strings) and `quick-260915-ajd-fu` made the filter match title as well as verb. Cost of NOT using zenity, measured rather than assumed: only 8 verbs require manual download and cannot be installed unattended (`3dmark03`, `3dmark06`, `fontxplorer`, `foobar2000`, `stalker_pripyat_bench`, `ubisoftconnect`, `unigine_heaven`, `utorrent`) -- all benchmarks and apps, NOT ONE a DLL or font, so none of the `vcrun*`/`dotnet*`/`d3dx9*`/`corefonts` fixes anyone actually opens this panel for. Those 8 route to the retained zenity button. Scope fence carried from measured history: the list region must NOT unmount on install -- that remount is the cause of the dead-button defect fixed in 35-25 (`366e719bb`).
- Phase 46 added 2026-09-22: **Windows single-instance guard and gamelib:// deep-link registration**. Promoted from todo `2026-08-29-windows-single-instance-guard-and-deep-link-registration.md` now that the operator has a working Windows 11 build machine (Developer Mode on, pre-push hook green via quick 260922-ok3). It is the unblock for quick 260922-nx4, which suppressed install-time `gamelib://` registration on Windows because there was no guard. The installer-level evidence (0 vs 6 `Classes\gamelib` lines) is in that SUMMARY.

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:
Decisions for Phase 47 and earlier, pre-October quick tasks and untagged entries live in STATE-HISTORY.md § Decisions archive (2026-10-15).

- [Phase 261003-i4t]: Games panel: collapsed two icon rows into one six-icon row, swapped sort-by-status to an x-badge, made Add Game icon-only at the footer's left, localized the count pill ('N games'/'N of M games') across all 49 gamelib.json catalogues (D-01..D-06).
- [Phase 48]: Sourced de/zh_Hant/46-remaining-locale focus-row translations against each locale's existing in-repo vocabulary rather than inventing new terms
- [Phase 48]: Skipped pnpm machine-fill-gamelib (hard-codes api.anthropic.com, 401s deterministically here); authored all 46 remaining locales in-session instead
- [Phase 48]: Validated all 46 locale translations via validateTranslation() plus a sabotage control in a scratch jest run, deleted before commit
- [Phase 48]: R2 and R3 requirements left open — shared with sibling plans 48-02/48-03/48-04 not yet executed (requirements.ready-ids confirms blocked)
- [Phase 48]: focusRow is a new, additive GlobalConfig key (not a widened libraryTopSection), so plan 48-05's seed-once-guarded-by-key-presence is expressible
- [Phase 48]: Focus-row engine state sets showHidden: 'show' so passesHiddenLaneFilter is the sole hidden-games authority, never passesMore
- [Phase 48]: Focus-row state keeps showNonAvailable/noStorePage/showSupportOfflineOnly/showThirdPartyManagedOnly/showUpdatesOnly at engine defaults for R4 independence
- [Phase 48]: 48-03: per-row title carried by an inner span via NavItem labelElement, not a new NavItem prop (keeps change inside the plan's files); divider labels hoisted to consts that stay literal tGamelib call sites
- [Phase 48]: 48-04: focus-row overflow controls mount only when the track can scroll; the end-of-travel control is natively disabled at opacity 0.38; paging is by whole visible cards with sub-pixel residue (<1px) treated as no travel
- [Phase 48]: Task 1 ruling recency: recently_played_installed migrates to the recentlyPlayed view, recency kept and the installed-only qualifier dropped, because FocusRowSelection has no modifier slot and installed-only stays reachable through the grid Installed view
- [Phase 48]: Presence guard on the focusRow key, not its value, so a deliberate clear (a present null) permanently disarms the legacy seed; the seed reads the raw on-disk object as the last property of the getSettings merge
- [Phase 48]: No storage bound on games.recent (operator ruling on R6): setRecentGames unchanged; display cap is the focus-row card ceiling only — The removed setting never governed storage; the stored list was unbounded before and after
- [Phase 48]: 48-07: hydrate focusRow in the renderer from requestAppSettings and persist through setSetting (not backend mirror write); present focusRow key authoritative; view whitelist duplicated in common, pinned by satisfies Record<LibraryView,true>
- [Phase 48]: Plan 48-08: chevron contrast is under 3:1 in 9 of 10 themes and a hovered card paints over the control; divider labels miss 4.5:1 in dracula and nord-light - three gaps filed in 48-UAT.md
- [Phase 48]: Plan 48-08: every pixel measurement on this display must convert the screencapture from Display P3 to sRGB first
- [Phase 48]: 48-09: GameCard controller mode has no geometry override and hover wears the console ring globally; stale-focus suppression scoped to .listing:hover (common ancestor of strip and grid), not a single .gameList
- [Phase 48]: [48-10] Chevron stacking fixed by isolation: isolate on .focusRowTrack, not a larger control z-index (card-internal z-indexes up to 5 escape a resting card)
- [Phase 48]: [48-10] Strip-end clearance is 12px list padding-inline with width: max-content plus a matching -12px viewport margin-inline; scroll-into-view reads the computed padding and falls back to zero clearance
- [Phase 48]: 48-11: chevron disc is opaque var(--body-background) (deliberate deviation from UI-SPEC's translucent scrim); divider fixed by a per-theme dracula/nord-light override, not a global change
- [Phase 48]: 48-12: strip card width is derived from the grid's auto-fill/minmax arithmetic over the strip content box (not read from the rendered grid) and written as --focus-row-card-width; amends D-01 per the 2026-10-07 'match the grid' ruling
- [Phase 48]: 48-12: strip-end clearance and viewport bleed 12px to 15px; vertical room max(1em, 0.04 x card width + 6.5px); width writes held on a 250ms A-B-A flip (T-48-36)
- [Phase 49]: 49-01: sign-in selector rule order is expiredFlag, !loggedIn, healthy, else unknown (a latched flag outranks a logged-out read; legendary deletes user.json on the latching verdict)
- [Phase 49]: 49-01: ?open= is validated by exact-membership parseSignInStore, consumed once per Login mount, and removed with replace:true (T-49-01)
- [Phase 49]: 49-02: login.*Reconnect tiles reuse each locale's steamReconnect verbatim; case-inflecting locales (cs, hu, lt, pl) keep {{store}} in a case-neutral slot
- [Phase 48]: 48-13: G-48-11b NOT reproduced in Chromium 153 (108 variants, scrollWidth within 0.6px of E); stop rule fired, Task 2 not started, no src change
- [Phase 48]: 48-14: strip width sync moved to next frame via createNextFrameRunner; observer callback only reads and requests (G-48-11a, WR-01); WebKit sweep 34 vs 0 loop errors, live proof owed to 48-15
- [Phase 48]: Live gate 48-15 on HEAD 460df71e4: G-48-11a and G-48-11b resolved by measurement against a pre-fix arming control (34 loop errors pre-fix vs 0 fixed; blank travel pre-fix vs 15pt clearance fixed); items 11 and 12 stay issue with new gaps G-48-11c and G-48-12a
- [Phase 48]: Plan 48-15 verify asserted 12 parser items but parseUatItemsWithStats counts outstanding items plus gaps (14 at base); consistency was checked against status words and gap statuses instead
- [Phase 48]: 48-16: keyboard-mode body class (body.keyboardNav) scopes the stale-focus suppression instead of a :focus-visible scope; F1 measured to leave two rings
- [Phase 48]: 48-16: same-coordinate pointer moves do not end keyboard mode (engine synthetic move after scroll); untrusted Tab keydowns never enter it
- [Phase 48]: 48-17: strip holds the grid's scrollbar allowance (strip-only) while no grid is shown; G-48-11c = main.content 10px bar toggling, measured in WebKit (+2 = 10/5)
- [Phase 48]: 48-18: G-48-11c and G-48-12a resolved by live WebKit measurement against the preserved pre-fix bundle; G-48-8a stays failed (no controller); L3 distinct-position bar read 8 of 10 and was filed as G-48-12b for an operator ruling, not waved through
- [Phase 48]: 2026-10-09 Windows controller session closed UAT items 11 and 12: controller-focus ring clearance, cold-launch first paint, 20-card cap, title rect, 2-card row, mouse/controller handoff geometry (G-48-8a) and the one-ring invariant all pass by eye; 48-UAT.md complete 12/12
- [Phase 48]: G-48-11d (controller mode hides the card's hover-action buttons, only the store badge stays) is NOT a phase regression: upstream Heroic c555988b7 hid the whole bar in 2022, 16560dbdd (2026-10-02) kept the badge; operator ruled 'leave as is', closed with no code change
- [Phase 48]: Phase closed 2026-10-09: re-verification round 3 passed 10/10 with a real v2 covered-input fingerprint over 60 files (the verifier's claim that `verification fingerprint` was unexposed was wrong; the verb takes the phase dir then paths); 48-VALIDATION.md nyquist_compliant, 48-SECURITY.md 64 threats closed, 0 open
- [Phase 49]: legendaryConfigStore is exported under that name (not configStore) in its own legendary_store dir; expired follows the credentialsMissing precedent and is not write-denied — legendary/user.ts already imports the global configStore; a distinct dir keeps legendary from seeing or deleting the verdict; UI-only impact accepted (T-49-06, T-49-08)
- [Phase 49]: resolveEpicOfflineMode can only enable offline mode and never blocks a launch; the credentials modal stays the fallback for games that cannot run offline — R8: only legendary + canRunOffline + expired turns offline on; read once in prepareLaunch so a mid-launch probe cannot abort a launch
- [Phase 49]: Sign-in classifiers read a GOG token object while offline, and a Nile capture mixing auth and non-auth refresh statuses, as unknown (safe direction under 260822-vov) — Healthy needs positive evidence of a live session and clears a latched flag; a transient status beside an auth status means the failure is not proven
- [Phase 49]: Probe verdicts are decided in one place per store: GOG inside GOGUser.getCredentialsWithVerdict (single gogdl auth spawn, shared in-flight promise with Block E); Epic and Amazon in runnerProbes.ts; applySignInVerdict stays the only latch. — Block E and the pass cannot join each other's spawn and lose its captured output; only a bare null stdout with no connection-error line, online, with the auth config present counts as expired (D-17).
- [Phase 49]: 49-06: Steam keyring deferral (quick 260817-d61) is reversed on purpose for a signed-in account - the sticky deliberate 'boot-probe' trigger unlocks the gate after the boot pass, so later automatic SteamLibraryManager.refresh() calls may CM-connect; the probe itself reads the keyring only (D-14, D-21) — A boot-time notice cannot tell the truth without reading the keyring; a signed-out account never notes the trigger
- [Phase 49]: 49-06: Humble absent session slot and any unreadable read are unknown, never expired (A9, P1) — An empty slot behind a connected flag is not proof of expiry; favours never reporting a false expiry
- [Phase 49]: Dismissed sign-in set is one AppSettings key (dismissedSignInNotices) defaulting to [] with no migration; dismiss and re-arm are its only writers and persist only on change — Absent key and factory default are the same [] on both sides of the two-store hazard; re-arm is idempotent so it runs from push, pull, Humble auth push and end of mount
- [Phase 49]: Renderer componentDidMount runs humbleSync only; the Humble expiry health check lives solely in the sidecar boot pass — D-16 and T-49-21: a second latch path would double-write the expiry flag; a source gate with a RED specimen enforces it
- [Phase 49]: 49-08: boot sign-in probe bound SIGN_IN_PROBE_BOUND_MS=45000 equals Rust KEYRING_READ_TIMEOUT; pass starts after READY, outcomes pull handler registers before READY, test-worker guard lives inside startSignInProbePass — D-01/R3: measured ~12.5s Humble prompt latency motivates the bound; READY must never wait on a probe
- [Phase 49]: 49-09: expired sign-in rows ignore the dismissed set entirely, so a dismiss can never hide a proven expiry
- [Phase 49]: 49-09: SteamSyncNotice credential-missing case is suppressed (resolver returns hidden), not replaced; Library sign-in notice owns it
- [Phase 49]: 49-10: Login tiles re-read persisted verdicts through collectSignInInputs inside the existing effect (openOverlay dep kept, 260823-awo); parity gate compares parsed key:expression pairs of the selector call, not raw text, because prettier wraps the nested call
- [Phase 49]: Live-gate item 9 measures sidecar drain by running build/main/sidecar.js directly with stdin closed at READY; quitting the app makes the shell SIGTERM the sidecar (main.rs:1883-1927) so a PID-gone check passes vacuously — Structural Reachability Review Test 4, restated before publication
- [Phase 49]: Live-gate item 4 also sets loginTime=1 with the valid refresh token kept, because a valid unexpired GOG token is answered locally and the hosts block would exercise nothing — Review Test 6, restated before publication
- [Phase 49]: Live-gate launch 3 (restore plus a healthy clear launch) is inserted so launch 2's persisted expired latches cannot contaminate launch 4's absence assertions; credentials and runner logs are backed up and archived after every launch — Review Test 5 pairs F5, F2-F4, F6
- [Phase 49]: pnpm tauri:dev sets GAMELIB_DEV_SECRET_VAULT=1 and pnpm tauri:dev:keyring does not; Keychain live-gate items 7 and 8 must use the keyring build in a shell with the variable unset — package.json:32-33; otherwise the items are vacuous
- [Phase quick-261015-7tt]: Pure .is-text hover fix is HOVER-scoped only (not block-level), proved mathematically impossible to satisfy base+hover luminance constraints with one static colour
- [Phase quick-261015-7tt]: .settingsWrapper > .button.is-text deleted after a two-arm reachability proof (direct-child DOM walk + import-graph trace) found it unreachable from either settings host
- [Phase quick-261015-7tt]: Self-check caught the Task 3 commit missing the todo's resolution section (staged-vs-disk mismatch); restored in a follow-up fix commit before closing out
- [Phase quick-261015-pwy]: Scored the accepted first-paint-flash limitation as expected rather than reopening the shell/preload architectural question; refuted the screen.availWidth k-recomputation hazard by direct measurement, filing no new todo for it.

### Pending Todos

- [2026-08-23] [general] "F-9 — a generic RPC timeout fired live; co-occurrence with a cookie op is UNDETERMINED" — [todo file](.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md)
- [2026-09-11] [planning-records] "`audit-uat` reads YAML blocks in document BODIES too — the 652-field body population is MEASURED (51 f… — [todo file](.planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md)
- [2026-09-14] [build] 'Windows releases ship UNSIGNED — no Windows code-signing cert is enrolled, so SmartScreen warns on every d… — [todo file](.planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md)
- [2026-09-15] [webview/store-embed] 'Epic''s in-embed "Sign in" button has no decided behaviour — intercept and hand off, fail visi… — [todo file](.planning/todos/pending/2026-09-15-epic-in-embed-sign-in-button-has-no-decided-behaviour.md)
- [2026-09-17] [build] "Packaged .app renders blank — FIXED: the data router rendered its initial-load state as nothing; empty-ro… — [todo file](.planning/todos/pending/2026-09-17-packaged-app-renders-blank-on-roughly-one-launch-in-four.md)
- [2026-10-01] [ui] Library game tiles stretch with window width — consider a fixed or user-selectable tile size — [todo file](.planning/todos/pending/2026-10-01-library-tiles-stretch-with-window-width-consider-a-set-size.md)
- [2026-10-03] [ui] Library sorting is title-only — add a sort-field menu, with Playnite's sort list as the reference set — [todo file](.planning/todos/pending/2026-10-03-library-sorting-is-title-only-add-a-sort-field-menu-playnite.md)
- [2026-10-03] [ui] Login sheet's injected title bar shows a light wedge in the scrollbar gutter at the rounded top-right co… — [todo file](.planning/todos/pending/2026-10-03-login-sheet-title-bar-has-a-light-wedge-at-the-rounded-corner.md)
- [2026-10-05] [i18n] Orphaned library-top-section locale keys (and soon setting.maxRecentGames) — decide whether to rem… — [todo file](.planning/todos/pending/2026-10-05-orphaned-library-top-section-locale-keys-removal-needs-a-decision.md)
- [2026-10-05] [shortcuts] "Windows desktop/Start Menu shortcuts are never written — shell.writeShortcutLink is a stub returnin… — [todo file](.planning/todos/pending/2026-10-05-windows-desktop-and-start-menu-shortcuts-are-never-written.md)
- [2026-10-09] [auth] 'Amazon expiry strings (A3/A6) untested: nile tokens are encrypted, induction needs server-side device deregistration' — [todo file](.planning/todos/pending/2026-10-10-amazon-expiry-strings-need-a-real-induction.md)
- [2026-10-11] [ui] "`.button.is-text`'s 22 `.is-link` render sites and its own `:hover` state are unexamined for contrast" — [todo file](.planning/todos/pending/2026-10-11-button-is-text-hover-and-is-link-pairs-miss-4-5-to-1.md)
- [2026-10-11] [steam] "Native LZMA decode is back ON: run a live Steam depot install on the Mac and re-measure native v… — [todo file](.planning/todos/pending/2026-10-11-native-lzma-mac-live-steam-depot-install-and-throughput-remeasure.md)
- [2026-10-11] [webview/store-embed] 'Re-probe spike 024 with the Chrome UA spoof OFF — all five Epic-store runs stamped a Ch… — [todo file](.planning/todos/pending/2026-10-11-re-probe-spike-024-epic-store-embed-with-the-chrome-ua-spoof.md)
- [2026-10-11] [steam] "win32 SEA native LZMA never engages: the win32-x64 addon imports liblzma.dll, which the SEA does not emb… — [todo file](.planning/todos/pending/2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md)
- [2026-10-11] [ui] Winetricks settings window not resizable by dragging on macOS, yet captures show three distinct widths — [todo file](.planning/todos/pending/2026-10-11-winetricks-settings-window-not-resizable-by-drag-on-macos.md)

### Blockers/Concerns

- Pre-push hook (`prettier` + `i18n --fail-on-update`) fails on **pre-existing repo debt** unrelated to Phase 7: ~141 files fail `prettier --check .` (likely a Prettier version bump; `pnpm-lock.yaml` already modified) and the locale files have orphaned-key drift. Phase 7 was pushed with `--no-verify` after independently verifying tsc/lint/tests. A separate housekeeping pass (`pnpm prettier --write .` + `pnpm i18n`) would clear it.
- Phase 23 Plan 05 Task 3 (checkpoint:human-verify, gate=blocking-human): 23-UAT.md Gate 1 real-hardware re-run pending — human must install a multi-depot title (Hogwarts Legacy 990080 or Cyberpunk 2077 1091500) on real macOS hardware after deleting the stale appmanifest_990080.acf, confirm single monotonic progress percent through a pause/resume cycle, and confirm StateFlags=4 completion + launch. Code fix (single-flight guard + reconciliation) is landed and regression-tested (commits cc77a9df/ddde970d/7fccfb2a/f963de8b); this is the only remaining Phase 23 gap before Gates 2/3 can proceed.
- G-30-01: Steam QR login logon button unresponsive under Tauri (Manage Accounts renders, QR tab never reached) — install/uninstall E2E for Phase 30 unreached as a direct consequence; see 30-HUMAN-UAT.md for reproduction and untested hypothesis
- pathShim.test.ts (plan 34.5-01) unclassified in testContainment.test.ts's declared-suite lists — needs a one-line addition in a future pass (see deferred-items.md); not blocking 34.5-04's own completion
- **RESOLVED by 34.10-10 Tasks 1-2** (commits `3202f2ed6`, `f7fe85ad4`): meta/i18nGateScope.json regenerated (136→144 files; +11 NavShell files +Header/index.tsx, -4 deleted Sidebar paths), `nav.tabs.games` key synced. `genI18nGateScope.test.ts` now fully green (9/9); `hardcodedStringGate.test.ts` went from 4 failing (ScopeLoadError, masking any real scan) to 123/124 passing — proving the gate now genuinely scans all 144 files (self-verified: `scannedFiles matches the committed scope snapshot exactly`).
- **NEW BLOCKER found by 34.10-10 Task 2's verification, plan NOT closed**: `hardcodedStringGate.test.ts`'s one remaining failure is a real violation at `src/frontend/screens/WebView/index.tsx:347` (`'the Humble sign-in window closed or could not be reached'`) — but that line is **uncommitted WIP from the concurrent debug session** (`.planning/debug/humble-isloggedin-never-set.md`, F-34.4.2-19), confirmed via `git diff` (the string only exists in the working tree, not at HEAD). 34.10-10 is explicitly forbidden from touching that file (contamination rules) or widening the allowlist (T-34.10-25). Plan 34.10-10 stops here — Task 1 and Task 2's own artifacts are committed and correct, but the plan's "full suite green" success criterion cannot be met until the concurrent session either wraps that string in `t()` or commits/reverts its WIP. No action needed from 34.10-10 beyond re-running `pnpm jest --runInBand --silent --forceExit` once that session's WebView/index.tsx work is committed.
- REQUIREMENTS.md has no Phase 34.9 traceability section -- REQ-34.9-01..11 are cited by ROADMAP.md, STATE.md, and every 34.9 plan/summary, but requirements.mark-complete cannot find them to check off. Pre-existing gap, not caused by plan 34.9-07; needs a REQUIREMENTS.md backfill pass (D-XX -> REQ mapping + traceability table) for the whole phase.
- Phase 34.9-09: build-runners-onedir-macos.yml cannot be dispatched via gh workflow run until it exists on the repo's default branch (main) -- GitHub's workflow_dispatch requires this for ANY --ref, not just the pushed feature branch. Not resolvable within plan 34.9-09's authorized scope (no PR, no push to main). Blocks: real x64 onedir artifact (never built, no local fallback possible per constraint 1), pinning meta/runnersOnedirDigests.json's 6 sentinels, and full CI proof of the download-verify-extract round trip. See 34.9-CI-ROUNDTRIP.md.

### Quick Tasks Completed

Rows before the newest 20 live in [quick/COMPLETED-INDEX.md](./quick/COMPLETED-INDEX.md) (archived 2026-10-15). Keep new rows to one line; detail belongs in the task SUMMARY.

| # | Description | Date | Commit | Status | Directory |
| --- | ------------- | ------ | -------- | -------- | ----------- |
| 261012-97a | **Spike 024 runs 20-23, no head resource is pending; the blank store is an occluded window.** The probe gained the in-flight list (`inflight`, `pendingScripts`, `pendingStyles`), the parsed tail, `nav.responseEnd` and the host window's `occlusionState` on every read. Every blank raw-`WKWebView` arm (3 of 3) has the whole 1.12 M document, 9 of 9 head scripts and 4 of 4 stylesheets fetched, `readyState` complete, 113 k of body and nothing painted; an opaque always-on-top occluder over the host reproduces the state on demand, for Steam too, and removing it makes the store boot and paint within the next sample. WebKit suspends rendering updates for a not-visible window and Epic's app boot waits on one -- not a load stall, not a shipping blocker. The mid-parse variant (`readyState` loading at ~938 k, runs 15-19) did not recur in 8 arms and is not occlusion; split into a narrower `medium` todo with the offset probe as the next measurement. One raw arm Turnstile-challenged under the occluder (1 of 24, n=1). README runs 20-23 + consequence; todo closed; follow-up filed. | 2026-10-12 | — | COMPLETE. 4 live runs, 24 arms; 6 shots (1 redacted), 4 redacted logs; `SPIKE_PRISTINE_OCCLUDE=1\|pre` knob, `window_visibility()`; `cargo build` clean; `pnpm planning-gates` with the todo move staged. Mid-parse stall cause NOT measured (filed). | [261012-97a-spike-024-instrument-probe-script-with-i](./quick/261012-97a-spike-024-instrument-probe-script-with-i/) |
| 261012-ago | **Spike 024 runs 24-27, the ~938 k mid-parse stall offset is mid-string-literal inside an inline script; the document stream stopped there.** The probe gained `at938` (raw slice), `headEnd`, `bodyAt`, `tagsAround`, `scriptAt`; `SPIKE_PRISTINE_FOCUS=1` makes the host key after each arm is created. 0 of 8 stalls (0 of 16 since run 19). Runs 26 and 27 served documents of exactly run 18's and run 19's lengths, so run 18's stalled `docLen` maps directly: 149-150 characters into the inline analytics `SharedWorker` script, inside `'epic-analytics-worker'` -- mid character token, no element, `</head>` or parser-blocking resource near it, so the main-document response had stopped arriving at a fixed transfer position. Upstream stream stall, not a WebKit yield or webview defect; the embed's answer is a load timeout + reload. `nav.responseEnd` read 0 on two rendered arms, so the position decided it, not the todo's field. Todo closed with a RESOLUTION. | 2026-10-12 | — | COMPLETE. 4 live runs, 12 arms; 4 redacted logs, no new shots; `cargo build` clean; `pnpm planning-gates` 12/12 with the todo move staged. Not done: brotli block vs HTTP chunk boundary; Safari cold-load reproduction. | [261012-ago-spike-024-offset-probe-at-the-938-k-mid-](./quick/261012-ago-spike-024-offset-probe-at-the-938-k-mid-/) |
| 261012-82w | **Stale win32 native LZMA extraction dirs are swept before `mkdtempSync`.** Closes the 261011-wrx follow-up (operator chose the sweep over accepting the leak). `lzmaNativeBinding.ts` gains `sweepStaleExtractDirs(root)`: one `readdirSync` of `os.tmpdir()`, exact-name match `gamelib-lzma-native-<pid>-XXXXXX`, skips own pid / pid 0 / out-of-range pids, probes `process.kill(pid, 0)` and removes a directory ONLY on ESRCH (EPERM and a live probe both skip, so pid reuse can only skip, never delete live state), re-`lstat`s at delete time and refuses symlinks/junctions, capped at 64 probes (`LZMA_NATIVE_STALE_SWEEP_MAX_DIRS`), purely synchronous, every error swallowed; called on win32 only, inside the SEA branch, right before the existing `mkdtempSync` (POSIX `finally` unlink already succeeds and /tmp may be shared across pid namespaces). Result recorded under `Symbol.for('gamelib.lzmaNative.staleSweep')`; `lzmaLoader.ts` appends one `Swept N stale gamelib-lzma-native-* dir(s)` sentence to the existing engaged logInfo / import-failure logWarning, call count unchanged; the LEFT BEHIND sentence now says a later process removes them. Tests S1-S11, W1-W4, K1-K4 added with hermeticity stubs so no jest run touches the real %TEMP% (count 16 before and after every run). Real win32 SEA: cold build from 53b01de62, 20 fake-HOME driver runs 20/20 at nativeWorkers:2; per-run tmpExtracts 2 in all 20 runs (261011-wrx grew 2, 4, ... 40); the 16 stale pid-37008 dirs were swept in run 1; 54 swept in all; last run's 2 dirs removed by hand, %TEMP% now 0. Todo moved to completed/ with Resolution, frontmatter byte-identical. | 2026-10-12 | — | COMPLETE, verified on the real win32 SEA 2026-10-12. Targeted suites 95/95 (lzmaNativeBinding, decompressPool); codecheck, scoped eslint, find-deadcode 46 OK, scoped prettier, planning-gates 12/12 green. OWED: packaged release app arm (after one depot-decoding session, the NEXT session's engaged line should carry `Swept N stale ...` and %TEMP% should hold only the live session's dirs). By design a live session still holds up to one dir per decode worker until exit. | [261012-82w-sweep-stale-win32-native-lzma-extraction](./quick/261012-82w-sweep-stale-win32-native-lzma-extraction/) |
| 261012-8tl | **Closed the audit-uat body block-scalar todo: item D measured under gsd-core 1.15.0, not a parse defect.** `23.2-HUMAN-UAT.md` planted in the in-window phase 23 dir surfaces with its full `expected:` text and parse_gap_files 0 (EXP B 60 files/448 items with one item flipped to pending; EXP C 60/447 unmodified, its 1 item being the routed gap G-23.2-01); left in its own dir it stays absent even with a pending item (EXP A 59/446, identical to live), so the absence is the milestone filter. Unpark trigger NOT fired (STATE.md still `milestone: v0.8`); closed on measurement, not on the trigger. Recorded as unknown: why 23.2's dir sits outside the window while parent phase 23 is inside. | 2026-10-12 | — | COMPLETE. Todo moved pending→completed with a governing `## CLOSED 2026-10-12` section at line 19; frontmatter byte-unchanged (no `ready:` vocabulary value exists for a finished todo; the directory carries the state). `pnpm planning-gates` 12/12; prettier `--file-info` reports `ignored: true`, so `--check` omitted. Residue named, not fixed: audit-uat renders a `status: routed` gap as category `unknown`. Task commit ba9a6bb8f. | [261012-8tl-close-todo-2026-09-11-audit-uat-reads-bl](./quick/261012-8tl-close-todo-2026-09-11-audit-uat-reads-bl/) |
| 261012-913 | **Removed the orphaned `setting.library_top_section`, `setting.library_top_option.*` (4 labels) and `setting.maxRecentGames` entries from all 47 `translation.json` catalogues; decision was remove, not won't-fix.** Precedent 260911-srh had already deleted an inert key from the same population, and neither trap in the todo armed: no entry was last in its object in any of the 47 (trailing-comma repair fired 0 times) and no `_one`/`_other` siblings exist. Byte-preserving line sweep (`sweep-library-top-keys.cjs`, `--dry-run`/`--write`/`--check --against`), `git diff --numstat` reads `0 8` on all 47 rows (376 deletions); each catalogue re-parses and deep-equals its pre-edit parse minus exactly the three `setting` keys. `br/` and `sl/` have no `translation.json`, so 47 is the whole population. Corrections to the brief: `AppSettings.libraryTopSection` is NOT orphaned (`focusRowMigration.ts` seeds `focusRow` from it; `config.ts:359` defaults it), and `src-tauri/src/main.rs` keeps 8 `maxRecentGames` hits reading the stored setting, both untouched. | 2026-10-12 | — | COMPLETE. Baseline re-measured at 05978e870. `pnpm i18n` after the commit: no diff under `public/locales`, 4 warning-word lines before and after (two source filenames containing `Warning`, a Node DeprecationWarning and its hint; none a parser warning), so the todo's "zero warnings" pass condition is recorded as not literally met and not regressed. `pnpm i18n-churn-guard` clean. `pnpm lint-translations` 8225/96 → 8216/96, still red on pre-existing gamelib.library.tileSize.* and ca.gamelib.humbleKeys; the sorted set difference is exactly the 9 ka/th `Empty translation` lines naming the removed keys, none added. Residue grep outside `.planning/` and `main.rs` empty. Prettier `--file-info` reports every written path ignored, so `--check` omitted. `pnpm planning-gates` 12/12. Todo moved pending→completed with its 2051 original bytes as an exact prefix plus one `## Resolution` section. Commits 0c59089e9 (48 paths) and c70dfabc1 (todo pair). | [261012-913-remove-the-orphaned-setting-library-top-](./quick/261012-913-remove-the-orphaned-setting-library-top-/) |
| 261012-d5g | **Made the D-05 call -- Option A, `/store/epic` ships as a Rust-managed raw WKWebView subview, macOS first, as new Phase 50.** B (gate for good) rejected by the 2026-09-29 Linux one-launcher precedent; C (pristine window) folded in -- `humble_login_open` is a login-seam window, not a no-code path. Locked sub-decisions: Sign in button left in place and measured by Phase 50's live gate (hand-off only if challenged); macOS only; shared default data store with a warm signed-in arm owed; Turnstile-host fallback to the panel plus load timeout and reload. D-05 todo closed with a Decision section; Sign in todo re-triaged `ready: live-gate` / `platform: macos`; comment-only notes in `WebView/index.tsx` and `WebviewUnavailablePanel.tsx`; spike 024 README consequence section gained a dated decided note; Phase 50 entry written over `phase add`'s stub (Depends on corrected from 49 to 40 + spike 024). | 2026-10-12 | — | COMPLETE. `pnpm planning-gates` 12/12; prettier green on both `.tsx`; 16 WebView suites / 316 tests green; code commit verified comment-only. Not done: Phase 50 itself (spec/plan owed); the live gate arms listed in its entry. | [261012-d5g-record-the-d-05-call-for-store-epic-opti](./quick/261012-d5g-record-the-d-05-call-for-store-epic-opti/) |
| 261012-f05 | **`addShortcut`/`removeShortcut` are now invoke-kind and resolve a boolean write outcome; GameSubMenu flips its Add/Remove shortcut label only from it.** Type map, preload (`makeHandlerInvoker`), sidecar `ipcMain.handle` pair (true after write plus success toast, false after `logSendFailure`, add keeps its error toast, never rejects) and legacy `ipc_handler.ts` parity. New `toggleShortcuts` helper flips on strict `=== true`; false, null, undefined and rejection leave the label. Pins re-derived and matched measured: census 6/1, sweep 6/45, runnerSlice 67/2. GameSubMenu optimistic-flip todo closed to `completed/`. Not done: no live app run; a late write after the 60 s invoke bound leaves the label stale until remount. | 2026-10-12 | — | COMPLETE. RED 12 failed of 35 (`shortcutsFlows`), renderer suite failed to load; GREEN 219 (6 backend suites), 46 (GameSubMenu), 2131 across the four roots; `pnpm codecheck`, scoped eslint 0 errors and `prettier --check` exit 0; `pnpm find-deadcode` and `pnpm planning-gates` 12/12. Darwin cases ran (host macOS). Commits `48cb42c3a`, `d7a5da8e6`, `87331998f`. | [261012-f05-submenu-shortcut-invoke-kind](./quick/261012-f05-submenu-shortcut-invoke-kind/) |
| 261012-euq | **Filled `gamelib:library.tileSize.label` and `.valueText` in all 48 non-English catalogs** (added English-only by `fa3f581ce`, 261011-t4y), unblocking CI run 38176505164's `lintTranslations` REQ-41-02 and `comparePresenceBaseline` R13 reds (96 pairs). Values authored in-session (machine-fill unavailable under a gateway key), derived from each locale's own `dlc.size`/`wine.size` and tile parallels; `valueText` kept `{{width}} px` everywhere (no locale has a pixel-unit word). Both keys stamped into each `gamelib.mt.json`; D-09 means machine-fill will not revisit them. Confidence 32 high / 12 medium / 4 low (`br`, `sl`, `ka`, `ml` want native review). Same CI run's `logSecretGate` red fixed separately in `99e61737c` (exempted wine --version stdout, pin 12 to 13). | 2026-10-12 | — | COMPLETE. `lint-translations:gamelib` 816/96 hard to 720/0; `lintTranslations` + `gamelibCatalogParity` + `logSecretGate` 291 tests green; baseline untouched; numstat 48x `5 1` catalogs, 48x `2 0` manifests. Commit `933c7ac3d`. | [261012-euq-fill-library-tilesize-label-and-valuetex](./quick/261012-euq-fill-library-tilesize-label-and-valuetex/) |
| 261014-rso | **Latched the Epic embed `loadTimedOut` raise so the timeout banner can surface (G-50-16, the one major gap from the Phase 50 macOS live gate).** UAT Item 16 split pass/fail — the backend literal `load timed out past 45s` fired 3 times under a scoped host block, but `StoreEmbedTimeoutBanner` never became visible. Root cause was an un-latched raise on two sides. `useStoreEmbedHost.ts`'s GAP-D drain applied `events[events.length - 1]` wholesale, so a `loadTimedOut: true` raise followed by later `false` events in the SAME 250 ms batch was coalesced away (the live sequence was raise, then the -999 failure, then the next provisional start, all inside one poll interval); it now merges `loadTimedOut` stickily across the batch on strict `=== true`, while url/host/canGoBack/canGoForward still take the last event only. Rust side, all four `load_timed_out = false` sites in `macos_epic_embed.rs` now route through a new cfg-free `epic_embed_clears_load_timeout` in `epic_embed_state.rs`, which returns false only for `NavigationFailed` — so a failure can no longer clear a raise while `did_finish_navigation` still clears it, preserving D-07. The planner's measurement retired the briefed `nav_generation` fix as primary. That field is bumped at only two of the four reset sites, so a blanket gate would also stop a slow-but-successful load from dropping the banner, and a gate narrowed to the failure hook still would not fix the observed run. The renderer sticky merge is the necessary-and-sufficient half. Toolbar Reload deliberately stays ENABLED during a hung load (operator decision, the banner must survive a click-through) so its `disabled`-prop asymmetry against back/forward is intentional. Also corrected a brief error — `rust-test.yml` runs on windows-latest plus macos-latest with no Linux leg at all. Commits `5ba1dd645`, `f32f4757b`, `6299e7be0`. | 2026-10-14 | — | COMPLETE (code). RED observed before the fix on new jest property 46, verbatim `1 failed, 57 passed, 58 total` with `Expected true Received false`; property 47 is a boundary guard and passed throughout, claimed as such rather than as a red. Re-measured by the orchestrator, not just self-reported — scoped jest `useStoreEmbedHost` 56 to 58 passed, `cargo test --bin gamelib-shell` 390 to 394 passed with 0 failed and 2 ignored, `pnpm codecheck` exit 0, `cargo fmt --check` exit 0, scoped prettier clean on the 2 TS paths, `pnpm planning-gates` 12/12. Prettier omitted on the `.rs` paths with the reason measured, `inferredParser` is null and `--check` errors there, so `cargo fmt` is the gate. OWED, filed as a pending todo at `severity: major` `platform: macos` `ready: live-gate` — the macOS re-run of UAT Item 16, which is the only thing that can confirm the banner actually paints, plus the three UI-SPEC E3 checks it carries (Reload and Open-in-browser on one row at minimum window width, the longest-of-49 translation shape, and the revert-hosts-then-Reload recovery half). | [261014-rso-latch-epic-embed-load-timed-out](./quick/261014-rso-latch-epic-embed-load-timed-out/) |
| 261014-vot | **Gave the Epic embed `reload()` a first-commit fallback — the timeout banner Reload was a WebKit no-op on a never-committed WKWebView.** `FrameLoader::reload` returns early on an empty current-request URL, which is exactly the state UAT Item 16 Launch 5 produced (hosts blackhole applied before launch, nothing ever committed, confirmed click, zero navigation lines); Launch 3 (blackhole mid-session on a committed page) saw `-999` cancellations per click because the native reload fired. `EpicEmbedSurface` now tracks `has_committed` (new `didCommitNavigation` hook) and `last_requested_url` (the three chrome-side `loadRequest` sites); `reload()` re-issues the URL via `loadRequest` until the first commit, decided by the pure, cross-platform-tested `epic_embed_reload_action`. `didFinishNavigation` now logs a host-only success line so a silent success is distinguishable from a no-op. No Cargo change. Todo closed with a Resolution; UAT Item 16 result extended, status word kept at issue. | 2026-10-14 | — | Fix landed in `888b022ea`, docs in `6120ee734`; cargo test epic_embed 50/0/350 (was 46); the live recovery arm is still unobserved on a Mac and the DNS-cache confound unmeasured — re-run owed with the blackhole pre-launch and a fresh process after the revert. `epic_embed_handle_content_process_termination` keeps a bare reload (doc-flagged). | [261014-vot-fix-todo-2026-10-14-epic-embed-subview-d](./quick/261014-vot-fix-todo-2026-10-14-epic-embed-subview-d/) |
| 261014-wro | **Withheld the embed placeholder sentence on the Epic surface — option 3 of the Paused-while-a-window-is-open todo, chosen by the operator.** `StoreEmbedPlaceholder` now renders `webview.embedPlaceholder.message` only when its `reason` is not `epic-surface`; the D-19 suppression cases and the zero-argument call are unchanged, and on macOS `/store/epic` (D-06, statically true for the route) the slot is a text-free styled fill seen through the transparent subview. No locale file, no English copy, no CSS and no new key changed, so UI-SPEC E2 keeps its no-new-text rule; E2/E6 rows amended, the 50-REVIEW open entry discharged, todo closed with a Resolution. The todo existed because this false sentence drove two debug cycles and a self-contradicting commit. | 2026-10-14 | — | Fix in `6c061a598`, docs in `8bc527718`; scoped jest 30/30 (was 27), codecheck 0, lint at its 638 ceiling, prettier clean, locales untouched by a BASE-ranged diff; the text-free fill on a real Mac cold Epic load is still visually unobserved. | [261014-wro-fix-todo-2026-10-14-paused-while-a-windo](./quick/261014-wro-fix-todo-2026-10-14-paused-while-a-windo/) |
| 261015-7tt | **Censused the 22 `.button.is-link` render sites and `.button.is-text:hover` across all 10 themes — 5 families x 10 themes, 50 token-resolved ratios; 4 missed 4.5:1, all fixed with theme-scoped hover-only overrides.** Game-menu `.is-link` hover on dracula (`--navbar-active` → `--accent` on `--navbar-background`) 3.79 → 9.15; MainButton dropdown `.is-link` hover on gruvbox_dark 3.91 → 12.06 via a new `.SteamInstallCaret .dropdown .link:hover` override; pure `.is-text` hover on nord-light 3.36 → 5.13 and nord-dark 4.41 → 5.13 via `--neutral-01` — a block-level fix was proved impossible there because no one colour clears both nord-light's `--accent` base fill and the theme-constant `--primary-hover`, so the override is hover-scoped only. Base states untouched in every theme. Planner finding F3 pinned: `--navbar-inactive` is declared in only 2 of 10 themes and consumed as a bare `var()`, so in 8 themes the winning declaration is invalid-at-computed-value-time and inherits `body` colour rather than falling back to `.button.is-link`. `.settingsWrapper > .button.is-text` (`Settings/index.css`) deleted after a two-arm reachability proof (direct-child DOM walk and import-graph trace) agreed it was unreachable. Todo moved to `completed/` with a Resolution; triage frontmatter byte-unchanged. | 2026-10-14 | — | Code in `4128be9c6`, `f90c76cfd`, `88e18329a`; todo-resolution restore `34bd5de5a` (executor's Task 3 commit staged the renamed todo without its Resolution section, self-caught); executor also committed PLAN/SUMMARY in `7fdc94216`/`5952198df` against instruction. `themeTokens.test.ts` 270/270; orchestrator mutation check: removing the nord-light override reds 3 tests; prettier clean on 4 paths; planning-gates 12/12. Every ratio is resolver-chain, not pixel-sampled — no live capture on any theme. | [261015-7tt-is-link-and-is-text-hover-contrast-censu](./quick/261015-7tt-is-link-and-is-text-hover-contrast-censu/) |
| 261015-9qy | **Declared the app's first minimum window size — `minWidth: 900` / `minHeight: 600` on the `main` window in `tauri.conf.json` — and found the notice row's CSS was never the clipping mechanism.** 900 is the measured width from the Item 16 Launch 5 photographs (`item16-width900.png` fit on one row); 600 is a judgment call with no measurement. No Rust `min_inner_size` exists, so the conf is the single declaration; pinned in `tauriWindowConfig.test.ts` with a no-min SANITY fixture. `.WebView__embedNoticeRow-message` already had `min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis` and `-actions` already had `flex-shrink: 0` since `348e28057` (Phase 50-03), predating the live gate that filed the todo — so `index.css` is unchanged and the contract is now pinned per selector in `StoreEmbedTimeoutBanner.test.tsx` with a string-copy sabotage arm. `EpicLauncherBlockedNotice` renders no actions element, so the no-clip clause is banner-only. UI-SPEC E3 now names 900px and the conf key as its test point. Todo moved to `completed/` with a Resolution; triage frontmatter byte-unchanged. | 2026-10-15 | — | Code in `428aa56e1`, `de0113dbf`, `dfbb9d918`. Orchestrator re-ran: jest 33/33 across the 3 suites (29 baseline + 4 new); planning-gates 12/12; prettier clean on conf + both tests, `.planning/` paths prettier-ignored so no check carried. **Unverified:** the clamp itself and the rendered ellipsis — nobody launched the app. Open: `App.css:26` `min-content 1fr` shell column with no `min-width: 0` on `.App .content` may have been the real clip; the 900 floor makes it unreachable rather than root-caused. | [261015-9qy-store-embed-notice-row-set-a-minimum-win](./quick/261015-9qy-store-embed-notice-row-set-a-minimum-win/) |
| 261015-dlu | **Measured 9qy's App.css shell-column hypothesis and REFUTED it; the real clip was `.WebView__embedContainer`'s implicit `auto` grid column, zero-floored with `grid-template-columns: minmax(0, 1fr)`.** Static harness of the shipped stylesheets (sass-compiled scss, MUI 5.17.1 Tabs/Tab base transcribed, DOM mirroring `NavShell/index.tsx` and the embed container with the banner's real markup and strings) run in WebKit (compiled WKWebView probe, derived from Phase 48's `48-13/wkprobe.swift`) and Chromium (`chrome-headless-shell`) at 1280/900/800/700/600/500 with seven injected-style arms. `.App` `scrollWidth` never exceeded `clientWidth`; the `.App .content { min-width: 0 }`, `.NavShell__navbar { min-width: 0 }` and `{ overflow: hidden }` arms were byte-identical to shipped at every width. Shipped at 600: container column 419.66px vs a 334px content box, notice row 419.66px, actions' right edge 659.66px (the `item16-width600.png` clip). F1 container `minmax(0, 1fr)`, F2 row `min-width: 0`, F3 row `overflow: hidden` all gave column 334px / message 70.08px / actions right edge 574px; F1 chosen as the container-level fix covering `StoreEmbedControls` and `EpicLauncherBlockedNotice` too. At 500 every arm still clips (message at 0, actions 187.92px + icon + padding exceed 234px) — the regime the 900px floor exists for. Pin: `readSelectorBody` generalised (optional region start, comment-stripped) and a new per-selector arm with observed RED before the CSS landed. 9qy's closed-todo Open observation prefixed with the refutation; UI-SPEC E3 read first and left byte-unchanged (names no mechanism). | 2026-10-15 | — | Code in `b86503723`; evidence `1c266b3b0`; records `404cbf5f7`; live-gate todo `6a720918f`. Orchestrator re-ran: jest 16/16 across the two suites (15 baseline + 1); planning-gates 12/12; evidence bundle clean of operator paths; executor's first commit swept the staged PLAN.md and was amended before any push. **Unverified:** nothing ran in the real app — the harness is a static page with a transcribed MUI base, not the running shell; `appClientWidth` reads viewport − 10 in every arm (harness detail, not a defect). Filed `2026-10-15-embed-container-column-fix-unverified-on-hardware.md` (`minor`/`macos`/`live-gate`). | [261015-dlu-embed-container-grid-column-has-no-zero-](./quick/261015-dlu-embed-container-grid-column-has-no-zero-/) |
| 261015-lz5 | **Routed all 30 `macos_epic_embed.rs` diagnostics through `crate::shell_diag` so a packaged build persists them to `gamelib-shell.log` — the source todo's 25 was an undercount.** Every literal dropped its `[shell] ` prefix (shell_diag re-adds it), so stderr is byte-identical: all 49 string literals in the file compare equal old-vs-new after prefix-stripping. New source gate `macosEpicEmbedDiagPersistence.test.ts` pins 0 `eprintln!`, 30 call sites and no double prefix, with an inline mutation arm. 50-UAT.md's sink table row and Item 17 `expected:` corrected by dated addendum, no `result:` touched; source todo closed into `completed/`. No other `src-tauri/src/*.rs` module has the gap; `main.rs` mixes both emitters deliberately and was not touched. | 2026-10-15 | — | Code `9fa43de5e`; test `0a19fa4f1`; docs `c3f124019`. Orchestrator re-ran: cargo check clean, cargo test 16/16 (384 filtered), jest 22/22 across the two embed suites, planning-gates 12/12, scoped prettier green on the `.ts` (the `.rs` has no prettier parser, `cargo fmt --check` is its gate). **Unverified:** nothing ran as a packaged app, so the persistence the fix exists for is desk-asserted — filed `2026-10-15-macos-epic-embed-shell-diag-persistence-unverified-on-a-packaged-launch.md` (`minor`/`macos`/`live-gate`), which also carries forward the unrotated-`gamelib-shell.log` observation. | [261015-lz5-route-macos-epic-embed-rs-s-30-eprintln-](./quick/261015-lz5-route-macos-epic-embed-rs-s-30-eprintln-/) |
| 261015-n5k | **Live-gated 261015-dlu's `.WebView__embedContainer` zero-floor column in the RUNNING app on this Mac — E3 passes at the 900px floor, the row degrades as the harness predicted below it, the 500px clip is real and unclaimed; no code change.** `pnpm tauri:dev` of HEAD, real Stores → Epic route, real `StoreEmbedTimeoutBanner` rendered through React by wrapping `window.api.storeEmbedTakeNavEvents` from the Web Inspector console (no sudo, no hosts blackhole, no 45s wait). Sub-900 layout viewports reached by docking the inspector right inside a 1280 window and dragging the divider. Live WebKit: 900 → message 380.08, actions right 884, unclipped (frame 02); 600 → column **344px**, message ellipsised to 80.08, actions right 584, unclipped (frame 03); 500 → column 244px, message 0, actions right 503.92, clipped by 3.92px (frame 04). Pre-fix control (`grid-template-columns:auto` injected) at 600 and 500 → column **419.65625px**, actions right 659.66 — the harness's `shipped` row to the hundredth — and removing it restored the fixed numbers. The 9qy width clamp also measured: a requested 800 left the window at 900. Source todo closed into `completed/`; dlu's evidence README (e) now points here. | 2026-10-15 | — | Docs only (this commit). Gate run inline by the orchestrator, 12 measurement records in `evidence/gate-measurements.jsonl`, 6 frames read before scoring, teardown asserted empty (shell, vite, sidecar, :5173). planning-gates 12/12. Every written path is prettier-ignored, so no formatter check was run. **Not verified:** `minHeight` clamp, the longest-of-49-translations arm, and the genuine 45s Rust timeout path (Item 16's own re-run, still owed). | [261015-n5k-live-gate-for-261015-dlu-verify-the-embe](./quick/261015-n5k-live-gate-for-261015-dlu-verify-the-embe/) |
| 261015-oc8 | **Live-gated 261015-lz5's `shell_diag` persistence on a PACKAGED launch — PASS, observed; no code change.** `tauri build --debug` bundle of HEAD `beca31cbf`, recovered from the DMG and tied to `target/debug/gamelib-shell` by sha256 (`4c6c5871…a58cdd`; fix literal in the binary 1, old `[shell] `-prefixed form 0), launched with `open -n`. `lsof -p 60602 -a -d 1,2`: fd 1 and fd 2 both `/dev/null`, stderr offset 2538 → 2918 across the Epic page load — the LaunchServices discard measured, not assumed. Real STORES tab click (first click only activates the window) loaded `store.epicgames.com` in the native Epic subview; `gamelib-shell.log` line **3937**: `1792038877 pid=60602 macos_epic_embed: didFinishNavigation succeeded -- host: store.epicgames.com` — `{epoch} pid={pid} ` prefix, 0 leaked `[shell] ` prefixes for the pid. Cmd+Q: pid gone in 2 s, line still at 3937, the pid's `quit (Cmd+Q)` and `exit requested (code=Some(0))` lines follow it. Teardown census (shell, sidecar, vite, :5173) empty. Source todo closed into `completed/`. | 2026-10-15 | — | Docs only (this commit). Gate run inline by the orchestrator; 15 pid-scoped log lines, 3 frames, build log, binary hash and the rig in `evidence/`. planning-gates green. Every written path is prettier-ignored, so no formatter check was run. **Not exercised:** the D-14 launcher-scheme literal (chrome-side `storeEmbedNavigate('com.epicgames.launcher://…')` produced no embed line — needs a page-initiated navigation); `location.hash='#/store/epic'` from the auto-opened inspector did NOT change the route in the packaged build (it did under `tauri dev` in n5k). `gamelib-shell.log` still unrotated: 334 960 bytes / 3939 lines. | [261015-oc8-live-gate-261015-lz5-shell-diag-persiste](./quick/261015-oc8-live-gate-261015-lz5-shell-diag-persiste/) |
| 261015-p3q | **Re-applied the saved Accessibility zoom at boot — `GlobalState.componentDidMount` now calls a new `applySavedZoomAtBoot` helper (`savedZoomBoot.ts`) once, undebounced, through the existing `window.api.setZoomFactor` bridge, before any `window.api.handle` registration.** Closes the gap the source todo found: `zoomPercent` was persisted and read back into state at boot, but nothing ever re-applied it to the webview, so a saved 150% rendered at 100% until the slider was touched. Admitted range mirrors the slider's own 60–200 (`Accessibility/index.tsx`), with an anti-drift arm reading that JSX; out-of-range/non-number resolves to 100, never an extreme/non-finite factor. The call is unconditional (including at 100%) so `--webview-zoom` publishes on boot too (closes residual (c) of 261011-t4y). Never-throws contract (try/catch + guarded `onError` reporter). New source-text wiring gate (`GlobalStateSavedZoomWiring.test.ts`) pins the call site with a self-test arm proving its own matchers can fail; corrected `tauriWindowChrome.ts`'s now-false doc comment. Source todo closed into `completed/` with a Resolution naming the declined options; new live-gate todo filed for the real quit-and-relaunch check. | 2026-10-15 | — | Code `2aaaefc03`; tests+comment `e0021f4b8`; docs `ca001283f`. 18/18 new jest (both suites), 27/27 `windowChrome.test.ts` unaffected, `pnpm codecheck` 0, lint:src 1089/1124 and lint:tests 638/638 both unbumped, prettier clean on 5 non-ignored paths, planning-gates 12/12. **Unverified:** a real quit-and-relaunch rendering at the saved zoom — filed `2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md` (`minor`/`macos`/`live-gate`), which also carries the Library-tile-at-150% re-check. | [261015-p3q-re-apply-saved-accessibility-zoom-at-sta](./quick/261015-p3q-re-apply-saved-accessibility-zoom-at-sta/) |
| 261015-pwy | **Live-gated 261015-p3q's saved-zoom boot re-apply on a real `pnpm tauri:dev` quit-and-relaunch — PASS on all three named arms; the `screen.availWidth` k-recomputation hazard was REFUTED as a free by-product; no code change.** Two launches: Launch 1 set `zoomPercent: 150` via the real slider and read the live apply; Launch 2 relaunched with 150 already persisted and read the untouched-boot `--webview-zoom` at `1.5774409656148782` (predicted `1.5774410`, matched within 1e-5), with the `.gameList` track already at the 150%-correct `114.108864px` from the first Library paint. A 54-frame, ~6s window-cropped screenshot burst found no 100%-rendered frame; the first-paint flash, if any, is bounded at `< 119.1ms` (calibrated sampler resolution), not a multi-second stay — scored as the accepted cost of the `componentDidMount` layer, not re-filed. 5 `setZoomFactor` probes doubled as the k-hazard test: `availWidth` held at 1428 throughout, resolving to the predicted 1.44 factor every time, refuting the hazard — no new todo filed. Profile restored to the as-found `zoomPercent: 90` via the range input's native setter + `input`/`change` dispatch (a CGEvent click failed to grab the thumb's keyboard focus). Source todo closed into `completed/` with a Resolution. | 2026-10-15 | — | Code/evidence `901fc79c4`; relaunch arm `0cf12aec2`; docs `131f10e13`. planning-gates 12/12, prettier `--file-info` confirmed both evidence paths ignored. `src/` and `src-tauri/` untouched. | [261015-pwy-live-gate-the-saved-accessibility-zoom-b](./quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/) |
| 261015-rud | **Live-gated Amazon expiry strings A3/A6 by in-place nile induction — PASS.** A3 dead refresh token returns 400 (inside `NILE_AUTH_FAILURE_STATUSES`); A6 `<Response [400]>` verbatim; Phase 49 item 5 PASS, restore proven. Comment-only src. Filed zero-installed latch todo. | 2026-10-15 | — | Evidence + docs `5c83cc4da` | [261015-rud-live-gate-the-amazon-expiry-strings-a3-a](./quick/261015-rud-live-gate-the-amazon-expiry-strings-a3-a/) |
| 21 | Archive STATE.md bloat (Quick Tasks, Decisions, Roadmap Evolution) -- 1.66 MB to 140 KB | 2026-10-15 | 2c876d443 | — | — |
| 22 | Close Phase 49 UAT: item 5 PASS from 261015-rud, item 6 (A4) deferred to the zero-installed latch todo | 2026-10-15 | 86f566b32 | — | — |
| 23 | Live re-gate Phase 50 UAT #16 recovery half -- PASS; G-50-16 resolved | 2026-10-15 | 184ce7a4b | — | — |
| 24 | Phase 50 UAT #13 and #14 marked not applicable -- no live gesture exists to test | 2026-10-15 | 241d8a501 | — | — |
| 25 | Phase 50 UAT #15 and #18 accepted as not applicable -- desk-tested, no live induction | 2026-10-15 | 9c02caaf7 | — | — |
| 261015-vtu | **Closed 34.4.1 cycle-2 E-WR-01..04 dead theme tokens + IN-01; review dispositions declared.** CSS/token only, NOT rendered live; 17 info findings and IN-02 NOT addressed. | 2026-10-15 | 24792ec3e | COMPLETE (desk). 26 suites/588 jest, scoped prettier, planning-gates 12/12; phase folder reads green by declaration (REVIEW-FIX warnings_resolved + cycle-2 disposition closed). | [261015-vtu](./quick/261015-vtu-close-e-wr-01-04-theme-token-warnings-fr/) |
| 261016-n7s | **Amazon sign-in latch now clears on a zero-installed profile.** The expiry probe's `list-updates` run is `unknown` with nothing installed (A4) and `unknown` never writes, so a latched `expired` could only clear via Reconnect. Fix: a clear-only classifier (`classifyNileLibrarySync`, return type excludes `expired`) observes the `nile library sync` spawn `refreshNile()` already makes on every library refresh and hands `healthy`/`unknown` to `applySignInVerdict` with the pre-spawn epoch; non-stale verdicts record+publish like the pass. Probe and D-16 untouched. Marker `Successfully synced the library` proven in the shipped v1.2.0 binary (vendored tree is 1.1.2). Lazy alias imports (storeManagers cycle measured). jest 12/12 suites 245/245, codecheck 0, lint ceilings PASS unbumped (tests 638/638 zero headroom, no re-pin needed), prettier clean, planning-gates 12/12. Source todo closed into completed/. Live confirmation on the real zero-installed profile not done. | 2026-10-16 | 60023a86e | — | [261016-n7s-amazon-sign-in-latch-never-clears-on-a-z](./quick/261016-n7s-amazon-sign-in-latch-never-clears-on-a-z/) |
| 28 | Fix 7 unparseable YAML frontmatters (6 quick-task SUMMARYs + 34.13-UAT.md) refused by audit-open acknowledge during the v0.8 close pre-flight | 2026-10-16 | 102129700 | — | — |
| 29 | fast: close the login-sheet scrollbar-gutter wedge live-gate at the desk -- attributed to WebKit macOS 26 corner-avoidance inset (scrollbar frame starts at y=19) over the document background colour; todo flipped to ready: blocked, parked on route C/D | 2026-10-16 | aadc89ad0 | — | — |
| 261016-ra0 | **Archived phases 05-26 into milestones/v0.2..v0.7-phases/; v0.7 closed with live UAT PARKED.** audit-uat 314 before/after; not rendered in the explorer; historical path refs inside archived docs left as-is. | 2026-10-16 | d64387d4b | COMPLETE (desk). 519 renames, 7 .planning-reading suites 215 tests, planning-gates 12/12, scoped prettier; fixed packagingConfig.test.ts already red from the v0.8 archive. | [261016-ra0](./quick/261016-ra0-archive-phases-05-26-into-per-milestone-/) |
| 31 | 261016 D-UAT-10 live gate: bottled Steam Play + uninstall real-HW verified; todo closed | 2026-10-16 | 2f19be397 | — | — |
| 261016-t3e | Steam bottled launch: install-directory process monitor (Playnite pattern) for real started/stopped Play feedback | 2026-10-16 | 7d0bdc873 | — | [261016-t3e-steam-bottled-launch-install-directory-p](./quick/261016-t3e-steam-bottled-launch-install-directory-p/) |

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Testing / Quick tasks | ~~`pnpm test:ci` not run for quick tasks `260815-j24` + `260815-k25`~~ — **RESOLVED 2026-08-15: run, exit 0, 258 suites / 5027 passed + 1 skipped (5028 total), 75.0s.** No regression against the 256-suite / 4952-passed baseline. The +2 suites / +75 tests are NOT from these tasks (both appended gates to EXISTING files) — they are the concurrent session's `MainButton.steamSplitButton.test.tsx` + `InstallGameModal.test.ts` from `06a220385`. New baseline: **258 suites / 5027 passed**. | Resolved | 2026-08-15 (quick 260815-j24/k25) |
| Game Details | DETAIL-03: Linux ProtonDB compat overlay | Post-v0.2 | v0.2 requirements |
| Settings | API-01: Copy-to-clipboard on API key field | Post-v0.2 | v0.2 requirements |
| Console / Steam | CONSOLE-02: Steam update feedback in Console launch — when a Steam game needs an update, GameLib shows "Launched in Steam" and dismisses while Steam silently updates; user has no in-app signal. Needs own design (Steam does not report update state back). From Phase 8 UAT (finding E). | Post-v0.2 | Phase 8 UAT (2026-07-04) |
| Console / macOS | KNOWN LIMITATION — Launching a Steam game from Console mode on macOS shows a brief desktop-Space animation before the game appears. Cause: Console mode uses native fullscreen (its own macOS Space) so swipe-to-Space works; macOS must leave that Space when the game's window appears elsewhere. Not fixable from Electron without setSimpleFullScreen, which removes the swipe-able Space and has focus/chrome rough edges (prototyped + rejected in Phase 8 UAT test 11). `activate:false` on the steam:// handoff was tried and kept but does not remove the flash. Accepted as-is. | Accepted (won't fix) | Phase 8 UAT (2026-07-04) |
| Humble Store | HSTORE-02: Read-only Humble bundle/deals listing in-app with "Buy on Humble" deep-links | Post-v0.3 | v0.3 requirements (separate data source; key management prioritized) |
| v0.8 close 2026-10-16 | **Override closeout** — 429 items acknowledged via `audit-open acknowledge` (markers in the artifacts; verdict-preserving, self-invalidating), 140 evidence-table rows in five deferred-items.md ledgers left open because no row-level marker exists. 0 carried forward from a prior close. | override_closeout | 2026-10-16 (v0.8 close) |
| debug_sessions | tray-icon-swap-noop | diagnosed | 2026-10-16 (v0.8 close) |
| debug_sessions | 48-controller-mode-card-shrink-and-border | diagnosed | 2026-10-16 (v0.8 close) |
| debug_sessions | deep-link-open-url-abort | investigating | 2026-10-16 (v0.8 close) |
| debug_sessions | download-queue-require-crash | awaiting_human_verify | 2026-10-16 (v0.8 close) |
| debug_sessions | electron-steam-sync-fails-phase30 | diagnosed | 2026-10-16 (v0.8 close) |
| debug_sessions | epic-timeout-banner-never-visible | diagnosed | 2026-10-16 (v0.8 close) |
| debug_sessions | humankind-depot-full-stall | investigating | 2026-10-16 (v0.8 close) |
| debug_sessions | humble-keys-empty-list-flashing-sync | awaiting_human_verify | 2026-10-16 (v0.8 close) |
| debug_sessions | humble-zero-keys-from-valid-orders | awaiting_human_verify | 2026-10-16 (v0.8 close) |
| debug_sessions | knowledge-base | unknown | 2026-10-16 (v0.8 close) |
| debug_sessions | nile-spawn-app-side-latency | root-caused-no-fix-applied | 2026-10-16 (v0.8 close) |
| debug_sessions | settings-unreachable-tauri | diagnosed | 2026-10-16 (v0.8 close) |
| debug_sessions | steam-bottle-guided-setup-never-fires | resolved-pending-verify | 2026-10-16 (v0.8 close) |
| debug_sessions | steam-bottle-provision-stuck-loop | resolved-pending-verify | 2026-10-16 (v0.8 close) |
| debug_sessions | steam-depot-key-appid | awaiting_human_verify | 2026-10-16 (v0.8 close) |
| debug_sessions | steam-install-options-opens-nothing | reported | 2026-10-16 (v0.8 close) |
| debug_sessions | steam-install-spinner-hangs-tauri | diagnosed | 2026-10-16 (v0.8 close) |
| debug_sessions | steam-sync-false-failed-banner | awaiting_human_verify | 2026-10-16 (v0.8 close) |
| debug_sessions | uninstall-game-vanishes | parked | 2026-10-16 (v0.8 close) |
| debug_sessions | wazhack-uninstall-reverts | awaiting_human_verify | 2026-10-16 (v0.8 close) |
| debug_sessions | winetricks-window-not-resizable | awaiting_human_verify | 2026-10-16 (v0.8 close) |
| todos | 2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md | (presence-only) | 2026-10-16 (v0.8 close) |
| todos | 2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md | (presence-only) | 2026-10-16 (v0.8 close) |
| todos | 2026-09-17-packaged-app-renders-blank-on-roughly-one-launch-in-four.md | (presence-only) | 2026-10-16 (v0.8 close) |
| todos | 2026-10-03-library-sorting-is-title-only-add-a-sort-field-menu-playnite.md | (presence-only) | 2026-10-16 (v0.8 close) |
| todos | 2026-10-03-login-sheet-title-bar-has-a-light-wedge-at-the-rounded-corner.md | (presence-only) | 2026-10-16 (v0.8 close) |
| todos | 2026-10-11-stores-tab-embed-not-implemented-on-windows.md | (presence-only) | 2026-10-16 (v0.8 close) |
| quick_tasks | 260627-vq1-fix-qr-login-hang-set-qrsessionstate-don | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260628-kzf-fix-blank-steam-icon-on-manage-accounts- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260628-pi7-show-steam-last-played-on-game-details-p | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260629-9ly-fix-qr-login-library-race | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260629-rbn-fix-premature-steam-install-uninstall-no | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260710-kba-format-steam-install-size-as-human-reada | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260710-knr-install-info-platform-icon-folder-open-i | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260710-l27-extra-info-crossover-wine-rating-rows-re | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260710-lmo-complete-heroic-gamelib-rebrand-of-user- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260710-m3f-show-estimated-install-size-on-pre-insta | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260710-mkw-steam-grid-cover-art-falls-back-to-heade | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260710-nwb-crossover-compatibility-lookup-spike | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260710-qyc-ui-cleanup-relocate-rework-the-crossover | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260710-rjm-rework-gamepage-emulation-compat-rows-pe | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260711-htb-move-the-use-shared-wine-prefix-toggle-t | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260712-lkn-add-refresh-affordance-for-crossover-com | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260714-gnc-add-graphifyignore-to-scope-knowledge-gr | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260715-a7g-treat-remaster-remake-as-product-differe | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260718-jmt-fix-steam-download-progress-graph-cadenc | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260719-aog-steam-native-install-progress-polish-dow | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260726-q8f-extract-shared-stripsourcecomments-util- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260727-c42-consolidate-on-the-standalone-graphify-g | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260802-o3j-fix-wr-08-stripper-integrity-regression- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260803-eee-tauri-oauth-login-finalizing-state-on-ma | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260803-mcu-epic-sidlogin-smart-clipboard-paste-auto | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260804-n02-remove-logged-out-sidebar-anti-pattern-a | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260805-d62-colour-the-interactive-legendary-login-e | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260805-rwy-remove-manage-accounts-login-text | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260805-t0s-remove-patreon-from-the-menu-and-all-ref | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260805-u68-change-the-ko-fi-link-from-heroic-s-url- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260805-v1f-remove-discord-and-github-sponsors-from- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260806-teb-amazon-store-login-takes-too-long-need-t | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260813-ssg-fix-stale-avernum-5-retest-claim-in-stat | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260814-n2o-amend-plan-34-5-58-and-ledger-rows-for-f | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260814-r2d-fix-keyring-read-timeout-treated-as-no-t | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260814-u2u-fix-c4-01-forward-signals-in-meta-runts- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260815-bjr-port-heroic-2-22-1-fixes | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260815-j24-frameless-titlebar-remove-icon-left-alig | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260815-k25-hide-native-macos-window-title-hiddentit | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260815-kt0-manage-accounts-screen-replace-per-store | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260815-lta-change-title-tab-headings-to-accounts-li | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260815-opt-library-filter-visibility-facet-group-se | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260815-qf0-hoist-filterchiprow-above-the-recently-p | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260815-vvz-fix-the-dead-app-hide-sidecar-fallback-i | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260816-9o0-guard-gen-i18n-gate-scope-from-clobberin | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260816-a5o-teach-the-rust-quote-balance-check-about | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260816-hdg-normalize-steam-metadata-depot-signal-re | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260816-py8-phase-34-15-bookkeeping-corrections | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260816-qcn-steam-platform-signal-precedence-rule-an | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260816-vgc-fix-the-orphaned-depot-download-route-th | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260817-d61-defer-the-steam-keyring-read-from-startu | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260817-dib-make-the-install-watchdog-a-progress-bas | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260817-ihr-fix-the-steam-depot-downloader-s-single- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260817-pkx-fix-decompresspool-worker-threads-to-act | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260817-sw8-record-age-of-wonders-planetfall-718850- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260818-s5l-fix-the-55-eslint-errors-not-warnings-su | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260818-v81-fix-g-23-02-gap-healreconciledfilemodes- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260819-b1q-fix-applymachoexecutablefallback-fat-uni | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260819-ch5-fix-the-stale-finish-in-steam-label-on-i | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260819-r4r-cache-steam-library-on-startup | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260819-s8p-seed-steam-bottle-name-in-install-modal | complete (code) / conflict on task 3 co… | 2026-10-16 (v0.8 close) |
| quick_tasks | 260819-snf-remove-archived-wine-ge-from-the-wine-ma | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260820-fyl-fix-t-34-5-g6-14-keyring-cacheepoch-gene | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260820-ic0-add-the-missing-platform-branch-absence- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260820-kq0-steam-login-should-have-the-same-windowi | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260820-u29-fix-steam-login-form-tab-label-clipping- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260821-iri-make-humble-login-open-as-an-animated-di | missing | 2026-10-16 (v0.8 close) |
| quick_tasks | 260821-le0-fix-32-bit-mac-steam-titles-permanently- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260821-lge-mirror-provisionbridgebottle-s-crossover | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260821-o34-switch-the-gog-user-api-off-embed-gog-co | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260821-ooq-port-heroic-gamepad-fixes-nintendo-face- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260821-rb5-steam-case-c-residue-persist-a-resume-br | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260822-b05-fix-reconcilenonavailablegames-trapping- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260822-bp4-decrypt-symlink-linktarget-in-depot-mani | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260822-di1-inject-chrome-stripping-css-into-the-hum | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260822-dkf-stop-the-install-poller-grace-window-kil | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260822-eib-strip-the-humble-login-navbar-so-only-th | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260822-elw-add-a-create-a-steam-account-link-to-the | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260822-h37-write-34-9-review-fix-md-fix-pass-siblin | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260827-t9c-fix-phase-34-11-correctness-residual-rev | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260827-ua7-close-phase-34-11-residual-warnings-wr-0 | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260827-vpl-close-out-phase-34-11-final-three-residu | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260831-q93-fix-epic-cookie-census-dead-probe | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260831-vmc-epic-census-partial-unconfirmed-gate | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260901-8rm-shrink-tauri-macos-bundle-narrow-bundle- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260901-a2w-stop-shipping-stale-build-bin-helper-fil | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260901-b8z-repoint-frontenddist-at-renderer-only-dir | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260901-e7o-restore-runner-symlinks-in-tauri-bundle | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260901-ud5-unblock-the-pre-push-hook-all-four-gates | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260902-9wt-close-the-2026-08-06-phase-34-8-i18n-con | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260902-ad5-split-the-46-locale-fork-string-coverage | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260902-ofu-cr-01-legendary-logout-unconditional-cle | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260903-8rj-commit-orphaned-34-3-uat-file-and-retire | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260903-9dw-record-human-retest-pass-for-login-backg | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260903-itr-remove-browser-from-the-i18n-glossary-an | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260905-luf-steamgame-getgameinfo-returns-on-a-doubl | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260905-mv5-fix-the-4-sibling-unguarded-getgameinfo- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260906-gej-sweep-sidecar-bootstrap-for-unported-non | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260906-h2k-point-the-graphify-pretooluse-hooks-at-a | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260906-hq8-fix-runts-cjs-esbuild-spawn-on-windows-b | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260906-u8i-fill-the-794-missing-gamelib-locale-pairs | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260906-vdn-write-41-review-fix-md-recording-the-clo | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260907-dbh-fix-pause-cancel-button-opening-install- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260907-e7a-audit-and-close-the-non-title-axis-of-th | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260907-f2g-guard-the-two-unguarded-getgameinfo-dere | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260907-j8n-persist-rpc-transport-failure-diagnostics | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260907-juv-fix-helper-process-orphan-on-app-quit-wi | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260907-o1b-split-f9-into-closed-and-parked-halves | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260907-odi-fix-gog-playtime-sync-lock-never-release | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260907-ov3-live-gate-the-keyring-get-bounded-classi | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260907-ppy-gog-importgame-reject-a-chosen-folder-wh | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260907-rjc-rewrite-stale-eos-native-dialog-todo-aga | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260907-seq-close-the-importgame-wineprefix-winevers | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260907-sxp-fix-install-stall-watchdog-so-a-trip-can | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260908-ci2-restore-steam-refreshinstallstate-focus- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260908-e64-fix-macos-shortcut-icon-generation-guard | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260908-fre-port-the-lost-boot-time-epic-gog-user-re | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260908-gx3-enforce-presence-baseline-totalpairs | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260908-gye-todo-triage-decorations-normalize-todo-f | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260908-k3x-port-checkrosettainstall-into-tauri-side | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260908-uic-add-gog-keyless-support-so-humble-gog-ke | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260908-vo4-humble-key-row-move-store-icon-left-at-t | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260908-wk0-port-the-boot-time-gog-queued-playtime-d | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260909-k5x-port-boot-time-gog-presence-call-into-si | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260909-pym-fix-cold-session-installdir-fallback | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260909-q2o-thread-the-depot-abortsignal-through-cdn | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260909-s8x-split-the-lint-ratchet-into-separate-pro | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260910-drs-reset-the-gog-presence-keep-alive-interv | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260910-et3-make-dev-vault-the-default-for-tauri-dev | partial | 2026-10-16 (v0.8 close) |
| quick_tasks | 260911-ayu-fix-state-md-frontmatter-invalid-yaml-an | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260911-ftc-fix-the-stranded-key-bug-a-server-reject | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260911-h49-close-gog-auth-json-outer-key-todo | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260911-ijv-fix-the-red-pre-push-prettier-gate-and-c | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260911-qds-transcribe-the-req-43-19-live-gate-re-ru | awaiting_human_check | 2026-10-16 (v0.8 close) |
| quick_tasks | 260911-s4f-file-the-game-header-offset-todo-and-tra | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260911-t0p-fix-four-ui-defects-on-the-humble-keys-s | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260911-umj-shrink-shared-control-heights-app-wide-s | done | 2026-10-16 (v0.8 close) |
| quick_tasks | 260912-bij-fix-the-duplicate-key-corruption-in-34-5 | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260912-bul-correct-three-stale-phase-34-6-facts-in- | done | 2026-10-16 (v0.8 close) |
| quick_tasks | 260912-csq-add-a-uat-visibility-planning-gate-that- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260912-d84-align-the-humble-keys-game-column-header | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260912-it4-drain-the-undefined-css-custom-property- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260912-k09-gog-logo-centring-live-re-measure | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260912-n9i-fix-audit-open-current-focus-emitting-a- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260912-qop-getgameinfo-forcereload-stale-map | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260912-rvv-refresh-installed-before-savepath-read | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260913-901-fix-smoke-sidecar-hang | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260913-lkk-fix-smoke-sidecar-fail-open-signal | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260913-m9c-cold-boot-pooled-tls-socket-hold | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260915-ajd-change-listavailable-to-return-verb-titl | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260915-g9p-fix-humble-expiration-digest-leak-sentin | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260915-lhm-close-2026-08-24-winetricks-todo-narrow- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260916-cdb-rename-import-game-label-and-demote-it-t | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260917-8hr-file-three-release-run-failures-as-todos | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260917-u4d-close-the-d-32-adtraction-gap-todo-path- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260917-uik-sign-every-mach-o-under-contents-resourc | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260918-a1a-claude-md-region-source-markers | missing | 2026-10-16 (v0.8 close) |
| quick_tasks | 260918-amq-uat-expected-inline-convention | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260918-c6a-uat-reason-inline-then-park | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260919-sya-make-the-gsd-phase-status-vs-code-extens | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260919-tms-wrap-gamesubmenu-s-5-eos-overlay-call-si | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260921-k2d-fix-gamepage-wikilink-trans-key-to-i18nk | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260921-mzl-delete-the-dead-dialog-css-todo-item-3-a | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260921-nub-delete-the-dead-dialog-content-and-dialo | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260921-o95-guard-or-parameterise-the-five-darwin-as | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260921-pec-record-the-live-wkwebview-measurements-i | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260921-pvt-delete-the-stray-trailing-content-tag-fr | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260921-rmj-fix-fr-gamepage-wikilink-entity | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260921-saw-refresh-i18n-fork-touched-snapshot | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260921-thi-fix-leaked-store-embed-rpc-timer | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260922-7pv-sweep-stray-trailing-envelope-tags-gate | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260922-8kv-delete-dead-dialog-logs-wrapper-css-rule | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260922-avw-add-push-triggers-so-ci-evaluates-main | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260922-e01-make-the-deadcode-baseline-environment-i | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260922-gxd-style-the-redeemsteamkeydialog-outcome-p | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260922-hjb-prune-unreachable-locale-directories-fro | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260922-iyj-collapse-43-language-literals | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260922-k2o-shrink-used-in-module-deadcode-ledger | partial (33 of 203 shipped; todo rewrit… | 2026-10-16 (v0.8 close) |
| quick_tasks | 260922-lh4-ship-src-bucket-c-and-fix-the-census | partial (tasks 0-4 of 6 shipped; tasks … | 2026-10-16 (v0.8 close) |
| quick_tasks | 260922-n7s-correct-the-tsconfig-widening-claim | missing | 2026-10-16 (v0.8 close) |
| quick_tasks | 260922-p57-make-tar-invocations-drive-letter-safe-o | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260922-vzw-clear-bucket-b-of-the-used-in-module-dea | missing | 2026-10-16 (v0.8 close) |
| quick_tasks | 260923-89z-retire-phase-38-electron-runtime-items | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260923-b31-ci-cargo-test | completed | 2026-10-16 (v0.8 close) |
| quick_tasks | 260923-ihw-fix-the-notarization-todos-unachievable-verif | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260923-mrx-bound-the-macos-notarization-wait-in-release | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260923-np3-record-the-live-notarization-run-in-the-todo | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260923-o2s-fix-iswritable-windows-acl-group-grant | completed | 2026-10-16 (v0.8 close) |
| quick_tasks | 260923-ohg-close-the-linux-release-leg-todo | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260923-p95-record-notarization-accepted-in-the-todo | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260923-qe5-fix-checknintendo-trusting-chromium-stan | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260923-tip-fix-windows-packaged-build-darwin-runner | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260923-u3o-record-live-gate-results-extract-updater-todo | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260923-uvt-close-notarization-todo-extract-residual | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260923-vdq-label-both-figures-in-the-install-dialog | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260924-g7r-share-one-steam-visibility-predicate-bet | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260924-pm3-correct-the-windows-code-signing-todo-re | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260924-rbx-add-a-dry-run-conditional-to-release-tau | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260924-swb-fix-library-card-art-never-recovering-fr | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260924-tjg-close-the-python3-git-bash-store-stub-to | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260924-vat-ignore-src-tauri-target-in-vite-watcher- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260925-88h-mt-disclosure-and-report-link-in-languag | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260925-9de-fix-checknintendo-axis-reads-right-stick-dea | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260925-i31-action-todo-make-the-humble-bare-date-ex | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260925-j58-exempt-keyless-humble-entitlements-from- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260925-kt4-widen-two-gog-keyless-only-humble-keys-s | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260925-m5i-fix-checkn64clone1-dpad-hat-comparisons- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260925-ms5-measure-non-standard-nintendo-pad-stick- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260925-nxt-split-compound-uat-item-38-c01-and-resol | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260925-o9b-close-obsolete-report-upstream-todo-and- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260925-op0-add-temporary-gamepad-act-dispatch-instr | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260925-oyr-retire-38-c04b-stick-click-expectation | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260925-pga-make-highlighted-game-cards-in-non-conso | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260925-r8j-phase-38-controller-sitting-close-out-di | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260925-uok-windows-gamelib-self-heal-on-launch | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260926-8j9-phase-38-windows-sitting-close-out | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260926-acw-give-controller-keyboard-focus-a-percept | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260926-bsl-correct-the-sitting-4-build-label-in-38- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260926-dxa-tauri-dev-pre-flight-rejects-a-foreign-r | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260926-f3l-gamelib-self-heal-skips-dev-builds-under | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260926-gs1-clear-store-filter-on-store-logout | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260926-jes-rename-notify-uninstalled-error-to-notif | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260928-sph-pick-up-and-resolve-the-pending-todo-at- | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260928-upj-record-the-decision-option-a-gtk-box-nat | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260930-9oq-fix-13-cr-01-urgency-badge-can-never-say | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 260930-hks-migrate-to-gsd-core-1-15-0-and-close-the | missing | 2026-10-16 (v0.8 close) |
| quick_tasks | 261001-apg-appimage-desk-run-of-the-linux-embed-live | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 261001-ci5-record-the-local-linux-run-of-the-five-g | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 261001-ci6-close-the-ci-runner-todo-on-a-green-pull | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 261001-lgc-record-the-linux-embed-live-gate-and-clo | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 261001-pez-mid-drag-frame-capture-for-the-linux-sto | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 261008-qbb-dock-quit-applicationshouldterminate | missing | 2026-10-16 (v0.8 close) |
| quick_tasks | 261011-vl0-library-card-geometry-follow-ups-from-th | unknown | 2026-10-16 (v0.8 close) |
| quick_tasks | 261012-9aa-run-the-live-windows-gate-for-the-pendin | incomplete | 2026-10-16 (v0.8 close) |
| quick_tasks | 261012-euq-fill-library-tilesize-label-and-valuetex | unknown | 2026-10-16 (v0.8 close) |
| uat_gaps | 05/05-HUMAN-UAT.md | partial | 2026-10-16 (v0.8 close) |
| uat_gaps | 06/06-HUMAN-UAT.md | partial | 2026-10-16 (v0.8 close) |
| uat_gaps | 08/08-UAT.md | diagnosed | 2026-10-16 (v0.8 close) |
| uat_gaps | 08.1/08.1-HUMAN-UAT.md | passed | 2026-10-16 (v0.8 close) |
| uat_gaps | 13/13-HUMAN-UAT.md | partial | 2026-10-16 (v0.8 close) |
| uat_gaps | 14/14-UAT.md | partial | 2026-10-16 (v0.8 close) |
| uat_gaps | 17/17-UAT.md | testing | 2026-10-16 (v0.8 close) |
| uat_gaps | 21/21-UAT.md | partial | 2026-10-16 (v0.8 close) |
| uat_gaps | 26/26-HUMAN-UAT.md | partial | 2026-10-16 (v0.8 close) |
| uat_gaps | 27/27-UAT.md | partial | 2026-10-16 (v0.8 close) |
| uat_gaps | 28/28-HUMAN-UAT.md | partial | 2026-10-16 (v0.8 close) |
| uat_gaps | 30/30-HUMAN-UAT.md | unknown | 2026-10-16 (v0.8 close) |
| uat_gaps | 30/30-UAT.md | diagnosed | 2026-10-16 (v0.8 close) |
| uat_gaps | 32/32-HUMAN-UAT.md | partial | 2026-10-16 (v0.8 close) |
| uat_gaps | 34.13/34.13-UAT.md | unknown | 2026-10-16 (v0.8 close) |
| uat_gaps | 34.14/34.14-UAT.md | passed | 2026-10-16 (v0.8 close) |
| uat_gaps | 34.15/34.15-UAT.md | passed | 2026-10-16 (v0.8 close) |
| uat_gaps | 34.2/34.2-HUMAN-UAT.md | parked | 2026-10-16 (v0.8 close) |
| uat_gaps | 34.3/34.3-UAT.md | superseded | 2026-10-16 (v0.8 close) |
| uat_gaps | 34.5/34.5-UAT.md | partial | 2026-10-16 (v0.8 close) |
| uat_gaps | 38/38-HUMAN-UAT.md | false | 2026-10-16 (v0.8 close) |
| uat_gaps | 50/50-UAT.md | diagnosed | 2026-10-16 (v0.8 close) |
| verification_gaps | 05/05-VERIFICATION.md | human_needed | 2026-10-16 (v0.8 close) |
| verification_gaps | 06/06-VERIFICATION.md | human_needed | 2026-10-16 (v0.8 close) |
| verification_gaps | 08/08-VERIFICATION.md | human_needed | 2026-10-16 (v0.8 close) |
| verification_gaps | 13/13-VERIFICATION.md | gaps_found | 2026-10-16 (v0.8 close) |
| verification_gaps | 19/19-VERIFICATION.md | human_needed | 2026-10-16 (v0.8 close) |
| verification_gaps | 21/21-VERIFICATION.md | human_needed | 2026-10-16 (v0.8 close) |
| verification_gaps | 26/26-VERIFICATION.md | human_needed | 2026-10-16 (v0.8 close) |
| verification_gaps | 28/28-VERIFICATION.md | human_needed | 2026-10-16 (v0.8 close) |
| verification_gaps | 30/30-VERIFICATION.md | human_needed | 2026-10-16 (v0.8 close) |
| verification_gaps | 32/32-VERIFICATION.md | human_needed | 2026-10-16 (v0.8 close) |
| verification_gaps | 33/33-VERIFICATION.md | human_needed | 2026-10-16 (v0.8 close) |
| verification_gaps | 34/34-VERIFICATION.md | human_needed | 2026-10-16 (v0.8 close) |
| verification_gaps | 34.13/34.13-VERIFICATION.md | human_needed | 2026-10-16 (v0.8 close) |
| verification_gaps | 35/35-VERIFICATION.md | human_needed | 2026-10-16 (v0.8 close) |
| verification_gaps | 50/50-VERIFICATION.md | gaps_found | 2026-10-16 (v0.8 close) |
| deferred_items | 15/deferred-items.md: Plan 15-01 - **Pre-existing lint error (out of scope):** `pnpm lint` reports 1 error in… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 17/deferred-items.md: From 17-11 (GAP 3 gap-closure) - **Pre-existing async leak in `src/backend/storeManager… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 17/deferred-items.md: From 17-12 (GAP-17-PFX86-PATH gap-closure) - **Pre-existing async leak in `src/backend/… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 23/deferred-items.md: Skip-and-warn policy for a Blocked key on a non-essential owned depot (G-23-01) — ✅ CLO… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 30/deferred-items.md: Plan 30-02 - **Pre-existing eslint errors in `src/backend/sidecar/handlers.ts` (lines 1… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 31/deferred-items.md: Plan 31-01 - **Pre-existing eslint error in `src/backend/sidecar/electronStub.ts`** (`@… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 31/deferred-items.md: Plan 31-02 - **Flaky `bootstrap.test.ts` failure when run alongside the full `src/backe… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 32/deferred-items.md: From Plan 32-01 - **Pre-existing `handlers.ts` lint errors (2x `@typescript-eslint/no-u… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.1/deferred-items.md: 34.1-13 Discovered while running `npx eslint` against `src/backend/__tests__/tauriShe… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.12/deferred-items.md: 34.12-04 Task 2 — pre-existing `i18nForkTouchedFiles.json` drift, unrelated to this … | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.2/deferred-items.md: From plan 34.2-03 - **Pre-existing eslint error in `src/backend/crossover_index/__tes… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.2/deferred-items.md: From plan 34.2-07 - **Pre-existing leaked-timer crash in `src/backend/storeManagers/s… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.2/deferred-items.md: From the phase-level post-merge test gate (orchestrator, /gsd-execute-phase 34.2) - *… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.2/deferred-items.md: From plan 34.2-18 (gap cycle 2, CR-03/WR-01 closure) — CLOSED by gap cycle 3 - **11 o… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.2/deferred-items.md: From plan 34.2-20 (gap cycle 3, WR-02 closure) **RESOLUTION NOTE, 2026-07-26 (gap cyc… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.2/deferred-items.md: From plan 34.2-19 (gap cycle 3, structural containment) - **Re-observed: the pre-exis… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.2/deferred-items.md: From gap cycle 3 (plans 34.2-19..34.2-23) Residual findings from `34.2-REVIEW-GAP-CYC… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.2/deferred-items.md: From gap cycle 4 (plans 34.2-25..34.2-29) Deliberate deferrals from `34.2-REVIEW-GAP-… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.2/deferred-items.md: Gap-cycle-4 findings CLOSED 2026-08-23 (quick task `260823-9ds`) Two of `34.2-REVIEW-… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.2/deferred-items.md: Gap cycle 4: closed **Count correction, 2026-08-23.** Every "17" in the sections abov… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.3/deferred-items.md: From plan 34.3-04 Full backend `npx jest` sweep (run as part of this plan's own verif… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.3/deferred-items.md: From plan 34.3-09 (Task 1, the blocking live-gate's automated sweep) Both items below… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.3/deferred-items.md: Supply-chain disclosure — AR-34.3-01 **Carry this entry into `34.3-SECURITY.md` when … | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.3/deferred-items.md: From the phase-close gate — non-deterministic cross-suite flake Running the full `npx… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.3/deferred-items.md: ID — AR-34.3-01 | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.3/deferred-items.md: Threat — T-34.1-SC (supply chain — cargo installs) | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.3/deferred-items.md: Origin — Plan 34.3-03, commit `3a83772d` | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.3/deferred-items.md: Disclosed — 2026-07-26 | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.3/deferred-items.md: Owner — Grayson Mitchell | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.3/deferred-items.md: Status — accepted, transitive review owed to secure-phase 34.3 | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: Plan 15 — `depot.test.ts` full-suite-only flake (2026-07-30) - **Found during:** Pl… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: Plan 18 — `seam-parity-sweep.py` category/term tables are stale relative to plans 1… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: Plan 19 — `seam-parity-sweep.py`'s S-07/S-10/S-11 staleness re-forwarded, not fixed… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: Plan 18 — `helperProcess.test.ts` full-suite-only flake (2026-07-30) - **Found duri… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: **Found during:** Plan 21 Task 3's human checkpoint. The operator booted the app to… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: **Second observation, same boot:** the Humble session survived the relaunch — **no … | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: Scope and disposition - **Scope:** entirely outside plan 21's declared `files_modif… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: Follow-up (2026-07-31, same day): signing hypothesis MECHANISM CONFIRMED, empirical… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: Resolution of the "Always Allow" ambiguity (2026-07-31) The entry above listed two … | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: D-29-08 / D-29-06 — owners assigned (plan 34, 2026-08-23) Both were **unassigned no… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: D-29-03 — **CLOSED 2026-08-23** (plan 32). D-29-02 — remains open, handed to plan 3… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: Why **20+** reads per boot — **No caching anywhere in the keyring read path.** `Sid… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: Why **each** read prompts at all — Hypothesis: `pnpm tauri:dev` re-links and ad-hoc… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: Per-call item churn (service/account varying per call) — Ruled out — `KEYRING_SERVI… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: Duplicate items, each carrying its own ACL — Ruled out — `security dump-keychain` →… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: Allowlist bypassed / unlisted accounts being written — Ruled out — The one non-allo… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: Absent entry — 40–102 ms | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: **Present** entry (real `steam-refresh-token` account) — **48.9 s**, then **291 s**… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: JS/TS (`src/frontend`, `src/preload`) — 0 unverified — The only 2 hits are `queryLo… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: Rust (`dispatch_rust_channel`) — 5 unverified — All five are `WebViewBuilder::build… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: after the fix — exit 0 — **exit 0**, 13 findings written | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: one hint reverted `1211`→`1202` — exit 1 — **exit 1**, same hard stop | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: restored — exit 0 — **exit 0** | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: `--self-test` — exit 0 — **exit 0** — "every check rejects its corresponding bad in… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: D-29-01 — CLOSED (already fixed) — plan 30 — — (ledger only) | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: D-29-02 — **PARKED 2026-08-23** (operator) — UNDETERMINED, non-blocking — plan 32 →… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: D-29-03 — OPEN — plan 32 — `src/backend/humble/adapter.ts` | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: D-29-04 — OPEN — plan 33 — `src-tauri/src/main.rs` | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: D-29-05 — OPEN — plan 33 — `src-tauri/src/main.rs` | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: D-29-06 — **PARKED 2026-08-23** (operator) — co-occurrence UNDETERMINED — plan 34 →… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: D-29-07 — OPEN — headline — plan 35 — `34.4.1-LIVE-GATE-RERUN-4.md` | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: D-29-08 — RE-HOMED to 34.6, CONFIRMED 2026-08-23 — plan 34 → todo; owner signed off… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: D-29-09 — CLOSED (one REQ) — plan 30 — `.planning/REQUIREMENTS.md` | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: D-29-10 — CLOSED at filing — plan 30 — — (ledger only) | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: NEW-01 — CLOSED — plan 31 — `seam-parity-sweep.py` | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: completion line exists, exactly once, with `durationMs` — delete the `logInfo` call… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: revealed key reaches NO log sink — interpolate `key=${parsed.data.key}` into the li… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: 1 — `.title("GameLib")` — amended WR-07 gate FAILS — **FAILS** ✓ | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: 2 — `.title(some_other_var)` — amended WR-07 gate FAILS — **FAILS** ✓ | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: 3 — remove the provisional title — D-29-05 presence gate FAILS — **FAILS** ✓ | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.1/deferred-items.md: 4 — move the empty guard AFTER `set_title` — D-29-04 order gate FAILS — **FAILS** ✓ | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: Plan 05 — `helperProcess.test.ts` full-suite-only flake, reproduced again (2026-08-… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: Plan 05 — `seam-parity-sweep.py` real-tree run fails on a site outside this phase's… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: Plan 05 — pre-existing REQUIREMENTS.md checkbox/prose mismatches found, not fixed (… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: Plan 07 — `.planning/STATE.md`'s "Next action" line points at an unrelated Phase 34… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: Plan 09 — the autofill glyph's un-gated cross-platform injection remains unfixed, n… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: Plan 11 — seven `34.4.2-REVIEW.md` findings deliberately OUT of scope this cycle (2… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: Plan 11 — the debug arc's three commits landed with no phase plan documenting them … | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: Plan 13 — what the deletion deliberately did NOT do (2026-08-05) **Not a gap — a sc… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: Plan 14 — the nile spawn tax that motivates the guard, and one silently-swallowed r… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: Plan 15 — gate run 2's orphaned findings folded into the ledger (2026-08-05) **Disp… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: Plan 16 — a fifth contract-authoring defect (an interaction, not a single unreachab… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: Plan 20 — RERUN-4 RAN, verdict FAIL 1/6; four new findings, three of them contract … | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: Plan 23 — gap cycle 5 authoring: owners assigned to RERUN-4's four findings, F-34.4… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: Plan 24 — the blocking live gate RAN against `34.4.2-LIVE-GATE-RERUN-5.md`, verdict… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: F-34.4.2-19 Track 2 continuation — WR-03 deadline lead structurally ruled out; a ga… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: F-34.4.2-19 CLOSED — debug session resolved the root cause; three residuals recorde… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: RERUN-6 authored — D-G4/D-G5 locked, two findings retired, one NEW finding (2026-08… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.4.2/deferred-items.md: RERUN-6 RAN — verdict PASS 5/5, the phase's first full PASS; two NEW contract defec… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.5/deferred-items.md: **`src/backend/sidecar/__tests__/testContainment.test.ts` Block C — `pathShim.test.ts… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.5/deferred-items.md: **`src/backend/wine/manager/downloader/__tests__/utilities/rest.test.ts` — `unlinkFil… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.5/deferred-items.md: **`src/backend/__tests__/longRunningChannels.test.ts` — stripper-integrity self-check… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.5/deferred-items.md: Resolution — Wave 1 post-merge gate (orchestrator, 2026-07-29) - **Item 1 — RESOLVED.… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.5/deferred-items.md: Disposition of items 6-11 (F-34.5-G6-01..06) against this run > **UPDATE 2026-08-03T2… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.5/deferred-items.md: 23. Steam identity in the repo — DEVELOPER DECISION RECORDED 2026-08-02: redact forwa… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.5/deferred-items.md: 24. D-CYCLE6-A — Epic login is DESCOPED from Phase 34.5's blocking gate; ~~Phase 34.7… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.5/deferred-items.md: Found during the fifth blocking live gate (2026-08-19, plan 34.5-59) **VERDICT: PASS … | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.5/deferred-items.md: SteamID3 account id (`userdata/<id>`) — 4, all `.planning/phases` — **0** — `49fdaad7… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.5/deferred-items.md: SteamID64 (the profile-URL number) — 37 — **37 — public since 2026-07-14** — `fb84eb8… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: `34.9-18-SUMMARY.md:45`: *"closing CR-01 and WR-01"* — both self-check PASSED, no dis… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: `34.9-19-SUMMARY.md:60`: *"Closed the one known blind spot (WR-02)"*; `:62-63`: IN-01… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: `34.9-20-SUMMARY.md:61`: *"Closed the second half of CR-01 ... It is now an unconditi… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: `34.9-21-SUMMARY.md:62`: *"CR-01 (the sole Critical finding from `34.9-REVIEW.md`) is… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: 18. C2-05 — the arm64-only guard is live and active in real CI, and gates an auto-pub… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: 19. C2-07 — the doc-comment accuracy pins couple CI to documentation wording, not jus… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: List B — every finding ID with a landed fix, confirmed against the repository Stage o… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: List B — every finding ID with a landed fix, confirmed against the repository - **C3-… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: List B — every finding ID with a landed fix, confirmed against the repository - **C4-… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: Closure protocol — why every cycle's own review is unledgered by construction Recorde… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: nile — 4.23s — 0.13s — 32.5x | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: legendary — 3.99s — 0.15s — 26.6x | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: gogdl — 2.99s — 0.11s — 27.2x | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: CR-01 — Critical — FIXED — 34.9-18 (`closeBundle` throw) + 34.9-20 (wired into `dist:… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: WR-01 — Warning — FIXED — 34.9-18 (`isContainedSymlinkTarget`, `meta/preserveRunnerSy… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: WR-02 — Warning — FIXED — 34.9-19 (`summarise()`'s `!fw.topLevelStubExists` branch, `… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: IN-01 — Info — FIXED — 34.9-19 (`meta/cleanDistMac.ts` doc-comment correction, pinned) | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: IN-02 — Info — FIXED — 34.9-19 (`meta/cleanDistMac.ts` doc-comment downgraded to defe… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: IN-03 — Info — FIXED — quick task 260822-hrf (commits `df7af9f4a` rename + `ab1ee0448… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C2-05 — Warning — FIXED — plan 34.16-01, commit `adc648eb6` (2026-08-25) -- CROSS-PHA… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C2-07 — Info — FIXED — quick task 260823-sok, closing item 19 opened by plan 34.9-27 … | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: source under pin — `meta/cleanDistMac.ts` — `meta/cleanDist.ts` (via the test's `CLEA… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: the pins block — `meta/__tests__/cleanDistMac.test.ts:234-276` — `meta/__tests__/clea… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: IN-01 negative (protective) — — — `:467-471` | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: IN-01 positive, 2× `toContain` — — — `:473-477` | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: IN-02 negative (protective) — — — `:479-483` | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: IN-02 positive, 3× `toContain` — — — `:485-492` | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C2-01 — Critical — FIXED — 34.9-25 (pipe-to-`&&` conversion) + 34.9-26 (`34.9-PIPE-PR… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C2-02 — Warning — FIXED — 34.9-25 (conversion) + 34.9-26 (proof) — package.json `buil… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C2-03 — Warning — FIXED — 34.9-25 (conversion) + 34.9-26 (proof) — package.json `buil… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C2-04 — Warning — FIXED — 34.9-27 (package.json wiring pin) — meta/__tests__/verifyRu… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C2-05 — Warning — FIXED — plan 34.16-01, commit `adc648eb6` (2026-08-25), CROSS-PHASE… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C2-06 — Warning — FIXED — 34.9-24 (`resolvedTopLevelTargetExists`) — meta/verifyRunne… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C2-07 — Info — FIXED — quick task 260823-sok (item 19 closed; item opened by plan 34.… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C2-08 — Info — FIXED — 34.9-24 (`result.rejected` assertion) — meta/__tests__/preserv… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: "Either fix the pipe idiom (temp-file the esbuild output and check its own exit code,… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: "A wiring-pin test (C2-04) mirroring cleanDistMac.test.ts's existing package.json ass… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: "Ledger entries for C2-01 through C2-08 in deferred-items.md (or a landed fix), so th… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C3-01 — Warning — FIXED — 34.9-29 (`meta/runTs.cjs`, private-tmpdir compile wrapper) … | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C3-02 — Warning — FIXED — 34.9-30 (`meta/lintTranslations.ts` doc-comment correction)… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C3-03 — Info — FIXED — 34.9-30 (`34.9-REVIEW-SWEEP-CHECK.cjs` polarity deny-list) — l… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C4-01 — Critical — FIXED — quick task 260814-u2u (commit `fdc5b24e7`) + 34.9-32 (`34.… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C4-02 — Warning — FIXED — quick task 260814-u2u (commit `fdc5b24e7`); confirmed live … | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C4-03 — Warning — FIXED — quick task 260814-u2u (commit `fdc5b24e7`, D7 consequence);… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C4-04 — Warning — FIXED — quick task 260814-u2u (commit `fdc5b24e7`); confirmed live … | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C4-05 — Warning — FIXED — quick task 260822-hrf (commit `a850e9d66`), closing item 21… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C5-01 — Warning — FIXED — quick task 260822-hrf (commit `06d7f6555`), closing item 22… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 34.9/deferred-items.md: C5-02 — Info — FIXED — quick task 260822-hrf (commit `b938aaace`), closing item 23 op… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-03-01 — RESOLVED 2026-08-30 (plan 35-24) — was: `meta/i18nForkTouchedFiles.json` i… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: Finding 2 — a dispatched-but-doomed launch produces NO user-visible signal Three distin… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-04-02 — the CrossOver index snapshot is deliberately NOT in `bundle.resources` **F… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-05-01 — RESOLVED 2026-08-29 (the prescribed method was corrected, not followed) — … | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-05-02 — RESOLVED 2026-08-29 (scope corrected to ~48 sites, operator-approved) — wa… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-11-01 — the EOS remove confirmation cannot be app-styled without moving a destruct… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: 4. The REAL open defect, which is a different one The domain-scoped clear is **INCOMPLE… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: 6. Two secondary conflicts, both already-known shapes - Task 1's `generate_handler!` ac… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: Measured design constraints for the re-plan — a naive loop DOES NOT WORK Verified at so… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `legendary/user.ts` throws with a per-domain breakdown → `gamelib.log`. Good. | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `ipcMain.handle('logoutLegendary')` rejects → `window.api.logoutLegendary()` rejects. | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `GlobalState.epicLogout`'s `try/finally` does not swallow — correct — and rethrows. | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `Runner/index.tsx:44`'s `handleLogout` catches it and calls **`console.error`**. | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: **Under Tauri, renderer `console.*` is visible only in the WKWebView inspector.** It re… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: Meanwhile `epicLogout`'s inner `.finally` has already cleared the Epic library state, a… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: **(a) Toast/notification on logout failure.** Cheapest visible signal. Must not itself … | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: **(b) Leave the user signed-IN on a failed clear** — i.e. do not clear `epic` library s… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: **(c) Accept it and say so in the release notes** — the failure is recorded in `gamelib… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-10-01 CLOSED 2026-08-29 — plus a regression the closing work uncovered **Closed by… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-08-02 — a running game ALSO holds a system-sleep assertion, mislabelled as a downl… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: What is genuinely unguarded now - `main.ts`'s registration ORDER for the Steam bottle c… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-18-01 — two pre-existing stale build-flag comments describe removed esbuild mechan… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-19-02 — RESOLVED-IN-PART: sink 2 is ALIVE when packaged; the defect is the 55 `epr… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-19-03 — `startInTray` hides the window AFTER creating it visible, so a "minimised"… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-19-04 — bare `gamelib://` scheme routing does not deliver on the test machine (UNR… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-19-06 — cross-reference: criterion 6 + criterion 10 share a shape Found: 2026-08-3… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-19-10 — the display wake lock is acquired TWICE for one game Found: criterion 15, … | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-19-11 — a "download is in progress" system assertion is held while merely PLAYING … | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-19-12 — CONFIRMED: `powerDisplayId` is never reset, so launcher.ts acquires once p… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-19-13 — startup race: the Epic library refresh always sees "offline" and serves ca… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: **Seeding route — no vehicle exists.** This item prescribed "drive the login webview to… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: **Census route — implemented, and inert.** This item's own text offered the census as a… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `utils.ts` `moveOnUnix`: `const destination = join(newInstallPath, basename(install_pat… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `gog/games.ts:794` `moveInstall` passes that already-complete path straight to `changeG… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `gog/library.ts:891-893`: ```ts if (cachedGameData.install.platform === 'osx') { newIns… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: How it was fixed (`260830-k4m`) Neither of the two routes suggested above was taken, an… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: D-35-ROUTE-01 — ROUTED TO PHASE 39, 2026-08-30: the two red planning gates and `WR-01` … | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `fortnite.com` reads `before total=54` / `after total=54` despite clearing 1. The per-h… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: An external `strings` proxy counted `epicgames.com` occurrences 4 -> 6 **after** the cl… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: product: `post-clear verification — 0 Epic-owned cookie(s) remain across 5 domain(s)` | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: independent index-walking parse of the same jar: **0** Epic-owned live records, 0 by do… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: **0 `__cf_bm` anywhere** — no Cloudflare receipt, so no page load happens in teardown a… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: all four arithmetic reconciliations that the pre-fix run FAILED now hold: jar total 59-… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: not vacuous: BEFORE census measured `matched=8` (pre-fix baseline was 3); all 8 removed | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: no collateral damage: 0 non-Epic records lost; Humble/GOG/Amazon sessions intact **Resi… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: the product's own in-process post-clear census reads `matched=0` on **all five** Epic h… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: the external `strings` read of the same jar says those four names are still there. The … | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: the clear did not actually remove them (cf. [[wry-cookie-delete-lies-about-deleting]] —… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: they were re-created in the ~3s between the clear and the file write. **Caveat on the e… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `{legendary,gogdl,nile}/_internal/Python` — `Python.framework/Versions/3.12/Python` — d… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `{legendary,gogdl,nile}/_internal/Python.framework/Python` — `Versions/Current/Python` … | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `{legendary,gogdl,nile}/_internal/Python.framework/Resources` — `Versions/Current/Resou… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `{legendary,gogdl,nile}/_internal/Python.framework/Versions/Current` — `3.12` — **MISSI… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: 1 — `{cwd: <abs>, name: 'gogLibrary'}` — `<abs>/config.json` — **NO — `undefined`** | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: 2 — `{cwd: <abs>, configName: 'gogLibrary'}` — `<abs>/gogLibrary.json` — yes, incl. dot… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: 3 — `{cwd: 'store_cache', …}` (the literal value all 5 sites pass) — **`<process.cwd()>… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: Production construction sites — **5**, not 4 — plan misses `storeWriteHandlers.ts:364` … | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: Production/type imports — 4 — `electron_store.ts:1`, `cache.ts:1`, `handlers.ts:73`, `c… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: Hook + its docs — 2 — `installElectronHook.ts` (intercepts `electron` **as well as** `e… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: **`jest.mock('electron-store', …)` test files** — **37** — not mentioned by the plan at… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: **Manual mock** — 1 — `src/backend/__mocks__/electron-store.ts` — does `jest.requireAct… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: **Build config** — 1 — `package.json` `build:sidecar` carries `--external:electron-stor… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: **AST gate** — 1 — `sidecar/__tests__/externalDynamicImportGate.test.ts`'s `FORBIDDEN_D… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: Doc comments naming it — ~30 — `storeChangeNotifier.ts`, `fileStore.ts`, `storePolicy.t… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `:2066` — ``clear_all_browsing_data()` MUST NOT appear anywhere in this file` | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `:5742` — `D-08 is non-negotiable on every platform: never clear_all_browsing_data()` | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `:6237` — `never-clear_all_browsing_data() discipline` | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `api.spec.ts` (36 lines) — `renders the first page` — The app boots and the first rende… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `api.spec.ts` — `gets heroic, legendary, and gog versions` — The version-reporting IPC … | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `settings.spec.ts` (67 lines) — `Settings` ×2 — The settings screen against stubbed `le… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `categories.spec.ts` (74 lines) — `categories` — Category/collection management in the … | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `languages_selector.spec.ts` (30 lines) — (language selector) — Language switching thro… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `webview_controls.spec.ts` (81 lines) — `webview` — The webview control surface — the s… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `packagingConfig.test.ts` — symlink plugin (F-34.9-01) — `electron.vite.config.ts` regi… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `artifactTargets.test.ts` — D-11 anti-collateral — `release:{linux,mac,win}` still EXIS… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `artifactTargets.test.ts` — successor — (new) — **ADDED**: the Tauri release path (`rel… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `installFormIpc.test.ts` — D-02 fork gate — `main.ts` AND `steamAuthFlowRegistration.ts… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `removeCopies.test.ts` — seam census — channel present in "all FOUR seam files" — **RE-… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `x64NonGoalSurvivor.test.ts` — category 1 — `electron-builder.yml` x64/win32 refs — **R… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `packagingConfig.test.ts` — 4 describes — `electron-builder.yml` per-platform staging g… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `cleanDist.test.ts` — artifactName pin + wiring pin — `electron-builder.yml` artifactNa… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `gameDetailsImportGate.test.ts` — Gates 5, 5-sanity, 6 — `main.ts` 19-channel delegatio… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `appShellImportGate.test.ts` — Gate 4 — `main.ts` delegates to `appshell/*` — **RETIRED… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `steamAuthFlows.test.ts` — 3 source gates — `main.ts` bottle-channel registration and O… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: dev sidecar spawn — `:6919`, `:6935` — `shell_diag(...)` — YES — stderr AND file | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: **packaged sidecar spawn** — `:6967`, `:6981` — `eprintln!("[shell] ...")` — **NO — std… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `--archive` — OK | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `--compress` — OK | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `--remove-source-files` — OK | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `--no-human-readable` — **REJECTED** | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `--info=name,progress` — **REJECTED** | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `storeManagers/legendary/games.ts:767` — `sendFrontendMessage('refreshLibrary', 'legend… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `storeManagers/legendary/games.ts:1067` — `sendFrontendMessage('refreshLibrary', 'legen… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `storeManagers/sideload/library.ts:77` — `sendFrontendMessage('refreshLibrary', 'sidelo… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `storeManagers/nile/games.ts:512` — `sendFrontendMessage('refreshLibrary', 'nile')` | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: **`sidecar/installedJsonWatcher.ts:86`** — **nothing** | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: epicgames.com — **6** | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: fortnite.com — 0 | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: unrealengine.com — 0 | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: twinmotion.com — 0 | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: metahuman.com — 0 | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: epicgames.com — 3 — **3** — 0 | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: fortnite.com — 1 — **1** — 0 | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: unrealengine.com — 1 — **1** — 0 | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: twinmotion.com — 1 — **1** — 0 | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: metahuman.com — 1 — **1** — 0 | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: flavour detection — `openrsync`, neither rejected flag in the argv (**-07**) | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: exit / `rm -rf` — exit 0, source removed, destination 7368 files / 419M, exe sha256 `36… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: recorded `install_path` — `/Users/graysonmitchell/GameLib/Endless Sky.app` — not double… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: game process — pid 17796, running from `.../GameLib/Endless Sky.app/Contents/MacOS/Endl… | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: gogdl argument — `launch "/Users/graysonmitchell/GameLib/Endless Sky.app"` | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `gamelib-shell.binarycookies` (dev) — 19:27:14 — 19:27:18 — **6** | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 35/deferred-items.md: `com.gamelib.shell.binarycookies` (packaged) — 18:15:15 — 18:17:28 — **7** | un-markable evidence-table row (left open) | 2026-10-16 (v0.8 close) |
| deferred_items | 37/deferred-items.md: From 37-03b (`pnpm test:ci` end-of-wave run, 2026-08-22) 1. **`meta/__tests__/genI18nGa… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 39/deferred-items.md: From Plan 39-02 Two `pnpm test --selectProjects Backend` failures observed while verify… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 41/deferred-items.md: 41-01: `pnpm lint` exceeds its `--max-warnings` ceiling repo-wide - **Found during:** 4… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 41/deferred-items.md: 41-07: pre-existing eslint warning at `meta/lintTranslations.ts:155` - **Found during:*… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 42/deferred-items.md: 42-06: `electronUntouched.test.ts` failure (unrelated to this plan) - **Found during:**… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 44/deferred-items.md: 44-06-01: `meta/__tests__/genI18nGateScope.test.ts` A-17 anti-rot check is red, pre-exi… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 48/deferred-items.md: Found by 48-07 (2026-10-07) - **`src/frontend/screens/Login/__tests__/overlayDismiss.te… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 48/deferred-items.md: Found by 48-13 (2026-10-09) - **`pageScrollDelta` / `canScrollForward` take one click t… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 49/deferred-items.md: Found during 49-09 1. **CLOSED 2026-10-09 during the Phase 49 closure chain's regressio… | acknowledged | 2026-10-16 (v0.8 close) |
| deferred_items | 50/deferred-items.md: 50-05: `pnpm test:ci` full-suite run Observed 2 failing tests in `meta/__tests__/lintTr… | acknowledged | 2026-10-16 (v0.8 close) |

## Session Continuity

Last session: 2026-10-15T08:32:25.000Z
Stopped at: Completed quick task 261015-rud -- live-gated Amazon expiry strings A3/A6 by nile induction
Resume file: None

History: the pre-2026-09-24 Session Continuity narrative lives verbatim in STATE-HISTORY.md § Session Continuity archive.
| 261008-fr3 | **Guarded the `onError` call in `hydrateFocusRowSelection` (WR-03).** The "NEVER rejects" contract rested on one `try/catch` whose `catch` called `deps.onError` unguarded, so a throwing reporter escaped it and turned `GlobalState`'s `void` into an unhandled rejection. The reporter call now has its own `try/catch` with a `console.error` fallback carrying both errors. One test added; mutation-checked (fails with the guard removed, 36/36 with it). WR-03 marked `fixed` in `48-REVIEW-DISPOSITION.md`; todo moved to `completed/`. Fix commit `0cecb87b1`. | 2026-10-08 | COMPLETE. `prettier --check` green on both source paths; suite 36/36. | no quick dir — `/gsd-fast` writes none by design; branch `quick-261002-b63` |
| 261008-ifq | **Fixed the `appShellFlows` `initQueue` call-count flake.** `jest.isolateModules` re-uses the main registry's already-built `initQueue` mock (one `jest.fn` across every "isolated" registration), and two `frontendReady` deliveries ran under REAL timers, each arming a real 5s `initQueue(true)` timer that fired mid-run onto that shared mock. Reproduced deterministically with a 5.2s wait (received 3 = 1 fake + 2 real). Both deliveries now run under fake timers; the detectVCRedist ordering test `mockClear()`s right before `advanceTimersByTime(5000)`. Todo moved to `completed/`. Fix commit `8f1714ee0`. | 2026-10-08 | COMPLETE. Probe with the 5.2s wait 47/47; clean file 3x 47/47; `prettier --check` green; 12/12 planning gates. | no quick dir — `/gsd-fast` writes none by design; branch `quick-261002-b63` |
| 261008-k9p | **Parked the Windows code-signing todo — no certificate yet, by either route.** Operator decision: SignPath Foundation's free programme wants an already-released project with users, and GameLib's only release is still a Draft with no user community, so an application is premature; a paid commercial OV certificate ($150-300/yr plus a USB token or cloud HSM) is declined at this stage. Frontmatter `ready: human` → `blocked`, `status: OPEN` → a quoted PARKED 2026-10-08 line, plus a new `## PARKED 2026-10-08` section recording the decision, confirming Findings 1-4 all stay live for whenever a certificate does arrive, flagging that README.md:197 (GameLib "is applying" to SignPath) now reads ahead of the facts, and giving three unpark conditions. Nothing measured in the file is withdrawn; Windows keeps shipping unsigned and SmartScreen keeps warning, accepted rather than fixed. Commit `86b3150c5`. | 2026-10-08 | COMPLETE. 12/12 `pnpm planning-gates` green, including `todo-frontmatter-gate.py` (16 in-vocabulary pending todos) and `planning-frontmatter-gate.py`; the todo file is prettier-ignored per `--file-info`, so no formatter check applies. | no quick dir — `/gsd-fast` writes none by design; branch `quick-261002-b63` |
| 261010-h9n | **Amazon sign-in probe no longer reads `healthy` with nothing installed (F-49-R1-4, WR-02).** With zero Amazon games installed, nile 1.2.0 `list-updates --json` prints `[]` + `ERROR [CLI]: No games installed`, exits 0 and never reaches an auth call; `classifyNileOutput` had no branch for that text and fell through to `healthy`, so a dead refresh token read as `connected`. Re-measured against the bundled binary with an isolated `NILE_CONFIG_PATH` (exit 0, tab-then-space after the colon, same with or without `installed.json`). New `NILE_NO_GAMES_INSTALLED_MARKER` branch returns `unknown` after the refresh-failure branches (an auth failure still wins) and before `errored`; `healthy` stays last. `nile library sync` NOT adopted as the probe: 49-CONTEXT D-16 forbids the pass triggering a library sync, and the 49-SPEC boundary row gates any replacement command on the Amazon induction live gate (`…amazon-expiry-strings-need-a-real-induction.md`), where that question stays open. Tests pin both stdout/stderr orders, auth-failure precedence, the marker literal and the probe-level outcome. Todo moved to `completed/`; WR-02 `fixed` in `49-REVIEW-DISPOSITION.md`; 49-SPEC `empty` row carries the disposition. Fix commit `268bae390`. | 2026-10-10 | COMPLETE. Mutation check: guard removed -> exactly the 3 new rows fail (3/66); restored -> `src/backend/signInProbe` 191/191. `tsc --noEmit`, eslint and `prettier --check` clean on the 4 source paths; `pnpm planning-gates` 12/12. | [261010-h9n-amazon-sign-in-probe-is-a-no-op-with-not](.planning/quick/261010-h9n-amazon-sign-in-probe-is-a-no-op-with-not/) |
| 261010-ho8 | **Own-property-guarded the renderer `origin` lookup in `mapRefreshOriginToTrigger` (49-REVIEW WR-04).** `ORIGIN_TO_TRIGGER[origin]` was a bare bracket index on a plain object, so a renderer-supplied `origin` of `'__proto__'`/`'constructor'`/etc resolved through `Object.prototype` instead of `undefined`, slipping past the `?? 'startup'` fallback and breaking `currentTriggerLabel()`'s string contract (the keyring gate itself stayed locked — `DELIBERATE_TRIGGERS.has()` already failed closed). Added `Object.prototype.hasOwnProperty.call(ORIGIN_TO_TRIGGER, origin)` before the index, plus a `typeof origin !== 'string'` rejection for the unchecked IPC cast at `steamFlowRegistration.ts:164`, matching the guard pattern already used at `steamFlowRegistration.ts`/`appShellFlowRegistration.ts`/`sanitizeSignInProbeOutcomeMap`. 8 new regression cases (5 inherited names, 1 array-coercion, 2 end-to-end label cases via `noteRefreshTrigger`), RED (8 failing) then GREEN (43/43). Todo moved to `completed/`; WR-04 `fixed` in `49-REVIEW-DISPOSITION.md`. Fix commit `a2f162db0`. | 2026-10-10 | COMPLETE. `pnpm codecheck` exit 0; `prettier --check` clean on both source paths; `pnpm lint` production/tests PASS; `pnpm planning-gates` 12/12. | [261010-ho8-fix-authtrigger-origin-lookup-guard](.planning/quick/261010-ho8-fix-authtrigger-origin-lookup-guard/) |
| 261010-qjs | **Narrowed two `no-base-to-string` sites in the new `applyTracer.test.tsx` so the test-scope lint ratchet holds.** The Phase 45 tracer test shipped with `String(vars[key] ?? '')` in `interpolate()` and `String(el.props.className ?? '')` in `hasClass()`, both over `unknown`; `pnpm lint:tests` read 640 against the 638 ceiling and the pre-push hook refused the 45-commit push. The four other changed test files' warnings were blamed to commits already on `origin`, so the whole +2 was this one file. `interpolate()` now stringifies only string/number values; `hasClass()` compares `className` directly. Ceiling NOT raised. A second hook red surfaced once tests were green: `winetricksApplyGuard.ts:46` carried a `verbs as string[]` that TS 5.8 already narrows via the preceding `every(typeof === 'string')`, a hard `no-unnecessary-type-assertion` ERROR in the production scope; replaced with a `: string[]` annotation. Third red: `find-deadcode` flagged 4 used-in-module exports new on the branch (`WinetricksLogLineKind`, `WinetricksVerbMetadata`, `HIDDEN_CATEGORIES`, `HIDDEN_VERBS`), none referenced outside its own file; dropped `export` on each rather than touching the baseline. Fix commits `9f27123b3` + `b7c162295` + `a1c27c8ff`. | 2026-10-10 | COMPLETE. `pnpm lint:tests` exit 0 at exactly 638; `applyTracer.test.tsx` 3/3; `winetricksApplyGuard.test.ts` 9/9; eslint exit 0 on the guard file; `pnpm codecheck` exit 0; `find-deadcode` used-in-module 0 OK; `src/common/winetricks` 50/50; `prettier --check` green on the 3 paths; `prettier --check` green on the one path (not ignored per `--file-info`). | no quick dir — `/gsd-fast` writes none by design; branch `quick-261002-b63` |
| 261012-9aa | **Live Windows gate for the shortcuts todo; NOT closed, a defect was measured.** The code from `14745f7fa` was exercised on the operator's Windows 11 box through the real `writeWindowsShortcut` (isolated `createFakeHomeProfile()` arm twice, then the named real-profile arm on the OneDrive-redirected Desktop and the real Start Menu, every throwaway `.lnk` read back and deleted). PASS: ANSI titles incl. apostrophe/`ñ`/em dash write to both folders; TargetPath `%SystemRoot%\explorer.exe` + `gamelib://` Arguments; `gamelib` protocol registered HKCU+HKCR; OneDrive Desktop resolved via registry; nonexistent parent and deny-write ACE return `{ ok: false }` with no file. FAIL: any title, target, argument or icon path with characters outside ANSI code page 1252 (`幻想`) is refused or stored as `??`, because `WScript.Shell` converts through the ANSI code page. Todo stays pending with the measurements and a `ready: code` triage hint; `GameSubMenu` optimistic flip still untracked. Gate commit `f76382f6c`. | 2026-10-12 | INCOMPLETE (todo pending: CJK defect). Scoped jest: `addShortcutsOutcome` 4/4; `shortcutsFlows` 30/31 (containment test assumes a fake-home Desktop); `windowsShortcut` 9/10 (test writes a `"` filename, invalid on Windows). `pnpm planning-gates` 12/12. | [261012-9aa-run-the-live-windows-gate-for-the-pendin](.planning/quick/261012-9aa-run-the-live-windows-gate-for-the-pendin/) |
| 261012-9t1 | **Windows `.lnk` writer rewritten on `IShellLinkW`; shortcuts todo CLOSED after a second live gate.** Quick 261012-9aa measured that `WScript.Shell` converts every `.lnk` field through ANSI code page 1252, so a title, target, argument or icon path with `幻想` was refused or stored as `??`. `windowsShortcut.ts` now feeds `powershell.exe` a constant script that `Add-Type`-compiles an `IShellLinkW`+`IPersistFile` helper (`GameLibLnk.Writer.Write`) and calls it with the five `GAMELIB_LNK_*` env values; argv, env passing, timeout, `existsSync` contract and `windowsHide` unchanged. The C# is collapsed to ONE line inside a single-quoted string because `-Command -` reads stdin line by line and silently stops at a here-string opener with exit 0 (measured). `-EncodedCommand` rejected: CLIXML progress noise on stderr. Re-gate on the operator box: isolated fake-profile arm twice, then the real OneDrive Desktop and Start Menu (`GameLib-live-gate-*`, read back by a read-only `IShellLinkW` reader, UTF-16 CJK bytes confirmed, deleted, 0 leftovers). Every previously failing case (I1, I2, I4, D4, D5, D8, R1D, R1M) passes; F1/F2 still `{ ok: false }` with no file. Todo moved to `completed/`, frontmatter byte-identical; new pending todo filed for the `GameSubMenu` optimistic Remove-shortcuts flip (`severity: minor`, `platform: any`, `ready: code`). Operator-only residue: console flash, Explorer icon render, real double-click launch, failure-toast render. Fix commit `a92897514`, todo commit `912b0d522`. | 2026-10-12 | COMPLETE. RED 6 failed/10 passed on the old module; GREEN `windowsShortcut` 16/16 + `addShortcutsOutcome` 4/4 (re-run by the orchestrator: 20/20). `pnpm codecheck`, scoped eslint and `prettier --check` exit 0; `pnpm planning-gates` 12/12; `shortcutsFlows` 26 pass/1 fail (the out-of-scope OneDrive containment test)/4 skipped. | [261012-9t1-fix-the-windows-lnk-writer-so-titles-tar](.planning/quick/261012-9t1-fix-the-windows-lnk-writer-so-titles-tar/) |
| 261012-ca6 | **GameSubMenu flips shortcut state only from the real disk outcome; optimistic-flip todo CLOSED.** `addShortcut` and `removeShortcut` moved from send-kind to invoke-kind at every layer (`ipc.ts`, `menu.ts`, sidecar registration, Electron-era `ipc_handler.ts`) and resolve the `shortcutsExists` predicate after the work settles, so a failed write never shows "Remove shortcuts" and a partial add still does. Logic extracted to `GameSubMenu/shortcutsToggle.ts` (jest has no jsdom); spinner while in flight. `removeShortcuts` now awaits `fs/promises` `unlink`/`rm` (ENOENT = removed, never rejects, so the four uninstall callers are unaffected); remove toast follows the disk answer via new en key `box.shortcuts.error-remove`. The `260905-mv5 (no regression)` test, which wrote to the operator's real OneDrive Desktop, now runs under the containment home. Kind pins updated (`runnerSliceRegistration`, `flowRegistrationCensus`, `invokeReturnValueSweep`). Operator-only residue: live click, spinner/toast render, 60 s invoke-bound rejection in a real shell; darwin-only Describe 5 covered by codecheck only. Commits `f36b7e64f`, `2716f525e`. | 2026-10-12 | COMPLETE. RED before production code in both tasks; GREEN `shortcutsToggle` 9/9, `removeShortcutsOutcome` 4/4, `addShortcutsOutcome` 4/4, `shortcutsExistsFallback` 6/6, `runnerSliceRegistration` 95/95, `flowRegistrationCensus` 72/72, `invokeReturnValueSweep` 7/7; GameSubMenu tests re-run by the orchestrator 39/39. `shortcutsFlows` 30 pass/1 fail (the known OneDrive containment test)/4 skipped. `pnpm codecheck`, `pnpm lint`, scoped eslint and `prettier --check` clean; `pnpm planning-gates` 12/12. | [261012-ca6-close-the-gamesubmenu-shortcuts-todo-fli](.planning/quick/261012-ca6-close-the-gamesubmenu-shortcuts-todo-fli/) |
| 261012-dhs | **Downloads becomes a tier-1 tab; Download Manager rebuilt Steam-style.** User decision reversing navigation-shell.md §6: `NAV_TAB_IDS` is now accounts/games/stores/downloads/settings (`downloads` = `tab-3`, `settings` = `tab-4`), `/download-manager` resolves to `downloads` and collapses tier 2. The navbar `DownloadsRing` (component, scss, two tests, `.NavShell__navRight`) is deleted; its queue subscription lives on in `DownloadsTabIcon`, the tab's icon slot, which renders a count badge while the queue is non-empty; the `nav-downloads` tour anchor moved onto the tab. Download Manager page: new `DownloadHero` with ONE edge-to-edge 6px progress bar at the top, then the current game's artwork (`CachedImage`, mask-faded, scrim in `--body-background`) behind cover, title, type · store, `percent · bytes`, ETA/Paused, the kept speed chart and pause/resume/cancel; the separate `.downloadBar`, the `h4` title, the boxed "Downloading" row and `DownloadManagerHeader` are gone. Queue and finished lists are `dmSection`s ("Up Next" via new `gamelib:downloadManager.upNext`, "Completed") with a 1px separator drawn from `--text-secondary` at 30% (not `--divider`, declared in only 2 of 10 themes). Reversal recorded in sketch-findings §6/SKILL.md. Side effects stated in the commits: the gamelib presence baseline regeneration also recorded 96 `library.tileSize.*` pairs left unrecorded by 261011-t4y (two Meta tests go green); `themeTokens` no-drag floor lowered 2→1; `genI18nGateScope.test.ts` fixture pins re-pinned 207→209 / 249→251. Open: live visual check in midnightMirage, gruvbox_dark and dracula (badge clipping inside MUI's `overflow: hidden` tab, hero scrim readability, bar flush to the window edge, real pause/resume/cancel). Commits `22a5daa2c`, `e5b437090`, `f6c4e02d5`. | 2026-10-12 | COMPLETE (live visual gate owed). NavShell jest 30 suites/600 tests; DownloadManager + cssTokenSweep + shellTokens 67 tests (RED before GREEN on `heroModel`); final sweep NavShell/Dropdown/DownloadManager/GameCard 39 suites/742 tests pass. `pnpm codecheck`, `find-deadcode`, `i18n --fail-on-update`, `i18n-churn-guard`, `lintTranslations`, `hardcodedStringGate`, scoped eslint and `prettier --check` clean; gamelib lint 96 → 0 hard failures. Pre-existing A-17 ANTI-ROT drift (three foreign paths) left as is. | [261012-dhs-downloads-redesign-downloads-tier-1-tab-](.planning/quick/261012-dhs-downloads-redesign-downloads-tier-1-tab-/) |
| fast | **Download Manager speed chart freezes while paused (follow-up to 261012-dhs, found in the operator's live check).** `ProgressHeader`'s sampling interval ran in every non-idle state, so a paused download kept appending 0 MB/s samples and scrolled the trace off the left edge. The effect still takes its one up-front sample on a state change (the visible drop to zero) but only starts the interval while `running`, decided by a new pure `keepsSampling(state)` in `speedSample.ts`; `appendSample` is unchanged. | 2026-10-12 | COMPLETE. DownloadManager jest 4 suites/60 tests (3 new `keepsSampling` cases); `pnpm codecheck`, scoped eslint and `prettier --check` clean. | — |
| 261012-f25 | **In-app Stores tab embed implemented on Windows (WebView2 `add_child`).** `src-tauri/Cargo.toml` gains a `cfg(target_os = "windows")` table enabling tauri `unstable` (Cargo.lock unchanged); all 77 `any(macos, linux)` store-embed gates in `main.rs` widened to include windows, the ten `:unsupported-platform` arms kept only under `not(any(...))`; Windows reuses the macOS `set_position`/`set_size` bounds path (spike 027 measured 0 px error at scale 1.25) and the zero-area guard; `WebView/index.tsx` admits `win32`. `webview.unavailable.platform.body` reworded OS-neutral (kept, since the D-34 deep-link panel shows it on every OS); the stale key deleted from 48 `gamelib.json` + 48 `gamelib.mt.json` (D-09 precedent), presence baseline 864 to 912. Todo re-triaged `ready: live-gate` with an addendum, left in pending/. | 2026-10-12 | COMPLETE (code), verified natively on Windows: `cargo test --bin gamelib-shell` 286 to 313 passed / 0 failed, `store_embed` filter 1 to 26; `cargo check` clean (warnings = baseline), `cargo fmt --check` 0; targeted jest 8 suites green (gate + copy tests seen RED first); codecheck, scoped prettier, lint-translations gamelib, i18n-churn-guard, planning-gates 12/12. OWED: live Windows run W1-W10 (Steam/GOG render, nav, resize), packaged NSIS build, macOS/Linux compile of this change, 38-E01 P1-P5 against the shipped app. Commits 21f99ba7d 35561176e 925962368. | [261012-f25-stores-tab-embed-on-windows-webview2-add](./quick/261012-f25-stores-tab-embed-on-windows-webview2-add/) |
| fast | **Recorded the operator live gate for the Windows Stores embed (follow-up to 261012-f25).** `pnpm tauri:dev` on Windows at `36d88c94d`: W1-W7 PASS (Steam and GOG render, in-embed navigation, drag-resize, Library round trip, GOG -> Epic -> GOG, NavShell popover); Epic shows the panel as expected (D-05). Appended as a dated section to the todo, which stays `ready: live-gate` in pending/. | 2026-10-12 | COMPLETE. `pnpm planning-gates` 12/12. OWED: W8 non-100% zoom, W9 packaged NSIS build, W10 38-E01 P1-P5 against the shipped app. | — |
| 261012-gn8 | **Store embed zoom-aware bounds (W8 fix).** Operator W8 FAIL on Windows at 120% Accessibility zoom: embed displaced, overlapping the grown chrome. Two causes: `useStoreEmbedHost` `flush()` sent CSS px while Rust positions in logical px (all three platforms; logical = CSS x zoom), and `store_embed_open`'s existing-embed branch re-applies the rect on Linux only, so returning from the Accessibility screen kept the 100% geometry on macOS/Windows. New `storeEmbedZoom.ts` (`readWebviewZoomFactor`, `scaleRectForZoom`, non-finite/<=0 -> 1); `flush()` scales open and setBounds payloads; MutationObserver on the root style re-flushes only on a real factor change (the property is published after `setZoom` resolves); one throttled setBounds after every ok open unless disposed. Single call sites for rect/open/setBounds kept; `src-tauri/` and `src/preload/` untouched. Todo records W8 FAIL + fix, stays `ready: live-gate`. | 2026-10-12 | COMPLETE (desk). RED then GREEN both tasks; helper + hook + reloadLoop 3 suites / 63 tests green; 3 mutation runs each turned its pin red; codecheck, `pnpm lint` PASS, scoped prettier, planning-gates 12/12. OWED: live W8 re-run R1-R6 on Windows, macOS/Linux live, window-resized-while-away case. Commits e97265b1c a8e03e290 2f87db8b8. | [261012-gn8-store-embed-zoom-aware-bounds-w8-fix](./quick/261012-gn8-store-embed-zoom-aware-bounds-w8-fix/) |
| fast | **Recorded W8 PASS for the Windows Stores embed (follow-up to 261012-gn8).** Operator, `pnpm tauri:dev` at `47cd338b4`: the embed sits at the slot at 120% and 80% Accessibility zoom. Appended to the todo; the spike 017 1:1 viewport-to-logical finding in `spike-findings-gamelib` (SKILL.md + `references/tauri-embedded-store-browser.md`) now says it holds only at zoom 1. | 2026-10-12 | COMPLETE. `pnpm planning-gates` 12/12. OWED: W9 packaged NSIS, W10 38-E01 P1-P5, macOS/Linux compile and live, the window-resized-while-away case. | — |

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
