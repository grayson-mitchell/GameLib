---
phase: quick-261023-tyf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/buildSteamBridgeShims.ts
  - meta/__tests__/buildSteamBridgeShims.test.ts
  - meta/__tests__/shimAbiGate.test.ts
  - meta/gen_vtables.ts
  - meta/__tests__/gen_vtables.test.ts
  - native/steam-bridge/generated/steam_api_shim.c
  - .planning/todos/pending/2026-10-23-steam-bridge-shim-ships-as-debug-ubsan-build.md
  - .planning/todos/completed/2026-10-23-steam-bridge-shim-ships-as-debug-ubsan-build.md
autonomous: true
requirements:
  - TODO-2026-10-23-steam-bridge-shim-ships-as-debug-ubsan-build

must_haves:
  truths:
    - "Both bridge shims (x86 steam_api.dll, x64 steam_api64.dll) are compiled with -O2 and UBSan off, so a game-supplied pointer that is legally 4-byte aligned can no longer abort the game with a sanitizer panic"
    - "The rebuilt DLLs contain zero UBSan runtime strings (`misaligned address`)"
    - "The rebuilt DLLs still carry BOTH GameLib identity markers (`GameLibSteamBridgeShim/2` and `127.0.0.1`), so placeShimForGame and the UAT grep checks still recognise them"
    - "The __thiscall/hidden-pointer ABI gate (shimAbiGate) passes when compiled with the SAME release flags production uses"
    - "Installed bridge bottles holding the old debug shim are refreshed automatically on the next launch (placeShimForGame overwrites a non-byte-identical GameLib shim) -- no manual bottle step"
  artifacts:
    - path: "meta/buildSteamBridgeShims.ts"
      provides: "SHIM_RELEASE_CFLAGS constant, spread into buildShimCompileArgv and buildShim64CompileArgv"
      contains: "SHIM_RELEASE_CFLAGS"
    - path: "meta/gen_vtables.ts"
      provides: "marker keepalive through a volatile POINTER OBJECT so -O2 cannot drop the marker"
      contains: "const char *volatile gamelib_marker_keepalive"
    - path: "native/steam-bridge/generated/steam_api_shim.c"
      provides: "regenerated shim source carrying the fixed keepalive"
      contains: "const char *volatile gamelib_marker_keepalive"
    - path: ".planning/todos/completed/2026-10-23-steam-bridge-shim-ships-as-debug-ubsan-build.md"
      provides: "closed todo with a ## Closed section"
      contains: "## Closed"
  key_links:
    - from: "meta/__tests__/shimAbiGate.test.ts"
      to: "meta/buildSteamBridgeShims.ts SHIM_RELEASE_CFLAGS"
      via: "import + spread into the gate's zig cc argv"
      pattern: "SHIM_RELEASE_CFLAGS"
    - from: "meta/buildSteamBridgeShims.ts buildShimCompileArgv / buildShim64CompileArgv"
      to: "SHIM_RELEASE_CFLAGS"
      via: "spread after '-shared'"
      pattern: "\\.\\.\\.SHIM_RELEASE_CFLAGS"
---

<objective>
Close todo `.planning/todos/pending/2026-10-23-steam-bridge-shim-ships-as-debug-ubsan-build.md`:
build both Steam bridge shims as release builds. `buildShimCompileArgv()` and
`buildShim64CompileArgv()` pass no `-O` flag, so zig defaults to Debug with UBSan. In spike 033 run C,
a shim-side store through a legally 4-byte-aligned `LARGE_INTEGER*` aborted Hoard with
`panic: member access within misaligned address ... requires 8 byte alignment`.

Purpose: remove a silent, game-specific crash that Valve's real `steam_api.dll` never causes, and that
the user can't tell apart from "the game doesn't work on Mac".
Output: release-flag argv (x86 + x64), an ABI gate compiled with the same flags, a marker-keepalive fix
in the generator plus the regenerated shim source, rebuilt DLLs checked for UBSan strings and markers,
and the todo closed.
</objective>

<decision>
**Chosen: `-O2 -fno-sanitize=undefined` (UBSan OFF). Rejected: `-fsanitize-trap=undefined`.**

