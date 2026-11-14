---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 34
subsystem: steam-bridge
tags: [c, macos, steamclient, owned-apps]
requires: []
provides:
  - "steam-bridge-helper --steam-owned-apps --expect-steamid <id64>"
key-files:
  created: [native/steam-bridge/helper/gamelib_ownedapps.h]
  modified: [native/steam-bridge/helper/bridge_helper.c]
requirements-completed: [D-14, D-15]
completed: 2026-11-15
---

# Phase 79 Plan 34: Mac Steam owned-apps helper subcommand Summary

Out-of-process `--steam-owned-apps` subcommand reads the running Mac Steam client's subscribed apps via IClientUser, behind logon and account guards, resolving methods by unique function-ID high half.

## What was built
- `gamelib_ownedapps.h`: reuses `gl_ia_attach`/`gl_ia_emit`; gets IClientUser from engine slot 8 (RTTI-checked); decodes every proxy's function ID; requires a unique slot for 0x6585 (BLoggedOn), 0xd6fc (GetSteamID), 0x8532 (GetSubscribedApps); BLoggedOn == 1; SteamID == expected (prints only `match`); GetSubscribedApps called twice (count, then buffer; cap 100000; second count <= first); 20 s `alarm` bounds the run.
- Exit codes: 0 ok, 2 guard failure (not-logged-on, account-mismatch, attach-failed), 3 unresolved/ambiguous/implausible, 64 usage.
- `bridge_helper.c`: include plus dispatch beside `--steam-installapp`, before the secret block.

## Verification
- `pnpm build-steam-bridge` builds cleanly (-Werror=uninitialized).
- No `--expect-steamid`: exit 64.
- Live smoke: Mac Steam was running but not logged on. Attach and slot resolution passed (`attach ok`, `resolve ok`), then the guard returned `not-logged-on`, exit 2, for both a bogus id and the loginusers.vdf id. The success path (count, appIds) was not exercised live.
- Formatter check omitted: C sources have no prettier parser and no repo clang-format config.

## Deviations from Plan
None. The helper uses its own function-ID decode (no interface-17 check) since IClientUser proxies differ from IClientAppManager ones.

## Known Stubs
None.

## Self-Check: PASSED
