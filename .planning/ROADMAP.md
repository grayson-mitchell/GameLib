
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

## Phase Details

Phase details for every phase through 50 live in the archived roadmap, `milestones/v0.8-ROADMAP.md`
(`## Phase Details` for phases 1–9, `## v0.2 Phase Details` … `## v0.8 Phase Details`). New phases
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

### Phase 51: Widen the native Steam bridge — more interface proxies, scan-derived eligibility

**Goal:** Most Windows-only Steam games on macOS run through the Phase 24 bridge in their own
per-game bottle, and the shared Phase 17 `GameLibSteam` bottled-Steam bottle becomes the fallback
for a measured residue instead of the default. Today `isBridgeEligible()` (`steam/games.ts:2001`)
requires membership in `bridge/bridge-allowlist.json`, which holds two games (Avernum 5 and 6), so
every other bottle-eligible title shares one Windows Steam client and one set of CrossOver tweaks.
Filed 2026-10-17 from the operator design question of 2026-10-16, closing
`.planning/todos/completed/2026-10-16-widen-the-native-steam-bridge-beyond-two-games.md`.
Per-game bridge bottles already ship (quick `261016-u1w`, live-gated 5/5 by `261016-wsq`), so the
bottle half of the question is answered; this phase is the interface half and the eligibility half.

**Three sub-decisions are LOCKED inputs to the spec, made from the Phase 24 record:**

1. **Interface order is the Hoard set, in this order:** ISteamUtils, ISteamApps, ISteamUserStats
   first (near-universal, mostly read-only or safely stubbable), ISteamRemoteStorage second (answer
   as cloud-disabled), ISteamMatchmaking and ISteamNetworking last (answer unavailable; P2P join
   stays out of scope as 24-SPEC ruled). The evidence is D-UAT-24-09: Hoard loaded the shim, ran,
   and died on the first unimplemented accessor (`SteamUtils`) because `steam_api.def` exports only
   the lifecycle set plus `SteamAPI_SteamUser_v023` and `SteamAPI_SteamFriends_v018`. The export
   table must also grow the bare legacy accessors (`SteamUser()`, `SteamUtils()`, …) Hoard imports
   and whatever the `SteamInternal_*` / `SteamAPI_GetHSteamUser` / `SteamClient()` family modern
   SDKs route through — research must census that family against real owned titles, it is not in
   any spike. Acceptance is 24-UAT Gate 4 re-run: Hoard (63000) playable through the bridge.

2. **Eligibility becomes scan-derived, not hand-curated.** The install-time coverage check already
   exists (`bridge/shimGenerate.ts:239`, `scanSteamApiImports` → rejected placement on any uncovered
   symbol); today its verdict is thrown away after one launch failure. This phase persists it per
   game in `steamMetadataStore` on the D-17 `forcedWindowsViaBottle` precedent, and a bottle-eligible
   game that is NOT allowlisted installs into a per-game bridge bottle, is scanned, and either runs
   through the bridge or gets the D-05 dialog naming the missing symbols and offering the
   bottled-Steam fallback. The scan can only run after the exe exists, so the phase accepts
   install-first-decide-second; the spec must settle whether the depot manifest's file list
   (`steam_api.dll` vs `steam_api64.dll`) gives a cheap pre-install screen.

3. **The allowlist stays bundled JSON; no remote CI index.** D-01 named the Phase 19 index as the
   upgrade path, but there is nothing to index without owning the games. The JSON becomes a seed of
   known-good titles plus a known-bad list (DRM-wrapped, 24-SPEC out-of-scope); growth is the
   persisted scan verdict above.

**Two hazards the spec must carry, both measured at filing:** (a) the shim is PE32 i386 and
`importScan.ts` matches only the `steam_api.dll` heading, so a 64-bit game scans as importing
nothing and placement passes vacuously — the game then loads a `steam_api64.dll` that does not
exist. Any scan-derived eligibility must fail closed on a `steam_api64.dll` import, and whether a
64-bit shim target (`zig cc -target x86_64-windows-gnu`, single Win64 calling convention) is in
scope decides whether "most" is reachable at all; research it before the spec, do not assume
either way. (b) Until this lands, the documented stopgap for the shared bottle is per-executable
Wine overrides (`HKCU\Software\Wine\AppDefaults\<game>.exe`), which need no second bottle.

**Requirements**: TBD (run `/gsd-spec-phase 51` or `/gsd-discuss-phase 51` to mint; the three
sub-decisions above are locked, the two hazards are open questions for research).
**Depends on:** Phase 24 (the generator `meta/gen_vtables.ts`, the helper
`native/steam-bridge/helper/bridge_helper.c`, the wire frame both share, and the `bridge/` routing
in `games.ts`) and quick task `261016-u1w` (per-game bridge bottles). **Not** Phase 50, which
`phase.add` wrote by positional guess — the Epic subview shares no files with this.
**Plans:** 30/30 plans complete
**Status:** Complete 2026-10-25. The D-51-15 "most" goal, recorded unmet by 51-30 (N=18, K=0, M=19), was closed by Phase 53 (10 of 18 verified running, majority); 51-VERIFICATION.md amended in place to passed 7/7.

