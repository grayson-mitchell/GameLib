---
phase: quick-261001-svm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md
  - .planning/todos/completed/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md
  - .planning/todos/pending/2026-10-01-macos-store-embed-stays-hidden-on-every-return-to-a-store-route.md
  - .planning/todos/completed/2026-10-01-macos-store-embed-stays-hidden-on-every-return-to-a-store-route.md
  - .planning/quick/261001-svm-close-epic-panel-gate-file-macos-embed/261001-svm-LIVE.md
  - src-tauri/src/main.rs
autonomous: false
requirements:
  - TODO-2026-09-29-epic-panel-embed-visibility
  - CONTEXT-261001-svm-FINDING-2
user_setup: []

estimate:
  tokens: 72000
  raw_tokens: 36000
  tasks: 5
  confidence: low

must_haves:
  truths:
    - "The live gate the Epic-panel todo named has been RUN, and its own refuted branch was taken: no native web content is visible over or around the `WebviewUnavailablePanel` at any point during or after a GOG -> Epic switch. That todo is closed into `.planning/todos/completed/` with the measurement in its body, filename byte-identical, moved with `git mv` so `git log --follow` reaches its pre-move history."
    - "That refutation is recorded at exactly the width it was measured and is NOT widened: post-CR-01-fix only, dev/debug build only. The pre-fix state was never run, so the measurement cannot distinguish 'CR-01 closed a real defect' from 'the hypothesis was never real'. Both readings stay open in the closing note."
    - "The second, different macOS defect measured while running that gate is filed as its own `major` / `macos` / `code` pending todo carrying the full evidence: three measured navigation paths, the show-alone repaint, the hidden-not-mis-positioned verdict, the Linux non-reproduction, the symbol-anchored mechanism and both honest caveats. It is written as a DEFECT RECORD, not as future work."
    - "That defect is FIXED in `src-tauri/src/main.rs`: the `existing.show()` call in `store_embed_open`'s existing-webview branch is lifted out of the `#[cfg(target_os = \"linux\")]` sub-block so it runs on every supported platform before `existing.navigate(url)`, keeping its `store_embed_open:show-failed:{e}` error string unchanged. The Linux rect re-apply stays inside its cfg block, untouched."
    - "NO macOS bounds re-apply is added, and that is a measured decision rather than an omission: `storeEmbedShow()` ALONE repainted the embed with no bounds flush, so macOS bounds are already correct on this path. Adding a rect re-apply would import the zero-rect hazard that Linux needed a second guard (`store_embed_linux_rect_is_zero_area`) to contain, onto a platform with no measured need for it. Visibility is the whole measured defect and exactly that is fixed."
    - "The two platforms CONVERGE rather than diverge further, and the in-situ comment is accurate about which half remains Linux-only (the rect re-apply) with the 2026-10-01 macOS measurement recorded as the reason the show step is now shared."
    - "The fix is pinned by a permanent bounded-slice source-shape `#[test]` in `src-tauri/src/main.rs`, following the discipline of the five `include_str!(\"main.rs\")` tests already in the file. It pins STRUCTURE — that the show call is outside the cfg block and precedes the navigate — and makes no claim about native visibility, which no unit test in this crate can reach."
    - "The live post-fix confirmation is the ORCHESTRATOR's step on its already-standing rig, taken at a blocking checkpoint, NOT asserted by any executor command. The final todo-close reads that recorded outcome and branches on it: the todo is moved to `completed/` only if the live run confirmed the fix, and stays in `pending/` with the result appended if it did not."
    - "`cargo check`, `cargo clippy` and `cargo test --bin gamelib-shell` all hold at their measured baselines (exit 0; at most 15 clippy warnings; 303 passing tests rising to 304 with the new structural test)."
  artifacts:
    - .planning/todos/completed/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md
    - .planning/todos/completed/2026-10-01-macos-store-embed-stays-hidden-on-every-return-to-a-store-route.md
    - .planning/quick/261001-svm-close-epic-panel-gate-file-macos-embed/261001-svm-LIVE.md
    - src-tauri/src/main.rs
    - .planning/quick/261001-svm-close-epic-panel-gate-file-macos-embed/261001-svm-SUMMARY.md
  key_links:
    - "RUSTFMT IS NOT A GATE HERE, AND `cargo fmt` MUST NOT BE RUN. Measured at `7fa4b5fc1`: `cargo fmt -- --check` in `src-tauri` exits **1** with **76** `Diff in` hunks across `main.rs`, none of them in the store-embed region — pre-existing repo debt. Running `cargo fmt` would emit a 76-hunk diff unrelated to this task, and gating on `--check` would red the verify block for a non-reason. Second measured trap on the same command: `cargo fmt -- --check | head` reports exit **0**, because a pipeline's status is the LAST stage's. Capture the status before any pipe if it is ever read."
    - "PRETTIER ON THE RUST FILE IS A HARD ERROR, NOT A VACUOUS GREEN — a THIRD case beyond the two CLAUDE.md documents. Measured at `7fa4b5fc1` with prettier 3.7.4: `npx prettier --file-info src-tauri/src/main.rs` reports `ignored: false` but `inferredParser: null` (prettier has no Rust parser), and `npx prettier --check src-tauri/src/main.rs` prints `Checking formatting...`, then `Error occurred when checking code style in the above file.`, and exits **2**. So it is neither the ignored-and-vacuous case nor the seen-and-real case: running it would RED the code task's verify block. No task in this plan runs prettier on a `.rs` path."
    - "EVERY `.planning/` PATH IS PRETTIER-IGNORED, so a `--check` over the four todo paths is VACUOUS. Measured at `7fa4b5fc1`: the pending Epic todo, `.planning/todos/completed/` and `.planning/STATE.md` each report `{ \"ignored\": true, \"inferredParser\": null }`, and `.prettierignore` carries a bare `.planning` entry. Over an ignored path `--check` prints `All matched files use Prettier code style!` and exits 0 having matched ZERO files — output and exit code byte-identical to a real pass. The doc tasks therefore assert `ignored: true` via `--file-info` INSTEAD, so the vacuity is a measurement and a future `.prettierignore` change turns them red rather than leaving them hollow."
    - "THE `tauri dev` RIG IS LIVE AND MUST NOT BE MANAGED. Observed at planning time: pids 8213 (`sh -c ... tauri dev`), 8274 (`node .../tauri dev`) and 85669 (`target/debug/gamelib-shell`). It watches `src-tauri/`, so saving `main.rs` triggers an automatic rebuild and relaunch — that is WANTED, not a hazard, and is what makes the orchestrator's live re-run possible. The executor must not kill, restart, background, or otherwise manage any of those pids. Consequence for the verify block: that rebuild holds `src-tauri/target/debug/.cargo-lock`, so a concurrent `cargo check` may print a blocking-on-file-lock notice and wait. Allow a generous timeout and do NOT interrupt it; the lock resolves on its own."
    - "NO UNIT TEST IN THIS CRATE CAN REACH `show()`, AND NONE WILL BE INVENTED TO PRETEND OTHERWISE. Measured: 31 `store_embed_*` test functions exist and every one is a wire-contract, scheme-policy, nav-state or rect-arithmetic test over an `AppHandle`-free helper; `store_embed_open` takes `&AppHandle` and is structurally unreachable from `#[cfg(test)] mod tests`, exactly as the file's own comments already say of `open_external`. The honest substitute is the bounded-slice SOURCE-SHAPE test this plan adds, in the discipline of the five `include_str!(\"main.rs\")` tests already present. It proves the call moved; it does not prove a pixel."
    - "THE FIVE EXISTING SOURCE-SHAPE TESTS CANNOT BE RED BY THIS EDIT, measured rather than assumed. They sit at lines 12818, 15187, 15432, 15736 and 15873 and each bounds its slice to an unrelated region: `open_external`'s body, the `keyring_available` arm, the cookie-reading login-poll call sites and their cfg guards, `clear_default_data_store_cookies_for_domain`, and the window-based epic cookie-clear branch. None reads the store-embed branch, and this edit adds no cookie call and no new cfg block."
    - "THE `git mv` ORDERING IS THE HAZARD IN BOTH DOC-CLOSE TASKS. `git mv` stages the `HEAD` content, so appending the closing note AFTER the move-and-stage leaves the note unstaged and the commit records the UN-ANNOTATED file — a green move over an empty closure. Order is `git mv` -> append at the NEW path -> `git add` the new path -> read the INDEX back with `git show :<new path>`. The index readback, not a working-tree grep, is what proves it. Separately measured here: a plain `mv` crashes a planning gate until the move is staged, so the move must be staged before `pnpm planning-gates` runs."
    - "THE FINAL CLOSE HAS TWO ARMS AND THE PLAN REFUSES TO ASSUME THE HAPPY ONE. Task 5 reads the outcome the orchestrator records in `261001-svm-LIVE.md` and branches: confirmed -> close into `completed/`; not confirmed -> the todo STAYS in `pending/` with the live result appended, `ready:` re-evaluated, and the task HALTS back to the orchestrator. Its verify block detects which arm was taken and gates that arm's invariants, so neither arm can pass vacuously. This repo has a measured failure mode of auto-mode fabricating a human-verify outcome; `autonomous: false` in this plan's frontmatter is the countermeasure and must not be flipped."
    - "CENSUS GATES ARE RELATIONAL, NOT ABSOLUTE. `pending/` holds 10 files and `completed/` holds 267 at `7fa4b5fc1`; after this plan 9 and 269 on the confirmed arm, 10 and 268 on the unconfirmed one. Those figures are recorded as measurements but NOT gated on, for the reason `todo-frontmatter-gate.py` gives in its own docstring for refusing a file count: the corpus moves constantly and a count pin is red within the day. The gates assert relations — this file is here, that one is not, `pending/` is non-empty."
---

<objective>
Close the Epic-panel live-gate todo as REFUTED, file the separate macOS defect
measured while running that gate, FIX that defect in the Rust shell, and close the
new todo once the fix is confirmed live.

Purpose: the gate run answered one question and surfaced a better one. Quick
`260930-blh` fixed exactly this symptom on Linux on 2026-09-30 and left the macOS
half of the same branch alone, calling it "unmeasured" in its own SUMMARY. It is
now measured, and it is a `major` defect: every store-route visit after the first
shows a black panel. The fix converges the two platforms instead of widening the
gap.

Output: two todos closed, one new todo filed and closed, a two-line convergence in
`store_embed_open` plus a permanent structural test pinning it, and one blocking
checkpoint where the orchestrator confirms the fix on its standing rig.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/quick/261001-svm-close-epic-panel-gate-file-macos-embed/261001-svm-CONTEXT.md
@.planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md
@CLAUDE.md
@.planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/260930-blh-SUMMARY.md
@src-tauri/src/main.rs
</context>

## The evidence is LOCKED — read CONTEXT.md, do not re-measure

`261001-svm-CONTEXT.md` is a measurement record written by the orchestrating
session on live macOS hardware before this quick task was opened. Every factual
claim written into any todo must trace to it.

**Do not re-run the app to "confirm" the findings.** The harness is not
reproducible on demand: the build under test was a `pnpm tauri dev` debug shell
running as an orphan of an already-ended session, driven through the docked Web
Inspector console, and the single-instance socket means a second instance cannot be
launched while it lives. A confirmation run would measure a different process in a
different state. The ONE live run this plan does want is the POST-FIX one at Task
4, and it belongs to the orchestrator, not to an executor.

**Do not soften and do not widen.** Two non-widenings carry into the written files:

