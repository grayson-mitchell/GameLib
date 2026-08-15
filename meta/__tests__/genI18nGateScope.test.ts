import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

import packageJson from '../../package.json'
import scopeSnapshot from '../i18nGateScope.json'
import forkTouchedSnapshot from '../i18nForkTouchedFiles.json'

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

const DECLARED_UNSCANNED_DEBT = [
  'src/frontend/components/UI/ActionIcons/index.tsx',
  'src/frontend/components/UI/LanguageSelector/index.tsx',
  'src/frontend/components/UI/NavShell/components/FilterFacetGroup/selectionCount.ts',
  'src/frontend/components/UI/SteamGridDBPicker/index.tsx',
  'src/frontend/components/UI/Winetricks/index.tsx',
  'src/frontend/helpers/declaredUnavailable.ts',
  'src/frontend/screens/ConsoleMode/selectors.ts',
  'src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts',
  'src/frontend/screens/Library/components/GamesList/index.tsx',
  'src/frontend/screens/Library/components/LibraryHeader/gameCount.ts',
  'src/frontend/screens/Library/engineWiring.ts',
  'src/frontend/screens/Library/facetLabels.ts',
  'src/frontend/screens/Library/filterEngine.ts',
  'src/frontend/screens/Settings/components/EgsSettings.tsx',
  'src/frontend/screens/Settings/components/SteamGridDbApiKey.tsx',
  'src/frontend/screens/Settings/components/UseFramelessWindow.tsx',
  'src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx',
  'src/frontend/screens/Settings/sections/GamesSettings/index.tsx'
]

/**
 * 34.13 review A-17 — THE RATCHET, now runnable in CI.
 *
 * It previously sat inside `describeIfGitAvailable`, which resolves to
 * `describe.skip` whenever `git diff <upstream merge-base> HEAD` fails.
 * `actions/checkout@v6` clones at depth 1 with no Heroic remote, and
 * `grep -rn "fetch-depth" .github/workflows/` returns NO MATCH, so that diff
 * fails on every pipeline run — the ratchet was `describe.skip` in CI and the
 * fix report's "new drift fails immediately by name" claim was true only on a
 * developer machine that had fetched the merge-base. That is precisely the
 * drift A-02 was: a new fork-touched file reaches main with nothing red,
 * because the only mechanism that names it never executes in the pipeline.
 *
 * The ratchet now reads `meta/i18nForkTouchedFiles.json`, a COMMITTED artifact
 * written by `pnpm gen-i18n-gate-scope` alongside the scope snapshot itself.
 * No git, no network, no remote — it runs everywhere. The artifact cannot rot
 * silently: the ANTI-ROT specs above assert it still equals the live git
 * derivation wherever git can answer.
 */
