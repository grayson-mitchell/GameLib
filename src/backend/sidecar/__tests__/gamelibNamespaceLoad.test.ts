/**
 * Proves, BY EFFECT and not by config presence, that the `gamelib` i18next
 * namespace actually LOADS (Plan 34.6-19, REQ-34.6-05, T-34.6-51).
 *
 * Task 2 requires every `installFlows.*` `t()` call site to carry an inline
 * default byte-identical to the catalog value it names, which means a
 * namespace that never loads renders the SAME STRING as one that does. A
 * `grep -c` on the `ns:` array (bootstrap.ts / main.ts) is a config-presence
 * check and cannot see that failure mode. The only observation that can is a
 * default-free `t()` call against a REAL i18next instance reading the REAL
 * `public/locales` catalog on disk — if the namespace loaded, it resolves to
 * the catalog string; if it didn't, i18next's own `returnEmptyString: false`
 * behaviour returns the raw key instead (verified below in the failing
 * direction, not assumed).
 *
 * Uses a freshly-created `i18next.createInstance()` (not the process-wide
 * singleton `bootstrap.ts`/`main.ts` initialise) so this suite cannot
 * collide with, or be masked by, any other suite's i18next state.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// DEFEAT Jest's project-wide automatic manual mock: `src/backend/__mocks__/i18next.ts` sits
// adjacent to this jest project's `roots` (`src/backend`) and Jest substitutes it for the
// real npm `i18next` package in EVERY backend test file automatically (no explicit
// `jest.mock('i18next', ...)` call required anywhere — see bootstrapWirings.test.ts's
// header for the full precedent). That stub is `{ t: (key) => key }` — exactly the
// key-echoing behaviour this suite exists to distinguish from a real catalog resolution, so
// running against it would prove nothing. `jest.unmock` (not `jest.mock`) restores default
// (real) module resolution rather than substituting a different replacement.
jest.unmock('i18next')

import i18next from 'i18next'
import Backend from 'i18next-fs-backend'

// Four levels up from src/backend/sidecar/__tests__/ is the repository
// root, matching appRootResolution.test.ts's own REPO_ROOT computation.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const LOCALES_DIR = join(REPO_ROOT, 'public', 'locales')

const GAMELIB_CATALOG = JSON.parse(
  readFileSync(join(LOCALES_DIR, 'en', 'gamelib.json'), 'utf-8')
) as { installFlows: Record<string, string> }

async function initInstance(ns: string[]) {
  const instance = i18next.createInstance()
  await instance.use(Backend).init({
    backend: {
      loadPath: join(LOCALES_DIR, '{{lng}}', '{{ns}}.json')
    },
    lng: 'en',
    fallbackLng: 'en',
    ns,
    defaultNS: 'translation',
    returnEmptyString: false,
    returnNull: false,
    initImmediate: false
  })
  return instance
}

describe('gamelib namespace load proof (Plan 34.6-19, T-34.6-51)', () => {
  it('resolves gamelib:installFlows.pathRejectedTitle to the catalog value with NO inline default, when the namespace is loaded', async () => {
    const instance = await initInstance(['translation', 'gamelib'])

    const resolved = instance.t('gamelib:installFlows.pathRejectedTitle')

    expect(resolved).toBe(GAMELIB_CATALOG.installFlows.pathRejectedTitle)
    expect(resolved).not.toBe('gamelib:installFlows.pathRejectedTitle')
    expect(resolved).not.toBe('installFlows.pathRejectedTitle')
  })

  it('resolves gamelib:installFlows.pathRejectedBodyMove to the catalog value with NO inline default, when the namespace is loaded', async () => {
    const instance = await initInstance(['translation', 'gamelib'])

    const resolved = instance.t('gamelib:installFlows.pathRejectedBodyMove')

    expect(resolved).toBe(GAMELIB_CATALOG.installFlows.pathRejectedBodyMove)
    expect(resolved).not.toBe('gamelib:installFlows.pathRejectedBodyMove')
    expect(resolved).not.toBe('installFlows.pathRejectedBodyMove')
  })

  it('resolves gamelib:installFlows.pathRejectedBodyImport to the catalog value with NO inline default, when the namespace is loaded', async () => {
    const instance = await initInstance(['translation', 'gamelib'])

    const resolved = instance.t('gamelib:installFlows.pathRejectedBodyImport')

    expect(resolved).toBe(GAMELIB_CATALOG.installFlows.pathRejectedBodyImport)
    expect(resolved).not.toBe('gamelib:installFlows.pathRejectedBodyImport')
    expect(resolved).not.toBe('installFlows.pathRejectedBodyImport')
  })

  // Non-vacuousness proof, required by the plan: dropping 'gamelib' from the
  // instance's own `ns` array must make the SAME assertion fail. This is
  // what distinguishes "the namespace loaded" from "the key happens to
  // stringify to something" -- a grep on `ns:` can never observe this
  // failure direction, only this runtime resolution can.
  it('FAILS to resolve the catalog value when "gamelib" is absent from ns (proves the assertion above is non-vacuous)', async () => {
    const instance = await initInstance(['translation'])

    const resolved = instance.t('gamelib:installFlows.pathRejectedTitle')

    expect(resolved).not.toBe(GAMELIB_CATALOG.installFlows.pathRejectedTitle)
    // With returnEmptyString/returnNull both false and no inline default,
    // i18next falls back to returning the key itself when the namespace was
    // never loaded -- stripped of its `gamelib:` namespace prefix, which
    // i18next treats as a separator rather than literal key content.
    // Observed directly above (this is the failure-direction proof, not an
    // assumption): resolving to anything other than the real catalog string
    // is sufficient to demonstrate the namespace never loaded.
    expect(resolved).toBe('installFlows.pathRejectedTitle')
  })
})
