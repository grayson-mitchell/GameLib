/**
 * Phase 75 plan 12 (P75-F): one implementation, two front ends. The rustInvoke steamfiles
 * channels, the shell arms and the gamelib-steamfiles library ops must not drift.
 * Static reads only, no spawn.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defined } from 'backend/testUtils/indexed'
import {
  readHandlerBody,
  readTauriShellProductionSource
} from 'backend/testUtils/tauriShellSource'
import {
  RUST_INVOKE_CHANNELS,
  RUST_STEAMFILES_CHANNELS
} from '../../../../../common/types/sidecarTransport'

const ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const libRs = readFileSync(
  join(ROOT, 'src-tauri/crates/gamelib-steamfiles/src/lib.rs'),
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
const CLI_ONLY = extractConst(libRs, 'CLI_ONLY_OPS')

describe('steamfiles channel parity (P75-F)', () => {
  it('anti-vacuity: OPS extraction found the ops', () => {
    expect(OPS.length).toBeGreaterThanOrEqual(10)
    expect(CLI_ONLY.length).toBeGreaterThanOrEqual(1)
  })

  it('channels equal OPS minus CLI_ONLY_OPS', () => {
    const expected = OPS.filter((o) => !CLI_ONLY.includes(o)).sort()
    expect([...RUST_STEAMFILES_CHANNELS].sort()).toEqual(expected)
  })

  it('every shell steamfiles arm validates via its generated Args then passes straight to gamelib_steamfiles::dispatch', () => {
    const router = [
      ...shellSource.matchAll(
        /^ {8}RustInvokeChannel::(Steamfiles[A-Za-z0-9]+) => rpc_(\w+)\(args\),$/gm
      )
    ]
    const arms: string[] = []
    for (const m of router) {
      const snakeArm = defined(m[1], 'steamfiles arm name')
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toLowerCase()
      expect(defined(m[2], 'steamfiles handler name')).toBe(snakeArm)
      arms.push(snakeArm)
      const body = readHandlerBody(shellSource, snakeArm, 2)
        .split('\n')
        .filter((l) => l.trim() !== '')
      const [first, second] = body
      expect(body).toHaveLength(2)
      expect(first).toMatch(/^\s*[A-Za-z]+Args::from_args\(args\)\?;$/)
      expect(second).toContain(
        `gamelib_steamfiles::dispatch("${snakeArm}", args)`
      )
    }
    expect(arms.length).toBeGreaterThanOrEqual(10)
    expect(arms.length).toBe(RUST_STEAMFILES_CHANNELS.length)
    expect(arms.sort()).toEqual([...RUST_STEAMFILES_CHANNELS].sort())
  })

  it('every steamfiles channel is allow-listed in RUST_INVOKE_CHANNELS', () => {
    const all = new Set<string>(RUST_INVOKE_CHANNELS)
    for (const c of RUST_STEAMFILES_CHANNELS) expect(all.has(c)).toBe(true)
  })

  it('no steamfiles channel is unbounded', () => {
    const rpc = readFileSync(
      join(ROOT, 'src/backend/sidecar/sidecarRpc.ts'),
      'utf8'
    )
    expect(rpc).not.toContain('steamfiles')
  })
})
