/**
 * Unit coverage for `parseWinetricksListAll` (quick-260915-ajd).
 *
 * FIXTURE RULE -- load-bearing. Every fixture here is a synthetic string.
 * No test may shell out to the real winetricks binary: F-9 measured that a
 * run of the real binary can pass 0 lines lost on a good day (run B, 329/329)
 * while the SAME unfixed per-chunk-word parser lost 3/329 on the very next
 * run (run A) -- a live-output assertion proves nothing on a good run and
 * flakes on a bad one. Fixtures are also the only way to exercise chunk
 * coalescing deterministically at all.
 */
import { parseWinetricksListAll } from '../winetricksListParse'
import { CURATED_WINETRICKS_VERBS } from 'common/winetricks/verbs'

// D-03 / 44-VALIDATION.md Wave 0 / 44-RESEARCH.md Open Question 4: no
// committed fixture covered all 8 curated verbs, so D-03's "a unit test
// over the committed parser fixture fails if any of the 8 stops resolving"
// assertion could not be written. This fixture closes that gap with
// realistic, multi-category, multi-chunk content (the real
// `listAvailable()` path feeds the parser a chunk array, not one string --
// the `===== fonts =====` header below is the LAST line of the first chunk
// element, landing exactly at the chunk boundary, with `fonts`' own verb
// line beginning the second chunk element). It also seeds 2 of the 8
// Needs-GUI verbs (`3dmark06`, `ubisoftconnect`) so plan 44-03's routing has
// fixture-backed vocabulary, and one deliberately-duplicated verb
// (`corefonts`, first under `fonts` then again under `settings`) so the
// parser's first-occurrence-wins dedup stays exercised across two different
// categories, not just within one.
const CURATED_COVERAGE_CHUNKS: string[] = [
  '===== apps =====\n' +
    'ubisoftconnect          Ubisoft Connect [downloadable]\n' +
    '===== benchmarks =====\n' +
    '3dmark06                3DMark06 [downloadable]\n' +
    '===== dlls =====\n' +
    'vcrun2019               Visual C++ 2019 Libraries [downloadable,cached]\n' +
    'vcrun2013               Visual C++ 2013 Libraries [downloadable]\n' +
    'vcrun2010               Visual C++ 2010 Libraries [downloadable,cached]\n' +
    'd3dx9                   MS d3dx9 (June 2010) [downloadable,cached]\n' +
    'xact                    MS XACT Engine [downloadable]\n' +
    'physx                   PhysX (Feb 2010) [downloadable,cached]\n' +
    'dotnet48                MS .NET 4.8 [downloadable]\n' +
    '===== fonts =====\n',
  'corefonts               MS Core Fonts [downloadable,cached]\n' +
    '===== settings =====\n' +
    'sound=alsa              Set sound driver to alsa \n' +
    'corefonts               MS Core Fonts (dup, wrong category) [cached]\n'
]

