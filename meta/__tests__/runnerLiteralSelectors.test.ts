/**
 * Phase 62 plan 02. Hit / non-hit cases for the D-13 runner-literal selectors,
 * settled before any ceiling is recorded (Pitfall 5).
 */
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'

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
  return res.messages.filter((m) => m.ruleId === 'no-restricted-syntax').length
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
    ["const a = ['legendary', 'gog'].includes(game.runner)"]
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
    ["const a = ['steam'].includes(platform)"]
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
