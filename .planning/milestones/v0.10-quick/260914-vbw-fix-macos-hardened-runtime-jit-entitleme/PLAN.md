---
quick_id: 260914-vbw
slug: fix-macos-hardened-runtime-jit-entitleme
created: 2026-09-14
title: 'macOS hardened-runtime JIT entitlement, plus the signing todo corrections it forces'
---

# Quick Task 260914-vbw

## Why this exists

Apple Developer Program membership was purchased 2026-09-14 and all six Apple secrets were
enrolled on `grayson-mitchell/GameLib` and verified against Apple's notary service
(`xcrun notarytool history --keychain-profile gamelib` → "No submission history.", an
authenticated round-trip).

That enrolment **armed a latent defect rather than only fixing one.** Signing implies
hardened runtime; hardened runtime without `com.apple.security.cs.allow-jit` denies V8 its
JIT code range; the sidecar is a Node SEA. Before enrolment, macOS releases were unsigned,
nothing applied hardened runtime, and the sidecar started fine.

## Measured evidence

Local signed build (`APPLE_SIGNING_IDENTITY` set, notarization skipped), app recovered from
the DMG because `tauri build` deletes `bundle/macos/GameLib.app` as its last step:

| surface | flags | authority | entitlements |
| --- | --- | --- | --- |
| outer `GameLib.app` | `0x10000(runtime)` | Developer ID → Apple Root CA | — |
| `Contents/MacOS/gamelib-sidecar` | `0x10000(runtime)` | Developer ID → Apple Root CA | **none** |

Running that **real Developer-ID-signed** sidecar under a fake HOME, stdin closed:

```
exited rc=133  -> signal 5
# Fatal process out of memory: Failed to reserve virtual memory for CodeRange
  2: v8::base::FatalOOM(...)  [.../Signed.app/Contents/MacOS/gamelib-sidecar]
```

Two-arm ad-hoc control on the same binary, one variable apart:

- `codesign -s - --options runtime`, no entitlements → signal 5, same CodeRange message
- `codesign -s - --options runtime --entitlements` (allow-jit only) → alive at 12s

`spctl -a -vvv -t install` → `rejected / source=Unnotarized Developer ID`, correct for a
local build with notarization skipped, and a useful negative control for the real thing.

## Tasks

1. **`src-tauri/entitlements.plist`** (new) — `com.apple.security.cs.allow-jit` only.
   `allow-unsigned-executable-memory` and `disable-library-validation` deliberately omitted:
   only allow-jit was measured as necessary.
2. **`src-tauri/tauri.macos.conf.json`** — add `bundle.macOS.entitlements`. This file, NOT
   the base `tauri.conf.json`: the base config has no `macOS` key at all, and
   `packagingConfig.test.ts:97` records that only the macOS overlay declares that block.
3. **Correct the signing todo** — its `ready: human` / `needs: credentials-then-verify`
   frontmatter is stale, and its Direction section says **"No code changes"**, which this
   task measures as false.
4. **File a Windows signing todo** — split per decision; needs a separate cert purchase that
   the Apple licence does not cover.

## Traps hit while doing this — all three were self-inflicted and all three looked like results

1. **`plutil -lint` is NOT sufficient for an entitlements plist.** The first version of
   `entitlements.plist` carried an XML comment block explaining the rationale. `plutil -lint`
   returned `OK`; codesign rejected it outright:
   `Failed to parse entitlements: AMFIUnserializeXML: syntax error near line 22`, failing the
   whole bundle step. **AMFI's parser does not accept XML comments.** Keep entitlements plists
   comment-free and put the rationale here instead. Verify with codesign, not `plutil`.
2. **`tauri build | tail -20` reports exit 0 when the build FAILS.** The pipeline's status is
   `tail`'s. The log said `failed to bundle project: failed codesign application` and
   `[exited with code 0]` on the same screen. Never pipe a build whose exit code you intend to
   trust; redirect and read `$?`.
3. **A failed build leaves the PREVIOUS DMG in `bundle/dmg/`, and it signs and tests exactly
   like a real result.** Because of trap 2 the failure was invisible, so the previous build's
   DMG was recovered and its missing entitlements were read as "the fix does not work" — a
   false negative against a correct change. **Delete the DMG before rebuilding**; then absence
   is unambiguous evidence of failure rather than a stale artifact posing as a verdict.

## Verification

- `plutil -lint` on the plist, plus `PlistBuddy` for the key. NOTE:
  `plutil -extract com.apple.security.cs.allow-jit` **cannot** verify this key — `-extract`
  treats `.` as a keypath separator. Use `plutil -p` or `PlistBuddy`. The first attempt here
  failed for exactly that reason and the plist was fine. Neither tool substitutes for codesign
  (see trap 1).
- When asserting an entitlement is ABSENT, run the known-good binary as a **control** through
  the same command first. `codesign -d --entitlements -` printing nothing is only meaningful if
  it prints the key for a binary that has it.
- Signed rebuild → confirm `allow-jit` is present on `Contents/MacOS/gamelib-sidecar` and
  the sidecar reaches a **clean exit**, not merely "no crash at 12s". Cold boots here run
  27–39s, so a 12s survival is weaker evidence than it looks.
- `packagingConfig.test.ts` + `tauriConf.test.ts` (overlay pins), `pnpm planning-gates`
  (todo frontmatter vocabulary), prettier.

## Out of scope

Final Gatekeeper proof. It needs a published release downloaded **through a browser** on a
machine that never built the app — `curl` does not set `com.apple.quarantine`, so it cannot
test what users hit. Operator-gated; `codesign`/`spctl`/`stapler` on a local build cannot
substitute.
