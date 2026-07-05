import { TypeCheckedStoreBackend } from '../electron_store'

// Phase 10 scope: only configStore. Do NOT add humbleLibraryStore /
// humbleAuditStore here — those are Phase 11/14 scope (see 10-PATTERNS.md).
const configStore = new TypeCheckedStoreBackend('humbleConfigStore', {
  cwd: 'humble_store'
})

export { configStore }
