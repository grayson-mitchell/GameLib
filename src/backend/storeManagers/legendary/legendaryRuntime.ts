/**
 * The Legendary (Epic) per-boot state (D-05, 66.4-11): the account-game set, the installed-game map,
 * the in-memory library map and the e2e legendary stub slot. They were module-level state in
 * library.ts and e2eMock.ts; they are now closure fields of the factories below, built once by the
 * 'legendary-runtime' boot step and read through ManagerDeps.legendaryRuntime.
 *
 * Construction allocates empty collections only: no I/O, no timer, no handle (sidecar exit contract).
 * This module stays light (type-only imports besides the stub factory) so suites that mock backend
 * modules do not pull more in through createTestServices.
 */
import type { GameInfo } from 'common/types'
import type { InstalledJsonMetadata } from 'common/types/legendary'
import { createLegendaryStubs, type LegendaryStubs } from './e2eMock'

interface LegendaryLibraryState {
  /** Every app name found in the account's metadata folder. */
  allGames: Set<string>
  /** Replaced wholesale by refreshInstalled. */
  installedGames: Map<string, InstalledJsonMetadata>
  library: Map<string, GameInfo>
}

function createLegendaryLibraryState(): LegendaryLibraryState {
  return {
    allGames: new Set(),
    installedGames: new Map(),
    library: new Map()
  }
}

export interface LegendaryRuntime {
  libraryState: LegendaryLibraryState
  stubs: LegendaryStubs
}

export function createLegendaryRuntime(): LegendaryRuntime {
  return {
    libraryState: createLegendaryLibraryState(),
    stubs: createLegendaryStubs()
  }
}
