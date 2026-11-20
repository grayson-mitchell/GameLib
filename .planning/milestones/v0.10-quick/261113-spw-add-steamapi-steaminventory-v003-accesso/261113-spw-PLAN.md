---
phase: quick-261113-spw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/sdk/isteaminventory003.manifest.json
  - meta/sdk/isteamvideo007.manifest.json
  - meta/sdk/isteamhtmlsurface005.manifest.json
  - meta/__tests__/gen_vtables.test.ts
  - native/steam-bridge/generated/steam_api_shim.c
  - native/steam-bridge/generated/steam_api64.def
  - native/steam-bridge/generated/steam_api.def
  - native/steam-bridge/generated/bridge_dispatch.h
  - src/backend/storeManagers/steam/bridge/shimExports.generated.ts
autonomous: true
requirements:
  - TODO-2026-11-13-bridge-shim-steaminventory-v003-export-missing

must_haves:
  truths:
    - "The x64 bridge shim (steam_api64.dll) exports SteamAPI_SteamInventory_v003, and it returns the same instance as the existing SteamAPI_STEAMINVENTORY_INTERFACE_V003 export"
    - "The existing version-string accessor exports (SteamAPI_STEAMINVENTORY_INTERFACE_V003, SteamAPI_STEAMVIDEO_INTERFACE_V007, SteamAPI_STEAMHTMLSURFACE_INTERFACE_VERSION_005) are still exported, so nothing that already links breaks"
    - "SteamAPI_SteamVideo_v007 and SteamAPI_SteamHTMLSurface_v005 (SDK spellings verified from a cited MIT source) are exported as aliases of their interfaces"
    - "Generated files are in sync with the manifests: re-running pnpm gen-vtables leaves no diff"
  artifacts:
    - path: "meta/sdk/isteaminventory003.manifest.json"
      provides: "SDK-spelling alias for the inventory v003 accessor"
      contains: "\"flatAccessorAliases\": [\"SteamAPI_SteamInventory_v003\"]"
    - path: "native/steam-bridge/generated/steam_api64.def"
      provides: "x64 export list"
      contains: "SteamAPI_SteamInventory_v003"
    - path: "native/steam-bridge/generated/steam_api_shim.c"
      provides: "alias accessor body"
      contains: "void *SteamAPI_SteamInventory_v003(void) { return &g_steaminventory_interface_v003_instance; }"
    - path: "meta/__tests__/gen_vtables.test.ts"
      provides: "regression test for the SDK-spelling aliases (real manifests + checked-in generated files)"
      contains: "SteamAPI_SteamInventory_v003"
  key_links:
    - from: "meta/sdk/isteaminventory003.manifest.json"
      to: "native/steam-bridge/generated/steam_api_shim.c"
      via: "pnpm gen-vtables -> emitFlatAccessor (meta/gen_vtables.ts:5986) emits primary + every flatAccessorAliases name"
      pattern: "SteamAPI_SteamInventory_v003\\(void\\)"
    - from: "native/steam-bridge/generated/steam_api64.def"
      to: "public/bin/<arch>/darwin/steam_api64.dll"
      via: "pnpm build-steam-bridge (mingw x86_64 link with the .def)"
      pattern: "SteamAPI_SteamInventory_v003"
---

<objective>
Core Keeper (1621690) crashes ~7 s after start under the bridge: Player.log shows
`EntryPointNotFoundException: SteamAPI_SteamInventory_v003` → "Platform init Steam failed". The
shim serves STEAMINVENTORY_INTERFACE_V003 but its flat accessor is exported only under the
version-string spelling `SteamAPI_STEAMINVENTORY_INTERFACE_V003`
(meta/sdk/isteaminventory003.manifest.json `flatAccessor`). The Steamworks SDK flat accessor that
Unity/Facepunch-style games P/Invoke is `SteamAPI_SteamInventory_v003`.

Fix: add the SDK spelling as a `flatAccessorAliases` entry (58-03 mechanism; precedent
meta/sdk/isteammatchmaking009.manifest.json). Keep the old primary name. Apply the same fix to the
two sibling interfaces whose SDK spelling the planner verified from a cited non-Valve source
(below). Regenerate, rebuild the shim, prove the DLL exports the new names.

