import { mkdtempSync, readFileSync } from 'graceful-fs'
import { tmpdir } from 'os'
import { join } from 'path'
import GameLibStore from '../store_backend'
import { createTestStoreRoot } from '../testUtils/testStoreRoot'

const root = createTestStoreRoot()

type Data = Record<string, unknown>
const dir = () => mkdtempSync(join(tmpdir(), 'gl68-acc-'))
const disk = (p: string) => JSON.parse(readFileSync(p, 'utf-8'))

describe('GameLibStore accessor overrides (A6)', () => {
  test('set persists and get reads', () => {
    const s = new GameLibStore<Data>({ root, cwd: dir(), name: 'a6probe' })
    s.set('k', 1)
    expect(disk(s.path).k).toBe(1)
    expect(s.get('k')).toBe(1)
  })

  test('delete, clear and store replacement persist', () => {
    const s = new GameLibStore<Data>({ root, cwd: dir(), name: 'a6probe' })
    s.set('k', 1)
    s.set('j', 2)
    s.delete('k')
    expect(disk(s.path)).toEqual({ j: 2 })
    s.clear()
    expect(disk(s.path)).toEqual({})
    s.store = { a: 1 }
    expect(disk(s.path)).toEqual({ a: 1 })
  })

  test('a subclass setter observes a store replacement, and constructor-time defaults still reach disk', () => {
    // Phase 85 made GameLibStore a facade over its owner, so conf's constructor-time defaults
    // merge runs inside the conf-backed owner (its read-only guard being live during that merge is
    // storeBackendVersioning's case). What a subclass of the facade can observe is its own
    // replacement of the store.
    let calls = 0
    class Probe extends GameLibStore<Data> {
      get store(): Data {
        return super.store
      }
      set store(v: Data) {
        calls++
        super.store = v
      }
    }
    const p = new Probe({
      root,
      cwd: dir(),
      name: 'a6probe',
      defaults: { seeded: true }
    })
    expect(disk(p.path).seeded).toBe(true)
    p.store = { a: 1 }
    expect(calls).toBe(1)
    expect(disk(p.path)).toEqual({ a: 1 })
  })

  test('Symbol.iterator yields persisted entries', () => {
    const s = new GameLibStore<Data>({ root, cwd: dir(), name: 'a6probe' })
    s.set('k', 1)
    expect(new Map(s)).toEqual(new Map([['k', 1]]))
  })
})
