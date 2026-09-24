---
quick_id: 260925-9de
created: 2026-09-25
title: Fix checkNintendo's axis reads — right stick dead on non-standard Nintendo pads
---

# Operator brief

This file is the task brief, captured verbatim from the operator at task start. It is the
authoritative statement of what is established, what is deduced, and what is out of scope.

## The task

Fix `checkNintendo`'s AXIS reads, which are shared across both mapping paths and were left on the
very assumption last week's face-button fix existed to stop making. On this non-standard
Nintendo-style pad the RIGHT STICK is completely dead: it scrolls nothing.

**This is the sequel to quick `260923-qe5`**, which fixed the FACE BUTTONS and the D-PAD on the
same pad. Read `.planning/quick/260923-qe5-fix-checknintendo-trusting-chromium-stan/260923-qe5-PLAN.md`
and `-SUMMARY.md` first — the harness, the logging technique, the regression bar and the measured
pad facts all carry over. That task deliberately did not touch the axes; this one closes that gap.

## The defect, re-verified in source 2026-09-25

`src/frontend/helpers/gamepad_layouts/nintendo.ts` — `checkNintendo` assigns all four stick axes
at lines 191-194:

```ts
leftAxisX  = axes[0], leftAxisY  = axes[1],
rightAxisX = axes[2], rightAxisY = axes[3]
```

These sit **above** the `if (mapping === 'standard')` branch at line 208, so BOTH the standard and
the raw-HID path get the standard layout's axis indices. The buttons and the hat are now branched;
the axes are not.

## Live evidence measured 2026-09-25

Pad: PowerA Advantage Wired Controller for Nintendo Switch 2 (Vendor: 20d6 Product: a720),
`mapping: ""`, 17 buttons, 10 axes.

- LEFT stick moves focus in all four directions → `axes[0]`/`axes[1]` are correct on this pad.
- RIGHT stick UP/DOWN → **no scroll whatsoever**.
- RIGHT stick LEFT/RIGHT → no visible effect, BUT the DevTools console DOES print
  `[tauriGamepadInput] unhandled gamepad action "rightStickLeft"` and `"rightStickRight"`. That
  warning originates at `src/preload/api/tauriGamepadInput.ts:394` (the `default` arm).
  **Therefore `axes[2]` IS this pad's right-stick X axis — confirmed live, not deduced.**