Purpose: unblock Core Keeper's Steam init (pending todo
`.planning/todos/pending/2026-11-13-bridge-shim-steaminventory-v003-export-missing.md`).
Output: 3 manifest edits, regenerated shim sources, a regression test, rebuilt shim DLLs.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-11-13-bridge-shim-steaminventory-v003-export-missing.md
@meta/sdk/isteammatchmaking009.manifest.json

Load `Skill("gamelib-conventions")` (verify-block prettier rule) before running verify.

<interfaces>
From meta/gen_vtables.ts (InterfaceManifestV2, ~line 285):
  flatAccessor?: string            // primary accessor export name
  flatAccessorAliases?: string[]   // 58-03: extra exports returning the SAME instance; each must
                                   // match ^SteamAPI_[A-Za-z0-9_]+$ and be unique across every
                                   // manifest's accessors+aliases (validateManifest enforces)
  note?: string                    // free-form authoring note; must not name a *_TESTONLY method

From meta/gen_vtables.ts:5986 emitFlatAccessor — emits, for primary and each alias:
  void *<name>(void) { return &g_<interface lowercased>_instance; }

Exported from meta/gen_vtables.ts and already imported by meta/__tests__/gen_vtables.test.ts:
  loadAllManifests(), generateShimC(manifests), generateDefFile(manifests, 'x64'|'x86'),
  validateManifest(m, all). The test file already has `const real = loadAllManifests()` at line 93.

Existing alias tests to mirror: describe('58-03 flatAccessorAliases') at ~line 4370 (regex
`void \*<name>\(void\) \{ return &(\w+); \}` and same-instance capture comparison), and
describe('58-12 SteamMatchMaking009 wire') at ~line 5371 (asserts a real manifest's
flatAccessorAliases).

Current checked-in state (verified at planning time):
  steam_api_shim.c:47862  void *SteamAPI_STEAMINVENTORY_INTERFACE_V003(void) { return &g_steaminventory_interface_v003_instance; }
  steam_api64.def:1086    SteamAPI_STEAMINVENTORY_INTERFACE_V003
  SteamAPI_SteamInventory_v003 / SteamAPI_SteamVideo_v007 / SteamAPI_SteamHTMLSurface_v005: 0 hits in steam_api64.def
  All three manifests are "arches": ["x64"] — the new names land in steam_api64.def only (Core Keeper is x64).
  NOTE: steam_api_shim.c is reported by `file` as "data"; plain `grep` prints nothing on it. Use
  `LC_ALL=C grep -a` on that file.
</interfaces>

<alias_provenance>
D-09 forbids vendoring Valve header text, so SDK spellings were verified by the planner against
Facepunch.Steamworks (MIT, Copyright (c) 2016 Facepunch Studios LTD), commit
a9ab9a18208bd2532933e46a35860296d7dda688, files
Facepunch.Steamworks/Generated/Interfaces/{ISteamInventory,ISteamVideo,ISteamHTMLSurface,ISteamTimeline}.cs,
DllImport EntryPoint strings:
  ISteamInventory.cs   -> "SteamAPI_SteamInventory_v003"   (VERIFIED, matches our v003)
  ISteamVideo.cs       -> "SteamAPI_SteamVideo_v007"       (VERIFIED, matches our v007)
  ISteamHTMLSurface.cs -> "SteamAPI_SteamHTMLSurface_v005" (VERIFIED, matches our v005)
  ISteamTimeline.cs    -> "SteamAPI_SteamTimeline_v004"    (our manifest is V001 — NO match)
Steamworks.NET's NativeMethods.cs was also checked and has no flat accessor entry points at all
(it goes through ISteamClient), so it cannot corroborate either way.

