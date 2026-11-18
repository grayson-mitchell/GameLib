/**
 * Which native Steam client process(es) are running RIGHT NOW.
 *
 * Steam only scans for new `appmanifest_*.acf` files at startup, so callers
 * (updateDetection and the adoption Play gate) ask "which Steam client pids
 * exist". The Rust steam_process.rs is the only start-token probe left
 * (Phase 81 D-11); this module reads no start times.
 *
 * This module is a LEAF with one question: "which Steam client PIDs exist?".
 * It decides nothing, never drives Steam (T-21-16-02), and never throws.
 *
 * Result shape:
 *   - `number[]` (possibly empty) — a definite answer; empty means Steam is
 *     not running.
 *   - `undefined` — the probe could not run or its answer is unusable
 *     (missing binary, timeout, unexpected exit). Callers must treat this as
 *     "unknown" and fail OPEN (behave as they did before this probe existed),
 *     never as "Steam is not running".
 *
 * Per-OS probe, chosen for exactness over cleverness:
 *   - win32: `tasklist /FI "IMAGENAME eq steam.exe" /FO CSV /NH`, parsed by
 *     image name + PID. Not `HKCU\Software\Valve\Steam\ActiveProcess\pid`:
 *     that value survives a Steam crash, and a stale PID that the OS later
 *     reuses for an unrelated process would pin the poller in "waiting"
 *     forever (the image-name match makes PID reuse harmless).
 *   - darwin: `pgrep -x steam_osx` (same probe `macSteamClient.ts` uses).
 *   - linux: `pgrep -x steam`.
 *
 * Two-profile rule (CLAUDE.md "Fake-HOME isolation"): the probe reads no user
 * profile and passes no `env`, exactly like the `pgrep` probe in
 * `macSteamClient.ts`; there is no real-profile arm.
 *
 * Sidecar exit contract: nothing runs at import; each probe is one
 * short-lived child bounded by `PROBE_TIMEOUT_MS` (the runner kills it on
 * expiry), so no unbounded in-flight work and no long-lived handle. It is
 * only ever called from the install poller, never at boot.
 */
import { join } from 'path'
import type { ProcessRunner } from 'backend/process/types'
import { logWarning, LogPrefix } from 'backend/logger'

/** Hard bound on a single probe child (tasklist measured ~200 ms cold). */
const PROBE_TIMEOUT_MS = 5000

/**
 * Parses `tasklist /FO CSV /NH` output into steam.exe PIDs. Only rows whose
 * first column is exactly `steam.exe` count, so the localized
 * "INFO: No tasks are running..." line (which has no CSV rows) and any
 * unrelated image are ignored. Case-insensitive on the image name because
 * Windows image names are.
 */
export function parseTasklistSteamPids(stdout: string): number[] {
  const pids: number[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^"steam\.exe","(\d+)"/i.exec(line.trim())
    if (!match) continue
    const pid = Number(match[1])
    if (Number.isSafeInteger(pid) && pid > 0) pids.push(pid)
  }
  return pids
}

/** Parses `pgrep` stdout (one PID per line) into a PID list. */
export function parsePgrepPids(stdout: string): number[] {
  const pids: number[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!/^\d+$/.test(trimmed)) continue
    const pid = Number(trimmed)
    if (Number.isSafeInteger(pid) && pid > 0) pids.push(pid)
  }
  return pids
}

type ExecResult = { code: number | string | null | undefined; stdout: string }

/** The one runner member these probes use. */
export interface SteamProbeDeps {
  runner: Pick<ProcessRunner, 'run'>
}

/** Maps a runner result onto the old { code, stdout } probe contract. */
async function run(
  deps: SteamProbeDeps,
  file: string,
  args: string[]
): Promise<ExecResult> {
  try {
    const r = await deps.runner.run(file, args, {
      timeoutMs: PROBE_TIMEOUT_MS,
      windowsHide: true,
      stdin: ''
    })
    if (r.timedOut || r.truncated) return { code: 'ERR', stdout: '' }
    return { code: r.code ?? 'ERR', stdout: r.stdout }
  } catch {
    return { code: 'ERR', stdout: '' }
  }
}

/**
 * Lists the PIDs of the running native Steam client. Never rejects. See the
 * module docstring for the `undefined` ("unknown") contract.
 *
 * `platform` is injectable for tests only; production callers omit it.
 */
export async function listSteamClientPids(
  deps: SteamProbeDeps,
  platform: NodeJS.Platform = process.platform
): Promise<number[] | undefined> {
  try {
    if (platform === 'win32') {
      const tasklist = join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32',
        'tasklist.exe'
      )
      const { code, stdout } = await run(deps, tasklist, [
        '/FI',
        'IMAGENAME eq steam.exe',
        '/FO',
        'CSV',
        '/NH'
      ])
      // tasklist exits 0 whether or not anything matched.
      if (code !== 0) return undefined
      return parseTasklistSteamPids(stdout)
    }

    if (platform === 'darwin' || platform === 'linux') {
      const name = platform === 'darwin' ? 'steam_osx' : 'steam'
      const file = platform === 'darwin' ? '/usr/bin/pgrep' : 'pgrep'
      const { code, stdout } = await run(deps, file, ['-x', name])
      // pgrep: 0 = matched, 1 = nothing matched, anything else = error.
      if (code === 1) return []
      if (code !== 0) return undefined
      return parsePgrepPids(stdout)
    }
  } catch (error) {
    logWarning(
      ['Steam: Steam client process probe failed unexpectedly:', error],
      LogPrefix.Steam
    )
  }
  return undefined
}
