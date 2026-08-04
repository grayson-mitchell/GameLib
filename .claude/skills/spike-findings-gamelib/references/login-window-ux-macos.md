# Login Window UX on macOS (modal attachment + password autofill)

Two UX goals, both measured live on macOS 26 against a fully-controlled OAuth store (spike 019):
**(1)** the login window must not get lost behind the main window; **(2)** users should reach
their Keychain/password manager from the login form. Both are solved — one fully, one
partially — and the solutions apply to **both** login surfaces GameLib runs: the ordinary wry
`WebviewWindow` and the pristine raw `WKWebView` (Epic's).

Affected code: `open_pristine_epic_login_window` and the `humble_login_open` arm
(`src-tauri/src/main.rs`), every runner's login window builder, and
`src/backend/sidecar/oauthLoginCapture.ts`.

## Requirements

1. **Attach the login window as an AppKit CHILD window** — never leave it free-floating, and
   never use a sheet without self-dismissal.
2. **Re-assert z-order after the parent deminiaturizes** — the child comes back *behind*.
3. **Do not build a credential store for store logins.** Inline autofill is platform-blocked;
   the two working channels are system-provided.
4. **Ship an in-field affordance that posts a synthesized right-click** — that is the only way
   to surface AutoFill from inside the field.
5. **Paste must work in the pristine window** — it needs the Cmd+V local-monitor fix, which is
   also the universal password-manager fallback.
6. **Never call a private selector.** Everything below is public API.

## How to Build It

### 1. Un-losable login window — AppKit child attachment

Attach at the AppKit layer, not via Tauri's builder `.parent()`: one code path then covers the
wry window *and* the pristine `WKWebView` shell (both are `NSWindow`s), it works on an
already-live window, and it is detachable at runtime.

```rust
use objc2_app_kit::{NSWindow, NSWindowOrderingMode};

// parent/child NSWindow pointers via Window::ns_window(); touch them ONLY on the main thread.
unsafe { parent.addChildWindow_ordered(child, NSWindowOrderingMode::Above) };
// …later, on logout/close:
unsafe { parent.removeChildWindow(child) };
```

Measured behaviour (oracle: `NSApp.orderedWindows` front-to-back + `keyWindow` + `childWindows`):

| Action | free window | child window |
|---|---|---|
| raise main over login | login goes BEHIND (the bug) | login **stays in front** |
| drag main | login unaffected | login follows |
| minimize main | login orphaned on screen | login follows into the Dock |
| restore main | — | ⚠ **login returns BEHIND main until re-raised** |

So on `deminiaturize`, re-raise the child:

```rust
child.makeKeyAndOrderFront(None);   // or re-attach; without this the login is behind again
```

### 2. Sheets — only with self-dismissal

`beginSheet:` works fine on a wry-created window (`isSheet=true`, un-losable, blocks the
parent), **but it traps the user**: the sheet blocks the very window that would hold any
"cancel" control, the store's login page has no cancel of its own, and sheets render no close
button. Live-observed: the operator could not dismiss it at all.

If a sheet is ever used, it must dismiss itself — auto-close on OAuth code capture (fires
before the landing page paints, see `oauth-login-test-harness.md`) **plus** a sheet-owned Esc /
cancel strip. Note `endSheet` *hides* the window, so treat it as close.

### 3. Password autofill — what actually exists

| Channel | wry WebviewWindow | pristine WKWebView |
|---|---|---|
| Inline autofill on focus (key icon / dropdown / Touch ID) | ✗ none | ✗ none |
| "Save password?" offer after submit | ✗ never | ✗ never |
| Right-click → **AutoFill → Passwords** panel | ✓ **fills** | ✓ **fills** |
| Cmd+V paste from the Passwords app | ✓ | ✓ (needs the key monitor) |

Verified on loopback HTTP *and* real HTTPS, so the block is the platform, not our test origin.
This matches Apple's browser-only policy; `com.apple.developer.web-browser.public-key-credential`
is for passkeys in approved browsers and does not unlock password autofill.

### 4. The in-field affordance (the shippable win)

The system AutoFill panel **cannot be opened directly** — but a **synthesized right-click** at
the password field pops the real context menu *with `AutoFill ›` in it* (screenshot evidence:
`sources/022-programmatic-autofill-trigger/menu-with-autofill.png`). So inject a key glyph into
the password field; on click, post the event:

```rust
use objc2_app_kit::{NSApplication, NSEvent, NSEventType, NSEventModifierFlags};

fn synth(ty: NSEventType, point_in_window: NSPoint, window: &NSWindow) -> Option<Retained<NSEvent>> {
    unsafe {
        NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
            ty, point_in_window, NSEventModifierFlags::empty(), 0.0,
            window.windowNumber(), None, 0, 1, 1.0,
        )
    }
}
let down = synth(NSEventType::RightMouseDown, p, &window)?;
let up   = synth(NSEventType::RightMouseUp,   p, &window)?;
unsafe { app.postEvent_atStart(&down, false); app.postEvent_atStart(&up, false); }
```

Coordinates: ask the page for the field rect, then CSS px (top-left origin) → view coords
(bottom-left origin) → window coords:

```rust
let in_view   = NSPoint::new(x + w/2.0, view.bounds().size.height - (y + h/2.0));
let in_window = unsafe { view.convertPoint_toView(in_view, None) };
```

**Always log `document.elementFromPoint` at that centre** — a title-bar-sized error silently
probes the wrong field:

```js
var r = el.getBoundingClientRect(), cx = r.x + r.width/2, cy = r.y + r.height/2;
var hit = document.elementFromPoint(cx, cy) || {};   // expect {id:'password', type:'password'}
```

UX cost vs a browser: the panel does not auto-match the current site, its search box rejects
typed input (beeps — system behaviour, reproduced in *both* surfaces), so the user scrolls and
then clicks the field to fill. Still far better than an undiscoverable right-click.

### 5. Paste support (universal fallback)

Cmd+V from the Passwords app works in both surfaces, but the pristine window needs
`makeFirstResponder` plus the `NSEvent` local-monitor re-dispatch already shipped in
`open_pristine_epic_login_window` (tao's `NSWindow` eats key equivalents). Re-proven under a
minimal reimplementation in spike 020 — keep it.

## What to Avoid

- **Tauri `.parent()` as the attachment mechanism** — it cannot cover the pristine `WKWebView`
  shell or re-attach at runtime. Use `addChildWindow:ordered:`.
- **Assuming child attachment survives a restore cleanly** — it survives, but z-order does not.
- **Sheets for store logins** without auto-close + a sheet-owned cancel. It is a user trap.
- **Any design that reads or stores store credentials.** Rejected on purpose.
- **Hunting for a direct "open the Passwords panel" call.** It does not exist: `WKWebView`'s only
  credential-shaped selectors are `_canUseCredentialStorage`, `_setCanUseCredentialStorage:`,
  `_showDigitalCredentialsPicker:completionHandler:`, `_dismissDigitalCredentialsPicker:` — the
  last two are the **W3C Digital Credentials API** (identity documents), not passwords.
- **Trying to capture or re-fire the AutoFill menu item.** It is **not in the NSMenu at all** —
  proven by subclassing `WKWebView` and hooking `willOpenMenu:withEvent:`: a *real* user
  right-click on a password field hands over a 3-item menu (Cut/Copy/Paste) while the screen
  shows AutoFill; a post-display re-dump of that same retained menu is still 3 items. macOS
  injects it at display time, outside the object graph.
- **`menuForEvent:` to fetch-and-pop the menu yourself** — returns nil; WebKit builds context
  menus asynchronously.
- **Trusting a synthesized-event negative.** On the *same* verified element, a real click
  yields the 3-item secure-field menu and a synthesized one the 10-item generic text menu.
  Compare against a real event before concluding anything.
- **`screencapture -l<windowID>` to evidence a menu** — menus are their own windows and are
  missed. Region-grab the owning window's rect instead (wider regions sweep in the user's
  unrelated windows).

## Constraints

- **macOS 26 only.** Windows (WebView2) and Linux (webkit2gtk) autofill and window-attachment
  behaviour are entirely unverified, as with spikes 013–018.
- `tauri`'s **`unstable`** feature is required for `tauri::WindowBuilder` / `get_window` (raw
  window shells). Match `src-tauri/Cargo.toml`'s objc2 pins exactly.
- `orderedWindows`, `childWindows`, `sheetParent`, `isSheet` are **not generated** under
  src-tauri's objc2-app-kit feature set — reach them with raw `msg_send!` (same convention as
  spike 016's `windowNumber`).
- Autofill probes need a seeded entry in the **Passwords** app for the test origin, otherwise
  the panel has nothing to offer and a negative is uninterpretable.

## Origin

Synthesized from spikes: 020, 021, 022 (run 2026-08-04).
Source files: `sources/020-keychain-autofill-login-webview/`,
`sources/021-modal-login-window/`, `sources/022-programmatic-autofill-trigger/`
(incl. `menu-with-autofill.png`, the AutoFill-in-menu evidence).