IN scope: inventory003, video007, htmlsurface005 aliases.
DEFERRED (no verifiable SDK flat-accessor spelling for these versions; do NOT guess names):
isteaminventory001, isteamvideo001, isteamvideo002, isteamtimeline001, isteamhtmlsurface003.
Also deferred: `SteamAPI_SteamGameServerInventory_v003` (game-server accessor; a different instance
semantics, not needed by the Core Keeper client). Record all of these in the SUMMARY's deferred list.
</alias_provenance>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Regression test (RED), then add SDK-spelling accessor aliases and regenerate (GREEN)</name>
  <files>meta/__tests__/gen_vtables.test.ts, meta/sdk/isteaminventory003.manifest.json, meta/sdk/isteamvideo007.manifest.json, meta/sdk/isteamhtmlsurface005.manifest.json, native/steam-bridge/generated/steam_api_shim.c, native/steam-bridge/generated/steam_api64.def, native/steam-bridge/generated/steam_api.def, native/steam-bridge/generated/bridge_dispatch.h, src/backend/storeManagers/steam/bridge/shimExports.generated.ts</files>
  <behavior>
    - Test A: the real manifest for STEAMINVENTORY_INTERFACE_V003 keeps flatAccessor 'SteamAPI_STEAMINVENTORY_INTERFACE_V003' and has flatAccessorAliases equal to ['SteamAPI_SteamInventory_v003']; likewise STEAMVIDEO_INTERFACE_V007 -> ['SteamAPI_SteamVideo_v007'] and STEAMHTMLSURFACE_INTERFACE_VERSION_005 -> ['SteamAPI_SteamHTMLSurface_v005'].
    - Test B: generateShimC(real) contains `void *SteamAPI_SteamInventory_v003(void) { return &X; }` and `void *SteamAPI_STEAMINVENTORY_INTERFACE_V003(void) { return &Y; }` with X === Y === 'g_steaminventory_interface_v003_instance' (same-instance assertion); same shape for the video007 and htmlsurface005 pairs.
    - Test C: generateDefFile(real, 'x64') contains both the old and new name of each pair as whole lines.
    - Test D (checked-in sync): readFileSync of native/steam-bridge/generated/steam_api64.def contains a line exactly 'SteamAPI_SteamInventory_v003', and native/steam-bridge/generated/steam_api_shim.c (read as 'latin1' — the file is not clean UTF-8) contains the exact alias body line for inventory v003. This pins the COMMITTED artifact, not just the generator.
    - Test E: validateManifest(m, real) returns no errors for each of the three manifests (alias format + cross-manifest uniqueness).
  </behavior>
  <action>
RED: in meta/__tests__/gen_vtables.test.ts add a new describe block named
'261113-spw SDK-spelling flat accessor aliases (Core Keeper EntryPointNotFound SteamAPI_SteamInventory_v003)'
placed right after the existing '58-03 flatAccessorAliases' describe (~line 4420). Use the
existing top-level `real` (loadAllManifests()) and find manifests by `interface`. Implement tests
A–E from <behavior>; for B reuse the 58-03 regex shape `void \*<name>\(void\) \{ return &(\w+); \}`
and compare captures. Use a table of the three [interface, primary, alias] tuples with it.each or
a loop so one helper covers all three. Read generated files with join(__dirname, '..', '..',
'native', 'steam-bridge', 'generated', ...) (check the existing imports of readFileSync/join at the
top of the file and reuse them). Run the suite and confirm the new tests FAIL; commit
`test(quick-261113-spw): failing test for SDK-spelling inventory/video/htmlsurface accessor aliases`.

GREEN: edit the three manifests, adding the line directly after `"flatAccessor"` exactly as the
matchmaking009 precedent does — do NOT change `flatAccessor` (old export names must keep linking):
  isteaminventory003: "flatAccessorAliases": ["SteamAPI_SteamInventory_v003"]
  isteamvideo007: "flatAccessorAliases": ["SteamAPI_SteamVideo_v007"]
  isteamhtmlsurface005: "flatAccessorAliases": ["SteamAPI_SteamHTMLSurface_v005"]
Also add a top-level "note" to each of the three manifests (after "source") recording provenance:
"261113-spw: flatAccessorAliases is the Steamworks SDK flat-accessor spelling, verified from
Facepunch.Steamworks (MIT) a9ab9a18208bd2532933e46a35860296d7dda688
Generated/Interfaces/<file>.cs DllImport EntryPoint; flatAccessor keeps the previously shipped
version-string spelling." (substitute the right <file>). Do not copy any Valve header text (D-09).
If validateManifest rejects `note` placement or content, drop the note and put the provenance in
the commit body instead — do not loosen the validator.

