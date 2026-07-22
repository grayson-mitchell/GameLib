// D-15: downloadManager lives here, in its own thin module, instead of
// inline inside downloadmanager/downloadqueue.ts, so the sidecar's
// store-registration step (plan 29-04) can import it without dragging in
// downloadqueue.ts's static `import { libraryManagerMap } from
// 'backend/storeManagers'` (spike 009's import-time wall).
import { TypeCheckedStoreBackend } from '../electron_store'

export const downloadManager = new TypeCheckedStoreBackend('downloadManager', {
  cwd: 'store',
  name: 'download-manager'
})
