/**
 * The removal, icon geometry and icon lookup oracle (94-07, D-12, D-22, D-25, D-29): what the
 * TypeScript does when a shortcut is removed (and when the add flow clears a Desktop item), the crop
 * the macOS `.icns` conversion applies, and which icon `getIcon` settles on. Recorded as the goldens
 * the Rust port replays on every OS (Windows and Linux are proven by CI golden replay only, D-11).
 *
 *   remove/         `removeShortcuts` on darwin, linux and win32, over what is on disk. A shortcut GameLib
 *                   wrote is made by the real `addShortcuts` (proof-bearing); an item GameLib did not write
 *                   is placed by hand (a plain `.app` folder, a `.desktop` without the GameLib Exec line, a
 *                   `.lnk` without the gamelib URL, a link to somewhere else). Each golden holds the tree
 *                   before and after. TODAY the TS deletes every one of them; the Rust port refuses the ones
 *                   GameLib did not write (D-29), so each of those cases carries a delta in
 *                   `remove/deltas.json` (`recordDelta`), and so does each add-side Desktop clear that the
 *                   Rust add will refuse (`addclear-` cases, FND-02/D-22). A delta is a recorded deliberate
 *                   change, not a silent one.
 *   icon_geometry/  darwin only (it needs `/usr/bin/sips`): PNG inputs with distinct colour bands go
 *                   through the shipped shim chain, and the golden holds the output size and the colour at
 *                   fixed sample points, which show which band the centred crop kept (D-25). The test is
 *                   skipped elsewhere; its committed goldens are what Rust replays on every OS.
 *   get_icon/       `getIcon`'s answer and the URL it asks for, with `downloadFile` replaced.
 *
 * Modes (see testUtils/shortcutsOracle/harness.ts):
 *   GAMELIB_WRITE_SHORTCUTS_GOLDEN=1   rewrite every golden (and the deltas) from the TypeScript
 *   (default)                          recompute and compare, offline
 *
 * Every case runs on a fresh `createFakeHomeProfile()` (T-94-12): the real `~/Applications`, Desktop and
 * Start Menu are never read. On win32 the registry Desktop is the synthetic `Z:\GameLibOracle\Desktop`,
 * mapped onto the profile's Desktop for the writes, `existsSync` and `unlink` that name it.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import fsPromises from 'fs/promises'
import { deflateSync, inflateSync, crc32 } from 'zlib'
import { dirname, join } from 'path'
import gracefulFs from 'graceful-fs'
import * as backendUtils from 'backend/utils'
import {
  addShortcuts,
  removeShortcuts,
  shortcutFiles
} from '../../shortcuts/shortcuts'
import { getIcon } from '../../utils'
import { createNativeImage } from 'backend/sidecar/nativeImageShim'
import { createRealRunner } from 'backend/testUtils/realRunner'
import {
  assertManifest,
  createFakeImageTools,
  expectEmptyCasesToFail,
  goldenDir,
  mockPlatform,
  normalisePaths,
  portablePath,
  readTree,
  recordDelta,
  recordRequestedModes,
  shortcutsGoldenMode,
  syncManifest,
  withShortcutsOracleProfile,
  writeOrCompareGolden,
  type RequestedModes,
  type ShortcutsOraclePlatform,
  type ShortcutsOracleProfile,
  type TreeEntry
} from 'backend/testUtils/shortcutsOracle/harness'
import { HOSTILE_NAMES } from './hostileNames'
import type { GameInfo } from 'common/types'
import type { Game } from 'common/types/game_manager'

/** The case counts this plan commits; a later edit may raise them, never lower them. */
const REMOVE_FLOOR = 20
const GEOMETRY_FLOOR = 4
const GET_ICON_FLOOR = 6

/** A registry Desktop folder nothing may create anything under (it is mapped, see the header). */
const REGISTRY_DESKTOP = 'Z:\\GameLibOracle\\Desktop'

const USER_SHELL_FOLDERS =
  'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'

const hostile = (id: string): { title: string; appName: string } => {
  const found = HOSTILE_NAMES.find((n) => n.id === id)
  if (!found) throw new Error(`no hostile name ${id}`)
  return { title: found.title, appName: found.appName }
}

// ------------------------------------------------------------------ remove

type Foreign =
  /** A real bundle folder (macOS), made by hand: nothing in it proves GameLib wrote it. */
  | 'folder'
  /** A plain file: a `.desktop` without the GameLib Exec line, or a `.lnk` without the gamelib URL. */
  | 'file'
  /** A symlink to an item that exists elsewhere. */
  | 'link-elsewhere'
  /** A symlink to somewhere that does not exist. */
  | 'dangling-elsewhere'
  /** A GameLib bundle copied over the Desktop link (the legacy real bundle). */
  | 'legacy-gamelib-bundle'
  /** The Desktop link GameLib made, left dangling after the bundle was removed. */
  | 'dangling-gamelib-link'

