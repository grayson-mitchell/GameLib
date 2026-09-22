---
created: 2026-09-06T00:00:00.000Z
title: "runTs.cjs win32 esbuild spawn fix (260906-hq8) is shipped but unverified on Windows"
area: build
severity: major
platform: windows
ready: blocked
status: completed
resolved: 2026-09-22
resolved_by: quick-260922-toc
found_by: "Quick task 260906-hq8"
source: ".planning/quick/260906-hq8-fix-runts-cjs-esbuild-spawn-on-windows-b/260906-hq8-PLAN.md"
files:
  - meta/runTs.cjs
  - meta/__tests__/runTs.test.ts
---

## Claim

The win32 esbuild spawn fix in `meta/runTs.cjs` (quick task 260906-hq8) is
**shipped but unverified on Windows**. The failure this fixes — every
`node meta/runTs.cjs ...` script (23 of them, including
`build:decompress-worker-dev`, which `pnpm tauri:dev` runs) failing with libuv
errno `-4058` on a Windows box — was **reported, never reproduced by the
author**. There was no Windows machine available to confirm on. Everything
below was measured on macOS only.

## Confirming command to run on the Windows box

```
node -e "const p=require.resolve('esbuild/bin/esbuild');console.log(JSON.stringify(require('fs').readFileSync(p).subarray(0,20).toString('utf8')))"
```

Expected output if the diagnosis is correct: a leading `#!/usr/bin/env node`.

## Second confirming step

`pnpm download-helper-binaries` should exit `0` on that box after this
change ships (this is the script that was reportedly failing with `4058`).

## Falsifiers (from the plan's `<diagnosis_status>`)

- **F1** — on the Windows box, print the first bytes of the resolved esbuild
  bin (the command above). If it does **not** start with a `#!` shebang, the
  diagnosis is wrong for that machine — the installer DID hardlink-swap it
  there, and win32 needs a different explanation for the original failure.
- **F2** — after this fix ships, `pnpm download-helper-binaries` on that box
  still exits `4058`. If so, the 4058 came from elsewhere, or from more than
  one place (e.g. a different `spawn` inside
  `meta/downloadHelperBinaries.ts` itself, `node` not resolvable in the shell
  pnpm used, Defender/AV blocking the spawned image, or a partially
  materialised `node_modules/esbuild`).
- **F3** — if the developer can capture the raw error object, its
  `path`/`syscall` fields name something other than the esbuild bin. If so,
  the diagnosis targeted the wrong spawn site entirely.

## macOS measurements that DID confirm the mechanism (not assumed)

- **M1** — `grep -n 'maybeOptimizePackage\|win32' node_modules/esbuild/install.js`
  (esbuild 0.25.12): line 223 defines `maybeOptimizePackage(binPath)`; line
  225 guards the hardlink swap with
  `if (os2.platform() !== "win32" && !isYarn() && !isWASM)`.
- **M2** — `npm pack esbuild@0.25.12`, then extract `package/bin/esbuild`:
  9351 bytes, begins `#!/usr/bin/env node` then `"use strict";` — the
  *published* `bin/esbuild` is a JS shim.
- **M3** — first 16 bytes of the installed `node_modules/esbuild/bin/esbuild`
  on the authoring macOS host: `cffaedfe0c000001...` — Mach-O 64-bit LE. The
  hardlink swap **did** run on that host, confirming the non-win32 branch
  must spawn the binary directly and must NOT route it through
  `process.execPath`.

M1 + M2 together establish the mechanism without a Windows box: the
installer skips the hardlink on win32, so the shipped shebang JS shim
survives there and `CreateProcess` cannot execute it. M3 establishes the
converse for the non-win32 branch. None of the three establish that this
mechanism is what the *reporting* machine actually hit — that requires the
Windows box and is exactly what this todo tracks.

## Scope note

This fixes **one spawn** in `meta/runTs.cjs` — do not read this as "Windows
support" being addressed generally. Two other Windows-relevant surfaces in
the same file were already correct before this change and were not touched:
the `fs.symlinkSync(..., 'junction')` call (junctions need no admin rights,
unlike symlinks) and the second spawn in the same file, which already used
`process.execPath` for running the compiled output under `node`.

