import type { GlobalConfigSlice } from 'backend/config'
import { logError, LogPrefix, logInfo } from 'backend/logger'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { getSteamLibraries } from 'backend/utils'
import type { ProcessRunner, RunResult } from 'backend/process/types'
import { GameSettings, WineInstallation } from 'common/types'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'graceful-fs'
import { homedir } from 'os'
import { basename, dirname, join } from 'path'
import { PlistObject, parse as plistParse } from 'plist'
import LaunchCommand from '../storeManagers/legendary/commands/launch'
import { NonEmptyString } from '../storeManagers/legendary/commands/base'
import { Path } from 'backend/schemas'
import { findExecutableOnPath, searchForExecutableOnPath } from './os/path'
import type { AppPaths } from 'backend/process/context'
import { isLinux, isMac } from 'backend/constants/environment'

/** Runner slice the wine discovery functions need: they only ever call `run`. */
export type WineDiscoveryDeps = { runner: Pick<ProcessRunner, 'run'> }

/** Linux discovery also reads the global settings (custom wine paths, Valve Proton). */
export type LinuxWineDiscoveryDeps = WineDiscoveryDeps &
  RustInvokeDeps & {
    config: Pick<GlobalConfigSlice, 'getSettings'>
    paths: Pick<AppPaths, 'toolsPath' | 'configPath'>
  }

/** The path slice the umu helpers read. */
export type UmuDeps = { paths: Pick<AppPaths, 'defaultUmuPath'> }

// mdfind reads the Spotlight index; generous for a cold index (unmeasured, 66.2 research A1).
const MDFIND_TIMEOUT_MS = 10_000
// Precedent: WINE_VERSION_PROBE_TIMEOUT_MS.
const WINE_VERSION_TIMEOUT_MS = 5_000

/** A run that exited 0 on its own: the old exec() rejected on anything else. */
const ok = (r: RunResult): boolean => !r.timedOut && !r.aborted && r.code === 0

/**
 * Runs `mdfind` (the Spotlight CLI) and returns stdout. Rejects on a spawn error, a
 * timeout or a non-zero exit, as the old `exec('mdfind ...')` did; callers catch.
 */
async function mdfind(
  deps: WineDiscoveryDeps,
  argv: readonly string[]
): Promise<string> {
  const result = await deps.runner.run('mdfind', argv, {
    timeoutMs: MDFIND_TIMEOUT_MS,
    stdin: ''
  })
  if (!ok(result)) {
    throw new Error(
      `mdfind failed (code ${result.code}, timedOut ${result.timedOut})`
    )
  }
  return result.stdout
}

/**
 * Locates the default wine binary on PATH without spawning anything (D-66.2-01):
 * the factory defaults are read before any runner exists. The version string is
 * resolved asynchronously by getLinuxWineSet; until then the name is the binary name.
 */
export function getDefaultWineBinary(): WineInstallation {
  const wineBin = findExecutableOnPath('wine')
  if (!wineBin) {
    return {
      bin: '',
      name: 'Default Wine - Not Found',
      type: 'wine'
    }
  }
  return {
    bin: wineBin,
    name: basename(wineBin),
    type: 'wine',
    ...getWineExecs(wineBin)
  }
}

function getCustomWinePaths(deps: {
  config: Pick<GlobalConfigSlice, 'getSettings'>
  paths: Pick<AppPaths, 'configPath'>
}): Set<WineInstallation> {
  const customPaths = new Set<WineInstallation>()
  // skips this on new installations to avoid infinite loops
  if (existsSync(deps.paths.configPath)) {
    const { customWinePaths = [] } = deps.config.getSettings()
    customWinePaths.forEach((path: string) => {
      if (path.endsWith('proton')) {
        return customPaths.add({
          bin: path,
          name: `Custom Proton - ${path}`,
          type: 'proton'
        })
      }
      return customPaths.add({
        bin: path,
        name: `Custom Wine - ${path}`,
        type: 'wine',
        ...getWineExecs(path)
      })
    })
  }
  return customPaths
}

/**
 * Checks if a Wine version has the Wineserver executable and returns the path to it if it's present
 * @param wineBin The unquoted path to the Wine binary ('wine')
 * @returns The quoted path to wineserver, if present
 */
export function getWineExecs(wineBin: string): { wineserver: string } {
  const wineDir = dirname(wineBin)
  const ret = { wineserver: '' }
  const potWineserverPath = join(wineDir, 'wineserver')
  if (existsSync(potWineserverPath)) {
    ret.wineserver = potWineserverPath
  }
  return ret
}

