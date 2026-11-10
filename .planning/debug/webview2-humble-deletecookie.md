---
status: investigating
trigger: "WebView2 DeleteCookie leaves non-partitioned Humble cookies — todo .planning/todos/pending/2026-11-11-webview2-deletecookie-leaves-non-partitioned-humble-cookies.md"
created: 2026-11-11
updated: 2026-11-11
---

## Symptoms

- **Expected:** On Windows, `remove_window_cookies_windows` (src-tauri/src/login_window/humble_cookies.rs ~804-965) removes all matching non-partitioned cookies via `ICoreWebView2CookieManager::DeleteCookie` on the original `GetCookies` objects; the CDP `Network.deleteCookies` pass only mops up partitioned (CHIPS) stragglers — which is what the arm's header comment claims, based on the Epic measurement of 2026-09-26 (`before=9 after=1`, sole survivor `cf_clearance`, partitioned).
- **Actual:** Live Humble disconnect on Windows 11, 2026-11-11 (the Windows half of the `split-rpc-humble-login-clear-cookies-into-named-steps` live gate):
  ```
  [shell] humble_login_clear_cookies: before=35 after=25 settle_rereads=20
  [shell] humble_login_clear_cookies: CDP cleanup issued=25 partitioned=2
  [shell] humble_login_clear_cookies: after CDP cleanup after=0
  ```
  DeleteCookie removed 10 of 35; 25 survived the full 2s settle window; only 2 of the 25 were partitioned. 23 non-partitioned cookies survived DeleteCookie. End state is correct (`after=0`) because CDP cleared them.
- **Errors:** none user-visible. Latent risk: if the CDP pass fails (`CDP cleanup failed:` arm), most Humble cookies remain; the TS guard fails closed (user sees a failed disconnect, not a silent half-logout). Severity minor.
- **Timeline:** First Humble-on-Windows measurement; no earlier baseline. Not caused by named-steps split `56d8e4509` (fn moved verbatim).
- **Reproduction:** Windows 11, `pnpm tauri:dev`, sign in to Humble, then disconnect Humble; read `%LOCALAPPDATA%\GameLib\logs\gamelib.log`. Requires the operator's live Humble account — `ready: live-gate`.

## Constraints

- Never log cookie names or values (T-34.4.1-02). Count-only / shape-only diagnostics: domain shape (leading dot vs host-only), path, IsHttpOnly, IsSecure, SameSite, session vs persistent, partitioned.
- The TS fail-closed guard must not be loosened.
- Prior resolved session for the same machinery: .planning/debug/resolved/webview2-delete-cookie-noop.md (three causes: wry stripped leading dot; DeleteCookie async → 2s settle; CHIPS → CDP pass).
- A faithful Chromium desk reproduction does NOT reproduce WebView2 behaviour; only live measurement on the operator's Windows machine settles mechanism questions.

## Questions to answer

1. Which shape(s) do the 23 non-partitioned survivors share vs the 10 that were removed?
2. Is DeleteCookie still async-pending after 2s (longer settle), or does it genuinely refuse?
3. Is `DeleteCookiesWithDomainAndPath`, or CDP alone, the more honest primary path? Then correct the header comment to match what is measured.

## Current Focus

bug_class: Bohrbug (deterministic per jar contents) on a platform behaviour only measurable live; SBFL n/a (no test spectrum for a COM surface).
hypothesis: none confirmed. Five competing, falsifiable candidates, all distinguishable by ONE live run of a diagnostics build:
  H-quota  — the in-handler `DeleteCookie` loop only lands the first ~10 calls (WebView2 queue/quota). 10 of 35 is a round number and Epic's 9 and 1 per-call sets are both <=10, so the old Epic data cannot rule it out. Predicts: survivors' pre-delete enumeration indices are a contiguous tail; a second `DeleteCookie` pass with fresh objects removes ~10 more. Refuted by: survivors scattered across the index range AND second pass removing 0.
  H-shape  — survivors share an attribute the removed lack (SameSite / session vs persistent / source scheme or port / priority / path / subdomain depth / leading dot). Predicts: a dimension whose survived/before ratio is ~1.0 for one value and ~0 for another.
  H-async  — still pending after 2s. Predicts: count drains during an extended (+3s) wait. Already weak: 20 re-reads at 100ms held at 25.
  H-reset  — the still-live page re-sets cookies after delete. Predicts: survivors with changed value or not present in the pre-delete survey.
  H-stale  — `DeleteCookie` on objects handed to the `GetCookies` completion handler itself is racy; fresh objects work. Predicts: second pass removes some or all.
  Cross-category branch (code / environment / data): code = the in-handler loop (H-quota, H-stale); environment = WebView2 runtime behaviour/version (H-async, H-shape on source scheme); data = what Humble sets and re-sets (H-shape, H-reset). AND-gate: yes, plausible — the 2 partitioned survivors are already a second, independent cause alongside whatever strands the 23.
