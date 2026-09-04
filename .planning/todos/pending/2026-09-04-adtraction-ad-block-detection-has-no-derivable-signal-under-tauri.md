---
created: 2026-09-04T00:00:00.000Z
title: "Adtraction/ad-block detection (D-32) has no derivable signal under wry/tauri — declared gap, not shipped"
area: store-embed
severity: low
status: pending
resolves_phase: ""
found_by: "Phase 40 Plan 09, Task 3 (D-32 re-derivation)"
files:
  - src/frontend/screens/WebView/index.tsx
  - src-tauri/src/main.rs
---

## Symptom

The retired Electron `<webview>` adtraction workaround (`599fd51f2`, `[FIX] Adtraction fallback
(#3575)`) is not re-derived under the Tauri embedded child webview (D-01/D-24/D-25). GOG's
affiliate start URL (`https://af.gog.com?as=1838482841`) redirects through
`track.adtraction.com` before landing on `gog.com`; when that host is blocked (ad-blocker,
`/etc/hosts` entry, network policy), the Electron implementation caught the resulting
`did-fail-load` event on the `<webview>` tag, matched `validatedURL` against
`track.adtraction.com`, extracted a redirect target from that URL's own query string, stripped
any port (GOG began emitting one that makes the target unreachable), navigated the webview
there, and showed a one-time dismissible warning `Dialog`.

**Correction to D-32's own stated caveat:** the retired detection was a MAIN-FRAME load-failure
listener whose failed URL was the tracker's own — it was never a subresource detector. The
difficulty re-deriving it is not "main-frame events cannot see a subresource"; it is that no
navigation-failure signal exists at all in the replacement stack.

## Why no equivalent exists (the citation)

`40-EMBED-API-VERIFICATION.md` Q3 (this phase's own vendored-source scan):

> Citation: `wry-0.55.1/src/wkwebview/class/wry_navigation_delegate.rs` (the full
> `WKNavigationDelegate` `impl` block) implements exactly six delegate methods... Apple's
> `WKNavigationDelegate` protocol additionally defines `webView:didFailProvisionalNavigation:
> withError:` and `webView:didFailNavigation:withError:` — neither is implemented here...
>
> **VERDICT: ABSENT**

No `on_navigation_failed` / `on_load_error` field exists on `wry`'s `WebViewAttributes` either.
Neither `tauri` nor `wry` expose any navigation-FAILURE callback on macOS — there is no
`did-fail-load` analog to catch at all.

The fallback this task considered — arm a deadline from `on_navigation` when it observes a
main-frame navigation to the tracker host, disarm it from `on_page_load`'s next main-frame
Started event (the 013-015 "deadline-armed relay" shape) — also cannot be built safely. The
store embed's own `.on_navigation(` closure (`store_embed_open`, `src-tauri/src/main.rs`, D-29)
has the signature `move |url: &Url| -> bool` — no frame-type flag. This project already
established that exact limitation for the SAME hook, independently, in a different arm's own
comment (`main.rs`, the `on_document_title_changed` origin-tracking arm, citing spike 013): "5 of
8 `on_navigation` events [are] third-party iframes, the callback carries no frame-type flag to
filter them." Arming a deadline on `on_navigation` without being able to restrict it to
main-frame-shaped navigations would let a third-party ad subframe re-arm the deadline
indefinitely — precisely the defect the 013-015 on_page_load-vs-on_navigation rule exists to
prevent (T-40-09-05, Denial of Service).

The only mechanism in this codebase that CAN see main-frame-vs-subframe (`EpicPristineNavDelegate`,
a hand-rolled `objc2` `WKNavigationDelegate` reading `action.targetFrame().map(|f|
f.isMainFrame())`) is a fundamentally different, much heavier native construct built for a single
special-purpose login window — attaching an equivalent custom delegate to the store embed's
`WKWebView` would be a new architectural surface for this control alone, not a re-derivation
using the primitives the store embed already has.

## What shipped instead (Phase 40 Plan 09)

Per D-32's own escape clause ("raise it rather than shipping a detection that cannot fire"):

- The orphaned `showAdtractionWarning`/`dontShowAdtractionWarning` state and its `void` refs were
  removed from `index.tsx` (the Dialog render itself was already deleted in plan 40-01 — only the
  state had survived, unreachable).
- A "logged, never silent" gap line fires once per GOG store visit
  (`window.api.logInfo('[WebView] D-32 gap: ...')`, gated on `store === 'gog'`), citing Q3's
  ABSENT verdict and the on_navigation frame-flag limitation.
- A test (`WebViewAdtractionGapDeclared.test.ts`) asserts the gap log line's gating and content,
  and that no adtraction Dialog/state remains reachable.

## Possible resolution paths (not attempted here)

1. **Do nothing further** — GOG's affiliate redirect chain works normally when
   `track.adtraction.com` is not blocked, which is the common case. The user-facing regression
   is narrower than D-32's stated scope: a blocked tracker now leaves the embed showing
   whatever `track.adtraction.com` itself renders (or a blank/error page) instead of silently
   falling through to `gog.com`, with no warning explaining why.
2. **A hand-rolled `objc2` `WKNavigationDelegate` for the store embed**, mirroring
   `EpicPristineNavDelegate`'s `isMainFrame()` check, attached via whatever `wry`/`tauri` expose
   for customizing a `WebviewBuilder`'s underlying delegate (if anything — this was not
   investigated). This is a real architectural addition (new native delegate class, new
   attachment point), not a same-shaped port, and should go through its own plan with its own
   threat-model pass rather than be folded into a "re-derivation" task.
3. **A generic main-frame stall detector** unrelated to the tracker host specifically: if
   `on_page_load`'s Started event fires for a URL and no Finished follows within some deadline,
   surface a generic "this page failed to load" affordance (reusing `WebviewUnavailablePanel`'s
   shape) rather than trying to detect the adtraction case by name. This sidesteps the
   frame-flag problem entirely (no arming keyed to a specific tracker host, so a subframe
   re-arming it is irrelevant) but changes behavior beyond D-32's original scope and needs its
   own design pass.

## Impact

Low. GOG remains fully usable; the only lost behavior is the specific fallback + one-time warning
when `track.adtraction.com` is blocked. This is a narrower regression than "GOG is broken" — it
is "one specific redirect-chain failure mode has no explanatory UI."
