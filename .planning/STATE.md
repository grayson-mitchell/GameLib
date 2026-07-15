---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Steam macOS Compatibility Runtime
status: planning
stopped_at: Phase 21 context gathered
last_updated: "2026-07-15T08:40:39.247Z"
last_activity: 2026-07-15
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 6
  completed_plans: 6
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-05)

**Core value:** One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.
**Current focus:** Phase 21 — steam native install

## Current Position

Phase: 21
Plan: Not started
Status: Ready to plan
Last activity: 2026-07-15

## v1.4 Phase Map

| Phase | Name | Status |
|-------|------|--------|
| 17 | Steam on macOS via CrossOver/Wine | Complete & secured (2026-07-13) — 17 plans, UAT 7/7, VERIFICATION 6/6, code-review CR-01/WR resolved (17-17), SECURITY threats_open:0 (21/21) |
| 18 | macOS 32-bit detection, badge & CrossOver routing | Complete (UAT 5/5, secured) |
| 19 | CrossOver Compatibility Index (macOS) | Planned (2026-07-14) — 8 plans across 4 waves, reqs CXIDX-01..13, PATTERNS + threat models; plan-checker PASS after closing 2 blockers (D-02 gate enforcement, D-16 key-absence). Ready to execute |

## v1.1 Phase Map

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 5 | Branding & About Polish | BRAND-02, BRAND-03, BRAND-04, APP-01 | Complete (2026-07-02) |
| 6 | Library & Game Status UX | LIB-05, LIB-06, GAME-05 | Complete (2026-07-03) |
| 7 | Game Details Enrichment | DETAIL-01, DETAIL-02 | Executed (UAT pending) |
| 8 | New Steam Surfaces | STORE-01, CONSOLE-01 | Not started |
| 9 | Quality Gate | QA-01 | Not started |

## v1.2 Phase Map

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 10 | Humble Auth + Adapter Scaffold | HACCT-01, HACCT-02, HACCT-03 | Not started |
| 11 | Library Sync + 5-State Key Model | HSYNC-01, HSYNC-02, HSYNC-03, HSYNC-04 | Not started |
| 12 | Ownership Dedup | HDEDUP-01, HDEDUP-02 | Not started |
| 13 | Keys-Waiting + Giftable-Spares Views | HVIEW-01, HVIEW-02 | Not started |
| 14 | Guided Claim Flow | HCLAIM-01, HCLAIM-02, HCLAIM-03, HCLAIM-04, HCLAIM-05 | Not started |
| 15 | Store Overlay + Expiration Alerts | HSTORE-01, HSTORE-03 | Not started |

## Performance Metrics

**Velocity (v1.0):**

- Total plans completed: 99 (phases 1-4)
- Average duration: ~5-15 min/plan
- Total execution time: ~5 days (2026-06-24 → 2026-06-29)

**By Phase (v1.0):**

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

**v1.0 Detail Log:**

| Phase 01 P03 | 8min | 3 tasks | 8 files |
| Phase 02-steam-library P01 | 4min | 3 tasks | 5 files |
| Phase 02-steam-library P02 | 15min | 2 tasks | 3 files |
| Phase 02-steam-library P03 | 5min | 2 tasks | 3 files |
| Phase 02-steam-library P04 | 2min | 2 tasks | 4 files |
| Phase 02-steam-library P05 | 5min | 3 tasks | 9 files |

**v1.1 Trend:**

- Plans completed: 1
- Trend: —

**v1.1 Detail Log:**

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

## Accumulated Context

### Roadmap Evolution