test: debug-build-only, count-only diagnostics in the Windows arm, `src-tauri/src/login_window/windows_cookie_diag.rs`. Sequence inside one disconnect: (1) read-only pre-survey from COM `GetCookies` and CDP `Storage.getCookies`; (2) the unchanged production `DeleteCookie` pass + 2s settle; (3) if survivors: post-settle COM + CDP surveys diffed against (1) -> per-dimension and per-shape `before/survived` tables, survivors' pre-delete enumeration indices, `new_since_pre`, `value_changed`; (4) E1 +3s extra watch with no action (H-async); (5) E2 up to 3 more `DeleteCookie` passes on fresh objects (H-quota, H-stale); (6) E3 `DeleteCookiesWithDomainAndPath` (Q3); (7) the unchanged production CDP pass.
expecting: H-quota -> survivor_pre_enumeration_idx is a contiguous tail and each E2 pass removes ~10. H-shape -> some `dim` line shows survived ratio ~1 for one value, ~0 for another (COM dims: dot, depth, path, http, secure, samesite, life, empty; CDP adds part, scheme, port, prio). H-async -> E1 `changes` drains to 0. H-reset -> `new_since_pre`/`value_changed` > 0. H-stale -> E2 pass 2 removes most of the remainder. E3 removes N -> `DeleteCookiesWithDomainAndPath` is the better primary path.
next_action: AWAITING OPERATOR LIVE RUN. Operator: `pnpm tauri:dev` on Windows 11, sign in to Humble, disconnect Humble, then paste back `%LOCALAPPDATA%\GameLib\logs\humble-cookie-diag.log` (and the `humble_login_clear_cookies` lines from the terminal). Then: read the DIAG lines, confirm/eliminate each hypothesis, pick the fix (likely: make CDP the primary pass or repeat-DeleteCookie/DeleteCookiesWithDomainAndPath, per the measurement), correct the header comment, remove the diagnostics (file header lists every removal site), `cargo check` + `cargo test`, live re-run to confirm `after` drops with no CDP rescue, archive.

## Evidence

- timestamp: 2026-11-11
  checked: humble_cookies.rs Windows arm (804-965), windows_cdp.rs, resolved webview2-delete-cookie-noop.md
  found: the first pass calls `DeleteCookie` on the ORIGINAL `GetCookies` objects, inside the completion handler, in one tight loop with no per-call result inspection beyond logging a refusal. The settle re-read goes through wry's `cookies()` (COM `GetCookies`), so it counts what `DeleteCookie` could address. The CDP listing (`Storage.getCookies`) issued 25 = the 25 COM survivors, so the two views agree on the survivor set.
  implication: nothing in the code explains a partial removal; it is a WebView2 behaviour, so only live measurement settles it (A faithful Chromium desk repro does not reproduce WebView2).
- timestamp: 2026-11-11
  checked: Epic baseline (resolved session) against the Humble numbers
  found: Epic per-call sets were 9 and 1 (<=10); Humble's set is 35 and exactly 10 were removed.
  implication: H-quota is consistent with BOTH data sets and was never testable before. It is the cheapest hypothesis to refute (index list + a second pass).
- timestamp: 2026-11-11
  checked: T-34.4.1-02 / T-34.4.1-94 wording (.planning/quick/260831-q93.../PLAN.md:95)
  found: the rule is "never log a cookie NAME, VALUE or DOMAIN". The task note names domain SHAPE as allowed; the stricter rule means no domain text and no name-derived class (no `__Host-`/`__Secure-` prefix flag).
  implication: diagnostics log only buckets (dot/host, subdomain depth, path depth, booleans, expiry bucket, enum names) and in-memory-derived counts and indices. The snapshot struct holding name/value is deliberately not `Debug`.
- timestamp: 2026-11-11
  checked: main.rs source-text guards (`SHELL_SOURCE_FILES`/`SHELL_SOURCE_PARTS`, `shell_source_files_names_every_shell_module_file`)
  found: a new shell `.rs` file must be named in both lists or a test goes red.
  implication: add `login_window/windows_cookie_diag.rs` to both lists alongside the new module.
- timestamp: 2026-11-11
  checked: where the shell's `[shell] humble_login_clear_cookies:` lines actually land on this Windows machine (`%LOCALAPPDATA%\GameLib\logs\gamelib.log` and `gamelib.log.old`, `grep -c '\[shell\]'`)
  found: 0 `[shell]` lines in either file. `shell_eprintln!` writes only to the shell process's stderr (main.rs:72-79); `shell_diag()`'s file sink needs `HOME`, which is normally unset on Windows. The task note's "log at gamelib.log" is wrong for these lines; the 2026-11-11 numbers must have been read from the `pnpm tauri:dev` terminal.
  implication: the diagnostics write every line to stderr AND append it to `%LOCALAPPDATA%\GameLib\logs\humble-cookie-diag.log` so the operator has one file to read back.
- timestamp: 2026-11-11
  checked: diagnostics build, desk gates
  found: `cargo check --manifest-path src-tauri/Cargo.toml` clean (the same 5 pre-existing dead-code warnings, none in touched files); `cargo test` 416 passed / 0 failed / 3 ignored, including `shell_source_files_names_every_shell_module_file` and `shell_source_parts_align_with_file_names`; the new file is rustfmt-clean; humble_cookies.rs has 9 rustfmt diffs both at HEAD and now (all pre-existing, none in the touched region). `cargo fmt --check` crate-wide is red on pre-existing debt in ~25 other files, so it is not a usable whole-crate gate here.
  implication: the build compiles and the guards pass; only a live run can supply the measurement.

## Eliminated

## Resolution
