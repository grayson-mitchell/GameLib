---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
verified: 2026-10-24T05:10:00Z
status: gaps_found
score: 5/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gap_closure_2:
    verified: 2026-10-24T06:40:00Z
    plans: [52-19, 52-20, 52-21, 52-22, 52-23, 52-24]
    gaps_closed:
      - "WR-09: eight non-lookup SteamClient017/014 wire methods gated on g_bridge_steamstub_path_active (52-20)"
      - "WR-11: no-dll single-exe withhold now placed-miss (52-21)"
      - "Gap 6 attributed: outside-phase-52, GameLib steam-user logon (52-19, item 15); not a phase-52 defect"
    gaps_remaining:
      - "Done-when: Grim Dawn reaches main menu with clean Steam-init log (Gap 5). Diagnosed, not fixed; operator chose option-other at item 16; re-gate items 17-19 skipped"
    regressions: []
  gaps_closed_round1:
    - "Withheld Grim Dawn launch (j4l guard preempting the forwarder): closed by 52-13 and 52-15"
    - "Honest SteamStub notice on the withheld path: closed by 52-15/52-16"
    - "CR-01 null-object regression for ordinary x64 GetISteam* lookups: closed by 52-14"
    - "WR-01/02/03/04: closed by 52-16"
gaps:
  - truth: "Done-when: Grim Dawn (219990) launches from GameLib through its per-game bridge bottle, gets past SteamStub (no steam://run), reaches its main menu, and Mac Steam shows it In-Game"
    status: failed
    reason: "Re-gate items 9 and 10 on the packaged build. The product path now does everything planned (no withhold, drmWrapper=steamstub, forwarder placed, HKCU SteamClientDll64 + Universe written, HELLO, FWD CreateInterface SteamClient017/014 native=present, steam://run count 0), but Grim Dawn shows Application Load Error 3 (operator, twice) and the game's Steam init logs 'SteamAPI_IsSteamRunning() did not locate a running instance of Steam' (round-regate.cxlog:23313) after two absent 'pid' reads (:23303, :23311). Main menu never observed. Strict rule: no clean game Steam-init log means not bridge-verified. The helper log shows nothing after the two FWD lines, so the stub rejects before calling any method on the returned interface (WR-10)."
    artifacts:
      - path: "native/steam-bridge/steamclient/steamclient_fwd.c"
        issue: "Exports CreateInterface only (line ~46); the stub looks up Steam_ReleaseThreadLocalMemory (not found, in Grim Dawn.exe per trace, so the need for Steam_* exports is a lead, not proven)."
      - path: "src/backend/storeManagers/steam/bridge/steamClientSetup.ts"
        issue: "No ActiveProcess pid value is written (decision 1). Stub reads pid twice, then logs IsSteamRunning warning. Operator chose option-c on item 13: investigate before any pid writer."
    missing:
      - "Diagnosis plan first: trace with +relay on GetProcAddress, GetModuleFileNameW, OpenProcess, CreateFileW/ReadFile between the second CreateInterface and the MessageBox to learn what the stub checks (pid existence, OpenProcess, process name, Steam_* exports, module path)."
      - "Record a genuine steamclient64.dll export table next to the forwarder's."
      - "Then ONE boundary-reviewed change (pid writer needing its own plan and boundary review, and/or Steam_* flat exports in the forwarder forwarding to the native client). Boundary: no stand-in answers."
      - "Re-run the packaged live gate under the strict rule: HELLO plus clean game Steam-init log, operator-confirmed main menu, In-Game recorded but not counted."
      - "Gap-closure-2 addendum: 52-19 trace shows the stub reads all 186368 forwarder bytes then shows the MessageBox, with no OpenProcess, image-name query or registry read. What it checks in those bytes is uninspected (52-19-DIAGNOSIS.md candidate inputs). Next: /gsd-plan-phase 52 --gaps."
deferred: []
human_verification: []
---

# Phase 52: Bridge-backed steamclient.dll for SteamStub titles Verification Report (re-verification)

**Phase Goal:** Steam games wrapped with SteamStub run through the native Steam bridge in their own per-game bottle; the stub's launch check is answered by the genuine signed-in Mac Steam client, no Windows Steam client in the bottle, exe unmodified. Done-when: Grim Dawn (219990) launches from GameLib, gets past SteamStub (no `steam://run`), reaches main menu, Mac Steam shows In-Game.
**Verified:** 2026-10-24
**Status:** gaps_found
**Re-verification:** Yes, after gap closure plans 52-13..52-18
**Requirements:** none declared; `.planning/REQUIREMENTS.md` does not exist and ROADMAP says `Requirements: TBD`. The P52-SCOPE-* / P52-DONE IDs in plans were accounted for against ROADMAP Scopes 1-5 and done-when, which were used as the contract.

