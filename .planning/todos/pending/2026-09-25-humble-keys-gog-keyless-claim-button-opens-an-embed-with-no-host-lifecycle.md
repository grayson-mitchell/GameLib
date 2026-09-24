---
created: 2026-09-25T00:00:00.000Z
title: 'The `gog_keyless` "Claim on Humble" button is unresponsive — it opens the singleton embed with no host route, no slot and no lifecycle'
area: humble/keys-screen
severity: major
platform: any
ready: code
status: OPEN
found_by: 'Phase 43 UAT item 8 (2026-09-18), operator on a hash-verified release build: "oh that is broken, button is unresponsive". Root cause below is the UAT''s own lead, PARTLY re-adjudicated by quick-260925-e4d.'
files:
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/screens/WebView/index.tsx
---

## The defect

Clicking `Claim on Humble` on a `gog_keyless` row does nothing observable. The button is the one
plan 43-09 shipped as candidate B (the Phase 40 embedded store browser) for `REQ-43-24`.

`openHumbleKeysEmbed()` (`HumbleKeyRow/index.tsx:304-321`) calls `window.api.storeEmbedOpen()`
**directly from a row**, while the caller is still on the Humble Keys route. Nothing mounts the
`/store/*` host route, so nothing afterwards sizes, shows, or scroll-syncs the native subview the
call just created. The two presentations that look identical to "unresponsive" from the chair:
the embed opens offscreen or at a near-zero size (spike 024 has a captured instance of a squeezed
58px embed), or it opens behind the route that is still mounted.

## Correction to the UAT's root-cause lead — read before citing it

`43-UAT.md`'s gap block says this call site "does the exact two things that hook's own header
comment forbids in writing". **That overstates it, and the overstatement is worth killing now**
so nobody fixes the arguable half and declares victory.

`useStoreEmbedHost.ts:17-22` claims to be the one `storeEmbedSetBounds` call site, and forbids
fabricating a rect **for that writer**. `openHumbleKeysEmbed` never calls `storeEmbedSetBounds` —
it passes an initial rect to `storeEmbedOpen`, and the row's own in-situ comment
(`index.tsx:295-302`) argues exactly this distinction in advance: "a one-shot snapshot, not a
continuously-synced rect ... must not become a second writer against the same singleton embed."

So:

- **Arguable half** — whether a one-shot `storeEmbedOpen` rect from `.App .content` (with a
  `window.innerWidth/innerHeight` fallback) violates the single-geometry-oracle rule. The rect it
  computes may well be correct. Do not lead with this.
- **Non-arguable half, and the actual defect** — the embed is opened with **no host route mounted
  and no slot**. Whatever rect it gets at open time, nothing owns it afterward: no bounds sync, no
  hide-not-close lifecycle, no suppression handling. Those are the three things
  `useStoreEmbedHost`'s header names as what "a long-lived native subview needs that a DOM element
  gets for free".

## Silence is not evidence — do not re-derive this

The operator saw no log line and `gamelib.log` had nothing after the click. That is **not**
evidence the click failed to fire:

- the `[WebView] store/wiki route …` lines come from the store ROUTE, which this button never
  enters, so their absence is expected either way;
- the sidecar's failure path is `console.warn` (`storeEmbedFlowRegistration.ts:313`), and this
  repo has already recorded that the sidecar's console and logger are invisible;
- the Rust arm's failure path is `eprintln!("[shell] …")`, into a stderr nobody reads in a
  Finder-launched packaged `.app`.

## Fix directions (from the UAT's `missing:` block, unchanged)

1. Route the `gog_keyless` claim through the Phase 40 host route — the same path `/store/*` takes
   — instead of calling `storeEmbedOpen` from a row; **or**
2. give this call site a slot and a host lifecycle of its own, and stop it fabricating bounds.
3. **Either way:** the fire-and-forget `void` at `index.tsx:320` must at minimum log its resolved
   `{status, error}`. The sibling call site inside `useStoreEmbedHost` *does* catch and log
   (`logNavCallFailure`); this one discards it, which is why the failure is silent.

## `ready: code`, but the live repro is GONE on this machine

The fix is desk-editable and provable against the host route's own structure. **Confirming it
live is not available here**, and that is a property of the operator's account, not of the code —
see `43-PROBE-D-43-11.md` § "ANSWERED 2026-09-22":

- `gog_keyless` is the **unlinked-GOG-account** shape. The operator has since linked GOG, so
  Racine flipped `UNREVEALED` → `REVEALED` and a newly purchased GOG title (Resident Evil 3)
  arrived as keyed **`gog`**.
- This branch needs `gog_keyless` **and** not-`REVEALED` **and** `keyindexResolved`. No
  entitlement in this library satisfies it any more, and with the account linked none should
  again.

**The defect still ships for every user whose GOG account is unlinked.** It is unreachable on one
machine, not fixed. Verifying a fix needs either an unlinked test account or a fixture-driven
render test rather than a live click.

## Related

- `[[2026-09-25-humble-keys-revealed-gog-keyless-row-renders-a-finish-activation-dead-end]]` —
  the same row, the branch Racine takes *instead* now that it is `REVEALED`.
- `43-PROBE-D-43-11.md` — candidate A (in-app keyless redeem) is **MOOT**, not dead: the keyless
  shape stops occurring once the account is linked, and keyed `gog` is already handled end to end
  by `keyTypePresentation.ts:131`'s `REDEEM_URL_BUILDERS.gog`.
