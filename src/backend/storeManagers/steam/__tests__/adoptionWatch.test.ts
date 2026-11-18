/**
 * Phase 81 (D-07/D-10): the TS record store is the single writer and Rust keeps an in-memory watch
 * list fed from it. Driven through an in-memory store fake and a fake requestRustInvoke that records
 * channel and args; no module is mocked.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initHeadless } from 'backend/logger'
import {
  RUST_STEAMFILES_FIND_ACF,
  RUST_STEAMFILES_READ_ACF,
  RUST_STEAMFILES_READ_LIBRARY_FOLDERS,
  RUST_STEAMPOLL_ADOPTION_READ,
  RUST_STEAMPOLL_ADOPTION_UNWATCH,
  RUST_STEAMPOLL_ADOPTION_WATCH,
  RUST_STEAMPOLL_HOLD_DISCARD,
  RUST_STEAMPOLL_HOLD_DRAIN
} from 'common/types/sidecarTransport'
import {
  adoptionWatchArgs,
  clearAndUnwatchPendingAdoption,
  migrateRestartHolds,
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

type Reply = (channel: string, args: unknown[]) => unknown

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
  pushes: Call[]
  signedIn: Map<string, boolean | null>
} {
  const calls: Call[] = []
  const pushes: Call[] = []
  const signedIn = new Map<string, boolean | null>()
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
    sendFrontendMessage: (channel: string, ...args: unknown[]) => {
      pushes.push({ channel, args })
    },
    steamInstallRuntime: { adoption: { pushSeq: { last: 0 }, signedIn } },
    config: {
      getSettings: () => ({
        defaultSteamPath: '/nonexistent-steam',
        steamExperimentalInstallApp: options.installApp === true
      })
    },
    requestRustInvoke: (channel: string, args: unknown[]) => {
      calls.push({ channel, args })
      if (options.reply) {
        const out = options.reply(channel, args)
        if (out instanceof Error) return Promise.reject(out)
        return Promise.resolve(out)
      }
      return Promise.resolve(true)
    }
  } as unknown as AdoptionWatchDeps
  return { deps, calls, store, pushes, signedIn }
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

describe('the page status push (D-07)', () => {
  const payloads = (pushes: Call[]) =>
    pushes.map((p) => p.args[0] as Record<string, unknown>)

  test('recordAndWatchPendingAdoption pushes pending:true once after the store write', async () => {
    const { deps, pushes } = makeDeps()
    await recordAndWatchPendingAdoption(deps, '112100', record())
    expect(pushes.map((p) => p.channel)).toEqual(['steamAdoptionStatusChanged'])
    expect(payloads(pushes)[0]).toEqual({
      appName: '112100',
      pending: true,
      steamSignedIn: null,
      seq: 1
    })
  })

  test('clearAndUnwatchPendingAdoption pushes pending:false once and drops the signed-in reading', async () => {
    const { deps, pushes, signedIn } = makeDeps({
      seed: { '112100': record() }
    })
    signedIn.set('112100', false)
    clearAndUnwatchPendingAdoption(deps, '112100')
    await flush()
    expect(signedIn.has('112100')).toBe(false)
    expect(payloads(pushes)).toEqual([
      { appName: '112100', pending: false, steamSignedIn: null, seq: 1 }
    ])
  })

  test('a record write then a clear push with a strictly increasing seq', async () => {
    const { deps, pushes } = makeDeps()
    await recordAndWatchPendingAdoption(deps, '112100', record())
    clearAndUnwatchPendingAdoption(deps, '112100')
    await flush()
    await recordAndWatchPendingAdoption(deps, '112100', record())
    expect(payloads(pushes).map((p) => [p.pending, p.seq])).toEqual([
      [true, 1],
      [false, 2],
      [true, 3]
    ])
  })

  test('a failed push never fails the write (the record stays)', async () => {
    const { deps, store } = makeDeps()
    ;(deps as { sendFrontendMessage: unknown }).sendFrontendMessage = () => {
      throw new Error('transport down')
    }
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

describe('migrateRestartHolds (D-12, D-13)', () => {
  let dir: string
  let steamapps: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'adoption-migrate-'))
    steamapps = join(dir, 'steamapps')
    mkdirSync(steamapps)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const hold = (
    appId: string,
    steamPid = 4242,
    recordedAtMs = 1_650_000_000
  ) => ({
    appId,
    steamPid,
    recordedAtMs
  })

  function acfFor(appId: string): string {
    const p = join(steamapps, `appmanifest_${appId}.acf`)
    writeFileSync(p, '"AppState" { "appid" "' + appId + '" }')
    return p
  }

  /** A fake shell routing by channel: the hold ops, the library list, find_acf and read_acf. */
  function router(
    options: {
      drain?: unknown
      adopted?: Set<string>
      discard?: unknown
      findRejects?: boolean
    } = {}
  ): Reply {
    return (channel, args) => {
      const arg = (args[0] ?? {}) as Record<string, unknown>
      switch (channel) {
        case RUST_STEAMPOLL_HOLD_DRAIN:
          return options.drain ?? []
        case RUST_STEAMPOLL_HOLD_DISCARD:
          return options.discard ?? true
        case RUST_STEAMFILES_READ_LIBRARY_FOLDERS:
          return { exists: true, parsed: true, readError: null, paths: [dir] }
        case RUST_STEAMFILES_FIND_ACF: {
          if (options.findRejects) return new Error('timeout')
          const dirs = arg.steamappsDirs as string[]
          const id = String(arg.appId)
          const hit = dirs.find((d) => d === steamapps)
          const present =
            hit !== undefined &&
            existsSync(join(steamapps, `appmanifest_${id}.acf`))
          return present
            ? { found: true, steamappsDir: steamapps, record: {} }
            : { found: false, steamappsDir: null, record: null }
        }
        case RUST_STEAMFILES_READ_ACF:
          return {
            parsed: true,
            record: { stateFlags: 2, buildid: '0' }
          }
        case RUST_STEAMPOLL_ADOPTION_READ:
          return {
            adopted: options.adopted?.has(String(arg.appId)) === true,
            signedIn: true,
            steamRunning: true,
            helperState: null,
            evidence: null
          }
        default:
          return true
      }
    }
  }

  const channels = (calls: Call[]) => calls.map((c) => c.channel)

  test('a hold whose ACF exists and is unadopted becomes a pending record and is watched', async () => {
    const manifest = acfFor('112100')
    const { deps, calls, store } = makeDeps({
      reply: router({ drain: [hold('112100')] })
    })
    await expect(migrateRestartHolds(deps)).resolves.toBe(1)
    const written = store.get('112100') as PendingAdoptionRecord
    expect(written.steamPid).toBe(4242)
    expect(written.manifestPath).toBe(manifest)
    expect(written.recordedAt).toBe(1_650_000_000)
    expect(written.baseline.content).toContain('112100')
    expect(channels(calls)).toContain(RUST_STEAMPOLL_ADOPTION_WATCH)
  })

  test('a hold whose ACF is gone is dropped (acf-gone), never written or watched', async () => {
    const { deps, calls, store } = makeDeps({
      reply: router({ drain: [hold('999')] })
    })
    await expect(migrateRestartHolds(deps)).resolves.toBe(0)
    expect(store.size).toBe(0)
    expect(channels(calls)).not.toContain(RUST_STEAMPOLL_ADOPTION_WATCH)
    expect(
      channels(calls).filter((c) => c === RUST_STEAMPOLL_HOLD_DISCARD)
    ).toHaveLength(1)
  })

  test('a hold the adoption read already reports adopted is dropped (Pitfall 5)', async () => {
    acfFor('7')
    const { deps, calls, store } = makeDeps({
      reply: router({ drain: [hold('7')], adopted: new Set(['7']) })
    })
    await expect(migrateRestartHolds(deps)).resolves.toBe(0)
    expect(store.size).toBe(0)
    expect(channels(calls)).not.toContain(RUST_STEAMPOLL_ADOPTION_WATCH)
    expect(
      channels(calls).filter((c) => c === RUST_STEAMPOLL_HOLD_DISCARD)
    ).toHaveLength(1)
  })

  test('discard runs exactly once, after every record was handled', async () => {
    acfFor('1')
    acfFor('2')
    const { deps, calls } = makeDeps({
      reply: router({ drain: [hold('1'), hold('2'), hold('3')] })
    })
    await expect(migrateRestartHolds(deps)).resolves.toBe(2)
    const all = channels(calls)
    expect(all.filter((c) => c === RUST_STEAMPOLL_HOLD_DISCARD)).toHaveLength(1)
    expect(all[all.length - 1]).toBe(RUST_STEAMPOLL_HOLD_DISCARD)
    expect(all.indexOf(RUST_STEAMPOLL_HOLD_DRAIN)).toBe(0)
  })

  test('a rejected drain never discards the file and resolves 0', async () => {
    const { deps, calls, store } = makeDeps({
      reply: router({ drain: new Error('shell restart') })
    })
    await expect(migrateRestartHolds(deps)).resolves.toBe(0)
    expect(channels(calls)).not.toContain(RUST_STEAMPOLL_HOLD_DISCARD)
    expect(store.size).toBe(0)
  })

  test('a malformed drain reply never discards the file', async () => {
    const { deps, calls } = makeDeps({ reply: router({ drain: { nope: 1 } }) })
    await expect(migrateRestartHolds(deps)).resolves.toBe(0)
    expect(channels(calls)).not.toContain(RUST_STEAMPOLL_HOLD_DISCARD)
  })

  test('a hold that could not be evaluated (lookup rejected) keeps the file for the next boot', async () => {
    const { deps, calls, store } = makeDeps({
      reply: router({ drain: [hold('5')], findRejects: true })
    })
    await expect(migrateRestartHolds(deps)).resolves.toBe(0)
    expect(store.size).toBe(0)
    expect(channels(calls)).not.toContain(RUST_STEAMPOLL_HOLD_DISCARD)
  })

  test('a re-run after a crash overwrites the same record (idempotent)', async () => {
    acfFor('112100')
    const { deps, store } = makeDeps({
      reply: router({ drain: [hold('112100')] })
    })
    await migrateRestartHolds(deps)
    const first = store.get('112100')
    await expect(migrateRestartHolds(deps)).resolves.toBe(1)
    expect(store.size).toBe(1)
    expect(store.get('112100')).toEqual(first)
  })

  test('an existing pending record for the same appId is overwritten by the migrated one', async () => {
    const manifest = acfFor('112100')
    const { deps, store } = makeDeps({
      seed: { '112100': { ...record(manifest), steamPid: 1 } },
      reply: router({ drain: [hold('112100', 4242)] })
    })
    await migrateRestartHolds(deps)
    expect((store.get('112100') as PendingAdoptionRecord).steamPid).toBe(4242)
  })

  test('never opens a steam:// URL and never signals Steam (only drain, lookups, watch, read, discard)', async () => {
    acfFor('112100')
    const { deps, calls } = makeDeps({
      reply: router({ drain: [hold('112100')] })
    })
    await migrateRestartHolds(deps)
    expect(new Set(channels(calls))).toEqual(
      new Set([
        RUST_STEAMPOLL_HOLD_DRAIN,
        RUST_STEAMFILES_READ_LIBRARY_FOLDERS,
        RUST_STEAMFILES_FIND_ACF,
        RUST_STEAMFILES_READ_ACF,
        RUST_STEAMPOLL_ADOPTION_READ,
        RUST_STEAMPOLL_ADOPTION_WATCH,
        RUST_STEAMPOLL_HOLD_DISCARD
      ])
    )
  })

  test('a rejected discard is swallowed and the migration still resolves the count', async () => {
    acfFor('112100')
    const { deps } = makeDeps({
      reply: router({ drain: [hold('112100')], discard: new Error('disk') })
    })
    await expect(migrateRestartHolds(deps)).resolves.toBe(1)
  })
})
