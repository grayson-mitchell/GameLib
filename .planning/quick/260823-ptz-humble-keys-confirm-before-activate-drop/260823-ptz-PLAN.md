---
quick_id: 260823-ptz
slug: humble-keys-confirm-before-activate-drop
date: 2026-08-23
status: planned
description: >-
  Humble Keys follow-up to 260823-op3 — add a confirmation step before Activate
  on Steam keys, and remove the humbleKeysBlurb helper text from the
  Keys-waiting and Giftable Spares tabs.
---

# Quick Task 260823-ptz — Confirm before Activate; drop the tab blurbs

Operator feedback on `260823-op3`: the one-click activate needs a confirmation,
and the per-tab helper paragraphs clutter the window.

## Task 1 — Confirmation before Activate

**Files:** `HumbleClaimWizard/index.tsx`, `HumbleClaimWizard/index.css`,
`public/locales/en/gamelib.json`

Steam keys start at a `warning` step again instead of `activating`. The
confirm button runs `runActivate()`; the dismiss button closes the wizard.

Copy is entry-mode aware, because the two are not the same promise:
- `claim` — the reveal has NOT happened. "Revealing shows the actual key and
  removes it from Giftable spares for good, then redeems it on your Steam
  account. There's no undo."
- `finish` — the key is already revealed. Only the Steam redemption is new.

**This REVERTS 260823-op3's amendment of T-14-08.** With a click gate back in
front of the reveal, `humbleRevealKey` no longer needs a mount-effect call
site, so the effect and its `activateStarted` latch both go. The ref is
repurposed as a plain re-entrancy guard inside `runActivate` — the `busy`
state check alone cannot close the double-click window before React re-renders
and applies `disabled={busy}`.

**Verify:** a Steam claim mount calls no IPC at all; reveal fires only from
the confirm click; a double-click still yields exactly one reveal.

### Steam finish-mode read

`finish` mode currently skips the `humbleGetRevealedKeyValue` mount effect for
Steam and reads the value inside `runActivate`. That stays — the read is now
correctly deferred until after the user confirms.

## Task 2 — Remove the tab blurbs

**Files:** `Waiting/index.tsx`, `Spares/index.tsx`, `Keys/index.css`

Delete the `<p className="humbleKeysBlurb">` from both tabs and the
now-unreferenced `.humbleKeysBlurb` rule. The `humbleKeys.waitingBlurb` /
`humbleKeys.sparesBlurb` keys live in the upstream-owned `translation.json`
and are left in place — the D-05 churn guard fails CI on any write to that
file, and an orphaned key is harmless.

**Verify:** `grep -r humbleKeysBlurb src` returns nothing; both tabs render
their list directly under the tab strip.

## Task 3 — Tests

Update the wizard suite for the restored confirm gate; add double-click
coverage. Confirm the Frontend jest project and the four i18n gates stay green.

## Must-haves

- Activating a Steam key requires an explicit confirm click.
- `humbleRevealKey` has NO mount-effect call site (T-14-08 restored).
- A double-click on the confirm fires exactly one reveal.
- Every reveal-failure branch and the post-reveal fallback still behave as
  260823-op3 left them.
- No `humbleKeysBlurb` anywhere in `src`.
