
# Roadmap: GameLib

## Overview

GameLib forks Heroic Games Launcher and adds Steam as a first-class platform alongside Epic, GOG, and Amazon. The roadmap follows the natural dependency chain: Steam authentication is the prerequisite for everything else, library sync requires an authenticated account, game operations require the library to exist, and branding is applied once the core feature set is complete and ready to ship.

## Milestones

- ✅ **v0.1 Steam Platform** — Phases 1–4 (shipped 2026-06-29) — archive: `milestones/v0.1-ROADMAP.md`
- ✅ **v0.2 Polish & Enhancements** — Phases 5–8.1 (Phase 9 Quality Gate never started) — phase dirs archived 2026-10-16 to `milestones/v0.2-phases/`
- ✅ **v0.3 Humble Bundle Integration** — Phases 10–15 (shipped 2026-07-10) — `milestones/v0.3-phases/`
- ✅ **v0.4 Compatibility Data** — Phase 16 (shipped 2026-07-10) — `milestones/v0.4-phases/`
- ✅ **v0.5 Steam macOS Compatibility Runtime** — Phases 17–19 (shipped 2026-07-14) — `milestones/v0.5-phases/`
- ✅ **v0.6 Aggregated Store Search** — Phase 20 (shipped 2026-07-15) — `milestones/v0.6-phases/`
- ✅ **v0.7 Steam Native Install** — Phases 21, 23–26 (closed 2026-10-16 with live-only UAT PARKED, not verified — see MILESTONES.md; Phase 23's gaps G-23-01/G-23-02 were closed 2026-08-19) — `milestones/v0.7-phases/`
- ✅ **v0.8 Tauri Shell** — Phases 27–50 plus parked Phase 22 (shipped 2026-10-16, **override closeout** — see MILESTONES.md) — archive: `milestones/v0.8-ROADMAP.md` (full phase details, 6008 lines), `milestones/v0.8-phases/`
- ✅ **v0.9 Steam Bridge & Engine** — Phases 51–60 (shipped 2026-11-06; audit `tech_debt`, no blockers) — archive: `milestones/v0.9-ROADMAP.md`, `milestones/v0.9-MILESTONE-AUDIT.md`, `milestones/v0.9-phases/`. Phases 61–64 are unassigned.

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
- [ ] **Phase 9: Quality Gate** - All v0.1 and v0.2 shipped phases pass a formal Nyquist validation pass (no directory — never started)

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
- [ ] **Phase 34.7: Epic device-auth single sign-in path** — 0/0 plans; ⏸ ON HOLD — never planned (0 plans)
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
- [ ] **Phase 47: Migrate aggregated store search from CheapShark to IsThereAnyDeal** — 0/0 plans; never planned (0 plans) — carried forward
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

**Unassigned (next milestone not yet defined)**

- [x] **Phase 61: Unified macOS engine for all stores** — 27/27 plans (20 + 7 gap closure); re-verified 22/22, operator approved 2026-11-07 (completed 2026-11-07)
- [x] **Phase 62: Module boundaries and decomposition** — 23 plans (21 + 2 gap closure); complete (completed 2026-11-07)
- [x] **Phase 63: Rust migration pattern and executable scanners** — 14 plans; planned (completed 2026-11-07)
- [ ] **Phase 64: UI to edit themes** — 0 plans; not started
- [ ] **Phase 65: Steam store manager decomposition, continued** — 20 plans (1 executed); Phase 61 closed 2026-11-07 — unblocked, D-11
- [ ] **Phase 66: Backend dependency injection replacing module-level singletons** — 0 plans; not started
- [x] **Phase 67: Schema validation at the sidecar IPC boundary** — 20 plans in 14 waves; planned 2026-11-07 (completed 2026-11-07)
- [ ] **Phase 68: Versioned persisted stores and migrations** — 0 plans; not started
- [ ] **Phase 69: Consolidate frontend state onto GlobalStateV2** — 0 plans; not started
- [ ] **Phase 70: Split GameInfo into shared and per-store shapes** — 0 plans; not started
- [ ] **Phase 71: Rust shell module decomposition** — 0 plans; not started
- [ ] **Phase 72: Renderer trust boundary and process hardening** — 0 plans; not started
- [ ] **Phase 73: Steam depot download pipeline in Rust** — 0 plans; not started

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

## Backlog

No items. Phase 999.1 (cross-store signed-out / offline mode) was promoted to Phase 49 on
2026-10-08; its full text now lives under that entry.

**Adjacent, deliberately NOT folded in:** confirming that `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD` and `APPLE_SIGNING_IDENTITY` are enrolled as repo secrets — without
them `.github/workflows/release-tauri.yml` ships unsigned, giving each release a fresh code
identity so the macOS Keychain ACL never matches and users get re-prompted on every update. That
is the actual lever on prompt *quantity*, it is independent of this phase, and it should not wait
on it.

## Unassigned Phase Details

Phases 61–64 are not assigned to a milestone yet. Phase details for 51–60 (v0.9) live in
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
**Requirements**: TBD
**Depends on:** None
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 64 to break down)

