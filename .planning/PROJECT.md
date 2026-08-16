# GameLib

## What This Is

GameLib is a public fork of Heroic Games Launcher that adds Steam as a first-class supported platform. Where Heroic covers Epic Games, GOG, and Amazon Games, GameLib extends this with full Steam library integration — browse, install, and launch Steam games from the same interface. It targets gamers who want a single unified launcher instead of switching between clients.

## Core Value

One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.

## Current Milestone: v0.3 Humble Bundle Integration

**Goal:** Add Humble Bundle as an integrated source in GameLib, focused on key management — never re-buy or lose a Humble key — with ownership-aware dedup against the existing Steam library.

**Target features:**
- Humble auth — email/password + "Humble Guard" emailed one-time code; persisted, encrypted session (no OAuth)
- Library sync — fetch orders, enumerate keys, normalize into the 5-state key lifecycle model, aggressively cached
- Claim-status classification — UNPICKED / UNREVEALED / REVEALED / REDEEMED / UNREDEEMABLE, with a locally-persisted REVEALED flag
- Ownership-aware dedup — cross-reference keys against the unified library (Steam first); collapse already-redeemed Steam keys onto their existing entry
- "Keys waiting" view — unowned + unredeemed keys, sorted by expiration urgency
- Guided claim flow — explicit per-key reveal → deep-link to Steam activation → mark redeemed, with an audit record
- Giftable-spares view — owned-elsewhere + unrevealed keys, surface/copy the Humble gift link
- Store overlay — Owned / Unclaimed-key / New badges; read-only bundle listing; "Buy on Humble" deep-links
- Expiration & urgency alerts — recomputed each sync
- Non-Steam key handling — link out to the target platform; out of scope for one-click claim in v1

> **v0.2 (Polish & Enhancements) remains open** — Phase 9 (Quality Gate / Nyquist validation) and Phase 7 manual UAT are still outstanding, plus active v0.2 requirements below. v0.3 was started alongside v0.2 by explicit choice; v0.2 phase artifacts are preserved in `.planning/phases/`.

## Requirements

### Validated

- ✓ Add and manage a Steam account in Manage Accounts (QR + credentials/SteamGuard) — v0.1
- ✓ Browse the full Steam library from within GameLib — v0.1
- ✓ Steam games appear alongside Epic/GOG/Amazon in the library view — v0.1
- ✓ Install Steam games from GameLib (via `steam://`) — v0.1
- ✓ Launch Steam games from GameLib (via `steam://rungameid`, Proton delegated) — v0.1
- ✓ Uninstall Steam games from GameLib — v0.1
- ✓ Steam install state, playtime, and store metadata in the library — v0.1
- ✓ GameLib branding (Heroic → GameLib) — v0.1
- ✓ macOS menu-bar tooltip reads "GameLib" (BUG-001) — v0.2 Phase 5
- ✓ GameLib release notes on the version link, linking to the upstream Heroic release (ENH-003) — v0.2 Phase 5
- ✓ Updated README (ENH-007) — v0.2 Phase 5
- ✓ Residual backend "Heroic" log/dialog strings → GameLib — v0.2 Phase 5
- ✓ "Playing" status badge during a Steam session (GAME-05) — v0.2 Phase 6
- ✓ Real install size in the download-manager queue (LIB-06, replaces `'?? MB'`) — v0.2 Phase 6
- ✓ Playtime visible for Steam games (LIB-05, met via game-details page per D-01; grid-tile display descoped) — v0.2 Phase 6
- ✓ Delisted Steam games wired into the frontend availability path so the "non-available" filter works (LIB-07) — v0.2 Phase 08.1
- ✓ Delisted game renders a greyed "Game no longer available" tile with install disabled (LIB-08) — v0.2 Phase 08.1
- ✓ Tri-state Hidden / Non-available Library filters with "only-show" modes (LIB-09) — v0.2 Phase 08.1
- ✓ Humble Bundle account connect/disconnect from Manage Accounts via embedded WebView login, encrypted session persistence + expiry reconnect (HACCT-01/02/03) — v0.3 Phase 10
- ✓ Humble C5 adapter boundary empirically validated against the live API (axios transport; gamekeys + order-detail + steam_app_id schema PASS; identity endpoint 404 → advisory) — v0.3 Phase 10
- ✓ Humble key inventory synced + classified into the 5-state model with fail-soft caching and a read-only Humble Keys page (HSYNC-01/02/03/04; live UAT on a real 25-gamekey account) — v0.3 Phase 11
- ✓ Humble keys cross-referenced against Steam ownership (exact AppID + 85% fuzzy fallback with DLC guard), owned-badges with fuzzy-only user override, and redeemed matched keys annotated with Humble origin on the Steam game-details page (HDEDUP-01/02; human-verified in live app) — v0.3 Phase 12

