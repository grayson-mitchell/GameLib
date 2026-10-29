/**
 * Structural gates for `login_chrome_css_script()` and its ungated injection site in
 * `src-tauri/src/main.rs` (quick task 260822-di1, Task 2), plus the TypeScript<->Rust
 * byte-equality drift pin for the CSS text itself (D-5, T-di1-06).
 *
 * A new, self-contained file (rather than an addition to `tauriShellSource.test.ts`) per
 * this plan's own instruction: `productionCode()`/`extractBracedBlock()` are
 * describe-scoped in that 1663-line suite, so they are re-declared here rather than risking
 * its existing gates by editing it.
 *
 * All assertions run against COMMENT-STRIPPED main.rs (layering `stripSourceComments` then
 * `stripTrailingLineComment`, exactly as `tauriShellSource.test.ts` does -- never a hand-rolled
 * `/\/\/.*$/` replace, which is the WR-08 regression class `stripTrailingLineComment` exists to
 * avoid), and all production-code-scoped assertions are bounded to everything before
 * `mod tests {`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  stripSourceComments,
  stripTrailingLineComment
} from '../testUtils/stripSourceComments'
import { HUMBLE_LOGIN_CHROME_CSS } from 'common/humble/loginChromeCss'

const MAIN_RS_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'src',
  'main.rs'
)

/** Identical two-stage stripping to `tauriShellSource.test.ts`'s own `loadMainRsCode`. */
function loadMainRsCode(source?: string): string {
  const raw = source ?? readFileSync(MAIN_RS_PATH, 'utf-8')
  return stripSourceComments(raw)
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .map(stripTrailingLineComment)
    .join('\n')
}

/**
 * Bounds the search to PRODUCTION code only -- everything before `mod tests {` -- mirroring
 * `tauriShellSource.test.ts`'s own identical helper and rationale: a whole-file count would
 * conflate "how many cargo tests exercise this helper" with "how many production call sites
 * exist", which is the thing the exactly-once acceptance criteria below actually police.
 */
function productionCode(code: string): string {
  const testModStart = code.indexOf('mod tests {')
  expect(testModStart).toBeGreaterThan(-1)
  return code.slice(0, testModStart)
}

/**
 * Scans forward from `openMarker`'s FIRST `{` and returns the full brace-matched block
 * (inclusive of both braces), counting depth -- copied from `tauriShellSource.test.ts`'s own
 * identical helper (kept as a local copy per this file's own established convention; neither
 * block imports from the other).
 */
function extractBracedBlock(code: string, openMarker: string): string {
  const markerIdx = code.indexOf(openMarker)
  expect(markerIdx).toBeGreaterThan(-1)
  const braceStart = code.indexOf('{', markerIdx)
  expect(braceStart).toBeGreaterThan(-1)
  let depth = 0
  let i = braceStart
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  expect(depth).toBe(0)
  return code.slice(markerIdx, i + 1)
}

/**
 * Locates the `"humble_login_open" => {` arm's body. `code.indexOf('humble_login_open')`
 * still resolves to the intended block even though the arm above's single-flight guard
 * deliberately uses `if visible == true {` (main.rs's own comment explains why) -- do not
 * "fix" that condition; this extractor does not depend on it.
 */
function extractHumbleLoginOpenArmBody(code: string): string {
  const armStart = code.indexOf('"humble_login_open" => {')
  expect(armStart).toBeGreaterThan(-1)
  const armEnd = code.indexOf('"humble_login_cookies" => {', armStart)
  expect(armEnd).toBeGreaterThan(armStart)
  return code.slice(armStart, armEnd)
}

