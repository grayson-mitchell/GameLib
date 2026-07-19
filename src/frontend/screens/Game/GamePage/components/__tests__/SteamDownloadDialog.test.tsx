/**
 * Unit tests for SteamDownloadDialog — the single native-Steam install window
 * (quick 260719-t8t).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * src/frontend/jest.config.js docstring — adding one is a new npm dependency,
 * excluded from executor auto-fix). The component uses useState/useEffect, so
 * this test installs a tiny dependency-aware hook harness by mocking react's
 * useState/useEffect, then invokes the component as a plain function and
 * inspects/drives the returned React-element object graph without any DOM.
 */
import type { ReactElement } from 'react'
import { GameInfo } from 'common/types'
import type { SteamLibraryOption } from 'frontend/state/SteamInstallLocation'

// ---- hook harness -----------------------------------------------------------
interface HookState {
  states: unknown[]
  deps: (unknown[] | undefined)[]
  effects: (() => void | (() => void))[]
  idx: number
  effIdx: number
}
const hook: HookState = { states: [], deps: [], effects: [], idx: 0, effIdx: 0 }

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useState: (init: unknown) => {
    const i = hook.idx++
    if (!(i in hook.states)) {
      hook.states[i] = typeof init === 'function' ? init() : init
    }
    const setter = (v: unknown) => {
      hook.states[i] =
        typeof v === 'function'
          ? (v as (p: unknown) => unknown)(hook.states[i])
          : v
    }
    return [hook.states[i], setter]
  },
  useEffect: (fn: () => void | (() => void), deps?: unknown[]) => {
    const i = hook.effIdx++
    const prev = hook.deps[i]
    const changed =
      !prev || !deps || deps.some((d, k) => !Object.is(d, prev[k]))
    if (changed) {
      hook.deps[i] = deps
      hook.effects.push(fn)
    }
  }
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string): string => defaultValue ?? key
  })
}))

// The real Dialog barrel imports './index.css', which ts-jest's node env can't
// parse. Stub the shared Dialog primitives as passthrough hosts so children
// (title, select, buttons) stay reachable in the element graph.
jest.mock('frontend/components/UI/Dialog', () => {
  const React = jest.requireActual<typeof import('react')>('react')
  const pass =
    (name: string) =>
    ({ children }: { children?: unknown }) =>
      React.createElement(name, null, children as never)
  return {
    __esModule: true,
    Dialog: pass('div'),
    DialogHeader: pass('div'),
    DialogContent: pass('div'),
    DialogFooter: pass('div')
  }
})

// ---- controllable store + collaborators ------------------------------------
let storeValue: {
  isOpen: boolean
  appName?: string
  gameInfo: GameInfo | null
  libraries: SteamLibraryOption[]
  close: jest.Mock
}

jest.mock('frontend/state/SteamInstallLocation', () => ({
  __esModule: true,
  useSteamInstallLocation: () => storeValue
}))

const installSteamGame = jest.fn()
jest.mock('frontend/state/InstallGameModal', () => ({
  __esModule: true,
  installSteamGame: (...args: unknown[]) => installSteamGame(...args)
}))

const checkDiskSpace = jest.fn()
;(global as unknown as { window: unknown }).window = { api: { checkDiskSpace } }

import SteamDownloadDialog, {
  getDefaultSteamLibraryPath
} from '../SteamDownloadDialog'

// ---- traversal helpers ------------------------------------------------------
type El = ReactElement<{ children?: unknown; [k: string]: unknown }>

function walk(node: unknown, visit: (el: El) => void): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, visit))
    return
  }
  const el = node as El
  visit(el)
  if (el.props && 'children' in el.props) walk(el.props.children, visit)
}

function findAllByType(root: unknown, type: string): El[] {
  const out: El[] = []
  walk(root, (el) => {
    if (el.type === type) out.push(el)
  })
  return out
}

function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join(' ')
  const el = node as El
  if (el.props && 'children' in el.props) return collectText(el.props.children)
  return ''
}

/** One render pass, then flush the effects React would have run after it. */
function render(): unknown {
  hook.idx = 0
  hook.effIdx = 0
  hook.effects = []
  const tree = SteamDownloadDialog()
  hook.effects.forEach((fn) => fn())
  return tree
}

/** Render repeatedly so state set by effects settles into the tree. */
function renderSettled(passes = 3): unknown {
  let tree: unknown = null
  for (let i = 0; i < passes; i++) tree = render()
  return tree
}

function resetHarness() {
  hook.states = []
  hook.deps = []
  hook.effects = []
  hook.idx = 0
  hook.effIdx = 0
}

function makeGameInfo(): GameInfo {
  return {
    runner: 'steam',
    app_name: '440',
    art_cover: 'cover.jpg',
    art_square: 'square.jpg',
    install: {},
    is_installed: false,
    title: 'Team Fortress 2',
    canRunOffline: true
  } as unknown as GameInfo
}

const lib = (path: string, isPrimary = false): SteamLibraryOption => ({
  path,
  steamappsDir: `${path}/steamapps`,
  isPrimary
})