describe('parseWinetricksListAll', () => {
  it('parses the plain printf shape (no publisher/year)', () => {
    const chunks = [
      '===== dlls =====\n' +
        'vcrun2019              Visual C++ 2019 Libraries [downloadable,cached]\n'
    ]
    const result = parseWinetricksListAll(chunks)
    expect(result).toEqual([
      {
        verb: 'vcrun2019',
        title: 'Visual C++ 2019 Libraries',
        category: 'dlls',
        cached: true
      }
    ])
  })

  it('parses the (publisher, year) printf shape', () => {
    const chunks = [
      '===== dlls =====\n' +
        'adobeair               Adobe AIR (Adobe, 2019) [downloadable]\n'
    ]
    const result = parseWinetricksListAll(chunks)
    expect(result).toEqual([
      {
        verb: 'adobeair',
        title: 'Adobe AIR (Adobe, 2019)',
        category: 'dlls',
        cached: false
      }
    ])
  })

  it('derives `cached` from all four flag variants', () => {
    const chunks = [
      '===== dlls =====\n' +
        'noflags                 A Component \n' +
        'downloadableonly        A Component [downloadable]\n' +
        'cachedonly              A Component [cached]\n' +
        'both                    A Component [downloadable,cached]\n'
    ]
    const result = parseWinetricksListAll(chunks)
    expect(result.map((c) => [c.verb, c.cached])).toEqual([
      ['noflags', false],
      ['downloadableonly', false],
      ['cachedonly', true],
      ['both', true]
    ])
  })

  it('trims the trailing space left by the empty-flags printf shape', () => {
    const chunks = [
      '===== dlls =====\n' + 'noflags                 A Component \n'
    ]
    const result = parseWinetricksListAll(chunks)
    expect(result).toEqual([
      { verb: 'noflags', title: 'A Component', category: 'dlls', cached: false }
    ])
    expect(result[0].title).not.toMatch(/\s$/)
  })

  describe('chunk coalescing (F-9)', () => {
    it('yields one component per line when a single chunk carries 5 complete lines', () => {
      const chunks = [
        '===== dlls =====\n' +
          'verbone                 Verb One [downloadable]\n' +
          'verbtwo                 Verb Two [cached]\n' +
          'verbthree               Verb Three [downloadable,cached]\n' +
          'verbfour                Verb Four \n' +
          'verbfive                Verb Five [downloadable]\n'
      ]
      const result = parseWinetricksListAll(chunks)
      expect(result).toHaveLength(5)
      expect(result.map((c) => c.verb)).toEqual([
        'verbone',
        'verbtwo',
        'verbthree',
        'verbfour',
        'verbfive'
      ])
    })

    it('yields one correct component when a single line is split across two chunks mid-verb', () => {
      const chunks = [
        '===== dlls =====\n' + 'splitv',
        'erb                Split Verb [cached]\n'
      ]
      const result = parseWinetricksListAll(chunks)
      expect(result).toEqual([
        {
          verb: 'splitverb',
          title: 'Split Verb',
          category: 'dlls',
          cached: true
        }
      ])
    })

    it('would fail against a naive per-chunk split(" ", 1)[0] parser -- negative control anchor', () => {
      // This test documents the property the coalescing tests above defend:
      // per-chunk word extraction on the split-mid-verb fixture would yield
      // the chunk-leading word "splitv" (truncated, wrong), not "splitverb".
      const chunks = [
        '===== dlls =====\n' + 'splitv',
        'erb                Split Verb [cached]\n'
      ]
      const naive = chunks.map((c) => c.split(' ', 1)[0])
      expect(naive).not.toContain('splitverb')

      const result = parseWinetricksListAll(chunks)
      expect(result[0]?.verb).toBe('splitverb')
    })
  })

  describe('the >24-char verb trap (F-12)', () => {
    it('parses a 26-char verb followed by exactly one space, unaffected by the %-24s padding', () => {
      const chunks = [
        '===== settings =====\n' +
          'autostart_winedbg=disabled Automatically start winedbg on crashes \n'
      ]
      const result = parseWinetricksListAll(chunks)
      expect(result).toEqual([
        {
          verb: 'autostart_winedbg=disabled',
          title: 'Automatically start winedbg on crashes',
          category: 'settings',
          cached: false
        }
      ])
    })

    it('parses a verb exactly 24 chars wide (padded to 24 then one space)', () => {
      const chunks = [
        '===== settings =====\n' +
          'windowmanagerdecorated=y Enable window manager decoration and control \n'
      ]
      const result = parseWinetricksListAll(chunks)
      expect(result).toEqual([
        {
          verb: 'windowmanagerdecorated=y',
          title: 'Enable window manager decoration and control',
          category: 'settings',
          cached: false
        }
      ])
    })

    it('would fail against a fixed-column slice -- negative control anchor', () => {
      const line =
        'autostart_winedbg=disabled Automatically start winedbg on crashes '
      const fixedColumnVerb = line.slice(0, 24).trim()
      expect(fixedColumnVerb).not.toBe('autostart_winedbg=disabled')

      const chunks = ['===== settings =====\n' + line + '\n']
      const result = parseWinetricksListAll(chunks)
      expect(result[0]?.verb).toBe('autostart_winedbg=disabled')
    })
  })

  describe('noise rejection (F-10)', () => {
    it('drops the macOS taskset/cpuset warning line and keeps parsing the real lines around it', () => {
      const chunks = [
        'warning: taskset/cpuset not available on your platform!\n' +
          '===== dlls =====\n' +
          'before                  Before Verb [downloadable]\n' +
          'warning: taskset/cpuset not available on your platform!\n' +
          'after                   After Verb [cached]\n'
      ]
      const result = parseWinetricksListAll(chunks)
      expect(result.map((c) => c.verb)).not.toContain('warning:')
      expect(result).toHaveLength(2)
      expect(result.map((c) => c.verb)).toEqual(['before', 'after'])
    })
  })

  describe('the allcodecs nested-parens title (F-12)', () => {
    it('keeps the full title including the text after the inner parenthesised group', () => {
      const line =
        'allcodecs               All codecs (dirac, ffdshow, icodecs, cinepak, l3codecx, xvid) except wmp (various, 1995-2009) [downloadable]'
      const chunks = ['===== dlls =====\n' + line + '\n']
      const result = parseWinetricksListAll(chunks)
      expect(result).toHaveLength(1)
      expect(result[0].verb).toBe('allcodecs')
      expect(result[0].cached).toBe(false)
      expect(result[0].title.includes('except wmp')).toBe(true)
      expect(result[0].title).toBe(
        'All codecs (dirac, ffdshow, icodecs, cinepak, l3codecx, xvid) except wmp (various, 1995-2009)'
      )
    })
  })

  describe('the `prefix` block is skipped as a block (F-6)', () => {
    it('yields zero components from the prefix block even though its lines pass the verb shape test', () => {
      const chunks = [
        '===== dlls =====\n' +
          'realverb                Real Verb [downloadable]\n' +
          '===== prefix =====\n' +
          'apps\n' +
          'dlls\n' +
          'fonts\n' +
          'settings\n' +
          '===== fonts =====\n' +
          'corefonts               MS Core Fonts [cached]\n'
      ]
      const result = parseWinetricksListAll(chunks)
      expect(result.map((c) => c.verb)).toEqual(['realverb', 'corefonts'])
      expect(result.map((c) => c.verb)).not.toContain('apps')
      expect(result.map((c) => c.verb)).not.toContain('dlls')
      expect(result.map((c) => c.verb)).not.toContain('fonts')
      expect(result.map((c) => c.verb)).not.toContain('settings')
    })
  })

  it('takes category from the enclosing header, one of apps|benchmarks|dlls|fonts|settings', () => {
    const chunks = [
      '===== apps =====\n' +
        'steam                   Steam [downloadable]\n' +
        '===== benchmarks =====\n' +
        'heaven                  Unigine Heaven [downloadable]\n' +
        '===== dlls =====\n' +
        'vcrun2019               Visual C++ 2019 [cached]\n' +
        '===== fonts =====\n' +
        'corefonts               MS Core Fonts [cached]\n' +
        '===== settings =====\n' +
        'sound=alsa              Set sound driver to alsa \n'
    ]
    const result = parseWinetricksListAll(chunks)
    expect(result.map((c) => c.category)).toEqual([
      'apps',
      'benchmarks',
      'dlls',
      'fonts',
      'settings'
    ])
  })

  it('drops lines appearing before the first ===== header', () => {
    const chunks = [
      'orphan                  Should Not Appear [cached]\n' +
        '===== dlls =====\n' +
        'realverb                Real Verb [downloadable]\n'
    ]
    const result = parseWinetricksListAll(chunks)
    expect(result.map((c) => c.verb)).toEqual(['realverb'])
  })

  it('dedupes duplicate verbs, first occurrence wins', () => {
    const chunks = [
      '===== dlls =====\n' +
        'dupe                    First Title [downloadable]\n' +
        'dupe                    Second Title [cached]\n'
    ]
    const result = parseWinetricksListAll(chunks)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      verb: 'dupe',
      title: 'First Title',
      category: 'dlls',
      cached: false
    })
  })

  describe('D-03 curated coverage fixture', () => {
    it('parses the multi-category, multi-chunk fixture structurally', () => {
      const result = parseWinetricksListAll(CURATED_COVERAGE_CHUNKS)

      // apps(1) + benchmarks(1) + dlls(7) + fonts(1) + settings(1) = 11
      // distinct entries; the duplicate `corefonts` under `settings` is
      // dropped by first-occurrence dedup and adds nothing.
      expect(result).toHaveLength(11)

      const allowedCategories = new Set([
        'apps',
        'benchmarks',
        'dlls',
        'fonts',
        'settings'
      ])
      for (const entry of result) {
        expect(allowedCategories.has(entry.category)).toBe(true)
      }

      const byVerb = new Map(result.map((c) => [c.verb, c]))
      expect(byVerb.get('vcrun2019')?.cached).toBe(true)
      expect(byVerb.get('vcrun2013')?.cached).toBe(false)
      expect(byVerb.get('vcrun2010')?.cached).toBe(true)
      expect(byVerb.get('corefonts')?.cached).toBe(true)
      expect(byVerb.get('sound=alsa')?.cached).toBe(false)

      // The duplicated verb appears exactly once, with its FIRST-occurrence
      // category (`fonts`) even though a second occurrence under `settings`
      // follows it in the fixture.
      const corefontsEntries = result.filter((c) => c.verb === 'corefonts')
      expect(corefontsEntries).toHaveLength(1)
      expect(corefontsEntries[0].title).toBe('MS Core Fonts')
      expect(corefontsEntries[0].category).toBe('fonts')
    })

    it('D-03: every curated verb resolves against the committed parse fixture', () => {
      const result = parseWinetricksListAll(CURATED_COVERAGE_CHUNKS)
      const parsedVerbs = new Set(result.map((c) => c.verb))

      const unresolved = CURATED_WINETRICKS_VERBS.filter(
        (verb) => !parsedVerbs.has(verb)
      )

      expect(unresolved).toEqual([])
    })
  })
})
