import type {
  ConnectivityStatus,
  GamepadActionArgs,
  RunnerCommandStub
} from '../../types'

// ts-prune-ignore-next
export interface TestStubsSync {
  createNewWindow: (url: string) => void
  clearDMFinished: () => void
  'connectivity-changed': (newStatus: ConnectivityStatus) => void
}

/*
 * These events should only be used during tests to stub/mock
 *
 * We have to handle them in another interface because these
 * events don't have an IpcMainEvent first argument when handled
 */
// ts-prune-ignore-next
export interface TestStubsTestSync {
  setLegendaryCommandStub: (stubs: RunnerCommandStub[]) => void
  resetLegendaryCommandStub: () => void
  setGogdlCommandStub: (stubs: RunnerCommandStub[]) => void
  resetGogdlCommandStub: () => void
  setNileCommandStub: (stubs: RunnerCommandStub[]) => void
  resetNileCommandStub: () => void
}

// ts-prune-ignore-next
export interface TestStubsAsync {
  updateAll: () => Promise<({ status: 'done' | 'error' | 'abort' } | null)[]>
  gamepadAction: (args: GamepadActionArgs) => Promise<void>
}
