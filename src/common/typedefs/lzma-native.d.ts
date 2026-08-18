/**
 * Types for the `lzma-native` npm package (native liblzma binding), written
 * against v8.0.6 -- the exact-pinned version this project depends on
 * (23.1-02-SUMMARY.md). `@types/lzma-native` was deliberately NOT installed:
 * it is published at 4.0.4, against the package's OLD v4 API -- materially
 * stale versus this project's pinned v8.0.6, and adopting it would pull an
 * unvetted, mismatched-version package past this phase's own
 * package-legitimacy gate for no benefit (23.1-RESEARCH.md's Package
 * Legitimacy Audit). This file declares ONLY the surface
 * src/backend/storeManagers/steam/depot/lzmaLoader.ts actually uses -- not
 * `lzma-native`'s whole API -- the same minimal-surface discipline
 * src/common/typedefs/lzma.d.ts already established for the sibling pure-JS
 * `lzma` package.
 */
declare module 'lzma-native' {
  /**
   * Minimal shape of the Transform-stream object `createStream()` returns
   * (verified directly this phase: `lzma-native`'s real `getStream()` result
   * is a Node `stream.Transform`, which satisfies all three members below).
   * Only the events/methods `lzmaLoader.ts`'s adapter actually calls.
   */
  export interface LzmaNativeStream {
    on(event: 'data', listener: (chunk: Buffer) => void): this
    on(event: 'end', listener: () => void): this
    on(event: 'error', listener: (err: Error) => void): this
    end(chunk?: Buffer): void
  }

  /**
   * `lzmaLoader.ts` calls this with `'aloneDecoder'` -- the legacy LZMA1/
   * `lzma_alone` decoder RESEARCH.md confirmed decodes Steam's VZ depot
   * chunk format byte-for-byte (23.1-RESEARCH.md's Pitfall 1 finding: most
   * modern LZMA packages only speak the newer `.xz` container, which
   * `lzma-native`'s `'aloneDecoder'` coder name deliberately does not).
   */
  export function createStream(
    coder: string,
    options?: Record<string, unknown>
  ): LzmaNativeStream
}
