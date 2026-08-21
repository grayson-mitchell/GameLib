---
created: 2026-08-22T07:52:00.000Z
title: "A game that becomes UNINSTALLED is trapped on nonAvailableGames forever — isGameAvailable() returns false for a not-installed game, so reconciliation can never heal the entry, in ALL FOUR runners"
area: frontend/library
status: CLOSED
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

## CLOSED 2026-08-22 — live gate PASSED

Ran the two-`mv` repro at the top of this file against the shipped fix (`086e1ed4f`), on the dev
server started 09:10 (i.e. after the fix commit). Steam client not running, so nothing rewrote the
ACF underneath the run.

### Setup, verified before the run

`appmanifest_259130.acf` and `common/Wasteland` (378 MB) moved to
`~/Library/Application Support/Steam/gamelib-37-08-backup/`, while
`store_cache/steam_library.json` still held `259130` as `is_installed: true` with
`install_path` → `common/Wasteland`. That is step 1 of the trap, confirmed present rather than
assumed.

### Evidence

| time | event | reading |
|---|---|---|
| 10:58:11 | `[refreshLibrary] origin=nav-tabs-games-tab` | trap arms |
| 10:58:11 | guard: `1 owned Steam game(s) silently excluded ... 259130` | entry pushed, card excluded |
| 10:58:12 | `Steam library sync complete: 378 games` | backend flips `is_installed: false`, `install: {}` (verified in the cache file, mtime 10:58:12) |
| 10:58:12 | guard fires ×2 | **expected** — see the noise note below |
| 11:00:07 | `[refreshLibrary] origin=action-icons-refresh-button` | second, decisive refresh |
| 11:00:08 | `Steam library sync complete: 378 games` | |
| 11:00:08 | `refreshLibrary complete runner=all managers=6` | |
| — | **ZERO guard firings after the second sync** | **PASS** |

`buildEngineDeps` re-reads `nonAvailableGames` from localStorage on every `libraryUnion` change,
so a silent guard on a fresh sync means the entry is gone from localStorage. The card could not
re-add it: `handleNonAvailableGames`'s only call site is the GameCard status effect's *installed*
branch, and the game is no longer installed.

Non-vacuous against recorded RED: pre-fix, this exact appid on this exact machine gave "did a
refresh, game did not appear" with the header at 380 and the guard firing ~10 times across two
launches and a refresh.

Card visibility was **inferred, not observed**: the guard proves `259130` left
`nonAvailableAppNames`, and `filterEngine.isNonAvailableGame` is that list OR the delisted clause
(`is_delisted: false` here), so nothing else excludes it.

### ⚠ The guard is a noise generator on a NORMAL heal — do not read a firing as a failure

`findSilentlyExcludedGames` runs in a synchronous effect on the render that receives the new
`libraryUnion`; `reconcileNonAvailableGames` is `async`. So on a **successful** heal the order is
necessarily: libraryUnion updates → guard fires → reconcile resolves → `reconcileTick` bumps →
`engineDeps` rebuilds (tick IS in its dep array, `index.tsx:732`) → guard silent. Transient
firings followed by silence is what success looks like. The heal itself is **never logged**, so
the log alone cannot separate success from failure on a single refresh — the discriminator is a
SECOND `libraryUnion` change with no firing.

This is the ledgered "anomaly-only probe that also fires on normal use" shape, and this file's own
sibling ledger (`uninstall-game-vanishes.md`) records the same trap for its `DIAG-vanish` probes.
**Worth a follow-up: log the healed app_names in `Library/index.tsx`'s reconcile effect** when
`healed.length > 0`, so the gate is decidable from the log without a second refresh.

### Item 2 (cross-runner) — reasoned, NOT measured

Recorded explicitly rather than left implied. The trap is present in gog/nile/legendary by source
reading (table above), and the fix is runner-agnostic — it keys on `game.is_installed` from the
union and never consults a runner-specific path. But it was OBSERVED healing only a **steam**
game. No gog/nile/legendary game was uninstalled to confirm. Anyone relying on the cross-runner
claim must measure it.

### Item 3 (close the parked vanish session) — RULED OUT, see below

Files restored after the run: `appmanifest_259130.acf` and `common/Wasteland` are back in place.

## CORRECTION — this is NOT the parked vanish defect. Do not close that session.

The "This is almost certainly the parked vanish defect's root cause" section above told the reader
to verify against `uninstall-game-vanishes.md`'s recorded symptoms rather than assume. **Verified,
and the match FAILS on two independent, user-confirmed properties:**

| property | parked vanish defect (`uninstall-game-vanishes.md`) | this trap (37-08) |
|---|---|---|
| **Pressing Refresh** | **heals it** — "Pressing Refresh — without changing view or filters — makes it reappear" (final, user-verified) | **does NOT heal it** — user, 2026-08-22 pre-fix: "did a refresh, game did not appear" |
| **App restart** | **heals it** — "An app restart also works, but is not required" | **does NOT heal it** — the entry is in localStorage, so it survives every restart; that permanence is the whole defect |
| backend state while invisible | `is_installed: **true**` with a full `install` object (re-confirmed for KCD2) | `is_installed` flips to **false**; the stale entry outlives it |
| trigger | an `is_installed` TRANSITION in **either** direction via a single `pushGameToLibrary` upsert (recurred on INSTALL as G-23.2-01) | `is_installed: true` while `install_path` no longer exists on disk |

Both sit in family (b), render-time exclusion — that much is shared, and it is why the hypothesis
was reasonable. But a localStorage-backed list cannot produce a symptom that a refresh clears, and
it cannot produce one that a restart clears either. They are different mechanisms.

**`uninstall-game-vanishes.md` stays `parked` and remains the SOLE live record** (`sole_owner:
true` — no phase ledger carries it, so `/gsd-audit-uat` cannot resurface it). Do not archive it.

The real narrowing this run does contribute is recorded in that file directly.
