---
slug: steam-depotfromapp-content-depot
status: resolved
trigger: "D-UAT-14: depot selection skips cross-app (depotfromapp) content depots, so after adoption Steam downloads them as an update."
created: 2026-10-29
updated: 2026-10-29
source_todo: .planning/todos/completed/2026-10-29-steam-depotfromapp-content-depot-skipped.md
related_uat: .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md (section "Windows hardware pass (2026-10-29)", D-UAT-14)
related_debug: .planning/debug/cross-depot-collision-1026.md (depot-plan correctness, different defect)
---

# Debug: cross-app content depot missing from GameLib's depot plan

## Symptoms

Prefilled from the operator's 2026-10-29 Windows UAT run; the operator was not re-asked.

- **Expected:** GameLib's depot plan for a title includes every depot the Steam client would install into
  the game's own directory, so that after Steam adopts the `StateFlags 4` manifest it has nothing left
  to download.
- **Actual:** Total War: PHARAOH DYNASTIES (2951630). GameLib planned 3 depots (10:05:04 log:
  `selectAllDepots union across base + DLC apps -> 3 depot(s)` — 2951631 133,797,137 B; 2951632
  80,948,012,865 B; 2951633 2 B; six non-English language depots skipped). After a Steam restart, Steam
  showed the game installed with an **update queued**, fetching 57,465,616 B / staging 204,350,459 B.
  The post-update `appmanifest_2951630.acf` `InstalledDepots` gained a fourth entry, `372531`
  (manifest 1128077100884847891, size 204,350,459), which is **not** in `SharedDepots`
  (`SharedDepots` holds 228988 and 228990 → 228980, the Steamworks redists). buildid 25370504 =
  TargetBuildID; GameLib's three depot gids were unchanged (no full re-download).
- **Error messages:** none.
- **Reproduction:** install 2951630 via GameLib native depot download on Windows; restart Steam; inspect
  `C:\Program Files (x86)\Steam\steamapps\appmanifest_2951630.acf`.
- **Log:** `C:\Users\grays\AppData\Local\GameLib\logs\gamelib.log` (2026-10-29). No line mentions 372531.

## Hypothesis to test (code-localized, unconfirmed)

`src/backend/storeManagers/steam/depot/select.ts:188`
`if (d?.depotfromapp || d?.sharedinstall) continue` drops every `depotfromapp` depot as a "shared
redistributable" (comment at :150). Steam only routes `sharedinstall` depots to `SharedDepots`; a
`depotfromapp` depot without `sharedinstall` is installed into the game directory and recorded in
`InstalledDepots`, and must be downloaded (manifest + decryption key resolved against the owner app).
Confirm by reading 2951630's PICS appinfo depot 372531 entry (anonymous `getProductInfo` is fine) and
its owner app, before changing code. Also check `depot.ts:1102` (shared-depot handling) and how the
written manifest's `InstalledDepots`/`SharedDepots` are built.

## Constraints

- Do not regress shared-redist handling (`sharedinstall` → `SharedDepots`, never downloaded into the game).
- Spawning child processes from `src/`/`meta/` must use `createFakeHomeProfile()` (gamelib-conventions).

## Current Focus

status_note: RESOLVED 2026-10-29. Selection half confirmed against real PICS data; key/manifest-resolution half confirmed by the operator's live plan-build gate (WARHAMMER III). Fix committed in 1bceff9a8.
hypothesis: select.ts:188 `d?.depotfromapp || d?.sharedinstall` drops depot 372531 (depotfromapp=372530, own public manifest, NO sharedinstall). Ownership gate (:185) passes for it, so :188 is the line that drops it.
bug_class: Bohrbug (deterministic, pure function of PICS data + owned sets)
test: unit test of selectDepots over the real 2951630 entry shape (372531 present => selected; 228988/228990 sharedinstall => still skipped)
next_action: none - session closed. Fix committed (1bceff9a8), session archived, source todo moved to completed/, knowledge-base entry appended.
baseline: 10 targeted steam suites BEFORE edits = 8 pass / 2 fail (depotLinktarget, depot.test.ts); 15 failing tests, all POSIX exec-bit / Mach-O / symlink cases (Windows-local, unrelated). Names saved in scratchpad baseline-failing.txt.
red_phase: new block "cross-app depots (D-UAT-14)" in depotPrimitives.test.ts = 18 tests; against UNFIXED select.ts exactly 6 fail (372531 selected; descriptor gid/size/ownerAppId; selectAllDepots; two table rows; skip-log) and 12 guard tests pass.

