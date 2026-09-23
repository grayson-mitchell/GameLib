---
created: 2026-09-17T00:00:00.000Z
title: 'macOS notarization REJECTED (not merely untested): Apple returned Invalid on 253 unsigned Contents/Resources binaries Tauri never signs'
area: build
severity: minor
platform: macos
ready: live-gate
needs: quarantined-first-launch-and-sidecar-spawned-helper
status: completed
resolved: 2026-09-23
resolved_by: quick-260923-uvt
found_by: 'GitHub Actions run 35223308954 on grayson-mitchell/GameLib, triggered by the throwaway annotated tag v0.7.0-notarize-test1 at commit cc2d66248. The tag was deleted from origin and locally after the run.'
source: '.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md'
files:
  - .github/workflows/release-tauri.yml
  - src-tauri/tauri.macos.conf.json
---

## Problem

The macOS leg built and signed successfully, then FAILED at notarization. `severity: critical` was
correct when this was written on 2026-09-17, and is justified here rather than left bare:
this is a shipped claim that is false — the pipeline reports a signing path it does not actually
complete, and no macOS release can be published at all until it is fixed.

That ground was **discharged on 2026-09-23**, when Apple returned `Accepted` for submission
`e7ec58a5-acd7-4dad-9bee-fca7b2bea039` — see `### STATUS 2026-09-23 (quick-260923-p95)` below. The
pipeline now completes the signing path and Apple certifies the result, so the false-shipped-claim
ground is gone. What remains is whether a helper crashes at runtime under the hardened runtime with
no entitlements — a feature possibly broken, not a false shipped claim — so the file is now
`severity: major`.

Verbatim:

```
failed to bundle project: failed codesign application: failed to notarize app: Finished with status Invalid for id b55513c6-5b60-42bd-b69b-6e0dda7bab23 (Processing complete)
"status": "Invalid",
"statusSummary": "Archive contains critical validation errors",
```

## What Tauri actually signed

Tauri's signing pass signed EXACTLY these, in this order (verbatim from the log):

```
Signing .../bundle/macos/GameLib.app/Contents/MacOS/gamelib-sidecar
Signing .../bundle/macos/GameLib.app/Contents/MacOS/gamelib-shell
Signing .../bundle/macos/GameLib.app
Signing /var/folders/.../GameLib.zip
Notarizing .../bundle/macos/GameLib.app
```

It does NOT recurse into `Contents/Resources/`. That is the defect.

## The measured population

253 distinct rejected paths. 100% of them are under
`GameLib.zip/GameLib.app/Contents/Resources/build/bin/arm64/darwin/`.
ZERO rejected paths outside `Contents/Resources`. This zero is a measured grep result with an
empty output, not an assumption — the orchestrator explicitly grepped for paths not under
Contents/Resources and got an empty result.

Error-message instance counts (these count ISSUE INSTANCES, not distinct binaries):

```
506  "The signature does not include a secure timestamp."
500  "The binary is not signed with a valid Developer ID certificate."
 10  "The executable does not have the hardened runtime enabled."
  6  "The signature of the binary is invalid."
```

Issue instances grouped by top-level bundled helper:

```
394  legendary
390  nile      (includes its embedded Python 3.12 tree, e.g.
                nile/_internal/python3.12/lib-dynload/*.cpython-312-darwin.so —
                zlib, unicodedata, termios, syslog, select, resource, readline,
                pyexpat, mmap, math, grp, fcntl, binascii, array, _uuid, _struct,
                _statistics, _ssl, _socket, _sha3, _sha2, and more)
226  gogdl
  6  comet
  6  steam-bridge-helper
```

Both tables above are labelled as counting ISSUE INSTANCES, not distinct binaries — these numbers
do not sum to 253 (506+500+10+6=1022; 394+390+226+6+6=1022) and are not supposed to.

## The allow-jit fix is VINDICATED, and was NOT the failure

The Node SEA sidecar (`Contents/MacOS/gamelib-sidecar`) drew ZERO notarization complaints. The
`com.apple.security.cs.allow-jit` entitlement added in quick-260914-vbw HOLDS UP under a real
notarization attempt. It was NECESSARY and is NOT SUFFICIENT.

Record the wrong prediction honestly: the orchestrator had predicted the failure would be in the
sidecar's nested signing; that prediction was WRONG. The defect is in the Heroic-inherited runner
binaries instead. Do not overstate the prior fix in either direction.

## Why this was invisible until now

This was the FIRST tag push `release-tauri.yml` has ever completed. Its own header comment says
"UNPROVEN LIVE: this pipeline has never completed a real tag-push run". The defect is
pre-existing, not introduced by the tag or by commit cc2d66248.

## Direction

Every Mach-O under `Contents/Resources/` must be signed with the Developer ID identity,
`--options runtime`, and `--timestamp`, INNERMOST-FIRST, BEFORE Tauri signs the outer `.app` —
because signing the outer bundle first invalidates when inner contents change. Tauri v2 has no
built-in hook that recurses Resources, so this likely means a signing step in
`release-tauri.yml` between the sidecar build and `tauri-action`, or a `beforeBundleCommand`. Note
the nested `.so` files in nile's embedded Python are also Mach-O and need the same treatment.

Relevant config: `src-tauri/tauri.macos.conf.json` maps

```
"Resources/build/bin/arm64/darwin": "../build/bin/arm64/darwin"
```

which is what places these helpers inside `Contents/Resources/`.

## Open questions

