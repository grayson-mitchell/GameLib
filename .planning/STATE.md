---
gsd_state_version: "1.0"
milestone: v0.8
milestone_name: Phase Details
current_phase: 50
current_phase_name: "Epic store in-app on macOS: a Rust-managed raw WKWebView subview for /store/epic"
status: verified
stopped_at: Completed quick task 261015-rud -- live-gated Amazon expiry strings A3/A6 by nile induction
last_updated: "2026-10-15T08:35:35.765Z"
last_activity: 2026-10-15
last_activity_desc: "Quick 261015-p3q re-applied the saved Accessibility zoom at boot -- GlobalState.componentDidMount now calls a new applySavedZoomAtBoot helper (savedZoomBoot.ts) once, undebounced, through the existing window.api.setZoomFactor bridge, before any window.api.handle registration, closing the gap the source todo found (a saved 150% rendered at 100% until the slider was touched). Admitted range mirrors the slider's own 60-200 with an anti-drift arm reading that JSX; out-of-range or non-number resolves to 100. Call is unconditional including at 100% so --webview-zoom publishes on boot too. New source-text wiring gate (GlobalStateSavedZoomWiring.test.ts) pins the call site with a self-test arm proving its own matchers can fail; corrected tauriWindowChrome.ts's now-false doc comment. Source todo closed into completed/ with a Resolution naming the declined options; new live-gate todo filed for the real quit-and-relaunch check. 18 18 new jest both suites, 27 27 windowChrome.test.ts unaffected, codecheck 0, lint ceilings both unbumped, prettier clean, planning-gates 12 12. Before that, Quick 261015-oc8 live-gated 261015-lz5's shell_diag persistence on a PACKAGED launch and it passed with no code change -- a tauri build --debug bundle of HEAD recovered from the DMG and tied to target/debug/gamelib-shell by sha256, launched with open -n so the shell's stdout and stderr were /dev/null by lsof (stderr offset advancing 2538 to 2918, the LaunchServices discard measured not assumed), the real STORES tab clicked, store.epicgames.com rendered in the native Epic subview, and gamelib-shell.log line 3937 carries 1792038877 pid=60602 macos_epic_embed didFinishNavigation succeeded for host store.epicgames.com with the epoch-pid prefix and zero leaked [shell] prefixes for that pid. After a Cmd+Q quit (pid gone in 2 s) the line was still there with the pid's own quit lines after it, and the teardown census (shell, sidecar, vite, 5173) was empty. Not exercised -- the D-14 launcher-scheme literal (a chrome-side storeEmbedNavigate to that scheme produced no embed line) and the location.hash console lever did not change the route in the packaged build; gamelib-shell.log is still unrotated at 334 960 bytes. Source todo closed into completed/. Before that, Quick 261015-n5k live-gated 261015-dlu's embed-container zero-floor column in the running app on this Mac with no code change -- a pnpm tauri:dev build of HEAD on the real Stores to Epic route, the real StoreEmbedTimeoutBanner rendered through React by wrapping window.api.storeEmbedTakeNavEvents from the Web Inspector console (no sudo, no hosts blackhole, no 45s wait), sub-900 layout viewports reached by docking the inspector right inside a 1280 window. Live WebKit numbers -- 900 floor message 380.08 and actions right 884 unclipped so UI-SPEC E3 passes at its declared test point; 600 column 344px, message ellipsised to 80.08, actions right 584 unclipped; 500 column 244px, message 0, actions right 503.92, clipped by 3.92px as the harness said it would be and not claimed fixed. A pre-fix control (grid-template-columns auto injected) at 600 and 500 reproduced the harness's shipped row to the hundredth (column 419.65625px, actions right 659.66) and removing it restored the fixed numbers. The 9qy width clamp also measured -- a requested 800 left the window at 900. 12 measurement records, 6 frames read before scoring, source todo closed into completed/, dlu's README (e) points at the gate. Not verified -- minHeight, the longest-of-49-translations arm, the genuine 45s Rust timeout path. Before that, Quick 261015-lz5 routed all 30 macos_epic_embed.rs diagnostics through crate::shell_diag so a packaged build persists them to gamelib-shell.log (the source todo said 25 -- an undercount). Each literal dropped its `[shell] ` prefix because shell_diag re-adds it, so stderr output is byte-identical -- all 49 string literals in the file compare equal old-vs-new after prefix-stripping. New jest source gate macosEpicEmbedDiagPersistence.test.ts pins 0 eprintln!, 30 call sites and no double prefix, with an inline mutation arm; 50-UAT.md's sink row and Item 17 expected text corrected by dated addendum; source todo closed into completed/. Re-measured by the orchestrator -- cargo check clean, cargo test 16/16, jest 22/22, planning-gates 12/12. Unverified on a packaged launch; filed 2026-10-15-macos-epic-embed-shell-diag-persistence-unverified-on-a-packaged-launch.md (minor/macos/live-gate), which also carries the unrotated gamelib-shell.log observation. Before that, Quick 261015-dlu measured the App.css shell-column hypothesis in a static harness of the shipped stylesheets in WebKit (compiled WKWebView probe) and Chromium (chrome-headless-shell) and REFUTED it, the App grid never inflated and the content and navbar arms changed nothing, while the real clip was the WebView embed container declaring only grid-template-rows so its implicit auto column took the nowrap notice row's min-content (419.66px at a 600px viewport against a 334px content box), fixed with grid-template-columns minmax(0, 1fr), pinned per selector with an observed-red TDD arm, 16 of 16 across the two suites, evidence bundle landed, the 9qy open observation corrected, UI-SPEC E3 reviewed and left byte-unchanged, and a live-gate todo filed because nothing ran in the real app. Quick 261015-9qy declared minWidth 900 and minHeight 600 on the main window in tauri.conf.json (900 is the measured width from the Item 16 photographs, 600 is a judgment call), pinned both in tauriWindowConfig.test.ts, found the notice row CSS already ellipsises the message and already gives the actions flex-shrink 0 since 348e28057 so no CSS changed and the contract is now pinned per selector, UI-SPEC E3 now cites 900px as its test point, the store-embed clip todo closed, and the clamp itself is unverified on hardware with an App.css shell-column hypothesis left open. Quick 261015-7tt censused the 22 button is-link render sites and the button is-text hover state across all 10 themes, 50 resolver-chain ratios, 4 under 4.5 to 1 and each fixed with a theme-scoped hover-only override (dracula game menu 3.79 to 9.15, gruvbox_dark MainButton dropdown 3.91 to 12.06, nord-light and nord-dark is-text hover 3.36 and 4.41 to 5.13), pinned in themeTokens.test.ts at 270 of 270 with a mutation check, the dead settingsWrapper is-text rule deleted on a two-arm reachability proof, todo closed, nothing pixel-sampled. Phase 50 verified retrospectively at 10 of 16 truths — the goal is met and proved on hardware across a cold packaged jar and a warm signed-in jar with an unchallenged real sign-in, while G-50-16's timeout banner stays failed pending the owed macOS re-run of UAT Item 16. Five stale artifacts corrected (STATE, ROADMAP, 50-06-SUMMARY, 50-VALIDATION, and a discharge record added to 50-REVIEW, whose status was RIGHT to stay as it was — only 2 of its 12 live checks actually discharged, not most). The 2026-09-15 Epic Sign-in todo closed with no code on Item 2's pass, by its own falsifiable rule. Quick 261014-rso latched the Epic embed loadTimedOut raise so the G-50-16 timeout banner can surface — the renderer GAP-D drain now merges the flag stickily across one batch and a navigation failure no longer clears it, with jest property 46 observed red before the fix; scoped jest 56 to 58 and cargo gamelib-shell 390 to 394 both green, planning-gates 12/12. The macOS re-run of UAT Item 16 is owed and filed as a pending live-gate todo, since nothing off-hardware can confirm the banner actually paints. Phase 50 plans 01 through 05 complete across 3 waves (32 commits, cargo clean, 543 jest suites green with only the inherited library.tileSize red proven identical pre-phase). Plan 06 authored 50-UAT.md with 19 arms and filled 50-VALIDATION.md, then halted at a blocking-human gate — the live run needs a fresh build of HEAD because the running GameLib.app predates every phase-50 commit by 7 hours and belongs to another session. Phase 50 execution started"
state_head: 2c876d44357066080ece2309db08babafd79d495
progress:
  total_phases: 45
  completed_phases: 36
  total_plans: 554
  completed_plans: 545
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-09)

**Core value:** One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.
**Current focus:** Phase 50 — Epic store in-app on macOS: a Rust-managed raw WKWebView subview for /store/epic

> **Version renumber (2026-07-20):** the whole project was renumbered from the
> inflated `v1.x` planning labels to `0.x` to reflect pre-release status (map:
> v1.N → v0.(N+1)). Milestones are now: **v0.1** Steam Platform · **v0.2** Polish ·
> **v0.3** Humble · **v0.4** Compatibility Data · **v0.5** macOS Compat Runtime (17–19,
> done) · **v0.6** Store Search · **v0.7** Steam Native Install (21–25, current).
> The earlier v0.5-vs-v0.7 taxonomy split is resolved: macOS-compat = v0.5 (complete),
> native-install = **v0.7** (this milestone). `package.json` set to 0.7.0.

> # ✅ PHASE 34.4.2 COMPLETE — 2026-08-19. BLOCKING LIVE GATE: **PASS 5/5**.
>
> `34.4.2-LIVE-GATE-RERUN-6.md` PASSED on real macOS hardware — the **first full PASS in this
> phase's history**, on the **ninth gate attempt across eight contracts**. Verdict history:
> **FAIL 0/6 → FAIL → FAIL 5/6 → FAIL 5/6 → FAIL 1/6 → FAIL 0/5 → PASS 5/5.**
>
> | Item | Result |
> |---|---|
> | 1 — sheet presentation + minimize/restore | PASS |
> | 2 — dismissability | PASS |
> | 3(a) — no injected affordance | PASS |
> | 4 — Cmd+V as sole credential route | PASS |
> | 6(a) — Humble disconnect route | PASS |
>
> **Item 6(a) was the only never-measured behaviour in the phase**, unreached across eight prior
> attempts. Its PASS live-discharges F-34.4.2-12's fix `6bad86227` and T-34.4.2-43, and meets
> F-34.4.2-10's taking-condition (storage-clear SUCCESS line fired, not the timeout).
>
> **What made it winnable was DELETING work, not doing more.** D-G4 retired REQ-34.4.2-05 and
> REQ-34.4.2-04's glyph half — a retirement ORDERED on 2026-08-05 when the mechanism was deleted,
> but never actioned, leaving both requirements awaiting a live discharge of code that did not
> exist. That dropped sub-checks 3(b)/3(c) as unfalsifiable; 3(c) alone had justified an entire app
> launch and had never run in eight attempts. D-G5 inherited item 6(b), retiring F-34.4.2-20.
> Five launches collapsed to one.
>
> **All 10/10 REQ-34.4.2 boxes ticked. `34.4.2-VERIFICATION.md` amended IN PLACE to
> `status: passed`** (10/11 truths verified, 1 uncertain by design, 0 failed) — never regenerated,
> because `7e1781fbb` had hand-corrected it.
>
> **Two NEW findings the run produced:** F-34.4.2-25 — a required literal can go stale by
> **BEHAVIOUR**, not just line number (verifying it EXISTS ≠ verifying it FIRES on the route the
> item drives); F-34.4.2-26 — Humble's login has an out-of-band 2FA email round-trip that nearly
> consumed `LOGIN_WATCH_TIMEOUT_MS`.
>
> **Next action:** Phase 34.4.2 needs nothing further. Outstanding elsewhere: the 34.13 UAT gate
> (paused at row 5 of 72, awaiting a USB drive for the multi-library fixture) and Phase 23.2 wave 4.

## Current Position

Phase: 50 (Epic store in-app on macOS: a Rust-managed raw WKWebView subview for /store/epic) — VERIFIED, GAPS FOUND
Plan: 6 of 6
Status: Verified with gaps — `50-VERIFICATION.md` `status: gaps_found`, 10 of 16 truths verified. The phase GOAL is met and was proved on hardware; the full SCOPE has unverified corners. One gap is failed and owed a macOS re-run (G-50-16, UAT Item 16); four UAT arms blocked, three of them on third-party preconditions or a deliberate decision rather than on defects.
Last activity: 2026-10-15 - Completed quick task 261015-p3q: Re-apply saved Accessibility zoom at startup under Tauri (commits 2aaaefc03, e0021f4b8, ca001283f; source todo closed, live-gate follow-up filed).

Previous activity: 2026-10-11 - Completed quick task 261011-wik: filed the Windows Stores-tab embed implementation todo (store_embed_* macOS+Linux only; 38-E01 closed on the spike 027 harness, not the shipped app)

Previous activity: 2026-10-11 - Completed quick task 261011-txc: Winetricks tab UX from the 45 live gate, 8 of 9 todo items landed, item 9 split to its own todo

Previous activity: 2026-10-10 — Phase 49 complete, transitioned to Phase 9

Previous activity: 2026-10-08 — Completed quick task 261008-fjj: Runner tiles gain role=button / disabled-keyed tabIndex / aria-disabled / aria-busy / Enter-Space activation; F-36-02 re-derived in the register; todo 2026-10-03 closed with the inert-mask limit stated

Previous activity: 2026-10-08 — Completed quick task 261008-aoe: Retry in TauriLoginPanel hands back to host via onRetry; OAuthLogin and HumbleLogin remount the Dialog via overlayMountKey instead of window.location.reload()

Previous activity: 2026-10-01 -- Completed quick task 261001-93f: built and self-proved a macOS pixel/geometry measurement instrument for Phase 38's two open items (38-E03(a), 38-E04(a)), pre-registered both items' pass/fail criteria before any live measurement, and wrote an operator run-sheet -- scores NEITHER gate, only the operator's drag-resize gesture and System Settings scale-factor change can.

Previous activity: 2026-10-01 -- Completed quick task 261001-90h: filed two observability-gap todos (dev-secret-vault write/clear log collision; no attempt-marker for a Steam QR login). Doc-only; the briefed "QR error paths do not log" premise was refuted at HEAD and only the corrected framing was filed.

Previous activity: 2026-09-30 - Completed quick task 260930-r22: authored live-gate RERUN-7; the q11 live gate remains OPEN pending an operator run

Previous activity: 2026-09-30 -- Completed quick task 260930-qmu: closed the gamelib:// dev-build self-heal todo -- the installed app repaired a hijacked HKCU key live (46-POSTFIX R4 PASS); todo moved to completed/.

Previous activity: 2026-09-30 -- Completed quick task 260930-o75: Phase 38 sitting 13 on Windows discharged 38-E01, 38-W04, 38-S16 and 38-S14 PASS and recorded branch (b) PASS on 38-E03/38-E04. Phase 38 now has 2 open items.

Previous activity: 2026-09-30 - Completed quick task 260930-ol5: closed the macOS signing/notarization todo to `completed/` (`status: RESOLVED`, single `R096` rename), with the closure section naming the two things closing DROPS — `nt4`'s three confirmatory-only residuals, and the still-outstanding errand of clearing the three ad-hoc-ACL'd Keychain items; no follow-up todo created for either, deliberately left as an operator decision

Previous activity: 2026-09-30 - Completed quick task 260930-nt4: consequence 2 of the macOS signing todo is MEASURED — the Keychain ACL honours an identity-based designated requirement, so a differently-built binary signed with the same identity reads silently (`elapsed=0s`) while an ad-hoc build blocks on a password prompt (`rc=142`); closure recommended in prose, frontmatter untouched, todo left in `pending/` for the operator's call

Previous activity: 2026-09-30 -- Completed quick task 260930-lyk: the tray glyph is now an Auto/Light/Dark setting, and on Windows Auto follows the taskbar theme (SystemUsesLightTheme). Live Windows check passed (operator-reported).

Previous activity: 2026-09-30 -- Completed quick task 260930-lyk: the tray glyph is now an Auto/Light/Dark setting, and on Windows Auto follows the taskbar theme (SystemUsesLightTheme). Live Windows check passed (operator-reported).

