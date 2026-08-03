---
spike: 021
name: modal-login-window
type: standard
validates: "Given the main Tauri window, when the login window opens modal (child-window attachment / native sheet / always-on-top), then it cannot be lost behind the main window and input+autofill still work inside it"
verdict: VALIDATED
related: [019, 020, 013]
tags: [modal, nswindow, child-window, sheet, window-management, login]
---

# Spike 021: modal login window — child-window vs sheet vs free

## What This Validates

Given the main window and a login window (spike-019 DummyStore form), when the login is
attached as an AppKit **child window** (`addChildWindow:ordered:` — the mechanism behind
Tauri's `.parent()`) or presented as a native **sheet** (`beginSheet:`), then it cannot be
lost behind the main window, and typing / paste / the spike-020 AutoFill-panel channel keep
working inside it.

## Research

No library research needed — mechanism options are AppKit-known; prior spikes cover the
webview surfaces. Candidates:

| Approach | Pros | Cons | Status |
|----------|------|------|--------|
| Child window (`addChildWindow:ordered:Above`) | Login rides above main, follows moves; window stays independent (resizable, movable); same mechanism as Tauri `.parent()` but attachable at runtime to ANY NSWindow — covers wry AND pristine surfaces with one implementation | Not truly modal (main stays interactive — arguably a feature) | **probed** |
| Native sheet (`beginSheet:`) | Genuinely modal; visually attached to main; impossible to lose | Blocks the whole main window; sheet sizing constraints; `endSheet` hides the window | **probed** |
| `always_on_top` | Trivial | Floats above OTHER APPS — obnoxious; rejected without probing | rejected |
| Renderer-level fake modal (scrim in main window) | Pure CSS | Doesn't stop the OS-level lost-window problem at all | rejected |

Applied at the AppKit layer (raw `NSWindow` calls via objc2) rather than through Tauri's
builder `.parent()` so the SAME code path covers the wry login window and the pristine raw
WKWebView shell window, and so modes can be switched at runtime on a live window.

## How to Run

```bash
cd .planning/spikes/019-dummy-oauth-store && node store-server.mjs &   # if not running
cd ../021-modal-login-window/app
CARGO_TARGET_DIR=<repo>/src-tauri/target cargo build

# Scripted layering probes (programmatic oracle, exits with evidence):
CARGO_TARGET_DIR=<repo>/src-tauri/target SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1 cargo run

# Interactive feel-check (M1–M9 checklist in the control panel):
CARGO_TARGET_DIR=<repo>/src-tauri/target cargo run
```

## What to Expect

Scripted: `order_report` oracle snapshots (NSApp.orderedWindows front-to-back + keyWindow +
childWindows + isSheet/sheetParent) around each transition — free-baseline, attach_child,
raise-main-over-child, minimize/restore, beginSheet/endSheet.

Interactive: buttons to switch the live login window between free/child/sheet modes, plus
the M1–M9 feel-check table (loggable toggles).

## Observability

`run.log` (JSONL) + `events-export.json`; every mode transition and oracle snapshot
timestamped. The oracle is programmatic — layering claims never rest on eyeballs alone.

## Investigation Trail

1. Mechanism choice: AppKit-layer attachment (not Tauri `.parent()`) so one implementation
   covers both production login surfaces and supports runtime mode switching.
2. `orderedWindows`/`childWindows`/`sheetParent` are not in the objc2-app-kit bindings under
   src-tauri's feature set — raw `msg_send!` bypasses the binding gates (016's
   `windowNumber` convention extended).
3. Scripted run (2026-08-04), all four phases green:
   - **1b baseline**: raising main puts a FREE login behind it (`frontToBack=[main, login]`)
     — the bug, reproduced on record.
   - **2b child**: after `attach_child`, login LISTS AS MAIN'S CHILD and stays
     `frontToBack=[login, main]` even after `makeKeyAndOrderFront(main)` — un-losable.
   - **3a minimize**: miniaturizing main removes the child from the visible list too (child
     follows parent into the Dock; no orphaned login).
   - **3b GOTCHA**: after deminiaturizing main, the child relationship SURVIVES but the
     login returns BEHIND main (`frontToBack=[main(child:login), login]`) until re-raised.
     Production must re-assert order (re-raise or re-attach) after restore.
   - **4a/4b sheet**: `beginSheet` works on a wry window — `isSheet=true`, login becomes
     key, raising main does not displace it. **4c**: `endSheet` HIDES the login window
     (only main remains visible) — standard sheet semantics; a sheet-mode login must treat
     `endSheet` as close.
4. Human feel-check (2026-08-04, reported conversationally): "everything worked as
   expected" — child mode un-losable, follows drags, typing/paste/AutoFill-panel all work in
   both modes — **except one trap the scripted oracle could not feel**:
5. **SHEET TRAP: the sheet blocks the very window that holds the dismiss control.** The
   "End sheet" button lives in the main window; with the sheet up, main is unclickable, so
   the human could not end the sheet at all. In production this is worse: the sheet's
   content is the STORE'S login page (no cancel affordance) and sheets render no close
   button — an abandoning user is stuck. A sheet-mode login is shippable only with
   self-dismissal: auto-close on OAuth code capture (019 proved the capture fires before
   the landing page paints) PLUS an escape hatch owned by the sheet itself (Esc handler /
   native cancel strip above the webview).

## Results

**VALIDATED** — the login window can be made un-losable; **child-window attachment is the
recommended mode**, sheet is workable only with a self-dismissal design.

| | free (baseline) | child window | sheet |
|---|---|---|---|
| Can be lost behind main | ✗ yes (the bug) | ✓ never | ✓ never |
| Follows main window drags | — | ✓ | ✓ (attached) |
| Main minimizes → login follows | — | ✓ | ✓ |
| Typing / Cmd+V / AutoFill panel | ✓ | ✓ | ✓ |
| Escape hatch when user abandons | ✓ (its own close button) | ✓ (its own close button) | ✗ **trapped** without self-dismissal |
| Restore-from-Dock ordering | — | ⚠ child returns BEHIND main until re-raised | ✓ |

Findings that carry forward:

- **Attach at the AppKit layer** (`addChildWindow:ordered:Above` via objc2), not via Tauri's
  builder `.parent()`: one code path covers the wry login window AND the pristine raw
  WKWebView shell, works on a live window, and is detachable at runtime.
- **Child mode: re-assert z-order after deminiaturize.** The child relationship survives
  minimize/restore but the login returns behind main until re-raised (oracle-proven).
- **Sheet mode requires self-dismissal by design** — auto-close on OAuth code capture + an
  Esc/cancel affordance owned by the sheet. Also `endSheet` HIDES the window (treat as
  close), and `beginSheet` works fine on a wry-created window.
- **`msg_send!` bypasses objc2 binding feature gates** (`orderedWindows`/`childWindows`/
  `sheetParent` aren't generated under src-tauri's feature set).
- The `NSApp.orderedWindows` front-to-back snapshot is a cheap, reliable layering oracle —
  layering claims never need to rest on screenshots alone.