Plans:
**Wave 1**

- [x] 51-01-PLAN.md — TRACER: per-game helper with real AppID, ephemeral port via gamelib_bridge.cfg, helper lifetime tied to the game; live check on Avernum 6 (D-51-01, D-51-03)
- [x] 51-02-PLAN.md — Import scan sees bare accessors / SteamInternal / GameServer families and steam_api64.dll; interface-version capture (hazard a, D-51-13 detection)
- [x] 51-03-PLAN.md — Contracts: route/IPC types, allowlist v2 (seed + known-bad), shimCoverage module, persisted bridge verdict (D-51-07/08/10)
- [x] 51-04-PLAN.md — All Phase 51 strings in gamelib.json, 49 locales, one commit
- [x] 51-05-PLAN.md — Remove-all-copies deletes the emptied per-game bridge bottle; close LD-5 todo (D-51-12)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 51-06-PLAN.md — Generator v2: multi-version manifests, MSVC class-return fix, stackBytes stubs, cfg-selected bare accessors, wire param kinds
- [x] 51-07-PLAN.md — Pure route resolver (seed ∪ verdict ∖ known-bad ∖ forced-bottle) + verdict-returning, version-capturing, arch-aware placement
- [x] 51-08-PLAN.md — "Waiting for Steam…" for blocked bottled launches from measured log signals; close todo (D-51-16)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 51-09-PLAN.md — games.ts routing on the verdict; scan-miss deletes bottle + D-05 with missing symbols; location-based launch/uninstall (D-51-05, D-51-07)
- [x] 51-10-PLAN.md — Generated helper dispatch table; identity-only helper mode

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 51-11-PLAN.md — Proton-inventory extractor; ISteamUtils/Apps/UserStats + old User/Friends versions for XCOM and Hoard (Hoard versions measured)
- [x] 51-12-PLAN.md — 480 identity fallback + one-time limited-features notice (D-51-04, D-51-02)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 51-13-PLAN.md — Known-bad / scan-miss route-notice dialog with "Try the bridge anyway"; route IPC (D-51-08, D-51-11, D-51-10)
- [x] 51-14-PLAN.md — RemoteStorage (cloud-disabled), Matchmaking/Networking (unavailable) stubs + SteamGameServer stubs

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 51-15-PLAN.md — Win64 shim (steam_api64.dll), modern-SDK lookup family, ELEX set, disassembly ABI gate (D-51-13)
- [x] 51-16-PLAN.md — Route line + force-bottled toggle in the install dialog; route row on the game page (D-51-09, D-51-10, D-51-02)
- [x] 51-17-PLAN.md — Pre-install depot-manifest screen (D-51-06)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 51-18-PLAN.md — Census tool + 51-UAT.md (D-51-15, D-51-14)

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 51-19-PLAN.md — Live gates (Hoard Gate 4 re-run, XCOM, ELEX, Avernum 5/6), census re-run, seed/known-bad growth

**Gap closure — Wave 1**

- [x] 51-20-PLAN.md — CR-01 arch-scoped isScanVerdictNowCovered; CR-03 x64 null-object fallback only for runtime-lookup families
- [x] 51-21-PLAN.md — CR-02 matchmaking family spelling: cfgFamilyName in the generator, regenerate, cross-source pin test
- [x] 51-22-PLAN.md — Prescreen backslash basename fix; CR-04 runtime-loaded steam_api is a miss, never downgrade the prescreen
- [x] 51-24-PLAN.md — Waiting for Steam names sign-in (steamui_login.txt) and the self-update download phase (D-51-16)

**Gap closure — Wave 2** *(blocked on gap Wave 1)*

- [x] 51-23-PLAN.md — Bridge process monitor starts before the wine child is awaited; launcher-exit and give-up paths stop the helper (D-51-01)
- [x] 51-25-PLAN.md — Hoard to knownBad on evidence; playVerified seed field; census reports routed vs verified running
- [x] 51-26-PLAN.md — Live accessor probe, then wire Win64 SteamUser019/Friends015/Utils008/Apps008 (D-51-13)

**Gap closure — Wave 3-6** *(live, sequential)*

- [x] 51-27-PLAN.md — Packaged re-gates: helper teardown, ELEX through the wired Win64 shim, Waiting-for-Steam sign-in cause
- [x] 51-28-PLAN.md — Operator decision re-baselining the D-51-14 anchor; XCOM bottled-Steam confirmation
- [x] 51-29-PLAN.md — Rule-drawn representative sample of owned Windows-only titles, installed and played
- [x] 51-30-PLAN.md — Closing census on the sample (routed vs verified running), seed/known-bad growth, operator "most" verdict

