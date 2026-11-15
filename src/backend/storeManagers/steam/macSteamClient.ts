/**
 * What Mac Steam's own client process still needs from the sidecar once the Rust CM session owns
 * the go-offline wrap and the owed-goonline record (Phase 79 D-09/D-10): the running probe, a
 * detached `steam://` open, and the guided Go Offline dialog's Continue.
 *
 * This is a LEAF that decides nothing about sessions and never logs on. It writes no owed record:
 * under D-09 PASS no logon is wrapped, and any record an older build left is paid by Rust at boot
 * and shutdown (`steamcm_wrap_restore_if_owed`).
 */
import { closeSync, fstatSync, openSync, readSync } from 'fs'
import { join } from 'path'
import { logWarning, LogPrefix } from 'backend/logger'
import type { GlobalConfigSlice } from 'backend/config'
import type { ProcessRunner } from 'backend/process/types'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import type { SteamGoOfflineRetryResult } from 'common/types/steam'

/** The owed-goonline record Rust reads and writes (`gamelib-steamcm` wrap.rs), under the app folder. */
export const MAC_STEAM_OFFLINE_OWED_FILE = 'mac-steam-offline-owed.json'

const STATE_READ_BYTES = 65536
const STATE_LINE_RE = /^\[[^\]]+\] \[([A-Za-z ]+), -?\d+, -?\d+\]/

/**
 * The state word of the LAST bracketed `[State, n, m]` line in the last 64 KiB
 * of connection_log.txt, or null (missing file / no bracketed line). Never
 * returns or logs the account id the lines carry.
 */
export function readMacSteamCmState(path: string): string | null {
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const size = fstatSync(fd).size
    const len = Math.min(size, STATE_READ_BYTES)
    if (len === 0) return null
    const buf = Buffer.alloc(len)
    readSync(fd, buf, 0, len, size - len)
    const lines = buf.toString('utf8').split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = STATE_LINE_RE.exec((lines[i] ?? '').replace(/\r$/, ''))
      const state = m?.[1]
      if (state !== undefined) return state
    }
    return null
  } catch {
    return null
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

/**
 * Isolated half of the two-profile rule: pgrep reads no user profile, so it
 * gets a fake-HOME env and an empty stdin. Exit 1 is "not running"; any other
 * outcome (spawn error, timeout, other code) rejects and callers fail safe.
 */
async function probeSteamRunning(
  runner: Pick<ProcessRunner, 'run'>
): Promise<boolean> {
  const profile = createFakeHomeProfile({ prefix: 'gamelib-mac-steam-pgrep-' })
  try {
    const r = await runner.run('/usr/bin/pgrep', ['-x', 'steam_osx'], {
      env: profile.childEnv(),
      replaceEnv: true,
      stdin: '',
      timeoutMs: 2000
    })
    if (r.timedOut) throw new Error('pgrep timed out')
    if (r.code === 0) return true
    if (r.code === 1) return false
    throw new Error(`pgrep exited ${String(r.code)}`)
  } finally {
    profile.dispose()
  }
}

export interface MacSteamClientDeps {
  platform: NodeJS.Platform
  config: Pick<GlobalConfigSlice, 'getSettings'>
  runner: Pick<ProcessRunner, 'run' | 'openDetached'>
}

export function createMacSteamClient(deps: MacSteamClientDeps) {
  const { runner, config, platform } = deps

  const connectionLogPath = (): string =>
    join(
      config.getSettings().defaultSteamPath.replaceAll("'", ''),
      'logs',
      'connection_log.txt'
    )

  const isSteamRunning = (): Promise<boolean> => probeSteamRunning(runner)

  return {
    isSteamRunning,
    /**
     * The sidecar's `shell.openExternal` is a frame to the Rust shell over stdout, which is gone
     * at stdin EOF, so a shutdown-time open goes through a direct detached open instead.
     */
    openUrlDetached: (url: string): void =>
      runner.openDetached(url, (code) => {
        logWarning(
          `[Steam] detached open: could not spawn open (${code})`,
          LogPrefix.Steam
        )
      }),
    /**
     * The guided Go Offline step's Continue: whether Mac Steam is now offline (or not running).
     * Reads only; it arms nothing and never logs on.
     */
    async checkGuidedOfflineReady(): Promise<SteamGoOfflineRetryResult> {
      if (platform !== 'darwin') return { status: 'not-macos' }
      let running: boolean
      try {
        running = await isSteamRunning()
      } catch {
        return { status: 'still-online' }
      }
      if (
        running &&
        readMacSteamCmState(connectionLogPath()) !== 'Logged Off'
      ) {
        return { status: 'still-online' }
      }
      return { status: 'ready' }
    }
  }
}

export type MacSteamClient = ReturnType<typeof createMacSteamClient>
