import { TypeCheckedStoreBackend } from '../../typed_store'

export const libraryStore = new TypeCheckedStoreBackend(
  'sideloadedStore',
  {
    cwd: 'sideload_apps',
    name: 'library',
    clearInvalidConfig: true
  },
  { kind: 'user-state' }
)
