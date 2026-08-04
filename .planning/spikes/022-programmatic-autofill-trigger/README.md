---
spike: 022
name: programmatic-autofill-trigger
type: standard
validates: "Given a login WKWebView, when an in-app affordance tries to invoke the macOS AutoFill/Passwords panel programmatically, then either the panel opens (L3), or a synthesized event pops the real context menu WITH AutoFill at the field (L2), or neither works (L1 → fall back to hint text)"
verdict: PARTIAL
related: [020, 021, 019, 013]
tags: [autofill, keychain, wkwebview, nsmenu, event-synthesis, objc2, macos]
---

# Spike 022: can the AutoFill/Passwords panel be triggered programmatically?

## What This Validates

Spike 020 found the system **right-click → AutoFill → Passwords** panel is the only working
Keychain channel in our login webviews, but it is undiscoverable — users must know to
right-click. This spike asks whether an **in-field affordance** (a key glyph in the password
box) can reach that same panel programmatically, restoring something close to the browser
experience.

Graded ladder, decided by evidence:
- **L3** a direct call opens the Passwords panel → ~full browser parity
- **L2** a synthesized event pops the real context menu at the field, AutoFill included
- **L1** neither → fall back to 020's hint text

## Research

No prior art found for triggering this panel from a non-browser app; the probes are the
research. Approach: never call a private selector that hasn't first been *discovered* by
runtime introspection, and report anything private as such.

| Channel | Mechanism | Public API? |
|---|---|---|
| A · introspection | `objc` runtime method dump for autofill/password/credential selectors | yes (read-only) |
| B · menu capture | `willOpenMenu:withEvent:` on a **WKWebView subclass** (documented AppKit hook, per [iCab's write-up](https://icab.de/blog/2022/06/12/customize-the-contextual-menu-of-wkwebview-on-macos/)) | yes |
| B2 · post-display re-dump | retain the menu, dump it again after it has been on screen | yes |
| C · `menuForEvent:` | fetch the menu synchronously and pop it ourselves | yes |
| D · event synthesis | post `rightMouseDown`/`Up` into the window at the field | yes |
| E · re-fire | `NSApp.sendAction` / `performActionForItemAtIndex` on a captured item | yes |

## How to Run

```bash
cd .planning/spikes/019-dummy-oauth-store && node store-server.mjs &
cd ../022-programmatic-autofill-trigger/app
CARGO_TARGET_DIR=<repo>/src-tauri/target cargo build
CARGO_TARGET_DIR=<repo>/src-tauri/target SPIKE_AUTORUN=1 cargo run   # scripted A→E + screenshot
CARGO_TARGET_DIR=<repo>/src-tauri/target cargo run                   # interactive panel
```

## What to Expect

Scripted: introspection dump, a subclassed-WKWebView login window, then probes C/D/B2/E with
every NSMenu dumped item-by-item (title, identifier, action, target class, submenu), plus
`menu-with-autofill.png` — a screenshot of the menu the *synthesized* click produces.

## Observability

`run.log` (JSONL) + `events-export.json`; every menu dumped in full; `elementFromPoint`
hit-verification logged for every synthesized click; screenshot scoped to the login window's
own rect.

## Investigation Trail

1. **A · introspection**: WKWebView exposes exactly four credential-shaped selectors —
   `_canUseCredentialStorage`, `_setCanUseCredentialStorage:`,
   `_showDigitalCredentialsPicker:completionHandler:`, `_dismissDigitalCredentialsPicker:`.
   The last two are the **W3C Digital Credentials API** (identity documents), *not* Keychain
   passwords. `NSView`/`NSResponder`: zero matches. **No password-autofill entry point
   exists on the class** → L3 has no target.
2. **C · `menuForEvent:` returns nil.** WebKit does not build context menus synchronously,
   so we cannot fetch-and-pop one ourselves (C2 fails for the same reason).
3. **D · synthesized right-click works** — posting `rightMouseDown`/`Up` reaches WebKit,
   which builds and displays a real menu, and our `willOpenMenu:` hook fires.
4. **B · but the dumped menu has NO AutoFill item** — 10 items, Cut…Paragraph Direction.
5. **Two readings fit** (system inserts AutoFill later vs synthesized events don't qualify),
   so the discriminator was built: capture the menu from a **real** user right-click through
   the same hook, and re-dump the retained menu after display.
   - Real right-click menu at `willOpenMenu:`: **3 items — Cut/Copy/Paste. No AutoFill.**
   - B2 re-dump of that same retained menu after display: **still 3 items, no AutoFill.**
   - Yet the human **saw AutoFill on screen** in that very menu.
   → **The AutoFill item is never in the NSMenu object at all.** It is injected at display
   time, outside the object graph, so it cannot be captured, inspected, or re-fired (E is
   moot).
6. **Confound checked before trusting probe D's negative**: `document.elementFromPoint` at
   our computed click centre returns `{id: "password", tag: "INPUT", type: "password"}` —
   the synthesized click lands exactly on the password field. (Note the menus still differ
   in *kind*: a real click on the secure field yields the reduced 3-item menu, the
   synthesized one the full 10-item text menu — WebKit treats the posted event differently.)
7. **L2 confirmed with pixels**: the menu popped by our **synthesized** click displays
   **AutoFill ›** — screenshot `menu-with-autofill.png`, captured with a region grab scoped
   to the window rect (a per-window `-l<id>` grab would miss it: menus are their own
   windows). Human-confirmed live as well.

## Results

**⚠ PARTIAL — L2 achieved, L3 impossible.**

| Probe | Result |
|---|---|
| A · autofill selectors on WKWebView | ✗ none (only W3C digital-credentials) |
| B · AutoFill item in the NSMenu | ✗ absent — even for a REAL right-click |
| B2 · post-display re-dump | ✗ still absent — injected outside the object graph |
| C/C2 · `menuForEvent:` + pop it ourselves | ✗ returns nil (menus are built asynchronously) |
| D · synthesized right-click pops the real menu | ✓ yes, at the field, **with AutoFill visible** |
| E · re-fire a captured AutoFill item | ✗ moot — there is nothing to capture |

Findings that carry forward:

- **An in-field affordance IS viable, via event synthesis.** A key glyph injected into the
  password field can post a synthesized right-click at that field; macOS then shows its real
  context menu **including AutoFill → Passwords**. Cost: one extra menu hop vs a browser's
  direct dropdown. All public API — no private selector is called.
- **The panel itself cannot be opened directly.** The AutoFill item does not exist in any
  NSMenu an app can read, and WKWebView exposes no autofill entry point. Anything that looks
  like a direct trigger would have to be a private, undocumented path — none was found.
- **`willOpenMenu:` sees WebKit's menu, not the system's.** Useful for inspecting/customizing
  WebKit items; useless for system-injected ones. A hard boundary worth remembering.
- **Real vs synthesized events produce different menus** on the same element (3-item secure
  vs 10-item generic). Never assume a synthesized event reproduces user-event state — verify
  with `elementFromPoint` and compare against a real event before trusting a negative.
- **Menus are separate windows**: per-window CGWindowID capture (016's convention) misses
  them; scope a region grab to the owning window's rect instead — wider regions sweep in the
  user's unrelated windows.
- **Ship plan:** option 1 (hint affordance) and this are the same UI — an in-field key glyph;
  the difference is that clicking it now *does* something (pops the AutoFill menu) instead of
  only explaining what to do. Paste remains the universal fallback (020).
- **macOS-only, like 013–021.** Windows/Linux autofill surfaces are unexplored.