Justification from the todo: the defect is not that the panic is noisy. The defect is that UBSan rejects
input that is *valid for the platform*. 32-bit MSVC code legally passes 4-byte-aligned `LARGE_INTEGER*`
under the x86 ABI, and the abort happened even through `memcpy` on the typed pointer. Trap mode turns the
same check into a `ud2`, so Hoard would still die on the same legal input, just with an illegal-instruction
fault in place of a readable panic. That is worse to diagnose and still a crash. The todo itself says
"Release builds probably want UBSan off". The "Debug for dev, -O2 for packaged" option is also rejected.
Dev builds put these exact DLLs into real bottles (`pnpm build-steam-bridge` writes `public/bin`, which
`builtBridgeShimPath` reads at dev run time), so dev-only UBSan would keep the false-positive crash in
every dev test of a game. Keep one flag set for both.

**Measured during planning** (zig 0.16.0 at `.build-tools/zig/zig`, scratchpad builds of the committed
generated source):

| Build | x86 size | x64 size | `misaligned address` | `GameLibSteamBridgeShim/2` | `127.0.0.1` |
|---|---|---|---|---|---|
| current public/bin (Debug+UBSan) | 894464 | 848896 | 1 / 1 | 1 / 1 | 1 / 1 |
| `-O2 -fno-sanitize=undefined` | 286720 | 223744 | 0 / 0 | **0 / 0** | 1 / 1 |
| same + keepalive fix (Task 2) | 286720 | 223744 | 0 / 0 | 1 / 1 | 1 / 1 |

Bare `-O2` alone also removed the UBSan strings under zig 0.16.0. Even so, pass `-fno-sanitize=undefined`
explicitly. The intent then doesn't depend on how zig maps `-O2` to its own build modes in a future
pinned version.

**The marker regression -O2 exposes (the row in bold).** The generator's keepalive in `SteamAPI_Init` is
`volatile const char *gamelib_marker_keepalive = g_gamelib_shim_marker;`. That makes the pointed-to
chars volatile, not the pointer variable. The dead local is deleted at -O2, and the
`GameLibSteamBridgeShim/2` string goes with it. `isGameLibShimBytes()` would still match on `127.0.0.1`,
since either signal is enough. But the marker is the primary identity signal, and 51-UAT checks
`grep -ac GameLibSteamBridgeShim/2` = 1. The fix is `const char *volatile gamelib_marker_keepalive`, a
volatile pointer object whose store must be emitted. It was measured in scratchpad and restores the
marker on both targets.
</decision>

