/**
 * A fresh, isolated GOG runtime for consumer tests (66.4-10). Every call builds its own library maps,
 * presence slot, resume baselines, credential cache and stub slot on its own fake clock, so two tests
 * never share state. Required lazily so suites that mock gog modules are not pulled in at import.
 */
import type { GogRuntime } from '../storeManagers/gog/gogRuntime'
import { createFakeClock } from './fakeClock'

export function createTestGogRuntime(
  clock: ReturnType<typeof createFakeClock> = createFakeClock()
): GogRuntime {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createGogRuntime } =
    require('../storeManagers/gog/gogRuntime') as typeof import('../storeManagers/gog/gogRuntime')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return createGogRuntime({ clock })
}
