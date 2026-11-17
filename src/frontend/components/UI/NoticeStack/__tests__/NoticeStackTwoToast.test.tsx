/**
 * @jest-environment jsdom
 */
/**
 * jsdom integration half of the live gate on todo
 * 2026-11-05-humble-expiry-toast-overlaps-steam-notice-stack.
 *
 * jsdom has no layout engine and runs no CSS animations, so this cannot prove
 * visual non-overlap, the glide of the survivor, or fade-only under Reduce
 * Motion. Those stay the human live check (`__gamelibNotices.both()` in
 * `pnpm tauri:dev`).
 *
 * The src/frontend/jest.config.js claim that jsdom is not installed is stale
 * (jest-environment-jsdom@29.7.0 since 9d827905b).
 */
import 'frontend/testUtils/jsdomNoticeEnv'

// No module is mocked: styles resolve through the jest css mapper, and i18n
// and routing are real.
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { AppNoticeStack } from '../index'
import { StoreEmbedSuppressionProvider } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import useAuthState from 'frontend/state/authState'
import { resetAllStores } from 'frontend/state/storeKit'
import {
  handleSteamRequestNoticeSignal,
  useSteamRequestNotice
} from 'frontend/state/SteamRequestNotice'
import { PHASE_FALLBACK_MS } from '../noticeSlot'
import type { IpcRendererEvent } from 'common/types/hostTypes'

void i18next.use(initReactI18next).init({
  lng: 'en',
  resources: {},
  initImmediate: false
})

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  cleanup()
  resetAllStores()
  useSteamRequestNotice.setState({ latest: null })
  jest.useRealTimers()
})

const pushSteam = (seq: number): void => {
  act(() => {
    handleSteamRequestNoticeSignal({} as IpcRendererEvent, {
      appId: '220',
      title: 'Half-Life 2',
      kind: 'install-not-started',
      seq
    })
  })
}

const setHumbleExpired = (expired: boolean): void => {
  act(() => {
    useAuthState.setState((s) => ({ humble: { ...s.humble, expired } }))
  })
}

const slots = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll('.noticeStack > .noticeStackSlot'))

const mountBoth = () => {
  const { container } = render(
    <MemoryRouter>
      <StoreEmbedSuppressionProvider>
        <AppNoticeStack />
      </StoreEmbedSuppressionProvider>
    </MemoryRouter>
  )
  pushSteam(1)
  setHumbleExpired(true)
  const [steamSlot, humbleSlot] = slots(container) as [HTMLElement, HTMLElement]
  const steamToast = steamSlot.querySelector('.steamEngineLaunchNotice')
  const humbleToast = humbleSlot.querySelector('.humbleExpiryToast')
  return {
    container,
    steamSlot,
    humbleSlot,
    steamToast: steamToast as HTMLElement,
    humbleToast: humbleToast as HTMLElement
  }
}

describe('AppNoticeStack with the Steam notice and the Humble toast together', () => {
  it('renders one region with Steam before Humble, both in phase in', () => {
    const { container, steamSlot, humbleSlot, steamToast, humbleToast } =
      mountBoth()
    expect(container.querySelectorAll('.noticeStack')).toHaveLength(1)
    expect(slots(container)).toHaveLength(2)
    expect(steamToast).not.toBeNull()
    expect(humbleToast).not.toBeNull()
    expect(steamSlot.contains(steamToast)).toBe(true)
    expect(humbleSlot.contains(humbleToast)).toBe(true)
    expect(steamToast.classList.contains('noticeStackToast--leaving')).toBe(
      false
    )
    expect(humbleToast.classList.contains('noticeStackToast--leaving')).toBe(
      false
    )
  })

  it('Steam dismissed first via real animationend events leaves Humble untouched', () => {
    const { container, steamSlot, humbleSlot, steamToast, humbleToast } =
      mountBoth()
    const dismiss = container.querySelector(
      '.steamEngineLaunchNoticeDismiss'
    ) as HTMLElement
    fireEvent.click(dismiss)
    expect(steamToast.classList.contains('noticeStackToast--leaving')).toBe(
      true
    )
    fireEvent.animationEnd(steamToast, { animationName: 'noticeStackToastOut' })
    expect(steamSlot.classList.contains('noticeStackSlot--collapsing')).toBe(
      true
    )
    expect(slots(container)[1]).toBe(humbleSlot)
    fireEvent.animationEnd(steamSlot, { animationName: 'noticeStackSlotClose' })
    const remaining = slots(container)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toBe(humbleSlot)
    expect(humbleToast.classList.contains('noticeStackToast--leaving')).toBe(
      false
    )
  })

  it('Humble dismissed first via the fallback timers leaves Steam untouched', () => {
    const { container, steamSlot, humbleSlot, steamToast, humbleToast } =
      mountBoth()
    fireEvent.click(
      container.querySelector('.humbleExpiryToastDismiss') as HTMLElement
    )
    expect(humbleToast.classList.contains('noticeStackToast--leaving')).toBe(
      true
    )
    act(() => {
      jest.advanceTimersByTime(PHASE_FALLBACK_MS)
    })
    expect(humbleSlot.classList.contains('noticeStackSlot--collapsing')).toBe(
      true
    )
    expect(slots(container)[0]).toBe(steamSlot)
    act(() => {
      jest.advanceTimersByTime(PHASE_FALLBACK_MS)
    })
    const remaining = slots(container)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toBe(steamSlot)
    expect(steamToast.classList.contains('noticeStackToast--leaving')).toBe(
      false
    )
  })

  it('Humble leaves when its store resets, the path __gamelibNotices.clear() takes', () => {
    const { container, steamSlot, steamToast, humbleToast } = mountBoth()
    setHumbleExpired(false)
    expect(humbleToast.classList.contains('noticeStackToast--leaving')).toBe(
      true
    )
    expect(slots(container)[0]).toBe(steamSlot)
    expect(steamToast.classList.contains('noticeStackToast--leaving')).toBe(
      false
    )
  })
})
