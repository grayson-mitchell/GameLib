---
status: false
phase: 38-deferred-hardware-and-environment-uat-gates-windows-linux-ma
source: ["38-VERIFICATION.md", "34.1-HUMAN-UAT.md items 1a and 7", "34.10-VERIFICATION.md deferred[0]"]
created: 2026-08-22
updated: 2026-09-30
sessions:
  - "Session 1 -- 2026-09-23, Windows 11, tauri dev build `6ad1d7cd9` -- 38-S06 PASS; 38-S08 FAIL row 4; four new defects filed; controller leg not run (blocking defect fixed afterward)"
  - "Sitting 2 -- 2026-09-23, Windows 11, tauri dev build `2cf170c14` -- 38-S08 re-scored PASS on all four checks"
  - "Sitting 3 -- 2026-09-25, Windows 11, tauri dev build `cdf07ee95`/`959e5c01b` -- eight controller items (38-C01a, 38-C01b, 38-C02, 38-C03, 38-C04a, 38-C05, 38-C06, 38-C08) all discharged PASS"
  - "Sitting 4 -- 2026-09-26, Windows 11, INSTALLED shell v0.7.0 (built 2026-09-24 07:34 from `5b6201e26`) -- attribution INFERRED from commit dates, not measured; label corrected by quick 260926-bsl -- 38-W01 PASS, 38-W02 PASS, 38-W03 FAIL accepted by operator decision"
  - "Sitting 5 -- 2026-09-26, Windows 11, INSTALLED shell v0.7.0 (built 2026-09-24 07:34 from `5b6201e26`) with the repo build/main sidecar; label corrected by quick 260926-b5r -- 38-S02 PASS, 38-W06 FAIL accepted; 38-S14 sub-case (a) PASS but item stays OPEN; 38-W04 not run (no CI artifact exists); four defects filed"
  - "Sitting 6 -- 2026-09-28, Linux (Pop!_OS 22.04, X11), tauri dev build `54a931199`, identity proven by PID -- 38-S04 PASS"
  - "Sitting 7 -- 2026-09-29, Linux (Pop!_OS 22.04, X11), tauri dev build `ecd214a6f`, identity proven by PID -- 38-S10 PASS"
  - "Sitting 8 -- 2026-09-29, Linux (Pop!_OS 22.04, X11), tauri dev build `4a99e1d6b`, identity proven by PID -- 38-S12 PASS"
  - "Sitting 9 -- 2026-09-29, Linux (Pop!_OS 22.04, X11), tauri dev build `55aa0d54b`, identity proven by PID -- 38-S16 Linux/row-7 half PASS, item stays OPEN (Windows/row-5 half not scored)"
  - "Sitting 10 -- 2026-09-29, Linux (Pop!_OS 22.04, X11), CI-produced AppImage from release-tauri.yml run 35942560790 (`19b5e3a9e`), signature not verified -- 38-W05 FAIL (GLIBC_2.39 not found, exit 1 at 65 ms, no window), item stays OPEN"
  - "Sitting 11 -- 2026-09-30, Linux (Pop!_OS 22.04, X11), CI-produced AppImage from release-tauri.yml run 36556473399 (`b48e8948f`, ubuntu-22.04 build), signature not verified -- 38-W05 CONFOUNDED (window at 270 ms then SIGABRT at 364 ms, EGL_NOT_INITIALIZED on a host with a broken NVIDIA driver/library pair; glibc failure of sitting 10 cleared), item stays OPEN"
  - "Sitting 12 -- 2026-09-30, Linux (Pop!_OS 22.04, X11), CI-produced AppImage from release-tauri.yml run 36556473399 (`b48e8948f`, ubuntu-22.04 build), signature not verified, NVIDIA driver/library matched at launch -- 38-W05 PASS (direct launch with no workaround, window at 265 ms, 11/11 samples, bundled sidecar alive, interactive Library UI, 0 glibc/EGL lines), discharged"
  - "Sitting 13 -- 2026-09-30, Windows 11 (operator's machine), CI-produced NSIS installer from release-tauri.yml run 36556473399 (`b48e8948f`, timing-bound, Authenticode NotSigned, updater .sig not verified), `pnpm tauri:dev` at `64bf2bfb4` (real-profile arm), and the spike 027 harness (native MSVC build) -- 38-W04 PASS, 38-S14 PASS (sub-case b incl. a real ADOM install), 38-S16 PASS (Windows/row-5 half), 38-E01 PASS, all four discharged; 38-E03 and 38-E04 branch (b) PASS on a modified harness, both items stay OPEN"
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
staleness. On 2026-09-28, quick `260928-raq` — which was NOT a sitting, no hardware was touched —
discharged `38-E02` as ANSWERED on spike evidence, so the ledger now holds 10 open items, 16
discharged, 10 retired. See the "Spike evidence — 2026-09-28 (not a sitting)" section below for
the artifacts. Later the same day, Sitting 6 — the FIRST LINUX SITTING — discharged `38-S04` PASS,
so the ledger now holds 9 open items, 17 discharged, 10 retired; see the "## Sitting 6" section
below for the artifacts. Sitting 7, the second Linux sitting, scored `38-S10` PASS; the ledger now
holds 8 open items, 18 discharged, 10 retired; see the "## Sitting 7" section below. Sitting 8, the
third Linux sitting, scored `38-S12` PASS, so the ledger now holds 7 open, 19 discharged and 10
retired items; see the "## Sitting 8" section below. Sitting 9, the fourth Linux sitting, scored
`38-S16`'s Linux/row-7 half PASS WITHOUT discharging it (the item also needs its Windows/row-5
half), so the ledger still holds 7 open, 19 discharged and 10 retired items; see the "## Sitting
9" section below. Sitting 10, the fifth Linux sitting, smoke-launched the CI-produced AppImage
(`38-W05`) and scored it FAIL (the loader rejected it with `GLIBC_2.39` not found on this
glibc 2.35 host; exit 1 after 65 ms, no window), so the ledger still holds 7 open, 19 discharged
and 10 retired items and `38-W05` stays open; see the "## Sitting 10" section below. Sitting 11, the sixth Linux
sitting, re-ran it against the ubuntu-22.04-built AppImage from run `36556473399` and scored it
CONFOUNDED (the loader accepted it, a window appeared at 270 ms, then the shell aborted with
`EGL_NOT_INITIALIZED` 364 ms after spawn on a host whose NVIDIA driver and library versions
mismatch), so the ledger still holds 7 open, 19 discharged and 10 retired items and `38-W05` stays
open; see the "## Sitting 11" section below. Sitting 12, the seventh Linux sitting, re-ran it with the host's NVIDIA mismatch cleared and scored it
PASS (a direct launch with no workaround, a window at 265 ms, 11 of 11 samples, the bundled sidecar alive and an interactive Library
UI at t=30), so the ledger now holds 6 open, 20 discharged and 10 retired items; see the "## Sitting 12" section below.
Sitting 13, back on the operator's Windows 11 machine, scored `38-W04` PASS (the CI-produced NSIS installer
installed and the shell survived 12 of 12 samples), `38-S16`'s Windows/row-5 half PASS, `38-S14`'s sub-case (b)
PASS including a real install, and `38-E01` PASS on the spike 027 harness, discharging all four; it also scored
`38-E03` and `38-E04` branch (b) PASS on a modified harness without discharging either, so the ledger now holds
2 open, 24 discharged and 10 retired items; see the "## Sitting 13" section below.]

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
readable on this Mac; the Windows logs were not re-read for this correction. The clean way to have
settled it would have been the `GAMELIB_SHELL_EXE received=` lines in `gamelib.log.old` on the
operator's Windows machine, but that evidence has since rotated away. See
`.planning/todos/completed/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md`.

**Inference accepted as final (2026-09-26, quick `260926-dxa`).** The operator accepted the
commit-date inference above as final. Measured 2026-09-26 on the Windows machine: both
`%LOCALAPPDATA%/GameLib/logs` files have rotated -- `gamelib.log.old` now starts 09:38 and
`gamelib.log` 09:40, both 2026-09-26 -- so the `GAMELIB_SHELL_EXE received=` lines that could have
settled sitting 4's build attribution no longer exist. The label therefore stays INFERRED
permanently, and the three desk-diff results (`38-W01`, `38-W02`, `38-W03`) below are unchanged.

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

## Spike evidence — 2026-09-28 (not a sitting)

**No operator sitting took place on 2026-09-28.** No hardware was booted, no controller was
paired, and no entry was added to this file's `sessions:` list. What changed came from reading
and running three existing spikes against a real Linux desktop and a cross-compiled Windows
target, not from an operator observing GameLib on Windows or Linux hardware.

**What changed, and how.** `38-E02` (Linux `add_child` backend feasibility) was discharged as
ANSWERED in `38-VERIFICATION.md`: spike 025 showed attach, page load and cookie reads all work
natively on Linux webkit2gtk; spike 026 showed positioning is a source-confirmed no-op there
(Tauri packs the child into the window's shared `GtkBox`, and wry only writes bounds for a
`GtkFixed` parent). `38-E01` (Windows `add_child` backend feasibility) was narrowed, not
discharged: spike 027 type-checked the same harness against Tauri's Windows/WebView2 backend from
a Linux host, which answers the compile-level question but not the runtime one. The Linux
branches of `38-E03`/`38-E04` were re-gated onto a new design-decision todo instead of the
superseded "no implementation exists" premise, since a Linux slot rect does not exist to measure
retina scaling or drag-resize latency against until that decision lands.

