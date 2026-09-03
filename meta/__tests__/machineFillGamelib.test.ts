import {
  collectMissingKeys,
  buildTranslationMemory,
  validateTranslation,
  mergeFill,
  fillLocale,
  chunkBatch,
  extractJsonArray,
  BulkRunRefusedError,
  type TranslateFn,
  type MtManifest
} from '../machineFillGamelib'

// No network, no fs -- every fixture below is an in-memory object. Grepped
// by this task's own acceptance criteria to confirm the suite is hermetic.

const EN = {
  app: {
    title: 'GameLib'
  },
  redeemKey: {
    success: 'Redeemed {{packageName}}',
    rateLimited: 'Too many attempts',
    error: '' // an EMPTY English default -- the real redeemKey.* shape (plan 09)
  },
  humble: {
    itemCount_one: '{{count}} item',
    itemCount_other: '{{count}} items'
  },
  library: {
    storeOther: 'Other'
  }
}

describe('collectMissingKeys', () => {
  it('treats an absent target key as missing', () => {
    const plan = collectMissingKeys(EN, {})
    expect(plan.missing).toContain('app.title')
    expect(plan.preserved).toEqual([])
  })

  it('treats an empty-string target value as missing, not preserved', () => {
    const target = { app: { title: '' } }
    const plan = collectMissingKeys(EN, target)
    expect(plan.missing).toContain('app.title')
  })

  it('lands every non-empty target value in preserved, never missing', () => {
    const target = { app: { title: 'GameLib (bereits übersetzt)' } }
    const plan = collectMissingKeys(EN, target)
    expect(plan.preserved).toContain('app.title')
    expect(plan.missing).not.toContain('app.title')
  })

  it('excludes a key whose English source is ALSO empty -- nothing to translate from', () => {
    const plan = collectMissingKeys(EN, {})
    expect(plan.missing).not.toContain('redeemKey.error')
    expect(plan.preserved).not.toContain('redeemKey.error')
  })
})

describe('mergeFill -- never overwrites', () => {
  it('a human-corrected non-empty value survives a filled map that tries to replace it', () => {
    const target = { app: { title: 'Bereits von Hand korrigiert' } }
    const filled = { 'app.title': 'MASCHINELL ÜBERSCHRIEBEN' }

    const { merged } = mergeFill(target, filled, null) as {
      merged: typeof target
    }

    expect(merged.app.title).toBe('Bereits von Hand korrigiert')
  })

  it('fills a genuinely missing key without touching unrelated ones', () => {
    const target = { app: { title: '' }, library: { storeOther: 'Andere' } }
    const filled = { 'app.title': 'GameLib' }

    const { merged } = mergeFill(target, filled, null) as {
      merged: { app: { title: string }; library: { storeOther: string } }
    }

    expect(merged.app.title).toBe('GameLib')
    expect(merged.library.storeOther).toBe('Andere')
  })

  it('preserves existing key order/nesting and adds a brand-new key at the end without reordering the rest', () => {
    const target = { zeta: 'Z', mid: 'M' }
    const filled = { alpha: 'A-new' } // 'alpha' does not exist in target at all

    const { merged } = mergeFill(target, filled, null) as Record<string, string>

    expect(Object.keys(merged)).toEqual(['zeta', 'mid', 'alpha'])
    expect(merged.alpha).toBe('A-new')
  })
})

