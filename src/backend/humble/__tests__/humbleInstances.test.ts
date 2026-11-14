/**
 * The Humble owners are per-boot instances, not module state (66.3-17, D-05, C-WR-2).
 *
 * Pure modules only: the fence and the seam slot need no mocks, and the source-shape checks read
 * the files with comments stripped. The behaviours that need the user and the library built over
 * fakes (single-flight, the reveal dedupe, generation invalidation discarding an in-flight sync,
 * one watch per user instance) are covered where those fakes already live: library.test.ts and
 * user.test.ts, which build a fresh instance per test.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { createHumbleSyncFence } from '../syncFence'
import { createHumbleActionIdCache } from '../actionIdCache'
import {
  createLoginWindowSeamSlot,
  type LoginWindowSeam
} from '../loginWindowSeam'

const fakeSeam = {} as LoginWindowSeam

describe('createHumbleSyncFence', () => {
  it('invalidate() changes current()', () => {
    const fence = createHumbleSyncFence()
    const before = fence.current()

    fence.invalidate()

    expect(fence.current()).not.toBe(before)
  })

  it('two instances are independent', () => {
    const a = createHumbleSyncFence()
    const b = createHumbleSyncFence()
    const bBefore = b.current()

    a.invalidate()
    a.invalidate()

    expect(b.current()).toBe(bBefore)
  })
})

describe('createHumbleActionIdCache (66.4-REVIEW CR-01)', () => {
  const entry = { id: 'a'.repeat(40), chunk: '/_next/static/chunks/x.js' }

  it('a fresh owner returns null for both slots', () => {
    const owner = createHumbleActionIdCache()

    expect(owner.get('library')).toBeNull()
    expect(owner.get('redeem')).toBeNull()
  })

  it('setting one slot leaves the other null', () => {
    const owner = createHumbleActionIdCache()

    owner.set('library', entry)

    expect(owner.get('library')).toEqual(entry)
    expect(owner.get('redeem')).toBeNull()
  })

  it('setting null clears a slot', () => {
    const owner = createHumbleActionIdCache()
    owner.set('redeem', entry)

    owner.set('redeem', null)

    expect(owner.get('redeem')).toBeNull()
  })

  it('two owners are independent', () => {
    const a = createHumbleActionIdCache()
    const b = createHumbleActionIdCache()

    a.set('library', entry)
    a.set('redeem', entry)

    expect(b.get('library')).toBeNull()
    expect(b.get('redeem')).toBeNull()
  })
})

describe('createLoginWindowSeamSlot', () => {
  it('get() is null and getOrThrow() throws before an install, with the wiring-bug message', () => {
    const slot = createLoginWindowSeamSlot()

    expect(slot.get()).toBeNull()
    expect(() => slot.getOrThrow()).toThrow(/no login-window seam is installed/)
    expect(() => slot.getOrThrow()).toThrow(/registerHumbleLoginFlows/)
  })

  it('install(seam) makes get() and getOrThrow() return it; install(null) clears it', () => {
    const slot = createLoginWindowSeamSlot()

    slot.install(fakeSeam)
    expect(slot.get()).toBe(fakeSeam)
    expect(slot.getOrThrow()).toBe(fakeSeam)

    slot.install(null)
    expect(slot.get()).toBeNull()
    expect(() => slot.getOrThrow()).toThrow()
  })

  it('two slots are independent', () => {
    const a = createLoginWindowSeamSlot()
    const b = createLoginWindowSeamSlot()

    a.install(fakeSeam)

    expect(b.get()).toBeNull()
  })
})

describe('the Humble owners reach zero module state (source shape)', () => {
  const FILES = [
    'user.ts',
    'library.ts',
    'classify.ts',
    'syncFence.ts',
    'loginWindowSeam.ts',
    'secretStore.ts',
    'index.ts',
    'adapter.ts',
    'actionIdCache.ts'
  ]

  it.each(FILES)(
    '%s has no top-level let, no top-level Set/Map and no static class member',
    (file) => {
      const stripped = stripSourceComments(
        readFileSync(join(__dirname, '..', file), 'utf-8')
      )
      const lines = stripped.split('\n')

      expect(lines.filter((l) => /^(export\s+)?let\s/.test(l))).toEqual([])
      expect(
        lines.filter((l) =>
          /^(export\s+)?const\s.*=\s*new\s+(Set|Map)\b/.test(l)
        )
      ).toEqual([])
      expect(lines.filter((l) => /^\s+(private\s+)?static\s/.test(l))).toEqual(
        []
      )
    }
  )

  it('the lookup arrays are frozen, not Sets (D-66.3-09)', () => {
    const classify = stripSourceComments(
      readFileSync(join(__dirname, '..', 'classify.ts'), 'utf-8')
    )
    const library = stripSourceComments(
      readFileSync(join(__dirname, '..', 'library.ts'), 'utf-8')
    )

    expect(classify).toMatch(
      /KNOWN_GAME_KEY_TYPES: readonly string\[\] =\s*Object\.freeze\(/
    )
    expect(classify).toMatch(/KNOWN_GAME_KEY_TYPES\.includes\(/)
    expect(library).toMatch(
      /REVEAL_OUTCOME_EVENTS: readonly string\[\] =\s*Object\.freeze\(/
    )
    expect(library).toMatch(/REVEAL_OUTCOME_EVENTS\.includes\(/)
  })

  it('createHumbleServices builds the one action-id owner per call, not at module scope (66.4-REVIEW CR-01)', () => {
    const index = stripSourceComments(
      readFileSync(join(__dirname, '..', 'index.ts'), 'utf-8')
    )
    const factoryStart = index.indexOf('export function createHumbleServices')
    expect(factoryStart).toBeGreaterThan(-1)

    expect(index.slice(0, factoryStart)).not.toMatch(
      /createHumbleActionIdCache\(\)/
    )
    expect(index.slice(factoryStart)).toMatch(
      /const actionIds = createHumbleActionIdCache\(\)/
    )
  })

  it('the single-flight and reveal-dedupe state live inside createHumbleLibrary, not at module scope', () => {
    const library = stripSourceComments(
      readFileSync(join(__dirname, '..', 'library.ts'), 'utf-8')
    )
    const factoryStart = library.indexOf('export function createHumbleLibrary')
    expect(factoryStart).toBeGreaterThan(-1)
    const beforeFactory = library.slice(0, factoryStart)
    const afterFactory = library.slice(factoryStart)

    expect(beforeFactory).not.toMatch(/syncInFlight|revealsInFlight/)
    expect(afterFactory).toMatch(/let syncInFlight/)
    expect(afterFactory).toMatch(/const revealsInFlight = new Set/)
  })
})
