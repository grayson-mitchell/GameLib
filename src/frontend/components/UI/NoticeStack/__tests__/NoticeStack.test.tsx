import type { ReactElement } from 'react'

jest.mock('../index.scss', () => ({}))
jest.mock('frontend/components/UI/SteamEngineLaunchNotice', () => ({
  __esModule: true,
  default: function SteamStub() {
    return null
  }
}))
jest.mock('frontend/components/UI/ReadOnlyStoresNotice', () => ({
  __esModule: true,
  default: function ReadOnlyStub() {
    return null
  }
}))
jest.mock('frontend/components/UI/ThemeSaveFailedNotice', () => ({
  __esModule: true,
  default: function ThemeSaveFailedStub() {
    return null
  }
}))
jest.mock('frontend/components/UI/HumbleExpiryToast', () => ({
  __esModule: true,
  default: function HumbleStub() {
    return null
  }
}))

// Imported after the mocks above (no jest.mock hoisting in this setup).
import SteamEngineLaunchNotice from 'frontend/components/UI/SteamEngineLaunchNotice'
import ReadOnlyStoresNotice from 'frontend/components/UI/ReadOnlyStoresNotice'
import ThemeSaveFailedNotice from 'frontend/components/UI/ThemeSaveFailedNotice'
import HumbleExpiryToast from 'frontend/components/UI/HumbleExpiryToast'
import NoticeStack, { AppNoticeStack } from '../index'
import { at } from '../../../__tests__/fixtures/indexed'

describe('NoticeStack', () => {
  it('AppNoticeStack renders Steam first, read-only stores and the theme save failure next, Humble last inside one region', () => {
    const root = AppNoticeStack() as ReactElement<{ children: ReactElement[] }>
    expect(root.type).toBe(NoticeStack)
    const kids = root.props.children
    expect(kids).toHaveLength(4)
    expect(at(kids, 0).type).toBe(SteamEngineLaunchNotice)
    expect(at(kids, 1).type).toBe(ReadOnlyStoresNotice)
    expect(at(kids, 2).type).toBe(ThemeSaveFailedNotice)
    expect(at(kids, 3).type).toBe(HumbleExpiryToast)
  })

  it('NoticeStack renders its children in a single .noticeStack div', () => {
    const child = <span />
    const out = NoticeStack({ children: child }) as ReactElement<{
      className: string
      children: unknown
    }>
    expect(out.type).toBe('div')
    expect(out.props.className).toBe('noticeStack')
    expect(out.props.children).toBe(child)
  })
})
