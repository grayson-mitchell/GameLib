import { app, nativeImage, type ShortcutDetails } from 'backend/platform'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from 'graceful-fs'
import { mkdir, rm, symlink, unlink, writeFile } from 'fs/promises'
import { IconIcns } from '@shockpkg/icon-encoder'
import { dirname, join } from 'path'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { GlobalConfig } from '../../config'
import { GameInfo } from 'common/types'
import { getIcon } from '../utils'
import { addNonSteamGame } from '../nonesteamgame/nonesteamgame'
import sanitize from 'sanitize-filename'
import { libraryManagerMap } from 'backend/storeManagers'
import { isMac } from 'backend/constants/environment'
import { userHome } from 'backend/constants/paths'
import type { Game } from 'common/types/game_manager'
import { writeWindowsShortcut } from './windowsShortcut'

/**
 * Adds a desktop shortcut to $HOME/Desktop and to /usr/share/applications
 * so that the game can be opened from the start menu and the desktop folder.
 * Both can be disabled with addDesktopShortcuts and addStartMenuShortcuts.
 * On macOS one .app is written in ~/Applications (start menu / menu add, or whenever
 * addDesktopShortcuts is on) and, when addDesktopShortcuts is on, ~/Desktop gets a symlink to that
 * bundle, so macOS Apps lists the game once.
 * Rejects if any requested shortcut could not be written (after trying all of them).
 * @async
 * @public
 */
