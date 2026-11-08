/**
 * quick 261108-ioc: StoreSettings page. Node-env jest (no jsdom), so the component is
 * called as a plain function and the returned element tree is walked.
 */
import type { ReactElement, ReactNode } from 'react'

const navigateMock = jest.fn()
const params: { store?: string } = {}

jest.mock('react-router-dom', () => ({
  useParams: () => params,
  useNavigate: () => navigateMock
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string): string => defaultValue ?? _key
  })
}))

jest.mock('@mui/material', () => ({
  Tabs: function Tabs() {
    return null
  },
  Tab: function Tab() {
    return null
  }
}))

jest.mock('frontend/components/UI', () => ({
  TabPanel: function TabPanel() {
    return null
  }
}))

jest.mock('../index.scss', () => ({}))

jest.mock('../../../components', () => {
  const stub = (name: string) => {
    const fn = () => null
    Object.defineProperty(fn, 'name', { value: name })
    return fn
  }
  return {
    AltGOGdlBin: stub('AltGOGdlBin'),
    AltLegendaryBin: stub('AltLegendaryBin'),
    AltNileBin: stub('AltNileBin'),
    DefaultSteamPath: stub('DefaultSteamPath'),
    EgsSettings: stub('EgsSettings'),
    EnableSteamNativeDelete: stub('EnableSteamNativeDelete'),
    EnableSteamNativeInstall: stub('EnableSteamNativeInstall'),
    NotifyHumbleExpirations: stub('NotifyHumbleExpirations'),
    PlaytimeSync: stub('PlaytimeSync'),
    SteamExperimentalInstallApp: stub('SteamExperimentalInstallApp')
  }
})

jest.mock('../../../components/DisableGOGPresence', () => {
  const fn = () => null
  Object.defineProperty(fn, 'name', { value: 'DisableGOGPresence' })
  return { __esModule: true, default: fn }
})

jest.mock('../EosOverlay', () => {
  const fn = () => null
  Object.defineProperty(fn, 'name', { value: 'EosOverlay' })
  return { __esModule: true, default: fn }
})

import StoreSettings from '../index'

type El = ReactElement<Record<string, unknown>>

function typeName(el: El): string {
  return typeof el.type === 'string'
    ? el.type
    : (el.type as { name: string }).name
}

function collect(node: ReactNode, out: El[] = []): El[] {
  if (node === null || node === undefined || typeof node === 'boolean')
    return out
  if (Array.isArray(node)) {
    node.forEach((c) => collect(c as ReactNode, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    const el = node as El
    out.push(el)
    collect(el.props?.children as ReactNode, out)
  }
  return out
}

function children(el: El): El[] {
  const c = el.props.children as ReactNode
  const list = Array.isArray(c) ? c : [c]
  return list.filter(
    (x): x is El => typeof x === 'object' && x !== null && 'type' in x
  )
}

function render(store?: string): El {
  params.store = store
  return StoreSettings() as unknown as El
}

function panel(root: El, index: string): El {
  const found = collect(root).find(
    (e) => typeName(e) === 'TabPanel' && e.props.index === index
  )
  if (!found) throw new Error(`no panel ${index}`)
  return found
}

function panelContents(root: El, index: string): string[] {
  return children(panel(root, index)).map((c) =>
    typeName(c) === 'StoreAdvanced'
      ? `details:${children(c).map(typeName).join(',')}`
      : typeName(c)
  )
}

function tabs(root: El): El {
  const t = collect(root).find((e) => typeName(e) === 'Tabs')
  if (!t) throw new Error('no Tabs')
  return t
}

describe('StoreSettings', () => {
  beforeEach(() => navigateMock.mockClear())

  it('defaults to the amazon tab when :store is absent or unknown', () => {
    expect(tabs(render(undefined)).props.value).toBe('amazon')
    expect(tabs(render('zoom')).props.value).toBe('amazon')
  })

  it('selects the tab named by :store', () => {
    expect(tabs(render('steam')).props.value).toBe('steam')
  })

  it('lists tabs alphabetically with their labels', () => {
    const tabEls = children(tabs(render())).map((t) => [
      t.props.value,
      t.props.label
    ])
    expect(tabEls).toEqual([
      ['amazon', 'Amazon'],
      ['epic', 'Epic'],
      ['gog', 'GOG'],
      ['humble', 'Humble'],
      ['steam', 'Steam']
    ])
  })

  it('navigates to /settings/stores/<store> (replace) on tab change', () => {
    const onChange = tabs(render()).props.onChange as (
      e: unknown,
      v: string
    ) => void
    onChange(null, 'gog')
    expect(navigateMock).toHaveBeenCalledWith('/settings/stores/gog', {
      replace: true
    })
  })

  it('renders each store panel in order', () => {
    const root = render()
    expect(panelContents(root, 'steam')).toEqual([
      'DefaultSteamPath',
      'EnableSteamNativeInstall',
      'EnableSteamNativeDelete',
      'SteamExperimentalInstallApp'
    ])
    expect(panelContents(root, 'epic')).toEqual([
      'EgsSettings',
      'EosOverlay',
      'details:AltLegendaryBin'
    ])
    expect(panelContents(root, 'gog')).toEqual([
      'PlaytimeSync',
      'DisableGOGPresence',
      'details:AltGOGdlBin'
    ])
    expect(panelContents(root, 'amazon')).toEqual(['details:AltNileBin'])
    expect(panelContents(root, 'humble')).toEqual(['NotifyHumbleExpirations'])
  })
})
