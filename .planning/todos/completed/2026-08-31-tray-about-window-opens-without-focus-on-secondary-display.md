---
created: 2026-08-31T18:20:00.000Z
title: "Tray 'About GameLib' opens the About window WITHOUT focus — on a multi-display setup it appears on another screen and needs Mission Control to find"
area: ui-window-management
status: completed
severity: minor
files:
  - src-tauri/src/main.rs (open_about_window_from_tray)
  - src/backend/__tests__/tauriShellSource.test.ts (the ordering guard)
resolved_by: "quick task 260907-9co"
---

## Context

Reported by the operator on 2026-08-31 while running **criterion 5** of the Phase 35 live-gate
re-run (plan `35-29`).

Criterion 5's `Expected` is "About window appears" — it does appear, so the criterion was scored
**PASS** and this was filed separately rather than used to fail it. Recorded here so a passing
criterion does not silently absorb a real defect.

## Repro — operator's account

> when clicking on about from tray, focus did not move (and was open on another screen (control <)
> required to see it

1. Right-click the GameLib tray icon.
2. Click **About GameLib**.
3. The About window opens, but focus stays where it was. On a multi-display setup the window is on
   another screen and Mission Control is needed to locate it.

## Hypothesis — NOT MEASURED

`open_about_window_from_tray` (`src-tauri/src/main.rs:722`) does:

```rust
let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else { ... };
if let Err(e) = window.eval("window.api?.showAboutWindow?.()") { ... }
```

It evaluates the renderer call and stops. There is no `set_focus()`, no activation, and nothing
that raises the resulting About window or moves it to the active display. That is a plausible
cause, **but it has not been measured** and must not be treated as diagnosed. Note this project's
record on focus/mouse symptoms: two hypotheses were formed for the mouse-dead button and **both
were wrong**.

## Prior art — check this first

There is a FIXED sibling in the same class:
`reveal-in-finder-does-not-select-when-tauri-window-frontmost` — a cross-display action whose
visible half silently failed while the action itself succeeded. Read how that one was diagnosed and
fixed before designing a fix here.

## Ownership

Unowned. **No `resolves_phase:` is set deliberately** — Phase 35's gap-closure scope fence covers
the 5 verification gaps and the 4 review criticals only, and this is neither. It must not
auto-close when Phase 35 completes.

## RESOLVED 2026-09-07 (quick task 260907-9co)

### 1. The premise above is STALE — the symptom description could no longer be literally true

This todo was filed 2026-08-31 and describes the About **window** appearing "on another screen",
needing Mission Control to locate. Five days later quick `260905-d33` deleted that window. Since
then `showAboutWindow` (`src/preload/api/helpers.ts`) dispatches `SHOW_ABOUT_DIALOG_EVENT` and
`AboutDialogHost` (`src/frontend/components/UI/AboutDialog/`) mounts the modal **inside `main`**,
app-level from `App.tsx`. There is no second window to land on a second display.

**The defect survived the migration in a new shape, and the migration made it worse.** A
free-standing `WebviewWindow` came up on its own regardless of `main`'s state; a modal mounted
inside `main` cannot. `open_about_window_from_tray` did exactly two things —
`get_webview_window(MAIN_WINDOW_LABEL)`, then `window.eval("window.api?.showAboutWindow?.()")` —
and never raised the window. So a hidden (`startInTray`), minimized, or backgrounded `main`
swallowed the entire interaction: the eval ran, the modal mounted, and nothing was ever visible.

The original "Hypothesis — NOT MEASURED" section above was directionally right about the missing
`set_focus()` and wrong about the mechanism it would fix. Recorded here rather than edited out,
because the hypothesis being half-right is the reason the todo stayed accurate enough to action.

### 2. What was actually fixed

**`open_about_window_from_tray` (`src-tauri/src/main.rs`) now raises the window before the eval:**

```rust
let _ = window.unminimize();
let _ = window.show();
let _ = window.set_focus();
```

**Three calls, where the file's four sibling raise sites use two.** ~~The third is MEASURED, not
stylistic — copying the established `let _ = window.show(); let _ = window.set_focus();` idiom
would have left the minimized-to-Dock case broken.~~ **That claim was wrong and is retracted in
section 4: `show()` alone is sufficient, and the two-call idiom would have worked.** The runtime
facts below are accurate as stated; the inference drawn from the first one was not
(`tao-0.35.3/src/platform_impl/macos/window.rs`):

- `:677-685` — `set_focus()` bodies out to `if !is_minimized && is_visible { util::set_focus(..) }`.
  It is a **hard no-op while miniaturized**. ~~so `unminimize()` must come first~~ — see the
  CORRECTION in section 4: that inference was wrong.
- `:668-673` — `set_visible(true)` is `make_key_and_order_front_sync`, i.e. synchronous. That is
  what makes `show()`-before-`set_focus()` load-bearing: it is why `isVisible()` is already true
  when `set_focus()` tests it a line later.
- `:1035-1050` — `set_minimized(false)` early-returns when `isMiniaturized()` is already false, so
  the unconditional `unminimize()` is free on every non-minimized path.

**The four sibling raise sites were not touched:** the child-window attachment fallback (`~6477`),
the `__GAMELIB_FOCUS__` single-instance socket handler (`~8783`), the tray menu `"show"` arm
(`~9126`), and the tray icon left-click handler (`~9164`). All four are `show()` + `set_focus()`
with no `unminimize()`. This section originally predicted all four would therefore fail to restore
a Dock-minimized `main`. **That prediction was disproved — see section 4. There is no defect at
those sites and nothing to file.**

**The doc comment's false claim is gone.** It read "Nothing here had to change, which is the point
of going through the preload name rather than reimplementing anything" — written during
`260905-d33`. That sentence is why this defect survived that migration unnoticed: something *did*
have to change and did not. It was **replaced**, not appended to, with the real account plus the
tao citations and the sibling-site deviation note. `grep -c 'Nothing here had to change'` = 0.

### 3. Verified vs live — kept separate

**Static (all green):**

- A comment-stripped ordering guard in `src/backend/__tests__/tauriShellSource.test.ts`, mirroring
  the `macos_finder_reselect_workaround` block: a body slicer, a properties predicate returned
  rather than asserted inline, and three RED self-tests. It pins
  `unminimizeIdx < showIdx < focusIdx < evalIdx`.
- **Non-vacuity proved twice.** The executor RED-proved it before the fix landed; the orchestrator
  then re-proved it independently by holding the commit constant and varying the tree
  (`git show 6b5642bea:src-tauri/src/main.rs > src-tauri/src/main.rs`, rerun, restore — not
  `git checkout --`, which fires this repo's post-checkout hook): **2 failed / 144 passed** against
  pre-fix source, **146 passed / 146** at HEAD.
- **The comment-stripping is proved load-bearing, not assumed.** The corrected doc comment now
  names `unminimize`, `show` and `set_focus` in prose, so an unstripped gate would pass on the
  comment alone. A prose-only self-test runs a doc-comment-only synthetic source through
  `loadMainRsCode()` and asserts all three indices are `-1` — which can only pass simultaneously
  with the real-source test (all indices `> -1`) if the stripping genuinely works.
- Chosen as a **jest** guard deliberately: CI runs no cargo step at all, so a Rust test would be
  hand-run and invisible to every future regression; and `&AppHandle` makes the function
  untestable without a running Tauri app regardless.
- `cargo check --manifest-path src-tauri/Cargo.toml` succeeds (hand-run). `pnpm codecheck` exit 0.

**Live (operator-scored 2026-09-07, `pnpm tauri:dev`, tray → About GameLib):**

| # | `main` state before the click | Outcome |
|---|---|---|
| 1 | fully hidden / `startInTray` | **PASS** |
| 2 | minimized to the Dock | **PASS** |
| 3 | visible but backgrounded / another Space | **PASS** |

State 2 was the flagged risk: AppKit's `deminiaturize:` animates, so `set_focus()` one line later
could still observe a miniaturized window. It passed — `deminiaturize:` orders the window front
itself, which is sufficient for the visible symptom even if focus is racing the animation. The
static criteria above could all have passed without this check, which is why it was scored by the
operator rather than inferred from a green suite.

**Not run, deliberately:** `pnpm test:ci` (RED at HEAD from a leaked 60s timer, zero failing tests)
and `pnpm lint` (RED at HEAD, warning ratchet breached — Phase 39 debt). Neither is this task's.
Nothing was pushed.

### 4. CORRECTION (same day, after the live gate) — `unminimize()` was never required

The operator was asked to spot-check the predicted sibling defect and reported: **tray "Show
GameLib" restores a Dock-minimized `main` correctly, and works from another display.** That arm is
`show()` + `set_focus()` with no `unminimize()`, so the prediction in sections 2 and 3 is false.

**Why the code-read was wrong.** The reasoning traced `set_focus()`'s `!is_minimized` guard
(`:677-685`) and stopped there, concluding a minimized `main` "would otherwise never focus at all".
It never traced what `show()` itself does to a miniaturized window. It does everything:
`set_visible(true)` (`:668-673`) is `util::make_key_and_order_front_sync` ->
`ns_window.makeKeyAndOrderFront(None)` (`tao-0.35.3/src/platform_impl/macos/util/async.rs:212-217`),
and AppKit's `makeKeyAndOrderFront:` deminiaturizes a miniaturized window and makes it key. So
`show()` alone un-minimizes, raises, and focuses. `set_focus()` no-opping in that case is
irrelevant.

**What this changes:**

- The **defect and its fix are unaffected.** `open_about_window_from_tray` raised nothing at all;
  it now raises. All three live states still PASS. The two-call sibling idiom would have been
  sufficient, so the briefed fix was fine and the "briefed fix was wrong" framing in the SUMMARY
  and STATE.md row is itself the thing that was wrong.
- `unminimize()` is **kept** — free (`set_minimized(false)` early-returns) and an explicit
  statement of intent — but demoted from "load-bearing" to defence in depth. The doc comment on
  `open_about_window_from_tray` now says so, and warns against citing this site as precedent for
  `unminimize()` being required.
- **Nothing to file.** The four sibling raise sites are correct as they stand.

**The process lesson,** which is the durable part: a code-read prediction about a native-runtime
behaviour was carried into four records (source comment, this todo, the SUMMARY, the STATE.md row)
as though measured, on the strength of one true premise plus an untraced inference. One 10-second
operator gesture on an ALREADY-WORKING sibling disproved it. The tell was available in advance —
the prediction claimed a user-visible defect in the tray's most-used item, which would not have
gone unreported.