### Phase 65: Steam store manager decomposition, continued

**Goal:** The Steam store manager files Phase 62 leaves untouched are split along their natural seams, so no file under `storeManagers/steam/` is a multi-thousand-line grab-bag. Targets, measured 2026-11-06: `steam/library.ts` (4,393 lines), `steam/bottle.ts` (2,567), and the largest `steam/bridge/` files: `shimGenerate.ts` (1,496), `drm/runnerClone.ts` (1,376), `helperProcess.ts` (1,143) and `drm/stageDrmBottle.ts` (1,021). `shimExports.generated.ts` is generated and out of scope. Reuse Phase 62's method: a cluster map of each file first, pure moves before mechanical lifts, no behaviour change in a move commit (D-06), and the dependency-cruiser rules Phase 62 adds must stay at zero. Splitting `bottle.ts` first is worth considering because Phase 61 moves the engine and bottle decision out of `steam/`, so a clean split shrinks 61's diff. Open questions for discuss-phase: the minimum module set for `library.ts` (owned-apps fetch, local ACF/VDF scan, metadata/artwork enrichment and cache look like the seams), and whether to sequence before or after Phase 61. Came from the post-Phase-62 architecture review on 2026-11-06.
**Requirements**: TBD
**Depends on:** Phase 62
**Plans:** 18/20 plans executed

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

- [ ] 65-19-PLAN.md — remove remaining install + launch lift stubs (D-18, D-19 fallback); close lift-stub todo

**Wave 20** *(blocked on Wave 19 completion)*

- [ ] 65-20-PLAN.md — done-line proof, full battery + D-14 live smoke run 2 (checkpoint)

**Cross-cutting constraints:**

- Every importer and every jest.mock / requireMock of a moved name targets the owning module (D-03, 62 D-05)

### Phase 66: Backend dependency injection replacing module-level singletons

**Goal:** Backend modules receive their dependencies instead of reaching for module-level state, so tests need far fewer module mocks and each long-lived handle has one owner. Measured 2026-11-06: 144 top-level `let` declarations in `src/backend` (outside tests) and 2,197 `jest.mock(` calls across 706 test files. Three parts: (1) **The pattern.** A small context object built once at sidecar boot (`sidecar/bootstrap.ts`) carrying paths, logger, config/stores, the child-process spawner (which must still go through `createFakeHomeProfile()` in tests) and the clock, passed down to store managers and `launcher.ts`, with a documented way to construct a test context. (2) **Migration.** Convert the store managers and `launcher.ts` first (Phase 62 narrows `launcher.ts` to `storeManagers/index` and `storeLaunchHooks`), then other backend modules by count. Track the remaining top-level `let` and `jest.mock(` counts with a shrink-only ratchet like Phase 62's. (3) **One process runner.** 32 backend files import `child_process` directly and 42 spawn something (measured 2026-11-06). Every spawn goes through one runner module, handed out by the context, that owns `unref()` and the exit contract, timeouts (Phase 61 adds one to every CrossOver launch), log capture and redaction, and the test environment, so tests pass a fake runner built on `createFakeHomeProfile()` instead of mocking `child_process`. Existing wrappers (the `utils.ts` and per-store command helpers) become thin callers of it. A lint rule bans `child_process` imports outside the runner, with a shrink-only ratchet like the others. Owning handles in the context should make the sidecar exit contract (every timer, watcher, socket and child `unref()`d, no unbounded in-flight boot work) easier to keep and to check. It also gives Phase 63's Rust ports one place to swap an implementation. Open questions for discuss-phase: plain constructor/parameter passing versus a container library (default: none), and whether module-level caches that are genuinely process-wide may stay as explicitly registered singletons. Came from the post-Phase-62 architecture review on 2026-11-06.
**Requirements**: TBD
**Depends on:** Phase 62
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 66 to break down)

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
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 68 to break down)

### Phase 69: Consolidate frontend state onto GlobalStateV2

