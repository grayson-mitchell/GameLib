/**
 * Phase 63 plan 10 (D-01/D-04): the headless path to the Rust scanners. `meta/` tools reach Rust
 * only through the `gamelib-scan-cli` binary built from `src-tauri/crates/gamelib-scan-cli`.
 *
 * The CLI is spawned argv-form, never via a shell; JSON args are serialised, never interpolated.
 *
 * Fake-HOME convention (gamelib-conventions two-profile rule, isolated half): every
 * `runScanCliSync` call gets a FRESH `createFakeHomeProfile({ prefix: 'gamelib-scan-' })`
 * because the CLI reads no profile. The CLI also has a `--ndjson` batch mode; the TS helper for it
 * was removed with the parity sweep (63-14), `parseNdjsonLines` remains for its output.
 *
 * `cargo build` is NOT run from here. A fake HOME hides ~/.cargo and ~/.rustup, so the build is
 * the package.json `scan-cli:build` prefix on the scripts that need the binary, run in the
 * operator's real environment. A missing binary fails with a message naming that command.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { createFakeHomeProfile } from '../src/backend/testUtils/fakeHomeProfile'
import type {
  ScanArgsFor,
  ScanOp,
  ScanResultFor
} from '../src/backend/scanners/scanTypes'

const SCAN_CLI_BUILD_COMMAND =
  'cargo build -p gamelib-scan-cli --manifest-path src-tauri/Cargo.toml'

const MAX_BUFFER = 16 * 1024 * 1024

export function resolveScanCliPath(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): string {
  const targetDir = env.CARGO_TARGET_DIR || join(cwd, 'src-tauri', 'target')
  const exe = process.platform === 'win32' ? '.exe' : ''
  return join(targetDir, 'debug', `gamelib-scan-cli${exe}`)
}

function missingBinaryError(cli: string): Error {
  return new Error(
    `gamelib-scan-cli not found at ${cli}. Build it with: ${SCAN_CLI_BUILD_COMMAND} (is cargo on PATH?)`
  )
}

/** Pure: the single-shot stdout contract (0 = one JSON value; 2 = dispatch error; 64 = usage). */
export function parseCliResult(
  op: string,
  status: number | null,
  stdout: string,
  stderr: string
): unknown {
  if (status !== 0) {
    throw new Error(
      `gamelib-scan-cli ${op} exited with status ${status}: ${stderr.trim()}`
    )
  }
  try {
    return JSON.parse(stdout)
  } catch {
    throw new Error(
      `gamelib-scan-cli ${op} printed unparseable output: ${stdout.slice(0, 200)}`
    )
  }
}

export type NdjsonLine =
  | { ok: true; result: unknown }
  | { ok: false; error: string }

/** Pure: one parsed `{ok,...}` object per non-empty line. */
export function parseNdjsonLines(text: string): NdjsonLine[] {
  return text
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as NdjsonLine)
}

export function runScanCliSync<Op extends ScanOp>(
  op: Op,
  args: ScanArgsFor<Op>
): ScanResultFor<Op> {
  const cli = resolveScanCliPath()
  if (!existsSync(cli)) throw missingBinaryError(cli)
  const profile = createFakeHomeProfile({ prefix: 'gamelib-scan-' })
  try {
    const r = spawnSync(cli, [op, JSON.stringify(args)], {
      env: profile.childEnv(process.env),
      encoding: 'utf-8',
      maxBuffer: MAX_BUFFER
    })
    if (r.error) throw r.error
    return parseCliResult(op, r.status, r.stdout, r.stderr) as ScanResultFor<Op>
  } finally {
    try {
      profile.dispose()
    } catch {
      /* best effort */
    }
  }
}
