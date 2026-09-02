---
phase: quick-260902-pwy
plan: 01
status: complete
date: 2026-09-02
commit: b79765af2
files_modified:
  - src/backend/storeManagers/steam/depot/lzmaLoader.ts
---

# Quick Task 260902-pwy — Summary

Fixed `createNativeAdapter()` in `src/backend/storeManagers/steam/depot/lzmaLoader.ts` so the
native LZMA decoder accepts the only alone-stream shape this codebase produces. One commit,
`b79765af2`, +95/−3, one file.

## Root cause

`lzma-native@8.0.6` bundles **liblzma 5.2.3** (read back at runtime via
`lzman.versionString()`). That version's `lzma_alone_decoder` **rejects a stream that declares a
KNOWN uncompressed size while also carrying an end-of-stream marker**, failing it with
`Data is corrupt`. The system `xz 5.8.3` decodes the identical bytes correctly — the stream is
valid, and this is a bundled-library version difference.

Known-size + EOS is not an edge case here, it is the *only* shape produced:

- the pure-JS `lzma@2.3.2` package writes it, and `SMOKE_TEST_COMPRESSED` is byte-identical to
  what that package emits today (re-derived and compared — **the fixture was never stale**);
- `decompress.ts:182-187`'s real VZ branch rebuilds its alone header as
  `props(5) + uncompressed size(8, LE)` — also known-size.

So `smokeTest()` was correctly refusing to trust the native module, `resolveLzmaModule()` was
correctly falling back to pure-JS, and `lzmaDecoderKind()` correctly reported `'pure-js'`. The
three failing assertions were reporting a **real** defect, not drift.

It went unnoticed because lzma-native's own `aloneEncoder` emits an **unknown** size
(`5d 00 00 10 00 ff ff ff ff ff ff ff ff`), so the library's self-round-trip never reaches the
rejecting path. Only a stream from a different encoder does.

## Scope note — this was a latent production defect, not just a test failure

Native decode ships **off** (`NATIVE_LZMA_DECODE_ENABLED = false`), so nothing was degraded in
production. But the moment that switch is ever flipped, **every real Steam VZ chunk** would have
hit this rejection, because `decompress.ts` builds exactly the header liblzma 5.2.3 refuses.
The kill switch was masking a second, unrelated defect underneath it.

## What changed

Confined to `createNativeAdapter()`:

1. When the input carries an alone header (`length >= 13`) whose 8-byte size field is not
   already all-`0xFF`, read the declared size and rewrite that field to "unknown" **on a copy** —
   the caller's buffer is never mutated. Bisection proved this field alone is the variable;
   dictionary size is not a factor.
2. `'end'` → callback with the output truncated to the declared size.
3. `'end'` with **fewer** bytes than declared → surfaced as an error, re-asserting the length
   check the size field was buying.
4. `'error'` → recover only when the decoder already emitted `>= declaredSize` bytes (the
   no-EOS case; liblzma emits every decodable byte before erroring). Otherwise the original
   error propagates unchanged.
5. The existing `settled` double-callback guard still covers every path.

Guard 3 was **found by probe, not by review**. The first draft treated a clean `'end'` as
success regardless of length, so an over-declared size returned a short buffer with no error —
silently relaxing an integrity check while the change was being presented as a pure bug fix.

## Verification

| Gate | Result |
|---|---|
| `decompressPool.test.ts` | **41/41** (was 38/41) |
| whole `storeManagers/steam/__tests__/` | 36 suites, **1356 passed**, 2 skipped |
| `tsc --noEmit` | clean |
| `eslint` on the changed file | clean |
| `prettier --check` on the changed file | clean |
| test files changed | **0** |
| `NATIVE_LZMA_DECODE_ENABLED` | still `false` |
| `SMOKE_TEST_COMPRESSED` / `_PLAINTEXT` | byte-identical |

Out-of-jest probe against the real bundled module (esbuild → CJS, real `lzma-native`), since
the suite does not assert these directly:

1. `lzmaDecoderKind()` → `native`
2. a **14 KB production-shape VZ stream** (props + known size + payload, exactly
   `decompress.ts`'s construction) decodes natively and byte-correctly
3. the caller's buffer is **not** mutated
4. an over-declared size still errors
5. a garbage payload still errors
6. the shared module-scope smoke fixture survives repeated native loads

Side effect worth recording: the byte-equivalence test
("output is byte-identical to the pure-JS lzma package") was **vacuous** before this fix — the
native side had silently fallen back, so it compared pure-JS against pure-JS. It now genuinely
compares the two decoders.

## Deliberately not done

`NATIVE_LZMA_DECODE_ENABLED` stays `false`. This makes the adapter correct; it does **not**
adjudicate the SEA real-chunk decode hang documented in
`.planning/debug/sea-native-lzma-real-chunk-decode-hang.md`, and none of that file's three
re-enable criteria (cold SEA build self-test, un-skipping `lzmaNativeSeaRealBuild.test.ts`, a
live depot install) were exercised. Note that the debug file's own "CRITICAL CORRECTION" entry
records the hang reproducing with native already **off**, so this fix is not expected to be the
answer to it.
