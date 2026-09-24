---
created: 2026-09-14T00:00:00.000Z
title: 'Windows releases ship UNSIGNED — no Windows code-signing cert is enrolled, so SmartScreen warns on every download'
area: build
severity: major
platform: windows
ready: human
needs: signpath-foundation-application-then-verify
status: OPEN
found_by: 'Split from the macOS signing todo on 2026-09-14, after the Apple Developer Program purchase closed the macOS half. Windows needs a SEPARATE certificate that the Apple licence does not cover.'
source: '.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md (Direction step 5)'
files:
  - .github/workflows/release-tauri.yml
---

## STATUS 2026-09-24 (quick 260924-pm3)

This section does not revise `## Problem` or `## Current behaviour` below it — both stay true as
history of what was measured and believed on 2026-09-14. It adds the operator's 2026-09-24 decision
and four findings measured that day.

**Operator decision.** Pursue SignPath Foundation — free OV-level code signing for qualifying
open-source projects, delivered through a managed signing pipeline. The operator is an individual
developer outside the USA and Canada, which independently rules out Azure Artifact Signing, whose
individual tier is limited to the USA and Canada. Fallback if SignPath declines: a traditional OV
certificate from a commercial CA.

**Finding 1 — the todo's own blocking decision is obsolete.** "Why it matters" item 2 says an EV
certificate "gets it immediately" and calls OV-vs-EV "the actual cost decision". Microsoft's
code-signing-options doc
(https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options, ms.date
2026-08-29) states that EV's instant-SmartScreen-bypass "behavior was removed in 2024", that
EV-signed files "now go through the same reputation-building process as OV certificates", and that
paying the EV premium solely to avoid SmartScreen is "no longer justified"; its comparison table
marks OV and EV identically for SmartScreen. So Direction step 1 as originally written has no
correct answer — the real decision is which ISSUER, not which validation tier. The consequence that
governs expectations: NO option buys instant SmartScreen trust. Reputation accrues per consistent
publisher identity across releases, so the FIRST signed release will still warn. Signing is worth
doing for that accrual and for the publisher name appearing in the prompt — not as an immediate fix.

**Finding 2 — Direction step 2 is unachievable as written, and this IS the Windows analogue that
step 4 told us to look for.** Same Microsoft doc: "As of June 2023, the CA/Browser Forum requires
private keys for OV certificates to be stored on a hardware security module (HSM) or hardware
token." So "export as `.p12`/`.pfx`, base64-encode it" is not possible for any certificate issued
today. The entire implemented `WINDOWS_CERTIFICATE` → `Import-PfxCertificate` →
`certificateThumbprint` path (`release-tauri.yml:354-367`, plus the `--config` override at
`:409-430`) is dead on arrival for a 2026 acquisition. The shape difference from the macOS half
changes how to think about it: macOS was a LATENT DEFECT ARMED BY ENROLMENT (hardened runtime
implied by signing, missing JIT entitlement); this is an IMPLEMENTED PATH THAT NO LONGER MATCHES HOW
CERTIFICATES ARE ISSUED. Direction step 4's "No workflow edits are expected" is now measurably FALSE
for every remaining option — the same way the macOS half's "No code changes" was. Tauri v2 documents
`bundle.windows.signCommand` for exactly this case; this repo has never used it.

**Finding 3 — workflow audit: what is actually CORRECT.** Recorded so a future reader does not
re-audit it. Verified read-only: the three-branch gate at `release-tauri.yml:409-430` and the
cert-import gate at `:354` both require all three Windows secrets; no branch calls `exit 1`; D-04's
"green on any secret combination" invariant holds. `src-tauri/tauri.windows.conf.json` carries only
`bundle.resources` and declares NO `certificateThumbprint`, so the D-04 anti-pattern guard is
intact — there is no committed-thumbprint analogue to the macOS entitlements gap. The defect is not
in what the workflow DOES, it is that the credential SHAPE it was built for is no longer obtainable.

**Finding 4 — NEW, previously unrecorded: SignPath signs POST-BUILD, which collides with
`createUpdaterArtifacts: true`.** SignPath Foundation's model is submit-artifact / sign / retrieve,
not an in-build `signCommand`. But `src-tauri/tauri.conf.json` sets `createUpdaterArtifacts: true`,
so `tauri build` minisigns the updater artifact over the UNSIGNED installer bytes — and
`.github/workflows/release-tauri.yml` uses `tauri-apps/tauri-action@v1` (`:557`), which BUILDS AND
UPLOADS to the draft release in ONE step, leaving no seam between build and publish for a post-build
signer. Publishing the build's original `.sig` alongside a SignPath-signed installer would ship a
valid-looking updater signature over the wrong bytes, and `promote-updater-feed.yml` would then
promote that `latest.json`. The required ordering, to be designed once the SignPath account exists:
build (no upload) → SignPath signs the installer → DELETE the stale `*-setup.exe.sig` and ASSERT its
absence → re-run `tauri signer sign` over the signed bytes → only then upload. This is a RESTRUCTURE
of the `tauri-action` step, not a config tweak, and it is the part most likely to ship a
silently-broken auto-update — a failure no green build would reveal.

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
   reputation slowly; ~~an EV certificate gets it immediately~~ **SUPERSEDED 2026-09-24 — see the
   STATUS section above.** EV's instant-SmartScreen bypass was removed in 2024; EV now
   reputation-builds identically to OV. EV certificates still cost substantially more and generally
   require a hardware token or cloud HSM, which complicates CI.
