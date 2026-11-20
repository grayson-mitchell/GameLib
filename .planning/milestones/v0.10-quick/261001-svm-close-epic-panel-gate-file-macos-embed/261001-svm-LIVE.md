---
quick_id: 261001-svm
task: 4
created: 2026-10-01
title: "Live post-fix verification — macOS store embed across store-route switches"
---

# Task 4 — live record (orchestrator, macOS hardware)

verdict: confirmed

**Read the verdict with its history: it took TWO runs and TWO fixes.** Run 1, against Task 3's
`show()` fix alone, was `not-confirmed` — it closed one return path and left the other broken. The
verdict above is Run 2, after a second fix (`a9bc3f8f0`) that Task 3's plan did not contain.

## Harness (both runs)

- macOS dev/debug build driven from the docked Web Inspector console (hash router), window captured
  with `screencapture -l<winid>`. Same rig as `261001-svm-CONTEXT.md`; no app UI was hand-clicked.
- **Binary provenance was proved, not assumed.** `tauri dev` relaunches the app ~1 s after a source
  save but the rebuild lands ~4 s later, so the relaunched process runs the PREVIOUS image. Each run
  below therefore forced a second relaunch and asserted the running pid's start time was at or after
  the post-fix binary's birth time before any navigation was issued.
- No manual `storeEmbedShow()` or bounds call was issued at any point inside either scored sequence.
  The console transcript in each capture shows only `location.hash = …` assignments.

## Run 1 — `show()` fix only (`d890fe689`), relaunched pid 44311

| step | path | result |
| --- | --- | --- |
| 1 | `#/store/gog` (first visit, create path) | embed paints `www.gog.com` |
| 2 | `#/library` | library renders, no embed content over it |
| 3 | `#/store/gog` (**return**) | **PASS — embed repaints, unaided.** Pre-fix this was black |
| 4 | `#/store/epic` | panel clean; no native content over or around it |
| 5 | `#/store/gog` (**return from Epic**) | **FAIL — black slot, still black at +13 s** |

Follow-up probes on the failed state, which is what identified the second cause:

- `window.api.storeEmbedShow()` alone: **did NOT** restore it (unlike pre-fix, where show alone was
  sufficient). So the embed was being shown — Task 3's fix was working — and something else was wrong.
- `window.dispatchEvent(new Event("resize"))` alone, **no** show call: **restored it immediately**.
  A bounds flush fixing what a show call could not is what pins the surviving cause as geometry.
- While in the failed state, a `#/library` -> `#/store/gog` round trip also stayed black — the bad
  geometry persists until a genuine resize, it is not re-repaired by a later route return.

Cause (source-confirmed): the Epic panel replaces the slot while the hook stays mounted, so the
slot's ResizeObserver reports a final 0x0 rect; `store_embed_set_bounds` applied it verbatim on
macOS. Linux has guarded against exactly this since `260930-blh` fix 2; macOS had no such guard.

**This refutes an instruction the orchestrator gave the planner.** Task 3 was told to add no macOS
bounds handling, on the stated ground that "macOS bounds are already correct on this path — show
alone repainted it". That measurement was real but came only from the `/library` path; the Epic
round trip produces a degenerate rect and the generalisation was wrong. The `show()` half of the fix
is unaffected and still correct.

## Run 2 — both fixes (`d890fe689` + `a9bc3f8f0`), relaunched pid 46795

Post-fix binary birth 21:48:00; relaunched shell pid **46795** started 21:48:46, i.e. after that
binary existed. Sequence driven in one unbroken pass:

| step | path | result |
| --- | --- | --- |
| 1 | `#/store/gog` (first visit) | PASS — embed paints |
| 2 | `#/library` | PASS — library renders, no embed content over it |
| 3 | `#/store/gog` (**return**) | PASS — embed repaints, unaided |
| 4 | `#/store/epic` | PASS — unavailable panel clean; **no native content appeared over it** |
| 5 | `#/store/gog` (**return from Epic**) | PASS — embed repaints, unaided |

Step 4 is the regression check on the todo Task 1 closed as refuted: making a `show()` call reachable
on macOS where it previously was not is the one change that could plausibly have resurrected that
symptom. It did not — the Epic panel is clean both before and after the fix.

## Scope of this verification, stated plainly

- Dev/debug build only. The release/packaged build was not re-measured; the changed code is plain
  Rust shared by both, but that is an inference, not a measurement.
- macOS only. Linux behaviour is unchanged by both commits (its `show()` ordering is identical and
  its own zero-area guard was untouched) but was not re-run. Windows keeps its unsupported arms.
- Single window size (1280x800, devtools docked). No HiDPI-scale or resize-during-transition cases.
- The accepted edge both platforms now carry is unmeasured on both: a slot that genuinely collapses
  to zero area while visible keeps its last real geometry instead of vanishing.

## Run 3 — merged tree (`30a9c4dc7`), relaunched pid 50044

The push was rejected: `origin/main` had moved on by ~25 commits from other sessions, including two
renderer-side store-embed fixes (`d71269c2a` re-arms the bounds effect when the slot element is
replaced; `22fcf15e1` stops a last-url restore feedback loop). Neither of this task's Rust fixes was
present there — no duplicated work — but `d71269c2a` addresses the same slot-replacement geometry
problem from the renderer end, so the merged tree is a different system from the one Run 2 measured
and the gate was re-run against it rather than assumed.

Merged with `git merge` rather than rebased, deliberately: a rebase would rewrite the commit SHAs
this task's todo, SUMMARY and STATE row all cite by name. Only `.planning/STATE.md` conflicted (both
sides appended a Quick Tasks row); both rows were kept. `src-tauri/src/main.rs` auto-merged and both
fixes were re-verified present in the merged file by position, not assumed.

Merged binary birth 21:58:28, relaunched shell pid **50044** started 22:00:10. All five steps PASS,
same sequence as Run 2, Epic panel clean at step 4 with no native content over it.

Post-merge gates: `cargo test --bin gamelib-shell` 305 passed / 0 failed / 2 ignored; `cargo clippy`
exit 0 with the pinned 15-warning ceiling held.
