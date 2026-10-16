---
phase: 23-steam-full-ownership-install-stateflags-4
plan: 10
type: execute
wave: 10
status: complete
completed: 2026-08-19
requirements: [REQ-23-07]
autonomous: false
commits:
  - 9d3169d0c  # Task 3b — G-23-01 KCD2 diagnostic verdict
  - 72edca024  # progress-percent defect filed
  - d03dcf7d1  # progress-percent defect — measured ceiling
  - d086e62da  # Task 2 + Task 3c — Gate 3 PASS, full reconciliation
  - ce982ef6d  # Task 3a — Gate 1 launch re-confirmation (earlier session)
  - 2330af498  # Task 1 — Gate 2 CLEAN re-run (earlier session)
---

# 23-10 — D-07 Real-Hardware Validation Gate: COMPLETE

**All four hardware runs discharged. All three gates PASS. REQ-23-07 — the last open requirement of
Phase 23 — is closable.** Phase 23 is ready for `/gsd-verify-work 23`.

## must_haves scored individually

| Truth | Verdict |
|---|---|
| Gate 2 re-runs CLEAN on HUMANKIND, no manual chmod | ✅ MET (2026-08-19, attempt 3) |
| Gate 3 (INTERRUPT-RESUME) executed for the first time and recorded | ✅ MET (2026-08-19) |
| Gate 1's launch half re-confirmed, or recorded as still-unconfirmed | ✅ MET — re-confirmed, mask lifted |
| G-23-01 decisive diagnostic run in the official Steam client and verdict recorded | ✅ MET — with a method substitution, sanctioned by the operator (below) |
| 23-UAT.md updated IN PLACE — frontmatter, Result fields, Summary Table, Gaps YAML | ✅ MET |

## What each task established

**Task 1 — Gate 2 CLEAN re-run (earlier session).** HUMANKIND installed to `StateFlags=4` (18,809
files) and launched with **no manual chmod**. Closed blocker gap G-23-02, which required **three**
fixes, not one: 23-08 (Mach-O fallback), quick `260818-v81` (reconcile-heal reach), quick `260819-b1q`
(fat-binary slice probe — the actual cause).

**Task 2 — Gate 3 INTERRUPT-RESUME, first execution.** Force-quit (`kill -9`, not Cancel) at
**15,538 / 18,809 files** with no `.acf` on disk; the operator's own Install click resumed it, with
auto-drive correctly absent per D-04's 2026-07-18 softening.

```
reconciledSkipped=15643 of 18949   jobCount=3306
terminal chunk-stream stats @2181s: percent=76%  totalAttempts=33267  timeouts=0
StateFlags 4 (NOT a fail-closed 1026);  Bytes* == SizeOnDisk == 37592580261;  buildid 23181593
21 +x via healReconciledFileModes;  both named binaries -rwxr-xr-x;  zero manual chmod
Steam: "Verifying file sizes only" / "Verification complete" — same second, no re-download
Reached the main menu.  0 bottle processes started today, 0 bottle writes in-window.
```

The resume path is a genuinely distinct code path from Gate 2's (`healReconciledFileModes` rather than
`downloadSingleFile`), and this is its first deliberate hardware exercise. The heal ran *before* first
bytes were written, which is what makes it observable at all.

**Task 3a — Gate 1 launch re-confirmation (earlier session).** Mask lifted; both halves now stand.

