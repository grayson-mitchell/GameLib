---
quick_id: 260902-8wc
title: "Close the stale openDialog/LONG_RUNNING_CHANNELS todo and land its unshipped residue"
date: 2026-09-02
status: complete
commits:
  - 935e83498 fix(shell): forward title, defaultPath and filters to the native open dialog
  - 9c07181e8 fix(sidecar): exempt dialog_message and dialog_save from the rustInvoke timeout
  - 24cdae047 fix(frontend): surface a failed file picker instead of an unhandled rejection
  - 4080c9fb6 test(quick-260902-8wc): pin the three dialog fixes, each mutation-tested
  - 75a1ef75a docs(quick-260902-8wc): close the openDialog todo and record what item 1 already shipped
---

# Summary

## The request's premise was already half-satisfied

The task arrived as the todo's title: "`openDialog` is missing from the shell's
`LONG_RUNNING_CHANNELS`". It is not missing. Phase 35 plan 07 added it five weeks ago on a
recorded measurement, pinned by `longRunningChannels.test.ts`. Redoing item 1 was explicitly
excluded before any work started.

What was genuinely unshipped: the todo's items 2 and 3, and the sibling-channel audit its own
item 1 asked for in passing and which nobody ran.

## Delivered

| # | Work | Where |
| --- | --- | --- |
| 2 | `dialog_open` honours `title` / `defaultPath` / `filters` | `src-tauri/src/main.rs` |
| 1b | `dialog_message` + `dialog_save` exempted from the inner 60s bound | `src/backend/sidecar/sidecarRpc.ts` |
| 3 | All 7 picker call sites routed through a total `useOpenDialog` hook | 5 frontend files + `gamelib.json` |
| — | 17 mutation-tested pins | `src/backend/__tests__/dialogOptionForwarding.test.ts` |
| 4 | Closure record, todo moved to `completed/` | `.planning/todos/completed/` |

## Findings worth keeping

**The todo's stated symptom is wrong.** "Dies silently" should not be repeated: the Phase 35
retest operator received a user-visible *"failed to install"* for a **move**. A misdirecting error
is worse for diagnosis than silence — it sends the reader to the install path. Recorded in the
closure record rather than quietly dropped.

**Both siblings were affected, and worse than the todo guessed.** `dialog_message` resolves the
DECLINED branch on timeout (answering a native confirm "no" on the user's behalf while it is still
on screen); `dialog_save` claims the user cancelled while the save panel is open. Both now exempt.

**`buttonLabel` is unplumbable.** tauri-plugin-dialog 2.7.2's `FileDialogBuilder` has no
confirm-button-label setter. Recorded inline in the arm so it is not re-derived or "fixed" with a
method that does not exist.

**`filters` was an unnamed fourth gap** in the same arm — `SideloadDialog` sends image and exe
filters and was getting an unfiltered picker. Fixed with the three the todo did name.

## Deliberately not done

- **Outer `LONG_RUNNING_CHANNELS` entries for `dialog_message`/`dialog_save`.** That list grants
  membership on a MEASUREMENT and there is none. `showMessageBox`'s live callers sit under
  `uninstall` (already exempt) and `quit`; `showSaveDialog` has no live backend caller at all.
  Reachability recorded instead of acted on.
- **The todo's third observation** (picker renders light under a dark system). Explicitly
  unverified in the source, needs a packaged-`.app` launch, and a second instance splits the
  `[shell]` sink. Left open and re-noted; it needs its own todo if pursued.

## Verification

All four pre-push gates green: `codecheck`, `lint`, `prettier`, `i18n --fail-on-update`.
`cargo check` clean. Frontend suite 2133/2133. New pins 17/17.

Both gates were driven RED before acceptance, not merely observed green: the frontend census
tripped on a reintroduced `window.api.openDialog` and again on an unguarded new file; every
source-shape assertion carries a self-test against the pre-fix text plus a discrimination control.

## Two pre-existing backend failures, attributed individually

Neither is caused by this change; each was cleared with a real control rather than by topical
reasoning, per `hold-the-commit-constant-vary-the-tree`.

- `downloadmanager/__tests__/utils.test.ts` — fails at **this exact commit in a pristine
  worktree** too. Pre-existing: the test expects `box.error.install.stalled`, the code emits
  `gamelib:box.error.install.stalled`. Untouched here.
- `storeManagers/steam/__tests__/decompressPool.test.ts` — **passes** in the pristine worktree at
  the identical commit. A main-working-tree environment artifact affecting the native lzma
  loader; the same suite, same cause, was already diagnosed in quick `260901-w9e`.

## Process notes

- The todo sat in `pending/` for five weeks because it deliberately carries no `resolves_phase:`,
  so Phase 35's auto-close could not see it. Third recorded recurrence of that pattern.
- A **concurrent session** committed this task's `PLAN.md` inside its own unrelated docs commit
  (`0b9291f80`). No code was absorbed. Untidy provenance, not a correctness problem.
- The staged `git mv` of the todo was absorbed by the first code commit (`935e83498`) as a
  zero-line rename, because `git commit` takes the whole index. History was NOT rewritten to
  correct it — a concurrent session is active and the content is intact either way.