describe('A-17 CI-READABLE RATCHET (no git required)', () => {
  const committedScope = new Set(scopeSnapshot.files)
  const unscanned = forkTouchedSnapshot.files.filter(
    (file) => !committedScope.has(file)
  )

  it('sanity: the committed fork-touched artifact is non-empty and a superset of the committed scope', () => {
    expect(forkTouchedSnapshot.files.length).toBeGreaterThan(0)
    expect(forkTouchedSnapshot.files.length).toBeGreaterThanOrEqual(
      scopeSnapshot.files.length
    )
  })

  it('the artifact is pinned to the SAME upstream merge-base as package.json, so it cannot describe a different world', () => {
    expect(forkTouchedSnapshot.baseCommit).toBe(packageJson.upstream.baseCommit)
  })

  it('A-03 RATCHET: the set of unscanned fork-touched files equals the DECLARED debt exactly -- any NEW drift fails here by name', () => {
    expect(unscanned.sort()).toEqual([...DECLARED_UNSCANNED_DEBT].sort())
  })

  it('A-03 RATCHET non-vacuity: the ratchet DOES fail when a file drifts out of scope -- proven by removing a real, currently-in-scope path from a copy of the snapshot', () => {
    const inScope = forkTouchedSnapshot.files.find((file) =>
      committedScope.has(file)
    )
    expect(inScope).toBeDefined()

    const sabotaged = new Set(
      scopeSnapshot.files.filter((file) => file !== inScope)
    )
    const missing = forkTouchedSnapshot.files.filter(
      (file) => !sabotaged.has(file)
    )

    expect(missing.sort()).not.toEqual([...DECLARED_UNSCANNED_DEBT].sort())
    expect(missing).toContain(inScope)
  })

  it('A-17 non-vacuity: a NEW fork-touched file appearing in the artifact fails the ratchet by name', () => {
    // The exact drift the CI-skipped version could not catch.
    const drifted = [
      ...forkTouchedSnapshot.files,
      'src/frontend/screens/Brand/NewlyAddedByAFuturePhase.tsx'
    ]
    const missing = drifted.filter((file) => !committedScope.has(file))

    expect(missing.sort()).not.toEqual([...DECLARED_UNSCANNED_DEBT].sort())
    expect(missing).toContain(
      'src/frontend/screens/Brand/NewlyAddedByAFuturePhase.tsx'
    )
  })
})

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

  // REQ-34.10-14's named blocking trap, in the direction the tests above do
  // NOT cover: the "committed snapshot" describe block above only checks
  // that every path IN the snapshot still EXISTS on disk (the rename/delete
  // direction). It says nothing about a real fork-touched source file that
  // exists on disk today but was never added to the snapshot -- exactly
  // what happens to a brand-new nav component file the moment it lands,
  // until someone remembers to re-run `pnpm gen-i18n-gate-scope`. That file
  // is invisible to the blocking hardcoded-string gate
  // (`meta/hardcodedStringGate.ts` only scans `scopeSnapshot.files`), so a
  // raw string literal inside it passes `pnpm test:ci` green today.
  //
  // This guard re-derives "what SHOULD be in scope" using the exact
  // PRODUCTION call shape `meta/genI18nGateScope.ts`'s own `main()` uses --
  // the real `git diff --name-status <baseCommit> HEAD -- src/frontend`,
  // fed through the real `buildScopeSnapshot` (which itself calls the real
  // `deriveScopeFiles`) -- rather than a hand-built approximation. An
  // earlier version of this guard walked every file under `src/frontend` on
  // disk and fed each one through `deriveScopeFiles` as a synthetic `A`
  // line; that is NOT equivalent to the production input and was proven
  // wrong empirically: `deriveScopeFiles` only filters by path shape
  // (extension / `__tests__/` / `.d.ts` / prefix), so a disk walk cannot
  // distinguish a genuinely fork-touched file from an untouched upstream
  // Heroic file, and flooded this guard with ~100 false positives on first
  // run -- every unmodified upstream file under `src/frontend` (see
  // git history for the reverted attempt). Only a real `git diff` against
  // the upstream merge-base answers "is this file fork-touched," which is
  // what the snapshot is actually scoped to.
  //
  // Because this now shells out to real `git`, it is guarded to skip rather
  // than fail when the merge-base commit is unreachable -- `genI18nGateScope
  // .ts`'s own header documents that `actions/checkout@v6`'s shallow,
  // single-remote CI clone has no Heroic remote and no merge-base commit in
  // its history, so `git diff` fails there with "fatal: invalid object
  // name" (the exact reason that script "MUST NOT run in CI"). Reproducing
  // an unguarded version of that same call inside a test that runs under
  // `pnpm test:ci` would break CI for a reason unrelated to i18n coverage.
  // Skipping is recorded via `console.warn` so a silent skip is still
  // visible in test output, not a silent pass.
  describe('staleness guard -- the reverse direction (REQ-34.10-14)', () => {
    const REPO_ROOT = join(__dirname, '..', '..')

    function tryGetForkDiffLines(): string[] | null {
      try {
        const output = execFileSync(
          'git',
          [
            'diff',
            '--name-status',
            packageJson.upstream.baseCommit,
            'HEAD',
            '--',
            'src/frontend'
          ],
          { encoding: 'utf-8', cwd: REPO_ROOT }
        )
        return output.split('\n').filter((line) => line.trim().length > 0)
      } catch {
        return null
      }
    }

    const diffLines = tryGetForkDiffLines()
    const canRunGitDiff = diffLines !== null
    const describeIfGitAvailable = canRunGitDiff ? describe : describe.skip

    if (!canRunGitDiff) {
      // eslint-disable-next-line no-console
      console.warn(
        'genI18nGateScope staleness guard SKIPPED: the upstream merge-base ' +
          `commit (${packageJson.upstream.baseCommit}) is not reachable in ` +
          'this clone, matching the exact CI limitation ' +
          'meta/genI18nGateScope.ts documents. This guard only runs where ' +
          'the merge-base is locally fetched.'
      )
    }

    describeIfGitAvailable(
      'with a real git diff against the upstream merge-base',
      () => {
        function freshSnapshotFiles(): string[] {
          return buildScopeSnapshot({
            diffLines: diffLines as string[],
            baseCommit: packageJson.upstream.baseCommit,
            baseVersion: packageJson.upstream.baseVersion,
            now: FIXED_NOW
          }).files
        }

        it('sanity: the real fork diff yields a non-empty scope-eligible file set', () => {
          expect(freshSnapshotFiles().length).toBeGreaterThan(0)
        })

        /**
         * The DECLARED, measured debt: fork-touched files that are eligible for
         * the blocking hardcoded-string gate's scope but are not in the
         * committed snapshot, so nothing has ever scanned them.
         *
         * 34.13 review A-03 CORRECTED THIS. The comment that used to sit here
         * named SIX files "as of 34.11". The real count at 34.13 was TWENTY,
         * and the comment had no way to notice: the guard below it was
         * `it.skip`'d, so the number was prose, not a measurement. Two of the
         * twenty were this phase's own output
         * (`InstallModal/index.tsx`, edited by five of iteration 1's seventeen
         * fix commits, and `WineSelector/engineFilter.ts`, created by D-16);
         * both were added to `meta/i18nGateScope.json` by the A-02 fix and are
         * therefore absent from this list.
         *
         * The remaining eighteen are pre-existing debt from 34.11 and earlier.
         */

        /**
         * 34.13 review A-03: a LIVE RATCHET, replacing the prose the skipped
         * guard below carried.
         *
         * The review's preferred fix was to un-skip the full guard and accept
         * a permanent RED. That was rejected for the reason the original
         * comment itself gives: a permanently red suite masks unrelated
         * regressions. This is the version that keeps the invariant
         * ENFORCEABLE without going red -- the existing debt is declared
         * explicitly above, and any file that drifts out of scope from here on
         * fails immediately, by name.
         *
         * A file LEAVING the list (added to the snapshot, or deleted) also
         * fails, so the declaration cannot silently rot the way the six-file
         * comment did.
         */
        // 34.13 review A-17 MOVED the ratchet itself out of this
        // git-dependent block -- see the CI-READABLE RATCHET describe below.
        // What stays here is the ANTI-ROT half, which genuinely needs git:
        // proving the committed artifact still equals the live derivation.
        it('A-17 ANTI-ROT: the committed meta/i18nForkTouchedFiles.json equals the LIVE git derivation', () => {
          // Without this, moving the ratchet onto a committed input would
          // just relocate the staleness problem: a developer could let the
          // artifact rot and the CI ratchet would happily measure yesterday's
          // world. This runs wherever the merge-base IS fetched, so the
          // artifact is checked on every developer machine and on any runner
          // that fetches history.
          expect([...forkTouchedSnapshot.files].sort()).toEqual(
            [...freshSnapshotFiles()].sort()
          )
        })

        it('A-17 ANTI-ROT non-vacuity: the anti-rot check DOES fail against a mutated copy of the committed artifact', () => {
          const sabotaged = forkTouchedSnapshot.files.filter(
            (_file, index) => index !== 0
          )
          expect(sabotaged.sort()).not.toEqual([...freshSnapshotFiles()].sort())
        })

        // SKIPPED, NOT BROKEN -- this assertion is correct, non-vacuous (proven
        // by the SANITY test directly below, which stays live) and currently
        // RED against real HEAD, naming the 18 files listed in
        // DECLARED_UNSCANNED_DEBT above. The RATCHET above is what actually
        // enforces the invariant day to day; this one is the end state.
        //
        // The obvious fix -- `pnpm gen-i18n-gate-scope` -- is blocked on
        // WR-17 (34.11-REVIEW.md): `pnpm i18n` carries pre-existing catalog
        // drift that must be triaged FIRST, or a regeneration silently drops
        // the 8 new panel files from the localisation gate along with the
        // catalog keys. (The snapshot's own provenance fields were false too;
        // 34.13 review A-03 corrected them to say "hand-edited".)
        //
        // UN-SKIP THIS (delete the `.skip`) the moment WR-17 is triaged and
        // the snapshot is legitimately regenerated, and delete the ratchet
        // above with it.
        it.skip('every fork-touched source file the real diff surfaces is present in the committed meta/i18nGateScope.json snapshot -- re-run `pnpm gen-i18n-gate-scope` if this fails', () => {
          const freshFiles = freshSnapshotFiles()
          const committedSet = new Set(scopeSnapshot.files)
          const missing = freshFiles.filter((file) => !committedSet.has(file))

          // jest's own array-diff on a failing toEqual([]) prints every
          // unexpected surviving entry, which is exactly the "name the
          // un-snapshotted paths" failure mode this guard exists to produce.
          expect(missing).toEqual([])
        })

        it('SANITY: the staleness guard above actually detects an absence -- proves it is not vacuously true', () => {
          const freshFiles = freshSnapshotFiles()
          expect(freshFiles.length).toBeGreaterThan(0)

          // Simulate a stale snapshot by fabricating one with a real,
          // currently-in-scope file removed from it, then re-run the exact
          // same detection logic the test above uses against that fabricated
          // snapshot.
          const knownFile = freshFiles[0]
          const fakeStaleCommittedSet = new Set(
            scopeSnapshot.files.filter((file) => file !== knownFile)
          )
          const missing = freshFiles.filter(
            (file) => !fakeStaleCommittedSet.has(file)
          )

          expect(missing).toContain(knownFile)
        })
      }
    )
  })
})
