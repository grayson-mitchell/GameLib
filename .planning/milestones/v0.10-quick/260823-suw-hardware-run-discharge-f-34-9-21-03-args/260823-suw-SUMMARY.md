---
quick_id: 260823-suw
slug: hardware-run-discharge-f-34-9-21-03-args
date: 2026-08-23
status: complete
type: verification
commits:
  - e9b0efbcb
verdict: PASS 4/4
discharged: [F-34.9-21-03]
items_closed: [16]
files_touched:
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-GUARD-PROOF.md
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/deferred-items.md
code_changes: none
---

# Quick task 260823-suw — item 16 discharged on real hardware

The last 34.9 ledger item that **could not be closed by editing a document**. `pnpm dist:mac
--arm64 --publish=never` ran on macOS arm64 exactly as `34.9-GUARD-PROOF.md` §5 step 2 writes it.

**Verdict: PASS 4/4. `F-34.9-21-03` discharged. Item 16 closed.**

Running it *as written* is the whole point — paraphrasing that invocation is precisely what created
this item on 2026-08-12, and AMENDMENT v2 §A3 (written hours earlier today) makes the argument
string normative for exactly this reason.

## The decisive evidence

Not the `target=` lines — the **resolved script string at log line 3**, which shows the passthrough
mechanism directly rather than by inference:

```
> export CSC_IDENTITY_AUTO_DISCOVERY=false && pnpm clean:dist-mac && pnpm build-steam-bridge && electron-vite build && pnpm verify:runner-bundle build --arch=arm64 && electron-builder --mac --arm64 --publish=never
```

pnpm appended both args to the **end** of the resolved chain with no `--` separator, so they landed
on `electron-builder` while `verify:runner-bundle` kept its own hardcoded `--arch=arm64`.

## Scoring

| Criterion | Result |
|---|---|
| (a) exit code | `0`, read as bytes `300a` via `xxd` — per §A2, since a 1-byte file is the capture-failure signature |
| (b) guard pre-packaging | PASS line 465 < first `electron-builder version=` line 466 |
| (c) **args honored** | 2 arm64 `target=` lines; **0** x64; **0** `Uploading` |
| (d) artifacts | dmg 08:49:25Z, zip 08:49:53Z — both strictly after `BUILD_START` 08:47:04Z |

On (c): **0 x64 lines is the load-bearing half.** ≥1 arm64 line only shows `--arm64` was accepted;
zero x64 lines shows it actually *narrowed* the build. And bare `publish` was deliberately not
grepped — the invocation line echoes `--publish=never` and self-matches on a correct run, the trap
34.9-20 caught at authoring time.

Wall time `BUILD_START` → last artifact: **2m49s**. The 220MB dmg and 211MB zip are in `dist/`.

## Integrity

Vendored trees post-run: legendary 109 files, gogdl 67, nile 108 — unchanged. `Versions/Current`
still a symlink to `3.14` in all three. arm64/darwin symlink manifest sha256 **identical** to the
pre-run snapshot (`573f5ed3…`). Given that a `git checkout` fired the post-checkout hook into
`download-helper-binaries` earlier today, this was verified rather than trusted.

## Scope — stated plainly because a reader could otherwise over-read this

**Direction B only.** Direction A was deliberately not re-run: item 16 is about args passthrough,
and Direction A would require re-injecting a dereferenced `Python.framework` into the vendored tree
for no benefit to this discharge. **The failing direction's evidence remains solely the 2026-08-12
record.** This is not a fresh full-contract PASS, and the run record says so in its own "What this
run did NOT prove" section alongside the x64 leg, CI, `release:mac` itself, and Guard A's failing
direction.

## Unplanned: corroboration for item 18

Log line 3 directly confirms item 18 detail 1's **mechanism** — the guard's `--arch=arm64` is fixed
in the script body while the builder's arches come from the caller. Useful for Phase 34.16, which
inherits that item.

**Labelled as mechanism-only, not an observation of the exposure.** This run passed `--arm64`, so
guard arch and build arch agreed and no gap opened. The x64 case, where they diverge, remains
unexercised — exactly as items 1, 12, 13 and 18 all state.

## Artifacts left behind

`dist/` now holds ~431MB (dmg + zip + blockmaps + `latest-mac.yml` + `mac-arm64/`). Gitignored, and
`clean:dist-mac` clears it at the start of the next build — left in place rather than deleted, in
case the evidence is wanted.

## 34.9 ledger state after this task

**Closed:** 11, 14, 15, **16**, 19, 21, 22, 23, 24 — every item that this machine can close is now
closed.

**Open, all blocked on something external:** 1/2/3/12/13/18 (Phase 34.16, blocked on the
default-branch push), 5 (first packaged-Tauri plan), 7 (Phase 35), 9 (a future security pass), 17
(likely moot, unverified), and **8 and 20 (genuinely unowned — a decision is still owed)**. Items
4/10 and 6 remain deliberately fenced out.
