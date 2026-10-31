---
phase: quick-261031-rjv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/tools/machoExports.ts
  - src/backend/tools/__tests__/machoExports.test.ts
  - src/backend/tools/dxmt.ts
  - src/backend/tools/__tests__/dxmtExportGate.test.ts
  - src/backend/tools/__tests__/dxmtBootFetch.test.ts
autonomous: true
requirements:
  - TODO-2026-10-31-dxmt-engine-cannot-present-d3d11-on-wine-staging
must_haves:
  truths:
    - "Installing a Wine-Staging-macOS whose winemac.so lacks the macdrv metal-view exports creates no -DXMT copy and issues no DXMT download"
    - "Installing a Wine-Staging-macOS whose winemac.so exports the needed symbols still creates the -DXMT copy exactly as before"
    - "A skip logs a LogPrefix.ToolInstaller warning naming the Wine version, the winemac.so path and the missing symbols"
    - "Existing -DXMT copies are never deleted or modified by the gate; the uninstall listener is unchanged"
    - "The boot-time update path downloads DXMT only if at least one existing -DXMT copy passes the export check, and copies files only into copies that pass"
  artifacts:
    - path: "src/backend/tools/machoExports.ts"
      provides: "In-process Mach-O defined-external symbol reader + winemac metal-view check"
      exports: ["parseMachODefinedExternals", "checkWinemacMetalViewExports"]
    - path: "src/backend/tools/__tests__/machoExports.test.ts"
      provides: "Parser tests on synthetic in-memory Mach-O buffers"
    - path: "src/backend/tools/__tests__/dxmtExportGate.test.ts"
      provides: "Listener-level tests of the gate on install and update paths"
  key_links:
    - from: "src/backend/tools/dxmt.ts wineVersionInstalled listener"
      to: "checkWinemacMetalViewExports"
      via: "called BEFORE DXMT.getLatest()"
      pattern: "checkWinemacMetalViewExports"
    - from: "src/backend/tools/dxmt.ts releasesInfoReady listener"
      to: "checkWinemacMetalViewExports"
      via: "census filter before DXMT.getLatest()"
      pattern: "checkWinemacMetalViewExports"
---

<objective>
Stop GameLib manufacturing a `-DXMT` Wine copy that cannot present a D3D11 swapchain. Only create
(or update DXMT files inside) a `-DXMT` copy when the Wine's
`Contents/Resources/wine/lib/wine/x86_64-unix/winemac.so` defines the macdrv symbols DXMT v0.80's
`winemetal.so` resolves. This is option 2 of
`.planning/todos/pending/2026-10-31-dxmt-engine-cannot-present-d3d11-on-wine-staging.md`, the
operator's locked choice.

Locked (operator): do NOT pair DXMT with a different Wine, do NOT remove the DXMT feature, do NOT
delete or modify existing `-DXMT` copies (games pinned to them, including working non-D3D11 titles
such as Avernum 6, must keep launching). The `wineVersionUninstalled` listener stays as is.

Output: a new no-spawn Mach-O export reader, the gate wired into both listeners in `dxmt.ts`, and
jest coverage. The todo stays open: it is `ready: live-gate` (see output section).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-10-31-dxmt-engine-cannot-present-d3d11-on-wine-staging.md
@src/backend/tools/dxmt.ts
@src/backend/tools/__tests__/dxmtBootFetch.test.ts

Load `Skill("gamelib-conventions")` before writing the verify commands or committing (formatter
rule; sidecar exit contract).

## Planner decisions (with reasoning)

**D-A: the check reads the Mach-O symbol table in-process; it does not spawn `nm`.**
- `/usr/bin/nm` on macOS is an `xcrun` shim (78 hard links, 200 KB in /usr/bin). Without the
  Xcode Command Line Tools it does not run `nm`; it fails with an `xcrun: error: invalid active
  developer path` and can pop the "install command line developer tools" dialog. End users
  without CLT would get a system install prompt from a Wine install. Not acceptable. (This Mac
  has CLT at `/Library/Developer/CommandLineTools`, so the planner could not observe the no-CLT
  path directly; the shim behaviour is standard macOS.)
- A raw byte search is rejected on correctness grounds: it cannot tell a defined export from an
  undefined import. (Measured: none of the four names appear as bytes anywhere in Gcenx Staging
  11.20's `winemac.so`, so a byte search would happen to give the right answer today, but a future
  build that imports but does not define a name would false-positive.)
