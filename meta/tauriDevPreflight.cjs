#!/usr/bin/env node
'use strict'

/**
 * `tauri:dev` pre-flight: refuse to start when a FOREIGN `gamelib-shell` is
 * already running.
 *
 * THE INCIDENT (todo
 * `.planning/todos/completed/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md`,
 * quick `260926-dxa`). Phase 46's single-instance guard makes a second
 * `gamelib-shell` process hand off to the first and exit -- correct behaviour
 * between two dev builds, but on 2026-09-26 an INSTALLED shell at
 * `C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe` was already
 * running. `pnpm tauri:dev` built, printed one scrollback line --
 * `[shell] another GameLib instance is already running -- sending focus
 * sentinel to it and exiting` -- and exited, handing focus to the STALE
 * installed build. The operator unknowingly tested that build instead of the
 * tree under test, which mislabelled two Phase 38 UAT sittings and filed a
 * false regression against an already-fixed defect. The trap was live AGAIN
 * the same day as pid 24764. This script exists so that hand-off is loud and
 * blocking instead of one easily-missed scrollback line.
 *
 * WHY OPTION (c), NOT (b). The todo's decision 2 offered three options: (a)
 * uninstall the stale build (not durable -- reinstalls recur); (b) make a
 * debug-build secondary instance refuse to hand off to a primary running from
 * a different executable; (c) a `tauri:dev` pre-flight that fails loudly
 * before `tauri dev` ever starts. The operator LOCKED option (c). Option (b)
 * touches the Phase 46 single-instance design in `src-tauri/src/main.rs` and
 * was explicitly DECLINED -- this script and its wiring never touch that
 * file.
 *
 * WHY A PLAIN `.cjs` RUN BY BARE `node`, NOT `meta/*.ts` VIA `meta/runTs.cjs`.
 * `runTs.cjs`'s esbuild shim breaks on Windows (see
 * `runts-cjs-esbuild-shim-breaks-every-meta-script-on-windows.md`, cited at
 * `meta/captureShellScrollback.ts:52-55`), and Windows is exactly where this
 * trap was hit. CommonJS + node built-ins only, no bundling step.
 *
 * THE FAIL-SAFE ASYMMETRY. Every query failure, timeout, unreadable exe path,
 * or parse error produces a WARN and exits 0 -- it never blocks. ONLY a
 * process whose exe path was POSITIVELY read and classified as foreign blocks
 * (`process.exit(1)`). A false-red dev start (blocking a legitimate `tauri
 * dev` because the OS query failed) is worse than a missed catch, because it
 * would train the operator to route around this script entirely.
 *
 * THIS SCRIPT NEVER KILLS ANYTHING. It only reads the process table and
 * prints the pid/path/stop-command for the operator to act on themselves.
 *
 * FAKE-HOME TWO-PROFILE RULE: does not apply. Every spawn below is a
 * READ-ONLY process-table query (`Get-CimInstance Win32_Process` / `ps
 * -axww`), not a run of the sidecar or SEA binary, and none of them passes an
 * `env` key at all (they inherit). The two-profile rule's isolation half
 * governs binary runs whose behaviour depends on profile contents; a process
 * listing has no such dependency.
 *
 * WHAT THIS DOES NOT CATCH, stated rather than left implicit:
 *   - a foreign shell started AFTER this pre-flight has already passed;
 *   - a shell running under a different process name;
 *   - an OWN debug instance already running -- Phase 46's hand-off to it is
 *     the intended behaviour between two dev builds, so this is reported as a
 *     NOTE only, never a block (D-01 scopes blocking to non-debug binaries).
 */

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const SHELL_BASENAME = 'gamelib-shell'
const QUERY_TIMEOUT_MS = 20000

// ---------------------------------------------------------------------------
// Pure helpers (the tested surface). No I/O; `platform` is an explicit
// argument (default `process.platform`) so tests can drive every branch on
// any host OS.
// ---------------------------------------------------------------------------

