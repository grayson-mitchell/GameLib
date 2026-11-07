/**
 * Assumption A3 (67-19): every channel the preload binds or sends is on the renderer allow-list
 * the Rust relay enforces, or is tagged 'local'. A miss here would be a legitimate call the relay
 * silently blocks (T-67-62). Also guards the generator's filter against the same computation
 * done here (T-67-63).
 */
import { defined } from 'backend/testUtils/indexed'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

import { channelSchemas } from 'common/types/ipc/channelSchemas'
import * as transport from 'common/types/sidecarTransport'

const ROOT = join(__dirname, '../../../..')
const PRELOAD = join(ROOT, 'src/preload')

/** Strip block and line comments so doc examples are not read as bindings. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__tests__') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...sourceFiles(p))
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

const BIND =
  /\b(makeHandlerInvoker|makeListenerCaller|frontendListenerSlot)\s*(?:<[^>]*>)?\s*\(\s*(['"`])([^'"`]+)\2/g

function preloadChannels(): Map<string, string> {
  const bound = new Map<string, string>() // channel -> where
  for (const file of sourceFiles(PRELOAD)) {
    const src = stripComments(readFileSync(file, 'utf8'))
    for (const m of src.matchAll(BIND)) {
      if (m[1] === 'frontendListenerSlot') continue // push: not an allow-list member
      bound.set(defined(m[3], 'BIND channel capture'), `${file}`)
    }
  }
  // tauriTransport sends/invokes: literal channels and the STORE_*_CHANNEL constants
  const tt = stripComments(
    readFileSync(join(PRELOAD, 'tauriTransport.ts'), 'utf8')
  )
  for (const m of tt.matchAll(/(?<![\w.])send\(\s*(['"])([^'"]+)\1/g)) {
    bound.set(defined(m[2], 'send channel capture'), 'tauriTransport.ts')
  }
  for (const m of tt.matchAll(
    /(?<![\w.])(?:send|invoke)(?:<[^>]*>)?\(\s*([A-Z_]+_CHANNEL)\b/g
  )) {
    const v = (transport as Record<string, unknown>)[
      defined(m[1], 'channel constant capture')
    ]
    if (typeof v !== 'string') throw new Error(`unknown constant ${m[1]}`)
    bound.set(v, 'tauriTransport.ts')
  }
  return bound
}

function computedRendererSet(): string[] {
  return Object.keys(channelSchemas)
    .filter((n) => {
      const e = defined(channelSchemas[n], `channel schema ${n}`)
      return (
        e.caller === 'renderer' && (e.kind === 'invoke' || e.kind === 'send')
      )
    })
    .sort()
}

function rustList(): string[] {
  const rs = readFileSync(join(ROOT, 'src-tauri/src/ipc_contract.rs'), 'utf8')
  const body = /RENDERER_CHANNELS: &\[&str\] = &\[([\s\S]*?)\];/.exec(rs)?.[1]
  if (body === undefined) throw new Error('RENDERER_CHANNELS not found')
  return [...body.matchAll(/"([^"]+)"/g)].map((m) =>
    defined(m[1], 'RENDERER_CHANNELS entry')
  )
}

describe('renderer channel allow-list', () => {
  const allowed = new Set(computedRendererSet())

  test('the preload surface was actually found', () => {
    expect(preloadChannels().size).toBeGreaterThan(100)
  })

  test('every preload invoke/send channel is allow-listed or local', () => {
    const missing: string[] = []
    for (const [channel, where] of preloadChannels()) {
      if (allowed.has(channel)) continue
      const e = Object.prototype.hasOwnProperty.call(channelSchemas, channel)
        ? channelSchemas[channel]
        : undefined
      if (e?.caller === 'local') continue
      missing.push(`${channel} (${where})`)
    }
    expect(missing).toEqual([])
  })

  test('generated Rust list equals the TS computation', () => {
    expect(rustList()).toEqual(computedRendererSet())
  })

  test('generated list is byte-sorted (binary search precondition)', () => {
    const l = rustList()
    expect(l).toEqual(
      [...l].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    )
  })

  test('shell-only, dev and store-snapshot channels are excluded', () => {
    const l = new Set(rustList())
    for (const n of [
      'health',
      'trayResolveRunner',
      'shellWindowFocused',
      'handleProtocolUrl',
      'sidecar:store-snapshot',
      'minimizeWindow'
    ]) {
      expect(l.has(n)).toBe(false)
    }
  })

  test('a push-only name never opens the renderer direction', () => {
    for (const [n, e] of Object.entries(channelSchemas)) {
      if (e.kind === 'push') expect(allowed.has(n)).toBe(false)
    }
  })
})
