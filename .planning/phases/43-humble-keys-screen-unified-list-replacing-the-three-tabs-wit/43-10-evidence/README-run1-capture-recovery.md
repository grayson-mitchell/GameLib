# Run-1 evidence recovery — 2026-09-11, quick task 260911-qds

Run 1's `43-10-evidence/` originally contained only logs and text — its `capture-*.png` files
were never preserved when `43-LIVE-GATE.md` was filled, even though run 1's own deviation 1
claims the measurements are "re-verifiable by anyone from `capture-*.png`". This was luck, not
process: the session directory `/private/tmp/gamelib-gate-20260911T043842Z/` happened to survive
on disk past its `/tmp` lifetime and was found and recovered on 2026-09-11 during quick task
260911-qds.

## What was recovered, and one correction to the recovery instruction

The instruction that authorized this recovery named three files as "run 1's THREE primary
captures": `capture-1-columns.png`, `capture-2-bottom.png`, `capture-3-dark-bottom.png`. All
three were copied in and sha256-verified byte-identical to the session directory. But on visual
inspection (required by this same task's P11 protocol), **`capture-2-bottom.png` does not show
the Humble Keys screen at all** — it is an accidental capture of an unrelated code editor window
(a `.planning/todos/pending/` file open in an IDE, with an agent terminal panel visible), not
GameLib. It provides zero evidentiary value for anything `43-LIVE-GATE.md` cites it for.

Cross-checking `verdict-notes.txt` (also in this directory) resolved which file the run-1
scorer actually measured from: the section headed `=== LAUNCH 1, CAPTURE 2 (burst-4..7
identical), LIGHT THEME, SCROLLED TO END ===` — i.e. the real "capture 2" backing the light-theme
measurements (item 3's no-logo/long-title row, item 4's light-theme delta-2 FAIL, item 6's GOG
FAIL) is `burst-4.png` (sha256-confirmed byte-identical to `burst-5.png`, `burst-6.png`,
`burst-7.png` — all four are the same frame). `burst-4.png` is therefore also copied into this
directory, even though the recovery instruction's own file list called the `burst-*` frames
"working intermediates, not cited evidence" — that call was made without checking `verdict-notes.txt`
against the actual pixel content of `capture-2-bottom.png`, and turned out to be wrong for this
one frame specifically.

## Disposition

| File | Shows | Backs |
|---|---|---|
| `capture-1-columns.png` | Humble Keys, dark theme #1 `[20,23,41]` | Items 1, 2, 3 (dark), 5, 7 |
| `capture-3-dark-bottom.png` | Humble Keys, dark theme #2 `[26,28,33]`, scrolled to end | Item 4 dark-theme presence + absence-after-last-row |
| `burst-4.png` | Humble Keys, light theme `[237,239,244]`, scrolled to end | Items 3 (no-logo/long-title), 4 (light FAIL), 6 (GOG FAIL, Steam PASS) |
| `capture-2-bottom.png` | **A code editor, not GameLib** | Nothing. Kept in this directory only as-is (named per the recovery instruction) with this note attached — do not cite it as evidence for any item. |

Net effect: run 1's deviation 1 claim ("re-verifiable by anyone from `capture-*.png`") is now
backed for every item it was cited for, but only because `burst-4.png` was substituted in for
the light-theme frame. `capture-2-bottom.png` remains preserved for provenance/completeness but
is not usable evidence.

No run-1 measurement or verdict changes as a result of this note. All four PNGs in this directory
were visually confirmed (Read tool) free of an open `HumbleClaimWizard` / revealed key — three
show the Humble Keys resting-list state, one shows an unrelated editor window with no Humble
content at all.
