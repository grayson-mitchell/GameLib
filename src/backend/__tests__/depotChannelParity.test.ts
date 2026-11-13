/**
 * Phase 73 (D-03): the gamelib-depot OPS, the RUST_DEPOT_* channel constants and the shell match
 * arms must not drift. Static reads only, no spawn.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defined } from 'backend/testUtils/indexed'
import { readTauriShellProductionSource } from 'backend/testUtils/tauriShellSource'
import {
  RUST_DEPOT_CHANNELS,
  RUST_DEPOT_FINALIZE,
  RUST_DEPOT_JOB_CANCEL,
  RUST_DEPOT_JOB_RUN,
  RUST_DEPOT_MANIFEST_SUMMARY,
  RUST_INVOKE_CHANNELS
} from '../../common/types/sidecarTransport'
import { sidecarInternalCallers } from '../../common/types/ipc/sidecarInternal'

const ROOT = join(__dirname, '..', '..', '..')
const libRs = readFileSync(
  join(ROOT, 'src-tauri/crates/gamelib-depot/src/lib.rs'),
  'utf8'
)
const shellSource = readTauriShellProductionSource()

function extractConst(source: string, name: string): string[] {
  const m = new RegExp(`pub const ${name}:[^=]*=\\s*&\\[([^\\]]*)\\]`).exec(
    source
  )
  if (!m) throw new Error(`${name} not found`)
  return [...defined(m[1], `${name} body`).matchAll(/"([^"]+)"/g)].map((x) =>
    defined(x[1], `${name} entry`)
  )
}

const OPS = extractConst(libRs, 'OPS')

function snakeToPascal(s: string): string {
  return s
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
}

describe('depot channel parity (D-03)', () => {
  it('anti-vacuity: OPS extraction found the ops and the extractor rejects a missing name', () => {
    expect(OPS).toHaveLength(4)
    expect(() => extractConst(libRs, 'NO_SUCH_CONST')).toThrow('not found')
  })

  it('RUST_DEPOT_CHANNELS equals the crate OPS', () => {
    expect([...RUST_DEPOT_CHANNELS].sort()).toEqual([...OPS].sort())
    expect(
      [
        RUST_DEPOT_FINALIZE,
        RUST_DEPOT_JOB_CANCEL,
        RUST_DEPOT_JOB_RUN,
        RUST_DEPOT_MANIFEST_SUMMARY
      ].sort()
    ).toEqual([...OPS].sort())
  })

  it('every depot channel is on the rustInvoke allowlist', () => {
    for (const c of RUST_DEPOT_CHANNELS) {
      expect(RUST_INVOKE_CHANNELS as readonly string[]).toContain(c)
    }
  })

  it('every op has exactly one shell arm calling its rpc handler', () => {
    for (const op of OPS) {
      const arm = new RegExp(
        `^ {8}RustInvokeChannel::${snakeToPascal(op)} => rpc_${op}\\(args(, app)?\\),$`,
        'gm'
      )
      expect(shellSource.match(arm) ?? []).toHaveLength(1)
    }
  })

  it('every rpc handler passes through gamelib_depot::dispatch with its own op name', () => {
    for (const op of OPS) {
      const start = shellSource.indexOf(`pub(crate) fn rpc_${op}(`)
      expect(start).toBeGreaterThan(-1)
      const next = shellSource.indexOf('\npub(crate) fn ', start + 10)
      const body = shellSource.slice(start, next === -1 ? undefined : next)
      expect(body).toContain(`gamelib_depot::dispatch(`)
      expect(body).toContain(`"${op}"`)
    }
    expect(
      shellSource.match(/gamelib_depot::dispatch\(/g)?.length
    ).toBeGreaterThanOrEqual(4)
  })

  it('the shell-caller channels Rust invokes exist in sidecarInternal', () => {
    for (const c of [
      'depotCdnToken',
      'depotManifestRequestCode',
      'depotJobEvent'
    ]) {
      expect(Object.keys(sidecarInternalCallers)).toContain(c)
      expect(shellSource).toContain(`"${c}"`)
    }
  })
})
