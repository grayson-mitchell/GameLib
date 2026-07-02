---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Polish & Enhancements
status: planning
stopped_at: Phase 5 context gathered
last_updated: "2026-07-02T07:58:45.559Z"
last_activity: 2026-07-02 — v1.1 roadmap created (Phases 5-9)
progress:
  total_phases: 9
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-02)

**Core value:** One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.
**Current focus:** v1.1 Polish & Enhancements — roadmap defined, ready to plan Phase 5

## Current Position

Phase: Phase 5 (next up)
Plan: —
Status: Roadmap created; awaiting phase planning
Last activity: 2026-07-02 — v1.1 roadmap created (Phases 5-9)

## v1.1 Phase Map

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 5 | Branding & About Polish | BRAND-02, BRAND-03, BRAND-04, APP-01 | Not started |
| 6 | Library & Game Status UX | LIB-05, LIB-06, GAME-05 | Not started |
| 7 | Game Details Enrichment | DETAIL-01, DETAIL-02 | Not started |
| 8 | New Steam Surfaces | STORE-01, CONSOLE-01 | Not started |
| 9 | Quality Gate | QA-01 | Not started |

## Performance Metrics

**Velocity (v1.0):**

- Total plans completed: 15 (phases 1-4)
- Average duration: ~5-15 min/plan
- Total execution time: ~5 days (2026-06-24 → 2026-06-29)

**By Phase (v1.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | - | - |
| 02 | 6 | - | - |
| 03 | 4 | - | - |
| 04 | 2 | - | - |

**v1.0 Detail Log:**

| Phase 01 P03 | 8min | 3 tasks | 8 files |
| Phase 02-steam-library P01 | 4min | 3 tasks | 5 files |
| Phase 02-steam-library P02 | 15min | 2 tasks | 3 files |
| Phase 02-steam-library P03 | 5min | 2 tasks | 3 files |
| Phase 02-steam-library P04 | 2min | 2 tasks | 4 files |
| Phase 02-steam-library P05 | 5min | 3 tasks | 9 files |

**v1.1 Trend:**

- Plans completed: 0
- Trend: —

*Updated after each plan completion*

## Accumulated Context

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

### Pending Todos

None yet.

### Blockers/Concerns

None — v1.0 complete, v1.1 roadmap defined, ready to execute.

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

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Game Details | DETAIL-03: Linux ProtonDB compat overlay | Post-v1.1 | v1.1 requirements |
| Settings | API-01: Copy-to-clipboard on API key field | Post-v1.1 | v1.1 requirements |

## Session Continuity

Last session: 2026-07-02T07:58:45.554Z
Stopped at: Phase 5 context gathered
Next: `/gsd:plan-phase 5` to plan Branding & About Polish
