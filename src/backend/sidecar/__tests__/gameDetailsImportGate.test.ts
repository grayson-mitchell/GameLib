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

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/** Strips `//`, `/* ... *\/`-continuation, and `*`-prefixed docblock lines
 * before matching, so an explanatory comment naming a forbidden pattern does
 * not fail its own gate (mirrors `appShellImportGate.test.ts`'s own
 * `stripComments`). */
function stripComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
}

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name)
}

const REPO_ROOT = join(__dirname, '../../../..')
const MAIN_TS_PATH = join(__dirname, '../../main.ts')

describe('gameDetailsImportGate (Phase 34.2 Plan 04 — REQ-34.2-01/REQ-34.2-03/REQ-34.2-10/REQ-34.2-14)', () => {
  // ── Gate 1: no file directly under src/backend/sidecar/ imports the real
  // 'electron' module ─────────────────────────────────────────────────────
  it("REQ-34.2-14 Gate 1: no .ts file directly under src/backend/sidecar/ imports the real electron module", () => {
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

  // ── Gate 7 (D-09 do-not-touch): settingsFlowRegistration.ts is
  // byte-identical to its committed HEAD version ─────────────────────────────
  it('REQ-34.2-10 Gate 7: settingsFlowRegistration.ts is byte-identical to the committed HEAD version', () => {
    const filePath = join(__dirname, '../settingsFlowRegistration.ts')
    const working = readFileSync(filePath, 'utf-8')

    let headContent: string | null = null
    try {
      headContent = execFileSync(
        'git',
        ['show', 'HEAD:src/backend/sidecar/settingsFlowRegistration.ts'],
        { cwd: REPO_ROOT, encoding: 'utf-8' }
      )
    } catch {
      // Git comparison impractical in this environment (e.g. no .git, shallow
      // checkout without the blob) — fall back to the file's own known
      // bottle-fix marker strings, per this plan's own instruction.
      headContent = null
    }

    if (headContent !== null) {
      expect(working).toBe(headContent)
    } else {
      expect(working).toMatch(/steamLibrary/)
      expect(working).toMatch(/requestGameSettings/)
    }
  })

  // ── Gate 8 (REQ-34.2-14 do-not-touch): electronUntouched.test.ts is
  // byte-identical to its committed HEAD version ─────────────────────────────
  it('REQ-34.2-14 Gate 8: electronUntouched.test.ts is byte-identical to the committed HEAD version', () => {
    const filePath = join(__dirname, 'electronUntouched.test.ts')
    const working = readFileSync(filePath, 'utf-8')

    let headContent: string | null = null
    try {
      headContent = execFileSync(
        'git',
        [
          'show',
          'HEAD:src/backend/sidecar/__tests__/electronUntouched.test.ts'
        ],
        { cwd: REPO_ROOT, encoding: 'utf-8' }
      )
    } catch {
      headContent = null
    }

    if (headContent !== null) {
      expect(working).toBe(headContent)
    } else {
      expect(working).toMatch(/STRICTLY READ-ONLY/)
      expect(working).toMatch(
        /keyringTokenStore\.ts and bootstrap\.ts never reference configStore/
      )
      expect(working).toMatch(
        /safeStorage\.isEncryptionAvailable never regresses to the "always true" lie/
      )
    }
  })
})