1. The Epic-panel refutation is **post-CR-01-fix only**. The pre-fix state was
   never run. The todo's own text already names both readings — that the CR-01 fix
   closed a real defect, or that the hypothesis was never real — and the
   measurement cannot choose between them.
2. Finding 2 was measured on the **dev/debug** build only. The branch concerned is
   plain Rust shared with the release build, but a packaged build was not
   re-measured.

## Why this plan is NOT tracer-first, stated rather than silently skipped

The default is a leading `type="tracer"` slice. It does not apply here and the
`--no-tracer` condition is met on its own terms: **the architecture is already
proven in the tree.** The Linux half of this exact fix — show the existing embed
before navigating it — shipped on 2026-09-30 in quick `260930-blh` and is live in
the same `if let Some(existing)` branch this plan edits. A thin end-to-end slice
would re-prove a path that is already load-bearing on another platform and would
produce no information. The remaining uncertainty is entirely empirical (does the
shared show call repaint the embed on macOS), and that is answered by the live run
at Task 4, not by a decomposition choice.

## Grounding — the exact branch, re-read at `7fa4b5fc1`

`store_embed_open` carries `#[cfg(any(target_os = "macos", target_os = "linux"))]`,
so Windows is not in scope at all. Its existing-webview branch is 20 lines and
reads, in order:

1. `if let Some(existing) = app.get_webview(STORE_EMBED_LABEL) {`
2. A five-line comment attributing itself to quick `260930-blh` as "Linux only,
   live-measured", explaining the remount-plus-hidden-plus-zero-rect mechanism,
   and containing a parenthetical that calls the macOS behaviour unaltered by the
   step below it.
3. `#[cfg(target_os = "linux")]` opening a braced block that computes a rect with
   `store_embed_linux_gtk_rect(x, y, w, h)`, re-prefixes its error from the
   set-bounds op name to the open op name with `replacen`, applies it with
   `linux_store_embed_layout::apply_bounds(&existing, rect)?`, and then calls
   `existing.show()` mapping failure to `store_embed_open:show-failed:{e}`.
4. `existing.navigate(url)` mapping failure to
   `store_embed_open:navigate-failed:{e}` — **unconditional**, so on macOS the
   branch navigates and never shows.
5. `return Ok(Value::Null);`

Supporting anchors, all verified present:

- `src/frontend/screens/WebView/useStoreEmbedHost.ts` carries `openedRef`, a
  `flush()` whose `!openedRef.current` branch calls `window.api.storeEmbedOpen`,
  and a section headed "ROUTE LIFECYCLE — hide on leave, close only at app
  teardown (D-21)" whose cleanup calls `window.api.storeEmbedHide`.
- `store_embed_show` exists separately and returns
  `store_embed_show:no-webview:{STORE_EMBED_LABEL}` when the label does not
  resolve — which is NOT what was observed; the measured return was an ok status.
- `store_embed_linux_rect_is_zero_area` exists as a named helper with its own
  test, and is the Linux zero-area guard this plan deliberately does NOT import
  onto macOS.
- `260930-blh-SUMMARY.md`'s "Open observations" item 5 reads, verbatim: "The macOS
  path has the same shape as the two defects fixed here (existing-embed open only
  navigates; a zero rect is applied verbatim on unmount). That is unmeasured on
  macOS, and could be a real macOS defect."

**No bare `<file>:<line>` citation goes into any written todo.** This repo closed
four separate families of rotted line citations in the last three days
(`260929-uw6`, `260929-w93`, `260929-wyk`, `261001-q9v`/`261001-rj1`), each finding
the inherited accurate/stale split was not what its predecessor implied. Anchoring
on the symbol names above costs nothing and cannot rot.

## Measured command baselines, at `7fa4b5fc1`

| command | result | role in this plan |
| --- | --- | --- |
| `cd src-tauri && cargo check --bin gamelib-shell` | exit 0 in 3.19 s warm | gate (Task 3) |
| `cd src-tauri && cargo clippy --bin gamelib-shell` | exit 0, **15** warnings | gate, ceiling 15 (Task 3) |
| `cd src-tauri && cargo test --bin gamelib-shell` | **303 passed; 0 failed; 2 ignored** | gate, 304 after the new test (Task 3) |
| `cd src-tauri && cargo fmt -- --check` | exit **1**, **76** dirty hunks | **NOT a gate.** Pre-existing debt |
| `npx prettier --check src-tauri/src/main.rs` | exit **2**, parser error | **NOT run.** No Rust parser |
| `npx prettier --file-info` on any `.planning/` path | `ignored: true` | vacuity probe, not `--check` |
| `pnpm planning-gates` | 12/12 | gate (every doc task) |

`dist/index.html` does not exist locally and `cargo check` does not need it — the
dev rig serves the renderer from vite on `:5173`. Measured, because the CI
workflow runs `pnpm exec vite build` before `cargo test` and that ordering invites
the assumption that a desk check needs it too.

## Coverage — every scope item maps to a task

| scope item | covered by |
| --- | --- |
| Close the Epic-panel todo as REFUTED (Finding 1, positive control, frame figures, second reproduction, post-CR-01-only scoping) | Task 1 |
| File the macOS defect with full evidence, `major` / `macos` / `code`, as a defect record | Task 2 |
| Fix it: shared `show()` before `navigate`, Linux rect re-apply untouched, no macOS bounds re-apply, comment made accurate | Task 3 |
| Pin the fix structurally without pretending to test native visibility | Task 3 |
| Live post-fix confirmation, orchestrator-owned, blocking | Task 4 |
| Close the new todo with the fix and the live result — branching on that result | Task 5 |
| STATE.md Quick Tasks row | **NOT this plan** — the `/gsd-quick` orchestrator owns it; see Task 5 |

No scope item is unplanned. Task count is 5, above the 2-3 guideline: the
orchestrator fixed a single output path for this plan, the tasks are small and
strictly sequential, and only Task 4 is non-autonomous. Splitting at the checkpoint
into two plan files was considered and rejected on that path constraint alone.

<tasks>

<task type="auto">
  <name>Task 1: Close the Epic-panel live gate as REFUTED, move it to completed/, commit</name>
  <files>.planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md, .planning/todos/completed/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md</files>
  <precondition>`git status --short .planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md` is empty — the index readback below compares the staged blob against the planning-time revision `7fa4b5fc1`, so a pre-existing unstaged edit would be attributed to this task.</precondition>
  <reversibility rating="reversible">A `git mv` of a Markdown file under `.planning/` plus an appended section; `git mv` back and truncate restores it exactly.</reversibility>
  <action>
Record CONTEXT.md's Finding 1 in the Epic-panel todo and move it to
`.planning/todos/completed/`, keeping the filename byte-identical.

**1a — the ordering, which is the whole hazard.** `git mv` stages the `HEAD`
content of the file, so appending the closing note AFTER the move-and-stage leaves
the note unstaged and the commit records the file WITHOUT its closure. Use this
order:

1. `git mv` the pending file to `.planning/todos/completed/`, keeping its
   `2026-09-29-` prefix and the rest of the filename unchanged.
2. Append the closing note to the file at its NEW path.
3. `git add` that new path.
4. Read the INDEX back with `git show :<new path>` and confirm it carries the note
   — not merely the rename.

Staging before the gate run matters separately: a move left unstaged has been
measured in this repo to crash a planning gate.

Do not rewrite or trim any of the existing body. The hypothesis section, the
live-check steps and the `ready: live-gate` rationale are the record of what was
believed and why, and the closing note's value comes from sitting after them. The
frontmatter triad also stays exactly as written: `completed/` is outside the
frontmatter gate's scope by deliberate design, a closed todo needs no triage, and
re-triaging on the way out would be a change with no reader.

**1b — the closing note.** Head it
`## Closed 2026-10-01 (quick task 261001-svm)`. Record, as measurements:

- **The todo's own refuted branch was taken.** Its "live check that would settle
  it" section named two outcomes; the one reached is "no native content is visible
  at any point during or after the switch", so no re-triage upward is due. Say
  which branch, so the closure reads as the todo's own test being run rather than a
  judgement made outside it.
- **The positive control, which is what makes the negative result mean anything.**
  Driving to the GOG store route first opened the native embed and painted
  `www.gog.com`, read as an image — so the capture pipeline demonstrably CAN see
  native embed content inside the window surface. Without this, a clean
  post-switch frame would be indistinguishable from a capture method blind to
  native layers.
- **The measurement.** A 24-frame burst at roughly 100 ms spacing was armed before
  the switch to the Epic store route. Pre-switch frames run about 1.10 MB (GOG
  content); from the first post-switch frame they drop to about 579 KB and stay
  there. The first post-switch frame, about 100 ms after the switch, read as an
  image, shows the unavailable panel clean — its own copy and its "Open in
  browser" affordance — with no GOG content, no Epic content and no native webview
  surface anywhere, at the panel's bounds or elsewhere. All 13 post-switch frames
  across roughly 1.1 s carry one of two hashes differing by about 100 bytes, which
  is the console caret blinking. A settled capture seconds later is likewise clean.
- **Reproduced a second time** later in the same session from a freshly-shown GOG
  embed, panel only.
- **The non-widening, stated plainly.** Refuted POST-CR-01-fix. The pre-fix state
  was never run on hardware, so the measurement cannot distinguish "the CR-01 fix
  closed a real defect" from "the hypothesis was never real", and both readings
  stay open. The todo's own text already framed the CR-01 fix as inference from
  source rather than measurement; that is unchanged.
- **The harness, named rather than implied,** because it bounds the claim: the
  macOS dev/debug shell under `pnpm tauri dev`, driven by hash-router assignment
  from the docked Web Inspector console, captured with a window-scoped screen
  capture. The packaged build was not measured. Record that the frames are
  deliberately NOT committed — the GOG page was signed in, so they carry account
  UI, and they live only in the measuring session's scratchpad.
- **A forward pointer to the successor,** naming Task 2's new todo by filename:
  the gate run found a different, `major` macOS defect — the embed stays hidden
  after any return to a store route — filed separately and fixed in this same
  quick task. Make the distinction explicit, because the two are easy to conflate:
  this todo predicted the embed being too VISIBLE, and what was found is the embed
  being too HIDDEN, on a different route transition.

Anchor any source reference on symbol names; write no bare `<file>:<line>`
citation into this note.

**1c — commit.** Stage both todo paths and this quick task's directory in the same
invocation as the gate run, then commit. Subject line:
`docs(261001-svm): close the Epic-panel embed-visibility gate as refuted on macOS`.
  </action>
  <verify>
    <automated>
set -u
fail=0
OLD=.planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md
NEWP=.planning/todos/completed/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md
BASEREV=7fa4b5fc1
chk() { [ "${2:-0}" -ge "$3" ] && echo "ok   $1 = ${2:-0} (>= $3)" || { echo "FAIL $1 = ${2:-0}, want >= $3"; fail=1; }; }
exact() { [ "${2:-0}" -eq "$3" ] && echo "ok   $1 = ${2:-0}" || { echo "FAIL $1 = ${2:-0}, want $3"; fail=1; }; }

[ ! -e "$OLD" ] && echo "ok   pending copy gone" || { echo "FAIL $OLD still present"; fail=1; }
[ -f "$NEWP" ] && echo "ok   completed copy exists" || { echo "FAIL $NEWP missing"; exit 1; }
[ "$(basename "$OLD")" = "$(basename "$NEWP")" ] && echo "ok   filename byte-identical across the move" || { echo "FAIL filename changed in the move"; fail=1; }

