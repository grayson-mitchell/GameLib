---
quick_id: 261023-tyf
status: complete
date: 2026-10-23
commits: [1ffb5b315, 9542cf97a, 28e67648f]
---

# Quick 261023-tyf: build the Steam bridge shims as release builds

Closes todo `2026-10-23-steam-bridge-shim-ships-as-debug-ubsan-build.md`.

## What changed

- `meta/buildSteamBridgeShims.ts`: an exported `SHIM_RELEASE_CFLAGS` (`-O2 -fno-sanitize=undefined`)
  is spread into both the x86 and x64 compile argv. `shimAbiGate.test.ts` now compiles with the
  same flags, so the THISCALL/hidden-pointer ABI gate tests release codegen (1ffb5b315).
- `meta/gen_vtables.ts`: the marker keepalive is now `const char *volatile` (it was
  `volatile const char *`). At -O2 the old form let the compiler delete the
  `GameLibSteamBridgeShim/2` marker. `steam_api_shim.c` was regenerated; its diff is only that
  line and its comment (9542cf97a).
- The todo is moved to completed with a `## Closed` section (28e67648f).

UBSan off rather than trap-only: trap mode would still abort Hoard on the same legal
4-byte-aligned `LARGE_INTEGER*`, just with a different signal.

## Measurements (`public/bin/arm64/darwin/`, built at package time, not committed)

| DLL | bytes before | bytes after | `misaligned address` | `GameLibSteamBridgeShim/2` | `127.0.0.1` |
|---|---|---|---|---|---|
| `steam_api.dll` (x86) | 894464 | 286720 | 1 → 0 | 1 → 1 | 1 → 1 |
| `steam_api64.dll` (x64) | 848896 | 223744 | 1 → 0 | 1 → 1 | 1 → 1 |

The export lists are unchanged (48 x86, 47 x64). The before-counts come from the planner's
measurement; they were not re-measured.

## Verification

- Five shim suites green, 235 tests: buildSteamBridgeShims, shimAbiGate (ran, not skipped),
  gen_vtables, shimCoverage, shimGenerate.
- Prettier is clean on the touched `.ts` files.
- `pnpm planning-gates` 11/12; the only failure is the pre-existing preload-surface-gate.

## Deviations

- At -O2 the x64 stub no longer reads `self`, so the old `mov %rcx,` matcher was replaced. The new
  assertions check that `%rdx` is the sret pointer, that it is returned in `%rax` and zero-stored,
  and that `%rcx` is never used as sret.
- The Task 1 tests were written alongside the implementation, so there was no separate RED run.
- The pre-existing eslint findings in `gen_vtables.test.ts` (no-regex-spaces) and
  `buildSteamBridgeShims.ts` (unsafe-any) are left alone.

## Not verified

- No live game launch against the release shim. The spike 033 run C panic is fixed because the
  sanitizer runtime is no longer in the DLL, not because it was replayed.
- Existing `GameLibSteamBridge-*` bottles should pick up the new shim on their next launch, via
  `placeShimForGame`'s byte-identity check. That comes from reading the code, not from a test.
  51-29's sample launches will exercise it.
