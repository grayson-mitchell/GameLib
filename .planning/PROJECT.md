# GameLib

## What This Is

GameLib is a public fork of Heroic Games Launcher that adds Steam as a first-class supported platform. Where Heroic covers Epic Games, GOG, and Amazon Games, GameLib extends this with full Steam library integration — browse, install, and launch Steam games from the same interface. It targets gamers who want a single unified launcher instead of switching between clients.

## Core Value

One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.

## Current State

**Shipped: v0.9 Steam Bridge & Engine — 2026-11-06** (Phases 51–60; `package.json` still 0.8.0). On macOS, Windows-only Steam games now run against the user's native Mac Steam client through the bridge, with no Windows Steam client in a bottle. That includes SteamStub/DRM-wrapped titles, games that need web-API auth tickets, online multiplayer in both bridge modes, and Mac Steam's own Shift+Tab overlay. When CrossOver is missing, its trial has expired or it is broken, a pinned Wine-Staging + DXVK build managed by GameLib takes over. GameLib no longer opens an authenticated Steam logon at launch, browse or Play, so Mac Steam's Friends list stays signed in. Detected known fixes can be shared through an opt-in relay. See `MILESTONES.md` and `milestones/v0.9-*`.

**The v0.9 close was verified, with tech debt.** All 10 phases passed verification, and the audit (`milestones/v0.9-MILESTONE-AUDIT.md`) is `tech_debt` with no blockers: requirements 17/17, integration 8/9, flows 7/7. The one partial seam is S9 (install-time bottle engine vs DRM mode). 782 open planning artifacts were acknowledged and deferred without markers; see `STATE.md › Deferred Items`.

**Earlier milestones:** v0.8 Tauri Shell (shipped 2026-10-16, override closeout) and v0.1 Steam Platform are archived in `milestones/`. v0.2–v0.6 are recorded as shipped in `MILESTONES.md`, and their phase directories are under `milestones/v0.N-phases/`. v0.7 Steam Native Install was never formally closed (Phase 23 gaps G-23-01/G-23-02 are open).

<details>
<summary>Current State as it stood before the v0.9 close (v0.8 entry and per-phase v0.9 notes)</summary>

**Shipped: v0.8 Tauri Shell — 2026-10-16** (`package.json` 0.8.0). GameLib now runs on a Rust/Tauri v2 shell with a headless Node sidecar; the Electron build was removed in Phase 35 (2026-09-01). The milestone covered Phases 27–50: the incremental IPC port, cross-platform packaging with a fork-pointed update feed, embedded login and store webviews, the card-tab navigation and library-filter redesign, Steam install-time bottle parity, Humble key identity and the unified keys screen, the native Winetricks UI, and cross-store signed-out/offline mode. See `MILESTONES.md` for the entry and `milestones/v0.8-*` for the archives.

**The v0.8 close was an override closeout, not a verified one.** 26 of 45 phases were not both complete and verified; 429 open planning artifacts were acknowledged (not resolved) and 140 evidence-table rows in five archived ledgers stay open in `audit-open`. The full disclosure is in `STATE.md › Deferred Items`.

**Phase 52 (bridge-backed steamclient.dll for SteamStub titles) complete 2026-10-25 against an amended done-when.** The forwarder reaches the native bridge (HELLO), and GameLib shows an honest in-app notice when the stub rejects the launch, with no `steam://run` fallback. Verification passed 7/7. The original goal, Grim Dawn reaching its main menu, was not met; it is deferred to the static-RE decision todo. Bridge-verified is not claimed.

**Phase 55 (Steam bridge callback delivery for the web-API auth ticket) complete 2026-10-26.** `GetAuthTicketForWebApi` is forwarded to Mac Steam; the helper queues callback 168 via manual dispatch and serves it on CONTROL slot 6; the shim records `RegisterCallback` registrations and dispatches from `RunCallbacks` using the measured MSVC `Run(void*)` slot (x64 + x86 measured; x86 dispatch not yet executed live). Live gate PASS: Abiotic Factor (427410) reaches an interactive main menu with an EOS Connect login (item-4 literal pinned by operator decision post-run). Verification passed; code review 0 critical / 5 warning.

