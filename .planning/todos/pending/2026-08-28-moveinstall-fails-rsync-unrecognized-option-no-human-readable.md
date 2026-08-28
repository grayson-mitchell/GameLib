---
created: 2026-08-28T19:15:00.000Z
title: "`moveInstall` fails outright on macOS — `rsync: unrecognized option '--no-human-readable'`"
area: backend
status: OPEN
severity: major
files:
  - src/backend/utils.ts
  - src/backend/storeManagers/legendary/games.ts
  - src/backend/storeManagers/gog/games.ts
---

## Observed

Found by the operator on 2026-08-28 driving **Item 3 of `35-AB-RETEST.md`** (the Phase 35 D-18 A/B
re-test), on branch `fix/steam-native-install-stability`, **Electron leg, dev build**.

Move Game was triggered, a destination was chosen, and the move failed with a user-visible dialog:

```
Error Moving Game
rsync: unrecognized option `--no-human-readable'
```

## Problem

`--no-human-readable` is not accepted by the `rsync` on this host. macOS has shipped **openrsync**
as `/usr/bin/rsync` since Sonoma (replacing the ancient rsync 2.6.9 that preceded it), and neither
accepts every flag modern rsync 3.x does. The move is therefore **completely broken** on a stock
macOS host — not degraded, not slow: it fails before copying anything.

This is **shared backend code**, not Tauri-port code. Consequences:

- It does **not** die with Electron at Phase 35 plan 35-14. It ships.
- It is **out of scope** for the 35-09 / 35-10 / 35-11 fix cluster, which owns Item 3's actual
  symptom (the `openDialog` 60s invoke timeout). Filing separately so it is not absorbed into that
  cluster and silently closed with it.

## Not yet established

- **Whether it reproduces under Tauri.** The A/B run could not tell: on the Tauri leg the
  `openDialog` invoke was dropped at the 60s `INVOKE_TIMEOUT` bound before the move was ever
  requested, so no `rsync` was spawned and the leg carries no evidence either way. Predicted to
  reproduce (shared code), but predicted is not measured.
- **Which call site builds the flag list**, and whether other `rsync` flags in the same invocation
  are also unsupported. `--no-human-readable` is the first flag rejected; openrsync may reject more
  once that one is removed. Fixing only the flag that happened to be reported first is the obvious
  trap here.
- Whether Homebrew `rsync` (GNU rsync 3.x, if installed and earlier in `PATH`) masks this on some
  developer machines — which would explain why it has not been hit before.

## Solution

TBD. Options, none chosen:

- Drop `--no-human-readable` (it only affects progress-output formatting) and re-test against the
  system `rsync`, then audit the remaining flags against openrsync's supported set rather than
  assuming the rest are fine.
- Detect the `rsync` implementation once and select a flag set, rather than assuming GNU rsync 3.x.
- Replace the `rsync` dependency for the move path entirely.

## Notes

No `resolves_phase:` — this is not a Phase 35 port defect and must not be auto-closed when Phase 35
closes. Evidence: `.planning/phases/35-electron-cutover-remove-the-electron-build/35-AB-RETEST.md`
Addendum A-1, and the preserved log
`~/Library/Logs/GameLib/gamelib.log.35-02-ab-electron`.
