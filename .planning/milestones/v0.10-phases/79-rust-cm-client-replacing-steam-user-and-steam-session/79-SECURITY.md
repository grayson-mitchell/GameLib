---
phase: 79
slug: rust-cm-client-replacing-steam-user-and-steam-session
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-17
---

# Phase 79 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register assembled from the `<threat_model>` blocks of all 44 plans (authored at plan time) and verified against the code on 2026-11-17.

---

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CI results -> deletion decision | irreversible removal follows |
| CLI argv/stdin -> crate | headless tools pass op + JSON |
| CLI stdin/argv -> dispatch | operator tools |
| GameLib CM logon -> Mac Steam session | a second logon on the same account may sign Friends out |
| Mac Steam's view -> GameLib library | another process's state decides library content |
| Rust -> TS | refresh token returned once |
| Rust entry -> steamMetadataStore | a Rust write replaces a persisted entry |
| Rust merged entries -> steamMetadataStore | persisted by TS |
| Rust results -> persistent stores | data written to user-state stores |
| Steam CM responses -> library content | untrusted data shapes the visible library |
| Steam PICS buffers -> parsers | untrusted binary and text input |
| Steam response -> parser | untrusted protobuf bodies |
| T-79-22 | Tampering | med | a forged or stale lease id | mitigate | lease set membership check -> LeaseUnknown |
| TS caller -> session actor | lease ids and the token arrive from the sidecar |
| TS callers -> RustCmClient -> rustInvoke | secrets travel as args |
| TS-supplied install state -> assembled library | inputs decide Play/Install state |
| appId -> URL | path or query injection |
| boot -> shell | configure path argument |
| code removal -> runtime behaviour | no fallback remains |
| concurrent writers -> steamMetadataStore | lazy enrichment and per-game capture race the Refresh write |
| configStore on disk -> logOn option | persisted integer |
| connection_log.txt -> crate | Steam-written file read as a signal |
| crate -> Mac Steam (steam:// URLs via shell) | toggles the user's Steam online state |
| crate -> Steam CM (TLS WebSocket) | refresh token sent; responses untrusted |
| crate -> Steam CM (signed in) | account data, product keys |
| crate -> Steam CM anonymous | no account; public data only |
| crate -> api.steampowered.com (HTTPS) | sign-in secrets and tokens in transit |
| crate -> api.steampowered.com | encrypted password, guard code |
| crates.io / codeberg -> build | third-party source compiled into the shell |
| default flip -> every user path | production CM calls switch implementation |
| dependency graph -> shipped bundle | supply-chain surface shrinks |
| docs -> future agents | instructions steer later work |
| helper -> Mac Steam client interfaces | private vtables in another vendor's dylib |
| helper stdout -> Rust parser | untrusted lines |
| helper stdout -> parser | untrusted output |
| live Steam data -> committed fixtures | possible personal data |
| live account -> test session | real sign-out and sign-in |
| local log files -> evidence check | operator's real logs (read-only) |
| meta scripts -> CLI children | spawned processes |
| operator's library -> sweep output | personal data |
| operator's real account -> sweep output | personal and secret data |
| post-deletion build -> users | no fallback exists any more |
| process env -> backend behaviour | dev-only switch |
| public PICS -> platform/metacritic data shown in UI | untrusted strings |
| renderer -> sidecar -> shell | password and guard code travel to Rust |
| session -> Mac Steam state | every wrapped logon toggles Mac Steam offline/online |
| session -> Steam CM | authenticated logon on the user's account |
| session -> Steam CM | reconnects are fresh authenticated logons |
| shell -> OS URL handler | steam:// URLs |
| shell depot job -> sidecar host handler | inbound shell calls |
| sidecar -> crate | plaintext password and guard code cross the rustInvoke pipe |
| sidecar -> helperPath arg -> process spawn | a path from the sidecar becomes an executable |
| sidecar -> shell -> crate | new channels carrying the metadata snapshot and library |
| sidecar -> shell rustInvoke frame | arg shapes validated twice (TS schema, Rust struct) |
| sidecar lifetime -> CM session | teardown ownership moves fully to the shell |
| sidecar rustInvoke JSON -> dispatch | untrusted shape, secrets inside |
| sidecar stdout -> shell router | rustInvoke frames, including forged ones from a compromised sidecar |
| steam-vent tracing -> GameLib logs | third-party log text |
| store data -> renderer | metadata shown on game pages |
| store.steampowered.com -> parsed metadata | untrusted JSON and HTML |
| test procedure -> operator's Mac Steam | Friends session at risk during the D-09 arm |
| token store -> rustInvoke arg | refresh token crosses into the shell |
| user product key -> CM | single-use secret |

---

## Threat Register

Status is the auditor's verdict. "superseded" means a later Phase 79 plan deleted or replaced the component (for example, the TS steam-user/steam-session engine or the go-offline wrap). It is closed only after confirming the code is gone and the equivalent control holds in the Rust replacement where one is needed. Rust paths with a `C/` prefix are under `src-tauri/crates/gamelib-steamcm/src`.

| Threat ID | Category | Component | Disposition | Status | Evidence |
|-----------|----------|-----------|-------------|--------|----------|
| T-79-SC | Tampering | steam-vent git dep etc. | mitigate | CLOSED | Cargo.toml:16 git rev 767481ad pinned (not branch); cargoFeatures.test.ts:261 lists steam-vent* names; 79-01-SUMMARY Task 1 operator "Approved" |
| T-79-01 | Info disclosure | rsa RUSTSEC-2023-0071 | accept | CLOSED | src-tauri/deny.toml:17 carries the justification |
| T-79-02 | DoS | panic kills shell | mitigate | CLOSED | C/lib.rs:409 catch_unwind; test panic_is_caught lib.rs:427 |
| T-79-03 | Info disclosure | secrets on argv | mitigate | CLOSED | gamelib-steamcm-cli/src/main.rs:5-6 header, :23 secret-op list, :155 refuses secret ops on argv |
| T-79-04 | Spoofing | TLS provider | mitigate | CLOSED | C/lib.rs:67 install_crypto_provider (ring); src-tauri/src/main.rs:1710 called in shell |
| T-79-05 | DoS | Friends signed out in test | accept | CLOSED (accepted) | see Accepted risks |
| T-79-06 | Tampering | bypass committed | mitigate | CLOSED | wrappedConnectNow has no live reference in src; 79-02-SUMMARY records revert and `git diff --quiet HEAD -- user.ts` exit 0; user.ts has no wrap:'not-darwin' bypass |
| T-79-07 | Info disclosure | log excerpts | mitigate | CLOSED | 79-WRAP-RETEST.md:45 rule; grep for steamid/7656119/token/accountName/persona finds none |
| T-79-08 | Tampering | odd flag value | mitigate | CLOSED (superseded) | steamCmFlags.ts deleted, GAMELIB_STEAMCM_CM forbidden, pinned by steamCmPortComplete.test.ts:15-40; no rust/ts flag remains |
| T-79-09 | DoS | TS vs Rust session kick (34) | mitigate | CLOSED (superseded) | steam-user and cmLogonId.ts deleted (steamCmPortComplete.test.ts:19, FORBIDDEN 'steam-user' import); package.json has no steam-user/steam-session; only Rust logon remains (rustSession.ts:142 logonId 0 -> vent.rs:186) |
| T-79-10 | Info disclosure | cmLogonId to renderer | mitigate | CLOSED (superseded) | cmLogonId removed from src (only a DELETED-list entry in a test) |
| T-79-11 | Info disclosure | token in Debug/log | mitigate | CLOSED | backend.rs RefreshTokenSecret: no Clone/Display/Serialize, redacting Debug; error.rs:130 secret_debug_is_redacted; lib.rs arg structs derive no Debug |
| T-79-12 | Info disclosure | SSLKEYLOGFILE | mitigate | CLOSED | vent.rs:80-84 guard_env, called at :173 and :233; test vent.rs:601 sslkeylogfile_makes_connect_fail_closed |
| T-79-13 | Spoofing | refusal misclassified | mitigate | CLOSED | error.rs:10 CREDENTIAL_REFUSAL_ERESULTS=[5,15,26,27,63]; tests refusal_table_is_exact :95, transient_kinds_never_refuse :113, replaced_is_34 :106 |
| T-79-14 | Info disclosure | steam-vent log text | accept | CLOSED (accepted) | see Accepted risks; vent.rs:508 enforces WARN+ and steam_vent target only |
| T-79-15 | Info disclosure | token/URL in logs | mitigate | CLOSED | webauth/mod.rs and credentials.rs diag calls (:174,:221,:335,:434,:491,:544) carry transitions/flow kind only; token dropped on done/cancel, tests mod.rs:1077,:1112 |
| T-79-16 | DoS | oversized/stalled response | mitigate | CLOSED | webauth/mod.rs:42 MAX_BODY 64 KiB enforced :181, CALL_TIMEOUT 15 s :40, QR_LOGIN_TIMEOUT 120 s :31, test :709, flow_timeout :798 |
| T-79-17 | Spoofing | TLS downgrade | mitigate | CLOSED | webauth/mod.rs:28 STEAM_API_BASE https; provider installed C/lib.rs:67 / main.rs:1710 |
| T-79-18 | EoP | stale flow reused | mitigate | CLOSED | webauth/mod.rs:514-544 unknownFlow on missing/cancelled/done flows; credentials.rs:257 GuardOutcome::UnknownFlow, tests :727,:739, mod.rs:1009 |
| T-79-19 | EoP | logon after sign-out | mitigate | CLOSED | session.rs:1228-1237 generation fence closes stale conn; :689 bump on sign_out; test logout_during_connect_closes_the_late_conn :1425 |
| T-79-20 | DoS | stalled CM call | mitigate | CLOSED | session.rs:762 LOGON_BOUND timeout in spawned task; test run_op_unknown_lease_and_timeout_do_not_block_the_actor :1472, slow_logon_is_client_not_ready_and_discarded :1441 |
| T-79-21 | Info disclosure | token in diag | mitigate | CLOSED | session.rs:15 hygiene note; token held as RefreshTokenSecret (:156,:485); diag lines in session.rs contain no token (grep diag+token empty) |
| T-79-22 | Tampering | forged lease id | mitigate | CLOSED | session.rs:606,:624 LeaseUnknown on membership miss; :695 on sign_out |
| T-79-23 | Repudiation | Mac Steam left offline | mitigate | CLOSED | session.rs:648-660 Shutdown always runs wrap.pay_owed bounded by timeout; tests :1555,:1569,:1591 |
| T-79-24 | DoS | anon connect hang | mitigate | CLOSED | anon.rs:25 ANON_CONNECT_TIMEOUT 15 s, applied :241 |
| T-79-25 | EoP | anon path uses account | mitigate | CLOSED | anon.rs:4 states no token/shared state; anon.rs imports only session::OpFailure, no RefreshTokenSecret (grep) |
| T-79-26 | DoS | huge/nested PICS | mitigate | CLOSED | ops/pics.rs:52-53 PICS_MAX_BYTES 4 MiB, DEPTH 64; text_limits/bin_limits :61-68; parse failure returned as result :372 |
| T-79-27 | Tampering | shape divergence | mitigate | CLOSED | tests/golden.rs + fixtures (expected.json, rust-results.json) and steamcmGolden.test.ts |
| T-79-28 | Info disclosure | tokens in PICS logs | mitigate | CLOSED | only pics.rs diag (:372) logs counts; no token values |
| T-79-29 | Repudiation | redeem retry | mitigate | CLOSED | ops/account.rs:23 REDEEM_IDEMPOTENT=false (test :173); session.rs:12,:367,:435,:1767 Ambiguous, never resent |
| T-79-30 | Info disclosure | key/code in logs | mitigate | CLOSED | ops/depot.rs:6 and ops/account.rs:3 headers; no diag of values in ops/ (grep) |
| T-79-31 | Info disclosure | persona in test output | mitigate | CLOSED | ops/account.rs:305-330 personas_live prints `player_name present: bool` only |
| T-79-32 | Info disclosure | password/guard code logged or kept | mitigate | CLOSED | R/webauth/credentials.rs:5-6,73-94 (bytes.fill(0)+black_box, no Debug on CredStarted); no log/println in file; S/steamcm_dispatch.rs:405 test secret_bearing_args_debug_redacts_the_secret |
| T-79-33 | Info disclosure | Marvin on rsa 0.9 | accept | CLOSED (accepted) | src-tauri/deny.toml:17 RUSTSEC-2023-0071 ignore with justification |
| T-79-34 | Spoofing | guard code to wrong flow | mitigate | CLOSED | R/webauth/credentials.rs:244-259 flow-scoped (client_id, steamid) lookup, UnknownFlow otherwise; test :722 unknown_flow_is_reported_without_a_request |
| T-79-35 | Tampering | persisted machine token | mitigate | CLOSED | credentials.rs:5 D-08 doc; no fs/File calls in credentials.rs (grep) |
| T-79-36 | DoS | 34 ping-pong | mitigate | CLOSED | R/session.rs:1201-1215 on_logged_off 34 terminal, no rebuild; test :1789 logged_off_34_is_terminal_with_no_reconnect (600s paused) |
| T-79-37 | DoS | unbounded reconnect | mitigate | CLOSED | R/liveness.rs:18-25 RECONNECT_ATTEMPT_BOUND 30s, MAX_ATTEMPTS 4, COMMAND_DEADLINE 120s; liveness.rs:78; test session.rs:1717 failed_rebuild_is_bounded |
| T-79-38 | Repudiation | duplicate redeem | mitigate | CLOSED | R/session.rs:367,425-435 non-idempotent -> Ambiguous, never resent; test :1760 |
| T-79-39 | EoP | rebuild after sign-out | mitigate | CLOSED | R/session.rs:1095-1106 on_rebuilt generation fence, closes conn; logout :689 bumps generation; tests :1425, :1915 |
| T-79-40 | DoS | Mac Steam left offline | mitigate | CLOSED (superseded in part) | Go-offline wrap removed (commit af892de18; CLAUDE.md "no go-offline wrap"); Rust never emits gooffline (wrap.rs only uses STEAM_GO_ONLINE_URL:420). Remaining owed-record restore: R/wrap.rs restore_if_owed, called at EOF/exit S/steamcm_dispatch.rs:368-374, main.rs:758, boot gate TS sidecar/steamCmConfigGate.ts |
| T-79-41 | EoP | silent unwrapped logon on wrap refusal | mitigate | CLOSED (superseded) | GoOfflineRequired/refusal path deleted (grep: no live ref); session.rs:103 before_logon infallible; no wrap that can refuse |
| T-79-42 | Tampering | arbitrary URL via host | mitigate | CLOSED | S/steamcm_dispatch.rs:226-234 ShellWrapHost allows only the two const URLs + open_external_scheme_check; test :578 refuses other URL without calling opener |
| T-79-43 | Tampering | crafted log lines | accept | CLOSED (accepted) | Plan rationale: local file owned by the user's Steam; worst case a refused or extra goonline |
| T-79-44 | DoS | overlapping wraps | mitigate | CLOSED (superseded) | Wrap toggling removed (af892de18); no offline toggle to overlap. Only go-online restore remains, at boot/shutdown |
| T-79-45 | EoP | reconnect bypassing the wrap | mitigate | CLOSED | R/session.rs:760 and :1060 every logon/rebuild calls before_logon; infallible by design (D-09 PASS); test :2080 before_logon,after_logon x2 |
| T-79-46 | Tampering | malformed/extra args | mitigate | CLOSED | R/lib.rs:72-86 parse_args exactly one arg else bad-args; deny_unknown_fields on arg structs lib.rs:92-190; tests lib.rs:492,502 |
| T-79-47 | DoS | nested block_on panic | mitigate | CLOSED | R/runtime.rs:29-34 block_on_guarded Err if Handle::try_current ok; test runtime.rs:50 nested_call_is_an_err_not_a_panic |
| T-79-48 | Info disclosure | secrets via Debug/argv | mitigate | CLOSED | Arg structs derive only Deserialize (lib.rs:92-190, grep shows no Debug); CLI refuses secret ops on argv gamelib-steamcm-cli/src/main.rs:23-27,155; test cli.rs:79 secret_ops_are_refused_on_argv |
| T-79-49 | EoP | unwrapped logon before wrap host | mitigate | CLOSED | R/facade.rs:775 acquire_before_configure_is_client_not_ready; facade.rs:143-153 configure; macOS configure fails without host (S/steamcm_dispatch.rs:341) |
| T-79-50 | Tampering | channel without validator | mitigate | CLOSED | common/types/ipc/rustInvoke.ts rustInvokeArgs; parity test backend/sidecar/__tests__/rustInvokeSchemas.test.ts "exactly one schema per RUST_INVOKE_CHANNELS"; Rust deny_unknown_fields |
| T-79-51 | DoS | 60 s cap kills long reconnect | mitigate | CLOSED | src/backend/sidecar/sidecarRpc.ts:131-155 UNBOUNDED_RUST_CHANNELS includes steamcm channels; :535 only others capped; Rust deadlines liveness.rs:18-25 |
| T-79-52 | Spoofing | provider race / TLS stack | mitigate | CLOSED | S/main.rs:1704-1710 install_crypto_provider() first in main after panic hook; R/lib.rs:67 ring default_provider; test lib.rs:563 |
| T-79-53 | Tampering | arbitrary URL via wrap host | mitigate | CLOSED | Same as T-79-42 (steamcm_dispatch.rs:228-234) |
| T-79-54 | DoS | lease/owed state survives sidecar crash | mitigate | CLOSED | S/steamcm_dispatch.rs:12 STEAMCM_SHUTDOWN_BOUND 5s, :368 EOF hook (wired sidecar.rs:674), :373 exit hook (main.rs:758); test :383 eof_and_exit_hooks_return_within_bound |
| T-79-55 | Info disclosure | args in shell logs | mitigate | CLOSED | S/rust_dispatch.rs:18 logs channel only; steamcm_dispatch.rs:244,352,362 log error/outcome only (no args format); redaction test :405 |
| T-79-56 | Info disclosure | args/results in debug logs | mitigate | CLOSED | T/cm/rustSteamCm.ts:7-8,24 channel-only logDebug; test cm/__tests__/RustCmClient.test.ts:167-170 (SECRET-KEY not in log calls) |
| T-79-57 | Tampering | shape drift Rust vs steam-user | mitigate | CLOSED (superseded) | steam-user removed (not in package.json; 12ac3c547 deleted engine); drift pinned by T/cm/__tests__/steamcmGolden.test.ts + R tests/golden.rs |
| T-79-58 | Info disclosure | token in TS logs | mitigate | CLOSED | T/rustSession.ts logs only err.name/kind (lines 64-66,152,165,178,221); test __tests__/user.rustEngine.test.ts:381-382 not.toContain(SECRET) |
| T-79-59 | Spoofing | credentialsMissing latched on transient failure | mitigate | CLOSED | T/logonVerdict.ts:18-24 + userTypes.ts:47 CREDENTIAL_REFUSAL_ERESULTS gate; rustSession.ts:157-168 only logon-rejected+credential refusal reports expired; credentialsMissing only on token-absent (:131); test user.rustEngine.test.ts:216,257; frozenErrorConstants.test.ts |
| T-79-60 | DoS | TS and Rust sessions kicking each other | mitigate | CLOSED (superseded) | Single engine now: steam-user gone (package.json grep empty); Rust picks its own logonId (rustSession.ts:142, D-18) |
| T-79-61 | EoP | TS lease outlives logout | mitigate | CLOSED | T/user.ts:267 rust.reset() clears leases, :279 invokes RUST_STEAMCM_SESSION_LOGOUT; rustSession.ts:89-99; generation re-check :176-183; test user.rustEngine.test.ts:331 |
| T-79-62 | DoS | boot step holds sidecar alive | mitigate | CLOSED | src/backend/sidecar/steamCmConfigGate.ts:19-20 on-demand only, no timers (grep: no setTimeout/setInterval); bootstrap.ts:1408 configureSteamCm single bounded rustInvoke |
| T-79-63 | EoP | acquire before wrap host configured | mitigate | CLOSED | steamCmConfigGate.ts:30-38 gated channels await ensure(); Rust refuses unconfigured acquire (facade.rs:775 test); tests sidecar/__tests__/steamCmConfigGate.test.ts, bootstrap.steamcm.test.ts |
| T-79-64 | Info disclosure | password/code/token logged | mitigate | CLOSED | T/userSignIn.ts logs fixed strings only (lines 219,307-560); test __tests__/userSignIn.rustEngine.test.ts:495 never logs the password, code or token (loggedText :104) |
| T-79-65 | Spoofing | stale QR after rotation | mitigate | CLOSED | T/userSignIn.ts:381-385 returns challengeUrl when it differs from slot.lastChallengeUrl; test userSignIn.rustEngine.test.ts:135 |
| T-79-66 | DoS | wait loops hold sidecar | mitigate | CLOSED | T/userSignIn.ts:104 handle.unref?.(); test userSignIn.rustEngine.test.ts:286 setTimeout spy asserts unref; Rust deadlines end loops |
| T-79-67 | Repudiation | token lost if persona logon fails | mitigate | CLOSED | T/userSignIn.ts:178-203 setToken before persona logon (D-06); test userSignIn.rustEngine.test.ts:153 |
| T-79-68 | Info disclosure | account data in fixtures | mitigate | CLOSED | Only SteamID-shaped value in crate fixtures/meta fixtures is the public example 76561197960287930 (grep 7656119\d{10} over src-tauri/crates/gamelib-steamcm/tests, meta/fixtures); 79-21-SUMMARY.md:61 records 0 hits for operator id/name |
| T-79-69 | Info disclosure | CLI children real profile | mitigate | CLOSED | meta/gamelibSteamcmCli.ts:99 fresh createFakeHomeProfile per call; gate src/backend/__tests__/fakeHomeIsolation.test.ts |
| T-79-70 | Info disclosure | secrets on argv | mitigate | CLOSED | meta/gamelibSteamcmCli.ts:95 throws "takes secrets"; STEAMCM_SECRET_OPS mirrors Rust SECRET_OPS; test meta/__tests__/gamelibSteamcmCli.test.ts:63; Rust refusal src-tauri/crates/gamelib-steamcm-cli/src/main.rs:155 |
| T-79-71 | Info disclosure | codes/tokens in logs | mitigate | CLOSED | src/backend/sidecar/depotHostRegistration.ts:43-46 logs channel, jobId, name only; header doc :17-19; 79-22-SUMMARY evidence is counts only |
| T-79-72 | DoS | download failing for lack of tokens | mitigate | CLOSED | 79-22-SUMMARY.md:35-44 advisory evidence (0 non-empty tokens, 115 empty); no todo needed since finding empty; live downloads pass in 79-UAT.md items 2 and 19 (Hell Clock native depot download completed on Rust path) |
| T-79-73 | Tampering | forged inbound host frames | mitigate | CLOSED | src/common/types/ipc/sidecarInternal.ts:197-199 depotCdnToken/depotManifestRequestCode/depotJobEvent = 'shell'; validateInbound called at src/backend/sidecar/sidecarRpc.ts:291 (ipcValidation.ts:49) |
| T-79-74 | Repudiation | double redeem / false failure | mitigate | CLOSED | Rust ops/account.rs:7-9 REDEEM not idempotent, Ambiguous not resent; TS userRedeem.ts:54-77,135-157 licence-diff verification; tests userRedeem.rustEngine.test.ts:72,88,103,115,133 |
| T-79-75 | Info disclosure | product key logged | mitigate | CLOSED | userRedeem.ts:91 (never log raw key); logger spy test userRedeem.rustEngine.test.ts:37-42,143 "never logs the product key"; ops/account.rs:3-4 |
| T-79-76 | Info disclosure | sweep output / PARITY | mitigate | CLOSED | 79-PARITY.md grep for key pattern, SteamID, /Users/ = no hits; counts/classes only. Sweep tool deleted in 79-42 (no meta/steamcmParitySweep.ts, no package.json script) |
| T-79-77 | DoS | sweep kicking sessions | mitigate | CLOSED (superseded) | Sweep tool removed (git ls-files: only depotParitySweep remains, unrelated); sweep ran once on operator Mac per 79-PARITY.md (distinct logonId, token on stdin); nothing remains to execute |
| T-79-78 | Info disclosure | token on argv | mitigate | CLOSED | Same as T-79-70 (CLI refuses secret ops on argv, main.rs:155; TS helper refuses, gamelibSteamcmCli.ts:95); sweep runner deleted |
| T-79-79 | Repudiation | divergences silently accepted | mitigate | CLOSED | 79-PARITY.md DV-79-01..13 each carry an explicit "accepted:" operator decision (lines 55-294), status "APPROVED (CM ops)" |
| T-79-80 | Tampering | flip before parity approved | mitigate | CLOSED | 79-PARITY.md line 3 "Status: APPROVED (CM ops)"; flip occurred in 79-26 after it |
| T-79-81 | Repudiation | unexecutable UAT item | mitigate | CLOSED | 79-UAT.md carries Structural Reachability Review (79-25-SUMMARY.md:31,35); items executed with results in 79-UAT.md |
| T-79-82 | DoS | operator locked out after Rust sign-in | mitigate | CLOSED (superseded) | Flip gated on UAT items 5-7 pass (79-26-SUMMARY.md:23). GAMELIB_STEAMCM_SIGNIN=ts toggle now deleted: only reference is the absence-pin src/backend/__tests__/steamCmPortComplete.test.ts:41; steam-session removed (79-40+), so rollback is by revert |
| T-79-83 | Info disclosure | log excerpts in UAT results | mitigate | CLOSED | 79-UAT.md grep for SteamID/email/password-style tokens = none; results quote channel/log-line names (79-26-SUMMARY.md:25 notes name proof via stored userData, not quoted) |
| T-79-84 | DoS | slow demos stage | mitigate | CLOSED | owned_demos.rs:29 LICENSED_DEMOS_TIMEOUT 30 s; :212 tokio timeout; failure -> empty demos (:216-222); tests :601 (never settles -> empty after 30s), :635, :654 |
| T-79-85 | Tampering | malformed package info | mitigate | CLOSED | owned_demos.rs test :361 string_appids_are_accepted_and_non_positive_skipped; assemble.rs:63 malformed rows skipped |
| T-79-124 | Tampering | precedence error showing Play | mitigate | CLOSED | assemble.rs:124 bridge_authoritative, :186-204 native>bottle>bridge, :258 is_installed derived from chosen map; tests :449 native_wins_over_bottle_wins_over_bridge, :482 bridge_authoritative_by_arch_32 |
| T-79-86 | Tampering | crafted oslist / metacritic | mitigate | CLOSED | capture.rs:50-67 closed set windows/macos/osx/linux, unknown ignored; enrich.rs:63-76 parse_metacritic_score digits only, 1..=100; tests capture.rs:417,429,439 |
| T-79-87 | EoP | account session where anonymous suffices | mitigate | CLOSED | capture.rs:3, :330 anonymous pass first, held lease only for remainder; test summary at :371 |
| T-79-125 | Tampering | PICS overriding newer appdetails | mitigate | CLOSED | capture.rs:137 merge_platforms via meta_entry.rs:215 resolve_platform_write; test capture.rs:546 merge_platforms_declines_against_a_newer_complete_appdetails_write |
| T-79-88 | Tampering | non-numeric appId in URL | mitigate | CLOSED | store_http.rs:337 all-digits check before URL build; test :663 non_numeric_app_id_is_rejected_without_a_request; enrich.rs:68 |
| T-79-89 | DoS | huge/slow body, rate limit | mitigate | CLOSED | store_http.rs:16 MAX_BODY_BYTES 2 MiB (:362,:368 enforced, test :728); :14 METADATA_FETCH_TIMEOUT 15 s; enrich.rs:28 ENRICH_STAGE_BUDGET 20 s; enrich.rs:356 stop at 429/403, tests :787,:803 |
| T-79-90 | Tampering | HTML requirements to renderer | mitigate | CLOSED | store_http.rs parse (lines ~84-200) yields numbers/strings only (tests :539-552); no markup passthrough |
| T-79-123 | Tampering | Rust entry dropping persisted fields | mitigate | CLOSED | meta_entry.rs:98 #[serde(flatten)] passthrough; test :409 unknown_and_bridge_fields_round_trip; merge fns clone `existing` (capture.rs:130-157, enrich.rs:132) |
| T-79-91 | Tampering | unvalidated Refresh args | mitigate | CLOSED | refresh/mod.rs:50,68 deny_unknown_fields typed RefreshArgs/RefreshSource; lib.rs:357 parse_args; lib.rs:93-117 |
| T-79-92 | DoS | Refresh killed by 60 s cap / never returns | mitigate | CLOSED | sidecarRpc.ts:131-149 UNBOUNDED_RUST_CHANNELS includes RUST_STEAMCM_REFRESH (:533-535); Rust refresh/mod.rs:42 REFRESH_DEADLINE 150 s, :138,:146 returns {ok:false,kind:"timeout"} |
| T-79-126 | Info disclosure | payloads in logs | mitigate | CLOSED | owned_demos.rs:193 diag counts only; steamcm_dispatch.rs:3,355 outcome/op name only, never args; rustRefresh.ts logInfo counts only (:336-341) |
| T-79-93 | Tampering | games bypassing schema strip | mitigate | CLOSED | rustRefresh.ts:312-315 stripToSchema + invalidPaths on receipt before state/store; test library.rustRefresh.test.ts:279 |
| T-79-94 | DoS | Refresh failure wiping cache | mitigate | CLOSED | rustRefresh.ts:342-348 failOwned -> restoreLocalSteamLibrary; test library.refresh.rust.test.ts:241 |
| T-79-127 | Tampering | Refresh clobbering newer lazy write | mitigate | CLOSED | rustRefresh.ts:252-267 snapshot-equality under withPlatformCaptureLock, staleSkipped counted; test library.rustRefresh.test.ts:224 |
| T-79-95 | Tampering | Rust merge vs axios path | mitigate | CLOSED (superseded) | Fixture-equality test was never run (79-32 SUMMARY deviation 2). The axios path is now deleted (no axios in storeManagers/steam/gameMetadata.ts), so no second path can diverge. Merge carried by gameMetadata.rust.test.ts (persist/delisted/cached tests, passing) and Rust refresh/enrich.rs tests. |
| T-79-96 | DoS | slot not released on Rust failure | mitigate | CLOSED | gameMetadata.ts:137-143 finally releases slot; gameMetadata.rust.test.ts:140-146 "writes nothing on %s and still releases the slot" (noData, failure, rejection); passing |
| T-79-97 | Info disclosure | IDs in committed sweep output | mitigate | CLOSED | Sweep had redact() mapping /7656119\d{10}/ to <steamid> (de9262a4f:meta/steamcmRefreshParitySweep.ts:220-225). grep of 7656119\d{10} over 79-PARITY, 79-UAT, 79-WRAP-RETEST, 79-33..38 SUMMARY = 0 hits. |
| T-79-98 | Tampering | sweep writes real stores | mitigate | CLOSED | Sweep used createFakeHomeProfile + mkdtemp roots (de9262a4f sweep lines 428, 481). Sweep itself since deleted in 34d54dd49. |
| T-79-99 | DoS | kicking app session/Friends | mitigate | CLOSED | Sweep had "precondition failed" abort paths (lines 697, 702); later live Friends checks UAT items 13/18/21 and e70995a2c fix. |
| T-79-100 | DoS | steamclient.dylib crash | mitigate | CLOSED | Out-of-process spawn macowned.rs:163-170 (Command, kill_on_drop); any non-zero exit maps to FallbackReason in parse_helper_output (macowned.rs:95-); helper alarm() in gamelib_ownedapps.h:88. |
| T-79-101 | Tampering | slot resolution | mitigate | CLOSED | gamelib_ownedapps.h:67 gl_oa_find_unique + gl_oa_unresolved (exit 3), GL_OA_MAX_SLOTS 400, GL_OA_MAX_APPS 100000 (lines 33-34, 133). Rust also count==len and <=MAX_APPS (macowned.rs:121). |
| T-79-102 | Spoofing | other account's library | mitigate | CLOSED | gamelib_ownedapps.h:122-128 sid==expect else exit 2 account-mismatch; macowned.rs:141,363-366,554-558 maps to AccountMismatch fallback (tested). |
| T-79-103 | Info disclosure | SteamID printed | mitigate | CLOSED | Helper emits only {"step":"account","match":bool} (gamelib_ownedapps.h:124). Residual: id on argv (macowned.rs:159-162 documents as accepted by operator, public ID). |
| T-79-104 | EoP | arbitrary exe via helperPath | mitigate | CLOSED | steamcm_dispatch.rs:43-63 helper_path_ok: absolute, no ParentDir, name steam-bridge-helper, canonical equals the shell's BUNDLED_HELPER; used at :109 for refresh source too; tests at :452-521. Argv-form Command, no shell (macowned.rs:163). |
| T-79-105 | DoS | hung helper | mitigate | CLOSED | HELPER_TIMEOUT 30s (macowned.rs:32), tokio timeout + kill_on_drop (:168-172), test hung-helper dead check (:514-538). |
| T-79-106 | Tampering | malformed output | mitigate | CLOSED | Strict parse macowned.rs:95-132 (last line ok==true, count==len, MAX_APPS, ids u32>0, MAX_STDOUT at :166); all failures are fallbacks, tests :363,:554-594. |
| T-79-107 | Spoofing | other account's library | mitigate | CLOSED | Same helper GetSteamID guard + AccountMismatch fallback; TS rustRefresh.ts handles macFallback then CM (library.macSteamRefresh.test.ts "macFallback: logs the reason, then runs the CM path", passing). |
| T-79-108 | DoS | Mac path failure blocks Refresh | mitigate | CLOSED | library.macSteamRefresh.test.ts :224 (fallback), :250 (transport rejection), :258, :287 (never sent cases), :310 (opt-out); Rust macowned tests per reason; 43 tests pass. |
| T-79-109 | Info disclosure | IDs in PARITY | mitigate | CLOSED | Zero 7656119\d{10} matches in 79-PARITY.md and phase UAT/SUMMARY files. |
| T-79-110 | DoS | helper left renamed | mitigate | CLOSED | 79-UAT.md item 13 result: "Helper restored; test -x public/bin/arm64/darwin/steam-bridge-helper passes"; item not complete until check passes (UAT.md:123). |
| T-79-111 | DoS | Friends signed out in D-09 arm | accept | CLOSED (accepted) | See Accepted risks. Observed outcome: PASS, Friends online 90 s (UAT item 13, 79-WRAP-RETEST verdict PASS). |
| T-79-112 | Repudiation | deletion without proof | mitigate | CLOSED | 79-PARITY.md:316 "Status: DELETE GATE MET" with run ids 43692870596, 43691683424, 43692870623; post-deletion 43748179863/43748179910. |
| T-79-113 | DoS | Friends sign-out found after wrap deleted | mitigate | CLOSED | Item 13 (Friends stayed online) passed before deletion; gate commit 1d6e9e71e (2026-11-15 21:18) precedes wrap deletion c85f177bf/ad5a128ad. |
| T-79-114 | DoS | orphan sidecar/session after deletion | mitigate | CLOSED (with note) | Shell hooks: steamcm_dispatch.rs:350-386 (steamcm_shutdown on sidecar EOF and exit, bounded). package.json smoke:sidecar and smoke:exit-check exist; smoke:sidecar PASS (79-39, 79-42); UAT item 25 Cmd-Q no orphan, passed live. Note: smoke:exit-check automated run was INVALID in 79-39 (needs manual Cmd+Q); covered by live UAT 25. |
| T-79-115 | Repudiation | deleting before gate | mitigate | CLOSED | 79-39-PLAN.md:73 verify begins `grep -q 'Status: DELETE GATE MET'`; git order: gate 1d6e9e71e 21:18 before deletion 12ac3c547 21:37. |
| T-79-116 | DoS | owed record never paid | mitigate | CLOSED | session.rs:125-142 RestoreOnlyWrap::pay_owed calls wrap::restore_if_owed; shutdown hook steamcm_dispatch.rs:350-386; test restore_only_wrap_shutdown_delegates_to_restore_if_owed (session.rs:2141). |
| T-79-117 | EoP | silent logon on FAIL after TS wrap deleted | mitigate | CLOSED (mitigation differs from plan text) | Plan said Rust MacWrap guards every logon; actual design is D-09 PASS: RestoreOnlyWrap (session.rs:130-143) has no logon guard. The FAIL condition did not materialise: UAT B item 13 (Friends online, no LogOff) and part C items 20-25 passed live; e70995a2c fixed the one sign-out cause found. |
| T-79-118 | DoS | deleted helper still reached | mitigate | CLOSED | No import of deleted modules (steamCmPortComplete.test.ts, 24 cases, passes; scan floor 500 files); deleted files absent (steamUserLogonAbort, macSteamOffline.ts, cdnAuth.ts, steamCmFlags.ts); tsc/jest evidence in 79-39..42 SUMMARY. |
| T-79-128 | Tampering | source gate dropped with TS code | mitigate | CLOSED | 79-41-SUMMARY lists retargets (metadataCapture.test.ts reads refresh/assemble.rs and enrich.rs) and a table of deleted TS tests to named Rust carriers (capture.rs, meta_entry.rs, owned_demos.rs, enrich.rs, assemble.rs). Carrier names not individually re-run. |
| T-79-119 | DoS | SEA bundle breaks | mitigate | CLOSED | 79-42-SUMMARY: pnpm build:sidecar, build:sidecar-sea (arm64), smoke:sidecar pass; no steam-user/steam-session/lzma/zstddec specifiers left in src or meta (only comments in meta/buildSidecarSea.ts, esbuildWorkerBundleShared.ts); the smoke:sidecar script exists in package.json. |
| T-79-SC2 | Tampering | lockfile churn | mitigate | CLOSED | `git show 34d54dd49 -- pnpm-lock.yaml`: 0 added lines, 337 deletions; package.json/pnpm-workspace.yaml diff only removals; package.json now has 0 steam-user/steam-session entries. |
| T-79-120 | Repudiation | stale stack record | mitigate | CLOSED | STEAM-STACK.md:11 "Amended by Phase 79"; CLAUDE.md:29,41 mark steam-user/steam-session retired and replaced (line 22 constraint text is a historical option list). |
| T-79-121 | Tampering | port-complete scanner vacuous | mitigate | CLOSED | steamCmPortComplete.test.ts:143-144 floor >= 500 scanned files; synthetic `from 'steam-user'` anti-vacuity cases; suite passes (24). |
| T-79-122 | DoS | regression only visible w/o fallback | mitigate | CLOSED | 79-44: UAT part C items 20-25 pass live on post-deletion build; rust-test 43748179863 green on 3 legs; test.yml 43748179910 only baseline + other-session failures (79-PARITY.md:~330). |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Threat Ref | Component | Rationale / Evidence | Accepted By | Date |
|------------|-----------|----------------------|-------------|------|
| T-79-01 | rsa RUSTSEC-2023-0071 | rsa 0.9 is pinned by steam-vent. It is used only for RSA public-key encryption of the sign-in password; no private key is held and no decryption is done, so the Marvin timing channel has no target. Justification in src-tauri/deny.toml:17. Revisit when steam-vent moves to rsa >= 0.10 | plan-time disposition (Phase 79 plan) | 2026-11-17 |
| T-79-05 | Friends signed out in test | Operator-run, observed live test; recovery is a Mac Steam re-sign-in. Spike 075 found it safe (2026-11-09); 79-02-SUMMARY records "Stayed signed in" | plan-time disposition (Phase 79 plan) | 2026-11-17 |
| T-79-14 | steam-vent log text | Only WARN+ events from steam_vent targets are forwarded (vent.rs:508). The messages are protocol errors, and 085 showed none carry tokens. Revisit if a token-bearing message appears | plan-time disposition (Phase 79 plan) | 2026-11-17 |
| T-79-33 | Marvin on rsa 0.9 | src-tauri/deny.toml:17 RUSTSEC-2023-0071 ignore with justification | plan-time disposition (Phase 79 plan) | 2026-11-17 |
| T-79-43 | crafted log lines | Plan rationale: local file owned by the user's Steam; worst case a refused or extra goonline | plan-time disposition (Phase 79 plan) | 2026-11-17 |
| T-79-111 | Friends signed out in D-09 arm | An operator-observed single Refresh decides the wrap's fate. Outcome: PASS, Friends online 90 s (UAT item 13, 79-WRAP-RETEST verdict PASS) | plan-time disposition (Phase 79 plan) | 2026-11-17 |
| (T-79-103 note) | SteamID64 on Mac helper argv | Accepted by operator decision (C/macowned.rs:159-162); not treated as a leak under T-79-103 | operator | 2026-11-17 |

*Accepted risks do not resurface in future audit runs.*

### Auditor notes (non-blocking)

- T-79-31/T-79-12: the live persona tests are `#[ignore]`d, so this control rests on code inspection plus the unit test.
- T-79-27/T-79-60: shape parity rests on the golden fixtures (`tests/golden.rs`, `steamcmGolden.test.ts`). This audit confirmed they exist but did not re-run them.
- T-79-95: the axios-vs-Rust fixture-equality test never ran. It is closed because the axios path is deleted.
- T-79-116/T-79-117: the plan describes a Rust `MacWrap` that guards logons, but the shipped design is `RestoreOnlyWrap` (D-09 PASS). These are closed on live UAT evidence (B item 13, C items 20–25) and fix `e70995a2c`.
- T-79-114: the 79-39 `smoke:exit-check` run was INVALID. Orphan-free exit rests on `smoke:sidecar` PASS and UAT item 25.
- T-79-72: the plan cites "part B item 8", which no longer exists after renumbering. The evidence is UAT items 2 and 19.
- Post-deletion CI has 4 failures that come from other sessions, not from phase 79 code (themeTokens, flowRegistrationCensus, ipcDomainCensus, steamLineCeiling).

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-17 | 130 | 130 | 0 | gsd-security-auditor ×4 (plans 01–09, 10–20, 21–31, 32–44) |

## Security Audit 2026-11-17
| Metric | Count |
|--------|-------|
| Threats found | 130 |
| Closed | 130 |
| Open | 0 |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-17