**Cross-cutting constraints:**

- Spec-less probe fallback skipped: phase has no requirement IDs to probe (visible skip)

### Phase 52: Bridge-backed steamclient.dll for SteamStub titles

**Goal:** Steam games wrapped with Steamworks DRM ("SteamStub", a `.bind` PE section) run through
the native Steam bridge in their own per-game bottle. The stub's launch check is answered by the
genuine signed-in Mac Steam client, with no Windows Steam client in the bottle and the exe
unmodified. Today such a game finds no client, falls back to `steam://run/<appid>` and exits
silently after about 2 s. Filed 2026-10-24 from
`.planning/todos/pending/2026-10-23-forwarding-steamclient-dll-for-steamstub-titles.md`.

**Evidence (spikes 038, 039):** the stub reads `HKCU\Software\Valve\Steam\ActiveProcess\SteamClientDll64`
(`SteamClientDll` on x86), loads that DLL and calls `CreateInterface("SteamClient017")`, then
`("SteamClient014")`. That's the public client surface, which Proton's `lsteamclient` forwards on Linux.
A ~30-line forwarder returning the game's own shim interfaces worked as plumbing (039), but the
stub still exited (code 51) with no `HELLO` at the helper. The shim's generated `SteamClient017`
methods are local `HELPER FALLBACK`/`STUB` constants, so nothing reached the native client.

**Scope:**

1. `meta/gen_vtables.ts`: `SteamClient017` and `014` genuinely forward to the helper's native
   `ISteamClient` (pipe/user handles served helper-side, not constants). `GetISteam*` logs the
   versions requested on the real path, and hands out forwarding proxies for the versions the stub needs.

2. The forwarder `steamclient.dll` / `steamclient64.dll` (zig-built, as spike 039), resolving
   through the game's own shim module so the helper keeps one connection.
   *Planning note:* x64 `steamclient64.dll` only; the x86 `steamclient.dll` is deferred (decision 6,
   `deferred-items.md`).

3. Bottle setup at launch: write `ActiveProcess\SteamClientDll`/`SteamClientDll64`/`Universe`/`pid`
   and place the DLLs. Never create `HKLM\Software\Valve\Steam` (spike 036: its presence diverts the
   game into `steam.exe -applaunch`).
   *Planning note:* only `SteamClientDll64` and `Universe` are written. The x86 `SteamClientDll` value is
   deferred (decision 6), and `pid` is not written on the first live run (decision 1); it is added only
   if the user decides so at 52-11's checkpoint.

4. `.bind` detection at install/scan time, so a SteamStub title is known before launch and gets an
   honest notice rather than "game stopped after 2s of play".

5. The five missing modern-SDK `SteamInternal_*` exports and DLL-importer scan gap Grim Dawn hits
   next (`2026-10-23-x64-shim-lacks-modern-sdk-steaminternal-exports-and-scan-misses-dll-importers.md`).

**Boundary (locked):** every answer the stub receives comes from the native client. No stand-in
that answers on its own, no DRM reconstruction. CEG titles (spikes 035–037) stay out of scope and
keep the `drm-wrapped` → bottled-Steam route.

Amended 2026-10-24 (52-UAT item 29):

**Done when (amended 2026-10-24, gap round 4, class O1):**
For a SteamStub title in its per-game bridge bottle (Grim Dawn,
219990, is the reference), GameLib's forwarder steamclient64.dll
loads and reaches the native bridge (HELLO observed). When the
stub's file/forwarder check then rejects the launch (Application
Load Error 3), GameLib shows an honest notice that the SteamStub
launch check cannot be satisfied through the bridge, instead of
failing silently or falling back to `steam://run`.

Grim Dawn reaching its main menu through the bridge is no longer
part of this phase. It is deferred to a separate, operator-owned
decision (static RE of the stub, outside the locked boundary).
The locked boundary is unchanged.

**Requirements**: TBD
**Depends on:** Phase 51 (generator, helper dispatch, per-game bridge bottles, x64 shim)
**Plans:** 37/37 plans complete

Plans:

**Wave 1** *(parallel)*

- [x] 52-01-PLAN.md — SteamClient017/014 forward to the native client: manifests + policy, forwarded GetISteam* (no null object), pointer-presence dispatch, FWD logging, identity-only gate
- [x] 52-04-PLAN.md — Zero-import PE section parser (.bind); drmWrapper on the persisted scan verdict
- [x] 52-05-PLAN.md — Bounded static-import closure (exe -> Engine.dll) in scanSteamApiImports
- [x] 52-06-PLAN.md — SteamStub notice strings in all 49 gamelib catalogs

**Wave 2-3** *(serial after 52-01: shared generated sources and helper build)*