**Phase 54 (no authenticated Steam logon at launch, browse or Play) complete 2026-10-28.** Launch shows the cached library; public app data comes from an anonymous CM session; Refresh, sign-in and installs log on through one gated entry point that, on macOS, takes Mac Steam offline around the logon and back online afterwards (a guided Go Offline dialog when Steam refuses, e.g. with a game running). An owed-goonline marker repairs Steam at quit, shell loss or the next boot if GameLib dies mid-wrap. Mac live gate PASS 13/13, re-run on the post-review-fix build (items 5-13 pass; an item-11 slow-logon shutdown race found and fixed in `95a89d8d3`). Verification passed 6/6; code review 1 critical / 9 warning, all fixed. A no-logon Refresh (MobileApp token + Web API) was considered and deferred by the user.

**Phase 56 (bridge steamclient layer — DRM mode for SteamStub titles) complete 2026-10-29.** SteamStub-wrapped titles launch through the native Mac Steam bridge with no Windows Steam client: Valve's genuine `steamclient64.dll` is fetched from the CDN onto the user's machine (now at install time), its exports trampolined to `lsteamclient` in a cloned CrossOver runner, and the game's own `steam_api` runs. Third live gate PASS: Grim Dawn (219990) reached its menu on the first Play of a fresh bottle with only Mac Steam running and is bridge-verified on a game-originated `GetSteamID` call; Raft and Ranch Simulator also verified; the stage session's timeout → kill → retry path was proven live with a forced 300 ms timeout. Verification passed 2/2 after three gap-closure rounds (34 plans). Code review 0 critical / 3 warning (stale card status when no progress was sent, ineffective `unref()` on stage listing children, inconsistent exe containment policy) left advisory. CEG titles stay out of scope.

