---
phase: 71
slug: rust-shell-module-decomposition
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-11-08
---

# Phase 71 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `71-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | cargo test (bin `gamelib-shell`), jest 29.7 (`Backend` and `Meta` projects), `python3` move-proof/visibility scripts |
| **Config file** | `src-tauri/Cargo.toml`; repo `jest.config`; `.github/workflows/rust-test.yml` |
| **Quick run command** | `cd src-tauri && cargo test --bin gamelib-shell` |
| **Full suite command** | `pnpm test` + `cd src-tauri && cargo test --bin gamelib-shell` + clippy ratchet + `python3 moveproof.py <wave-base-ref>` |
| **Estimated runtime** | ~120 seconds (cargo incremental) per move; several minutes per wave end |

---

## Sampling Rate

- **After every task commit (one move):** `cargo test --bin gamelib-shell` green with the passed count not below the wave baseline; clippy ratchet `--list` PASS; `moveproof.py <base>` clean.
- **After every plan wave:** all of the above + the source-text jest suite list (same 2 pre-existing failures, no new ones, passed count not lower) + `cargo test -- --list` name diff + `pnpm check:ipc-contract` + scoped prettier on TS paths written + `graphify update .` + push and require the Windows/macOS/Linux legs of `rust-test.yml` green (D-03), then the live check (D-14).
- **Before `/gsd-verify-work`:** full jest + full cargo green (modulo the 2 recorded failures), `pnpm planning-gates` green.
- **Max feedback latency:** ~120 seconds per move.

---

## Per-Task Verification Map

| Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| D-04/D-05 | Router one-liners; handler bodies verbatim | script | `python3 moveproof.py <wave-base-ref>` | ❌ W0 (prototype in `research-tools/`) | ⬜ pending |
| D-04 | Exhaustive match over `RustInvokeChannel`, no `_ =>` | cargo | `cargo test --bin gamelib-shell` + compile | ✅ | ⬜ pending |
| D-05 | No lint count change | clippy | `cargo +1.99.1 clippy --workspace --all-targets --message-format=json` → `node ../meta/clippyRatchet.cjs <json> --list` | ✅ | ⬜ pending |
| D-08/D-09 | No test lost or renamed | cargo list diff | `cargo test --bin gamelib-shell -- --list` names diffed against wave-0 `before.txt` | ❌ W0 | ⬜ pending |
| D-10 | Production reader byte-identical to old slice on unmoved tree | jest | `tauriShellSource.test.ts` new assertion | ❌ W0 | ⬜ pending |
| D-10 | No reader slices combined source on `mod tests {` | jest guard | `tauriShellSource.test.ts` new describe | ❌ W0 | ⬜ pending |
| D-10 | Arm-body pins repointed via `readHandlerBody` keep needle counts | jest | the arm-pin suites in RESEARCH inventory | ✅ (rewritten W1) | ⬜ pending |
| D-11 | `macos_epic_embed/` stays excluded; absence counts unchanged | jest | `tauriShellSource.test.ts` helper scope + `macosEpicEmbed*` suites | ✅ (extend W4) | ⬜ pending |
| D-12/D-13 | Non-test line counts ≤ ~1,000 or justified | script | `wc -l` + awk non-test count | plan-defined | ⬜ pending |
| D-15 | Call sites unchanged | compile + diff | `cargo check`; `git diff main.rs` only `mod`/`use` lines | ✅ | ⬜ pending |
| cross-platform | cfg-gated code compiles/tests on Windows + Linux | CI | `gh run watch` on `rust-test.yml` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/backend/testUtils/tauriShellSource.ts` — `readTauriShellProductionSource`, `readHandlerBody`, prefix/directory-aware pre-split exclusion
- [x] `src/backend/__tests__/tauriShellSource.test.ts` — byte-identity assertion, no-`mod tests {`-slicing guard, directory-aware helper-scope guard
- [x] Migrate the three `mod tests {` slicers (loginChromeCssInjection, tauriShellSource ×2)
- [x] `src-tauri/src/main.rs` tests — runtime `shell_production_source()` builder; `SHELL_SOURCE_FILES` guard directory-aware
- [x] Promote `moveproof.py` / `vis.py` / `items.py` from `research-tools/`
- [x] Baselines re-taken: cargo `--list` names, passed/ignored, clippy `--list`, jest suite results, `module_path!`/`file!()`/`line!()` grep

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Embedded store page works | D-14 | Tauri child webview behaviour, no automated harness | `pnpm tauri:dev`; open, resize, nav, hide/show on tab switch; frameless title bar OFF then ON |
| Login window sign-ins | D-14 | Real webview + cookie store | Humble, GOG, Amazon, Epic sign-in / cookie clear / reveal (DummyStore OAuth on :17940 may stand in); frameless OFF then ON |
| Epic embed | D-14 | macOS raw WKWebView | open, bounds, hide/show, close, deselect on GOG switch, download hand-off; frameless OFF then ON |
| Wave 1 moved arms | D-14 | OS integrations | notification, app_hide/main_window_hide game launch, dialogs, tray icon change, keyring read after relaunch, bridge invite picker |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
