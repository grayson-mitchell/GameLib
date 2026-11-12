/**
 * 66.4-08: the bridge runtime's per-instance state and the frozen constant tables.
 */
import { createTestVersioning } from 'backend/testUtils/testStoreRoot'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import type { RunTool } from 'backend/engine/runTool'
import { createBridgeRuntime } from '../bridgeRuntime'
import { createAbortRegistry } from 'backend/utils/aborthandler/aborthandler'
import { bridgeAllowlist } from '../allowlist'
import { NOTICE_REASONS } from '../bridgeRoute'
import {
  DYLD_ENTITLEMENT,
  STOCK_LOADER_ENTITLEMENTS
} from '../drm/runnerEntitlements'
import { mergeOverlayEnvVars } from '../overlay/overlayLaunch'

const ENTITLEMENTS_XML =
  '<?xml version="1.0"?><plist version="1.0"><dict>' +
  [...STOCK_LOADER_ENTITLEMENTS, DYLD_ENTITLEMENT]
    .map((k) => `<key>${k}</key><true/>`)
    .join('') +
  '</dict></plist>'

function fakeCodesign(plists: string[]): RunTool {
  return (async (_tool: string, args: readonly string[]) => {
    const at = args.indexOf('--entitlements')
    if (args.includes('--force') && at >= 0) plists.push(String(args[at + 1]))
    return {
      code: 0,
      stdout: args.includes('--force') ? '' : ENTITLEMENTS_XML,
      stderr: '',
      timedOut: false,
      aborted: false
    }
  }) as unknown as RunTool
}

describe('createBridgeRuntime entitlement signer', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bridge-runtime-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const sign = async (
    rt: ReturnType<typeof createBridgeRuntime>,
    name: string,
    plists: string[]
  ) => {
    const loader = join(dir, name)
    writeFileSync(loader, 'x')
    const r = await rt.signer.resignLoader(
      fakeCodesign(plists),
      loader,
      dir,
      1000,
      'derived'
    )
    expect(r.ok).toBe(true)
  }

  it('numbers plists per instance, increasing, and starts fresh in a new instance', async () => {
    const plists: string[] = []
    const a = createBridgeRuntime({
      versioning: createTestVersioning(),
      aborts: createAbortRegistry()
    })
    await sign(a, 'l1', plists)
    await sign(a, 'l2', plists)
    const b = createBridgeRuntime({
      versioning: createTestVersioning(),
      aborts: createAbortRegistry()
    })
    await sign(b, 'l3', plists)
    expect(plists.map((p) => p.replace(/^.*-(\d+)\.plist$/, '$1'))).toEqual([
      '1',
      '2',
      '1'
    ])
  })
})

describe('createBridgeRuntime isolation', () => {
  it('builds independent flights per call', () => {
    const a = createBridgeRuntime({
      versioning: createTestVersioning(),
      aborts: createAbortRegistry()
    })
    const b = createBridgeRuntime({
      versioning: createTestVersioning(),
      aborts: createAbortRegistry()
    })
    expect(a.runnerClone).not.toBe(b.runnerClone)
    expect(a.overlayRunnerClone).not.toBe(b.overlayRunnerClone)
    expect(a.sharedRedist).not.toBe(b.sharedRedist)
    expect(a.signer).not.toBe(b.signer)
  })
})

describe('frozen bridge constants', () => {
  it('keeps the NOTICE_REASONS membership', () => {
    expect([...NOTICE_REASONS].sort()).toEqual([
      'known-bad',
      'scan-miss',
      'win64-no-shim'
    ])
    expect(Object.isFrozen(NOTICE_REASONS)).toBe(true)
  })

  it('answers allowlist lookups from the bundled table', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data = require('../bridge-allowlist.json') as {
      seed: { appId: string }[]
      knownBad: { appId: string; reason: string }[]
    }
    expect(data.seed.length).toBeGreaterThan(0)
    for (const g of data.seed) expect(bridgeAllowlist.has(g.appId)).toBe(true)
    for (const k of data.knownBad) {
      expect(bridgeAllowlist.knownBadReason(k.appId)).toBe(k.reason)
    }
    expect(bridgeAllowlist.has('not-numeric')).toBe(false)
    expect(bridgeAllowlist.knownBadReason('not-numeric')).toBeNull()
    expect(bridgeAllowlist.knownBadReason('1')).toBeNull()
  })

  it('still replaces only our overlay env keys on merge', () => {
    const out = mergeOverlayEnvVars(
      [
        { key: 'SteamAppId', value: 'old' },
        { key: 'SteamGameId', value: 'old' },
        { key: 'UNRELATED', value: 'keep' }
      ],
      [
        { key: 'SteamAppId', value: '7' },
        { key: 'SteamGameId', value: '7' }
      ]
    )
    expect(out.filter((e) => e.key === 'SteamAppId')).toEqual([
      { key: 'SteamAppId', value: '7' }
    ])
    expect(out.find((e) => e.key === 'UNRELATED')?.value).toBe('keep')
  })
})
