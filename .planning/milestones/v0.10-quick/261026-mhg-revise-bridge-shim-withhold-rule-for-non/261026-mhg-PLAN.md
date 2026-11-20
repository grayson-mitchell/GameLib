---
phase: quick-261026-mhg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/bridge/shimCoverage.ts
  - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
autonomous: false
requirements: [QUICK-261026-mhg]

must_haves:
  truths:
    - "A game whose only unservable interface versions are in non-core families (SteamController, SteamUGC, SteamTimeline, SteamRemotePlay, ...) and are answered by the x64 null object gets the shim placed (placed-miss), with those gaps still named in the verdict"
    - "A delay-imported missing symbol still withholds the shim"
    - "An unservable version in a core startup family (SteamClient, SteamUser, SteamFriends, SteamUtils, SteamApps, SteamUserStats) still withholds the shim (Manor Lords shape)"
    - "An unservable version that the shim would answer with NULL (x86, no runtime lookup, or bare accessor) still withholds, whatever its family"
    - "The rule applies identically in the static-import branch and the runtime-loaded branch"
    - "ELEX 411300, Mining Mechs 1603180, Overlooting 3410180, The Age of Decadence 230070 and Grim Dawn 219990 launch through the bridge with the shim placed"
  artifacts:
    - path: "src/backend/storeManagers/steam/bridge/shimCoverage.ts"
      provides: "CORE_STARTUP_FAMILIES and classifyUnservableInterfaceVersions; findUnservableInterfaceVersions unchanged in behaviour"
      contains: "export function classifyUnservableInterfaceVersions"
    - path: "src/backend/storeManagers/steam/bridge/shimGenerate.ts"
      provides: "withhold trigger = delayMissing or blocking; nonCore routed to the placed-miss gap list in both branches"
      contains: "classifyUnservableInterfaceVersions"
  key_links:
    - from: "shimGenerate.ts static branch"
      to: "classifyUnservableInterfaceVersions"
      via: "blocking.length > 0 trigger; nonCore pushed to refreshGaps"
      pattern: "refreshGaps\\.push"
    - from: "shimGenerate.ts runtime-loaded branch"
      to: "classifyUnservableInterfaceVersions"
      via: "per-name classification into blockingAll / nonCoreAll; nonCoreAll appended to combinedMissing"
      pattern: "nonCoreAll"
---

<objective>
Revise the bridge shim withhold rule per the operator's option a (2026-10-26). Today the
quick 261024-j4l guard withholds on any "unservable" version. Later served-map growth
(53-12, 261025-t7i) turned non-core families like SteamController and SteamUGC into
"half-served" families, so null-object answers that ELEX ran on (D-51-13) now count as skew.
That regressed ELEX 411300 (exits after 2 s since 261026-lif) and withheld four more titles.

New rule: withhold only on a delay-imported missing symbol or a BLOCKING interface gap.
A gap is blocking when its family is a core startup family or the shim would answer it with NULL.
Every other unservable gap goes to the existing placed-miss path, so the shim is placed and
the verdict still names the gap.

Purpose: put ELEX, Mining Mechs, Overlooting, The Age of Decadence and Grim Dawn back on the bridge, and keep the Manor Lords protection.
Output: a pure classifier in shimCoverage.ts, wired into both placement branches of shimGenerate.ts, tests, and a live operator check.

Follow 261026-mhg-RESEARCH.md; it is the design of record.
OUT OF SCOPE: a "never withhold DRM-wrapped / steamstub titles" rule. Do not add it; it will be its own todo.
OUT OF SCOPE: dropping `@ambiguous(...)` entries whose candidates are all served. Leave `@ambiguous` / `@unknown-version` handling unchanged; they are never a trigger.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/quick/261026-mhg-revise-bridge-shim-withhold-rule-for-non/261026-mhg-RESEARCH.md
@.planning/quick/261026-lif-restore-missing-gamelib-orig-bridge-orig/261026-lif-BACKFILL.md
@src/backend/storeManagers/steam/bridge/shimCoverage.ts
@src/backend/storeManagers/steam/bridge/shimGenerate.ts

Load Skill("gamelib-conventions") (the `<verify>` prettier rule, the UAT item shape) and Skill("spike-findings-gamelib") (bridge-verified criterion) before starting.
Never read graphify-out/GRAPH_REPORT.md or graph.json; use `graphify query` for orientation.