**Phase 57 (opt-in known-fix sharing via relay) complete 2026-11-02.** A new macOS-only General setting, **Share detected game fixes** (off by default), sends a detected 32-bit Mac build, Steam CEG DRM, or a wrong curated 32-bit entry (appId, key, add/remove, GameLib version; no user id, title, paths or logs) to a Cloudflare Worker relay at `gamelib-fix-relay.gamelib.workers.dev`. The relay validates a strict payload, rate-limits per hashed IP (IPv6 by /64) and a daily creation cap, looks the title up from Steam, and opens one PR per appId on `grayson-mitchell/known-fixes` with a seed-style `notes.<key>`; an operator-closed PR suppresses that report. Live gate PASS 5/5 (Dungeons of Dredmor → known-fixes PR #1; reinstall sent nothing; toggle off sent nothing). Fixed along the way: the Mach-O check probed the first `Contents/MacOS` entry instead of `CFBundleExecutable`. Verification passed 6/6; code review 3 critical / 10 warning, criticals and five warnings fixed and redeployed, WR-04/05/06/09/10 left advisory.

**Phase 58 (Steam bridge multiplayer) complete 2026-11-01.** A multiplayer title run through the macOS native bridge can host and join an online session with a second Steam account in both bridge modes. TCP shim mode (Schedule I: Free Sample) passed its live re-gate in both directions: the Mac hosts and invites from GameLib's friend-picker raised over the fullscreen game, and the Mac joins a PC host from a Mac Steam invite. DRM mode (Raft) passed in both directions. The native helper now serves concurrent connections from one `poll()` loop. Follow-ups: review WR-01 (the picker stops opening after 16 '+' presses per session) and WR-02..05, and the unnamed callback 1298 on the join path.

**Phase 59 (Steam engine fallback when CrossOver is unavailable) complete 2026-11-03.** A Windows Steam title on the macOS native bridge still launches when CrossOver is missing, its trial has expired for that bottle, or it is broken. GameLib falls back to one pinned Wine-Staging + DXVK build that it installs and manages itself, in the game's existing bridge bottle. CrossOver stays first choice. Every CrossOver launch first runs `--demo-status`, retried once on a transient failure, and CrossOver launches always run under a timeout. A switch back to CrossOver strictly restores the bottle's DXVK state. Re-verification 6 found 13/13 roadmap truths after six gap-closure rounds (53 plans), and re-UAT 6 passed live. Follow-ups: review WR-01 (the strict restore's "already absent" tolerance reads truncated output), the joined-second-Play single flight (old WR-03), and ten jest suites that were already failing on main before round 6.

**Phase 60 (Steam overlay in bridged games on macOS) complete 2026-11-04.** Pressing Shift+Tab in a game GameLib launches through the macOS bridge opens Mac Steam's own overlay, drawn correctly and accepting clicks. GameLib injects the user's `steamloader.dylib` and `gameoverlayrenderer.dylib` through `CX_ENV` on a re-signed CrossOver clone, or through env on the Wine-Staging fallback. A vendored copy of NotProton's GPLv3 `overlay_shim.m` fixes 10-bit and Metal 4 layers. The G1 gameplay-input gap was closed from live evidence. The 60-18 experiment returned X-RELEASE+BLOCK, so GameLib's own `overlay_input.dylib` releases winemac's 1x1 cursor confinement and blocks game input while the overlay is open, then replays the capture on close. The open/close signal is Mac Steam's callback 331, relayed from the bridge helper as a Darwin notification. Live re-gate PASS 8/8 (items 10–17: Schedule I, The Planet Crafter, Manor Lords, Grim Dawn DRM, settings, the in-app notice, and Staging with and without the fix). Verification passed 6/6 after gap closure (20 plans). Code review: 0 critical / 6 warning, left advisory. Follow-ups: WR-01 (a missed overlay close leaves game input blocked, because production has no safety timeout), WR-02 (the probe and fix loaded together break the fix), the toast polish todo, and the tests-scope lint ceiling breach (665 > 661) that predates the gap run.

**Earlier milestones:** v0.1 Steam Platform (shipped 2026-06-29, archived), v0.2 Polish, v0.3 Humble Bundle, v0.4 Compatibility Data, v0.5 macOS Compat Runtime, v0.6 Store Search (all recorded shipped in `MILESTONES.md`, never archived — their phase directories 5–26 stay under `.planning/phases/`), and v0.7 Steam Native Install (never formally closed — Phase 23 gaps G-23-01/G-23-02 open).

</details>

## Next Milestone Goals

Not yet defined. Run `/gsd-new-milestone`. Candidates, in no decided order:

- **Unassigned phases 61–64** (0 plans each): a unified macOS engine control for every store (61, extends Phase 59), module boundaries and decomposition (62), the Rust migration pattern starting with the executable scanners (63), and a UI to edit themes (64).
- **v0.9 tech debt the audit ranks highest:** S9 (call `prepareBottleForEngine` in the DRM branch, or refuse); 57 WR-09 (the network-facing relay reads an unbounded body when `Content-Length` is missing); 56 WR-02 (an execFile handle holds the sidecar exit up to 3 s); 60 WR-01 (a missed overlay close leaves game input blocked); stale 52/53/58 verification and UAT records; the `macArchKnownFixRouting` failure and the three pre-existing failing sidecar suites.
- **Carried from v0.8:** the 26 unverified v0.8 phases, Phase 47 (IsThereAnyDeal search), Phase 34.7 (Epic device-auth), Phase 23 gaps G-23-01/G-23-02, unsigned Windows releases, and the blank-render-on-one-launch-in-four todo.
- **Planning hygiene:** an acknowledge writer (or scanner change) so `audit-open` stops resurfacing deferred items. The 738 quick tasks with an unreadable SUMMARY status are the bulk of them.

<details>
<summary>Next Milestone Goals as written at the v0.8 close</summary>

Not yet defined — run `/gsd-new-milestone`. Candidates carried out of v0.8, in no decided order:

- **Verification debt**: the 26 unverified v0.8 phases (Phase 27 has no VERIFICATION.md; 28/30/32/33/34/34.13/35 `human_needed`; 50 `gaps_found` on the G-50-16 timeout banner), the owed macOS re-runs (Phase 45 Winetricks live gate FAILED 2026-10-10; Phase 50 UAT Item 16), and the still-unstarted Phase 9 Quality Gate.
- **Phase 47** (CheapShark → IsThereAnyDeal store search migration) and **Phase 34.7** (Epic device-auth, on hold) — both carried forward unplanned.
- **Phase 23 gaps** G-23-01 (blocked depot key aborts the install) and G-23-02 — the open v0.7 items.
- **Windows releases ship unsigned** (no certificate enrolled; parked 2026-10-08) and the packaged app's blank-render-on-one-launch-in-four todo.
- The 140 un-markable table rows: either a gsd-core scanner change or a decision to restructure the five ledgers.

</details>

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
- ✓ Steam as a browsable storefront in the Stores tab; Steam games in Console mode (ENH-002, ENH-006) — v0.2 Phase 8
- ✓ Supported platforms and a macOS compatibility rating in game details (ENH-004, ENH-005; AppleGamingWiki source later replaced by CodeWeavers) — v0.2 Phase 7, v0.4 Phase 16
- ✓ Keys-waiting / giftable-spares views, guided claim flow, store overlay badges and expiration alerts (HVIEW/HCLAIM/HSTORE-01) — v0.3 Phases 13–15
- ✓ Windows-only Steam games run on macOS through a GameLib-managed CrossOver/Wine bottle; 32-bit detection and routing; offline CrossOver compatibility index with medal badges — v0.5 Phases 17–19
- ✓ Aggregated store search with owned-badges — v0.6 Phase 20
- ✓ In-process Steam depot download with real progress, StateFlags=4 full-ownership installs, a macOS native steam_api bridge, multi-host CDN fan-out, and in-app Steam key redemption — v0.7 Phases 21, 23–26 (milestone never formally closed; G-23-01/G-23-02 open)
- ✓ Rust/Tauri v2 shell + Node sidecar with real OS-keyring token storage; every IPC channel re-plumbed; Electron build removed — v0.8 Phases 27–35
- ✓ Windows/Linux/macOS packaging with signing, notarization and a fork-pointed auto-update feed; arm64-only macOS runners; onedir Python runners — v0.8 Phases 34, 34.9, 34.16, 34.18
- ✓ Embedded login webview with cookie read and macOS modal attachment; in-app store/wiki browsing; Rust-managed WKWebView for the Epic store — v0.8 Phases 34.4.1, 34.4.2, 40, 50
- ✓ Card-tab navigation replacing the sidebar; library filter panel; onboarding tour re-anchored; focus row — v0.8 Phases 34.10–34.12, 48
- ✓ Steam install-time wine/bottle form at GOG parity; platform-row depot signal and sync integrity; login-to-Steam crossfade; depot-decode / false-delisted defect cluster — v0.8 Phases 34.13–34.15, 36, 37
- ✓ Evidenced Humble key platform identity; unified Humble Keys screen — v0.8 Phases 42, 43
- ✓ Native in-app Winetricks UI (live gate re-run owed); Windows single-instance guard + `gamelib://` deep link; cross-store signed-out/offline mode — v0.8 Phases 45, 46, 49
- ✓ Native Steam bridge widened to most Windows-only titles on macOS: more interface proxies, scan-derived eligibility, modern-SDK exports and the flat API — v0.9 Phases 51, 53
- ✓ SteamStub/DRM-wrapped titles run through the bridge with no Windows Steam client (genuine Valve `steamclient64.dll` from the CDN, trampolined to `lsteamclient`) — v0.9 Phases 52, 56
- ✓ No authenticated Steam logon at launch, browse or Play; Mac Steam Friends stays signed in — v0.9 Phase 54
- ✓ Web-API auth-ticket callback delivery and bridge multiplayer (host/join in both bridge modes) — v0.9 Phases 55, 58
- ✓ Opt-in sharing of detected known fixes through a relay to the known-fixes repo — v0.9 Phase 57
- ✓ Steam engine fallback (pinned Wine-Staging + DXVK) when CrossOver is unavailable — v0.9 Phase 59
- ✓ Mac Steam's Shift+Tab overlay in bridged games — v0.9 Phase 60

### Active

- [ ] Formal Nyquist validation pass for shipped phases (Phase 9 Quality Gate — never started)
- [ ] Verification of the 26 v0.8 phases closed without a passed VERIFICATION.md (see Next Milestone Goals)
- [ ] Store search on IsThereAnyDeal instead of CheapShark (Phase 47 — unplanned)
- [ ] Epic device-auth single sign-in path (Phase 34.7 — on hold)
- [ ] Phase 23 G-23-01 / G-23-02 (blocked depot key; resumed-install progress never reaches 100%)
- [ ] One per-game Engine control for Windows games from every store on macOS (Phase 61)
- [ ] v0.9 audit seam S9: a DRM-mode launch must not run over a bottle initialised by the fallback engine

### Future

- [ ] Linux compatibility rating overlay on game art via ProtonDB (follow-up to ENH-005)
- [ ] Copy-to-clipboard on the API key field (ENH-001 — deferred, dropped from v0.2)

### Out of Scope

- Other new platforms (Ubisoft Connect, itch.io, Xbox) — Steam first, others later
- Replacing Steam client functionality (friends, community, overlay) — launcher use only. v0.9 Phase 60 does not contradict this: it surfaces Mac Steam's own overlay in bridged games and reimplements none of it
- Humble in-app checkout / purchasing — store surface is read-only + deep-links (v0.3)
- One-click activation for non-Steam Humble key types (Epic/Ubisoft/GOG/…) — link out instead (v0.3)
- Automated/unattended bulk redemption of Humble keys — user-initiated + throttled only (v0.3)
- Managing DRM-free Humble downloads (Humble-hosted installers) — key-focused for now, later phase (v0.3)

## Context

- **Origin**: forked from Heroic Games Launcher v2.22.0 (https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher); no longer tracks upstream (see Constraints)
- **Architecture** (since v0.8): Rust/Tauri v2 shell (`src-tauri/`) + headless Node sidecar built as a SEA (`meta/buildSidecarSea.ts`) over stdio JSON-RPC + React/TypeScript renderer; store managers in `src/backend/storeManagers/` (gog, legendary/Epic, nile/Amazon, steam, humble, sideload). The Electron build was removed in Phase 35.
- **State at v0.9 close (2026-11-06)**: 2,456 commits over 21 days since the v0.8 tag; 1,299 files changed outside `.planning/` (+342,931 / −27,737). The macOS Steam path is now the native bridge in per-game bottles, with CrossOver first and a pinned Wine-Staging + DXVK fallback. The audit's test-health notes (`macArchKnownFixRouting`, three pre-existing failing sidecar suites) are unverified.
- **State at v0.8 close (2026-10-16)**: 6,240 commits in the milestone over 88 days; jest suites green at zero headroom on the lint ceilings; `pnpm i18n` emits zero warnings across 43 offered locales; 140 evidence-table rows in five archived ledgers remain open in `audit-open` by tool limitation.
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
| **Port to Tauri v2** (Rust shell + Rust seam + Node sidecar) — v0.8, phases 27–35 | Three reasons, recorded 2026-08-02 because none were written down and the absence kept re-opening the question: (1) **Learning** — going through a real end-to-end port is itself a goal, so difficulty is part of the value rather than only a cost; (2) **Architecture** — a cleaner shell/backend separation than Electron's main/renderer split; (3) **Ownership** — GameLib has diverged far enough from Heroic v2.22.0 that "a fork tracking upstream" no longer describes it, which is also what makes the mergeability constraint above worth less than it was when written. **Accepted cost, stated explicitly:** upstream Heroic changes are Electron-shaped and must be re-ported through the sidecar seam by hand, permanently. | ✓ **Shipped in v0.8 (2026-10-16)** — the port completed and the Electron build was removed in Phase 35 (2026-09-01); the cutover was verified against a genuine release artifact. ⚠️ Revisit the verification half: the milestone closed as an override with 26 of 45 phases lacking a passed VERIFICATION.md. Earlier note (2026-08-02): **121 of 201 IPC channels** ported. Porting is fast (28 → 121 in ~8 days); **verification is the cost driver**. All 8 WKWebView-vs-Chromium divergences found so far were found by a human driving the UI, none by the ~3,500-test suite (see memory `live-gate-beats-green-suite-three-times`). Phase 34.5's live gate has failed twice and carries 10 open untested items. |
| Steam store manager follows existing pattern | `src/backend/storeManagers/` pattern is clean; new `steam/` directory keeps parity with gog/legendary/nile | ✓ Good — `satisfies Record<Runner, LibraryManager>` made it first-class |
| Start with Manage Accounts | Account auth is the prerequisite for everything else; unblocks library, install, launch | ✓ Good — auth-first sequencing held |
| `steam-session` + `steam-user` for auth/library | Pure-JS, no native rebuild; handles QR/credentials/SteamGuard + owned-apps | ⚠️ Revisit — works, but session lifecycle (QR vs credential vs DeviceConfirmation polling) caused several v0.1 bugs; needs careful listener handling |
| Delegate install/launch/uninstall to `steam://` | Steam client is a valid assumption for this audience; honors Steam's own Proton/launch options | ✓ Good — fire-and-forget; ACF poller owns real status |
| ACF poller owns Steam operation status | `steam://` returns immediately; appmanifest StateFlags reflect real install/uninstall state | ✓ Good — fixed the premature-notification badge flash |
| D-30 amended (Phase 14 UAT): server truth = revealed-ness + expiry only | Humble's reveal endpoint is `/humbler/redeemkey` and populating `redeemed_key_val` means REVEALED, not Steam-activated; Humble cannot know Steam activation. REDEEMED is a local-only, always-undoable overlay from Mark-as-redeemed. Expiry → UNREDEEMABLE precedence (D-30) is unchanged. | ✓ Fixed UAT test 2 (CR-01) + test 3 (WR-02) at their shared root cause; deleted the locallyRedeemedPending / WR-02 keep-visible / server_confirmed_ack compensation machinery. |
| **Focus row replaces the Settings `Library Top Section` dropdown** (Phase 48, 2026-10-09) | One persisted `{kind,value}` pick from the Games tier-2 panel renders a horizontal strip above the grid; `Recent Games to Show` removed and the row sized by what fits. Mid-phase operator rulings amended the SPEC: strip cards match the grid's column width (not a fixed 156px), the controller-mode card keeps its mouse-mode geometry globally, hover wears the console-style ring, and controller mode keeps hiding the card's hover-action buttons (pre-existing upstream behaviour, ruled intended). Four live-gate rounds (macOS WebKit numeric, Windows controller by eye) closed 12 gaps. | ✓ Good — 12/12 UAT, verification 10/10, 64 threats closed; the one-ring and width-parity invariants now have WebKit-measured numbers |
| **One consolidated sign-in notice across five stores, probed once at boot** (Phase 49, 2026-10-09) | A bounded 45 s parallel probe pass after READY classifies Epic/GOG/Amazon from real runner output, Steam/Humble from keyring presence, and latches only a proven `expired` per store; one pure selector (`resolveSignInState`: latched flag beats a missing session, `unknown` never surfaces) drives both the Library rows and the five Manage Accounts tiles; not-connected rows are dismissible and persisted, expired rows are not; Epic launches `--offline` when expired. The macOS live gate ran 9 launches on real accounts: runner strings A1/A2 confirmed, Keychain Deny and an ignored prompt degrade to `unknown` (45.009 s), the warm sidecar drains in 2.4 s. Two gate-found renderer defects fixed same day (dismiss hydration at mount; Epic user info rebuilt on every mount). Amazon zero-installed no-op accepted as a spec boundary; A3/A6 deferred (nile encrypts its tokens). | ✓ Good — UAT 10/11 pass + 1 deferred, verification 9/9, 46 threats closed, Nyquist compliant; four review warnings and the Amazon arm remain as triaged todos |

| **Bridged games talk to native Mac Steam, never a bottled Windows Steam client** (v0.9, Phases 51–60) | One Steam client the user already runs. Bottled Steam is a narrow fallback, and only DRM might justify it. Phase 56 kept even SteamStub titles on the bridge by fetching Valve's genuine `steamclient64.dll` and trampolining it. | ✓ Good. Phases 51–60 all verified; known-bad titles stay known-bad and are not rerouted to bottled Steam |
| **No authenticated CM logon outside explicit user actions** (v0.9, Phase 54) | Any authenticated steam-user logon landing while Mac Steam is online signs its Friends list out. Public data goes through an anonymous session, and Refresh, sign-in and installs go through one gated entry point. | ✓ Good. Live gate 13/13; `steamAuthSessionPolicy.test.ts` rules A–K enforce it |
| **CrossOver first, one pinned Wine-Staging + DXVK build as fallback** (v0.9, Phase 59) | CrossOver trial expiry and breakage were stranding bridged titles. One pinned build per release keeps the support surface small; overrides are advanced and unsupported unless CrossOver. | ⚠️ Revisit S9: the engine is chosen at install, before DRM mode is known |

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
*Last updated: 2026-11-06 after the v0.9 Steam Bridge & Engine milestone (verified closeout with tech debt). Previous footer, 2026-11-04 after Phase 60 (Steam overlay in bridged games on macOS), verification 6/6, live re-gate 8/8 PASS. Previous footer, 2026-11-03: after Phase 59 (Steam engine fallback when CrossOver is unavailable), re-verification 13/13, re-UAT 6 PASS. Previous footer, 2026-11-02: after Phase 57 (opt-in known-fix sharing via relay), live gate PASS. Previous footer, 2026-11-01: after Phase 58 (Steam bridge multiplayer), live gates PASS in both bridge modes. Previous footer, 2026-10-29: after Phase 56 (bridge steamclient layer — DRM mode for SteamStub titles), live gate PASS. Previous footer, 2026-10-28: after Phase 54 (no authenticated Steam logon at launch, browse or Play), live gate PASS. Previous footer, 2026-10-26: after Phase 55 (Steam bridge callback delivery for the web-API auth ticket), live gate PASS. Previous footer, 2026-10-25: after Phase 52 (bridge-backed steamclient.dll for SteamStub titles), complete against the amended done-when. Previous footer, 2026-10-16: after the v0.8 Tauri Shell milestone (override closeout). Earlier footer, 2026-10-09: after Phase 49 (Cross-store signed-out / offline mode) COMPLETE: 12/12 plans, macOS live gate run once (10/11 pass, item 5 deferred), verification passed 9/9, code review 0 critical / 4 warning, 46 threats closed, Nyquist validated.*
