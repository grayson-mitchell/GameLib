---
quick_id: 260826-s2f
slug: redrive-live-gate-step-4-winetricksinsta
created: 2026-08-26T08:12:30.804Z
description: "Re-drive phase 34.6 live-gate Step 4 (winetricksInstall) as a proper contract-first gate run, and correct a factual error in 34.6-UAT.md test 5"
autonomous: false
files_modified:
  - .planning/phases/34.6-tauri-ipc-re-plumb-slice-9-eos-overlay-steamgriddb-artwork-w/34.6-LIVE-GATE.md
  - .planning/phases/34.6-tauri-ipc-re-plumb-slice-9-eos-overlay-steamgriddb-artwork-w/34.6-UAT.md
---

## Why

`34.6-VERIFICATION.md` run 2 (`passed`) left this as an explicit
`open_operator_decisions:` item. The operator chose to re-drive.

Step 4 is one of two items holding `34.6-LIVE-GATE.md` at `verdict: FAIL 7/9`. The 2026-08-26 UAT
observed the symptom NOT reproducing — the first-ever
`[GAMELIB_SIDECAR_SEND_HANDLER] winetricksInstall` line plus a real `winetricks -q corefonts`
install. But a UAT observation is not a gate run: it was not contract-first, and the gate's own
convention is that a rerun AMENDS in place with a marked SUPERSEDES section.

## The contradiction this re-drive must NOT paper over

The UAT recorded a hypothesis that the original gate ran with an empty package list because
winetricks' dependencies (`7z`, `cabextract`, `zenity`) were missing. **The gate's own Step 4 record
refutes this**: "Operator clicked Install on a real `corefonts` result row." The list WAS populated
on 2026-08-24. Corroborating: the exclusion list notes the "Open Winetricks GUI" button DID log
`winetricks -q --gui` in that same run, so winetricks was functional enough to execute.

The parked todo already narrowed the defect to **(B)**: the frame never reaches `dispatchSend`,
strictly between `window.api.winetricksInstall(...)` and the sidecar's `handleFrame`. It
individually excluded, by measurement: unported, missing-from-bundle, stale build, undeclared,
Rust-side allowlist drop, the renderer `declined` guard, the preload binding, and arg
serialisation.

**So what changed between 2026-08-24 and 2026-08-26 is NOT established.** This re-drive scores the
item against its own PASS condition; it does not claim a cause. Two prior explanations for this
defect have already been disproven (`:focus-within` withdrawn by live re-drive), and a third guess
must not be recorded as a finding.

## Step 4's own PASS/FAIL condition (quoted, not paraphrased)

- **PASS:** no `UNPORTED_CHANNEL_MARKER` for any of the three winetricks channels, **AND** the D-11
  observable line appears for `winetricksInstall`.
- **FAIL:** `UNPORTED_CHANNEL_MARKER` appears for any of the three; **or** the D-11 observable line
  is absent after driving the install action.

## Tasks

1. **(auto)** Correct `34.6-UAT.md` test 5's dependency hypothesis against the gate record. Append a
   correction; do not rewrite the original text.
2. **(auto)** Append a `## SUPERSEDES — Step 4 re-drive` section to `34.6-LIVE-GATE.md` with an
   EMPTY result slot, authored BEFORE any driving (D-12 contract-first).
3. **(human)** Operator drives the install action through the Winetricks panel.
4. **(auto)** Record the measured result. Then put the verdict question to the operator EXPLICITLY:
   the gate was closed FAIL under option (c), and its own rule is that no SUPERSEDES re-scopes a
   failing item out of the verdict. Whether `verdict:`/`failing_items:` change is the operator's
   decision, not this task's.

## Constraints

- Do NOT alter Step 8 (Epic logout) or any other scored item.
- Do NOT edit Step 4's original Result text — append a SUPERSEDES section beneath it.
- The environment now differs from the original run (deps installed). A PASS here proves the
  channel works in a properly-provisioned environment; it does NOT retroactively prove the original
  FAIL was environmental.
