---
quick_id: 260924-heo
slug: spawn-bridge-helper-via-sidecar-live-gate
date: 2026-09-24
status: complete
title: 'Sidecar-spawn live gate for steam-bridge-helper — PASSED, all 4 arms, todo closed'
todo: .planning/todos/completed/2026-09-23-steam-bridge-helper-never-spawned-by-the-sidecar-only-direct-exec-proven.md
baseline_sha: 4ce3680af
---

## Outcome

`status: complete` and the todo stays **OPEN**, deliberately. Three of the todo's four open
questions are measured and closed; the fourth — the in-app arm that is the todo's actual title — is
blocked on a precondition that is the operator's to clear.

## What was measured

| # | arm | result |
| - | --- | ------ |
| 1 | Does Steam need to be running for the pass condition? | **NO** — the todo's own `## Verification` overstated this. Corrected in the todo. |
| 2 | Does `steamBridgeHelperPath` resolve inside the notarized Tauri bundle? | **PASS** — no ENOENT defect. |
| 3 | Negative control (isolated fake HOME) | **PASS** — `rc=2`, MISSING-FILE `dlopen`, exactly as predicted. |
| 4 | Helper spawned BY the sidecar the Rust shell launched | **PASS** — see below. |

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

## Arm 4 — the item the todo was opened for

The operator quit the dev instance, clearing the blocker. The gate then ran and passed.

**The GUI could not be driven** — `quick-260924-fast2` measured the Tauri webview as invisible to
Accessibility, so "click Play" is not agent-drivable and that is not a temporary gap. The trigger
used instead was the deep link `gamelib://launch?appName=206060&runner=steam`, which is not a
shortcut past the gate: `protocol.ts`'s `handleLaunch` -> `dispatchSteamLaunch` -> `SteamGame.launch()`
-> `launchBridgeGame()` -> `ensureBridgeHelperReady()` -> `spawnHelperIfNeeded()` is the same call
chain the Play button takes. The bundle was launched by **explicit path**, never by LaunchServices
scheme resolution, which could have handed the URL to the Sep 1 `/Applications/GameLib.app`.

**The parentage proof, read from `ps` rather than inferred from the log:**

```
28635     1 <bundle>/Contents/MacOS/gamelib-shell
28648 28635 <bundle>/Contents/MacOS/gamelib-sidecar
28655 28648 <bundle>/Contents/Resources/build/bin/arm64/darwin/steam-bridge-helper
```

The helper's parent **is** the notarized bundle's own sidecar. `dlopen` succeeded (the `[S_API]`
lines are Valve's dylib talking), there was no Team ID mismatch, no `bridge helper process error`,
and the not-ready status was `not-inited` — the finding-#7 "up but not initialized against a live
Steam session" branch, explicitly **not** the "unreachable within poll budget" branch that would
have been a genuine finding. Steam was not running throughout, and it did not matter, exactly as
arm 1 argued from the todo's own evidence.

The game did not launch, correctly: `launchBridgeGame()` refuses without a live Steam identity
(D-05/D-06). Teardown clean — helper reaped with the app, no orphans, socket removed.

## The blocker that had to be cleared first, and why it mattered

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

Nothing. The todo is closed.
