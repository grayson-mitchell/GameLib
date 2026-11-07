import { importEngineSettings } from '../../engine/importEngineSettings'
import { getPerGameBottleNameFor } from '../../engine/gameEngineState'

describe('importGame engine settings (D-17)', () => {
  it('writes the engine and the server-computed bottle for automatic', () => {
    const expected = getPerGameBottleNameFor({
      runner: 'gog',
      appName: '1207658930'
    })
    expect(expected).toBeTruthy()
    expect(
      importEngineSettings({
        runner: 'gog',
        appName: '1207658930',
        engineOverride: 'automatic'
      })
    ).toEqual({ engineOverride: 'automatic', wineCrossoverBottle: expected })
  })

  it('writes nothing for legacy or path-like ids', () => {
    for (const engineOverride of ['legacy:x', '/bin/sh', undefined, 5]) {
      expect(
        importEngineSettings({ runner: 'gog', appName: '1', engineOverride })
      ).toBeNull()
    }
  })

  it('has no way to carry a renderer-sent bottle name', () => {
    const r = importEngineSettings({
      runner: 'legendary',
      appName: 'abc',
      engineOverride: 'crossover',
      // @ts-expect-error extra renderer field is ignored
      wineCrossoverBottle: 'evil'
    })
    expect(r?.wineCrossoverBottle).toBe(
      getPerGameBottleNameFor({ runner: 'legendary', appName: 'abc' })
    )
  })
})