<interfaces>
From shimCoverage.ts (L575-608, keep its behaviour and signature unchanged):
- `export function findUnservableInterfaceVersions(input: { arch: 'x86' | 'x64'; symbols: string[]; requiredInterfaceVersions: Record<string, string> }): string[]`. Keys of `requiredInterfaceVersions` are families and values are versions. Returns versions in entry order, de-duplicated.
- Inside it, null-object eligibility is `input.arch === 'x64' && SHIM_X64_NULL_OBJECT_FALLBACK && usesRuntimeInterfaceLookup(input.symbols) && !reachedBare`, where `reachedBare = input.symbols.some((s) => BARE_ACCESSOR_FAMILY[s] === family)`.
- Served maps: `SHIM_SERVED_INTERFACE_VERSIONS` (x86), `SHIM64_SERVED_INTERFACE_VERSIONS` (x64); each entry has `.family`.
- The module docblock forbids backend imports. Keep it that way.

From shimGenerate.ts:
- `withholdIfRestorable(input: WithholdInput): PlaceShimResultBase | null` (L709). WithholdInput includes `delayMissing: string[]` and `unservable: string[]`, which are used in the warning text and in the verdict's `missingSymbols`.
- Static branch, L1333-1366: `delayMissing`, `unservable = findUnservableInterfaceVersions(...)`, `refreshGaps`, `placedMissing = [...new Set([...coverage.missingSymbols, ...refreshGaps])]`, plus the WR-11 `targetExists` gate.
- Runtime-loaded branch, L1036-1080: a per-`name` loop pushes into `combinedMissing`, `delayMissingAll` and `unservableAll`. After the loop: `if (delayMissingAll.length > 0 || unservableAll.length > 0) withholdIfRestorable(...)`, then the refresh path appends the gaps to `combinedMissing`.
- Existing tests: shimGenerate.test.ts describe at L1717 ('quick 261024-j4l: withhold guard ...'), ELEX shape at L1866, Manor Lords at L1798, runtime-loaded withhold at L1975. shimCoverage.test.ts `findUnservableInterfaceVersions` tests at L836-930. None of these need editing (research §Tests).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure classifier classifyUnservableInterfaceVersions in shimCoverage.ts</name>
  <files>src/backend/storeManagers/steam/bridge/shimCoverage.ts, src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts</files>
  <behavior>
    - x64, runtime lookup, `SteamFriends: 'SteamFriends016'` (a core family with other versions served) gives blocking ['SteamFriends016'], nonCore [].
    - x64, runtime lookup, `SteamController: 'SteamController003'` and `SteamUGC: 'STEAMUGC_INTERFACE_VERSION008'` (half-served non-core) give blocking [], nonCore with both versions in entry order (ELEX-2026 shape).
    - x64, runtime lookup, RemotePlay003 + Timeline004 + UGC021 (Overlooting shape; use the exact version strings found in 261026-lif-BACKFILL.md and the served maps) gives all three in nonCore.
    - A non-core gap answered NULL (x64 with the symbols reaching the family through its bare accessor from BARE_ACCESSOR_FAMILY, or arch x86) is blocking.
    - Mixed core + non-core input splits correctly, and each output list keeps entry order with no duplicates.
    - Served versions and null-object-eligible versions of an entirely unserved family appear in neither list, matching findUnservableInterfaceVersions.
    - The union of blocking and nonCore always equals the set from findUnservableInterfaceVersions for the same input.
  </behavior>
  <action>Write the tests first, in a new describe block 'quick 261026-mhg: classifyUnservableInterfaceVersions', and confirm they fail. Then implement in shimCoverage.ts, per research §3 and §5.
