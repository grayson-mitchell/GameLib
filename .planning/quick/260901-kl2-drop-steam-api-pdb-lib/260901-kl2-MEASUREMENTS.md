# 260901-kl2 Measurements

Status: **BLOCKED again, on r4, at Task 1 Step 3 — before any code or test file was
written.** This is the SECOND halt on this quick task. The first halt (r1/r2, below)
was refuted and superseded by plan revisions r3/r4 (byte-identity rebuild comparison
replaced with P1–P4; see `260901-kl2-PLAN.md` `<revision_log>`). This second halt is
a DIFFERENT defect, found while preparing Task 1 Step 3's implementation, before
Step 0/Step 1 needed any redo. Per the executor brief's explicit instruction ("If you
find a fourth vacuous gate, STOP and report rather than working around it"), execution
stopped here. No code was modified, no test was added, no commit was made.

## r4 attempt — 2026-09-01, second session

### Step 0 — pre-change script pinned (done, per plan)

```
$ mkdir -p <scratchpad>/prechange
$ cp meta/buildSteamBridgeShims.ts <scratchpad>/prechange/buildSteamBridgeShims.ts
$ git rev-parse HEAD
19f56777d2b60e9d145da700f27ae3372d646424
```

Negative assertion (pre-change copy must NOT already contain the prune):

```
$ grep -q pruneShimBuildByproducts <scratchpad>/prechange/buildSteamBridgeShims.ts \
    && echo "NOT the pre-change script" || echo "pre-change copy OK"
pre-change copy OK
```

**E1 pre-change provenance:** saved file =
`<scratchpad>/prechange/buildSteamBridgeShims.ts`; pinned SHA =
`19f56777d2b60e9d145da700f27ae3372d646424` (state immediately before this task's
first commit — none has been made yet, so `HEAD` is still this SHA at halt time).

### Step 1 — byproducts removed from the real tree WITHOUT rebuilding (done, per plan)

```
$ rm public/bin/arm64/darwin/steam_api.pdb public/bin/arm64/darwin/steam_api_shim.lib
$ shasum -a 256 public/bin/arm64/darwin/steam_api.dll
2da072ba8fc455e9afc3dcce73ac631d0075f35deb3f19cd34b521c725f1d960  public/bin/arm64/darwin/steam_api.dll
```

DLL untouched — matches the required baseline. Dev tree census after removal:

```
files   = 277
symlinks = 12
bytes   = 97,884,865
```

Matches the plan's expected 277 / 12 / 97,884,865 exactly. `steam-bridge-helper` and
`steam_appid.txt` both survive. `build/bin/arm64/darwin` was left untouched at this
point (still 279 / 12 / 100,707,073, DLL sha `2da072ba…`) — its mirror-prune is
Task 2's job, run via `pnpm exec vite build`, not Task 1's.

**Current repo state at halt:** the two byproducts ARE removed from
`public/bin/arm64/darwin/` (gitignored, untracked, non-destructive, idempotent — a
future `rm` of already-absent files is a no-op). `build/bin/arm64/darwin` still has
its stale copies, unchanged. No git-tracked file has been modified.
`meta/buildSteamBridgeShims.ts` and `meta/__tests__/buildSteamBridgeShims.test.ts`
are both byte-identical to `HEAD` — no code or test changes were made.

### Flag-experiment table (measured during planning, recorded here per Step 1)

| Flag | Result | Verdict |
|------|--------|---------|
| `-g0` | rc=0, still emits **both** `.pdb` and `.lib` | useless |
| `--strip` | **rc=1, build fails** — not a valid clang driver flag | invalid |
| `-Wl,-s` | suppresses `.pdb`, keeps `.lib`, and mutilates the DLL: 805,888 -> 511,488 B, 455,308 bytes differ | violates the byte-identical bar |
| `-Wl,--out-implib=<sink>` | rc=0, redirects `.lib` out of the dir, `.pdb` still emitted, and the DLL sha CHANGED at the same output path | not byte-neutral, does not solve `.pdb` |

No flag or combination suppresses both byproducts. Approach (A), post-build unlink,
is forced.

### Determinism retraction (measured during planning, recorded here per Step 1)

`zig cc -target x86-windows-gnu -shared`'s `lld` backend is NOT deterministic across
same-path rebuilds — see the r1/r2 historical record below for the full
`TimeDateStamp` decode table (`2026-09-01T03:19:24Z`, `:25Z`, `:27Z`) and the
`SOURCE_DATE_EPOCH` experiment. The shipped baseline's stamp decodes to
`2026-08-31T18:38:25Z`. Task 1 therefore never rebuilds the real tree (P3); proof of
inertness is P1 (structural), P2 (same-build hash, B7/E1), and P4 (masked
comparison), not rebuild byte-identity.

### Step 2/3 — HALTED: a fourth gate is a false RED on the plan's own mandated implementation

