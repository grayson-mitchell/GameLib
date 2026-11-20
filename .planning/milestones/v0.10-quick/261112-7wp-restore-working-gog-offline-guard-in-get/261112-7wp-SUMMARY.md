---
status: complete
quick: 261112-7wp
commit: d2bdd0868
---

# Quick 261112-7wp: Restore working GOG offline guard

Restored `if (!this.deps.onlineMonitor.isOnline())` in `GOGLibraryManager.getInstallInfo`, after the cache early-return and before the login gate. It logs `App offline, unable to get install info` (with `LogPrefix.Gog`, matching sibling guards) and returns undefined.

Three tests added to `gog/__tests__/library.test.ts`: offline/no cache, offline/cache hit, online. The first failed before the source edit.

Verification: gog library suite 18/18, `pnpm backend-di-ceilings` PASS (no new jest.mock), tsc clean, prettier clean.

Deviations: none. Callers already handle an undefined return.
