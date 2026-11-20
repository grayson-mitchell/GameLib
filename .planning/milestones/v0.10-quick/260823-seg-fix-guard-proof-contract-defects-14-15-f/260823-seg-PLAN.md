---
quick_id: 260823-seg
slug: fix-guard-proof-contract-defects-14-15-f
date: 2026-08-23
description: "Repair 34.9-GUARD-PROOF.md's three contract defects (ledger items 14/15/16) before Phase 34.16 re-runs it"
type: docs
files_touched:
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-GUARD-PROOF.md
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/deferred-items.md
---

# Quick task 260823-seg — repair the guard-proof contract

`ROADMAP.md`'s Phase 34.16 entry says of items 14/15/16: "Fix those **before** re-running that
contract, not after, or this phase will trust a proof that cannot fail." This task is that fix.

## Design decision: amend, do not rewrite

`34.9-GUARD-PROOF.md` is 713 lines, and roughly the back half is the **recorded transcript of a
real PASS run** (2026-08-12, plan 34.9-21). Rewriting Sections 3 and 5 in place would decouple that
verdict from the instructions that actually produced it — the reader could no longer tell which
contract the recorded run was scored against.

So: a single **CONTRACT AMENDMENT v2** section is inserted **before Section 3**, where a future
operator hits it before acting, and each superseded step gets a one-line inline marker pointing at
it. Original text stays legible. This is the same amend-not-rewrite discipline `deferred-items.md`
uses for its `ROUTED`/closure notes.

## Task 1 — item 14: replace Direction A's vacuous PASS-bar (d)

**The defect:** step (d) asserts no `GameLib-*-macOS-*.dmg`/`.zip` in `dist/` with mtime after
`BUILD_START`. `clean:dist-mac` runs first in the `dist:mac` `&&` chain and empties `dist/`
unconditionally, so on the failing direction the check cannot produce output either way — it passed
on 2026-08-12 **by construction, not by discrimination**. It is the second self-satisfying
assertion this contract has produced (the first was `--publish=never` self-matching a bare
`publish` grep, caught at 34.9-20 authoring time).

**The replacement is already validated** — the 2026-08-12 run substituted it and scored on it
(`F-34.9-21-01`: "two electron-builder-banner-absence greps plus terminal-pnpm-lifecycle-step
check (both measured, real discriminators)"). v2 (d) becomes: assert `verify:runner-bundle` is the
**last** pnpm lifecycle banner in the transcript. Both electron-builder banner-absence greps stay
where they already are, in (c).

**Scope fence, stated in the amendment:** the finding is **Direction A only**. The same check in
Direction B (§5 PASS bar d) is genuinely load-bearing — `dist/` gains new artifacts there only if
the build completes — and must NOT be touched. An amendment that "cleaned up both for symmetry"
would delete a real discriminator.

## Task 2 — item 15: shell-portable exit capture

**The defect:** the prescribed `pnpm dist:mac 2>&1 | tee -a log` + `${PIPESTATUS[0]}` idiom
silently wrote a 1-byte file under zsh — the operator's actual shell — with no error. Caught only
because the run inspected the file with `xxd` before scoring it.

v2 prescribes the redirect form, which behaves identically under zsh and bash:

```
pnpm dist:mac > direction-a.log 2>&1; echo $? > direction-a.exit
```

Applies to four sites: §3 step 4, §3 PASS bar (a), §5 step 2, §5 PASS bar (a).

**Interaction with precondition 7 that must be resolved, not ignored:** precondition 7 mandates
`tee -a`, "never bare `tee`, never `>`". That rule exists to prevent a re-run **truncating** an
earlier block's evidence. The redirect form must therefore write to a **per-block filename**, not
reuse one file across blocks — otherwise fixing item 15 reintroduces the loss precondition 7
guards. v2 states this explicitly rather than leaving two rules in silent conflict.

**The `cat -A` half needs no edit and must not be claimed as fixed.** Item 15 also reports `cat -A`
as BSD-incompatible. Grepped live: `cat -A` appears **only** in the run record's `F-34.9-21-02`
finding row (line 627), nowhere in the contract's prescribed commands — and the body already uses
`xxd` (lines 385, 400). The amendment records this as verified-absent, not repaired.

## Task 3 — item 16: precedence, not new text

**Item 16 is not a missing-instruction defect.** Section 5 step 2 **already** prescribes
`pnpm dist:mac --arm64 --publish=never` with the args-passthrough rationale, and PASS bar (c)
already asserts an arm64 `target=` line plus `grep -c Uploading` = 0. The contract was right.

What happened: **plan 34.9-21's own `how-to-verify` text restated the step as "Run the identical
`pnpm dist:mac`" without the args, and the run followed the plan's restatement rather than the
contract.** Deviation 6 and `F-34.9-21-03` record it.

That is the same failure this session already hit twice today — a lossy restatement outranking a
correct record in practice, because the restatement is what the executor actually reads. So the
fold is a **precedence rule**, not new procedure:

1. §5's invocation is **NORMATIVE**. A plan's `how-to-verify` may cite it but must not paraphrase
   it; if the two disagree, the contract wins and the deviation must be recorded before the run,
   not after.
2. The next run **must** discharge `F-34.9-21-03` — record the arm64 `target=` line verbatim and
   `grep -c Uploading` = 0 — and say so in its run record.

## Task 4 — ledger closure notes

Append dated closure notes to items 14, 15 and 16 recording exactly what landed and what did not:
14 CLOSED, 15 CLOSED with the `cat -A` half recorded as verified-absent rather than fixed, 16
**still OPEN** — its precondition needs a hardware run and only the contract-side half is done.
Overstating 16 would be the worse defect.

## Acceptance

- [ ] AMENDMENT v2 section sits before §3 and is reachable before any operator action
- [ ] §3 (d) superseded; §5 (d) explicitly NOT touched, with the reason stated
- [ ] All four exit-capture sites carry the portable form + the per-block-filename rule
- [ ] `cat -A` recorded as verified-absent, not claimed fixed
- [ ] §5 precedence rule states the contract outranks a plan's paraphrase
- [ ] Item 16 left OPEN in the ledger with the hardware half named
- [ ] The 2026-08-12 RUN RECORD is not edited — its verdict stays interpretable
- [ ] Sweep 24/24 unmapped 0 exit 0; `pnpm planning-gates` 7/7

## Out of scope

No hardware run. No code. The contract is not re-executed — 34.16 does that, and this task exists
so that when it does, the contract can actually fail.
