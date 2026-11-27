/**
 * Phase 82 plan 07 (FND-02, D-10/D-12/D-16): GOG's uninstall checks the install folder and the
 * support folder with the Rust guard BEFORE it splices the installed list and before unins000.exe
 * runs, and deletes both through one guarded call. Real tmp folders, an injected safety
 * transport (fakeSafetyRustInvoke), no module mocked.
 */
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, sep } from 'path'
import { initHeadless } from 'backend/logger'
import GOGGame from '../games'
import { elevatedStartProcessArgs, gogUninstallStep } from '../windowsElevation'
import { deriveGogPaths } from '../constants'
import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
import { fakeSafetyRustInvoke } from 'backend/testUtils/fakeSafetyRust'
import type { RequestRustInvoke } from 'backend/host'
import type { GOGManagerDeps } from '../library'
import type { GOGCloudSavesLocation } from 'common/types/gog'
import { RUST_SAFETY_REMOVE_TREE } from 'common/types/sidecarTransport'

// Phase 94 Plan 22: an uninstall also asks Rust to remove the game's desktop and Steam shortcuts (`shortcuts_remove` and
// `shortcuts_steam_remove`, resolvers in `humbleshortcuts/shortcuts.ts`); the safety fake answers every other channel
// through its `base`, so these tests give it an answer for exactly those two and nothing else.
const shortcutsReply: RequestRustInvoke = (channel) =>
  channel === 'shortcuts_remove' || channel === 'shortcuts_steam_remove'
    ? Promise.resolve(null)
    : Promise.reject(new Error(`unexpected channel ${channel}`))

const ID = '1207658930'
const root = join(tmpdir(), `gamelib-gog-uninstall-safety-${process.pid}`)
const paths = createTestAppPaths(root)
const { gogSupportPath, gogdlConfigPath } = deriveGogPaths(paths)
const installDir = join(root, 'games', 'Some Game')
const supportDir = join(gogSupportPath, ID)
const manifest = join(gogdlConfigPath, 'manifests', ID)

interface Harness {
  game: GOGGame
  sent: [string, unknown][]
  installedSet: unknown[]
  unins: { wine: number; spawn: number; winePath: number }
  spawnCalls: { command: string; args: string[]; options: unknown }[]
  installedList: { appName: string; install_path: string }[]
}

function build(
  requestRustInvoke: RequestRustInvoke,
  other?: { runner: 'legendary'; appName: string; installPath: string },
  saves?: {
    gogSaves?: GOGCloudSavesLocation[]
    gogSaveLocation?: GOGCloudSavesLocation[]
  }
): Harness {
  const installedList = [{ appName: ID, install_path: installDir }]
  const installedSet: unknown[] = []
  const sent: [string, unknown][] = []
  const unins = { wine: 0, spawn: 0, winePath: 0 }
  const spawnCalls: Harness['spawnCalls'] = []
  const info = {
    app_name: ID,
    title: 'Some Game',
    is_installed: true,
    ...(saves?.gogSaveLocation
      ? { gog_save_location: saves.gogSaveLocation }
      : {})
  }
  const libraryManagers = {
    gog: {
      getGameInfo: () => info,
      getListOfGames: () => [
        { ...info, install: { install_path: installDir } }
      ],
      refreshInstalled: () => undefined,
      getGame: () => ({ getGameInfo: () => info })
    },
    legendary: {
      getListOfGames: () =>
        other
          ? [
              {
                app_name: other.appName,
                is_installed: true,
                install: { install_path: other.installPath }
              }
            ]
          : [],
      getGame: () => ({ getGameInfo: () => ({ title: 'Other Game' }) })
    }
  }
  const deps = {
    paths,
    libraryManagers,
    requestRustInvoke,
    sendFrontendMessage: (channel: string, payload: unknown) => {
      sent.push([channel, payload])
    },
    config: {
      getSettings: () => ({
        defaultInstallPath: '',
        sharedWinePrefix: '',
        // A Steam folder that does not exist: removeNonSteamGame returns early.
        defaultSteamPath: join(root, 'no-steam')
      })
    },
    stores: {
      gog: {
        installedGamesStore: {
          get: () => installedList,
          set: (_key: string, value: unknown) => {
            installedSet.push(value)
          }
        },
        syncStore: { delete: () => undefined }
      }
    },
    gameConfigs: {
      get: () => ({
        config: {
          winePrefix: join(root, 'pfx'),
          ...(saves?.gogSaves ? { gogSaves: saves.gogSaves } : {})
        },
        getSettings: () =>
          Promise.resolve({
            winePrefix: join(root, 'pfx'),
            ...(saves?.gogSaves ? { gogSaves: saves.gogSaves } : {})
          })
      })
    },
    commandRunner: {
      getWinePath: () => {
        unins.winePath++
        return Promise.resolve('Z:/x')
      },
      runWineCommand: () => {
        unins.wine++
        return Promise.resolve({ stdout: '', stderr: '' })
      }
    },
    spawnAsync: (command: string, args: string[], options?: unknown) => {
      unins.spawn++
      spawnCalls.push({ command, args, options })
      return Promise.resolve({ stdout: '', stderr: '' })
    },
    runner: { run: () => Promise.resolve({ stdout: '', stderr: '' }) }
  } as unknown as GOGManagerDeps
  return {
    game: new GOGGame(ID, deps),
    sent,
    installedSet,
    unins,
    spawnCalls,
    installedList
  }
}