Before writing the RED tests, Task 1's second `<verify><automated>` block (the
ordering-guard Python script) was dry-run against what Step 3 explicitly instructs
implementing, to confirm the gate would go GREEN on a correct implementation (the
lesson from r2's B-1 and the executor brief's "assume a fourth exists" — every prior
defect on this item was found by RUNNING a gate, never by reading it).

**The plan's own two instructions conflict:**

- B7 requires calling the exported prune function WITH an explicit arch argument:
  `pruneShimBuildByproducts('arm64')`.
- Step 3 explicitly mandates the corresponding signature: `pruneShimBuildByproducts(arch: string = resolveBridgeArch()): void`.
- But Task 1's second automated verify script locates the DEFINITION with
  `re.search(r'function pruneShimBuildByproducts\(\)', stripped)` — literal empty
  parens immediately after the name. A parameterized signature
  (`pruneShimBuildByproducts(arch: string = resolveBridgeArch())`) does NOT contain
  the substring `pruneShimBuildByproducts()` anywhere (the definition's parens are
  never empty), so `defn` is `None` and the script exits
  `'FAIL: pruneShimBuildByproducts() is not defined in the comment-stripped source'`
  — on a correct, plan-mandated implementation.

**Reproduced independently** (not just reasoned about) by inserting the exact
Step-3-mandated signature and the exact Step-3-mandated call site into a copy of the
real source, then running the plan's own verify script verbatim against it:

```
$ python3 -c "
import re
src = open('meta/buildSteamBridgeShims.ts').read()
addition = '''
export function pruneShimBuildByproducts(arch: string = resolveBridgeArch()): void {
  for (const path of [1,2]) {
    // ...
  }
}
'''
src2 = src.replace(
  'console.log(\`Compile gate PASSED -> \${shimOutputPath()}\`)',
  'console.log(\`Compile gate PASSED -> \${shimOutputPath()}\`)\n  pruneShimBuildByproducts()'
) + addition
stripped = re.sub(r'/\*[\s\S]*?\*/', '', src2)
stripped = re.sub(r'^\s*//.*\$', '', stripped, flags=re.M)
defn = re.search(r'function pruneShimBuildByproducts\(\)', stripped)
call = re.search(r'(?<!function )pruneShimBuildByproducts\(\)(?!\s*:)', stripped)
gate = stripped.find('no .dll was emitted')
gates = len(re.findall('COMPILE GATE FAILED', stripped))
print('defn:', defn); print('call:', call); print('gate index:', gate); print('gates count:', gates)
"
defn: None
call: <re.Match object; span=(4835, 4861), match='pruneShimBuildByproducts()'>
gate index: 4719
gates count: 2
RESULT: FAIL - pruneShimBuildByproducts() is not defined in the comment-stripped source
```

The CALL site is located correctly and its position (4835) is correctly AFTER the
gate (4719) — the ordering logic itself is sound once `defn` is found. Both
`COMPILE GATE FAILED` throws survive (`gates count: 2`). Only the `defn` regex is
wrong: it was written against the illustrative, parameterless prose in B4
("the helper is declared as `function pruneShimBuildByproducts(): void {`"), not
against the actual signature Step 3 instructs (with an `arch` parameter, required by
B7). This is the same class of defect as r2's B-1 (an ordering-style gate false-RED
on correct code) and the executor brief's finding #2 — found here for a fourth time
on this same item, in the `defn` half of the check rather than the `call` half this
time.

**No workaround was applied.** Per explicit instruction, this halts the plan rather
than being patched inline (e.g. loosening the regex, or writing
`pruneShimBuildByproducts` without a parameter and threading arch through some other
mechanism to dodge the string match — either would be shaping the implementation
around a broken gate instead of fixing the gate).

**What a fix looks like (not applied — a plan/gate edit, not code):** the `defn`
regex needs the same tolerance the `call` regex already has for the file's
define-before-use convention and for parameters, e.g.
`re.search(r'function pruneShimBuildByproducts\(', stripped)` (open paren only,
not `\(\)`), with the definition vs. call distinguished the same way `call` already
is (`(?<!function )` / `(?!\s*:)`) rather than by requiring literally-empty parens.

## Repo state at halt (r4 attempt)