- [x] 52-02-PLAN.md — Helper CONTROL slot 3 CREATE_INTERFACE asks SteamInternal_CreateInterface; protocol constant; integration tests
- [x] 52-03-PLAN.md — zig-built steamclient64.dll forwarder (CreateInterface only, resolves the loaded shim); build + prune + path constant

**Wave 4**

- [x] 52-07-PLAN.md — x64 shim exports GameLibBridge_CreateInterface + five SteamInternal_*; regen + pins
- [x] 52-08-PLAN.md — steamClientSetup.ts (HKCU-only reg add, forwarder placement) and .bind detection in placeShimForGame

**Wave 5**

- [x] 52-09-PLAN.md — launchBridgeGame wires SteamStub setup; honest unforwarded notice (log + one-time notify)

**Wave 6-8** *(live, sequential)*

- [x] 52-10-PLAN.md — Desk gate, scratch-clone harness, live-gate contract + reachability review, deferred note (authors, does not run)
- [x] 52-11-PLAN.md — Discovery rounds in a scratch clone (cap 3), pid decision checkpoint
- [x] 52-12-PLAN.md — Done-when: GameLib launch of Grim Dawn, cx-log trace, bottle hygiene; close both todos on pass

**Gap closure** *(from 52-VERIFICATION.md, 3/7; waves: 13+15 parallel, then 14+16 parallel, then 17, then 18 live)*

- [x] 52-13-PLAN.md — Serve SteamUser023 / SteamNetworking006 / RemoteStorage016 on x64 via the inventory pipeline (Grim Dawn no longer withheld)
- [x] 52-15-PLAN.md — drmWrapper on withheld results (fresh steamstub|none, exeArch); withhold only when restorable, else refresh the stale shim as placed-miss
- [x] 52-14-PLAN.md — CR-01: null-object fallback for ordinary x64 GetISteam*, forwarding only after GameLibBridge_CreateInterface; generated-source pin
- [x] 52-16-PLAN.md — Withheld SteamStub notice; WR-01 bounded wait:false reg add, WR-02 strict exit code, WR-03 PE arch, WR-04 fresh drmWrapper; defer WR-05..08
- [x] 52-17-PLAN.md — Packaged re-gate: Grim Dawn launch, cx-log trace with strict Steam-init check, bottle hygiene (UAT items 9-11)
- [x] 52-18-PLAN.md — ELEX no-regression check (item 12), conditional pid decision (item 13), finalize UAT and todos

**Gap closure 2** *(from 52-VERIFICATION.md re-verification, 5/7; waves: 19+20+21 parallel, then 22, then 23 live, then 24 live)*

- [x] 52-19-PLAN.md — Gap 5 diagnosis: relay trace of the SteamStub check window + export tables (no fix chosen); Gap 6 Friends attribution arms (UAT items 14-15)
- [x] 52-20-PLAN.md — WR-09: gate the eight non-lookup SteamClient017/014 wire methods off the SteamStub path with pre-phase values; widen WR-07 revisit
- [x] 52-21-PLAN.md — WR-11: withhold only when a steam_api target exists; placed-miss with no own-steam_api line otherwise
- [x] 52-22-PLAN.md — Gap 5 fix: decision checkpoint over boundary-reviewed options from 52-19 evidence, then implement the chosen one (UAT item 16)
- [x] 52-23-PLAN.md — Strict packaged re-gate 2: Grim Dawn launch, cx-log strict Steam-init trace, hygiene (UAT items 17-19)
- [x] 52-24-PLAN.md — ELEX no-regression after WR-09 with Friends before/after (item 20), finalize UAT and todos

**Gap closure 3** *(from 52-VERIFICATION.md re-verification 2, 5/7; sequential: 25, then 26, then 27 live, then 28 live)*

- [x] 52-25-PLAN.md — Gap 5 diagnosis 3: static G/F/E file comparison (signature, CheckSum, version resource, exports), re-measured export tables, public-source claims, relay diag3 for trust/hash APIs and the full Load Error text; check classification, no fix (UAT item 21)
- [x] 52-26-PLAN.md — Decision checkpoint over boundary-reviewed options from the 52-25 classification, then implement exactly one (or record not closable within the boundary) (item 22)
- [x] 52-27-PLAN.md — Strict packaged re-gate 3: Grim Dawn launch, cx-log strict Steam-init trace, hygiene (items 23-25)
- [x] 52-28-PLAN.md — Conditional ELEX no-regression (item 26), finalize UAT, deferred-items and todos

**Gap closure 4** *(from 52-VERIFICATION.md re-verification 3, 5/7; operator chose "Discriminating trace"; waves: 29+30 parallel, then 31, then 32 decision)*

