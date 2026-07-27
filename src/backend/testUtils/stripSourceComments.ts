/**
 * The single shared comment-stripping implementation for backend source-text
 * gates (quick task 260726-q8f, closing the round-4 blocker recorded in
 * `34.2-VERIFICATION.md`'s override block).
 *
 * Context: 14 backend test files carried a byte-identical, line-prefix-only
 * `stripComments` helper (plus one inline copy of the same chain), and a
 * 15th, structurally-correct-but-not-shared copy
 * (`stripCommentsForNodeOsGate` in `structuralContainment.test.ts`) used a
 * naive trailing-comment regex. Both defects independently rotted a source
 * gate: the line-prefix-only form lets a NON-`*`-prefixed block comment that
 * merely NAMES a forbidden pattern (e.g. `jest.mock('os', ...)`) satisfy a
 * gate built to detect real occurrences of that pattern, because the
 * comment's interior lines never begin with a comment marker themselves.
 *
 * Two-stage order, and why the line filter is retained rather than replaced:
 * 1. Strip block comments first (`/\/\*[\s\S]*?\*\//g`) — this closes the
 *    vacuous-gate defect: no NON-`*`-prefixed block-comment interior can
 *    survive to be matched by a gate's regex.
 * 2. THEN apply the pre-existing line-prefix filter UNCHANGED — this is
 *    deliberately preserved rather than swapped for a naive `/\/\/.*$/gm`
 *    trailing-comment pass. That naive regex is exactly what plan 34.2-28
 *    removed as WR-08: it truncates a code line containing a quoted
 *    `"steam://..."` (or any `//`-bearing) string literal, because the
 *    regex cannot distinguish a `//` inside a string from a real comment
 *    marker. Retaining the line-prefix filter (which only drops WHOLE lines
 *    that themselves start with a comment marker) keeps that literal intact.
 *
 * Known, accepted limitation: a trailing `//` comment appended to a code
 * line (e.g. `const x = 1 // note`) is NOT stripped — the trailing comment
 * text survives in the output alongside the code. This is intentional: the
 * alternative (the naive `/\/\/.*$/gm` pass) is the WR-08 regression class
 * this util exists to avoid. Callers whose gate needs trailing-comment
 * stripping should layer `stripTrailingLineComment` (below) on top of this
 * util's output — do not add a naive pass here, and do not hand-roll a
 * `/\/\/.*$/` replace at the call site.
 */
export function stripSourceComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
}

/**
 * Drops a trailing `// ...` comment from a single line WITHOUT truncating a
 * `//`-bearing string literal — the string-literal-aware replacement for the
 * naive `line.replace(/\/\/.*$/, '')` pass that two source gates
 * (`longRunningChannels.test.ts`, `tauriShellSource.test.ts`) previously
 * layered on top of `stripSourceComments`.
 *
 * Why this now exists (WR-08 resolution): the naive pass was documented as an
 * accepted tradeoff on the grounds that no assertion matched against a
 * `//`-bearing literal. Phase 34.4.1's login-window arms broke that premise —
 * `main.rs`'s `#[cfg(test)]` fixtures assert on real `"https://..."`,
 * `"http://..."` and `"file:///..."` URLs, so the naive pass cut six code
 * lines in half and tripped the very stripper-integrity guard WR-08 predicted.
 * Per that guard's own instruction, the local pass was reconsidered rather
 * than the assertion weakened.
 *
 * Scanning rule: walk the line once, tracking whether the cursor sits inside a
 * double-quoted string (honouring `\` escapes), and cut at the first `//` seen
 * OUTSIDE a string. Rust char literals (`'/'`) and raw strings (`r"..."`,
 * `r#"..."#`) are not special-cased — a char literal cannot contain `//`, a
 * single-line raw string's delimiters are ordinary `"` to this scanner, and
 * `main.rs` (the only input) contains no `'"'` char literal that would flip
 * the in-string state spuriously.
 */
export function stripTrailingLineComment(line: string): string {
  let inString = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inString) {
      if (char === '\\') {
        i++
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '/' && line[i + 1] === '/') {
      return line.slice(0, i)
    }
  }
  return line
}
