/**
 * quick 261107-td5: "is any process running from this folder?" for the
 * Steam delete route.
 *
 * Why: in live gate D on 2026-11-07, macOS registry.vdf had no RunningAppID,
 * so readRunningAppId() returned 0 while WazHack ran natively. Only Steam's
 * own EAppUpdateError 16 saved the files. This check looks at the process
 * table instead, so it does not depend on Steam's registry.
 *
 * Windows keeps its registry read: GameLib's native Steam delete runs on
 * macOS/Linux, and a path-based Windows check is not cheap without
 * wmic/PowerShell, so win32 returns false here.
 */
import { spawn } from 'child_process'
import { isAbsolute, parse, resolve, sep } from 'path'

import type { ProcessRunner } from 'backend/process/types'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'

function normalizeFolder(folder: string): string {
  if (!folder) throw new Error('folder is empty')
  if (!isAbsolute(folder)) throw new Error(`folder is not absolute: ${folder}`)
  let normalized = resolve(folder)
  while (normalized.length > 1 && normalized.endsWith(sep)) {
    normalized = normalized.slice(0, -1)
  }
  if (!isAbsolute(normalized) || normalized === parse(normalized).root) {
    throw new Error(`folder is not a usable absolute path: ${folder}`)
  }
  return normalized
}

/**
 * True when any line of `output` contains `<folder>/`. Substring match so
 * folders with spaces work; the trailing separator stops `WazHack2` matching
 * `WazHack`. Throws on an empty, relative or root folder so it can never
 * match everything.
 */
export function psOutputHasFolder(output: string, folder: string): boolean {
  const needle = normalizeFolder(folder) + sep
  return output.split('\n').some((line) => line.includes(needle))
}

/** Steam client helpers that must never be signalled (quick 261111-9b7). */
const STEAM_HELPER =
  /steam_osx|steamwebhelper|steamerrorreporter|ipcserver|gameoverlayui|Steam Helper|Steam\.AppBundle\//i

/**
 * Pids from `ps -o pid=,args=` output whose executable (argv[0]) lives inside
 * `folder`. startsWith, not includes: only the process whose executable is in
 * the install folder may be signalled, so a sibling folder, a process that
 * merely names the folder as an argument, and Steam helpers are excluded. The
 * boolean delete-route check above is intentionally broader.
 */
export function psOutputPidsInFolder(
  output: string,
  folder: string,
  excludePids: readonly number[] = []
): number[] {
  const prefix = normalizeFolder(folder) + sep
  const pids = new Set<number>()
  for (const line of output.split('\n')) {
    const m = /^\s*(\d+)\s+(.+)$/.exec(line)
    if (!m) continue
    const pid = Number(m[1])
    const args = m[2] ?? ''
    if (!Number.isSafeInteger(pid) || pid <= 1) continue
    if (excludePids.includes(pid)) continue
    if (!args.startsWith(prefix)) continue
    if (STEAM_HELPER.test(args)) continue
    pids.add(pid)
  }
  return [...pids].sort((a, b) => a - b)
}

export interface PidScanDeps {
  runner: { run: ProcessRunner['run'] }
  platform: NodeJS.Platform
}

export async function findPidsRunningFromFolder(
  deps: PidScanDeps,
  folder: string,
  opts: { timeoutMs?: number; excludePids?: readonly number[] } = {}
): Promise<number[]> {
  if (deps.platform === 'win32') return []
  normalizeFolder(folder) // reject a bad folder before anything runs
  const res = await deps.runner.run(
    '/bin/ps',
    ['-A', '-ww', '-o', 'pid=,args='],
    { timeoutMs: opts.timeoutMs ?? 2000 }
  )
  if (res.timedOut || res.aborted || res.code !== 0) {
    throw new Error(
      `ps failed (code ${res.code}${res.timedOut ? ', timed out' : ''})`
    )
  }
  return psOutputPidsInFolder(res.stdout, folder, opts.excludePids)
}

interface RunningFromFolderDeps {
  platform?: NodeJS.Platform
  runPs?: () => Promise<string>
  timeoutMs?: number
}

/**
 * `ps` reads only the process table, so the isolated fake-HOME profile is
 * correct here and no real-profile arm is needed.
 */
function defaultRunPs(timeoutMs: number): Promise<string> {
  const profile = createFakeHomeProfile({
    prefix: 'gamelib-steam-running-probe-'
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  return new Promise<string>((resolvePs, reject) => {
    const child = spawn('/bin/ps', ['-A', '-ww', '-o', 'args='], {
      env: profile.childEnv(),
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    })
    child.unref()
    let out = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString()
    })
    timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // already gone
      }
      reject(new Error(`ps timed out after ${timeoutMs} ms`))
    }, timeoutMs)
    timer.unref()
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolvePs(out)
      else reject(new Error(`ps exited ${code}`))
    })
  }).finally(() => {
    if (timer) clearTimeout(timer)
    profile.dispose()
  })
}

export async function isProcessRunningFromFolder(
  folder: string,
  deps: RunningFromFolderDeps = {}
): Promise<boolean> {
  const platform = deps.platform ?? process.platform
  if (platform === 'win32') return false
  normalizeFolder(folder) // reject a bad folder before anything spawns
  const runPs = deps.runPs ?? (() => defaultRunPs(deps.timeoutMs ?? 2000))
  return psOutputHasFolder(await runPs(), folder)
}
