---
quick_id: 260907-9co
slug: tray-about-gamelib-opens-the-about-modal
status: complete
date: 2026-09-07
autonomous: false
closes_todo: .planning/todos/completed/2026-08-31-tray-about-window-opens-without-focus-on-secondary-display.md
commits:
  - 6b5642bea test(260907-9co) RED-prove the tray About path never raises the main window
  - dd82f66df fix(260907-9co) raise the main window before mounting the tray About modal
  - 10a9c0a05 docs(260907-9co) close the tray-About focus todo
---

# Quick 260907-9co — tray About must raise `main` before mounting the modal

## Outcome

The tray's **About GameLib** item mounted the About modal inside a `main` window it never raised.
`open_about_window_from_tray` now calls `unminimize()` → `show()` → `set_focus()` before evaluating
`window.api?.showAboutWindow?.()`, a comment-stripped jest guard pins that ordering, and the
function's false doc comment is corrected. All three live window states scored **PASS** by the
operator.

## RETRACTED: "the brief was wrong about the fix"

**This section originally claimed the briefed two-call fix would have left minimized-to-Dock broken.
That claim is false. See "Correction" at the end of this file.** The two-call sibling idiom would
have worked; `unminimize()` is defence in depth, not a requirement. The retracted reasoning, kept
because the failure mode is the point:

The task was dispatched with a two-call fix: copy the file's four sibling raise sites, which all use
`let _ = window.show(); let _ = window.set_focus();`. Read from the vendored runtime
(`tao-0.35.3/src/platform_impl/macos/window.rs`):

| Line | Fact (accurate) | Inference drawn |
|---|---|---|
| `:677-685` | `set_focus()` is `if !is_minimized && is_visible { util::set_focus(..) }` | ~~A hard no-op while miniaturized — `unminimize()` must come FIRST~~ **FALSE — `show()` already handles it** |
| `:668-673` | `set_visible(true)` is `make_key_and_order_front_sync` (synchronous) | `show()` before `set_focus()` — correct, but this is also what makes `unminimize()` redundant |
| `:1035-1050` | `set_minimized(false)` early-returns when not miniaturized | The unconditional `unminimize()` is free — still true |

Every FACT column entry was verified against the vendored source by two parties. The error is
entirely in the inference column, and no amount of re-reading `window.rs` would have caught it —
the missing step was tracing `make_key_and_order_front_sync` one hop further into
`util/async.rs:212-217`.

## The todo's premise was stale

Filed 2026-08-31, describing an About **window** on another display. Quick `260905-d33` deleted that
window five days later — About became an in-app modal mounted inside `main` (`AboutDialogHost`,
app-level from `App.tsx`). The defect survived the migration in a new shape and **got worse**: a
free-standing `WebviewWindow` came up on its own; a modal inside `main` cannot, so a hidden /
minimized / backgrounded `main` swallowed the whole interaction silently.

The doc comment above the function asserted **"Nothing here had to change"** about that migration.
That sentence is why the defect survived it unnoticed. It was replaced, not appended to.
`grep -c 'Nothing here had to change' src-tauri/src/main.rs` → `0`.

## Verbatim Task 1 RED output (before the fix)

```
  quick 260907-9co -- tray About must RAISE the main window before mounting the modal
    ✕ all four raise/eval calls exist in the real (comment-stripped) source (3 ms)
    ✕ LOAD-BEARING ORDERING: unminimize, then show, then set_focus, then the eval LAST -- the window must already be up when the modal mounts (3 ms)
    ✓ SELF-TEST (RED direction): the exact HEAD form (get_webview_window + eval only) has no raise calls at all
    ✓ SELF-TEST (RED direction): raise calls placed AFTER the eval fail the ordering chain
    ✓ SELF-TEST (RED direction, comment-stripping is load-bearing): a doc comment merely NAMING unminimize/show/set_focus does not satisfy the gate

  ● quick 260907-9co ... › all four raise/eval calls exist in the real (comment-stripped) source

    expect(received).toBeGreaterThan(expected)
    Expected: > -1
    Received:   -1
      2584 |     expect(props.unminimizeIdx).toBeGreaterThan(-1)

  ● quick 260907-9co ... › LOAD-BEARING ORDERING: unminimize, then show, then set_focus, then the eval LAST ...

    expect(received).toBeLessThan(expected)
    Expected: < -1
    Received:   -1
      2592 |     expect(props.unminimizeIdx).toBeLessThan(props.showIdx)

Test Suites: 1 failed, 1 total
Tests:       2 failed, 144 passed, 146 total
```

## Test counts for `tauriShellSource.test.ts`

| Point | Result |
|---|---|
| Before this task | 141 passed / 141 |
| After Task 1 (RED, pre-fix) | 144 passed / **2 failed** / 146 |
| After Task 2 (HEAD) | **146 passed / 146** |

## Non-vacuity proved twice, by two parties

1. **Executor, temporally:** the guard landed in its own commit before `main.rs` was touched, so the
   RED above is a real temporal RED, not a synthetic self-test.
