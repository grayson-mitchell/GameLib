import { readFileSync } from 'fs'
import { join } from 'path'
import type { WinetricksComponent } from 'common/types'
import * as verbsModule from '../verbs'
import {
  CURATED_WINETRICKS_VERBS,
  FAMILY_KEYS,
  TASK_GROUP_IDS,
  TASK_GROUP_MEMBERS,
  displayTitle,
  familyFor,
  resolveCuratedComponents,
  resolveSuggestedComponents,
  resolveTaskGroup,
  verbsForDirect3DVersions
} from '../verbs'
import { deriveNeedsGuiVerbs, parseWinetricksMetadata } from '../metadata'
import { isVisibleVerb } from '../visibility'

function component(verb: string, category = 'dlls'): WinetricksComponent {
  return { verb, title: verb, category, cached: false }
}

// The committed excerpt of the real pinned script (45-04). The D-07 test below
// reads membership straight from it, so a renamed or dropped upstream verb
// turns the membership test red instead of silently shrinking a group.
const FIXTURE_SCRIPT = readFileSync(
  join(__dirname, 'fixtures', 'winetricks-20260125-next.metadata.sh'),
  'utf8'
)
const FIXTURE_METADATA = parseWinetricksMetadata(FIXTURE_SCRIPT)
const FIXTURE_NEEDS_GUI = deriveNeedsGuiVerbs(FIXTURE_SCRIPT)

const GROUP_CATEGORY: Record<(typeof TASK_GROUP_IDS)[number], string> = {
  runtimes: 'dlls',
  directx: 'dlls',
  fonts: 'fonts',
  media: 'dlls',
  wineSettings: 'settings'
}

function fixtureCatalog(): WinetricksComponent[] {
  return [...FIXTURE_METADATA.values()].map((m) => ({
    verb: m.verb,
    title: m.title ?? m.verb,
    category: m.category,
    cached: false,
    needsGui: FIXTURE_NEEDS_GUI.has(m.verb)
  }))
}

// Returns a human-readable list of everything wrong with a membership map
// against the fixture. Empty means the map is sound.
function membershipProblems(
  members: Readonly<Record<string, readonly string[]>>
): string[] {
  const problems: string[] = []
  for (const group of TASK_GROUP_IDS) {
    for (const verb of members[group]) {
      const meta = FIXTURE_METADATA.get(verb)
      if (!meta) {
        problems.push(`${group}/${verb}: absent from the fixture`)
        continue
      }
      if (meta.category !== GROUP_CATEGORY[group]) {
        problems.push(
          `${group}/${verb}: category ${meta.category}, expected ${GROUP_CATEGORY[group]}`
        )
      }
      const entry = {
        verb,
        category: meta.category,
        needsGui: FIXTURE_NEEDS_GUI.has(verb)
      }
      if (!isVisibleVerb(entry)) {
        problems.push(`${group}/${verb}: not visible`)
      }
      if (FIXTURE_NEEDS_GUI.has(verb)) {
        problems.push(`${group}/${verb}: derived needs-GUI verb`)
      }
      const family = familyFor({ verb, category: meta.category })
      if (family === null || family.group !== group) {
        problems.push(`${group}/${verb}: family maps to ${family?.group}`)
      }
    }
  }
  return problems
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

  it('every curated verb maps to a family, so curated rows always render the two-line template', () => {
    for (const verb of CURATED_WINETRICKS_VERBS) {
      const meta = FIXTURE_METADATA.get(verb)
      expect(meta).toBeDefined()
      expect(familyFor({ verb, category: meta?.category ?? '' })).not.toBeNull()
    }
  })
})