**Task 3b — G-23-01 decisive diagnostic.** Answered, with a **method substitution the operator
sanctioned**: rather than a fresh 90 GB install, the verdict was read from the official client's own
artifacts, which are the ground truth a re-run would merely regenerate. The real Valve **Windows** Steam
client in the `GameLibSteam` bottle (the only official client that can install this Windows-only title),
same account, had already installed KCD2 in full — `StateFlags "4"`, ~90 G, `InstalledDepots`
1771302/1771303/**1771306** — **without depot 1771304**, and its `content_log.txt` never mentions 1771304
across the whole install. So the depot is **not required**, and GameLib's whole-install abort on its
Blocked key is a confirmed **over-selection + hard-fail defect**: `severity: major`, `status: open`,
follow-up **UNGATED**. Not implemented here — 23-10 explicitly forbids it.

**Task 3c — document reconciliation.** Frontmatter `testing`→`passed`, pending 1→0, passed 2→3; Summary
Table row 3; header status line; closing provenance line; and a stale inline Gate 1 gaps YAML that had
sat at `status: failed` ever since 23-05 actually fixed it.

## Deviations from the plan as written

1. **Task 3b's method.** The plan says "install KCD2 in the official Steam client". The install had
   already happened (2026-07-11→08-15, same account, same machine); its manifest and content log answer
   the question more directly than a re-run would. Operator approved the substitution explicitly before
   anything was recorded.
2. **Gate 3's title.** The plan preferred a title distinct from Gates 1–2; HUMANKIND was reused on a
   fresh uninstall, which the gate's own preconditions permit. Operator's choice, made against a stated
   trade-off (best-characterised title and nothing left to destroy, vs. no independent title).

## Honesty limits recorded, not glossed

- **Gate 3's launch was Steam-UI-mediated.** It does not independently re-prove GameLib's launch path;
  Gate 1 did that separately the same day. The 21 `+x` are still provably GameLib's — measured at ~11:52,
  before Steam started at 11:54:20.
- **The first no-auto-open check was VACUOUS and its result was discarded.** It grepped process lists for
  the string `crossover` while bottled processes present as `services.exe` / `winedevice.exe` /
  `wineserver`. It returned a clean "none" across 72 samples while 8 such processes had been running
  continuously for four days — it could not have detected an auto-open. Replaced with two checks proven
  to fire (0 bottle-shaped processes started today, against 8 detected; 0 bottle writes in-window,
  against a 11,824-file control). This is the single most transferable finding of the plan.
- **`reconciledSkipped=15643` is the depot writer's own report.** Corroborated by the file-count floor
  never dropping and by the 76% terminal progress matching the byte split, but not independently
  measured over the wire.
- **G-23-01's verdict** proves 1771304 is not *needed*, not that Steam would have refused its key — the
  official client never asked.
- **Sampling gap:** automated sampling began ~97 s after the resume started; one manual check covers part
  of it, and the retrospective mtime/process-start evidence covers the whole window.

## New defect found by this plan (filed, not fixed)

**A resumed install's progress starts at 0% and can never reach 100%** — severity major,
`.planning/todos/pending/2026-08-19-resumed-install-progress-percent-starts-at-zero-and-never-reaches-100.md`.
`depot.ts:2044` computes `percent = doneBytes / totalBytes` with a run-scoped numerator (`:1938`,
initialized to 0 *after* `healReconciledFileModes` at `:1930`) and a plan-scoped denominator (`:1915`).
Gate 3 is the measurement: a fully successful install finished at **76%**. Reporting-only — it does not
affect what lands on disk, the reconcile skip, mode application, or the `StateFlags` decision, so it does
not qualify Gate 3's PASS. The todo carries an explicit anti-vacuity requirement: a fresh install cannot
distinguish correct from broken (numerator and denominator agree when nothing is skipped), so any
regression test must use a non-empty reconciled-skip set and be proven to fail against the current
expression.

## Still open after this plan, deliberately

1. **G-23-01** — confirmed defect, `severity: major`, fix explicitly out of scope, routes to its own gap
   cycle (now **Phase 23.2**). A suspected **second divergence** was raised here and **DISPROVEN
   2026-08-19** by the plan-build selection census this summary recommended: GameLib **does** select depot
   1771306 (size byte-identical to the official client's entry) — it was merely never reached before the
   1771304 abort. The false inference read Attempt 1's *keys-resolved* list as the *selected* set. Net
   effect is narrowing: no enumeration gap, no silently-incomplete installs, and GameLib's selected set
   minus 1771304 equals Steam's installed set exactly, so skip-and-warn is provably sufficient.
2. **The resumed-progress defect** above.
3. **The DecompressPool decode stall** noted in 23-UAT.md — did not recur on 2026-08-19, but nothing was
   fixed; treat as open.

None of these block REQ-23-07, whose contract is the three hardware gates.

## Next

`/gsd-verify-work 23`, then Phase 23 can be marked complete.
