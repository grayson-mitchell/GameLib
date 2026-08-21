---
created: 2026-08-22T07:52:00.000Z
title: "A game that becomes UNINSTALLED is trapped on nonAvailableGames forever — isGameAvailable() returns false for a not-installed game, so reconciliation can never heal the entry, in ALL FOUR runners"
area: frontend/library
status: "FRONTEND FIX LANDED 2026-08-22 (quick task 260822-b05, commit 086e1ed4f) -- live re-verification, cross-runner (gog/nile/legendary) confirmation, and closing uninstall-game-vanishes.md are still OWED by 37-08. Do NOT close this todo."
severity: major
resolves_phase: 37
planned_as: 37-08
surfaced_by: "Live session 2026-08-22 while setting up the 37-01 depot-decode gate — found by accident, root-caused on the spot"
files:
  - src/frontend/hooks/constants.ts
  - src/frontend/screens/Library/index.tsx
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/gog/games.ts
  - src/backend/storeManagers/nile/games.ts
  - src/backend/storeManagers/legendary/games.ts
---

## Symptom

An owned game vanishes from the library grid entirely — not shown as uninstalled, **gone** — and
cannot be reinstalled, because the thing you would click to reinstall it is the thing that is
hidden. Reproduced live on 2026-08-22 with appid **259130** (Wasteland 1). Library header went
**381 -> 380**.

## Deterministic repro — TWO COMMANDS

This is the headline. The sibling `uninstall-game-vanishes` defect has been PARKED SINCE
2026-07-22 for want of a steady reproduction; it could only ever be caught as a transient
post-uninstall flicker. This reproduces it on demand, every launch:

```bash
cd ~/Library/Application\ Support/Steam/steamapps
mv appmanifest_259130.acf /tmp/           # game is no longer "installed"
mv common/Wasteland /tmp/                 # install_path no longer exists
```

Relaunch GameLib. The game is gone and stays gone across restarts and across manual refreshes.

## Root cause — exact, verified by source reading

`isGameAvailable()` returns `false` for a NOT-INSTALLED game. Verified in **all four** runners:

| runner | file | shape |
|---|---|---|
| steam | `storeManagers/steam/games.ts:2707` | `Boolean(info?.is_installed && install_path && existsSync(...))` |
| gog | `storeManagers/gog/games.ts` | `if (info && info.is_installed) {...}` then falls through to `resolve(false)` |
| nile | `storeManagers/nile/games.ts` | `Boolean(info?.is_installed && install_path && existsSync(...))` |
| legendary | `storeManagers/legendary/games.ts` | `if (!info.is_installed) return false` |

`reconcileNonAvailableGames()` (`frontend/hooks/constants.ts:153`) heals an entry ONLY when
`handleNonAvailableGames()` -> `window.api.isGameAvailable()` returns `true`. Since a
not-installed game can never return `true`, **the entry is trapped permanently.**

The self-sealing loop, observed live end to end:

1. Store said `is_installed: true` with `install_path` pointing at content that no longer
   existed. GameCard called `handleNonAvailableGames` -> `false` -> appid pushed onto
   `nonAvailableGames`.
2. A manual Steam refresh corrected the backend **perfectly**: log line `Steam library sync
   complete: 378 games`, and `steam_library.json` was rewritten at 07:52:17 with
   `is_installed: false`, `install: {}`.
3. `reconcileNonAvailableGames` then asked `isGameAvailable()`, which now returned `false` for a
   **different reason** (not installed), so the entry was NOT healed.
4. Game stays hidden -> its GameCard never mounts -> the card's own removal path never runs.
5. Repeats on every launch and every refresh.

**The backend state was correct and the game was still invisible.** That is the whole defect in
one sentence.

## This is almost certainly the parked vanish defect's root cause

`.planning/debug/uninstall-game-vanishes.md` (parked 2026-07-22) concluded the fault was
"something `SteamLibraryManager.refresh()` does to the frontend that a single `pushGameToLibrary`
upsert does not". This mechanism explains it exactly: an uninstall flips `is_installed` to
`false`, which makes `isGameAvailable()` false **forever after**, trapping the entry. Check
whether that session can be closed by this fix — do not assume it, verify against its recorded
symptoms.

## The guard from 51b175d74 WORKED — detection is not the gap

The `findSilentlyExcludedGames` guard shipped the same morning caught this and named both the
game and the mechanism, ~10 times across two launches and one refresh:

```
(07:52:17) [ERROR] [Frontend]: Library: 1 owned Steam game(s) silently excluded from
library grid by stale nonAvailableGames entry: 259130
```

That fix's detection half is sound; its reconciliation half asks a question that can no longer
return yes. Do not re-do the detection work.

## Fix in flight

Quick task **`260822-b05`** is fixing the frontend reconciliation semantics:
`reconcileNonAvailableGames` must treat "not installed" as "this exclusion no longer applies,
drop the entry" rather than "still unavailable". The list only ever means *an INSTALLED game
whose install_path went missing* — `handleNonAvailableGames`'s `installed` branch is the only
writer — so an entry for a not-installed game is meaningless by construction.

Fixing the FRONTEND is deliberate: `isGameAvailable` has four runner implementations and other
callers, so redefining its meaning is far higher-risk. One runner-agnostic frontend fix covers
all four runners at once.

## What 37-08 still owes after that lands

1. **Live re-verification** with the two-command repro above — the fix is not proven by a green
   suite. This repo has a ledgered lesson of a live gate beating a green suite three times.
2. **Verify the cross-runner claim.** The trap is present in gog/nile/legendary by source
   reading, but was only OBSERVED on steam. Confirm the frontend fix actually heals a
   gog/nile/legendary game, or record explicitly that it is reasoned-not-measured.
3. **Close or update `.planning/debug/uninstall-game-vanishes.md`** if this accounts for it.
4. **Do NOT over-correct.** An installed game with a genuinely missing `install_path` must still
   be excluded. A fix that never excludes anything would pass every test while silently deleting
   the feature.

## Status update 2026-08-22 (quick task 260822-b05)

The frontend fix described above ("Fix in flight") has landed: `src/frontend/hooks/constants.ts`
now extracts a single `dropFromNonAvailableGames` mutator/persister and
`reconcileNonAvailableGames` drops a `!game.is_installed` entry directly instead of consulting
`isGameAvailable`. Three unit tests added (regression proven RED at HEAD before the fix,
over-correction guard, delisted-independence premise pin), all green after; `tsc --noEmit` clean;
zero eslint errors on the two touched files; full `Frontend` jest project green (112/112 suites,
1868/1868 tests, no regressions). Commit `086e1ed4f` on `fix/steam-native-install-stability`.

**Still owed by 37-08 (explicitly NOT done here — scope discipline, see the quick task's PLAN.md
`<out_of_scope>`):**
1. Live re-verification with the two-command repro above. A green suite does not prove this —
   this repo has a ledgered lesson of a live gate beating a green suite three times.
2. Confirm the fix actually heals a gog/nile/legendary game (currently reasoned-not-measured;
   only steam was observed live).
3. Close or update `.planning/debug/uninstall-game-vanishes.md` if this accounts for it.

## Not to be confused with

The **22-games** todo (fixed 2026-08-22, `51b175d74`) — that was a hydration race plus this
list's self-sealing nature, and it is a different mechanism from the not-installed trap here.
The **nine false-delisted games** (37-03) are a third, unrelated mechanism. All three hide owned
games from the grid; none of them is the same bug.
