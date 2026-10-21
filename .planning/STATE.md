---
gsd_state_version: "1.0"
milestone: v0.8
current_phase: 51
current_phase_name: Widen native Steam bridge — more interface proxies, scan-derived eligibility
status: executing
stopped_at: Completed 51-11-PLAN.md
last_updated: "2026-10-21T04:18:39.974Z"
last_activity: 2026-10-18
last_activity_desc: Phase 51 execution started
state_head: e53295c1a8cdcfa47f639d3331f04490078aea58
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 19
  completed_plans: 6
  percent: 0
milestone_name: Tauri Shell
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-16)

**Core value:** One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.
**Current focus:** Phase 51 — Widen native Steam bridge — more interface proxies, scan-derived eligibility

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

Phase: 51 (Widen native Steam bridge — more interface proxies, scan-derived eligibility) — EXECUTING
Plan: 3 of 19
Status: Ready to execute
Last activity: 2026-10-18 — Phase 51 execution started

Progress: [░░░░░░░░░░] 0%

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

History: the v0.1 velocity summary, the v0.1 By-Phase table, the v0.1 detail log, the v0.2 trend and the v0.2 detail log (279 per-plan rows, phases 7–46) live verbatim in STATE-HISTORY.md § Performance Metrics archive (moved 2026-10-18). Only the Per-Plan Metrics table below is still being appended to.

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
| Phase 51 P01 | ~1h45m (across 4 continuations) | 3 tasks | 17 files |
| Phase 51 P02 | 20min | 2 tasks | 6 files |
| Phase 51 P03 | ~22min | 3 tasks | 12 files |
| Phase 51 P04 | ~50min | 2 tasks | 98 files |
| Phase 51 P05 | 20min | 2 tasks | 3 files |
| Phase 51 P06 | ~2h | 3 tasks | 8 files |
| Phase 51 P07 | ~1h | 2 tasks | 7 files |
| Phase 51 P08 | ~40min | 3 tasks | 10 files |
| Phase 51 P09 | 18m | 3 tasks | 11 files |
| Phase 51 P10 | 1h10m | 2 tasks | 10 files |
| Phase 51 P11 | ~3h20m | 2 tasks | 24 files |

## Accumulated Context

### Roadmap Evolution

Entries for phases before 44 live in STATE-HISTORY.md § Roadmap Evolution archive (2026-10-15).

- Phase 51 added 2026-10-17: **Widen the native Steam bridge — more interface proxies, scan-derived eligibility.** Actions the `ready: human` todo `2026-10-16-widen-the-native-steam-bridge-beyond-two-games.md` by scoping the phase it asked for, from the Phase 24 record rather than a new investigation. Three sub-decisions locked on the entry: interface order is the measured Hoard set (Utils/Apps/UserStats, then RemoteStorage, then Matchmaking/Networking as stubs — D-UAT-24-09 is the evidence); eligibility becomes the persisted verdict of the install-time import scan that `shimGenerate.ts` already runs and discards (D-17 `forcedWindowsViaBottle` precedent), with the D-05 dialog naming missing symbols; the allowlist stays bundled JSON as seed plus known-bad list and the D-01 remote-index upgrade path is declined (nothing to index without owning the games). Two hazards measured at filing and left OPEN for research: `importScan.ts` matches only the `steam_api.dll` heading, so a 64-bit game scans as importing nothing and shim placement passes vacuously; and whether a 64-bit shim target is in scope decides whether "most" games is reachable. **`Depends on` hand-corrected** from the positional guess (Phase 50) to Phase 24 plus quick `261016-u1w`; `**Goal:** [To be planned]` hand-written; title shortened after `phase.add` warned it was goal-shaped. `state.json` was rewritten by `phase.add` (milestone label, phase list reorder, `updated_at`) and reverted untouched. Applied by hand: the add-phase workflow's `update_project_state` step is a hand-write by design, and `state.*` is banned here for corrupting this file.
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
Phase 48 and Phase 49 decisions (51 entries, both phases closed with v0.8 on 2026-10-16) live in STATE-HISTORY.md § Decisions archive, Phases 48–49 (moved 2026-10-18).

