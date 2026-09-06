---
created: 2026-09-05T00:00:00.000Z
title: "The sidecar's bootstrap has never been swept for unported non-handler side effects -- the original main.ts sweep target no longer exists"
area: tauri-sidecar
status: "RESOLVED 2026-09-06 by quick-260906-gej. The question is answered No: seven non-handler
  side effects (A1-A7) were confirmed unported and had never been ledgered, three (DXVK/Winetricks/
  default-Wine pre-fetch) are silently degraded to lazy-at-first-use rather than lost, and one
  whole class (window-bounds persistence) was explicitly out of scope for this sweep. Eight new
  pending todos were filed and this todo is closed."
discharged: 2026-09-06
discharged_by: quick-260906-gej
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

---

## Disposition (2026-09-06, quick-260906-gej) — RESOLVED

### The premise correction

This todo's own title and Context assert that "the original main.ts sweep target no longer
exists," quoting `ls src/backend/main.ts` returning `No such file or directory`. That was a claim
about the **working tree**, not about the repository. The file was recoverable, and was
recovered:

```
$ git log --oneline --all --diff-filter=D -- src/backend/main.ts
5643c7583 feat(35-14)!: delete the Electron entry points — POINT OF NO RETURN (commit A)

$ git show 5643c7583^:src/backend/main.ts   # 1561 lines
```

Consequence: the sweep did **not** have to fall back to this todo's own Suggested-approach step 1
("grep the sidecar and guess"). It got the exact pre-cutover file this todo wanted diffed.
Generalisable lesson: a deleted file is not an absent file, and `ls` is the wrong instrument for
asking whether a sweep target exists — `git log --diff-filter=D` and `git show <parent>:<path>`
are.

### The verdict

Quoted from FINDINGS.md's own answer to its question ("Does the sidecar's own bootstrap carry
every non-handler side effect the old Electron main process once had?"):

> **No.** Seven are unported and unledgered (A1–A7), three are silently degraded (B), one whole
> class (E) was not in scope. A1 (permanently-wedged playtime lock) and A5 (Steam install badges
> never reconcile) are the two with live user-visible consequences on the operator's own
> platform.

Section C (12 rows) is already ledgered elsewhere — ported, accepted-gap, or covered by an
existing todo. It filed nothing new. Section D's five Electron-only switches are correctly
absent, bar one inert-toggle residue.

### Confirmation of the parent todo's generalisation

Every one of A1–A7 is invisible to a channel-by-channel IPC inventory because none of them
carries a channel name.

### Full write-up

`.planning/quick/260906-gej-sweep-sidecar-bootstrap-for-unported-non/260906-gej-FINDINGS.md`

### The eight spawned todos

1. `2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md` — A1, `major` — GOG playtime
   sync lock only clears on the success path; one interrupted sync wedges it forever.
2. `2026-09-06-queued-gog-playtime-never-drains-at-boot.md` — A2, `medium` — queued GOG
   playtime only drains after the next completed GOG session, never at boot.
3. `2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md` — A3,
   `medium` — GOG presence never goes online at startup; its 5-min keep-alive never arms until
   a GOG game is launched.
4. `2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md` — A4, `medium` — stale Epic
   `userInfo` and stale GOG user details are never reconciled at boot.
5. `2026-09-06-steam-refreshinstallstate-has-zero-call-sites.md` — A5, `major` — Steam install
   badges never reconcile with the live Steam client; no window-focus event reaches the sidecar
   at all.
6. `2026-09-06-checkrosettainstall-never-runs-under-tauri.md` — A6, `medium` — Apple Silicon
   Macs without Rosetta fail opaquely at launch instead of being told.
7. `2026-09-06-detectvcredist-never-runs-on-windows.md` — A7, `medium` — Windows users are
   never prompted to install the VC++ redistributable.
8. `2026-09-06-disable-smooth-scrolling-accessibility-toggle-is-inert.md` — D residue, `minor`
   — the Accessibility toggle for smooth scrolling still renders but its only consumer was
   deleted.

### What this closure does NOT cover

Section B's lost 2.5s background pre-fetch (DXVK/Winetricks/default-Wine) is an accepted cost,
not a defect — correctness is intact, only a background pre-fetch became lazy-at-first-use.
Section E (window bounds / maximise state persistence across launches) was never swept — it
belongs to a future shell-side sweep, and the next sweeper starts from FINDINGS.md's named
suspicion (no window-bounds persistence found in `src-tauri/src/main.rs`), not from zero.
