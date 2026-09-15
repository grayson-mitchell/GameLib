---
created: 2026-09-04T00:00:00.000Z
title: 'macOS releases ship UNSIGNED and un-notarized — no Apple signing secret is enrolled, so Gatekeeper quarantines every download and the Keychain ACL breaks on every update'
area: build
severity: major
platform: macos
ready: live-gate
needs: release-run-then-browser-download-verify
status: OPEN
found_by: 'Reconsideration of the two keyring-deferral todos, 2026-09-04 — asked "what actually governs Keychain prompt COUNT?" rather than "how do I implement this todo?"'
source: '.planning/todos/pending/2026-08-17-humble-slots-still-prompt-unattended-at-startup.md (park note, finding 2)'
files:
  - .github/workflows/release-tauri.yml
  - src-tauri/entitlements.plist
  - src-tauri/tauri.macos.conf.json
---

## STATUS 2026-09-14 — credentials DONE and Apple-verified; "No code changes" was FALSE

Apple Developer Program purchased 2026-09-14. **All six secrets are now enrolled** on
`grayson-mitchell/GameLib` — `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY` (04:57Z) and `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` (05:13Z).
Identity `Developer ID Application: grayson mitchell (S7U223QWXJ)` — **the CN is lowercase**;
enrol it byte-for-byte or it will not match at signing time. Team ID is derivable from the
cert CN parens and never needs to be asked for.

Credentials are verified *working*, not merely present:
`xcrun notarytool history --keychain-profile gamelib` → `No submission history.` — an
authenticated round-trip to Apple. A `gh secret list` proves only enrolment.

**Steps 1–4 of Direction below are DONE. Step 5 (Windows) is split out** to
`2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md`.

### The Direction's "No code changes" was measurably wrong (quick-260914-vbw)

Enrolling the certificate **armed a latent defect** rather than only fixing one. Signing
implies hardened runtime; hardened runtime without `com.apple.security.cs.allow-jit` denies
V8 its JIT code range; the sidecar is a Node SEA. A local signed build measured
`flags=0x10000(runtime)` on both the outer `.app` **and** `Contents/MacOS/gamelib-sidecar`,
with **no entitlements** attached. Running that real Developer-ID-signed sidecar:

```
exited rc=133  -> signal 5
# Fatal process out of memory: Failed to reserve virtual memory for CodeRange
```

So the next release would have shipped an app whose sidecar cannot start — while signing,
notarization and CI all reported success. Fixed in quick-260914-vbw by adding
`src-tauri/entitlements.plist` and wiring `bundle.macOS.entitlements` in
`src-tauri/tauri.macos.conf.json` (the **overlay**, not the base config — the base has no
`macOS` key at all).

**What remains is exactly the Verification section below**, which is why `ready:` is now
`live-gate` rather than `human`: no decision or credential is outstanding, only a release run
and an artifact check.

## Problem

`.github/workflows/release-tauri.yml` builds `macos-latest` / `aarch64-apple-darwin` and is
correctly written to sign + notarize — but **it has never been given credentials**, so every macOS
artifact it has ever produced is unsigned and un-notarized.

Measured against the live repo on 2026-09-04 via `gh secret list --repo grayson-mitchell/GameLib`.
Exactly two secrets are enrolled:

| Secret | Added |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | 2026-07-24 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 2026-07-24 |

**Those are the Tauri UPDATER keys, not Apple code signing.** They sign the update manifest so the
app trusts an update payload. They do nothing for Gatekeeper and nothing for the Keychain ACL. The
name similarity makes this very easy to misread as signing coverage — it is not.

Absent: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
`APPLE_PASSWORD`, `APPLE_TEAM_ID`. Also absent: `WINDOWS_CERTIFICATE`,
`WINDOWS_CERTIFICATE_PASSWORD`, `WINDOWS_CERT_THUMBPRINT`. `gh api repos/.../environments` returns
empty, so there are no environment-scoped secrets hiding either.

The workflow therefore takes its final branch (line ~268), sets `SIGNING_ENABLED=0`, and emits:

```
::warning::Signing skipped — no Apple cert secret set; shipping unsigned artifact
```

Notarization is then skipped **silently** — the `elif` at line ~276 only fires when at least one of
`APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` is set, and none are. So a secrets-less run produces
one warning, not two, and the missing notarization has no signal of its own.

A `v0.7.0` draft release exists (2026-08-28), so this is not hypothetical.

## Why it matters — three consequences, worst first

