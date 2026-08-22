/**
 * Phase 34.9 gap cycle, plan 14: fixture coverage for meta/cleanDist.ts
 * (F-34.9-02). Generalized to win/linux by quick task 260822-hrf, item 11
 * (IN-03). Every fixture is a synthetic temp tree built with
 * `fs.mkdtempSync` under `os.tmpdir()` and torn down in `afterEach` --
 * nothing here touches the repo's real `dist/` directory.
 *
 * Win/linux coverage in this file is synthetic-fixture-only: this suite
 * runs on macOS arm64 (Darwin 25.5.0), so there is no live win/linux build
 * to clean. Nothing here should be read as proof of live win/linux
 * behaviour -- see meta/cleanDist.ts's header comment.
 *
 * `electron-builder.yml` is parsed structurally with `js-yaml` (the
 * precedent established by src/backend/__tests__/packagingConfig.test.ts,
 * typed via src/common/typedefs/js-yaml.d.ts), not regexed -- the file
 * carries a multi-line explanatory comment above `mac.files` that itself
 * mentions "Windows and Linux" and "macOS-specific", so a raw-text/regex
 * check on the whole file could be satisfied by comment prose alone rather
 * than the actual `artifactName` values.
 */
import { load as loadYaml } from 'js-yaml'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  cleanDist,
  distArtifactEntries,
  MAC_ARTIFACT_TOKEN,
  type Platform
} from '../cleanDist'

const ELECTRON_BUILDER_PATH = join(
  __dirname,
  '..',
  '..',
  'electron-builder.yml'
)
const PACKAGE_JSON_PATH = join(__dirname, '..', '..', 'package.json')
const CLEAN_DIST_SOURCE_PATH = join(__dirname, '..', 'cleanDist.ts')

interface ElectronBuilderConfig {
  mac: { artifactName: string }
  win: { artifactName: string }
  portable: { artifactName: string }
  linux: { artifactName: string }
}

function parseElectronBuilder(): ElectronBuilderConfig {
  // readFileSync(ELECTRON_BUILDER_PATH) reads electron-builder.yml; loadYaml
  // (js-yaml) parses it structurally rather than regexing the raw text.
  return loadYaml(
    readFileSync(ELECTRON_BUILDER_PATH, 'utf-8')
  ) as ElectronBuilderConfig
}

// The five macOS artifact files a real dist:mac run leaves behind, per the
// 2026-08-11 gate's real `dist/` listing (34.9-14-PLAN.md <interfaces>).
const MAC_FILES = [
  'GameLib-0.7.0-macOS-arm64.dmg',
  'GameLib-0.7.0-macOS-arm64.dmg.blockmap',
  'GameLib-0.7.0-macOS-arm64.zip',
  'GameLib-0.7.0-macOS-arm64.zip.blockmap',
  'latest-mac.yml'
]

// Synthetic win artifacts, shaped from electron-builder.yml's win/portable
// artifactName templates -- `dist:win` produces the `-Setup-` family from
// win's default nsis target, `release:win` additionally produces the
// `-Portable-` family from the separate `portable` target.
const WIN_FILES = [
  'GameLib-0.7.0-Setup-x64.exe',
  'GameLib-0.7.0-Setup-x64.exe.blockmap',
  'GameLib-0.7.0-Portable-x64.exe',
  'latest.yml'
]

// Synthetic linux artifacts, shaped from electron-builder.yml's linux
// artifactName template plus the AppImage/deb targets release:linux builds.
const LINUX_FILES = [
  'GameLib-0.7.0-linux-x64.AppImage',
  'GameLib-0.7.0-linux-x64.deb',
  'latest-linux.yml'
]

// Present in every fixture; must survive every platform's clean.
const COMMON_FILES = ['builder-debug.yml']

const NON_MAC_FILES = [...WIN_FILES, ...LINUX_FILES, 'builder-debug.yml']

/**
 * Builds the real-shaped mac-only fixture: the five macOS artifact files, a
 * `mac-arm64/GameLib.app/Contents/Info.plist` staging tree, and the win +
 * linux entries that must survive a mac-only clean. Byte-equivalent to the
 * pre-generalization fixture this test file inherited from
 * meta/cleanDistMac.ts.
 */
function buildFixture(distDir: string): void {
  mkdirSync(distDir, { recursive: true })

  for (const name of MAC_FILES) {
    writeFileSync(join(distDir, name), `content of ${name}`)
  }

  const contentsDir = join(distDir, 'mac-arm64', 'GameLib.app', 'Contents')
  mkdirSync(contentsDir, { recursive: true })
  writeFileSync(join(contentsDir, 'Info.plist'), '<plist>fixture</plist>')

  for (const name of NON_MAC_FILES) {
    writeFileSync(join(distDir, name), `content of ${name}`)
  }
}