reasoning_checkpoint:
  hypothesis: "select.ts:188 `d?.depotfromapp || d?.sharedinstall` silently drops depot 372531 because it treats `depotfromapp` as the shared-redistributable marker; Steam's real marker is `sharedinstall` (redists are mounted from a PARENT app as a dependency and recorded in SharedDepots), so a depotfromapp depot that carries its own manifests and no sharedinstall is ordinary content that Steam mounts into the base app (InstalledDepots) and GameLib never fetches, leaving Steam to download it as an update after adoption."
  confirming_evidence:
    - "PICS 2951630 depot 372531 = depotfromapp 372530, own public manifest gid 1128077100884847891 / size 204350459, NO sharedinstall; matches the post-update ACF InstalledDepots entry exactly; 228988/228990 carry sharedinstall=1 and no manifests and are the ones in SharedDepots."
    - "SizeOnDisk 81286160463 == sum of the four InstalledDepots sizes including 372531."
    - "Steam content_log: redists = 'Dependency added: parent 228980, child 2951630'; 372531 = 'AppID 2951630 config changed : added depots 372531' ... 'finished update, 4 mounted depots'; zero mentions of app 372530."
    - "Operator's packageinfo cache: pkg 0 and pkg 537170 list depot 372531 => owned.depots has it => ownership gate :185 passes => :188 is the dropper (ownership gate eliminated)."
    - "All 35 depotfromapp depots in the four real PICS fixtures have sharedinstall and no manifests => removing `depotfromapp ||` changes no outcome for them."
  falsification_test: "If, after the fix, selectDepots over the real 2951630 entry still omitted 372531, or if any real-fixture sharedinstall depot became selected, the hypothesis/fix would be wrong. Live: if the authenticated plan build for 2951630 fails with AccessDenied/FileNotFound on 372531 under app 2951630, the key-resolution assumption (below) is wrong."
  fix_rationale: "Remove only the `depotfromapp` disjunct. `sharedinstall` still routes redists to SharedDepots; the existing `!gid` gate still drops manifest-less stubs; descriptor.ownerAppId (enumerating app) is unchanged so key/manifest requests go out under 2951630, consistent with how the real client runs this depot. Deletion is justified by the RCA: the removed predicate was the wrong discriminator, not a guard against a real hazard."
  blind_spots: "Wire-level app_id of the real client's depot-key request is inferred (content_log shows the base-app context, not the CM message). Authenticated getDepotDecryptionKey(2951630, 372531) / getRawManifest not exercised: needs the operator's session -> live gate. A depotfromapp depot with manifests that Steam nonetheless routes to SharedDepots has not been seen (none in 35 real samples); sharedinstall '0' (truthy string) not observed in the wild and left alone."
  candidate_causes:
    - "code: select.ts:188 wrong discriminator (confirmed)"
    - "data/ownership: owned.depots missing 372531 so :185 drops it (eliminated: pkg 0 + pkg 537170 list it)"
    - "environment: key/manifest refusal making the depot vanish from the plan (eliminated: GameLib never requested it; no log line; select drops it before any CM call)"
  and_gate: "no - one condition (the wrong predicate) is sufficient and necessary: with :188 corrected the descriptor flows through the unchanged plan/manifest code; no second contributing cause found. The key-resolution risk is a separate, unverified downstream assumption, not a co-cause of the observed symptom."

## Evidence

