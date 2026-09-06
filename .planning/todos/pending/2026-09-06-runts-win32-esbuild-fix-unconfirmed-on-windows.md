---
created: 2026-09-06T00:00:00.000Z
title: "runTs.cjs win32 esbuild spawn fix (260906-hq8) is shipped but unverified on Windows"
area: build
severity: major
needs: human-verification-on-windows
status: pending
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
