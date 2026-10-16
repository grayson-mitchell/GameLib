# Milestones

## v0.8 Tauri Shell (Shipped: 2026-10-16)

**Scope:** Phases 27–50 (plus parked Phase 22, swept in by the archiver). The Tauri v2 rearchitecture — Rust shell, headless Node sidecar over stdio JSON-RPC, real OS-keyring token storage — the incremental IPC re-plumb (slices 1–9, 34.1–34.6), Windows/Linux/macOS packaging with signing, notarization and an auto-update feed, the Electron cutover (35), and the post-cutover work that followed: the embedded login and store webviews (34.4.1, 40, 50), the sidebar-to-card-tabs navigation redesign (34.10–34.12), library filtering and the focus row (34.11, 48), the macOS onedir runner repackaging (34.9, 34.16, 34.18), Steam install-time wine/bottle parity (34.13–34.15), Humble key identity and the unified keys screen (42, 43), the native Winetricks UI (45), and cross-store signed-out/offline mode (49).

**Stats:** 45 phases, 554 plans, 1212 tasks. Git range `c6af6b99b` (first Phase 27 commit, 2026-07-20) → `f23c8dd71` (2026-10-16): 6,240 commits over 88 days. `package.json` is `0.8.0`.

**Closeout type: override_closeout.** Not a verified closeout. At close, 26 of the 45 phases were not both `phase_complete` and `verification_status: passed` (Phase 27 has no VERIFICATION.md at all; 28, 30, 32, 33, 34, 34.13, 35 are `human_needed`; 34.4.2, 34.6, 42, 48, 49 are `stale`; 50 is `gaps_found`; 34.7 is on hold and 47 was never planned). The only milestone audit, `v0.8-MILESTONE-AUDIT.md`, is a partial from 2026-07-22 covering Phases 27–28 at `gaps_found`; no full audit was run before close.

**Known verification overrides: 429 newly acknowledged, 0 carried forward from a prior close (see STATE.md Deferred Items).** The pre-close artifact audit found 569 open items — 21 debug sessions, 6 todos, 235 quick tasks, 22 UAT gaps, 15 verification gaps, 270 deferred-items entries. 429 were acknowledged through `audit-open acknowledge` (7 only after their YAML frontmatter was repaired; 22 ledger entries by hand because their spans embed tables). **140 deferred-items rows were left open and are NOT acknowledged:** they are rows of evidence and disposition tables in the Phase 35, 34.9, 34.4.1, 34.3 and 34.5 ledgers, which the scanner surfaces as items by design and for which no row-level marker exists. They will resurface at the next `audit-open` scan.

**Known Gaps (requirements):** `REQUIREMENTS.md` at close carried 365 checked and 110 unchecked boxes across its v0.2–v0.7 sections; it had no v0.8 section — v0.8's requirements (REQ-27-xx … REQ-50-xx) were tracked per phase in the roadmap's phase details. The whole file is archived as `milestones/v0.8-REQUIREMENTS.md`; the unchecked v0.2–v0.7 items (Phase 9 Quality Gate, Phase 23 G-23-01/G-23-02, the v0.3 HSTORE-02 listing, DETAIL-03, API-01) are carried forward, not closed.