1. **Gatekeeper quarantine is the real blocker.** An unsigned, un-notarized `.app`/`.dmg`
   downloaded through a browser carries `com.apple.quarantine`. On current macOS the old
   right-click → Open bypass no longer clears it for unsigned apps — the user must go to
   System Settings → Privacy & Security → "Open Anyway", or run
   `xattr -dr com.apple.quarantine /Applications/GameLib.app`. For a public launcher this is
   severe install friction, and it hits **every** user on **every** install.
   [ASSUMED — the exact modern-macOS bypass UX should be confirmed on hardware before it is
   written into user-facing install docs; the quarantine itself is not in doubt.]
2. **Keychain ACL instability — this is the actual lever on prompt QUANTITY.** With no stable code
   identity, keychain items created by one build are not trusted by the next, so macOS re-prompts
   after every update. Same mechanism as the dev-mode pester
   (memory `keyring-timeout-races-keychain-approval`), just at release cadence instead of rebuild
   cadence. **This is what the two parked keyring-deferral todos were circling and never reached** —
   they proposed changing prompt *timing*; only signing changes prompt *count*.
3. **The updater is signed but the app is not.** Update payloads are integrity-checked via
   `TAURI_SIGNING_PRIVATE_KEY`, so that path is sound — but the app the updater installs is still
   unsigned as far as Gatekeeper is concerned. Do not let (3) being healthy imply (1) is.

## Direction

**~~No code changes.~~ SUPERSEDED 2026-09-14 — see the STATUS section above.** This claim was
wrong, and wrong in a load-bearing way: it was true of `release-tauri.yml` (which does implement
the full signing + notarization path and fails soft with a warning) but it was read as a claim
about the *repo*, and the entitlements gap in `src-tauri/tauri.macos.conf.json` was invisible to
it. Enrolling the cert armed a signal-5 sidecar crash. `release-tauri.yml` itself still needs no
edits — everything below about it holds.

1. ~~Apple Developer Program membership (~$99/yr)~~ — **DONE 2026-09-14.**
2. Create a **Developer ID Application** certificate (NOT "Mac App Distribution" — that is for the
   Mac App Store and will not satisfy Gatekeeper for direct download).
3. Export it as `.p12`, base64-encode it, and enrol:
   - `APPLE_CERTIFICATE` — base64 of the `.p12`
   - `APPLE_CERTIFICATE_PASSWORD` — the `.p12` export password
   - `APPLE_SIGNING_IDENTITY` — the certificate common name, e.g.
     `Developer ID Application: NAME (TEAMID)`
4. For notarization, enrol an app-specific password (appleid.apple.com, not the account password):
   - `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`
5. ~~Windows is in the same state~~ — **DECIDED 2026-09-14: split out.** Windows needs a separate
   certificate purchase that the Apple licence does not cover, so it tracks independently in
   `2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md`. The workflow's
   dedicated skip-warning step for it (D-04) is unchanged.

## Verification — do not accept a green build as proof

The workflow already passes today while shipping unsigned, so "the release job succeeded" proves
nothing here. This project has a standing lesson about exactly this shape
(memory `gate-failure-mechanisms`). Verify on the ARTIFACT:

- `codesign -dv --verbose=4 GameLib.app` — must name the Developer ID authority, not `adhoc`.
- `spctl -a -vvv -t install GameLib.app` — must report `accepted` / `source=Notarized Developer ID`.
- `xcrun stapler validate GameLib.app` — must confirm the notarization ticket is stapled.
- Download the published asset **through a browser** (not `curl`, which does not set the quarantine
  attribute) on a machine that has never built the app, and confirm it opens with no Gatekeeper
  interstitial.
- Confirm the run log contains NO `::warning::Signing skipped` line.

Only after that is the claim in consequence (2) testable: install release N, grant the Keychain
prompt once, update to release N+1, and confirm no re-prompt.

## Related

- Parked sibling: `2026-08-17-humble-slots-still-prompt-unattended-at-startup.md` — its park note's
  finding 2 is where this was found. That todo's remedy addressed prompt timing; this addresses
  prompt count.
- Parked sibling: `2026-08-17-keyring-available-is-a-silent-prompt-channel.md`
- ROADMAP Phase 999.1 (backlog) — cross-store signed-out/offline mode. This todo is **independent**
  of that phase and should not wait on it.
- Memory `keyring-timeout-races-keychain-approval` — the dev-side instance of the same
  unstable-code-identity mechanism.
