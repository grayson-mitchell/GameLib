# Milestones

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

## v0.8 Tauri Shell (In progress — no ship date)

**Scope:** Phase 27 — a walking-skeleton spike proving a Tauri v2 (Rust shell + headless Node sidecar + stdio JSON-RPC transport) rearchitecture end-to-end against GameLib's real Steam store-manager code, while leaving the existing Electron build completely untouched.

**Status:** Phase 27 (Tauri Shell Walking Skeleton) is **complete — 5/5 plans**, all with matching SUMMARY.md, completed 2026-07-21. `SEAM.md` documents the ported-vs-stubbed boundary and an incremental-port checklist; the real `safeStorage` keyring port (spike 011's `keyring` crate path) is the next blocking increment before any token-writing channel can be wired, per STATE.md's "Open work" list.

**Note on milestone status:** `STATE.md`'s `milestone:` frontmatter still reads `v0.7` as of this writing — it has not been formally advanced to `v0.8` even though Phase 27 (filed here as v0.8) is done. This milestone is recorded as open/in-progress rather than shipped because that advancement has not happened; no ship date is fabricated.
