
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
- [ ] **Phase 84: Logger** — 11 plans in 9 waves (consolidated from 14, then two plans split for context budget); planned 2026-11-21 (executes after Phase 83 closes)
- [ ] **Phase 85: Store host, config and versioned migrations** — 25 plans in 20 waves (the D-03 deletion split into four plans for context budget); planned 2026-11-21
- [ ] **Phase 86: Pure leaf services** — not planned
- [ ] **Phase 87: Engine, Wine and tools** — not planned
- [ ] **Phase 88: Launch pipeline** — not planned
- [ ] **Phase 89: Steam library state** — not planned
- [ ] **Phase 90: Steam services and TypeScript depot path** — not planned
- [ ] **Phase 91: Epic (legendary) runner** — not planned
- [ ] **Phase 92: GOG, Amazon and sideloaded runners** — not planned
- [ ] **Phase 93: Download manager** — not planned
- [ ] **Phase 94: Humble Bundle and shortcuts** — not planned
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

**Plans:** 11/11 plans executed in 9 waves; planned 2026-11-21, consolidated from 14 the same day, then the consolidated 84-06 and 84-07 each split in two to stay inside the per-plan context budget; executes only after Phase 83 closes (83-11 live gate passed, D-02)

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

**Plans:** 6/25 plans executed in 20 waves; planned 2026-11-21

Plans:
**Wave 1**
- [x] 85-01-PLAN.md — Before any store code: the TS store oracle golden (conf writes, engine outcomes, migrations, settings documents) and dot-path, number and key-order vectors
- [x] 85-03-PLAN.md — Shared renderer policy and `kind:"store"` frame vectors; the live macOS gate contract 85-HUMAN-UAT.md (run by 85-20)
- [x] 85-04-PLAN.md — Spikes: S1 mirror protocol model, S3-S5 frame/boot/sync_all measurements and the constants they set
- [ ] 85-05-PLAN.md — D-16 checkpoint: the signed v0.10 baseline and its recorded signing identity

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 85-02-PLAN.md — Redacted real-file corpus (operator profile, its `*.bak.json`, v0.8/v0.9/v0.10 in fake HOMEs, edge cases) pinned by MANIFEST.json (D-09)
- [x] 85-06-PLAN.md — `gamelib-store` (+cli) crate: ordered JSON with JS number text and key order, dot-prop paths, atomic write; CI wiring

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 85-07-PLAN.md — Envelope, ops, version engine, backups, D-18 corrupt handling, generated store table, corpus roundtrip

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 85-08-PLAN.md — zod-derived schema descriptor and the settings/library migration chains in Rust; corpus migrate parity; CLI `open`

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 85-09-PLAN.md — StoreHost widened into gamelib-store; uploadedLogs v0.10 format fix; bounded boot open, GAMELIB_STORE, GAMELIB_STORE_BOOT, `store` exit drain

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 85-10-PLAN.md — Tracer: TS mirror -> `kind:"store"` frames -> Rust owner -> disk with acks, on one store

**Wave 7** *(blocked on Wave 6 completion)*
- [ ] 85-11-PLAN.md — Mirror hardening: S1 protocol, shared cells, dot paths, quit flush, D-02 fallback proof, jest disk sink

**Wave 8** *(blocked on Wave 7 completion)*
- [ ] 85-12-PLAN.md — Flip caches (D-01 first family), runtime caches, corrupt caches start empty after their copy
- [ ] 85-18-PLAN.md — D-17 bottle version gate in Rust for the engine marker and shared-redist ledger

**Wave 9** *(blocked on Wave 8 completion)*
- [ ] 85-13-PLAN.md — Flip user-state; older libraries migrated at boot before the sidecar

**Wave 10** *(blocked on Wave 9 completion)*
- [ ] 85-14-PLAN.md — Flip token-bearing and account configs (shared steam_store cell); keyring names pinned on every CI OS (D-10, D-14)

