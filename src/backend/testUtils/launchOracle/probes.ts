/**
 * Injected platform and probes for the Phase 88 launch oracles (88-04, D-13).
 *
 * Every launch target (mac, linux, windows) is recorded on one machine. The launcher reads the
 * host through `backend/constants/environment` (`isMac`, `isLinux`, `isWindows`, ...), through
 * `process.platform` and through probes such as `os.release()`. Each injector here changes one of
 * those and returns a restore function; `withInjected` runs a case and calls every restore in
 * reverse order in `finally`.
 *
 * No `jest.mock` is added: the backend-di-ceilings jestMock ratchet counts it. Constants and
 * plain properties are swapped with `jest.replaceProperty`, a method with `jest.spyOn`, and
 * `process.platform` with `Object.defineProperty` (its descriptor is restored, not its value).
 */
import {
  mockPlatform,
  type OraclePlatform
} from 'backend/testUtils/engineWineOracle/harness'
import * as osPath from 'backend/utils/os/path'

const NODE_PLATFORM: Readonly<Record<OraclePlatform, NodeJS.Platform>> = {
  mac: 'darwin',
  linux: 'linux',
  windows: 'win32'
}

/**
 * Makes both `backend/constants/environment` and `process.platform` say the host is `platform`.
 * Returns the restore function, which puts the original descriptor of `process.platform` back.
 */
export function injectPlatform(platform: OraclePlatform): () => void {
  const restoreConstants = mockPlatform(platform)
  const original = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', {
    value: NODE_PLATFORM[platform],
    configurable: true,
    enumerable: true,
    writable: false
  })
  return () => {
    if (original) Object.defineProperty(process, 'platform', original)
    restoreConstants()
  }
}

/**
 * Replaces `target[name]` with `impl` until the returned restore function is called. A function
 * property (such as `os.release`) is spied on; any other property is replaced.
 */
export function injectProbe<T extends object, K extends keyof T & string>(
  target: T,
  name: K,
  impl: T[K]
): () => void {
  if (typeof target[name] === 'function') {
    const spy = jest.spyOn(
      target as Record<string, (...args: never[]) => unknown>,
      name
    )
    spy.mockImplementation(impl as unknown as (...args: never[]) => unknown)
    return () => spy.mockRestore()
  }
  const replaced = jest.replaceProperty(target, name, impl)
  return () => replaced.restore()
}

/**
 * Makes `searchForExecutableOnPath(name)` answer from `found` (88.1-01, D-13): a name that maps to a
 * path resolves to it, a name that maps to `null` or is absent from the map resolves to `null`.
 * The real PATH is never scanned, so a launch case can say "gamescope is installed" or "gamemoderun is
 * not" on any machine. A `jest.spyOn` on the module object (never `jest.mock`); the returned function
 * restores it.
 */
export function injectExecutableOnPath(
  found: Record<string, string | null>
): () => void {
  const spy = jest.spyOn(osPath, 'searchForExecutableOnPath')
  spy.mockImplementation((executable: string) =>
    Promise.resolve(found[executable] ?? null)
  )
  return () => spy.mockRestore()
}

/**
 * The answer of `onlineMonitor.isOnline()` for a case that does not build a whole launcher deps object.
 * Returns the fake monitor (`{ isOnline }`) and the number of times it was asked, so a case can pin
 * both the branch it took and that it asked. `createFakeLauncherDeps` builds the same shape from its
 * `online` option; this is the stand-alone form for the pure builders.
 */
export function injectOnline(online: boolean): {
  monitor: { isOnline: () => boolean }
  asked: () => number
} {
  let asked = 0
  return {
    monitor: {
      isOnline: () => {
        asked += 1
        return online
      }
    },
    asked: () => asked
  }
}

/**
 * Runs `fn`, then calls every restore in reverse order, also when `fn` throws. A restore that
 * throws does not stop the others; the first such error is rethrown after all have run (unless
 * `fn` itself threw, which wins).
 */
export async function withInjected<T>(
  restores: readonly (() => void)[],
  fn: () => Promise<T> | T
): Promise<T> {
  let result: T | undefined
  let caseFailure: { error: unknown } | null = null
  try {
    result = await fn()
  } catch (error) {
    caseFailure = { error }
  }
  let restoreFailure: { error: unknown } | null = null
  for (const restore of [...restores].reverse()) {
    try {
      restore()
    } catch (error) {
      restoreFailure ??= { error }
    }
  }
  if (caseFailure) throw caseFailure.error
  if (restoreFailure) throw restoreFailure.error
  return result as T
}
