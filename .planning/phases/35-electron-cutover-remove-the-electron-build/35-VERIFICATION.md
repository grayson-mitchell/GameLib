---
phase: 35-electron-cutover-remove-the-electron-build
verified: 2026-08-30T04:12:40Z
reverified: 2026-08-31T19:40:00Z
status: gaps_found
score: 16/17 must-haves verified
overrides_applied: 0
re_verification:
  performed: 2026-08-31 — independent goal-backward re-adjudication after gap-closure cycle 1 (plans 35-20..35-29)
  previous_status: gaps_found
  previous_score: 11/17
  gaps_closed:
    - "REQ-35-20 — the blocking packaged macOS arm64 live gate now records PASS (21 of 21, 0 FAIL). Re-run measured 8 criteria, 8 PASS. Verified independently: the packaged artifact (bundle mtime Aug 31 07:54:39) POSTDATES every code fix in the cycle (last source commit 0f5dfb352 at Aug 31 07:14:30), so the gate did not measure stale code."
    - "REQ-35-16 — winetricksInstall closed at the renderer (mousedown capture, RED-proven pin winetricksInstallMouseRace.test.tsx, live gesture twice) AND the unsatisfiable three-layer attribution clause amended in place with a dated correction. installed.json UI half closed by 35-20 Task 3."
    - "REQ-35-17 — D-35-11-01 resolved by 35-26: both native dialogs deleted from eos_overlay.ts, confirmation moved to the renderer behind showDialogModal with a fail-closed `confirmed === true` gate; live gate exercised confirm AND cancel on remove/install/update in both themes."
    - "The Phase 35 mechanized-gate regression — meta/__tests__/genI18nGateScope.test.ts A-17 ANTI-ROT. Re-run by the verifier in its own process: 26 passed / 1 skipped / 0 failed, and BOTH non-vacuity controls (A-17 and A-03) pass live, so the green is not vacuous."
  gaps_remaining:
    - "REQ-35-07 / D-35-19-15 — the multi-domain Epic cookie clear is still never live-proven, and the closure vehicle this cycle delivered does not execute."
  regressions:
    - "None found. Re-ran the five absence/pin gates (5 suites / 42 tests, exit 0), the un-anchored `grep -rn isTauri src/` (0 matches), and `pnpm codecheck` (tsc --noEmit, exit 0)."
  residual_red_gate:
    - "`pnpm test` exits 1 — 3 failed / 7296 passed, 365 of 366 suites. All 3 are decompressPool.test.ts lzmaLoader native-decode cases. Verified NOT caused by Phase 35: the phase's ONLY diffs to lzma files across the whole phase (git diff e42f9862..HEAD) are two comment-text edits in lzmaNativeBinding.ts and meta/buildDecompressWorkerDev.ts. Ledgered as .planning/todos/pending/2026-08-31-decompresspool-native-lzma-tests-fail-3-of-41.md."
