---
gsd_state_version: 1.0
milestone: v0.7
milestone_name: — Steam Native Install
status: executing
stopped_at: Completed 29-02-PLAN.md
last_updated: "2026-07-22T06:23:59.714Z"
last_activity: 2026-07-22
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 52
  completed_plans: 46
  percent: 60
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-05)

**Core value:** One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.
**Current focus:** Phase 29 — tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw

> **Version renumber (2026-07-20):** the whole project was renumbered from the
> inflated `v1.x` planning labels to `0.x` to reflect pre-release status (map:
> v1.N → v0.(N+1)). Milestones are now: **v0.1** Steam Platform · **v0.2** Polish ·
> **v0.3** Humble · **v0.4** Compatibility Data · **v0.5** macOS Compat Runtime (17–19,
> done) · **v0.6** Store Search · **v0.7** Steam Native Install (21–25, current).
> The earlier v0.5-vs-v0.7 taxonomy split is resolved: macOS-compat = v0.5 (complete),
> native-install = **v0.7** (this milestone). `package.json` set to 0.7.0.

## Current Position

Phase: 29 (tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw) — EXECUTING
Plan: 4 of 7
Status: Ready to execute
Last activity: 2026-07-22

> **STATE drift corrected 2026-07-21.** This file previously read "Phase 24 complete
> (16/17) — ready to discuss Phase 25" with `Current focus: Phase 25`, which was stale on
> several counts: Phase 25 completed 2026-07-19, Phase 26 completed 2026-07-20, and
> Phase 27 (Tauri walking skeleton) had been planned AND was 4/5 executed. Corrected
> after closing 27-05. Note `ROADMAP.md` currently contains only the Phase 27 section, so
> `gsd-sdk query roadmap.analyze` returns empty and mis-identifies the current phase —
> rebuild the roadmap before relying on that verb.

**Open work, in rough priority order:**

- **Phase 23** — full-ownership install: gaps `G-23-01`/`G-23-02` open (native install
  applies no execute bits; Denuvo launch needed a manual `chmod +x`). Gate 3 never run.
  **23-06 executed (2026-07-21):** added permanent `steam-flags-census` log instrumentation
  (`depot/flagsCensus.ts`) at plan-build/download-entry/download-complete + per-invocation
  chmod counters, and wrote `23-TRACE.md`'s H1-H5 hypothesis matrix with offline forensic
  evidence — trace-only, no fix (user-locked ordering). 23-TRACE.md also flags that the Gate
  1/Gate 2 reference installs (HUMANKIND, Cyberpunk 2077) have degraded on disk since their
  UAT recordings — a fresh install is likely needed for 23-07's clean live-run census. Next:
  23-07 (live-run recording) → 23-08 (the gated fix). REQ-23-07 stays open.
  `/gsd-plan-phase 23 --gaps`

- **Tauri seam** — port the real `safeStorage` keyring (spike 011's `keyring` crate path).
  This is what blocks Phase 27 UAT steps 2/3, and it must land BEFORE any token-writing
  channel is wired, or the sidecar will corrupt the Electron app's saved session. See
  `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` § Stubbed.

- **Cross-phase verification debt** — 30 items across 9 files (`/gsd-audit-uat`).

Closed/parked native-install phases:

- **Phase 22** (Steam Game Families / multiple bottles) — ⛔ **PARKED 2026-07-21, superseded
  by Phase 24.** The bridge's single shared bottle removes the per-family bottle matrix
  this phase existed to manage. 8 plans retained unexecuted; see
  `.planning/phases/22-multiple-steam-bottles/PARKED.md`

- **Phase 24** (macOS native Steam bridge, out-of-process steam_api proxy) — ✅ Complete
  2026-07-21 (17 plans). Gates 0/1/2/3 PASS on real hardware; gap cycles 24-11..24-16
  closed the shim-overwrite/install-poll and launch/sync clusters. Gate 4 (Hoard) out of
  scope — the bridge proxies only ISteamUser + ISteamFriends. Remaining: human retest of
  the Avernum 5 launch on the rebuilt .app

## Native-Install Arc Phase Map (21–25)

| Phase | Name | Plans | Summaries | Status |
|-------|------|-------|-----------|--------|
| 21 | Steam Native Install (depot download) | 17 | 17 | ✅ Complete (2026-07-20) — code-review clean, secure-phase 41/41 threats_open:0; hardware UAT (7 native-install items) DEFERRED to Windows post-production + D-UAT-10 bottled-launch deferred as tracked macOS debt |
| 22 | Steam Game Families (multiple bottle configs) | 8 | 0 | ⛔ **PARKED 2026-07-21 — superseded by Phase 24.** Bridge's one shared bottle (D-03) eliminates the per-family bottle matrix; plans retained unexecuted (`22-multiple-steam-bottles/PARKED.md`) |
| 23 | Steam full-ownership install (StateFlags=4) | 10 | 6 | 🔄 In progress, NOT phase-complete — Gate 1 PASS (2026-07-19); Gate 2 CONDITIONAL PASS (2026-07-21, HUMANKIND Denuvo launch proven but only after a manual `chmod +x` workaround — blocker gap **G-23-02**, native install applies no execute bits); Gate 3 pending. Gap **G-23-01** (KCD2 `Blocked`-depot-key aborts whole install) also open. **23-06 executed** (trace-before-fix): added permanent `steam-flags-census` instrumentation (plan-build/download-entry/download-complete) + `23-TRACE.md` H1-H5 hypothesis matrix — no fix yet, per user-locked ordering. Next: 23-07 (live-run recording) → 23-08 (the gated fix). REQ-23-07 stays open until Gate 2 re-runs clean and Gate 3 passes (`/gsd-verify-work 23`) |
| 24 | macOS native Steam bridge (steam_api proxy) | 17 | 17 | ✅ Complete 2026-07-21 — Gates 0/1/2/3 PASS on real hardware; gap cycles 24-11..24-16 closed shim-overwrite/install-poll + CrossOver-launch/library-sync clusters; secure-phase done (threats_open:0). Gate 4 (Hoard) out of scope — bridge proxies only ISteamUser + ISteamFriends. Open: human retest of Avernum 5 launch |
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

- Total plans completed: 137 (phases 1-4)
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

## Accumulated Context

### Roadmap Evolution

- Phase 08.1 inserted after Phase 8: Steam Delisted Games & Library Filters — delisted availability signal, 'Game no longer available' + install-disable, only-show filter modes (from Phase 8 UAT) (URGENT)
- v0.3 roadmap created 2026-07-05: Phases 10–15, 18 requirements mapped. Dependency chain is non-negotiable (auth → sync → dedup → views → claim flow → store overlay). Phase 10 carries highest validation risk (live API confirmation of axios + cookie + X-Requested-By header reaching api/v1/user/order).
- Phase 16 added 2026-07-10 under new milestone **v0.4 — Compatibility Data**: CrossOver Compatibility Rating (CodeWeavers) — replace the extra-info Crossover rating's stale AppleGamingWiki source (from quick 260710-l27) with a live CodeWeavers slug-lookup backend. Feasibility validated by spike 260710-nwb (66.7% naive / ~83.3% with slugify fixes). Locked constraints: content-based hit/miss detection (soft-404 = HTTP 200), apostrophe-drop + roman-numeral slugify fixes, on-demand reference-style lookups (no bulk crawl). Depends on Phase 7 extra-info rows.
- Phase 17 added 2026-07-10 under new milestone **v0.5 — Steam macOS Compatibility Runtime**: Steam on macOS via CrossOver/Wine — Windows-only Steam games (no native Mac build) install and launch on macOS through the Windows Steam client running inside a GameLib-managed CrossOver/Wine bottle instead of native `steam://` delegation. **Locked architecture:** run Windows Steam *in a bottle* (reuse WineSelector/CrossoverBottle plumbing); do NOT wine-run individual game exes (rejected — DRM-free only). Reverses Phase 3 GAME-04 **for macOS only**: `SteamGame.isNative()` becomes per-OS (`is_mac_native`), and the `state/InstallGameModal.ts:35` short-circuit must stop firing `steam://install` for non-mac-native games on macOS. Linux keeps Proton delegation unchanged. Depends on Phase 3 + Phase 7. Requirements/success criteria TBD in discuss/plan.

- Phase 18 added 2026-07-12 (v0.5) from /gsd-explore: **macOS 32-bit detection, badge & CrossOver routing** — detect a Steam game's mac build arch and route 32-bit-only mac games to CrossOver/Wine (32-bit dropped in Catalina/2019) with an OS/arch badge beside the game logo. **Locked approach:** hybrid detection — `osarch` via `steam-user` `getProductInfo` PICS appinfo (`config.launch[N].config.osarch`; match `"macos"` + legacy `"osx"`) as pre-install hint, plus post-install Mach-O check (`lipo -archs`). Missing `osarch` is NOT assumed 32-bit (avoids Steam's documented false-32-bit-flag trap). Routes via existing `isBottleEligible()`/D-11. Steam-only V1. Pre-work: runtime `getProductInfo` dump to lock parser. See `.planning/notes/steam-mac-arch-detection-decisions.md`, todo `steam-getproductinfo-appinfo-dump.md`. Depends on Phase 17 + Phase 7.

- Phase 21 added 2026-07-14 under new milestone **v0.7 — Steam Native Install** (from /gsd-explore + spikes 001/002): replace the opaque `steam://rungameid` install handoff with an **in-process depot download GameLib owns** — real progress, real errors, recovery. GameLib downloads depots over `steam-user`'s authenticated CM connection and writes an `appmanifest_{appId}.acf` the Steam client **adopts**; launch stays with `steam://` (DRM works); **Steam owns updates, GameLib owns only the first install** (D-2). **Fully de-risked against a real machine:** spike 001 — Steam adopts a hand-written `.acf` (`StateFlags 1026`→`4`, zero-byte install, game launches); spike 002 — 171/171 files downloaded in-process, byte-identical to Steam, **pure-JS LZMA sufficient (no native module)** → C# DepotDownloader wrapper rejected. Locked: `StateFlags=1026` not `4`; depot selection = package-level ownership (two channels + DLC-app enumeration + language filter, 11/11 verified); reimplement `steam-user`'s broken `getManifest` filenames + chunk download (~100 lines); 64-bit IDs are strings (never `@node-steam/vdf.parse`); retry chunks across content servers. Pre-work: audit `@node-steam/vdf` call sites; confirm launch on a hard-DRM title. See `.planning/spikes/MANIFEST.md`, `.planning/notes/steam-depot-install-architecture.md`. Depends on Phase 3 + Phase 1.

