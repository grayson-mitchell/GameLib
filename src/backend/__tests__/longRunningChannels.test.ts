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
import {
  stripSourceComments,
  stripTrailingLineComment
} from '../testUtils/stripSourceComments'
import {
  findUnbalancedQuoteLines,
  joinContinuedLogicalLines,
  stripRustCharLiterals,
  stripRustEscapes,
  stripRustRawStrings
} from '../testUtils/rustQuoteBalance'

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
  'readConfig',
  // Phase 34.5 gap cycle 3, F-34.5-G6-02 (plan 34.5-23): oauthCaptureLogin's own
  // DEFAULT_DEADLINE_MS (300_000ms, src/backend/sidecar/oauthLoginCapture.ts) and
  // humbleStartLogin/humbleReconnect's shared LOGIN_WATCH_TIMEOUT_MS (600_000ms,
  // src/backend/humble/user.ts) both far exceed the 60s INVOKE_TIMEOUT bound.
  'oauthCaptureLogin',
  'humbleStartLogin',
  'humbleReconnect',
  // Phase 34.5 gap cycle 6 plan 44 Task 4 (closes ledger row U-34.5-16, T-34.5-C6-06):
  // getInstallInfo (ported to the sidecar by plan 34.5-43) spawns gogdl over the network
  // (gog/library.ts:624) and can re-enter itself on a retry (legendary/library.ts:260) --
  // either can plausibly exceed the 60s INVOKE_TIMEOUT bound on a cold cache or slow CDN.
  'getInstallInfo'
]

/**
 * Reads main.rs (or `source` if provided — the WR-08 self-tests below drive this SAME code path
 * with synthetic input rather than reimplementing the stripping algorithm) and strips comments so
 * assertions run against code only (mirrors `tauriShellSource.test.ts`'s own `loadMainRsCode`
 * helper):
 *   - drops every line whose trimmed form starts with `//` (covers `//`, `///`, `//!`)
 *   - drops a trailing `// ...` fragment from any mixed code/comment line
 *
 * Consumers of this helper's soundness: `extractLongRunningChannels()` (parses
 * `LONG_RUNNING_CHANNELS`'s string literals from the output) and the `INVOKE_TIMEOUT` literal
 * assertion below. Other Wave-0 config gates (`tauriConf.test.ts`, `tauriShellSource.test.ts`)
 * copy this exact stripper pattern, so a defect found here is worth guarding against once, here.
 */
function loadMainRsCode(source?: string): string {
  const raw = source ?? readFileSync(MAIN_RS_PATH, 'utf-8')
  return stripRustLineComments(raw)
}

/**
 * Extracts the `LONG_RUNNING_CHANNELS` array's string literals from the
 * comment-stripped source.
 */