interface RemoveCase {
  family: 'remove' | 'addclear'
  id: string
  platform: ShortcutsOraclePlatform
  title: string
  appName: string
  /** Which shortcuts the TS creates first (`addShortcuts`, proof-bearing). */
  create: 'both' | 'desktop' | 'menu' | 'none'
  /** Hand-placed items by location; they are NOT written by GameLib unless the kind says so. */
  desktop?: Foreign
  menu?: Foreign
  /** win32: the registry answered with a Desktop folder. */
  registry: boolean
  /** addclear: the item sits on the Desktop before `addShortcuts` runs. */
  seedBeforeAdd: boolean
}

function removeCases(): RemoveCase[] {
  const plain = hostile('plain')
  const out: RemoveCase[] = []
  const add = (
    id: string,
    platform: ShortcutsOraclePlatform,
    patch: Partial<RemoveCase> = {}
  ): void => {
    out.push({
      family: 'remove',
      id,
      platform,
      ...plain,
      create: 'none',
      registry: true,
      seedBeforeAdd: false,
      ...patch
    })
  }
  // ----- darwin
  add('darwin-created-both', 'darwin', { create: 'both' })
  add('darwin-created-menu-only', 'darwin', { create: 'menu' })
  add('darwin-created-legacy-desktop-bundle', 'darwin', {
    create: 'both',
    desktop: 'legacy-gamelib-bundle'
  })
  add('darwin-created-dangling-desktop-link', 'darwin', {
    create: 'both',
    desktop: 'dangling-gamelib-link'
  })
  add('darwin-not-created-plain-app-folder', 'darwin', { menu: 'folder' })
  add('darwin-not-created-desktop-real-folder', 'darwin', {
    desktop: 'folder'
  })
  add('darwin-not-created-desktop-symlink-elsewhere', 'darwin', {
    desktop: 'link-elsewhere'
  })
  add('darwin-not-created-desktop-dangling-elsewhere', 'darwin', {
    desktop: 'dangling-elsewhere'
  })
  add('darwin-not-created-both-folders', 'darwin', {
    desktop: 'folder',
    menu: 'folder'
  })
  add('darwin-nothing-there', 'darwin')
  // ----- linux
  add('linux-created-both', 'linux', { create: 'both' })
  add('linux-created-desktop-only', 'linux', { create: 'desktop' })
  add('linux-created-menu-only', 'linux', { create: 'menu' })
  add('linux-not-created-both-files', 'linux', {
    desktop: 'file',
    menu: 'file'
  })
  add('linux-not-created-desktop-only', 'linux', { desktop: 'file' })
  add('linux-not-created-menu-only', 'linux', { menu: 'file' })
  add('linux-not-created-desktop-symlink-elsewhere', 'linux', {
    desktop: 'link-elsewhere'
  })
  add('linux-created-desktop-foreign-menu', 'linux', {
    create: 'desktop',
    menu: 'file'
  })
  add('linux-nothing-there', 'linux')
  // ----- win32
  add('win32-created-both', 'win32', { create: 'both' })
  add('win32-created-menu-only', 'win32', { create: 'menu' })
  add('win32-created-registry-failed', 'win32', {
    create: 'both',
    registry: false
  })
  add('win32-not-created-both-lnk', 'win32', {
    desktop: 'file',
    menu: 'file'
  })
  add('win32-not-created-menu-only', 'win32', { menu: 'file' })
  add('win32-not-created-desktop-only', 'win32', { desktop: 'file' })
  add('win32-not-created-registry-failed-menu', 'win32', {
    menu: 'file',
    registry: false
  })
  add('win32-created-desktop-foreign-menu', 'win32', {
    create: 'desktop',
    menu: 'file'
  })
  add('win32-nothing-there', 'win32')
  // ----- hostile titles: the path derivation, on every OS
  for (const id of ['subshell', 'non-ascii', 'reserved-con']) {
    for (const platform of ['darwin', 'linux', 'win32'] as const) {
      add(`${platform}-created-both-${id}`, platform, {
        create: 'both',
        ...hostile(id)
      })
    }
  }
  // ----- the add-side Desktop clear (macOS `linkDesktopToApplications`)
  const clear = (id: string, desktop?: Foreign): void => {
    out.push({
      family: 'addclear',
      id: `addclear-darwin-${id}`,
      platform: 'darwin',
      ...plain,
      create: 'both',
      desktop,
      registry: true,
      seedBeforeAdd: true
    })
  }
  clear('nothing')
  clear('foreign-real-folder', 'folder')
  clear('foreign-file', 'file')
  clear('foreign-symlink-elsewhere', 'link-elsewhere')
  clear('foreign-dangling-elsewhere', 'dangling-elsewhere')
  clear('stale-gamelib-link', 'dangling-gamelib-link')
  clear('legacy-gamelib-bundle', 'legacy-gamelib-bundle')
  return out
}