- timestamp: 2026-10-29
  checked: Steam appmanifest_2951630.acf (read-only) vs sum of sizes
  found: 133,797,137 + 80,948,012,865 + 2 + 204,350,459 = 81,286,160,463 == SizeOnDisk exactly. 372531 is in InstalledDepots, NOT in SharedDepots (228988, 228990 -> 228980 are).
  implication: 372531 is genuine game-directory content that Steam counts in the install; not a redist.
- timestamp: 2026-10-29
  checked: anonymous PICS getProductInfo(2951630) (scratchpad probe, fake HOME, dataDirectory null)
  found: depot 372531 = {"config":{"oslist":"windows"},"manifests":{"public":{"gid":"1128077100884847891","size":"204350459","download":"57465616"}},"depotfromapp":"372530"}. NO sharedinstall key. gid/size/download match the ACF entry and the update's "fetching 57,465,616 B / staging 204,350,459 B" exactly. By contrast 228988/228990 = {"config":{"oslist":"windows"},"depotfromapp":"228980","sharedinstall":"1"} with NO manifests.
  implication: discriminator between shared redist and cross-app content is `sharedinstall` (and the presence of own `manifests`), not `depotfromapp`. Confirms the hypothesis on the data side.
- timestamp: 2026-10-29
  checked: select.ts selectDepots control flow
  found: gates in order: numeric id -> ownership (:185, silent continue) -> depotfromapp||sharedinstall (:188, silent continue) -> manifests[branch] gid (:192, silent continue). None of the three log, which is why the GameLib log never mentions 372531.
  implication: absence from the log is consistent with a silent drop at :185 OR :188; needed the ownership data to tell which.
- timestamp: 2026-10-29
  checked: Steam appcache/packageinfo.vdf (read-only parse; only depot 372531 / app 2951630 membership extracted)
  found: pkg 874096 (PHARAOH DYNASTIES purchase; appids 1937780,1937790,2951630,2951670) does NOT list depot 372531. pkg 0 (Steam, owned by every account) lists 372531 in depotids (and 228988/228990). pkg 537170 (appids 1142710,1880380,3858050 = another Total War license the operator holds) lists 372531 and 372533. No owned package lists APP 372530.
  implication: owned.depots.has(372531) is true for this operator (via pkg 0 and 537170) so :185 passes and :188 is the dropper. Also: ownership of a cross-app depot is by DEPOT id, so an "own the depotfromapp app" gate would be WRONG (operator owns no package containing app 372530).
- timestamp: 2026-10-29
  checked: anonymous PICS getProductInfo(372530) (owner app)
  found: {"appid":"372530","public_only":"1"}, missingToken=true. Hidden app: depots/manifests not readable anonymously.
  implication: we cannot enumerate the owner app's own depot list anonymously; and GameLib should not need to - the base app's own PICS entry already carries the manifest gid for 372531.
- timestamp: 2026-10-29
  checked: anonymous getDepotDecryptionKey probes (no key bytes printed)
  found: (372530,372531)=AccessDenied, (2951630,372531)=AccessDenied, (2951630,2951631)=AccessDenied; control (228980,228988)=OK, (2951630,228988)=AccessDenied.
  implication: 372531 is not free-to-download (unlike 228980), so both appIds are refused anonymously and the anonymous probe CANNOT discriminate which appId a licensed account must use. Needs an authenticated session.
- timestamp: 2026-10-29
  checked: depot.ts fetchDepotPlanEntry / buildDepotPlanLeased / CdnAuthTokenCache wiring
  found: key + manifest are requested with descriptor.ownerAppId = the app whose PICS entry enumerated the depot (selectDepots stamps it) => for 372531 that is the BASE app 2951630. CDN auth cache is built once per run from the plan's base appId (depot.ts:4316, :4480). The installed-depots block is built straight from plan depots (depot.ts:3944), and SharedDepots is never written by GameLib.
  implication: no new plumbing is needed for the plan/manifest half; 372531 would land in InstalledDepots exactly as Steam writes it.
