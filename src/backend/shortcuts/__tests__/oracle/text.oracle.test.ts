/**
 * The shortcut text oracle (94-05, D-14, D-23): the real `addShortcuts`, driven over hostile names
 * on a fake HOME for macOS and Linux, recorded as the goldens the Rust shortcut writers are held to.
 *
 * What is recorded per case is the tree the TypeScript left behind: the macOS `.app` (`run.sh` and
 * `Info.plist` bytes, the `run.sh` mode, the Desktop symlink target) or the Linux `.desktop` files
 * (bytes and requested mode). The with-icon variants pre-create the icon file `getIcon` finds, so
 * no network is touched; the macOS `.icns` conversion itself is not goldened here (94-07 records its
 * geometry), only that `Info.plist` gains the `CFBundleIconFile` key pair and the file exists.
 *
 * Modes (see testUtils/shortcutsOracle/harness.ts):
 *   GAMELIB_WRITE_SHORTCUTS_GOLDEN=1   rewrite every golden from the TypeScript
 *   (default)                          recompute and compare, offline
 *
 * Every case runs on a fresh isolated HOME; the macOS launch command names `<SHELL_EXE>`, a path in
 * that profile. No expected byte is typed here, only the inputs.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { addShortcuts } from '../../shortcuts/shortcuts'
import {
  assertManifest,
  createFakeImageTools,
  expectEmptyCasesToFail,
  mockPlatform,
  readTree,
  recordRequestedModes,
  syncManifest,
  withShortcutsOracleProfile,
  writeOrCompareGolden,
  type ShortcutsOraclePlatform,
  type TreeEntry
} from 'backend/testUtils/shortcutsOracle/harness'
import {
  HOSTILE_NAMES,
  HOSTILE_RUNNERS,
  SHORTCUT_RUNNERS
} from './hostileNames'
import type { GameInfo } from 'common/types'
import type { Game } from 'common/types/game_manager'

const SLICE = 'text'
/** The case count this plan commits; a later edit may raise it, never lower it. */
const FLOOR = 40

type TextPlatform = Extract<ShortcutsOraclePlatform, 'darwin' | 'linux'>
const PLATFORMS: readonly TextPlatform[] = ['darwin', 'linux']

interface Settings {
  addDesktopShortcuts: boolean
  addStartMenuShortcuts: boolean
  addSteamShortcuts: false
}

const BOTH: Settings = {
  addDesktopShortcuts: true,
  addStartMenuShortcuts: true,
  addSteamShortcuts: false
}

interface TextCase {
  id: string
  platform: TextPlatform
  title: string
  appName: string
  runner: string
  settings: Settings
  fromMenu: boolean
  withIcon: boolean
}

function buildCases(): TextCase[] {
  const cases: TextCase[] = []
  const add = (
    platform: TextPlatform,
    id: string,
    patch: Partial<TextCase> & Pick<TextCase, 'title' | 'appName'>
  ): void => {
    cases.push({
      id: `${platform}-${id}`,
      platform,
      runner: 'legendary',
      settings: BOTH,
      fromMenu: false,
      withIcon: false,
      ...patch
    })
  }
  const byId = (id: string) => {
    const found = HOSTILE_NAMES.find((n) => n.id === id)
    if (!found) throw new Error(`no hostile name ${id}`)
    return found
  }
  const plain = byId('plain')
  for (const platform of PLATFORMS) {
    // Every hostile title and app name, on the default runner.
    for (const name of HOSTILE_NAMES) {
      add(platform, `${name.id}-legendary`, {
        title: name.title,
        appName: name.appName
      })
    }
    // Every runner over the names that stress each template, and the plain name.
    for (const id of ['plain', 'subshell', 'astral', 'everything']) {
      const name = byId(id)
      for (const runner of SHORTCUT_RUNNERS) {
        if (runner === 'legendary') continue
        add(platform, `${name.id}-${runner}`, {
          title: name.title,
          appName: name.appName,
          runner
        })
      }
    }
    // Runner strings that are not runners, to pin how the launch URL escapes them.
    for (const r of HOSTILE_RUNNERS) {
      add(platform, `plain-${r.id}`, {
        title: plain.title,
        appName: plain.appName,
        runner: r.runner
      })
    }
    // Which files each setting writes.
    const settingsVariants: [string, Settings, boolean][] = [
      ['desktop-only', { ...BOTH, addStartMenuShortcuts: false }, false],
      ['menu-only', { ...BOTH, addDesktopShortcuts: false }, false],
      [
        'neither',
        { ...BOTH, addDesktopShortcuts: false, addStartMenuShortcuts: false },
        false
      ],
      [
        'from-menu',
        { ...BOTH, addDesktopShortcuts: false, addStartMenuShortcuts: false },
        true
      ]
    ]
    for (const [variant, settings, fromMenu] of settingsVariants) {
      add(platform, `plain-legendary-${variant}`, {
        title: plain.title,
        appName: plain.appName,
        settings,
        fromMenu
      })
    }
    // The icon key pair (macOS `CFBundleIconFile`, Linux `Icon=`).
    for (const name of HOSTILE_NAMES.filter((n) => n.iconSafe)) {
      add(platform, `${name.id}-legendary-icon`, {
        title: name.title,
        appName: name.appName,
        withIcon: true
      })
    }
    for (const runner of ['gog', 'steam']) {
      add(platform, `plain-${runner}-icon`, {
        title: plain.title,
        appName: plain.appName,
        runner,
        withIcon: true
      })
    }
  }
  return cases
}

