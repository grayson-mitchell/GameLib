---
created: 2026-09-17T00:00:00.000Z
title: 'macOS notarization REJECTED (not merely untested): Apple returned Invalid on 253 unsigned Contents/Resources binaries Tauri never signs'
area: build
severity: critical
platform: macos
ready: code
needs: resign-resources-then-retag
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

Both are unanswered.

## Verification

A green build proves nothing here; the failing leg is the only thing that has ever exercised this
path. Verification is a fresh tag push reaching a notarization result of `Accepted`, plus
`codesign -dv --verbose=4`, `spctl -a -vvv -t install`, and `xcrun stapler validate` on the
published artifact.

## Related

- `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` — the parent macOS signing todo.
  This todo is its STATUS 2026-09-17 cross-link.
- `2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md` — sibling
  failure from the same run, unrelated cause.
- `2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md` — sibling
  failure from the same run, unrelated cause.
</content>