(1) Factor the null-object eligibility expression out of findUnservableInterfaceVersions into one non-exported helper, e.g. `isNullObjectEligible(arch, symbols, family)`. Use it from both findUnservableInterfaceVersions and the classifier so the two cannot drift. findUnservableInterfaceVersions output must not change; its existing tests at L836-930, L1069-1222 stay green unedited.
(2) Add `export const CORE_STARTUP_FAMILIES: ReadonlySet<string>` = SteamClient, SteamUser, SteamFriends, SteamUtils, SteamApps, SteamUserStats. These are the families the served maps mark `mode: 'wire'`. Use the exact family-key spelling the `required` maps and served-map `.family` use; check one served entry first.
(3) Add `export function classifyUnservableInterfaceVersions(input: same shape as findUnservableInterfaceVersions): { blocking: string[]; nonCore: string[] }`. Call findUnservableInterfaceVersions. Map each returned version back to its family through the `requiredInterfaceVersions` entries (keys are families). Mark an entry blocking when the family is in CORE_STARTUP_FAMILIES OR the entry is not null-object-eligible (NULL-answered). Otherwise it is nonCore. An unknown family counts as non-core.
(4) Add a docblock on the classifier explaining the operator's option-a rule (quick 261026-mhg, 2026-10-26). Amend the findUnservableInterfaceVersions doc comment to say that skew in a non-core family is now placed by the caller, not withheld. Keep the module free of backend imports.</action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts && npx prettier --check src/backend/storeManagers/steam/bridge/shimCoverage.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts</automated>
  </verify>
  <done>The new classifier tests pass, every existing shimCoverage test passes unedited, and the scoped prettier check is clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire the classifier into both placement branches of shimGenerate.ts</name>
  <files>src/backend/storeManagers/steam/bridge/shimGenerate.ts, src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts</files>
  <behavior>
    - ELEX-2026 shape, static branch: served core families plus `SteamController003` and `STEAMUGC_INTERFACE_VERSION008` (x64, runtime lookup), with the game-original dll on disk and a restorable `.gamelib-orig`. Expect status `placed-miss`, the dll on disk is the shim, and verdict `missingSymbols` contains both versions. No "withheld the shim" warning; one placed-despite-non-core log line.
    - Same ELEX-2026 shape where the target is an older GameLib shim with a restorable backup: placed-miss, the shim refreshed, no restore.
    - Overlooting shape on the runtime-loaded branch (steam_api64.dll@runtime-loaded with RemotePlay003 / Timeline004 / UGC021 gaps and a restorable backup): placed-miss, and every non-core gap appears in the verdict's missingSymbols.
    - Mixed core + non-core (SteamFriends016 plus SteamController003), static branch: `withheld`. The withhold warning and verdict name both versions.
    - The Manor Lords shape (L1798) and every existing j4l withhold test (delay misses `SteamAPI_Bogus`, core skew `SteamFriends016`) still pass unedited.
  </behavior>
  <action>Add the new tests first inside (or right after) the existing 'quick 261024-j4l' describe at L1717. Reuse its fixtures and helpers; the L1866 ELEX case and the L1975 runtime-loaded case are the nearest templates. Confirm the new tests fail.
