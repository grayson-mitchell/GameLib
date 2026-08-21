/**
 * Phase 34.4.2 Plan 05, Task 1 (REQ-34.4.2-07): a machine guard that the DummyStore OAuth test
 * harness (`.claude/skills/spike-findings-gamelib/sources/019-dummy-oauth-store/store-server.mjs`,
 * spike 019) can never reach a shipped build. The harness is a zero-dependency, in-memory OAuth
 * provider with HARDCODED demo credentials (`demo` / `dummy-store-pw`), printed on its own login
 * form -- it exists purely so login-window UX work (modal attachment, autofill affordances) can be
 * developed and regression-tested offline, against a fixture spikes 020/021/022 all reused. It must
 * never ship.
 *
 * Tests 1-4 are NEGATIVE: no shipped source, packaging manifest, or Tauri bundle config may
 * reference the harness's own path or its port literal (17940). Test 5 is a POSITIVE anchor --
 * without it, Tests 1-4 could pass vacuously if the harness were renamed, moved, or deleted (a
 * containment suite made only of "X is absent" assertions proves nothing about X once X no longer
 * exists at the path being checked). Test 6 asserts the harness itself binds loopback only, so a
 * developer running it locally is not exposing a demo-credentialed OAuth server to the LAN.
 *
 * THIS FILE is deliberately excluded from its own Test 1/Test 2 walk -- this module's own path and
 * prose necessarily contain both forbidden substrings (in this docblock, in the harness path
 * constant, and in the port literal used by Test 5/6's own assertions). That exclusion is
 * deliberate, not a loophole: Tests 1/2 exist to catch a reference reaching PRODUCTION source, and
 * this file's own presence under `src/backend/__tests__/` is itself a test artifact, not shipped
 * code.
 *
 * Mutation-checked (recorded verbatim in `34.4.2-05-SUMMARY.md`): a comment containing `17940` was
 * temporarily added to a file under `src/backend/`, confirmed to fail Test 2 with the offending
 * path named in the failure message, then reverted.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const SRC_DIR = join(REPO_ROOT, 'src')
const SRC_TAURI_SRC_DIR = join(REPO_ROOT, 'src-tauri', 'src')
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json')
const TAURI_CONF_PATH = join(REPO_ROOT, 'src-tauri', 'tauri.conf.json')
const HARNESS_PATH = join(
  REPO_ROOT,
  '.claude',
  'skills',
  'spike-findings-gamelib',
  'sources',
  '019-dummy-oauth-store',
  'store-server.mjs'
)

const HARNESS_PATH_STRING = '019-dummy-oauth-store'
const HARNESS_PORT_STRING = '17940'

// This file's own absolute path -- excluded from every walk below (see the module docblock's
// "THIS FILE is deliberately excluded" note).
const SELF_PATH = resolve(__filename)

/**
 * Every regular file under `dir`, recursively, skipping `node_modules` and any `__snapshots__`
 * directory. Returns absolute paths. No extension filter -- the forbidden strings could appear in
 * any file type reachable from `src/`, and a filter that only checked `.ts` would miss a JSON,
 * markdown, or asset file carrying either literal.
 */
function listAllFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir)
  let files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '__snapshots__') continue
      files = files.concat(listAllFilesRecursive(fullPath))
    } else {
      files.push(fullPath)
    }
  }
  return files
}

/**
 * Returns every file (from `listAllFilesRecursive(dir)`, excluding `SELF_PATH`) whose contents
 * contain `needle`, paired with the needle -- so a failing assertion's message names the offending
 * path instead of a bare `toBe(0)` on a count, which is useless when it actually fires.
 */
function filesContaining(dir: string, needle: string): string[] {
  const offenders: string[] = []
  for (const filePath of listAllFilesRecursive(dir)) {
    if (resolve(filePath) === SELF_PATH) continue
    let contents: string
    try {
      contents = readFileSync(filePath, 'utf-8')
    } catch {
      // Unreadable as a file (e.g. a broken symlink) -- not a source of the forbidden string.
      continue
    }
    if (contents.includes(needle)) {
      offenders.push(filePath)
    }
  }
  return offenders
}

describe('DummyStore harness containment (Phase 34.4.2 Plan 05, REQ-34.4.2-07, T-34.4.2-23/-24)', () => {
  test('Test 1: no file under src/ references the harness path (019-dummy-oauth-store)', () => {
    const offenders = filesContaining(SRC_DIR, HARNESS_PATH_STRING)
    expect(
      offenders.length === 0
        ? []
        : [
            `references found in: ${offenders.map((f) => f.replace(REPO_ROOT + '/', '')).join(', ')}`
          ]
    ).toEqual([])
  })

  test('Test 2: no file under src/ or src-tauri/src/ references the port literal 17940', () => {
    const offenders = [
      ...filesContaining(SRC_DIR, HARNESS_PORT_STRING),
      ...filesContaining(SRC_TAURI_SRC_DIR, HARNESS_PORT_STRING)
    ]
    expect(
      offenders.length === 0
        ? []
        : [
            `references found in: ${offenders.map((f) => f.replace(REPO_ROOT + '/', '')).join(', ')}`
          ]
    ).toEqual([])
  })

  test('Test 3: package.json (whole file) contains neither the harness path nor its port literal', () => {
    const contents = readFileSync(PACKAGE_JSON_PATH, 'utf-8')
    expect(contents).not.toContain(HARNESS_PATH_STRING)
    expect(contents).not.toContain(HARNESS_PORT_STRING)
  })

  test('Test 4: src-tauri/tauri.conf.json contains neither literal, and its bundle resource/externalBin lists carry no .claude/ path', () => {
    const raw = readFileSync(TAURI_CONF_PATH, 'utf-8')
    expect(raw).not.toContain(HARNESS_PATH_STRING)
    expect(raw).not.toContain(HARNESS_PORT_STRING)

    const parsed = JSON.parse(raw) as {
      bundle?: { resources?: unknown; externalBin?: string[] }
    }
    const externalBin = parsed.bundle?.externalBin ?? []
    for (const entry of externalBin) {
      expect(entry.startsWith('.claude/')).toBe(false)
      expect(entry).not.toContain('.claude/')
    }
    const resources = parsed.bundle?.resources
    if (Array.isArray(resources)) {
      for (const entry of resources) {
        expect(String(entry)).not.toContain('.claude/')
      }
    } else if (resources && typeof resources === 'object') {
      for (const key of Object.keys(resources as Record<string, unknown>)) {
        expect(key).not.toContain('.claude/')
      }
    }
  })

  test('Test 5 (POSITIVE anchor): the harness file exists at the expected path and binds loopback only -- proves the guard is checking a real target, not a renamed/deleted one', () => {
    expect(existsSync(HARNESS_PATH)).toBe(true)
    const source = readFileSync(HARNESS_PATH, 'utf-8')
    expect(source).toContain("listen(PORT, '127.0.0.1'")
  })

  test('Test 6: the harness source contains no 0.0.0.0 and no bare single-argument .listen(PORT) form (either would bind all interfaces)', () => {
    const source = readFileSync(HARNESS_PATH, 'utf-8')
    expect(source).not.toContain('0.0.0.0')
    expect(source).not.toMatch(/\.listen\(\s*PORT\s*\)/)
  })
})