**Wave 11** *(blocked on Wave 10 completion)*
- [ ] 85-15-PLAN.md — Flip settings last: store/config.json, config.json, GamesConfig/* through readSettingsDoc; D-22 first boot; eviction on reset/uninstall

**Wave 12** *(blocked on Wave 11 completion)*
- [ ] 85-16-PLAN.md — Renderer reads native: one policy file for TS and Rust, snapshot and fetch from StoreHost, read-only notice from Rust

**Wave 13** *(blocked on Wave 12 completion)*
- [ ] 85-17-PLAN.md — Renderer writes native: set/set-checked/delete/new and storeChanged from Rust with rev; preload stale-push guard

**Wave 14** *(blocked on Wave 13 completion)*
- [ ] 85-19-PLAN.md — Clean-worktree proof, push and signed Phase 85 build checkpoint, three-OS CI, identity recorded beside the baseline

**Wave 15** *(blocked on Wave 14 completion)*
- [ ] 85-20-PLAN.md — Run the live macOS gate (signed v0.10 -> signed Phase 85 upgrade, SC1-SC3)

**Wave 16** *(blocked on Wave 15 completion)*
- [ ] 85-21-PLAN.md — D-03 deletion after the gate, part 1: migration system (SC4 recorded) and migrationsStore, mirror schedule pinned (D-19); flag, TS owner path and `conf`

**Wave 17** *(blocked on Wave 16 completion)*
- [ ] 85-22-PLAN.md — D-03 deletion, part 2: the engine, tools, launcher, flow and bridge-runtime side stops carrying the TS versioning engine

**Wave 18** *(blocked on Wave 17 completion)*
- [ ] 85-23-PLAN.md — D-03 deletion, part 3: configs, store managers and StoreRoot stop carrying it; test helper forbidden and deleted

**Wave 19** *(blocked on Wave 18 completion)*
- [ ] 85-24-PLAN.md — D-03 deletion, part 4: TS read-only notice path ended; schemaStrip and store types relocated; storeVersioning and storeMigrations deleted (SC5)

**Wave 20** *(blocked on Wave 19 completion)*
- [ ] 85-25-PLAN.md — Post-deletion clean-worktree and three-OS CI proof

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

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 86 to break down)

### Phase 87: Engine, Wine and tools

**Goal**: Engine selection, bottles and Wine tooling run in Rust with the same behaviour on real engines.
**Requirements**: SVC-02
**Depends on**: Phase 86
**Research flag**: Needs deeper research (empirical CrossOver/Staging behaviour)
**Success Criteria** (what must be TRUE):
  1. A game uses CrossOver first and falls back to the pinned Wine-Staging with DXVK exactly as before, verified live on real engines
  2. Per-game bottles are created, reused and removed as before; removing a bottle never touches a sibling game
  3. Wine, CrossOver and Staging downloads, Winetricks and DXVK/DXMT/vkd3d tools install and report progress as before
  4. `wine/`, `tools/` and engine TypeScript and their sidecar registrations are deleted in this phase

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 87 to break down)

### Phase 88: Launch pipeline

**Goal**: Launching any game builds the same command line and environment from Rust.
**Requirements**: SVC-03
**Depends on**: Phase 87
**Research flag**: Needs deeper research (golden argv/env traces recorded from TS first)
**Success Criteria** (what must be TRUE):
  1. For native, Wine/Proton/CrossOver, gamescope/mangohud, known-fix overlay and pre/post-script launches, the Rust command line and environment match golden traces recorded from the TypeScript
  2. A game launched from the UI starts and runs on macOS, Windows and Linux with a single in-flight launch per game
  3. Anti-cheat handling at launch and the remaining `utils.ts` pieces behave as before
  4. `launcher.ts`, `commandRunner`, known-fixes and the replaced `utils.ts` code and their registrations are deleted in this phase

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 88 to break down)

### Phase 89: Steam library state

**Goal**: Steam library state, game sessions and update detection live in one Rust owner, and the TypeScript poll event machinery is gone.
**Requirements**: STM-01
**Depends on**: Phase 88
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

**Goal**: Every Steam operation is served by Rust with no TypeScript Steam services left.
**Requirements**: STM-02
**Depends on**: Phase 89
**Research flag**: Standard
**Success Criteria** (what must be TRUE):
  1. A user can sign in to Steam (QR, credentials, SteamGuard), redeem a key, install, update, uninstall and launch a Steam game end to end
  2. Mac Steam adoption of a GameLib install, including the pending-adoption record and restart-on-Play, works as before
  3. The CM session and depot calls are in-process Rust calls with no `ShellJobHost` sidecar round trip
  4. `games.ts`, `depot/`, `depotRust/`, `gameLaunch`, `steamLaunchWatch`, `macSteam*` and the Steam TS shims and their sidecar registrations are deleted in this phase

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 90 to break down)

### Phase 91: Epic (legendary) runner

**Goal**: Epic sign-in, library and game management run from Rust over the bundled legendary binary.
**Requirements**: STO-01
**Depends on**: Phase 90
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
**Depends on**: Phase 92
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
**Depends on**: Phase 93 (Humble is independent of the managers and may slide earlier, to right after Phase 86)
**Research flag**: Standard
**Success Criteria** (what must be TRUE):
  1. Humble keys sync, can be claimed and redeemed as before, with secrets still read through the keyring dispatch and no new Keychain prompt
  2. Shortcuts are created and removed as before on macOS, Windows and Linux
  3. The Humble and shortcut test oracles are ported as Rust tests or recorded fixtures
  4. The Humble and shortcuts TypeScript and their sidecar registrations are deleted in this phase

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 94 to break down)

### Phase 95: Steam bridge install

**Goal**: Installing a game through the Steam bridge runs in Rust.
**Requirements**: STM-03
**Depends on**: Phase 90
**Research flag**: Needs deeper research (run the bridge spike early; may overlap Phases 91-94 if a second lane exists)
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
**Depends on**: Phases 94, 97
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
