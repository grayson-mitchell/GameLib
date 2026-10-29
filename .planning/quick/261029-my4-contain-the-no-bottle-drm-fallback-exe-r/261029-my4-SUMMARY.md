# Quick 261029-my4: Contain the no-bottle DRM fallback exe reads

**One-liner:** placeShimForGame's no-bottle fallback now scans only a realpath-contained exe (shared `containedGameExeReal` helper) for both SteamStub and CEG detection.

## Commits
- 7f9f09d16 test: failing my4 tests (RED)
- 1bff92963 fix: containment (GREEN)
- 7cae67d74 docs: close todo with Resolution

## Changes
- drmScanExe.ts: `containedReal` takes a `label` (m0u log strings unchanged); new exported `containedGameExeReal(exePath, label)`, never throws.
- shimGenerate.ts: no-bottle branch calls it once; the contained real path feeds `detectDrmWrapper` and `detectExeSteamDrm`; a refused exe gives no drmWrapper, no drm, plus a warning. `detectDrmWrapper` doc updated.
- shimGenerate.test.ts: 3 tests (escaping symlink with SteamStub, escaping symlink with CEG, contained control). The branch is forced with a one-shot `resolveBridgeBottleName` spy (null on second call). Both escaping tests failed before the fix.

## Verification
jest shimGenerate + drmScanExe: 129/129 pass. tsc, eslint, scoped prettier clean. `containedGameExeReal(` appears once in shimGenerate.ts. `pnpm planning-gates` 12/12.

## Deviations
None. Note: the todo file showed as a modification (not a rename) in the docs commit stat, but it is under completed/ and gone from pending/.

## Follow-up candidates (out of scope)
`readFileEffectiveArch` in `withDrmWrapper` and the import scan in `placeShimForGameInner` still read the lexical exe path (bounded header reads).

## Self-Check: PASSED
