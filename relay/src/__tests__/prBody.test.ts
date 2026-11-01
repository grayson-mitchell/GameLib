import {
  issueTitle,
  parseReportMarker,
  prTitle,
  renderIssueBody,
  renderPrBody,
  type BodyEntry
} from '../prBody'

const entry = (over: Partial<BodyEntry> = {}): BodyEntry => ({
  key: 'macArch',
  op: 'add',
  detector: 'macho',
  count: 3,
  firstSeen: Date.UTC(2026, 0, 2),
  lastSeen: Date.UTC(2026, 0, 9),
  lastVersion: '0.8.0',
  ...over
})

const stripSpans = (s: string) => s.replace(/`[^`]*`/g, '')

describe('prBody', () => {
  test('prTitle for add, remove and drm', () => {
    expect(prTitle('123', { key: 'macArch', op: 'add' })).toBe(
      'steam 123: add macArch "32"'
    )
    expect(prTitle('123', { key: 'macArch', op: 'remove' })).toBe(
      'steam 123: remove macArch'
    )
    expect(prTitle('123', { key: 'drm', op: 'add' })).toBe(
      'steam 123: add drm "ceg"'
    )
  })

  test('issueTitle', () => {
    expect(issueTitle('123')).toBe('bundled-removal: steam 123 macArch "32"')
  })

  test('renderPrBody shows detector, version, count, title and marker', () => {
    const body = renderPrBody({
      appId: '123',
      title: 'Half-Life 2',
      entries: [entry()]
    })
    expect(body).toContain('post-install Mach-O check')
    expect(body).toContain('0.8.0')
    expect(body).toContain('Reports received: 3')
    expect(body).toContain('`Half-Life 2`')
    expect(body).toContain('<!-- gamelib-report: macArch:add -->')
  })

  test('removal entry carries the bundled caveat', () => {
    const body = renderPrBody({
      appId: '123',
      title: 'T',
      entries: [entry({ op: 'remove' })]
    })
    expect(body).toContain('bundled public/fixes/123-steam.json')
  })

  test('drm add entry carries the shadowing caveat and CEG label', () => {
    const body = renderPrBody({
      appId: '123',
      title: 'T',
      entries: [entry({ key: 'drm', detector: 'ceg' })]
    })
    expect(body).toContain('without drm shadows')
    expect(body).toContain('PE CEG scan')
  })

  test('no mention or issue reference outside code spans', () => {
    const body = renderPrBody({
      appId: '123',
      title: '@everyone #12 `x`\nfix',
      entries: [entry(), entry({ key: 'drm', detector: 'ceg' })]
    })
    const outside = stripSpans(body)
    expect(outside).not.toMatch(/@/)
    expect(outside).not.toMatch(/#\d/)
  })

  test('issue body names the bundled path without mentions', () => {
    const body = renderIssueBody({
      appId: '123',
      title: '@x #1',
      count: 2,
      lastVersion: '0.8.0'
    })
    expect(body).toContain('public/fixes/123-steam.json')
    expect(stripSpans(body)).not.toMatch(/@|#\d/)
  })

  test('parseReportMarker reads and merges entries', () => {
    const body = renderPrBody({
      appId: '1',
      title: 'T',
      entries: [entry(), entry({ key: 'drm', detector: 'ceg' })]
    })
    expect(parseReportMarker(body)).toEqual(['macArch:add', 'drm:add'])
    expect(
      parseReportMarker(
        renderIssueBody({
          appId: '1',
          title: 'T',
          count: 1,
          lastVersion: null
        })
      )
    ).toEqual([])
  })

  test('parseReportMarker rejects malformed markers', () => {
    expect(parseReportMarker('<!-- gamelib-report: bogus:add -->')).toEqual([])
    expect(parseReportMarker('<!-- gamelib-report: macArch:zap -->')).toEqual(
      []
    )
    expect(parseReportMarker('')).toEqual([])
  })
})
