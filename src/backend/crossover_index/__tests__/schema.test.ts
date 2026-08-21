import { crossoverIndexSchema, CrossoverIndex } from '../schema'

function makeEntries(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Game ${i}`,
    rating: (i % 5) + 1
  }))
}

function makeValidPayload() {
  return {
    version: 1 as const,
    generatedAt: new Date().toISOString(),
    entries: makeEntries(1000)
  }
}

describe('crossoverIndexSchema', () => {
  test('accepts a well-formed payload (version 1, ISO generatedAt, >=1000 entries)', () => {
    const payload = makeValidPayload()
    const result = crossoverIndexSchema.safeParse(payload)

    expect(result.success).toBe(true)
  })

  test('the CrossoverIndex type is inferred from the schema (a typed object parses)', () => {
    const payload: CrossoverIndex = makeValidPayload()
    const result = crossoverIndexSchema.safeParse(payload)

    expect(result.success).toBe(true)
  })

  test('rejects a rating of 0 (below the int 1..5 bound)', () => {
    const payload = makeValidPayload()
    payload.entries[0] = { name: 'Bad Rating', rating: 0 }

    const result = crossoverIndexSchema.safeParse(payload)

    expect(result.success).toBe(false)
  })

  test('rejects a rating of 6 (above the int 1..5 bound)', () => {
    const payload = makeValidPayload()
    payload.entries[0] = { name: 'Bad Rating', rating: 6 }

    const result = crossoverIndexSchema.safeParse(payload)

    expect(result.success).toBe(false)
  })

  test('rejects fewer than 1000 entries (truncated payload)', () => {
    const payload = { ...makeValidPayload(), entries: makeEntries(999) }

    const result = crossoverIndexSchema.safeParse(payload)

    expect(result.success).toBe(false)
  })

  test('rejects a payload missing `version`', () => {
    const payload = makeValidPayload() as Partial<
      ReturnType<typeof makeValidPayload>
    >
    delete payload.version

    const result = crossoverIndexSchema.safeParse(payload)

    expect(result.success).toBe(false)
  })

  test('rejects a payload with version !== 1', () => {
    const payload = { ...makeValidPayload(), version: 2 }

    const result = crossoverIndexSchema.safeParse(payload)

    expect(result.success).toBe(false)
  })

  test('rejects a non-object / garbage payload without throwing', () => {
    expect(() => crossoverIndexSchema.safeParse('not an object')).not.toThrow()
    expect(crossoverIndexSchema.safeParse('not an object').success).toBe(false)
    expect(crossoverIndexSchema.safeParse(null).success).toBe(false)
    expect(crossoverIndexSchema.safeParse(undefined).success).toBe(false)
    expect(crossoverIndexSchema.safeParse(42).success).toBe(false)
  })
})
