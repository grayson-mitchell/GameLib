/**
 * Unit tests for `shouldWithholdContext` — the pure render-gate decision
 * extracted from `useSettingsContext` (Phase 30 Plan 06, gap closure for
 * Gap 2 / UAT Test 8).
 *
 * **Deviation from the plan's literal instruction (documented, see
 * 30-06-SUMMARY.md):** the plan asked for a React Testing Library render
 * asserting the hook/consumer returns non-null `contextValues` after a
 * rejected `requestAppSettings`. This project's `src/frontend/jest.config.js`
 * deliberately runs `testEnvironment: 'node'` — jsdom / jest-environment-jsdom
 * / react-test-renderer are NOT installed (see that file's own docstring),
 * even though `@testing-library/react` appears in `package.json` (unused,
 * dead weight from the Heroic upstream fork this project has otherwise
 * diverged from). Installing jsdom/jest-environment-jsdom to make RTL work is
 * excluded from this executor's auto-fix authority (Rule 3's
 * package-manager-install carve-out — a new npm dependency needs a human
 * package-legitimacy checkpoint, out of scope for this gap-closure plan).
 * `hasStatus.reconcile.test.ts` in this same directory already established
 * the project's fallback convention for exactly this situation: extract the
 * pure decision logic out of the hook and unit-test THAT directly, without
 * mounting React. `shouldWithholdContext` is that extraction here — it is
 * the exact boolean the hook's own render gate evaluates, so proving its
 * behavior proves the graceful-degradation path: once a load has been
 * attempted (success OR failure), an empty config no longer withholds
 * `contextValues` forever.
 */
// `useSettingsContext.ts` transitively imports `frontend/state/GlobalStateV2`
// -> `frontend/helpers` -> `preload/tauriAttach`, which touches `window` at
// MODULE LOAD time (`typeof window.api !== 'undefined'`) — not inside a hook
// body. This jsdom-less env (see file docstring) has no `window` global, so
// these two modules are stubbed purely to let `shouldWithholdContext` (a
// side-effect-free, non-hook export) be imported and exercised directly,
// mirroring `hasStatus.reconcile.test.ts`'s own pattern in this directory.
jest.mock('frontend/state/GlobalStateV2', () => ({
  __esModule: true,
  default: { keys: () => ({ settingsModalProps: { isOpen: false } }) }
}))
jest.mock('frontend/state/ContextProvider', () => ({
  __esModule: true,
  default: {}
}))

import { shouldWithholdContext } from '../useSettingsContext'

describe('shouldWithholdContext (30-06 SEAM Invariant B)', () => {
  it('withholds (returns true) for an empty config before any load has been attempted — the initial-render case', () => {
    expect(shouldWithholdContext({}, false)).toBe(true)
  })

  it('does NOT withhold once a load has been attempted, even if the resolved config is still empty — the failed-load fallback path', () => {
    // This is the exact post-catch state: requestAppSettings rejected,
    // currentConfig was set to {} in the catch branch, hasAttemptedLoad was
    // set true in the finally branch. Before this fix, the original guard
    // (`Object.keys(config).length === 0` alone) would have returned null
    // forever here — the permanent-spinner Gap 2 bug.
    expect(shouldWithholdContext({}, true)).toBe(false)
  })

  it('does NOT withhold once a load has been attempted and resolved real settings', () => {
    expect(
      shouldWithholdContext(
        { language: 'en', defaultInstallPath: '/foo' },
        true
      )
    ).toBe(false)
  })

  it('does NOT withhold for a non-empty config even before hasAttemptedLoad flips (defense in depth — matches pre-existing behavior)', () => {
    expect(shouldWithholdContext({ language: 'en' }, false)).toBe(false)
  })
})
