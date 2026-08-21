/**
 * Unit tests for the Humble login-chrome CSS constant and hostname predicate
 * (quick task 260822-di1, Task 1). The helpers live in
 * common/humble/loginChromeCss.ts (no React/i18n/I/O); this test sits in the
 * backend suite because jest's project roots only cover src/backend —
 * mirrors `viewFilters.test.ts` / `groupKeys.test.ts`'s identical placement.
 */

import {
  HUMBLE_LOGIN_CHROME_CSS,
  isHumbleLoginChromeHost,
  humbleLoginChromeCssForUrl
} from 'common/humble/loginChromeCss'

describe('HUMBLE_LOGIN_CHROME_CSS', () => {
  test('is exactly the one footer-hiding rule', () => {
    expect(HUMBLE_LOGIN_CHROME_CSS).toBe(
      'footer.site-footer { display: none !important; }'
    )
  })

  test.each([
    '#flash',
    'page-top-messages',
    'grayout',
    'simple-navbar',
    'zdconsent',
    'showConsentTool',
    'js-view-body',
    'js-login-form'
  ])('does not name the protected selector %s', (selector) => {
    expect(HUMBLE_LOGIN_CHROME_CSS).not.toContain(selector)
  })

  test.each(['color:', 'background', 'filter:', '--', 'prefers-color-scheme'])(
    'sets no colour/theme property (%s absent)',
    (fragment) => {
      expect(HUMBLE_LOGIN_CHROME_CSS).not.toContain(fragment)
    }
  )
})

describe('isHumbleLoginChromeHost', () => {
  test.each([
    ['humblebundle.com', true],
    ['www.humblebundle.com', true],
    ['accounts.google.com', false],
    ['humblebundle.com.evil.example', false],
    ['evilhumblebundle.com', false],
    ['', false]
  ] as const)('isHumbleLoginChromeHost(%s) -> %s', (hostname, expected) => {
    expect(isHumbleLoginChromeHost(hostname)).toBe(expected)
  })

  // RED-direction proof (repo convention: a grep/text/predicate assertion must be proven
  // in both directions). Feeds a deliberately naive substring predicate the exact
  // look-alike-host input the real predicate is scoped to reject, and asserts the naive
  // version returns TRUE for it — proving the real predicate's `false` on the same input
  // is not vacuous.
  test('RED proof: a naive substring predicate WOULD incorrectly match the look-alike host', () => {
    const naivePredicate = (hostname: string): boolean =>
      hostname.indexOf('humblebundle.com') !== -1
    expect(naivePredicate('humblebundle.com.evil.example')).toBe(true)
    expect(isHumbleLoginChromeHost('humblebundle.com.evil.example')).toBe(
      false
    )
  })
})

describe('humbleLoginChromeCssForUrl', () => {
  test('returns the CSS for a qualifying humblebundle.com URL', () => {
    expect(
      humbleLoginChromeCssForUrl('https://www.humblebundle.com/login')
    ).toBe(HUMBLE_LOGIN_CHROME_CSS)
  })

  test('returns null for accounts.google.com', () => {
    expect(
      humbleLoginChromeCssForUrl('https://accounts.google.com/signin')
    ).toBeNull()
  })

  test('returns null for the look-alike host', () => {
    expect(
      humbleLoginChromeCssForUrl('https://humblebundle.com.evil.example/login')
    ).toBeNull()
  })

  test('returns null for an unparseable URL and never throws', () => {
    expect(() => humbleLoginChromeCssForUrl('not a url')).not.toThrow()
    expect(humbleLoginChromeCssForUrl('not a url')).toBeNull()
  })

  test('returns null for an empty string (webview getURL() before first navigation)', () => {
    expect(humbleLoginChromeCssForUrl('')).toBeNull()
  })
})