describe('interpolation and plurals', () => {
  it('validateTranslation flags a dropped {{placeholder}}', () => {
    const problems = validateTranslation(
      'Redeemed {{packageName}}',
      'Eingelöst',
      ['Steam']
    )
    expect(problems.length).toBeGreaterThan(0)
  })

  it('validateTranslation flags a placeholder introduced that the source lacks', () => {
    const problems = validateTranslation(
      'Too many attempts',
      'Zu viele {{count}} Versuche',
      []
    )
    expect(problems.length).toBeGreaterThan(0)
  })

  it('validateTranslation accepts a translation that reproduces the placeholder verbatim', () => {
    const problems = validateTranslation(
      'Redeemed {{packageName}}',
      'Eingelöst: {{packageName}}',
      []
    )
    expect(problems).toEqual([])
  })

  it('fillLocale skips a filled _one whose _other sibling is not also going to be present', () => {
    const target = {}
    const translate: TranslateFn = async (batch) =>
      batch.map((b) => ({
        keyPath: b.keyPath,
        // deliberately break the placeholder on the _other half so it gets
        // rejected by validateTranslation, leaving the sibling truly absent
        target:
          b.keyPath === 'humble.itemCount_other'
            ? 'Artikel' // drops {{count}}
            : '{{count}} Artikel'
      }))

    return fillLocale({
      en: EN,
      target,
      locale: 'de',
      translate,
      glossary: [],
      buildMemory: () => [],
      priorManifest: null,
      model: 'test-model',
      now: new Date('2026-08-07T00:00:00.000Z')
    }).then((result) => {
      const oneSkip = result.skipped.find(
        (s) => s.keyPath === 'humble.itemCount_one'
      )
      const otherSkip = result.skipped.find(
        (s) => s.keyPath === 'humble.itemCount_other'
      )
      expect(otherSkip).toBeDefined() // rejected by validateTranslation directly
      expect(oneSkip).toBeDefined() // rejected because its sibling never lands
      expect(oneSkip?.problems.join(' ')).toMatch(/plural sibling/)
    })
  })

  it('fillLocale fills a complete _one/_other pair together', async () => {
    const target = {}
    const translate: TranslateFn = async (batch) =>
      batch.map((b) => ({
        keyPath: b.keyPath,
        target:
          b.keyPath === 'humble.itemCount_one'
            ? '{{count}} Artikel'
            : b.keyPath === 'humble.itemCount_other'
              ? '{{count}} Artikel'
              : `[${b.keyPath}]`
      }))

    const result = await fillLocale({
      en: EN,
      target,
      locale: 'de',
      translate,
      glossary: [],
      buildMemory: () => [],
      priorManifest: null,
      model: 'test-model',
      now: new Date('2026-08-07T00:00:00.000Z')
    })

    const merged = result.merged as {
      humble: { itemCount_one: string; itemCount_other: string }
    }
    expect(merged.humble.itemCount_one).toBe('{{count}} Artikel')
    expect(merged.humble.itemCount_other).toBe('{{count}} Artikel')
  })
})

