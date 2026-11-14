---
phase: 69-consolidate-frontend-state-onto-globalstatev2
verified: 2026-11-10T00:00:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Relaunch with the app language set to Arabic (RTL language)"
    expected: "Layout is RTL after relaunch, the language selector shows the Arabic label, no 'undefined' language, no console errors at boot"
    why_human: "Fix 931d41c77 (settingsState.language was undefined at boot) landed after the D-16 live gate. The unit test covers the store, but the deferred i18next init timing is only provable in the real app."
  - test: "Complete a download, relaunch, open Downloads and check the Completed list; switch tabs and press Clear"
    expected: "Completed list is present after relaunch and tab switch, Clear empties it, no stale rows reappear"
    why_human: "bfde7122a changed the D-15 mechanism (sequence token, ensureFinishedLoaded on DownloadManager mount) after UAT items 7 to 9 passed against the older code."
  - test: "Cold start `pnpm tauri:dev` (frameless ON and OFF) and watch the boot"
    expected: "App reaches frontendReady, Library loads, the backend does not log a missing renderer-ready signal, no hang before first paint"
    why_human: "5ea99ae2c gated runPostMountBoot and frontendReady on i18next 'initialized' after the live gate. A hang here would be invisible to jest."
---

# Phase 69: Consolidate frontend state onto GlobalStateV2 Verification Report

**Phase Goal:** One frontend state system. `GlobalState.tsx` and `ContextProvider` retired in favour of Zustand stores with selector hooks (domain slices), a shrink-only ratchet taking ContextProvider consumers to zero before deletion, live checks per wave, Library re-render cost measured before and after, no behaviour change apart from the D-15 downloads-history fix.
**Requirements:** TBD in ROADMAP, so verified against the roadmap goal, plan must_haves and the CONTEXT decisions.
**Re-verification:** No, initial verification.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `GlobalState.tsx`, `ContextProvider` and `ContextType` are deleted | VERIFIED | `src/frontend/state/` has no GlobalState or ContextProvider file. `grep -rlw ContextProvider src meta package.json .github .husky scripts` returns nothing. The only remaining hits for "GlobalState" are comments and one i18n gate-scope history string. No `extends PureComponent` under `src/frontend`. |
| 2 | State is organised as domain slices with selector hooks | VERIFIED | `storeKit.ts`, `uiState.ts`, `settingsState.ts`, `downloadsState.ts`, `authState.ts`, `libraryState.ts`, `accountHooks.ts`, `initStateSubscriptions.ts`, `BootSequence.tsx` exist. A review pass confirms every selector is wrapped in `useShallow` via `bindStoreHooks`. |
| 3 | D-12 ratchet took ContextProvider consumers to zero, then the ratchet and the class were removed | VERIFIED | Zero `ContextProvider` references remain; the ratchet was removed in 07b61fa94 as planned (shrink to zero then delete). |
| 4 | Post-mount boot (former componentDidMount) preserved via `BootSequence` and `runPostMountBoot` | VERIFIED | `BootSequence.tsx` fires `bootSequenceEffectWhenI18nReady` in a `useLayoutEffect`. Post-fix gating is covered by `initStateSubscriptions.test.ts`. Real-app timing is a human item. |
| 5 | D-15 downloads-history fix is in place | VERIFIED (code) | `downloadsState.ts` has `ensureFinishedLoaded` (line 71), wired in `DownloadManager/index.tsx:39`, with a test in `downloadsState.test.ts`. Live: UAT items 7 to 9 passed, but the mechanism changed after (human item 2). |
| 6 | D-14 Library re-render cost measured before and after | VERIFIED | `69-RERENDER.md` has baseline and final tables; `meta/rerender/results/{baseline,final}.json` exist; `pnpm perf:rerender` is defined. Commit counts never regressed: dialogOpenClose 2/200 to 0/0, libraryRefreshPush 3/266 to 2/200, other two equal. Caveats are disclosed (jsdom durations up about 50 percent, mount seam changed). |
| 7 | D-16 blocking live gate performed, frameless ON and OFF | VERIFIED | `69-UAT.md` has all 21 items with `result: pass`, including items 20 and 21 (frameless ON and OFF). |
| 8 | No behaviour change apart from D-15 | VERIFIED with caveat | The review (three batches) found one critical regression (CR-01, language undefined at boot) and it is fixed in 931d41c77. The other review findings are fixed (bfde7122a, 5ea99ae2c, 1671c5a3a, eed7c97ca) or skipped by request (A/IN-02, A/IN-03, C/IN-04, C/IN-05, all Info). The post-gate fixes need a human re-check. |

