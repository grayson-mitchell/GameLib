---
created: 2026-08-26T18:47:00.000Z
title: "The path-rejection dialog (\"Can't use that location\") renders in the oversized large-text window model — make it a properly-sized error presentation"
area: ui
status: "RESOLVED 2026-08-29 by Phase 35 plan 11, commit cf28d48f4 -- and the record is two weeks late, not the fix. `.errorDialog.error-box` carried an unconditional `height: 25em`, a fixed content-independent height, so EVERY `type: 'ERROR'` dialog rendered as a ~400px scrollable console box regardless of message length. That is the oversized large-text window this todo names. It became `max-height: 25em`, fixing the root cause for all 31 ERROR call sites rather than the two path-rejection ones, and it was live-verified the same day (35-11-SUMMARY.md:307, 'Path-rejection sizing -- PASS. The dialog hugs its two-sentence message.'). The fix took NONE of the three options this todo listed, which is why the 2026-09-05 staleness audit screened it as NOT-CLOSEABLE and left it here. RESIDUE, deliberately not closed: the operator's complaint had two halves -- oversized AND visually plain ('sexier') -- and only the sizing half shipped. See the Resolution section."
resolved: 2026-08-29
resolved_by: 35-11 (cf28d48f4); records corrected 2026-09-13 by quick-260913-nfv
severity: minor
platform: any
ready: code
files:
  - src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.css:22
  - src/backend/sidecar/installFlowRegistration.ts:325
  - src/backend/sidecar/installFlowRegistration.ts:467
  - public/locales/en/gamelib.json
---

## Observed

Found by the operator on 2026-08-26 driving **item G2-3 of `34.6-LIVE-GATE.md`'s GAP CYCLE 2
section** (the REJECT-direction item), on branch `fix/steam-native-install-stability`.

The rejection itself worked — **G2-3 PASSED**. A relative path typed into `ImportDialog`'s
`PathSelectionBox` was refused, the dialog appeared, and the rejected path stayed out of
`gamelib.log`. This todo is purely about how that dialog *looks*.

Operator's words: the error message should be "sexier"; it currently uses the **large text
window** dialog model.

The dialog is raised by `showDialogBoxModalAuto({ title, message, type: 'ERROR' })` from plan
34.6-19, at `installFlowRegistration.ts:317` (move) and `:444` (import). The body strings are
`gamelib:installFlows.pathRejectedBodyMove` / `pathRejectedBodyImport`, both a full sentence-pair
of explanatory prose, which is what drives the window to the large-text size.

## Problem

34.6-19's goal was to stop the rejection being *silent* — before it, a rejected path produced only
a `logError` and a terminal `done` status, which read as the app doing nothing. It succeeded at
that. But the presentation it reached for is the generic large-text modal, which is oversized and
visually plain for what is a short, one-line correction ("that isn't a full folder path").

## Solution

TBD. Options, none yet chosen:

- Keep `showDialogBoxModalAuto` but shorten the body strings so the dialog sizes down, and lean on
  the title to carry the meaning.
- Move to a smaller/inline error affordance attached to `PathSelectionBox` itself, so the
  correction appears next to the field the user must fix rather than in a modal that covers it.
  This is the better UX but a larger change, and it must not reintroduce silence — the whole point
  of 34.6-19 was that a rejection must be user-visible.
- Whatever is chosen, the three `gamelib.json` strings stay in `gamelib.json` (never
  `translation.json` — the churn guard fails CI on that), and `de`/`fr` need matching updates.

## Notes

No `resolves_phase:` — this is a UI-polish follow-up, not a Phase 34.6 port defect, and must not be
auto-closed when 34.6 closes. G2-3 itself passed on its own contract and is not blocked by this.

Adjacent but distinct: `2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md`
covers a dialog rendering as a *native system* dialog instead of app-styled; this one is an
app-styled dialog that is simply the wrong size and tone.

---

## Resolution (recorded 2026-09-13 by quick-260913-nfv; the fix itself landed 2026-08-29)

### What was actually wrong, and what fixed it

The Solution section above lists three candidate options. **None of them is what shipped**, and
that matters more than it sounds — see the audit note below.

The real cause was never the body strings. `.errorDialog.error-box` in
`MessageBoxModal/index.css` carried an unconditional **`height: 25em`** — a fixed,
content-independent height. Every `type: 'ERROR'` dialog in the app therefore rendered as a
~400px-tall scrollable console box no matter how short its message. The two path-rejection
bodies were plain two-sentence prose being poured into a log-dump-shaped container.

Commit `cf28d48f4` (Phase 35 plan 11, 2026-08-29) changed it to **`max-height: 25em`**:

- Content **taller** than 25em is unchanged — still capped, still scrolling on the existing
  `overflow: auto`.
- Content **shorter** than 25em now sizes down to itself.
- `max-height` cannot make a box taller than `height` did, so no regression is expressible in
  that direction.

Because the defect was fixed at the rule rather than the call site, it covers all 31 ERROR-type
call sites, not just the two named here. No string, no reject condition, and no call site was
touched.

Verified still live at HEAD on 2026-09-13: the selector declares `max-height: 25em` and no bare
`height:`; the only other rule matching it (`themes.scss:458`) sets `background-color` alone.

### The live evidence

`35-11-SUMMARY.md:307`, operator-driven on real hardware the same day:

> **Path-rejection sizing — PASS.** The dialog hugs its two-sentence message.

Worth reading the summary's own caveat alongside it: the *long-error scrolling* direction was
**verified by construction, not observed live**, and 35-11 says so explicitly rather than
claiming a run it did not make. The single confound a static read could not cover — flex-stretch
behaving differently between the two declarations — is closed by the step-1 live PASS, since a
box visibly sizing to its content cannot simultaneously be stretched.

### Why this sat in `pending/` for two weeks after being fixed

The 2026-09-05 staleness audit (`.planning/quick/260905-upz-staleness-audit-of-the-41-pending-todos-/260905-upz-AUDIT.md:591`)
examined this exact file and classified it **NOT-CLOSEABLE**, reason:

> Solution explicitly TBD; three options, none chosen

That verdict was wrong, and the mechanism is worth keeping. The audit screened **the todo's own
Solution section** instead of measuring HEAD — six days after the fix had landed. And the screen
could not have worked even in principle here: the shipped fix deliberately took **none** of the
three listed options, so a test asking "was one of these options chosen?" returns false for a
todo that is fully resolved. A staleness screen keyed on a todo's *proposed remedy* is blind to
any fix that found a better one.

The cheap check that would have caught it: `git log -S` on the todo's own subject matter, or
simply reading the selector at HEAD.

### RESIDUE — what this closure does NOT cover

**The operator's complaint had two halves and only one shipped.** The original words were that
the dialog was *oversized* **and** that the message should be "sexier" — i.e. visually plain. The
`max-height` fix addresses the size. A short one-line correction still renders in the generic
red-titled error modal, which is the presentation half.

That is left open on purpose rather than being quietly folded into this closure. It is a distinct
and much smaller question — a tone/presentation choice, not a defect — and if it is still wanted
it should be filed on its own terms with a live look at the current dialog. It is **not** claimed
fixed here.

### Line-number rot, for the record

This todo cited `installFlowRegistration.ts:317` (move) and `:444` (import). By 2026-09-13 those
had drifted to **`:325`** and **`:467`**. The `files:` list above has been corrected. The
`gamelib.json` strings named in the Solution section were never edited — the CSS fix made that
unnecessary — so the `de`/`fr` update it anticipated was never owed.