describe('glossary preservation', () => {
  it('validateTranslation rejects a translation that localises a glossed brand term', () => {
    const problems = validateTranslation(
      'Connect your Steam account',
      'Verbinde dein Dampf-Konto', // "Steam" mistranslated to "Dampf" (German for steam)
      ['Steam']
    )
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join(' ')).toMatch(/Steam/)
  })

  it('validateTranslation accepts a translation that keeps the glossed term verbatim', () => {
    const problems = validateTranslation(
      'Connect your Steam account',
      'Verbinde dein Steam-Konto',
      ['Steam']
    )
    expect(problems).toEqual([])
  })

  // 260903-itr, revised Task 1 (option C): `containsTermLoose` used to be
  // case-INsensitive while `containsTermVerbatim` stayed case-SENSITIVE, so
  // any English string containing the ordinary common noun "browser" (not
  // the glossed brand/identifier `Browser`) demanded the literal ASCII
  // `Browser` survive into the translation -- something no genuine
  // translation of the word can do. This test is RED against the
  // pre-fix asymmetric matcher; it going GREEN is the proof the fix is
  // non-vacuous.
  it('validateTranslation accepts a genuine translation of the common noun "browser" (not the glossed brand)', () => {
    const problems = validateTranslation(
      'Open in browser',
      'Ouvrir dans le navigateur',
      ['Browser']
    )
    expect(problems).toEqual([])
  })

  // The brand/identifier sense must still be enforced verbatim: a source
  // that uses `Browser` as the capitalised platform/brand term must still
  // reject a translation that localises it away.
  it('validateTranslation still rejects a translation that localises the glossed brand term "Browser"', () => {
    const problems = validateTranslation(
      'Install via Browser',
      'Installer via navigateur',
      ['Browser']
    )
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join(' ')).toMatch(/Browser/)
  })

  // 260903-ly4: `containsTermVerbatim`'s trailing `(?![A-Za-z0-9_])` lookahead
  // forbade a glossed term from taking ANY suffix. English brands do not
  // inflect, so the defect is invisible in English; Estonian attaches case
  // suffixes directly onto a foreign proper noun with no separator --
  // "Steami" (genitive/partitive), "Steamis" (inessive), "Steamiga"
  // (comitative) -- each of which is a CORRECT translation that the strict
  // trailing boundary rejected. These are RED against the unmodified
  // validator; going GREEN is the proof the fix is non-vacuous.
  it('validateTranslation accepts the Estonian genitive/partitive inflection "Steami"', () => {
    const problems = validateTranslation(
      'Connect your Steam account',
      'Ühenda oma Steami konto',
      ['Steam']
    )
    expect(problems).toEqual([])
  })

  it('validateTranslation accepts the Estonian inessive inflection "Steamis"', () => {
    const problems = validateTranslation(
      'Connect your Steam account',
      'Sinu konto on Steamis',
      ['Steam']
    )
    expect(problems).toEqual([])
  })

  it('validateTranslation accepts the Estonian comitative inflection "Steamiga"', () => {
    const problems = validateTranslation(
      'Connect your Steam account',
      'Ühenda konto Steamiga',
      ['Steam']
    )
    expect(problems).toEqual([])
  })

  // 260903-ly4, Finnish: the illative/genitive suffix "-n" attaches directly
  // onto "Steam" with no separator -- "Steamin" is a correct translation the
  // strict trailing boundary rejected.
  it('validateTranslation accepts the Finnish inflection "Steamin"', () => {
    const problems = validateTranslation(
      'Connect your Steam account',
      'Yhdistä Steamin tilisi',
      ['Steam']
    )
    expect(problems).toEqual([])
  })

  // 260903-ly4, Hungarian: the accusative suffix "-et" attaches directly onto
  // "Steam" with no separator -- "Steamet" is a correct translation the
  // strict trailing boundary rejected.
  it('validateTranslation accepts the Hungarian inflection "Steamet"', () => {
    const problems = validateTranslation(
      'Connect your Steam account',
      'Csatlakoztasd a Steamet',
      ['Steam']
    )
    expect(problems).toEqual([])
  })

  // 260903-ly4, North Germanic bare-s genitive: da/nb_NO/sv all form the
  // possessive with a bare trailing "-s" and no apostrophe, so "GameLibs" is
  // the correct rendering of the English "GameLib's" -- the strict trailing
  // boundary rejected it. The source string is the real
  // `webview.unavailable.body` English text shared by all three locales.
  it('validateTranslation accepts the Scandinavian bare-s genitive "GameLibs"', () => {
    const problems = validateTranslation(
      "GameLib's Tauri build does not yet embed a browser view for the store and wiki pages.",
      'GameLibs Tauri-bygge inneholder ennå ikke en nettleservisning for butikk- og wikisidene.',
      ['GameLib']
    )
    expect(problems).toEqual([])
  })

  // 260903-ly4 regression pin: a target that genuinely TRANSLATES the term
  // (rather than merely inflecting it) must still be rejected. Must stay
  // GREEN before and after the fix.
  it('validateTranslation still rejects a translation that localises the glossed term "Steam" away entirely', () => {
    const problems = validateTranslation(
      'Connect your Steam account',
      'Підключіть свій обліковий запис Пар',
      ['Steam']
    )
    expect(problems.length).toBe(1)
    expect(problems.join(' ')).toMatch(/Steam/)
  })

  // 260903-ly4 regression pin: the leading `(?<![A-Za-z0-9_])` lookbehind
  // must still reject a term that appears only as the TAIL of an unrelated
  // word. Must stay GREEN before and after the fix -- mutation-proven in
  // Task 2 by deleting the lookbehind and confirming this goes RED.
  it('validateTranslation still rejects a target where the glossed term appears only as the tail of an unrelated word', () => {
    const problems = validateTranslation(
      'Connect your Steam account',
      'Verbinde dein MegaSteam-Konto',
      ['Steam']
    )
    expect(problems.length).toBe(1)
  })

  it('a run whose TranslateFn fails validateTranslation leaves that key UNFILLED and records the problem', async () => {
    const target = {}
    const translate: TranslateFn = async (batch) =>
      batch.map((b) => ({
        keyPath: b.keyPath,
        target:
          b.keyPath === 'app.title'
            ? 'SpielBibliothek' // glossary violation: drops the glossed "GameLib" term
            : `[${b.keyPath}]`
      }))

    const result = await fillLocale({
      en: EN,
      target,
      locale: 'de',
      translate,
      glossary: ['GameLib'],
      buildMemory: () => [],
      priorManifest: null,
      model: 'test-model',
      now: new Date('2026-08-07T00:00:00.000Z')
    })

    const merged = result.merged as { app?: { title?: string } }
    expect(merged.app?.title).toBeUndefined()
    const skip = result.skipped.find((s) => s.keyPath === 'app.title')
    expect(skip).toBeDefined()
    expect(skip?.problems.join(' ')).toMatch(/GameLib/)
  })

  it('a run whose TranslateFn returns nothing for a key leaves it unfilled and records the problem', async () => {
    const target = {}
    const translate: TranslateFn = async (batch) =>
      batch
        .filter((b) => b.keyPath !== 'app.title')
        .map((b) => ({ keyPath: b.keyPath, target: `[${b.keyPath}]` }))

    const result = await fillLocale({
      en: EN,
      target,
      locale: 'de',
      translate,
      glossary: [],
      buildMemory: () => [],
      priorManifest: null,
      model: 'test-model',
      now: new Date('2026-08-07T00:00:00.000Z')
    })

    const merged = result.merged as { app?: { title?: string } }
    expect(merged.app?.title).toBeUndefined()
    const skip = result.skipped.find((s) => s.keyPath === 'app.title')
    expect(skip?.problems).toEqual([
      'translator returned no result for this key'
    ])
  })
})