# --- THE git mv TRAP. The INDEX must carry the NOTE, not just the rename. The
# staged blob is materialised to a file FIRST: piped straight into a matcher, the
# pipeline reports only the matcher's status, so an unstaged path would surface as
# a content failure instead of its real cause.
STAGED="$(mktemp)"
if git show ":$NEWP" > "$STAGED" 2>/dev/null; then echo "ok   $NEWP is in the index"; else echo "FAIL $NEWP not staged -- nothing to verify"; exit 1; fi

# ANTI-VACUITY for every assertion below: the staged blob must DIFFER from the file
# as it stood at planning time. Compared against a FIXED revision, not HEAD~1, so
# this arm is correct whether it runs before or after the commit.
HB="$(mktemp)"
if git show "$BASEREV:$OLD" > "$HB" 2>/dev/null; then
  if cmp -s "$HB" "$STAGED"; then
    echo "FAIL index content identical to $BASEREV -- the git mv trap: the note is UNSTAGED"; fail=1
  else
    echo "ok   index differs from $BASEREV ($(wc -l < "$HB" | tr -d ' ') -> $(wc -l < "$STAGED" | tr -d ' ') lines): the note is staged"
  fi
else
  echo "FAIL could not extract $BASEREV:$OLD -- anti-vacuity arm did not run"; fail=1
fi

# --- THE ORIGINAL BODY MUST SURVIVE. Headings quoted from the file at $BASEREV.
chk "hypothesis section intact"   "$(grep -cF 'Hypothesis — not measured, not claimed as fixed' "$STAGED")" 1
chk "live-check section intact"   "$(grep -cF 'The live check that would settle it' "$STAGED")" 1
chk "live-gate rationale intact"  "$(grep -cF 'Why this stays' "$STAGED")" 1
chk "original severity unchanged" "$(grep -cE '^severity: minor$' "$STAGED")" 1
chk "original ready unchanged"    "$(grep -cE '^ready: live-gate$' "$STAGED")" 1

# --- THE CLOSING NOTE, in the index.
chk "closing heading names the task"      "$(grep -cF 'quick task 261001-svm' "$STAGED")" 1
chk "verdict recorded as refuted"         "$(grep -ciE 'refuted' "$STAGED")" 1
chk "scoped to post-CR-01 only"           "$(grep -cF 'CR-01' "$STAGED")" 1
chk "pre-fix state named as unmeasured"   "$(grep -ciE 'pre-fix|before the fix|never (run|measured)' "$STAGED")" 1
chk "positive control recorded"           "$(grep -ciE 'positive control' "$STAGED")" 1
chk "the 579 KB post-switch figure"       "$(grep -cF '579' "$STAGED")" 1
chk "the 24-frame burst recorded"         "$(grep -cF '24' "$STAGED")" 1
chk "the 13 post-switch frames recorded"  "$(grep -cF '13' "$STAGED")" 1
chk "second reproduction recorded"        "$(grep -ciE 'second time|reproduced a second|twice' "$STAGED")" 1
chk "dev/debug harness named"             "$(grep -ciE 'debug build|dev build|dev/debug|tauri dev' "$STAGED")" 1
chk "frames deliberately not committed"   "$(grep -ciE 'not committed|signed in|account UI' "$STAGED")" 1
chk "visible-vs-hidden distinction drawn" "$(grep -ciE 'hidden' "$STAGED")" 1

# --- NEGATIVE: no bare source line citation, in any of the three extensions.
exact "no bare <source>:<line> citation" "$(grep -cE '\.(rs|ts|tsx):[0-9]+' "$STAGED" || true)" 0
# ANTI-VACUITY arm: a negative that cannot fire is not a gate.
PROBE="$(mktemp)"
printf 'the branch lives at src-tauri/src/main.rs:5801 today\nand at useStoreEmbedHost.ts:380\n' > "$PROBE"
exact "that negative gate CAN fire" "$(grep -cE '\.(rs|ts|tsx):[0-9]+' "$PROBE")" 2

# --- HISTORY FOLLOWS THE MOVE. This is why it is `git mv` and not `mv`.
# Materialised before counting, same reason as the commit block below.
FOL="$(mktemp)"
git log --follow --format=%h -- "$NEWP" > "$FOL" || { echo "FAIL could not read --follow history"; fail=1; }
chk "--follow history reaches pre-move revisions" "$(wc -l < "$FOL" | tr -d ' ')" 2

# --- CENSUS, RELATIONAL NOT ABSOLUTE (see key_links for why no totals are pinned).
exact "the Epic-panel todo is gone from pending/" "$(ls .planning/todos/pending/*.md | grep -c 'store-embed-may-stay-visible-over-the-epic-panel' || true)" 0
chk   "pending/ is non-empty"                     "$(ls .planning/todos/pending/*.md | wc -l | tr -d ' ')" 1

# --- PRETTIER: measured, not a vacuous --check. Space-tolerant pattern: prettier
# prints `{ "ignored": true, ... }` WITH spaces (a terminal render can drop them).
PI="$(npx prettier --file-info "$NEWP" 2>/dev/null)"
printf '%s\n' "$PI"
if printf '%s' "$PI" | grep -Eq '"ignored":[[:space:]]*true'; then
  echo "ok   prettier IGNORES $NEWP -- a --check over it would be VACUOUS and is deliberately NOT run"
else
  echo "FAIL prettier now SEES $NEWP -- .prettierignore changed; add a real --check to this block"; fail=1
fi

# --- GATES. Exit 0 alone is not accepted: the relevant gates are named.
GOUT="$(mktemp)"
if pnpm planning-gates > "$GOUT" 2>&1; then echo "ok   pnpm planning-gates exit 0"; else echo "FAIL pnpm planning-gates"; fail=1; fi
tail -4 "$GOUT"
chk "todo-frontmatter-gate.py PASSed"      "$(grep -cF '[PASS] .planning/todos/todo-frontmatter-gate.py' "$GOUT")" 1
chk "planning-envelope-tag-gate.py PASSed" "$(grep -cF '[PASS] .planning/planning-envelope-tag-gate.py' "$GOUT")" 1

# --- COMMIT. Both sides of the rename, and no source file in a docs commit.
# `git` output is MATERIALISED to files before any grep. A fallible `git` in a
# non-final pipeline stage is swallowed -- the pipeline reports grep's status -- so
# a broken `git show` would read as "0 matches" and FALSELY PASS every `exact ... 0`
# assertion below. Status is captured here, before any pipe.
NAMES="$(mktemp)"; STATUS="$(mktemp)"; SUBJ="$(mktemp)"
git show --name-only --format= HEAD > "$NAMES" || { echo "FAIL could not read HEAD's file list"; exit 1; }
git show --name-status --format= HEAD > "$STATUS" || { echo "FAIL could not read HEAD's name-status"; exit 1; }
git log -1 --format=%s > "$SUBJ" || { echo "FAIL could not read HEAD's subject"; exit 1; }
chk "HEAD subject carries the task id"  "$(grep -c '261001-svm' "$SUBJ")" 1
chk "HEAD records the completed path"   "$(grep -cF "$NEWP" "$NAMES")" 1
chk "HEAD records the pending deletion" "$(grep -cF "$OLD" "$STATUS")" 1
exact "no source file in this commit"   "$(grep -cE '^(src|src-tauri)/' "$NAMES" || true)" 0
exact "STATE.md untouched by this plan" "$(grep -cF '.planning/STATE.md' "$NAMES" || true)" 0

exit $fail
    </automated>
  </verify>
  <done>
The Epic-panel todo lives under `completed/` with a byte-identical filename and its
original body intact; the closing note is in the git INDEX — not merely on disk —
carrying the refuted verdict, its post-CR-01-only scope with the pre-fix state
named as unmeasured, the positive control, the 24-frame burst, the 579 KB figure,
the 13 post-switch frames, the second reproduction, the dev/debug harness, the
uncommitted-frames rationale and the visible-vs-hidden distinction; the staged blob
is proven to differ from the file at `7fa4b5fc1`; `git log --follow` reaches
pre-move history; no bare source line citation appears and the gate forbidding one
is proven able to fire; the path is measured prettier-ignored so no vacuous
`--check` is carried; `pnpm planning-gates` exits 0 with the frontmatter and
envelope-tag gates both named `[PASS]`; and the commit carries both sides of the
rename, no source file and not STATE.md.
  </done>
</task>

<task type="auto">
  <name>Task 2: File the macOS store-embed-stays-hidden defect record</name>
  <files>.planning/todos/pending/2026-10-01-macos-store-embed-stays-hidden-on-every-return-to-a-store-route.md</files>
  <precondition>`.planning/todos/pending/2026-10-01-macos-store-embed-stays-hidden-on-every-return-to-a-store-route.md` does not already exist — a pre-existing file at that path would have its content attributed to this task.</precondition>
  <action>
Write the new pending todo for CONTEXT.md's Finding 2, at exactly the path in
this task's files field. Write it as a **defect record**, not as future work: Task 3 fixes it and
Task 5 closes it, so it must stand as the evidence for the fix. Do not add a
"proposed fix" or "next steps" section — the mechanism paragraph is what a fix
reads, and the fix itself is recorded in the closing note.

**Frontmatter.** Keys in this order, values bare and lowercase where the vocabulary
is closed:

- `created: 2026-10-01`
- `title:` a single quoted line naming the defect and the platform. It must say the
  embed stays hidden on a return to a store route on macOS, and that the slot
  renders black.
- `severity: major` — the correct rung by the project's own table: a feature is
  broken. Every store-route visit after the first shows a black panel.
- `platform: macos` — immediately after `severity:`.
- `ready: code` — immediately after `platform:`. Correct at filing time and
  load-bearing: the mechanism is read from source, the fix is a desk edit, and the
  Linux sibling of that fix already ships in the tree as a model. It is NOT
  `live-gate`: the live measurement is already done.
- `area: store-embed` — `pending/` carries two live spellings of this area
  (`store-embed` and `webview/store-embed`, two files each at `7fa4b5fc1`) and no
  gate ranges over `area`, so either is admissible; take the shorter.
- `files:` a YAML list naming `src-tauri/src/main.rs` and
  `src/frontend/screens/WebView/useStoreEmbedHost.ts`.

Nothing else in the frontmatter — in particular do not invent a `status:` or
`needs:` key.

**Body.**

*The symptom.* On macOS the store embed stays hidden after any return to a store
route; the slot renders black indefinitely. The FIRST entry to a store route after
app launch is fine — the create path shows the webview — and it is every later
entry that is blank. Reproduce CONTEXT.md's three-row table as a table: a second
visit to `/store/gog` after the route had been left (black, still black at +12 s);
`/store/gog` -> `/store/epic` -> `/store/gog` (black, still black at +5 s); then
`storeEmbedShow()` alone, nothing else, which repainted GOG immediately as an
872 KB frame.

*Why it is hidden and not mis-positioned, as a measurement.* Because `show()`
**alone** — with no bounds flush — restores it, the embed is hidden rather than
mis-positioned, and bounds are fine on macOS. State explicitly that the Linux
sibling symptom (the embed drawn at the window origin, over the app chrome) did
NOT reproduce here: the chrome and sidebar render normally in every capture.
Record that the show call returned an ok status, so the native webview still exists
and the label resolved — this is not the `no-webview` error path.

*The mechanism, read from source rather than guessed.* `store_embed_open`'s
existing-webview branch in `src-tauri/src/main.rs` calls `navigate` on macOS and
nothing else. The step directly above it — show, then re-apply the rect the call
carries — is guarded by a `target_os = "linux"` cfg attribute, added by quick
`260930-blh` on 2026-09-30 for exactly this symptom on Linux, with its in-situ
comment calling the macOS behaviour unaltered. Meanwhile the renderer hides the
embed on route leave (the route-lifecycle cleanup in `useStoreEmbedHost.ts`, D-21)
and on remount has `openedRef` false, so its first `flush()` goes through
`storeEmbedOpen` — which on macOS navigates and never shows. Nothing else ever
calls `storeEmbedShow` on that path.

