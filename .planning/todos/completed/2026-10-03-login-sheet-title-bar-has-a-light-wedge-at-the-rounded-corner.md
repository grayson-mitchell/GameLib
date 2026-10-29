---
created: 2026-10-03T05:35:00.000Z
title: Login sheet's injected title bar shows a light wedge in the scrollbar gutter at the rounded top-right corner
area: ui
severity: minor
platform: macos
ready: blocked
found_by: "Operator live observation during fast task 261003-sbr (reported as a little white triangle in the upper-right corner when the scrollbar is visible), 2026-10-03"
files:
  - src-tauri/src/main.rs:3684-3722
  - src-tauri/src/main.rs:3554-3612
  - src-tauri/src/main.rs:3403-3476
  - .planning/quick/261003-nsk-humble-login-title-bar/261003-nsk-CONTEXT.md

audit_acknowledged:
  milestone: v0.8
  at: 2026-10-16
---

## Problem

The Humble login sheet's in-page title bar (`login_origin_banner_script` +
`login_cancel_strip_script`, with `login_scrollbar_inset_script` holding the scrollbar below it)
leaves a small light wedge in the **scrollbar gutter at the window's rounded top-right corner**,
visible only while a classic scrollbar is showing.

Cosmetic only. Everything the bar is for works: centred origin, `×` flush right with its
accessible name intact, and the scrollbar starting below the bar.

## Measured, 2026-10-03

Pixel-sampled from the live sheet (`screencapture -R` plus an `NSBitmapImageRep` dump), not
eyeballed:

- The wedge is `#e3e3e3`, filling the 14px gutter from **y≈4 to y≈18**, bounded on the right by
  the window's corner arc and cut off by a **sharp horizontal edge** where the dark gutter
  (`#161c1e`) begins.
- The bar itself is correct — dark through to y=31, i.e. exactly its declared 32px height.
- The **bottom**-right corner has no equivalent artifact: the gutter is dark right down to the arc.

## Attributed, 2026-10-16 — the live gate is CLOSED, at the desk

The 2026-10-03 note said the cause could only be found with Web Inspector against the live sheet.
It did not need to be. A throwaway AppKit harness (`swiftc`, ~200 lines, scratchpad only) that
presents a `WKWebView` child window as a **real sheet** via `beginSheet:` — not the borderless
approximation the first probe used — with the three injected scripts extracted **verbatim** from
`main.rs`, reproduces the operator's wedge to the pixel on the same 3440x1440 1x panel, macOS
26.6.2: page colour in the gutter from the arc down to y=18, `#161c1e` from y=19, bar dark to
y=31. Giving the probe page a Humble-like `body { background: #e3e3e3 }` reproduces the
**colour** too (`#e5e5e5` through the display profile).

**What owns those pixels: WebKit's macOS 26 scrollbar corner avoidance, plus the document
background colour.** Two facts, both measured by toggling one thing at a time:

1. **The main-frame scrollbar does not start at y=0 in a sheet. It starts at y=19.** Run-length
   dumps of the gutter column put the custom scrollbar's `::-webkit-scrollbar` background at
   19..661, the track (with its 32px `margin-top`) at 51..661, the thumb from 51, and the
   `::-webkit-scrollbar-corner` filling 662..688 below it. The native scrollbar (inset script
   removed) is inset the same way, ~21px at both ends. The sheet window reports
   `NSThemeFrame.cornerRadius = 26`, the `WKWebView` reports
   `_effectiveCornerRadii = 26/26/26/26` (macOS 26 AppKit's `NSViewCornerConfiguration`
   machinery; `WKWebView` implements `_viewDidChangeEffectiveCornerRadii`), and 19 is where a
   26pt arc crosses the scrollbar's outer pixel column. Inset the webview 40px from the window
   edges and the radii read 0 and the scrollbar starts at the webview's top edge; present the same
   webview in an ordinary titled window and there is no inset either. So the inset is derived from
   the window corner the webview is flush against — exactly the geometry a sheet always has — and
   it is new with macOS 26's larger corner radius, which is why nobody saw it before.
2. **The gutter above the scrollbar frame shows the document background colour**, i.e. WebKit's
   `html`-then-`body` colour blend — for Humble, `#e3e3e3`. `html { background-color: red }`
   turns the wedge red; `html { background-color: red }` with `body { background: #e3e3e3 }` leaves
   it `#e3e3e3`. Nothing the page *paints* reaches it.

## Levers measured — REFUTED (do not re-try)