- Parsing `LC_SYMTAB` + `LC_DYSYMTAB` gives exactly `nm -gU` semantics with no child process, so
  the fake-HOME spawn rule does not apply (there is no spawn). It is a synchronous `readFileSync`
  of a ~400 KB file: no handle, timer or in-flight work, so it is sidecar-exit-contract-neutral.
- Measured ground truth on this Mac (`nm -gU`): Staging `winemac.so` (thin x86_64, has
  LC_SYMTAB + LC_DYSYMTAB + LC_DYLD_INFO_ONLY) defines only `___wine_unix_call_funcs`,
  `___wine_unix_call_wow64_funcs`. CrossOver's
  `/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/lib/wine/x86_64-unix/winemac.so`
  additionally defines `_macdrv_functions` (type D). Both are thin x86_64 Mach-O 64-bit.

**D-B: pass rule.** Passes if `_macdrv_functions` is defined, OR all three of
`_macdrv_view_create_metal_view`, `_macdrv_view_get_metal_layer`,
`_macdrv_view_release_metal_view` are defined (Mach-O names carry the leading underscore).
Anything else fails. Missing file, unreadable file, or unparseable/unsupported Mach-O also fails,
each with its own reason string.

**D-C: update path is gated too, and the gate moves the fetch decision.** Reading of "only create
or update when exports present": the `releasesInfoReady` census becomes "installed
Wine-Staging-macOS whose `${installDir}-DXMT` copy exists AND whose copy's `winemac.so` passes the
check". If that list is empty, return BEFORE `DXMT.getLatest()`. Copies that fail are skipped (one
warning each) and left byte-for-byte untouched — not deleted, not updated. The check is run
against the `-DXMT` copy's own `winemac.so`, because that is the binary DXMT will run against.
Note this tightens the 260916-9vh gate: previously a staging install with no `-DXMT` copy still
triggered the boot download into zero copies; now it does not. That is the same "no fetch nobody
needs" rationale as the existing comment, extended; update that comment to say so.

**D-D: install path.** In the `wineVersionInstalled` listener, run the check on
`join(installDir, versionInfo.version)` (the same source path `copyWineAndConfigure` copies from)
BEFORE `DXMT.getLatest()`. On fail: log the warning and return — no download, no copy.

<interfaces>
Existing, from src/backend/tools/dxmt.ts (unexported `DXMT` object):
- `DXMT.getLatest()` — returns undefined when offline, else `installOrUpdateTool(tool)` (from `'.'`, i.e. `tools/index.ts`).
- `DXMT.copyWineAndConfigure(versionInfo: WineVersionInfo, installDir: string)` — copies `join(installDir, versionInfo.version)` to `${...}-DXMT`.
- `DXMT.copyLatestDXMTFiles(pathToWine: string)`.
- Logger: `logDebug, logError, logWarning, LogPrefix` from `backend/logger`; fs from `graceful-fs`.
- Event emitted at src/backend/wine/manager/downloader/main.ts:359: `backendEvents.emit('wineVersionInstalled', versionInfo, installDir)`.

New, to create in src/backend/tools/machoExports.ts:
- `parseMachODefinedExternals(buf: Buffer): string[] | null` — null when not a supported Mach-O.
- `type WinemacMetalCheck = { ok: true } | { ok: false; winemacPath: string; reason: string; missing: string[] }`
- `checkWinemacMetalViewExports(wineBundlePath: string): WinemacMetalCheck`
- exported constant `DXMT_REQUIRED_MACDRV_SYMBOLS` (the four names) for log text and tests.
</interfaces>

Test invocation (jest projects are `src/backend`, `src/common`, `src/frontend`, ...; the backend
project config sets `resetMocks: true`):
`npx jest --runTestsByPath <file>` from the repo root.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: In-process Mach-O defined-export reader and winemac metal-view check</name>
  <files>src/backend/tools/machoExports.ts, src/backend/tools/__tests__/machoExports.test.ts</files>
  <behavior>
    - Synthetic thin 64-bit little-endian Mach-O (magic 0xfeedfacf) with LC_SYMTAB + LC_DYSYMTAB whose extdef range holds `_macdrv_functions` and `___wine_unix_call_funcs` → parser returns both names.
    - Same image where `_macdrv_view_create_metal_view` is an undefined external (n_type N_EXT with N_TYPE == N_UNDF, placed in the undef range) → NOT returned. This is the case a byte search gets wrong.
    - Local (non-N_EXT) symbol and a STAB entry (n_type & 0xe0 nonzero) → not returned.
    - Image with LC_SYMTAB but no LC_DYSYMTAB → falls back to filtering every nlist by N_EXT set, N_TYPE != N_UNDF, no STAB bits; same results.
    - Fat/universal wrapper (0xcafebabe, big-endian fat_arch entries) containing an x86_64 slice (cputype 0x01000007) → parses that slice. Fat without x86_64 → null.
    - Garbage bytes, a truncated header, a 32-bit Mach-O (0xfeedface), and out-of-bounds symoff/stroff → null, never throws.
    - `checkWinemacMetalViewExports`: `_macdrv_functions` present → ok; all three metal-view names present → ok; only two of three → fail listing the missing names; only `___wine_unix_call_*` (the Staging 11.20 shape) → fail with all four in `missing`; winemac.so absent → fail with reason "winemac.so not found"; parser null → fail with reason naming an unparseable Mach-O.
  </behavior>
  <action>