describe('fn login_chrome_css_script( exists exactly once in production code', () => {
  test('the real source defines it exactly once', () => {
    const code = productionCode(loadMainRsCode())
    const defs = code.match(/fn login_chrome_css_script\(/g) ?? []
    expect(defs.length).toBe(1)
  })
})

describe("login_chrome_css_script( is called exactly once in production code, inside humble_login_open's FIRST if-visible block", () => {
  test('exactly one non-definition call site exists, and it sits inside the if visible { block', () => {
    const code = productionCode(loadMainRsCode())
    // Negative lookbehind excludes the `fn login_chrome_css_script(` definition itself --
    // the usual definition-vs-call idiom.
    const callSites = code.match(/(?<!fn )login_chrome_css_script\(/g) ?? []
    expect(callSites.length).toBe(1)

    const armBody = extractHumbleLoginOpenArmBody(code)
    const visibleBlock = extractBracedBlock(armBody, 'if visible {')
    expect(visibleBlock).toContain('login_chrome_css_script(')
  })

  test('RED proof: the same call-site regex over a synthetic source WOULD count a second, hand-added call site', () => {
    const synthetic = [
      'fn login_chrome_css_script() { "unused" }',
      'login_chrome_css_script();',
      'login_chrome_css_script();'
    ].join('\n')
    const callSites =
      synthetic.match(/(?<!fn )login_chrome_css_script\(/g) ?? []
    expect(callSites.length).toBe(2)
  })
})

describe('D-2 gate: the login_chrome_css_script( call site is provably OUTSIDE any #[cfg( block', () => {
  /**
   * quick-261029-osq: the macOS-gated `login_origin_banner_script(` call this gate used to
   * slice from is deleted (the sheet chrome is now native), so the gate is re-anchored on the
   * `login_chrome_css_script(` call line itself. It returns the visible block's text up to
   * that call, and the D-2 meaning is preserved as two checks over it:
   *   (a) brace depth at the call is exactly 1 -- only the `if visible {` brace is open, so
   *       the call is not nested inside a `#[cfg(...)] { ... }` block; and
   *   (b) the nearest preceding non-empty line is not a `#[cfg(` attribute, so the call
   *       statement does not carry its own gate.
   */
  function prefixBeforeCssCall(armBody: string): string {
    const visibleBlock = extractBracedBlock(armBody, 'if visible {')
    const cssIdx = visibleBlock.indexOf('login_chrome_css_script(')
    expect(cssIdx).toBeGreaterThan(-1)
    return visibleBlock.slice(0, cssIdx)
  }
  function depthAtCall(prefix: string): number {
    let depth = 0
    for (const ch of prefix) {
      if (ch === '{') depth++
      else if (ch === '}') depth--
    }
    return depth
  }
  function previousLine(prefix: string): string {
    // Drop the call's own (partial) line, then take the nearest non-empty line above it.
    const lines = prefix.split('\n').slice(0, -1)
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() !== '') return lines[i]
    }
    return ''
  }

  test('the real source: the CSS call sits at brace depth 1 of the visible block (no enclosing cfg block) and has no cfg attribute on the line above', () => {
    const code = productionCode(loadMainRsCode())
    const armBody = extractHumbleLoginOpenArmBody(code)
    const prefix = prefixBeforeCssCall(armBody)
    expect(depthAtCall(prefix)).toBe(1)
    expect(previousLine(prefix)).not.toContain('#[cfg(')
  })

  test('RED proof: a synthetic source where the CSS call is nested INSIDE a macOS block fails the "depth 1" half', () => {
    const synthetic = [
      '"humble_login_open" => {',
      '    if visible {',
      '        #[cfg(target_os = "macos")]',
      '        {',
      '            builder = builder.initialization_script(&login_chrome_css_script());',
      '        }',
      '    }',
      '}',
      '"humble_login_cookies" => {}',
      'mod tests {'
    ].join('\n')
    const code = productionCode(loadMainRsCode(synthetic))
    const armBody = extractHumbleLoginOpenArmBody(code)
    // Depth 2 -- the real gate's `expect(depth).toBe(1)` would FAIL against this input,
    // proving that assertion is not vacuously true.
    expect(depthAtCall(prefixBeforeCssCall(armBody))).toBe(2)
  })

  test('RED proof: a synthetic source where the CSS call gained its OWN cfg attribute fails the "no cfg above" half', () => {
    const synthetic = [
      '"humble_login_open" => {',
      '    if visible {',
      '        #[cfg(target_os = "macos")]',
      '        builder = builder.initialization_script(&login_chrome_css_script());',
      '    }',
      '}',
      '"humble_login_cookies" => {}',
      'mod tests {'
    ].join('\n')
    const code = productionCode(loadMainRsCode(synthetic))
    const armBody = extractHumbleLoginOpenArmBody(code)
    // The attribute line sits directly above the call -- the real gate's
    // `not.toContain('#[cfg(')` would FAIL against this input.
    expect(previousLine(prefixBeforeCssCall(armBody))).toContain('#[cfg(')
  })
})

describe('DRIFT PIN (T-di1-06): the Rust literal and the TypeScript constant are byte-identical', () => {
  function extractCssLiteral(fnBody: string): string | null {
    const match = fnBody.match(/style\.textContent = '([^']*)';/)
    return match ? match[1] : null
  }

  test('the real login_chrome_css_script fn body embeds exactly HUMBLE_LOGIN_CHROME_CSS', () => {
    const code = loadMainRsCode()
    const fnBody = extractBracedBlock(code, 'fn login_chrome_css_script()')
    const extracted = extractCssLiteral(fnBody)
    expect(extracted).toBe(HUMBLE_LOGIN_CHROME_CSS)
  })

  test('RED proof: the same extractor over a synthetic body carrying a DIFFERENT literal does NOT equal the constant', () => {
    const syntheticFnBody =
      "fn login_chrome_css_script() { style.textContent = 'footer.wrong-selector { display: none; }'; }"
    const extracted = extractCssLiteral(syntheticFnBody)
    expect(extracted).not.toBeNull()
    expect(extracted).not.toBe(HUMBLE_LOGIN_CHROME_CSS)
  })

  test('RED proof: the same extractor over a synthetic body with NO textContent assignment returns null', () => {
    const syntheticFnBody = 'fn login_chrome_css_script() { return; }'
    expect(extractCssLiteral(syntheticFnBody)).toBeNull()
  })

  test("RED proof: di1's shipped one-rule literal (a half-applied 260822-eib update, footer updated but navbar rule forgotten on the Rust side) extracts but does NOT equal the current constant", () => {
    const syntheticFnBody =
      "fn login_chrome_css_script() { style.textContent = 'footer.site-footer { display: none !important; }'; }"
    const extracted = extractCssLiteral(syntheticFnBody)
    expect(extracted).not.toBeNull()
    expect(extracted).not.toBe(HUMBLE_LOGIN_CHROME_CSS)
  })
})

