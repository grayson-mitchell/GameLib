---
quick_id: 261001-svm
status: complete
tasks_completed: 3
tasks_total: 5
commits:
  - 640e6bf38
  - 55d7521f5
  - d890fe689
---

# Quick 261001-svm: Close Epic-panel gate, file macOS embed defect — Summary (incomplete)

Tasks 1, 2 and 3 are committed and verified. **Task 4 (`checkpoint:human-verify`,
`gate="blocking-human"`) was not run** — the plan is `autonomous: false` and the live
post-fix verification belongs to the orchestrating session, which owns the standing
dev rig (`tauri dev`, pids 8213/8274, app pid 85669). This executor did not touch
that rig, did not write `261001-svm-LIVE.md`, and did not run or infer Task 5, which
branches on a verdict that does not yet exist.

## Task 1 — close the Epic-panel todo as refuted

`.planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md`
was `git mv`'d to `.planning/todos/completed/` and appended with a "Closed
2026-10-01" section recording CONTEXT.md's Finding 1 verbatim in substance: the
todo's own two-outcome live check was run by the orchestrator on macOS hardware, and
the branch reached was **refuted** — no native content visible over or around the
Epic unavailable panel at any point during or after a GOG -> Epic switch. The
refutation's width was **not** widened beyond the measurement: it is scoped to
**post-CR-01-fix, dev/debug build only**; the pre-fix state was never run on
hardware, so the closing note explicitly leaves open which reading explains it
(CR-01 closed a real defect, vs. the hypothesis was never real). Commit: `640e6bf38`.

**Deviation (self-corrected, not architectural):** the first draft of the closing
note grew the file to ~46% byte-similarity against its pre-move blob, which sits
below git's default 50% rename-detection threshold — `git log --follow` on the new
path returned only 1 revision instead of the required ≥2, because git recorded the
move as a plain add+delete rather than a rename. Fixed by `git reset --soft HEAD~1`
(not `--amend`, not `--hard`) on the just-created, not-yet-built-upon commit, then
rewriting the note to be more concise (~59.9% similarity). Re-verified:
`git show --name-status HEAD` reports `R059`, and `git log --follow` returns exactly
2 revisions (`640e6bf38`, `7fefb1481`). This same hazard applies to Task 5's own
`git mv` + append pattern and should be checked immediately after that commit, not
assumed.

## Task 2 — file the macOS store-embed-stays-hidden defect

New todo created at
`.planning/todos/pending/2026-10-01-macos-store-embed-stays-hidden-on-every-return-to-a-store-route.md`
with triage triad `severity: major`, `platform: macos`, `ready: code` (bare,
lowercase, in the required adjacency: platform immediately follows severity,
ready immediately follows platform). Body records, as CONTEXT.md measurements and
not as style: the three measured paths (second-visit black slot; GOG->Epic->GOG
black slot; `storeEmbedShow()` alone producing an 872 KB repaint), the
hidden-not-mis-positioned verdict, the Linux-symptom non-reproduction on macOS, both
honest caveats (dev/debug build only; one renderer reload before the measured
reproductions, not load-bearing to the mechanism), and the mechanism read from
source (`store_embed_open`, the `target_os = "linux"` cfg guard, `openedRef`,
`useStoreEmbedHost.ts`'s `D-21` route-lifecycle cleanup, attributed to predecessor
quick `260930-blh`). Back-pointer to the Task 1 closed sibling resolves on disk. No
bare `<file>:<line>` citation appears; the negative gate proving it forbidden was
probed and confirmed able to fire (2/2 on a synthetic probe). Commit: `55d7521f5`.

**Deviation (Rule 1, auto-fixed):** the first draft's Linux non-reproduction
sentence read "did **NOT** reproduce" with markdown bold around `NOT`, which broke
the required `not reproduce` substring match (the `**` sits between `NOT` and the
following space). Fixed by removing the bold markers; re-verified the grep passes
(count 1).

**Prettier (measured, not gated):** `npx prettier --file-info` on the new todo
reports `{ "ignored": true, "inferredParser": null }` — `.planning/` paths are
vacuously ignored, so no `--check` was run against it; running one would have
printed the same "All matched files use Prettier code style!" regardless of content.

## Task 3 — lift the show() call out of the Linux-only cfg block, pin it structurally

In `store_embed_open`'s existing-webview branch (`src-tauri/src/main.rs`), the
`existing.show()` call (with its `.map_err(...)` tail, unchanged) was lifted out of
the `#[cfg(target_os = "linux")]` block so it runs unconditionally before
`existing.navigate(url)`. Linux's effective order is unchanged (rect re-apply, show,
navigate); macOS's order becomes show, then navigate — the whole fix. The branch's
five-line comment was rewritten (now 10 lines) to remove the now-false "macOS
behaviour unchanged" parenthetical and to attribute both predecessor quick
`260930-blh` (2026-09-30, Linux) and this quick `261001-svm` (2026-10-01, macOS).

**No macOS bounds re-apply was added — a measured decision, not a shortcut.**
CONTEXT.md's third measured row showed `storeEmbedShow()` alone (no bounds flush)
fully repainting the embed, so macOS bounds are already correct on this path;
importing a rect re-apply here would also import the zero-rect hazard that Linux
needed `store_embed_linux_rect_is_zero_area` to guard against, onto a platform with
no measured need for it.

