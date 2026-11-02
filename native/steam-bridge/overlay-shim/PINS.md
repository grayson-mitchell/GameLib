# overlay-shim pins (Phase 60 plan 01)

Human-readable record of the vendored NotProton overlay shim. The test
`meta/__tests__/overlayShimVendor.test.ts` is the authority; this file is the record.

## Source

- Upstream `NotProtonNot/NotProton` @ `0c798e7148efe279627573f864210064788b427c`, path `overlay-shim/overlay_shim.m`.
- Git blob: `194b5fba7c0f145a9d7e227fc5ace2e2333e2299`
- sha256: `d6924aa4b330059dfa1212340a34f8081ea949cc8c82cfc2875ca6f0964687e5`
- Licence: GPL-3.0 (`LICENSE` beside this file, fetched at the same commit).

## Build

`pnpm build-steam-bridge` compiles it to a universal (arm64 + x86_64), ad-hoc-signed
`public/bin/<arch>/darwin/overlay_shim.dylib`. The dylib is git-ignored and never committed.

## Re-pin procedure

1. Fetch `overlay-shim/overlay_shim.m` and `LICENSE` at the new commit into a scratch directory.
2. Compute `shasum -a 256` and `git hash-object` on the scratch copy.
3. Copy the files in byte for byte.
4. Update this file, `NOTICE` and the constants in `meta/__tests__/overlayShimVendor.test.ts` together.

`overlay-shim/tests/` upstream is deliberately not vendored.
