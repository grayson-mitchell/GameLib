/**
 * Gate for the "Use frameless window" live refresh (quick 261102-dma, todo
 * `2026-11-02-windows-controls-linger-after-frameless-off`).
 *
 * The bug: turning the setting OFF on Windows brought the native title bar back, but GameLib's
 * own WindowControls stayed on the tab bar too. `App.tsx` shows them while the context
 * `isFrameless` is true, and the state owner seeded that value once at mount and never wrote it
 * again, so the toggle (which re-applies the native frame live through the preload `setSetting`)
 * never reached React.
 *
 * The real push is proven behaviourally by `src/preload/__tests__/framelessRuntime.test.ts`
 * F1-F7. Part A (Phase 69-06, R8) is now behavioural: it runs the real
 * `seedAndFollowWindowChrome` against a fake `window.api` and the real uiState store, and proves
 * the provider exposure through `bridgedContextSlice`. Part B pins App.tsx's gate; App.tsx cannot
 * be imported under this node-environment jest (`Root` is not exported and needs a router), so it
 * stays a source-text matcher until App converts (69-11). The live Windows check is recorded on
 * the todo.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { defined } from './defined'
import { resetAllStores, type StoreHooks } from '../storeKit'
import type { UiState } from '../uiState'

// Node-env frontend project (no jsdom): give the modules a window first.
;(globalThis as unknown as { window: object }).window = {
  __TAURI_INTERNALS__: {
    invoke: () => Promise.resolve(undefined),
    transformCallback: () => 0,
    unregisterCallback: () => undefined,
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' }
    }
  }
}

const appPath = join(__dirname, '..', '..', 'App.tsx')

type ChromeImpl = () => Promise<void>

interface FakeChrome {
  order: string[]
  fullscreenHandlers: Array<(e: unknown, v: boolean) => void>
  framelessHandlers: Array<(v: boolean) => void>
}

function installFakeChromeApi(seed: {
  isFullscreen: boolean
  isFrameless: boolean
}): FakeChrome {
  const fake: FakeChrome = {
    order: [],
    fullscreenHandlers: [],
    framelessHandlers: []
  }
  ;(window as unknown as { api: unknown }).api = {
    isFullscreen: () => {
      fake.order.push('seed')
      return Promise.resolve(seed.isFullscreen)
    },
    isFrameless: () => {
      fake.order.push('seed')
      return Promise.resolve(seed.isFrameless)
    },
    handleFullscreen: (fn: (e: unknown, v: boolean) => void) => {
      fake.order.push('subscribe')
      fake.fullscreenHandlers.push(fn)
    },
    handleFramelessChanged: (fn: (v: boolean) => void) => {
      fake.order.push('subscribe')
      fake.framelessHandlers.push(fn)
    }
  }
  return fake
}

/** Describe A: the wiring rules `impl` violates against the real store (empty = wired). */
async function chromeViolations(
  impl: ChromeImpl,
  store: StoreHooks<UiState>
): Promise<string[]> {
  const violations: string[] = []
  resetAllStores()
  const fake = installFakeChromeApi({ isFullscreen: false, isFrameless: true })
  await impl()

  if (store.getState().isFrameless !== true) {
    violations.push('A1: the mount-time isFrameless seed is written')
  }
  const firstSubscribe = fake.order.indexOf('subscribe')
  const lastSeed = fake.order.lastIndexOf('seed')
  if (firstSubscribe === -1) {
    violations.push('A2: it subscribes to handleFramelessChanged')
  } else if (lastSeed === -1 || firstSubscribe < lastSeed) {
    violations.push('A2: the subscription sits after the mount-time seed')
  }
  const handler = fake.framelessHandlers[0]
  if (handler) {
    handler(false)
    const afterOff = store.getState().isFrameless
    handler(true)
    const afterOn = store.getState().isFrameless
    if (afterOff !== false || afterOn !== true) {
      violations.push(
        'A3: the handler writes the pushed value into isFrameless'
      )
    }
  }
  return violations
}

/** Splits a `&&` gate into conjuncts; throws on any shape the evaluator does not model. */
function parseConjuncts(expression: string): string[] {
  const conjuncts = expression.split('&&').map((part) => part.trim())
  for (const conjunct of conjuncts) {
    if (!/^!?[A-Za-z_$][\w$]*$/.test(conjunct)) {
      throw new Error(`unsupported gate shape: ${conjunct}`)
    }
  }
  return conjuncts
}

