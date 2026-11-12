/**
 * A fresh, isolated Steam bridge runtime for consumer tests (66.4-08). Plain object, no jest APIs:
 * every call builds its own clone flights, entitlement signer and shared-redist installer, so two
 * tests never share state. Required lazily (testServices builds one by default for every suite, and
 * loading it at import would pull the bridge modules in ahead of suites that mock them).
 */
import { createTestAbortRegistry } from './testAbortRegistry'
import { createTestVersioning } from './testStoreRoot'
import type { BridgeRuntime } from '../storeManagers/steam/bridge/bridgeRuntime'

type BridgeRuntimeVersioning = Parameters<
  typeof import('../storeManagers/steam/bridge/bridgeRuntime').createBridgeRuntime
>[0]['versioning']

export function createTestBridgeRuntime(
  opts: {
    aborts?: Parameters<
      typeof import('../storeManagers/steam/bridge/bridgeRuntime').createBridgeRuntime
    >[0]['aborts']
    versioning?: BridgeRuntimeVersioning
  } = {}
): BridgeRuntime {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createBridgeRuntime } =
    require('../storeManagers/steam/bridge/bridgeRuntime') as typeof import('../storeManagers/steam/bridge/bridgeRuntime')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return createBridgeRuntime({
    aborts: opts.aborts ?? createTestAbortRegistry(),
    versioning: opts.versioning ?? createTestVersioning()
  })
}
