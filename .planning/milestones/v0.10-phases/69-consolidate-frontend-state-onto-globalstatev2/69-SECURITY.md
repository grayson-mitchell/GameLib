---
phase: 69
slug: consolidate-frontend-state-onto-globalstatev2
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-14
---

# Phase 69 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| renderer <-> sidecar (window.api) | Zustand stores consume pushes and invoke channels formerly used by GlobalState | sign-in probe outcomes, library/game status, auth identities (no secrets stored) |
| renderer <-> localStorage / configStore | Persisted UI flags and collections | non-secret UI state |
| login webview -> renderer | OAuth completion via completeOAuthLogin | one-time login codes/tokens (transient, not stored/logged) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-69-01 | Denial of service | index.tsx boot call | mitigate | src/frontend/index.tsx:265 `if (!pickerParams) initStateSubscriptions()` outside hydrate try; once-guard initStateSubscriptions.ts:96-100 | closed |
| T-69-02 | Information disclosure | storeKit / reset registry | accept | Accepted: Registry holds store references only, no secrets; renderer-internal | | closed |
| T-69-03 | Tampering | test helper | accept | Accepted: testUtils is test-only code, not imported by production modules (knip/find-deadcode confirms) | | closed |
| T-69-06 | Tampering | ratchet baseline | mitigate | Ratchet (D-12) intentionally deleted in 69-24 (commit 07b61fa94); meta/ has no state ratchet, package.json/pre-push/lint.yml wiring removed; surface no longer exists | closed |
| T-69-07 | Repudiation | re-shard of jestMock | mitigate | 69-02-SUMMARY:46 jestMock totals unchanged 2582/454 files, gate PASS | closed |
| T-69-08 | Denial of service | fixture tests | accept | Accepted: tmp dirs only, no child processes, cleaned in afterAll | | closed |
| T-69-SC | Tampering | pnpm add jest-environment-jsdom | mitigate | 69-03-SUMMARY: blocking operator checkpoint answered (option-a, jsdom); recorded | closed |
| T-69-04 | Information disclosure | fake api / results JSON | accept | Accepted: Synthetic data only; no real profile, no HOME access, no child processes | | closed |
| T-69-05 | Elevation of privilege | route B dev hook | mitigate | Route A (jsdom) chosen (69-03-SUMMARY:25); grep of src/frontend finds no import.meta.env.DEV hook, so no production dev hook exists | closed |
| T-69-09 | Repudiation | baseline numbers | mitigate | 69-04-SUMMARY:21-23 SHA 097106497, two agreeing runs | closed |
| T-69-10 | Information disclosure | uiState | accept | Accepted: Holds UI flags, game settings modal target and public ratings only; no tokens or credentials | | closed |
| T-69-11 | Tampering | refreshWineVersions | accept | Accepted: Logic unchanged; still calls window.api.refreshWineVersionInfo and notifies on failure | | closed |
| T-69-12 | Tampering | moved listeners | mitigate | Listeners in initStateSubscriptions.ts; epoch/seq ordering retained (:501); behavioural tests in state/__tests__/initStateSubscriptions.test.ts | closed |
| T-69-13 | Denial of service | double registration | mitigate | initStateSubscriptions.ts:96-100 once-guard; test initStateSubscriptions.test.ts:208 'registers each listener exactly once when called twice' | closed |
| T-69-14 | Spoofing | dialog queue | accept | Accepted: reduceDialogRequest unchanged; dialogs only come from renderer code paths | | closed |
| T-69-15 | Tampering | platform gating in Settings | mitigate | uiState.ts:169-171 readInitialUi() reads window.platform; applied initStateSubscriptions.ts:103 | closed |
| T-69-16 | Repudiation | ratchet | mitigate | Ratchet removed in 69-24; no GlobalState importers remain (src/frontend/state has no GlobalState.tsx/ContextProvider) | closed |
| T-69-17 | Tampering | Runner logout failure surface | mitigate | screens/Login/components/Runner/__tests__/logoutFailureSurface.test.tsx:162,186 seeds showDialogModal spy, asserts ERROR dialog once | closed |
| T-69-18 | Repudiation | ratchet | mitigate | Ratchet removed in 69-24 (07b61fa94); nothing left to shard | closed |
| T-69-19 | Spoofing | ExternalLinkDialog | mitigate | state/uiState.ts:28,70,97-98 externalLinkDialogOptions/handleExternalLinkDialog; consumed components/UI/ExternalLinkDialog/index.tsx:12-13; D-16 live gate approved (69-26-SUMMARY) | closed |
| T-69-20 | Denial of service | DialogHandler queue | mitigate | components/UI/DialogHandler/__tests__/buttonActions.test.tsx:139 on useUiState; reducer dialogQueue.ts:34 and dialogQueue.test.ts | closed |
| T-69-21 | Tampering | persisted keys | mitigate | state/settingsState.ts:279-291 same keys sidebar_collapsed/hide_changelogs/last_changelog; no persist middleware | closed |
| T-69-22 | Information disclosure | localStorage | accept | Accepted: Only non-secret UI flags (sidebar, changelog), unchanged keys | | closed |
| T-69-23 | Denial of service | boot ordering | mitigate | initStateSubscriptions.ts:104 readInitialSettings after hydration; :113 applySavedZoomAtBoot; savedZoomBoot.test.ts | closed |
| T-69-24 | Tampering | App WindowControls gate | mitigate | App.tsx:43-45 reads isFrameless/isFullscreen/platform from useUiState; GlobalStateFramelessRefresh.test.ts:232 (B1), :347 S5, :355 S6, :361 S7 | closed |
| T-69-25 | Denial of service | Dialog backdrop setting | accept | Accepted: Same value, same component; covered by dialogStoreEmbedSuppression test | | closed |
| T-69-26 | Tampering | finished list writes | mitigate | state/downloadsState.ts refreshFinished; backend fix test per 69-12-SUMMARY; downloadsState.test.ts | closed |
| T-69-27 | Information disclosure | diagnosis notes | mitigate | 69-12-SUMMARY:31 records counts/runners only (no titles or paths) | closed |
| T-69-28 | Denial of service | refresh loop | mitigate | downloadsState.ts:80-85 length/head-appName guard; downloadsState.test.ts:170 'never on unrelated pushes' | closed |
| T-69-29 | Tampering | signInProbeOutcomes push/pull | mitigate | authState.ts:289-291 applySignInProbeOutcomes sanitizes; push (initStateSubscriptions.ts:361-362) and pull (:419-423) both route through it; authState.test.ts:213 RED specimen | closed |
| T-69-30 | Information disclosure | authState | mitigate | authState.ts: no token/password/cookie/secret/localStorage storage (only login action params; 'category' key unrelated); 69-13-SUMMARY:30 | closed |
| T-69-31 | Elevation of privilege | renderer-started probe | mitigate | GlobalStateSignInMount.test.ts:135,295-305 RED specimen; initStateSubscriptions.ts:347 comment; no humbleCheckHealth call in src/frontend non-test code | closed |
| T-69-32 | Repudiation | dismissed-set writers | mitigate | authState.ts:164 single persistDismissed writer; initStateSubscriptions.ts:435 hydration is a read | closed |
| T-69-33 | Information disclosure | logout | mitigate | authState.ts logout actions clear identity; authState.test.ts:268+ login/logout tests assert cleared | closed |
| T-69-34 | Information disclosure | logging | mitigate | authState.ts:332,355,361-363,379-403,437 only fixed console.log strings; no sid/token logged | closed |
| T-69-35 | Spoofing | humbleDisconnect | mitigate | authState.ts:482-496 showDialogModal confirm; window.api.humbleDisconnect() only in 'yes' onClick | closed |
| T-69-36 | Denial of service | slot before install | mitigate | Slots removed with the class in 69-24 by design; grep finds no 'called before GlobalState installed it'; libraryState actions are real; boot installs before render (index.tsx:265) | closed |
| T-69-37 | Spoofing | sign-in notice | mitigate | screens/Library/__tests__/signInStateParity.test.ts present | closed |
| T-69-38 | Information disclosure | Humble expiry toast | accept | Accepted: Reads only the expired flag, as before | | closed |
| T-69-39 | Tampering | persisted collections | mitigate | libraryState.ts:124 legacy current_custom_category read fallback; libraryState.test.ts per-action tests | closed |
| T-69-40 | Tampering | CrossOver/runs-for-me pushes | accept | Accepted: Display-only maps, set as received exactly as before; no new parsing | | closed |
| T-69-41 | Tampering | game push | mitigate | libraryState.ts:515-516 app_name required, isStore(info,'gog') | closed |
| T-69-42 | Denial of service | refresh storm | mitigate | libraryState.ts:556-568 empty-cache guard; GlobalStateRefreshCacheGuard.test.ts, GlobalStateScopedRefresh.test.ts | closed |
| T-69-43 | Information disclosure | localStorage 'updates' | accept | Accepted: List of app names with updates, unchanged key | | closed |
| T-69-44 | Tampering | log line | mitigate | GlobalStateRefreshLibraryOrigin.test.ts:101,518 literal-origin gate incl. log-injection specimen; origin literals libraryState.ts:253,358,372 | closed |
| T-69-45 | Denial of service | refresh re-entry | mitigate | libraryState.ts:386 refreshing guard, :415 refreshingByRunner guard | closed |
| T-69-46 | Denial of service | sleep assertion | mitigate | sleepAssertion.ts reconcile; GlobalStateSleepAssertionClassification.test.ts | closed |
| T-69-47 | Tampering | gameStatus push | mitigate | gameStatus handling in libraryState.ts (:358,:372) with sequence tests in libraryState.test.ts | closed |
| T-69-48 | Elevation of privilege | classifySleepAssertionKind | mitigate | sleepAssertion.ts:57-58 throws on unrecognised status; test :84-97 | closed |
| T-69-49 | Tampering | hidden/favourite filters | mitigate | libraryState.ts:211-212,652 hidden/favourite lists; accountHooks composites; Library tests | closed |
| T-69-50 | Denial of service | render loops | mitigate | accountHooks.ts:12,125-143 useShallow keys + useMemo composites; storeHookReact test helper | closed |
| T-69-51 | Tampering | install dialogs | mitigate | InstallModal/steamSectionGating.ts + __tests__/steamSectionGating.test.ts present | closed |
| T-69-52 | Denial of service | ConsoleMode focus | accept | Accepted: Same data via stores; live-checked at the D-16 gate (gamepad focus item) | | closed |
| T-69-53 | Spoofing | RedeemSteamKeyDialog | accept | Accepted: Same dialog flag/handler and steam identity; redeem flow covered by the D-16 live item | | closed |
| T-69-54 | Tampering | UninstallModal guard | mitigate | libraryState.ts:803 selectInstallingEpicGame; UninstallModal/index.tsx:41,129; libraryState.test.ts:738 | closed |
| T-69-55 | Spoofing | WebView OAuth completion | mitigate | screens/WebView/useTauriOAuthLogin.ts:117 completeOAuthLogin factory; __tests__/useTauriOAuthLogin.test.tsx present | closed |
| T-69-56 | Information disclosure | ReportProblem payload | accept | Accepted: Same library/identity fields as before; no new data included | | closed |
| T-69-57 | Denial of service | boot ordering | mitigate | initStateSubscriptions.ts:521-566 runPostMountBoot ends with window.api.frontendReady(); test :646 | closed |
| T-69-58 | Repudiation | gate removal | mitigate | 69-24-SUMMARY:38-39 ratchet deleted in 07b61fa94 alongside ContextProvider | closed |
| T-69-59 | Tampering | double boot | mitigate | initStateSubscriptions.ts:96-100,516-525,570-574 three once-guards; tests :208,:668 | closed |
| T-69-60 | Repudiation | final numbers | mitigate | 69-25-SUMMARY:17 commit 0af370d15, two runs matching baseline | closed |
| T-69-61 | Information disclosure | UAT notes | mitigate | 69-UAT.md:11 'status words and symptoms only'; no credentials found | closed |
| T-69-62 | Repudiation | gate verdict | mitigate | 69-26-SUMMARY:19-29 verdict verbatim from operator, blocking gate answered by operator | closed |

