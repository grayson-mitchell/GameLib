---
spike: 046a
name: steam-url-offline-toggle
type: standard
validates: "Given Mac Steam online, when `open -g steam://open/gooffline` then `steam://open/goonline` fire, then connection_log shows a user-initiated LogOff and a completed logon on the same steam_osx process, with no dialog"
verdict: VALIDATED
related: [046b, 046c]
tags: [steam, macos, offline-mode, steam-url, friends, steam-auth]
---

# Spike 046a: steam-url-offline-toggle

## What This Validates

Given Mac Steam online, when GameLib fires `steam://open/gooffline` and later
`steam://open/goonline`, then Mac Steam logs off and back on with no dialog and no restart. This
is question 1 of todo `2026-10-26-spike-gamelib-toggles-mac-steam-offline-around-logon.md`.

## Research

No `steam://` offline verb is documented. Local inspection of Mac Steam (build 1792618285):

- `steamui.dylib` has `goonline` and `gooffline` next to each other in its native
  `steam://open/<x>` verb table (neighbours: `bigpicture`, `gamepadui`, `newforyou`,
  `installaudiocapturedriver`, `openurl_external`). It also contains the log string
  `UI Request: go offline`.
- Valve's own React UI (`steamui/sp.js`) calls `steam://open/goonline` from the offline-mode
  banners (app details, family playtime). The lowercase `gooffline` appears in no JS file, so the
  native side dispatches it.
- The Steam menu calls `SteamClient.User.GoOffline()` / `GoOnline()` directly with no dialog. The
  Settings → Internet path (`function R` in sp.js) wraps the same call in a confirm dialog and
  refuses while `MainRunningApp != null` (`#UserManagement_OfflineMode_MustCloseGames`).

| Approach | Mechanism | Pros | Cons | Status |
|---|---|---|---|---|
| `steam://open/gooffline` / `goonline` | `open -g` / `shell.openExternal` | no permission, no dependency, Valve uses the online half itself | undocumented; Valve can drop it | **chosen, works** |
| Accessibility menu click | System Events clicks Steam > Go Offline | real UI path | TCC Accessibility prompt; breaks on menu/locale changes | not needed |
| CEF remote debugging → `SteamClient.User.GoOffline()` | `.cef-enable-remote-debugging` + DevTools on localhost | exact menu call | needs a Steam restart to enable; opens a local debug port into Steam's UI (security cost) | not needed |
| steamclient `IClientUser::SetOfflineMode` | the bridge's steamclient | in-process | undocumented, fragile ABI | not needed |

## How to Run

```bash
node .planning/spikes/046a-steam-url-offline-toggle/probe.mjs              # off, 5 s, on
node .planning/spikes/046a-steam-url-offline-toggle/probe.mjs --offline-only
node .planning/spikes/046a-steam-url-offline-toggle/probe.mjs --online-only
```

Requires Mac Steam running and signed in. Exit 0 = TOGGLED, 2 = no LogOff seen (goonline not
fired).

## What to Expect

`[hit]` lines for `LogOff()` within ~0.25 s and for `RecvMsgClientLogOnResponse() : processing
complete` within ~1.5 s; `samePid: true`.

## Observability

`probe.mjs` reads Mac Steam's `logs/connection_log.txt` from a byte offset taken just before each
URL fires (so only lines caused by that URL count), and snapshots the `steam_osx` PID + `lstart`
before and after. Forensic stream: `run.log` (ISO timestamps, `[fire]/[hit]/[timeout]/[log]/
[snapshot]/[verdict]`). Each run is kept as `run-N-*.log`; idempotence checks in
`idempotence.log`.

## Investigation Trail

1. Grepped steamui JS for `GoOffline`: found `SteamClient.User.GoOffline/GoOnline/StartOffline`,
   the menu entries, and the Settings confirm dialog.
2. Grepped the binaries: `steamui.dylib` lists `goonline`/`gooffline` in the `steam://open/` verb
   table; Valve's JS uses `steam://open/goonline`. The offline half is the untested one.
3. Run 1 (both, 2026-10-27 13:07:14 local): `LogOff()` 251 ms after `gooffline`, followed by
   `ConnectionDisconnected() not auto reconnecting due to user initiated logoff`. This line is
   the same one the operator's manual Go Offline left on 2026-10-26, so the URL takes the menu's
   code path. `goonline` 6.8 s later: logon complete 1.5 s after the URL, same JWT/session
   persistence, PID 81430, start time 12:36:23 unchanged.
4. Runs 2 and 3 (offline only, then online only): same results (251 ms, 1509 ms). The identical
   latencies are quantization from the 250 ms poll, not caching. Timestamps and log offsets
   differ.
5. Idempotence: a second `gooffline` while offline and a second `goonline` while online each
   added **0** connection_log lines over 6 s. Both verbs are safe to fire blind, so a wrap needs
   no state read before firing.
6. No dialog appeared at any point: LogOff landed in 251 ms, before any dialog could be clicked.

## Results

**VALIDATED.** `steam://open/gooffline` and `steam://open/goonline` toggle Mac Steam's offline
mode programmatically (n=3 each), with no dialog, no restart (same PID) and no permission prompt.
Both are idempotent no-ops when already in the target state. Latency: offline ≤ 0.25 s, online
≈ 1.5 s to `processing complete` (with a CM already chosen; a cold CM pick adds the ~1 s ping
phase).

Not covered here:

- **Running game.** Settings → Internet refuses Go Offline while a game runs. Whether the URL
  path enforces the same rule is still untested (046b checkpoint).
- **Friends after a bare toggle.** A clean toggle (no GameLib logon) not damaging Friends is the
  operator's 2026-10-26 manual observation (n=2). It is re-checked in 046b on a freshly
  restarted Steam.
- **Fragility.** Undocumented verb. Valve uses only the `goonline` half itself. Gate the wrap on
  observing the LogOff in connection_log rather than trusting the URL.