**Goal:** The frontend has one state system. The 2,259-line `GlobalState.tsx` class component (`extends PureComponent`, 78 `setState` calls), served through `ContextProvider`, is retired in favour of the zustand store in `src/frontend/state/GlobalStateV2.ts` (164 lines today), so a change in one domain no longer re-renders every context consumer. Measured 2026-11-06, excluding tests: 130 frontend files use `ContextProvider` and 20 use `GlobalStateV2`. Three parts: (1) **Slices.** Move state into V2 one domain at a time (library and game list, downloads and install queue, Steam / Epic / GOG / Amazon / Humble auth, settings and theme, UI and dialog state), each with selector hooks (`useShallow`) so components subscribe to what they read. (2) **Ratchet.** Track the remaining `ContextProvider` consumers with a shrink-only count like Phase 62's, ending at zero, then delete `GlobalState.tsx` and the context. (3) **Live checks.** State moves surface as stale-UI and re-render bugs that type checks and unit tests miss, so each wave ends with a smoke check in `pnpm tauri:dev` (Library, Game page, Downloads, sign-in and sign-out per store, ConsoleMode). Measure Library re-render cost on a large library before and after. No behaviour change: anything else found becomes a todo. Open questions for discuss-phase: whether V2 as it stands is the target or needs restructuring first (it already imports `frontend/helpers/electronStores`); where persisted frontend state lives relative to Phase 68's versioned stores; and the order relative to Phase 64, which adds custom-theme state. Depends on Phase 62 because plans 62-17 to 62-19 convert runner checks in the same Library, Game, ConsoleMode and DownloadManager files. Came from the post-Phase-62 architecture review on 2026-11-06.
**Requirements**: TBD
**Depends on:** Phase 62
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 69 to break down)

### Phase 70: Split GameInfo into shared and per-store shapes

**Goal:** `GameInfo` carries only what every store shares, and store-specific data lives in per-store shapes, so shared code stops depending on Steam, GOG or Epic fields. Measured 2026-11-06: the `GameInfo` interface in `src/common/types.ts` (1,336 lines) declares 41 top-level fields; 119 non-test files under `src/` reference it, 71 of them in the frontend. Store-specific fields sit beside shared ones, e.g. `gog_save_location`, `steamPlatformsCaptured`, the Steam Windows-depot and delisted signals and the Steam-only Metacritic score. Three parts: (1) **The split.** A shared core plus a per-store extension keyed by `runner`, as a discriminated union or a typed `storeData` field (discuss-phase decides), with a narrowing helper so a caller that needs Steam fields says so once. Phase 62's capability flags stay on the shared core. (2) **Migration.** Convert readers by area with a shrink-only count of direct store-field reads outside `storeManagers/` and store-specific UI, like Phase 62's ratchets. (3) **`common/types.ts`.** Move other store-specific types next to their store and leave `common/types.ts` with genuinely shared types. Persisted library caches that hold `GameInfo` shapes change shape, so the move goes through Phase 68's versioned migrations if it has landed, or a cache discard on version change otherwise. Open questions for discuss-phase: union versus `storeData`; whether the IPC payloads that carry `GameInfo` change shape at the same time as Phase 67's schemas; and the order relative to Phase 69, which rewrites many of the same frontend readers. Came from the post-Phase-62 architecture review on 2026-11-06.
**Requirements**: TBD
**Depends on:** Phase 62
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 70 to break down)

### Phase 71: Rust shell module decomposition

**Goal:** The Rust shell has no multi-thousand-line modules: each window, embed and login surface is split along its seams, following the sibling-module layout quick task 261106-ab1 set when it split `main.rs` (20,324 → 7,886 lines, 11 modules plus `wake_lock/`). Targets, measured 2026-11-06: `store_embed.rs` (4,623 lines), `login_window.rs` (3,339), `macos_epic_embed.rs` (2,089), and what remains in `main.rs` (7,886). Method: a cluster map of each file first; mechanical moves with no behaviour change (anything else found becomes a todo); `pub(crate)` only where a move needs it; `cargo test` (442 tests) green after each move, and Windows and Linux compiles checked through CI because Linux-gated code isn't compiled on the Mac. These modules drive the embedded store pages, login windows and cookie reads on macOS, so each wave ends with a live check in `pnpm tauri:dev`: an embedded store page, a sign-in for each store that uses the login window, and the Epic embed, with the frameless title bar both off and on. Phase 62's transport-mirror marker comments in `sidecar.rs` and the `store_embed.rs` dispatch arms (62-04) must survive the moves, or be removed only once Phase 67's generated contract replaces them. Open questions for discuss-phase: the minimum module set per file, and whether shell source-text tests that read Rust files (`testUtils/tauriShellSource.ts`) need the same combined-source treatment 261106-ab1 gave `main.rs`. Came from the post-Phase-62 architecture review on 2026-11-06.
**Requirements**: TBD
**Depends on:** None
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 71 to break down)

### Phase 72: Renderer trust boundary and process hardening