describe('D-17: the hand-written needs-GUI list is gone', () => {
  it('verbs.ts exports no needs-GUI constant', () => {
    expect(
      Object.keys(verbsModule).filter((key) => /needs_?gui/i.test(key))
    ).toEqual([])
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

describe('task groups (D-05 / D-07)', () => {
  it('TASK_GROUP_IDS is exactly the five groups in order', () => {
    expect([...TASK_GROUP_IDS]).toEqual([
      'runtimes',
      'directx',
      'fonts',
      'media',
      'wineSettings'
    ])
    expect(Object.keys(TASK_GROUP_MEMBERS)).toEqual([...TASK_GROUP_IDS])
  })

  it('D-07: every member exists in the script fixture with the expected category, is visible, is not needs-GUI, and maps to a family of the same group', () => {
    expect(membershipProblems(TASK_GROUP_MEMBERS)).toEqual([])
  })

  it('D-07 non-vacuity: a member absent from the fixture fails the same check', () => {
    const tampered = {
      ...TASK_GROUP_MEMBERS,
      runtimes: [...TASK_GROUP_MEMBERS.runtimes, 'notaverb']
    }
    expect(membershipProblems(tampered)).toEqual([
      'runtimes/notaverb: absent from the fixture'
    ])
  })

  it('D-07 non-vacuity: a member filed under the wrong group fails the family check', () => {
    const tampered = {
      ...TASK_GROUP_MEMBERS,
      media: [...TASK_GROUP_MEMBERS.media, 'vcrun2019']
    }
    expect(membershipProblems(tampered)).toEqual([
      'media/vcrun2019: family maps to runtimes'
    ])
  })

  it('D-07: groups are shortcut views, not a partition -- the same objects stay in the catalog', () => {
    const catalog = fixtureCatalog()
    const before = [...catalog]
    for (const id of TASK_GROUP_IDS) {
      const resolved = resolveTaskGroup(catalog, id)
      expect(resolved.length).toBeGreaterThan(0)
      for (const item of resolved) {
        expect(catalog).toContain(item)
      }
    }
    expect(catalog).toEqual(before)
    expect(catalog).toHaveLength(before.length)
  })

  it('resolveTaskGroup returns members in map order and skips a member absent from the catalog', () => {
    const catalog = [component('vcrun2013'), component('vcrun2022')]
    const resolved = resolveTaskGroup(catalog, 'runtimes')
    expect(resolved.map((c) => c.verb)).toEqual(['vcrun2022', 'vcrun2013'])
    expect(resolved[1]).toBe(catalog[0])
  })

  it('D-05: no group id is a raw upstream category name other than the fonts and settings-shaped ones', () => {
    expect(TASK_GROUP_IDS).not.toContain('dlls')
    expect(TASK_GROUP_IDS).not.toContain('settings')
  })
})

describe('familyFor (D-08)', () => {
  it('exposes exactly 13 family keys', () => {
    expect([...FAMILY_KEYS]).toEqual([
      'vcrun',
      'dotnet',
      'vbrun',
      'd3dx',
      'dxvk',
      'physx',
      'xactXinput',
      'fonts',
      'media',
      'fontsmooth',
      'videomemorysize',
      'csmt',
      'vd'
    ])
  })

  it.each([
    ['vcrun2019', 'dlls', 'vcrun', 'runtimes'],
    ['dotnet48', 'dlls', 'dotnet', 'runtimes'],
    ['vb6run', 'dlls', 'vbrun', 'runtimes'],
    ['d3dx9', 'dlls', 'd3dx', 'directx'],
    ['d3dcompiler_47', 'dlls', 'd3dx', 'directx'],
    ['dxvk2071', 'dlls', 'dxvk', 'directx'],
    ['dxvk', 'dlls', 'dxvk', 'directx'],
    ['physx', 'dlls', 'physx', 'directx'],
    ['xact_x64', 'dlls', 'xactXinput', 'directx'],
    ['xinput', 'dlls', 'xactXinput', 'directx'],
    ['arial', 'fonts', 'fonts', 'fonts'],
    ['wmp10', 'dlls', 'media', 'media'],
    ['quartz_feb2010', 'dlls', 'media', 'media'],
    ['mf', 'dlls', 'media', 'media'],
    ['fontsmooth=rgb', 'settings', 'fontsmooth', 'wineSettings'],
    ['videomemorysize=2048', 'settings', 'videomemorysize', 'wineSettings'],
    ['csmt=on', 'settings', 'csmt', 'wineSettings'],
    ['vd=off', 'settings', 'vd', 'wineSettings']
  ])('%s (%s) -> %s / %s', (verb, category, family, group) => {
    expect(familyFor({ verb, category })).toEqual({ family, group })
  })

  it.each([
    ['dxvk_nvapi', 'dlls'],
    ['dxvk_nvapi0061', 'dlls'],
    ['amstream', 'dlls'],
    ['mfc42', 'dlls'],
    ['vdf', 'dlls']
  ])('%s (%s) is outside every family', (verb, category) => {
    expect(familyFor({ verb, category })).toBeNull()
  })
})

describe('verbsForDirect3DVersions (D-06)', () => {
  it('maps 9, 10 and 11 to their runtime verbs', () => {
    expect(verbsForDirect3DVersions(['9'])).toEqual(['d3dx9'])
    expect(verbsForDirect3DVersions(['10'])).toEqual([
      'd3dx10',
      'd3dcompiler_43'
    ])
    expect(verbsForDirect3DVersions(['11'])).toEqual([
      'd3dx11_43',
      'd3dcompiler_47'
    ])
  })

  it('reads the leading integer of a PCGamingWiki value such as 9.0c', () => {
    expect(verbsForDirect3DVersions(['9.0c'])).toEqual(['d3dx9'])
  })

  it('returns nothing for unknown or empty versions', () => {
    expect(verbsForDirect3DVersions([])).toEqual([])
    expect(verbsForDirect3DVersions(['12', 'abc', ''])).toEqual([])
  })

  it('de-duplicates across versions, keeping first-seen order', () => {
    expect(verbsForDirect3DVersions(['9', '9.0c', '11'])).toEqual([
      'd3dx9',
      'd3dx11_43',
      'd3dcompiler_47'
    ])
  })
})

describe('resolveSuggestedComponents (D-06)', () => {
  const catalog: WinetricksComponent[] = [
    ...CURATED_WINETRICKS_VERBS.map((v) => component(v)),
    component('d3dx11_43'),
    component('d3dcompiler_47'),
    component('d3dx10')
  ]

  it('puts game-specific rows first, de-duplicated and resolved only against the catalog, then the curated rest', () => {
    const result = resolveSuggestedComponents({
      catalog,
      knownFixVerbs: ['d3dx9', 'vcrun2019', 'notinCatalog'],
      direct3DVersions: ['9', '11']
    })
    expect(result.gameSpecific.map((c) => c.verb)).toEqual([
      'd3dx9',
      'vcrun2019',
      'd3dx11_43',
      'd3dcompiler_47'
    ])
    expect(result.curated.map((c) => c.verb)).toEqual(
      CURATED_WINETRICKS_VERBS.filter((v) => v !== 'd3dx9' && v !== 'vcrun2019')
    )
  })

  it('with no per-game signal returns the curated 8 alone, in curated order', () => {
    const result = resolveSuggestedComponents({
      catalog,
      knownFixVerbs: [],
      direct3DVersions: []
    })
    expect(result.gameSpecific).toEqual([])
    expect(result.curated.map((c) => c.verb)).toEqual([
      ...CURATED_WINETRICKS_VERBS
    ])
  })

  it('returns the same component objects present in the catalog', () => {
    const result = resolveSuggestedComponents({
      catalog,
      knownFixVerbs: ['d3dx9'],
      direct3DVersions: []
    })
    expect(result.gameSpecific[0]).toBe(catalog.find((c) => c.verb === 'd3dx9'))
  })

  it('T-45-14: a hidden verb absent from the visible catalog is skipped, never fabricated', () => {
    const result = resolveSuggestedComponents({
      catalog,
      knownFixVerbs: ['annihilate', 'winecfg'],
      direct3DVersions: []
    })
    expect(result.gameSpecific).toEqual([])
  })
})

describe('displayTitle', () => {
  it('strips a truncated trailing parenthesised group', () => {
    expect(
      displayTitle('Visual C++ 2015-2019 libraries (concrt140.dll,mfc140.dll')
    ).toBe('Visual C++ 2015-2019 libraries')
  })

  it('strips a closed trailing parenthesised group', () => {
    expect(displayTitle('Adobe AIR (Adobe, 2019)')).toBe('Adobe AIR')
  })

  it('strips only the last group', () => {
    expect(
      displayTitle('All codecs (dirac, ffdshow) except wmp (various, 1995)')
    ).toBe('All codecs (dirac, ffdshow) except wmp')
  })

  it('leaves a title with no parentheses unchanged', () => {
    expect(displayTitle('MS d3dx9_??.dll from DirectX 9 redistributable')).toBe(
      'MS d3dx9_??.dll from DirectX 9 redistributable'
    )
  })

  it('never returns an empty string: a title that is only a group is kept', () => {
    expect(displayTitle('(only parens)')).toBe('(only parens)')
  })

  it('trims trailing whitespace', () => {
    expect(displayTitle('Foo   ')).toBe('Foo')
    expect(displayTitle('Foo (bar)  ')).toBe('Foo')
  })
})
