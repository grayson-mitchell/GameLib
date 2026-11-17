---
created: 2026-11-08T00:00:00.000Z
title: 'Split rpc_humble_login_clear_cookies into named steps'
area: shell
severity: minor
platform: any
ready: live-gate
status: 'RESOLVED 2026-11-17 (split landed in 56d8e4509, quick 261110-h8k; live gate: Windows 11 disconnects 2026-11-11 on 813bc7c6c and d9feed7b3, macOS disconnect 2026-11-17 census before matched=6, after matched=0, deleted=6)'
---

Phase 71 D-06 extracts `rpc_humble_login_clear_cookies` whole, so its body moved verbatim from the
`dispatch_rust_channel` arm into `src-tauri/src/login_window/humble_cookies.rs`. It is a single
573-line function carrying two platform branches (the macOS WKWebsiteDataStore removal and the
non-macOS wry/WebView2 path) and the Epic cold-jar window branch.

A split into named steps would change control flow on the logout path, so it needs a live
disconnect on macOS and Windows before it can land. Two source pins read this handler by its `fn`
line and closing brace: `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` (exact
`(handler, guard)` site set) and `epic_cold_jar_login_timeout_window_branch_*`. A split has to
repoint both in the same commit and re-derive the site set from a fresh measurement, never widen it.

## Resolution (2026-11-17)

The split landed in `56d8e4509` (quick `261110-h8k`): `count_window_cookies_matching_macos`,
`remove_window_cookies_macos` and `remove_window_cookies_windows`. The handler went from about 575
lines to 151. Both pins were repointed in the same commit, and the `(handler, guard)` site set was
re-measured unchanged (4).

Live gate, run on post-split code:

- **Windows 11, 2026-11-11.** Two Humble disconnects, run for `813bc7c6c` (`before=31 after=1 -> CDP -> after=0`)
  and `d9feed7b3` (`deleted=30`, closing census `matched=0`).
- **macOS, 2026-11-17.** One Humble disconnect under `pnpm tauri:dev`. `gamelib.log` shows storage
  cleared at 20:37:04, then
  `cookie census before(total=78, matched=6, verdict=SUPPORTED_NONEMPTY) after(total=72, matched=0, verdict=SUPPORTED_NONEMPTY) deleted=6 survivingNonHumble=72`.
  There was no discrepancy or incomplete line, and logging carried on afterwards, so the main thread
  did not wedge (F-34.4.2-12). The reconnect check was not reported. The `library fetch aborted`
  error at 20:37:04 was the in-flight sync being cancelled by the disconnect.
