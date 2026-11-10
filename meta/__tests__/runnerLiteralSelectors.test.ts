/**
 * Phase 62 plan 02. Hit / non-hit cases for the D-13 runner-literal selectors,
 * settled before any ceiling is recorded (Pitfall 5).
 */
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { defined } from './fixtures/indexed'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SELECTORS, STORE_LITERALS } = require('../runnerLiteralSelectors.cjs')

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      languageOptions: { parser: tseslint.parser as never },
      rules: { 'no-restricted-syntax': ['error', ...SELECTORS] }
    }
  ]
})

async function hits(code: string): Promise<number> {
  const [res] = await eslint.lintText(code, { filePath: 'x.tsx' })
  return defined(res, 'lint result').messages.filter(
    (m) => m.ruleId === 'no-restricted-syntax'
  ).length
}

describe('runner literal selectors: HIT', () => {
  test.each([
    ["if (runner === 'steam') {}"],
    ["const a = game.runner !== 'gog'"],
    ["const a = 'nile' === props.runner"],
    ["const a = gameInfo?.runner == 'legendary'"],
    ["const a = store !== 'humble'"],
    ["const a = removedRunner !== 'steam'"],
    ["const a = scopedRunner === 'nile'"],
    ["const a = activeRunner === 'gog'"],
    ["const a = warnLoginForStore === 'gog'"],
    ["const a = props.activeRunner !== 'legendary'"],
    ["const a = runner != 'sideload'"],
    ["switch (gameInfo.runner) { case 'steam': break }"],
    ["switch (scopedRunner) { case 'gog': break }"],
    ["const a = ['legendary', 'gog'].includes(runner)"],
    ["const a = ['legendary', 'gog'].includes(game.runner)"],
    ["const a = library === 'gog'"],
    ["const a = value === 'sideload'"],
    ["const a = descriptor.value === 'sideload'"],
    ["const a = focusRow.value !== 'sideload'"],
    ["const a = (runner as string) === 'steam'"],
    ["const a = runner! === 'steam'"],
    ["const a = gameInfo['runner'] === 'steam'"],
    ["const a = game?.['runner'] === 'gog'"],
    ["const a = ['gog', 'nile'].indexOf(runner)"],
    ["const a = new Set(['gog', 'nile']).has(runner)"],
    ["const a = runnerStr === 'gog'"],
    ["const a = storeName === 'nile'"],
    ["const a = storeKey !== 'humble'"],
    ["switch (library) { case 'gog': break }"],
    // Inner switch of a nested pair: its own case is a store literal.
    ["switch (kind) { case 'a': switch (runner) { case 'steam': break } }"],
    // Composed wrappers (62-23 review WR-02).
    ["const a = (game?.runner as string) === 'steam'"],
    ["const a = (game?.runner)! === 'steam'"],
    ["const a = (runner as Runner)! === 'steam'"],
    ["const a = (game?.runner as string)! === 'steam'"],
    ["const a = 'steam' === (props.runner satisfies string)"],
    ["const a = (['gog'] as const).includes(runner)"],
    ["const a = (['gog', 'nile'] as const).indexOf(game?.runner as string)"],
    ["const a = (['gog'] satisfies string[]).includes(runner)"],
    ["const a = ['steam'].lastIndexOf(runner)"],
    ["const a = ['gog'].includes(runner!)"]
  ])('%s', async (code) => {
    expect(await hits(code)).toBeGreaterThanOrEqual(1)
  })
})

describe('runner literal selectors: NON-HIT', () => {
  test.each([
    ["const a = { runner: 'steam' }"],
    ['const m: Record<string, number> = { steam: 1 }'],
    ['const a = runner === otherRunner'],
    ['const a = scopedRunner === activeRunner'],
    ["const a = mountedOverlay === 'humble'"],
    ["const a = openOverlay === 'gog'"],
    ["const a = configStore === 'x'"],
    ["const a = platform === 'windows'"],
    ["type R = 'steam'"],
    ["// runner === 'steam'\nconst a = 1"],
    ["const a = store === 'electron'"],
    ['const a = `${runner}` === `steam`'],
    ["const a = ['a', 'b'].includes(runner)"],
    ["const a = ['steam'].includes(platform)"],
    ["switch (value) { case 'a': break }"],
    // The gate counts only this switch's own cases: a store-literal case of a
    // nested inner switch must not flag the outer switch (62-23 review WR-01).
    ["switch (value) { case 'a': switch (x) { case 'steam': break } }"],
    // The literal must be an element of the receiver array, not an argument.
    ["const a = ['a', 'b'].includes(runner, 'steam'.length)"],
    ["const a = (['a', 'b'] as const).includes(runner, 'steam'.length)"],
    ["const a = ['a'].lastIndexOf(runner)"],
    ["const a = new Set(['a']).has(runner, 'steam')"],
    ["const a = value === 'x'"],
    ['const a = library === otherLibrary'],
    ["const a = platform === 'steam'"],
    ["const a = activationKind === 'steam'"],
    ["const a = new Set(['a']).has(runner)"],
    ["const a = ['a', 'b'].indexOf(runner)"],
    ["const a = gameInfo['platform'] === 'steam'"],
    // Documented blind spot (see the selector header): the literals are not
    // inline, so a named set is not seen. Pinned at 0 on purpose.
    ['const a = STORES.has(runner)']
  ])('%s', async (code) => {
    expect(await hits(code)).toBe(0)
  })

  test('literal list appears as the six store names', () => {
    expect(STORE_LITERALS).toEqual([
      'steam',
      'gog',
      'legendary',
      'nile',
      'sideload',
      'humble'
    ])
  })
})