- [x] 52-29-PLAN.md — 52-REVIEW gap-closure-3 hardening: WR-01 .rc existence guard, WR-02 argv-order test pin, IN-01 doc comment (forwarder bytes untouched)
- [x] 52-30-PLAN.md — Gap 5 round-4 trace-first: pre-register the discriminating experiment + commit; harness SCORE/PID_ARM switches; arm A (no pid) relay trace, dialog text recaptured vs 52-25 R1, T1-T8 (UAT item 27)
- [x] 52-31-PLAN.md — Arm B (clone-only pid -> live process) under the committed rule; two-arm score table; classify into pre-registered O1-O4 with its recommendation; no fix (UAT item 28)
- [x] 52-32-PLAN.md — Operator decision over the class-bounded options (close-out + done-when amendment, pid-writer-next-round, or static RE); finalize UAT/deferred-items/todo; leave gaps_found (UAT item 29) Operator chose option-closeout (O1); done-when amended.

**Gap closure 5** *(amended done-when, 52-UAT item 29; waves: 33+34 parallel, then 35 live)*

- [x] 52-33-PLAN.md — Forwarded-path SteamStub notice strings (steam.bridge.steamstub.forwardedTitle/forwardedBody) in all 49 gamelib catalogs; 52-06 strings unchanged
- [x] 52-34-PLAN.md — Honest notice on the forwarded SteamStub path: deterministic trigger (steamstub + forwarder placed), log every launch + notify once per session, no reroute, nothing answers the stub; trigger tests
- [x] 52-35-PLAN.md — Live: packaged Grim Dawn launch (HELLO + notice, item 30) and cx-log trace (no steam://run, item 31); settle item 2; close out UAT, deferred-items, todos, STATE

**Gap closure 6** *(52-UAT item 30: notice triggered but not seen; waves: 36, then 37 live)*

- [x] 52-36-PLAN.md — Forwarded SteamStub notice also shown as an in-app GameLib dialog (guaranteed channel, dialog.ts policy rule 1); every OS notification logs its delivery result (backend label through notification_show and the shim 'show' event)
- [x] 52-37-PLAN.md — Live: GameLib.app (UserNotifications backend) launch of Grim Dawn, in-app notice seen + delivery result logged (item 32); item 31 carried; close out UAT, deferred-items, todos, STATE

### Phase 53: Steam bridge coverage: modern-SDK exports, flat API

**Goal:** Engine-wrapper titles that use the native Steam bridge get Steam initialised *inside the
game*, not just a shim attached. The bar is phase 51's strict criterion: `HELLO` plus a clean
game-side Steam init (Unity `Player.log` or equivalent). No game log means unverified, and Mac
Steam In-Game never counts. Today the 51-29 sample is 12 of 12 bridge-routed and 0 verified
(N=18, K=0, M=19 in the 51-30 census).

Two defect classes, ranked by sample reach:

1. **Modern-SDK `SteamInternal_*` entry points**, reached through four engines: Hell Clock 1782460
   (Unity/Steamworks.NET `InitEx`), Mining Mechs 1603180 (GameMaker `Steamworks_x64.dll`),
   Overlooting 3410180 (GodotSteam), and Ranch Simulator 1119730 (UE Shipping exe).
   **Phase 52 plan 52-07 already adds the five x64 exports** for Grim Dawn. This phase depends on
   it, takes those five as given, and does not duplicate them. What's left here: x86 parity,
   re-testing these four titles, and whatever each one hits after `SteamInternal_SteamAPI_Init`
   returns OK.

2. **The Steamworks flat C API** (`SteamAPI_ISteamClient_*`, `SteamAPI_ISteamUser_*`,
   `SteamAPI_ISteamUtils_*`, …) used by Unity + Steamworks.NET: Vampire's Fall 1167950, The
   Planet Crafter 1284190, and Rogue Waters 1691190, which **does not run**: it hangs at loading on
   `IsSteamRunningOnSteamDeck`. Generate the exports from the same interface tables as the vtable
   proxies, choose the SDK generation(s) from the owned Unity library, and make the scan read the
   managed assemblies' DllImport entry points so the census verdict is honest for this class.

Done when the census Evidence column reads `verified` for a majority of the Steamworks-using
titles in a re-run sample containing these seven.

Source todos:

- `2026-10-23-x64-shim-lacks-modern-sdk-steaminternal-exports-and-scan-misses-dll-importers.md`
- `2026-10-23-bridge-shim-lacks-steamworks-flat-api-for-unity-steamworks-net-games.md`

Out of scope, tracked separately: the Unreal bootstrap-exe scan miss
(`2026-10-24-bridge-scan-reads-unreal-bootstrap-exe-and-misses-the-shipping-binary.md`), the
SteamStub forwarder (Phase 52), and bottle Windows runtime components
(`2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md`).
**Requirements**: none mapped (no REQUIREMENTS.md); plans keyed to decisions D-53-01..D-53-14 in 53-CONTEXT.md
**Depends on:** Phase 52
**Plans:** 20/20 plans complete

Plans:
**Wave 1**

- [x] 53-01-PLAN.md — new x64 interface manifests (Client020/021, User021, Friends017/018, Utils010, UserStats012/013, Input006, GameServer014/015, GameServerStats001) + SteamInternal_GameServer_Init
- [x] 53-02-PLAN.md — pure ECMA-335 ImplMap reader, AnyCPU CLR-flag rule, UTF-16 version constants, measured flat-name fixture
- [x] 53-03-PLAN.md — census per-engine evidence + game-originated CALL rule, Steamworks-using majority line, rotated logs

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 53-04-PLAN.md — generated flat Steamworks API exports (x64), NULL-on-unknown flat lookups, generated export list
- [x] 53-05-PLAN.md — shared bridgeScan.ts module, Mono managed scan, effective arch, j4l lift for UE titles

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 53-06-PLAN.md — helper CALL trace and CONTROL slot 4 REPORT_VERSION (NOVER)
- [x] 53-07-PLAN.md — census on the shared scan, x86 measurement and deferral

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 53-08-PLAN.md — desk gate and 53-UAT live re-run contract

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 53-09-PLAN.md — live sample run and census majority (operator checkpoint)

**Gap closure** *(from 53-VERIFICATION.md gaps_found, 6 of 18)*

**Gap wave 1**

- [x] 53-10-PLAN.md — CR-01 flat struct-return ABI (hidden-pointer exports, fail-closed structSize, x64 `_ret` refusal; Input006/GameServer/Friends018 remodelled)
- [x] 53-11-PLAN.md — honest census: latest-run logs (no -backup-/-prev), per-launch app-log segment, CALL set + identity, NOVER and known-bad downgrades
- [x] 53-13-PLAN.md — helper CALL after STATUS_OK, NOVER cap, per-line stderr relay, ILONLY AnyCPU rule, managed verdict key

**Gap wave 2** *(blocked on 53-10)*

- [x] 53-12-PLAN.md — serve the Steamworks.NET CSteamAPIContext.Init interface set (Screenshots003 + 15 more) plus SteamUtils009/Controller006/GameServer012

**Gap wave 3** *(blocked on 53-12)*

- [x] 53-14-PLAN.md — forward GetAuthSessionTicket/CancelAuthTicket; Abiotic Factor live re-test (operator checkpoint)

**Gap wave 4** *(blocked on 53-14)*

- [x] 53-15-PLAN.md — diagnose Overlooting rip=0, Ranch 0x35, Rogue Waters re-trace; fix in scope or route to todos (operator checkpoint)

**Gap wave 5** *(blocked on all gap plans)*

- [x] 53-16-PLAN.md — rebuild, desk gate, full live re-run, honest census re-measure of the done-when (operator checkpoint)

**Gap closure** *(from 53-VERIFICATION.md re-verify, 9 of 18)*

**Gap wave 1**

- [x] 53-17-PLAN.md — CR-01 GetPublicIP hidden-pointer fallback guard (GameServer012 RAX dispatch, instance guards) + out-buffer WR-02/03/04
- [x] 53-18-PLAN.md — census evidence anchored to payload category (WR-01), log-rotation span (WR-06), helper line carry-over (WR-05)
- [x] 53-19-PLAN.md — Overlooting NvAPI: measure DLL-override arms in the bottle, ship per-appId bridge-bottle override if one clears the fault

**Gap wave 2** *(blocked on 53-17, 53-18, 53-19)*

- [x] 53-20-PLAN.md — rebuild, desk gate, full live re-run (Overlooting first), honest census re-measure of the done-when (operator checkpoint)

### Phase 54: No authenticated Steam logon at launch, browse or Play

**Goal:** Launching GameLib, browsing the library, opening a game page and pressing Play never open an authenticated steam-user CM session, so none of them can sign the user's Mac Steam Friends list out. Debug session `friends-signout-steam-user` showed that any authenticated logon for the account, landing while Mac Steam's Friends is connected, signs Friends out or locks it Offline, and that only a Mac Steam restart recovers it (`steam://friends/status/online` and a Mac Steam reconnect do not; see its "Follow-up 2026-10-26"). The launch logon is currently a race between the boot sign-in probe (`'boot-probe'` unlocks `authTrigger.ts`'s sticky gate) and the mount refresh; make the deferral deterministic so launch shows the cached library and never logs on. Public PICS reads (platform capture, game page, install location, bridge launch target) move to an anonymous CM session, degrading benignly for `public_only` apps. An authenticated session opens only for an explicit Refresh, sign-in and depot installs, through one gated entry point. The Web API owned-games path is out of scope (Valve refuses SteamClient refresh tokens for access tokens without an authenticated CM session; `54-RESEARCH.md`). On macOS that entry point also wraps every authenticated logon in the go-offline trick, which spike 046 showed GameLib can drive itself: if Mac Steam is logged on, `steam://open/gooffline`, wait for the user-initiated `LogOff()` in Mac Steam's `connection_log.txt`, log on, then `steam://open/goonline` in a `finally` (only if the wrap took Steam offline). If the LogOff is not seen, fall back to a guided "Go Offline" step and never log on silently. The entry point owns every CM logon: steam-user `autoRelogin` off, and the canary `relog()` and any reconnect go back through the wrap (`.planning/debug/friends-signout-steam-user.md`, "Verdict 2026-10-27"). Platform-routed installs remain follow-up work. Update `.planning/research/STEAM-STACK.md` with the anonymous-PICS and on-demand-session change. Source todo: `2026-10-24-friends-sign-out-steam-user-logon.md`.
**Success Criteria:**
1. A cold launch with a signed-in account logs no authenticated logon, whichever of the boot probe and mount refresh lands first (unit test over both orderings; runtime `[Steam] CM logon mode=` log line shows none with `authenticated`).
2. Opening a game page, Play (including the bridge launch target), install-location and platform-capture lookups run on an anonymous CM session; `public_only` apps degrade without error (fixture-backed test).
3. Authenticated `logOn` is reachable only from an allow-listed entry point for explicit Refresh, sign-in and depot installs (source gate with an anti-vacuity floor); `depot.ts` reads the persisted SteamID, not `client.steamID`.
4. Mac UAT: launch, browse, game page and Play leave Mac Steam Friends signed in with status changeable; the anonymous session alone does not flip Friends.
5. `STEAM-STACK.md` records the change and why.
6. On macOS every authenticated logon (Refresh, sign-in, depot install, and any reconnect or relog) runs inside the go-offline wrap: unit tests cover Steam already offline (no toggle, no `goonline`), LogOff seen, LogOff not seen (guided fallback, no logon), and logon failure (`goonline` still fires); `autoRelogin` is off. Mac UAT: an explicit Refresh and a depot install with Mac Steam online leave Friends signed in with status changeable.
**Requirements**: TBD
**Depends on:** Phase 53
**Plans:** 14/14 plans complete

Plans:

**Wave 1**

- [x] 54-01-PLAN.md — go-offline wrap (macSteamOffline.ts), shared anonymous PICS client, guided-step IPC types (ROADMAP-SC2, SC6)
- [x] 54-02-PLAN.md — guided Go Offline strings in all 49 gamelib catalogs (ROADMAP-SC6)

**Wave 2** *(blocked on 54-01)*

- [x] 54-03-PLAN.md — SteamUser.acquireAuthenticated: one gated, refcounted, wrapped session; autoRelogin off; no relog; sign-in and redeem through it (ROADMAP-SC3, SC6)

**Wave 3** *(blocked on 54-03)*

- [x] 54-04-PLAN.md — one-shot refresh logon grant; launch never logs on under either ordering; Refresh holds a lease, captures platforms anonymously (ROADMAP-SC1, SC2)
- [x] 54-05-PLAN.md — depot path on the lease; persisted LastOwner; shared redists log on only at install time (ROADMAP-SC3, SC6)
- [x] 54-06-PLAN.md — install location and bridge launch target on the anonymous session, persisted launch-target fallback (ROADMAP-SC2)
- [x] 54-07-PLAN.md — guided Go Offline dialog, retry invoke, preload and store wiring (ROADMAP-SC6)

**Wave 4** *(blocked on 54-04, 54-05, 54-06)*

- [x] 54-08-PLAN.md — game page and Play open no session; install paths hold one wrapped lease; refusals defer to the guided step; Refresh backfills bridge launch targets (ROADMAP-SC2, SC3, SC6)

**Wave 5** *(blocked on waves 1-4)*

- [x] 54-09-PLAN.md — steamAuthSessionPolicy source gate; STEAM-STACK.md and CLAUDE.md updated; full desk battery (ROADMAP-SC3, SC5)

**Wave 6** *(blocked on 54-09)*

- [x] 54-10-PLAN.md — author the Mac live-gate contract with Structural Reachability Review and pending 54-UAT.md (ROADMAP-SC4, SC6)

**Wave 7** *(gap closure: Mac Steam left offline by an interrupted go-offline wrap)*

- [x] 54-12-PLAN.md — owed-goonline marker written before gooffline, cleared after goonline; restoreMacSteamOnlineIfOwed (ROADMAP-SC4, SC6)

**Wave 8** *(blocked on 54-12)*

- [x] 54-13-PLAN.md — pay the owed goonline on routed quit (handleExit), stdin EOF (releaseForShutdown) and sidecar boot (ROADMAP-SC4, SC6)

**Wave 9** *(blocked on 54-13)*

- [x] 54-14-PLAN.md — Mac gate items 10-13: quit, shell kill and kill -9 mid-wrap, and the user's own offline choice (ROADMAP-SC4, SC6)

**Wave 10** *(blocked on 54-09, 54-10, 54-14)*

- [x] 54-11-PLAN.md — run the Mac gate (operator checkpoint) and score 54-UAT.md (ROADMAP-SC4, SC6)

### Phase 55: Steam bridge callback delivery for the web-API auth ticket

**Goal:** A bridged game that asks for a web-API auth ticket gets one. `ISteamUser::GetAuthTicketForWebApi(pchIdentity)` is forwarded to real Mac Steam through the helper. The helper captures `GetTicketForWebApiResponse_t` (callback 168) from its own callback pump and queues it. The shim records `SteamAPI_RegisterCallback` registrations, and `SteamAPI_RunCallbacks` drains queued callbacks over a new CONTROL slot and dispatches them to the registered `CCallbackBase` objects. The MSVC vtable slot of `Run(void*)` is measured on x64 and x86, never assumed. Root cause and evidence: `.planning/debug/abiotic-factor-loading-hang.md`. Reusable diagnostic trace: `.planning/debug/abiotic-factor-loading-hang.trace.patch`. Done when (live gate): Abiotic Factor (427410) reaches an interactive main menu and the game log shows an EOS Connect user login.
**Requirements**: TBD
**Depends on:** Phase 53
**Plans:** 7/7 plans complete

Plans:

**Wave 1**

- [x] 55-01-PLAN.md — forward GetAuthTicketForWebApi (SteamUser023 slot 14, in-string identity) via manifest + wire-policy; regenerate (P55-1, P55-8)
- [x] 55-02-PLAN.md — measure MSVC CCallbackBase layout with pinned zig (Run(void*) slot, flag/iCallback offsets x64+x86) as constants + test (P55-2)
- [x] 55-03-PLAN.md — helper manual dispatch, bounded allowlist ring for callback 168, CONTROL slot 6 DRAIN, protocol.ts constant (P55-4, P55-5, P55-6)

**Wave 2** *(blocked on 55-01, 55-02, 55-03)*

- [x] 55-04-PLAN.md — generated shim callback registry + out-of-lock dispatcher, host-harness proven (P55-3)

**Wave 3** *(blocked on 55-04)*

- [x] 55-05-PLAN.md — wire registry into shim exports, drain slot triple pin, PE build gates, idempotence, full suite (P55-3, P55-4, P55-6, P55-7, P55-8)

**Wave 4** *(blocked on 55-03, 55-05)*

- [x] 55-06-PLAN.md — author the Abiotic Factor 427410 live-gate contract + Structural Reachability Review + pending UAT; x86 deferral todo (P55-LIVE)

**Wave 5** *(blocked on 55-06)*

- [x] 55-07-PLAN.md — run the live gate (operator checkpoint), score UAT, pin the EOS login literal (P55-LIVE)

### Phase 56: Bridge steamclient-layer DRM mode for SteamStub titles

**Goal:** A SteamStub-wrapped title (`.bind` section) launches through the native Mac Steam bridge with no Windows Steam client. GameLib's forwarding `steamclient64.dll` can never pass SteamStub's module check, because the stub verifies the slot's file is Valve's signed client (spikes 040, 041). So this phase adds a second bridge mode for DRM-wrapped titles only. Spike 043 calls it adoption option 2, and spike 044 proved it live: Grim Dawn 219990 reached its menu under NotProton. The pieces: Valve's genuine `steamclient(64).dll` fetched from Valve's CDN onto the user's machine (never shipped), its exports trampolined in memory to `lsteamclient` (Proton's `steamclient_setup_trampolines`), `lsteamclient` built against a CrossOver source drop, a cloned and patched CrossOver runner, and the x86_64 slice of Mac `steamclient.dylib` as the host. The game's own `steam_api` runs, with no GameLib shim. The TCP `steam_api` bridge stays the default for DRM-free titles. Boundary (user ruling 2026-10-27): fetching the client and trampolining it in memory are in bounds. Patching game exes, decrypting DRM, and a GameLib stand-in for Steam's private protocol are out. CEG titles are out of scope: 044 left CEG's `STEAMSTART` servicing unsolved. Carried open question from 044: Steam API init behind the genuine client is unverified under the strict bridge-verified criterion. Targets: Grim Dawn 219990, Raft 648800, Ranch Simulator 1119730. Source: todo `2026-10-26-steamstub-titles-fail-launch-check-on-bridge.md` item 1. Done when (live gate): Grim Dawn reaches its menu through this mode with only Mac Steam running, and it meets the strict bridge-verified criterion.
**Requirements**: TBD
**Depends on:** Phase 52
**Plans:** 3/16 plans executed

Plans:
- [ ] TBD (run /gsd-plan-phase 56 to break down)