/**
 * Builds a fixture holding all three platforms' artifacts simultaneously --
 * the shape that proves cross-platform NON-deletion, not just deletion.
 * Includes a per-platform staging directory for each of mac/win/linux plus
 * one entry (`builder-debug.yml`) that belongs to none of them and must
 * survive every platform's clean.
 */
function buildCrossPlatformFixture(distDir: string): void {
  mkdirSync(distDir, { recursive: true })

  for (const name of MAC_FILES) {
    writeFileSync(join(distDir, name), `content of ${name}`)
  }
  const macContentsDir = join(distDir, 'mac-arm64', 'GameLib.app', 'Contents')
  mkdirSync(macContentsDir, { recursive: true })
  writeFileSync(join(macContentsDir, 'Info.plist'), '<plist>fixture</plist>')

  for (const name of WIN_FILES) {
    writeFileSync(join(distDir, name), `content of ${name}`)
  }
  mkdirSync(join(distDir, 'win-unpacked'), { recursive: true })
  writeFileSync(
    join(distDir, 'win-unpacked', 'GameLib.exe'),
    'win staging fixture'
  )

  for (const name of LINUX_FILES) {
    writeFileSync(join(distDir, name), `content of ${name}`)
  }
  mkdirSync(join(distDir, 'linux-unpacked'), { recursive: true })
  writeFileSync(
    join(distDir, 'linux-unpacked', 'gamelib'),
    'linux staging fixture'
  )

  for (const name of COMMON_FILES) {
    writeFileSync(join(distDir, name), `content of ${name}`)
  }
}

describe('distArtifactEntries', () => {
  let distDir: string

  afterEach(() => {
    if (distDir) rmSync(distDir, { recursive: true, force: true })
  })

  test('on the real-shaped mac fixture, returns exactly the five macOS files plus mac-arm64/', () => {
    distDir = mkdtempSync(join(tmpdir(), 'clean-dist-entries-'))
    buildFixture(distDir)

    const entries = distArtifactEntries(distDir, 'mac')

    expect(entries.sort()).toEqual([...MAC_FILES, 'mac-arm64'].sort())
  })

  test('does not return any of the non-macOS entries', () => {
    distDir = mkdtempSync(join(tmpdir(), 'clean-dist-entries-negative-'))
    buildFixture(distDir)

    const entries = distArtifactEntries(distDir, 'mac')

    for (const name of NON_MAC_FILES) {
      expect(entries).not.toContain(name)
    }
  })

  test('returns [] for a distDir that does not exist', () => {
    const entries = distArtifactEntries(
      join(tmpdir(), 'clean-dist-does-not-exist-xyz'),
      'mac'
    )
    expect(entries).toEqual([])
  })
})

describe('cleanDist', () => {
  let distDir: string

  afterEach(() => {
    if (distDir) rmSync(distDir, { recursive: true, force: true })
  })

  test('removes the five macOS files and mac-arm64/, leaves non-macOS entries byte-identical', () => {
    distDir = mkdtempSync(join(tmpdir(), 'clean-dist-clean-'))
    buildFixture(distDir)

    const before: Record<string, string> = {}
    for (const name of NON_MAC_FILES) {
      before[name] = readFileSync(join(distDir, name), 'utf-8')
    }

    const { removed, kept } = cleanDist(distDir, 'mac')

    expect(removed.sort()).toEqual([...MAC_FILES, 'mac-arm64'].sort())
    expect(kept.sort()).toEqual([...NON_MAC_FILES].sort())

    for (const name of MAC_FILES) {
      expect(existsSync(join(distDir, name))).toBe(false)
    }
    expect(existsSync(join(distDir, 'mac-arm64'))).toBe(false)

    for (const name of NON_MAC_FILES) {
      expect(existsSync(join(distDir, name))).toBe(true)
      expect(readFileSync(join(distDir, name), 'utf-8')).toBe(before[name])
    }
  })

  test('on a distDir that does not exist, returns empty arrays and does not throw', () => {
    const target = join(tmpdir(), 'clean-dist-nonexistent-xyz')
    expect(existsSync(target)).toBe(false)

    let result: { removed: string[]; kept: string[] } | undefined
    expect(() => {
      result = cleanDist(target, 'mac')
    }).not.toThrow()

    expect(result).toEqual({ removed: [], kept: [] })
  })

  test('a macOS-named symlink pointing outside distDir is unlinked; its target survives', () => {
    distDir = mkdtempSync(join(tmpdir(), 'clean-dist-symlink-'))
    mkdirSync(distDir, { recursive: true })

    const outsideDir = mkdtempSync(join(tmpdir(), 'clean-dist-symlink-target-'))
    const targetFile = join(outsideDir, 'real-target.dmg')
    writeFileSync(targetFile, 'the real bytes live outside distDir')

    const linkName = `GameLib-0.7.0${MAC_ARTIFACT_TOKEN}arm64.dmg`
    symlinkSync(targetFile, join(distDir, linkName))

    try {
      const { removed } = cleanDist(distDir, 'mac')

      expect(removed).toContain(linkName)
      expect(existsSync(join(distDir, linkName))).toBe(false)
      // The symlink was unlinked, never followed -- the real file it pointed
      // at must still exist, untouched (T-34.9G-11).
      expect(existsSync(targetFile)).toBe(true)
      expect(readFileSync(targetFile, 'utf-8')).toBe(
        'the real bytes live outside distDir'
      )
    } finally {
      rmSync(outsideDir, { recursive: true, force: true })
    }
  })
})

