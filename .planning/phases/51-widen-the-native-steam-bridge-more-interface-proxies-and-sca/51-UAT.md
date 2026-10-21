---
status: testing
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
source:
  - 51-01-SUMMARY.md
  - 51-02-SUMMARY.md
  - 51-03-SUMMARY.md
  - 51-04-SUMMARY.md
  - 51-05-SUMMARY.md
  - 51-06-SUMMARY.md
  - 51-07-SUMMARY.md
  - 51-08-SUMMARY.md
  - 51-09-SUMMARY.md
  - 51-10-SUMMARY.md
  - 51-11-SUMMARY.md
  - 51-12-SUMMARY.md
  - 51-13-SUMMARY.md
  - 51-14-SUMMARY.md
  - 51-15-SUMMARY.md
  - 51-16-SUMMARY.md
  - 51-17-SUMMARY.md
  - 51-18-SUMMARY.md
started: 2026-10-21T12:30:34Z
updated: 2026-10-21T12:30:34Z
---

## Preconditions

Run against the **packaged build only — never `tauri:dev`** (a long-running dev server runs a
stale sidecar bundle, so code landed this phase would not even be present in the running
process). Mac Steam signed in. CrossOver present with the legacy `GameLibSteam` and
`GameLibSteamBridge` bottles plus any per-game `GameLibSteamBridge-<appId>` bottles the preceding
plans created. Archive `gamelib.log` before each item's arm — append-and-archive capture, never
truncate, so an earlier item's evidence survives a later item's own logging. Before item 1, record:

- `SHIM32 = stat -f %z build/bin/arm64/darwin/steam_api.dll`
- `SHIM64 = stat -f %z build/bin/arm64/darwin/steam_api64.dll`

Both values are the authoritative "is this really the bridge shim, not the game's own dll" check
used by items 1, 2, 4, and 6 below (file-size comparison beats `grep 54550`, which is a false
negative — the port is never stored as ASCII).

Pair-test note carried from the authoring review (live-gate-contract-authoring.md Test 5): **item
3 must run before item 4** — item 4's Hoard uninstall-then-fresh-install destroys item 3's
legacy-bottle launch-time-miss evidence.

## Current Test

number: 1
name: Avernum 6 (206060) D-51-01 identity
awaiting: user response

## Tests

### 1. Avernum 6 (206060) D-51-01 identity

expected: Play launches Avernum 6 through the per-game bridge path; Mac Steam shows In-Game; `gamelib.log` has `LISTEN 127.0.0.1:<port> appid=206060` (port != 54550) and `HELLO shim attached appid=206060`; the placed `steam_api.dll` next to `Avernum6.exe` has size == SHIM32, `grep -ac 127.0.0.1 <dll>` >= 1, `grep -ac GameLibSteamBridgeShim/2 <dll>` >= 1; quitting the game ends In-Game on Mac Steam and frees the port.
result: pending

### 2. Avernum 5 (206040) per-game bottle regression

