---
phase: quick-260922-9um
plan: 01
type: execute
status: complete
started: 2026-09-21
completed: 2026-09-21
commits:
  - dc8f50f3d
  - 8a7d46ea9
  - 78fe298bf
  - 66e197175
---

# Quick task 260922-9um: replace the never-passing find-deadcode gate

`pnpm find-deadcode` was `ts-prune --error` and had never exited 0 on this fork. It is now a
two-population baseline ratchet that **exits 0**, goes red on a change to either population in
either direction, and runs as the fifth gate in `.husky/pre-push`.

## The headline numbers, measured

| | before (`5c22b2566`) | after (`66e197175`) |
|---|---|---|
| script | `ts-prune --error` | `node meta/findDeadcode.cjs` |
| **real exit code** | **1** | **0** |
| stdout | 256 finding lines | `unreachable: 52 OK \| used-in-module: 204 OK` |

Exit codes were captured to files in the scratchpad and read from `$?` directly — never through
a pipe and never behind an `&&` chain (orchestrator correction 2; this repo has a recorded lesson
where `build | tail` masked an exit code and produced three wrong conclusions).

## Final population: still 256 — verified, not assumed

The plan required generating the baselines from the FINAL tree, after every other edit, because
adding a test file can itself change ts-prune's findings. Measured at the final tree:

```
raw lines: 256
unreachable findings: 52 -> identities: 52
used-in-module findings: 204 -> identities: 204
```

Unchanged from the orchestrator's pre-task measurement. The new `.cjs` is invisible to ts-prune
(it analyses the TS project, not `.cjs`) and the new test file exports nothing, as predicted.

Verified byte-identical round trip: stripping `#` and blank lines from each committed ledger
reproduces the generated list exactly (`diff -q`, both files).

## Both ratchet arms were actually run

`pnpm find-deadcode` had never exited 0 on this fork, so a first-ever green reading proves nothing
until contrasted against a red one.

### Arm 1 — delete a live baseline line (simulates a NEW finding)

Deleted `src/backend/images_cache.ts - initImagesCache` from the unreachable ledger.
**Real exit code 1.** stdout `unreachable: 52 FAIL | used-in-module: 204 OK`. stderr verbatim:

```
unreachable: 1 NEW finding(s) not in meta/deadcode-baseline-unreachable.txt:
  + src/backend/images_cache.ts - initImagesCache
Resolve each one AT THE SOURCE. Do not add it to the baseline:
  (a) delete the dead export, if it really is dead; or
  (b) drop the `export` keyword, if the symbol is only used inside its own module; or
  (c) if the export is deliberate, mark it at the site with `// ts-prune-ignore-next` plus a comment saying WHY. This fork already does exactly that at src/backend/utils.ts:1809, src/backend/recent_games/recent_games.ts:64, and src/common/types/ipc.ts:81 and :185.
```

Note the other population stayed `OK` — the two are genuinely independent, not one count.

### Arm 2 — append a junk identity (simulates code that was deleted)

Appended `src/does/not/exist.ts - neverExistedSymbol` to the used-in-module ledger.
**Real exit code 1.** stdout `unreachable: 52 OK | used-in-module: 204 FAIL`. stderr verbatim:

```
used-in-module: 1 baseline entr(ies) in meta/deadcode-baseline-used-in-module.txt no longer found:
  - src/does/not/exist.ts - neverExistedSymbol
