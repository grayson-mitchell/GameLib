---
created: 2026-07-26T00:00:00.000Z
title: "Uploaded-log delete button is wired to a channel that cannot delete anything"
area: logs
status: CLOSED
resolution: NOT-A-DEFECT (false premise) — invariant now enforced by a regression gate
files:
  - src/frontend/screens/Settings/sections/LogSettings/components/UploadedLogFilesList/index.tsx:60
  - src/backend/logger/uploader.ts:74-77
  - src/frontend/screens/Settings/sections/LogSettings/components/UploadedLogFilesList/__tests__/deleteButtonReachability.test.tsx
---

## Problem

`UploadedLogFilesList/index.tsx:60` wires a live delete button to the `deleteUploadedLogFile`
channel. But `logger/uploader.ts:74-77` hardcodes `const token = '1'` with the comment
"dpaste.com does not support deleting files, there's not token… I'll hide the delete option." The
delete option was never hidden. The channel POSTs a bogus token to the paste's delete URL and
either fails outright, or falsely reports success while the paste stays public on dpaste.com.

**Affects both builds.** This is an inherited upstream Heroic defect, not port-introduced — Phase
34.3 ported `deleteUploadedLogFile` at parity onto the Tauri sidecar and explicitly declared its
structural deadness in `34.3-PORTED-CHANNELS.md` (D-08) rather than fixing it here, since fixing a
frontend button riding inside a port slice would have changed Electron's own behavior. Distinct
from Phase 34.2's D-07: that channel was dead *only under Tauri* (a port-introduced gap, in scope
to fix); this one predates the port entirely in both builds.

## Solution

Either hide the delete button as the original code comment intended (the button never being
hidden is the actual bug — the "hide the delete option" design was correct, it just was never
executed), or move log uploads to a paste host with a real delete API so the button can work as
advertised.

## Resolution (2026-08-22) — the premise was false, and was false when filed

**There is no live delete button, and there has not been one since 2026-04-20.** Upstream
`6ec27795c` ("[FIX] Use dpaste.com instead of 0x0.st to upload logs", #5491) — the *same* commit
that introduced `const token = '1'` and the "I'll hide the delete option" comment — also commented
the delete `SvgButton` out in the same change. It entered this history on 2026-04-22, **three
months before this todo was created**. `index.tsx:60` reads as a live call site because the JSX
comment block opens on line 59; both this todo and Phase 34.3's D-08 note read line 60 without
line 59. `git log -S` on the comment marker names the commit in one command.

So neither branch of the proposed Solution applies: the button was already hidden (branch 1, by
upstream), and moving paste hosts (branch 2) is a feature decision with no user-visible defect
driving it. `deleteUploadedLogFile` remains registered in both builds as dead code, reachable only
from the preload API surface — no UI path exists.

**What was actually done.** Verification alone would have left the same trap for the next reader,
so the invariant is now enforced instead of asserted:

- **New gate** — `UploadedLogFilesList/__tests__/deleteButtonReachability.test.tsx` (4 tests).
  It invokes the row component and walks the returned React element graph for *any* element
  carrying an `onClick`, then fires each against a stubbed `window.api` and asserts which channels
  are reached. Deliberately NOT a text gate: a grep would key on the comment markers and pass
  against a live delete button written any other way (raw `<button>`, renamed component, different
  icon). It also pins the backend premise (`const token = '1'` still present), so it fails if a
  host with a real delete API ever replaces dpaste and the UI decision needs revisiting.
- **RED-proven against the real defect**, not just a synthetic one: un-commenting the upstream
  block failed 2 of the 4 tests; the component was then restored byte-identical. A synthetic
  self-test and a non-vacuity test (the walk *does* find the surviving open-URL control) ship in
  the file.
- **Stale records corrected in place** rather than silently re-ticked:
  `loggerFlowRegistration.ts`'s D-08 docstring, and `34.3-PORTED-CHANNELS.md`'s channel row,
  caveat item 2, and a new Correction 3.

**Unchanged and still true:** `deleteUploadedLogFile` cannot delete anything in either build. That
half of D-08 was always correct — only the "the button is live" half was wrong.

Related: [[log-upload-has-no-redaction]] (still OPEN, and the more serious half of this surface —
`uploadLogFile` sends up to 10 MiB of unredacted log to a public paste).