/** A case is a delta when something GameLib did not write sits where Rust would refuse to delete. */
function hasForeignItem(c: RemoveCase): boolean {
  const isForeign = (kind: Foreign | undefined): boolean =>
    kind === 'folder' ||
    kind === 'file' ||
    kind === 'link-elsewhere' ||
    kind === 'dangling-elsewhere'
  return isForeign(c.desktop) || isForeign(c.menu)
}

const DELTA_REMOVE =
  'D-29: Rust refuses and reports not removed (no creation proof for an item GameLib did not write)'
const DELTA_ADD = 'FND-02/D-22: add refuses to clear an unproven Desktop item'

const deltaFor = (c: RemoveCase): string =>
  c.family === 'addclear' ? DELTA_ADD : DELTA_REMOVE

const REMOVE_CASES = removeCases()

/** The case's Desktop folder on win32 is synthetic; this maps a path naming it onto the profile. */
function desktopMapper(
  profile: ShortcutsOracleProfile
): (path: string) => string {
  return (path) =>
    path.startsWith(`${REGISTRY_DESKTOP}\\`)
      ? join(profile.desktop, path.slice(REGISTRY_DESKTOP.length + 1))
      : path
}

const regOutput = (value: string): string =>
  `\r\n${USER_SHELL_FOLDERS}\r\n    Desktop    REG_SZ    ${value}\r\n\r\n`

/** The platform-appropriate content of an item that carries nothing of GameLib. */
function foreignContent(platform: ShortcutsOraclePlatform): string {
  return platform === 'linux'
    ? '[Desktop Entry]\nName=Foreign\nExec=/usr/bin/foreign\nType=Application\n'
    : 'FOREIGN-LNK C:\\Program Files\\Foreign\\foreign.exe\r\n'
}

function placeForeign(
  kind: Foreign,
  path: string,
  c: RemoveCase,
  profile: ShortcutsOracleProfile
): void {
  const elsewhere = join(profile.home, 'Elsewhere')
  switch (kind) {
    case 'folder':
      mkdirSync(join(path, 'Contents', 'MacOS'), { recursive: true })
      writeFileSync(
        join(path, 'Contents', 'MacOS', 'run.sh'),
        '#!/bin/bash\necho foreign\n'
      )
      writeFileSync(join(path, 'Contents', 'Info.plist'), '<plist/>\n')
      return
    case 'file':
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, foreignContent(c.platform))
      return
    case 'link-elsewhere': {
      const target = join(elsewhere, 'Target')
      mkdirSync(target, { recursive: true })
      writeFileSync(join(target, 'keep.txt'), 'keep')
      mkdirSync(dirname(path), { recursive: true })
      symlinkSync(target, path)
      return
    }
    case 'dangling-elsewhere':
      mkdirSync(dirname(path), { recursive: true })
      symlinkSync(join(elsewhere, 'does-not-exist'), path)
      return
    case 'legacy-gamelib-bundle':
    case 'dangling-gamelib-link':
      // Made after the TS creates the real bundle (see runRemove).
      return
  }
}

interface RemoveTrees {
  before: TreeEntry[]
  after: TreeEntry[]
}

