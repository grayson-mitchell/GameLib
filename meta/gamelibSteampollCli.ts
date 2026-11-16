/**
 * Phase 80 plan 17 (D-14): the headless path to the Rust Steam poll replay runner. Jest reaches it
 * only through the `gamelib-steampoll-cli` binary built from
 * `src-tauri/crates/gamelib-steampoll-cli`, mirroring `gamelibSteamfilesCli.ts`.
 *
 * The CLI is spawned argv-form, never via a shell. `replay <timeline.json>` runs the Rust machines
 * over a plan-02 timeline under paused time and prints the JSON stream (same record shape the TS
 * driver freezes into `expected-ts/`).
 *
 * Fake-HOME convention (gamelib-conventions two-profile rule): the CALLER owns the profile and
 * passes the child environment in, built from
 * `createFakeHomeProfile({ prefix: 'gamelib-steampoll-' }).childEnv(process.env)`. This module
 * never assembles an environment of its own. The CLI reads no user profile (replay builds a
 * scratch profile in its own temp dir), so the real-profile arm of the rule is not applicable.
 *
 * `cargo build` is NOT run from here (a fake HOME hides ~/.cargo and ~/.rustup). The build is the
 * caller's prefix step; a missing binary fails with a message naming the command.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const STEAMPOLL_CLI_BUILD_COMMAND =
  'cargo build -p gamelib-steampoll-cli --manifest-path src-tauri/Cargo.toml'

const MAX_BUFFER = 64 * 1024 * 1024

function resolveSteampollCliPath(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): string {
  const targetDir = env.CARGO_TARGET_DIR || join(cwd, 'src-tauri', 'target')
  const exe = process.platform === 'win32' ? '.exe' : ''
  return join(targetDir, 'debug', `gamelib-steampoll-cli${exe}`)
}

function missingBinaryError(cli: string): Error {
  return new Error(
    `gamelib-steampoll-cli not found at ${cli}. Build it with: ${STEAMPOLL_CLI_BUILD_COMMAND} (is cargo on PATH?)`
  )
}

/** Throws the missing-binary error up front when the CLI is not built. */
function assertSteampollCliPresent(
  cli: string = resolveSteampollCliPath()
): void {
  if (!existsSync(cli)) throw missingBinaryError(cli)
}

/** Pure: the replay stdout contract (0 = one JSON array; 2 = bad timeline; 64 = usage). */
function parseSteampollReplayResult(
  timelinePath: string,
  status: number | null,
  stdout: string,
  stderr: string
): unknown[] {
  if (status !== 0) {
    throw new Error(
      `gamelib-steampoll-cli replay ${timelinePath} exited with status ${status}: ${stderr.trim()}`
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new Error(
      `gamelib-steampoll-cli replay ${timelinePath} printed unparseable output: ${stdout.slice(0, 200)}`
    )
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      `gamelib-steampoll-cli replay ${timelinePath} did not print a JSON array`
    )
  }
  return parsed
}

/**
 * Replays one timeline file through the Rust machines and returns the stream.
 *
 * @param env the child environment, from `createFakeHomeProfile(...).childEnv(process.env)`.
 */
export function runSteampollReplaySync(
  timelinePath: string,
  env: NodeJS.ProcessEnv
): unknown[] {
  const cli = resolveSteampollCliPath()
  assertSteampollCliPresent(cli)
  const r = spawnSync(cli, ['replay', timelinePath], {
    env,
    encoding: 'utf-8',
    maxBuffer: MAX_BUFFER
  })
  if (r.error) throw r.error
  return parseSteampollReplayResult(timelinePath, r.status, r.stdout, r.stderr)
}
