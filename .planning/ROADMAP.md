
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
- 🚧 **v0.10 Foundations** — Phases 61–78 plus Phase 47 (started 2026-11-12; adopts Phases 61–75, 11 already complete) — requirements: `REQUIREMENTS.md`

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

**🚧 v0.10 Foundations (in progress, started 2026-11-12)**

- [x] **Phase 61: Unified macOS engine for all stores** — 27/27 plans (20 + 7 gap closure); re-verified 22/22, operator approved 2026-11-07 (completed 2026-11-07)
- [x] **Phase 62: Module boundaries and decomposition** — 23 plans (21 + 2 gap closure); complete (completed 2026-11-07)
- [x] **Phase 63: Rust migration pattern and executable scanners** — 14 plans; planned (completed 2026-11-07)
- [ ] **Phase 64: UI to edit themes** — 0 plans; not started
- [x] **Phase 65: Steam store manager decomposition, continued** — 20/20 plans complete; Phase 61 closed 2026-11-07 — unblocked, D-11 (completed 2026-11-08)
- [x] **Phase 66: Backend dependency injection replacing module-level singletons** — 9 plans; planned; split 2026-11-10 into 66 (foundation) + 66.1–66.3 (completed 2026-11-09)
- [x] **Phase 66.1: Backend DI — stores, store managers, flow registrations and launcher** — 37 plans; complete (7/8 live UAT, item 5 blocked pre-existing) (completed 2026-11-10)
- [x] **Phase 66.2: Every backend spawn through the process runner, then the `child_process` ban** — 12 plans; planned (completed 2026-11-10)
- [x] **Phase 66.3: Backend module state to zero, then the live macOS smoke** — 18 plans; planned; split 2026-11-11 into 66.3 (shim, config, D-05 owners, static holders) + 66.4 (D-66.3-04) (completed 2026-11-11)
- [ ] **Phase 66.4: Backend module state long tail, the census-to-test flip, then the live smokes** — 23 plans; planned
- [x] **Phase 67: Schema validation at the sidecar IPC boundary** — 20 plans in 14 waves; planned 2026-11-07 (completed 2026-11-07)
- [x] **Phase 68: Versioned persisted stores and migrations** — 11 plans; planned (completed 2026-11-08)
- [ ] **Phase 69: Consolidate frontend state onto GlobalStateV2** — 26/26 plans executed; verification 8/8, 3 human UAT items pending
- [ ] **Phase 70: Split GameInfo into shared and per-store shapes** — 0 plans; not started
- [x] **Phase 71: Rust shell module decomposition** — 20 plans; complete (completed 2026-11-09, gaps closed by 71-19/71-20)
- [x] **Phase 72: Renderer trust boundary and process hardening** — 0 plans; not started (completed 2026-11-08)
- [x] **Phase 73: Steam depot download pipeline in Rust** — 21 plans; complete (completed 2026-11-10)
- [x] **Phase 74: Steam game updates** — 13 plans executed; live gate not passed (2026-11-13: 7 gaps, items 7 and 12), awaiting gap closure (completed 2026-11-13)
- [ ] **Phase 75: Steam local file formats in Rust** — 0 plans; not started
- [ ] **Phase 76: Engine-correct bottle for DRM-mode launches (v0.9 audit S9)** — 0 plans; not started
- [ ] **Phase 77: Runtime hardening from the v0.9 review debt** — 0 plans; not started
- [ ] **Phase 78: Verification records and test health after v0.9** — 0 plans; not started
- [ ] **Phase 47: Migrate aggregated store search from CheapShark to IsThereAnyDeal** — 0 plans; ITAD gates closed 2026-11-12; ready to plan (moved from v0.8)

## Phase Details

Phase details for every phase through 50 live in the archived roadmap, `milestones/v0.8-ROADMAP.md`
(`## Phase Details` for phases 1–9, `## v0.2 Phase Details` … `## v0.8 Phase Details`); phases
51–60 are in `milestones/v0.9-ROADMAP.md` (`## v0.9 Phase Details`). New phases
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

32-bit-only titles get the shim withheld by design (D-53-09 deferred x86). The x86 export list
is hand-pinned (~50 bare accessors); the generated flat `SteamAPI_ISteam*` API exists for x64
only, and x86 does not serve SteamUser020, SteamFriends017, SteamUtils009 or the current
SteamApps/SteamUserStats versions. `classifyUnservableInterfaceVersions` therefore blocks
placement, and `gameBridgeLaunch.ts` launches direct with no helper.

Scope if promoted: x86 flat-API generation in `meta/gen_vtables.ts`, x86 manifests and vtables
for the missing versions, a 32-bit shim build verified under Wine. **Acceptance title:** Cat
Quest (593280, 32-bit Mono Unity, Steamworks.NET) — strict verified bar: shim HELLO plus a
clean game Steam-init line in its `error.log` / `output_log.txt`. Diagnosis:
`.planning/debug/resolved/cat-quest-shim-withheld.md`.

**Second acceptance title:** Undertale (391540, GameMaker 1.4 x86 runner, runtime-loaded
`steam_api.dll`). The runner resolves `SteamAPI_InitSafe`, `SteamAPI_GetHSteamPipe` and
`SteamAPI_GetHSteamUser` by name; the x86 shim exports none of them, so init never reaches the
shim and HELLO is never sent. The shim is now withheld for this shape (original restored from
`.gamelib-orig`, direct launch, no helper), not bridged, so it is **not verified**. Same strict
bar as Cat Quest: shim HELLO plus a game-originated bridge call. Diagnosis:
`.planning/debug/resolved/undertale-shim-placed-no-hello.md`.

**Adjacent, deliberately NOT folded in:** confirming that `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD` and `APPLE_SIGNING_IDENTITY` are enrolled as repo secrets — without
them `.github/workflows/release-tauri.yml` ships unsigned, giving each release a fresh code
identity so the macOS Keychain ACL never matches and users get re-prompted on every update. That
is the actual lever on prompt *quantity*, it is independent of this phase, and it should not wait
on it.

## v0.10 Phase Details

v0.10 Foundations (started 2026-11-12) adopts Phases 61–75 and Phase 47, and adds Phases 76–78 for the v0.9 audit debt. Milestone-level requirements and traceability: `REQUIREMENTS.md`. Phase details for 51–60 (v0.9) live in
`milestones/v0.9-ROADMAP.md` (`## v0.9 Phase Details`); their directories are under
`milestones/v0.9-phases/`.

### Phase 61: Unified macOS engine for all stores

