import { readFileSync } from 'fs'
import { join } from 'path'

import type { GamelibFixStatus } from 'common/types'
import { resolveGamelibFixDisplay } from '../gamelibFixDisplay'

/**
 * Quick 261027-ch9 -- the GameLib tick row's pure display decision, plus
 * source assertions on AppleWikiInfo.tsx (frontend jest has no jsdom).
 */

describe('resolveGamelibFixDisplay', () => {
  it.each([[undefined], [null]])('%p -> hidden', (s) => {
    expect(resolveGamelibFixDisplay(s)).toEqual({
      visible: false,
      launchNotice: null
    })
  })

  it.each(['bundled', 'local'] as const)('%s -> visible, no notice', (o) => {
    expect(resolveGamelibFixDisplay({ origin: o })).toEqual({
      visible: true,
      launchNotice: null
    })
  })

  it('carries the launchNotice', () => {
    expect(
      resolveGamelibFixDisplay({ origin: 'bundled', launchNotice: 'Uses DXVK' })
    ).toEqual({ visible: true, launchNotice: 'Uses DXVK' })
  })

  it('fails closed on an unexpected origin', () => {
    expect(
      resolveGamelibFixDisplay({
        origin: 'remote'
      } as unknown as GamelibFixStatus).visible
    ).toBe(false)
  })
})

describe('AppleWikiInfo.tsx GameLib row source', () => {
  const src = readFileSync(join(__dirname, '..', 'AppleWikiInfo.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('fetches the status and resolves the display', () => {
    expect(src).toContain('window.api')
    expect(src).toContain('getGamelibFixStatus')
    expect(src).toContain('resolveGamelibFixDisplay')
  })

  it('renders a CheckCircle tick and adds no Rating', () => {
    expect(src).toContain('<CheckCircle')
    expect(src.match(/<Rating/g)).toHaveLength(2)
  })

  it('leaves the existing row gates verbatim', () => {
    expect(src).toContain('const showProton =')
    expect(src).toContain('const showCrossover = is.mac && !!codeweavers')
    expect(src).toContain('const showWine = !!applegamingwiki && !showProton')
  })
})
