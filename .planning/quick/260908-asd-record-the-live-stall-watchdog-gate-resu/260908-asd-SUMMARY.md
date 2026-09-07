---
phase: quick-260908-asd
status: complete
date: 2026-09-08
files_modified:
  - .planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md
---

# Quick 260908-asd — live stall-watchdog gate recorded

**The gate PASSED. The todo stays OPEN.** Both halves of that sentence are load-bearing.

## What was measured

BATTLETECH `637090`, mac-native native-depot install, **Tauri** shell, sidecar carrying
`e08997f35`. Stall forced by `pf` packet-drop (`block drop out quick` + `pfctl -k` to kill states)
on the ten CDN IPs — verified before blocking by listing the sidecar's own `ESTABLISHED` sockets
via `lsof` and confirming every peer IP in active use was in the block set (22 sockets to
`23.52.70.65`, plus `203.26.79.2`, `101.53.220.134/135`, `65.8.136.33`, `199.232.211.82/215.82`).

| Time | Observation |
|---|---|
| 07:33:46 | last progress advance — `@150s percent=9% downSpeedMiBs=0.00` |
| 07:34:01 | `@165s percent=9%` — flat |
| **07:41:41** | watchdog trips at **480s**; both abort paths take their **INFO** branch |
| 07:41:41 | `@625s rotations=1375` — one final stats line, same second |
| 07:41:41+ | zero further stats lines; all CDN sockets torn down |
| 07:44 | pf restored — **no revival** |
| 07:45:18 | `SILENT for 180s — depot loop is genuinely dead` |

Compare 2026-08-27: 5081 rotations and 51 minutes of streaming *after* the terminal line.

## The discriminator the todo asked for, answered

On the STALL path `hasAbortController` is **TRUE** — INFO branch, not the WARNING. Mechanically
necessary and now confirmed: a stall means `install()` never settled, so
`runNativeDepotDownload`'s `finally` (which deletes the controller) has not run.

**Hypothesis A (registry clobber) is refuted for the stall path.** It predicted the abort landing on
a stranded controller while the live run continued; measured, the controller was live, the abort was
delivered, the loop died in the same second. The `No in-flight download to abort` WARNING *was*
reproduced twice — but only on **resolved-error** paths, which is by design and exactly what
`utils.ts`'s 37-05 comment predicts. The original todo's citation of that warning for 228280 should
not be read as evidence of a clobber.

**Hypothesis B is narrowed, not settled.** `cdnAuth.ts` remains abort-blind; the gate shows
`depot.ts`'s checkpoints bound a *packet-drop* wedge, not necessarily an auth-token wedge.

## The finding that most changes the picture

**The `eresult=1` empty-auth-token condition reproduces spontaneously and is NOT sufficient to
stall.** Californium `402060`, unprompted, no network manipulation, same error and same `eresult=1`
as the 2026-08-27 capture across every host and both depots — and the download ran straight through
it at 7-9 MiB/s to 100% in 105 seconds. It falls back to hosts that do not require token auth.
So that condition is a *constant* for this title, not the outage the todo implies, and cannot by
itself be the cause. Whatever turned it into a wedge that night is still unidentified.

## Forcing methods that measured nothing (recorded so they are not retried)

- **`/etc/hosts` cannot stall an in-flight download** — affects only new DNS lookups; keep-alive
  connections never re-resolve. All six hosts returned `curl` exit 28 while Disco Elysium `632470`
  downloaded 9.7 GB to completion with the block active for 18 minutes.
- **Blocking before install start** kills plan build (manifests come over CDN) → terminal error.
- **Blocking mid-download on a small title** just corrupts it — Californium is 105s end-to-end.
- **`SIGSTOP` on decompress workers** is unavailable: `worker_threads`, so in-process; it would
  freeze the watchdog timer too.

## Honest limits

This reproduced *a* stall, not *the* stall. The gate does not prove the 2026-08-27 run had no third
cause. The discharge condition is now narrower and better specified: a wedge inside the
**empty-auth-token rotation loop** specifically. Since that condition is now known to be
reproducible on demand, the missing ingredient is whatever additionally prevented fallback to the
non-token hosts.

## Gates

`status: OPEN` = 1; gate section present = 1; file still in `pending/`; prettier clean;
`git diff -- src/` = **0 lines** (docs-only, enforced not asserted).

## Deviation

Task written by the orchestrator inline rather than dispatched to a `gsd-executor`. The measured
values existed only in the live session's context; delegating a records task whose entire value is
measurement accuracy would have risked an agent paraphrasing numbers it could not see. Plan, STATE
row and commit discipline all preserved.
