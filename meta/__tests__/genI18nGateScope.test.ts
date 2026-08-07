import { existsSync } from 'fs'
import { join } from 'path'

import packageJson from '../../package.json'
import scopeSnapshot from '../i18nGateScope.json'

import {
  deriveScopeFiles,
  buildScopeSnapshot,
  EmptyScopeError
} from '../genI18nGateScope'

const DEFERRED_STEAM_LOGIN =
  'src/frontend/screens/Login/components/SteamLogin/index.tsx'
const DEFERRED_OAUTH_LOGIN =
  'src/frontend/screens/WebView/useTauriOAuthLogin.ts'

const FIXED_NOW = new Date('2026-08-07T00:00:00.000Z')

// Covers every filter branch in deriveScopeFiles(): an A .tsx survivor, an M
// .ts survivor, a D(eleted) line (dropped), a __tests__/ path (dropped), a
// .test.tsx path (dropped), a .d.ts path (dropped), a src/backend/ path
// (dropped -- wrong root), an R100 rename line whose DESTINATION collapses
// onto the M survivor (dedup via rename), and an exact duplicate of the A
// survivor (dedup via repeat).
const FIXTURE_DIFF_LINES = [
  'A\tsrc/frontend/screens/Steam/NewFeature.tsx',
  'A\tsrc/frontend/screens/Steam/NewFeature.tsx',
  'M\tsrc/frontend/screens/Login/index.ts',
  'D\tsrc/frontend/screens/Old/Removed.tsx',
  'A\tsrc/frontend/screens/Steam/__tests__/Helper.tsx',
  'M\tsrc/frontend/screens/Login/index.test.tsx',
  'A\tsrc/frontend/types/generated.d.ts',
  'M\tsrc/backend/steam/library.ts',
  'R100\tsrc/frontend/screens/OldLogin/index.ts\tsrc/frontend/screens/Login/index.ts'
]

describe('genI18nGateScope', () => {
  describe('deriveScopeFiles', () => {
    it('applies every filter and dedups to exactly the two survivors, sorted', () => {
      expect(deriveScopeFiles(FIXTURE_DIFF_LINES)).toEqual([
        'src/frontend/screens/Login/index.ts',
        'src/frontend/screens/Steam/NewFeature.tsx'
      ])
    })
  })

  describe('empty-scope guard', () => {
    it('throws EmptyScopeError instead of returning an empty files array', () => {
      const nonFrontendOnly = ['M\tsrc/backend/steam/library.ts']

      expect(() =>
        buildScopeSnapshot({
          diffLines: nonFrontendOnly,
          baseCommit: packageJson.upstream.baseCommit,
          baseVersion: packageJson.upstream.baseVersion,
          now: FIXED_NOW
        })
      ).toThrow(EmptyScopeError)
    })
  })

  describe('D-17 deferral', () => {
    it('removes both D-17 paths from files and lists them under excluded.deferred', () => {
      const diffLines = [
        ...FIXTURE_DIFF_LINES,
        `A\t${DEFERRED_STEAM_LOGIN}`,
        `M\t${DEFERRED_OAUTH_LOGIN}`
      ]

      const snapshot = buildScopeSnapshot({
        diffLines,
        baseCommit: packageJson.upstream.baseCommit,
        baseVersion: packageJson.upstream.baseVersion,
        now: FIXED_NOW
      })

      expect(snapshot.files).not.toContain(DEFERRED_STEAM_LOGIN)
      expect(snapshot.files).not.toContain(DEFERRED_OAUTH_LOGIN)
      expect(snapshot.excluded.deferred.slice().sort()).toEqual(
        [DEFERRED_STEAM_LOGIN, DEFERRED_OAUTH_LOGIN].sort()
      )
      expect(snapshot.excluded.reason[DEFERRED_STEAM_LOGIN]).toBeDefined()
      expect(snapshot.excluded.reason[DEFERRED_OAUTH_LOGIN]).toBeDefined()
    })
  })

  // Guards the committed artifact's freshness against the next upstream
  // rebase (D-07): once package.json's upstream.baseCommit/baseVersion
  // move, these go red until someone re-runs `pnpm gen-i18n-gate-scope`.
  describe('committed snapshot', () => {
    it('baseCommit matches package.json upstream.baseCommit -- re-run `pnpm gen-i18n-gate-scope` if this fails', () => {
      expect(scopeSnapshot.baseCommit).toBe(packageJson.upstream.baseCommit)
    })

    it('baseVersion matches package.json upstream.baseVersion -- re-run `pnpm gen-i18n-gate-scope` if this fails', () => {
      expect(scopeSnapshot.baseVersion).toBe(packageJson.upstream.baseVersion)
    })

    it('files is non-empty, sorted, de-duplicated, and every entry is a src/frontend .ts(x) path', () => {
      expect(scopeSnapshot.files.length).toBeGreaterThan(0)
      expect(scopeSnapshot.files).toEqual(
        [...new Set(scopeSnapshot.files)].sort()
      )
      for (const file of scopeSnapshot.files) {
        expect(file.startsWith('src/frontend/')).toBe(true)
        expect(file.endsWith('.ts') || file.endsWith('.tsx')).toBe(true)
      }
    })

    it('files contains neither D-17 deferred path', () => {
      expect(scopeSnapshot.files).not.toContain(DEFERRED_STEAM_LOGIN)
      expect(scopeSnapshot.files).not.toContain(DEFERRED_OAUTH_LOGIN)
    })

    it('excluded.deferred contains exactly the two D-17 paths, each with a reason', () => {
      expect(scopeSnapshot.excluded.deferred.slice().sort()).toEqual(
        [DEFERRED_STEAM_LOGIN, DEFERRED_OAUTH_LOGIN].sort()
      )
      expect(scopeSnapshot.excluded.reason[DEFERRED_STEAM_LOGIN]).toBeDefined()
      expect(scopeSnapshot.excluded.reason[DEFERRED_OAUTH_LOGIN]).toBeDefined()
    })

    it('every path in files exists on disk (catches a snapshot that drifted after a file rename)', () => {
      for (const file of scopeSnapshot.files) {
        expect(existsSync(join(__dirname, '..', '..', file))).toBe(true)
      }
    })
  })
})