Then edit shimGenerate.ts, per research §5.
Static branch (~L1340): replace `unservable = findUnservableInterfaceVersions(...)` with `const { blocking, nonCore } = classifyUnservableInterfaceVersions(...)`. Trigger the withhold on `delayMissing.length > 0 || blocking.length > 0`. Pass `unservable: [...blocking, ...nonCore]` to withholdIfRestorable, so a withhold or cannot-withhold message still names every gap. Keep the WR-11 targetExists gate as it is. Whenever the guard does not withhold, push delayMissing plus blocking into refreshGaps as today. Always push nonCore into refreshGaps, whether or not the guard tripped. When nonCore is non-empty and the shim is going to be placed, log one logInfo line (LogPrefix.Steam), e.g. "placeShimForGame: appId N placing the shim despite non-core unservable interface versions answered by the x64 null object: <list> (quick 261026-mhg)".
Runtime-loaded branch (~L1043-1080): rename unservableAll into blockingAll and nonCoreAll, filled per `name` from classifyUnservableInterfaceVersions with that name's nameArch and merged symbols. Trigger on `delayMissingAll.length > 0 || blockingAll.length > 0`. Pass `unservable: [...new Set([...blockingAll, ...nonCoreAll])]`. On the refresh path keep appending delay + blocking gaps. After the guard, always append nonCoreAll to combinedMissing (deduplicated), with the same single logInfo line when it is non-empty.
Update the import from './shimCoverage'; drop findUnservableInterfaceVersions from it if it is no longer used. Add a paragraph to the module docblock after the 2026-10-24 j4l amendment, recording the 261026-mhg rule and why (half-served non-core families became skew through served-map growth; the native resolver's runtime answer never changed).
Leave withhold()'s message format alone except for the gap list. No data migration (research §5). Do NOT add any drmWrapper / steamstub special case.</action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam && npx tsc --noEmit -p . && npx prettier --check src/backend/storeManagers/steam/bridge/shimGenerate.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts</automated>
  </verify>
  <done>The new shimGenerate tests pass, all existing steam tests pass (including the Manor Lords and j4l withhold cases, unedited), the typecheck is clean, and the scoped prettier check is clean. `graphify update .` has been run after the code edits.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Live relaunch of the five evidence titles on the rebuilt sidecar</name>
  <what-built>The revised withhold rule: non-core null-object gaps are placed (placed-miss); delay misses, core gaps and NULL-answered gaps still withhold. Claude runs `pnpm build:sidecar` first and confirms the sidecar.js mtime is newer than the Task 2 commit. tauri dev does not rebuild the sidecar.</what-built>
  <how-to-verify>
    1. Claude: run `pnpm build:sidecar` and report the sidecar.js mtime.
    2. Operator: fully stop and restart `pnpm tauri dev` (or the dev launcher in use).
    3. Operator: launch each title in turn and let it run at least 60 s or until it exits: ELEX 411300, Mining Mechs 1603180, Overlooting 3410180, The Age of Decadence 230070, Grim Dawn 219990.
    4. Claude: for each launch, read ~/Library/Logs/GameLib/gamelib.log and record per title:
       (a) placed or withheld: expect no "withheld the shim" line, and a "placing the shim despite non-core ..." line naming the non-core gaps;
       (b) HELLO: present or absent, with timestamp;
       (c) play duration: HELLO to process stop;
       (d) strict bridge-verified result. Verified means HELLO plus a clean game Steam-init log; for non-Unity titles a game-originated bridge call may count (D-53-13); In-Game never counts. 230070 has no game log, so at best it is unverified.
       For Grim Dawn 219990, also confirm the steamstub forwarder line is present and `steamstub-unforwarded:withheld` is absent.
    5. Claude: record the per-title table in 261026-mhg-SUMMARY.md. If any title crashes after placement (for example an sret call into a controller null object, research A2), record it with the log excerpt as a finding. Do not reroute it to bottled Steam.
  </how-to-verify>
  <resume-signal>Type "approved" with any notes, or describe which titles failed</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| game install tree -> placement code | steam_api dll bytes and importer PE tables are game-supplied input to the scan |
| GameLib -> bottle filesystem | the shim copy, the backup and the restore write into the bridge bottle |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-mhg-01 | Denial of service | placed shim answering a non-core interface with the null object | accept | Evidence (ELEX 188 s, AoD about 7 min) shows it is safe at startup. A residual sret crash risk for controller-polling titles is visible in the log, and the placed-miss verdict names the gap (research A2) |
| T-mhg-02 | Tampering | withhold / restore path | mitigate | No change to withholdIfRestorable, probeOriginalBackup, the marker refusal or the isContainedWithin checks. Existing tamper and containment tests (L1955, T-oq7-03) must stay green unedited |
| T-mhg-03 | Denial of service | core-family or NULL-answered gap now placed by mistake | mitigate | The classifier marks core families and every non-null-object-eligible entry as blocking. Pinned by the Manor Lords, mixed and NULL-answered tests |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/steam` green; `npx tsc --noEmit -p .` clean.
- Scoped `npx prettier --check` on the four written files clean.
- No new drmWrapper / steamstub logic: `git diff -U0 -- src/backend/storeManagers/steam/bridge/shimGenerate.ts | grep '^+' | grep -c drmWrapper` returns 0.
- Live: the five titles are placed (not withheld) with HELLO, per Task 3.
</verification>

<success_criteria>
- The withhold triggers only on delay-imported misses or blocking gaps (a core family, or NULL-answered), in both branches.
- Non-core gaps are placed and still named in the persisted placed-miss verdict.
- Manor Lords protection is intact; the existing tests are unedited and green.
- The operator relaunch records per-title placement, HELLO, duration and strict-verified status for 411300, 1603180, 3410180, 230070 and 219990.
</success_criteria>

<output>
Create `.planning/quick/261026-mhg-revise-bridge-shim-withhold-rule-for-non/261026-mhg-SUMMARY.md` when done, including the Task 3 per-title table.
</output>