Create `src/backend/tools/machoExports.ts` per D-A/D-B. No child process anywhere in this file.

`parseMachODefinedExternals(buf)`: read magic as UInt32LE. If big-endian fat magic (bytes ca fe ba be, i.e. `readUInt32BE(0) === 0xcafebabe`), read `nfat_arch` BE, iterate 20-byte `fat_arch` records (cputype, cpusubtype, offset, size, align, all BE), pick cputype 0x01000007, recurse on that subarray (bounds-checked). For thin 0xfeedfacf: header is 32 bytes (`ncmds` at offset 16, `sizeofcmds` at 20); walk load commands from offset 32 using `cmd`/`cmdsize` (stop on cmdsize 0 or overrun). LC_SYMTAB = 0x2 (`symoff`, `nsyms`, `stroff`, `strsize` at +8..+20). LC_DYSYMTAB = 0xb (`ilocalsym` +8, `nlocalsym` +12, `iextdefsym` +16, `nextdefsym` +20). nlist_64 is 16 bytes: `n_strx` u32, `n_type` u8, `n_sect` u8, `n_desc` u16, `n_value` u64. With dysymtab, take indices `[iextdefsym, iextdefsym + nextdefsym)` and still apply the defined-external filter as a belt-and-braces check; without it, scan all nsyms with the filter (N_EXT 0x01 set, `(n_type & 0x0e) !== 0`, `(n_type & 0xe0) === 0`). Read names as NUL-terminated strings from `stroff + n_strx`, bounds-checked against `strsize` and buffer length. Wrap the whole parse so any RangeError returns null. Return null for 32-bit or unknown magic.

`checkWinemacMetalViewExports(wineBundlePath)`: path is `join(wineBundlePath, 'Contents', 'Resources', 'wine', 'lib', 'wine', 'x86_64-unix', 'winemac.so')`. Use `existsSync`/`readFileSync` from `graceful-fs` (same import as dxmt.ts) inside try/catch; read errors become a fail with the error message in `reason`. Apply D-B. `missing` lists every name from `DXMT_REQUIRED_MACDRV_SYMBOLS` not defined.

