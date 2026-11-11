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
    'index.ts'
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
