import {
  heroArtSources,
  heroCoverSources,
  heroPercent,
  heroPhase
} from '../heroModel'

describe('heroArtSources', () => {
  it('prefers art_background, then art_cover, then art_square as fallbacks', () => {
    expect(
      heroArtSources({ art_background: 'bg', art_cover: 'c', art_square: 's' })
    ).toEqual({ src: 'bg', fallback: ['c', 's'] })
  })

  it('falls through to art_cover when art_background is absent', () => {
    expect(heroArtSources({ art_cover: 'c', art_square: 's' })).toEqual({
      src: 'c',
      fallback: ['s']
    })
  })

  it('skips an empty-string art_background the same way', () => {
    expect(
      heroArtSources({ art_background: '', art_cover: 'c', art_square: 's' })
    ).toEqual({ src: 'c', fallback: ['s'] })
  })

  it('uses art_square alone when it is all there is', () => {
    expect(heroArtSources({ art_square: 's' })).toEqual({
      src: 's',
      fallback: []
    })
  })

  it('dedupes identical sources', () => {
    expect(heroArtSources({ art_cover: 'x', art_square: 'x' })).toEqual({
      src: 'x',
      fallback: []
    })
  })

  it('returns null for no game info', () => {
    expect(heroArtSources(undefined)).toBeNull()
  })

  it('returns null when every source is empty', () => {
    expect(heroArtSources({ art_cover: '', art_square: '' })).toBeNull()
  })
})

describe('heroCoverSources', () => {
  it('prefers art_square (portrait) over art_cover (landscape)', () => {
    expect(heroCoverSources({ art_cover: 'c', art_square: 's' })).toEqual({
      src: 's',
      fallback: ['c']
    })
  })

  it('prefers the override portrait art above all', () => {
    expect(
      heroCoverSources({
        overrides: { art_square: 'os' },
        art_square: 's',
        art_cover: 'c'
      })
    ).toEqual({ src: 'os', fallback: ['s', 'c'] })
  })

  it('orders overrides.art_cover after art_square', () => {
    expect(
      heroCoverSources({
        overrides: { art_cover: 'oc' },
        art_square: 's',
        art_cover: 'c'
      })
    ).toEqual({ src: 's', fallback: ['oc', 'c'] })
  })

  it('falls back to art_cover when there is no portrait art', () => {
    expect(heroCoverSources({ art_cover: 'c' })).toEqual({
      src: 'c',
      fallback: []
    })
  })

  it('skips empty strings and collapses duplicates', () => {
    expect(heroCoverSources({ art_cover: 'x', art_square: 'x' })).toEqual({
      src: 'x',
      fallback: []
    })
  })

  it('returns null for undefined or all-empty input', () => {
    expect(heroCoverSources(undefined)).toBeNull()
    expect(heroCoverSources({ art_cover: '', art_square: '' })).toBeNull()
  })
})

describe('heroPercent', () => {
  it('is 0 when there is no current element, whatever the percent', () => {
    expect(heroPercent(false, 50)).toBe(0)
  })

  it('is 0 when the percent is undefined', () => {
    expect(heroPercent(true, undefined)).toBe(0)
  })

  it('passes a fractional percent through', () => {
    expect(heroPercent(true, 42.5)).toBe(42.5)
  })

  it('clamps above 100 down to 100', () => {
    expect(heroPercent(true, 140)).toBe(100)
  })

  it('clamps below 0 up to 0', () => {
    expect(heroPercent(true, -3)).toBe(0)
  })

  it('is 0 for NaN', () => {
    expect(heroPercent(true, NaN)).toBe(0)
  })
})

describe('heroPhase (quick 261029-exu)', () => {
  it('names the redist and DRM steps with their context', () => {
    expect(heroPhase({ status: 'redist', context: 'vcredist 2015' })).toEqual({
      kind: 'redist',
      context: 'vcredist 2015'
    })
    expect(
      heroPhase({ status: 'drm-setup', context: 'Steam client files' })
    ).toEqual({ kind: 'drm-setup', context: 'Steam client files' })
  })

  it('names the Steam syncing phase with its optional percent', () => {
    expect(heroPhase({ status: 'steam-syncing', context: '' })).toEqual({
      kind: 'steam-syncing',
      context: ''
    })
    expect(heroPhase({ status: 'steam-syncing', context: '42%' })).toEqual({
      kind: 'steam-syncing',
      context: '42%'
    })
  })

  it('names the bridge finishing state', () => {
    expect(
      heroPhase({ status: 'installing', context: 'steam-bridge-finishing' })
    ).toEqual({ kind: 'finishing' })
  })

  it('is null while genuinely downloading or with no status', () => {
    expect(heroPhase({ status: 'installing' })).toBeNull()
    expect(
      heroPhase({ status: 'installing', context: 'steam-paused' })
    ).toBeNull()
    expect(heroPhase(undefined)).toBeNull()
  })
})