Write `src/backend/tools/__tests__/machoExports.test.ts` first (RED), covering every behavior bullet. Build images in a small in-test helper that assembles a Buffer (header, load commands, nlist table, string table) from a list of `{ name, type }` entries — do NOT commit any Wine or other real binary. For the check function, mock `graceful-fs` (`existsSync`, `readFileSync`) and return helper-built buffers. Assertions are positive (`toEqual` on exact arrays / objects), not negated pattern matches — per the dxmtBootFetch.test.ts header on vacuous negative assertions.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --runTestsByPath src/backend/tools/__tests__/machoExports.test.ts && npx prettier --file-info src/backend/tools/machoExports.ts src/backend/tools/__tests__/machoExports.test.ts && npx prettier --check src/backend/tools/machoExports.ts src/backend/tools/__tests__/machoExports.test.ts && npx eslint src/backend/tools/machoExports.ts src/backend/tools/__tests__/machoExports.test.ts && npx tsc --noEmit</automated>
    <manual-probe>Optional real-binary cross-check, run from the scratchpad, NOT committed: a one-off `npx tsx` or ts-node snippet calling `checkWinemacMetalViewExports` on `$HOME/Library/Application Support/gamelib/tools/wine/Wine-Staging-macOS-latest` must return ok:false with all four names missing, and calling `parseMachODefinedExternals` on CrossOver's winemac.so (path in D-A) must include `_macdrv_functions`. Record the output in the SUMMARY. Both results must agree with `nm -gU`.</manual-probe>
  </verify>
  <done>Parser returns exactly the `nm -gU` set for synthetic images, rejects undefined imports, never throws on malformed input; check function implements D-B; all tests pass; files prettier-clean, lint-clean, typecheck-clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Gate the install and update listeners in dxmt.ts</name>
  <files>src/backend/tools/dxmt.ts, src/backend/tools/__tests__/dxmtExportGate.test.ts, src/backend/tools/__tests__/dxmtBootFetch.test.ts</files>
  <behavior>
    - wineVersionInstalled, Staging, check ok → `installOrUpdateTool` called once (dxmt) and `cpSync` called once with source `join(installDir, version)` and destination `${...}-DXMT`.
    - wineVersionInstalled, check fails (Staging 11.20 shape) → `installOrUpdateTool` 0 calls, `cpSync` 0 calls, `logWarning` called once with a message containing the version, the winemac.so path and each missing symbol name, prefix `ToolInstaller`.
    - wineVersionInstalled, winemac.so missing → same as fail: no download, no copy, warning carries the "not found" reason.
    - Check is invoked BEFORE the download: assert call order (check mock's `invocationCallOrder[0]` lower than `installOrUpdateTool`'s) in the ok case.
    - releasesInfoReady, one installed Staging whose `-DXMT` copy exists and passes → one download, `copyFileSync` called for the copy.
    - releasesInfoReady, the only `-DXMT` copy fails → 0 downloads, 0 `copyFileSync`, 0 `rmSync`, one warning.
    - releasesInfoReady, two copies, one passes one fails → one download, `copyFileSync` targets only the passing copy's paths, failing copy gets 0 writes.
    - Across every case in the file: `rmSync` call count is 0 (no existing copy is ever deleted by the gate).
    - wineVersionUninstalled still calls `rmSync` on `${installDir}-DXMT` when it exists (unchanged behaviour, one regression case).
  </behavior>
  <action>
In `src/backend/tools/dxmt.ts`, import `checkWinemacMetalViewExports` (and `DXMT_REQUIRED_MACDRV_SYMBOLS` if useful for text) from `./machoExports`. Add a small helper inside the module, e.g. `logDXMTSkip(versionLabel, result)`, emitting one `logWarning(..., LogPrefix.ToolInstaller)` like: "Not creating/updating DXMT copy of <version>: <winemacPath> <reason>; missing <names joined>. DXMT v0.80 needs _macdrv_functions or all three _macdrv_view_*_metal_* exports, so D3D11 games could not present on it. Existing -DXMT copies are left untouched." Keep the install and update wording distinguishable ("creating" vs "updating").

Install listener (per D-D): inside the existing `isMac && type === 'Wine-Staging-macOS'` branch, compute the check on `join(installDir, versionInfo.version)` first; if not ok, log and return; only then `await DXMT.getLatest()` and `copyWineAndConfigure`. Do not touch `copyWineAndConfigure` itself.

Update listener (per D-C): keep the early returns for non-mac and equal version tag. Replace the census with: installed Staging wines → map to `${wine.installDir}-DXMT` → keep those where `existsSync` is true → run the check on each; log a skip warning for each that fails; collect the passing paths. If the passing list is empty, return before `DXMT.getLatest()`. Then download and `copyLatestDXMTFiles` into the passing paths only (drop the old existsSync-inside-forEach). Extend the long 260916-9vh comment with a short paragraph (quick 261031-rjv) saying the census now also requires an existing copy that passes the export check, so a Wine with no usable `-DXMT` copy never triggers the boot fetch, and that failing copies are deliberately left on disk (operator decision: games pinned to them must keep launching). Leave `wineVersionUninstalled` unchanged.

Tests: create `src/backend/tools/__tests__/dxmtExportGate.test.ts` modelled on `dxmtBootFetch.test.ts` — same mock set (`../index`, environment, paths, online_monitor, logger, wine/manager/utils, graceful-fs), plus `jest.mock('../machoExports', ...)` with `checkWinemacMetalViewExports: jest.fn()` and the real symbol constant re-exported or inlined. Import `../dxmt` once at file scope; drive the real `backendEvents` emitter; re-stub implementations in `beforeEach` because `resetMocks: true`. For releasesInfoReady cases, make `existsSync` path-aware (true for the `-DXMT` paths under test, false for `latest_dxmt` so `getCurrentDXMTVersion()` returns '' and the version early-return is not taken). Write these RED first against the current dxmt.ts.

