---
spike: 046b
name: wrap-around-logon
type: standard
validates: "Given a clean Mac Steam (restarted, Friends signed in) and 046a's URL toggle, when a harness fires steam://open/gooffline, waits for GameLib's own SteamUser.loggedOn, then fires steam://open/goonline, then Friends stays signed in and the status stays changeable, with GameLib's session alive"
verdict: VALIDATED
related: [046a, 046c]
tags: [steam, macos, offline-mode, steam-url, friends, steam-auth, steam-user, live]
---

# Spike 046b: wrap-around-logon

## What This Validates

The 2026-10-26 go-offline trick (operator, by hand, n=2) driven by software instead of by hand:
Mac Steam offline around GameLib's authenticated logon, then online again while GameLib's session
stays open.

## How to Run

Preconditions: Mac Steam freshly restarted (Friends clean), GameLib fully quit (no stale
sidecar).

```bash
node .planning/spikes/046b-wrap-around-logon/wrap.mjs [settleMs=2000]
# when it prints ">>> OPERATOR: trigger the GameLib logon now", launch GameLib (or press Refresh)
```

## What to Expect

`[hit] GameLib logon seen`, `[fire] goonline` settleMs later, `[hit] Mac Steam logon complete`,
`[after] no GameLib session event`, `samePid: true`. Then the operator checks Friends.

## Observability

`wrap.mjs` tails both oracles from byte offsets taken at start: Mac Steam
`logs/connection_log.txt` and `~/Library/Logs/GameLib/gamelib.log`. The gamelib.log tail resets
to 0 if the file shrinks, because GameLib rotates it at launch. Forensic stream: `run.log`.

## Investigation Trail

1. Before the run, the live state was already dirty: GameLib had cold-connected at 12:42:28,
   two minutes after Mac Steam logged on. Baseline reset: GameLib quit, Mac Steam restarted
   13:40:38 (PID 26961), operator confirmed Friends signed in.
2. Bare toggle on the clean Steam (046a run 4, 13:41:58 → 13:42:07): operator confirmed Friends
   still signed in and the status changeable (set Away). This closes 046a's "the toggle itself is
   harmless" point under software control.
3. Wrap run (settleMs 2000), 2026-10-27:
   - 13:42:50 `gooffline` → `LogOff()` at once, `not auto reconnecting due to user initiated
     logoff`.
   - 13:43:14 GameLib launched. The boot sign-in probe won the launch race, so the launch itself
     logged on: `SteamUser.loggedOn` 13:43:14, `cold-connect path took 971ms`.
   - 13:43:17 `goonline` (2 s settle) → Mac Steam `processing complete` 13:43:18, 1259 ms, same
     PID, same JWT persistence.
   - GameLib's library fetch completed on its own session while Mac Steam was rejoining
     (`fetched 385 owned games` 13:43:17, `library sync complete` 13:43:20). No `disconnected`,
     `relog` or `LogonSessionReplaced` in the 20 s after. The operator's later Refresh reused the
     session: exactly one `SteamUser.loggedOn` in the whole log.
4. Operator, at least 30 s after the logon: Friends signed in, status changes fine.

## Results

**VALIDATED** (n=1 automated, consistent with the operator's n=2 manual runs on 2026-10-26).
GameLib can drive the go-offline trick itself, with no dialog, no permission prompt and no Steam
restart.

- **Required offline window:** the wrap only needs Mac Steam offline from `gooffline` until
  `loggedOn` plus a settle. Here that was 0.05 s + 0.97 s cold connect + 2 s. The 24 s of this
  run's 28 s were the operator launching GameLib. Automated, the window is about 3–4 s, plus the
  ~1.3 s Mac Steam takes to log back on.
- **GameLib's session survives Mac Steam rejoining**, including a library fetch in flight across
  the rejoin.
- **Not tested:** settle shorter than 2 s; a running Mac Steam game during `gooffline` (the
  Settings path refuses then; the URL path is unknown); Refresh as the trigger (this run's
  logon was the launch one).
