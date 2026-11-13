/**
 * Phase 75 plan 17 (P75-C, 63 D-01/D-04): the headless path to the Rust Steam file readers. `meta/`
 * tools reach them only through the `gamelib-steamfiles-cli` binary built from
 * `src-tauri/crates/gamelib-steamfiles-cli`, mirroring `gamelibScanCli.ts`.
 *
 * The CLI is spawned argv-form, never via a shell; JSON args are serialised, never interpolated.
 *
 * Fake-HOME convention (gamelib-conventions two-profile rule): every `runSteamfilesCliSync` call
 * gets a FRESH `createFakeHomeProfile({ prefix: 'gamelib-steamfiles-' })`. Every input the census
 * hands the CLI is an explicit path, so the CLI never reads a profile: the real-profile arm
 * (two-profile rule, half 2) was considered and is not applicable.
 *
 * `cargo build` is NOT run from here (a fake HOME hides ~/.cargo and ~/.rustup). The build is the
 * package.json `steamfiles-cli:build` prefix on the scripts that need the binary; a missing binary
 * fails with a message naming that command.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { createFakeHomeProfile } from '../src/backend/testUtils/fakeHomeProfile'
import type {
  SteamFilesArgsFor,
  SteamFilesResultFor
} from '../src/backend/storeManagers/steam/localFiles/steamFilesTypes'
import type { RustSteamFilesChannel } from '../src/common/types/sidecarTransport'

const STEAMFILES_CLI_BUILD_COMMAND =
  'cargo build -p gamelib-steamfiles-cli --manifest-path src-tauri/Cargo.toml'

const MAX_BUFFER = 16 * 1024 * 1024

export function resolveSteamfilesCliPath(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): string {
  const targetDir = env.CARGO_TARGET_DIR || join(cwd, 'src-tauri', 'target')
  const exe = process.platform === 'win32' ? '.exe' : ''
  return join(targetDir, 'debug', `gamelib-steamfiles-cli${exe}`)
}

function missingBinaryError(cli: string): Error {
  return new Error(
    `gamelib-steamfiles-cli not found at ${cli}. Build it with: ${STEAMFILES_CLI_BUILD_COMMAND} (is cargo on PATH?)`
  )
}

/**
 * Throws the missing-binary error up front when the CLI is not built, so a caller that swallows
 * per-dir failures aborts instead of reading every bottle as empty.
 */
export function assertSteamfilesCliPresent(
  cli: string = resolveSteamfilesCliPath()
): void {
  if (!existsSync(cli)) throw missingBinaryError(cli)
}

/** Pure: the single-shot stdout contract (0 = one JSON value; 2 = dispatch error; 64 = usage). */
export function parseSteamfilesCliResult(
  op: string,
  status: number | null,
  stdout: string,
  stderr: string
): unknown {
  if (status !== 0) {
    throw new Error(
      `gamelib-steamfiles-cli ${op} exited with status ${status}: ${stderr.trim()}`
    )
  }
  try {
    return JSON.parse(stdout)
  } catch {
    throw new Error(
      `gamelib-steamfiles-cli ${op} printed unparseable output: ${stdout.slice(0, 200)}`
    )
  }
}

export function runSteamfilesCliSync<Op extends RustSteamFilesChannel>(
  op: Op,
  args: SteamFilesArgsFor<Op>
): SteamFilesResultFor<Op> {
  const cli = resolveSteamfilesCliPath()
  assertSteamfilesCliPresent(cli)
  const profile = createFakeHomeProfile({ prefix: 'gamelib-steamfiles-' })
  try {
    const r = spawnSync(cli, [op, JSON.stringify(args)], {
      env: profile.childEnv(process.env),
      encoding: 'utf-8',
      maxBuffer: MAX_BUFFER
    })
    if (r.error) throw r.error
    return parseSteamfilesCliResult(
      op,
      r.status,
      r.stdout,
      r.stderr
    ) as SteamFilesResultFor<Op>
  } finally {
    try {
      profile.dispose()
    } catch {
      /* best effort */
    }
  }
}