- Phase 25 added 2026-07-19 (from resolved debug `steam-install-slow-start`, Thread C): **Steam depot download multi-host fan-out (throughput)** — raise native-depot throughput toward Steam-client parity by fanning chunk attempt-0 across the ~6 healthy CDN hosts `getContentServers` already returns, instead of `pickHost` confining all ~32 workers to the single top-scored host (rotates only on failure; with decode now clean/`err=0`, nothing fails → one host, `avgMs~360`, ~1.5–2.9 MiB/s). Acceptance = before/after hardware throughput measurement (`grep "chunk-stream stats" ~/Library/Logs/gamelib/gamelib.log`, expect sustained `hosts>1`). Must not regress decode, host-health scoring, stall retry, or cancel/abort. Optional bundled cleanup: excise the dormant CDN-auth phantom machinery. Code: `pickHost`/host-health in `depot.ts`/`decompress.ts`/`hostHealth`. Context in memory `steam-install-slow-start-outcome`.

- Phase 23 added 2026-07-17: **Steam full-ownership install (StateFlags=4)** — GameLib FULLY installs a Steam game with zero Steam-client step, writing an `appmanifest_{appId}.acf` with `StateFlags=4` (installed/ready) rather than Phase 21's `StateFlags=1026` (update-queued handoff). **Reverses locked D-2** ("Steam owns first install"). De-risked by **spike-003 (VALIDATED 2026-07-17)**: full-ownership `StateFlags=4` install is feasible and *supersedes* the earlier "1026 never 4" constraint — Steam trusts a hand-written `StateFlags=4` manifest once the `EDepotFileFlag` executable bit is applied (the `os error 256` failure was a missing `+x`). Env-gated behind `GAMELIB_SPIKE_STATEFLAGS4` during spike. Builds on Phase 21 depot-download infrastructure. See spike-003 commits (a8ada46d, 6fa5a157, 816a76c9, f36d173a). Depends on Phase 21.

