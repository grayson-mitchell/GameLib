/**
 * Direct-call behavior tests for the D-01/D-03/D-08 extracted game-details
 * modules (Phase 34.2 Plan 02, REQ-34.2-01/REQ-34.2-03/REQ-34.2-08/
 * REQ-34.2-09/REQ-34.2-14). Every exported function is invoked DIRECTLY --
 * never through `backend/main`, never through IPC/RPC -- proving the same
 * observable behavior the Electron `main.ts` handlers had before extraction.
 * A by-construction source gate also proves the modules stay Electron-free
 * (D-09), mirroring `appshellModules.test.ts`'s own gate.
 */

// ── i18next -- DEFEAT Jest's project-wide automatic manual mock. This is the
// load-bearing line of this whole suite: `src/backend/__mocks__/i18next.ts`
// sits adjacent to this jest project's `roots` (`src/backend`), so Jest
// substitutes it for the REAL npm `i18next` package in EVERY backend test
// file automatically -- with no `jest.mock('i18next', ...)` call required
// anywhere. This is the exact quiet-mock trap Phase 34.1's CR-01 finding
// warned about (34.2-01's `bootstrapWirings.test.ts` header). `repair`'s
// notify calls and `getLaunchOptions`'s synthesized-default option both go
// through `i18next.t(...)`; asserting against a FAKE `t()` (which just
// echoes the key) would prove nothing about what the uninitialized real
// singleton actually returns, so this file asserts against whatever the
// real, unmocked, uninitialized `i18next.t()` yields instead of hardcoding
// a translated string -- translator-independent, and not a second CR-01
// blind spot. `jest.unmock` -- not `jest.mock` -- restores default (real)
// module resolution; it does not substitute a replacement. ────────────────
jest.unmock('i18next')

import { readFileSync as readSourceFile } from 'fs'
import { join } from 'path'
import i18next from 'i18next'

// ── backend/storeManagers mock -- six fully-mocked managers so no real
// store manager (and none of their electron-store/network dependencies) is
// loaded, mirroring crossover_index/__tests__/ratingMap.test.ts's own
// approach. ──────────────────────────────────────────────────────────────
function makeGameDouble(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    isGameAvailable: jest.fn(),
    getGameInfo: jest.fn(),
    getExtraInfo: jest.fn(),
    getSettings: jest.fn(),
    stop: jest.fn(),
    repair: jest.fn(),
    ...overrides
  }
}

function makeManagerDouble() {
  return {
    getGame: jest.fn(),
    hasGame: jest.fn(),
    refresh: jest.fn(),
    getListOfGames: jest.fn(),
    changeGameInstallPath: jest.fn(),
    getLaunchOptions: jest.fn(),
    changeVersionPinnedStatus: jest.fn(),
    addNewApp: jest.fn(),
    getCyberpunkMods: jest.fn(),
    setCyberpunkModConfig: jest.fn(),
    getGameOverride: jest.fn(),
    getGameSdl: jest.fn()
  }
}

const managerMocks = {
  steam: makeManagerDouble(),
  legendary: makeManagerDouble(),
  gog: makeManagerDouble(),
  nile: makeManagerDouble(),
  zoom: makeManagerDouble(),
  sideload: makeManagerDouble()
}

jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: managerMocks
}))

// ── backend/game_overrides mock -- observes attachOverrides/setGameOverrides/
// getAllGameOverrides calls without touching the real electron-store-backed
// implementation. ────────────────────────────────────────────────────────
const attachOverridesMock = jest.fn()
const setGameOverridesMock = jest.fn()
const getAllGameOverridesMock = jest.fn()
jest.mock('backend/game_overrides', () => ({
  attachOverrides: (...args: [unknown]) => attachOverridesMock(...args),
  setGameOverrides: (...args: [unknown, unknown]) =>
    setGameOverridesMock(...args),
  getAllGameOverrides: (...args: []) => getAllGameOverridesMock(...args)
}))