async function runRemove(c: RemoveCase): Promise<unknown> {
  return withShortcutsOracleProfile(async (profile) => {
    const restorePlatform = mockPlatform(c.platform)
    const modes: RequestedModes = recordRequestedModes()
    const map = desktopMapper(profile)
    const realExists = gracefulFs.existsSync
    const existsSpy = jest
      .spyOn(gracefulFs, 'existsSync')
      .mockImplementation((path) => realExists(map(String(path))))
    const realUnlink = fsPromises.unlink.bind(fsPromises)
    const unlinkSpy = jest
      .spyOn(fsPromises, 'unlink')
      .mockImplementation((path) => realUnlink(map(String(path))))
    try {
      const gameInfo = {
        runner: 'legendary',
        app_name: c.appName,
        art_cover: '',
        art_square: '',
        install: { is_dlc: false, executable: '' },
        is_installed: true,
        title: c.title,
        canRunOffline: true
      } as unknown as GameInfo
      const game = { getGameInfo: () => gameInfo } as unknown as Game
      const settings = {
        addDesktopShortcuts: c.create === 'both' || c.create === 'desktop',
        addStartMenuShortcuts: c.create === 'both' || c.create === 'menu',
        addSteamShortcuts: false
      }
      const applySettings = (desktop: boolean, menu: boolean): void => {
        settings.addDesktopShortcuts = desktop
        settings.addStartMenuShortcuts = menu
      }
      const runner = {
        run: (
          program: string,
          _argv: readonly string[],
          opts?: { env?: NodeJS.ProcessEnv }
        ) => {
          const done = (code: number, stdout = '') =>
            Promise.resolve({
              code,
              signal: null,
              stdout,
              stderr: '',
              timedOut: false
            })
          if (program === 'reg.exe') {
            return c.registry ? done(0, regOutput(REGISTRY_DESKTOP)) : done(1)
          }
          if (program === 'powershell.exe') {
            const lnk = map(opts?.env?.GAMELIB_LNK_PATH ?? '')
            mkdirSync(dirname(lnk), { recursive: true })
            writeFileSync(
              lnk,
              `GAMELIB-LNK ${opts?.env?.GAMELIB_LNK_ARGS ?? ''}\r\n`
            )
            return done(0)
          }
          return Promise.reject(new Error(`unexpected process ${program}`))
        }
      }
      const deps = {
        libraryManagers: { gog: { getProductApi: () => Promise.resolve() } },
        runner,
        aborts: {
          create: () => {
            throw new Error('no download in a remove case')
          }
        },
        config: { getSettings: () => settings },
        paths: profile.paths,
        imageTools: createFakeImageTools()
      } as unknown as Parameters<typeof addShortcuts>[0]

      if (c.platform === 'linux') {
        mkdirSync(profile.desktop, { recursive: true })
        mkdirSync(join(profile.home, '.local', 'share', 'applications'), {
          recursive: true
        })
      }

      const [desktopPath, menuPath] = shortcutFiles(
        { paths: profile.paths },
        c.title,
        c.platform === 'win32' && c.registry ? REGISTRY_DESKTOP : undefined
      )

      // 1. Items that must be on the Desktop before the TS add runs (the add-side clear).
      if (c.seedBeforeAdd && c.desktop && desktopPath) {
        if (c.desktop === 'legacy-gamelib-bundle' && menuPath) {
          // A real GameLib bundle on the Desktop: write one through the TS, copy it, drop the original.
          applySettings(false, true)
          await addShortcuts(deps, game)
          cpSync(menuPath, desktopPath, { recursive: true })
          rmSync(menuPath, { recursive: true, force: true })
          applySettings(
            c.create === 'both' || c.create === 'desktop',
            c.create === 'both' || c.create === 'menu'
          )
        } else if (c.desktop === 'dangling-gamelib-link' && menuPath) {
          mkdirSync(dirname(desktopPath), { recursive: true })
          symlinkSync(menuPath, desktopPath)
        } else {
          placeForeign(c.desktop, map(desktopPath), c, profile)
        }
      }
      const snapshot = (): TreeEntry[] =>
        readTree(profile.home, { profile, modes })
      const rejection = (error: unknown): unknown => ({
        result: 'rejected',
        message: normalisePaths(
          error instanceof Error ? error.message : String(error),
          profile
        )
      })

      // 2. The add-side clear: the add under test runs over what step 1 left on the Desktop.
      let before: TreeEntry[] = []
      let createOutcome: unknown = null
      let outcome: unknown = { result: 'resolved' }
      if (c.family === 'addclear') {
        before = snapshot()
        try {
          await addShortcuts(deps, game)
        } catch (error) {
          outcome = rejection(error)
        }
      } else {
        // 2. The shortcut the TS writes itself (proof-bearing), then items placed by hand.
        if (c.create !== 'none') {
          try {
            await addShortcuts(deps, game)
            createOutcome = { result: 'resolved' }
          } catch (error) {
            createOutcome = rejection(error)
          }
        }
        if (c.desktop && desktopPath) {
          if (c.desktop === 'legacy-gamelib-bundle' && menuPath) {
            rmSync(desktopPath, { recursive: true, force: true })
            cpSync(menuPath, desktopPath, { recursive: true })
          } else if (c.desktop === 'dangling-gamelib-link' && menuPath) {
            rmSync(menuPath, { recursive: true, force: true })
          } else {
            placeForeign(c.desktop, map(desktopPath), c, profile)
          }
        }
        if (c.menu && menuPath) placeForeign(c.menu, map(menuPath), c, profile)
        before = snapshot()
        try {
          await removeShortcuts(deps, game)
        } catch (error) {
          outcome = rejection(error)
        }
      }
      const trees: RemoveTrees = { before, after: snapshot() }
      return {
        family: c.family,
        platform: c.platform,
        input: {
          title: c.title,
          appName: c.appName,
          createdByTheTypeScript: c.create,
          desktop: c.desktop ?? null,
          menu: c.menu ?? null,
          registryDesktop: c.platform === 'win32' ? c.registry : null,
          seededBeforeAdd: c.seedBeforeAdd
        },
        createOutcome,
        gameLibWroteEverythingPresent: !hasForeignItem(c),
        outcome,
        tree: trees
      }
    } finally {
      unlinkSpy.mockRestore()
      existsSpy.mockRestore()
      modes.restore()
      restorePlatform()
    }
  })
}

// ---------------------------------------------------------------- get_icon