Anchor all of that on the symbol names. Do not write a bare line number against any
source file, in any spelling, anywhere in this file.

*Attribution.* This is quick `260930-blh`'s own SUMMARY, "Open observations", item
5 — quote it — and it is no longer unmeasured. Name the predecessor task id so a
reader can find the Linux fix that is the model for this one.

*Honest caveats, as their own section.* Measured on the dev/debug build only; the
branch is plain Rust shared with the release build, but a packaged build was not
re-measured. The measuring session included one renderer reload before these
reproductions, though both were from clean navigation states after it and the
mechanism does not depend on a reload.

*A back-pointer.* Cite the sibling Task 1 closed at its post-move path,
`.planning/todos/completed/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md`,
noting this was found while running that todo's live gate, and that the two are
opposite symptoms — that one predicted the embed being too visible, this one is the
embed being too hidden.

**Then commit.** Stage the new todo and this quick task's own directory in the same
invocation as the gate run, then commit. Subject line:
`docs(261001-svm): file the macOS store-embed-stays-hidden defect record`.
  </action>
  <verify>
    <automated>
set -u
fail=0
NEW=.planning/todos/pending/2026-10-01-macos-store-embed-stays-hidden-on-every-return-to-a-store-route.md
CLOSED=.planning/todos/completed/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md
chk() { [ "${2:-0}" -ge "$3" ] && echo "ok   $1 = ${2:-0} (>= $3)" || { echo "FAIL $1 = ${2:-0}, want >= $3"; fail=1; }; }
exact() { [ "${2:-0}" -eq "$3" ] && echo "ok   $1 = ${2:-0}" || { echo "FAIL $1 = ${2:-0}, want $3"; fail=1; }; }

[ -f "$NEW" ] && echo "ok   new todo exists at the planned path" || { echo "FAIL $NEW missing"; exit 1; }

# --- FRONTMATTER BLOCK ONLY, delimited exactly as todo-frontmatter-gate.py does:
# first `---` line to the next `---` line. Body prose about severity legitimately
# exists in this file and must not satisfy the triad; equally, a body line would
# not satisfy the real gate, so neither may it satisfy this one.
FM="$(mktemp)"
awk 'NR==1 && $0=="---"{inb=1;next} inb && $0=="---"{exit} inb{print}' "$NEW" > "$FM"
[ -s "$FM" ] && echo "ok   frontmatter block extracted ($(wc -l < "$FM" | tr -d ' ') lines)" || { echo "FAIL no frontmatter block"; exit 1; }

# Bare, lowercase, exact -- the same shape the real gate matches.
exact "severity: major bare" "$(grep -cE '^severity: major$' "$FM")" 1
exact "platform: macos bare" "$(grep -cE '^platform: macos$' "$FM")" 1
exact "ready: code bare"     "$(grep -cE '^ready: code$'     "$FM")" 1

# KEY ORDER, which the real gate does NOT check but CLAUDE.md mandates.
sv=$(grep -nE '^severity:' "$FM" | head -1 | cut -d: -f1)
pf=$(grep -nE '^platform:' "$FM" | head -1 | cut -d: -f1)
rd=$(grep -nE '^ready:'    "$FM" | head -1 | cut -d: -f1)
[ "${pf:-0}" -eq $(( ${sv:-0} + 1 )) ] && echo "ok   platform immediately follows severity (${sv} -> ${pf})" || { echo "FAIL key order: severity@${sv:-?} platform@${pf:-?}"; fail=1; }
[ "${rd:-0}" -eq $(( ${pf:-0} + 1 )) ] && echo "ok   ready immediately follows platform (${pf} -> ${rd})" || { echo "FAIL key order: platform@${pf:-?} ready@${rd:-?}"; fail=1; }

exact "created: 2026-10-01"         "$(grep -cE '^created: 2026-10-01$' "$FM")" 1
chk   "title key present"           "$(grep -cE '^title:' "$FM")" 1
chk   "area key present"            "$(grep -cE '^area:'  "$FM")" 1
chk   "files key present"           "$(grep -cE '^files:' "$FM")" 1
chk   "files names the Rust shell"  "$(grep -cF 'src-tauri/src/main.rs' "$FM")" 1
chk   "files names the host hook"   "$(grep -cF 'useStoreEmbedHost.ts' "$FM")" 1

# --- CONTENT: every one of these is a CONTEXT.md measurement, not a style wish.
chk "later-entry symptom recorded"      "$(grep -ciE 'later entry|second visit|every return|any return' "$NEW")" 1
chk "the gog->epic->gog path recorded"  "$(grep -cF '/store/epic' "$NEW")" 1
chk "the show-alone repaint recorded"   "$(grep -cF 'storeEmbedShow' "$NEW")" 1
chk "the 872 KB repaint figure"         "$(grep -cF '872' "$NEW")" 1
chk "hidden-not-mis-positioned verdict" "$(grep -ciE 'not mis-?positioned' "$NEW")" 1
chk "Linux symptom non-reproduction"    "$(grep -ciE 'did not reproduce|not reproduce' "$NEW")" 1
chk "dev/debug-build caveat"            "$(grep -ciE 'debug build|dev build|dev/debug' "$NEW")" 1
chk "packaged build not re-measured"    "$(grep -ciE 'packaged|release build' "$NEW")" 1
chk "mechanism names the Rust entry fn" "$(grep -cF 'store_embed_open' "$NEW")" 1
chk "mechanism names the cfg guard"     "$(grep -cF 'target_os = "linux"' "$NEW")" 1
chk "mechanism names the remount flag"  "$(grep -cF 'openedRef' "$NEW")" 1
chk "renderer lifecycle decision cited" "$(grep -cF 'D-21' "$NEW")" 1
chk "predecessor task attributed"       "$(grep -cF '260930-blh' "$NEW")" 1

# Back-pointer, and it must RESOLVE -- a closing/filing note citing a path that was
# never created is a measured defect class in this repo.
chk "back-pointer to the closed sibling" "$(grep -cF "$CLOSED" "$NEW")" 1
[ -f "$CLOSED" ] && echo "ok   the cited sibling path resolves on disk" || { echo "FAIL sibling cited but $CLOSED is missing"; fail=1; }

# --- NEGATIVE plus its anti-vacuity arm.
exact "no bare <source>:<line> citation" "$(grep -cE '\.(rs|ts|tsx):[0-9]+' "$NEW" || true)" 0
PROBE="$(mktemp)"
printf 'the branch lives at src-tauri/src/main.rs:5801 today\nand at useStoreEmbedHost.ts:380\n' > "$PROBE"
exact "that negative gate CAN fire" "$(grep -cE '\.(rs|ts|tsx):[0-9]+' "$PROBE")" 2

# --- PRETTIER: measured, deliberately NOT a --check.
PI="$(npx prettier --file-info "$NEW" 2>/dev/null)"
printf '%s\n' "$PI"
if printf '%s' "$PI" | grep -Eq '"ignored":[[:space:]]*true'; then
  echo "ok   prettier IGNORES $NEW -- a --check over it would be VACUOUS and is deliberately NOT run"
else
  echo "FAIL prettier now SEES $NEW -- .prettierignore changed; add a real --check to this block"; fail=1
fi

# --- THE REAL GATE for this file's shape.
GOUT="$(mktemp)"
if pnpm planning-gates > "$GOUT" 2>&1; then echo "ok   pnpm planning-gates exit 0"; else echo "FAIL pnpm planning-gates"; fail=1; fi
tail -4 "$GOUT"
chk "todo-frontmatter-gate.py itself PASSed" "$(grep -cF '[PASS] .planning/todos/todo-frontmatter-gate.py' "$GOUT")" 1

# --- COMMIT. `git` output MATERIALISED before any grep: a fallible `git` in a
# non-final pipeline stage is swallowed, so a broken `git show` would read as
# "0 matches" and FALSELY PASS the `exact ... 0` assertion below.
NAMES="$(mktemp)"; SUBJ="$(mktemp)"
git show --name-only --format= HEAD > "$NAMES" || { echo "FAIL could not read HEAD's file list"; exit 1; }
git log -1 --format=%s > "$SUBJ" || { echo "FAIL could not read HEAD's subject"; exit 1; }
chk "HEAD subject carries the task id" "$(grep -c '261001-svm' "$SUBJ")" 1
chk "HEAD contains the new todo"       "$(grep -cF "$NEW" "$NAMES")" 1
exact "no source file in this commit"  "$(grep -cE '^(src|src-tauri)/' "$NAMES" || true)" 0

exit $fail
    </automated>
  </verify>
  <done>
The defect record exists at the planned `pending/` path; its frontmatter block
carries `severity: major`, `platform: macos`, `ready: code` bare and in that
adjacency, plus `created`/`title`/`area`/`files` with both source paths; its body
records all three measured paths, the 872 KB show-alone repaint, the
hidden-not-mis-positioned verdict, the Linux non-reproduction, both honest caveats
and the symbol-anchored mechanism with its `260930-blh` attribution; the
back-pointer to the sibling Task 1 closed resolves on disk; no bare source line
citation appears and the gate forbidding one is proven able to fire; the path is
measured prettier-ignored so no vacuous `--check` is carried; `pnpm planning-gates`
exits 0 with `todo-frontmatter-gate.py` named `[PASS]`; and one commit exists
naming the task id, containing the todo and no source file.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Make the show step shared in store_embed_open's existing-webview branch, and pin it structurally</name>
  <files>src-tauri/src/main.rs</files>
  <precondition>`git status --short src-tauri/src/main.rs` is empty, and `cd src-tauri && cargo check --bin gamelib-shell` exits 0 before any edit — the clippy ceiling and test count below are regression pins against the measured `7fa4b5fc1` baseline, so a pre-existing unstaged edit or a broken build would be attributed to this task.</precondition>
  <reversibility rating="reversible">A two-line statement move plus a comment rewrite plus one added `#[test]`, all inside one file. `git checkout -- src-tauri/src/main.rs` restores it exactly. The behaviour change is additive (a webview that was already visible is shown again, which is a no-op) and ships behind no flag, so a revert needs no migration.</reversibility>
  <behavior>
What the added structural test must assert, written before the edit so the
expectation is explicit rather than retrofitted. It reads `include_str!("main.rs")`,
bounds a slice to `store_embed_open`'s existing-webview branch, and proves:

- Test 1: within that slice the show call appears exactly once, and its line sits
  AFTER the closing brace of the `#[cfg(target_os = "linux")]` sub-block — i.e. it
  is unconditional and reachable on macOS.
- Test 2: within that slice the show call's line sits BEFORE the navigate call's
  line — ordering is the point; showing after navigating would leave the first
  paint on a hidden surface.
- Test 3: the Linux rect re-apply (`linux_store_embed_layout::apply_bounds`) is
  still INSIDE the cfg sub-block — the fix converges the show step without
  exporting the Linux rect handling to macOS.
