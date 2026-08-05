# Login Window UX on macOS (modal attachment + password autofill)

Two UX goals, both measured live on macOS 26 against a fully-controlled OAuth store (spike 019):
**(1)** the login window must not get lost behind the main window; **(2)** users should reach
their Keychain/password manager from the login form. Both are solved — one fully, one
partially — and the solutions apply to **both** login surfaces GameLib runs: the ordinary wry
`WebviewWindow` and the pristine raw `WKWebView` (Epic's).

Affected code: `open_pristine_epic_login_window` and the `humble_login_open` arm
(`src-tauri/src/main.rs`), every runner's login window builder, and
`src/backend/sidecar/oauthLoginCapture.ts`.

## Current status (2026-08-05)

Read this block before either recommendation below — both are now stale, for opposite reasons.

- **Sheet presentation + mandated cancel strip + bare-Esc backstop: SHIPPED and live-PASSED.** The
  login window is presented as an AppKit sheet on `main`, with an always-present in-page cancel
  strip and a page-independent Esc monitor as its close affordance — measured on real macOS
  hardware (`34.4.2-LIVE-GATE-RERUN-2.md` items 1 and 2, both PASS). This **SUPERSEDES**
  Requirement #1 and §§1-2 below (child-window attachment). Child-window attachment is off the
  table **permanently** — it was itself measured live-broken (F-34.4.2-01/-02: unresponsive after
  minimize/restore, could not be closed) before the sheet redesign replaced it, so it is not a
  safe fallback either.
- **In-field autofill affordance (synthesized right-click on an injected glyph): BUILT, MEASURED,
  FAILED, DELETED.** The mechanism reached the correct element and popped the real system
  AutoFill menu, but never filled the field — **FALSIFIED** by `34.4.2-LIVE-GATE-RERUN-2.md` item 3
  (F-34.4.2-09) and removed from the codebase in full (Phase 34.4.2 Plan 13, operator decision
  D-A). This **FALSIFIES** Requirement #4 and §4 below.
- **Cmd+V and Edit ▸ Paste are the SOLE credential-entry route this project ships.** Live-proven
  (`34.4.2-LIVE-GATE-RERUN-2.md` item 4, PASS) and now load-bearing, not merely a fallback for a
  broken in-field affordance.
- **A REAL right-click still reaches AutoFill and still fills.** That channel was never this
  project's own code to break, and the glyph's deletion does not affect it — the deletion removed
  only this project's own synthesized-event attempt to trigger the same menu, not the platform
  channel itself.

## Requirements

1. **SUPERSEDED 2026-08-05 (binding operator decision, D-C):** ~~Attach the login window as an
   AppKit CHILD window — never leave it free-floating, and never use a sheet without
   self-dismissal.~~ The shipped mechanism is an AppKit **sheet** with a mandated, always-present
   in-page cancel strip plus a page-independent bare-Esc monitor — not child-window attachment.
   Child-window attachment is off the table **permanently**: it was itself measured live-broken
   (F-34.4.2-01/-02, unresponsive after minimize/restore, could not be closed) before the sheet
   redesign replaced it. See §§1-2 below, and "Current status" above.
2. **Re-assert z-order after the parent deminiaturizes** — the child comes back *behind*. (Applied
   to the now-superseded child-window mechanism only; a sheet is presented BY its parent and moves
   with it, so this requirement has no live subject any more — see §1's own correction.)
3. **Do not build a credential store for store logins.** Inline autofill is platform-blocked;
   the two working channels are system-provided.
4. **FALSIFIED 2026-08-05 (F-34.4.2-09):** ~~Ship an in-field affordance that posts a synthesized
   right-click — that is the only way to surface AutoFill from inside the field.~~ Measured live on
   real macOS hardware, in a presented sheet, on Humble's real login form, with a seeded Passwords
   entry: the synthesized right-click pops the real system menu with `AutoFill` present and targets
   the correct element (`hit_tag=Some("INPUT")`, `hit_type=Some("password")`) — **and the field
   does not fill.** An identical REAL right-click, in the same sheet, same field, same entry, DOES
   fill. That real-vs-synthesized comparison is the discriminator: it rules out the sheet context,
   Humble's page, and the platform as the cause, isolating the failure to the synthesized-event
   path itself. The mechanism was deleted in full (Plan 13, operator decision D-A); Cmd+V and
   Edit ▸ Paste are now the sole credential-entry route. See §4 below.
5. **Paste must work in the pristine window** — it needs the Cmd+V local-monitor fix, which is
   also the universal password-manager fallback. **No longer merely a fallback as of 2026-08-05:
   with #4 falsified and deleted, this is the sole credential-entry route this project ships.**
6. **Never call a private selector.** Everything below is public API. This constraint survives
   both the sheet redesign and the glyph deletion unchanged — it is re-enforced by a relocated,
   permanent negative test (T-34.4.2-20) that does not depend on the deleted mechanism's continued
   existence.

## How to Build It

### 1. Un-losable login window — AppKit child attachment — **SUPERSEDED 2026-08-05 (D-C)**

**This mechanism is not what ships.** It was measured live-broken (F-34.4.2-01/-02: the attached
child window became unresponsive after the main window's minimize/restore cycle, and could not be
closed) — so it is not a safe fallback either. The shipped mechanism is an AppKit sheet (§2 below,
itself now corrected) with a mandated cancel strip and bare-Esc backstop, live-PASSED
(`34.4.2-LIVE-GATE-RERUN-2.md` items 1-2). **Child-window attachment is off the table
permanently.** Retained below as the historical record of what was tried and why it failed live,
not as a currently recommended mechanism.

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

**This is where the mechanism was ultimately found live-broken**: the child window returned
unresponsive to keyboard input after the restore cycle, and could not be dismissed at all
(F-34.4.2-01/-02) — the defect that started the sheet redesign this file's "Current status" block
describes.

### 2. Sheets — only with self-dismissal — **SUPERSEDED 2026-08-05, shipped and live-PASSED**

**This section's own stated objection is now answered, not merely superseded.** The "operator
could not dismiss it at all" observation below is precisely the trap the mandated cancel strip (an
always-present, self-re-appending in-page control) plus a page-independent bare-Esc monitor were
built to close — and `34.4.2-LIVE-GATE-RERUN-2.md` item 2 PASSED both dismissal routes on real
macOS hardware. Sheet presentation is the SHIPPED and PERMANENT mechanism (D-C); the caution below
about a sheet without self-dismissal remains correct general advice, it is just no longer a live
problem in this codebase.

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

**Correction, 2026-08-05:** the AutoFill panel's search-box beep (see "What to Avoid" below) is
**order-dependent, not field-dependent** — reproduced live in both orderings (username-then-
password AND password-then-username: the FIRST field searched works, the SECOND beeps and rejects
input, regardless of which field is first). This refines this section's original "reproduced in
*both* surfaces" framing, which was true but incomplete — it described WHERE this was seen, not
WHEN it triggers. Measured on the REAL right-click path, so it characterises the macOS AutoFill
panel itself, not any of this project's own code.

### 4. The in-field affordance — **FALSIFIED 2026-08-05, DELETED (F-34.4.2-09, operator decision D-A)**

**This mechanism does not work and does not ship.** The spike evidence quoted below (screenshot
`sources/022-programmatic-autofill-trigger/menu-with-autofill.png`) shows only that the
synthesized right-click pops the real context menu with `AutoFill ›` present — **nowhere did the
spike measure the last mile: whether selecting a Passwords entry actually writes into the
field.** `34.4.2-LIVE-GATE-RERUN-2.md` item 3 measured exactly that, on real macOS hardware, in a
presented sheet, on Humble's real login form, with a seeded Passwords entry — **and the field does
not fill**, while an identical REAL right-click, same sheet, same field, same entry, DOES fill.
That comparison is the discriminator: it rules out the sheet context, Humble's page, and the
platform, isolating the failure to the synthesized-event path itself (F-34.4.2-09). The mechanism
(glyph injection, the synthesized `NSEvent` poster, the kill switch) was deleted from the codebase
in full (Phase 34.4.2 Plan 13, operator decision D-A) — **Cmd+V and Edit ▸ Paste are the sole
credential-entry route this project ships** (§5 below, live-PASSED), and a REAL right-click still
reaches AutoFill and still fills (unaffected by the deletion — see "Current status" above).

**HYPOTHESIS, not a conclusion, for why the synthesized path failed where a real click succeeds:**
this project's own "What to Avoid" section below already warned about exactly this class of trap
("Trusting a synthesized-event negative" — on the *same verified element*, a real click yields the
3-item secure-field menu while a synthesized one yields the 10-item generic text menu). The
hypothesis, cross-referenced against that bullet rather than stated as new: a synthesized
right-click lands in a generic text context rather than the secure password-field context, so the
AutoFill entry the generic menu surfaces has no secure-field target bound to it — the panel opens
with nothing to write to. **This is a hypothesis, not a proven mechanism**; this project's own
recorded lesson is that when two readings of a measurement both fit, you build the discriminator
rather than ship the nicer one, and no further investigation into WHY was authorized here — D-A
forbids re-proposing the affordance under a different synthesis approach, a different trigger
event, or behind a kill switch, without a new operator decision superseding it.

The code sample and coordinate maths below are kept as historical record of a mechanism that was
shipped, measured, and then deleted — they are correct as far as they go (element targeting was in
fact correct: `hit_tag=Some("INPUT")`, `hit_type=Some("password")`), they simply do not deliver the
field-fill this section originally promised.

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

UX cost vs a browser: the panel does not auto-match the current site. Its search box rejects
typed input **order-dependently, not field-dependently** — the first field searched works, the
second beeps and rejects input, reproduced in both orderings (see §3's own correction above) — so
the user scrolls and then clicks the entry to fill. This was still, when it worked, far better
than an undiscoverable real right-click alone — but the synthesized trigger itself never delivered
the fill, which is why it was deleted rather than kept as a discoverability-only hint (D-A rejected
that middle option explicitly).

### 5. Paste support (universal fallback — as of 2026-08-05, the SOLE credential-entry route)

Cmd+V from the Passwords app works in both surfaces, but the pristine window needs
`makeFirstResponder` plus the `NSEvent` local-monitor re-dispatch already shipped in
`open_pristine_epic_login_window` (tao's `NSWindow` eats key equivalents). Re-proven under a
minimal reimplementation in spike 020 — keep it. **Live-proven again 2026-08-05
(`34.4.2-LIVE-GATE-RERUN-2.md` item 4, PASS) on the Tauri-managed sheet surface, with Edit ▸ Paste
also confirmed working with no divergence from Cmd+V.** With §4's mechanism deleted, this section
is no longer a fallback for a working in-field affordance — it is the only credential-entry route
this project ships.

## What to Avoid

- **Tauri `.parent()` as the attachment mechanism** — it cannot cover the pristine `WKWebView`
  shell or re-attach at runtime. Use `addChildWindow:ordered:`. **(Historical: this whole
  attachment approach is superseded by the sheet mechanism — see §1's correction above. The
  advice below about `.parent()` specifically remains true of the retired mechanism; it has no
  live subject in this codebase any more.)**
- **Assuming child attachment survives a restore cleanly** — it survives, but z-order does not.
  **(Historical, same note as above — this mechanism does not ship.)**
- **Sheets for store logins** without auto-close + a sheet-owned cancel. It is a user trap.
  **(This is exactly the trap the shipped cancel strip + Esc monitor closes — see §2's correction
  above. The advice itself remains correct; this codebase now follows it.)**
- **Any design that reads or stores store credentials.** Rejected on purpose.
- **Hunting for a direct "open the Passwords panel" call.** It does not exist: `WKWebView`'s only
  credential-shaped selectors are `_canUseCredentialStorage`, `_setCanUseCredentialStorage:`,
  `_showDigitalCredentialsPicker:completionHandler:`, `_dismissDigitalCredentialsPicker:` — the
  last two are the **W3C Digital Credentials API** (identity documents), not passwords. **This ban
  survives the glyph's deletion, permanently and unconditionally — relocated to a standalone test
  (T-34.4.2-20) rather than retired with the mechanism it originally guarded.**
- **Trying to capture or re-fire the AutoFill menu item.** It is **not in the NSMenu at all** —
  proven by subclassing `WKWebView` and hooking `willOpenMenu:withEvent:`: a *real* user
  right-click on a password field hands over a 3-item menu (Cut/Copy/Paste) while the screen
  shows AutoFill; a post-display re-dump of that same retained menu is still 3 items. macOS
  injects it at display time, outside the object graph.
- **`menuForEvent:` to fetch-and-pop the menu yourself** — returns nil; WebKit builds context
  menus asynchronously.
- **Trusting a synthesized-event negative.** On the *same* verified element, a real click
  yields the 3-item secure-field menu and a synthesized one the 10-item generic text menu.
  Compare against a real event before concluding anything. **This is the bullet that pointed at
  the truth all along — see §4's HYPOTHESIS paragraph above, which cross-references this exact
  observation as the leading explanation for F-34.4.2-09's fill failure.**
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
  the panel has nothing to offer and a negative is uninterpretable. **(Applies to the surviving
  REAL right-click channel only — no code in this project drives a synthesized probe any more.)**

## Origin

Synthesized from spikes: 020, 021, 022 (run 2026-08-04).
Source files: `sources/020-keychain-autofill-login-webview/`,
`sources/021-modal-login-window/`, `sources/022-programmatic-autofill-trigger/`
(incl. `menu-with-autofill.png`, the AutoFill-in-menu evidence).

**Corrected 2026-08-05** (Phase 34.4.2 Plan 15) against `34.4.2-LIVE-GATE-RERUN-2.md`'s live
measurement: Recommendation #4 / §4 FALSIFIED (F-34.4.2-09), Recommendation #1 / §§1-2 SUPERSEDED
(binding operator decision D-C, live-PASSED). See "Current status (2026-08-05)" at the top of this
file.
