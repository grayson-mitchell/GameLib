---
phase: quick-260917-uik
plan: 01
subsystem: infra
tags: [macos, codesign, notarization, github-actions, tauri, mach-o]

requires:
  - phase: quick-260914-vbw
    provides: the sidecar's allow-jit entitlement, which the failed run vindicated and which this task must not disturb
provides:
  - magic-byte Mach-O detector that never uses a filename and never follows symlinks
  - deepest-first codesign driver with a --dry-run capture mode and a bounded TSA retry
  - sign:macos-resources package script routed through meta/runTs.cjs
  - macOS-only signing step in release-tauri.yml, placed before tauri-action
  - executed tests for the detector, the argv and the workflow step's position
affects: [macos release, notarization, release-tauri.yml, helper binaries]

tech-stack:
  added: []
  patterns:
    - 'Magic-byte binary detection with an nfat_arch plausibility bound to separate FAT_MAGIC from the Java class-file magic'
    - 'Single argv builder shared by the real and dry-run paths, so a captured dry run is evidence about the real run'
    - 'Parsed-YAML step-index assertions where a raw-text ordering grep would bind to a comment'

key-files:
  created:
    - meta/signMachOResources.ts
    - src/backend/__tests__/signMachOResources.test.ts
  modified:
    - package.json
    - .github/workflows/release-tauri.yml
    - src/backend/__tests__/releaseWorkflow.test.ts
    - .planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md

key-decisions:
  - 'Sign at the SOURCE path in the runner workspace, not inside the bundle and not via beforeBundleCommand'
  - 'Per-Mach-O-file signing, never a bundle seal -- the tree has no _CodeSignature anywhere and 12 symlinks whose copy behaviour is unverified'
  - 'Ship the helpers with NO entitlements; HELPER_ENTITLEMENTS is the empty, documented seam for an OBSERVED runtime crash'
  - 'Zero detected files is a hard failure; a partially-signed run is a hard failure'
  - 'The 253 count is a desk observation recorded here and pinned in no gate'

patterns-established:
  - 'JEST_WORKER_ID main-guard proved by EXECUTION (spawn both with and without it), not by a source grep'
  - 'GAP-A env-key assertions use startsWith on parsed keys because the forbidden name is a substring of a permitted one'

requirements-completed: []

duration: ~70min
completed: 2026-09-17
---

# Quick task 260917-uik: Sign every Mach-O under the macOS helper tree Summary

**A magic-byte Mach-O detector plus a deepest-first codesign driver, wired into `release-tauri.yml` as a macOS-only step before `tauri-action`, that signs all 253 helper binaries at their source path — WRITTEN AND DESK-TESTED, NOT VERIFIED.**

## THE HEADLINE, STATED FIRST

**This does not fix the notarization defect, and nothing in this task could establish that it does.**

A green local dry-run proves the detector picks the right files and the argv carries the right flags. A green CI build would prove the macOS leg did not crash. Neither is evidence that notarization returns `Accepted`, that the signature survives Tauri's copy into `Contents/Resources`, that the throwaway keychain coexists with Tauri's own keychain handling, or that any helper still runs under the hardened runtime with no entitlements.

The next action is a throwaway tag push followed by the six-step verification block reproduced in the todo — including **step 5**, the positive control on the survivor grep, and **step 6**, launching the app and actually invoking legendary, nile and gogdl once each. Step 6 is the only thing that tests the no-entitlements decision, and steps 1–5 do not cover it. A signed, notarized, never-launched helper is exactly the shape of a green check proving nothing.

## Performance

- **Duration:** ~70 min
- **Tasks:** 3 of 3
- **Commits:** 3
- **Files created:** 2 · **modified:** 4

## Commits

| Task | Commit      | What                                                         |
| ---- | ----------- | ------------------------------------------------------------ |
| 1    | `51e628659` | detector + codesign driver + `sign:macos-resources` + 33 tests |
| 2    | `0432e0ff4` | the macOS-only workflow step + 6 parsed-YAML tests            |
| 3    | `c758160d5` | honest todo status: `ready: live-gate`, both questions answered |

## What was built

### `meta/signMachOResources.ts`

