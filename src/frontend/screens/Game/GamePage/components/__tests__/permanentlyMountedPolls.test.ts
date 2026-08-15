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

const census = censusPermanentlyMountedComponents()
const pollingSurfaces = census.filter((c) =>
  c.stripped.includes('setInterval(')
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
