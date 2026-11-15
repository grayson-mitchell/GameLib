/**
 * The Mac Steam owned-apps path (D-14) is ON by default.
 *
 * It was briefly off (Phase 79 UAT-B item 14) because the helper registered with Mac Steam as
 * AppID 480 ("playing Spacewar" in Friends). Root cause: a `steam_appid.txt`=480 staged beside the
 * helper binary, which steamclient reads from the executable directory; the build no longer stages
 * it (todo 2026-11-15-mac-steam-path-shows-playing-spacewar.md).
 * `GAMELIB_STEAM_MAC_PATH=off` opts out and sends Refresh down the Rust CM path.
 */
export function macSteamPathEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.GAMELIB_STEAM_MAC_PATH !== 'off'
}