/**
 * Checks if a Wine version has lib/lib32 folders and returns the path to those if they're present
 * @param wineBin The unquoted path to the Wine binary ('wine')
 * @returns The paths to lib and lib32, if present
 */
export function getWineLibs(wineBin: string): {
  lib: string
  lib32: string
} {
  const wineDir = dirname(wineBin)
  const ret = { lib: '', lib32: '' }
  const potLib32Path = join(wineDir, '../lib')
  if (existsSync(potLib32Path)) {
    ret.lib32 = potLib32Path
  }
  const potLibPath = join(wineDir, '../lib64')
  if (existsSync(potLibPath)) {
    ret.lib = potLibPath
  }
  return ret
}

export async function getLinuxWineSet(
  deps: LinuxWineDiscoveryDeps,
  scanCustom?: boolean
): Promise<Set<WineInstallation>> {
  const { toolsPath } = deps.paths
  if (!existsSync(`${toolsPath}/wine`)) {
    mkdirSync(`${toolsPath}/wine`, { recursive: true })
  }

  if (!existsSync(`${toolsPath}/proton`)) {
    mkdirSync(`${toolsPath}/proton`, { recursive: true })
  }

  const altWine = new Set<WineInstallation>()

  readdirSync(`${toolsPath}/wine/`).forEach((version) => {
    const wineBin = join(toolsPath, 'wine', version, 'bin', 'wine')
    altWine.add({
      bin: wineBin,
      name: version,
      type: 'wine',
      ...getWineLibs(wineBin),
      ...getWineExecs(wineBin)
    })
  })

  const lutrisPath = `${homedir()}/.local/share/lutris`
  const lutrisCompatPath = `${lutrisPath}/runners/wine/`

  if (existsSync(lutrisCompatPath)) {
    readdirSync(lutrisCompatPath).forEach((version) => {
      const wineBin = join(lutrisCompatPath, version, 'bin', 'wine')
      altWine.add({
        bin: wineBin,
        name: version,
        type: 'wine',
        ...getWineLibs(wineBin),
        ...getWineExecs(wineBin)
      })
    })
  }

  const protonPaths = [`${toolsPath}/proton/`]

  const { showValveProton } = deps.config.getSettings()

  await getSteamLibraries(deps).then((libs) => {
    libs.forEach((path) => {
      if (showValveProton) {
        protonPaths.push(`${path}/steam/steamapps/common`)
        protonPaths.push(`${path}/steamapps/common`)
      }
      protonPaths.push(`${path}/root/compatibilitytools.d`)
      protonPaths.push(`${path}/compatibilitytools.d`)
      return
    })
  })

  const proton = new Set<WineInstallation>()

  protonPaths.forEach((path) => {
    if (existsSync(path)) {
      readdirSync(path).forEach((version) => {
        // Only relevant to Lutris
        if (version.startsWith('UMU-Latest')) {
          return
        }
        const protonBin = join(path, version, 'proton')
        // check if bin exists to avoid false positives
        if (existsSync(protonBin)) {
          proton.add({
            bin: protonBin,
            name: version,
            type: 'proton'
            // No need to run this.getWineExecs here since Proton ships neither Wineboot nor Wineserver
          })
        }
      })
    }
  })

  const defaultWineSet = new Set<WineInstallation>()
  const defaultWine = getDefaultWineBinary()
  if (!defaultWine.name.includes('Not Found')) {
    try {
      const result = await deps.runner.run(defaultWine.bin, ['--version'], {
        timeoutMs: WINE_VERSION_TIMEOUT_MS,
        stdin: ''
      })
      if (ok(result)) {
        const [wineName = ''] = result.stdout.split('\n')
        if (wineName) defaultWine.name = wineName
      }
    } catch {
      // keep the binary-name fallback
    }
    defaultWineSet.add(defaultWine)
  }

  let customWineSet = new Set<WineInstallation>()
  if (scanCustom) {
    customWineSet = getCustomWinePaths(deps)
  }

  return new Set([...proton, ...altWine, ...defaultWineSet, ...customWineSet])
}

/// --------------- MACOS ------------------

/**
 * Detects Wine installed on home application folder on Mac
 *
 * @returns Promise<Set<WineInstallation>>
 */
