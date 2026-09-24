import {
  GAMELIB_ISSUES_NEW_URL,
  buildTranslationIssueUrl,
  shouldShowMtNotice
} from '../translationIssue'

describe('shouldShowMtNotice', () => {
  it('hides the notice for plain English', () => {
    expect(shouldShowMtNotice('en')).toBe(false)
  })

  it('hides the notice for an English regional/script variant', () => {
    expect(shouldShowMtNotice('en-US')).toBe(false)
    expect(shouldShowMtNotice('en_GB')).toBe(false)
  })

  it('is case-insensitive about the English code', () => {
    expect(shouldShowMtNotice('EN')).toBe(false)
    expect(shouldShowMtNotice('En-US')).toBe(false)
  })

  it('shows the notice for de', () => {
    expect(shouldShowMtNotice('de')).toBe(true)
  })

  it('shows the notice for an underscore-separated locale (nb_NO)', () => {
    expect(shouldShowMtNotice('nb_NO')).toBe(true)
  })

  it('never throws on an empty code, and treats it as hidden', () => {
    expect(shouldShowMtNotice('')).toBe(false)
  })

  it('does not falsely match a language that merely starts with "en" (e.g. a hypothetical "eng")', () => {
    expect(shouldShowMtNotice('eng')).toBe(true)
  })
})

describe('buildTranslationIssueUrl', () => {
  it('points at the constant GameLib issues/new URL', () => {
    const url = new URL(buildTranslationIssueUrl('de', 'Deutsch'))
    expect(`${url.origin}${url.pathname}`).toBe(GAMELIB_ISSUES_NEW_URL)
  })

  it('sets template to exactly translation_problem.yaml', () => {
    const url = new URL(buildTranslationIssueUrl('de', 'Deutsch'))
    expect(url.searchParams.get('template')).toBe('translation_problem.yaml')
  })

  it('prefills language as "<label> (<code>)"', () => {
    const url = new URL(buildTranslationIssueUrl('de', 'Deutsch'))
    expect(url.searchParams.get('language')).toBe('Deutsch (de)')
  })

  it('prefills title as "[Translation] <label>: "', () => {
    const url = new URL(buildTranslationIssueUrl('de', 'Deutsch'))
    expect(url.searchParams.get('title')).toBe('[Translation] Deutsch: ')
  })

  it('resolves for nb_NO with its display label', () => {
    const url = new URL(buildTranslationIssueUrl('nb_NO', 'bokmål'))
    expect(url.searchParams.get('language')).toBe('bokmål (nb_NO)')
    expect(url.searchParams.get('title')).toBe('[Translation] bokmål: ')
  })

  // T-88h-01: a hostile code cannot add a query parameter or change the
  // host/path -- it stays entirely inside the encoded `language` value.
  it('a code containing "&" cannot inject a second query parameter', () => {
    const url = new URL(buildTranslationIssueUrl('de&evil=1', 'Deutsch'))
    expect(`${url.origin}${url.pathname}`).toBe(GAMELIB_ISSUES_NEW_URL)
    expect(url.searchParams.get('language')).toBe('Deutsch (de&evil=1)')
    expect(url.searchParams.has('evil')).toBe(false)
    expect(url.searchParams.get('template')).toBe('translation_problem.yaml')
  })

  it('a code containing "#" cannot inject a URL fragment', () => {
    const url = new URL(buildTranslationIssueUrl('de#frag', 'Deutsch'))
    expect(url.hash).toBe('')
    expect(url.searchParams.get('language')).toBe('Deutsch (de#frag)')
  })

  it('a code containing "/" cannot change the path or host', () => {
    const url = new URL(buildTranslationIssueUrl('../../evil.com', 'Deutsch'))
    expect(url.host).toBe('github.com')
    expect(url.pathname).toBe('/grayson-mitchell/GameLib/issues/new')
    expect(url.searchParams.get('language')).toBe('Deutsch (../../evil.com)')
  })

  it('a label containing "?" cannot start a second query string', () => {
    const url = new URL(buildTranslationIssueUrl('de', 'Deutsch?evil=1'))
    expect(`${url.origin}${url.pathname}`).toBe(GAMELIB_ISSUES_NEW_URL)
    expect(url.searchParams.get('language')).toBe('Deutsch?evil=1 (de)')
    expect(url.searchParams.has('evil')).toBe(false)
  })
})
