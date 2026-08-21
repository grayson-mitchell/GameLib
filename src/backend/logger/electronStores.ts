// D-15 (extended to a 4th store, taken at plan time): uploadedLogFileStore
// lives here, in its own thin module, instead of inline inside
// logger/uploader.ts, so the sidecar's store-registration step (plan 29-04)
// imports ZERO host modules and D-02's locked "every store round-trips" bar
// needs no exclusion for uploadedLogs. uploader.ts pulls in Electron's
// `app`, the IPC layer's `sendFrontendMessage`, and the logger — light, but
// not zero, and not worth an execution-time judgement call.
import { TypeCheckedStoreBackend } from '../electron_store'

export const uploadedLogFileStore = new TypeCheckedStoreBackend(
  'uploadedLogs',
  {
    cwd: 'store',
    name: 'uploadedLogs',
    accessPropertiesByDotNotation: false
  }
)
