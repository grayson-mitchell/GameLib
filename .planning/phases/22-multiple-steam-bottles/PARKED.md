# Phase 22 — PARKED (superseded by Phase 24)

**Status:** PARKED 2026-07-21
**Superseded by:** Phase 24 — macOS native Steam bridge (out-of-process `steam_api` proxy)
**Plans:** 8 written, 0 executed — all artifacts retained, nothing deleted

## Why

Phase 22 (Steam Game Families / multiple bottle configs) existed to work around a
constraint that Phase 24 removed. The premise was that different Steam games need
different CrossOver bottle configurations, so GameLib would have to provision and
manage a *set* of bottles keyed by game family.

Phase 24 shipped a native `steam_api` proxy: a drop-in shim in a single shared bridge
bottle talks out-of-process to the real native macOS Steam client. There is no bottled
Windows Steam client to configure per family, and one shared bridge bottle
(`DEFAULT_BRIDGE_BOTTLE_NAME`, decision D-03) serves all bridge-eligible games. The
per-family bottle matrix Phase 22 was designed to manage no longer has anything to
manage.

This was anticipated: the bridge was already recorded in STATE.md as "Phase 22's
preferred successor" before Phase 24 was executed.

## What was retained

Everything in this directory stays as-is:

- `22-01-PLAN.md` .. `22-08-PLAN.md` — the 8 unexecuted plans
- `22-SPEC.md`, `22-CONTEXT.md`, `22-RESEARCH.md`, `22-PATTERNS.md`,
  `22-UI-SPEC.md`, `22-VALIDATION.md`, `22-DISCUSSION-LOG.md`

## If this is ever unparked

The parts of Phase 22 that could still have value are the ones *not* about bottle
multiplicity — chiefly any per-game launch-configuration UI and the Steam
game-families data model itself. Re-derive those against the bridge architecture
rather than executing the plans as written; the plans assume a bottle-per-family
runtime that no longer exists.

Bridge scope limits that might reopen adjacent work are tracked in Phase 24's own
artifacts (`24-UAT.md`, `24-SECURITY.md`) and the `spike-findings-gamelib` skill —
notably that the bridge currently proxies only ISteamUser + ISteamFriends, so games
needing more interfaces are out of scope until those proxies are built.