**Key accomplishments:**
1. **Tauri v2 shell shipped and the Electron build removed** (27–35): Rust shell + Node SEA sidecar over stdio JSON-RPC, a `rustInvoke` sidecar→Rust channel, real OS-keyring token storage, and 200+ IPC channels re-plumbed slice by slice behind a `SEAM.md` ported-vs-stubbed boundary; the cutover was verified against a genuine release artifact (PID chain, sha256-identical bundled sidecar).
2. **Cross-platform packaging with a fork-pointed update feed** (34, 34.16, 34.18): Windows/Linux/macOS builds, minisign updater keypair, macOS signing and notarization, Windows signing gated on a complete secret set, and an arm64-only macOS runner strategy with the onedir Python runner repackaging that removed the PyInstaller cold-start tax (34.9).
3. **Embedded login and store surfaces under WKWebView** (34.4.1, 34.4.2, 40, 50): the Electron webview login seam replaced by a Tauri child webview with cookie-read and modal child-window attachment on macOS, in-app store/wiki browsing, and a Rust-managed raw WKWebView subview for the Epic store.
4. **Navigation and library redesign** (34.10, 34.11, 34.12, 48): the sidebar replaced by app-level card tabs with a two-tier nav, a library filter panel (search, views, collections, cross-store facets), the onboarding tour re-anchored, and the focus row replacing the Settings top-section dropdown — each closed by WebKit-measured live gates.
5. **Steam and Humble depth** (34.13–34.15, 36, 37, 42, 43): install-time wine/bottle form at GOG parity, platform-row depot signals and sync integrity, the login-to-Steam crossfade, the depot-decode/false-delisted defect cluster, evidenced Humble key platform identity, and a unified Humble Keys screen.
6. **Cross-store signed-out/offline mode and the native Winetricks UI** (49, 45): one consolidated sign-in notice across five stores probed once at boot with latched expiry, Epic `--offline` launch, and a from-scratch in-app Winetricks surface.

**Process record:** the full auto-extracted one-liner list for all 554 plans was written here by `milestone complete` and trimmed to the six items above; the per-plan one-liners remain in each `SUMMARY.md` under `milestones/v0.8-phases/`.

---

## v0.1 Steam Platform (Shipped: 2026-06-29)

**Delivered:** GameLib — a Heroic Games Launcher fork that adds Steam as a first-class platform alongside Epic, GOG, and Amazon: authenticate, browse, install, launch, and uninstall Steam games from one unified launcher.

**Phases completed:** 4 phases, 16 plans, 23 tasks (+ 5 quick tasks). Timeline: 2026-06-24 → 2026-06-29 (~5 days).

**Audit:** passed — 14/14 requirements satisfied, 0 blockers (`.planning/milestones/v0.1-MILESTONE-AUDIT.md`).

**Key accomplishments:**