export async function getWineOnMac(
  deps: WineDiscoveryDeps & { paths: Pick<AppPaths, 'toolsPath'> }
): Promise<Set<WineInstallation>> {
  const wineSet = new Set<WineInstallation>()
  if (!isMac) {
    return wineSet
  }
  const { toolsPath } = deps.paths

  const winePaths = new Set<string>()

  // search for wine installed on $HOME/Library/Application Support/heroic/tools/wine
  const wineToolsPath = `${toolsPath}/wine/`
  if (existsSync(wineToolsPath)) {
    readdirSync(wineToolsPath).forEach((path) => {
      winePaths.add(join(wineToolsPath, path))
    })
  }

  // search for wine installed around the system
  try {
    const stdout = await mdfind(deps, [
      'kMDItemCFBundleIdentifier',
      '=',
      '*.wine'
    ])
    stdout.split('\n').forEach((winePath) => {
      winePaths.add(winePath)
    })
  } catch {
    logInfo('Spotlight found no system Wine', LogPrefix.GlobalConfig)
  }

  winePaths.forEach((winePath) => {
    const infoFilePath = join(winePath, 'Contents/Info.plist')
    if (winePath && existsSync(infoFilePath)) {
      const info = plistParse(
        readFileSync(infoFilePath, 'utf-8')
      ) as PlistObject
      const version = info['CFBundleShortVersionString'] || ''
      const name = info['CFBundleName'] || ''
      let wineBin = join(winePath, '/Contents/Resources/wine/bin/wine64')
      if (!existsSync(wineBin)) {
        // Fallback to wine if wine64 is not found
        wineBin = join(winePath, '/Contents/Resources/wine/bin/wine')
      }
      if (existsSync(wineBin)) {
        wineSet.add({
          ...getWineExecs(wineBin),
          lib: `${winePath}/Contents/Resources/wine/lib`,
          lib32: `${winePath}/Contents/Resources/wine/lib`,
          bin: wineBin,
          name: `${name} - ${version}`,
          type: 'wine',
          ...getWineExecs(wineBin)
        })
      }
    }
  })

  return wineSet
}

export async function getWineskinWine(
  deps: WineDiscoveryDeps & { paths: Pick<AppPaths, 'userHome'> }
): Promise<Set<WineInstallation>> {
  const wineSet = new Set<WineInstallation>()
  if (!isMac) {
    return wineSet
  }
  const { userHome } = deps.paths
  const wineSkinPath = `${userHome}/Applications/Wineskin`
  if (existsSync(wineSkinPath)) {
    const apps = readdirSync(wineSkinPath)
    for (const app of apps) {
      if (app.includes('.app')) {
        const wineBin = `${userHome}/Applications/Wineskin/${app}/Contents/SharedSupport/wine/bin/wine64`
        if (existsSync(wineBin)) {
          try {
            const versionResult = await deps.runner.run(
              wineBin,
              ['--version'],
              {
                timeoutMs: WINE_VERSION_TIMEOUT_MS,
                stdin: ''
              }
            )
            if (!ok(versionResult)) {
              throw new Error(
                `wine --version failed (code ${versionResult.code}, timedOut ${versionResult.timedOut})`
              )
            }
            const version = versionResult.stdout.split('\n')[0]
            wineSet.add({
              ...getWineExecs(wineBin),
              lib: `${userHome}/Applications/Wineskin/${app}/Contents/SharedSupport/wine/lib`,
              lib32: `${userHome}/Applications/Wineskin/${app}/Contents/SharedSupport/wine/lib`,
              name: `Wineskin - ${version}`,
              type: 'wine',
              bin: wineBin
            })
          } catch (error) {
            logError(
              [`Error getting wine version for ${wineBin}:`, error],
              LogPrefix.GlobalConfig
            )
          }
        }
      }
    }
  }
  return wineSet
}

/**
 * Detects CrossOver installs on Mac
 *
 * @returns Promise<Set<WineInstallation>>
 */
export async function getCrossover(
  deps: WineDiscoveryDeps
): Promise<Set<WineInstallation>> {
  const crossover = new Set<WineInstallation>()

  if (!isMac) {
    return crossover
  }

  await mdfind(deps, [
    'kMDItemCFBundleIdentifier',
    '=',
    'com.codeweavers.CrossOver'
  ])
    .then((stdout) => {
      stdout.split('\n').forEach((crossoverMacPath) => {
        const infoFilePath = join(crossoverMacPath, 'Contents/Info.plist')
        if (crossoverMacPath && existsSync(infoFilePath)) {
          const info = plistParse(
            readFileSync(infoFilePath, 'utf-8')
          ) as PlistObject
          const version = info['CFBundleShortVersionString'] || ''
          const crossoverWineBin = join(
            crossoverMacPath,
            'Contents/SharedSupport/CrossOver/bin/wine'
          )
          crossover.add({
            bin: crossoverWineBin,
            name: `CrossOver - ${version}`,
            type: 'crossover',
            ...getWineExecs(crossoverWineBin)
          })
        }
      })
    })
    .catch(() => {
      logInfo('CrossOver not found', LogPrefix.GlobalConfig)
    })
  return crossover
}