/**
 * Strip the `/proc`-style ` (deleted)` suffix Linux leaves on `readlink
 * /proc/<pid>/exe` after the on-disk binary has been rebuilt/replaced while
 * the process is still running.
 */
function stripDeletedSuffix(exePath) {
  const suffix = ' (deleted)'
  if (exePath.endsWith(suffix)) {
    return exePath.slice(0, -suffix.length)
  }
  return exePath
}

function normalizeForCompare(exePath, platform) {
  if (platform === 'win32') {
    return path.win32.normalize(exePath.replace(/\//g, '\\')).toLowerCase()
  }
  return path.posix.normalize(exePath)
}

function dirnameFor(exePath, platform) {
  return platform === 'win32'
    ? path.win32.dirname(exePath)
    : path.posix.dirname(exePath)
}

function basenameFor(exePath, platform) {
  return platform === 'win32'
    ? path.win32.basename(exePath)
    : path.posix.basename(exePath)
}

/**
 * Classify a list of `{ pid, exePath }` process entries against the repo's
 * own debug binary directory.
 *
 * Returns `{ foreign: [...], own: [...], unknown: [...] }`. "Own" requires an
 * EXACT directory match (`dirname(exePath) === ownDebugDir`), not a prefix
 * match -- `target/debug-old` is foreign, not own.
 */
function classifyShellProcesses({ processes, ownDebugDir, platform }) {
  const effectivePlatform = platform || process.platform
  const foreign = []
  const own = []
  const unknown = []

  const normalizedOwnDebugDir = normalizeForCompare(
    ownDebugDir,
    effectivePlatform
  )

  for (const proc of processes) {
    const rawExePath = proc.exePath
    if (
      !rawExePath ||
      typeof rawExePath !== 'string' ||
      rawExePath.trim() === ''
    ) {
      unknown.push(proc)
      continue
    }

    // Linux /proc readlink can leave a rebuild's " (deleted)" suffix; strip
    // before classifying either the basename or the directory.
    const exePath = stripDeletedSuffix(rawExePath)

    // A relative/non-absolute path (macOS `ps comm` can give a bare name)
    // cannot be classified against an absolute ownDebugDir.
    const isAbsolute =
      effectivePlatform === 'win32'
        ? path.win32.isAbsolute(exePath)
        : path.posix.isAbsolute(exePath)
    if (!isAbsolute) {
      unknown.push(proc)
      continue
    }

    const basename = basenameFor(exePath, effectivePlatform)
    const basenameMatches =
      effectivePlatform === 'win32'
        ? basename.toLowerCase() === `${SHELL_BASENAME}.exe`
        : basename === SHELL_BASENAME

    if (!basenameMatches) {
      unknown.push(proc)
      continue
    }

    const dir = dirnameFor(exePath, effectivePlatform)
    const normalizedDir = normalizeForCompare(dir, effectivePlatform)

    if (normalizedDir === normalizedOwnDebugDir) {
      own.push(proc)
    } else {
      foreign.push(proc)
    }
  }

  return { foreign, own, unknown }
}

/**
 * Parse PowerShell's `Get-CimInstance ... | ConvertTo-Json -Compress` output.
 * `ConvertTo-Json` emits nothing for zero results, a bare object for exactly
 * one result, and an array for two or more -- all three shapes must be
 * handled. Throws on genuinely malformed JSON; the caller converts that to a
 * WARN.
 */
function parseWindowsCimJson(stdout) {
  const trimmed = (stdout || '').trim()
  if (trimmed === '') {
    return []
  }

  const parsed = JSON.parse(trimmed)
  const entries = Array.isArray(parsed) ? parsed : [parsed]

  return entries.map((entry) => ({
    pid: entry.ProcessId,
    exePath: entry.ExecutablePath === undefined ? null : entry.ExecutablePath
  }))
}

/**
 * Parse `ps -axww -o pid=,comm=` output: keeps only lines whose comm basename
 * is exactly `gamelib-shell` (never `gamelib-shell-helper`), splitting on the
 * first whitespace run after the pid only so that a `comm` value containing
 * spaces survives intact.
 */
function parsePsComm(stdout) {
  const results = []
  const lines = (stdout || '').split('\n')

  for (const line of lines) {
    if (line.trim() === '') continue

    const match = line.match(/^\s*(\d+)\s+(\S.*)$/)
    if (!match) continue

    const pid = Number(match[1])
    const comm = match[2].trim()
    const basename = comm.includes('/')
      ? comm.slice(comm.lastIndexOf('/') + 1)
      : comm

    if (basename !== SHELL_BASENAME) continue

    results.push({ pid, exePath: comm })
  }

  return results
}

/**
 * Resolve the repo's own debug binary directory. No `CARGO_TARGET_DIR` ->
 * `<repoRoot>/src-tauri/target/debug`; absolute `CARGO_TARGET_DIR` ->
 * `<it>/debug`; relative -> resolved against `repoRoot`.
 *
 * `env` is a plain object ARGUMENT here, not a spawn option -- the fake-HOME
 * gate scans for hand-rolled env objects passed to a spawn call, and this
 * function never spawns anything.
 */
function ownDebugDir({ repoRoot, env }) {
  const cargoTargetDir = env && env.CARGO_TARGET_DIR
  if (!cargoTargetDir) {
    return path.join(repoRoot, 'src-tauri', 'target', 'debug')
  }
  // `path.join`, not `path.resolve`: `repoRoot` is already absolute in real
  // use (`path.resolve(__dirname, '..')`), and `resolve()` would otherwise
  // prepend the CURRENT WORKING DIRECTORY's drive letter on win32 when
  // `repoRoot` is a POSIX-style absolute path (as it is in tests run on a
  // Windows host) -- `join` only concatenates and normalizes, with no cwd
  // dependency.
  const resolvedTargetDir = path.isAbsolute(cargoTargetDir)
    ? cargoTargetDir
    : path.join(repoRoot, cargoTargetDir)
  return path.join(resolvedTargetDir, 'debug')
}

// ---------------------------------------------------------------------------
// Impure collectors (untested, kept thin). Each returns `{ processes }` or
// `{ error }` and NEVER throws out -- any spawn error, non-zero status,
// timeout, or parse failure is converted to `{ error }` here so `main()` can
// treat every failure mode identically: WARN and exit 0.
// ---------------------------------------------------------------------------

function collectWindows() {
  const query =
    'Get-CimInstance Win32_Process -Filter "Name=\'gamelib-shell.exe\'" | ' +
    'Select-Object ProcessId, ExecutablePath | ConvertTo-Json -Compress'

  let result
  try {
    result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', query],
      {
        encoding: 'utf8',
        timeout: QUERY_TIMEOUT_MS,
        windowsHide: true
      }
    )
  } catch (err) {
    return { error: `powershell.exe spawn threw: ${err.message}` }
  }

  if (result.error) {
    return { error: `powershell.exe spawn failed: ${result.error.message}` }
  }
  if (result.signal) {
    return {
      error: `powershell.exe was killed by signal ${result.signal} (likely timeout)`
    }
  }
  if (result.status !== 0) {
    return {
      error: `powershell.exe exited ${result.status}: ${result.stderr || result.stdout}`
    }
  }

  try {
    return { processes: parseWindowsCimJson(result.stdout) }
  } catch (err) {
    return { error: `could not parse powershell JSON output: ${err.message}` }
  }
}

function collectLinux() {
  let entries
  try {
    entries = fs.readdirSync('/proc')
  } catch (err) {
    return { error: `could not read /proc: ${err.message}` }
  }

  const processes = []
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue
    const pid = Number(entry)

    let comm
    try {
      comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim()
    } catch {
      // Process exited between readdir and read, or unreadable -- skip, not
      // an error for the whole collection.
      continue
    }
    if (comm !== SHELL_BASENAME) continue

    let exePath = null
    try {
      exePath = fs.readlinkSync(`/proc/${pid}/exe`)
    } catch {
      // EACCES or ENOENT (process exited, or owned by another user) -> unknown.
      exePath = null
    }

    processes.push({ pid, exePath })
  }

  return { processes }
}