// ── backend/dialog/dialog mock ──────────────────────────────────────────
const notifyMock = jest.fn()
jest.mock('backend/dialog/dialog', () => ({
  notify: (...args: [unknown]) => notifyMock(...args)
}))

// ── backend/utils mock (sendGameStatusUpdate only -- this module has many
// other exports main.ts still needs, but dispatch.ts only imports this
// one). ──────────────────────────────────────────────────────────────────
const sendGameStatusUpdateMock = jest.fn()
jest.mock('backend/utils', () => ({
  sendGameStatusUpdate: (...args: [unknown]) =>
    sendGameStatusUpdateMock(...args)
}))

// ── backend/online_monitor mock ─────────────────────────────────────────
const isOnlineMock = jest.fn()
jest.mock('backend/online_monitor', () => ({
  isOnline: (...args: []) => isOnlineMock(...args)
}))

// ── backend/storeManagers/legendary/user mock ───────────────────────────
const getUserInfoMock = jest.fn()
jest.mock('backend/storeManagers/legendary/user', () => ({
  LegendaryUser: {
    getUserInfo: (...args: []) => getUserInfoMock(...args)
  }
}))

// ── backend/utils/aborthandler/aborthandler mock ────────────────────────
const callAbortControllerMock = jest.fn()
jest.mock('backend/utils/aborthandler/aborthandler', () => ({
  callAbortController: (...args: [string]) => callAbortControllerMock(...args)
}))

// ── backend/logger mock -- heroicLogWriter is unset until bootstrap.ts's
// init() runs (this repo's own documented gotcha); mocked so logInfo/
// logWarning/logError are no-ops rather than throwing on the unset writer.
// Deliberately NOT mocking i18next here (see the top-of-file comment). ────
const logInfoMock = jest.fn()
const logErrorMock = jest.fn()
const logWarningMock = jest.fn()
jest.mock('backend/logger', () => ({
  logInfo: (...args: unknown[]) => logInfoMock(...args),
  logError: (...args: unknown[]) => logErrorMock(...args),
  logWarning: (...args: unknown[]) => logWarningMock(...args),
  LogPrefix: { Backend: 'Backend' }
}))

import {
  isGameAvailable,
  getGameInfo,
  getExtraInfo,
  getGameSettings,
  kill,
  repair,
  changeInstallPath,
  getLaunchOptions,
  changeGameVersionPinnedStatus,
  getGameOverride,
  getGameSdl,
  readConfig,
  addNewApp,
  getAvailableCyberpunkMods,
  setCyberpunkModConfig
} from '../dispatch'
import {
  setGameMetadataOverride,
  setMetadataChangedNotifier
} from '../overrides'

const OTHER_RUNNERS_FOR_LEGENDARY = [
  'steam',
  'gog',
  'nile',
  'zoom',
  'sideload'
] as const
const OTHER_RUNNERS_FOR_GOG = [
  'steam',
  'legendary',
  'nile',
  'zoom',
  'sideload'
] as const
const OTHER_RUNNERS_FOR_SIDELOAD = [
  'steam',
  'legendary',
  'gog',
  'nile',
  'zoom'
] as const

// IN-04(b) (gap cycle 1, closed 2026-08-23): `gamepage.json` used to be read
// and `JSON.parse`d TWICE for the same value -- once in the `beforeAll` that
// seeds the real i18next singleton, once inside the `getLaunchOptions` test
// that recovers the expected string. Two independent readers of one file can
// drift (a path typo in one of them would make the test compare i18next's
// output against a DIFFERENT file's contents and still look green); one
// module-scope constant cannot. Read at module scope, before any mock can
// intercept `fs`, which is also where the `readSourceFile` alias is real.
const GAMEPAGE_RESOURCES = JSON.parse(
  readSourceFile(
    join(__dirname, '../../../../public/locales/en/gamepage.json'),
    'utf-8'
  )
)