- `isMachO(headerBytes)` — reads the first 4 bytes as a big-endian u32, which collapses all four thin-Mach-O spellings (`fe ed fa ce/cf`, `ce/cf fa ed fe`) into one constant set. Fat binaries (`ca fe ba be` / `be ba fe ca`) additionally require `0 < nfat_arch < 32`, because **`0xCAFEBABE` is also the Java class-file magic** and a `.class` file's next u32 reads as its major version (52 for Java 8). Without that bound a stray `.class` would be handed to codesign.
- `collectMachOFiles(dir)` — `lstat`-based walk that **skips symlinks** (never a `-follow` equivalent). Returns deepest-first, ties lexicographic.
- `codesignArgs(...)` — **one** builder used by both the real path and the dry-run print, so a captured dry run is evidence about the real run rather than about a parallel formatter. Emits `--force --sign <id> --options runtime --timestamp --keychain <kc> <file>`. Never `--deep`. Never `--entitlements` unless `HELPER_ENTITLEMENTS` maps the path.
- `HELPER_ENTITLEMENTS` — declared **empty** and shipping empty, with an in-source comment saying an entry requires an OBSERVED hardened-runtime crash.
- Bounded TSA retry (1s/2s/4s/8s) narrowed to timestamp-service stderr only; every other codesign failure fails immediately. After the budget the whole run fails.
- Zero detected files is a **hard failure**. `main()` guarded behind `!process.env.JEST_WORKER_ID`.

### `.github/workflows/release-tauri.yml`

One step, `Sign every Mach-O in the macOS helper tree before bundling`, at steps index **16** — strictly between `Prune non-frontend build intermediates` (15) and `tauri-apps/tauri-action@v1` (17). Gated `startsWith(matrix.platform, 'macos') && env.APPLE_SIGNING_IDENTITY != ''`, with **no `APPLE_*` `env:` map** (GAP-A). It creates a throwaway keychain, imports the P12, signs, and restores the keychain search list in a `trap` installed **before** the P12 is written (WR-01).

## Measurements taken today (2026-09-17, sha 34754dc9b → c758160d5)

| Measurement                                                  | Result                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| `find build/bin/arm64/darwin -type f \| xargs file \| grep -c Mach-O` | **253** of 277 regular files                        |
| Detector dry-run `grep -c '^codesign '`                       | **253**                                                     |
| `diff` of the two path lists as SETS                          | **identical**, not merely equinumerous                      |
| Non-Mach-O regular files in the tree                          | 24 — **0** selected by the detector                         |
| Symlinks in the tree                                          | 12 — all skipped                                            |
| `find build/bin/arm64/darwin -name _CodeSignature`            | **empty** — nothing in this tree is bundle-sealed           |

**The 253 is recorded here and pinned in NO gate.** It would rot the first time `downloadHelperBinaries` bumps a helper version. The committed tests run against a synthetic `mkdtemp` fixture.

## Desk gates

