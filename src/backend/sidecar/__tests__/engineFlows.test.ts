/**
 * Phase 61 Plan 13, 87-52: the engine registration file. `getEngineState` was its last handle and is the
 * scheduled resolver in `engineWineResolvers.ts` now (its cases are in `engineWineResolvers.test.ts`), so
 * `registerEngineFlows` registers nothing; 87-53 deletes it. This pins that no channel has two owners (D-06).
 */
const handlers = new Map<string, (...a: unknown[]) => Promise<unknown>>()

const ipc = {
  handle: (ch: string, fn: (...a: unknown[]) => unknown) => {
    handlers.set(ch, fn as (...a: unknown[]) => Promise<unknown>)
  }
}

import { registerEngineFlows } from '../engineFlowRegistration'
import { createTestServices } from 'backend/testUtils/testServices'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import { createTestSteamBottle } from 'backend/testUtils/testSteamBottle'
import { createTestSteamLaunchRuntime } from 'backend/testUtils/testSteamLaunchRuntime'
import { createTestEngineState } from 'backend/testUtils/testEngineState'
import {
  createTestEngineServices,
  createTestManagers,
  createTestStores
} from 'backend/testUtils/testServices'

const stores = createTestStores()
const config = createTestGlobalConfig()
const engineServices = createTestEngineServices()

describe('engine flows', () => {
  it('registers no channel: getEngineState is a resolver and the other four are native engine channels', () => {
    registerEngineFlows({
      ipc,
      managers: createTestManagers(),
      stores,
      spawnAsync: createTestServices().spawnAsync,
      runner: createTestServices().runner,
      config,
      engineState: createTestEngineState(),
      engineRuntime: engineServices.engineRuntime,
      paths: engineServices.paths,
      steamBottle: createTestSteamBottle({ stores, config }),
      steamLaunchRuntime: createTestSteamLaunchRuntime()
    })
    expect([...handlers.keys()]).toEqual([])
  })
})
