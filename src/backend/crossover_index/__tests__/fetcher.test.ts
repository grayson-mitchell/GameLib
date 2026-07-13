import { gzipSync } from 'node:zlib'
import { readFileSync } from 'graceful-fs'

import { axiosClient } from 'backend/utils'
import { loadIndex, IndexDescriptor } from '../fetcher'
import { crossoverIndexStore } from '../electronStore'
import { crossoverIndexSchema, CrossoverIndex } from '../schema'

jest.mock('backend/logger')
jest.mock('electron-store')
jest.mock('graceful-fs', () => ({
  ...jest.requireActual('graceful-fs'),
  readFileSync: jest.fn()
}))

const mockedReadFileSync = readFileSync as jest.Mock

function makeEntries(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Game ${i}`,
    rating: (i % 5) + 1
  }))
}

function makeValidIndex(overrides: Partial<CrossoverIndex> = {}): CrossoverIndex {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    entries: makeEntries(1000),
    ...overrides
  }
}

function gzippedJson(payload: unknown): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(payload), 'utf-8'))
}

const descriptor: IndexDescriptor<CrossoverIndex> = {
  name: 'crossover-index-test',
  url: 'https://example.com/crossover-index.json.gz',
  bundledPath: 'crossover-index.json.gz',
  schema: crossoverIndexSchema,
  ttlMinutes: 60 * 24
}

describe('loadIndex', () => {
  beforeEach(() => {
    crossoverIndexStore.clear()
    jest.restoreAllMocks()
    mockedReadFileSync.mockReset()
  })

  test('returns a fresh cached payload without fetching when fetchedAt is within ttlMinutes', async () => {
    const cachedData = makeValidIndex()
    crossoverIndexStore.set(descriptor.name, {
      data: cachedData,
      fetchedAt: Date.now()
    })
    const getSpy = jest.spyOn(axiosClient, 'get')

    const result = await loadIndex(descriptor)

    expect(result).toEqual(cachedData)
    expect(getSpy).not.toHaveBeenCalled()
  })

  test('a successful fetch of a valid gzipped payload parses, passes safeParse, is stored, and is returned', async () => {
    const freshData = makeValidIndex()
    jest
      .spyOn(axiosClient, 'get')
      .mockResolvedValueOnce({ data: gzippedJson(freshData) })

    const result = await loadIndex(descriptor)

    expect(result).toEqual(freshData)
    const stored = crossoverIndexStore.get(descriptor.name) as {
      data: CrossoverIndex
      fetchedAt: number
    }
    expect(stored.data).toEqual(freshData)
  })

  test('a fetched payload FAILING safeParse is rejected: returns the LAST-GOOD cached payload and never overwrites it', async () => {
    const lastGood = makeValidIndex()
    crossoverIndexStore.set(descriptor.name, {
      data: lastGood,
      fetchedAt: Date.now() - 1000 * 60 * 60 * 25 // stale, past TTL
    })
    const invalidPayload = { version: 1, generatedAt: 'not-a-date', entries: [] }
    jest
      .spyOn(axiosClient, 'get')
      .mockResolvedValueOnce({ data: gzippedJson(invalidPayload) })

    const result = await loadIndex(descriptor)

    expect(result).toEqual(lastGood)
    const stored = crossoverIndexStore.get(descriptor.name) as {
      data: CrossoverIndex
      fetchedAt: number
    }
    expect(stored.data).toEqual(lastGood)
  })

  test('when there is no last-good AND safeParse fails, falls back to the bundled snapshot', async () => {
    const bundledData = makeValidIndex()
    mockedReadFileSync.mockReturnValueOnce(gzippedJson(bundledData))
    const invalidPayload = { version: 1, generatedAt: 'not-a-date', entries: [] }
    jest
      .spyOn(axiosClient, 'get')
      .mockResolvedValueOnce({ data: gzippedJson(invalidPayload) })

    const result = await loadIndex(descriptor)

    expect(result).toEqual(bundledData)
  })

  test('an ABSENT bundled snapshot (ENOENT) is tolerated as a normal cold-start: returns null, does not throw', async () => {
    mockedReadFileSync.mockImplementationOnce(() => {
      const err = new Error('ENOENT: no such file') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    })
    jest
      .spyOn(axiosClient, 'get')
      .mockRejectedValueOnce(new Error('network down'))

    const result = await loadIndex(descriptor)

    expect(result).toBeNull()
  })

  test('an OVERSIZED payload (axios rejects on maxContentLength) is caught: last-good kept, no throw', async () => {
    const lastGood = makeValidIndex()
    crossoverIndexStore.set(descriptor.name, {
      data: lastGood,
      fetchedAt: Date.now() - 1000 * 60 * 60 * 25
    })
    jest
      .spyOn(axiosClient, 'get')
      .mockRejectedValueOnce(new Error('maxContentLength size exceeded'))

    const result = await loadIndex(descriptor)

    expect(result).toEqual(lastGood)
  })

  test('a network/gunzip/JSON error is caught: last-good kept, no throw', async () => {
    const lastGood = makeValidIndex()
    crossoverIndexStore.set(descriptor.name, {
      data: lastGood,
      fetchedAt: Date.now() - 1000 * 60 * 60 * 25
    })
    jest
      .spyOn(axiosClient, 'get')
      .mockResolvedValueOnce({ data: Buffer.from('not gzipped data') })

    const result = await loadIndex(descriptor)

    expect(result).toEqual(lastGood)
  })
})
