/**
 * Source-text gate for the "Use frameless window" live refresh (quick 261102-dma, todo
 * `2026-11-02-windows-controls-linger-after-frameless-off`).
 *
 * The bug: turning the setting OFF on Windows brought the native title bar back, but GameLib's
 * own WindowControls stayed on the tab bar too. `App.tsx` shows them while the context
 * `isFrameless` is true, and `GlobalState.tsx` seeded that value once at mount and never wrote it
 * again, so the toggle (which re-applies the native frame live through the preload `setSetting`)
 * never reached React.
 *
 * The real push is proven behaviourally by `src/preload/__tests__/framelessRuntime.test.ts`
 * F1-F7 (the real `setSetting` driving the real `handleFramelessChanged` subscribers). This file
 * pins the remaining two links of the chain: GlobalState writes `isFrameless` from the push, and
 * App.tsx's gate then hides WindowControls on win32 and linux and keeps them off on darwin.
 *
 * What it cannot see: it does not render anything, and it does not evaluate
 * `navigator.windowControlsOverlay`. Neither GlobalState.tsx nor App.tsx's `Root` can be imported
 * under this node-environment jest (no jsdom; GlobalState reads `window.localStorage` at module
 * scope; `Root` is not exported and needs a router), so the matchers run over the comment-stripped
 * source text, the same idiom as `GlobalStateSavedZoomWiring.test.ts`. The live Windows check is
 * recorded on the todo.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const globalStatePath = join(__dirname, '..', 'GlobalState.tsx')
const appPath = join(__dirname, '..', '..', 'App.tsx')

/** Balanced extractor for `open`/`close` starting at the first `open` after `marker`. */
function extractBalanced(
  source: string,
  marker: string,
  open: string,
  close: string
): string {
  const markerIdx = source.indexOf(marker)
  if (markerIdx === -1) {
    throw new Error(`marker not found: ${marker}`)
  }
  // A marker that already ends in `open` (e.g. `foo(`) owns that bracket.
  const from = marker.endsWith(open)
    ? markerIdx + marker.length - 1
    : markerIdx + marker.length
  const start = source.indexOf(open, from)
  let depth = 0
  let i = start
  for (; i < source.length; i++) {
    if (source[i] === open) depth++
    else if (source[i] === close) {
      depth--
      if (depth === 0) break
    }
  }
  return source.slice(start, i + 1)
}

const SEED = 'isFrameless: await window.api.isFrameless()'
const SUBSCRIBE = 'window.api.handleFramelessChanged('

