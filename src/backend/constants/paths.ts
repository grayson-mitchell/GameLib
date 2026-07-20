import { app } from 'electron'
import { existsSync, mkdirSync, renameSync } from 'graceful-fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { env } from 'process'
import { dirSync } from 'tmp'
import { isSnap } from './environment'

let configFolder = app.getPath('appData')
// If we're running tests, we want a config folder independent of the normal
// user configuration
if (process.env.CI === 'e2e') {
  const temp_dir = dirSync({ unsafeCleanup: true })
  console.log(
    `CI is set to "e2e", storing Heroic config files in ${temp_dir.name}`
  )
  configFolder = temp_dir.name
  mkdirSync(join(configFolder, 'GameLib'))
}

export const flatpakHome = env.XDG_DATA_HOME?.replace('/data', '') || homedir()
export const userHome = isSnap ? env.SNAP_REAL_HOME! : homedir()

export const appFolder = join(configFolder, 'GameLib')

// One-time migration from the upstream Heroic config dir. GameLib is a fork of
// Heroic, which stored its config in `<appData>/heroic`. On first launch after
// the rebrand, move that folder to `<appData>/GameLib` so existing settings and
// library data carry over. Runs at module load — before any store reads
// appFolder. Skipped under e2e (isolated temp dir); non-fatal on failure (worst
// case the app starts with a fresh config).
if (process.env.CI !== 'e2e') {
  const legacyAppFolder = join(configFolder, 'heroic')
  if (existsSync(legacyAppFolder) && !existsSync(appFolder)) {
    try {
      renameSync(legacyAppFolder, appFolder)
    } catch (error) {
      console.error(
        `Failed to migrate legacy Heroic config folder to GameLib: ${error}`
      )
    }
  }
}

export const userDataPath = app.getPath('userData')
export const toolsPath = join(appFolder, 'tools')
export const runtimePath = join(toolsPath, 'runtimes')
export const defaultUmuPath = join(runtimePath, 'umu', 'umu_run.py')
export const configPath = join(appFolder, 'config.json')
export const gamesConfigPath = join(appFolder, 'GamesConfig')
export const heroicIconFolder = join(appFolder, 'icons')
export const heroicInstallPath = join(userHome, 'Games', 'GameLib')
export const defaultWinePrefixDir = join(
  userHome,
  'Games',
  'GameLib',
  'Prefixes'
)
export const sharedWinePrefix = join(defaultWinePrefixDir, 'shared')
export const defaultWinePrefix = join(defaultWinePrefixDir, 'default')
export const fixesPath = join(appFolder, 'fixes')

export const publicDir = resolve(
  __dirname,
  '..',
  app.isPackaged || process.env.CI === 'e2e' ? '' : '../public'
)

export const fakeEpicExePath = fixAsarPath(
  join(publicDir, 'bin', 'x64', 'win32', 'EpicGamesLauncher.exe')
)

export const galaxyCommunicationExePath = fixAsarPath(
  join(publicDir, 'bin', 'x64', 'win32', 'GalaxyCommunication.exe')
)

// Phase 24 (macOS native Steam bridge, D-07/BLOCKER 2): the SINGLE shared
// bundled location for the compiled steam_api.dll shim. Plan 24-07
// (packaging) builds the generated native/steam-bridge/generated/
// steam_api_shim.c source into this exact path at package/build time; Plan
// 24-05 (per-bottle runtime placement) reads/copies FROM this exact path.
// Arch-parameterized (process.arch, not hardcoded 'x64') to mirror
// steamBridgeHelperPath's (24-06) per-host-arch bundling shape, even though
// the shim DLL itself is always PE32 i386 (it runs inside a Wine bottle,
// not natively) -- the path segment groups it alongside the arch-specific
// native helper under the same packaged-bundle layout.
export const builtBridgeShimPath = fixAsarPath(
  join(publicDir, 'bin', process.arch, 'darwin', 'steam_api.dll')
)

// Phase 24 Plan 06 (R2/R5, D-03): the bundled location of the compiled
// native arm64 host helper binary (native/steam-bridge/helper/bridge_helper.c,
// Plan 24-02). Plan 24-07 (packaging) compiles the C source into this exact
// path at build time; helperProcess.ts (this plan) spawns it from here.
// Arch-parameterized (process.arch, not hardcoded 'x64') like
// builtBridgeShimPath above -- the helper is a native arm64 Mach-O binary,
// unlike the existing win32 cross-platform constants which don't vary by
// host arch. No electron-builder.yml change is needed: mac.files already
// includes `build/bin/${arch}/darwin/*` and asarUnpack already includes
// `build/bin/**/*` (24-RESEARCH.md Pattern 5, independently verified).
export const steamBridgeHelperPath = fixAsarPath(
  join(publicDir, 'bin', process.arch, 'darwin', 'steam-bridge-helper')
)

export const webviewPreloadPath = fixAsarPath(
  join('file://', publicDir, 'webviewPreload.js')
)

/**
 * Fix path for packed files with asar, else will do nothing.
 * @param origin  original path
 * @returns fixed path
 */
export function fixAsarPath(origin: string): string {
  if (!origin.includes('app.asar.unpacked')) {
    return origin.replace('app.asar', 'app.asar.unpacked')
  }
  return origin
}

export const windowIcon = fixAsarPath(join(publicDir, 'icon.png'))
