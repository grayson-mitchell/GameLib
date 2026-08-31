---
phase: quick-260901-8rm
plan: 01
subsystem: build
tags: [tauri, macos, bundle-size, packaging, config]

requires: []
provides:
  - "Per-platform tauri.{macos,windows,linux}.conf.json overlays narrowing bundle.resources bin trees"
  - "Merged-map config test coverage (packagingConfig.test.ts) proving base+overlay shape per platform"
  - "Measured packaged-macOS-artifact census (260901-8rm-MEASUREMENTS.md) confirming Tauri's platform-config merge is DEEP"
  - "Executable brief for fix (2) (frontendDist repointing) with two costed candidate designs"
affects: [build, packaging, macos-bundle-size, tauri-config]

tech-stack:
  added: []
  patterns:
    - "Tauri platform overlays (tauri.{platform}.conf.json) narrow bundle.resources per-platform; the base config must not carry a wholesale entry an overlay can only add to, never remove"
    - "In-test merged-map reconstruction ({...base, ...overlay}) to assert shape invariants over what actually ships, not just the base config"

key-files:
  created:
    - src-tauri/tauri.macos.conf.json
    - src-tauri/tauri.windows.conf.json
    - src-tauri/tauri.linux.conf.json
    - .planning/quick/260901-8rm-shrink-tauri-macos-bundle-narrow-bundle-/260901-8rm-MEASUREMENTS.md
  modified:
    - src-tauri/tauri.conf.json
    - src/backend/__tests__/packagingConfig.test.ts
    - .planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md

key-decisions:
  - "Removed the wholesale ../build/bin/ entry from the base tauri.conf.json rather than shadowing it — a Tauri platform overlay can only add/override a key onto the base, never remove one"
  - "macOS overlay statically carries BOTH arm64/darwin and x64/darwin (not just the host arch) because the release workflow still builds both legs and a static per-arch overlay would risk shipping a macOS bundle with zero darwin runners on a forgotten-flag build; costs ~44MB, deferred to Phase 34.18"
  - "steam_api.pdb/steam_api_shim.lib removal kept as a separate future item, not folded into fix (2) — different mechanism (build-flag change vs resource-mapping change)"

requirements-completed: [TODO-2026-08-28-BUNDLE-SIZE-FIX-1]

duration: ~25min
completed: 2026-09-01
---

# Quick 260901-8rm: Narrow Tauri macOS bundle.resources into per-platform overlays Summary

**Removed the wholesale `bin/` resource entry from the base Tauri config and replaced it with three per-platform overlay files, proved on a real packaged macOS DMG that the merge is deep (not a shallow replace) and saves ~124.7MB, and converted the still-open `frontendDist` fix into a costed two-design executable brief.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3/3 completed
- **Files modified/created:** 7 (3 new config overlays, 1 modified base config, 1 modified test file, 1 new measurements doc, 1 rewritten todo)

## Accomplishments

- Closed fix (1) of the 2026-08-28 bundle-size todo: a packaged macOS artifact now ships only `bin/arm64/darwin`, `bin/x64/darwin`, and the two `x64/win32` Wine exes it genuinely executes — not all six platform×arch runner trees.
- Proved the fix on a real `tauri build --debug` DMG artifact (not a config-only check, not `tauri:dev`), and used that same artifact to empirically confirm Tauri's platform-config merge is DEEP: the base's four non-bin resource entries (`locales`, `changelog.json`, `webviewPreload.js`, `icon.png`) all survived being merged with a bin-only overlay. The plan's designed STOP condition (shallow-replace) did not trigger.
- Confirmed fix (1) and fix (2) remain independently attributable: `__const` (235,074,112 bytes) and the embedded `bin/x64/win32/gogdl.exe` string were unchanged by this plan's edits.
- Rewrote the fix-(2) todo from a false one-line sketch ("point frontendDist at build/renderer") into an executable brief naming both webview-reachable relative-URL consumers that would silently break, two costed candidate designs, and the five pinned assertions any implementation must update.

## Task Commits

1. **Task 1: Replace the wholesale bin resource entry with three per-platform overlays** - `8cdbf4272` (feat)
2. **Task 2: Prove it on a real packaged artifact and record the fix-(2) baseline** - `b430ff975` (docs)
3. **Task 3: Rewrite the fix-(2) todo as an executable brief** - `91e49f361` (docs)

