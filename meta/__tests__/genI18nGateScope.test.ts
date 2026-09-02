import { execFileSync } from 'child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import packageJson from '../../package.json'
import scopeSnapshot from '../i18nGateScope.json'
import forkTouchedSnapshot from '../i18nForkTouchedFiles.json'

import {
  deriveScopeFiles,
  buildScopeSnapshot,
  EmptyScopeError,
  GENERATOR_PROVENANCE,
  isHandCuratedProvenance,
  parseCliFlags,
  readScopeProvenance,
  writeArtifacts
} from '../genI18nGateScope'
import type { ScopeSnapshot } from '../genI18nGateScope'

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

/**
 * 2026-08-21: four entries added when `pnpm gen-i18n-gate-scope` was finally
 * re-run, taking i18nForkTouchedFiles.json from 181 -> 185. They are debt only
 * in the bookkeeping sense; all four were MEASURED against the real gate
 * (`scanScope({ extraFiles })`, audit mode, committed scope untouched):
 *
 *   ConsoleMode/controller.ts, HumbleLogin/index.tsx,
 *   WebView/components/HumbleLoginSurface.tsx  -- ZERO violations. These three
 *   could be folded straight into the hand-curated meta/i18nGateScope.json
 *   with no gate change at all; they sit here only because that file is
 *   hand-curated and widening it is a deliberate act (see the clobber-guard
 *   comment below for what accidental widening has already cost twice).
 *
 *   helpers/gamepad.ts -- 3 violations, ALL of them CSS selector string
 *   literals ('.MuiPopover-root' at :323, '.MuiDialog-root' at :370 and :377).
 *   These are gate false positives, not untranslated UI text, so they must NOT
 *   be parked in meta/i18nGateAllowlist.json -- that file is a DEFERRAL
 *   register (`expectedCount` + a blocking reason), and a false positive
 *   recorded there would read as real deferred debt forever. The right fix is
 *   in the gate: stop flagging CSS-selector-shaped literals.
 *
 *   Library/components/FilterChipRow/chipLabels.ts and Library/facetLabels.ts
 *   -- unlike every entry above, these two are no longer UNMEASURED debt as
 *   of quick task 260827-vpl (WR-18, DECISION 3): 35 and 8 violations
 *   respectively (43 total, all i18n key literals or paired English
 *   defaultText -- no genuine untranslated string among them), pinned by a
 *   dedicated ratchet at
 *   meta/__tests__/hardcodedStringGate.test.ts's "measured ratchet over
 *   facetLabels.ts / chipLabels.ts" describe block (`scanScope({
 *   extraFiles })`, audit mode, committed scope and allowlist both
 *   untouched -- same idiom as the three ConsoleMode/HumbleLogin files
 *   above). They stay in this array rather than moving into
 *   meta/i18nGateScope.json because folding them in would still be the
 *   deliberate, hand-curated widening this comment warns against elsewhere;
 *   the ratchet exists so that widening decision can be made later without
 *   losing count/regression coverage in the meantime.
 *
 * 2026-08-30 (35-24, gap-closure of 35-VERIFICATION.md gap 4): six entries
 * added when `pnpm gen-i18n-gate-scope` was re-run against current HEAD,
 * taking i18nForkTouchedFiles.json from 199 -> 205. All six are Phase 35
 * fork-divergent and UNMEASURED (no `scanScope` audit run against any of
 * them in this plan) -- they are recorded as debt only, not folded into
 * meta/i18nGateScope.json, per the widening caution above:
 *
 *   PathSelectionBox/index.tsx, WebviewControls/index.tsx and
 *   DownloadManager/index.tsx -- touched by 35-16 (`feat(35-16): kill lazy
 *   require('electron') in ipc.ts, retype Electron. sites`).
 *
 *   Library/components/CategoriesManager/index.tsx -- touched by the
 *   34.11-quick-ua7 fix (WR-08, distinct collection-dialog open intents),
 *   landed inside the Phase 35 window.
 *
 *   Library/components/InstallModal/defaultPlatform.ts -- added by quick
 *   task 260824-u8b (default to the native Mac build for non-Steam titles).
 *
 *   Settings/components/UseDarkTrayIcon.tsx -- touched by 35-06
 *   (`fix(35-06): platform-gate UseDarkTrayIcon to Windows/Linux`).
 *
 * 2026-08-31 (gap-closure follow-up, reopening the SAME 35-VERIFICATION.md
 * gap 4 the block above closed): one more entry added when
 * `pnpm gen-i18n-gate-scope` was re-run against current HEAD, taking
 * i18nForkTouchedFiles.json from 205 -> 206. This file is UNMEASURED (no
 * `scanScope` audit run against it here):
 *
 *   Winetricks/WinetricksSearch/index.tsx -- touched by 35-25 (`366e719bb`,
 *   the mousedown-capture fix for the mouse-dead Winetricks Install button).
 *
 * 2026-09-01 (quick `260901-w9e`, the FIRST shrink rather than a widening):
 * two entries REMOVED from both artifacts because the files themselves were
 * deleted -- `Settings/components/AnalyticsDialog.tsx` and
 * `Settings/components/AnalyticsOptIn.tsx`, the Plausible consent surfaces.
 * Scope 163 -> 161, fork-touched 206 -> 204. Hand-edited surgically, NOT
 * regenerated (a regen here is measured to take this suite from 1 failure to
 * 5). The A-03 unscanned set is unchanged at 43 because both files were in
 * BOTH lists, so `forkTouched - scope` never contained either of them --
 * `DECLARED_UNSCANNED_DEBT` deliberately needs no edit.
 *   35-25 landed in the SAME wave as, but AFTER, 35-24's re-baseline commit
 *   (`ee86b3442`), so the artifact 35-24 regenerated was stale again before
 *   the wave finished. This is the `i18n-fork-pin-regen-cascades` shape from
 *   MEMORY.md recurring: a re-baseline performed early in a wave is
 *   near-guaranteed to be stale by its end. 35-24 did nothing wrong -- the
 *   ordering did. Not a redesign of the gate; noted for whoever owns it next.
 *
 * 2026-09-02 (quick `260902-qs4`): fork-touched 204 -> 207, unscanned 43 -> 46.
 * Commit `24cdae047` ("surface a failed file picker instead of an unhandled
 * rejection") added `hooks/useOpenDialog.ts` and touched
 * `Settings/components/CustomWineProton.tsx` and
 * `Settings/components/Tools/index.tsx`. Hand-edited surgically again, NOT
 * regenerated. `meta/i18nGateScope.json` is deliberately untouched at 161, so
 * all three land in the unscanned set and must be declared below.
 *
 * READ THIS BEFORE TREATING ALL 46 AS EQUAL DEBT. Measured with audit mode
 * (`scanScope({ extraFiles: [...] })`, which never mutates the committed
 * artifacts) at the time of this edit:
 *   - `hooks/useOpenDialog.ts` -- ZERO violations. Fork-authored, and every
 *     user-facing string already goes through `t()` on the `gamelib`
 *     namespace. This is a genuine SCOPE candidate, not debt.
 *   - `Settings/components/CustomWineProton.tsx` -- ZERO violations. Also a
 *     scope candidate; the fork's edit here is an import plus a call-site
 *     swap.
 *   - `Settings/components/Tools/index.tsx` -- TWO violations, `'Winecfg'`
 *     (:89) and `'Winetricks'` (:96). Both are upstream tool names and are
 *     arguably do-not-translate glossary terms rather than real debt, but
 *     they are hits today, so this file is the only one of the three that
 *     genuinely belongs here on the evidence.
 * The first two sit in this register ONLY because widening the hand-curated
 * blocking scope is a curation decision this fix deliberately did not make on
 * the gate owner's behalf. Promoting them into `meta/i18nGateScope.json`
 * costs nothing measurable and would shrink this list to 44 -- left as a
 * follow-up so the widening is a deliberate act, not a side effect of an
 * unrelated red-suite fix.
 *
 * 2026-09-02 (quick `260902-rpa`, THE FOLLOW-UP DIRECTLY ABOVE, now taken):
 * scope 161 -> 163, unscanned 46 -> 44. `hooks/useOpenDialog.ts` and
 * `Settings/components/CustomWineProton.tsx` moved OUT of this register and
 * INTO `meta/i18nGateScope.json`, so the BLOCKING gate now scans them on
 * every run instead of a comment vouching for them. The paragraph above is
 * left standing as the record of the decision being DEFERRED; this one
 * records it being MADE -- deliberately, on its own, rather than as a side
 * effect of an unrelated red-suite fix, which is exactly the sequencing that
 * paragraph asked for.
 *
 * Re-measured immediately before the edit against the gate as it stands
 * AFTER `21dd66e4c` (which widened Pattern 3 and so could in principle have
 * changed any file's verdict), rather than trusting the `260902-qs4`
 * numbers: baseline `scanScope()` = 161 files / 0 violations; audit
 * `scanScope({ extraFiles: [both] })` = 163 files / 0 violations -- 0 for
 * each of the two files individually, and 0 collateral anywhere else. The
 * promotion therefore costs nothing measurable and buys real coverage: a
 * hardcoded literal added to either file now fails CI by name instead of
 * sitting in a register nothing enforces.
 *
 * `Settings/components/Tools/index.tsx` deliberately STAYS below. Its two
 * hits (`'Winecfg'` :89, `'Winetricks'` :96) are live today, so promoting it
 * would turn the blocking gate red; whether upstream tool names are
 * do-not-translate glossary terms has to be settled first. That is a real
 * remaining follow-up, and a different one from the one this entry closes.
 *
 * 2026-09-02 (quick `260902-ur1`, merging Phase 34.12 from `wt/Other`): fork-touched
 * 207 -> 208, unscanned 44 -> 45, scope UNCHANGED at 163. Three moves, all forced by
 * the merge rather than chosen:
 *   - `Sidebar/components/SidebarTour.tsx` OUT -- 34.12-04 deletes the file. Same
 *     precedent as `260901-w9e`: a deleted file leaves the artifact.
 *   - `NavShell/components/NavShellTour/index.tsx` IN -- its replacement. It was
 *     ALREADY in `i18nGateScope.json`, because 34.12-04's own commit `848b58f84`
 *     repointed the fork-scope manifests; the scope count therefore did not move.
 *   - `state/TourContext.tsx` IN, and declared below -- 34.12-05 hardened its
 *     persisted-state read, which makes it fork-touched. This one was MISSED on the
 *     first pass (the swap above nets to zero, so the count still read 207 and looked
 *     right) and was caught only by A-17 comparing against the live derivation. A
 *     count that does not move is not evidence that the SET did not move.
 * Not measured for violations here: `TourContext.tsx` is declared as unscanned debt,
 * not promoted into the blocking scope, because this was a merge-conflict resolution
 * and not a curation decision -- the same reasoning `260902-qs4` recorded above.
 */