expected: Same hooks as item 1, from the Avernum 5 per-game bottle (`GameLibSteamBridge-206040`) rather than the legacy shared bottle — Play launches through the bridge, Mac Steam shows In-Game, `LISTEN 127.0.0.1:<port> appid=206040` (its own port, distinct from item 1's), `HELLO shim attached appid=206040`, placed `steam_api.dll` size == SHIM32 with the same `grep -ac` checks, and quitting frees the port and clears In-Game.
result: pending

### 3. Legacy Hoard (63000, shared GameLibSteamBridge, Phase-24 shim) launch-time miss

expected: Pressing Play on the legacy-bottle Hoard install does NOT launch (the Phase-24 2-interface shim is still in place there, pre-widening); the D-05 dialog lists `<Family>@unknown-version` entries for the families Hoard actually imports; `gamelib.log` shows the miss verdict naming those same entries. MUST run before item 4 — item 4's uninstall-then-reinstall destroys this legacy-bottle evidence.
result: pending

### 4. Hoard Gate 4 re-run (24-UAT Gate 4)

expected: Uninstall the legacy Hoard copy, then a fresh install routes to the per-game bottle `GameLibSteamBridge-63000`; the game reaches playable single-player. Part A: `gamelib.log` shows `HELLO` + `INIT … SteamAPI ready` for appid=63000. Part B: a real SteamID64 + persona are served (USER/FRIENDS dispatch lines logged). The new bottle has no `steam.exe`. The placed `steam_api.dll` size == SHIM32. Mac Steam shows In-Game Hoard. A `[bridge-notice] appId=63000 reason=stubbed:…` line is logged and the game page shows the limited-features line (D-51-02's one-time stubbed-interfaces notice).
result: pending

### 5. XCOM: Enemy Unknown (200510)

expected: A fresh bridge install loads the exe (the 9 out-of-scope `SteamGameServer*` bare imports resolve against the GameServer flat stubs, so the exe does not fail to load on an eagerly-bound IAT entry) and reaches the main menu; the verdict is clean (no missing symbols) against SteamUser016/SteamFriends011/SteamUtils005/STEAMAPPS_INTERFACE_VERSION004/STEAMUSERSTATS_INTERFACE_VERSION010.
result: pending

### 6. ELEX (411300) Win64

expected: A fresh bridge install's pre-install prescreen logs the title as x64 (D-51-06/17); `steam_api64.dll` is placed next to `ELEX.exe` with size == SHIM64; the game reaches the main menu; Mac Steam shows In-Game ELEX.
result: pending

### 7. D-51-03 two bridge games at once

expected: Avernum 6 and Hoard running simultaneously each get their own per-game helper — `lsof -nP -iTCP -sTCP:LISTEN` shows two distinct `steam-bridge-helper` pids on two distinct LISTEN ports; both games stay responsive; neither launch is refused by a single-helper collision dialog.
result: pending

### 8. D-51-09/D-51-10 route visibility

expected: The install dialog's wine section for an eligible, not-yet-installed title (e.g. Avernum 5 before it is installed) shows "Native Steam bridge — Known to work with the bridge" and a "Use the Windows Steam client instead" toggle; toggling it on and installing lands the title in the `GameLibSteam` bottled-Steam path instead of a bridge bottle; the game page's Extra info panel shows the route row beside the compatibility rating once installed.
result: pending

### 9. D-51-08/D-51-11 route-notice dialog

expected: On a known-bad title (one 51-19's own running census classifies known-bad, or any owned title carrying a persisted scan miss), the install dialog names the specific reason and offers two buttons: "Use bottled Steam" (installs through the ordinary bottled path) and "Try the bridge anyway" (D-51-11 — installs then re-scans; a miss lands on the ordinary D-05 fallback dialog). If no owned title currently qualifies as known-bad or scan-missed, record result: skipped — no owned known-bad or scan-miss title (census 51-18) instead of exercising the dialog.
result: pending

### 10. D-51-12 Remove all copies on a per-game bridge install

expected: Uninstalling a per-game bridge title (e.g. Avernum 5 from `GameLibSteamBridge-206040`) deletes that `GameLibSteamBridge-<appId>` bottle directory entirely; the legacy `GameLibSteamBridge` bottle and the Phase 17 `GameLibSteam` bottle are both left untouched (`ls ~/Library/Application Support/CrossOver/Bottles` unchanged apart from the removed directory).
result: pending

### 11. D-51-16 Waiting for Steam

expected: With the bottled Steam client blocked from completing login (signed out, or the same account already playing on another machine) and Play pressed on a `GameLibSteam` (bottled) game, the game page shows "Waiting for Steam…" within roughly 20 seconds, naming the detected cause first in the canonical order [self-update, login, other-session]; a `[bottle-waiting]` line is logged; the waiting state clears once the game actually starts.
result: pending

### 12. D-51-04 desk probe (named real-profile arm)

expected: Running the bundled bridge helper binary directly with `--appid <an unowned AppID> --port 0` reports WHOAMI not-inited; running it with `--appid 480 --identity-only --report-appid <the same unowned AppID>` reports ready. Both outcomes confirm the live fallback precondition the unit tests only assume.
result: pending

### 13. D-51-15 census

expected: `pnpm bridge-census` run against the final, fully-landed tree prints "N of M routed to the bridge" with every miss classified (win64-no-shim / missing-symbols / unknown-version / known-bad / no-binary); the exact numbers from that run are recorded here verbatim once executed.
result: pending

## Summary

total: 13
passed: 0
issues: 0
pending: 13
skipped: 0
blocked: 0

## Gaps

<!-- YAML format for plan-phase --gaps consumption -- none yet, testing has not started -->
