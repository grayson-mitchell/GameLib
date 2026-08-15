/**
 * 34.13 review C-17 — a REPO-WIDE CENSUS gate, deliberately not file-scoped.
 *
 * The C-05 gate (`steamBottleSetupSeeding.test.ts`) pins the poll effect in
 * `SteamBottleSetup.tsx` and is structurally incapable of noticing the same
 * defect anywhere else. C-17 is exactly that: the identical shape survived in
 * `SteamClientSetup.tsx`, a file the same fix pass edited, mounted in the same
 * `App.tsx` block — and there the surviving poll dispatches a multi-gigabyte
 * install the user explicitly dismissed.
 *
 * THE HAZARD, stated as a property rather than a file:
 *
 *   A component that App.tsx mounts PERMANENTLY (self-closing, unconditional)
 *   never unmounts. `isOpen: false` only makes it `return null`. So React
 *   never runs an effect's cleanup on dismissal — the ONLY thing that can stop
 *   a `setInterval` is the effect re-running, which requires the dependency
 *   array to change. Store `close()` actions in this codebase are
 *   `set({ isOpen: false })` and touch nothing else, and zustand action
 *   identities are stable. Therefore: any `setInterval` inside such a
 *   component MUST have `isOpen` in its dependency array AND an early-return
 *   guard that tests it, or the timer outlives the surface for the life of the
 *   app.
 *
 * WHY A SOURCE-TEXT GATE: this repo's frontend jest project has no jsdom, so
 * importing any of these components fails at their `.scss` import before an
 * assertion can run (see `steamBottleSetupSeeding.test.ts`'s own header). The
 * census reads the real sources with `readFileSync` and strips comments, so
 * this file's own prose — which necessarily names `isOpen` and `setInterval` —
 * cannot satisfy a match.
 *
 * The census SUBJECT is derived from App.tsx at test time, not hardcoded: a
 * fourth permanently-mounted polling surface added later is enrolled
 * automatically.
 */
import { readFileSync, existsSync } from 'fs'
import { join, resolve as resolvePath } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

// __tests__ -> components -> GamePage -> Game -> screens -> frontend
const FRONTEND_ROOT = resolvePath(__dirname, '..', '..', '..', '..', '..')
const APP_TSX = join(FRONTEND_ROOT, 'App.tsx')

interface MountedComponent {
  name: string
  path: string
  stripped: string
}

/** Resolves a relative import specifier from App.tsx to a real file. */
function resolveImport(specifier: string): string | null {
  const base = resolvePath(FRONTEND_ROOT, specifier)
  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, 'index.tsx'),
    join(base, 'index.ts')
  ]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Every component App.tsx renders as a bare self-closing tag (i.e. mounted
 * unconditionally — no `{cond && <X />}` wrapper of its own) whose source we
 * can resolve through App.tsx's own import list.
 */
function censusPermanentlyMountedComponents(): MountedComponent[] {
  const appSource = readFileSync(APP_TSX, 'utf-8')
  const appStripped = stripSourceComments(appSource)

  const importedFrom = new Map<string, string>()
  const importRe = /import\s+(?:(\w+)|\{([^}]*)\})\s+from\s+'(\.[^']*)'/g
  let importMatch: RegExpExecArray | null
  while ((importMatch = importRe.exec(appStripped)) !== null) {
    const specifier = importMatch[3]
    const names = importMatch[1]
      ? [importMatch[1]]
      : (importMatch[2] ?? '').split(',').map(
          (n) =>
            n
              .trim()
              .split(/\s+as\s+/)
              .pop() ?? ''
        )
    for (const name of names) {
      if (name) importedFrom.set(name, specifier)
    }
  }

  const mounted = new Set<string>()
  const tagRe = /<([A-Z]\w*)\s*\/>/g
  let tagMatch: RegExpExecArray | null
  while ((tagMatch = tagRe.exec(appStripped)) !== null) {
    mounted.add(tagMatch[1])
  }

  const result: MountedComponent[] = []
  for (const name of mounted) {
    const specifier = importedFrom.get(name)
    if (!specifier) continue
    const path = resolveImport(specifier)
    if (!path) continue
    result.push({
      name,
      path,
      stripped: stripSourceComments(readFileSync(path, 'utf-8'))
    })
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Slices every `useEffect(...)` that contains `setInterval(` out of a
 * flattened source, bounded by its own dependency array so each obligation is
 * measured against THAT effect and not a neighbouring one.
 */
export function sliceIntervalEffects(source: string): string[] {
  const flattened = source.replace(/\s+/g, ' ')
  const effects: string[] = []
  let cursor = 0
  for (;;) {
    const marker = flattened.indexOf('setInterval(', cursor)
    if (marker === -1) break
    cursor = marker + 'setInterval('.length
    const start = flattened.lastIndexOf('useEffect(', marker)
    if (start === -1) continue
    const depsStart = flattened.indexOf('}, [', marker)
    if (depsStart === -1) continue
    const depsEnd = flattened.indexOf(']', depsStart)
    if (depsEnd === -1) continue
    effects.push(flattened.slice(start, depsEnd + 1))
    cursor = depsEnd
  }
  return effects
}

/** The dependency array of a sliced effect, e.g. `isOpen, phase, appName`. */
export function depsOf(effect: string): string {
  const match = effect.match(/\}, \[([^\]]*)\]$/)
  if (!match) {
    throw new Error(`depsOf: could not find a dependency array in: ${effect}`)
  }
  return match[1]
}