describe('buildTranslationMemory', () => {
  const enUpstream = { actions: { install: 'Install', play: 'Play' } }
  const deUpstream = { actions: { install: 'Installieren', play: 'Spielen' } }

  it('returns matching source/target pairs, case-insensitively', () => {
    const memory = buildTranslationMemory(enUpstream, deUpstream, 'install')
    expect(memory).toEqual([{ source: 'Install', target: 'Installieren' }])
  })

  it('returns an empty array rather than throwing when the locale has no upstream catalog', () => {
    expect(buildTranslationMemory(enUpstream, {}, 'Install')).toEqual([])
    expect(
      buildTranslationMemory(
        enUpstream,
        undefined as unknown as object,
        'Install'
      )
    ).toEqual([])
  })

  it('returns an empty array when nothing matches', () => {
    expect(buildTranslationMemory(enUpstream, deUpstream, 'Uninstall')).toEqual(
      []
    )
  })
})

describe('provenance manifest', () => {
  it('mergeFill lists exactly the keys it filled', () => {
    const target = { app: { title: '' } }
    const filled = { 'app.title': 'GameLib' }

    const { manifest } = mergeFill(target, filled, null)

    expect(manifest.keys).toEqual(['app.title'])
  })

  it('mergeFill never lists a preserved key, even if a filled map is offered for it', () => {
    const target = { app: { title: 'Bereits übersetzt' } }
    const filled = { 'app.title': 'Nie geschrieben' }

    const { manifest } = mergeFill(target, filled, null)

    expect(manifest.keys).toEqual([])
  })

  it('mergeFill unions new keys with a prior manifest, deduplicated', () => {
    const target = { app: { title: '' }, library: { storeOther: '' } }
    const filled = { 'library.storeOther': 'Andere' }
    const prior: MtManifest = {
      locale: 'de',
      model: 'old-model',
      filledAt: '2026-01-01T00:00:00.000Z',
      keys: ['app.title']
    }

    const { manifest } = mergeFill(target, filled, prior)

    expect(manifest.keys.sort()).toEqual(['app.title', 'library.storeOther'])
  })

  it('fillLocale stamps the manifest with the given locale, model and now', async () => {
    const target = {}
    const translate: TranslateFn = async (batch) =>
      batch.map((b) => ({ keyPath: b.keyPath, target: `[${b.keyPath}]` }))

    const result = await fillLocale({
      en: { app: { title: 'GameLib' } },
      target,
      locale: 'fr',
      translate,
      glossary: [],
      buildMemory: () => [],
      priorManifest: null,
      model: 'claude-sonnet-5',
      now: new Date('2026-08-07T12:34:56.000Z')
    })

    expect(result.manifest.locale).toBe('fr')
    expect(result.manifest.model).toBe('claude-sonnet-5')
    expect(result.manifest.filledAt).toBe('2026-08-07T12:34:56.000Z')
    expect(result.manifest.keys).toEqual(['app.title'])
  })
})