<facts_confirmed_during_planning>
- **Artifacts are NOT committed.** Per D-07 (header of `meta/buildSteamBridgeShims.ts`, "built binaries
  are never committed"), `git ls-files public/bin` lists no steam_api*.dll. `pnpm build-steam-bridge`
  builds the shims at package time (hooked before the app bundles; CI `release-tauri.yml` sets
  `GAMELIB_BRIDGE_TARGET_ARCH`). Locally they land in `public/bin/arm64/darwin/steam_api.dll` and
  `public/bin/arm64/darwin/steam_api64.dll` (`shimOutputPath` / `shim64OutputPath`). The rebuild in
  Task 3 refreshes the local dev copies only. **Never `git add` anything under `public/bin` or `build/`.**
- **No pinned shim byte sizes exist in code, tests or CI.** A repo-wide grep for `894464` hits only
  `.planning/phases/51-*/51-UAT.md` (lines 56, 61) and `51-27-SUMMARY.md` (line 32). Those are dated,
  measured evidence of what was placed at a specific HEAD (171b4cbf2 / c8729c36a), not live expectations.
  **Do not edit them**: rewriting a historical measurement would falsify the record. Record the new sizes
  in the todo's `## Closed` section instead.
- **placeShimForGame refreshes stale bottles by itself.** In
  `src/backend/storeManagers/steam/bridge/shimGenerate.ts`, the single-dll path no-ops only when
  `existsSync(shimPath) && isByteIdentical(shimPath, shimSourcePath)` (~L510). Otherwise it detects an
  existing GameLib shim via `isGameLibShimBytes` (marker OR loopback; the old debug shim has both), reuses
  `opts.persistedInterfaceVersions`, and `copyFileSync(shimSourcePath, shimPath)`. The runtime-loaded
  multi-dll path does the same: `toCopy` includes any `isGameLibShim` entry where
  `!isByteIdentical(d.path, source)` (~L396). The launch path calls it (`games.ts:2631`; doc at ~L2493:
  "byte-identity no-op, refreshes a stale pre-phase shim after an upgrade"). So the installed
  `GameLibSteamBridge-*` bottles, still carrying the 894464 B debug shim, get the release shim on their
  next launch. **No manual bottle step is needed.** A packaged `.app` still bundles whatever DLL it was
  built with, so it picks the fix up at its next packaged build.
- **Existing shim checks** (no dedicated `smoke:shim` script exists; `smoke:sidecar` is the sidecar, not
  the shim):
  - `meta/__tests__/shimAbiGate.test.ts`: the real zig compile + `objdump -d` of the THISCALL/hidden-sret
    stubs on i386 (`ret $0x4`) and x64 (`%rcx` self, `%rdx` sret, plain `retq`, null-object fallback). This
    is the check the todo means by "-O2 can change codegen in the THISCALL/hidden-pointer paths". Today it
    compiles with its own hand-written argv and no `-O`, so it would NOT test release codegen. Task 1
    wires it to the production flags.
  - `src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts`: x86/x64 exported-symbol and
    served-version pins against the committed `.def` files.
  - `src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts`: placement and identity
    (`isGameLibShimBytes`, byte-identity refresh).
  - `meta/__tests__/buildSteamBridgeShims.test.ts`: argv construction and prune behaviour.
  - `meta/__tests__/gen_vtables.test.ts`: generator output.
  - `pnpm build-steam-bridge`: the real x86 + x64 compile gates.
- `npx prettier --file-info` measured: the four `.ts` files are `"ignored": false, "inferredParser":
  "typescript"`. `native/steam-bridge/generated/steam_api_shim.c` is `"ignored": false, "inferredParser":
  null`: prettier has no C parser, so `--check` on it is meaningless and is omitted. Everything under
  `.planning/` is `"ignored": true`, so no prettier check applies to the todo move.
- `Skill("gamelib-conventions")` fake-HOME rule: shimAbiGate already spawns zig/objdump under
  `createFakeHomeProfile()` + `childEnv()`. Task 1 changes only its argv contents and must keep that.
  `meta/buildSteamBridgeShims.ts`'s own `spawnArgv` is unchanged (no new spawn site).
</facts_confirmed_during_planning>

<concurrency_rules>
Another Claude session and a 51-29 executor are committing in this repo right now. For EVERY commit in
this plan:
1. Run `git checkout -- meta/i18nForkTouchedFiles.json` immediately before the commit.
2. Stage ONLY the exact paths the task names with `git add <path> ...`. Never `git add -A`, `git add .`,
   `git commit -a`, or a directory glob.
3. Never run any `git stash` subcommand.
4. Check `git diff --cached --name-only` before committing. It must list only this task's paths. If
   another session's file shows up, unstage it with `git restore --staged <path>`; never revert it.
5. If `pnpm gen-vtables` (Task 2) changes any generated file beyond the one keepalive line, someone else
   changed the generator or manifests concurrently. STOP and report; don't commit their drift under this
   task.
Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
</concurrency_rules>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-10-23-steam-bridge-shim-ships-as-debug-ubsan-build.md
@.planning/spikes/033-shim-gamefixes-hoard/README.md
@meta/buildSteamBridgeShims.ts
@.claude/skills/gamelib-conventions/SKILL.md

<interfaces>
From meta/buildSteamBridgeShims.ts (current, both builders identical apart from target/def/output):
  export function buildShimCompileArgv(zigBinPath: string, arch?: string): { command: string; args: string[] }
    args = ['cc', '-target', 'x86-windows-gnu', '-shared', '-o', shimOutputPath(arch), SHIM_SOURCE_PATH, SHIM_DEF_PATH, '-lws2_32']
  export function buildShim64CompileArgv(zigBinPath: string, arch?: string): { command: string; args: string[] }
    args = ['cc', '-target', 'x86_64-windows-gnu', '-shared', '-o', shim64OutputPath(arch), SHIM_SOURCE_PATH, SHIM_DEF64_PATH, '-lws2_32']
  Every export used only by tests carries the two-line comment
    "// Exported only for meta/__tests__/buildSteamBridgeShims.test.ts (outside
     // this gate's tsconfig.json scope -- see resolveBridgeArch above)."
  followed by "// ts-prune-ignore-next". Follow that pattern for the new constant (name shimAbiGate.test.ts too).

From meta/__tests__/shimAbiGate.test.ts compileAndDisasm() (~L221):
  spawnArgv(zigBinPath, ['cc', '-target', zigTarget, '-shared', '-o', outPath, cPath, defPath, '-lws2_32'], env)
  env = fakeHome.childEnv() -- keep.

From meta/gen_vtables.ts FLAT_EXPORT_BODIES.SteamAPI_Init (~L606-613):
  '  volatile const char *gamelib_marker_keepalive = g_gamelib_shim_marker;\n' +
  '  (void)gamelib_marker_keepalive;\n' +
gen_vtables.test.ts already imports generateShimC and calls generateShimC([isteamuser, isteamfriends]) (~L135).
Regenerate committed source with: pnpm gen-vtables
Rebuild DLLs with: pnpm build-steam-bridge
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Release flags in both shim argv builders, and the ABI gate compiled with them</name>
  <files>meta/buildSteamBridgeShims.ts, meta/__tests__/buildSteamBridgeShims.test.ts, meta/__tests__/shimAbiGate.test.ts</files>
  <behavior>
    - buildShimCompileArgv('/path/to/zig','arm64').args contains '-O2' and '-fno-sanitize=undefined'
    - buildShim64CompileArgv('/path/to/zig','arm64').args contains '-O2' and '-fno-sanitize=undefined'
    - Neither argv contains any arg starting with '-fsanitize' (no trap-mode or re-enabled UBSan) and no other '-O' level (exactly one arg matching /^-O/)
    - In both argv the release flags come before '-o' (flags, then output, then inputs; order-insensitive for zig, but keeps the argv readable and stable)
    - SHIM_RELEASE_CFLAGS equals ['-O2', '-fno-sanitize=undefined']
    - shimAbiGate's compile argv includes the SHIM_RELEASE_CFLAGS values (structural: the test source imports SHIM_RELEASE_CFLAGS from '../buildSteamBridgeShims')
  </behavior>
  <action>
    RED first. In meta/__tests__/buildSteamBridgeShims.test.ts, add one `it` to the existing `describe('buildShimCompileArgv ...')` and one to `describe('buildShim64CompileArgv ...')`. Each asserts the behaviour bullets above for its builder. Add a small `describe('SHIM_RELEASE_CFLAGS (quick 261023-tyf: release build, UBSan off)')` that asserts the constant's exact value, plus a comment naming spike 033 run C (Hoard, misaligned LARGE_INTEGER* panic) as the reason. Run the suite and confirm the new cases fail.

    GREEN. In meta/buildSteamBridgeShims.ts, add an exported `SHIM_RELEASE_CFLAGS = ['-O2', '-fno-sanitize=undefined'] as const` near the other shim constants. Give it the file's existing "Exported only for ... tests" comment pair plus `// ts-prune-ignore-next`, and name both test files that import it. Its doc comment states the decision in this plan's <decision> block: UBSan off, not trap mode, because trap mode still kills the game on input that is legal under the x86 ABI; one flag set for dev and packaged builds, because dev builds place these same DLLs into real bottles; `-fno-sanitize=undefined` is explicit even though bare -O2 drops UBSan under zig 0.16.0; and the measured sizes 894464→286720 (x86) and 848896→223744 (x64). Spread `...SHIM_RELEASE_CFLAGS` immediately after `'-shared'` in BOTH buildShimCompileArgv and buildShim64CompileArgv. Update both builders' doc comments to say they emit a release build. Update the file header's numbered item 2 so it no longer implies a default-mode compile. Do not touch the -Wl/-s and implib notes on SHIM_BUILD_BYPRODUCTS: they describe separate rejected linker flags, and -O2 is not one of them.

    Then in meta/__tests__/shimAbiGate.test.ts, import SHIM_RELEASE_CFLAGS from '../buildSteamBridgeShims' and spread it after '-shared' in compileAndDisasm's zig argv. The gate then proves the THISCALL/hidden-pointer ABI under the codegen that actually ships. This is the todo's "-O2 can change codegen in the THISCALL/hidden-pointer paths" check. Keep the createFakeHomeProfile/childEnv spawn exactly as is (gamelib-conventions fake-HOME rule). Update the header comment to say the gate compiles with the production release flags. Importing the module under jest is safe: its CLI `main()` is behind the JEST_WORKER_ID guard.

    If a shimAbiGate assertion fails under -O2, it is the defect the todo warned about. Inspect the disassembly before changing anything. The ABI invariants are non-negotiable: i386 ends in `ret $0x4`, x64 self in %rcx and sret in %rdx, x64 ends in a plain ret with no `$0x`. If one of those is actually violated, STOP and report; don't ship. If only a codegen-shape matcher fails while the invariant holds (for example x64 uses %rcx directly, so the `mov %rcx,` regex misses), you may adjust that one matcher so it still asserts the register's role. Give the reason in a comment and in the SUMMARY.

    Confirm the gate RAN and was not skipped: the jest output must not contain "shimAbiGate SKIPPED". `.build-tools/zig/zig` (0.16.0) is present on this machine.
  </action>
  <verify>
    <automated>set -o pipefail; npx jest meta/__tests__/buildSteamBridgeShims.test.ts meta/__tests__/shimAbiGate.test.ts 2>&1 | tee "$TMPDIR/tyf-t1-jest.log" && ! grep -q "shimAbiGate SKIPPED" "$TMPDIR/tyf-t1-jest.log" && grep -c '\.\.\.SHIM_RELEASE_CFLAGS' meta/buildSteamBridgeShims.ts | grep -qx 2 && grep -q 'SHIM_RELEASE_CFLAGS' meta/__tests__/shimAbiGate.test.ts && npx prettier --check meta/buildSteamBridgeShims.ts meta/__tests__/buildSteamBridgeShims.test.ts meta/__tests__/shimAbiGate.test.ts && npx eslint meta/buildSteamBridgeShims.ts meta/__tests__/buildSteamBridgeShims.test.ts meta/__tests__/shimAbiGate.test.ts</automated>
  </verify>
  <done>Both argv builders carry -O2 and -fno-sanitize=undefined via SHIM_RELEASE_CFLAGS. The new tests failed before the change and pass after it. shimAbiGate ran (not skipped) with the release flags and its three ABI cases pass. Prettier and eslint are clean on the three paths. Committed (concurrency rules) as `fix(quick-261023-tyf): build Steam bridge shims as release (-O2, UBSan off)` with exactly these three paths staged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Keep the GameLibSteamBridgeShim/2 marker alive under -O2 (generator + regenerated source)</name>
  <files>meta/gen_vtables.ts, meta/__tests__/gen_vtables.test.ts, native/steam-bridge/generated/steam_api_shim.c</files>
  <behavior>
    - generateShimC([isteamuser, isteamfriends]) output contains 'const char *volatile gamelib_marker_keepalive = g_gamelib_shim_marker;'
    - the same output does NOT contain 'volatile const char *gamelib_marker_keepalive' (the pointee-volatile form -O2 deletes)
    - committed native/steam-bridge/generated/steam_api_shim.c contains the new keepalive line exactly once
  </behavior>
  <action>
    RED. In meta/__tests__/gen_vtables.test.ts, add an `it` that calls generateShimC with the already-loaded isteamuser/isteamfriends manifests and asserts the first two behaviour bullets. Add a comment explaining the regression: at -O2 (quick 261023-tyf) a pointer-to-volatile local is dead and gets deleted, which takes the `GameLibSteamBridgeShim/2` string out of both DLLs (measured: 0 occurrences). A volatile pointer object's store has to be emitted. Run it and confirm it fails.

    GREEN. In meta/gen_vtables.ts FLAT_EXPORT_BODIES.SteamAPI_Init, change the keepalive line to `const char *volatile gamelib_marker_keepalive = g_gamelib_shim_marker;` and keep the `(void)` line. Also fix the generator's comment above `g_gamelib_shim_marker` (~L1290s, emitted into the .c as "Referenced from SteamAPI_Init() through a volatile read below...") so it says "a store to a volatile pointer object". That is what now keeps it alive, and the old wording described the broken form. Don't change the marker string itself: `isGameLibShimBytes` and 51-UAT grep for `GameLibSteamBridgeShim/2`, and old shipped shims must still match.

    Regenerate with `pnpm gen-vtables`. Then `git diff --stat native/steam-bridge/generated/` must show ONLY steam_api_shim.c, and its diff must be only the keepalive line plus the matching comment line(s). If bridge_dispatch.h, steam_api.def, steam_api64.def or any unrelated hunk changes, STOP per concurrency rule 5.
  </action>
  <verify>
    <automated>npx jest meta/__tests__/gen_vtables.test.ts && grep -c 'const char \*volatile gamelib_marker_keepalive' native/steam-bridge/generated/steam_api_shim.c | grep -qx 1 && grep -v '^\s*//' native/steam-bridge/generated/steam_api_shim.c | grep -c 'volatile const char \*gamelib_marker_keepalive' | grep -qx 0 && test "$(git diff --name-only -- native/steam-bridge/generated/)" = "native/steam-bridge/generated/steam_api_shim.c" && npx prettier --check meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts && npx eslint meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts</automated>
  </verify>
  <done>The generator emits the volatile-pointer keepalive, and the committed shim source is regenerated with only that change. gen_vtables tests pass, including the new case. Prettier is not run on the .c because prettier has no C parser (`--file-info` reports `inferredParser: null`). Committed (concurrency rules) as `fix(quick-261023-tyf): keep shim identity marker alive under -O2` with exactly these three paths staged.</done>
</task>

<task type="auto">
  <name>Task 3: Rebuild both shims, prove the binaries, run the shim suites, close the todo</name>
  <files>.planning/todos/pending/2026-10-23-steam-bridge-shim-ships-as-debug-ubsan-build.md, .planning/todos/completed/2026-10-23-steam-bridge-shim-ships-as-debug-ubsan-build.md</files>
  <action>
    1. Before rebuilding, record the OLD debug DLLs' sizes and export-name lists into the scratchpad. Use `stat -f%z`, plus `objdump -p <dll> | sed -n '/Export Table/,/^$/p'` reduced to the symbol-name column, for `public/bin/arm64/darwin/steam_api.dll` and `steam_api64.dll`.
    2. Run `pnpm build-steam-bridge`. Both compile gates must print PASSED, and the logged argv lines must show `-O2 -fno-sanitize=undefined`.
    3. For EACH of the two rebuilt DLLs, measure and record: size; `strings <dll> | grep -c "misaligned address"` (must be 0); `grep -ac 'GameLibSteamBridgeShim/2'` (must be ≥1); `grep -ac 127.0.0.1` (must be ≥1); and a diff of the export-name list against the step-1 list (must be identical: -O2 must not drop an export). Expected sizes from planning are about 286720 (x86) and 223744 (x64). A small drift from the Task 2 comment change is fine; a large one means investigate.
    4. Run the shim suites together: `npx jest meta/__tests__/buildSteamBridgeShims.test.ts meta/__tests__/shimAbiGate.test.ts meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts`. All must pass, with no "shimAbiGate SKIPPED" in the output.
    5. Close the todo. Use `git mv` on the pending file to `.planning/todos/completed/` (same filename). The frontmatter triage gate applies to pending/ only, so leave the frontmatter as is. Append a `## Closed 2026-10-23 — quick 261023-tyf` section recording: the chosen flags and the trap-mode rejection reason; the two commit hashes from Tasks 1-2; the before/after size table from step 1/3; the `misaligned address` 1→0 and marker/loopback counts; the export lists unchanged; shimAbiGate passed under the release flags (and any matcher adjustment with its reason); the -O2 marker-drop regression found and fixed. Also note that no in-repo shim-size pins existed (the 894464 mentions in 51-UAT.md and 51-27-SUMMARY.md are dated historical evidence and were deliberately left alone); that the DLLs are build outputs, not committed (D-07); and that existing `GameLibSteamBridge-*` bottles refresh on next launch via placeShimForGame's byte-identity check, so no manual bottle step is needed, while a packaged .app picks the fix up at its next packaged build. State plainly what was NOT verified: a live Hoard (or any game) launch against the release shim was not run in this task, so the spike 033 run C crash is fixed by construction (no sanitizer runtime is left in the DLL), not by live replay.
    6. Commit (concurrency rules), staging exactly the deleted pending path and the new completed path, as `docs(quick-261023-tyf): close debug/UBSan shim todo`. Never stage anything under public/bin or build/.
  </action>
  <verify>
    <automated>for d in public/bin/arm64/darwin/steam_api.dll public/bin/arm64/darwin/steam_api64.dll; do test "$(strings "$d" | grep -c 'misaligned address')" = 0 && test "$(grep -ac 'GameLibSteamBridgeShim/2' "$d")" -ge 1 && test "$(grep -ac 127.0.0.1 "$d")" -ge 1 || { echo "FAIL $d"; exit 1; }; done && npx jest meta/__tests__/buildSteamBridgeShims.test.ts meta/__tests__/shimAbiGate.test.ts meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts && test ! -e .planning/todos/pending/2026-10-23-steam-bridge-shim-ships-as-debug-ubsan-build.md && grep -q '^## Closed' .planning/todos/completed/2026-10-23-steam-bridge-shim-ships-as-debug-ubsan-build.md && test -z "$(git ls-files public/bin | grep -i steam_api)" && pnpm planning-gates</automated>
    No prettier check here: this task writes only `.planning/` paths, which `npx prettier --file-info` reports as `"ignored": true`, so `--check` would be a vacuous green (gamelib-conventions formatter rule).
  </verify>
  <done>Both rebuilt DLLs contain 0 `misaligned address` strings and both identity markers, and their export lists match the pre-change lists. All five shim suites pass with shimAbiGate actually run. The todo has moved to completed/ with a `## Closed` section that records measurements, commits, the bottle-refresh mechanism and the unverified live replay. `pnpm planning-gates` is green. No binary is staged or committed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| game process → shim exports | Untrusted game-supplied pointers/args reach generated shim code inside the Wine bottle |
| build host → zig toolchain | Pinned zig binary (meta/downloadZig.ts) compiles committed source; no new download or package |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-tyf-01 | Denial of Service | steam_api(64).dll UBSan runtime | mitigate | Remove the sanitizer via SHIM_RELEASE_CFLAGS (-O2 -fno-sanitize=undefined) so ABI-legal misaligned pointers no longer abort the game; asserted by argv tests and by the `misaligned address` = 0 check on both rebuilt DLLs |
| T-tyf-02 | Spoofing | shim identity (isGameLibShimBytes) | mitigate | Volatile-pointer keepalive keeps `GameLibSteamBridgeShim/2` in the -O2 DLL; checked by a grep count ≥1 on both DLLs plus the gen_vtables test, so placement never mistakes our shim for a game original and never reads interface versions from it |
| T-tyf-03 | Tampering | -O2 codegen of __thiscall / hidden-sret stubs | mitigate | shimAbiGate compiles with the production flags and asserts ret $0x4 / %rcx / %rdx / plain retq; export lists diffed before vs after |
| T-tyf-04 | Information Disclosure | loss of UBSan diagnostics | accept | Sanitizer was a dev aid that produced false positives on valid x86 ABI input; spike-level debugging can still build a sanitized copy by hand (spike 033 build.sh pattern) |
| T-tyf-SC | Tampering | package installs | accept | No npm/pip/cargo installs in this plan; zig is the existing pinned toolchain |
</threat_model>

<verification>
- `pnpm build-steam-bridge` passes both compile gates with release flags in the logged argv.
- Both DLLs: `misaligned address` = 0, `GameLibSteamBridgeShim/2` ≥ 1, `127.0.0.1` ≥ 1, export lists unchanged.
- Five shim suites green; shimAbiGate not skipped and compiled with SHIM_RELEASE_CFLAGS.
- Todo closed under completed/ with `## Closed`; `pnpm planning-gates` green.
- `git log` shows three commits, each with exactly its task's paths; nothing under public/bin or build/ committed; `meta/i18nForkTouchedFiles.json` was never committed.
</verification>

<success_criteria>
The shipped Steam bridge shims (x86 and x64) are -O2 release builds with no UBSan runtime, so the spike 033 run C class of crash (legal 4-byte-aligned `LARGE_INTEGER*` → sanitizer panic) can no longer happen. Shim identity and ABI are proven to survive the flag change. Existing bottles self-heal on next launch.
</success_criteria>

<output>
Create `.planning/quick/261023-tyf-build-steam-bridge-shims-as-release-buil/261023-tyf-SUMMARY.md` when done.
</output>