gaps:
  - truth: "REQ-35-20 — the phase closes on a BLOCKING packaged macOS arm64 live gate; its own text says 'Any FAIL means the phase does not close'"
    status: resolved
    resolved_by: "plan 35-29 live-gate re-run, 2026-08-31 — all four FAIL criteria (6, 10, 14, 16) re-measured PASS on the packaged 0.7.0 artifact, plus criterion 21 re-measured and regression checks 4, 5, 15 held. 8 measured / 8 PASS / 0 FAIL. See the RE-RUN section of 35-LIVE-GATE.md. VERIFIER CONFIRMED each named cause has a landed fix in the codebase, not merely a claim: protocol.ts:26 RUNNERS now includes 'steam'; storeManagers/steam/launchDispatch.ts dispatchSteamLaunch is the single shared launch+addRecentGame path called from BOTH protocol.ts:163 and steamFlowRegistration.ts:358; installedJsonWatcher.ts emits sendFrontendMessage('refreshLibrary','legendary') AFTER refreshInstalled() resolves; GlobalState.tsx classifySleepAssertionKind/reconcileSleepAssertionCalls split the two assertion kinds. QUALIFIED: criterion 10 proves the argv delivery path only; criterion 14's visible repaint was UNOBSERVED; criterion 21 passes its contract but D-35-19-15 remains OPEN (D-35-29-01). FURTHER QUALIFICATION ADDED BY THE VERIFIER: 13 of the 21 criteria were NOT re-measured and carry forward verdicts taken on the Aug 30 build; only criteria 4, 5 and 15 guard that carry-forward."
    reason: "35-LIVE-GATE.md is `blocking: true` and its recorded verdict is FAIL — 17 PASS / 4 FAIL / 0 NOT ATTEMPTED over 21/21 measured criteria. The requirement's own closure clause is therefore unmet. Two of the four FAILs (6, 10) are on surfaces THIS PHASE built (tray recent-games, `gamelib://` deep link); their root causes are pre-existing, but the phase shipped new user-facing affordances on top of them without measuring them first."
    artifacts:
      - path: ".planning/phases/35-electron-cutover-remove-the-electron-build/35-LIVE-GATE.md"
        issue: "verdict: FAIL. Criteria 6, 10, 14, 16 FAIL."
      - path: "src/backend/protocol.ts"
        issue: "line 15 — `RUNNERS = z.enum(['legendary','gog','nile','sideload'])` omits `steam` while `storeManagers/index.ts` registers six managers including `steam`. `findGame()`'s fallback loop iterates `RUNNERS.options`, so a Steam deep link can never resolve. Verified independently in code."
      - path: "src/backend/launcher.ts"
        issue: "line 320 — the ONLY `addRecentGame` call site, unreachable on the Steam `steam://rungameid` handoff path."
      - path: "src/backend/sidecar/installedJsonWatcher.ts"
        issue: "line 86 — the debounced refresh sends no frontend message, so the renderer never repaints."
    missing:
      - "Re-run the four FAIL criteria on a packaged build once their causes are fixed — DONE 2026-08-31"

  - truth: "REQ-35-16 — the three folded Tauri channel dead ends are closed, and each fix is attributed to a named layer"
    status: resolved
    resolved_by: "plans 35-20 (installed.json UI half) and 35-25 (winetricks). BOTH arms of this gap's own `missing:` clause were delivered, which the verifier confirmed in the codebase: (a) the renderer defect IS fixed — `Winetricks/WinetricksSearch/index.tsx:77` now fires install from `onMouseDown` ahead of the parent remount, with the trailing `onClick` suppressed to avoid a double-invoke and the keyboard path preserved, pinned by a RED-proven `winetricksInstallMouseRace.test.tsx`; and (b) REQ-35-16's unsatisfiable three-layer attribution clause was amended in `.planning/REQUIREMENTS.md` (commit 766ad63b5) with the superseded wording left VISIBLE and a dated correction naming the measured cause. SCOPE LIMIT, recorded so this is not over-read: only the Winetricks consumer of the shared `SearchBar` is proven working; the Library consumer is mouse-dead and is filed separately at .planning/todos/pending/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md. The closure signal is a live mouse gesture, not a green test run — this project's frontend jest project has no DOM."
    reason: "Two of three legs land. `openDialog` IS in `LONG_RUNNING_CHANNELS` (main.rs:826-871) and was live-discharged as gate criterion 13. The `installed.json` watcher IS ported with its debounce and IS wired from bootstrap.ts — but its UI half fails (see gap 1). `winetricksInstall` is NOT fixed: 35-10 Task 2 is recorded BLOCKED / NOT IMPLEMENTED, and the requirement's own attribution clause fails on its own terms — the defect is in NONE of the three layers the requirement enumerates (sidecar registration, Rust dispatch, frontend emit), all three of which were re-measured correct. The real break is renderer hit-testing (`pointerdown`/`mousedown` arrive, `mouseup`/`click` never do; attributed to a React unmount)."
    artifacts:
      - path: "src/backend/sidecar/wineToolsFlowRegistration.ts"
        issue: "line 335 registers the channel correctly; the channel works end-to-end under keyboard activation. Mouse activation never emits."
    missing:
      - "Either fix the renderer unmount that eats the click, or re-home winetricksInstall to a named owner and amend REQ-35-16's three-layer attribution clause, which cannot be satisfied as written — BOTH DONE 2026-08-30"

  - truth: "REQ-35-17 — the EOS remove confirmation and the path-rejection dialogs become app-styled"
    status: resolved
    resolved_by: "plan 35-26, closing D-35-11-01 (which now carries a `RESOLVED 2026-08-30, plan 35-26` annotation in deferred-items.md). Verifier-confirmed in code: `eos_overlay.ts` no longer calls `dialog.showMessageBox` at either site — lines 158-162 and 203-207 are now comments recording that the confirmation moved to the renderer; `remove()` takes an explicit `confirmed: boolean` with a strict `=== true` fail-closed gate widened through ipc.ts / ipc_handler.ts / eosOverlayFlowRegistration.ts / preload/api/settings.ts. The plan's own live gate CAUGHT a real miss on its first attempt (Install and Update ran unguarded) and the remediation `ad07e8ff6` added `confirmInstallEosOverlay`/`confirmUpdateEosOverlay` plus a source-text `EosActionConfirmationGuard.test.ts`, RED-proven 6/10 against pre-fix HEAD. New strings went to `public/locales/en/gamelib.json` only, per the project rule. CAVEAT PRESERVED: the light/dark theme verdict is the operator's direct visual confirmation reported verbally — NO screenshots were captured though the plan asked for one per theme, and pixel values were not measured."
    reason: "Path-rejection is done and the SEAM Phase 33 D-04 auto-resume port is real and wired (`appShellFlowRegistration.ts:435` — `void initQueue(true)` inside a 5s `.unref()`'d timer). The EOS half is NOT done: `eos_overlay.ts:162` and `:197` still call `dialog.showMessageBox`, i.e. the native dialog. Owned by D-35-11-01, which is marked NOT DONE and explicitly needs a human decision."
    artifacts:
      - path: "src/backend/storeManagers/legendary/eos_overlay/eos_overlay.ts"
        issue: "lines 162, 197 — still `dialog.showMessageBox` (native), not the app-styled pattern"
    missing:
      - "Resolve D-35-11-01 (moving a destructive confirmation gate across the IPC boundary) or record it as an accepted gap against REQ-35-17 — RESOLVED 2026-08-30"

  - truth: "The repo's own test suite is green — no Phase 35 regression in the mechanized gates"
    status: resolved
    resolved_by: "plan 35-24 (commit ee86b3442) plus the follow-up re-baseline 90c10e541 after 35-25's own frontend edit invalidated 35-24's pin — the exact regenerating-an-artifact-breaks-its-pins cascade this project has hit before, caught here inside the same cycle. VERIFIER RE-RAN THE GATE ITSELF: `npx jest meta/__tests__/genI18nGateScope.test.ts` exits 0 with 26 passed / 1 skipped, and critically BOTH non-vacuity controls pass live ('A-17 ANTI-ROT non-vacuity: the anti-rot check DOES fail against a mutated copy' and 'A-03 RATCHET non-vacuity'), so this is not a gate that was silenced. The 1 skipped case is `it.skip` introduced 2026-08-11 (commit b4d62dd22, blocked on WR-17) and is NOT a Phase 35 artefact. RESIDUAL, RECORDED NOT ABSORBED: `pnpm test` still exits 1 on 3 decompressPool lzmaLoader failures — see `re_verification.residual_red_gate`. Scored resolved because this gap's own `reason` and `missing` named the A-17 regression exclusively and explicitly carved decompressPool and lint OUT of scope."
    reason: "`meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT fails. The committed `meta/i18nForkTouchedFiles.json` is stale because Phase 35 made 6 frontend files fork-divergent. This is a REAL Phase 35 regression, not inherited. The sanctioned repair (`pnpm gen-i18n-gate-scope`) was attempted and CASCADED the suite from 1 failure to 5 — the `--rewrite-scope` guard fixtures hard-code `163 -> 199` counts and the A-03 ratchet declares an exact debt set. No later milestone phase owns this."
    artifacts:
      - path: "meta/i18nForkTouchedFiles.json"
        issue: "stale — does not list the 6 frontend files Phase 35 made fork-divergent"
      - path: "meta/__tests__/genI18nGateScope.test.ts"
        issue: "A-17 ANTI-ROT red; a bare regen makes it worse"
    missing:
      - "A coordinated multi-file change: regenerate the scope AND update the `--rewrite-scope` guard fixture counts AND re-baseline the A-03 ratchet debt set, in one commit — DONE 2026-08-30/31"

  - truth: "REQ-35-07 — logging out clears the embedded browser's persisted state and the app does not report success unless a post-clear read confirms it"
    status: failed
    reverified: "STILL OPEN after gap-closure cycle 1, and now understood to be WORSE than the original verification recorded, not better. This is the phase's remaining BLOCKER."
    reason: "The code is right and independently verified: `EPIC_COOKIE_DOMAINS` (main.rs:3189) and `EPIC_COOKIE_HOSTS` (legendary/user.ts:43) both carry all five Epic-owned apexes; `epic_cookie_domain_matches` delegates to the single `cookie_domain_matches` comparator rather than hand-rolling a second one; `user.ts:238`'s `if (total === 0)` makes a zero-total clear FATAL to logout. But the closure evidence does not exist: D-35-19-15 records that gate criterion 21 — the criterion that discharged the standing 34.6 Step 8 FAIL — did NOT actually exercise the multi-domain clear it was written to prove. So the widening is unit-proven and code-verified, never live-proven."
    reverified_reason: "The 2026-08-31 re-run found BOTH prescribed closure routes unavailable, and the verifier confirmed the second one structurally in Rust source rather than taking the gate's word. (1) SEEDING ROUTE DEAD: the Tauri build embeds no browser view (`WebviewUnavailablePanel.tsx:43`), so no user action on this build can create a non-primary Epic cookie — the widening is unreachable-by-construction, not merely untested. (2) CENSUS ROUTE DEAD: plan 35-23's per-host census, which D-35-19-15 itself sanctioned as the no-seeding closure path, returns `UNSUPPORTED_OR_ERROR` on all five hosts at every logout. Cause confirmed at source: the `humble_login_cookies_for_domain` arm at `src-tauri/src/main.rs:6341` resolves `app.get_webview_window(label)`, and this same file's own doc comment above `clear_default_data_store_cookies_for_domain` states that Epic's login window is ALWAYS the pristine webview-less `WindowBuilder` window, so that lookup 'structurally can never find it, for ANY label, fresh or stale'. The CLEAR path was given a label-independent data-store fallback for exactly this reason; the CENSUS path was not. DOWNSTREAM CONSEQUENCE THE DEFERRED ITEM DOES NOT SPELL OUT: in `legendary/user.ts`'s CR-04 fatality logic, the `brokenHosts` detector requires `domainVerdict(before) === 'SUPPORTED_NONEMPTY'` and the non-fatal branch requires `'SUPPORTED_BUT_EMPTY'` — with every verdict pinned at `UNSUPPORTED_OR_ERROR`, NEITHER is reachable. Case 1, the broken-per-host detector that is the entire capability D-35-19-15 asked for, is dead code on the only path it serves. What survives is only the pre-existing bare zero-sum fatality. Net: 35-23 shipped no working evidence capability to the Epic logout path. The fail-closed property is intact and correct; the new observability is not."
    artifacts:
      - path: ".planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md"
        issue: "D-35-19-15 — criterion 21 did not exercise the multi-domain cookie clear. Correctly updated 2026-08-31 with a 'STILL OPEN. NOT CLOSED' block naming both dead routes."
      - path: "src/backend/storeManagers/legendary/user.ts"
        issue: "readHostCensus (~line 240) returns UNSUPPORTED_OR_ERROR for every host on every Epic logout, so the brokenHosts detector at ~line 363 and the allProvenEmpty branch at ~line 375 are both unreachable. D-35-29-01."
      - path: "src-tauri/src/main.rs"
        issue: "line 6341 — the census arm requires get_webview_window(label); Epic's login window is the pristine tauri::Window, which that lookup can never resolve. No pristine/data-store fallback exists on this arm, unlike humble_login_clear_cookies."
    missing:
      - "Give the census read the same label-independent data-store fallback the clear already has, and verify by a live logout showing a per-host verdict other than UNSUPPORTED_OR_ERROR. A passing unit test must NOT be accepted as evidence — the existing tests assert the no-window branch does not throw, which passes while the census never works."
      - "OR: an embedded browser view returns, restoring a vehicle that can seed a non-primary Epic apex, and one live logout then reads a non-zero delta on at least one of fortnite.com / unrealengine.com / twinmotion.com / metahuman.com. No later milestone phase currently owns this, so it is NOT deferrable."
deferred:
  - truth: "`pnpm lint` exits 0"
    addressed_in: "Phase 39"
    evidence: "Phase 39 goal: 'Repo-wide lint debt — drive `pnpm lint` to exit 0 after the Electron cutover'. Its roadmap section states explicitly: 'Why this phase runs AFTER Phase 35, not before: Phase 35 removes the Electron build. That deletion takes an as-yet-unmeasured share of the 3544 problems with it.' NOTE: the 6 current errors are specifically Phase 35 residue (uses deleted, declarations left behind) rather than part of the inherited 53, but Phase 39's repo-wide scope subsumes them."
  - truth: "REQ-35-20's Windows and Linux smoke launches"
    addressed_in: "Phase 38"
    evidence: "REQ-35-20 itself routes them: 'The smoke-launch half is routed to Phase 38 as 38-W04 (Windows) and 38-W05 (Linux)'. Phase 38 goal: 'Discharge, in one deliberate sweep, every UAT item across the project that cannot be run on this machine because it needs hardware or an OS this project does not have.' The scope reduction was explicitly acknowledged by the user (option-c, 2026-08-30)."
