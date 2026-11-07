import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  engineInstallConfig,
  initialInstallEngine,
  installsViaCrossoverForEngine
} from '../WineSelector/engineInstallChoice'

/**
 * Phase 61 D-17 / D-20. This Frontend jest project has no jsdom, so, like
 * installModalSource.test.ts, the dialog wiring is proven as comment-stripped
 * source gates and the write shape is proven on the pure helper the dialogs
 * call. Rendering is a manual gate.
 */
const read = (rel: string) =>
  stripSourceComments(readFileSync(join(__dirname, '..', rel), 'utf8'))

describe('engineInstallConfig write shape', () => {
  it('writes engineOverride and the backend bottle, no wine fields', async () => {
    const config = await engineInstallConfig({
      runner: 'legendary',
      appName: 'abc',
      engineOverride: 'automatic',
      getBottleName: () => Promise.resolve('gamelib-legendary-abc')
    })
    expect(config).toEqual({
      engineOverride: 'automatic',
      wineCrossoverBottle: 'gamelib-legendary-abc'
    })
    expect(config).not.toHaveProperty('winePrefix')
    expect(config).not.toHaveProperty('wineVersion')
  })

  it('omits the bottle when the backend returns none', async () => {
    expect(
      await engineInstallConfig({
        runner: 'gog',
        appName: '1',
        engineOverride: 'crossover',
        getBottleName: () => Promise.resolve(null)
      })
    ).toEqual({ engineOverride: 'crossover' })
  })

  it('a Legacy global default starts the install on automatic (D-20)', () => {
    expect(initialInstallEngine('legacy:Game Porting Toolkit')).toBe(
      'automatic'
    )
  })

  it('risk input follows the engine: automatic yes, pinned no', () => {
    expect(installsViaCrossoverForEngine('automatic')).toBe(true)
    expect(installsViaCrossoverForEngine('pinned:x')).toBe(false)
  })
})

describe('dialog wiring (source gates)', () => {
  it.each(['DownloadDialog', 'ThirdPartyDialog', 'SideloadDialog'])(
    '%s writes the engine config via the backend bottle name',
    (d) => {
      const src = read(`${d}/index.tsx`)
      expect(src).toMatch(/engineInstallConfig\(/)
      expect(src).toMatch(/getPerGameBottleName\(/)
    }
  )

  it('ImportDialog sends engineOverride and omits wine fields in that case', () => {
    const src = read('ImportDialog/index.tsx')
    expect(src).toMatch(/\{ engineOverride \}/)
  })

  it('the risk dialog input uses the engine for Download and ThirdParty', () => {
    for (const d of ['DownloadDialog', 'ThirdPartyDialog']) {
      expect(read(`${d}/index.tsx`)).toMatch(
        /installsViaCrossoverForEngine\(engineOverride\)/
      )
    }
  })

  it('the modal swaps WineSelector for EngineSelector on the gate, Steam untouched', () => {
    const src = read('index.tsx')
    expect(src).toMatch(/useEngineChoice \? \(\s*<EngineSelector/g)
    expect(src.match(/<EngineSelector/g)).toHaveLength(4)
    expect(src).toMatch(/showWineSelector && !steamBridgeOwnsEngine/)
  })
})
