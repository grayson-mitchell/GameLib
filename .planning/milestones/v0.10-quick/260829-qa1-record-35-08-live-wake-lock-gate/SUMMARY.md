---
quick_id: 260829-qa1
slug: record-35-08-live-wake-lock-gate
date: 2026-08-29
status: complete
---

# Summary

Recorded the result of plan 35-08's Task 3, the blocking live wake-lock gate, which had been left
OUTSTANDING at plan close. The gate was driven live on macOS 15 arm64 the same day.

## What was produced

- `35-08-LIVE-GATE.md` — the gate record: pre-flight build-identity checks, method, the transition
  timeline, pasted `pmset` evidence for steps 1/2/4 and the force-quit, the full id census, the
  criteria table, and the NOT ATTEMPTED platforms.
- `35-08-SUMMARY.md` — status flipped to 3/3 with an explicit warning that it must not be read as a
  clean pass; the "Task 3 OUTSTANDING" section replaced with the result; Threat Flags amended.
- `deferred-items.md` — `D-35-08-02` appended, open and unowned.
- `STATE.md` — one row appended to the Quick Tasks table.

## The result being recorded

All five of Task 3's own acceptance criteria PASS on real observations. The plan's
`success_criteria` FAILS on a defect the gate found: every game launch also takes a system-sleep
assertion labelled as a download and holds it for the session. Both facts are on the record
together, because Task 3's five criteria never operationalised the `success_criteria` sentence and
scoring only the five would have produced a green record over a live defect.

The defect is inherited caller logic (`GlobalState.tsx:1633` + `appShellFlowRegistration.ts:301`),
not a fault in 35-08's Rust or stub code. Phase 33's no-op stub made it unobservable; making the
assertions real is what surfaced it.

## Notes on how this was done

- **No `gsd-sdk state.*` verb was invoked.** A `cp` snapshot of STATE.md was taken first and the
  single table row applied by hand; `git diff --stat` confirms exactly `1 insertion(+)`.
- **No subagents were spawned**, per the project instruction not to call the Agent tool unless
  asked. The quick workflow's planner/executor split was run inline instead; its guarantees
  (task directory, atomic commit, STATE.md tracking) were kept.
- A compressed terminal reading initially made the binary's assertion labels look like they were
  missing the article and therefore mismatched the source. Re-counted with explicit per-variant
  counters, which showed the labels matched exactly. Exact-string claims were not made from
  compressed output after that.
