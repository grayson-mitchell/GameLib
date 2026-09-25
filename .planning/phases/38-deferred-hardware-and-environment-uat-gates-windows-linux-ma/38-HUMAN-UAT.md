---
status: false
phase: 38-deferred-hardware-and-environment-uat-gates-windows-linux-ma
source: [38-VERIFICATION.md, 34.1-HUMAN-UAT.md items 1a and 7, 34.10-VERIFICATION.md deferred[0]]
created: 2026-08-22
updated: 2026-09-26
sessions:
  - "Session 1 -- 2026-09-23, Windows 11, tauri dev build `6ad1d7cd9` -- 38-S06 PASS; 38-S08 FAIL row 4; four new defects filed; controller leg not run (blocking defect fixed afterward)"
  - "Sitting 2 -- 2026-09-23, Windows 11, tauri dev build `2cf170c14` -- 38-S08 re-scored PASS on all four checks"
  - "Sitting 3 -- 2026-09-25, Windows 11, tauri dev build `cdf07ee95`/`959e5c01b` -- eight controller items (38-C01a, 38-C01b, 38-C02, 38-C03, 38-C04a, 38-C05, 38-C06, 38-C08) all discharged PASS"
  - "Sitting 4 -- 2026-09-26, Windows 11, INSTALLED shell v0.7.0 (built 2026-09-24 07:34 from `5b6201e26`) -- attribution INFERRED from commit dates, not measured; label corrected by quick 260926-bsl -- 38-W01 PASS, 38-W02 PASS, 38-W03 FAIL accepted by operator decision"
  - "Sitting 5 -- 2026-09-26, Windows 11, INSTALLED shell v0.7.0 (built 2026-09-24 07:34 from `5b6201e26`) with the repo build/main sidecar; label corrected by quick 260926-b5r -- 38-S02 PASS, 38-W06 FAIL accepted; 38-S14 sub-case (a) PASS but item stays OPEN; 38-W04 not run (no CI artifact exists); four defects filed"
---

## Current Test

[Five sittings held: sitting 1 (2026-09-23), sitting 2 (2026-09-23, a re-score), Sitting 3
(2026-09-25), which discharged all eight surviving controller items — 38-C01a, 38-C01b, 38-C02,
38-C03, 38-C04a, 38-C05, 38-C06, 38-C08 — as PASS, and Sitting 4 (2026-09-26, run on the same stale
installed shell as sitting 5 — by inference, not measurement; see the correction in its section),
which discharged the three Windows sitting items — 38-W01 PASS, 38-W02 PASS, 38-W03 FAIL accepted by
operator decision,
and Sitting 5 (2026-09-26, run on a stale installed shell, not a dev build of HEAD; see the
correction in its section), which discharged 38-S02 PASS and 38-W06 FAIL-accepted, scored 38-S14
sub-case (a) PASS without discharging the item, and recorded 38-W04 as not run.
See the "## Sitting 4" and "## Sitting 5" sections below for the artifacts. `38-VERIFICATION.md`
remains authoritative: as of 2026-09-26 it holds 11 open items, 15 discharged, 10 retired. The "6 items seeded, 0
discharged" figure this paragraph used to carry was already stale before this reconciliation, for
reasons unrelated to any of these sittings — see the `## Retired` section's note on that same
staleness.]

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
  module, and no phase since 34.1 has had a controller available. **Borne out:** Sitting 3
  (2026-09-25) ran all EIGHT surviving controller items (the set grew via splits and relocations
  after this note was written — 38-C01a, 38-C01b, 38-C02, 38-C03, 38-C04a, 38-C05, 38-C06,
  38-C08) in one sitting and discharged every one as PASS; see the "## Sitting 3" section below.

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

**Forward pointer, added 2026-09-25 (quick `260925-r8j`):** The controller leg RAN at Sitting 3 on
2026-09-25. See the "## Sitting 3 — 2026-09-25" section below for the result — all eight surviving
controller items discharged PASS, two with honest caveats recorded rather than flattened into an
identical pass. The paragraph above is historical and is left as written.

Disposition of the eight surviving controller items, to be applied at the ledger (all eight are
dischargeable in one sitting; a ninth, `38-C04b`, was retired on 2026-09-25 -- see below):

