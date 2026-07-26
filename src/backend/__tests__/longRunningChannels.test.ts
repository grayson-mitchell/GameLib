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

/**
 * Reads main.rs RAW (no comment-stripping) — `#[cfg(test)]` is an attribute, not a comment,
 * and it sits directly adjacent to doc comments in main.rs's appended test module, so running
 * `loadMainRsCode()`'s stripper over it would be pointless at best and could interact with the
 * attribute-adjacent doc-comment lines at worst. This helper is scoped to this describe block
 * only — it does not replace `loadMainRsCode()` for the exemption-list assertions above.
 */
function loadMainRsRaw(): string {
  return readFileSync(MAIN_RS_PATH, 'utf-8')
}

/**
 * True if `source` contains a `#[cfg(test)]` module that genuinely exercises `timeout_for`
 * (referenced at least twice) and iterates `LONG_RUNNING_CHANNELS` (rather than hardcoding a
 * second duplicate list). Shared by both the real-file assertions below and this block's own
 * self-test, so the self-test proves the SAME logic that gates the real file can fail.
 */
function hasBehavioralRustTestModule(source: string): boolean {
  const cfgTestIndex = source.indexOf('#[cfg(test)]')
  if (cfgTestIndex === -1) {
    return false
  }
  const region = source.slice(cfgTestIndex)
  const timeoutForRefs = region.match(/timeout_for/g) ?? []
  const iteratesLongRunningChannels = /for\s+\w+\s+in\s+LONG_RUNNING_CHANNELS/.test(
    region
  )
  return timeoutForRefs.length >= 2 && iteratesLongRunningChannels
}

/**
 * Pins the existence of `src-tauri/src/main.rs`'s `#[cfg(test)]` behavioral test module (Phase
 * 34.2 gap cycle 3, plan 22) from the JS side. This project's CI runs no cargo step at all
 * (`.github/workflows/*.yml` contains neither `cargo test` nor `cargo check`), so without this
 * gate the Rust module could be deleted and NOTHING automated would notice — the same class of
 * silent-deletion risk WR-01 closed for the sidecar containment tripwires elsewhere in this gap
 * cycle. A human must still actually RUN the Rust tests: `cd src-tauri && cargo test`.
 */
describe('REQ-34.2-14 main.rs #[cfg(test)] behavioral test module is present (pinned from JS since CI runs no cargo step)', () => {
  test('main.rs contains a #[cfg(test)] attribute', () => {
    expect(loadMainRsRaw()).toContain('#[cfg(test)]')
  })

  test('the #[cfg(test)] region references timeout_for at least twice — it genuinely exercises the function, not merely exists', () => {
    const source = loadMainRsRaw()
    const cfgTestIndex = source.indexOf('#[cfg(test)]')
    expect(cfgTestIndex).toBeGreaterThan(-1)
    const region = source.slice(cfgTestIndex)
    const timeoutForRefs = region.match(/timeout_for/g) ?? []
    expect(timeoutForRefs.length).toBeGreaterThanOrEqual(2)
  })

  test('the #[cfg(test)] region iterates LONG_RUNNING_CHANNELS rather than hardcoding a second duplicate list', () => {
    const source = loadMainRsRaw()
    const cfgTestIndex = source.indexOf('#[cfg(test)]')
    expect(cfgTestIndex).toBeGreaterThan(-1)
    const region = source.slice(cfgTestIndex)
    expect(region).toMatch(/for\s+\w+\s+in\s+LONG_RUNNING_CHANNELS/)
  })

  test('the full gate (all three conditions together) matches the real main.rs', () => {
    expect(hasBehavioralRustTestModule(loadMainRsRaw())).toBe(true)
  })

  // Self-test (mirrors gameDetailsImportGate.test.ts's own Gate-2 self-test convention): proves
  // this gate can actually FAIL, against a synthetic source lacking #[cfg(test)] entirely —
  // without this, the gate above is another assertion nobody has proven can fail, which is
  // precisely the WR-01 failure mode this gap cycle is closing elsewhere.
  test('self-test: a synthetic source lacking #[cfg(test)] does NOT match the gate', () => {
    const syntheticSource = [
      'fn timeout_for(channel: &str) -> Option<Duration> {',
      '    if LONG_RUNNING_CHANNELS.contains(&channel) { None } else { Some(INVOKE_TIMEOUT) }',
      '}',
      '// no test module below — timeout_for is mentioned above but never in a #[cfg(test)] region'
    ].join('\n')
    expect(hasBehavioralRustTestModule(syntheticSource)).toBe(false)
  })

  // Second self-test: a #[cfg(test)] module present but referencing timeout_for only once, and
  // never iterating LONG_RUNNING_CHANNELS, must also fail — proves the gate is not satisfied by
  // the attribute's mere presence.
  test('self-test: a #[cfg(test)] module that exists but does not exercise timeout_for or iterate LONG_RUNNING_CHANNELS does NOT match the gate', () => {
    const syntheticSource = [
      '#[cfg(test)]',
      'mod tests {',
      '    use super::*;',
      '    #[test]',
      '    fn placeholder() {',
      '        assert_eq!(timeout_for("install"), None);',
      '    }',
      '}'
    ].join('\n')
    expect(hasBehavioralRustTestModule(syntheticSource)).toBe(false)
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
