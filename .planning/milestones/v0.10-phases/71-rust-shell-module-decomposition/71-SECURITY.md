---
phase: 71
slug: rust-shell-module-decomposition
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-15
---

# Phase 71 - Security

Verified against current code (post phases 72-80). Paths are repo-relative. Phase 71 is a behaviour-preserving move of the Tauri shell into modules plus repointing of jest/cargo source-text pins, so the register is almost entirely "the move did not change behaviour" and "the pins were repointed, not weakened". Where a mitigation moved or was superseded later, the row says "Drift".

Direct verification on 2026-11-15:
- Greps over `src-tauri/src/**` (assertions in the rows below).
- Targeted jest (6 suites, 403 tests: tauriShellSource, sidecarShutdownFlagSource, openPolicy, macosEpicEmbedSource, loginChromeCssInjection, longRunningChannels): 399 pass, 4 fail. The 4 failures are drift or pre-existing, none a missing mitigation (Observations O-1, O-2).
- `python3 -I tools/moveproof.py --self-test`: SELF-TEST PASS.
- `gh run view` on the five recorded CI run IDs: conclusion success (observed, not just read from SUMMARY).
- Baseline cargo test-name diff (`baselines/wave-0-start` vs `baselines/wave-5-end`, module path stripped): only 4 Wave-0 additions.
Not run: any `cargo` build or `cargo test` (rules out re-observing the Rust-side source-text pins and the `cfg` site-set pin; those are read, and 71-VERIFICATION records 445 then 448 passing); full jest; operator live checks (process evidence only).

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| tooling -> phase verdicts | moveproof.py / baseline.sh decide whether a "mechanical move" is blessed | source text, baselines |
| Rust source text -> jest/cargo assertions | security pins (cookie-call bans, login-sheet presentation, open-path delegation, shutdown ordering) see only what the reader returns | shell source text |
| sidecar -> shell rustInvoke | every frame enters `dispatch_rust_channel`; args via generated `XArgs::from_args` | channel name, JSON args |
| sidecar -> shell_open_path / app lifecycle | OS opener only via the Phase 72 policy; exit/relaunch must set the shutdown flag first | paths, URLs |
| store login/embed pages (remote web content) -> login window, cookie jar, embed webview | credentials, session cookies, navigation/new-window/download hooks, Epic WKWebView policy | cookies, URLs |
| local tree -> CI | Windows/Linux/macOS-gated code compiles only on the matching CI leg | source |

## Threat Register

The register carries 61 entries. IDs T-71-52/53/54 are defined twice with different meanings (71-18 and 71-19); they appear below as `T-71-52 (71-18)` and `T-71-52 (71-19)` etc. See Observation O-4.

