import type { AppPaths } from 'backend/process/context'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { RUST_STEAMPOLL_READ_RUNNING_APP_ID } from 'common/types/sidecarTransport'
import { invokeSteamPoll } from '../pollRust/rustSteamPoll'
import type { ProcessRunner } from 'backend/process/types'

export interface RunningPollProbeDeps extends RustInvokeDeps {
  runner: Pick<ProcessRunner, 'run'>
  paths: Pick<AppPaths, 'userHome'>
}

/**
 * Reads the currently running Steam game AppID. D-13: the whole probe (Windows reg.exe,
 * registry.vdf, Linux reaper scan) runs in Rust. A rejected invoke is 0 unless `strict`, where it
 * propagates (WR-01).
 */
async function readRunningAppIdViaRust(
  rust: RustInvokeDeps,
  strict: boolean
): Promise<number> {
  try {
    return (await invokeSteamPoll(rust, RUST_STEAMPOLL_READ_RUNNING_APP_ID, {
      strict
    })) as number
  } catch (error) {
    if (strict) throw error
    return 0
  }
}

/**
 * The macOS reader: the Rust op reads registry.vdf first (exact casing, T-06-06) and then,
 * because Mac Steam writes no RunningAppID there, scans the process table by executable path
 * under every Steam library's `steamapps/common/<installdir>` (quick 261118-uma). The 5 s poller
 * does not scan; only this on-demand read does.
 */
export function readMacRunningAppId(
  deps: Pick<RunningPollProbeDeps, 'requestRustInvoke'>,
  strict = false
): Promise<number> {
  return readRunningAppIdViaRust(deps, strict)
}

/**
 * Reads the currently running Steam game AppID, cross-platform (the probe is Rust, D-13). On
 * macOS the Rust op adds the process-scan fallback described on {@link readMacRunningAppId}.
 * Returns 0 when no game is running or on any error. Never throws.
 */
export function readRunningAppId(
  deps: RunningPollProbeDeps,
  _platform: NodeJS.Platform = process.platform
): Promise<number> {
  return readRunningAppIdViaRust(deps, false)
}

/**
 * readRunningAppId for a safety guard: a rejected rustInvoke throws instead of reading as "no
 * game running", so decideSteamNativeDelete's running-check-failed refusal can fire (WR-01, 75
 * review).
 */
export function readRunningAppIdOrThrow(
  deps: RunningPollProbeDeps,
  _platform: NodeJS.Platform = process.platform
): Promise<number> {
  return readRunningAppIdViaRust(deps, true)
}
