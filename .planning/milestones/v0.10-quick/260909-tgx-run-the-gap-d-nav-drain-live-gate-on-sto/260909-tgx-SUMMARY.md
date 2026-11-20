---
status: complete
quick_id: 260909-tgx
date: 2026-09-09
verdict: PASS
---

# 260909-tgx — GAP-D nav drain live gate

Ran quick `260905-e61`'s unrun second definition-of-done line. No product code changed; the
deliverables are records.

## Verdict

**VERDICT: PASS**, against binary sha256
`f480c24095b8213c2530e80de6a0b55edb473bca8cdaf5f3b14f7ed2d1eed99c`
(`gamelib-shell`, built 2026-09-09T21:13:09, HEAD `7392244d0`).

- **Host label follows the page** — demonstrated on `/store/gog`: an in-page link click moved the
  label from exactly `af.gog.com` to exactly `www.gog.com`. Reload never pressed.
- **Back enables on in-embed navigation** — demonstrated `false → true` from a single in-page link
  click on a freshly restarted app.

Full record, including timing limits and provenance: `260909-tgx-LIVE-GATE.md`.

## Where the two todos landed

| File | From | To |
|------|------|----|
| `2026-09-05-confirm-the-gap-d-nav-drain-on-store-gog-on-real-hardware.md` | `todos/pending/` | **`todos/completed/`** (`resolved_by: 260909-tgx`) |
| `2026-09-05-in-embed-navigation-never-reaches-the-renderer-back-forward-de.md` | `todos/completed/` | **stayed in `todos/completed/`** — PASS branch, so it was not reopened |

Two now-false claims in that second file were corrected: its `resolution:` line said the live
confirmation "remains OUTSTANDING", and its second DoD box read `[ ] … NOT DONE`. Both would have
sent the next reader to re-run a gate that has now been run. No new todo was filed.

`pnpm planning-gates`: **9/9 PASS**.

## Three things worth carrying forward

1. **`tauri build` deletes the `.app` it just made.** Its log reads
   `Cleaning …/bundle/macos/GameLib.app` after bundling the DMG, leaving that directory holding
   only a **stale `GameLib.app.tar.gz` from 2026-09-05 07:52** — the pre-fix artifact. Anyone who
   reaches for the obvious path after a release build gets a binary four days older than the fix
   under test and records a false FAIL. Recover the `.app` from the DMG and tie it by sha256 to
   `target/release/gamelib-shell`, as this run did.

2. **Disabled state is not readable by colour in this theme.** `StoreEmbedControls` styles
   `:disabled` with `var(--icon-disabled)`, but Back, Forward and Reload all measured an identical
   darkest glyph pixel of `rgb(33,36,43)`. Any live gate scoring "greyed out" by eye is unfounded.
   Read the DOM `disabled` attribute through the accessibility tree instead — and note Forward
   returning `false` in the same read is the negative control proving the probe discriminates.

3. **On `/store/gog`, Back is enabled before you click anything.** The Store tab always opens Steam
   first, and selecting a different store pushes onto the *same* embed history rather than
   resetting it. The todo's "Back becomes enabled" therefore cannot be observed unconfounded on
   that route; isolating it needs a fresh app start. This is app behaviour, not a defect, but it
   invalidates the gesture as written and any future re-run will hit it again.
