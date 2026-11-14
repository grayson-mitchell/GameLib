/**
 * Phase 70 (70-03). Pure functions of the temporary flip probe; the full
 * program is not run under jest (about 12 s).
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { applyFlip, parseArgs, classify } = require('../gameInfoFlipProbe.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const FB = '// PHASE70-FLIP-PROBE: fat-begin'
const FE = '// PHASE70-FLIP-PROBE: fat-end'
const KB = '  // PHASE70-FLIP-PROBE: store-keys-begin'
const KE = '  // PHASE70-FLIP-PROBE: store-keys-end'

const good = [
  'interface A {',
  KB,
  '  steamKey?: string',
  KE,
  '  keep: 1',
  '}',
  FB,
  'export interface GameInfo {',
  '  x: 1',
  '}',
  FE,
  'interface B {',
  KB,
  '  other?: string',
  KE,
  '}'
].join('\n')

describe('applyFlip', () => {
  it('replaces the fat region and drops store-keys regions', () => {
    const out = applyFlip(good)
    expect(out).toContain('export type GameInfo = GameInfoByRunner[Runner]')
    expect(out).not.toContain('interface GameInfo')
    expect(out).not.toContain('steamKey')
    expect(out).not.toContain('other?')
    expect(out).not.toContain('PHASE70')
    expect(out).toContain('keep: 1')
  })

  it('throws when the fat pair is missing', () => {
    expect(() => applyFlip(good.replace(FB, '').replace(FE, ''))).toThrow(
      /fat-begin/
    )
  })

  it('throws when the fat pair is duplicated', () => {
    expect(() => applyFlip(`${good}\n${FB}`)).toThrow(/fat-begin/)
  })

  it('throws when the store-keys pairs are unbalanced', () => {
    expect(() => applyFlip(`${good}\n${KB}`)).toThrow(/store-keys-begin/)
  })
})

describe('parseArgs', () => {
  it('collects repeated --only and flags', () => {
    expect(
      parseArgs(['--only', 'a/', '--only', 'b/', '--non-test', '--json'])
    ).toEqual({ only: ['a/', 'b/'], nonTest: true, json: true })
  })

  it('errors on a flag missing its value', () => {
    expect(() => parseArgs(['--only'])).toThrow(/--only/)
  })
})

describe('classify', () => {
  it('detects test and storeManagers paths', () => {
    expect(classify('src/backend/storeManagers/gog/__tests__/x.ts')).toEqual({
      test: true,
      storeManagers: true
    })
    expect(classify('src/frontend/a.test.tsx')).toEqual({
      test: true,
      storeManagers: false
    })
    expect(classify('src/backend/storeManagers/steam/a.ts')).toEqual({
      test: false,
      storeManagers: true
    })
  })
})