A new structural test,
`store_embed_open_shows_the_existing_webview_on_every_platform_before_navigating`,
was added adjacent to the existing `store_embed_linux_*` tests. It reads
`include_str!("main.rs")`, bounds a slice to `store_embed_open`'s body, and asserts:
the show() call sits after the Linux cfg block's closing brace (unconditional,
macOS-reachable); show() precedes navigate(); the Linux rect re-apply
(`linux_store_embed_layout::apply_bounds`) stays inside the cfg block; and the
bounded slice is non-empty (anti-vacuity). Its doc comment records the RED-proof
verbatim (moving `show()` back inside the cfg block is the mutation that fails it),
matching the discipline of `open_external_command_body_calls_the_scheme_check_before_opening`.

**Gate results, against the `7fa4b5fc1` baseline:**
- `cargo check --bin gamelib-shell`: exit 0.
- `cargo clippy --bin gamelib-shell`: exit 0, exactly **15 warnings** (the measured
  ceiling, pre-existing and unrelated to this change — all in login-webview
  `initialization_script` call sites, not touched here).
- `cargo test --bin gamelib-shell`: **304 passed; 0 failed; 2 ignored** (up from the
  303 baseline by exactly the one new test, confirmed individually:
  `store_embed_open_shows_the_existing_webview_on_every_platform_before_navigating`
  ... ok, 1 passed).

Commit: `d890fe689`.

**rustfmt / prettier, deliberately not run:** `cargo fmt` was not run against
`src-tauri/src/main.rs` per the dispatch's explicit prohibition — 76 unrelated dirty
hunks exist at HEAD outside this task's scope, and running it would have absorbed
them into this commit. Prettier `--check` was not run against the `.rs` path either:
`npx prettier --file-info src-tauri/src/main.rs` reports
`{ "ignored": false, "inferredParser": null }` — prettier sees the path but has no
parser for Rust, so `--check` exits 2 (a hard error) rather than passing or being
vacuously green. The file's existing comment-wrap width (~95-99 chars, measured via
`awk '{print length}'`) was matched by hand in the rewritten comment to stay visually
consistent with the surrounding, unformatted file.

## pending/completed census

Before this quick task: the Epic-panel todo sat in `pending/`. After: it is in
`completed/` (Task 1), and one new todo exists in `pending/` (Task 2) — net
`pending/` count unchanged, `completed/` count +1.

## `pnpm planning-gates`

Run after both docs tasks (Task 1 and Task 2): **12/12 gates passed**, with
`todo-frontmatter-gate.py` named `[PASS]` in the tail output both times.

## Task 4 / Task 5 — not run

`261001-svm-LIVE.md` was not created; no `verdict:` word exists yet; Task 5's two
arms were not evaluated or executed. These remain entirely for the orchestrating
session, which holds the live dev rig this checkpoint requires.

## Self-Check

- `git log --oneline -3` shows `d890fe689`, `55d7521f5`, `640e6bf38` on top of
  `7fa4b5fc1`, in that order — all three commits exist. FOUND.
- `.planning/todos/completed/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md`
  exists on disk. FOUND.
- `.planning/todos/pending/2026-10-01-macos-store-embed-stays-hidden-on-every-return-to-a-store-route.md`
  exists on disk. FOUND.
- `src-tauri/src/main.rs` contains `store_embed_open_shows_the_existing_webview_on_every_platform_before_navigating`.
  FOUND.
- Working tree after Task 3's commit: clean except this quick task's own
  `PLAN.md`/`CONTEXT.md` (untracked, intentionally left for the orchestrator) — no
  stray staged or modified files.

## Self-Check: PASSED

## Tasks 4 and 5 (orchestrator, after the executor halted)

**Task 4's live run did NOT pass on the first attempt, and that is the main thing this task
learned.** Against Task 3's `show()` fix alone, `/library` -> `/store/gog` repainted (the defect's
headline path, fixed) but `/store/gog` -> `/store/epic` -> `/store/gog` was still black. The probe
that separated the two causes: `storeEmbedShow()` no longer restored it while a bounds flush alone
did — a show call failing where a bounds flush succeeds means the embed was being shown and its
geometry was wrong.

A second fix followed, outside the plan's task list: `a9bc3f8f0` mirrors the Linux zero-area bounds
guard on macOS. The plan's branching Task 5 is what made this visible rather than papered over —
it reads a recorded verdict instead of assuming the happy arm, and the first run's verdict was
`not-confirmed`.

**An orchestrator instruction was refuted by the measurement.** Task 3 was told to add no macOS
bounds handling because "macOS bounds are already correct on this path — `show()` alone repainted
it". That was a real measurement of the `/library` path generalised to a platform claim, and the
Epic round trip refutes it. The `show()` half stands unchanged.

Run 2 (both fixes, relaunched pid 46795, binary provenance asserted before navigating) is green on
both return paths with the Epic panel clean — full per-step record in `261001-svm-LIVE.md`. The
defect todo moved to `completed/` in `2d1949cf5` (`R060`, `git log --follow` depth 2).

Final gates: `cargo check` 0; `cargo clippy` 0 with the pinned 15-warning ceiling held (an earlier
`!(w > 0.0)` spelling pushed it to 17 via `neg_cmp_op_on_partial_ord` and was rewritten);
`cargo test --bin gamelib-shell` 305 passed / 0 failed / 2 ignored, up from 303 by the two new tests.

Scope not covered: packaged/release build, Linux re-run, HiDPI, resize-during-transition, and the
accepted edge both platforms now carry (a slot that genuinely collapses to zero area while visible
keeps its last real geometry).
