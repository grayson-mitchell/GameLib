/**
 * Phase 34.1 gap-closure (GAP-2 / D-12, FOLLOW-UP-2 of 34.1-SECURITY.md, T-34.1-29):
 * source gate over `public/about.html`, the Tauri child "About" window.
 *
 * Plan 34.1-07's threat model claimed this file "is asserted to contain no
 * fetch/XMLHttpRequest/__TAURI__/<a >". No such test existed --
 * `src/preload/__tests__/childWindows.test.ts` only asserts the URL string passed to the
 * WebviewWindow constructor (`about.html?v=...`); nothing reads the file's contents. The
 * property holds today by direct verification, but had no regression protection: a future
 * edit could reintroduce a network call or a live link with no red test to catch it.
 *
 * Modeled on tauriShellSource.test.ts's read-file-then-assert-shape idiom, minus the
 * comment-stripping helper -- about.html's only comment is the file-level HTML comment
 * documenting this exact contract, and it does not contain any of the forbidden strings
 * itself (it describes their absence in prose, not by quoting them literally), so no
 * self-satisfying-match risk exists here the way it did for main.rs's doc comments.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ABOUT_HTML_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'public',
  'about.html'
)

function loadAboutHtml(): string {
  return readFileSync(ABOUT_HTML_PATH, 'utf-8')
}

describe('public/about.html source gate (REQ-34.1-08, GAP-2 / D-12, T-34.1-29)', () => {
  test('does NOT contain a fetch( call', () => {
    expect(loadAboutHtml()).not.toMatch(/\bfetch\s*\(/)
  })

  test('does NOT contain XMLHttpRequest', () => {
    expect(loadAboutHtml()).not.toContain('XMLHttpRequest')
  })

  test('does NOT reference the Tauri global bridge (__TAURI__)', () => {
    expect(loadAboutHtml()).not.toContain('__TAURI__')
  })

  test('does NOT contain an anchor tag (no live/clickable links)', () => {
    expect(loadAboutHtml()).not.toMatch(/<a[\s>]/i)
  })

  test('the repository URL is present as inert text, not a link', () => {
    // Guards against the negative gate above passing vacuously because the URL was
    // simply deleted rather than kept as plain text.
    expect(loadAboutHtml()).toContain(
      'https://github.com/grayson-mitchell/GameLib'
    )
  })

  test("carries a restrictive default-src 'self' CSP meta tag", () => {
    const html = loadAboutHtml()
    expect(html).toMatch(
      /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*default-src 'self'[^"]*"/
    )
  })
})
