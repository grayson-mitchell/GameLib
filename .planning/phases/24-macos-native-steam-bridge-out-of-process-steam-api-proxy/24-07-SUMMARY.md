---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 07
subsystem: infra
tags: [steam, macos, bridge, packaging, zig, clang, cross-compile, meta-scripts, electron-builder]

# Dependency graph
requires:
  - phase: 24-01
    provides: "native/steam-bridge/generated/steam_api_shim.c + steam_api.def -- committed generator output this plan's zig-cc compile gate assembles; builtBridgeShimPath (BLOCKER 2 contract) this plan writes to"
  - phase: 24-02
    provides: "native/steam-bridge/helper/bridge_helper.c -- committed native helper source this plan compiles with clang"
provides:
  - "meta/downloadZig.ts -- pinned (0.16.0), checksum-verified zig tarball downloader to a build-tooling dir (.build-tools/zig), never public/bin"
  - "meta/buildSteamBridgeShims.ts -- packaging-time native build: clang helper compile + zig-cc PE shim COMPILE GATE, both argv-form"
  - "public/bin/${process.arch}/darwin/steam-bridge-helper + steam_api.dll + steam_appid.txt -- the bundled runtime artifacts (built, not committed)"
  - "pnpm build-steam-bridge script, hooked into dist:mac/release:mac before electron-vite build"