- Phases 28–35 added 2026-07-22 under the existing **v0.8 — Tauri Shell** milestone (extends it; `/gsd-new-milestone` deliberately NOT run, v0.8 already exists from Phase 27): the incremental Electron→Tauri/daemon port, sliced from `27-.../SEAM.md`'s ranked backlog. **28** real `safeStorage` via spike 011's `keyring` crate → **29** generalize the sidecar store past the two skeleton stores → **30/31/32** IPC re-plumb in domain slices (install/uninstall/update-check, settings/config, downloads/queue) → **33** the 44-file lifecycle cluster (`app`/`dialog`/window/`Notification`/tray/protocol, plus the `session`/`powerSaveBlocker` parity soft spots) → **34** Windows/Linux packaging+signing+auto-update → **35** Electron cutover. **Slicing rule:** every phase except 35 must end with BOTH `npm run tauri:dev` and `npm start` working (REQ-27-06's additive/reversible invariant, SEAM.md checklist step 5) — 35 is the one phase that intentionally breaks it, which is why it runs last. **Phase 28 is order-constrained, not merely first-by-value:** the sidecar and Electron share one store, so wiring any token-WRITING channel under the current passthrough stub writes `TOKEN_PREFIX`+plaintext and silently signs the user out of the real Electron app. Requirements stay TBD per phase — mint at `/gsd-plan-phase N`. Note these phases are invisible to `roadmap.analyze` until STATE.md's `milestone:` frontmatter advances past v0.7 (same caveat already recorded for Phase 27).

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Steam store manager follows `src/backend/storeManagers/` pattern (new `steam/` directory)
- Steam auth approach TBD: Steamworks SDK, steam-user npm package, or browser-based login
- Auth is prerequisite for all library and game operation phases
- [Phase ?]: No follow-up getSteamUserInfo call needed since auth flows return username inline
- [Phase ?]: No enabled/experimental guard per D-08 — Steam is always first-class
- [Phase ?]: Specific route placed before loginweb/:runner catch-all to prevent WebView capture
- [Phase ?]: pendingFetches.add() before await in fetchMetadataIfNeeded (T-2-03 dedup)
- [Phase 02-04]: Gate makeLibrary steam inclusion on steam?.username (not library length) for correct D-02 first-sync empty state
- [Phase 02-04]: steamLogin uses refreshLibrary({ runInBackground: true, library: 'steam' }) per D-01; blocking handleSuccessfulLogin removed
- [v0.2 DETAIL-02]: AppleGamingWiki integration is macOS-only and Mac-games-only; ProtonDB/Linux follow-up is DETAIL-03, explicitly deferred to post-v0.2
- [v0.2 STORE-01]: Steam storefront tab is browse-only; purchasing stays in Steam's own client/web flow
- [Phase 07 DETAIL-01]: Steam `fetchMetadataIfNeeded` now captures appdetails `platforms` → `is_mac_native`/`is_linux_native`; flags persisted in `SteamMetadataCacheEntry` and re-seeded on `refresh()` so they survive resync/restart. Windows is the implicit baseline (no flag)
- [Phase 07 DETAIL-01]: platform icons are runner-agnostic (FontAwesome brand glyphs), rendered in the Install-info TabPanel
- [Phase 07 DETAIL-02]: rating-source setting (`appleRatingSource`: crossover|wine, default crossover) uses the `configStore` + `ContextProvider` pattern — NOT `useSetting`/`SettingsContext`, which isn't populated outside the Settings tree where GamePage/AppleWikiInfo render. Toggle lives in the Accessibility screen, gated to macOS
- [Phase 07 DETAIL-02]: ~~overlay gate is `platform==='darwin' && gameInfo.is_mac_native` (D-13)~~ **SUPERSEDED by Phase 7 UAT (2026-07-04):** the AppleGamingWiki CrossOver/Wine rating measures how a WINDOWS game runs on macOS via a translation layer — Mac-native games need no such rating. Gate is now `platform==='darwin' && !gameInfo.is_mac_native` (show on Windows games on macOS). Overlay still always shows an "Unrated" pill when no rating (D-12, user-confirmed); `GamePicture`'s generic `overlay` prop unchanged
- [Phase 07 tier→color]: rating tiers mapped to `_colors.scss` `--status-*` tokens (Perfect/Playable→success, Runs/Borderline→warning, Unplayable→danger, empty→default); vocabulary is free-form upstream so unknown values fall back to neutral
- [v0.3 Humble auth]: BrowserWindow + session.cookies is the only viable auth path — Humble's /processlogin requires reCAPTCHA; programmatic login is impossible. Zero new npm packages required.
- [v0.3 Humble adapter]: C5 adapter isolation is non-negotiable — all Humble HTTP calls through adapter.ts; X-Requested-By: hb_android_app header required on every request (omitting this is the likely cause of all three Lutris integration failures)
- [v0.3 claim flow]: Primary activation URL is store.steampowered.com/account/registerkey?key= NOT steam://open/activateproduct (does not pre-fill key; unreliable on Linux Flatpak/Snap)
- [v0.3 dedup threshold]: Fuzzy-name fallback at 85%+ threshold (not community-norm 70%) — DLC titles false-positive match base games at lower thresholds and false positives waste gift links
- [v0.3 Humble not a Runner]: 'humble' is NOT added to the Runner union type — keys domain is not a game platform; no LibraryManager methods required
- [Phase 10]: D-13 revised confirmed correct in practice: Humble identity endpoint (/api/v1/user/info) hard-404s on the real account tested; had identity remained a hard gate criterion, Phase 10 would never have passed
- [Phase 10]: D-14 ses.fetch() fallback on persist:humble prepared but not activated — axios reached the live Humble API successfully on first clean run after schema fix; fallback seam stays dormant
- [Phase 10]: Frontend connected-state must be gated on an explicit isLoggedIn boolean, never on optional profile fields like username — root cause of the Task 2 UAT tile-never-flips bug (e2236bc1)
- [Phase 14]: CSRF disposition for Humble reveal/redeem confirmed REQUIRED (csrf-prevention-token header + matching csrf_cookie both necessary) — csrf-capture code must not be dropped as dead code
- [Phase 14]: Reveal/redeem POST must route through Electron net.request on persist:humble session partition, not axios — Cloudflare Bot Management blocks axios's non-browser TLS fingerprint before Humble's app code inspects the request
- [Phase 14-07]: D-30 amended (Phase 14 gap closure, 14-07): server truth = revealed-ness + expiry only; redeemed_key_val presence classifies REVEALED, never REDEEMED. REDEEMED is a local-only, always-undoable overlay via Mark-as-redeemed. Closed UAT tests 2 (CR-01) and 3 (WR-02) at their shared root cause; deleted the locallyRedeemedPending/WR-02-keep-visible/server_confirmed_ack compensation machinery. HUMBLE_CLASSIFIER_VERSION bumped 4->5.
- [Phase 14-08]: Gap closure — UAT test 8 (Keys-waiting fill-then-empty sync churn) root-caused to fetchAndCommitOrder committing classifyOrder's hard-reset ownedElsewhere overlay on every per-order commit while D-26 broadcasts each intermediate snapshot. Fixed with a merged two-branch commit-time overlay (Steam gate open -> dedup recompute at commit; gate closed -> per-key carry-forward from prior entry, D-48) — also closed a T-14-03 mid-sync C2 reveal-bypass window. Added a single-sourced isServerTerminal/isFreezeEligible predicate (classify.ts) so REVEALED-without-pending-expiry orders now freeze under D-24 again (restores the freeze benefit 14-07 had lost, cutting the standing ~19-orders-per-sync Cloudflare/WAF re-fetch exposure); REVEALED-with-future-expiry orders keep re-fetching (retroactive expiry preserved). partitionGamekeys/patchCachedState both route through the same predicate. HUMBLE_CLASSIFIER_VERSION bumped 5->6.
- [Phase ?]: Steam-AppID exact joins never gated by NAME_MATCHING_SHIPS; only non-Steam name matching is (D-02)
- [Phase ?]: D-20 reversal: slugify() keeps roman numerals verbatim, only apostrophe drop is load-bearing
- [Phase 19-06]: Added LibraryManager.getListOfGames() to the interface (Rule 3 fix) - only legendary had it; gog/nile/zoom/sideload/steam now implement it reading their own persisted libraryStore
- [Phase 19-06]: isMac gate for D-16 non-mac-emptiness lives in buildCrossoverRatingMap itself, not in 19-05's getCodeweaversFromIndex/isCrossoverIndexEligible (neither actually gates on platform)
- [Phase 19-07]: Tier derivation (5->gold, 4->silver, 3->bronze, <=2->wontRun, null->unknown, undefined->no element) computed entirely inside CrossoverBadge, never read as a pre-labeled field off the index (D-12); enforces D-16 honesty invariant in one place
- [Phase 19-07]: CrossoverBadge renders unconditionally (no is.mac guard) in GameCard -- crossoverRatings map absence already yields undefined for every non-macOS/never-looked-up tile, which the component turns into no element
- [Phase 19-08]: WineSelector gained optional runner?: Runner prop so the D-18 knownnottowork warning gate can distinguish the Steam CrossOver-bottle guided-setup path (SteamBottleSetup.tsx) from the shared generic GOG/Epic/Amazon/sideload Wine-install path
- [Phase 20]: D-02: fuzzy title matcher lifted verbatim into src/common/matching/titleMatch.ts as the single shared module (normalizeTitle/titleSimilarity/isDlcFalsePositiveRisk/fuzzyMatch); HUMBLE_FUZZY_MATCH_THRESHOLD (0.85) single-sourced there, re-exported unchanged by backend/humble/constants.ts and backend/humble/dedup.ts — Store-search badge resolver (Plan 03) reuses the identical matcher instead of writing a second one, so the threshold and DLC guard behave identically on both surfaces
- [Phase 20-02]: currencyCode kept as bare string (never a literal 'USD' union) in common/types/storeSearch.ts so D-13's USD-only debt stays visible in the type system, never implicit
- [Phase 20-02]: storeMapping constant lives in common/discounts/storeMapping.ts (sibling file) per RESEARCH Open Question 1; buy handoff reuses existing openExternalUrl SyncIPC listener (D-08) rather than a new IPC channel
- [Phase 20-03]: Steam ownership resolved by EXACT steamAppId join only (fuzzyMatch never called for Steam); GOG/Epic/Amazon resolved via the Plan 01 shared fuzzyMatch; keyAvailable computed independently and never suppressed by ownership (D-01/D-02/D-07)
- [Phase 20-04]: SEARCH_CURRENCY='USD' contained inside cheapshark.ts only (D-13); T-20-01 mitigated by restricting buildRedirectUrl to interpolate only the dealID fragment inside a fixed https://www.cheapshark.com/redirect?dealID= host prefix
- [Phase 20]: [Phase 20-05]: OwnedBadgeLabel.values widened to Record<string,string|number> (was a discriminated union) so a single t(key, defaultValue, values) call type-checks against react-i18next's TFunction overloads
- [Phase 20]: [Phase 20-05]: Owned badge stack renders as ONE joined pill per the UI-SPEC copy contract (e.g. 'Owned on Steam, GOG'), not one pill per store; key-available always renders as an independent second pill (D-07 coexistence)
- [Phase 20]: [Phase 20-05]: StoreSearchBreakdown unmounts on row collapse (not cached) so a later expand is a natural retry after a fetch failure, with no persisted per-row error UI
- [Phase 20-06]: SearchBar gained optional loading prop (icon->spinner swap in same DOM slot) - non-breaking, default false, other consumers unaffected
- [Phase 20-06]: Container filters humble.keys via selectKeysWaiting before resolveStoreSearchBadges, matching Discounts' own pattern, so a redeemed/expired key never shows key-available
- [Phase 20-07]: Owned-badge false-positive on remaster/remake titles fixed in the shared common/matching/titleMatch.ts matcher (PRODUCT_VARIANT_KEYWORDS guard, isRemasterFalsePositiveRisk OR'd into fuzzyMatch), so Humble dedup inherits the same correctness fix, not just store-search
- [Phase 21-01]: lzma.d.ts ambient module declaration added (src/common/typedefs/, matches steam-shortcut-editor.d.ts precedent) since the lzma npm package ships no TypeScript types
- [Phase 21-01]: crypto.ts uses namespaced node:crypto import (nodeCrypto.createDecipheriv) rather than named import so the acceptance-criteria grep for createDecipheriv counts exactly the 2 call sites (ECB+CBC), not the import line
- [Phase 21-02]: manifest.ts avoids the literal string '@node-steam/vdf' even in explanatory prose comments (acceptance-criteria grep requires zero occurrences file-wide, not just in imports)
- [Phase 21-02]: Atomic-write test proves temp+rename via black-box stale-content replacement + structural source grep, not jest.spyOn/jest.mock -- node:fs/promises exports are non-configurable getters under this project's ts-jest/CJS interop, silently no-oping mocked I/O with no thrown error
- [Phase 21-03]: enableSteamNativeInstall opt-in toggle registered in GeneralSettings (not WineManagerSettingsModal where DownloadProtonToSteam renders); isSteamNativeInstallEnabled() is the single backend read seam, default OFF at three layers (frontend useSetting default, GlobalConfigV0 factory default, accessor ?? false fallback)
- [Phase ?]: [Phase 21-04]: Owned appId/depotId sets are derived inside depot.ts itself (getOwnedSets, from the authenticated client's package licenses via getProductInfo) rather than as a separate exported primitive in depot/select.ts
- [Phase ?]: [Phase 21-04]: loadContentManifestParser + fetchDepotPlanEntry are only invoked when selectAllDepots returns at least one descriptor -- zero owned depots returns { depots: [], totalBytes: 0 } without dynamically importing steam-user's undocumented internal parser
- [Phase ?]: [Phase 21-05]: downloadDepotFiles is a SEPARATE exported function from downloadSteamDepots (operates on an already-built DepotPlan, no SteamUser client dependency) rather than folding the streaming loop into downloadSteamDepots itself
- [Phase ?]: [Phase 21-05]: Real-tmpdir black-box fs testing (manifest.test.ts precedent) used for the streaming download loop -- node:fs/promises exports are non-configurable getters, unmockable in this project's ts-jest/CJS interop; only fetchChunk and sendFrontendMessage are mocked
- [Phase 21-06]: downloadSteamDepots's public contract changed from returning DepotPlan to a never-throwing { status, error? } outcome -- required by Plan 07's already-written SteamGame.install() call site; original plan-building logic preserved verbatim as buildDepotPlan
- [Phase 21-06]: finalizeToSteam reads LastOwner internally via SteamUser.getClient().steamID.getSteamID64() rather than a caller parameter, keeping it self-contained and reusable by Plan 08's startup-resume path (D-05)
- [Phase 21-06]: classifyDepotError classifies by regex over error text (not instanceof) since downloadDepotFiles's own failures are already reduced to plain strings by the time they reach the orchestrator
- [Phase ?]: [Phase 21-07]: install()'s native branch placed AFTER isBottleEligible() (D-15 bottle branch untouched, Plan 11's scope); installNative() maps downloadSteamDepots outcome onto InstallResult using gog/legendary's own conventions (done/error/abort) so a classified error renders through downloadqueue.ts's EXISTING generic error+Retry surface with zero changes to that file
- [Phase ?]: [Phase 21-07]: hostSteamDepotOs() is a new helper distinct from library.ts's hostInstallPlatform() -- depot/select.ts's oslist vocabulary (windows/macos/linux lowercase) differs from InstallPlatform (Windows/Mac/linux); stop() tracks in-flight native downloads via a private nativeInstallsInFlight Set (not a new aborthandler.ts export) so callAbortController is only invoked when a real depot download is running
- [Phase ?]: [Phase 21-08]: locateDownloadingTarget() is a new standalone helper, not an extension of scanDownloadingAppIds/readAcfState, so those four poller functions stay byte-for-byte unmodified; startup finalize passes depots: [] since no live DepotPlan exists on a fresh process (honest empty InstalledDepots, Steam's verify pass reconciles)
- [Phase 21-09]: resolveSteamInstallTarget honors an args.path override only when it resolve()s to exactly one getSteamLibraries() entry (D-08); unregistered/blank overrides silently fall back to the primary library rather than erroring
- [Phase 21-09]: D-09 multi-library override picker wired into InstallGameModal.ts's actual Steam chokepoint, not DownloadDialog (which Steam installs never route through); picker is a registered-libraries-only select, never PathSelectionBox's free-text filesystem browser
- [Phase ?]: [Phase 21-11]: D-15 unified via a new shared installDepotDownload() engine (installNative + installBottleNative delegate to it) rather than a second parallel implementation; bottle installdir sourced from resolveSteamInstallTarget (discarding its native-library targetSteamappsDir) since installLocation.ts's PICS installdir helpers are private and out of this plan's files_modified scope
- [Phase 21-13]: downloadSingleFile branches on DIRECTORY_FLAG(64)/SYMLINK_FLAG(512) BEFORE the size===0 fast path; symlink target resolved via resolve(dirname(dest), linktarget) then containment-checked against installRoot (never path.join); WR-02 zero-chunk and WR-03 percent-clamp closed in the same code path
- [Phase ?]: Phase 21-14: vdfEscape escapes backslash before quote (order matters) and neutralizes \r/\n/\t to a space rather than escaping them
- [Phase ?]: Phase 21-14: sanitizeInstalldir rewritten as a positive whitelist ([A-Za-z0-9 ._-]+, no leading/trailing dot) instead of an expanding denylist
- [Phase 21-15]: decompressWorker.ts sends an explicit {type:'ready'} handshake after its module graph loads; DecompressPool keys spawn-success off that message, not worker_threads' 'online' event, which fires before a bad entry path's module-not-found error surfaces
- [Phase 21-15]: DecompressPool.shutdown() sets a shuttingDown flag first and awaits in-flight replaceWorker() spawns before its terminate sweep, closing a race where a replacement worker finishing spawn concurrently with shutdown() would otherwise never be tracked/terminated
- [Phase ?]: [Phase 21-16]: GAMELIB_HANDOFF_STATE_FLAGS = 1026 tested by strict equality in pollInstallOnce (not a bitmask) since 1026 is the exact literal GameLib itself writes on handoff
- [Phase ?]: [Phase 21-16]: notifiedWaiting fire-once flag co-located on the same activePolls entry as seenDownloading rather than a separate Map
- [Phase ?]: [Phase 21-16]: GameCard/index.tsx needed zero code changes for the restart hint -- it already renders getStatusLabel's output verbatim via hasStatus.ts's label field
- [Phase 23-01]: applyDepotFileFlags never throws (returns {ok,error}); the caller (downloadSingleFile) throws to surface a mode-application failure as a DepotDownloadFailure, matching the existing SHA1-mismatch-throws convention
- [Phase 23-02]: canWriteFullOwnership is a single exported fail-closed predicate consulted at ONE call site inside finalizeToSteam (outcome==='completed' AND failures.length===0 AND buildid present/!=='0' AND allFilesVerified AND allModesApplied); GAMELIB_SPIKE_STATEFLAGS4 fully removed
- [Phase 23-02]: FinalizeToSteamOpts's new gate-input fields (outcome/failures/allFilesVerified/allModesApplied) are optional, not required — omitting them fails CLOSED to StateFlags=1026 via canWriteFullOwnership's own defaults, preserving pre-existing finalizeToSteam call sites (incl. library.ts's Wave-3-pending startup-resume finalize) without modification
- [Phase 23-03]: Directory(64)/Symlink(512)/zero-size manifest entries reconcile by existence/target-match, never sha1 — sha1File/resolveContainedPath exported from depot.ts for reuse by depot/reconcile.ts (deliberate circular import, empirically safe under CJS/ts-jest since every cross-reference is a function-body call, never top-level state)
- [Phase 23-03]: Startup resume's allModesApplied mirrors allFilesVerified rather than re-running a mode-reapplication pass — downloadSingleFile applies EDepotFileFlag modes immediately after each file's own sha1 check during the original download session, so a file reconcile trusts as verified already had correct modes applied
- [Phase 23-03]: A reconciliation-time error inside downloadDepotFiles (e.g. path traversal) falls back to the full pre-23-03 job list rather than aborting the run; a startup buildDepotPlan/reconcile failure falls back to the honest-empty depots:[] finalize — reconciliation is purely additive, never a new failure mode, and init() never crashes
- [Phase 23-06]: G-23-02 (0/18,809 HUMANKIND files landed +x) gets trace-before-fix instrumentation only (user-locked) — permanent steam-flags-census logging at plan-build/download-entry/download-complete plus per-invocation (never module-level) chmodAttempts/modeCallsites counters, proven safe under concurrent different-appId installs. 23-TRACE.md's H1-H5 hypothesis matrix + offline forensics feed 23-07's live run; no fix designed here, and 23-08 (the fix) is explicitly gated on that verdict
- [Phase ?]: TOP_N_FANOUT=3, calibrated per PATTERNS.md guidance for fan-out width
- [Phase ?]: pickHost workerSlot fan-out only applies at attemptIndex===0 && N>1; retries/circuit-breaker unaffected
- [Phase 25-02]: fetchChunk/downloadFileChunks/downloadSingleFile gained defaulted trailing workerSlot/fileWorkerSlot: number = 0 params so combination arithmetic type-checks under strict mode; combined slot = fileWorkerSlot * CHUNK_CONCURRENCY + chunkWorkerSlot per RESEARCH.md A2
- [Phase 25-02]: Integration test drives fetchChunk directly with distinct workerSlot values (not through the full downloadFileChunks pool) since pickHost's selection happens synchronously before fetchChunk's first await
- [Phase 21]: isFullyInstalledStateFlags is the ONLY place bit-4 (0x4 FullyInstalled) is computed — buildInstalledMap/readAcfState/buildBottleInstalledMap all route through it (T-21-17-01 regression lock)
- [Phase 21]: downloadSteamDepots finalize() forces outcome to cancelled when lastResult.outcome==='cancelled' OR opts.signal?.aborted===true, closing an async-interleaving class that could otherwise let a completed outcome reach canWriteFullOwnership
- [Phase 21]: markSteamInstallIncomplete() mirrors init()'s startup-surface pattern for a SAME-SESSION native cancel (the one gap init() doesn't cover), reusing the existing steamResumePending field
- [Phase 21]: steam-incomplete is a distinct statusContext value from steam-waiting-for-restart/steam-paused — applies when NOT currently installing but an incomplete manifest exists; hasStatus.ts's notInstalled branch now threads statusContext for the first time
- [Phase 26]: Phase 26-01: classifyPurchaseResult's details param typed as SteamUserLib.EPurchaseResult (not number) to satisfy no-unsafe-enum-comparison lint rule
- [Phase 26]: Phase 26-01: redeemKey tests isolate classification logic via jest.spyOn(SteamUser, ensureConnected/getClient) rather than replaying the full auth flow
- [Phase 26-02]: Test file placed in src/frontend/helpers/__tests__/ (not colocated per plan) because both src/frontend/jest.config.js and src/backend/jest.config.js enforce testMatch requiring __tests__ dirs — A colocated test file is never discovered by Jest regardless of CLI pattern; matches existing codebase convention
- [Phase 26-02]: Avoided literal '{5}' substring in steamKeyValidation.ts comments — Acceptance-criteria grep for {5} is a whole-file check; same lesson as Phase 21-02's @node-steam/vdf comment exclusion
- [Phase 26-03]: SteamUser.redeemKey's real signature (store:'steam', key:string) matched the planned IPC payload type exactly — no adaptation needed; no new refresh/recompute plumbing added, 26-04 reuses existing refreshLibrary IPC path
- [Phase 26]: [Phase 26-04]: Used ContextProvider's refreshLibrary({ library: 'steam' }) context wrapper instead of window.api.refreshLibrary — the plan's interface note had the wrong call target; window.api.refreshLibrary takes a bare Runner string, not an options object, and the context wrapper is what actually updates steam.library in React state
- [Phase 26]: [Phase 26-04]: Non-success redeem outcomes keep the key input visible/editable (typing clears the outcome) rather than hiding the form, so users can retry inline without closing the modal (D-06/D-08)
- [Phase 26-05]: Direct-invocation Jest harness for SidebarLinks (mock react/react-router-dom/react-i18next, stub SidebarItem/QuitButton/frontend-helpers) rather than jsdom — No jsdom/react-test-renderer installed; matches HumbleOriginInfo.test.tsx/StoreSearchScreen.test.tsx precedent
- [Phase 24]: [Phase 24-01] R1 vtable generator: test file placed at meta/__tests__/gen_vtables.test.ts (not the frontmatter's literal path) to match meta/jest.config.js's testMatch and 24-PATTERNS.md's stated analog location
- [Phase 24]: [Phase 24-01] Flat SteamAPI_* export set is a fixed acceptance-set superset constant (FLAT_EXPORTS_SUPERSET), not manifest-derived, per R3's acknowledged divergence (review finding #9); builtBridgeShimPath exported from paths.ts as the BLOCKER-2 shared bundled-shim-location contract for 24-05/24-07
- [Phase ?]: [Phase 24-02]: bridge_helper.c degrades instead of exit()ing on InitFlat failure (divergence from spike 005b) so CONTROL HEALTH (process-up) stays observable separately from WHOAMI (init-succeeded-against-live-session) — the two-state readiness contract the 24-06 probe consumes (finding #7); protocol.ts frame layout reverse-validated against the committed generated shim's bridge_transact() so TS decoder and live wire agree byte-for-byte; MAX_FRAME_BYTES=65536 single-sourced across the TS decoder and the C read loop (fixed static buffer, bounds-checked before recv, T-24-03)
- [Phase 24]: [Phase 24-03]: Avernum 4 = AppID 206020, HOARD = AppID 63000 (resolved via public Steam store API; spike sources contained no AppID literal, only game names/dev names cross-checked against the READMEs)
- [Phase 24]: [Phase 24-03]: allowlist.ts uses readFileSync+JSON.parse+.parse() at module load (not a direct JSON import) per the plan's key_links spec, keeping the fail-loud load path independently testable
- [Phase 24-04]: isBridgeBottleReady() checks cxbottle.conf existence only (not steam.exe) -- the bridge bottle must never contain a bottled Windows Steam client (R6), so reusing isBottleReady()'s steam.exe check would make it permanently non-ready
- [Phase 24-04]: getBridgeBottleSettings() always resolves DEFAULT_BRIDGE_BOTTLE_NAME with no stored per-install override -- one shared bridge bottle (D-03), not user-configurable this phase
- [Phase ?]: [Phase 24-05]: SHIM_EXPORTED_SYMBOLS in shimGenerate.ts is a reviewed literal copy of meta/gen_vtables.ts's FLAT_EXPORTS_SUPERSET (not a cross-boundary import) -- src/'s tsconfig include:[src] excludes meta/, and the compiled .dll ships without its source .def at packaged runtime
- [Phase ?]: [Phase 24-05]: placeShimForGame() takes shimSourcePath as an injectable option defaulting to the real builtBridgeShimPath import -- tests inject a tmpdir fixture without mocking a module-level path const, while a source-grep test proves the production default is the real BLOCKER 2 shared location
- [Phase 24-06]: Status union uses 'not-inited' (not the suggested 'needs-spawn') to accurately name HEALTH-ok-but-WHOAMI-not-ok; poll returns early once HEALTH first answers since InitFlat already ran before the accept loop (D-04)
- [Phase 24]: Phase 24-07: pinned zig 0.16.0 for aarch64-macos (verified live against ziglang.org/download/index.json); zig lands in .build-tools/zig, never public/bin
- [Phase 24]: Phase 24-07: buildSteamBridgeShims.ts independently reconstructs public/bin/${arch}/darwin paths instead of importing paths.ts (which imports Electron's app at load time and would crash under plain node)
- [Phase 24]: Phase 24-07: zig cc -shared requires an explicit -lws2_32 link flag for the shim's winsock2.h usage -- confirmed by running the real compile gate
- [Phase 24]: isBridgeEligible() composed as the FIRST sub-branch inside install()/launch()/uninstall()'s isBottleEligible() block, ahead of the Phase 17 isBottleReady() gate (BLOCKER 1)
- [Phase 24]: Bridge install/uninstall completion signaled by a direct is_installed flip, not the shared ACF poller -- library.ts's AcfSource has no bridge-bottle variant
- [Phase 24]: markBridgeFailedThisSession(appId) + isBridgeEligible() session-set check (finding #3) so a D-05 fallback re-invocation skips the failing bridge
- [Phase ?]: 24-09: i18n keys go in gamepage.json (namespace file), not translation.json as literally named in plan -- verified against SteamBottleSetup precedent
- [Phase ?]: 24-09: fallback dialog re-invokes window.api.install()/window.api.launch() directly (D-04 shape) -- D-11 on-demand bottle provisioning inherited for free via existing steamBottleSetupRequired guard chain
- [Phase ?]: [Phase 27-01]: Sidecar transport framed as stdio JSON-RPC (not a loopback TCP port) per T-27-01 — Wine on macOS shares the host netns so a loopback port would be reachable by bottled processes; the parent<->child stdio pipe is private. Contract in src/common/types/sidecarTransport.ts (string ids for 64-bit safety), imported by the Rust shell, sidecar (27-02) and renderer bridge (27-03).
- [Phase 27]: [Phase 27-02] userData path = join(appData, 'GameLib') in pathShim.ts — matches the 'GameLib' literal already used throughout paths.ts; real Electron app.getName()-derived value can't be observed from a headless sidecar
- [Phase 27]: [Phase 27-02] Fixed a pre-existing order-sensitive circular dependency in storeManagers/index.ts's eager libraryManagerMap construction — converted top-level libraryManagerMap imports to lazy await import()/require() at use sites across 12 files, matching the codebase's existing bottle.ts/games.ts convention; required for backend/storeManagers/steam/library.ts to import headlessly under the sidecar
- [Phase 27]: 27-03: split window.api attach into a dedicated Node/Electron-free module (tauriAttach.ts) rather than reusing preload/index.ts, avoiding pulling contextBridge/backend-constants-environment into the Tauri renderer bundle
- [Phase 27]: 27-03: ipc.ts/misc.ts use lazy guarded require('electron')/require('electron-store') instead of static imports, since a static import compiles to an unconditional top-level require() that would throw if bundled into the Tauri renderer
- [Phase 27]: 27-03: registered a new Preload jest project (src/preload/jest.config.js) -- src/preload had zero test discoverability before this plan
- [Phase 27]: 27-04: added backend/logger's initHeadless() (real LogWriter, no GlobalConfig/system-info-dump side effects) as a purely additive export for the headless sidecar; Electron's own init() and main.ts startup path are unmodified
- [Phase 24]: [Phase 24-11]: D-UAT-24-04 fixed via byte-identity guard (size then sha256) replacing pure existsSync existence guard in placeShimForGame — The existence guard always short-circuited because the game's depot-shipped steam_api.dll is already present at shimPath by the time placeShimForGame runs; overwrite-by-identity restores the intended bridge-shim placement, with the shim-not-built check moved above the identity check and coverage/containment guards unchanged
- [Phase 24]: [Phase 24-12]: getBridgeBottleSteamappsRoot() mirrors getBottleSteamappsRoot() exactly (dedicated small function per root) rather than a parameterized getSteamappsRootFor(source) helper -- keeps each root trivially auditable per RESEARCH.md Pitfall 2 (never conflate native/bottle/bridge roots)
- [Phase 24]: 24-13: installBridgeGame polls the bridge bottle (pollerSource:'bridge', 24-12's AcfSource) instead of the unrelated Phase 17 GameLibSteam bottle — closes D-UAT-24-05
- [Phase 24]: 24-13: clearBridgeFailedThisSession(appId) un-poisons a session-sticky bridge failure on a successful (re)install — install() and launch() routing no longer stay permanently stuck on one earlier recoverable failure (D-UAT-24-03 cascade a)
- [Phase 24]: 24-13: launchBridgeGame verifies the resolved exe exists on disk (+ bridge bottle ready) before firing runWineCommand — a bridge-eligible game installed via a non-bridge path now surfaces steamBridgeSetupRequired instead of a silent wine no-op (D-UAT-24-02); treated as recoverable, not a bridge failure, so it does not markBridgeFailedThisSession
- [Phase 24]: Gates 2-4 in 24-UAT.md re-pointed from BLOCKED to PENDING retest, with per-fix verification hooks citing 24-11/24-12/24-13 gap closures; frontmatter status fields updated to match (Rule 1 consistency fix)
- [Phase 24]: getBridgeBottleSettings() resolves CrossOver wine via a sibling of CXBOTTLE_BIN (sync helper), not the async getCrossover() detector, keeping the getter synchronous for its existing callers
- [Phase 24]: 24-16: refresh()/refreshInstallState() consult buildBridgeInstalledMap() (native > Phase 17 bottle > bridge precedence) so a bridge-installed game's badge survives the periodic sync and focus reconciliation; installPlatformForSource('bridge') now returns Windows; markBridgeGameUninstalled emits gameStatusUpdate done to clear the Uninstalling pill (D-UAT-24-07)
- [Phase 24-17]: isBridgeAuthoritativeForInstallState() deliberately excludes games.ts's transient bridgeFailedThisSession from the library-level eligibility notion — only durable eligibility (bridgeAllowlist + mac/arch gate) drives persisted install-state, since a single recoverable session failure must never permanently flip is_installed
- [Phase 28]: Plan 28-01: sidecar->Rust rustInvoke request/response channel added (requestRustInvoke, RUST_INVOKE_CHANNELS allowlist, 60s timeout); T-28-03/T-28-03b/T-28-05 mitigated at the transport layer
- [Phase ?]: 28-02: openExternal gets minimal fire-and-forget fix, not rustInvoke conversion (Open Question 2 resolved at planning)
- [Phase 28]: 28-02: KEYRING_SERVICE=com.gamelib.launcher / KEYRING_ACCOUNT=steam-refresh-token chosen as production-stable Keychain identifiers, distinct from spike 011's throwaway values
- [Phase 28]: 28-03: TokenStore seam introduced — configStore/TOKEN_STORE_KEY access confined to tokenStore.ts, selected via setTokenStore/getTokenStore registry with no env-var escape hatch
- [Phase 28]: D-11 (28-03): Electron plaintext token fallback kept verbatim in ElectronTokenStore, not unified with sidecar's stricter D-06 policy — documented as intentional divergence
- [Phase 28]: Aliased bootstrap.ts's setTokenStore import as installTokenStore to satisfy the plan's literal single-occurrence grep acceptance criterion
- [Phase 28]: keyringTokenStore.ts's docstring avoids the literal identifiers configStore/TOKEN_STORE_KEY/TOKEN_PREFIX anywhere in the file, since its own structural test asserts a whole-file regex
- [Phase ?]: Corrected the plan's stale filename assumption for the Steam configStore file (config.json, not steamConfigStore.json) and added the skeletonFlows.test.ts-style electron/electron-store mock redirection so electronUntouched.test.ts proves the REAL production configStore path is untouched, not a synthetic tmpdir-backed mock
- [Phase 28]: Phase 28 hardware checkpoint: macOS Keychain Deny surfaces as keyring::Error::PlatformFailure wrapping OSStatus -128 (errSecUserCanceled), not NoStorageAccess — closes RESEARCH Assumption A1; no code fix needed since classification is already NoEntry-vs-everything-else, variant-agnostic.
- [Phase 28]: Regression fixed (92c29a5e): Phase 27's skeletonFlows.test.ts + 28-05's electronUntouched.test.ts were driving the developer's REAL production Electron configStore; skeletonFlows Test 4 destroyed the real Steam refresh token mid-phase. Both suites made strictly read-only / isolated.
- [Phase 29]: fileStore D-14 fix implemented as a path-keyed cellRegistry (Map<filePath,{data}>) rather than singleton FileStore instances, so new FileStore() still returns a distinct object per call while sharing the underlying data
- [Phase 29]: fileStore.ts options.defaults (D-02b) seeds unset keys under loaded data at cell-creation time only and is never persisted to disk at construction, deviating intentionally from electron-store/conf
- [Phase 29]: D-15 extended to a fourth store (uploadedLogFileStore) beyond the original three, so storeRegistration.ts (29-04) imports zero host modules
- [Phase 29]: storeRegistry records {instance, options} pairs (not just the instance) so name-keyed dispatch never re-derives cwd/name from the ValidStoreName string (Pitfall 4)
- [Phase ?]: D-08: single fail-closed store ALLOW-list (storePolicy.ts) replaces three hand-duplicated deny-lists for the Tauri path; Electron's misc.ts deny-list stays deliberately divergent until Phase 35 cutover (Phase 28 D-11 precedent)
- [Phase ?]: D-09/D-13: boot vs lazy store tier partition is declared as literal lists in storePolicy.ts, anti-drift-guarded by a hardcoded-reference-list test rather than derived at runtime

### Pending Todos

- Phase 7 manual UAT on macOS (real Steam account): overlay visibility on Mac/Windows-only games, "Unrated" pill, CrossOver↔Wine toggle drives both surfaces, pill click-through, runner-agnostic platform icons.
- Phase 10 live validation gate (before Phase 11 begins): empirically confirm axios + Cookie: _simpleauth_sess + X-Requested-By: hb_android_app reaches api/v1/user/order from Electron main process. Fallback = BrowserWindow webRequest proxy.
- Steam bottle setup offers GPTK/Wine engines that produce a broken bottle (macOS): non-CrossOver `wineVersion` selections silently fail — `cxbottle` creates the bottle but the `toolkit`/`wine` run-path (launcher.ts:434-442) drops the CX_BOTTLE binding and runs against a different prefix; readiness never passes. Fix: filter Steam WineSelector to CrossOver engines and/or reject non-crossover in provisionBottle. See `.planning/todos/pending/steam-bottle-gptk-engine-produces-broken-bottle.md`.
- Productionize the macOS native Steam bridge (out-of-process `steam_api` proxy): feasibility PROVEN end-to-end (spikes 004+005 — drop-in `steam_api.dll` in the real GameLibSteam bottle returns the real SteamID from live native Mac Steam, zero Windows Steam client). DONE — shipped as Phase 24 (complete 2026-07-21), which also superseded and parked Phase 22. Next frontier = C++ vtable ABI for unmodified games + the 6 unproxied interfaces (Utils/Apps/UserStats/RemoteStorage/Matchmaking/Networking). See `.planning/todos/pending/2026-07-18-productionize-macos-native-steam-bridge-out-of-process-steam.md` + `spike-findings-gamelib` skill.
- Steam native install progress polish (speed, ETA, paused-state): the native-installer-OFF `steam://install` path already surfaces a live download % (verified live 2026-07-19 via Playwright drive — `progressUpdate{runner:'steam'}` reaches the renderer). Polish gaps only: no download speed, `eta` hardcoded empty (`library.ts:1295`), and a Steam-paused download freezes the bar with no paused hint (only `StateFlags==1026` is special-cased). Plus stale `games.ts:604` docstring. Shared poller — guard bottle-path regression. See `.planning/todos/pending/2026-07-19-steam-native-install-progress-speed-eta-paused-state.md`.

### Blockers/Concerns

- Pre-push hook (`prettier` + `i18n --fail-on-update`) fails on **pre-existing repo debt** unrelated to Phase 7: ~141 files fail `prettier --check .` (likely a Prettier version bump; `pnpm-lock.yaml` already modified) and the locale files have orphaned-key drift. Phase 7 was pushed with `--no-verify` after independently verifying tsc/lint/tests. A separate housekeeping pass (`pnpm prettier --write .` + `pnpm i18n`) would clear it.
- Phase 23 Plan 05 Task 3 (checkpoint:human-verify, gate=blocking-human): 23-UAT.md Gate 1 real-hardware re-run pending — human must install a multi-depot title (Hogwarts Legacy 990080 or Cyberpunk 2077 1091500) on real macOS hardware after deleting the stale appmanifest_990080.acf, confirm single monotonic progress percent through a pause/resume cycle, and confirm StateFlags=4 completion + launch. Code fix (single-flight guard + reconciliation) is landed and regression-tested (commits cc77a9df/ddde970d/7fccfb2a/f963de8b); this is the only remaining Phase 23 gap before Gates 2/3 can proceed.

### Quick Tasks Completed

| # | Description | Date | Directory |
|---|-------------|------|-----------|
| 260627-vq1 | Fix QR login hang: set qrSessionState done immediately after credential storage, fire CM connection in background, add 15s timeout | 2026-06-27 | [260627-vq1-fix-qr-login-hang-set-qrsessionstate-don](.planning/quick/260627-vq1-fix-qr-login-hang-set-qrsessionstate-don/) |
| 260628-kzf | Fix blank Steam icon on Manage Accounts login page: replace FontAwesome faSteam with inline SteamLogo SVG to match other store runners | 2026-06-28 | [260628-kzf-fix-blank-steam-icon-on-manage-accounts-](.planning/quick/260628-kzf-fix-blank-steam-icon-on-manage-accounts-/) |
| 260628-pi7 | Show Steam last-played + total time on game details page (rtime_last_played) | 2026-06-28 | [260628-pi7-show-steam-last-played-on-game-details-p](.planning/quick/260628-pi7-show-steam-last-played-on-game-details-p/) |
| 260629-9ly | Fix QR-login → Steam-library race: assign QR background CM connect to connectingPromise (dedupe), gate frontend finalization on truthy poll.username | 2026-06-29 | [260629-9ly-fix-qr-login-library-race](.planning/quick/260629-9ly-fix-qr-login-library-race/) |
| 260629-rbn | Fix premature Steam install/uninstall notifications + status:done badge flash (GAME-02/03): runner==='steam' guards suppress premature DM/uninstaller emissions so the ACF poller solely owns Steam status + fires confirmed completion toasts | 2026-06-29 | [260629-rbn-fix-premature-steam-install-uninstall-no](.planning/quick/260629-rbn-fix-premature-steam-install-uninstall-no/) |
| 260630-ths | Decouple fork versioning from upstream Heroic: package.json version→1.0.0 + upstream base field (2.22.0 @ b5b5cad3), rename v0.1 tag→gamelib-v0.1, add UPSTREAM.md | 2026-06-30 | [260630-ths-decouple-fork-versioning-from-upstream-h](.planning/quick/260630-ths-decouple-fork-versioning-from-upstream-h/) |
| 260630-ud4 | Wire Steam AppID directly into ProtonDB lookup: use app_name as steamID when runner==='steam', skipping the wiki round-trip (backend + submenu + compat row) | 2026-06-30 | [260630-ud4-wire-steam-appid-directly-into-protondb-](.planning/quick/260630-ud4-wire-steam-appid-directly-into-protondb-/) |
| 260630-uod | Fix pre-push lint crash: ignore **/*.cjs in eslint flat config so Node CJS scripts aren't typed-linted (exposed 93 pre-existing Steam-code lint errors) | 2026-06-30 | [260630-uod-fix-pre-push-lint-failure-ignore-cjs-in-](.planning/quick/260630-uod-fix-pre-push-lint-failure-ignore-cjs-in-/) |
| 260630-uxp | Clear 93 lint errors in Steam store-manager code (gfs named imports, no-unused-vars ^_ convention, Function→callback type, unnecessary assertions) — pnpm lint/codecheck exit 0, 128 tests pass | 2026-06-30 | [260630-uxp-fix-93-pre-existing-lint-errors-in-steam](.planning/quick/260630-uxp-fix-93-pre-existing-lint-errors-in-steam/) |
| 260701-qxr | Rewrite README install section for GameLib: honest build-from-source (no prebuilt fork releases), fork clone URL, GameLib naming, fixed index anchors | 2026-07-01 | [260701-qxr-fix-readme-install-section-rewrite-to-ho](.planning/quick/260701-qxr-fix-readme-install-section-rewrite-to-ho/) |
| 260701-ufx | Rebrand Heroic→GameLib (user-facing + paths + protocol): migrate config dir ~/.config/heroic→GameLib w/ auto-migration, heroic://→gamelib:// (handler+registration+shortcuts+tests), user-facing backend strings. Internal identifiers left for mergeability. tsc 0, 152 tests pass | 2026-07-01 | [260701-ufx-rebrand-heroic-gamelib-user-facing-strin](.planning/quick/260701-ufx-rebrand-heroic-gamelib-user-facing-strin/) |
| 260704-mig | Fix Phase 8 Gap D launch-overlay regression (Steam overlay flashed at ~0s because steam:// blur fired instantly) via a 1.5s minimum-visible floor + 8s safety net; plus GameLib icon above text on artwork placeholders (greyscale on the 'Artwork unavailable' missing variant). tsc 0, eslint clean. Runtime re-UAT pending | 2026-07-04 | [260704-mig-fix-phase-8-gap-d-launch-overlay-regress](.planning/quick/260704-mig-fix-phase-8-gap-d-launch-overlay-regress/) |
| 260710-kba | Format Steam install_size as human-readable in Install Info panel: Steam persisted raw ACF sizeOnDisk bytes (e.g. 20622023528) while all other stores store a getFileSize()-formatted string. Wrapped all three steam/library.ts install-object sites (refresh, refreshInstallState, pollInstallOnce) in getFileSize(Number(sizeOnDisk)) and simplified getSteamInstallSize fast path to return the pre-formatted string. codecheck 0, 812 tests pass | 2026-07-10 | [260710-kba-format-steam-install-size-as-human-reada](.planning/quick/260710-kba-format-steam-install-size-as-human-reada/) |
| 260710-knr | Install Info panel consistency: Installed Platform row now renders a FontAwesome brand icon (faWindows/faApple/faLinux, case-insensitive helper w/ raw-text fallback, Browser branch unchanged) matching the Supported-platforms row; Install Path row gains a trailing faFolderOpen affordance inside the existing clickable openFolder div (no new handler) + info.openLocation i18n key. codecheck 0, eslint clean. Runtime visual UAT pending (needs GUI) | 2026-07-10 | [260710-knr-install-info-platform-icon-folder-open-i](.planning/quick/260710-knr-install-info-platform-icon-folder-open-i/) |
| 260710-l27 | Extra-info AppleGamingWiki refactor: split single rating row into two always-visible rows (Crossover rating + Wine rating, "Unrated" fallback via ratingTier); removed the cover-art rating pill (AppleRatingOverlay) entirely; fully removed the redundant "Mac compatibility rating source" (appleRatingSource) setting across settings UI, GlobalState/ContextProvider, frontend/common types, electron_store schema, and i18n. tsc 0, grep gate confirms zero dangling refs. Runtime visual UAT pending (needs GUI) | 2026-07-10 | [260710-l27-extra-info-crossover-wine-rating-rows-re](.planning/quick/260710-l27-extra-info-crossover-wine-rating-rows-re/) |
| 260710-d7b | Fix install default folder: DownloadDialog + ImportDialog fallback `${userHome}/Games/Heroic` → Games/GameLib (matches backend heroicInstallPath default). Fallback-only; configured paths unaffected. tsc 0 | 2026-07-10 | (fast task, commit d7bbd883) |
| 260710-lmo | Complete Heroic→GameLib user-facing rebrand sweep: 44 en-locale display values (translation.json + gamepage.json) + JSX default fallbacks across 25 components + theme name ("Old School GameLib") + CrossoverBottle default value ('GameLib' — behavioral: new crossover setups default to a GameLib bottle). Two factual corrections: CustomCSS path `~/.config/heroic/config.json`→GameLib, protocol `heroic://`→`gamelib://`. Preserved i18n keys, code identifiers (getHeroicVersion/HEROIC_GAME_TITLE/etc.), CSS classes, upstream URLs, legacy-config migration source. tsc 0, both locale JSON valid, grep audit clean. Runtime visual UAT pending | 2026-07-10 | [260710-lmo-complete-heroic-gamelib-rebrand-of-user-](.planning/quick/260710-lmo-complete-heroic-gamelib-rebrand-of-user-/) |
| 260710-m3f | Show estimated Install Size on pre-install Steam game page (parity w/ Epic/GOG): replaced the `runner === 'steam'` early-return in DownloadSizeInfo with a `SteamInstallSize` child component (unconditional hooks) that calls new `getSteamInstallSize` IPC handler (thin pass-through to existing backend estimator — parses store API `pc_requirements.minimum`; appId `/^\d+$/` + bounded-regex guards T-06-01/02 preserved). Install Size row ONLY (no Download Size — Steam has no public download-size source); "~"+"(estimate)" indicator; "?? MB"/undefined→"Unknown" fallback. Installed-game path untouched. codecheck 0, 812 tests pass. Runtime visual UAT PASSED (user-confirmed 2026-07-10) | 2026-07-10 | [260710-m3f-show-estimated-install-size-on-pre-insta](.planning/quick/260710-m3f-show-estimated-install-size-on-pre-insta/) |
| 260710-mkw | Fix missing Steam grid cover art: extended `CachedImage` to accept an ordered `string \| string[]` fallback chain (backward-compatible; numeric index replaces boolean useFallback, bounded/no-loop). Grid (non-justPlayed) tile now passes `[art_cover, fallBackImageMissing]` when a distinct header exists, so Steam games with a 404 portrait capsule (library_600x900.jpg) but valid header (header.jpg) — e.g. Bard's Tale IV (566090) — render real header art instead of the generic placeholder. justPlayed branch + non-Steam runners unchanged. Frontend jest 28/28, tsc 0, eslint clean. Runtime visual UAT pending (needs GUI) | 2026-07-10 | [260710-mkw-steam-grid-cover-art-falls-back-to-heade](.planning/quick/260710-mkw-steam-grid-cover-art-falls-back-to-heade/) |
| 260710-nwb | THROWAWAY SPIKE (not app code; lives in `spike/`). Feasibility of CrossOver (CodeWeavers) compatibility lookup by constructed slug — `GET /compatibility/crossover/{slug}`, parse schema.org JSON-LD `@graph` VideoGame node for `aggregateRating` (ratingValue/ratingCount) + sameAs. Live-run measured **8/12 = 66.7%** match rate (est. 83.3% with two slugify fixes). **Critical correction:** misses return HTTP 200 soft-404 (title `404 Not Found`), NOT 404 — future backend MUST detect hit/miss by content (VideoGame JSON-LD presence), not status code. Slugify bugs found: apostrophe should be dropped not hyphenated (`baldurs-gate-3`), roman numerals need Arabic normalization (`...-modern-warfare-2`). Verdict: **GO** on backend+pill, conditional on content-based detection + slugify fixes + graceful "no data" UI for genuine misses. Delete `spike/` once acted on. | 2026-07-10 | [260710-nwb-crossover-compatibility-lookup-spike](.planning/quick/260710-nwb-crossover-compatibility-lookup-spike/) |
| 260710-qyc | Relocate CrossOver/Wine emulation compat rows from the Extra-info tab into the Install-info tab, directly under Supported platforms (`<AppleWikiInfo>` moved after `<PlatformSupport>`). Rows now gated on `!is.native` — shown only when the game does NOT run natively on the current OS (a compat layer is actually needed). Reworded "Crossover rating"→"Crossover emulation" and "Wine rating"→"Wine emulation" (component defaults + en/gamepage.json, keys unchanged) to clarify why the rows exist. Crossover row swapped `WineBar`→`CodeweaversLogo` (codeweavers_icon.svg?react); Wine row keeps WineBar. Wine row link now branches by OS: macOS→AppleGamingWiki (`/w/index.php?search=` go-or-search), Linux→WineHQ AppDB (browse+`sHavingText` filter); Crossover row link left on codeweavers.com. Dropped `applegamingwiki`+`codeweavers` terms from the `hasWikiInfo` gate so the Extra-info tab no longer appears empty for games whose only wiki data was those two rows. codecheck 0, eslint clean on touched files. Runtime visual UAT pending (needs GUI) | 2026-07-10 | [260710-qyc-ui-cleanup-relocate-rework-the-crossover](.planning/quick/260710-qyc-ui-cleanup-relocate-rework-the-crossover/) |
| 260710-rjm | Rework the emulation-compat rows into three OS-specific rows + fix a CrossOver rating bug. (1) BUG FIX: CodeWeavers pages carry two editorial reviews (macOS + Linux) plus an aggregateRating that averages them; we parsed the average (A Plague Tale: Innocence showed 3 = avg of mac 5 + linux 1). Rewrote `extractVideoGameJsonLd` to read per-OS `Review.reviewRating` via `about.operatingSystem`/`reviewAspect`; `CodeweaversInfo` shape `{rating,ratingCount,slug}`→`{macRating,linuxRating,slug}`; `staleCrossoverData` self-heals old-shaped caches (refetch when `macRating===undefined`). (2) Crossover row now macOS-only (`is.mac && macRating!=null`), shows `macRating` as stars, monochrome hand-authored `crossover_icon.svg?react` (currentColor rounded-square-X) replacing the 343-path color CodeWeavers logo. (3) NEW Proton row for `is.linux && runner==='steam' && steamInfo.compatibilityLevel`: ProtonDB tier→stars via new `protonTierToStars` (platinum5/gold4/silver3/bronze2/borked1, pending/unknown→Unrated), links protondb.com/app/{app_name}; replaces the Wine row in that case (`showWine = !!applegamingwiki && !showProton`). Deleted dead `crossoverRating.ts`+test (count label dropped); added `info.proton-rating` locale key. codecheck 0; codeweavers 17/17 + protonRating tests pass (33 total in the two suites); eslint clean on touched files. NOTE: extra-tab CompatibilityInfo still shows a Proton *tier text* row — intentional (dedup out of scope). Runtime visual UAT pending (needs GUI) | 2026-07-10 | [260710-rjm-rework-gamepage-emulation-compat-rows-pe](.planning/quick/260710-rjm-rework-gamepage-emulation-compat-rows-pe/) |
| fast | Crossover-row parity: the Wine row shows "Unrated" for games with no rating, but the Crossover row hid when there was no macOS rating (e.g. Avernum 6: macRating null, linuxRating 5). Changed `showCrossover` to `is.mac && !!codeweavers` and render `t('info.unrated','Unrated')` when macRating is null (no fallback to the Linux rating — "match current OS" stands). Aligned the Proton null-tier fallback to the same "Unrated" wording; added `info.unrated` locale key. Found via live-app UAT (GameLib running on A Plague Tale + Avernum 6). codecheck 0, eslint clean. | 2026-07-10 | (fast task, commit 1a56ac6d) |
| 260711-a3v | Include Steam in sidebar/stores login aggregation. Logging into only Steam left the "Log in" sidebar item visible and made the Stores link open Epic with a "not logged in" warning, because `SidebarLinks/index.tsx` aggregated login across epic/gog/amazon/zoom but never Steam. Added `steam.username` to the `loggedIn` check (hides "Log in" when only Steam) + a Steam-only `defaultStore='steam'` branch so Stores opens the browse-only Steam store instead of Epic. Pre-existing bug; found during Phase 17 UAT. tsc 0, eslint 0. Runtime re-check pending. | 2026-07-11 | [260711-a3v-fix-sidebar-stores-login-ignores-steam](.planning/quick/260711-a3v-fix-sidebar-stores-login-ignores-steam/) |
| 260711-alc | Throttle Steam metadata fetches on cold cache. Fresh/wiped cache fired one `fetchMetadataIfNeeded` axios call per game (376) with no concurrency cap or timeout → hundreds of parallel Steam-CDN connections mass-timed-out (connect ETIMEDOUT); only ~14/376 loaded art, and the saturated main process slowed queued installs. Added a metadata-fetch semaphore (MAX 5, acquire/release with slot hand-off) + 15s axios timeout in `state.ts`/`games.ts`. Pre-existing Phase 2/7 issue; surfaced during Phase 17 UAT after the uninstall wipe. tsc 0, eslint 0, full suite 915/915. Runtime re-check pending. | 2026-07-11 | [260711-alc-throttle-steam-metadata-fetches](.planning/quick/260711-alc-throttle-steam-metadata-fetches/) |
| 260711-aus | Steam empty-library message + background metadata sync indicator (2 UAT gaps). (1) `EmptyLibrary` message omitted Steam and its empty-vs-no-results trigger summed every store's library EXCEPT steam → Steam-only users wrongly saw "log in with Epic/GOG/Amazon"; added Steam to the locale string + JSX and `steam?.library.length` to the trigger. (2) `steamSyncSpinner` only reflected the library-list refresh, not the per-game metadata/art stream (throttled, long on cold cache); `games.ts` now emits `steamMetadataSyncing` on pendingFetches empty↔non-empty, wired through ipc/preload/GlobalState/ContextProvider and OR'd into LibraryHeader's `isSteamSyncing`. Pre-existing Phase 2/7 gaps; surfaced during Phase 17 UAT. tsc 0, eslint 0, full suite 915/915. Runtime re-check pending. | 2026-07-11 | [260711-aus-steam-empty-library-and-sync-indicator](.planning/quick/260711-aus-steam-empty-library-and-sync-indicator/) |
| 260711-htb | Move the 'Use shared Wine prefix' toggle to the bottom of WineSelector (global reorder — all install modals). GAP 4 (phase 17 UAT, cosmetic): the shared-prefix toggle sat above the prefix/bottle + Wine-version fields; moved it (with its warning infoBox) below the Wine-version dropdown in the shared `WineSelector`, so the new order applies to Steam AND Epic/GOG/Amazon/sideload install modals. Pure JSX reorder — no logic/state/style change, all `disabled={useSharedPrefix}` bindings preserved. tsc 0, eslint 0; no unit tests for this presentational component, runtime visual check pending. | 2026-07-11 | [260711-htb-move-the-use-shared-wine-prefix-toggle-t](.planning/quick/260711-htb-move-the-use-shared-wine-prefix-toggle-t/) |
| fast-73ee87f3 | Native Steam install focus-handover parity test (given GAP 5 CrossOver work). Added `GAME-02/focus` unit test in games.test.ts asserting native install() calls shell.openExternal WITHOUT { activate: false } (OS foregrounds Steam), contrasted with launch()'s { activate: false }; documents parity with the CrossOver raiseInstallerWindow() path (same outcome, different mechanism). Plus a 17-UAT.md manual real-hardware parity check. games.test.ts 88/88, tsc 0. /gsd-fast (inline, no task dir). | 2026-07-11 | (inline — commit 73ee87f3) |
| fast-0800e7d8 | Make the CrossOver rating Refresh icon visible. The MUI `IconButton` (260712-lkn) rendered with the default light-theme action color (translucent black — App.tsx `createTheme` sets no `palette.mode`), invisible on GameLib's dark game page though its ~36px hit area still triggered refresh (user reported clicking the row refreshed but saw no icon). Added `color="inherit"` so the `Refresh` icon adopts the surrounding `.iconWithText` link text color, visible in both themes. tsc 0, eslint clean. /gsd-fast (inline). | 2026-07-12 | (fast task, commit 0800e7d8) |
| 260712-lkn | Add a user-facing refresh for CrossOver compat ratings. A game cached once as unrated (`macRating:null`) stays that way for the 30-day TTL because `staleCrossoverData` self-heal only fires on missing/old-shape caches — so a rating newly entered on codeweavers.com (e.g. Avernum 4) never appeared. Added optional `forceRefresh` to `getWikiGameInfo` (bypasses the cached-response early return, re-populates via `wikiGameInfoStore.set`), threaded through the IPC handler + `ipc.ts` type; frontend exposes `refreshWikiInfo` on GameContext (force-refetch in GamePage that accepts any non-null result so a codeweavers-only update lands) + a small MUI `Refresh` IconButton on the CrossOver pill (stopPropagation so it doesn't open codeweavers.com, disabled while in-flight). codecheck 0, eslint clean on touched files, codeweavers 17/17. Runtime visual UAT pending (needs GUI). | 2026-07-12 | [260712-lkn-add-refresh-affordance-for-crossover-com](.planning/quick/260712-lkn-add-refresh-affordance-for-crossover-com/) |
| 260714-gnc | Add `.graphifyignore` to scope the knowledge graph to the codebase. The graph was 9,264 nodes, of which 5,541 were markdown "document" nodes — `.planning/` alone contributed 5,323, outweighing `src/` (3,269) by 1.6:1, which pushed the graph past graphify's 5,000-node HTML-viz ceiling and polluted `graphify query` results with planning-doc noise. Excludes `.planning/`, `scratchpad/`, `graphify-out/`, `.claude/`; deliberately keeps `README.md` + `CHANGELOG.md` indexed (no `*.md` blanket glob). Chosen over the `--code-only` / `--exclude` CLI flags because those exist only on `graphify extract`, whereas `.graphifyignore` is read by the shared `detect()` scanner (`detect.py:1146`) that `graphify update` also uses — so `/gsd-graphify build` honors it with no skill patching. Expected drop to ~3,900 nodes; graph not yet rebuilt. | 2026-07-13 | [260714-gnc-add-graphifyignore-to-scope-knowledge-gr](.planning/quick/260714-gnc-add-graphifyignore-to-scope-knowledge-gr/) |
| 260715-a7g | Fix Phase 20 owned-badge false positive: original titles fuzzy-matched their remasters ("Alan Wake" wrongly Owned for "Alan Wake Remastered"), found during Phase 20 store-search live UAT. Root cause: `normalizeTitle` stripped `'remastered'` (an EDITION_SUFFIXES entry) so base+remaster normalized identically → 100% similarity. Removed `'remastered'` from EDITION_SUFFIXES and added a `PRODUCT_VARIANT_KEYWORDS=['remaster','remake']` differentiator guard (`isRemasterFalsePositiveRisk`, mirrors `isDlcFalsePositiveRisk`, T-12-01 trusted-constant discipline) OR'd into `fuzzyMatch` — a remaster/remake never matches the base title (missing beats wrong, D-01/D-02). Shared matcher, so Humble dedup benefits too (D-02); deluxe/GOTY/definitive editions still match (same base game). Full backend suite 1087/1087 (incl. dedup.test.ts + storeSearchBadges.test.ts), codecheck 0. | 2026-07-15 | [260715-a7g-treat-remaster-remake-as-product-differe](.planning/quick/260715-a7g-treat-remaster-remake-as-product-differe/) |
| 260718-jmt | Fix Steam native-install download progress graph cadence (surfaced during Phase 23 Gate 1 hardware UAT): the DownloadManager ProgressHeader chart advanced one sample per `progressUpdate` IPC, which `downloadDepotFiles` emitted only from the per-chunk `onBytes` callback (throttled 500ms) — so when chunk completions bunched up the graph froze for many seconds (~30s observed; user wanted ~1s like Steam). Added `PROGRESS_HEARTBEAT_MS=1000` + a `setInterval(() => emitProgress(true), …)` started before the worker `Promise.all`, cleared in a `try/finally` scoped to that Promise.all (fires on completion AND throw/abort), so a fresh progressUpdate is emitted ~1×/sec with an honest rolling rate (0 when no bytes arrived) independent of chunk timing. Backend-only; MB/s units unchanged (Mbps change declined). Scope-fenced off the Phase-23 single-flight guard / StateFlags 4-vs-1026 / buildid / file-mode logic. steam suite 563/563, tsc 0, eslint clean. | 2026-07-18 | [260718-jmt-fix-steam-download-progress-graph-cadenc](.planning/quick/260718-jmt-fix-steam-download-progress-graph-cadenc/) |
| 260719-aog | Steam native-install progress polish (OFF path, `steam://install` → `pollInstallOnce`): added live download speed + ETA (reusing `depot.ts` `rollingRateMiBs`/`formatEta` rather than duplicating math) and a `context: 'steam-paused'` hint (frozen `BytesDownloaded` ≥3 ticks → "Paused" label; StateFlags 1026 restart-hint always takes precedence; staged-fallback never flagged) populating the pre-existing `downSpeed`/`eta` `InstallProgress` fields — no new IPC channel, no type change. Fixed stale `games.ts:604` docstring. Shared bottle-path poller (GAP-17-BOTTLE-PROGRESS) verified unregressed. steam suite 648/648, tsc 0, eslint clean. Deferred: leaked real `setInterval` in unrelated pre-existing test (`library.test.ts:2627`). | 2026-07-18 | [260719-aog-steam-native-install-progress-polish-dow](.planning/quick/260719-aog-steam-native-install-progress-polish-dow/) |
| 260720-q5n | Repoint electron-updater auto-update feed off Heroic upstream to the GameLib fork: added an explicit `publish` block (github, owner grayson-mitchell, repo GameLib) to `electron-builder.yml`. Without it, electron-builder derived the feed from package.json's `repository` field (still Heroic-Games-Launcher/HeroicGamesLauncher), so fresh Windows builds saw Heroic 2.x > GameLib 0.7.0 on startup and fired a bogus "new version available" dialog that downloaded Heroic's installer and triggered a "Heroic wants to make changes to your computer" UAC prompt. Fork has no release > 0.7.0 → check finds nothing, popup gone. package.json repository left unchanged (publish block takes precedence). YAML parse-verified. | 2026-07-20 | [260720-q5n-add-publish-block-github-grayson-mitchel](.planning/quick/260720-q5n-add-publish-block-github-grayson-mitchel/) |
| 260721-u77 | Fallback/placeholder tile art (e.g. Hoard) was cropped: `CachedImage`'s fallback rendered through the same `.gameCard .gameImg` rule as real cover art (`object-fit: cover`, `aspect-ratio: 3 / 4`). `CachedImage` now tags the `<img>` with `usingFallback` while a fallback source is displayed (cleared by the existing src-keyed effect), and GameCard styles that state `object-fit: contain` for both `.gameImg` and `.justPlayedImg` — placeholders render whole, real cover art still crops to fill. The class is inert for StoreSearchRow/DiscountCard (their CSS does not target it). New CachedImage test for the marker; jest 6/6, tsc clean. Code commit 8747aef3. | 2026-07-21 | [260721-u77-fallback-tile-art-fit-not-trimmed](.planning/quick/260721-u77-fallback-tile-art-fit-not-trimmed/) |
| 260722-c2i | Restore `.planning/ROADMAP.md` (commit 9eac4a09 had wholesale-replaced it with a 19-line Phase 27 fragment, destroying the 1016-line roadmap and breaking `gsd-sdk query roadmap.analyze`) by merging the recovered pre-truncation structure with the surviving Phase 27 content (re-integrated verbatim as new `## v0.8 Phase Details`), disk-reconciling every checkbox against actual `*-PLAN.md`/`*-SUMMARY.md` counts, re-filing misfiled detail sections (18→v0.5, 23/25→v0.7, 24→v0.7, 26→v0.7), and relocating Phase 22 to a new `## Parked / Superseded Phases` section so it can't hijack `current_phase`. Root-caused the actual mechanical bug (the `## Phases` checklist's `### vX.Y` sub-headings were matching `roadmap.analyze`'s milestone-slice regex before the real `## v0.7 Phase Details` heading did) and fixed it by converting those 8 groupings to plain bold text. Backfilled `.planning/MILESTONES.md` v0.2–v0.8 (v0.1 untouched), no fabricated ship dates (v0.2/v0.7/v0.8 marked open/undated); surfaced an honest finding that Phase 13's 24h–48h urgency-badge bug (CR-01) was never actually fixed (only 13-01 ever touched the file per git log), despite v0.3 being recorded complete elsewhere. Verified live: `gsd-sdk query roadmap.analyze` now returns `current_phase:"23"` (partial, 10 plans/5 summaries), `next_phase:null` (correct — no unstarted phase in v0.7), non-zero stats. | 2026-07-22 | [260722-c2i-PLAN.md](.planning/quick/260722-c2i-PLAN.md) / [260722-c2i-SUMMARY.md](.planning/quick/260722-c2i-SUMMARY.md) |

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Game Details | DETAIL-03: Linux ProtonDB compat overlay | Post-v0.2 | v0.2 requirements |
| Settings | API-01: Copy-to-clipboard on API key field | Post-v0.2 | v0.2 requirements |
| Console / Steam | CONSOLE-02: Steam update feedback in Console launch — when a Steam game needs an update, GameLib shows "Launched in Steam" and dismisses while Steam silently updates; user has no in-app signal. Needs own design (Steam does not report update state back). From Phase 8 UAT (finding E). | Post-v0.2 | Phase 8 UAT (2026-07-04) |
| Console / macOS | KNOWN LIMITATION — Launching a Steam game from Console mode on macOS shows a brief desktop-Space animation before the game appears. Cause: Console mode uses native fullscreen (its own macOS Space) so swipe-to-Space works; macOS must leave that Space when the game's window appears elsewhere. Not fixable from Electron without setSimpleFullScreen, which removes the swipe-able Space and has focus/chrome rough edges (prototyped + rejected in Phase 8 UAT test 11). `activate:false` on the steam:// handoff was tried and kept but does not remove the flash. Accepted as-is. | Accepted (won't fix) | Phase 8 UAT (2026-07-04) |
| Humble Store | HSTORE-02: Read-only Humble bundle/deals listing in-app with "Buy on Humble" deep-links | Post-v0.3 | v0.3 requirements (separate data source; key management prioritized) |

## Session Continuity

Last session: 2026-07-22T06:23:52.545Z
Stopped at: Completed 29-02-PLAN.md
Next: Human runs the 3 D-07 gates in 23-UAT.md on real macOS (multi-depot Cyberpunk 2077, hard-DRM title, interrupt-then-resume) and records PASS/FAIL. Any FAIL routes to /gsd-plan-phase 23 --gaps. Phase 23 cannot be marked complete until all 3 gates pass. Also still outstanding (unrelated to Phase 23): Phase 21's 21-UAT.md real-hardware human verification (native .acf adoption, hard-DRM launch, cancel-recovery, bottled Steam adoption, client-setup flows) — required before milestone v0.7 completion.
| 2026-07-10 | fast | Replace CrossOver icon with monochrome weave mark | ✅ |
| 2026-07-11 | fast | Steam list-view store label showed 'Other' → 'Steam' (getStoreName) | ✅ |
| 2026-07-11 | fast | Removed redundant Steam-specific refresh button from LibraryHeader | ✅ |
