/**
 * Tracer for the Phase 88 launchOracle harness (88-04): one case recorded and compared on a pinned
 * base env with an injected platform, written through the Phase 87 `writeOrCompareGolden` into a
 * throwaway fixtures root (never a committed crate). Also pins the two things that must not leak
 * out of a case: `process.env` and `process.platform`.
 */
import { join } from 'path'
import os from 'os'
import * as environment from 'backend/constants/environment'
import {
  normalisePaths,
  withEngineOracleProfile,
  writeOrCompareGolden
} from 'backend/testUtils/engineWineOracle/harness'
import { overrideFixturesRoot } from 'backend/testUtils/engineWineOracle/recorder'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import { PINNED_BASE, withPinnedBaseEnv } from '../baseEnv'
import { injectPlatform, injectProbe, withInjected } from '../probes'

const CRATE = 'gamelib-selftest'
const SLICE = 'launch'
const SENTINEL = 'GAMELIB_ORACLE_LEAK_SENTINEL'

/** A recorded case: the full env, sorted, and the platform, with profile paths normalised. */
async function recordCase(
  platform: 'mac' | 'linux' | 'windows',
  poison: boolean
): Promise<{ env: Record<string, string | undefined>; platform: string }> {
  return withEngineOracleProfile((profile) =>
    withInjected([injectPlatform(platform)], () =>
      withPinnedBaseEnv(profile.fake, () => {
        if (poison) process.env.DYLD_INSERT_LIBRARIES = '/leak.dylib'
        const sorted = Object.fromEntries(
          Object.entries(process.env).sort(([a], [b]) => a.localeCompare(b))
        )
        return normalisePaths(
          { env: sorted, platform: process.platform },
          profile
        )
      })
    )
  )
}

describe('withPinnedBaseEnv', () => {
  const saved = process.env[SENTINEL]
  beforeEach(() => {
    process.env[SENTINEL] = 'real-shell-value'
    process.env.DYLD_FALLBACK_LIBRARY_PATH = '/real/dyld'
    process.env.LD_PRELOAD = '/real/ld'
  })
  afterEach(() => {
    if (saved === undefined) delete process.env[SENTINEL]
    else process.env[SENTINEL] = saved
    delete process.env.DYLD_FALLBACK_LIBRARY_PATH
    delete process.env.LD_PRELOAD
  })

  it('holds exactly the fake HOME eight plus the three pinned keys', async () => {
    const realHome = process.env.HOME
    await withEngineOracleProfile((profile) =>
      withPinnedBaseEnv(profile.fake, () => {
        const keys = Object.keys(process.env).sort()
        expect(keys).toHaveLength(11)
        expect(keys).toEqual(
          [...Object.keys(profile.fake.env), ...Object.keys(PINNED_BASE)].sort()
        )
        for (const key of keys) {
          expect(key.startsWith('DYLD_')).toBe(false)
          expect(key.startsWith('LD_')).toBe(false)
        }
        expect(process.env[SENTINEL]).toBeUndefined()
        expect(process.env.HOME).toBe(profile.home)
        if (realHome !== undefined && realHome !== profile.home) {
          expect(Object.values(process.env)).not.toContain(realHome)
        }
        expect(process.env.PATH).toBe(PINNED_BASE.PATH)
        expect(process.env.LANG).toBe(PINNED_BASE.LANG)
        expect(process.env.USER).toBe(PINNED_BASE.USER)
      })
    )
  })

  it('puts the original process.env back, also when the case throws', async () => {
    const before = process.env
    const snapshot = { ...process.env }
    const fake = createFakeHomeProfile({ prefix: 'gamelib-launch-oracle-' })
    try {
      await expect(
        withPinnedBaseEnv(fake, () => {
          process.env.MUTATED_IN_CASE = '1'
          throw new Error('boom')
        })
      ).rejects.toThrow('boom')
    } finally {
      fake.dispose()
    }
    expect(process.env).toBe(before)
    expect(process.env).toEqual(snapshot)
    expect(process.env.MUTATED_IN_CASE).toBeUndefined()
  })
})

describe('injectPlatform', () => {
  it('flips environment and process.platform together and restores both', () => {
    const wasPlatform = process.platform
    const wasMac = environment.isMac
    const wasLinux = environment.isLinux
    const wasWindows = environment.isWindows
    const restore = injectPlatform('windows')
    expect(process.platform).toBe('win32')
    expect(environment.isWindows).toBe(true)
    expect(environment.isMac).toBe(false)
    expect(environment.isLinux).toBe(false)
    restore()
    expect(process.platform).toBe(wasPlatform)
    expect(environment.isMac).toBe(wasMac)
    expect(environment.isLinux).toBe(wasLinux)
    expect(environment.isWindows).toBe(wasWindows)
  })
})

describe('injectProbe and withInjected', () => {
  it('replaces a method probe such as os.release and restores it, in reverse order', async () => {
    const real = os.release()
    const order: string[] = []
    await withInjected(
      [
        injectProbe(os, 'release', () => '24.1.0'),
        () => order.push('second-restore')
      ],
      () => {
        expect(os.release()).toBe('24.1.0')
      }
    )
    expect(os.release()).toBe(real)
    expect(order).toEqual(['second-restore'])
  })

  it('runs every restore, last registered first, even when the case throws', async () => {
    const order: string[] = []
    await expect(
      withInjected([() => order.push('a'), () => order.push('b')], () => {
        throw new Error('case failed')
      })
    ).rejects.toThrow('case failed')
    expect(order).toEqual(['b', 'a'])
  })
})

describe('the tracer round trip', () => {
  it('records then compares one pinned-env, platform-injected case and nothing leaks out', async () => {
    const scratch = createFakeHomeProfile({ prefix: 'gamelib-launch-golden-' })
    const restoreRoot = overrideFixturesRoot(join(scratch.root, 'fixtures'))
    const platformBefore = process.platform
    const envBefore = process.env
    try {
      const first = await recordCase('linux', true)
      expect(Object.keys(first.env)).toHaveLength(12)
      // The poison is set inside the case, so it is recorded; it must not survive the case.
      expect(process.env.DYLD_INSERT_LIBRARIES).toBeUndefined()
      expect(process.env).toBe(envBefore)
      expect(process.platform).toBe(platformBefore)
      expect(first.platform).toBe('linux')
      expect(first.env.HOME).toBe('<HOME>')
      expect(first.env.APPDATA).toBe('<HOME>/AppData/Roaming')

      // The env without the in-case poison: exactly 11 keys, as the golden stores them.
      const clean = await recordCase('linux', false)
      expect(Object.keys(clean.env)).toHaveLength(11)
      expect(
        Object.keys(clean.env).some(
          (k) => k.startsWith('DYLD_') || k.startsWith('LD_')
        )
      ).toBe(false)

      writeOrCompareGolden(
        CRATE,
        SLICE,
        'linux-clean',
        { result: clean },
        'write'
      )
      // A second case on a different fresh profile compares equal: the golden holds placeholders.
      const again = await recordCase('linux', false)
      writeOrCompareGolden(
        CRATE,
        SLICE,
        'linux-clean',
        { result: again },
        'compare'
      )
      // A different platform is a different golden.
      const mac = await recordCase('mac', false)
      expect(() =>
        writeOrCompareGolden(
          CRATE,
          SLICE,
          'linux-clean',
          { result: mac },
          'compare'
        )
      ).toThrow()
    } finally {
      restoreRoot()
      scratch.dispose()
    }
    expect(process.platform).toBe(platformBefore)
    expect(process.env).toBe(envBefore)
  })
})
