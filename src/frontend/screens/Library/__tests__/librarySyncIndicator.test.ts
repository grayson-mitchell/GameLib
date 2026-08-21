import {
  resolveSteamSyncIndicator,
  SteamSyncIndicatorInput,
  SteamSyncIndicatorMode
} from '../librarySyncIndicator'
import type { SteamSyncStatus } from 'common/types/ipc'

// 34.15 D-09 -- exhaustive state matrix + a saboteur reproducing the shipped
// bug. See `librarySyncIndicator.ts`'s own header for why this file cannot
// import anything from `Library/index.tsx` (no jsdom, no CSS transform in
// the Frontend jest project).

describe('resolveSteamSyncIndicator -- 34.15 D-06/D-08/D-09/D-10', () => {
  // Full cross product: steamLoggedIn x steamSyncStatus x steamLibraryCount
  // = 2 x 3 x 2 = 12 rows. Named for the user-visible situation each
  // describes, not for its input tuple.
  const rows: {
    name: string
    input: SteamSyncIndicatorInput
    mode: SteamSyncIndicatorMode
  }[] = [
    {
      name: 'logged out, idle, empty library -> hidden (no Steam account, nothing to show)',
      input: {
        steamLoggedIn: false,
        steamSyncStatus: 'idle',
        steamLibraryCount: 0
      },
      mode: 'hidden'
    },
    {
      name: 'logged out, idle, populated library -> hidden',
      input: {
        steamLoggedIn: false,
        steamSyncStatus: 'idle',
        steamLibraryCount: 12
      },
      mode: 'hidden'
    },
    {
      name: 'logged out, syncing, empty library -> hidden (never leak the indicator to a logged-out user)',
      input: {
        steamLoggedIn: false,
        steamSyncStatus: 'syncing',
        steamLibraryCount: 0
      },
      mode: 'hidden'
    },
    {
      name: 'logged out, syncing, populated library -> hidden',
      input: {
        steamLoggedIn: false,
        steamSyncStatus: 'syncing',
        steamLibraryCount: 12
      },
      mode: 'hidden'
    },
    {
      name: 'logged out, sync failed, empty library -> hidden',
      input: {
        steamLoggedIn: false,
        steamSyncStatus: 'failed',
        steamLibraryCount: 0
      },
      mode: 'hidden'
    },
    {
      name: 'logged out, sync failed, populated library -> hidden',
      input: {
        steamLoggedIn: false,
        steamSyncStatus: 'failed',
        steamLibraryCount: 12
      },
      mode: 'hidden'
    },
    {
      name: 'logged in, idle, empty library -> hidden (the DEFECT: the old guard spun forever here)',
      input: {
        steamLoggedIn: true,
        steamSyncStatus: 'idle',
        steamLibraryCount: 0
      },
      mode: 'hidden'
    },
    {
      name: 'logged in, idle, populated library -> hidden (steady state, nothing to report)',
      input: {
        steamLoggedIn: true,
        steamSyncStatus: 'idle',
        steamLibraryCount: 12
      },
      mode: 'hidden'
    },
    {
      name: 'logged in, syncing, empty library -> syncing (nothing else on screen to look at)',
      input: {
        steamLoggedIn: true,
        steamSyncStatus: 'syncing',
        steamLibraryCount: 0
      },
      mode: 'syncing'
    },
    {
      name: "logged in, syncing, populated library -> hidden (a refresh of a populated library is LibraryHeader's job, not a second surface)",
      input: {
        steamLoggedIn: true,
        steamSyncStatus: 'syncing',
        steamLibraryCount: 12
      },
      mode: 'hidden'
    },
    {
      name: 'logged in, sync failed, empty library -> failed (refresh ran and then FAILED -- the case existing coverage never reached)',
      input: {
        steamLoggedIn: true,
        steamSyncStatus: 'failed',
        steamLibraryCount: 0
      },
      mode: 'failed'
    },
    {
      name: 'logged in, sync failed, cached games on screen -> failed (a stale library must not look successful)',
      input: {
        steamLoggedIn: true,
        steamSyncStatus: 'failed',
        steamLibraryCount: 12
      },
      mode: 'failed'
    }
  ]

  it('the truth table covers the full 12-row cross product', () => {
    expect(rows).toHaveLength(12)
  })

  for (const row of rows) {
    it(`${row.name} -> ${row.mode}`, () => {
      const result = resolveSteamSyncIndicator(row.input)
      expect(result.mode).toBe(row.mode)
    })
  }

  describe('saboteurs -- each disagrees with the real function on a named input', () => {
    it('reproducesShippedGuard: the shipped `steam?.username && library.length === 0 && refreshingInTheBackground` reduction disagrees with the real function on the idle/empty row -- THIS IS THE DEFECT, encoded as a test', () => {
      // refreshingInTheBackground defaults true and is reset to true after
      // every unscoped refresh, so the shipped guard reduces to exactly
      // this: logged in AND library empty, regardless of sync status.
      function reproducesShippedGuard(input: SteamSyncIndicatorInput): boolean {
        return input.steamLoggedIn && input.steamLibraryCount === 0
      }

      const idleEmptyRow: SteamSyncIndicatorInput = {
        steamLoggedIn: true,
        steamSyncStatus: 'idle',
        steamLibraryCount: 0
      }

      expect(reproducesShippedGuard(idleEmptyRow)).toBe(true)

      const real = resolveSteamSyncIndicator(idleEmptyRow)
      expect(real.mode).toBe('hidden')
    })

    it('hidesFailureWhenGamesPresent: a saboteur that adds `&& steamLibraryCount === 0` to the failed branch disagrees with the real function on a failed sync behind a cached library -- pins that a failure is surfaced even when games are on screen', () => {
      function hidesFailureWhenGamesPresent(
        input: SteamSyncIndicatorInput
      ): SteamSyncIndicatorMode {
        if (!input.steamLoggedIn) return 'hidden'
        // DEFECT: only surfaces failure when the library also happens to be
        // empty, hiding a failure behind a cached library.
        if (
          input.steamSyncStatus === 'failed' &&
          input.steamLibraryCount === 0
        ) {
          return 'failed'
        }
        if (
          input.steamSyncStatus === 'syncing' &&
          input.steamLibraryCount === 0
        ) {
          return 'syncing'
        }
        return 'hidden'
      }

      const failedWithGamesRow: SteamSyncIndicatorInput = {
        steamLoggedIn: true,
        steamSyncStatus: 'failed',
        steamLibraryCount: 12
      }

      expect(hidesFailureWhenGamesPresent(failedWithGamesRow)).toBe('hidden')

      const real = resolveSteamSyncIndicator(failedWithGamesRow)
      expect(real.mode).toBe('failed')
    })

    it('leaksIndicatorWhenLoggedOut: a saboteur that drops the steamLoggedIn guard disagrees with the real function on a logged-out sync -- pins that a logged-out user never sees a Steam sync surface', () => {
      function leaksIndicatorWhenLoggedOut(
        input: SteamSyncIndicatorInput
      ): SteamSyncIndicatorMode {
        // DEFECT: evaluates status/count without checking steamLoggedIn
        // first.
        if (input.steamSyncStatus === 'failed') return 'failed'
        if (
          input.steamSyncStatus === 'syncing' &&
          input.steamLibraryCount === 0
        ) {
          return 'syncing'
        }
        return 'hidden'
      }

      const loggedOutSyncingRow: SteamSyncIndicatorInput = {
        steamLoggedIn: false,
        steamSyncStatus: 'syncing',
        steamLibraryCount: 0
      }

      expect(leaksIndicatorWhenLoggedOut(loggedOutSyncingRow)).toBe('syncing')

      const real = resolveSteamSyncIndicator(loggedOutSyncingRow)
      expect(real.mode).toBe('hidden')
    })
  })

  it('D-09: refresh ran and then FAILED -- the case existing coverage never reached', () => {
    const status: SteamSyncStatus = 'failed'
    const result = resolveSteamSyncIndicator({
      steamLoggedIn: true,
      steamSyncStatus: status,
      steamLibraryCount: 0
    })
    expect(result.mode).toBe('failed')
  })
})