human_verification:
  - test: "RESOLVED 2026-08-31 — gate criterion 6 re-run: launch a Steam title, quit it, then open the tray menu"
    expected: "The Steam title appears in the recent-games submenu, carries a `runner` field, and clicking it launches the title"
    why_human: "DISCHARGED. Both halves measured: storage — `store/config.json` `games.recent` held `{appName:1124300, title:HUMANKIND, runner:steam}`; execution — the tray submenu entry launched the title."
  - test: "RESOLVED 2026-08-31 (QUALIFIED) — gate criterion 10 re-run: cold-start `gamelib://launch?appName=<steam appid>`"
    expected: "`gamelib.log` shows the ProtocolHandler receiving the URL and the Steam title launching"
    why_human: "DISCHARGED for the argv delivery path — three verbatim log lines end to end. STILL OPEN: the LaunchServices AppleEvent delivery path was not verified on this machine and must not be assumed covered."
  - test: "STILL OPEN — gate criterion 14's UI half: with the Library view open, externally touch `installed.json` and WATCH the view"
    expected: "The Library view repaints within ~1s with NO manual refresh"
    why_human: "The backend and push halves are positively evidenced (`origin=push`, distinct from the boot-time `origin=mount`), but the operator was not watching the Library at the moment of the gesture. A message arriving is not proof a surface repainted. This is the one human item the re-run explicitly left UNOBSERVED rather than scored."
  - test: "STILL OPEN, AND NOW BLOCKED — REQ-35-07 live: log in to Epic, seed a cookie on a non-epicgames.com Epic apex, then log out"
    expected: "`gamelib.log` shows a non-zero per-domain delta on at least one non-primary apex and a post-clear read that confirms removal"
    why_human: "Both closure routes are unavailable on this build. No embedded browser view exists to seed a non-primary apex, and plan 35-23's census fallback is inert at logout (D-35-29-01). This item cannot be discharged by a human gesture until D-35-29-01 is fixed or the embedded browser returns."
  - test: "RESOLVED 2026-08-30 — REQ-35-17 EOS: trigger the EOS confirmations in one light and one dark theme"
    expected: "An app-styled dialog with the cancel path exercised and proven non-destructive"
    why_human: "DISCHARGED by plan 35-26's live gate: Update/Install/Remove each exercised on BOTH the cancel and confirm branches, cross-checked against `gamelib.log`, and both dialogs viewed in both themes. CAVEAT: no screenshots were captured and no pixel values were measured — the theme verdict is verbal operator confirmation."
  - test: "PARTIALLY RESOLVED — Review criticals CR-01..CR-04 from 35-REVIEW.md"
    expected: "A decision per item: fix, or accept with a recorded reason"
    why_human: "All four fixes have LANDED in code and the verifier confirmed each: CR-01 `OPEN_EXTERNAL_ALLOWED_SCHEMES` at main.rs:1207 enforced at :1220; CR-02 `frontendReadyBootWorkDone` one-shot guard at appShellFlowRegistration.ts:202; CR-03 `window.platform` win32 arm at tauriAttach.ts:77; CR-04 renderer surfacing plus the backend jar-liveness classification. WHAT REMAINS IS A RECORDS PASS, NOT A DECISION: 35-REVIEW.md is still `status: issues_found` and none of the four CR sections carries a resolution annotation."
---

# Phase 35: Electron cutover — remove the Electron build — Verification Report

**Phase Goal:** Retire the Electron build: delete `electron-vite`/`electron-builder` config, the preload contextBridge path, and the `isTauri()` branches, leaving Tauri as the only shell. Runs last, and only once the `session`/`powerSaveBlocker` parity gaps are resolved or explicitly accepted, and the parked Electron-renderer bugs have been re-tested against Tauri rather than fixed in Electron. Also in scope: `R-34.5-G1-PKG` (REQ-35-10 half a, REQ-35-11 half b).

