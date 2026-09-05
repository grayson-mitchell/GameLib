---
created: 2026-08-28T19:15:00.000Z
title: "`moveInstall` fails outright on macOS — `rsync: unrecognized option '--no-human-readable'`"
area: backend
status: "RESOLVED 2026-09-05 by quick-260905-upz. moveOnUnix (shared by legendary and gog
  moveInstall) now probes rsync capability and branches its flag list per flavour; the two
  remaining 'Not yet established' clauses in this todo (which call site, and whether other flags
  are unsupported) are answered by the same code. Not claimed: no live move was driven under
  Tauri in this session, so the Tauri-reproduction clause closes on shared code, not an observed
  move. Same root cause and fix as
  2026-08-24-move-game-is-broken-on-macos-rsync-flags-openrsync-rejects.md."
discharged: 2026-09-05
discharged_by: quick-260905-upz
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

---

## Disposition (2026-09-05, quick-260905-upz) — DISCHARGED

### The observation

```
$ grep -n -A12 'Not yet established' 2026-08-28-moveinstall-fails-rsync-unrecognized-option-no-human-readable.md
- Whether it reproduces under Tauri. [...] Predicted to reproduce (shared code), but predicted is
  not measured.
- Which call site builds the flag list, and whether other rsync flags in the same invocation are
  also unsupported. [...]
- Whether Homebrew rsync [...] masks this on some developer machines [...]

$ grep -rn "moveOnUnix\|moveInstall" src/backend/storeManagers/legendary/games.ts src/backend/storeManagers/gog/games.ts
src/backend/storeManagers/legendary/games.ts:359:    const moveImpl = isWindows ? moveOnWindows : moveOnUnix
src/backend/storeManagers/gog/games.ts:782:    const moveImpl = isWindows ? moveOnWindows : moveOnUnix

$ grep -vE '^\s*(//|\*|/\*)' src/backend/utils.ts | grep -n "rsyncFlavour\|no-human-readable"
1057:  let rsyncFlavour: 'gnu' | 'openrsync' | null = null
1067:      rsyncFlavour === 'openrsync'
1072:            '--no-human-readable',
```
(Full command outputs recorded in `260905-upz-AUDIT.md`, Section 2.)

### The claim that MAY now be made

The single call site is `moveOnUnix` in `src/backend/utils.ts`, invoked identically by both
`legendary/games.ts:359` and `gog/games.ts:782`. Both of this todo's answerable "Not yet
established" clauses are now answered by that shared function: the flag list is now
flavour-branched (so the "other flags" concern — `--info=name,progress`, the second flag openrsync
rejects — is already handled, not left for a future incremental discovery), and the call site is
unambiguously identified. The third clause (Homebrew rsync masking) is explanatory speculation, not
a discharge-blocking condition.

### The claim that still may NOT be made

That this was reproduced or re-tested live under Tauri in this session. The "reproduces under
Tauri" clause is closed on the fact that `moveOnUnix` is shared, unconditional, platform code — not
on an observed Tauri-leg move.

### Residue and its owner

None. Same root cause and fix as
`.planning/todos/completed/2026-08-24-move-game-is-broken-on-macos-rsync-flags-openrsync-rejects.md`.
