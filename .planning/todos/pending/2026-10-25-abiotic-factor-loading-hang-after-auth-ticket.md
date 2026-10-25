---
created: 2026-10-25
title: "Abiotic Factor (427410) still hangs at loading after GetAuthSessionTicket is forwarded and succeeds"
source: 53-14 Task 2 live gate (operator report + AbioticFactor.log + gamelib.log)
area: steam-bridge
files:
  - meta/sdk/wire-policy.json
  - native/steam-bridge/generated/bridge_dispatch.h
  - src/backend/storeManagers/steam/bridge
severity: major
platform: macos
ready: live-gate
---

## Evidence (53-14)

- Operator, verbatim: "still hangs at loading".
- Before the fix the Saved log had `Failed to acquire Steam auth session ticket for 0` twice. After the fix the current Saved log has zero such lines and three `LogOnlineIdentity: STEAM: Obtained steam authticket` (23.12.03, 23.12.45, 23.16.04).
- gamelib.log: HELLO, then CALL BIsSubscribed, GetAppID, GetSteamID, GetPersonaName, BLoggedOn, GetAuthSessionTicket (12:12:03). No further CALL lines for the remaining ~4 minutes.
- Bottle shim is the 497664-byte built shim.

Hypothesis from 53-UAT item 9 (the failed ticket causes the hang) is REFUTED: the ticket now succeeds and the hang survives.

## Next candidate causes

1. GetAuthSessionTicketResponse_t callback never delivered to the game (the bridge callback relay). The game may wait on the callback after the ticket handle is returned. Check whether the relay forwards callbacks for k_iSteamUserCallbacks+63 and whether the game logs a wait.
2. EOS / LogOnline: `LogEOSEcom: Purchase flow is disabled due to overlay setup failure (EOS_NotConfigured)` and repeated `LogEOSRTC: TickTracker Tick is delayed` (10 s periods) sit around the ticket; the game may wait on EOS login that depends on a Steam-derived ticket verified by a backend.
3. A non-Steam fault (shader compile, Wine graphics) at the loading screen: no Steam CALL arrives after the ticket, so nothing in the bridge log localizes it. Capture a wine +err trace.

Do not reroute to bottled Steam on this evidence; no DRM is involved.

## Root cause (debug: abiotic-factor-loading-hang, 2026-10-26)

Candidate 1 was close: the missing callback is 168, not 163. The game never registers 163. At init it registers
callback 168 (`GetTicketForWebApiResponse_t`). After the forwarded `GetAuthSessionTicket` it calls
`ISteamUser::GetAuthTicketForWebApi`, which is a shim stub returning handle 0. The shim also has no callback delivery
(`RunCallbacks` / `RegisterCallback` are no-ops), so 168 can never arrive. UE's EOSPlus login (GetLinkedAccountAuthToken,
TokenType WebAPI) never gets a web-API ticket, never starts the EOS Connect user login, and retries every ~10 s. The
menu shows "Loading" indefinitely. Evidence: `.planning/debug/abiotic-factor-loading-hang.md` (shim call trace +
verbose EOS log).

Fix is planned as a phase: forward `GetAuthTicketForWebApi`, have the helper queue 168 from its own callback pump,
and have the shim's `RunCallbacks` drain and dispatch it to registered `CCallbackBase` objects. The diagnostic
stub/callback-registration trace is saved as `.planning/debug/abiotic-factor-loading-hang.trace.patch` for reuse.
