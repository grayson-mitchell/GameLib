import type { ReactElement } from 'react'

// No DOM renderer in this project: drive the component function directly with
// hooks stubbed (effects run synchronously).
let mockStore: Record<string, unknown> = {}
let mockStored: unknown = 'automatic'
const mockSetter = jest.fn()
const mockSet = jest.fn()
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useContext: () => ({ appName: '1', runner: 'steam' }),
  useEffect: (fn: () => void) => {
    fn()
  }
}))
jest.mock('frontend/state/EngineState', () => ({
  engineStateKey: (r: string, a: string) => `${r}:${a}`,
  useEngineState: Object.assign(
    (sel: (s: { byGame: Record<string, unknown> }) => unknown) =>
      sel({ byGame: mockStore }),
    { getState: () => ({ set: mockSet }) }
  )
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
jest.mock('frontend/components/UI/SelectField', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('frontend/components/UI/InfoIcon', () => ({
  __esModule: true,
  default: () => null
}))

import SteamOverlayOverride, {
  parseOverlayValue
} from '../SteamOverlayOverride'

type Props = Record<string, unknown> & { children?: unknown }
const getState = jest.fn()

const render = (): ReactElement | null =>
  (SteamOverlayOverride as unknown as () => ReactElement | null)()

const select = (el: ReactElement): ReactElement => {
  const kids = (el.props as { children: ReactElement[] }).children
  return kids[1]
}

beforeEach(() => {
  mockStore = { 'steam:1': { overlayEligible: true } }
  mockStored = 'automatic'
  mockSetter.mockClear()
  mockSet.mockClear()
  getState.mockReset().mockResolvedValue(null)
  ;(globalThis as unknown as { window: unknown }).window = {
    api: { getEngineState: getState }
  }
})

describe('SteamOverlayOverride', () => {
  it('renders a details with the summary and an automatic select', () => {
    const el = render()!
    expect(el.type).toBe('details')
    const kids = (el.props as { children: ReactElement[] }).children
    expect((kids[0].props as Props).children).toBe('Steam overlay (advanced)')
    expect((select(el).props as Props).value).toBe('automatic')
  })

  it('offers automatic, on, off', () => {
    const items = (select(render()!).props as { children: ReactElement[] })
      .children
    expect(items.map((i) => (i.props as Props).value)).toEqual([
      'automatic',
      'on',
      'off'
    ])
  })

  it('renders null when not eligible or eligibility is unset', () => {
    mockStore = { 'steam:1': { overlayEligible: false } }
    expect(render()).toBeNull()
    mockStore = { 'steam:1': {} }
    expect(render()).toBeNull()
  })

  it('writes the chosen value', () => {
    const onChange = (select(render()!).props as Props).onChange as (e: {
      target: { value: string }
    }) => void
    onChange({ target: { value: 'off' } })
    expect(mockSetter).toHaveBeenLastCalledWith('off')
    onChange({ target: { value: 'on' } })
    expect(mockSetter).toHaveBeenLastCalledWith('on')
  })

  it('shows a junk stored value as automatic without rewriting it', () => {
    mockStored = 'yes'
    expect((select(render()!).props as Props).value).toBe('automatic')
    expect(mockSetter).not.toHaveBeenCalled()
    expect(parseOverlayValue(undefined)).toBe('automatic')
  })

  it('shows a loaded off as Off (60-UAT G3: the renderer read path is sound)', () => {
    mockStored = 'off'
    expect((select(render()!).props as Props).value).toBe('off')
    mockStored = 'on'
    expect((select(render()!).props as Props).value).toBe('on')
  })

  it('fetches the engine state once when it is missing', () => {
    mockStore = {}
    expect(render()).toBeNull()
    expect(getState).toHaveBeenCalledTimes(1)
    expect(getState).toHaveBeenCalledWith({ runner: 'steam', appName: '1' })
  })

  it('uses an icon-only help on the label line', () => {
    const labelHelp = (select(render()!).props as Props)
      .labelHelp as ReactElement
    expect(typeof labelHelp.type).toBe('function')
  })
})
