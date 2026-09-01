# 260901-kl2 Measurements — BLOCKED at Task 1 Step 1

Status: the plan's own primary safety gate (Task 1, Step 1 — "MEASURE the premise
before writing any code") was executed exactly as written and **failed**. Per the
plan's explicit instruction, execution stopped there: no code was changed, no test
was added, no commit was made. This file records what was measured.

## What the plan required

> Run `pnpm build-steam-bridge` on the tree exactly as it stands, then
> `shasum -a 256 public/bin/arm64/darwin/steam_api.dll`.
> - If it equals `2da072ba8fc455e9afc3dcce73ac631d0075f35deb3f19cd34b521c725f1d960`,
>   the same-path rebuild is reproducible ... proceed.
> - If it does NOT equal that value, STOP and report.

## Baseline (pre-existing, before any rebuild this session)

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

## Step 1 result: REPRODUCIBILITY PREMISE REFUTED

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

### Root cause identified (diagnostic only — not a fix, not applied to the repo)

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

### Byproduct sizes (unchanged, informational — matches plan's stated figures)

```
steam_api.pdb      = 2,818,048 B
steam_api_shim.lib = 4,160 B
```

## Repo state after this session

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

## What this means for the plan

The plan's forced choice of Approach (A) — post-build unlink — rests on the premise
that a same-path rebuild reproduces `steam_api.dll` byte-for-byte, so that
"before" and "after" trees can be diffed to prove the byproduct removal is inert.
That premise does not hold on this machine with this toolchain: **the DLL is not
byte-reproducible even with zero code change**, because `zig cc -shared`'s LLD
backend embeds a wall-clock `TimeDateStamp` (not pinned by any flag currently
passed) and a second non-deterministic field in the debug directory that survives
even `SOURCE_DATE_EPOCH`.

This is not a defect introduced by this plan and nothing in `meta/buildSteamBridgeShims.ts`
was changed to cause it — it is a pre-existing property of the toolchain invocation
that the plan's safety argument depends on and that was not true when re-measured.

Re-deciding the approach needs a developer decision, not an autonomous fix, because
the options change the plan's core safety argument:
- Accept that same-path rebuilds are inherently non-reproducible and find a
  different way to prove inertness (e.g. diff the DLL's actual code/data sections
  while ignoring the known-volatile `TimeDateStamp` + debug-directory bytes,
  rather than requiring whole-file sha equality).
- Add linker flags that pin both the timestamp and the debug-directory content
  (if `zig cc`/`lld` exposes one — not investigated further here, out of scope for
  an autonomous stop-and-report).
- Treat the currently-committed `steam_api.dll` as the one-and-only artifact and
  never rebuild it as part of this change (i.e. do not run `pnpm build-steam-bridge`
  at all in Task 1 — just unlink the byproducts from the existing tree). This
  sidesteps the whole reproducibility question but changes what Task 1's "before
  rebuild / after rebuild" comparison actually proves.

No further tasks were attempted. See `260901-kl2-SUMMARY.md`.
