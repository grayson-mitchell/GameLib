---
created: 2026-11-08T00:00:00.000Z
title: 'Split rpc_humble_login_open into named steps'
area: shell
severity: minor
platform: any
ready: live-gate
---

Phase 71 D-06 extracts `rpc_humble_login_open` whole, so its body moved verbatim from the
`dispatch_rust_channel` arm into `src-tauri/src/login_window/humble_open.rs`. It is a single
641-line function (non-blank body plus comments), the largest handler in the shell.

A split into named steps (argument parsing, window build, presentation, native bar install) would
change control flow on the login path, so it needs a live sign-in on macOS (sheet presentation,
native login bar ordering) before it can land. The jest and cargo source pins read the handler
body, so they keep guarding the ordering needles across such a split only if the split keeps
them inside one function or the pins are repointed in the same commit.