### Active (v0.2 — in scope)

- [ ] Steam as a browsable storefront in the sidebar Stores section (ENH-002)
- [ ] Supported platforms shown in game details (ENH-004)
- [ ] macOS compatibility rating overlay on game art via AppleGamingWiki (ENH-005)
- [ ] Steam games available in Console mode (ENH-006)
- [ ] Formal Nyquist validation pass for shipped phases

### Future

- [ ] Linux compatibility rating overlay on game art via ProtonDB (follow-up to ENH-005)
- [ ] Copy-to-clipboard on the API key field (ENH-001 — deferred, dropped from v0.2)

### Out of Scope

- Other new platforms (Ubisoft Connect, itch.io, Xbox) — Steam first, others later
- Replacing Steam client functionality (friends, community, overlay) — launcher use only
- Humble in-app checkout / purchasing — store surface is read-only + deep-links (v0.3)
- One-click activation for non-Steam Humble key types (Epic/Ubisoft/GOG/…) — link out instead (v0.3)
- Automated/unattended bulk redemption of Humble keys — user-initiated + throttled only (v0.3)
- Managing DRM-free Humble downloads (Humble-hosted installers) — key-focused for now, later phase (v0.3)

## Context

- **Upstream**: Heroic Games Launcher v2.22.0 (https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher)
- **Architecture**: Electron + React + TypeScript; store managers in `src/backend/storeManagers/` (gog, legendary/Epic, nile/Amazon, sideload)
- **Existing Steam touchpoints**: `steamgrid` (artwork fetching), `shortcuts/nonesteamgame` (add non-Steam games to Steam), Steam Deck detection — none of these are a Steam store manager
- **Why a fork**: Heroic maintainers are explicitly anti-Steam and will not merge Steam support upstream
- **Target audience**: Public distribution — gamers who want one unified launcher

## Constraints

