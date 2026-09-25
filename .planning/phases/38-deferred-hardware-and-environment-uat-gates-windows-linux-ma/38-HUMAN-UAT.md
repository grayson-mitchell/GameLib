---
status: not_started
phase: 38-deferred-hardware-and-environment-uat-gates-windows-linux-ma
source: [38-VERIFICATION.md, 34.1-HUMAN-UAT.md items 1a and 7, 34.10-VERIFICATION.md deferred[0]]
created: 2026-08-22
updated: 2026-09-25
sessions: []
---

## Current Test

[not started — no hardware sitting yet. 6 items seeded, 0 discharged.]

> **`38-VERIFICATION.md` is the authoritative item list, not this file.** `gsd-sdk query
> audit-uat` reads that file's `human_verification` array and **cannot see `*-HUMAN-UAT.md`
> files at all**. A result recorded only here changes nothing downstream. Record observations
> here for narrative and artifacts; move the entry in `38-VERIFICATION.md` to discharge it.

## Scope

Two independent sittings, not one. They are grouped in a single phase because both are "cannot
run on this machine", but they unblock separately:

- **38-W01** needs a Windows or Linux machine, and needs Phase 34's W/L builds to exist first.
- **38-C01a … 38-C05** need only a game controller. No phase dependency. These can run today if
  the hardware appears, and should be run in **one sitting** — all five exercise the same
  module, and no phase since 34.1 has had a controller available.

## Retired

Nine electron-runtime items were RETIRED on 2026-09-23 by quick `260923-89z`: `38-S01`,
`38-S03`, `38-S05`, `38-S07`, `38-S09`, `38-S11`, `38-S13`, `38-S15` and `38-C07`. Phase 35
removed the Electron build, so no host — Windows, Linux, or otherwise — can run them; they were
never run and nothing was observed, so this is NOT a pass. A Windows or Linux operator planning a
sitting off this file should NOT go looking for an electron row among the retired ids above.
`38-S16` is unaffected and still needs BOTH the Windows and the Linux machine (it is scored on
BOTH matrix row 5 and matrix row 7); `38-S15`'s retirement does not narrow that. The full record,
including each item's `retired_reason`, lives in `38-VERIFICATION.md`'s `human_verification_retired`
array. Separately, and left deliberately unfixed by this retirement: the "6 items seeded" line in
`## Current Test` below was already stale before this change — the ledger held 34 items, not 6 —
for a reason unrelated to this retirement; `38-VERIFICATION.md` remains the authoritative count,
as the blockquote below already says.

## Before the controller sitting

1. **Re-derive the action list from the code.** `src/frontend/helpers/gamepad.ts` and
   `src/frontend/helpers/gamepad_layouts/nintendo.ts` were under active modification on
   2026-08-22. Do not run against the action list as written in 34.1 — read the current source
   and enumerate what exists at sweep time.
2. **Do not attempt any of these at a keyboard.** `gamepadAction` is dispatched only from the
   `navigator.getGamepads()` polling loop (`gamepad.ts:559,678`), so keyboard input never reaches
   `src/preload/api/tauriGamepadInput.ts`. 38-C03 is the trap: its wording says "Tab/Shift+Tab"
   and reads keyboard-runnable. It is not.
3. **Instrument rather than ask.** GameLib's DevTools console accepts no input — paste fails and
   Enter does not submit. Route any probe through the `logInfo` listener so it lands in
   `~/Library/Logs/GameLib/gamelib.log`; a raw `console.*` from the renderer stays in the Web
   Inspector panel and never reaches disk.
4. **Prove each branch was armed before recording a pass.** An item whose code path never
   executed is indistinguishable, in every green result, from one that passed.

## Results

### Session 1 — 2026-09-23, Windows 11 (operator's machine), `pnpm tauri:dev`

First sitting ever held for this phase. Runtime: Tauri dev build, commit at `6ad1d7cd9`.

**`38-S06` — PASS.** Matrix row 5 on Windows, tauri runtime, native installs OFF. All five
checks scored independently per the item's own warning: read-only "Windows" platform row
PRESENT, content-light notice PRESENT, library dropdown ABSENT, wine section ABSENT, free-space
line ABSENT. Operator's words: "test passes, platform row and notice only items."
Reached via the `GameCard` context-menu door (D-27 row 3), NOT the `MainButton` caret — see the
caret defect below.

**`38-S08` - FAIL, on row 4 only.** Matrix row 6 on Windows, tauri runtime, native installs ON
with the operator's two real Steam libraries. Scored independently: read-only "Windows" platform
row PRESENT (pass), library dropdown PRESENT (pass), wine section ABSENT (pass), **free-space
line ABSENT where the item requires PRESENT (FAIL)**.

The failure is NOT in the section-gating matrix. `steamSectionGating.ts:284` sets
`freeSpaceLine = libraryDropdown`, so with the dropdown present the verdict is correctly true.
The render carries three conditions the item never mentions -
`gating.freeSpaceLine && diskSpace && diskSpace.validPath && diskSpace.validFlatpakPath`
(`SteamDialog/index.tsx:493-497`) - and `validPath` is false. Root cause proven by running the
same `Get-Acl` the backend runs: `isWritable_windows` matches ACLs by INDIVIDUAL username, and
neither Steam library carries a per-user ACE. Filed as
`2026-09-23-iswritable-windows-only-true-inside-the-user-profile.md`.

