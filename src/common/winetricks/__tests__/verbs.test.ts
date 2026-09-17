import type { WinetricksComponent } from 'common/types'
import {
  CURATED_WINETRICKS_VERBS,
  NEEDS_GUI_WINETRICKS_VERBS,
  resolveCuratedComponents
} from '../verbs'

function component(verb: string, category = 'dlls'): WinetricksComponent {
  return { verb, title: verb, category, cached: false }
}

describe('CURATED_WINETRICKS_VERBS', () => {
  it("has exactly 8 verbs in D-01's exact order", () => {
    expect(CURATED_WINETRICKS_VERBS).toEqual([
      'vcrun2019',
      'vcrun2013',
      'vcrun2010',
      'dotnet48',
      'd3dx9',
      'xact',
      'corefonts',
      'physx'
    ])
  })
})

describe('NEEDS_GUI_WINETRICKS_VERBS', () => {
  it('has size 8 and contains each named verb', () => {
    expect(NEEDS_GUI_WINETRICKS_VERBS.size).toBe(8)
    for (const verb of [
      '3dmark03',
      '3dmark06',
      'fontxplorer',
      'foobar2000',
      'stalker_pripyat_bench',
      'ubisoftconnect',
      'unigine_heaven',
      'utorrent'
    ]) {
      expect(NEEDS_GUI_WINETRICKS_VERBS.has(verb)).toBe(true)
    }
  })
})

describe('resolveCuratedComponents', () => {
  it('preserves curated order (not input order) given a shuffled input', () => {
    const shuffled: WinetricksComponent[] = [
      component('physx'),
      component('vcrun2010'),
      component('corefonts'),
      component('xact'),
      component('vcrun2019'),
      component('d3dx9'),
      component('dotnet48'),
      component('vcrun2013')
    ]
    const result = resolveCuratedComponents(shuffled)
    expect(result.map((c) => c.verb)).toEqual([...CURATED_WINETRICKS_VERBS])
  })

  it('silently omits a curated verb absent from the input and returns the remaining 7', () => {
    const missingVcrun2019 = CURATED_WINETRICKS_VERBS.filter(
      (v) => v !== 'vcrun2019'
    ).map((v) => component(v))
    const result = resolveCuratedComponents(missingVcrun2019)
    expect(result).toHaveLength(7)
    expect(result.map((c) => c.verb)).not.toContain('vcrun2019')
  })

  it('returns referentially-identical objects for matched entries', () => {
    const vcrun2019 = component('vcrun2019')
    const input = [vcrun2019, component('physx')]
    const result = resolveCuratedComponents(input)
    expect(result[0]).toBe(vcrun2019)
  })

  it('does not mutate its input array', () => {
    const input = [component('physx'), component('vcrun2019')]
    const inputCopy = [...input]
    resolveCuratedComponents(input)
    expect(input).toEqual(inputCopy)
    expect(input).toHaveLength(2)
  })

  it('does not filter curated verbs out of the returned view of `all` (D-02: caller still owns `all`)', () => {
    const input = [component('vcrun2019'), component('someOtherVerb')]
    const inputBefore = [...input]
    resolveCuratedComponents(input)
    expect(input).toEqual(inputBefore)
  })
})
