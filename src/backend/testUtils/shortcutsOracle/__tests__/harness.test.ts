/**
 * Self-tests for the Phase 94 shortcut oracle harness (94-05): the behaviours every later shortcut
 * golden plan relies on, and the vacuous-pass negatives that keep a golden suite from going green
 * over nothing.
 *
 * Goldens are written to a throwaway directory (`overrideGoldenRoot`) inside a fake HOME profile,
 * never to the committed crate. Every call passes its mode explicitly, so the suite does not depend
 * on `GAMELIB_WRITE_SHORTCUTS_GOLDEN`. Nothing here reads the real HOME or touches the network.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import gracefulFs from 'graceful-fs'
import {
  assertManifest,
  expandPlaceholders,
  expectEmptyCasesToFail,
  goldenDir,
  makePng,
  mockPlatform,
  normalisePaths,
  overrideGoldenRoot,
  portablePath,
  readTree,
  recordDelta,
  recordRequestedModes,
  shortcutsGoldenMode,
  syncManifest,
  withShortcutsOracleProfile,
  writeOrCompareGolden
} from '../harness'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import * as environment from 'backend/constants/environment'

/** Runs `fn` with goldens pointed at a fresh temp directory. */
async function withScratchGoldens<T>(
  fn: (root: string) => Promise<T> | T
): Promise<T> {
  const scratch = createFakeHomeProfile({ prefix: 'gamelib-sc-harness-test-' })
  const restore = overrideGoldenRoot(join(scratch.root, 'golden'))
  try {
    return await fn(join(scratch.root, 'golden'))
  } finally {
    restore()
    scratch.dispose()
  }
}