- Test 4 (anti-vacuity, in the test's own assertions): the slice is non-empty and
  the cfg sub-block was actually located, so a boundary drift fails loudly rather
  than passing over an empty string.

It asserts STRUCTURE and says so in its own doc comment. It makes no claim about
native visibility: nothing in this crate can. The doc comment must also record the
RED-proof — the exact mutation that makes it fail (moving the show call back inside
the cfg block) — matching the discipline of
`open_external_command_body_calls_the_scheme_check_before_opening`, which records
its own mutation verbatim.
  </behavior>
  <action>
**3a — the fix, two lines of movement.** In `store_embed_open`'s existing-webview
branch (`if let Some(existing) = app.get_webview(STORE_EMBED_LABEL)`), lift the
`existing.show()` statement — including its
`.map_err(|e| format!("store_embed_open:show-failed:{e}"))?` tail, unchanged
character for character — OUT of the `#[cfg(target_os = "linux")]` braced block so
it sits between that block's closing brace and the `existing.navigate(url)`
statement. Leave everything inside the cfg block exactly as it is: the
`store_embed_linux_gtk_rect` call, its `replacen` error re-prefix, and the
`linux_store_embed_layout::apply_bounds` call all stay Linux-only.

The resulting order on Linux is unchanged in effect — rect re-apply, then show,
then navigate — and on macOS it becomes show, then navigate, which is the whole
fix.

**Do NOT add a macOS bounds re-apply.** This is a measured decision, not a
shortcut. `storeEmbedShow()` ALONE repainted the embed in CONTEXT.md's third row,
with no bounds flush, so macOS bounds are already correct on this path.
Re-applying a rect here would import the zero-rect hazard that Linux needed a
second guard for — `store_embed_linux_rect_is_zero_area`, which exists as a named
helper with its own test — onto a platform with no measured need for it.
Visibility is the entire measured defect; fix exactly that. If you believe a macOS
bounds re-apply is nonetheless required, stop and say so rather than adding it:
that would be a scope change needing a fresh live measurement.

**3b — the comment, which must end up accurate.** The branch's existing five-line
comment currently frames the whole block as Linux-only and contains a parenthetical
calling the macOS behaviour unaltered by the step below it. After the move that
parenthetical is false and must go. Rewrite the comment so it:

- keeps the `260930-blh` attribution and the mechanism it explains (the renderer
  remounts on every return to a store route and calls this function again, while
  the previous unmount left the embed hidden and, via the slot's ResizeObserver,
  moved to a zero rect on Linux);
- states that the **show step is shared across platforms**, with `2026-10-01` as
  the date the macOS gap was live-measured and this quick task id as the fix;
- states that the **rect re-apply remains Linux-only**, and why: macOS bounds were
  measured correct on this path, so re-applying a rect there would add the
  zero-rect hazard for no measured gain.

Keep it in the file's existing comment voice and under the surrounding line width.

**3c — the structural test.** Add one `#[test]` to `#[cfg(test)] mod tests`,
adjacent to the existing `store_embed_linux_*` tests, implementing the behavior block
above. Bound the slice the way the file's five existing `include_str!("main.rs")`
tests bound theirs: find the `store_embed_open` function signature, then end the
slice at the branch's `return Ok(Value::Null);`. **The bounding is load-bearing,
not tidiness** — the test's own source lives in this same file, so an unbounded
`.find()` could match the test's own text or a future unrelated mention and pass or
fail for the wrong reason. Say that in the doc comment, as the precedents do. Do
not add a `#[cfg(target_os = ...)]` attribute to the test: `include_str!` just
reads text, so it runs and must pass on every platform including Windows CI, which
is the same reasoning `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated`
records for itself.

**Do NOT invent a test that pretends to cover native visibility.** Measured: 31
`store_embed_*` test functions exist and every one is a wire-contract,
scheme-policy, nav-state or rect-arithmetic test over an `AppHandle`-free helper.
`store_embed_open` takes `&AppHandle` and is structurally unreachable from
`#[cfg(test)] mod tests`, exactly as the file's own comments already say of
`open_external`. The structural test above is the honest substitute and must
describe itself as such.

**3d — what NOT to run, each stated rather than silently skipped.**

- `cargo fmt` must NOT be run, and `cargo fmt -- --check` must NOT be gated on.
  Measured at `7fa4b5fc1`: `--check` exits 1 with 76 dirty hunks across this file,
  none in the store-embed region. Running the formatter would emit a 76-hunk diff
  unrelated to this task.
- `npx prettier` must NOT be run against this file. Measured: `--file-info` reports
  not-ignored but with a null parser, and `--check` exits 2 with a parser error.
  This is a third case beyond the two CLAUDE.md documents, and running it would red
  the verify block for a non-reason.
- Do not kill, restart, background or otherwise manage the live `tauri dev` rig.
  Saving this file triggers its automatic rebuild and relaunch, which is wanted —
  it is what makes the orchestrator's live run at Task 4 possible. That rebuild
  holds the cargo build lock, so your `cargo check` may print a
  blocking-on-file-lock notice and wait. Let it wait.

**3e — commit.** Commit the source change on its own. Subject line:
`fix(261001-svm): show the existing store embed on every platform before navigating`.
  </action>
  <verify>
    <automated>
set -u
fail=0
F=src-tauri/src/main.rs
chk() { [ "${2:-0}" -ge "$3" ] && echo "ok   $1 = ${2:-0} (>= $3)" || { echo "FAIL $1 = ${2:-0}, want >= $3"; fail=1; }; }
exact() { [ "${2:-0}" -eq "$3" ] && echo "ok   $1 = ${2:-0}" || { echo "FAIL $1 = ${2:-0}, want $3"; fail=1; }; }
atmost() { [ "${2:-0}" -le "$3" ] && echo "ok   $1 = ${2:-0} (<= $3)" || { echo "FAIL $1 = ${2:-0}, want <= $3"; fail=1; }; }

# --- COMMIT METADATA, materialised ONCE up front. `git` in a non-final pipeline
# stage is swallowed (the pipeline reports grep's status), so a broken `git show`
# would read as "0 matches" and FALSELY PASS the `exact ... 0` assertion at the end.
NAMES="$(mktemp)"; SUBJ="$(mktemp)"
git show --name-only --format= HEAD > "$NAMES" || { echo "FAIL could not read HEAD's file list"; exit 1; }
git log -1 --format=%s > "$SUBJ" || { echo "FAIL could not read HEAD's subject"; exit 1; }

# --- ANTI-VACUITY: a no-op edit must not report success.
if git diff HEAD --quiet -- "$F" && git diff --quiet -- "$F"; then
  if grep -qF "$F" "$NAMES"; then
    echo "ok   the edit is committed (clean tree against a HEAD that contains it)"
  else
    echo "FAIL no edit to $F present in the tree or in HEAD"; fail=1
  fi
else
  echo "ok   a real diff to $F exists"
fi

# --- BOUNDED SLICE of the existing-webview branch. Bounding is load-bearing: this
# file is ~18k lines and contains the test's own text plus many other `.show()`
# and cfg-linux sites, so an unbounded grep would answer about the wrong region.
SL="$(mktemp)"
awk '/^fn store_embed_open\(app: &AppHandle, args: &\[Value\]\) -> Result<Value, String> \{$/{inb=1}
     inb{print; n++}
     inb && /return Ok\(Value::Null\);/{exit}' "$F" > "$SL"
[ -s "$SL" ] && echo "ok   branch slice extracted ($(wc -l < "$SL" | tr -d ' ') lines)" || { echo "FAIL could not bound the existing-webview branch -- signature or return marker moved"; exit 1; }
atmost "slice is tight, not runaway" "$(wc -l < "$SL" | tr -d ' ')" 40

# Line numbers WITHIN the slice. `head -1` on each: the slice holds one of each.
cfg_open=$(grep -nF '#[cfg(target_os = "linux")]' "$SL" | head -1 | cut -d: -f1)
cfg_close=$(awk -v s="${cfg_open:-0}" 'NR>s && /^        \}$/{print NR; exit}' "$SL")
show_ln=$(grep -nF '.show()' "$SL" | head -1 | cut -d: -f1)
nav_ln=$(grep -nF '.navigate(url)' "$SL" | head -1 | cut -d: -f1)
bounds_ln=$(grep -nF 'linux_store_embed_layout::apply_bounds' "$SL" | head -1 | cut -d: -f1)
echo "     slice line map: cfg_open=${cfg_open:-?} cfg_close=${cfg_close:-?} show=${show_ln:-?} navigate=${nav_ln:-?} apply_bounds=${bounds_ln:-?}"
for v in cfg_open cfg_close show_ln nav_ln bounds_ln; do
  eval "val=\${$v:-}"
  [ -n "$val" ] || { echo "FAIL could not locate $v in the slice"; fail=1; }
done

# THE FIX ITSELF, as three ordering facts.
exact "exactly one show call in the branch" "$(grep -cF '.show()' "$SL")" 1
[ "${show_ln:-0}" -gt "${cfg_close:-0}" ] && echo "ok   the show call is AFTER the cfg block closes -- unconditional, macOS-reachable" || { echo "FAIL the show call is still inside the #[cfg(target_os = \"linux\")] block"; fail=1; }
[ "${show_ln:-0}" -lt "${nav_ln:-0}" ] && echo "ok   the show call PRECEDES the navigate call" || { echo "FAIL show does not precede navigate -- the first paint would land on a hidden surface"; fail=1; }
[ "${bounds_ln:-0}" -gt "${cfg_open:-0}" ] && [ "${bounds_ln:-0}" -lt "${cfg_close:-0}" ] && echo "ok   the Linux rect re-apply stays INSIDE the cfg block" || { echo "FAIL the Linux rect re-apply left its cfg block"; fail=1; }

# The error string is preserved verbatim, and no macOS bounds re-apply crept in.
exact "show error string preserved"        "$(grep -cF 'store_embed_open:show-failed:' "$SL")" 1
exact "navigate error string preserved"    "$(grep -cF 'store_embed_open:navigate-failed:' "$SL")" 1
exact "exactly one cfg-linux block here"   "$(grep -cF '#[cfg(target_os = "linux")]' "$SL")" 1
exact "no second rect conversion added"    "$(grep -cF 'store_embed_linux_gtk_rect' "$SL")" 1

# THE COMMENT must be accurate. The false parenthetical is gone; the new facts are in.
exact "the stale macOS parenthetical is gone" "$(grep -cF '(the macOS behaviour, unchanged below)' "$SL" || true)" 0
PROBE="$(mktemp)"
printf '%s\n' '// rect this call carries (the macOS behaviour, unchanged below) and show it' > "$PROBE"
exact "that negative gate CAN fire" "$(grep -cF '(the macOS behaviour, unchanged below)' "$PROBE")" 1
chk "comment keeps the 260930-blh attribution" "$(grep -cF '260930-blh' "$SL")" 1
chk "comment records the macOS measurement date" "$(grep -cF '2026-10-01' "$SL")" 1
chk "comment names this fix"                     "$(grep -cF '261001-svm' "$SL")" 1

# --- THE STRUCTURAL TEST exists, is bounded, and documents its own RED-proof.
chk "a store_embed_open structural test was added" "$(grep -cE '^\s+fn store_embed_open_.*(show|visib|platform)' "$F")" 1
chk "it reads the file as source"                  "$(grep -cF 'include_str!("main.rs")' "$F")" 6

# --- CARGO. The dev rig may hold the build lock while it rebuilds after your save;
# a blocking-on-file-lock notice here is expected and resolves on its own. Do not
# interrupt it, and do not manage the dev process.
( cd src-tauri && cargo check --bin gamelib-shell ) && echo "ok   cargo check exit 0" || { echo "FAIL cargo check"; fail=1; }

CL="$(mktemp)"
( cd src-tauri && cargo clippy --bin gamelib-shell ) > "$CL" 2>&1 && echo "ok   cargo clippy exit 0" || { echo "FAIL cargo clippy"; fail=1; }
# Ceiling, not a floor: baseline measured 15 warnings at 7fa4b5fc1. A new warning
# from this edit pushes it to 16 and reds here.
CLW="$(grep -oE 'generated [0-9]+ warning' "$CL" | head -1 | grep -oE '[0-9]+' || echo 0)"
atmost "clippy warnings at or below the measured baseline" "$CLW" 15

CT="$(mktemp)"
( cd src-tauri && cargo test --bin gamelib-shell ) > "$CT" 2>&1 && echo "ok   cargo test exit 0" || { echo "FAIL cargo test"; fail=1; tail -30 "$CT"; }
tail -2 "$CT"
# 303 at 7fa4b5fc1 + the one structural test = 304. Pinned EXACTLY, because the
# count rising by anything other than one means a test was added or lost silently.
exact "cargo test passes exactly 304"  "$(grep -oE '[0-9]+ passed' "$CT" | head -1 | grep -oE '[0-9]+')" 304
exact "cargo test has zero failures"   "$(grep -oE '[0-9]+ failed' "$CT" | head -1 | grep -oE '[0-9]+')" 0
# The new test must actually have RUN -- a `#[cfg]`-gated or mis-filed test that
# never executes would leave the count short and this names which one.
chk "the new structural test ran" "$(grep -cE '^test tests::store_embed_open_.*(show|visib|platform).* \.\.\. ok$' "$CT")" 1

# --- NOT RUN, deliberately. `cargo fmt -- --check` is dirty at HEAD (76 hunks,
# none in this region) and `npx prettier` has no Rust parser and exits 2 on this
# path. Both are recorded in key_links; neither is a gate. Asserted here so the
# omission is visible rather than silent:
echo "note prettier and rustfmt are deliberately NOT gated on $F -- see this plan's key_links for the measurements"

# --- COMMIT. Read from the metadata materialised at the top of this block.
chk "HEAD subject carries the task id"  "$(grep -c '261001-svm' "$SUBJ")" 1
chk "HEAD contains the Rust source"     "$(grep -cF "$F" "$NAMES")" 1
exact "no planning file in this commit" "$(grep -cE '^\.planning/todos/' "$NAMES" || true)" 0

exit $fail
    </automated>
  </verify>
  <done>
The show call in `store_embed_open`'s existing-webview branch is outside the
`#[cfg(target_os = "linux")]` block and precedes the navigate call, with its
`store_embed_open:show-failed:` error string unchanged; the Linux rect re-apply is
still inside that cfg block and no macOS bounds re-apply was added; the branch
comment no longer carries the false macOS parenthetical and does carry the
`260930-blh` attribution, the `2026-10-01` measurement date and this task id; a
bounded-slice structural `#[test]` pins the move and documents both its bounding
rationale and its RED-proof mutation; `cargo check` and `cargo clippy` exit 0 with
clippy at or below its measured 15-warning baseline; `cargo test --bin
gamelib-shell` reports exactly 304 passed and 0 failed with the new test named in
the output; and one `fix(` commit carries the source file and no todo file.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking-human">
  <name>Task 4: Live confirmation on macOS that the embed repaints on a return to a store route</name>
  <files>.planning/quick/261001-svm-close-epic-panel-gate-file-macos-embed/261001-svm-LIVE.md</files>
  <what-built>
Task 3 lifted the `existing.show()` call in `store_embed_open`'s existing-webview
branch out of its `#[cfg(target_os = "linux")]` sub-block, so it now runs on macOS
too, before `existing.navigate(url)`. The Linux rect re-apply stayed cfg-gated and
no macOS bounds re-apply was added. A bounded-slice source-shape `#[test]` pins the
move; `cargo check` and `cargo clippy` exit 0 and `cargo test --bin gamelib-shell`
reports 304 passed / 0 failed.

What that CANNOT tell anyone: whether the embed actually repaints. A compile and a
structural grep cannot see a pixel, and no unit test in this crate can reach
`show()` — `store_embed_open` takes `&AppHandle`. The whole measured defect was a
visibility symptom, so the only verification that closes it is a live one.

The standing rig has already rebuilt and relaunched itself from Task 3's save,
because `tauri dev` watches `src-tauri/`.
  </what-built>
  <how-to-verify>
**STOP. This task is NOT executable by an agent and must not be self-answered.**

The live post-fix run belongs to the ORCHESTRATING session, which owns the standing
rig: a `pnpm tauri dev` instance driven from the docked Web Inspector console. No
executor command in this plan asserts, implies or infers the live outcome, and none
may be added that does.

This repo has a measured failure mode of auto-mode fabricating a human-verify
outcome. The plan's `autonomous: false` frontmatter is the countermeasure. Do not
flip it, do not approve this checkpoint on the strength of Task 3's green cargo
gates, and do not substitute a screenshot taken by an executor.

**What the orchestrator runs**, mirroring CONTEXT.md's Finding 2 table so the
before and after are the same measurement:

1. Confirm the rig picked up the rebuild (the relaunched shell is a new pid).
2. From `/library`, drive to the GOG store route. The embed should paint — this is
   the first-entry path, which was never broken, and it is the positive control.
3. Leave the route, then return to the GOG store route a SECOND time. Pre-fix this
   was a black slot that stayed black at +12 s. Capture and read as an image.
4. Drive GOG store route -> Epic store route -> GOG store route. Pre-fix this was
   a black slot that stayed black at +5 s. Capture and read as an image.
5. Confirm the Epic unavailable panel is still clean on the intermediate Epic step
   — the fix must not resurrect the symptom Task 1 just refuted. This is the
   regression check that matters most, because the fix makes a show call reachable
   on macOS that previously was not.

**What the orchestrator records**, into
`.planning/quick/261001-svm-close-epic-panel-gate-file-macos-embed/261001-svm-LIVE.md`,
because Task 5 reads this file and branches on it:

- A line of its own, at column 0, reading exactly `verdict: confirmed` or
  `verdict: not-confirmed`. Bare, lowercase, one word, nothing before it on the
  line — Task 5 gates on that anchored form, and prose ahead of the word would hide
  it the same way bolded prose hid five UAT results in this repo. Put it near the
  top so a human reads it first; the gate finds the first matching line wherever it
  sits, so a frontmatter block above it is fine.
- The date, the pid of the relaunched shell, and per step: what was driven, what
  was captured, and what the image showed.
- For step 5 explicitly: whether any native content appeared over the Epic
  unavailable panel.
- Frames stay in the session scratchpad and are NOT committed: the GOG page is
  signed in and the frames carry account UI.

**If the verdict is `not-confirmed`**, that is a legitimate outcome and not a
failure of this plan. Task 5 has an explicit arm for it which leaves the todo open.
Record what was actually seen and hand back.
  </how-to-verify>
  <resume-signal>
Write `261001-svm-LIVE.md` with its bare lowercase `verdict:` line, then resume.
Reply "confirmed" if the embed repainted on both return paths AND the Epic panel
stayed clean at step 5; "not-confirmed" plus what was seen if either failed. Do not
reply "approved" — this checkpoint records an outcome, it does not grant one, and
Task 5 reads the file rather than the reply.
  </resume-signal>
  <verify>
    <human-check>
The orchestrator has run the five steps above on the standing macOS rig and written
`261001-svm-LIVE.md` with a column-0 `verdict: confirmed` or `verdict: not-confirmed`
line, the relaunched pid as a number, and a per-step record including whether any
native content appeared over the Epic unavailable panel at step 5.
    </human-check>
    <automated>
set -u
fail=0
LIVE=.planning/quick/261001-svm-close-epic-panel-gate-file-macos-embed/261001-svm-LIVE.md
# This block checks ONLY that the orchestrator's record exists and is machine-
# readable. It does NOT and cannot check the live outcome -- that is the point of
# the checkpoint. It must never be extended into an outcome assertion.
[ -f "$LIVE" ] && echo "ok   the live record exists" || { echo "FAIL $LIVE missing -- the checkpoint has not been answered by the orchestrator"; exit 1; }
V="$(grep -m1 -oE '^verdict: (confirmed|not-confirmed)$' "$LIVE" || true)"
[ -n "$V" ] && echo "ok   machine-readable verdict present: $V" || { echo "FAIL no bare lowercase 'verdict: confirmed|not-confirmed' line in $LIVE"; fail=1; }
grep -qiE 'epic' "$LIVE" && echo "ok   the Epic-panel regression step is recorded" || { echo "FAIL $LIVE does not record step 5 (the Epic-panel regression check)"; fail=1; }
# `pid` ADJACENT TO A NUMBER, never a bare substring match: 'rapid' contains 'pid'
# and would pass a looser pattern over prose that records no pid at all.
grep -qiE 'pid[^0-9]{0,4}[0-9]{3,}' "$LIVE" && echo "ok   the relaunched pid is recorded with a number" || { echo "FAIL $LIVE does not record the relaunched shell pid"; fail=1; }
exit $fail
    </automated>
  </verify>
  <done>
`261001-svm-LIVE.md` exists carrying a column-0, bare, lowercase
`verdict: confirmed` or `verdict: not-confirmed` line, the relaunched shell pid as a
number, and a per-step record that includes whether any native content appeared over
the Epic unavailable panel. The verdict was produced by the orchestrator on live
hardware, not inferred from Task 3's cargo gates.
  </done>
</task>

<task type="auto">
  <name>Task 5: Record the fix and the live result on the defect todo, closing it only if the live run confirmed</name>
  <files>.planning/todos/pending/2026-10-01-macos-store-embed-stays-hidden-on-every-return-to-a-store-route.md, .planning/todos/completed/2026-10-01-macos-store-embed-stays-hidden-on-every-return-to-a-store-route.md</files>
  <precondition>`.planning/quick/261001-svm-close-epic-panel-gate-file-macos-embed/261001-svm-LIVE.md` exists and its first `verdict:` line reads exactly `verdict: confirmed` or `verdict: not-confirmed` — Task 4 is a blocking checkpoint and this task must read its recorded outcome, never assume it.</precondition>
  <reversibility rating="reversible">An appended section plus, on one arm, a `git mv` under `.planning/`.</reversibility>
  <action>
Read `261001-svm-LIVE.md` FIRST and take the arm its verdict names. Do not decide
the arm from Task 3's green cargo gates.

**Both arms append the same fix record** to the defect todo — a section headed
`## Fixed 2026-10-01 (quick task 261001-svm)` — carrying:

- **What changed:** the show call in `store_embed_open`'s existing-webview branch
  was lifted out of its `target_os = "linux"` cfg block so it runs on every
  supported platform before the navigate call, with its existing error string
  unchanged. Name the symbols, not line numbers.
- **What deliberately did NOT change, and why it is a measurement:** no macOS
  bounds re-apply was added, because `storeEmbedShow()` alone repainted the embed
  with no bounds flush, so macOS bounds were already correct on this path. Adding
  one would import the zero-rect hazard that Linux needed `store_embed_linux_rect_is_zero_area`
  to contain, onto a platform with no measured need for it.
- **That the two platforms now CONVERGE** on the show step while the rect re-apply
  stays Linux-only, and that the branch comment was corrected — it previously
  carried a parenthetical calling the macOS behaviour unaltered, which the fix
  makes false.
- **How it is pinned, and the limit of that pin:** a bounded-slice source-shape
  `#[test]` asserts the show call is outside the cfg block and precedes the
  navigate call. State plainly that it pins STRUCTURE and not native visibility,
  and that this is a limitation rather than an oversight: 31 `store_embed_*` tests
  exist and every one is over an `AppHandle`-free helper, because
  `store_embed_open` takes `&AppHandle` and is structurally unreachable from the
  test module. Record the desk baselines that did hold — `cargo check` and
  `cargo clippy` exit 0 with clippy at its 15-warning baseline, and `cargo test`
  at 304 passed / 0 failed.
- **The live result, quoted from `261001-svm-LIVE.md` rather than paraphrased
  loosely:** the verdict word, the per-step outcomes, and the step-5 finding on
  whether any native content appeared over the Epic unavailable panel. Note that
  frames are not committed because the GOG page is signed in.

**ARM A — `verdict: confirmed`.** Close the todo.

Same ordering trap as Task 1: `git mv` the file from `pending/` to
`.planning/todos/completed/` keeping the filename byte-identical, THEN append the
fix record at the new path, THEN `git add` that path, THEN read the index back with
`git show :<new path>`. Leave the frontmatter triad exactly as filed — `completed/`
is outside the frontmatter gate's scope and a closed todo needs no re-triage.

**ARM B — `verdict: not-confirmed`.** Do NOT move the file. This is a legitimate
outcome, not a failure to paper over.

Append the fix record to the file where it sits in `pending/`, with the live result
stated as what it is: the structural change landed and the symptom did not clear,
so the mechanism read from source was incomplete. Change `ready: code` to
`ready: live-gate` if the next step needs another live run, or leave it `code` if
the live record points at a further source-level cause — use the project's own
definitions, keep the value bare and lowercase, and keep the key in its existing
position so the adjacency rule still holds. Then HALT and hand back to the
orchestrator with what the live record said. Do not attempt a second fix in this
task: a second theory deserves its own measurement, and the plan's scope ends here.

**Then commit, on either arm.** Stage the todo path(s) and this quick task's
directory in the same invocation as the gate run, then commit. Subject line on arm
A: `docs(261001-svm): close the macOS store-embed-hidden todo with the fix and live result`.
On arm B: `docs(261001-svm): record the fix and an unconfirmed live result on the macOS embed todo`.

**STATE.md is deliberately NOT touched by this plan,** stated rather than silently
skipped: the `/gsd-quick` orchestrator owns the Quick Tasks table row and the
narrative fields, whose double-quoted form rejects any `"` character and whose
append helper is known to refuse this table's ragged row shapes.

**`graphify update .` IS wanted here**, unlike in the doc-only tasks: Task 3 changed
Rust source inside a function the graph indexes. Run it once, after the final
commit, and note the result.
  </action>
  <verify>
    <automated>
set -u
fail=0
PEND=.planning/todos/pending/2026-10-01-macos-store-embed-stays-hidden-on-every-return-to-a-store-route.md
COMP=.planning/todos/completed/2026-10-01-macos-store-embed-stays-hidden-on-every-return-to-a-store-route.md
LIVE=.planning/quick/261001-svm-close-epic-panel-gate-file-macos-embed/261001-svm-LIVE.md
chk() { [ "${2:-0}" -ge "$3" ] && echo "ok   $1 = ${2:-0} (>= $3)" || { echo "FAIL $1 = ${2:-0}, want >= $3"; fail=1; }; }
exact() { [ "${2:-0}" -eq "$3" ] && echo "ok   $1 = ${2:-0}" || { echo "FAIL $1 = ${2:-0}, want $3"; fail=1; }; }

# --- WHICH ARM. Read from the orchestrator's record, never guessed.
[ -f "$LIVE" ] || { echo "FAIL $LIVE missing -- Task 4 was not answered"; exit 1; }
VERDICT="$(grep -m1 -oE '^verdict: (confirmed|not-confirmed)$' "$LIVE" | awk '{print $2}')"
[ -n "${VERDICT:-}" ] || { echo "FAIL no machine-readable verdict in $LIVE"; exit 1; }
echo "     arm selected from the live record: $VERDICT"

if [ "$VERDICT" = "confirmed" ]; then
  TARGET="$COMP"
  [ ! -e "$PEND" ] && echo "ok   ARM A: pending copy gone" || { echo "FAIL ARM A: $PEND still present"; fail=1; }
  [ -f "$COMP" ] && echo "ok   ARM A: completed copy exists" || { echo "FAIL ARM A: $COMP missing"; exit 1; }
  [ "$(basename "$PEND")" = "$(basename "$COMP")" ] && echo "ok   ARM A: filename byte-identical across the move" || { echo "FAIL ARM A: filename changed"; fail=1; }
  FOL="$(mktemp)"
  git log --follow --format=%h -- "$COMP" > "$FOL" || { echo "FAIL could not read --follow history"; fail=1; }
  chk "ARM A: --follow history reaches pre-move revisions" "$(wc -l < "$FOL" | tr -d ' ')" 2
  exact "ARM A: the todo is gone from pending/" "$(ls .planning/todos/pending/*.md | grep -c 'macos-store-embed-stays-hidden' || true)" 0
else
  TARGET="$PEND"
  [ -f "$PEND" ] && echo "ok   ARM B: the todo correctly STAYED in pending/" || { echo "FAIL ARM B: $PEND missing -- an unconfirmed fix must not close the todo"; exit 1; }
  [ ! -e "$COMP" ] && echo "ok   ARM B: nothing was moved to completed/" || { echo "FAIL ARM B: $COMP exists -- the todo was closed on an unconfirmed live result"; fail=1; }
  # The triad must still be present and bare, whatever `ready:` was set to.
  FM="$(mktemp)"
  awk 'NR==1 && $0=="---"{inb=1;next} inb && $0=="---"{exit} inb{print}' "$PEND" > "$FM"
  exact "ARM B: severity still bare"  "$(grep -cE '^severity: (critical|major|medium|minor)$' "$FM")" 1
  exact "ARM B: platform still bare"  "$(grep -cE '^platform: (macos|windows|linux|any)$' "$FM")" 1
  exact "ARM B: ready still bare"     "$(grep -cE '^ready: (code|live-gate|human|blocked)$' "$FM")" 1
  sv=$(grep -nE '^severity:' "$FM" | head -1 | cut -d: -f1)
  pf=$(grep -nE '^platform:' "$FM" | head -1 | cut -d: -f1)
  rd=$(grep -nE '^ready:'    "$FM" | head -1 | cut -d: -f1)
  [ "${pf:-0}" -eq $(( ${sv:-0} + 1 )) ] && [ "${rd:-0}" -eq $(( ${pf:-0} + 1 )) ] && echo "ok   ARM B: triad adjacency preserved" || { echo "FAIL ARM B: triad adjacency broken (${sv:-?}/${pf:-?}/${rd:-?})"; fail=1; }
fi

# --- THE FIX RECORD, read from the INDEX so the git mv trap cannot hide it.
STAGED="$(mktemp)"
if git show ":$TARGET" > "$STAGED" 2>/dev/null; then echo "ok   $TARGET is in the index"; else echo "FAIL $TARGET not staged"; exit 1; fi
# ANTI-VACUITY: the staged blob must differ from the file as Task 2 committed it.
# Resolved from history rather than pinned to a sha, because Task 2's commit is
# created by this same run. Materialised before `tail`, so a failed `git log` is
# distinguishable from a genuinely empty history.
HIST="$(mktemp)"
git log --follow --format=%H -- "$TARGET" > "$HIST" || { echo "FAIL could not read --follow history for $TARGET"; exit 1; }
T2="$(tail -1 "$HIST")"
HB="$(mktemp)"
if [ -n "${T2:-}" ] && git show "$T2:$PEND" > "$HB" 2>/dev/null; then
  if cmp -s "$HB" "$STAGED"; then echo "FAIL index identical to the as-filed content -- the fix record is UNSTAGED"; fail=1
  else echo "ok   index differs from the as-filed content ($(wc -l < "$HB" | tr -d ' ') -> $(wc -l < "$STAGED" | tr -d ' ') lines)"; fi
else
  echo "FAIL could not resolve the as-filed revision -- anti-vacuity arm did not run"; fail=1
fi

# The original defect record must survive underneath the fix record.
chk "the measured symptom table survives" "$(grep -cF '/store/epic' "$STAGED")" 1
chk "the 872 KB repaint figure survives"  "$(grep -cF '872' "$STAGED")" 1
chk "the 260930-blh attribution survives" "$(grep -cF '260930-blh' "$STAGED")" 1

chk "fix heading names the task"               "$(grep -cF 'quick task 261001-svm' "$STAGED")" 1
chk "the moved call is named by symbol"        "$(grep -cF 'store_embed_open' "$STAGED")" 1
chk "the cfg guard is named"                   "$(grep -cF 'target_os = "linux"' "$STAGED")" 1
chk "no-macOS-bounds decision recorded"        "$(grep -cF 'store_embed_linux_rect_is_zero_area' "$STAGED")" 1
chk "convergence stated"                       "$(grep -ciE 'converg' "$STAGED")" 1
chk "structural-pin limitation stated"         "$(grep -ciE 'structur' "$STAGED")" 1
chk "AppHandle unreachability stated"          "$(grep -cF 'AppHandle' "$STAGED")" 1
chk "the 304-test desk baseline recorded"      "$(grep -cF '304' "$STAGED")" 1
chk "the live verdict is quoted"               "$(grep -cF "$VERDICT" "$STAGED")" 1
chk "the Epic-panel regression step recorded"  "$(grep -ciE 'epic' "$STAGED")" 1
chk "frames-not-committed rationale recorded"  "$(grep -ciE 'not committed|signed in|account UI' "$STAGED")" 1

# --- NEGATIVE plus its anti-vacuity arm.
exact "no bare <source>:<line> citation" "$(grep -cE '\.(rs|ts|tsx):[0-9]+' "$STAGED" || true)" 0
PROBE="$(mktemp)"
printf 'the branch lives at src-tauri/src/main.rs:5801 today\n' > "$PROBE"
exact "that negative gate CAN fire" "$(grep -cE '\.(rs|ts|tsx):[0-9]+' "$PROBE")" 1

# --- PRETTIER: measured, deliberately NOT a --check, on the path actually written.
PI="$(npx prettier --file-info "$TARGET" 2>/dev/null)"
printf '%s\n' "$PI"
if printf '%s' "$PI" | grep -Eq '"ignored":[[:space:]]*true'; then
  echo "ok   prettier IGNORES $TARGET -- a --check over it would be VACUOUS and is deliberately NOT run"
else
  echo "FAIL prettier now SEES $TARGET -- .prettierignore changed; add a real --check"; fail=1
fi

# --- GATES and the final tree state.
chk "pending/ is non-empty" "$(ls .planning/todos/pending/*.md | wc -l | tr -d ' ')" 1
GOUT="$(mktemp)"
if pnpm planning-gates > "$GOUT" 2>&1; then echo "ok   pnpm planning-gates exit 0"; else echo "FAIL pnpm planning-gates"; fail=1; fi
tail -4 "$GOUT"
chk "todo-frontmatter-gate.py PASSed"      "$(grep -cF '[PASS] .planning/todos/todo-frontmatter-gate.py' "$GOUT")" 1
chk "planning-envelope-tag-gate.py PASSed" "$(grep -cF '[PASS] .planning/planning-envelope-tag-gate.py' "$GOUT")" 1

# The Rust fix must still be in the tree -- this task must not have reverted it.
( cd src-tauri && cargo check --bin gamelib-shell ) && echo "ok   cargo check still exit 0" || { echo "FAIL cargo check"; fail=1; }

# --- COMMIT. `git` output MATERIALISED before any grep: a fallible `git` in a
# non-final pipeline stage is swallowed, so a broken `git show` would read as
# "0 matches" and FALSELY PASS the STATE.md assertion below.
NAMES="$(mktemp)"; SUBJ="$(mktemp)"
git show --name-only --format= HEAD > "$NAMES" || { echo "FAIL could not read HEAD's file list"; exit 1; }
git log -1 --format=%s > "$SUBJ" || { echo "FAIL could not read HEAD's subject"; exit 1; }
chk "HEAD subject carries the task id"  "$(grep -c '261001-svm' "$SUBJ")" 1
chk "HEAD contains the written todo"    "$(grep -cF "$TARGET" "$NAMES")" 1
exact "STATE.md untouched by this plan" "$(grep -cF '.planning/STATE.md' "$NAMES" || true)" 0

exit $fail
    </automated>
  </verify>
  <done>
The arm taken matches the verdict recorded by the orchestrator in
`261001-svm-LIVE.md`, read rather than assumed. The defect todo carries a fix
record in the git INDEX naming the moved call by symbol, the cfg guard, the
deliberate absence of a macOS bounds re-apply with its zero-area-helper reasoning,
the convergence, the structural-pin limitation and its `AppHandle` cause, the
304-test desk baseline, the quoted live verdict, the Epic-panel regression finding
and the frames-not-committed rationale — with the original defect record intact
underneath and the staged blob proven to differ from the as-filed content. On the
confirmed arm the todo is in `completed/` with a byte-identical filename and
`git log --follow` reaching pre-move history; on the unconfirmed arm it is still in
`pending/` with a bare, adjacent triad and nothing in `completed/`.
`pnpm planning-gates` exits 0, `cargo check` still exits 0, the commit names the
task id and does not touch STATE.md, and `graphify update .` has been run.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer -> Rust shell (`store_embed_open` RPC) | Pre-existing and unchanged in shape by this plan. The branch edited is reached by an already-authenticated in-process RPC from the app's own renderer; this plan adds no argument, no new arm, and no new caller. Its only effect is that an existing webview whose label already resolved is made visible before the navigate it was already going to receive. |
| embed -> web (store origins) | Pre-existing and untouched. `store_embed_navigation_policy` and its default-deny arm are not modified; the embed's scheme allowlist, blocked `gamelib` scheme and `steam` handoff all remain as they are. Making the webview visible does not widen what it may navigate to. |

## STRIDE Threat Register

ASVS level 1, blocking `high`. Four rows apply.

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-svm-SC | Tampering | npm/pip/cargo installs | high | mitigate | No package-manager install task exists in this plan. `npx prettier`, `pnpm planning-gates`, `cargo check`, `cargo clippy` and `cargo test` all resolve to already-installed, lockfile- and toolchain-pinned local binaries (prettier 3.7.4, cargo 1.94.1, clippy 0.1.94, python3 — all verified at `7fa4b5fc1`) and must not be allowed to fetch. No `Cargo.toml` or `package.json` dependency changes. If any step would install a package, stop and route it through the package-legitimacy gate behind a blocking human checkpoint — never auto-approve. |
| T-svm-01 | Information disclosure | the measurement captures behind CONTEXT.md and `261001-svm-LIVE.md` | medium | mitigate | The frames behind Finding 1, Finding 2 and the Task 4 live run were taken from a **signed-in** GOG store page and carry account UI. They stay in the measuring session's scratchpad and must not be committed, pasted into any todo, or embedded as images — the written record carries byte sizes, frame counts and read-as-image verdicts instead, which is all the closure needs. Tasks 1, 4 and 5 each state the non-commit and its reason, and no task copies or references a capture path. Same class of leak this repo measured twice when a direct binary run under the real `HOME` wrote genuine GOG session fields into a scratchpad log. |
| T-svm-02 | Information disclosure | the newly reachable `show()` on macOS | low | accept | Making the existing embed visible shows the user content from an origin they themselves navigated to, in a webview that already existed under `STORE_EMBED_LABEL` and was already about to be navigated. There is no new origin, no new credential surface and no cross-origin read: the pre-existing `store_embed_navigation_policy` still governs where it may go. The one adjacent risk — the embed becoming visible where a panel should cover it — is precisely the symptom Task 1 refuted, and Task 4 step 5 re-checks it on the fixed build rather than assuming the refutation carries across the change. Accepted because the exposure is the user's own navigation, made visible as designed. |
| T-svm-03 | Denial of service | the shared `show()` error path | low | accept | `show()` now returns its error on macOS where previously it could not be called, so a failing `show()` turns an open into a `store_embed_open:show-failed:` error instead of a silent hidden embed. That is strictly better observability, and the failure is bounded: the error string is already defined, already returned on Linux, and already handled by the renderer's `logNavCallFailure` path. No retry loop, no unbounded work and no new handle is introduced, so the sidecar's stdin-owned exit contract is unaffected. Accepted. |
</threat_model>

<verification>
1. The code fix is verified by ORDER within a bounded slice — the show call after
   the cfg block's closing brace, before the navigate call, with the rect re-apply
   still inside — not by a whole-file grep. The slice is bounded to
   `store_embed_open`'s existing-webview branch and its length is capped, because
   this file is ~18k lines and contains many other `.show()` and cfg-linux sites
   plus the new test's own text.
2. The fix is pinned permanently by a bounded-slice source-shape `#[test]` in the
   discipline of the five `include_str!("main.rs")` tests already in the file,
   which run on every platform including Windows CI. It pins STRUCTURE and says so.
   No test is invented to pretend native visibility is covered: measured, 31
   `store_embed_*` tests all sit over `AppHandle`-free helpers because
   `store_embed_open` takes `&AppHandle`.
3. The five existing source-shape tests are measured unable to be red by this edit
   — each bounds its slice to an unrelated region (`open_external`'s body, the
   `keyring_available` arm, the cookie-reading call sites, and two epic
   cookie-clear branches) and this edit adds no cookie call and no new cfg block.
4. Cargo baselines are pinned against measurements taken at `7fa4b5fc1`: `check`
   exit 0; `clippy` exit 0 with a CEILING of 15 warnings (so a new warning reds);
   `test --bin gamelib-shell` at EXACTLY 304 passed / 0 failed (303 baseline plus
   the one added test), with the new test additionally asserted BY NAME in the
   output so a `#[cfg]`-gated or mis-filed test that never runs cannot pass.
5. `cargo fmt` is NOT run and `cargo fmt -- --check` is NOT gated: measured exit 1
   with 76 dirty hunks at HEAD, none in the edited region. Recorded with its own
   second trap — a piped `--check` reports the pipeline's last status, not
   rustfmt's.
6. `npx prettier` is NOT run against the `.rs` path: measured `ignored: false` with
   `inferredParser: null`, and `--check` exits 2 with a parser error. A third case
   beyond the two CLAUDE.md documents.
7. The four `.planning/` paths ARE handled by prettier measurement rather than a
   vacuous `--check`: each reports `ignored: true`, asserted with a space-tolerant
   pattern, so the vacuity is checked and a `.prettierignore` change reds it.
8. The `git mv` trap is gated at the INDEX via `git show :<path>` in both close
   tasks, each with an anti-vacuity arm proving the staged blob differs from the
   pre-task content — against the fixed revision `7fa4b5fc1` in Task 1, and against
   the as-filed revision resolved from `git log --follow` in Task 5, since Task 2's
   commit is created by this same run.
9. `git log --follow` is asserted to reach at least two revisions through each
   moved path, which is the actual reason the moves are `git mv`.
10. Both negative gates (`no bare <source>:<line> citation`, and the stale macOS
    parenthetical) carry anti-vacuity probes proving the pattern matches the exact
    spelling being forbidden.
11. The live confirmation is a BLOCKING human checkpoint whose own automated block
    checks only that the orchestrator's record exists and is machine-readable. It
    asserts nothing about the outcome, by design, and must not be extended to.
    `autonomous: false` is the countermeasure against this repo's measured
    auto-mode fabrication of human-verify outcomes.
12. Task 5 BRANCHES on the recorded verdict and each arm has its own invariants —
    confirmed requires the move and an empty `pending/` slot; not-confirmed
    requires the file to have STAYED in `pending/` with nothing in `completed/` and
    a bare, adjacent triad. Neither arm can pass vacuously and the unconfirmed arm
    cannot be papered over as a success.
13. Census gates are relational, not absolute. Figures at `7fa4b5fc1`: `pending/`
    10 files, `completed/` 267; after this plan 9/269 confirmed or 10/268
    unconfirmed. Recorded as measurements, deliberately not pinned, for the reason
    `todo-frontmatter-gate.py` gives in its own docstring.
14. `pnpm codecheck`, `pnpm lint`, `pnpm lint-translations` and `npx jest` are
    deliberately NOT run, each with its reason: no TypeScript, no `meta/` file and
    no locale catalogue is touched by any task. `graphify update .` IS run, once, at
    the end of Task 5, because Task 3 changed indexed Rust source.
15. STATE.md is asserted ABSENT from every commit. The `/gsd-quick` orchestrator
    owns the Quick Tasks row and the double-quoted narrative fields.
</verification>

<success_criteria>
- The Epic-panel live gate is CLOSED by its own criteria, at exactly the width it
  was measured: post-CR-01-fix, dev/debug build, pre-fix state named as never run,
  both readings of what CR-01 did left open. The positive control is recorded
  alongside the negative result.
- The macOS defect is filed as a `major` / `macos` / `code` record carrying all
  three measured paths, the show-alone repaint that proves it is hidden rather than
  mis-positioned, the Linux non-reproduction, the symbol-anchored mechanism and the
  `260930-blh` attribution.
- `store_embed_open`'s existing-webview branch shows the embed on EVERY supported
  platform before navigating it, with the Linux rect re-apply still cfg-gated and
  NO macOS bounds re-apply added. The branch comment is accurate about which half
  is platform-specific and records the 2026-10-01 measurement.
- A bounded-slice structural `#[test]` makes the convergence impossible to lose
  silently, and is honest that it proves structure and not pixels.
- `cargo check` and `cargo clippy` exit 0 with clippy at or below 15 warnings, and
  `cargo test --bin gamelib-shell` reports exactly 304 passed / 0 failed with the
  new test named in the output.
- The live post-fix confirmation was produced by the orchestrator on hardware and
  recorded with a machine-readable verdict, and the final todo-close took the arm
  that verdict names — closing the todo only on `confirmed`, and leaving it open
  with the result appended on `not-confirmed`.
- Both cross-references between the two todos resolve, neither file carries a bare
  `<source file>:<line>` citation, and `pnpm planning-gates` exits 0 after every doc
  task with `todo-frontmatter-gate.py` named `[PASS]`.
- Four atomic commits exist, all naming `261001-svm`: three `docs(` and one `fix(`.
  No commit contains `.planning/STATE.md`, and no `docs(` commit contains a source
  file.
</success_criteria>

<output>
Create `.planning/quick/261001-svm-close-epic-panel-gate-file-macos-embed/261001-svm-SUMMARY.md` when done.

Record in it, as measurements rather than prose: which branch of the Epic todo's own
live-check criteria was reached; the exact width of the refutation (post-CR-01, dev
build, pre-fix unmeasured) and that it was NOT widened; the new todo's path and its
triage triad; the exact shape of the Rust edit and the decision NOT to add a macOS
bounds re-apply with its reasoning; the cargo check/clippy/test results against
their `7fa4b5fc1` baselines; the `verdict:` word from `261001-svm-LIVE.md` and which
Task 5 arm it selected; the pending/completed census before and after; the
`pnpm planning-gates` result; and the three prettier/rustfmt findings that made
formatter gating either vacuous (`.planning/` paths), erroneous (the `.rs` path), or
pre-existing debt (rustfmt's 76 hunks).
</output>
