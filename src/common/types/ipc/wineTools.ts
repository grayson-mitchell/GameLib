import type {
  ExecResult,
  Runner,
  RunWineCommandArgs,
  ToolArgs,
  WineCommandArgs,
  WineInstallation,
  WinetricksApplyResult,
  WinetricksComponent,
  WinetricksLogLine,
  WinetricksQueueState,
  WineVersionInfo
} from '../../types'

export interface WineToolsAsync {
  runWineCommand: (
    args: WineCommandArgs
  ) => Promise<{ stdout: string; stderr: string }>
  winetricksInstalled: (runner: Runner, appName: string) => Promise<string[]>
  winetricksAvailable: (
    runner: Runner,
    appName: string
  ) => Promise<WinetricksComponent[]>
  // Phase 45 Plan 01 (D-11/D-12/D-13): the sequential-install queue. Phase 45 Plan 02 (D-11
  // promote) then retired the send-kind `winetricksInstall` that used to sit above this block --
  // `winetricksApply` is now the only renderer-reachable install path.
  winetricksApply: (
    runner: Runner,
    appName: string,
    verbs: string[]
  ) => Promise<WinetricksApplyResult>
  winetricksQueueState: (
    runner: Runner,
    appName: string
  ) => Promise<WinetricksQueueState>
  winetricksCancelRemaining: (
    runner: Runner,
    appName: string
  ) => Promise<WinetricksQueueState>
  getAlternativeWine: () => Promise<WineInstallation[]>
  runWineCommandForGame: (args: RunWineCommandArgs) => Promise<ExecResult>
  installWineVersion: (release: WineVersionInfo) => Promise<void>
  refreshWineVersionInfo: (fetch?: boolean) => Promise<void>
  removeWineVersion: (release: WineVersionInfo) => Promise<void>
  'wine.isValidVersion': (release: WineInstallation) => Promise<boolean>
  toggleDXVK: (args: ToolArgs) => Promise<boolean>
  toggleVKD3D: (args: ToolArgs) => Promise<boolean>
  toggleDXVKNVAPI: (args: ToolArgs) => Promise<boolean>
}

export interface WineToolsFrontendMessages {
  wineVersionsUpdated: () => void
  progressOfWinetricks: (payload: {
    messages: string[]
    installingComponent: string
    // Set only on the `['Done']` event: true when winetricks exited non-zero
    // (or by signal). Absent on every intermediate progress event.
    failed?: boolean
    // Populated by Phase 45 Plan 06; unused (always undefined) by this plan.
    lines?: WinetricksLogLine[]
    percent?: number
  }) => void
  'installing-winetricks-component': (component: string) => void
  // Phase 45 Plan 01 (D-11/D-12/D-13): pushed on every queue-state transition for the
  // currently-open game's winetricks tab.
  winetricksQueueChanged: (state: WinetricksQueueState) => void
}