function collectPosixPs() {
  let result
  try {
    result = spawnSync('ps', ['-axww', '-o', 'pid=,comm='], {
      encoding: 'utf8',
      timeout: QUERY_TIMEOUT_MS
    })
  } catch (err) {
    return { error: `ps spawn threw: ${err.message}` }
  }

  if (result.error) {
    return { error: `ps spawn failed: ${result.error.message}` }
  }
  if (result.signal) {
    return {
      error: `ps was killed by signal ${result.signal} (likely timeout)`
    }
  }
  if (result.status !== 0) {
    return {
      error: `ps exited ${result.status}: ${result.stderr || result.stdout}`
    }
  }

  try {
    return { processes: parsePsComm(result.stdout) }
  } catch (err) {
    return { error: `could not parse ps output: ${err.message}` }
  }
}

function collect(platform) {
  if (platform === 'win32') return collectWindows()
  if (platform === 'linux') return collectLinux()
  return collectPosixPs()
}

// ---------------------------------------------------------------------------
// CLI entry point.
// ---------------------------------------------------------------------------

function stopCommandFor(pid, platform) {
  return platform === 'win32'
    ? `Stop-Process -Id ${pid} (PowerShell), or quit GameLib from its tray icon`
    : `kill ${pid}, or quit GameLib from its tray icon`
}