## Observable Truths (re-scored)

| # | Truth | Prior | Now | Evidence |
|---|---|---|---|---|
| 1 | Scope 1: SteamClient017/014 forward to native ISteamClient; GetISteam* forwarded | VERIFIED + CR-01 risk | VERIFIED for the SteamStub path; PARTIAL as to side effects | Re-gate item 9: `FWD CreateInterface SteamClient017/014 native=present` through the product path. Lookups gated (steam_api_shim.c:606 flag, :5432 ff.). WR-09 leaves non-lookup methods ungated for every x64 title. |
| 2 | Scope 2: zig-built steamclient64.dll forwarder resolving via the game's shim | VERIFIED (scratch only) | VERIFIED | Item 9/11: product x64/steamclient64.dll 186368 B == built forwarder (`cmp` identical), loaded by the game (cxlog:23472), HELLO via product flow. |
| 3 | Scope 3: bottle setup writes HKCU ActiveProcess values, places DLLs, never HKLM | FAILED | VERIFIED (product flow) | Item 11 pass: user.reg ActiveProcess has SteamClientDll64 and Universe, 0 pid, system.reg Valve keys 0, no steam.exe, exe sha256 unchanged. Item 9 log: reg add lines at :113/:116. |
| 4 | Scope 4: .bind detection gives an honest notice | FAILED | VERIFIED (static/log) with one open edge | drmWrapper=steamstub logged at :105/:141 on the product path; withheld path now stamped (shimGenerate.ts:704-710, games.ts:2897-2905). Operator saw no notice on the placed path, expected (notice fires only when forwarding is unavailable). Edge: WR-11 false log line when no steam_api file exists. |
| 5 | Scope 5: five modern-SDK SteamInternal_* exports + importer scan gap | VERIFIED (static) | VERIFIED (static) | Exports in steam_api64.def; closure scan in importScan.ts; 52-13 now serves SteamUser023/SteamNetworking006/RemoteStorage016 on x64 (shimCoverage.ts:323-330) and Grim Dawn is no longer withheld (item 9: withhold count 0). Runtime effect on the game unproven. |
| 6 | Done-when: Grim Dawn launches, passes SteamStub, reaches main menu, In-Game | FAILED | FAILED | Items 9, 10: Application Load Error 3, IsSteamRunning warning, no game Steam-init log, main menu not observed. steam://run count is now 0 (progress), but the stub is not satisfied. |
| 7 | Boundary: every answer from the native client, no stand-in, no HKLM, CEG out of scope | VERIFIED (static) | VERIFIED | Forwarded lookups return NULL or proxies, never fabricated; setup is HKCU-only; item 11 hygiene pass; ELEX did not take the steamstub path. |

**Score:** 5/7 (truths 6 fails; truth 1 verified on its stated scope but carries WR-09; counted verified because the ROADMAP statement is satisfied, WR-09 is carried as a gap).

## Prior gaps: closed or not

| Prior gap | Status | Evidence |
|---|---|---|
| 1. Done-when Grim Dawn reaches main menu | NOT CLOSED, changed form | The withhold cause is gone (52-13/52-15); the failure is now a SteamStub rejection after a clean HELLO/FWD (new Gap 5). |
| 2. SteamStub honest notice on withheld | CLOSED | Withheld results stamped; `steamstub-unforwarded:withheld` cause (52-15/52-16). |
| 3. CR-01 x64 null-object regression | CLOSED for lookups; PARTIAL overall | 52-14 gate; ELEX shows no steamstub path. WR-09 open for non-lookups. |
| 4. Withheld log/bottle state honesty | CLOSED for the restorable case; residual WR-11 | 52-15 withholds only when restorable, else refreshes; item 9 shows shim replaced 223744 to 251392 B. |
| 5. WR-01/02/03/04 | CLOSED | steamClientSetup.ts bounded wait:false and `res.code !== 0`; games.ts exe-arch resolution; fresh drmWrapper wins (review table, tests present). WR-05..08 remain deferred hardening, not goal-blocking. |
| New: UAT Gap 5 (Load Error 3 / IsSteamRunning) | OPEN | see gaps |
| New: UAT Gap 6 (ELEX Friends sign-out) | OPEN | see gaps |