**Goal:** Close the concerns from the 2026-11-07 concerns map (`.planning/codebase/CONCERNS.md`) that no other phase owns, in three groups. (1) **Renderer trust boundary**: the `openExternalUrl`/`openFolder` channels route every non-http(s) value to `shell.openPath`, and the Rust `shell_open_path` arm (`store_embed.rs:2255`) opens it unchecked, so `file://`, `smb://`, `.app` bundles and executables all pass — add a scheme/path allow-list enforced in the shell, not only the sidecar; `removeFolder` (`utils.ts:1490`) deletes recursively under any renderer-supplied parent, and its 5 s timer is not `unref()`-ed (sidecar exit contract); trim `capabilities/default.json` to what the renderer uses (`shell:allow-execute`, `opener:default`, `updater:default`) and decide `withGlobalTauri`; delete the 13 dead `*/ipc_handler.ts` modules, including the `execAsync(commandParts.join(' '))` path in `tools/ipc_handler.ts`; make the Steam token store's plaintext fallback (`tokenStore.ts:198`) impossible rather than relying on `bootstrap.ts` swapping it out first. (2) **Process lifecycle**: the shell spawns the sidecar once (`main.rs:829`) and only fails pending invokes at stdout EOF (`sidecar.rs:565`) — add restart-or-surface so the user is told; the log-only `uncaughtException` handler (`processGuards.ts:259`) leaves a broken sidecar running; quit-time `pkill -f` pattern kills (`utils.ts:972`, sideload `stop()` by basename) can hit unrelated processes — kill by tracked PID/process group, building on Phase 66's process runner if it has landed; on Windows `shutdown_child` (`shell_state.rs:109`) kills only the sidecar PID, so store CLIs outlive the app — use a Job Object or equivalent (needs a Windows check). (3) **Supply chain and CI**: `pnpm audit --prod` reported 22 advisories (6 high) on 2026-11-07, including undici TLS validation (the `undici@^6: ^6.28.1` override is below the fix) and zod (which Phase 67 builds on) — bump, then add an audit step or Dependabot/Renovate to CI; add a Linux compile leg to `rust-test.yml` (31 `cfg(target_os = "linux")` sites are never compiled before a tag), ideally before Phase 71 starts. Groups are independent and can ship as separate plans. Open questions for discuss-phase: restart vs surface-and-quit for a dead sidecar, and whether the open-path allow-list lives in Rust only or both layers. Came from `/gsd-map-codebase --concerns` on 2026-11-07.
**Requirements**: TBD
**Depends on:** None
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 72 to break down)

### Phase 73: Steam depot download pipeline in Rust

**Goal:** The Steam depot download pipeline (fetch → decrypt → decompress → write) runs in Rust, and the TypeScript pipeline and `lzma-native` are deleted. This is the second slice of the incremental Rust migration that Phase 63 started, and the reason is retiring the sidecar, **not speed or memory**. Spike 067a measured today's Node pipeline as network-bound: a Civ V install held ~18 MiB/s steady, and raising the in-flight budget from 32 to 96 chunks changed nothing. Spike 067b measured Rust decode at 5.8 vs Node's 9.3 cpu-s/GiB at the same 177 MiB/s, about 8% of one core across the whole pipeline. The 2.75 GB peak RSS was idle decode workers and was fixed in Node (`b8f015a08` slimmed the worker bundle from 14 MB to under 300 KB, `db95a4373` caps the pool at 4 when native). 067c's README names "the sidecar itself being retired" as the trigger to revisit, which is this phase. Reuse Phase 63's pattern: the code lives in the `src-tauri/` Cargo workspace; the sidecar calls it through `rustInvoke` with the TypeScript signature unchanged, and only a job description crosses the JSON-lines pipe, never chunk bytes; a parity harness runs both pipelines against the same jobs and requires byte-identical trees (SHA1 per file); a flag keeps the TypeScript path as the fallback until the Rust path is verified live; then the TypeScript path is deleted (`steam/depot/`, ~11.6k non-test lines measured 2026-11-07; the old `steam/depot.ts` became `depot/index.ts` in 62-10). Crate choices carried from 067b: `aes` + `cbc` built with `--cfg aes_armv8` (without it `aes` 0.8 falls back to software AES at 277 MiB/s), `flate2` on `zlib-rs`, `xz2` (static liblzma), `zstd`. Open questions for discuss-phase: **where the boundary sits** — `steam-user` owns CM auth, manifest request codes and depot keys in Node, so does Rust take manifest + depot key + CDN host list and own everything after, or also manifest fetch and parse; how progress, pause, cancel and per-chunk errors flow back to the UI over the pipe; whether reconcile/verify, ACF finalize and adoption (`depot/finalize.ts`, `depot/manifest.ts`) stay in TypeScript or move; how headless tools and tests reach it (Phase 63 answered this with a CLI binary); and Windows/Linux builds, including liblzma static linking that replaces the October `lzma-native` SEA packaging fixes. Came from the operator's request on 2026-11-07, after the 067 spikes.
**Requirements**: TBD
**Depends on:** Phase 63
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 73 to break down)
