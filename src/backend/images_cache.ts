import { existsSync, createWriteStream, mkdirSync } from 'graceful-fs'
import { createHash } from 'crypto'
import { join } from 'path'
import axios from 'axios'
import { appFolder } from './constants/paths'

const imagesCachePath = join(appFolder, 'images-cache')

export const initImagesCache = () => {
  // make sure we have a folder to store the cache
  if (!existsSync(imagesCachePath)) {
    mkdirSync(imagesCachePath)
  }

  // The 'imagecache' protocol registration was a no-op on the platform stand-in and is gone;
  // nothing imports this module (knip-baselined), so getImageFromCache is exported unreferenced.
}

const pending = new Map<string, Promise<void>>()

export const getImageFromCache = (url: string) => {
  const realUrl = decodeURIComponent(url.replace('imagecache://', ''))
  // digest of the image url for the file name
  const digest = createHash('sha256').update(realUrl).digest('hex')
  const cachePath = join(imagesCachePath, digest)

  if (
    !existsSync(cachePath) &&
    realUrl.startsWith('http') &&
    !pending.has(digest)
  ) {
    // if not found, download in the background
    pending.set(
      digest,
      new Promise((res) => {
        axios({
          method: 'get',
          url: realUrl,
          responseType: 'stream'
        })
          .then((response) => response.data.pipe(createWriteStream(cachePath)))
          .finally(() => {
            pending.delete(digest)
            res()
          })
      })
    )
  }

  return new Response(join(cachePath))
}
