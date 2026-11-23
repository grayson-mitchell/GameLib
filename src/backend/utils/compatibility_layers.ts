import { GameSettings, WineInstallation } from 'common/types'
import { existsSync } from 'graceful-fs'
import { basename, dirname, join } from 'path'
import LaunchCommand from '../storeManagers/legendary/commands/launch'
import { NonEmptyString } from '../storeManagers/legendary/commands/base'
import { Path } from 'backend/schemas'
import { findExecutableOnPath, searchForExecutableOnPath } from './os/path'
import type { AppPaths } from 'backend/process/context'
import { isLinux } from 'backend/constants/environment'

/** The path slice the umu helpers read. */
export type UmuDeps = { paths: Pick<AppPaths, 'defaultUmuPath'> }

/**
 * Locates the default wine binary on PATH without spawning anything (D-66.2-01):
 * the factory defaults are read before any runner exists. The name is the binary name; the
 * version string `getAlternativeWine` lists is resolved by the Rust discovery (87-23).
 *
 * Phase 87 (87-26, D-22 deviation): a sync twin of the Rust `default_wine_from_path`, because
 * `getFactoryDefaults` in `config.ts` reads it synchronously before any rustInvoke transport
 * exists. It is pinned to the shared `default_wine.json` vectors by
 * `enginewine/__tests__/defaultWineTwin.test.ts` and deleted with the config in Phase 98.
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
