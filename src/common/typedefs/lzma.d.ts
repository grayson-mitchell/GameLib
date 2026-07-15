/**
 * Types for the `lzma` javascript package (pure-JS LZMA compression).
 * https://github.com/nmrugg/LZMA-JS
 *
 * Phase 21 (21-01): used by depot/decompress.ts (structurally, via the local
 * LzmaModule interface) and directly by depotPrimitives.test.ts fixtures.
 */
declare module 'lzma' {
  /** NOTE: mode 1-9 (1 is fast and pretty good; 9 is slower and probably much better). */
  export function compress(
    input: Buffer | number[] | string,
    mode: number,
    onFinish: (result: number[] | Buffer, error?: Error) => void
  ): void

  export function decompress(
    input: Buffer | number[],
    onFinish: (result: number[] | Buffer | string, error?: Error) => void
  ): void
}
