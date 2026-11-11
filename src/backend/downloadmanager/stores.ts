// D-15: downloadManager lives here, in its own thin module, instead of
// inline inside downloadmanager/downloadqueue.ts, so the sidecar's
// store-registration step (plan 29-04) can import it without dragging in
// downloadqueue.ts's static import of the manager table from
// 'backend/storeManagers' (spike 009's import-time wall).
import { TypeCheckedStoreBackend } from '../typed_store'
import type { StoreFamilyDeps } from 'backend/stores/storeRoot'

export function createDownloadManagerStores(deps: StoreFamilyDeps) {
  const downloadManager = new TypeCheckedStoreBackend(
    'downloadManager',
    {
      cwd: 'store',
      name: 'download-manager'
    },
    { kind: 'user-state' },
    deps
  )

  return { downloadManager }
}
