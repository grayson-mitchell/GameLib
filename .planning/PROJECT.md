# GameLib

## What This Is

GameLib is a public fork of Heroic Games Launcher that adds Steam as a first-class supported platform. Where Heroic covers Epic Games, GOG, and Amazon Games, GameLib extends this with full Steam library integration — browse, install, and launch Steam games from the same interface. It targets gamers who want a single unified launcher instead of switching between clients.

## Core Value

One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.

## Current State

**Shipped: v0.8 Tauri Shell — 2026-10-16** (`package.json` 0.8.0). GameLib now runs on a Rust/Tauri v2 shell with a headless Node sidecar; the Electron build was removed in Phase 35 (2026-09-01). The milestone covered Phases 27–50: the incremental IPC port, cross-platform packaging with a fork-pointed update feed, embedded login and store webviews, the card-tab navigation and library-filter redesign, Steam install-time bottle parity, Humble key identity and the unified keys screen, the native Winetricks UI, and cross-store signed-out/offline mode. See `MILESTONES.md` for the entry and `milestones/v0.8-*` for the archives.

**The v0.8 close was an override closeout, not a verified one.** 26 of 45 phases were not both complete and verified; 429 open planning artifacts were acknowledged (not resolved) and 140 evidence-table rows in five archived ledgers stay open in `audit-open`. The full disclosure is in `STATE.md › Deferred Items`.

**Phase 52 (bridge-backed steamclient.dll for SteamStub titles) complete 2026-10-25 against an amended done-when.** The forwarder reaches the native bridge (HELLO), and GameLib shows an honest in-app notice when the stub rejects the launch, with no `steam://run` fallback. Verification passed 7/7. The original goal, Grim Dawn reaching its main menu, was not met; it is deferred to the static-RE decision todo. Bridge-verified is not claimed.

**Phase 55 (Steam bridge callback delivery for the web-API auth ticket) complete 2026-10-26.** `GetAuthTicketForWebApi` is forwarded to Mac Steam; the helper queues callback 168 via manual dispatch and serves it on CONTROL slot 6; the shim records `RegisterCallback` registrations and dispatches from `RunCallbacks` using the measured MSVC `Run(void*)` slot (x64 + x86 measured; x86 dispatch not yet executed live). Live gate PASS: Abiotic Factor (427410) reaches an interactive main menu with an EOS Connect login (item-4 literal pinned by operator decision post-run). Verification passed; code review 0 critical / 5 warning.

**Earlier milestones:** v0.1 Steam Platform (shipped 2026-06-29, archived), v0.2 Polish, v0.3 Humble Bundle, v0.4 Compatibility Data, v0.5 macOS Compat Runtime, v0.6 Store Search (all recorded shipped in `MILESTONES.md`, never archived — their phase directories 5–26 stay under `.planning/phases/`), and v0.7 Steam Native Install (never formally closed — Phase 23 gaps G-23-01/G-23-02 open).

## Next Milestone Goals

Not yet defined — run `/gsd-new-milestone`. Candidates carried out of v0.8, in no decided order:

- **Verification debt**: the 26 unverified v0.8 phases (Phase 27 has no VERIFICATION.md; 28/30/32/33/34/34.13/35 `human_needed`; 50 `gaps_found` on the G-50-16 timeout banner), the owed macOS re-runs (Phase 45 Winetricks live gate FAILED 2026-10-10; Phase 50 UAT Item 16), and the still-unstarted Phase 9 Quality Gate.
- **Phase 47** (CheapShark → IsThereAnyDeal store search migration) and **Phase 34.7** (Epic device-auth, on hold) — both carried forward unplanned.
- **Phase 23 gaps** G-23-01 (blocked depot key aborts the install) and G-23-02 — the open v0.7 items.
- **Windows releases ship unsigned** (no certificate enrolled; parked 2026-10-08) and the packaged app's blank-render-on-one-launch-in-four todo.
- The 140 un-markable table rows: either a gsd-core scanner change or a decision to restructure the five ledgers.

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

### Active

- [ ] Formal Nyquist validation pass for shipped phases (Phase 9 Quality Gate — never started)
- [ ] Verification of the 26 v0.8 phases closed without a passed VERIFICATION.md (see Next Milestone Goals)
- [ ] Store search on IsThereAnyDeal instead of CheapShark (Phase 47 — unplanned)
- [ ] Epic device-auth single sign-in path (Phase 34.7 — on hold)
- [ ] Phase 23 G-23-01 / G-23-02 (blocked depot key; resumed-install progress never reaches 100%)

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

- **Origin**: forked from Heroic Games Launcher v2.22.0 (https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher); no longer tracks upstream (see Constraints)
- **Architecture** (since v0.8): Rust/Tauri v2 shell (`src-tauri/`) + headless Node sidecar built as a SEA (`meta/buildSidecarSea.ts`) over stdio JSON-RPC + React/TypeScript renderer; store managers in `src/backend/storeManagers/` (gog, legendary/Epic, nile/Amazon, steam, humble, sideload). The Electron build was removed in Phase 35.
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
*Last updated: 2026-10-26 after Phase 55 (Steam bridge callback delivery for the web-API auth ticket), live gate PASS. Previous footer, 2026-10-25: after Phase 52 (bridge-backed steamclient.dll for SteamStub titles), complete against the amended done-when. Previous footer, 2026-10-16: after the v0.8 Tauri Shell milestone (override closeout). Earlier footer, 2026-10-09: after Phase 49 (Cross-store signed-out / offline mode) COMPLETE: 12/12 plans, macOS live gate run once (10/11 pass, item 5 deferred), verification passed 9/9, code review 0 critical / 4 warning, 46 threats closed, Nyquist validated.*
