---
created: 2026-08-24T00:00:00.000Z
title: "Focus leaving an EMPTY `PathSelectionBox` sends `''` to its `onPathChange`, and `EgsSettings` maps that to `'unlink'` — so opening the picker to ENABLE EGS sync silently DISABLES it first"
area: ui-settings
status: "RESOLVED 2026-09-05 by quick-260905-upz. Suggested fixes #1/#2 (do not treat an empty
  field as unlink; guard the blur route like the picker route) are satisfied by Guard G1 in
  commitPath. Suggested fix #3 (make the sync/unsync dialogs distinguishable) is NOT satisfied and
  is re-filed as its own todo."
discharged: 2026-09-05
discharged_by: quick-260905-upz
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

---

## Disposition (2026-09-05, quick-260905-upz) — PARTIAL, closes on items 1/2 only

### The observation

```
$ grep -vE '^\s*(//|\*|/\*)' src/frontend/components/UI/PathSelectionBox/index.tsx | grep -n "commitFromBlur\|commitPath"
60:  function commitPath(next: string) {
70:    commitPath(next)
74:  function commitFromBlur(next: string) {
79:    commitPath(next)
84:      commitPath('')
97:        commitPath(selectedPath)
121:      onBlur={(e) => commitFromBlur(e.target.value)}

$ sed -n '100,120p' src/frontend/components/UI/PathSelectionBox/index.tsx
  function commitPath(next: string) {
    enterCommittedRef.current = null
    if (next === path) {
      // Guard G1
      return
    }
    onPathChange(next)
    setJustSaved(true)
  }

  function commitFromEnter(next: string) {
    commitPath(next)
    enterCommittedRef.current = next
  }

$ grep -n "message.unsync\|message.sync\|title:" src/frontend/screens/Settings/components/EgsSettings.tsx
36:          title: t('box.error.title', 'Error')
43:            newPath === 'unlink' ? t('message.unsync') : t('message.sync'),
44:          title: 'EGS Sync'
```

### The claim that MAY now be made

The blur route (`onBlur` -> `commitFromBlur` -> `commitPath`) now shares the same funnel and the
same Guard G1 (`if (next === path) return`) as the picker route, rather than calling
`onPathChange(e.target.value)` directly and unguarded. For the exact reported scenario — focus
leaving an already-empty field — `next === '' === path`, so G1 suppresses the call before
`onPathChange` (and therefore `EgsSettings`'s `'unlink'` mapping) ever fires. Suggested fixes #1
("don't treat an empty field as unlink") and #2 ("guard the blur route like the picker route") are
both satisfied by this single guard.

### The claim that still may NOT be made

That the two outcome dialogs are now distinguishable. Suggested fix #3 is untouched: both the sync
and unsync success dialogs still render under the identical literal title `'EGS Sync'`
(`EgsSettings.tsx:44`), differing only in the one-word body (`message.sync` vs `message.unsync`).
The parent todo's own argument for why this matters — a one-word body difference under a shared
title was misread once already by the operator — still holds for every other path that reaches
this dialog.

### Residue and its owner

Re-filed as
`.planning/todos/pending/2026-09-05-egs-sync-and-unsync-dialogs-are-indistinguishable-at-a-glance.md`,
carrying suggested fix #3 as its sole scope.
