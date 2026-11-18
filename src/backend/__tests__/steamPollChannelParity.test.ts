/**
 * Phase 80 (plan 18): the gamelib-steampoll OPS, the RUST_STEAMPOLL_* channel constants, the TS
 * STEAMPOLL_OPS mirror and the shell match arms must not drift. Static reads only, no spawn.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defined } from 'backend/testUtils/indexed'
import { readTauriShellProductionSource } from 'backend/testUtils/tauriShellSource'
import {
  RUST_INVOKE_CHANNELS,
  RUST_STEAMPOLL_CHANNELS
} from '../../common/types/sidecarTransport'
import { STEAMPOLL_OPS } from '../storeManagers/steam/pollRust/steamPollTypes'

const ROOT = join(__dirname, '..', '..', '..')
const dispatchRs = readFileSync(
  join(ROOT, 'src-tauri/crates/gamelib-steampoll/src/dispatch.rs'),
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

const OPS = extractOps(dispatchRs)

describe('steampoll channel parity (plan 80-18)', () => {
  it('anti-vacuity: extraction found the ops and the extractor rejects a missing const', () => {
    expect(OPS).toHaveLength(29)
    expect(() => extractOps('nothing here')).toThrow('OPS not found')
  })

  it('RUST_STEAMPOLL_CHANNELS and STEAMPOLL_OPS equal the crate OPS', () => {
    expect([...RUST_STEAMPOLL_CHANNELS].sort()).toEqual([...OPS].sort())
    expect([...STEAMPOLL_OPS].sort()).toEqual([...OPS].sort())
  })

  it('every steampoll channel is on the rustInvoke allowlist', () => {
    for (const c of RUST_STEAMPOLL_CHANNELS) {
      expect(RUST_INVOKE_CHANNELS as readonly string[]).toContain(c)
    }
  })
})

describe('steampoll shell arms', () => {
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
      expect(shell).toContain(`gamelib_steampoll::dispatch("${op}", args)`)
    }
  })
})
