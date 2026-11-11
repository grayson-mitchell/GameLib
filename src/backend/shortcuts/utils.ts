import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'graceful-fs'
import { isStore } from 'common/storeCapabilities'
import { GameInfo } from 'common/types'
import { basename, dirname, extname, join } from 'path'
import type { ManagerDeps } from 'backend/services/types'
import type { GlobalConfigSlice } from 'backend/config'
import type { AppPaths } from 'backend/process/context'
import type { HostServices } from 'backend/host'
import { downloadFile } from 'backend/utils'
import { createAbortController } from 'backend/utils/aborthandler/aborthandler'
import { heroicIconFolder as iconsFolder } from 'backend/constants/paths'
import { logWarning, LogPrefix } from 'backend/logger'

function createImage(
  buffer: Buffer,
  outputFilePath: string
): string | undefined {
  try {
    writeFileSync(outputFilePath, buffer, {
      encoding: 'ascii'
    })
  } catch (error) {
    return String(error)
  }
  return
}

async function downloadImage(
  imageURL: string,
  outputFilePath: string
): Promise<string | undefined> {
  try {
    await downloadFile({
      url: imageURL,
      dest: outputFilePath,
      abortSignal: createAbortController(imageURL).signal
    })
  } catch (error) {
    return `Donwloading of ${imageURL} failed with:\n${String(error)}`
  }
  return
}

function removeImage(imagePath: string): string | undefined {
  try {
    unlinkSync(imagePath)
  } catch (error) {
    return `Removing of ${imagePath} failed with:\n${String(error)}`
  }
  return
}

function checkImageExistsAlready(image: string): boolean {
  const extentions = ['.png', '.jpg']

  const imageName = basename(image).replace(extname(image), '')
  const dirName = dirname(image)

  const found = extentions.find((extention) => {
    return existsSync(join(dirName, imageName + extention))
  })

  return found !== undefined ? true : false
}

/** R1 slice: the shortcut helpers only reach the GOG library manager. */
export interface ShortcutsDeps {
  libraryManagers: Pick<ManagerDeps['libraryManagers'], 'gog'>
  /** Runs powershell.exe (the .lnk writer) and reg.exe (the redirected Desktop folder) on win32. */
  runner: Pick<ManagerDeps['runner'], 'run'>
  /** The Add-to-Steam and shortcut settings flags (66.3-06). */
  config: Pick<GlobalConfigSlice, 'getSettings'>
  /** The shell exe and the Desktop / Start Menu folders the shortcut files are written under. */
  paths: Pick<AppPaths, 'exe' | 'appData' | 'knownFolder'>
  /** The icon .icns conversion and the Steam grid artwork. */
  imageTools: Pick<
    HostServices['imageTools'],
    'createFromBuffer' | 'createFromDataURL'
  >
}

async function getIcon(
  deps: ShortcutsDeps,
  appName: string,
  gameInfo: GameInfo
): Promise<string | undefined> {
  if (!existsSync(iconsFolder)) {
    mkdirSync(iconsFolder)
  }

  // By default use vertical image - art_square in jpg format
  let image = (gameInfo.art_square ?? '')
    .replaceAll(' ', '%20')
    .replace('{ext}', 'jpg')
  let icon = `${iconsFolder}/${appName}.jpg`

  if (isStore(gameInfo, 'gog')) {
    const installPath = gameInfo.install.install_path
    if (installPath) {
      const icoPath = join(installPath, `goggame-${appName}.ico`)
      const linuxNativePath = join(installPath, 'support', 'icon.png')
      if (existsSync(icoPath)) {
        return icoPath
      } else if (existsSync(linuxNativePath)) {
        return linuxNativePath
      }
    }
    const productApiData = await deps.libraryManagers.gog.getProductApi(appName)
    if (productApiData && productApiData.data.images?.icon) {
      image = 'https:' + productApiData.data.images?.icon
      icon = `${iconsFolder}/${appName}.png` // Allow transparency
    }
  }

  if (!existsSync(icon)) {
    if (!image) {
      logWarning(
        [`No icon URL available for ${appName}, skipping icon download`],
        LogPrefix.Backend
      )
      return undefined
    }

    const error = await downloadImage(image, icon)
    if (error) {
      logWarning(
        [`Couldn't download icon for ${appName} with:`, error],
        LogPrefix.Backend
      )
      return undefined
    }
  }

  if (!existsSync(icon)) {
    logWarning(
      [`Icon for ${appName} does not exist at ${icon} after download`],
      LogPrefix.Backend
    )
    return undefined
  }

  return icon
}

export {
  createImage,
  downloadImage,
  removeImage,
  checkImageExistsAlready,
  getIcon
}
