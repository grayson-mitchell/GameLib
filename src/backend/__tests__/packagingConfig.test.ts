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
type OverlayPlatform = 'macos' | 'windows' | 'linux'
const PLATFORM_CONF_PATHS: Record<OverlayPlatform, string> = {
  macos: join(__dirname, '..', '..', '..', 'src-tauri', 'tauri.macos.conf.json'),
  windows: join(
    __dirname,
    '..',
    '..',
    '..',
    'src-tauri',
    'tauri.windows.conf.json'
  ),
  linux: join(__dirname, '..', '..', '..', 'src-tauri', 'tauri.linux.conf.json')
}
const VITE_CONFIG_PATH = join(__dirname, '..', '..', '..', 'vite.config.ts')
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
    macOS?: {
      files?: unknown
    }
  }
}

function parseTauriConfig(): TauriConfig {
  return JSON.parse(readFileSync(TAURI_CONF_PATH, 'utf-8')) as TauriConfig
}

// quick-260901-8rm: the base tauri.conf.json no longer carries a wholesale `bin` resource
// entry (Tauri platform overlays can only ADD/OVERRIDE a key onto the base, never remove one --
// so the wholesale key had to go, not just be shadowed). Each platform's bin/ tree instead
// lives in its own tauri.{platform}.conf.json overlay, deep-merged onto the base at build time.
// `mergedResourceMap` reproduces that merge in-test so the shape invariants below can run
// against what actually ships, not just against the base's now-bin-less map.
function parsePlatformOverlay(platform: OverlayPlatform): TauriConfig {
  return JSON.parse(
    readFileSync(PLATFORM_CONF_PATHS[platform], 'utf-8')
  ) as TauriConfig
}

function mergedResourceMap(platform: OverlayPlatform): Record<string, string> {
  const base = parseTauriConfig().bundle.resources as Record<string, string>
  const overlay = parsePlatformOverlay(platform).bundle
    .resources as Record<string, string>
  return { ...base, ...overlay }
}

// quick-260901-e7o: the darwin bin/ trees (arm64/darwin, x64/darwin) no longer ship via
// `bundle.resources` -- that copier (tauri_utils::resources::copy_resources) DEREFERENCES
// symlinks, which silently corrupted the PyInstaller Python.framework symlink layout for
// legendary/gogdl/nile. They ship via `bundle.macOS.files` instead, which Tauri copies with
// `fs_utils::copy_dir` (symlink-preserving) one step before codesigning
// (src-tauri: macos/app.rs). The SET of files macOS ships is unchanged from quick-260901-8rm --
// only the MECHANISM moved. Only macOS declares a `bundle.macOS` block; base/windows/linux have
// none, so this returns `{}` for those platforms rather than throwing.
function mergedMacFilesMap(platform: OverlayPlatform): Record<string, string> {
  const overlay = parsePlatformOverlay(platform).bundle.macOS?.files as
    | Record<string, string>
    | undefined
  return overlay ?? {}
}

// True if `relPath` (relative to `build/bin/`) ships on `platform`, whether via the
// symlink-dereferencing `bundle.resources` map or the symlink-preserving `bundle.macOS.files`
// map. macOS's darwin trees moved to the latter in quick-260901-e7o specifically because they
// contain symlinks the former would silently break -- this predicate treats both maps as
// equally authoritative for a "does platform X ship path Y" question so that the positive
// coverage assertions below don't have to know which mechanism the darwin trees currently use.
function platformShipsBinPath(
  platform: OverlayPlatform,
  relPath: string
): boolean {
  if (mergedMapCoversBinPath(platform, relPath)) {
    return true
  }
  if (platform !== 'macos') {
    return false
  }
  const fullSource = `../build/bin/${relPath}`
  return Object.values(mergedMacFilesMap(platform)).some(
    (source) => source === fullSource || fullSource.startsWith(`${source}/`)
  )
}

const OVERLAY_PLATFORMS: readonly OverlayPlatform[] = [
  'macos',
  'windows',
  'linux'
]

// Windows ships the whole `x64/win32/` DIRECTORY entry (which already contains
// EpicGamesLauncher.exe and GalaxyCommunication.exe alongside legendary/gogdl/nile/comet),
// while macOS and Linux ship those two exes as explicit FILE entries without the rest of the
// win32 tree. A plain substring match on the exe's own name only catches the file-entry case --
// this walks the merge the same way tauri_utils::resources does (directory entries take the
// walkdir branch and cover every path beneath them) so the check is correct for both shapes.
function mergedMapCoversBinPath(
  platform: OverlayPlatform,
  relPath: string
): boolean {
  const fullSource = `../build/bin/${relPath}`
  return Object.keys(mergedResourceMap(platform)).some((source) =>
    source.endsWith('/') ? fullSource.startsWith(source) : source === fullSource
  )
}

