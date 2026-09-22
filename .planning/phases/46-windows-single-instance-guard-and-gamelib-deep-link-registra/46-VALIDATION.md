---
phase: 46
slug: windows-single-instance-guard-and-gamelib-deep-link-registra
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-22
---

# Phase 46 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `46-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust `cargo test` (inline `#[cfg(test)] mod tests` in the `gamelib-shell` bin, no lib crate) + Jest 29 (`ts-jest`) source-gate tests |
| **Config file** | none for Rust (inline); `jest.config.js` (repo root) |
| **Quick run command** | `cd src-tauri && cargo test --bin gamelib-shell <filter>` + `pnpm exec jest src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/windowsDeepLinkSuppression.test.ts` |
| **Full suite command** | `cd src-tauri && cargo test --bin gamelib-shell` + `pnpm test` |
| **Estimated runtime** | ~60-120 s Rust (incremental; a cold `cargo check` measured 54 s here), ~60 s targeted Jest |

---

## Sampling Rate

- **After every task commit:** the Rust quick-run filter for the function just touched, plus the relevant Jest file.
- **After every plan wave:** full `cargo test --bin gamelib-shell` (once the Wave 0 compile fix lands) + full `pnpm test`.
- **Before `/gsd:verify-work`:** both full suites green, THEN the live gate (REQ-46-10). A green suite alone does not close this phase.
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

Task IDs are assigned by the planner; rows are keyed by requirement until plans exist.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | REQ-46-09 | — | N/A | compile smoke | `cd src-tauri && cargo test --bin gamelib-shell --no-run` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | REQ-46-01/02 | T-46 (name squatting / cross-user collision) | Mutex/pipe names are per-user; another user's session cannot collide or connect | unit (Rust) | `cargo test --bin gamelib-shell windows_single_instance` | ❌ | ⬜ pending |
| TBD | TBD | 1 | REQ-46-03/04 | T-34.5-G6-20 / G6-25 | Every pipe payload re-validated through `protocol_url_arg`; read bounded to 4096; rejected payload never logged (byte count only) | unit (Rust) | `cargo test --bin gamelib-shell protocol_url_arg` | ✅ extend | ⬜ pending |
| TBD | TBD | 1 | fail-open | T-34.5-G6-24 | Any guard/pipe failure behaves as primary-without-listener, never aborts startup | unit (Rust) + source gate | `cargo test --bin gamelib-shell single_instance` / `pnpm exec jest tauriShellSource.test.ts` | ❌ | ⬜ pending |
| TBD | TBD | 1 | pipe DACL | T-46 (local spoofing) | Pipe created with owner-only DACL + `PIPE_REJECT_REMOTE_CLIENTS` | source gate (TS) | `pnpm exec jest tauriShellSource.test.ts -t "PIPE_REJECT_REMOTE_CLIENTS"` | ❌ | ⬜ pending |
| TBD | TBD | 2 | REQ-46-05 | D-05 | Windows override removed only after the guard exists; suppression test inverted in the same commit | jest | `pnpm exec jest windowsDeepLinkSuppression.test.ts` | ✅ invert | ⬜ pending |
| TBD | TBD | 2 | REQ-46-06 | — | Recorded decision on runtime `register_all()` for Windows, pinned | source gate (TS) | `pnpm exec jest tauriShellSource.test.ts -t "register_all"` | ✅ extend | ⬜ pending |
| TBD | TBD | 2 | REQ-46-08 | — | `on_open_url` stays registered inside `.setup()` (no cold-start double dispatch) | source gate (TS) | `pnpm exec jest tauriShellSource.test.ts -t "on_open_url"` | ❌ | ⬜ pending |
| TBD | TBD | 2 | installer | D-05 | Generated `installer.nsi` contains the `Software\Classes\gamelib` WriteRegStr lines once the override is removed | build artefact grep | `pnpm tauri build --debug --bundles nsis` then grep `src-tauri/target/debug/nsis/x64/installer.nsi` | ✅ (method proven in quick 260922-nx4) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] **Fix the existing `cargo test` compile break on Windows (REQ-46-09).** Add `#[cfg(target_os = "macos")]` to the four `store_embed_wire_contract_*` tests (`src-tauri/src/main.rs` ~9758/9766/9773/9782). They call macOS-gated helpers, so `cargo test` cannot compile on Windows, which blocks every Rust test this phase adds.
- [ ] Confirm `cargo test --bin gamelib-shell --no-run` compiles on this Windows machine after the fix.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| External `gamelib://` open reaches the RUNNING instance; exactly one sidecar afterwards | REQ-46-10 | Needs a real installed Windows build, the OS protocol handler, and process observation | Install the debug NSIS build on the operator's Windows 11 machine; launch GameLib; open `gamelib://launch?appName=<id>` from Win+R or a browser; confirm the running window handles it and no second window appears; `Get-Process` filtered to the sidecar exe shows exactly one process. Repeat with a bare second launch (focus sentinel) |
| Two simultaneous cold launches produce one instance | fail-open / race | Timing-dependent; needs real processes | Start two launches within ~100 ms (e.g. `Start-Process` twice in one PowerShell line); exactly one window and one sidecar result |
| Crashed primary does not block the next launch | stale holder | Needs a real process kill | Launch, `Stop-Process -Force` the shell, relaunch; a new primary starts (mutex released by the OS) |

*Precondition for the live gate: a packaged Windows build. See todo `2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md`; the local workarounds from 2026-09-22 are in place on the operator's machine.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
