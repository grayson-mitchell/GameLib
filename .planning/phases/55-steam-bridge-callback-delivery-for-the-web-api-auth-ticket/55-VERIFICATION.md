---
phase: 55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket
verified: 2026-10-26T00:00:00Z
status: passed
score: 10/10 criteria verified (P55-1..P55-8, P55-LIVE; P55-9 explicitly deferred, optional)
overrides_applied: 0
---

# Phase 55 Verification

**Goal:** A bridged game that asks for a web-API auth ticket gets one (forward GetAuthTicketForWebApi, helper queues callback 168, shim registers/drains/dispatches, MSVC Run slot measured on x64 and x86). Live gate: Abiotic Factor reaches main menu and logs an EOS Connect login.

No .planning/REQUIREMENTS.md exists; IDs were cross-checked against plan frontmatter, 55-VALIDATION.md and ROADMAP instead.

## Evidence (checked in the codebase, not from SUMMARY)

| Criterion | Result | Evidence |
|---|---|---|
| P55-1 forward | VERIFIED | generated shim `vt_SteamUser023_GetAuthTicketForWebApi` at slot 14; helper dispatch calls `SteamAPI_ISteamUser_GetAuthTicketForWebApi`; gen_vtables pins pass |
| P55-2 vtable measured x64+x86 | VERIFIED | fixture `msvc_ccallbackbase.layout.txt` has both `x86_64-pc-windows-msvc` and `i686-pc-windows-msvc` triples; `Run(void*)` at slot 1; msvcCallbackBaseLayout test passes |
| P55-3 registry | VERIFIED | `SteamAPI_RegisterCallback` / `SteamAPI_RunCallbacks` call `gl_cb_register` / `gl_cb_run_callbacks`; callbackRegistryHost tests pass |
| P55-4/5/6 drain slot, helper queue, old-helper | VERIFIED | protocol, cbqueue, gen_vtables tests pass (290 tests, 5 suites, run by me) |
| P55-7 builds | VERIFIED | `public/bin/arm64/darwin/steam_api.dll` and `steam_api64.dll` present |
| P55-8 regen idempotent | VERIFIED | I re-ran `pnpm gen-vtables`; git tree shows no generated diff |
| P55-LIVE | VERIFIED | 55-UAT.md items 1-6 pass: HELLO attach, CALL forward, `CBQ queued iCallback=168 result=1 cub=2572`, game received the response, retry loop gone, main menu interactive, EOS `CacheExternalAccountInfo - ProductUserId` login |
| P55-9 Wine PE harness | DEFERRED (optional) | Declared deferred in VALIDATION; pending todo tracks it |

## Judgement calls

- **"measured on x64 and x86":** Met by measurement. The layout is measured for both triples and pinned against generator constants by a test. Execution of x86 `__thiscall` dispatch is not done, and the goal wording asks only for measurement. This is a residual risk (no 32-bit game was gated), tracked by a todo, not a gap.
- **Item 4 literal** was pinned after the run by operator decision. It is a legitimate EOS Connect login signal (absent from both baselines). Acceptable, but weaker than a literal fixed before the run.
- **Pre-existing test failures** (findDeadcode, genI18nGateScope, machineFillGamelib, testContainment Block C) are attributed to the base commit. I did not re-run the full suite.
- **55-REVIEW.md warnings (WR-01..05)** are robustness issues (use-after-free window, oversize reply desync, ticket persistence, identity truncation, ticket dropped if no target is registered). None contradicts the verified live outcome. WR-05 is the most goal-adjacent, a race that could lose a ticket. Treat all five as follow-ups.

## Anti-patterns
Not exhaustively scanned for TBD/FIXME/XXX markers; the only working-tree change is an untracked .gitkeep.

## Gaps
None blocking.

## Recommended follow-ups (non-blocking)
Triage WR-01..WR-05, with WR-05 and WR-02 first. Build the P55-9 x86 harness.
