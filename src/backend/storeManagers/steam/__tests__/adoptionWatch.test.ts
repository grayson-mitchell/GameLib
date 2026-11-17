/**
 * Phase 81 (D-07/D-10): the TS record store is the single writer and Rust keeps an in-memory watch
 * list fed from it. Driven through an in-memory store fake and a fake requestRustInvoke that records
 * channel and args; no module is mocked.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initHeadless } from 'backend/logger'
import {
  RUST_STEAMPOLL_ADOPTION_READ,
  RUST_STEAMPOLL_ADOPTION_UNWATCH,
  RUST_STEAMPOLL_ADOPTION_WATCH
} from 'common/types/sidecarTransport'
import {
  adoptionWatchArgs,
  clearAndUnwatchPendingAdoption,
  readSteamAdoption,
  recordAndWatchPendingAdoption,
  resumeAdoptionWatches,
  type AdoptionWatchDeps
} from '../adoptionWatch'
import {
  listPendingAdoptions,
  readPendingAdoption,
  type PendingAdoptionRecord
} from '../macSteamAdoption'

// The real logger needs a writer; HOME is redirected by the backend jest containment setup.
beforeAll(() => initHeadless())

interface Call {
  channel: string
  args: unknown[]
}

type Reply = (channel: string) => unknown

function makeDeps(
  options: {
    reply?: Reply
    installApp?: boolean
    seed?: Record<string, unknown>
  } = {}
): {
  deps: AdoptionWatchDeps
  calls: Call[]
  store: Map<string, unknown>
} {
  const calls: Call[] = []
  const store = new Map<string, unknown>(Object.entries(options.seed ?? {}))
  const storeFake = {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => {
      store.set(key, value)
    },
    delete: (key: string) => {
      store.delete(key)
    },
    entries: () => [...store.entries()]
  }
  const deps = {
    stores: { steam: { steamPendingAdoptionStore: storeFake } },
    config: {
      getSettings: () => ({
        steamExperimentalInstallApp: options.installApp === true
      })
    },
    requestRustInvoke: (channel: string, args: unknown[]) => {
      calls.push({ channel, args })
      if (options.reply) {
        const out = options.reply(channel)
        if (out instanceof Error) return Promise.reject(out)
        return Promise.resolve(out)
      }
      return Promise.resolve(true)
    }
  } as unknown as AdoptionWatchDeps
  return { deps, calls, store }
}

function record(manifestPath = '/steam/steamapps/appmanifest_112100.acf') {
  return {
    steamPid: 4242,
    manifestPath,
    baseline: { mtimeMs: 1000, content: '"AppState" {}' },
    recordedAt: 1_700_000_000_000
  } satisfies PendingAdoptionRecord
}

/** Lets the fire-and-forget unwatch settle. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('adoptionWatchArgs', () => {
  test('maps the record to the watch op arguments', () => {
    const r = record()
    expect(adoptionWatchArgs('112100', r, true)).toEqual({
      appId: '112100',
      manifestPath: r.manifestPath,
      baselineContent: r.baseline.content,
      recordedAtMs: r.recordedAt,
      steamPid: r.steamPid,
      installAppFallback: true
    })
  })
})

describe('recordAndWatchPendingAdoption', () => {
  test('writes the record, then invokes the watch with installAppFallback from the setting', async () => {
    const { deps, calls, store } = makeDeps({ installApp: false })
    const r = record()
    await recordAndWatchPendingAdoption(deps, '112100', r)
    expect(store.get('112100')).toEqual(r)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.channel).toBe(RUST_STEAMPOLL_ADOPTION_WATCH)
    expect(calls[0]?.args).toEqual([
      expect.objectContaining({
        appId: '112100',
        manifestPath: r.manifestPath,
        steamPid: 4242
      })
    ])
  })

  test('a rejected watch invoke is swallowed and the record stays (D-10)', async () => {
    const { deps, store } = makeDeps({ reply: () => new Error('timeout') })
    await expect(
      recordAndWatchPendingAdoption(deps, '112100', record())
    ).resolves.toBeUndefined()
    expect(store.has('112100')).toBe(true)
  })
})

describe('clearAndUnwatchPendingAdoption', () => {
  test('clears the record and invokes the unwatch', async () => {
    const { deps, calls, store } = makeDeps({
      seed: { '112100': record() }
    })
    clearAndUnwatchPendingAdoption(deps, '112100')
    await flush()
    expect(store.has('112100')).toBe(false)
    expect(calls).toEqual([
      { channel: RUST_STEAMPOLL_ADOPTION_UNWATCH, args: [{ appId: '112100' }] }
    ])
  })

  test('a rejected unwatch invoke is swallowed', async () => {
    const { deps, store } = makeDeps({
      seed: { '112100': record() },
      reply: () => new Error('shell restart')
    })
    expect(() => clearAndUnwatchPendingAdoption(deps, '112100')).not.toThrow()
    await flush()
    expect(store.has('112100')).toBe(false)
  })
})

describe('readSteamAdoption', () => {
  const reading = {
    adopted: true,
    signedIn: true,
    steamRunning: true,
    helperState: 4,
    evidence: 'helper'
  }

  test('returns the parsed reading', async () => {
    const { deps, calls } = makeDeps({ reply: () => reading })
    await expect(readSteamAdoption(deps, '112100', record())).resolves.toEqual(
      reading
    )
    expect(calls[0]?.channel).toBe(RUST_STEAMPOLL_ADOPTION_READ)
  })

  test('null when the invoke rejects (D-10)', async () => {
    const { deps } = makeDeps({ reply: () => new Error('timeout') })
    await expect(
      readSteamAdoption(deps, '112100', record())
    ).resolves.toBeNull()
  })

  test('null when the reply is not the reading shape', async () => {
    const { deps } = makeDeps({ reply: () => ({ adopted: 'yes' }) })
    await expect(
      readSteamAdoption(deps, '112100', record())
    ).resolves.toBeNull()
  })
})

describe('listPendingAdoptions', () => {
  test('returns only entries that pass the record validation', () => {
    const { deps } = makeDeps({
      seed: {
        '112100': record(),
        '5': { steamPid: -1 },
        '6': 'junk',
        '7': { ...record(), manifestPath: 7 }
      }
    })
    const store = (
      deps.stores.steam as unknown as {
        steamPendingAdoptionStore: Parameters<typeof listPendingAdoptions>[0]
      }
    ).steamPendingAdoptionStore
    expect(listPendingAdoptions(store).map(([id]) => id)).toEqual(['112100'])
    expect(readPendingAdoption('112100', store)).toEqual(record())
  })
})

describe('resumeAdoptionWatches', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'adoption-resume-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function manifestIn(name: string): string {
    const p = join(dir, name)
    writeFileSync(p, '"AppState" {}')
    return p
  }

  test('watches each valid record whose manifest exists and resolves the count', async () => {
    const a = manifestIn('appmanifest_1.acf')
    const b = manifestIn('appmanifest_2.acf')
    const { deps, calls, store } = makeDeps({
      seed: { '1': record(a), '2': record(b) }
    })
    await expect(resumeAdoptionWatches(deps)).resolves.toBe(2)
    expect(calls.map((c) => c.channel)).toEqual([
      RUST_STEAMPOLL_ADOPTION_WATCH,
      RUST_STEAMPOLL_ADOPTION_WATCH
    ])
    expect(store.size).toBe(2)
  })

  test('clears a record whose manifest is gone and does not watch it', async () => {
    const { deps, calls, store } = makeDeps({
      seed: { '1': record(join(dir, 'appmanifest_gone.acf')) }
    })
    await expect(resumeAdoptionWatches(deps)).resolves.toBe(0)
    await flush()
    expect(store.has('1')).toBe(false)
    expect(calls.map((c) => c.channel)).toEqual([
      RUST_STEAMPOLL_ADOPTION_UNWATCH
    ])
  })

  test('ignores invalid entries', async () => {
    const { deps, calls, store } = makeDeps({
      seed: { '9': { steamPid: 'x' }, '8': null }
    })
    await expect(resumeAdoptionWatches(deps)).resolves.toBe(0)
    expect(calls).toEqual([])
    expect(store.size).toBe(2)
  })

  test('never rejects when a watch invoke rejects; the record is kept', async () => {
    const a = manifestIn('appmanifest_3.acf')
    const { deps, store } = makeDeps({
      seed: { '3': record(a) },
      reply: () => new Error('timeout')
    })
    await expect(resumeAdoptionWatches(deps)).resolves.toBe(0)
    expect(store.has('3')).toBe(true)
  })

  test('never rejects when the store cannot be listed', async () => {
    const { deps } = makeDeps()
    const broken = {
      ...deps,
      stores: {
        steam: {
          steamPendingAdoptionStore: {
            entries: () => {
              throw new Error('disk')
            }
          }
        }
      }
    } as unknown as AdoptionWatchDeps
    await expect(resumeAdoptionWatches(broken)).resolves.toBe(0)
  })
})