- `38-C01a` (d-pad) and `38-C01b` (left stick) — the split is DONE at the ledger, not merely "must
  be split". `38-C01a`'s sitting-1 FAIL is SUPERSEDED: it was measured against code that read only
  `buttons[12-15]`, and the hat-axis branch (`nintendoHatDirection`, `axes[NON_STANDARD_HAT_AXIS]`)
  has since been added. `38-C01b`'s sitting-1 PASS is NOT DISCHARGEABLE: it was observed while this
  half was compounded with the d-pad half, and a compound item resolves to a single pass/fail. Both
  halves need a fresh run.
  - **Resolved 2026-09-25 (Sitting 3):** Both discharged PASS. `38-C01a`'s main clause PASSED in
    Console Mode at `cdf07ee95`; its cold-start clause was NOT independently observed as a
    d-pad-specific event and is discharged via `38-C01b`'s shared `!el` recovery branch instead.
    `38-C01b` PASSED both clauses at `959e5c01b` — the sitting's strongest cold-start evidence.
- `38-C03` — the "still unscoreable-as-of-sitting-1" wording is now WRONG. The shifted-index defect
  that made it unscoreable (the pad's face-button HID order) is fixed across quicks `260923-qe5`,
  `260925-9de`, `260925-m5i` and `260925-ms5`, so it is scoreable at the next sitting.
  - **Resolved 2026-09-25 (Sitting 3):** PASSED at `959e5c01b`, with the sitting's best
    armed-branch proof (the `from=` rewrite field, reproduced twice). Its `test:`/`expected:` text
    was also corrected at discharge — a specification correction, not a re-score — because
    tab/shiftTab are rewrites inside `checkAction()`'s switch, never a binding.
- `38-C04a` (B/back) — scoreable at the next sitting, for the same reason as `38-C03`.
  - **Resolved 2026-09-25 (Sitting 3):** PASSED at `959e5c01b`; physical B now binds to `back` by
    printed label, dispatched with no `from=` rewrite.
- `38-C04b` (stick clicks) — RETIRED 2026-09-25 by quick `260925-oyr`. NOT scored, NOT a pass, NOT
  a discharge; nothing was observed. The operator chose "Retire the expectation" over implementing
  stick clicks or leaving it open, because the 34.1 item-7 clause was a misdescription: A /
  `mainAction` already activates the focused element, and no layout ever dispatched
  `buttons[10]`/`buttons[11]` (L3/R3 were measured live at 10/11 by quick `260925-ms5`, but no
  feature exists to attach them to). This SUPERSEDES the earlier locked decision (quick
  `260925-nxt`) to keep the item in `human_verification` so the unmet expectation stayed visible to
  `audit-uat` — it now lives in `human_verification_retired`, and `audit-uat` moved 25 -> 24. See
  `.planning/todos/completed/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md`.
  - `38-C04b` is UNCHANGED here — it was retired, not run, and is NOT part of the Sitting 3
    controller sitting below.
- `38-C08` — unchanged in substance, but of its two independent sitting-1 blockers, BOTH are now
  fixed: (1) the shifted-index defect is fixed (same fix as `38-C03`/`38-C04a`); (2) the caret being
  ~90% dead to a pointer is ALSO fixed — the install-caret todo is in `.planning/todos/completed/`.
  Scoreable at the next sitting.
  - **Resolved 2026-09-25 (Sitting 3):** PASSED at `959e5c01b` — three complete alternations
    between the primary Install half and the caret, identical order every pass. With `38-C07`
    retired, this stands as the only observation of the caret's controller reachability that will
    ever exist.
- `38-C02`, `38-C05`, `38-C06` — still scoreable, unchanged.
  - **Resolved 2026-09-25 (Sitting 3):** All three PASSED at `959e5c01b`. `38-C02` confirmed the
    scroll direction is NOT inverted (177 `rightStickDown` / 57 `rightStickUp`). `38-C05` confirmed
    `scrollCardIntoView` still works post-34.10, after being NOT ATTEMPTED across four consecutive
    prior live gate runs. `38-C06` PASSED with one honest caveat: its clause-(3)
    (expanded-group/checkbox) rests on log evidence (`FilterFacetRow` entries), not operator
    observation — the operator's own words: "very hard as you cant really see what is highlighted
    beyond collapsible areas expanding."

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

## Sitting 3 — 2026-09-25, Windows 11, `pnpm tauri:dev`

**COMMIT BOUNDARY — must be recorded.** This is NOT a clean single-variable sitting. `38-C01a`'s
main clause was observed at `cdf07ee95`. Every other item was observed at `959e5c01b`, after quick
`260925-pga` (accent focus ring replacing the hairline; ring extended to hover; stale-ring
suppression while mousing) landed MID-SITTING. `260925-pga` touches NON-console game cards;
`38-C01a`'s main clause was scored in Console Mode, which that change does not touch.

**Conditions.** Windows 11, `pnpm tauri:dev`, PowerA Advantage Wired Controller for Nintendo
Switch 2. Connect line reproduced byte-identically with prior sittings:

    [GAMEPAD] id="PowerA Advantage Wired Controller for Nintendo Switch 2 (Vendor: 20d6 Product: a720)" mapping="" buttons=17 axes=10

So the raw-HID branch of `checkNintendo` is the code under test.

**Instrument and positive control.** The temporary `[GAMEPAD-ACT]` probe from quick `260925-op0`,
logging the RESOLVED action post-switch with `from=` when the switch rewrote it, plus the focused
element. Positive control taken BEFORE any scoring:

    (17:59:20) [GAMEPAD-ACT] action=mainAction ctrl=0 tag=none

Instrument alive; `action=mainAction` with no `from=` proves physical A binds by printed label on
the raw-HID arm.

**`38-C01a` — PASS (main clause). Console Mode.**

    (18:01:19) [GAMEPAD-ACT] action=padUp ctrl=0 tag=BUTTON cls=consoleCard focused
    (18:01:20) [GAMEPAD-ACT] action=padUp ctrl=0 tag=BUTTON cls=consoleChip
    (18:01:23) [GAMEPAD-ACT] action=padLeft ctrl=0 tag=BUTTON cls=consoleChip
    (18:01:24) [GAMEPAD-ACT] action=padDown ctrl=0 tag=BUTTON cls=consoleQuitButton danger
    (18:01:25) [GAMEPAD-ACT] action=padRight ctrl=0 tag=BUTTON cls=consoleCard focused

All four cardinals dispatched, no `from=` rewrites, focus moved card -> chip -> quit button ->
card, operator confirmed movement and NO WRAP. OVERTURNS sitting 1's FAIL, which observed the
d-pad producing no response at all because the then-current `checkNintendo` read `buttons[12-15]`
while this pad reports the d-pad as a hat axis.

**`38-C01a` — cold-start clause: NOT INDEPENDENTLY OBSERVED.** This is not a d-pad-specific live
observation, recorded honestly rather than claimed. Three attempts failed to arm it:

(a) Reloading inside Console Mode auto-focuses a `consoleCard`, so focus was never null — one such
attempt landed on a focused card and pressing A launched Steam appId 251570.
(b) On the library route two `padLeft` presses two seconds apart both logged `tag=none` while a
card appeared highlighted, but the OPERATOR STATES library-route highlights "do not stick", so
that state is transient and proves nothing.
(c) Home-out/Home-in does NOT clear focus — `(19:04:28) action=padUp ... cls=consoleCard focused`
shows focus already present.

Disposition: the `if (!el) document.querySelector('body')?.focus()` recovery at `gamepad.ts:248`
is SHARED code across `padUp`/`padDown`/`padLeft`/`padRight` and all four `leftStick*` cases in
ONE combined switch case — there is no per-input branch — and `38-C01b` DID arm it with machine
evidence. So `38-C01a`'s cold-start clause is discharged as COVERED BY THE SHARED BRANCH VIA
`38-C01b`, explicitly NOT as a d-pad-specific live observation.

**`38-C01b` — PASS, both clauses. Strongest cold-start evidence of the sitting. Console Mode.**

    (19:01:57) [GAMEPAD-ACT] action=leftStickUp ctrl=0 tag=none
    (19:01:59) [GAMEPAD-ACT] action=leftStickDown ctrl=0 tag=BUTTON cls=consoleCard focused
    (19:02:01) [GAMEPAD-ACT] action=leftStickLeft ctrl=0 tag=BUTTON cls=consoleCard focused
    (19:02:02) [GAMEPAD-ACT] action=leftStickRight ctrl=0 tag=BUTTON cls=consoleCard focused

Four distinct `leftStick*` actions, 1-2s apart so these are clean presses not a repeat burst, no
`from=` rewrites. The FIRST line reads `tag=none` — `currentElement()` was null, so the `!el`
recovery branch ARMED — and from line two onward the focused element is a real DOM-focused
`consoleCard`, which is the recovery actually happening, recorded by the instrument rather than by
recollection. Operator: "the first up highlighted a game that was near bottom of visible page,
from then on each push moved the highlighted game one position as expected." First live
observation of WR-02/WR-03's fix, which the item records as "fixed unit-only during code review,
never observed live."

**`38-C02` — PASS.**

Ledger calls this "the single case most likely to be inverted". Dispatch census across the
session: 177 `rightStickDown`, 57 `rightStickUp` (high counts because scroll uses
`SCROLL_REPEAT_DELAY`). Sign confirmed unambiguously — the operator was asked which games became
VISIBLE, not which way things moved, precisely to avoid the ambiguity: pushing DOWN showed "games
later in the list". NOT inverted. Also confirms the `260925-9de` stick-axis fix reading `axes[5]`
for rightY on the raw-HID arm.

**`38-C03` — PASS, with the sitting's best armed-branch proof. Settings, focus on an MUI select.**

    (19:15:36) [GAMEPAD-ACT] action=tab from=padDown ctrl=0 tag=DIV cls=MuiSelect-select MuiSelect-outlined MuiInputBase-input MuiOu...
    (19:15:36) [GAMEPAD-ACT] action=shiftTab from=padUp ctrl=0 tag=DIV cls=MuiSelect-select MuiSelect-outlined MuiInputBase-input MuiOu...
    (19:16:10) [GAMEPAD-ACT] action=tab from=padDown ctrl=0 tag=DIV cls=MuiSelect-select MuiSelect-outlined MuiInputBase-input MuiOu...
    (19:16:10) [GAMEPAD-ACT] action=shiftTab from=padUp ctrl=0 tag=DIV cls=MuiSelect-select MuiSelect-outlined MuiInputBase-input MuiOu...

Both rewrites fired, reproduced twice, focused element proven to be `MuiSelect-select`, and the
dropdown did NOT open (which is the whole purpose of the rewrite). The `from=` field IS the
armed-branch proof procedure step 2 requires. Two additional rewrite paths confirmed incidentally,
worth recording as corroboration but NOT as separate items:

    (19:15:40) [GAMEPAD-ACT] action=leftClick from=mainAction ctrl=0 tag=DIV cls=MuiSelect-select ...
    (19:15:57) [GAMEPAD-ACT] action=tab from=back ctrl=0 tag=DIV cls=MuiPaper-root ...

**SPECIFICATION CORRECTION (not a re-score — the item passes either way).** `38-C03`'s `test:`
wording read "Gamepad — Tab / Shift+Tab traversal, driven FROM THE CONTROLLER", which reads as
though some button BINDS those actions. A source census confirms NO layout binds `tab` or
`shiftTab` on any pad — they exist ONLY as rewrites inside `checkAction()`'s switch in
`src/frontend/helpers/gamepad.ts`. Sitting 1's note that this item "depends on `buttons[4]/[5]`
shoulders" was WRONG — the shoulders are unbound on every layout. `38-VERIFICATION.md`'s `38-C03`
entry carries the corrected text and this correction disclosure at discharge time.

**`38-C04a` — PASS. Game detail page, normal library.**

    (19:13:22) [GAMEPAD-ACT] action=back ctrl=0 tag=BUTTON cls=button is-success mainBtn

`action=back` with NO `from=` — dispatched unrewritten — and the operator confirms "navigates
back". Closes the defect that made sitting 1 unable to score the item at all: the pad's face
indices arrived as raw HID `[Y, B, A, X]`, so physical B fired `mainAction`. Physical B now binds
to `back` by PRINTED LABEL.

**`38-C05` — PASS. Main library.**

    (19:19:55) [GAMEPAD-ACT] action=padUp ctrl=0 tag=A
    (19:19:56) [GAMEPAD-ACT] action=padDown ctrl=0 tag=A     <- x13, held, walking down the grid

`tag=A` confirms focus on library card anchors. Operator: "if I hold down arrow off end of page
the page scrolls." `scrollCardIntoView` works against the post-34.10 scroll container. This item
had been NOT ATTEMPTED across four consecutive live gate runs and was invisible to `audit-uat`
entirely before relocation.

**`38-C06` — PASS, with one honest caveat that MUST be recorded. Tier-2 filter panel.**

    (19:25:21) [GAMEPAD-ACT] action=leftStickDown ctrl=0 tag=BUTTON cls=alphabet-filter-button
    (19:25:23) [GAMEPAD-ACT] action=leftStickDown ctrl=0 tag=BUTTON cls=dropdownButton
    (19:26:44) [GAMEPAD-ACT] action=leftStickDown ctrl=0 tag=BUTTON cls=FilterFacetRow FilterFacetRow--zero
    (19:26:45) [GAMEPAD-ACT] action=leftStickDown ctrl=0 tag=BUTTON cls=FilterFacetRow
    (19:26:45) [GAMEPAD-ACT] action=leftStickDown ctrl=0 tag=BUTTON cls=NavItem FilterCollectionList__row

Operator answers: (1) focus reaches INTO the panel — yes; (2) moves WITHIN it — yes; (4) a row
below the panel's visible area IS scrolled into view — yes. CAVEAT for (3), the expanded-group /
checkbox clause: the operator could NOT verify it visually — their words: "very hard as you cant
really see what is highlighted beyond collapsible areas expanding." That clause is discharged on
the LOG EVIDENCE (`FilterFacetRow` entries prove focus landed on facet rows) and NOT on operator
observation.

**`38-C08` — PASS, stability clause machine-proven. Steam install dialog, uninstalled game.**

    (19:32:51) [GAMEPAD-ACT] action=padDown ctrl=0 tag=BUTTON cls=button is-secondary mainBtn
    (19:32:53) [GAMEPAD-ACT] action=padUp ctrl=0 tag=BUTTON cls=dropdownButton button outline
    (19:32:55) [GAMEPAD-ACT] action=padDown ctrl=0 tag=BUTTON cls=button is-secondary mainBtn
    (19:32:57) [GAMEPAD-ACT] action=padUp ctrl=0 tag=BUTTON cls=dropdownButton button outline
    (19:33:02) [GAMEPAD-ACT] action=padDown ctrl=0 tag=BUTTON cls=button is-secondary mainBtn
    (19:33:03) [GAMEPAD-ACT] action=padUp ctrl=0 tag=BUTTON cls=dropdownButton button outline

THREE complete alternations between the primary Install half (`mainBtn`) and the caret
(`dropdownButton button outline`), identical order every pass. Operator confirms all four
sub-questions pass. This is exactly the failure `hasZeroArea` in `tauriGamepadInput.ts:57` could
have caused and did not. This item now stands ALONE — its Electron twin `38-C07` was retired when
Phase 35 removed that build, so this is the only observation of the caret's controller
reachability that will ever exist.

**Honest-limits paragraph.** All eight items are discharged PASS at this sitting, but two carry
weaker evidence than the rest and the record says so rather than flattening them into identical
passes: `38-C01a`'s cold-start clause was never independently armed as a d-pad-specific event and
rides on `38-C01b`'s shared recovery branch instead; `38-C06`'s clause (3) rests on log evidence
because the operator could not visually confirm it. Two defects the operator surfaced during this
sitting — controller focus having no perceptible visual affordance, and a mouse-highlighted card
not conferring real DOM focus — are filed separately as pending todos (see Task 4 of quick
`260925-r8j`) and are NOT resolved by any PASS recorded here.

## Sitting 4 — 2026-09-26, Windows 11, installed shell v0.7.0 (`5b6201e26`), label corrected by inference

**Conditions (corrected 2026-09-26, quick `260926-bsl`) — INFERRED, not measured.** Windows 11; the
build was almost certainly the stale installed `%LOCALAPPDATA%/GameLib/gamelib-shell.exe` (forward
slashes, to stay backslash-free), v0.7.0, mtime 2026-09-24 07:34, built from `5b6201e26` (the last
commit before that mtime). Its sidecar is the repo's `build/main/sidecar.js`, a compile-time path
(`resolve_sidecar_entry()`, `main.rs:7823`), so the shell and embedded frontend were stale while the
backend and the shared `gamelib.log` looked current. The single-instance guard makes a concurrent
`pnpm tauri:dev` hand focus over to that instance and exit, which is how the mislabel happened
unnoticed. Originally recorded as "Windows 11, `tauri dev`, DEBUG build"; that label is withdrawn.
The basis, compactly: sitting 4 recorded no clock times and no commit hash at all (sittings 2 and 3
both carry build hashes), so the only proxy is git author dates — sitting 3's block `5a0edd4a9`
20:14:47 on 2026-09-25, the `gamelib.log.old` window 21:01 → 05:42 which names the installed exe,
installed shell pid 12812 started 2026-09-26 05:43:39, sitting 4's content `0736ec037` 06:29:19 and
its UAT block `a710fe9cc` 06:30:22. Both candidate windows name the installed exe and abut, leaving
no dev-build window on 2026-09-26 before the 06:30 write-up; the only clean dev-build gap is
20:14–21:01 on 2026-09-25, which contradicts the recorded date. The build profile is no longer
established, so no claim is made either way (neither release nor debug). `38-W04`/`38-W05` remain
un-runnable for a reason that does not depend on the build profile: no `v*` tag exists, so no
CI-produced NSIS/AppImage artifact exists — the same reason sitting 5 measured, in its own
Conditions paragraph and in the `38-W04` paragraph below.

**Why `38-W01`, `38-W02` and `38-W03` still stand — a desk diff, not a re-run.** The orchestrator
diffed `5b6201e26` (the installed build's source) against `0736ec037` (HEAD at this sitting) at the
desk on 2026-09-26, re-asserted by quick `260926-bsl`. `38-W01` maps to
`src/frontend/components/UI/WindowControls/` and `src/preload/api/tauriWindowChrome.ts`, both
unchanged between the two commits. `38-W02` maps to `tray_image()` (`main.rs:141`) inside the first
8405 lines of `src-tauri/src/main.rs`, byte-identical on both sides at sha1
`f7af5438ac02bc476a76b6493394243506c98232` — plus the tray assets (`src-tauri/icons`), the tray
pixel test, and `src/frontend/themes.scss`, all unchanged between those two commits. `38-W03` maps
to the `on_page_load` origin-only title reset (`main.rs:6491`), also inside that byte-identical
range. The whole +633-line `main.rs` drift between the two commits is Phase 46 single-instance
machinery (`acquire_single_instance`, `current_user_identity`,
`create_single_instance_pipe_instance`, `deliver_to_running_instance_windows`,
`run_windows_single_instance_accept_loop`, `main()`, and the test module) — outside the identical
range these three items exercise. **Nothing was re-run on HEAD** — this is an argument from the
diff that the scores transfer, not an observation. Contrast Sitting 5, whose items (`38-S02`,
`38-S14(a)`, `38-W06`) were frontend-side, where the stale bundle genuinely did change behaviour
(the pre-`3a0e62918` `Dropdown.toggle()`), so its desk diff needed a different, larger set of files
re-checked (see its own "Why the scores transfer to HEAD" paragraph below) — sitting 4's is a
narrower, purely backend/native-window claim.

**Honest limits of this relabel.** This is an inference, not a measurement — unlike sitting 5,
whose installed-shell attribution was measured live (the running pid, its log, its bundle's
pre-`3a0e62918` `Dropdown.toggle()`). An unlogged instance cannot be excluded. The 21:01 → 05:42
window and its attribution to the installed exe come from the `/gsd-debug
mouse-dead-dropdown-disclosure` session's record
(`.planning/debug/resolved/mouse-dead-dropdown-disclosure.md`, commit `1f93c5812`), not from logs
readable on this Mac; the Windows logs were not re-read for this correction. The clean way to settle
it is the `GAMELIB_SHELL_EXE received=` lines in `gamelib.log.old` on the operator's Windows
machine. See
`.planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md`.

**`38-W01` — PASS.** All four custom-titlebar window operations (minimize / maximize / restore /
close) with framelessWindow ON, each driving the real OS window exactly as the equivalent native
title-bar button would. FIRST LIVE CONFIRMATION after five sessions of static-only evidence (plan
34.1-09 + `windowControlsPlacement.test.ts`).

**`38-W02` — PASS, all three legs.** (1) the swap is real and IMMEDIATE on toggle, no restart,
beating the item's "~500ms" bar; (2) black glyph against a LIGHT taskbar reads as a cat (Windows
switched to Light mode, toggle ON); (3) white glyph against a DARK taskbar reads as a cat (back to
Dark mode, toggle OFF). Each variant judged against the taskbar it was designed for. Record that
"dark glyph is hard to read on a dark taskbar", observed mid-sitting, is CORRECT behaviour and not
a failure — same class as the item's own `watch_out`. Record that this is the first live
confirmation `darkTrayIcon` does anything at all, per the item's `prior_state`.

**`38-W03` — FAIL, accepted.**

    [shell] humble_login_open: presentation requested visible=true width=900 height=700 center=true focus_once=true persistent_pin=false light_theme_requested=true sheet_presented=false
    [shell] humble_login_open: title change applied len=22

The bar read `https://www.humblebundle.com` and never became
`https://www.humblebundle.com — Humble Bundle - Log In`; the hook FIRED (`len=22`), which is
corroboration and not proof because the title string is never logged (T-34.4.1-106); root cause is
the `on_page_load` origin-only reset at `main.rs:6491`, reached by elimination across the four
title-setting sites, with THE EVENT ORDERING INFERRED, NOT OBSERVED, because that closure is
macOS-gated-silent; operator accepted it as a deliberate deviation from WR-07's letter. See
`38-W03`'s discharged entry in `38-VERIFICATION.md` for the full record rather than duplicating all
seven components here.

**THE OBSERVATION TRAP, recorded so the next sitting does not repeat it.** The full-colour cat on
the Windows TASKBAR BUTTON is the APPLICATION icon and is NOT the tray glyph. The tray glyph lives
in the notification area, which Windows 11 hides behind the `^` overflow chevron by default. The
monochrome pair is proven by `src/backend/__tests__/trayIconAssets.test.ts:119-137`, which decodes
pixels and asserts `isUniformFill(dark, 0)` (:125) and `isUniformFill(light, 255)` (:131) at
1x/2x/3x — so a coloured tray image is NOT REACHABLE from `tray_image()` at all. Keep this even
though `38-W02` passed: it is what delayed the score, which makes it MORE valuable as a record, not
less.

**Honest-limits paragraph.** `38-W03`'s root cause is an inference from source, not a measurement;
no instrument exists on Windows for that code path. `38-W01` and `38-W02`'s element-level
observations are operator-reported (there is no log line for a window-manager action or a tray
repaint) — what is machine-side is the `[shell]` scrollback for `38-W03` and the pixel assertions
in `trayIconAssets.test.ts` for `38-W02`'s artwork premise, and neither substitutes for the
operator's look. Two todos were filed from this sitting —
`.planning/todos/pending/2026-09-26-login-window-on-page-load-overwrites-the-composed-title.md`
and
`.planning/todos/pending/2026-09-26-tray-glyph-variant-selection-is-manual-and-theme-blind.md` —
and neither is resolved by any PASS recorded here.

## Sitting 5 — 2026-09-26, Windows 11, installed shell v0.7.0 (`5b6201e26`), label corrected

**Conditions (corrected 2026-09-26, quick `260926-b5r`).** Windows 11. The build that actually ran
was the installed `%LOCALAPPDATA%\GameLib\gamelib-shell.exe`, v0.7.0, mtime 2026-09-24 07:34, built
from `5b6201e26` (the last commit before that mtime). Its sidecar is the repo's
`build/main/sidecar.js`, a compile-time path (`resolve_sidecar_entry()`, `main.rs:7823`), so the
embedded frontend and the Rust shell were stale while the backend and the shared `gamelib.log`
looked current. The single-instance guard makes a concurrent `pnpm tauri:dev` hand focus to that
instance and exit. See
`.planning/debug/resolved/mouse-dead-dropdown-disclosure.md` (commit `1f93c5812`) and the pending
todo `2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md` for the full evidence.
Originally recorded as "`pnpm tauri:dev`, DEBUG build, commit `59df4c1b6`"; that label was wrong.
This sitting's build profile is not otherwise established (neither release nor debug), so no claim
is made either way. The `38-W04` not-run reason sitting 5 measured — no `v*` tag, so no CI artifact
exists — does not depend on the build profile.
Two Steam libraries registered (`C:\Program Files (x86)\Steam`, `D:\SteamLibrary`),
`enableSteamNativeInstall` ON at the start of the sitting.

**Why the scores transfer to HEAD: a desk diff, not a re-run.** The orchestrator measured the diff
`5b6201e26..HEAD` at the desk on 2026-09-26. Only the embedded frontend and the Rust shell were
stale; the sidecar/backend was the repo build. There are no changes to the install dialog,
`MainButton`, `GamePage`, or the Steam backend `storeManager`. `contentLightNotice` English copy is
unchanged — only non-English locale files changed. `main.rs` changes in the range are only
`9ca63c7d0`/`1fa6e9e93` (Phase 46 WR-01/WR-02 Windows pipe) and `08f24b05d`/`f3972c70f`
(260925-uok `gamelib://` HKCU self-heal); no cookie lines are touched, and `legendary/user.ts` is
unchanged. The `downloadmanager/utils.ts` change is the stalled-install message pluralisation only.
Mapping each score to its reason:
- `38-S02`: the install path, `MainButton`, `GamePage`, `storeManager` and the dialog are
  unchanged; the `downloadmanager/utils.ts` pluralisation is not exercised.
- `38-S14(a)`: the dialog is unchanged, `contentLightNotice` English copy is unchanged, and the
  copy discrimination is intact.
- `38-W06`: no cookie lines in `main.rs` changed and `legendary/user.ts` is unchanged, so the FAIL
  stands against HEAD and the cookie-removal defect is live on current code.
- The one behavioural difference was `Dropdown.toggle`, which scored nothing (see below).

Nothing was re-run on HEAD. This is an argument from the diff that the scores transfer, not an
observation.

**Four items were taken in as one batch and three were run.** `38-S02` and `38-S14(a)` need
_opposite_ settings states, so the batch was ordered to flip `enableSteamNativeInstall` exactly
once — S02 under the ON state it was already in, then OFF for S14(a) — and `38-W06` was parked
last so its log read was not interleaved with Steam traffic.

**`38-S02` — PASS.** Avadon 2: The Corruption (appId 233310). Clicking the **primary half** of
Install opened nothing — no dialog, modal, overlay, picker, and specifically no flash-and-close;
operator's words: "no nothing appeared, just installed". The landing was verified **on disk**, as
the item demands rather than from the badge: `appmanifest_233310.acf` present in the primary
library and absent from `D:\SteamLibrary`, 167 MB of content under `common\Avadon 2`. The
precondition was proven armed rather than assumed — native installs ON with `libraryCount == 2`
means a library dropdown genuinely existed to be skipped, which is the whole point of the item.

**`38-S14` — sub-case (a) PASS. THE ITEM STAYS OPEN.** This is the part most likely to be misread
later, so it is stated plainly: **a passing (a) does not discharge `38-S14`.** Its `test:` requires
both sub-cases, and (b) needs native installs ON with ≤1 library against this machine's two real
ones. The entry therefore stays in `human_verification` deliberately — moving a half-run item to
`human_verification_discharged` would hide it from `audit-uat` permanently, which is precisely the
silent failure this phase's `audit_tool_note` exists to prevent. What (a) established: one
read-only "Windows" row, the content-light notice, Cancel + Install, nothing else, no empty-state
illustration or heading, and the install completed through Steam's own client. The copy
discrimination — the item's actual FAIL condition since review A-08/WR-04 — is confirmed, because
the rendered notice carried "Turn on native Steam installs in Settings", a clause that exists only
in `contentLightNotice` and never in `contentLightSingleLibraryNotice`.

**`38-W06` — FAIL, accepted. The most valuable result of the sitting.** The operator saw this
dialog verbatim:

    Your account was signed out on this device, but the browser session could not be fully
    cleared. On a shared computer, sign out again or clear your browser data for this site to
    make sure your session doesn't stay accessible.

**The item's central unknown is answered, and answered the opposite way from the one it feared.**
`38-W06` was filed asking whether `cookies_for_domain` succeeds against a window whose page never
resolves. It does: all five censuses returned `verdict=SUPPORTED_NONEMPTY`. **The reads are
healthy off macOS**, which retires the "all reads reject" shape the item's own `prior_state`
called most likely. What fails is the **removal** — `epicgames.com` (10 cookies present) and
`unrealengine.com` (1) both reported zero removed, and the fail-closed guard at
`legendary/user.ts:458-467` threw exactly as designed. The other three domains were never
attempted because their before-census was 0, which is correct behaviour, not a second bug.

This converts a **declared-unverified** assumption into a measured fact. `main.rs:7327-7335` says
in writing: _"Linux/Windows: UNVERIFIED on the existing wry `delete_cookie()` path … the deletion
mechanism itself is UNCHANGED and DECLARED unverified, never silently assumed fixed (nor silently
assumed still broken)."_ It is now measured.

**`38-W04` — NOT RUN, and the reason is now measured rather than assumed.** Sitting 4 recorded
that a debug build cannot reach this item (that build label is now withdrawn — see `## Sitting 4`
— but the not-run conclusion does not depend on it). Sitting 5 adds _why the artifact does not
exist_:
`git tag` lists nine tags and **none matches `v*`**, so `release-tauri.yml`'s push trigger has
never fired — its own header states this at `.github/workflows/release-tauri.yml:5-6`. `gh` is
also not installed on this machine. A locally-built NSIS was considered and **rejected** as a
substitute: the item's `why_human` is specifically that the *CI* artifact has never been executed,
so a `tauri build` installer is a different artifact. **A not-run is neither a discharge nor a
retirement** — nothing was observed.

**THE OBSERVATION TRAP OF THIS SITTING, recorded so the next one does not lose time to it.** The
`MainButton` **caret did not respond to mouse clicks**, and the dialog for `38-S14(a)` had to be
opened by right-clicking the game card instead. All three "Install with options…" doors open the
same dialog with the same label string, so the route does not affect the score — but the caret
itself is a ~~regression of a resolved debug session~~ **[Corrected 2026-09-26, quick
`260926-b5r`: NOT a regression.]** The stale installed bundle that actually ran this sitting
carried the pre-`3a0e62918` `Dropdown.toggle()` functional updater, so this was the already-fixed
defect, not a new one. See
`.planning/debug/resolved/mouse-dead-dropdown-disclosure.md` (commit `1f93c5812`); the operator
confirmed on 2026-09-26 that a mouse click opens the dropdowns on HEAD under `pnpm tauri:dev`.
(`.planning/debug/resolved/steam-caret-dropdown-dead.md`, fixed in `3a0e62918` and verified live
over CDP on this same machine on 2026-09-24, names the fix the stale bundle predates.) The operator
then found the surface is wider than the caret: the **library nav expanders were also mouse-dead,
while the gamepad opened them normally**. That mouse-dead/gamepad-live split is the signature, and
it is filed as its own todo rather than chased here; that todo is now in `completed/` as
not-a-regression.

**Honest-limits paragraph.** Three of the four results in this sitting rest on different evidence
classes and should not be read as equally hard. `38-S02`'s landing half and all of `38-W06` are
**machine-side** (on-disk manifests and `%LOCALAPPDATA%\GameLib\logs\gamelib.log` respectively);
`38-S02`'s absence half and all of `38-S14(a)` are **operator-reported**, because no log line
exists for "a dialog did not open" or "a row rendered". The `38-S14(a)` copy quote was **elided,
not byte-for-byte** — what it establishes is which of the two strings rendered, not that every
character matched the catalog default, and the discrimination does not depend on the remainder.
One claim inside `38-W06` is explicitly an **inference, not a measurement**: a single cookie
vanished between Rust's post-removal re-read and the TypeScript one, which is _consistent with_ an
asynchronous `delete_cookie` but does not establish it; two timestamps are not a mechanism. Four
todos were filed from this sitting and **none is resolved by either PASS recorded here**.
