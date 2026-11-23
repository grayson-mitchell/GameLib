/**
 * The shortcut file-name, path and exists oracle (94-05, D-14, D-23, Pitfall 9): what the TypeScript
 * decides about WHERE a shortcut lives and WHETHER one is there, recorded as the goldens the Rust
 * writers are held to.
 *
 *   sanitize/   the npm `sanitize-filename` package itself over reserved names, trailing dots and spaces,
 *               control characters, path separators, `.` and `..`, an empty title, a title over 255
 *               UTF-8 bytes and a split surrogate pair, plus every hostile title. The Rust hand port is
 *               pinned to the package, not to a reading of it. Strings are stored as UTF-16 code units as
 *               well as text so a lone surrogate survives JSON.
 *   paths/      `shortcutFiles` per OS and hostile title; Windows once with a registry Desktop folder and
 *               once without (no Desktop path).
 *   exists/     what the registered `shortcutsExists` channel (`shortcutsExistOnDisk`) answers over a
 *               disk matrix: none, Desktop only, menu only, both, and a dangling Desktop symlink, a
 *               symlink to the bundle and a legacy real bundle on macOS, plus `macDesktopShortcutPresent`
 *               and `macDesktopShortcutWanted` alongside.
 *
 * Modes (see testUtils/shortcutsOracle/harness.ts):
 *   GAMELIB_WRITE_SHORTCUTS_GOLDEN=1   rewrite every golden from the TypeScript
 *   (default)                          recompute and compare, offline
 *
 * Every exists case runs on a fresh isolated HOME. The Windows registry Desktop folder is a
 * synthetic `Z:\GameLibOracle\Desktop` that nothing creates; a Desktop `.lnk` "on disk" there is
 * answered by a call-through `existsSync` spy, so no file is ever written outside the profile.
 */
