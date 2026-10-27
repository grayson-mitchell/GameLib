---
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
verified: 2026-10-28T12:00:00Z
status: passed
score: 6/6 roadmap success criteria verified
overrides_applied: 0
---

# Phase 54: No authenticated Steam logon at launch, browse or Play: Verification Report

**Phase Goal:** Launch, browse, game page and Play never open an authenticated steam-user CM session; public PICS reads move to an anonymous session; authenticated logons only through one gated, go-offline-wrapped entry point; STEAM-STACK.md updated.
**Re-verification:** No. Initial verification.

## Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Cold launch logs no authenticated logon under either ordering | VERIFIED | Auth-trigger/library tests pass (steam suites green). Live: UAT items 1-2, 0 `CM logon mode=authenticated`. |
| SC2 | Game page, Play, install-location, platform capture on anonymous CM; `public_only` degrades without error | VERIFIED | `launchTarget.ts` and `installLocation.ts` only call `acquireOpenAuthenticated` (never opens). `getExtraInfo` calls nothing on SteamUser (policy gate Rule). `anonymousClient.ts` logs on with `{anonymous:true}`, `autoRelogin:false`. UAT item 3-4: `mode=anonymous reason=launch-target`, 0 authenticated. |
| SC3 | Authenticated `logOn` only from allow-listed entry point; `depot.ts` reads persisted SteamID | VERIFIED | My grep: the only `logOn({refreshToken})` is `user.ts:1081`; anonymous `logOn` only in `anonymousClient.ts:174`; `acquireAuthenticated(` callers are only games/library/depot/user; `ensureConnected(` has no non-test caller outside `user.ts`. `depot.ts` finalize uses `SteamUser.getPersistedSteamId64()`. `steamAuthSessionPolicy.test.ts` passes (non-vacuity floor included). |
| SC4 | Mac UAT: launch/browse/game page/Play leave Friends signed in | VERIFIED | `54-UAT.md` status complete, items 1-4 pass, operator Friends verdicts recorded. |
| SC5 | `STEAM-STACK.md` records the change and why | VERIFIED | `.planning/research/STEAM-STACK.md` has a "Reopened by Phase 54" section (line 11), the anonymous/on-demand rows (36, 44), and the Web API rejection reason (line 77: SteamClient refresh token limit). CLAUDE.md Steam stack paragraph also updated. |
| SC6 | Every macOS authenticated logon inside go-offline wrap; four unit-test cases; autoRelogin off; live Refresh + depot install | VERIFIED | `macSteamOffline.ts` + tests in suite (green). `autoRelogin:false` at `user.ts:950`, `anonymousClient.ts:105`; `.relog(` appears in no source (Rule C). UAT items 5-8 pass (wrap toggled, already-offline, guided fallback with 0 authenticated). Gap-closure items 9-13 (owed-goonline marker, quit/kill/kill -9, user's own offline choice) pass. |

## Post-execution events weighed

- Code review CR-01, WR-01..09: `54-REVIEW-FIX.md` status all_fixed (10/10, 0 skipped); fix commits 84c2a046e..9135c2c50 present in history.
- Item 11 failed on the post-fix rebuild (slow mid-connect logon survived stdin EOF via `_logonMsgTimeout` retry). Fixed in 95a89d8d3 (`steamUserLogonAbort.ts`, debug session recorded). UAT item 11 now records pass on launch 6 (sidecar gone within 4 s, no logon after EOF). Items 10-13 pass after the fix. Caveat (WARNING, not blocking): the live retry did not reproduce the slow mid-connect path; coverage of that exact path is unit-level only, including one test against real steam-user (`steamUserLogonAbort.test.ts`).

## Behavioral checks run

| Check | Result |
|-------|--------|
| `npx jest src/backend/storeManagers/steam src/backend/__tests__/steamAuthSessionPolicy.test.ts src/backend/sidecar src/frontend/state` | 172 of 175 suites pass, 4904 of 4908 tests. 3 failing suites: `sidecar/__tests__/installFlows`, `runnerSliceRegistration`, `testContainment`. All three are the pre-existing failures in `deferred-items.md` (verified there against pre-phase commit 3e8823f00). `runnerSliceRegistration` count mismatch (67 vs 68) is a channel-census drift; not a Phase 54 gate. |
| `pnpm codecheck` | Clean (tsc app and meta). |
| eslint on `macSteamOffline.ts` | 1 error, `prefer-promise-reject-errors` at line 175: pre-existing and logged in `deferred-items.md`. WARNING, minor. |
| Debt markers (TBD/FIXME/XXX) added by phase | None. Existing FIXMEs in `utils.ts` are not in the phase diff. |

## Requirements Coverage

`.planning/REQUIREMENTS.md` does not exist in this repo (only `milestones/v0.1-REQUIREMENTS.md`), and ROADMAP lists `**Requirements**: TBD` for Phase 54. The IDs in PLAN frontmatter (`ROADMAP-SC1`..`SC6`, `P54-SC1`..`SC7`) are phase-local: ROADMAP-SCn map one-to-one to the ROADMAP Success Criteria above; P54-SCn are plan-local labels defined in `54-RESEARCH.md`/`54-VALIDATION.md`, not in any REQUIREMENTS file. No mapping invented. Coverage by plan: SC1 (54-04), SC2 (54-01, 04, 06, 08), SC3 (54-03, 05, 08, 09), SC4 (54-10, 11, 12, 13, 14), SC5 (54-09), SC6 (54-01, 02, 03, 05, 07, 08, 12, 13, 14). Every ROADMAP-SC1..SC6 is claimed by at least one plan. Plans 54-02, 54-07 and some gap plans claim only ROADMAP-SC6. No orphans.

## Human Verification

None outstanding; Mac live gate already run twice by the operator and scored in `54-UAT.md` (final state complete, all 13 items pass).

## Gaps

None blocking. Warnings: (1) live path for mid-connect logon after EOF unreproduced, unit-covered; (2) three pre-existing sidecar suite failures and one pre-existing lint error remain outstanding (documented in `deferred-items.md`); (3) a full jest regression run was not repeated by me beyond the scoped suites above.

_Verifier: Claude (gsd-verifier)_