describe('cleanDist — cross-platform fixture (non-deletion proof)', () => {
  let distDir: string

  afterEach(() => {
    if (distDir) rmSync(distDir, { recursive: true, force: true })
  })

  const cases: Array<{
    platform: Platform
    removedExpected: string[]
    keptExpected: string[]
  }> = [
    {
      platform: 'mac',
      removedExpected: [...MAC_FILES, 'mac-arm64'],
      keptExpected: [
        ...WIN_FILES,
        'win-unpacked',
        ...LINUX_FILES,
        'linux-unpacked',
        ...COMMON_FILES
      ]
    },
    {
      platform: 'win',
      removedExpected: [...WIN_FILES, 'win-unpacked'],
      keptExpected: [
        ...MAC_FILES,
        'mac-arm64',
        ...LINUX_FILES,
        'linux-unpacked',
        ...COMMON_FILES
      ]
    },
    {
      platform: 'linux',
      removedExpected: [...LINUX_FILES, 'linux-unpacked'],
      keptExpected: [
        ...MAC_FILES,
        'mac-arm64',
        ...WIN_FILES,
        'win-unpacked',
        ...COMMON_FILES
      ]
    }
  ]

  for (const { platform, removedExpected, keptExpected } of cases) {
    test(`cleanDist(distDir, '${platform}') removes only ${platform} entries; the other two platforms' entries and the common file survive byte-identical`, () => {
      distDir = mkdtempSync(join(tmpdir(), `clean-dist-cross-${platform}-`))
      buildCrossPlatformFixture(distDir)

      const stagingDirs = ['mac-arm64', 'win-unpacked', 'linux-unpacked']
      const survivingFiles = keptExpected.filter(
        (name) => !stagingDirs.includes(name)
      )
      const before: Record<string, string> = {}
      for (const name of survivingFiles) {
        before[name] = readFileSync(join(distDir, name), 'utf-8')
      }

      const { removed, kept } = cleanDist(distDir, platform)

      expect(removed.sort()).toEqual([...removedExpected].sort())
      expect(kept.sort()).toEqual([...keptExpected].sort())

      for (const name of removedExpected) {
        expect(existsSync(join(distDir, name))).toBe(false)
      }
      for (const name of survivingFiles) {
        expect(existsSync(join(distDir, name))).toBe(true)
        expect(readFileSync(join(distDir, name), 'utf-8')).toBe(before[name])
      }
      for (const dirName of ['win-unpacked', 'linux-unpacked', 'mac-arm64']) {
        if (!removedExpected.includes(dirName)) {
          expect(existsSync(join(distDir, dirName))).toBe(true)
        }
      }
    })
  }
})

describe('cleanDist CLI --platform contract', () => {
  test('throws a clear error when --platform is absent (no silent default)', async () => {
    const { main } = await import('../cleanDist')
    expect(() => main([])).toThrow(/--platform is required/)
  })

  test('throws a clear error when --platform is unrecognised', async () => {
    const { main } = await import('../cleanDist')
    expect(() => main(['--platform=bsd'])).toThrow(/--platform is required/)
  })

  test('accepts a valid --platform and does not throw against a nonexistent distDir', async () => {
    const { main } = await import('../cleanDist')
    const target = join(tmpdir(), 'clean-dist-cli-nonexistent-xyz')
    expect(() => main(['--platform=win', target])).not.toThrow()
  })
})

describe('electron-builder.yml artifactName pin (T-34.9G-12)', () => {
  test('mac.artifactName contains the literal macOS token', () => {
    const config = parseElectronBuilder()
    expect(config.mac.artifactName).toContain('macOS')
  })

  test('win.artifactName does not contain macOS', () => {
    const config = parseElectronBuilder()
    expect(config.win.artifactName).not.toContain('macOS')
  })

  test('linux.artifactName does not contain macOS', () => {
    const config = parseElectronBuilder()
    expect(config.linux.artifactName).not.toContain('macOS')
  })

  test('win.artifactName contains the literal Setup token', () => {
    const config = parseElectronBuilder()
    expect(config.win.artifactName).toContain('Setup')
  })

  test('portable.artifactName contains the literal Portable token', () => {
    const config = parseElectronBuilder()
    expect(config.portable.artifactName).toContain('Portable')
  })

  test('linux.artifactName contains the literal linux token', () => {
    const config = parseElectronBuilder()
    expect(config.linux.artifactName).toContain('linux')
  })
})