const CASES = buildCases()

async function runCase(c: TextCase): Promise<unknown> {
  return withShortcutsOracleProfile(async (profile) => {
    const restorePlatform = mockPlatform(c.platform)
    const modes = recordRequestedModes()
    try {
      if (c.platform === 'linux') {
        // The Linux arm writes into folders it does not create; a real desktop has both.
        mkdirSync(profile.desktop, { recursive: true })
        mkdirSync(join(profile.home, '.local', 'share', 'applications'), {
          recursive: true
        })
      }
      if (c.withIcon) {
        mkdirSync(profile.icons, { recursive: true })
        writeFileSync(join(profile.icons, `${c.appName}.jpg`), 'icon')
      }
      const gameInfo = {
        runner: c.runner,
        app_name: c.appName,
        art_cover: '',
        art_square: '',
        install: { is_dlc: false, executable: '' },
        is_installed: true,
        title: c.title,
        canRunOffline: true
      } as unknown as GameInfo
      const game = { getGameInfo: () => gameInfo } as unknown as Game
      const deps = {
        libraryManagers: { gog: { getProductApi: () => Promise.resolve() } },
        runner: {
          run: () => Promise.reject(new Error('no process in a text case'))
        },
        aborts: {
          create: () => {
            throw new Error('no download in a text case')
          }
        },
        config: { getSettings: () => c.settings },
        paths: profile.paths,
        imageTools: createFakeImageTools()
      } as unknown as Parameters<typeof addShortcuts>[0]

      await addShortcuts(deps, game, c.fromMenu)

      const snapshot = (rel: string[]): TreeEntry[] =>
        readTree(join(profile.home, ...rel), {
          profile,
          modes,
          opaque: (path) => path.endsWith('shortcut.icns')
        })
      return {
        platform: c.platform,
        input: {
          title: c.title,
          appName: c.appName,
          runner: c.runner,
          settings: c.settings,
          fromMenu: c.fromMenu,
          withIcon: c.withIcon
        },
        outcome: 'resolved',
        tree: {
          Applications: snapshot(['Applications']),
          Desktop: snapshot(['Desktop']),
          '.local/share/applications': snapshot([
            '.local',
            'share',
            'applications'
          ])
        }
      }
    } finally {
      modes.restore()
      restorePlatform()
    }
  })
}

describe('shortcut text oracle (94-05)', () => {
  const ids = CASES.map((c) => c.id)

  it('the case list is at or above the floor and agrees with the committed manifest', () => {
    syncManifest(SLICE, ids, FLOOR)
    assertManifest(SLICE, ids, FLOOR)
  })

  it('an empty case list fails the floor', () => {
    expectEmptyCasesToFail(SLICE, FLOOR)
  })

  it.each(CASES.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    const value = await runCase(c)
    writeOrCompareGolden(SLICE, c.id, value)
  })
})
