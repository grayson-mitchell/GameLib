---
phase: quick-261021-pgx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts
  - meta/sdk/acceptance-interface-versions.json
  - meta/sdk/ordinals.json
  - meta/sdk/isteamfriends013.manifest.json
  - meta/sdk/isteamapps005.manifest.json
  - meta/sdk/isteamuserstats011.manifest.json
  - src/backend/storeManagers/steam/bridge/shimCoverage.ts
  - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
  - native/steam-bridge/generated/steam_api_shim.c
  - native/steam-bridge/generated/steam_api.def
  - native/steam-bridge/generated/bridge_dispatch.h
  - .planning/todos/pending/2026-10-21-hoard-original-steam-api-dll-interface-versions-unmeasured.md
autonomous: true
requirements: [TODO-261021-HOARD-STEAM-API-DLL-INTERFACE-VERSIONS-UNMEASURED]

estimate:
  tokens: 70000
  raw_tokens: 60000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "Hoard's (63000) interface-version strings are measured from its real original steam_api.dll (104872 bytes, operator-provenance confirmed), never invented, and committed as fixture text, never a binary"
    - "meta/sdk/acceptance-interface-versions.json records Hoard's exact matches with XCOM (SteamUser016, SteamUtils005) and its 3 newer versions (SteamFriends013, STEAMAPPS_INTERFACE_VERSION005, STEAMUSERSTATS_INTERFACE_VERSION011), each tied to title 63000"
    - "A complete, Proton-extracted, ABI-cross-checked manifest exists for each of the 3 new versions that Proton's pinned lsteamclient tree actually has; any version it does not have is named as a blocker, never hand-authored"
    - "shimCoverage.ts serves the 3 new versions (export set + served map), the regenerated native shim compiles, and a real coverage test proves Hoard's own captured import table now resolves and serves its first-locked-interface-group plus User/Friends versions -- not just XCOM's"
    - "The pending todo tracking this gap is deleted (if fully resolved) or narrowly rewritten to name only the remaining Proton-tree blocker, with gamelib-conventions-compliant frontmatter (bare lowercase severity/platform/ready, in that order)"
  artifacts:
    - path: src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts
      provides: "HOARD_DLL_VERSION_STRINGS -- Hoard's real measured interface-version strings"
    - path: meta/sdk/isteamfriends013.manifest.json
      provides: "complete, ABI-checked SteamFriends013 manifest"
    - path: meta/sdk/isteamapps005.manifest.json
      provides: "complete, ABI-checked STEAMAPPS_INTERFACE_VERSION005 manifest"
    - path: meta/sdk/isteamuserstats011.manifest.json
      provides: "complete, ABI-checked STEAMUSERSTATS_INTERFACE_VERSION011 manifest"
  key_links:
    - from: meta/sdk/acceptance-interface-versions.json
      to: meta/extractProtonInventory.ts
      via: "pnpm extract-proton-inventory --versions reads each requested version's family/arches entry before fetching Proton source; main() throws if the entry is missing"
      pattern: "extract-proton-inventory"
    - from: meta/sdk/*.manifest.json
      to: src/backend/storeManagers/steam/bridge/shimCoverage.ts
      via: "SHIM_SERVED_INTERFACE_VERSIONS / SHIM_EXPORTED_SYMBOLS pins, both dynamic against the committed .def and the meta/sdk directory listing"
      pattern: "SHIM_SERVED_INTERFACE_VERSIONS"
---

<objective>
Plan 51-11 built a Proton `lsteamclient` extractor and served XCOM: Enemy Unknown's (200510)
measured first-locked-interface-group versions, but explicitly skipped measuring Hoard (63000)
because the operator could not get Hoard's original `steam_api.dll` that session. The operator has
since obtained it and already ran `strings -a` against it this session. This plan records that
measurement as real evidence, builds the 3 manifests Hoard needs that don't exist yet
(`SteamFriends013`, `STEAMAPPS_INTERFACE_VERSION005`, `STEAMUSERSTATS_INTERFACE_VERSION011` -- its
`SteamUser016`/`SteamUtils005` already match XCOM's and just need Hoard added to their `titles`),
wires them into the shim, and proves coverage against Hoard's own captured import table.

Purpose: close the Hoard-measurement gap 51-11 left open (pending todo
`2026-10-21-hoard-original-steam-api-dll-interface-versions-unmeasured.md`), so the 24-UAT Gate 4
Hoard re-run has real, measured acceptance coverage behind it instead of an unmeasured placeholder.
Output: `HOARD_DLL_VERSION_STRINGS` fixture, 3 new complete manifests, a widened `shimCoverage.ts`,
a regenerated+compiled native shim, a Hoard-specific coverage test, and the pending todo resolved.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-11-SUMMARY.md
@meta/extractProtonInventory.ts
@src/backend/storeManagers/steam/bridge/shimCoverage.ts
@src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts
@meta/sdk/acceptance-interface-versions.json

Already measured this session, read-only, against the operator's real original `steam_api.dll`
(104872 bytes -- NOT the 805888-byte Phase 24 shim -- now at
`/Users/graysonmitchell/Downloads/steam_api.dll`):
`strings -a steam_api.dll | grep -E '^(Steam[A-Za-z]+0[0-9]{2}|STEAM[A-Z]+_INTERFACE_VERSION0[0-9]{2})$' | sort -u`
returned exactly these 16 strings: `STEAMAPPS_INTERFACE_VERSION005`, `STEAMHTTP_INTERFACE_VERSION002`,
`STEAMREMOTESTORAGE_INTERFACE_VERSION010`, `STEAMSCREENSHOTS_INTERFACE_VERSION002`,
`STEAMUNIFIEDMESSAGES_INTERFACE_VERSION001`, `STEAMUSERSTATS_INTERFACE_VERSION011`,
`SteamClient012`, `SteamContentServer002`, `SteamFriends013`, `SteamGameServer011`,
`SteamGameServerStats001`, `SteamMatchMaking009`, `SteamMatchMakingServers002`,
`SteamNetworking005`, `SteamUser016`, `SteamUtils005`.

Provenance (operator's direct confirmation, record verbatim in the new fixture comment): freshly
installed from scratch on a separate Windows PC where XCOM is not even installed, ruling out a copy
mixup -- despite an unrelated, coincidental byte-identical match to an XCOM XEW expansion dll already
in this repo's CrossOver fixtures, which is a documented coincidence, not evidence of contamination.

Current `meta/sdk/acceptance-interface-versions.json` (7 entries): `SteamUser023`/`SteamFriends018`
have `"titles": []`; `SteamUser016`/`SteamFriends011`/`SteamUtils005`/`STEAMAPPS_INTERFACE_VERSION004`/
`STEAMUSERSTATS_INTERFACE_VERSION010` all have `"titles": ["200510"]`.

Hoard's real captured import table (`HOARD_REUBEN_REAL_OBJDUMP_OUTPUT`, already in
`objdumpImports.ts` from Phase 51 Plan 02) imports exactly 8 bare accessors: `SteamUtils`,
`SteamUser`, `SteamFriends`, `SteamMatchmaking`, `SteamUserStats`, `SteamNetworking`, `SteamApps`,
`SteamRemoteStorage` (no `SteamMatchmakingServers`, no `SteamGameServer*` names -- simpler than
XCOM's 26-import table). Resolving those 8 against the 16 measured strings above is unambiguous:
one version per family, nothing ambiguous or unknown.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Record Hoard's measured strings and extract its 3 new manifests</name>
  <files>src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts, meta/sdk/acceptance-interface-versions.json, meta/sdk/ordinals.json, meta/sdk/isteamfriends013.manifest.json, meta/sdk/isteamapps005.manifest.json, meta/sdk/isteamuserstats011.manifest.json</files>
  <read_first>
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts -- the file header doc comment plus `XCOM_DLL_VERSION_STRINGS`/`ELEX_EXE_VERSION_STRINGS`'s shape and provenance-comment convention; `HOARD_REUBEN_REAL_OBJDUMP_OUTPUT` already exists, there is no `HOARD_DLL_VERSION_STRINGS` export yet
    - meta/extractProtonInventory.ts -- `main()` throws if a requested `--versions` entry has no row in `acceptance-interface-versions.json` yet (family/arches unknown), so that file must be edited BEFORE running the extractor; `manifestFilenameFor()`/`computeFlatAccessor()` determine the exact output filenames and flat-accessor strings; `PINNED_PROTON_SHA` is the same `2c620c0fd7c2c424f6bd91898602bdc4d4260468` 51-11 used
    - meta/sdk/isteamapps004.manifest.json, isteamfriends011.manifest.json, isteamuserstats010.manifest.json -- each carries a manifest-level `helperInterface`; confirm by reading `main()` in extractProtonInventory.ts that the written manifest object literal has NO `helperInterface` field -- 51-11 added it by hand to each new manifest after running the extractor, and `meta/gen_vtables.ts`'s `generateDispatchHeader` throws if a wire-mode manifest lacks it
  </read_first>
  <precondition>Network access to raw.githubusercontent.com is required (the extractor fetches lsteamclient/winISteamFriends.c, winISteamApps.c and winISteamUserStats.c at the pinned SHA over HTTPS); a fetch failure is a transient network problem to retry, not a Proton-tree-absence blocker -- only "no __ASM_VTABLE(...) block found" (or an equivalent parse failure) means the version itself is absent.</precondition>
  <action>
    Add `HOARD_DLL_VERSION_STRINGS` to objdumpImports.ts, directly beside `XCOM_DLL_VERSION_STRINGS`/`ELEX_EXE_VERSION_STRINGS`, in the same array-of-string-literals shape with the same provenance-comment convention (what was captured, the exact command, a `[VERIFIED: ...]` tag). Content: the 16 strings listed in this plan's context section above, transcribed verbatim -- if `/Users/graysonmitchell/Downloads/steam_api.dll` is still present outside the repo, re-run `stat -f %z` and the same `strings -a | grep -E | sort -u` command read-only first to confirm 104872 bytes and this exact set before transcribing; if it is gone, use the values already recorded here verbatim and never invent or extrapolate one not in this list. In the comment, record the 104872-byte size (not the 805888-byte Phase 24 shim), that it was measured via `strings -a` this session, and the operator's own provenance statement from the context section above -- including the coincidental XCOM XEW byte-match detail, explicitly flagged as a documented coincidence rather than evidence of contamination.

    Edit meta/sdk/acceptance-interface-versions.json: extend `SteamUser016.titles` and `SteamUtils005.titles` from `["200510"]` to `["200510", "63000"]` (Hoard's measured versions for both families exactly match XCOM's). Add three new top-level entries, each shaped `{ "family": <family>, "arches": ["x86"], "titles": ["63000"] }`: `SteamFriends013` (family `SteamFriends`), `STEAMAPPS_INTERFACE_VERSION005` (family `SteamApps`), `STEAMUSERSTATS_INTERFACE_VERSION011` (family `SteamUserStats`). Run `npx prettier --write` on the file afterward -- its current single-line style is prettier's own output for this file shape, not hand-formatting to preserve by eye.

    Run `pnpm extract-proton-inventory --versions SteamFriends013,STEAMAPPS_INTERFACE_VERSION005,STEAMUSERSTATS_INTERFACE_VERSION011` against the pinned `proton_9.0` commit already hardcoded in the extractor. This writes `meta/sdk/isteamfriends013.manifest.json`, `isteamapps005.manifest.json` and `isteamuserstats011.manifest.json` (per `manifestFilenameFor`'s digit-suffix rule) and appends the next 3 ordinals to `meta/sdk/ordinals.json`. If the extractor throws a "no `__ASM_VTABLE(...)` block found" (or any other parse failure) for one of these three, STOP for that version only: do not hand-author a vtable layout for it -- name the exact version and error text as a blocker (Task 2 records it in the pending todo), and continue with whichever of the three succeeded.

    After the extractor writes each manifest, hand-edit it to add its manifest-level `helperInterface` field, mirroring the family's already-served Mac dylib accessor exactly as 51-11 set it: `isteamfriends013.manifest.json`'s `helperInterface` = `SteamAPI_SteamFriends_v018`; `isteamapps005.manifest.json`'s = `SteamAPI_SteamApps_v009`; `isteamuserstats011.manifest.json`'s = `SteamAPI_SteamUserStats_v013` (the same values already on `isteamfriends011`/`isteamapps004`/`isteamuserstats010` -- one real Mac-side interface pointer per family, independent of which Windows-side version string the game asked for).
  </action>
  <verify>
    <automated>pnpm jest meta/__tests__/gen_vtables.test.ts --silent</automated>
    <fails_when>non-zero exit, or any manifest (including the up-to-3 new ones) reporting `complete: false` or a `validateManifest` error</fails_when>
    <automated>npx prettier --check src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts meta/sdk/acceptance-interface-versions.json meta/sdk/ordinals.json meta/sdk/isteamfriends013.manifest.json meta/sdk/isteamapps005.manifest.json meta/sdk/isteamuserstats011.manifest.json</automated>
    <fails_when>exit code non-zero or a "[warn]" line naming one of these paths (only check paths that were actually written, in case a version was blocked)</fails_when>
  </verify>
  <acceptance_criteria>
    - `grep -n "HOARD_DLL_VERSION_STRINGS" src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts` returns the new export
    - `grep -c '"63000"' meta/sdk/acceptance-interface-versions.json` prints at least 5 (SteamUser016, SteamUtils005, plus each of the 3 new entries that were not blocked)
    - `grep -l '"helperInterface"' meta/sdk/isteamfriends013.manifest.json meta/sdk/isteamapps005.manifest.json meta/sdk/isteamuserstats011.manifest.json` returns every manifest that was actually written (fewer than 3 only if one was named a Proton-tree blocker)
    - `grep -lx '.*"complete": false.*' meta/sdk/*.manifest.json` returns nothing
  </acceptance_criteria>
  <done>Hoard's measured interface-version strings are committed as real evidence (never invented), acceptance-interface-versions.json reflects Hoard's exact matches and new versions, and a complete, ABI-valid manifest exists for each of the 3 new versions Proton's tree actually supports -- any it does not support is named as an exact blocker for Task 2 to record.</done>
  <reversibility rating="reversible">Data/config only; the ordinal registry is append-only by design.</reversibility>
</task>

<task type="auto">
  <name>Task 2: Wire shimCoverage.ts, regenerate the shim, prove Hoard's coverage, resolve the todo</name>
  <files>src/backend/storeManagers/steam/bridge/shimCoverage.ts, src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts, native/steam-bridge/generated/steam_api_shim.c, native/steam-bridge/generated/steam_api.def, native/steam-bridge/generated/bridge_dispatch.h, .planning/todos/pending/2026-10-21-hoard-original-steam-api-dll-interface-versions-unmeasured.md</files>
  <read_first>
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts -- `SHIM_EXPORTED_SYMBOLS` (the 24-CR-02 pin: must set-equal `native/steam-bridge/generated/steam_api.def`'s export list) and `SHIM_SERVED_INTERFACE_VERSIONS` (the manifest pin: keys must equal every x86 `meta/sdk` manifest's `interface` field) -- both pins are dynamic (read the committed `.def` file / `meta/sdk` directory at test time), so no test-file edit is needed for either pin itself; only the map/set literals in shimCoverage.ts change. Also read the stale inline comment above `SHIM_EXPORTED_SYMBOLS`'s 51-11 block that currently says "Hoard's own measured versions remain a follow-up (Task 1 of 51-11 was skipped this run...)" -- that sentence is now wrong and must be updated.
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts lines ~317-412 -- the existing XCOM `evaluateShimCoverage` acceptance test (51-11 Task 3), to mirror for Hoard: `parseSteamApiImports` + `resolveRequiredInterfaceVersions` + `evaluateShimCoverage`, asserting `versionProblems` is empty and `missingSymbols` is exactly the still-out-of-scope families, plus a final loop proving none of the widened families ever appears in the miss list
    - meta/gen_vtables.ts `generateDefFile`/`FLAT_EXPORTS_SUPERSET` -- confirms the `.def` file gets ONE flat-accessor export per manifest (not per family), so the 3 new manifests add 3 new flat exports to `steam_api.def`: `SteamAPI_SteamFriends_v013`, `SteamAPI_SteamApps_v005`, `SteamAPI_SteamUserStats_v011` -- these must be added to `SHIM_EXPORTED_SYMBOLS` or the 24-CR-02 pin test fails
    - .planning/todos/pending/2026-10-21-hoard-original-steam-api-dll-interface-versions-unmeasured.md -- the todo this task resolves; its frontmatter key order (`severity`, `platform`, `ready`, bare lowercase) is enforced by `pnpm planning-gates` if rewritten rather than deleted
  </read_first>
  <action>
    In shimCoverage.ts, add to `SHIM_EXPORTED_SYMBOLS` the flat accessor export for each manifest Task 1 actually wrote (`SteamAPI_SteamFriends_v013`, `SteamAPI_SteamApps_v005`, `SteamAPI_SteamUserStats_v011` -- skip any that Task 1 named as a Proton-tree blocker; the bare names `SteamFriends`/`SteamApps`/`SteamUserStats` etc. are already present from 51-11, no change needed there). Add a matching entry to `SHIM_SERVED_INTERFACE_VERSIONS` for each, mode `'wire'`, family matching exactly as the existing `SteamFriends011`/`STEAMAPPS_INTERFACE_VERSION004`/`STEAMUSERSTATS_INTERFACE_VERSION010` entries do: `SteamFriends013` -> family `SteamFriends`; `STEAMAPPS_INTERFACE_VERSION005` -> family `SteamApps`; `STEAMUSERSTATS_INTERFACE_VERSION011` -> family `SteamUserStats`. Update the stale inline comment identified in `read_first` to say Hoard's measured versions are now served by this task (name it by its directory slug, 261021-pgx), following the file's own established per-addition commenting convention; also add a short trailing comment on the `SHIM_SERVED_INTERFACE_VERSIONS` block's new entries noting they are Hoard's (63000) measured versions.

    Run `pnpm gen-vtables` and let it regenerate `native/steam-bridge/generated/{steam_api_shim.c,steam_api.def,bridge_dispatch.h}` -- the `.def` file's `EXPORTS` list must now include the new flat accessors added above. Commit the regenerated output.

    In shimCoverage.test.ts, import `HOARD_DLL_VERSION_STRINGS` and `HOARD_REUBEN_REAL_OBJDUMP_OUTPUT` from `./fixtures/objdumpImports` (both exist after Task 1) and add a new `describe` block directly after the existing XCOM `evaluateShimCoverage` acceptance test, named analogously (e.g. "evaluateShimCoverage (Hoard: 63000) -- the five widened families now covered for Hoard specifically"). Parse Hoard's symbols with `parseSteamApiImports(HOARD_REUBEN_REAL_OBJDUMP_OUTPUT)`, resolve required versions with `resolveRequiredInterfaceVersions({ importedSymbols, dllVersions: HOARD_DLL_VERSION_STRINGS, exeVersions: [] })`, assert `versionProblems` is empty (resolves cleanly, no unknown-version/ambiguous problems), then call `evaluateShimCoverage` with `arch: 'x86'` and assert `missingSymbols` is exactly the bare names `SteamMatchmaking`/`SteamNetworking`/`SteamRemoteStorage` plus their required versions `SteamMatchMaking009`/`SteamNetworking005`/`STEAMREMOTESTORAGE_INTERFACE_VERSION010` (Hoard's real import table has no `SteamMatchmakingServers` and no `SteamGameServer*` names, unlike XCOM's), with `stubbedInterfaces` empty -- then a final loop asserting none of `SteamUser`/`SteamFriends`/`SteamUtils`/`SteamApps`/`SteamUserStats` or their now-served versions (`SteamUser016`/`SteamFriends013`/`SteamUtils005`/`STEAMAPPS_INTERFACE_VERSION005`/`STEAMUSERSTATS_INTERFACE_VERSION011`) ever appears in `missingSymbols` -- the real "now covered for Hoard specifically" assertion, mirroring the XCOM test's own widened-names loop. If Task 1 named a blocker for one of the three, adjust the expected-missing lists to still include that one version/family and note why in a comment.

    Resolve the pending todo: if all 3 manifests were built with no Proton-tree blocker, delete `.planning/todos/pending/2026-10-21-hoard-original-steam-api-dll-interface-versions-unmeasured.md` via `git rm` -- its "what is blocked" section is now fully measured and served. If Task 1 hit a named blocker for one or more of the 3 versions, instead rewrite the todo narrowly to describe only the remaining blocked version(s) and the exact Proton-tree error text, keeping its frontmatter's `severity`, `platform`, `ready` keys bare, lowercase and in that exact order (`severity: major`, `platform: any`, `ready: blocked` is the reasonable choice when the blocker is "Proton's pinned tree doesn't carry this version," since no local rework changes that).
  </action>
  <verify>
    <automated>pnpm gen-vtables && git diff --exit-code native/steam-bridge/generated/ && pnpm jest meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts --silent</automated>
    <fails_when>non-zero exit, any diff under native/steam-bridge/generated/, or "Tests: 0 total"</fails_when>
    <automated>pnpm build-steam-bridge</automated>
    <fails_when>non-zero exit or a "COMPILE GATE FAILED" line</fails_when>
    <automated>npx prettier --check src/backend/storeManagers/steam/bridge/shimCoverage.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts</automated>
    <fails_when>exit code non-zero or a "[warn]" line naming one of these paths (generated .c/.def/.h excluded: `npx prettier --file-info` reports `inferredParser: null`; `.planning/todos/**` excluded: reports `ignored: true`)</fails_when>
  </verify>
  <acceptance_criteria>
    - `grep -c "SteamAPI_SteamFriends_v013\|SteamAPI_SteamApps_v005\|SteamAPI_SteamUserStats_v011" native/steam-bridge/generated/steam_api.def` prints the count of versions Task 1 actually built (1-3)
    - `pnpm build-steam-bridge` exits 0 with "COMPILE GATE PASSED"
    - the new Hoard `describe` block in shimCoverage.test.ts passes, with the final loop proving zero overlap with the five widened families
    - exactly one of: the pending todo file no longer exists (fully resolved), OR it exists with `severity`/`platform`/`ready` still bare-lowercase-ordered and `pnpm planning-gates` passes (named blocker remains)
  </acceptance_criteria>
  <done>Hoard's measured first-locked-interface-group versions (plus its User/Friends versions) are served end-to-end -- exported, served, ABI-checked, compiled -- and a real coverage test proves it against Hoard's own captured import table, not just XCOM's. The pending todo reflects reality.</done>
  <reversibility rating="reversible">Generated code regenerates deterministically from committed manifests; the shimCoverage additions mirror 51-11's own append-only pattern.</reversibility>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GitHub (Proton repo) -> extractor | third-party source text fetched at authoring time (unchanged mechanism from 51-11; T-51-26) |
| operator-provided binary -> committed fixture | Hoard's real steam_api.dll is third-party content; only the ASCII interface-version strings it exports are committed as fixture text, never the binary itself |
| new manifests -> generated ABI | a wrong stack width corrupts a real game's stack at runtime (unchanged mechanism from 51-11; T-51-27) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-pgx-01 | Tampering | extractProtonInventory fetch (reused, unchanged) | medium | accept | Already mitigated by T-51-26 (HTTPS fetch of a pinned commit SHA recorded in every manifest's `source.ref`; the extractor never runs in build/CI). This plan adds no new fetch logic -- only new `--versions` arguments against the same pinned SHA. |
| T-pgx-02 | Tampering | new manifest stack widths (SteamFriends013/Apps005/UserStats011) | high | mitigate | The same `validateManifest` cross-check from T-51-27 runs unconditionally over every `meta/sdk` manifest, including these 3; `pnpm gen-vtables`/`pnpm build-steam-bridge` both gate on it before this plan's verify step can pass. |
| T-pgx-03 | Tampering | `HOARD_DLL_VERSION_STRINGS` provenance (operator-supplied binary) | low | accept | Only the ASCII interface-version strings (public, SDK-shaped identifiers, no executable content) are committed, with an explicit provenance comment recording the operator's own chain-of-custody statement; no binary is ever committed. |
| T-pgx-SC | Tampering | npm/pip/cargo installs | high | accept | No package-manager install is in scope for this plan. If an executor finds it needs one, STOP and escalate -- the package-legitimacy gate has not been run for this task. |
</threat_model>

<verification>
`pnpm gen-vtables` produces no diff after being committed, `meta/__tests__/gen_vtables.test.ts` and
`shimCoverage.test.ts` are both green (including the new Hoard-specific coverage test), and
`pnpm build-steam-bridge` compiles cleanly.
</verification>

<success_criteria>
Hoard's measured interface versions are recorded as real evidence, never invented. Every version
Proton's pinned tree actually supports is served end-to-end (exported, served, ABI-checked,
compiled) and proven by a real coverage test against Hoard's own captured import table. Any version
Proton's tree does not support is named as an exact, narrow blocker -- not silently dropped, not
hand-authored around.
</success_criteria>

<output>
Create `.planning/quick/261021-pgx-record-hoard-s-measured-steam-interface-versions-and-build-t/261021-pgx-SUMMARY.md` when done
</output>
