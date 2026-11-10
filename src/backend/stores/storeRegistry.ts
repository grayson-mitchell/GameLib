/**
 * Per-boot store registry (66.1 plan 25, A3).
 *
 * The registry is how the sidecar's name-keyed RPCs (`storeSnapshot`, `storeSet`, `storeDelete`,
 * `storeNew`) find a live typed store from a string. It used to be a module-level `Map` in
 * `typed_store.ts`, filled as a side effect of every `stores.ts` import. It is now an instance:
 * each boot builds one with `createStoreRegistry()`, hands it to every store constructor, and
 * the RPC handlers resolve through the same instance. Two boots (or two tests) therefore get
 * independent registries and never see each other's stores.
 *
 * A store constructed with NO registry is simply not RPC-visible (a test's ad hoc store, or one
 * deliberately kept off the name-keyed RPCs). Every store `createStores` builds is registered,
 * including the macOS arch verdict store.
 *
 * Import budget: type-only imports and Node builtins. Nothing here may construct a store.
 */
import type {
  StoreOptions,
  StoreStructure,
  ValidStoreName
} from 'common/types/typed_store'
import type { StoreDeclaration } from '../storeVersioning/types'
import type { TypeCheckedStoreBackend } from '../typed_store'

type RegisteredInstance = TypeCheckedStoreBackend<ValidStoreName>
type RegisteredOptions = StoreOptions<StoreStructure[ValidStoreName]>

export interface StoreRegistry {
  /** First registration wins; a duplicate in the same registry is reported on stderr and ignored. */
  register(
    name: string,
    instance: RegisteredInstance,
    options: RegisteredOptions,
    declaration?: StoreDeclaration
  ): void
  get(name: string): RegisteredInstance | undefined
  getOptions(name: string): RegisteredOptions | undefined
  getDeclaration(name: string): StoreDeclaration | undefined
  names(): string[]
}

export function createStoreRegistry(): StoreRegistry {
  const entries = new Map<
    string,
    {
      instance: RegisteredInstance
      options: RegisteredOptions
      declaration?: StoreDeclaration
    }
  >()
  return {
    register(name, instance, options, declaration) {
      // WR-08 (Phase 29 code review): FIRST registration wins. A second construction under the
      // same name must not silently re-point name-keyed dispatch at a different instance; it is
      // a real defect and has to be greppable.
      if (entries.has(name)) {
        process.stderr.write(
          `[typed_store] duplicate registration for '${name}' — keeping the first instance\n`
        )
        return
      }
      entries.set(name, { instance, options, declaration })
    },
    get: (name) => entries.get(name)?.instance,
    getOptions: (name) => entries.get(name)?.options,
    getDeclaration: (name) => entries.get(name)?.declaration,
    names: () => [...entries.keys()]
  }
}