**Score:** 8/8 truths verified (3 human re-checks pending).

### Key Link Verification

| From | To | Status | Details |
|------|----|--------|---------|
| `index.tsx` | boot (`initStateSubscriptions` and `BootSequence`) | WIRED | `BootSequence` calls `bootSequenceEffectWhenI18nReady`, which calls `bootSequenceEffect` once i18next reports `initialized`. |
| `readInitialSettings` | `settingsState.language` | WIRED | `language` is omitted until i18next has one; `followBootLanguage` fills it from `i18next.language` once initialised (`initStateSubscriptions.ts:90-99`). `RTL_LANGUAGES.includes(state.language)` always sees a string. |
| `DownloadManager` | `downloadsState.ensureFinishedLoaded` | WIRED | Called on mount, pulls only while `finished === undefined`. |
| composite account hooks | stores | WIRED | `accountHooks.ts` is consumed (the `@public` marker was dropped in 69-20). |

### Behavioral Spot-Checks and Test Attribution

| Check | Result |
|-------|--------|
| `jest src/frontend/state` | 490 tests pass. |
| Frontend project (orchestrator run) | 315 suites and 5433 tests pass. |
| `genI18nGateScope` failure | Only the A-17 ANTI-ROT test fails. It compares `meta/i18nForkTouchedFiles.json` to a live git diff against upstream. 62 files are missing from the artifact, and 59 of them were also touched by earlier non-69 work, so it was already stale before the phase. Phase 69 solely adds 3 more entries to that drift. `i18nForkTouchedFiles.json` has zero GlobalState or ContextProvider references; `i18nGateScope.json` has one in its history string only. |
| `launchNoticeThemeTokens` | Files come from quick task 261110-nwy (SteamEngineLaunchNotice), not a Phase 69 file. |
| Other 5 Meta suites | `gamelibCatalogParity`, `lintTranslations`, `logSecretGate` and `x86CallbackWineHarness` are not Phase 69 files (not rerun; no overlap found in the Phase 69 file lists). |
| 7 Backend suites | They sit under `src/backend/**` and Phase 69 is frontend-only (the only backend mentions are comments). The tree currently shows another session's uncommitted `src/backend` edits. |

I did not rerun the full suite. The attribution holds for everything except that the A-17 drift is slightly widened by 3 files.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/frontend/state/**` | TBD, FIXME, XXX | none found | Clean. |
| `src/preload/tauriAttach.ts:15`, `src/backend/sidecar/keyringTokenStore.ts:37`, `meta/hardcodedStringGate.ts`, `meta/__tests__/isIntelMacRemoved.test.ts` | Stale comments naming the deleted `GlobalState.tsx` | Info | Comments only. |
| 10 test files named `GlobalState*.test.ts` under `state/__tests__` | Legacy names, now behavioural tests of the stores | Info | Naming only. |

### Gaps Summary

No blocking gaps. Items worth tracking:

- ROADMAP shows "25/26" and 69-26 unchecked, although 69-26-SUMMARY exists and its UAT is complete. The orchestrator should tick it (not done here: another session has uncommitted edits to ROADMAP).
- Review findings A/IN-02, A/IN-03, C/IN-04 and C/IN-05 were skipped by request. They are Info only.
- Re-render durations rose in jsdom (disclosed, not tuned). If a real-WebKit measurement later shows slower renders, that is a separate investigation.
- The genI18nGateScope A-17 artifact is stale (pre-existing, plus 3 files from this phase). Regenerate it when the other session's work lands.

### Human Verification Required

1. **Arabic relaunch.** Set the language to Arabic, relaunch. Expected: RTL layout and an Arabic label in the selector. Why: CR-01 fix 931d41c77 landed after the live gate.
2. **Downloads Completed list.** Complete a download, relaunch and open Downloads, switch tabs, press Clear. Expected: the list persists, then Clear empties it. Why: bfde7122a changed the D-15 mechanism after UAT items 7 to 9.
3. **Cold boot to frontendReady, frameless ON and OFF.** Expected: no hang, Library loads, the backend gets its renderer-ready signal. Why: 5ea99ae2c gated boot on i18next `initialized` after the live gate.

---

_Verified: 2026-11-10_
_Verifier: Claude (gsd-verifier)_

### Human Verification Result (2026-11-14)

All 3 human re-checks passed (69-HUMAN-UAT.md, commit f0a15d0b3): Arabic RTL survives boot, completed downloads persist and Clear sticks, cold start reaches ready with frameless ON and OFF. Security: 63/63 threats closed, threats_open 0 (69-SECURITY.md, ca0bddc9a).