- **Steam Authentication (Phase 1)** — Native two-tab Steam login (QR-code via mobile app + username/password/SteamGuard), built on `steam-user` + `steam-session`. Account management in the existing Manage Accounts screen, logout, and Steam-client detection with an actionable not-installed prompt. (AUTH-01..05)
- **Steam Library (Phase 2)** — Owned Steam games appear in the unified library grid alongside Epic/GOG/Amazon, with installed/not-installed state read from local ACF manifests (`@node-steam/vdf`), playtime, and lazy-fetched cover art + store metadata. (LIB-01..04)
- **Game Operations (Phase 3)** — Launch/install/uninstall delegated to the Steam client via `steam://` (numeric-appId injection guard), an ACF poller that owns real install/uninstall status, and full Proton delegation on Linux (Steam games bypass Heroic's Wine layer via `isNative()`). (GAME-01..04)
- **Branding (Phase 4)** — Complete Heroic → GameLib rebrand across app metadata, electron-builder config, window/title-bar identity, and UI. (BRAND-01)

**Notable hardening (quick tasks + debugging this milestone):**

- Fixed the QR-login → library race so Steam games appear immediately after login without a reload (connectingPromise dedupe + frontend `poll.username` gating).
- Fixed credential + SteamGuard login for mobile-authenticator accounts — the credential session wasn't listening during the guard wait, so a background DeviceConfirmation poll silently canceled it; now attaches guard-time listeners (mirrors QR) + out-of-band phone-approval completion.
- Eliminated premature install/uninstall notifications + status badge flash (runner-scoped guards so the ACF poller solely owns Steam status).
- Plus: QR-login hang fix, Steam icon rendering, and game-details playtime display.

**Known tech debt (deferred to v0.2):** no "playing" badge during a Steam session; `'?? MB'` size in the download-manager queue; LIB-03 playtime on library tiles (currently details page only); residual backend "Heroic" log/dialog strings; formal Nyquist validation.

**Human verification:** Phase 1 UAT 5/5 pass (real Steam account); Phase 2 human QA sign-off on real data; GameLib identity human-verified.

---

## v0.2 Polish & Enhancements (Shipped: date not recorded)

**Delivered:** Branding/identity polish, real playtime + install-size data in the library and download manager, platform/compatibility info on the game details page, a browsable Steam storefront tab, and Console-mode Steam support.

**Phases completed:** 5/6 phases (5, 6, 7, 8, 08.1) — 17 plans total, all with matching SUMMARY.md. **Phase 9 (Quality Gate) was never started** — no `.planning/phases/09-*` directory exists. This milestone is best described as shipped-with-outstanding-work, not formally closed: v0.3 (Humble) began before Phase 9's Nyquist validation pass ever ran (see STATE.md memory `milestone-v11-v12-overlap`).

**Key accomplishments:**

- **Branding & About Polish (Phase 5)** — Tray tooltip, backend logs/dialogs, README, and an in-app release-notes view all read "GameLib." (completed 2026-07-02)
- **Library & Game Status UX (Phase 6)** — Real install size in the download-manager queue; a "Playing" badge during active Steam sessions. (completed 2026-07-03)
- **Game Details Enrichment (Phase 7)** — Supported-platform display + AppleGamingWiki CrossOver/Wine compatibility rating for Windows-only Steam games on macOS. (completed 2026-07-03; manual UAT recorded pending)
- **New Steam Surfaces (Phase 8)** — Browsable Steam storefront tab; Steam games playable from Console mode. (completed 2026-07-03, plus 4 UAT gap-closure plans)
- **Steam Delisted Games & Library Filters (Phase 08.1, INSERTED)** — Delisted-game handling (greyed tile, install disabled) and tri-state "only show" library filters. (completed 2026-07-04)

**Open/carried:** Phase 9 Quality Gate (formal Nyquist validation across v0.1+v0.2) never executed — no directory, no plans. Deferred items surfaced during this milestone (DETAIL-03 Linux ProtonDB overlay, API-01 copy-to-clipboard, CONSOLE-02 update feedback) are tracked in STATE.md's Deferred Items table, still open as of this writing.

---

## v0.3 Humble Bundle Integration (Shipped: 2026-07-10)

**Delivered:** A connected Humble Bundle account syncs its full key inventory into GameLib, classified into a 5-state model, deduplicated against the Steam library, claimable through a guardrailed guided-reveal-and-redeem flow, and surfaced as ownership badges + expiration alerts across store-browsing surfaces.

**Phases completed:** 6/6 phases (10, 11, 12, 13, 14, 15) — 35 plans total, all with matching SUMMARY.md. Milestone closed 2026-07-10 when Phase 15 (its final phase) landed its gap-closure round (memory `phase-15-complete-milestone-v12`).

**Key accomplishments:**

- **Humble Auth + Adapter Scaffold (Phase 10)** — In-app browser login (reCAPTCHA/Humble Guard handled by the browser), encrypted session persistence, C5 adapter boundary validated against the live API. (completed 2026-07-05)
- **Library Sync + 5-State Key Model (Phase 11)** — Full key inventory synced and classified UNPICKED/UNREVEALED/REVEALED/REDEEMED/UNREDEEMABLE, fail-soft on API outage. (completed 2026-07-06)
- **Ownership Dedup (Phase 12)** — Exact-AppID + 85%+ fuzzy-name matching against the Steam library so already-owned games surface as `owned_elsewhere`, not a duplicate claimable key. (completed 2026-07-06)
- **Keys-Waiting + Giftable-Spares Views (Phase 13)** — Urgency-sorted claimable-key list and a giftable-spares view with one-click gift-link copy. (5/5 plans executed 2026-07-08)
- **Guided Claim Flow (Phase 14)** — Per-key confirm-before-reveal, C2 hard-block routing already-owned reveals to Giftable Spares, write-ahead audit log, non-Steam link-out. (completed 2026-07-09, plus 2 UAT gap-closure plans realigning the classifier)
- **Store Overlay + Expiration Alerts (Phase 15)** — Ownership badges on Discounts, OS notification on new expiration deadlines, pinned "Expiring soon" section. (completed 2026-07-10, plus 2 gap-closure plans)

**Open/carried — NOT fully clean:** Phase 13's `13-VERIFICATION.md` recorded a Critical finding (CR-01): `getUrgencyCountdownParts` in `src/common/humble/urgencyBadge.ts` has no dedicated 24h–48h branch, so a key expiring in that window shows "2 days left" instead of the UI-SPEC-locked "1 day left" — and the unit test meant to catch this was edited to assert the buggy value. Git history shows only one commit ever touched `urgencyBadge.ts` (`06ae6fd8`, the original 13-01 implementation) — **no fix commit exists**. The milestone-complete memory (`phase-15-complete-milestone-v12`) closed *different* CR-01/WR-01 findings (Phase 15's discount-badge reachability and expiration-dedup keying), not this one. This 24h–48h countdown bug therefore appears to still be live in the shipped code and should be treated as an open carry-forward, not resolved by v0.3's close.

