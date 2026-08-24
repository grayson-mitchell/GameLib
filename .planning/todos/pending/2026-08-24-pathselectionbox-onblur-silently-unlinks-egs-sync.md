---
created: 2026-08-24T00:00:00.000Z
title: "Focus leaving an EMPTY `PathSelectionBox` sends `''` to its `onPathChange`, and `EgsSettings` maps that to `'unlink'` — so opening the picker to ENABLE EGS sync silently DISABLES it first"
area: ui-settings
status: OPEN
severity: minor
files:
  - src/frontend/components/UI/PathSelectionBox/index.tsx
  - src/frontend/screens/Settings/components/EgsSettings.tsx
---

## Observed

Found by the operator on 2026-08-24 driving **step 6 of `34.6-LIVE-GATE.md`** (`egsSync`).

The operator went to Settings -> General -> EGS Sync to ENABLE sync, and reported a dialog saying
sync had been set up. What actually ran was the opposite:

```
(21:16:22) [Legendary]: … legendary egl-sync -y --unlink
```

`egl-sync --unlink` was the ONLY egl-sync invocation of that attempt — `--enable-sync` never ran —
and `config.json`'s `egsLinkedPath` was set to `''` at 21:16:23.

## Root cause

`PathSelectionBox` has TWO routes to `onPathChange`. The picker route is guarded; the blur route is
not:

```tsx
// guarded — a cancelled picker does NOT fire
.then((selectedPath) => { if (selectedPath) { onPathChange(selectedPath) } })

// UNGUARDED — fires with '' whenever focus leaves an empty field
onBlur={(e) => onPathChange(e.target.value)}
```

`EgsSettings.handleSync` treats any falsy value as a request to unlink:

```ts
newPath = path_or_change_event || 'unlink'
```

So focus leaving the empty EGS path field — which happens when the folder icon is clicked, or when
the native picker steals focus — runs `legendary egl-sync -y --unlink`. The user's gesture was
"open the picker to choose a prefix"; the effect was "disable sync".

## Aggravating: the confirmation dialog reads as success

`message.sync` = **"Sync Complete"** and `message.unsync` = **"Unsync Complete"**, and BOTH render
under the title **"EGS Sync"**. A terse "Unsync Complete" under a sync-titled dialog was reasonably
read by the operator as confirmation that sync had been enabled. The operator only learned otherwise
when the log was checked. Fixing the guard without also making these two outcomes visually
distinguishable leaves the misreport in place for every other path that reaches it.

## Suggested fix

1. Do not treat "the field is empty" as "unlink". Unlinking should require an explicit gesture — the
   Backspace/clear affordance `PathSelectionBox` already has, or a dedicated control — not a focus
   event on a field that was never filled in.
2. Alternatively (or additionally) guard the blur route the way the picker route is guarded, so
   `onPathChange` is not called with `''` when the field was already empty. Note this must not break
   consumers that legitimately clear a path by emptying the field — check the other
   `PathSelectionBox` users before choosing.
3. Make the two dialogs distinguishable at a glance: the title is identical and the bodies differ by
   one word.

## Notes

No `resolves_phase:` — not resolved by Phase 34.6 and must not be auto-closed by it. Step 6 of
`34.6-LIVE-GATE.md` records this as a finding; the step itself later PASSED once the operator
completed the pick within the 60s window described in
[[2026-08-24-opendialog-is-missing-from-long-running-channels-so-every-file-picker-flow-dies-silently]].

Related: [[t-default-arg-is-inert-when-key-exists]]
