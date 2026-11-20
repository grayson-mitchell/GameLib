---
quick_id: 260823-suw
slug: hardware-run-discharge-f-34-9-21-03-args
date: 2026-08-23
description: "Hardware run of 34.9-GUARD-PROOF.md Direction B to discharge F-34.9-21-03 / ledger item 16"
type: verification
files_touched:
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-GUARD-PROOF.md
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/deferred-items.md
---

# Quick task 260823-suw — hardware run to discharge item 16

Item 16 was the one remaining 34.9 item that **could not be closed by editing a document**. Its
precondition: a real `dist:mac`/`release:mac` run with the args appended, asserting the resulting
electron-builder invocation honored them.

## Scope: Direction B only

Direction A is **deliberately not run**. Item 16 concerns args passthrough; Direction A would
require re-injecting a dereferenced `Python.framework` into the vendored tree — real risk to a tree
this phase depends on, for no benefit to this discharge. The failing direction's evidence remains
the 2026-08-12 record, and the run record says so explicitly rather than letting a reader infer
that a fresh full-contract PASS occurred.

## Task 1 — preconditions, recorded before acting

- no `target/debug/gamelib-shell` process (the 2026-08-12 run hit exactly this and had to STOP)
- no `electron`/`electron-builder`/`vite` process
- inspect `dist/` before letting `clean:dist-mac` empty it — confirm nothing of value is lost
- `rm -rf build/bin` (§5 step 1) so a stale good tree cannot mask the measurement
- snapshot the vendored trees: per-runner file counts, `readlink` on each
  `Python.framework/Versions/Current`, and a sha256 over the whole arm64/darwin symlink manifest
- record `BUILD_START` in UTC

## Task 2 — run §5 step 2 exactly as written

```
pnpm dist:mac --arm64 --publish=never > <SESSION_DIR>/direction-b.log 2>&1; echo $? > <SESSION_DIR>/direction-b.exit
```

Per AMENDMENT v2 §A3 the argument string is **normative** — this task must not paraphrase it, which
is the exact failure that created item 16. Per §A2 the capture is the redirect form with a
per-block filename, not `| tee` + `${PIPESTATUS[0]}`.

## Task 3 — score all four PASS-bar criteria

1. **(a)** exit `0`, read from the exit file **as bytes via `xxd`** — a 1-byte file is the
   capture-failure signature and reading the value alone cannot tell the two apart.
2. **(b)** guard PASS line present at a *lower line number* than the first
   `electron-builder  version=` — the ordering proof it runs pre-packaging.
3. **(c)** the discharge. Record the arm64 `target=` lines verbatim; require ≥1 arm64,
   **0 x64** (proving `--arm64` narrowed the build rather than merely being accepted), and
   `grep -c Uploading` = 0. **Do not grep bare `publish`** — the invocation line echoes
   `--publish=never` and self-matches, the trap 34.9-20 caught at authoring time.
4. **(d)** dmg AND zip matching `GameLib-*-macOS-arm64.*` with mtime **strictly after**
   `BUILD_START` — "a dmg exists" is never the criterion (F-34.9-02).

Plus a non-contract integrity check: re-compare vendored trees and symlink manifest against the
pre-run snapshot. Given that a `git checkout` fired the post-checkout hook earlier today, a build
touching this tree gets verified rather than trusted.

## Task 4 — record and close

Append a **new dated RUN RECORD** to `34.9-GUARD-PROOF.md`. Do **not** edit the 2026-08-12 record.
Un-strike AMENDMENT v2 §A3's "item 16 stays OPEN" line — it was written hours earlier and is now
stale — while keeping the precedence rule binding. Close ledger item 16.

## Acceptance

- [ ] Direction B PASS 4/4 with every criterion evidenced verbatim
- [ ] `F-34.9-21-03` named as discharged in both the run record and the ledger
- [ ] Vendored trees provably unchanged (manifest sha256 match)
- [ ] 2026-08-12 RUN RECORD unedited
- [ ] Run record states plainly what this run did NOT prove (Direction A, x64, CI, `release:mac`)
- [ ] Sweep 24/24 exit 0; `pnpm planning-gates` 7/7

## Out of scope

The x64 leg. This run passes `--arm64`, so guard arch and build arch agree and the item-18 exposure
does not open. Any corroboration of item 18's mechanism must be labelled as mechanism-only, never
as an observation of the exposure.
