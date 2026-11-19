/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'
import type { ReactElement } from 'react'

// The real notice modules are loaded; the test checks element-type identity
// only, so nothing renders.
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
