/**
 * Phase 73 plan 15 (63 D-01/D-02 CLI requirement): the headless path to the Rust depot pipeline.
 * `meta/` tools reach it only through the `gamelib-depot-cli` binary built from
 * `src-tauri/crates/gamelib-depot-cli`.
 *
 * Spawned argv-form, never via a shell. Job and tokens go in on stdin, never on the command line
 * (argv is visible to other processes).
 *
 * Fake-HOME convention (gamelib-conventions two-profile rule, isolated half): every
 * `runDepotCli` call gets a FRESH `createFakeHomeProfile({ prefix: 'depot-cli' })` because the CLI
 * reads no environment and no profile. The profile is disposed in `finally`.
 *
 * `cargo build` is NOT run from here: a fake HOME hides ~/.cargo and ~/.rustup. The build is the
 * package.json `depot-cli:build` prefix on the scripts that need the binary. A missing binary
 * fails with a message naming that command.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { createFakeHomeProfile } from '../src/backend/testUtils/fakeHomeProfile'

export const DEPOT_CLI_BUILD_COMMAND = 'pnpm depot-cli:build'

export type DepotCliMode = 'run' | 'verify' | 'summarize'

export interface DepotCliInput {
  /** `job` for run/verify, `request` for summarize. */
  job?: unknown
  request?: unknown
  /** CDN host -> token. Never echoed by the CLI. */
  tokens?: Record<string, string>
}

export interface DepotCliEvent {
  jobId: string
  seq: number
  kind: string
  [k: string]: unknown
}

export type DepotCliFinal =
  | { ok: true; result: unknown }
  | { ok: false; error: string }

export interface DepotCliRun {
  events: DepotCliEvent[]
  final: DepotCliFinal
  status: number | null
}

export function resolveDepotCliPath(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): string {
  const targetDir = env.CARGO_TARGET_DIR || join(cwd, 'src-tauri', 'target')
  const exe = process.platform === 'win32' ? '.exe' : ''
  return join(targetDir, 'debug', `gamelib-depot-cli${exe}`)
}

export function assertDepotCliPresent(
  cli: string = resolveDepotCliPath()
): void {
  if (!existsSync(cli)) {
    throw new Error(
      `gamelib-depot-cli not found at ${cli}. Build it with: ${DEPOT_CLI_BUILD_COMMAND} (is cargo on PATH?)`
    )
  }
}

/**
 * Pure: split stdout into events and the single final `{ok,...}` line. Event lines carry no `ok`
 * key; exactly one line must.
 */
export function parseDepotCliOutput(stdout: string): {
  events: DepotCliEvent[]
  final: DepotCliFinal
} {
  const events: DepotCliEvent[] = []
  let final: DepotCliFinal | undefined
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(line) as Record<string, unknown>
    } catch {
      throw new Error('gamelib-depot-cli printed an unparseable line')
    }
    if ('ok' in parsed) {
      if (final) throw new Error('gamelib-depot-cli printed two final lines')
      final = parsed as unknown as DepotCliFinal
    } else {
      events.push(parsed as unknown as DepotCliEvent)
    }
  }
  if (!final) throw new Error('gamelib-depot-cli printed no final line')
  return { events, final }
}

export async function runDepotCli(
  mode: DepotCliMode,
  input: DepotCliInput | string,
  opts: { cacheDir: string; cli?: string }
): Promise<DepotCliRun> {
  const cli = opts.cli ?? resolveDepotCliPath()
  assertDepotCliPresent(cli)
  const profile = createFakeHomeProfile({ prefix: 'depot-cli' })
  try {
    const stdin = typeof input === 'string' ? input : JSON.stringify(input)
    return await new Promise<DepotCliRun>((resolve, reject) => {
      const child = spawn(cli, ['--cache-dir', opts.cacheDir, mode], {
        env: profile.childEnv(process.env),
        stdio: ['pipe', 'pipe', 'ignore']
      })
      const chunks: Buffer[] = []
      child.stdout.on('data', (c: Buffer) => chunks.push(c))
      child.on('error', reject)
      child.on('close', (status) => {
        // 0 = ok, 2 = `{ok:false}`; anything else (64 usage, signal) is a harness failure.
        if (status !== 0 && status !== 2) {
          reject(new Error(`gamelib-depot-cli ${mode} exited with ${status}`))
          return
        }
        try {
          const parsed = parseDepotCliOutput(Buffer.concat(chunks).toString())
          resolve({ ...parsed, status })
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      })
      child.stdin.on('error', () => undefined)
      child.stdin.end(stdin)
    })
  } finally {
    try {
      profile.dispose()
    } catch {
      /* best effort */
    }
  }
}
