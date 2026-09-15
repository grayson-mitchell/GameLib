---
created: 2026-09-14T00:00:00.000Z
title: 'Windows releases ship UNSIGNED — no Windows code-signing cert is enrolled, so SmartScreen warns on every download'
area: build
severity: major
platform: windows
ready: human
needs: certificate-purchase-then-verify
status: OPEN
found_by: 'Split from the macOS signing todo on 2026-09-14, after the Apple Developer Program purchase closed the macOS half. Windows needs a SEPARATE certificate that the Apple licence does not cover.'
source: '.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md (Direction step 5)'
files:
  - .github/workflows/release-tauri.yml
---

## Problem

`release-tauri.yml` implements a complete Windows signing path and has never been given
credentials. Measured against the live repo 2026-09-14 via `gh secret list -R
grayson-mitchell/GameLib`: the only secrets enrolled are the two Tauri **updater** keys and the
six **Apple** secrets added 2026-09-14. All three Windows secrets are absent:

- `WINDOWS_CERTIFICATE`
- `WINDOWS_CERTIFICATE_PASSWORD`
- `WINDOWS_CERT_THUMBPRINT`

`gh api repos/grayson-mitchell/GameLib/environments` returns `total_count: 0`, so there are no
environment-scoped secrets hiding either.

**Do not read the Apple enrolment as covering this.** An Apple Developer Program membership
signs macOS only. Windows requires a separate certificate from a commercial CA, and the
`TAURI_SIGNING_PRIVATE_KEY` pair signs the *update manifest*, not the executable — the same
name-similarity trap that made the macOS gap easy to misread as covered.

## Current behaviour

The workflow's Windows branch (around `release-tauri.yml:382`) requires all three secrets before
it emits a `--config` override carrying `certificateThumbprint`. Partial enrolment is already
handled with dedicated warnings naming the specific missing secret, and no branch calls
`exit 1` — per D-04 the job stays green on any secret combination, including none. So a
secrets-less run ships an unsigned `.exe`/NSIS installer and stays green.

## Why it matters

1. **SmartScreen.** An unsigned installer downloaded via a browser triggers "Windows protected
   your PC", where the continue affordance is behind **More info → Run anyway**. For a public
   launcher this is severe install friction on every install.
2. **Reputation does not transfer.** Even once signed, an OV certificate accumulates SmartScreen
   reputation slowly; an EV certificate gets it immediately but costs substantially more and
   generally requires a hardware token or cloud HSM, which complicates CI. Decide which before
   purchasing — this is the actual cost decision, not the signing mechanics.
3. **Windows is not the operator's primary OS**, hence `platform: windows` — verification needs
   that machine or a VM.

## Direction

1. Decide OV vs EV (see 2 above). This is the blocking decision, and it is a spend decision.
2. Obtain the certificate, export as `.p12`/`.pfx`, base64-encode it.
3. Enrol `WINDOWS_CERTIFICATE` (base64), `WINDOWS_CERTIFICATE_PASSWORD`, and
   `WINDOWS_CERT_THUMBPRINT` (SHA-1 thumbprint, no spaces).
4. No workflow edits are expected — but **do not take that on faith**: the macOS half of this
   split asserted "No code changes" and was measurably wrong, because the gap was in
   `tauri.macos.conf.json` rather than in the workflow. Check for a Windows analogue before
   concluding the same. A cloud-HSM/token EV setup in particular cannot use the
   `WINDOWS_CERTIFICATE` base64-`.p12` path at all and would need a different signing command.

## Verification — a green build proves nothing

The workflow is green today while shipping unsigned. Verify on the artifact, on Windows:

- `signtool verify /pa /v GameLib_setup.exe` — must report a valid chain to a trusted root.
- `Get-AuthenticodeSignature .\GameLib_setup.exe` — `Status` must be `Valid`, and
  `SignerCertificate.Subject` must name the expected organisation.
- Confirm the run log contains no `::warning::WINDOWS_CERTIFICATE` skip line.
- Download the published asset **through a browser** (not `curl`, which does not attach the
  zone-identifier mark-of-the-web) on a machine that has never built the app, and confirm no
  SmartScreen interstitial.

## Related

- `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` — the macOS half. Credentials
  enrolled and Apple-verified 2026-09-14; its remaining work is a release run plus artifact
  checks. Read its STATUS section before assuming this one needs no code changes.
- Memory `gate-failure-mechanisms` — the standing lesson that a green pipeline can certify a
  broken artifact, which is exactly what both halves of this split are.