Baseline captured **before any edit**, at sha `34754dc9b` (named, per this repo's rule about unstated baselines): `codecheck` exit 0, `lint` exit 0 (both ceilings respected), `planning-gates` 11/11.

| Gate                              | Baseline (34754dc9b) | After (c758160d5)        |
| --------------------------------- | -------------------- | ------------------------- |
| `pnpm codecheck`                  | exit 0               | exit 0                    |
| `pnpm lint`                       | exit 0               | exit 0                    |
| `pnpm planning-gates`             | 11/11                | 11/11                     |
| `pnpm exec jest --selectProjects Backend` | not captured | 219 suites, 4904 passed, exit 0 |
| `pnpm exec jest --selectProjects Meta`    | not captured | 39 suites, 1075 passed, 1 skipped |
| `signMachOResources.test.ts`      | n/a                  | 33 passed                 |
| `releaseWorkflow.test.ts`         | 79 passed (implied)  | 85 passed (+6)            |
| `git diff --exit-code src-tauri/entitlements.plist` | clean | **clean — byte-identical to HEAD** |

**Honest gap:** I did not capture a pre-change baseline for the Backend and Meta jest projects. Both are fully green after the change (exit 0), so no comparison was needed — but if either had been red I would have had no same-sha baseline to compare against, and I am not claiming one. The backend run prints the pre-existing `A worker process has failed to exit gracefully` warning; the run still exits 0.

## Three things found by execution, not by reading

1. **`pnpm ... -- --dir X` forwards the bare `--` verbatim into argv.** The first `parseArgs` matched `--` as a flag and swallowed `--dir` as its value, dying with `--dir is required` against a command line that plainly contained it. Fixed (deviation Rule 1) and pinned by a regression test.
2. **The `JEST_WORKER_ID` main-guard fired on my own spawn test.** The first end-to-end spawn inherited jest's `JEST_WORKER_ID`, and the script exited 0 having done nothing. That is the guard working. It is now a **two-sided** pair of tests: with the variable → zero `codesign` lines; without it → five. The guard is a measured fact, not a comment.
3. **My first positive control passed for the wrong reason.** `head -n -1` is illegal on BSD `head`; the redirection still created an **empty** file, `diff` reported a difference, and the control printed PASS having proved nothing. Redone with `sed '$d'` plus an assertion that the control list holds 252 lines, not 0.

## Deviations from plan

### `[Rule 1 - Bug] The bare `--` separator`

Found during Task 1; described above. Files: `meta/signMachOResources.ts`, `src/backend/__tests__/signMachOResources.test.ts`. Commit `51e628659`.

### `[Plan-text ambiguity] `-s` vs `--sign``

The plan's `<behavior>` list says the argv "contains `-s`"; its `<action>` prescribes `codesign --force --sign "$IDENTITY" ...`. These are the same codesign option, but an array `toContain('-s')` would fail against `--sign`. I implemented `--sign` (the `<action>` spelling) and the tests pin `--sign` **plus** that the identity is the token immediately following it. Not a weaker check — a stricter one.

### `[Plan-text defect] The plan's own GAP-A verify command FALSE-FIRES`

Task 2's third verify line is:

```
grep -v '^\s*#' .github/workflows/release-tauri.yml | grep -c 'APPLE_CERTIFICATE: \${{' | xargs -I{} sh -c 'echo "..."; test {} -eq 0'
```

Run verbatim it reports **1, not 0, and exits 1** — and it does so at HEAD too, before any of my changes. What it matches is line 91's `IN_APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}`, the enrolment step's legitimate input map from Phase 34: the forbidden name is a **substring** of the permitted one. Confirmed pre-existing with `git show HEAD:.github/workflows/release-tauri.yml | grep -c 'IN_APPLE_CERTIFICATE: '` → 1.

I did **not** widen or weaken the check. The committed test parses the YAML and tests keys with `startsWith('APPLE_')` against every step's and the job's `env` map, with a **positive control** asserting the predicate returns true for `APPLE_CERTIFICATE`, false for `IN_APPLE_CERTIFICATE`, and that `IN_APPLE_CERTIFICATE` really is present in this workflow (so the negative half is about a live shape). An anchored shell equivalent (`grep -cE '^[[:space:]]+APPLE_[A-Z_]*:'`) reports **0**.

### `[Declared convention deviation] YAML parsing in `releaseWorkflow.test.ts``

That file's header states raw-text assertions and no YAML parser. The new block uses `js-yaml` (already a direct devDependency, already imported by `runnersOnedirWorkflow.test.ts`). The reason is stated in the block's own comment: the step comment this task wrote legitimately mentions `tauri-action`, `--deep`, `--entitlements` and `sign:macos-resources`, so a raw-text `indexOf` ordering comparison would bind to prose. Existing raw-text blocks were left untouched.

## Answers recorded on the todo

- **(a) Can they be re-signed? YES.** All 253 are ad-hoc (`legendary` → `flags=0x2(adhoc)`, `comet` → `flags=0x20002(adhoc,linker-signed)`). No third-party Developer ID seal exists to destroy; `--force` suffices and is required.
- **(b) Do any need entitlements? NO, deliberately.** Entitlements are not a notarization input — none of Apple's four complaints is about one. `disable-library-validation` is unnecessary at one shared Team ID; CPython 3.12 has no JIT. The residual libffi/`MAP_JIT` risk is a **runtime** question a notarization `Accepted` cannot answer; its remedy is the empty `HELPER_ENTITLEMENTS` seam.

The todo **stays OPEN in `pending/`**, now `ready: live-gate` / `needs: retag-and-confirm-notarization-accepted`.

## What is UNVERIFIED (verbatim, not by reference)

1. **Keychain coexistence** — whether the step's throwaway keychain survives alongside Tauri's own later `security create-keychain` / `set-keychain-search-list`. Highest risk in the change. A collision fails the macOS leg loudly at `tauri build`, which is a better failure than the current one, but still a failure only a real run reveals. **Unobserved.**
2. **Copy-preserves-signature** — argued from Mach-O signatures living in `LC_CODE_SIGNATURE` rather than an xattr or sidecar file. **Unobserved.**
3. **Notarization verdict.** **Unobserved.**
4. **The no-entitlements runtime decision** — whether a helper crashes under the hardened runtime with no entitlements. A notarization `Accepted` says nothing about this. **Unobserved.**

## Known Stubs

`HELPER_ENTITLEMENTS` ships as an empty map. This is **intentional and documented**, not a stub standing in for missing work: it is the designated seam for a future observed crash, and populating it speculatively is the exact mistake the design rejects. No UI or data path depends on it.

## Threat Flags

None. No new network endpoint, auth path or schema change. The only new trust-boundary surface — the P12 decoded to `$RUNNER_TEMP` — is T-uik-01 in the plan's own register and is mitigated by the trap installed before the write. No package was installed.

## Self-Check: PASSED

- `meta/signMachOResources.ts` — FOUND
- `src/backend/__tests__/signMachOResources.test.ts` — FOUND
- `.github/workflows/release-tauri.yml` — FOUND, sign step at index 16
- `.planning/todos/pending/2026-09-17-notarization-rejects-...md` — FOUND in `pending/`, absent from `completed/`
- Commits `51e628659`, `0432e0ff4`, `c758160d5` — all FOUND in `git log`
