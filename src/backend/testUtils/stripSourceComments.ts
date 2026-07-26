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
 * stripping and can prove their own matcher never touches string literals
 * may layer an additional, LOCAL pass on top of this util's output — do not
 * add one here.
 */
export function stripSourceComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
}
