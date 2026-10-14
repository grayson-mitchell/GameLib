---
created: 2026-10-14T00:00:00.000Z
title: "'Paused while a window is open' is shown on the Epic route when no window is open, and it has now caused a measured misdiagnosis"
area: webview/store-embed
severity: minor
platform: macos
ready: human
found_by: "Live gate of UAT Item 16, 2026-10-14. Previously named in 50-REVIEW.md's 'Open, not fixed here' without a cost record; this todo exists because the cost is now known."
files:
  - src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx
  - src/frontend/screens/WebView/components/StoreEmbedSlotContents.tsx
  - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UI-SPEC.md
---

## The defect

`StoreEmbedPlaceholder` renders the string *"Paused while a window is open"*. On macOS
`/store/epic` it is rendered whenever `suppressed || isEpicSurface`
(`StoreEmbedSlotContents.tsx:52`), and `isEpicSurface` (`WebView/index.tsx:372`) is **statically
true for the whole route**. So the copy is shown continuously on that route, including — in fact
especially — when **no window is open at all**: before first paint by design (D-06), and for as
long as a navigation is failed or timed out.

The string is correct for the D-19 suppression case it was written for. It is simply false on the
Epic surface, which reuses the same component.

## Why this is filed at all, given it was already known

`50-REVIEW.md`'s `## Open, not fixed here` already names it:

> The "Paused while a window is open" placeholder copy still shows through the transparent Epic
> subview during cold loads. UI-SPEC E2 forbids new text on this surface, so changing it needs a
> copy decision.

What that entry lacked was a **cost**, so it read as cosmetic and sat. It is no longer cosmetic:

- It caused a **misdiagnosis that consumed two debug cycles across two sessions**, in which a
  route-default backdrop was read as an active suppression refcount, two candidate "holders" were
  proposed and argued, and a `severity: major` todo was filed for a defect that does not exist
  (`.planning/todos/completed/2026-10-14-store-embed-suppression-sticks-with-no-visible-holder.md`).
- It produced a **self-contradicting commit**: `42dead40a`'s message says "suppression was never
  the explanation" for the banner while the UAT result in the same commit blamed suppression for
  the slot.
- It confounded the reading of **UAT Item 3** and corrupted the stated blocker on **UAT Item 16**'s
  recovery half. Both have since been retracted and corrected.

A misleading string that costs that much is a defect, not a nitpick.

## Why this is `ready: human` and not `ready: code`

**It needs a copy decision, which is yours, not an implementer's.** UI-SPEC E2 forbids new text on
this surface, so the fix is not simply "write a better sentence" — the constraint has to be
revisited or an exception taken. The options, none of them obviously right:

1. **Make the copy conditional** on which reason fired — now mechanically trivial, since
   `abbc84a71` already threads a `reason` (`suppressed` / `epic-surface` / both) to this component
   for diagnostics. This is the smallest honest fix, but it does add text to the surface, which is
   what E2 forbids.
2. **Make the copy reason-neutral** — one string that is true in both cases (something that
   describes the store not being shown, without asserting a cause). Keeps E2's single-string
   intent, loses a little specificity in the suppression case where the current wording is
   genuinely helpful.
3. **Render no text on the Epic surface** — an empty styled fill. Most faithful to D-06, since the
   placeholder there exists to be seen *through* a transparent subview rather than read. Leaves a
   blank area during a long cold load, which may read as broken.
4. **Accept it and rely on the diagnostic attribute.** Defensible only if the string's falseness is
   judged to cost users nothing, now that the thing it misled was a developer, not a user.

Note that option 4 is not a null option: the string is shown to **users** during every cold Epic
load, not only during gates.

## Do not re-derive

The diagnostic groundwork is already done — `data-placeholder-reason` is live on the root element
(`abbc84a71`) and distinguishes the two cases for inspection. That change deliberately did **not**
touch visible copy, precisely so this decision stayed open.
