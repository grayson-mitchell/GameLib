
# Roadmap: GameLib

## Overview

GameLib forks Heroic Games Launcher and adds Steam as a first-class platform alongside Epic, GOG, and Amazon. The roadmap follows the natural dependency chain: Steam authentication is the prerequisite for everything else, library sync requires an authenticated account, game operations require the library to exist, and branding is applied once the core feature set is complete and ready to ship.

## Milestones

- ✅ **v0.1 Steam Platform** — Phases 1–4 (shipped 2026-06-29) — archive: `milestones/v0.1-ROADMAP.md`
- ✅ **v0.2 Polish & Enhancements** — Phases 5–8.1 (Phase 9 Quality Gate never started; superseded 2026-11-11) — phase dirs archived 2026-10-16 to `milestones/v0.2-phases/`
- ✅ **v0.3 Humble Bundle Integration** — Phases 10–15 (shipped 2026-07-10) — `milestones/v0.3-phases/`
- ✅ **v0.4 Compatibility Data** — Phase 16 (shipped 2026-07-10) — `milestones/v0.4-phases/`
- ✅ **v0.5 Steam macOS Compatibility Runtime** — Phases 17–19 (shipped 2026-07-14) — `milestones/v0.5-phases/`
- ✅ **v0.6 Aggregated Store Search** — Phase 20 (shipped 2026-07-15) — `milestones/v0.6-phases/`
- ✅ **v0.7 Steam Native Install** — Phases 21, 23–26 (closed 2026-10-16 with live-only UAT PARKED, not verified — see MILESTONES.md; Phase 23's gaps G-23-01/G-23-02 were closed 2026-08-19) — `milestones/v0.7-phases/`
- ✅ **v0.8 Tauri Shell** — Phases 27–50 plus parked Phase 22 (shipped 2026-10-16, **override closeout** — see MILESTONES.md) — archive: `milestones/v0.8-ROADMAP.md` (full phase details, 6008 lines), `milestones/v0.8-phases/`
- ✅ **v0.9 Steam Bridge & Engine** — Phases 51–60 (shipped 2026-11-06; audit `tech_debt`, no blockers) — archive: `milestones/v0.9-ROADMAP.md`, `milestones/v0.9-MILESTONE-AUDIT.md`, `milestones/v0.9-phases/`. Phases 61–75 were run unassigned and adopted by v0.10.
- ✅ **v0.10 Foundations** — Phases 47, 61–81 incl. 66.1–66.4 (shipped 2026-11-20; audit `tech_debt`, no blockers; **override closeout** — see MILESTONES.md) — archive: `milestones/v0.10-ROADMAP.md`, `milestones/v0.10-REQUIREMENTS.md`, `milestones/v0.10-MILESTONE-AUDIT.md`, `milestones/v0.10-phases/`, `milestones/v0.10-quick/`
- 🚧 **v0.11 Node Sidecar Retirement** — Phases 82–99 (planned 2026-11-17; current since the v0.10 close 2026-11-20) — requirements: `REQUIREMENTS-v0.11.md`

v0.2–v0.7 were never archived through `/gsd-complete-milestone`; their phase directories (5–26) remain under `.planning/phases/` and their full roadmap entries are preserved verbatim in `milestones/v0.8-ROADMAP.md` lines 238–1051.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

**v0.1 — Steam Platform (Shipped 2026-06-29)**

- [x] **Phase 1: Steam Authentication** - Users can add, manage, and remove Steam accounts in GameLib (completed 2026-06-27)
- [x] **Phase 2: Steam Library** - Steam games appear in the unified library with metadata and install state (completed 2026-06-28)
- [x] **Phase 3: Game Operations** - Users can launch, install, and uninstall Steam games from GameLib (completed 2026-06-28)
- [x] **Phase 4: Branding** - App is identified and distributed as GameLib, not Heroic (completed 2026-06-28)

**v0.2 — Polish & Enhancements**

- [x] **Phase 5: Branding & About Polish** - GameLib presents complete, accurate identity across tray, backend logs, docs, and the release notes link (completed 2026-07-02)
- [x] **Phase 6: Library & Game Status UX** - Library grid surfaces real playtime and install size; a "Playing" badge tracks active Steam sessions (completed 2026-07-03)
- [x] **Phase 7: Game Details Enrichment** - Game details page shows supported platforms and, on macOS, an AppleGamingWiki compatibility rating (completed 2026-07-03, manual UAT pending)
- [x] **Phase 8: New Steam Surfaces** - Steam storefront is browsable in the Stores sidebar tab; Steam games appear in Console mode (completed 2026-07-03)
- [ ] **Phase 9: Quality Gate** — 0/0 plans; ⛔ SUPERSEDED 2026-11-11 by the post-cutover verification record (never started; see `## Parked / Superseded Phases`)

**v0.3 — Humble Bundle Integration**

- [x] **Phase 10: Humble Auth + Adapter Scaffold** - Users can connect a Humble Bundle account from Manage Accounts with encrypted session persistence and a validated C5 API boundary (completed 2026-07-05)
- [x] **Phase 11: Library Sync + 5-State Key Model** - Full Humble key inventory synced, classified into the 5-state model, and reliably cached with fail-soft behavior (completed 2026-07-06)
- [x] **Phase 12: Ownership Dedup** - Every Humble key cross-referenced against the Steam library; redeemed Steam keys collapse onto their existing Steam library entries (completed 2026-07-06)
- [x] **Phase 13: Keys-Waiting + Giftable-Spares Views** - Users can see claimable keys sorted by expiration urgency and surface gift links for owned-elsewhere spares (5/5 plans executed 2026-07-08; recorded "Gaps found" in the prior progress table — verify gap-closure status against 13-*/13-VALIDATION.md before treating as clean)
- [x] **Phase 14: Guided Claim Flow** - Users safely reveal and activate Humble Steam keys with structural protection against key waste, accidental re-reveal, and rate-limit lockout (completed 2026-07-09)
- [x] **Phase 15: Store Overlay + Expiration Alerts** - Store surfaces show Humble ownership badges; newly-expiring keys trigger OS notifications (completed 2026-07-10; re-verified 10/10 after gap closure — 15-05 CR-01 badge reachability, 15-06 WR-01/WR-02 composite dedup + i18n, follow-up WR-01 divergence fix baac4527; see 15-VERIFICATION.md)

**v0.4 — Compatibility Data**

- [x] **Phase 16: CrossOver Compatibility Rating (CodeWeavers)** - The extra-info Crossover rating comes from live CodeWeavers compatibility data instead of the stale AppleGamingWiki source (completed 2026-07-10)

**v0.5 — Steam macOS Compatibility Runtime**

- [x] **Phase 17: Steam on macOS via CrossOver/Wine** - Windows-only Steam games (no native Mac build) install and launch on macOS through the Windows Steam client running inside a GameLib-managed CrossOver/Wine bottle, instead of native steam:// delegation (all 17 plans executed + UAT approved; completion PAUSED on code-review CR-01 data-loss BLOCKER, closed by gap plan 17-17) (completed 2026-07-13)
- [x] **Phase 18: macOS 32-bit detection, badge & CrossOver routing** - Detects a Steam game's macOS build architecture and routes 32-bit-only mac games to CrossOver/Wine instead of a native install, with an OS/arch badge beside the game logo (completed 2026-07-13, UAT 5/5)
- [x] **Phase 19: CrossOver Compatibility Index (macOS)** - Every game in the library carries a CrossOver medal badge and can be filtered by it, served offline from a CI-built index of CodeWeavers' daily dump instead of a per-game live scrape (completed 2026-07-14)

**v0.6 — Aggregated Store Search**

- [x] **Phase 20: Aggregated Store Search (CheapShark)** - Search a title once and see what it costs across every store, with "you already own this" badges no price-comparison site can show (completed 2026-07-15)

**v0.7 — Steam Native Install**

- [x] **Phase 21: Steam Native Install (depot download)** - Steam games install through an in-process depot download GameLib owns — real progress, real errors, recovery — instead of the opaque steam://rungameid handoff; Steam adopts the install and keeps owning updates (17/17 plans, code-review clean, secure-phase 41/41 threats_open:0; hardware UAT items deferred) (completed 2026-07-20)
- [x] **Phase 23: Steam full-ownership install (StateFlags=4)** — ✅ COMPLETE (2026-08-19) - GameLib authors a StateFlags=4 (FullyInstalled) manifest so Steam does zero verify/download work on first install (COMPLETE — 10/10 plans executed [23-01..23-10]; REQ-23-07 SATISFIED: all three D-07 hardware gates PASS on real macOS 2026-08-19 (Gate 3 interrupt-resume executed for the first time: reconciledSkipped=15643/jobCount=3306, StateFlags 4 not a fail-closed 1026, 21 +x via healReconciledFileModes with zero manual chmod measured BEFORE Steam started, Steam adopted with "Verifying file sizes only"/"Verification complete" in the same second and no re-download, reached main menu, no CrossOver auto-open). G-23-01 stays OPEN BY DECISION, not oversight — its diagnostic is ANSWERED (the official Windows Steam client installed KCD2 in full WITHOUT depot 1771304 and never requested its key), making it a confirmed over-selection + hard-fail defect at severity major whose fix is explicitly out of 23-10's scope and routes to its own gap cycle; its scope now also covers a second divergence, depot 1771306 (13.65GB) which the official client installs and GameLib's plan-build never mentioned. One new defect filed by Gate 3: a resumed install's progress can never reach 100% (measured 76% on a fully successful install). HISTORY: 23-04's SUMMARY written retroactively 2026-08-14, its Task 2 closed via the "failures documented for gap closure" branch. 2026-08-16: G-23-02's root cause CONFIRMED on real macOS as **H2** (23-TRACE.md) — HUMANKIND's manifest carries NO executable flags at all (`distinctFlagValues=[64]`, directories only, both depots), so the writer was applying exactly what it was given and is EXONERATED; the real finding is that `EDepotFileFlag` is not a sufficient source of executability on macOS and a flagless manifest is the NORMAL case (2 of 3 titles censused carry none, while Steam's own install of one of them carries 18,002 of 18,809 `+x`). 23-08 fixed it: fail-closed `allModesApplied` gate (it was vacuously true when zero modes were attempted) plus a load-bearing secondary Mach-O magic-byte fallback that discriminates subtype (MH_EXECUTE/MH_DYLIB yes, MH_BUNDLE no). 23-09 shipped G-23-01's observability half only (dedicated EResult 40 `depotBlocked` branch + failure-site log); selection policy untouched, skip-and-warn gated on 23-10's KCD2 diagnostic. Gate 1's LAUNCH half was downgraded to MASKED (Cyberpunk's manifest is also `executableFlagged=0`, so its recorded launch cannot have run on GameLib-applied bits); its adoption half still stands. REMAINING: 23-10 only — blocking-human, 4 hardware runs (Gate 2 clean re-run, Gate 3 first execution, Gate 1 launch re-confirmation, KCD2 diagnostic). G-23-01/G-23-02 both still `open` in 23-UAT.md, REQ-23-07 stays open, phase NOT verified. BLOCKER IN PATH: a DownloadManager failure does not cancel its own depot download — see `.planning/todos/pending/2026-08-16-orphaned-depot-download-outlives-failure.md`; both HUMANKIND install attempts on 2026-08-16 died on `install did not settle`, so fix that before attempting Gate 2.)
- [x] **Phase 24: macOS native Steam bridge (out-of-process steam_api proxy)** - Out-of-process steam_api shim so bottled Windows-only Steam games run against ONE native macOS Steam client instead of a bottled Windows Steam client per bottle (16/17 plans — 24-10, the human-HW packaged-build acceptance checkpoint, has no SUMMARY.md; Gates 0/1/2/3 PASS on real hardware per 24-UAT.md and gap cycles 24-11..24-17 closed the shim-overwrite/install-poll/launch/sync clusters; Gate 4 (Hoard) explicitly out of scope — bridge proxies only ISteamUser + ISteamFriends; superseded/parked the multi-bottle-families phase, see `## Parked / Superseded Phases`)
- [x] **Phase 25: Steam depot download multi-host fan-out (throughput)** - Raises native-depot download throughput toward Steam-client parity by fanning chunk attempts across multiple healthy CDN hosts instead of one (completed + hardware-verified 2026-07-19: hosts=3, ~10 MiB/s vs 1.5–2.9 MiB/s baseline)
- [x] **Phase 26: Steam Key Redemption** - Users can redeem a loose Steam product key into their own Steam library from inside GameLib via steam-user's redeemKey(), without ever opening the Steam client (completed 2026-07-20)

<details>
<summary>✅ v0.8 Tauri Shell (Phases 27–50, + parked 22) — SHIPPED 2026-10-16 (override closeout: 26 of 45 phases not both complete and verified at close; 429 open artifacts acknowledged, 140 evidence-table rows left open)</summary>

**v0.8 — Tauri Shell** — Rust/Tauri v2 shell + Node sidecar rearchitecture, the incremental IPC port, Windows/Linux/macOS packaging, the Electron cutover, and the post-cutover UI/runner work that followed it.

- [ ] **Phase 22: Steam Game Families (multiple bottle configurations)** — 0/8 plans; ⛔ SUPERSEDED 2026-07-21 by Phase 24 (filed under v0.7 originally; archived with v0.8 by the tool — see `## Parked / Superseded Phases`)
- [x] **Phase 27: Tauri Shell Walking Skeleton** - Rust/Tauri v2 shell + stdio JSON-RPC sidecar + renderer bridge proven end-to-end against the real Steam store-manager code (read flow + launch flow), with a SEAM.md ported-vs-stubbed boundary for the incremental port (completed 2026-07-21, 5/5 plans)
- [x] **Phase 28: Tauri keyring (real safeStorage)** - Swap the plaintext-passthrough stub for spike 011's `keyring` crate path so the sidecar stores its token in the real OS Keychain (keyring-native, not OSCrypt-compatible — see D-01; does NOT unblock Phase 27 UAT 2/3 — see D-03). **Must land before any token-writing channel is wired** (shared store — the stub would silently sign the user out of the real app) (completed 2026-07-22)
- [x] **Phase 29: Tauri store layer** - Grow the sidecar store past the two skeleton stores to cover the ~18 files routing through `electron_store.ts`, so later slices have config to read (completed 2026-07-22)
- [x] **Phase 30: IPC re-plumb slice 1 (install/uninstall/update-check)** - First user-facing domain slice of the ~217 unported endpoints, following SEAM.md's incremental-port checklist (completed 2026-07-22)
- [x] **Phase 31: IPC re-plumb slice 2 (settings/config)** - Settings/config cluster plus the Tauri `dialog` plugin surface those flows need (3 plans executed 2026-07-23; verification gaps_found — gap plan 31-04 added to close CR-01 dialog auto-confirm blocker + WR-01 path-traversal, de-wiring showMessageBox to a safe resolved sentinel ({response:-1}, never rejects) with real multi-button behavior deferred to Phase 33) (completed 2026-07-23)
- [x] **Phase 32: IPC re-plumb slice 3 (downloads/queue)** - Download-manager/queue cluster; exercises the push-notification path at real volume (completed 2026-07-23)
- [x] **Phase 33: Tauri lifecycle cluster** - Real behavior for the 44-file `app`/`dialog`/window/`Notification`/tray/protocol/updater cluster; scope the `session`/`powerSaveBlocker` parity gaps explicitly (completed 2026-07-23)
- [x] **Phase 34: Tauri packaging (Windows/Linux)** — COMPLETE 2026-07-25. Cross-platform builds, signing, notarization, and an auto-update feed pointed at the GameLib fork — 17/17 plans executed (gap cycle 3 all closed: 34-16 closed GAP-A, the macOS codesign-on-empty-secret blocker from live run 30084918812; 34-17 closed GAP-B's code half, pnpm verify:updater-key; 34-18 closed GAP-B's human half via Branch B — regenerated + re-enrolled matched updater keypair, new key id 9A02F7E0C9FC04C7). **Live tag-push gate PASSED (REQ-34-09): run [30123449346](https://github.com/grayson-mitchell/GameLib/actions/runs/30123449346) on commit 006a900a — all 4 legs green, draft+prerelease release with all artifacts + latest.json, macOS+Windows signing gracefully skipped, arm64 SEA sidecar ran Node-free.** Secure-phase DONE (34-SECURITY.md, 42/42 threats closed, threats_open: 0). One build-blocking merge slip fixed en route (paths.ts missing `resolve` import, commit 006a900a).
- [x] **Phase 35: Electron cutover** - Remove the Electron build; the one phase that intentionally breaks the additive/reversible invariant, so it runs last — **✅ GOAL ACHIEVED, 17/17 (2026-09-01).** 29 plans executed incl. gap-closure cycle 1 (35-20..35-29, all 10 complete). Six adjudication passes: 11/17 → 16/17 → 17/17 **rejected** → 16/17 → 16/17 → **17/17**, the sixth being the first verified against a **GENUINE RELEASE ARTIFACT** rather than a debug-packaged one (`F-5-01`: `tauri build --debug` structurally never executes the SEA sidecar, so the earlier identity check had verified an inert artifact; the chain was closed at the RUNNING PROCESS instead — PID 9781 `gamelib-shell` → PID 9787 **bundled** `gamelib-sidecar`, both sha256-identical to that build's outputs). Blocking live gate 21/21 PASS. **`35-VERIFICATION.md` stays `status: human_needed` BY DESIGN, not as a default** — 7 human items remain, and `gaps_found` would make the phase vanish from `audit-uat` entirely, taking criterion 14's genuinely-open UI-repaint item with it. **Three records blockers CLOSED 2026-09-01 by quick `260901-vuy`** (no code, no gesture): the `35-LIVE-GATE.md` writeback, the Phase 38 inheritance now ledgered as `38-W06`, and REQ-35-07 deconditioned from `D-35-19-15`. **STILL OPEN, do NOT read as closed:** `D-35-19-15` (unreproducible by construction — `b5b3464bd` removed the window that seeded the sibling apexes; the domain-*suffix* half IS exercised, the four sibling apexes are not), criterion 14's unobserved repaint, criterion 10's AppleEvent path. **Routed out:** `pnpm lint` → Phase 39; Windows/Linux and off-macOS Epic logout → Phase 38.
- [x] **Phase 34.1: Tauri IPC re-plumb slice 4 — app shell and window chrome** — 15/15 plans; verified
- [x] **Phase 34.2: Tauri IPC re-plumb slice 5 — game details, settings and overrides** — 30/30 plans; verified
- [x] **Phase 34.3: Tauri IPC re-plumb slice 6 — shell, files, logs and diagnostics** — 9/9 plans; verified
- [x] **Phase 34.4: Tauri IPC re-plumb slice 7 — Steam completion and Humble** — 10/10 plans; verified
- [x] **Phase 34.4.1: Tauri embedded-browser login seam** — 35/35 plans; executed; verification record unparseable at close
- [x] **Phase 34.4.2: macOS login-window UX — modal child-window attachment + in-field autofill affordance** — 25/25 plans; live gate PASS 5/5 2026-08-19; verification stale at close
- [x] **Phase 34.5: Tauri IPC re-plumb slice 8 — non-Steam runners, Wine and shortcuts** — 61/61 plans; completed 2026-08-20; no VERIFICATION.md
- [x] **Phase 34.6: Tauri IPC re-plumb slice 9 — EOS overlay, SteamGridDB artwork, winetricks** — 21/21 plans; executed; verification stale at close
- [ ] **Phase 34.7: Epic device-auth single sign-in path** — 0/0 plans; ⛔ SUPERSEDED 2026-11-11 by quick `260822-r3g` (embedded login primary again; never planned — see `## Parked / Superseded Phases`)
- [x] **Phase 34.8: Frontend i18n compliance for fork-added code** — 14/14 plans; executed; no VERIFICATION.md
- [x] **Phase 34.9: macOS runner onedir repackaging — eliminate the PyInstaller cold-start spawn tax** — 33/33 plans; verified
- [x] **Phase 34.10: Navigation shell — horizontal card tabs replace the sidebar** — 27/27 plans; verified
- [x] **Phase 34.11: Library filtering — search, views, collections and cross-store facets** — 9/9 plans; verified
- [x] **Phase 34.12: Onboarding tour rework — re-anchor the disabled SidebarTour against the two-tier NavShell** — 7/7 plans; executed; no VERIFICATION.md
- [x] **Phase 34.13: Steam install-time wine/bottle form (GOG parity)** — 14/14 plans; completed 2026-08-28; human_needed
- [x] **Phase 34.14: Steam platform-row depot signal — 'no Windows build' vs 'metadata not captured'** — 5/5 plans; verified
- [x] **Phase 34.15: Steam platform-signal and sync integrity** — 9/9 plans; completed 2026-08-16, verified
- [x] **Phase 34.16: macOS runner onedir x64 CI leg** — 11/11 plans; executed; no VERIFICATION.md
- [x] **Phase 34.17: `PathSelectionBox` input commit — Enter-to-commit and the unconfirmed paste failure** — 3/3 plans; verified
- [x] **Phase 34.18: Retire the macOS x64 (Intel) CI leg — arm64-only macOS runners and app builds** — 7/7 plans; completed 2026-08-27, verified
- [x] **Phase 36: Login-to-Steam crossfade and explicit login-in-flight mitigation** — 3/3 plans; completed 2026-08-21; no VERIFICATION.md
- [x] **Phase 37: Steam defect cluster — depot decode failure, false-delisted games, install-error reporting** — 7/7 plans; completed 2026-08-22, verified
- [x] **Phase 38: Deferred hardware and environment UAT gates — Windows/Linux machine and game controller** — 0/0 plans; completed 2026-10-01, verified (gate-only phase, no plans)
- [x] **Phase 39: Post-cutover CI honesty — lint debt, the two red planning gates, dead `getLoginWindowSeam` branches** — 9/9 plans; completed 2026-09-02, verified
- [x] **Phase 40: In-app store and wiki browsing under Tauri — embedded child webview** — 11/11 plans; completed 2026-09-05; verification status unknown at close
- [x] **Phase 41: i18n gate honesty — make the translation and hardcoded-string gates report what they cannot see** — 7/7 plans; verified
- [x] **Phase 42: Humble key platform identity — evidenced key_type table, per-platform redeem deep links** — 7/7 plans; executed; verification stale at close
- [x] **Phase 43: Humble Keys screen — unified list replacing the three tabs, with search, sort and filters** — 10/10 plans; verified
- [ ] **Phase 44: In-app Winetricks browse UI replacing the search-only panel** — 7/8 plans; ⛔ SUPERSEDED BY PHASE 45 (2026-09-18)
- [x] **Phase 45: Native in-app Winetricks UI redesigned from scratch** — 12/12 plans; executed; no VERIFICATION.md; winetricks live gate FAILED 2026-10-10 (dialog overflow, verb-1 Queued race) — re-run owed
- [x] **Phase 46: Windows single-instance guard and gamelib:// deep-link registration** — 7/7 plans; verified
- → **Phase 47: Migrate aggregated store search from CheapShark to IsThereAnyDeal** — moved to v0.10 Foundations (2026-11-12)
- [x] **Phase 48: Focus row — move the library top section into the panel and widen it** — 18/18 plans; completed 2026-10-09; verification stale at close
- [x] **Phase 49: Cross-store signed-out / offline mode** — 12/12 plans; completed 2026-10-09; verification stale at close
- [x] **Phase 50: Epic store in-app on macOS — a Rust-managed raw WKWebView subview for /store/epic** — 6/6 plans; verified retrospectively 10/16 truths; gaps_found at close (G-50-16 timeout banner owed a macOS re-run)

</details>

<details>
<summary>✅ v0.9 Steam Bridge & Engine (Phases 51–60) — SHIPPED 2026-11-06 (audit `tech_debt`, 10/10 phases verified passed; 782 open artifacts acknowledged as deferred — see MILESTONES.md)</summary>

**v0.9 — Steam Bridge & Engine** — widening the macOS native Steam bridge (interface coverage, SteamStub/DRM mode, callbacks, multiplayer, overlay), no authenticated CM logon at launch, opt-in known-fix sharing, and the CrossOver-unavailable engine fallback. Audit: `milestones/v0.9-MILESTONE-AUDIT.md` (2026-11-05, `tech_debt`, 17/17 requirements, no blockers).

- [x] **Phase 51: Widen the native Steam bridge — more interface proxies, scan-derived eligibility** — 30/30 plans; verified 7/7 (done-when met via Phase 53)
- [x] **Phase 52: Bridge-backed steamclient.dll for SteamStub titles** — 37/37 plans; verified 7/7 against the amended done-when (Grim Dawn menu delivered by Phase 56)
- [x] **Phase 53: Steam bridge coverage: modern-SDK exports, flat API** — 20/20 plans; verified (10 of 18 census titles, majority)
- [x] **Phase 54: No authenticated Steam logon at launch, browse or Play** — 14/14 plans; verified 6/6
- [x] **Phase 55: Steam bridge callback delivery for the web-API auth ticket** — 7/7 plans; verified 10/10
- [x] **Phase 56: Bridge steamclient-layer DRM mode for SteamStub titles** — 34/34 plans; verified 2/2
- [x] **Phase 57: Opt-in known-fix sharing via relay** — 12/12 plans; verified 6/6
- [x] **Phase 58: Steam bridge multiplayer** — 37/37 plans; verified 7/7 (M-01..M-07, caveats recorded)
- [x] **Phase 59: Steam engine fallback when CrossOver is unavailable** — 53/53 plans; verified 13/13 (1 override)
- [x] **Phase 60: Steam overlay in bridged games on macOS** — 20/20 plans; verified 6/6

</details>

<details>
<summary>✅ v0.10 Foundations (Phases 47, 61–81) — SHIPPED 2026-11-20 (audit `tech_debt`, 17/17 requirements, 26/26 phases verified, 72/74/81 closed human_needed; override closeout: 210 open artifacts acknowledged, 140 v0.8 evidence-table rows left open)</summary>

**v0.10 — Foundations** — backend DI and module state to zero, IPC schemas and versioned stores, GlobalStateV2 and the GameInfo split, the Steam stack in Rust (scanners, depot, file formats, CM client, polls), Steam game updates, the theme editor, IsThereAnyDeal search, restart-on-Play and the v0.9 audit debt. Audit: `milestones/v0.10-MILESTONE-AUDIT.md`.

- [x] **Phase 61: Unified macOS engine for all stores** — 27/27 plans (20 + 7 gap closure); re-verified 22/22, operator approved 2026-11-07 (completed 2026-11-07)
- [x] **Phase 62: Module boundaries and decomposition** — 23 plans (21 + 2 gap closure); complete (completed 2026-11-07)
- [x] **Phase 63: Rust migration pattern and executable scanners** — 14 plans; planned (completed 2026-11-07)
- [x] **Phase 64: UI to edit themes** — 11 plans (10 + 1 gap closure); re-verified 8/8 after CR-01 closure (completed 2026-11-20)
- [x] **Phase 65: Steam store manager decomposition, continued** — 20/20 plans complete; Phase 61 closed 2026-11-07 — unblocked, D-11 (completed 2026-11-08)
- [x] **Phase 66: Backend dependency injection replacing module-level singletons** — 9 plans; planned; split 2026-11-10 into 66 (foundation) + 66.1–66.3 (completed 2026-11-09)
- [x] **Phase 66.1: Backend DI — stores, store managers, flow registrations and launcher** — 37 plans; complete (7/8 live UAT, item 5 blocked pre-existing) (completed 2026-11-10)
- [x] **Phase 66.2: Every backend spawn through the process runner, then the `child_process` ban** — 12 plans; planned (completed 2026-11-10)
- [x] **Phase 66.3: Backend module state to zero, then the live macOS smoke** — 18 plans; planned; split 2026-11-11 into 66.3 (shim, config, D-05 owners, static holders) + 66.4 (D-66.3-04) (completed 2026-11-11)
- [x] **Phase 66.4: Backend module state long tail, the census-to-test flip, then the live smokes** — 25 plans (2 gap closure for G-66.4-W2); planned (completed 2026-11-14)
- [x] **Phase 67: Schema validation at the sidecar IPC boundary** — 20 plans in 14 waves; planned 2026-11-07 (completed 2026-11-07)
- [x] **Phase 68: Versioned persisted stores and migrations** — 11 plans; planned (completed 2026-11-08)
- [x] **Phase 69: Consolidate frontend state onto GlobalStateV2** — 26/26 plans; complete (completed 2026-11-14, human UAT 3/3, security 63/63 closed)
- [x] **Phase 70: Split GameInfo into shared and per-store shapes** — 22 plans executed (16 + gap closure 70-17..70-22); re-verification passed 2026-11-14, G1–G3 closed; review follow-ups WR-01/02/03 open in 70-REVIEW.md (completed 2026-11-14)
- [x] **Phase 71: Rust shell module decomposition** — 20 plans; complete (completed 2026-11-09, gaps closed by 71-19/71-20)
- [x] **Phase 72: Renderer trust boundary and process hardening** — 0 plans; not started (completed 2026-11-08)
- [x] **Phase 73: Steam depot download pipeline in Rust** — 21 plans; complete (completed 2026-11-10)
- [x] **Phase 74: Steam game updates** — 36 plans (4 gap-closure rounds); live gate passed 2026-11-14 (UAT 29-30), review WR-01/WR-02 deferred to todos (completed 2026-11-14)
- [x] **Phase 75: Steam local file formats in Rust** — 35 plans in 20 waves; planned 2026-11-14 (completed 2026-11-14)
- [x] **Phase 76: Engine-correct bottle for DRM-mode launches (v0.9 audit S9)** — 5 plans in 3 waves; gap closure 76-03..05 verified live (UAT 6-8) (completed 2026-11-17)
- [x] **Phase 77: Runtime hardening from the v0.9 review debt** — 3 plans in 2 waves; planned (completed 2026-11-16)
- [x] **Phase 78: Verification records and test health after v0.9** — 5 plans in 2 waves; planned (completed 2026-11-17)
- [x] **Phase 79: Rust CM client replacing steam-user and steam-session** — 44 plans in 21 waves; planned (spike 085 gate satisfied) (completed 2026-11-15)
- [x] **Phase 80: Steam install, uninstall and update polling state machines in Rust** — 33 plans; planned (completed 2026-11-16)
- [x] **Phase 81: Unify the Steam restart hold into restart-on-Play** — 20/20 plans; human_needed 14/15, UAT item 12 deferred by operator (completed 2026-11-20, override closeout)
- [x] **Phase 47: Migrate aggregated store search from CheapShark to IsThereAnyDeal** — 22 plans (13 + 5 gap closure from UAT 2026-11-18 + 4 from UAT 2026-11-19); ITAD gates closed 2026-11-12; planned 2026-11-14 (moved from v0.8) (completed 2026-11-19)

</details>

**🚧 v0.11 Node Sidecar Retirement** (planned 2026-11-17; current since 2026-11-20; requirements `REQUIREMENTS-v0.11.md`)

- [x] **Phase 82: Guardrails, hygiene and shared safety primitives** — 20/20 plans (16 + 4 gap closure); completed 2026-11-21
- [x] **Phase 83: Native seam, gamelib-core and process/shutdown contract** — 11/11 plans; completed 2026-11-21
- [x] **Phase 84: Logger** — 18/18 plans (11 + 7 gap closure); completed 2026-11-22
- [x] **Phase 85: Store host, config and versioned migrations** — 25/25 plans in 20 waves (the D-03 deletion split into four plans for context budget); completed 2026-11-22
- [x] **Phase 86: Pure leaf services** — 27/27 plans in 21 waves (26 + 1 gap closure); completed 2026-11-23
- [ ] **Phase 87: Engine, Wine and tools** — 59 plans in 38 waves; planned 2026-11-23 (executes after Phase 86 closes)
- [x] **Phase 88: Launch scaffolding and known fixes** — 17/17 plans in 14 waves; completed 2026-11-25 (SVC-03 part 1 of 4; split 2026-11-25, 88-CONTEXT D-30)
- [ ] **Phase 88.1: Launch builders and prepare steps** — 24 plans (20 in 15 waves + 4 gap closure for CR-01, planned 2026-11-26); planned 2026-11-25 (SVC-03 part 2 of 4; D-30)
- [ ] **Phase 88.2: Command runner and game processes** — 25 plans in 18 waves; planned 2026-11-26, re-sliced the same day to fit the smart-zone budget and file cap (SVC-03 part 3 of 4; D-30)
- [ ] **Phase 88.3: Launch funnel, re-adoption and the live gate** — not planned (runs the Phase 88 live gate)
- [ ] **Phase 89: Steam library state** — not planned
- [ ] **Phase 90: Steam services and TypeScript depot path** — not planned (session, sign-in and redeem; split 2026-11-24, 90-CONTEXT D-01)
- [ ] **Phase 90.1: Steam install, update, uninstall and the depot path** — not planned
- [ ] **Phase 90.2: Steam launch, Mac Steam adoption and the router** — not planned (runs the 90/89 live gate)
- [ ] **Phase 91: Epic (legendary) runner** — not planned
- [ ] **Phase 92: GOG, Amazon and sideloaded runners** — not planned
- [ ] **Phase 93: Download manager** — not planned
- [ ] **Phase 94: Humble Bundle and shortcuts** — 32 plans in 18 waves; planned 2026-11-24 (Lane C, its own worktree, parallel with 87; D-01, D-02)
- [ ] **Phase 95: Steam bridge install** — not planned
- [ ] **Phase 96: Steam bridge launch and bottle lifecycle** — not planned
- [ ] **Phase 97: Steam bridge DRM mode, overlay and known fixes** — not planned
- [ ] **Phase 98: Shell cutover** — not planned
- [ ] **Phase 99: Sidecar deletion** — not planned
- [ ] **Phase 100: Game page without the ⋮ menu**
- [ ] **Phase 101: Steam Verify & Move install**

## Phase Details

Phase details for every phase through 50 live in the archived roadmap, `milestones/v0.8-ROADMAP.md`
(`## Phase Details` for phases 1–9, `## v0.2 Phase Details` … `## v0.8 Phase Details`); phases
51–60 are in `milestones/v0.9-ROADMAP.md` (`## v0.9 Phase Details`); phases 47 and 61–81 are in
`milestones/v0.10-ROADMAP.md` (`## v0.10 Phase Details`). New phases
for the next milestone are added below this line by `/gsd-phase`.

## Parked / Superseded Phases

### Phase 22: Steam Game Families (multiple bottle configurations)

**Status:** ⛔ SUPERSEDED 2026-07-21 by Phase 24 (permanent — will not be unparked). See `.planning/milestones/v0.8-phases/22-multiple-steam-bottles/PARKED.md` (moved there by the v0.8 archive on 2026-10-16) and commit `b40aa6d8`.
**Plans:** 8 written, 0 executed — all artifacts retained, nothing deleted.

**Why:** Phase 22 existed to let a user group macOS Steam games into "families," each backed by its own dedicated CrossOver bottle with its own Steam client/login/Wine version, working around the fact that the Phase 17 single-bottle foundation shared one bottle for every macOS Steam game. Phase 24 shipped a native `steam_api` proxy instead: a drop-in shim in a single shared bridge bottle talks out-of-process to the real native macOS Steam client. For a bridge-routed game there is no bottled Windows Steam client to configure per family, so the per-family bottle matrix Phase 22 was designed to manage has nothing to manage on that path. **That path is narrow, though (corrected 2026-10-16):** `isBridgeEligible()` (`steam/games.ts`) requires membership of `bridge/bridge-allowlist.json`, which holds two games (Avernum 5 and 6). Every other bottle-eligible macOS Steam game still falls through to the Phase 17 path — the Windows Steam client inside the one shared `GameLibSteam` bottle — so the single-bottle limitation Phase 22 addressed is still live for nearly the whole bottled library. The bridge itself also uses one shared bottle (`DEFAULT_BRIDGE_BOTTLE_NAME`); that was a planning choice in `24-04-PLAN.md` that stretched D-03 (one shared helper *process*) to the bottle, not an operator decision. The supersession stands because the intended fix is to widen the bridge and give bridge games their own bottles, not to multiply Steam-client bottles; see todos `2026-10-16-widen-the-native-steam-bridge-beyond-two-games` and `2026-10-16-bridge-games-should-each-get-their-own-bottle`. This was anticipated: the bridge was already recorded in STATE.md as "Phase 22's preferred successor" before Phase 24 was executed.

**Goal (as originally scoped, never executed):** Let a user group macOS Steam games into "families" — each family backed by its own dedicated CrossOver bottle with its own Steam client, login, and Wine/CrossOver version — so games that need a different configuration can get one, instead of every macOS Steam game sharing the single Phase 17 bottle.
**Depends on (as scoped):** Phase 17 (dedicated Steam bottle foundation) and Phase 18 (bottle-eligibility routing). Independent of the Phase 20/21 lines.
**Requirements**: TBD (never minted — SPEC.md never locked)

**Plans (unexecuted):**

- [ ] 22-01-PLAN.md — Reshape SteamBottleConfig → families/assignments + thread explicit bottleName through bottle.ts primitives
- [ ] 22-02-PLAN.md — families.ts service: zero-loss migration, CRUD, resolveFamilyForApp, naming rules
- [ ] 22-03-PLAN.md — Cross-family ACF reconciliation + poller: scan all families, tag bottleName
- [ ] 22-04-PLAN.md — Resolver-first routing in games.ts across all four bottle-eligible methods
- [ ] 22-05-PLAN.md — Fold single-bottle IPC into the family group + wire startup migration
- [ ] 22-06-PLAN.md — Parameterize the guided-setup store/component by bottleName
- [ ] 22-07-PLAN.md — Install-time family picker + gate both install chokepoints
- [ ] 22-08-PLAN.md — "Steam Families" Settings section: create/rename/set-wine/guarded delete

**Not revivable — salvage means a NEW phase:** this phase is permanently superseded and will not be executed. The parts that could still have value are the ones *not* about bottle multiplicity — chiefly any per-game launch-configuration UI and the Steam game-families data model itself. If either is wanted, scope it as a new phase derived against the bridge architecture; do not resume these plans. Bridge scope limits that might reopen adjacent work are tracked in Phase 24's own artifacts (`24-UAT.md`, `24-SECURITY.md`) and the `spike-findings-gamelib` skill — notably that the bridge currently proxies only ISteamUser + ISteamFriends, so games needing more interfaces (Utils/Apps/UserStats/RemoteStorage/Matchmaking/Networking) are out of scope until those proxies are built.

### Phase 9: Quality Gate

**Status:** ⛔ SUPERSEDED 2026-11-11 (permanent — will not be executed). Never started: no phase directory, no plans. Requirement QA-01 is closed as superseded, not satisfied.
**Why:** The phase was a formal Nyquist validation pass over the v0.1 (AUTH-01..05, LIB-01..04, GAME-01..04, BRAND-01) and v0.2 phases. Those phases shipped on Electron; the Rust/Tauri rearchitecture and the Electron cutover (Phases 34–35), and the decomposition and Rust-migration phases since, rewrote most of the code it would have validated, so a pass over the original phases would check code that no longer exists.
**Superseded by:** Phase 35's blocking live gate (21/21 PASS, verified 17/17 against a genuine release artifact); Phase 38's Windows/Linux hardware and controller UAT gates; and the per-phase `*-VERIFICATION.md` / `*-UAT.md` record of every phase since. The v0.2 milestone audit's QA-01 gap (`v0.2-MILESTONE-AUDIT.md`) is closed by this decision.
**Not revivable — salvage means a NEW phase:** if a regression sweep of the original requirement IDs against the current app is wanted, scope it as a new phase against the Tauri app.

### Phase 34.7: Epic device-auth single sign-in path

**Status:** ⛔ SUPERSEDED 2026-11-11 (was ⏸ ON HOLD since 2026-08-22). Never planned: 0 plans; the archived directory `milestones/v0.8-phases/34.7-epic-device-auth-single-sign-in-path/` is empty. Full history is in `milestones/v0.8-ROADMAP.md` under this phase.
**Why:** The phase would have made Epic device-auth (SIDLogin) the only sign-in path and deleted the embedded login, on the 2026-08-05 finding that Epic's Talon anti-bot 403 made the embedded WebKit login permanently unusable under Tauri. The pristine (zero-injection) WKWebView login window later defeated that 403, and quick `260822-r3g` (commit `1431b4c03`) restored the embedded login as the primary tile with SIDLogin as the alternative. The premise no longer holds.
**Nothing owed:** both residuals were re-homed to Phase 34.6 on 2026-08-22 — the Epic / `egsSync` / legendary save-sync live checks (34.5 UAT tests 11–13) and the Epic leg of Phase 35's dependency; the device-auth consolidation leg was withdrawn.
**Revival trigger:** if Epic's 403 returns on the embedded login, scope a NEW phase for a device-auth single path against the then-current app; do not resume this entry.

## Backlog

Phase 999.1 (cross-store signed-out / offline mode) was promoted to Phase 49 on
2026-10-08; its full text now lives under that entry.

### Phase 999.2: x86 shim coverage — flat C API and current interface versions (BACKLOG)

32-bit titles that need the flat API get the shim withheld by design (D-53-09 deferred x86):
`classifyUnservableInterfaceVersions` reports their versions as blocking, so
`placeShimForGame` leaves the game's own `steam_api.dll` in place and the launch runs with no
helper.

**Already landed (quick 261120-rdo, 2026-11-20):** x86 `CreateInterface`, the modern
`SteamInternal_*` family plus `SteamAPI_GetHSteamUser`/`GetHSteamPipe`, manifest-backed x86
null objects, and x86 service of the versions Amnesia (57300) and Low Magic Age (576770)
request. Amnesia is bridge-verified.

**Remaining scope (the flat tier)** is all-or-nothing, because Steamworks.NET's
`CSteamAPIContext.Init` fails on the first NULL lookup:
1. Generator: `meta/gen_vtables.ts` emits about 900 x86 flat `SteamAPI_ISteam*` exports
   through `__thiscall` slot casts, keeping the D-53-07 NULL flat-lookup contract.
2. Widen about 14 interface versions to x86 (SteamClient020, SteamMatchGameSearch001,
   SteamNetworking006, …), and extract or check 2–5 more (STEAMREMOTESTORAGE014, STEAMUGC014,
   NetworkingSockets/Utils, GameServer013). Each needs i386 `stackBytes` manifests.
3. Port the x86 `SteamAPI_ManualDispatch_*` family and add the bare `SteamClient` export
   (both found missing in quick 261121-ley).
4. Generate the x86 export list in place of the hand-pinned `SHIM_EXPORTED_SYMBOLS`, update
   `shimCoverage.ts` and the census, then run the live gate.

**Research step first:** how the old instance-pointer-first flat convention and
`ManualDispatch` behave on x86 under Wine. Source todo:
`.planning/todos/pending/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md`
(items a–e, the 2026-11-20 measurement and the 261121-ley diagnosis).

**Promotion trigger:** a second x86 title that needs the flat API appears in `pnpm bridge-census`,
or this is picked from the backlog.

**Acceptance title:** Cat Quest (593280, 32-bit Mono Unity, Steamworks.NET), at the strict
verified bar: shim HELLO plus a clean game Steam-init line in its `error.log` /
`output_log.txt`. Diagnoses: `.planning/debug/resolved/cat-quest-shim-withheld.md` and quick
`261121-ley` (the 2026-11-20 no-HELLO baseline was a withheld shim).

**Second acceptance title:** Undertale (391540, GameMaker 1.4 x86 runner, runtime-loaded
`steam_api.dll`). The runner resolves `SteamAPI_InitSafe`, `SteamAPI_GetHSteamPipe` and
`SteamAPI_GetHSteamUser` by name. Since quick 261120-rdo the x86 shim exports the last two,
but not `SteamAPI_InitSafe`, so init still never reaches the shim and HELLO is never sent.
Adding `SteamAPI_InitSafe` is a small item and may be worth splitting out ahead of the flat tier. The shim is now withheld for this shape (original restored from
`.gamelib-orig`, direct launch, no helper), not bridged, so it is **not verified**. Same strict
bar as Cat Quest: shim HELLO plus a game-originated bridge call. Diagnosis:
`.planning/debug/resolved/undertale-shim-placed-no-hello.md`.

**Adjacent, deliberately NOT folded in:** confirming that `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD` and `APPLE_SIGNING_IDENTITY` are enrolled as repo secrets — without
them `.github/workflows/release-tauri.yml` ships unsigned, giving each release a fresh code
identity so the macOS Keychain ACL never matches and users get re-prompted on every update. That
is the actual lever on prompt *quantity*, it is independent of this phase, and it should not wait
on it.

## v0.11 Phase Details

Milestone v0.11 Node Sidecar Retirement. Planned 2026-11-17 alongside v0.10; starts when v0.10 closes. Requirements: `REQUIREMENTS-v0.11.md`. Research: `research/v0.11/SUMMARY.md`. Rules that apply to every port phase: the phase's last plan deletes the TypeScript it replaced and its sidecar channel registrations; any `GAMELIB_<SLICE>=rust|ts` fallback flag is removed in the same phase unless a named fallback window is recorded in the phase's plan; live gates are authored before coding; golden traces are recorded from TS before porting.

**Lanes** (set 2026-11-24 from the research's own dependency rules and a check of the TS imports; each lane runs in its own worktree):

- **Lane A — Steam (sets the pace):** 87 → 88 → 88.1 → 88.2 → 88.3 → 89 → 90 → 90.1 → 90.2 → 95 → 96 → 97
- **Lane B — runners:** after 88.3: 91 → 92 → 93 (93 also waits for 90.1, because the download queue calls Steam install code: `cancelDelete`, `queueHeadRevalidation`, `gameRequirements`)
- **Lane C — Humble and shortcuts:** 94, startable now (Humble imports only Steam *types*; shortcuts use `process/context` and the Rust steamfiles)
- **Join:** 98 after 93, 94 and 97; then 99.

Rules for lanes running side by side: give each lane its own worktree and STATE position (`/gsd-workstreams`, or snapshot and restore STATE.md and state.json around phase.complete and plan-phase); commit planning files with `--files`; rebase onto main before each phase's deletion plan, because every port phase edits the channel manifest, `relay_commands.rs`, `Cargo.lock` and `EXPECTED_LOCKFILE_CRATE_NAMES`.

### Phase 82: Guardrails, hygiene and shared safety primitives

**Goal**: The backend test suite is trustworthy and the shared safety rules exist before any code is ported, so no later slice can fail open, delete a sibling game, or pass a drift gate vacuously.
**Requirements**: FND-01, FND-02
**Depends on**: Nothing (first v0.11 phase; starts when v0.10 closes)
**Research flag**: Standard
**Success Criteria** (what must be TRUE):
  1. `pnpm test` runs every backend suite green, or each previously red suite is retired with a recorded reason in a ledger; no suite is left on a known-red list
  2. The IPC census and flow-registration census gates fail when their input set is empty or truncated (a deliberate empty-input test proves they cannot pass vacuously)
  3. Uninstalling a game, removing a bottle or resetting a store refuses with a visible error when the guarding check returns "unknown" (one injected-rejection test per guard)
  4. Uninstalling a game never deletes a sibling game co-installed beside it, proven by an adversarial path table (nested installdir, `.\x`, `C:\x`, UNC, symlink, case, NFC/NFD) on macOS, Windows and Linux
  5. The `utils.ts` and `bootstrap.ts` responsibility inventory and the milestone-wide state-ownership table are committed, and the zero-risk deletions (type-only files, dead exports, `legendary/commands/*`, `CI=e2e` mocks; `fileStore.ts` only after the live-or-dead check) are gone

**Plans:** 20/20 plans complete (16 + 4 gap closure)

Plans:
**Wave 1**
- [x] 82-01-PLAN.md — Re-measure the red set from a clean worktree, fix the jest reds and the D-20 Rust CI reds, open 82-TEST-LEDGER.md
- [x] 82-02-PLAN.md — Floor + empty-input guards on every census-style gate (D-05)
- [x] 82-03-PLAN.md — gamelib-safety + gamelib-testutil crates, adversarial path table, TS wire mirror, first CI step, README rules

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 82-04-PLAN.md — Delete fileStore.ts after the live-or-dead check; D-05 guard on diPhaseGates
- [x] 82-05-PLAN.md — Shell arms + IPC contract + fail-closed rustSafety adapter, known installs, protected roots, test tooling
- [x] 82-06-PLAN.md — Refusal notice vertical slice (FrontendMessage, store, toast, i18n)
- [x] 82-13-PLAN.md — Delete proxy-types.ts and the dead src/backend exports/types, lowering the knip baseline
- [x] 82-14-PLAN.md — utils.ts/bootstrap.ts responsibility inventory and the milestone-wide state-ownership table

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 82-07-PLAN.md — Guard uninstall pre-flight, prefix, GOG, sideload (D-22) and resetHeroic
- [x] 82-08-PLAN.md — Guard Steam bridge uninstall and per-game bridge bottle removal

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 82-09-PLAN.md — Guard Steam bottle-direct uninstall, copy removal and cancel-delete; Steam delete gate
- [x] 82-10-PLAN.md — Delete the gogdl CI=e2e stub end to end (tracer for the e2e surface)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 82-15-PLAN.md — Delete the legendary and nile CI=e2e stubs and the TestSync kind

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 82-16-PLAN.md — Remove the remaining CI === 'e2e' branches; e2eSurfaceGone zero-hit gate

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 82-11-PLAN.md — Final clean-worktree proof (explicit provenance), push checkpoint, three-OS CI proof

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 82-12-PLAN.md — Per-suite retirement decisions (D-03) and ledger close

**Gap closure** *(82-VERIFICATION.md gaps 1-4; review CR-01, WR-01, WR-03, WR-04, WR-07, WR-08; planned 2026-11-20; run with `/gsd-execute-phase 82 --gaps-only`)*
- [x] 82-17-PLAN.md — gamelib-safety: an absent trust root is judged at its nearest existing ancestor (CR-01/WR-01), an empty trustRoot is unknown (WR-04), lexical rows cannot pass vacuously (WR-08), shared trust-root contract fixture (gap closure, wave 1)
- [x] 82-18-PLAN.md — Raw-delete detector sees member calls on any receiver and opaque options, gates portable to Windows (WR-07); safety_remove_tree unbounded (WR-03) (gap closure, wave 1)
- [x] 82-19-PLAN.md — Fake safety transport models trust roots and is pinned to the crate by the shared contract; GOG and cancel absent-folder tests; review dispositions and deferred-findings todo (gap closure, wave 2)

**Gap closure, UAT re-test** *(82-UAT.md G-82-2-r2: sharedRedistInstall installer-timeout flake in Test run 44850161668; planned 2026-11-21; run with `/gsd-execute-phase 82 --gaps-only`)*
- [x] 82-20-PLAN.md — Installer-timeout waits bounded by real time (clock captured before fake timers), not by setImmediate turn count; slowed-path RED/GREEN + mutant proof, contention soak, ledger record (gap closure, wave 1)

### Phase 83: Native seam, gamelib-core and process/shutdown contract

**Goal**: Rust can serve a renderer channel natively with the sidecar as fallback, and quitting or killing GameLib leaves no orphaned helpers, so every later slice is a leaf over a stable Rust substrate.
**Requirements**: FND-03, FND-04
**Depends on**: Phase 82
**Research flag**: Needs research-phase and spike (send-kind channel ordering through `SidecarSendQueue`, invoke/send interleave, `[GAMELIB_IPC_INVALID_CHANNEL]` behaviour)
**Success Criteria** (what must be TRUE):
  1. One real shell-only channel is served by the native router with the sidecar still present as fallback, and a test fails if any channel has zero or two owners
  2. A renderer call with malformed or unknown arguments to a native channel is rejected in Rust with a negative test per migrated channel (the Phase 72 trust boundary holds), and the IPC schema diff gate fails on an unreviewed channel change
  3. Quitting GameLib, and SIGKILL of the parent, leaves no orphaned helper process on macOS, Windows and Linux (launched games excepted), proven on all three OS legs
  4. `gamelib-core` (paths, emitter, clock, `ProcessRunner`, `Shutdown` token) and `gamelib-proc` kill-tree exist, and the TS shim the first migrated channel used is deleted in this phase

**Plans:** 11/11 plans complete

Plans:
**Wave 1**
- [x] 83-01-PLAN.md — Live macOS Force Quit gate contract and Structural Reachability Review, authored before code (run by 83-11)
- [x] 83-02-PLAN.md — gamelib-core: Clock/ProcessRunner hoist, Paths, FrontendEmitter, Shutdown with the 5 s / 1.5 s exit budget
- [x] 83-03-PLAN.md — Native invoke seam: getHeroicVersion served in Rust from the channel manifest; its TS deleted

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 83-04-PLAN.md — gamelib-proc: spawn classes, kill-tree, ChildSet, per-helper Windows Job, ProcRunner, stand-in harness (graceful leg)
- [x] 83-05-PLAN.md — Seam gates: IPC schema snapshot diff gate, one-owner census, *PortComplete template, version parity

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 83-06-PLAN.md — Native send seam: openExternalUrl FIFO slice queue and Rust URL check; its TS deleted; open_external command deleted (D-17)
- [x] 83-07-PLAN.md — Unix reaper, SIGKILL legs, negative control and Node stand-in leg

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 83-08-PLAN.md — Shell SIGKILL wiring: reaper mode and start, sidecar group registered, Windows Job and Rust helpers via gamelib-proc, D-15 recorded

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 83-09-PLAN.md — One exit deadline: handle_exit on run_exit, shutdown_child via gamelib-proc, gates rewritten, D-14 convention

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 83-10-PLAN.md — Phase proof: clean-worktree gates, push checkpoint, three-OS CI proof
- [x] 83-11-PLAN.md — Run the live macOS gate (Force Quit, graceful quit, reaper visibility, native channels)

### Phase 84: Logger

**Goal**: Logging is owned by Rust with the same format, files, rotation and redaction, so every later slice logs through one native writer.
**Requirements**: FND-05
**Depends on**: Phase 83
**Research flag**: Standard
**Success Criteria** (what must be TRUE):
  1. A before/after golden comparison shows `gamelib.log` and the per-prefix files keep their line format, location, rotation and 0600 mode, and renderer log messages are still redacted
  2. Log upload, delete-uploaded and "show in folder" work from the UI against the native logger
  3. Diagnostics from steam-vent and reqwest appear in the log, and a repeating error is rate-limited rather than flooding the file
  4. The TS logger is reduced to a fire-and-forget forwarder, and the shell's second log path (`shell_diag`) and the TS log registrations are deleted

**Plans:** 18/18 plans complete (7 gap-closure plans 84-12..84-18 added 2026-11-22 from UAT); original 11 in 9 waves; planned 2026-11-21, consolidated from 14 the same day, then the consolidated 84-06 and 84-07 each split in two to stay inside the per-plan context budget; executes only after Phase 83 closes (83-11 live gate passed, D-02)

Plans:
**Wave 1**
- [x] 84-01-PLAN.md — Before any code: golden from the real TS writer, shared `log` frame vectors, and the live macOS gate contract (84-HUMAN-UAT.md, run by 84-11)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 84-02-PLAN.md — `gamelib-log` crate (format, writer, every target, 0600 per D-18, frame contract, renderer sanitiser), log paths and minimal StoreHost (D-09) in gamelib-core, CI wiring

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 84-03-PLAN.md — Tracer: sidecar `logInfo` → `kind:"log"` frame → native writer → gamelib.log; bounded TS forwarder with calibrated batching; EOF flush

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 84-04-PLAN.md — Runner, per-game and gog-redist logs through the native writer (facade, with the import codemod in the same typechecking commit); gamelib.log rate limiter
- [x] 84-05-PLAN.md — Native router widened; logError/logInfo/showLogFileInFolder/getLogContent and upload (reqwest on StoreHost) in Rust

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 84-06-PLAN.md — Uploaded list and delete-uploaded in Rust; TS uploader, logger flow registration and uploadedLogs slice deleted (uploadedLogs has one owner); COVERAGE.md

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 84-07-PLAN.md — TS logger internals and the oracle deleted behind the red-first `loggerPortComplete` gate; paths.ts and the containment kit's logger/paths element retired

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 84-08-PLAN.md — `shell_diag` → `shell_log` into gamelib.log; tracing Layer + `log` bridge, `GAMELIB_LOG_LEVEL`; steamcm forwarder deleted; `loggerPortComplete` Rust half

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 84-09-PLAN.md — run_exit `FinishContext` and the final flush inside the 5 s budget (D-13 as amended, D-21); docs that describe the old sinks corrected

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 84-10-PLAN.md — Clean-worktree proof, push checkpoint, three-OS CI proof
- [x] 84-11-PLAN.md — Run the live macOS gate

**Gap closure** *(from 84-UAT.md: G-84-1, G-84-3, G-84-4; planned 2026-11-22)*

**Wave 1**
- [x] 84-12-PLAN.md — WR-03 store persist never truncates the live file; WR-07 store the parsed paste URL (isolated for Phase 85 plan 85-09)
- [x] 84-13-PLAN.md — Amend live-contract items 4, 7 and 8 and re-score from existing captures (G-84-3)
- [x] 84-14-PLAN.md — Golden `tokenise` Windows path fix (G-84-1); WR-04, IN-01, IN-02, WR-05 Rust half
- [x] 84-15-PLAN.md — WR-01 sanitise at the producer, WR-05 TS half, WR-06 bounded flush

**Wave 2** *(after 84-14)*
- [x] 84-16-PLAN.md — WR-02 escape CR/LF at every native entry point; IN-03; IN-04 finish deadline

**Wave 3** *(after 84-16)*
- [x] 84-17-PLAN.md — WR-02 privacy half: external error text and paths kept out of `gamelib.log`, plus a gate

**Wave 4** *(after 84-12..84-17)*
- [x] 84-18-PLAN.md — Clean-worktree proof, all 11 dispositions fixed, operator push checkpoint, windows-leg CI re-proof

### Phase 85: Store host, config and versioned migrations

**Goal**: Rust is the only disk writer for settings, caches and per-game config, and an upgrade loads existing data unchanged without new Keychain prompts.
**Requirements**: FND-06, FND-07
**Depends on**: Phase 84
**Research flag**: Needs deeper research and spike (sync TS reads over async Rust ownership, read-your-writes, `storeChanged` vs snapshot ordering, byte-compatible JSON both ways, Windows atomic rename with an open file, real-file corpus harvest)
**Success Criteria** (what must be TRUE):
  1. Existing settings, caches and per-game config from the operator profile and older-release corpus load unchanged after upgrade, with unknown keys preserved and a roundtrip diff test green
  2. Before a migration runs the previous state is backed up; a corrupt store file is kept and reported, never reset; a file written by a newer version is read-only
  3. After upgrading a signed release over a previous one, stored credentials still work and no new Keychain prompt appears
  4. The legendary store migration is ported only if a supported upgrade path still reaches it (reachability recorded), otherwise it is deleted
  5. The TS write-through mirror's deletion point is named and executed for every family flipped in this phase, and `storeVersioning`, `storeMigrations` and `migration/*` TypeScript are deleted

**Plans:** 25/25 plans complete in 20 waves; planned 2026-11-21

Plans:
**Wave 1**
- [x] 85-01-PLAN.md — Before any store code: the TS store oracle golden (conf writes, engine outcomes, migrations, settings documents) and dot-path, number and key-order vectors
- [x] 85-03-PLAN.md — Shared renderer policy and `kind:"store"` frame vectors; the live macOS gate contract 85-HUMAN-UAT.md (run by 85-20)
- [x] 85-04-PLAN.md — Spikes: S1 mirror protocol model, S3-S5 frame/boot/sync_all measurements and the constants they set
- [x] 85-05-PLAN.md — D-16 checkpoint: the signed v0.10 baseline and its recorded signing identity

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 85-02-PLAN.md — Redacted real-file corpus (operator profile, its `*.bak.json`, v0.8/v0.9/v0.10 in fake HOMEs, edge cases) pinned by MANIFEST.json (D-09)
- [x] 85-06-PLAN.md — `gamelib-store` (+cli) crate: ordered JSON with JS number text and key order, dot-prop paths, atomic write; CI wiring

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 85-07-PLAN.md — Envelope, ops, version engine, backups, D-18 corrupt handling, generated store table, corpus roundtrip

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 85-08-PLAN.md — zod-derived schema descriptor and the settings/library migration chains in Rust; corpus migrate parity; CLI `open`

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 85-09-PLAN.md — StoreHost widened into gamelib-store; uploadedLogs v0.10 format fix; bounded boot open, GAMELIB_STORE, GAMELIB_STORE_BOOT, `store` exit drain

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 85-10-PLAN.md — Tracer: TS mirror -> `kind:"store"` frames -> Rust owner -> disk with acks, on one store

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 85-11-PLAN.md — Mirror hardening: S1 protocol, shared cells, dot paths, quit flush, D-02 fallback proof, jest disk sink

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 85-12-PLAN.md — Flip caches (D-01 first family), runtime caches, corrupt caches start empty after their copy
- [x] 85-18-PLAN.md — D-17 bottle version gate in Rust for the engine marker and shared-redist ledger

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 85-13-PLAN.md — Flip user-state; older libraries migrated at boot before the sidecar

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 85-14-PLAN.md — Flip token-bearing and account configs (shared steam_store cell); keyring names pinned on every CI OS (D-10, D-14)

**Wave 11** *(blocked on Wave 10 completion)*
- [x] 85-15-PLAN.md — Flip settings last: store/config.json, config.json, GamesConfig/* through readSettingsDoc; D-22 first boot; eviction on reset/uninstall

**Wave 12** *(blocked on Wave 11 completion)*
- [x] 85-16-PLAN.md — Renderer reads native: one policy file for TS and Rust, snapshot and fetch from StoreHost, read-only notice from Rust

**Wave 13** *(blocked on Wave 12 completion)*
- [x] 85-17-PLAN.md — Renderer writes native: set/set-checked/delete/new and storeChanged from Rust with rev; preload stale-push guard

**Wave 14** *(blocked on Wave 13 completion)*
- [x] 85-19-PLAN.md — Clean-worktree proof, push and signed Phase 85 build checkpoint, three-OS CI, identity recorded beside the baseline

**Wave 15** *(blocked on Wave 14 completion)*
- [x] 85-20-PLAN.md — Run the live macOS gate (signed v0.10 -> signed Phase 85 upgrade, SC1-SC3)

**Wave 16** *(blocked on Wave 15 completion)*
- [x] 85-21-PLAN.md — D-03 deletion after the gate, part 1: migration system (SC4 recorded) and migrationsStore, mirror schedule pinned (D-19); flag, TS owner path and `conf`

**Wave 17** *(blocked on Wave 16 completion)*
- [x] 85-22-PLAN.md — D-03 deletion, part 2: the engine, tools, launcher, flow and bridge-runtime side stops carrying the TS versioning engine

**Wave 18** *(blocked on Wave 17 completion)*
- [x] 85-23-PLAN.md — D-03 deletion, part 3: configs, store managers and StoreRoot stop carrying it; test helper forbidden and deleted

**Wave 19** *(blocked on Wave 18 completion)*
- [x] 85-24-PLAN.md — D-03 deletion, part 4: TS read-only notice path ended; schemaStrip and store types relocated; storeVersioning and storeMigrations deleted (SC5)

**Wave 20** *(blocked on Wave 19 completion)*
- [x] 85-25-PLAN.md — Post-deletion clean-worktree and three-OS CI proof

### Phase 86: Pure leaf services

**Goal**: The self-contained information and cache services run in Rust and behave as before.
**Requirements**: SVC-01
**Depends on**: Phase 85
**Research flag**: Standard
**Success Criteria** (what must be TRUE):
  1. Wiki game info, the CrossOver compatibility index, store search and discounts, and anti-cheat info return the same results for the recorded fixtures as the TypeScript did
  2. Recent games, per-game overrides and the artwork and image caches read and write the existing files with no data change after upgrade
  3. Recorded fixtures exist for each previously untested directory before it is ported
  4. Each ported slice's TypeScript and sidecar registrations are deleted in this phase (the delete gate per slice passes)

**Plans:** 27/27 plans complete in 21 waves; planned 2026-11-22 (executes after Phase 85's StoreHost ships, 85-19/20; D-29)

Plans:
**Wave 1**
- [x] 86-01-PLAN.md — D-29 checkpoint: re-read the shipped gamelib-store host API; amend 82-STATE-OWNERSHIP (umu 86, macArch 89, runsForMe 96)
- [x] 86-02-PLAN.md — The live macOS gate contract 86-HUMAN-UAT.md (four D-14 items, D-15 signed upgrade), authored before coding

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 86-03-PLAN.md — `gamelib-info` (+cli) crate: CacheView over StoreHost, Http trait with pinned Replay, op wrapper with shutdown registrant; CI wiring
- [x] 86-04-PLAN.md — TS oracle recorder and harness; goldens for the zero-test slices (recent games, overrides, anticheat) before any Rust; redaction scan
- [x] 86-05-PLAN.md — Delete-gate machinery (infoPortComplete, shim/resolver schedule) proven by deleting images_cache (D-22)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 86-06-PLAN.md — Record discounts, CrossOver index and wiki + umu live; TS goldens with D-23 TS-only/Rust-only exchanges
- [x] 86-07-PLAN.md — ITAD and SteamGridDB oracles; operator records the keyed cases in their own terminal
- [x] 86-08-PLAN.md — Tracer: recent games in Rust with the shell info wiring, `removeRecent` native, Rust emit and tray (D-08)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 86-09-PLAN.md — Recent games shims; TS slice and the sidecar tray sniff deleted

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 86-10-PLAN.md — Per-game overrides in Rust; two native read channels; image cleanup confined to its dir

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 86-11-PLAN.md — Override shims (async ripple in gamedetails); TS slice deleted, store row kept in EXTRA_ROWS

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 86-12-PLAN.md — Anticheat in Rust (native lookup, status/download ops, md-5); the D-12 drift command

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 86-13-PLAN.md — Anticheat shims; TS online hook calls status then download (D-07, D-28); TS slice deleted

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 86-14-PLAN.md — Keys: shell SecretSource over the keyring, dev vault port, SteamGridDB plaintext migration, baked ITAD key (D-19, D-25, D-26)

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 86-15-PLAN.md — SteamGridDB in Rust (five native channels); migration to Rust boot; TS slice and secret store deleted

**Wave 11** *(blocked on Wave 10 completion)*
- [x] 86-16-PLAN.md — ITAD store search, deals, Steam gids and key status native in Rust

**Wave 12** *(blocked on Wave 11 completion)*
- [x] 86-17-PLAN.md — ITAD TS deleted; shared coverage file; cache rows kept; sidecar key bake removed

**Wave 13** *(blocked on Wave 12 completion)*
- [x] 86-18-PLAN.md — GOG discounts in Rust behind the token resolver (D-24); TS fetcher deleted

**Wave 14** *(blocked on Wave 13 completion)*
- [x] 86-19-PLAN.md — CrossOver index in Rust; rating map behind the game-list resolver; shared runner table

**Wave 15** *(blocked on Wave 14 completion)*
- [x] 86-20-PLAN.md — umu and wiki sources part 1 (PCGamingWiki, AppleGamingWiki, ProtonDB, Steam Deck) with JS regex parity

**Wave 16** *(blocked on Wave 15 completion)*
- [x] 86-21-PLAN.md — HowLongToBeat, GamesDB and the two D-23 GOG GETs in Rust

**Wave 17** *(blocked on Wave 16 completion)*
- [x] 86-22-PLAN.md — Wiki aggregator in Rust; `getWikiGameInfo` native; one live drift run (Pitfall 11)

**Wave 18** *(blocked on Wave 17 completion)*
- [x] 86-23-PLAN.md — umu shims, nonesteamgame wiki resolver, clear-cache shim; HLTB type moved to common

**Wave 19** *(blocked on Wave 18 completion)*
- [x] 86-24-PLAN.md — Wiki and CrossOver TS deleted together; three cache rows kept; oracle harness retired

**Wave 20** *(blocked on Wave 19 completion)*
- [x] 86-25-PLAN.md — Clean-worktree proof, SC4 sweep, drift run, push and signed Phase 86 build checkpoint, three-OS CI

**Wave 21** *(blocked on Wave 20 completion)*
- [x] 86-26-PLAN.md — Run the live macOS gate (signed Phase 85 -> signed Phase 86, D-14/D-15)

**Gap closure**
- [x] 86-27-PLAN.md — Failure-path hardening: CR-41, WR-41, WR-42 and the sign-out wiki-cache clear (truth G)

**Cross-cutting constraints:** <!-- gsd:generated -->
- Memory-note shape: any offline step turns the network off only for the action (off, act, on, report)

### Phase 87: Engine, Wine and tools

**Goal**: Engine selection, bottles and Wine tooling run in Rust with the same behaviour on real engines.
**Requirements**: SVC-02
**Depends on**: Phase 86
**Research flag**: Needs deeper research (empirical CrossOver/Staging behaviour)
**Success Criteria** (what must be TRUE):
  1. A game uses CrossOver first and falls back to the pinned Wine-Staging with DXVK exactly as before, verified live on real engines
  2. Per-game bottles are created, reused and removed as before; removing a bottle never touches a sibling game
  3. Wine, CrossOver and Staging downloads, Winetricks and DXVK/DXMT/vkd3d tools install and report progress as before
  4. `wine/`, `tools/` and engine TypeScript and their sidecar registrations are deleted in this phase, except scheduled resolvers listed in the schedule test (D-23)

**Plans:** 81/82 plans executed in 41 waves; planned 2026-11-23, revised the same day so every plan fits the 100k smart-zone budget (executes after Phase 86 closes); 87-56a/b/c added 2026-11-24 for the 87-56 remainder; 87-60..87-70 added 2026-11-24 as gap closure for the 87-59 live gate (F1-F5 and the engine-log gap) in 8 gap waves; 87-71..87-79 added 2026-11-25 as gap closure cycle 2 for the 87-69 re-run findings (RF1-RF6) in 6 gap waves

Plans:
**Wave 1**
- [x] 87-01-PLAN.md — Live macOS gate contract 87-HUMAN-UAT.md (four D-11 items, D-12 signed upgrade), the 82 ownership amendment (D-05) and the SC4 wording (D-23)
- [x] 87-02-PLAN.md — gamelib-engine and gamelib-wine (+cli) crates, CI wiring, the shared enginePins.json (tracer: engine_pins through the CLI)
- [x] 87-03-PLAN.md — Delete-gate machinery: engineWinePortComplete (no rollback flag) and the shim/resolver/twin/view schedule with exact discovery rules

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 87-04-PLAN.md — SpecRunner spawn seam in gamelib-core/gamelib-proc with the spec-tree orphan arm (D-17)
- [x] 87-05-PLAN.md — TS oracle harness (HTTP, spawn-trace, tree recorders), the runtimes goldens and the fixture redaction scan

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 87-06-PLAN.md — Fetch with pinned Replay, the full EngineCtx/WineCtx, the DxvkInstaller trait and the UI sinks
- [x] 87-07-PLAN.md — Goldens: wine manager (seven feeds, checksum, install, abort, remove)
- [x] 87-08-PLAN.md — Goldens: wine command core and discovery (D-22)
- [x] 87-09-PLAN.md — Goldens: DXVK/vkd3d/nvapi and DXMT
- [x] 87-10-PLAN.md — Goldens: Winetricks (install lifecycle, pure vectors, queue)
- [x] 87-11-PLAN.md — Goldens: bottles, markers, the D-07 fixture set and the twin/view vectors
- [x] 87-12-PLAN.md — Goldens: engine configuration and the engine twin vectors
- [x] 87-13-PLAN.md — Goldens: the decision matrix and demo status
- [x] 87-14-PLAN.md — Goldens: fallback engine, engine state and notices
- [x] 87-15-PLAN.md — Goldens: launch step, deadline and process watch

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 87-16-PLAN.md — Goldens: engine switch, including the WR-02 interleave
- [x] 87-17-PLAN.md — Tracer: Wine runtimes end to end (shell contexts, `wine` slice, `isRuntimeInstalled` native, crate download)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 87-18-PLAN.md — `downloadRuntime` native, ShellEngineUi, launcher shims; runtimes TS deleted
- [x] 87-19-PLAN.md — Wine manager in the crate (refresh, store, install, remove); no caller switched

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 87-20-PLAN.md — Every wine-manager caller flipped in one plan (three native channels, four shims); opens the DXMT wine-install gap 87-31 closes
- [x] 87-21-PLAN.md — Wine command core in the crate (D-22)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 87-22-PLAN.md — Wine-manager TS deleted; single-stream quirk todo
- [x] 87-23-PLAN.md — Wine discovery and the PATH default in the crate

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 87-24-PLAN.md — `wine.isValidVersion` native, validWine shim, sync env builders as pinned twins
- [x] 87-25-PLAN.md — Engine configuration in the crate

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 87-26-PLAN.md — `getAlternativeWine` native, discovery shims and twin; discovery TS deleted
- [x] 87-27-PLAN.md — DXVK/vkd3d/nvapi in the crate with the incident tests

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 87-28-PLAN.md — Three engine channels native, the default-wine hook, the non-bridge pure twin

**Wave 11** *(blocked on Wave 10 completion)*
- [x] 87-29-PLAN.md — WineDxvkInstaller behind the engine trait, ShellDxvk

**Wave 12** *(blocked on Wave 11 completion)*
- [x] 87-30-PLAN.md — DXMT in the crate (gate, bounded boot update, hooks, online flag); nothing wired

**Wave 13** *(blocked on Wave 12 completion)*
- [x] 87-31-PLAN.md — Online-state shim and the one-commit DXMT ownership switch; closes the DXMT gap
- [x] 87-32-PLAN.md — Winetricks in the crate (install, parsers, guard, catalog)

**Wave 14** *(blocked on Wave 13 completion)*
- [x] 87-33-PLAN.md — Rust ops behind the resolvers: Winetricks queue, runWineCommandForGame, callTool
- [x] 87-34-PLAN.md — DXVK family flipped: three D-23 resolvers and the DXVK shim

**Wave 15** *(blocked on Wave 14 completion)*
- [x] 87-35-PLAN.md — Winetricks family flipped: queue channels native, three resolvers, launcher shims

**Wave 16** *(blocked on Wave 15 completion)*
- [x] 87-36-PLAN.md — Wine-command family flipped: three resolvers; wineToolsFlowRegistration deleted

**Wave 17** *(blocked on Wave 16 completion)*
- [x] 87-37-PLAN.md — Tools TS and the wine-downloader-info TS mirror deleted

**Wave 18** *(blocked on Wave 17 completion)*
- [x] 87-38-PLAN.md — Bottle state primitives in the crate (markers with the version gate, conf, pins, ledger, registry)

**Wave 19** *(blocked on Wave 18 completion)*
- [x] 87-39-PLAN.md — Bottle lifecycle (create, kill, sibling-safe removal) and the bridge's pure twin

**Wave 20** *(blocked on Wave 19 completion)*
- [x] 87-40-PLAN.md — Engine switch tracer, fallback bottles and per-game bottles in the crate

**Wave 21** *(blocked on Wave 20 completion)*
- [x] 87-41-PLAN.md — Engine switch: per-bottle serialisation, every branch, the incident tests

**Wave 22** *(blocked on Wave 21 completion)*
- [x] 87-42-PLAN.md — Bridge bottle shims and the engineSelectionView (D-24): every bottle caller in one plan

**Wave 23** *(blocked on Wave 22 completion)*
- [x] 87-43-PLAN.md — Direct twin imports; bottles, ledger and switch TS deleted; copied quirks recorded

**Wave 24** *(blocked on Wave 23 completion)*
- [x] 87-44-PLAN.md — CrossOver location, demo-status (real-profile arm), run_tool (isolated arm) in Rust

**Wave 25** *(blocked on Wave 24 completion)*
- [x] 87-45-PLAN.md — Engine decision structure, creation decision and override options in Rust

**Wave 26** *(blocked on Wave 25 completion)*
- [x] 87-46-PLAN.md — The full CrossOver-first decision matrix in Rust
- [x] 87-47-PLAN.md — The pinned fallback engine in Rust (download, verify, extract, prune)

**Wave 27** *(blocked on Wave 26 completion)*
- [x] 87-48-PLAN.md — Bounded Rust boot sweep, moved from the sidecar in one commit

**Wave 28** *(blocked on Wave 27 completion)*
- [x] 87-49-PLAN.md — Engine state and notices in Rust; `dismissEngineNotice` native

**Wave 29** *(blocked on Wave 28 completion)*
- [x] 87-50-PLAN.md — Launch-step selection, dialogs and toasts in Rust (D-01, D-02)

**Wave 30** *(blocked on Wave 29 completion)*
- [x] 87-51-PLAN.md — Launch deadline, process watch and the bridge deadline event in Rust

**Wave 31** *(blocked on Wave 30 completion)*
- [x] 87-52-PLAN.md — Non-Steam callers switched: launch shims, getLaunchSettings, the getEngineState resolver

**Wave 32** *(blocked on Wave 31 completion)*
- [x] 87-53-PLAN.md — Engine dialog acks forwarded; engineFlowRegistration deleted

**Wave 33** *(blocked on Wave 32 completion)*
- [x] 87-54-PLAN.md — Bridge callers switched: decision, deadline, state publishes

**Wave 34** *(blocked on Wave 33 completion)*
- [x] 87-55-PLAN.md — Bridge callers switched: run_tool, CrossOver bin dir, engine types to common

**Wave 35** *(blocked on Wave 34 completion)*
- [x] 87-56-PLAN.md — Engine TS, boot steps and the notices store registration deleted (PARTIAL, closed 2026-11-23: launch step, deadline, process watch, dialogs and pin download deleted; remainder in 87-56a/b/c by user decision)

**Wave 36** *(blocked on Wave 35 completion)*
- [x] 87-56a-PLAN.md — Tool settings and the pinned-engine download reach Rust; the 87-52 Winetricks/Run EXE live-selection regression closed; engineOutsideImporters map

**Wave 37** *(blocked on Wave 36 completion)*
- [x] 87-56b-PLAN.md — Steam caller halves relocated to steam/engine, runtime member reads gone, crossoverBinDirSync and parseEngineOverride twins

**Wave 38** *(blocked on Wave 37 completion)*
- [x] 87-56c-PLAN.md — Engine runtime and state out of boot and deps, notices store registration and services builder deleted, src/backend/engine deleted; enginePortComplete green

**Wave 39** *(blocked on Wave 38 completion)*
- [x] 87-57-PLAN.md — Survivor sweep item by item against D-22/D-23/D-24, census and ratchets (SC4)

**Wave 40** *(blocked on Wave 39 completion)*
- [x] 87-58-PLAN.md — Clean-worktree proof with the DXMT gap re-check, push checkpoint, three-OS CI, signed Phase 87 build identity

**Wave 41** *(blocked on Wave 40 completion)*
- [x] 87-59-PLAN.md — Run the live macOS gate (signed Phase 86 -> signed Phase 87, D-11/D-12)

**Cross-cutting constraints:** <!-- gsd:generated -->
- Memory-note shape: any offline step turns the network off only for the action (off, act, on, report)
- Two-profile rule: every golden runs on an isolated createFakeHomeProfile(); no case reads the real HOME
- D-25 (c): `callTool` (winecfg, runExe) and `runWineCommandForGame` spawn in Rust as `SpawnClass::Helper`; the GOG offline-installer check, `pushGameToLibrary` and the final `gameStatusUpdate done` stay in the TS registration glue after the resolver returns, in the TS order

**Gap closure (87-59 gate findings; user decisions 2026-11-24)**

**Gap wave 1**
- [x] 87-60-PLAN.md — Author the re-run gate contract 87-RERUN-1-HUMAN-UAT.md (7 items, before any fix, D-21/D-E) and file the non-gate observations as todos

**Gap wave 2** *(blocked on gap wave 1)*
- [x] 87-61-PLAN.md — Wire the shell's EngineLog with redaction (home as ~, no account names, tokens or args lines) into gamelib.log
- [x] 87-62-PLAN.md — Wine manager: never-installed entries install (parse defaults, F2) and the list follows install and remove (F4)
- [x] 87-64-PLAN.md — Winetricks, Run EXE and wine commands act on the game's own CrossOver bottle; a Winetricks failure shows (F3, 56a-1)
- [x] 87-65-PLAN.md — Stop ends a non-Steam game on CrossOver through the guarded bottle wineserver kill (F3)

**Gap wave 3** *(blocked on 87-61, 87-64)*
- [x] 87-63-PLAN.md — Locate and fix the offline refusal that did not fire (F1), crate, shell and TS regression tests

**Gap wave 4** *(blocked on 87-63)*
- [x] 87-66-PLAN.md — Rust op that removes a non-Steam game's own bottle through gamelib-safety, with the refusal arms and the sibling table (F5, D-19)

**Gap wave 5** *(blocked on 87-61, 87-63, 87-65, 87-66)*
- [x] 87-70-PLAN.md — The removal op's rustInvoke channel, the removeGameBottle shim with its schedule rows, and the uninstaller route with the default-prefix refusal (F5)

**Gap wave 6** *(blocked on 87-66, 87-70)*
- [x] 87-67-PLAN.md — Uninstall dialog offers the game's bottle with a risk warning; legible disabled toggle in the three themes (F5)

**Gap wave 7** *(blocked on 87-61..87-67, 87-70)*
- [x] 87-68-PLAN.md — Clean-worktree proof, push checkpoint, three-OS CI and the signed 0.13.1 gap build (D-12, D-13)

**Gap wave 8** *(blocked on 87-60, 87-68)*
- [x] 87-69-PLAN.md — Run the live macOS re-run gate on the signed gap build (not its author, D-E)

**Cross-cutting constraints:** <!-- gsd:generated -->
- Memory-note shape: any offline step turns the network off only for the action (off, act, on, report)
- Two-profile rule: every golden runs on an isolated createFakeHomeProfile(); no case reads the real HOME
- D-25 (c): `callTool` (winecfg, runExe) and `runWineCommandForGame` spawn in Rust as `SpawnClass::Helper`; the GOG offline-installer check, `pushGameToLibrary` and the final `gameStatusUpdate done` stay in the TS registration glue after the resolver returns, in the TS order

**Gap closure cycle 2 (87-69 re-run findings; user decisions 2026-11-25)**

**Gap wave 1**
- [x] 87-71-PLAN.md — Author the re-run 2 contract 87-RERUN-2-HUMAN-UAT.md (7 items, before any fix, D-21/D-E) and file O1 and O2 as todos; link the RF1 todo

**Gap wave 2** *(blocked on 87-71)*
- [x] 87-72-PLAN.md — RF1 diagnosis only: reproduce the 1-2 s CrossOver exit (desk side-by-side, then a live operator capture) and name the cause with evidence; no fix
- [x] 87-73-PLAN.md — RF2: a refused, failed or rejected launch ends its status and display sleep blocker; the Play-click latch cannot outlive the launch
- [x] 87-74-PLAN.md — RF3: trace Cancel in the uninstall dialog to the Steam shortcut removal, cut the hop, test every close path
- [x] 87-75-PLAN.md — RF4: bottle-backed games on the shared default prefix reach the bottle removal (default prefix never a target); RF6: in-use and unsafe-name notice wording

**Gap wave 3** *(blocked on 87-71, 87-73)*
- [x] 87-76-PLAN.md — RF5: the engine state carries the offline-gate verdict at read time, and launch() skips the generic offline warning when the engine will refuse

**Gap wave 4** *(blocked on 87-72, 87-73, 87-76)*
- [x] 87-77-PLAN.md — RF1 fix at the layer 87-72 named, red-first regression in Rust and TS; any pre-fix 88.1 launch golden handed to 88.1 as a todo

**Gap wave 5** *(blocked on 87-71..87-77)*
- [x] 87-78-PLAN.md — Clean-worktree proof, push checkpoint, three-OS CI and the signed 0.13.2 gap build 2 (D-12, D-13)

**Gap wave 6** *(blocked on 87-71, 87-78)*
- [ ] 87-79-PLAN.md — Run the live macOS re-run 2 gate on the signed gap build 2 (not its author, D-E); close RF1's todo if item 3 passes

**Cross-cutting constraints:**
- Memory-note shape: any offline step turns the network off only for the action (off, act, on, report); dev launch is `pnpm tauri:dev`, never `tauri:dev:run`
- Phase 88.1 executes in parallel on main: STATE.md is not mutated by these plans, commits use `--files`, and cited `launcher.ts` lines are re-read at HEAD before editing
- RF1 is fixed only after 87-72 names its cause (`status: root-cause-named` in `.planning/debug/rf1-crossover-launches-exit-within-two-seconds.md`)

### Phase 88: Launch scaffolding and known fixes

**Goal**: Known-fixes run from Rust, and the shared launch scaffolding (crates, reference-trace harness, ownership amendment, live-gate contract) is in place for 88.1–88.3.
**Requirements**: SVC-03 (part 1 of 4; split 2026-11-25, `88-CONTEXT.md` D-30, which also governs 88.1–88.3 and shares 88-RESEARCH / PATTERNS / VALIDATION)
**Depends on**: Phase 87 (its coding plans run after the 87 gap-closure code plans land; the authoring plan may run earlier)
**Research flag**: Done (`88-RESEARCH.md`, shared by 88–88.3)
**Success Criteria** (what must be TRUE):
  1. Known-fix overlay, reader, registry, archive and fetch behaviour match golden traces recorded from the TypeScript
  2. `88-HUMAN-UAT.md` (the four D-17 items) and the `82-STATE-OWNERSHIP.md` amendment (D-24, D-28, deferrals) are authored before any coding plan
  3. The `launchOracle` harness, pairwise generator, and the `gamelib-launch` / `gamelib-knownfix` crates exist and run in three-OS CI
  4. The known-fixes TypeScript and its registrations are deleted, leaving only scheduled shims; closes on goldens and three-OS CI, no signed build

**Plans:** 17/17 plans complete in 14 waves; planned 2026-11-25, completed 2026-11-25 (88-02 waits for 88-01 so the live gate is committed before any code, D-25)

Plans:
**Wave 1**
- [x] 88-01-PLAN.md — Live gate contract 88-HUMAN-UAT.md (four D-17 items), the 82 ownership and utils amendments with a target sub-phase per row (D-24, D-28, D-30), the validation map's sub-phase column

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 88-02-PLAN.md — 87 prerequisite check, the 13 schedule rows re-targeted (roadmap-derived decimal deletedBy), launchrust discovery, launchPortComplete with the no-rollback scan

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 88-03-PLAN.md — gamelib-knownfix and gamelib-launch (+cli) crates, CI wiring, the shared overlay catalogue JSON (tracer: knownfix_overlay_catalogue through the CLI)
- [x] 88-04-PLAN.md — The shared launchOracle harness: pinned base env, injected platform and probes, pairwise generator, spawn-class column, incident-title census

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 88-05-PLAN.md — Goldens: known-fix reader layering (pairwise) and launch overrides, every incident test as a named case
- [x] 88-06-PLAN.md — Goldens: registry and dllOverrides fixes (spawn class helper), overlay archive, overlay install and env
- [x] 88-07-PLAN.md — Goldens: remote-fixes fetcher and the known-fix report, with offline-replayable exchanges

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 88-08-PLAN.md — Rust reader, layering and status probe; getKnownFixes and getGamelibFixStatus native in the knownfix slice

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 88-09-PLAN.md — Rust launch overrides and registry fixes (reg add as gamelib-proc Helpers through the wine command core)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 88-10-PLAN.md — Rust overlay archive, verified install with single flight, and overlay env

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 88-11-PLAN.md — Rust remote-fixes fetcher and report client, additive POST on gamelib-engine's Fetch

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 88-12-PLAN.md — rustInvoke known-fix channels; managers' launch overrides and the download manager's fetch on shims

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 88-13-PLAN.md — Launcher registry fixes and overlay env on unbounded shims; synchronous twins with golden vectors

**Wave 11** *(blocked on Wave 10 completion)*
- [x] 88-14-PLAN.md — Steam bridge known-fixes on shims and twins; the TS overlay single flight leaves appRuntime

**Wave 12** *(blocked on Wave 11 completion)*
- [x] 88-15-PLAN.md — Known-fix report on a shim; the Steam library's synchronous readers on the twins

**Wave 13** *(blocked on Wave 12 completion)*
- [x] 88-16-PLAN.md — Delete the known-fix TypeScript behind knownFixPortComplete (RED first) and the survivor check

**Wave 14** *(blocked on Wave 13 completion)*
- [x] 88-17-PLAN.md — Clean-worktree proof, push checkpoint and three-OS CI (D-30: no signed build)

### Phase 88.1: Launch builders and prepare steps (INSERTED)

**Goal**: The launch env, wrapper and gamescope builders and the prepare steps run from Rust.
**Requirements**: SVC-03 (part 2 of 4; D-30)
**Depends on**: Phase 88
**Research flag**: Done (shared `88-RESEARCH.md`)
**Success Criteria** (what must be TRUE):
  1. Env, wrapper, gamescope and known-fix-env builders and `prepare_launch` / `prepare_wine_launch` match golden traces across the pairwise matrix
  2. Anti-cheat at launch, `check_wine_before_launch`, `download_default_wine` (D-28), `isMacSonomaOrHigher`, `isEpicServiceOffline`, `removeQuoteIfNecessary` and system info behave as before
  3. The builder TS, `gamescopeCommand.ts`, `utils/systeminfo` and the replaced `utils.ts` rows are deleted; closes on goldens, three-OS CI and a Linux stub-gamescope smoke

**Plans:** 23/24 plans executed (20 in 15 waves + 4 gap closure); planned 2026-11-25 (goldens are recorded from the TS before each Rust slice, D-25); gap closure planned 2026-11-26 from 88.1-VERIFICATION (CR-01, WR-01, the truth-2 decision)

Plans:
**Wave 1**
- [x] 88.1-01-PLAN.md — launchOracle fake launcher deps and probes; goldens: builders (wrappers with shlex parity, wrapper env, known-fix env, removeQuoteIfNecessary, isMacSonomaOrHigher) and gamescope

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 88.1-02-PLAN.md — Goldens: prepare_launch traces (pairwise per OS and runner) and isEpicServiceOffline
- [x] 88.1-03-PLAN.md — Goldens: prepare_wine traces split at the store-setup point
- [x] 88.1-04-PLAN.md — Goldens: checkWineBeforeLaunch and downloadDefaultWine (D-28)
- [x] 88.1-05-PLAN.md — Goldens: system information and the pci.ids caches (gamelib-info)
- [x] 88.1-06-PLAN.md — Rust builders and gamescope in gamelib-launch, golden_builders, the Linux stub-gamescope smoke

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 88.1-07-PLAN.md — launch_dispatch.rs, builder channels and shims; the managers' async ripple
- [x] 88.1-09-PLAN.md — Rust system-information probes and pci caches in gamelib-info (operator decides the pci.ids TXT lookup)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 88.1-08-PLAN.md — Wine env and prefix-check shims; the command runner's wine binding, save_sync and setup awaited

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 88.1-10-PLAN.md — Runner versions, format and single-flight cache; native getSystemInfo and copySystemInfoToClipboard

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 88.1-11-PLAN.md — Rust isEpicServiceOffline and prepare_launch (anti-cheat and system info in-process)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 88.1-12-PLAN.md — Rust prepare_wine_begin (validity, bottle check, prefix, installed_games)

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 88.1-13-PLAN.md — Rust prepare_wine_finish (installFixes, known-fix registry and overlays, GOG dummy, DXVK, runtimes, env, deadline arm)

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 88.1-14-PLAN.md — Rust check_wine_before_launch and download_default_wine with the answered-dialog seam

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 88.1-15-PLAN.md — prepareLaunch and prepareWineLaunch on Rust through shims and interim adapters; the old prepare shims retired

**Wave 11** *(blocked on Wave 10 completion)*
- [x] 88.1-16-PLAN.md — checkWineBeforeLaunch and isEpicServiceOffline callers on Rust

**Wave 12** *(blocked on Wave 11 completion)*
- [x] 88.1-17-PLAN.md — Sync with main; delete the builder TypeScript, gamescopeCommand.ts and the replaced utils rows behind the RED-first buildersPortComplete gate

**Wave 13** *(blocked on Wave 12 completion)*
- [x] 88.1-18-PLAN.md — Delete utils/systeminfo and the TS pci mirrors behind the RED-first systemInfoPortComplete gate (D-24)

**Wave 14** *(blocked on Wave 13 completion)*
- [x] 88.1-19-PLAN.md — Retire the dead rustInvoke channels; the survivor check; the Discord package and the dead-code ratchet

**Wave 15** *(blocked on Wave 14 completion)*
- [x] 88.1-20-PLAN.md — Clean-worktree proof, push checkpoint and three-OS CI with the Linux stub-gamescope smoke (D-30: no signed build)

**Cross-cutting constraints:** <!-- gsd:generated -->
- Flagged assumption (spec-less edge probe): SVC-03's edge-coverage row is `unclassified` and unresolved; the D-14 matrix stands in for edge coverage and is not claimed as a verified edge
- D-20: a recorded behaviour that looks wrong is kept and filed as a todo with the three triage keys

**Gap closure** *(from 88.1-VERIFICATION, 2026-11-26; gap waves 1-4, run with `/gsd-execute-phase 88.1 --gaps-only`; split 2026-11-26 at the plan check so the CR-01 tracer ends its own plan)*
- [x] 88.1-21-PLAN.md — CR-01: setupEnvVars reads a wine-free SetupEnvView; the Windows `{}` builders golden recorded from the pre-port TS; shell arm and CLI reproduction tests
- [x] 88.1-22-PLAN.md — WR-01: WineInstallation ignores a legacy key; ten more builders goldens recorded from the pre-port TS (legacy-key wine env first, setupEnvVars per platform, the Windows wine env); the full regression set
- [x] 88.1-23-PLAN.md — The operator-accepted pairwise narrowing as a truth-2 override; SVC-03's edge-coverage row classified; the review ledger closed (WR-02..04 and IN-02 to triaged todos)
- [ ] 88.1-24-PLAN.md — Gap-closure proof at a candidate head, push checkpoint, three-OS CI with the new cases observed on windows-latest

**Cross-cutting constraints:** <!-- gsd:generated -->
- Flagged assumption (spec-less edge probe): SVC-03's edge-coverage row is `unclassified` and unresolved; the D-14 matrix stands in for edge coverage and is not claimed as a verified edge
- D-20: a recorded behaviour that looks wrong is kept and filed as a todo with the three triage keys

### Phase 88.2: Command runner and game processes (INSERTED)

**Goal**: Runner commands and game processes spawn from Rust, games outlive a GameLib crash, and a graceful quit asks before ending a running game.
**Requirements**: SVC-03 (part 3 of 4; D-30)
**Depends on**: Phase 88.1
**Research flag**: Done (shared `88-RESEARCH.md`)
**Success Criteria** (what must be TRUE):
  1. Runner commands, redaction and streamed output match golden traces; Windows quoting matches Node against a real exe
  2. Games spawn as `SpawnClass::Game` writing a private capture file Rust tails (D-29); `gamelib-proc` gains Windows start time, a non-kill-on-close Game job and a stamp-checked tree kill, with orphan-harness arms on three OS
  3. The quit dialog gains a "game running" condition (D-27, a recorded behaviour change) read from the Rust running-game registry
  4. `commandRunner.ts` is deleted; closes on goldens, three-OS CI and a stub-game smoke (launch, quit-kill, survival of parent SIGKILL)

**Plans:** 6/25 plans executed in 18 waves; planned 2026-11-26, re-sliced the same day so every plan fits the 100k smart-zone budget and stays below 15 files (goldens are recorded from the TS before each Rust slice, D-25; the quit prompt lands before games become Game-class)

Plans:
**Wave 1**
- [x] 88.2-01-PLAN.md — runnerTrace harness; goldens: callRunner (pairwise, dedup, abort, transcripts, every title); classes.json runner call sites
- [x] 88.2-02-PLAN.md — gamelib-proc unix: GameHandle, stamp-checked kill_game_tree, group_alive, terminate_one, orphan arms

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 88.2-03-PLAN.md — Goldens: the credential redaction vectors and the gog and nile auth log sanitizers
- [x] 88.2-04-PLAN.md — Goldens: the wine launch variant (header, chunks, track, resolveOn), launch scripts and winepath; the commandRunner.test.ts census closed
- [x] 88.2-05-PLAN.md — Goldens: spawnAsync and errorHandler/askForceUninstall
- [x] 88.2-06-PLAN.md — gamelib-proc Windows: GetProcessTimes stamp, named non-kill-on-close Game Job, kill over the Job, Windows orphan arms
- [ ] 88.2-07-PLAN.md — Rust call_runner helper path: redacted command line, log hand-off, dedup, abort, 50-chunk window; golden_runner and runner_real

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 88.2-08-PLAN.md — Rust redaction vectors and the named auth log sanitizers; golden_redaction and golden_runner's sanitizer cases

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 88.2-09-PLAN.md — Rust errorHandler and askForceUninstall over the ManagerHooks seam (game_title, force_uninstall)

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 88.2-10-PLAN.md — Game class: a private capture file Rust tails, the tracked registry's entries, the stub-game launch and parent-SIGKILL arms

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 88.2-11-PLAN.md — The registry's kill and query ops, the stub-game quit-kill arm, and golden_runner's game-class cases

**Wave 7** *(blocked on Wave 6 completion)*
- [ ] 88.2-12-PLAN.md — The wine launch variant closing 87's three wine_command deltas

**Wave 8** *(blocked on Wave 7 completion)*
- [ ] 88.2-13-PLAN.md — Launch script and winepath ops with their replays

**Wave 9** *(blocked on Wave 8 completion)*
- [ ] 88.2-14-PLAN.md — spawnAsync as a Rust op; the Windows command-line cross-check against Node, with .bat and .cmd

**Wave 10** *(blocked on Wave 9 completion)*
- [ ] 88.2-15-PLAN.md — Runner transport: the runner call, kill and abort channels, output and spawned frames, the listener and the stream table

**Wave 11** *(blocked on Wave 10 completion)*
- [ ] 88.2-16-PLAN.md — The commandRunner-shaped adapter, the log-writer hand-off and the abort forwarding

**Wave 12** *(blocked on Wave 11 completion)*
- [ ] 88.2-17-PLAN.md — Wine command, winepath, script, spawnAsync, tracked-kill and games-running channels and shims

**Wave 13** *(blocked on Wave 12 completion)*
- [ ] 88.2-18-PLAN.md — ManagerHooks transport, shell half: `SidecarManagerHooks`, `launchManagerCall` long-running, fail-safe at sidecar EOF
- [ ] 88.2-19-PLAN.md — The quit dialog gains the game-running condition from the Rust registry; Yes kills through gamelib-proc (D-27 behaviour change)

**Wave 14** *(blocked on Wave 13 completion)*
- [ ] 88.2-20-PLAN.md — ManagerHooks transport, TS half: the `launchManagerCall` handler and the askForceUninstall channel

**Wave 15** *(blocked on Wave 14 completion)*
- [ ] 88.2-21-PLAN.md — Boot wiring of the runner and spawnAsync adapters; the five game launches spawn as Game class

**Wave 16** *(blocked on Wave 15 completion)*
- [ ] 88.2-22-PLAN.md — Sanitizers by name, the managers' Stop through the Rust registry, the folder-missing prompt through the shim
- [ ] 88.2-23-PLAN.md — Sync with main; retire the runner oracle drivers and port the RF1 CrossOver invariants behind the RED-first runnerOraclePortComplete gate

**Wave 17** *(blocked on Wave 16 completion)*
- [ ] 88.2-24-PLAN.md — Delete commandRunner.ts and its tests behind the RED-first commandRunnerPortComplete gate; survivors

**Wave 18** *(blocked on Wave 17 completion)*
- [ ] 88.2-25-PLAN.md — Clean-worktree proof, push checkpoint and three-OS CI with the orphan arms, the stub-game smoke and Windows quoting (D-30: no signed build)

**Cross-cutting constraints:** <!-- gsd:generated -->
- Flagged assumption (spec-less edge probe): SVC-03's edge-coverage row is `unclassified` and unresolved; the D-14 matrix stands in for edge coverage and is not claimed as a verified edge
- D-20: a recorded behaviour that looks wrong is kept and filed as a todo with the three triage keys
- Reversibility: costly (D-26) — the hook channel is the contract the managers implement until 91/92

- No 88.2 commit lands before 88.1-20's push: its push check needs nothing outside .planning/ between its candidate head and the push (wave-1 preconditions)

### Phase 88.3: Launch funnel, re-adoption and the live gate (INSERTED)

**Goal**: Launching any game builds the same command line and environment from Rust end to end, through one Rust launch funnel, and a game that survived a crash is re-adopted.
**Requirements**: SVC-03 (part 4 of 4; D-30)
**Depends on**: Phase 88.2
**Research flag**: Done (shared `88-RESEARCH.md`)
**Success Criteria** (what must be TRUE):
  1. The Rust funnel over `ManagerHooks` (D-26) matches the TS funnel transcript, with a single in-flight launch per game
  2. A game that survived a GameLib crash is re-adopted on next boot (D-08..D-10); a quit-killed game's playtime is recorded at the kill and its after-script runs at next boot (D-31)
  3. A game launched from the UI starts and runs on macOS (live, signed 88.3 build over the signed 87 gap build) and on Windows and Linux (CI plus Phase 99)
  4. `launcher.ts` and every remaining ported TS and registration are deleted, leaving only scheduled shims

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 88.3 to break down)

### Phase 89: Steam library state

**Goal**: Steam library state, game sessions and update detection live in one Rust owner, and the TypeScript poll event machinery is gone.
**Requirements**: STM-01
**Depends on**: Phase 88.3
**Research flag**: Needs deeper research (Phase 80 open warnings A-WR-01, A-WR-02 and the poison-event cap resolved first or inside)
**Success Criteria** (what must be TRUE):
  1. The Steam library, installed state, game sessions and update-available badges update live in the UI with no TypeScript state owner
  2. The Phase 80 state-event handler, the outbox/ack/seq code and the `polls=ts` fallback are deleted from the repo
  3. Installing, updating and launching a Steam game still moves its state correctly with no stale write-back
  4. `steamPollEventRegistration.ts` and the TS poll remnants and their sidecar registrations are deleted in this phase

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 89 to break down)

### Phase 90: Steam services and TypeScript depot path

**Goal**: The Steam CM session, sign-in, redeem and Refresh are served in-process by Rust, with no TypeScript session or sign-in services left.
**Requirements**: STM-02 (part 1 of 3; split 2026-11-24, `90-CONTEXT.md` D-01/D-02, which also governs 90.1 and 90.2)
**Depends on**: Phase 89
**Research flag**: Standard
**Success Criteria** (what must be TRUE):
  1. Sign-in (QR, credentials, SteamGuard), sign-out, redeem and Refresh run on native Rust channels and match goldens recorded from the TypeScript (live proof in 90.2's gate)
  2. The CM session, anonymous client, token store and configure gate are in-process Rust state; the token stays in the keyring with no new Keychain prompt
  3. The `user*`, `authTrigger`, `tokenStore`, `rustSession`, `logonVerdict`, `anonymousClient`, `clientSetup` and `cm/` TypeScript and their sidecar registrations are deleted in this phase
  4. Phase 90 closes on goldens and three-OS CI; no signed build checkpoint or live gate (D-03)

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 90 to break down)

### Phase 90.1: Steam install, update, uninstall and the depot path (INSERTED)

**Goal**: Steam install, update, uninstall and every depot call run in-process in Rust, with no `ShellJobHost` round trip.
**Requirements**: STM-02 (part 2 of 3; decisions in `90-CONTEXT.md`)
**Depends on**: Phase 90
**Research flag**: Standard
**Success Criteria** (what must be TRUE):
  1. Native depot install, update (with the update badge and prompt), uninstall and verify match goldens recorded from the TypeScript
  2. The depot job registry, progress and CDN-token asks are in-process Rust calls; `ShellJobHost` is deleted
  3. The Steamworks Common Redistributables (228980) download is a Rust depot job that the bridge reaches through a shim deleted in 95; `sharedRedistLocks.ts` moves to `bridge/` (D-09)
  4. `depot/`, `depotRust/` and the install, update and uninstall TypeScript and their sidecar registrations are deleted in this phase; it closes on goldens and three-OS CI (D-03)

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 90.1 to break down)

### Phase 90.2: Steam launch, Mac Steam adoption and the router (INSERTED)

**Goal**: Every non-bridge Steam operation is served by Rust and `games.ts` is gone, with a thin TS router left only for bridge branches.
**Requirements**: STM-02 (part 3 of 3; decisions in `90-CONTEXT.md`)
**Depends on**: Phase 90.1
**Research flag**: Standard
**Success Criteria** (what must be TRUE):
  1. A user can sign in to Steam (QR, credentials, SteamGuard), get the right redeem errors, and install, update, uninstall and launch a Steam game end to end on a signed 90.2 build installed over a signed 88 build (the six-item gate in `90-CONTEXT.md` D-12, which also carries Phase 89's live items, D-13)
  2. Mac Steam adoption of a GameLib install, including the pending-adoption record and restart-on-Play, works as before
  3. The route verdict is Rust; the thin TS router branches only between bridge TS and Rust shims, and each bridge branch is a schedule row deleted in 95/96/97 (D-04/D-05)
  4. `games.ts`, `gameLaunch`, `steamLaunchWatch`, `directLaunch/`, `macSteam*` and the remaining non-bridge Steam TS shims and their sidecar registrations are deleted in this phase; no mirror row or shim with only non-bridge callers remains (D-07/D-08)

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 90.2 to break down)

### Phase 91: Epic (legendary) runner

**Goal**: Epic sign-in, library and game management run from Rust over the bundled legendary binary.
**Requirements**: STO-01
**Depends on**: Phase 88.3 (Lane B; needs `enginewine` from 87, and the in-process funnel, `ManagerHooks` and `knownFixLaunch` from 88–88.3, nothing from Steam)
**Research flag**: Needs deeper research (external binary output formats, Windows process-tree kill and quoting; parsers first with real captured transcripts)
**Success Criteria** (what must be TRUE):
  1. A user can sign in to Epic and see their library, and install, update, repair, move and uninstall a game
  2. An Epic game launches with the EOS overlay working
  3. Output parsers pass against real captured legendary transcripts
  4. The legendary TypeScript and its sidecar registrations are deleted in this phase

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 91 to break down)

### Phase 92: GOG, Amazon and sideloaded runners

**Goal**: GOG, Amazon and sideloaded apps run from Rust over the bundled binaries.
**Requirements**: STO-02, STO-03
**Depends on**: Phase 91
**Research flag**: Needs deeper research (gogdl/comet/nile binary formats, Windows kill and quoting)
**Success Criteria** (what must be TRUE):
  1. A user can sign in to GOG, see the library, install, update, repair, move and uninstall a game, launch it, and sync cloud saves
  2. A user can sign in to Amazon, see the library, and install, launch and uninstall an Amazon game
  3. A sideloaded app can be added, launched and removed as before
  4. Discord rich presence is absent by the recorded operator decision, not by accident
  5. The gog, nile and sideload TypeScript, `storeManagerCommon`, `save_sync` and their sidecar registrations are deleted in this phase

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 92 to break down)

### Phase 93: Download manager

**Goal**: The download queue runs in Rust and keeps every behaviour users rely on.
**Requirements**: STO-04
**Depends on**: Phases 90.1, 92 (the queue calls Steam install code that 90.1 ports)
**Research flag**: Needs deeper research (regression scenarios from `steam-dm-queue-wedge` and `gog-download-resume-from-zero`)
**Success Criteria** (what must be TRUE):
  1. Downloads can be paused and resumed, and a download interrupted by quitting resumes after relaunch without restarting from zero
  2. A stalled download is detected and recovered without wedging the queue, covering the Steam and GOG regression scenarios
  3. The finished list and persisted queue state survive restart
  4. The TypeScript download manager, `easydl` and their sidecar registrations are deleted in this phase

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 93 to break down)

### Phase 94: Humble Bundle and shortcuts

**Goal**: Humble key handling and desktop shortcuts run from Rust.
**Requirements**: SVC-04, SVC-05
**Depends on**: Phase 86 (Lane C; Humble imports only Steam types, shortcuts use process/context and Rust steamfiles)
**Research flag**: Standard
**Success Criteria** (what must be TRUE):
  1. Humble keys sync, can be claimed and redeemed as before, with secrets still read through the keyring dispatch and no new Keychain prompt
  2. Shortcuts are created and removed as before on macOS, Windows and Linux
  3. The Humble and shortcut test oracles are ported as Rust tests or recorded fixtures
  4. The Humble and shortcuts TypeScript and their sidecar registrations are deleted in this phase, except scheduled survivors listed in the schedule test (D-03, D-04, D-24, D-27)

**Plans:** 22/32 plans executed (94-07 partial and 94-14 partial, awaiting macOS icon_geometry goldens) in 18 waves; planned 2026-11-24 (runs in `.claude/worktrees/phase-94`, rebased onto main before each wave, D-02)

Plans:
**Wave 1**
- [x] 94-01-PLAN.md — Live macOS gate contract 94-HUMAN-UAT.md (five D-09 items, D-10 signed upgrade), the 82 amendment (humbleConfigStore 94 -> 92, timestampStore 94 -> 88, D-24) and the SC4 wording
- [x] 94-02-PLAN.md — gamelib-humble and gamelib-shortcuts crates with their full dependency set, CI wiring, and `ProcSpec::hide_window`
- [x] 94-03-PLAN.md — Delete-gate machinery: humblePortComplete, shortcutsPortComplete (no flag, D-15) and the survivor schedule with the `relocated` shape

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 94-04-PLAN.md — Login-window seam and user agent relocated to src/backend/login/ unchanged, with the slot install moved out (D-03)
- [x] 94-05-PLAN.md — Shortcuts TS oracle; byte-exact text goldens with hostile names, sanitize vectors, paths and exists (D-14)
- [x] 94-06-PLAN.md — Humble TS oracle: the wire-level recorder, redaction scan, classify/dedup vectors and the shared title-match vectors

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 94-07-PLAN.md — Shortcut goldens: Windows `.lnk` spawn, registry and icon chain, Add to Steam, removal with the D-29 deltas, the sips icon geometry, getIcon
- [x] 94-08-PLAN.md — Humble goldens: adapter request pinning on the wire, every library and reveal flow, the D-07 byte set
- [x] 94-09-PLAN.md — Humble goldens: login watch, disconnect, probe and verdict, secrets and migration, digest, resolver, user agent; i18n cases and `t_unescaped`
- [ ] 94-10-PLAN.md — One redacted real Humble capture from the operator's account and the pinned real request shape (D-05)
- [x] 94-12-PLAN.md — Classifier in Rust with JS regex and date parity, classify.test.ts as named Rust tests

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 94-11-PLAN.md — Tracer: `shortcutsExists` end to end (sanitize, paths, hidden reg.exe, shell dispatch, one TS resolver)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 94-13-PLAN.md — Tracer: native `humble` slice with two StoreHost reads; the Humble context seams
- [x] 94-14-PLAN.md — macOS `.app` (run.sh, Info.plist, centred-crop icns, proof-guarded Desktop link) and Linux `.desktop` writers, byte-identical (icon_geometry pending Mac goldens)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 94-15-PLAN.md — Humble HTTP seam (no redirects, multipart, request pinning); app-id resolver, title match and dedup
- [x] 94-16-PLAN.md — Windows `.lnk` through PowerShell via gamelib-proc, the icon chain and getIcon

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 94-17-PLAN.md — Expiry digest with i18next-identical text and the backfill; the user-agent twin
- [x] 94-18-PLAN.md — Removal with the creation proof on every OS (D-29) and the add op with renderer notifications

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 94-19-PLAN.md — The eleven Humble files round-trip byte for byte through the StoreHost (D-07); corrupt copy-aside; disconnect clear set
- [x] 94-20-PLAN.md — Add to Steam, Remove from Steam and isAddedToSteam behind the steamfiles and wiki seams

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 94-21-PLAN.md — Humble secrets owner over the unchanged keyring slots and dev vault; the boot migration moved to Rust in one commit (D-18)
- [x] 94-22-PLAN.md — Every shortcut caller switched to Rust through resolvers; `processShortcut` relocated (D-27); shortcutsFlowRegistration deleted

**Wave 10** *(blocked on Wave 9 completion)*
- [ ] 94-23-PLAN.md — Humble server-action adapter in Rust, pinned on the wire to the TS and the real capture
- [x] 94-24-PLAN.md — Shortcuts TS deleted behind its delete gate; wiki resolver retired; dependencies pruned; quirk todos

**Wave 11** *(blocked on Wave 10 completion)*
- [ ] 94-25-PLAN.md — Library sync, ownership recompute and key reads in Rust; the sync-level D-07 round trip

**Wave 12** *(blocked on Wave 11 completion)*
- [ ] 94-26-PLAN.md — Reveal (C2, C4, bounded, D-26 hidden-window fallback), mark/undo, overrides and gift link in Rust

**Wave 13** *(blocked on Wave 12 completion)*
- [ ] 94-27-PLAN.md — Login watch over the Rust login window, reconnect, disconnect, probe, and Rust-owned sign-in state (D-24)

**Wave 14** *(blocked on Wave 13 completion)*
- [ ] 94-28-PLAN.md — Native handlers for every remaining Humble channel (unregistered) and the sign-in frame schema

**Wave 15** *(blocked on Wave 14 completion)*
- [ ] 94-29-PLAN.md — The one-commit Humble switch: seventeen native channels, both registrations deleted, the sign-in resolver and view, the recompute shim

**Wave 16** *(blocked on Wave 15 completion)*
- [ ] 94-30-PLAN.md — Humble TS deleted behind its delete gate; common suites and the config mirror kept (D-28, D-24)

**Wave 17** *(blocked on Wave 16 completion)*
- [ ] 94-31-PLAN.md — Clean-worktree proof, SC4 and survivor sweep, push checkpoint, three-OS CI, signed base and Phase 94 builds (D-10, D-11)

**Wave 18** *(blocked on Wave 17 completion)*
- [ ] 94-32-PLAN.md — Run the live macOS gate (signed base -> signed Phase 94); delete the reveal fallback only if the Rust reveal passed (D-26)

**Cross-cutting constraints:** <!-- gsd:generated -->
- 82 D-05: every golden slice carries `MANIFEST.json` `{count, floor}` and every case runs on a fresh createFakeHomeProfile()

- Memory-note shape: any offline step turns the network off only for the action (off, act, on, report)
- Two-profile rule: every golden runs on an isolated createFakeHomeProfile(); no case reads the real HOME
- D-02: rebase the worktree onto main before each wave and re-run `pnpm gen:ipc-contract`; 94's STATE stays worktree-local until the merge

### Phase 95: Steam bridge install

**Goal**: Installing a game through the Steam bridge runs in Rust.
**Requirements**: STM-03
**Depends on**: Phase 90.2
**Research flag**: Needs deeper research (run the bridge spike early; runs in Lane A alongside Lane B's 91-93)
**Success Criteria** (what must be TRUE):
  1. A bridge install performs the import scan, shim placement and shared redistributable install and produces the same installed layout as before
  2. An already bridge-verified title installs and still verifies under the strict bridge-verified criterion
  3. The bridge install TypeScript and its sidecar registrations are deleted in this phase

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 95 to break down)

### Phase 96: Steam bridge launch and bottle lifecycle

**Goal**: Launching a bridged game and managing its bottle run in Rust.
**Requirements**: STM-04
**Depends on**: Phase 95
**Research flag**: Needs deeper research
**Success Criteria** (what must be TRUE):
  1. A bridged game launches, runs and stops cleanly, and its bottle is created, reused and removed without touching a sibling
  2. Every title previously bridge-verified (HELLO plus clean game Steam-init log) is still verified after the port
  3. The bridge launch and bottle TypeScript and their sidecar registrations are deleted in this phase

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 96 to break down)

### Phase 97: Steam bridge DRM mode, overlay and known fixes

**Goal**: DRM mode, the in-game overlay and per-game fixes for bridged games run in Rust.
**Requirements**: STM-05
**Depends on**: Phase 96
**Research flag**: Needs deeper research (DRM boundary rules apply)
**Success Criteria** (what must be TRUE):
  1. Grim Dawn, Raft and Ranch Simulator launch and stay bridge-verified
  2. The Shift+Tab Steam overlay opens in a bridged game
  3. A DRM-mode launch works with the same lsteamclient game-process trace as before
  4. Bridge known fixes apply per game, and all remaining bridge TypeScript and its registrations are deleted in this phase

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 97 to break down)

### Phase 98: Shell cutover

**Goal**: Links, single-instance, quit and boot run with no sidecar, and dev builds stop prompting for the Keychain.
**Requirements**: RET-01, RET-04
**Depends on**: Phases 93, 94, 97
**Research flag**: Standard
**Success Criteria** (what must be TRUE):
  1. A `gamelib://` link opens the right screen in a running app and in a cold start, and a second launch focuses the existing window
  2. Quitting the app (menu, window close, tray) exits cleanly with no sidecar involved
  3. A dev build launched with the dev-vault flag does not prompt for the Keychain on every launch, and release builds contain no dev vault code
  4. `protocol.ts`, `quitHandler`, the TS boot sequence, `processGuards` and all remaining `sidecar/` registrations are replaced or deleted in this phase, with unreachable leftovers (`legacyZoomDataCleanup`, `devEpicCookieSweep`, `nativeImageShim`) deleted

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 98 to break down)

### Phase 99: Sidecar deletion

**Goal**: GameLib ships and updates with no Node runtime, and a gate keeps it that way.
**Requirements**: RET-02, RET-03
**Depends on**: Phase 98
**Research flag**: Needs deeper research (packaged macOS build with sidecar absent, updater-from-previous-release test)
**Success Criteria** (what must be TRUE):
  1. The macOS, Windows and Linux packages contain no Node runtime or sidecar binary, and the signed and notarized macOS build passes `codesign --verify --deep`
  2. Auto-update from the previous release to this build succeeds, and credentials and settings carry over
  3. `src/backend`, the SEA build, the backend jest project, `smoke:sidecar` and the sidecar CI steps are deleted, and `nodeRetired.test.ts` fails if any of them returns
  4. `cargo test --workspace` is green on all three OS legs, and the package size delta is recorded
  5. The CLAUDE.md sidecar convention is replaced by the Rust shutdown contract

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 99 to break down)

### Phase 100: Game page without the ⋮ menu

**Goal:** The game page has no ⋮ menu: every action sits next to what it changes. The left card is the game (store link, Edit details, Favourite heart by the title, category chips, Hide); the Install tab is the hub for your copy (Location → Open/Move, Size → Modify, Version → Verify/Check for updates, integration switch rows, red Uninstall last behind a confirmation); the ⚙ dialog owns how the game runs; the footer holds only tier-one actions. Requirements and the left-card play-time block are removed as duplicates; pending and error states live inside each row. Design source: sketch 012 (folds in 010, 011) — `.claude/skills/sketch-findings-gamelib/references/game-page.md`.
**Requirements**: TBD
**Depends on:** Nothing (frontend-only; independent of the v0.11 port phases)
**Plans:** 10/14 plans executed

Plans:
**Wave 1**
- [x] 100-01-PLAN.md — Install tab skeleton: shortcuts switch row end to end, installActionGates + rowAction, --fav and switch-track tokens

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 100-02-PLAN.md — Left card library row: Favourite heart, category chips + create-and-assign popover, Hide + hidden notice

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 100-03-PLAN.md — Play time into the footer status line (TimeContainer deleted), Edit details pencil, store badge link

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 100-04-PLAN.md — Location / Size / Version rows: Move, Set install folder, Modify, Verify, Update, What's new with busy, gating and inline failure

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 100-05-PLAN.md — Cloud saves row + Auto-sync switch, Engine and static facts, not-installed facts + Locate link, notes; InstalledInfo retired

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 100-06-PLAN.md — Show in Steam and Runs for me switch rows, danger zone (Uninstall / Remove all copies)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 100-07-PLAN.md — ⚙ dialog: Logs tab (log modal type merged), EOS overlay switch, Wine prefix folder button

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 100-08-PLAN.md — Footer Install ▾ Locate for non-Steam, tab relabel, Apple compatibility + ProtonDB on Ratings

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 100-09-PLAN.md — Delete ⋮ with every gate retargeted, D-07 GameCard menu guard, dead CSS removed

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 100-10-PLAN.md — 100-HUMAN-UAT.md (D-15 themes, D-16 store walk) and the full phase-gate run

**Wave 11** *(gap closure, blocked on Wave 10 completion)*
- [ ] 100-11-PLAN.md — Shell: moveInstall, changeInstallPath, steamRemoveAllCopies on LONG_RUNNING_CHANNELS with Rust pins and the TS mirror (CR-02)
- [ ] 100-12-PLAN.md — Version row renders with no install.version ("Unknown", Verify reachable) plus a hook-harness render test; RowFailure Retry obeys its gate (CR-01)

**Wave 12** *(gap closure, blocked on 100-12)*
- [ ] 100-13-PLAN.md — Location row truthful past 60 s (timeout hand-off, failure hidden while moving), gate-aware Retry, non-sticky failures, Open for third-party games (CR-02, WR-04, WR-02)

**Wave 13** *(gap closure, blocked on 100-11 and 100-13)*
- [ ] 100-14-PLAN.md — Danger-zone failure path for Uninstall and Remove all copies (WR-05), UAT items 19-20, review dispositions, full phase-gate run

### Phase 101: Steam Verify & Move install

**Goal:** Verify and Move work for Steam games. For games installed by native Mac Steam, Verify calls
`StartValidatingApp` and Move calls `CanMoveApp` then `MoveApp` through the bridge helper (spikes 090
and 091), with completion tracked by install state and the cached install path refreshed after a
move. For bridge (CrossOver-bottled) games, the meaning of Verify and Move is settled in discussion
(GameLib's own Rust depot verifier is the likely Verify). This replaces the `moveInstall` stub and
the bridge-DLL-only `repair` in `steam/gameMaintenance.ts`.
**Source todo:** `.planning/todos/pending/2026-11-07-implement-steam-verify-and-move-install.md`
**Requirements**: TBD
**Depends on:** Nothing (spikes 090, 091 validated the Steam-registered half)
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 101 to break down)