/** True only when every conjunct holds; `!id` means `!env[id]`. Throws on a missing identifier. */
function evaluateConjunction(
  conjuncts: string[],
  env: Record<string, boolean>
): boolean {
  return conjuncts.every((conjunct) => {
    const negated = conjunct.startsWith('!')
    const id = negated ? conjunct.slice(1) : conjunct
    if (!(id in env)) {
      throw new Error(`identifier missing from env: ${id}`)
    }
    return negated ? !env[id] : env[id]
  })
}

interface AppGate {
  contextNames: string[]
  macLiteral: string
  conjuncts: string[]
  jsxGated: boolean
}

/** Describe B: reads the gate out of App.tsx's `Root`. Throws on an unsupported shape. */
function readAppGate(strippedApp: string): AppGate {
  const rootIdx = strippedApp.indexOf('function Root()')
  if (rootIdx === -1) {
    throw new Error('function Root() not found')
  }
  const root = strippedApp.slice(rootIdx)

  const destructure = root.match(/const\s*\{([^}]*)\}\s*=\s*useUiState\.keys\(/)
  if (!destructure) {
    throw new Error('Root does not destructure useUiState.keys(...)')
  }
  const contextNames = defined(destructure[1], 'destructured names')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

  const isMacLine = root.match(/const isMac = ([^\n]*)/)
  const macLiteral = isMacLine
    ? defined(isMacLine[1], 'isMac expression').match(
        /platform === '([^']+)'/
      )?.[1]
    : undefined
  if (!macLiteral) {
    throw new Error('const isMac is not a platform === literal comparison')
  }

  const gateLine = root.match(/const showOverlayControls = ([^\n]*)/)
  if (!gateLine) {
    throw new Error('const showOverlayControls not found')
  }
  const conjuncts = parseConjuncts(
    defined(gateLine[1], 'showOverlayControls expression')
  )

  const jsxGated =
    /\{\s*showOverlayControls\s*&&\s*<WindowControls\s*\/>\s*\}/.test(root)

  return { contextNames, macLiteral, conjuncts, jsxGated }
}

/** Gate result for a platform and a frameless value (WindowControls shown = true). */
function gateShows(
  gate: { conjuncts: string[]; macLiteral: string },
  platform: string,
  isFrameless: boolean
): boolean {
  return evaluateConjunction(gate.conjuncts, {
    isFrameless,
    // The Chromium-only `navigator.windowControlsOverlay?.visible`, which is not visible in a
    // Tauri webview.
    hasNativeOverlayControls: false,
    isMac: platform === gate.macLiteral
  })
}

describe('seedAndFollowWindowChrome -- isFrameless follows the frameless push (261102-dma)', () => {
  let useUiState: StoreHooks<UiState>
  let seedAndFollowWindowChrome: ChromeImpl
  let bridgedContextSlice: () => { isFrameless: boolean }

  beforeAll(async () => {
    useUiState = (await import('../uiState')).default
    ;({ seedAndFollowWindowChrome } = await import('../initStateSubscriptions'))
    ;({ bridgedContextSlice } = await import('../bridgeContextValue'))
  })

  afterEach(() => resetAllStores())

  it('A: the real implementation seeds once, then subscribes and writes the pushed value', async () => {
    expect(
      await chromeViolations(seedAndFollowWindowChrome, useUiState)
    ).toEqual([])
  })

  it('A4: the provider exposes the store value through the bridge', async () => {
    installFakeChromeApi({ isFullscreen: false, isFrameless: true })
    await seedAndFollowWindowChrome()
    expect(bridgedContextSlice().isFrameless).toBe(true)
    useUiState.setState({ isFrameless: false })
    expect(bridgedContextSlice().isFrameless).toBe(false)
  })
})

