---
phase: quick-261011-wrx
plan: 01
subsystem: steam / sidecar SEA build
tags: [lzma-native, sea, win32, dll-planting, mkdtemp]
status: complete
requirements: [QUICK-261011-wrx]
key-files:
  modified:
    - meta/buildSidecarSea.ts
    - meta/__tests__/buildSidecarSea.test.ts
    - src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts
    - src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts
    - src/backend/storeManagers/steam/depot/lzmaLoader.ts
    - src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
  created:
    - .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measure-selftest.ts
    - .planning/quick/261011-wrx-win32-sea-native-lzma-never-engages-embe/measurement/build-native-win32.txt
    - .planning/todos/pending/2026-10-12-win32-native-lzma-extraction-dirs-accumulate-in-temp.md
  moved:
    - .planning/todos/pending/2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md -> .planning/todos/completed/
commits: 3
plan_head_before: 0ef4370062ff2e06da28046acafbc6832730d9f5
plan_head_after: f748caac686d60ec5139e5b07de6593befffc86d
actuals:
  tasks: 3
  commits: 3
completed: 2026-10-12
---

# Quick 261011-wrx: win32 SEA native LZMA engages (unit-verified; real win32 SEA run 20/20 on 2026-10-12)

The win32 SEA now embeds `liblzma.dll` as a second asset, and the binding extracts it beside the addon in one private `mkdtemp` directory before `dlopen`. This is verified by unit tests only. The cold win32 SEA build, the 20-run native-win32 driver arm and a live Steam depot install were NOT run.

## Commits

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 (tracer) | `b0ee1fd29` | Build embeds `liblzma.dll` (key `liblzma.dll`) for `x86_64-pc-windows-msvc` only; missing DLL is a `COMPILE GATE FAILED`. Binding extracts addon (+ DLL on win32) into one `mkdtempSync` dir (`gamelib-lzma-native-<pid>-XXXXXX`, chmod 0o700), `dlopen`s from it, `rmSync`s the dir in a `finally`, swallows the Windows unlink failure, records `{ dir, leftover }` under `Symbol.for('gamelib.lzmaNative.extraction')`. |
| 2 | `095973577` | `lzmaLoader.ts` appends the extraction dir and "removed after load" / "LEFT BEHIND" to the single engaged `logInfo`; the failure warning names the win32 `liblzma.dll` companion asset. |
| 3 | `f748caac6` | Driver ported with a directory-aware `gamelib-lzma-native-*` census; todo closed with Resolution; accumulation follow-up filed. |

## Evidence

- Task 1 RED: 24 failed / 78 passed (102 tests, two suites). GREEN: 102/102.
- Task 2 RED: 2 failed (L1, L2) / 45 passed in `decompressPool.test.ts`. GREEN: 149/149 across `lzmaNativeBinding.test.ts`, `buildSidecarSea.test.ts`, `decompressPool.test.ts`.
- Includes a real-filesystem round trip (R6: exact file set in one tmpdir child at dlopen time, 0700 on POSIX, nothing left after) and a real `node_modules` sibling-library drift guard (B7).
- `pnpm codecheck` clean, scoped eslint 0 errors (one `require-await` warning on `resolveNativeLzmaAssets`, same as the unexported function it replaced), `pnpm find-deadcode` `unreachable: 46 OK | used-in-module: 0 OK`, scoped `npx prettier --check` clean (all six paths confirmed not ignored), `pnpm planning-gates` 12/12, measurement leak scan empty.

## Task 3: real-SEA verification NOT run

The precondition was unmet. `tasklist` matched a live `gamelib-shell.exe` (pid 16704, `src-tauri/target/debug`) with `msedgewebview2.exe` and a `node.exe` child. Per the plan nothing was killed, and STEPs 2-5 (cold `pnpm build:sidecar-sea`, 20-run native-win32 arm, temp cleanup) were skipped. `src-tauri/binaries/gamelib-sidecar-x86_64-pc-windows-msvc.exe` and the other SEA outputs are untouched. Therefore: `nativeWorkers` count, engaged-line count and leftover-directory count were not measured. Record: `measurement/build-native-win32.txt`.

The driver port (STEP 1) was done. `npx tsc --noEmit` over it is clean, and `--file-info` confirms its path is prettier-ignored.

## Live run (2026-10-12, operator-triggered after the executor returned)

The operator closed the app and ran `pnpm build:sidecar-sea`; the orchestrator then ran the driver. `RESULT label=native-win32 pass=20/20 expectNativeWorkers=2`: every run `nativeWorkers=2`, `exit=0`, `decode=ok match=true`, wall 1.80-2.20 s. The engaged line appears in all 20 run logs; zero logs carry the import-failure warning. Temp census: 0 before, 40 after (2 per process: one with both files at 966 KB, one addon-only at 816 KB because the process had already mapped liblzma.dll by name from the first dir and the finally unlinked the unmapped second copy; 35 MB total), all `LEFT BEHIND`, removed by hand afterwards. Logs and census are in `measurement/`. The binary grew 120,994,304 to 121,159,680 bytes.
## Deviations from Plan

None to the code. The todo was closed via the plan's "skipped" branch (unit evidence only), with the Resolution stating plainly that the real-SEA run is owed. The follow-up accumulation todo was filed because STEP 3 did not run.

## Owed to the operator

1. DONE 2026-10-12: cold build plus the native-win32 driver run, 20/20 at `nativeWorkers:2`, engaged line in every log, no import-failure warning (see Live run above).
2. A live Steam depot install in the packaged Windows app (`gamelib.log` should show the engaged line with its `SEA extraction dir` sentence).
3. The accumulate-or-sweep decision: `.planning/todos/pending/2026-10-12-win32-native-lzma-extraction-dirs-accumulate-in-temp.md`.
4. ubuntu CI's `lzmaNativeSeaRealBuild.test.ts` (unedited) is the first linux real-SEA run of the mkdtemp path.

## Threat Flags

None beyond the plan's threat model.

## Self-Check: PASSED

Commits b0ee1fd29, 095973577, f748caac6 exist; the four Task 1 files, two Task 2 files and the Task 3 `.planning/` files exist.
