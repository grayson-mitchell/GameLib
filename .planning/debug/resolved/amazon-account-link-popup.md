---
status: resolved
trigger: "Amazon store: linking an Epic account opens the system browser and never resolves (todo .planning/todos/pending/2026-11-02-amazon-store-account-link-popup-never-resolves.md)"
created: 2026-11-05
updated: 2026-11-05
---

# Debug: Amazon store account-link popup never resolves

## Symptoms

DATA_START
- expected: On /store/amazon (gaming.amazon.com), claiming an Epic-delivered Prime Gaming game asks you to link an Amazon account to Epic. Finishing that link should let the claim page in the embed see the link, without leaving the app.
- actual: Clicking the link option opened the page in the system browser, and the flow never resolved in the embed. Linking the accounts from the browser alone worked.
- errors: none reported
- timeline: seen live on 2026-11-02 during the Amazon store-exit check (todo 2026-10-30-store-exit-library-refresh-for-epic-gog-amazon). Not known whether it ever worked under Tauri.
- reproduction: in `pnpm tauri:dev`, open /store/amazon, sign in, pick an Epic-delivered Prime Gaming claim, and choose to link the Epic account (unlink first in the browser if it is already linked).
DATA_END

## Prior static trace (orchestrator, 2026-11-05)

- The Tauri-managed store embed's `on_new_window` (src-tauri/src/main.rs:~7103) calls
  `store_embed_browser_handoff_policy` (src-tauri/src/store_embed_handoff_policy.rs:40). For any
  http(s) URL with a host it returns `HandToSystemBrowser`. The hook then calls `open_external`
  under the `STORE_EMBED_POPUP_THROTTLE` and always returns `NewWindowResponse::Deny`.
- So a `window.open` account-link popup always lands in the system browser and the embed's page
  gets a null window back. Any opener/postMessage completion, or polling of the popup window,
  cannot work.
- The current log line ("denied window.open request, routing to system browser (D-28)") does not
  print the URL or host, so the actual link host (e.g. www.epicgames.com/id/... or an
  amazon.com/ap/... interstitial) has not been captured. The todo asks for that capture first.
- D-28 / T-40-04-05 is the reason for the system-browser default: the password manager and URL
  bar don't exist in an in-app child webview. Any fix must keep http(s) → browser as the default
  for everything outside a narrow, justified allowlist.

Hypotheses to test:
- (a) The link is a `window.open` popup whose completion goes back through `window.opener` /
  postMessage or opener polling. Handing it off breaks it (most likely, per the static trace).
- (b) The link is a top-level navigation or redirect chain that the navigation policy hands off,
  rather than a popup. Then the on_navigation path is involved instead.
- (c) After the browser-side link succeeds, the embed would see it on reload, so a "finish in the
  browser, then reload" UX is enough. The todo reports the embed never resolved, but not whether a
  manual reload was tried.

Options the todo names: (1) an allowlisted in-app popup window for known account-link hosts that
keeps the opener relationship (wry/Tauri `NewWindowResponse::Create` or allow), or (2) detect the
link step, tell the user to finish in the browser, then reload the embed.

## Constraints

- Follow CLAUDE.md and Skill("gamelib-conventions"), including scoped `npx prettier --check`
  where it applies, explicit-path staging, and fake-HOME isolation for any spawned process in
  tests. Another session may be committing to main, so never `git add -A`.
- Don't raise deviation from upstream Heroic as a concern.
- The todo is `ready: live-gate`. Capturing the URL and the done check both need the operator in
  `pnpm tauri:dev` (never `tauri:dev:run`). Restart dev after Rust/sidecar changes before a live
  test. For live steps, ask the operator through a checkpoint with exact steps.
- A first cheap step that needs no design decision: make the on_new_window log line include the
  popup's host (and path, without the query string, which may carry tokens) so the operator's run
  captures it.

## Current Focus

- hypothesis: (a) the account-link step is a window.open popup that needs its opener; the system-browser handoff breaks it
- test: log the popup host/path in on_new_window, then have the operator reproduce live and report the logged URLs
- expecting: an Epic (and/or Amazon) sign-in/link host appears in a "routing to system browser" line at the moment of the click
- next_action: none (resolved)

## Evidence

- timestamp: 2026-11-05 (operator live run, `pnpm tauri:dev`, after fe33598ed added host/path logging)
  checked: shell log at the moment of clicking link-Epic on the Amazon claim page
  found: the embed was on host `luna.amazon.com` (same-document navigations), then
    `[shell] store_embed: denied window.open request to www.epicgames.com/id/authorize, routing to system browser (D-28)`.
    No on_navigation handoff line. After the link finished in the system browser, the link button
    in the embed showed a spinner that never resolved.
  implication: hypothesis (a) is confirmed. The link is a `window.open` OAuth authorize popup to
    Epic, and denying it in the embed leaves the opener waiting forever. Hypothesis (b), a
    top-level navigation, is eliminated. Hypothesis (c), whether a reload picks up the link, is
    still untested.
- timestamp: 2026-11-05 (operator, same run)
  checked: reloaded / re-entered the Amazon store after the system-browser authorize tab
  found: the claim page still offers "link account". A reload does not pick up the link.
  implication: hypothesis (c) is eliminated. Handing the popup to the browser cannot complete the
    link, probably because the opener-less tab has nothing to hand the auth code back to. The
    finish-in-browser option is ruled out. The operator chose the allowlisted in-app popup.

## Eliminated

## Resolution

- root_cause: Amazon's "link your Epic account" step is a `window.open` OAuth popup to `www.epicgames.com/id/authorize` that finishes through `window.opener`. The store embed's `on_new_window` sent every http(s) popup to the system browser (D-28) and denied it in the embed. The browser tab had no opener, so the link never completed: the button spun forever, and a reload still offered "link account".
- fix: d8682c350 adds a new `StoreEmbedBrowserHandoffDecision::OpenInAppPopup`, used only for https + host exactly `www.epicgames.com` + path under `/id/` (no port, no userinfo). `on_new_window` builds an in-app `WebviewWindow` with `window_features(features)` (opener and session kept, fixed label `store-embed-link-popup`, no throttle slot) and returns `NewWindowResponse::Create`. All other http(s) popups keep the D-28 system-browser path. The macOS raw Epic WKWebView treats the new variant as a browser hand-off (unchanged). fe33598ed logs the host and path (no query string) for popup hand-offs.
- verification: cargo check, cargo fmt --check, cargo test (418, including 7 new policy tests). Operator live check on 2026-11-05 in `pnpm tauri:dev`: the log showed `window.open to www.epicgames.com/id/authorize -- opening in-app popup (opener kept, todo 2026-11-02)`, Epic sign-in ran in the in-app window, and the account linked. Not checked live: that a non-Epic popup still goes to the system browser (covered by unit tests only), and the Windows/Linux builds.
- files_changed: src-tauri/src/store_embed_handoff_policy.rs, src-tauri/src/main.rs, src-tauri/src/macos_epic_embed.rs
