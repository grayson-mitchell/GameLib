/**
 * The single shared Rust quote-balance implementation for backend source-text gates (quick task
 * 260816-a5o). Companion to `stripSourceComments.ts` in this directory, which is the precedent
 * for extracting a duplicated source-gate helper in this repo.
 *
 * Context: `longRunningChannels.test.ts`'s WR-08 stripper-integrity guards counted `"` per
 * PHYSICAL line and called any odd count a stripper-truncated string literal. That premise is
 * wrong for legitimate Rust: a `\`-continued string literal spans several physical lines, and its
 * opening and closing lines each carry exactly one `"`. `main.rs`'s `app_hide` dispatch arm
 * (commit `206a31db7`) is exactly this shape and made the guard red on correct source. It was the
 * SECOND legitimate-Rust false positive the per-line premise produced (`29e12621f` taught it about
 * escaped quotes), so the premise is removed structurally here — via a logical-line joiner —
 * rather than patched with a third special case.
 *
 * The pipeline, and why the order is load-bearing:
 *
 *   stripRustLineComments  (caller-side, via the caller's own `loadMainRsCode`)
 *     -> stripRustRawStrings  (WHOLE source; a per-line pass cannot see `r#"..."#`)
 *     -> stripRustEscapes     (WHOLE source; MUST precede the join -- see below)
 *     -> split('\n')
 *     -> joinContinuedLogicalLines
 *     -> stripRustCharLiterals per LOGICAL line, then count `"` and keep the odd ones
 *
 * `stripRustEscapes` MUST run BEFORE the join. It consumes two-character escapes left-to-right,
 * so an escaped backslash written `\\` at end-of-line is eaten as a PAIR and leaves no trailing
 * backslash, while a genuine continuation backslash is followed by a newline that `.` does not
 * match and therefore SURVIVES. That asymmetry is precisely what makes "the line ends with a
 * backslash" an unambiguous continuation signal. Joining first would mistake a doubled backslash
 * for a continuation, silently splice two unrelated lines together, and mask a real imbalance.
 *
 * Index stability is a requirement, not an incidental: `stripRustRawStrings` blanks characters
 * instead of deleting lines, and a logical line reports the index of its FIRST physical line, so
 * a real failure names a line number a human can open.
 *
 * Accepted limitation (same register as the individual normalizers' caveats below): the caller's
 * comment stripper, `stripTrailingLineComment`, tracks in-string state PER PHYSICAL LINE and
 * resets at each newline. A `//` sequence appearing inside a continuation's BODY line would
 * therefore be truncated before this module ever sees the text. No such line exists in `main.rs`
 * today -- only two continuation lines exist in the whole file, both inside the `app_hide`
 * literal. Recorded, deliberately not fixed: this is a narrow normalizer for trusted first-party
 * source, not a Rust lexer.
 */

/**
 * Removes Rust CHAR literals (`'a'`, `'"'`, `'\''`, `'\\'`) from `source`.
 *
 * The WR-08 quote-balance guards in `longRunningChannels.test.ts` count `"` occurrences to detect
 * a string literal that the comment stripper cut in half. A char literal holding a double-quote —
 * `value.ends_with('"')`, which `main.rs`'s `#[cfg(test)]` module uses to assert `GAMELIB_SHELL_EXE`
 * is never quoted — contributes exactly one `"` to its line and reads as "unbalanced" to a naive
 * count, even though nothing was truncated. Normalising char literals away keeps the guard
 * measuring the property it actually cares about (truncated STRING literals) instead of tripping
 * on valid Rust.
 *
 * The pattern deliberately requires a closing `'` immediately after one char or escape, so Rust
 * lifetimes (`'static`, `'a,`) are left alone. It is ALSO why an English apostrophe in prose
 * inside a string literal (`Electron's own ...`) is left alone: the character after the `'` is a
 * letter and the one after that is not a `'`, so nothing matches. That is correct behaviour, and
 * was NOT the cause of the `app_hide` false positive despite an early diagnosis saying so.
 */
export function stripRustCharLiterals(source: string): string {
  return source.replace(/'(?:\\.|[^\\'])'/g, '')
}

/**
 * Removes Rust RAW string literals (`r"..."`, `r#"..."#`, `r##"..."##`, ...) from `source`.
 *
 * The WR-08 guards measure ONE property: did the comment stripper cut an ORDINARY string literal
 * in half? A raw string is not that — it legitimately spans many lines, so its opening delimiter
 * (e.g. `r#"`) and closing delimiter (e.g. `"#;`) each carry exactly one bare `"` on their own
 * line even though nothing was truncated. `main.rs`'s
 * `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT: &str = r#"..."#` (commit `88c2043cc`) is exactly this case,
 * and without this pass its opener/closer lines read as "unbalanced" — a false positive in the
 * normalizer, not a real defect in the source.
 *
 * The `r` MUST sit at start-of-string or be preceded by a non-identifier character
 * (`[^A-Za-z0-9_]`). This is not defensive hedging: 14 lines in `main.rs` end an ORDINARY string
 * literal with the letter `r` — `"repair",`, `const KEYRING_SERVICE: &str =
 * "com.gamelib.launcher";`, `.unwrap_or("sidecar error")`, and friends. Without the boundary
 * check, the pattern would match the `r"` inside `"repair"` and delete everything up to the next
 * quote — real source, potentially including `LONG_RUNNING_CHANNELS` members. The boundary
 * character is re-emitted, never swallowed.
 *
 * The hash count of the closing delimiter must match the opener EXACTLY (`\3` backreferences the
 * captured hashes), so an `r##"..."##` body containing a `"#` sequence is not terminated early.
 *
 * The replacement strips every NON-NEWLINE character from the matched literal rather than
 * deleting it outright, so the line count is preserved. The per-line WR-08 guard reports `index`
 * values to make a real failure diagnosable; collapsing a 332-line literal to nothing would shift
 * every subsequent index and destroy that diagnosability.
 *
 * Accepted limitation: this is a narrow normalizer for trusted first-party source, not a Rust
 * lexer. An `r#"` sequence appearing INSIDE an ordinary string literal would be mis-detected.
 * That failure mode is loud — it unbalances quotes and the guard goes red — not silent.
 */
