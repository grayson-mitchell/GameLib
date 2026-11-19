/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'
import { use as registerI18nPlugin } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { SteamDirectLaunchView } from 'common/types/steam'
import type { SettingsContextType } from 'frontend/types'
import SettingsContext from 'frontend/screens/Settings/SettingsContext'
import LaunchWithoutSteam, {
  describeLaunchWithoutSteamControl
} from '../LaunchWithoutSteam'

// Empty resources: t(key, default) returns the English default, and the InfoBox help key returns itself.
void registerI18nPlugin(initReactI18next).init({
  lng: 'en',
  resources: {},
  initImmediate: false,
  interpolation: { escapeValue: false }
})

const verdict = jest.fn()
const setSetting = jest.fn()

function ctx(
  isDefault: boolean,
  appName: string,
  stored: unknown
): SettingsContextType {
  return {
    getSetting: ((key: string, fallback: unknown) =>
      key === 'launchWithoutSteam'
        ? stored
        : fallback) as SettingsContextType['getSetting'],
    setSetting,
    config: {},
    isDefault,
    appName,
    runner: 'legendary',
    gameInfo: undefined,
    isMacNative: false,
    isLinuxNative: false
  }
}

const tree = (value: SettingsContextType) => (
  <SettingsContext.Provider value={value}>
    <LaunchWithoutSteam />
  </SettingsContext.Provider>
)

async function mount(value: SettingsContextType) {
  let result!: ReturnType<typeof render>
  await act(() => {
    result = render(tree(value))
    return Promise.resolve()
  })
  return result
}

const checkbox = (c: HTMLElement) =>
  c.querySelector<HTMLInputElement>('#launchWithoutSteam')

const clean: SteamDirectLaunchView = {
  applies: true,
  kind: 'mac-native',
  warning: 'none'
}

beforeEach(() => {
  verdict.mockReset().mockResolvedValue({ applies: false, reason: 'error' })
  Object.assign(window, { api: { steamDirectLaunchVerdict: verdict } })
})
afterEach(cleanup)

describe('describeLaunchWithoutSteamControl', () => {
  test.each([
    [undefined],
    [{ applies: false, reason: 'host-unsupported' }],
    [{ applies: false, reason: 'mac-arch-unsupported' }],
    [{ applies: false, reason: 'route-unsupported' }],
    [{ applies: false, reason: 'not-installed' }],
    [{ applies: false, reason: 'error' }]
  ] as [SteamDirectLaunchView | undefined][])('%j is hidden', (view) => {
    expect(describeLaunchWithoutSteamControl(view, true)).toEqual({
      kind: 'hidden'
    })
  })

  test('DRM is a disabled toggle', () => {
    expect(
      describeLaunchWithoutSteamControl(
        { applies: false, reason: 'steam-drm' },
        true
      )
    ).toEqual({ kind: 'disabled-drm' })
  })

  test('warns only for steam-api or unknown while on', () => {
    const view = (warning: 'none' | 'steam-api' | 'unknown') =>
      ({ applies: true, kind: 'bridge', warning }) as SteamDirectLaunchView
    for (const on of [true, false]) {
      expect(describeLaunchWithoutSteamControl(view('none'), on)).toEqual({
        kind: 'toggle',
        warn: false
      })
    }
    for (const w of ['steam-api', 'unknown'] as const) {
      expect(describeLaunchWithoutSteamControl(view(w), true)).toEqual({
        kind: 'toggle',
        warn: true
      })
      expect(describeLaunchWithoutSteamControl(view(w), false)).toEqual({
        kind: 'toggle',
        warn: false
      })
    }
  })
})

describe('LaunchWithoutSteam', () => {
  test('the default settings context renders nothing and never asks the backend', async () => {
    const { container } = await mount(ctx(true, 'default', false))
    expect(container.firstChild).toBeNull()
    expect(verdict).not.toHaveBeenCalled()
  })

  test('asks the backend for the verdict of this game', async () => {
    await mount(ctx(false, '570', false))
    expect(verdict).toHaveBeenCalledWith('570')
  })

  test('DRM view: disabled, off, reason behind the (i)', async () => {
    verdict.mockResolvedValue({ applies: false, reason: 'steam-drm' })
    const { container } = await mount(ctx(false, '570', true))
    expect(container.querySelector('.toggleWithInfo')).not.toBeNull()
    const box = checkbox(container)
    expect(box?.disabled).toBe(true)
    expect(box?.checked).toBe(false)
    // The reason is a label-line (i), not a badge row below the toggle.
    expect(container.querySelector('.saves-warning')).toBeNull()
    const help = container.querySelector('.helpLink--iconOnly')
    expect(help?.getAttribute('aria-label')).toBe('infobox.help')
    fireEvent.click(help as Element)
    expect(container.querySelector('.poppedElement')?.textContent).toBe(
      'Not available: this game uses Steam DRM, which needs the Steam app.'
    )
  })

  test('steam-api view with the setting on shows the yellow warning', async () => {
    verdict.mockResolvedValue({
      applies: true,
      kind: 'bridge',
      warning: 'steam-api'
    })
    const { container } = await mount(ctx(false, '570', true))
    const box = checkbox(container)
    expect(box?.checked).toBe(true)
    expect(box?.disabled).toBe(false)
    expect(container.querySelectorAll('.infoBox.saves-warning')).toHaveLength(1)
  })

  test('clean view with the setting on has no warning', async () => {
    verdict.mockResolvedValue(clean)
    const { container } = await mount(ctx(false, '570', true))
    expect(checkbox(container)?.checked).toBe(true)
    expect(container.querySelector('.saves-warning')).toBeNull()
  })

  test('toggling writes the negated value', async () => {
    verdict.mockResolvedValue(clean)
    const { container } = await mount(ctx(false, '570', false))
    fireEvent.click(checkbox(container) as HTMLElement)
    expect(setSetting).toHaveBeenCalledWith('launchWithoutSteam', true)
  })

  test('a failed verdict request hides the toggle', async () => {
    verdict.mockResolvedValueOnce(clean)
    const { container, rerender } = await mount(ctx(false, '570', false))
    expect(checkbox(container)).not.toBeNull()
    verdict.mockRejectedValue(new Error('x'))
    await act(() => {
      rerender(tree(ctx(false, '440', false)))
      return Promise.resolve()
    })
    expect(verdict).toHaveBeenCalledWith('440')
    expect(container.firstChild).toBeNull()
  })
})
