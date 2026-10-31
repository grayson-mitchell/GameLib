M-01 Direction A invite leg proven live; 58-33 may start

---
phase: 58-steam-bridge-multiplayer
plan: 37
subsystem: steam-bridge-invite
tags: [gap-closure, live-check, invite, window-raise]
requires: [58-35, 58-36]
provides:
  - Live proof that the game's '+' raises the GameLib picker and an invite reaches the PC (windowed run)
key-files:
  created: []
  modified: []
requirements-completed: [M-01]
duration: operator-gated
completed: 2026-11-01
---

# Phase 58 Plan 37: Live invite leg re-run Summary

Re-ran the 58-32 invite leg on the 58-35 multiplexed helper and 58-36 raise fix: the picker came to the front over the game, listed the PC account, sent the invite, and the PC received it and joined. Not a gate item; does not score D-08 (58-34 does). The run was WINDOWED 1920x1080, see Deviations.

## Task 1: freshness evidence

- Command: `pnpm gen-vtables && pnpm build-steam-bridge && pnpm exec vite build && pnpm build:sidecar-sea`, exit 0, SEA arch arm64.
- Helper mtime 1793483536, sidecar.js mtime 1793483543, SEA 1793483548.
- Commit times: da4c7476d (58-35) 1793483306, 08f82ab19 (58-36 raise) 1793483449, bc73e6ee4 (58-36 ack) 1793483489; last bridge_helper.c commit 1793483306. Outputs newer than all fixes.
- `strings` helper, `connection table full`: 1. `grep -c 'raise requested' build/main/sidecar.js`: 1. Verify printed FRESH.
- The running dev session bootstrapped at 11:06:15 (single bootstrap line in gamelib.log), after the 10:52:28 SEA build, so it carried the rebuilt sidecar.

## Task 2: operator answers (verbatim)

`raised: yes; picker: yes friends listed: yes; sent shown: yes; PC saw invite: yes; PC accept result: joined game`

## Log counts (this launch's segment, 219 lines, 11:22:13 to 11:28:26 local)

| Line | Count |
| ---- | ----- |
| INVITE dialog appid=3205720 | 8 |
| bridge invite [3205720]: raise requested | 8 |
| bridge invite [3205720]: display=confirmed | 8 |
| bridge invite [3205720]: display=unconfirmed | 0 |
| bridge invite [3205720]: list n= | 8 |
| bridge invite [3205720]: list result=error | 0 |
| INVITE friends n= | 8 |
| INVITE sent ok=1 | 1 |
| INVITE refused (both reason no-pending, a Send press with no pending list) | 2 |
| connection table full | 0 |
| main_window_raise failed | 0 |
| main_window_raise:no-main-window | 0 |

SEGMENT-PASS verify printed. Counts agree with the operator answers: eight '+' presses, every one confirmed displayed, one send.

## Deviations from Plan

**1. [Environment, orchestrator-applied, not a code change] Windowed run.** Launch attempts at 11:07 and 11:09 failed: Unity Player.log showed `Switching to resolution 3440x1440 failed` / `Screen: DX11 could not switch resolution (3440x1440 fs=1 hz=0/1)` and the game exited after about 6 s. With operator approval the bottle prefs were changed (Fullscreen mode 1 to 3 Windowed, 1920x1080, Use Native 0; backup user.reg.bak-58-37). The scored run was windowed. A raise over a windowed game is weaker evidence than over fullscreen; 58-34 should re-check the raise in fullscreen once the CrossOver DX11 3440x1440 mode-switch failure is understood. Filed as todo `.planning/todos/pending/2026-11-01-fullscreen-3440x1440-mode-switch-fails-under-crossover-dx11.md`.

**2. [Record] Clock times.** The operator-reported times (restart 11:24, quit 11:26) do not match the log: dev bootstrapped 11:06:15, this launch began 11:22:13, and the game stopped 11:28:26 (349 s of play). The segment was taken from the launch start in the log to the end of the game, not from the reported times. It contains extra presses after 11:26, all counted above. An earlier launch at 11:07-11:09 is excluded.

## Findings

- The 58-35 multiplexed helper serves the invite control slots while the game connection is open (no `list result=error`, no `connection table full`).
- The 58-36 raise worked: `display=confirmed` on all eight presses (34-58 ms after the request) and no raise errors. Dock-bounce fallback was not needed.
- `raiseWineGameWindow [bridge:3205720]: no matching process` appeared once at 11:22:55 (pre-existing launch-time behaviour, unrelated to the invite raise).

## Known Stubs

None.

## Self-Check: PASSED
