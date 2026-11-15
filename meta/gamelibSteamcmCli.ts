/**
 * Phase 79 plan 21: the headless path to the Rust Steam CM client. `meta/` tools reach it only
 * through the `gamelib-steamcm-cli` binary built from `src-tauri/crates/gamelib-steamcm-cli`,
 * mirroring `gamelibSteamfilesCli.ts`.
 *
 * The CLI is spawned argv-form, never via a shell; JSON args are serialised, never interpolated.
 * Secrets (refresh tokens, passwords, Steam Guard codes, product keys) NEVER go on argv: argv is
 * visible in `ps` (T-79-70). The single-shot helper refuses secret-bearing ops, as the CLI does,
 * (the stdin NDJSON runners were removed with the TS-vs-Rust sweeps in 79-42).
 *
 * Fake-HOME convention (gamelib-conventions two-profile rule): every call gets a FRESH
 * `createFakeHomeProfile({ prefix: 'gamelib-steamcm-' })`, so every CLI child is isolated. A
 * caller that must hand the CLI a real token (a live sweep) is the named real-profile arm of the
 * rule and must say so where it lives; this module never reads a profile itself.
 *
 * `cargo build` is NOT run from here (a fake HOME hides ~/.cargo and ~/.rustup). The build is the
 * package.json `steamcm-cli:build` prefix on the scripts that need the binary.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { createFakeHomeProfile } from '../src/backend/testUtils/fakeHomeProfile'

const STEAMCM_CLI_BUILD_COMMAND =
  'cargo build -p gamelib-steamcm-cli --manifest-path src-tauri/Cargo.toml'

const MAX_BUFFER = 16 * 1024 * 1024

/** Mirrors `SECRET_OPS` in gamelib-steamcm-cli/src/main.rs. */
export const STEAMCM_SECRET_OPS: readonly string[] = [
  'steamcm_session_acquire',
  'steamcm_signin_credentials_start',
  'steamcm_signin_guard_submit',
  'steamcm_redeem_key'
]

export type SteamcmNdjsonReply =
  | { ok: true; result: unknown }
  | { ok: false; error: unknown }

export function resolveSteamcmCliPath(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): string {
  const targetDir = env.CARGO_TARGET_DIR || join(cwd, 'src-tauri', 'target')
  const exe = process.platform === 'win32' ? '.exe' : ''
  return join(targetDir, 'debug', `gamelib-steamcm-cli${exe}`)
}

function missingBinaryError(cli: string): Error {
  return new Error(
    `gamelib-steamcm-cli not found at ${cli}. Build it with: ${STEAMCM_CLI_BUILD_COMMAND} (is cargo on PATH?)`
  )
}

export function assertSteamcmCliPresent(
  cli: string = resolveSteamcmCliPath()
): void {
  if (!existsSync(cli)) throw missingBinaryError(cli)
}

/** Pure: the single-shot stdout contract (0 = one JSON value; 2 = dispatch error; 64 = usage). */
export function parseSteamcmCliResult(
  op: string,
  status: number | null,
  stdout: string,
  stderr: string
): unknown {
  if (status !== 0) {
    throw new Error(
      `gamelib-steamcm-cli ${op} exited with status ${status}: ${stderr.trim()}`
    )
  }
  try {
    return JSON.parse(stdout)
  } catch {
    throw new Error(
      `gamelib-steamcm-cli ${op} printed unparseable output: ${stdout.slice(0, 200)}`
    )
  }
}

/** Pure: one stdout line per request, in order. */
export function parseSteamcmNdjson(stdout: string): SteamcmNdjsonReply[] {
  return stdout
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as SteamcmNdjsonReply)
}

export function runSteamcmCliSync(
  op: string,
  args: Record<string, unknown>
): unknown {
  if (STEAMCM_SECRET_OPS.includes(op)) {
    throw new Error(`${op} takes secrets: never put them on argv (T-79-70)`)
  }
  const cli = resolveSteamcmCliPath()
  assertSteamcmCliPresent(cli)
  const profile = createFakeHomeProfile({ prefix: 'gamelib-steamcm-' })
  try {
    const r = spawnSync(cli, [op, JSON.stringify(args)], {
      env: profile.childEnv(process.env),
      encoding: 'utf-8',
      maxBuffer: MAX_BUFFER
    })
    if (r.error) throw r.error
    return parseSteamcmCliResult(op, r.status, r.stdout, r.stderr)
  } finally {
    try {
      profile.dispose()
    } catch {
      /* best effort */
    }
  }
}
