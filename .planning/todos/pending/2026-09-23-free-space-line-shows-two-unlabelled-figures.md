---
created: 2026-09-23T18:50:00+12:00
title: Free-space line labels one quantity but renders two figures
area: ui
files:
  - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx:496-501
  - src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx:694-715
  - src/backend/sidecar/shellFilesFlowRegistration.ts:333
  - src/common/types.ts:808
  - public/locales/en/gamepage.json:268
severity: minor
platform: any
ready: code
---

## Problem

The install dialog's free-space line renders as:

    Space Available: 301.44 GiB / 537.15 GiB

The label names **one** quantity. Two are shown. Nothing states what the second figure is or how
it relates to the first, and a live operator could not work it out.

**Found live** on Windows 11, 2026-09-23, during Phase 38 sitting 2 (the `38-S08` row-4
re-score). Operator, unprompted, while scoring a different question: *"4 present (but not quite
sure why there are two numbers? 301.44 GiB / 537.15 GiB"*.

### What the figures actually are

`src/backend/sidecar/shellFilesFlowRegistration.ts:333`, in the `checkDiskSpace` handler:

```js
message: `${getFileSize(freeSpace)} / ${getFileSize(totalSpace)}`
```

So it is **free / total**. Verified against the real machine at the same sitting via
`Win32_LogicalDisk`: C: was 301.44 GiB free of 537.15 GiB total — a byte-for-byte match with the
rendered string. **The numbers are correct.** This is a presentation defect, not a computation
one; do not "fix" the arithmetic.

### Why it misleads

`X / Y` with a slash reads just as naturally as *used of total*, which inverts the meaning: a
user may read 301 GiB as consumed and conclude ~236 GiB remain, when 301 GiB is what is free. The
label makes this worse rather than better — "Space Available" correctly describes the first
figure, so a reader who trusts the label has no reason to suspect the second figure is a
different quantity, and the most available reading of the pair is a fraction of one thing.

In an **install** dialog, whose entire job is answering "will this game fit?", that is the
misreading that matters.

### Correction to an earlier claim, recorded so it is not re-derived

An initial read of this defect asserted the line carried **no label at all**. That was wrong —
it came from reading the backend string without opening either render site. Both dialogs do label
it, via the same existing key. Do not plan against the "no label" version.

### Both stores are affected, and identically

Not Steam-only. Both call sites render the same shared `message` under the same key
`install.disk-space-left` (`public/locales/en/gamepage.json:268` → "Space Available"):

- `SteamDialog/index.tsx:496-501` — the `afterSelect` slot on the library picker.
- `DownloadDialog/index.tsx:694-715` — the Epic/GOG/Amazon path.

The Steam site was **observed live**. The `DownloadDialog` site is **read from source only** and
must not be recorded as observed.

`DownloadDialog` is worth studying before changing anything, because it is internally
inconsistent in an instructive way: immediately after the unlabelled pair it appends a properly
labelled second stat — `- After Install: <spaceLeftAfter>` (`install.space-after-install`, line
:705-713). So the same line already demonstrates the labelling pattern the first half is missing.

## Solution

Not prescriptive — decide at plan time.

The honest fix is to label both quantities, or to drop the total if it is not carrying its
weight. Options worth weighing:

1. **Label both** — e.g. "301.44 GiB free of 537.15 GiB". Needs a new interpolated i18n key; do
   not concatenate fragments, since word order varies by language.
2. **Show only free space** — the label is already correct for that, and it is the only figure an
   install decision needs. Smallest change; check whether the total is relied on elsewhere first.

**Format the string in the frontend, not the backend.** Building the display string in
`shellFilesFlowRegistration.ts` is part of the problem: the sidecar has no access to the
translation catalogue, so any label added there would be untranslatable English.
`DiskSpaceData` (`src/common/types.ts:808`) **already carries `free` and `diskSize` as separate
numeric fields** alongside `message`, so the frontend can format and translate this itself with
no new backend data. Consider deprecating `message` rather than relabelling it — but check every
consumer first, since `DownloadDialog` also derives `spaceLeftAfter` from the numeric fields and
may already be the model to follow.

Respect the repo's i18n gates (`lint-translations`, `i18n-churn-guard`) and reuse
`install.disk-space-left` if a chosen approach still fits it.

### Severity reasoning

Deliberately `minor`, not `major`. The figures are correct, no measurement was contaminated, and
`38-S08` row 4 **passes** regardless — that item asks only whether the line is present. The cost
is a bounded readability failure. Do not inflate it for having been found during a UAT sitting.

### Cross-reference

Downstream of quick `260923-o2s`, which fixed `isWritable_windows` and thereby made this line
render on Windows for the first time. It was previously suppressed there entirely (`validPath`
false), which is why the ambiguity was never observed before: **the fix did not create this
defect, it revealed it.** Recorded as an incidental finding under "Sitting 2" in
`.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md`.
