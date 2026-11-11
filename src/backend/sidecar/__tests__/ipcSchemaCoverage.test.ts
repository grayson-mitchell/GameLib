/**
 * Every registered or declared IPC channel has a schema (Phase 67 D-15, D-20). No ceiling table,
 * no exemption list: the ratchet from plan 67-02 reached zero in plan 67-18, so adding a channel
 * without a schema now fails here.
 *
 * Registered set = the union of
 *   - runtime registries after `import('backend/sidecar/handlers')` and
 *     `signInProbe.outcomes.registerHandler()`;
 *   - a static scan of non-test `src/backend/**` for `ipcMain.handle/on/once`, `addHandler`,
 *     `addListener`, `addTestOnlyListener` (catches bootstrap-time registrations -- handleProtocolUrl,
 *     the online monitor -- and CI=e2e-only TestSync channels, none of which importing the
 *     handlers populates). `initOnlineMonitor()` is deliberately never called here: it pings
 *     sites and arms retries.
 */
import { createTestServices } from 'backend/testUtils/testServices'
import { createCaptureLog } from 'backend/testUtils/captureLog'
import { defined } from 'backend/testUtils/indexed'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

import {
  domainSources,
  parseDomainFile,
  sharedConstants,
  type DomainPart
} from 'backend/testUtils/ipcDomainParse'
import {
  channelSchemas,
  collidingPushSchemas,
  pushSchemaFor
} from 'common/types/ipc/channelSchemas'

type Bucket = 'invoke' | 'send' | 'testOnly' | 'push' | 'local'

const BACKEND_DIR = join(__dirname, '..', '..')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

interface Scanned {
  invoke: Set<string>
  send: Set<string>
  testOnly: Set<string>
}

function staticScan(): Scanned {
  const constants = sharedConstants()
  const out: Scanned = {
    invoke: new Set(),
    send: new Set(),
    testOnly: new Set()
  }
  const re =
    /\b(ipcMain\.handle|ipcMain\.on|ipcMain\.once|ipc\.handle|ipc\.on|addHandler|addListener|addTestOnlyListener)\(\s*(?:'([^']+)'|([A-Z][A-Z0-9_]*)\s*,)/g
  for (const file of sourceFiles(BACKEND_DIR)) {
    const src = readFileSync(file, 'utf-8')
    // onTestOnly(ipc, env, 'channel', ...): the registry form of addTestOnlyListener (66.3-07).
    for (const m of src.matchAll(
      /\bonTestOnly\(\s*[\w.]+,\s*[\w.]+,\s*'([^']+)'/g
    )) {
      if (m[1]) out.testOnly.add(m[1])
    }
    // A file-local `const NAME = 'channel'` (devEpicCookieSweepRegistration's, not exported).
    const local = new Map<string, string>()
    for (const c of src.matchAll(
      /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*'([^']+)'/g
    )) {
      if (c[1] && c[2]) local.set(c[1], c[2])
    }
    for (const m of src.matchAll(re)) {
      const channel =
        m[2] ??
        (m[3] === undefined ? undefined : (constants[m[3]] ?? local.get(m[3])))
      if (!channel) continue
      if (m[1] === 'addTestOnlyListener') out.testOnly.add(channel)
      else if (
        m[1] === 'ipcMain.handle' ||
        m[1] === 'ipc.handle' ||
        m[1] === 'addHandler'
      )
        out.invoke.add(channel)
      else out.send.add(channel)
    }
  }
  return out
}

function declaredParts(): DomainPart[] {
  return Object.values(domainSources()).flatMap((s) => parseDomainFile(s))
}

async function registered(): Promise<{
  invoke: Set<string>
  send: Set<string>
  testOnly: Set<string>
  push: Set<string>
  local: Set<string>
  declared: Set<string>
}> {
  const { registerHandlers } = await import('backend/sidecar/handlers')
  const services = createTestServices()
  registerHandlers({ log: createCaptureLog(), services })
  services.signInProbe.outcomes.registerHandler()
  const scan = staticScan()
  // Every registration writes into the test host's injected registry.
  const invoke = new Set([
    ...services.host.ipc.handlerMap().keys(),
    ...scan.invoke
  ])
  const testOnly = scan.testOnly
  const send = new Set(
    [...services.host.ipc.listenerMap().keys(), ...scan.send].filter(
      (c) => !testOnly.has(c)
    )
  )
  const parts = declaredParts()
  const push = new Set(
    parts.filter((p) => p.kind === 'FrontendMessages').flatMap((p) => p.keys)
  )
  const declared = new Set(parts.flatMap((p) => p.keys))
  const allRegistered = new Set([...invoke, ...send, ...testOnly])
  const local = new Set(
    parts
      .filter((p) => p.kind === 'Sync' || p.kind === 'Async')
      .flatMap((p) => p.keys)
      .filter((k) => !allRegistered.has(k))
  )
  return { invoke, send, testOnly, push, local, declared }
}

function bucketOf(entry: (typeof channelSchemas)[string]): Bucket {
  if (entry.testOnly) return 'testOnly'
  if (entry.caller === 'local') return 'local'
  return entry.kind
}

describe('IPC schema coverage (D-15)', () => {
  it.each(['invoke', 'send', 'testOnly', 'push', 'local'] as Bucket[])(
    'bucket %s: every channel has a schema in that bucket (no exemptions)',
    async (bucket) => {
      const reg = await registered()
      const missing = [...reg[bucket]].filter((name) => {
        const entry =
          bucket === 'push' ? pushSchemaFor(name) : channelSchemas[name]
        return !entry || bucketOf(entry) !== bucket
      })
      expect(missing).toEqual([])
    }
  )

  it('every channelSchemas key is registered or declared', async () => {
    const reg = await registered()
    const known = new Set([
      ...reg.invoke,
      ...reg.send,
      ...reg.testOnly,
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
      if (reg.testOnly.has(name)) continue
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

  it('testOnly and push entries carry the matching flags', async () => {
    const reg = await registered()
    for (const name of reg.testOnly) {
      if (channelSchemas[name]) {
        expect(channelSchemas[name].testOnly).toBe(true)
      }
    }
    for (const [name, entry] of Object.entries(channelSchemas)) {
      if (reg.push.has(name) && entry.kind === 'push') {
        expect(entry.testOnly).toBe(false)
      }
      if (entry.testOnly) expect(reg.testOnly.has(name)).toBe(true)
    }
  })

  it('non-vacuity: the registered set is large enough that a scan miss goes red', async () => {
    const reg = await registered()
    expect(reg.invoke.size).toBeGreaterThan(150)
    expect(reg.send.size).toBeGreaterThan(40)
    expect(reg.testOnly.size).toBeGreaterThan(0)
    expect(reg.push.size).toBeGreaterThan(30)
  })
})