Delete each of those lines from meta/deadcode-baseline-used-in-module.txt. The ledger may only shrink, and a stale entry makes it an inaccurate census.
```

### Residue check

Both arms restored and proven clean two ways: `git diff --stat` empty, and md5 of the worktree
file identical to `git show HEAD:<path>` (`920a0a7c…` and `7fe857b2…`). Clean re-run after both
probes: **exit 0**.

## Every gate, real result

| gate | real exit | detail |
|---|---|---|
| `pnpm find-deadcode` | **0** | `unreachable: 52 OK \| used-in-module: 204 OK` |
| `npx jest meta/__tests__/findDeadcode.test.ts` | **0** | 14/14 pass, incl. the CLI exit-0 spawn (4.47s) |
| `pnpm codecheck` | **0** | `tsc --noEmit`, no output |
| `pnpm lint` | **0** | `production: PASS \| tests: PASS` |
| `pnpm prettier` | **0** | `All matched files use Prettier code style!` |
| `pnpm i18n --fail-on-update` | **0** | Restored keys 0, unreferenced keys 0 |
| `pnpm planning-gates` | **0** | 12/12 |
| **`bash .husky/pre-push` (all five)** | **0** | the whole point of the task, end to end |

Lint warning counts: **production 1119** against its 1124 ceiling, **tests 638/638** exactly. The
new test file adds zero warnings. Production sits 5 below its ceiling — src has drifted down
since 1124 was measured. **I did not lower the ceiling**, per the "do not widen or narrow anything
to pass" requirement; that is a separate decision with its own measurement.

The CLI-half test was RED before the baselines landed, for the right reason. Recorded rather than
described as expected-to-pass:

```
Expected pattern: /^0\n/
Received string:  "1
findDeadcode.cjs crashed: Error: findDeadcode: baseline …/deadcode-baseline-unreachable.txt does not exist.
```

13 pure-half tests passed at that point; only the spawn was red.

## What surprised me

### 1. A false-positive cluster the plan did not know about — 53 of the 256

`meta/` exports whose only importer is a `meta/__tests__/` file are **structurally invisible to
ts-prune**. Measured with ts-morph against `tsconfig.json`:

```
total source files in project: 1141
meta/ files: 7
meta/__tests__ files: 0
src __tests__ files: 412
```

`tsconfig.json` has `include: ["src"]`. The 7 `meta/` modules are in the project *only* because
some `src/**/__tests__` file imports them — which is why `meta/buildRunnersOnedir.ts - archiveName`
is absent from the ledger (imported by `src/backend/__tests__/runnersOnedirWorkflow.test.ts`)
while its 14 siblings are present.

Verified per entry for the two that landed in the *unreachable* population despite having live
callers:

- `toOnedirCommand` ← imported by `meta/__tests__/buildRunnersOnedir.test.ts` **and**
  `meta/__tests__/runnerBuildInvocations.test.ts`
- `buildSeaConfigPath` ← imported by `meta/__tests__/buildSidecarSea.test.ts`

That is **51 of the 204 plus 2 of the 52 = 53 findings** that are false positives by construction.
Annotated in both ledgers. Widening `tsconfig.json` to cover `meta/` would dissolve the whole
cluster, but that is a tsconfig decision with its own blast radius and was not in scope.

### 2. The plan's duplicate-identity premise is FALSE as measured

The plan said "Duplicate identities are possible and measured (two findings at
`.../FilterFacetGroup/selectionCount.ts:46`)". Measured: **zero duplicate identities exist in
either population** (`uniq -d` over both, empty; 52 findings → 52 identities, 204 → 204).

What actually sits at `selectionCount.ts:46` is `as const satisfies readonly DescriptorKind[]`,
which ts-prune reports as two findings at the **same line** with **different names**
(`satisfies`, `readonly`). Distinct names → distinct identities → nothing deduped.

I kept the set-based comparison anyway (it is the right shape, it is defensive against a format
ts-prune does not guarantee, and the plan mandated a test for it), but I **annotated the ledger
with the correction rather than repeating the plan's claim** — a ledger that tells the next reader
a dedupe happened when none did is the inaccurate-census failure this repo keeps recording.

### 3. `git checkout --` fired the post-checkout hook mid-probe

Restoring arm 1 with `git checkout -- <file>` triggered the repo's `post-checkout` hook, which ran
a full `pnpm install` (`Packages: -127` then re-added 127) and `download-helper-binaries`. Net
effect was nil and `git diff --stat` came back empty, but for arm 2 I restored from a pristine
scratchpad copy with `cp` instead, to keep the probe from doing unrelated work. This is the
already-recorded `git checkout --` lesson, confirmed again.

### 4. `prettier --check` cannot parse `.husky/pre-push` when named explicitly

`npx prettier --check .husky/pre-push` exits 2 with "No parser could be inferred". `prettier
--check .` skips it silently when globbing a directory, which is why `pnpm prettier` is green.
Pre-existing and unchanged — noted only so a future reader does not mistake it for something this
task introduced.

## Decisions I had to make

**Orchestrator correction 1, applied and verified.** `run({ ignore })` alone throws: `lib/runner.js`
does `path.join(process.cwd(), config.project)` unguarded, so `undefined` is a `TypeError`, not a
default. I supplied `project: 'tsconfig.json'` explicitly and confirmed from
`lib/configurator.js` that this is ts-prune's **own** `defaultConfig.project` value, so the
literal reproduces upstream rather than inventing a policy. The call site carries a comment saying
exactly that, and why `getConfig()` (the normal source of the default) is deliberately not used.

**Added a `process.chdir` to `collectFindings`** (deviation, Rule 2 — correctness). ts-prune
resolves both the tsconfig and its repo-relative output paths against `process.cwd()`. Without
this the gate's answer depends on the directory it was invoked from, and the identities would not
match the committed baselines. It chdirs to the repo root and restores in a `finally`.

**Two extra tests beyond the plan's list** (14 total, not the 12 the plan enumerated):
`readIgnorePattern` reads the committed `.ts-prunerc`, and throws rather than defaulting when the
rc is absent. That is the other named hard-failure path in the design and was untested. Cost zero
lint warnings.

**Annotation placement.** `meta/releaseTags.ts`'s three findings sort as `Record`,
`SupportedPlatform`, `satisfies` — so the two parse artifacts are **not adjacent**, with a real
unused type alias between them. A "the next two lines" annotation would have been wrong. The block
covers the whole `releaseTags.ts` group instead and says which of the three is real. The ledgers
were emitted by a script with an anchor-match assertion that throws if any annotation anchor never
matched, rather than hand-typed (256 hand-typed lines is a transcription-error surface).

## Files

| file | change |
|---|---|
| `meta/findDeadcode.cjs` | new, 497 lines — the gate |
| `meta/deadcode-baseline-unreachable.txt` | new, 150 lines — 52 identities + **98** `#` lines |
| `meta/deadcode-baseline-used-in-module.txt` | new, 274 lines — 204 identities + **70** `#` lines |
| `meta/__tests__/findDeadcode.test.ts` | new, 209 lines — 13 pure-half + 1 CLI-half tests |
| `package.json` | `find-deadcode` → `node meta/findDeadcode.cjs`; name kept |
| `.husky/pre-push` | fifth gate appended |
| `.planning/todos/{pending→completed}/2026-09-21-find-deadcode-has-never-passed-…md` | closed with `resolved_by`/`resolution` + `## Resolution` |

