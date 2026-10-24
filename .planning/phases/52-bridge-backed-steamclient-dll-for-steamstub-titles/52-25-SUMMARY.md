---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 25
subsystem: steam-bridge
tags: [gap-closure, diagnosis, steamstub, pe-comparison, relay-trace]
requires: [52-19]
provides:
  - "52-25-DIAGNOSIS.md: static G/F/E comparison, re-measured export tables, public-claim rows, diag3 trace window and answers R1-R6, check classification A-D"
  - "52-UAT item 21 pass"
affects: [52-UAT.md, 52-26 decision]
key-files:
  created:
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-25-DIAGNOSIS.md
  modified:
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-UAT.md
requirements-completed: [P52-DONE, P52-SCOPE-2]
completed: 2026-10-24
---

# Phase 52 Plan 25: Gap 5 diagnosis 3 Summary

The stub's check on the forwarder is a whole-file read by the same routine that reads Grim Dawn.exe, with no OS signature, certificate, hash or mapping API behind it, so the check is not observable by relay and the classification names no direct evidence for any class; no fix chosen.

Session dir: `/tmp/gamelib-gate-52e-20261024T065250Z` (raw cxlog, terminal.log, scripts; not in the repo).

## Results

- R1 (MessageBox text): observed at cxlog:6654, `MessageBoxA(text="Application load error 3:0000065432", caption="Steam Error", 0x10)`.
- Static comparison: genuine DLL is 26547864 B, Valve Corp. Authenticode (11416 B, DigiCert chain), CheckSum 0x0195cf93 equal to recomputed, resource directory with Valve version strings (11.15.70.27), 41 exports, 21 imports. Forwarder is 186368 B, CheckSum 0, no signature, no resources, 1 export, 5 imports, `.buildid`/`.tls` sections. Grim Dawn.exe has CheckSum 0, no signature, a resource directory (Crate strings), no Rich header, and was read whole without rejection.
- Export tables: genuine 41, forwarder 1, dylib 33; identical to the 52-19 table.
- diag3 (523 relay Call lines, one round, clone state cmp-asserted, product bottle unchanged): no WinVerifyTrust, crypt32, imagehlp, bcrypt or file-mapping call in the game process. The five advapi32 Crypt calls belong to CrossOver's launcher licence check in process 00e0 (cxlog:2651-2743). Forwarder read is one `GetFileSize` plus one whole-file `ReadFile` (0x2d800), via the same return addresses as the exe read (R5).
- Classification (all strength-qualified): A signature, none (direct only that no OS trust API ran); B content hash, indirect; C structural PE property, indirect (differences measured, testing not shown); D not observable by relay, direct. Boundary column: A needs the genuine file (no), B needs the genuine file (no), C unknown pending a boundary ruling on version strings that claim Valve identity.
- Public sources (6 fetched): nothing documents the check or the meaning of the digit in the error text.

## Deviations from Plan

None - plan executed as written. Notes: the recompute script was written once as `pecmp.py` and copied to `pecksum.py`; the `.bind` section name appears in terminal.log only as a section-name listing from the parser (no read or decode of its content).

## Verification

`pnpm planning-gates` 12/12; `git status -- native src meta public` empty; no SteamID64 in repo files; no helper or gamelib-shell running at the end; genuine DLL never copied (`find /tmp/gamelib-gate-52e-* -size 26547864c` empty).

## Self-Check: PASSED