/**
 * 34.13 review C-19. Slices every `void window.api…` promise chain out of a
 * flattened source by balanced-paren scan, following `.then(…)/.catch(…)`
 * continuations, so each chain is measured whole. A bare `void` silences
 * `no-floating-promises` while attaching NO rejection handler — under the
 * Tauri sidecar an unported or erroring channel REJECTS, so every one of these
 * is an unhandled rejection waiting on a transport this repo has ledgered as
 * failing repeatedly.
 */
export interface VoidApiChain {
  /** The whole chain text, for RED derivations. */
  text: string
  /**
   * The TOP-LEVEL continuation names only (`then`, `catch`, …). Crucial: a
   * `.catch(` nested inside a `.then(` callback belongs to a DIFFERENT promise
   * (in SteamClientSetup that is `installSteamGame(...).catch(...)`), and a
   * naive `text.includes('.catch(')` is satisfied by it — which would have let
   * the real C-19 poll defect pass. Only depth-0 continuations count.
   */
  continuations: string[]
}

export function sliceVoidApiChains(source: string): VoidApiChain[] {
  const flattened = source.replace(/\s+/g, ' ')
  const marker = 'void window.api'
  const chains: VoidApiChain[] = []
  let idx = flattened.indexOf(marker)
  while (idx !== -1) {
    let i = idx + marker.length
    let depth = 0
    const continuations: string[] = []
    for (; i < flattened.length; i++) {
      const ch = flattened[i]
      if (ch === '(') depth++
      else if (ch === ')') {
        depth--
        if (depth === 0) {
          let j = i + 1
          while (flattened[j] === ' ') j++
          if (flattened[j] === '.') {
            const name = /^\.(\w+)/.exec(flattened.slice(j))?.[1]
            if (name) continuations.push(name)
            i = j
            continue
          }
          break
        }
      }
    }
    chains.push({ text: flattened.slice(idx, i + 1), continuations })
    idx = flattened.indexOf(marker, i)
  }
  return chains
}

/**
 * 34.13 review C-19(a). Slices an `async` arrow handler's body by
 * balanced-brace scan so the try/catch obligation is measured against THAT
 * handler and not the file's other, correctly-guarded code.
 */
export function sliceAsyncHandler(source: string, name: string): string | null {
  const flattened = source.replace(/\s+/g, ' ')
  const start = flattened.indexOf(`const ${name} = async () => {`)
  if (start === -1) return null
  let depth = 0
  for (let i = flattened.indexOf('{', start); i < flattened.length; i++) {
    if (flattened[i] === '{') depth++
    else if (flattened[i] === '}') {
      depth--
      if (depth === 0) return flattened.slice(start, i + 1)
    }
  }
  return null
}

const census = censusPermanentlyMountedComponents()
const pollingSurfaces = census.filter((c) =>
  c.stripped.includes('setInterval(')
)
const apiChainSurfaces = census.filter(
  (c) => sliceVoidApiChains(c.stripped).length > 0
)
const asyncConfirmSurfaces = census.filter(
  (c) => sliceAsyncHandler(c.stripped, 'handleConfirm') !== null
)

