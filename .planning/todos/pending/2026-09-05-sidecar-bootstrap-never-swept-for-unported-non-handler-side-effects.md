---
created: 2026-09-05T00:00:00.000Z
title: "The sidecar's bootstrap has never been swept for unported non-handler side effects -- the original main.ts sweep target no longer exists"
area: tauri-sidecar
status: OPEN
severity: major
source: quick-260905-upz, residue of 2026-08-24-installed-json-watcher-never-ported-to-the-tauri-sidecar.md (third suggested-fix clause, target file gone)
files:
  - src/backend/sidecar/bootstrap.ts
---

# Sidecar bootstrap never swept for unported non-handler side effects

## Context

Parent todo `2026-08-24-installed-json-watcher-never-ported-to-the-tauri-sidecar.md` closed
2026-09-05 as PARTIAL: its headline defect (the `installed.json` watcher missing from the sidecar)
is fixed. Its third suggested-fix clause asked for a sweep of `main.ts` for OTHER unported
non-handler side effects (`watch(`, `setInterval`, `.on(` subscriptions) -- but `src/backend/main.ts`
no longer exists in this codebase:

```
$ ls src/backend/main.ts
ls: src/backend/main.ts: No such file or directory
```

The file's disappearance changed the target of the sweep, not the question behind it. The
question -- does the sidecar's own bootstrap carry every non-handler side effect the old Electron
main process once had? -- is still open and has never been answered.

## Why this is still worth doing

The parent todo's generalisation still applies: non-handler side effects (watchers, timers, event
subscriptions) have no channel name to appear under, so they are invisible to a channel-by-channel
IPC porting inventory. The `installed.json` watcher was exactly this shape and went unported for
weeks before an operator hit its symptom live. Nothing guarantees it was the only one.

## Suggested approach

Since there is no live `main.ts` to diff against, the sweep must instead:

1. Grep `src/backend/sidecar/bootstrap.ts` and its import graph for `watch(`, `setInterval(`,
   `.on(` subscriptions that register standing side effects (not one-shot IPC handler
   registration).
2. Cross-check against git history for what the old `main.ts` used to register (`git log -p --
   src/backend/main.ts` or an equivalent archived reference) to build the candidate list of
   side effects that existed pre-Tauri-cutover.
3. For each candidate, apply the same cheap, decisive test the `installed.json` watcher discharge
   used: grep the built bundle (`build/main/sidecar.js`) for a distinctive log string the side
   effect emits, and confirm it appears with a non-zero count.

## Notes

`resolves_phase: null` -- not owned by a live phase, not auto-closable by one.
