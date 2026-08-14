---
created: 2026-08-14T17:45:00.000Z
title: "Changelog modal shows 'GameLib 1.0.0' while the app is 0.7.0 — stale public/changelog.json survived the 0.x renumber"
area: branding
needs: content-edit
status: OPEN
files:
  - public/changelog.json
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
