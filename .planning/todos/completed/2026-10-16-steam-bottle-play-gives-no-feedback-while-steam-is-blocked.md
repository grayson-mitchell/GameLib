---
created: 2026-10-16
title: "Play on a bottled Steam game gives no feedback while the bottled Steam client is blocked"
source: D-UAT-10 live gate 2026-10-16 (Fallout 2, macOS)
area: steam
files:
  - src/backend/storeManagers/steam/games.ts
severity: medium
platform: macos
ready: code
---

Pressing Play on a bottle-installed Steam game hands `steam.exe -applaunch <appId>` to the bottled Steam
client and then waits. If that client cannot start the game, the UI shows nothing: Play just looks dead and
the only trace is `raiseFrontmostBottledProcess [launch]: no matching process within ~18s — falling back
to app.hide()` in `gamelib.log`, followed by `sidecar invoke timed out: launch` about 60 s later.

Measured blockers on 2026-10-16, all silent in GameLib:
- bottled Steam self-updating and relaunching (drops `-applaunch`, so Play must be pressed again);
- a Steam login window hidden behind other windows;
- Steam's one-playing-session-per-account rule (a game open on another computer) — ~6 min of waiting.

Extra Play presses while blocked were just re-handed to the running Steam, so they did nothing either.

Wanted: surface a state to the user when the launch has not produced a game process within the grace
window (e.g. "Waiting for Steam…" with the likely causes), instead of a dead button. Which of the three
causes can be detected from the bottle's `logs/` (`bootstrap_log.txt`, `console_log.txt`) is unmeasured;
start there before designing the message.

This is the symptom D-UAT-10 originally reported as a "dead Play button"; the dispatch itself is fixed
(see the resolved bottled-Steam todo and 21-UAT.md D-UAT-10).

## Update 2026-10-16 — quick 261016-t3e

A bottled game's started/stopped state is now reported by an install-directory process monitor
(`src/backend/storeManagers/steam/bottleProcessMonitor.ts`), wired into the `'launch'` verb of
`dispatchToBottledSteam`. It polls `ps` for any process whose executable lives under the game's
own bottle install directory, adopting Playnite's SteamPlayController pattern; the first match
emits a `playing` gameStatusUpdate and the matched set emptying emits `done` plus a logged session
duration. There is deliberately no deadline on the first match, so the measured ~6-minute
one-session-per-account block now resolves correctly once the game actually starts.

This is a PARTIAL fix of this todo, not a close — the file stays in `pending/`.

What remains open: the blocked case, where NOTHING ever appears — a self-updating Steam, a hidden
login window, or the one-session rule — still shows a dead Play button with no user-facing state.
The wanted "Waiting for Steam…" message and the unmeasured question of which of the three causes
is detectable from the bottle's `logs/` (`bootstrap_log.txt`, `console_log.txt`) are both untouched
by this task and are still the next step.

## Closed 2026-10-17 — Phase 51 (D-51-16)

Closed by Phase 51 Plan 08. Planner measurement of a real GameLibSteam bottle found a clean
signal for all three causes in `logs/bootstrap_log.txt` / `logs/console_log.txt`:

- self-update: `bootstrap_log.txt` `Installing update...` … `Update complete, launching Steam...`
- other-session: `console_log.txt` `GameAction [AppID <appId>, ActionID …] : LaunchApp waiting
  for user response to KickingOtherSession "<title>"`
- login: `console_log.txt` `LogonFailure <reason>` where `<reason>` is not `No Connection`

`bottleLaunchSignals.ts` (`classifyBottledSteamBlock` + `readBoundedTail`, bounded to 64 KiB per
tail) classifies which of the three a bottled launch's own logs show, with other-session beating
self-update beating login when more than one matches. `bottleProcessMonitor.ts`'s poll loop emits
`steamBottleLaunchWaiting { appName, detectedCause }` once 20 s have passed with no matched game
process (never for a `kind: 'bridge'` launch — there is no Steam client in a bridge bottle),
re-checking every 15 s and re-emitting only when the classification changes. The frontend
(`BottleLaunchWaiting.ts`, `GameStatus.tsx`) renders "Waiting for Steam…" with the detected cause
first when one was distinguished, clearing on the game's own `playing`/`done` transition either
way.

Commits: `b21002d5f`/`1de1f48d0` (classifier), `125ba2e3f`/`4e0c949a9` (monitor wiring),
`2cc735c7e`/`67ef1c4b1` (frontend state + rendering).
