/**
 * A fresh, isolated app runtime for consumer tests (66.4-17). Plain object, no jest APIs: every
 * call builds its own event bus and launch flights, so two tests never share
 * state. The launch flights are the Rust-table glue (88.3-18) over a fake of that table
 * (`fakeLaunchFlightTransport.ts`), one per call. The chain is required lazily (testServices builds one by default for every
 * suite, and loading it at import would pull `backend/utils` in ahead of suites that mock it).
 */
import type { AppRuntime } from '../appRuntime'
import type { RustInvokeDeps } from '../host/rustInvokeDeps'
import { createFakeLaunchFlightTransport } from './fakeLaunchFlightTransport'

export function createTestAppRuntime(
  transport: RustInvokeDeps = createFakeLaunchFlightTransport().deps
): AppRuntime {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createAppRuntime } =
    require('../appRuntime') as typeof import('../appRuntime')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return createAppRuntime({ transport: () => transport })
}
