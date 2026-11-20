# Quick Task 261105-vfq: Recover from steam:// install and uninstall requests a signed-out Steam drops - Context

**Gathered:** 2026-11-05
**Status:** Ready for planning

<domain>
## Task Boundary

Fix the todo `.planning/todos/pending/2026-11-05-steam-uninstall-silently-dropped-when-signed-out.md`.
A signed-out Mac Steam silently drops `steam://install/<appId>` and `steam://uninstall/<appId>`.
GameLib then sits on Installing/Uninstalling until the `MAX_TICKS = 7200` poll cap (about 6 h).
Cancel did not clear a stuck delegated install; it took a GameLib restart.

Scope: GameLib's delegated (Steam-owned) install and uninstall polls on the native Mac Steam
route. These are polls started after `steam://install` (`delegatedToSteamClient: true`) or
`steam://uninstall`. Out of scope: GameLib's own depot downloads, the InstallApp route, the D-UAT-13
restart hold (separate todo `2026-11-05-steam-restart-hold-brittle-discuss.md`), and bottle/bridge
roots.

</domain>

<decisions>
## Implementation Decisions

### Detection
- Use a **no-activity timeout** after the request is sent. Do NOT add a sign-in pre-check. The
  helper's `not-signed-in` signal was intermittent in the 261105-ord live gate.
- "Activity" means positive evidence that Steam picked the request up:
  - **Install:** an `appmanifest_<appId>.acf` appears in any registered library, or a
    downloading/staging entry appears.
  - **Uninstall:** StateFlags gains 0x800, bit 4 clears, or the manifest disappears.
  Once activity is seen, the timeout is disarmed, and from then on today's behaviour and caps
  apply unchanged.

### Timeout
- **2 minutes** with no activity after the request is sent. Steam's own install and uninstall
  dialogs wait for a click, and real requests in the gate showed activity within seconds of it.

### After a drop
- **Revert + notice:** stop the poll and restore the previous state: Not installed for a dropped
  install, Installed for a dropped uninstall. Show a toast/notice such as "Steam didn't start the
  install. Make sure Steam is signed in, then try again" (an uninstall variant too). New copy
  needs en keys plus the repo's usual i18n handling.
  Also log a line naming the appId, the action and the timeout.

### Cancel
- Cancel on a Steam-owned (delegated) install must stop GameLib's poll and restore the previous
  state immediately. It does not try to cancel anything inside Steam. If Steam later installs the
  game anyway, the normal library/ACF reconcile picks it up.

### Claude's Discretion
- Where the timeout lives (the install/uninstall poll entries in library.ts are the obvious place)
  and how it is tested (fake timers).
- Exact notice mechanism: reuse the existing Steam toast/notice path rather than inventing one.
- Whether the uninstall Cancel path also needs fixing. Wire it the same way if Cancel is offered
  there.

</decisions>

<specifics>
## Specific Ideas

Evidence from the 261105-ord live gate (2026-11-05, appId 112100):
- 22:18:13: steam://uninstall to signed-out Steam, uninstall poll started, stuck. It recovered at
  22:19:01 only because the operator signed in and uninstalled by hand.
- 22:25:29: InstallApp reported `not-signed-in` and fell back to steam://install with
  `delegatedToSteamClient true`. Steam only raised its sign-in window. After sign-in, Steam
  queued nothing and GameLib stayed on Installing. Cancel did not clear it.
- Normal requests (gate items 1, 8a) showed Steam activity within about 20 s.

</specifics>

<canonical_refs>
## Canonical References

- `.planning/todos/pending/2026-11-05-steam-uninstall-silently-dropped-when-signed-out.md`
- `.planning/quick/261105-ord-steam-experimental-installapp-setting-ma/261105-ord-SUMMARY.md` (gate items 6/6b)
- `src/backend/storeManagers/steam/library.ts`: `startInstallPolling`, `stopInstallPolling`
  (~3714), `startUninstallPolling` (~3957), `pollUninstallOnce`, `MAX_TICKS` (~2213)
- `src/backend/storeManagers/steam/games.ts`: steam://install / steam://uninstall delegation

</canonical_refs>