/**
 * Detects Gaming Porting Toolkit Wine installs on Mac
 * @returns Promise<Set<WineInstallation>>
 **/
export async function getGamePortingToolkitWine(deps: {
  paths: Pick<AppPaths, 'toolsPath'>
}): Promise<Set<WineInstallation>> {
  const gamePortingToolkitWine = new Set<WineInstallation>()
  if (!isMac) {
    return gamePortingToolkitWine
  }
  const { toolsPath } = deps.paths

  const GPTK_ToolPath = join(toolsPath, 'game-porting-toolkit')
  const wineGPTKPaths = new Set<string>()

  if (existsSync(GPTK_ToolPath)) {
    readdirSync(GPTK_ToolPath).forEach((path) => {
      wineGPTKPaths.add(join(GPTK_ToolPath, path))
    })
  }

  wineGPTKPaths.forEach((winePath) => {
    const infoFilePath = join(winePath, 'Contents/Info.plist')
    if (existsSync(infoFilePath)) {
      const wineBin = join(winePath, '/Contents/Resources/wine/bin/wine64')
      try {
        const name = winePath.split('/').pop() || ''
        if (existsSync(wineBin)) {
          gamePortingToolkitWine.add({
            ...getWineExecs(wineBin),
            lib: `${winePath}/Contents/Resources/wine/lib`,
            lib32: `${winePath}/Contents/Resources/wine/lib`,
            bin: wineBin,
            name,
            type: 'toolkit',
            ...getWineExecs(wineBin)
          })
        }
      } catch (error) {
        logError(
          [`Error getting wine version for GPTK ${wineBin};`, error],
          LogPrefix.GlobalConfig
        )
      }
    }
  })

  return gamePortingToolkitWine
}

/**
 * Detects Gaming Porting Toolkit Wine installs on Mac
 * @returns Promise<Set<WineInstallation>>
 **/
export async function getSystemGamePortingToolkitWine(
  deps: WineDiscoveryDeps
): Promise<Set<WineInstallation>> {
  const systemGPTK = new Set<WineInstallation>()
  if (!isMac) {
    return systemGPTK
  }

  logInfo('Searching for Gaming Porting Toolkit Wine', LogPrefix.GlobalConfig)
  // A failed Spotlight query finds nothing.
  const stdout = await mdfind(deps, ['wine64']).catch(() => '')
  const wineBin = stdout.split('\n').filter((p) => {
    return p.match(/^(?!.*heroic\/tools).*game-porting-toolkit.*\/wine64$/)
  })[0]

  if (wineBin !== undefined && existsSync(wineBin)) {
    logInfo(
      `Found Game Porting Toolkit Wine at ${dirname(wineBin)}`,
      LogPrefix.GlobalConfig
    )
    try {
      const versionResult = await deps.runner.run(wineBin, ['--version'], {
        timeoutMs: WINE_VERSION_TIMEOUT_MS,
        stdin: ''
      })
      if (!ok(versionResult)) {
        throw new Error(
          `wine --version failed (code ${versionResult.code}, timedOut ${versionResult.timedOut})`
        )
      }
      const [version = ''] = versionResult.stdout.split('\n')
      const GPTKDIR = join(dirname(wineBin), '..')
      systemGPTK.add({
        ...getWineExecs(wineBin),
        name: `GPTK System (DX11/DX12 Only) - ${version}`,
        type: 'toolkit',
        lib: join(GPTKDIR, 'lib'),
        lib32: join(GPTKDIR, 'lib'),
        bin: wineBin
      })
    } catch (error) {
      logError(
        [`Error getting wine version for ${wineBin}:`, error],
        LogPrefix.GlobalConfig
      )
    }
  }

  return systemGPTK
}

/**
 * Detects Whisky installs on Mac
 *
 * @returns Promise<Set<WineInstallation>>
 */
