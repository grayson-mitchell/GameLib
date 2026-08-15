/**
 * A faithful `t()` for the GamePage component suites — 34.13 review C-10/C-21.
 *
 * NOT a test file (jest's `testMatch` here is `**\/__tests__\/**\/*.test.ts(x)`,
 * so a bare `.ts` helper in this directory is never collected as a suite).
 *
 * WHY THIS EXISTS
 *
 * The original mock was `t: (_key, defaultValue) => defaultValue`, so every
 * assertion measured the INLINE DEFAULT ARGUMENT rather than the shipped
 * label. That is this repo's ledgered "editing a `t()` DEFAULT is a silent
 * no-op when the key exists" trap, seen from the test side: a suite asserting
 * the default stays green through any change to the real catalog value, and
 * can assert a literal that appears nowhere in the running UI.
 *
 * C-10 replaced it with a mock that resolves against the real `gamepage.json`.
 * C-21 found two residual gaps, both closed here:
 *
 *   (a) The third suite (`MainButton.steamSplitButton.test.tsx`) was never
 *       converted, and it owns the ONLY gate on the caret's accessible name.
 *
 *   (b) The replacement mock resolved `gamepage.json` ONLY, while
 *       `MainButton.tsx` calls `t('gamelib:steam.install.withOptionsLabel', …)`
 *       — a namespace-PREFIXED key on a `gamepage`-bound `t`. `lookup` split on
 *       `.`, yielding `['gamelib:steam', 'install', 'withOptionsLabel']`, which
 *       `gamepage.json` cannot resolve, so it fell through to the inline
 *       default. Real i18next resolves the `gamelib:` prefix into the `gamelib`
 *       namespace. The mock's own header claimed it "reproduces i18next's
 *       ACTUAL precedence"; that claim was false for the one key in this
 *       component that crosses namespaces — which is also the only key the
 *       un-converted third suite asserted.
 *
 * PRECEDENCE REPRODUCED: an explicit `ns:` prefix on the key wins over the
 * namespace `useTranslation` was bound to; the inline default is consulted
 * only when the key does not resolve in the selected catalog; and a key that
 * resolves nowhere falls back to the key itself (i18next's `parseMissingKey`
 * default), never to `undefined`.
 */

import gamepage from '../../../../../../../public/locales/en/gamepage.json'
import gamelib from '../../../../../../../public/locales/en/gamelib.json'
import translation from '../../../../../../../public/locales/en/translation.json'

const CATALOGS: Record<string, unknown> = { gamepage, gamelib, translation }

function lookup(boundNamespace: string, key: string): string | undefined {
  const colon = key.indexOf(':')
  const namespace = colon === -1 ? boundNamespace : key.slice(0, colon)
  const path = colon === -1 ? key : key.slice(colon + 1)
  const catalog = CATALOGS[namespace]
  if (catalog === undefined) return undefined
  const resolved = path.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') {
      return (node as Record<string, unknown>)[part]
    }
    return undefined
  }, catalog)
  return typeof resolved === 'string' ? resolved : undefined
}

/** Builds a `t` bound to `boundNamespace`, with i18next's real precedence. */
export function makeFaithfulT(
  boundNamespace = 'translation'
): (key: string, defaultValue?: string) => string {
  return (key: string, defaultValue?: string): string =>
    lookup(boundNamespace, key) ?? defaultValue ?? key
}

/** Drop-in `react-i18next` module replacement for a `jest.mock` factory. */
export function faithfulReactI18next(): {
  useTranslation: (ns?: string) => {
    t: (key: string, defaultValue?: string) => string
  }
} {
  return {
    useTranslation: (ns = 'translation') => ({ t: makeFaithfulT(ns) })
  }
}