describe('filledAt provenance -- a no-op run must not re-stamp', () => {
  const translate: TranslateFn = async (batch) =>
    batch.map((b) => ({ keyPath: b.keyPath, target: `[${b.keyPath}]` }))

  const PRIOR: MtManifest = {
    locale: 'de',
    model: 'claude-sonnet-5',
    filledAt: '2026-08-07T12:34:56.000Z',
    keys: ['app.title']
  }

  it('carries the prior filledAt forward when nothing was filled', async () => {
    const result = await fillLocale({
      en: { app: { title: 'GameLib' } },
      target: { app: { title: 'GameLib' } }, // already complete -- nothing missing
      locale: 'de',
      translate,
      glossary: [],
      buildMemory: () => [],
      priorManifest: PRIOR,
      model: 'claude-sonnet-5',
      now: new Date('2026-09-01T00:00:00.000Z')
    })

    expect(result.plan.missing).toEqual([])
    expect(result.manifest.filledAt).toBe('2026-08-07T12:34:56.000Z')
  })

  it('stamps `now` when the run actually fills a key', async () => {
    const result = await fillLocale({
      en: { app: { title: 'GameLib' }, redeemKey: { rateLimited: 'Too many' } },
      target: { app: { title: 'GameLib' } }, // redeemKey.rateLimited is missing
      locale: 'de',
      translate,
      glossary: [],
      buildMemory: () => [],
      priorManifest: PRIOR,
      model: 'claude-sonnet-5',
      now: new Date('2026-09-01T00:00:00.000Z')
    })

    expect(result.manifest.filledAt).toBe('2026-09-01T00:00:00.000Z')
  })

  it('stamps `now` on a first run that has no prior manifest', async () => {
    const result = await fillLocale({
      en: { app: { title: 'GameLib' } },
      target: { app: { title: 'GameLib' } },
      locale: 'de',
      translate,
      glossary: [],
      buildMemory: () => [],
      priorManifest: null,
      model: 'claude-sonnet-5',
      now: new Date('2026-09-01T00:00:00.000Z')
    })

    expect(result.manifest.filledAt).toBe('2026-09-01T00:00:00.000Z')
  })
})

describe('extractJsonArray -- tolerating a chatty response', () => {
  const PAYLOAD = '[{"keyPath":"app.title","target":"GameLib"}]'

  it('passes a bare array through unchanged', () => {
    expect(extractJsonArray(PAYLOAD)).toBe(PAYLOAD)
  })

  it('strips a ```json code fence -- the shape that aborted a live run', () => {
    const fenced = '```json\n' + PAYLOAD + '\n```'
    expect(JSON.parse(extractJsonArray(fenced))).toEqual([
      { keyPath: 'app.title', target: 'GameLib' }
    ])
  })

  it('strips a bare ``` fence', () => {
    expect(
      JSON.parse(extractJsonArray('```\n' + PAYLOAD + '\n```'))
    ).toHaveLength(1)
  })

  it('discards leading and trailing prose around the array', () => {
    const chatty = 'Here are the translations:\n' + PAYLOAD + '\nLet me know!'
    expect(JSON.parse(extractJsonArray(chatty))).toEqual([
      { keyPath: 'app.title', target: 'GameLib' }
    ])
  })

  it('keeps a square bracket that appears INSIDE a translated value', () => {
    const withBrackets =
      '[{"keyPath":"a","target":"Fertig [1]"},{"keyPath":"b","target":"OK"}]'
    expect(JSON.parse(extractJsonArray(withBrackets))).toEqual([
      { keyPath: 'a', target: 'Fertig [1]' },
      { keyPath: 'b', target: 'OK' }
    ])
  })

  it('leaves text containing no array alone so the caller still throws', () => {
    expect(() => JSON.parse(extractJsonArray('I cannot do that'))).toThrow()
  })
})

describe('chunkBatch -- request slicing', () => {
  it('splits an over-size batch into slices of the requested size', () => {
    const chunks = chunkBatch([1, 2, 3, 4, 5, 6, 7], 3)
    expect(chunks).toEqual([[1, 2, 3], [4, 5, 6], [7]])
  })

  it('loses and duplicates nothing -- the concatenated slices equal the input', () => {
    const batch = Array.from({ length: 124 }, (_, i) => `key.${i}`)
    const flattened = chunkBatch(batch, 40).flat()
    expect(flattened).toEqual(batch)
    expect(new Set(flattened).size).toBe(124)
  })

  it('returns a single slice when the batch is smaller than the size', () => {
    expect(chunkBatch(['a', 'b'], 40)).toEqual([['a', 'b']])
  })

  it('returns no slices for an empty batch rather than one empty slice', () => {
    expect(chunkBatch([], 40)).toEqual([])
  })

  it('refuses a size of zero instead of looping forever', () => {
    expect(() => chunkBatch([1, 2], 0)).toThrow('at least 1')
  })
})

describe('BulkRunRefusedError', () => {
  it('is a real Error subclass carrying a message', () => {
    const err = new BulkRunRefusedError('refused for testing')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('BulkRunRefusedError')
    expect(err.message).toBe('refused for testing')
  })
})