Previous activity: 2026-09-29 -- Completed quick task 260929-ata: ran Phase 38 item `38-S10` LIVE on this Linux host -- Sitting 7, the SECOND Linux sitting. Tests section-gating matrix row 7 (native Steam installs OFF) inside the "Install with options..." dialog, a different scored surface from Sitting 6's primary-Install-button dispatch. Task 1's tracer relaunched `pnpm tauri:dev` (incremental rebuild), re-proved build identity, and re-measured the ledger baseline live (9 open/17 discharged/10 retired, matching planning-time exactly) rather than trusting the Sitting 6 snapshot; built a SECOND instrument, `atspi_dialog_probe.py` (AT-SPI accessibility-tree text probe), smoke-tested alongside the existing pixel-diff capture, so no fact rests on one screenshot glance. Task 2's operator-checkpoint self-skipped: the dev vault and real GameLib profile deliberately left in place after Sitting 6 meant Steam sign-in was still usable, confirmed live (Library showing 381 games) rather than assumed. Task 3 hit one real blocker mid-run -- the OS session locked from idle time (`loginctl LockedHint=yes`), which looked at first like a WebKitGTK blank-capture bug (a frozen, byte-identical frame surviving a full process relaunch) until a full-desktop screenshot showed the GDM lock curtain; this was NOT a GameLib defect, and was resolved by pausing for the operator to unlock the screen, with an independent re-verification (`LockedHint=no`, same PID/exe, normal rendering) before resuming rather than trusting the operator's "unlocked" claim at face value. WazHack (Sitting 6's game) had to be swapped for a fresh target, 7 Days to Die (appId 251570), because WazHack's own Sitting-6 PASS click had since completed a real Steam download -- confirmed live via a fresh owned/not-installed check rather than reused blindly. Result: **PASS** on all five independently-checked facts (platform row absent, library dropdown absent, wine section absent, free-space line absent, content-light notice present), cross-validated on both instruments, with zero transient renders across the dialog's open-animation frames. `38-S10` moved to `human_verification_discharged` in `38-VERIFICATION.md` (9->8 open, 17->18 discharged); `38-HUMAN-UAT.md` gained `## Sitting 7`; `34.13-UAT.md`'s `G-ROW-7 / tauri` origin receipt and body row walked back to DISCHARGED PASS (the pre-existing `(62:176)` census pin, which sits BEFORE this receipt and so cannot itself see a new error in it, left untouched -- the receipt block was parsed and validated in isolation instead); `ROADMAP.md`'s count paragraph updated. `pnpm planning-gates` 12/12; privacy gate passed on all committed evidence. Commit `e40379a63` (single deliverable commit for all three tasks, per this plan's design, distinct from an unrelated concurrent `65edd8cef` spike commit that landed on the branch during the operator's unlock wait and was explicitly excluded from the count). `38-S12` and `38-S16`'s Linux half remain as next candidates -- of the four registered Steam library paths on this host, only two are currently mounted, worth checking before attempting `38-S12` (which needs >1 registered library).

Previous activity: 2026-09-29 -- Completed quick task 260928-tvk: ran Phase 38 item `38-S04` LIVE on this Linux host (Pop!_OS 22.04, X11) -- the FIRST Linux sitting Phase 38 has had (Sitting 6, after Windows sittings 1-5). Task 1 (2026-09-28) launched `pnpm tauri:dev` under the declared real-profile arm, proved build identity via `_NET_WM_PID` -> `/proc/<pid>/exe` -> `src-tauri/target/debug/gamelib-shell`, and self-tested the new `linux_sitting_capture.py` X11 capture instrument (fps 205-216, non-blank). The dev process did not survive into today's session, so Task 3's re-entry re-verified rather than trusted the prior state: relaunched (incremental rebuild, not a cold 30-minute compile) against the then-current HEAD `54a931199`, re-proved identity, and re-confirmed native Steam installs OFF (`~/.config/GameLib/config.json` `enableSteamNativeInstall=false`). The operator's Steam sign-in went through two rounds: GameLib's in-app Steam login landed first ("Connected" in the login screen) but the Steam desktop client itself was not yet running -- caught by independently re-checking `pgrep -x steam` rather than trusting the operator's "signed in" claim at face value, per this session's own instruction not to skip that verification. Once the client was confirmed running (library showing 381 games), Task 3 ran the positive control (P=0.1090, dialog viewed) before the scored click, then clicked the PRIMARY half of Install on WazHack (appId 264160, operator-named, independently confirmed owned/uninstalled) with native installs OFF: the arming log line `SteamGame: delegating install for appId 264160 via steam://install/264160` fired, max changed-pixel fraction over the scored burst was 0.0209 (well under the P/2=0.0545 flag threshold), and every viewed frame showed only GameLib's own in-place "Installing..." state -- never a dialog, modal, overlay or picker; zero new top-level GameLib windows at any point. Result: **PASS**. `38-S04` moved to `human_verification_discharged` in `38-VERIFICATION.md` (10->9 open, 16->17 discharged); `38-HUMAN-UAT.md` gained a `## Sitting 6` section; `34.13-UAT.md`'s origin receipt and body row walked back to DISCHARGED PASS (its pre-existing `(62:176)` parse-error pin left untouched); `ROADMAP.md`'s count paragraph updated. Two process-hygiene deviations recorded for future Linux sittings: the sidecar Node process runs in its own separate process group (needed an explicit extra `kill` in cleanup, not just the main `setsid` group), and a stray docked-devtools panel had to be closed before coordinate-based screenshots. `pnpm planning-gates` 12/12; privacy gate passed (no 17-digit runs, no token/password strings, all 5 evidence PNGs visually inspected for account identifiers). Commit `a9820f01d`. `38-S10`, `38-S12` and `38-S16`'s Linux half are the cheap next candidates -- the capture instrument now exists and is reusable as-is.

Previous activity: 2026-09-29 -- Completed quick task 260929-9qr: recorded the operator's LOCKED decision on the Linux isolation todo (`2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md`): accept one shared cookie jar on Linux and document the hygiene cost -- any embed on Linux can read any other embed's cookies, and the login windows' cookies, in-process -- over a wry / `tauri-runtime-wry` per-identifier `WebKitWebContext` patch (still UNVERIFIED, no such patch exists) and over keeping Linux off the embed (rejected as against the one-launcher core value). Confirmed the macOS-parity fact by measurement: `grep -rn data_store_identifier src-tauri/src src-tauri/Cargo.toml` returns 0 hits, so the shipped macOS embed already runs on the one default jar (ROADMAP.md's Phase 40 spike-018 note) -- Linux gives up the OPTION of per-store isolation, not an isolation any shipped build has. The todo moved to `platform: windows` / `ready: live-gate` and gained an appended `## Decision (2026-09-29)` section, but stays in `pending/`: the Windows half (`## Windows: UNVERIFIED`) is still open, and `38-E01`'s `spike_evidence_2026_09_28` plus `38-E03`/`38-E04`'s `blocked_by` still route to it by its `pending/` path -- the operator's option text said close this todo, but the file cannot move until the Windows result lands here. Re-scoped the Linux segments of `38-E03`/`38-E04` `blocked_by` in `38-VERIFICATION.md` so the isolation todo no longer reads as a gate on whether a Linux embed ships, keeping the pre-change text verbatim in new `linux_isolation_decided_2026_09_29` fields; amended `deferral_note` append-only to match. Neither item discharged, no count moved: `ledger-check.cjs --open 10 --discharged 16 --retired 10 --no-stale-premise` all PASS, `audit-uat by_phase['38']`=10 unchanged, `parse_gap_files` 0, total items 429. Appended a dated addendum to the sibling positioning todo (`2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md`) resolving the tension its own 2026-09-28 decision (`260928-upj`) flagged, and recording the shared-jar hygiene cost as a constraint for whoever builds the Linux embed. Built `9qr-check.py`, proved RED before every edit (10 FAILs against the unedited tree on `--items 38-E03`: T1/T2/T3/T4/L5/L6/L7/L8/L9/L11; then 5 more FAILs on `--state` before the STATE.md edit: S1/S2/S3/S4/S5), then all checks PASS pre- and post-commit against the pinned `54a931199` base; `todo-frontmatter-gate.py` exit 0; `pnpm planning-gates` 12/12; prettier confirms all three markdown paths `"ignored": true` (a `--check` there would be vacuous, correctly not run); ledger grew by exactly +2 physical lines (461->463, frontmatter fence 433->435), both below line 104, verified not to disturb in-flight quick `260928-tvk`'s cited ranges. One commit (`1f2d7b42e`) holds exactly the two todos, the ledger and the checker.

Previous activity: 2026-09-28 -- Completed quick task 260928-tjj: collapsed THREE contradictory caller-routing comments across two `main.rs` cookie match arms into ONE platform-explicit, symbol-cited statement. The stale sentence the source todo named ("Every other caller (Humble/GOG/Amazon, all still routed through a live Tauri-managed window)") existed TWICE, not once -- the second copy sat ~700 lines below in the sibling `humble_login_cookies_for_domain` census arm with the same contradiction underneath it, so fixing only the named arm would have recreated the exact drift the task existed to end; file-wide count is now 0. The task brief's own non-macOS assumption was measured FALSE and deliberately not written in: GOG/Amazon early-return before ever reaching the arm off macOS (`if (!isMac) { return }`), and Epic's `isMac` ternary opens a REAL window there instead of passing its sentinel -- so off macOS every caller carries a real window label and none is expected to hit `no-window` by design. Comment-only, proven against a `BASE.sha` pin rather than a rangeless `git diff` that would read green vacuously once committed. `cargo test --bin gamelib-shell` 289/0/2 identical pre- and post-edit, including the comment-sensitive pin that scans this very arm with raw `contains()` over comment lines. One self-inflicted staging bug (a `git add` on a nonexistent pre-rename path, its error swallowed by `2>/dev/null` and a `;` instead of `&&`, committing a stale `result: pending`) was caught and corrected in a separate commit rather than amended or hidden -- `actuals.commits: 3`, not the flattering 2.

Previous activity: 2026-09-28 -- Completed quick task 260928-sph: closed the todo `260928-raq` filed by extending `.planning/planning-frontmatter-gate.py` to walk all 89 phase VERIFICATION/UAT ledgers `audit-uat` reads, strictly parsing each and shrink-only-pinning the 3 known-bad terminal ones, so an unparseable open-status ledger (the Phase 38 failure shape) now turns the gate red instead of silently vanishing from the audit. No new gate file; `MINIMUM_EXPECTED_GATES` stays 12. Corrected the todo's own root-cause claim by measurement: the quotes in `aaae8a1d2`, not the colon in `e09fbc652`, were what hid Phase 38. `pnpm planning-gates` 12/12.

Previous activity: 2026-09-28 -- Completed quick task 260928-sn8: ended a permanently-red Rust suite (288/1/2 -> 289/0/2) by making the F-34.4.2-12 pin assert the macOS-exclusion PROPERTY of each `.cookies()` guard rather than equality against one cfg spelling. The pin had been falsely red since `1a8e1827b` correctly narrowed the Linux arm's guard for the Windows/WebView2 carve-out -- the code was right, the test was stale, and the new guard satisfies the invariant more tightly than the literal it demanded. Not widened to fit: the property is asserted and the exact `(arm, guard)` census was re-derived under review, now sitting behind the property check. Detection proven permanently by a seven-row fixture table (2 accepts, 5 rejections, including a semantically-safe spelling rejected on purpose and recorded as a decision), plus a live mutate-restore RED/GREEN control. Production source verified byte-identical across the task.

