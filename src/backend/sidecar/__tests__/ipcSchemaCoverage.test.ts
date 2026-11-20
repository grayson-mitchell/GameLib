/**
 * Every registered or declared IPC channel has a schema (Phase 67 D-15, D-20). No ceiling table,
 * no exemption list: the ratchet from plan 67-02 reached zero in plan 67-18, so adding a channel
 * without a schema now fails here.
 *
 * Two schema sources: `channelSchemas` (zod, the sidecar owner) and `nativeChannels.json` (the Rust
 * native router's manifest, Phase 83 D-07 -- the Rust args type is that owner's schema authority).
 * A channel covered by the manifest needs no zod entry; the manifest is read, not listed here.
 *
 * Registered set = the union of
 *   - runtime registries after `import('backend/sidecar/handlers')` and
 *     `signInProbe.outcomes.registerHandler()`;
 *   - the static scan in `backend/testUtils/ipcRegistrationScan` of non-test `src/backend/**` for
 *     `ipcMain.handle/on/once`, `addHandler`, `addListener` (catches bootstrap-time registrations -- handleProtocolUrl,
 *     the online monitor -- which importing the handlers does not populate). `initOnlineMonitor()` is deliberately never called here: it pings
 *     sites and arms retries.
 */
import { createTestShellState } from 'backend/testUtils/testShellState'
import { createTestServices } from 'backend/testUtils/testServices'
import { createCaptureLog } from 'backend/testUtils/captureLog'
import { defined } from 'backend/testUtils/indexed'
import { join } from 'path'

import {
  domainSources,
  nativeChannelNames,
  parseDomainFile,
  type DomainPart
} from 'backend/testUtils/ipcDomainParse'
import { scanRegistrations } from 'backend/testUtils/ipcRegistrationScan'
import {
  channelSchemas,
  collidingPushSchemas,
  pushSchemaFor
} from 'common/types/ipc/channelSchemas'

type Bucket = 'invoke' | 'send' | 'push' | 'local'

const BACKEND_DIR = join(__dirname, '..', '..')

function declaredParts(): DomainPart[] {
  return Object.values(domainSources()).flatMap((s) => parseDomainFile(s))
}

async function registered(): Promise<{
  invoke: Set<string>
  send: Set<string>
  push: Set<string>
  local: Set<string>
  declared: Set<string>
}> {
  const { registerHandlers } = await import('backend/sidecar/handlers')
  const services = createTestServices()
  registerHandlers({
    log: createCaptureLog(),
    services,
    shellState: createTestShellState(services)
  })
  services.signInProbe.outcomes.registerHandler()
  const scan = scanRegistrations(BACKEND_DIR)
  // Every registration writes into the test host's injected registry.
  const invoke = new Set([
    ...services.host.ipc.handlerMap().keys(),
    ...scan.invoke
  ])
  const send = new Set([
    ...services.host.ipc.listenerMap().keys(),
    ...scan.send
  ])
  const parts = declaredParts()
  const push = new Set(
    parts.filter((p) => p.kind === 'FrontendMessages').flatMap((p) => p.keys)
  )
  const declared = new Set(parts.flatMap((p) => p.keys))
  const allRegistered = new Set([...invoke, ...send])
  const local = new Set(
    parts
      .filter((p) => p.kind === 'Sync' || p.kind === 'Async')
      .flatMap((p) => p.keys)
      .filter((k) => !allRegistered.has(k))
  )
  return { invoke, send, push, local, declared }
}

function bucketOf(entry: (typeof channelSchemas)[string]): Bucket {
  if (entry.caller === 'local') return 'local'
  return entry.kind
}

/**
 * Names with no schema in `bucket`: neither a `channelSchemas` entry of that bucket nor a native
 * manifest channel. Shared by the real run and the near-miss below.
 */
function schemaMisses(
  names: Iterable<string>,
  bucket: Bucket,
  native: ReadonlySet<string>
): string[] {
  return [...names].filter((name) => {
    if (native.has(name)) return false
    const entry = bucket === 'push' ? pushSchemaFor(name) : channelSchemas[name]
    return !entry || bucketOf(entry) !== bucket
  })
}

describe('IPC schema coverage (D-15)', () => {
  it.each(['invoke', 'send', 'push', 'local'] as Bucket[])(
    'bucket %s: every channel has a schema in that bucket (no exemptions)',
    async (bucket) => {
      const reg = await registered()
      expect(schemaMisses(reg[bucket], bucket, nativeChannelNames())).toEqual(
        []
      )
    }
  )

  it('near-miss: a declared channel in neither schema source is reported; a manifest channel is not', () => {
    const unknown = 'definitelyNotAChannel'
    expect(schemaMisses([unknown], 'local', new Set())).toEqual([unknown])
    expect(schemaMisses([unknown], 'local', new Set([unknown]))).toEqual([])
    expect(nativeChannelNames().has('getHeroicVersion')).toBe(true)
  })

  it('every channelSchemas key is registered or declared', async () => {
    const reg = await registered()
    const known = new Set([
      ...reg.invoke,
      ...reg.send,
      ...reg.push,
      ...reg.declared
    ])
    expect(Object.keys(channelSchemas).filter((k) => !known.has(k))).toEqual([])
  })

  it('collidingPushSchemas holds only pushes that share a name with an inbound channel', () => {
    for (const [name, entry] of Object.entries(collidingPushSchemas)) {
      expect(entry.kind).toBe('push')
      expect(channelSchemas[name]).toBeDefined()
      expect(defined(channelSchemas[name], name).kind).not.toBe('push')
    }
    expect(Object.keys(collidingPushSchemas).sort()).toEqual([
      'connectivity-changed',
      'refreshLibrary'
    ])
  })

  it('shell and local entries are invoke or send, and kinds match registration', async () => {
    const reg = await registered()
    for (const [name, entry] of Object.entries(channelSchemas)) {
      // `caller` only describes who sends an inbound frame; a push (backend -> renderer) keeps
      // the default tag and is never parsed (D-12).
      if (entry.caller === 'shell' || entry.caller === 'local') {
        expect(['invoke', 'send']).toContain(entry.kind)
      }
      if (reg.invoke.has(name)) {
        // A name can also be a push (collidingPushSchemas), but never in this map.
        expect(entry.kind).toBe('invoke')
      }
    }
    for (const name of reg.send) {
      if (reg.invoke.has(name)) continue
      expect(channelSchemas[name]?.kind).toBe('send')
    }
  })

  it('no entry is tagged testOnly: the e2e-only channels are gone (D-19)', () => {
    for (const entry of Object.values(channelSchemas)) {
      expect(entry.testOnly).toBe(false)
    }
  })

  it('non-vacuity: the registered set is large enough that a scan miss goes red', async () => {
    const reg = await registered()
    expect(reg.invoke.size).toBeGreaterThan(150)
    expect(reg.send.size).toBeGreaterThan(40)
    expect(reg.push.size).toBeGreaterThan(30)
  })
})