describe('shortcuts oracle harness', () => {
  describe('profile and placeholders', () => {
    it('gives every case a fresh profile under the fake HOME and disposes it', async () => {
      let first = ''
      let second = ''
      await withShortcutsOracleProfile((profile) => {
        first = profile.home
        expect(profile.fake.env.HOME).toBe(profile.home)
        expect(profile.desktop).toBe(join(profile.home, 'Desktop'))
        expect(existsSync(join(profile.home, '.config', 'GameLib'))).toBe(true)
      })
      await withShortcutsOracleProfile((profile) => {
        second = profile.home
      })
      expect(first).not.toBe(second)
      expect(existsSync(first)).toBe(false)
      expect(existsSync(second)).toBe(false)
    })

    it('normalises every profile root to its placeholder, most specific first, leaving other strings alone', async () => {
      await withShortcutsOracleProfile((profile) => {
        const value = {
          a: `${profile.shellExe} --x`,
          b: [profile.icons, profile.desktop, profile.appData, profile.home],
          c: '/not/the/profile',
          d: 7
        }
        expect(normalisePaths(value, profile)).toEqual({
          a: '<SHELL_EXE> --x',
          b: ['<ICONS>', '<DESKTOP>', '<APPDATA>', '<HOME>'],
          c: '/not/the/profile',
          d: 7
        })
        expect(normalisePaths(profile.home, profile)).toBe('<HOME>')
      })
    })

    it('expandPlaceholders inverts normalisePaths', async () => {
      await withShortcutsOracleProfile((profile) => {
        const text = join(profile.home, 'Desktop', 'x.desktop')
        expect(expandPlaceholders(normalisePaths(text, profile), profile)).toBe(
          text
        )
      })
    })

    it('portablePath turns a host separator into a slash and nothing else', () => {
      expect(portablePath('<HOME>\\Applications\\a b.app')).toBe(
        '<HOME>/Applications/a b.app'
      )
      expect(portablePath('a/b')).toBe('a/b')
    })

    it('mockPlatform changes process.platform and the environment flags, and restores both', () => {
      const real = process.platform
      const realIsMac = environment.isMac
      const restore = mockPlatform(real === 'darwin' ? 'linux' : 'darwin')
      expect(process.platform).not.toBe(real)
      expect(environment.isMac).toBe(real !== 'darwin')
      restore()
      expect(process.platform).toBe(real)
      expect(environment.isMac).toBe(realIsMac)
    })

    it('makePng yields a PNG of the asked size', () => {
      const png = makePng(64)
      expect([...png.subarray(0, 8)]).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
      ])
      expect(png.readUInt32BE(16)).toBe(64)
      expect(png.readUInt32BE(20)).toBe(64)
    })
  })

  describe('requested modes and tree snapshots', () => {
    it('records the mode a file was written with, from the call, and still writes it', async () => {
      await withShortcutsOracleProfile(async (profile) => {
        const modes = recordRequestedModes()
        try {
          const file = join(profile.home, 'a.desktop')
          await writeFile(file, 'x', { mode: 0o777 })
          const script = join(profile.home, 'run.sh')
          writeFileSync(script, 'y')
          gracefulFs.chmodSync(script, '755')
          const plain = join(profile.home, 'plain')
          await writeFile(plain, 'z')
          expect(modes.get(file)).toBe('0777')
          expect(modes.get(script)).toBe('0755')
          expect(modes.get(plain)).toBeUndefined()
          expect(readFileSync(file, 'utf8')).toBe('x')
        } finally {
          modes.restore()
        }
      })
    })

    it('stops recording once restored', async () => {
      await withShortcutsOracleProfile(async (profile) => {
        const modes = recordRequestedModes()
        modes.restore()
        const file = join(profile.home, 'b')
        await writeFile(file, 'x', { mode: 0o755 })
        expect(modes.get(file)).toBeUndefined()
      })
    })

    it('reads files with their requested mode, symlinks with a normalised target, dangling links as leaves and opaque files without bytes', async () => {
      await withShortcutsOracleProfile((profile) => {
        const modes = recordRequestedModes()
        try {
          const root = join(profile.home, 'Applications')
          mkdirSync(join(root, 'A.app', 'Contents', 'MacOS'), {
            recursive: true
          })
          const run = join(root, 'A.app', 'Contents', 'MacOS', 'run.sh')
          writeFileSync(run, `#!/bin/sh\n${profile.shellExe}\n`)
          gracefulFs.chmodSync(run, '755')
          writeFileSync(join(root, 'A.app', 'icon.icns'), 'binary')
          writeFileSync(join(root, 'bin.dat'), Buffer.from([0xff, 0xfe, 0x00]))
          mkdirSync(profile.desktop, { recursive: true })
          symlinkSync(
            join(root, 'A.app'),
            join(profile.desktop, 'A.app'),
            'dir'
          )
          symlinkSync(join(root, 'gone.app'), join(profile.desktop, 'gone.app'))

          const tree = readTree(root, {
            profile,
            modes,
            opaque: (p) => p.endsWith('icon.icns')
          })
          expect(tree).toEqual([
            {
              path: 'A.app/Contents/MacOS/run.sh',
              kind: 'file',
              mode: '0755',
              utf8: '#!/bin/sh\n<SHELL_EXE>\n'
            },
            { path: 'A.app/icon.icns', kind: 'file', opaque: true },
            { path: 'bin.dat', kind: 'file', mode: null, base64: '//4A' }
          ])
          expect(readTree(profile.desktop, { profile, modes })).toEqual([
            {
              path: 'A.app',
              kind: 'symlink',
              symlinkTarget: '<HOME>/Applications/A.app'
            },
            {
              path: 'gone.app',
              kind: 'symlink',
              symlinkTarget: '<HOME>/Applications/gone.app'
            }
          ])
          expect(
            readTree(join(profile.home, 'missing'), { profile, modes })
          ).toEqual([])
        } finally {
          modes.restore()
        }
      })
    })
  })

  describe('golden write and compare', () => {
    it('write mode writes <slice>/<case>.json and compare mode accepts the same value', async () => {
      await withScratchGoldens(() => {
        writeOrCompareGolden('s', 'c', { a: 1, b: ['x'] }, 'write')
        expect(existsSync(join(goldenDir('s'), 'c.json'))).toBe(true)
        expect(() =>
          writeOrCompareGolden('s', 'c', { a: 1, b: ['x'] }, 'compare')
        ).not.toThrow()
      })
    })

    it('compare mode fails on a mutated golden, on a changed value and on a missing golden', async () => {
      await withScratchGoldens(() => {
        writeOrCompareGolden('s', 'c', { a: 1 }, 'write')
        expect(() =>
          writeOrCompareGolden('s', 'c', { a: 2 }, 'compare')
        ).toThrow()
        writeFileSync(join(goldenDir('s'), 'c.json'), '{"a": 1}\n')
        expect(() =>
          writeOrCompareGolden('s', 'c', { a: 1 }, 'compare')
        ).toThrow()
        expect(() =>
          writeOrCompareGolden('s', 'other', { a: 1 }, 'compare')
        ).toThrow(/golden is missing/)
      })
    })

    it('refuses a case id that is not one plain name', async () => {
      await withScratchGoldens(() => {
        for (const id of ['', '../x', 'a/b', 'a\\b', '.hidden']) {
          expect(() => writeOrCompareGolden('s', id, 1, 'write')).toThrow(
            /not a plain name/
          )
        }
      })
    })

    it('the default mode is compare unless GAMELIB_WRITE_SHORTCUTS_GOLDEN is 1', () => {
      const saved = process.env.GAMELIB_WRITE_SHORTCUTS_GOLDEN
      try {
        delete process.env.GAMELIB_WRITE_SHORTCUTS_GOLDEN
        expect(shortcutsGoldenMode()).toBe('compare')
        process.env.GAMELIB_WRITE_SHORTCUTS_GOLDEN = '1'
        expect(shortcutsGoldenMode()).toBe('write')
        process.env.GAMELIB_WRITE_SHORTCUTS_GOLDEN = 'true'
        expect(shortcutsGoldenMode()).toBe('compare')
      } finally {
        if (saved === undefined)
          delete process.env.GAMELIB_WRITE_SHORTCUTS_GOLDEN
        else process.env.GAMELIB_WRITE_SHORTCUTS_GOLDEN = saved
      }
    })
  })

  describe('MANIFEST floor', () => {
    it('an empty case list fails the floor (the vacuous pass)', async () => {
      await withScratchGoldens(() => {
        expect(() => expectEmptyCasesToFail('s', 3)).not.toThrow()
        expect(() => assertManifest('s', [], 3, 'write')).toThrow(
          /below the floor/
        )
      })
    })

    it('a floor of zero is refused as itself vacuous', () => {
      expect(() => assertManifest('s', ['a'], 0, 'write')).toThrow(
        /positive integer/
      )
    })

    it('write mode records { count, floor } and never lowers a committed floor', async () => {
      await withScratchGoldens(() => {
        syncManifest('s', ['a', 'b', 'c'], 3, 'write')
        const read = () =>
          JSON.parse(
            readFileSync(join(goldenDir('s'), 'MANIFEST.json'), 'utf8')
          ) as { count: number; floor: number }
        expect(read()).toEqual({ count: 3, floor: 3 })
        syncManifest('s', ['a', 'b', 'c', 'd'], 2, 'write')
        expect(read()).toEqual({ count: 4, floor: 3 })
        syncManifest('s', ['a'], 9, 'compare')
        expect(read()).toEqual({ count: 4, floor: 3 })
      })
    })

    it('compare mode fails on a missing manifest, a count mismatch, a lowered floor and a stray or missing golden', async () => {
      await withScratchGoldens(() => {
        const ids = ['a', 'b', 'c']
        for (const id of ids) writeOrCompareGolden('s', id, id, 'write')
        expect(() => assertManifest('s', ids, 3, 'compare')).toThrow(
          /MANIFEST.json is missing/
        )
        syncManifest('s', ids, 3, 'write')
        expect(() => assertManifest('s', ids, 3, 'compare')).not.toThrow()
        // The test's own floor wins over a manifest lowered by hand.
        expect(() => assertManifest('s', ids, 4, 'compare')).toThrow(
          /below the floor/
        )
        expect(() => assertManifest('s', [...ids, 'd'], 3, 'compare')).toThrow()
        writeFileSync(join(goldenDir('s'), 'stray.json'), '{}\n')
        expect(() => assertManifest('s', ids, 3, 'compare')).toThrow()
      })
    })

    it('compare mode fails on two case ids that differ only by case', async () => {
      await withScratchGoldens(() => {
        syncManifest('s', ['a', 'A'], 2, 'write')
        expect(() => assertManifest('s', ['a', 'A'], 2, 'compare')).toThrow()
      })
    })

    it('write mode removes goldens no case produces any more', async () => {
      await withScratchGoldens(() => {
        writeOrCompareGolden('s', 'keep', 1, 'write')
        writeOrCompareGolden('s', 'drop', 1, 'write')
        syncManifest('s', ['keep'], 1, 'write')
        expect(existsSync(join(goldenDir('s'), 'keep.json'))).toBe(true)
        expect(existsSync(join(goldenDir('s'), 'drop.json'))).toBe(false)
        expect(existsSync(join(goldenDir('s'), 'MANIFEST.json'))).toBe(true)
      })
    })
  })

  describe('deltas', () => {
    it('records a documented Rust difference, sorted, and requires a reason', async () => {
      await withScratchGoldens(() => {
        recordDelta('s', 'b-case', 'Rust writes the bundle atomically')
        recordDelta('s', 'a-case', 'Rust rejects a title over 255 bytes')
        const file = join(goldenDir('s'), 'deltas.json')
        expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')))).toEqual([
          'a-case',
          'b-case'
        ])
        expect(() => recordDelta('s', 'c-case', '  ')).toThrow(/needs a reason/)
        // deltas.json is not a case golden.
        syncManifest('s', [], 1, 'write')
        expect(existsSync(file)).toBe(true)
      })
    })
  })
})