- **Tech stack**: React + TypeScript on a Rust/Tauri shell. **GameLib is an independent project, not a fork tracking Heroic — upstream mergeability is not a constraint.** The constraint originally read "must remain Electron + React + TypeScript to stay mergeable with Heroic upstream improvements". Its Electron half was marked superseded on 2026-08-02 when the v0.8 Tauri rearchitecture (phases 27–35) knowingly traded that mergeability away; **the constraint is retired in full as of 2026-08-07 by operator decision** — GameLib has diverged far enough that "a fork tracking upstream" no longer describes it. **Standing instruction:** do not raise deviation from upstream Heroic, broken mergeability, or harder re-porting of upstream changes as a concern, caveat, or trade-off in planning, review, or ad-hoc work — judge changes on GameLib's own merits. Deliberately borrowing an upstream fix is still fine; it is the *deviation warning* that is retired. This is recorded at length because the constraint previously sat unamended while nine phases of work contradicted it, and it repeatedly resurfaced as a false alarm.
- **Compatibility**: Linux, macOS, Windows (same as Heroic)
- **Steam auth**: RESOLVED in v0.1 — `steam-session` (QR + credentials/SteamGuard refresh token) + `steam-user` (CM connect, owned apps). Pure-JS, no native modules. Steamworks SDK and browser-OpenID approaches rejected (see research).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fork Heroic (not build from scratch) | Heroic already solves multi-store UI, download manager, game config, Linux/Wine — no need to rebuild | ✓ Good — Steam slotted into existing Runner/storeManager patterns cleanly |
| **Port to Tauri v2** (Rust shell + Rust seam + Node sidecar) — v0.8, phases 27–35 | Three reasons, recorded 2026-08-02 because none were written down and the absence kept re-opening the question: (1) **Learning** — going through a real end-to-end port is itself a goal, so difficulty is part of the value rather than only a cost; (2) **Architecture** — a cleaner shell/backend separation than Electron's main/renderer split; (3) **Ownership** — GameLib has diverged far enough from Heroic v2.22.0 that "a fork tracking upstream" no longer describes it, which is also what makes the mergeability constraint above worth less than it was when written. **Accepted cost, stated explicitly:** upstream Heroic changes are Electron-shaped and must be re-ported through the sidecar seam by hand, permanently. | ⏳ In progress — **121 of 201 IPC channels** ported as of 2026-08-02. Porting is fast (28 → 121 in ~8 days); **verification is the cost driver**. All 8 WKWebView-vs-Chromium divergences found so far were found by a human driving the UI, none by the ~3,500-test suite (see memory `live-gate-beats-green-suite-three-times`). Phase 34.5's live gate has failed twice and carries 10 open untested items. |
| Steam store manager follows existing pattern | `src/backend/storeManagers/` pattern is clean; new `steam/` directory keeps parity with gog/legendary/nile | ✓ Good — `satisfies Record<Runner, LibraryManager>` made it first-class |
| Start with Manage Accounts | Account auth is the prerequisite for everything else; unblocks library, install, launch | ✓ Good — auth-first sequencing held |
| `steam-session` + `steam-user` for auth/library | Pure-JS, no native rebuild; handles QR/credentials/SteamGuard + owned-apps | ⚠️ Revisit — works, but session lifecycle (QR vs credential vs DeviceConfirmation polling) caused several v0.1 bugs; needs careful listener handling |
| Delegate install/launch/uninstall to `steam://` | Steam client is a valid assumption for this audience; honors Steam's own Proton/launch options | ✓ Good — fire-and-forget; ACF poller owns real status |
| ACF poller owns Steam operation status | `steam://` returns immediately; appmanifest StateFlags reflect real install/uninstall state | ✓ Good — fixed the premature-notification badge flash |
| D-30 amended (Phase 14 UAT): server truth = revealed-ness + expiry only | Humble's reveal endpoint is `/humbler/redeemkey` and populating `redeemed_key_val` means REVEALED, not Steam-activated; Humble cannot know Steam activation. REDEEMED is a local-only, always-undoable overlay from Mark-as-redeemed. Expiry → UNREDEEMABLE precedence (D-30) is unchanged. | ✓ Fixed UAT test 2 (CR-01) + test 3 (WR-02) at their shared root cause; deleted the locallyRedeemedPending / WR-02 keep-visible / server_confirmed_ack compensation machinery. |

### Deferred / Follow-up

