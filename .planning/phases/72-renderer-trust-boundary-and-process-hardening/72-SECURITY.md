---
phase: 72
slug: renderer-trust-boundary-and-process-hardening
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-09
---

# Phase 72 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| renderer/remote content in `main` -> sidecar/shell | Renderer-supplied paths, URLs, app names reach open/delete/reveal channels | file paths, URLs |
| webview -> Rust IPC (capabilities) | Tauri ACL grants inherited by any content in `main` | command permissions |
| sidecar -> OS | Child processes (store CLIs, games) with auth context | PIDs, credentials |
| CI/supply chain | npm/cargo dependencies, GitHub workflows | third-party code |

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation (evidence) | Status |
|-----------|----------|-----------|-------------|-----------------------|--------|
| T-72-01 | T | apt-get in rust-test.yml | accept | Accepted risk AR-01 | closed |
| T-72-02 | E | rust-test.yml permissions | mitigate | `.github/workflows/rust-test.yml:2-3` `permissions: contents: read` | closed |
| T-72-03 | D | provisional continue-on-error | mitigate | No `continue-on-error` remains in rust-test.yml (grep empty); verification truth 13 (green run 42432244587) | closed |
| T-72-04 | I | undici TLS bypass | mitigate | `package.json:210` `undici@^6: ^6.29.1`; `pnpm-lock.yaml:5692` undici@6.29.1; verification: audit high = 0 | closed |
| T-72-05 | I | rustls advisories | mitigate | `src-tauri/Cargo.lock` rustls 0.23.46 (:3374), rustls-webpki 0.103.16 (:3436), webpki-root-certs 1.0.11 (:5321); cargo-deny job gates advisories | closed |
| T-72-06 | T | react-router/follow-redirects/source-map-js | mitigate | `package.json:133,211,212`; lock: react-router 7.18.5, follow-redirects 1.16.2, source-map-js 1.2.2 | closed |
| T-72-SC | T | npm installs plan 02 | mitigate | Lockfile shows bumps/overrides only (package.json overrides block); no new names observed in audited entries | closed |
| T-72-07 | T | vulnerable deps reaching main | mitigate | `.github/workflows/audit.yml:21-47` `pnpm audit --prod --audit-level high` (blocking) + `cargo-deny-action@v2 check advisories`; weekly cron `0 6 * * 1` | closed |
| T-72-08 | R | deny.toml ignore growth | mitigate | `src-tauri/deny.toml` `unused-ignored-advisory = "warn"`; each of 4 ignores has a `reason` | closed |
| T-72-09 | E | audit.yml token scope | mitigate | `audit.yml:2-3` `permissions: contents: read`; `EmbarkStudios/cargo-deny-action@v2` | closed |
| T-72-10 | T | Dependabot PR content | accept | Accepted risk AR-02 (`.github/dependabot.yml` limit 0, security-only) | closed |
| T-72-11 | I | zip advisories ignored | accept | Accepted risk AR-03 | closed |
| T-72-12 | E | ShellOpenPath bundle/executable | mitigate | `src-tauri/src/shell_open.rs:48-62` canonicalize -> is_dir -> `is_launchable_bundle` reject; symlink test at :166; wired at :79/:92 | closed |
| T-72-13 | E | file:// smb:// UNC | mitigate | `shell_open.rs:29-42` `shape_check` rejects `://`, `\\`, `//`, relative, NUL; fixture `src/common/__fixtures__/openPolicyCases.json`; sidecar mirror `openPolicy.ts:78-95,107-112` | closed |
| T-72-14 | I | rejection logs echoing path | mitigate | `shell_open.rs` fixed-literal `shell_eprintln!`; `openPolicy.ts:57-63` category-only `logWarning` + fixed error text | closed |
| T-72-15 | T | TOCTOU canonicalize->open | accept | Accepted risk AR-04 (VERIFICATION WR-06) | closed |
| T-72-16 | I | plaintext Steam token | mitigate | `tokenStore.ts:129` `UnconfiguredTokenStore`; test `tokenStore.test.ts:136-143` asserts `configStore.set` never called; `bootstrap.ts:1136` installs keyring store; no safeStorage/plaintext code | closed |
| T-72-17 | E | execAsync join in tools/ipc_handler.ts | mitigate | `git ls-files` shows 0 `ipc_handler` files; grep for `execAsync(commandParts` empty | closed |
| T-72-18 | D | handler before store install | accept | Accepted risk AR-05 (bootstrap.ts:1111-1136 installs store; fails closed) | closed |
| T-72-19 | E | openExternalUrl fall-through | mitigate | `shellFilesFlowRegistration.ts:148` and `appShellFlowRegistration.ts:367` use `assertOpenableExternalUrl`; `openUrlOrFile` absent from non-test source | closed |
| T-72-20 | E | openFolder executable/.app | mitigate | `shellFilesFlowRegistration.ts:159` `classifyFolderTarget` -> 'reveal' for files/bundles (`openPolicy.ts:102-123`); Rust `shell_open.rs:48-62` rejects too | closed |
| T-72-21 | T | showConfigFileInFolder traversal | mitigate | `shellFilesFlowRegistration.ts:226-236` `assertContainedPath` | closed |
| T-72-22 | I | logging renderer paths/URLs | mitigate | `openPolicy.ts:57-63` category-only. Observation: internal `removeFolder` (`utils.ts:1457`) logs the folderName in a warning when refusing; not on the open/URL channels in scope, informational | closed |
| T-72-23 | D | relative folder_name rejected | accept | Accepted risk AR-06 | closed |
| T-72-24 | E | opener:default grant | mitigate | absent from `src-tauri/capabilities/default.json` permissions; `main.rs:796` `open_js_links_on_click(false)`; `frontend/helpers/externalLinkClicks.ts:42` routes to `openExternalUrl` | closed |
| T-72-25 | E | shell:allow-execute grant | mitigate | absent from default.json permissions (full list read) | closed |
| T-72-26 | E | updater:default grant | mitigate | absent from default.json permissions | closed |
| T-72-27 | I | window.__TAURI__ | mitigate | `src-tauri/tauri.conf.json:13` `"withGlobalTauri": false` | closed |
| T-72-28 | D | plugin init script crash | mitigate | Live boot UAT 3 and 4 `result: pass` (72-07 checkpoint, 2026-11-08) in `72-UAT.md` | closed |
| T-72-29 | T | sidecar continues after uncaught throw | mitigate | `src/backend/sidecar/processGuards.ts` uncaughtException handler flushes then `exit(1)` | closed |
| T-72-30 | D | fatal handler hang | mitigate | `processGuards.ts` `UNCAUGHT_FLUSH_CAP_MS = 1500`, `unref()`'d; re-entry depth check exits immediately; `sidecarRejectionGuard.test.ts` | closed |
| T-72-31 | R | losing last log line | mitigate | `processGuards.ts` awaits stderr write callback and sink promise before exit | closed |
| T-72-32 | D | unhandledRejection fatal | accept | Accepted risk AR-07 (handler remains log-only, `processGuards.ts`) | closed |
| T-72-33 | T | renderer recursive delete | mitigate | No `removeFolder` in preload, common/types, `ipc_contract.rs`, or src-tauri/src (grep); only comment in `shellFilesFlowRegistration.ts:9`; sole caller `downloadqueue.ts:410` | closed |
| T-72-34 | T | malformed parent path | mitigate | `utils.ts:1435,1457` `assertContainedPath` / `assertPlausibleAbsolutePath` | closed |
| T-72-35 | D | un-unref'd 5s timer | mitigate | `utils.ts:1445-1475` no timer; `rm` with `maxRetries`/`retryDelay` | closed |
| T-72-36 | D | silent dead backend | mitigate | `sidecar.rs:645-648,654-690` EOF -> `on_sidecar_eof` -> `surface_dead_sidecar` native Restart/Quit dialog | closed |
| T-72-37 | R | false dialog on normal quit | mitigate | `begin_shutdown` at `main.rs:1806` (ExitRequested), `app_lifecycle.rs:12,46`, `shell_state.rs:119`, `sidecar.rs:678`; `on_sidecar_eof` tests `main.rs:1881-1899` | closed |
| T-72-38 | T | in-place respawn | mitigate | `sidecar.rs:684` `app.restart()`; source pin counts exactly one `spawn_sidecar(` call (`sidecarShutdownFlagSource.test.ts:90`) | closed |
| T-72-39 | D | dialog while sidecar alive | mitigate | Implemented differently and stronger: `shell_state.rs:56-90` `reap_dead_sidecar_tree` unconditionally group-kills (unix) / kills + drops job (Windows) then `wait()` before the dialog (`sidecar.rs:669`). Also closes VERIFICATION WR-01 | closed |
| T-72-40 | D | pkill/Stop-Process by name | mitigate | `backend/trackedChildren.ts` PID kills (`taskkill /PID`, `process.kill(pid)`); no `pkill`/`killPattern` code in src (only comments); pin in `trackedChildren.test.ts` | closed |
| T-72-41 | I | orphaned store CLIs | mitigate | No `detached` spawns in launcher/legendary/nile/sideload (grep empty); group reap `shell_state.rs` shutdown_child; Windows job | closed |
| T-72-42 | T | PID reuse | mitigate | `trackedChildren.ts:52-53` untrack on `close` and `error` (WR-03: not also on `exit`, residual window) | closed |
| T-72-43 | I | test spawn reads real profile | mitigate | `createFakeHomeProfile` used across spawn tests; `backend/__tests__/fakeHomeIsolation.test.ts` | closed |
| T-72-44 | I | CLIs outliving app on Windows | mitigate | Code verified: `sidecar.rs:236-300` `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, assigned at spawn (`main.rs` job created after `spawn_sidecar`), dropped in `shell_state.rs` shutdown_child. Runtime proof PENDING (72-UAT items 6-7, 72-HUMAN-UAT 1-3, Windows PC + CI compile not yet run) | closed (code); runtime pending |
| T-72-45 | E | break away from job | mitigate | `sidecar.rs:241,273` only `KILL_ON_JOB_CLOSE` set; no BREAKAWAY flag in code (comment mentions only). Runtime pending as above | closed (code); runtime pending |
| T-72-46 | D | job creation failure | mitigate | `sidecar.rs:262-300` returns `None` with `shell_eprintln!` on every failure, no `?`/panic; fallback `child.kill()` | closed |
| T-72-47 | D | games killed on quit | accept | Accepted risk AR-08 | closed |

*Status: open · closed*

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-72-01 | apt on ubuntu-latest is signed; same package list as release-tauri.yml; compile-check only | plan 72-01 | 2026-11-08 |
| AR-02 | T-72-10 | Dependabot is security-only (limit 0); PRs go through review and full CI | plan 72-03 | 2026-11-08 |
| AR-03 | T-72-11 | zip advisories reachable only via unused tauri-plugin-updater; reasoned ignores in deny.toml (amended D-18) | plan 72-03 | 2026-11-08 |
| AR-04 | T-72-15 | TOCTOU on local single-user desktop; Rust layer authoritative (WR-06) | plan 72-04 | 2026-11-08 |
| AR-05 | T-72-18 | Steam sign-in fails loudly if handler precedes store install; bootstrap orders install first | plan 72-05 | 2026-11-08 |
| AR-06 | T-72-23 | Relative folder_name / missing savesPath rejection is a documented behaviour change | plan 72-06 | 2026-11-08 |
| AR-07 | T-72-32 | unhandledRejection stays log-only; rationale in processGuards.ts header | plan 72-08 | 2026-11-08 |
| AR-08 | T-72-47 | Sidecar-launched games die on quit, parity with Unix (amended D-20) | plan 72-12 | 2026-11-08 |

## Pending Non-Blocking Verification

- Windows runtime of the Job Object (T-72-44/45): 72-UAT items 6-7 and 72-HUMAN-UAT 1-3 are `pending`.
- Packaged-build Restart (T-72-38): 72-HUMAN-UAT 4 pending; dev-mode run passed.
- Residual warnings (not threat failures): WR-02 (SIGTERM-only, no escalation), WR-03 (untrack on close only), WR-04, WR-05.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-09 | 48 | 48 | 0 | gsd-security-auditor |

## Sign-Off

- [x] All threats have a disposition
- [x] Accepted risks documented
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set (Windows runtime items remain pending, tracked above)

**Approval:** verified 2026-11-09
