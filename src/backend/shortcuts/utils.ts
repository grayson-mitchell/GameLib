import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'graceful-fs'
import { GameInfo } from 'common/types'
import { basename, dirname, extname, join } from 'path'
import { libraryManagerMap } from '../storeManagers'
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
    return `${error}`
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
    return `Donwloading of ${imageURL} failed with:\n${error}`
  }
  return
}

function removeImage(imagePath: string): string | undefined {
  try {
    unlinkSync(imagePath)
  } catch (error) {
    return `Removing of ${imagePath} failed with:\n${error}`
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

async function getIcon(
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

  if (gameInfo.runner === 'gog') {
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
    const productApiData = await libraryManagerMap['gog'].getProductApi(appName)
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
