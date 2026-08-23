---
quick_id: 260823-seg
slug: fix-guard-proof-contract-defects-14-15-f
date: 2026-08-23
status: complete
type: docs
commits:
  - 56116b565
files_touched:
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-GUARD-PROOF.md
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/deferred-items.md
code_changes: none
items_closed: [14, 15]
items_still_open: [16]
---

# Quick task 260823-seg — the guard-proof contract can fail again

`ROADMAP.md`'s Phase 34.16 entry says of ledger items 14/15/16: "Fix those **before** re-running
that contract, not after, or this phase will trust a proof that cannot fail." This task is that
fix, done ahead of 34.16 rather than inside it.

## Approach: amend, never rewrite

Roughly the back half of `34.9-GUARD-PROOF.md` is the **recorded transcript of a real PASS run**
(2026-08-12, plan 34.9-21), scored against the instructions as they stand. Rewriting Sections 3-5
in place would have left that verdict uninterpretable — a reader could no longer tell which
contract produced it.

So the fix is a single **§2.5 CONTRACT AMENDMENT v2**, inserted *before* Section 3 where an
operator meets it before acting, plus inline `SUPERSEDED BY AMENDMENT v2` markers at each affected
step. **Every diff hunk is above the RUN RECORD boundary** (old lines 95-327; the record starts at
old ~562) — verified from `git diff -U0`, not assumed.

## Item 14 — CLOSED

§3's PASS bar (d) asserted that no `GameLib-*-macOS-*.dmg`/`.zip` in `dist/` carried an mtime after
`BUILD_START`. On the **failing** direction that cannot produce output either way: `clean:dist-mac`
runs first in the `&&` chain and empties `dist/` regardless of whether the guard fires. It passed
on 2026-08-12 **by construction, not by discrimination** — the second self-satisfying assertion
this contract has produced.

v2 (d) is the check the run itself substituted and scored on, so it is validated rather than newly
invented: **`verify:runner-bundle` is the LAST pnpm lifecycle banner** in the transcript, recorded
with its line number, alongside (c)'s two banner-absence greps.

**The scope fence is the load-bearing part of this fix.** §5's PASS bar (d) has the same shape and
the obvious move is to retire it too — which would be wrong. On the *passing* direction `dist/`
gains artifacts only if the build completes, so mtime-after-`BUILD_START` discriminates exactly as
intended there, and it doubles as the F-34.9-02 stale-artifact guard. It is annotated **NOT
superseded — do not retire for symmetry**.

## Item 15 — CLOSED, with one half recorded as VERIFIED-ABSENT

The prescribed `... | tee -a log` + `${PIPESTATUS[0]}` idiom **silently wrote a 1-byte file under
zsh**, the operator's actual shell, with no error. Replaced at all four sites with
`pnpm dist:mac > <SESSION_DIR>/direction-a.log 2>&1; echo $? > <SESSION_DIR>/direction-a.exit`, and
v2 requires reading the exit file back with `xxd` before scoring — a 1-byte file is this defect's
signature, not an exit code.

**A rule conflict this fix would otherwise have created is reconciled in the open.** Precondition 7
mandates `tee -a`, "never bare `tee`, never `>`" — a rule whose real intent is that no block
overwrite another block's evidence. The redirect form reintroduces exactly that risk, so v2 makes a
**distinct filename per block** mandatory and states it *at precondition 7 itself*, not only in the
amendment. Leaving two rules in silent conflict is how the original defect survived authoring; the
fix should not repeat the mechanism that produced it.

**The `cat -A` half needed no edit and is not claimed as fixed.** Grepped live: `cat -A` appears
**only** in the RUN RECORD's own `F-34.9-21-02` finding row, never in a prescribed command — the
body already uses `xxd` at both byte-dump sites. Recording it as "fixed" would have manufactured a
change that never happened.

## Item 16 — STILL OPEN, and its framing was wrong

**This is not a missing-instruction defect.** §5 step 2 **already** prescribed
`pnpm dist:mac --arm64 --publish=never`, already stated the args-passthrough rationale, and PASS bar
(c) already asserted an arm64 `target=` line plus `grep -c Uploading` = 0. **The contract was
correct.**

What failed: **plan 34.9-21's `how-to-verify` paraphrased the step as "Run the identical `pnpm
dist:mac`", dropping the args, and the run followed the paraphrase** (Deviation 6). A lossy
restatement outranked a correct record because the restatement is what the executor actually reads
— the **third instance of that shape found in this session**, after `34.9-REVIEW-FIX.md` and
ROADMAP's item-18 bullet.

So v2 §A3 is a **precedence rule**, not new procedure: §5's invocation is NORMATIVE, a plan may
cite it but never paraphrase it, the contract wins on disagreement, and deviations are recorded
*before* the run.

**The item stays OPEN.** Only the contract-side half is done; the sub-claim needs a hardware run
and cannot be closed by editing a document. What discharges it: run §5 step 2 with its args as
written, record the arm64 `target=` line verbatim and `grep -c Uploading` = 0, name
`F-34.9-21-03` as discharged. Phase 34.16 re-runs this contract and is the natural place.

## Gates

```
REVIEW-SWEEP-OK 24/24 mapped, unmapped 0     (exit 0)
7/7 planning gates passed
```

## 34.9 ledger state after this task

Closed: 11, 14, 15, 21, 22, 23, 24. Still open: 16 (needs hardware), 1/2/3/12/13/18 (Phase 34.16,
blocked on the default-branch push), 5 (packaged Tauri), 7 (Phase 35), 9 (security pass), 17
(likely moot), 19 (decision overdue), 8 and 20 (unowned). 4/10 and 6 remain deliberately fenced out.
