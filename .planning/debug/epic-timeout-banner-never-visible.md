---
status: diagnosed
trigger: "UAT gap G-50-16 (Phase 50, UAT test 16, severity major): StoreEmbedTimeoutBanner never visible on an Epic store load timeout, despite the backend timeout literal firing 3 times."
created: 2026-10-13T00:00:00Z
updated: 2026-10-13T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — three Rust-side nav-lifecycle hooks (did_start_provisional_navigation, did_finish_navigation, epic_embed_handle_navigation_failure) unconditionally reset load_timed_out=false and enqueue a fresh event onto the same bounded ring buffer the monitor's raise event was just pushed onto; the renderer's 250ms drain (useStoreEmbedHost.ts GAP-D) applies only the newest queued event per tick, so any such reset event landing after a raise erases the signal before the banner (pure props-driven on timedOut, StoreEmbedTimeoutBanner.tsx:44-46) ever renders it. Trigger for the resets in this run: the operator's own repeated clicks on StoreEmbedControls' always-enabled toolbar Reload icon (StoreEmbedControls/index.tsx:107-113, never disabled unlike back/forward) -> storeEmbedReload() -> Rust reload() (macos_epic_embed.rs:885-889, unconditional webview.reload(), no URL/in-flight guard) -> cancels the pending provisional load with NSURLErrorCancelled(-999) and starts a fresh one, resetting the 45s clock each time. This is operator-driven, not a silent code retry loop (no autonomous reload/navigate call site found in the repo; the only automatic reload call sites are the three D-04 auth-change-gated ones in useStoreEmbedHost.ts, each single-shot, gated on a real recordSignInBaseline() state change).
test: Read reload()/navigate()/open() full bodies in macos_epic_embed.rs, confirmed no stopLoading/cancel call exists anywhere in the file (-999 is WebKit's own supersede-the-pending-navigation behavior, not an explicit Rust cancel) — refutes UAT Item 17's own stated theory that "the timeout monitor cancelled the hung provisional navigation" (spawn_load_timeout_monitor's body only sets flags/eprintln/enqueues, never touches the webview).
expecting: n/a — hypothesis confirmed via direct source read, see Evidence.
next_action: Write final ROOT CAUSE FOUND report (goal: find_root_cause_only — no fix in this session).

## Symptoms

expected: With Epic's store host routed to an unroutable address via a scoped /etc/hosts entry, opening Stores -> Epic shows no paint within 45s, the literal "[shell] macos_epic_embed: load timed out past 45s" appears in the session transcript, AND StoreEmbedTimeoutBanner renders with Reload and Open in browser visible on one row. Reverting the hosts entry and clicking Reload shows the store recover and paint normally.

actual: Split result — backend half PASSED, UI half FAILED. The timeout literal fired 3 times under a correctly-scoped host block. But the operator saw no banner at any point (asked directly, answered "no banner"), while actively watching the slot for the first 45s window. Recovery half unobserved because there was no banner to click Reload in.

errors: |
  From /tmp/gamelib-gate-50-20261013T081253Z/launch-3.log, in this exact order:
  61: [shell] macos_epic_embed: load timed out past 45s
  63-71: [shell] macos_epic_embed: didFailProvisionalNavigation -- The operation couldn't be completed. (NSURLErrorDomain error -999.)   [x9]
  72: [shell] macos_epic_embed: load timed out past 45s
  73-74: didFailProvisionalNavigation -- ... (-999)   [x2]
  75: [shell] macos_epic_embed: load timed out past 45s
  (-999 is NSURLErrorCancelled. First timeout precedes every cancellation. 3 timeouts total, 11 cancellations total.)

reproduction: UAT test 16 in .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md, Launch 3, dev pid 12135, 2026-10-14T05:46Z. Induced by scoped /etc/hosts blackhole of store.epicgames.com and www.epicgames.com, reverted after the arm.

started: Never worked — first live observation of this arm (Phase 50).

## Eliminated

- hypothesis: Embed suppression (embedSuppressed) hides the banner
  evidence: StoreEmbedTimeoutBanner is a sibling of the slot in src/frontend/screens/WebView/index.tsx (~line 628), driven only by embedHost.loadTimedOut. embedSuppressed only gates StoreEmbedSlotContents inside the slot. (Pre-established in debug_context; to be independently verified in this session.)
  timestamp: 2026-10-13T00:00:00Z

- hypothesis: Stale invoke-reply clobbers the loadTimedOut flag
  evidence: Rust merges load_timed_out onto every nav event via enqueue_nav_event / epic_nav_state_with_flags AND onto the direct-return path in navigate_webview_on_main_thread, so a late reply still carries the flag. (Pre-established in debug_context; to be independently verified in this session.)
  timestamp: 2026-10-13T00:00:00Z

## Evidence

- timestamp: 2026-10-13T00:30:00Z
  checked: src/frontend/screens/WebView/components/StoreEmbedTimeoutBanner.tsx (full, 96 lines)
  found: Component is pure/hookless beyond useTranslation; `if (!timedOut) return null` is the ONLY gate (line 44-46). No internal state, no own timer, no suppression check. Confirms the bug is entirely upstream of this component — the `timedOut` prop value itself is the thing that never arrives/sticks as true.
  implication: Rules out a rendering-layer defect in the banner itself.

- timestamp: 2026-10-13T00:35:00Z
  checked: src-tauri/src/macos_epic_embed.rs — navigate_webview_on_main_thread (821-857), back/forward/reload/navigate (864-924), grep for "stopLoading"/"cancel("
  found: `reload()` (885-889) calls `webview.reload()` unconditionally — no URL-equality guard, no in-flight-load guard (unlike open()'s warm path, which skips loadRequest when `!challenged && current_url == url_string`). `navigate()` (896-924) similarly unconditional. Grep for `stopLoading`/`cancel(` across the whole file returns zero matches — nothing in this module explicitly cancels a navigation.
  implication: NSURLErrorCancelled(-999) seen in the transcript is WebKit's own "a new navigation request superseded the pending one" behavior, triggered by a SECOND loadRequest/reload call landing while the first was still outstanding — NOT an explicit Rust-side cancel. This directly refutes UAT Item 17's own stated theory ("the timeout monitor cancelled the hung provisional navigation") — spawn_load_timeout_monitor's body (lines 499-555, read in full previously) only sets flags, eprintln!s, and enqueues an event; it never touches the webview object at all.

- timestamp: 2026-10-13T00:40:00Z
  checked: src/frontend/components/UI/StoreEmbedControls/index.tsx (full, 143 lines)
  found: The toolbar Reload icon (lines 107-113) has NO `disabled` prop — back/forward ARE gated on `backAvailable`/`forwardAvailable`, but Reload is always clickable regardless of load state or timedOut. This is a DIFFERENT button from StoreEmbedTimeoutBanner's own Reload (which never rendered in this run, so was never clicked).
  implication: The operator had a completely ordinary, always-available "page seems stuck, click reload" affordance available throughout the 45s+ hang, independent of the (never-shown) banner. Clicking it repeatedly is a natural, undocumented-but-expected operator action.

- timestamp: 2026-10-13T00:45:00Z
  checked: grep for all call sites of storeEmbedReload()/epic_embed_reload across src/ and src-tauri/src/
  found: Exactly 4 renderer call sites in useStoreEmbedHost.ts: 3 are the D-04 auth-change-gated auto-reloads (lines ~466, ~698, ~747 — each wrapped in `recordSignInBaseline(storeKey, signInState) && embedSurfaceFor(...) === 'epic'`, single-shot per real sign-in-state transition), 1 is the plain `onReload` user callback (~line 811, wired 1:1 to StoreEmbedControls' and the banner's onClick). No loop, timer, or on-failure/on-timeout handler anywhere calls reload()/navigate() automatically.
  implication: No evidence of a silent, code-driven automatic retry loop. D-04's auto-reload is real but single-shot and state-change-gated — cannot by itself explain 3 timeout cycles / 11 cancellations without 3+ genuine sign-in-state flips, which is not indicated anywhere else in the gate.

- timestamp: 2026-10-13T00:50:00Z
  checked: src/frontend/screens/WebView/__tests__/storeEmbedReloadLoop.test.tsx (full, 674 lines) and useStoreEmbedHost.test.tsx lines 1219-1282 (Property 26)
  found: storeEmbedReloadLoop.test.tsx is an UNRELATED regression test for a GOG-only bug (startUrl re-derived from localStorage on every render, causing a different auto-navigate loop) — it asserts on `navigateCalls`/`openCalls`, never touches `loadTimedOut` or the Epic surface's nav-event queue at all. Property 26 in useStoreEmbedHost.test.tsx is the ONLY existing test that touches `loadTimedOut` drain semantics, and it only pins "an EMPTY drain tick (mockResolvedValue([])) must not erase a previously-surfaced loadTimedOut=true" — it never simulates a drain tick (or a subsequent tick) whose queued batch's LAST event has `loadTimedOut: false` arriving after a `true` was enqueued, which is exactly the real-world race (a genuine subsequent nav-lifecycle event, not an idle poll).
  implication: Answers the required "why didn't an existing test catch this" finding — the test suite has a correct but narrow guard (idle-tick-must-not-reset) and a complete blind spot for the actual race (true-raise-followed-by-a-legitimate-reset-before-observed).

## Resolution

root_cause: |
  Primary (confirmed, code-level): `useStoreEmbedHost.ts`'s 250ms nav-event drain (GAP-D, lines ~306-337) applies only the newest queued event per poll tick ("Apply the LAST event only"), while THREE separate Rust-side WKNavigationDelegate hooks in macos_epic_embed.rs — did_start_provisional_navigation (~1392-1416), did_finish_navigation (~1360-1385), and epic_embed_handle_navigation_failure (~1697-1708, shared by didFailNavigation/didFailProvisionalNavigation) — all unconditionally set load_timed_out=false and enqueue a fresh event onto the SAME bounded ring buffer (pending_nav_events) the load-timeout monitor's load_timed_out=true raise event was just pushed onto, with no distinction between "a genuinely fresh, unrelated navigation" and "a navigation event that is itself a consequence of (or simply chronologically follows) an already-raised, not-yet-observed timeout." Any such reset event landing in the queue after a raise, and drained in the same or a later 250ms tick before the renderer/operator ever observed loadTimedOut=true, permanently erases the only signal StoreEmbedTimeoutBanner (itself correctly, purely props-driven on `timedOut`) depends on. load_timed_out is a plain bool with no latch/ack semantics — unlike blocked_launcher_scheme_count in the same struct, which is deliberately a monotonic counter specifically to survive this exact coalescing drain, confirming this asymmetry is a real design gap, not an oversight-free pattern.
  Proximate trigger (operator-driven, evidenced not merely inferred): StoreEmbedControls' toolbar Reload icon is always enabled (no disabled-while-loading guard), unlike back/forward. Clicking it calls storeEmbedReload() -> Rust reload() (macos_epic_embed.rs:885-889), which unconditionally calls webview.reload() with no URL-equality or in-flight guard. Each click cancels any still-pending provisional load (producing NSURLErrorCancelled/-999 — WebKit's own supersede-the-pending-navigation behavior, not an explicit Rust cancel: grep confirms no stopLoading/cancel call exists anywhere in the file) and starts a fresh navigation, which resets the 45s clock. Repeated clicks against a still-blackholed host naturally produce the observed pattern: 3 timeout raises, each followed shortly by a burst of -999s from the next reload attempt superseding the previous hung one. No autonomous/silent reload-loop code path was found anywhere in the repo (grep of every storeEmbedReload()/epic_embed_reload call site: 3 are D-04's single-shot, sign-in-change-gated auto-reloads; the 4th is the plain user-click callback). This resolves the debug_context's D-08 fork on the "operator-driven, timing/ordering defect" side, NOT a second independent silent-retry defect — see D-08 verdict below for the caveat on exact click count.
  Secondary/compounding (plausible, NOT independently confirmed as a trigger in this run): UAT Item 3 recorded an unexplained suppression-release in the SAME launch, after which the slot showed Epic's own cached 404 page. did_finish_navigation also unconditionally clears load_timed_out on any genuine finish, and is silent in the logs (no eprintln), so a cached-page finish clearing the banner legitimately per D-07 cannot be ruled in or out from this transcript — but a finish does not produce NSURLErrorCancelled, so it does not explain the 11 observed -999 cancellations; at most it is a second occurrence of the SAME underlying defect (unconditional, un-latched reset), not an alternative explanation for this run's specific log pattern.
  Corrected finding: UAT Item 17's own stated theory ("-999 ... the timeout monitor cancelled the hung provisional navigation") is NOT supported by the code — spawn_load_timeout_monitor (macos_epic_embed.rs:499-555) never touches the webview; it only sets flags, eprintln!s, and enqueues an event. The -999s are WebKit's standard response to a second navigation request (reload/loadRequest) landing while a prior one is still outstanding.
fix: N/A (goal: find_root_cause_only — no fix applied by this session)
verification: N/A
files_changed: []
