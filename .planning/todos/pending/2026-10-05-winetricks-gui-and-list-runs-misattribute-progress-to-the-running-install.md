---
created: 2026-10-05T00:00:00.000Z
title: "Per-row winetricks GUI button stays enabled during an install, and non-install runs tag Done/err with the installing verb"
area: wine
severity: medium
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 44"
files:
  - src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx:111-139
  - src/common/winetricks/deriveRowState.ts:47-49
  - src/frontend/components/UI/Winetricks/index.tsx:223
  - src/backend/tools/index.ts:705-709
---

## Problem

`needsGui` takes precedence over every other row state and its button is always enabled; the footer
GUI button has `disabled={installing}`. `runWithArgs` tags every progress/Done event with the
module-global `installingComponent`, whatever process produced it.

## Failure scenario

- While `dotnet48` installs, clicking the GUI button on `utorrent` starts `winetricks -q --gui` on the
  same prefix. When it exits, `{messages:['Done'], installingComponent:'dotnet48'}` is sent; the
  frontend sets `installing=false` mid-install and re-enables every Install button (straight into the
  double-install todo).
- Any GUI stderr line containing " err" is attributed to `dotnet48`, marking it "Install failed".
- No click needed: reopening the dialog mid-install runs `listAvailable` (`winetricks list-all`), whose
  exit sends the same false Done.

## Suggested fix

- Pass `installing` into Row and disable the GUI button while it is true.
- Stop non-install `runWithArgs` calls tagging events with `installingComponent`: pass the verb
  explicitly from `install()` instead of reading the global.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
