/**
 * Phase 62 plan 02 (D-03, D-04, D-13). The single source of the runner/store
 * literal ban: the selector set, the literal list, the compared-name pattern,
 * and the scope + exemption globs. `eslint.config.mjs` imports it and enforces
 * it at `error` (62-20; the ratchet that preceded it is deleted).
 *
 * A comparison of a runner/store-named value against a store literal
 * (`runner === 'steam'`, `switch (store)`, `['gog','nile'].includes(runner)`)
 * belongs in `src/common/storeCapabilities.ts` (created in 62-13), which is
 * outside scope because `src/common/**` is not in SCOPE_FILES. No inline
 * `eslint-disable` for this rule anywhere.
 *
 * Planner decisions recorded here:
 * - Test exemption (OQ3): `__tests__`, `__mocks__`, `*.test.ts(x)`,
 *   `src/backend/jest.setup*.ts` and `*.d.ts` are outside the ban. Fixtures
 *   legitimately set `runner: 'steam'`; comparisons in tests are lower value.
 * - Humble (OQ4): `Runner` has no 'humble', but login code compares
 *   `runner === 'humble'` and backend compares `store === 'humble'`, so D-03
 *   ("every runner literal") puts it in STORE_LITERALS.
 * - Compared-name match: an Identifier, or a MemberExpression property, whose
 *   name matches RUNNER_NAME (`runner`, `store`, `removedRunner`,
 *   `warnLoginForStore`, ...). Names that do not end in Runner/Store (UI overlay
 *   ids such as `mountedOverlay`) are not matched.
 * - Not matched: object-literal maps keyed by runner, `runner: 'steam'`
 *   property values, type annotations, comments, template literals.
 *
 * Plain CommonJS (matches meta/lintScoped.cjs); eslint.config.mjs ignores *.cjs.
 */

'use strict'

const STORE_LITERALS = Object.freeze([
  'steam',
  'gog',
  'legendary',
  'nile',
  'sideload',
  'humble'
])

// Compared-name pattern, source text (no slashes).
const RUNNER_NAME = /^(runner|store)$|[a-z0-9]Runner$|[a-z0-9]Store$/

// Names that end in Runner/Store but are not store identity. Each entry: a
// one-line reason. Empty: no false positive found while measuring.
const NAME_DENYLIST = Object.freeze([])

const MESSAGE =
  'Do not compare a runner/store value against a store literal; ask ' +
  '`storeCapabilities` / `isStore` in src/common/storeCapabilities.ts instead.'

const LITERAL_RE = `/^(${STORE_LITERALS.join('|')})$/`
const NAME_RE = `/${RUNNER_NAME.source}/`
const DENY_RE = NAME_DENYLIST.length ? `/^(${NAME_DENYLIST.join('|')})$/` : null

// Selector fragment: field `f` is a runner/store-named Identifier or member property.
function nameSide(f) {
  // `a?.runner` parses as ChainExpression > MemberExpression, hence `.expression`.
  const m = `:matches([${f}.name=${NAME_RE}], [${f}.property.name=${NAME_RE}], [${f}.expression.property.name=${NAME_RE}])`
  return DENY_RE
    ? `${m}:not([${f}.name=${DENY_RE}]):not([${f}.property.name=${DENY_RE}]):not([${f}.expression.property.name=${DENY_RE}])`
    : m
}

const SELECTORS = Object.freeze([
  {
    selector:
      'BinaryExpression[operator=/^(===|!==|==|!=)$/]:matches(' +
      `[left.value=${LITERAL_RE}]${nameSide('right')}, ` +
      `[right.value=${LITERAL_RE}]${nameSide('left')})`,
    message: MESSAGE
  },
  {
    selector: `SwitchStatement${nameSide('discriminant')}`,
    message: MESSAGE
  },
  {
    selector:
      "CallExpression[callee.property.name='includes'][callee.object.type='ArrayExpression']" +
      `${nameSide('arguments.0')}:has(Literal[value=${LITERAL_RE}])`,
    message: MESSAGE
  }
])

const SCOPE_FILES = Object.freeze({
  frontend: ['src/frontend/**/*.{ts,tsx}'],
  backend: ['src/backend/**/*.ts']
})

const SCOPE_IGNORES = Object.freeze([
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/*.test.ts',
  '**/*.test.tsx',
  'src/backend/jest.setup*.ts',
  '**/*.d.ts',
  'src/backend/storeManagers/**'
])

module.exports = {
  SELECTORS,
  STORE_LITERALS,
  RUNNER_NAME,
  NAME_DENYLIST,
  SCOPE_FILES,
  SCOPE_IGNORES
}