## Anti-patterns and debt markers

Debt-marker grep (TBD/FIXME/XXX) over steamClientSetup.ts, steamclient_fwd.c, peSections.ts: none. A full scan of all 38 reviewed files was not run. Review WR-09/WR-11 are the only code-level defects; no critical findings.

## Full-suite failures: attributable to phase 52?

I re-ran findDeadcode and testContainment (both fail as reported). None is attributable to phase 52:
- `testContainment`: unclassified `steamNativeInstallDefault.test.ts`, added by quick 261024-exo (not a phase 52 file).
- `findDeadcode`: new findings are `bridge/__tests__/fixtures/delayImportPe.ts` (DelayImportDll, DelayImportPeOptions), introduced by quick-261024-j4l (`git log`: e40acf7c7/ce577e1df), and `crossoverInstallRisk.ts` (not phase 52). Confirmed: delayImportPe.ts is j4l, not phase 52.
- `machineFillGamelib` plural order and `genI18nGateScope` stale `i18nForkTouchedFiles.json` (names resolveBootLanguage.ts, SteamBridgeRouteNotice.tsx): listed in deferred-items as pre-existing at the pre-phase base; I did not re-run those two suites and did not find a phase-52 file among the ones named. Caveat: phase 52 added 49 catalog edits, so a `genI18nGateScope` drift is theoretically touchable; the named stale entries are not phase 52 files. Treated as not phase 52, medium confidence for that one.
They still leave the repo suite red and should be fixed by their owners; they do not change this phase's status.

## Human verification

None added. The remaining failures are operator-established from the live gate. The re-gate after closing Gap 5 is itself operator-driven (main menu, clean game log).

## Gaps Summary

The mechanism is now fully wired in the product flow and no longer short-circuited: Grim Dawn is not withheld, the forwarder and HKCU values are written by GameLib, the helper answers HELLO and forwards SteamClient017/014 to the genuine client, hygiene holds and `steam://run` is gone. The goal is still not achieved: the SteamStub check rejects (Application Load Error 3) before using anything it was handed, and the strict Steam-init log is not clean. The open question is what the stub requires beyond `CreateInterface` (the unwritten `pid`, the missing `Steam_*` exports, or module identity). That needs trace-first diagnosis, then one boundary-reviewed change. Two further items need plans: the unattributed ELEX Friends sign-out, and WR-09 which widens a regression risk to every x64 title. WR-11 is a small honest-logging fix.

Suggested order for `/gsd-plan-phase 52 --gaps`: (1) diagnosis plan for Gap 5 and the ELEX attribution experiment (both read-only investigation, can share a live session), (2) WR-09 gating plus WR-11 (code, parallel with 1), (3) the boundary-reviewed fix chosen by (1), (4) strict packaged re-gate.

---

_Verified: 2026-10-24_
_Verifier: Claude (gsd-verifier)_

---

# Re-verification 2: gap closure plans 52-19..52-24

**Verified:** 2026-10-24T06:40:00Z
**Status:** gaps_found (unchanged; done-when still unmet)
**Score:** 5/7 (unchanged). The two gap-round code fixes closed review items, not a must-have truth. The sole failing truth is the done-when.
**Requirements:** ROADMAP lists none (`Requirements: TBD`) and `.planning/REQUIREMENTS.md` does not exist. Plan IDs P52-DONE and P52-SCOPE-2/3/4 were accounted against ROADMAP Scope 1-5 and done-when. P52-DONE is not satisfied. Scope 2/3/4 evidence is unchanged from the table above.

## Truth re-scoring

