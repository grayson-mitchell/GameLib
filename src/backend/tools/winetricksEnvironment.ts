import { Runner, WinetricksEnvironmentReport } from 'common/types'

// Phase 45 Plan 01 (D-16): environment-level warnings (unsupported Wine
// version, missing host dependencies) surfaced alongside a queue run, kept
// in a module-level Map rather than on `WinetricksQueueRun` itself -- these
// can be known even with no run in flight (e.g. right after the tab mounts),
// and must survive a run ending. No timers, no watchers: this module is pure
// state plus a single change-listener slot, same contract as the queue
// (`winetricksQueue.ts`) it feeds.
const reports = new Map<string, WinetricksEnvironmentReport>()

function key(runner: Runner, appName: string): string {
  return `${runner}:${appName}`
}

function emptyReport(): WinetricksEnvironmentReport {
  return { unsupportedWineVersion: null, missingDependencies: [] }
}

let changeListener: ((runner: Runner, appName: string) => void) | null = null

export function onEnvironmentChanged(
  listener: (runner: Runner, appName: string) => void
): void {
  changeListener = listener
}

export function getEnvironmentReport(
  runner: Runner,
  appName: string
): WinetricksEnvironmentReport {
  const report = reports.get(key(runner, appName))
  if (!report) {
    return emptyReport()
  }
  // Fresh copy -- callers must never be able to mutate the stored report
  // through the value they were handed.
  return { ...report, missingDependencies: [...report.missingDependencies] }
}

export function recordMissingDependencies(
  runner: Runner,
  appName: string,
  deps: string[]
): void {
  const k = key(runner, appName)
  const current = reports.get(k) ?? emptyReport()
  if (
    current.missingDependencies.length === deps.length &&
    current.missingDependencies.every((dep, i) => dep === deps[i])
  ) {
    return
  }
  reports.set(k, { ...current, missingDependencies: [...deps] })
  changeListener?.(runner, appName)
}

export function recordUnsupportedWine(
  runner: Runner,
  appName: string,
  version: string
): void {
  const k = key(runner, appName)
  const current = reports.get(k) ?? emptyReport()
  if (current.unsupportedWineVersion === version) {
    return
  }
  reports.set(k, { ...current, unsupportedWineVersion: version })
  changeListener?.(runner, appName)
}