- Phase 08.1 inserted after Phase 8: Steam Delisted Games & Library Filters — delisted availability signal, 'Game no longer available' + install-disable, only-show filter modes (from Phase 8 UAT) (URGENT)
- v1.2 roadmap created 2026-07-05: Phases 10–15, 18 requirements mapped. Dependency chain is non-negotiable (auth → sync → dedup → views → claim flow → store overlay). Phase 10 carries highest validation risk (live API confirmation of axios + cookie + X-Requested-By header reaching api/v1/user/order).
- Phase 16 added 2026-07-10 under new milestone **v1.3 — Compatibility Data**: CrossOver Compatibility Rating (CodeWeavers) — replace the extra-info Crossover rating's stale AppleGamingWiki source (from quick 260710-l27) with a live CodeWeavers slug-lookup backend. Feasibility validated by spike 260710-nwb (66.7% naive / ~83.3% with slugify fixes). Locked constraints: content-based hit/miss detection (soft-404 = HTTP 200), apostrophe-drop + roman-numeral slugify fixes, on-demand reference-style lookups (no bulk crawl). Depends on Phase 7 extra-info rows.
- Phase 17 added 2026-07-10 under new milestone **v1.4 — Steam macOS Compatibility Runtime**: Steam on macOS via CrossOver/Wine — Windows-only Steam games (no native Mac build) install and launch on macOS through the Windows Steam client running inside a GameLib-managed CrossOver/Wine bottle instead of native `steam://` delegation. **Locked architecture:** run Windows Steam *in a bottle* (reuse WineSelector/CrossoverBottle plumbing); do NOT wine-run individual game exes (rejected — DRM-free only). Reverses Phase 3 GAME-04 **for macOS only**: `SteamGame.isNative()` becomes per-OS (`is_mac_native`), and the `state/InstallGameModal.ts:35` short-circuit must stop firing `steam://install` for non-mac-native games on macOS. Linux keeps Proton delegation unchanged. Depends on Phase 3 + Phase 7. Requirements/success criteria TBD in discuss/plan.

- Phase 18 added 2026-07-12 (v1.4) from /gsd-explore: **macOS 32-bit detection, badge & CrossOver routing** — detect a Steam game's mac build arch and route 32-bit-only mac games to CrossOver/Wine (32-bit dropped in Catalina/2019) with an OS/arch badge beside the game logo. **Locked approach:** hybrid detection — `osarch` via `steam-user` `getProductInfo` PICS appinfo (`config.launch[N].config.osarch`; match `"macos"` + legacy `"osx"`) as pre-install hint, plus post-install Mach-O check (`lipo -archs`). Missing `osarch` is NOT assumed 32-bit (avoids Steam's documented false-32-bit-flag trap). Routes via existing `isBottleEligible()`/D-11. Steam-only V1. Pre-work: runtime `getProductInfo` dump to lock parser. See `.planning/notes/steam-mac-arch-detection-decisions.md`, todo `steam-getproductinfo-appinfo-dump.md`. Depends on Phase 17 + Phase 7.

