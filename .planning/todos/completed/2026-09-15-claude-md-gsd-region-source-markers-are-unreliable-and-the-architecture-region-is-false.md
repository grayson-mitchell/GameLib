---
created: 2026-09-15
title: "CLAUDE.md's GSD region `source:` markers do not reliably describe where their content comes from, and the architecture region ships a false claim that hides a real 391-line architecture doc"
area: planning/docs
severity: medium
platform: any
ready: code
status: completed
source: raised three times during the 2026-09-13 session as a "regeneration will delete the conventions" hazard; that framing was WRONG and is corrected below
files:
  - CLAUDE.md
  - .planning/research/ARCHITECTURE.md
  - .planning/spikes/CONVENTIONS.md
resolves_phase: null
---

# CLAUDE.md's region `source:` markers are decorative, inconsistent, and in one case actively false

## First, the correction — what this todo is NOT

This was raised three times as: *"the conventions region is a managed block whose declared source
contains none of its content, so a regeneration would silently delete the two-profile rule, the
CI-enforced todo-triage vocabulary and the sidecar exit contract."*

**That framing was wrong, and the wrong part is the word "regeneration."** Measured at
`665cc4168` on 2026-09-15:

- `~/.local/bin/gsd-sdk` contains **no** reference to `conventions-start` or `conventions_content`.
- `get-shit-done-cc` is **not installed** (`npm root -g` has no such package).
- The only non-transcript artifact referencing the markers is a **template**,
  `~/.claude/get-shit-done/templates/claude-md.md`, which defines the region shape for *initial*
  scaffolding.
- `git log -- CLAUDE.md` shows every convention was **hand-written directly into the region**:
  `c33f98771` (2026-09-08, todo-triage vocabulary), `d7d021a05` (2026-09-13, two-profile rule),
  `67ed8767b` (2026-09-13, sidecar exit contract).

So **nothing regenerates this file today**, and there is no impending data loss. Quick task
`260913-ty4` established this for the conventions region specifically on 2026-09-13. The claim was
repeated three times after that without being checked, which is the real lesson: an alarming
mechanism is worth thirty seconds of verification before it is repeated as fact.

## What IS true: the markers do not describe reality, and they disagree region by region

Seven regions carry a `source:` marker. Measured individually — they are not consistent with each
other, so no single mental model covers them:

| region | declared source | measured reality |
| --- | --- | --- |
| `project` | `PROJECT.md` | `.planning/PROJECT.md` exists, content **corresponds** |
| `stack` | `research/STACK.md` | exists; `steam-session`/`steam-user` present, but `Alternatives Rejected` is in CLAUDE.md and **not** in the source — partial drift |
| `conventions` | `CONVENTIONS.md` | resolves to `.planning/spikes/CONVENTIONS.md`, 144 lines titled *"Spike Conventions"* (Stack/Structure/Patterns/Tools) — contains **none** of the three conventions |
| `architecture` | `ARCHITECTURE.md` | `.planning/ARCHITECTURE.md` is **MISSING**; `.planning/research/ARCHITECTURE.md` **exists** (391 lines) |
| `skills` | `skills/` | `.planning/skills` is **MISSING**; skills actually live in `.claude/skills/` |
| `workflow` | `GSD defaults` | not a file |
| `profile` | (none) | n/a |

The marker is a **bare filename with no path**, so `source:ARCHITECTURE.md` and
`source:CONVENTIONS.md` do not resolve anywhere predictable — one lands in `.planning/research/`,
the other in `.planning/spikes/`, and a reader has to guess which.

## The live defect: the architecture region ships a false statement

This is the part with an actual consequence today, and it is why this is `medium` rather than
`minor`. `CLAUDE.md:273-279` reads:

```
<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
```

Meanwhile `.planning/research/ARCHITECTURE.md` is **391 lines** of real architecture research
(`# Architecture Research — Humble Bundle Integration`, researched 2026-07-05, confidence HIGH,
codebase read directly).

Every agent session loads CLAUDE.md. Every one of them is currently told that no architecture is
mapped and to infer patterns from the codebase, while a substantial architecture document sits
unread one directory away. That is not a latent trap — it is misinformation being served now.

## What remains

1. **Fix the architecture region.** Either point it at `.planning/research/ARCHITECTURE.md`, or
   summarise that document into the region, or say plainly that architecture research exists at
   that path and is not yet distilled. Any of the three beats the current false sentence. This is
   the only item with a live consequence; do it first and it can stand alone.
