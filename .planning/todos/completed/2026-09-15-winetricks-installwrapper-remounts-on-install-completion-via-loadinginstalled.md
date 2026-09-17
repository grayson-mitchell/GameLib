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

## RESOLVED 2026-09-16 (Phase 44, plan 44-05, D-17/D-18)

Closed against plan 44-05's landed fix. Precondition verified by reading the landed
`src/frontend/components/UI/Winetricks/index.tsx`, not assumed: `grep -c "loadingInstalled"`
against that file returns `0`, the `installWrapper` mount's only remaining condition is
`!declined`, and no conditional containing `installing` gates whether `WinetricksBrowse` mounts
(the sole surviving `!installing` reference in the file is inside the unrelated `hideProgress`
prop computation, which only controls the progress/log dialog's visibility, not this mount).

**Both gates named, and where they were:**

- The **OUTER** `!loadingInstalled` gate at the old `:156` — this file's own subject, candidate 1
  from the 2026-08-24 history below, the one `35-25` did not touch.
- The **inner** `!installing` gate at the old `:158` — the one `35-25` (`366e719bb`) fixed for
  the `mousedown`-race trigger. This todo exists precisely because closing on that fix alone
  would have silently discarded this file's sibling hypothesis.

Plan 44-05 removed both. `installWrapper` now mounts on `!declined` alone, and
`WinetricksBrowse` mounts unconditionally beneath it.

**What replaced the single conflated `loadingInstalled` boolean:** two named, decoupled facts —
`hasInstalledData` (set once at mount time from the first `listInstalled()` resolution, never
returns to `false` again) and `isRevalidatingInstalled` (true only for the duration of each
subsequent `listInstalled()` refetch, and gates a stale-while-revalidate indicator over the
still-mounted list, never the mount itself). This is the decoupling this file's own `## Fix`
section predicted would be needed — "let `loadingInstalled` drive only the initial mount, not
subsequent refetches."

**The D-18 proof, verbatim from `44-05-SUMMARY.md`** — two independent revert-to-red transcripts,
one per trigger, each performed with the *other* fix left intact and then undone via
`git checkout -- src/frontend/components/UI/Winetricks/index.tsx`:

### Revert A — re-gate on `installing` (isolates the START trigger)

```
npm warn Unknown project config "node-linker". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
Running one project: Frontend
FAIL Frontend src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx
  ● Winetricks remount safety (D-17/D-18, C-1) › Case A -- install START (the `installing` trigger): installWrapper and row keys survive

    expect(received).toEqual(expected) // deep equality

    - Expected  - 4
    + Received  + 1

    - Array [
    -   "vcrun2019",
    -   "xact",
    - ]
    + Array []

      396 |     const afterStart = reinvoke(props)
      397 |     expect(hasClass(afterStart, 'installWrapper')).toBe(true)
    > 398 |     expect(browseRowKeys(afterStart)).toEqual(baselineKeys)
          |                                       ^
      399 |   })
      400 |
      401 |   it('Case B -- install COMPLETION (the post-install refetch trigger): installWrapper and row keys survive across the whole in-flight window', async () => {

      at Object.<anonymous> (src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx:398:39)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 3 passed, 4 total
Snapshots:   0 total
Time:        0.174 s, estimated 1 s
```

Only Case A turns red. The anchor, Case B, and the stale-while-revalidate case all stay
green — proving Revert A's damage is scoped to the `installing` trigger alone.

### Revert B — re-gate on `isRevalidatingInstalled` (isolates the COMPLETION trigger — this file's own subject)

```
npm warn Unknown project config "node-linker". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
Running one project: Frontend
FAIL Frontend src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx
  ● Winetricks remount safety (D-17/D-18, C-1) › Case B -- install COMPLETION (the post-install refetch trigger): installWrapper and row keys survive across the whole in-flight window

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

      411 |     // Assert WHILE the refetch is still in flight (nothing resolved yet).
      412 |     const inFlight = reinvoke(props)
    > 413 |     expect(hasClass(inFlight, 'installWrapper')).toBe(true)
          |                                                  ^
      414 |     expect(browseRowKeys(inFlight)).toEqual(baselineKeys)
      415 |
      416 |     // Now resolve the refetch and assert again on the other side of it.

      at Object.<anonymous> (src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx:413:50)

  ● Winetricks remount safety (D-17/D-18, C-1) › stale-while-revalidate contract (positive): the revalidating indicator IS present during Case B's in-flight window, not merely absent evidence of rows disappearing

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

      438 |     // survived would pass just as well against an implementation that had
      439 |     // silently dropped the indicator element entirely.
    > 440 |     expect(browseHasRevalidatingIndicator(inFlight)).toBe(true)
          |                                                      ^
      441 |     expect(hasClass(inFlight, 'installWrapper')).toBe(true)
      442 |     expect(browseRowKeys(inFlight).length).toBeGreaterThan(0)
      443 |

      at Object.<anonymous> (src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx:440:54)

Test Suites: 1 failed, 1 total
Tests:       2 failed, 2 passed, 4 total
Snapshots:   0 total
Time:        0.167 s, estimated 1 s
```

Case B and the stale-while-revalidate case turn red together (both depend on the same in-flight
window). The anchor and Case A stay green — proving Revert B's damage is scoped to the
completion/revalidation trigger alone, independent of Revert A's trigger. **This is the specific
proof this file's own subject — the outer `!loadingInstalled`-shaped gate — is actually closed,
not merely assumed closed by inference from Revert A.**

**The honest limit, stated plainly:** this file's predicted `installWrapper` flicker at install
completion was **never observed** — it was derived from the code path, and it is still not
observed. This closure does not claim it was watched and fixed; it claims the code path that
would have produced it is gone, proven by the independent Revert B transcript above, and that the
user-visible behaviour of a real mouse-driven install is covered separately by D-22's live gate
(plan 44-08), which measures a real install through both the start and completion transitions
with the list on screen.

**Standing regression guard:** `WinetricksBrowse/__tests__/remountSafety.test.tsx` — the same
suite these two transcripts came from — is committed and green at HEAD, and re-proves both
reverts independently on every run.