Then run `pnpm gen-vtables`. This regenerates native/steam-bridge/generated/* and
src/backend/storeManagers/steam/bridge/shimExports.generated.ts — never hand-edit those. Expect
only additive diffs: three new accessor lines in steam_api_shim.c, three new lines in
steam_api64.def, and corresponding additions in shimExports.generated.ts; steam_api.def (x86)
should be unchanged because all three interfaces are x64-only. If bridge_dispatch.h or any
BRIDGE_SHIM_TABLE_HASH value changes, inspect it: a hash change that follows from the added
exports is expected; anything unrelated means stop and report. Run the meta tests; all GREEN.

Commit with explicit paths only — `git add <each file listed in <files> that changed>` then
`git commit` (do NOT use `gsd-sdk query commit`, which sweeps every dirty .planning file; and do
NOT stage the unrelated dirty humble/locales/spike files already in the worktree). Message:
`fix(quick-261113-spw): export SDK-spelling flat accessors SteamAPI_SteamInventory_v003 / SteamVideo_v007 / SteamHTMLSurface_v005`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Meta --testPathPattern 'meta/__tests__/(gen_vtables|buildSteamBridgeShims|shimAbiGate)' && pnpm gen-vtables && git diff --exit-code -- native/steam-bridge/generated src/backend/storeManagers/steam/bridge/shimExports.generated.ts && grep -qx 'SteamAPI_SteamInventory_v003' native/steam-bridge/generated/steam_api64.def && grep -qx 'SteamAPI_STEAMINVENTORY_INTERFACE_V003' native/steam-bridge/generated/steam_api64.def && LC_ALL=C grep -aqF 'void *SteamAPI_SteamInventory_v003(void) { return &g_steaminventory_interface_v003_instance; }' native/steam-bridge/generated/steam_api_shim.c && for p in meta/__tests__/gen_vtables.test.ts meta/sdk/isteaminventory003.manifest.json meta/sdk/isteamvideo007.manifest.json meta/sdk/isteamhtmlsurface005.manifest.json src/backend/storeManagers/steam/bridge/shimExports.generated.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $p"; done && npx prettier --check meta/__tests__/gen_vtables.test.ts meta/sdk/isteaminventory003.manifest.json meta/sdk/isteamvideo007.manifest.json meta/sdk/isteamhtmlsurface005.manifest.json src/backend/storeManagers/steam/bridge/shimExports.generated.ts</automated>
  </verify>
  <done>
New describe block existed and failed before the manifest edit, passes after. The three manifests
carry the aliases with their original flatAccessor unchanged. gen-vtables re-run after the commit
leaves no diff. Prettier --file-info reports all five prettier-visible paths as not ignored (at
planning time: manifests "json", test and shimExports "typescript") and --check passes. The
native/steam-bridge/generated/*.c/.def/.h files report "inferredParser": null — prettier has no
parser for them, so they are deliberately not in the --check list (a check there would prove
nothing); they are pinned by the gen-vtables no-diff gate instead.
  </done>
</task>

<task type="auto">
  <name>Task 2: Rebuild the shim DLLs and prove the x64 DLL exports the new names</name>
  <files>public/bin/arm64/darwin/steam_api64.dll (gitignored build output, not committed)</files>
  <action>
Run `pnpm build-steam-bridge` (meta/buildSteamBridgeShims.ts; cross-compiles with the Homebrew
mingw toolchain x86_64-w64-mingw32-gcc, present on this Mac at planning time). If it fails because
a toolchain is missing, stop and report — do not hand-link. Then inspect the export table of every
built x64 shim: `x86_64-w64-mingw32-objdump -p public/bin/<arch>/darwin/steam_api64.dll` for each
<arch> directory that exists under public/bin, and confirm SteamAPI_SteamInventory_v003,
SteamAPI_SteamVideo_v007, SteamAPI_SteamHTMLSurface_v005 AND the old
SteamAPI_STEAMINVENTORY_INTERFACE_V003 all appear. These DLLs are gitignored
(public/bin/.gitignore `**/steam_api64.dll`), so nothing is committed by this task. Run
`graphify update .` afterwards (CLAUDE.md: after modifying code) and do not commit graphify-out
unless it is tracked and already dirty-free beforehand.

Note: this task writes no prettier-visible files (only a gitignored PE binary), so per the
gamelib-conventions verify rule no `prettier --check` is carried here — it would be vacuous.

Note in the SUMMARY: bridged games pick up the new DLL only once the shim is re-staged into the
game's bottle (the next bridge launch/install path); `tauri dev` does not rebuild the sidecar, so
restart dev before the live UAT (memory: tauri-dev-does-not-rebuild-sidecar).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm build-steam-bridge && for d in public/bin/*/darwin; do f="$d/steam_api64.dll"; [ -f "$f" ] || continue; ex=$(x86_64-w64-mingw32-objdump -p "$f"); for n in SteamAPI_SteamInventory_v003 SteamAPI_STEAMINVENTORY_INTERFACE_V003 SteamAPI_SteamVideo_v007 SteamAPI_SteamHTMLSurface_v005; do printf "%s\n" "$ex" | grep -qw "$n" || { echo "MISSING $n in $f"; exit 1; }; done; echo "OK $f"; done</automated>
  </verify>
  <done>build-steam-bridge exits 0; every built steam_api64.dll lists all four names in its PE export table (prints "OK &lt;path&gt;" per DLL, no MISSING line).</done>
</task>

</tasks>

<human_followup>
NOT an executor task — list in the SUMMARY as "human-needed":

Live Core Keeper (1621690) re-verification against the strict bridge criterion
(memory: bridge-verified-criterion-is-strict): after restarting `pnpm tauri:dev` (not
tauri:dev:run) so the rebuilt shim is staged, launch Core Keeper via the bridge and confirm
(1) Player.log has no EntryPointNotFoundException for SteamAPI_SteamInventory_v003 and no
"Platform init Steam failed", (2) the game survives past the ~7 s crash point, (3) bridge HELLO plus
a clean game-side Steam-init log line. In-Game status alone does not count. If a NEW
EntryPointNotFound appears for a different SteamAPI_* name, that is a separate defect — file it,
do not widen this plan.

Todo lifecycle: the executor must NOT move
`.planning/todos/pending/2026-11-13-bridge-shim-steaminventory-v003-export-missing.md`. The
orchestrator moves it to `.planning/todos/completed/` after the code lands (and may hold it pending
the live UAT above).
</human_followup>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| game process -> shim exports | An untrusted Windows game resolves exports by name from our steam_api64.dll |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-spw-01 | Tampering | meta/sdk manifests (alias names) | mitigate | validateManifest enforces ^SteamAPI_[A-Za-z0-9_]+$ and cross-manifest uniqueness; Test E asserts no errors for the three manifests |
| T-spw-02 | Elevation of Privilege | new alias exports | accept | Aliases return the address of an already-exported static instance (same pointer as the existing primary accessor); no new code path or capability is exposed |
| T-spw-03 | Repudiation / licensing | alias provenance | mitigate | Names sourced from MIT Facepunch.Steamworks at a pinned commit and recorded in manifest note/commit; no Valve header text vendored (D-09) |
</threat_model>

<verification>
- Meta jest suites (gen_vtables, buildSteamBridgeShims, shimAbiGate) pass.
- `pnpm gen-vtables` after the commit produces no diff in native/steam-bridge/generated or shimExports.generated.ts.
- Built steam_api64.dll export tables contain the new and old names.
- Scoped prettier --check over the prettier-visible written paths passes.
</verification>

<success_criteria>
- SteamAPI_SteamInventory_v003 exported from the x64 shim, same instance as SteamAPI_STEAMINVENTORY_INTERFACE_V003 (test-pinned in generator output and the committed shim C/.def).
- SteamVideo_v007 / SteamHTMLSurface_v005 SDK aliases exported likewise; no existing export removed.
- Deferred, with reason, in SUMMARY: inventory001, video001, video002, timeline001 (Facepunch has v004 only), htmlsurface003, SteamGameServerInventory_v003.
- Human UAT follow-up and todo-move ownership recorded in SUMMARY.
</success_criteria>

<output>
Create `.planning/quick/261113-spw-add-steamapi-steaminventory-v003-accesso/261113-spw-SUMMARY.md` when done
</output>
