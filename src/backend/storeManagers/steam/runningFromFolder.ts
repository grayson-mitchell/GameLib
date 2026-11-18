/**
 * quick 261107-td5: "is any process running from this folder?" for the
 * Steam delete route.
 *
 * Why: in live gate D on 2026-11-07, macOS registry.vdf had no RunningAppID,
 * so readRunningAppId() returned 0 while WazHack ran natively. Only Steam's
 * own EAppUpdateError 16 saved the files. This check looks at the process
 * table instead, so it does not depend on Steam's registry.
 *
 * Windows: `findPidsRunningFromFolder` has a PowerShell CIM arm (quick
 * 261111-9p6) that lists processes by ExecutablePath for Stop.
 * `isProcessRunningFromFolder` still returns false on win32 because the
 * delete route keeps its registry read. The PowerShell child reads only the
 * process table and runs with -NoProfile, so no env is passed (the two-profile
 * rule: nothing profile-dependent, hence no real-profile arm), exactly as the
 * posix `ps` arm and steamClientProcess.ts do.
 *
 * quick 261119-gzt: on darwin, `lsof -d txt` resolves the executable path of a
 * process whose ps argv[0] is relative (`./Game.bin.osx`). Like `ps` it reads
 * only the process table and passes no env, so no real-profile arm is needed.
 */
import { isAbsolute, parse, resolve, sep, win32 } from 'path'

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
 * An sh-family interpreter, zero or more single-dash option tokens, then a
 * script operand. Matched at the start of a ps `args` text; the rest must then
 * start with the install-folder prefix. `-c` is allowed as an option token, so
 * `bash -c <folder>/run.sh` matches, but `zsh -c source x && cd <folder>/y`
 * does not, because the text after the options does not start with the folder.
 */
const SHELL_LAUNCHER =
  /^(?:\/[^\s]*\/)?(?:sh|bash|dash|ksh|zsh)\s+(?:-[A-Za-z]+\s+)*/

const PS_LINE = /^\s*(\d+)\s+(.+)$/

function usablePid(pid: number, excludePids: readonly number[]): boolean {
  return Number.isSafeInteger(pid) && pid > 1 && !excludePids.includes(pid)
}

/**
 * Pids from `ps -o pid=,args=` output that belong to `folder`. startsWith, not
 * includes: a process matches when its executable (argv[0]) lives inside the
 * folder, or when it is an sh-family interpreter running a script that lives
 * there (the shell launcher of a game, e.g. Bastion's
 * `/bin/bash <folder>/Bastion.app/Contents/MacOS/Bastion`). A sibling folder, a
 * process that merely names the folder as an argument (`tail -f <folder>/log`,
 * `zsh -c source ... <folder>/x`), and Steam helpers are excluded. The boolean
 * delete-route check above is intentionally broader.
 */
export function psOutputPidsInFolder(
  output: string,
  folder: string,
  excludePids: readonly number[] = []
): number[] {
  const prefix = normalizeFolder(folder) + sep
  const pids = new Set<number>()
  for (const line of output.split('\n')) {
    const m = PS_LINE.exec(line)
    if (!m) continue
    const pid = Number(m[1])
    const args = m[2] ?? ''
    if (!usablePid(pid, excludePids)) continue
    if (!args.startsWith(prefix)) {
      const shell = SHELL_LAUNCHER.exec(args)
      if (!shell || !args.slice(shell[0].length).startsWith(prefix)) continue
    }
    if (STEAM_HELPER.test(args)) continue
    pids.add(pid)
  }
  return [...pids].sort((a, b) => a - b)
}

/**
 * Pids from `ps -o pid=,args=` output whose argv[0] is a relative path
 * (`./Game.bin.osx`, `../bin/game`, `a/b`): ps prints argv, not the executable
 * path, so these can only be matched to the install folder by resolving their
 * real executable. Excludes `-zsh`, `login` and `(sshd)` (no slash), absolute
 * paths, Steam helpers and unusable or excluded pids.
 */
export function psOutputRelativeArgvPids(
  output: string,
  excludePids: readonly number[] = []
): number[] {
  const pids = new Set<number>()
  for (const line of output.split('\n')) {
    const m = PS_LINE.exec(line)
    if (!m) continue
    const pid = Number(m[1])
    const args = m[2] ?? ''
    if (!usablePid(pid, excludePids)) continue
    const argv0 = args.split(/\s+/)[0] ?? ''
    if (argv0.startsWith('/') || !argv0.includes('/')) continue
    if (STEAM_HELPER.test(args)) continue
    pids.add(pid)
  }
  return [...pids].sort((a, b) => a - b)
}

/**
 * Parse `lsof -F pn` output (with `-d txt`): a `p<pid>` line starts a record,
 * and the first `n` line after an `ftxt` line is that pid's executable (the
 * kernel-reported path, like proc_pidpath). Later txt names (dyld, dylibs) and
 * non-txt descriptors are ignored. Never throws.
 */
