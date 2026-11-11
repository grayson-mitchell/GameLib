import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import FileStore from '../../sidecar/fileStore'
import { translateStoreOptions } from '../../store_backend'
import { createStoreRoot } from '../storeRoot'

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

  it('two roots never share a file cell, even for the same name', () => {
    const a = createStoreRoot({ userData: dirA })
    const b = createStoreRoot({ userData: dirB })
    const storeA = new FileStore({ root: a, cwd: 'store', name: 'same' })
    const storeB = new FileStore({ root: b, cwd: 'store', name: 'same' })
    storeA.set('k', 'from-a')
    expect(storeA.get('k')).toBe('from-a')
    expect(storeB.get('k')).toBeUndefined()
  })

  it('two stores on one root and one resolved path share one cell', () => {
    const root = createStoreRoot({ userData: dirA })
    const first = new FileStore({ root, cwd: 'store', name: 'shared' })
    const second = new FileStore({ root, cwd: 'store', name: 'shared' })
    first.set('k', 'v')
    expect(second.get('k')).toBe('v')
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
