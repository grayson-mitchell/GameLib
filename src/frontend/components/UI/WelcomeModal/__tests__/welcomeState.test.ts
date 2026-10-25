import { appManagementView, isFirstRun } from '../welcomeState'

describe('isFirstRun', () => {
  it('is true when nothing is stored', () => {
    expect(
      isFirstRun({
        welcomeSeen: null,
        lastVersion: undefined,
        lastChangelog: null
      })
    ).toBe(true)
  })

  it("treats last_changelog stored as the string 'null' as absent", () => {
    expect(
      isFirstRun({
        welcomeSeen: null,
        lastVersion: undefined,
        lastChangelog: 'null'
      })
    ).toBe(true)
  })

  it('is false for an upgrade (last_version present)', () => {
    expect(
      isFirstRun({
        welcomeSeen: null,
        lastVersion: '0.9.0',
        lastChangelog: null
      })
    ).toBe(false)
  })

  it('is false when a changelog was ever dismissed', () => {
    expect(
      isFirstRun({
        welcomeSeen: null,
        lastVersion: undefined,
        lastChangelog: '"0.9.0"'
      })
    ).toBe(false)
  })

  it('is false once the welcome marker exists', () => {
    expect(
      isFirstRun({
        welcomeSeen: '1',
        lastVersion: undefined,
        lastChangelog: null
      })
    ).toBe(false)
  })
})

describe('appManagementView', () => {
  it('granted -> relaunch only', () => {
    expect(appManagementView('granted')).toEqual({
      visible: true,
      statusKey: 'welcome.appManagement.status.granted',
      showOpenSettings: false,
      showRelaunch: true
    })
  })

  it.each(['denied', 'unknown'] as const)('%s -> open settings', (s) => {
    const v = appManagementView(s)
    expect(v.visible).toBe(true)
    expect(v.showOpenSettings).toBe(true)
    expect(v.showRelaunch).toBe(false)
    expect(v.statusKey).toBe(`welcome.appManagement.status.${s}`)
  })

  it('not-needed -> step hidden', () => {
    const v = appManagementView('not-needed')
    expect(v.visible).toBe(false)
    expect(v.showOpenSettings).toBe(false)
    expect(v.showRelaunch).toBe(false)
  })
})
