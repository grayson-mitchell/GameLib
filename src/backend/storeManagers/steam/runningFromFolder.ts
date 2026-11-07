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
