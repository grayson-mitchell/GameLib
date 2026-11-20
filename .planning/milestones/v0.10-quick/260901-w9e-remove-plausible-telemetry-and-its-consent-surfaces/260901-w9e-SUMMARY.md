---
quick_id: 260901-w9e
slug: remove-plausible-telemetry-and-its-consent-surfaces
status: complete
date: 2026-09-01
mode: quick
ships_code: true
resolves_todo: disable-plausible-telemetry-reporting-into-heroic-property
commits:
  - 9a1147e7c
  - d79cea014
---

# Quick Task 260901-w9e — Summary

**The Plausible integration and both consent surfaces are gone. Net −298 lines across 11 files,
three of them deleted outright.** Closes the OPEN todo
`disable-plausible-telemetry-reporting-into-heroic-property`, filed 2026-08-15 and deferred
2026-08-18 until Phase 35 landed. Phase 35 closed earlier the same day (quick `260901-vuy`).

## Commits

| Commit | Scope | Net |
|---|---|---|
| `9a1147e7c` | Frontend consent surfaces + the two blocking-gate artifacts | −133 |
| `d79cea014` | Backend integration, `AppSettings` field, factory default | −144 |

Ordered deliberately: both components type against `AppSettings`, so removing the backend field
first would have broken them mid-sequence. Each commit typechecks on its own (`tsc --noEmit`
clean after each).

## The sub-decision the todo left open, and why the evidence moved

The todo asked: is the consent UI **removed outright** or **kept and hard-wired off**? It recorded
these as balanced, with roughly equal dead code either way. Measured at HEAD they are not:

- `startPlausible()` had **zero importers**. Its only caller was `src/backend/main.ts:22`/`:496`,
  both deleted by `5643c7583` (plan 35-14, the Electron cutover point of no return). The
  module-level `backendEvents.on('settingChanged', …)` listener at `plausible.ts:133` therefore
  never registered either — nothing imported the file to evaluate it.
- `build/main/sidecar.js` contained **0** occurrences of `heroic-games-client.com`.

So the leak the todo was *filed for* had already been closed by the cutover, as a side effect, and
"kept, hard-wired off" was not a hypothetical option — it was the **live state**, and the worst
form of it. `AnalyticsDialog` interrupted first launch to ask the user to consent to collection
that named Plausible, GDPR/CCPA/PECR and "the data we collect on the GameLib logs", none of which
could happen; `AnalyticsOptIn` offered a toggle whose only effect was writing a config field
nothing read. That is exactly the [[uploaded-log-delete-button-lies]] failure mode the todo cited
as the argument *against* hard-wiring off.

Removal also matches the operator's standing decision of 2026-08-15 — disable telemetry entirely
rather than repoint at a GameLib-owned property.

## Decisions

**D-01 — `public/locales/` untouched; the i18n question was already answered by precedent.**
All 12 analytics keys (`setting.analyticsOptIn`, `help.analytics`,
`analyticsModal.title|enable|disable|info.pt1..pt7`) live in **upstream-owned**
`translation.json`, not fork-owned `gamelib.json` — measured, not assumed.
`meta/i18nCatalogChurnGuard.ts` classifies any changed `public/locales/` path that is not a
`gamelib.json`/`gamelib.mt.json` leaf as `upstream` and throws `UpstreamChurnError`, and its
`live tree` block asserts that against the real working tree under `pnpm test:ci`. The keys go
inert across all 49 catalogs — the same call quick `260810-tr4` (D-01) made for
`setting.steamruntime` and `260805-rwy` made for `login.message`. Verified mechanically:
`git status --porcelain public/locales/` is empty.

**D-02 — the two blocking-gate artifacts were hand-edited surgically, NOT regenerated.**
This is the part that would have broken silently. `meta/i18nGateScope.json` listed both
components, and its consumer `scanScope()` **throws `ScopeLoadError` on an unreadable scoped
file**, with `genI18nGateScope.test.ts:332` separately asserting `existsSync` for every scoped
entry. Deleting the components without mirroring the deletion would have turned the *blocking*
i18n gate red for a structural reason with no real violation behind it.
`genI18nGateScope.ts:498` names surgical hand-editing as the sanctioned path;
`pnpm gen-i18n-gate-scope` was **not** run, because [[i18n-fork-pin-regen-cascades]] measured that
regen taking this suite from 1 failure to 5. Scope 163 → 161, fork-touched 206 → 204, with every
non-`files` key proven byte-identical.

**D-03 — no settings migration.** A persisted `"analyticsOptIn": false` becomes an ignored extra
key once the field leaves `AppSettings` — nothing reads it, nothing throws. Same call as
`260810-tr4` D-03. The `analytics-modal-shown` localStorage key is likewise left orphaned and
unread; there is no code path that could act on it.

**D-04 — `meta/hardcodedStringGate.ts:225`'s comment left as written.** It names
`AnalyticsDialog.tsx` among five files where `34.8-AUDIT.md` confirmed an ALL-CAPS token
(`type: 'MESSAGE'`) is a discriminator rather than prose. That is a record of what the audit
triaged on the day it ran. Editing it would falsify an audit history to tidy a comment; four of
the five files still exist.

## The A-03 ratchet needed no edit — proven, not assumed

