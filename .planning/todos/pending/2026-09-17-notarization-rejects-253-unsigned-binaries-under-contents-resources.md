---
created: 2026-09-17T00:00:00.000Z
title: 'macOS notarization REJECTED (not merely untested): Apple returned Invalid on 253 unsigned Contents/Resources binaries Tauri never signs'
area: build
severity: major
platform: macos
ready: live-gate
needs: launch-helpers-under-hardened-runtime
status: OPEN
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
   UNOBSERVED, and a notarization `Accepted` says NOTHING about it.

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

**8. Cleanup still owed, carried forward.** np3 item 7 recorded that the tag
`v0.7.0-notarize-test2` is still on origin, and np3 item 6 recorded that `latest.json` in the
`v0.7.0` draft release was overwritten with a macOS-less manifest. Neither was addressed by this
task; both are carried forward as still-owed rather than letting an `Accepted` verdict bury them.

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
