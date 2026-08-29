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
 * scoped to `keyringTokenStore.ts`/`bootstrap.ts`/`electronStub.ts`. It makes
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
      "import { ipcMain } from './electronStub'"
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
  // `from './electronStub'` became `from '../platform'` -- because that plan MOVED
  // `electronStub.ts` to `src/backend/platform/index.ts`. The import resolves to the
  // same module object it always did. No registration, no argument and no guard moved;
  // the D-09 bottle-launch fix (`steamLibrary.has(appName)` in `requestGameSettings`)
  // is untouched, and is proven directly and independently by the two semantic-pin tests
  // below, which stayed green throughout. Verified by
  // `git diff --stat -- src/backend/sidecar/settingsFlowRegistration.ts`:
  // 1 insertion, 1 deletion. Prior digest:
  // 43afa3fb9f2352ee25a13811958c017c4474445bc0ea468ce67ed29674087351
  const SETTINGS_FLOW_REGISTRATION_SHA256 =
    'b408ff7c38a5238b5c1c88eba9f63382294428246a290c0ef7602f48f0414862'

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
    const channelPattern = /ipcMain\.(?:handle|on)\(\s*['"]([^'"]+)['"]/g
    const found = new Set<string>()
    let match: RegExpExecArray | null
    while ((match = channelPattern.exec(stripped)) !== null) {
      found.add(match[1])
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

  it('REQ-34.2-10/D-09 Gate 7 semantic pin: the requestGameSettings registration still contains the steamLibrary.has( bottle-launch fix', () => {
    const filePath = join(__dirname, '../settingsFlowRegistration.ts')
    const stripped = stripComments(readFileSync(filePath, 'utf-8'))

    // Comment-stripped first so a docstring merely mentioning `steamLibrary`
    // cannot satisfy this gate on its own -- this is the specific
    // Steam-detection workaround D-09 exists to protect (from the
    // `debug/steam-bottle-game-no-launch` investigation).
    expect(stripped).toMatch(/steamLibrary\.has\(/)
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
  // MOVE of `electronStub.ts` to `src/backend/platform/index.ts`: the
  // `jest.mock('electron', ...)` factory specifier `'../electronStub'` -> `'../../platform'`,
  // and the by-construction gate's `readFileSync` path `'../electronStub.ts'` ->
  // `'../../platform/index.ts'`. Both still resolve to the SAME module and the SAME file
  // content -- the move was byte-preserving apart from four relative-import lines. No
  // assertion, fixture or proof was altered, weakened or repurposed: the
  // `safeStorage.isEncryptionAvailable` "always true" regression detector and the
  // configStore byte-identity comparisons are untouched. Verified by
  // `git diff --stat -- src/backend/sidecar/__tests__/electronUntouched.test.ts`:
  // 2 insertions, 2 deletions. Prior digest:
  // 2c0acfb5220a85702c0a7f33aafdae9eade1a2c4bec234d33980ab968e1f1105
  const ELECTRON_UNTOUCHED_SHA256 =
    '132822ebc76da7db0ea8974e93547fd27ef6e04d5b095c6911878f09806d0335'

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