export function lsofExecutablePaths(output: string): Map<number, string> {
  const out = new Map<number, string>()
  let pid: number | undefined
  let sawTxt = false
  for (const line of output.split('\n')) {
    const tag = line[0]
    const value = line.slice(1)
    if (tag === 'p') {
      const n = /^\d+$/.test(value) ? Number(value) : NaN
      pid = Number.isSafeInteger(n) ? n : undefined
      sawTxt = false
    } else if (tag === 'f') {
      sawTxt = value === 'txt'
    } else if (tag === 'n') {
      if (pid !== undefined && sawTxt && !out.has(pid) && value) {
        out.set(pid, value)
      }
      sawTxt = false
    }
  }
  return out
}

/**
 * Absolute path under %SystemRoot%\System32 (never a PATH lookup). Reads the
 * environment at call time, not module load.
 */
export function windowsSystem32Path(...parts: string[]): string {
  return win32.join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    ...parts
  )
}

/**
 * Constant PowerShell script: the folder and appId are never interpolated;
 * matching happens in JS. ErrorActionPreference=Stop makes a failed CIM query
 * exit non-zero rather than look like an empty list; UTF-8 output keeps
 * non-ASCII install folders intact (measured: without it an a-umlaut arrives
 * as OEM byte 0x84 and the match silently fails).
 */
const WINDOWS_PROCESS_LIST_SCRIPT =
  '$ErrorActionPreference = "Stop"; ' +
  '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; ' +
  'Get-CimInstance -ClassName Win32_Process -Property ProcessId,ExecutablePath | ' +
  'Where-Object { $_.ExecutablePath } | ' +
  'ForEach-Object { "$($_.ProcessId) $($_.ExecutablePath)" }'

function normalizeWindowsFolder(folder: string): string {
  if (!folder) throw new Error('folder is empty')
  if (!win32.isAbsolute(folder)) {
    throw new Error(`folder is not absolute: ${folder}`)
  }
  // drive-relative `C:Game` is not absolute under win32.isAbsolute
  let normalized = win32.resolve(folder)
  while (normalized.length > 1 && normalized.endsWith('\\')) {
    normalized = normalized.slice(0, -1)
  }
  const root = win32.parse(normalized).root
  if (
    !win32.isAbsolute(normalized) ||
    normalized === root ||
    normalized + '\\' === root
  ) {
    throw new Error(`folder is not a usable absolute path: ${folder}`)
  }
  return normalized
}

/**
 * Pids from the PowerShell `<pid> <ExecutablePath>` listing whose executable
 * lives inside `folder`. Case-insensitive and separator-agnostic, with
 * path.win32 explicitly so ubuntu CI and Windows agree. The trailing
 * separator stops `Game2` matching `Game`. Throws on an empty, relative,
 * drive-relative or root folder so it can never match everything.
 */
