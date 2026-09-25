---
created: 2026-09-25T00:10:00+13:00
title: Vite dev-server watcher still walks graphify-out, so `graphify update` can EBUSY-kill it
area: tooling
files:
  - vite.config.ts
  - .gitignore
  - .planning/todos/completed/2026-09-24-tauri-dev-on-windows-crashes-on-vite-ebusy-watching-src-tauri-target.md
severity: medium
platform: windows
ready: live-gate
found_by: "Observed live on the operator's Windows 11 machine, 2026-09-23/24, during quick 260923-qe5's Task 4 live gate"
---

# Same EBUSY class as `260924-vat`, on a path that fix deliberately does not cover

## RESOLVED — 2026-09-25, quick task `260925-re8` (`vite.config.ts` now ignores `**/graphify-out/**`)

**Outcome: RED, but not by the arm this file prescribed.** Read
`.planning/quick/260925-re8-vite-watch-ignore-graphify-out/260925-re8-GATE.md`
for the full record. In short:

The `pnpm tauri:dev` + `graphify update .` arm was **not run**. A live dev server
(PID 14020, started 18:41:49) was already up with the Tauri window attached, and
`graphify update .` rewrites the very directory that server was watching — so the
destructive arm endangered the operator's session no matter which vite process was
nominally under test, and `strictPort: true` blocked a second server anyway.

Instead the watcher was asked directly, read-only, via vite's Node API. On the
**post-`c9775edac`** config a real dev server held **3485 watched entries across 8
dirs under `graphify-out/`**, measured against a same-snapshot control of
`src-tauri/target = 0` that proves the ignore mechanism works and the probe can
tell covered from uncovered. After the fix: `graphify-out` → **0**, control
`src/` dirs unchanged at 383.

**The suspicion recorded below was correct on both counts it claimed.** Claim 1
(`graphify-out/` not in `server.watch.ignored`) and claim 2 (the trigger is an
instructed action) both held. The file's caution about not recording the old crash
as a post-fix reproduction was also right, and is preserved: **EBUSY was never
re-observed on the fixed config.** What closed the gap was showing that the
post-fix config still *watches* the path; the write→EBUSY link was already
evidenced by the original stack firing at `_addToNodeFs` on
`graphify-out/2026-09-23/graph.json`.

**`build/` decided: DECLINED**, and re-filed rather than dropped —
`build/` (169 watched dirs) and `public/bin` are measurably watched but have never
been observed failing, so they stay out of an array whose every entry is a measured
failure. See
`.planning/todos/pending/2026-09-25-vite-dev-watcher-also-walks-build-and-public-bin-both-written-while-serving.md`.
That todo also records the non-obvious reason `build/` is watched at all: vite
auto-ignores its outDir only when `emptyOutDir` is true, and this config sets it
false.

---

## Read this before anything else — the claim is deliberately limited

**This is NOT a reproduction against the current config, and must not be recorded as one.**

The crash below was real and observed, but the dev server that died had been started at **18:24**,
whereas `260924-vat`'s fix (`c9775edac`) landed at **2026-09-24 22:35:21** — roughly three minutes
*before* the crash at ~22:38. That server was therefore running the **pre-fix** config.

What IS established, by reading the current tree:

1. `graphify-out/` is still not in `server.watch.ignored`.
2. The write that triggers the failure is a routine action CLAUDE.md actively instructs.

What is NOT established: that a *freshly started* dev server on the fixed config still dies this
way. **Reproduce it before believing it is still live** — start `pnpm tauri:dev`, then run
`graphify update .` and watch for the FSWatcher error. That is why this is `ready: live-gate` and
not `ready: code`, even though the candidate fix is a one-line edit.

## What was observed, verbatim

```
Error: EBUSY: resource busy or locked, watch 'C:\Users\grays\Projects\GameLib\graphify-out\2026-09-23\graph.json'
    at FSWatcher.<computed> (node:internal/fs/watchers:323:19)
    at createFsWatchInstance (vite/dist/node/chunks/dep-DBxKXgDP.js:22195:17)
  errno: -4082, syscall: 'watch', code: 'EBUSY'
Emitted 'error' event on FSWatcher instance
       Error The "beforeDevCommand" terminated with a non-zero status code.
```

`graphify-out/2026-09-23/graph.json` had just been rewritten at 22:38:11, at **57,273,080 bytes**.

### The failure mode is worse than "the dev server died"

The vite dev server exited, but **the Tauri window and its sidecar stayed alive.** The app kept
running off its last-served bundle with no HMR. The window looks perfectly healthy while frontend
edits silently stop arriving — which is a far more confusing state than a clean crash, because
nothing on screen indicates the dev loop is gone. It was only noticed here because a background
task reported the non-zero exit.

## Why it is likely still live — verify against the file, don't take this on trust

`vite.config.ts` sets `root: '.'`, and its `server.watch.ignored` is exactly:

```js
watch: {
  ignored: ['**/src-tauri/target/**']
}
```

`graphify-out/` sits at the repo root and is not in that list. The in-situ comment records that
**Vite 6 appends this list to its own defaults** (`.git`, `node_modules`, `test-results`, cacheDir)
— `graphify-out` is not among those defaults either.

That comment also says, deliberately: *"Only target/ is ignored -- it is the only cargo output
under src-tauri -- do not widen this to src-tauri/\*\*"*. So the narrowness was a considered choice
for **that** path. It simply did not contemplate this one. This is not a criticism of `260924-vat`;
it is the second member of a defect class whose first member is fixed.

`graphify-out/` is gitignored at `.gitignore:63` — described there as *"large, regenerable via
`graphify update .`, never committed"*. So the dev server is watching tens of megabytes that the
repo itself treats as disposable build output.

**The trigger is instructed, not incidental.** CLAUDE.md's graphify section says "After modifying
code, run `graphify update .`". Anyone following the documented workflow with a dev server up will
hit this if it is still live. That is why this is `medium` and not `minor`.

## Solution

Not prescriptive — decide at plan time, after the live gate confirms the defect is still real.

The obvious candidate is adding `'**/graphify-out/**'` to the existing array. Weigh it against
ignoring gitignored paths wholesale, and **engage with the existing comment's reasoning rather than
overriding it silently** — naming the specific generated directory instead of widening a glob is a
considered position in this file, and the same instinct that kept `src-tauri/**` narrow applies
here.

Also worth deciding in the same breath: whether `build/` deserves the same treatment. It holds the
sidecar bundle, `bin/`, `locales/` and the SEA prep blob, all written by other build steps that can
run while the dev server is up, and `emptyOutDir: false` means it accumulates. Do not widen
`**/src-tauri/target/**`, and do not restate Vite's own defaults — the in-situ comment forbids both,
with reasons.

## Relationship to `260924-vat`

Sibling, not duplicate. `260924-vat` fixed `src-tauri/target` and its own outstanding follow-up is
about re-running **its** live gate (`cargo clean -p` then a cold `tauri:dev`, to confirm the
`gamelib_shell.exe` EBUSY is gone). That follow-up says nothing about `graphify-out`. Checked
before filing this.

Same error class, same mechanism (`fs.watch` on a file held open for writing), two different
generated directories. `platform: windows` because POSIX hosts do not fail this way.
