---
quick_id: 260823-t8i
slug: run-direction-a-of-the-guard-proof
date: 2026-08-23
status: complete
type: verification
verdict: PASS 4/4
commits:
  - 639b3e5b5
files_touched:
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-GUARD-PROOF.md
code_changes: none
---

# Quick task 260823-t8i — Direction A, PASS 4/4

Injected the F-34.9-01 defect into gogdl's `Python.framework`, ran `pnpm dist:mac`, proved the
guard aborts the chain before `electron-builder`, restored. **No ledger item required this** —
14/15/16 were already closed. It is a fresh exercise of the contract under AMENDMENT v2.

## The strongest evidence was unplanned

The guard's per-runner structural table, log lines 469–471, is an **in-run negative control**:

```
Frameworks (structural integrity ENFORCED, F-34.9-01):
  legendary: Versions/Current symlink=true  target=3.14
  gogdl:     Versions/Current symlink=false target=n/a
  nile:      Versions/Current symlink=true  target=3.14
```

Only `gogdl` — the runner actually injected — is flagged; the other two pass in the same run. **The
guard discriminates rather than failing everything.** A rejection count alone could not have shown
that, and the contract's PASS bar doesn't ask for it.

## Scoring

| Criterion | Result |
|---|---|
| (a) exit non-zero | `1`, bytes `310a` via `xxd` |
| (b) guard aborted it | F-34.9-01 literal ×1, `gogdl: framework .* is malformed` ×2 (lines 474–475) |
| (c) no packaging | `electron-builder version=` 0, `building target=` 0 |
| (d) **v2 §A1** | `verify:runner-bundle` (line 183) is the last of four lifecycle banners |

Line 475 is **WR-02's branch** (34.9-19's absent/wrong-type stub closure) firing from the real build
command rather than a unit test.

(d) was the **first exercise of the criterion written this morning**, and it did work the retired
(d) structurally could not: it identifies *which* step ended the chain, where an empty-`dist/` check
proves nothing because `clean:dist-mac` guarantees emptiness regardless.

## Restore — three independent verifications

`public/bin/**` is git-ignored, so git is structurally blind to the whole operation and cannot be
used as evidence.

1. Full framework manifest (every file's sha256, every symlink's target) `diff`-identical to the
   pre-injection baseline — digest `c7549b9ab414fb00…` before and after.
2. Whole-tree `arm64/darwin` symlink manifest `573f5ed313c943eb…` — matching the snapshot taken
   **before Direction B**, so unchanged across both directions.
3. Per-runner counts 109 / 67 / 108 with `Versions/Current -> 3.14` in all three.

The restored framework carries its original `Aug 7 09:57` timestamps, confirming it is the moved
original and not a re-creation.

## Safeguard taken beyond the contract

§3's `mv`-aside puts the **only** copy of the original in `node_modules/.cache/` — the directory
`pnpm install` clears, and a plain `git checkout` was observed firing exactly that earlier today.
The darwin onedir archives **cannot be re-downloaded** (`download-helper-binaries` throws on the six
`PENDING-CI-PUBLISH` sentinels), so losing that copy would have been unrecoverable.

A tarball was taken **outside** `node_modules`, archived without `-h` so symlinks stayed symlinks,
and **test-extracted and diffed against the live tree before any mutation began**. It was not
needed. Recorded in the run record as advice: a backup that has never been restored is a hope, not
a backup.

## Two honest negatives

**1. The 2026-08-12 Deviation 5 did not reproduce.** It predicted a nested `Python.framework` and
told future readers to expect 4 rejections. There was no nesting and 2 rejections. This framework
holds exactly three symlinks — `Python`, `Resources`, `Versions/Current` — none resolving to the
framework root or an ancestor, so `cp -RL` has nothing to recurse into; and the tree is unchanged
since `Aug 7 09:57`, so the shape did not drift between runs. Its "2 wordings" half **is**
confirmed. Deviation 5 received the **sole edit** made to the 2026-08-12 record — an appended
annotation, adding no claim and changing no verdict — because that sentence instructs future
readers to expect something now known false.

**2. Ordering deviation.** The contract runs **A → restore → B**; this session ran **B → A**. No
build followed A's restore, so the restore is verified *structurally* (three manifest audits) and
**not** functionally re-confirmed by a subsequent green build, which is part of why the contract
orders it that way. **The two 2026-08-23 records are therefore not a single full-contract
execution**, and §6's "both directions must pass" should not be read as satisfied by concatenating
them. Both directions did pass, on the same tree and inputs, hours apart — that is the claim, and
nothing more.

Closing that gap would take a ~3-minute Direction B re-run after the restore. Not done: outside
what was asked.

## What this run did not prove

The x64 leg, CI, `release:mac` itself, Tauri-packaged resolution, real-certificate signing,
notarization, cold-spawn ratios — all unchanged. **Guard A's own failing direction at build level**
also remains unproven: both runs show Guard A at `skipped 0, rejected 0`, because the injected
defect is a framework already dereferenced in `public/` before the build starts, not a symlink
failing to restore during `electron-vite build`.
