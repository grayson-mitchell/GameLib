---
quick_id: 261003-nsk
title: Themed title bar for the Humble login sheet and a 572px start width
created: 2026-10-03
mode: discuss
---

# Locked decisions

These were settled with the operator before planning. Do **not** revisit them.

## D-1 — "Themed" means a FIXED palette hard-coded into the injected script

The chrome is injected into `humblebundle.com`'s own document, so it cannot read GameLib's CSS
custom properties, and the app ships 13 themes. Four routes were put to the operator:

| | chrome lives in | real theming | `x` on the right |
| --- | --- | --- | --- |
| **A (CHOSEN)** | the login page's DOM, injected | no — fixed palette | yes |
| B — stop presenting as a sheet | native macOS title bar | no | no, macOS closes top-LEFT |
| C — native AppKit `NSView` bar | above the `WKWebView` | hand-written objc2 | yes |
| D — second webview (multiwebview) | real GameLib UI | yes, live theme vars | yes |

**Chosen: A.** One file, no new attack surface on a credential-bearing window, and "looks like
GameLib rather than a generic black pill" is fully achievable with a fixed dark palette. The
operator was told explicitly that A does **not** track a theme switch; if that is ever wanted it
is route D and a different-sized job.

B was ruled out on the merits, not on the prior decision: macOS puts the close button top-LEFT
and draws the title itself, so B cannot deliver the requested shape at all. Recorded because
`D-CYCLE7-A` is softer than it reads — it closed "stop presenting as a sheet" on the grounds that
sheet presentation was already SHIPPED and live-PASSED, **not** because a non-sheet window was
found broken. What was live-confirmed broken is CHILD-WINDOW attachment (`F-34.4.2-01/-02`,
unresponsive after minimize/restore), a different mechanism. B stays reversible for some future
reason; it just buys nothing here.

## D-2 — A floating full-width overlay, NOT a strip that pushes page content down

Pinned to the top like today's two pills. A real strip would need a body offset injected into a
page we do not control, and Humble's login already sits inside its own scroll container. Zero
risk of fighting Humble's layout is worth more than the extra fidelity.

## D-3 — Scope is `humble_login_open`'s macOS visible arm ONLY. Epic is out, by construction

`open_pristine_epic_login_window` (`main.rs:3558`) contains **zero** `initialization_script`
calls — verified, not assumed. That zero-injection property is the whole point of the pristine
window: it is what defeated Talon's anti-bot 403 under Tauri. Injecting chrome there would risk
re-arming the exact 403 the pristine path exists to defeat.

Consequently its own `.inner_size(900.0, 700.0)` at `main.rs:3571` **stays 900** as well — 572 was
measured on the Humble sheet specifically, and Epic's login form is a different layout.

# Measurement behind the width

`CGWindowListCopyWindowInfo([.optionOnScreenOnly])` against the live `gamelib-shell` pid 31421 on
2026-10-03: exactly ONE on-screen login window, `kCGWindowName` `https://www.humblebundle.com`,
x=2308 y=385 **w=572 h=700**. Other `humblebundle.com` entries in the unfiltered list are
off-screen stragglers and were excluded by `.optionOnScreenOnly` — a census over
`.optionAll` returns six and is wrong.

`src-tauri/src/main.rs:7365` is `builder = builder.inner_size(900.0, 700.0);` inside
`humble_login_open`'s `if visible` block. Width 900 -> 572. Height stays 700.
