---
quick_id: 260919-9gu
date: 2026-09-19
status: complete
commits:
  - bd2349577  # sweep the last 5 dead keys
  - cb11c2b0d  # migrate 54 keys + fill 48 locales (atomic)
files_changed: 104
source_todo: .planning/todos/completed/2026-09-15-816-unlocalised-humblekeys-keys-ship-english-in-every-non-english-locale.md
todo_status_after: CLOSED
---

# Quick Task 260919-9gu — Summary

The Humble Keys screen rendered English to every non-English user, and **no gate could
see it**. Both halves are now closed: the keys live in the fork-owned `gamelib` namespace,
all 48 non-English catalogs are filled, and the gap is permanently CI-visible.

## What shipped

| commit | what |
| --- | --- |
| `bd2349577` | swept the last **5** dead keys (59 → 54 leaves) |
| `cb11c2b0d` | migrated **54** keys to `gamelib` + filled **48** locales — 103 files, +5,523/−239 |

`en/translation.json` no longer carries a `humbleKeys` block at all. `sidebar.humbleKeys`
— a different key that merely shares a leaf name — survives.

## Why relocate instead of filling in place

The operator chose option (b). Both cost the same ~2,592 strings, but filling
`translation.json` in place leaves the keys permanently outside every gate, so this exact
defect could recur and stay silent. Relocating puts fork content **into** the
already-gated namespace.

`FORK_OWNED_NAMESPACES` is **unchanged**. This is deliberately not the same change as
widening the gate over upstream namespaces, which the todo asks not to bundle.

It also silently dissolved a requirement: the todo demanded creating `translation.json`
for `br` and `sl`, which have none. All 49 locales already carry `gamelib.json`, so on
this path that step does not exist.

## The counts were wrong four times, each for a different reason

| census | live | dead | why it failed |
| --- | --- | --- | --- |
| todo (2026-09-15) | 59 | 25 | naive substring grep |
| `260919-8yq` | 59 | 25 | same grep |
| `t('humbleKeys.X'` | 35 | 24 | **misses multi-line calls** — most calls here wrap |
| literal sweep `[A-Za-z_]+` | 51 | 8 | **excludes digits** — `c2Action`/`c2Body`/`c2Title` unmatchable |
| literal sweep + digits | **54** | **5** | holds against real call sites |

The fourth row produced a confidently wrong answer in the *opposite* direction from the
third. Neither grep was checkable by eye; only cross-checking candidates against actual
source lines settled it.

## The lint trap that nearly shipped

Rewriting the last `t('humbleKeys.*')` call in two components left their plain
`useTranslation()` binding **dead**. `tsc --noEmit` passed — it does not flag unused
destructured bindings here — and my grep reported `HumbleKeyRow` as still using `t`,
because the only remaining occurrence was the text `t()` **inside a comment** at line 521.

Only ESLint caught it: two `no-unused-vars` **errors**, in a repo that gates on lint
ceilings. Both bindings removed, and both attached comments corrected — one explicitly
described a "two-hook-with-alias pattern" that no longer exists, which would have left a
comment contradicting its own code.

## Fill mechanics

`pnpm machine-fill-gamelib`, proven on `de` first (D-08 refuses bulk without an explicit
opt-in — the guard did its job). D-09 never overwrites, so the 2026-09-15 hand-written
strings are preserved and the run is idempotent; `de` re-reported `0 new, 316 preserved`
on the bulk pass, which is the invariant demonstrating itself.

A transient `fetch failed` aborted the first bulk attempt at 15/48 — **not** an auth
error. The resume wrapper recomputes the still-short list each pass, so it cannot redo
completed work; it finished the remaining 33 in a single pass.

D-10 provenance stamped across all 48 locales (3,072 `humbleKeys` entries = 64 × 48),
leaving hand-written values honestly unstamped.

**The presence baseline was NOT regenerated.** After a complete fill it remains correct at
`totalPairs: 0`, untouched — there is no gap left to record. Regenerating would have been
the exact anti-pattern the file's own `reason` string warns about.

## Verification — key-set diff, never an exit code

`lintTranslations` is green, but it was *also* green this morning while the screen was
entirely English, so it is recorded as no-regression, never as evidence. What was actually
measured:

- All **49** locales at **316** leaves; zero missing or empty values.
- Placeholder parity both directions on every filled value.
- Glossary term `Steam` surviving verbatim in all 5 values carrying it.
- Zero bare translation-namespace literals in `src/`; all **84** `gamelib:` references resolve.
- No locale retaining a stale `humbleKeys` block.
- Meta i18n suites **390 passed**; Humble frontend **181 passed**; `tsc --noEmit` exit 0;
  `pnpm lint` exit 0 with **production: PASS | tests: PASS**.

What is **not** claimed: `pnpm test:ci` was not run as a gate — it is known red at HEAD for
an unrelated leaked timer, so it would have proven nothing either way.

## The one meaningful difference from this morning

Before: a green `lintTranslations` was positive evidence about `gamelib` only and **no
evidence about the screen**. Now the screen's strings *are* `gamelib`, so the same green
check finally means what a reader would assume it means. That is the whole return on
choosing (b) over (a).

## Incidents worth recording

- **A live API key was pasted into the session transcript.** It has been used for this fill
  and **must be rotated** — it is in the conversation history permanently.
- An earlier instruction of mine contained a literal `sk-ant-…` placeholder, which was
  appended verbatim to `~/.gamelib.env` and then **shadowed** the real value, since shell
  sourcing takes the last declaration. Removed, with a backup at `~/.gamelib.env.bak` —
  which now holds a second on-disk copy of a key and is pending the operator's decision to
  shred.