function extractLongRunningChannels(): string[] {
  const code = loadMainRsCode()
  const match = code.match(
    /const LONG_RUNNING_CHANNELS[^=]*=\s*&\[([\s\S]*?)\];/
  )
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
 * Locates the `#[cfg(test)]` region in RAW source, returning `null` if the attribute is absent.
 * The attribute itself must be located in RAW text — `#[cfg(test)]` sits directly adjacent to doc
 * comments in main.rs's appended test module, so stripping before locating would be pointless at
 * best (see `loadMainRsRaw()`'s own comment above). Shared by `hasBehavioralRustTestModule` and
 * the individual test blocks below so neither reimplements the raw-region lookup.
 */
function locateCfgTestRegionRaw(source: string): string | null {
  const cfgTestIndex = source.indexOf('#[cfg(test)]')
  if (cfgTestIndex === -1) {
    return null
  }
  return source.slice(cfgTestIndex)
}

/**
 * Applies the same per-line comment-stripping algorithm `loadMainRsCode()` uses (drop lines whose
 * trimmed form starts with `//`; strip a trailing `//...` fragment from a mixed code/comment
 * line) to an arbitrary source string. Extracted so `loadMainRsCode()` and
 * `hasBehavioralRustTestModule`'s region-counting can share one implementation instead of two
 * copies drifting apart (WR-04).
 */
function stripRustLineComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .map(stripTrailingLineComment)
    .join('\n')
}

/**
 * True if `source` contains a `#[cfg(test)]` module that genuinely exercises `timeout_for` via a
 * real `assert_eq!` call (not merely the identifier appearing somewhere in the region) and
 * iterates `LONG_RUNNING_CHANNELS` (rather than hardcoding a second duplicate list).
 *
 * Two-step reasoning (WR-04): the `#[cfg(test)]` region is LOCATED in raw source
 * (`locateCfgTestRegionRaw`, attribute-adjacent doc comments make stripping-before-locating
 * unsafe), then everything COUNTED inside that region is comment-stripped
 * (`stripRustLineComments`) before any assertion runs. Without the second step, a region
 * consisting only of `// timeout_for ... timeout_for ...` comment lines plus a zero-assertion
 * loop satisfies a raw-text count — exactly the WR-04 counter-example this file's self-test
 * carries verbatim from the code review.
 *
 * Shared by both the real-file assertions below and this block's own self-tests, so the
 * self-tests prove the SAME logic that gates the real file can fail.
 */
function hasBehavioralRustTestModule(source: string): boolean {
  const region = locateCfgTestRegionRaw(source)
  if (region === null) {
    return false
  }
  const strippedRegion = stripRustLineComments(region)
  // The `\s*` spans newlines (no `s` flag needed — `\s` already matches `\n`), which is required
  // because the real module's loop body uses the multi-line
  // `assert_eq!(\n    timeout_for(channel),\n    None,\n    ...\n);` form.
  const hasRealAssertion = /assert_eq!\(\s*timeout_for\(/.test(strippedRegion)
  const timeoutForRefs = strippedRegion.match(/timeout_for/g) ?? []
  const iteratesLongRunningChannels =
    /for\s+\w+\s+in\s+LONG_RUNNING_CHANNELS/.test(strippedRegion)
  return (
    hasRealAssertion &&
    timeoutForRefs.length >= 2 &&
    iteratesLongRunningChannels
  )
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
    expect(locateCfgTestRegionRaw(loadMainRsRaw())).not.toBeNull()
  })

  test('the #[cfg(test)] region contains a real assert_eq! against timeout_for, not merely the identifier', () => {
    const region = locateCfgTestRegionRaw(loadMainRsRaw())
    expect(region).not.toBeNull()
    const strippedRegion = stripRustLineComments(region as string)
    expect(strippedRegion).toMatch(/assert_eq!\(\s*timeout_for\(/)
    const timeoutForRefs = strippedRegion.match(/timeout_for/g) ?? []
    expect(timeoutForRefs.length).toBeGreaterThanOrEqual(2)
  })

  test('the #[cfg(test)] region iterates LONG_RUNNING_CHANNELS rather than hardcoding a second duplicate list', () => {
    const region = locateCfgTestRegionRaw(loadMainRsRaw())
    expect(region).not.toBeNull()
    const strippedRegion = stripRustLineComments(region as string)
    expect(strippedRegion).toMatch(/for\s+\w+\s+in\s+LONG_RUNNING_CHANNELS/)
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

  // Third self-test (WR-04 counter-example, carried VERBATIM from
  // 34.2-REVIEW-GAP-CYCLE-3.md's WR-04 finding): a module consisting only of two COMMENT
  // mentions of `timeout_for` and a zero-assertion iteration loop satisfies the CURRENT
  // (unmodified) raw-count predicate, because comments inside the region are never stripped
  // before counting. This is the RED proof for this task: it MUST fail against today's
  // predicate, then pass once the predicate is corrected to require a real `assert_eq!`.
  test('self-test: WR-04 counter-example — comment-only timeout_for mentions plus a zero-assertion loop does NOT match the gate', () => {
    const vacuousModule = [
      '#[cfg(test)]',
      'mod tests {',
      '    // timeout_for ... timeout_for ...',
      '    #[test] fn noop() { for _c in LONG_RUNNING_CHANNELS {} }',
      '}'
    ].join('\n')
    expect(hasBehavioralRustTestModule(vacuousModule)).toBe(false)
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

  test('F-34.5-G6-02 oauthCaptureLogin, humbleStartLogin and humbleReconnect are members (plan 34.5-23, gap cycle 3)', () => {
    const channels = extractLongRunningChannels()
    expect(channels).toContain('oauthCaptureLogin')
    expect(channels).toContain('humbleStartLogin')
    expect(channels).toContain('humbleReconnect')
  })
})

/**
 * WR-08: `loadMainRsCode()`'s `.replace(/\/\/.*$/, '')` has no string-literal awareness. `main.rs`
 * is safe today only because every `steam://` / `https://` occurrence sits on a line that starts
 * with `//` and is dropped wholesale — the moment a code line gains a literal such as
 * `"steam://rungameid/"`, the stripper truncates it and `extractLongRunningChannels()` /
 * the `INVOKE_TIMEOUT` literal assertion above would fail or, worse, silently match a truncated
 * body. This helper is also the exact pattern other Wave-0 config gates
 * (`tauriConf.test.ts`, `tauriShellSource.test.ts`) copy, so the guard is worth carrying here
 * rather than attempting a correct Rust lexer in a config gate.
 */
describe('stripper integrity (WR-08)', () => {
  test('the real file: stripping does not cut a string literal in half (quote count stays EVEN)', () => {
    const stripped = stripRustCharLiterals(
      stripRustEscapes(stripRustRawStrings(loadMainRsCode()))
    )
    const quoteCount = (stripped.match(/"/g) ?? []).length
    // Plain `toBe(0)` would only report "Expected: 0, Received: 1" on failure — the raw count
    // itself (needed to locate which literal got cut) would be lost. Assert via a labeled
    // boolean instead so a failure names the count directly.
    const isEven = quoteCount % 2 === 0
    expect({ isEven, quoteCount }).toEqual({ isEven: true, quoteCount })
  })

  test('the real file: every line of the stripped output has a balanced (even) "-count', () => {
    // Raw strings are stripped from the FULL source BEFORE `.split('\n')` — a per-line pass
    // cannot see a multi-line construct like `r#"..."#`, so reordering these two calls (splitting
    // first, then trying to strip raw strings per-line) silently reverts this fix.
    const strippedLines = stripRustRawStrings(loadMainRsCode()).split('\n')
    const unbalancedLines = strippedLines
      .map((line, index) => ({
        index,
        line,
        quoteCount: (
          stripRustCharLiterals(stripRustEscapes(line)).match(/"/g) ?? []
        ).length
      }))
      .filter(({ quoteCount }) => quoteCount % 2 !== 0)
    // Reporting the full list of unbalanced lines (not just a boolean) makes a future failure
    // diagnosable at a glance rather than requiring a re-run with extra logging.
    expect(unbalancedLines).toEqual([])
  })

  // Discriminator battery for `testUtils/rustQuoteBalance`'s logical-line joiner (quick task
  // 260816-a5o). The guard above used to count `"` per PHYSICAL line, so `main.rs`'s
  // `\`-continued `app_hide` no-op message (3381-3383) reported its opening AND closing lines as
  // unbalanced — a false positive on legitimate Rust, and the SECOND one the per-line premise
  // produced (`29e12621f` was the first). These six pin that removing the premise did not also
  // remove the guard's ability to find a REAL truncation.
  test('joiner: the real file is clean AND still contains the `\\`-continued literal the joiner exists for (a vacuous pass would mean the fixture-of-record vanished)', () => {
    const continuedPhysicalLines = loadMainRsCode()
      .split('\n')
      .filter((line) => line.endsWith('\\')).length
    expect({
      unbalanced: findUnbalancedQuoteLines(loadMainRsCode()),
      hasContinuation: continuedPhysicalLines > 0
    }).toEqual({ unbalanced: [], hasContinuation: true })
  })

  test('joiner: a plain unterminated literal is STILL reported', () => {
    expect(findUnbalancedQuoteLines('const BROKEN: &str = "unterminated;')).toEqual(
      [
        {
          index: 0,
          line: 'const BROKEN: &str = "unterminated;',
          quoteCount: 1
        }
      ]
    )
  })

  test('joiner: a `\\`-continued literal that IS properly closed reads as balanced (this is the app_hide shape)', () => {
    const source = ['let s = "a \\', '   b";'].join('\n')
    expect(findUnbalancedQuoteLines(source)).toEqual([])
  })

  test('joiner: a `\\`-continued literal that NEVER closes is STILL reported — the fix must not degenerate into "stop checking"', () => {
    // The trailing backslash on the FINAL physical line must terminate the walk rather than read
    // past the end, leaving the joined logical line odd.
    const source = ['let s = "a \\', '   b;'].join('\n')
    expect(
      findUnbalancedQuoteLines(source).map(({ index, quoteCount }) => ({
        index,
        quoteCount
      }))
    ).toEqual([{ index: 0, quoteCount: 1 }])
  })

  test('joiner: ORDERING PROOF — stripRustEscapes must run BEFORE the join, so an escaped `\\\\` at end-of-line is NOT read as a continuation', () => {
    // Direct analogue of the `\\.`-vs-`\\"` ordering proof above, same class of reason. `\\\\` is an
    // ESCAPED BACKSLASH, not a line continuation: `stripRustEscapes` consumes it as a pair and
    // leaves no trailing backslash, whereas a genuine continuation backslash is followed by a
    // newline that `.` does not match and therefore survives. Join first and the two unrelated
    // lines below would be spliced together, their two odd counts would cancel to an even one,
    // and the truncated literal on line 0 would be laundered into "balanced".
    const source = ['let s = "a\\\\', 'let t = "b";'].join('\n')
    expect(
      findUnbalancedQuoteLines(source).map(({ index, quoteCount }) => ({
        index,
        quoteCount
      }))
    ).toEqual([{ index: 0, quoteCount: 1 }])
    // The mechanism, asserted directly: post-escape-strip there is no trailing backslash left for
    // the joiner to act on, so both physical lines survive as separate logical lines.
    expect(
      joinContinuedLogicalLines(stripRustEscapes(source).split('\n'))
    ).toHaveLength(2)
  })

  test('joiner: an ordinary balanced line is not reported', () => {
    expect(findUnbalancedQuoteLines('let s = "ok";')).toEqual([])
  })

  test("stripRustCharLiterals removes '\"' and '\\'' without touching real string literals", () => {
    // Pins the normalizer itself: a `'"'` char literal must vanish (it is not an unbalanced
    // string), while a genuinely truncated `"steam://` literal must still read as odd.
    expect(stripRustCharLiterals(`assert!(!v.ends_with('"'));`)).not.toContain(
      '"'
    )
    expect(stripRustCharLiterals(`assert!(!v.ends_with('\\''));`)).not.toContain(
      "'"
    )
    const truncated = stripRustCharLiterals('let s = "steam://')
    expect((truncated.match(/"/g) ?? []).length % 2).toBe(1)
  })

  test('stripRustEscapes neutralises escaped quotes without laundering real findings', () => {
    // The case that made this normalizer necessary: main.rs's F-34.4.2-12 pin. Balanced Rust that
    // a bare `"`-count calls unbalanced (3) until the `\"` escape is removed.
    const pinLine = 'if trimmed.ends_with("\\" => {") {'
    expect((pinLine.match(/"/g) ?? []).length % 2).toBe(1)
    expect((stripRustEscapes(pinLine).match(/"/g) ?? []).length % 2).toBe(0)

    // Ordering proof, and the reason the pass eats `\\.` rather than `\"`. In `"\\"` the escaped
    // BACKSLASH must be consumed first; a `\"`-only pass would eat the closing delimiter instead
    // and manufacture an imbalance. Left-to-right `\\.` gets this right.
    expect((stripRustEscapes('let s = "\\\\";').match(/"/g) ?? []).length).toBe(
      2
    )

    // MUST still fail loudly. A genuinely truncated literal has no escape to remove, so it stays
    // odd — the normalizer narrows false positives, it does not blunt the guard.
    expect(
      (stripRustEscapes('let s = "steam://').match(/"/g) ?? []).length % 2
    ).toBe(1)

    // A `\`-continued multi-line literal must STAY odd on its opening line: that shape is
    // indistinguishable from a stripper-truncated literal and is a real finding to report. `.`
    // not matching a newline is what preserves this.
    const continued = 'let s = "first half \\\n             second half";'
    const openingLine = stripRustEscapes(continued).split('\n')[0]
    expect((openingLine.match(/"/g) ?? []).length % 2).toBe(1)
  })

  // WR-08 is now RESOLVED rather than merely predicted (34.4.1 Plan 01 post-merge gate).
  //
  // History: this self-test previously asserted the OPPOSITE — that the naive
  // `line.replace(/\/\/.*$/, '')` pass truncates a quoted `//`-bearing literal, producing an ODD
  // "-count, i.e. that guards (a)/(b) above would reject such a line. That was an honest
  // description of a real defect, deliberately pinned so the defect could not be forgotten.
  //
  // The predicted regression then arrived: Phase 34.4.1's login-window arms gave main.rs's
  // `#[cfg(test)]` fixtures six real `"https://..."` / `"http://..."` / `"file:///..."` literals
  // on CODE lines, and the naive pass cut all six in half — tripping guard (b). Per the guard's
  // own instruction ("this local pass must be reconsidered, not the assertion weakened"), the
  // stripper became string-literal-aware (`stripTrailingLineComment`), so the two tests below
  // replace the old truncation assertion:
  //   1. the literal now SURVIVES intact while its trailing comment is still dropped — the exact
  //      behaviour guards (a)/(b) need in order to be sound;
  //   2. guard (b) can still FAIL, proven with a genuinely unbalanced line. This is the
  //      falsifiability lever that the old test provided via truncation; without it, fixing the
  //      stripper would have silently converted guard (b) into an unfalsifiable no-op.
  test('self-test: a quoted steam:// literal SURVIVES stripping (EVEN "-count) while its trailing comment is still dropped', () => {
    const syntheticSource = [
      'const INVOKE_TIMEOUT: Duration = Duration::from_secs(60);',
      'const RUNGAME_PREFIX: &str = "steam://rungameid/"; // trailing note'
    ].join('\n')
    const strippedLine = loadMainRsCode(syntheticSource).split('\n')[1]
    const quoteCount = (strippedLine.match(/"/g) ?? []).length
    expect({
      quoteCount,
      literalIntact: strippedLine.includes('"steam://rungameid/"'),
      commentDropped: !strippedLine.includes('trailing note')
    }).toEqual({ quoteCount: 2, literalIntact: true, commentDropped: true })
  })

  test('self-test: a genuinely unbalanced code line still produces an ODD "-count (proves guard (b) can fail)', () => {
    const syntheticSource = [
      'const INVOKE_TIMEOUT: Duration = Duration::from_secs(60);',
      'const BROKEN: &str = "unterminated literal;'
    ].join('\n')
    const strippedLine = loadMainRsCode(syntheticSource).split('\n')[1]
    const quoteCount = (strippedLine.match(/"/g) ?? []).length
    expect(quoteCount % 2).toBe(1)
  })

  test('self-test: a synthetic multi-line r#"..."# literal is normalized away (its delimiter lines become balanced) and the line count is preserved', () => {
    const syntheticSource = [
      'const INVOKE_TIMEOUT: Duration = Duration::from_secs(60);',
      'const SCRIPT: &str = r#"',
      'console.log("a bare quote on this body line");',
      'const note = 1; // a // sequence NOT at line-start, still inside the raw string body',
      'const x = 1;',
      '"#;',
      'const AFTER: &str = "sentinel";'
    ].join('\n')
    const strippedLines = stripRustRawStrings(loadMainRsCode(syntheticSource)).split('\n')
    const unbalancedLines = strippedLines
      .map((line, index) => ({
        index,
        line,
        quoteCount: (stripRustCharLiterals(line).match(/"/g) ?? []).length
      }))
      .filter(({ quoteCount }) => quoteCount % 2 !== 0)
    expect(unbalancedLines).toEqual([])
    // Pins Task 1 rule 4 (newline-preserving replacement) — without it every reported `index`
    // in the real guard would shift once the literal collapsed, destroying diagnosability.
    expect(strippedLines).toHaveLength(syntheticSource.split('\n').length)
  })

  // THIS IS THE MOST IMPORTANT TEST IN THE TASK. The WR-08 block's own history comment (above)
  // warns that fixing the stripper without this lever "would have silently converted guard (b)
  // into an unfalsifiable no-op". A fix that makes the guard unfalsifiable is a FAILED fix even
  // if the suite goes green. This is NOT a duplicate of the existing "genuinely unbalanced code
  // line" self-test above — that test predates `stripRustRawStrings` entirely; this one proves
  // the NEW normalizer specifically does not neutralize the guard's ability to fail.
  test('self-test: a genuinely truncated "steam:// literal STILL produces an ODD "-count after raw-string normalization (proves guard (b) remains falsifiable)', () => {
    const syntheticSource = [
      'const INVOKE_TIMEOUT: Duration = Duration::from_secs(60);',
      'const BROKEN: &str = "steam://unterminated;'
    ].join('\n')
    const strippedLine = stripRustRawStrings(loadMainRsCode(syntheticSource)).split('\n')[1]
    const quoteCount = (stripRustCharLiterals(strippedLine).match(/"/g) ?? []).length
    expect(quoteCount % 2).toBe(1)
  })

  test('self-test: an r##"..."## literal whose body contains a "# sequence is not terminated early, and following code survives', () => {
    const syntheticSource = [
      'const INVOKE_TIMEOUT: Duration = Duration::from_secs(60);',
      'const SCRIPT: &str = r##"',
      'this body line contains a "# sequence that must NOT close the literal early',
      '"##;',
      'const AFTER: &str = "sentinel";'
    ].join('\n')
    const stripped = stripRustRawStrings(loadMainRsCode(syntheticSource))
    const unbalancedLines = stripped
      .split('\n')
      .map((line, index) => ({
        index,
        line,
        quoteCount: (stripRustCharLiterals(line).match(/"/g) ?? []).length
      }))
      .filter(({ quoteCount }) => quoteCount % 2 !== 0)
    expect(unbalancedLines).toEqual([])
    // Proves the closer matched `"##`, not the body's `"#` — a premature match would have eaten
    // this trailing line along with the body.
    expect(stripped).toContain('const AFTER: &str = "sentinel";')
  })

  test('self-test: the zero-hash r"..." form is removed', () => {
    const syntheticSource = 'const X: &str = r"plain";'
    const stripped = stripRustRawStrings(syntheticSource)
    const quoteCount = (stripRustCharLiterals(stripped).match(/"/g) ?? []).length
    expect(quoteCount % 2).toBe(0)
  })

  test('self-test: stripRustRawStrings leaves an ordinary string literal ending in r untouched ("repair", "com.gamelib.launcher")', () => {
    // Measured fact (planner finding F2): main.rs has 14 lines where an ORDINARY string literal
    // happens to end in the letter `r`, and zero real boundary-preceded `r"` raw-string openers.
    // Without the non-identifier boundary guard in Task 1, this pass would match the `r"` inside
    // `"repair"` and delete everything up to the next quote — real source between them.
    const syntheticSource = [
      '    "repair",',
      '    const KEYRING_SERVICE: &str = "com.gamelib.launcher";',
      '    const AFTER: &str = "sentinel";'
    ].join('\n')
    expect(stripRustRawStrings(syntheticSource)).toBe(syntheticSource)
  })
})

/**
 * Standing guard (Phase 34.5 gap cycle 3, plan 34.5-23, Task 3): closes the class of defect
 * F-34.5-G6-02 diagnosed, not just today's three named channels. The invariant this pins:
 * **a channel whose sidecar handler carries its own wall-clock deadline longer than
 * `INVOKE_TIMEOUT` must appear in `LONG_RUNNING_CHANNELS`.** Without this, a NINTH channel with
 * the same shape could be added tomorrow and the exact silent-drop defect this cycle just spent
 * two blocking live-gate failures diagnosing would recur unnoticed — three fully green suites
 * (3279, 3387, 3447 tests) already coexisted with every blocking defect this phase has found, so
 * "the suite is green" is deliberately never treated as proof on its own; this guard exists
 * specifically so IT can go red on the next occurrence.
 *
 * `DEADLINE_CONSTANT_TABLE` is a declared, explicit table (channel name -> the source file/
 * constant that bounds it) rather than a scan, per the plan's own scope: at minimum
 * `oauthCaptureLogin` -> `DEFAULT_DEADLINE_MS` (`oauthLoginCapture.ts`) and
 * `humbleStartLogin`/`humbleReconnect` -> `LOGIN_WATCH_TIMEOUT_MS` (`humble/user.ts`), the exact
 * three channels 34.5-22 Task 2's recurrence count named.
 */
const DEADLINE_CONSTANT_TABLE: Array<{
  channel: string
  sourcePath: string
  constantName: string
}> = [
  {
    channel: 'oauthCaptureLogin',
    sourcePath: join(__dirname, '..', 'sidecar', 'oauthLoginCapture.ts'),
    constantName: 'DEFAULT_DEADLINE_MS'
  },
  {
    channel: 'humbleStartLogin',
    sourcePath: join(__dirname, '..', 'humble', 'user.ts'),
    constantName: 'LOGIN_WATCH_TIMEOUT_MS'
  },
  {
    channel: 'humbleReconnect',
    sourcePath: join(__dirname, '..', 'humble', 'user.ts'),
    constantName: 'LOGIN_WATCH_TIMEOUT_MS'
  }
]

/**
 * Parses a `const NAME = EXPR` (or `export const NAME = EXPR`, optionally type-annotated)
 * numeric-millisecond constant out of already comment-stripped `source` text. Reuses this
 * suite's existing shared `stripSourceComments`/`stripTrailingLineComment` helpers (grep-gate
 * hygiene, per this task's own instruction) rather than a fresh copy — a bare `grep -c` against
 * an un-stripped file would let Task 1's justifying prose (which names every constant discussed
 * here) satisfy the parse on comment text alone.
 *
 * `EXPR` is restricted to digits, underscores (Rust/TS numeric separators, stripped before
 * evaluation), whitespace and `+ - * / ( )` before being evaluated — this is a narrow arithmetic
 * evaluator for trusted first-party source, not a general expression parser, and rejects
 * anything outside that character set rather than risk evaluating unexpected code.
 */
function parseMsConstantFromSource(source: string, constantName: string): number {
  const stripped = stripSourceComments(source)
    .split('\n')
    .map(stripTrailingLineComment)
    .join('\n')
  const pattern = new RegExp(
    `const\\s+${constantName}(?:\\s*:\\s*\\w+)?\\s*=\\s*([^\\n;]+)`
  )
  const match = stripped.match(pattern)
  if (!match) {
    throw new Error(`${constantName} not found in the given source`)
  }
  const expr = match[1].trim().replace(/_/g, '')
  if (!/^[\d\s*+\-/().]+$/.test(expr)) {
    throw new Error(
      `${constantName}'s expression "${expr}" contains characters outside the allowed numeric-arithmetic set`
    )
  }
  // eslint-disable-next-line no-new-func -- expr is validated above to be numeric arithmetic only
  const value = Function(`"use strict"; return (${expr});`)() as unknown
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${constantName}'s expression "${expr}" did not evaluate to a number`)
  }
  return value
}

function parseMsConstantFromFile(sourcePath: string, constantName: string): number {
  return parseMsConstantFromSource(readFileSync(sourcePath, 'utf-8'), constantName)
}

/** Parses `INVOKE_TIMEOUT`'s seconds literal from `main.rs` and returns it in milliseconds. */
function extractInvokeTimeoutMs(): number {
  const code = loadMainRsCode()
  const match = code.match(
    /const INVOKE_TIMEOUT: Duration = Duration::from_secs\((\d+)\)/
  )
  if (!match) {
    throw new Error('INVOKE_TIMEOUT literal not found in main.rs')
  }
  return Number(match[1]) * 1000
}

/**
 * The invariant itself, factored so both the real-file test and the self-tests below drive the
 * SAME logic (WR-04 pattern) rather than two copies drifting apart. Throws naming the first
 * offending channel; asserts nothing on its own (callers wrap in `expect(...).not.toThrow()` /
 * `.toThrow(...)`).
 */
function assertDeadlinesAreExempted(
  rows: Array<{ channel: string; deadlineMs: number }>,
  longRunningChannels: string[],
  invokeTimeoutMs: number
): void {
  for (const row of rows) {
    if (row.deadlineMs > invokeTimeoutMs && !longRunningChannels.includes(row.channel)) {
      throw new Error(
        `${row.channel}'s internal deadline (${row.deadlineMs}ms) exceeds INVOKE_TIMEOUT ` +
          `(${invokeTimeoutMs}ms) but is absent from LONG_RUNNING_CHANNELS`
      )
    }
  }
}

describe('F-34.5-G6-02 standing guard: a channel whose internal deadline exceeds INVOKE_TIMEOUT must be a LONG_RUNNING_CHANNELS member', () => {
  test('deadline longer than INVOKE_TIMEOUT implies membership of LONG_RUNNING_CHANNELS, for every row in DEADLINE_CONSTANT_TABLE', () => {
    const invokeTimeoutMs = extractInvokeTimeoutMs()
    const longRunningChannels = extractLongRunningChannels()
    const rows = DEADLINE_CONSTANT_TABLE.map((row) => ({
      channel: row.channel,
      deadlineMs: parseMsConstantFromFile(row.sourcePath, row.constantName)
    }))

    // Non-vacuous: every row's real deadline genuinely exceeds the bound (otherwise this test
    // would pass even if the throw-on-violation logic below were deleted entirely).
    for (const row of rows) {
      expect(row.deadlineMs).toBeGreaterThan(invokeTimeoutMs)
    }

    expect(() =>
      assertDeadlinesAreExempted(rows, longRunningChannels, invokeTimeoutMs)
    ).not.toThrow()
  })

  // Self-test (WR-08 style): proves the guard can actually FAIL. A synthetic channel with a
  // 300_000ms deadline, absent from LONG_RUNNING_CHANNELS, must trip the assertion and name the
  // channel in its failure message -- a guard that has never been shown to fail is not a guard
  // (this file's own header comment on the class of defect this phase's fully-green suites kept
  // missing).
  test('self-test: a synthetic 300_000ms-deadline channel absent from LONG_RUNNING_CHANNELS trips the guard', () => {
    const rows = [{ channel: 'probeChannel', deadlineMs: 300_000 }]
    const longRunningChannelsWithoutProbe = extractLongRunningChannels() // real list, does not contain 'probeChannel'

    expect(() =>
      assertDeadlinesAreExempted(rows, longRunningChannelsWithoutProbe, 60_000)
    ).toThrow(/probeChannel/)
  })

  // Second self-test: the SAME synthetic channel, once added to the exemption list, no longer
  // trips the guard -- proves the assertion is checking real membership, not merely "some list
  // was non-empty".
  test('self-test: the same synthetic channel does NOT trip the guard once added to LONG_RUNNING_CHANNELS', () => {
    const rows = [{ channel: 'probeChannel', deadlineMs: 300_000 }]
    const longRunningChannelsWithProbe = [...extractLongRunningChannels(), 'probeChannel']

    expect(() =>
      assertDeadlinesAreExempted(rows, longRunningChannelsWithProbe, 60_000)
    ).not.toThrow()
  })

  // Third self-test: a deadline at or below INVOKE_TIMEOUT never trips the guard even when
  // absent from the exemption list -- proves the ">" comparison is real, not a channel-name-only
  // check.
  test('self-test: a deadline at or below INVOKE_TIMEOUT never trips the guard, even when absent from LONG_RUNNING_CHANNELS', () => {
    const rows = [{ channel: 'probeChannel', deadlineMs: 60_000 }]
    const longRunningChannelsWithoutProbe = extractLongRunningChannels()

    expect(() =>
      assertDeadlinesAreExempted(rows, longRunningChannelsWithoutProbe, 60_000)
    ).not.toThrow()
  })

  test('parseMsConstantFromSource ignores a comment-only mention and reads only the real declaration', () => {
    const syntheticSource = [
      '// FAKE_DEADLINE_MS = 999_000 -- a comment naming a value that must NOT be read',
      'const FAKE_DEADLINE_MS = 300_000'
    ].join('\n')
    expect(parseMsConstantFromSource(syntheticSource, 'FAKE_DEADLINE_MS')).toBe(300_000)
  })

  test('parseMsConstantFromSource evaluates a multiplication expression (mirrors LOGIN_WATCH_TIMEOUT_MS = 10 * 60_000)', () => {
    const syntheticSource = 'export const FAKE_DEADLINE_MS = 10 * 60_000'
    expect(parseMsConstantFromSource(syntheticSource, 'FAKE_DEADLINE_MS')).toBe(600_000)
  })

  test('parseMsConstantFromSource rejects an expression containing characters outside the allowed numeric-arithmetic set', () => {
    const syntheticSource = 'const FAKE_DEADLINE_MS = someFunctionCall(300_000)'
    expect(() =>
      parseMsConstantFromSource(syntheticSource, 'FAKE_DEADLINE_MS')
    ).toThrow(/outside the allowed numeric-arithmetic set/)
  })
})
