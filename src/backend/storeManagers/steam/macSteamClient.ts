/**
 * What Mac Steam's own client process still needs from the sidecar once the Rust CM session owns
 * the go-offline wrap and the owed-goonline record (Phase 79 D-09/D-10): the running probe and a
 * detached `steam://` open.
 *
 * This is a LEAF that decides nothing about sessions and never logs on. It writes no owed record:
 * under D-09 PASS no logon is wrapped, and any record an older build left is paid by Rust at boot
 * and shutdown (`steamcm_wrap_restore_if_owed`).
 */
import { logWarning, LogPrefix } from 'backend/logger'
import type { ProcessRunner } from 'backend/process/types'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'

/** The owed-goonline record Rust reads and writes (`gamelib-steamcm` wrap.rs), under the app folder. */
export const MAC_STEAM_OFFLINE_OWED_FILE = 'mac-steam-offline-owed.json'

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
  runner: Pick<ProcessRunner, 'run' | 'openDetached'>
}

export function createMacSteamClient(deps: MacSteamClientDeps) {
  const { runner } = deps

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
      })
  }
}

export type MacSteamClient = ReturnType<typeof createMacSteamClient>