Status key: CLOSED = verified in current code or by a direct run; PROCESS = closed on SUMMARY/VERIFICATION/CI evidence, not re-observed (operator live checks and Windows/Linux compile legs).

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-71-01 | Tampering | mitigate | CLOSED | `tools/moveproof.py` self-test asserts a dropped line (go(...,0)==1 at :380), a duplicated line (:382) and an edited handler body (:410) fail; cfg lines allowed only contextually before decl lines (`:133` `is_decl(after_attrs(i))`, `CFG_ATTR_RPC` :40, `RPC_SIG` :39). Self-test run: PASS |
| T-71-02 | Repudiation | mitigate | CLOSED | `tools/baseline.sh:46-47` refuses when `src-tauri/src`, `src/backend` or `meta` is dirty; 98 files under `baselines/` are git-tracked; each `baselines/wave-*/BASE_REF` present |
| T-71-03 | Elevation | mitigate | CLOSED | moveproof self-test fixture has a mid-file `mod shell_open_tests` cut while the following `fn after()` survives (`:366-372`, Pitfall 11). Self-test run: PASS. Drift: moveproof's cutter still handles only `#[cfg(test)]` + `mod`; the stacked/`cfg(all(test,..))` widening landed in the jest and Rust cutters (T-71-55), not in this wave-time tool |
| T-71-SC | Tampering | accept | CLOSED | See Accepted Risks. Cross-check: no phase-71 commit (`git log --grep "(71-"`, 108 commits) touches package.json, pnpm-lock.yaml, src-tauri/Cargo.toml or Cargo.lock |
| T-71-04 | Tampering | mitigate | CLOSED | `src/backend/testUtils/tauriShellSource.ts:211-218` `readTauriShellProductionSource` cuts each file's test mods before concatenation; tauriShellSource.test.ts "pinned needle counts over the production source equal the wave-0 baseline" and the main.rs strip-proof pass (run) |
| T-71-05 | Elevation | mitigate | CLOSED | tauriShellSource.ts:140-179 cutter removes only whole test-gated column-0 `mod` blocks; test "Test 1: .makeKeyAndOrderFront(None) ... appears 0 times in PRODUCTION source" and "Test 4: is_login_cancel_request appear nowhere" pass (run). My grep: `makeKeyAndOrderFront(None)` 0 hits and `is_login_cancel_request`/`LOGIN_CANCEL_EXFIL_PATH` 0 hits across `src-tauri/src/**` |
| T-71-06 | Tampering | mitigate | CLOSED | tauriShellSource.ts:223-258 `readTopLevelFnBody` throws on 0 or >1 definitions, an unterminated body, and `< minLines` (default 3) non-blank lines; `readHandlerBody` (:261-267) wraps it |
| T-71-07 | Information disclosure | accept | CLOSED | See Accepted Risks. tauriShellSource.ts:21-30,48-55 `PRE_SPLIT_SIBLING_MODULES` + `isExcludedShellFile`; `readMacosEpicEmbedSource` :418-431 |
| T-71-08 | Tampering | mitigate | CLOSED | `src-tauri/src/main.rs:3327` `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` exists, reads `shell_production_source()`, asserts an exact (arm, guard) site set incl. the humble_cookies.rs step fns. Direct grep of wry `.cookies()` call sites: `login_window/humble_cookies.rs:136,313,453,494`, each under `#[cfg(not(target_os = "macos"))]`/`#[cfg(all(not(target_os = "macos"), not(windows)))]` (:134,:311,:451,:482). Test itself not run (no cargo) |
| T-71-09 | Elevation | mitigate | CLOSED | main.rs:3112 `the_keyring_available_arm_only_ever_READS_the_probe_account` bounds on `fn rpc_keyring_available(`, anti-vacuity `lines().count() >= 10`, bans `set_password`/`set_secret`/`delete_credential`. Direct: `keyring_dispatch.rs:222-262` handler body reads only `Entry::new(KEYRING_SERVICE, KEYRING_REACHABILITY_PROBE_ACCOUNT)` + `get_password()` |
| T-71-10 | Tampering | mitigate | CLOSED | main.rs:2231-2236 `shell_source_parts_align_with_file_names` (len equal; part i == file i on disk); main.rs:2067-2110 `SHELL_SOURCE_PARTS`. My set diff of `src-tauri/src/**/*.rs` vs the `include_str!` list: the only files absent are the D-11 pre-split siblings and `macos_epic_embed/*` plus `wake_lock/{macos,windows}.rs` (listed past my sed window), no unlisted production file. Test itself not run |
| T-71-11 | Elevation | mitigate | CLOSED | `keyring_dispatch.rs:222-262` (probe-account-only read, verified above); main.rs:3125-3128 anti-vacuity length check |
| T-71-12 | Tampering | mitigate | CLOSED | Router line and handler: `rust_dispatch.rs:24` `KeyringAvailable => rpc_keyring_available(channel, args)`; pins read via `readHandlerBody` (throws on empty/missing, T-71-06). Process: single-commit repoint recorded in 71-04-SUMMARY |
| T-71-13 | Information disclosure | mitigate | CLOSED | `src-tauri/src/notification_show.rs` exists as a flat sibling and is NOT in `PRE_SPLIT_SIBLING_MODULES` (tauriShellSource.ts:21-30), so it is inside the combined source; `notification_backend.rs` stays excluded |
| T-71-14 | Tampering | accept | CLOSED | See Accepted Risks |
| T-71-15 | Elevation | mitigate | CLOSED | `rust_dispatch.rs:39-45` `ShellShowItemInFolder`/`ShellOpenPath` route straight to `shell_open::shell_show_item_in_folder` / `shell_open::shell_open_path`; `shell_open.rs:48,66,77,90` policy fns. `openPolicy.test.ts:156-162` exact router-line regex passes (run). Drift: shell_open.rs is the Phase 72 file (last touched by 72-04 commits), not the pre-72 shape |
| T-71-16 | Denial of service | mitigate | CLOSED | `app_lifecycle.rs:10-16,44-49` `rpc_app_exit` and `rpc_app_relaunch` both call `state.begin_shutdown()` before `app.exit(0)` / `app.restart()`. sidecarShutdownFlagSource.test.ts passes (run, 3 D-01 / mutation tests) |
| T-71-17 | Tampering | mitigate | CLOSED | `app_lifecycle.rs:71-72` `#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]` sits immediately before `fn rpc_app_hide` (contextual placement). Windows clippy ceiling: PROCESS, rust-test.yml run 42445589877 (Wave 1) success on all legs (observed via `gh run view`) |
| T-71-18 | Elevation | mitigate | CLOSED | `login_window/invite_picker.rs:37` `bridge_invite_nav_allowed` and `:160` `.on_navigation(move \|url\| bridge_invite_nav_allowed(url, dev_url.as_ref()))`; unit test `bridge_invite_nav_allowed_accepts_only_app_origins` at :256. Routed at `rust_dispatch.rs:34` |
| T-71-19 | Information disclosure | mitigate | CLOSED | Handlers in `login_window/humble_cookies.rs`; four wry `.cookies()` sites all macOS-excluded (see T-71-08); the exact (arm, guard) set test at main.rs:3327-3600 (not run) |
| T-71-20 | Spoofing | mitigate | CLOSED | tauriShellSource.test.ts (run): "NEGATIVE/RETIGHTENED: the humble_login_open arm has no .on_navigation( call", "Test 2 ... no .on_navigation( closure and no is_login_cancel_request", "Test 1: install_native_login_bar( ... before present_login_window_as_sheet(" all pass. Direct grep: `.on_navigation(` occurs only in `humble_reveal.rs:224,292`, `invite_picker.rs:160`, `store_embed/policy.rs:151`, `store_embed/open.rs:137`; none in `login_window/humble_open.rs` or `sheet.rs`. Drift: handler body now consumed via `readHandlerBodyWithSteps` + `HUMBLE_LOGIN_OPEN_STEPS` (tauriShellSource.ts:278-410) after quick 261111-buh; `listStepLinkageProblems` fails on a renamed/uncalled/duplicated step |
| T-71-21 | Tampering | mitigate | CLOSED | `readTopLevelFnBody` anti-vacuity (T-71-06); line counts recorded in 71-06-SUMMARY (process) |
| T-71-22 | Tampering | accept | CLOSED | See Accepted Risks. Drift: split since done in part (quick 261111-buh), see O-5 |
| T-71-23 | Elevation | mitigate | CLOSED | `rust_dispatch.rs:17-19` `RustInvokeChannel::from_name(channel)` guard returning `rustInvoke:unknown-channel:{channel}` before the `match`; `rust_dispatch.rs:20` match has no wildcard (my grep: `^\s*_ =>` 0 hits in rust_dispatch.rs); exhaustive over the generated enum (`ipc_contract.rs`, 87 arms now). Drift: the jest test "71-07 rust_dispatch.rs is a flat router: 58 one-line arms and no catch-all arm" currently FAILS (expected 58, received 87) because phases 73-80 added channels; the `_ =>` half sits after the stale count so it is not currently executing. Mitigation present; the pin needs updating (O-1) |
| T-71-24 | Elevation | mitigate | CLOSED | `openPolicy.test.ts:156-162` pins `^ {8}RustInvokeChannel::ShellOpenPath => shell_open::shell_open_path\(app, args\),$` against `readTauriShellProductionFile('rust_dispatch.rs')`; matches `rust_dispatch.rs:45`. Run: pass |
| T-71-25 | Tampering | mitigate | CLOSED | Router arms `rust_dispatch.rs:128-137` StoreEmbed* delegate to `rpc_store_embed_*`; Layer 2 `--require-all` proof is a wave-time tool run (self-test PASS proves `--require-all` fails on an inline arm, :391-394). Wave outputs in 71-07-SUMMARY (process) |
| T-71-26 | Tampering | mitigate | PROCESS | Three-leg CI: rust-test.yml run 42445589877 (head e78677442) conclusion success, observed via `gh run view`; 71-08-SUMMARY records ordering honoured |
| T-71-27 | Spoofing / Info disclosure | mitigate | PROCESS | Operator live sign-in and cookie clear, both title-bar modes, approved 2026-11-08 (71-08-SUMMARY "Live check") |
| T-71-28 | Tampering | mitigate | CLOSED | `login_window.rs:15` `mod windows_cdp;` has no cfg; per-item cfgs kept at `login_window/windows_cdp.rs:3,15,23,29,82`; 71-09-SUMMARY records Layer 3 hash equal. Windows compile: PROCESS (run 42445589877, success) |
| T-71-29 | Elevation | mitigate | CLOSED | `bridge_invite_nav_allowed` defined once, in `invite_picker.rs:37` (my grep over `src-tauri/src`), allow-origins unit test at :256 |
| T-71-30 | Information disclosure | mitigate | CLOSED | 71-09-SUMMARY "T-71-30: no visibility widening" (process); `bridge_invite_nav_allowed` is `pub(crate)` (invite_picker.rs:37), consistent with D-15 |
| T-71-31 | Spoofing | mitigate | CLOSED | `.makeKeyAndOrderFront(None)` 0 hits in `src-tauri/src` (my grep); `register_presented_login_sheet(` call sites: `login_window/sheet.rs:515,641,651` = 3 (fn def :528 excluded). Pin `tauriShellSource.test.ts:5002-5003` counts 0 and 3; tests "Test 1 .makeKeyAndOrderFront(None)" and "Test 3 ... exactly three times" pass (run) |
| T-71-32 | Information disclosure | mitigate | CLOSED | `main.rs:3668` `epic_cold_jar_login_timeout_default_store_clear_evicts_disk_and_memory_cache` still present and targets `fn clear_default_data_store_cookies_for_domain` by name (:3677); function lives in `login_window/macos_cookies.rs`. Not run (cargo) |
| T-71-33 | Tampering | mitigate | CLOSED | Structural-bound pins repointed: tauriShellSource.test.ts counts at :4995-5004 (`install_native_login_bar` 2, `register_presented_login_sheet` 3, `request_login_sheet_cancel` 2) pass (run) |
| T-71-34 | Tampering | mitigate | PROCESS | Three-leg CI green for Waves 2+3 on 05bf973bf, run 42469036864 success (observed). Deviation: Wave 2 live check ran before CI (GitHub asset outage), operator-authorised; see O-3 |
| T-71-35 | Spoofing / Info disclosure | mitigate | PROCESS | Operator sign-in/sign-out per store, both title-bar modes, approved (71-11-SUMMARY "Live check", 2026-11-08) |
| T-71-36 | Elevation | mitigate | CLOSED | `store_embed/policy.rs:49` `store_embed_navigation_policy`, blocks-own-scheme / allows-http(s) unit tests at :192,:204,:223; hooks in `store_embed/open.rs:137` and `policy.rs:151`. Handoff-policy pins repointed (tauriShellSource passes) |
| T-71-37 | Tampering | mitigate | CLOSED | `store_embed/open.rs:189` `.on_new_window(` and `:246` `.on_download(` both inside `open.rs` (store_embed_open moved whole); bounded-window pin at tauriShellSource.test.ts:1669 (`+4000`) passes |
| T-71-38 | Tampering | mitigate | CLOSED | `readTauriShellProductionSource` walks every `.rs` under `src-tauri/src` (tauriShellSource.ts:39-47,98-108), so `store_embed.rs` + all five `store_embed/*` children are always in the concatenation; no single-child reads of store_embed text in tests (grep) |
| T-71-39 | Tampering | mitigate | PROCESS | Same CI run 42469036864 (covers Linux layout) success |
| T-71-40 | Elevation | mitigate | PROCESS | Operator popup/handoff exercise, both title-bar modes, approved 2026-11-08 (71-13-SUMMARY) |
| T-71-41 | Elevation | mitigate | CLOSED | `macos_epic_embed/nav_delegate.rs:16` `define_class!` whole; `epic_embed_record_launcher_scheme_block` at :525 called at :117,:393; `decide_policy_for_navigation_response` at :247. macosEpicEmbedSource.test.ts passes (run) reading via `readMacosEpicEmbedSource` |
| T-71-42 | Spoofing | mitigate | CLOSED | `epic_embed_js_dialog.rs:186-204` test asserts absence of `present_native_js_` and `.runModal(` over `concat!` of `macos_epic_embed.rs` + `surface.rs` + `nav_delegate.rs`. Independent grep over `macos_epic_embed.rs` and `macos_epic_embed/`: `present_native_js_` 0 hits, `.runModal(` 0 hits. (Hits exist only in `login_window/pristine_epic.rs` and `dialogs.rs`, the shipped pristine/launch-prompt paths, out of scope for this threat) |
| T-71-43 | Information disclosure | accept | CLOSED | See Accepted Risks |
| T-71-44 | Tampering | mitigate | PROCESS | Run 42507609410 (head b7d55dc8a) success on windows/macos/ubuntu, green before the live check (observed; 71-15-SUMMARY) |
| T-71-45 | Elevation | mitigate | PROCESS | Operator exercised launcher-scheme block, download routing, JS dialogs, both title-bar modes, approved 2026-11-09 (71-15-SUMMARY) |
| T-71-46 | Repudiation | mitigate | CLOSED | Baseline name diff (module path stripped) `baselines/wave-0-start/cargo-names.txt` vs `baselines/wave-5-end/cargo-names.txt`: only `cut_test_modules_cuts_whole_test_mod_blocks_only`, `no_shell_source_test_slices_on_mod_tests`, `shell_production_source_main_part_equals_pre_test_slice`, `shell_source_parts_align_with_file_names` added; nothing removed (my diff) |
| T-71-47 | Elevation | mitigate | CLOSED | `relay_commands.rs:293-357` holds exactly 10 `open_external_*` scheme-check tests (allowed set, rejects file/smb/javascript/no-scheme, accepts steam/app-management/https/mailto, case-insensitive); the self-reading `open_external_command_body_calls_the_scheme_check_before_opening` remains at `main.rs:2492` (Pitfall 13). `open_external_scheme_check` at relay_commands.rs:204 |
| T-71-48 | Tampering | mitigate | CLOSED | `cfg(windows)` single-instance tests present: `single_instance.rs` (5), `single_instance/windows_pipe.rs` (8), `single_instance/windows_protocol.rs` (3) (grep counts of `#[cfg(windows)]`; later quick tasks split the file further). 71-16-SUMMARY: counts equal before/after. Windows compile: PROCESS (run 42511011506 success) |
| T-71-49 | Repudiation | mitigate | CLOSED | Same name diff as T-71-46 (empty apart from Wave 0 additions) |
| T-71-50 | Information disclosure | mitigate | CLOSED | `login_window/humble_helpers.rs:68` `cookie_domain_matches` with unit tests (:475, :488, and 14 more matching `cookie_domain_matches`/`logout_domain` names, 16 total by grep); names present in `wave-5-end/cargo-names.txt` |
| T-71-51 | Tampering | mitigate | CLOSED | `include_str!("../` in `src-tauri/src`: `shell_open.rs:104`, `tray.rs:442`, `main.rs:2365` only (all at src depth, compile-checked), no deeper-path files with a changed depth. Compile proven by CI success on every phase-end run |
| T-71-52 (71-18) | Repudiation | mitigate | CLOSED | Same as T-71-46: wave-0-start vs wave-5-end shows only Wave 0 additions (441 -> 445 passed, +4; `baselines/*/cargo-summary.txt`) |
| T-71-53 (71-18) | Tampering | mitigate | PROCESS | Three-leg CI run 42511011506 (head 3025f9240) success, observed; before the live check (71-18-SUMMARY) |
| T-71-54 (71-18) | Spoofing / Info disclosure | mitigate | PROCESS | Final operator live check, title bar OFF and ON, approved 2026-11-09 (71-18-SUMMARY "Live check") |
| T-71-52 (71-19) | Tampering (regression gates) | mitigate | CLOSED | `sidecarShutdownFlagSource.test.ts` reads `readTauriShellProductionFile` and bounds `eofAfterDrainInReader` to the reader body; the permanent mutation self-tests "the old whole-file pin passes with the production call removed; the new one fails" and "the new pin fails when the production call is moved out of start_reader" pass (run). Demonstrated red recorded in 71-19-SUMMARY:40 |
| T-71-53 (71-19) | Repudiation | mitigate | CLOSED | "the raw readers in src/ and meta/ equal the allow-list exactly", "the scanner is not vacuous", "every allow-listed file exists and labels each raw site `D-10 raw`" all pass (run); `tauriShellSource.test.ts:5084` `RAW_SHELL_READ_ALLOWLIST` with reasons. Residual bypasses: see O-6 |
| T-71-54 (71-19) | Tampering | mitigate | CLOSED | `git status --short src-tauri` is clean today (no stray mutation left in sidecar.rs); 71-19-SUMMARY:40 records clean-before/after and `git checkout --` restore |
| T-71-55 | Tampering (gates) | mitigate | CLOSED | Widened cutters on both sides: TS `classifyCfgTestAttr` / `listRustTestModuleBlocks` (tauriShellSource.ts:93-156; ambiguous shapes throw) and Rust `cut_test_modules` (main.rs:2180-2213, `CfgTest::Ambiguous => panic!`) with `#[should_panic]` tests at main.rs:2257-2266; jest "every test-cfg-gated column-0 mod in every shell file falls inside a cut block" passes (run). Residual: guard is rule-tautological (review GC-WR-01, O-6) |
| T-71-56 | Tampering | mitigate | CLOSED | 71-20-SUMMARY "Counts": all main.rs diff hunks at line 1987 or later, inside `mod tests` (opens 1878), only main.rs changed in src-tauri; 71-VERIFICATION "Re-verification" independently: test-only diff cb69de3e4..HEAD. Cargo 448 pass (71-VERIFICATION, orchestrator evidence; not re-run by me) |
| T-71-57 | Repudiation | mitigate | CLOSED | Exact-match allow-list test (above) plus recorded demonstrated red in 71-20-SUMMARY "Demonstrated red (Task 2)" |