**Verified:** 2026-08-30T04:12:40Z (initial) · **Re-verified:** 2026-08-31 (independent, after gap-closure cycle 1)
**Status:** gaps_found — 16/17. Four of five gaps closed; **REQ-35-07 remains a BLOCKER.**
**Re-verification:** Yes. **Everything from here to the `RE-VERIFICATION` heading is the ORIGINAL 2026-08-30 record, preserved unaltered — its "Score: 11/17" and its ✗ marks are historical, not current.** The current adjudication is the [## RE-VERIFICATION (independent) — 2026-08-31](#re-verification-independent--2026-08-31) section at the end of this file, and the frontmatter above it.
**Roadmap `success_criteria`:** empty. Must-haves were merged from the 19 PLAN frontmatter `must_haves` blocks, the goal's own literal claims, and REQ-35-01..21 in REQUIREMENTS.md.

---

## Headline

**The cutover itself succeeded.** Every literal claim in the phase goal is true in the codebase, and I verified each one myself rather than reading it out of a SUMMARY. `R-34.5-G1-PKG` is closed on **both** halves, and I proved half (a) against a real packaged artifact in my own process — not from the 35-04 summary's word.

**What is not achieved is the phase's own closure condition.** REQ-35-20 says in its own text "Any FAIL means the phase does not close," and the blocking gate's verdict is FAIL. Four requirements (35-04, 35-05, 35-16, 35-17) ship partial, and one mechanized gate carries a real Phase 35 regression.

The gap set is small, specific and mostly one shape: **Steam titles are second-class on the runner-resolution paths this phase built new surfaces on top of.**

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `electron-vite` / `electron-builder` config is gone | ✓ VERIFIED | `electron.vite.config.ts` and `electron-builder.yml` both absent from disk. Zero `electron-vite`/`electron-builder` keys in `package.json` (`Object.keys({...deps,...devDeps}).filter(/electron/)` → `[]`). `vite.config.ts` is the live renderer config: `base: mode === 'production' ? './' : '/'` (the load-bearing injected value), `outDir: 'build'`, `emptyOutDir: false`, `preserveRunnerSymlinksPlugin()` at line 126. `meta/__tests__/viteRendererConfig.test.ts` PASSES in my own run. |
| 2 | The preload contextBridge path is gone | ✓ VERIFIED | `src/preload/index.ts` is 38 lines: a `./tauriAttach` side-effect import plus the Windows `navigator.platform` shim. Zero `contextBridge` call sites anywhere in `src/` — the only 4 matches are doc comments in `tauriAttach.ts` and its test. `src/preload/api/*` survives intact as REQ-35-14 required, and is consumed by `tauriAttach`. |
| 3 | The `isTauri()` branches are gone | ✓ VERIFIED | `grep -rn 'isTauri' src/` → **0 matches**, using the un-anchored form the requirement's own undercount lesson demands (the anchored `isTauri(` form was measured to miss 39 refs). Definition deleted from `src/preload/tauriTransport.ts`. `meta/__tests__/isTauriRemoved.test.ts` PASSES in my own run. |
| 4 | Tauri is the only shell — no remaining Electron entry point | ✓ VERIFIED (with residue) | `src/backend/main.ts`, `src/backend/updater.ts`, `e2e/`, `playwright.config.ts`, `flatpak/`, `flathub/`, `src/backend/__mocks__/electron.ts` — all absent. Zero `electron`/`electron-*` deps or devDeps. Zero real `from 'electron'` / `require('electron')` imports (41 grep hits, **all inside comments**, individually inspected). Zero `Electron.` namespace refs. esbuild `--alias:electron=` removed and its guard test INVERTED to assert absence. Reach-ledger measures 0 across 256 visited files. 78 `from 'backend/platform'` imports replace the former surface. **Residue — see Anti-Patterns:** `package.json` still declares `"main": "build/main/main.js"` (file does not exist) and `"debug:react": "pnpm start & npx react-devtools"` (the `start` script was deleted by 35-14); `pnpm-workspace.yaml` still lists `electron` under `onlyBuiltDependencies`. Nothing can start Electron, so the goal's substance holds. |
| 5 | REQ-35-10 half (a) — every `publicDir`-resolved asset ships in the packaged bundle | ✓ VERIFIED (artifact-level) | Config: `bundle.resources` is the **map** form — `{"../build/bin/":"build/bin","../build/locales/":"build/locales","../build/changelog.json":"build/changelog.json","../build/webviewPreload.js":"build/webviewPreload.js","../build/icon.png":"build/icon.png"}`. **Artifact, measured by me on `/Applications/GameLib.app` (built 2026-08-30 08:18, same run as the release DMG):** `Contents/Resources/` holds exactly `build/` and `icon.icns`. `build/locales` holds **147 files across 49 language dirs**. `translation.json` carries `notify.finished.reparing` = `"Finished Repairing"` — the exact key/value pair the 2026-08-22 both-directions probe proved missing. `_up_` **ABSENT**. `public` **ABSENT**. |
| 6 | REQ-35-11 half (b) — `app.isPackaged` has exactly ONE derivation and the packaged branch is reachable | ✓ VERIFIED | `src/backend/sidecar/isPackagedSidecar.ts` is the single `node:sea`-backed, fail-closed resolver. `platform/index.ts:277-278` is a **getter** (`get isPackaged() { return isPackagedSidecar() }`), not a captured boolean — load-bearing, because `paths.ts` reads it at module scope. Exactly three callers, all importing: `platform/index.ts:80`, `devSecretVault.ts:55`, `humbleFlowRegistration.ts:146` (which re-exports rather than keeping a copy). No second derivation exists. |
| 7 | Halves (a) and (b) actually MEET — `publicDir` resolves to a directory that is populated | ✓ VERIFIED (Level 4 data-flow trace) | Full chain traced end to end: `spawn_sidecar_packaged` sets `GAMELIB_APP_ROOT` from `app.path().resource_dir()` (main.rs:6807, :6975) → `platform/index.ts:300` `getAppPath: () => process.env.GAMELIB_APP_ROOT \|\| process.cwd()` → `paths.ts:80-83` `publicDir = resolve(getAppPath(), app.isPackaged \|\| CI==='e2e' ? 'build' : 'public')` → `Contents/Resources/build` → **which the artifact in truth 5 confirms is populated**. The requirement's own warning ("fixing (b) alone resolves correctly to a directory that does not exist") is discharged: it now resolves to a directory that exists AND has content. |
| 8 | The `powerSaveBlocker` parity gap is resolved | ✓ VERIFIED | Not a no-op any more. `main.rs:4144 macos_wake_lock` (IOKit `ASSERTION_TYPE_DISPLAY`/`ASSERTION_TYPE_SYSTEM`), `:4217 windows_wake_lock`, `:4274 linux_wake_lock`. The two kinds stay **distinct** (`WakeLockKind::Display`/`System`, unknown kinds **rejected** not defaulted — `wake_lock_start:unknown-kind`). `WakeLockRegistry` allocates a real unique id and `forget(id)` releases exactly that one; `wake_lock_release_all()` at shutdown (main.rs:8214). Ids start at 1, never 0, because `launcher.ts`'s re-entry guard is `if (!powerDisplayId)`. JS side forwards via `requestRustInvoke`. Live-discharged as gate criterion 15 (PASS). |
| 9 | The `session` parity gap is resolved or explicitly accepted | ✗ FAILED (partial) | Code is correct and independently verified (see gap 5) — five Epic apexes on both the Rust and TS sides, a single shared domain comparator, `total === 0` fatal to logout. But the closure evidence does not exist: D-35-19-15 records that gate criterion 21 did NOT exercise the multi-domain clear it was written to prove. Unit-proven and code-verified; never live-proven. |
| 10 | The parked Electron-renderer bugs were re-tested against Tauri while both shells still built | ✓ VERIFIED | `35-AB-RETEST.md` exists (74KB), 7 items scored across 2 shells with every `Observed:` filled, run in wave 1 before the point of no return. The named `debug-uninstall-game-vanishes-parked` is item 1. Two recorded corrections (`NEITHER`→`BOTH`, `NEITHER`→`NOT ATTEMPTED`) show the record was checked against nominated evidence rather than transcribed. Item 3's finding (`openDialog` missing from `LONG_RUNNING_CHANNELS`) was carried to 35-19 and discharged live as criterion 13. |
| 11 | REQ-35-14 — the irreversible step is named, tagged, and gated on a zero-MISSING behaviour checklist | ✓ VERIFIED | `git tag -l` confirms **`pre-electron-cutover` exists** — I used it as a live oracle throughout this verification (it is how I established truths 15 and 16's provenance). `35-CUTOVER-CHECKLIST.md` status `ZERO MISSING ROWS`, built by census of a 1561-line file registering 136 IPC channels, with `CENSUS-MAINTS-EDGES` **re-run at the deletion commit** rather than trusted from 35-PREFLIGHT. |
| 12 | REQ-35-20 — the phase closes on a PASSING blocking packaged macOS arm64 gate | ✗ FAILED | `35-LIVE-GATE.md` is `blocking: true`, `status: run`, 21/21 criteria measured with 0 blank `Observed:` fields — and `verdict: FAIL` (17 PASS / 4 FAIL). The requirement's own text: "Any FAIL means the phase does not close." |
| 13 | REQ-35-16 — the three folded channel dead ends are closed, each attributed to a named layer | ✗ FAILED (partial) | `openDialog` ✓ (in `LONG_RUNNING_CHANNELS`, live-discharged criterion 13). `installed.json` watcher ✓ backend / ✗ UI (criterion 14). `winetricksInstall` ✗ — 35-10 Task 2 BLOCKED, and the requirement's three-layer attribution clause is unsatisfiable as written. |
| 14 | REQ-35-17 — folded UI-affordance todos and both SEAM convergence items closed | ✗ FAILED (partial) | Path-rejection ✓. SEAM Phase 33 D-04 auto-resume ✓ **really ported** (`appShellFlowRegistration.ts:435`). SEAM Phase 31 D-02 ✓ closed moot-by-construction. EOS remove confirmation ✗ — still `dialog.showMessageBox` at `eos_overlay.ts:162`/`:197` (D-35-11-01). |
| 15 | REQ-35-04 — the tray is real under Tauri and no affordance remains that it cannot honour | ✗ FAILED (partial) | All three settings ARE honoured, so keeping all three toggles in `TraySettings.tsx` is correct under D-05: `noTrayIcon` and `startInTray` from the startup snapshot (main.rs:478-480, :7804-7820), `exitToTray` **deliberately excluded from the snapshot** and read live (main.rs:247, :552 — `if (exitToTray && !noTrayIcon)`), which is 35-06's own mid-gate fix. About window reachable. `addRecentGame` **does** now persist `runner` (`recent_games.ts:47`) — I verified this in code; the gate's "Steam entries carry no runner" observation is explained by pre-fix entries. **But the recent-games submenu is hollow for Steam** (criterion 6 FAIL) — see gap 1. |
| 16 | REQ-35-05 — `gamelib://` is OS-registered by the Tauri shell and reaches `protocol.ts`'s parser | ✗ FAILED (partial) | Shell half fully verified and live-proven: `tauri-plugin-deep-link = "2"` in Cargo.toml, `.plugin(tauri_plugin_deep_link::init())` at main.rs:7485, `on_open_url` at :7695, and **the callback re-validates through `protocol_url_arg()`** — the same single choke point argv and the single-instance socket use (verified at :6720, :6751, :7440, :7590). Gate criterion 10 confirms `on_open_url fired with 1 url(s)` → `delivered OS deep link to sidecar: ok (983ms)`. **The parser half cannot resolve Steam** — see gap 1. |
| 17 | The repo's mechanized gates are green with no Phase 35 regression | ✗ FAILED | `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT is red and is a real Phase 35 regression. (`pnpm lint` exit 1 → **deferred to Phase 39**; `decompressPool.test.ts` lzmaLoader ×3 → not a Phase 35 regression.) |

**Score:** 11/17 truths verified.

---

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | `pnpm lint` exits 0 | Phase 39 | Phase 39 goal is literally "Repo-wide lint debt — drive `pnpm lint` to exit 0 after the Electron cutover", and its section states the sequencing reason: "Phase 35 removes the Electron build. That deletion takes an as-yet-unmeasured share of the 3544 problems with it. Fixing lint across files Phase 35 is about to delete is work thrown away." Caveat recorded: the 6 current errors are Phase 35 *residue*, not part of the inherited 53. |
| 2 | REQ-35-20's Windows and Linux smoke launches | Phase 38 | REQ-35-20 routes them by name: "The smoke-launch half is routed to Phase 38 as `38-W04` (Windows) and `38-W05` (Linux)." Phase 38's goal is discharging every UAT item needing hardware this machine lacks. User explicitly acknowledged the option-c scope reduction on 2026-08-30. |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vite.config.ts` | plain-Vite renderer config lifted from the `renderer:` block | ✓ VERIFIED | 6225 B. `preserveRunnerSymlinksPlugin` present (line 126); `base: './'` in production — the injected value `electron-vite` never showed and a faithful lift of the visible block would have 404'd every packaged asset. |
| `meta/__tests__/viteRendererConfig.test.ts` | config-equivalence gate | ✓ VERIFIED | PASSES in my own run. |
| `src/backend/sidecar/isPackagedSidecar.ts` | single `node:sea` fail-closed resolver | ✓ VERIFIED | 5112 B, exists, 3 importing callers, `catch` returns `true`. |
| `src-tauri/tauri.conf.json` | `bundle.resources` shipping every `publicDir` asset at a reachable target | ✓ VERIFIED | Map form, all 5 targets under `build/`, no `..` segment, locales as a directory entry not a glob. |
| `src/backend/platform/index.ts` | the single electron-compatible surface | ✓ VERIFIED | 1133 lines, 26 exports, `handlerRegistry` at :162, `ipcMain` at :166. 78 consumers. |
| `src/backend/platform/types.ts` | first-party electron type declarations | ✓ VERIFIED | 632 lines, `IpcMainEvent` present. |
| `src/backend/store_backend.ts` | first-party `conf` shim replacing `electron-store` | ✓ VERIFIED | `conf@^10.2.0` in dependencies; `cwd` sourced explicitly from `pathShim.getPath('userData')` (the omission the plan measured would have collapsed all 24 cache files onto one `config.json` in the repo). |
| `src/backend/sidecar/installedJsonWatcher.ts` | ported watcher with debounce | ⚠️ HOLLOW | Exists, imports `legendaryInstalled`, wired from `bootstrap.ts:39`/`:661`, debounce intact, gate-proven to actually execute the deferred refresh. But line 86's callback sends **no frontend message**, so the rendered library never updates. |
| `src/preload/index.ts` | preload entry with the contextBridge block removed | ✓ VERIFIED | 38 lines; block gone, `src/preload/api/*` intact. |
| `meta/__tests__/electronAbsence.test.ts` | mutation-proven D-03 single-grep gate | ⚠️ PARTIAL | PASSES, but is structurally blind to `package.json`'s `main` field and `pnpm-workspace.yaml` — see Anti-Patterns. |
| `meta/__tests__/isTauriRemoved.test.ts` | static absence gate | ✓ VERIFIED | PASSES. |
| `meta/__tests__/artifactTargets.test.ts` | `bundle.targets` deep-equality pin | ✓ VERIFIED | PASSES. `targets: ["nsis","appimage","dmg"]`. |
| `src/backend/sidecar/__tests__/electronReachLedger.test.ts` | shrinking baseline, inverted to assert zero | ✓ VERIFIED | PASSES. Measured 0 reach across 256 visited files — a completed traversal, not a vacuous one. |
| `35-AB-RETEST.md` | 7-item × 2-shell observation record | ✓ VERIFIED | 74133 B, every `Observed:` filled. |
| `35-CUTOVER-CHECKLIST.md` | per-behaviour successor checklist | ✓ VERIFIED | `ZERO MISSING ROWS`, census-built, `CENSUS-MAINTS-EDGES` re-run. |
| `35-LIVE-GATE.md` | packaged-build gate, 21 criteria | ⚠️ RUN BUT FAILING | 107956 B, 21/21 measured, 0 blank fields — the artifact is exemplary. Verdict FAIL. |
| `35-RELEASE-NOTES.md` | user-facing accepted gaps | ✓ VERIFIED | Exists, contains "offline". |
| `git tag pre-electron-cutover` | annotated tag before any deletion | ✓ VERIFIED | Present; used as a live oracle in this verification. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `platform/index.ts` `app.isPackaged` | `isPackagedSidecar.ts` | delegating getter, never re-derives | ✓ WIRED | `:277-278`. Getter not captured boolean — correct, since `paths.ts` reads at module scope. |
| `devSecretVault.ts` guardrail (c) | `isPackagedSidecar.ts` | import, repointed from `humbleFlowRegistration.ts` | ✓ WIRED | `:55`, used at `:282`. Fail-closed guarantee intact. |
| `tauri.conf.json` `bundle.resources` | `paths.ts` `publicDir` | target layout equals `resolve(GAMELIB_APP_ROOT,'build')` | ✓ WIRED | Proven at the artifact level, not by config inspection alone. |
| `installElectronHook.ts` | `../platform` | `Module._load` redirect of `require('electron')` | ✓ WIRED | Second interception (`electron-store`) correctly deleted **with its docs**, per 35-05's own must-have about stale comments. |
| `meta/esbuildWorkerBundleShared.ts` | (nothing) | `--alias:electron=` removed, guard test inverted | ✓ WIRED | `buildSidecarSea.test.ts:352` asserts absence. |
| deep-link `on_open_url` | `protocol_url_arg()` | re-validation through the single allow-list | ✓ WIRED | main.rs:7695 → :7702 → `deep_link_decision` :6720 → `protocol_url_arg` :6670. Third source, no exception. |
| `main.rs` deep link | `protocol.ts` `handleProtocol` | validated URL dispatched to sidecar | ⚠️ PARTIAL | Delivery proven live (`delivered OS deep link to sidecar: ok`). The parser then cannot resolve a Steam appName. |
| `platform/index.ts` `powerSaveBlocker` | Rust wake-lock command | `requestRustInvoke` | ✓ WIRED | Mirrors clipboard forwarding; sync-over-async handled by minting a local id and resolving the Rust id on landing. |
| `legendary/user.ts` `clearEpicCookies` | `humble_login_clear_cookies` | one `seam.clearCookies` per Epic domain, deltas summed | ✓ WIRED | `:203-238`. Both sides widened together — the plan's explicit warning about a naive TS-only loop was heeded. |
| `installedJsonWatcher.ts` | the renderer | (nothing) | ✗ NOT_WIRED | No `sendFrontendMessage`. This is the criterion-14 FAIL. |
| `main.rs` tray recent-games | `addRecentGame` data | `store/config.json` `games.recent` | ✗ NOT_WIRED (Steam) | Writer never runs on the Steam protocol-handoff launch path. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `paths.ts` `publicDir` | resolved asset root | `GAMELIB_APP_ROOT` ← `resource_dir()` | Yes — 147 locale files measured in the real bundle | ✓ FLOWING |
| `platform/index.ts` `app.isPackaged` | `isPackagedSidecar()` | `require('node:sea').isSea()` | Yes — worker-thread agreement measured (OQ-1, `main=true worker=true`) | ✓ FLOWING |
| `main.rs` tray recent-games submenu | `TRAY_RECENT` seeded from `store/config.json` | `addRecentGame` at `launcher.ts:320` | **No for Steam** — writer unreachable on the `steam://rungameid` handoff path | ✗ HOLLOW |
| `protocol.ts` `findGame()` | `libraryManagerMap[runner]` | `RUNNERS.options` (4 of 6 registered managers) | **No for Steam** — `steam` absent from the enum | ✗ DISCONNECTED |
| Library view after external `installed.json` write | `installedGames` | `refreshInstalled()` | Backend yes, renderer **no** — no frontend message emitted | ✗ HOLLOW |
| `legendary/user.ts` cookie clear | `total` / `perDomain` | `seam.clearCookies` × 5 domains | Yes in code; **never live-measured** for the 4 sibling domains | ⚠️ UNPROVEN |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `electron` absent from `src/` and `package.json` | `npx jest meta/__tests__/electronAbsence.test.ts` | PASS | ✓ PASS |
| `isTauri()` absent from `src/` | `npx jest meta/__tests__/isTauriRemoved.test.ts` | PASS | ✓ PASS |
| `bundle.targets` pinned, no flatpak/flathub survivor | `npx jest meta/__tests__/artifactTargets.test.ts` | PASS | ✓ PASS |
| Vite config lift dropped nothing | `npx jest meta/__tests__/viteRendererConfig.test.ts` | PASS | ✓ PASS |
| Electron reach set is zero, non-vacuously | `npx jest src/backend/sidecar/__tests__/electronReachLedger.test.ts` | PASS (0 reach / 256 visited) | ✓ PASS |
| All five together | `npx jest --runInBand --silent <5 suites>` | `5 passed, 42 tests passed, 1.296s` | ✓ PASS |
| `isTauri` truly absent (un-anchored) | `grep -rn 'isTauri' src/ \| wc -l` | `0` | ✓ PASS |
| `Electron.` namespace refs absent | `grep -rnE '\bElectron\.[A-Z]' src/ \| wc -l` | `0` | ✓ PASS |
| Real `from 'electron'` imports absent | 41 hits, each inspected | all inside comments | ✓ PASS |
| Packaged locales present | `find /Applications/GameLib.app/Contents/Resources/build/locales -type f \| wc -l` | `147` across 49 langs | ✓ PASS |
| Packaged `_up_` / `public` absent | `ls -d .../Resources/{_up_,public}` | both `No such file or directory` | ✓ PASS |
| Translated string shipped, not just the key | JSON walk for `notify.finished.reparing` | `'Finished Repairing'` | ✓ PASS |
| `pre-electron-cutover` tag exists | `git tag -l \| grep electron` | `pre-electron-cutover` | ✓ PASS |
| `vite` resolvable | `require.resolve('vite/package.json')` | resolves (v6.3.5, hoisted peer) | ⚠️ PASS with caveat — undeclared direct dep |
| `package.json` `main` target exists | `ls build/main/main.js` | `No such file or directory` | ✗ FAIL (residue, non-fatal) |

---

### Probe Execution

The phase declares no `scripts/*/tests/probe-*.sh` probes; its mechanized closure gates are jest suites, which I executed above rather than reading their claimed results. `35-LIVE-GATE.md` is a human-gesture gate and cannot be re-executed by a verifier — its recorded verdict is taken as the measured input it is.

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| Phase 35 absence/pin gates (5 suites) | `npx jest --runInBand --silent ...` | 5 passed / 42 tests | PASS |
| Conventional `scripts/*/tests/probe-*.sh` | `find scripts -path '*/tests/probe-*.sh'` | none found | N/A |

---

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| REQ-35-01 `backend/platform` single module | 35-13, 35-15 | ✓ SATISFIED | 1133-line module, 26 exports, 78 `from 'backend/platform'` consumers. |
| REQ-35-02 `electron` nowhere in `src/`/`package.json` | 35-15/16/18 | ✓ SATISFIED | Verified 4 ways in my own process; mutation-proven gate passes. |
| REQ-35-03 `electron-store` → `conf` | 35-05, 35-16 | ✓ SATISFIED | `store_backend.ts` shim, `conf@^10.2.0`, explicit `cwd` from `pathShim`. |
| REQ-35-04 tray real, no unhonoured affordance | 35-06 | ✗ BLOCKED | Three settings honoured; recent-games submenu hollow for Steam (criterion 6 FAIL). |
| REQ-35-05 `gamelib://` OS registration | 35-07 | ✗ BLOCKED | Shell half live-proven; parser cannot resolve Steam (criterion 10 FAIL). |
| REQ-35-06 real `powerSaveBlocker` assertions | 35-08 | ✓ SATISFIED | Real IOKit/Win/Linux assertions, distinct kinds, unique ids, shutdown release. Live criterion 15 PASS. (D-35-19-10/-11/-12 record adjacent defects: double-acquire; a "download" system assertion held while merely playing.) |
| REQ-35-07 logout clears persisted state, no false success | 35-09 | ✗ BLOCKED | Code verified correct; live evidence missing (D-35-19-15). |
| REQ-35-08 renderer builds with plain `vite` | 35-03 | ✓ SATISFIED | `vite.config.ts` + gate; CI step "Build renderer web assets (vite)" → `pnpm exec vite build`. |
| REQ-35-09 real HMR + preserved packaged-evidence path | 35-03 | ✓ SATISFIED | `devUrl: http://localhost:5173`, `beforeDevCommand: pnpm exec vite`, and a separate `tauri:dev:packaged` that runs `vite build` then `tauri build --debug`. |
| REQ-35-10 `R-34.5-G1-PKG` half (a) | 35-04 | ✓ SATISFIED | **Artifact-proven by me**, not by summary. |
| REQ-35-11 `R-34.5-G1-PKG` half (b) | 35-01, 35-04 | ✓ SATISFIED | One derivation, three callers, fail-closed. |
| REQ-35-12 AppImage-only, Flatpak deleted | 35-12 | ✓ SATISFIED | `flatpak/`, `flathub/` absent; zero flatpak/flathub strings in `package.json`; `targets` deep-equality pinned with over-reach control. |
| REQ-35-13 clean updater handover | 35-14 | ✓ SATISFIED | `updater.ts` and `electron-updater` gone; Tauri updater plugin configured with pubkey, GitHub endpoint, `installMode: passive`, `createUpdaterArtifacts: true`. |
| REQ-35-14 named, tagged point of no return | 35-14 | ✓ SATISFIED | Tag present; zero-MISSING checklist; `src/preload/api/*` survived as required. |
| REQ-35-15 A/B re-test under both shells | 35-02 | ✓ SATISFIED | 7 items × 2 shells, run in wave 1, corrections recorded. |
| REQ-35-16 three folded channel dead ends | 35-07, 35-10 | ✗ BLOCKED | 2 of 3; `winetricksInstall` blocked and the attribution clause unsatisfiable as written. |
| REQ-35-17 UI affordances + SEAM convergence | 35-11 | ✗ BLOCKED | EOS dialog outstanding (D-35-11-01). |
| REQ-35-18 one fail-closed secret policy | 35-05, 35-16 | ✓ SATISFIED | `misc.ts`: zero `isTauri`, zero `SECRET_STORE_KEYS`, zero `electron-store`; `storeGet` gated on `isAllowedStoreField` alone. |
| REQ-35-19 `isTauri()` gone | 35-16, 35-17 | ✓ SATISFIED | Zero-match un-anchored grep + mutation-proven gate; both re-run by me. |
| REQ-35-20 blocking packaged gate | 35-01, 35-19 | ✗ BLOCKED | Gate RAN exemplarily (21/21, 0 blanks) but verdict is FAIL. |
| REQ-35-21 user-facing release notes | 35-18 | ✓ SATISFIED | 8 areas + decision-trace appendix; the logout item correctly sourced from 35-09's *observed* behaviour rather than the superseded decision text. |

**Orphaned requirements:** none. All 21 IDs the ROADMAP assigns to Phase 35 appear in at least one PLAN's `requirements:` field, and all 21 are accounted for above.

**Traceability defect (records, not code):** `.planning/REQUIREMENTS.md`'s table (lines 423-443) still reads `Planned (2026-08-28)` for **18 of 21** rows — only REQ-35-02, -18 and -19 are marked Complete. The checkbox list at 1137-1157 marks only `[x]` on -02, -18, -19, -21. By the evidence above, at least REQ-35-01, -03, -08, -09, -10, -11, -12, -13, -14, -15 are demonstrably complete and their rows understate reality. This is the project's known status-doc-lag pattern running in the *understating* direction.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `package.json` | `main` | `"main": "build/main/main.js"` — target file does not exist | ⚠️ Warning | A surviving declaration of the deleted Electron entry point. Inert under Tauri (nothing reads it), but it is exactly the class of stale pointer 35-05's own must-have called "worse than none". The D-03 gate cannot see it — `electronAbsence.test.ts` matches reference forms and dependency keys, not the `main` field. |
| `package.json` | `debug:react` | `"pnpm start & npx react-devtools"` — `start` deleted by 35-14, `react-devtools` no longer a dependency | ⚠️ Warning | Broken developer script. Its companion `vite_plugin_react_dev_tools` in `vite.config.ts` is now unreachable in practice. |
| `pnpm-workspace.yaml` | 8 | `onlyBuiltDependencies:` still lists `electron` | ⚠️ Warning | Build-approval entry for a package no longer installed. |
| `package.json` | — | `vite` is used by `beforeDevCommand`, `tauri:dev:packaged` and the CI renderer step, but is **not a declared dependency** — only a hoisted peer of `@vitejs/plugin-react-swc` / `vite-plugin-svgr` | ⚠️ Warning | This is `D-35-03-02`, which the ROADMAP itself flags as "a BLOCKING input for 35-14". It resolves today only because `.npmrc` sets `node-linker=hoisted`. The build's own toolchain depends on an undeclared package. |
| `.github/workflows/release-tauri.yml` | 12-20, 137, 404-416 | Header prose describes `draft-release-mac.yml`/`draft-release-linux.yml` co-running on `v*` and `electron-builder`'s artifactName segments | ⚠️ Warning | Both workflows are **deleted** — `.github/workflows/` no longer contains them. Stale prose describing a deleted mechanism in a file this phase edited. |
| `src/backend/save_sync.ts`, `eos_overlay.ts`, `utils.ts`, `extra-mock-function.ts`, `common/types/electron_store.ts` | 9 sites | `FIXME` markers with no issue/PR reference | ℹ️ Info | **Not a blocker.** I checked each against the phase base commit `e42f9862` — all 9 pre-date Phase 35 (inherited upstream Heroic debt), and the phase added exactly one `FIXME` line, `vite.config.ts:71`, which is a **verbatim carry** of `electron.vite.config.ts:21` as part of the documented lift. No new unreferenced debt. |
| `build/main/` | — | Holds `sidecar.js`, `sidecar-sea-bundle.js`, `decompressWorker*.js` — no `main.js` | ℹ️ Info | Confirms nothing Electron-shaped remains buildable; the directory name is now a misnomer only. |
| `Contents/Resources/build/` | — | No `crossover-index.json.gz`, which REQ-35-10's own text names as a `publicDir` asset class | ℹ️ Info | **Not a gap.** The snapshot is gitignored and CI-generated (`build-crossover-index.yml`); it exists in neither `public/` nor `build/` in this tree, so there is nothing to bundle. `fetcher.ts:43-60` explicitly treats ENOENT as "a NORMAL cold-start, not an error" and logs at info. |

---

### Correction to a phase record

`35-LIVE-GATE.md`'s frontmatter asserts: *"all four FAILs trace to pre-existing or upstream-inherited code, NOT the Electron cutover."* For criterion 6, **the gate's own body contradicts that** — it says explicitly: *"WHERE IT WAS INTRODUCED IS NOT ESTABLISHED HERE and must not be assumed."* The summary claim was therefore unsupported at the time it was written.

I closed that gap independently. `git grep addRecentGame pre-electron-cutover` and the phase base `e42f9862` both show the identical single call site at `launcher.ts:320`. **The claim is TRUE**, but it is now established rather than asserted. Criteria 10 and 14 already carried their own provenance evidence (`git blame` → upstream `7ba121ec5f`, and `git show 5643c7583^` respectively); criterion 6 did not.

---

### Gaps Summary

**The cutover is real and it is done well.** Electron is gone by every measure I could apply — config, entry points, imports, namespace references, dependencies, build alias, mock, e2e harness, Flatpak channel, and the `isTauri()` branch tree. The reach ledger measures zero non-vacuously. `R-34.5-G1-PKG`, the scope item homed here in August and orphaned across three prior phases, is closed on **both** halves, and I confirmed half (a) by listing a real shipping `.app` rather than trusting the summary that claimed it. The point of no return was tagged, gated on a census-built zero-MISSING checklist, and the A/B signal that Electron's deletion destroys forever was captured first, in wave 1, exactly as planned.

**What blocks closure is narrower than it looks, and it has one dominant shape.** Three of the four gate FAILs and both of the partial feature requirements converge on the same thing: **Steam titles are second-class on runner-resolution paths.** `protocol.ts:15`'s `RUNNERS` enum lists four runners while `storeManagers/index.ts` registers six, so a Steam deep link can never resolve. `addRecentGame` has one call site that the Steam `steam://rungameid` handoff structurally never reaches, so the tray's new recent-games submenu is empty of the platform this project exists to add. Both root causes pre-date the phase — I verified that against the `pre-electron-cutover` tag — but Phase 35 built two new user-facing affordances directly on top of them and measured them only at the very end, in the closing gate. Two defects, different files, one fix session.

**Two further gaps are independent.** The `installed.json` watcher was ported faithfully — and faithfully carried forward a 2022 upstream defect where the refresh never tells the renderer, so the user still has to hit refresh manually. And `meta/__tests__/genI18nGateScope.test.ts`'s A-17 ANTI-ROT is a genuine Phase 35 regression whose sanctioned one-command fix has already been measured to make things worse (1 failure → 5); it needs a coordinated multi-file change, and no later milestone phase owns it.

**Two things that look like gaps are not.** `pnpm lint` exiting 1 is Phase 39's declared job, sequenced deliberately after this phase. The Windows/Linux smoke launches are Phase 38's, routed there by REQ-35-20's own text with the user's explicit acknowledgement.

**Finally, the records need a pass.** `REQUIREMENTS.md` still calls 18 of 21 requirements "Planned" when at least ten are demonstrably complete — this phase's status documents lag reality in the understating direction, which is the mirror image of the failure mode this verification was asked to watch for. And `35-REVIEW.md` remains `status: issues_found` with four criticals unaddressed, one of which (`open_external` forwarding any renderer-supplied URL straight to `app.opener().open_url` with no scheme allow-list — confirmed at `main.rs:1203-1207`) is a security item, not a style note.

---

_Verified: 2026-08-30T04:12:40Z_
_Verifier: Claude (gsd-verifier)_

---

## RE-VERIFICATION — plan 35-29 live-gate re-run, 2026-08-31

**This section records a change to ONE gap only. The overall `status:` is deliberately left at
`gaps_found` for the phase verifier to re-adjudicate — this document's author is not re-scoring the
other must-haves.**

### REQ-35-20 — RESOLVED

The blocking gate's four FAILs were the sole basis of this gap. All four were re-measured on the
packaged release artifact (`/Applications/GameLib.app`, `0.7.0`, bundle mtime `Aug 31 07:54:39
2026`) and all four PASS, together with criterion 21's re-measure and regression checks 4, 5 and
15 — **8 measured, 8 PASS, 0 FAIL**.

The gap's diagnosis was correct in every particular, and each named cause now has a landed fix:

| gap artifact | cause as diagnosed | closed by |
| --- | --- | --- |
| `src/backend/protocol.ts:15` | `RUNNERS` omits `steam`, so a Steam deep link can never resolve | plan `35-20` Task 1 — criterion 10 PASS |
| `src/backend/launcher.ts:320` | `addRecentGame`'s only call site is unreachable on the Steam handoff | plan `35-20` Task 2 (`dispatchSteamLaunch`) — criterion 6 PASS |
| `src/backend/sidecar/installedJsonWatcher.ts:86` | debounced refresh sends no frontend message | plan `35-20` Task 3 — criterion 14, `origin=push` observed |
| shared `pendingOps` counter (F-35-08-A) | one membership test governing two assertion kinds | plan `35-27` — criterion 16 PASS on both exposing configurations |

The verification's reading that "Steam titles are second-class on runner-resolution paths" was the
right unifying diagnosis: two of the four fixes are the same shape, and `dispatchSteamLaunch` exists
specifically so the two call sites cannot drift apart again.

### Qualifications that survive this resolution

Recorded so a future reader does not treat `resolved` as unconditional:

- **Criterion 10** proves deep-link delivery via the **argv** path. The LaunchServices **AppleEvent**
  path was not verified on this machine.
- **Criterion 14**'s backend and push halves are positively evidenced (`origin=push`, distinct from
  the boot-time `origin=mount`). The **visible re-render was not observed** — the operator was not
  watching the Library at the moment of the gesture.
- **Criterion 21** passes its contract (logout real, credentials required), but **`D-35-19-15` is
  NOT closed**: neither closure route was available. See `D-35-29-01`.

### New items raised BY the re-run

None of these existed before it, and none are in this phase's gap-closure scope fence:

- **`D-35-29-01`** — plan `35-23`'s Epic cookie census is **inert at logout** (needs a login window;
  logout has none). A defect in this cycle's own delivered fix, invisible to its unit tests.