interface IconCase {
  id: string
  runner: string
  appName: string
  artSquare: string
  /** Files placed under the GOG install folder (relative `/` paths). */
  installFiles: string[]
  installPath: boolean
  /** What `getProductApi` answers: absent, no icon, or an icon URL. */
  productApi:
    | { kind: 'null' }
    | { kind: 'no-images' }
    | { kind: 'icon'; icon: string }
    | { kind: 'rejects' }
  /** Files already in the icons folder. */
  presentIcons: string[]
  download: 'ok' | 'fails' | 'writes-nothing'
  iconsFolderExists: boolean
}

function iconCases(): IconCase[] {
  const base = (id: string, patch: Partial<IconCase>): IconCase => ({
    id: `get-icon-${id}`,
    runner: 'legendary',
    appName: 'icon-app',
    artSquare: 'https://art.example.test/square.{ext}',
    installFiles: [],
    installPath: true,
    productApi: { kind: 'null' },
    presentIcons: [],
    download: 'ok',
    iconsFolderExists: false,
    ...patch
  })
  const gog = { runner: 'gog', appName: '1207658645' }
  return [
    base('gog-goggame-ico', {
      ...gog,
      installFiles: ['goggame-1207658645.ico']
    }),
    base('gog-support-icon-png', {
      ...gog,
      installFiles: ['support/icon.png']
    }),
    base('gog-ico-beats-support-png', {
      ...gog,
      installFiles: ['goggame-1207658645.ico', 'support/icon.png']
    }),
    base('gog-product-api-icon', {
      ...gog,
      productApi: { kind: 'icon', icon: '//images.gog.example/abc_icon.png' }
    }),
    base('gog-product-api-no-icon-falls-to-art-square', {
      ...gog,
      productApi: { kind: 'no-images' }
    }),
    base('gog-product-api-null-falls-to-art-square', { ...gog }),
    base('gog-product-api-rejects', {
      ...gog,
      productApi: { kind: 'rejects' }
    }),
    base('gog-no-install-path-asks-the-api', {
      ...gog,
      installPath: false,
      installFiles: ['goggame-1207658645.ico'],
      productApi: { kind: 'icon', icon: '//images.gog.example/abc_icon.png' }
    }),
    base('gog-api-icon-already-present', {
      ...gog,
      productApi: { kind: 'icon', icon: '//images.gog.example/abc_icon.png' },
      presentIcons: ['1207658645.png']
    }),
    base('gog-art-square-jpg-present-but-api-icon-wins', {
      ...gog,
      productApi: { kind: 'icon', icon: '//images.gog.example/abc_icon.png' },
      presentIcons: ['1207658645.jpg']
    }),
    base('non-gog-ignores-goggame-ico', {
      installFiles: ['goggame-icon-app.ico']
    }),
    base('art-square-ext-and-spaces', {
      artSquare: 'https://art.example.test/my cover/{ext}/a b.{ext}'
    }),
    base('art-square-plain-url', {
      artSquare: 'https://art.example.test/cover.jpg'
    }),
    base('art-square-already-present', { presentIcons: ['icon-app.jpg'] }),
    base('art-square-empty', { artSquare: '' }),
    base('art-square-empty-but-icon-present', {
      artSquare: '',
      presentIcons: ['icon-app.jpg']
    }),
    base('download-fails', { download: 'fails' }),
    base('download-writes-nothing', { download: 'writes-nothing' }),
    base('icons-folder-exists', { iconsFolderExists: true })
  ]
}

const ICON_CASES = iconCases()

async function runGetIcon(c: IconCase): Promise<unknown> {
  return withShortcutsOracleProfile(async (profile) => {
    const downloads: unknown[] = []
    const aborts: string[] = []
    const apiCalls: string[] = []
    const installPath = join(profile.home, 'GOG Games', 'Icon Game')
    if (c.installPath) {
      mkdirSync(installPath, { recursive: true })
      for (const rel of c.installFiles) {
        const file = join(installPath, ...rel.split('/'))
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, 'x')
      }
    }
    if (c.iconsFolderExists || c.presentIcons.length > 0) {
      mkdirSync(profile.icons, { recursive: true })
    }
    for (const name of c.presentIcons) {
      writeFileSync(join(profile.icons, name), 'present')
    }
    const spy = jest
      .spyOn(backendUtils, 'downloadFile')
      .mockImplementation(({ url, dest }) => {
        downloads.push({
          url,
          dest: portablePath(normalisePaths(dest, profile))
        })
        if (c.download === 'fails') {
          return Promise.reject(new Error('Failed to get headers'))
        }
        if (c.download === 'ok') {
          mkdirSync(dirname(dest), { recursive: true })
          writeFileSync(dest, `downloaded:${url}`)
        }
        return Promise.resolve()
      })
    try {
      const deps = {
        libraryManagers: {
          gog: {
            getProductApi: (appName: string) => {
              apiCalls.push(appName)
              switch (c.productApi.kind) {
                case 'null':
                  return Promise.resolve(null)
                case 'no-images':
                  return Promise.resolve({ data: { images: {} } })
                case 'icon':
                  return Promise.resolve({
                    data: { images: { icon: c.productApi.icon } }
                  })
                case 'rejects':
                  return Promise.reject(new Error('product api failed'))
              }
            }
          }
        },
        aborts: {
          create: (url: string) => {
            aborts.push(url)
            return new AbortController()
          }
        },
        paths: profile.paths
      } as unknown as Parameters<typeof getIcon>[0]
      const gameInfo = {
        runner: c.runner,
        app_name: c.appName,
        art_square: c.artSquare,
        art_cover: '',
        install: c.installPath ? { install_path: installPath } : {},
        title: 'Icon Game'
      } as unknown as GameInfo

      let outcome: unknown
      try {
        const icon = await getIcon(deps, c.appName, gameInfo)
        outcome = {
          result: 'resolved',
          icon:
            icon === undefined
              ? null
              : portablePath(normalisePaths(icon, profile))
        }
      } catch (error) {
        outcome = {
          result: 'rejected',
          message: error instanceof Error ? error.message : String(error)
        }
      }
      const listing = existsSync(profile.icons)
        ? readdirSync(profile.icons).sort()
        : null
      return {
        input: {
          runner: c.runner,
          appName: c.appName,
          artSquare: c.artSquare,
          installPathGiven: c.installPath,
          installFiles: c.installFiles,
          productApi: c.productApi,
          presentIcons: c.presentIcons,
          download: c.download,
          iconsFolderExistedBefore: c.iconsFolderExists
        },
        outcome,
        productApiCalls: apiCalls,
        aborts,
        downloads,
        iconsFolder: listing
      }
    } finally {
      spy.mockRestore()
    }
  })
}