- `public/bin/arm64/darwin/steam_api.dll` — unchanged, sha `2da072ba…`, 805,888 B.
- `public/bin/arm64/darwin/steam_api.pdb`, `steam_api_shim.lib` — REMOVED (Step 1,
  intentional, matches the plan's target end-state, gitignored/untracked).
- `public/bin/arm64/darwin` census: 277 files / 12 symlinks / 97,884,865 B.
- `build/bin/arm64/darwin` — untouched, still 279 / 12 / 100,707,073, DLL sha
  `2da072ba…` (Task 2's job to mirror-prune, not reached).
- `meta/buildSteamBridgeShims.ts`, `meta/__tests__/buildSteamBridgeShims.test.ts` —
  byte-identical to `HEAD` (`19f56777d`). No test added. No commit made.
- Tasks 2 and 3 not started (both depend on Task 1 completing).

## What this means for the plan

Approach (A) (post-build unlink) and the P1–P4 proof strategy from r3/r4 remain
sound — nothing here contradicts them. What's blocked is Task 1's OWN embedded
automated ordering-guard script, which cannot pass against the implementation the
plan's own Step 3 instructs writing, because the exported prune function must take
an `arch` parameter (for B7) but the verify script's definition-locator regex
assumes empty parens. This needs a plan/gate correction — widening the `defn` regex
per the sketch above, in the same spirit as r2's B-1 fix to the `call` regex — before
Task 1 can proceed. It is not an architectural change to the code (Rule 4 in the
narrow sense of "new table/service/framework") but it is a change to the plan's own
verification script, which per the executor brief ("If you find a fourth vacuous
gate, STOP and report rather than working around it") is explicitly out of scope for
an autonomous inline fix here.

No further tasks were attempted. See `260901-kl2-SUMMARY.md`.

---

## r5 attempt — 2026-09-01, third session (resumed after the ordering-guard fix)

Coordinator confirmed the fourth-defect finding above was correct and fixed the
plan to r5 by **deleting** Task 1's ordering-guard verify script and its B4 twin
(rather than patching the regex), and by rewriting Task 2's M1/M2/M3 into a
seeded-mutation design that carries the ordering property behaviourally. See
`260901-kl2-PLAN.md`'s `<revision_log>` r5 entry for the full rationale. Step 0
and Step 1 from the r4 attempt above are unchanged and were NOT redone — this
session resumed at Task 1 Step 2.

### Step 2 — RED tests written and confirmed failing for the right reason

Added `describe('shim build byproducts (todo item 6, quick-260901-kl2)', ...)`
to `meta/__tests__/buildSteamBridgeShims.test.ts` covering B1, B2, B3, B5, B6,
B7, B8 (B4 removed per r5 — the ordering property moved to Task 2's seeded
M1/M2). Imported `pruneShimBuildByproducts`, `SHIM_BUILD_BYPRODUCTS`,
`shimByproductPaths` from `../buildSteamBridgeShims` — none existed yet.

`pnpm exec jest --config meta/jest.config.js buildSteamBridgeShims` before
implementation:

```
Tests:       6 failed, 20 passed, 26 total
```

The 6 new-behaviour tests failed for the correct reason — missing exports, not
a typo:
- B1, B2: `TypeError: (0 , buildSteamBridgeShims_1.shimByproductPaths) is not a function`
- B3: `SHIM_BUILD_BYPRODUCTS` undefined, `.not.toContain` against `undefined`
- B6: `stripped` did not yet match the fail-loud post-condition regex (prune
  function did not exist in source)
- B7, B8: `TypeError: (0 , buildSteamBridgeShims_1.pruneShimBuildByproducts) is not a function`

B5 (both `COMPILE GATE FAILED` throws survive, no try/catch inside
`compileShim`) already PASSED before implementation — expected, since neither
throw nor a try/catch was touched by this change; B5 is a structural invariant
that holds before and after, not a new-behaviour RED.

### Step 3 — implemented in `meta/buildSteamBridgeShims.ts`

- Added `rmSync` to the existing `node:fs` import.
- Added `SHIM_BUILD_BYPRODUCTS = ['steam_api.pdb', 'steam_api_shim.lib'] as const`,
  placed immediately after `shimOutputPath()`, with a docblock naming the
  rejected flag candidates (`-Wl,-s`: 805,888 -> 511,488 B, 455,308 bytes
  changed; `-Wl,--out-implib`: does not suppress `.pdb`, still perturbs the
  DLL's CodeView build-id) so a future reader does not re-attempt them.
- Added `shimByproductPaths(arch = resolveBridgeArch()): string[]`, mapping
  each name through `join(bundledBinDir(arch), name)`.
- Added exported `pruneShimBuildByproducts(arch = resolveBridgeArch()): void`
  — iterates `shimByproductPaths(arch)`, `rmSync(path, { force: true })`
  (tolerant of absence, B8), then asserts the post-condition with
  `existsSync(path)` and throws naming the surviving path if removal did not
  take (B6).
- Called `pruneShimBuildByproducts()` in `compileShim()` on the line
  immediately after `console.log(\`Compile gate PASSED -> ...\`)` — i.e.
  strictly after both `COMPILE GATE FAILED` throws. Neither throw was moved,
  reworded or wrapped.
- Updated the module docblock's compile-gate paragraph with one sentence
  naming the new unlink step.

### Step 4 — GREEN

```
pnpm exec jest --config meta/jest.config.js buildSteamBridgeShims
Test Suites: 1 passed, 1 total
Tests:       26 passed, 26 total
```

`ls public/bin/arm64/darwin/` after the test run (tests operate on a
`mkdtemp` fixture with `process.chdir`, never the real tree — confirmed the
real tree was untouched):

```
comet
gogdl
legendary
nile
steam-bridge-helper
steam_api.dll
steam_appid.txt
```

`steam_api.dll` sha256 after the test run:
`2da072ba8fc455e9afc3dcce73ac631d0075f35deb3f19cd34b521c725f1d960` — unchanged
from Step 1 and from the pre-existing baseline.

### Step 5 — `.gitignore` annotated

Extended the comment above `public/bin/.gitignore:17-21` with a dated note
(2026-09-01, quick-260901-kl2, todo item 6) that `buildSteamBridgeShims.ts` now
unlinks both files immediately after the compile gate passes via
`pruneShimBuildByproducts()`, and that the ignore rules stay only as
belt-and-braces against a future toolchain re-emitting them mid-build. The
`**/steam_api.pdb` / `**/steam_api_shim.lib` rules themselves were NOT
removed, per the plan.

### Task 1 verify (automated block)

```
ACT=2da072ba8fc455e9afc3dcce73ac631d0075f35deb3f19cd34b521c725f1d960
EXP=2da072ba8fc455e9afc3dcce73ac631d0075f35deb3f19cd34b521c725f1d960 (match)
pdb absent: confirmed
lib absent: confirmed
steam-bridge-helper present: confirmed
steam_appid.txt present: confirmed
dev census: 277 files / 12 symlinks / 97,884,865 B (matches 277/12/97884865)
jest buildSteamBridgeShims: 26/26 passed
TASK1-PASS
```

Task 1 committed. See `260901-kl2-SUMMARY.md` for the commit hash.

---

## r1/r2 attempt (historical, superseded by r3/r4) — BLOCKED at Task 1 Step 1

Status: the plan's own primary safety gate at the time (Task 1, Step 1 — "MEASURE
the premise before writing any code") was executed exactly as written and **failed**.
Per the plan's explicit instruction, execution stopped there: no code was changed, no
test was added, no commit was made. This section records what was measured. It is
kept verbatim as the historical record; r3/r4 replaced the acceptance bar it
describes (see `<revision_log>` in `260901-kl2-PLAN.md`) — do not re-litigate it.

### What the plan required (r1/r2 wording)

> Run `pnpm build-steam-bridge` on the tree exactly as it stands, then
> `shasum -a 256 public/bin/arm64/darwin/steam_api.dll`.
> - If it equals `2da072ba8fc455e9afc3dcce73ac631d0075f35deb3f19cd34b521c725f1d960`,
>   the same-path rebuild is reproducible ... proceed.
> - If it does NOT equal that value, STOP and report.

### Baseline (pre-existing, before any rebuild that session)

```
public/bin/arm64/darwin/steam_api.dll
  size   = 805,888 B
  sha256 = 2da072ba8fc455e9afc3dcce73ac631d0075f35deb3f19cd34b521c725f1d960
```

Backup copy stashed at (scratchpad, per plan instruction):
`/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/43af95b6-6811-4809-aec7-5fac64d6667f/scratchpad/steam_api.dll.baseline`

Dev tree census (unchanged before/after — the rebuild attempts did not add or
remove files, only overwrite the three build outputs in place):
`public/bin/arm64/darwin` = 279 files / 12 symlinks / 100,707,073 B.

`.build-tools/zig/zig version` = `0.16.0`, matching `ZIG_VERSION` in
`meta/downloadZig.ts` — toolchain matches what the plan assumed.

### Step 1 result: REPRODUCIBILITY PREMISE REFUTED

Ran `pnpm build-steam-bridge` on the unmodified tree (no code touched):

```
$ pnpm build-steam-bridge
Compiling native arm64 helper: clang -O2 -arch arm64 -o public/bin/arm64/darwin/steam-bridge-helper native/steam-bridge/helper/bridge_helper.c
Helper compiled -> public/bin/arm64/darwin/steam-bridge-helper
Staged steam_appid.txt -> public/bin/arm64/darwin/steam_appid.txt (finding #4)
zig 0.16.0 already present at .build-tools/zig/zig, skipping download
Compile gate: .build-tools/zig/zig cc -target x86-windows-gnu -shared -o public/bin/arm64/darwin/steam_api.dll native/steam-bridge/generated/steam_api_shim.c native/steam-bridge/generated/steam_api.def -lws2_32
Compile gate PASSED -> public/bin/arm64/darwin/steam_api.dll

$ shasum -a 256 public/bin/arm64/darwin/steam_api.dll
dea40a6f77a3a11f5849344abf858d0e4edbec7c8e9b33c3abb7a7fb69cad96e  public/bin/arm64/darwin/steam_api.dll
```

`dea40a6f…` != expected `2da072ba…`. Per the plan, this alone is grounds to stop.
Before stopping, four more rebuilds were run at the **identical output path**, with
**no code changes**, to characterize whether the mismatch was a one-off or systemic
(this diagnostic work stayed entirely within the scratch/tmp area — the repo tree
itself was rebuilt in place each time, exactly as `pnpm build-steam-bridge` always
does, then restored from backup at the end):

| Run | sha256 (steam_api.dll) | size | Matches previous run? |
|---|---|---|---|
| baseline (pre-existing, planning-time) | `2da072ba8fc455e9afc3dcce73ac631d0075f35deb3f19cd34b521c725f1d960` | 805,888 | — |
| run 1 (this session) | `dea40a6f77a3a11f5849344abf858d0e4edbec7c8e9b33c3abb7a7fb69cad96e` | 805,888 | no (vs baseline) |
| run 2 | `f0011305255cbb66787efb6d60d97b3e74d2bc403606d70b1c74121b93c47df` | 805,888 | no (vs run 1) |
| run 3 | `9947ca946d8f4dd2c077bafc2f435a1f636849b83357801711349870cdafe94` | 805,888 | no (vs run 2) |
| run 4 | `2a2b24e5a990a81838ed3899092794975940ff402db8f6092f1448b9487c6fc` | 805,888 | no (vs run 3) |

Every single rebuild at the identical path, with identical argv and identical
source, produced a **different sha256**. Size is stable at 805,888 B in every case
— only a small number of bytes differ. `cmp -l` between consecutive runs:

```
$ cmp -l run3 run4
   129 351 352
729093 351 352
```

Two bytes differ (offsets 129 and 729093, 1-indexed) — exactly the same two offsets
the plan's own `<measured_facts>` names as "the PE checksum and the CodeView RSDS
build-id GUID". The plan's `<measured_facts>` attributed variance at these offsets
solely to **output path** ("Path is the sole variable"). That attribution is
incomplete: this session shows the same two offsets vary **at a fixed, identical
path**, run over run.

#### Root cause identified (diagnostic only — not a fix, not applied to the repo)

Offset 129 (0-indexed 128 = `0x80`) is inside the PE COFF file header. Decoding it:

```python
e_lfanew = struct.unpack_from('<I', data, 0x3C)[0]        # -> 120 (0x78)
machine, nsec, timestamp = struct.unpack_from('<HHI', data, e_lfanew + 4)
```

| DLL | `TimeDateStamp` (raw) | Decoded (UTC) |
|---|---|---|
| baseline | 1788201505 | 2026-08-31 18:38:25 |
| run 3 | 1788232425 | 2026-09-01 03:13:45 |
| run 4 | 1788232426 | 2026-09-01 03:13:46 |

The `TimeDateStamp` field is the wall-clock second the linker ran — it advances by
exactly the real elapsed time between builds (run 3 -> run 4 is 1 second, matching
the actual gap). `lld` (invoked by `zig cc -shared`) stamps this field from the
current time by default; nothing in `buildShimCompileArgv()` passes a flag to pin
it.

`SOURCE_DATE_EPOCH` was tested (scratch directory only, `/tmp/sde_test1`,
`/tmp/sde_test2`, never touching the repo):

```
$ SOURCE_DATE_EPOCH=1700000000 .build-tools/zig/zig cc -target x86-windows-gnu -shared -o /tmp/sde_test1/steam_api.dll ...
$ sleep 2
$ SOURCE_DATE_EPOCH=1700000000 .build-tools/zig/zig cc -target x86-windows-gnu -shared -o /tmp/sde_test2/steam_api.dll ...
$ shasum -a 256 /tmp/sde_test1/steam_api.dll /tmp/sde_test2/steam_api.dll
242dad59784b858391715af84bb89fd7f893ead3c36eaa90017fadf46335f47d  sde_test1/steam_api.dll
e9451897613326c2a5f63f4fe0339dd5d6a43bd57c46ded5a7dd40dc7da89683  sde_test2/steam_api.dll
```

`SOURCE_DATE_EPOCH` does pin the `TimeDateStamp` field (offset 129 was identical
between the two SDE runs, confirmed by decoding both — `1700000000` in both). It
does **not** fully fix reproducibility: an 8-byte span at offset 729121-729128
still differed between the two SDE runs. That span sits inside the same debug
directory (RSDS/PDB GUID) region the plan's `<measured_facts>` names as
path-dependent — here it varies with no path change and a pinned timestamp, so it
carries its own additional non-determinism (most likely a linker-internal
random/hash-derived build ID that `zig cc -shared`'s current invocation does not
control).

**Conclusion: `zig cc -target x86-windows-gnu -shared` at this pinned toolchain
version (0.16.0), with the current argv, is not reproducible build-over-build at a
fixed output path — with or without `SOURCE_DATE_EPOCH`.** The plan's
`<measured_facts>` claim of two byte-identical consecutive same-path builds
(`0d60bb9c…`, both runs) was not reproduced in this session; the most likely
explanation is that the planning-time measurement's two builds happened to land in
the same wall-clock second (`TimeDateStamp` — and by chance the PDB GUID-derived
bytes too), which is exactly the kind of coincidence a `TimeDateStamp`-driven field
would produce and is not something a rebuild can be relied on to repeat.

#### Byproduct sizes (unchanged, informational — matches plan's stated figures)

```
steam_api.pdb      = 2,818,048 B
steam_api_shim.lib = 4,160 B
```

### Repo state after r1/r2 session

`public/bin/arm64/darwin/steam_api.dll` was restored from the scratchpad backup
before returning:

```
$ shasum -a 256 public/bin/arm64/darwin/steam_api.dll
2da072ba8fc455e9afc3dcce73ac631d0075f35deb3f19cd34b521c725f1d960  public/bin/arm64/darwin/steam_api.dll
```

Matches the pre-existing baseline exactly. `public/bin/arm64/darwin` still censuses
at 279 files / 12 symlinks / 100,707,073 B. `public/bin/**` is fully gitignored
(`public/bin/.gitignore`), so none of the rebuild churn touched any git-tracked
file; `git status --short` shows no change to any tracked path.

No code was modified. No test was added. No task commit was made. Task 2 (mutation
proof) and Task 3 (packaged DMG) were not started — both depend on Task 1
completing, and the plan is explicit that a failed Step 1 stops the whole plan.

**This premise (byte-identity across rebuilds) was subsequently retracted and
replaced by r3/r4** with the P1–P4 proof strategy (structural / same-build hash /
never-rebuild-the-real-tree / masked comparison) — see `260901-kl2-PLAN.md`
`<revision_log>` r3. Do not re-litigate this; it is preserved here only as the
historical record of what was measured under the old (now-superseded) acceptance
bar.

---

## Task 2 — mutation-prove the compile gate, re-certify the mirror

Scratch root: `<scratchpad>/gatemut*` (never the repo). Setup per copy: `meta/`,
`native/`, `package.json`, `tsconfig.json`, `.build-tools/zig/` copied; `node_modules`
symlinked (`ln -s <repo>/node_modules node_modules`) — required per plan r2's B-2
fix, since `meta/runTs.cjs:303-310` symlinks `node_modules` from
`path.join(__dirname, '..', 'node_modules')` under an `existsSync` guard that
otherwise no-ops silently and dies at `:319` on `esbuild` resolution.

### Blocking checkpoint — unmutated scratch copy builds GREEN

```
$ cd <scratchpad>/gatemut && node meta/runTs.cjs --bundle --platform=node --target=node21 meta/buildSteamBridgeShims.ts
Compiling native arm64 helper: clang ...
Helper compiled -> public/bin/arm64/darwin/steam-bridge-helper
Staged steam_appid.txt -> public/bin/arm64/darwin/steam_appid.txt (finding #4)
zig 0.16.0 already present at .build-tools/zig/zig, skipping download
Compile gate: .build-tools/zig/zig cc -target x86-windows-gnu -shared -o public/bin/arm64/darwin/steam_api.dll ...
Compile gate PASSED -> public/bin/arm64/darwin/steam_api.dll
EXIT: 0
```

Output dir after: `steam_api.dll`, `steam_appid.txt`, `steam-bridge-helper` only —
`steam_api.pdb` and `steam_api_shim.lib` absent (pruned). DLL sha256 of this fresh
scratch build: `1122043b25f6ae678e9f669214a187bb2c1039f0dc0e806e40483b0ab77efaa6` —
different from the shipped baseline's `2da072ba…`, confirming (again, consistent
with the r3 retraction) that a rebuild is never byte-identical; this scratch DLL is
reused below for P4.

Checkpoint PASSED. Proceeding to mutations.

### Seeded byproducts — the mandatory pre-mutation step

Every mutation run below seeds `public/bin/arm64/darwin/steam_api.pdb` and
`steam_api_shim.lib` with sentinel content and asserts both present BEFORE
invoking the build (`seed_byproducts()` helper, `<scratchpad>/setup_scratch.sh`).

### M1 — zig exits non-zero (correct position: after both throws)

Introduced a hard syntax error (`this is not c;` appended) to the scratch copy of
`native/steam-bridge/generated/steam_api_shim.c`. Seeded, then ran the scratch
build.

```
exit=1
message: "COMPILE GATE FAILED (finding #5a): zig cc exited 1 -- the generated shim source does not assemble:"
steam_api.dll: ABSENT
steam_api.pdb: SURVIVED (sentinel content unchanged)
steam_api_shim.lib: SURVIVED (sentinel content unchanged)
```

M1 PASS.

### M2 — zig exits 0 but no `.dll` lands (correct position)

Stubbing technique: patched the scratch copy's `spawnArgv()` to short-circuit to
`{ code: 0, stdout: '', stderr: '' }` ONLY when `args.includes('x86-windows-gnu')`
(the shim-compile invocation) — NOT unconditionally, because `compileHelper()`
also calls `spawnArgv()` and then `chmod()`s the (real) output; an unconditional
stub would throw ENOENT on the helper step before `compileShim()` ever ran, which
would test the wrong thing. Seeded, then ran.

```
exit=1
message: "COMPILE GATE FAILED (finding #5a): zig cc exited 0 but no .dll was emitted at public/bin/arm64/darwin/steam_api.dll"
steam_api.dll: ABSENT
steam_api.pdb: SURVIVED (correct — the assertion that would have caught a prune placed between the two throws)
steam_api_shim.lib: SURVIVED
```

M2 PASS.

### M3 — prove the behavioural gate is NON-VACUOUS (mutate the prune position)

Two source mutations to `compileShim()`'s prune-call position, each re-run against
BOTH the M1-style (C syntax error) and M2-style (`spawnArgv` stub) mutations —
four combinations total, each independently seeded:

| position | via M1 (zig fails) | via M2 (code 0, no .dll) |
|---|---|---|
| before throw A (prune moved to the top of `compileShim()`, before the missing-source check) | exit=1, seeded pdb/lib **DELETED** | exit=1, seeded pdb/lib **DELETED** |
| between throw A and throw B (prune moved right after the `result.code !== 0` throw, before the `existsSync(shimOutputPath())` check) | exit=1, seeded pdb/lib **SURVIVED** | exit=1, seeded pdb/lib **DELETED** |

This is an EXACT reproduction of the coverage matrix predicted in the plan
(`260901-kl2-PLAN.md` Task 2 action, and the r5 revision-log entry): every
misordering is caught by at least one mutation (`beforeA` caught by both; `betweenAB`
caught by M2 alone, since M1's compile failure happens before that code path is
even reached), and the correct position (verified by M1/M2 above) survives both.
A gate that never ran the prune at all would show identical "survival" results to
the correct position on M1/M2 alone — M3 is what rules that out, by showing the
SAME harness DOES report deletion when the prune position is wrong.

M3 PASS — behavioural gate confirmed non-vacuous.

### E1 — P2 end-to-end: the prune cannot alter a REAL compiled DLL

**Pre-change provenance** (Task 1 Step 0, reused here): `<scratchpad>/prechange/buildSteamBridgeShims.ts`
(cross-verified byte-identical to `git show 19f56777d:meta/buildSteamBridgeShims.ts`
in this session), confirmed via `grep -q pruneShimBuildByproducts` finding NOTHING
in both — genuinely pre-change on two independent bases.

1. Copied the pinned pre-change script into a fresh scratch copy
   (`<scratchpad>/gatemut-e1`). Gate: `grep -q pruneShimBuildByproducts` on the
   copied file found NOTHING — confirmed the correct (un-pruning) revision was
   fetched before building.
   Ran the scratch build — real `zig cc` compile, exit 0. Confirmed BOTH
   `steam_api.pdb` and `steam_api_shim.lib` present (not just the `.dll`) before
   continuing, so step 2 is a real transition and not a no-op over an
   already-empty directory.
   **S1** = `271d04d6bbe4afb3b445e5d47545efaa5bb9aaa4707ae7763df528bb4249c4d8`
2. WITHOUT recompiling, copied the CHANGED (current, committed) script into the
   SAME directory, and invoked ONLY the exported `pruneShimBuildByproducts('arm64')`
   via a small dedicated entry point (`meta/e1PruneOnly.ts`), run with
   `JEST_WORKER_ID=1` set — required, because `buildSteamBridgeShims.ts`'s own
   `if (!process.env.JEST_WORKER_ID) { main().catch(...) }` guard at the bottom of
   the module fires a full recompile on plain import otherwise, which would have
   silently contaminated E1's "no recompile between the hashes" premise. Confirmed
   the step-2 log contains no `zig cc` / `clang` / "Compile gate" line (the sole
   "compil" substring hit was the deliberate word "recompile" in this run's own
   console.log, not build activity).
   **S2** = `271d04d6bbe4afb3b445e5d47545efaa5bb9aaa4707ae7763df528bb4249c4d8`
3. `S1 === S2`: **TRUE**. Both byproducts — verified present at the end of step 1
   — are now gone (`steam_api.pdb` / `steam_api_shim.lib` both absent after the
   prune-only invocation).

E1 PASS — no compile happened between the two hashes, so `zig cc`'s wall-clock
stamping cannot confound this result; this is the empirical half of the P2 proof.

### P4 — masked rebuild comparison

```
$ python3 .planning/quick/260901-kl2-drop-steam-api-pdb-lib/maskPeVolatile.py \
    <scratchpad>/gatemut/public/bin/arm64/darwin/steam_api.dll \
    /Users/graysonmitchell/Projects/GameLib/public/bin/arm64/darwin/steam_api.dll
cc3e8b4a1fba55b9ab9cb69927b9c76d  masked-spans=[(128, 4), (208, 4), (729092, 4), (729120, 20)]  <scratchpad>/gatemut/.../steam_api.dll
cc3e8b4a1fba55b9ab9cb69927b9c76d  masked-spans=[(128, 4), (208, 4), (729092, 4), (729120, 20)]  .../public/bin/arm64/darwin/steam_api.dll
ALL MASKED HASHES EQUAL: True
```

Both sides at `cc3e8b4a1fba55b9ab9cb69927b9c76d`, exactly the expected value.
Same-basename precondition satisfied — both files were linked as `steam_api.dll`
(the CHANGED build's fresh scratch DLL from the blocking-checkpoint run above,
compared against the real shipped baseline). Spans masked, as printed by the
tool: COFF `TimeDateStamp` `(128,4)`, OptionalHeader `CheckSum` `(208,4)`, debug-directory
`TimeDateStamp` `(729092,4)`, RSDS GUID+Age `(729120,20)`.

P4 PASS.

### Mirror re-certification (real repo)

**Before** `pnpm exec vite build`:

```
$ pnpm check:build-bin-mirror
[check-build-bin-mirror] FAILED -- 3 issue(s):
  - only in build/bin (regular file): arm64/darwin/steam_api.pdb
  - only in build/bin (regular file): arm64/darwin/steam_api_shim.lib
  - apparent-byte total mismatch: build/bin=271544540, public/bin=268722717, delta=2821823
```

Expected failure, naming both stale byproducts in `build/bin` — evidence the gate
would have caught a half-done change (Task 1 committed without Task 2's mirror
step).

```
$ pnpm exec vite build
✓ built in 6.41s
[preserve-runner-symlinks] restored 12 symlink(s), skipped 0, rejected 0
[assemble-renderer-dist] assembled 79 bundle key(s) + static files into .../build/renderer
```

**After**:

```
$ pnpm check:build-bin-mirror
[check-build-bin-mirror] OK -- files: build=301 public=301, symlinks: build=12 public=12, apparent bytes: build=268722717 public=268722717 delta=0
```

`build/bin/arm64/darwin` census after: 277 files / 12 symlinks / 97,884,865 B —
identical to `public/bin/arm64/darwin`'s 277 files / 12 symlinks / 97,884,865 B.
`checkBuildBinMirror`'s anti-vacuity guard (`public/bin` >= 1 regular file) stays
satisfied at 301 regular files overall, well above its floor.

Mirror re-certification PASS.

### Test suites

`pnpm exec jest --config meta/jest.config.js`:

```
Test Suites: 34 passed, 34 total
Tests:       1 skipped, 702 passed, 703 total
```

`pnpm exec jest --config src/backend/jest.config.js` — first run showed a 4th
failure (`enrichmentFlows.test.ts`, `REQ-34.2-14` channel-registry assertion)
alongside the 3 known `decompressPool.test.ts` failures; re-ran the FULL suite a
second time and `enrichmentFlows.test.ts` passed cleanly with ONLY the 3 known
failures reproducing — consistent with this project's documented
full-suite-under-load flake pattern (unrelated to this change: `enrichmentFlows.test.ts`
exercises sidecar IPC channel registration, nothing touched by
`buildSteamBridgeShims.ts`). Second (clean) run:

```
Test Suites: 1 failed, 188 passed, 189 total
Tests:       3 failed, 2 skipped, 4386 passed, 4391 total
```

The 3 failures are exactly the known `decompressPool.test.ts` native-lzma
environment failures (`lzmaLoader ... loadLzmaModule() resolves an LzmaModule
whose decompressChunk output is byte-identical...`, `lzmaDecoderKind() reports
"native"...`, `setNativeLzmaDecodeEnabledForTests(true) overrides...`). The 2
skips are confirmed in `lzmaNativeSeaRealBuild.test.ts` (isolated re-run:
`Tests: 2 skipped, 1 passed, 3 total`) — both explicitly marked
"KNOWN FAILING ... do not un-skip without real fix". No regression from this
change in either suite.

### Task 2 summary

M1, M2, M3, E1, P4, and the mirror re-certification all PASS. Test suites green
apart from the 3 known `decompressPool.test.ts` failures and 2 known
`lzmaNativeSeaRealBuild.test.ts` skips (one transient, unrelated
`enrichmentFlows.test.ts` flake did not reproduce on re-run). `maskPeVolatile.py`
committed alongside this task's MEASUREMENTS.md update.
