---
status: not_started
phase: 38-deferred-hardware-and-environment-uat-gates-windows-linux-ma
source: [38-VERIFICATION.md, 34.1-HUMAN-UAT.md items 1a and 7, 34.10-VERIFICATION.md deferred[0]]
created: 2026-08-22
updated: 2026-08-22
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
- **38-C01 … 38-C05** need only a game controller. No phase dependency. These can run today if
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

None yet. Add a dated session block here when the first sitting happens, then move the
corresponding entries in `38-VERIFICATION.md` from `human_verification` to
`human_verification_discharged` — annotating in place does not work, because the audit counts
array membership and ignores any `result:` field.