2. **Orchestrator, independently:** held the commit constant and varied the tree —
   `git show 6b5642bea:src-tauri/src/main.rs > src-tauri/src/main.rs`, rerun, restore. Deliberately
   **not** `git checkout --`, which fires this repo's post-checkout hook. Got `2 failed / 144
   passed` pre-fix and `146 passed / 146` restored; `git status` confirmed the tree returned clean.

**The comment-stripping is proved load-bearing rather than assumed.** The corrected doc comment now
names `unminimize`, `show` and `set_focus` in prose, so an unstripped gate would pass on the comment
alone — the exact failure this repo has recorded before. The prose-only self-test drives a
doc-comment-only synthetic source through `loadMainRsCode()` and asserts all three indices are `-1`.
That can only pass at the same time as the real-source test (all indices `> -1`) if the stripping
genuinely does work.

**Why jest and not cargo:** CI runs no cargo step at all, so a Rust test would be hand-run and
invisible to every future regression. `open_about_window_from_tray` takes `&AppHandle` and is not
unit-testable without a running Tauri app regardless. The guard mirrors the
`macos_finder_reselect_workaround` block in the same file — same bug class, same structure.

## Verification

| Gate | Result |
|---|---|
| `npx jest --selectProjects Backend --runInBand src/backend/__tests__/tauriShellSource.test.ts` | 146 passed / 146, non-zero count confirmed |
| `cargo check --manifest-path src-tauri/Cargo.toml` | success, 3.17s (hand-run) |
| `pnpm codecheck` | exit 0 |
| `grep -c 'Nothing here had to change' src-tauri/src/main.rs` | `0` |
| `git diff --stat` across both code commits | `main.rs` (+52/-7), `tauriShellSource.test.ts` (+127) — nothing else |

**Not run, deliberately:** `pnpm test:ci` (RED at HEAD, leaked 60s timer, zero failing tests) and
`pnpm lint` (RED at HEAD, warning ratchet breached — Phase 39 debt). Nothing pushed;
`.husky/pre-push` refuses on the ratchet.

## Live verification — operator-scored 2026-09-07

`pnpm tauri:dev`, right-click tray → **About GameLib**, from each state:

| # | `main` state before the click | Outcome |
|---|---|---|
| 1 | fully hidden / `startInTray` | **PASS** |
| 2 | minimized to the Dock | **PASS** |
| 3 | visible but backgrounded / another Space | **PASS** |

State 2 was the flagged risk — AppKit's `deminiaturize:` animates, so `set_focus()` one line later
could still observe a miniaturized window. It passed: `deminiaturize:` orders the window front
itself, which is sufficient for the visible symptom even if focus races the animation.

Every static criterion above could have passed with the user-visible symptom still present, which is
why this was scored by the operator and not inferred from a green suite. The closest prior case in
this repo (`reveal-in-finder-does-not-select-when-tauri-window-frontmost`) was exactly that: an
action that succeeded while its visible half silently did not.

## Correction (same day, after the live gate) — nothing is carried forward

This SUMMARY originally ended with a "Carried forward — an open defect with no todo yet" section
predicting that the four sibling raise sites (`~6477` child-window attachment fallback, `~8783`
`__GAMELIB_FOCUS__` socket handler, `~9126` tray `"show"` arm, `~9164` tray icon left-click) would
all fail to restore a Dock-minimized `main`, because all four are `show()` + `set_focus()` with no
`unminimize()`.

**Disproved by one operator gesture.** Asked to spot-check it, the operator reported that tray
**"Show GameLib" restores a Dock-minimized `main` correctly, and works from another display.**

**Mechanism.** `show()` -> `set_visible(true)` (`window.rs:668-673`) ->
`util::make_key_and_order_front_sync` -> `ns_window.makeKeyAndOrderFront(None)`
(`tao-0.35.3/src/platform_impl/macos/util/async.rs:212-217`). AppKit's `makeKeyAndOrderFront:`
deminiaturizes a miniaturized window and makes it key. `show()` alone un-minimizes, raises and
focuses; `set_focus()` no-opping in that case is irrelevant, and `unminimize()` is redundant.

**What stands and what does not:**

| Claim | Status |
|---|---|
| The defect was real and is fixed; `open_about_window_from_tray` raised nothing at all | **Stands** — all 3 live states PASS |
| The doc comment's "Nothing here had to change" was a false claim worth deleting | **Stands** |
| The jest guard, its double RED proof, and the prose-only self-test | **Stands** — unaffected |
| "The briefed two-call fix would have left minimized broken" | **RETRACTED** — it would have worked |
| "`unminimize()` is load-bearing" | **RETRACTED** — defence in depth; kept, but demoted in the doc comment |
| "The four sibling sites carry a latent gap" | **RETRACTED** — they are correct; nothing to file |

`unminimize()` was kept in the shipped code (free — `set_minimized(false)` early-returns — and an
explicit statement of intent), and the doc comment now warns the next editor not to cite this site
as precedent for it being required.

## Process lesson

A code-read prediction about native-runtime behaviour was carried into **four** records — the source
doc comment, the closed todo, this SUMMARY, and the STATE.md row — phrased as "measured", on the
strength of one true premise (`set_focus()` really does gate on `!is_minimized`) plus one untraced
inference (what `show()` does to a miniaturized window). Two parties verified the premise
independently and neither traced the inference, because both were reading the same file;
the disproof lived one hop away in `util/async.rs`.

The tell was available before any measurement: the prediction implied a user-visible defect in the
tray's most-used item, **"Show GameLib"**, which would not have gone unreported. A prediction that
implies a loud, long-standing bug nobody has hit should be checked before it is written down, not
after. Cost of checking: one operator gesture, ten seconds.
