---
quick_id: 260916-9vh
date: 2026-09-16
status: complete
description: Gate the boot-time DXMT fetch on there being an installed Wine-Staging-macOS to update — cold boot 27.3s -> 1.3s, without touching the sidecar exit contract
source_todo: .planning/todos/pending/2026-09-13-cold-sidecar-boot-holds-pooled-keepalive-tls-sockets-for-26s-against-a-30s-ci-budget.md
commit: 202169de1
files_modified:
  - src/backend/tools/dxmt.ts
  - src/backend/tools/__tests__/dxmtBootFetch.test.ts
  - .planning/todos/pending/2026-09-13-cold-sidecar-boot-holds-pooled-keepalive-tls-sockets-for-26s-against-a-30s-ci-budget.md
---

# Quick 260916-9vh — the cold-boot download is gone, and it was never the file everyone thought

## Result

| tree | runs | elapsed | margin vs `STARTUP_TIMEOUT_MS=30_000` |
| ---- | ---- | ------- | ------------------------------------- |
| before (`396f400fd`) | 2 | 27.26s, 28.00s | +2.74s, +2.00s |
| after (`202169de1`)  | 2 | **1.34s, 1.28s** | **+28.66s, +28.72s** |

`ready=YES`, `exit=0`, `stderrBytes=0`, `uncaughtOnStderr=NO` on all four runs.

## What was actually wrong

`tools/dxmt.ts`'s `releasesInfoReady` listener `await`ed `DXMT.getLatest()` **before**
computing the installed-wine census that decides whether anything needs the files. On a
cold profile that census is empty, so boot downloaded a DXMT tarball and copied it into
**zero** wine installs. The fix hoists the census above the fetch and returns early.

The download is the entire cold-boot cost:

```
init() Block B -> fetchLastestReleases() -> 'releasesInfoReady'
  -> tools/dxmt.ts [Mac-only] -> DXMT.getLatest() -> installOrUpdateTool
    -> downloadFile (backend/utils.ts:1489) -> EasyDl { connections: 5 }
       on https.globalAgent, no timeout
```

## The finding that mattered most: the previous diagnosis named the wrong file

`quick-260913-m9c` had corrected the original filing and attributed the cost to a bare
`axios.get` at `src/backend/utils/inet/downloader/index.ts:70`. **That call site never
fires at boot** — it is the winetricks path, and its host is `raw.githubusercontent.com`.
Anyone who had shipped the todo's prescribed "add a timeout there" would have changed
nothing and closed the todo green.

Settled by a request-level probe (`meta/coldBootTiming.ts --preload`, wrapping
`https.request`/`http.request`) rather than by inference from host names:

```
 748ms REQ#9  github.com/3Shain/dxmt/releases/download/v0.80/dxmt-v0.80-builtin.tar.gz
1168ms REQ#13..#17  release-assets.githubusercontent.com  x5   agent=https.globalAgent
1201ms   RES#13 status=206  (#14-#17 all 206)
27103ms  END#22   <- last chunk;  process exit at 27.26s
```

**The "five in-flight requests" are not five assets.** They are `206 Partial Content`
range requests — EasyDl's `connections: 5` chunk workers pulling ONE file. Corroboration:
the `axiosClient` free socket to `release-assets` that m9c's agent census saw is the
`axiosClient.head(url)` size probe at `utils.ts:1502`.

This is the **second** time this todo's prescribed remedy pointed at the wrong object.

## The approach was reversed mid-task, on a written fence

The task was first scoped as the todo's option 3 — an `'end'` handler on
`startRpcServer()` calling `callAllAbortControllers()`. That is **explicitly fenced** in
three places (the completed exit-contract todo's "Not in scope", `260913-ty4-PLAN.md`, and
`CLAUDE.md`: *"adding one misunderstands the mechanism rather than hardening it"*). The
fence was found by reading `.planning/quick/260913-uez-*` before writing any plan.

`CLAUDE.md` admits exactly two remedies for the in-flight class — **bounded, or not issued
at boot**. This shipped the second, and touches the exit contract not at all.

Also refuted while re-scoping: the todo's **option 1** ("do not block `init()` on boot-time
downloads") rests on a false premise. `init()` already does not block — `READY_SENTINEL`
is written before the download begins, and `ready=YES` was measured on every run while
exit sat at 27s. The coupling is **exit-time only**.

## Verification

| check | result |
| ----- | ------ |
| `jest --testPathPattern dxmtBootFetch` | **3/3 pass** |
| RED spot-check against pre-fix source | **2 failed, 1 passed** — the two "does NOT fetch" cases fail, "DOES fetch" passes |
| `tsc --noEmit` | exit 0 |
| `prettier --check` (both files) | clean |
| `pnpm lint` | exit 0, **638** warnings, `production: PASS | tests: PASS` |
| cold-boot re-measure | 1.34s / 1.28s (from 27.26s / 28.00s) |
| full backend suite | 218 suites / 4862 tests pass |

**The RED spot-check is the load-bearing one.** A regression test that passes against
unfixed source proves nothing; this one fails in exactly the right two places. Performed by
`git show HEAD:<file>` + `cp` restore — deliberately **not** `git stash` (strands a
concurrent session) and **not** `git checkout --` (fires the post-checkout hook).

## Two instrument failures caught mid-run, both worth copying

1. **`jest --selectProjects Backend <path>` ignored the path filter** and ran all 218
   suites, reporting "Ran all test suites". The green result said nothing about my file.
   `--testPathPattern` is what actually scopes it — confirmed by seeing the suite named
   with its own 3-test count.
2. **`LINT_EXIT=${PIPESTATUS[0]}` came back EMPTY twice**, so two gate results were
   initially unknown rather than passing. Re-run writing to a file and reading `$?`
   directly.

## Lint ceiling: fixed the warning, did not bump the ledger

The new test file added exactly **1** `unbound-method` warning (reading `.get` off the
mocked store), breaching `TESTS_CEILING = 638` — which `lintScoped.cjs:47` states carries
no padding. Fixed with a targeted `eslint-disable-next-line` naming the real rule, so the
ceiling stayed at 638 rather than being ratcheted to 639.

Prettier then reformatted the file, which is the documented way a rewrap can relocate a
disable comment off its target. Re-checked afterwards: the disable is still adjacent
(line 89 -> line 90), eslint on the file is clean, and prettier now passes.

## Residual, deliberately NOT fixed

**A warm macOS profile with `Wine-Staging-macOS` installed still takes the full path** —
an unbounded, un-timed-out EasyDl fetch over five connections that still delays sidecar
exit. The todo stays **open** and `ready: human` on exactly that, because bounding it is a
product call: `downloadFile` is shared with game installs and wine/proton downloads, so a
blanket timeout there would bound multi-GB game downloads too. Any timeout must be scoped
to the caller, not the primitive.

Severity re-scoped `major` -> `medium`: `.github/workflows/test.yml:11` runs
`ubuntu-latest` and the listener returns at `if (!isMac)` before issuing anything, so the
CI budget was very likely never at risk. Recorded as **REASONED, not measured** — no Linux
cold boot was run.
