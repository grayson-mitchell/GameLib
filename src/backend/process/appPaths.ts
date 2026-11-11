/**
 * Pure path derivation (Phase 66.4 D-66.4-04). Every path constants/paths.ts
 * derives is computed here from explicit roots: no I/O, no env or process
 * reads. Boot (sidecar/bootstrap.ts) supplies the roots.
 *
 * Import budget: node:path only.
 */
import { join, resolve } from 'path'

const APP_NAME_SEGMENT = 'GameLib'

export interface AppPathRoots {
  /** OS application-data directory (Electron's appData). */
  appData: string
  /** Where the GameLib config folder lives; equals appData except under e2e. */
  configRoot: string
  home: string
  userHome: string
  flatpakHome: string
  appRoot: string
  assetDir: 'build' | 'public'
  arch: string
  tempDir: string
}

/** Moved verbatim from pathShim's platform switch, with explicit inputs. */
export function resolveAppDataDir(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string
): string {
  switch (platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support')
    case 'win32':
      return env.APPDATA || join(home, 'AppData', 'Roaming')
    default:
      return env.XDG_CONFIG_HOME || join(home, '.config')
  }
}

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

export interface DerivedAppPaths {
  flatpakHome: string
  userHome: string
  appFolder: string
  userData: string
  temp: string
  steamSupportPath: string
  toolsPath: string
  runtimePath: string
  defaultUmuPath: string
  configPath: string
  gamesConfigPath: string
  heroicIconFolder: string
  heroicInstallPath: string
  defaultWinePrefixDir: string
  sharedWinePrefix: string
  defaultWinePrefix: string
  fixesPath: string
  knownFixOverlaysPath: string
  publicDir: string
  bundledFixesPath: string
  localFixesPath: string
  fakeEpicExePath: string
  galaxyCommunicationExePath: string
  builtBridgeShimPath: string
  builtBridgeShim64Path: string
  steamBridgeHelperPath: string
  builtOverlayShimPath: string
  builtOverlayInputProbePath: string
  builtOverlayInputPath: string
  steamBridgeHelperStateDir: string
  webviewPreloadPath: string
  windowIcon: string
}

export function derivePaths(roots: AppPathRoots): Readonly<DerivedAppPaths> {
  const { userHome, arch } = roots
  const appFolder = join(roots.configRoot, APP_NAME_SEGMENT)
  const userData = join(roots.appData, APP_NAME_SEGMENT)
  const toolsPath = join(appFolder, 'tools')
  const runtimePath = join(toolsPath, 'runtimes')
  const defaultWinePrefixDir = join(userHome, 'Games', 'GameLib', 'Prefixes')
  const fixesPath = join(appFolder, 'fixes')

  // Anchor on the app root (GAMELIB_APP_ROOT, else cwd; project root in dev, asar root when packaged)
  // rather than counting `..` from __dirname: electron-vite code-splits the
  // main bundle into build/main/chunks/*, so __dirname is build/main/chunks
  // (not build/main), and the old `resolve(__dirname, '..', ...)` math landed
  // one level off -- e.g. build/public/bin instead of build/bin -- ENOENT'ing
  // every bundled asset (helper, shim, icon, preload, locales). getAppPath() is
  // depth-independent and already the established fix for the sibling
  // build/preload lookup that main_window.ts once did. Non-packaged points at the source
  // `public/` tree (where build-steam-bridge stages the helper); packaged/CI
  // points at the flattened `build/` output root.
  // `CI === 'e2e'` IS CURRENTLY UNREACHABLE, and that is a recorded decision, not an
  // oversight. Phase 35 Plan 14 deleted the Playwright suite along with the Electron shell it
  // launched, and `test:e2e` was the ONLY thing in the repo that set `CI=e2e`. The clause is
  // kept deliberately (Task 2, option-c): it is the cheap packaged-asset-resolution harness
  // that `35-CONTEXT.md` D-19 and the ROADMAP both point at, and whoever builds the Tauri e2e
  // path will want the hook already here with an explanation rather than an orphan to
  // reverse-engineer. DO NOT delete it as dead code without reading D-35-14-01.
  const publicDir = resolve(roots.appRoot, roots.assetDir)
  const darwinBin = (file: string) =>
    fixAsarPath(join(publicDir, 'bin', arch, 'darwin', file))

  return Object.freeze({
    flatpakHome: roots.flatpakHome,
    userHome,
    appFolder,
    userData,
    temp: roots.tempDir,
    steamSupportPath: join(userData, 'steam_store'),
    toolsPath,
    runtimePath,
    defaultUmuPath: join(runtimePath, 'umu', 'umu_run.py'),
    configPath: join(appFolder, 'config.json'),
    gamesConfigPath: join(appFolder, 'GamesConfig'),
    heroicIconFolder: join(appFolder, 'icons'),
    heroicInstallPath: join(userHome, 'Games', 'GameLib'),
    defaultWinePrefixDir,
    sharedWinePrefix: join(defaultWinePrefixDir, 'shared'),
    defaultWinePrefix: join(defaultWinePrefixDir, 'default'),
    fixesPath,
    // GameLib-owned known-fix overlay payloads; never a game folder or a bottle.
    knownFixOverlaysPath: join(appFolder, 'overlays'),
    publicDir,
    // Curated, in-repo known-fixes layer: `public/fixes/` in dev, `build/fixes` packaged.
    bundledFixesPath: fixAsarPath(join(publicDir, 'fixes')),
    // Operator-owned overrides; replace the bundled profile whole-file.
    localFixesPath: join(fixesPath, 'local'),
    fakeEpicExePath: fixAsarPath(
      join(publicDir, 'bin', 'x64', 'win32', 'EpicGamesLauncher.exe')
    ),
    galaxyCommunicationExePath: fixAsarPath(
      join(publicDir, 'bin', 'x64', 'win32', 'GalaxyCommunication.exe')
    ),
    builtBridgeShimPath: darwinBin('steam_api.dll'),
    builtBridgeShim64Path: darwinBin('steam_api64.dll'),
    steamBridgeHelperPath: darwinBin('steam-bridge-helper'),
    builtOverlayShimPath: darwinBin('overlay_shim.dylib'),
    builtOverlayInputProbePath: darwinBin('overlay_input_probe.dylib'),
    builtOverlayInputPath: darwinBin('overlay_input.dylib'),
    // Per-appId staging root for the bridge helper's own cwd; under appFolder,
    // never inside the read-only signed bundle.
    steamBridgeHelperStateDir: join(appFolder, 'steam-bridge'),
    webviewPreloadPath: fixAsarPath(
      join('file://', publicDir, 'webviewPreload.js')
    ),
    windowIcon: fixAsarPath(join(publicDir, 'icon.png'))
  })
}
