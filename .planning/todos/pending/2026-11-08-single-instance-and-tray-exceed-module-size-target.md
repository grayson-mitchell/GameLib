---
created: 2026-11-08T00:00:00.000Z
title: 'single_instance.rs and tray.rs exceed the Phase 71 module-size target'
area: shell
severity: minor
platform: any
ready: code
---

Phase 71 D-13 sets a per-module size target for the Rust shell. Measured with
`.planning/phases/71-rust-shell-module-decomposition/tools/sizes.py` (non-test lines) at the end
of Plan 71-05:

- `src-tauri/src/single_instance.rs`: 1,620 lines
- `src-tauri/src/tray.rs`: 1,158 lines (includes the new `rpc_tray_set_icon` handler)

Both are outside Phase 71's four named decomposition targets, so Phase 71 records them rather than
fixing them (D-13). A later phase can split them along their existing section seams.
