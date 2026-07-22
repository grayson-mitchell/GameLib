// D-15: wineDownloaderInfoStore lives here, in its own thin module, instead
// of inline inside wine/manager/utils.ts, so the sidecar's store-registration
// step (plan 29-04) can import it without dragging in the Wine
// download/install pipeline's import-time side effects (spike 009's
// import-time wall).
import { TypeCheckedStoreBackend } from 'backend/electron_store'

export const wineDownloaderInfoStore = new TypeCheckedStoreBackend(
  'wineDownloaderInfoStore',
  {
    cwd: 'store',
    name: 'wine-downloader-info'
  }
)
