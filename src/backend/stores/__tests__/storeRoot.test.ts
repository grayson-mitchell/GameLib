import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import GameLibStore, { translateStoreOptions } from '../../store_backend'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'
import { createStoreRoot, readStoreBootEnv } from '../storeRoot'

describe('createStoreRoot', () => {
  let dirA: string
  let dirB: string
  beforeEach(() => {
    dirA = mkdtempSync(join(tmpdir(), 'gamelib-root-a-'))
    dirB = mkdtempSync(join(tmpdir(), 'gamelib-root-b-'))
  })
  afterEach(() => {
    rmSync(dirA, { recursive: true, force: true })
    rmSync(dirB, { recursive: true, force: true })
  })

  // Same-path instances on one root share the root's mirror cell (85-21: every store is a mirror,
  // D-03). The test roots carry the in-process disk sink that stands in for the shell.
  it('two roots never share a store file, even for the same name', () => {
    const a = createTestStoreRoot(dirA)
    const b = createTestStoreRoot(dirB)
    const opts = { cwd: 'store', name: 'download-manager' }
    const storeA = new GameLibStore({ root: a, ...opts })
    const storeB = new GameLibStore({ root: b, ...opts })
    storeA.set('k', 'from-a')
    expect(storeA.get('k')).toBe('from-a')
    expect(storeB.get('k')).toBeUndefined()
  })

  it("two stores on one root and one resolved path see each other's writes", () => {
    const root = createTestStoreRoot(dirA)
    const opts = { cwd: 'store', name: 'download-manager' }
    const first = new GameLibStore({ root, ...opts })
    const second = new GameLibStore({ root, ...opts })
    first.set('k', 'v')
    expect(second.get('k')).toBe('v')
    second.delete('k')
    expect(first.has('k')).toBe(false)
  })

  it('refuses a store the shell does not own, and a write on a root with no frame sink', () => {
    const root = createTestStoreRoot(dirA)
    // No table row, and the excluded store/migrations (D-07): nobody writes those files.
    expect(
      () => new GameLibStore({ root, cwd: 'store', name: 'not-a-store' })
    ).toThrow(/not a store the shell owns/)
    expect(
      () => new GameLibStore({ root, cwd: 'store', name: 'migrations' })
    ).toThrow(/not a store the shell owns/)
    const sinkless = new GameLibStore({
      root: createStoreRoot({ userData: dirB }),
      cwd: 'store',
      name: 'download-manager'
    })
    expect(() => sinkless.set('k', 1)).toThrow(/without a frame sink/)
  })

  describe('changes channel', () => {
    it('is a no-op until bound, then forwards the payload', () => {
      const { changes } = createStoreRoot({ userData: dirA })
      const push = jest.fn()
      expect(changes.isBound()).toBe(false)
      changes.notify({ store: 's', key: 'k', value: 1 })
      expect(push).not.toHaveBeenCalled()
      changes.bind(push)
      expect(changes.isBound()).toBe(true)
      changes.notify({ store: 's', key: 'k', value: 1 })
      expect(push).toHaveBeenCalledWith({ store: 's', key: 'k', value: 1 })
    })

    it('does not share a binding between roots', () => {
      const a = createStoreRoot({ userData: dirA })
      const b = createStoreRoot({ userData: dirB })
      const push = jest.fn()
      a.changes.bind(push)
      b.changes.notify({ store: 's', key: 'k', value: 1 })
      expect(push).not.toHaveBeenCalled()
    })

    it('invalidate pushes a whole-store payload', () => {
      const { changes } = createStoreRoot({ userData: dirA })
      const push = jest.fn()
      changes.bind(push)
      changes.invalidate('gog_library')
      expect(push).toHaveBeenCalledWith({
        store: 'gog_library',
        key: '',
        invalidated: true
      })
    })

    it('a throwing push never propagates', () => {
      const { changes } = createStoreRoot({ userData: dirA })
      changes.bind(() => {
        throw new Error('transport is down')
      })
      expect(() =>
        changes.notify({ store: 's', key: 'k', value: 1 })
      ).not.toThrow()
    })

    it('withSuppressed silences nested notifications and restores depth after a throw', () => {
      const { changes } = createStoreRoot({ userData: dirA })
      const push = jest.fn()
      changes.bind(push)
      changes.withSuppressed(() => {
        changes.withSuppressed(() =>
          changes.notify({ store: 's', key: 'a', value: 1 })
        )
        changes.notify({ store: 's', key: 'b', value: 2 })
      })
      expect(push).not.toHaveBeenCalled()
      expect(() =>
        changes.withSuppressed(() => {
          throw new Error('disk full')
        })
      ).toThrow('disk full')
      changes.notify({ store: 's', key: 'c', value: 3 })
      expect(push).toHaveBeenCalledTimes(1)
    })
  })

  describe('WR-11 containment', () => {
    it('refuses a store name that escapes its cwd', () => {
      const root = createStoreRoot({ userData: dirA })
      expect(() =>
        translateStoreOptions({ cwd: 'store_cache', name: '../../evil' }, root)
      ).toThrow(/outside/)
    })

    it('resolves a relative cwd under root.userData and keeps an absolute one', () => {
      const root = createStoreRoot({ userData: dirA })
      expect(translateStoreOptions({ cwd: 'store', name: 'x' }, root).cwd).toBe(
        join(dirA, 'store')
      )
      const abs = join(dirA, 'store')
      expect(translateStoreOptions({ cwd: abs, name: 'x' }, root).cwd).toBe(abs)
    })
  })
})

