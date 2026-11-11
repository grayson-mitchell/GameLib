/**
 * A fresh Steam bottle helper instance for consumer tests (D-66.3-15), built over the given test
 * stores and config so it reads the same bottle config store the suite seeds. Two calls never
 * share state. The real instance is built on the first method call, not at creation, and the
 * bottle module is required lazily: a suite that mocks the bottle module wholesale (or one that
 * never touches the bottle) can still build its deps, and only a call it did not script fails.
 */
import type {
  SteamBottle,
  SteamBottleDeps
} from '../storeManagers/steam/bottle'

const METHODS = [
  'configStore',
  'persistedWineBins',
  'isCrossoverInstalled',
  'isSteamBottleProvisioned',
  'isBottleReady',
  'getSteamBottleSettings',
  'persistBottleWineVersion',
  'resolveCrossoverWine'
] as const satisfies readonly (keyof SteamBottle)[]

export function createTestSteamBottle(deps: SteamBottleDeps): SteamBottle {
  let real: SteamBottle | undefined
  const instance = (): SteamBottle => {
    if (!real) {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { createSteamBottle } =
        require('../storeManagers/steam/bottle') as typeof import('../storeManagers/steam/bottle')
      /* eslint-enable @typescript-eslint/no-require-imports */
      real = createSteamBottle(deps)
    }
    return real
  }
  const bottle: Record<string, unknown> = {}
  for (const name of METHODS) {
    bottle[name] = (...args: unknown[]) =>
      (instance()[name] as (...a: unknown[]) => unknown)(...args)
  }
  return bottle as unknown as SteamBottle
}
