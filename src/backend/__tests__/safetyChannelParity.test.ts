/**
 * Phase 82 (plan 05, D-07): the gamelib-safety OPS, the RUST_SAFETY_* channel constants and the
 * shell match arms must not drift. Static reads only, no spawn.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defined } from 'backend/testUtils/indexed'
import { readTauriShellProductionSource } from 'backend/testUtils/tauriShellSource'
import {
  RUST_INVOKE_CHANNELS,
  RUST_SAFETY_CHANNELS
} from '../../common/types/sidecarTransport'

const ROOT = join(__dirname, '..', '..', '..')
const libRs = readFileSync(
  join(ROOT, 'src-tauri/crates/gamelib-safety/src/lib.rs'),
  'utf8'
)

function extractOps(source: string): string[] {
  const m = /pub const OPS:[^=]*=\s*&\[([^\]]*)\]/.exec(source)
  if (!m) throw new Error('OPS not found')
  return [...defined(m[1], 'OPS body').matchAll(/"([^"]+)"/g)].map((x) =>
    defined(x[1], 'OPS entry')
  )
}

function snakeToPascal(s: string): string {
  return s
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
}

const OPS = extractOps(libRs)

describe('safety channel parity (plan 82-05)', () => {
  it('anti-vacuity: extraction found the ops and the extractor rejects a missing const', () => {
    expect(OPS).toHaveLength(2)
    expect(() => extractOps('nothing here')).toThrow('OPS not found')
  })

  it('RUST_SAFETY_CHANNELS equals the crate OPS', () => {
    expect([...RUST_SAFETY_CHANNELS].sort()).toEqual([...OPS].sort())
  })

  it('every safety channel is on the rustInvoke allowlist', () => {
    for (const c of RUST_SAFETY_CHANNELS) {
      expect(RUST_INVOKE_CHANNELS as readonly string[]).toContain(c)
    }
  })
})

describe('safety shell arms', () => {
  const shell = readTauriShellProductionSource()

  it('every op has exactly one router arm and one rpc handler', () => {
    for (const op of OPS) {
      const variant = `RustInvokeChannel::${snakeToPascal(op)}`
      const arm = new RegExp(
        `${variant}\\s*=>\\s*(\\{\\s*)?rpc_${op}\\(args\\)`,
        'g'
      )
      expect((shell.match(arm) ?? []).length).toBe(1)
      expect(
        (shell.match(new RegExp(`fn rpc_${op}\\(`, 'g')) ?? []).length
      ).toBe(1)
      expect(shell).toContain(`gamelib_safety::dispatch("${op}", args)`)
    }
  })

  it('the safety arm file logs nothing (T-28-04)', () => {
    const src = readFileSync(
      join(ROOT, 'src-tauri/src/safety_dispatch.rs'),
      'utf8'
    )
    expect(src).not.toMatch(/log(Info|Warning|Error|Debug)|println!|eprintln!/)
  })
})
