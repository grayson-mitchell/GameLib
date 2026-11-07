---
spike: 068
name: nonsteam-first-match-signal
type: standard
validates: "Given a Windows game launched by Wine from a macOS install path, when ps is sampled, then we know which command-line shape identifies the game process for non-Steam launches, and which per-game CrossOver bottle names cxbottle --create accepts"
verdict: PARTIAL
related: [060, 059]
tags: [macos, crossover, launch-deadline, ps, first-match, bottle-name, phase-61]
---

# Spike 068: nonsteam-first-match-signal

## What This Validates

Plan 61-16 generalises the "game process exists" signal to non-Steam games and arms the launch
deadline only if a ps shape works (59-REVIEW CR-01: a deadline without a proven match kills running
games). Plan 61-07 needs the per-game bottle-name limits (RESEARCH A2, D-01).

## How to Run

`./build.sh` (needs mingw-w64), then `./run.sh shapes`, `./run.sh names`, and
`MATCH='<install dir substring>' ./run.sh watch 60` while clicking Play in GameLib. State lives
under `state/` (gitignored fake HOME with an APFS clone of a real bottle). Only filtered ps lines
are logged.

## Investigation Trail

- Task 1 (synthetic, CrossOver, clone bottle): S1 `wine "<unix>/Game.exe"`: the wrapper line carries
  the unix path for about 1-2 s, then the exe shows `Y:\...` (home installs map to Y:). S2 explicit
  `Z:` arg: `Z:` on both lines. S3 `start /unix <path>` (reconstructed, not confirmed gogdl argv):
  `start /unix Y:\...`, then the exe as `Y:\`. S4 cwd + bare `Game.exe`: basename only, unmatchable.
- Task 2 (live, operator): GOG Bloody Hell (Windows build), window appeared yes, played well past the
  60 s watch. The real gogdl exec was `gogdl launch <dir> <id> --wine <GPTK wine64> --platform windows`,
  which ran `wine64-preloader <wine64> "<unix dir>/Bloody Hell.exe"`. That line stayed unchanged for the
  whole watch; a Unity crash handler child showed a `Z:\Users\<user>\Games\...` path. This launch used
  the GPTK engine, not CrossOver.
- Names: `cxbottle --create` accepted all five candidates (50, 64, 67, 120 chars; dots; `_20`/`_21`
  escapes), about 12 s each.
- Checkpoint (user): replied "approved" to arming the non-Steam launch deadline in 61-16 (matchShape z-path, multi-form case-insensitive install-dir prefix with trailing separator) and a 120-char bottle-name cap for 61-07, after being told the live evidence was GPTK wine64, not CrossOver. No CrossOver re-run requested.

## Results

Verdict PARTIAL: the live launch proved the unix path form for GPTK only; CrossOver evidence is
synthetic. matchShape is `z-path`: under CrossOver the persistent signal is the exe's `Y:\`/`Z:\`
command line, and the unix path is transient. The rule for plan 61-16: accept the unix, `Z:` and
(home installs) `Y:` forms of the install dir with a trailing separator. Basename-only launches
(S4) cannot be matched. Plan 61-07 can cap the bottle name at 120 characters (no rejection seen;
true cap not measured).