describe('App.tsx -- the WindowControls gate across the frameless flip (261102-dma)', () => {
  const gate = readAppGate(stripSourceComments(readFileSync(appPath, 'utf-8')))

  it('B1: Root reads isFrameless from useUiState', () => {
    expect(gate.contextNames).toContain('isFrameless')
  })

  it("B2: the darwin comparison is the platform literal 'darwin'", () => {
    expect(gate.macLiteral).toBe('darwin')
  })

  it('B3/B4: the gate parses into modelled conjuncts and is what gates <WindowControls />', () => {
    expect(gate.conjuncts.length).toBeGreaterThan(0)
    expect(gate.jsxGated).toBe(true)
  })

  it.each(['win32', 'linux'])(
    'on %s: shown while frameless, hidden once it flips off, shown again when it flips back on',
    (platform) => {
      expect(gateShows(gate, platform, true)).toBe(true)
      expect(gateShows(gate, platform, false)).toBe(false)
      expect(gateShows(gate, platform, true)).toBe(true)
    }
  )

  it('on darwin: never shown, in either state (the D-06 reversal still holds)', () => {
    expect(gateShows(gate, 'darwin', true)).toBe(false)
    expect(gateShows(gate, 'darwin', false)).toBe(false)
  })
})

describe('SELF-TEST (anti-vacuity, REQUIRED) -- the matchers can convict', () => {
  let useUiState: StoreHooks<UiState>
  let seedAndFollowWindowChrome: ChromeImpl

  beforeAll(async () => {
    useUiState = (await import('../uiState')).default
    ;({ seedAndFollowWindowChrome } = await import('../initStateSubscriptions'))
  })

  afterEach(() => resetAllStores())

  const api = () =>
    (
      window as unknown as {
        api: {
          isFullscreen: () => Promise<boolean>
          isFrameless: () => Promise<boolean>
          handleFullscreen: (fn: (e: unknown, v: boolean) => void) => void
          handleFramelessChanged: (fn: (v: boolean) => void) => void
        }
      }
    ).api

  it('positive control: the real implementation has no violations', async () => {
    expect(
      await chromeViolations(seedAndFollowWindowChrome, useUiState)
    ).toEqual([])
  })

  it('S1: an implementation that never subscribes convicts A2', async () => {
    const noSubscribe: ChromeImpl = async () => {
      useUiState.setState({
        isFullscreen: await api().isFullscreen(),
        isFrameless: await api().isFrameless()
      })
    }
    expect(await chromeViolations(noSubscribe, useUiState)).toEqual(
      expect.arrayContaining(['A2: it subscribes to handleFramelessChanged'])
    )
  })

  it('S2: a fake that subscribes BEFORE seeding convicts A2', async () => {
    const subscribeFirst: ChromeImpl = async () => {
      api().handleFramelessChanged((isFrameless) =>
        useUiState.setState({ isFrameless })
      )
      useUiState.setState({
        isFullscreen: await api().isFullscreen(),
        isFrameless: await api().isFrameless()
      })
    }
    expect(await chromeViolations(subscribeFirst, useUiState)).toEqual(
      expect.arrayContaining([
        'A2: the subscription sits after the mount-time seed'
      ])
    )
  })

  it('S3: a handler that writes a constant instead of the pushed value convicts A3', async () => {
    const constant: ChromeImpl = async () => {
      useUiState.setState({
        isFullscreen: await api().isFullscreen(),
        isFrameless: await api().isFrameless()
      })
      api().handleFramelessChanged(() =>
        useUiState.setState({ isFrameless: true })
      )
    }
    expect(await chromeViolations(constant, useUiState)).toEqual(
      expect.arrayContaining([
        'A3: the handler writes the pushed value into isFrameless'
      ])
    )
  })

  it('S4: an implementation that never seeds convicts A1', async () => {
    const noSeed: ChromeImpl = () => {
      api().handleFramelessChanged((isFrameless) =>
        useUiState.setState({ isFrameless })
      )
      return Promise.resolve()
    }
    expect(await chromeViolations(noSeed, useUiState)).toEqual(
      expect.arrayContaining(['A1: the mount-time isFrameless seed is written'])
    )
  })

  it('S5: with the isFrameless conjunct dropped, the gate stays TRUE on win32 after the flip off', () => {
    const dropped = {
      conjuncts: parseConjuncts('!hasNativeOverlayControls && !isMac'),
      macLiteral: 'darwin'
    }
    expect(gateShows(dropped, 'win32', false)).toBe(true)
  })

  it('S6: a gate with || makes the parser throw rather than pass vacuously', () => {
    expect(() => parseConjuncts('isFrameless || !isMac')).toThrow(
      /unsupported gate shape/
    )
  })

  it('S7: the evaluator throws on an identifier it has no value for', () => {
    expect(() => evaluateConjunction(['mystery'], {})).toThrow(
      /missing from env/
    )
  })
})
