/**
 * Phase 100 (D-11): installActionGates and activeLongAction are pure, so they
 * are called directly with a full `is` object of false flags.
 */
import type { Runner } from 'common/types'
import type { GameContextType } from 'frontend/types'
import {
  activeLongAction,
  installActionGates,
  type InstallActionGateInput,
  type InstallActionId
} from '../installActionGates'

const makeIs = (
  overrides: Partial<GameContextType['is']> = {}
): GameContextType['is'] => ({
  installing: false,
  importing: false,
  installingWinetricksPackages: false,
  installingRedist: false,
  preparingDrm: false,
  downloadingEngine: false,
  startingSteam: false,
  launching: false,
  linux: false,
  linuxNative: false,
  mac: false,
  macNative: false,
  moving: false,
  native: false,
  notAvailable: false,
  notInstallable: false,
  notSupportedGame: false,
  playing: false,
  queued: false,
  reparing: false,
  sideloaded: false,
  settingUpBottle: false,
  syncing: false,
  uninstalling: false,
  updating: false,
  win: false,
  notPlayableOffline: false,
  ...overrides
})

const gates = (
  runner: Runner,
  input: Partial<Omit<InstallActionGateInput, 'runner' | 'is'>> & {
    is?: Partial<GameContextType['is']>
  } = {}
) => {
  const { is, ...rest } = input
  return installActionGates({
    runner,
    is: makeIs(is),
    isInstalled: true,
    isThirdPartyManaged: false,
    hasWinePrefix: true,
    hasChangelog: true,
    cloudSavesAvailable: true,
    ...rest
  })
}

const shown = (g: ReturnType<typeof gates>) =>
  (Object.keys(g) as InstallActionId[]).filter((id) => g[id].show)

