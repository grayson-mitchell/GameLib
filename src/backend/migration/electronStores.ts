// D-15: migrationsStore lives here, in its own thin module, instead of being
// constructed lazily inside MigrationSystem's constructor, so the sidecar's
// store-registration step (plan 29-04) can import it without instantiating
// MigrationSystem or its import-time side effects (spike 009's import-time
// wall). Constructed at module scope (not lazily) so registration is
// guaranteed by import time.
import { TypeCheckedStoreBackend } from '../electron_store'

export const migrationsStore = new TypeCheckedStoreBackend('migrationsStore', {
  cwd: 'store',
  name: 'migrations'
})
