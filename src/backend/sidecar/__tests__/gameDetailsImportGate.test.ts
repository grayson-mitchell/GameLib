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

// Comment-stripping now delegates to the shared
// `backend/testUtils/stripSourceComments` util (strips block comments first,
// then the line-prefix filter), imported above as `stripComments`.

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name)
}

const MAIN_TS_PATH = join(__dirname, '../../main.ts')

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
      "// this comment intentionally says: from 'electron'",
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

  // ── Gate 5: D-03 delegation shape — main.ts imports the extracted
  // gamedetails/* modules and every one of the slice's 19 registration
  // lines delegates to an imported function, never an inline reimplemented
  // body ───────────────────────────────────────────────────────────────────
  it('REQ-34.2-03/D-03 Gate 5: main.ts imports ./gamedetails/dispatch and ./gamedetails/overrides', () => {
    const stripped = stripComments(readFileSync(MAIN_TS_PATH, 'utf-8'))
    expect(stripped).toMatch(/from\s+['"]\.\/gamedetails\/dispatch['"]/)
    expect(stripped).toMatch(/from\s+['"]\.\/gamedetails\/overrides['"]/)
  })

  // Table-driven: every one of the slice's 19 main.ts registration lines,
  // enumerated by channel, so a single missed conversion (an inline body
  // left behind, or a delegation quietly reverted) names itself in the test
  // output rather than hiding inside one large assertion.
  const DELEGATION_SHAPE_TABLE: [name: string, pattern: RegExp][] = [
    [
      'getGameOverride',
      /addHandler\(\s*['"]getGameOverride['"]\s*,\s*async\s*\(\)\s*=>\s*getGameOverride\(\)\s*\)/
    ],
    [
      'getGameSdl',
      /addHandler\(\s*['"]getGameSdl['"]\s*,\s*async\s*\([^)]*\)\s*=>\s*getGameSdl\(appName\)\s*\)/
    ],
    [
      'isGameAvailable',
      /addHandler\(\s*['"]isGameAvailable['"]\s*,\s*async\s*\([^)]*\)\s*=>\s*isGameAvailable\(args\)\s*\)/
    ],
    [
      'getGameInfo',
      /addHandler\(\s*['"]getGameInfo['"]\s*,\s*async\s*\([^)]*\)\s*=>\s*getGameInfo\(appName,\s*runner\)\s*\)/
    ],
    [
      'getExtraInfo',
      /addHandler\(\s*['"]getExtraInfo['"]\s*,\s*async\s*\([^)]*\)\s*=>\s*getExtraInfo\(appName,\s*runner\)\s*\)/
    ],
    [
      'getGameSettings',
      /addHandler\(\s*['"]getGameSettings['"]\s*,\s*async\s*\([^)]*\)\s*=>\s*getGameSettings\(appName,\s*runner\)\s*\)/
    ],
    [
      'readConfig',
      /addHandler\(\s*['"]readConfig['"]\s*,\s*async\s*\([^)]*\)\s*=>\s*readConfig\(configClass\)\s*\)/
    ],
    [
      'repair',
      /addHandler\(\s*['"]repair['"]\s*,\s*async\s*\([^)]*\)\s*=>\s*repair\(appName,\s*runner\)\s*\)/
    ],
    [
      'kill',
      /addHandler\(\s*['"]kill['"]\s*,\s*async\s*\([^)]*\)\s*=>\s*kill\(appName,\s*runner\)\s*\)/
    ],
    [
      'changeInstallPath',
      /addHandler\(\s*['"]changeInstallPath['"]\s*,\s*async\s*\([^)]*\)\s*=>\s*changeInstallPath\(args\)\s*\)/
    ],
    [
      'getLaunchOptions',
      /addHandler\(\s*['"]getLaunchOptions['"]\s*,\s*async\s*\([^)]*\)\s*=>\s*getLaunchOptions\(appName,\s*runner\)\s*\)/
    ],
    [
      'addNewApp',
      /addListener\(\s*['"]addNewApp['"]\s*,\s*\([^)]*\)\s*=>\s*addNewApp\(args\)\s*\)/
    ],
    [
      'setGameMetadataOverride',
      /addListener\(\s*['"]setGameMetadataOverride['"]\s*,\s*\([^)]*\)\s*=>\s*setGameMetadataOverride\(args\)\s*\)/
    ],
    [
      'getGameMetadataOverride',
      /addHandler\(\s*['"]getGameMetadataOverride['"]\s*,\s*async\s*\([^)]*\)\s*=>\s*\{\s*return\s+getGameOverrides\(appName\)\s*\}\s*\)/
    ],
    [
      'getAllGameOverrides',
      /addHandler\(\s*['"]getAllGameOverrides['"]\s*,\s*async\s*\(\)\s*=>\s*\{\s*return\s+getAllGameOverrides\(\)\s*\}\s*\)/
    ],
    [
      'getAvailableCyberpunkMods',
      /addHandler\(\s*['"]getAvailableCyberpunkMods['"]\s*,\s*async\s*\(\)\s*=>\s*getAvailableCyberpunkMods\(\)\s*\)/
    ],
    [
      'setCyberpunkModConfig',
      /addHandler\(\s*['"]setCyberpunkModConfig['"]\s*,\s*async\s*\([^)]*\)\s*=>\s*setCyberpunkModConfig\(props\)\s*\)/
    ],
    [
      'changeGameVersionPinnedStatus',
      /addListener\(\s*['"]changeGameVersionPinnedStatus['"]\s*,\s*\([^)]*\)\s*=>\s*changeGameVersionPinnedStatus\(appName,\s*runner,\s*status\)\s*\)/
    ],
    [
      'getKnownFixes',
      /addHandler\(\s*['"]getKnownFixes['"]\s*,\s*\([^)]*\)\s*=>\s*readKnownFixes\(appName,\s*runner\)\s*\)/
    ]
  ]

  it('REQ-34.2-03/D-03 Gate 5 sanity: the delegation-shape table enumerates all 19 channels', () => {
    expect(DELEGATION_SHAPE_TABLE).toHaveLength(19)
  })

  it.each(DELEGATION_SHAPE_TABLE)(
    'REQ-34.2-03/D-03 Gate 5: main.ts delegates channel "%s" to its imported function (not an inline body)',
    (_name, pattern) => {
      const stripped = stripComments(readFileSync(MAIN_TS_PATH, 'utf-8'))
      expect(stripped).toMatch(pattern)
    }
  )

  // ── Gate 6: transport-kind gate — the 3 send-kind channels are
  // addListener, the 16 invoke-kind channels are addHandler, in main.ts.
  // A silent kind flip here would desynchronise Electron from the sidecar
  // registrations with no runtime signal (Phase 31 Pitfall 2) ───────────────
  const SEND_KIND_CHANNELS = [
    'setGameMetadataOverride',
    'changeGameVersionPinnedStatus',
    'addNewApp'
  ]
  const INVOKE_KIND_CHANNELS = [
    'getGameInfo',
    'getExtraInfo',
    'getGameSettings',
    'isGameAvailable',
    'getLaunchOptions',
    'kill',
    'repair',
    'changeInstallPath',
    'readConfig',
    'getGameOverride',
    'getGameSdl',
    'getAvailableCyberpunkMods',
    'setCyberpunkModConfig',
    'getGameMetadataOverride',
    'getAllGameOverrides',
    'getKnownFixes'
  ]

  it('REQ-34.2-01 Gate 6 sanity: 3 send-kind + 16 invoke-kind channels account for all 19', () => {
    expect(SEND_KIND_CHANNELS).toHaveLength(3)
    expect(INVOKE_KIND_CHANNELS).toHaveLength(16)
    expect(SEND_KIND_CHANNELS.length + INVOKE_KIND_CHANNELS.length).toBe(19)
  })

  it.each(SEND_KIND_CHANNELS)(
    'REQ-34.2-01 Gate 6: main.ts registers send-kind channel "%s" with addListener, never addHandler',
    (channel) => {
      const stripped = stripComments(readFileSync(MAIN_TS_PATH, 'utf-8'))
      expect(stripped).toMatch(
        new RegExp(`addListener\\(\\s*['"]${channel}['"]`)
      )
      expect(stripped).not.toMatch(
        new RegExp(`addHandler\\(\\s*['"]${channel}['"]`)
      )
    }
  )

  it.each(INVOKE_KIND_CHANNELS)(
    'REQ-34.2-01 Gate 6: main.ts registers invoke-kind channel "%s" with addHandler, never addListener',
    (channel) => {
      const stripped = stripComments(readFileSync(MAIN_TS_PATH, 'utf-8'))
      expect(stripped).toMatch(
        new RegExp(`addHandler\\(\\s*['"]${channel}['"]`)
      )
      expect(stripped).not.toMatch(
        new RegExp(`addListener\\(\\s*['"]${channel}['"]`)
      )
    }
  )

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
  const SETTINGS_FLOW_REGISTRATION_SHA256 =
    '5cc3245e06290db1f7754a7579db862dee5956a893315c21dbf934381ce99ee1'

  it('REQ-34.2-10/D-09 Gate 7: settingsFlowRegistration.ts matches its committed sha256 digest', () => {
    const filePath = join(__dirname, '../settingsFlowRegistration.ts')
    const digest = createHash('sha256')
      .update(readFileSync(filePath))
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
  // Re-pinned 2026-08-14 by Phase 34.5 (F-34.5-G6-26), per this gate's own documented procedure.
  // The ONLY change to the pinned file was adding `logDebug: jest.fn()` to its `backend/logger`
  // mock (+3 lines, comment included): `SidecarKeyringSlotStore` gained DEBUG cache-hit lines, and
  // this suite drives that class directly, so an incomplete mock made every cached read throw
  // `logDebug is not a function`. No assertion, fixture or proof in the pinned file was altered,
  // weakened or repurposed — the `safeStorage.isEncryptionAvailable` regression detector and the
  // configStore byte-identity comparisons are untouched. Prior digest:
  // 66645e8e33437a9da352619ce06b361450dcc78da294a6fc6161ef2cedc67f99
  const ELECTRON_UNTOUCHED_SHA256 =
    'a23b666f9c290364d1bab43df786ce5883ef3fcb95176506224f99d385561502'

  it('REQ-34.2-14 Gate 8: electronUntouched.test.ts matches its committed sha256 digest', () => {
    const filePath = join(__dirname, 'electronUntouched.test.ts')
    const digest = createHash('sha256')
      .update(readFileSync(filePath))
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
