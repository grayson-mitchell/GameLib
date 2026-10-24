---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
verified: 2026-10-24T05:10:00Z
status: gaps_found
score: 5/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/7
  gaps_closed:
    - "Withheld Grim Dawn launch (j4l guard preempting the forwarder): closed by 52-13 (x64 serves SteamUser023/SteamNetworking006/RemoteStorage016) and 52-15"
    - "Honest SteamStub notice on the withheld path (drmWrapper stamped on withheld): closed by 52-15/52-16"
    - "CR-01 null-object regression for ordinary x64 GetISteam* lookups: closed by 52-14, live-checked on ELEX (no FWD, no steamstub path)"
    - "Withheld-state honesty (false 'game's own steam_api' log, stale shim): closed for the restorable case by 52-15; residual WR-11"
    - "WR-01/02/03/04: closed by 52-16"
  gaps_remaining:
    - "Done-when: Grim Dawn reaches main menu with a clean Steam-init log (now UAT Gap 5)"
    - "Mac Steam Friends sign-out on ELEX launch (UAT Gap 6, cause unknown)"
    - "WR-09: non-lookup ISteamClient wire methods still forward for every x64 title"
    - "WR-11: withhold with no steam_api file on disk logs a false line"
  regressions: []
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
  - truth: "Launching a non-SteamStub x64 bridge title (ELEX 411300) leaves the user's Mac Steam session (Friends) signed in"
    status: failed
    reason: "UAT item 12 / Gap 6: the operator checked Friends signed in before Play and signed out afterwards. ELEX had no FWD lines and no steamstub path, so phase-52 forwarding code did not run for it. Cause unknown; candidates are GameLib's pre-existing steam-user logOn (user.ts:663) and the helper's SteamAPI_Init against the Mac client. Not attributed to phase 52, but the 'no regression vs baseline' claim cannot be shown, and the baseline never recorded it."
    artifacts:
      - path: "src/backend/storeManagers/steam/user.ts"
        issue: "logOn({refreshToken}) on Play at :663 (pre-existing, outside phase 52 scope); not proven causal."
    missing:
      - "Attribution experiment per UAT Gap 6: repeat with Friends state checked before and after (a) Play with bridge disabled, (b) steam-user logon alone, (c) helper alone, on a non-ELEX title. Do not guess a cause first."
  - truth: "Forwarding SteamClient017/014 does not regress ordinary x64 bridge titles (non-lookup ISteamClient methods)"
    status: partial
    reason: "CR-01 is fixed for the GetISteam* lookups (gated on g_bridge_steamstub_path_active, generated steam_api_shim.c:5432 ff.). Review WR-09: CreateSteamPipe, BReleaseSteamPipe, ConnectToGlobalUser, CreateLocalUser, ReleaseUser, RunFrame, GetIPCCallCount, BShutdownIfAllPipesClosed still bridge_transact to the helper's live native ISteamClient for every x64 title (pre-phase they were local stubs). A title calling ReleaseUser/BReleaseSteamPipe with the shim's 1/1 handles can kill the helper's session. Unobserved so far (ELEX logged no FWD)."
    artifacts:
      - path: "meta/gen_vtables.ts"
        issue: "Only the lookup branch reads the steamstub flag (~1115-1121); wire emitter for SteamClient-family non-lookups ungated."
    missing:
      - "Gate the eight non-lookup SteamClient wire methods (c17 and c14) on g_bridge_steamstub_path_active returning the pre-phase stub value; regenerate; extend the assertGated test to every c17/c14 wire method; widen deferred-items 52-16 #3 revisit condition to any x64 bridge title."
  - truth: "The launch log accurately reflects withheld state when no game steam_api exists (WR-11)"
    status: partial
    reason: "shimGenerate.ts:1433-1449: with a static import and no dll on disk, shimTargets is [] so [].every() is true and withhold() logs 'launching with the game's own steam_api' then launches an exe that fails on a missing DLL. Same false-log class as old UAT Gap 3, now narrowed to the no-file case."
    artifacts:
      - path: "src/backend/storeManagers/steam/bridge/shimGenerate.ts"
        issue: "withholdIfRestorable called when targetExists is false."
    missing:
      - "Take the refresh/placed-miss path when targetExists is false; add the test 'static import, no dll on disk, unservable version -> placed-miss, no own-steam_api warning'."
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