- **`D-35-29-02`** — four Epic auth cookies survive logout on the primary domain. Inert for
  re-auth; cause not established.
- **`D-35-29-03`** — the tray About window opens without focus, on a secondary display.
- **Criterion 5 contract defect** — its `Sink:` line names `gamelib-shell.log`, which its
  `eprintln!`-only call sites at `main.rs:725`/`:730` cannot write to.

### Gaps NOT touched by this re-run

The remaining gaps stand exactly as recorded: `pnpm lint` (routed to Phase 39), Windows/Linux
parity (routed to Phase 38), and the records-hygiene items addressed separately by plan `35-28`.

_Re-verified: 2026-08-31 — plan 35-29 Task 4_

---

## RE-VERIFICATION (independent) — 2026-08-31

**Verifier:** Claude (gsd-verifier), a session that did not run the gap-closure cycle and did not
write the `RE-VERIFICATION — plan 35-29` section above.

**Verdict: `gaps_found`, 16/17.** Four of the five recorded gaps are genuinely closed. One is not,
and it is the phase's remaining blocker. **The green live gate does not close this phase.**

### What I re-measured myself, rather than reading

Every claim below was executed in this verifier's own process. SUMMARY and gate assertions were
treated as inputs to check, not as evidence.

| Check | Command | Result |
| --- | --- | --- |
| Typecheck gate | `pnpm codecheck` (`tsc --noEmit`) | **exit 0**, clean |
| Full suite | `pnpm test`, redirected to a file, `$?` captured directly (never from a pipe) | **exit 1** — 3 failed / 3 skipped / 7296 passed; 365 of 366 suites |
| The named Phase 35 regression | `npx jest meta/__tests__/genI18nGateScope.test.ts` | **exit 0** — 26 passed / 1 skipped / 0 failed |
| …and is that green vacuous? | same run, `--verbose` | **No.** `A-17 ANTI-ROT non-vacuity` and `A-03 RATCHET non-vacuity` both PASS live — the gate demonstrably still fails against a mutated artifact |
| …and the 1 skip? | `git log -S "it.skip('every fork-touched source file"` | introduced **2026-08-11** (`b4d62dd22`), blocked on WR-17. Pre-dates Phase 35; not a cycle artefact |
| Five absence/pin gates | `npx jest --runInBand` × 5 suites | **exit 0** — 5 suites / 42 tests. No regression from the cycle |
| `isTauri` truly absent | `grep -rn 'isTauri' src/ \| wc -l` | **0** |
| Did the gate measure stale code? | commit timestamps vs bundle mtime | **No.** Last source commit `0f5dfb352` **Aug 31 07:14:30**; packaged `gamelib-shell` mtime **Aug 31 07:54:39**. Everything after that is docs or `meta/` |
| Is decompressPool a Phase 35 regression? | `git diff e42f9862..HEAD -- <lzma files>` | **No.** The phase's only touches are **two comment-text edits** (`lzmaNativeBinding.ts`, `meta/buildDecompressWorkerDev.ts`). Zero functional change |

