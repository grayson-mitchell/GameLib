# Prediction pinned BEFORE the option-3 edit — 2026-09-21, quick 260921-qru

## Diagnosis being acted on

MUI's Dialog Paper is `display: flex; flex-direction: column`. `.settingsDialogContent` is a flex
item, so its default `min-height: auto` pins it to its content height (measured 522px) and it
refuses to shrink to meet the capped Paper. It therefore spills past the Paper's bottom edge
(measured +210px at a 500px viewport) with `overflow-y: visible`, and the Paper — despite
`overflow-y: auto` — reports `scrollHeight === clientHeight`, so nothing ever becomes scrollable
and the spilled log text is unreachable.

## The edit

Scoped INSIDE the existing `&:has(.logs-wrapper)` block in `Dialog.tsx`, so it can only affect the
case already under test:

    '& .settingsDialogContent': { minHeight: 0, overflowY: 'auto' }

`min-height: 0` releases the flex item so it can shrink; `overflow-y: auto` then gives it a
scrollbar instead of clipped, unreachable content.

## Predictions (falsifiable)

At **500px** viewport, log modal open:

| # | quantity | before (HEAD) | predicted after |
|---|---|---|---|
| Q1 | paper rendered height | 400px | **400px — UNCHANGED** (the cap is not what I am changing) |
| Q2 | `.settingsDialogContent` clientHeight | 522 | **< 450** (shrinks to fit inside the capped paper) |
| Q3 | `b_content_canScroll` | false | **true** |
| Q4 | `b_content_bottom_minus_paper_bottom` | +210 | **<= 0** (no longer spills past the paper) |
| Q5 | `b_content_overflowY` | visible | **auto** |

At **900px** viewport:

| # | quantity | before (HEAD) | predicted after |
|---|---|---|---|
| Q6 | paper rendered height | 630px | **630px — UNCHANGED** |
| Q7 | `b_content_bottom_minus_paper_bottom` | −20 | **still negative, still fits** |
| Q8 | `b_content_canScroll` | false | **false** (nothing to scroll; cap does not bind) |

Q6–Q8 together are the **no-regression control**: if the ordinary viewport moves at all, the edit
has reached further than intended and must be narrowed.

## What would falsify / invalidate

- Q1 moves → I changed the cap, not the overflow. Wrong edit.
- Q4 stays positive → `min-height: 0` was not the operative constraint; some other ancestor pins it,
  and the diagnosis is wrong.
- Q6 moves → the rule is leaking into the non-binding case.
- Sentinel `borderRadius` stops reading `10px` → probe is off-element; discard the run.

## Explicitly NOT doing

Not reviving `LogSettings/index.css:52`'s dead `dialog .logs-wrapper` block. It carries
`.log-buttongroup { display: none }` and a single-column collapse alongside its `height: 15em` —
reviving it would silently remove the log-picker UI. That is unreviewed dead styling, and this repo
already rejected the identical move for the bare `.Dialog` class (`Dialog.tsx:109-120`). The dead
rule stays dead and stays recorded in the todo.
