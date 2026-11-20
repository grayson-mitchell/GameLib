---
phase: quick-261011-wik
plan: 01
subsystem: planning-todos
tags: [windows, tauri, store-embed, webview2, todo]
status: complete
requires: []
provides:
  - "pending todo tracking the Windows in-app Stores-tab embed implementation"
affects: []
key-files:
  created:
    - .planning/todos/pending/2026-10-11-stores-tab-embed-not-implemented-on-windows.md
decisions:
  - "severity major / platform windows / ready code: the feature is absent on one shipped platform; the edits are desk work but compile and live verification need the operator's Windows machine (CI runs no cargo step)."
commits: 1
actuals:
  tokens: 8000
  tasks: 1
  commits: 1
---

# Quick 261011-wik: file the Windows Stores-tab embed implementation todo — Summary

Filed `.planning/todos/pending/2026-10-11-stores-tab-embed-not-implemented-on-windows.md`.

**Finding recorded.** The in-app store/wiki embed (Phase 40, extended to Linux by quick
260930-blh) has no Windows arm: `src/frontend/screens/WebView/index.tsx` renders
`WebviewUnavailablePanel` for any platform other than darwin/linux, the ten `store_embed_*` RPC
arms in `src-tauri/src/main.rs` return `unsupported-platform` on Windows, and `src-tauri/Cargo.toml`
enables Tauri's `unstable` feature only in the macOS and Linux target tables. Store logins, library
sync and installs are unaffected; the Windows bundle ships legendary, gogdl, nile and comet.

**Why no todo existed.** Phase 38 item `38-E01` carried the Windows question. It was discharged
PASS in sitting 13 (2026-09-30) against the spike 027 feasibility harness, whose Cargo.toml requests
`unstable` unconditionally. Its `platform_gate` still says "SHIPPED APP, unchanged". The feasibility
answer closed the ledger, and the implementation follow-up was never filed.

**Verification.** `python3 .planning/todos/todo-frontmatter-gate.py` green. Prettier check omitted:
`.planning/` is prettier-ignored, so `--check` over it proves nothing.

**Left untouched.** `.planning/state.json`, `.planning/debug/rust-test-ci-missing-sidecar.md` and
`.planning/milestone.lock` were already dirty/untracked before this task and are not staged.
