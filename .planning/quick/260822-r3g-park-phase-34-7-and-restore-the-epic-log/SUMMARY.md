---
quick_id: 260822-r3g
slug: park-phase-34-7-and-restore-the-epic-log
date: 2026-08-22
status: complete
commits:
  - 1431b4c03  # fix(login): restore Epic tile roles — embedded login is primary again
---

# Summary — 260822-r3g

## What changed

**Phase 34.7 is ON HOLD** (ROADMAP `### Phase 34.7 … (ON HOLD)` + a `**Status:** ⛔` block, the
same strong-marker convention Phase 22's PARKED entry uses). Its founding premise died: it was
scheduled 2026-08-05 because Epic's embedded WebKit login was judged permanently unusable under
Tauri (Talon's anti-bot 403, "unfixable from JS"), so device-auth/SIDLogin would become the
**single** sign-in path and the interactive legendary-login UI would be **deleted**. The pristine
zero-injection WKWebView login window then defeated that 403 and the embedded login completes a
fresh logged-out sign-in on macOS. Deleting a working path to consolidate onto the other one is
no longer a trade worth making. Parked, not cancelled — revivable if the 403 returns.

**The F-34.5-G6-01 Epic tile pivot is reverted** (commit `1431b4c03`). Epic is now wired
identically under Electron and Tauri; `isTauri()` is gone from `Login/index.tsx` entirely:

| tile | action | label |
|---|---|---|
| primary | embedded web login (`navigate(epicLoginPath)`) | `login.epic` — "Epic Games Login" |
| alternative | `SIDLogin` overlay | `login.alternative_method` — "Alternative Login Method" |

The `deprecatedTile` red deletion-pending marker (quick `260805-d62`, corrected by `260808-f80`)
is removed — nothing on the login screen is scheduled for deletion while the hold stands.

## Deliberate non-actions

- **`Runner`'s `deprecatedTile` prop and its unit tests are RETAINED** though no runner passes it
  now. On hold is not cancelled; re-marking a doomed path should stay a one-prop change. The prop
  is documented as currently-unused at its declaration so it does not read as live wiring.
- **`primaryLoginAction` is untouched** — it is still load-bearing for Steam and Humble, which use
  it to open their in-app login overlays. Only Epic's call site stopped passing it.
- **STATE.md frontmatter (`last_activity`, `stopped_at`) was NOT edited.** It records a concurrent
  session's Phase 37 closure; a quick task's record belongs in the Quick Tasks table, which is
  where it went.
- ~~**The homeless D-CYCLE6-A ownership was flagged, not re-homed.**~~ **Superseded by the addendum below — the operator called it the same day: it goes to Phase 34.6.**

## Test surface

The four SOURCE GATEs of `260805-d62`/`260808-f80` pinned the exact ternary expressions this task
deletes, so they could not simply be kept. They were replaced by gates that assert the restored
shape **and the absence of every expression the pivot introduced**, so a silent re-pivot fails
loudly:

- Epic block contains no `primaryLoginAction` (sliced off at the next `<Runner` so no other
  store's tile can satisfy or violate it), and is labelled `login.epic` / `loginUrl={epicLoginPath}`
- `alternativeLoginAction={() => setShowSidLogin(true)}` — unconditional, both shells
- `isTauri` appears nowhere in `Login/index.tsx`
- both superseded `deprecatedTile` ternaries absent, `deprecatedTile` occurrence count **0**

**RED proof:** all five assertions were run against `git show HEAD:…Login/index.tsx` (pre-edit
text) and all five failed there. Non-vacuous.

Results: Login suites **237/237** (`index.test.tsx` 18/18), `npx tsc --noEmit` exit 0, `eslint -f
json` filtered on `severity === 2` → **0 errors** on the three changed files, `prettier --check`
clean **measured in place** (the test file needed one `--write`; the resulting diff hunks are all
inside the edited block, confirmed via `git diff -U0 … | grep '^@@'`).

## Residuals — flagged, then RESOLVED the same day (see Addendum)

1. **Epic, `egsSync` and legendary save sync are owned by Phase 34.7 per D-CYCLE6-A** (34.5's gap
   cycle 6 descoped Epic *to* 34.7 rather than closing it). That IPC-port work is unaffected by
   the login-path decision and is now **homeless**. It needs another phase.
2. **Phase 35's `Depends on: … Phases 34.1–34.7`** is now partly vacuous — the "device-auth
   single-path consolidation" leg is withdrawn, but residual 1 genuinely still gates the Electron
   cutover. Annotated in place at both sites (the dependency line and the 34.5-leg block quote)
   so neither can sit stale.

## What is NOT proven

This jest project has no jsdom, so every gate above proves a wiring **expression**, never a
rendered pixel. Which tile a user actually sees first is a live-verification question — that is
exactly how `260808-f80` caught `260805-d62` marking the wrong tile. **Open a login screen and
confirm the primary Epic tile now opens the embedded login window.**


---

# Addendum — both residuals re-homed to Phase 34.6 (2026-08-22, same task)

Operator decision, immediately after the hold landed: **move the D-CYCLE6-A items into Phase
34.6.** Done, commit below.

## What actually moved

Three of Phase 34.5's live-gate items, descoped to 34.7 by `D-CYCLE6-A` (34.5's
`deferred-items.md` item 24):

- **UAT test 11, Epic half** — Epic login from scratch, library populated. (Amazon's half never
  travelled; it stayed in 34.5 as the fourth gate's item 2.)
- **UAT test 12 — `egsSync`**
- **UAT test 13 — legendary save sync**

**These are VERIFICATION items, not ports** — `egsSync` is already one of slice 8's 58 ported
channels; what was never done is exercising it, Epic login and legendary save sync on a live
Tauri build. The inheritance adds no channel-porting work to 34.6.

## Why 34.6 is the right home, not just an available one

It is the last IPC-re-plumb slice, it is unplanned (0 plans, no directory — `/gsd-plan-phase
34.6` is the stated next step, so this scope lands *before* planning rather than as a late
amendment), it runs its own live gate, and it already carries 8 EOS overlay channels — which are
Epic. So the standing "scope Epic OUT of new phases by default" decision (2026-08-04) is bent
only narrowly here, and only for **live verification of paths that already work**.

**D-CYCLE6-A's reasoning is now void, which is what makes this coherent rather than a reversal.**
It held the item could never be gated in 34.5 because a PASS "would certify code that is
scheduled for removal" and a FAIL "would block on work the 2026-08-05 parking decision forbids".
Neither horn survives the hold: the embedded Epic login is not scheduled for removal (it is the
primary path again), and exercising a login that works is not investigating the 403. Under 34.6
both horns disappear and the items are ordinarily gateable. The descope itself still stands — it
still retires nothing — only its owner changed.

## Every site that named 34.7 as owner, updated

| file | change |
|---|---|
| `ROADMAP.md` § 34.6 | title extended; new **INHERITED SCOPE** block; fourth residual added to `Depends on`; `Blocks` now says it carries Phase 35's Epic verification leg |
| `ROADMAP.md` § 34.7 | residual list flipped from "need re-homing" to "BOTH RE-HOMED TO 34.6"; states nothing is owed to the parked phase any more |
| `ROADMAP.md` § 35 | dependency line now reads "read this line as 34.1–34.6"; the 34.5-leg block quote redirects "owned by 34.7" → 34.6 |
| `STATE.md` | the 34.5 residuals block redirects the same way, with the item list spelled out |
| `34.5/deferred-items.md` item 24 | heading struck through to **Phase 34.6**; owner-change block; marks the descope's *rationale* void while its *effect* stands |
| `34.5-CYCLE6-ROUTING.md` | `status: binding`, so amended at the top: read every "34.7" below as 34.6 |
| `34.5-UAT.md` | banner: every "TRAVELLED TO PHASE 34.7" row now means 34.6 |

**The individual `34.5-UAT.md` rows still read "34.7" ON PURPOSE.** They record where those items
went *at the time*; rewriting a closed phase's ledger rows would destroy that record, so the
banner is the redirect. This is the one place a reader could still be misled if they skip the
header — worth knowing about.

No code changed in this addendum. Docs only.
