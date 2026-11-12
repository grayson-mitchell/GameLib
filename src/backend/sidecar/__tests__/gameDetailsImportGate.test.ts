/**
 * By-construction import-graph, delegation-shape and do-not-touch gates for
 * the game-details/settings/overrides slice (Phase 34.2 Plan 04 —
 * REQ-34.2-01/REQ-34.2-03/REQ-34.2-10/REQ-34.2-14).
 *
 * This is a NEW file, not an extension of `electronUntouched.test.ts`.
 * `electronUntouched.test.ts` was read in full during this plan's planning
 * pass and confirmed to be Phase 28's keyring/`configStore` byte-identity
 * proof: it asserts that `SidecarKeyringTokenStore`'s four operations never
 * write to the shared `configStore`, plus two narrow by-construction gates
 * scoped to `keyringTokenStore.ts`/`bootstrap.ts`/`platform/index.ts`. It makes
 * NO assertion about `main.ts`'s textual state or about any sidecar/
 * gamedetails import graph beyond those three named files — so this slice's
 * curated-import gate, delegation-shape gate, and two do-not-touch gates
 * needed their own home here, rather than weakening or repurposing that
 * file's narrow, already-proven contract (the exact same reasoning
 * `appShellImportGate.test.ts`'s own header states for itself).
 *
 * Gates strip comments before matching (mirrors
 * `appShellImportGate.test.ts`'s/`downloadQueueFlows.test.ts`'s own
 * `stripComments` helper) so an explanatory header paragraph mentioning
 * "electron" or a channel name cannot self-invalidate its own gate.
 */

import { defined } from 'backend/testUtils/indexed'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { stripSourceComments as stripComments } from 'backend/testUtils/stripSourceComments'

/**
 * WR-02 (Phase 34.2 gap cycle 1): the two sha256 gates below used to hash the
 * file's RAW BYTES. `.gitattributes` carries no `text=auto eol=lf`, so a
 * checkout on Windows with Git's default `core.autocrlf=true` yields CRLF and
 * both digests differ from the committed constants -- a gate failing for a
 * reason that has nothing to do with the content it exists to protect.
 *
 * CI cannot catch this: `.github/workflows/test.yml` runs `pnpm test:ci` on
 * `ubuntu-latest` only. It would surface as a confusing local red for a Windows
 * contributor, on a repo that ships a Windows build.
 *
 * Normalising leaves the committed digests UNCHANGED on an LF checkout -- CRLF
 * collapses to LF, and an already-LF file is byte-identical -- so this is purely
 * defensive and the pins keep their existing values.
 */
function normaliseLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

// Comment-stripping now delegates to the shared
// `backend/testUtils/stripSourceComments` util (strips block comments first,
// then the line-prefix filter), imported above as `stripComments`.

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name)
}

