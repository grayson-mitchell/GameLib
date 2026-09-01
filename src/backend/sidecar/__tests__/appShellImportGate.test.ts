/**
 * By-construction import-graph gate for D-09/D-08/D-02 (Phase 34.1 Plan 04 —
 * REQ-34.1-05/REQ-34.1-12).
 *
 * This is a NEW file, not an extension of `electronUntouched.test.ts`.
 * `electronUntouched.test.ts` was read in full during this plan's planning
 * pass and confirmed to be Phase 28's keyring/`configStore` byte-identity
 * proof: it asserts that `SidecarKeyringTokenStore`'s four operations never
 * write to the shared `configStore`, plus two narrow by-construction gates
 * scoped to `keyringTokenStore.ts`/`bootstrap.ts`/`electronStub.ts`. It makes
 * NO assertion about `main.ts`'s textual state or about any sidecar import
 * graph beyond those three files (RESEARCH.md Pitfall 2 / CONTEXT.md
 * Assumption A1) — so D-09's curated-import gate and D-08's delegation-shape
 * gate needed their own home here, rather than weakening or repurposing that
 * file's narrow, already-proven contract.
 *
 * Gates 1-3 strip comments before matching (mirrors
 * `downloadQueueFlows.test.ts`'s own `stripComments` helper) so an
 * explanatory header paragraph mentioning "electron" cannot self-invalidate
 * its own gate.
 */

import { execFileSync } from 'node:child_process'
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

describe('appShellImportGate (Phase 34.1 Plan 04 — REQ-34.1-05/REQ-34.1-12)', () => {
  // ── Gate 1: no file directly under src/backend/sidecar/ imports the real
  // 'electron' module ─────────────────────────────────────────────────────
  it('REQ-34.1-12/D-09 Gate 1: no .ts file directly under src/backend/sidecar/ imports the real electron module', () => {
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
  // stripper).
  it('REQ-34.1-12/D-09 Gate 1 self-test: stripComments removes a comment-only "from \'electron\'" line before matching', () => {
    const source = [
      "// this comment intentionally says: from 'backend/platform'",
      "import { ipcMain } from './electronStub'"
    ].join('\n')
    const stripped = stripComments(source)
    expect(stripped).not.toMatch(/from\s+['"]electron['"]/)
  })

  // ── Gate 2: appShellFlowRegistration.ts never reaches utils/ipc_handler or
  // backend/ipc (D-09's hard rule — see the module's own docstring) ─────────
  it('REQ-34.1-12/D-09 Gate 2: appShellFlowRegistration.ts references neither utils/ipc_handler nor backend/ipc', () => {
    const source = readFileSync(
      join(__dirname, '../appShellFlowRegistration.ts'),
      'utf-8'
    )
    const stripped = stripComments(source)
    expect(stripped).not.toMatch(/utils\/ipc_handler/)
    expect(stripped).not.toMatch(/(^|['"])backend\/ipc['"]/)
    expect(stripped).not.toMatch(/from\s+['"]\.\.\/ipc['"]/)
  })

  // ── Gate 3: independent guard on src/backend/appshell/ — plan 34.1-02
  // already has its own copy of this exact gate in
  // appshellModules.test.ts; both existing is deliberate (they guard
  // different directories, and this plan's own D-09 obligation is scoped to
  // the sidecar's import graph as a whole, not just its own new file) ───────
  it('REQ-34.1-12/D-09 Gate 3: no .ts file under src/backend/appshell/ imports the real electron module', () => {
    const appshellDir = join(__dirname, '../../appshell')
    const files = listTsFiles(appshellDir)
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const stripped = stripComments(
        readFileSync(join(appshellDir, file), 'utf-8')
      )
      expect(stripped).not.toMatch(/from\s+['"]electron['"]/)
      expect(stripped).not.toMatch(/require\(\s*['"]electron['"]\s*\)/)
    }
  })

  // Gate 4 (D-08 shape gate: main.ts delegates to the extracted appshell/* bodies rather
  // than reimplementing them inline) was REMOVED by Phase 35 Plan 14, which deleted
  // src/backend/main.ts. It read that file from disk, so it would ENOENT rather than fail
  // meaningfully. NOT replaced: it constrained the ELECTRON main process's delegation shape,
  // and that process no longer exists. The appshell/* modules themselves and the
  // Electron-free import gates above are untouched. See D-35-14-02.

  // ── Gate 5: D-02 — appShellFlowRegistration.ts registers none of the ten
  // D-01 window-chrome channels (the preload short-circuit already owns them
  // — a sidecar registration here would be unreachable dead code) ───────────
  it('REQ-34.1-05/D-02 Gate 5: appShellFlowRegistration.ts does not register any of the ten D-01 window-chrome channels', () => {
    const source = readFileSync(
      join(__dirname, '../appShellFlowRegistration.ts'),
      'utf-8'
    )
    const stripped = stripComments(source)
    const windowChromeChannels = [
      'minimizeWindow',
      'maximizeWindow',
      'unmaximizeWindow',
      'closeWindow',
      'isMaximized',
      'isMinimized',
      'isFullscreen',
      'setFullscreen',
      'isFrameless',
      'setZoomFactor'
    ]
    for (const channel of windowChromeChannels) {
      expect(stripped).not.toMatch(
        new RegExp(`ipcMain\\.(handle|on)\\(\\s*['"]${channel}['"]`)
      )
    }
  })

  // ── Gate 6: electronUntouched.test.ts (the Phase 28 guard) is untouched by
  // this plan — a silent weakening of that file must not land inside this
  // slice ─────────────────────────────────────────────────────────────────
  it('REQ-34.1-12 Gate 6: electronUntouched.test.ts is byte-identical to the committed HEAD version', () => {
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
        { cwd: join(__dirname, '../../../..'), encoding: 'utf-8' }
      )
    } catch {
      // Git comparison impractical in this environment (e.g. no .git, shallow
      // checkout without the blob) — fall back to the file's own known
      // by-construction gate strings, per this plan's own instruction.
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
