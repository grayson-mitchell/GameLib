---
created: 2026-09-23T00:00:00.000Z
title: "A contiguous block of library cards renders blank art forever, starting ~3.5 rows down — the `visible-cards` handshake is one-shot, `unobserve()` is permanent, and nothing ever retries"
area: library-ui
severity: major
platform: any
ready: code
found_by: "Live Phase 38 sitting on the operator's Windows 11 machine, 2026-09-23, returning to the library after opening a game's install dialog"
files:
  - src/frontend/screens/Library/components/GamesList/index.tsx:95-135
  - src/frontend/screens/Library/components/GameCard/index.tsx:86-101
  - src/frontend/screens/Library/components/GameCard/index.tsx:505-511
---

# Library card art never recovers from a missed `visible-cards` event

**Observed live**, returning to the library after opening a game's install dialog:

- the first **~3.5 rows render their art correctly**, and a **contiguous block immediately after them**
  renders with no artwork (operator correction: the block does NOT start at the very top)
- it **never recovers** — scrolling away and back does not fix it
- **everything below the block loads normally** while scrolling
- **exactly one card inside the block** does show art
- Steam games; the operator was not signed in to another store, so store-specificity is
  NOT established either way

## Mechanism — a one-shot handshake with no replay

1. `GameCard` starts at `visible=false` and renders an empty placeholder carrying
   `data-invisible` (`GameCard/index.tsx:505-511`), registering a `visible-cards` window
   listener in a mount-only effect (`:88-101`, deps `[]`).
2. `GamesList` runs an effect on `[library]`, does
   `document.querySelectorAll('[data-invisible]')` and observes each node
   (`GamesList/index.tsx:124-128`).
3. On intersection it calls **`observer.unobserve(entry.target)`** and then
   `window.dispatchEvent(new CustomEvent('visible-cards', ...))` (`:104-121`).
4. `GameCard`'s listener matches its own `app_name` and sets `visible=true`.

**Every card gets exactly one chance.** `dispatchEvent` retains no state and has no replay, and
the node is unobserved the instant it is announced. A card that misses its event — listener not
yet attached when it fired, or the card remounted after it fired — is blank PERMANENTLY: nothing
re-observes it, and `GamesList`'s effect only re-runs when the `library` array changes IDENTITY.
That is precisely the operator's own description: "GameLib falsely thinks the block of blank art
games has loaded, so is not touching those."

The single card showing art inside the block is consistent rather than anomalous: `justPlayed`
cards take a different render branch (`GameCard/index.tsx:564`).

## Why the block starts ~3.5 rows down rather than at the top — the strongest clue

The observer is built with `rootMargin: '500px'` (`GamesList/index.tsx:97`), so at mount its FIRST
callback batch announces every card within the viewport plus 500px — considerably more than one
screen. That single batch is dispatched as ONE `visible-cards` event carrying many app names.

This predicts exactly the observed three-way split, and the ~3.5-row boundary is the tell:

1. **First ~3.5 rows — art loads.** Their `GameCard` listeners were already attached when the
   batch fired.
2. **The blank block — art never loads.** These cards were IN the same batch (inside the 500px
   margin) but their listeners were NOT yet attached when it fired. They were `unobserve()`d on
   announcement, so nothing will ever tell them again.
3. **Everything below — art loads on scroll.** Outside the initial batch, so still observed; by
   the time they intersect, every listener is attached.

The boundary between (1) and (2) is therefore a RENDER/COMMIT boundary inside the initial batch,
not a viewport boundary. That is a testable prediction: the blank block should begin at whatever
index the first commit chunk ends, and its EXTENT should track `rootMargin`. Lowering `rootMargin`
should shrink the blank block; raising it should grow it. MEASURE THIS before fixing — it
discriminates the listener-attachment race from the remount hypothesis below, and the two want
different fixes.

## What is NOT the cause

Not an image fetch failure. `CachedImage` already carries a `fallback` chain
(`GameCard/index.tsx:572-581`) for a cover that fails to load. These cards never reach that code
at all — they are still the `data-invisible` placeholder, so no load is ever attempted.

## Open questions — resolve before fixing, do not assume

- **Which miss is it?** Listener-not-yet-attached, or card-remounted-after-its-event. React runs
  child effects before parent effects WITHIN A SINGLE COMMIT, so a clean one-commit mount should
  be safe — but a library large enough to render across MULTIPLE commits breaks that guarantee for
  every card after the first chunk, which is what the ~3.5-row boundary points at. The
  `rootMargin` experiment above discriminates the two. NOT MEASURED — instrument before fixing.
- **Does a full app restart clear it?** Unknown. If it does, the blast radius is one session; if
  not, something is persisting. This changes the severity assessment and was not tested.
- **Is it Steam-specific?** Cannot be concluded — only one store was signed in.

## Fix direction — not prescriptive

The structural fault is that visibility is delivered as a fire-and-forget broadcast while the
observation is torn down permanently. Anything that restores a retry path fixes it: keep the node
observed until the card acknowledges, hold the visible set in state the card can read on mount
instead of only hearing it as an event, or re-run the observer sweep when a placeholder appears.
**Do NOT simply remove `unobserve()`** without checking the perf reason it is there — the observer
is created with `rootMargin: '500px'` over the whole library, and this repo has a standing rule
against trading a measured problem for an unmeasured one.

## Related but DISTINCT — do not merge

The hydration race fixed in `51b175d74` (2026-08-22) concerns the library **COUNT** (games not
reaching the rendered library), still open pending a clean-restart confirmation. This item is
about **ARTWORK on cards that did render**. They may share the hydration path; that is a question,
not an established link. Filing separately rather than folding one into the other.
