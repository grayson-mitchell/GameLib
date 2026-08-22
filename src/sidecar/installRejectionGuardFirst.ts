/**
 * WR-04 (Phase 34.2 gap cycle 1). `src/sidecar/index.ts` states that
 * `installUnhandledRejectionGuard()` must be live before `bootstrap.ts`'s module
 * scope. It was not, and could not be, when the call sat in the module body:
 *
 *     import { init } from 'backend/sidecar/bootstrap'   // <- evaluates HERE
 *     ...
 *     installUnhandledRejectionGuard()                   // <- installs only now
 *
 * ES module evaluation runs every import before any statement in the importing
 * module's body, so `bootstrap.ts` and its whole transitive graph — config,
 * backend_events, anticheat, i18next, migrations, the store managers — were all
 * evaluated with no `unhandledRejection` listener attached. A rejection thrown
 * from any of their module scopes would have hit Node's default handler.
 *
 * The stated invariant is now structural rather than aspirational: this module
 * does nothing but install the guard as a MODULE-SCOPE side effect, and
 * `index.ts` imports it before anything else. Import order is evaluation order,
 * so the ordering cannot regress by someone moving a statement.
 *
 * HONEST LIMIT, because the fix does not achieve everything the invariant's
 * wording implies: `processGuards.ts` itself imports `backend/logger` (it needs
 * `logWarning` to report a rejection), and that import is evaluated before the
 * call below. `backend/logger`'s own module scope is therefore still unguarded.
 * Closing that would mean giving the guard a logger-free reporting path — a
 * larger change than this finding warrants, and the remaining exposure is one
 * small module rather than bootstrap's entire graph.
 *
 * VERIFIED THROUGH THE BUNDLER, not only in source. Jest cannot see bundling
 * defects (`jest-cannot-see-dynamic-import-defects`), and this fix is entirely
 * about evaluation order, which is exactly what a bundler rewrites. Measured on
 * `build/main/sidecar.js` after `pnpm build:sidecar` (2026-08-23): esbuild
 * inlines each module behind a `// <path>` marker in dependency order, and
 *
 *     // src/sidecar/installRejectionGuardFirst.ts   @ 1014790
 *     installUnhandledRejectionGuard();
 *     ...
 *     // src/backend/sidecar/bootstrap.ts            @ 1060478
 *
 * so the call really does run before bootstrap's module scope in the shipped
 * artifact. Re-check by comparing those two marker offsets, not by reading
 * `index.ts`.
 */
import { installUnhandledRejectionGuard } from 'backend/sidecar/processGuards'

installUnhandledRejectionGuard()
