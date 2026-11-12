/**
 * The GOG per-boot state (D-05, 66.4-10): the in-memory library and installed-game maps, the presence
 * keep-alive slot, the resume-progress baselines, the credential cache with its single in-flight
 * spawn, and the e2e gogdl stub slot. Each was module-level state; they are now closure fields of the
 * factories below, built once by the 'gog-runtime' boot step and read through ManagerDeps.gogRuntime.
 *
 * Construction allocates empty maps and counters only: no I/O, no timer, no handle (sidecar exit
 * contract). The presence interval is armed later, by presence.setPresence, on the boot clock; the
 * clock unrefs it (no keepAlive), so it can never be the reason the process cannot exit (260913-901).
 * This module stays light (type-only imports besides the two small factories) so suites that mock
 * backend paths or utils do not pull them in through createTestServices.
 */
import type { GameInfo, InstalledInfo } from 'common/types'
import type { GOGCredentials } from 'common/types/gog'
import type { Clock, TimerHandle } from 'backend/process/types'
import type { CredentialsWithVerdict } from './user'
import { createGogdlStubs, type GogdlStubs } from './e2eMock'
import {
  createGogResumeBaselines,
  type GogResumeBaselines
} from './resumeProgress'

interface GogLibraryState {
  library: Map<string, GameInfo>
  installedGames: Map<string, InstalledInfo>
}

function createGogLibraryState(): GogLibraryState {
  return { library: new Map(), installedGames: new Map() }
}

const GOG_PRESENCE_INTERVAL_MS = 5 * 60 * 1000

interface GogPresence {
  getCurrentGame(): string
  setCurrentGame(game: string): void
  /** Arms the repeating keep-alive if none is armed. Returns true when it armed one. */
  armKeepAlive(tick: () => void): boolean
  /** Clears the keep-alive, if any, so a later armKeepAlive re-arms. */
  clearKeepAlive(): void
}

function createGogPresence(deps: { clock: Clock }): GogPresence {
  let currentGame = ''
  let interval: TimerHandle | undefined
  return {
    getCurrentGame: () => currentGame,
    setCurrentGame(game) {
      currentGame = game
    },
    armKeepAlive(tick) {
      if (interval) return false
      interval = deps.clock.setInterval(tick, GOG_PRESENCE_INTERVAL_MS)
      return true
    },
    clearKeepAlive() {
      if (interval) deps.clock.clear(interval)
      interval = undefined
    }
  }
}

/** The `gogdl auth` credential cache: session-lifetime TTL plus the one in-flight spawn. */
interface GogCredentialCache<C extends { expires_in: number }, V> {
  /** The cached credentials while they are inside their own stated lifetime, else undefined. */
  getFresh(): C | undefined
  put(credentials: C): void
  clear(): void
  /** Joins the one in-flight fetch, or starts `start` as that fetch (single-flight). */
  singleFlight(start: () => Promise<V>): Promise<V>
}

const CREDENTIALS_EXPIRY_SAFETY_MARGIN_MS = 60_000

function createGogCredentialCache<C extends { expires_in: number }, V>(deps: {
  clock: Clock
}): GogCredentialCache<C, V> {
  let cached: C | undefined
  let fetchedAt = 0
  let inFlight: Promise<V> | null = null
  return {
    getFresh() {
      if (
        cached &&
        deps.clock.now() - fetchedAt <
          cached.expires_in * 1000 - CREDENTIALS_EXPIRY_SAFETY_MARGIN_MS
      ) {
        return cached
      }
      return undefined
    },
    put(credentials) {
      cached = credentials
      fetchedAt = deps.clock.now()
    },
    clear() {
      cached = undefined
      fetchedAt = 0
    },
    async singleFlight(start) {
      if (inFlight) return inFlight
      const started = start()
      inFlight = started
      try {
        return await started
      } finally {
        if (inFlight === started) inFlight = null
      }
    }
  }
}

export interface GogRuntime {
  libraryState: GogLibraryState
  presence: GogPresence
  resumeBaselines: GogResumeBaselines
  credentials: GogCredentialCache<GOGCredentials, CredentialsWithVerdict>
  stubs: GogdlStubs
}

export function createGogRuntime(deps: { clock: Clock }): GogRuntime {
  return {
    libraryState: createGogLibraryState(),
    presence: createGogPresence(deps),
    resumeBaselines: createGogResumeBaselines(),
    credentials: createGogCredentialCache(deps),
    stubs: createGogdlStubs()
  }
}