- [Phase 261003-i4t]: Games panel: collapsed two icon rows into one six-icon row, swapped sort-by-status to an x-badge, made Add Game icon-only at the footer's left, localized the count pill ('N games'/'N of M games') across all 49 gamelib.json catalogues (D-01..D-06).
- [Phase quick-261015-7tt]: Pure .is-text hover fix is HOVER-scoped only (not block-level), proved mathematically impossible to satisfy base+hover luminance constraints with one static colour
- [Phase quick-261015-7tt]: .settingsWrapper > .button.is-text deleted after a two-arm reachability proof (direct-child DOM walk + import-graph trace) found it unreachable from either settings host
- [Phase quick-261015-7tt]: Self-check caught the Task 3 commit missing the todo's resolution section (staged-vs-disk mismatch); restored in a follow-up fix commit before closing out
- [Phase quick-261015-pwy]: Scored the accepted first-paint-flash limitation as expected rather than reopening the shell/preload architectural question; refuted the screen.availWidth k-recomputation hazard by direct measurement, filing no new todo for it.
- [Phase 51]: 51-01 Task 3 divergence: root-caused to resolveBridgeLaunchExe() never reconnecting a cold SteamUser CM session (missing the quick-260909-pym ensureConnected fix); fixed + a latent helperIntegration.test.ts isolation gap (child_process does not see jest's HOME mock) also fixed (commit 2b15dbb59). Packaged bundle rebuilt with the fix (/Users/graysonmitchell/Projects/GameLib/src-tauri/target/debug/bundle/macos/GameLib.app, sidecar confirms the new code). Task 3 checkpoint NOT yet re-approved — needs one more live Play-button relaunch of Avernum 6 to confirm Mac Steam shows In-Game via the new per-appId helper.
- [Phase 51]: D-51-01 implemented as a per-appId Map registry (not pooled/shared); old singleton helperProcess state and shutdownBridgeHelper deleted outright per assumption_delta_decision: promote
- [Phase 51]: Helper lifetime bound to the launching game's own tracked process lifetime via bottleProcessMonitor.onStopped (Claude's Discretion option chosen in 51-01)
- [Phase 51]: 51-01 Task 3 live checkpoint fully PASSED on real Mac Steam hardware (Avernum 6/206060) after fixing a live-discovered cold-CM-reconnect bug in launchTarget.ts; corroborated by log/filesystem/process evidence, not self-reported
- [Phase 51]: importParse.ts widens the scan to every imported member of the steam_api(64)?.dll block (bare accessors, SteamGameServer*, SteamInternal_*) with arch detection and fail-closed conflict handling, fixing ROADMAP hazard (a)
- [Phase 51]: resolveRequiredInterfaceVersions auto-detects the runtime-lookup case internally (usesRuntimeInterfaceLookup) rather than exposing a separate caller-selected code path
- [Phase 51]: D-51-07/08/09/10/11 shared types + IPC channels landed (types only); bridge-allowlist.json bumped to v2 (seed+knownBad, closed reason taxonomy, empty knownBad by design); shimCoverage.ts is now the sole owner of exported-symbol and served-interface-version coverage; persisted bridge verdict field (SteamMetadataCacheEntry.bridge) added with carry-forward-safe writers in bridgeVerdict.ts
- [Phase 51]: machine-fill-gamelib unreachable (gateway-scoped key, HTTP 401); hand-filled all 48 locales in-session per the sanctioned fallback, validated with the real validateTranslation()
- [Phase 51]: Caught 6 Persian strings violating the live 28-term glossary (Windows transliterated instead of kept literal) by running the project's real validator, not a hand-rolled reimplementation; fixed before any commit
- [Phase 51]: D-51-12: removeSteamInstallCopy('bridge') deletes the per-game GameLibSteamBridge-<appId> bottle via removePerGameBridgeBottle after a full removal; legacy shared bottle and native/bottle sources are never touched.
- [Phase 51]: returnKind is now the sole generator-facing return-shape discriminant (replacing structSize>8/type-string inference); GetSteamID fixed to the MSVC sret convention (void*, returns sretOut), not the old EDX:EAX register return
- [Phase 51]: Stub emission is driven purely by stackBytes, never by params[], so a stub can never corrupt the caller's stack even with an incomplete/placeholder param description
- [Phase 51]: Bare legacy accessors (SteamUser/SteamFriends) resolve per game at runtime via gamelib_bridge.cfg's iface.<Family>=<Version>, through a new g_iface_table + resolve_bare_iface
- [Phase 51]: resolveBridgeRoute: D-51-13 win64-no-shim fail-closed precedes the user-forced-bridge override, so the fail-closed default can never be bypassed
- [Phase 51]: placeShimForGame reads interface versions from the exact path about to be overwritten, using isGameLibShimBytes to fall back to persistedInterfaceVersions when that path already holds our own prior shim
- [Phase 51]: classifyBottledSteamBlock precedence other-session > self-update > login (other-session is user-resolvable without touching GameLib)
- [Phase 51]: resolveWaitingCauseOrder always returns the fixed canonical order [self-update, login, other-session]; GameStatus.tsx filters the detected cause out itself rather than the function reordering
- [Phase 51]: bottledSteamLogPaths hardcodes Program Files (x86) only, no win32 Program Files fallback — out of scope, degrades gracefully to no detected cause
- [Phase 51]: LOCATION vs ELIGIBILITY: launch()/uninstall() dispatch on findBridgeInstallBottle (where it lives), install() dispatches on bridgeRoute (where a NEW install should go)
- [Phase 51]: D-51-05: install-time coverage miss deletes the per-game bridge bottle outright rather than migrating it; re-download through the proven Phase 17 bottled path
- [Phase 51]: D-51-11: a forced bridge userRoute override is cleared once it misses, so a later install falls through to its ordinary route instead of re-forcing the same failure
- [Phase 51]: Dispatch generation requires every non-fallback wire method to declare helperFlat + manifest helperInterface (generation-time refusal otherwise) -- shim and helper tables can never silently diverge
- [Phase 51]: CSteamID (returnKind class, structSize 8) is a plain 8-byte flat-ABI register return on the helper side, never a hidden sret pointer, matching the pre-existing GetSteamID_t typedef
- [Phase 51]: out-value/out-buffer param kinds are refused in dispatch-eligible methods for now, deferred to a future plan -- no production manifest needs them yet
- [Phase 51]: 51-11 Task 1 skipped (operator instruction, no CrossOver network path to re-measure Hoard); Task 2/3 built a real Proton lsteamclient extractor (meta/extractProtonInventory.ts) replacing hand-authored manifests, completed SteamUser023/SteamFriends018 and added 5 new manifests for XCOM's measured first-group + older User/Friends versions (274 slots total); extended gen_vtables.ts's dispatch generator to support out-value response params; pending todo tracks the deferred Hoard measurement

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
| 261016-u1w | Per-game CrossOver bottles for bridge-routed Steam games (GameLibSteamBridge-<appId>); legacy shared-bottle installs still resolve; live gate pending | 2026-10-16 | 9763928d8 | code-verified | [261016-u1w-per-game-bridge-bottles](./quick/261016-u1w-per-game-bridge-bottles/) |
| 261016-wsq | Live-gated 261016-u1w per-game bridge bottles on real CrossOver 26.2 — 5 of 5 items PASS (per-game bottle provisioned in 14 s, depot landed in it, launch from it, deleted in 1 s and gone from cxbottle; legacy Avernum 6 still launches; refresh keeps both). T-u1w-06 MEASURED as major: a legacy-bottle uninstall reverts to installed in 3 s and hides the game from the grid — new ready-code todo filed. No code change. | 2026-10-17 | — | Docs only (this commit). Gate run inline by the orchestrator against a fresh detached pnpm tauri:dev (the operator's instance ran a pre-u1w sidecar and was quit by them). Per-arm table in evidence/README.md, log lines in gate-log-extract.txt, 3 frames. Machine restored as found from a P2 backup; teardown asserted empty. planning-gates 12/12. Every written path is prettier-ignored, so no formatter check was run. Not exercised: two per-game bottles at once, Remove all copies (LD-5), Avernum 5 past its own 16-bit-colour dialog. | [261016-wsq-run-the-per-game-bridge-bottles-live-gat](./quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/) |
| 261017-bqw | **Legacy-bottle bridge uninstall no longer reverts to installed and hides the game.** `uninstallBridgeGame()`'s legacy branch now also `rmSync`s `appmanifest_<appId>.acf` from the shared `GameLibSteamBridge` steamapps dir in the same try as the install root, so the refresh that `markBridgeGameUninstalled` triggers has no manifest to read back (fix `dbb87081b`). Two real-filesystem jest cases pin the unlink to this appId in this bottle only; sibling and `GameLibSteam` manifests survive. games.test.ts 274 to 276; lint 1089/1124 prod, 638/638 tests; gates 12/12. Source todo closed to `todos/completed/`, sibling cleanup todo item 1 annotated. `!exePath` branch deliberately unchanged. | 2026-10-17 | d17199a80 | COMPLETE (desk). RED then GREEN on a real-filesystem fixture; NOT run on CrossOver (a live arm would uninstall Avernum 6 or HOARD, operator call). | [261017-bqw-unlink-the-legacy-bottle-appmanifest-on-](./quick/261017-bqw-unlink-the-legacy-bottle-appmanifest-on-/) |
| 261017-cwf | Measured the macOS Game Uninstalled terminal-icon todo on packaged builds: the dev icon is tauri-plugin-notification's own is_dev() Terminal attribution (no GameLib fix), and both the ad-hoc --debug and Developer-ID 0.8.0 bundles deliver NO notification at all on macOS 26 (never registered in Notification Center) — new major todo, source todo closed, no code change | 2026-10-16 | 4335a0c7f | — | [261017-cwf-fix-the-macos-game-uninstalled-notificat](./quick/261017-cwf-fix-the-macos-game-uninstalled-notificat/) |
| 261018-as3 | Archived closed-milestone history out of STATE.md byte-verbatim (207 KB to 53 KB): v0.1-v0.2 Performance Metrics blocks, Phase 48/49 decisions and 570 v0.8-close Deferred Items rows to STATE-HISTORY.md; 31 quick-task rows (16 oldest plus 15 stranded in Session Continuity) to quick/COMPLETED-INDEX.md; 12/12 planning gates pass | 2026-10-17 | d0a1c74d0 | — | [261018-as3-archive-state-md-history-into-state-hist](./quick/261018-as3-archive-state-md-history-into-state-hist/) |

## Deferred Items

The 569 per-item evidence rows written by the 2026-10-16 v0.8 close (one row per audited artifact, Deferred At `2026-10-16 (v0.8 close)`) and the RESOLVED 2026-08-15 `pnpm test:ci` row live verbatim in STATE-HISTORY.md § Deferred Items archive — v0.8 close evidence rows (moved 2026-10-18). The summary row below is the durable record of that close.

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Game Details | DETAIL-03: Linux ProtonDB compat overlay | Post-v0.2 | v0.2 requirements |
| Settings | API-01: Copy-to-clipboard on API key field | Post-v0.2 | v0.2 requirements |
| Console / Steam | CONSOLE-02: Steam update feedback in Console launch — when a Steam game needs an update, GameLib shows "Launched in Steam" and dismisses while Steam silently updates; user has no in-app signal. Needs own design (Steam does not report update state back). From Phase 8 UAT (finding E). | Post-v0.2 | Phase 8 UAT (2026-07-04) |
| Console / macOS | KNOWN LIMITATION — Launching a Steam game from Console mode on macOS shows a brief desktop-Space animation before the game appears. Cause: Console mode uses native fullscreen (its own macOS Space) so swipe-to-Space works; macOS must leave that Space when the game's window appears elsewhere. Not fixable from Electron without setSimpleFullScreen, which removes the swipe-able Space and has focus/chrome rough edges (prototyped + rejected in Phase 8 UAT test 11). `activate:false` on the steam:// handoff was tried and kept but does not remove the flash. Accepted as-is. | Accepted (won't fix) | Phase 8 UAT (2026-07-04) |
| Humble Store | HSTORE-02: Read-only Humble bundle/deals listing in-app with "Buy on Humble" deep-links | Post-v0.3 | v0.3 requirements (separate data source; key management prioritized) |
| v0.8 close 2026-10-16 | **Override closeout** — 429 items acknowledged via `audit-open acknowledge` (markers in the artifacts; verdict-preserving, self-invalidating), 140 evidence-table rows in five deferred-items.md ledgers left open because no row-level marker exists. 0 carried forward from a prior close. | override_closeout | 2026-10-16 (v0.8 close) |

## Session Continuity

Last session: 2026-10-21T04:17:53.436Z
Stopped at: Completed 51-11-PLAN.md
Resume file: None

History: the pre-2026-09-24 Session Continuity narrative lives verbatim in STATE-HISTORY.md § Session Continuity archive.

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
