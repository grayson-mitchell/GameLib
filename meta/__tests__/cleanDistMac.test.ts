/**
 * Phase 34.9 gap cycle, plan 14: fixture coverage for meta/cleanDistMac.ts
 * (F-34.9-02). Every fixture is a synthetic temp tree built with
 * `fs.mkdtempSync` under `os.tmpdir()` and torn down in `afterEach` --
 * nothing here touches the repo's real `dist/` directory (that happens once,
 * live, in Task 3, against the real stale artifacts).
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

import { cleanDistMac, macArtifactEntries, MAC_ARTIFACT_TOKEN } from '../cleanDistMac'

const ELECTRON_BUILDER_PATH = join(__dirname, '..', '..', 'electron-builder.yml')
const PACKAGE_JSON_PATH = join(__dirname, '..', '..', 'package.json')

interface ElectronBuilderConfig {
  mac: { artifactName: string }
  win: { artifactName: string }
  linux: { artifactName: string }
}

function parseElectronBuilder(): ElectronBuilderConfig {
  // readFileSync(ELECTRON_BUILDER_PATH) reads electron-builder.yml; loadYaml
  // (js-yaml) parses it structurally rather than regexing the raw text.
  return loadYaml(readFileSync(ELECTRON_BUILDER_PATH, 'utf-8')) as ElectronBuilderConfig
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

const NON_MAC_FILES = [
  'GameLib-0.7.0-linux-x64.AppImage',
  'GameLib-0.7.0-Setup-x64.exe',
  'GameLib-0.7.0-Portable-x64.exe',
  'latest-linux.yml',
  'builder-debug.yml'
]

/**
 * Builds the real-shaped fixture: the five macOS artifact files, a
 * `mac-arm64/GameLib.app/Contents/Info.plist` staging tree, and the five
 * non-macOS entries that must survive.
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

describe('macArtifactEntries', () => {
  let distDir: string

  afterEach(() => {
    if (distDir) rmSync(distDir, { recursive: true, force: true })
  })

  test('on the real-shaped fixture, returns exactly the five macOS files plus mac-arm64/', () => {
    distDir = mkdtempSync(join(tmpdir(), 'clean-dist-mac-entries-'))
    buildFixture(distDir)

    const entries = macArtifactEntries(distDir)

    expect(entries.sort()).toEqual([...MAC_FILES, 'mac-arm64'].sort())
  })

  test('does not return any of the five non-macOS entries', () => {
    distDir = mkdtempSync(join(tmpdir(), 'clean-dist-mac-entries-negative-'))
    buildFixture(distDir)

    const entries = macArtifactEntries(distDir)

    for (const name of NON_MAC_FILES) {
      expect(entries).not.toContain(name)
    }
  })

  test('returns [] for a distDir that does not exist', () => {
    const entries = macArtifactEntries(join(tmpdir(), 'clean-dist-mac-does-not-exist-xyz'))
    expect(entries).toEqual([])
  })
})

describe('cleanDistMac', () => {
  let distDir: string

  afterEach(() => {
    if (distDir) rmSync(distDir, { recursive: true, force: true })
  })

  test('removes the five macOS files and mac-arm64/, leaves five non-macOS entries byte-identical', () => {
    distDir = mkdtempSync(join(tmpdir(), 'clean-dist-mac-clean-'))
    buildFixture(distDir)

    const before: Record<string, string> = {}
    for (const name of NON_MAC_FILES) {
      before[name] = readFileSync(join(distDir, name), 'utf-8')
    }

    const { removed, kept } = cleanDistMac(distDir)

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
    const target = join(tmpdir(), 'clean-dist-mac-nonexistent-xyz')
    expect(existsSync(target)).toBe(false)

    let result: { removed: string[]; kept: string[] } | undefined
    expect(() => {
      result = cleanDistMac(target)
    }).not.toThrow()

    expect(result).toEqual({ removed: [], kept: [] })
  })

  test('a macOS-named symlink pointing outside distDir is unlinked; its target survives', () => {
    distDir = mkdtempSync(join(tmpdir(), 'clean-dist-mac-symlink-'))
    mkdirSync(distDir, { recursive: true })

    const outsideDir = mkdtempSync(join(tmpdir(), 'clean-dist-mac-symlink-target-'))
    const targetFile = join(outsideDir, 'real-target.dmg')
    writeFileSync(targetFile, 'the real bytes live outside distDir')

    const linkName = `GameLib-0.7.0${MAC_ARTIFACT_TOKEN}arm64.dmg`
    symlinkSync(targetFile, join(distDir, linkName))

    try {
      const { removed } = cleanDistMac(distDir)

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
})

describe('package.json wiring pin', () => {
  interface PackageJsonScripts {
    scripts: Record<string, string>
  }

  function loadScripts(): Record<string, string> {
    return (JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as PackageJsonScripts).scripts
  }

  test('dist:mac contains clean:dist-mac, positioned before electron-builder', () => {
    const scripts = loadScripts()
    const distMac = scripts['dist:mac']
    expect(distMac).toContain('clean:dist-mac')
    expect(distMac.indexOf('clean:dist-mac')).toBeLessThan(distMac.indexOf('electron-builder'))
  })

  test('release:mac contains clean:dist-mac, positioned before electron-builder', () => {
    const scripts = loadScripts()
    const releaseMac = scripts['release:mac']
    expect(releaseMac).toContain('clean:dist-mac')
    expect(releaseMac.indexOf('clean:dist-mac')).toBeLessThan(
      releaseMac.indexOf('electron-builder')
    )
  })
})
