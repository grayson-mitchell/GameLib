/**
 * Phase 34.2 Plan 06, Task 2 (D-10, REQ-34.2-12): pins `src-tauri/src/main.rs`'s
 * `LONG_RUNNING_CHANNELS` exemption list against silent drift in EITHER
 * direction, and pins `INVOKE_TIMEOUT` at 60s so the D-10 boundary is never
 * "solved" by raising the global bound instead of exempting a specific
 * channel.
 *
 * Extends the Wave-0 config-shape convention (`tauriConf.test.ts`,
 * `tauriShellSource.test.ts`) to this specific array. All assertions run
 * against a COMMENT-STRIPPED copy of the source — the doc comment above
 * `LONG_RUNNING_CHANNELS` necessarily NAMES every channel discussed here
 * (including, as of this plan, `getCrossoverIndex` and `getWikiGameInfo`),
 * so an unfiltered match could pass on prose alone even if the real array
 * never changed.
 *
 * `getWikiGameInfo`'s exclusion is backed by a recorded measurement, not a
 * guess (Part A of this task): three representative cold-cache calls
 * (Hades, Stardew Valley, Portal 2 — real network, 2026-07-25) completed in
 * 1190ms / 957ms / 702ms, comfortably under the 60s bound — see
 * `34.2-06-SUMMARY.md` for the full record. This test's own name states
 * that decision so the reason is legible at the failure site if a future
 * change silently adds it to the exemption list.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MAIN_RS_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'src',
  'main.rs'
)

const EXPECTED_LONG_RUNNING_CHANNELS = [
  'install',
  'updateGame',
  'uninstall',
  'checkGameUpdates',
  'refreshLibrary',
  'getCrossoverIndex',
  'repair',
  'readConfig'
]

/**
 * Reads main.rs and strips comments so assertions run against code only
 * (mirrors `tauriShellSource.test.ts`'s own `loadMainRsCode` helper):
 *   - drops every line whose trimmed form starts with `//` (covers `//`, `///`, `//!`)
 *   - drops a trailing `// ...` fragment from any mixed code/comment line
 */
function loadMainRsCode(): string {
  const raw = readFileSync(MAIN_RS_PATH, 'utf-8')
  return raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/**
 * Extracts the `LONG_RUNNING_CHANNELS` array's string literals from the
 * comment-stripped source.
 */
function extractLongRunningChannels(): string[] {
  const code = loadMainRsCode()
  const match = code.match(/const LONG_RUNNING_CHANNELS[^=]*=\s*&\[([\s\S]*?)\];/)
  if (!match) {
    throw new Error('LONG_RUNNING_CHANNELS array not found in main.rs')
  }
  const body = match[1]
  return Array.from(body.matchAll(/"([^"]+)"/g)).map((m) => m[1])
}

describe('loadMainRsCode comment-stripping helper (self-test)', () => {
  test('a comment-only phrase from the D-10 doc comment is NOT present in the stripped output', () => {
    // Without correct stripping this phrase (from the D-10 doc-comment addition
    // this plan makes) would leak through and make the "array does not name an
    // unexpected channel via prose alone" property untestable.
    expect(loadMainRsCode()).not.toContain(
      'joins this list for the same library-wide'
    )
  })
})

describe('REQ-34.2-12 main.rs LONG_RUNNING_CHANNELS exemption list (D-10)', () => {
  test('REQ-34.2-12 getCrossoverIndex is a member', () => {
    expect(extractLongRunningChannels()).toContain('getCrossoverIndex')
  })

  test('REQ-34.2-12 all six pre-existing members survive', () => {
    const channels = extractLongRunningChannels()
    for (const preExisting of [
      'install',
      'updateGame',
      'uninstall',
      'checkGameUpdates',
      'refreshLibrary',
      'getCrossoverIndex'
    ]) {
      expect(channels).toContain(preExisting)
    }
  })

  test('REQ-34.2-12 repair is a member — a real GOG/Epic repair routinely exceeds the 60s bound (CR-01)', () => {
    expect(extractLongRunningChannels()).toContain('repair')
  })

  test("REQ-34.2-12 readConfig is a member — readConfig('library') calls legendary.refresh(), the same work refreshLibrary is exempted for", () => {
    expect(extractLongRunningChannels()).toContain('readConfig')
  })

  test('REQ-34.2-12 the exemption list is EXACTLY the expected set (guards both silent widening and silent narrowing)', () => {
    const channels = extractLongRunningChannels()
    expect(new Set(channels)).toEqual(new Set(EXPECTED_LONG_RUNNING_CHANNELS))
    expect(channels).toHaveLength(EXPECTED_LONG_RUNNING_CHANNELS.length)
  })

  test('REQ-34.2-12 INVOKE_TIMEOUT is still Duration::from_secs(60) — the exemption is not achieved by raising the global bound', () => {
    expect(loadMainRsCode()).toContain(
      'const INVOKE_TIMEOUT: Duration = Duration::from_secs(60);'
    )
  })

  test('REQ-34.2-12 getWikiGameInfo is NOT exempted — the 2026-07-25 cold-cache measurement (1190ms/957ms/702ms) stayed comfortably under the 60s bound', () => {
    expect(extractLongRunningChannels()).not.toContain('getWikiGameInfo')
  })
})
