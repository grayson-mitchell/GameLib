/**
 * `public/changelog.json` is the only version surface in the project that is
 * not derived from `package.json` -- `getCurrentChangelog()`
 * (`src/backend/utils.ts`) reads it verbatim off disk and hands it straight to
 * the changelog modal, which renders `name` as the dialog title and `body` as
 * markdown. Nothing validated it against the running version, so it drifted
 * alone: the 2026-07-20 `v1.x -> 0.x` renumber swept the repo with a
 * lookahead-guarded regex written to PRESERVE literal version strings, which
 * is correct for git tags and dependency pins and wrong for this file, where
 * `1.0.0` was display copy. The modal shipped titled "GameLib 1.0.0" against a
 * 0.7.0 app for a month.
 *
 * The generalizable shape: a sweep that protects "version strings" as a
 * category silently skips the subset that are rendered to users. This gate is
 * the two-line check that would have caught it the day it started.
 *
 * The prose in `body` stays hand-maintained -- it cannot be derived from
 * `package.json`. Only the four identity surfaces are gated.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')

const pkgVersion = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as {
    version: string
  }
).version

const changelog = JSON.parse(
  readFileSync(join(ROOT, 'public', 'changelog.json'), 'utf-8')
) as {
  tag_name: string
  name: string
  html_url: string
  body: string
  published_at: string
}

describe('public/changelog.json agrees with package.json', () => {
  it('reads a plain semver out of package.json (guards the gate itself)', () => {
    expect(pkgVersion).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('tag_name matches the running version', () => {
    expect(changelog.tag_name).toBe(`gamelib-v${pkgVersion}`)
  })

  it('name -- the modal title -- matches the running version', () => {
    expect(changelog.name).toBe(`GameLib ${pkgVersion}`)
  })

  it('html_url points at the matching tag', () => {
    expect(changelog.html_url).toMatch(
      new RegExp(`/releases/tag/gamelib-v${pkgVersion.replace(/\./g, '\\.')}$`)
    )
  })

  it('the body heading rendered in the modal matches the running version', () => {
    const heading = changelog.body.match(/^##\s+(.+)$/m)?.[1]
    expect(heading).toBe(`GameLib ${pkgVersion}`)
  })

  it('carries no leftover reference to the pre-renumber 1.0.0 identity', () => {
    const identityFields = [
      changelog.tag_name,
      changelog.name,
      changelog.html_url
    ].join('\n')
    expect(identityFields).not.toMatch(/\bv?1\.0\.0\b/)
  })

  it('published_at is a real date', () => {
    expect(Number.isNaN(Date.parse(changelog.published_at))).toBe(false)
  })
})
