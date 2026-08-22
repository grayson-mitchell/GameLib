---
created: 2026-08-14T17:45:00.000Z
title: "Changelog modal shows 'GameLib 1.0.0' while the app is 0.7.0 — stale public/changelog.json survived the 0.x renumber"
area: branding
needs: content-edit
status: CLOSED
closed: 2026-08-22
closed_by: 'PENDING-COMMIT'
files:
  - public/changelog.json
  - meta/__tests__/changelogVersionGate.test.ts
  - src/backend/utils.ts:877-891
  - src/frontend/components/UI/ChangelogModal/index.tsx
  - src/frontend/components/UI/NavShell/components/HeroicVersion/index.tsx:78-90
---

## Problem

Opening the changelog modal (Settings tab → tier-2 column footer → click
"GameLib Version: 0.7.0") displays a changelog headed **"GameLib 1.0.0"**, tagged
`gamelib-v1.0.0`, dated `2026-06-30`. The running app is **0.7.0** (`package.json`),
and every other version surface agrees on 0.7.0 — the About window was confirmed
correct in the same session.

Found during Phase 34.1 live UAT on 2026-08-14 (test 10 / E7, Electron parity re-run).
The modal itself works — E7 is a PASS on the mechanism. The **content** is wrong.

## Root cause — a guard that did its job, on the wrong class of string

`getCurrentChangelog()` (`src/backend/utils.ts:877-891`) reads `public/changelog.json`
verbatim off disk and returns it as the `Release` object the modal renders. Nothing
derives or validates it against `package.json`.

`public/changelog.json` was written 2026-07-02 and still carries the pre-renumber
identity:

```json
"tag_name": "gamelib-v1.0.0",
"name":     "GameLib 1.0.0",
"html_url": ".../releases/tag/gamelib-v1.0.0",
"body":     "## GameLib 1.0.0\n\n- **Steam platform support**: ..."
```

The 2026-07-20 `v1.x → 0.x` renumber swept the project with a lookahead-guarded regex
`v1\.([0-6])(?!\d)(?!\.\d)`, **deliberately** written to preserve literal version strings
— `gamelib-v1.0.0` is named in the renumber record as one of the strings it protected.
That guard is correct for git tags and dependency pins. It is wrong here, because this
particular `1.0.0` is not a version reference, it is **user-facing display copy**.

The generalizable lesson: a renumber sweep that protects "version strings" as a category
will silently skip the subset of them that are *rendered to users*. Protection and
correctness diverge exactly where a version string doubles as content.

## Not covered by the existing renumber carryforward

The known-open item from the renumber is the `gamelib-v1.0` **git tag** on the `gamelib`
remote (a pushed-ref rewrite, left pending user confirmation). That is a different
artifact. No pending todo covered `public/changelog.json` before this one.

## Fix

1. Rewrite `public/changelog.json` for 0.7.0 — `tag_name`, `name`, `html_url`, and the
   `## GameLib 1.0.0` heading inside `body`. Confirm the body's feature list actually
   describes what 0.7.0 ships; it was authored for a 1.0.0 that never released.
2. Decide whether this file should be generated rather than hand-maintained. It is the
   only version surface not derived from `package.json`, which is why it drifted alone.
3. Add a gate asserting `changelog.json`'s `tag_name`/`name` agree with `package.json`'s
   `version`. This is a two-line check and would have caught the drift the day it started.

## Related

`getLatestReleases()` (`src/backend/utils.ts:869-875`) is separately and deliberately
suppressed — it returns `[]` unconditionally so the "Update Available!" block never
renders. Same commit family, same 1.0.0-vs-Heroic-2.22 reasoning. That suppression is
intentional and should NOT be undone by this fix; see the Phase 34.1 UAT test 10 record
for why the historical "releases pass" was vacuous.

## Reference

Discovered in: `.planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-HUMAN-UAT.md` (test 10, sub-item E7)

## Outcome (2026-08-22)

All three fix items done. Re-confirmed live first: `changelog.json` still read `gamelib-v1.0.0` /
`GameLib 1.0.0`, `package.json` still reads `0.7.0`.

### 1. Content rewritten for 0.7.0

`tag_name`, `name`, `html_url` and the `## GameLib 1.0.0` body heading all now carry `0.7.0`.
`published_at` also moved, `2026-06-30` → `2026-07-20`: the old date was v0.1's ship date and
would have been a fresh instance of exactly this drift. `2026-07-20` is the date the renumber
commit (`3b8411c65`) set `package.json` to `0.7.0`.

**The body's feature list did NOT describe 0.7.0 and has been rewritten.** It was written
2026-07-02 (`bf56c85f9`) and covered only v0.1 Steam Platform plus Phase 5 branding. Between then
and 0.7.0 the app gained v0.3 Humble, v0.4/v0.5 compatibility data and the macOS CrossOver
runtime, v0.6 aggregated store search, and v0.7's own headline — the native depot-download
engine, multi-host fan-out, and Steam key redemption. None of it was mentioned. The new body is
cumulative ("what GameLib 0.7.0 is") rather than a delta, which is the right shape here: GameLib
has never publicly released, so no user has ever been shown a prior changelog to diff against.

Claims were checked against MILESTONES.md rather than written from memory; nothing with an open
gap is claimed.

### 2. Generated vs hand-maintained — decided: hand-maintained prose, gated identity

`body` is editorial copy and cannot be derived from `package.json`. Generating just the four
identity fields at build time would put a build step to write into `public/`, which the Tauri
sidecar resolves as a bundled asset (`appRootResolution.test.ts`), and would buy nothing a test
does not — for four strings that change once per release. A gate that fails on the version-bump
commit is cheaper and fires at the right moment.

### 3. Gate added — `meta/__tests__/changelogVersionGate.test.ts`

Asserts `tag_name`, `name`, `html_url` and the body's first `##` heading all agree with
`package.json`'s `version`, plus a no-leftover-`1.0.0` check and a self-guard that `pkgVersion`
really parsed. `meta` is a jest project and `pnpm test:ci` runs jest in CI, so this fires
automatically; the next `package.json` version bump will turn it RED until the changelog is
updated with it.

**Proven non-vacuous.** Run against the pre-fix `changelog.json` with the final test text:
5 failed / 2 passed (the two that pass are the self-guard and `published_at`, both genuinely true
before the fix). Against the new file: 7/7 pass.

### Also verified

`node scripts/verify-branding.cjs` 30/30 pass; `appRootResolution.test.ts` 9/9 pass;
`tsc --noEmit` exit 0; prettier and eslint clean on both touched files.

### Adjacent finding — not fixed here

`scripts/verify-branding.cjs` is referenced by no `package.json` script and no CI workflow. It
passes 30/30 when run by hand, but nothing runs it. That is why the gate above went into
`meta/__tests__/` instead of being appended to the branding script, where it would have looked
like coverage without ever firing. Worth its own todo.

The modal was not re-opened in a running app — the mechanism was already a PASS (34.1 UAT test 10
/ E7) and this was a content-only change, but the rendered result is unverified by eye.