- (a) Can these third-party binaries (legendary, nile, gogdl, comet, steam-bridge-helper, and
  nile's embedded Python 3.12 tree) be re-signed with our Developer ID at all?
- (b) Do any of them need their own entitlements?

Both are ANSWERED as of 2026-09-17 — see `## STATUS 2026-09-17 (quick-260917-uik)` below. Left
in place unedited as the questions the failed run actually raised.

## Verification

A green build proves nothing here; the failing leg is the only thing that has ever exercised this
path. Verification is a fresh tag push reaching a notarization result of `Accepted`, plus
`codesign -dv --verbose=4`, `spctl -a -vvv -t install`, and `xcrun stapler validate` on the
published artifact.

## STATUS 2026-09-17 (quick-260917-uik)

**The todo stays OPEN and stays in `pending/`.** A fix is WRITTEN. Nothing about it is VERIFIED.
Only a tag push reaching notarization `Accepted` can close it, and a helper launch under the
hardened runtime is needed on top of that.

`ready:` moved `code` → `live-gate`, and `needs:` moved `resign-resources-then-retag` →
`retag-and-confirm-notarization-accepted`, because that is now literally true: the desk work is
done and what remains needs a live run.

### What was built

- `meta/signMachOResources.ts` — magic-byte Mach-O detection (never by extension, never following
  symlinks) plus a deepest-first codesign driver with a `--dry-run` mode.
- `sign:macos-resources` package script, routed through `meta/runTs.cjs` like every sibling.
- One new macOS-only step in `.github/workflows/release-tauri.yml`, between
  "Prune non-frontend build intermediates before bundling" and `tauri-apps/tauri-action@v1`.
- `src/backend/__tests__/signMachOResources.test.ts` (33 tests) and a new parsed-YAML block in
  `src/backend/__tests__/releaseWorkflow.test.ts`.

### Open question (a) — ANSWERED: YES, they can be re-signed

Measured 2026-09-17 with `codesign -dv --verbose=4` against the local
`build/bin/arm64/darwin` tree, not inferred:

```
legendary/legendary                                          flags=0x2(adhoc)        Signature=adhoc
comet                                                        flags=0x20002(adhoc,linker-signed)
legendary/_internal/charset_normalizer/cd.cpython-312-darwin.so  flags=0x2(adhoc)
```

Every one of the 253 carries an **ad-hoc** signature. An ad-hoc signature carries no team identity,
no entitlements, and no Developer ID — so there is no third-party seal being destroyed and no
"re-signing invalidates someone else's signature" hazard. `codesign --force` replaces it cleanly;
`--force` is REQUIRED, because the files already bear a signature and codesign refuses without it.

Also measured: `find build/bin/arm64/darwin -name _CodeSignature` returns **EMPTY**. PyInstaller
signed each Mach-O individually and never sealed the three `Python.framework` bundles. So the
remedy is per-file and never a bundle seal — which also sidesteps the fact that a `CodeResources`
seal hashes the bundle's symlink layout, and the fate of this tree's 12 symlinks under Tauri's
`bundle.macOS.files` copy is unverified. An embedded per-file signature lives in the Mach-O's own
`LC_CODE_SIGNATURE` load command, so it survives any byte-preserving copy regardless.

`--deep` is prohibited: Apple deprecates it for signing, it applies the OUTER entitlements to
nested content, and it would seal exactly those `Python.framework` bundles.

### Open question (b) — ANSWERED: NO entitlements, deliberately

**Entitlements are not a notarization input at all.** Apple's four verbatim complaints were
missing secure timestamp (506), not signed with a valid Developer ID certificate (500), hardened
runtime not enabled (10), invalid signature (6). Those map 1:1 onto `--timestamp`,
`--sign "$IDENTITY"`, `--options runtime`, and "sign it properly". Not one of them is about an
entitlement. Adding `allow-jit` or `disable-library-validation` would not change the notarization
verdict by one line.

- `disable-library-validation` is unnecessary: library validation rejects loading code signed by a
  DIFFERENT Team ID, and all 253 get the SAME Developer ID. legendary/nile/gogdl loading their own
  `libssl.3.dylib`, `Python.framework/Versions/3.12/Python` and `*.cpython-312-darwin.so` are
  same-team loads.
- CPython 3.12 has no JIT. The copy-and-patch JIT is 3.13+ and opt-in at build time.

**The residual risk is a RUNTIME question that a notarization `Accepted` cannot answer.** The
plausible remaining need is libffi/ctypes closure allocation wanting `MAP_JIT`, which would need
`com.apple.security.cs.allow-jit` on that one specific helper. A signed, notarized, never-launched
helper is exactly the shape of a green check proving nothing. The designated remedy is the
**empty** `HELPER_ENTITLEMENTS` map in `meta/signMachOResources.ts` — it ships empty on purpose,
and adding an entry requires an OBSERVED crash, not a hunch. This repo's own history is the
argument: the sidecar's `allow-jit` was added for a PREDICTED failure that turned out not to be the
failure.

`src-tauri/entitlements.plist` was **not modified** — `git diff --exit-code src-tauri/entitlements.plist`
is clean. The sidecar's `allow-jit` is intact, and that file is never passed to a helper codesign
call. Passing it would be a silent grant of JIT to 253 binaries not shown to need it.

**CORRECTION, dated 2026-09-23 (quick-260923-q6w) — stated as a correction, not quietly patched.**
The enumeration above ("legendary/nile/gogdl loading their own `libssl.3.dylib`,
`Python.framework/Versions/3.12/Python` and `*.cpython-312-darwin.so` are same-team loads") was
CORRECT, and remains correct today — none of those three needs an entitlement. It MISSED that
`steam-bridge-helper` dlopens a THIRD-PARTY dylib belonging to Valve
(`libsteam_api.dylib`), loaded out of the user's installed Steam client: not one of the 253, not
in our tree at all, never our Team ID, and unreachable by any amount of signing our own files. The
"all 253 get the SAME Team ID" premise the enumeration rested on was true for the files it
enumerated and false for the one case it did not consider. See
`### STATUS 2026-09-23 (quick-260923-q6w)` below for the observed crash and the proven remedy.

### Placement decision

Signing happens at the **SOURCE path** (`build/bin/arm64/darwin` in the runner workspace), in a
workflow step immediately before `tauri-action`. Three candidates were considered:

| Candidate | Verdict |
|---|---|
| Reach into `Contents/Resources` mid-bundle | **Impossible.** The `.app` does not exist until the bundler runs, and `tauri-action` exposes no hook between "copy resources" and "sign the app". |
| `beforeBundleCommand` | **Rejected.** It fires at the same moment relative to the copy as a pre-`tauri-action` workflow step, so it buys nothing — and it costs: it would fire on the Linux and Windows legs, and on every local `tauri build` where no Developer ID exists. The conditional-enrolment logic already lives in the workflow. |
| Sign at the source path | **Picked.** The "innermost-first, before Tauri signs the outer `.app`" ordering is satisfied BY CONSTRUCTION — everything is signed before a bundle exists at all. It is also the only option that is desk-testable. |

### The measured population

`find build/bin/arm64/darwin -type f -print0 | xargs -0 file | grep -c Mach-O` returns **253**, out
of 277 regular files. Apple rejected **253** distinct paths. The detector selects the IDENTICAL
253-path set (compared as a set with `diff`, not merely by count) and zero of the 24 non-Mach-O
files.

**This number is a 2026-09-17 observation at the current helper versions and is deliberately NOT
pinned in any gate.** Pinning it would rot the first time `downloadHelperBinaries` bumps a helper.
The committed tests run against a synthetic `mkdtemp` fixture instead.

### NOTHING HERE IS VERIFIED

Stated verbatim, because a green local run and a green CI build both prove nothing about this
defect:

1. **Whether the step's throwaway keychain coexists with Tauri's own keychain handling** — the
   highest risk in the change. At that point in the job the Developer ID cert is in no keychain
   (Tauri does its own `security import` later, during `tauri build`), so the step creates one and
   tears it down in a trap. A collision fails the macOS leg loudly at `tauri build`, which is a
   BETTER failure than the current one, but it is still a failure only a real run can reveal.
   **OBSERVED WORKING as of 2026-09-23**, run 35808881023: Tauri's own signing pass succeeded right
   after the step's keychain teardown, with no collision — see
   `### STATUS 2026-09-23 (quick-260923-np3)` below for the evidence.
2. **Whether the signature survives Tauri's `bundle.macOS.files` copy into `Contents/Resources`** —
   argued from how Mach-O signatures are stored (in the file, not an xattr, not a sidecar).
   **CONFIRMED**, dated 2026-09-23, citing submission `e7ec58a5-acd7-4dad-9bee-fca7b2bea039`. This is
   **DIRECT** evidence, not an inference from "Apple accepted, so the signatures must have been
   intact" — the notarization ticket enumerates all 253 by their in-bundle paths with per-file
   cdhashes, so Apple verified them where they sit inside the `.app`. The argument from how Mach-O
   signatures are stored is now corroborated by measurement, superseding the earlier note that run
   35808881023's bundle step was not evidence for this hazard — the ticket is the evidence that note
   said did not exist. See `### STATUS 2026-09-23 (quick-260923-p95)` below for the ticket detail.
3. **Whether notarization returns `Accepted`.** **CONFIRMED**, dated 2026-09-23, same submission
   `e7ec58a5-acd7-4dad-9bee-fca7b2bea039`: `statusSummary: "Ready for distribution"`,
   `statusCode: 0`, `issues: None`. See `### STATUS 2026-09-23 (quick-260923-p95)` below.
4. **Whether any helper crashes at runtime under the hardened runtime with no entitlements.**
   **OBSERVED, and remedied for exactly one helper.** See
   `### STATUS 2026-09-23 (quick-260923-q6w)` below for the method, the per-helper result table,
   the verbatim cause, all three controls, and what remains NOT VERIFIED.

### The only real verification

**Before pushing any tag: a throwaway tag is NOT side-effect-free.** `tauri-action` is configured
`tagName: v__VERSION__`, which resolves from `tauri.conf.json`'s version to `v0.7.0` — not from the
tag that triggered the run. Every test tag therefore writes into the one real `v0.7.0` draft release
(id `378785323`); that is how run 35808881023 came to overwrite `latest.json` with a macOS-less
manifest, recorded in `### STATUS 2026-09-23 (quick-260923-np3)` below. The honest bound: nothing is
live while the release stays a draft, because `promote-updater-feed.yml` fires only on
`release: types: [published]`. But a draft release is not findable via `releases/tags/<tag>` (that
404s) — you must list `repos/<owner>/<repo>/releases` and match `.draft==true`.

Push a fresh throwaway tag. Then, in order:

```
# 1. the run itself
#    notarization result must read Accepted, not Invalid

# 2. on the DOWNLOADED published artifact, not on a local build
codesign -dv --verbose=4 GameLib.app
spctl -a -vvv -t install GameLib.app
xcrun stapler validate GameLib.app

# 3. spot-check the population that was rejected -- expect
#    "Authority=Developer ID Application" and flags=0x10000(runtime), NOT adhoc
codesign -dv --verbose=4 GameLib.app/Contents/Resources/build/bin/arm64/darwin/legendary/legendary
codesign -dv --verbose=4 GameLib.app/Contents/Resources/build/bin/arm64/darwin/nile/_internal/Python.framework/Versions/3.12/Python
codesign -dv --verbose=4 GameLib.app/Contents/Resources/build/bin/arm64/darwin/comet

# 4. count SURVIVORS -- FILES, and Mach-O only. This must be 0.
#    NOTE: bash/zsh only -- `done < <(...)` is process substitution, not POSIX sh.
#    Do NOT use the old one-liner form
#    (`find ... | xargs -0 -n1 codesign -dv 2>&1 | grep -c 'adhoc|not signed'`):
#    it counts LINES not FILES (~2x inflated) and never reaches 0 because every
#    non-Mach-O resource reports "not signed at all" forever. See the
#    2026-09-23 sub-section below for the measurement.
root=GameLib.app/Contents/Resources; n=0
while IFS= read -r -d '' f; do
  file -b "$f" | grep -q 'Mach-O' || continue
  if codesign -dv "$f" 2>&1 | grep -qE 'adhoc|code object is not signed'; then
    n=$((n + 1)); printf 'SURVIVOR %s\n' "$f"
  fi
done < <(find "$root" -type f -print0)
echo "survivors=$n"     # must be 0

# 5. step 4 is a CONTROL trap and needs BOTH directions, run BEFORE trusting a zero.
#    POSITIVE: point the SAME loop at the untouched local helper tree
#      build/bin/arm64/darwin, which is 100% ad-hoc. It must report 253
#      (measured 2026-09-23). A single-file control is NOT enough: one ad-hoc
#      file returns 2 under the OLD pipeline, not 1, and one file can never
#      expose the non-Mach-O contamination at all.
#    NEGATIVE: point the SAME loop at a scratch dir holding Apple-signed
#      /bin/ls and /bin/cat PLUS one plain text file. It must report 0
#      (measured 2026-09-23). The text file is the part that matters -- it
#      proves the Mach-O restriction actually suppresses the non-Mach-O noise.

# 6. LAUNCH the app and actually invoke each helper once (an Epic login via legendary,
#    an Amazon library refresh via nile, a GOG action via gogdl). This is the only thing
#    that tests the no-entitlements decision.
```

**Step 6 is not optional and is not covered by steps 1-5.** Step 5 is not optional either: this
task already caught one positive control passing for the wrong reason (BSD `head -n -1` is illegal,
so the control list was empty and `diff` reported a difference that proved nothing). As of
2026-09-23 it has now caught a SECOND one -- step 4's own former control, which would not have
caught either of step 4's two defects -- which is why step 5 now demands BOTH a positive and a
negative control rather than a single-file check. See `### STATUS 2026-09-23 (quick-260923-ihw)`
below for the record.

### STATUS 2026-09-23 (quick-260923-ihw) — step 4 of that recipe was unachievable by construction

This sub-section does NOT revise `## STATUS 2026-09-17 (quick-260917-uik)` above. That section
records what was believed then and is left intact; this one adds what was measured today.

Step 4 of `### The only real verification`, as originally written, could never reach its own
stated pass condition of zero. Measured today, before this correction was written, against the
real local helper tree `build/bin/arm64/darwin` — the same tree the CI step signs, and the correct
tree to use as a positive control because it is 100% ad-hoc-signed and untouched by any fix:

**1. The todo's step-4 command, run VERBATIM, returns 530. Not 253.**

**2. The 530 breaks down exactly:**

| component      | count   | what it is                                                                                |
| --------------- | ------- | ------------------------------------------------------------------------------------------ |
| adhoc lines     | 506     | 253 Mach-O files x TWO matching lines each: a `flags=0x2(adhoc)` line AND a `Signature=adhoc` line |
| unsigned lines  | 24      | the 24 non-Mach-O regular files, each emitting "code object is not signed at all"          |
| **total**       | **530** |                                                                                              |

Out of 277 regular files in the tree: 253 Mach-O, 24 non-Mach-O.

**3. Two independent defects follow, both real, both present in the original recipe:**

- **(a) `grep -c` counts LINES, not FILES.** The count is inflated roughly 2x for the population it
  is supposed to measure.
- **(b) The command does not restrict to Mach-O, so the pass condition is unreachable by construction.**
  Every non-Mach-O resource reports "code object is not signed at all" FOREVER —
  after a perfect signing run just as much as before it, because the signer deliberately and
  correctly never touches non-Mach-O files. This is WORSE in the real app than in this subtree: the
  recipe runs over the whole `GameLib.app/Contents/Resources`, which holds the entire non-Mach-O
  frontend bundle, so a correct, fully-notarized app would report a large positive number and read
  as a FAILURE.
- **(c) Step 5's old control would NOT have caught either defect.** A single ad-hoc file returns
  **2** under the old pipeline, not 1, and a single-file control can never expose the non-Mach-O
  contamination at all. This is the SAME SHAPE this todo already documents once — the BSD
  `head -n -1` control (see `## STATUS 2026-09-17`) that passed for the wrong reason. It is now the
  second instance of that shape in this same todo, which is why step 5 now demands a negative
  control as well as a positive one, not a single-file check.

**4. The controls run on the corrected form, both exact, both measured 2026-09-23:**

- **POSITIVE** — the corrected loop, pointed at the untouched, all-ad-hoc
  `build/bin/arm64/darwin`, returns **253**. Exactly the population Apple rejected. The todo's own
  original form returns 530 on this same tree.
- **NEGATIVE** — the corrected loop, pointed at a directory holding Apple-signed `/bin/ls` and
  `/bin/cat` plus one plain text file, returns **0**. This is the control the original recipe
  lacked entirely: it proves the loop CAN report zero, so a zero from the real run is not just a
  broken pipeline. The plain text file is the part that matters — it proves the Mach-O restriction
  actually suppresses the non-Mach-O noise, not merely that the loop runs.

**5. The detector was independently re-measured at HEAD today, 2026-09-23, and still holds:**

`build/bin/arm64/darwin` still holds 277 regular files, 253 Mach-O — unchanged from the 2026-09-17
measurement. `pnpm sign:macos-resources -- --dir build/bin/arm64/darwin --keychain ... --identity
FAKE --dry-run` still reports "would sign 253 file(s)", and its selection is the IDENTICAL SET to a
`file -b`-derived ground truth — compared as a SET with `diff` over two sorted path lists, which
produced EMPTY output, not merely by count. The 2026-09-17 claim about the detector still holds at
HEAD. `meta/signMachOResources.ts` was NOT edited as part of this correction: the defect was in
this todo's verification prose only, never in the signer.

**6. Nothing about the live gate changed.** The tag push has NOT happened. No throwaway tag exists
locally or on origin. The live gate is entirely unrun. Every item under `### NOTHING HERE IS
VERIFIED` above is still UNOBSERVED, including notarization returning `Accepted`. This change
corrected a recipe; it verified nothing. The todo stays OPEN, stays in `pending/`, and
`ready: live-gate` / `needs: retag-and-confirm-notarization-accepted` are unchanged.

### STATUS 2026-09-23 (quick-260923-np3) — the live gate ran; inconclusive on the headline question

This sub-section does NOT revise `## STATUS 2026-09-17 (quick-260917-uik)` or
`### STATUS 2026-09-23 (quick-260923-ihw)` above. Both record what was believed then and are left
intact; this one adds what was measured today, from the first tag-push run this todo's own recipe
has ever driven.

**Run identity.** Run 35808881023, workflow `release-tauri.yml`, annotated tag
`v0.7.0-notarize-test2` at commit 77f3b4388, pushed by the operator by hand. macOS job id
107015694390. Cancelled by hand at 2h14m. All timestamps UTC, verbatim from the downloaded job log.

**1. The helper-signing step ran and passed — its first live execution.** Step 18, "Sign every
Mach-O in the macOS helper tree before bundling": `02:07:49` -> `02:08:20`, conclusion success, 31
seconds for the whole tree.

**2. Hazard 1 is now OBSERVED WORKING — the keychain does not collide.** After step 18 created and
tore down its throwaway keychain, Tauri's own signing pass succeeded. Verbatim: `02:13:01`
`found cert "***" with organization "grayson mitchell"`; then `Signing` of
`Contents/MacOS/gamelib-sidecar`, `Contents/MacOS/gamelib-shell`, `GameLib.app` and (at `02:13:17`)
`GameLib.zip` — each `replacing existing signature`. No `security import` failure, no
`errSecInternalComponent`, no collision. The trap-based teardown left clean state.

**3. Hazards 2, 3 and 4 remain unobserved.** Hazard 2 (signature surviving Tauri's
`bundle.macOS.files` copy into `Contents/Resources`): still unobserved — the `.app` was bundled,
but no artifact was ever published or downloaded, so nothing was inspected. "The bundle step
succeeded" is NOT evidence for it. Hazard 3 (notarization returns `Accepted`): still unobserved,
see next. Hazard 4 (a helper crashing at runtime under the hardened runtime with no entitlements):
still unobserved, untouched, still requires step 6 of the recipe.

**4. Notarization was submitted and Apple never answered.** `02:13:17` `Notarizing
.../GameLib.app`, then 2h05m37s of complete silence, then `04:18:54` `##[error]The operation was
canceled.` and `04:18:55` `Terminate orphan process: pid (39170) (notarytool)`. Not `Invalid`, not
`Accepted` — no verdict at all. Contrast the previous failed run 35223308954 (2026-09-17), where
Apple returned `Invalid` in 62 seconds. The build was NOT the slow part: `Built application` at
`02:13:00`, i.e. 4m40s from step start on a warm `swatinem/rust-cache`; the Linux leg's whole
`tauri-action` step took 4m53s.

**5. Cause of the unbounded wait, and the fix already shipped.** `release-tauri.yml` had no
`timeout-minutes` anywhere, so it ran against GitHub's 360-minute default. `tauri-bundler`
hardcodes `--wait` on its `xcrun notarytool submit` call and exposes neither a timeout flag nor an
env var (`xcrun notarytool submit --timeout` exists, but we do not own that argv; upstream PR
`tauri-apps/tauri#13521` added `--no-wait`, not a timeout). Quick task 260923-mrx (commits
`f83b237cc`, `dad059ef2`, `f17d46cff`) shipped `timeout-minutes: 60` on the `tauri-action` step plus
a macOS-only `if: failure()` step running `xcrun notarytool history`, so a future timeout is
self-explaining inside the run. That bound is itself unproven live — no run has hit it.

**6. New hazard in this todo's own verification procedure.** `tauri-action` is configured
`tagName: v__VERSION__`, which resolves from `tauri.conf.json`'s version to `v0.7.0` — not from the
tag that triggered the run. So every test tag writes into the one real `v0.7.0` draft release (id
`378785323`). Measured after this run: `GameLib_0.7.0_aarch64.dmg` and `GameLib_0.7.0_x64.dmg`
untouched at 2026-08-28, while `GameLib_0.7.0_amd64.AppImage`, its `.sig` and `latest.json` were all
overwritten at 2026-09-23T02:10:24-26Z by the Linux leg, which succeeded at 02:10:27. `latest.json`
now reads `platforms: ['linux-x86_64', 'linux-x86_64-appimage']` — macOS is gone, replaced by a
Linux-only manifest from a run whose macOS leg never finished. Bound this honestly: nothing is live,
because the release is still a draft and `promote-updater-feed.yml` fires only on
`release: types: [published]`. But publishing that draft as-is would promote a feed with no macOS
entry. Also: a draft is not findable via `releases/tags/<tag>` (that 404s) — you must list
`repos/<owner>/<repo>/releases` and match `.draft==true`.

**7. Cleanup still owed.** The tag `v0.7.0-notarize-test2` is still on origin as of this writing
(re-checked with `git ls-remote --tags origin`), unlike `v0.7.0-notarize-test1`, which this todo's
own `found_by` records as deleted after its run.

**8. The decisive open question.** `xcrun notarytool history` has not been run. No Apple
credentials exist on this Mac — `security find-generic-password -s "com.apple.gke.notary.tool"`
returns "The specified item could not be found in the keychain", and no `APPLE_*` env vars are set;
the credentials live only as GitHub Actions secrets, whose values cannot be read back. So whether
the 2026-09-23T02:13 submission ended `Accepted`, `In Progress` or `Invalid` is unknown. That single
fact is what would tell us whether the 253-binary signing fix actually worked.

**Bottom line: inconclusive on the headline question.** No verdict is not a pass. The todo stays
OPEN, stays in `pending/`, and `ready: live-gate` / `needs: retag-and-confirm-notarization-accepted`
are unchanged, because the gate ran but did not answer.

### STATUS 2026-09-23 (quick-260923-p95) — Apple ACCEPTED the submission

This sub-section does NOT revise `## STATUS 2026-09-17 (quick-260917-uik)`,
`### STATUS 2026-09-23 (quick-260923-ihw)`, or `### STATUS 2026-09-23 (quick-260923-np3)` above.
Each records what was believed then and is left intact; this one adds what was measured today.

**1. How the verdict was finally obtained.** `xcrun notarytool history --keychain-profile gamelib`
was run for the first time, because Apple notarization credentials were stored on this Mac for the
first time. The Team ID `S7U223QWXJ` was recovered from `security find-identity -v -p codesigning`
and matches the CI log's `organization "grayson mitchell"`. This directly answers np3 item 8, which
recorded that no Apple credentials existed on this Mac.

**2. The verdict, with the cross-check.**

```
createdDate: 2026-09-23T02:13:22.426Z  id: e7ec58a5-acd7-4dad-9bee-fca7b2bea039  name: GameLib.zip  status: Accepted
createdDate: 2026-09-17T12:56:42.401Z  id: b55513c6-5b60-42bd-b69b-6e0dda7bab23  name: GameLib.zip  status: Invalid
```

The `Invalid` id above is byte-identical to the one quoted verbatim in this todo's own
`## Problem` section — the same two runs, not a coincidence of dates.

**3. The parsed ticket.** `xcrun notarytool log e7ec58a5-acd7-4dad-9bee-fca7b2bea039`:
`status: Accepted`, `statusSummary: "Ready for distribution"`, `statusCode: 0`, `issues: None`,
`uploadDate: 2026-09-23T02:13:27.920Z`,
`sha256: e95d65456458b89c9f1c289fe18da4cd028d63353e4cc1bb3fa7785fb81eab68`,
`ticketContents: 257 entries`, of which 253 are under `Contents/Resources` across 253 DISTINCT
paths: legendary 98 · nile 97 · gogdl 56 · comet 1 · steam-bridge-helper 1 = 253. Three
independent counts now agree on 253: Apple's 2026-09-17 rejection set, the local tree's Mach-O
census (recorded above, both 2026-09-17 and 2026-09-23), and Apple's notarization ticket.

**4. What this settles.** Hazard 3 is answered outright: `Accepted`. Hazard 2 is confirmed by
**direct** evidence — the ticket enumerates all 253 by their in-bundle paths with per-file
cdhashes, so Apple verified them where they sit inside the `.app`. That is stronger than the weak
inference "Apple accepted, so the signatures must have been intact", and it corroborates by
measurement the argument the uik section made from how Mach-O signatures are stored. Hazard 1 was
already OBSERVED WORKING via np3 and is unchanged.

**5. What this does NOT settle.**

- Hazard 4 is untouched and still **UNOBSERVED**. An `Accepted` verdict says nothing about a
  helper crashing at runtime under the hardened runtime with no entitlements. Recipe step 6 is
  still owed and is still the only thing that tests the no-entitlements decision.
- Recipe steps 2–5 were never run — `codesign -dv --verbose=4`, `spctl`, `xcrun stapler validate`,
  and the survivor count — because no artifact was ever published or downloaded; the run was
  cancelled before stapling and upload. `Accepted` is stronger evidence than steps 2–5 would be
  for the signing question, but they were not performed.
- Stapling never happened.

**6. The open risk to the 60-minute bound shipped by quick-260923-mrx.** Apple's API exposes
`uploadDate` but no `completedDate`, so it is impossible to tell which of these is true: (a) Apple
genuinely took longer than the 2h05m37s that elapsed before the manual cancel, in which case
`timeout-minutes: 60` is too tight and will kill legitimate runs; or (b) Apple finished quickly and
`notarytool`'s wait was what hung, in which case 60 is fine. `tauri-bundler` swallows notarytool's
progress output, so the job log has nothing between `Notarizing` and the cancel. The 60 was sized
on BUILD headroom, not on any notarization measurement, and the macOS-only `if: failure()` step
running `xcrun notarytool history` makes the next timeout self-diagnosing inside the run. The
workflow is not changed here; the risk is recorded only.

**7. Triage movement.** `severity` moved `critical` → `major` and `needs` moved
`retag-and-confirm-notarization-accepted` → `launch-helpers-under-hardened-runtime`: the `critical`
ground (a false shipped claim) is discharged, and what remains (a possibly-broken helper) is
`major`. `ready: live-gate`, `platform: macos` and `status: OPEN` are unchanged. The todo stays
OPEN and stays in `pending/`, because hazard 4 and recipe step 6 remain.

**8. Cleanup: one DISCHARGED, one still owed.** np3 items 6 and 7 each recorded a piece of
cleanup. They have since diverged, and this item is the correction — an earlier draft of this
section carried BOTH forward as still-owed, which was false for the tag by the time it was
written.

- **DISCHARGED 2026-09-23 — the throwaway tag.** `v0.7.0-notarize-test2` was deleted from origin
  and locally. `git push origin :refs/tags/v0.7.0-notarize-test2` reported
  `- [deleted]  v0.7.0-notarize-test2`; `git tag -d` reported
  `Deleted tag 'v0.7.0-notarize-test2' (was 88acab90a)`. Verified by re-query afterwards, not by
  the commands' own output: `git ls-remote --tags origin` and `git for-each-ref refs/tags` both
  return nothing matching `notarize`. Note np3's item 7 said "still on origin **as of this
  writing**" — that was TRUE when written and is correctly scoped as history; do not "fix" it.
- **STILL OWED — the updater manifest.** `latest.json` in the `v0.7.0` draft release remains
  macOS-less, reading `platforms: ['linux-x86_64', 'linux-x86_64-appimage']`. Deleting the tag
  did NOT undo this, because `tagName: v__VERSION__` pointed the run at the real `v0.7.0` release
  rather than at the tag. **That draft must not be published until a complete run regenerates the
  manifest** — publishing it as-is would promote an updater feed with no macOS entry at all.

### STATUS 2026-09-23 (quick-260923-q6w) — hazard 4 OBSERVED, and remedied for exactly one helper

This sub-section does NOT revise `## STATUS 2026-09-17 (quick-260917-uik)`,
`### STATUS 2026-09-23 (quick-260923-ihw)`, `### STATUS 2026-09-23 (quick-260923-np3)`, or
`### STATUS 2026-09-23 (quick-260923-p95)` above. Each records what was believed then and is left
intact; this one adds what was measured today.

**`needs:` moved** `launch-helpers-under-hardened-runtime` ->
`notarize-and-run-steam-bridge-helper-with-disable-library-validation`. The old value described a
gate that has now been run; the new one names what is actually left: notarizing a build that
carries this entitlement, and exercising the helper from inside the real `.app`. `severity: major`,
`platform: macos`, `ready: live-gate` and `status: OPEN` are unchanged.

**1. Method.** `ditto`'d `build/bin/arm64/darwin` to a scratchpad copy — the real tree was never
touched. Signed the copy through the PRODUCTION script `pnpm sign:macos-resources`, with the login
keychain and the real Developer ID identity: `signed 253/253` in 74s. Then executed each helper.

**2. Per-helper result table.**

| helper               | invocation                          | result                                             |
| --------------------- | ------------------------------------ | --------------------------------------------------- |
| `legendary`            | `--version`, `status`                | OK (rc=0; `status` exercises network/`_ssl`)         |
| `gogdl`                 | `--version`, `auth`                  | OK (rc=0)                                            |
| `nile`                  | `--version`                          | OK                                                   |
| `comet`                 | `--help`                             | OK                                                   |
| `steam-bridge-helper`   | (launch)                             | **FATAL** `dlopen`, dies before `SteamAPI_Init`      |

**3. The verbatim cause.** `steam-bridge-helper` reports: "code signature ... not valid for use in
process: mapping process and mapped file (non-platform) have **different Team IDs**". The failing
path resolves inside the user's installed `Steam.AppBundle` — the dylib is Valve's, not ours.

**4. All three controls.**

- **(1) A/B, same binary, same real profile, only the signature differing.** Ad-hoc
  `flags=0x20002(adhoc,linker-signed)` loads Valve's dylib and reaches `SteamAPI_Init()` (failing
  there only because Steam isn't running locally, a normal condition). Developer ID +
  `flags=0x10000(runtime)` with no entitlement dies at `dlopen`.
- **(2) The Python helpers fail IDENTICALLY signed and unsigned.** `legendary list --json` and
  `nile library list` both rc=1 with the same PyInstaller unhandled-exception tail in both variants
  (no auth configured in a fresh profile); `gogdl auth` rc=0 in both. So the hardened runtime is
  NOT implicated for the three Python helpers — this is why they get no `HELPER_ENTITLEMENTS`
  entry.
- **(3) The remedy was PROVEN, not assumed.** Re-signing only `steam-bridge-helper` with the new
  one-key `meta/steam-bridge-helper.entitlements.plist` keeps `flags=0x10000(runtime)` and the
  Developer ID authority intact, shows the entitlement under `codesign -d --entitlements -`, and
  the binary then reaches `SteamAPI_Init()` — exactly like the ad-hoc control in (1).

**5. Open question (b) corrected, not quietly patched.** See the `CORRECTION, dated 2026-09-23
(quick-260923-q6w)` paragraph inside `### Open question (b)` above: the original enumeration was
correct for legendary/nile/gogdl and missed that `steam-bridge-helper` dlopens a THIRD-PARTY dylib
belonging to Valve, never our Team ID.

**6. Methodological note — CLAUDE.md's two-profile rule earning its keep.** Under an isolated fake
`HOME`, this defect presents as a *missing-file* `dlopen` error, because Steam is not installed in
a fresh profile — a shape that reads like a harmless test artifact, not a security-relevant crash.
Only the real-profile arm exposed the actual cause: a genuine Team ID mismatch against an installed
third-party dylib. This is exactly the direction CLAUDE.md's two-profile rule warns about: isolation
is necessary for most runs, but a defect can exist that arms ONLY under a populated profile, and
an isolated-only gate would have stayed green against it forever.

**7. `--options runtime` was KEPT on `steam-bridge-helper`, deliberately.** Dropping it would also
fix the `dlopen` — but it would get the build REJECTED at notarization, which is where this whole
thread began (see `## Problem` above). The entitlement grant is the correct remedy; removing the
hardened runtime is not an option that was ever on the table.

**8. What remains NOT VERIFIED.**

- **(i) Whether Apple notarizes a binary carrying `disable-library-validation`.** It is permitted
  for Developer ID distribution, but permitted is not observed — and this todo's entire history is
  about exactly that distinction.
- **(ii) Whether the helper works from inside the real notarized `.app`**, as opposed to a locally
  re-signed scratchpad copy. Recipe step 6 (launching each helper from inside the app) is still
  owed, now against a build carrying this entitlement.

**Bottom line.** Hazard 4 moves from UNOBSERVED to OBSERVED-and-remedied for exactly one helper.
The todo stays OPEN, stays in `pending/`, and the two items in (8) are what the next live gate
must answer.

### STATUS 2026-09-23 (quick-260923-u3o) — the live gate RAN; recipe steps 2-6 all pass

This sub-section does NOT revise `## STATUS 2026-09-17 (quick-260917-uik)`,
`### STATUS 2026-09-23 (quick-260923-ihw)`, `### STATUS 2026-09-23 (quick-260923-np3)`,
`### STATUS 2026-09-23 (quick-260923-p95)`, or `### STATUS 2026-09-23 (quick-260923-q6w)` above.
Each records what was believed then and is left intact; this one adds what was measured today.

**`severity:` moved** `major` -> `minor`, and **`needs:` moved**
`notarize-and-run-steam-bridge-helper-with-disable-library-validation` ->
`quarantined-first-launch-and-sidecar-spawned-helper`. The old value named a gate that has now
been run; the new one names what is genuinely left. Both moves are justified in item 9 below.
`platform: macos`, `ready: live-gate` and `status: OPEN` are unchanged. The todo stays OPEN and
stays in `pending/`.

**1. The run.** Tag `v0.7.0-notarize-test3` at commit `c946239ce`; GitHub Actions run
`35841476015`. The macOS job `107117309605` ran on `macos-latest` targeting
`aarch64-apple-darwin`: **success**, 13m50s. The Linux job: success. The Windows job: **failure**
at step 5 `install-deps`, with:

```
tar: gogdl/_internal/Python: Cannot create symlink to 'Python.framework/Versions/3.12/Python': No such file or directory
```

then `Error: tar extraction failed (exit 2)`. That cause belongs to the separate pending todo
`2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md` and is NOT adopted into
this todo. It is, however, the ONLY reason the overall run reads `failure` — a reader who sees the
red run and stops there will draw the wrong conclusion about macOS.

| step | conclusion | duration |
| --- | --- | --- |
| 18. Sign every Mach-O in the macOS helper tree before bundling | success | 0:00:23 |
| 19. Run tauri-apps/tauri-action@v1 | success | 0:08:32 |
| 20. Diagnose a notarization timeout (diagnostic only, never fails the job) | skipped | — |

**2. Notarization Accepted, and the app was stapled.** Verbatim from the job log:

```
2026-09-23T09:21:59Z Notarizing /Users/runner/work/GameLib/GameLib/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/GameLib.app
2026-09-23T09:23:08Z Notarizing Finished with status Accepted for id 0f65332c-56c8-484d-822a-13163bc14ddb (Processing complete)
2026-09-23T09:23:08Z Stapling app...
```

Submission id `0f65332c-56c8-484d-822a-13163bc14ddb`, elapsed 1m09s, and then `Stapling app...` —
stapling, which p95 item 5 recorded as never having happened, now happened. Cross-check:
`grep -c 'Notarizing'` over the job log returns 2, i.e. those are exactly the two such lines in
the whole job, so nothing about the verdict is being read out of context.

**A NOTE that a later reader must not misread.** The string
`::warning::Apple notarization credentials are set but signing is not fully configured; skipping
notarization` DOES appear in this job log. It is NOT an emitted annotation — it is the step's own
SCRIPT SOURCE being echoed by the runner, carrying the cyan `[36;1m` prefix the runner uses when
it echoes a script it is about to execute. The only real `##[warning]` in the whole macOS job is
the Node.js 20 deprecation notice. This is written down deliberately, because it is exactly the
kind of line a later session greps out of a log, reads as "notarization was skipped", and then
reopens a discharged question over. Do not cite that echo as evidence that notarization was
skipped: it was not.

**3. The CI signing path ran green for the first time.** Step 18, "Sign every Mach-O in the macOS
helper tree before bundling", conclusion success, 23 seconds. That was the third of the three
items q6w listed as NOT VERIFIED. What carries it, stated honestly: step 18's own log was NOT
separately read. What is being relied on is its exit status, plus item 6's per-binary evidence
that the binaries in the PUBLISHED artifact are Developer-ID-signed under the hardened runtime and
that the survivor count over all 253 is 0. That is an inference from the output of the step rather
than an inspection of the step, and it should not be recorded as a log inspection.

**4. The 60-minute bound was never approached — one datapoint, and it does not settle p95 item 6.**
Step 19 (`tauri-apps/tauri-action@v1`) took 8m32s end to end, of which notarization was 1m09s,
against the `timeout-minutes: 60` shipped by quick-260923-mrx. Frame this exactly as EVIDENCE and
no further: it is ONE datapoint, on a DIFFERENT submission from np3's. It SUPPORTS — it does not
prove — the reading that np3's 2h05m37s of silence was `notarytool`'s wait rather than Apple being
slow. It does NOT settle p95 item 6, because Apple still exposes `uploadDate` and no
`completedDate`, so for THAT submission the two candidate explanations remain formally
indistinguishable. Related: step 20, the macOS-only `if: failure()` `xcrun notarytool history`
diagnostic, shows `skipped` — it never fired, so that diagnostic remains itself unproven live.

**5. Recipe steps 2, 4 and 5, against the DOWNLOADED artifact.** The artifact is
`GameLib_0.7.0_aarch64.dmg`, 97083599 bytes, from draft release `378785323`, sha256
`c74717b59421119eaacce55c51ff153222c9e03296f87d817ed422423dba669c`. `xattr -l` on it showed
`com.apple.diskimages.recentcksum` and `com.apple.provenance` only — **no
`com.apple.quarantine`**, because it was fetched via the GitHub API rather than a browser. That
absence is not cosmetic; see item 8(a), where it is what bounds this whole exercise.

Step 2, verbatim:

```
Authority=Developer ID Application: grayson mitchell (S7U223QWXJ)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
CodeDirectory v=20500 size=26621 flags=0x10000(runtime) hashes=821+7 location=embedded
Timestamp=23 Sep 2026 at 9:21:45 PM
Notarization Ticket=stapled
TeamIdentifier=S7U223QWXJ
Sealed Resources version=2 rules=13 files=514
```

```
GameLib.app: accepted
source=Notarized Developer ID
origin=Developer ID Application: grayson mitchell (S7U223QWXJ)
SPCTL_RC=0
```

```
Processing: .../GameLib.app
The validate action worked!
STAPLER_RC=0
```

Steps 4 and 5, the survivor count. The loop used was this todo's OWN step-4 loop, unmodified,
saved as a `.sh` and invoked by path — not retyped and not adjusted.

| target | result |
| --- | --- |
| NEGATIVE control: scratch dir, Apple-signed `/bin/ls` + `/bin/cat` + one plain text file | `files=3 mach-o=2 survivors=0` |
| POSITIVE control: untouched local ad-hoc `build/bin/arm64/darwin` | `files=277 mach-o=253 survivors=253` |
| REAL: notarized bundle's `Contents/Resources` | `files=501 mach-o=253 survivors=0` |

**BOTH controls were run BEFORE the real count**, which is the whole point of step 5 and is stated
here rather than left implied: the negative control returned `survivors=0` on a scratch dir and
the positive control returned `survivors=253` on the untouched ad-hoc tree, and only then did the
real bundle return `files=501 mach-o=253 survivors=0`. A `survivors=0` from a loop that has not
first been shown capable of returning a non-zero number is a green check proving nothing.

**6. Recipe step 3, and the ANSWER to q6w item 8(i).** All four helper binaries in the published
bundle carry `Authority=Developer ID Application: grayson mitchell (S7U223QWXJ)`,
`flags=0x10000(runtime)`, `TeamIdentifier=S7U223QWXJ`, and are timestamped.

| binary (under Contents/Resources/build/bin/arm64/darwin) | entitlements |
| --- | --- |
| `legendary/legendary` | none |
| `nile/_internal/Python.framework/Versions/3.12/Python` | none |
| `comet` | none |
| `steam-bridge-helper` | exactly one: `com.apple.security.cs.disable-library-validation` |

**This ANSWERS q6w item 8(i).** Apple notarized AND stapled a bundle carrying
`disable-library-validation`. q6w wrote of that entitlement that "it is permitted for Developer ID
distribution, but permitted is not observed — and this todo's entire history is about exactly that
distinction." It is now OBSERVED, in a published artifact, with the ticket stapled to it. The
distinction q6w was careful to preserve is discharged by measurement rather than by argument.

**7. Recipe step 6 — the `dlopen` crash is gone in the published build.** The bundle was `ditto`'d
off the read-only dmg, and everything below ran on that copy.

```
codesign --verify --deep --strict --verbose=2 GameLib.app
  GameLib.app: valid on disk
  GameLib.app: satisfies its Designated Requirement
  rc=0
```

The helper's single entitlement is still present after the copy. On this machine
`libsteam_api.dylib` resolves at
`~/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/Frameworks/Steam Helper.app/Contents/MacOS/libsteam_api.dylib`.
`steam-bridge-helper`, run from inside the copied notarized bundle:

```
[S_API FAIL] SteamAPI_Init() failed; ipcserver GetSteamPath failed.
[S_API] SteamAPI_Init(): SteamAPI_IsSteamRunning() did not locate a running instance of Steam.
[S_API] SteamAPI_Init(): Could not determine Steam client install directory.
[2026-09-23T09:35:21Z] INIT   InitFlat failed r=1 err=Could not determine Steam client install directory. (is Steam running + signed in?) -- serving HEALTH only until a real session is live
[2026-09-23T09:35:21Z] LISTEN 127.0.0.1:54550 (loopback-only, persistent-channel)
```

It was still alive when killed at 10s. **THE REASONING, which is the load-bearing part.** Those
`[S_API]` lines are emitted BY Valve's dylib. Their presence therefore proves that `dlopen`
SUCCEEDED: the process got far enough to be running Valve's code, reached `SteamAPI_Init()`, and
failed there only because Steam is not running — which is the normal condition on this machine and
is identical to q6w's ad-hoc control (1). The Team ID mismatch that killed the helper in q6w is
gone. Note per CLAUDE.md's two-profile rule that this was the deliberate real-profile arm: the
defect under test arms only under a populated profile, since a fresh fake `HOME` has no Steam
installed and the same failure presents there as a harmless missing-file error.

The other three helpers, from inside the same notarized bundle: `legendary --version` rc=0
(`legendary version "0.21.0", codename "Lowlife"`), `gogdl --version` rc=0 (`1.3.0`),
`nile --version` rc=0 (`1.2.0 Robert Speedwagon`), `comet --help` rc=0. The app itself was
launched from the copied bundle with `open -n`: `gamelib-shell` and `gamelib-sidecar` were both
alive and stable at 5/10/15/20/25/30s, with no matching entries in
`~/Library/Logs/DiagnosticReports`. `spctl -a -vvv -t exec` on the copy: `accepted`,
`source=Notarized Developer ID`, rc=0.

**8. What step 6 did NOT cover.** Three residuals, stated without softening, because the value of
the above depends on not overstating it:

- **(a) The real first-launch Gatekeeper flow was NEVER exercised.** There was no
  `com.apple.quarantine` xattr on the dmg, because it was fetched via the GitHub API rather than a
  browser. `spctl -t exec` is an assessment performed on request; it is not the quarantined
  first-launch dialog a real user meets. Nothing here tests that flow.
- **(b) `steam-bridge-helper` was never spawned BY the sidecar.** Steam was not running, so the
  app never needed it. What is proven is direct exec from inside the bundle — which is what item 7
  claims and no more.
- **(c) Step 6's in-app invocations were NOT performed** — Epic login via legendary, Amazon
  library refresh via nile, a GOG action via gogdl. They need credentials and a human.

Residuals (a) and (b) are what the new `needs: quarantined-first-launch-and-sidecar-spawned-helper`
names. (c) is real but is a human-gated errand rather than a defect risk.

**9. Triage movement, and the ground under the title.** `severity` moves `major` -> `minor`,
justified in CLAUDE.md's OWN vocabulary rather than by feel. `major` is defined there as "a feature
is broken or a measurement is silently contaminated" — and the feature in question, a signed,
notarized, stapled macOS build whose helpers actually run, is now MEASURED WORKING in the published
artifact. What remains is two unverified arms with no known defect behind either, which is exactly
`minor`: "polish, rough edge, or a latent trap with no live consequence". `ready: live-gate` is
unchanged, because those residuals still need a live run to close. `platform: macos` and
`status: OPEN` are unchanged.

Every clause of this todo's TITLE is now measured false as a live condition. "macOS notarization
REJECTED (not merely untested)" — Apple returned Accepted. "Apple returned Invalid on 253 unsigned
Contents/Resources binaries Tauri never signs" — the survivor count over those same 253 is 0 in the
published artifact. The title is retained as the historical record of why this todo exists; it is
no longer a description of the world. RECOMMENDED: a later session closes this todo and moves it to
`completed/`, once item 8's residuals are carried into a todo of their own.

**This session does NOT move the file and does NOT change `status:`.** Closure is out of scope for
a recording task and is the operator's call.

**10. Cleanup owed.** Tag `v0.7.0-notarize-test3` is still on origin and locally **as of this
writing**. It is scoped with that phrase deliberately, the way np3 item 7 scoped its equivalent —
p95 item 8 records that np3's "still on origin as of this writing" was TRUE when written, is
correctly scoped as history, and must not be "fixed". Writing this the same way means a later
section can discharge it the same way np3's was discharged: by addition, in new text, rather than
by editing this one.

**The updater manifest — EXTRACTED, not restated.** p95 item 8 recorded the macOS-less
`latest.json` as "STILL OWED", pending a complete run. The macOS leg of run `35841476015` WAS
complete — Accepted, stapled, dmg uploaded — and the manifest still gained no macOS entry, so
re-running can never fix it. That defect does not belong to this todo and has been extracted to
`2026-09-23-macos-updater-manifest-can-never-gain-a-macos-entry-bundle-targets-omits-app.md`,
which carries the measurement and the correction. p95 item 8 is NOT edited: it is correct as a
record of what was believed then.

**Bottom line.** The live gate this todo has been waiting for since 2026-09-17 has now run, and
the whole chain holds end to end: Apple Accepted and stapled, the published artifact has zero
unsigned survivors among its 253 Mach-O files, and `steam-bridge-helper` loads Valve's dylib from
inside the notarized bundle. What is left is two unverified arms — quarantined first launch, and a
sidecar-spawned helper — neither of which has a known defect behind it.

## CLOSED 2026-09-23 (quick-260923-uvt) — discharged, residuals carried out first

This section does NOT revise anything above it. The evidence for this closure is already in this
file: **see `### STATUS 2026-09-23 (quick-260923-u3o)`**, which is pointed at rather than restated
here — its tables are not duplicated.

**What discharged this todo: every clause of its TITLE is measured false as a LIVE condition.**

- "macOS notarization REJECTED (not merely untested)" — Apple returned `Accepted` for submission
  `0f65332c-56c8-484d-822a-13163bc14ddb` in 1m09s, and then stapled the app.
- "Apple returned Invalid on 253 unsigned Contents/Resources binaries Tauri never signs" — the
  survivor count over those same 253, in the PUBLISHED artifact, is `files=501 mach-o=253
  survivors=0`. **Both controls were run FIRST**: the negative control returned `survivors=0` and
  the positive control returned `survivors=253`, so the zero came from a loop already shown capable
  of returning a non-zero number.

All four helper binaries in the published bundle carry
`Authority=Developer ID Application: grayson mitchell (S7U223QWXJ)` under `flags=0x10000(runtime)`,
and `steam-bridge-helper` reaches `SteamAPI_Init()` from inside the notarized bundle.

**Where every residual went — named, with paths. Nothing was discarded by this move.**

| residual | destination |
| --- | --- |
| (a) quarantined first launch | `.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` — its existing `needs: release-run-then-browser-download-verify` already named this arm and needed no change |
| (b) `steam-bridge-helper` never spawned BY the sidecar | `.planning/todos/pending/2026-09-23-steam-bridge-helper-never-spawned-by-the-sidecar-only-direct-exec-proven.md` — new, `severity: minor`, `ready: live-gate` |
| (c) recipe step 6's in-app invocations (Epic via `legendary`, Amazon via `nile`, GOG via `gogdl`) | the same parent `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`, item 5 of its uvt STATUS section |
| the 60-minute `timeout-minutes` bound (u3o item 4 / p95 item 6) | the same parent `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`, item 6 of its uvt STATUS section |

quick-260923-uvt **considered and rejected** giving (c) and the 60-minute bound each their own
file. (c) is a live-gate errand against a published artifact, structurally identical to the parent
todo's browser-download bullet, and splitting one sitting across two todos helps no one. The
60-minute bound belongs to quick-260923-mrx's change rather than to this signing defect, and with
1m09s measured against a 60-minute bound the headroom is ~52x — `minor` under CLAUDE.md's
vocabulary, where a new `major` file would be inflation.

**Item 10's cleanup is discharged BY ADDITION, here, without editing item 10.** Measured
2026-09-23 by quick-260923-uvt: `git ls-remote --tags origin` and `git for-each-ref refs/tags` both
return nothing matching `notarize`, so tag `v0.7.0-notarize-test3` is gone from origin AND locally.
Item 10's "still on origin and locally **as of this writing**" was TRUE when written and is
correctly scoped as history — p95 item 8 sets that precedent explicitly and says not to "fix" it,
so it has not been touched.

**The bound on this closure, stated so it cannot be over-read.** Closing this file does NOT mean
macOS signing is finished. It means THIS defect — Apple rejecting 253 unsigned binaries under
`Contents/Resources` — is discharged, and its residuals have moved to files that are still open.
The parent `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` remains **OPEN**, with the
browser-download arm genuinely outstanding.

## Related

- `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` — the parent macOS signing todo.
  This todo is its STATUS 2026-09-17 cross-link.
- `2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md` — sibling
  failure from the same run, unrelated cause.
- `2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md` — sibling
  failure from the same run, unrelated cause.
- **CLOSED:** the Linux sibling above is verified by run 35808881023 (Linux job
  `107015694055`, `ubuntu-24.04`, success at 02:10:27) and is now
  `.planning/todos/completed/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md`.
