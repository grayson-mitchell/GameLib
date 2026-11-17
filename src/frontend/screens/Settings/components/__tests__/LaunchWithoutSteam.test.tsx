import type { ReactElement } from 'react'
import type { SteamDirectLaunchView } from 'common/types/steam'

// No DOM renderer in this project: drive the component function directly with
// hooks stubbed (effects run synchronously).
let mockIsDefault = false
let mockStored: unknown = false
let mockView: SteamDirectLaunchView | undefined
const mockSetter = jest.fn()
const mockSetView = jest.fn()
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useContext: () => ({ isDefault: mockIsDefault, appName: '570' }),
  useState: () => [mockView, mockSetView],
  useEffect: (fn: () => void) => {
    fn()
  }
}))
jest.mock('frontend/screens/Settings/SettingsContext', () => ({
  __esModule: true,
  default: {}
}))
jest.mock('frontend/hooks/useSetting', () => ({
  __esModule: true,
  default: () => [mockStored, mockSetter]
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d: string) => d })
}))
jest.mock('frontend/components/UI', () => ({
  ToggleSwitch: () => null,
  InfoBox: () => null
}))
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: () => null
}))

import LaunchWithoutSteam, {
  describeLaunchWithoutSteamControl
} from '../LaunchWithoutSteam'

const verdict = jest.fn()

const render = (): ReactElement | null =>
  (LaunchWithoutSteam as unknown as () => ReactElement | null)()

type Props = Record<string, unknown> & { children?: unknown }
function parts(el: ReactElement | null): ReactElement[] {
  if (!el) return []
  const kids = (el.props as { children: unknown }).children
  return (Array.isArray(kids) ? kids : [kids]).filter(
    (k): k is ReactElement => typeof k === 'object' && k !== null
  )
}
const toggle = (el: ReactElement | null): Props =>
  (parts(el)[0] as ReactElement).props as Props
const infoBoxes = (el: ReactElement | null) =>
  parts(el)
    .slice(1)
    .map((p) => (p.props as Props).className)

beforeEach(() => {
  mockIsDefault = false
  mockStored = false
  mockView = undefined
  mockSetter.mockClear()
  mockSetView.mockClear()
  verdict.mockReset().mockResolvedValue({ applies: false, reason: 'error' })
  ;(globalThis as unknown as { window: unknown }).window = {
    api: { steamDirectLaunchVerdict: verdict }
  }
})

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
  test('the default settings context renders nothing and never asks the backend', () => {
    mockIsDefault = true
    expect(render()).toBeNull()
    expect(verdict).not.toHaveBeenCalled()
  })

  test('asks the backend for the verdict of this game', () => {
    render()
    expect(verdict).toHaveBeenCalledWith('570')
  })

  test('DRM view: disabled, off, reason behind the (i)', () => {
    mockView = { applies: false, reason: 'steam-drm' }
    mockStored = true
    const el = render()
    expect(toggle(el)).toMatchObject({ disabled: true, value: false })
    // The reason is a label-line (i), not a badge row below the toggle.
    expect((el?.props as Props).className).toBe('toggleWithInfo')
    expect((parts(el)[1] as ReactElement).props).toMatchObject({
      text: 'infobox.help',
      iconOnly: true,
      children:
        'Not available: this game uses Steam DRM, which needs the Steam app.'
    })
  })

  test('steam-api view with the setting on shows the yellow warning', () => {
    mockView = { applies: true, kind: 'bridge', warning: 'steam-api' }
    mockStored = true
    const el = render()
    expect(toggle(el)).toMatchObject({ value: true })
    expect(toggle(el).disabled).toBeUndefined()
    expect(infoBoxes(el)).toEqual(['infoBox saves-warning'])
  })

  test('clean view with the setting on has no warning', () => {
    mockView = { applies: true, kind: 'mac-native', warning: 'none' }
    mockStored = true
    const el = render()
    expect(toggle(el)).toMatchObject({ value: true })
    expect(infoBoxes(el)).toEqual([])
  })

  test('toggling writes the negated value', () => {
    mockView = { applies: true, kind: 'mac-native', warning: 'none' }
    mockStored = false
    ;(toggle(render()).handleChange as () => void)()
    expect(mockSetter).toHaveBeenCalledWith(true)
  })

  test('a failed verdict request hides the toggle', async () => {
    verdict.mockRejectedValue(new Error('x'))
    render()
    await new Promise((r) => setImmediate(r))
    expect(mockSetView).toHaveBeenCalledWith({
      applies: false,
      reason: 'error'
    })
  })
})