Totals: 61 entries = 46 CLOSED (verified in code or by a direct run) + 10 PROCESS (T-71-26, 27, 34, 35, 39, 40, 44, 45, T-71-53 (71-18), T-71-54 (71-18)) + 5 accepted (T-71-SC, 07, 14, 22, 43). Open: 0. Several CLOSED rows also rest on a process component (Windows-compile legs of T-71-17, 28, 48; wave-time tool runs for T-71-21, 25, 30), noted in their rows.

## Accepted Risks Log

| Threat ID | Risk | Rationale | Verified |
|-----------|------|-----------|----------|
| T-71-SC | Package installs | Phase 71 installs no packages (RESEARCH Package Legitimacy Audit: none) | Yes: no phase-71 commit touches package.json, pnpm-lock.yaml, Cargo.toml, Cargo.lock |
| T-71-07 | `macos_epic_embed` pieces excluded from combined counts | D-11 decision keeps them out so combined counts and absence assertions written against main.rs are unchanged; `readMacosEpicEmbedSource` and the Epic suites cover them separately | Yes: tauriShellSource.ts:21-30,48-55,418-431; macosEpicEmbedSource.test.ts passes |
| T-71-14 | Arg validation not re-proven by this phase | `ipc_contract.rs` `from_args` is generated (Phase 67) and untouched; `pnpm check:ipc-contract` covers freshness | Yes: ipc_contract.rs is in `GENERATED_MODULES` (tauriShellSource.ts:39); dispatcher still calls `from_name` first. `check:ipc-contract` not re-run |
| T-71-22 | Oversized handlers (`rpc_humble_login_open`, `rpc_humble_login_clear_cookies`) extracted whole | D-06: split deferred to todos with `ready: live-gate` | Yes: `.planning/todos/pending/2026-11-08-split-rpc-humble-login-open-into-named-steps.md` (`ready: live-gate`) and `...clear-cookies-into-named-steps.md` exist. Drift: both handlers have since been partly split (step fns), see O-5 |
| T-71-43 | Same D-11 exclusion for the three Epic embed pieces | Their own suites read them via `readMacosEpicEmbedSource` | Yes: same evidence as T-71-07 |