---

## v0.4 Compatibility Data (Shipped: 2026-07-10)

**Delivered:** The game details page's CrossOver compatibility rating is sourced from live CodeWeavers data instead of the earlier AppleGamingWiki heuristic.

**Phases completed:** 1/1 phase (16) — 3 plans, all with matching SUMMARY.md.

**Key accomplishments:**

- **CrossOver Compatibility Rating / CodeWeavers (Phase 16)** — On-demand slug lookup against CodeWeavers with content-based (not HTTP-status) hit/miss detection, apostrophe-drop slugify fix, graceful "no data" state for genuine misses. (completed 2026-07-10)

**Open/carried:** None recorded for this milestone specifically; its slugify roman-numeral bug (D-04) was identified and fixed one milestone later, in Phase 19 (v0.5).

---

## v0.5 Steam macOS Compatibility Runtime (Shipped: 2026-07-14)

**Delivered:** Windows-only Steam games without a native Mac build install and launch on macOS through a GameLib-managed CrossOver/Wine bottle running the Windows Steam client; 32-bit-only Mac builds are detected and routed to the same bottle instead of a failing native install; every library game carries an offline-indexed CrossOver medal badge.

**Phases completed:** 3/3 phases (17, 18, 19) — 31 plans total, all with matching SUMMARY.md.

**Key accomplishments:**

- **Steam on macOS via CrossOver/Wine (Phase 17)** — Guided bottle provisioning + consent flow, per-OS `isNative()`, bottle-aware ACF install-state, live install progress. 17 plans (7 base + 10 gap-closure across 6 UAT retest rounds); completion paused once on a code-review data-loss BLOCKER (CR-01), closed by gap plan 17-17. (completed 2026-07-13)
- **macOS 32-bit detection, badge & CrossOver routing (Phase 18)** — Pre-install min-OS heuristic + post-install Mach-O ground truth (the only detector ever allowed to assert "32-bit"), OS/arch badge, automatic bottle re-routing. (completed 2026-07-13, UAT 5/5)
- **CrossOver Compatibility Index / macOS (Phase 19)** — CI-built offline index from CodeWeavers' daily dump (exact Steam-AppID join for 1,620 apps), replacing the per-game live scrape as the primary source; scraper retained as a miss-fallback. Fixed Phase 16's roman-numeral slugify bug (D-04) along the way. (completed 2026-07-14)

**Open/carried:** GAME-05 "Playing" badge parity for bottled games explicitly out of scope (documented in 17-VALIDATION.md). WR-05 (Phase 19 live check) recorded as still open per STATE.md memory `phase-19-code-complete-pending-closure`.

