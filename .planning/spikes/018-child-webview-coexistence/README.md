---
spike: 018
name: child-webview-coexistence
type: standard
validates: "Given main + child webviews in one window, when cookies and events are exercised, then cookies() works on the child handle, on_page_load fires for it, and jar sharing/isolation matches spike 015's window-level findings"
verdict: VALIDATED
related: [013, 014a, 015, 016, 017]
tags: [tauri, webview, cookies, events, isolation, data-store-identifier, macos]
---

# Spike 018: Child webview coexistence (cookies, events, isolation)

Shares the 016 harness — see `../016-embedded-child-webview-basic/app/` for how to run.
Question: do the 013–015 findings (measured on child *WebviewWindows*) carry over to child
*webviews inside another window*? Login detection for an in-app store browser depends on it.

## Investigation Trail

1. **Events fire per-child, same shape as 013.** `on_navigation` and `on_page_load`
   (Started/Finished, main frame) both fired on the embed for the loopback origin and the
   Steam store, and on probe B's `multi-store` child for GOG. The `did-navigate` analog is
   available for embedded store browsers exactly as for login windows.

2. **`cookies()` works on the child handle** — 8 cookies including HttpOnly ones
   (`steamCountry`, `spike_httponly`), read in single-digit ms from the main thread via a
   hop, matching 014a's timing class. Nothing about being a child (vs a window) degraded the
   cookie API.

3. **The default jar is shared across ALL webviews — including children.**
   `cookies()` on the `main` handle returned the identical jar: the embed's control cookies,
   Steam's cookies, and later GOG cookies set by *probe B's* child in a *different window*
   (`csrf`, `gog_lc`, `cart_token`, `g_state`). This extends 015's "no isolation by default"
   finding to the multiwebview shape: one process, one `WKWebsiteDataStore`, however many
   windows and children you have.

4. **`data_store_identifier` genuinely partitions a CHILD jar.** Phase 8's discriminator:
   the shared jar held Steam/GOG cookies; a fresh isolated embed visiting the control origin
   saw ONLY its 3 `spike_*` cookies — no Steam, no GOG. Meanwhile `main` still saw all 12.
   So per-store isolated sessions are possible for embeds (macOS 14+ constraint from 015
   still applies).

5. **Handle lifetime matches 015.** After `close()`, `cookies()` on the child label fails
   loudly (`no webview 'store-embed'`). An isolated child's jar is reachable only while that
   child lives — anchor any login poller to a webview that outlives the poll, same rule as
   015.

6. **Surprise / discrepancy with 014a-era notes:** `spike_secure` and `spike_both`
   (Secure cookies set over `http://localhost`) never appeared in ANY read this session
   (shared or isolated), whereas the 013/014a runs recorded Secure-over-loopback as
   accepted. Real-HTTPS Secure+HttpOnly cookies (`steamCountry`) worked fine, so this only
   affects loopback positive-control design: **a control origin must not rely on Secure
   cookies over plain http** — keep the discriminating control cookies flag-free or
   HttpOnly-only.

## Results

**VERDICT: VALIDATED** — the 013–015 cookie/event model carries over to embedded children
unchanged: same APIs, same sharing default, same isolation mechanism, same handle-lifetime
rule. The one new fact is ecosystem-level: **every webview in the process shares one default
jar**, so a logged-in store embed's session is readable from any window's handle (convenient
for pollers, a hygiene argument for `data_store_identifier` per store).

Carried-over cautions that remain in force for embeds: never `cookies_for_url()` (014a);
`on_page_load` not `on_navigation` for anything deadline-armed (013); `window.__TAURI__` is
injected into the remote store origin (014b) — threat-model before shipping.
