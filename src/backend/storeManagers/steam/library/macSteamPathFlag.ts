/**
 * Phase 79 (UAT-B item 14): the Mac Steam owned-apps path (D-14) is OFF by default.
 *
 * The `--steam-owned-apps` helper's first IPC call on the running Mac Steam client makes Steam track
 * it as AppID 480, so the operator's Friends see "playing Spacewar" for a few seconds on every
 * Refresh. Until that is fixed (todo 2026-11-15-mac-steam-path-shows-playing-spacewar.md), Refresh
 * on macOS takes the Rust CM path, which UAT-B item 13 showed keeps Friends signed in.
 * `GAMELIB_STEAM_MAC_PATH=on` opts back in for development.
 */
export function macSteamPathEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.GAMELIB_STEAM_MAC_PATH === 'on'
}
