/**
 * The D-24 selection view against the shared vectors (87-42): every sequence of
 * `selection_registry.json`, the file Rust's registry replays in `golden_bottles.rs`, is replayed against the
 * view the way the sidecar drives it. The view holds only what Rust answered, so a `set` Rust refused (it answers
 * `false` and registers nothing) applies nothing here, a `set` it accepted applies the selection its reply
 * carries, and a `clear` is the clear shim's reply. Every `get` must then equal Rust's answer.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  engineSelectionView,
  registerEngineSelectionView
} from '../selectionView'
import type { EngineSelection } from 'common/types/engine'

interface Step {
  call: 'set' | 'get' | 'clear'
  key: string
  selection?: EngineSelection
}
interface Expected {
  call: 'set' | 'get' | 'clear'
  key: string
  returned: unknown
}
interface Sequence {
  id: string
  steps: Step[]
  expected: Expected[]
}

const VECTORS = join(
  __dirname,
  '../../../../src-tauri/crates/gamelib-engine/tests/fixtures/vectors/selection_registry.json'
)
const sequences = JSON.parse(readFileSync(VECTORS, 'utf8')) as Sequence[]

type Listener = (event: unknown, ...args: unknown[]) => void

describe('engineSelectionView', () => {
  beforeEach(() => engineSelectionView.reset())

  test('the vector file was read', () => {
    expect(sequences.length).toBeGreaterThanOrEqual(5)
    expect(sequences.every((s) => s.steps.length === s.expected.length)).toBe(
      true
    )
  })

  test.each(sequences.map((s) => [s.id, s] as const))(
    'replays %s the way Rust answers it',
    (_id, sequence) => {
      sequence.steps.forEach((step, index) => {
        const want = sequence.expected[index]
        if (!want) throw new Error('no expected answer')
        if (step.call === 'set') {
          // Rust accepted the selection (its reply carries it) or refused it (nothing is applied).
          if (want.returned === true && step.selection) {
            engineSelectionView.apply(step.key, step.selection)
          }
        } else if (step.call === 'clear') {
          engineSelectionView.clear(step.key)
        } else {
          expect(engineSelectionView.get(step.key) ?? null).toEqual(
            want.returned
          )
        }
      })
    }
  )

  test('apply with null drops the key and a later apply replaces it', () => {
    const sel: EngineSelection = {
      kind: 'crossover',
      reason: 'cx-healthy',
      crossoverBuild: null,
      binDir: '/b'
    }
    engineSelectionView.apply('620', sel)
    engineSelectionView.apply('620', { ...sel, binDir: '/c' })
    expect(engineSelectionView.get('620')).toEqual({ ...sel, binDir: '/c' })
    engineSelectionView.apply('620', null)
    expect(engineSelectionView.get('620')).toBeUndefined()
  })

  describe('the engineSelectionChanged frame', () => {
    const listeners = new Map<string, Listener>()
    const ipc = {
      on: (channel: string, listener: Listener) => {
        listeners.set(channel, listener)
        return ipc
      }
    } as unknown as Parameters<typeof registerEngineSelectionView>[0]

    beforeEach(() => {
      listeners.clear()
      registerEngineSelectionView(ipc)
    })

    test('registers one listener on the frame Rust sends', () => {
      expect([...listeners.keys()]).toEqual(['engineSelectionChanged'])
    })

    test('a frame Rust sends on its own applies and clears a selection', () => {
      const sel: EngineSelection = {
        kind: 'crossover',
        reason: 'override',
        crossoverBuild: '26.3',
        binDir: '/cx'
      }
      const hear = listeners.get('engineSelectionChanged')
      hear?.({}, { key: '620', selection: sel })
      expect(engineSelectionView.get('620')).toEqual(sel)
      hear?.({}, { key: '620', selection: null })
      expect(engineSelectionView.get('620')).toBeUndefined()
    })

    test('a malformed frame is dropped, not applied', () => {
      const hear = listeners.get('engineSelectionChanged')
      hear?.({}, { key: '620', selection: { kind: 'bogus' } })
      hear?.({}, { key: '', selection: null })
      hear?.({}, 'nonsense')
      hear?.({})
      expect(engineSelectionView.get('620')).toBeUndefined()
    })
  })
})