**Artifacts.** `.planning/spikes/025-linux-add-child-compile/README.md`,
`.planning/spikes/026-linux-add-child-runtime/README.md`,
`.planning/spikes/027-windows-add-child-crosscheck/README.md`, and spike 025's committed logs
(`run-clean-probe-b-skipped.log`, `crash-segfault-journalctl.txt`, `crash-probe-b-stdout.log`,
`events-export.json`), cited here by path only.

**The ledger had also been invisible to gsd-core `audit-uat` since 2026-09-23**, because
`38-VERIFICATION.md`'s frontmatter was invalid YAML (an unescaped colon-space sequence in
`score:`, and six unescaped double quotes in `38-S08`'s `result:`). The same quick task repaired
both syntax-only and confirmed the repair at the tool: `by_phase["38"]` moved from absent to 11,
then from 11 to 10 once `38-E02` discharged.

**`38-VERIFICATION.md` is authoritative**, exactly as the note above this section already says —
this section is narrative and artifact pointers only, and records nothing that was not also
moved in that file.

## Sitting 6 — 2026-09-28, Linux (Pop!_OS 22.04, X11), `pnpm tauri:dev` at `54a931199`

**This is the FIRST LINUX SITTING Phase 38 has ever had.** The 2026-09-28 spike-evidence section
above explicitly was not a sitting (no hardware was booted); this one is: `pnpm tauri:dev` was
launched live on this Linux host under a synthetic X11/`xdotool`/`mss` capture instrument, and
one item, `38-S04`, was scored.