**Goal:** Every Windows game GameLib runs under Wine on macOS, from any store (Epic/legendary, GOG, Amazon/nile, sideload, Steam), gets one per-game **Engine** control: Automatic (CrossOver first, then GameLib's pinned Wine-Staging + DXVK build), CrossOver, the pinned builds, or a Wine Manager build. For non-Steam games it replaces the Wine Version selector, which today is their only engine choice. Behind it, the Phase 59 engine decision moves out of `src/backend/storeManagers/steam/engine/` so non-Steam launches get the same protection: a trial-expiry check before each launch plus the "N days remaining" notice, a timeout on every CrossOver launch, broken-CrossOver detection, and creation of a fallback bottle for non-Steam CrossOver bottles and prefixes. Open questions for discuss-phase: (1) how the "Unsupported — known fixes and compatibility ratings don't apply" warning reads for stores that have no Steam-keyed fixes or ratings; (2) how existing per-game `wineVersion` choices migrate into the new control. Extends Phase 59, whose `59-CONTEXT.md` scoped this to Steam bridge titles; the Steam-side UI is now on the Wine tab (quick 261104-tm6).
**Requirements**: CONTEXT decisions D-01..D-20 (no REQUIREMENTS.md IDs)
**Depends on:** Phase 59
**Plans:** 27/27 plans complete

Plans:

**Wave 1**

- [x] 61-01-PLAN.md — Spike 068: non-Steam first-match `ps` signal and per-game bottle-name limits (checkpoint)
- [x] 61-02-PLAN.md — Pure move: steam/engine/ to src/backend/engine/, importers and mocks repointed

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 61-03-PLAN.md — D-19: extract the six bottle.ts primitives into engine/bottlePrimitives.ts
- [x] 61-06-PLAN.md — engineOverride key, read-time migration (D-05..D-09), backend write guard

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 61-04-PLAN.md — Pure moves: crossoverLocation, runTool, processListing into the engine
- [x] 61-05-PLAN.md — Game keys for the registry/deadline, and the per-bottle running-games ledger (D-16)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 61-08-PLAN.md — Store-agnostic engineDecision/engineSwitch, Steam adapter, bottle-busy refusal

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 61-07-PLAN.md — Per-game bottle name/creation (D-01, D-03) and the bottle-or-prefix rule (D-02, D-04)
- [x] 61-09-PLAN.md — Shared EngineState/EngineOption types; backend and frontend importers repointed

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 61-10-PLAN.md — Store-agnostic engine state, notice store, Steam adapter wrapper; engine-is-store-agnostic rule

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 61-11-PLAN.md — Non-Steam engine state, option list with Legacy, global default, bottle names
- [x] 61-12-PLAN.md — Non-Steam launch engine step and per-launch settings overlay

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 61-13-PLAN.md — `engine` IPC domain replacing the Steam engine channels
- [x] 61-14-PLAN.md — Launcher wiring, overlay census, legacy-bottle snapshot test, bottle-aware Wine tools (Winetricks, Run EXE)
- [x] 61-15-PLAN.md — Store-manager overlay reads and engine-aware GOG/Amazon setup

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 61-16-PLAN.md — Non-Steam first-match watcher and launch deadline (per spike 068)
- [x] 61-17-PLAN.md — Frontend engine store, badge and notices keyed by game

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 61-18-PLAN.md — Engine control for every store, Wine tab gating, global default (D-09, D-10)

**Wave 11** *(blocked on Wave 10 completion)*

- [x] 61-19-PLAN.md — Install/Import/ThirdParty/Sideload dialogs use the Engine control (D-17)

**Wave 12** *(blocked on Wave 11 completion)*

- [x] 61-20-PLAN.md — Phase gates and live UAT (checkpoint)

**Gap closure, Wave 13** *(parallel; disjoint files)*

- [x] 61-21-PLAN.md — Deadline safety: C:\ (drive_c) match form, no-kill notice on deadline, cancel on watcher give-up (CR-02, CR-03, WR-01; D-18, D-16)
- [x] 61-22-PLAN.md — Legacy CrossOver bottle names: probe via sanitizeBottleName, invalid-bottle is inconclusive, inconclusive never falls back (CR-01; D-05)
- [x] 61-23-PLAN.md — Drop the engineOverride game-config default; Legacy switch confirm (CR-05, G-1; D-08, D-09, D-04)
- [x] 61-24-PLAN.md — Sideload Run installer runs in the per-game bottle via a pending-install path (CR-04; D-01, D-17)

**Gap closure, Wave 14** *(blocked on Wave 13 completion)*

- [x] 61-25-PLAN.md — Combined gate run and 61-UAT.md follow-up (G-1 resolved, items 13-14 pending)

**Gap closure, Wave 15** *(review WR-01/WR-02, decided FIX 2026-11-07)*

- [x] 61-26-PLAN.md — Inconclusive pre-flight keeps the bottle's marker engine, labelled cx-inconclusive, no fallback toast/notice; Steam + non-Steam tests (WR-01; D-05, D-13, D-16, 59 D-09)

**Gap closure, Wave 16** *(blocked on Wave 15 completion)*

- [x] 61-27-PLAN.md — Launch-deadline notice as a non-modal bottom-right toast + focus-free notification; no raiseMainWindow (WR-02; D-18, D-16)

### Phase 62: Module boundaries and decomposition

**Goal:** Module boundaries in the TypeScript backend and frontend are explicit, enforced by a tool, and no longer bypassed by branching on store identity. Three parts: (1) **Boundary rules.** Add dependency-cruiser with rules in warn-only mode and record a baseline violation count. The rules: no store manager imports another store manager; `launcher.ts` reaches stores only through `storeManagers/index` (today it imports `gog/setup`, `legendary/commands`, `gog/presence` and `eos_overlay` directly); no `runner === '<literal>'` checks in `frontend/screens/**`. (2) **Store capabilities.** Give `GameInfo`/`LibraryManager` capability flags (e.g. install managed externally, DLC selection, resumable install) and replace runner-literal branching with them: 66 `runner === 'steam'` sites in the frontend (Library, Game page, ConsoleMode, InstallModal, filterEngine) and 31 in the backend outside `storeManagers/` (11 in `downloadmanager/`). `helpers/steamInstallOptionsEntry.ts` already shows the single-decision-site pattern. (3) **Decomposition.** Split `steam/games.ts` (7,150 lines, 73 imports) into launch, DRM and requirements modules; fold `steam/depot.ts` (4,598 lines) into `steam/depot/`; split `common/types/ipc.ts` (~280 channels) into per-domain channel types co-located with the sidecar `*FlowRegistration.ts` files; add a parity test for the transport constants Rust's `main.rs` mirrors from `common/types/sidecarTransport.ts` by hand. Promote the dependency-cruiser rules from warn to error once the counts reach zero. Out of scope: the `src-tauri/src/main.rs` split, which is a separate quick task. Came from an architecture review on 2026-11-06.
**Requirements**: TBD
**Depends on:** None
**Plans:** 23/23 plans complete

Plans:
**Wave 1**

- [x] 62-01-PLAN.md — dependency-cruiser (human-verified, pinned 18.7.2), graph rules at error + shrink-only baseline, seeded-violation tests
- [x] 62-02-PLAN.md — runner-literal ESLint selector + equality-ceiling ratchet (frontend/backend)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 62-03-PLAN.md — `pnpm boundaries` wired into lint.yml and pre-push, wiring test
- [x] 62-04-PLAN.md — TS/Rust transport parity test by marker (sidecar.rs, store_embed.rs dispatch arms)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 62-05-PLAN.md — games.ts pure moves: session state, requirements, DRM helpers; surface guard

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 62-06-PLAN.md — games.ts mechanical lifts: eligibility and install clusters

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 62-07-PLAN.md — games.ts mechanical lifts: launch, overlay, bridge launch

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 62-08-PLAN.md — games.ts mechanical lifts: maintenance, uninstall; D-06 cleanup todos

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 62-09-PLAN.md — depot.ts fold part 1 + back-edge repoint

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 62-10-PLAN.md — depot.ts fold part 2 + depot/index.ts swap

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 62-11-PLAN.md — ipc.ts split per domain + ipcDomainCensus test

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 62-12-PLAN.md — live macOS smoke #1 (after split)

**Wave 11** *(blocked on Wave 10 completion)*

- [x] 62-13-PLAN.md — per-site classification + storeCapabilities table + isStore

**Wave 12** *(blocked on Wave 11 completion)*

- [x] 62-14-PLAN.md — launcher.ts boundary via storeLaunchHooks + launcher literals

**Wave 13** *(blocked on Wave 12 completion)*

- [x] 62-15-PLAN.md — backend conversions: downloadmanager, gamedetails, tools, utils

**Wave 14** *(blocked on Wave 13 completion)*

- [x] 62-16-PLAN.md — backend conversions: sidecar registrations and rest (backend to 0)

**Wave 15** *(blocked on Wave 14 completion)*

- [x] 62-17-PLAN.md — frontend conversions: helpers, hooks, state, components, DownloadManager, WebView, Settings

**Wave 16** *(blocked on Wave 15 completion)*

- [x] 62-18-PLAN.md — frontend conversions: screens/Game

**Wave 17** *(blocked on Wave 16 completion)*

- [x] 62-19-PLAN.md — frontend conversions: Library, ConsoleMode, rest (frontend to 0)

**Wave 18** *(blocked on Wave 17 completion)*

- [x] 62-20-PLAN.md — promote literal ban to eslint error, delete ratchet and baselines

**Wave 19** *(blocked on Wave 18 completion)*

- [x] 62-21-PLAN.md — live macOS smoke #2 (after capabilities) + zero-at-error proof

**Gap closure (from 62-VERIFICATION.md)**

**Wave 1**

- [x] 62-22-PLAN.md — drop the unnecessary `as string[]` cast in games.test.ts (lint tests scope green)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 62-23-PLAN.md — WR-02: widen runner-literal selector, convert the 7 surviving sites to isStore, document blind spots, `pnpm lint` exit 0

**Cross-cutting constraints:**

- FRONTEND_CEILING drops by exactly the converted count in each commit (D-14)

### Phase 63: Rust migration pattern and executable scanners

**Goal:** The executable scanners run in Rust, and the pattern for moving sidecar code to Rust one piece at a time is settled and reusable. Two parts: (1) **The pattern.** Where ported code lives in `src-tauri/`, how the sidecar calls it through `rustInvoke` with the TypeScript function signature unchanged, a parity harness that runs the TypeScript and Rust implementations against the same fixtures, and a flag that keeps the TypeScript path as a fallback until the Rust one is verified live. Only a description of the work crosses the JSON-lines pipe, never bulk bytes. (2) **The scanners.** Port the PE scanners in `steam/bridge/` (`peSections.ts`, `importScan.ts`, `peSteamDrm.ts`, `drm/drmScanExe.ts`) and the Mach-O export reader `tools/machoExports.ts`, 1,168 lines in total. They are pure byte parsing: a path in, a small result out, no npm packages. Callers today are `shimGenerate.ts`, `gameMakerRunner.ts`, `steam/games.ts` and `tools/dxmt.ts`. Open question for discuss-phase: **how headless Node tools reach the Rust code.** `meta/bridgeCensus.ts` (`pnpm bridge-census`) imports `peSteamDrm` and runs under plain Node with no Rust shell, so `rustInvoke` is not available to it. The options are a standalone Rust command-line binary the tools call, or keeping the TypeScript scanners permanently as the headless path, which means two implementations. This is the first step of the incremental Rust migration path (deck slide "An incremental path from Node to Rust"). The second step, the Steam depot download pipeline, waits on a spike that measures a Rust pipeline against today's ~10 MiB/s. Came from an architecture discussion on 2026-11-06.
**Requirements**: TBD
**Depends on:** None
**Plans:** 14/14 plans complete

Plans:

**Wave 1**

- [x] 63-01-PLAN.md — Cargo workspace, gamelib-scan core (reader, containment, dispatch), gamelib-scan-cli, lock pin, CI coverage
- [x] 63-02-PLAN.md — TS op contracts, path-based legacy TS oracles, importScan closure extraction, per-scanner flag

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 63-03-PLAN.md — Tier-1 parity: synthetic fixtures, TS-derived goldens, generator, Jest golden test
- [x] 63-04-PLAN.md — Rust PE core: sections/SteamStub, CEG + .bind, imported DLLs, delay imports

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 63-05-PLAN.md — Rust import symbols + closure op, Mach-O op, cargo golden harness

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 63-06-PLAN.md — rustInvoke seam: RUST_SCAN_* channels, shell arms, invokeScan/runScanner, peScan wrappers
- [x] 63-10-PLAN.md — Headless CLI helper, census via CLI, tier-2 parity sweep

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 63-07-PLAN.md — shimGenerate + drmScanExe callers async (Option A orchestrator)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 63-08-PLAN.md — gameLaunch / gameBridgeLaunch CEG read and GameMaker runner callers async
- [x] 63-09-PLAN.md — importScan wrapper and async winemac Metal check (dxmt)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 63-11-PLAN.md — Run sweep, D-07 investigation, flip defaults, author live-smoke UAT (checkpoint)

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 63-12-PLAN.md — Live pnpm tauri:dev smoke on the Rust path (checkpoint)

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 63-13-PLAN.md — Remove the ts branches, flags and runScanner; wrappers call Rust directly

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 63-14-PLAN.md — Delete TS scanner modules, generator and sweep; deletion gate; migration pattern write-up

### Phase 64: UI to edit themes

**Goal:** Users can make their own theme by copying a built-in one and editing its colours, without the built-in themes ever changing. Three parts: (1) **Theme gallery.** A thumbnail of every theme, each a small launcher preview drawn from that theme's real token values (body, sidebar, active nav row, accent and search outline, library tiles, primary / secondary / success / danger buttons), like the comparison page made on 2026-11-05 (https://claude.ai/artifact/Ji88yFXU7ymdVoTn1kV4kY). (2) **Duplicate, then edit.** Picking a theme and choosing Duplicate creates a new custom theme seeded with the source's resolved token values (`var()` chains followed through `styles/_colors.scss`). The 10 built-in themes in `src/frontend/themes.scss` are read-only. The copy opens a token editor that lists each token with a colour swatch and value, and the copy's thumbnail updates as values change. (3) **Use it.** Saved custom themes appear in the theme selector beside the built-ins and apply app-wide. Custom themes are stored as token data, not CSS files: quick 261031-bst removed the old custom-CSS-file themes and their IPC channels, and `window.setTheme` (`src/frontend/index.tsx`) now maps any non-built-in key to the default, so that fallback needs a custom-theme branch again. Open questions for discuss-phase: whether a copy of Nord Light carries its 23 nested component overrides (they are selectors, not tokens; without them a light copy breaks MUI dialogs, genre tags and context menus); which tokens the editor shows (themes declare 25–56 each); and whether the contrast floors `themeTokens.test.ts` enforces (3:1 border against body and modal backgrounds, accent against the sidebar) become live warnings in the editor. Came from the theme comparison on 2026-11-05.
**Requirements**: THEME-01, THEME-02 (milestone-level; phase IDs minted by `/gsd-plan-phase`)
**Depends on:** None
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 64 to break down)

### Phase 65: Steam store manager decomposition, continued

**Goal:** The Steam store manager files Phase 62 leaves untouched are split along their natural seams, so no file under `storeManagers/steam/` is a multi-thousand-line grab-bag. Targets, measured 2026-11-06: `steam/library.ts` (4,393 lines), `steam/bottle.ts` (2,567), and the largest `steam/bridge/` files: `shimGenerate.ts` (1,496), `drm/runnerClone.ts` (1,376), `helperProcess.ts` (1,143) and `drm/stageDrmBottle.ts` (1,021). `shimExports.generated.ts` is generated and out of scope. Reuse Phase 62's method: a cluster map of each file first, pure moves before mechanical lifts, no behaviour change in a move commit (D-06), and the dependency-cruiser rules Phase 62 adds must stay at zero. Splitting `bottle.ts` first is worth considering because Phase 61 moves the engine and bottle decision out of `steam/`, so a clean split shrinks 61's diff. Open questions for discuss-phase: the minimum module set for `library.ts` (owned-apps fetch, local ACF/VDF scan, metadata/artwork enrichment and cache look like the seams), and whether to sequence before or after Phase 61. The Linux compile leg in `rust-test.yml` is owned by Phase 72 (72-01), not this phase. Came from the post-Phase-62 architecture review on 2026-11-06.
**Requirements**: TBD
**Depends on:** Phase 62
**Plans:** 20/20 plans complete

Plans:

**Wave 1**

- [x] 65-01-PLAN.md — D-11 precondition, test/cycle baselines, steam-line-ceiling gate + wiring, depcruise leaf-rule extension, close games.ts 1,400 todo

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 65-02-PLAN.md — library: accessor commit, pollState (D-16 leaf), installRoot, installedMap

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 65-03-PLAN.md — library: acfState, macArch, resumeBreadcrumbs, restartHold

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 65-04-PLAN.md — library: installPollOnce, installPolling (timer + unref), resume

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 65-05-PLAN.md — library: uninstallPolling, runningPoll

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 65-06-PLAN.md — library: D-07 refresh lift, git mv to library/index.ts, back-edge rule

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 65-07-PLAN.md — bottle: bottledSteam, provisionBottle (flat siblings)

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 65-08-PLAN.md — bottle: resolveCrossoverWine relocation, bridgeBottle

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 65-09-PLAN.md — bottle: bridgeBottleLifecycle; bottle.ts off the allowlist; bottle closeout

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 65-10-PLAN.md — battery + D-14 live smoke run 1 (checkpoint)

**Wave 11** *(blocked on Wave 10 completion)*

- [x] 65-11-PLAN.md — gameInstall: bridgeInstallState, gameInstallDepot, gameInstallBridge (D-17, D-19)

**Wave 12** *(blocked on Wave 11 completion)*

- [x] 65-12-PLAN.md — user.ts D-15: userTypes, userSignInState + userSignIn, userRedeem

**Wave 13** *(blocked on Wave 12 completion)*

