/**
 * TEST-ONLY copy of the two TypeScript env builders, `setupEnvVars` and `setupWineEnvVars`, moved here verbatim from
 * `launcher.ts` when 88.1-17 deleted them (D-25, D-30). The Rust launch builders (`gamelib-launch`) own the env now;
 * only the wine core oracle and `launcher.crossoverEnv.test.ts` import this file.
 *
 * Why it exists: the `createCommandRunner` twin (`commandRunner.ts`, deletedBy 88.2) still awaits these two builders
 * through its `wine` binding, and `wineCore.oracle.test.ts` drives its 16 `wine_command` cases through that twin.
 * The oracle's env-vector arm also pins these bodies to the shared `wine_env.json` vectors that
 * `gamelib-wine`'s `golden_wine_core.rs` replays, so a drift between this copy and the Rust builders fails there.
 * It is deleted with the twin in 88.2, together with the oracle's arms that call it.
 *
 * The one edit from the original: `removeQuoteIfNecessary` (deleted from `utils.ts` in this plan) is inlined below.
 */
import type { EnviromentVariable, GameSettings } from 'common/types'
import type { AppPaths } from 'backend/process/context'
import { existsSync } from 'graceful-fs'
import { dirname, join } from 'path'
import { isLinux, isMac } from 'backend/constants/environment'
import { logError, logWarning } from 'backend/logger'

function removeQuoteIfNecessary(stringToUnquote: string) {
  if (
    stringToUnquote &&
    stringToUnquote.startsWith('"') &&
    stringToUnquote.endsWith('"')
  ) {
    return stringToUnquote.replace(/^"+/, '').replace(/"+$/, '')
  }

  return String(stringToUnquote)
}

/**
 * Maps general settings to environment variables
 * @param gameSettings The GameSettings to get the environment variables for
 * @returns A big string of environment variables, structured key=value
 */
export function setupEnvVars(gameSettings: GameSettings, installPath?: string) {
  const ret: Record<string, string> = {}
  if (gameSettings.nvidiaPrime) {
    ret.DRI_PRIME = '1'
    ret.__NV_PRIME_RENDER_OFFLOAD = '1'
    ret.__GLX_VENDOR_LIBRARY_NAME = 'nvidia'
  }

  if (isMac && gameSettings.showFps) {
    ret.MTL_HUD_ENABLED = '1'
  }

  if (isLinux && installPath) {
    // Used by steam runtime to mount the game directory to the container
    ret.STEAM_COMPAT_INSTALL_PATH = installPath
  }

  if (gameSettings.enviromentOptions) {
    gameSettings.enviromentOptions.forEach((envEntry: EnviromentVariable) => {
      ret[envEntry.key] = removeQuoteIfNecessary(envEntry.value)
    })
  }

  // setup LD_PRELOAD if not defined
  // fixes the std::log_error for Fall Guys
  // thanks to https://github.com/Diyou
  if (!process.env.LD_PRELOAD && !ret.LD_PRELOAD) {
    ret.LD_PRELOAD = ''
  }

  return ret
}

/**
 * Maps Wine-related settings to environment variables
 * @param gameSettings The GameSettings to get the environment variables for
 * @param gameId If Proton and the Steam Runtime are used, the SteamGameId variable will be set to `heroic-gameId` if it's unset
 * @returns A Record that can be passed to execAsync/spawn
 */
