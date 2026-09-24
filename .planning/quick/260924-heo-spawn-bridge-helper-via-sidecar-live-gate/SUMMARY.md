---
quick_id: 260924-heo
slug: spawn-bridge-helper-via-sidecar-live-gate
date: 2026-09-24
status: incomplete
title: 'Sidecar-spawn live gate for steam-bridge-helper — 3 of 4 arms measured, the in-app arm is blocked'
todo: .planning/todos/pending/2026-09-23-steam-bridge-helper-never-spawned-by-the-sidecar-only-direct-exec-proven.md
baseline_sha: 4ce3680af
---

## Outcome

`status: incomplete` and the todo stays **OPEN**, deliberately. Three of the todo's four open
questions are measured and closed; the fourth — the in-app arm that is the todo's actual title — is
blocked on a precondition that is the operator's to clear.

## What was measured

| # | arm | result |
| - | --- | ------ |
| 1 | Does Steam need to be running for the pass condition? | **NO** — the todo's own `## Verification` overstated this. Corrected in the todo. |
| 2 | Does `steamBridgeHelperPath` resolve inside the notarized Tauri bundle? | **PASS** — no ENOENT defect. |
| 3 | Negative control (isolated fake HOME) | **PASS** — `rc=2`, MISSING-FILE `dlopen`, exactly as predicted. |
| 4 | Helper spawned BY the sidecar the Rust shell launched | **BLOCKED** — see below. |

Arm 2 was not asked by the todo. It was flagged up front as a cheaper and more likely failure than
the library-validation question the todo frames, measured first, and came back clean —
`publicDir resolved=<bundle>/Contents/Resources/build exists=true`, with the helper present at
exactly that path carrying `flags=0x10000(runtime)`, `TeamIdentifier=S7U223QWXJ` and its single
`disable-library-validation` entitlement. Measuring it was right; it removed the one mechanism that
could have turned this todo into a real defect.

Arm 3's value is that it is the control which makes arm 4 meaningful at all, confirming the todo's
declared real-profile arm is correct rather than an oversight.

The `--help` observation that `quick-260924-962` parked here **by filename** was never actually
written into this todo — only into the parent todo — so it was recorded nowhere anyone actioning this
todo would see. It is now in the todo body, assessed as **correct behaviour, not a defect**, on three
pieces of agreeing evidence (empty argv in production, the persistent-listener transcript, and arm 3
as the sub-second control).

## Why arm 4 is blocked, and why that matters

A GameLib dev instance was running against the real profile (`tauri dev`, shell pid 17908, sidecar pid
17960), holding `gamelib-single-instance.sock`. The single-instance guard runs at the top of `main()`
before the Tauri builder (`main.rs:8315-8325`) and keys on the app-support dir derived from `HOME`,
so the notarized bundle launched against the real HOME would be **Secondary** and `exit(0)` before
spawning its own sidecar.

**That failure reads as a pass.** The dev build's `publicDir` is `Projects/GameLib/public`, where the
helper also exists, so the *dev* build would spawn it and emit the same `[S_API]` lines. Running the
gate without clearing this would have produced a green result proving nothing about the notarized
bundle — the green-check-proving-nothing shape this repo keeps stamping out. It was found before the
run, not after.

## Collateral repair, reported separately

`pnpm planning-gates` was **red at baseline `4ce3680af`**, not from this session's changes: the
previous quick task committed two orphan envelope tags (`</content>`, `</invoke>`) at the tail of
`.planning/quick/260924-g7r-.../260924-g7r-PLAN.md`. Deleted — the gate's own prescribed action,
nothing widened, no exemption added. Gates then **12/12**, up from 11/12.

## Verification

- `pnpm planning-gates` — **12/12** (was 11/12 at baseline, for the pre-existing reason above).
- `npx prettier --check` over the three touched paths returns rc=0, and this is reported as
  **VACUOUS, not as formatting verified**: `.prettierignore:29` is a bare `.planning`, so prettier
  inspected zero files. Probed — `--ignore-path /dev/null --list-different` on the same three paths
  lists all three.
- Todo triage frontmatter re-checked bare, lowercase and in `severity` -> `platform` -> `ready` order.
- No real-profile run occurred: every execution used an isolated fake profile with all eight
  containment variables set. Both fake profiles and both `*.out` captures were shredded.
- No tag pushed, no release run triggered, `/Applications/GameLib.app` untouched.

## What remains

One step, needing the operator: quit the dev instance, then launch Avernum 5 (206040) or Avernum 6
(206060) from the notarized bundle and confirm the `[S_API]` lines appear in GameLib's log under a
sidecar the notarized shell spawned. Steam does **not** need to be running for the pass condition.
