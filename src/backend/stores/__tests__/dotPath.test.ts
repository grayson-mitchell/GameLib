/**
 * dot-prop 6 semantics in TS (Phase 85 plan 11, FND-06): the mirror's dot paths replay the same
 * oracle vectors `gamelib-store`'s `dotpath.rs` passes (`tests/vectors.rs`): every `dotpath.json`
 * case and every `keyorder.json` case. The vectors are the contract; neither side reads the other's
 * code. Each case runs twice: through `dotPath.ts` directly, and through the production owner of a
 * local write (a `MirrorCell`, and for the `store` key-order cases a real `GameLibStore` over the
 * tracer store), because that is the view the sidecar's readers see.
 */
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import GameLibStore from '../../store_backend'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'
import { deletePath, getPath, hasPath, segments, setPath } from '../dotPath'
import { MirrorCell } from '../mirrorCell'
import type { StoreFrame } from '../storeFrames'

const VECTORS = resolve(
  __dirname,
  '../../../../src-tauri/crates/gamelib-store/tests/fixtures/vectors'
)

interface DotPathCase {
  name: string
  initial: Record<string, unknown>
  op: 'get' | 'set' | 'has' | 'delete'
  path: string
  value?: unknown
  valueUndefined?: boolean
  dotNotation: boolean
  result: { found?: boolean; value?: unknown; done?: boolean; has?: boolean }
  after: Record<string, unknown>
}

interface KeyOrderStep {
  op: 'set' | 'delete' | 'assign'
  path?: string
  value?: unknown
  valueText?: string
}

interface KeyOrderCase {
  name: string
  via: 'object' | 'store'
  steps: KeyOrderStep[]
  stringified: string
}

const load = <T>(file: string): T =>
  JSON.parse(readFileSync(join(VECTORS, file), 'utf8')) as T

const dotCases = load<DotPathCase[]>('dotpath.json')
const orderCases = load<KeyOrderCase[]>('keyorder.json')

/** The text conf wrote for a store: tab-indented JSON. */
const stringify = (value: unknown): string =>
  JSON.stringify(value, undefined, '\t')

const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value)) as V

/** The two rules conf applies in front of dot-prop: an undefined value and `__internal__.` throw. */
const confRefuses = (c: DotPathCase): boolean =>
  c.valueUndefined === true ||
  (c.dotNotation && c.path.startsWith('__internal__.'))

describe('the shared vectors cannot pass vacuously', () => {
  it('replays at least the vectors the Rust side requires', () => {
    expect(dotCases.length).toBeGreaterThanOrEqual(30)
    expect(orderCases.length).toBeGreaterThanOrEqual(10)
    const dotted = orderCases
      .filter((c) => c.via === 'store')
      .flatMap((c) => c.steps)
      .filter((s) => s.path?.includes('.'))
    expect(dotted.length).toBeGreaterThanOrEqual(3)
  })
})

describe('dotpath.json through dotPath.ts', () => {
  it.each(dotCases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const doc = clone(c.initial)
    switch (c.op) {
      case 'get': {
        const got = getPath(doc, c.path, c.dotNotation)
        expect(got !== undefined).toBe(c.result.found)
        if (c.result.found) expect(got).toEqual(c.result.value)
        break
      }
      case 'has':
        expect(hasPath(doc, c.path, c.dotNotation)).toBe(c.result.has)
        break
      case 'set':
        if (!confRefuses(c)) setPath(doc, c.path, c.value, c.dotNotation)
        break
      case 'delete':
        deletePath(doc, c.path, c.dotNotation)
        break
    }
    // Compared as text: key order and an own `__proto__` key both show in it.
    expect(stringify(doc)).toBe(stringify(c.after))
  })
})

describe('dotpath.json through a MirrorCell (dot notation on)', () => {
  const cellOf = (initial: Record<string, unknown>) => {
    const frames: StoreFrame[] = []
    let seq = 0
    const cell = new MirrorCell({
      path: '/unused/by/a/startEmpty/cell.json',
      storeKey: 'store_cache/wikigameinfo',
      dotPaths: true,
      readOnly: false,
      startEmpty: true,
      sink: { send: (f) => void frames.push(f) },
      nextSeq: () => ++seq
    })
    cell.replace(initial)
    return cell
  }

  it.each(
    dotCases.filter((c) => c.dotNotation).map((c) => [c.name, c] as const)
  )('%s', (_name, c) => {
    const cell = cellOf(clone(c.initial))
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      switch (c.op) {
        case 'get': {
          const got = cell.get(c.path)
          expect(got !== undefined).toBe(c.result.found)
          if (c.result.found) expect(got).toEqual(c.result.value)
          break
        }
        case 'has':
          expect(cell.has(c.path)).toBe(c.result.has)
          break
        case 'set':
          if (c.valueUndefined) {
            expect(() => cell.set(c.path, undefined)).toThrow(TypeError)
          } else {
            cell.set(c.path, c.value)
          }
          break
        case 'delete':
          cell.delete(c.path)
          break
      }
      // conf accepts a path with an empty segment; the frame contract (shared with the shell,
      // `key-path` in storeFrameVectors.json) refuses it, so the mirror changes nothing for it.
      const refusedByFrame =
        c.op === 'set' && c.path.split('.').some((part) => part === '')
      expect(stringify(cell.data)).toBe(
        stringify(refusedByFrame ? c.initial : c.after)
      )
    } finally {
      jest.restoreAllMocks()
    }
  })
})