**Four defects found, all NEW and all filed as todos.** None was on record anywhere:

1. `2026-09-23-checknintendo-trusts-standard-mapping-on-non-standard-pads.md` — blocked the whole
   controller leg. See the controller note below.
2. `2026-09-23-steam-install-caret-dropdown-closes-itself-via-synthetic-tab.md` — the caret opens
   ~1 click in 10.
3. `2026-09-23-library-card-art-never-recovers-from-a-missed-visible-cards-event.md` — library
   cards render blank art permanently. Hit TWICE in this sitting, with a DIFFERENT victim set each
   time (contiguous block, then scattered), which refuted the first occurrence's tidy
   commit-boundary explanation and is recorded in the todo as such.
4. `2026-09-23-iswritable-windows-only-true-inside-the-user-profile.md` — the cause of the
   `38-S08` row-4 FAIL above, with a wider blast radius than the item.

**CONTROLLER LEG NOT RUN AT SITTING 1 — the blocking defect is now FIXED, and the leg is RUNNABLE,
not yet a result.** The operator has a PowerA Advantage Wired Controller for Nintendo Switch 2.
Detection works correctly (`isNintendoControllerId` TRUE, `detectControllerLayout` -> `'nintendo'`),
but the pad reports `mapping: ""` and, AT SITTING 1, `checkNintendo` assumed Chromium's standard
POSITION mapping without ever checking it. Measured result AT SITTING 1 (2026-09-23, preserved as
historical record): face buttons arrived as `[Y, B, A, X]`, so physical A LAUNCHED the game while
the hint bar read "A: Game details", and the d-pad was dead (hat axis, not `buttons[12-15]`).

That defect is FIXED, landed across quicks `260923-qe5`, `260925-9de`, `260925-m5i` and
`260925-ms5`: `checkNintendo` now READS the reported `mapping` instead of assuming standard
positions, the d-pad hat axis is handled (`nintendoHatDirection`, `axes[NON_STANDARD_HAT_AXIS]`),
the stick axes are resolved from the mapping too, and actions bind to the PRINTED LABEL rather than
a fixed index. The other three sitting-1 defects — the install-options caret, library card art, and
`isWritable_windows` — are likewise resolved and filed in `.planning/todos/completed/`. This makes
the controller leg RUNNABLE at the next sitting; it is not itself a result, and no item above is
scored by this paragraph.

Disposition of the eight surviving controller items, to be applied at the ledger (all eight are
dischargeable in one sitting; a ninth, `38-C04b`, was retired on 2026-09-25 -- see below):

- `38-C01a` (d-pad) and `38-C01b` (left stick) — the split is DONE at the ledger, not merely "must
  be split". `38-C01a`'s sitting-1 FAIL is SUPERSEDED: it was measured against code that read only
  `buttons[12-15]`, and the hat-axis branch (`nintendoHatDirection`, `axes[NON_STANDARD_HAT_AXIS]`)
  has since been added. `38-C01b`'s sitting-1 PASS is NOT DISCHARGEABLE: it was observed while this
  half was compounded with the d-pad half, and a compound item resolves to a single pass/fail. Both
  halves need a fresh run.