### Re-adjudicated truths

Superseding the original table. Truths 1–8, 10, 11 were VERIFIED originally and were regression-
checked here, not re-derived from scratch.

| # | Truth | Then | Now | Evidence |
|---|-------|------|-----|----------|
| 1–8, 10, 11 | Cutover substance (config gone, preload gone, `isTauri()` gone, no Electron entry point, `R-34.5-G1-PKG` both halves, `powerSaveBlocker` real, A/B retest captured, tagged point of no return) | ✓ | ✓ VERIFIED (regression-checked) | 5 gates + un-anchored grep re-run by me, all green |
| 9 | The `session` parity gap is resolved or explicitly accepted | ✗ | **✗ FAILED — and now worse** | See "The one gap that stands" below |
| 12 | REQ-35-20 — the phase closes on a PASSING blocking packaged gate | ✗ | ✓ VERIFIED (qualified) | Gate `status: rerun-pass`, 21 PASS / 0 FAIL; all four named causes have landed fixes I read in the codebase |
| 13 | REQ-35-16 — three folded channel dead ends closed, each attributed | ✗ | ✓ VERIFIED (qualified) | `WinetricksSearch/index.tsx:77` `onMouseDown` + RED-proven pin; attribution clause amended with superseded wording left visible |
| 14 | REQ-35-17 — UI affordances + SEAM convergence closed | ✗ | ✓ VERIFIED (qualified) | Both `dialog.showMessageBox` sites gone from `eos_overlay.ts`; fail-closed `confirmed === true` gate; confirm AND cancel exercised live on all three actions |
| 15 | REQ-35-04 — tray real, no unhonoured affordance | ✗ | ✓ VERIFIED | Criterion 6 PASS on **both** halves — storage (`games.recent` carries `runner:"steam"`) and execution (submenu entry launched the title) |
| 16 | REQ-35-05 — `gamelib://` OS-registered and reaches the parser | ✗ | ✓ VERIFIED (qualified) | `protocol.ts:26` `RUNNERS` includes `steam`; `:157-164` routes Steam to `dispatchSteamLaunch`; criterion 10 shows the full three-line chain. **argv path only** |
| 17 | Mechanized gates green, no Phase 35 regression | ✗ | ✓ VERIFIED (qualified) | A-17 closed and re-run by me with live non-vacuity controls. **Residual red suite recorded below, not absorbed** |