`DECLARED_UNSCANNED_DEBT` pins `unscanned = forkTouched − scope` exactly, and *any* drift fails it
by name. Both deleted files were in **both** lists, so neither was ever in the difference. Computed
against `git show HEAD:` copies of both artifacts before and after: **43 entries before, 43 after,
sets identical.** Had only one list been edited, this ratchet would have gone red — and the
tempting "fix" would have been to declare two deleted files as permanent unscannable debt, which
can never be paid.

## What surfaced: the generator's first-ever shrink

Every prior change to these artifacts was an *addition* (181→185→199→205→206). This is the first
**removal**, and it exposed an ordering constraint nothing documents: the A-17 ANTI-ROT test
derives the live set from `git diff --name-status <baseCommit> **HEAD**`, not the working tree.
`deriveScopeFiles` does correctly skip `D`-status entries — but only once the deletion is *in
HEAD*. With the deletion staged but uncommitted, A-17 went red against a correct artifact.
Confirmed by replicating the derivation against the staged index with a control (the replication
reproduces the committed 206 from `baseCommit..HEAD` exactly), then re-running the real suite after
commit 1: green.

**A near-miss worth recording.** Probing this with `npx tsx -e "import { deriveScopeFiles } …"`
executed the module's top level, whose main **rewrote `meta/i18nForkTouchedFiles.json` back to
206** — the exact regen cascade D-02 exists to avoid, arriving through an import side-effect rather
than a deliberate `pnpm` invocation. Caught because the run printed
`Wrote meta/i18nForkTouchedFiles.json: 206 fork-touched eligible files`, and reverted from the
index with `git show :<path>` (never `git checkout --`, which fires the post-checkout hook here).
The measurement was redone with a standalone replication plus a control instead.

## Fork-hygiene sweep (the todo asked for it)

Swept every `http(s)://` literal in `src/` and `src-tauri/src/` outside `__tests__`, reduced to
hosts. **No second Heroic-owned analytics property exists.** Two outbound sinks remain and are
deliberately untouched:

- `https://dpaste.com/api/v2/` (`src/backend/logger/uploader.ts:13`) — log upload, a genuine
  outbound data sink. Already tracked by [[log-upload-has-no-redaction]]; unredacted content is
  that todo's problem.
- `https://heroic.legendary.gl/v1/…` (`storeManagers/legendary/library.ts:725`, `:742`) — Heroic's
  Legendary metadata API. **Read-only** (`version.json`, `sdl/{appName}.json`): a fetch, not a
  report. Named here so a later reader does not have to re-derive that it is not a telemetry sink.

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit` after each commit | clean |
| `eslint` on all 8 touched files | **0 errors** |
| `genI18nGateScope.test.ts` warning baseline | 6 before → 6 after, identical, shifted +10 lines (measured by temporary HEAD swap) |
| `prettier --check` on all touched files | clean |
| Residual grep (`analyticsOptIn`/`AnalyticsDialog`/`AnalyticsOptIn`/`startPlausible`/`plausible.io`/`heroic-games-client`) | only `public/locales/` (D-01), the D-04 comment, and this task's own history note |
| `git status --porcelain public/locales/` | **empty** — D-01 held mechanically |
| A-17 ANTI-ROT (live git derivation) | **green** after commit 1 |
| Targeted gate suites | 166 passed / 2 failed — **identical to the pre-change baseline** |
| `pnpm test:ci` | 7474 passed, 6 failed across 3 suites — all three accounted for below |

### Every failure accounted for — none caused by this change

The baseline was measured **before the first edit**, so no failure here can be silently inherited.

1. **`hardcodedStringGate.test.ts` (2)** — pre-existing at HEAD. A hardcoded string at
   `src/frontend/screens/Game/GameSubMenu/repairFailure.ts:135` ("Repair failed. See log for
   details."). Measured red before any file was touched. **This means the blocking i18n gate is
   currently red on this branch for an unrelated reason** — flagged, not fixed here.
2. **`downloadmanager/__tests__/utils.test.ts` (1)** — pre-existing. Reproduced at `HEAD~2`
   (`af9c8628b`) in a clean worktree: the stall-copy assertion expects `box.error.install.stalled`
   but receives the `gamelib:`-prefixed key.
3. **`decompressPool.test.ts` (3, lzmaLoader native decode)** — **a main-working-tree environment
   artifact, not a code defect.** Proven by holding the commit constant and varying the tree: the
   same commit `d79cea014` passes **41/41** in a clean worktree. Since the commit is identical in
   both runs, the commit cannot be the cause.

## Deliberately NOT done

- **The todo's "Future direction" is not implemented.** No GameLib-owned analytics destination, no
  opt-in → opt-out reversal, no Steam in the provider props. The todo itself scopes that as
  separate future work: fresh consent UX, backend and privacy language, not an un-disabling of
  this code path.
- **`repairFailure.ts:135` not fixed** — a real, currently-red blocking gate, but a different
  defect that predates this task and deserves its own record rather than being absorbed here.
- **`pnpm gen-i18n-gate-scope` / `pnpm i18n` not run** (D-02).
- **`meta/i18nGateAllowlist.json` not widened** — pinned at exactly 2 entries by T-34.8-30, and
  widening it is a decision, not a route to green.
