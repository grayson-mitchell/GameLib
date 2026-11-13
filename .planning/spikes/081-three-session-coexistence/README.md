---
spike: 081
name: three-session-coexistence
type: standard
validates: "Given Mac Steam online + steam-user with a non-zero logonID + an authenticated steam-vent session on one account, when Refresh-shaped and depot-shaped calls run on both for ~10 min, then no LoggedOff 34 on either and Mac Steam Friends stays signed in"
verdict: VALIDATED
related: [077, 075, 080, 084, 071a]
tags: [steam, cm, steam-vent, steam-user, logonid, friends, coexistence, integration, live]
---

# Spike 081: Three sessions on one account

## What This Validates

Given Mac Steam online, steam-user with a non-zero logonID, and an authenticated steam-vent
session all on one account, when Refresh-shaped and depot-shaped calls run on both GameLib
sessions for about 10 minutes, then neither is kicked with `LoggedOff 34` and Mac Steam stays
signed in.

077 proved the logonID fix with 40–60 s holds, steam-user first, and only access-token pings. The
production shape during an Idea E migration is longer and busier: the sidecar's Refresh and the
Rust depot path both active while Mac Steam is online.

## Research

- 077: session identity is (account, public IP, `obfuscated_private_ip`). steam-vent hard-codes
  0. A non-zero steam-user `logonID` separates them (arm C). Mac Steam sends its real private IP
  and was never affected.
- 075: unwrapped signed-in logons are safe for Mac Steam, so this run uses no go-offline wrap.
  That is the harder case, because all three sessions are online at once.
- 084's probe (`whoami`: `GetSteamID` + `BLoggedOn`) gives a direct readout of Mac Steam's logon
  state with no CM traffic. It is used here as a third oracle beside `connection_log.txt`.

## How to Run

```sh
CARGO_TARGET_DIR=$PWD/../077-dual-cm-session-coexistence/target cargo build --release
./run.sh <run> [hold_s=600] [logonID=81] [gap_s=10]
```

- `spike-081-vent-work` (steam-vent a9e8164, refresh token, ip 0): every 20 s it runs a
  depot-shaped cycle on app 220 / depot 221: PICS access token and product info, the public gid,
  `GetDepotDecryptionKey`, `GetManifestRequestCode` and `GetServersForSteamPipe`. Only eresults,
  counts and ok/ZERO are logged.
- `su-work.mjs` (steam-user, production options, `logonID` 81) starts 10 s later. Every 20 s it
  runs a Refresh-shaped cycle: `getUserOwnedApps`, package PICS for a rolling window of 50
  licences, and app PICS for 50 owned apps.
- Mac Steam: `connection_log.txt` is mirrored for the run, and `probe whoami` runs every 30 s.
- `runs/<run>/merged.log` interleaves everything. No tokens, keys or request codes are printed.

## What to Expect

Both workers end with `alive_at_end=true`, there are no `KICKED` or `DEAD` lines, every probe
reads `loggedOn 1` for `76561197995867096`, and the connection log is silent.

## Investigation Trail

1. **Order.** steam-vent signed in first and steam-user second. This is the reverse of 077's arm
   C, so the "later logon wins" rule was exercised from the other side.
2. **Run `live-600`** (2026-11-13 18:45–18:55 UTC, the operator approved it with "go"):
   - steam-vent: 31/31 cycles, each with depot key eresult 1, request code ok and 6 CDN servers.
     Each cycle took about 2.6 s.
   - steam-user: 29/29 cycles, each with 390 owned and 50 app PICS answered. Each cycle took about
     0.7 s. Package PICS fell to 35 or 20 on some cycles only because the rolling window reached
     the end of the licence list.
   - Kicks: none. There were 0 `KICKED` or `DEAD` lines. steam-user's only `DISCON` (eresult 3)
     came after its own `logOff()` at the end of the hold.
   - Mac Steam: 21/21 probes read `loggedOn 1` on the expected SteamID, and `connection_log.txt`
     gained **no lines** during the run.

## Results

**VALIDATED.** With steam-user on a non-zero logonID, steam-user, steam-vent and Mac Steam share
one account for 10 minutes of real Refresh and depot traffic with no kick on either GameLib session,
and Mac Steam never notices.

- 077's one-line fix (non-zero `logonID` on steam-user) holds at production shape and duration,
  and in both logon orders.
- A signed-in Rust depot path does not need the go-offline wrap on macOS. Mac Steam's log and
  logon state were untouched by two extra signed-in sessions.
- Friends was measured through `BLoggedOn` and a silent connection log, not by watching the
  Friends UI. The operator can confirm the UI.
- Not covered: holds longer than 10 minutes, network loss and sleep (085), and two GameLib
  installs behind one NAT (077's inferred case).