/** Describe A: the list of GlobalState wiring rules the source violates (empty = wired). */
function globalStateWiringViolations(strippedSource: string): string[] {
  const violations: string[] = []

  let didMount: string
  try {
    didMount = extractBalanced(
      strippedSource,
      'async componentDidMount()',
      '{',
      '}'
    )
  } catch {
    return ['componentDidMount block present']
  }

  const seedIdx = didMount.indexOf(SEED)
  if (seedIdx === -1) {
    violations.push('A1: the mount-time isFrameless seed is still present')
  }

  const callIdx = didMount.indexOf(SUBSCRIBE)
  if (callIdx === -1) {
    violations.push(
      'A2: componentDidMount subscribes to handleFramelessChanged'
    )
  } else {
    if (seedIdx !== -1 && callIdx <= seedIdx) {
      violations.push('A2: the subscription sits after the mount-time seed')
    }

    const call = extractBalanced(didMount, SUBSCRIBE, '(', ')')
    const arrow = call.match(
      /^\(\s*\(\s*([A-Za-z_$][\w$]*)\s*(?::\s*boolean)?\s*\)\s*=>([\s\S]*)\)$/
    )
    if (!arrow) {
      violations.push(
        'A3: the subscription argument is an arrow function with one parameter'
      )
    } else {
      const param = arrow[1]
      const body = arrow[2]
      const escaped = param.replace(/\$/g, '\\$')
      const assigned = new RegExp(
        `this\\.setState\\(\\s*\\{\\s*isFrameless\\s*:\\s*${escaped}\\s*\\}`
      )
      const shorthand = /this\.setState\(\s*\{\s*isFrameless\s*\}/
      const writes =
        assigned.test(body) || (param === 'isFrameless' && shorthand.test(body))
      if (!writes) {
        violations.push(
          'A3: the handler writes the pushed value into state.isFrameless'
        )
      }
    }
  }

  try {
    const provider = extractBalanced(
      strippedSource,
      '<ContextProvider.Provider',
      '{',
      '}'
    )
    if (!/\.\.\.this\.state/.test(provider)) {
      violations.push('A4: the Provider value spreads ...this.state')
    }
  } catch {
    violations.push('A4: ContextProvider.Provider value present')
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

  const destructure = root.match(
    /const\s*\{([^}]*)\}\s*=\s*useContext\(ContextProvider\)/
  )
  if (!destructure) {
    throw new Error('Root does not destructure useContext(ContextProvider)')
  }
  const contextNames = destructure[1]
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

  const isMacLine = root.match(/const isMac = ([^\n]*)/)
  const macLiteral = isMacLine?.[1].match(/platform === '([^']+)'/)?.[1]
  if (!macLiteral) {
    throw new Error('const isMac is not a platform === literal comparison')
  }

  const gateLine = root.match(/const showOverlayControls = ([^\n]*)/)
  if (!gateLine) {
    throw new Error('const showOverlayControls not found')
  }
  const conjuncts = parseConjuncts(gateLine[1])

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

describe('GlobalState.tsx -- isFrameless follows the frameless push (261102-dma)', () => {
  const stripped = stripSourceComments(readFileSync(globalStatePath, 'utf-8'))

  it('A: the real source seeds once, then subscribes and writes the pushed value into state', () => {
    expect(globalStateWiringViolations(stripped)).toEqual([])
  })
})

describe('App.tsx -- the WindowControls gate across the frameless flip (261102-dma)', () => {
  const gate = readAppGate(stripSourceComments(readFileSync(appPath, 'utf-8')))

  it('B1: Root reads isFrameless from the context GlobalState provides', () => {
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
  const wiredDidMount = [
    'class GlobalState {',
    '  async componentDidMount() {',
    '    this.setState({',
    '      isFullscreen: await window.api.isFullscreen(),',
    `      ${SEED}`,
    '    })',
    '    window.api.handleFullscreen((e, isFullscreen) => {',
    '      this.setState({ isFullscreen })',
    '    })',
    '    window.api.handleFramelessChanged((isFrameless: boolean) =>',
    '      this.setState({ isFrameless })',
    '    )',
    '  }',
    '  render() {',
    '    return (',
    '      <ContextProvider.Provider value={{ ...this.state, other: 1 }}>',
    '      </ContextProvider.Provider>',
    '    )',
    '  }',
    '}'
  ].join('\n')

  it('positive control: a correctly wired fixture has no violations', () => {
    expect(globalStateWiringViolations(wiredDidMount)).toEqual([])
  })

  it('S1: the pre-fix componentDidMount (seed and handleFullscreen only) convicts A2', () => {
    const preFix = wiredDidMount.replace(
      /\n {4}window\.api\.handleFramelessChanged\([\s\S]*?\n {4}\)\n/,
      '\n'
    )
    expect(preFix).not.toContain(SUBSCRIBE)
    expect(globalStateWiringViolations(preFix)).toEqual(
      expect.arrayContaining([
        'A2: componentDidMount subscribes to handleFramelessChanged'
      ])
    )
  })

  it('S2: a subscription placed BEFORE the seed convicts A2', () => {
    const before = [
      'class GlobalState {',
      '  async componentDidMount() {',
      '    window.api.handleFramelessChanged((isFrameless: boolean) =>',
      '      this.setState({ isFrameless })',
      '    )',
      '    this.setState({',
      `      ${SEED}`,
      '    })',
      '  }',
      '  render() {',
      '    return <ContextProvider.Provider value={{ ...this.state }} />',
      '  }',
      '}'
    ].join('\n')
    expect(globalStateWiringViolations(before)).toEqual(
      expect.arrayContaining([
        'A2: the subscription sits after the mount-time seed'
      ])
    )
  })

  it('S3: a handler that writes a constant instead of the pushed value convicts A3', () => {
    const constant = wiredDidMount.replace(
      'this.setState({ isFrameless })\n    )',
      'this.setState({ isFrameless: true })\n    )'
    )
    expect(constant).not.toBe(wiredDidMount)
    expect(globalStateWiringViolations(constant)).toEqual(
      expect.arrayContaining([
        'A3: the handler writes the pushed value into state.isFrameless'
      ])
    )
  })

  it('S4: a Provider value without ...this.state convicts A4', () => {
    const noSpread = wiredDidMount.replace('...this.state, ', '')
    expect(noSpread).not.toBe(wiredDidMount)
    expect(globalStateWiringViolations(noSpread)).toEqual(
      expect.arrayContaining(['A4: the Provider value spreads ...this.state'])
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