import { mkdirSync, symlinkSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import gracefulFs from 'graceful-fs'
import sanitize from 'sanitize-filename'
import {
  macDesktopShortcutPresent,
  macDesktopShortcutWanted,
  shortcutFiles
} from '../../shortcuts/shortcuts'
import { registerShortcutsFlows } from 'backend/sidecar/shortcutsFlowRegistration'
import { createIpcRegistry } from 'backend/sidecar/ipcRegistry'
import { ipcViews } from 'backend/testUtils/ipcViews'
import {
  assertManifest,
  expectEmptyCasesToFail,
  mockPlatform,
  normalisePaths,
  portablePath,
  syncManifest,
  withShortcutsOracleProfile,
  writeOrCompareGolden,
  type ShortcutsOraclePlatform,
  type ShortcutsOracleProfile
} from 'backend/testUtils/shortcutsOracle/harness'
import { HOSTILE_NAMES, SANITIZE_VECTORS } from './hostileNames'

/** The case counts this plan commits; a later edit may raise them, never lower them. */
const SANITIZE_FLOOR = 30
const PATHS_FLOOR = 30
const EXISTS_FLOOR = 12

/** A registry Desktop folder no test may create anything under (see the file header). */
const REGISTRY_DESKTOP = 'Z:\\GameLibOracle\\Desktop'

const units = (text: string): number[] =>
  Array.from({ length: text.length }, (_, i) => text.charCodeAt(i))

// ---------------------------------------------------------------- sanitize

interface SanitizeCase {
  id: string
  input: string
}

const SANITIZE_CASES: SanitizeCase[] = [
  ...SANITIZE_VECTORS.map((v) => ({ id: `v-${v.id}`, input: v.input })),
  ...HOSTILE_NAMES.map((n) => ({ id: `h-${n.id}`, input: n.title }))
]

function sanitizeGolden(c: SanitizeCase): unknown {
  const output = sanitize(c.input)
  return {
    input: { text: c.input, units: units(c.input) },
    output: {
      text: output,
      units: units(output),
      utf8Bytes: Buffer.byteLength(output, 'utf8')
    }
  }
}

// ------------------------------------------------------------------- paths

type PathsPlatform = ShortcutsOraclePlatform

interface PathsCase {
  id: string
  platform: PathsPlatform
  /** win32 only: whether the registry answered with a Desktop folder. */
  registry: boolean
  title: string
}

const PATHS_CASES: PathsCase[] = HOSTILE_NAMES.flatMap((n) => [
  {
    id: `darwin-${n.id}`,
    platform: 'darwin' as const,
    registry: false,
    title: n.title
  },
  {
    id: `linux-${n.id}`,
    platform: 'linux' as const,
    registry: false,
    title: n.title
  },
  {
    id: `win32-registry-${n.id}`,
    platform: 'win32' as const,
    registry: true,
    title: n.title
  },
  {
    id: `win32-no-registry-${n.id}`,
    platform: 'win32' as const,
    registry: false,
    title: n.title
  }
])

function pathsGolden(c: PathsCase): Promise<unknown> {
  return withShortcutsOracleProfile((profile) => {
    const restore = mockPlatform(c.platform)
    try {
      const [desktop, menu] = shortcutFiles(
        { paths: profile.paths },
        c.title,
        c.registry ? REGISTRY_DESKTOP : undefined
      )
      // The macOS and Linux arms join with `path.join`, so a host separator is normalised;
      // the Windows arm builds its string with backslashes itself.
      const clean = (p: string | undefined): string | null =>
        p === undefined
          ? null
          : c.platform === 'win32'
            ? normalisePaths(p, profile)
            : portablePath(normalisePaths(p, profile))
      return {
        platform: c.platform,
        windowsRegistry: c.platform === 'win32' ? c.registry : null,
        input: { title: c.title, units: units(c.title) },
        sanitized: sanitize(c.title),
        desktop: clean(desktop),
        menu: clean(menu)
      }
    } finally {
      restore()
    }
  })
}

// ------------------------------------------------------------------ exists

type DesktopState = 'none' | 'file' | 'symlink' | 'legacy-bundle'
type MenuState = 'none' | 'present'

interface ExistsCase {
  id: string
  platform: PathsPlatform
  registry: boolean
  /** null: `getGameInfo()` returned `{}` (the double cache miss), no title key at all. */
  title: string | null
  desktop: DesktopState
  menu: MenuState
}

function buildExistsCases(): ExistsCase[] {
  const cases: ExistsCase[] = []
  const add = (
    platform: PathsPlatform,
    registry: boolean,
    titleId: string,
    title: string | null,
    desktop: DesktopState,
    menu: MenuState
  ): void => {
    const where =
      platform === 'win32' ? (registry ? 'win32-reg' : 'win32-noreg') : platform
    cases.push({
      id: `${where}-${titleId}-desktop-${desktop}-menu-${menu}`,
      platform,
      registry,
      title,
      desktop,
      menu
    })
  }
  const menus: MenuState[] = ['none', 'present']
  const plain = 'Plain Game'
  // The full matrix on a plain title.
  for (const desktop of [
    'none',
    'file',
    'symlink',
    'legacy-bundle'
  ] as DesktopState[]) {
    for (const menu of menus)
      add('darwin', false, 'plain', plain, desktop, menu)
  }
  for (const desktop of ['none', 'file', 'symlink'] as DesktopState[]) {
    for (const menu of menus) add('linux', false, 'plain', plain, desktop, menu)
  }
  for (const desktop of ['none', 'file'] as DesktopState[]) {
    for (const menu of menus) add('win32', true, 'plain', plain, desktop, menu)
  }
  // With no registry Desktop the Desktop is never looked for, so a file in the profile's Desktop is
  // a decoy that must not count.
  for (const desktop of ['none', 'file'] as DesktopState[]) {
    for (const menu of menus) add('win32', false, 'plain', plain, desktop, menu)
  }
  // Hostile titles: a Desktop item alone, and a menu item alone, on each OS.
  for (const id of [
    'subshell',
    'non-ascii',
    'astral',
    'reserved-con',
    'separators'
  ]) {
    const name = HOSTILE_NAMES.find((n) => n.id === id)
    if (!name) throw new Error(`no hostile name ${id}`)
    for (const platform of ['darwin', 'linux', 'win32'] as const) {
      const registry = platform === 'win32'
      add(platform, registry, id, name.title, 'file', 'none')
      add(platform, registry, id, name.title, 'none', 'present')
    }
  }
  // No title: nothing is looked up, whatever is on disk.
  for (const platform of ['darwin', 'linux', 'win32'] as const) {
    const registry = platform === 'win32'
    add(platform, registry, 'empty-title', '', 'file', 'present')
    add(platform, registry, 'no-title', null, 'file', 'present')
  }
  return cases
}

const EXISTS_CASES = buildExistsCases()

/** reg.exe's answer for `Desktop`, in the format `readWindowsShellFolder` parses. */
const regOutput = (value: string): string =>
  `\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders\r\n    Desktop    REG_SZ    ${value}\r\n\r\n`

function seedTree(
  c: ExistsCase,
  profile: ShortcutsOracleProfile,
  desktopFile: string | undefined,
  menuFile: string
): void {
  const ensure = (path: string): void => {
    mkdirSync(dirname(path), { recursive: true })
  }
  if (c.menu === 'present') {
    if (c.platform === 'darwin') {
      mkdirSync(join(menuFile, 'Contents', 'MacOS'), { recursive: true })
    } else {
      ensure(menuFile)
      writeFileSync(menuFile, '')
    }
  }
  // The Desktop item: with a registry Desktop (win32) the path is synthetic and answered by the
  // `existsSync` spy instead; otherwise it is made for real inside the profile.
  const desktopTarget =
    desktopFile && !(c.platform === 'win32' && c.registry)
      ? desktopFile
      : c.platform === 'win32' && !c.registry && c.desktop === 'file'
        ? join(profile.desktop, `${c.title ?? ''}.lnk`)
        : undefined
  if (!desktopTarget || c.desktop === 'none') return
  ensure(desktopTarget)
  if (c.desktop === 'file') writeFileSync(desktopTarget, '')
  else if (c.desktop === 'legacy-bundle')
    mkdirSync(join(desktopTarget, 'Contents'), { recursive: true })
  else symlinkSync(menuFile, desktopTarget)
}

async function existsGolden(c: ExistsCase): Promise<unknown> {
  return withShortcutsOracleProfile(async (profile) => {
    const restore = mockPlatform(c.platform)
    const realExists = gracefulFs.existsSync
    const existsSpy =
      c.platform === 'win32' && c.registry && c.desktop === 'file'
        ? jest
            .spyOn(gracefulFs, 'existsSync')
            .mockImplementation((path) =>
              String(path).startsWith(REGISTRY_DESKTOP)
                ? true
                : realExists(path)
            )
        : null
    try {
      const gameInfo = c.title === null ? {} : { title: c.title }
      const ipc = createIpcRegistry()
      const settings = { addDesktopShortcuts: true }
      const flowDeps = {
        ipc,
        managers: {
          library: {
            legendary: { getGame: () => ({ getGameInfo: () => gameInfo }) }
          }
        },
        paths: profile.paths,
        config: { getSettings: () => settings },
        runner: {
          run: (command: string) =>
            Promise.resolve({
              code: command === 'reg.exe' && c.registry ? 0 : 1,
              signal: null,
              stdout:
                command === 'reg.exe' && c.registry
                  ? regOutput(REGISTRY_DESKTOP)
                  : '',
              stderr: '',
              timedOut: false
            })
        }
      } as unknown as Parameters<typeof registerShortcutsFlows>[0]
      registerShortcutsFlows(flowDeps)

      if (c.title) {
        const [desktopFile, menuFile] = shortcutFiles(
          { paths: profile.paths },
          c.title,
          c.platform === 'win32' && c.registry ? REGISTRY_DESKTOP : undefined
        )
        seedTree(c, profile, desktopFile, menuFile as string)
      }

      const handler = ipcViews(ipc).handlerRegistry.get('shortcutsExists')
      if (!handler) throw new Error('shortcutsExists is not registered')
      const exists = await (
        handler as (e: unknown, appName: string, runner: string) => unknown
      )(undefined, 'oracle-app', 'legendary')
      const macDeps = { paths: profile.paths, config: flowDeps.config }
      return {
        platform: c.platform,
        windowsRegistry: c.platform === 'win32' ? c.registry : null,
        input: {
          title: c.title,
          desktop: c.desktop,
          menu: c.menu
        },
        exists,
        macDesktopShortcutPresent: macDesktopShortcutPresent(
          macDeps,
          c.title ?? undefined
        ),
        macDesktopShortcutWanted: macDesktopShortcutWanted(macDeps)
      }
    } finally {
      existsSpy?.mockRestore()
      restore()
    }
  })
}

// ------------------------------------------------------------------- suite

describe('shortcut sanitize, path and exists oracle (94-05)', () => {
  describe.each([
    ['sanitize', SANITIZE_CASES, SANITIZE_FLOOR],
    ['paths', PATHS_CASES, PATHS_FLOOR],
    ['exists', EXISTS_CASES, EXISTS_FLOOR]
  ] as const)('%s', (slice, cases, floor) => {
    const ids = cases.map((c) => c.id)

    it('the case list is at or above the floor and agrees with the committed manifest', () => {
      syncManifest(slice, ids, floor)
      assertManifest(slice, ids, floor)
    })

    it('an empty case list fails the floor', () => {
      expectEmptyCasesToFail(slice, floor)
    })
  })

  it.each(SANITIZE_CASES.map((c) => [c.id, c] as const))(
    'sanitize %s',
    (_id, c) => {
      writeOrCompareGolden('sanitize', c.id, sanitizeGolden(c))
    }
  )

  it.each(PATHS_CASES.map((c) => [c.id, c] as const))(
    'paths %s',
    async (_id, c) => {
      writeOrCompareGolden('paths', c.id, await pathsGolden(c))
    }
  )

  it.each(EXISTS_CASES.map((c) => [c.id, c] as const))(
    'exists %s',
    async (_id, c) => {
      writeOrCompareGolden('exists', c.id, await existsGolden(c))
    }
  )
})