// Moved here with `readStoreBootEnv` from the deleted storeOwnership module (85-21).
describe('readStoreBootEnv', () => {
  let stderr: jest.SpiedFunction<typeof process.stderr.write>
  beforeEach(() => {
    stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })
  const logged = () => stderr.mock.calls.map((c) => String(c[0])).join('')
  const parse = (value: unknown) =>
    readStoreBootEnv({ GAMELIB_STORE_BOOT: JSON.stringify(value) })

  it('is empty, silently, when the shell reported nothing', () => {
    for (const env of [
      {},
      { GAMELIB_STORE_BOOT: undefined },
      { GAMELIB_STORE_BOOT: '' }
    ]) {
      const boot = readStoreBootEnv(env)
      expect(boot.readOnly.size).toBe(0)
      expect(boot.startEmpty.size).toBe(0)
    }
    expect(stderr).not.toHaveBeenCalled()
  })

  it('reads the read-only stores with their reasons and the stores that start empty', () => {
    const boot = parse({
      readOnly: [
        { store: 'store/config', reason: 'newer' },
        { store: 'steam_store/config', reason: 'failed' }
      ],
      startEmpty: ['store_cache/steam_metadata']
    })
    expect([...boot.readOnly]).toEqual([
      ['store/config', 'newer'],
      ['steam_store/config', 'failed']
    ])
    expect([...boot.startEmpty]).toEqual(['store_cache/steam_metadata'])
    expect(stderr).not.toHaveBeenCalled()
  })

  it('skips entries of the wrong shape or with an unknown reason, keeping the good ones', () => {
    const boot = parse({
      readOnly: [
        null,
        'store/config',
        { store: 4, reason: 'newer' },
        { store: 'store/config', reason: 'whatever' },
        { store: 'store/config' },
        { store: 'gog_store/config', reason: 'newer' }
      ],
      startEmpty: [1, null, 'store_cache/umu']
    })
    expect([...boot.readOnly]).toEqual([['gog_store/config', 'newer']])
    expect([...boot.startEmpty]).toEqual(['store_cache/umu'])
  })

  it('returns no entries and writes one line for malformed input, never echoing it', () => {
    for (const text of ['{nope TOKEN-VALUE', '[1,2]', '"text"', '4', 'null']) {
      const boot = readStoreBootEnv({ GAMELIB_STORE_BOOT: text })
      expect(boot.readOnly.size).toBe(0)
      expect(boot.startEmpty.size).toBe(0)
    }
    expect(stderr).toHaveBeenCalledTimes(5)
    expect(logged()).not.toContain('TOKEN-VALUE')
  })

  it('surfaces the truncated marker, and only a literal true', () => {
    expect(
      parse({ readOnly: [], startEmpty: [], truncated: true }).truncated
    ).toBe(true)
    for (const truncated of [false, 'true', 1, null]) {
      expect(parse({ readOnly: [], startEmpty: [], truncated }).truncated).toBe(
        undefined
      )
    }
    expect(parse({ readOnly: [], startEmpty: [] }).truncated).toBeUndefined()
  })

  it('ignores fields it does not know and a non-array readOnly or startEmpty', () => {
    const boot = parse({ readOnly: 'store/config', startEmpty: {}, extra: 1 })
    expect(boot.readOnly.size).toBe(0)
    expect(boot.startEmpty.size).toBe(0)
    expect(stderr).not.toHaveBeenCalled()
  })
})