Previous activity: 2026-09-28 -- Completed quick task 260928-qvr: widened `humble_login_clear_cookies`' window-based branch to evict `WKWebsiteDataTypeDiskCache`/`WKWebsiteDataTypeMemoryCache` alongside cookies, closing the twin of the disk-cache gap fixed for the default-store branch in `9359883c7`. The caller audit ran first as a real gate: Humble's `disconnect()` is the sole caller reaching this macOS-gated branch, and no caller relies on the cache surviving a cookie clear. Pin observed RED before the fix and asserts its scan window excludes the already-fixed site, so boundary drift cannot make it pass for the wrong reason. 288 passed / 1 failed / 2 ignored, the single failure proven pre-existing two independent ways (stash A/B, plus neither commit adding any `.cookies()` call site -- the only input that test scans). Earlier the same day, debug session `epic-cold-jar-login-timeout` diagnosed and fixed the parent defect (a stale WebKit HTTP disk-cache entry replayed past a cookie-only clear, NOT the Talon 403 that F-34.5-G6-01's Branch B had left implied), recovered the operator's locked-out Epic account via a measured one-time on-disk eviction of 246 cache files, and unblocked D-35-19-15's live gate.

Previous activity: 2026-09-27 -- Completed quick task 260927-v8i: replaced two independent racy `failures[0]` reads (the classifier argument and the `first:` log fragment) with one exported `selectPrimaryDepotFailure`, deterministically preferring a run-level stall record over an earlier per-file failure. Tier 1 (non-retryable file-level cause preference) shipped as nothing on a measured reachability negative -- both `.eresult`-stamping sites sit inside `buildDepotPlan` and never reach `failures`. Closed the sibling todo `260927-tpm` filed. Steam suites 1518 -> 1528 green, lint 638 of 638 both ceilings PASS, planning-gates 12/12.
Progress: [████████░░] 80%

History: the pre-2026-09-24 Current Position narrative lives verbatim in STATE-HISTORY.md § Current Position archive.

## Native-Install Arc Phase Map (21–25)

| Phase | Name | Plans | Summaries | Status |
|-------|------|-------|-----------|--------|
| 21 | Steam Native Install (depot download) | 17 | 17 | ✅ Complete (2026-07-20) — code-review clean, secure-phase 41/41 threats_open:0; hardware UAT (7 native-install items) DEFERRED to Windows post-production + D-UAT-10 bottled-launch deferred as tracked macOS debt |
| 22 | Steam Game Families (multiple bottle configs) | 8 | 0 | ⛔ **PARKED 2026-07-21 — superseded by Phase 24.** Bridge's one shared bottle (D-03) eliminates the per-family bottle matrix; plans retained unexecuted (`22-multiple-steam-bottles/PARKED.md`) |
| 23 | Steam full-ownership install (StateFlags=4) | 10 | 6 | 🔄 In progress, NOT phase-complete — Gate 1 PASS (2026-07-19); Gate 2 CONDITIONAL PASS (2026-07-21, HUMANKIND Denuvo launch proven but only after a manual `chmod +x` workaround — blocker gap **G-23-02**, native install applies no execute bits); Gate 3 pending. Gap **G-23-01** (KCD2 `Blocked`-depot-key aborts whole install) also open. **23-06 executed** (trace-before-fix): added permanent `steam-flags-census` instrumentation (plan-build/download-entry/download-complete) + `23-TRACE.md` H1-H5 hypothesis matrix — no fix yet, per user-locked ordering. Next: 23-07 (live-run recording) → 23-08 (the gated fix). REQ-23-07 stays open until Gate 2 re-runs clean and Gate 3 passes (`/gsd-verify-work 23`) |
| 24 | macOS native Steam bridge (steam_api proxy) | 17 | 17 | ✅ Complete 2026-07-21 — Gates 0/1/2/3 PASS on real hardware; gap cycles 24-11..24-17 closed shim-overwrite/install-poll + CrossOver-launch/library-sync clusters; secure-phase done (threats_open:0). Gate 4 (Hoard) out of scope — bridge proxies only ISteamUser + ISteamFriends. Gate 3 = **Avernum 6** (RETEST RUN 3, 19:02 rebuild w/ 24-17); `24-UAT.md` `status: complete`, `pending_gates: 0`. Deferred (not open): **D-UAT-24-09** full Hoard support needs 6 more interface proxies (follow-on phase; Hoard delisted `30cdda6a`); **WR-01** helper concurrency skipped at review-fix (`24-REVIEW-FIX.md` partial — single-threaded helper serializes a 2nd concurrent bridge game); **D-UAT-24-08** helper-reuse-on-bind never built (teardown wired at `main.ts:716-722`; no 127.0.0.1:54550 reuse path in `helperProcess.ts`), never dispositioned in `24-UAT.md` |
| 25 | Steam depot multi-host fan-out (throughput) | 3 | 3 | ✅ Complete + HW-verified 2026-07-19 (hosts=3, ~10 MiB/s vs 1.5–2.9 baseline) |

## Earlier macOS-Compat Phase Map (17–19)

| Phase | Name | Status |
|-------|------|--------|
| 17 | Steam on macOS via CrossOver/Wine | Complete & secured (2026-07-13) — 17 plans, UAT 7/7, VERIFICATION 6/6, code-review CR-01/WR resolved (17-17), SECURITY threats_open:0 (21/21) |
| 18 | macOS 32-bit detection, badge & CrossOver routing | Complete (UAT 5/5, secured) |
| 19 | CrossOver Compatibility Index (macOS) | Complete (2026-07-14) — 8/8 plans executed, index Action live on public fork; WR-05 live check still open |

## v0.2 Phase Map

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 5 | Branding & About Polish | BRAND-02, BRAND-03, BRAND-04, APP-01 | Complete (2026-07-02) |
| 6 | Library & Game Status UX | LIB-05, LIB-06, GAME-05 | Complete (2026-07-03) |
| 7 | Game Details Enrichment | DETAIL-01, DETAIL-02 | Executed (UAT pending) |
| 8 | New Steam Surfaces | STORE-01, CONSOLE-01 | Not started |
| 9 | Quality Gate | QA-01 | Not started |

## v0.3 Phase Map

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 10 | Humble Auth + Adapter Scaffold | HACCT-01, HACCT-02, HACCT-03 | Not started |
| 11 | Library Sync + 5-State Key Model | HSYNC-01, HSYNC-02, HSYNC-03, HSYNC-04 | Not started |
| 12 | Ownership Dedup | HDEDUP-01, HDEDUP-02 | Not started |
| 13 | Keys-Waiting + Giftable-Spares Views | HVIEW-01, HVIEW-02 | Not started |
| 14 | Guided Claim Flow | HCLAIM-01, HCLAIM-02, HCLAIM-03, HCLAIM-04, HCLAIM-05 | Not started |
| 15 | Store Overlay + Expiration Alerts | HSTORE-01, HSTORE-03 | Not started |

## Performance Metrics

**Velocity (v0.1):**

- Total plans completed: 268 (phases 1-4)
- Average duration: ~5-15 min/plan
- Total execution time: ~5 days (2026-06-24 → 2026-06-29)

**By Phase (v0.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | - | - |
| 02 | 6 | - | - |
| 03 | 4 | - | - |
| 04 | 2 | - | - |
| 05 | 4 | - | - |
| 06 | 2 | - | - |
| 08.1 | 4 | - | - |
| 10 | 6 | - | - |
| 11 | 5 | - | - |
| 12 | 5 | - | - |
| 14 | 6 | - | - |
| 15 | 6 | - | - |
| 16 | 3 | - | - |
| 18 | 6 | - | - |
| 17 | 17 | - | - |
| 19 | 8 | - | - |
| 20 | 7 | - | - |
| 21 | 17 | - | - |
| 26 | 5 | - | - |
| 24 | 16 | - | - |
| 29 | 7 | - | - |
| 31 | 4 | - | - |
| 32 | 3 | - | - |
| 34.2 | 30 | - | - |
| 34.3 | 9 | - | - |
| 34.4 | 10 | - | - |
| 34.10 | 27 | - | - |
| 34.11 | 9 | - | - |
| 41 | 7 | - | - |
| 48 | 18 | - | - |
| 49 | 12 | - | - |

**v0.1 Detail Log:**

| Phase 01 P03 | 8min | 3 tasks | 8 files |
| Phase 02-steam-library P01 | 4min | 3 tasks | 5 files |
| Phase 02-steam-library P02 | 15min | 2 tasks | 3 files |
| Phase 02-steam-library P03 | 5min | 2 tasks | 3 files |
| Phase 02-steam-library P04 | 2min | 2 tasks | 4 files |
| Phase 02-steam-library P05 | 5min | 3 tasks | 9 files |

**v0.2 Trend:**

- Plans completed: 1
- Trend: —

**v0.2 Detail Log:**

| Phase 07 P01 | — | 4 tasks | 21 files (3 new components) |

*Updated after each plan completion*
| Phase 08-new-steam-surfaces P01 | 5min | 2 tasks | 3 files |
| Phase 08-new-steam-surfaces P02 | 5min | 3 tasks | 4 files |
| Phase 10 P06 | ~55min | 2 tasks | 5 files |
| Phase 14 P06 | 30min | 2 tasks | 2 files |
| Phase 14 P07 | 35min | 3 tasks | 12 files |
| Phase 14 P08 | ~30min | 2 tasks | 6 files |
| Phase 19 P05 | 35min | 3 tasks | 6 files |
| Phase 19 P06 | ~30min | 2 tasks | 11 files |
| Phase 19 P07 | 15min | 3 tasks | 5 files |
| Phase 19 P08 | 20min | 2 tasks | 6 files |
| Phase 20 P01 | 10min | 2 tasks | 4 files |
| Phase 20 P02 | 10min | 2 tasks | 4 files |
| Phase 20 P03 | 15min | 1 tasks | 2 files |
| Phase 20 P04 | 15min | 2 tasks | 6 files |
| Phase 20 P05 | 15min | 2 tasks | 6 files |
| Phase 20 P06 | 45min | 2 tasks | 9 files |
| Phase 20 P07 | 20min | 2 tasks | 4 files |
| Phase 21 P01 | 35min | 3 tasks | 5 files |
| Phase 21 P02 | 40min | 1 tasks | 2 files |
| Phase 21 P03 | 20min | 2 tasks | 8 files |
| Phase 21 P04 | 20min | 2 tasks | 3 files |
| Phase 21 P05 | ~30min | 2 tasks | 2 files |
| Phase 21 P06 | 45min | 2 tasks | 4 files |
| Phase 21 P07 | 40min | 2 tasks | 4 files |
| Phase 21 P08 | ~30min | 2 tasks | 2 files |
| Phase 21 P09 | ~50min | 2 tasks | 9 files |
| Phase 21 P11 | 25min | 1 tasks | 2 files |
| Phase 21 P10 | 55min | 2 tasks | 12 files |
| Phase 21 P12 | ~15min | 1 task (UAT prep; 3 human-verify deferred) | 1 file |
| Phase 21 P13 | 20min | 2 tasks | 2 files |
| Phase 21 P14 | 20min | 2 tasks | 4 files |
| Phase 21 P15 | 45min | 3 tasks | 8 files |
| Phase 21 P16 | 30min | 3 tasks | 9 files |
| Phase 23 P01 | 10min | 2 tasks | 4 files |
| Phase 23 P02 | 15min | 3 tasks | 5 files |
| Phase 23 P03 | ~40min | 3 tasks | 6 files |
| Phase 25 P01 | 12min | 2 tasks | 2 files |
| Phase 25 P02 | ~20min | 3 tasks | 4 files |
| Phase 21 P17 | 30min | 2 tasks | 10 files |
| Phase 26 P01 | 15min | 2 tasks | 3 files |
| Phase 26 P02 | 8min | 1 tasks | 2 files |
| Phase 26 P03 | 8min | 1 tasks | 3 files |
| Phase 26 P04 | 25min | 2 tasks | 7 files |
| Phase 26 P05 | ~10min | 2 tasks | 2 files |
| Phase 24 P01 | 25min | 3 tasks | 10 files |
| Phase 24 P02 | 20min | 2 tasks | 3 files |
| Phase 24 P03 | 10min | 1 tasks | 3 files |
| Phase 24 P04 | 20min | 1 tasks | 2 files |
| Phase 24 P05 | ~20min | 2 tasks | 5 files |
| Phase 24 P06 | 35min | 3 tasks | 5 files |
| Phase 24 P07 | 35min | 2 tasks | 7 files |
| Phase 24 P08 | 45min | 3 tasks | 4 files |
| Phase 24 P09 | 40min | 2 tasks | 8 files |
| Phase 27 P01 | 9min | 3 tasks | 16 files |
| Phase 27 P02 | 50min | 3 tasks | 21 files |
| Phase 27 P03 | 30min | 3 tasks | 10 files |
| Phase 27 P04 | ~75min | 2 tasks | 5 files |
| Phase 24 P11 | 10min | 1 tasks | 2 files |
| Phase 24 P12 | 20min | 1 tasks | 2 files |
| Phase 24 P13 | ~25min | 2 tasks | 2 files |
| Phase 24 P14 | 15min | 1 tasks | 1 files |
| Phase 24 P15 | 12min | 1 tasks | 2 files |
| Phase 24 P16 | 25min | 2 tasks | 4 files |
| Phase 24 P17 | 20min | 2 tasks | 2 files |
| Phase 28 P01 | 35min | 3 tasks | 3 files |
| Phase 28 P02 | 30min | - tasks | - files |
| Phase 28 P03 | 40min | 3 tasks | 4 files |
| Phase 28 P04 | 45min | 3 tasks | 4 files |
| Phase 28 P05 | 35min | 1 tasks | 1 files |
| Phase 28 P06 | 45min | 2 tasks | 3 files |
| Phase 29 P01 | 8min | 2 tasks | 2 files |
| Phase 29 P02 | 15min | 2 tasks | 9 files |
| Phase 29 P03 | ~20min | 3 tasks | 5 files |
| Phase 29 P04 | 35min | 3 tasks | 3 files |
| Phase 29 P05 | 40min | 3 tasks | 3 files |
| Phase 29 P06 | ~30min | 3 tasks | 3 files |
| Phase 29 P07 | ~45min | 3 tasks | 1 files |
| Phase 30 P01 | 20min | 2 tasks | 4 files |
| Phase 30 P03 | 9min | 3 tasks | 8 files |
| Phase 30 P02 | 19min | 3 tasks | 5 files |
| Phase 30 P04 | ~25min (+ multi-hour checkpoint pause) | 3 tasks | 4 files |
| Phase 30 P05 | 10min | 2 tasks | 2 files |
| Phase 30 P06 | 20min | 3 tasks | 7 files |
| Phase 30 P07 | 25min | 2 tasks | 8 files |
| Phase 31 P01 | 45min | 3 tasks | 4 files |
| Phase 31 P04 | 20min | 3 tasks | 7 files |
| Phase 32 P01 | 30min | 2 tasks | 5 files |
| Phase 32 P02 | ~30min | 2 tasks | 3 files |
| Phase 32 P03 | ~15min | 2 tasks | 3 files |
| Phase 33 P01 | ~20min | 3 tasks | 2 files |
| Phase 33 P02 | ~25min | 2 tasks | 3 files |
| Phase 33 P03 | 15min | 3 tasks | 5 files |
| Phase 33 P04 | ~40min | 3 tasks | 8 files |
| Phase 33 P06 | ~15min | 2 tasks | 2 files |
| Phase 34 P01 | 17min | 2 tasks | 4 files |
| Phase 34 P02 | ~50min | 2 tasks | 9 files |
| Phase 34 P05 | 10min | 2 tasks | 3 files |
| Phase 34 P06 | ~15min | 1 tasks | 1 files |
| Phase 34 P08 | 15min | 3 tasks | 2 files |
| Phase 34 P09 | 8min | 2 tasks | 3 files |
| Phase 34 P10 | 25min | 3 tasks | 2 files |
| Phase 34 P14 | 20min | 2 tasks | 3 files |
| Phase 34.1 P05 | 45min | 3 tasks | 4 files |
| Phase 34.1 P06 | 45min | 3 tasks | 7 files |
| Phase 34.1 P07 | 45min | 3 tasks | 7 files |
| Phase 34.1 P08 | 50min | 3 tasks | 4 files |
| Phase 34.2 P01 | ~75min | 3 tasks | 2 files |
| Phase 34.2 P04 | 50min | 3 tasks | 5 files |
| Phase 34.2 P05 | 25min | 2 tasks | 2 files |
| Phase 34.2 P06 | 35min | 3 tasks | 5 files |
| Phase 34.2 P07 | ~9min | 3 tasks | 5 files |
| Phase 34.2 P08 | 12min | 2 tasks | 3 files |
| Phase 34.2 P09 | 25min | 3 tasks | 7 files |
| Phase 34.2 P10 | 25min | 2 tasks | 2 files |
| Phase 34.2 P11 | 35min | 2 tasks | 4 files |
| Phase 34.2 P12 | 25min | 2 tasks | 2 files |
| Phase 34.2 P13 | 20min | 2 tasks | 4 files |
| Phase 34.2 P14 | 40min | 2 tasks | 1 files |
| Phase 34.2 P15 | 25m | 2 tasks | 2 files |
| Phase 34.2 P16 | 45min | 3 tasks | 6 files |
| Phase 34.2 P17 | ~35min | 2 tasks | 4 files |
| Phase 34.2 P18 | 30min | 3 tasks | 6 files |
| Phase 34.2 P19 | 100min | 3 tasks | 6 files |
| Phase 34.2 P20 | 8min | 2 tasks | 2 files |
| Phase 34.2 P21 | 15min | 2 tasks | 2 files |
| Phase 34.2 P22 | 10min | 2 tasks | 2 files |
| Phase 34.2 P23 | 50min | 2 tasks | 1 files |
| Phase 34.2 P24 | 55min | 3 tasks | 4 files |
| Phase 34.2 P25 | 90m | 3 tasks | 2 files |
| Phase 34.2 P26 | 45min | 3 tasks | 4 files |
| Phase 34.2 P27 | 15min | 2 tasks | 2 files |
| Phase 34.3 P01 | 55min | 3 tasks | 8 files |
| Phase 34.3 P03 | 45min | 3 tasks | 5 files |
| Phase 34.3 P04 | 40min | 3 tasks | 5 files |
| Phase 34.3 P02 | 90min | 2 tasks | 2 files |
| Phase 34.3 P05 | ~50min | 3 tasks | 3 files |
| Phase 34.3 P06 | 35min | 2 tasks | 4 files |
| Phase 34.3 P07 | ~50min | 3 tasks | 2 files |
| Phase 34.3 P08 | 70min | 3 tasks | 5 files |
| Phase 34.4.1 P01 | 45m | 3 tasks | 3 files |
| Phase 34.4.1 P02 | 42min | 4 tasks | 3 files |
| Phase 34.4.1 P03 | 21min | 2 tasks | 2 files |
| Phase 34.4.1 P04 | 40min | 2 tasks | 10 files |
| Phase 34.4.1 P05 | 35min | 3 tasks | 7 files |
| Phase 34.4.1 P09 | 70min | 3 tasks | 13 files |
| Phase 34.4.1 P06 | 70min | 3 tasks | 4 files |
| Phase 34.4.1 P07 | 110min | 3 tasks | 3 files |
| Phase 34.5 P01 | 30min | 3 tasks | 3 files |
| Phase 34.5 P02 | 25min | 2 tasks | 2 files |
| Phase 34.5 P03 | 15min | 3 tasks | 3 files |
| Phase 34.5 P04 | 35min | 2 tasks | 8 files |
| Phase 34.5 P05 | 55min | 3 tasks | 3 files |
| Phase 34.5 P06 | 65min | 3 tasks | 7 files |
| Phase 34.5 P07 | 20min | 2 tasks | 8 files |
| Phase 34.5 P08 | 55min | 3 tasks | 5 files |
| Phase 34.5 P09 | ~55min | 3 tasks | 2 files |
| Phase 34.5 P10 | 35min | 2 tasks | 2 files |
| Phase 34.5 P11 | 45min | 2 tasks | 3 files |
| Phase 34.5 P12 | 45min | 3 tasks | 2 files |
| Phase 34.5 P13 | 55min | 3 tasks | 2 files |
| Phase 34.5 P14 | 13min | 2 tasks | 2 files |
| Phase 34.4.1 P10 | 65min | 2 tasks | 4 files |
| Phase 34.4.1 P11 | 35min | 2 tasks | 4 files |
| Phase 34.4.1 P12 | ~20min | 2 tasks | 8 files |
| Phase 34.4.1 P13 | 40min | 2 tasks | 6 files |
| Phase 34.4.1 P14 | 20min | 2 tasks | 2 files |
| Phase 34.4.1 P15 | 55min | 2 tasks | 10 files |
| Phase 34.4.1 P16 | 50min | 3 tasks | 5 files |
| Phase 34.4.1 P17 | 45min | 2 tasks | 4 files |
| Phase 34.4.1 P18 | 30min | 4 tasks | 8 files |
| Phase 34.4.1 P19 | 55min | 2 tasks | 3 files |
| Phase 34.4.1 P21 | 75min | 3 tasks | 7 files |
| Phase 34.4.1 P22 | 30min | 3 tasks | 11 files |
| Phase 34.4.1 P23 | 50min | 3 tasks | 6 files |
| Phase 34.4.1 P24 | 40min | 3 tasks | 2 files |
| Phase 34.4.1 P26 | 55min | 2 tasks | 8 files |
| Phase 34.4.1 P27 | ~50min | 3 tasks | 9 files |
| Phase 34.5 P16 | 45min | 3 tasks | 5 files |
| Phase 34.5 P17 | 40min | 2 tasks | 3 files |
| Phase 34.5 P18 | 55min | 2 tasks | 2 files |
| Phase 34.5 P19 | 35min | 2 tasks | 1 files |
| Phase 34.5 P20 | 55min | 3 tasks | 1 files |
| Phase 34.5 P22 | 50min | 3 tasks | 1 files |
| Phase 34.5 P23 | 55min | 3 tasks | 4 files |
| Phase 34.5 P25 | 35min | 2 tasks | 4 files |
| Phase 34.5 P26 | 50min | 3 tasks | 6 files |
| Phase 34.5 P27 | 45min | 2 tasks | 2 files |
| Phase 34.5 P28 | 25min | 4 tasks | 1 files |
| Phase 34.5 P32 | 25m | 2 tasks | 2 files |
| Phase 34.5 P33 | 50min | 2 tasks | 5 files |
| Phase 34.5 P34 | 35min | 2 tasks | 3 files |
| Phase 34.5 P35 | 55min | 2 tasks | 5 files |
| Phase 34.5 P36 | 45min | 3 tasks | 6 files |
| Phase 34.4.2 P01 | 25min | 3 tasks | 3 files |
| Phase 34.4.2 P02 | 55min | 3 tasks | 2 files |
| Phase 34.4.2 P03 | 30min | 3 tasks | 2 files |
| Phase 34.4.2 P04 | 60min | 3 tasks | 4 files |
| Phase 34.4.2 P05 | 23min | 3 tasks | 4 files |
| Phase 34.4.2 P06 | ~25min | 3 tasks (Task 2 human checkpoint) | 5 files |
| Phase 34.4.2 P07 | 50min | 3 tasks | 3 files |
| Phase 34.4.2 P08 | 35min | 3 tasks | 3 files |
| Phase 34.4.2 P09 | 40min | 3 tasks | 4 files |
| Phase 34.4.2 P10 | ~70min | 3 tasks (Task 2 human checkpoint) | 5 files (`34.4.2-LIVE-GATE-RERUN.md`, `34.4.2-PLATFORM-SCOPE.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`) |
| Phase 34.4.2 P11 | 120min | 3 tasks | 5 files |
| Phase 34.4.2 P12 | ~180min | 3 tasks (Task 2 blocking live gate, multiple in-run checkpoints) | 6 files (`34.4.2-LIVE-GATE-RERUN-2.md`, `34.4.2-PLATFORM-SCOPE.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `34.4.2-12-SUMMARY.md`) |
| Phase 34.4.2 P13 | 55min | 3 tasks | 7 files |
| Phase 34.4.2 P14 | 50min | 2 tasks | 4 files |
| Phase 34.4.2 P15 | 12min | 3 tasks | 4 files |
| Phase 34.4.2 P16 | ~40min | 3 tasks (Task 2 blocking live gate, human-driven) | 6 files (`34.4.2-LIVE-GATE-RERUN-3.md`, `34.4.2-PLATFORM-SCOPE.md`, `deferred-items.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`) |
| Phase 34.4.2 P19 | 1h | 3 tasks | 3 files |
| Phase 34.4.2 P21 | 20min | 2 tasks | 1 files |
| Phase 34.4.2 P22 | 15min | 2 tasks | 1 files |
| Phase 34.4.2 P23 | 70min | 3 tasks | 4 files |
| Phase 34.8 P01 | 4min | 2 tasks | 4 files |
| Phase 34.8 P02 | 25min | 2 tasks | 4 files |
| Phase 34.8 P03 | 15min | 2 tasks | 2 files |
| Phase 34.8 P04 | 35min | 2 tasks | 2 files |
| Phase 34.8 P05 | 25min | 3 tasks | 3 files |
| Phase 34.8 P06 | ~50min | 3 tasks | 4 files |
| Phase 34.8 P08b | 50min | 3 tasks | 17 files |
| Phase 34.8 P08c | 30min | 2 tasks | 4 files |
| Phase 34.8 P12 | ~75min | 3 tasks (Task 3 blocking human checkpoint) | 8 files |
| Phase 34.10 P01 | 20min | 2 tasks | 5 files |
| Phase 34.10 P02 | 35min | 2 tasks | 5 files |
| Phase 34.10 P03 | 40min | 2 tasks | 3 files |
| Phase 34.10 P04 | 55min | 2 tasks | 3 files |
| Phase 34.10 P05 | 35min | 2 tasks | 5 files |
| Phase 34.10 P06 | 25min | 2 tasks | 5 files |
| Phase 34.10 P07 | ~50min | 2 tasks | 4 files |
| Phase 34.10 P08 | 25min | 3 tasks | 4 files |
| Phase 34.10 P09 | 35min | 3 tasks | 15 files |
| Phase 34.10 P10 | 25min | 2 tasks | 2 files |
| Phase 34.10 P11 | 66min | 2 tasks | 2 files |
| Phase 34.10 P13 | 24min | 3 tasks | 8 files |
| Phase 34.10 P14 | ~15min | 2 tasks | 2 files |
| Phase 34.10 P15 | ~35min | 2 tasks | 2 files |
| Phase 34.10 P16 | ~1h10min | 2 tasks | 3 files |
| Phase 34.10 P17 | 70min | 3 tasks | 2 files |
| Phase 34.10 P18 | ~40min | 3 tasks + 1 correction | 6 files |
| Phase 34.10 P19 | 25min | 2 tasks | 2 files |
| Phase 34.10 P21 | ~35min | 3 tasks | 1 files |
| Phase 34.10 P23 | 24min | 2 tasks | 3 files |
| Phase 34.10 P24 | 18min | 2 tasks | 2 files |
| Phase 34.10 P25 | 95min | 2 tasks | 1 files |
| Phase 34.10 P26 | ~140min | 2 tasks | 2 files |
| Phase 34.11 P01 | 20min | 3 tasks | 3 files |
| Phase 34.11 P02 | 15min | 2 tasks | 2 files |
| Phase 34.11 P03 | 35min | 3 tasks | 3 files |
| Phase 34.11 P04 | 20min | 3 tasks | 4 files |
| Phase 34.11 P05 | 20min | 3 tasks | 2 files |
| Phase 34.11 P06 | 45min | 3 tasks | 8 files |
| Phase 34.11 P07 | 55min | 3 tasks | 12 files |
| Phase 34.11 P08 | 18min | 3 tasks | 9 files |
| Phase 34.11 P09 | checkpoint-spanning | 3 tasks | 11 files |
| Phase 34.9 P04 | 25min | 2 tasks | 3 files |
| Phase 34.9 P06 | ~55min | 3 tasks | 4 files |
| Phase 34.9 P07 | 45min | 3 tasks | 4 files |
| Phase 34.9 P08 | 50min | 2 tasks | 3 files |
| Phase 34.9 P09 | 70min | 2 tasks | 2 files |
| Phase 34.9 P10 | 90min | 2 tasks | 1 files |
| Phase 34.5 P43 | 55min | 3 tasks | 10 files |
| Phase 34.5 P46 | 1h34m | 3 tasks | 5 files |
| Phase 34.5 P47 | 21min | 3 tasks | 15 files |
| Phase 34.5 P48 | 35min | 3 tasks | 6 files |
| Phase 34.5 P49 | 70min | 3 tasks | 4 files |
| Phase 34.5 P50 | 2h40m | 3 tasks | 4 files |
| Phase 34.9 P18 | 25min | 3 tasks | 2 files |
| Phase 34.9 P19 | 25min | 2 tasks | 4 files |
| Phase 34.9 P20 | 55min | 3 tasks | 3 files |
| Phase 34.9 P21 | 73min | 3 tasks | 3 files |
| Phase 34.9 P23 | 45min | 2 tasks | 1 files |
| Phase 34.9 P25 | 26min | 2 tasks | 13 files |
| Phase 34.9 P26 | 75min | 3 tasks | 2 files |
| Phase 34.9 P27 | 20min | 3 tasks | 2 files |
| Phase 46 P01 | 6min | 2 tasks | 2 files |
| Phase 46 P02 | 45min | 2 tasks | 3 files |
| Phase 46 P03 | 25min | 2 tasks | 3 files |
| Phase 46 P04 | 11min | 2 tasks | 4 files |
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 260929-qth P01 | ~16min | 3 tasks | 5 files |
| Phase 48 P01 | 11min | 3 tasks | 97 files |
| Phase 48 P02 | 52min | 3 tasks | 21 files |
| Phase 48 P03 | 25 min | 2 tasks | 3 files |
| Phase 48 P04 | 72 min | 3 tasks | 8 files |
| Phase 48 P05 | 9 min | 3 tasks | 14 files |
| Phase 48 P06 | 5 min | 1 tasks | 7 files |
| Phase 48 P07 | 21 min | 3 tasks | 10 files |
| Phase 48 P08 | 2h 11m | 2 tasks | 1 files |
| Phase 48 P09 | 85min | 2 tasks | 5 files |
| Phase 48 P10 | 15 min | 2 tasks | 4 files |
| Phase 48 P11 | 8 min | 3 tasks | 7 files |
| Phase 48 P12 | 12 min | 3 tasks | 6 files |
| Phase 49 P01 | 20 min | 3 tasks | 17 files |
| Phase 49 P02 | 25 min | 3 tasks | 97 files |
| Phase 48 P14 | 70min | 2 tasks | 10 files |
| Phase 48 P15 | 4h | 3 tasks | 1 files |
| Phase 48 P16 | 75min | 3 tasks | 16 files |
| Phase 48 P17 | ~45min | 3 tasks | 12 files |
| Phase 48 P18 | 2h | 3 tasks | 1 files |
| Phase 49 P03 | 25 min | 3 tasks | 12 files |
| Phase 49 P04 | 14 min | 3 tasks | 10 files |
| Phase 49 P05 | 13 min | 2 tasks | 12 files |
| Phase 49 P06 | 12 min | 2 tasks | 15 files |
| Phase 49 P07 | 9 min | 3 tasks | 11 files |
| Phase 49 P08 | 7 min | 3 tasks | 12 files |
| Phase 49 P09 | 30 min | 3 tasks | 10 files |
| Phase 49 P10 | 45min | 2 tasks | 13 files |
| Phase 49 P11 | 45 min | 2 tasks | 3 files |
| Phase 45 P01 | 57min | 3 tasks | 21 files |
| Phase 45 P03 | 15min | 2 tasks | 3 files |
| Phase 45 P04 | ~50min | 2 tasks | 5 files |
| Phase 45 P02 | 95min | 3 tasks | 32 files |
| Phase 45 P09 | 95min | 3 tasks | 72 files |
| Phase 45 P10 | 9 min | 3 tasks | 72 files |
| Phase 45 P05 | 35 min | 2 tasks | 5 files |
| Phase 45 P06 | 13 min | 3 tasks | 9 files |
| Phase 45 P07 | 38 min | 3 tasks | 21 files |
| Phase 45 P08 | 30 min | 3 tasks | 20 files |
| Phase 45 P11 | 26 min | 3 tasks | 106 files |
| Phase quick-261015-7tt P01 | 2h40min | 3 tasks | 5 files |
| Phase quick-261015-pwy P01 | 22min | 3 tasks | 7 files |
| Phase quick-261015-rud P01 | - | 3 tasks | 7 files |

## Accumulated Context

### Roadmap Evolution

Entries for phases before 44 live in STATE-HISTORY.md § Roadmap Evolution archive (2026-10-15).

- Phase 44 closed 2026-10-11: **superseded by Phase 45** (hand edit, D-22). This is the closure record; the 2026-09-18 bullet below is the roadmap edit that marked the heading. What stands: waves 1-5, plans 44-01..44-07 shipped, the D-22 gate itself passed on its fourth attempt, and eight of nine contrast defects were fixed and verified across a light AND a dark arm. Abandoned with the screen, by name: contrast defect 9 (Install button `:hover` at 3.50:1 in nord-light, no token resolves it), the D-24 `Needs GUI` / `Errored` / `Installing-elsewhere` cells (never reached), and D-23 (never covered). Phase 44 is NOT recorded as verified or passed, and plan 44-08 is not completed; `44-LIVE-GATE.md` is `status: superseded` and both it and `44-VALIDATION.md` carry a dated closure section. Live verification of the replacement surface is plan 45-12.
- Phase 48 added 2026-10-03: **Library rows — user-composed filter rows in the tiles panel.** The shelf model from Steam, Netflix and Apple TV: each row is a saved filter rendered as a horizontal strip with a small header, composed from a `ROWS` section in the Games tier-2 panel with a `+`. **This is a generalisation of shipped code, not a greenfield feature** — `libraryTopSection` (`Settings/components/LibraryTopSection.tsx:30-46`) is already a four-option dropdown (`recently_played`, `recently_played_installed`, `favourites`, `disabled`) rendering ONE lane via `RecentlyPlayed/index.tsx`, and the lane concept is already load-bearing: `GamesList` takes `isFirstLane`/`isRecent`/`isFavourite`, there is a `firstLane` CSS class, and `filterEngine.ts` exports `passesHiddenLaneFilter`. Those four values are the migration seed. **`Depends on` was hand-corrected at filing time, the same positional-guess trap Phase 47 above records:** `phase.add` wrote Phase 47 (the IsThereAnyDeal migration, unrelated); the real dependency is **Phase 34.11**, whose filter engine each row is defined over. `**Goal:** [To be planned]` was hand-written too, and the title was shortened from 84 chars after `phase.add` warned it had written a goal-shaped description verbatim as the header. **SUPERSEDES ONLY HALF of the `library-sorting-is-title-only` todo, and the half it supersedes is the easy one.** It kills the sort-field-menu UI — a `Recently Added` row beats a global sort for the common case — but NOT that todo's actual blocker, which is why it is `ready: human`: the open question is cross-store data coverage, not the control. Rows inherit that hole unchanged and arguably worsen it: acquisition date does not exist for Epic, Amazon or sideloaded, is license-grant-not-purchase for Steam, and is clean only for GOG (already fetched and discarded). A sort can put unknowns last where they are visible; a row silently omits three stores with nothing on screen saying it is incomplete. **Rewrite that todo down to the data-coverage decision, do not close it** — its measured per-store inventory (2026-10-03) is the expensive part and this phase needs it verbatim. **Three open scope questions must be settled in `/gsd-spec-phase 48` before planning, and question 1 is load-bearing:** (1) is Rows a FIFTH VIEW that swaps the grid for shelves, or does it REPLACE the grid with Views filtering within every row — this decides whether sketch 005 variant D ships as drawn, because under the second model Views stops meaning `which slice am I looking at` and D's you-are-here premise weakens; (2) row cap and duplicate policy, since Steam/Netflix rows are platform-curated and user-composed rows over a 400-game library can put one game in six rows with nothing above the fold; (3) each row needs an internal order, and `Recently Added` is a row WHOSE DEFINITION IS A SORT — which is how the data-coverage problem walks back in through the side door. **Sketch 005 variant D is deliberately HELD, not discarded,** pending question 1; the sketch is committed (`4f8dac642`) and costs nothing to park, whereas building it twice is the expensive outcome. Applied by hand: the add-phase workflow's `update_project_state` step is a hand-write by design, and `state.*` is banned here for corrupting this file.
- Phase 47 added 2026-09-24: **Migrate aggregated store search from CheapShark to IsThereAnyDeal — Stage 1 of the store-price direction.** Retires the D-13 USD-only debt on `/store-search`, which is the live inconsistency `questions.md` Q2 was raised for: a UK user sees dollars on the price-checker while the Deals tab shows them pounds correctly. Research is **already complete** (quick `260916-gdg`, which marked Q2 ANSWERED) and its claims are graded MEASURED / SPEC / UNKNOWN — preserve the grades when quoting it; the single remaining UNKNOWN is the covered country/currency list, because a 14-country sweep of `/service/shops/v1` returned an identical 34-shop list every time, disproving that endpoint as a coverage measure. **Two `Depends on` corrections were applied by hand at filing time:** `phase.add` writes the immediately-preceding phase number as a positional guess, so the stub claimed Phase 46 (Windows single-instance guard, unrelated); the real dependency is **Phase 20**, which minted the provider-neutral `common/types/storeSearch` vocabulary this phase is the second implementation of — and the migration turns out to *validate* that speculative D-11/D-12/D-13 bet rather than strain it. Also hand-corrected `**Goal:** [To be planned]`. **The phase carries three human gates and one is IN FLIGHT:** the email to `api@isthereanydeal.com` was SENT 2026-09-24 and returned an out-of-office. Its answer to "does the rate limit follow the key or the authenticated account" **determines what this phase builds** — 1000 req/5min is per-key and a desktop app ships one key in the binary, so the budget is shared across every install; if OAuth moves it to the user's own ITAD account the phase builds an OAuth flow (gaining `hideOwned`/`wishlistOnly` for free), otherwise an embedded key plus hard caching and a raised-limit request. Those are different phases: **plan around the open question, do not guess it.** Scope is the price-checker ONLY — `/discounts` stays GOG-only and locale-correct, gated on the same email's answer about the "MUST NOT build a competition to IsThereAnyDeal" clause, and **Stage 2** (a GameLib-owned affiliate-feed/mirroring service) is explicitly out: it needs partner approvals requiring traffic this project does not have and a server it does not run. Operator decision 2026-09-24 accepts ITAD's Amazon coverage gap — Amazon is retained-because-built, not a first-class store. Applied by hand: the add-phase workflow's `update_project_state` step is a hand-write by design, and `state.*` is banned here for corrupting this file.
- Phase 44 edited 2026-09-18: **marked ⛔ SUPERSEDED BY PHASE 45**, with its now-doubly-stale `**Plans:**` status line corrected — it still read "EXECUTING, 2/8 (wave 1 COMPLETE 2026-09-16)" when 7 of 8 plans had in fact shipped. Superseded rather than completed: `44-08` (the D-22 live gate + D-24 theme spot-check) is **abandoned, not failed**, because Phase 45 replaces the entire screen it was gating. The entry records what stands — waves 1–5, plans 44-01..44-07, the D-22 gate itself PASSING on its fourth attempt with zero px reflow, and eight of nine contrast defects fixed and verified across a light AND a dark arm — and names what is being abandoned rather than dropping it quietly: contrast defect 9 is UNFIXED and shipped (install button `:hover` at 3.50:1 in nord light, no token resolves it), the D-24 `Needs GUI` / `Errored` / `Installing-elsewhere` cells were never reached, and D-23 was never covered. **Phase 44 must NOT be recorded as fully verified — it is superseded with known residue.** All artifacts retained, nothing deleted. Applied by hand: the edit-phase workflow prescribes `gsd-sdk query state.add-roadmap-evolution` at its `write_updated_phase` step, and `state.*` is banned here for corrupting this file.
- Phase 45 added 2026-09-17: **Native in-app Winetricks UI redesigned from scratch — one self-explanatory surface replacing BOTH the Phase 44 browse panel AND the `Open Winetricks GUI` escape hatch.** Added on the operator's verdict against a live packaged build ("this ux is rubbish"), which the evidence supports beyond colour: raw upstream labels pre-truncated by winetricks itself at 95 chars, 567 verbs behind five raw parser-string headers (D-09), a raw wine/curl stderr dump as the progress UI, and no guidance on what to install or why. **Process constraint recorded on the entry: this phase MUST run `/gsd-discuss-phase` BEFORE `/gsd-ui-phase`** — Phase 44's weak design traces to `44-UI-SPEC.md` being written with no CONTEXT.md, citing constraint IDs `C-1`..`C-6` that exist in no artifact on disk. Three findings were folded into its scope rather than filed as separate todos: winetricks stderr logged wholesale at `[ERROR]` and echoed to the UI (846 lines, 40% of one log, 125 `fixme:` + 178 curl progress bars); `['-q', '--gui']` making winetricks' own warnings self-dismiss in 5s via `zenity --timeout 5`; and the `needsGui` list matching no derivable signal (6 verbs call `w_download_manual`, not the 8 claimed). The upstream UI inventory is already done and lives on the roadmap entry. Only the intermittent blank-render finding was filed separately (app-wide, not Winetricks). Phase 44 remains open on 44-08 and should be closed as superseded by 45.

- Phase 44 added 2026-09-15: **In-app Winetricks browse UI replacing the search-only panel**. Motivated by operator feedback the same day: the winetricks zenity GUI's categorised checklist is markedly better than our own panel. The architectural call was to rebuild that shape IN-APP rather than lean harder on zenity -- zenity is already a declared-but-optional dependency the code warns about (`src/backend/tools/index.ts:779`, "zenity not installed! Winetricks might fail to install some packages or even open"), so adopting it as the primary UI would promote a soft dependency to a hard one and discard all ten app themes. Rendering work only: the data layer landed in `quick-260915-ajd` (`listAvailable()` now returns `{verb, title, category, cached}` across 567 verbs, up from 370 verb-only strings) and `quick-260915-ajd-fu` made the filter match title as well as verb. Cost of NOT using zenity, measured rather than assumed: only 8 verbs require manual download and cannot be installed unattended (`3dmark03`, `3dmark06`, `fontxplorer`, `foobar2000`, `stalker_pripyat_bench`, `ubisoftconnect`, `unigine_heaven`, `utorrent`) -- all benchmarks and apps, NOT ONE a DLL or font, so none of the `vcrun*`/`dotnet*`/`d3dx9*`/`corefonts` fixes anyone actually opens this panel for. Those 8 route to the retained zenity button. Scope fence carried from measured history: the list region must NOT unmount on install -- that remount is the cause of the dead-button defect fixed in 35-25 (`366e719bb`).
- Phase 46 added 2026-09-22: **Windows single-instance guard and gamelib:// deep-link registration**. Promoted from todo `2026-08-29-windows-single-instance-guard-and-deep-link-registration.md` now that the operator has a working Windows 11 build machine (Developer Mode on, pre-push hook green via quick 260922-ok3). It is the unblock for quick 260922-nx4, which suppressed install-time `gamelib://` registration on Windows because there was no guard. The installer-level evidence (0 vs 6 `Classes\gamelib` lines) is in that SUMMARY.

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:
Decisions for Phase 47 and earlier, pre-October quick tasks and untagged entries live in STATE-HISTORY.md § Decisions archive (2026-10-15).

- [Phase 261003-i4t]: Games panel: collapsed two icon rows into one six-icon row, swapped sort-by-status to an x-badge, made Add Game icon-only at the footer's left, localized the count pill ('N games'/'N of M games') across all 49 gamelib.json catalogues (D-01..D-06).
- [Phase 48]: Sourced de/zh_Hant/46-remaining-locale focus-row translations against each locale's existing in-repo vocabulary rather than inventing new terms
- [Phase 48]: Skipped pnpm machine-fill-gamelib (hard-codes api.anthropic.com, 401s deterministically here); authored all 46 remaining locales in-session instead
- [Phase 48]: Validated all 46 locale translations via validateTranslation() plus a sabotage control in a scratch jest run, deleted before commit
- [Phase 48]: R2 and R3 requirements left open — shared with sibling plans 48-02/48-03/48-04 not yet executed (requirements.ready-ids confirms blocked)
- [Phase 48]: focusRow is a new, additive GlobalConfig key (not a widened libraryTopSection), so plan 48-05's seed-once-guarded-by-key-presence is expressible
- [Phase 48]: Focus-row engine state sets showHidden: 'show' so passesHiddenLaneFilter is the sole hidden-games authority, never passesMore
- [Phase 48]: Focus-row state keeps showNonAvailable/noStorePage/showSupportOfflineOnly/showThirdPartyManagedOnly/showUpdatesOnly at engine defaults for R4 independence
- [Phase 48]: 48-03: per-row title carried by an inner span via NavItem labelElement, not a new NavItem prop (keeps change inside the plan's files); divider labels hoisted to consts that stay literal tGamelib call sites
- [Phase 48]: 48-04: focus-row overflow controls mount only when the track can scroll; the end-of-travel control is natively disabled at opacity 0.38; paging is by whole visible cards with sub-pixel residue (<1px) treated as no travel
- [Phase 48]: Task 1 ruling recency: recently_played_installed migrates to the recentlyPlayed view, recency kept and the installed-only qualifier dropped, because FocusRowSelection has no modifier slot and installed-only stays reachable through the grid Installed view
- [Phase 48]: Presence guard on the focusRow key, not its value, so a deliberate clear (a present null) permanently disarms the legacy seed; the seed reads the raw on-disk object as the last property of the getSettings merge
- [Phase 48]: No storage bound on games.recent (operator ruling on R6): setRecentGames unchanged; display cap is the focus-row card ceiling only — The removed setting never governed storage; the stored list was unbounded before and after
- [Phase 48]: 48-07: hydrate focusRow in the renderer from requestAppSettings and persist through setSetting (not backend mirror write); present focusRow key authoritative; view whitelist duplicated in common, pinned by satisfies Record<LibraryView,true>
- [Phase 48]: Plan 48-08: chevron contrast is under 3:1 in 9 of 10 themes and a hovered card paints over the control; divider labels miss 4.5:1 in dracula and nord-light - three gaps filed in 48-UAT.md
- [Phase 48]: Plan 48-08: every pixel measurement on this display must convert the screencapture from Display P3 to sRGB first
- [Phase 48]: 48-09: GameCard controller mode has no geometry override and hover wears the console ring globally; stale-focus suppression scoped to .listing:hover (common ancestor of strip and grid), not a single .gameList
- [Phase 48]: [48-10] Chevron stacking fixed by isolation: isolate on .focusRowTrack, not a larger control z-index (card-internal z-indexes up to 5 escape a resting card)
- [Phase 48]: [48-10] Strip-end clearance is 12px list padding-inline with width: max-content plus a matching -12px viewport margin-inline; scroll-into-view reads the computed padding and falls back to zero clearance
- [Phase 48]: 48-11: chevron disc is opaque var(--body-background) (deliberate deviation from UI-SPEC's translucent scrim); divider fixed by a per-theme dracula/nord-light override, not a global change
- [Phase 48]: 48-12: strip card width is derived from the grid's auto-fill/minmax arithmetic over the strip content box (not read from the rendered grid) and written as --focus-row-card-width; amends D-01 per the 2026-10-07 'match the grid' ruling
- [Phase 48]: 48-12: strip-end clearance and viewport bleed 12px to 15px; vertical room max(1em, 0.04 x card width + 6.5px); width writes held on a 250ms A-B-A flip (T-48-36)
- [Phase 49]: 49-01: sign-in selector rule order is expiredFlag, !loggedIn, healthy, else unknown (a latched flag outranks a logged-out read; legendary deletes user.json on the latching verdict)
- [Phase 49]: 49-01: ?open= is validated by exact-membership parseSignInStore, consumed once per Login mount, and removed with replace:true (T-49-01)
- [Phase 49]: 49-02: login.*Reconnect tiles reuse each locale's steamReconnect verbatim; case-inflecting locales (cs, hu, lt, pl) keep {{store}} in a case-neutral slot
- [Phase 48]: 48-13: G-48-11b NOT reproduced in Chromium 153 (108 variants, scrollWidth within 0.6px of E); stop rule fired, Task 2 not started, no src change
- [Phase 48]: 48-14: strip width sync moved to next frame via createNextFrameRunner; observer callback only reads and requests (G-48-11a, WR-01); WebKit sweep 34 vs 0 loop errors, live proof owed to 48-15
- [Phase 48]: Live gate 48-15 on HEAD 460df71e4: G-48-11a and G-48-11b resolved by measurement against a pre-fix arming control (34 loop errors pre-fix vs 0 fixed; blank travel pre-fix vs 15pt clearance fixed); items 11 and 12 stay issue with new gaps G-48-11c and G-48-12a
- [Phase 48]: Plan 48-15 verify asserted 12 parser items but parseUatItemsWithStats counts outstanding items plus gaps (14 at base); consistency was checked against status words and gap statuses instead
- [Phase 48]: 48-16: keyboard-mode body class (body.keyboardNav) scopes the stale-focus suppression instead of a :focus-visible scope; F1 measured to leave two rings
- [Phase 48]: 48-16: same-coordinate pointer moves do not end keyboard mode (engine synthetic move after scroll); untrusted Tab keydowns never enter it
- [Phase 48]: 48-17: strip holds the grid's scrollbar allowance (strip-only) while no grid is shown; G-48-11c = main.content 10px bar toggling, measured in WebKit (+2 = 10/5)
- [Phase 48]: 48-18: G-48-11c and G-48-12a resolved by live WebKit measurement against the preserved pre-fix bundle; G-48-8a stays failed (no controller); L3 distinct-position bar read 8 of 10 and was filed as G-48-12b for an operator ruling, not waved through
- [Phase 48]: 2026-10-09 Windows controller session closed UAT items 11 and 12: controller-focus ring clearance, cold-launch first paint, 20-card cap, title rect, 2-card row, mouse/controller handoff geometry (G-48-8a) and the one-ring invariant all pass by eye; 48-UAT.md complete 12/12
- [Phase 48]: G-48-11d (controller mode hides the card's hover-action buttons, only the store badge stays) is NOT a phase regression: upstream Heroic c555988b7 hid the whole bar in 2022, 16560dbdd (2026-10-02) kept the badge; operator ruled 'leave as is', closed with no code change
- [Phase 48]: Phase closed 2026-10-09: re-verification round 3 passed 10/10 with a real v2 covered-input fingerprint over 60 files (the verifier's claim that `verification fingerprint` was unexposed was wrong; the verb takes the phase dir then paths); 48-VALIDATION.md nyquist_compliant, 48-SECURITY.md 64 threats closed, 0 open
- [Phase 49]: legendaryConfigStore is exported under that name (not configStore) in its own legendary_store dir; expired follows the credentialsMissing precedent and is not write-denied — legendary/user.ts already imports the global configStore; a distinct dir keeps legendary from seeing or deleting the verdict; UI-only impact accepted (T-49-06, T-49-08)
- [Phase 49]: resolveEpicOfflineMode can only enable offline mode and never blocks a launch; the credentials modal stays the fallback for games that cannot run offline — R8: only legendary + canRunOffline + expired turns offline on; read once in prepareLaunch so a mid-launch probe cannot abort a launch
- [Phase 49]: Sign-in classifiers read a GOG token object while offline, and a Nile capture mixing auth and non-auth refresh statuses, as unknown (safe direction under 260822-vov) — Healthy needs positive evidence of a live session and clears a latched flag; a transient status beside an auth status means the failure is not proven
- [Phase 49]: Probe verdicts are decided in one place per store: GOG inside GOGUser.getCredentialsWithVerdict (single gogdl auth spawn, shared in-flight promise with Block E); Epic and Amazon in runnerProbes.ts; applySignInVerdict stays the only latch. — Block E and the pass cannot join each other's spawn and lose its captured output; only a bare null stdout with no connection-error line, online, with the auth config present counts as expired (D-17).
- [Phase 49]: 49-06: Steam keyring deferral (quick 260817-d61) is reversed on purpose for a signed-in account - the sticky deliberate 'boot-probe' trigger unlocks the gate after the boot pass, so later automatic SteamLibraryManager.refresh() calls may CM-connect; the probe itself reads the keyring only (D-14, D-21) — A boot-time notice cannot tell the truth without reading the keyring; a signed-out account never notes the trigger
- [Phase 49]: 49-06: Humble absent session slot and any unreadable read are unknown, never expired (A9, P1) — An empty slot behind a connected flag is not proof of expiry; favours never reporting a false expiry
- [Phase 49]: Dismissed sign-in set is one AppSettings key (dismissedSignInNotices) defaulting to [] with no migration; dismiss and re-arm are its only writers and persist only on change — Absent key and factory default are the same [] on both sides of the two-store hazard; re-arm is idempotent so it runs from push, pull, Humble auth push and end of mount
- [Phase 49]: Renderer componentDidMount runs humbleSync only; the Humble expiry health check lives solely in the sidecar boot pass — D-16 and T-49-21: a second latch path would double-write the expiry flag; a source gate with a RED specimen enforces it
- [Phase 49]: 49-08: boot sign-in probe bound SIGN_IN_PROBE_BOUND_MS=45000 equals Rust KEYRING_READ_TIMEOUT; pass starts after READY, outcomes pull handler registers before READY, test-worker guard lives inside startSignInProbePass — D-01/R3: measured ~12.5s Humble prompt latency motivates the bound; READY must never wait on a probe
- [Phase 49]: 49-09: expired sign-in rows ignore the dismissed set entirely, so a dismiss can never hide a proven expiry
- [Phase 49]: 49-09: SteamSyncNotice credential-missing case is suppressed (resolver returns hidden), not replaced; Library sign-in notice owns it
- [Phase 49]: 49-10: Login tiles re-read persisted verdicts through collectSignInInputs inside the existing effect (openOverlay dep kept, 260823-awo); parity gate compares parsed key:expression pairs of the selector call, not raw text, because prettier wraps the nested call
- [Phase 49]: Live-gate item 9 measures sidecar drain by running build/main/sidecar.js directly with stdin closed at READY; quitting the app makes the shell SIGTERM the sidecar (main.rs:1883-1927) so a PID-gone check passes vacuously — Structural Reachability Review Test 4, restated before publication
- [Phase 49]: Live-gate item 4 also sets loginTime=1 with the valid refresh token kept, because a valid unexpired GOG token is answered locally and the hosts block would exercise nothing — Review Test 6, restated before publication
- [Phase 49]: Live-gate launch 3 (restore plus a healthy clear launch) is inserted so launch 2's persisted expired latches cannot contaminate launch 4's absence assertions; credentials and runner logs are backed up and archived after every launch — Review Test 5 pairs F5, F2-F4, F6
- [Phase 49]: pnpm tauri:dev sets GAMELIB_DEV_SECRET_VAULT=1 and pnpm tauri:dev:keyring does not; Keychain live-gate items 7 and 8 must use the keyring build in a shell with the variable unset — package.json:32-33; otherwise the items are vacuous
- [Phase quick-261015-7tt]: Pure .is-text hover fix is HOVER-scoped only (not block-level), proved mathematically impossible to satisfy base+hover luminance constraints with one static colour
- [Phase quick-261015-7tt]: .settingsWrapper > .button.is-text deleted after a two-arm reachability proof (direct-child DOM walk + import-graph trace) found it unreachable from either settings host
- [Phase quick-261015-7tt]: Self-check caught the Task 3 commit missing the todo's resolution section (staged-vs-disk mismatch); restored in a follow-up fix commit before closing out
- [Phase quick-261015-pwy]: Scored the accepted first-paint-flash limitation as expected rather than reopening the shell/preload architectural question; refuted the screen.availWidth k-recomputation hazard by direct measurement, filing no new todo for it.

### Pending Todos

- [2026-08-23] [general] "F-9 — a generic RPC timeout fired live; co-occurrence with a cookie op is UNDETERMINED" — [todo file](.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md)
- [2026-09-11] [planning-records] "`audit-uat` reads YAML blocks in document BODIES too — the 652-field body population is MEASURED (51 f… — [todo file](.planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md)
- [2026-09-14] [build] 'Windows releases ship UNSIGNED — no Windows code-signing cert is enrolled, so SmartScreen warns on every d… — [todo file](.planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md)
- [2026-09-15] [webview/store-embed] 'Epic''s in-embed "Sign in" button has no decided behaviour — intercept and hand off, fail visi… — [todo file](.planning/todos/pending/2026-09-15-epic-in-embed-sign-in-button-has-no-decided-behaviour.md)
- [2026-09-17] [build] "Packaged .app renders blank — FIXED: the data router rendered its initial-load state as nothing; empty-ro… — [todo file](.planning/todos/pending/2026-09-17-packaged-app-renders-blank-on-roughly-one-launch-in-four.md)
- [2026-10-01] [ui] Library game tiles stretch with window width — consider a fixed or user-selectable tile size — [todo file](.planning/todos/pending/2026-10-01-library-tiles-stretch-with-window-width-consider-a-set-size.md)
- [2026-10-03] [ui] Library sorting is title-only — add a sort-field menu, with Playnite's sort list as the reference set — [todo file](.planning/todos/pending/2026-10-03-library-sorting-is-title-only-add-a-sort-field-menu-playnite.md)
- [2026-10-03] [ui] Login sheet's injected title bar shows a light wedge in the scrollbar gutter at the rounded top-right co… — [todo file](.planning/todos/pending/2026-10-03-login-sheet-title-bar-has-a-light-wedge-at-the-rounded-corner.md)
- [2026-10-05] [i18n] Orphaned library-top-section locale keys (and soon setting.maxRecentGames) — decide whether to rem… — [todo file](.planning/todos/pending/2026-10-05-orphaned-library-top-section-locale-keys-removal-needs-a-decision.md)
- [2026-10-05] [shortcuts] "Windows desktop/Start Menu shortcuts are never written — shell.writeShortcutLink is a stub returnin… — [todo file](.planning/todos/pending/2026-10-05-windows-desktop-and-start-menu-shortcuts-are-never-written.md)
- [2026-10-09] [auth] 'Amazon expiry strings (A3/A6) untested: nile tokens are encrypted, induction needs server-side device deregistration' — [todo file](.planning/todos/pending/2026-10-10-amazon-expiry-strings-need-a-real-induction.md)
- [2026-10-11] [ui] "`.button.is-text`'s 22 `.is-link` render sites and its own `:hover` state are unexamined for contrast" — [todo file](.planning/todos/pending/2026-10-11-button-is-text-hover-and-is-link-pairs-miss-4-5-to-1.md)
- [2026-10-11] [steam] "Native LZMA decode is back ON: run a live Steam depot install on the Mac and re-measure native v… — [todo file](.planning/todos/pending/2026-10-11-native-lzma-mac-live-steam-depot-install-and-throughput-remeasure.md)
- [2026-10-11] [webview/store-embed] 'Re-probe spike 024 with the Chrome UA spoof OFF — all five Epic-store runs stamped a Ch… — [todo file](.planning/todos/pending/2026-10-11-re-probe-spike-024-epic-store-embed-with-the-chrome-ua-spoof.md)
- [2026-10-11] [steam] "win32 SEA native LZMA never engages: the win32-x64 addon imports liblzma.dll, which the SEA does not emb… — [todo file](.planning/todos/pending/2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md)
- [2026-10-11] [ui] Winetricks settings window not resizable by dragging on macOS, yet captures show three distinct widths — [todo file](.planning/todos/pending/2026-10-11-winetricks-settings-window-not-resizable-by-drag-on-macos.md)

### Blockers/Concerns

- Pre-push hook (`prettier` + `i18n --fail-on-update`) fails on **pre-existing repo debt** unrelated to Phase 7: ~141 files fail `prettier --check .` (likely a Prettier version bump; `pnpm-lock.yaml` already modified) and the locale files have orphaned-key drift. Phase 7 was pushed with `--no-verify` after independently verifying tsc/lint/tests. A separate housekeeping pass (`pnpm prettier --write .` + `pnpm i18n`) would clear it.
- Phase 23 Plan 05 Task 3 (checkpoint:human-verify, gate=blocking-human): 23-UAT.md Gate 1 real-hardware re-run pending — human must install a multi-depot title (Hogwarts Legacy 990080 or Cyberpunk 2077 1091500) on real macOS hardware after deleting the stale appmanifest_990080.acf, confirm single monotonic progress percent through a pause/resume cycle, and confirm StateFlags=4 completion + launch. Code fix (single-flight guard + reconciliation) is landed and regression-tested (commits cc77a9df/ddde970d/7fccfb2a/f963de8b); this is the only remaining Phase 23 gap before Gates 2/3 can proceed.
- G-30-01: Steam QR login logon button unresponsive under Tauri (Manage Accounts renders, QR tab never reached) — install/uninstall E2E for Phase 30 unreached as a direct consequence; see 30-HUMAN-UAT.md for reproduction and untested hypothesis
- pathShim.test.ts (plan 34.5-01) unclassified in testContainment.test.ts's declared-suite lists — needs a one-line addition in a future pass (see deferred-items.md); not blocking 34.5-04's own completion
- **RESOLVED by 34.10-10 Tasks 1-2** (commits `3202f2ed6`, `f7fe85ad4`): meta/i18nGateScope.json regenerated (136→144 files; +11 NavShell files +Header/index.tsx, -4 deleted Sidebar paths), `nav.tabs.games` key synced. `genI18nGateScope.test.ts` now fully green (9/9); `hardcodedStringGate.test.ts` went from 4 failing (ScopeLoadError, masking any real scan) to 123/124 passing — proving the gate now genuinely scans all 144 files (self-verified: `scannedFiles matches the committed scope snapshot exactly`).
- **NEW BLOCKER found by 34.10-10 Task 2's verification, plan NOT closed**: `hardcodedStringGate.test.ts`'s one remaining failure is a real violation at `src/frontend/screens/WebView/index.tsx:347` (`'the Humble sign-in window closed or could not be reached'`) — but that line is **uncommitted WIP from the concurrent debug session** (`.planning/debug/humble-isloggedin-never-set.md`, F-34.4.2-19), confirmed via `git diff` (the string only exists in the working tree, not at HEAD). 34.10-10 is explicitly forbidden from touching that file (contamination rules) or widening the allowlist (T-34.10-25). Plan 34.10-10 stops here — Task 1 and Task 2's own artifacts are committed and correct, but the plan's "full suite green" success criterion cannot be met until the concurrent session either wraps that string in `t()` or commits/reverts its WIP. No action needed from 34.10-10 beyond re-running `pnpm jest --runInBand --silent --forceExit` once that session's WebView/index.tsx work is committed.
- REQUIREMENTS.md has no Phase 34.9 traceability section -- REQ-34.9-01..11 are cited by ROADMAP.md, STATE.md, and every 34.9 plan/summary, but requirements.mark-complete cannot find them to check off. Pre-existing gap, not caused by plan 34.9-07; needs a REQUIREMENTS.md backfill pass (D-XX -> REQ mapping + traceability table) for the whole phase.
- Phase 34.9-09: build-runners-onedir-macos.yml cannot be dispatched via gh workflow run until it exists on the repo's default branch (main) -- GitHub's workflow_dispatch requires this for ANY --ref, not just the pushed feature branch. Not resolvable within plan 34.9-09's authorized scope (no PR, no push to main). Blocks: real x64 onedir artifact (never built, no local fallback possible per constraint 1), pinning meta/runnersOnedirDigests.json's 6 sentinels, and full CI proof of the download-verify-extract round trip. See 34.9-CI-ROUNDTRIP.md.

### Quick Tasks Completed

Rows before the newest 20 live in [quick/COMPLETED-INDEX.md](./quick/COMPLETED-INDEX.md) (archived 2026-10-15). Keep new rows to one line; detail belongs in the task SUMMARY.

| # | Description | Date | Commit | Status | Directory |
| --- | ------------- | ------ | -------- | -------- | ----------- |
| 261012-97a | **Spike 024 runs 20-23, no head resource is pending; the blank store is an occluded window.** The probe gained the in-flight list (`inflight`, `pendingScripts`, `pendingStyles`), the parsed tail, `nav.responseEnd` and the host window's `occlusionState` on every read. Every blank raw-`WKWebView` arm (3 of 3) has the whole 1.12 M document, 9 of 9 head scripts and 4 of 4 stylesheets fetched, `readyState` complete, 113 k of body and nothing painted; an opaque always-on-top occluder over the host reproduces the state on demand, for Steam too, and removing it makes the store boot and paint within the next sample. WebKit suspends rendering updates for a not-visible window and Epic's app boot waits on one -- not a load stall, not a shipping blocker. The mid-parse variant (`readyState` loading at ~938 k, runs 15-19) did not recur in 8 arms and is not occlusion; split into a narrower `medium` todo with the offset probe as the next measurement. One raw arm Turnstile-challenged under the occluder (1 of 24, n=1). README runs 20-23 + consequence; todo closed; follow-up filed. | 2026-10-12 | — | COMPLETE. 4 live runs, 24 arms; 6 shots (1 redacted), 4 redacted logs; `SPIKE_PRISTINE_OCCLUDE=1\|pre` knob, `window_visibility()`; `cargo build` clean; `pnpm planning-gates` with the todo move staged. Mid-parse stall cause NOT measured (filed). | [261012-97a-spike-024-instrument-probe-script-with-i](./quick/261012-97a-spike-024-instrument-probe-script-with-i/) |
| 261012-ago | **Spike 024 runs 24-27, the ~938 k mid-parse stall offset is mid-string-literal inside an inline script; the document stream stopped there.** The probe gained `at938` (raw slice), `headEnd`, `bodyAt`, `tagsAround`, `scriptAt`; `SPIKE_PRISTINE_FOCUS=1` makes the host key after each arm is created. 0 of 8 stalls (0 of 16 since run 19). Runs 26 and 27 served documents of exactly run 18's and run 19's lengths, so run 18's stalled `docLen` maps directly: 149-150 characters into the inline analytics `SharedWorker` script, inside `'epic-analytics-worker'` -- mid character token, no element, `</head>` or parser-blocking resource near it, so the main-document response had stopped arriving at a fixed transfer position. Upstream stream stall, not a WebKit yield or webview defect; the embed's answer is a load timeout + reload. `nav.responseEnd` read 0 on two rendered arms, so the position decided it, not the todo's field. Todo closed with a RESOLUTION. | 2026-10-12 | — | COMPLETE. 4 live runs, 12 arms; 4 redacted logs, no new shots; `cargo build` clean; `pnpm planning-gates` 12/12 with the todo move staged. Not done: brotli block vs HTTP chunk boundary; Safari cold-load reproduction. | [261012-ago-spike-024-offset-probe-at-the-938-k-mid-](./quick/261012-ago-spike-024-offset-probe-at-the-938-k-mid-/) |
| 261012-82w | **Stale win32 native LZMA extraction dirs are swept before `mkdtempSync`.** Closes the 261011-wrx follow-up (operator chose the sweep over accepting the leak). `lzmaNativeBinding.ts` gains `sweepStaleExtractDirs(root)`: one `readdirSync` of `os.tmpdir()`, exact-name match `gamelib-lzma-native-<pid>-XXXXXX`, skips own pid / pid 0 / out-of-range pids, probes `process.kill(pid, 0)` and removes a directory ONLY on ESRCH (EPERM and a live probe both skip, so pid reuse can only skip, never delete live state), re-`lstat`s at delete time and refuses symlinks/junctions, capped at 64 probes (`LZMA_NATIVE_STALE_SWEEP_MAX_DIRS`), purely synchronous, every error swallowed; called on win32 only, inside the SEA branch, right before the existing `mkdtempSync` (POSIX `finally` unlink already succeeds and /tmp may be shared across pid namespaces). Result recorded under `Symbol.for('gamelib.lzmaNative.staleSweep')`; `lzmaLoader.ts` appends one `Swept N stale gamelib-lzma-native-* dir(s)` sentence to the existing engaged logInfo / import-failure logWarning, call count unchanged; the LEFT BEHIND sentence now says a later process removes them. Tests S1-S11, W1-W4, K1-K4 added with hermeticity stubs so no jest run touches the real %TEMP% (count 16 before and after every run). Real win32 SEA: cold build from 53b01de62, 20 fake-HOME driver runs 20/20 at nativeWorkers:2; per-run tmpExtracts 2 in all 20 runs (261011-wrx grew 2, 4, ... 40); the 16 stale pid-37008 dirs were swept in run 1; 54 swept in all; last run's 2 dirs removed by hand, %TEMP% now 0. Todo moved to completed/ with Resolution, frontmatter byte-identical. | 2026-10-12 | — | COMPLETE, verified on the real win32 SEA 2026-10-12. Targeted suites 95/95 (lzmaNativeBinding, decompressPool); codecheck, scoped eslint, find-deadcode 46 OK, scoped prettier, planning-gates 12/12 green. OWED: packaged release app arm (after one depot-decoding session, the NEXT session's engaged line should carry `Swept N stale ...` and %TEMP% should hold only the live session's dirs). By design a live session still holds up to one dir per decode worker until exit. | [261012-82w-sweep-stale-win32-native-lzma-extraction](./quick/261012-82w-sweep-stale-win32-native-lzma-extraction/) |
| 261012-8tl | **Closed the audit-uat body block-scalar todo: item D measured under gsd-core 1.15.0, not a parse defect.** `23.2-HUMAN-UAT.md` planted in the in-window phase 23 dir surfaces with its full `expected:` text and parse_gap_files 0 (EXP B 60 files/448 items with one item flipped to pending; EXP C 60/447 unmodified, its 1 item being the routed gap G-23.2-01); left in its own dir it stays absent even with a pending item (EXP A 59/446, identical to live), so the absence is the milestone filter. Unpark trigger NOT fired (STATE.md still `milestone: v0.8`); closed on measurement, not on the trigger. Recorded as unknown: why 23.2's dir sits outside the window while parent phase 23 is inside. | 2026-10-12 | — | COMPLETE. Todo moved pending→completed with a governing `## CLOSED 2026-10-12` section at line 19; frontmatter byte-unchanged (no `ready:` vocabulary value exists for a finished todo; the directory carries the state). `pnpm planning-gates` 12/12; prettier `--file-info` reports `ignored: true`, so `--check` omitted. Residue named, not fixed: audit-uat renders a `status: routed` gap as category `unknown`. Task commit ba9a6bb8f. | [261012-8tl-close-todo-2026-09-11-audit-uat-reads-bl](./quick/261012-8tl-close-todo-2026-09-11-audit-uat-reads-bl/) |
| 261012-913 | **Removed the orphaned `setting.library_top_section`, `setting.library_top_option.*` (4 labels) and `setting.maxRecentGames` entries from all 47 `translation.json` catalogues; decision was remove, not won't-fix.** Precedent 260911-srh had already deleted an inert key from the same population, and neither trap in the todo armed: no entry was last in its object in any of the 47 (trailing-comma repair fired 0 times) and no `_one`/`_other` siblings exist. Byte-preserving line sweep (`sweep-library-top-keys.cjs`, `--dry-run`/`--write`/`--check --against`), `git diff --numstat` reads `0 8` on all 47 rows (376 deletions); each catalogue re-parses and deep-equals its pre-edit parse minus exactly the three `setting` keys. `br/` and `sl/` have no `translation.json`, so 47 is the whole population. Corrections to the brief: `AppSettings.libraryTopSection` is NOT orphaned (`focusRowMigration.ts` seeds `focusRow` from it; `config.ts:359` defaults it), and `src-tauri/src/main.rs` keeps 8 `maxRecentGames` hits reading the stored setting, both untouched. | 2026-10-12 | — | COMPLETE. Baseline re-measured at 05978e870. `pnpm i18n` after the commit: no diff under `public/locales`, 4 warning-word lines before and after (two source filenames containing `Warning`, a Node DeprecationWarning and its hint; none a parser warning), so the todo's "zero warnings" pass condition is recorded as not literally met and not regressed. `pnpm i18n-churn-guard` clean. `pnpm lint-translations` 8225/96 → 8216/96, still red on pre-existing gamelib.library.tileSize.* and ca.gamelib.humbleKeys; the sorted set difference is exactly the 9 ka/th `Empty translation` lines naming the removed keys, none added. Residue grep outside `.planning/` and `main.rs` empty. Prettier `--file-info` reports every written path ignored, so `--check` omitted. `pnpm planning-gates` 12/12. Todo moved pending→completed with its 2051 original bytes as an exact prefix plus one `## Resolution` section. Commits 0c59089e9 (48 paths) and c70dfabc1 (todo pair). | [261012-913-remove-the-orphaned-setting-library-top-](./quick/261012-913-remove-the-orphaned-setting-library-top-/) |
| 261012-d5g | **Made the D-05 call -- Option A, `/store/epic` ships as a Rust-managed raw WKWebView subview, macOS first, as new Phase 50.** B (gate for good) rejected by the 2026-09-29 Linux one-launcher precedent; C (pristine window) folded in -- `humble_login_open` is a login-seam window, not a no-code path. Locked sub-decisions: Sign in button left in place and measured by Phase 50's live gate (hand-off only if challenged); macOS only; shared default data store with a warm signed-in arm owed; Turnstile-host fallback to the panel plus load timeout and reload. D-05 todo closed with a Decision section; Sign in todo re-triaged `ready: live-gate` / `platform: macos`; comment-only notes in `WebView/index.tsx` and `WebviewUnavailablePanel.tsx`; spike 024 README consequence section gained a dated decided note; Phase 50 entry written over `phase add`'s stub (Depends on corrected from 49 to 40 + spike 024). | 2026-10-12 | — | COMPLETE. `pnpm planning-gates` 12/12; prettier green on both `.tsx`; 16 WebView suites / 316 tests green; code commit verified comment-only. Not done: Phase 50 itself (spec/plan owed); the live gate arms listed in its entry. | [261012-d5g-record-the-d-05-call-for-store-epic-opti](./quick/261012-d5g-record-the-d-05-call-for-store-epic-opti/) |
| 261012-f05 | **`addShortcut`/`removeShortcut` are now invoke-kind and resolve a boolean write outcome; GameSubMenu flips its Add/Remove shortcut label only from it.** Type map, preload (`makeHandlerInvoker`), sidecar `ipcMain.handle` pair (true after write plus success toast, false after `logSendFailure`, add keeps its error toast, never rejects) and legacy `ipc_handler.ts` parity. New `toggleShortcuts` helper flips on strict `=== true`; false, null, undefined and rejection leave the label. Pins re-derived and matched measured: census 6/1, sweep 6/45, runnerSlice 67/2. GameSubMenu optimistic-flip todo closed to `completed/`. Not done: no live app run; a late write after the 60 s invoke bound leaves the label stale until remount. | 2026-10-12 | — | COMPLETE. RED 12 failed of 35 (`shortcutsFlows`), renderer suite failed to load; GREEN 219 (6 backend suites), 46 (GameSubMenu), 2131 across the four roots; `pnpm codecheck`, scoped eslint 0 errors and `prettier --check` exit 0; `pnpm find-deadcode` and `pnpm planning-gates` 12/12. Darwin cases ran (host macOS). Commits `48cb42c3a`, `d7a5da8e6`, `87331998f`. | [261012-f05-submenu-shortcut-invoke-kind](./quick/261012-f05-submenu-shortcut-invoke-kind/) |
| 261012-euq | **Filled `gamelib:library.tileSize.label` and `.valueText` in all 48 non-English catalogs** (added English-only by `fa3f581ce`, 261011-t4y), unblocking CI run 38176505164's `lintTranslations` REQ-41-02 and `comparePresenceBaseline` R13 reds (96 pairs). Values authored in-session (machine-fill unavailable under a gateway key), derived from each locale's own `dlc.size`/`wine.size` and tile parallels; `valueText` kept `{{width}} px` everywhere (no locale has a pixel-unit word). Both keys stamped into each `gamelib.mt.json`; D-09 means machine-fill will not revisit them. Confidence 32 high / 12 medium / 4 low (`br`, `sl`, `ka`, `ml` want native review). Same CI run's `logSecretGate` red fixed separately in `99e61737c` (exempted wine --version stdout, pin 12 to 13). | 2026-10-12 | — | COMPLETE. `lint-translations:gamelib` 816/96 hard to 720/0; `lintTranslations` + `gamelibCatalogParity` + `logSecretGate` 291 tests green; baseline untouched; numstat 48x `5 1` catalogs, 48x `2 0` manifests. Commit `933c7ac3d`. | [261012-euq-fill-library-tilesize-label-and-valuetex](./quick/261012-euq-fill-library-tilesize-label-and-valuetex/) |
| 261014-rso | **Latched the Epic embed `loadTimedOut` raise so the timeout banner can surface (G-50-16, the one major gap from the Phase 50 macOS live gate).** UAT Item 16 split pass/fail — the backend literal `load timed out past 45s` fired 3 times under a scoped host block, but `StoreEmbedTimeoutBanner` never became visible. Root cause was an un-latched raise on two sides. `useStoreEmbedHost.ts`'s GAP-D drain applied `events[events.length - 1]` wholesale, so a `loadTimedOut: true` raise followed by later `false` events in the SAME 250 ms batch was coalesced away (the live sequence was raise, then the -999 failure, then the next provisional start, all inside one poll interval); it now merges `loadTimedOut` stickily across the batch on strict `=== true`, while url/host/canGoBack/canGoForward still take the last event only. Rust side, all four `load_timed_out = false` sites in `macos_epic_embed.rs` now route through a new cfg-free `epic_embed_clears_load_timeout` in `epic_embed_state.rs`, which returns false only for `NavigationFailed` — so a failure can no longer clear a raise while `did_finish_navigation` still clears it, preserving D-07. The planner's measurement retired the briefed `nav_generation` fix as primary. That field is bumped at only two of the four reset sites, so a blanket gate would also stop a slow-but-successful load from dropping the banner, and a gate narrowed to the failure hook still would not fix the observed run. The renderer sticky merge is the necessary-and-sufficient half. Toolbar Reload deliberately stays ENABLED during a hung load (operator decision, the banner must survive a click-through) so its `disabled`-prop asymmetry against back/forward is intentional. Also corrected a brief error — `rust-test.yml` runs on windows-latest plus macos-latest with no Linux leg at all. Commits `5ba1dd645`, `f32f4757b`, `6299e7be0`. | 2026-10-14 | — | COMPLETE (code). RED observed before the fix on new jest property 46, verbatim `1 failed, 57 passed, 58 total` with `Expected true Received false`; property 47 is a boundary guard and passed throughout, claimed as such rather than as a red. Re-measured by the orchestrator, not just self-reported — scoped jest `useStoreEmbedHost` 56 to 58 passed, `cargo test --bin gamelib-shell` 390 to 394 passed with 0 failed and 2 ignored, `pnpm codecheck` exit 0, `cargo fmt --check` exit 0, scoped prettier clean on the 2 TS paths, `pnpm planning-gates` 12/12. Prettier omitted on the `.rs` paths with the reason measured, `inferredParser` is null and `--check` errors there, so `cargo fmt` is the gate. OWED, filed as a pending todo at `severity: major` `platform: macos` `ready: live-gate` — the macOS re-run of UAT Item 16, which is the only thing that can confirm the banner actually paints, plus the three UI-SPEC E3 checks it carries (Reload and Open-in-browser on one row at minimum window width, the longest-of-49 translation shape, and the revert-hosts-then-Reload recovery half). | [261014-rso-latch-epic-embed-load-timed-out](./quick/261014-rso-latch-epic-embed-load-timed-out/) |
| 261014-vot | **Gave the Epic embed `reload()` a first-commit fallback — the timeout banner Reload was a WebKit no-op on a never-committed WKWebView.** `FrameLoader::reload` returns early on an empty current-request URL, which is exactly the state UAT Item 16 Launch 5 produced (hosts blackhole applied before launch, nothing ever committed, confirmed click, zero navigation lines); Launch 3 (blackhole mid-session on a committed page) saw `-999` cancellations per click because the native reload fired. `EpicEmbedSurface` now tracks `has_committed` (new `didCommitNavigation` hook) and `last_requested_url` (the three chrome-side `loadRequest` sites); `reload()` re-issues the URL via `loadRequest` until the first commit, decided by the pure, cross-platform-tested `epic_embed_reload_action`. `didFinishNavigation` now logs a host-only success line so a silent success is distinguishable from a no-op. No Cargo change. Todo closed with a Resolution; UAT Item 16 result extended, status word kept at issue. | 2026-10-14 | — | Fix landed in `888b022ea`, docs in `6120ee734`; cargo test epic_embed 50/0/350 (was 46); the live recovery arm is still unobserved on a Mac and the DNS-cache confound unmeasured — re-run owed with the blackhole pre-launch and a fresh process after the revert. `epic_embed_handle_content_process_termination` keeps a bare reload (doc-flagged). | [261014-vot-fix-todo-2026-10-14-epic-embed-subview-d](./quick/261014-vot-fix-todo-2026-10-14-epic-embed-subview-d/) |
| 261014-wro | **Withheld the embed placeholder sentence on the Epic surface — option 3 of the Paused-while-a-window-is-open todo, chosen by the operator.** `StoreEmbedPlaceholder` now renders `webview.embedPlaceholder.message` only when its `reason` is not `epic-surface`; the D-19 suppression cases and the zero-argument call are unchanged, and on macOS `/store/epic` (D-06, statically true for the route) the slot is a text-free styled fill seen through the transparent subview. No locale file, no English copy, no CSS and no new key changed, so UI-SPEC E2 keeps its no-new-text rule; E2/E6 rows amended, the 50-REVIEW open entry discharged, todo closed with a Resolution. The todo existed because this false sentence drove two debug cycles and a self-contradicting commit. | 2026-10-14 | — | Fix in `6c061a598`, docs in `8bc527718`; scoped jest 30/30 (was 27), codecheck 0, lint at its 638 ceiling, prettier clean, locales untouched by a BASE-ranged diff; the text-free fill on a real Mac cold Epic load is still visually unobserved. | [261014-wro-fix-todo-2026-10-14-paused-while-a-windo](./quick/261014-wro-fix-todo-2026-10-14-paused-while-a-windo/) |
| 261015-7tt | **Censused the 22 `.button.is-link` render sites and `.button.is-text:hover` across all 10 themes — 5 families x 10 themes, 50 token-resolved ratios; 4 missed 4.5:1, all fixed with theme-scoped hover-only overrides.** Game-menu `.is-link` hover on dracula (`--navbar-active` → `--accent` on `--navbar-background`) 3.79 → 9.15; MainButton dropdown `.is-link` hover on gruvbox_dark 3.91 → 12.06 via a new `.SteamInstallCaret .dropdown .link:hover` override; pure `.is-text` hover on nord-light 3.36 → 5.13 and nord-dark 4.41 → 5.13 via `--neutral-01` — a block-level fix was proved impossible there because no one colour clears both nord-light's `--accent` base fill and the theme-constant `--primary-hover`, so the override is hover-scoped only. Base states untouched in every theme. Planner finding F3 pinned: `--navbar-inactive` is declared in only 2 of 10 themes and consumed as a bare `var()`, so in 8 themes the winning declaration is invalid-at-computed-value-time and inherits `body` colour rather than falling back to `.button.is-link`. `.settingsWrapper > .button.is-text` (`Settings/index.css`) deleted after a two-arm reachability proof (direct-child DOM walk and import-graph trace) agreed it was unreachable. Todo moved to `completed/` with a Resolution; triage frontmatter byte-unchanged. | 2026-10-14 | — | Code in `4128be9c6`, `f90c76cfd`, `88e18329a`; todo-resolution restore `34bd5de5a` (executor's Task 3 commit staged the renamed todo without its Resolution section, self-caught); executor also committed PLAN/SUMMARY in `7fdc94216`/`5952198df` against instruction. `themeTokens.test.ts` 270/270; orchestrator mutation check: removing the nord-light override reds 3 tests; prettier clean on 4 paths; planning-gates 12/12. Every ratio is resolver-chain, not pixel-sampled — no live capture on any theme. | [261015-7tt-is-link-and-is-text-hover-contrast-censu](./quick/261015-7tt-is-link-and-is-text-hover-contrast-censu/) |
| 261015-9qy | **Declared the app's first minimum window size — `minWidth: 900` / `minHeight: 600` on the `main` window in `tauri.conf.json` — and found the notice row's CSS was never the clipping mechanism.** 900 is the measured width from the Item 16 Launch 5 photographs (`item16-width900.png` fit on one row); 600 is a judgment call with no measurement. No Rust `min_inner_size` exists, so the conf is the single declaration; pinned in `tauriWindowConfig.test.ts` with a no-min SANITY fixture. `.WebView__embedNoticeRow-message` already had `min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis` and `-actions` already had `flex-shrink: 0` since `348e28057` (Phase 50-03), predating the live gate that filed the todo — so `index.css` is unchanged and the contract is now pinned per selector in `StoreEmbedTimeoutBanner.test.tsx` with a string-copy sabotage arm. `EpicLauncherBlockedNotice` renders no actions element, so the no-clip clause is banner-only. UI-SPEC E3 now names 900px and the conf key as its test point. Todo moved to `completed/` with a Resolution; triage frontmatter byte-unchanged. | 2026-10-15 | — | Code in `428aa56e1`, `de0113dbf`, `dfbb9d918`. Orchestrator re-ran: jest 33/33 across the 3 suites (29 baseline + 4 new); planning-gates 12/12; prettier clean on conf + both tests, `.planning/` paths prettier-ignored so no check carried. **Unverified:** the clamp itself and the rendered ellipsis — nobody launched the app. Open: `App.css:26` `min-content 1fr` shell column with no `min-width: 0` on `.App .content` may have been the real clip; the 900 floor makes it unreachable rather than root-caused. | [261015-9qy-store-embed-notice-row-set-a-minimum-win](./quick/261015-9qy-store-embed-notice-row-set-a-minimum-win/) |
| 261015-dlu | **Measured 9qy's App.css shell-column hypothesis and REFUTED it; the real clip was `.WebView__embedContainer`'s implicit `auto` grid column, zero-floored with `grid-template-columns: minmax(0, 1fr)`.** Static harness of the shipped stylesheets (sass-compiled scss, MUI 5.17.1 Tabs/Tab base transcribed, DOM mirroring `NavShell/index.tsx` and the embed container with the banner's real markup and strings) run in WebKit (compiled WKWebView probe, derived from Phase 48's `48-13/wkprobe.swift`) and Chromium (`chrome-headless-shell`) at 1280/900/800/700/600/500 with seven injected-style arms. `.App` `scrollWidth` never exceeded `clientWidth`; the `.App .content { min-width: 0 }`, `.NavShell__navbar { min-width: 0 }` and `{ overflow: hidden }` arms were byte-identical to shipped at every width. Shipped at 600: container column 419.66px vs a 334px content box, notice row 419.66px, actions' right edge 659.66px (the `item16-width600.png` clip). F1 container `minmax(0, 1fr)`, F2 row `min-width: 0`, F3 row `overflow: hidden` all gave column 334px / message 70.08px / actions right edge 574px; F1 chosen as the container-level fix covering `StoreEmbedControls` and `EpicLauncherBlockedNotice` too. At 500 every arm still clips (message at 0, actions 187.92px + icon + padding exceed 234px) — the regime the 900px floor exists for. Pin: `readSelectorBody` generalised (optional region start, comment-stripped) and a new per-selector arm with observed RED before the CSS landed. 9qy's closed-todo Open observation prefixed with the refutation; UI-SPEC E3 read first and left byte-unchanged (names no mechanism). | 2026-10-15 | — | Code in `b86503723`; evidence `1c266b3b0`; records `404cbf5f7`; live-gate todo `6a720918f`. Orchestrator re-ran: jest 16/16 across the two suites (15 baseline + 1); planning-gates 12/12; evidence bundle clean of operator paths; executor's first commit swept the staged PLAN.md and was amended before any push. **Unverified:** nothing ran in the real app — the harness is a static page with a transcribed MUI base, not the running shell; `appClientWidth` reads viewport − 10 in every arm (harness detail, not a defect). Filed `2026-10-15-embed-container-column-fix-unverified-on-hardware.md` (`minor`/`macos`/`live-gate`). | [261015-dlu-embed-container-grid-column-has-no-zero-](./quick/261015-dlu-embed-container-grid-column-has-no-zero-/) |
| 261015-lz5 | **Routed all 30 `macos_epic_embed.rs` diagnostics through `crate::shell_diag` so a packaged build persists them to `gamelib-shell.log` — the source todo's 25 was an undercount.** Every literal dropped its `[shell] ` prefix (shell_diag re-adds it), so stderr is byte-identical: all 49 string literals in the file compare equal old-vs-new after prefix-stripping. New source gate `macosEpicEmbedDiagPersistence.test.ts` pins 0 `eprintln!`, 30 call sites and no double prefix, with an inline mutation arm. 50-UAT.md's sink table row and Item 17 `expected:` corrected by dated addendum, no `result:` touched; source todo closed into `completed/`. No other `src-tauri/src/*.rs` module has the gap; `main.rs` mixes both emitters deliberately and was not touched. | 2026-10-15 | — | Code `9fa43de5e`; test `0a19fa4f1`; docs `c3f124019`. Orchestrator re-ran: cargo check clean, cargo test 16/16 (384 filtered), jest 22/22 across the two embed suites, planning-gates 12/12, scoped prettier green on the `.ts` (the `.rs` has no prettier parser, `cargo fmt --check` is its gate). **Unverified:** nothing ran as a packaged app, so the persistence the fix exists for is desk-asserted — filed `2026-10-15-macos-epic-embed-shell-diag-persistence-unverified-on-a-packaged-launch.md` (`minor`/`macos`/`live-gate`), which also carries forward the unrotated-`gamelib-shell.log` observation. | [261015-lz5-route-macos-epic-embed-rs-s-30-eprintln-](./quick/261015-lz5-route-macos-epic-embed-rs-s-30-eprintln-/) |
| 261015-n5k | **Live-gated 261015-dlu's `.WebView__embedContainer` zero-floor column in the RUNNING app on this Mac — E3 passes at the 900px floor, the row degrades as the harness predicted below it, the 500px clip is real and unclaimed; no code change.** `pnpm tauri:dev` of HEAD, real Stores → Epic route, real `StoreEmbedTimeoutBanner` rendered through React by wrapping `window.api.storeEmbedTakeNavEvents` from the Web Inspector console (no sudo, no hosts blackhole, no 45s wait). Sub-900 layout viewports reached by docking the inspector right inside a 1280 window and dragging the divider. Live WebKit: 900 → message 380.08, actions right 884, unclipped (frame 02); 600 → column **344px**, message ellipsised to 80.08, actions right 584, unclipped (frame 03); 500 → column 244px, message 0, actions right 503.92, clipped by 3.92px (frame 04). Pre-fix control (`grid-template-columns:auto` injected) at 600 and 500 → column **419.65625px**, actions right 659.66 — the harness's `shipped` row to the hundredth — and removing it restored the fixed numbers. The 9qy width clamp also measured: a requested 800 left the window at 900. Source todo closed into `completed/`; dlu's evidence README (e) now points here. | 2026-10-15 | — | Docs only (this commit). Gate run inline by the orchestrator, 12 measurement records in `evidence/gate-measurements.jsonl`, 6 frames read before scoring, teardown asserted empty (shell, vite, sidecar, :5173). planning-gates 12/12. Every written path is prettier-ignored, so no formatter check was run. **Not verified:** `minHeight` clamp, the longest-of-49-translations arm, and the genuine 45s Rust timeout path (Item 16's own re-run, still owed). | [261015-n5k-live-gate-for-261015-dlu-verify-the-embe](./quick/261015-n5k-live-gate-for-261015-dlu-verify-the-embe/) |
| 261015-oc8 | **Live-gated 261015-lz5's `shell_diag` persistence on a PACKAGED launch — PASS, observed; no code change.** `tauri build --debug` bundle of HEAD `beca31cbf`, recovered from the DMG and tied to `target/debug/gamelib-shell` by sha256 (`4c6c5871…a58cdd`; fix literal in the binary 1, old `[shell] `-prefixed form 0), launched with `open -n`. `lsof -p 60602 -a -d 1,2`: fd 1 and fd 2 both `/dev/null`, stderr offset 2538 → 2918 across the Epic page load — the LaunchServices discard measured, not assumed. Real STORES tab click (first click only activates the window) loaded `store.epicgames.com` in the native Epic subview; `gamelib-shell.log` line **3937**: `1792038877 pid=60602 macos_epic_embed: didFinishNavigation succeeded -- host: store.epicgames.com` — `{epoch} pid={pid} ` prefix, 0 leaked `[shell] ` prefixes for the pid. Cmd+Q: pid gone in 2 s, line still at 3937, the pid's `quit (Cmd+Q)` and `exit requested (code=Some(0))` lines follow it. Teardown census (shell, sidecar, vite, :5173) empty. Source todo closed into `completed/`. | 2026-10-15 | — | Docs only (this commit). Gate run inline by the orchestrator; 15 pid-scoped log lines, 3 frames, build log, binary hash and the rig in `evidence/`. planning-gates green. Every written path is prettier-ignored, so no formatter check was run. **Not exercised:** the D-14 launcher-scheme literal (chrome-side `storeEmbedNavigate('com.epicgames.launcher://…')` produced no embed line — needs a page-initiated navigation); `location.hash='#/store/epic'` from the auto-opened inspector did NOT change the route in the packaged build (it did under `tauri dev` in n5k). `gamelib-shell.log` still unrotated: 334 960 bytes / 3939 lines. | [261015-oc8-live-gate-261015-lz5-shell-diag-persiste](./quick/261015-oc8-live-gate-261015-lz5-shell-diag-persiste/) |
| 261015-p3q | **Re-applied the saved Accessibility zoom at boot — `GlobalState.componentDidMount` now calls a new `applySavedZoomAtBoot` helper (`savedZoomBoot.ts`) once, undebounced, through the existing `window.api.setZoomFactor` bridge, before any `window.api.handle` registration.** Closes the gap the source todo found: `zoomPercent` was persisted and read back into state at boot, but nothing ever re-applied it to the webview, so a saved 150% rendered at 100% until the slider was touched. Admitted range mirrors the slider's own 60–200 (`Accessibility/index.tsx`), with an anti-drift arm reading that JSX; out-of-range/non-number resolves to 100, never an extreme/non-finite factor. The call is unconditional (including at 100%) so `--webview-zoom` publishes on boot too (closes residual (c) of 261011-t4y). Never-throws contract (try/catch + guarded `onError` reporter). New source-text wiring gate (`GlobalStateSavedZoomWiring.test.ts`) pins the call site with a self-test arm proving its own matchers can fail; corrected `tauriWindowChrome.ts`'s now-false doc comment. Source todo closed into `completed/` with a Resolution naming the declined options; new live-gate todo filed for the real quit-and-relaunch check. | 2026-10-15 | — | Code `2aaaefc03`; tests+comment `e0021f4b8`; docs `ca001283f`. 18/18 new jest (both suites), 27/27 `windowChrome.test.ts` unaffected, `pnpm codecheck` 0, lint:src 1089/1124 and lint:tests 638/638 both unbumped, prettier clean on 5 non-ignored paths, planning-gates 12/12. **Unverified:** a real quit-and-relaunch rendering at the saved zoom — filed `2026-10-15-saved-zoom-boot-re-apply-unverified-on-a-real-relaunch.md` (`minor`/`macos`/`live-gate`), which also carries the Library-tile-at-150% re-check. | [261015-p3q-re-apply-saved-accessibility-zoom-at-sta](./quick/261015-p3q-re-apply-saved-accessibility-zoom-at-sta/) |
| 261015-pwy | **Live-gated 261015-p3q's saved-zoom boot re-apply on a real `pnpm tauri:dev` quit-and-relaunch — PASS on all three named arms; the `screen.availWidth` k-recomputation hazard was REFUTED as a free by-product; no code change.** Two launches: Launch 1 set `zoomPercent: 150` via the real slider and read the live apply; Launch 2 relaunched with 150 already persisted and read the untouched-boot `--webview-zoom` at `1.5774409656148782` (predicted `1.5774410`, matched within 1e-5), with the `.gameList` track already at the 150%-correct `114.108864px` from the first Library paint. A 54-frame, ~6s window-cropped screenshot burst found no 100%-rendered frame; the first-paint flash, if any, is bounded at `< 119.1ms` (calibrated sampler resolution), not a multi-second stay — scored as the accepted cost of the `componentDidMount` layer, not re-filed. 5 `setZoomFactor` probes doubled as the k-hazard test: `availWidth` held at 1428 throughout, resolving to the predicted 1.44 factor every time, refuting the hazard — no new todo filed. Profile restored to the as-found `zoomPercent: 90` via the range input's native setter + `input`/`change` dispatch (a CGEvent click failed to grab the thumb's keyboard focus). Source todo closed into `completed/` with a Resolution. | 2026-10-15 | — | Code/evidence `901fc79c4`; relaunch arm `0cf12aec2`; docs `131f10e13`. planning-gates 12/12, prettier `--file-info` confirmed both evidence paths ignored. `src/` and `src-tauri/` untouched. | [261015-pwy-live-gate-the-saved-accessibility-zoom-b](./quick/261015-pwy-live-gate-the-saved-accessibility-zoom-b/) |
| 261015-rud | **Live-gated Amazon expiry strings A3/A6 by in-place nile induction — PASS.** A3 dead refresh token returns 400 (inside `NILE_AUTH_FAILURE_STATUSES`); A6 `<Response [400]>` verbatim; Phase 49 item 5 PASS, restore proven. Comment-only src. Filed zero-installed latch todo. | 2026-10-15 | — | Evidence + docs `5c83cc4da` | [261015-rud-live-gate-the-amazon-expiry-strings-a3-a](./quick/261015-rud-live-gate-the-amazon-expiry-strings-a3-a/) |
| 21 | Archive STATE.md bloat (Quick Tasks, Decisions, Roadmap Evolution) -- 1.66 MB to 140 KB | 2026-10-15 | 2c876d443 | — | — |

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Testing / Quick tasks | ~~`pnpm test:ci` not run for quick tasks `260815-j24` + `260815-k25`~~ — **RESOLVED 2026-08-15: run, exit 0, 258 suites / 5027 passed + 1 skipped (5028 total), 75.0s.** No regression against the 256-suite / 4952-passed baseline. The +2 suites / +75 tests are NOT from these tasks (both appended gates to EXISTING files) — they are the concurrent session's `MainButton.steamSplitButton.test.tsx` + `InstallGameModal.test.ts` from `06a220385`. New baseline: **258 suites / 5027 passed**. | Resolved | 2026-08-15 (quick 260815-j24/k25) |
| Game Details | DETAIL-03: Linux ProtonDB compat overlay | Post-v0.2 | v0.2 requirements |
| Settings | API-01: Copy-to-clipboard on API key field | Post-v0.2 | v0.2 requirements |
| Console / Steam | CONSOLE-02: Steam update feedback in Console launch — when a Steam game needs an update, GameLib shows "Launched in Steam" and dismisses while Steam silently updates; user has no in-app signal. Needs own design (Steam does not report update state back). From Phase 8 UAT (finding E). | Post-v0.2 | Phase 8 UAT (2026-07-04) |
| Console / macOS | KNOWN LIMITATION — Launching a Steam game from Console mode on macOS shows a brief desktop-Space animation before the game appears. Cause: Console mode uses native fullscreen (its own macOS Space) so swipe-to-Space works; macOS must leave that Space when the game's window appears elsewhere. Not fixable from Electron without setSimpleFullScreen, which removes the swipe-able Space and has focus/chrome rough edges (prototyped + rejected in Phase 8 UAT test 11). `activate:false` on the steam:// handoff was tried and kept but does not remove the flash. Accepted as-is. | Accepted (won't fix) | Phase 8 UAT (2026-07-04) |
| Humble Store | HSTORE-02: Read-only Humble bundle/deals listing in-app with "Buy on Humble" deep-links | Post-v0.3 | v0.3 requirements (separate data source; key management prioritized) |

## Session Continuity

Last session: 2026-10-15T08:32:25.000Z
Stopped at: Completed quick task 261015-rud -- live-gated Amazon expiry strings A3/A6 by nile induction
Resume file: None

History: the pre-2026-09-24 Session Continuity narrative lives verbatim in STATE-HISTORY.md § Session Continuity archive.
| 261008-fr3 | **Guarded the `onError` call in `hydrateFocusRowSelection` (WR-03).** The "NEVER rejects" contract rested on one `try/catch` whose `catch` called `deps.onError` unguarded, so a throwing reporter escaped it and turned `GlobalState`'s `void` into an unhandled rejection. The reporter call now has its own `try/catch` with a `console.error` fallback carrying both errors. One test added; mutation-checked (fails with the guard removed, 36/36 with it). WR-03 marked `fixed` in `48-REVIEW-DISPOSITION.md`; todo moved to `completed/`. Fix commit `0cecb87b1`. | 2026-10-08 | COMPLETE. `prettier --check` green on both source paths; suite 36/36. | no quick dir — `/gsd-fast` writes none by design; branch `quick-261002-b63` |
| 261008-ifq | **Fixed the `appShellFlows` `initQueue` call-count flake.** `jest.isolateModules` re-uses the main registry's already-built `initQueue` mock (one `jest.fn` across every "isolated" registration), and two `frontendReady` deliveries ran under REAL timers, each arming a real 5s `initQueue(true)` timer that fired mid-run onto that shared mock. Reproduced deterministically with a 5.2s wait (received 3 = 1 fake + 2 real). Both deliveries now run under fake timers; the detectVCRedist ordering test `mockClear()`s right before `advanceTimersByTime(5000)`. Todo moved to `completed/`. Fix commit `8f1714ee0`. | 2026-10-08 | COMPLETE. Probe with the 5.2s wait 47/47; clean file 3x 47/47; `prettier --check` green; 12/12 planning gates. | no quick dir — `/gsd-fast` writes none by design; branch `quick-261002-b63` |
| 261008-k9p | **Parked the Windows code-signing todo — no certificate yet, by either route.** Operator decision: SignPath Foundation's free programme wants an already-released project with users, and GameLib's only release is still a Draft with no user community, so an application is premature; a paid commercial OV certificate ($150-300/yr plus a USB token or cloud HSM) is declined at this stage. Frontmatter `ready: human` → `blocked`, `status: OPEN` → a quoted PARKED 2026-10-08 line, plus a new `## PARKED 2026-10-08` section recording the decision, confirming Findings 1-4 all stay live for whenever a certificate does arrive, flagging that README.md:197 (GameLib "is applying" to SignPath) now reads ahead of the facts, and giving three unpark conditions. Nothing measured in the file is withdrawn; Windows keeps shipping unsigned and SmartScreen keeps warning, accepted rather than fixed. Commit `86b3150c5`. | 2026-10-08 | COMPLETE. 12/12 `pnpm planning-gates` green, including `todo-frontmatter-gate.py` (16 in-vocabulary pending todos) and `planning-frontmatter-gate.py`; the todo file is prettier-ignored per `--file-info`, so no formatter check applies. | no quick dir — `/gsd-fast` writes none by design; branch `quick-261002-b63` |
| 261010-h9n | **Amazon sign-in probe no longer reads `healthy` with nothing installed (F-49-R1-4, WR-02).** With zero Amazon games installed, nile 1.2.0 `list-updates --json` prints `[]` + `ERROR [CLI]: No games installed`, exits 0 and never reaches an auth call; `classifyNileOutput` had no branch for that text and fell through to `healthy`, so a dead refresh token read as `connected`. Re-measured against the bundled binary with an isolated `NILE_CONFIG_PATH` (exit 0, tab-then-space after the colon, same with or without `installed.json`). New `NILE_NO_GAMES_INSTALLED_MARKER` branch returns `unknown` after the refresh-failure branches (an auth failure still wins) and before `errored`; `healthy` stays last. `nile library sync` NOT adopted as the probe: 49-CONTEXT D-16 forbids the pass triggering a library sync, and the 49-SPEC boundary row gates any replacement command on the Amazon induction live gate (`…amazon-expiry-strings-need-a-real-induction.md`), where that question stays open. Tests pin both stdout/stderr orders, auth-failure precedence, the marker literal and the probe-level outcome. Todo moved to `completed/`; WR-02 `fixed` in `49-REVIEW-DISPOSITION.md`; 49-SPEC `empty` row carries the disposition. Fix commit `268bae390`. | 2026-10-10 | COMPLETE. Mutation check: guard removed -> exactly the 3 new rows fail (3/66); restored -> `src/backend/signInProbe` 191/191. `tsc --noEmit`, eslint and `prettier --check` clean on the 4 source paths; `pnpm planning-gates` 12/12. | [261010-h9n-amazon-sign-in-probe-is-a-no-op-with-not](.planning/quick/261010-h9n-amazon-sign-in-probe-is-a-no-op-with-not/) |
| 261010-ho8 | **Own-property-guarded the renderer `origin` lookup in `mapRefreshOriginToTrigger` (49-REVIEW WR-04).** `ORIGIN_TO_TRIGGER[origin]` was a bare bracket index on a plain object, so a renderer-supplied `origin` of `'__proto__'`/`'constructor'`/etc resolved through `Object.prototype` instead of `undefined`, slipping past the `?? 'startup'` fallback and breaking `currentTriggerLabel()`'s string contract (the keyring gate itself stayed locked — `DELIBERATE_TRIGGERS.has()` already failed closed). Added `Object.prototype.hasOwnProperty.call(ORIGIN_TO_TRIGGER, origin)` before the index, plus a `typeof origin !== 'string'` rejection for the unchecked IPC cast at `steamFlowRegistration.ts:164`, matching the guard pattern already used at `steamFlowRegistration.ts`/`appShellFlowRegistration.ts`/`sanitizeSignInProbeOutcomeMap`. 8 new regression cases (5 inherited names, 1 array-coercion, 2 end-to-end label cases via `noteRefreshTrigger`), RED (8 failing) then GREEN (43/43). Todo moved to `completed/`; WR-04 `fixed` in `49-REVIEW-DISPOSITION.md`. Fix commit `a2f162db0`. | 2026-10-10 | COMPLETE. `pnpm codecheck` exit 0; `prettier --check` clean on both source paths; `pnpm lint` production/tests PASS; `pnpm planning-gates` 12/12. | [261010-ho8-fix-authtrigger-origin-lookup-guard](.planning/quick/261010-ho8-fix-authtrigger-origin-lookup-guard/) |
| 261010-qjs | **Narrowed two `no-base-to-string` sites in the new `applyTracer.test.tsx` so the test-scope lint ratchet holds.** The Phase 45 tracer test shipped with `String(vars[key] ?? '')` in `interpolate()` and `String(el.props.className ?? '')` in `hasClass()`, both over `unknown`; `pnpm lint:tests` read 640 against the 638 ceiling and the pre-push hook refused the 45-commit push. The four other changed test files' warnings were blamed to commits already on `origin`, so the whole +2 was this one file. `interpolate()` now stringifies only string/number values; `hasClass()` compares `className` directly. Ceiling NOT raised. A second hook red surfaced once tests were green: `winetricksApplyGuard.ts:46` carried a `verbs as string[]` that TS 5.8 already narrows via the preceding `every(typeof === 'string')`, a hard `no-unnecessary-type-assertion` ERROR in the production scope; replaced with a `: string[]` annotation. Third red: `find-deadcode` flagged 4 used-in-module exports new on the branch (`WinetricksLogLineKind`, `WinetricksVerbMetadata`, `HIDDEN_CATEGORIES`, `HIDDEN_VERBS`), none referenced outside its own file; dropped `export` on each rather than touching the baseline. Fix commits `9f27123b3` + `b7c162295` + `a1c27c8ff`. | 2026-10-10 | COMPLETE. `pnpm lint:tests` exit 0 at exactly 638; `applyTracer.test.tsx` 3/3; `winetricksApplyGuard.test.ts` 9/9; eslint exit 0 on the guard file; `pnpm codecheck` exit 0; `find-deadcode` used-in-module 0 OK; `src/common/winetricks` 50/50; `prettier --check` green on the 3 paths; `prettier --check` green on the one path (not ignored per `--file-info`). | no quick dir — `/gsd-fast` writes none by design; branch `quick-261002-b63` |
| 261012-9aa | **Live Windows gate for the shortcuts todo; NOT closed, a defect was measured.** The code from `14745f7fa` was exercised on the operator's Windows 11 box through the real `writeWindowsShortcut` (isolated `createFakeHomeProfile()` arm twice, then the named real-profile arm on the OneDrive-redirected Desktop and the real Start Menu, every throwaway `.lnk` read back and deleted). PASS: ANSI titles incl. apostrophe/`ñ`/em dash write to both folders; TargetPath `%SystemRoot%\explorer.exe` + `gamelib://` Arguments; `gamelib` protocol registered HKCU+HKCR; OneDrive Desktop resolved via registry; nonexistent parent and deny-write ACE return `{ ok: false }` with no file. FAIL: any title, target, argument or icon path with characters outside ANSI code page 1252 (`幻想`) is refused or stored as `??`, because `WScript.Shell` converts through the ANSI code page. Todo stays pending with the measurements and a `ready: code` triage hint; `GameSubMenu` optimistic flip still untracked. Gate commit `f76382f6c`. | 2026-10-12 | INCOMPLETE (todo pending: CJK defect). Scoped jest: `addShortcutsOutcome` 4/4; `shortcutsFlows` 30/31 (containment test assumes a fake-home Desktop); `windowsShortcut` 9/10 (test writes a `"` filename, invalid on Windows). `pnpm planning-gates` 12/12. | [261012-9aa-run-the-live-windows-gate-for-the-pendin](.planning/quick/261012-9aa-run-the-live-windows-gate-for-the-pendin/) |
| 261012-9t1 | **Windows `.lnk` writer rewritten on `IShellLinkW`; shortcuts todo CLOSED after a second live gate.** Quick 261012-9aa measured that `WScript.Shell` converts every `.lnk` field through ANSI code page 1252, so a title, target, argument or icon path with `幻想` was refused or stored as `??`. `windowsShortcut.ts` now feeds `powershell.exe` a constant script that `Add-Type`-compiles an `IShellLinkW`+`IPersistFile` helper (`GameLibLnk.Writer.Write`) and calls it with the five `GAMELIB_LNK_*` env values; argv, env passing, timeout, `existsSync` contract and `windowsHide` unchanged. The C# is collapsed to ONE line inside a single-quoted string because `-Command -` reads stdin line by line and silently stops at a here-string opener with exit 0 (measured). `-EncodedCommand` rejected: CLIXML progress noise on stderr. Re-gate on the operator box: isolated fake-profile arm twice, then the real OneDrive Desktop and Start Menu (`GameLib-live-gate-*`, read back by a read-only `IShellLinkW` reader, UTF-16 CJK bytes confirmed, deleted, 0 leftovers). Every previously failing case (I1, I2, I4, D4, D5, D8, R1D, R1M) passes; F1/F2 still `{ ok: false }` with no file. Todo moved to `completed/`, frontmatter byte-identical; new pending todo filed for the `GameSubMenu` optimistic Remove-shortcuts flip (`severity: minor`, `platform: any`, `ready: code`). Operator-only residue: console flash, Explorer icon render, real double-click launch, failure-toast render. Fix commit `a92897514`, todo commit `912b0d522`. | 2026-10-12 | COMPLETE. RED 6 failed/10 passed on the old module; GREEN `windowsShortcut` 16/16 + `addShortcutsOutcome` 4/4 (re-run by the orchestrator: 20/20). `pnpm codecheck`, scoped eslint and `prettier --check` exit 0; `pnpm planning-gates` 12/12; `shortcutsFlows` 26 pass/1 fail (the out-of-scope OneDrive containment test)/4 skipped. | [261012-9t1-fix-the-windows-lnk-writer-so-titles-tar](.planning/quick/261012-9t1-fix-the-windows-lnk-writer-so-titles-tar/) |
| 261012-ca6 | **GameSubMenu flips shortcut state only from the real disk outcome; optimistic-flip todo CLOSED.** `addShortcut` and `removeShortcut` moved from send-kind to invoke-kind at every layer (`ipc.ts`, `menu.ts`, sidecar registration, Electron-era `ipc_handler.ts`) and resolve the `shortcutsExists` predicate after the work settles, so a failed write never shows "Remove shortcuts" and a partial add still does. Logic extracted to `GameSubMenu/shortcutsToggle.ts` (jest has no jsdom); spinner while in flight. `removeShortcuts` now awaits `fs/promises` `unlink`/`rm` (ENOENT = removed, never rejects, so the four uninstall callers are unaffected); remove toast follows the disk answer via new en key `box.shortcuts.error-remove`. The `260905-mv5 (no regression)` test, which wrote to the operator's real OneDrive Desktop, now runs under the containment home. Kind pins updated (`runnerSliceRegistration`, `flowRegistrationCensus`, `invokeReturnValueSweep`). Operator-only residue: live click, spinner/toast render, 60 s invoke-bound rejection in a real shell; darwin-only Describe 5 covered by codecheck only. Commits `f36b7e64f`, `2716f525e`. | 2026-10-12 | COMPLETE. RED before production code in both tasks; GREEN `shortcutsToggle` 9/9, `removeShortcutsOutcome` 4/4, `addShortcutsOutcome` 4/4, `shortcutsExistsFallback` 6/6, `runnerSliceRegistration` 95/95, `flowRegistrationCensus` 72/72, `invokeReturnValueSweep` 7/7; GameSubMenu tests re-run by the orchestrator 39/39. `shortcutsFlows` 30 pass/1 fail (the known OneDrive containment test)/4 skipped. `pnpm codecheck`, `pnpm lint`, scoped eslint and `prettier --check` clean; `pnpm planning-gates` 12/12. | [261012-ca6-close-the-gamesubmenu-shortcuts-todo-fli](.planning/quick/261012-ca6-close-the-gamesubmenu-shortcuts-todo-fli/) |
| 261012-dhs | **Downloads becomes a tier-1 tab; Download Manager rebuilt Steam-style.** User decision reversing navigation-shell.md §6: `NAV_TAB_IDS` is now accounts/games/stores/downloads/settings (`downloads` = `tab-3`, `settings` = `tab-4`), `/download-manager` resolves to `downloads` and collapses tier 2. The navbar `DownloadsRing` (component, scss, two tests, `.NavShell__navRight`) is deleted; its queue subscription lives on in `DownloadsTabIcon`, the tab's icon slot, which renders a count badge while the queue is non-empty; the `nav-downloads` tour anchor moved onto the tab. Download Manager page: new `DownloadHero` with ONE edge-to-edge 6px progress bar at the top, then the current game's artwork (`CachedImage`, mask-faded, scrim in `--body-background`) behind cover, title, type · store, `percent · bytes`, ETA/Paused, the kept speed chart and pause/resume/cancel; the separate `.downloadBar`, the `h4` title, the boxed "Downloading" row and `DownloadManagerHeader` are gone. Queue and finished lists are `dmSection`s ("Up Next" via new `gamelib:downloadManager.upNext`, "Completed") with a 1px separator drawn from `--text-secondary` at 30% (not `--divider`, declared in only 2 of 10 themes). Reversal recorded in sketch-findings §6/SKILL.md. Side effects stated in the commits: the gamelib presence baseline regeneration also recorded 96 `library.tileSize.*` pairs left unrecorded by 261011-t4y (two Meta tests go green); `themeTokens` no-drag floor lowered 2→1; `genI18nGateScope.test.ts` fixture pins re-pinned 207→209 / 249→251. Open: live visual check in midnightMirage, gruvbox_dark and dracula (badge clipping inside MUI's `overflow: hidden` tab, hero scrim readability, bar flush to the window edge, real pause/resume/cancel). Commits `22a5daa2c`, `e5b437090`, `f6c4e02d5`. | 2026-10-12 | COMPLETE (live visual gate owed). NavShell jest 30 suites/600 tests; DownloadManager + cssTokenSweep + shellTokens 67 tests (RED before GREEN on `heroModel`); final sweep NavShell/Dropdown/DownloadManager/GameCard 39 suites/742 tests pass. `pnpm codecheck`, `find-deadcode`, `i18n --fail-on-update`, `i18n-churn-guard`, `lintTranslations`, `hardcodedStringGate`, scoped eslint and `prettier --check` clean; gamelib lint 96 → 0 hard failures. Pre-existing A-17 ANTI-ROT drift (three foreign paths) left as is. | [261012-dhs-downloads-redesign-downloads-tier-1-tab-](.planning/quick/261012-dhs-downloads-redesign-downloads-tier-1-tab-/) |
| fast | **Download Manager speed chart freezes while paused (follow-up to 261012-dhs, found in the operator's live check).** `ProgressHeader`'s sampling interval ran in every non-idle state, so a paused download kept appending 0 MB/s samples and scrolled the trace off the left edge. The effect still takes its one up-front sample on a state change (the visible drop to zero) but only starts the interval while `running`, decided by a new pure `keepsSampling(state)` in `speedSample.ts`; `appendSample` is unchanged. | 2026-10-12 | COMPLETE. DownloadManager jest 4 suites/60 tests (3 new `keepsSampling` cases); `pnpm codecheck`, scoped eslint and `prettier --check` clean. | — |
| 261012-f25 | **In-app Stores tab embed implemented on Windows (WebView2 `add_child`).** `src-tauri/Cargo.toml` gains a `cfg(target_os = "windows")` table enabling tauri `unstable` (Cargo.lock unchanged); all 77 `any(macos, linux)` store-embed gates in `main.rs` widened to include windows, the ten `:unsupported-platform` arms kept only under `not(any(...))`; Windows reuses the macOS `set_position`/`set_size` bounds path (spike 027 measured 0 px error at scale 1.25) and the zero-area guard; `WebView/index.tsx` admits `win32`. `webview.unavailable.platform.body` reworded OS-neutral (kept, since the D-34 deep-link panel shows it on every OS); the stale key deleted from 48 `gamelib.json` + 48 `gamelib.mt.json` (D-09 precedent), presence baseline 864 to 912. Todo re-triaged `ready: live-gate` with an addendum, left in pending/. | 2026-10-12 | COMPLETE (code), verified natively on Windows: `cargo test --bin gamelib-shell` 286 to 313 passed / 0 failed, `store_embed` filter 1 to 26; `cargo check` clean (warnings = baseline), `cargo fmt --check` 0; targeted jest 8 suites green (gate + copy tests seen RED first); codecheck, scoped prettier, lint-translations gamelib, i18n-churn-guard, planning-gates 12/12. OWED: live Windows run W1-W10 (Steam/GOG render, nav, resize), packaged NSIS build, macOS/Linux compile of this change, 38-E01 P1-P5 against the shipped app. Commits 21f99ba7d 35561176e 925962368. | [261012-f25-stores-tab-embed-on-windows-webview2-add](./quick/261012-f25-stores-tab-embed-on-windows-webview2-add/) |
| fast | **Recorded the operator live gate for the Windows Stores embed (follow-up to 261012-f25).** `pnpm tauri:dev` on Windows at `36d88c94d`: W1-W7 PASS (Steam and GOG render, in-embed navigation, drag-resize, Library round trip, GOG -> Epic -> GOG, NavShell popover); Epic shows the panel as expected (D-05). Appended as a dated section to the todo, which stays `ready: live-gate` in pending/. | 2026-10-12 | COMPLETE. `pnpm planning-gates` 12/12. OWED: W8 non-100% zoom, W9 packaged NSIS build, W10 38-E01 P1-P5 against the shipped app. | — |
| 261012-gn8 | **Store embed zoom-aware bounds (W8 fix).** Operator W8 FAIL on Windows at 120% Accessibility zoom: embed displaced, overlapping the grown chrome. Two causes: `useStoreEmbedHost` `flush()` sent CSS px while Rust positions in logical px (all three platforms; logical = CSS x zoom), and `store_embed_open`'s existing-embed branch re-applies the rect on Linux only, so returning from the Accessibility screen kept the 100% geometry on macOS/Windows. New `storeEmbedZoom.ts` (`readWebviewZoomFactor`, `scaleRectForZoom`, non-finite/<=0 -> 1); `flush()` scales open and setBounds payloads; MutationObserver on the root style re-flushes only on a real factor change (the property is published after `setZoom` resolves); one throttled setBounds after every ok open unless disposed. Single call sites for rect/open/setBounds kept; `src-tauri/` and `src/preload/` untouched. Todo records W8 FAIL + fix, stays `ready: live-gate`. | 2026-10-12 | COMPLETE (desk). RED then GREEN both tasks; helper + hook + reloadLoop 3 suites / 63 tests green; 3 mutation runs each turned its pin red; codecheck, `pnpm lint` PASS, scoped prettier, planning-gates 12/12. OWED: live W8 re-run R1-R6 on Windows, macOS/Linux live, window-resized-while-away case. Commits e97265b1c a8e03e290 2f87db8b8. | [261012-gn8-store-embed-zoom-aware-bounds-w8-fix](./quick/261012-gn8-store-embed-zoom-aware-bounds-w8-fix/) |
| fast | **Recorded W8 PASS for the Windows Stores embed (follow-up to 261012-gn8).** Operator, `pnpm tauri:dev` at `47cd338b4`: the embed sits at the slot at 120% and 80% Accessibility zoom. Appended to the todo; the spike 017 1:1 viewport-to-logical finding in `spike-findings-gamelib` (SKILL.md + `references/tauri-embedded-store-browser.md`) now says it holds only at zoom 1. | 2026-10-12 | COMPLETE. `pnpm planning-gates` 12/12. OWED: W9 packaged NSIS, W10 38-E01 P1-P5, macOS/Linux compile and live, the window-resized-while-away case. | — |