describe('WR-08 local guard: every line of the login_chrome_css_script fn body keeps an even raw " count', () => {
  test('every line of the sliced fn body has an even number of raw double quotes', () => {
    const code = loadMainRsCode()
    const fnBody = extractBracedBlock(code, 'fn login_chrome_css_script()')
    for (const line of fnBody.split('\n')) {
      const quoteCount = (line.match(/"/g) ?? []).length
      expect(quoteCount % 2).toBe(0)
    }
  })

  test('RED proof: the same per-line check WOULD fail against a synthetic line carrying an odd quote count', () => {
    const badLine = '"unbalanced piece'
    const quoteCount = (badLine.match(/"/g) ?? []).length
    expect(quoteCount % 2).not.toBe(0)
  })
})

describe('Cargo-test survival pin (CI runs no cargo step)', () => {
  test('the RAW (unstripped) main.rs source still contains the try/catch and ordering cargo tests', () => {
    const raw = readFileSync(MAIN_RS_PATH, 'utf-8')
    expect(raw).toContain(
      'fn login_chrome_css_script_is_wrapped_in_a_single_top_level_try_catch'
    )
    expect(raw).toContain(
      'fn login_chrome_css_script_top_frame_guard_precedes_the_host_gate_and_the_idempotence_flag'
    )
  })
})