- timestamp: 2026-10-29
  checked: recollection of SteamRE/DepotDownloader GetSteam3DepotManifest (web search could not retrieve source) - UNVERIFIED
  found: reference tool treats a depotfromapp depot that carries its own `manifests` as a normal depot of the requesting app and only follows depotfromapp to the parent app when `manifests` is absent.
  implication: supports requesting key/manifest under the base app for 372531; not verified against source, so the live gate below remains required.

- timestamp: 2026-10-29
  checked: Steam logs/content_log.txt 11:15-11:20 (read-only), the real client's own update of 2951630
  found: (a) redists are modelled as a DEPENDENCY on a separate parent app: "Dependency added: parent 228980, child 2951630, depot 228988" (+228990) and "AppID 228980 finished update, 15 mounted depots". (b) 372531 is NOT a dependency: "AppID 2951630 config changed : added depots 372531", "Downloading 310 chunks for depot 372531 (1128077100884847891)", "AppID 2951630 finished update, 4 mounted depots (BuildID 25370504) : 2951631,2951632,2951633,372531", committed into common\Total War PHARAOH DYNASTIES. grep for 372530 over the whole log: ZERO hits.
  implication: the real client handles 372531 entirely in the base app's (2951630) context and never involves app 372530. So GameLib's existing descriptor.ownerAppId (= enumerating app = 2951630) is the consistent app for key/manifest; no owner-app plumbing needed. Residual risk: the wire-level app_id of Steam's key request is inferred, not observed -> keep the live plan-build gate.
- timestamp: 2026-10-29
  checked: real PICS captures in src/backend/storeManagers/steam/__tests__/fixtures (appinfo-64bit, -32bit, -false-flag, -no-osarch)
  found: all 35 depotfromapp depots in them carry sharedinstall (1 or 2) and NO manifests. 372531 is the opposite on both (manifests present, sharedinstall absent).
  implication: `sharedinstall` is a clean discriminator on every real sample; the existing `!gid` gate (:192) independently drops manifest-less shared stubs. Dropping `depotfromapp ||` changes no outcome for these four real titles.

## Eliminated

- hypothesis: ownership gate (select.ts:185) is what drops 372531
  evidence: pkg 0 and pkg 537170 in the operator's packageinfo cache both list depot 372531, so owned.depots has it; :188 is the dropper.
  timestamp: 2026-10-29
- hypothesis: fix should require owning the depotfromapp APP (372530)
  evidence: no owned package lists app 372530 (hidden public_only app); ownership is by depot id.
  timestamp: 2026-10-29

## Resolution

root_cause: "select.ts:188 `if (d?.depotfromapp || d?.sharedinstall) continue` used `depotfromapp` as a shared-redistributable marker. It is not: `sharedinstall` is (Steam mounts those from a separate PARENT app as a dependency and records them in SharedDepots). A `depotfromapp` depot with its own manifests and no `sharedinstall` (PHARAOH DYNASTIES depot 372531 <- app 372530) is ordinary game content that Steam mounts into the base app's directory and records in InstalledDepots. selectDepots dropped it silently (no log), so GameLib never fetched it and Steam downloaded it as an update (57,465,616 B / 204,350,459 B staged) after adopting the StateFlags 4 manifest. Ownership gate (:185) is NOT a cause: pkg 0 and pkg 537170 grant depot 372531."
fix: "select.ts: skip only on `sharedinstall` (dropped the `depotfromapp ||` disjunct), log the sharedinstall skip (ids/flags only), rewrite the stale comments. No change to depot.ts: descriptor.ownerAppId (the enumerating app, 2951630) is unchanged, so key/manifest go out under 2951630 as the real client runs the depot; InstalledDepots is built straight from plan depots so 372531 lands in the written ACF exactly as Steam writes it; SharedDepots is never written by GameLib."
oracle_type: "specified + derived: Steam's own post-update appmanifest_2951630.acf (InstalledDepots includes 372531 with the same gid/size; SharedDepots = 228988/228990) and the real PICS entry; plus 4 real PICS fixtures as a no-regression oracle for the sharedinstall path."
files_changed:
  - src/backend/storeManagers/steam/depot/select.ts
  - src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts
verification:
  target_test: { result: pass, detail: "18/18 new tests in 'cross-app depots (D-UAT-14)' pass; 6 of them fail on the unfixed code (red phase), the other 12 are boundary/regression guards" }
  mutation_check: { result: skipped, reason_if_skipped: "Stryker not configured in this repo; replaced by 4 hand mutants at the fix site", mutant_killed: "M2 delete sharedinstall skip -> killed (4 fail); M3 skip only if sharedinstall&&depotfromapp -> killed (1 fail); M5 ownerAppId := depotfromapp app -> killed (1 fail); M4 sharedinstall||(depotfromapp&&!manifests) -> SURVIVED, equivalent mutant (a manifest-less depot is already dropped by the !gid gate, selection output identical)" }
  no_op_deletion: { result: flagged-and-justified, deletion_justified_by_rca: true, note: "net diff removes the `depotfromapp ||` disjunct; justified: that predicate was the wrong discriminator (RCA above), and the fix ADDS selection behaviour (372531 now flows through) plus a skip log, so it is not a symptom-suppressing deletion" }
  adjacent_tests: { result: pass, suites_run: [depotPrimitives, depot.sharedRedist, depot, depot.finalize, depot.prescreen, depot.selectedFiles, pathCollisions, manifest, depotLinktarget, reconcile], note: "pre-change baseline 8 pass/2 fail, 15 failing tests (432 passed); after 8 pass/2 fail, SAME 15 failing tests by name (diffed), 450 passed (+18). The 15 are POSIX exec-bit / Mach-O / symlink cases that fail on this Windows box independent of the change." }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, note: "HEAD select.ts swapped in via git show -> exactly the 6 predicted failures; fixed version restored -> 18/18; byte-compared after." }
  static: "prettier --check clean on both src paths (HEAD was clean; --write touched one of my own lines); tsc --noEmit: no errors in changed files (one pre-existing error in the parallel session's untracked steamClientProcess.test.ts); eslint --no-cache: 0 errors, 1 pre-existing warning at depotPrimitives.test.ts:2003"
  guardrail_verdict: accepted
  live_gate: "PASS (2026-10-29 12:04-12:05, operator-run, fresh `pnpm tauri:dev` build/main/sidecar.js 12:03 with the old `d?.depotfromapp || d?.sharedinstall` line absent). Native install of Total War: WARHAMMER III (1142710), cancelled after plan build. gamelib.log (re-read by the session manager): `skipped depot 228988/228986/228990/228983 (sharedinstall=1, depotfromapp=228980 ...)`; `os=windows arch=64 language=english branch=public -> depots [372531(gid=1128077100884847891,size=204350459), 372533(gid=5678300758159441741,size=5567075), 1142711, 1142712, 1142713]`; `selectAllDepots union across base + DLC apps -> 5 depot(s)` (3 before the fix on the old 09:44 bundle); `buildDepotPlan/fetchDepotPlanEntry:372531: attempt 1 succeeded in 1099ms`, `:372533 ... 758ms`; `buildDepotPlan: total 5727ms for appId 1142710 (5 depot(s))`. No `couldn't get decryption key|manifest` line anywhere in the log. This closes the one open link: the authenticated CM issues key + manifest for a depotfromapp depot under the enumerating (base) app, so no owner-app (372530) plumbing is needed."
  not_exercised: "Optional step 5 (complete a real install, restart Steam, confirm no update is queued and InstalledDepots matches Steam's own entries) was NOT run. The gate proves selection + key + manifest; it does not prove Steam adopts the written manifest without queuing an update. Test title was WARHAMMER III, not PHARAOH DYNASTIES (2951630) itself, though both share the 372531 cross-app depot."
  commit: "1bceff9a8 fix(steam): plan depotfromapp content depots that carry their own manifest (D-UAT-14)"