async function addShortcuts(game: Game, fromMenu?: boolean) {
  const gameInfo = game.getGameInfo()
  if (gameInfo.install.is_dlc) return

  const { app_name, runner, title } = gameInfo

  logInfo(`Adding shortcuts for ${title}`, LogPrefix.Backend)
  const { addDesktopShortcuts, addStartMenuShortcuts, addSteamShortcuts } =
    GlobalConfig.get().getSettings()

  // A Steam game is already in Steam (the "Add to Steam" menu item is hidden for it too).
  if (addSteamShortcuts && runner !== 'steam') {
    addNonSteamGame(game)
  }

  const launchWithProtocol = `gamelib://launch?appName=${app_name}&runner=${runner}`
  const [desktopFile, menuFile] = shortcutFiles(gameInfo.title)
  if (!desktopFile || !menuFile) {
    return
  }

  // Every requested write is attempted; any that failed are reported together at the end, so
  // the caller never announces shortcuts that were not written.
  const failures: string[] = []
  const recordWrite = async (
    file: string,
    write: () => Promise<void>
  ): Promise<boolean> => {
    try {
      await write()
      logInfo(`Shortcut saved on ${file}`, LogPrefix.Backend)
      return true
    } catch (error) {
      logError([`Could not write shortcut ${file}`, error], LogPrefix.Backend)
      failures.push(
        `${file}: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
    }
  }

  switch (process.platform) {
    case 'linux': {
      const icon = await getIcon(gameInfo.app_name, gameInfo)
      if (!icon) {
        logWarning(
          `No icon available for ${gameInfo.title}, creating an iconless shortcut`,
          LogPrefix.Backend
        )
      }
      const shortcut = `[Desktop Entry]
Name=${gameInfo.title}
Exec=xdg-open ${launchWithProtocol}
Terminal=false
Type=Application
${icon ? `Icon=${icon}\n` : ''}Categories=Game;
`

      if (addDesktopShortcuts || fromMenu) {
        //777 = -rwxrwxrwx
        await recordWrite(desktopFile, () =>
          writeFile(desktopFile, shortcut, { mode: 0o777 })
        )
      }
      if (addStartMenuShortcuts || fromMenu) {
        await recordWrite(menuFile, () => writeFile(menuFile, shortcut))
      }
      break
    }
    case 'win32': {
      const shortcutOptions: ShortcutDetails = {
        target: launchWithProtocol
      }
      let executable = gameInfo.install.executable
      if (gameInfo.runner === 'gog') {
        executable = libraryManagerMap['gog'].getExecutable(gameInfo.app_name)
      }
      if (executable) {
        let icon: string
        if (
          'install_path' in gameInfo.install &&
          gameInfo.install.install_path
        ) {
          icon = join(gameInfo.install.install_path, executable)
        } else {
          icon = executable
        }
        shortcutOptions.icon = icon
        shortcutOptions.iconIndex = 0
      }

      // Not `shell.writeShortcutLink`: the sidecar has no Win32 shell-link API and stubs it to
      // `false`, which used to drop every .lnk silently while the success toast still showed.
      const writeLnk = async (file: string) => {
        const result = await writeWindowsShortcut(file, shortcutOptions)
        if (!result.ok) throw new Error(result.error)
      }
      if (addDesktopShortcuts || fromMenu) {
        await recordWrite(desktopFile, () => writeLnk(desktopFile))
      }

      if (addStartMenuShortcuts || fromMenu) {
        await recordWrite(menuFile, () => writeLnk(menuFile))
      }
      break
    }
    case 'darwin': {
      // Unlike linux/win32, darwin menu add never touches ~/Desktop unless the user opted in
      // (addDesktopShortcuts), so a Mac Desktop stays clean by default. The Desktop item is a
      // symlink to the single Applications bundle (261026-ctm), so the Applications bundle is
      // written whenever the Desktop link is wanted.
      let bundleWritten = false
      if (addStartMenuShortcuts || fromMenu || addDesktopShortcuts) {
        bundleWritten = await recordWrite(menuFile, () =>
          generateMacOsApp(gameInfo, menuFile)
        )
      }
      if (addDesktopShortcuts) {
        await recordWrite(desktopFile, async () => {
          if (!bundleWritten) {
            throw new Error(`not linked: ${menuFile} was not written`)
          }
          await linkDesktopToApplications(desktopFile, menuFile)
        })
      }
      break
    }
  }

  if (failures.length) {
    throw new Error(`Could not write shortcuts: ${failures.join('; ')}`)
  }
}

/**
 * Removes a desktop shortcut from $HOME/Desktop and to $HOME/.local/share/applications
 *
 * Settles only after every deletion has finished, so a caller that reads the disk afterwards (the
 * sidecar's `removeShortcut` channel does) sees the outcome and not a race. A file that is already
 * gone counts as removed. A deletion that fails for any other reason is logged and the next file is
 * still attempted, but it is NOT rethrown: four uninstall paths await this
 * (`storeManagers/gog/games.ts`, `legendary/games.ts`, `nile/games.ts`, `zoom/games.ts`) and
 * `sideload/games.ts` calls it un-awaited, so a new rejection would fail an uninstall over a stale
 * shortcut, or surface as an unhandled rejection. The sidecar reads the outcome from the disk
 * instead.
 * @async
 * @public
 */
async function removeShortcuts(game: Game) {
  const gameInfo = game.getGameInfo()
  if (gameInfo.install.is_dlc) return

  const [desktopFile, menuFile] = shortcutFiles(gameInfo.title)

  const removeFile = async (
    file: string,
    remove: () => Promise<void>,
    removedMessage: string
  ) => {
    try {
      await remove()
      logInfo(removedMessage, LogPrefix.Backend)
    } catch (error) {
      // Already gone is the state we wanted.
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        return
      }
      logError([`Could not remove shortcut ${file}`, error], LogPrefix.Backend)
    }
  }

  if (isMac) {
    // The Applications item is a .app directory. The Desktop item (only if the user opted in) is a
    // symlink to it, or a real bundle left by 261026-clh. `rm` is lstat-based: it removes a link
    // itself without following it, so the Applications bundle is deleted only by its own entry,
    // and a dangling link is removed too.
    for (const [file, message] of [
      [desktopFile, 'Desktop shortcut removed'],
      [menuFile, 'Applications shortcut removed']
    ] as const) {
      if (!file) continue
      await removeFile(
        file,
        () => rm(file, { recursive: true, force: true }),
        message
      )
    }
    return
  }

  if (desktopFile) {
    await removeFile(
      desktopFile,
      () => unlink(desktopFile),
      'Desktop shortcut removed'
    )
  }

  if (menuFile) {
    await removeFile(
      menuFile,
      () => unlink(menuFile),
      'Applications shortcut removed'
    )
  }
}

function shortcutFiles(gameTitle: string) {
  let desktopFile
  let menuFile

  gameTitle = sanitize(gameTitle)

  switch (process.platform) {
    case 'linux': {
      desktopFile = `${app.getPath('desktop')}/${gameTitle}.desktop`
      menuFile = `${userHome}/.local/share/applications/${gameTitle}.desktop`
      break
    }
    case 'win32': {
      desktopFile = `${app.getPath('desktop')}\\${gameTitle}.lnk`
      menuFile = `${app.getPath(
        'appData'
      )}\\Microsoft\\Windows\\Start Menu\\Programs\\${gameTitle}.lnk`
      break
    }
    case 'darwin':
      menuFile = join(userHome, 'Applications', `${gameTitle}.app`)
      // Not app.getPath('desktop'): the sidecar's pathShim picks its arm from the platform
      // captured at module load, which a test override cannot change.
      desktopFile = join(userHome, 'Desktop', `${gameTitle}.app`)
      break
  }

  return [desktopFile, menuFile]
}

/**
 * Points the Desktop item at the Applications bundle with a plain symlink (no Finder alias).
 * Clears whatever sits there first: a legacy real bundle, a stale link or a dangling one.
 */
async function linkDesktopToApplications(link: string, target: string) {
  await mkdir(dirname(link), { recursive: true })
  await rm(link, { recursive: true, force: true })
  await symlink(target, link)
}

/**
 * True when the path exists or is a symlink. A dangling Desktop link (261026-ctm) fails
 * `existsSync` but is still a leftover the user must be able to Remove.
 */
function shortcutPathPresent(file: string): boolean {
  if (existsSync(file)) return true
  try {
    return lstatSync(file).isSymbolicLink()
  } catch {
    return false
  }
}

// Generated once, into ~/Applications only; the Desktop item links to it.
async function generateMacOsApp(gameInfo: GameInfo, appShortcut: string) {
  const { app_name, runner } = gameInfo

  logInfo('Generating macOS shortcut', LogPrefix.Backend)

  const macOSFolder = `${appShortcut}/Contents/MacOS`
  const resourcesFolder = `${appShortcut}/Contents/Resources`
  const plistFile = `${appShortcut}/Contents/Info.plist`

  // create the .app folder
  if (appShortcut && !existsSync(appShortcut)) {
    mkdirSync(appShortcut, { recursive: true })
  }

  if (!existsSync(resourcesFolder)) {
    mkdirSync(resourcesFolder, { recursive: true })
  }

  // convert the icon to icns
  const isIconIcns = await convertPngToICNS(app_name, gameInfo, resourcesFolder)

  if (!isIconIcns) {
    logWarning(
      `No icon available for ${gameInfo.title}, creating an iconless MacOS shortcut`,
      LogPrefix.Backend
    )
  }

  // D-04: the shortcut must survive an unobtainable icon - the .app, Info.plist and
  // run.sh are written unconditionally. Only the CFBundleIconFile key pair is
  // conditional on the icon having been produced.
  const iconKeyPair = isIconIcns
    ? `
	<key>CFBundleIconFile</key>
	<string>shortcut.icns</string>`
    : ''
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
	<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
	<plist version="1.0">
	<dict>
		<key>CFBundleExecutable</key>
		<string>run.sh</string>${iconKeyPair}
		<key>CFBundleInfoDictionaryVersion</key>
		<string>1.0</string>
		<key>CFBundlePackageType</key>
		<string>APPL</string>
		<key>CFBundleSignature</key>
		<string>????</string>
		<key>CFBundleVersion</key>
		<string>1.0</string>
	</dict>
	</plist>
  `
  // create the macOS folder
  mkdirSync(macOSFolder, { recursive: true })

  // write plist file
  writeFileSync(plistFile, plist)

  // write the run.sh file
  //
  // T-34.5-C6-17 (F-34.5-G6-07 follow-on): this task makes generateMacOsApp REACHABLE for the
  // first time under the sidecar (previously dead behind the nativeImage stub above), which
  // makes the injection this exact template opens reachable too. The exe path is double-quoted
  // and the whole gamelib:// URL is single-quoted, with both query values percent-encoded via
  // encodeURIComponent -- so a game whose app_name/runner contains `;`, `&`, backticks or
  // `$(...)` can no longer execute anything when this script is double-clicked.
  // `protocol.ts`'s `parseHeroicUrl` uses `new URL(...)` + `searchParams.get(...)`, both of
  // which percent-decode, so this round-trips cleanly and does not change what appName/runner
  // plan 34.5-44's deep-link handling ultimately receives.
  const gamelibUrl = `gamelib://launch?appName=${encodeURIComponent(
    app_name
  )}&runner=${encodeURIComponent(runner)}`
  const launchCommand = `"${app.getPath('exe')}" --no-gui '${gamelibUrl}'`
  const shortcut = `#!/bin/bash
    # autogenerated file - do not edit

      ${launchCommand}
    `
  writeFileSync(`${macOSFolder}/run.sh`, shortcut)

  // make the run.sh file executable
  chmodSync(`${macOSFolder}/run.sh`, '755')
}

async function convertPngToICNS(
  app_name: string,
  gameInfo: GameInfo,
  dest: string
) {
  try {
    const iconPath = await getIcon(app_name, gameInfo)
    if (!iconPath) {
      logWarning(
        `No icon available for ${gameInfo.title}, skipping icon conversion`,
        LogPrefix.Backend
      )
      return false
    }
    const iconBuffer = readFileSync(iconPath)
    const pngTemp = `${dest}/shortcut.png`
    const temp = nativeImage
      .createFromBuffer(iconBuffer)
      .resize({ width: 512 })
      .crop({ x: 0, y: 0, width: 512, height: 512 })
      .toPNG()

    writeFileSync(pngTemp, temp)

    const shortcut = `${dest}/shortcut.icns`
    const icns = new IconIcns()
    icns.addFromPng(readFileSync(pngTemp), ['ic11'], true)
    writeFileSync(shortcut, icns.encode())
    unlinkSync(pngTemp)

    return true
  } catch (error) {
    logError(['Error converting icon to icns:', error], LogPrefix.Backend)
    return false
  }
}

export { removeShortcuts, addShortcuts, shortcutFiles, shortcutPathPresent }
