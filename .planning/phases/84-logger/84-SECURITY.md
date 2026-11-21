---
phase: "84"
slug: "logger"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-22"
---

# Phase 84 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register merged from the `<threat_model>` blocks of plans 84-01..84-18 (one row per unique threat id; where a
> later plan restates a threat, its disposition wins). Verified at ASVS L1 by gsd-security-auditor on 2026-11-22
> against HEAD after gap closure (pushed head `a0401bbc6`); each mitigation was read in code, not taken from SUMMARY text.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Sidecar → shell (`log` frame on stdout) | The Node sidecar's forwarder sends log entries to the Rust writer; the shell parses and validates every frame | Log text, target/appName (untrusted shape, size-capped) |
| Renderer → native router (logger channels) | The renderer's log, getLogContent, showLogFileInFolder, upload, list and delete-uploaded calls | Log lines, log descriptors (path-bearing names) |
| Shell → paste service (dpaste.com) | User-initiated upload and delete of a log | Full log content (unredacted beyond TS call sites); paste URLs |
| Third-party crates → writer (tracing / `log` bridge) | steam-vent, reqwest/hyper, rustls diagnostics bridged into gamelib.log | Crate event text (DEBUG only when opted in by env) |
| Writer → filesystem | gamelib.log, per-game and launch logs, rotation, `uploadedLogs.json` via StoreHost | Log files (0600), store JSON |
| Developer / operator → repo and CI | Golden fixtures, gate ceilings, pushes, crate dependencies | Fixtures, lockfile, pushed commits |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-84-01 | Repudiation | live gate contract | medium | mitigate | 84-HUMAN-UAT.md items name launch ordinal and evidence file; scored by a later session (84-11) | closed |
| T-84-02 | Information Disclosure | upload item / captures | medium | mitigate | HUMAN-UAT records only URL host and entry name; captures kept in /tmp | closed |
| T-84-03 | Tampering | golden fixtures | medium | mitigate | One-byte mutation proven (84-01); TS generator deleted by 84-07, golden is compare-only (`golden.rs`) | closed |
| T-84-04 | Information Disclosure | `paths::log_file` | high | mitigate | paths.rs refuses empty, >255, NUL, `/` `\`, `..`, comet; `log_file_rejects_each_bad_app_name_and_comet_games` | closed |
| T-84-05 | Information Disclosure | writer file creation | medium | mitigate | writer.rs `mode(0o600)`; mode tests | closed |
| T-84-06 | Denial of Service | writer thread | high | mitigate | bounded `sync_channel` + `try_send` drop/count, `catch_unwind`, open-append-close, failed rename keeps appending | closed |
| T-84-07 | Tampering | frame parsing | high | mitigate | frame.rs `deny_unknown_fields`, 4 MiB / 1,048,576 UTF-16 caps, size check first; `every_invalid_vector_is_rejected_with_its_exact_reason` | closed |
| T-84-08 | Spoofing | `start_reader` log arm | high | mitigate | sidecar.rs `route_log_frame` → `parse_frame`; rejection logs category only; arm never writes a file | closed |
| T-84-09 | Denial of Service | forwarder + reader arm | high | mitigate | forwarder bounded queue drop-oldest, unref'd timer, flush deadline; reader arm is one `try_send` | closed |
| T-84-10 | Tampering | gamelib.log rotation | medium | mitigate | `init_native_logger()` after both single-instance blocks (source-order test); `OnceLock`; `a_second_init_returns_false_and_never_rotates` | closed |
| T-84-11 | Information Disclosure | transcripts / runner logs | medium | mitigate | Redaction stays at TS call sites; facade forwards raw chunks; `logSecretGate` unchanged | closed |
| T-84-12 | Denial of Service | forwarder under flood | high | mitigate | caps 4000 entries / 8 MiB; `forwarderCalibration.test.ts` | closed |
| T-84-13 | Tampering | appName in frame target | medium | mitigate | `logTargetRefusal`, `isValidAppName`; targetWriter tests | closed |
| T-84-14 | Tampering | renderer log lines | high | mitigate | sanitize.rs CR/LF escaped, cap before format, strict keys; `the_in04_forge_string_stays_one_line` | closed |
| T-84-15 | Information Disclosure | getLogContent / showLogFileInFolder / uploadLogFile | high | mitigate | log_dispatch strict descriptor, resolve only via `log_file`; reveal policy; `log_show_with_a_traversal_name_never_calls_reveal_path` | closed |
| T-84-16 | Denial of Service | logger slice / main thread | medium | mitigate | slice worker with `catch_unwind`; reveal on hand-off thread; `log_enqueue_behind_a_blocked_logger_handler_returns_at_once` | closed |
| T-84-17 | Information Disclosure | rejection logs | medium | mitigate | `rejection_line` names channel only; test | closed |
| T-84-18 | Denial of Service | gamelib.log growth | high | mitigate | limiter burst 5, 256 keys, evict-oldest; flood = 5 lines + 1 summary | closed |
| T-84-19 | Repudiation | limiter hiding evidence | medium | mitigate | first 5 admitted; only general target limited, raw/transcripts unaltered | closed |
| T-84-20 | Tampering / SSRF | `validate_paste_url`, `ReqwestPaste` | high | mitigate | https + host == dpaste.com, no creds/port; `redirect(Policy::none())`; off-host, javascript:, 302 tests | closed |
| T-84-21 | Information Disclosure | upload content | medium | accept | See AR-84-01 | closed |
| T-84-22 | Tampering | `uploadedLogs.json` via StoreHost | medium | mitigate | temp+rename, 0600/0700; corrupt file → `InvalidData`, never overwritten | closed |
| T-84-23 | Denial of Service | upload request | medium | mitigate | 10 MiB read cap, 60 s timeout, 1,024-char logged text, 64 KiB response cap | closed |
| T-84-24 | Denial of Service | bridge feedback loop | high | mitigate | `ON_WRITER_THREAD` drop in both bridges; first-call-wins install; bridge tests | closed |
| T-84-25 | Information Disclosure | DEBUG crate events | medium | accept | See AR-84-02 | closed |
| T-84-26 | Information Disclosure | keyring diagnostics | high | mitigate | keyringDiagPersistence leak-shape guard with planted-secret controls | closed |
| T-84-27 | Denial of Service | exit flush | high | mitigate | `flush(ctx.remaining_now())` inside the 5 s budget; no permanent registrant; tauriShellSource shape gate | closed |
| T-84-28 | Repudiation | shell lines in packaged builds | medium | mitigate | `shell_log` → writer; spawn-failure arm flushes at 500 ms before the dialog | closed |
| T-84-29 | Tampering | revived second writer | medium | mitigate | `loggerPortComplete.test.ts`; no `gamelib-shell.log` / `shell_diag` in src-tauri/src | closed |
| T-84-30 | Repudiation | stale gate docs | low | mitigate | live-gate-contract-authoring.md post-84 partition | closed |
| T-84-31 | Repudiation | phase proof provenance | medium | mitigate | 84-10 clean detached worktree at recorded sha with commands and counts | closed |
| T-84-32 | Tampering | gate ceilings | medium | mitigate | `--no-verify` refused (84-10); no clippy ceiling changed (84-18) | closed |
| T-84-33 | Information Disclosure | live upload | medium | mitigate | 84-11 records host + entry name only | closed |
| T-84-34 | Information Disclosure | session captures | low | mitigate | log copies deleted (84-11); /tmp location stated | closed |
| T-84-35 | Tampering / SSRF | `delete_uploaded_log_file` | high | mitigate | re-validates via `validate_paste_url`; planted off-host and redirect tests | closed |
| T-84-36 | Tampering | `get_uploaded_log_files` prune | medium | mitigate | prune via `store.remove` only; corrupt → `{}`; byte-identical test | closed |
| T-84-37 | Repudiation | exit deadline / timing lines | medium | mitigate | both lines before the final flush; shape test | closed |
| T-84-38 | Denial of Service | `persist_atomic` | high | mitigate | failed temp write returns error, live file untouched (WR-03, 84-12); store.rs test | closed |
| T-84-39 | Tampering | `validate_paste_url` | medium | mitigate | returns `parsed.to_string()` (WR-07, 84-12); tests | closed |
| T-84-40 | Repudiation | UAT re-score provenance | medium | mitigate | 84-13 sources named (stat-verified files, crate emitters at locked versions) | closed |
| T-84-41 | Information Disclosure | reading launch.log | low | mitigate | 84-13 used `head -2` and stat only; no home paths in summaries | closed |
| T-84-42 | Denial of Service | `renderer_body` Object arm, `submit_line` | medium | mitigate | object values and native entries cut at caps (WR-04, 84-14); tests | closed |
| T-84-43 | Repudiation | launch-log rotation on full channel | medium | mitigate | owed-rotation set, `take_owed` (WR-05 Rust, 84-14); test | closed |
| T-84-44 | Denial of Service | limiter window anchor | low | mitigate | `ts.min(clock.now_ms())` (IN-02, 84-14); test | closed |
| T-84-45 | Denial of Service | `LogForwarder.enqueue` | medium | mitigate | well-formedness, prefix fallback, target refusal before queueing (WR-01, 84-15); tests | closed |
| T-84-46 | Repudiation | rotate claim in forwarder/facade | medium | mitigate | `#passRotation`, `oweRotation` (WR-05 TS, 84-15); tests | closed |
| T-84-47 | Denial of Service | `LogForwarder.flush` | medium | mitigate | one deadline across chain and transport waits, unref'd timers (WR-06, 84-15); tests | closed |
| T-84-48 | Spoofing | gamelib.log line forging | medium | mitigate | `escape_line_breaks` in `gamelib_log::log`, both bridges, `shell_log_to` (WR-02, 84-16); tests | closed |
| T-84-49 | Repudiation | silent loss of crate diagnostics | low | mitigate | `bridge_install_warning` (IN-03, 84-16); test | closed |
| T-84-50 | Denial of Service | exit budget overrun in finish | low | mitigate | fixed `deadline` + `remaining_now()` (IN-04, 84-16); test | closed |
| T-84-51 | Information Disclosure | shell_log call sites | medium | mitigate | `shell_log_detail` stderr-only detail; 27 sites category-only (WR-02 privacy, 84-17) | closed |
| T-84-52 | Information Disclosure | regression of T-84-51 | low | mitigate | `shellLogCategoryOnly.test.ts` with positive/negative controls | closed |
| T-84-53 | Repudiation | gap-closure proof provenance | medium | mitigate | 84-18 detached worktree, sha, CI run ids per leg | closed |
| T-84-54 | Tampering | push scope / ceilings | medium | mitigate | blocking operator checkpoint, fast-forward check, hooks run, no `--no-verify`, no force | closed |
| T-84-SC | Tampering | package installs / crate deps | low | mitigate (84-02/05/08/10/18); accept (no-install plans) | gamelib-log deps limited; `cargoFeatures.test.ts` crate-name pin; `--frozen-lockfile`; see AR-84-03, AR-84-04 | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-84-01 | T-84-21 | Upload content is unredacted beyond the TS call sites. Inherited behaviour (T-34.3-13, D-09): the user picks the log and confirms in the dialog; no automatic, background or crash-time upload exists (`PASTE_ENDPOINT` used at one site only). | plan-time disposition (84-05/84-06) | 2026-11-22 |
| AR-84-02 | T-84-25 | DEBUG crate events may carry request detail. DEBUG is opt-in by `GAMELIB_LOG_LEVEL=debug` only (D-19), never a setting; the default WARN path carries no bodies. | plan-time disposition (84-08) | 2026-11-22 |
| AR-84-03 | T-84-SC | Plans that install nothing (84-01/03/04/06/07/09/11..17) accept T-84-SC as "installs nothing"; verified by the passing lockfile crate-name pin. | plan-time disposition | 2026-11-22 |
| AR-84-04 | T-84-SC | Commit `8fcadab94` (RUSTSEC-2026-0543) replaced chrono with jiff in gamelib-log, adding 7 registry crates (jiff, jiff-core, jiff-static, jiff-tzdb, jiff-tzdb-platform, portable-atomic, portable-atomic-util), contrary to 84-02's "no new registry crate". Accepted and pinned in `cargoFeatures.test.ts` by `a0401bbc6`; supply-chain audit (cargo-deny) green on CI run 44942334032. | operator (84-18 checkpoint) | 2026-11-22 |

*Accepted risks do not resurface in future audit runs.*

Informational (non-blocking, from the audit): the sidecar `reader.lines()` loop buffers a whole line before the
4 MiB parse-time reject (no plan claims a read-time bound); `gamelib_log::log`'s escape has no direct unit test
(global `OnceLock`), its two sibling entry points do; `golden/NOTES.md` "Regenerating" still names the deleted
`logGolden.test.ts` / `GAMELIB_WRITE_LOG_GOLDEN` (stale doc; the write path is gone).

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-22 | 55 | 55 | 0 | gsd-security-auditor (ASVS L1, block_on high) via /gsd-execute-phase 84 --gaps-only |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-22