3. **Windows is not the operator's primary OS**, hence `platform: windows` — verification needs
   that machine or a VM.

## Direction

1. Apply to SignPath Foundation at https://signpath.org/apply. Manual review, typically 1-2 weeks,
   possibly with follow-up questions; the application is identity-bound to the maintainer and
   cannot be automated. Eligibility conditions to check first: an OSI-approved open-source licence
   with no commercial dual-licensing for any component (GameLib is `GPL-3.0-only` per
   `package.json`, public repo — plausibly qualifying); no proprietary or non-open-source
   component; actively maintained; already released in the form that should be signed;
   functionality described on the download page; 2FA enabled on the GitHub account.
2. On approval, design the build → sign → re-sign → upload ordering from Finding 4 BEFORE wiring
   any credentials. Getting credentials working first and the ordering second is how a broken
   updater ships.
3. Fall back to an OV certificate from a commercial CA — $150-300/yr, USB token or cloud HSM
   required, and still needing `signCommand` rather than the base64-`.p12` path — only if SignPath
   declines.

Whichever route is taken, the three currently-absent secret names recorded in the Problem section
may no longer be the right secret SHAPE. The Problem section's measurement that they are absent
stays true as history; it is not being reworded here.

## Verification — a green build proves nothing

The workflow is green today while shipping unsigned. Verify on the artifact, on Windows:

- `signtool verify /pa /v GameLib_setup.exe` — must report a valid chain to a trusted root.
- `Get-AuthenticodeSignature .\GameLib_setup.exe` — `Status` must be `Valid`, and
  `SignerCertificate.Subject` must name the expected organisation.
- Confirm the run log contains no `::warning::WINDOWS_CERTIFICATE` skip line.
- Download the published asset **through a browser** (not `curl`, which does not attach the
  zone-identifier mark-of-the-web) on a machine that has never built the app. ~~Confirm no
  SmartScreen interstitial.~~ **SUPERSEDED 2026-09-24 — see Finding 1.** Absence of the
  interstitial is NOT a pass criterion on a first signed release and must not be treated as one:
  no issuer buys instant trust, so an interstitial here is the expected result of a correctly
  signed first release. What to check instead is that the prompt now names the expected publisher
  rather than an unknown one, and that the interstitial recedes across subsequent releases signed
  with the same identity. Reading this bullet literally would convict working signing.
- After the first signed release, verify that the published `*-setup.exe.sig` verifies against the
  SIGNED installer bytes, and that an actual in-app update from the prior version completes. A
  signature that merely exists proves nothing — this is exactly the failure Finding 4 describes.

## Related

- `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` — the macOS half. Credentials
  enrolled and Apple-verified 2026-09-14; its remaining work is a release run plus artifact
  checks. Read its STATUS section before assuming this one needs no code changes.
- Memory `gate-failure-mechanisms` — the standing lesson that a green pipeline can certify a
  broken artifact, which is exactly what both halves of this split are.

## Carried residual (2026-09-22, quick 260922-txw)

`2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md` closed this
session — both the original `-f` drive-letter defect (`fb9f0d458`) and a second `-C`
escape-unquoting defect found live during this task's verification (`86ed30f42`) were confirmed
fixed on this Windows box in Git Bash (GNU tar 1.35). That todo's remedy is deliberately
PATH-agnostic, so which `tar` wins PATH on the `windows-latest` CI runner remains genuinely
unmeasured, not fixed-and-therefore-moot. The first real Windows tag push — whenever this signing
todo's certificate work reaches that point — should, as a side effect of simply running,
additionally confirm:

1. `install-deps` passes on `windows-latest` (the tar fix holds under CI's actual shell/PATH, not
   just this operator's local Git Bash).
2. `public/bin/arm64/darwin/{legendary,gogdl,nile}/{name}` exist in the runner's build tree after
   `pnpm download-helper-binaries` — i.e. `:138` extraction actually ran and actually landed files,
   not merely that `install-deps` exited 0 (the trap the closed todo names: a run that only proves
   `:89` listing is not evidence `:138` extraction happened).
3. `where tar` (or the CI-shell equivalent) on the runner, so the Hypothesis section's still-open
   "which tar wins PATH on `windows-latest`" question in the closed todo finally gets a real
   measurement instead of an inference.

Separately, unrelated to tar: `2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md`
means a Windows packaged build (`vite build` / `tauri build`) can currently fail on the darwin
runner symlinks even once `install-deps` itself is green and signing credentials are enrolled —
worth knowing before spending time debugging a signing-adjacent failure that is actually that
todo's Layer 1/2.
