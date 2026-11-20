---
quick_id: 260823-ptz
slug: humble-keys-confirm-before-activate-drop
date: 2026-08-23
status: complete
commits:
  - 33d1af2d5 feat(260823-ptz) confirm before Activate on Steam keys
  - 30625ac99 refactor(260823-ptz) drop the tab blurbs from Keys-waiting and Giftable Spares
---

# Quick Task 260823-ptz — Summary

Operator feedback on `260823-op3`.

## 1. Confirmation before Activate

Steam keys start at a confirm step again. Copy is entry-mode aware because the
two entries are not the same promise: `claim` names both irreversible halves
(the reveal AND the Steam redemption), `finish` names only the redemption —
promising a reveal for an already-revealed key would be a lie.

**This restored T-14-08 instead of working around it.** `260823-op3` had
amended that invariant to allow a mount-effect reveal, guarded by a `useRef`
latch. With the click gate back, the effect is unnecessary: it and the latch
are both deleted, and no effect in the component reveals on mount for any
platform. The `it.each` covering HCLAIM-01 now asserts that for gog *and*
steam.

The ref survives with a different job — a re-entrancy guard inside
`runActivate`. `busy` alone cannot close the double-click window: it is state,
so both clicks of a same-frame double-click read the pre-render `false` and
`disabled={busy}` has not applied yet. A test clicks twice before any
re-render and asserts exactly one reveal.

Side effect worth noting: for a Steam `finish` entry the
`humbleGetRevealedKeyValue` read is now deferred until after the confirm,
where it used to be a mount effect. The D-66 invariant it protects (read the
stored value, never re-reveal) is unchanged.

## 2. Tab blurbs removed

Both `<p className="humbleKeysBlurb">` elements and the now-unreferenced
`.humbleKeysBlurb` rule are gone. `humbleKeys.waitingBlurb` /
`sparesBlurb` stay in `translation.json` — that catalog is upstream-owned and
the D-05 churn guard fails CI on any write to it, so an orphaned key is the
cheaper outcome.

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `jest --selectProjects Frontend` | 122 suites / 1991 tests passed |
| i18n gates (hardcoded-string, churn, glossary, gate-scope) | 183 passed, 1 skipped |
| `eslint src/frontend/screens/Humble/Keys` | 0 errors (1 pre-existing warning) |
| `grep -r humbleKeysBlurb src` | no matches |

## Not done

Still no live UAT — `260823-op3` and this follow-up have only been exercised
under jest. The confirm copy, the two tabs' new spacing, and the activate
sequence against a real Humble key are all unverified in a running build.
