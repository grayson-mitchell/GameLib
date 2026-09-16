---
created: 2026-09-15T17:30:00.000Z
title: "LATENT: the Winetricks panel's `installWrapper` still remounts on install COMPLETION via a second `!loadingInstalled` gate — 35-25 closed only the `installing` half, and this arms the moment Phase 44 removes the inner gate"
area: ui
status: OPEN
severity: minor
platform: any
ready: code
files:
  - src/frontend/components/UI/Winetricks/index.tsx
---

## The mechanism, traced from source at `ecfdbb1f3`

`installWrapper` is gated by **two stacked conditionals**, not one:

```tsx
{!declined && !loadingInstalled && (          // :156  OUTER  <- still present
  <div className="installWrapper">
    {!installing && allComponents.length !== 0 && (   // :158  inner
      <div className="actions">               //       search bar + Open Winetricks GUI
```

The outer gate is retriggered by install **completion**:

- `onInstallingChange` (`:96-99`) calls `listInstalled()` when `component === ''`
- `listInstalled()` (`:37-38`) opens with `setLoadingInstalled(true)`
- that flips the outer conditional false and unmounts the whole `installWrapper`

This is the same remount class that `35-25` (`366e719bb`) was built to close. 35-25 fixed the
`installing` trigger and left the `loadingInstalled` trigger untouched.

## Why this is `minor` and not `major` — read before escalating it

**The harm is masked today, and the masking is load-bearing.** The inner `!installing` gate
already hides the `actions` block — the search bar and every suggestion row — for the entire
duration of an install. So at the moment the outer gate fires, **the list is not rendered
anyway**. There is no row for a pointer to be over, so the mousedown/mouseup race that made the
original defect user-visible cannot arm through this path in the shipped build.

What remains observable today is a brief disappearance of the `installWrapper` (which at that
instant is showing `winetricks.installing`, "Installation in progress: {component}"). **That
flicker is NOT measured** — it is predicted from the code path. Do not write it up as observed
until someone has actually watched it.

## Why it is nonetheless worth having filed

**It arms the moment the inner gate is removed — which is exactly what Phase 44 specifies.**
`44-UI-SPEC.md` removes `!installing` so that per-row progress can render with the list mounted.
The instant that lands, the outer gate becomes the sole remaining remount, and it fires at
install completion with the full browse list on screen and a pointer plausibly over it. That is
the original 35-25 failure shape restored, just triggered at the end of an install instead of
the start.

Phase 44's spec now calls this out explicitly (Component Inventory + the Loading state's
stale-while-revalidate treatment), so **if Phase 44 ships as specified, this todo closes with
it.** This file exists because Phase 44 might slip, be descoped, or be executed by someone
reading only the inner-gate half of the story — and because the defect should be tracked
somewhere that is not a phase that has not started.

## History — this was named in August and then lost

The `2026-08-24` todo's PARKED section named this exact mechanism as its **candidate 1**:

> **`Winetricks/index.tsx`** — the whole search bar sits behind
> `{!declined && !loadingInstalled && (...)}`, so `loadingInstalled` flipping true unmounts
> everything at once. `listInstalled()`'s first statement is `setLoadingInstalled(true)`, and
> `onInstallingChange` calls `listInstalled()` when `component === ''`.

35-25 then measured the *other* candidate (`installing`), found it, fixed it, and the parked file
was closed on 2026-09-15 by `quick-260915-lhm` — correctly, since its title claim was false by
then. But candidate 1 went with it. **Closing a todo on the strength of the hypothesis that
turned out right silently discards the sibling hypothesis that was never tested.** That is the
transferable lesson here, and it is why this is a separate file rather than a note appended to
a completed one.

## Fix

Restructure so a `listInstalled()` refetch does not gate the mount of the browse region. The
shape Phase 44 specifies: keep the region mounted and express the refetch as a non-blocking
indicator over the still-interactive list, rather than as a wrapper-level conditional. A
narrower fix that does not wait for Phase 44 is to split the gate — let `loadingInstalled` drive
only the initial mount, not subsequent refetches — but note that the *first* load genuinely has
nothing to show, so the two cases are not symmetric and should not be collapsed into one flag.

Related: `2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md` ·
`.planning/phases/44-in-app-winetricks-browse-ui-replacing-the-search-only-panel/44-UI-SPEC.md`
