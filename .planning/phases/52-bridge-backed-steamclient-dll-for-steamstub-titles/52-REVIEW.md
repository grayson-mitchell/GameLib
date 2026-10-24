---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
reviewed: 2026-10-24T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - native/steam-bridge/steamclient/steamclient_fwd.rc
  - meta/buildSteamBridgeShims.ts
  - meta/__tests__/buildSteamBridgeShims.test.ts
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 52: Code Review Report (gap closure 3 only, plans 52-25..52-28)

**Reviewed:** 2026-10-24
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

This review covers gap closure 3 only (diff `e312c72ba..HEAD`). The runtime outcome (Application Load Error persists) is a functional result and is not reported here.

## Summary

The change adds a VS_VERSIONINFO `.rc` and appends it to the zig cc argv. The .rc contains no Valve identity strings. A grep for "valve" returns nothing. The only "steam" hits are `steamclient forwarder`, `steamclient_fwd` and `steamclient64.dll`, which are GameLib's own names. The .rc syntax is well formed. The argv passes the .rc as a plain positional input after the `.c`, so the import `.lib` is still named after the first source (`steamclient_fwd.lib`) and the byproduct list stays correct. No critical issues. The gaps are in the build guard and the test.

## Warnings

### WR-01: Pre-flight existence guard does not cover the new .rc input

**File:** `meta/buildSteamBridgeShims.ts:639-644`
**Issue:** `compileSteamClient64` fails early with a clear message if `STEAMCLIENT_FWD_SOURCE_PATH` is missing. It never checks `STEAMCLIENT_FWD_RC_PATH`, which is now a required compile input. If the .rc is missing, renamed or not committed, the failure becomes an opaque zig error after the toolchain download. The relative path is also cwd-dependent, like the `.c` path.
**Fix:**
```ts
for (const p of [STEAMCLIENT_FWD_SOURCE_PATH, STEAMCLIENT_FWD_RC_PATH]) {
  if (!existsSync(p)) {
    throw new Error(`Missing steamclient forwarder input (${p}) (52-26)`)
  }
}
```

### WR-02: Test does not pin argv order or that the .rc is passed as its own input

**File:** `meta/__tests__/buildSteamBridgeShims.test.ts:560-562`
**Issue:** The test only uses `toContain`. It does not pin that the `.c` comes before the `.rc`, and the argv-order dependency is real. `STEAMCLIENT64_BUILD_BYPRODUCTS` hard-codes `steamclient_fwd.lib`, which zig derives from the first source. If the order flips, the import lib becomes `steamclient_fwd.lib` or something else and the prune silently misses it, leaking a `.lib` into the shipped `.app`. That is the regression todo item 6 fixed. The assertion `STEAMCLIENT_FWD_RC_PATH.endsWith('steamclient_fwd.rc')` only restates the constant, so it is tautological. The test also does not check that the .rc file exists on disk.
**Fix:**
```ts
expect(args.indexOf(STEAMCLIENT_FWD_SOURCE_PATH)).toBeLessThan(
  args.indexOf(STEAMCLIENT_FWD_RC_PATH)
)
expect(args.slice(-2)).toEqual([STEAMCLIENT_FWD_SOURCE_PATH, STEAMCLIENT_FWD_RC_PATH])
expect(existsSync(STEAMCLIENT_FWD_RC_PATH)).toBe(true)
```
Drop the `endsWith` line.

## Info

### IN-01: Doc comment on `buildSteamClient64CompileArgv` is stale

**File:** `meta/buildSteamBridgeShims.ts:236-237`
**Issue:** The comment still says "no .def ... kernel32 only" and does not mention the resource input. Nothing records that `.rc` handling relies on zig's built-in resource compiler (`#include <winver.h>` resolves through zig's bundled mingw headers). Nothing records that the .rc must stay after the `.c` (see WR-02).
**Fix:** Add one line to the comment: "The .rc must follow the .c (the import-lib name derives from the first source)."

---

_Reviewed: 2026-10-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
