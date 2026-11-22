import { mkdtempSync, readFileSync } from 'graceful-fs'
import { tmpdir } from 'os'
import { join } from 'path'
import GameLibStore from '../store_backend'
import { createTestStoreRoot } from '../testUtils/testStoreRoot'

type Data = Record<string, unknown>

/**
 * The facade's accessors over its mirror cell (A6; every store is a mirror since 85-21, D-03). Each
 * case gets a fresh user-data directory and a test root whose in-process disk sink stands in for
 * the shell, so what reaches disk is what the shell would write. The shell's version envelope
 * (`__internal__`) is not a store value and is left out of the comparisons.
 */
function freshStore(): GameLibStore<Data> {
  const root = createTestStoreRoot(mkdtempSync(join(tmpdir(), 'gl68-acc-')))
  return new GameLibStore<Data>({
    root,
    cwd: 'store',
    name: 'download-manager'
  })
}

function disk(path: string): Data {
  const { __internal__: _envelope, ...rest } = JSON.parse(
    readFileSync(path, 'utf-8')
  ) as Data
  return rest
}

describe('GameLibStore accessor overrides (A6)', () => {
  test('set persists and get reads', () => {
    const s = freshStore()
    s.set('k', 1)
    expect(disk(s.path).k).toBe(1)
    expect(s.get('k')).toBe(1)
  })

  test('delete, clear and store replacement persist', () => {
    const s = freshStore()
    s.set('k', 1)
    s.set('j', 2)
    s.delete('k')
    expect(disk(s.path)).toEqual({ j: 2 })
    s.clear()
    expect(disk(s.path)).toEqual({})
    s.store = { a: 1 }
    expect(disk(s.path)).toEqual({ a: 1 })
  })

  test('a subclass setter observes a store replacement', () => {
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
    const root = createTestStoreRoot(mkdtempSync(join(tmpdir(), 'gl68-acc-')))
    const p = new Probe({ root, cwd: 'store', name: 'download-manager' })
    p.store = { a: 1 }
    expect(calls).toBe(1)
    expect(disk(p.path)).toEqual({ a: 1 })
  })

  test('Symbol.iterator yields persisted entries', () => {
    const s = freshStore()
    s.set('k', 1)
    expect(new Map(s)).toEqual(new Map([['k', 1]]))
  })
})
