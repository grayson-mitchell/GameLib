/**
 * Minimal types for the `js-yaml` package (already present transitively via
 * eslint's own dependency tree -- no new package was installed for this).
 * https://github.com/nodeca/js-yaml
 *
 * Phase 34.9 Plan 04: used by runnersOnedirWorkflow.test.ts to parse
 * .github/workflows/build-runners-onedir-macos.yml structurally, so a
 * reordered-but-equivalent matrix does not produce a false test failure.
 * Only the single export this repo actually uses is declared.
 */
declare module 'js-yaml' {
  export function load(input: string): unknown
}
