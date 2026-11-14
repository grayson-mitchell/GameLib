/**
 * Phase 79 plan 21: Jest half of the Tier 1 CM parity goldens. `rust-results.json` is what the Rust
 * ops produced for every invocation (recorded by golden.rs, so Jest needs no cargo). Each recorded
 * wire result is fed through the real `RustCmClient` / `RustAnonClient` mapping and must equal
 * steam-user's expected value after the case's override (the differences golden.rs also applies).
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { createRustCmClient, unwrapSteamCm } from '../RustCmClient'
import { createRustAnonClient } from '../RustAnonClient'
import { invokeSteamCm } from '../rustSteamCm'
import * as logger from 'backend/logger'

const FIXTURES = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'src-tauri',
  'crates',
  'gamelib-steamcm',
  'tests',
  'fixtures'
)

const readJson = (name: string) =>
  JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8'))

const invocations = readJson('invocations.json') as Record<
  string,
  Record<string, any>
>
const results = readJson('rust-results.json') as Record<string, unknown>
const expected = readJson('expected.json') as Record<string, unknown>

interface Override {
  class: string
  cause: string
  stripExpected?: string[]
  stripRust?: string[]
}

function overrideFor(name: string): Override | undefined {
  const p = join(FIXTURES, 'overrides', `${name.replace(':', '_')}.json`)
  return existsSync(p)
    ? (JSON.parse(readFileSync(p, 'utf-8')) as Override)
    : undefined
}

function strip(v: unknown, keys: string[]): unknown {
  if (Array.isArray(v)) return v.map((x) => strip(x, keys))
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([k]) => !keys.includes(k))
        .map(([k, x]) => [k, strip(x, keys)])
    )
  }
  return v
}

const requestRustInvoke = jest.fn()
const deps = { requestRustInvoke }
const LEASE = {
  leaseId: 1,
  steamId: '76561197960287930',
  licenses: []
}

beforeEach(() => {
  requestRustInvoke.mockReset()
  jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  jest.spyOn(logger, 'logError').mockImplementation(() => undefined)
})

/** The value a GameLib caller observes for this case, in steam-user's shape. */
async function observe(
  c: Record<string, any>,
  wire: unknown
): Promise<unknown> {
  requestRustInvoke.mockResolvedValue(wire)
  const client = createRustCmClient(deps, LEASE)
  try {
    switch (c.kind) {
      case 'anon_pics': {
        const r = await createRustAnonClient(deps).getProductInfo(
          [c.appId],
          [],
          true
        )
        return r.apps?.[c.appId]
      }
      case 'licenses':
        return unwrapSteamCm(
          'steamcm_licenses',
          await invokeSteamCm(deps, 'steamcm_licenses', { leaseId: 1 })
        )
      case 'owned_apps':
        return await client.getUserOwnedApps(c.steamId, {
          includePlayedFreeGames: true
        })
      case 'depot_key': {
        const key = await new Promise<Buffer>((res, rej) =>
          client.getDepotDecryptionKey(c.appId, c.depotId, (e, k) =>
            e ? rej(e) : res(k)
          )
        )
        return { keyHex: key.toString('hex') }
      }
      case 'request_code':
        return await client.getManifestRequestCode(
          c.appId,
          c.depotId,
          c.manifestId,
          c.branch
        )
      case 'content_servers':
        return await new Promise((res, rej) =>
          client.getContentServers(c.appId, (e, s) => (e ? rej(e) : res(s)))
        )
      case 'redeem':
        return await client.redeemKey('SYNTH-KEY')
      case 'personas':
        return await client.getPersonas(c.steamIds)
      default:
        throw new Error(`unknown case kind ${c.kind}`)
    }
  } catch (e) {
    const err = e as {
      eresult?: number
      purchaseResultDetails?: number
      packageList?: unknown
    }
    return {
      error: {
        eresult: err.eresult,
        ...(err.purchaseResultDetails !== undefined && {
          purchaseResultDetails: err.purchaseResultDetails,
          packageList: err.packageList
        })
      }
    }
  }
}

describe('steamcm Tier 1 goldens (Rust results replayed through RustCmClient)', () => {
  it('rust-results.json covers every invocation (anti-vacuity)', () => {
    const names = Object.keys(invocations)
    expect(names.length).toBeGreaterThanOrEqual(13)
    expect(Object.keys(results).length).toBeGreaterThanOrEqual(names.length)
    for (const n of names) {
      expect(results).toHaveProperty([n])
      expect(expected).toHaveProperty([n])
    }
  })

  it('every override names a class and a cause', () => {
    for (const n of Object.keys(invocations)) {
      const o = overrideFor(n)
      if (o) {
        expect(typeof o.class).toBe('string')
        expect(typeof o.cause).toBe('string')
      }
    }
  })

  it.each(Object.keys(invocations))('%s equals steam-user', async (name) => {
    const o = overrideFor(name)
    const got = strip(
      await observe(invocations[name] ?? {}, results[name]),
      o?.stripRust ?? []
    )
    const want = strip(expected[name], o?.stripExpected ?? [])
    expect(got).toEqual(want)
  })
})