// ----------------------------------------------------------- icon geometry

/** One RGB triple. */
type Rgb = readonly [number, number, number]

const RED: Rgb = [220, 30, 30]
const GREEN: Rgb = [30, 200, 30]
const BLUE: Rgb = [30, 30, 220]

interface GeometryCase {
  id: string
  width: number
  height: number
  /** `horizontal`: bands stack top to bottom. `vertical`: bands run left to right. */
  orientation: 'horizontal' | 'vertical'
  bands: readonly Rgb[]
}

const GEOMETRY_CASES: GeometryCase[] = [
  {
    id: 'tall-600x900-three-horizontal-bands',
    width: 600,
    height: 900,
    orientation: 'horizontal',
    bands: [RED, GREEN, BLUE]
  },
  {
    id: 'wide-900x400-three-vertical-bands',
    width: 900,
    height: 400,
    orientation: 'vertical',
    bands: [RED, GREEN, BLUE]
  },
  {
    id: 'square-512x512-three-vertical-bands',
    width: 512,
    height: 512,
    orientation: 'vertical',
    bands: [RED, GREEN, BLUE]
  },
  {
    id: 'small-100x300-three-horizontal-bands',
    width: 100,
    height: 300,
    orientation: 'horizontal',
    bands: [RED, GREEN, BLUE]
  }
]

/** Applies PNG filter `type` to one scanline of `bpp`-byte pixels (`prior` is the line above). */
function filterLine(
  type: number,
  line: Buffer,
  prior: Buffer,
  bpp: number
): Buffer {
  const out = Buffer.alloc(line.length)
  for (let i = 0; i < line.length; i++) {
    const a = i >= bpp ? (line[i - bpp] ?? 0) : 0
    const b = prior[i] ?? 0
    const c = i >= bpp ? (prior[i - bpp] ?? 0) : 0
    const x = line[i] ?? 0
    let predicted = 0
    if (type === 1) predicted = a
    else if (type === 2) predicted = b
    else if (type === 3) predicted = Math.floor((a + b) / 2)
    else if (type === 4) predicted = paeth(a, b, c)
    out[i] = (x - predicted) & 0xff
  }
  return out
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const check = Buffer.alloc(4)
  check.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, check])
}

/** An 8-bit PNG (`channels` 3 = RGB, 4 = RGBA) whose scanline `y` uses `filterOf(y)`. */
function encodePng(
  width: number,
  height: number,
  channels: 3 | 4,
  pixel: (x: number, y: number) => readonly number[],
  filterOf: (y: number) => number = () => 0
): Buffer {
  const bpp = channels
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = channels === 3 ? 2 : 6
  const rows: Buffer[] = []
  let prior: Buffer = Buffer.alloc(width * bpp)
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(width * bpp)
    for (let x = 0; x < width; x++) {
      const px = pixel(x, y)
      for (let k = 0; k < bpp; k++) line[x * bpp + k] = px[k] ?? 255
    }
    const type = filterOf(y)
    rows.push(
      Buffer.concat([Buffer.from([type]), filterLine(type, line, prior, bpp)])
    )
    prior = line
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ])
}

interface Decoded {
  width: number
  height: number
  /** RGBA, 8 bit per channel, row major. */
  at(x: number, y: number): [number, number, number, number]
}

