/**
 * Source-text wiring gate for the language picker's "Report a translation
 * problem" link (quick 261121-vlo). This jest project has no jsdom, so the
 * link cannot be rendered; these gates prove the source says what it must: the
 * link navigates inside the app, keeps its keyboard path, and never opens an
 * external URL. Every source is comment-stripped first so prose that mentions a
 * forbidden token cannot trip (or hide) a gate.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

// Hoisted so each prohibition and its SANITY counter-test consume the exact
// same detector.
const EXTERNAL_URL_CALL_PATTERN = /openExternalUrl/
const GITHUB_HOST_PATTERN = /github\.com/
const ISSUES_NEW_PATH_PATTERN = /issues\/new/

const FRONTEND = join(__dirname, '../../../..')

function read(...parts: string[]): string {
  return stripSourceComments(readFileSync(join(FRONTEND, ...parts), 'utf8'))
}

const selector = read('components/UI/LanguageSelector/index.tsx')
const helper = read('components/UI/LanguageSelector/translationIssue.ts')

describe('LanguageSelector report link wiring', () => {
  it('imports useNavigate from react-router-dom and calls it exactly once', () => {
    expect(selector).toMatch(
      /import\s*\{[^}]*\buseNavigate\b[^}]*\}\s*from\s*'react-router-dom'/
    )
    expect(selector.match(/useNavigate\(\)/g)).toHaveLength(1)
  })

  it('the report handler calls reportTranslationProblem with navigate, language and label', () => {
    expect(selector).toContain(
      'reportTranslationProblem(navigate, currentLanguage, label)'
    )
  })

  it('the anchor keeps its click and keyboard bindings', () => {
    expect(selector).toContain('onClick={handleReportTranslationProblem}')
    expect(selector).toContain(
      'onKeyDown={handleReportTranslationProblemKeyDown}'
    )
  })

  it('opens no external URL from the selector', () => {
    expect(selector).not.toMatch(EXTERNAL_URL_CALL_PATTERN)
  })

  it('names neither the GitHub host nor an issues/new path in the helper', () => {
    expect(helper).not.toMatch(GITHUB_HOST_PATTERN)
    expect(helper).not.toMatch(ISSUES_NEW_PATH_PATTERN)
  })

  it('SANITY: each absence pattern matches a positive fixture', () => {
    const host = ['git', 'hub.com'].join('')
    expect('window.api.openExternalUrl(x)').toMatch(EXTERNAL_URL_CALL_PATTERN)
    expect(`https://${host}/o/r/issues/new`).toMatch(GITHUB_HOST_PATTERN)
    expect(`https://${host}/o/r/issues/new`).toMatch(ISSUES_NEW_PATH_PATTERN)
  })
})

describe('report link reachability', () => {
  it('the helper targets the in-app report route', () => {
    expect(helper).toContain('/settings/report')
  })

  it('App declares the login and settings/:type routes that host the picker', () => {
    const app = read('App.tsx')
    expect(app).toMatch(/path:\s*'login'/)
    expect(app).toMatch(/path:\s*'settings\/:type'/)
  })

  it("Settings renders the report form for type === 'report'", () => {
    expect(read('screens/Settings/index.tsx')).toMatch(/type\s*===\s*'report'/)
  })
})