_Note: Task 2's plan action produced no source-code changes — only the measurements doc — so its commit type is `docs`, matching what was actually staged._

## Files Created/Modified

- `src-tauri/tauri.conf.json` - removed the wholesale `../build/bin/: build/bin` entry; the four other resource entries (locales, changelog.json, webviewPreload.js, icon.png) are unchanged
- `src-tauri/tauri.macos.conf.json` (new) - macOS overlay: `arm64/darwin`, `x64/darwin` dirs; the two `x64/win32` Wine exe file entries; `legendary.LICENSE`
- `src-tauri/tauri.windows.conf.json` (new) - Windows overlay: `x64/win32`, `arm64/win32` dirs; `legendary.LICENSE`
- `src-tauri/tauri.linux.conf.json` (new) - Linux overlay: `x64/linux`, `arm64/linux` dirs; the two `x64/win32` Wine exe file entries; `legendary.LICENSE`
- `src/backend/__tests__/packagingConfig.test.ts` - added a `mergedResourceMap(platform)` helper and re-ran the existing shape invariants over base+overlay merges for all three platforms instead of the base alone; added a negative guard (base carries no `bin/` key), per-platform Wine-exe coverage checks (path-coverage-aware, since Windows ships the exes via a directory entry while macOS/Linux ship them as explicit file entries), cross-platform exclusion checks, and anti-vacuity checks (overlay parses, merged map has strictly more keys than base)
- `.planning/quick/260901-8rm-shrink-tauri-macos-bundle-narrow-bundle-/260901-8rm-MEASUREMENTS.md` (new) - full packaged-artifact census: file-tree presence/absence, size deltas, `__const`/`__text`/gogdl-strings baseline, `tauri-codegen-assets` staging size, explicit statement that only the macOS overlay was exercised in this run
- `.planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md` - fix (1) marked DONE with a pointer to this quick task's measurements; fix (2) rewritten with both relative-URL consumers, two candidate designs (D1: move outDir; D2: keep frontendDist, stop copying bin/ into it — open question is symlink preservation), five pinned assertions with current/updated line citations, and the proof method

## Decisions Made

- Removed the wholesale `bin/` entry from the base config rather than attempting to shadow it — Tauri platform overlays can only add/override keys onto the base, never remove one, so leaving the wholesale entry in place would have made every overlay decorative.
- Kept both `arm64/darwin` and `x64/darwin` in the macOS overlay (not host-arch-only) because `.github/workflows/release-tauri.yml` still builds both legs and a per-arch overlay flag could silently ship an arm64 DMG with zero darwin runners if the flag were forgotten. This costs ~44MB of the possible savings; documented as a known tradeoff, not implemented, per the plan's explicit instruction.
- Test assertion for "both win32 Wine exes are covered" needed to be path-coverage-aware rather than a plain substring match: the Windows overlay ships the whole `x64/win32/` directory (which already contains those two exes among four others), while macOS/Linux ship them as narrow, explicit file entries. A naive substring check on the Windows merged map failed on first run; fixed by writing a small directory-vs-file coverage helper that mirrors how `tauri_utils::resources` actually walks a directory entry.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `.app` not present at the plan's assumed relative path**
- **Found during:** Task 2
- **Issue:** The Task 2 verify script assumes `src-tauri/target/debug/bundle/macos/GameLib.app` persists after `tauri build --debug`. On this run, Tauri built the `.app` as an intermediate, bundled it into a DMG (`dmg` is the only macOS target listed in `bundle.targets`; `app` is not), and then deleted the intermediate `.app` directory once the DMG bundle finished — the build log shows `Cleaning .../GameLib.app` immediately before `Finished 1 bundle`.
- **Fix:** Mounted the resulting DMG read-only (`hdiutil attach -nobrowse -readonly`) and ran every census/gate check against `/Volumes/GameLib/GameLib.app` instead — this is a read-only view of the exact same shipped artifact, not a different build. Detached the volume after the census completed.
- **Files modified:** None (read-only inspection only).
- **Committed in:** n/a (no code change; documented in `260901-8rm-MEASUREMENTS.md`)

