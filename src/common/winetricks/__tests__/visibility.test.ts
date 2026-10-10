/**
 * Unit coverage for the D-09 visibility predicate (45-04): `isVisibleVerb`
 * and `filterVisibleCatalog`. Pure, synchronous, no fs/electron -- the
 * catalog objects these take are plain data (verb/category/needsGui), never
 * a wine or winetricks process.
 *
 * D-09: hide the `apps` and `benchmarks` categories plus the interactive
 * launcher verbs upstream seats on winetricks' own screen-2 menu
 * (winecfg, regedit, taskmgr, explorer, uninstaller, winecmd,
 * wine_misc_exe, shell, folder, annihilate) and any verb the D-17 needs-GUI
 * derivation flags. Keep everything else, including the install-shaped
 * settings verbs (`fontsmooth=*`, `csmt=*`, `vd=*`, ...) and the `bad`/
 * `good` settings test verbs (not named in D-09's hidden list; `45-12`'s
 * live gate uses `bad` to induce a deterministic failure, so it must stay
 * reachable).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { isVisibleVerb, filterVisibleCatalog } from '../visibility'
import { parseWinetricksMetadata, deriveNeedsGuiVerbs } from '../metadata'

const FIXTURE_SCRIPT = readFileSync(
  join(__dirname, 'fixtures', 'winetricks-20260125-next.metadata.sh'),
  'utf8'
)

describe('isVisibleVerb', () => {
  it('hides the apps category', () => {
    expect(isVisibleVerb({ verb: 'foobar2000', category: 'apps' })).toBe(false)
  })

  it('hides the benchmarks category', () => {
    expect(isVisibleVerb({ verb: '3dmark06', category: 'benchmarks' })).toBe(
      false
    )
  })

  it('hides annihilate', () => {
    expect(isVisibleVerb({ verb: 'annihilate', category: 'settings' })).toBe(
      false
    )
  })

  it('hides the interactive launcher verbs', () => {
    const launchers = [
      'winecfg',
      'regedit',
      'taskmgr',
      'explorer',
      'uninstaller',
      'winecmd',
      'wine_misc_exe',
      'shell',
      'folder'
    ]
    for (const verb of launchers) {
      expect(isVisibleVerb({ verb, category: 'settings' })).toBe(false)
    }
  })

  it('keeps install-shaped settings verbs visible', () => {
    expect(
      isVisibleVerb({ verb: 'fontsmooth=rgb', category: 'settings' })
    ).toBe(true)
    expect(isVisibleVerb({ verb: 'csmt=on', category: 'settings' })).toBe(true)
    expect(isVisibleVerb({ verb: 'vd=1024x768', category: 'settings' })).toBe(
      true
    )
  })

  it('keeps ordinary dlls and fonts verbs visible', () => {
    expect(isVisibleVerb({ verb: 'gdiplus_winxp', category: 'dlls' })).toBe(
      true
    )
    expect(isVisibleVerb({ verb: 'vcrun2019', category: 'dlls' })).toBe(true)
    expect(isVisibleVerb({ verb: 'corefonts', category: 'fonts' })).toBe(true)
  })

  it('keeps the bad/good settings test verbs visible -- not named in D-09', () => {
    expect(isVisibleVerb({ verb: 'bad', category: 'settings' })).toBe(true)
    expect(isVisibleVerb({ verb: 'good', category: 'settings' })).toBe(true)
  })

  it('hides a dlls verb flagged needsGui, independent of category', () => {
    expect(
      isVisibleVerb({ verb: 'some_dll', category: 'dlls', needsGui: true })
    ).toBe(false)
  })

  it('keeps a dlls verb visible when needsGui is explicitly false or absent', () => {
    expect(
      isVisibleVerb({ verb: 'some_dll', category: 'dlls', needsGui: false })
    ).toBe(true)
    expect(isVisibleVerb({ verb: 'some_dll', category: 'dlls' })).toBe(true)
  })
})

describe('filterVisibleCatalog', () => {
  it('preserves order and returns the same element objects, dropping only hidden ones', () => {
    const a = { verb: 'gdiplus_winxp', category: 'dlls' }
    const b = { verb: 'foobar2000', category: 'apps' }
    const c = { verb: 'corefonts', category: 'fonts' }
    const result = filterVisibleCatalog([a, b, c])
    expect(result).toEqual([a, c])
    expect(result[0]).toBe(a)
    expect(result[1]).toBe(c)
  })

  describe('against the committed fixture', () => {
    const metadata = parseWinetricksMetadata(FIXTURE_SCRIPT)
    const needsGuiVerbs = deriveNeedsGuiVerbs(FIXTURE_SCRIPT)
    const catalog = [...metadata.values()].map((entry) => ({
      ...entry,
      needsGui: needsGuiVerbs.has(entry.verb)
    }))

    it('visible count equals the combined dlls+fonts+settings categories (502)', () => {
      const visible = filterVisibleCatalog(catalog)
      expect(visible.length).toBe(502)
    })

    it('every derived needs-GUI verb is hidden', () => {
      const visible = filterVisibleCatalog(catalog)
      const visibleVerbs = new Set(visible.map((entry) => entry.verb))
      for (const verb of needsGuiVerbs) {
        expect(visibleVerbs.has(verb)).toBe(false)
      }
    })

    it('bad and good stay visible against the real fixture categories', () => {
      const visible = filterVisibleCatalog(catalog)
      const visibleVerbs = new Set(visible.map((entry) => entry.verb))
      expect(visibleVerbs.has('bad')).toBe(true)
      expect(visibleVerbs.has('good')).toBe(true)
    })
  })
})
