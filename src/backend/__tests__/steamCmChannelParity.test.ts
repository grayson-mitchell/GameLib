/**
 * Phase 79 (CF-01): the gamelib-steamcm OPS (minus the CLI-only ops), the RUST_STEAMCM_* channel
 * constants and the shell match arms must not drift. Static reads only, no spawn.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defined } from 'backend/testUtils/indexed'
import { readTauriShellProductionSource } from 'backend/testUtils/tauriShellSource'
import {
  RUST_INVOKE_CHANNELS,
  RUST_STEAMCM_CHANNELS
} from '../../common/types/sidecarTransport'

const ROOT = join(__dirname, '..', '..', '..')
const libRs = readFileSync(
  join(ROOT, 'src-tauri/crates/gamelib-steamcm/src/lib.rs'),
  'utf8'
)

function extractConst(source: string, name: string): string[] {
  const m = new RegExp(`pub const ${name}:[^=]*=\\s*&\\[([^\\]]*)\\]`).exec(
    source
  )
  if (!m) throw new Error(`${name} not found`)
  return [...defined(m[1], `${name} body`).matchAll(/"([^"]+)"/g)].map((x) =>
    defined(x[1], `${name} entry`)
  )
}

const CLI_ONLY = extractConst(libRs, 'CLI_ONLY_OPS')
const OPS = extractConst(libRs, 'OPS').filter((op) => !CLI_ONLY.includes(op))

function snakeToPascal(s: string): string {
  return s
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
}

describe('steamcm channel parity (CF-01)', () => {
  it('anti-vacuity: extraction found the ops and the extractor rejects a missing name', () => {
    expect(CLI_ONLY).toEqual(['steamcm_capture_anon_pics'])
    expect(OPS).toHaveLength(27)
    expect(() => extractConst(libRs, 'NO_SUCH_CONST')).toThrow('not found')
  })

  it('RUST_STEAMCM_CHANNELS equals the crate OPS minus CLI_ONLY_OPS', () => {
    expect([...RUST_STEAMCM_CHANNELS].sort()).toEqual([...OPS].sort())
    expect(RUST_STEAMCM_CHANNELS).toHaveLength(27)
  })

  it('every steamcm channel is on the rustInvoke allowlist', () => {
    for (const c of RUST_STEAMCM_CHANNELS) {
      expect(RUST_INVOKE_CHANNELS as readonly string[]).toContain(c)
    }
  })
})

describe('steamcm shell arms', () => {
  it('every op has exactly one shell arm', () => {
    const shellSource = readTauriShellProductionSource()
    for (const op of OPS) {
      const arm = new RegExp(
        `^ {8}RustInvokeChannel::${snakeToPascal(op)} =>`,
        'gm'
      )
      expect(shellSource.match(arm) ?? []).toHaveLength(1)
    }
  })
})
