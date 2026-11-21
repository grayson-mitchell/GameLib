import {
  buildTranslationReportMessage,
  reportTranslationProblem,
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

describe('buildTranslationReportMessage', () => {
  it('prefills "[Translation] <label> (<code>): " with one trailing space', () => {
    expect(buildTranslationReportMessage('de', 'Deutsch')).toBe(
      '[Translation] Deutsch (de): '
    )
  })

  it('resolves for nb_NO with its display label', () => {
    expect(buildTranslationReportMessage('nb_NO', 'bokmål')).toBe(
      '[Translation] bokmål (nb_NO): '
    )
  })

  it('returns markup and URL-special characters verbatim, escaping nothing', () => {
    expect(buildTranslationReportMessage('de', '<b>x</b>&#?')).toBe(
      '[Translation] <b>x</b>&#? (de): '
    )
  })
})

describe('reportTranslationProblem', () => {
  it('navigates once to the in-app report form with the prefill in route state', () => {
    const navigate = jest.fn<
      void,
      [string, { state: { reportMessage: string } }]
    >()
    const result = reportTranslationProblem(navigate, 'de', 'Deutsch')
    expect(result).toBeUndefined()
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/settings/report', {
      state: { reportMessage: '[Translation] Deutsch (de): ' }
    })
  })
})