describe('installActionGates', () => {
  it('legendary installed and idle: management actions show and are enabled', () => {
    const g = gates('legendary')
    for (const id of [
      'open',
      'move',
      'setFolder',
      'modify',
      'verify',
      'update',
      'uninstall'
    ] as const) {
      expect(g[id]).toEqual({ show: true, disabled: false })
    }
    expect(g.removeAllCopies.show).toBe(false)
    expect(g.locate.show).toBe(false)
  })

  it('steam installed: move, set folder, update and modify hide; verify, uninstall, remove-all show; no prefix', () => {
    const g = gates('steam')
    expect(g.move.show).toBe(false)
    expect(g.setFolder.show).toBe(false)
    expect(g.update.show).toBe(false)
    expect(g.modify.show).toBe(false)
    expect(g.verify.show).toBe(true)
    expect(g.uninstall.show).toBe(true)
    expect(g.removeAllCopies.show).toBe(true)
    expect(g.openPrefix.show).toBe(false)
  })

  it('sideload installed: verify, move, set folder and update hide; uninstall shows', () => {
    const g = gates('sideload')
    expect(g.verify.show).toBe(false)
    expect(g.move.show).toBe(false)
    expect(g.setFolder.show).toBe(false)
    expect(g.update.show).toBe(false)
    expect(g.uninstall.show).toBe(true)
  })

  it('third-party managed: open stays live; move, set folder, modify, verify and update hide', () => {
    const g = gates('legendary', { isThirdPartyManaged: true })
    expect(g.open).toEqual({ show: true, disabled: false })
    for (const id of [
      'move',
      'setFolder',
      'modify',
      'verify',
      'update'
    ] as const) {
      expect(g[id].show).toBe(false)
    }
  })

  it('Open shows for every installed game, as the old ⋮ Browse Files did (WR-02)', () => {
    expect(gates('legendary', { isThirdPartyManaged: true }).open.show).toBe(
      true
    )
    expect(gates('sideload').open.show).toBe(true)
  })

  it('not installed (gog): only locate shows among the installed-only actions', () => {
    const g = gates('gog', { isInstalled: false })
    expect(g.locate).toEqual({ show: true, disabled: false })
    for (const id of [
      'open',
      'move',
      'setFolder',
      'modify',
      'verify',
      'update',
      'openPrefix',
      'syncNow',
      'openSaves',
      'uninstall',
      'removeAllCopies'
    ] as const) {
      expect(g[id].show).toBe(false)
    }
  })

  it('locate is disabled with reason installing while installing or importing, queued while queued', () => {
    expect(
      gates('gog', { isInstalled: false, is: { installing: true } }).locate
    ).toEqual({ show: true, disabled: true, reason: 'installing' })
    expect(
      gates('gog', { isInstalled: false, is: { importing: true } }).locate
    ).toEqual({ show: true, disabled: true, reason: 'installing' })
    expect(
      gates('gog', { isInstalled: false, is: { queued: true } }).locate
    ).toEqual({ show: true, disabled: true, reason: 'queued' })
  })

  it('locate is hidden for Steam', () => {
    expect(gates('steam', { isInstalled: false }).locate.show).toBe(false)
  })

  it("D-11 example: during a move, verify, modify, set folder, uninstall and update are disabled with reason 'moving'; open, open prefix, open saves and what's new stay live", () => {
    const g = gates('legendary', { is: { moving: true } })
    for (const id of [
      'verify',
      'modify',
      'setFolder',
      'uninstall',
      'update'
    ] as const) {
      expect(g[id]).toEqual({ show: true, disabled: true, reason: 'moving' })
    }
    for (const id of ['open', 'openPrefix', 'openSaves', 'whatsNew'] as const) {
      expect(g[id]).toEqual({ show: true, disabled: false })
    }
  })

  it.each([
    ['reparing', 'verifying'],
    ['updating', 'updating'],
    ['installing', 'installing']
  ] as const)(
    'is.%s disables conflicting actions with reason %s',
    (flag, reason) => {
      const g = gates('legendary', { is: { [flag]: true } })
      expect(g.uninstall.reason).toBe(reason)
      expect(g.open.disabled).toBe(false)
    }
  )

  it("settingFolder input -> reason 'settingFolder'", () => {
    const g = gates('legendary', { settingFolder: true })
    expect(g.move).toEqual({
      show: true,
      disabled: true,
      reason: 'settingFolder'
    })
  })

  it('is.uninstalling outranks every other reason', () => {
    const g = gates('legendary', {
      is: {
        uninstalling: true,
        moving: true,
        reparing: true,
        updating: true,
        installing: true,
        syncing: true,
        launching: true,
        playing: true
      },
      settingFolder: true
    })
    expect(g.verify.reason).toBe('uninstalling')
    expect(g.move.reason).toBe('uninstalling')
    expect(g.uninstall.reason).toBe('uninstalling')
  })

  it('is.playing: Steam verify is disabled; Epic verify stays enabled; the rest disable with reason playing', () => {
    expect(gates('steam', { is: { playing: true } }).verify).toEqual({
      show: true,
      disabled: true,
      reason: 'playing'
    })
    const epic = gates('legendary', { is: { playing: true } })
    expect(epic.verify).toEqual({ show: true, disabled: false })
    for (const id of [
      'uninstall',
      'move',
      'setFolder',
      'modify',
      'update'
    ] as const) {
      expect(epic[id]).toEqual({
        show: true,
        disabled: true,
        reason: 'playing'
      })
    }
  })

  it('a hidden action is never reported disabled', () => {
    const g = gates('steam', { is: { moving: true } })
    expect(g.move).toEqual({ show: false, disabled: false })
    expect(shown(g)).not.toContain('move')
  })

  it("what's new needs a changelog and a store catalog", () => {
    expect(gates('legendary', { hasChangelog: false }).whatsNew.show).toBe(
      false
    )
    expect(gates('sideload').whatsNew.show).toBe(false)
    expect(gates('legendary').whatsNew.show).toBe(true)
  })

  it('cloud actions need installed and cloud saves', () => {
    const none = gates('legendary', { cloudSavesAvailable: false })
    expect(none.syncNow.show).toBe(false)
    expect(none.openSaves.show).toBe(false)
    expect(gates('legendary').syncNow.show).toBe(true)
  })
})

describe('activeLongAction', () => {
  it('is undefined when nothing runs', () => {
    expect(activeLongAction(makeIs(), true)).toBeUndefined()
  })

  it('ignores is.installing for a game that is not installed yet', () => {
    expect(
      activeLongAction(makeIs({ installing: true }), false)
    ).toBeUndefined()
  })

  it('priority: moving > verifying > updating > installing > settingFolder > syncing > launching > queued', () => {
    const is = makeIs({
      moving: true,
      reparing: true,
      updating: true,
      installing: true,
      syncing: true,
      launching: true,
      queued: true
    })
    expect(activeLongAction(is, true, true)).toBe('moving')
    is.moving = false
    expect(activeLongAction(is, true, true)).toBe('verifying')
    is.reparing = false
    expect(activeLongAction(is, true, true)).toBe('updating')
    is.updating = false
    expect(activeLongAction(is, true, true)).toBe('installing')
    is.installing = false
    expect(activeLongAction(is, true, true)).toBe('settingFolder')
    expect(activeLongAction(is, true)).toBe('syncing')
    is.syncing = false
    expect(activeLongAction(is, true)).toBe('launching')
    is.launching = false
    expect(activeLongAction(is, true)).toBe('queued')
  })
})
