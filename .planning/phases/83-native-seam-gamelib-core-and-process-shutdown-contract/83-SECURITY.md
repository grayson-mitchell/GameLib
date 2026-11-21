---
phase: "83"
slug: "native-seam-gamelib-core-and-process-shutdown-contract"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-21"
---

# Phase 83 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (83-01..83-11 `<threat_model>` blocks). ASVS L1: grep-depth evidence; auditor
> not spawned (short-circuit: threats_open 0, register authored at plan time, asvs_level 1).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| operator terminal / machine -> committed gate evidence | ps snapshots and logs can carry user names, paths and SteamIDs | pids, process names, literals, counts only (low) |
| exit path | runs on the main thread after the event loop ends; a hang orphans helpers or blocks logout | registrant names, durations |
| renderer / remote content -> Rust relay commands | renderer names a channel and passes args; the native router validates instead of the sidecar's zod | channel names, IPC args, URLs (untrusted) |
| generator input -> allow-list | nativeChannels.json widens RENDERER_CHANNELS | reviewed source |
| GameLib -> OS process table | kill-tree signals groups and Jobs; a wrong id kills unrelated processes | pgids |
| GameLib -> launched game | a game must outlive GameLib | process lineage |
| app -> reaper control pipe / reaper -> OS | the reaper outlives the app and signals groups the app registered | registered pgids + start times |
| argv -> fn main | anyone can run the binary with --gamelib-reaper | argv |
| shell main thread -> OS opener | Windows open_url can block on a dialog | URL |
| OS logout/shutdown -> app exit | the OS force-kills a slow app | exit timing |
| local checkout -> origin/main | pushed commits run CI and become the shared baseline | source |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-83-01 | Repudiation | gate contract | medium | mitigate | 83-HUMAN-UAT.md `authored_by: 83-01`, `run_by: 83-11` (D-E) | closed |
| T-83-02 | Information Disclosure | /tmp session captures | low | mitigate | captures under /tmp, uncommitted; HUMAN-UAT records pids/names/literals only | closed |
| T-83-03 | Denial of Service | run_exit | high | mitigate | `drain_budget` + condvar deadline in `gamelib-core/src/shutdown.rs` | closed |
| T-83-04 | Denial of Service | Shutdown locks | medium | mitigate | `unwrap_or_else(\|e\| e.into_inner())` in `gamelib-core/src/shutdown.rs:45,103` | closed |
| T-83-05 | Information Disclosure | ExitReport | low | mitigate | report carries static names + duration (83-02 SUMMARY) | closed |
| T-83-06 | Elevation | RENDERER_CHANNELS union | high | mitigate | `check:ipc-contract` in `.husky/pre-commit:50` and `codecheck.yml:30`; parseNativeManifest refusals; router-keys test | closed |
| T-83-07 | Tampering | native invoke args | medium | mitigate | positional serde args + data-driven invalid vectors (83-03 SUMMARY) | closed |
| T-83-08 | Information Disclosure | INVALID_ARGS payload/logs | medium | mitigate | echo_channel-cut name, sanitised paths; sentinel test (83-03 SUMMARY) | closed |
| T-83-09 | Denial of Service | sidecar_invoke native path | low | mitigate | `spawn_blocking` in `src-tauri/src/relay_commands.rs:53,59` | closed |
| T-83-10 | Elevation / DoS | kill_process_group, terminate_group | high | mitigate | `pgid <= 1` refusal in `gamelib-proc/src/kill_tree.rs`, `proto.rs`, `children.rs`; test `kill_process_group_rejects_non_positive_and_init_pgids` | closed |
| T-83-11 | DoS (user's game) | spawn_game | high | mitigate | `fn spawn_game` in `gamelib-proc/src/spawn.rs`; harness `tests/orphans.rs`; live UAT test 1 pass | closed |
| T-83-12 | Elevation | Windows Job | medium | mitigate | per-helper Job, no breakaway, log-and-fallback (83-04 SUMMARY) | closed |
| T-83-13 | DoS (CI) | tests/orphans.rs | low | mitigate | bounded polls, drop guard, FakeHome (`gamelib-testutil`) | closed |
| T-83-14 | Tampering | renderer channel surface | high | mitigate | committed snapshot + `check:ipc-contract` (CI + pre-commit) | closed |
| T-83-15 | Elevation | dual ownership | medium | mitigate | generator refusal + TS census + Rust router/NATIVE set test | closed |
| T-83-16 | Repudiation (vacuous gate) | snapshot, census, PortComplete | medium | mitigate | assertAtOrAboveFloor + empty/truncated-input tests (83-05 SUMMARY) | closed |
| T-83-17 | Elevation | parse_open_external_url | high | mitigate | `open_external_scheme_check` in `shell_open.rs`/`native_handlers.rs`/`sidecar.rs`; openPolicyCases.json parity | closed |
| T-83-18 | Denial of Service | slice queue / main thread | high | mitigate | enqueue-only `sidecar_send`, hand-off thread, `catch_unwind` per job (83-06 SUMMARY) | closed |
| T-83-19 | Information Disclosure | rejection logs | medium | mitigate | `native send rejected: <channel>` in `src-tauri/src/native_router.rs` | closed |
| T-83-20 | Elevation | open_external command | medium | mitigate | `generate_handler!` (`main.rs:1898`) exposes only `sidecar_invoke`, `sidecar_send`, `sidecar_store_snapshot`; `open_external` is now an internal helper | closed |
| T-83-21 | Tampering | renderer channel surface | medium | mitigate | snapshot diff, two-owner refusal, nativeSeamPortComplete | closed |
| T-83-22 | Elevation / DoS | reaper signalling | high | mitigate | registered groups only, pgid <= 1 refused, `start_time` recycle check (`gamelib-proc/src/children.rs`, `proto.rs`) | closed |
| T-83-23 | Tampering | control pipe | medium | mitigate | reaper stdin with CLOEXEC write end; no arbitrary-pid command (83-07 SUMMARY) | closed |
| T-83-24 | Denial of Service | reaper liveness | medium | mitigate | own group + `SIG_IGN` in `gamelib-proc/src/reaper.rs`; getppid poll | closed |
| T-83-25 | DoS (user's game) | reaper scope | high | mitigate | Game class never registered; SIGKILL leg asserts game survives; live UAT test 1 pass | closed |
| T-83-26 | Repudiation | reaper output | low | mitigate | fixed literal `parent gone: signalled` in `reaper.rs` | closed |
| T-83-27 | Elevation | reaper mode via argv | medium | mitigate | `--gamelib-reaper` dispatch in `main.rs` reads only own stdin; built-binary test | closed |
| T-83-28 | Denial of Service | startup | high | mitigate | `reaper unavailable:` log-and-continue in `main.rs`; source-order test forbids `?`/unwrap | closed |
| T-83-29 | DoS (user's game) | sidecar group kill | medium | accept | see Accepted Risks AR-83-01 | closed |
| T-83-30 | Information Disclosure | orphaned authenticated helper | high | mitigate | reaper kills sidecar group + every Rust Helper group; live UAT tests 1 and 3 pass | closed |
| T-83-31 | Denial of Service | handle_exit | high | mitigate | `ExitBudget` in `gamelib-core/src/shutdown.rs`, `main.rs`, `shell_state.rs` | closed |
| T-83-32 | Information Disclosure | exit logging | low | mitigate | `still running at exit deadline` names + counts only (`main.rs`) | closed |
| T-83-33 | Repudiation (gate drift) | source-text gates | medium | mitigate | each rewritten gate shown failing on a deliberate break (83-09 SUMMARY) | closed |
| T-83-34 | Tampering (process) | shutdown_child | medium | mitigate | `tree_reaped` guard in `main.rs`/`shell_state.rs`; terminate_group pgid refusal | closed |
| T-83-35 | Tampering | push to main | medium | mitigate | blocking-human push decision; pre-push hook ran (83-10 SUMMARY D3) | closed |
| T-83-36 | Repudiation (gate weakening) | clippy ratchet / ceilings | medium | mitigate | no ceiling moved; changes recorded in 83-VALIDATION.md | closed |
| T-83-37 | Information Disclosure | committed UAT results | medium | mitigate | 83-HUMAN-UAT/83-UAT record counts, pids, names, literals only; captures stay in /tmp | closed |
| T-83-38 | Repudiation | live verdicts | medium | mitigate | one-instance assertion, append-only transcript, per-launch archives (83-11) | closed |
| T-83-SC | Tampering | dependencies (all plans) | low | mitigate / accept | no new external crate or package; `gamelib-core`, `gamelib-proc` pinned in `EXPECTED_LOCKFILE_CRATE_NAMES` (`cargoFeatures.test.ts:218`); `url` 2.5.8 already locked | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-83-01 | T-83-29 | D-15: on unix a SIGKILL of GameLib now kills TS-launched games (sidecar group kill). Accepted for this phase; fixed when Phase 88 / 95-97 move games onto `SpawnClass::Game`. Recorded in 83-08 SUMMARY, UAT notes and a `ready: blocked` todo. | operator (83-CONTEXT D-15) | 2026-11-21 |
| AR-83-02 | T-83-SC (83-01, 03, 05, 07, 08, 09, 10, 11) | Those plans install or add no dependency. | plan-time register | 2026-11-21 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-21 | 39 | 39 | 0 | /gsd-secure-phase 83 (orchestrator, ASVS L1 grep-depth; auditor short-circuited) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-21