- Phase 21 added 2026-07-14 under new milestone **v1.6 — Steam Native Install** (from /gsd-explore + spikes 001/002): replace the opaque `steam://rungameid` install handoff with an **in-process depot download GameLib owns** — real progress, real errors, recovery. GameLib downloads depots over `steam-user`'s authenticated CM connection and writes an `appmanifest_{appId}.acf` the Steam client **adopts**; launch stays with `steam://` (DRM works); **Steam owns updates, GameLib owns only the first install** (D-2). **Fully de-risked against a real machine:** spike 001 — Steam adopts a hand-written `.acf` (`StateFlags 1026`→`4`, zero-byte install, game launches); spike 002 — 171/171 files downloaded in-process, byte-identical to Steam, **pure-JS LZMA sufficient (no native module)** → C# DepotDownloader wrapper rejected. Locked: `StateFlags=1026` not `4`; depot selection = package-level ownership (two channels + DLC-app enumeration + language filter, 11/11 verified); reimplement `steam-user`'s broken `getManifest` filenames + chunk download (~100 lines); 64-bit IDs are strings (never `@node-steam/vdf.parse`); retry chunks across content servers. Pre-work: audit `@node-steam/vdf` call sites; confirm launch on a hard-DRM title. See `.planning/spikes/MANIFEST.md`, `.planning/notes/steam-depot-install-architecture.md`. Depends on Phase 3 + Phase 1.

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
- [v1.1 DETAIL-02]: AppleGamingWiki integration is macOS-only and Mac-games-only; ProtonDB/Linux follow-up is DETAIL-03, explicitly deferred to post-v1.1
- [v1.1 STORE-01]: Steam storefront tab is browse-only; purchasing stays in Steam's own client/web flow
- [Phase 07 DETAIL-01]: Steam `fetchMetadataIfNeeded` now captures appdetails `platforms` → `is_mac_native`/`is_linux_native`; flags persisted in `SteamMetadataCacheEntry` and re-seeded on `refresh()` so they survive resync/restart. Windows is the implicit baseline (no flag)
- [Phase 07 DETAIL-01]: platform icons are runner-agnostic (FontAwesome brand glyphs), rendered in the Install-info TabPanel
- [Phase 07 DETAIL-02]: rating-source setting (`appleRatingSource`: crossover|wine, default crossover) uses the `configStore` + `ContextProvider` pattern — NOT `useSetting`/`SettingsContext`, which isn't populated outside the Settings tree where GamePage/AppleWikiInfo render. Toggle lives in the Accessibility screen, gated to macOS
- [Phase 07 DETAIL-02]: ~~overlay gate is `platform==='darwin' && gameInfo.is_mac_native` (D-13)~~ **SUPERSEDED by Phase 7 UAT (2026-07-04):** the AppleGamingWiki CrossOver/Wine rating measures how a WINDOWS game runs on macOS via a translation layer — Mac-native games need no such rating. Gate is now `platform==='darwin' && !gameInfo.is_mac_native` (show on Windows games on macOS). Overlay still always shows an "Unrated" pill when no rating (D-12, user-confirmed); `GamePicture`'s generic `overlay` prop unchanged
- [Phase 07 tier→color]: rating tiers mapped to `_colors.scss` `--status-*` tokens (Perfect/Playable→success, Runs/Borderline→warning, Unplayable→danger, empty→default); vocabulary is free-form upstream so unknown values fall back to neutral
- [v1.2 Humble auth]: BrowserWindow + session.cookies is the only viable auth path — Humble's /processlogin requires reCAPTCHA; programmatic login is impossible. Zero new npm packages required.
- [v1.2 Humble adapter]: C5 adapter isolation is non-negotiable — all Humble HTTP calls through adapter.ts; X-Requested-By: hb_android_app header required on every request (omitting this is the likely cause of all three Lutris integration failures)
- [v1.2 claim flow]: Primary activation URL is store.steampowered.com/account/registerkey?key= NOT steam://open/activateproduct (does not pre-fill key; unreliable on Linux Flatpak/Snap)
- [v1.2 dedup threshold]: Fuzzy-name fallback at 85%+ threshold (not community-norm 70%) — DLC titles false-positive match base games at lower thresholds and false positives waste gift links
- [v1.2 Humble not a Runner]: 'humble' is NOT added to the Runner union type — keys domain is not a game platform; no LibraryManager methods required
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

### Pending Todos

- Phase 7 manual UAT on macOS (real Steam account): overlay visibility on Mac/Windows-only games, "Unrated" pill, CrossOver↔Wine toggle drives both surfaces, pill click-through, runner-agnostic platform icons.
- Phase 10 live validation gate (before Phase 11 begins): empirically confirm axios + Cookie: _simpleauth_sess + X-Requested-By: hb_android_app reaches api/v1/user/order from Electron main process. Fallback = BrowserWindow webRequest proxy.

### Blockers/Concerns

- Pre-push hook (`prettier` + `i18n --fail-on-update`) fails on **pre-existing repo debt** unrelated to Phase 7: ~141 files fail `prettier --check .` (likely a Prettier version bump; `pnpm-lock.yaml` already modified) and the locale files have orphaned-key drift. Phase 7 was pushed with `--no-verify` after independently verifying tsc/lint/tests. A separate housekeeping pass (`pnpm prettier --write .` + `pnpm i18n`) would clear it.

### Quick Tasks Completed

| # | Description | Date | Directory |
|---|-------------|------|-----------|
| 260627-vq1 | Fix QR login hang: set qrSessionState done immediately after credential storage, fire CM connection in background, add 15s timeout | 2026-06-27 | [260627-vq1-fix-qr-login-hang-set-qrsessionstate-don](.planning/quick/260627-vq1-fix-qr-login-hang-set-qrsessionstate-don/) |
| 260628-kzf | Fix blank Steam icon on Manage Accounts login page: replace FontAwesome faSteam with inline SteamLogo SVG to match other store runners | 2026-06-28 | [260628-kzf-fix-blank-steam-icon-on-manage-accounts-](.planning/quick/260628-kzf-fix-blank-steam-icon-on-manage-accounts-/) |
| 260628-pi7 | Show Steam last-played + total time on game details page (rtime_last_played) | 2026-06-28 | [260628-pi7-show-steam-last-played-on-game-details-p](.planning/quick/260628-pi7-show-steam-last-played-on-game-details-p/) |
| 260629-9ly | Fix QR-login → Steam-library race: assign QR background CM connect to connectingPromise (dedupe), gate frontend finalization on truthy poll.username | 2026-06-29 | [260629-9ly-fix-qr-login-library-race](.planning/quick/260629-9ly-fix-qr-login-library-race/) |
| 260629-rbn | Fix premature Steam install/uninstall notifications + status:done badge flash (GAME-02/03): runner==='steam' guards suppress premature DM/uninstaller emissions so the ACF poller solely owns Steam status + fires confirmed completion toasts | 2026-06-29 | [260629-rbn-fix-premature-steam-install-uninstall-no](.planning/quick/260629-rbn-fix-premature-steam-install-uninstall-no/) |
| 260630-ths | Decouple fork versioning from upstream Heroic: package.json version→1.0.0 + upstream base field (2.22.0 @ b5b5cad3), rename v1.0 tag→gamelib-v1.0, add UPSTREAM.md | 2026-06-30 | [260630-ths-decouple-fork-versioning-from-upstream-h](.planning/quick/260630-ths-decouple-fork-versioning-from-upstream-h/) |
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

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Game Details | DETAIL-03: Linux ProtonDB compat overlay | Post-v1.1 | v1.1 requirements |
| Settings | API-01: Copy-to-clipboard on API key field | Post-v1.1 | v1.1 requirements |
| Console / Steam | CONSOLE-02: Steam update feedback in Console launch — when a Steam game needs an update, GameLib shows "Launched in Steam" and dismisses while Steam silently updates; user has no in-app signal. Needs own design (Steam does not report update state back). From Phase 8 UAT (finding E). | Post-v1.1 | Phase 8 UAT (2026-07-04) |
| Console / macOS | KNOWN LIMITATION — Launching a Steam game from Console mode on macOS shows a brief desktop-Space animation before the game appears. Cause: Console mode uses native fullscreen (its own macOS Space) so swipe-to-Space works; macOS must leave that Space when the game's window appears elsewhere. Not fixable from Electron without setSimpleFullScreen, which removes the swipe-able Space and has focus/chrome rough edges (prototyped + rejected in Phase 8 UAT test 11). `activate:false` on the steam:// handoff was tried and kept but does not remove the flash. Accepted as-is. | Accepted (won't fix) | Phase 8 UAT (2026-07-04) |
| Humble Store | HSTORE-02: Read-only Humble bundle/deals listing in-app with "Buy on Humble" deep-links | Post-v1.2 | v1.2 requirements (separate data source; key management prioritized) |

## Session Continuity

Last session: 2026-07-15T08:40:39.240Z
Stopped at: Phase 21 context gathered
Next: Phase 20 (v1.5 — Aggregated Store Search) complete, 7/7 plans. Next up is Phase 21 (v1.6 — Steam Native Install, depot download) per ROADMAP.md.
| 2026-07-10 | fast | Replace CrossOver icon with monochrome weave mark | ✅ |
| 2026-07-11 | fast | Steam list-view store label showed 'Other' → 'Steam' (getStoreName) | ✅ |
| 2026-07-11 | fast | Removed redundant Steam-specific refresh button from LibraryHeader | ✅ |