// The four `electron-builder.yml` describes (macOS onedir glob, Windows-stays-flat and
// Linux-stays-flat negative guards, and the unrelated-blocks-unchanged pin) were REMOVED by
// Phase 35 Plan 14: that file was deleted with the Electron packaging path. They asserted how
// electron-builder staged the runner tree per platform. NOT replaced -- Tauri stages runners
// through `src-tauri/tauri.conf.json`, whose own guard is the very next describe and is
// untouched. See D-35-14-02.

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

  test.each(OVERLAY_PLATFORMS)(
    "platform=%s's merged bundle.resources references the bin tree (base itself no longer does -- quick-260901-8rm)",
    (platform) => {
      const asText = JSON.stringify(mergedResourceMap(platform))
      expect(asText).toContain('bin')
    }
  )

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

  // quick-260901-8rm: these four shape invariants used to run against the base map alone. Now
  // that the base map's own `bin` entry is gone (narrowed into three per-platform overlays,
  // see the merge helper above), running them against the base alone would only prove the
  // four non-bin entries are well-formed -- it would say nothing about what an overlay adds.
  // They now run against what actually SHIPS: the base merged with each platform's overlay.
  describe.each(OVERLAY_PLATFORMS)('merged map for platform=%s', (platform) => {
    test('every target subpath begins with "build/" so it lands at Contents/Resources/build/...', () => {
      for (const target of Object.values(mergedResourceMap(platform))) {
        expect(target.startsWith('build/')).toBe(true)
      }
    })

    test('no target contains ".." -- resource_relpath would turn it back into an "_up_" segment', () => {
      for (const target of Object.values(mergedResourceMap(platform))) {
        expect(target.split('/')).not.toContain('..')
      }
    })

    test('every publicDir-resolved asset class is carried, not only bin/', () => {
      // Derived from the measured publicDir consumer sweep in 35-04-PLAN.md: paths.ts (bin/,
      // webviewPreload.js, icon.png), utils.ts (bin/, changelog.json), main.ts + the sidecar i18n
      // path (locales/). Locales are named explicitly because they are what the DMG probe proved
      // missing -- but the defect class is the whole publicDir tree, not the locales alone.
      const keys = Object.keys(mergedResourceMap(platform)).join(' ')
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
      const keys = Object.keys(mergedResourceMap(platform)).join(' ')
      for (const forbidden of [
        '/main',
        '/preload',
        'sea-config',
        'sidecar-prep'
      ]) {
        expect(keys).not.toContain(forbidden)
      }
    })
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

/**
 * quick-260901-8rm: narrows `bundle.resources` from a single wholesale
 * `"../build/bin/": "build/bin"` entry (shipping all six `bin/{arch}/{platform}` runner trees
 * inside EVERY platform's artifact) into three per-platform overlays. A macOS artifact should
 * carry only the darwin runner trees plus the two Windows exes it genuinely executes under
 * Wine (legendary/games.ts:919-937, launcher.ts:927 -- neither has a platform guard), and
 * should never carry arm64/win32, x64/linux or arm64/linux.
 *
 * quick-260901-e7o: the SET macOS ships is unchanged from the above -- still just the darwin
 * runner trees plus the two Wine exes. Only the MECHANISM moved: `arm64/darwin` and
 * `x64/darwin` now ship via `bundle.macOS.files` (symlink-preserving `copy_dir`) instead of
 * `bundle.resources` (symlink-dereferencing `copy_resources`), because the latter was silently
 * corrupting the PyInstaller Python.framework symlinks inside `arm64/darwin`. Tests below that
 * assert on "what macOS ships" therefore consult both maps via `platformShipsBinPath` /
 * `mergedMacFilesMap`; tests that assert on "what `bundle.resources` alone contains" still use
 * `mergedResourceMap` directly, since a `bundle.macOS.files` regression back into
 * `bundle.resources` is exactly the defect the disjointness test below exists to catch.
 */
describe('bin-tree narrowing: base carries no wholesale bin/ key, overlays carry exactly what each platform needs (quick-260901-8rm, quick-260901-e7o)', () => {
  test('NEGATIVE: no key in the base map matches bin/ -- if this regresses, every overlay below becomes decorative', () => {
    const base = parseTauriConfig().bundle.resources as Record<string, string>
    for (const key of Object.keys(base)) {
      expect(key).not.toMatch(/bin\//)
    }
  })

  test.each(OVERLAY_PLATFORMS)(
    'platform=%s overlay file parses and its bundle.resources is the map form',
    (platform) => {
      const overlay = parsePlatformOverlay(platform)
      expect(overlay.bundle.resources).toBeDefined()
      expect(Array.isArray(overlay.bundle.resources)).toBe(false)
      expect(typeof overlay.bundle.resources).toBe('object')
    }
  )

  test.each(OVERLAY_PLATFORMS)(
    'platform=%s merged map has strictly more keys than the base map (anti-vacuity: a typo\'d/unreadable overlay must not read as clean)',
    (platform) => {
      const baseKeyCount = Object.keys(
        parseTauriConfig().bundle.resources as Record<string, string>
      ).length
      const mergedKeyCount = Object.keys(mergedResourceMap(platform)).length
      expect(mergedKeyCount).toBeGreaterThan(baseKeyCount)
    }
  )

  test.each(OVERLAY_PLATFORMS)(
    'platform=%s merged map covers both x64/win32 Wine exes, as a file entry or via an enclosing directory entry (F1: macOS AND Linux copy them into a Wine prefix with no platform guard; Windows runs them natively as part of its x64/win32 directory)',
    (platform) => {
      expect(
        mergedMapCoversBinPath(platform, 'x64/win32/EpicGamesLauncher.exe')
      ).toBe(true)
      expect(
        mergedMapCoversBinPath(platform, 'x64/win32/GalaxyCommunication.exe')
      ).toBe(true)
    }
  )

  test('macOS merged map carries no linux/ tree and no arm64/win32 tree, across both bundle.resources and bundle.macOS.files', () => {
    const resourceKeys = Object.keys(mergedResourceMap('macos'))
    const macFilesValues = Object.values(mergedMacFilesMap('macos'))
    const allEntries = [...resourceKeys, ...macFilesValues]
    expect(allEntries.some((k) => k.includes('linux'))).toBe(false)
    expect(allEntries.some((k) => k.includes('arm64/win32'))).toBe(false)
  })

  test('windows merged map carries no darwin/ tree and no linux/ tree, and declares no bundle.macOS key', () => {
    const keys = Object.keys(mergedResourceMap('windows'))
    expect(keys.some((k) => k.includes('darwin'))).toBe(false)
    expect(keys.some((k) => k.includes('linux'))).toBe(false)
    expect(parsePlatformOverlay('windows').bundle.macOS).toBeUndefined()
  })

  test('linux merged map carries no darwin/ tree, and declares no bundle.macOS key', () => {
    const keys = Object.keys(mergedResourceMap('linux'))
    expect(keys.some((k) => k.includes('darwin'))).toBe(false)
    expect(parsePlatformOverlay('linux').bundle.macOS).toBeUndefined()
  })

  // quick-260901-e7o: positive coverage. Nothing above asserts macOS actually SHIPS the darwin
  // trees -- a regression that deleted `bundle.macOS.files` entirely would pass every negative
  // guard above while shipping a Python-framework-less runner tree. `platformShipsBinPath`
  // checks both `bundle.resources` and `bundle.macOS.files` so this stays correct regardless of
  // which map macOS uses to ship a given path.
  test.each([
    'arm64/darwin/legendary/legendary',
    'arm64/darwin/gogdl/gogdl',
    'arm64/darwin/nile/nile',
    'x64/darwin'
  ])('macOS ships %s', (relPath) => {
    expect(platformShipsBinPath('macos', relPath)).toBe(true)
  })

  test('windows and linux do not ship arm64/darwin or x64/darwin via either map', () => {
    for (const platform of ['windows', 'linux'] as const) {
      expect(platformShipsBinPath(platform, 'arm64/darwin')).toBe(false)
      expect(platformShipsBinPath(platform, 'x64/darwin')).toBe(false)
    }
  })

  // quick-260901-e7o: disjointness. `bundle.macOS.files` exists specifically because
  // `bundle.resources` dereferences symlinks and corrupted the darwin trees -- if a future edit
  // re-added a darwin key to `bundle.resources` (on any platform, base included), the same
  // corruption would recur even with `bundle.macOS.files` still present and passing every other
  // test in this file.
  test.each(['base', ...OVERLAY_PLATFORMS] as const)(
    'platform=%s bundle.resources contains no darwin/ key (darwin ships only via bundle.macOS.files)',
    (platform) => {
      const resources = (
        platform === 'base'
          ? parseTauriConfig()
          : parsePlatformOverlay(platform)
      ).bundle.resources as Record<string, string> | undefined
      const keys = Object.keys(resources ?? {})
      expect(keys.some((k) => k.includes('darwin'))).toBe(false)
    }
  )

  // quick-260901-e7o: no-nesting. `bundle.macOS.files` keys become directory entries under
  // Contents/; if one key were a path prefix of another (e.g. `Resources/build/bin` and
  // `Resources/build/bin/arm64/darwin` both present), `fs_utils::copy_dir` iteration order over
  // a HashMap is nondeterministic, so which copy "wins" is unstable across builds.
  test('macOS.files keys are pairwise non-nesting', () => {
    const keys = Object.keys(mergedMacFilesMap('macos'))
    for (const a of keys) {
      for (const b of keys) {
        if (a === b) continue
        expect(b.startsWith(`${a}/`)).toBe(false)
      }
    }
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

// RE-POINTED by Phase 35 Plan 14 from `electron.vite.config.ts` (deleted) to `vite.config.ts`.
// F-34.9-01 is NOT retired: `preserveRunnerSymlinksPlugin` is still live in the Tauri build --
// a `pnpm exec vite build` at the cutover commit printed `[preserve-runner-symlinks] restored
// 12 symlink(s)`. Deleting this guard because its old subject file went away would have lost a
// still-load-bearing assertion; only the path it points at changed.
describe('vite.config.ts registers the runner-symlink preservation plugin (F-34.9-01)', () => {
  function loadStrippedElectronViteConfig(): string {
    return stripJsComments(readFileSync(VITE_CONFIG_PATH, 'utf-8'))
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