**2. [Rule 1 - Bug] Plan's literal `size -m | awk '{print $2}'` gate line mis-parses this host's `size` output format**
- **Found during:** Task 2
- **Issue:** Running the plan's verify script verbatim produced `__const=__const:` (the literal label, not the byte count) because this host's BSD `size -m` output is `\tSection __const: 235074112` — the numeric value is field 3, not field 2, and there are two distinct `__const` sections in the binary (`__TEXT,__const` at 235,074,112 bytes and a much smaller `__DATA_CONST,__const` at 944,424 bytes), so a naive first-match-by-name grep is also ambiguous.
- **Fix:** Re-derived the same measurement with `awk '/Section __const:/{print $3; exit}'`, disambiguated to the `__TEXT,__const` section (the large one, matching the plan's own >150,000,000 threshold and the todo's prior 222,423,384-byte baseline from a release build). All downstream PASS/FAIL logic and thresholds are unchanged — only the field-extraction bug was corrected. Did not edit `PLAN.md`'s verify block; documented the corrected extraction inline in `260901-8rm-MEASUREMENTS.md` instead.
- **Files modified:** None (config/test files unaffected; correction lives only in the measurements doc's commentary).
- **Committed in:** `b430ff975` (measurements doc records both the corrected extraction and the resulting PASS)

**3. [Rule 1 - Bug] Naive substring test for Windows Wine-exe coverage failed on first run**
- **Found during:** Task 1
- **Issue:** `packagingConfig.test.ts`'s per-platform Wine-exe coverage test initially checked for the literal substring `x64/win32/EpicGamesLauncher.exe` in the merged map's keys, joined as text. This passed for macOS and Linux (which ship the exes as explicit file entries) but failed for Windows, whose overlay ships the whole `x64/win32/` directory as a single entry — the exe names never appear as their own keys.
- **Fix:** Replaced the substring check with a `mergedMapCoversBinPath` helper that walks the merge the same way `tauri_utils::resources` does: a directory-entry key (ending in `/`) covers every path beneath it; a file-entry key must match exactly. Re-ran the full suite — 37/37 passing.
- **Files modified:** `src/backend/__tests__/packagingConfig.test.ts`
- **Committed in:** `8cdbf4272`

---

**Total deviations:** 3 auto-fixed (2 blocking/environment, 1 test-logic bug). None required an architectural decision or user input.

**Impact on plan:** All three were caught and corrected before their respective task's commit. No task's `<done>` criteria were weakened to accommodate them — the underlying invariants (artifact-level proof, correct `__const` value, correct Wine-exe coverage per platform) were satisfied as designed, only the extraction/assertion mechanics needed correction.

## Threat Flags

None — this plan's threat register (T-8RM-01 through T-8RM-03) covers all new surface (resource-map narrowing, platform-config merge behavior, license-file retention), and Task 2's artifact gate directly exercised all three mitigations against a real build.

## Known Stubs

None.

## Issues Encountered

- `pnpm build-steam-bridge` had not yet been run in this checkout before Task 2's packaging attempt (`public/bin/arm64/darwin/` lacked `steam_api.dll`/`steam-bridge-helper`). Ran it as a stated prerequisite per the plan's Task 2 action — not a deviation, this was explicitly instructed.

## Next Phase Readiness

- Fix (2) (`frontendDist` repointing, ~212MB additional savings) is now a costed, executable brief at `.planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md`, ready to be planned as its own phase per the plan's `scoped_out` decision.
- Windows and Linux overlays have config-level test coverage only; a real CI matrix build on those platforms would give artifact-level proof matching what macOS now has.

## Self-Check: PASSED

Verified all created files exist and all commit hashes resolve in `git log`:

```
FOUND: src-tauri/tauri.macos.conf.json
FOUND: src-tauri/tauri.windows.conf.json
FOUND: src-tauri/tauri.linux.conf.json
FOUND: .planning/quick/260901-8rm-shrink-tauri-macos-bundle-narrow-bundle-/260901-8rm-MEASUREMENTS.md
FOUND: 8cdbf4272
FOUND: b430ff975
FOUND: 91e49f361
```

---

_Quick task: 260901-8rm_
_Completed: 2026-09-01_