export async function getWhisky(deps: {
  paths: Pick<AppPaths, 'userHome'>
}): Promise<Set<WineInstallation>> {
  const whisky = new Set<WineInstallation>()

  if (!isMac) {
    return whisky
  }
  const { userHome } = deps.paths

  const whiskyWinePath = join(
    userHome,
    'Library/Application Support/com.isaacmarovitz.Whisky/Libraries'
  )
  const whiskyVersionPlist = join(whiskyWinePath, 'WhiskyWineVersion.plist')
  const whiskyWineBin = join(whiskyWinePath, 'Wine/bin/wine64')

  if (existsSync(whiskyVersionPlist) && existsSync(whiskyWineBin)) {
    try {
      const info = plistParse(
        readFileSync(whiskyVersionPlist, 'utf-8')
      ) as PlistObject
      // FIXME: Verify this type at runtime
      const version = info['version'] as {
        build: string
        major: number
        minor: number
        patch: number
        preRelease: string
      }
      const versionString = `${version['major']}.${version['minor']}.${version['patch']}-${version['build']}`
      whisky.add({
        bin: whiskyWineBin,
        name: `Whisky - ${versionString}`,
        type: 'toolkit',
        lib: join(whiskyWinePath, 'Wine/lib'),
        lib32: join(whiskyWinePath, 'Wine/lib'),
        ...getWineExecs(whiskyWineBin)
      })
    } catch (error) {
      logError(
        [`Error getting wine version for ${whiskyWineBin}:`, error],
        LogPrefix.GlobalConfig
      )
    }
  }

  return whisky
}

export type AllowedWineFlags = Pick<
  LaunchCommand,
  '--wine' | '--wrapper' | '--no-wine'
>

/**
 * Returns a LegendaryCommand with the required flags to use a specified Wine version
 * @param wineBin The full path to the Wine binary (`wine`/`wine64`/`proton`)
 * @param wineType The type of the Wine version
 * @param wrapper Any wrappers to be used, may be `''`
 */
export async function getWineFlags(
  deps: UmuDeps,
  gameSettings: GameSettings,
  wrapper: string
): Promise<AllowedWineFlags> {
  let partialCommand: AllowedWineFlags = {}
  const { type: wineType, bin: wineExec } = gameSettings.wineVersion

  // Fix for people with old config
  const wineBin =
    wineExec.startsWith("'") && wineExec.endsWith("'")
      ? wineExec.replaceAll("'", '')
      : wineExec

  switch (wineType) {
    case 'wine':
    case 'toolkit':
      partialCommand = { '--wine': Path.parse(wineBin) }
      if (wrapper) partialCommand['--wrapper'] = NonEmptyString.parse(wrapper)
      break
    case 'proton':
      partialCommand = {
        '--no-wine': true,
        '--wrapper': NonEmptyString.parse(
          `${wrapper} "${wineBin}" waitforexitandrun`
        )
      }
      if (await isUmuSupported(deps, gameSettings)) {
        partialCommand['--wrapper'] = NonEmptyString.parse(
          (wrapper ? `${wrapper} ` : '') + `"${await getUmuPath(deps)}"`
        )
      }
      break
    case 'crossover':
      partialCommand = {
        '--wine': Path.parse(wineBin)
      }
      if (wrapper) partialCommand['--wrapper'] = NonEmptyString.parse(wrapper)
      break
    default:
      break
  }
  return partialCommand
}

/**
 * Like {@link getWineFlags}, but returns a `string[]` with the flags instead
 */
export async function getWineFlagsArray(
  deps: UmuDeps,
  gameSettings: GameSettings,
  wrapper: string
): Promise<string[]> {
  const partialCommand = await getWineFlags(deps, gameSettings, wrapper)

  const commandArray: string[] = []
  for (const [key, value] of Object.entries(partialCommand)) {
    if (value === true) commandArray.push(key)
    else commandArray.push(key, value)
  }
  return commandArray
}

export const getUmuPath = async (deps: UmuDeps) =>
  searchForExecutableOnPath('umu-run').then(
    (path) => path ?? deps.paths.defaultUmuPath
  )

export async function isUmuSupported(
  deps: UmuDeps,
  gameSettings: GameSettings,
  checkUmuInstalled = true
): Promise<boolean> {
  if (!isLinux) return false
  if (gameSettings.wineVersion.type !== 'proton') return false
  if (gameSettings.disableUMU === true) {
    return false
  }
  if (!checkUmuInstalled) return true
  if (!existsSync(await getUmuPath(deps))) return false

  return true
}
