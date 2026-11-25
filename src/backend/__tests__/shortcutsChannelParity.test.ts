/**
 * Phase 94 (plan 11): the gamelib-shortcuts OPS, the RUST_SHORTCUTS_* channel constants and the shell match
 * arms must not drift. Static reads only, no spawn. Each later shortcuts plan adds its op to all three and
 * this test holds them together.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defined } from 'backend/testUtils/indexed'
import { readTauriShellProductionSource } from 'backend/testUtils/tauriShellSource'
import {
  RUST_INVOKE_CHANNELS,
  RUST_SHORTCUTS_CHANNELS
} from '../../common/types/sidecarTransport'

const ROOT = join(__dirname, '..', '..', '..')
const libRs = readFileSync(
  join(ROOT, 'src-tauri/crates/gamelib-shortcuts/src/lib.rs'),
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

describe('shortcuts channel parity (plan 94-11)', () => {
  it('anti-vacuity: extraction found the ops and the extractor rejects a missing const', () => {
    expect(OPS.length).toBeGreaterThanOrEqual(1)
    expect(() => extractOps('nothing here')).toThrow('OPS not found')
  })

  it('RUST_SHORTCUTS_CHANNELS equals the crate OPS', () => {
    expect([...RUST_SHORTCUTS_CHANNELS].sort()).toEqual([...OPS].sort())
  })

  it('every shortcuts channel is on the rustInvoke allowlist', () => {
    for (const c of RUST_SHORTCUTS_CHANNELS) {
      expect(RUST_INVOKE_CHANNELS as readonly string[]).toContain(c)
    }
  })
})

describe('shortcuts shell arms', () => {
  const shell = readTauriShellProductionSource()

  it('every op has exactly one router arm, one rpc handler and one crate call', () => {
    for (const op of OPS) {
      const variant = `RustInvokeChannel::${snakeToPascal(op)}`
      const arm = new RegExp(
        `${variant}\\s*=>\\s*(\\{\\s*)?shortcuts_dispatch::rpc_${op}\\(args\\)`,
        'g'
      )
      expect((shell.match(arm) ?? []).length).toBe(1)
      expect(
        (shell.match(new RegExp(`fn rpc_${op}\\(`, 'g')) ?? []).length
      ).toBe(1)
      expect(shell).toContain(`gamelib_shortcuts::dispatch_sync("${op}"`)
    }
  })
})