export function setupWineEnvVars(
  deps: { paths: Pick<AppPaths, 'flatpakHome' | 'runtimePath'> },
  gameSettings: GameSettings,
  gameId = '0'
) {
  const { flatpakHome, runtimePath } = deps.paths
  const { wineVersion, winePrefix, wineCrossoverBottle } = gameSettings

  const ret: Record<string, string> = {}

  // Add WINEPREFIX / STEAM_COMPAT_DATA_PATH / CX_BOTTLE
  const steamInstallPath = join(flatpakHome, '.steam', 'steam')
  switch (wineVersion.type) {
    case 'wine': {
      ret.WINEPREFIX = winePrefix

      // Disable Winemenubuilder to not mess with file associations
      const wmbDisableString = 'winemenubuilder.exe=d'
      // If the user already set WINEDLLOVERRIDES, append to the end
      const dllOverridesVar = gameSettings.enviromentOptions.find(
        ({ key }) => key.toLowerCase() === 'winedlloverrides'
      )
      if (dllOverridesVar) {
        ret[dllOverridesVar.key] =
          dllOverridesVar.value + ';' + wmbDisableString
      } else {
        ret.WINEDLLOVERRIDES = wmbDisableString
      }

      break
    }
    case 'proton':
      ret.STEAM_COMPAT_CLIENT_INSTALL_PATH = steamInstallPath
      ret.WINEPREFIX = winePrefix
      ret.STEAM_COMPAT_DATA_PATH = winePrefix
      ret.PROTONPATH = dirname(gameSettings.wineVersion.bin)
      break
    case 'crossover':
      ret.CX_BOTTLE = wineCrossoverBottle
      break
    case 'toolkit':
      ret.WINEPREFIX = winePrefix
      break
  }

  if (gameSettings.showFps) {
    if (isMac) ret.MTL_HUD_ENABLED = '1'
    else ret.DXVK_HUD = 'fps'
  }
  if (gameSettings.enableDXVKFpsLimit) {
    ret.DXVK_FRAME_RATE = gameSettings.DXVKFpsCap
  }
  if (gameSettings.enableFSR) {
    ret.WINE_FULLSCREEN_FSR = '1'
    ret.WINE_FULLSCREEN_FSR_STRENGTH =
      gameSettings.maxSharpness?.toString() || '2'
  } else {
    ret.WINE_FULLSCREEN_FSR = '0'
  }
  if (gameSettings.enableEsync && wineVersion.type !== 'proton') {
    ret.WINEESYNC = '1'
  }
  if (!gameSettings.enableEsync && wineVersion.type === 'proton') {
    ret.PROTON_NO_ESYNC = '1'
  }
  if (
    isMac &&
    (gameSettings.enableMsync || wineVersion.name.endsWith('-DXMT'))
  ) {
    ret.WINEMSYNC = '1'
    // This is to solve a problem with d3dmetal
    if (wineVersion.type === 'toolkit') {
      ret.WINEESYNC = '1'
    }
  }
  if (isLinux && gameSettings.enableFsync && wineVersion.type !== 'proton') {
    ret.WINEFSYNC = '1'
  }
  if (isLinux && !gameSettings.enableFsync && wineVersion.type === 'proton') {
    ret.PROTON_NO_FSYNC = '1'
  }
  if (isLinux && gameSettings.enableWineWayland) {
    if (wineVersion.type === 'proton') {
      ret.PROTON_ENABLE_WAYLAND = '1'
      if (gameSettings.enableHDR) {
        ret.PROTON_ENABLE_HDR = '1'
      }
    } else {
      ret.DISPLAY = ''
      if (gameSettings.enableHDR) {
        ret.DXVK_HDR = '1'
      }
    }
  }
  if (isLinux && gameSettings.enableWoW64) {
    if (wineVersion.type === 'proton') {
      ret.PROTON_USE_WOW64 = '1'
    } else {
      ret.WINEARCH = 'wow64'
    }
  }
  if (wineVersion.type === 'proton') {
    if (gameSettings.autoInstallDxvkNvapi) {
      ret.PROTON_ENABLE_NVAPI = '1'
      ret.DXVK_NVAPI_ALLOW_OTHER_DRIVERS = '1'
    }
    // proton 9 enabled NVAPI by default
    else {
      ret.PROTON_DISABLE_NVAPI = '1'
    }
  }
  if (
    isLinux &&
    gameSettings.autoInstallDxvkNvapi &&
    wineVersion.type === 'wine'
  ) {
    ret.DXVK_ENABLE_NVAPI = '1'
    ret.DXVK_NVAPI_ALLOW_OTHER_DRIVERS = '1'
  }
  if (isLinux && gameSettings.eacRuntime) {
    ret.PROTON_EAC_RUNTIME = join(runtimePath, 'eac_runtime')
  }
  if (isLinux && gameSettings.battlEyeRuntime) {
    ret.PROTON_BATTLEYE_RUNTIME = join(runtimePath, 'battleye_runtime')
  }
  if (wineVersion.type === 'proton') {
    // If we don't set this, GE-Proton tries to guess the AppID from the prefix path, which doesn't work in our case
    ret.STEAM_COMPAT_APP_ID = process.env.STEAM_COMPAT_APP_ID || '0'
    ret.SteamAppId = process.env.SteamAppId || ret.STEAM_COMPAT_APP_ID
    // This sets the name of the log file given when setting PROTON_LOG=1
    ret.SteamGameId = process.env.SteamGameId || `heroic-${gameId}`
    ret.PROTON_LOG_DIR = flatpakHome
    // add back default wine/dxvk debug logging
    if (gameSettings?.verboseLogs) {
      if (
        !gameSettings?.enviromentOptions.find((env) => env.key === 'WINEDEBUG')
      )
        ret.WINEDEBUG = '+fixme'
      if (
        !gameSettings?.enviromentOptions.find(
          (env) => env.key === 'DXVK_LOG_LEVEL'
        )
      )
        ret.DXVK_LOG_LEVEL = 'info'
      if (
        !gameSettings?.enviromentOptions.find(
          (env) => env.key === 'VKD3D_DEBUG'
        )
      )
        ret.VKD3D_DEBUG = 'fixme'
    }
  }
  if (!gameSettings.preferSystemLibs && wineVersion.type === 'wine') {
    // https://github.com/ValveSoftware/Proton/blob/4221d9ef07cc38209ff93dbbbca9473581a38255/proton#L1091-L1093
    if (!process.env.ORIG_LD_LIBRARY_PATH) {
      ret.ORIG_LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH ?? ''
    }

    const { lib32, lib } = wineVersion
    if (lib32 && lib) {
      // append wine libs at the beginning
      ret.LD_LIBRARY_PATH = [lib, lib32, process.env.LD_LIBRARY_PATH]
        .filter(Boolean)
        .join(':')

      // https://github.com/ValveSoftware/Proton/blob/4221d9ef07cc38209ff93dbbbca9473581a38255/proton#L1099
      // NOTE: Proton does not make sure that these folders exist first, I believe we should :^)
      const gstp_path_lib64 = join(lib, 'gstreamer-1.0')
      const gstp_path_lib32 = join(lib32, 'gstreamer-1.0')
      if (existsSync(gstp_path_lib64) && existsSync(gstp_path_lib32)) {
        ret.GST_PLUGIN_SYSTEM_PATH_1_0 = gstp_path_lib64 + ':' + gstp_path_lib32
      }

      // https://github.com/ValveSoftware/Proton/blob/4221d9ef07cc38209ff93dbbbca9473581a38255/proton#L1097
      const winedll_path_lib64 = join(lib, 'wine')
      const winedll_path_lib32 = join(lib32, 'wine')
      if (existsSync(winedll_path_lib64) && existsSync(winedll_path_lib32)) {
        ret.WINEDLLPATH = winedll_path_lib64 + ':' + winedll_path_lib32
      }
    } else if (!(isMac && !lib && !lib32)) {
      // 59-HUMAN-UAT H3: a wine with no lib paths configured (the built-in
      // engine) is not "missing" them, and on macOS this block only sets
      // LD_LIBRARY_PATH, which dyld ignores. Skipping the log leaves the env
      // byte-identical.
      logError(
        [
          `Couldn't find all library folders of ${wineVersion.name}!`,
          `Missing ${lib32} and/or ${lib}!`,
          `Falling back to system libraries!`
        ].join('\n')
      )
    }
  }
  if (
    gameSettings.advertiseAvxForRosetta &&
    isMac &&
    wineVersion.type === 'toolkit'
  ) {
    ret.ROSETTA_ADVERTISE_AVX = '1'
  }
  // Workaround for Steam Input virtual gamepad not working for games launched through HGL from Steam
  // using deprecated WineGE/ProtonGE releases (<= 8.x) following SDL behavior change on version >= 2.30
  // (included with flatpak Freedesktop runtime 24.08 or newer)
  // https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/issues/4708
  // https://github.com/libsdl-org/SDL/issues/14410
  // https://gitlab.com/freedesktop-sdk/freedesktop-sdk/-/issues/1818
  if (
    isLinux &&
    /(GE|Wine|Proton)-(Proton[7-8]|[4-7].*-GE|GE-4.[0-9]*)/.test(
      wineVersion.name
    )
  ) {
    ret.SteamVirtualGamepadInfo = ''
    logWarning(
      `Deprecated Wine-GE/Proton-GE release (<= 8.x) detected. Applying workaround for Steam Input virtual gamepad detection.`
    )
  }
  return ret
}