- **steam-user license corroboration** — read license `payment_method === EPaymentMethod.ActivationCode` + `time_created` to auto-mark-redeemed (still undoable) keys revealed on Humble's website before GameLib synced. Interim signal is `ownedElsewhere` + the D-72 owned-note. Scope: future phase (post-Phase-14).

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-16 — Phase 34.14 (Steam platform-row depot signal — distinguish "no Windows build" from "metadata not captured") COMPLETE: the macOS "Install with options…" dialog no longer silently withholds the Windows/wine option from games that have a Windows build. A new pure `resolveDepotAvailability` in `steamPlatformRow.ts` returns `depotSignalResolved` + `windowsDepotOffered` and FAILS OPEN — when the depot signal was never captured it offers Windows rather than concluding "macOS-only" — backed by a 5th `SteamPlatformRowMode` member `'pending'`, two new required verdict booleans threaded from the single shared IPC handler through the probe state machine to the composition root, and a Section-Gating Matrix expanded 96→144. 5 plans, verification 20/20 must-haves, code review 0 critical / 1 warning (fixed with a RED-proof) / 3 info deferred. **The phase's defining lesson came from its own gate, not its code: a UAT can be structurally incapable of observing the thing it exists to test.** The blocking D-08 gate PASSED 20/8/0 across four developer-driven runs (Electron × Tauri, network-up × `appdetails`-blocked), but the two network-up runs could never render the new `'pending'` state at all — the metadata refetch beat dialog-open every time — and the first blocked run couldn't either, because `/etc/hosts` → `127.0.0.1` REFUSES in ~1ms so the 15s timeout path was never taken. Only after re-blocking with an unroutable TEST-NET-3 address (`203.0.113.1`, which silently drops so the fetch reaches its real deadline) did four observations convert from unarbitrable to pass. Those eight rows were recorded `blocked`/`n-a` and NEVER `pass`: marking them pass would have certified a surface that never rendered. Blocking `api.steampowered.com` as the plan specified was also wrong — it kills `steam-user`'s CM login and empties the whole library, testing nothing; only `store.steampowered.com` carries the depot signal. **The gate's most valuable output was four PRE-EXISTING defects it surfaced, none of them 34.14 bugs**, all filed as todos: (1) the Steam library sync captures NO platform data — it only reads the cache, capture is lazy per-game — so "not captured" is a NORMAL-operation state and this phase's fail-open is load-bearing in ordinary use, not merely an outage safety net (operator-raised, then confirmed in source; the single most consequential finding); (2) the "Syncing your Steam library…" spinner has no failure state and is not scoped to Steam, so an unreachable Steam renders it forever and hides other runners' games — the sibling of the already-fixed `steam-refresh-hung-on-startup` bug, which made refresh RUN but never gave it a terminal state on FAILURE; (3) 370 of 380 real cache entries carry `platformsCaptured: true` with NO `is_windows_native` (pre-D-17 residue), so most of the installed base gets a confident "no Windows build" the fail-open cannot rescue — needs a cache-version bump or migration; (4) absent `is_mac_native` is read as "no Mac build", the exact mirror of the conflation this phase fixed, confirmed by inversion across the warm/cold runs. Prior entry: Last updated: 2026-08-09 — Phase 34.10 (navigation shell — horizontal card tabs replace the sidebar) COMPLETE: the left sidebar is retired and replaced by a two-tier navigation shell — tier 1 a horizontal row of card/folder tabs (Manage Accounts, Games, Stores, Settings) whose active tab merges into the content surface, tier 2 a contextual vertical panel, with the Games panel carrying today's filter controls across via `createPortal` so they stay INSIDE `Library`'s provider (rendering `<Header>` in the shell instead would have shown filter controls that silently do nothing, because `LibraryContext`'s `initialContext` supplies a full set of no-op setters). 27 plans across three gap cycles; verification 9/9; blocking live gate **run 4 PASS 5/5** after runs 1-3 scored 2/5, 4/5 and 4/5. The phase's defining lesson: **a shipped fix is not evidence.** F-34.10-03 (an ~8px seam between the tab strip and content) and F-34.10-04 (wordmark/ring reading lower than the tabs) were ONE defect with one cause — an unscoped `.MuiTabs-root { padding-bottom: var(--space-xs) }` in `GamesSettings/index.scss` leaking 8px into every `<Tabs>` in the app — and were declared fixed TWICE before a live measurement contradicted each fix; five separate attempts targeted the wrong property before `220211230` found it. Even then, closure was deliberately withheld because the fix had only been confirmed in an unscored theme, and gap cycle 3 existed purely to measure it in a scored one. Plan 34.10-23 rescoped the root cause and added a repo-wide jest guard against the whole unscoped-selector defect class. Two contract findings recorded: F-34.10-07 and F-34.10-08 — the latter proving that a grep-based gate assertion must be shown to FAIL against a known-bad input before it is trusted to pass, since P11's `^`-anchored grep could never match vite's single-line minified CSS and returned 0 even for the file that DID contain the rule. Carried forward, not fixed: the gamepad focus-scroll regression (NOT ATTEMPTED across all four runs, no controller hardware — a named permanent residual risk, never inferred from the mouse/keyboard result), and two CONFIRMED Critical code-review findings deferred by explicit decision so HEAD keeps matching the gated bundle — CR-01 (`NavTabs/index.scss` uses `var(--navbar-active)` with no fallback; that token is undefined in `gruvbox_dark`, a scored theme) and CR-02 (`-webkit-app-region: drag` was never ported from the retired sidebar, breaking navbar dragging under Electron frameless — likely moot, since Phase 35 deletes Electron). Owed: `/gsd-secure-phase 34.10`. The pill-tab restyle the operator elected mid-run is DEFERRED with REQ-34.10-06's card/folder wording deliberately unchanged. Prior entry: Last updated: 2026-07-27 — Phase 34.3 (Tauri IPC re-plumb slice 6 — shell, files, logs and diagnostics) complete: 29 previously-unported Electron IPC channels now run on the Tauri Node sidecar across three registration modules (21 shell/files/diagnostics, 5 logger/log-upload, 3 clipboard), plus one genuinely new Rust seam — `tauri-plugin-clipboard-manager` with `clipboard_write_text`/`clipboard_read_text` dispatch arms called Rust-side with ZERO renderer capability grant. 13/13 requirements verified. The phase's blocking 5-item live gate (D-13) justified itself by finding two defects no automated layer caught: the SEA sidecar build had been broken since Phase 34.2 by an `i18next-fs-backend` dual-package hazard (nothing had re-run `build:sidecar-sea` since), and `LogFileUploadDialog` claimed "URL copied to your clipboard" while the clipboard was untouched under Tauri — `navigator.clipboard` resolves without writing in WKWebView, so both remaining Web-Clipboard call sites were rerouted onto this phase's own channels. Code review caught a BLOCKER: the D-06 relaunch guard was never released on a FAILED relaunch, leaving the app permanently unquittable; fixed with the missing failed-relaunch test. Item 4 empirically confirmed research's finding that `AppHandle::restart()` fires `RunEvent::Exit` from a worker thread — exactly one sidecar survives a packaged reset, so the feared orphan was an inference research had already disproved and no Rust fix was needed. Live-gate evidence is tester-attested rather than transcript-backed for 4 of 5 items; accepted by the developer and kept visible via `34.3-HUMAN-UAT.md`. Owed: `/gsd-secure-phase 34.3` (must audit the 27 transitive crates disclosed as AR-34.3-01), and carried warning WR-01 (clipboard read logs benign non-text content identically to a transport failure). Prior entry: Last updated: 2026-07-13 — Phase 18 (macOS 32-bit detection, badge & CrossOver routing) complete via 18-06 gap closure (MAC32-04): `forceUninstall()` no longer calls `library.delete()` — it now mirrors the `pollUninstallOnce` keep-entry pattern (`library.set({...existing, is_installed:false, install:{}})`, spread-preserving `mac_arch:'32'`), persists the mutated Map to `steamLibraryStore`, and pushes a badge-preserving `pushGameToLibrary` payload, so the '32' badge survives an i386 CrossOver-recovery/uninstall transition instead of blinking out (the UAT rough edge from 16023237). Regression test asserts `mac_arch:'32'` survives forceUninstall in both the Map and the pushed payload. Verification 5/5 must-haves, no MAC32-01/02/03 regression; steam backend 326/326 tests pass; code review 0 blockers (1 warning: GAP-18-06 persist assertion uses `expect.any(Array)` rather than inspecting contents — direct code trace confirms persist order is correct). Milestone v0.5 (Steam macOS Compatibility Runtime) last phase. Prior entry: 2026-07-10 — Phase 16 (CrossOver Compatibility Rating / CodeWeavers) complete: the extra-info "Crossover rating" row now renders live CodeWeavers CrossOver compatibility data (aggregateRating value + count) as a MUI 5-star display, replacing the stale AppleGamingWiki source (quick 260710-l27). Backend `getInfoFromCodeweavers` does content-based hit/miss detection (VideoGame JSON-LD vs HTTP-200 soft-404), D-04 slugify fixes (apostrophe-drop + roman-numeral normalization) with one fallback slug, and a cacheable EMPTY-marker miss contract; wired into `getWikiGameInfo` (Mac+Linux, title-derived slug, self-heal). Row decoupled from applegamingwiki so it renders on Linux (D-08 — closed a verification gap where `hasWikiInfo` omitted codeweavers, hiding the tab for CodeWeavers-only Linux titles); Wine row unchanged. Human-verified + approved; verification 8/8. Prior entry: 2026-07-09 — v0.3 Phase 14 gap closure (14-07): realigned the claim-state model per D-30 amendment above — `redeemed_key_val` presence now classifies REVEALED (never REDEEMED), REDEEMED is local-only via Mark-as-redeemed and always undoable. Closes UAT tests 2 (CR-01, Redeemed+Undo dropped on sync) and 3 (WR-02, revealed key silently flipped to Redeemed on sync) at their shared root cause; deleted the locallyRedeemedPending / WR-02 keep-visible / server_confirmed_ack compensation machinery. HUMBLE_CLASSIFIER_VERSION bumped 4→5 to reclassify cached rows. Prior entry: 2026-07-08 — v0.3 Phase 14 (Guided Claim Flow) complete: HumbleClaimWizard with danger-gated single-key reveal (no auto/bulk reveal), C2 hard block routing owned games to Giftable Spares, write-ahead audit log before every reveal POST, clipboard + Steam registerkey deep-link + mark-redeemed/undo cycle, non-Steam link-out without one-click activation. Reveal contract live-validated with a disposable key (CSRF required; Electron net.request transport — axios blocked by Cloudflare). HCLAIM-01..05 validated; verification passed 5/5. v0.2 kept open (Phase 9 + Phase 7 UAT outstanding) by explicit choice.*
