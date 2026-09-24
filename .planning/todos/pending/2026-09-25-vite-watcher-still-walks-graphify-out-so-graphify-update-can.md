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