const notices = (h: Harness) =>
  h.sent.filter(([channel]) => channel === 'removalRefusedNotice')

// The real logger needs its writer (the jest-contained fake HOME holds the file).
beforeAll(() => initHeadless())

beforeEach(() => {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(installDir, { recursive: true })
  mkdirSync(supportDir, { recursive: true })
  mkdirSync(join(gogdlConfigPath, 'manifests'), { recursive: true })
  writeFileSync(join(installDir, 'game.exe'), 'x')
  // Present, so a refusal that wrongly let the uninstaller run would show in the counters.
  writeFileSync(join(installDir, 'unins000.exe'), 'x')
  writeFileSync(join(supportDir, 'setup.exe'), 'x')
  writeFileSync(manifest, '{}')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('GOGGame.uninstall guard (82-07)', () => {
  it('rejects when the check rejects: files, support folder and installed store untouched, unins000 not run', async () => {
    const { requestRustInvoke } = fakeSafetyRustInvoke({ rejectCheck: true })
    const h = build(requestRustInvoke)

    const res = await h.game.uninstall({ shouldRemovePrefix: false })

    expect(res).toEqual({
      stdout: '',
      stderr: 'rust-invoke-failed',
      refused: true
    })
    expect(existsSync(join(installDir, 'game.exe'))).toBe(true)
    expect(existsSync(join(supportDir, 'setup.exe'))).toBe(true)
    expect(existsSync(manifest)).toBe(true)
    expect(h.installedSet).toEqual([])
    expect(h.installedList).toHaveLength(1)
    expect(h.unins).toEqual({ wine: 0, spawn: 0, winePath: 0 })
    expect(notices(h)).toEqual([
      [
        'removalRefusedNotice',
        {
          kind: 'uninstall',
          outcome: 'refused',
          reason: 'rust-invoke-failed',
          title: 'Some Game',
          appName: ID,
          runner: 'gog'
        }
      ]
    ])
  })

  it('a refused uninstall can be retried with the same verdict (nothing was mutated)', async () => {
    const { requestRustInvoke } = fakeSafetyRustInvoke({ rejectCheck: true })
    const h = build(requestRustInvoke)

    const first = await h.game.uninstall({ shouldRemovePrefix: false })
    const second = await h.game.uninstall({ shouldRemovePrefix: false })

    expect(second).toEqual(first)
    expect(notices(h)).toHaveLength(2)
    expect(h.installedSet).toEqual([])
  })

  it("refuses a folder that holds another store's game, naming it", async () => {
    const inner = fakeSafetyRustInvoke({
      checkVerdict: 'no',
      reason: 'nested-known-install'
    }).requestRustInvoke
    const requestRustInvoke: RequestRustInvoke = async (channel, args) => {
      const reply = (await inner(channel, args)) as {
        items: Record<string, unknown>[]
      }
      return {
        ...reply,
        items: reply.items.map((i) => ({ ...i, otherKey: 'legendary:epic1' }))
      }
    }
    const h = build(requestRustInvoke, {
      runner: 'legendary',
      appName: 'epic1',
      installPath: join(installDir, 'epic')
    })

    const res = await h.game.uninstall({ shouldRemovePrefix: false })

    expect(res.refused).toBe(true)
    expect(existsSync(join(installDir, 'game.exe'))).toBe(true)
    expect(notices(h)[0]?.[1]).toMatchObject({
      reason: 'nested-known-install',
      otherTitle: 'Other Game'
    })
  })

  it('sends the install and support folders in one request, support under its trust root', async () => {
    const { requestRustInvoke, calls } = fakeSafetyRustInvoke({
      rejectCheck: true
    })
    const h = build(requestRustInvoke)

    await h.game.uninstall({ shouldRemovePrefix: false })

    const req = calls[0]?.args[0] as {
      targets: { id: string; path: string; kind: string; trustRoot?: string }[]
      selfKey: string
    }
    expect(req.selfKey).toBe(`gog:${ID}`)
    expect(req.targets).toEqual([
      { id: 'install', path: installDir, kind: 'game-install' },
      {
        id: 'support',
        path: supportDir,
        kind: 'game-support',
        trustRoot: gogSupportPath
      }
    ])
  })

  it('a yes verdict removes both folders and the manifest, then writes the installed store', async () => {
    const { requestRustInvoke } = fakeSafetyRustInvoke({ base: shortcutsReply })
    const h = build(requestRustInvoke)

    const res = await h.game.uninstall({ shouldRemovePrefix: false })

    expect(res).toEqual({ stdout: '', stderr: '' })
    expect(existsSync(installDir)).toBe(false)
    expect(existsSync(supportDir)).toBe(false)
    expect(existsSync(manifest)).toBe(false)
    expect(h.installedSet).toEqual([[]])
    expect(notices(h)).toEqual([])
  })

  // 261120-uzn: the Windows branch elevates once, with the full Galaxy switch set, and the path
  // (it holds a space) reaches PowerShell as a literal.
  const winIt = process.platform === 'win32' ? it : it.skip
  winIt(
    'a yes verdict runs unins000.exe once, elevated, with the full switch set (261120-uzn)',
    async () => {
      const { requestRustInvoke } = fakeSafetyRustInvoke({
        base: shortcutsReply
      })
      const h = build(requestRustInvoke)

      await h.game.uninstall({ shouldRemovePrefix: false })

      const step = gogUninstallStep(
        join(installDir, 'unins000.exe'),
        ID,
        installDir
      )
      expect(h.spawnCalls).toEqual([
        {
          command: 'powershell',
          args: elevatedStartProcessArgs(step),
          options: { windowsHide: true }
        }
      ])
      const statement = h.spawnCalls[0]?.args[3] as string
      for (const item of [
        "'/KEEPSAVES'",
        "'/galaxyclient'",
        `'/ProductId=${ID}'`
      ]) {
        expect(statement).toContain(item)
      }
    }
  )

  it('an absent gog-support folder does not block the uninstall (CR-01)', async () => {
    rmSync(gogSupportPath, { recursive: true, force: true })
    const { requestRustInvoke, calls } = fakeSafetyRustInvoke({
      base: shortcutsReply
    })
    const h = build(requestRustInvoke)

    const res = await h.game.uninstall({ shouldRemovePrefix: false })

    expect(res).toEqual({ stdout: '', stderr: '' })
    expect(existsSync(installDir)).toBe(false)
    expect(existsSync(manifest)).toBe(false)
    expect(h.installedSet).toEqual([[]])
    expect(notices(h)).toEqual([])
    const req = calls[0]?.args[0] as {
      targets: { id: string; trustRoot?: string }[]
    }
    expect(req.targets.find((t) => t.id === 'support')?.trustRoot).toBe(
      gogSupportPath
    )
    expect(existsSync(gogSupportPath)).toBe(false)
  })

  it('a delete that rejects after the check reports failed and keeps the installed store', async () => {
    const { requestRustInvoke } = fakeSafetyRustInvoke({ rejectRemove: true })
    const h = build(requestRustInvoke)

    const res = await h.game.uninstall({ shouldRemovePrefix: false })

    expect(res).toEqual({
      stdout: '',
      stderr: 'rust-invoke-failed',
      failed: true
    })
    expect(h.installedSet).toEqual([])
    expect(notices(h)[0]?.[1]).toMatchObject({
      kind: 'uninstall',
      outcome: 'failed',
      reason: 'rust-invoke-failed'
    })
  })
})

describe('GOGGame.uninstall keeps save folders inside the install folder (261127-v8b)', () => {
  const savesDir = join(installDir, 'files', 'saves')
  const slot = join(savesDir, 'slot1.sav')
  const pak = join(installDir, 'files', 'data.pak')
  const wholeTreePair = () => [
    { id: 'install', path: installDir, kind: 'game-install' },
    {
      id: 'support',
      path: supportDir,
      kind: 'game-support',
      trustRoot: gogSupportPath
    }
  ]
  const removeCall = (calls: { channel: string; args: unknown[] }[]) => {
    const removes = calls.filter((c) => c.channel === RUST_SAFETY_REMOVE_TREE)
    return removes[removes.length - 1]?.args[0] as {
      targets: { id: string; path: string; kind: string; trustRoot?: string }[]
    }
  }
  const foldPath = (p: string) =>
    process.platform === 'win32' || process.platform === 'darwin'
      ? p.normalize('NFC').toLowerCase()
      : p
  const makeSave = () => {
    mkdirSync(savesDir, { recursive: true })
    writeFileSync(slot, 'save')
    writeFileSync(pak, 'pak')
  }

  it('keeps a stored save folder and deletes everything else, each target under the install trust root', async () => {
    makeSave()
    const { requestRustInvoke, calls } = fakeSafetyRustInvoke({
      base: shortcutsReply
    })
    const h = build(requestRustInvoke, undefined, {
      gogSaves: [{ name: 'saves', location: savesDir }]
    })

    const res = await h.game.uninstall({ shouldRemovePrefix: false })

    expect(res).toEqual({ stdout: '', stderr: '' })
    expect(existsSync(slot)).toBe(true)
    expect(existsSync(join(installDir, 'game.exe'))).toBe(false)
    expect(existsSync(join(installDir, 'unins000.exe'))).toBe(false)
    expect(existsSync(pak)).toBe(false)
    expect(existsSync(supportDir)).toBe(false)
    expect(existsSync(manifest)).toBe(false)
    expect(h.installedSet).toEqual([[]])
    expect(notices(h)).toEqual([])

    const req = removeCall(calls)
    const canonicalInstall = realpathSync.native(installDir)
    const canonicalSaves = foldPath(realpathSync.native(savesDir))
    const installTargets = req.targets.filter((t) => t.id !== 'support')
    expect(installTargets.length).toBeGreaterThan(0)
    for (const target of installTargets) {
      expect(target.kind).toBe('game-install')
      expect(target.trustRoot).toBe(canonicalInstall)
      const folded = foldPath(target.path)
      expect(folded === canonicalSaves).toBe(false)
      expect(canonicalSaves.startsWith(folded + sep)).toBe(false)
    }
    expect(req.targets[req.targets.length - 1]).toEqual(wholeTreePair()[1])
  })

  it('keeps a template-declared <?INSTALL?> save folder when no save location is stored', async () => {
    makeSave()
    const { requestRustInvoke } = fakeSafetyRustInvoke({ base: shortcutsReply })
    const h = build(requestRustInvoke, undefined, {
      gogSaveLocation: [{ name: 'saves', location: '<?INSTALL?>/files/saves' }]
    })

    const res = await h.game.uninstall({ shouldRemovePrefix: false })

    expect(res).toEqual({ stdout: '', stderr: '' })
    expect(existsSync(slot)).toBe(true)
    expect(existsSync(pak)).toBe(false)
    expect(existsSync(join(installDir, 'game.exe'))).toBe(false)
    expect(h.installedSet).toEqual([[]])
  })

  it('a save folder outside the install folder leaves the whole-tree request unchanged', async () => {
    const elsewhere = join(root, 'elsewhere', 'saves')
    mkdirSync(elsewhere, { recursive: true })
    writeFileSync(join(elsewhere, 'a.sav'), 'x')
    const { requestRustInvoke, calls } = fakeSafetyRustInvoke({
      base: shortcutsReply
    })
    const h = build(requestRustInvoke, undefined, {
      gogSaves: [{ name: 'saves', location: elsewhere }]
    })

    const res = await h.game.uninstall({ shouldRemovePrefix: false })

    expect(res).toEqual({ stdout: '', stderr: '' })
    expect(removeCall(calls).targets).toEqual(wholeTreePair())
    expect(existsSync(installDir)).toBe(false)
    expect(existsSync(join(elsewhere, 'a.sav'))).toBe(true)
  })

  it('a stored save path inside the install folder that does not exist leaves the whole-tree request unchanged', async () => {
    const { requestRustInvoke, calls } = fakeSafetyRustInvoke({
      base: shortcutsReply
    })
    const h = build(requestRustInvoke, undefined, {
      gogSaves: [{ name: 'saves', location: join(installDir, 'nope', 'saves') }]
    })

    const res = await h.game.uninstall({ shouldRemovePrefix: false })

    expect(res).toEqual({ stdout: '', stderr: '' })
    expect(removeCall(calls).targets).toEqual(wholeTreePair())
    expect(existsSync(installDir)).toBe(false)
  })

  it('a delete that rejects with a kept save reports failed and keeps the installed store', async () => {
    makeSave()
    const { requestRustInvoke } = fakeSafetyRustInvoke({ rejectRemove: true })
    const h = build(requestRustInvoke, undefined, {
      gogSaves: [{ name: 'saves', location: savesDir }]
    })

    const res = await h.game.uninstall({ shouldRemovePrefix: false })

    expect(res).toEqual({
      stdout: '',
      stderr: 'rust-invoke-failed',
      failed: true
    })
    expect(h.installedSet).toEqual([])
    expect(notices(h)[0]?.[1]).toMatchObject({
      kind: 'uninstall',
      outcome: 'failed'
    })
  })
})