## Resolution (2026-09-22, quick 260922-toc)

**Host:** Windows 11 10.0.26200, Git Bash (`C:\Program Files\Git`), node v24.19.0.

**Decision rule applied:** CONFIRMED iff negative control REPRODUCED (-4058/ENOENT, exit 1) AND
positive run PASSED AND the plain `pnpm download-helper-binaries` runTs phase passed. All three
held, so this todo is closed.

**Commands (from repo root, Git Bash):**

```
git show 8ed7b8ccd^:meta/runTs.cjs > meta/runTs.prefix-260922-toc.cjs   # trap 'rm -f ...' EXIT installed first
node meta/runTs.prefix-260922-toc.cjs --bundle --platform=node --target=node22 meta/buildDecompressWorkerDev.ts
# (temp file deleted by trap, never staged)
pnpm build:decompress-worker-dev
pnpm download-helper-binaries
```

**One-commit isolation:** `git log --oneline 8ed7b8ccd^..HEAD -- meta/runTs.cjs` lists exactly one
commit, `8ed7b8ccd`. The negative control (`8ed7b8ccd^:meta/runTs.cjs`, copied into `meta/` so both
`require.resolve('esbuild/bin/esbuild')` and the tmpdir junction path resolve the same way) and the
positive run (current `meta/runTs.cjs`) share identical argv; the runTs file was the only variable.

**Verdict table:**

| Falsifier | Result |
|---|---|
| F1 | Orchestrator-measured this session: `require.resolve('esbuild/bin/esbuild')` -> `C:\Users\grays\Projects\GameLib\node_modules\esbuild\bin\esbuild`, first bytes `"#!/usr/bin/env node\n"`. Re-captured in Task 1 Step 0: identical result (`"#!/usr/bin/env node\n"`). Diagnosis precondition holds. |
| F2 | Plain `pnpm download-helper-binaries`: exit 0, printed `Nothing to download, binaries are up-to-date` — no `failed to launch esbuild`, no -4058. Tar was NOT exercised by this run (public/bin/.release_tags already matched pinned tags, so the darwin-onedir extraction branch was never reached); this is expected per plan, not a gap. |
| F3 | Negative-control error object: `errno: -4058`, `code: 'ENOENT'`, `syscall: 'spawn C:\Users\grays\Projects\GameLib\node_modules\esbuild\bin\esbuild'`, `path: 'C:\Users\grays\Projects\GameLib\node_modules\esbuild\bin\esbuild'`. Both fields name the resolved esbuild bin exactly — F3 is NOT falsified. |

**Negative/positive pair:**
- Negative (pre-fix `8ed7b8ccd^:meta/runTs.cjs`, `build:decompress-worker-dev` argv): exit 1,
  `meta/runTs.cjs: failed to launch esbuild: Error: spawn ...\esbuild ENOENT` with the errno/syscall/path
  above. REPRODUCED.
- Positive (current `meta/runTs.cjs`, same argv, via `pnpm build:decompress-worker-dev`): exit 0,
  log contains `[build:decompress-worker-dev] esbuild-aliased worker bundle -> build\main\decompressWorker.js`,
  no `failed to launch esbuild`. PASS.

**Tar note:** the forced download-helper-binaries run needed to exercise the tar extraction phase
was intentionally NOT run as part of this todo's closure (out of scope for the runTs verdict per
plan). Its outcome, when run, is recorded in the tar todo
(`2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md`), not here.

**Two-profile rule:** does not apply. `meta/runTs.cjs` and `meta/buildDecompressWorkerDev.ts` are
build scripts — they read no HOME/APPDATA/XDG profile and create no session. No fake HOME was used
for any command in this verification.

**Scope (repeated from above):** this closes verification of **one spawn** in `meta/runTs.cjs`. It
is not a claim that Windows support is otherwise complete; the two untouched surfaces named in the
Scope note above remain unaffected and unverified-by-this-task.
