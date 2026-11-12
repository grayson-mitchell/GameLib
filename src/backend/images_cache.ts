import { existsSync, createWriteStream, mkdirSync } from 'graceful-fs'
import { createHash } from 'crypto'
import { join } from 'path'
import axios from 'axios'
import type { AppPaths } from 'backend/process/context'

export interface ImageFetchesDeps {
  paths: Pick<AppPaths, 'appFolder'>
}

export interface ImageFetches {
  initImagesCache(): void
  getImageFromCache(url: string): Response
}

/** One image cache (and its pending-download dedupe map) per boot (66.4-17, D-05). Construction does no I/O. */
export function createImageFetches(deps: ImageFetchesDeps): ImageFetches {
  const imagesCachePath = join(deps.paths.appFolder, 'images-cache')
  const pending = new Map<string, Promise<void>>()

  const initImagesCache = () => {
    // make sure we have a folder to store the cache
    if (!existsSync(imagesCachePath)) {
      mkdirSync(imagesCachePath)
    }

    // The 'imagecache' protocol registration was a no-op on the platform stand-in and is gone;
    // nothing imports this module (knip-baselined), so getImageFromCache is exported unreferenced.
  }

  const getImageFromCache = (url: string) => {
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
            .then((response) =>
              response.data.pipe(createWriteStream(cachePath))
            )
            .finally(() => {
              pending.delete(digest)
              res()
            })
        })
      )
    }

    return new Response(join(cachePath))
  }

  return { initImagesCache, getImageFromCache }
}
