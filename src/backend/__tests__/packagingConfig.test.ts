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

const ELECTRON_BUILDER_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'electron-builder.yml'
)
const TAURI_CONF_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'tauri.conf.json'
)
const ELECTRON_VITE_CONFIG_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'electron.vite.config.ts'
)
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

  test("the win: block's stripped source contains no ** glob (raw-text cross-check)", () => {
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
    expect(
      Array.isArray(config.bundle.resources)
        ? config.bundle.resources.length
        : 1
    ).toBeGreaterThan(0)
  })

  test('bundle.resources references the bin tree', () => {
    const config = parseTauriConfig()
    const resources = config.bundle.resources
    const asText = Array.isArray(resources)
      ? resources.join(',')
      : JSON.stringify(resources)
    expect(asText).toContain('bin')
  })

  test('bundle.externalBin is exactly ["binaries/gamelib-sidecar"] (regression guard for tauri-apps/tauri#11992)', () => {
    const config = parseTauriConfig()
    expect(config.bundle.externalBin).toEqual(['binaries/gamelib-sidecar'])
  })
})

/**
 * R-34.5-G1-PKG half (a) (Phase 35 plan 04, D-19, REQ-35-11).
 *
 * The defect this guards is NOT "an asset was forgotten". It is that the OBVIOUS fix ships the
 * files to a directory nothing reads, and looks green doing it.
 *
 * `bundle.resources` was `["../build/bin/"]` -- the ARRAY form. In the array form Tauri derives
 * each target path with `tauri_utils::resources::resource_relpath`, which maps every
 * `Component::ParentDir` to a literal `_up_` segment (tauri-utils-2.9.3 `src/resources.rs`:21-24,
 * read at plan-execution time, not inferred from docs). So `../build/bin/` shipped to
 * `Contents/Resources/_up_/build/bin/`. Meanwhile `constants/paths.ts` computes
 * `publicDir = resolve(app.getAppPath(), 'build')` and `app.getAppPath()` is the Tauri shell's
 * `resource_dir()`, i.e. `Contents/Resources` -- so the sidecar looked in
 * `Contents/Resources/build/`. Two directories that never met. The 2026-08-22 DMG probe recorded
 * in `34.2-HUMAN-UAT.md` (G-34.2-UAT-02) saw exactly this: `_up_` and `icon.icns`, nothing else.
 *
 * Appending more `../`-prefixed entries to the array would have reproduced the same mismatch one
 * directory over. The MAP form is therefore load-bearing, not stylistic: it states the target
 * subpath explicitly instead of deriving it, and `resource_relpath` is applied to the TARGET
 * value (`resources.rs`:239) -- which is why a target may not itself contain `..`, or it would
 * come straight back as `_up_`.
 *
 * These assertions are a CONFIG-level guard only. They cannot prove the files are in the
 * artifact -- a glob that matches nothing, or a source path that moves, still passes everything
 * here (T-35-15). The artifact-level proof is the blocking human checkpoint in plan 35-04
 * Task 3: list `Contents/Resources/` in a real `.app`.
 */