export function windowsProcessListPidsInFolder(
  output: string,
  folder: string,
  excludePids: readonly number[] = []
): number[] {
  const prefix = normalizeWindowsFolder(folder).toLowerCase() + '\\'
  const pids = new Set<number>()
  for (const line of output.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(line)
    if (!m) continue
    const pid = Number(m[1])
    if (!Number.isSafeInteger(pid) || pid <= 0) continue
    if (excludePids.includes(pid)) continue
    const exe = (m[2] ?? '')
      .replace(/\//g, '\\')
      .replace(/^\\\\\?\\(?=[A-Za-z]:)/, '')
    if (!exe.toLowerCase().startsWith(prefix)) continue
    if (STEAM_HELPER.test(exe)) continue
    pids.add(pid)
  }
  return [...pids].sort((a, b) => a - b)
}

export interface PidScanDeps {
  runner: { run: ProcessRunner['run'] }
  platform: NodeJS.Platform
  /** linux: /proc/<pid>/exe, resolves a relative-argv candidate */
  readExe?: (pid: number) => string | undefined
  realpath?: (p: string) => string
}

/**
 * Resolve ps lines whose argv[0] is relative to a real executable path and keep
 * those inside `folder` (or its realpath). darwin: one bounded lsof over only
 * the candidate pids, never with an empty list. linux: `readExe`
 * (/proc/<pid>/exe). Admission is by the kernel-reported executable, never by
 * argv text. Never throws: a failed lookup means "no relative matches".
 */
async function resolveRelativeArgvPids(
  deps: PidScanDeps,
  folder: string,
  candidates: readonly number[],
  timeoutMs: number
): Promise<number[]> {
  if (candidates.length === 0) return []
  const roots = [normalizeFolder(folder) + sep]
  try {
    const real = deps.realpath?.(folder)
    if (real) roots.push(normalizeFolder(real) + sep)
  } catch {
    // fall back to the folder alone
  }
  const inFolder = (exe: string | undefined): boolean =>
    exe !== undefined &&
    roots.some((r) => exe.startsWith(r)) &&
    !STEAM_HELPER.test(exe)

  if (deps.platform === 'darwin') {
    let stdout: string
    try {
      const res = await deps.runner.run(
        '/usr/sbin/lsof',
        ['-a', '-nP', '-p', candidates.join(','), '-d', 'txt', '-F', 'pn'],
        { timeoutMs, stdin: '' }
      )
      // lsof exits 1 when a listed pid has exited (bottleProcesses.ts)
      if (
        res.timedOut ||
        res.aborted ||
        res.truncated ||
        (res.code !== 0 && res.code !== 1)
      ) {
        return []
      }
      stdout = res.stdout
    } catch {
      return []
    }
    const exes = lsofExecutablePaths(stdout)
    return candidates.filter((pid) => inFolder(exes.get(pid)))
  }
  if (deps.platform === 'linux') {
    return candidates.filter((pid) => {
      let exe: string | undefined
      try {
        exe = deps.readExe?.(pid)?.replace(/ \(deleted\)$/, '')
      } catch {
        exe = undefined
      }
      return inFolder(exe)
    })
  }
  return []
}

/**
 * Pids running from `folder`. posix: `ps` argv prefix and shell-launcher rule,
 * plus relative-argv processes resolved by executable path (see
 * resolveRelativeArgvPids). On linux a shell-launcher pid admitted by the args
 * rule is then dropped by scanSteamLaunchedPids' /proc exe filter (its exe is
 * the interpreter); that is intended, since the relative child admitted
 * through readExe is the game. A ps failure throws; a lookup failure does not.
 */
export async function findPidsRunningFromFolder(
  deps: PidScanDeps,
  folder: string,
  opts: { timeoutMs?: number; excludePids?: readonly number[] } = {}
): Promise<number[]> {
  if (deps.platform === 'win32') {
    normalizeWindowsFolder(folder) // reject a bad folder before any spawn
    const res = await deps.runner.run(
      windowsSystem32Path('WindowsPowerShell', 'v1.0', 'powershell.exe'),
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        WINDOWS_PROCESS_LIST_SCRIPT
      ],
      { timeoutMs: opts.timeoutMs ?? 15_000, windowsHide: true, stdin: '' }
    )
    if (res.timedOut || res.aborted || res.truncated || res.code !== 0) {
      throw new Error(
        `process list failed (code ${res.code}${res.timedOut ? ', timed out' : ''})`
      )
    }
    return windowsProcessListPidsInFolder(res.stdout, folder, opts.excludePids)
  }
  normalizeFolder(folder) // reject a bad folder before anything runs
  const timeoutMs = opts.timeoutMs ?? 2000
  const res = await deps.runner.run(
    '/bin/ps',
    ['-A', '-ww', '-o', 'pid=,args='],
    { timeoutMs }
  )
  if (res.timedOut || res.aborted || res.code !== 0) {
    throw new Error(
      `ps failed (code ${res.code}${res.timedOut ? ', timed out' : ''})`
    )
  }
  const direct = psOutputPidsInFolder(res.stdout, folder, opts.excludePids)
  const candidates = psOutputRelativeArgvPids(
    res.stdout,
    opts.excludePids
  ).filter((pid) => !direct.includes(pid))
  if (candidates.length === 0) return direct
  const resolved = await resolveRelativeArgvPids(
    deps,
    folder,
    candidates,
    timeoutMs
  )
  return [...new Set([...direct, ...resolved])].sort((a, b) => a - b)
}

export interface RunningFromFolderDeps {
  runner: Pick<ProcessRunner, 'run'>
  platform?: NodeJS.Platform
}

/**
 * `ps` reads only the process table, so the isolated fake-HOME profile is
 * correct here and no real-profile arm is needed.
 */
async function runPs(
  deps: RunningFromFolderDeps,
  timeoutMs: number
): Promise<string> {
  const profile = createFakeHomeProfile({
    prefix: 'gamelib-steam-running-probe-'
  })
  try {
    const res = await deps.runner.run('/bin/ps', ['-A', '-ww', '-o', 'args='], {
      env: profile.childEnv(),
      replaceEnv: true,
      stdin: '',
      timeoutMs
    })
    if (res.timedOut) throw new Error(`ps timed out after ${timeoutMs} ms`)
    if (res.code !== 0) throw new Error(`ps exited ${res.code}`)
    return res.stdout
  } finally {
    profile.dispose()
  }
}

export async function isProcessRunningFromFolder(
  deps: RunningFromFolderDeps,
  folder: string,
  timeoutMs = 2000
): Promise<boolean> {
  const platform = deps.platform ?? process.platform
  if (platform === 'win32') return false
  normalizeFolder(folder) // reject a bad folder before anything spawns
  return psOutputHasFolder(await runPs(deps, timeoutMs), folder)
}