| lever | result |
| --- | --- |
| `NSWindow.backgroundColor` | refuted 2026-10-03, byte-identical captures |
| `html` band via `background-image` + `background-attachment: fixed` + `background-size: 100% 32px` | refuted again, now with the reason: a fixed root background is painted in a viewport-sized layer that **excludes** the gutter, and the wedge is a colour fill, not a painted area |
| the same band on `body` | refuted, same reason |
| `width: 100vw` on the bar | refuted ×2 in 261003-sbr, still true — a `position: fixed` element cannot paint into the gutter |
| `html { background-color }` | technically paints the wedge but only by changing the page's own canvas colour, and is overridden by any `body` colour — Humble's page has one |
| `titlebarAppearsTransparent` | no change |
| `_setAutomaticallyAdjustsContentInsets: NO` | no change — the inset is not a content inset |
| overriding `_shouldStopCornerInsetsPropagationFromSuperview:` on the webview | no change |
| public `-[WKWebView setObscuredContentInsets:]` top=32 (macOS 26) | the strip 0..32 fills dark across the full width via WebKit's fixed-colour extension of the bar, **but** the layout viewport moves down 32 so the bar with its text sits at 32..64 (a 64px bar); lifting the bar with `translateY(-32px)` makes it invisible — the obscured strip cannot show page content |

## Levers measured — WORKING

- **Override `_effectiveCornerRadii` to return `nil` on the webview** (a `WKWebView` subclass in
  the probe; an isa-swizzle or `class_addMethod` on wry's `WryWebView` class in Rust —
  `main.rs:1390` already uses `class_addMethod` for the terminate veto, so the mechanism has
  precedent). The scrollbar then runs from y=0 to the bottom, its dark background fills the gutter
  to the arc, and the wedge is gone. It is **private AppKit API** in the credential window: it
  exists only on macOS 26 AppKit (guard with `respondsToSelector:`), may change meaning in a later
  release, and the probe only showed it renders without crashing for a few seconds. Not shipped
  by this task; recorded as the one route-A fix that exists.
- **Any native bar that insets the webview ≥ 26px from the top corners** (route C, route D)
  zeroes the top radii as a side effect, so the scrollbar starts at the webview's top and there is
  nothing to paint. The bottom corners keep their 19px inset, which the dark scroll corner already
  covers.

## Why `ready: blocked`

The gate's only question — what owns the pixels — is answered, and the answer is that **route A
(in-page chrome, D-1 option (a) in `261003-nsk-CONTEXT.md`) cannot fix this from the page.** The
remaining options are a private-API override or the heavier native routes the 2026-10-03 note
already costed. This item is parked on those: if route C or D is ever taken (route D for the
theming reason), close this row with it rather than spending separate effort here. If the
private-API override is wanted instead, that is a decision, not a measurement — flip to
`ready: code` with the decision recorded and the harness description above is enough to rebuild
the rig for the before/after capture.

## Arming conditions

- macOS 26 or later — the corner inset comes from AppKit's effective-corner-radii machinery,
  which earlier releases do not have (inference from the selector's presence, not measured on an
  older OS).
- The injected chrome is `#[cfg(target_os = "macos")]`, and exists at all only because an AppKit
  sheet renders no title bar (`F-34.5-G6-16`).
- Needs `AppleShowScrollBars = Always` (a classic, space-taking scrollbar). Under the default
  overlay scrollbars there is no persistent gutter and nothing to see.

## Harness notes, for whoever rebuilds the rig

- `screencapture -l <sheet windowNumber>` captures the **parent**, not the sheet; use `-R` with
  the sheet's frame converted to top-left screen coordinates (negative `y` is fine on the upper
  external display).
- Put the parent on the 1x panel with the `screen:` initialiser **and** `setFrameOrigin`;
  without the latter AppKit constrains it onto the Retina main screen and every number is 2x.
- `takeSnapshot` paints no scrollbars (already recorded in `login_scrollbar_inset_script`'s doc
  comment); a real-sheet capture is the only faithful instrument.
- KVC `setValue(_:forKey: "_automaticallyAdjustsContentInsets")` throws — the setter is
  `_setAutomaticallyAdjustsContentInsets:`; call it through `method_getImplementation`.

## Resolution

2026-10-29: fixed by quick 261029-osq (code commit e625650c4), taking route C/D. Every macOS login sheet (Humble, Amazon, Zoom, GOG) now has one native AppKit bar (`install_native_login_bar`: 32pt `#161c1e`, 1pt `#272f31` rule, centred origin from the shell-validated URL, native ×). It insets the webview 32pt below the bar, so the webview no longer touches the window's rounded top corners. The top corner radii drop to zero, and the scrollbar runs from the top of the webview. The injected cancel strip, origin banner and scrollbar-inset scripts, and the `/login-cancel` sentinel, were deleted. No private API was used; the `_effectiveCornerRadii` override was not taken.

Live PASS (operator, tauri dev, `AppleShowScrollBars=Always`): no wedge, bar look, × and Esc cancel, all four store logins, GOG Cloudflare check, Epic unchanged, no jump on sheet animation.