const DECLARED_UNSCANNED_DEBT = [
  'src/frontend/components/UI/ActionIcons/index.tsx',
  'src/frontend/components/UI/Dialog/components/Dialog.tsx',
  'src/frontend/components/UI/DialogHandler/index.tsx',
  'src/frontend/components/UI/LanguageSelector/index.tsx',
  'src/frontend/components/UI/NavShell/components/FilterFacetGroup/selectionCount.ts',
  'src/frontend/components/UI/PathSelectionBox/index.tsx',
  'src/frontend/components/UI/ProgressDialog/index.tsx',
  'src/frontend/components/UI/SliderField/index.tsx',
  'src/frontend/components/UI/SteamGridDBPicker/index.tsx',
  'src/frontend/components/UI/WebviewControls/index.tsx',
  'src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx',
  'src/frontend/components/UI/Winetricks/index.tsx',
  'src/frontend/helpers/declaredUnavailable.ts',
  'src/frontend/helpers/gamepad.ts',
  'src/frontend/helpers/gamepad_layouts/nintendo.ts',
  'src/frontend/screens/ConsoleMode/components/ConfirmDialog/index.tsx',
  'src/frontend/screens/ConsoleMode/controller.ts',
  'src/frontend/screens/ConsoleMode/selectors.ts',
  'src/frontend/screens/DownloadManager/index.tsx',
  'src/frontend/screens/Game/GamePage/components/WikiInfoEmptyState.tsx',
  'src/frontend/screens/Library/components/CategoriesManager/index.tsx',
  'src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts',
  'src/frontend/screens/Library/components/GamesList/index.tsx',
  'src/frontend/screens/Library/components/InstallModal/defaultPlatform.ts',
  'src/frontend/screens/Library/components/LibraryHeader/gameCount.ts',
  'src/frontend/screens/Library/engineWiring.ts',
  'src/frontend/screens/Library/facetLabels.ts',
  'src/frontend/screens/Library/filterEngine.ts',
  'src/frontend/screens/Login/components/HumbleLogin/index.tsx',
  'src/frontend/screens/Login/steamTileState.ts',
  'src/frontend/screens/Settings/components/EgsSettings.tsx',
  'src/frontend/screens/Settings/components/GamePadDelayRepeat.tsx',
  'src/frontend/screens/Settings/components/LauncherArgs.tsx',
  'src/frontend/screens/Settings/components/SteamGridDbApiKey.tsx',
  'src/frontend/screens/Settings/components/Tools/index.tsx',
  'src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx',
  'src/frontend/screens/Settings/components/UseFramelessWindow.tsx',
  'src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx',
  'src/frontend/screens/Settings/sections/GamesSettings/index.tsx',
  'src/frontend/screens/Settings/sections/SyncSaves/gog.tsx',
  'src/frontend/screens/Settings/sections/SyncSaves/legendary.tsx',
  'src/frontend/screens/WebView/components/HumbleLoginSurface.tsx',
  'src/frontend/screens/WebView/components/humbleLoginChromeCss.ts',
  'src/frontend/state/InstallProgress.ts',
  'src/frontend/state/TourContext.tsx'
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

/**
 * quick-260816-9o0 — the clobber guard.
 *
 * `meta/genI18nGateScope.ts` used to write BOTH artifacts unconditionally.
 * One of them, `meta/i18nGateScope.json`, is the input to the BLOCKING
 * hardcoded-string gate and is hand-curated (162 files as of 34.15-09; its
 * `generatedBy` records "hand-edited (34.13 review CR-02(b), then
 * A-02/A-03)"). The other, `meta/i18nForkTouchedFiles.json`, was added by
 * 34.13 review A-17 as the CI-readable input to the staleness ratchet
 * directly above, and is routine to regenerate.
 *
 * A-17 therefore gave people a ROUTINE reason to run
 * `pnpm gen-i18n-gate-scope`, and doing so silently widened the blocking gate
 * (160 -> 178 at 34.13; 162 -> 180 at 34.15-09, when this phase's own two new
 * fork-touched files -- `Library/components/SteamSyncNotice/index.tsx` and
 * `Library/librarySyncIndicator.ts` -- were folded into the hand-curated
 * scope rather than left as unscanned debt) and destroyed the hand-edited
 * provenance marker. That already cost real work twice: 34.13-08 removed two
 * entries by hand rather than regenerate, and the A-17 fix agent had to
 * restore the file with `git show HEAD:... >`.
 *
 * Every spec below drives the REAL writer against a `mkdtempSync` directory
 * with REAL fs writes — never a hand-built replica of the write logic (a
 * replica drifts silently), and never the real `meta/` directory. No spec
 * calls `main()`: jest's rootDir is the repo root, and `main()`'s output
 * paths are CWD-relative, so calling it under test would write the REAL
 * artifacts.
 */
describe('--rewrite-scope guard', () => {
  const REAL_SCOPE_PATH = join(__dirname, '..', 'i18nGateScope.json')
  const REAL_SCOPE_BYTES = readFileSync(REAL_SCOPE_PATH, 'utf-8')

  const tmpDirs: string[] = []

  function makeTmpDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'gamelib-scope-guard-'))
    tmpDirs.push(dir)
    return dir
  }

  /**
   * A tmpdir seeded with the EXACT bytes of the committed hand-curated
   * snapshot, optionally with `generatedBy` swapped (A3's positive control).
   * Returns the seeded path and the bytes actually written, so a spec can
   * assert byte-identity against what it seeded rather than against a
   * re-serialisation.
   */
  function seedScope(overrideProvenance?: string): {
    outDir: string
    scopePath: string
    seededBytes: string
  } {
    const outDir = makeTmpDir()
    const scopePath = join(outDir, 'i18nGateScope.json')

    let seededBytes = REAL_SCOPE_BYTES
    if (overrideProvenance !== undefined) {
      const parsed = JSON.parse(REAL_SCOPE_BYTES)
      parsed.generatedBy = overrideProvenance
      seededBytes = JSON.stringify(parsed, null, 2) + '\n'
    }

    writeFileSync(scopePath, seededBytes)
    return { outDir, scopePath, seededBytes }
  }

  /**
   * The snapshot a real regeneration would produce TODAY: the 208 files of
   * the committed fork-touched artifact (35-24: 199 -> 205, six files that
   * phase touched -- `PathSelectionBox/index.tsx`, `WebviewControls/index.tsx`,
   * `DownloadManager/index.tsx`, `CategoriesManager/index.tsx`,
   * `InstallModal/defaultPlatform.ts` and `UseDarkTrayIcon.tsx`; then one more
   * gap-closure follow-up: 205 -> 206, `Winetricks/WinetricksSearch/index.tsx`,
   * touched by 35-25's `366e719bb` after 35-24's re-baseline had already
   * landed). Built from the committed artifacts rather than invented numbers,
   * so the specs below assert the REAL 163 -> 208 delta this task exists to
   * prevent.
   */
  function freshSnapshot(): ScopeSnapshot {
    return {
      baseCommit: packageJson.upstream.baseCommit,
      baseVersion: packageJson.upstream.baseVersion,
      generatedAt: FIXED_NOW.toISOString(),
      generatedBy: GENERATOR_PROVENANCE,
      files: [...forkTouchedSnapshot.files],
      excluded: {
        deferred: [DEFERRED_OAUTH_LOGIN, DEFERRED_STEAM_LOGIN].sort(),
        reason: {
          [DEFERRED_STEAM_LOGIN]: 'D-17 -- deferred',
          [DEFERRED_OAUTH_LOGIN]: 'D-17 -- deferred'
        }
      }
    }
  }

  afterAll(() => {
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('A0 fixture sanity: the seeded scope is the REAL 163-file hand-curated snapshot and the fresh snapshot is the REAL 208', () => {
    expect(scopeSnapshot.files.length).toBe(163)
    expect(forkTouchedSnapshot.files.length).toBe(208)
    expect(freshSnapshot().files.length).toBe(208)
    expect(isHandCuratedProvenance(scopeSnapshot.generatedBy)).toBe(true)
  })

  it('A1 DEFAULT RUN IS SAFE: writes the fork-touched artifact and leaves the curated scope file byte-identical', () => {
    const { outDir, scopePath, seededBytes } = seedScope()

    const result = writeArtifacts({
      snapshot: freshSnapshot(),
      outDir,
      rewriteScope: false
    })

    expect(existsSync(join(outDir, 'i18nForkTouchedFiles.json'))).toBe(true)
    expect(result.wroteForkTouched).toBe(
      join(outDir, 'i18nForkTouchedFiles.json')
    )

    // Byte comparison, not a parsed-object comparison: a re-serialisation
    // that happened to round-trip the same values would still have destroyed
    // whatever formatting/ordering the hand-curated file carries.
    expect(readFileSync(scopePath, 'utf-8')).toBe(seededBytes)
    expect(result.wroteScope).toBeNull()
    expect(result.refusal).toBeNull()
  })

  it('A2 REFUSAL NAMES WHAT IT WOULD HAVE DONE: --rewrite-scope on a hand-curated file refuses with the real 163 -> 208 diff and writes nothing', () => {
    const { outDir, scopePath, seededBytes } = seedScope()

    const result = writeArtifacts({
      snapshot: freshSnapshot(),
      outDir,
      rewriteScope: true
    })

    expect(readFileSync(scopePath, 'utf-8')).toBe(seededBytes)
    expect(result.wroteScope).toBeNull()
    expect(result.refusal).not.toBeNull()

    const refusal = result.refusal!
    expect(refusal.existingCount).toBe(scopeSnapshot.files.length)
    expect(refusal.nextCount).toBe(forkTouchedSnapshot.files.length)
    expect(refusal.added.slice().sort()).toEqual(
      [...DECLARED_UNSCANNED_DEBT].sort()
    )
    expect(refusal.removed).toEqual([])
    expect(refusal.provenance).toBe(scopeSnapshot.generatedBy)
  })

  it('A3 NON-VACUITY / POSITIVE CONTROL: --rewrite-scope on a GENERATOR-provenance file DOES rewrite it to 208', () => {
    // The load-bearing spec. Without it, A1/A2's "the file did not change"
    // would be satisfied just as well by a writer that cannot write at all —
    // a guard that refuses everything is not a fix, it is a different bug.
    const { outDir, scopePath } = seedScope(GENERATOR_PROVENANCE)

    const result = writeArtifacts({
      snapshot: freshSnapshot(),
      outDir,
      rewriteScope: true
    })

    const rewritten = JSON.parse(readFileSync(scopePath, 'utf-8'))
    expect(rewritten.files.length).toBe(208)
    expect(result.wroteScope).toBe(scopePath)
    expect(result.refusal).toBeNull()
  })

  it('A4 BOOTSTRAP: an ABSENT scope file is not hand-curated, so --rewrite-scope creates it with 208 files', () => {
    const outDir = makeTmpDir()
    const scopePath = join(outDir, 'i18nGateScope.json')
    expect(existsSync(scopePath)).toBe(false)

    const result = writeArtifacts({
      snapshot: freshSnapshot(),
      outDir,
      rewriteScope: true
    })

    expect(result.refusal).toBeNull()
    expect(result.wroteScope).toBe(scopePath)
    expect(JSON.parse(readFileSync(scopePath, 'utf-8')).files.length).toBe(208)
  })

  it('A5 PROVENANCE RATCHET ON THE REAL ARTIFACT: the committed marker still reads as hand-curated', () => {
    // Goes RED the day anyone clobbers the marker — which IS the failure this
    // whole task exists to prevent, so it must be pinned against the real
    // committed file, not a fixture.
    expect(isHandCuratedProvenance(scopeSnapshot.generatedBy)).toBe(true)
    expect(isHandCuratedProvenance(GENERATOR_PROVENANCE)).toBe(false)
    expect(isHandCuratedProvenance(null)).toBe(false)
  })

  it('A5b readScopeProvenance reads the real marker off disk, and answers null for absent/garbage files', () => {
    expect(readScopeProvenance(REAL_SCOPE_PATH)).toBe(scopeSnapshot.generatedBy)

    const dir = makeTmpDir()
    expect(readScopeProvenance(join(dir, 'does-not-exist.json'))).toBeNull()

    const garbage = join(dir, 'garbage.json')
    writeFileSync(garbage, 'not json at all {{{')
    expect(readScopeProvenance(garbage)).toBeNull()

    const noProvenance = join(dir, 'no-provenance.json')
    writeFileSync(noProvenance, JSON.stringify({ files: [] }))
    expect(readScopeProvenance(noProvenance)).toBeNull()
  })

  it('A6 FLAG PARSING: only --rewrite-scope is recognised, and a typo throws by name rather than degrading into a no-op', () => {
    expect(parseCliFlags([])).toEqual({ rewriteScope: false })
    expect(parseCliFlags(['--rewrite-scope'])).toEqual({ rewriteScope: true })

    // A typo silently parsing as "don't rewrite" would be the worst outcome:
    // the operator believes they asked for a rewrite and gets a clean exit.
    expect(() => parseCliFlags(['--rewritescope'])).toThrow('--rewritescope')
  })
})
