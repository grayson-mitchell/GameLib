/**
 * Phase 63 (D-03, D-01): one implementation, two front ends. The rustInvoke scan
 * channels, the shell arms and the gamelib-scan library ops must not drift.
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
  RUST_SCAN_CHANNELS
} from '../../../common/types/sidecarTransport'
import { CLI_ONLY_SCAN_OPS, SCAN_OPS } from '../scanTypes'

const ROOT = join(__dirname, '..', '..', '..', '..')
const libRs = readFileSync(
  join(ROOT, 'src-tauri/crates/gamelib-scan/src/lib.rs'),
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

  it('every shell scan arm validates via its generated Args then passes straight to gamelib_scan::dispatch', () => {
    // Phase 71 D-04: the dispatcher arm is a one-line call `RustInvokeChannel::X => rpc_x(args),`
    // and the body lives in the `rpc_<wire>` handler.
    const router = [
      ...shellSource.matchAll(
        /^ {8}RustInvokeChannel::(Scan[A-Za-z0-9]+) => rpc_(\w+)\(args\),$/gm
      )
    ]
    const arms: string[] = []
    for (const m of router) {
      // Arms match the generated enum (67-11): ScanSteamDrm -> scan_steam_drm.
      const snakeArm = defined(m[1], 'scan arm name')
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toLowerCase()
      expect(defined(m[2], 'scan handler name')).toBe(snakeArm)
      arms.push(snakeArm)
      // Phase 67 (D-13): the first line validates through the generated Args struct, the
      // second passes straight to the library, which stays the stricter authority.
      const body = readHandlerBody(shellSource, snakeArm, 2)
        .split('\n')
        .filter((l) => l.trim() !== '')
      const [first, second] = body
      expect(body).toHaveLength(2)
      expect(first).toMatch(
        new RegExp(`^\\s*[A-Za-z]+Args::from_args\\(args\\)\\?;$`)
      )
      expect(second).toContain(`gamelib_scan::dispatch("${snakeArm}", args)`)
    }
    expect(arms.length).toBe(RUST_SCAN_CHANNELS.length)
    expect(arms.sort()).toEqual([...RUST_SCAN_CHANNELS].sort())
  })

  it('every scan channel is allow-listed in RUST_INVOKE_CHANNELS', () => {
    const all = new Set<string>(RUST_INVOKE_CHANNELS)
    for (const c of RUST_SCAN_CHANNELS) expect(all.has(c)).toBe(true)
  })
})