export function stripRustRawStrings(source: string): string {
  return source.replace(
    /(^|[^A-Za-z0-9_])(r(#*)"[\s\S]*?"\3)/g,
    (_match, boundary: string, literal: string) =>
      boundary + literal.replace(/[^\n]/g, '')
  )
}

/**
 * Removes Rust ESCAPE SEQUENCES (`\"`, `\\`, `\n`, `\'`, ...) from `source`.
 *
 * Same class of false positive as the two normalizers above, third variant. The WR-08 guards count
 * bare `"` occurrences; an ESCAPED quote inside an ordinary string literal is not a delimiter, but
 * a naive count treats it as one. `main.rs`'s F-34.4.2-12 pin carries the canonical case —
 * `trimmed.ends_with("\" => {")` counts three `"` and reads as "unbalanced" even though the line is
 * perfectly balanced Rust. Without this pass the guard reports a defect in correct source.
 *
 * Removing the whole two-character escape (`\\.`) rather than just `\"` is what makes the ordering
 * safe: a literal backslash is written `\\`, so in `"\\"` the regex consumes the `\\` pair FIRST
 * (left-to-right) and leaves `""` balanced. Matching `\"` alone would instead consume the closing
 * delimiter of that same literal and manufacture the very imbalance this pass exists to remove.
 *
 * `.` deliberately does NOT match a newline, and that behaviour is REQUIRED — but not for the
 * reason this comment used to give. It previously claimed a `\`-continued multi-line literal is
 * "indistinguishable from a stripper-truncated literal" and so must be left reading as odd. That
 * premise was false, and was the written form of the bug: a continued literal IS distinguishable
 * from a truncated one, by the trailing backslash itself. The real reason to preserve the
 * behaviour is that `joinContinuedLogicalLines` needs that surviving trailing backslash as its
 * continuation signal, while a `\\` escape pair — which is NOT a continuation — is consumed here
 * and correctly leaves none. See `joinContinuedLogicalLines` for the full ordering argument.
 *
 * MUST run after `stripRustRawStrings` — a raw string's body may contain backslashes that are not
 * escapes at all (`r"C:\path\n"`), and eating them there would corrupt the very text the raw-string
 * pass is careful to blank out while preserving line counts.
 */
export function stripRustEscapes(source: string): string {
  return source.replace(/\\./g, '')
}

/**
 * Folds `\`-continued PHYSICAL lines into LOGICAL lines.
 *
 * A Rust string literal may be continued across physical lines with a trailing backslash, which
 * also swallows the newline and the next line's leading whitespace. `main.rs:3381-3383`'s
 * `app_hide` no-op message is the only such construct in the file today. Its opening and closing
 * physical lines each carry exactly one `"`, so a per-physical-line quote count reports BOTH as
 * unbalanced even though the literal is perfectly well-formed.
 *
 * MUST be given input that has already been through `stripRustEscapes`. That pass consumes `\\`
 * escape pairs, so any backslash still sitting at end-of-line is unambiguously a continuation and
 * never an escaped backslash. Running this first would splice two unrelated lines together on a
 * `"a\\` / `let t = "b";` pair and mask a genuine imbalance.
 *
 * A trailing backslash on the FINAL line of input terminates the walk rather than reading past the
 * end — so a literal that opens a continuation and never closes stays odd and is still reported,
 * which is what stops this fix degenerating into "stop checking".
 *
 * Each logical line reports the index of its FIRST physical line, preserving the diagnosability
 * that `stripRustRawStrings`'s newline-preserving replacement exists to protect.
 */
export function joinContinuedLogicalLines(
  lines: string[]
): Array<{ index: number; line: string }> {
  const logicalLines: Array<{ index: number; line: string }> = []
  let cursor = 0
  while (cursor < lines.length) {
    const index = cursor
    let line = lines[cursor]
    cursor++
    while (line.endsWith('\\') && cursor < lines.length) {
      line = line.slice(0, -1) + lines[cursor]
      cursor++
    }
    logicalLines.push({ index, line })
  }
  return logicalLines
}

/**
 * The WR-08 per-line quote-balance guard, as one shared pipeline.
 *
 * Takes ALREADY COMMENT-STRIPPED source — the caller owns its own `loadMainRsCode`, because the
 * comment stripper's `#[cfg(test)]`-adjacency caveats are the caller's concern, not this module's.
 * Returns the FULL offending entries rather than a boolean: the guard's existing comment makes
 * diagnosability an explicit requirement, and "Expected: 0, Received: 1" would lose the line that
 * has to be opened.
 *
 * An empty array means every logical line is balanced. See the module header for the pipeline and
 * its ordering constraints.
 */
export function findUnbalancedQuoteLines(
  strippedCode: string
): Array<{ index: number; line: string; quoteCount: number }> {
  const normalized = stripRustEscapes(stripRustRawStrings(strippedCode))
  return joinContinuedLogicalLines(normalized.split('\n'))
    .map(({ index, line }) => ({
      index,
      line,
      quoteCount: (stripRustCharLiterals(line).match(/"/g) ?? []).length
    }))
    .filter(({ quoteCount }) => quoteCount % 2 !== 0)
}