beforeEach(() => {
  resetHarness()
  installSteamGame.mockReset()
  checkDiskSpace.mockReset()
  checkDiskSpace.mockResolvedValue({
    free: 100,
    diskSize: 200,
    message: '100 GB',
    validPath: true,
    validFlatpakPath: true
  })
  storeValue = {
    isOpen: false,
    appName: undefined,
    gameInfo: null,
    libraries: [],
    close: jest.fn()
  }
})

describe('getDefaultSteamLibraryPath', () => {
  it('prefers the primary library', () => {
    expect(getDefaultSteamLibraryPath([lib('/a'), lib('/b', true)])).toBe('/b')
  })
  it('falls back to the first library', () => {
    expect(getDefaultSteamLibraryPath([lib('/a'), lib('/b')])).toBe('/a')
  })
  it("returns '' for no libraries", () => {
    expect(getDefaultSteamLibraryPath([])).toBe('')
  })
})

describe('SteamDownloadDialog', () => {
  it('renders nothing when the store is closed', () => {
    storeValue.isOpen = false
    expect(render()).toBeNull()
  })

  it('renders game title and pre-selects the single library', () => {
    storeValue = {
      isOpen: true,
      appName: '440',
      gameInfo: makeGameInfo(),
      libraries: [lib('/only', true)],
      close: jest.fn()
    }
    const tree = renderSettled()
    expect(collectText(tree)).toContain('Team Fortress 2')
    const select = findAllByType(tree, 'select')[0]
    expect(select.props.value).toBe('/only')
    expect(select.props.disabled).toBe(false)
  })

  it('shows the "Unknown" download size with no spinner', () => {
    storeValue = {
      isOpen: true,
      appName: '440',
      gameInfo: makeGameInfo(),
      libraries: [lib('/only', true)],
      close: jest.fn()
    }
    const tree = renderSettled()
    expect(collectText(tree)).toContain('Unknown')
    // No hanging/pulsing spinner anywhere in the tree.
    walk(tree, (el) => {
      const cls = el.props?.className
      if (typeof cls === 'string') expect(cls).not.toContain('fa-spin')
    })
  })

  it('recomputes free space for the selected library on open', () => {
    storeValue = {
      isOpen: true,
      appName: '440',
      gameInfo: makeGameInfo(),
      libraries: [lib('/only', true)],
      close: jest.fn()
    }
    renderSettled()
    expect(checkDiskSpace).toHaveBeenCalledWith('/only')
  })

  it('re-runs checkDiskSpace when the selected library changes', () => {
    storeValue = {
      isOpen: true,
      appName: '440',
      gameInfo: makeGameInfo(),
      libraries: [lib('/A', true), lib('/B')],
      close: jest.fn()
    }
    const tree = renderSettled()
    checkDiskSpace.mockClear()
    const select = findAllByType(tree, 'select')[0]
    ;(select.props.onChange as (e: unknown) => void)({
      target: { value: '/B' }
    })
    renderSettled()
    expect(checkDiskSpace).toHaveBeenCalledWith('/B')
  })

  it('Install calls installSteamGame with the selected path, then closes', () => {
    const close = jest.fn()
    storeValue = {
      isOpen: true,
      appName: '440',
      gameInfo: makeGameInfo(),
      libraries: [lib('/only', true)],
      close
    }
    const tree = renderSettled()
    const installBtn = findAllByType(tree, 'button').find((b) =>
      collectText(b).includes('button.install')
    )
    ;(installBtn?.props.onClick as () => void)()
    expect(close).toHaveBeenCalled()
    expect(installSteamGame).toHaveBeenCalledWith(
      '440',
      expect.objectContaining({ app_name: '440' }),
      '/only'
    )
  })

  it('Cancel closes without installing', () => {
    const close = jest.fn()
    storeValue = {
      isOpen: true,
      appName: '440',
      gameInfo: makeGameInfo(),
      libraries: [lib('/only', true)],
      close
    }
    const tree = renderSettled()
    const cancelBtn = findAllByType(tree, 'button').find((b) =>
      collectText(b).includes('Cancel')
    )
    ;(cancelBtn?.props.onClick as () => void)()
    expect(close).toHaveBeenCalled()
    expect(installSteamGame).not.toHaveBeenCalled()
  })

  it('with 0 libraries: renders a disabled placeholder and installs with empty path', () => {
    const close = jest.fn()
    storeValue = {
      isOpen: true,
      appName: '440',
      gameInfo: makeGameInfo(),
      libraries: [],
      close
    }
    const tree = renderSettled()
    const select = findAllByType(tree, 'select')[0]
    expect(select.props.disabled).toBe(true)
    expect(select.props.value).toBe('')
    const installBtn = findAllByType(tree, 'button').find((b) =>
      collectText(b).includes('button.install')
    )
    ;(installBtn?.props.onClick as () => void)()
    expect(installSteamGame).toHaveBeenCalledWith(
      '440',
      expect.anything(),
      ''
    )
  })
})
