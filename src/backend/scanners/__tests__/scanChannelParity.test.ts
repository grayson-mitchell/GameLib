/**
 * Phase 63 (D-03, D-01): one implementation, two front ends. The rustInvoke scan
 * channels, the shell arms and the gamelib-scan library ops must not drift.
 * Static reads only, no spawn.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RUST_INVOKE_CHANNELS,
  RUST_SCAN_CHANNELS
} from '../../../common/types/sidecarTransport'
import { CLI_ONLY_SCAN_OPS, SCAN_OPS } from '../scanTypes'

const ROOT = join(__dirname, '..', '..', '..', '..')
const libRs = readFileSync(
  join(ROOT, 'src-tauri/crates/gamelib-scan/src/lib.rs'),
  'utf8'
)
const storeEmbed = readFileSync(
  join(ROOT, 'src-tauri/src/store_embed.rs'),
  'utf8'
)

function extractConst(source: string, name: string): string[] {
  const m = new RegExp(`pub const ${name}:[^=]*=\\s*&\\[([^\\]]*)\\]`).exec(
    source
  )
  if (!m) throw new Error(`${name} not found`)
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
}

const OPS = extractConst(libRs, 'OPS')
const CLI_ONLY = extractConst(libRs, 'CLI_ONLY_OPS')

describe('scan channel parity (D-03)', () => {
  it('anti-vacuity: OPS extraction found the ops', () => {
    expect(OPS.length).toBeGreaterThanOrEqual(7)
    expect(CLI_ONLY.length).toBeGreaterThanOrEqual(1)
  })

  it('channels equal OPS minus CLI_ONLY_OPS', () => {
    const expected = OPS.filter((o) => !CLI_ONLY.includes(o)).sort()
    expect([...RUST_SCAN_CHANNELS].sort()).toEqual(expected)
  })

  it('scanTypes SCAN_OPS and CLI_ONLY_SCAN_OPS equal the library', () => {
    expect([...SCAN_OPS].sort()).toEqual([...OPS].sort())
    expect([...CLI_ONLY_SCAN_OPS].sort()).toEqual([...CLI_ONLY].sort())
  })

  it('every shell scan arm passes straight to gamelib_scan::dispatch', () => {
    const lines = storeEmbed.split('\n')
    const arms: string[] = []
    lines.forEach((line, i) => {
      const m = /^\s*"(scan_[a-z_]+)" => \{\s*$/.exec(line)
      if (!m) return
      arms.push(m[1])
      const next = lines.slice(i + 1).find((l) => l.trim() !== '') ?? ''
      expect(next).toContain(`gamelib_scan::dispatch("${m[1]}", args)`)
    })
    expect(arms.sort()).toEqual([...RUST_SCAN_CHANNELS].sort())
  })

  it('every scan channel is allow-listed in RUST_INVOKE_CHANNELS', () => {
    const all = new Set<string>(RUST_INVOKE_CHANNELS)
    for (const c of RUST_SCAN_CHANNELS) expect(all.has(c)).toBe(true)
  })
})