---

## v0.6 Aggregated Store Search (Shipped: 2026-07-15)

**Delivered:** A new top-level sidebar destination to search a title once and see its price across every store, with an exact-Steam-AppID "you already own this" badge (fuzzy-matched for Epic/GOG/Amazon/Humble) that no price-comparison site can show.

**Phases completed:** 1/1 phase (20) — 7 plans, all with matching SUMMARY.md.

**Key accomplishments:**

- **Aggregated Store Search / CheapShark (Phase 20)** — Provider-neutral types + CheapShark adapter, shared fuzzy title matcher (generalized out of the Humble dedup module, not duplicated), USD-only disclosure contained to the adapter, buy-as-handoff via `shell.openExternal()`. (completed 2026-07-15, live end-to-end human verification recorded in 20-VALIDATION.md)

**Open/carried:** CheapShark's USD-only limitation is consciously-accepted debt inside the adapter boundary, flagged for reshaping when a multi-currency provider (IsThereAnyDeal) lands. The multi-provider discovery/browse surface is explicitly out of scope, captured as a seed.

---

## v0.7 Steam Native Install (In progress — no ship date)

**Scope:** Phases 21, 22 (parked), 23, 24, 25, 26 — an in-process Steam depot-download engine GameLib owns (real progress, real errors, recovery) instead of the opaque `steam://rungameid` handoff, extended to full-ownership `StateFlags=4` installs, a macOS native Steam bridge, multi-host download throughput, and in-app Steam key redemption.

**Status: NOT shipped.** Per STATE.md (`milestone: v0.7`, `status: verifying`) and disk reconciliation:

- **Phase 21 (Steam Native Install, depot download)** — 17/17 plans, code-review clean, secure-phase 41/41 threats_open:0. Complete 2026-07-20, but hardware UAT (7 native-install items) deferred to Windows post-production, plus one tracked macOS-debug item (D-UAT-10 bottled-launch).
- **Phase 22 (Steam Game Families / multiple bottles)** — ⛔ PARKED 2026-07-21, superseded by Phase 24. 8 plans written, 0 executed. See ROADMAP.md `## Parked / Superseded Phases` and commit `b40aa6d8`.
- **Phase 23 (Steam full-ownership install, StateFlags=4)** — **5/10 plans executed.** Gaps open: G-23-01 (KCD2 `Blocked`-depot-key aborts the whole install) and G-23-02 (native install applies no execute bits; Gate 2 only a CONDITIONAL PASS after a manual `chmod +x`). Gate 3 not yet run. REQ-23-07 stays open.
- **Phase 24 (macOS native Steam bridge)** — 16/17 plans executed (only 24-10, the human-hardware packaged-build checkpoint, has no SUMMARY.md — its acceptance is recorded directly in 24-UAT.md instead). Gates 0/1/2/3 PASS on real hardware; Gate 4 (Hoard) explicitly out of scope (bridge proxies only ISteamUser + ISteamFriends). Completed 2026-07-21; superseded/parked Phase 22.
- **Phase 25 (multi-host download fan-out)** — 3/3 plans, hardware-verified 2026-07-19 (hosts=3, ~10 MiB/s vs 1.5–2.9 MiB/s baseline).
- **Phase 26 (Steam Key Redemption)** — 5/5 plans, completed 2026-07-20.

**Blocking this milestone's close:** Phase 23's two open gaps (G-23-01, G-23-02) and REQ-23-07. No ship date is recorded because the milestone has not shipped.

---

## v0.8 Tauri Shell — superseded entry

The in-progress entry that stood here from 2026-07-22 (scope: Phase 27, extended with 28–35) was superseded by the shipped entry at the top of this file on 2026-10-16. Its note that `STATE.md`'s `milestone:` had not been advanced past v0.7 was resolved when STATE moved to v0.8.
