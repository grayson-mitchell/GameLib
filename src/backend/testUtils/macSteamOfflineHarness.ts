/**
 * Test harness for `createMacSteamOffline` (66.2 plan 09). The wrap and debt
 * suites describe a scenario with a hand-driven clock (`now`, `sleep`), a
 * running probe and a recording opener. This adapts that description to the
 * runner and clock the instance is built from, so the instance's own pgrep
 * mapping, clock timers and openDetached path are what the suites exercise.
 * One instance per deps object: calls with the same deps share state, exactly
 * as one boot-built instance does in production.
 */
import type { Clock, ProcessRunner, RunResult } from '../process/types'
import {
  createMacSteamOffline,
  type MacSteamOffline,
  type MacSteamOfflineDeps
} from '../storeManagers/steam/macSteamOffline'

/** Timers at or above this delay run on the real (or jest-faked) global timer. */
const MAC_STEAM_HARNESS_LONG_TIMER_MS = 60_000

export interface MacSteamOfflineHarness {
  instanceFor(deps: MacSteamOfflineDeps): MacSteamOffline
  /** Settles the in-session goonline confirmation of every instance built so far. */
  settleAll(): Promise<void>
}

export function createMacSteamOfflineHarness(): MacSteamOfflineHarness {
  const instances = new Map<MacSteamOfflineDeps, MacSteamOffline>()
  const result = (code: number): RunResult => ({
    code,
    signal: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    aborted: false,
    truncated: false,
    pid: undefined
  })
  return {
    instanceFor(deps) {
      const existing = instances.get(deps)
      if (existing) return existing
      let nextId = 1
      const cancelled = new Set<number>()
      const runner: Pick<ProcessRunner, 'run' | 'openDetached'> = {
        run: () => deps.isSteamRunning().then((ok) => result(ok ? 0 : 1)),
        openDetached: (url) => deps.openUrlDetached(url)
      }
      const clock: Clock = {
        now: () => deps.now(),
        setTimeout: (fn, ms) => {
          const id = nextId++
          const fire = () => {
            if (!cancelled.has(id)) fn()
          }
          if (ms >= MAC_STEAM_HARNESS_LONG_TIMER_MS) {
            setTimeout(fire, ms).unref()
          } else {
            void deps.sleep(ms).then(fire)
          }
          return { id }
        },
        setInterval: () => {
          throw new Error('unexpected setInterval')
        },
        clear: (h) => void cancelled.add(h.id)
      }
      const { platform, connectionLogPath, openUrl, onlineDebtPath } = deps
      const { versioning } = deps
      const { isPidAlive, selfPid, systemBootMs } = deps
      const built = createMacSteamOffline({
        runner,
        clock,
        platform,
        connectionLogPath,
        openUrl,
        onlineDebtPath,
        versioning,
        isPidAlive,
        selfPid,
        systemBootMs
      })
      instances.set(deps, built)
      return built
    },
    async settleAll() {
      for (const i of instances.values()) await i.onlineConfirmSettled()
    }
  }
}
