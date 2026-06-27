import { TypeCheckedStoreBackend } from '../../electron_store'

const configStore = new TypeCheckedStoreBackend('steamConfigStore', {
  cwd: 'steam_store'
})

export { configStore }
