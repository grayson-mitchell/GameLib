---
created: 2026-09-17T00:00:00.000Z
title: 'macOS notarization REJECTED (not merely untested): Apple returned Invalid on 253 unsigned Contents/Resources binaries Tauri never signs'
area: build
severity: critical
platform: macos
ready: live-gate
needs: retag-and-confirm-notarization-accepted
status: OPEN
found_by: 'GitHub Actions run 35223308954 on grayson-mitchell/GameLib, triggered by the throwaway annotated tag v0.7.0-notarize-test1 at commit cc2d66248. The tag was deleted from origin and locally after the run.'
source: '.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md'
files:
  - .github/workflows/release-tauri.yml
  - src-tauri/tauri.macos.conf.json
---

## Problem

The macOS leg built and signed successfully, then FAILED at notarization. `severity: critical` is
correct and is justified here rather than left bare: this is a shipped claim that is false — the
pipeline reports a signing path it does not actually complete, and no macOS release can be
published at all until it is fixed.

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
   UNOBSERVED.
2. **Whether the signature survives Tauri's `bundle.macOS.files` copy into `Contents/Resources`** —
   argued from how Mach-O signatures are stored (in the file, not an xattr, not a sidecar).
   UNOBSERVED.
3. **Whether notarization returns `Accepted`.** UNOBSERVED.
4. **Whether any helper crashes at runtime under the hardened runtime with no entitlements.**
   UNOBSERVED, and a notarization `Accepted` says NOTHING about it.

### The only real verification

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

# 4. count survivors -- this must be ZERO
find GameLib.app/Contents/Resources -type f -print0 | xargs -0 -n1 codesign -dv 2>&1 \
  | grep -c 'adhoc\|code object is not signed'

# 5. step 4 above is a POSITIVE-CONTROL trap: run it against a known-adhoc file first
#    and confirm it reports 1, or a zero from a broken pipeline reads as success

# 6. LAUNCH the app and actually invoke each helper once (an Epic login via legendary,
#    an Amazon library refresh via nile, a GOG action via gogdl). This is the only thing
#    that tests the no-entitlements decision.
```

**Step 6 is not optional and is not covered by steps 1-5.** Step 5 is not optional either: this
task already caught one positive control passing for the wrong reason (BSD `head -n -1` is illegal,
so the control list was empty and `diff` reported a difference that proved nothing).

## Related

- `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` — the parent macOS signing todo.
  This todo is its STATUS 2026-09-17 cross-link.
- `2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md` — sibling
  failure from the same run, unrelated cause.
- `2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md` — sibling
  failure from the same run, unrelated cause.
</content>