describe('backend/gamedetails/dispatch.ts (REQ-34.2-01/REQ-34.2-09)', () => {
  // WR-04 (Phase 34.2 Plan 12): initialize the REAL i18next singleton once
  // for this suite, reading resources straight off disk rather than a
  // hand-written fixture. Reading the real locale file is deliberate: the
  // getLaunchOptions assertion below breaks if `launch.default` is ever
  // renamed or deleted, which a hardcoded fixture would silently hide.
  // Guarded by `isInitialized` so this stays safe if another suite in the
  // same jest worker already initialized the singleton (mirrors
  // `bootstrapWirings.test.ts`'s own real-i18next precedent).
  beforeAll(async () => {
    if (!i18next.isInitialized) {
      await i18next.init({
        lng: 'en',
        fallbackLng: 'en',
        ns: ['gamepage'],
        defaultNS: 'gamepage',
        resources: { en: { gamepage: GAMEPAGE_RESOURCES } },
        returnEmptyString: false,
        returnNull: false
      })
    }
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ── isGameAvailable ─────────────────────────────────────────────────
  it('REQ-34.2-01 isGameAvailable forwards to the runner-pinned getGame().isGameAvailable()', async () => {
    const gameDouble = makeGameDouble({
      isGameAvailable: jest.fn().mockResolvedValue(true)
    })
    managerMocks.steam.getGame.mockReturnValue(gameDouble)

    const result = await isGameAvailable({ appName: '440', runner: 'steam' })

    expect(result).toBe(true)
    expect(managerMocks.steam.getGame).toHaveBeenCalledWith('440')
  })

  // ── getGameInfo ─────────────────────────────────────────────────────
  it('REQ-34.2-01 getGameInfo returns null for a legendary appName when hasGame is false, WITHOUT calling getGame', async () => {
    managerMocks.legendary.hasGame.mockReturnValue(false)

    const result = await getGameInfo('some-app', 'legendary')

    expect(result).toBeNull()
    expect(managerMocks.legendary.getGame).not.toHaveBeenCalled()
  })

  it('REQ-34.2-01 getGameInfo returns null when getGameInfo() yields {} (the empty-object case)', async () => {
    const gameDouble = makeGameDouble({
      getGameInfo: jest.fn().mockReturnValue({})
    })
    managerMocks.steam.getGame.mockReturnValue(gameDouble)

    const result = await getGameInfo('440', 'steam')

    expect(result).toBeNull()
    expect(attachOverridesMock).not.toHaveBeenCalled()
  })

  it('REQ-34.2-01 getGameInfo returns the result of attachOverrides(...), not the raw info object', async () => {
    const rawInfo = { app_name: '440', title: 'Portal 2' }
    const overriddenInfo = { ...rawInfo, overrides: { title: 'Custom' } }
    const gameDouble = makeGameDouble({
      getGameInfo: jest.fn().mockReturnValue(rawInfo)
    })
    managerMocks.steam.getGame.mockReturnValue(gameDouble)
    attachOverridesMock.mockReturnValue(overriddenInfo)

    const result = await getGameInfo('440', 'steam')

    expect(attachOverridesMock).toHaveBeenCalledWith(rawInfo)
    expect(result).toBe(overriddenInfo)
  })

  // ── getExtraInfo ────────────────────────────────────────────────────
  it('REQ-34.2-01 getExtraInfo applies the same legendary fastpath', async () => {
    managerMocks.legendary.hasGame.mockReturnValue(false)

    const result = await getExtraInfo('some-app', 'legendary')

    expect(result).toBeNull()
    expect(managerMocks.legendary.getGame).not.toHaveBeenCalled()
  })

  // ── getGameSettings ─────────────────────────────────────────────────
  it('REQ-34.2-01 getGameSettings returns null and logs when the underlying getSettings() rejects', async () => {
    const error = new Error('boom')
    const gameDouble = makeGameDouble({
      getSettings: jest.fn().mockRejectedValue(error)
    })
    managerMocks.steam.getGame.mockReturnValue(gameDouble)

    const result = await getGameSettings('440', 'steam')

    expect(result).toBeNull()
    expect(logErrorMock).toHaveBeenCalledWith(error, 'Backend')
  })

  // ── kill ────────────────────────────────────────────────────────────
  it("REQ-34.2-01 kill calls callAbortController(appName) BEFORE getGame(appName).stop() and returns stop()'s result", async () => {
    const order: string[] = []
    callAbortControllerMock.mockImplementation(() => {
      order.push('abort')
    })
    const stopResult = Symbol('stopped')
    const gameDouble = makeGameDouble({
      stop: jest.fn().mockImplementation(() => {
        order.push('stop')
        return Promise.resolve(stopResult)
      })
    })
    managerMocks.steam.getGame.mockReturnValue(gameDouble)

    const result = await kill('440', 'steam')

    expect(order).toEqual(['abort', 'stop'])
    expect(result).toBe(stopResult)
  })

  // ── repair ──────────────────────────────────────────────────────────
  it('REQ-34.2-01 repair returns early with a logWarning and fires NO sendGameStatusUpdate when isOnline() is false', async () => {
    isOnlineMock.mockReturnValue(false)

    await repair('440', 'steam')

    expect(logWarningMock).toHaveBeenCalled()
    expect(sendGameStatusUpdateMock).not.toHaveBeenCalled()
    expect(managerMocks.steam.getGame).not.toHaveBeenCalled()
  })

  it('REQ-34.2-01 repair on the happy path fires sendGameStatusUpdate with status:"repairing" then "done", and calls notify exactly once', async () => {
    isOnlineMock.mockReturnValue(true)
    const gameDouble = makeGameDouble({
      getGameInfo: jest.fn().mockReturnValue({ title: 'Portal 2' }),
      repair: jest.fn().mockResolvedValue(undefined)
    })
    managerMocks.steam.getGame.mockReturnValue(gameDouble)

    await repair('440', 'steam')

    expect(sendGameStatusUpdateMock).toHaveBeenNthCalledWith(1, {
      appName: '440',
      runner: 'steam',
      status: 'repairing'
    })
    expect(sendGameStatusUpdateMock).toHaveBeenNthCalledWith(2, {
      appName: '440',
      runner: 'steam',
      status: 'done'
    })
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Portal 2' })
    )
  })

  // IN-02 (34.2-REVIEW.md round 1). This test USED to assert the opposite --
  // "calls notify TWICE (error then finished) and still ends with
  // status:'done'" -- pinning the upstream fall-through bug as the contract.
  // The code is fixed (dispatch.ts:178-215); this now pins the fix.
  //
  // Body text CANNOT distinguish the two notifications here: this suite runs
  // real, uninitialized i18next (`jest.unmock('i18next')` at the top of the
  // file), whose `t()` returns `undefined` for BOTH keys -- with or without a
  // defaultValue argument. That is why every notify assertion in this file
  // matches on `title` alone. The success path is therefore identified by its
  // OTHER side effect, `logInfo('Finished repairing')`, which is the only
  // logInfo call `repair()` makes.
  //
  // RED-PROOF: against the pre-fix body this fails twice over -- notify is
  // called 2x, and logInfo fires. Reverting either half of the fix (the
  // `repairFailed` flag or the `if (!repairFailed)` guard) re-reds it.
  it('REQ-34.2-01 repair on a rejecting repair() notifies ONCE (the error), does NOT log "Finished repairing", and still ends with status:"done"', async () => {
    isOnlineMock.mockReturnValue(true)
    const gameDouble = makeGameDouble({
      getGameInfo: jest.fn().mockReturnValue({ title: 'Portal 2' }),
      repair: jest.fn().mockRejectedValue(new Error('repair failed'))
    })
    managerMocks.steam.getGame.mockReturnValue(gameDouble)

    await repair('440', 'steam')

    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Portal 2' })
    )
    expect(logErrorMock).toHaveBeenCalled()
    expect(logInfoMock).not.toHaveBeenCalledWith(
      'Finished repairing',
      expect.anything()
    )

    // Unconditional even on failure: this is what clears the renderer's
    // `repairing` spinner. Dropping it would leave the card stuck.
    expect(sendGameStatusUpdateMock).toHaveBeenLastCalledWith({
      appName: '440',
      runner: 'steam',
      status: 'done'
    })
  })

  // ── changeInstallPath ───────────────────────────────────────────────
  it('REQ-34.2-01 changeInstallPath forwards {appName, path} to changeGameInstallPath and logs', async () => {
    managerMocks.steam.changeGameInstallPath.mockResolvedValue(undefined)

    await changeInstallPath({
      appName: '440',
      path: '/new/path',
      runner: 'steam'
    })

    expect(managerMocks.steam.changeGameInstallPath).toHaveBeenCalledWith(
      '440',
      '/new/path'
    )
    expect(logInfoMock).toHaveBeenCalled()
  })

  // ── getLaunchOptions ────────────────────────────────────────────────
  // WR-04 (Phase 34.2 Plan 12): nothing in this assertion is derived from the
  // same i18next.t() call the code under test makes. Previously,
  // `expectedDefaultName` was computed by calling the SAME uninitialized
  // `i18next.t('launch.default', 'Default', { ns: 'gamepage' })` the code
  // under test calls -- on i18next 22.5.1 the uninitialized singleton
  // returns `undefined` (it does not throw, and the inline English default
  // does not rescue it), and `toEqual` treats `undefined` object properties
  // as absent, so the assertion passed even if `result[0]` had no `name` at
  // all. This rewrite compares against the on-disk locale file's own value
  // (read via the real, now-initialized i18next singleton from the
  // `beforeAll` above) and explicitly rejects both prior failure modes: the
  // uninitialized-real-singleton `undefined`, and the project-wide
  // `__mocks__/i18next.ts` automock's `t: (key) => key` echo.
  it('REQ-34.2-01 getLaunchOptions prepends a synthesized Default option when options exist but none matches the default predicate', async () => {
    managerMocks.steam.getLaunchOptions.mockResolvedValue([
      { name: 'Custom', parameters: '-x', type: 'basic' }
    ])
    const realTranslatedDefault = GAMEPAGE_RESOURCES.launch.default

    // WR-06 (Phase 34.2 gap cycle 1): comparing against `realTranslatedDefault`
    // alone STILL cannot distinguish "i18next loaded its resources" from "the
    // inline English default rescued us". Measured: `gamepage.json`'s
    // `launch.default` is "Default", byte-identical to the inline default in
    // `i18next.t('launch.default', 'Default', { ns: 'gamepage' })`, so both
    // paths render the same string and the assertion below passes either way.
    // This is the same shape as G-34.2-UAT-01 (a UAT step that could not fail
    // because `notify.error.reparing`'s locale value equals its own hardcoded
    // default) -- the third instance of it in this phase.
    //
    // The discriminating property, asserted directly: with a sentinel default
    // that appears NOWHERE in the locale file, a live i18next returns the
    // locale value and a dead one returns the sentinel. Nothing about this
    // depends on the two strings happening to differ.
    expect(
      i18next.t('launch.default', 'WR-06-SENTINEL-NOT-A-TRANSLATION', {
        ns: 'gamepage'
      })
    ).toBe(realTranslatedDefault)

    const result = await getLaunchOptions('440', 'steam')

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ parameters: '', type: 'basic' })
    // `LaunchOption` is a union (basic | altExe | dlc) and only the 'basic'
    // variant carries `name` -- the toMatchObject assertion above already
    // proves `type: 'basic'` at runtime, so this cast merely satisfies the
    // type checker for the narrower assertions below.
    const defaultOption = result[0] as { name: string }
    // Assertion 3: a real translated string, compared against the file that
    // defines it.
    expect(defaultOption.name).toBe(realTranslatedDefault)
    // Assertion 4 (the regression assertion): fails against the
    // uninitialized real singleton (which yields `undefined`) AND against
    // the automock (whose `t: (key) => key` yields the literal key) -- so
    // neither prior blind spot can silently return.
    expect(defaultOption.name).not.toBe('launch.default')
    expect(defaultOption.name).not.toBeUndefined()
  })

  it('REQ-34.2-01 getLaunchOptions does NOT prepend when a default option already exists', async () => {
    const existingDefault = { name: 'Default', parameters: '', type: 'basic' }
    managerMocks.steam.getLaunchOptions.mockResolvedValue([existingDefault])

    const result = await getLaunchOptions('440', 'steam')

    expect(result).toEqual([existingDefault])
  })

  it('REQ-34.2-01 getLaunchOptions returns [] untouched when the manager returns []', async () => {
    managerMocks.steam.getLaunchOptions.mockResolvedValue([])

    const result = await getLaunchOptions('440', 'steam')

    expect(result).toEqual([])
  })

  // ── changeGameVersionPinnedStatus ───────────────────────────────────
  it('REQ-34.2-01 changeGameVersionPinnedStatus forwards to the runner-pinned changeVersionPinnedStatus', () => {
    changeGameVersionPinnedStatus('440', 'steam', true)

    expect(managerMocks.steam.changeVersionPinnedStatus).toHaveBeenCalledWith(
      '440',
      true
    )
  })

  // ── readConfig ──────────────────────────────────────────────────────
  it("REQ-34.2-09 readConfig('library') awaits legendary.refresh() then returns getListOfGames()", async () => {
    const games = [{ app_name: 'a' }, { app_name: 'b' }]
    managerMocks.legendary.refresh.mockResolvedValue(undefined)
    managerMocks.legendary.getListOfGames.mockReturnValue(games)

    const result = await readConfig('library')

    expect(managerMocks.legendary.refresh).toHaveBeenCalledTimes(1)
    expect(result).toBe(games)
  })

  it("REQ-34.2-09 readConfig('user') returns LegendaryUser.getUserInfo()'s displayName", async () => {
    getUserInfoMock.mockReturnValue({ displayName: 'Alice' })

    const result = await readConfig('user')

    expect(result).toBe('Alice')
  })

  it("REQ-34.2-09 readConfig('user') returns '' when getUserInfo() is undefined", async () => {
    getUserInfoMock.mockReturnValue(undefined)

    const result = await readConfig('user')

    expect(result).toBe('')
  })

  // ── pinned-manager dispatch: getGameOverride/getGameSdl -> legendary,
  // getAvailableCyberpunkMods/setCyberpunkModConfig -> gog, addNewApp ->
  // sideload -- and to no other runner. ───────────────────────────────
  it('REQ-34.2-09 getGameOverride dispatches to legendary and to no other runner', async () => {
    managerMocks.legendary.getGameOverride.mockResolvedValue({})

    await getGameOverride()

    expect(managerMocks.legendary.getGameOverride).toHaveBeenCalledTimes(1)
    for (const runner of OTHER_RUNNERS_FOR_LEGENDARY) {
      expect(managerMocks[runner].getGameOverride).not.toHaveBeenCalled()
    }
  })

  it('REQ-34.2-09 getGameSdl dispatches to legendary and to no other runner', async () => {
    managerMocks.legendary.getGameSdl.mockResolvedValue([])

    await getGameSdl('440')

    expect(managerMocks.legendary.getGameSdl).toHaveBeenCalledWith('440')
    for (const runner of OTHER_RUNNERS_FOR_LEGENDARY) {
      expect(managerMocks[runner].getGameSdl).not.toHaveBeenCalled()
    }
  })

  it('REQ-34.2-09 getAvailableCyberpunkMods dispatches to gog and to no other runner', async () => {
    managerMocks.gog.getCyberpunkMods.mockResolvedValue([])

    await getAvailableCyberpunkMods()

    expect(managerMocks.gog.getCyberpunkMods).toHaveBeenCalledTimes(1)
    for (const runner of OTHER_RUNNERS_FOR_GOG) {
      expect(managerMocks[runner].getCyberpunkMods).not.toHaveBeenCalled()
    }
  })

  it('REQ-34.2-09 setCyberpunkModConfig dispatches to gog and to no other runner', async () => {
    managerMocks.gog.setCyberpunkModConfig.mockResolvedValue(undefined)
    const props = { enabled: true, modsToLoad: ['mod-a'] }

    await setCyberpunkModConfig(props)

    expect(managerMocks.gog.setCyberpunkModConfig).toHaveBeenCalledWith(props)
    for (const runner of OTHER_RUNNERS_FOR_GOG) {
      expect(managerMocks[runner].setCyberpunkModConfig).not.toHaveBeenCalled()
    }
  })

  it('REQ-34.2-09 addNewApp dispatches to sideload and to no other runner', () => {
    const args = { app_name: 'my-sideload-app' }

    addNewApp(args as never)

    expect(managerMocks.sideload.addNewApp).toHaveBeenCalledWith(args)
    for (const runner of OTHER_RUNNERS_FOR_SIDELOAD) {
      expect(managerMocks[runner].addNewApp).not.toHaveBeenCalled()
    }
  })
})

