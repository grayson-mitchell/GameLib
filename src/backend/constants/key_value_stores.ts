import { TypeCheckedStoreBackend } from '../typed_store'

export const configStore = new TypeCheckedStoreBackend(
  'configStore',
  {
    cwd: 'store'
  },
  { kind: 'user-state' }
)

export const tsStore = new TypeCheckedStoreBackend(
  'timestampStore',
  {
    cwd: 'store',
    name: 'timestamp'
  },
  { kind: 'user-state' }
)