**Score: 16/17.**

### The one gap that stands — REQ-35-07 (BLOCKER)

**A significant finding, not a footnote: this cycle's own delivered fix does not execute, and its
unit tests structurally cannot see that.**

Plan `35-23` implemented the per-host Epic cookie census that `D-35-19-15` itself sanctioned as the
way to close REQ-35-07 without seeding. The construction is careful and correct — per-host
`before`/`after`, classifying on `matched` rather than `jarTotal` so an Epic-empty host in a live
shared jar reads `SUPPORTED_BUT_EMPTY`. **It returns `UNSUPPORTED_OR_ERROR` on all five hosts, on
every Epic logout, permanently.**

I confirmed the cause in Rust source rather than accepting the gate's diagnosis:

- The census arm at `src-tauri/src/main.rs:6341` resolves `app.get_webview_window(label)` and errors
  `humble_login_cookies_for_domain:no-window:{label}` when that fails.
- **This same file already says why that can never succeed for Epic.** The doc comment above
  `clear_default_data_store_cookies_for_domain` states that Epic's login window is *always* the
  pristine, webview-less `WindowBuilder` window, so `app.get_webview_window(label)` "structurally
  can never find it, **for ANY label, fresh or stale**."
- The **clear** path was given a label-independent data-store fallback for precisely this reason.
  The **census** path was not.

