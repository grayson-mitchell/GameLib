import 'frontend/testUtils/tauriWindow'
import useAuthState from 'frontend/state/authState'
import { resetAllStores } from 'frontend/state/storeKit'
import { useSteamRequestNotice } from 'frontend/state/SteamRequestNotice'
import { registerNoticePreview } from '../noticePreview'
import type { NoticePreviewApi } from '../noticePreview'

type Target = { __gamelibNotices?: NoticePreviewApi }

const register = (): NoticePreviewApi => {
  const target: Target = {}
  registerNoticePreview(target)
  return target.__gamelibNotices as NoticePreviewApi
}

afterEach(() => {
  resetAllStores()
  useSteamRequestNotice.setState({ latest: null })
})

describe('noticePreview', () => {
  it('has no top-level side effects: nothing is defined until register is called', () => {
    const target: Target = {}
    expect(target.__gamelibNotices).toBeUndefined()
    expect((globalThis as unknown as Target).__gamelibNotices).toBeUndefined()
    registerNoticePreview(target)
    expect(Object.keys(target.__gamelibNotices ?? {}).sort()).toEqual([
      'both',
      'clear',
      'humble',
      'steam'
    ])
  })

  it('steam() routes a valid payload through the real validator', () => {
    const api = register()
    expect(api.steam()).toBe(true)
    const latest = useSteamRequestNotice.getState().latest
    expect(latest?.appId).toBe('220')
    expect(latest?.kind).toBe('install-not-started')
    expect(latest?.title.length).toBeGreaterThan(0)
  })

  it('produces strictly increasing small seq, including after clear()', () => {
    const api = register()
    expect(api.steam()).toBe(true)
    const a = useSteamRequestNotice.getState().latest?.seq as number
    expect(api.steam()).toBe(true)
    const b = useSteamRequestNotice.getState().latest?.seq as number
    expect(b).toBeGreaterThan(a)
    expect(b).toBeLessThan(1_000_000)
    api.clear()
    expect(api.steam()).toBe(true)
    expect(useSteamRequestNotice.getState().latest).not.toBeNull()
  })

  it('supplies a code for uninstall-steam-error and rejects an out-of-set kind', () => {
    const api = register()
    expect(api.steam('uninstall-steam-error')).toBe(true)
    const before = useSteamRequestNotice.getState().latest
    expect(before?.code).toBe(2)
    expect(api.steam('bogus' as never)).toBe(false)
    expect(useSteamRequestNotice.getState().latest).toBe(before)
  })

  it('humble() sets expired and leaves the rest of the slice alone', () => {
    const api = register()
    const before = useAuthState.getState().humble
    api.humble()
    const after = useAuthState.getState().humble
    expect(after.expired).toBe(true)
    expect({ ...after, expired: before.expired }).toEqual(before)
  })

  it('both() does steam() then humble()', () => {
    const api = register()
    api.both()
    expect(useSteamRequestNotice.getState().latest).not.toBeNull()
    expect(useAuthState.getState().humble.expired).toBe(true)
  })

  it('clear() resets humble.expired and Steam latest', () => {
    const api = register()
    api.both()
    api.clear()
    expect(useAuthState.getState().humble.expired).toBe(false)
    expect(useSteamRequestNotice.getState().latest).toBeNull()
  })
})
