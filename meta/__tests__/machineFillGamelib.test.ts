import {
  collectMissingKeys,
  buildTranslationMemory,
  validateTranslation,
  mergeFill,
  fillLocale,
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

    const { merged } = mergeFill(target, filled, null) as Record<
      string,
      string
    >

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
    expect(
      buildTranslationMemory(enUpstream, deUpstream, 'Uninstall')
    ).toEqual([])
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

describe('BulkRunRefusedError', () => {
  it('is a real Error subclass carrying a message', () => {
    const err = new BulkRunRefusedError('refused for testing')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('BulkRunRefusedError')
    expect(err.message).toBe('refused for testing')
  })
})