The knowledge that would have predicted this defect was already in the same file, in a comment
written for the identical defect one function over. This is a sharper instance of the project's
`review-prescribed-fix-can-carry-the-same-defect` pattern than the deferred item records.

**Downstream consequence that `D-35-29-01` does not spell out.** In `legendary/user.ts`'s CR-04
fatality logic, the `brokenHosts` detector requires `domainVerdict(before) === 'SUPPORTED_NONEMPTY'`
and the non-fatal "genuinely empty" branch requires `'SUPPORTED_BUT_EMPTY'`. With every verdict
pinned at `UNSUPPORTED_OR_ERROR`, **neither is reachable**. Case 1 — the broken-per-host detector,
which is the entire capability `D-35-19-15` asked for — is **dead code on the only path it serves**,
and case 3's non-fatal branch is unreachable too. What survives is exactly the pre-existing bare
zero-sum fatality that existed before `35-23` ran.

The fail-closed property is intact and correct. The new observability is not. **`35-23` added no
working evidence capability to the Epic logout path.**

**Not deferrable.** The item can only close when `D-35-29-01` is fixed or an embedded browser view
returns to seed a non-primary apex. I searched the roadmap: no later milestone phase owns the
embedded store browser's return (Phase 34.4.1 is earlier), so this cannot be moved to a `deferred`
row under Step 9b.

### Qualifications that survive the green gate — preserved, not flattened

These are recorded in the gate's RE-RUN section and are carried forward verbatim in intent:

- **Criterion 10** proves deep-link delivery via the **argv** path only. The LaunchServices
  **AppleEvent** path is unverified on this machine.
- **Criterion 14**'s backend and push halves are positively evidenced (`origin=push`, distinct from
  the boot-time `origin=mount`). The **visible re-render was UNOBSERVED**. A message arriving is not
  proof a surface repainted.
- **Criterion 21** passes its contract (logout real, credentials required) but **`D-35-19-15` is not
  closed**. Criterion 21 tests credential re-entry; `D-35-19-15` asks whether the multi-domain clear
  works. Different questions.
- **`UNMEASURED` is not `FAIL`.** The gate maintains that distinction and so does this report.
- **Verifier-added qualification:** **13 of the 21 criteria were not re-measured.** They carry
  forward verdicts taken on the Aug 30 build; only criteria 4, 5 and 15 guard that carry-forward.
  The gate declares this scope openly, and the un-re-measured criteria are largely static/artifact
  checks — but "21 PASS" is a composite of two builds, not one measurement.
- **Criterion 17** is unchanged: PASS on substance, its "does not throw" clause a
  contract-expectation defect against a 404 endpoint, not a code defect.

### Residual red gate — recorded, not absorbed

`pnpm test` **exits 1**: 3 failures in `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts`
(native-LZMA path resolving `pure-js` under jest). I verified independently that Phase 35 is not the
cause — across the *whole* phase (`e42f9862..HEAD`) its only edits to lzma files are two comment-text
changes. Ledgered at `.planning/todos/pending/2026-08-31-decompresspool-native-lzma-tests-fail-3-of-41.md`.

Truth 17 is scored VERIFIED because this gap's own `reason` and `missing` named the A-17 regression
exclusively and explicitly carved decompressPool and lint out of scope. **But the repo does not have
a green `pnpm test`, and no phase currently owns making it green.**

### New items raised by the re-run — records check

| Item | Recorded? | Verifier note |
| --- | --- | --- |
| `D-35-29-01` — census inert at logout | ✓ `deferred-items.md:2109` | Rigorous: names the cause, the fix direction, and the reason unit tests were blind. **I confirmed it structurally in Rust source and found it is worse than recorded** (see above) |
| `D-35-29-02` — 4 Epic cookies survive logout on the primary domain | ✓ `deferred-items.md:2150` | Correctly holds two competing explanations without asserting either |
| `D-35-29-03` — tray About opens unfocused on a secondary display | ✓ `deferred-items.md:2183` | Recorded |
| Criterion 5 contract defect (`Sink:` names `gamelib-shell.log`, unreachable from `eprintln!` at `main.rs:725`/`:730`) | **✗ NOT ledgered** | Appears only in `35-LIVE-GATE.md`'s RE-RUN body and frontmatter verdict. The other three got `D-` entries; this one did not. **Minor records gap — file it** |
| `D-35-19-15` | ✓ updated | Carries a correct **"RE-RUN 2026-08-31: STILL OPEN. NOT CLOSED"** block naming both dead routes |
| `D-35-11-01` | ✓ updated | Carries **"RESOLVED 2026-08-30, plan 35-26"** |

### Adjudication of the pre-existing `RE-VERIFICATION` section

The `RE-VERIFICATION — plan 35-29` section above, and the `status: resolved` marking on the
REQ-35-20 gap, are **CORRECT**. I checked them adversarially rather than accepting them:

- Each of the four named causes has a real landed fix, read in the codebase — not inferred from a
  SUMMARY. `dispatchSteamLaunch` in particular exists as a **shared module** consumed by both call
  sites (`protocol.ts:163`, `steamFlowRegistration.ts:358`), which is the structural answer to the
  drift that caused criteria 6 and 10 to fail together.
- The packaged artifact postdates every code fix, so the gate is not measuring stale code — the
  single most likely way a green re-run could have been worthless.
- The section correctly declines to re-score the other must-haves and correctly refuses to read
  criterion 21's PASS as closing `D-35-19-15`.

**One thing it understates**, corrected here: `D-35-29-01` is not merely "a defect in this cycle's
own delivered fix." It renders the CR-04 broken-host detector unreachable, which means REQ-35-07 is
no closer to closure than before `35-23` ran.

### Records still lagging

- **`35-REVIEW.md` is still `status: issues_found`** with no resolution annotation on CR-01..CR-04,
  although all four fixes have landed and I verified each in code (`main.rs:1207`/`:1220`;
  `appShellFlowRegistration.ts:202`; `tauriAttach.ts:77`; `Login/components/Runner` +
  `legendary/user.ts`). A records pass, not a decision.
- The criterion 5 contract defect needs a `D-` entry.

### Bottom line

The cutover goal is achieved and the blocking gate is green. **The phase does not close.** One
must-have fails on live evidence that does not exist and cannot currently be produced, two gates
(`pnpm lint`, Windows/Linux smoke) are legitimately owned by Phases 39 and 38, and `pnpm test` is
red on an unowned pre-existing failure. Reporting this as a close would be a partial reported as a
close — which is the failure mode this project cares most about.

**Do not check Phase 35's ROADMAP box.** It is currently unchecked with an accurate in-progress
annotation; that is the correct state.

---

_Re-verified: 2026-08-31_
_Verifier: Claude (gsd-verifier) — independent of the gap-closure cycle_