`.github/workflows/lint.yml` is **UNMODIFIED** — absent from `git diff --stat HEAD~4 HEAD`, and
`grep -c 'ts-prune --error' package.json` is `0` while the `find-deadcode` script name survives,
so the workflow's `Find dead code` step keeps binding without an edit.

**`git mv` trap handled.** The todo was moved with `git mv` *before* being edited, then edited at
the new path, then staged, then the staged content verified with `git show :<path> | grep -c` —
`resolved_by` 1, `resolution` 1, `## Resolution` heading 1, probe evidence 2, 184 lines staged vs
184 in the worktree. This repo has recorded three incidents of `git mv` committing HEAD content and
dropping unstaged edits.

## Open items

1. **A follow-up todo I did not create appeared untracked in the tree**:
   `.planning/todos/pending/2026-09-21-the-204-entry-used-in-module-ledger-freezes-an-export-keyword-cleanup.md`
   (the planner's concern, filed by the orchestrator). Left untouched and unstaged. Its
   precondition — `meta/deadcode-baseline-used-in-module.txt` exists — is now satisfied.
2. **That todo's bucket C may be contaminated by finding #1 above.** It lists
   `meta/buildRunnersOnedir.ts` (6) and `meta/trayIconVariants.ts` (4) as "candidates for a clean
   un-export", decided by a name grep over test files. Several `meta/` exports have live importers
   in `meta/__tests__/`, which is exactly why they appear in the ledger at all. Anyone picking that
   todo up should re-derive the buckets *including* `meta/__tests__/` importers before
   un-exporting anything under `meta/` — the todo already warns its own table must be re-derived,
   which is the right instinct.
3. **Unaddressed, as the source todo asked**: `lint.yml`, `test.yml` and `codecheck.yml` trigger
   only on `pull_request: branches: [main, stable]` plus `workflow_dispatch`. Nothing triggers on
   a push to `main`, and this repo works direct-to-main. Adding `find-deadcode` to `pre-push`
   narrows that gap locally but does not close it.
4. **Production lint ceiling is now 5 above its measured count** (1124 vs 1119). Deliberately not
   touched here.
