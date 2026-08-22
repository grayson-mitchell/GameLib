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
- **The homeless D-CYCLE6-A ownership was flagged, not re-homed.** That is an operator call.

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

## Residuals — flagged for the operator, NOT decided here

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
