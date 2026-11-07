/**
 * Shrink-only coverage ratchet for IPC channel schemas (Phase 67 Plan 02, D-15 precursor / D-20).
 *
 * Counts registered channels that have no entry in `channelSchemas`, per bucket, against an
 * EQUALITY ceiling: lowering OR raising the real count without editing CEILING turns the test
 * red, so the number can only ratchet down by converting channels in the same commit.
 *
 * Registered set = the union of
 *   - runtime registries after `import('backend/sidecar/handlers')` and
 *     `registerSignInProbeOutcomesHandler()`;
 *   - a static scan of non-test `src/backend/**` for `ipcMain.handle/on/once`, `addHandler`,
 *     `addListener`, `addTestOnlyListener` (catches bootstrap-time registrations -- handleProtocolUrl,
 *     the online monitor -- and CI=e2e-only TestSync channels, none of which importing the
 *     handlers populates). `initOnlineMonitor()` is deliberately never called here: it pings
 *     sites and arms retries.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

import { handlerRegistry, listenerRegistry } from 'backend/platform'
import {
  domainSources,
  parseDomainFile,
  sharedConstants,
  type DomainPart
} from 'backend/testUtils/ipcDomainParse'
import { channelSchemas } from 'common/types/ipc/channelSchemas'
import { registerSignInProbeOutcomesHandler } from 'backend/signInProbe/outcomes'

type Bucket = 'invoke' | 'send' | 'testOnly' | 'push' | 'local'

// Lower a bucket in the SAME commit that converts channels in it. At zero, plan 67-18 replaces
// this table with an exemption-free `toEqual([])` (D-15, D-20).
// Measured on first run, plan 67-02.
const CEILING: Record<Bucket, number> = {
  invoke: 71,
  send: 28,
  testOnly: 6,
  push: 38,
  local: 14
}

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
    /\b(ipcMain\.handle|ipcMain\.on|ipcMain\.once|addHandler|addListener|addTestOnlyListener)\(\s*(?:'([^']+)'|([A-Z][A-Z0-9_]*)\s*,)/g
  for (const file of sourceFiles(BACKEND_DIR)) {
    const src = readFileSync(file, 'utf-8')
    for (const m of src.matchAll(re)) {
      const channel = m[2] ?? constants[m[3]]
      if (!channel) continue
      if (m[1] === 'addTestOnlyListener') out.testOnly.add(channel)
      else if (m[1] === 'ipcMain.handle' || m[1] === 'addHandler')
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
  await import('backend/sidecar/handlers')
  registerSignInProbeOutcomesHandler()
  const scan = staticScan()
  const invoke = new Set([...handlerRegistry.keys(), ...scan.invoke])
  const testOnly = scan.testOnly
  const send = new Set(
    [...listenerRegistry.keys(), ...scan.send].filter((c) => !testOnly.has(c))
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

describe('IPC schema coverage ratchet (D-20)', () => {
  it.each(['invoke', 'send', 'testOnly', 'push', 'local'] as Bucket[])(
    'bucket %s: unvalidated channel count equals the ceiling',
    async (bucket) => {
      const reg = await registered()
      const missing = [...reg[bucket]].filter((name) => {
        const entry = channelSchemas[name]
        return !entry || bucketOf(entry) !== bucket
      })
      expect(missing.length).toBe(CEILING[bucket])
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
