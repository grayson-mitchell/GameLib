import { app, nativeImage, type ShortcutDetails } from 'backend/platform'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rm,
  unlink,
  unlinkSync,
  writeFileSync
} from 'graceful-fs'
import { writeFile } from 'fs/promises'
import { IconIcns } from '@shockpkg/icon-encoder'
import { join } from 'path'
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
 * Both can be disabled with addDesktopShortcuts and addStartMenuShortcuts
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

  if (addSteamShortcuts) {
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
  const recordWrite = async (file: string, write: () => Promise<void>) => {
    try {
      await write()
      logInfo(`Shortcut saved on ${file}`, LogPrefix.Backend)
    } catch (error) {
      logError([`Could not write shortcut ${file}`, error], LogPrefix.Backend)
      failures.push(
        `${file}: ${error instanceof Error ? error.message : String(error)}`
      )
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
      if (addStartMenuShortcuts || fromMenu) {
        await generateMacOsApp(gameInfo)
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
 * @async
 * @public
 */
async function removeShortcuts(game: Game) {
  const gameInfo = game.getGameInfo()
  if (gameInfo.install.is_dlc) return

  const [desktopFile, menuFile] = shortcutFiles(gameInfo.title)

  if (desktopFile && !isMac) {
    unlink(desktopFile, () =>
      logInfo('Desktop shortcut removed', LogPrefix.Backend)
    )
  }

  if (menuFile) {
    if (isMac) {
      rm(menuFile, { recursive: true, force: true }, () =>
        logInfo('Applications shortcut removed', LogPrefix.Backend)
      )
      return
    }
    unlink(menuFile, () =>
      logInfo('Applications shortcut removed', LogPrefix.Backend)
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
      desktopFile = menuFile
      break
  }

  return [desktopFile, menuFile]
}

async function generateMacOsApp(gameInfo: GameInfo) {
  const { app_name, runner } = gameInfo

  logInfo('Generating macOS shortcut', LogPrefix.Backend)

  // shortcutFiles => [desktop, menu] on mac, we don't add desktop shortcut
  const appShortcut = shortcutFiles(gameInfo.title)[1]
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

export { removeShortcuts, addShortcuts, shortcutFiles }