## Observations

- **O-1 (WARNING, drift, not a phase-71 mitigation gap): two router pins are stale and red.** `tauriShellSource.test.ts` "71-07 rust_dispatch.rs is a flat router: 58 one-line arms and no catch-all arm" fails (expected 58, received 87) and "REQ-34.1-07 this is the ONLY new dispatch arm ..." fails (29 extra steamcm/depot/steamfiles/scan arms). Cause: phases 63, 73-80 added channels after phase 71. The code mitigation holds (grep: no `_ =>` in rust_dispatch.rs; exhaustive `match ch`; `from_name` guard), but the `.not.toContain('_ =>')` assertion sits behind the stale count and so is not currently executing. Recommend updating the count to 87 (or deriving it from `RUST_INVOKE_CHANNELS`) and adding the unknown names to `preExistingArms`.
- **O-2 (pre-existing, unrelated to any register entry):** `WR-07 ... .title(` (known in `deferred-items.md`) and `quick-260925-uok ... Gate 4 (T-UOK-03) the repair path uses no '?' try-operator` also fail; neither maps to a Phase 71 threat. The Gate 4 failure output shows `steamcm_dispatch.rs` host code inside the matched region, so its `fnRegion(loadMainRsCode(), ...)` bound looks like a source-reader drift from later phases; owner is the Windows self-heal work, not this phase.
- **O-3 (process deviation):** Wave 2 live check ran before its CI leg (GitHub release-download outage, operator authorised); CI later green on 05bf973bf (run 42469036864, verified). D-03 ordering was otherwise honoured (Waves 1, 4, 5).
- **O-4 (register defect):** T-71-52/53/54 are defined twice with different meanings (71-18 = final-gate coverage/CI/live check; 71-19 = shutdown-pin integrity/raw-reader sweep/sidecar.rs restore). Disambiguated here by plan; plans not renumbered.
- **O-5 (drift, improves T-71-22):** `rpc_humble_login_open` and `rpc_humble_login_clear_cookies` have since been decomposed into named step fns (quick 261111-buh; `HUMBLE_LOGIN_OPEN_STEPS` in tauriShellSource.ts:278-286, step fns in `login_window/humble_open.rs` and `humble_cookies.rs`), with `listStepLinkageProblems` guarding the linkage. The two todos are still in `todos/pending/`; their status may be stale.
- **O-6 (WARNING, hardening carried from 71-REVIEW GC-WR-01..03, 71-VERIFICATION says non-blocking):** the cutter cross-check guard is rule-tautological; the raw-reader allow-list does not list `readMacosEpicEmbedSource` (its two callers use test-inclusive text) and can be bypassed by direct `readFileSync` or import aliasing; Rust-side `include_str!` readers have no raw-reader discipline outside main.rs. No current pin is vacuous (review checked each). T-71-53 (71-19) and T-71-55 are closed on the mitigation as declared; these are residuals, not missing mitigations.
- **O-7 (scope note):** `shell_open.rs` is the Phase 72 allow-list file. T-71-15/24 required the router to delegate to it unchanged, and it does. Phase 71 itself did not author that policy.
- **O-8 (method):** the five 71-VERIFICATION CI run IDs plus 42445589877 were confirmed with `gh run view` (conclusion success). Operator live-check approvals and `cfg`-gated Rust test results are attested, not re-observed.

## Unregistered Flags

None. The 13 SUMMARY files that carry a `## Threat Flags` section (71-06 to 71-15, 71-17, 71-18) all report "None" (71-09, 10, 16, 17 map their notes to T-71-28..33 and 46..51).

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-15 | 61 | 61 (46 code/run-verified, 10 process, 5 accepted) | 0 | gsd-security-auditor |

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter
