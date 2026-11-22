/**
 * Fresh, isolated Legendary and Nile runtimes for consumer tests (66.4-11). Every call builds its own
 * collections, login flight and stub slot, so two tests never share state. Required lazily so suites
 * that mock legendary or nile modules are not pulled in at import.
 */
import type { LegendaryRuntime } from '../storeManagers/legendary/legendaryRuntime'
import type { InfoCaches } from '../services/types'
import type { NileRuntime } from '../storeManagers/nile/nileRuntime'

export function createTestLegendaryRuntime(): LegendaryRuntime {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createLegendaryRuntime } =
    require('../storeManagers/legendary/legendaryRuntime') as typeof import('../storeManagers/legendary/legendaryRuntime')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return createLegendaryRuntime()
}

export function createTestNileRuntime(): NileRuntime {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createNileRuntime } =
    require('../storeManagers/nile/nileRuntime') as typeof import('../storeManagers/nile/nileRuntime')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return createNileRuntime()
}

/** A fresh system-info cache (66.4-12): one per call, so two tests never share a memo. */
export function createTestInfoCaches(): InfoCaches {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createSystemInfoCache } =
    require('../utils/systeminfo') as typeof import('../utils/systeminfo')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    systemInfo: createSystemInfoCache()
  }
}