- [x] 65-13-PLAN.md — games.ts: bridgeRouteVerdict, gameMetadata lift, eligibility + uninstall stubs (D-18); games.ts < 1,000

**Wave 14** *(blocked on Wave 13 completion)*

- [x] 65-14-PLAN.md — gameBridgeLaunch: gameBridgeWineLaunch; end-of-step-4 battery

**Wave 15** *(blocked on Wave 14 completion)*

- [x] 65-15-PLAN.md — helperProcess: helperRegistry (state owner), helperSpawn

**Wave 16** *(blocked on Wave 15 completion)*

- [x] 65-16-PLAN.md — shimGenerate: shimOriginals, shimDrmWrapper, shimPlacement

**Wave 17** *(blocked on Wave 16 completion)*

- [x] 65-17-PLAN.md — runnerClone: runnerCrossover, runnerEntitlements, runnerVerify

**Wave 18** *(blocked on Wave 17 completion)*

- [x] 65-18-PLAN.md — stageDrmBottle (D-09): stageDrmTypes, drmRegistry, drmRestore, bottleProcesses; allowlist {}

**Wave 19** *(blocked on Wave 18 completion)*

- [x] 65-19-PLAN.md — remove remaining install + launch lift stubs (D-18, D-19 fallback); close lift-stub todo

**Wave 20** *(blocked on Wave 19 completion)*

- [x] 65-20-PLAN.md — done-line proof, full battery + D-14 live smoke run 2 (checkpoint)

**Cross-cutting constraints:**

- Every importer and every jest.mock / requireMock of a moved name targets the owning module (D-03, 62 D-05)

### Phase 66: Backend dependency injection replacing module-level singletons

**Goal:** Backend modules receive their dependencies instead of reaching for module-level state, so tests need far fewer module mocks and each long-lived handle has one owner. Measured 2026-11-06: 144 top-level `let` declarations in `src/backend` (outside tests) and 2,197 `jest.mock(` calls across 706 test files. Three parts: (1) **The pattern.** A small context object built once at sidecar boot (`sidecar/bootstrap.ts`) carrying paths, logger, config/stores, the child-process spawner (which must still go through `createFakeHomeProfile()` in tests) and the clock, passed down to store managers and `launcher.ts`, with a documented way to construct a test context. (2) **Migration.** Convert the store managers and `launcher.ts` first (Phase 62 narrows `launcher.ts` to `storeManagers/index` and `storeLaunchHooks`), then other backend modules by count. Track the remaining top-level `let` and `jest.mock(` counts with a shrink-only ratchet like Phase 62's. (3) **One process runner.** 32 backend files import `child_process` directly and 42 spawn something (measured 2026-11-06). Every spawn goes through one runner module, handed out by the context, that owns `unref()` and the exit contract, timeouts (Phase 61 adds one to every CrossOver launch), log capture and redaction, and the test environment, so tests pass a fake runner built on `createFakeHomeProfile()` instead of mocking `child_process`. Existing wrappers (the `utils.ts` and per-store command helpers) become thin callers of it. A lint rule bans `child_process` imports outside the runner, with a shrink-only ratchet like the others. Owning handles in the context should make the sidecar exit contract (every timer, watcher, socket and child `unref()`d, no unbounded in-flight boot work) easier to keep and to check. It also gives Phase 63's Rust ports one place to swap an implementation. Open questions for discuss-phase: plain constructor/parameter passing versus a container library (default: none), and whether module-level caches that are genuinely process-wide may stay as explicitly registered singletons. Came from the post-Phase-62 architecture review on 2026-11-06.
**Split 2026-11-10.** At full planning depth the original scope came to about 50 plans, mostly because under D-01/D-03 every importer of a converted owner has to receive it as a dependency (`backend/utils` has 54 source importers, `platform` 45). It was split along D-15's order, and `66-CONTEXT.md` decisions D-01..D-17 apply to all four parts. **Phase 66 itself is now step 1 only:** `src/backend/process/` (clock, runner with its tracked and long-lived child registries and `openDetached`, `AppContext`), the depcruise `runner-is-a-leaf` rule, `meta/backendDiCeilings.cjs` with sharded shrink-only baselines for module state, `child_process` imports and `jest.mock(`, plus an exact-path exemption mechanism that starts empty; test fakes (`scriptedRunner`, `realRunner` on `createFakeHomeProfile()`, `fakeClock`, `createTestContext`); and `bootstrap.ts` as one ordered step list with the 17 once-guards and `i18nReady` deleted, where a second `init()` throws, together with moving the 37 sidecar tests that re-enter `init()` onto fresh contexts. About 7 plans.
**Requirements**: TBD
**Depends on:** Phase 62
**Plans:** 9/9 plans complete

Plans:

**Wave 1**