/** Decodes a non-interlaced PNG of colour type 0, 2, 4 or 6 at bit depth 8 or 16. */
function decodePng(png: Buffer): Decoded {
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('not a PNG')
  }
  let pos = 8
  let width = 0
  let height = 0
  let depth = 0
  let colour = 0
  let interlace = 0
  const idat: Buffer[] = []
  while (pos < png.length) {
    const length = png.readUInt32BE(pos)
    const type = png.subarray(pos + 4, pos + 8).toString('ascii')
    const data = png.subarray(pos + 8, pos + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      depth = data[8] ?? 0
      colour = data[9] ?? 0
      interlace = data[12] ?? 0
    } else if (type === 'IDAT') idat.push(data)
    pos += 12 + length
  }
  const channelsOf: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 }
  const channels = channelsOf[colour]
  if (channels === undefined || (depth !== 8 && depth !== 16) || interlace) {
    throw new Error(
      `unsupported PNG (colour type ${colour}, depth ${depth}, interlace ${interlace})`
    )
  }
  const bytesPerPixel = (channels * depth) / 8
  const stride = width * bytesPerPixel
  const raw = inflateSync(Buffer.concat(idat))
  const pixels = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)] ?? 0
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a =
        i >= bytesPerPixel ? (pixels[y * stride + i - bytesPerPixel] ?? 0) : 0
      const b = y > 0 ? (pixels[(y - 1) * stride + i] ?? 0) : 0
      const c =
        y > 0 && i >= bytesPerPixel
          ? (pixels[(y - 1) * stride + i - bytesPerPixel] ?? 0)
          : 0
      let predicted = 0
      if (type === 1) predicted = a
      else if (type === 2) predicted = b
      else if (type === 3) predicted = Math.floor((a + b) / 2)
      else if (type === 4) predicted = paeth(a, b, c)
      pixels[y * stride + i] = ((src[i] ?? 0) + predicted) & 0xff
    }
  }
  return {
    width,
    height,
    at(x, y) {
      const base = y * stride + x * bytesPerPixel
      const sample = (channel: number): number =>
        pixels[base + channel * (depth / 8)] ?? 0
      if (colour === 0) return [sample(0), sample(0), sample(0), 255]
      if (colour === 4) return [sample(0), sample(0), sample(0), sample(1)]
      return [sample(0), sample(1), sample(2), colour === 6 ? sample(3) : 255]
    }
  }
}

/** The input a geometry case feeds the shim: bands across the whole image, no gradient. */
function bandedPng(c: GeometryCase): Buffer {
  const colourAt = (x: number, y: number): Rgb => {
    const along = c.orientation === 'horizontal' ? y / c.height : x / c.width
    const index = Math.min(
      c.bands.length - 1,
      Math.floor(along * c.bands.length)
    )
    return c.bands[index] ?? RED
  }
  return encodePng(c.width, c.height, 3, colourAt)
}

/** Sample points as fractions of the output size, along the two centre lines. */
const FRACTIONS = [0.03, 0.12, 0.5, 0.88, 0.97] as const

function samplePoints(
  width: number,
  height: number
): { x: number; y: number }[] {
  const at = (fraction: number, size: number): number =>
    Math.min(size - 1, Math.floor(fraction * size))
  return [
    ...FRACTIONS.map((f) => ({ x: at(0.5, width), y: at(f, height) })),
    ...FRACTIONS.map((f) => ({ x: at(f, width), y: at(0.5, height) }))
  ]
}

// ------------------------------------------------------------------- suite