affects: [24-08-routing, 24-09-fallback-dialog, 24-10-hardware-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "meta/*.ts build-tooling download (RELEASE_TAGS-shaped pin + ziglang.org/download/index.json fetch + sha256 TOFU verify), separate from the public/bin/** bundled-binary convention"
    - "Real (not structural-only) compile gate inside a meta/ packaging script: non-zero exit or missing output artifact throws and fails the build, proven by actually running the toolchain during this plan's execution, not just asserted by a mocked test"
    - "Cross-module meta/ import (buildSteamBridgeShims.ts imports downloadZig.ts's exported downloadZig()) rather than each script re-implementing its own toolchain acquisition"

key-files:
  created:
    - meta/downloadZig.ts
    - meta/buildSteamBridgeShims.ts
    - meta/__tests__/buildSteamBridgeShims.test.ts
    - native/steam-bridge/steam_appid.txt
  modified:
    - package.json
    - .gitignore
    - public/bin/.gitignore

key-decisions:
  - "Pinned zig 0.16.0 (latest stable aarch64-macos build available in ziglang.org's index at execution time), not a version referenced in RESEARCH.md (which predated the current index) -- verified against the live index.json, not assumed"
  - "zig extracts to .build-tools/zig (new build-tooling directory, gitignored) rather than reusing any existing cache convention -- no existing repo precedent for a non-bundled build-time toolchain directory"
  - "buildSteamBridgeShims.ts independently reconstructs public/bin/${arch}/darwin paths rather than importing src/backend/constants/paths.ts's builtBridgeShimPath/steamBridgeHelperPath -- paths.ts imports Electron's `app` at module load and would crash under plain `node` (this meta script's runtime); the join() segments are kept byte-for-byte identical to publicDir's own dev-time resolution instead"
  - "zig cc -shared requires an explicit -lws2_32 link flag for the shim's winsock2.h usage -- confirmed necessary by running the real compile gate, not assumed from RESEARCH.md"
  - "native/steam-bridge/steam_appid.txt is a committed, static source file (content: exactly '480', no trailing newline, matching bridge_helper.c's own fputs(\"480\", f) convention) that buildSteamBridgeShims.ts copies (never regenerates) to the bundled location -- keeps the D-04 identity AppID single-sourced from one committed file"

patterns-established:
  - "Compile-gate meta scripts assert BOTH process exit code AND the expected output artifact's existence (existsSync check) before declaring success -- a zero exit with a missing file is treated as a gate failure, not a pass"
  - "meta/ test files use structural source-text assertions (readFileSync + regex/toMatch) for steps that touch non-configurable node:fs/promises exports (chmod), continuing the 21-02/24-01 precedent of never attempting jest.spyOn/jest.mock on those APIs"

requirements-completed: [R5]

# Metrics
duration: ~35min
completed: 2026-07-20
---

# Phase 24 Plan 07: macOS Native Steam Bridge -- Packaging (Zig Download + Compile Gate) Summary

**Two new meta/ build scripts (`downloadZig.ts` pinned+checksum-verified zig fetcher, `buildSteamBridgeShims.ts` clang-helper-compile + zig-cc-shim-compile-gate) wired into `dist:mac`/`release:mac`; the real zig-cc compile gate was actually run end-to-end during this plan (not just asserted structurally) -- zig 0.16.0 downloaded, checksum-verified, and used to compile 24-01's committed generated shim source into a genuine PE32 `steam_api.dll`, alongside a clang-compiled arm64 `steam-bridge-helper` and a staged `steam_appid.txt`, all landing at the single shared `public/bin/arm64/darwin/` location `builtBridgeShimPath`/`steamBridgeHelperPath` already point to.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-20T07:38:22Z
- **Completed:** 2026-07-20T08:38:53Z
- **Tasks:** 2
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- **`meta/downloadZig.ts`** (Task 1): fetches `ziglang.org/download/index.json`, pins zig `0.16.0` (a literal version, verified live against the current index -- not "latest"), sha256-verifies the downloaded tarball against the index-published shasum (T-24-SC) before ever extracting it, and lands the toolchain at `.build-tools/zig` -- a build-tooling directory, never `public/bin/**`. Skips re-download via a version-marker check (drift-detection idiom from `compareDownloadedTags`).
- **`meta/buildSteamBridgeShims.ts`** (Task 2): compiles `native/steam-bridge/helper/bridge_helper.c` with system `clang` to `public/bin/${process.arch}/darwin/steam-bridge-helper` + `chmod 755`; stages the committed `native/steam-bridge/steam_appid.txt` (=480) next to it; obtains zig via `downloadZig()` and cross-compiles `native/steam-bridge/generated/steam_api_shim.c` + `.def` (24-01's committed generator output) via `zig cc -target x86-windows-gnu -shared -lws2_32` to `public/bin/${process.arch}/darwin/steam_api.dll` -- the single shared bundled location matching `builtBridgeShimPath` byte-for-byte (BLOCKER 2). All three compiler/tar invocations are argv-form `spawn()` (T-24-06), never shell strings.
- **The compile gate actually ran, live, during this plan's execution** (not merely asserted by a mocked/structural test): `pnpm build-steam-bridge` downloaded+verified zig 0.16.0, compiled the arm64 helper (`file` confirms `Mach-O 64-bit executable arm64`), and cross-compiled the shim (`file` confirms `PE32 executable (DLL) ... Intel 80386, for MS Windows`) with exit 0. Re-ran a second time to confirm the idempotent "already downloaded" skip path also works.
- **`meta/__tests__/buildSteamBridgeShims.test.ts`**: 12 structural tests (argv/target/output-path construction, BLOCKER 2 single-location assertion, chmod-755 source-text assertion) -- deliberately does NOT invoke real clang/zig itself; the real toolchain proof is `pnpm build-steam-bridge` having actually been run, per above.
- **`package.json`**: registered `build-steam-bridge` script; hooked it into `dist:mac` and `release:mac` before `electron-vite build`. No `electron-builder.yml` change needed (`mac.files`/`asarUnpack` already cover `build/bin/${arch}/darwin/*`).
- Gitignore hygiene: added `/.build-tools/` (never-committed zig toolchain) and extended `public/bin/.gitignore` to cover the built helper/shim/appid plus `zig cc -shared`'s own `.pdb`/`.lib` byproducts (discovered by actually running the build -- see Deviations).

## Task Commits

Each task was committed atomically:

1. **Task 1: meta/downloadZig.ts -- pinned zig tarball downloader** - `2ac2ffe8` (feat)
2. **Task 2: meta/buildSteamBridgeShims.ts -- clang helper + zig cc PE shim; npm wiring** - `9b29564c` (feat)

_Note: Task 2's commit was amended once, in-place, immediately after landing, to apply a `prettier --write` reformat of the same two just-committed files (no content/logic change) -- kept as a single commit rather than a separate cosmetic fix-up commit._

## Files Created/Modified

- `meta/downloadZig.ts` - Pinned (0.16.0), checksum-verified zig downloader; exports `downloadZig()` -> resolved binary path
- `meta/buildSteamBridgeShims.ts` - Packaging-time native build: helper compile, appid staging, shim compile gate; exports path/argv-construction functions for testing
- `meta/__tests__/buildSteamBridgeShims.test.ts` - 12 structural tests (paths, argv construction, BLOCKER 2, chmod-755 source assertion)
- `native/steam-bridge/steam_appid.txt` - Committed static source (`480`, no trailing newline) copied to the bundled location at build time
- `package.json` - Registered `build-steam-bridge`; hooked into `dist:mac`/`release:mac`
- `.gitignore` - Ignore `/.build-tools/` (the extracted zig toolchain)
- `public/bin/.gitignore` - Ignore the built helper/shim/appid + `zig cc`'s `.pdb`/`.lib` byproducts

## Decisions Made

- Pinned zig `0.16.0` after independently checking the live `ziglang.org/download/index.json` (RESEARCH.md predated this index snapshot and didn't name a specific version) -- verified `aarch64-macos` tarball + shasum present for this version before locking it in.
- `.build-tools/zig` chosen as the toolchain landing directory (new, gitignored) since no existing repo convention covers a non-bundled build-time-only tool.
- `buildSteamBridgeShims.ts` reconstructs bundled paths independently rather than importing `src/backend/constants/paths.ts` (which would crash under plain `node` due to its top-level `electron` `app` import) -- kept byte-for-byte identical to `publicDir`'s dev-time resolution via the same `join('public', 'bin', arch, 'darwin', ...)` segments.
- `-lws2_32` confirmed required for `zig cc -shared` to link the shim's `winsock2.h`-based socket code -- discovered by running the real compile, not assumed from research prose.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended `public/bin/.gitignore` for `zig cc -shared`'s own byproduct files**
- **Found during:** Task 2, after running the real compile gate
- **Issue:** `zig cc -target x86-windows-gnu -shared` emits `steam_api.pdb` (debug symbols) and `steam_api_shim.lib` (import library) alongside `steam_api.dll` in the same output directory. The plan's `public/bin/.gitignore` additions only covered `steam-bridge-helper`/`steam_api.dll`/`steam_appid.txt`, leaving these two byproducts untracked and about to be accidentally committable.
- **Fix:** Added `**/steam_api.pdb` and `**/steam_api_shim.lib` to `public/bin/.gitignore`, discovered via `git status --short` after the real build run (which showed the whole `public/bin/arm64/darwin/` directory as untracked because of the un-ignored byproducts).
- **Files modified:** `public/bin/.gitignore`
- **Verification:** `git check-ignore -q` confirmed all five artifact patterns now ignored; `git status --short` no longer lists `public/bin/arm64/darwin/`.
- **Committed in:** `9b29564c` (Task 2 commit)

**2. [Rule 3 - Blocking] `prettier --write` reformat of both new TypeScript files**
- **Found during:** Post-commit hygiene check (not run as part of the plan's own `<verify>` commands, but required by CLAUDE.md's implicit project conventions and consistent with 24-01's own documented prettier pass)
- **Issue:** `npx prettier --check` flagged `meta/buildSteamBridgeShims.ts` and `meta/__tests__/buildSteamBridgeShims.test.ts` as not matching the project's `semi: false`/`singleQuote: true`/`trailingComma: none` style (multi-line function signatures collapsed differently than authored).
- **Fix:** Ran `prettier --write` on both files; re-ran the jest suite, `pnpm codecheck`, and `prettier --check` to confirm no regressions, then amended the change into the already-landed Task 2 commit (same files, no logic change).
- **Files modified:** `meta/buildSteamBridgeShims.ts`, `meta/__tests__/buildSteamBridgeShims.test.ts`
- **Verification:** `prettier --check` now clean; 12/12 tests still pass; `pnpm codecheck` clean.
- **Committed in:** `9b29564c` (amended into the Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking, both mechanical hygiene fixes discovered by actually running the real build/format tooling, not scope changes).
**Impact on plan:** No scope creep. Both fixes were necessary for a clean `git status` and the project's own style/format gates.

## Issues Encountered

None beyond the deviations above. `eslint` on the two new files reports 6 pre-existing-pattern warnings (`@typescript-eslint/no-unsafe-call`/`no-unsafe-member-access` on `data.toString()` inside `child.stdout.on('data', ...)` callbacks) -- zero errors, and the identical warning shape already exists in the project's other `spawn`-based code; not treated as a blocking issue.

## Known Stubs

None. Both scripts are fully functional, non-stubbed build tooling: `downloadZig()` performs a real network fetch + checksum + extraction (verified by actually running it), and `buildSteamBridgeShims.ts`'s compile gate performs a real `clang`/`zig cc` invocation (verified by actually running it and inspecting the resulting binaries with `file`). No placeholder logic, no hardcoded success paths.

## Threat Flags

None beyond the plan's own threat register. T-24-SC (zig tarball tampering) is mitigated as specified -- sha256 checksum verified against the index-published shasum before extraction, explicitly documented as TOFU (not true pinning) per the plan's own finding #12, an accepted minor residual. T-24-06 (argv-form spawn) is mitigated -- both `clang` and `zig cc` invocations use `spawn(command, args)` array form, asserted structurally by the test suite's `spawn(\`` / `exec(` negative-match guard.

## User Setup Required

None -- no external service configuration required. No npm/pip/cargo package installs occurred (0 new dependencies); zig is a build-time-only tarball download, not a package-manager install, and is outside the package-legitimacy gate per 24-RESEARCH.md's own "Package Legitimacy Audit: Not applicable this phase" finding.

## Next Phase Readiness

- The bundled artifacts (`steam-bridge-helper`, `steam_api.dll`, `steam_appid.txt`) now exist at `public/bin/arm64/darwin/` on this developer machine, at the exact locations `src/backend/constants/paths.ts`'s `steamBridgeHelperPath`/`builtBridgeShimPath` (24-01/24-06) already point to -- Plan 24-05's runtime shim placement and Plan 24-06's helper spawn logic can now be exercised against real, freshly-built binaries rather than only structurally-tested code paths.
- `pnpm build-steam-bridge` is a real, working, idempotent build step, ready to be invoked ahead of `electron-vite build` for a genuine packaged `.app` (R5's "dev-HW validated" packaging requirement) -- Plan 24-10's human hardware gate can now exercise an actual packaged build rather than a dev `yarn` run.
- **Explicitly NOT proven by this plan:** that the packaged `.app` itself (post `electron-builder`) correctly resolves/launches the bundled helper via `asarUnpack`, and that the compiled shim + helper actually round-trip a live Steam session end-to-end inside a real bottle -- both are Plan 24-10's human-hardware-gate scope, unchanged by this plan.

---
*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Completed: 2026-07-20*

## Self-Check: PASSED

- Created files verified present on disk: `meta/downloadZig.ts`, `meta/buildSteamBridgeShims.ts`, `meta/__tests__/buildSteamBridgeShims.test.ts`, `native/steam-bridge/steam_appid.txt` -- all FOUND.
- Commit hashes verified in `git log --oneline --all`: `2ac2ffe8` FOUND, `9b29564c` FOUND.
- Real compile-gate artifacts re-verified present: `public/bin/arm64/darwin/steam-bridge-helper` (Mach-O arm64), `public/bin/arm64/darwin/steam_api.dll` (PE32 DLL), `public/bin/arm64/darwin/steam_appid.txt` (content `480`).
- Automated verify re-run: `pnpm jest meta/__tests__/buildSteamBridgeShims.test.ts` -> 12/12 pass; `pnpm codecheck` -> clean; `prettier --check` -> clean.