function main() {
  const platform = process.platform
  const repoRoot = path.resolve(__dirname, '..')
  const debugDir = ownDebugDir({ repoRoot, env: process.env })

  const collected = collect(platform)
  if (collected.error) {
    console.error(
      `[tauri-dev-preflight] WARN: could not list running ${SHELL_BASENAME} processes ` +
        `(${collected.error}); skipping the stale-shell check.`
    )
    process.exit(0)
  }

  const { foreign, own, unknown } = classifyShellProcesses({
    processes: collected.processes,
    ownDebugDir: debugDir,
    platform
  })

  for (const proc of unknown) {
    console.error(
      `[tauri-dev-preflight] WARN: pid ${proc.pid} looks like ${SHELL_BASENAME} but its exe ` +
        `path could not be read; skipping. If this is a foreign install, stop it yourself: ` +
        `${stopCommandFor(proc.pid, platform)}.`
    )
  }

  for (const proc of own) {
    console.log(
      `[tauri-dev-preflight] NOTE: a dev instance is already running (pid ${proc.pid}, ` +
        `${proc.exePath}) -- tauri dev will hand focus to it instead of starting a new window.`
    )
  }

  if (foreign.length > 0) {
    console.error(
      `[tauri-dev-preflight] FAIL: a non-dev GameLib shell is running. ` +
        `tauri dev would hand focus to it and exit -- you would be testing THAT build, not this tree.`
    )
    for (const proc of foreign) {
      console.error(`  pid ${proc.pid}  ${proc.exePath}`)
    }
    console.error('To fix: stop the foreign process, then re-run.')
    for (const proc of foreign) {
      console.error(`  pid ${proc.pid}: ${stopCommandFor(proc.pid, platform)}`)
    }
    process.exit(1)
  }

  console.log(
    '[tauri-dev-preflight] OK: no foreign gamelib-shell process is running.'
  )
  process.exit(0)
}

if (require.main === module && !process.env.JEST_WORKER_ID) {
  main()
}

module.exports = {
  classifyShellProcesses,
  parseWindowsCimJson,
  parsePsComm,
  ownDebugDir,
  SHELL_BASENAME
}