describe('package.json wiring pin', () => {
  interface PackageJsonScripts {
    scripts: Record<string, string>
  }

  function loadScripts(): Record<string, string> {
    return (
      JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as PackageJsonScripts
    ).scripts
  }

  test.each([
    ['dist:mac', 'clean:dist-mac'],
    ['release:mac', 'clean:dist-mac'],
    ['dist:win', 'clean:dist-win'],
    ['release:win', 'clean:dist-win'],
    ['dist:linux', 'clean:dist-linux'],
    ['release:linux', 'clean:dist-linux']
  ])(
    '%s contains %s, positioned before electron-builder',
    (scriptName, cleanScriptName) => {
      const scripts = loadScripts()
      const value = scripts[scriptName]
      expect(value).toContain(cleanScriptName)
      expect(value.indexOf(cleanScriptName)).toBeLessThan(
        value.indexOf('electron-builder')
      )
    }
  )

  test('clean:dist-mac invokes meta/cleanDist.ts with --platform=mac', () => {
    const scripts = loadScripts()
    expect(scripts['clean:dist-mac']).toContain('meta/cleanDist.ts')
    expect(scripts['clean:dist-mac']).toContain('--platform=mac')
  })

  test('clean:dist-win invokes meta/cleanDist.ts with --platform=win', () => {
    const scripts = loadScripts()
    expect(scripts['clean:dist-win']).toContain('meta/cleanDist.ts')
    expect(scripts['clean:dist-win']).toContain('--platform=win')
  })

  test('clean:dist-linux invokes meta/cleanDist.ts with --platform=linux', () => {
    const scripts = loadScripts()
    expect(scripts['clean:dist-linux']).toContain('meta/cleanDist.ts')
    expect(scripts['clean:dist-linux']).toContain('--platform=linux')
  })
})

describe('doc-comment accuracy pins (IN-01/IN-02)', () => {
  // Normalises the source once: strips each line's leading comment marker
  // (`*`, `/**`, `//`, plus surrounding whitespace) and collapses all
  // whitespace runs to single spaces, so these pins survive any future
  // re-wrapping of the comment block. Mirrors the `<normalised_comment_scan>`
  // shell pipeline used at authoring time (34.9-19-PLAN.md) -- do NOT assert
  // on the raw, un-normalised source text.
  function normalisedSource(): string {
    const raw = readFileSync(CLEAN_DIST_SOURCE_PATH, 'utf-8')
    return raw
      .split('\n')
      .map((line) => line.replace(/^\s*(\/\*\*|\*\/|\*|\/\/)\s?/, ''))
      .join(' ')
      .replace(/\s+/g, ' ')
  }

  test('IN-01: the retired "symlink is matched by the token/standalone-name branches" claim is gone', () => {
    expect(normalisedSource()).not.toContain(
      'symlink is matched by the token/standalone-name branches'
    )
  })

  test('IN-01: the corrected comment names the unreachable shape and states it is left in place', () => {
    const source = normalisedSource()
    expect(source).toContain('symlink literally named')
    expect(source).toContain('matches no branch and is left in place')
  })

  test('IN-02: the retired "Every removal path is containment-checked" framing is gone', () => {
    expect(normalisedSource()).not.toContain(
      'Every removal path is containment-checked'
    )
  })

  test('IN-02: the corrected comment states the throw is untested defense-in-depth', () => {
    const source = normalisedSource()
    expect(source).toContain('never contain a path separator')
    expect(source).toContain(
      'defense-in-depth against a currently-unreachable input'
    )
    expect(source).toContain('no test exercises it')
  })
})

describe('honesty pin: no win/linux "broken" or "observed" claim (E-02 discipline)', () => {
  test('the source never asserts dist:win/dist:linux is currently broken or that a live stale-artifact failure was observed on those platforms', () => {
    const source = readFileSync(CLEAN_DIST_SOURCE_PATH, 'utf-8').toLowerCase()
    for (const phrase of [
      'win is broken',
      'linux is broken',
      'observed on win',
      'observed on linux',
      'confirmed on win',
      'confirmed on linux'
    ]) {
      expect(source).not.toContain(phrase)
    }
  })

  test('the source states the win/linux consequence is an unconfirmed generalization', () => {
    const source = readFileSync(CLEAN_DIST_SOURCE_PATH, 'utf-8')
    expect(source).toContain('UNCONFIRMED generalization')
  })
})
