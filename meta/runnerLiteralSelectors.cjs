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
 * - Compared-name match (62-23 WR-02 widened): an Identifier, or a
 *   MemberExpression property, whose name matches RUNNER_NAME: the exact names
 *   `runner`, `store`, `library`, `value`; any `runner*`/`store*` prefix form
 *   (`runnerStr`, `storeName`); any `*Runner`/`*Store` suffix form
 *   (`removedRunner`, `warnLoginForStore`). Also seen through a computed
 *   property (`x['runner']`, `x?.['runner']`), a cast (`(runner as string)`,
 *   TSAsExpression) and a non-null (`runner!`, TSNonNullExpression). `library`
 *   and `value` are generic, but every arm also needs a store literal on the
 *   other side (or a store-literal case / element), so they only fire against
 *   one of the six store names. UI overlay ids (`mountedOverlay`) are not matched.
 * - Arms: equality against a store literal; `switch (name)` with at least one
 *   store-literal `case` (so `switch (value) { case 'a': }` is not flagged);
 *   `[..literals..].includes(name)` / `.indexOf(name)`; and an inline
 *   `new Set([..literals..]).has(name)`.
 * - Not matched: object-literal maps keyed by runner, `runner: 'steam'`
 *   property values, type annotations, comments, template literals.
 *
 * Known blind spots (so a zero count is read correctly): comparisons where the
 * operand has any other name (`platform`, `kind`, `id`, `key`, or a one-letter
 * callback param such as `r` in `.some((r) => r === 'gog')`); named array/set
 * constants (`STEAM_LIKE.includes(runner)`, `STORES.has(runner)`) because the
 * literal is not inline; `Object.is`, `startsWith`, Map/object lookups and
 * template literals; destructured-and-renamed values; and everything in
 * SCOPE_IGNORES plus `src/common/**` (outside SCOPE_FILES).
 *
 * Rejected alternative: an operand-agnostic rule (any equality against a store
 * literal). A planning-time grep found 15 non-identity comparisons sharing the
 * literals that would all fire: Humble key `platform === 'steam'` (4 sites),
 * `activationKind === 'steam'` (1), Login UI overlay ids `openOverlay` /
 * `mountedOverlay` (8), the URL scheme check in backend/platform/openDetached.ts
 * (1), and gamesdb `entry.platform_id === 'steam'` (1). Those concern key
 * platforms, UI overlays, URL schemes and third-party ids, not runner identity.
 *
 * Provenance: 62-02 created; 62-23 (WR-02): widened.
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
const RUNNER_NAME =
  /^(runner|store|library|value)$|^(runner|store)[A-Z0-9_]|[a-z0-9]Runner$|[a-z0-9]Store$/

// Names that end in Runner/Store but are not store identity. Each entry: a
// one-line reason. Empty: no false positive found while measuring.
const NAME_DENYLIST = Object.freeze([])

const MESSAGE =
  'Do not compare a runner/store value against a store literal; ask ' +
  '`storeCapabilities` / `isStore` in src/common/storeCapabilities.ts instead.'

const LITERAL_RE = `/^(${STORE_LITERALS.join('|')})$/`
const NAME_RE = `/${RUNNER_NAME.source}/`
const DENY_RE = NAME_DENYLIST.length ? `/^(${NAME_DENYLIST.join('|')})$/` : null

// Selector fragment: field `f` is a runner/store-named operand. Arms: Identifier,
// member property, optional member (ChainExpression), computed property
// (`x['runner']`, `x?.['runner']`), and TSAsExpression / TSNonNullExpression.
function nameSide(f) {
  const arms = [
    `${f}.name`,
    `${f}.property.name`,
    `${f}.expression.property.name`,
    `${f}.property.value`,
    `${f}.expression.name`,
    `${f}.expression.property.value`
  ]
  const m = `:matches(${arms.map((a) => `[${a}=${NAME_RE}]`).join(', ')})`
  return DENY_RE ? m + arms.map((a) => `:not([${a}=${DENY_RE}])`).join('') : m
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
    selector: `SwitchStatement${nameSide('discriminant')}:has(SwitchCase[test.value=${LITERAL_RE}])`,
    message: MESSAGE
  },
  {
    selector:
      "CallExpression[callee.property.name=/^(includes|indexOf)$/][callee.object.type='ArrayExpression']" +
      `${nameSide('arguments.0')}:has(Literal[value=${LITERAL_RE}])`,
    message: MESSAGE
  },
  {
    selector:
      "CallExpression[callee.property.name='has'][callee.object.type='NewExpression'][callee.object.callee.name='Set']" +
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