Update `dxmtBootFetch.test.ts`: its "DOES fetch" case currently relies on a fetch with no `-DXMT` copy present, which D-C intentionally removes. Add `jest.mock('../machoExports', ...)` returning ok, make `existsSync` true for `${installDir}-DXMT` (still false for `latest_dxmt`), and add one sentence to that test's comment pointing at 261031-rjv. Keep the two "does NOT fetch" cases unchanged and green. Do not weaken any existing assertion.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --runTestsByPath src/backend/tools/__tests__/dxmtExportGate.test.ts src/backend/tools/__tests__/dxmtBootFetch.test.ts src/backend/tools/__tests__/machoExports.test.ts && npx prettier --file-info src/backend/tools/dxmt.ts src/backend/tools/__tests__/dxmtExportGate.test.ts src/backend/tools/__tests__/dxmtBootFetch.test.ts && npx prettier --check src/backend/tools/dxmt.ts src/backend/tools/__tests__/dxmtExportGate.test.ts src/backend/tools/__tests__/dxmtBootFetch.test.ts && npx eslint src/backend/tools/dxmt.ts src/backend/tools/__tests__/dxmtExportGate.test.ts src/backend/tools/__tests__/dxmtBootFetch.test.ts && npx tsc --noEmit && grep -v '^\s*//' src/backend/tools/dxmt.ts | grep -c checkWinemacMetalViewExports</automated>
  </verify>
  <done>Both listeners gate on the export check before any DXMT download; failing Wines get one clear ToolInstaller warning and no copy; existing copies are never deleted; uninstall unchanged; the three test files pass; prettier, eslint and tsc clean; the final grep counts at least 2 non-comment call sites.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| downloaded Wine bundle → sidecar | `winemac.so` comes from a third-party Wine download and is parsed in-process |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rjv-01 | Denial of service | `parseMachODefinedExternals` | mitigate | Every offset/length is bounds-checked against the buffer; the parse is wrapped so a malformed or hostile file returns null (check fails closed, no copy) and cannot crash the sidecar; tests cover truncated/garbage/out-of-bounds input |
| T-rjv-02 | Tampering | gate decision | accept | A tampered Wine can already run arbitrary code when launched; the gate only decides whether a convenience copy is made, so it adds no new privilege |
| T-rjv-03 | Elevation | `nm`/`xcrun` spawn | mitigate | No child process is spawned (D-A), so no CLT install prompt and no PATH/env exposure |
</threat_model>

<verification>
- `npx jest --runTestsByPath` over the three test files passes.
- `npx tsc --noEmit` and scoped eslint/prettier clean on the five written paths.
- `git diff --stat` shows only the five files in `files_modified` (plus planning artifacts).
</verification>

<success_criteria>
- A Wine-Staging-macOS whose winemac.so lacks the macdrv exports produces no new `-DXMT` engine, no DXMT download, and a ToolInstaller warning naming the missing symbols.
- A Wine that exports them still gets its `-DXMT` copy.
- No existing `-DXMT` copy is deleted or altered by the gate.
</success_criteria>

<output>
Create `.planning/quick/261031-rjv-gate-dxmt-wine-copy-on-winemac-metal-vie/261031-rjv-SUMMARY.md` when done.

Commit hygiene: the working tree holds unrelated uncommitted changes (meta/*, native/steam-bridge/*,
src/backend/storeManagers/steam/bridge/__tests__/*, public/locales/en/gamepage.json,
.planning/spikes/049-*, .planning/phases/*). Stage ONLY this plan's files by explicit path
(the five in `files_modified` plus this quick dir's PLAN/SUMMARY). Never `git add -A` or `git add .`.

Do NOT close or move the todo `.planning/todos/pending/2026-10-31-dxmt-engine-cannot-present-d3d11-on-wine-staging.md`.
It is `ready: live-gate`. Record in the SUMMARY, as the remaining gate for the operator:

> Live gate: restart `tauri dev` (it does not rebuild the sidecar; check sidecar.js mtime), then
> install or reinstall Wine-Staging-macOS from the Wine Manager on this Mac. Confirm (1) no new
> `-DXMT` engine appears (the existing `Wine-Staging-macOS-latest-DXMT` copy, if present, stays on
> disk untouched), and (2) the ToolInstaller log shows the skip warning naming
> `_macdrv_functions` and the three `_macdrv_view_*` symbols. Note: an uninstall-then-install
> will remove the old `-DXMT` copy via the unchanged uninstall listener; that is pre-existing
> behaviour, not this gate.

Also run `graphify update .` after the code change, per CLAUDE.md.
</output>