- `38-C03` — the "still unscoreable-as-of-sitting-1" wording is now WRONG. The shifted-index defect
  that made it unscoreable (the pad's face-button HID order) is fixed across quicks `260923-qe5`,
  `260925-9de`, `260925-m5i` and `260925-ms5`, so it is scoreable at the next sitting.
- `38-C04a` (B/back) — scoreable at the next sitting, for the same reason as `38-C03`.
- `38-C04b` (stick clicks) — RETIRED 2026-09-25 by quick `260925-oyr`. NOT scored, NOT a pass, NOT
  a discharge; nothing was observed. The operator chose "Retire the expectation" over implementing
  stick clicks or leaving it open, because the 34.1 item-7 clause was a misdescription: A /
  `mainAction` already activates the focused element, and no layout ever dispatched
  `buttons[10]`/`buttons[11]` (L3/R3 were measured live at 10/11 by quick `260925-ms5`, but no
  feature exists to attach them to). This SUPERSEDES the earlier locked decision (quick
  `260925-nxt`) to keep the item in `human_verification` so the unmet expectation stayed visible to
  `audit-uat` — it now lives in `human_verification_retired`, and `audit-uat` moved 25 -> 24. See
  `.planning/todos/completed/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md`.
- `38-C08` — unchanged in substance, but of its two independent sitting-1 blockers, BOTH are now
  fixed: (1) the shifted-index defect is fixed (same fix as `38-C03`/`38-C04a`); (2) the caret being
  ~90% dead to a pointer is ALSO fixed — the install-caret todo is in `.planning/todos/completed/`.
  Scoreable at the next sitting.
- `38-C02`, `38-C05`, `38-C06` — still scoreable, unchanged.

**`38-S14` will not fully close on this machine.** Sub-case (b) needs "native installs ON with
<=1 library" and the operator's `libraryfolders.vdf` registers TWO real libraries.
`getSteamLibraries()` (`utils.ts:671`) reads Steam's own file and filters by `existsSync`, so the
count is not a GameLib setting that can be turned down. Forcing it by repointing
`defaultSteamPath` was considered and REJECTED: it makes the function return the
`/usr/share/steam` sentinel, a synthetic single-library state no real user has, and recording a
pass against that would be recording a pass against a condition that does not occur. Operator
agreed to skip (b). Sub-case (a) is in scope.

Add a dated session block here when each sitting happens, then move the
corresponding entries in `38-VERIFICATION.md` from `human_verification` to
`human_verification_discharged` — annotating in place does not work, because the audit counts
array membership and ignores any `result:` field.


## Sitting 2 — 2026-09-23, Windows 11, tauri dev build `2cf170c14`

**Scope: one item.** A re-score of `38-S08` row 4, which sitting 1 recorded as the single failing
check and made conditional on a named code fix landing first.

**Preconditions, verified at the tool before the observation.** The fix lives in the sidecar
bundle, which does NOT hot-reload — vite had been hot-reloading the frontend for eleven hours
against a `build/main/sidecar.js` timestamped 06:27:21, i.e. predating the 17:38:50 source edit.
The shell was stopped, its seven orphaned node children reaped, the exe lock confirmed free, and
the app relaunched. The loaded bundle was then checked directly: `gamelib-write-probe` present
(1 hit), `FileSystemRights,IdentityReference` gone (0 hits). Without that check the sitting would
have re-measured the pre-fix code and recorded a false FAIL.

**Result: PASS on all four checks, scored independently.**

| #   | Check            | Expected                     | Sitting 1 | Sitting 2 |
| --- | ---------------- | ---------------------------- | --------- | --------- |
| 1   | Platform row     | PRESENT, read-only "Windows" | PASS      | PASS      |
| 2   | Library dropdown | PRESENT                      | PASS      | PASS      |
| 3   | Wine section     | ABSENT                       | PASS      | PASS      |
| 4   | Free-space line  | PRESENT                      | **FAIL**  | **PASS**  |

**The falsifiable prediction held.** Sitting 1 wrote that row 4 should pass "WITHOUT any change to
`steamSectionGating.ts` -- if a fix there is proposed instead, the diagnosis was wrong." No change
was made there. The entire fix was in `isWritable_windows`.

**Artifacts (procedure step 2 — proving the branch was armed).**

1. The rendered line read `301.44 GiB / 537.15 GiB`. Measured independently at the same sitting
   via `Win32_LogicalDisk`: C: is 301.44 free / 537.15 total; D: is 578.60 / 897.97. The rendered
   figures match C: byte-for-byte. This is the armed-branch proof, not merely a plausibility
   check: `SteamDialog/index.tsx:493-497` suppresses the line ENTIRELY unless
   `gating.freeSpaceLine && diskSpace && diskSpace.validPath && diskSpace.validFlatpakPath`. A
   visible line carrying live disk geometry therefore proves `checkDiskSpace` ran AND returned
   `validPath: true` — which is exactly the value that was false in sitting 1.
2. `gamelib.log` at 18:41:48 — a `[BLANKPROBE]` frontend line reporting the viewport centre as
   `cls":"selectFieldWrapper Field "`, where every earlier probe that session reported
   `cls":"gameList"`. Timestamped machine evidence that the install dialog was open.

**Honest limit on the evidence.** The `checkDiskSpace` handler emits no log line, so there is no
direct verbatim artifact for the free-space text itself. The PRESENCE or ABSENCE of each of the
four elements is operator-reported. Artifacts 1 and 2 corroborate it from the machine side; they
do not replace it. Closing this gap properly would mean instrumenting the branch through the
`logInfo` listener, as this file's own procedure step 1 prefers.

**Re-score caveat.** Sitting 1 ran at `6ad1d7cd9` and sitting 2 at `2cf170c14`, so this is not a
clean single-variable comparison. The five intervening commits are the fix, its tests and planning
documents; none touches the gating path.

**Incidental finding, filed separately.** The operator could not tell what the two numbers meant
("not quite sure why there are two numbers?"). The string is built at
`shellFilesFlowRegistration.ts:333` as `${getFileSize(freeSpace)} / ${getFileSize(totalSpace)}` —
free over total — with no label on either side. Filed as a todo; not a defect in this item, and
row 4 passes regardless, since the item asks only whether the line is present.

**Not observed, and deliberately not claimed.** The library dropdown was not switched to the
second (D:) library, so this sitting confirms the repaired probe on ONE of the operator's two
Steam libraries. The pre-fix code was wrong about both. Switching the dropdown and confirming the
figures change to `578.60 GiB / 897.97 GiB` would extend the result to both libraries and prove
the probe runs per-path rather than being cached from first render.