describe('C-17: permanently-mounted surfaces cannot outlive their own dismissal', () => {
  it('the census actually found the App.tsx mount block (non-vacuity)', () => {
    // If this ever drops to zero the whole file silently guards nothing.
    expect(census.length).toBeGreaterThan(5)
    expect(census.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'SteamBottleSetup',
        'SteamClientSetup',
        'SteamBridgeSetup'
      ])
    )
  })

  it('at least two polling surfaces are enrolled (non-vacuity)', () => {
    // C-05 fixed one of them and C-17 the other. A census that found only one
    // would pass every obligation below while guarding half the hazard.
    expect(pollingSurfaces.map((c) => c.name).sort()).toEqual([
      'SteamBottleSetup',
      'SteamClientSetup'
    ])
  })

  describe.each(pollingSurfaces.map((c) => [c.name, c] as const))(
    '%s',
    (name, component) => {
      const effects = sliceIntervalEffects(component.stripped)

      it('has at least one locatable setInterval effect', () => {
        expect(effects.length).toBeGreaterThan(0)
      })

      it.each(effects.map((e, i) => [i, e] as const))(
        'setInterval effect #%i keys on isOpen',
        (_i, effect) => {
          expect(
            depsOf(effect)
              .split(',')
              .map((d) => d.trim())
          ).toContain('isOpen')
        }
      )

      it.each(effects.map((e, i) => [i, e] as const))(
        'setInterval effect #%i early-returns (and clears) when the surface is closed',
        (_i, effect) => {
          expect(effect).toMatch(/if \(\s*!isOpen/)
        }
      )

      it(`RED: stripping isOpen from ${name}'s interval effect DERIVED FROM THE REAL SOURCE breaks both obligations`, () => {
        const knownBad = component.stripped
          .replace(/if \(!isOpen \|\| /g, 'if (')
          .replace(/\}, \[isOpen, /g, '}, [')
        expect(knownBad).not.toBe(component.stripped)
        const badEffects = sliceIntervalEffects(knownBad)
        expect(badEffects.length).toBe(effects.length)
        for (const effect of badEffects) {
          expect(
            depsOf(effect)
              .split(',')
              .map((d) => d.trim())
          ).not.toContain('isOpen')
          expect(effect).not.toMatch(/if \(\s*!isOpen/)
        }
      })
    }
  )
})

describe('C-19: no permanently-mounted surface floats an unhandled IPC rejection', () => {
  it('the chain census is non-vacuous', () => {
    // Both Steam setup surfaces use the `void window.api…` idiom; if this
    // drops to zero the obligations below are enrolled against nothing.
    expect(apiChainSurfaces.map((c) => c.name).sort()).toEqual([
      'SteamBottleSetup',
      'SteamClientSetup'
    ])
    expect(
      apiChainSurfaces.flatMap((c) => sliceVoidApiChains(c.stripped)).length
    ).toBe(5)
  })

  describe.each(apiChainSurfaces.map((c) => [c.name, c] as const))(
    '%s',
    (name, component) => {
      const chains = sliceVoidApiChains(component.stripped)

      it.each(chains.map((chain, i) => [i, chain] as const))(
        'void window.api chain #%i attaches a TOP-LEVEL rejection handler',
        (_i, chain) => {
          expect(chain.continuations).toContain('catch')
        }
      )

      it(`RED: deleting the top-level .catch handlers from ${name} DERIVED FROM THE REAL SOURCE breaks the obligation`, () => {
        // Derives the known-bad by balanced-scan removal of every top-level
        // `.catch(…)` from the REAL source — never a hand-written specimen.
        const knownBad = chains.reduce(
          (acc, chain) => acc.replace(chain.text, stripCatch(chain.text)),
          component.stripped.replace(/\s+/g, ' ')
        )
        expect(knownBad).not.toBe(component.stripped.replace(/\s+/g, ' '))
        for (const chain of sliceVoidApiChains(knownBad)) {
          expect(chain.continuations).not.toContain('catch')
        }
      })
    }
  )

  describe.each(asyncConfirmSurfaces.map((c) => [c.name, c] as const))(
    '%s handleConfirm',
    (name, component) => {
      const handler = sliceAsyncHandler(component.stripped, 'handleConfirm')!

      it('awaits its window.api call inside a try', () => {
        const tryIdx = handler.indexOf('try {')
        const awaitIdx = handler.indexOf('await window.api')
        expect(tryIdx).toBeGreaterThanOrEqual(0)
        expect(awaitIdx).toBeGreaterThan(tryIdx)
      })

      it('reaches a TERMINAL phase from the catch — a rejected START is a FAILED start', () => {
        const catchIdx = handler.indexOf('catch')
        expect(catchIdx).toBeGreaterThan(0)
        expect(handler.slice(catchIdx)).toContain("setPhase('error')")
      })

      it(`RED: removing the terminal setPhase from ${name}'s catch DERIVED FROM THE REAL SOURCE breaks the obligation`, () => {
        const catchIdx = handler.indexOf('catch')
        const knownBad =
          handler.slice(0, catchIdx) +
          handler.slice(catchIdx).replaceAll("setPhase('error')", '')
        expect(knownBad).not.toBe(handler)
        expect(knownBad.slice(catchIdx)).not.toContain("setPhase('error')")
      })
    }
  )
})

/** Removes every TOP-LEVEL `.catch(…)` continuation from a sliced chain, by
 * balanced scan — used to derive the C-19 known-bad from the real source.
 * Nested `.catch(` calls (e.g. `installSteamGame(...).catch(...)` inside a
 * `.then` body) are deliberately left alone: removing them would be a
 * different mutation than the one C-19 describes. */
function stripCatch(chain: string): string {
  let out = chain
  for (;;) {
    let depth = 0
    let at = -1
    for (let i = 0; i < out.length; i++) {
      if (out[i] === '(') depth++
      else if (out[i] === ')') depth--
      else if (depth === 0 && out.startsWith('.catch(', i)) {
        at = i
        break
      }
    }
    if (at === -1) return out
    let depth2 = 0
    let i = at + '.catch'.length
    for (; i < out.length; i++) {
      if (out[i] === '(') depth2++
      else if (out[i] === ')') {
        depth2--
        if (depth2 === 0) break
      }
    }
    out = out.slice(0, at) + out.slice(i + 1)
  }
}