describe('backend/gamedetails/overrides.ts (REQ-34.2-08)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // This test MUST run before any test below installs a notifier via
  // setMetadataChangedNotifier -- the notifier is a module-scope singleton
  // (not a jest mock reset by resetMocks), so this is the only point in the
  // suite where overrides.ts's real, untouched, fail-safe default (a no-op
  // that logWarning()s once) is genuinely exercised rather than a
  // test-installed replacement.
  it('REQ-34.2-08 setGameMetadataOverride still performs the store write and does not throw when NO notifier has ever been installed', () => {
    getAllGameOverridesMock.mockReturnValue({})

    expect(() =>
      setGameMetadataOverride({ appName: '440', title: 'Custom Title' })
    ).not.toThrow()
    expect(setGameOverridesMock).toHaveBeenCalledWith('440', {
      title: 'Custom Title',
      art_cover: undefined,
      art_square: undefined
    })
  })

  it("REQ-34.2-08 setGameMetadataOverride calls setGameOverrides(appName, {title, art_cover, art_square}) and invokes the installed notifier with getAllGameOverrides()'s value", () => {
    const overridesSnapshot = { '440': { title: 'Custom Title' } }
    getAllGameOverridesMock.mockReturnValue(overridesSnapshot)
    const notifierMock = jest.fn()
    setMetadataChangedNotifier(notifierMock)

    setGameMetadataOverride({
      appName: '440',
      title: 'Custom Title',
      art_cover: 'cover.png',
      art_square: 'square.png'
    })

    expect(setGameOverridesMock).toHaveBeenCalledWith('440', {
      title: 'Custom Title',
      art_cover: 'cover.png',
      art_square: 'square.png'
    })
    expect(notifierMock).toHaveBeenCalledWith(overridesSnapshot)
  })
})

// WR-10 (34.2-REVIEW.md round 1): the `backend/gamedetails source gate`
// describe block that used to live here was DELETED, not lost. It scanned the
// same directory for the same six patterns (electron import, electron
// require, backend/ipc, ../ipc, ../launcher, main_window) as
// `sidecar/__tests__/gameDetailsImportGate.test.ts` Gate 3, which keeps it
// alongside the rest of that file's gates and their sha256 pins. Two
// byte-equivalent copies of one gate cost maintenance without adding cover:
// a tightening applied to one silently skips the other.
//
// If you are here because you want to tighten the gamedetails import rules,
// edit `gameDetailsImportGate.test.ts` Gate 3 -- it is now the only copy.