2. **Decide what the `source:` markers mean, then make them true.** Two coherent options — pick
   one, do not leave the current mix:
   - **Nominal:** keep the markers as provenance breadcrumbs and add one line to CLAUDE.md stating
     that these regions are hand-maintained and the `source:` paths are historical, not live. This
     is cheapest and matches how the file is actually edited.
   - **Live:** make each source authoritative and populate it. Note this is a real cost and buys
     nothing today, since no tool reads them back.
3. **Use full repo-relative paths** in whichever option is chosen. `source:CONVENTIONS.md` pointing
   at `.planning/spikes/CONVENTIONS.md` is the single most misleading thing here.
4. **Check the `skills` region's list while you are there.** It names 2 skills; `.claude/skills/`
   currently holds 3 (`archify` is absent from CLAUDE.md). Confirm whether that omission is
   deliberate before changing it — `archify` is currently an untracked working-tree directory.

## Do not

Do **not** "fix" this by writing the conventions into `.planning/spikes/CONVENTIONS.md` and
expecting propagation — nothing reads that file into CLAUDE.md, so the text would simply vanish
from where agents actually read it. Add or edit conventions **directly inside the region** in
CLAUDE.md, then `npx prettier --write CLAUDE.md` and assert `git diff --numstat -- CLAUDE.md`
shows **0 deletions**; a non-zero deletion count means prettier rewrapped pre-existing lines and
the diff is wider than the change.

## Resolution (2026-09-18, quick 260918-a1a)

- **Item 1 (architecture region):** the todo's own cheapest remedy — point the region at
  `.planning/research/ARCHITECTURE.md` — was measured and REJECTED as a trap. That document is
  Humble-scoped, Electron-era, researched 2026-07-05, and predates the Rust/Tauri shell
  (`83dc57a76`, 2026-07-20) by fifteen days; citing it bare swaps a false sentence for a stale
  one, which is worse because agents trust a cited document more than an admission of ignorance.
  Took the third option: the region now states no whole-app architecture is mapped, names the
  391-line study with its real scope and its Electron/Tauri mention counts (measured fresh at
  execution time: 13 Electron / 0 Tauri, matching the orchestrator's prior numbers), and points at
  `graphify query` for current structure.
- **Item 2 (marker semantics):** adopted **Nominal**. A note above the first region marker —
  outside every region, so it is the first thing read and cannot be clobbered by a region
  rewrite — states the regions are hand-maintained and `source:` is historical provenance.
- **Item 3 (repo-relative paths):** four markers now carry real repo-relative paths
  (`.planning/PROJECT.md`, `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`,
  `.claude/skills/`). The fifth — `conventions` — got `source:hand-maintained` instead of a path.
  Record the reasoning: `.planning/spikes/CONVENTIONS.md` is 144 lines of "Spike Conventions" and
  contains none of the region's content, so writing that path would have committed the exact
  defect this todo was filed against. The region genuinely has no source document.
- **Item 4 (skills list):** **closed with NO EDIT, deliberately.** `.claude/skills/` holds three
  dirs, but `archify` is a third-party skill installed from GitHub — `skills-lock.json` pins
  `tt-a1i/archify`, sourceType `github`, 192 files / 7.3 MB of vendor output. The region is
  headed "Project Skills" and documents skills that teach an agent about THIS project; the two
  listed entries are GameLib-authored findings. `archify` teaches nothing about GameLib, so its
  omission is correct and was confirmed, not overlooked.

Verification evidence: conventions region byte-identical to the pre-edit copy (`diff` printed
`CONVENTIONS-BODY-IDENTICAL`); exactly six deleted lines in `git diff -- CLAUDE.md`, matching the
five marker comments plus the false architecture sentence, nothing else; 7/7 `GSD:*-start`/`-end`
marker pairs, same names, same order; `npx prettier --check CLAUDE.md` was already clean before
any edit (negative control) and remained clean/idempotent after.

`pnpm planning-gates` was measured twice and gave two different answers, which is worth recording
because neither number is a fact about this change:

- **At execution time: 10/11**, the single failure being `uat-visibility-gate.py` on
  `.planning/phases/43-.../43-UAT.md`.
- **Re-measured by the orchestrator minutes later at `38cb39cc9`: 11/11**, that same gate PASSING.

The delta is not this task. `43-UAT.md` is **untracked** and belongs to a **concurrent session**
that rewrote it at 07:22:31 while the executor was mid-run (a new pending todo from the same
session landed at 07:21:56). Because the file is untracked, a CI checkout never sees it at all —
so it was never a real red, and the later green is not a fix. The lesson is the standing one: a
planning gate reads the **working tree**, not the commit, and on a repo with a live concurrent
session the tree is not a stable measurement surface.
