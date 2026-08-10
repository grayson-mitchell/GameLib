/**
 * Phase 34.9 Plan 07: pins both packagers' relevant config so the macOS-only
 * onedir-tree boundary is enforced by tests rather than by intent.
 *
 * The Linux and Windows assertions below are NEGATIVE guards: their job is
 * to fail if some future change extends onedir beyond macOS, which
 * 34.9-CONTEXT.md locks as out of scope.
 *
 * `electron-builder.yml` is parsed structurally with `js-yaml` (the
 * precedent established by runnersOnedirWorkflow.test.ts, typed via
 * src/common/typedefs/js-yaml.d.ts), not regexed, so comment text --
 * which necessarily mentions `**`, `linux` and `win32` while explaining
 * why they're absent -- cannot influence any assertion. Where a raw-text
 * assertion on the packaging-limitations doc is used, none of the strings
 * checked for are ones a comment in that doc would need to explain away,
 * so no stripHashComments pass is needed there; `stripHashComments` is
 * still applied where a negative "contains no **" check runs against the
 * YAML's `win`/`linux` blocks, following releaseWorkflow.test.ts's
 * documented discipline.
 */
import { load as loadYaml } from 'js-yaml'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { stripHashComments } from './helpers/workflowSteps'

const ELECTRON_BUILDER_PATH = join(__dirname, '..', '..', '..', 'electron-builder.yml')
const TAURI_CONF_PATH = join(__dirname, '..', '..', '..', 'src-tauri', 'tauri.conf.json')
const PACKAGING_LIMITATIONS_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '.planning',
  'phases',
  '34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co',
  '34.9-PACKAGING-LIMITATIONS.md'
)

interface ElectronBuilderConfig {
  files: string[]
  asarUnpack: string[]
  mac: { files: string[] }
  win: { files: string[] }
  linux: { files: string[] }
}

function loadElectronBuilderRaw(): string {
  return readFileSync(ELECTRON_BUILDER_PATH, 'utf-8')
}

function parseElectronBuilder(): ElectronBuilderConfig {
  return loadYaml(loadElectronBuilderRaw()) as ElectronBuilderConfig
}

function loadStrippedElectronBuilder(): string {
  return stripHashComments(loadElectronBuilderRaw())
}

interface TauriConfig {
  bundle: {
    resources?: unknown
    externalBin?: string[]
  }
}

function parseTauriConfig(): TauriConfig {
  return JSON.parse(readFileSync(TAURI_CONF_PATH, 'utf-8')) as TauriConfig
}

describe('electron-builder.yml macOS onedir glob (Phase 34.9 Plan 07)', () => {
  test('mac.files contains a recursive glob reaching build/bin/${arch}/darwin/**/*', () => {
    const config = parseElectronBuilder()
    expect(config.mac.files).toContain('build/bin/${arch}/darwin/**/*')
  })

  test('mac.files still contains the one-level glob (comet/steam-bridge-helper stay reachable)', () => {
    const config = parseElectronBuilder()
    expect(config.mac.files).toContain('build/bin/${arch}/darwin/*')
  })
})

describe('electron-builder.yml Windows stays flat (negative guard)', () => {
  test('win.files contains build/bin/${arch}/win32/*', () => {
    const config = parseElectronBuilder()
    expect(config.win.files).toContain('build/bin/${arch}/win32/*')
  })

  test('win.files contains no ** glob', () => {
    const config = parseElectronBuilder()
    expect(config.win.files.some((entry) => entry.includes('**'))).toBe(false)
  })

  test('the win: block\'s stripped source contains no ** glob (raw-text cross-check)', () => {
    const strippedLines = loadStrippedElectronBuilder().split('\n')
    const winIndex = strippedLines.findIndex((line) => line.trim() === 'win:')
    expect(winIndex).toBeGreaterThanOrEqual(0)
    const nextTopLevelIndex = strippedLines.findIndex(
      (line, index) => index > winIndex && /^\S/.test(line)
    )
    const winBlock = strippedLines
      .slice(winIndex, nextTopLevelIndex < 0 ? undefined : nextTopLevelIndex)
      .join('\n')
    expect(winBlock).not.toContain('**')
  })
})

describe('electron-builder.yml Linux stays flat (negative guard)', () => {
  test('linux.files contains build/bin/${arch}/linux/*', () => {
    const config = parseElectronBuilder()
    expect(config.linux.files).toContain('build/bin/${arch}/linux/*')
  })

  test('linux.files contains no ** glob', () => {
    const config = parseElectronBuilder()
    expect(config.linux.files.some((entry) => entry.includes('**'))).toBe(false)
  })
})

describe('electron-builder.yml unrelated blocks are unchanged', () => {
  test('asarUnpack still contains the recursive build/bin/**/* entry', () => {
    const config = parseElectronBuilder()
    expect(config.asarUnpack).toContain('build/bin/**/*')
  })

  test('top-level files: list is unchanged', () => {
    const config = parseElectronBuilder()
    expect(config.files).toEqual([
      'build/**/*',
      'node_modules/**/*',
      '!build/bin/*',
      'build/bin/legendary.LICENSE'
    ])
  })
})

describe('src-tauri/tauri.conf.json runner-tree staging (Phase 34.9 Plan 07)', () => {
  test('bundle.resources is present and non-empty', () => {
    const config = parseTauriConfig()
    expect(config.bundle.resources).toBeDefined()
    expect(Array.isArray(config.bundle.resources) ? config.bundle.resources.length : 1).toBeGreaterThan(0)
  })

  test('bundle.resources references the bin tree', () => {
    const config = parseTauriConfig()
    const resources = config.bundle.resources
    const asText = Array.isArray(resources) ? resources.join(',') : JSON.stringify(resources)
    expect(asText).toContain('bin')
  })

  test('bundle.externalBin is exactly ["binaries/gamelib-sidecar"] (regression guard for tauri-apps/tauri#11992)', () => {
    const config = parseTauriConfig()
    expect(config.bundle.externalBin).toEqual(['binaries/gamelib-sidecar'])
  })
})

describe('34.9-PACKAGING-LIMITATIONS.md exists and names its owner', () => {
  test('the file exists and names R-34.5-G1-PKG', () => {
    const contents = readFileSync(PACKAGING_LIMITATIONS_PATH, 'utf-8')
    expect(contents).toContain('R-34.5-G1-PKG')
  })
})