describe('removal, icon geometry and getIcon oracle (94-07)', () => {
  describe('remove', () => {
    const ids = REMOVE_CASES.map((c) => c.id)

    it('the case list is at or above the floor and agrees with the committed manifest', () => {
      syncManifest('remove', ids, REMOVE_FLOOR)
      assertManifest('remove', ids, REMOVE_FLOOR)
    })

    it('an empty case list fails the floor', () => {
      expectEmptyCasesToFail('remove', REMOVE_FLOOR)
    })

    it.each(REMOVE_CASES.map((c) => [c.id, c] as const))(
      '%s',
      async (_id, c) => {
        writeOrCompareGolden('remove', c.id, await runRemove(c))
      }
    )

    it('every item GameLib did not write carries a recorded deliberate delta (D-29, D-22)', () => {
      const expected = Object.fromEntries(
        REMOVE_CASES.filter(hasForeignItem)
          .map((c) => [c.id, deltaFor(c)] as const)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      )
      expect(Object.keys(expected).length).toBeGreaterThanOrEqual(4)
      if (shortcutsGoldenMode() === 'write') {
        rmSync(join(goldenDir('remove'), 'deltas.json'), { force: true })
        for (const [id, reason] of Object.entries(expected)) {
          recordDelta('remove', id, reason)
        }
      }
      const file = join(goldenDir('remove'), 'deltas.json')
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(expected)
    })
  })

  describe('get_icon', () => {
    const ids = ICON_CASES.map((c) => c.id)

    it('the case list is at or above the floor and agrees with the committed manifest', () => {
      syncManifest('get_icon', ids, GET_ICON_FLOOR)
      assertManifest('get_icon', ids, GET_ICON_FLOOR)
    })

    it('an empty case list fails the floor', () => {
      expectEmptyCasesToFail('get_icon', GET_ICON_FLOOR)
    })

    it.each(ICON_CASES.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
      writeOrCompareGolden('get_icon', c.id, await runGetIcon(c))
    })
  })

  describe('the PNG codec the geometry cases use (every host)', () => {
    const colourAt = (x: number, y: number): readonly number[] => [
      (x * 7 + y * 3) & 0xff,
      (x * 5 + y * 11) & 0xff,
      (x * 13 + y * 2) & 0xff,
      (x + y) & 0xff
    ]

    it.each([0, 1, 2, 3, 4])(
      'decodes what it encodes with scanline filter %i (RGB and RGBA)',
      (filter) => {
        for (const channels of [3, 4] as const) {
          const png = encodePng(13, 9, channels, colourAt, () => filter)
          const decoded = decodePng(png)
          expect([decoded.width, decoded.height]).toEqual([13, 9])
          for (let y = 0; y < 9; y++) {
            for (let x = 0; x < 13; x++) {
              const [r, g, b, a] = colourAt(x, y)
              expect(decoded.at(x, y)).toEqual([
                r,
                g,
                b,
                channels === 4 ? a : 255
              ])
            }
          }
        }
      }
    )

    it('mixes filters across the scanlines of one image', () => {
      const png = encodePng(20, 10, 4, colourAt, (y) => y % 5)
      const decoded = decodePng(png)
      expect(decoded.at(19, 9)).toEqual(colourAt(19, 9))
    })

    it('rejects an interlaced or unsupported PNG by name', () => {
      const png = encodePng(2, 2, 3, () => [1, 2, 3])
      png[28] = 1
      expect(() => decodePng(png)).toThrow(/unsupported PNG/)
    })

    it('the banded inputs have the dimensions and bands the cases name', () => {
      for (const c of GEOMETRY_CASES) {
        const decoded = decodePng(bandedPng(c))
        expect([decoded.width, decoded.height]).toEqual([c.width, c.height])
        const first = decoded.at(0, 0)
        expect(first.slice(0, 3)).toEqual([...RED])
        const last = decoded.at(c.width - 1, c.height - 1)
        expect(last.slice(0, 3)).toEqual([...BLUE])
      }
    })
  })

  // `/usr/bin/sips` exists only on macOS; the committed goldens are what Rust replays elsewhere.
  const HOST_IS_DARWIN = process.platform === 'darwin'
  const geometryDescribe = HOST_IS_DARWIN ? describe : describe.skip

  geometryDescribe('icon_geometry (darwin only: /usr/bin/sips)', () => {
    const real = HOST_IS_DARWIN ? createRealRunner() : null
    afterAll(() => real?.dispose())
    const ids = GEOMETRY_CASES.map((c) => c.id)

    it('the case list is at or above the floor and agrees with the committed manifest', () => {
      syncManifest('icon_geometry', ids, GEOMETRY_FLOOR)
      assertManifest('icon_geometry', ids, GEOMETRY_FLOOR)
    })

    it('an empty case list fails the floor', () => {
      expectEmptyCasesToFail('icon_geometry', GEOMETRY_FLOOR)
    })

    it.each(GEOMETRY_CASES.map((c) => [c.id, c] as const))('%s', (_id, c) => {
      if (!real) throw new Error('no real runner')
      const image = createNativeImage({
        runSync: (cmd, argv, opts) => real.runner.runSync(cmd, argv, opts)
      })
      // The exact chain `convertPngToICNS` runs (shortcuts.ts).
      let output: unknown
      try {
        const png = image
          .createFromBuffer(bandedPng(c))
          .resize({ width: 512 })
          .crop({ x: 0, y: 0, width: 512, height: 512 })
          .toPNG()
        const decoded = decodePng(png)
        output = {
          width: decoded.width,
          height: decoded.height,
          samples: samplePoints(decoded.width, decoded.height).map((p) => ({
            ...p,
            rgba: decoded.at(p.x, p.y)
          }))
        }
      } catch (error) {
        output = {
          threw: true,
          message: (error instanceof Error ? error.message : String(error))
            .replace(/\/[^\s]*gamelib-nativeimage-[^\s]*/g, '<TMP>')
            .slice(0, 200)
        }
      }
      writeOrCompareGolden('icon_geometry', c.id, {
        input: {
          width: c.width,
          height: c.height,
          orientation: c.orientation,
          bands: c.bands
        },
        chain:
          'createFromBuffer(png).resize({ width: 512 }).crop({ x: 0, y: 0, width: 512, height: 512 }).toPNG()',
        output
      })
    })
  })
})