describe('gameDetailsImportGate (Phase 34.2 Plan 04 — REQ-34.2-01/REQ-34.2-03/REQ-34.2-10/REQ-34.2-14)', () => {
  // ── Gate 1: no file directly under src/backend/sidecar/ imports the real
  // 'electron' module ─────────────────────────────────────────────────────
  it('REQ-34.2-14 Gate 1: no .ts file directly under src/backend/sidecar/ imports the real electron module', () => {
    const sidecarDir = join(__dirname, '..')
    const files = listTsFiles(sidecarDir)
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const stripped = stripComments(
        readFileSync(join(sidecarDir, file), 'utf-8')
      )
      expect(stripped).not.toMatch(/from\s+['"]electron['"]/)
      expect(stripped).not.toMatch(/require\(\s*['"]electron['"]\s*\)/)
    }
  })

  // Gate 1 must stay GREEN when a COMMENT containing the forbidden pattern is
  // present — proves the comment-stripping itself works, rather than merely
  // asserting a raw grep would pass (which would prove nothing about the
  // stripper). No gate in this file relies on a raw grep.
  it('REQ-34.2-14 Gate 2 (self-test): stripComments removes a comment-only "from \'electron\'" line before matching', () => {
    const source = [
      "// this comment intentionally says: from 'backend/platform'",
      "import { ipcMain } from './platformApi'"
    ].join('\n')
    const stripped = stripComments(source)
    expect(stripped).not.toMatch(/from\s+['"]electron['"]/)
  })

  // ── Gate 3: no file under src/backend/gamedetails/ reaches electron, the
  // typed IPC layer, launcher.ts, or main_window.ts ──────────────────────────
  it('REQ-34.2-14 Gate 3: no .ts file under src/backend/gamedetails/ matches electron, backend/ipc, ../ipc, ../launcher, or main_window', () => {
    const gamedetailsDir = join(__dirname, '../../gamedetails')
    const files = listTsFiles(gamedetailsDir)
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const stripped = stripComments(
        readFileSync(join(gamedetailsDir, file), 'utf-8')
      )
      expect(stripped).not.toMatch(/from\s+['"]electron['"]/)
      expect(stripped).not.toMatch(/require\(\s*['"]electron['"]\s*\)/)
      expect(stripped).not.toMatch(/backend\/ipc/)
      expect(stripped).not.toMatch(/from\s+['"]\.\.\/ipc['"]/)
      expect(stripped).not.toMatch(/\.\.\/launcher/)
      expect(stripped).not.toMatch(/main_window/)
    }
  })

  // ── Gate 4: gameDetailsFlowRegistration.ts's own curated-import rule —
  // never side-effect-import a file that registers other slices' channels ────
  it('REQ-34.2-03/D-04 Gate 4: gameDetailsFlowRegistration.ts references neither backend/ipc, ../ipc, nor any ipc_handler path', () => {
    const source = readFileSync(
      join(__dirname, '../gameDetailsFlowRegistration.ts'),
      'utf-8'
    )
    const stripped = stripComments(source)
    expect(stripped).not.toMatch(/backend\/ipc/)
    expect(stripped).not.toMatch(/from\s+['"]\.\.\/ipc['"]/)
    expect(stripped).not.toMatch(/ipc_handler/)
  })

  // ── Gates 5, 5-sanity and 6 (D-03 delegation shape / 19-channel census) were
  // REMOVED by Phase 35 Plan 14, the Electron cutover. Every one of them read
  // `src/backend/main.ts` from disk and asserted its registration shape; that file is
  // deleted in this same commit, so they would ENOENT rather than fail meaningfully.
  // They are not replaced: they constrained how the ELECTRON main process delegated to
  // `gamedetails/*`, and that process no longer exists. The sidecar's own equivalent
  // constraint is Gate 4 above, which is untouched. Recorded in `35-14-SUMMARY.md`
  // and as a deferred item so the lost assertions are reclaimable rather than forgotten.

  // ── Gate 7 (D-09 do-not-touch, WR-01 replacement): settingsFlowRegistration.ts
  // is pinned to a committed sha256 digest of its own byte content. This
  // replaces the prior HEAD-comparison gate, which compared the working tree
  // to `git show HEAD:<same path>` -- unconditionally true on any clean
  // checkout (the working tree IS HEAD by definition) and therefore
  // protecting nothing since the moment it was committed. No `git` subprocess
  // remains in this file; digest comparison needs none. ─────────────────────
  // Recomputed 2026-07-27 (Phase 34.4 Plan 03, REQ-34.4-06): this file
  // deliberately grew by two registrations, `getPrivateBranchPassword`/
  // `setPrivateBranchPassword` — the corrected GOG classification (not
  // Steam) of a pair the inventory's file-grouping had mis-filed under
  // "Steam". The D-09 bottle-launch fix these gates protect
  // (`steamLibrary.has(appName)` in `requestGameSettings`) is untouched;
  // see the semantic-pin test below for that direct proof.
  // Recomputed 2026-08-22 (IN-01, `34.2-REVIEW.md` round 1): COMMENT-ONLY
  // change. The `register*Flows()` docstring said "the two settings-read invoke
  // handlers" -- accurate at Phase 30 plan 06, stale by 10 channels once the
  // write side and the slice-6 diagnostics channels landed. Verified
  // comment-only before recomputing: HEAD and the working tree are byte-identical
  // after stripping block and line comments, so no registration, no argument and
  // no guard moved. The D-09 bottle-launch gate this digest exists to protect
  // (`steamLibrary.has(appName)` in `requestGameSettings`) is proven directly and
  // independently by the semantic-pin test below, which stayed green throughout.
  // Re-pinned 2026-08-29 by Phase 35 Plan 13 (D-02), per this gate's own documented
  // procedure. The ONLY change to the pinned file is ONE import specifier --
  // `from './platformApi'` became `from '../platform'` -- because that plan MOVED
  // `platform/index.ts` to `src/backend/platform/index.ts`. The import resolves to the
  // same module object it always did. No registration, no argument and no guard moved;
  // the D-09 bottle-launch fix (`steamLibrary.has(appName)` in `requestGameSettings`)
  // is untouched, and is proven directly and independently by the two semantic-pin tests
  // below, which stayed green throughout. Verified by
  // `git diff --stat -- src/backend/sidecar/settingsFlowRegistration.ts`:
  // 1 insertion, 1 deletion. Prior digest:
  // 43afa3fb9f2352ee25a13811958c017c4474445bc0ea468ce67ed29674087351
  // Re-pinned 2026-11-02 by Phase 59 Plan 25 (G17), per this gate's documented
  // procedure. The per-game write in `setSetting` changed from
  // `gameConfigs.get(appName).setSetting(key, value)` to
  // `applyGameSetting(appName, key, value)` (one retry, then logError), plus the one
  // import of `./gameSettingWrite`. No registration, channel or guard moved; the D-09
  // `steamLibrary.has(appName)` gate is untouched and still proven by the semantic
  // pins below. 2 insertions, 1 deletion. Prior digest:
  // b408ff7c38a5238b5c1c88eba9f63382294428246a290c0ef7602f48f0414862
  // quick-261107-a1j: rename-only re-pin (electronStores -> stores in a comment/import path).
  // Previous digest: 4c818e88579365b61da196d5f95975dcc785d5cf0e1cc3126f2ce8abfb209657
  // Phase 61 plan 06 (T-61-13): re-pin for the engineOverride write guard in setSetting and
  // writeConfig (isWritableEngineOverride import + two drop branches); the
  // `steamLibrary.has(appName)` gate is untouched. Prior digest:
  // 7120ad92f0f8e0121039685b327b2adb882a4e8f87743c9d80e7957ca86e2aa0
  // 66.1-19: re-pin -- registerSettingsFlows takes the kvs store slice by parameter and passes it
  // to GlobalConfig.setSetting/writeConfig (R3). No channel, guard or `steamLibrary.has` gate
  // moved. Prior digest: eeb736f040ead01b46da0e346748f6472ffd569c4773966a5e64c8c8a12dfa5b
  // 66.1-21: re-pin -- registerSettingsFlows takes the managers slice (library) instead of
  // importing libraryManagerMap, and drops the load-bearing side-effect `import '../storeManagers'`
  // (module-init order is owned by the boot graph now). No channel, guard or `steamLibrary.has`
  // gate moved. Prior digest: 9366f91f823f454cc865ff2b60c57d7032fbf7be604be2524648bd81d5b140b6
  // 66.1-22g: re-pin -- the getSystemInfo handler passes the managers' library slice to the
  // systeminfo version probes (no lazy storeManagers import). No channel, guard or
  // `steamLibrary.has` gate moved. Prior digest: 7ade63370cf4a5ebf0424b700da05d690e5a2823f16deffede7e631db69455d4
  // 66.2-02: re-pin -- registerSettingsFlows deps gain the boot `runner` slice (consumers
  // converted by 66.2-05). No channel, guard or `steamLibrary.has` gate moved. Prior digest:
  // 3f62bbb93755b547eff3f0f6666c1a2c0a842e05925d4f1d86b407540422a1a7
  // 66.2-05: re-pin -- the getSystemInfo handler passes `deps.runner` to the systeminfo
  // probes. No channel, guard or `steamLibrary.has` gate moved. Prior digest:
  // 23affb0e9558e3e0b2448176c05de58ae477a9a498cd95f1267027e8953d8cbc
  // 66.3-05: re-pin -- registerSettingsFlows deps gain config, gameConfigs and appInfo (the
  // getSystemInfo handler passes config/appInfo to the version probes). No channel, guard or
  // `steamLibrary.has` gate moved. Prior digest:
  // 0d549b1a8b521692f7aedae252417f87c7ec4c91d3c594d14383517131b3bda6
  // 66.3-09: re-pin -- the per-game write passes the registration's deps to
  // `applyGameSetting(deps, appName, key, value)` (gameSettingWrite now reads
  // `deps.gameConfigs` instead of the static `GameConfig.get`). One call-site token; no channel,
  // guard or `steamLibrary.has` gate moved. Prior digest:
  // 12848a5fa1c6b97029eb639186b763f943e9c0535674a7d092dda1c29fad9a60
  // 66.3-10: re-pin -- the registrations write into the injected `deps.ipc` instead of the shim's
  // `ipcMain`, and the global/per-game reads go through `deps.config` / `deps.gameConfigs`. No
  // channel, guard or `steamLibrary.has` gate moved. Prior digest:
  // 79431e0aef9012f479afdd0a2a90b0a802540acfb4689d29bccd512f82b48588
  // 66.3-13: re-pin -- the Steam library map is a boot-owned instance now, so the
  // `steamLibrary.has(appName)` gate moved to `deps.steamSession.libraryState.library.has(appName)`
  // (registerSettingsFlows deps gain the `steamSession` slice; the module import is gone). Same
  // predicate on the same map, no channel or guard moved; the semantic pin below tracks the new
  // spelling. Prior digest:
  // 769205ad0e807747e633cfee75a725f01ff185db708527a45a350639086f0f5e
  // 66.4-04: re-pin -- the getSystemInfo handler hands the boot's stores slice (`stores`, now
  // `Pick<Stores, 'kvs' | 'systemInfo'>`) to the systeminfo probes so the pci.ids caches come from
  // the boot's StoreRoot instead of a module-level CacheStore. Two insertions, one deletion; no
  // channel, guard or `steamLibrary.has` gate moved. Prior digest:
  // e94fb7155eb1572f4e28a031df8edac0251ad599fbeba20edef40126092332e0
  // 66.4-12: re-pin -- the getSystemInfo handler reads the boot-owned system-info cache
  // (`deps.infoCaches.systemInfo.getSystemInfo`, replacing the module-level getSystemInfo) and the
  // registerSettingsFlows deps gain `infoCaches` and `paths`. No channel, guard or
  // `steamLibrary.has` gate moved. Prior digest:
  // 5a3b10084911e383b9c8791239bd218702451d994c0cbbe5bddc11fd1c17719e
  const SETTINGS_FLOW_REGISTRATION_SHA256 =
    '4fed5097940f0c1149fd17fb93b85ccec41759ea221d68fedd8195801bc03082'

  it('REQ-34.2-10/D-09 Gate 7: settingsFlowRegistration.ts matches its committed sha256 digest', () => {
    const filePath = join(__dirname, '../settingsFlowRegistration.ts')
    const digest = createHash('sha256')
      .update(normaliseLineEndings(readFileSync(filePath, 'utf-8')))
      .digest('hex')

    // If this fails because the file was DELIBERATELY edited: this file
    // carries a shipped, hardware-proven bottle-launch fix
    // (`steamLibrary.has(appName)`, REQ-34.2-10 / D-09) that must never be
    // silently altered. Recompute deliberately
    // (`shasum -a 256 src/backend/sidecar/settingsFlowRegistration.ts`),
    // update SETTINGS_FLOW_REGISTRATION_SHA256 above, and state the reason in
    // the commit message -- never silently.
    expect(digest).toBe(SETTINGS_FLOW_REGISTRATION_SHA256)
  })

  // Semantic pin (Layer 2): the exact ten-channel set, parsed out of the
  // comment-stripped source -- survives a legitimate reformat (which changes
  // the digest but not the channel set) while still catching a rewrite.
  // Mirrors `longRunningChannels.test.ts`'s own exact-set idiom so both
  // silent widening and silent narrowing fail.
  const EXPECTED_SETTINGS_FLOW_CHANNELS = [
    'requestAppSettings',
    'setSetting',
    'writeConfig',
    'getMaxCpus',
    'showUpdateSetting',
    'getLogContent',
    'getSystemInfo',
    'hasExecutable',
    'isNative',
    'requestGameSettings',
    // Phase 34.4 Plan 03, REQ-34.4-06 — the GOG private-branch pair,
    // corrected out of the inventory's mis-filed "Steam" classification.
    'getPrivateBranchPassword',
    'setPrivateBranchPassword'
  ]

  it('REQ-34.2-10/D-09 Gate 7 semantic pin: settingsFlowRegistration.ts registers exactly these twelve channels', () => {
    const filePath = join(__dirname, '../settingsFlowRegistration.ts')
    const stripped = stripComments(readFileSync(filePath, 'utf-8'))
    const channelPattern = /deps\.ipc\.(?:handle|on)\(\s*['"]([^'"]+)['"]/g
    const found = new Set<string>()
    let match: RegExpExecArray | null
    while ((match = channelPattern.exec(stripped)) !== null) {
      found.add(defined(match[1], 'channel name'))
    }

    // Failure here means the registered channel set changed -- if
    // intentional (a REQ-34.2-10 / D-09 do-not-touch file), state the reason
    // in the commit, then update this list AND the sha256 digest above
    // together, never one without the other.
    expect(found.size).toBe(12)
    expect([...found].sort()).toEqual(
      [...EXPECTED_SETTINGS_FLOW_CHANNELS].sort()
    )
  })

  it('REQ-34.2-10/D-09 Gate 7 semantic pin: the requestGameSettings registration still contains the steam library `.has(` bottle-launch fix', () => {
    const filePath = join(__dirname, '../settingsFlowRegistration.ts')
    const stripped = stripComments(readFileSync(filePath, 'utf-8'))

    // Comment-stripped first so a docstring merely mentioning the library map
    // cannot satisfy this gate on its own -- this is the specific
    // Steam-detection workaround D-09 exists to protect (from the
    // `debug/steam-bottle-game-no-launch` investigation). 66.3-13: the map is
    // read through the boot-owned `steamSession.libraryState` slice.
    expect(stripped).toMatch(/steamSession\.libraryState\.library\.has\(/)
  })

  // ── Gate 8 (REQ-34.2-14 do-not-touch, WR-01 replacement): electronUntouched
  // .test.ts is pinned to a committed sha256 digest of its own byte content --
  // same replacement reasoning as Gate 7 above. ──────────────────────────────
  // Re-pinned 2026-08-29 by Phase 35 Plan 05 (D-04), per this gate's own documented procedure.
  // The ONLY change to the pinned file is ONE line — the mock specifier
  // `jest.mock('electron-store', ...)` became `jest.mock('backend/store_backend', ...)`, because
  // that plan removed the `electron-store` package outright. The factory body is byte-identical
  // and still redirects to `jest.requireActual('../fileStore').default`, so the suite exercises
  // exactly the same store implementation it did before. No assertion, fixture or proof was
  // altered, weakened or repurposed — the `safeStorage.isEncryptionAvailable` regression detector
  // and the configStore byte-identity comparisons are untouched. Verified by
  // `git diff -- src/backend/sidecar/__tests__/electronUntouched.test.ts`: 1 insertion,
  // 1 deletion. Prior digest:
  // a23b666f9c290364d1bab43df786ce5883ef3fcb95176506224f99d385561502
  //
  // Re-pinned 2026-08-14 by Phase 34.5 (F-34.5-G6-26). The ONLY change then was adding
  // `logDebug: jest.fn()` to its `backend/logger` mock (+3 lines, comment included).
  // Prior digest: 66645e8e33437a9da352619ce06b361450dcc78da294a6fc6161ef2cedc67f99
  // Re-pinned 2026-08-29 by Phase 35 Plan 13 (D-02), per this gate's own documented
  // procedure. The ONLY changes to the pinned file are TWO path repoints forced by the
  // MOVE of `platform/index.ts` to `src/backend/platform/index.ts`: the
  // `jest.mock('electron', ...)` factory specifier `'../platformApi'` -> `'../../platform'`,
  // and the by-construction gate's `readFileSync` path `'../platform/index.ts'` ->
  // `'../../platform/index.ts'`. Both still resolve to the SAME module and the SAME file
  // content -- the move was byte-preserving apart from four relative-import lines. No
  // assertion, fixture or proof was altered, weakened or repurposed: the
  // `safeStorage.isEncryptionAvailable` "always true" regression detector and the
  // configStore byte-identity comparisons are untouched. Verified by
  // `git diff --stat -- src/backend/sidecar/__tests__/electronUntouched.test.ts`:
  // 2 insertions, 2 deletions. Prior digest:
  // 2c0acfb5220a85702c0a7f33aafdae9eade1a2c4bec234d33980ab968e1f1105
  //
  // Re-pinned 2026-08-29 by Phase 35 Plan 18 (electron devDependency retirement), per this
  // gate's own documented procedure. The ONLY change to the pinned file is ONE line —
  // deletion of the vestigial `jest.mock('electron', () => jest.requireActual('../../platform'))`
  // line. This mock was already dead by construction: `configStore`/`tokenStore.ts` (the module
  // under test) import from `backend/platform` directly, not `electron`, ever since Plan 15's
  // migration, so this mock intercepted a specifier nobody required. Plan 18 retires the
  // `electron` devDependency outright, which would make this line throw "Cannot find module
  // 'electron'" at jest registration time — so it was deleted rather than repointed. No
  // assertion, fixture or proof was altered, weakened or repurposed: the
  // `safeStorage.isEncryptionAvailable` "always true" regression detector and the configStore
  // byte-identity comparisons are untouched. Verified by
  // `git diff --stat -- src/backend/sidecar/__tests__/electronUntouched.test.ts`: 1 deletion.
  // Prior digest: 132822ebc76da7db0ea8974e93547fd27ef6e04d5b095c6911878f09806d0335
  //
  // Re-pinned 2026-09-01 by quick task 260901-ud5 (Task 2, clearing the pre-push prettier
  // gate). The ONLY change to the pinned file is `prettier --write`'s reformatting — line
  // wraps and indentation only, applied because this file was one of the 46 flagged by
  // `prettier --check .`. No assertion, fixture or proof was altered, weakened or
  // repurposed: the `safeStorage.isEncryptionAvailable` "always true" regression detector
  // and the configStore byte-identity comparisons are untouched. Verified by
  // `git diff --stat -- src/backend/sidecar/__tests__/electronUntouched.test.ts`: 4
  // insertions, 1 deletion, and a byte-for-byte review of the diff (whitespace/line-break
  // only). Prior digest:
  // 39e68ed1845d05a1cbc74739b0e86b5289531914c384fbad6638efefb060ce91
  //
  // Re-pinned 2026-09-09 by quick task 260909-iz2, per this gate's own documented procedure.
  // Narrowed the by-construction gate (T-28-01) from a bare `configStore` substring ban to a
  // binding-level check (D-04): added `findSteamTokenSurfaceViolations` plus its
  // `steam token surface binding gate helper` guard describe (proving the narrowing still
  // trips on real Steam-token-surface violations, including aliased ones, and no longer
  // convicts bootstrap.ts's unrelated Epic/GOG `constants/key_value_stores` import), rewired
  // the by-construction `it` onto that helper, and updated the module docstring's closing
  // paragraph to describe the new binding-level contract. No assertion was weakened: the
  // `safeStorage.isEncryptionAvailable` "always true" regression detector and the configStore
  // byte-identity comparisons in the rest of the file are untouched, and the by-construction
  // gate still asserts (against a check that is narrower in NAME-BAN but not narrower in what
  // it can catch -- the specifier scope is exhaustively enumerated). Verified by
  // `git diff --stat -- src/backend/sidecar/__tests__/electronUntouched.test.ts` across both
  // task commits. Prior digest:
  // 5e8bbe4f27c24d29910a1aa63ecb99e577451da900a65515f5fbd52722d4871b
  // quick-261107-a1j: rename-only re-pin (electronStores -> stores path references).
  // Previous digest: 466327c30fca5097b24ec36fafadfe6b7d620175869c7e2e8bad5fa4ce7e874e
  //
  // Re-pinned 2026-11-08 by quick task 261108-et5, per this gate's own documented procedure.
  // noUncheckedIndexedAccess adoption: type-narrowing only (`defined(...)` around regex-group
  // reads in the binding-gate helpers). No assertion, fixture or proof was altered or
  // weakened. Prior digest:
  // da9dda5ab90b78820eed3bd11b3d7669245eaa8c7952e674949a6fc041653348
  // Phase 72 plan 05 (D-12): ElectronTokenStore deleted; the seam test now restores the
  // previously active store instead of constructing one. Prior digest:
  // f97f2b6ef9300c575bf0738ec33a76cf0e95a430bd299c81d6198c7effdc87aa
  // 66.1 plan 25: steam/stores.ts became a factory, so the seam test builds its own
  // `configStore` with createSteamStores (the byte-identity assertions are unchanged). Prior
  // digest: 2b2ff1eb32a9ecfda83532fc1435bf1b4c91ed24accc2858b13fc78676265b24
  // 66.3 plan 18: `backend/platform` was deleted, and with it the `safeStorage` stub the file's
  // last by-construction gate ("safeStorage.isEncryptionAvailable never regresses to the
  // 'always true' lie") read from `platform/index.ts`. That gate guarded a file and a member
  // that no longer exist, so it was removed (not weakened) together with a comment that named
  // the deleted module; the keyring and configStore byte-identity proofs are untouched. Prior
  // digest: 6e5b93958cc11a371e379da76bb261502509faa62481fa401c69c272e856773c
  // 66.4-04: re-pin -- the steam stores family is built against a per-boot StoreRoot, so the
  // file's one `createSteamStores({ registry })` call gains `root: createTestStoreRoot()` and one
  // import. No assertion, fixture or proof was altered or weakened. Prior digest:
  // f8a84193a4907c3332068e8cd12dad7458c4c0175c7cca14ee0e82b62b7d0950
  //
  // 66.4-07: re-pin -- the Steam token store is a boot-owned slot, so the one seam proof builds
  // `createTokenStoreSlot()` and drives `configure` / `current` in place of the removed
  // `setTokenStore` / `getTokenStore` free functions. Same calls, same byte-identity assertions.
  // Prior digest: b582276b5f3f42c0b4385c504f6719585c9d6e1d3ef0dd9083efca6067c0d9ca
  const ELECTRON_UNTOUCHED_SHA256 =
    '13a12594b7e2ea11a6895cd5bacdd3e89924a87a0cf35b4e7bec864a32301a76'

  it('REQ-34.2-14 Gate 8: electronUntouched.test.ts matches its committed sha256 digest', () => {
    const filePath = join(__dirname, 'electronUntouched.test.ts')
    const digest = createHash('sha256')
      .update(normaliseLineEndings(readFileSync(filePath, 'utf-8')))
      .digest('hex')

    // If this fails because the file was DELIBERATELY edited: this is Phase
    // 28's keyring/`configStore` byte-identity proof (REQ-34.2-14
    // do-not-touch) -- the file that detects a regression to the
    // `safeStorage.isEncryptionAvailable` "always true" lie. Weakening or
    // repurposing it must happen openly, never silently. Recompute
    // deliberately
    // (`shasum -a 256 src/backend/sidecar/__tests__/electronUntouched.test.ts`),
    // update ELECTRON_UNTOUCHED_SHA256 above, and state the reason in the
    // commit message.
    expect(digest).toBe(ELECTRON_UNTOUCHED_SHA256)
  })
})