describe('R-34.5-G1-PKG half (a): bundle.resources targets a path publicDir can actually reach', () => {
  function resourceMap(): Record<string, string> {
    const resources = parseTauriConfig().bundle.resources
    if (Array.isArray(resources) || typeof resources !== 'object') {
      throw new Error(
        'bundle.resources is the ARRAY form. Targets are then derived, and every "../" becomes an ' +
          '"_up_" segment -- the R-34.5-G1-PKG half (a) defect. Use the map form.'
      )
    }
    return resources as unknown as Record<string, string>
  }

  test('anti-vacuity: the map is non-empty and every entry is a string->string pair', () => {
    // Without this, every assertion below passes vacuously against `{}`.
    const map = resourceMap()
    expect(Object.keys(map).length).toBeGreaterThan(0)
    for (const [key, value] of Object.entries(map)) {
      expect(typeof key).toBe('string')
      expect(typeof value).toBe('string')
      expect(key.length).toBeGreaterThan(0)
    }
  })

  test('it is the MAP form, not the array form (the array form derives "_up_" targets)', () => {
    expect(Array.isArray(parseTauriConfig().bundle.resources)).toBe(false)
  })

  test('every target subpath begins with "build/" so it lands at Contents/Resources/build/...', () => {
    for (const target of Object.values(resourceMap())) {
      expect(target.startsWith('build/')).toBe(true)
    }
  })

  test('no target contains ".." -- resource_relpath would turn it back into an "_up_" segment', () => {
    for (const target of Object.values(resourceMap())) {
      expect(target.split('/')).not.toContain('..')
    }
  })

  test('every publicDir-resolved asset class is carried, not only bin/', () => {
    // Derived from the measured publicDir consumer sweep in 35-04-PLAN.md: paths.ts (bin/,
    // webviewPreload.js, icon.png), utils.ts (bin/, changelog.json), main.ts + the sidecar i18n
    // path (locales/). Locales are named explicitly because they are what the DMG probe proved
    // missing -- but the defect class is the whole publicDir tree, not the locales alone.
    const keys = Object.keys(resourceMap()).join(' ')
    for (const required of [
      'bin',
      'locales',
      'changelog.json',
      'webviewPreload.js',
      'icon.png'
    ]) {
      expect(keys).toContain(required)
    }
  })

  test('T-35-14: Electron main/preload output and build intermediates are NEVER bundled', () => {
    // build/main/ and build/preload/ are Electron main-process code. Shipping them inside the
    // Tauri artifact would be executable code with no live loader and no owner. sea-config.json
    // and sidecar-prep.blob are build intermediates.
    const keys = Object.keys(resourceMap()).join(' ')
    for (const forbidden of [
      '/main',
      '/preload',
      'sea-config',
      'sidecar-prep'
    ]) {
      expect(keys).not.toContain(forbidden)
    }
  })

  test('locales are carried as a DIRECTORY entry, never a glob (a glob flattens and collides)', () => {
    // resources.rs:207 -- for a glob pattern the target is `dest.join(file_name)`, which DISCARDS
    // the intermediate directories. "../build/locales/**/*.json" would therefore collapse ~50
    // languages' gamelib.json into one path, each overwriting the last. The directory form takes
    // the walkdir branch instead (resources.rs:196-201), which preserves structure via
    // `strip_prefix`.
    const localeKeys = Object.keys(resourceMap()).filter((k) =>
      k.includes('locales')
    )
    expect(localeKeys.length).toBe(1)
    expect(localeKeys[0]).not.toContain('*')
    expect(localeKeys[0].endsWith('/')).toBe(true)
  })
})

describe('34.9-PACKAGING-LIMITATIONS.md exists and names its owner', () => {
  test('the file exists and names R-34.5-G1-PKG', () => {
    const contents = readFileSync(PACKAGING_LIMITATIONS_PATH, 'utf-8')
    expect(contents).toContain('R-34.5-G1-PKG')
  })
})

/**
 * Removes `/* ... *\/` block comments and `// ...` line comments from a JS/TS
 * source string. Deliberately NOT `stripHashComments` above, which only
 * strips `#`-led YAML comments. Local to this file -- no other suite in this
 * repo currently needs a JS-comment stripper.
 */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('stripJsComments self-test (anti-vacuity guard for the assertions below)', () => {
  test('a commented-out call yields no match for the call it names', () => {
    const source = '// preserveRunnerSymlinksPlugin()\n'
    const stripped = stripJsComments(source)
    expect(stripped).not.toContain('preserveRunnerSymlinksPlugin()')
  })
})

describe('electron.vite.config.ts registers the runner-symlink preservation plugin (F-34.9-01)', () => {
  function loadStrippedElectronViteConfig(): string {
    return stripJsComments(readFileSync(ELECTRON_VITE_CONFIG_PATH, 'utf-8'))
  }

  test('imports preserveRunnerSymlinksPlugin from ./meta/preserveRunnerSymlinks', () => {
    const stripped = loadStrippedElectronViteConfig()
    expect(stripped).toMatch(
      /import\s*\{\s*preserveRunnerSymlinksPlugin\s*\}\s*from\s*['"]\.\/meta\/preserveRunnerSymlinks['"]/
    )
  })

  test('the renderer config registers a preserveRunnerSymlinksPlugin() call', () => {
    const stripped = loadStrippedElectronViteConfig()
    expect(stripped).toContain('preserveRunnerSymlinksPlugin()')
  })
})
