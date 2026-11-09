---
created: 2026-11-09T00:00:00.000Z
title: 'Split fn main setup in main.rs into named steps'
area: shell
severity: minor
platform: any
ready: live-gate
---

`src-tauri/src/main.rs` `fn main` is one 1,175-line function (lines 662-1836 at the end of Phase 71).
It is why main.rs stays over the ~1,000 non-test-line target (1,877 non-test lines; 3,962 total with
72 tests that stay for D-09 reasons recorded in 71-17-SUMMARY).

Splitting the setup into named steps changes control flow: values built early are captured by later
closures (setup hook, event handlers, plugin builders), so extraction forces ownership, clone and
ordering decisions. That is the same D-06 rationale that kept it out of a mechanical move. Phase 71
D-13 records this as an allowance rather than a fix.

Needs the live-gate because setup ordering regressions only show at runtime (window creation, tray,
single-instance second launch, sidecar spawn, keyring read after relaunch).