/** A step's value: inline JSON, or text a JS engine parses (so its key order is the engine's). */
const valueOf = (step: KeyOrderStep): unknown =>
  step.valueText === undefined ? step.value : JSON.parse(step.valueText)

describe('keyorder.json', () => {
  const apply = (
    root: Record<string, unknown>,
    via: KeyOrderCase['via'],
    step: KeyOrderStep
  ): Record<string, unknown> => {
    if (step.op === 'assign') return JSON.parse(step.valueText as string)
    const value = valueOf(step)
    const path = step.path as string
    if (via === 'store') {
      if (step.op === 'set') setPath(root, path, value, true)
      else deletePath(root, path, true)
    } else if (step.op === 'set') {
      root[path] = value
    } else {
      delete root[path]
    }
    return root
  }

  it.each(orderCases.map((c) => [c.name, c] as const))(
    '%s through dotPath.ts',
    (_name, c) => {
      let root: Record<string, unknown> = {}
      for (const step of c.steps) root = apply(root, c.via, step)
      expect(stringify(root)).toBe(c.stringified)
    }
  )

  describe('the dotted store cases through a GameLibStore over the tracer store', () => {
    let userData: string
    beforeEach(() => {
      userData = mkdtempSync(join(tmpdir(), 'gamelib-dotpath-'))
    })
    afterEach(() => {
      rmSync(userData, { recursive: true, force: true })
    })

    it.each(
      orderCases
        .filter((c) => c.via === 'store')
        .map((c) => [c.name, c] as const)
    )('%s', (_name, c) => {
      const frames: StoreFrame[] = []
      const store = new GameLibStore({
        root: createTestStoreRoot(userData, {
          frameSink: { send: (f) => void frames.push(f) }
        }),
        cwd: 'store_cache',
        name: 'wikigameinfo',
        declaration: { kind: 'cache' }
      })
      for (const step of c.steps) {
        if (step.op === 'assign') {
          store.store = JSON.parse(step.valueText as string)
        } else if (step.op === 'set') {
          store.set(step.path as string, valueOf(step))
        } else {
          store.delete(step.path as string)
        }
      }
      expect(stringify(store.store)).toBe(c.stringified)
      // One frame per step: what the shell's writer is handed is exactly what the view applied.
      expect(frames).toHaveLength(c.steps.length)
    })
  })
})

describe('segments', () => {
  it('splits on dots, honours backslash-escaped dots and refuses the prototype segments', () => {
    expect(segments('a.b.c', true)).toEqual(['a', 'b', 'c'])
    expect(segments('a\\.b', true)).toEqual(['a.b'])
    expect(segments('a\\.b.c', true)).toEqual(['a.b', 'c'])
    expect(segments('', true)).toEqual([''])
    expect(segments('a.', true)).toEqual(['a', ''])
    expect(segments('a\\', true)).toEqual(['a\\'])
    for (const p of [
      '__proto__',
      'a.__proto__.x',
      'prototype.x',
      'x.constructor'
    ]) {
      expect(segments(p, true)).toBeNull()
    }
    expect(segments('protos.constructors.prototype_', true)).not.toBeNull()
    expect(segments('a.b', false)).toEqual(['a.b'])
  })

  it('a refused path changes nothing and never reaches Object.prototype', () => {
    const doc: Record<string, unknown> = { keep: 1 }
    expect(setPath(doc, '__proto__.polluted', true, true)).toBe(false)
    expect(setPath(doc, 'a.constructor.prototype.polluted', true, true)).toBe(
      false
    )
    expect(deletePath(doc, 'constructor.x', true)).toBe(false)
    expect(getPath(doc, '__proto__', true)).toBeUndefined()
    expect(hasPath(doc, 'prototype', true)).toBe(false)
    expect(stringify(doc)).toBe(stringify({ keep: 1 }))
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('an own `__proto__` key with dot notation off is an ordinary key, not a prototype write', () => {
    const doc: Record<string, unknown> = {}
    expect(setPath(doc, '__proto__', { x: 1 }, false)).toBe(true)
    expect(Object.getPrototypeOf(doc)).toBe(Object.prototype)
    expect(Object.keys(doc)).toEqual(['__proto__'])
    expect(getPath(doc, '__proto__', false)).toEqual({ x: 1 })
  })

  it('does not read inherited properties', () => {
    expect(getPath({}, 'toString', true)).toBeUndefined()
    expect(hasPath({ a: {} }, 'a.hasOwnProperty', true)).toBe(false)
  })
})