| # | Truth | Prior | Now | Evidence (checked in code, not from SUMMARY) |
|---|---|---|---|---|
| 1 | Scope 1: SteamClient017/014 forward, no regression to ordinary x64 titles | VERIFIED, WR-09 open | VERIFIED | `steam_api_shim.c` diff `9f503cbcc..HEAD` adds 16 `if (!g_bridge_steamstub_path_active) { return <pre-phase value>; }` guards (c17 and c14, 8 methods each). Generated file matches generator per re-review; `gen_vtables` and `shimGenerate` suites re-run by me: 236 pass. |
| 2 | Scope 2: forwarder | VERIFIED | VERIFIED (no change) | 52-23 recorded forwarder 186368 B, exports CreateInterface only. |
| 3 | Scope 3: HKCU setup | VERIFIED | VERIFIED (no change) | Not re-exercised; item 19 skipped. |
| 4 | Scope 4: honest notice | VERIFIED + WR-11 edge | VERIFIED | `shimGenerate.ts:1438-1451` calls `withholdIfRestorable` only when `targetExists`; both RED/GREEN tests present and passing. |
| 5 | Scope 5: modern SDK exports | VERIFIED (static) | VERIFIED (static) | No change. |
| 6 | Done-when: Grim Dawn main menu, In-Game | FAILED | **FAILED** | Items 17-19 skipped, no Grim Dawn launch in gap round 2. Last observed state (items 9, 10): Application Load Error 3, IsSteamRunning warning. Operator still reports the SteamStub check failing. Item 16 chose option-other: no code change. Gap 5 is diagnosed (52-19-DIAGNOSIS.md, item 14) but not fixed. |
| 7 | Boundary | VERIFIED | VERIFIED | The gap-round diff touches only gen_vtables.ts, its test, steam_api_shim.c, shimGenerate.ts and its test. No fabricated answers, no HKLM, no exe change. WR-09 off-path values equal the pre-phase stubs (re-review, `7ed535984`). |

## Gap status

| Gap | Status | Evidence |
|---|---|---|
| Gap 5 (Grim Dawn SteamStub rejection) | **OPEN, BLOCKER** | Decision item 16 option-other, "not implemented by decision". 52-UAT frontmatter `diagnosed`. Items 17, 18, 19 `skipped`. deferred-items entry 7. |
| Gap 6 (Friends sign-out) | **Attributed, outside phase 52** | Item 15: arm b (steam-user logon alone, no Play) flipped signed out twice; arm c (helper alone) and arm d (bridge Play after restore) held. Mac Steam logs show no displacement. Pending todo `2026-10-24-friends-sign-out-steam-user-logon.md` exists. Caveat: arm a (bridge disabled) not run, so "no regression vs baseline" is shown by arm d plus the logon-alone repro, not by a bridge-off control. Not blocking phase 52. |
| WR-09 | CLOSED | See truth 1. |
| WR-11 | CLOSED | See truth 4. IN-10 (dangling symlink now reaches copyFileSync) is Info, folded into WR-06. |
| Item 20 (ELEX no-regression) | PASS, not bridge-verified | HELLO, FWD 0, `[bridge-steamstub]` 0, loading screen baseline. Per the strict rule it is unverified: no game Steam-init log; In-Game not counted. |

## Open review findings (re-review at `6ddaf7f92`)

Critical: none. Warning: WR-10 (open). Info: IN-05..IN-10. No TBD/FIXME/XXX in the added lines of the gap-round diff (grepped).

## Full-suite failures: attribution (checked myself)

Re-ran: 6 failing tests in 4 suites in my run (findDeadcode, genI18nGateScope, machineFillGamelib, testContainment). dxvkInstallRemove passed in isolation, so it is order- or load-dependent flake, not a gap-round regression. The gap round (`9f503cbcc..HEAD`) changed five non-planning files, none of which is a failing suite or the subject of its assertion:
- findDeadcode: flags `bridge/__tests__/fixtures/delayImportPe.ts` (DelayImportDll, DelayImportPeOptions) and `crossoverInstallRisk.ts`. Neither file is in the gap-round diff (j4l / other quick).
- genI18nGateScope: `i18nForkTouchedFiles.json` vs live git derivation. Not in the gap-round diff, no locale files changed.
- machineFillGamelib: plural-category order (ar, ru). Unrelated to the diff.
- testContainment: unclassified test file in the sidecar directory from a different quick. Unrelated.
Attribution to phase 52 gap round 2: none. They remain a red repo suite owned elsewhere.

## Human verification

None added. The Grim Dawn re-gate is operator-driven and blocked behind a code change that does not exist yet.

## Gaps Summary

Gap closure 2 delivered what was cheap and certain: WR-09 and WR-11 are fixed in code and tests, Gap 6 is attributed outside the phase, and the Gap 5 trace narrowed the question to what the stub inspects in the forwarder bytes. It did not deliver the phase goal. Grim Dawn still fails SteamStub with Application Load Error 3 and never reached its main menu, so the single done-when item is FAILED and the phase must not be marked complete. Next step recorded by the operator: `/gsd-plan-phase 52 --gaps`, starting with static inspection of what the stub checks in the forwarder bytes (compare against the genuine 41-export steamclient64.dll), then one boundary-reviewed change, then the strict packaged re-gate.

_Re-verified: 2026-10-24 (gap closure 2)_
_Verifier: Claude (gsd-verifier)_