*Status: open · closed*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-69-01 | T-69-02 | Registry holds store references only, no secrets; renderer-internal | | plan author (69-NN-PLAN) | 2026-11-14 |
| AR-69-02 | T-69-03 | testUtils is test-only code, not imported by production modules (knip/find-deadcode confirms) | | plan author (69-NN-PLAN) | 2026-11-14 |
| AR-69-03 | T-69-08 | tmp dirs only, no child processes, cleaned in afterAll | | plan author (69-NN-PLAN) | 2026-11-14 |
| AR-69-04 | T-69-04 | Synthetic data only; no real profile, no HOME access, no child processes | | plan author (69-NN-PLAN) | 2026-11-14 |
| AR-69-05 | T-69-10 | Holds UI flags, game settings modal target and public ratings only; no tokens or credentials | | plan author (69-NN-PLAN) | 2026-11-14 |
| AR-69-06 | T-69-11 | Logic unchanged; still calls window.api.refreshWineVersionInfo and notifies on failure | | plan author (69-NN-PLAN) | 2026-11-14 |
| AR-69-07 | T-69-14 | reduceDialogRequest unchanged; dialogs only come from renderer code paths | | plan author (69-NN-PLAN) | 2026-11-14 |
| AR-69-08 | T-69-22 | Only non-secret UI flags (sidebar, changelog), unchanged keys | | plan author (69-NN-PLAN) | 2026-11-14 |
| AR-69-09 | T-69-25 | Same value, same component; covered by dialogStoreEmbedSuppression test | | plan author (69-NN-PLAN) | 2026-11-14 |
| AR-69-10 | T-69-38 | Reads only the expired flag, as before | | plan author (69-NN-PLAN) | 2026-11-14 |
| AR-69-11 | T-69-40 | Display-only maps, set as received exactly as before; no new parsing | | plan author (69-NN-PLAN) | 2026-11-14 |
| AR-69-12 | T-69-43 | List of app names with updates, unchanged key | | plan author (69-NN-PLAN) | 2026-11-14 |
| AR-69-13 | T-69-52 | Same data via stores; live-checked at the D-16 gate (gamepad focus item) | | plan author (69-NN-PLAN) | 2026-11-14 |
| AR-69-14 | T-69-53 | Same dialog flag/handler and steam identity; redeem flow covered by the D-16 live item | | plan author (69-NN-PLAN) | 2026-11-14 |
| AR-69-15 | T-69-56 | Same library/identity fields as before; no new data included | | plan author (69-NN-PLAN) | 2026-11-14 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-14 | 63 | 63 | 0 | gsd-security-auditor |

Notes: mitigations tied to GlobalState.tsx, the slots, and the D-12 ratchet were judged against the final state (deleted by design in 69-24, commits 5e4d6215e / 07b61fa94). No Threat Flags in SUMMARYs were unmapped.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-14