- [x] 66-01-PLAN.md — `src/backend/process/` leaf: clock, runner (run/spawnLongLived/runSync/openDetached, tracked + teardown registries), AppContext; depcruise runner-is-a-leaf (wave 1)
- [x] 66-02-PLAN.md — `meta/backendDiCeilings.cjs` AST census + sharded shrink-only baselines (module state, child_process, jest.mock), sanctioned/Rust-overlap table, CI/pre-push wiring (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 66-03-PLAN.md — test fakes (scripted runner, real runner on fake HOME, fake clock, capture log), createTestContext, `process/README.md` (wave 2)
- [x] 66-04-PLAN.md — harness `bootFresh()` + the 15 boot-wiring tests onto one boot per case (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 66-05-PLAN.md — guard suites (sidecarRejectionGuard, testContainment) onto bootFresh, one file per task (wave 3)
- [x] 66-06-PLAN.md — flows tests group 2 (humble, gameDetails, logger, shellFiles, skeleton, downloadQueue, enrichment) onto bootFresh (wave 3)
- [x] 66-07-PLAN.md — flows tests group 3 (install, steamAuth, storeEmbed, humbleLogin, runnerAuth, settings, steam) onto bootFresh (wave 3)
- [x] 66-09-PLAN.md — appShellFlows + 5 smaller flows tests onto bootFresh (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 66-08-PLAN.md — `bootstrap.ts` as one ordered step list on AppContext, once-guards + i18nReady deleted, second boot throws, harness on createTestContext (wave 4)

**Cross-cutting constraints:**

- D-08 (test side): none of these seven files calls init( or startSidecar(; each test case boots at most once through bootFresh() in a fresh module registry
- Every behavioural assertion survives; mocks the tests configure or inspect are obtained with require() after bootFresh(), not via stale top-level imports

### Phase 66.1: Backend DI — stores, store managers, flow registrations and launcher (INSERTED)

**Goal:** D-15 step 2 of Phase 66 (decisions in `66-CONTEXT.md`). Nothing is constructed at import time. A stores factory replaces the 16 `*/stores.ts` modules and `key_value_stores.ts`. `createStoreManagers` builds the library and game manager classes (gog, legendary, nile, steam, sideload) with constructor deps at boot (D-02), and the 46 non-test consumers of `libraryManagerMap`/`gameManagerMap`/`storeLaunchHooks` receive them. The 25 `sidecar/*FlowRegistration.ts` files take narrow slices (D-01). In `launcher.ts`, `callRunner`, `runWineCommand`, the gamescope probe and script spawns become runner callers, pinned by characterization tests first. `utils.ts` `spawnAsync` becomes a thin runner caller and `handleExit` calls the runner's teardown. `trackedChildren.ts` and `longLivedChildren.ts` are deleted, with comet and the bridge `helperSpawn` moving to `spawnLongLived` (D-10, D-11). Ceilings drop in the same commits (D-16). About 16–18 plans.
**Requirements**: TBD
**Depends on:** Phase 66
**Plans:** 37/37 plans complete

Plans:

**Wave 1**

- [x] 66.1-01-PLAN.md — runner C-02 fixes (WR-01 drain grace, WR-02 pin, WR-03 killPid/maxBuffer), timeout opt-out, ChildHandle exit state, scripted-runner capabilities
- [x] 66.1-02-PLAN.md — launcher Layer-1 characterization + pure buildGameScopeCommand
- [x] 66.1-03-PLAN.md — 'register-handlers' boot step, C-03 (ctx.paths.userData), C-04 (late-log leak)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 66.1-04-PLAN.md — BootServices expand: identity facades, 'stores'/'command-runner'/'store-managers' steps, test services, conversion rules R1-R8

**Wave 3**

- [x] 66.1-05-PLAN.md — createCommandRunner on the runner (callRunner/runWineCommand/getWinePath/runScriptForGame) + mock-free Layer-2 suite

**Wave 4**

- [x] 66.1-06-PLAN.md — createSpawnAsync + createQuitHandler on the runner

**Wave 5**

- [x] 66.1-07-PLAN.md — registrations group A onto slices (wineTools, shortcuts, enrichment, engine, eosOverlay, humble, downloadQueue, runnerAuth)
- [x] 66.1-08-PLAN.md — manager constructor deps (all five) + GOG tree

**Wave 6**

- [x] 66.1-09-PLAN.md — Legendary tree
- [x] 66.1-10-PLAN.md — Steam core (library manager, game, library/* readers, launch/auth/install entry modules)
- [x] 66.1-12-PLAN.md — tools, utils helpers, shortcuts
- [x] 66.1-13-PLAN.md — sign-in probe, dev secret vault, gamesdb, crossoverRatingMap, macArch recovery
- [x] 66.1-14-PLAN.md — engine helpers + known-fix modules

**Wave 7**

- [x] 66.1-11-PLAN.md — download queue as a boot service + dispatch/protocol/save_sync/launchSingleFlight
- [x] 66.1-16-PLAN.md — Steam stores consumers
- [x] 66.1-19-PLAN.md — kvs/wine/cache store reads in config.ts, utils.ts and small modules

**Wave 8**

- [x] 66.1-15-PLAN.md — nile, sideload, storeManagerCommon
- [x] 66.1-17-PLAN.md — Steam bottle family
- [x] 66.1-20-PLAN.md — domain store consumers (humble, logger, migration, runsForMe, wine, overrides, crossover, wiki)

**Wave 9**

- [x] 66.1-18-PLAN.md — Steam bridge launch path + bridge store readers
- [x] 66.1-21-PLAN.md — registrations group B (appShell, runnerMisc, settings, installedJsonWatcher)

**Wave 10**

- [x] 66.1-22-PLAN.md — Steam registrations + MH-3 registration gate

**Wave 11**

- [x] 66.1-22b-PLAN.md — cleanup: runnerAuth/eosOverlay on slices, storeManagers entry imports dropped, clearCache legendary cleanup injected (MH-3 single exemption)
- [x] 66.1-22c-PLAN.md — cleanup: GOG presence + discounts take GOGUserDeps; dead utils handleExit deleted (getGame moves to plan 23); local libraryManagerMap names renamed
- [x] 66.1-22d-PLAN.md — cleanup: EngineServices injected into the engine bottle-creation path (ensureGameBottle, toolSettings, selectEngineForLaunch); ToolsDeps.spawnAsync
- [x] 66.1-22d2-PLAN.md — cleanup: steam bottle suites on injected installRemove; removable legacyFacades mocks and storeManagers.steam ceiling lowered
- [x] 66.1-22e-PLAN.md — cleanup: CrossOver wineserver kill + game-process watch on injected spawnAsync
- [x] 66.1-22f-PLAN.md — cleanup: engine switch + bridge known fixes on injected services; legacySpawnAsync.ts and legacyTools deleted
- [x] 66.1-22g-PLAN.md — cleanup: systeminfo version probes take managers; bindBottleStores bound at 'stores', fallback deleted; test:ci baseline
- [x] 66.1-22h-PLAN.md — cleanup: knownFixReport, macSteamAdoption and steamRestartHold take injected steam stores; their call-time stores requires deleted
- [x] 66.1-22i-PLAN.md — cleanup: engineDecision wineManagerReleases reads an injected wineManager store, threaded through EngineServices/ToolsDeps; last call-time stores require deleted
- [x] 66.1-23-PLAN.md — construction flip: createStoreManagers + createLauncher at boot; libraryManagerMap/storeLaunchHooks deleted

**Wave 12**

- [x] 66.1-24-PLAN.md — launcher legacy spawns deleted, gamescope probe on the runner, shared callback types retyped

**Wave 13**

- [x] 66.1-25-PLAN.md — stores contract: 16 store factories, per-boot registry, moduleState -49

**Wave 14**

- [x] 66.1-26-PLAN.md — comet + bridge helper on spawnLongLived, killTracked on the runner

**Wave 15**

- [x] 66.1-27-PLAN.md — delete trackedChildren/longLivedChildren + legacy utils wrappers; end-state gates; README hand-off

**Wave 16**

- [x] 66.1-28-PLAN.md — operator live check on macOS (non-autonomous)

**Cross-cutting constraints:**

- Plans execute sequentially on main in wave-then-number order; consumer files convert once onto slices, owners flip behind facades (A3)
- Every removed mock or site lowers its ceiling shard in the same commit (D-16); no new test file calls jest.mock, never jest.doMock

### Phase 66.2: Every backend spawn through the process runner, then the `child_process` ban (INSERTED)

**Goal:** Every remaining `child_process` file in `src/backend` (about 27 after 66.1) moves onto the runner. Each file is converted completely in one plan, module state included, so no module is touched twice (D-15). The work covers:

- The engine per-child caps (`engine/runTool.ts`, `demoStatus.ts`, `bottlePrimitives.ts`) become `run` timeouts. `LAUNCH_DEADLINE_MS` stays a pipeline deadline owned by the clock (RESEARCH A1, confirmed 2026-11-09).
- The DRM spawners and `boundedListing`.
- The Steam spawn sites, including `macSteamOffline`, which absorbs the second `openDetached`.
- The bridge spawners.
- The 10 shell-string calls become argv (`compatibility_layers` keeps the three-word `mdfind` split; `tools/index` `which`), and the `execAsync` export is removed.
- Sync sites become async or go through a named `runSync` with a stated reason (D-09).
- `os/*` and `windowsShortcut`.

The last plan merges `no-restricted-imports` for `child_process` into the existing ESLint `paths` array at `error` and deletes that ceiling (D-13, D-16). About 9–10 plans.
**Requirements**: TBD
**Depends on:** Phase 66.1
**Plans:** 12/12 plans complete

Plans:

- [x] 66.2-01-PLAN.md — gate hardening (C-05: WR-04 table, WR-05/06, IN-02/03), jestMock rebaseline, shard split by owner, Wave-0 probes A3/A6/A7 (wave 1)
- [x] 66.2-02-PLAN.md — runner/clock plumbing into the deps slices and flow registrations, no behaviour change (wave 1)
- [x] 66.2-03-PLAN.md — engine runTool + demoStatus on run; caps as run timeouts; RunTool from callers (wave 2)
- [x] 66.2-04-PLAN.md — shims: nativeImage runSync + openExternal via bindTransport, knownFolders async, windowsShortcut (wave 2)
- [x] 66.2-05-PLAN.md — leaf utils: os/path PATH scan, os/processes + comet (C-04), macArch async (wave 2)
- [x] 66.2-06-PLAN.md — Steam probes + download monitor (spawnLongLived) + running poll, boot-built steamProcesses (wave 3)
- [x] 66.2-07-PLAN.md — wine discovery: compatibility_layers argv, config.ts spawn-free defaults (D-66.2-01), du (wave 3)
- [x] 66.2-08-PLAN.md — tools/index (winetricks, which, wine --version) + vulkan (wave 3)
- [x] 66.2-09-PLAN.md — Mac Steam client: createMacSteamOffline instance, adoption probes, both openDetached absorbed (wave 4)
- [x] 66.2-10-PLAN.md — DRM spawners + boundedListing, single-flight instance (wave 5)
- [x] 66.2-11-PLAN.md — utils.ts: execAsync and legacy spawnAsync deleted, moveOn*/tar/wineserver/VC redist/Rosetta (wave 5)
- [x] 66.2-12-PLAN.md — the ban: ESLint paths at error + depcruise rule + census gate, childProcess ceiling deleted (wave 6)

### Phase 66.3: Backend module state to zero, then the live macOS smoke (INSERTED)

**Goal:** D-15 step 3. The D-06 module-state count reaches zero outside the sanctioned list (runner, logger sink, boot entry), and the census becomes a test (D-13, D-16). It goes in this order:

1. The D-05 process-wide owners, largest ripple first: `online_monitor`, `platform/index`, `anonymousClient`, `processGuards` (read its WR-04 header), `engineState`, `gameSessionState`/`userSignInState`/`authTrigger`/`steam/state`, `shimCoverage`, `winetricksQueue`, `signInProbe/*`, `humble/*`. Also the boot-bound static holders the census started counting in 66.1 (C-WR-2): `SteamUser` static fields (`bindStores`), `bindBottleStores`, `bindHumbleStores`, `bindDxmtStores`, `bindSteamGridDbSecretDeps`, plus the static fields in humble user, config and game_config; and the `registerHumbleFlows`/`registerHumbleLoginFlows` MH-3 allowlist entries.
2. The long tail of about 70 files with 1–2 sites each.

The D-14 Rust-overlap exemption table stays empty unless Phase 75 is re-scoped. The phase ends with the D-17 live macOS smoke as a non-autonomous last plan. About 15–18 plans, and it can split again into steam/* and the rest if needed.

**Split 2026-11-11 (D-66.3-04):** 66.3 keeps the platform shim dissolution, config injection, the D-05 process-wide owners and the C-WR-2 static holders (item 1 above), and ends with every site it owns at zero and the `moduleState` ceilings lowered. Item 2 (the long tail), the census-to-test flip and the D-17 live smoke move to Phase 66.4.
**Requirements**: TBD
**Depends on:** Phase 66.2
**Plans:** 18/18 plans complete

Plans:

- [x] 66.3-01-PLAN.md — Wave 0 gates: census fixtures (D-66.3-09), container-call residual pin, diPhaseGates 66.3 skeleton, jest baseline (wave 1)
- [x] 66.3-02-PLAN.md — processGuards as an entry-built zero-import factory, init({ guards }) (D-66.3-10) (wave 2)
- [x] 66.3-03-PLAN.md — host services (ipc registry, openExternal, dialogs, notifications, appState, appInfo), 'host-services' boot step, interim shim delegate 8 -> 1 (wave 3)
- [x] 66.3-04-PLAN.md — config injection: 'config' boot step, GameConfigs registry seam, AppContext paths/appInfo, ManagerDeps slices (wave 4)
- [x] 66.3-05-PLAN.md — cascade A: utils, root helpers and leaf modules off the shim and static config (wave 5)
- [x] 66.3-06-PLAN.md — cascade B: config-free logger, launcher, commandRunner, engine/appshell/shortcuts helpers (wave 6)
- [x] 66.3-07-PLAN.md — cascade C: GOG/Legendary/Nile/Sideload managers and storeManagerCommon (wave 7)
- [x] 66.3-08-PLAN.md — cascade D: stateless Steam manager modules, macSteamOffline openExternal (wave 8)
- [x] 66.3-09-PLAN.md — cascade E1: handlers.ts and registrations a-h on the injected registry, channel parity (wave 9)
- [x] 66.3-10-PLAN.md — cascade E2: registrations i-w, main_window.ts deleted (wave 10)
- [x] 66.3-11-PLAN.md — online_monitor as a boot-owned instance on the clock (wave 11)
- [x] 66.3-12-PLAN.md — engineState and winetricksQueue owners (wave 12)
- [x] 66.3-13-PLAN.md — Steam session cluster and sign-in probe owners (wave 13)
- [x] 66.3-14-PLAN.md — anonymous CM client, bridge helper registry, frozen shim-coverage tables (wave 14)
- [x] 66.3-15-PLAN.md — bindBottleStores and bindDxmtStores holders deleted (wave 15)
- [x] 66.3-16-PLAN.md — SteamUser static class to one boot instance, bindStores deleted (wave 16)
- [x] 66.3-17-PLAN.md — Humble owners, SteamGridDB secret holder, MH-3 rows deleted (wave 17)
- [x] 66.3-18-PLAN.md — end state: platform/ deleted, config statics deleted, diPhaseGates 66.3 block, README hand-off to 66.4 (wave 18)

### Phase 66.4: Backend module state long tail, the census-to-test flip, then the live smokes (INSERTED)

**Goal:** Finish D-15 step 3 after Phase 66.3. Convert the long tail of about 85 files (about 127 sites) with 1–2 module-state sites each, completely and once each (D-15). This includes the 66.2 deferrals: the `utils.ts` `default*Path` lets; `installingComponent`/`catalogCache`/`scriptMetadataCache` in `tools/index.ts`; `engineNoticeStore`; the two `pci_ids` stores; and retiring the win32 sync fallbacks in `knownFolders`/`pathShim`. Then the census becomes a zero-tolerance test and the `moduleState` ceiling is deleted (D-13, D-16). Next, revive the Steam RunningAppID poller under Tauri as a boot-owned, unref'd, stdin-EOF-stopped step (D-66.3-07). The phase ends with two non-autonomous plans: the D-17 live macOS smoke with a scripted orphan/exit checker (D-66.3-05), and the Windows operator UAT, which covers the 66.2 spawn paths and the poller's Playing state (D-66.3-06, D-66.3-08). Decisions live in `.planning/phases/66.3-backend-module-state-to-zero-and-live-macos-smoke/66.3-CONTEXT.md`.
**Requirements**: ARCH-01 (milestone-level; phase IDs minted by `/gsd-plan-phase`)
**Depends on:** Phase 66.3
**Plans:** 22/23 plans executed

Plans:

- [x] 66.4-01-PLAN.md — Wave 0: 66.4 jest/prettier/census-clean checkers, baseline, installFlows jestMock back under its ceiling, listModuleStateSites (wave 1)
- [x] 66.4-02-PLAN.md — sidecarExitCheck orphan/exit checker (live + eof modes) and `pnpm smoke:exit-check` (wave 1)
- [x] 66.4-03-PLAN.md — AppPaths carries every derived path: pure derivePaths in process/appPaths.ts, parity pin (wave 2)
- [x] 66.4-04-PLAN.md — per-boot StoreRoot: stores off pathShim; storeChangeNotifier, fileStore, engineNoticeStore, pci_ids (wave 3)
- [x] 66.4-05-PLAN.md — engine long tail into EngineRuntime; engine paths on ctx.paths (wave 4)
- [x] 66.4-06-PLAN.md — Steam launch-path state into SteamLaunchRuntime; launch paths on ctx.paths (wave 5)
- [x] 66.4-07-PLAN.md — Steam token-store slot, frozen error constants, session-side paths (wave 6)
- [x] 66.4-08-PLAN.md — Steam bridge into BridgeRuntime; steam/constants off pathShim (wave 7)
- [x] 66.4-09-PLAN.md — Steam depot and install/uninstall poll state into SteamInstallRuntime (wave 8)
- [x] 66.4-10-PLAN.md — GOG into GogRuntime; deriveGogPaths (wave 9)
- [x] 66.4-11-PLAN.md — Legendary and Nile runtimes; derive*Paths (wave 10)
- [x] 66.4-12-PLAN.md — utils.ts default*Path lets, system-info and HLTB caches; utils paths (wave 11)
- [x] 66.4-13-PLAN.md — abort registry and Wine window raiser as boot-owned instances (wave 12)
- [x] 66.4-14-PLAN.md — tools/index caches and winetricks environment into ToolsState; tools/wine paths (wave 13)
- [x] 66.4-15-PLAN.md — dispatch core: sidecarRpc, ipcValidation, outbound HTTP tracker as instances (wave 14)
- [x] 66.4-16-PLAN.md — app-shell timers/blockers, installed.json watcher, embed seam; flow paths (wave 15)
- [x] 66.4-17-PLAN.md — AppRuntime: backend events, launch single-flight, image/index caches, known-fix installs; launcher paths (wave 16)
- [x] 66.4-18-PLAN.md — store versioning/read-only onto StoreRoot, dialog and misc owners; config/shortcuts paths (wave 17)
- [x] 66.4-19-PLAN.md — the five once-only latches converted (D-66.4-01: boot-step single-run per boot registry) (wave 18)
- [x] 66.4-20-PLAN.md — 'app-folder' first boot step (heroic rename, e2e dir); constants/paths.ts and pathShim.ts deleted (wave 19)
- [x] 66.4-21-PLAN.md — census flip: zero-tolerance test, moduleState ceiling deleted, diPhaseGates 66.4 block, README (wave 20)
- [x] 66.4-22-PLAN.md — D-17 live macOS smoke with the exit checker (non-autonomous) (wave 21)
- [ ] 66.4-23-PLAN.md — Windows delta UAT; close the poller todo (non-autonomous) (wave 21)

### Phase 67: Schema validation at the sidecar IPC boundary

**Goal:** Every channel the sidecar serves checks its arguments against a schema before the handler runs, so a malformed or hostile call from the renderer is rejected at the boundary instead of reaching store, file or process code. The renderer hosts embedded store pages and login webviews, so it is a trust boundary. Measured 2026-11-06: 4 of the 23 `src/backend/sidecar/*Registration.ts` files validate arguments (`runnerMiscFlowRegistration`, `runnerAuthFlowRegistration`, `shellFilesFlowRegistration`, `wineToolsFlowRegistration`), across ~282 channels. Three parts: (1) **The pattern.** One schema per channel, co-located with the per-domain channel types Phase 62 splits out of `common/types/ipc.ts`, checked once in the shared `ipcMain.handle`/`ipcMain.on` registration path rather than in each handler; a rejected call is logged and returns a typed error, never throws into the transport. Schema-inferred argument types should replace the hand-written ones so the two cannot drift. (2) **Coverage.** Convert channels domain by domain, starting with those that touch files, processes, credentials or URLs, and track the unvalidated count with a shrink-only ratchet that ends at zero and becomes a test asserting every registered channel has a schema. (3) **One contract for both sides.** The channel schemas become the single source for the TypeScript channel types and the Rust-side channel names, argument types and dispatch arms that `src-tauri/src/sidecar.rs` and `store_embed.rs` mirror by hand today, generated by a `pnpm` script and checked in CI so the generated files can't go stale. Once the generated code covers a mirror, it replaces Phase 62's marker-based transport parity test for that mirror (62-04). Open questions for discuss-phase: zod (already used in 15 files) versus a lighter validator, given the sidecar's SEA bundle size; whether push relays and `rustInvoke` dialog channels are in scope; and the schema format, since part (3) must turn it into Rust types. Came from the second architecture review on 2026-11-06.
**Requirements**: TBD
**Depends on:** Phase 62
**Plans:** 20/20 plans complete

Plans:

**Wave 1**

- [x] 67-01-PLAN.md — zod 4 bump (>=4.6.6) and port of the 15 existing zod files

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 67-02-PLAN.md — boundary validator in sidecarRpc dispatch, typed IPC_INVALID_ARGS, dual-form census parser, shrink-only coverage ceiling, first sidecar smoke
- [x] 67-03-PLAN.md — TS-to-Rust contract generator, generated transport consts and channel enum, staleness gate in CI and pre-commit

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 67-04-PLAN.md — preload IpcValidationError, boot-error classification, renderer zod guard (direct and transitive)
- [x] 67-05-PLAN.md — convert shellFiles, dialog, clipboard; conversion recipe; SEA build and sidecar smoke
- [x] 67-06-PLAN.md — 44 rustInvoke schemas, typed requestRustInvoke, generated Rust arg structs

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 67-07-PLAN.md — convert install and wineTools
- [x] 67-08-PLAN.md — migrate 26 dispatch arms to generated structs

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 67-09-PLAN.md — convert runnerAuth, oauthLogin, humbleLogin, storeEmbed
- [x] 67-10-PLAN.md — generator x-field-errors extension; migrate the 10 store-embed arms

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 67-11-PLAN.md — migrate the 8 humble-login arms, exhaustive enum dispatch, retire transportParity
- [x] 67-12-PLAN.md — convert steamAuth

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 67-13-PLAN.md — convert settings and gameDetails (D-07 passthroughs)

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 67-14-PLAN.md — convert eosOverlay, shortcuts, runnerMisc, engine

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 67-15-PLAN.md — convert logger and humble

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 67-16-PLAN.md — convert enrichment, downloadQueue, steam, legendary, gog

**Wave 11** *(blocked on Wave 10 completion)*

- [x] 67-17-PLAN.md — convert appShell

**Wave 12** *(blocked on Wave 11 completion)*

- [x] 67-18-PLAN.md — sidecarInternal, mainProcess, window, testStubs; zero-exemption test; fail-closed validator

**Wave 13** *(blocked on Wave 12 completion)*

- [x] 67-19-PLAN.md — generated renderer allow-list enforced in the Rust relay

**Wave 14** *(blocked on Wave 13 completion)*

- [x] 67-20-PLAN.md — phase gate and operator live check

**Cross-cutting constraints:**

- Types derived with z.input; hand-written argument types deleted; ceilings lowered in the same commit (D-04, D-20)

### Phase 68: Versioned persisted stores and migrations

**Goal:** Every persisted store has a schema version, and a change to its shape ships with an ordered migration, so an upgrade never silently resets a user's settings, library cache or Steam state to defaults. The 19 store modules (`*/electronStores.ts`, `constants/key_value_stores.ts`, the `TypeCheckedStoreBackend`, `GameLibStore`, `CacheStore` and sidecar `FileStore` classes) have no version field today. GameLib already has a migration runner inherited from Heroic: `src/backend/migration/` applies named one-off migrations in order and records them in `migrationsStore`, and holds one (`LegendaryGlobalConfigFolderMigration`). Settings also carry ad hoc fix-ups in `config.ts` (`migrateTrayIconVariant`, `migrateFocusRowSelection`). Build on that runner rather than replace it. Scope: a version per store; migrations keyed by store and version that run before first read; the existing `config.ts` fix-ups folded in; a backup of the pre-migration file and a logged, non-destructive fallback when a migration fails; and a test per migration from a fixture of the old shape. Phase 61 (existing per-game `wineVersion` choices moving into the Engine control) and Phase 64 (custom themes as token data) are the first known shape changes and should use this if it lands first. Open questions for discuss-phase: whether caches that can be refetched (store metadata, artwork, the CrossOver index) are simply discarded on a version mismatch instead of migrated; how a downgrade behaves when it meets a newer version; and the order relative to Phase 61. Came from the second architecture review on 2026-11-06.
**Requirements**: TBD
**Depends on:** None
**Plans:** 11/11 plans complete

Plans:

**Wave 1**

- [x] 68-01-PLAN.md — Type contracts, A6 accessor-override proof on GameLibStore, private atomic write + D-08 backups
- [x] 68-08-PLAN.md — D-12 inventory of other persisted files / localStorage keys + triage todos

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 68-02-PLAN.md — Versioning engine + registry wired into GameLibStore (migrate before first read, D-03 read-only, D-06 failure, D-13 file modes)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 68-03-PLAN.md — Declare cache/user-state kind at all 51 store constructions + D-01 ratchet (D-02, D-14)
- [x] 68-05-PLAN.md — config.ts / game_config.ts onto the engine; tray + focusRow fix-ups as settings/global v0->v1 (D-10, D-11)
- [x] 68-06-PLAN.md — Read-only aggregate, area mapping, once-per-launch `readOnlyStoresNotice` push + IPC gates

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 68-04-PLAN.md — Read-only early returns in store classes and applyStoreWrite; hide `__internal__` everywhere
- [x] 68-07-PLAN.md — Renderer ReadOnlyStoresNotice toast (manual dismiss, D-15) + i18n

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 68-09-PLAN.md — Full gate battery, profile snapshot, smoke, live `pnpm tauri:dev` check (checkpoint)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 68-10-PLAN.md — Live D-03 proof, restore + delete snapshot, validation sign-off

**Gap closure** *(from 68-VERIFICATION.md)*

- [x] 68-11-PLAN.md — CR-01: atomicWritePrivate never truncates the live file on a temp-write failure; rename-only fallback + ENOSPC tests (D-06)

### Phase 69: Consolidate frontend state onto GlobalStateV2

**Goal:** The frontend has one state system. The 2,259-line `GlobalState.tsx` class component (`extends PureComponent`, 78 `setState` calls), served through `ContextProvider`, is retired in favour of the zustand store in `src/frontend/state/GlobalStateV2.ts` (164 lines today), so a change in one domain no longer re-renders every context consumer. Measured 2026-11-06, excluding tests: 130 frontend files use `ContextProvider` and 20 use `GlobalStateV2`. Three parts: (1) **Slices.** Move state into V2 one domain at a time (library and game list, downloads and install queue, Steam / Epic / GOG / Amazon / Humble auth, settings and theme, UI and dialog state), each with selector hooks (`useShallow`) so components subscribe to what they read. (2) **Ratchet.** Track the remaining `ContextProvider` consumers with a shrink-only count like Phase 62's, ending at zero, then delete `GlobalState.tsx` and the context. (3) **Live checks.** State moves surface as stale-UI and re-render bugs that type checks and unit tests miss, so each wave ends with a smoke check in `pnpm tauri:dev` (Library, Game page, Downloads, sign-in and sign-out per store, ConsoleMode). Measure Library re-render cost on a large library before and after. No behaviour change: anything else found becomes a todo. Open questions for discuss-phase: whether V2 as it stands is the target or needs restructuring first (it already imports `frontend/helpers/electronStores`); where persisted frontend state lives relative to Phase 68's versioned stores; and the order relative to Phase 64, which adds custom-theme state. Depends on Phase 62 because plans 62-17 to 62-19 convert runner checks in the same Library, Game, ConsoleMode and DownloadManager files. Came from the post-Phase-62 architecture review on 2026-11-06.
**Requirements**: ARCH-02 (milestone-level; phase IDs minted by `/gsd-plan-phase`)
**Depends on:** Phase 62
**Plans:** 25/26 plans executed

Plans:

**Wave 1**

- [x] 69-01-PLAN.md — Store kit (subscribeWithSelector hooks, reset registry), node-env store-hook test helper, once-guarded boot module wired into index.tsx
- [x] 69-03-PLAN.md — D-14 re-render harness: route decision, package legitimacy checkpoint, jsdom Profiler scenario

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 69-02-PLAN.md — D-12 ContextProvider-import ratchet (AST, area shards, CI/pre-push wiring) + frontend jestMock re-shard
- [x] 69-04-PLAN.md — D-14 baseline captured before any slice moves

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 69-05-PLAN.md — GlobalStateV2 renamed to uiState on the store kit; importers repointed

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 69-06-PLAN.md — UI/dialog slice moved behind the bridge; listeners at boot

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 69-07-PLAN.md — Convert 35 Settings components to uiState
- [x] 69-08-PLAN.md — Convert UI-only screen consumers (sections, WineManager, Game, Console, Login Runner)
- [x] 69-09-PLAN.md — Convert shared UI components, DialogHandler and hooks to uiState
- [x] 69-10-PLAN.md — Settings/theme slice into settingsState (D-08 subscriptions, zoom/focusRow boot)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 69-11-PLAN.md — Convert settings-slice consumers incl. App.tsx
- [x] 69-12-PLAN.md — Downloads store + D-15 downloads-history fix (diagnose, then fix)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 69-13-PLAN.md — Auth state (identities, Humble, sign-in notices) into authState

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 69-14-PLAN.md — Auth login/logout actions into authState; libraryState skeleton with bridge slots

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 69-15-PLAN.md — Convert auth-only consumers
- [x] 69-16-PLAN.md — Library collections + per-game display data into libraryState

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 69-17-PLAN.md — Library arrays, loaders, game push and refresh() into libraryState

**Wave 11** *(blocked on Wave 10 completion)*

- [x] 69-18-PLAN.md — refreshLibrary and Steam sync state into libraryState; slots retired

**Wave 12** *(blocked on Wave 11 completion)*

- [x] 69-19-PLAN.md — libraryStatus/handleGameStatus + sleep-assertion subscriber; composite hooks; GlobalState becomes a pure bridge

**Wave 13** *(blocked on Wave 12 completion)*

- [x] 69-20-PLAN.md — Convert Library screen consumers
- [x] 69-21-PLAN.md — Convert install/game/downloads/console consumers and hasStatus
- [x] 69-22-PLAN.md — Convert remaining shared UI and NavShell consumers
- [x] 69-23-PLAN.md — Convert Settings remainder, Login, WebView, Humble, StoreSearch, Discounts

**Wave 14** *(blocked on Wave 13 completion)*

- [x] 69-24-PLAN.md — Delete GlobalState, ContextProvider, bridge and ratchet; runPostMountBoot via BootSequence; harness seam

**Wave 15** *(blocked on Wave 14 completion)*

- [x] 69-25-PLAN.md — D-14 final measurement and comparison

**Wave 16** *(blocked on Wave 15 completion)*

- [ ] 69-26-PLAN.md — D-16 blocking live gate (69-UAT.md, frameless ON/OFF); close D-15 todo

### Phase 70: Split GameInfo into shared and per-store shapes

**Goal:** `GameInfo` carries only what every store shares, and store-specific data lives in per-store shapes, so shared code stops depending on Steam, GOG or Epic fields. Measured 2026-11-06: the `GameInfo` interface in `src/common/types.ts` (1,336 lines) declares 41 top-level fields; 119 non-test files under `src/` reference it, 71 of them in the frontend. Store-specific fields sit beside shared ones, e.g. `gog_save_location`, `steamPlatformsCaptured`, the Steam Windows-depot and delisted signals and the Steam-only Metacritic score. Three parts: (1) **The split.** A shared core plus a per-store extension keyed by `runner`, as a discriminated union or a typed `storeData` field (discuss-phase decides), with a narrowing helper so a caller that needs Steam fields says so once. Phase 62's capability flags stay on the shared core. (2) **Migration.** Convert readers by area with a shrink-only count of direct store-field reads outside `storeManagers/` and store-specific UI, like Phase 62's ratchets. (3) **`common/types.ts`.** Move other store-specific types next to their store and leave `common/types.ts` with genuinely shared types. Persisted library caches that hold `GameInfo` shapes change shape, so the move goes through Phase 68's versioned migrations if it has landed, or a cache discard on version change otherwise. Open questions for discuss-phase: union versus `storeData`; whether the IPC payloads that carry `GameInfo` change shape at the same time as Phase 67's schemas; and the order relative to Phase 69, which rewrites many of the same frontend readers. Came from the post-Phase-62 architecture review on 2026-11-06.
**Requirements**: ARCH-03 (milestone-level; phase IDs minted by `/gsd-plan-phase`)
**Depends on:** Phase 62
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 70 to break down)

### Phase 71: Rust shell module decomposition

**Goal:** The Rust shell has no multi-thousand-line modules: each window, embed and login surface is split along its seams, following the sibling-module layout quick task 261106-ab1 set when it split `main.rs` (20,324 → 7,886 lines, 11 modules plus `wake_lock/`). Targets, measured 2026-11-06: `store_embed.rs` (4,623 lines), `login_window.rs` (3,339), `macos_epic_embed.rs` (2,089), and what remains in `main.rs` (7,886). Method: a cluster map of each file first; mechanical moves with no behaviour change (anything else found becomes a todo); `pub(crate)` only where a move needs it; `cargo test` (442 tests) green after each move, and Windows and Linux compiles checked through CI because Linux-gated code isn't compiled on the Mac. These modules drive the embedded store pages, login windows and cookie reads on macOS, so each wave ends with a live check in `pnpm tauri:dev`: an embedded store page, a sign-in for each store that uses the login window, and the Epic embed, with the frameless title bar both off and on. Phase 62's transport-mirror marker comments in `sidecar.rs` and the `store_embed.rs` dispatch arms (62-04) must survive the moves, or be removed only once Phase 67's generated contract replaces them. Open questions for discuss-phase: the minimum module set per file, and whether shell source-text tests that read Rust files (`testUtils/tauriShellSource.ts`) need the same combined-source treatment 261106-ab1 gave `main.rs`. Came from the post-Phase-62 architecture review on 2026-11-06.
**Requirements**: TBD (plans cite CONTEXT decisions D-01..D-15; D-01 satisfied by Phase 67, D-02 superseded by 72-01)
**Depends on:** None
**Plans:** 20/20 plans complete

Plans (strictly sequential; D-14 waves 0-5, each wave from 1 ends with three-leg CI and a live check):

**D-14 Wave 0 — proof tooling and production-source readers (no live check)**

- [x] 71-01-PLAN.md — Promote and extend moveproof/sizes/baseline/permove/jestpins tools; wave-0 baseline; confirm D-01/D-02
- [x] 71-02-PLAN.md — Jest D-10/D-11: readTauriShellProductionSource, readHandlerBody, prefix-aware exclusion, slicer migration, no-slicer guard
- [x] 71-03-PLAN.md — Rust D-10: shell_production_source(), SHELL_SOURCE users migrated, directory-aware guard; wave 0 close + CI

**D-14 Wave 1 — dispatcher to rust_dispatch.rs, handlers to domain modules**

- [x] 71-04-PLAN.md — scan/wake_lock/clipboard/keyring/dialogs/notification arms to rpc_* handlers with pin repoints
- [x] 71-05-PLAN.md — app_lifecycle.rs, tray_set_icon, login_window/invite_picker.rs, shell arms router-direct
- [x] 71-06-PLAN.md — Humble handlers into login_window/humble_{open,cookies,reveal}.rs; D-06 todos; cookie-pin fn tracker
- [x] 71-07-PLAN.md — store_embed_* handlers; thin router moved to rust_dispatch.rs (45 arms, no `_ =>`)
- [x] 71-08-PLAN.md — Wave 1 gate: compare, moveproof --require-all, three-leg CI, live check (OFF/ON)

**D-14 Wave 2 — login_window/ split**

- [x] 71-09-PLAN.md — Cross-platform children: invite_picker helpers, devtools, humble_helpers, humble_reveal support, windows_cdp
- [x] 71-10-PLAN.md — macOS children: pristine_epic, sheet, macos_cookies; parent finalized; keyring-helper todo
- [x] 71-11-PLAN.md — Wave 2 gate: compare, three-leg CI, live check (OFF/ON)

**D-14 Wave 3 — store_embed/ split**

- [x] 71-12-PLAN.md — store_embed/{state,policy,open,layout,controls}.rs; include_str! readers repointed
- [x] 71-13-PLAN.md — Wave 3 gate: compare, three-leg CI, live check (OFF/ON)

**D-14 Wave 4 — macos_epic_embed/ split**

- [x] 71-14-PLAN.md — macos_epic_embed/{surface,nav_delegate}.rs; D-11 exclusion held; readers repointed
- [x] 71-15-PLAN.md — Wave 4 gate: compare, three-leg CI, live check (OFF/ON)

**D-14 Wave 5 — main.rs test co-location**

- [x] 71-16-PLAN.md — Co-locate tests into flat modules (sidecar, clipboard, wake_lock, keyring, relay, tray, terminate_veto, single_instance)
- [x] 71-17-PLAN.md — Co-locate tests into login_window/ and store_embed/ children; main.rs keeps D-09 tests only
- [x] 71-18-PLAN.md — Wave 5 + phase gate: sizes report, fn main todo, VALIDATION sign-off, three-leg CI, final live check

**Gap closure (71-VERIFICATION WR-01, D-10)**

- [x] 71-19-PLAN.md — Fix vacuous sidecar D-01 EOF pin (production read + fn-body bound + mutation self-test); migrate raw shell-source readers to production text
- [x] 71-20-PLAN.md — Fail-closed test-module cutters in jest and Rust (WR-02, terminate_reply_tests); raw shell-reader allow-list guard

### Phase 72: Renderer trust boundary and process hardening

**Goal:** Close the concerns from the 2026-11-07 concerns map (`.planning/codebase/CONCERNS.md`) that no other phase owns, in three groups. (1) **Renderer trust boundary**: the `openExternalUrl`/`openFolder` channels route every non-http(s) value to `shell.openPath`, and the Rust `shell_open_path` arm (`store_embed.rs:2255`) opens it unchecked, so `file://`, `smb://`, `.app` bundles and executables all pass — add a scheme/path allow-list enforced in the shell, not only the sidecar; `removeFolder` (`utils.ts:1490`) deletes recursively under any renderer-supplied parent, and its 5 s timer is not `unref()`-ed (sidecar exit contract); trim `capabilities/default.json` to what the renderer uses (`shell:allow-execute`, `opener:default`, `updater:default`) and decide `withGlobalTauri`; delete the 13 dead `*/ipc_handler.ts` modules, including the `execAsync(commandParts.join(' '))` path in `tools/ipc_handler.ts`; make the Steam token store's plaintext fallback (`tokenStore.ts:198`) impossible rather than relying on `bootstrap.ts` swapping it out first. (2) **Process lifecycle**: the shell spawns the sidecar once (`main.rs:829`) and only fails pending invokes at stdout EOF (`sidecar.rs:565`) — add restart-or-surface so the user is told; the log-only `uncaughtException` handler (`processGuards.ts:259`) leaves a broken sidecar running; quit-time `pkill -f` pattern kills (`utils.ts:972`, sideload `stop()` by basename) can hit unrelated processes — kill by tracked PID/process group, building on Phase 66's process runner if it has landed; on Windows `shutdown_child` (`shell_state.rs:109`) kills only the sidecar PID, so store CLIs outlive the app — use a Job Object or equivalent (needs a Windows check). (3) **Supply chain and CI**: `pnpm audit --prod` reported 22 advisories (6 high) on 2026-11-07, including undici TLS validation (the `undici@^6: ^6.28.1` override is below the fix) and zod (which Phase 67 builds on) — bump, then add an audit step or Dependabot/Renovate to CI; add a Linux compile leg to `rust-test.yml` (31 `cfg(target_os = "linux")` sites are never compiled before a tag), ideally before Phase 71 starts **(LANDED by 72-01, 2026-11-08: cargo check and shell tests green on ubuntu-latest, run 42432244587)**. Groups are independent and can ship as separate plans. Open questions for discuss-phase: restart vs surface-and-quit for a dead sidecar, and whether the open-path allow-list lives in Rust only or both layers. Came from `/gsd-map-codebase --concerns` on 2026-11-07.
**Requirements**: TBD
**Depends on:** None
**Plans:** 12/12 plans complete

Plans:

**Wave 1**

- [x] 72-01-PLAN.md — Linux compile leg in rust-test.yml, proven on a pushed run; Phase 71 handoff notes (D-14, D-16)
- [x] 72-02-PLAN.md — Advisory bumps: undici/follow-redirects/source-map-js, react-router-dom 7, i18next-http-backend 4, dead plugin npm packages, rustls trio (D-19, D-18, D-10)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 72-03-PLAN.md — Supply-chain gates: deny.toml with reasoned zip ignores, audit.yml, security-only Dependabot (D-17, D-18)
- [x] 72-04-PLAN.md — Rust shell_open.rs: authoritative open-path/reveal policy and shared parity fixtures (D-06, D-07, D-08, D-15)
- [x] 72-05-PLAN.md — Delete the 14 dead ipc_handler.ts modules; fail-closed Steam token store (D-11, D-12)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 72-06-PLAN.md — Sidecar openPolicy.ts, strict openExternalUrl/openFolder split, openUrlOrFile removed (D-06, D-07, D-08)
- [x] 72-07-PLAN.md — Capability trim, withGlobalTauri false, opener link handler replacement, live boot check (D-10, D-19)
- [x] 72-08-PLAN.md — Fatal uncaughtException with bounded unref'd flush; unhandledRejection stays log-only (D-04)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 72-09-PLAN.md — Delete the renderer removeFolder channel; async timer-free helper (D-09)
- [x] 72-10-PLAN.md — Dead-sidecar Restart/Quit dialog with shutdown flag; live macOS check (D-01, D-02, D-03, D-05)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 72-11-PLAN.md — Tracked-children registry replacing pkill -f kills (D-13)
- [x] 72-12-PLAN.md — Windows kill-on-close Job Object; 72-UAT.md (D-20)

### Phase 73: Steam depot download pipeline in Rust

**Goal:** The Steam depot download pipeline (fetch → decrypt → decompress → write) runs in Rust, and the TypeScript pipeline and `lzma-native` are deleted. This is the second slice of the incremental Rust migration that Phase 63 started, and the reason is retiring the sidecar, **not speed or memory**. Spike 067a measured today's Node pipeline as network-bound: a Civ V install held ~18 MiB/s steady, and raising the in-flight budget from 32 to 96 chunks changed nothing. Spike 067b measured Rust decode at 5.8 vs Node's 9.3 cpu-s/GiB at the same 177 MiB/s, about 8% of one core across the whole pipeline. The 2.75 GB peak RSS was idle decode workers and was fixed in Node (`b8f015a08` slimmed the worker bundle from 14 MB to under 300 KB, `db95a4373` caps the pool at 4 when native). 067c's README names "the sidecar itself being retired" as the trigger to revisit, which is this phase. Reuse Phase 63's pattern: the code lives in the `src-tauri/` Cargo workspace; the sidecar calls it through `rustInvoke` with the TypeScript signature unchanged, and only a job description crosses the JSON-lines pipe, never chunk bytes; a parity harness runs both pipelines against the same jobs and requires byte-identical trees (SHA1 per file); a flag keeps the TypeScript path as the fallback until the Rust path is verified live; then the TypeScript path is deleted (`steam/depot/`, ~11.6k non-test lines measured 2026-11-07; the old `steam/depot.ts` became `depot/index.ts` in 62-10). Crate choices carried from 067b: `aes` + `cbc` built with `--cfg aes_armv8` (without it `aes` 0.8 falls back to software AES at 277 MiB/s), `flate2` on `zlib-rs`, `xz2` (static liblzma), `zstd`. Open questions for discuss-phase: **where the boundary sits** — `steam-user` owns CM auth, manifest request codes and depot keys in Node, so does Rust take manifest + depot key + CDN host list and own everything after, or also manifest fetch and parse; how progress, pause, cancel and per-chunk errors flow back to the UI over the pipe; whether reconcile/verify, ACF finalize and adoption (`depot/finalize.ts`, `depot/manifest.ts`) stay in TypeScript or move; how headless tools and tests reach it (Phase 63 answered this with a CLI binary); and Windows/Linux builds, including liblzma static linking that replaces the October `lzma-native` SEA packaging fixes. Came from the operator's request on 2026-11-07, after the 067 spikes.
**Requirements**: TBD
**Depends on:** Phase 63
**Plans:** 21/21 plans executed

Plans:

**Wave 1**

- [x] 73-01-PLAN.md — gamelib-depot + gamelib-depot-cli crates (legitimacy + MSRV checkpoints), lockfile pin, CI legs with static-codec linkage check, wire contracts, JobHost, cancel registry

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 73-02-PLAN.md — Steam AES (lenient PKCS7), VZ/VSZa/PK chunk containers, manifest wrapper unzip
- [x] 73-03-PLAN.md — host health, stall, in-flight limiter, Fetcher with on-demand CDN tokens via JobHost; fake CDN + fake host
- [x] 73-04-PLAN.md — modes/attributes, Mach-O +x fallback, path containment, collisions with case probe, flags census
- [x] 73-11-PLAN.md — TS D-09 error map, progress helpers moved, shell-caller token/request-code/event channels and handlers

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 73-05-PLAN.md — reconcile walk and ACF finalize (atomic, measured size, fail-closed StateFlags gate)
- [x] 73-06-PLAN.md — prost manifest parse, filename decrypt, on-disk manifest cache

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 73-07-PLAN.md — deterministic synthetic CDN fixtures covering every codec and edge case

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 73-08-PLAN.md — TS oracle over the fixtures, committed expected.json (before any deletion)
- [x] 73-09-PLAN.md — per-file writer, install job orchestration, throttled events, depot_job_run

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 73-10-PLAN.md — verify_only, select_files, shared-redist, depot_manifest_summary; Tier 1 golden Rust == TS

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 73-12-PLAN.md — depot_* rustInvoke channels, shell arms + ShellJobHost, EOF cancel, unbounded run channel, rustDepot.ts

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 73-13-PLAN.md — GAMELIB_DEPOT_PIPELINE flag, CM-only plan half, job builder, progress bridge, Rust install + shared-redist paths

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 73-14-PLAN.md — prescreen via summaries, startup resume via verify_only, original-DLL restore via select_files
- [x] 73-15-PLAN.md — CLI run/verify/summarize, fake-HOME helper, Tier 2 parity sweep with codec coverage and perf summary

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 73-16-PLAN.md — Real-corpus parity run and D-17 comparison (checkpoints)

**Wave 11** *(blocked on Wave 10 completion)*

- [x] 73-17-PLAN.md — Flip default to rust, author live-gate UAT

**Wave 12** *(blocked on Wave 11 completion)*

- [x] 73-18-PLAN.md — Live macOS UAT and three CI legs; record D-15 delete gate (checkpoints)

**Wave 13** *(blocked on Wave 12 completion)*

- [x] 73-19-PLAN.md — Remove the flag and TS branches; caller tests on the Rust stub

**Wave 14** *(blocked on Wave 13 completion)*

- [x] 73-20-PLAN.md — Delete TS pipeline modules, oracle, worker pool and dev bundle

**Wave 15** *(blocked on Wave 14 completion)*

- [x] 73-21-PLAN.md — Remove lzma-native and SEA packaging; deletion gate; pattern README

### Phase 74: Steam game updates

**Goal:** GameLib can tell when an installed Steam game has an update and can apply it. Today `SteamGame.update()` (`steam/games.ts` ~445) is a stub that returns an error, and update is one of the four actions GameLib can't start (found while building the Steam Lib Actions table, 2026-11-08). There are two cases. (1) **Steam-registered games** (Mac-native installs, whoever downloaded them): Steam updates these itself, but GameLib can't show "Update available" or start an update. (2) **Bridge games: nothing updates them, which is why this is `major`.** The bridge install writes into the bridge bottle's own `steamapps` (`gameInstallBridge.ts` ~582, `getBridgeBottleSteamappsRoot()`), which Mac Steam never reads, and no Windows Steam runs in that bottle. A bridge game stays on its install build until it is reinstalled, and multiplayer games break once the server moves on. Scope: **detection for both cases**, comparing the installed ACF `buildid` and per-depot manifest GIDs against the public branch in PICS appinfo (the anonymous client already fetches it), shown on the card and game page, checked on library refresh and before launch, and never as an unbounded boot task (sidecar exit contract). **Bridge games: GameLib updates them itself** with a delta download in the Rust depot pipeline Phase 73 builds. Diff the old manifest against the new one per depot, fetch only changed chunks, delete files that are gone, and keep user files the old manifest didn't own. Then rewrite the ACF (`buildid`, `InstalledDepots` GIDs) and redo the GID-keyed follow-ups: steam_api shim rescan and re-placement, the per-GID redist ledger (`bridge/sharedRedistInstall.ts`), and the DRM/known-fix verdicts. Refuse while the game is running, and resume through the download queue the way an install does. **Steam-registered games: ask Steam.** Spike 069 (2026-11-08) answered this: `InstallApp(appId)` on an installed app with a deferred pending update starts it at once and overrides Steam's own delay. On an up-to-date app it is a sub-second no-op. So the Update button is the same helper call 065 uses to install, with the same runtime slot check and fallback. Detection needs no PICS for these games: use `BIsAppUpToDate` / install state 6 over IPC, or the ACF's `StateFlags` 6, `TargetBuildID` ≠ `buildid` and `ScheduledAutoUpdate`. `StartValidatingApp` is there too if a Verify action is wanted. Untested: the game running and signed-out Steam. Because Steam does these updates itself, GameLib's own delta updater is for bridge games only. Spike 070 (2026-11-08) confirmed case 2 live: of 28 existing bridge installs, the 6 whose developers shipped a public build after install (Manor Lords, Core Keeper, Abiotic Factor, Planet Crafter, Hell Clock, Mining Mechs) are all still on their install build. Their ACF, manifest GID and files are unchanged, apart from GameLib's shim files and runtime caches. Those six are ready live-gate fixtures. **Depends on Phase 73** so the delta download is written once, in Rust, not in the TypeScript `steam/depot/` that 73 deletes (operator's choice, 2026-11-08). Live gate: a bridge game with a pending update shows "Update available", updates, keeps saves and user files, and still launches through the bridge; a Mac-native game shows the state and the Update button gets Steam to update it. Came from todo `2026-11-07-implement-steam-game-updates.md` (now in `todos/completed/`).
**Requirements**: STEAM-01, STEAM-02 (milestone-level; phase IDs minted by `/gsd-plan-phase`)
**Depends on:** Phase 73
**Plans:** 31/33 plans executed

Plans:

**Wave 1**

- [x] 74-01-PLAN.md — Rust chunk-level delta core (delta.rs, routing, wire: retiredDepots, stage event, Outcome.delta)
- [x] 74-04-PLAN.md — TS update detection (string GID reader, registered ACF predicate, batched bounded PICS, per-boot cache)
- [x] 74-07-PLAN.md — Bridge GID-keyed follow-ups after an update (shim handover, verdicts, redist ledger, DRM)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 74-02-PLAN.md — Rust commit journal + resume, commit-failure ACF, retired depots, D-14 file-level fallback
- [x] 74-03-PLAN.md — Rust summarize delta estimate (exact disk peak, download upper bound) + protected prune
- [x] 74-05-PLAN.md — listUpdateableGames / listAutoUpdateableGames, checkGameUpdates D-02 split, shared update queue element
- [x] 74-06-PLAN.md — TS delta wire (fromManifest/retiredDepots job, delta report, stage status text)
- [x] 74-08-PLAN.md — Steam-registered Update (InstallApp opt-in / steam://nav/games/details hand-off) + update-aware polling

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 74-09-PLAN.md — Pre-launch prompt (D-04..D-07), don't-ask-again ack store, backend catalogue strings
- [x] 74-10-PLAN.md — SteamGame.update(): bridge delta orchestration (estimate, disk check, refuse-running) + kind dispatch

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 74-11-PLAN.md — getSteamUpdateInfo IPC + plan/commit stage labels

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 74-12-PLAN.md — Game page two-size line and size-aware Update confirmation (D-09)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 74-13-PLAN.md — Live gate UAT (bridge fixtures + Mac-native registered fixture)

**Gap closure (from 74-VERIFICATION.md, must-fix + should-fix tiers)**

**Wave 1**

- [x] 74-14-PLAN.md — Launch gate: one three-button prompt (rfd YesNoCancelCustom, safe order), block Play during a running/waiting update, bounded pre-launch PICS (UAT 7, WR-05, WR-04b)
- [x] 74-15-PLAN.md — Retire only depots absent from the branch PICS list, real owner ids; committed delta wins over abort (WR-01, WR-06)
- [x] 74-16-PLAN.md — Rust: fall back only on a definitive old-manifest failure; no retired removals after a commit failure (WR-09, IN-03)
- [x] 74-17-PLAN.md — Size estimate credits old-manifest chunks and counts new depots (WR-02)
- [x] 74-18-PLAN.md — Registered-update completion clears badge and Updating promptly (WR-04, UAT 12)
- [x] 74-21-PLAN.md — Deferred findings as todos; STEAM-02 stays Pending

**Wave 2** *(blocked on 74-15, 74-17)*

- [x] 74-19-PLAN.md — Non-interactive auto-update: no guided sign-in, dialog or Keychain unlock (WR-08 auth half)

**Wave 3** *(blocked on 74-14, 74-18, 74-19)*

- [x] 74-20-PLAN.md — Translate the Phase 74 gamelib keys in 48 catalogs; register fork-touched files

**Wave 4** *(blocked on all gap-closure plans)*

- [x] 74-22-PLAN.md — Live re-run: UAT 7, UAT 12, multi-depot/DLC bridge update (human-verify)

**Gap closure round 2 (from 74-REVIEW.md re-review and 74-UAT.md items 16-18)**

**Wave 1**

- [x] 74-23-PLAN.md — Registered update: hand off when PICS says newer, target-aware poll end, safe game-page re-read (CR-01, WR-02, IN-01, IN-06)
- [x] 74-24-PLAN.md — Auto-update: per-build attempt marker, one detection per refresh, queue-aware autoUpdate, truthful unattended log (CR-02, WR-03, IN-05)
- [x] 74-25-PLAN.md — Rust/Node: transient request-code failures fail the delta instead of falling back (WR-01, IN-02 doc)
- [x] 74-26-PLAN.md — macOS three-button prompt as in-process NSAlert; Esc dismisses as Play anyway (UAT 16)
- [x] 74-28-PLAN.md — "about" estimate copy in 49 catalogs, retire owner/KeptReason, quiet branch-list pass (IN-02, IN-03, IN-04)

**Wave 2** *(blocked on 74-23, 74-25)*

- [x] 74-27-PLAN.md — depotJobEvent stage schema; hold Updating through a Steam hand-off (UAT 18, UAT 17)

**Wave 3** *(blocked on all round-2 plans)*

- [x] 74-29-PLAN.md — Live re-run: CR-01, Esc, no IPC errors, no button flash, no auto-update loop (human-verify)

**Gap closure round 3 (from 74-VERIFICATION.md round-2 re-verification and 74-UAT.md items 19-23)**

**Wave 1**

- [x] 74-30-PLAN.md — Registered hand-off waits on the PICS target when PICS says newer; bounded InstallApp retry after GameLib starts Steam (UAT 19)
- [x] 74-31-PLAN.md — Restore the cached library and local install state on every non-sync Steam refresh exit (UAT 23 signed-out, backend)

**Wave 2** *(blocked on 74-31)*

- [ ] 74-32-PLAN.md — Installed-only Steam grid when signed out, keep installed games on sign-out, mount refresh and sign-in update check; close the signed-out todo (UAT 23, frontend)

**Wave 3** *(blocked on 74-30, 74-31, 74-32)*

- [ ] 74-33-PLAN.md — Live re-run: UAT 19 completion (two variants), InstallApp retry, signed-out library and sign-in check, CR-02 unattended failure (human-verify)

### Phase 75: Steam local file formats in Rust

**Goal:** Steam's local files are read in Rust, so the ACF format has one implementation. Phase 73 moved the ACF *writer* to Rust while the TypeScript *reader* stays, which is two codecs for one format that can drift. Scope: (1) text VDF reading of `libraryfolders.vdf` and `appmanifest_*.acf`, replacing `@node-steam/vdf`; (2) binary `shortcuts.vdf` read and write, replacing `steam-shortcut-editor`; (3) the local library scan in `steam/library/` (~4.6k non-test lines across the directory, measured 2026-11-09). Reuse Phase 63's pattern unchanged: a Tauri-free crate in the `src-tauri/` Cargo workspace (or the Phase 73 crate's ACF module, extended), `rustInvoke` from the sidecar with the TypeScript signatures unchanged, a CLI binary for headless tools, a parity harness over fixtures (byte-identical round-trip for `shortcuts.vdf`), a dev-only fallback flag, then delete the TypeScript readers and both npm packages. This is the third slice of the incremental Node-to-Rust migration (63 scanners, 73 depot pipeline). Open questions for discuss-phase: whether the owned-apps fetch and metadata/artwork enrichment in `steam/library/` stay in TypeScript (they need `steam-user`/axios) so only the local scan moves; whether the shortcuts writer must preserve unknown fields byte-for-byte; and Steam path discovery on Windows and Linux. The CM-client replacement for `steam-user`/`steam-session`, which gates retiring the sidecar, is a separate spike (2026-11-09). Came from the post-73 migration planning discussion on 2026-11-09.
**Requirements**: STEAM-03 (milestone-level; phase IDs minted by `/gsd-plan-phase`)
**Depends on:** Phase 73
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 75 to break down)

### Phase 47: Migrate aggregated store search from CheapShark to IsThereAnyDeal

**Goal:** Replace the USD-only CheapShark adapter behind `/store-search` with a localised IsThereAnyDeal provider, so a non-US user sees prices in their own currency on the price-checker the way they already do on the Deals tab. This is **Stage 1** of the store-price direction: one integration buying breadth (34 shops, including the key resellers where the discounts actually are) with no GameLib-owned feed infrastructure. Retires the D-13 debt — `SEARCH_CURRENCY = 'USD'` (`src/backend/storeSearch/cheapshark.ts:29`) and `formatUsdPrice()` (`src/frontend/screens/StoreSearch/helpers.ts`, which hardcodes `$` and would render a GBP price as `$14.99 GBP`).

**Requirements**: PRICE-01, PRICE-02, PRICE-03 (phase-level IDs minted during `/gsd-plan-phase 47`). Moved into v0.10 Foundations 2026-11-12.
**Depends on:** Phase 20 (Aggregated Store Search — CheapShark), which minted the provider-neutral `common/types/storeSearch` vocabulary (D-11/D-12/D-13) this phase is the second implementation of. **Not** Phase 46 — `phase.add` fills `Depends on` with the immediately-preceding phase number as a positional guess, and Phase 46 (Windows single-instance guard) is unrelated; corrected by hand at filing time.
**Plans:** 0 plans

**Research is already complete** — `.planning/quick/260916-gdg-answer-q2-cheapshark-to-itad-migration-cost/260916-gdg-RESEARCH.md` answers `questions.md` Q2 with claims graded MEASURED / SPEC / UNKNOWN. Do not re-derive it; do preserve its grades when quoting.

**In scope:** the ITAD adapter replacing `cheapshark.ts` (search is 2 calls, not 1 — D-12's "cheapest price inline" breaks); batch Steam AppID matching for the owned badge via `POST /lookup/id/shop/61/v1` (**MEASURED** to work with no API key, so it costs nothing against the quota); `countryCode` locale plumbing from settings through IPC into the adapter; real currency formatting (touches the Currency Contract in `20-UI-SPEC.md` and `formatUsdPrice.test.ts`); a persisted cache (ITAD's terms require one; Phase 20 explicitly rejected one, and `CacheStore` registration lives in four mirrored lists); `429`/`Retry-After` handling degrading to a cached price with a visible timestamp rather than an error; `common/discounts/storeMapping` from CheapShark string IDs to ITAD numeric shop IDs (contained — exactly one production importer, verified 2026-09-24); and passing `obj.deal2.url` through **verbatim** (ITAD's terms forbid altering it, including stripping affiliate tags — comment it as contractual, not stylistic, or a later refactor will "clean up" the URL and breach the terms).

**Explicitly OUT of scope:** the `/discounts` screen — it stays GOG-only and locale-correct; an ITAD-backed deals browser is gated on a one-line written confirmation of ITAD's ambiguous 2026-10-01 reply about the "MUST NOT build a competition to IsThereAnyDeal" clause (see gate 2). Also out: **Stage 2**, a GameLib-owned affiliate-feed/mirroring service, which needs partner approvals that require traffic this project does not yet have and a server it does not yet run — years out, not a near-term option. Also out: Amazon price coverage (ITAD does not track Amazon; operator decision 2026-09-24 accepts this — Amazon is retained-because-built, not a first-class store).

**Three human gates — all closed: gate 1 DONE 2026-11-12, gate 2 ANSWERED, gate 3 DECIDED. Phase 47 is unblocked for `/gsd-plan-phase 47`.**

1. **DONE 2026-11-12** (operator registered the app) — **Register an ITAD app** at `isthereanydeal.com/apps/my/`. Self-service, needs a human account. Makes measurable the one remaining **UNKNOWN** in the research — still **UNKNOWN, not yet measured**; measure it with the app's key during planning/research (never commit the key): which countries/currencies are actually covered (a 14-country sweep of `/service/shops/v1` returned an identical 34-shop list every time, disproving that endpoint as a coverage measure).
2. **Email to `api@isthereanydeal.com` — SENT 2026-09-24; ANSWERED 2026-10-01** by Tomas Fedor (`tomas@isthereanydeal.com`), recorded here 2026-11-12. The email as sent asked **two** questions, not three:
   - Q1: "Does the 'no competition' clause rule out (b)?" — (b) being a possible in-app deals/browse surface.
   - Q2: "Does the rate limit follow the API key, or the unauthenticated account? ... If OAuth moves the budget to each user's own ITAD account ... I'd build the OAuth flow."

   The reply, verbatim:

   > 1. yes, this is fine
   > 2. rate limit follows the app, doesn't matter whether it's api key or oauth. You can see your current usage in the app section on ITAD. The solution for this might be to have your own intermediate server between ITAD and client, to help with caching.

   **Consequences.** The rate limit follows the **app** — API key vs OAuth makes no difference (an ITAD written statement — vendor statement, 2026-10-01 — not MEASURED). The 1000 req/5min figure keeps its **SPEC** grade. Current usage is visible in the app section on ITAD. **The OAuth branch is DEAD:** OAuth does not move quota to each user, so `hideOwned`/`wishlistOnly` are no longer a reason to build it. Phase 47 builds the **embedded-key + hard-caching** branch.
   - **Q1 is literally ambiguous.** "yes, this is fine" in reply to "Does the clause rule out (b)?" almost certainly means a deals browser is fine — but a literal "yes" means it _does_ rule it out. A one-line written confirmation from ITAD is owed before any deals-browser work. The deals browser stays **OUT** of Phase 47 scope regardless.
   - **Correcting the record:** this gate previously said the email also asked whether a partner arrangement on affiliate links was worth discussing. It did not — the affiliate-partnership question was never asked. It is **UNASKED and OPEN**.
3. **Decide the shared-key strategy — DECIDED 2026-11-12 (operator): no proxy now.** Build: an embedded key; a persisted per-install cache; debounced search; keyless `POST /lookup/id/shop/61/v1` for AppID mapping (**MEASURED** no-key); `429`/`Retry-After` degrading to the cached price with a visible timestamp; an optional user-supplied key setting — each user registering their own ITAD app gets their own budget, which is an **INFERENCE** from "follows the app", to be verified against ITAD's terms before building. Operating policy: monitor usage in ITAD's app dashboard; build Tomas's suggested intermediate caching server only when usage approaches the limit; request a raised limit only if needed.

Plans:

- [ ] TBD (run /gsd-plan-phase 47 to break down)

### Phase 76: Engine-correct bottle for DRM-mode launches (v0.9 audit S9)

**Goal:** A SteamStub title never launches in DRM mode over a bottle the Wine-Staging fallback engine initialised. Today `decideCreationEngine` (`steam/engine/engineDecision.ts` ~537) is presence-only and runs at install (`steam/games.ts` ~2549), before `.bind` is known; a title installed while CrossOver is missing gets a pinned Wine-Staging + DXVK bottle, and the DRM branch (`games.ts` ~5290–5301) only preflights CrossOver and never calls `prepareBottleForEngine`, so a later DRM launch runs the CrossOver clone runner over it. Fix: call `prepareBottleForEngine` in the DRM branch, or refuse the launch with a clear message. Line numbers are from the 2026-11-05 audit and predate Phases 62/65's decomposition — re-locate before planning.
**Requirements**: DEBT-01
**Depends on:** None
**Source:** `milestones/v0.9-MILESTONE-AUDIT.md` (S9, integration 8/9)
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 76 to break down)

### Phase 77: Runtime hardening from the v0.9 review debt

**Goal:** Close three review warnings the v0.9 audit ranks highest: (1) **57 WR-09** — the network-facing known-fix relay reads the request body unbounded when `Content-Length` is missing; bound it (skipped as out of scope in `57-REVIEW-FIX.md`). (2) **56 WR-02** — an `execFile` handle holds the sidecar event loop up to 3 s after stdin EOF, violating the sidecar exit contract (see `Skill("gamelib-conventions")`). (3) **60 WR-01** — a missed overlay close leaves game input blocked; release input on every overlay-close path.
**Requirements**: DEBT-02, DEBT-03, DEBT-04
**Depends on:** None
**Source:** `milestones/v0.9-MILESTONE-AUDIT.md` tech-debt list; `56-VERIFICATION.md`, `57-REVIEW-FIX.md`, `60` review
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 77 to break down)

### Phase 78: Verification records and test health after v0.9

**Goal:** The v0.9 records say what is true, and the suites the audit flagged pass. (1) **Stale records:** `52-VERIFICATION.md` body still reads `gaps_found` / 2026-10-24 under a `passed` frontmatter; the 53 and 58 verification/UAT records list follow-ups (58 WR-01..WR-05) that `58-REVIEW-FIX.md` records as fixed. Bring each up to date against the code. (2) **Test health:** `macArchKnownFixRouting.test.ts` ("Intel: never seeds…", reproduced 2026-11-05, pre-existing status unverified) and the three sidecar suites noted in Phase 54's deferred items — installFlows, runnerSliceRegistration (67 vs 68 channel census), testContainment. Re-run first: Phases 61–73 may already have fixed or changed some of them.
**Requirements**: DEBT-05, DEBT-06
**Depends on:** None
**Source:** `milestones/v0.9-MILESTONE-AUDIT.md`
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 78 to break down)
