---
created: 2026-09-04T00:00:00.000Z
title: 'macOS releases ship UNSIGNED and un-notarized — no Apple signing secret is enrolled, so Gatekeeper quarantines every download and the Keychain ACL breaks on every update'
area: build
severity: major
needs: credentials-then-verify
status: OPEN
found_by: 'Reconsideration of the two keyring-deferral todos, 2026-09-04 — asked "what actually governs Keychain prompt COUNT?" rather than "how do I implement this todo?"'
source: '.planning/todos/pending/2026-08-17-humble-slots-still-prompt-unattended-at-startup.md (park note, finding 2)'
files:
  - .github/workflows/release-tauri.yml
---

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

**No code changes.** `release-tauri.yml` already implements the full signing + notarization path and
already fails soft with a warning rather than shipping something silently broken. It needs
credentials, not edits.

1. Apple Developer Program membership (~$99/yr) if not already held.
2. Create a **Developer ID Application** certificate (NOT "Mac App Distribution" — that is for the
   Mac App Store and will not satisfy Gatekeeper for direct download).
3. Export it as `.p12`, base64-encode it, and enrol:
   - `APPLE_CERTIFICATE` — base64 of the `.p12`
   - `APPLE_CERTIFICATE_PASSWORD` — the `.p12` export password
   - `APPLE_SIGNING_IDENTITY` — the certificate common name, e.g.
     `Developer ID Application: NAME (TEAMID)`
4. For notarization, enrol an app-specific password (appleid.apple.com, not the account password):
   - `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`
5. Windows is in the same state (`WINDOWS_CERTIFICATE` et al. absent) — decide separately whether
   it is in scope; the workflow has a dedicated skip-warning step for it (D-04).

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