- The horizontal no-op is BY DESIGN: `rightStickLeft`/`rightStickRight` have no case in the switch
  and never did (the comment at :394 records that Electron's own switch had no case either).
  DO NOT "fix" that here. It is out of scope AND it is the discriminator that gave us `axes[2]`.

## Two hypotheses survive — settle by MEASUREMENT, not deduction

That is the whole first half of this task.

- **H-A**: the right stick's Y is NOT `axes[3]`. Fix = branch the axis indices on `mapping`,
  exactly as the buttons and hat now are.
- **H-B**: the right stick's Y IS `axes[3]`, dispatch is fine, and `doScroll` resolves the wrong
  scroll target. Fix = target resolution, a different change in a different file.

The console CANNOT separate these: `rightStickUp`/`rightStickDown` ARE handled, so they log
nothing. Do not guess between them; measure the axis index first and let the measurement pick the
fix. State in the PLAN which hypothesis each task serves and what result would falsify it.

### What H-B would mean, so it is not re-derived

`doScroll` (`tauriGamepadInput.ts:203`) calls `document.elementFromPoint(innerWidth/2,
innerHeight/2)`, passes that to `findScrollableAncestor` (:188-195) which walks up via
`isScrollable` (:181-186 — false if `scrollHeight <= clientHeight`, false if computed `overflowY`
is `visible` or `hidden`) and FALLS BACK to `document.scrollingElement ?? document.documentElement`.
In this app the document itself does not scroll; an inner container does. So a failed walk yields a
silent no-op.

## The sign convention is NOT the bug and must not regress

`src/preload/__tests__/gamepadAction.test.ts:268-282` ("REQ-34.1-06: rightStickUp decreases
scrollTop and rightStickDown increases it") already pins it: 100→50 on up, 100→150 on down. That
test MOCKS `elementFromPoint` to return a synthetic scrollable, so it proves the SIGN and says
NOTHING about real-DOM target resolution. Keep it green.

## Measured pad facts from `260923-qe5` Task 1 — reuse, do not re-measure

| item | value |
| --- | --- |
| mapping | `""` |
| buttons / axes | 17 / 10 |
| A / B / X / Y | 2 / 1 / 3 / 0 |
| L / R / ZL / ZR | 4 / 5 / 6 / 7 (identical to standard) |
| hat axis | index 9 |
| hat up / right / down / left | -1.00000 / -0.42857 / 0.14286 / 0.71429 |
| hat up-right | -0.71429 |
| hat neutral | **3.28571** (the plan predicted 1.28571 — trust the measurement) |
| stick clicks, Home/Capture | NO observable button index |

## In-repo trap — do NOT inherit these constants on faith

`checkGamecube`, in the SAME FILE at lines 27-30, reads `rightAxisX = axes[3], rightAxisY = axes[4]`
— a different axis layout for the same device family. The 2026-09-25 live test ALREADY FALSIFIED
`axes[3]` as this pad's right-stick X. Same rule that applied to `checkN64Clone1`'s hat table:
derive from observation and say so.

## Instrumentation route, proven on this app

Route diagnostics through `window.api.logInfo` into `gamelib.log`. The DevTools console DISPLAYS
output but accepts NO INPUT on this app (paste fails, Enter does not submit), so it can be read but
not driven. `src/frontend/helpers/gamepad.ts` already carries the PERMANENT
`[GAMEPAD] id=... mapping=... buttons=... axes=...` line — extend alongside it, do not duplicate it.
`260923-qe5` Task 5 removed its temporary `[GAMEPAD-BTN]`/`[GAMEPAD-AXIS]` per-frame dump with ZERO
residue; re-add in that same shape and REMOVE IT AGAIN in a final task, with a `! grep -nE` residue
check (zero matches is the success path, so a bare `grep` breaks the `&&` chain on success).

## Two operator checkpoints are required

The operator runs both.

1. After the dump lands: operator waggles the right stick and reports the axis indices and values.
2. After the fix lands: operator confirms the right stick scrolls in the pushed direction.

Structure the plan so it BLOCKS on each and does not proceed on an assumed value.

## Regression bar, unchanged from `260923-qe5`

Standard-mapped Nintendo pads are CORRECT TODAY and MUST STAY CORRECT. Tests must prove BOTH
mapping paths. Extend `src/frontend/helpers/__tests__/nintendoLayout.test.ts` — `buildHarness()`,
`pressButton()` and `moveHat()` already exist there. Do not invent a parallel harness.

## Also file one todo as part of this task

A separate finding from 2026-09-25 that must not be lost. NO layout in this repo dispatches
`buttons[10]`/`buttons[11]` (L3/R3):

- `standard.ts:24-25` and `genius.ts:27-28` have them COMMENTED OUT.
- `nintendo.ts:25-26`'s live `left = buttons[10], right = buttons[11]` is inside `checkGamecube`,
  where they are the GameCube D-PAD, not stick clicks.
- `ps.ts` has no reference.

Further, `leftClick` is NEVER a button binding anywhere — it is derived from `mainAction` at
`gamepad.ts:188` when `shouldSimulateClick()` is true — and `rightClick` is always a FACE button
(X on Nintendo at `nintendo.ts:199`, Square on PS, `contextMenuButton` on standard).

Consequence: UAT item `38-C04`'s clause "Left/right stick clicks (the click-equivalents) activate
the element currently under focus or cursor" describes a feature THAT DOES NOT EXIST, so it can
never be discharged by a human pressing anything.

DO NOT implement stick clicks in this task — file it, with the frontmatter CLAUDE.md requires
(bare lowercase, in this order immediately after `files:`):

```yaml
severity: medium
platform: any
ready: code
```

`ready: code` because nothing about it needs hardware to establish; the evidence is entirely in
source.

## Do NOT touch the Phase 38 ledger

Do not edit `38-VERIFICATION.md` or `38-HUMAN-UAT.md`. The operator re-scores those as a sitting,
exactly as was done for `38-S08`. Do not fix `checkN64Clone1`'s comment/code contradiction either —
a todo is already filed for it.

## Project rules that bind this task

- Every task's `<verify>` MUST run `npx prettier --check` over the EXACT paths it wrote, scoped to
  explicit paths, NEVER `.` (CLAUDE.md). No other gate here sees formatting; this has cost multiple
  rejected pushes. `.husky/pre-commit` fires on `git commit` only, not on rebase/cherry-pick.
- `<verify>` blocks must be FULLY `&&`-chained. A `;` lets a failing check print its diff while the
  block still reports success — proved on this repo: `( false; echo x; true && true && true )`
  exits 0.
- `pnpm planning-gates` CANNOT run here — its script is `python3 meta/runPlanningGates.py` and
  `python3` on this host is the Microsoft Store alias stub. Use `python meta/runPlanningGates.py`.
  Do NOT "fix" package.json; that would break CI and the macOS host.
- Run `pnpm codecheck` AND the FRONTEND jest project. If scoping jest use `--testPathPattern`, NOT
  a second bare arg after `--selectProjects` (it gets swallowed and silently runs everything).
- Root `tsconfig.json` sets `isolatedModules: true`, so ts-jest transpiles per-file WITHOUT
  type-checking: arity and export errors surface at RUNTIME under jest and only as COMPILE errors
  under `pnpm codecheck`. If a RED is predicted as a compile error, expect a runtime TypeError
  instead and report BOTH.
- RED-prove every new test against pre-fix source via in-place edit + in-place revert. NEVER
  `git stash` (standing repo rule).
- Never bypass git hooks (`--no-verify`, `core.hooksPath`) — not in any subagent, not for planning
  files.

## Concurrent session — read before committing or pushing

Another session is working on `main` from another machine and currently has UNCOMMITTED edits to
`meta/machineFillGamelib.ts`, `meta/__tests__/machineFillGamelib.test.ts` and
`meta/__tests__/gamelibCatalogParity.test.ts`, plus untracked `meta/i18nTranslatorNotes.json`.

The pre-push hook type-checks and lints the WORKING TREE, not just commits, and their edits
currently push `pnpm lint` over its 638-warning ceiling. So: COMMIT normally, but EXPECT the push
to be blocked and DO NOT work around it. Do NOT touch, commit, stash or revert their files. Do NOT
raise the 638 ceiling (CLAUDE.md forbids widening a gate to admit what failed). Report the block
and stop.

Also be aware: the running dev server currently has that session's UNCOMMITTED frontend edits live
via HMR — `NavShell` filter components, `Header/index.tsx`, `Library/index.tsx`, `Humble/Keys/*`,
`Winetricks/*`. The rendering app is NOT clean `main`. Do not be confused by them and do not touch
them.

## Live environment

Windows 11, pad connected, app ALREADY RUNNING under `pnpm tauri:dev` in a background shell with
HMR working. DO NOT start a second dev server. This is a frontend change so HMR picks it up — no
`pnpm build:sidecar` needed — but a full page reload may be required because `App.tsx` defeats Fast
Refresh (`"routes" export is incompatible`).

## Phase 38 payoff

This unblocks `38-C02` (right-stick scroll sign convention), which has never been scoreable, and
likely helps `38-C05`. Both stay the operator's to score.