**Conditions.** Build identity was PROVEN, not labelled: the GameLib window's `_NET_WM_PID`
resolved through `/proc/<pid>/exe` to `src-tauri/target/debug/gamelib-shell`, and
`git status --porcelain -- src src-tauri package.json` was empty at launch (HEAD `54a931199`).
This sitting ran under the operator's REAL `HOME`, DECLARED as a real-profile arm under CLAUDE.md's
two-profile rule (half 2): `shell.openExternal(steam://install/<id>)` hands off through `xdg-open`
to the real Steam client, and a faked `HOME` would have bootstrapped a second Steam install into a
fake profile instead of using the operator's actual, signed-in Steam session. This was the FIRST
GameLib Tauri run on this host, and it created `~/.config/GameLib/` as real, persistent profile
state — left in place for the remaining Linux items (`38-S10`, `38-S12`, `38-S16`'s Linux half).
Native Steam installs were OFF: `~/.config/GameLib/config.json` key
`defaultSettings.enableSteamNativeInstall` was already `false` at session start (the runtime
default), so no toggle was needed. The lowercase `~/.config/gamelib/` directory belongs to a
stale, unrelated Electron-era deb build and is not read by this build. The Steam desktop client
was confirmed running and signed in (`pgrep -x steam`) before the scored click, after the operator
completed Task 2's sign-in — the GameLib in-app Steam login showed "Connected" and the Library
listed 381 games including many Steam titles. The Linux log sink is
`~/.local/state/GameLib/logs/gamelib.log` (NOT the `pnpm tauri:dev` terminal — sidecar log lines
never reach it, per the live-gate contract).

**Positive control.** Run BEFORE the scored click, per Test 4 (absence-observability), via the
`SteamInstallCaret` menu's "Install with options…" item on the WazHack game page. Max
changed-pixel fraction across the burst was 0.1090 (>= the 0.10 threshold), and the max-diff frame
was viewed and confirmed to show the `contentLightNotice` dialog ("This installs through Steam's
own client, so there's nothing to choose here..."). The dialog was closed via its own X button and
a follow-up grab confirmed it was gone. This control proves the absence instrument CAN see a
GameLib dialog before any scored observation is trusted; it does not itself score `38-S10` or
`38-S16`.

**The result — `38-S04` PASS.** Target: WazHack, Steam appId `264160` — owned (377 hours logged
playtime), visible in the Library, and confirmed NOT installed (`appmanifest_264160.acf` absent
from all four `libraryfolders.vdf` library paths on this host, matching the app's own
`steam_library.json` cache, `is_installed: false`). The scored click landed on the PRIMARY half of
the Install button (the button face, not the caret) at absolute coordinates (1778, 941), captured
by a 6-second burst at fps=18.6, median inter-frame interval 50.6ms. The arming log line, read from
`gamelib.log` at 07:27:34 — matching the click's epoch millisecond to the second — was:

`SteamGame: delegating install for appId 264160 via steam://install/264160`

(`src/backend/storeManagers/steam/games.ts:1194-1197`, reachable only when
`isSteamNativeInstallEnabled()` is false at `:1185`). Its presence proves the no-target branch
(`InstallGameModal.ts:245-253`) ran and the degrade branch (`:275`, the only quick-install route to
a dialog) did not — the two are mutually exclusive at `:263-275`. No ERROR line and no `34.13
installSteamGame: the install dispatch REJECTED` line appeared anywhere in the click-to-+20s
window. The maximum changed-pixel fraction across the entire scored burst was 0.0209 — well under
the flag threshold of half the positive control (0.0545) — and zero frames were flagged. Every
frame VIEWED (the pre-click frame, the max-diff frame, the +10s still and the +20s still) shows
only GameLib's own in-place "Installing…" progress-bar and button-label state change on the
WazHack game page. No dialog, modal, overlay, picker, error dialog, or any partial or flashing one
ever appeared.

**Window attribution.** `clients` dumps taken at baseline, mid-burst, +10s and +20s recorded an
IDENTICAL window-id set throughout — zero new top-level windows at any point. The only
non-desktop windows present the whole time were the GameLib window itself (PID `23810`, this
sitting's proven-identity build) and a PRE-EXISTING Steam client window (`steamwebhelper`, PID
`34245`, `WM_CLASS` `"steamwebhelper","steam"`, title `"Steam"`). Per D-18 and the objective's
SCORED SURFACE rule, that Steam-client window is the expected handoff — recorded here, and NOT
scored against the item. No appmanifest for appId `264160` appeared at +20s+ on the Steam side
either, so no download started and nothing needed cancelling.

**Scope note.** With native installs OFF, the primary-half click never evaluates
`resolveSteamSectionGating`. This PASS observes the Linux quick-install DISPATCH — the no-target
branch, `installSteamGame`, `shell.openExternal` through `xdg-open` — not the
`platformRow: 'absent'` absent-row render, which belongs to `38-S10` and to `38-S16`'s Linux half.

**Honest-limits paragraph.** The measured ~50ms frame interval bounds the shortest flash this
burst could see; a dialog that opened and closed faster than that would not have been caught. The
structural argument from the arming-line/degrade-branch mutual exclusivity covers the quick-install
dialog path specifically, and says nothing about an unrelated overlay elsewhere in the app. The
evidence here is entirely machine-side — no operator eyeball was collected during the scored click
itself, unlike sitting 5's `38-S02`/`38-W06`.

**`38-S10`, `38-S12` and `38-S16`'s Linux half were NOT scored this sitting.** The positive
control incidentally exercised the row-7 dialog surface those items cover, but nothing was
recorded against them; the instrument built for this sitting (`linux_sitting_capture.py`) is
reusable for them as cheap next candidates.

**Artifacts.** `.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/evidence/`:
`positive-control-max.png`, `scored-pre-click.png`, `scored-max-diff.png`, `scored-plus10s.png`,
`scored-plus20s.png`, `clients-new-windows.txt`, `log-excerpt.txt`. Capture instrument:
`.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py`.
quick `260928-tvk`.

## Sitting 7 — 2026-09-29, Linux (Pop!_OS 22.04, X11), `pnpm tauri:dev` at `ecd214a6f`

**This is the SECOND LINUX SITTING Phase 38 has had.** One item, `38-S10`, was scored: the
section-gating matrix row-7 absent arm (native Steam installs OFF).

**Conditions.** Build identity was re-proven, not labelled: the GameLib window's `_NET_WM_PID`
(115840, after one relaunch — see the deviation note below) resolved through `/proc/115840/exe` to
`src-tauri/target/debug/gamelib-shell`, and `git status --porcelain -- src src-tauri package.json`
was empty at launch (HEAD `ecd214a6f`). DECLARED REAL-PROFILE ARM (CLAUDE.md two-profile rule,
half 2), carried over from sitting 6: this sitting ran under the operator's real `HOME`, continuing
sitting 6's persistent `~/.config/GameLib/` profile and its already-signed-in Steam session, which
Task 1's live check confirmed was still usable (the Library listed 381 games including several
owned-but-not-installed titles offering Install) — the Task 2 checkpoint therefore SELF-SKIPPED,
no operator pause was needed. Unlike sitting 6, the `shell.openExternal` leg was NOT exercised this
sitting, because this item only opens and closes the dialog and never clicks Install. Native Steam
installs were OFF: `~/.config/GameLib/config.json` key `defaultSettings.enableSteamNativeInstall`
was `false` at session start (the runtime default), corroborated a second way by the rendered
notice string itself (see below). Of the 4 registered `libraryfolders.vdf` paths, only 2 currently
exist on disk (`~/.steam/debian-installation` and `/mnt/PopGames/SteamLibrary`) — a `38-S12`
readiness note, not scored here.

**Deviation — one relaunch, unrelated to GameLib.** Partway through Task 3, clicking the target
game's cover froze the captured window region into a static, byte-identical blurred frame across
repeated grabs and mouse moves. A full-desktop screenshot resolved it: the X11 session had
auto-locked from idle time during the long file-reading phase between Task 1 and Task 3
(`loginctl … LockedHint=yes`), showing the GDM/GNOME lock-screen curtain over every window,
including GameLib's. This was NOT a WebKitGTK rendering defect. The dev build was relaunched once
under `WEBKIT_DISABLE_DMABUF_RENDERER=1` before the lock was diagnosed (a deviation that turned out
unnecessary but harmless — the new build's identity was re-proven the same way), the operator was
asked to unlock the machine, and execution resumed cleanly once `loginctl` reported
`LockedHint=no` and a fresh grab showed normal Library rendering again.

**Target.** 7 Days to Die, Steam appId `251570` — owned, visible in the Library, confirmed NOT
installed (no `appmanifest_251570.acf` in either currently-mounted library path). WazHack (`264160`,
sitting 6's target) was **disqualified**: its own sitting-6 PASS click had, by this sitting, gone on
to complete a real Steam download, so `appmanifest_264160.acf` now exists for it. Route: the
`SteamInstallCaret` menu beside Install on the game page, then "Install with options…".

**The five region facts — all five scored INDEPENDENTLY, on two instruments.**

| Region | Expected | Visual (crop) | Text-tree (in-dialog count) | Verdict |
| --- | --- | --- | --- | --- |
| Platform row | ABSENT | No `SelectField` (`platformPick`) anywhere in the dialog | 0 | ABSENT — PASS |
| Library dropdown | ABSENT | No `SelectField` (`steamLibraryPick`); `COMBO_BOX_COUNT`=0 | 0 | ABSENT — PASS |
| Wine section (3 sub-signatures) | ABSENT | No WineSelector labels, no `sharedBottleNotice`, no "Checking install options…" row | 0 | ABSENT — PASS |
| Free-space line | ABSENT | Nested in the (absent) library dropdown's `afterSelect`; never rendered | 0 | ABSENT — PASS |
| Content-light notice | PRESENT | `.infoBox` reads the `contentLightNotice` string verbatim | 1 | PRESENT — PASS |

**Notice-string arming note.** The rendered notice was `gamelib:steam.install.contentLightNotice`
(the native-OFF arm, containing "Turn on native Steam installs in Settings"), NOT
`contentLightSingleLibraryNotice` (which would contain "only one Steam library on this system").
This corroborates native installs OFF as the dialog itself saw it, independent of the `config.json`
read.

**Header-icons note.** Two decorative platform icons (Linux, Windows) render beside the dialog
title via `InstallModal__platformIcon` — these are NOT the platform row and were recorded as seen,
not scored.

**Transient check.** Burst fps=9.3, median interval 95.6ms (bounding the shortest flash the
instrument could see to roughly 96ms). `diff --flag 0.005` over 35 settle-diff frames (the settled
dialog plus every post-click burst frame) flagged 5 frames, ALL within the 505ms MUI Slide
open-transition window (max_fraction=0.3605 at the click-epoch frame), and 0 flagged after. Every
flagged frame was individually viewed — none showed a platform row, library dropdown, wine section,
free-space line, or "Checking install options…" row at any point; the only visible change across
flagged frames was the dialog's own slide-in position.

**Text-instrument validity — VALID.** Positive control (dialog open): at least one dialog-role node
existed, `title` count 3 and `content_light_off` count 1 in-dialog, and the dialog-subtree role
histogram included a push button named "INSTALL". Negative control (dialog closed, taken before the
scored click): 0 dialog-role nodes anywhere, so trivially no dialog subtree carrying
`content_light_off`. Both controls held, so the instrument counts above are trusted at face value.

**The result — `38-S10` PASS.** All five checked independently on both instruments; native OFF
proven twice; the whole dialog was in view (title, close X, body, footer Install button, no
scrollbar); no transient render. Moved to `human_verification_discharged` in `38-VERIFICATION.md`
(9 → 8 open, 17 → 18 discharged); `audit-uat` `by_phase["38"]` moved 9 → 8 and `total_items` 428 →
427.

**Row-7 arm scope.** Only the native-OFF arm of row 7 was run this sitting, per the objective's own
ROW-7 ARM SCOPE note — this host currently mounts 2 of the 4 registered Steam library paths, so a
native-ON arm here would very likely land on row 8 (`38-S12`), not row 7.

**Honest-limits paragraph.** The free-space line check is an independent observation but not an
independent code path (`freeSpaceLine === libraryDropdown` by construction). The wine-section
verdict confirms a by-construction false (`wineSection` requires `isMac`). `hostPlatform` `'linux'`
is established by source and by the host, not read from the running webview, though the observed
absent platform row itself excludes `darwin`/`win32`. The 95.6ms median burst interval bounds the
shortest detectable flash. The text instrument sees what WebKitGTK exposes to AT-SPI, not the DOM
directly. There was no operator eyeball. The `shell.openExternal` leg was not exercised this
sitting.

**`38-S12`, `38-S14` and `38-S16`'s Linux half were NOT scored this sitting.** The capture and
AT-SPI probe instruments are both reusable as-is for them as cheap next candidates.

**Artifacts.**
`.planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/evidence/`:
`pre-open.png`, `dialog-settled.png`, `dialog-crop.png`, `region-checks.txt`,
`atspi-dialog-subtree.txt`, `log-excerpt.txt`, `burst-summary.txt`, `baseline.env`. Capture
instrument (reused as-is):
`.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py`.
New text-tree instrument:
`.planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/atspi_dialog_probe.py`.
quick `260929-ata`.

## Sitting 8 — 2026-09-29, Linux (Pop!_OS 22.04, X11), `pnpm tauri:dev` at `4a99e1d6b`

**This is the THIRD LINUX SITTING Phase 38 has had.** One item, `38-S12`, was scored: the
section-gating matrix row-8 hasChoice arm (native Steam installs ON, more than one registered
library).

**Conditions.** Build identity was proven, not labelled: the GameLib window's `_NET_WM_PID`
(213707) resolved through `/proc/213707/exe` to `src-tauri/target/debug/gamelib-shell`, and
`git status --porcelain -- src src-tauri package.json` was empty at launch (HEAD `4a99e1d6b`).
DECLARED REAL-PROFILE ARM (CLAUDE.md two-profile rule, half 2), justified for THIS item
specifically: row 8's library conjunct IS the operator's real Steam state — the replica and the
app both read the real `libraryfolders.vdf` through the real `defaultSteamPath`
(`~/.steam/steam`) and the real mount state of the drives it names, and a fake HOME has no
`config.json` and no `~/.steam`, so `getSteamLibraries()` would take its unfiltered early return,
give a count of 1, and row 8 could never arm at all. Unlike sitting 6, the `shell.openExternal`
leg was NOT exercised this sitting either, because this item never clicks Install; nothing was
dispatched and nothing was installed. The screen was LOCKED at the start of this sitting
(`loginctl … LockedHint=yes`, matching the state at planning time) — Task 1's own Step 0 stopped
before launching anything and raised a blocking human-action checkpoint; the operator confirmed
"screen is unlocked," which was independently re-verified (`LockedHint=no`) before anything was
launched. An idle inhibitor (`gnome-session-inhibit --inhibit idle`) ran for the duration and was
killed at cleanup. Task 2's checkpoint SELF-SKIPPED: a live check found Steam sign-in already
usable (the Library listed 381 games including 7 Days to Die, owned and not installed) and the
replica already reported `COUNT=2`, so no operator pause was needed for either precondition.

**ARMING.** `enableSteamNativeInstall` was `false` at session start (unchanged through Task 1 and
Task 2), toggled to `true` through the Settings UI as late as possible (Task 3 step A, immediately
before the scored open), read back as `true`, and restored to `false` through the same UI toggle
immediately after scoring, read back again to confirm. `steam_library_replica.cjs` (new, this
sitting — a line-for-line, read-only replica of `getSteamLibraries()`/`listSteamLibraryTargets()`)
reported `COUNT=2` both times it ran (Task 1 and immediately pre-open): the `/usr/share/steam`
sentinel MISSING, `~/.steam/debian-installation` EXISTS (primary), the two external-drive paths
MISSING, `/mnt/PopGames/SteamLibrary` EXISTS. **No library registration was needed to arm this
item on this host — contrary to the item's own `blocked_by:` text** (preserved verbatim in the
ledger as history): two of the four registered paths already existed on disk, already exceeding
the `>1 library` threshold `hasChoice` reads.

**Target.** 7 Days to Die, Steam appId `251570` (continuity with sitting 7) — owned, visible in
the Library, confirmed NOT installed in either existing library. Route: the `SteamInstallCaret`
menu beside Install on the game page, then "Install with options…" — its live AT-SPI-derived
click position, not a screenshot-crop estimate (see the deviation note below).

**The four region facts — all four scored INDEPENDENTLY, on two instruments.**

| Region | Expected | Visual (crop) | Text-tree (in-dialog count) | Verdict |
| --- | --- | --- | --- | --- |
| Platform row | ABSENT | No `SelectField` (`platformPick`) anywhere in the dialog; only two decorative header icons, not scored | 0 | ABSENT — PASS |
| Library dropdown | PRESENT | `SelectField` showing `/home/graysonmitchell/.steam/debian-installation (default)` | 1 (combo box) | PRESENT — PASS |
| Wine section (3 sub-signatures) | ABSENT | No WineSelector labels, no `sharedBottleNotice`, no "Checking install options…" row | 0 | ABSENT — PASS |
| Free-space line | PRESENT | "Space Available: 269.17 GiB free of 374.57 GiB", matching `df -h` (270G avail of 375G) | 0 (carve-out, see below) | PRESENT — PASS |

**Free-space-line text-tree carve-out.** The text instrument's in-dialog count for this one fact
was 0 despite the text existing verbatim on a WebKitGTK "page" role node the probe does not
classify as inside the dialog subtree (full explanation and node dump in
`atspi-dialog-subtree.txt`). Per the plan's own carve-out, a PRESENT region visible in the pixels
with an in-dialog text-tree count of 0 on an otherwise-VALID instrument is NOT a fail of the item;
it is scored on the visual instrument alone, and stated here as an honest limit.

**Arming-corroboration notes.** Neither `contentLightNotice` nor `contentLightSingleLibraryNotice`
rendered at any point (agreeing with `contentLightNotice = !isMac && !libraryDropdown`, false here
since the dropdown is present). The library select's option list was opened once and read exactly
the replica's two EXISTS paths, in the replica's order, the first suffixed "(default)" — an exact
match to the replica. Closing the menu by re-clicking the already-selected option changed nothing
(value and free-space line unchanged).

**Header-icons note.** Two decorative platform icons (Linux, Windows) render beside the dialog
title via `InstallModal__platformIcon` — these are NOT the platform row and were recorded as seen,
not scored.

**Transient check.** Burst fps=10.8, median interval 83.3ms. `diff --flag 0.005` over the settle
set (the settled dialog plus every post-click burst frame) flagged 3 of 60 frames, ALL within the
~500ms MUI Slide open-transition window (max_fraction=0.1902 at the first dialog-visible frame,
+233ms after the click; the next frame, +555ms, is unflagged), and 0 flagged after. Every flagged
frame was individually viewed and classified EXPECTED LATE MOUNT: dialog first visible (+233ms,
dropdown empty, free-space line absent), dropdown populated (+342ms, free-space line still
absent), free-space line appeared (+463ms, matching the settled state). No platform row, wine
sub-signature, or a region that vanished after appearing, was ever seen.

**Text-instrument validity — VALID.** Positive control (dialog open): 1 dialog-role node existed,
`title` in-dialog count 3, and the dialog-subtree role histogram included a push button named
"INSTALL". Negative control (dialog closed, taken before the scored click, on the same game page):
0 dialog-role nodes, and 0 in-dialog hits for `library_dropdown`/`free_space_line`. Both controls
held, so the instrument's counts are trusted at face value, subject to the one carve-out above.

**Methodology deviation, disclosed — a capture-region offset, corrected mid-sitting.**
`linux_sitting_capture.py`'s own `find_window()` (and therefore its `grab`/`burst`/`selftest`)
sourced a WRONG client-window origin for the whole first part of this sitting:
`xdotool getwindowgeometry --shell` reported `x=60,y=164`, a stable but incorrect `(+10,+45)`
offset from the window's true rendered top-left. This was proven two independent ways: `xwininfo`'s
"Absolute upper-left" read `(50,119)`, stable across repeated reads; and an AT-SPI-derived click at
the true screen position of the Settings tab (which the wrong region would have placed entirely
outside the captured window) landed on and activated the real tab. A narrow, read-only correction
wrapper, `capture_region_fix.py` (new, this sitting, this quick task's own directory — **not** a
modification of the shared instrument), sourced the correct origin from `xwininfo` for every
capture and click used in scoring from Task 1 onward; `linux_sitting_capture.py`'s own `diff`
subcommand was still reused unchanged, since it only reads already-saved frames by path and never
calls `find_window()`. Full detail: `region-offset-deviation.txt`. Root cause not conclusively
identified — most likely a stale coordinate translation left over from this sitting's screen-lock
cycle; not reproduced against sittings 6 or 7's own captures, out of scope to re-verify
retroactively.

**A second deviation, in-session:** the first attempt to click "Install with options…" used
screenshot-crop-estimated coordinates and missed the menu item, dismissing the menu with no dialog
opening (frames discarded, not committed). The retry used the live AT-SPI-derived center of the
menu item and succeeded on the first click.

**The result — `38-S12` PASS.** All four checked independently on both instruments (one carve-out,
recorded above and not treated as a fail); arming proven independently of the dialog at the scored
moment (config `true`, replica `COUNT` 2) and corroborated by the dialog itself (option list, no
content-light notice); the whole dialog was in view (title, close X, body, footer Install button,
no scrollbar); no scored transient. The native-install setting was restored to its original value
and the restore was read back and confirmed. Moved to `human_verification_discharged` in
`38-VERIFICATION.md` (8 → 7 open, 18 → 19 discharged); `audit-uat` `by_phase["38"]` moved 8 → 7 and
`total_items` 427 → 426.

**Honest-limits paragraph.** The free-space-line text-tree carve-out above.
`freeSpaceLine === libraryDropdown` by construction, so it is a genuine second observation but not
an independent gating path. The wine-section verdict confirms a by-construction false
(`wineSection` requires `isMac`). `hostPlatform` `'linux'` is established by source and by the
host, not read from the running webview, though the observed absent platform row itself excludes
`darwin`/`win32`. `libraryCount` was corroborated by the replica and the rendered option list, not
read from the webview directly. Only the default library selection was observed; per-library free
space (D-08) and the two unmounted registered libraries were not exercised. The 83.3ms median
burst interval bounds the shortest detectable flash. The text instrument sees what WebKitGTK
exposes to AT-SPI, not the DOM directly. There was no operator eyeball beyond the unlock
confirmation. Native installs were ON only for the scored step and were restored, read back and
confirmed.

**`38-S14` and `38-S16`'s Linux half were NOT scored this sitting.**

**Artifacts.**
`.planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/evidence/`: `pre-open.png`,
`dialog-settled.png`, `dialog-crop.png`, `dropdown-open.png`, `settings-native-on.png`,
`settings-native-restored.png`, `region-checks.txt`, `atspi-dialog-subtree.txt`,
`log-excerpt.txt`, `burst-summary.txt`, `library-replica.txt`, `baseline.env`,
`region-offset-deviation.txt`, `task2-checkpoint-skip.txt`. Capture instrument (reused as-is):
`.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py`.
Text-tree instrument (reused as-is):
`.planning/quick/260929-ata-run-phase-38-item-38-s10-live-on-linux-h/atspi_dialog_probe.py`. New
arming instrument: `steam_library_replica.cjs`. New capture-region correction (this sitting only):
`capture_region_fix.py`. quick `260929-hgm`.

## Sitting 9 — 2026-09-29, Linux (Pop!_OS 22.04, X11), `pnpm tauri:dev` at `55aa0d54b`

**This is the FOURTH LINUX SITTING Phase 38 has had.** It scored the LINUX/ROW-7 HALF of one item,
`38-S16`. It is NOT a discharge: `38-S16` is scored on BOTH matrix row 5 (Windows) and row 7
(Linux), its own `prior_state` says a single-branch run does not discharge it, and the
Windows/row-5 half is still NOT SCORED (sitting 1). The item therefore stays in `human_verification`
with one new dated key, the treatment `38-S14` received in sitting 5. The ledger is unchanged at 7
open, 19 discharged and 10 retired.

**Conditions.** The sitting crashed the operator's machine once mid-Task-1 (evidence files and the
probe survived untracked) and was resumed from disk after a fresh baseline re-measure. Build identity
was proven: the GameLib window's PID 8091 resolved through `/proc/8091/exe` to
`src-tauri/target/debug/gamelib-shell`, and `git status --porcelain -- src src-tauri package.json`
was empty. DECLARED REAL-PROFILE ARM (two-profile rule, half 2): the item needs the operator's real
Steam library registration, mount state and signed-in session, so a fake HOME would give the wrong
library count; the justification is the same one sitting 8 recorded. Nothing was dispatched and
Install was never clicked. The screen was unlocked throughout (`LockedHint=no`) and an idle
inhibitor ran for the duration and was killed at cleanup. The Steam client state was not examined.
Capture geometry: `xdotool` and `xwininfo` disagreed by (+10,+45) on all three readings, so
`capture_region_fix.py` was used and confirmed by a viewed grab against the Settings tab's AT-SPI
extent. Instruments: `notice_copy_probe.py selftest` passed all seven cases against the live
catalogue; the live copy tracer read the Settings toggle label EXACT; the DOM route probe found no
Inspect Element item (the Settings page shows the app's own context menu), so `DOM_ROUTE=none` and
the container verdicts rest on the STRUCTURAL basis.

**Mount state and ARMING.** The operator had unmounted the games drive at 21:19; the reboot after
the crash remounted it via fstab, so the sitting re-armed: the operator unmounted it again
(authenticated; the device node had moved from `nvme0n1p3` to `nvme1n1p3`, same UUID). THE TRAP: the
`libraryfolders.vdf` registers this same drive twice, as `/mnt/PopGames/SteamLibrary` and as the
`/media/...` udisks path, so the remount must be checked by TARGET, not count; Task 4 does that in
`evidence/remount.txt`. Off: `enableSteamNativeInstall` read `false` (replica `COUNT=2`). On: toggled
through the Settings UI, read back `true`, replica `BRANCH: PARSED`, `COUNT=1`, the only EXISTS path
`~/.steam/debian-installation`, `findmnt` empty. Restored through the UI and read back `false`. Task 2
self-skipped: the screen was unlocked and Steam sign-in was usable (381 games). Target: 7 Days to Die,
appId `251570`, confirmed not installed.

**The catalogue.** S = `steam.install.contentLightSingleLibraryNotice`, 122 characters, U+0027 at
5 and 55, U+2014 at 81. O = `steam.install.contentLightNotice`, 185 characters, U+0027 at 27 and
50. The `t()` defaults at `SteamDialog/index.tsx:542`/`:546` are byte-identical to the catalogue.

| Fact | Expected | Text-tree compare | Container basis and evidence | Visual | Verdict |
| --- | --- | --- | --- | --- | --- |
| F1 off-copy | O | EXACT, 185 chars; S is MISMATCH; alt hits 0 | n/a | O shown, English | PASS |
| F2 off-container | `div.infoBox` | n/a | STRUCTURAL: one render site in the `infoBox` at `:531`, 0 heading nodes, 0 ThirdParty hits | rounded fill, inline warning icon, no border, checkmark or header | PASS |
| F3 on-copy | S | EXACT, 122 chars; O is MISMATCH; alt hits 0 | n/a | S shown, English | PASS |
| F4 on-container | `div.infoBox` | n/a | STRUCTURAL, same evidence | same shape | PASS |

**Arming corroboration and anomalies.** No library dropdown in either dialog
(`COMBO_BOX_COUNT` 0), and the other copy was absent in both. Both dialog-closed negative controls
read 0/0. Anomalies, none scored: closing the dialog with its header X also clicked the IGDB row
beneath it and opened a GameLib child window (closed by its own X, off sub-branch); GNOME Settings
surfaced over GameLib once and one click selected its "Region & Language" item without changing
anything; the first ON navigation opened another game by mistake and nothing was done there.

**Transient and late-mount check.** OFF: 9.2 fps, median 96.8ms; ON: 9.4 fps, median 98.6ms. Every
flagged frame fell inside the ~510-540ms MUI slide. In both branches the notice was already present in
the first dialog-visible frame, with no late mount, no vanish and no wrong-copy frame.

**Result: PASS on all four facts. ITEM STAYS OPEN.** Honest limits: an exact match cannot tell a
served catalogue value from the identical `t()` default; the container basis is source plus structure,
not a DOM read; `libraryCount` was corroborated by the replica and the absent dropdown, not read from
the webview; the native-ON-with-zero-libraries residual was not exercised; the text tree is what
WebKitGTK exposes to AT-SPI; the burst interval bounds the shortest detectable flash; there was no
operator eyeball.

The Windows/row-5 half, `38-S14` and every other item were NOT scored. The drive's remount is recorded
in `evidence/remount.txt`, the record of Task 4's operator-authenticated remount.

Artifacts: `.planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/` (`notice_copy_probe.py`,
`ledger_inplace_check.cjs`, `evidence/`).

## Sitting 10 — 2026-09-29, Linux (Pop!_OS 22.04, X11), CI AppImage from run `35942560790` at `19b5e3a9e`

**This is the FIFTH LINUX SITTING Phase 38 has had, and the first attempt at `38-W05`.** The item
asks for the CI-produced Linux AppImage to launch directly, show a window and survive 10 seconds. It
did none of those on this host: it FAILED, and the item stays in `human_verification`. The ledger is
unchanged at 7 open, 19 discharged and 10 retired; `38-W05` gained one dated in-place key,
`sitting_10_2026_09_29`, and nothing else in the frontmatter moved. One todo was filed.

**Artifact and provenance.** PROVEN: `GameLib_0.7.0_amd64.AppImage`, 192399864 bytes, sha256
`ac849f1b41204358f2d4689e10eda654edab5e25b47344ddc5640a6355b072c9`, downloaded by the operator in a
logged-in browser from the DRAFT release `v0.7.0`, matched by sha256 against the operator's own
record; an x86-64 static-pie ELF with the AppImage type-2 magic; the updater key committed at
`19b5e3a9e` is `9A02F7E0C9FC04C7` and is unchanged at HEAD. NOT PROVEN, and this is a gap the sitting
did not close: the `.sig` and `latest.json` were not downloaded (offered "download them, or tell me to
skip the signature check", the operator replied "continue" with the files absent, read as skip), so
no signature was verified. The binding to run `35942560790` rests on the operator's account alone; the
commit `19b5e3a9e` is not provable from the bytes (`COMMIT_BYTES_19b5e3a9=0` in `usr/bin`); and it is
not proven that the file was signed by the CI key at all. `PROVENANCE_OK=operator-accepted`.

**Why the Actions artifact premise was wrong.** The item and the plan said "download from the workflow
run". `release-tauri.yml` has no upload-artifact step (`releaseWorkflow.test.ts` bans it), and run
`35942560790` was a tag push whose Linux leg uploaded into the DRAFT release `v0.7.0`. A draft asset
404s for anonymous users, so the operator's logged-in browser was the only route.

**Conditions.** Every execution ran under a fresh `createFakeHomeProfile()` (disposed, `DISPOSED=yes`),
with NO real-profile arm: the item's bar does not depend on sign-in state, running a 5-day-old build
against `~/.config/gamelib` risked a downgrade write, and the Linux single-instance socket lives under
`$HOME/.config/gamelib`, so a fake HOME also stops a stray instance from absorbing the launch. The
screen was unlocked (`LockedHint=no`), an idle inhibitor ran and was killed by its process group,
`NoNewPrivs=0`, libfuse2, `/dev/fuse` and `fusermount` were all present. The static census ran
BEFORE the launch, extracting with `--appimage-extract` (nothing from AppRun executes):
`usr/bin/gamelib-shell` needs `GLIBC_2.39`, 50 of 175 ELF files reference glibc above the host's 2.35,
no libc is bundled, `GLIBCXX` is fine (3.4.30 needed, 3.4.30 on the host). `PREDICTION=GLIBC_INCOMPATIBLE`
was written to `census.txt` and `session.txt` before the launch.

**Identity and survival.** There is none to report. The launch was direct (`chmod +x` in place, 664
to 775, then exec; no install step, no extract-and-run) in its own session and process group
(`SETSID_PROVEN=yes`, pid 163023). The type-2 runtime self-mounted through FUSE, the mount path
`/tmp/.mount_GameLiDknhOH` appearing in the loader's own messages, and executed `gamelib-shell`,
which the dynamic loader rejected: `libc.so.6: version GLIBC_2.39 not found (required by
gamelib-shell)`, then 46 more GLIBC_2.38 / GLIBC_2.36 lines across 37 bundled libraries. The process
exited with code 1, 65 ms after spawn. No window ever appeared, so there was no window pid, no pgid
match, no 11-sample survival and no screenshot (`window.png` and `window-t10.png` were never
produced). `DIRECT_LAUNCH` could not be proven by a mountinfo sighting because the mount was gone
before the 250 ms poll; the stderr paths are the evidence.

**Exit observation, secondary and not scored.** Not applicable: the shell died before it could spawn
`gamelib-sidecar`, so no sidecar existed. `NO_ORPHANS=yes`, no process or mount was left, and the
profile was disposed. A leak check found `~/.local/share/com.gamelib.spike029` newer than the stamp;
its last write is 0.55 seconds BEFORE the launch and the artifact died at exec, so it belongs to
another process on the desktop (contents not read), not to this run.

**Result and honest limits.** FAIL, prediction and observation agreed. ONE host (glibc 2.35, X11) and
ONE artifact with unverified provenance; the commit under gate is `19b5e3a9e`, 330 commits behind
HEAD, not HEAD; no updater flow; no operator eyeball (there was nothing on screen). This does NOT say
the AppImage fails on a glibc 2.39 or newer host. It does say the CI Linux leg, built on
ubuntu-24.04, is not launchable on Ubuntu 22.04-class hosts, which is the todo filed. `38-W04`
(Windows) was not touched.

Artifacts: `.planning/quick/260929-v1v-run-phase-38-item-38-w05-live-on-linux-s/` (`appimage_provenance.cjs`,
`appimage_smoke.ts`, `evidence/`).

## Sitting 11 — 2026-09-30, Linux (Pop!_OS 22.04, X11), CI AppImage from run `36556473399` at `b48e8948f`

**This is the SIXTH LINUX SITTING Phase 38 has had, and the second attempt at `38-W05`.** It asked
whether quick `260929-vyi`'s move of the Linux leg to ubuntu-22.04 fixed sitting 10's failure. Half of
that is answered: the glibc failure is gone. The item itself is NOT scored PASS or FAIL: the scored
launch aborted on the host's broken GPU stack, which the pre-registered rule scores CONFOUNDED, and
`38-W05` stays in `human_verification`. The ledger is unchanged at 7 open, 19 discharged and 10
retired; `38-W05` gained one dated in-place key, `sitting_11_2026_09_30`, and nothing else in the
frontmatter moved. Two todos were filed.

**Artifact and provenance.** PROVEN: `GameLib_0.7.0_amd64(1).AppImage`, 195123704 bytes, sha256
`d7648c37e7721bcb10fc56018b41e531b8cb6a649856d8daeffb24eddcf35943` (the operator's browser added the
`(1)` because the sitting-10 file has the same asset name); an x86-64 ELF with the AppImage type-2
magic; distinct from the sitting-10 artifact by hash and size; the updater key at `b48e8948f` is
`9A02F7E0C9FC04C7`, unchanged at HEAD; the workflow at the gate commit builds the Linux leg on
`ubuntu-22.04`; the Downloads file was never modified (mode and mtime identical before and after),
the launch used a hash-identical scratchpad copy. NOT PROVEN: no signature was verified (`gh` is not
installed and no `.sig` or `latest.json` was downloaded); no byte carries the run id or the tag, so the
binding to run `36556473399`, tag `v0.7.0-glibc-test1` and commit `b48e8948f` rests on the operator's
account and the orchestrator's record (`COMMIT_BYTES_HITS=0`); the ubuntu-22.04 build base is inferred
from the workflow and from the glibc maximum; the shared draft release is overwritten by every
throwaway-tag run, so the download timing is consistent with, not proof of, the run.
`PROVENANCE_OK=operator-accepted`.

**Conditions.** Every execution ran under a fresh `createFakeHomeProfile()` (disposed), with NO
real-profile arm, for sitting 10's reasons. The screen was unlocked, an idle inhibitor ran and was
killed by its process group, `NoNewPrivs=0`, libfuse2, `/dev/fuse` and `fusermount` were present. The
host's GPU stack is broken: `nvidia-smi` reports `Failed to initialize NVML: Driver/library version
mismatch` (kernel module 580.159.03, userspace 580.173.02, booted 2026-09-29 21:55), the state spike
029 measured to abort WebKitGTK with `EGL_NOT_INITIALIZED`. The confound rule was pre-registered: the
scored arm carries no workaround, and the verdict is CONFOUNDED only if the mismatch is present AND the
EGL/GBM signature is in the scored streams. The static census ran before the launch, with a negative
control that reproduced sitting 10's `GLIBC_INCOMPATIBLE` (175 ELF files, 50 above host glibc,
`GLIBC_2.39` in `gamelib-shell`) on the old artifact. New artifact: maximum `GLIBC_2.35`, 0 of 182 ELF
files above the host, `GLIBCXX` 3.4.30 equals the host, no libc bundled, and one unresolved NEEDED
soname (`ld-linux-aarch64.so.1`, required by the arm64 `comet` binary, present identically in the
sitting-10 artifact and not loadable on an x86_64 host). The harness's rule order printed
`PREDICTION=MISSING_LIBS`; it was read before the launch as expected-to-launch.

**Identity.** The launch was direct (a scratchpad copy made executable, then exec; no install step, no
extraction, no environment workaround) in its own session and group (pid 369284). The window titled
exactly `GameLib` appeared 270 ms after spawn, and its `_NET_WM_PID` is 369284, whose executable is
`/tmp/.mount_GameLidpgdAL/usr/bin/gamelib-shell` on a `fuse.` mount, in the launch process group.

**Survival.** It did not survive. Sample s=0 (12 ms after the window) found the shell alive and the
window visible; the shell then died with SIGABRT 364 ms after spawn, and samples s=1 through s=10 and
the t=30 observation found no shell and no window. The scored stderr is three lines: two harmless
`canberra-gtk-module` messages and `Could not create GBM EGL display: EGL_NOT_INITIALIZED.
Aborting...`. There were 0 GLIBC, GLIBCXX, missing-library and panic lines. No sidecar was ever seen,
and no scored screenshot exists (the window was gone before the s=3 grab).

**Diagnostic arm, not scored and not a discharge.** Run once, after the verdict, with
`WEBKIT_DISABLE_DMABUF_RENDERER=1` and a fresh profile (`SCORED=no`): window at 277 ms, 11 of 11
samples alive, visible and same-pid, bundled `gamelib-sidecar` (pid 370226, its own group, inside the
mount) alive at s=10 and t=30, shell alive at t=30, 0 loader, EGL and panic lines, and three
pixel-identical frames (1575 colours) showing the Library tab with the what's-new dialog over an empty
library. It would have met every PASS clause except `SCORED` and `EXTRA_ENV`. It cannot change the
verdict.

**Exit observation, secondary and not scored.** Scored arm: nothing to observe. Diagnostic arm: after
a SIGTERM to the shell pid alone the sidecar drained on stdin EOF in 0.26 s with no orphan, no launch
group remainder and no mount left; cold profile only, so it cannot see the `260913-901` class of
handles that arm under a populated profile.

**Result and honest limits.** CONFOUNDED. ONE host in ONE broken GPU state and ONE artifact with
unverified provenance; the gate commit `b48e8948f` is HEAD; no updater flow. This does NOT say the
AppImage fails on a healthy GPU stack, and it does NOT discharge the item. It does say sitting 10's
cause is cleared (0 not-found lines, 0 of 182 ELF above host glibc). The item can be re-run once the
kernel-module/userspace mismatch is fixed, which is the first todo filed; the second records the
arm64 binary the census found. `38-W04` (Windows) was not touched.

Artifacts: `.planning/quick/260930-9l9-re-run-38-w05-smoke-launch-against-the-n/` (`appimage_smoke.ts`,
`evidence/`).

## Sitting 12 — 2026-09-30, Linux (Pop!_OS 22.04, X11), CI AppImage from run `36556473399` at `b48e8948f`

**This is the SEVENTH LINUX SITTING Phase 38 has had, and the third attempt at `38-W05`.** It re-ran
the artifact sitting 11 scored (the same bytes) after the operator rebooted the host, which cleared the
NVIDIA kernel-module/userspace mismatch that CONFOUNDED sitting 11. With that one variable changed and
NO workaround, the AppImage launched, showed a window, started its bundled sidecar, survived 30 seconds
and reached an interactive Library UI. `38-W05` is scored PASS and DISCHARGED: the ledger moves from 7
open, 19 discharged and 10 retired to 6 open, 20 discharged and 10 retired, and `gsd-core`'s `audit-uat`
agrees (Phase 38 from 7 to 6 items, 426 to 425 in total). The glibc and NVIDIA-mismatch todos are closed.

**Artifact and provenance.** PROVEN: `GameLib_0.7.0_amd64(1).AppImage`, 195123704 bytes, sha256
`d7648c37e7721bcb10fc56018b41e531b8cb6a649856d8daeffb24eddcf35943`, re-hashed this sitting and equal to
the value sitting 11 recorded; an x86-64 ELF with the AppImage type-2 magic; distinct from the sitting-10
artifact by hash and size; the updater key at `b48e8948f` is `9A02F7E0C9FC04C7`, unchanged at HEAD; the
workflow at the gate commit builds the Linux leg on `ubuntu-22.04`; the Downloads file was never
modified (mode and mtime identical before and after), the launch used a hash-identical scratchpad copy.
NOT PROVEN: no signature was verified (`gh` is not installed and no `.sig` or `latest.json` was
downloaded); no byte carries the run id or the tag, so the binding to run `36556473399`, tag
`v0.7.0-glibc-test1` and commit `b48e8948f` (41 commits behind HEAD) rests on the operator's account and
the orchestrator's record; the ubuntu-22.04 build base is inferred from the workflow and the glibc
maximum; the shared draft release is overwritten by every throwaway-tag run, so the download timing is
consistent with, not proof of, the run. `PROVENANCE_OK=operator-accepted`.

**What changed since sitting 11.** Only the host GPU state. Sitting 11 ran on kernel
`7.0.11-76070011-generic` with the proprietary NVIDIA module 580.159.03 against userspace 580.173.02
(`nvidia-smi`: `Driver/library version mismatch`). This sitting the host booted at 2026-09-30 07:38 on
kernel `7.1.1-76070101-generic` with the NVIDIA open kernel module 580.173.02, equal to the userspace
580.173.02, and `nvidia-smi` runs. The reboot therefore changed the kernel and the module flavour as
well as the version. The mismatch was re-measured absent both at baseline and immediately before the
launch. The EGL external platforms (wayland, gbm, xcb, xlib) and GBM backends (`dri_gbm`,
`nvidia-drm_gbm`) are recorded in the baseline.

**Conditions.** Every execution ran under a fresh `createFakeHomeProfile()` (disposed), with NO
real-profile arm, for sitting 10's reasons. The screen was unlocked, an idle inhibitor ran and was
killed by its process group, `NoNewPrivs=0`, libfuse2, `/dev/fuse` and `fusermount` were present. The
verdict rules were pre-registered: loader FAIL, then CONFOUNDED only if the mismatch was present AND the
EGL/GBM signature was in the scored streams, then a FAIL with its own cause if the signature appeared
on a matched driver. A diagnostic arm would have run only for a GPU-class cause; none did. The static
census ran before the launch, with a negative control that reproduced sitting 10's `GLIBC_INCOMPATIBLE`
(175 ELF files, 50 above host glibc, `GLIBC_2.39`) on the old artifact, and reproduced sitting 11's
census of these bytes exactly: maximum `GLIBC_2.35`, 0 of 182 ELF files above the host, `GLIBCXX` 3.4.30
equals the host, no libc bundled, and one unresolved NEEDED soname (`ld-linux-aarch64.so.1`, required by
the arm64 `comet` binary and not loadable on an x86_64 host). The artifact bundles no libEGL, libGL, libgbm
or libdrm of its own. The harness printed `PREDICTION=MISSING_LIBS`, read before the launch as
expected-to-launch, and the written GPU prediction was no EGL abort on a matched driver. Both held.

**Identity.** The launch was direct (a scratchpad copy made executable, then exec; no install step, no
extraction, no environment variable) in its own session and group (pid 20055). The window titled
exactly `GameLib` appeared 265 ms after spawn, and its `_NET_WM_PID` is 20055, whose executable is
`/tmp/.mount_GameLihcGIHB/usr/bin/gamelib-shell` on a `fuse.` mount, in the launch process group.

**Survival.** All 11 one-second samples (t=0 to t=10) found the shell alive, the window visible and the
same pid, none in state Z, with no exit event. The t=30 observation found the shell, the sidecar and the
window all still alive. The scored stderr is 28 lines: `canberra-gtk-module` messages, the shell's
`spawning sidecar (packaged)` lines, `sidecar signalled READY`, and sidecar deprecation and store notes.
There were 0 GLIBC, GLIBCXX, missing-library, EGL-abort, `libEGL warning` and panic lines.

**Sidecar and usable UI.** The bundled `gamelib-sidecar` (pid 20114, its own process group, executable
inside the FUSE mount) was alive at s=10 and t=30. The three screenshots (s=3, s=10, t=30) were viewed:
they are pixel-identical 1280x800 frames of 1575 colours showing the Library tab with
Accounts/Library/Stores/Settings navigation, a search box, All games / Installed / Recently played /
Favourites filters, an ADD GAME button, and the `GameLib 0.7.0` what's-new dialog over an empty (0 games)
library. That is an interactive GameLib screen, not a blank or error frame. No click was made.

**Exit observation, secondary and not scored.** After a SIGTERM to the shell pid alone the sidecar
drained on stdin EOF in 0.26 s with no orphan, no launch-group remainder and no mount left; cold profile
only, so it cannot see the `260913-901` class of handles that arm under a populated profile.

**Result and honest limits.** PASS. ONE host (Pop!_OS 22.04, glibc 2.35, X11) in ONE GPU state (NVIDIA
580.173.02 matched), ONE artifact with unverified provenance; the gate commit `b48e8948f` is 41 commits
behind HEAD, so this certifies that artifact and not HEAD; no Wayland, no other distro, no glibc 2.39+
host, no updater flow. It supersedes sitting 11's CONFOUNDED (the host mismatch, now cleared) and
sitting 10's FAIL (fixed by quick `260929-vyi`). The `GTK-box` embed todo's spike-029 re-run with
`WEBKIT_DISABLE_DMABUF_RENDERER` unset was NOT performed here and is still pending. `38-W04` (Windows)
was not touched and stays open.

Artifacts: `.planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l/` (`appimage_smoke.ts`,
`evidence/`).

## Sitting 13 — 2026-09-30, Windows 11 (operator's machine), CI NSIS from run `36556473399`, `pnpm tauri:dev` at `64bf2bfb4`, spike 027 harness

**This is the first Windows sitting since sitting 5, and it scored six items.** Four were
DISCHARGED PASS: `38-W04`, `38-S14`, `38-S16` and `38-E01`. Two, `38-E03` and `38-E04`, passed
their Windows branch (b) and stay OPEN for branches (a) and (c), each with one dated in-place key,
`sitting_13_2026_09_30`. The ledger moves from 6 open, 20 discharged and 10 retired to 2 open, 24
discharged and 10 retired, and `gsd-core`'s `audit-uat` agrees (Phase 38 from 6 to 2 items, 425 to
421 in total). Host: Windows 11 Home 10.0.26200, one 3440×1440 display at DPI 120 (scale factor
1.25) except where stated. Quick task `260930-o75`.

**Three builds, kept apart.** Each item was scored on the artifact its own `test:` names:

- `38-W04`: the CI-produced NSIS installer `GameLib_0.7.0_x64-setup.exe` (112419624 bytes, sha256
  `61d59bfddfb9fb56c26a3cdb6ff27af008fc9ee8a540f11e81842324c03d5281`), downloaded with
  `gh release download v0.7.0` from the DRAFT release. The local hash equals the digest GitHub
  records. The asset was uploaded at `2026-09-29T10:46:19Z`, inside the Windows job window
  (`10:35:12Z`–`10:47:23Z`) of `release-tauri.yml` run `36556473399`, `headSha b48e8948f`, the
  run whose AppImage discharged `38-W05` in sitting 12. The draft is shared and overwritten by later
  runs, so that timing is strong evidence, not proof; no byte in the artifact names the run.
  Authenticode reports `NotSigned`; the updater `.sig` (416 bytes) was downloaded but not checked.
- `38-S14` and `38-S16`: `pnpm tauri:dev` at HEAD `64bf2bfb4`, clean tracked tree. Window PID
  12004, path `src-tauri\target\debug\gamelib-shell.exe`, exe mtime 17:18:42+13:00, after the last
  `main.rs` commit (`9ad2f4e74`, 17:18:31+13:00); cargo reported the build up to date
  (`Finished … in 0.50s`). This is the named REAL-PROFILE arm of the two-profile rule, needed for
  the operator's signed-in Steam library as in sitting 9. No app stdout was captured.
- `38-E01`, `38-E03`, `38-E04`: the spike 027 feasibility harness, built natively with `cargo build`
  on `x86_64-pc-windows-msvc` (rustc 1.98.1), clean in 1m17s. Its lockfile resolves tauri 2.12.0,
  tao 0.37.1, wry 0.57.0 and webview2-com 0.39.1; the harness's `[env]` log line still says
  "tauri 2.11.5 / wry 0.55.1", a stale hard-coded label. This is NOT the shipped app:
  `src-tauri/Cargo.toml` target-gates `unstable` to macOS and Linux, so GameLib's own Windows build
  compiles no embed.

**Operator decisions this sitting.** (1) `38-W04` was installed OVER the existing per-user v0.7.0
install rather than into a clean profile. (2) For `38-S14`(b)/`38-S16`'s ON arm, Steam was exited
(0 `steam*` processes confirmed) and `D:\SteamLibrary` was temporarily renamed to
`D:\SteamLibrary.s13-hidden` (04:43:02Z), then renamed back (05:09:17Z); Steam was not running at
any point while it was hidden. (3) ADOM (333300) was really installed for `38-S14`'s install clause
and stays installed on C:. (4) For `38-E03`(b) the display was set to 200% scaling and restored
afterwards.

### 38-W04 — Windows NSIS smoke launch: PASS, discharged

The bar is `35-LIVE-GATE.md` criterion 1: the installer completes without error, a window
appears, and the process survives at least 10 seconds. Before: shell mtime 2026-09-25, 33668608
bytes. `GameLib_0.7.0_x64-setup.exe /S` exited 0 in 8.4 s with no elevation prompt. After:
`gamelib-shell.exe` 16554496 bytes, mtime 2026-09-29T23:44:26+13:00 (inside the CI job window),
`gamelib-sidecar.exe` 121496576 bytes; DisplayVersion still 0.7.0. The silent install did not
launch the app.

The smoke harness (`win_smoke.ts`) spawned the installed shell under a fresh
`createFakeHomeProfile()` (prefix `gl-w04s13-`, disposed), with no GameLib process running
beforehand (the operator closed the dev build: the single-instance mutex is keyed on the user SID).
A top-level `GameLib` window was present at the first sample (1618 ms), handle `0x70AD2`
throughout; the shell was alive at 12 of 12 one-second samples; the bundled `gamelib-sidecar.exe`
(PID 21276, from the install directory) and WebView2 `msedgewebview2.exe` 154.0.4258.37 were present
at every sample. `w04-t12-window.png` shows the tab bar, Library with All Games 0, and the GameLib
0.7.0 what's-new dialog. `taskkill /T /F` left no `gamelib-*` process.

**Honest limits.** ONE host, ONE artifact, ONE launch, ONE DPI. Fake-profile isolation is PARTIAL
on Windows: the eight env variables redirect the Node sidecar, but the Tauri shell resolves app data
and the WebView2 user-data folder through the Windows known-folder API, which ignores them, so the
shell side very likely ran against the operator's real `%LOCALAPPDATA%`/`%APPDATA%`. That is
structural to Windows, and worth a line in CLAUDE.md's two-profile section. No app output was
captured. The NSIS pages were not exercised (`/S`); SmartScreen and updater-signature checks are out
of scope.

### 38-S16 (Windows/row-5 half) and 38-S14 (sub-case b): PASS, both discharged

**Instrument.** `uia_dump.ps1` reads WebView2's accessibility tree through UI Automation (the
Windows analogue of sitting 9's AT-SPI); `uia_score.cjs` compares node names to
`public/locales/en/gamelib.json` by EXACT string equality. WebView2 exposes each DOM node's CSS
class list as the UIA ClassName, so the container is OBSERVED here, where on Linux it was only
inferred from source.

- **OFF arm, Aloft** (`enableSteamNativeInstall=false` read before the open; two libraries on
  disk): F1 copy PASS, `EXACT_OFF=1` (185 chars, `steam.install.contentLightNotice`), `EXACT_ON=0`,
  both partial checks 0. F2 container PASS: parent ClassName `infoBox`, whose parent is
  `InstallModal__dialog`; no `noticeIcon`/`noticeInfo`/ThirdPartyDialog class anywhere. The dialog
  held only the title, the close button, "Select Platform Version to Install:", ONE disabled
  "Windows" select, the notice and INSTALL (`s16-off.png`).
- **ON arm with one library, Aloft then ADOM**: with `D:\SteamLibrary` hidden,
  `C:\Program Files (x86)\Steam` was the only existing library, and "Download Steam games in
  GameLib" was turned ON (read back `true`). F3 copy PASS, `EXACT_ON=1` (122 chars, including the em
  dash and both apostrophes), `EXACT_OFF=0`, identical on Aloft and ADOM. F4 container PASS,
  `infoBox` inside `InstallModal__dialog`. No library dropdown and no free-space line (`s16-on.png`).
- **S14(b) install clause**: INSTALL for ADOM planned depot 333301 (Windows/64/english/public,
  578116871 bytes, 16128 entries). `Finished Installation of 333300` came 85.4 s after the click;
  `appmanifest_333300.acf` reads `StateFlags 4`, `SizeOnDisk 578116871`, `buildid 5820078`;
  `steamapps\common\ADOM` holds 15103 files (16128 − 1025 directory entries); the badge flipped to
  installed.
- **Restore**: the setting was turned OFF (read back `false`), and `D:\SteamLibrary` was renamed
  back with `steamapps` and 22 manifests present (`s16-library-rename.txt`).

`38-S16`: with sitting 9's Linux/row-7 half, both halves pass. `38-S14`: with sitting 5's (a), both
sub-cases pass, and they render DIFFERENT copy (185 vs 122 chars, each matched exactly), which is
the item's own FAIL condition turned PASS.

**Specification correction, not an app defect.** `38-S14`'s `expected:` listed "Cancel + Install".
The Steam dialog renders no Cancel button, only the ✕ close button plus INSTALL, and
`SteamDialog/index.tsx` contains none; its last change (`ad2cd1fe4`, 2026-09-23) predates sitting
5's build, so sitting 5's "Cancel + Install" was almost certainly restated from `expected:`, not
observed. The ledger records it as a SPECIFICATION CORRECTION in `text_corrected_at_discharge`, with
the pre-change text verbatim, the treatment `38-C03` and `38-W03` received.

### 38-E01 — Windows `add_child` feasibility: PASS, discharged

Pre-registered in `e01-prediction.md` before the run, on the UNMODIFIED harness source, with two
independent instruments: the harness's own API log, and `hwnd_sampler.ps1`, a separate process
recording every descendant HWND (class, visibility, physical client rect, DPI) at 50 ms, 35
distinct states. `SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1` exited on its own after 30 s at
`=== COMPLETE ===`.

| criterion | result |
|---|---|
| P1 attach | `add_child OK` in 95 ms; `["store-embed","main"]`; new `WRY_WEBVIEW` child of the main window |
| P2 1a / 4a / 4b at ×1.25 | `363,120 950×700` / `363,120 1125×875` / `13,500 500×375`, API and OS identical, 0 px |
| P3 hide/show | 4d container `HIDDEN`; 4e visible, rect unchanged |
| P4 destroy | container subtree gone at 04:28:27.684Z |
| P5 content | shot-017 store exactly covers `#slot`; shot-020 store only at the 4b rect |

Geometry tracking, by proxy as pre-registered: the container and the renderer HWND inside it
followed the `#slot` ResizeObserver within about 100 ms (1233×647 → … → 72 physical height), the
renderer within 1 px of the container. The page's own `innerWidth` was not instrumented. Probe B
placed two children side by side in a bare window as requested. An unscored anomaly — the main
embed moving to a narrow slot-edge rect while probe B's window was created — is most likely the
panel's slot sync reading a momentary layout; probable, not proven.

Phase 8, NOT scored: the "isolated" child's jar reported all 15 cookies, including the shared
jar's Steam and GOG cookies, so `data_store_identifier` is a SILENT NO-OP on WebView2 too. wry
0.57.0 defines `with_data_store_identifier` only under
`#[cfg(any(target_os = "macos", target_os = "ios"))]` (`src/lib.rs:1579`, `:1612`). Recorded in the
isolation todo's Windows addendum.

**Claim limit.** ONE host, ONE DPI, ONE monitor, the spike's lockfile, NOT the shipped app.

### 38-E03 branch (b) and 38-E04 branch (b): PASS, both items stay OPEN

**Harness changes, made after `38-E01` was scored.** (1) The slot sync in `dist/index.html` was
ported from a pure trailing debounce to the shipped app's `useStoreEmbedHost.ts` `scheduleFlush`
(leading-edge throttle with a trailing flush, 40 ms); the debounce is the exact defect plan 40-11's
live gate found. (2) From the panel, the SYNC `create_embed` command hung on Windows
(`[embed] add_child` with no `OK`/`FAILED`, window `Responding=True`); Tauri documents creating
webviews from sync commands as a Windows deadlock. `create_embed` and `create_multi_window` became
`async` wrappers over `_impl` bodies, which the autorun still calls through `run_on_main_thread`.
The shipped `store_embed_open` is reached through the sidecar RPC dispatch, not a Tauri command, so
it does not have this shape; a Windows un-gating must keep it that way.

- **`38-E04`(b), drag-resize at 1.25**: pre-registered in `e04b-prediction.md`. The operator
  drag-resized the window corner for about 8.4 s (sampler `-NoShots`, cadence median 28 ms) and
  reported "kept up fine, no tearing or spilling". M1: 187 embed-rect updates, gap median 43 ms,
  p90 61 ms, max 245 ms (one outlier). M2 settle: 0 ms at sampler resolution. M3: 47 of 334 samples
  transiently past the client edge by up to 32 px while shrinking, not seen by the operator, not
  scored. Limit: the sampler cannot see sub-28 ms frames.
- **`38-E03`(b), HiDPI at 2.0**: pre-registered in `e03b-prediction.md`. The display was set to
  200% (1720×720 logical). H1: `scaleFactor` 2.0 (6 readbacks), DPI 192. H2: 1a `580,192 1520×1120`,
  4a `580,192 1800×1400` (bottom clipped by the 1399-px client, recorded), 4b `20,800 800×600`, all
  exactly ×2, 0 px; 4c `581,193 1521×1122` is ×2 rounded half up. H3: slot sync landed at `564,112`,
  the slot's 282,56 ×2. H4: at 1:1 (`e03b-hwnd/e03b-4b-crop-1to1.png`) the embed's text is
  device-resolution sharp, with its top-left exactly at 20,800. The probe-B anomaly reproduced at 2.0
  (`564,181 22×602`). Not covered: mixed-DPI multi-monitor setups and external displays.

Both items stay in `human_verification` for their branch (a), other macOS displays/hardware, and
branch (c), the unbuilt GTK-box-native Linux layout. Both scores are on the spike harness, not the
shipped app.

Artifacts: `.planning/quick/260930-o75-phase-38-sitting-13-windows-38-e01-38-w0/` (`win_smoke.ts`,
`uia_dump.ps1`, `uia_score.cjs`, `hwnd_sampler.ps1`, `evidence/` — `w04-verdict.md`,
`s16-s14-verdict.md`, `e01-prediction.md`, `e01-verdict.md`, `e03b-prediction.md`,
`e04b-prediction.md`, `e03b-e04b-verdict.md` and their captures).
