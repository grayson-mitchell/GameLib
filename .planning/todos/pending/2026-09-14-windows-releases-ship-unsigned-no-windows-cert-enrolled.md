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

## STATUS 2026-10-01 (quick 261001-c2r)

This section does not revise anything below it. It records the operator's 2026-10-01 decision on
the second SignPath terms clause raised in the 260930-upo section below, plus two re-measurements
taken the same day.

**Operator decision (2026-10-01).** The clause is the one the 260930-upo section calls "A second
terms clause to answer": software that transfers user data to systems the user did not specify must
describe this in a privacy policy, show that policy during installation, and offer installation
options to disable those functions. That wording is the 260930-upo section's paraphrase of the
terms as re-read on 2026-09-30. It is not a verbatim quotation, and this task did not re-read the
terms. The decision: do not add an installer privacy page pre-emptively.

**Why.** PRIVACY.md states that the maintainer operates no server that receives user data, and
GameLib contains no telemetry, analytics or crash reporting. Store library sync and game metadata
requests go to the stores the user signed in to (PRIVACY.md's store table), so they go to systems
the user chose by signing in. The 260930-upo census below counts them among requests made without
a per-request click, and this section agrees with it. Apart from those library sync requests,
GameLib makes three kinds of request without a user click to systems the user did not pick:

- (a) The connectivity check. GameLib sends HEAD requests to github.com, store.epicgames.com,
  gog.com and cloudflare-dns.com at startup and again while offline. No account data is sent.
  `src/backend/online_monitor.ts:83` is the cloudflare-dns ping. That file reads no setting.
- (b) GOG presence. While the user is signed in to GOG, GameLib sends three things to
  presence.gog.com every 5 minutes: the GOG access token (as the Authorization header), the GOG
  user id (in the request path), and the identifier of the game being played. See
  `src/backend/storeManagers/gog/presence.ts:81`. A Settings toggle disables it: the
  `disableGOGPresence` setting, rendered by
  `src/frontend/screens/Settings/components/DisableGOGPresence.tsx`.
- (c) Community data files, on Linux and macOS only. These are startup fetches of Heroic community
  data files from raw.githubusercontent.com. Windows, the platform being signed, skips them:
  `src/backend/utils/releases.ts:11` and `src/backend/anticheat/utils.ts:25` each return early on
  `isWindows`.

GOG presence is the only one of the three that carries account data, and its Settings toggle
plausibly answers the clause's requirement for an option to disable. That is
the operator's reading, not SignPath's ruling. The limit has equal weight: the toggle is an in-app
Settings option available after install, not an installation option, and the clause as recorded
speaks of installation options. That is the point on which a reviewer could rule the other way.
This list of requests is not claimed to be complete. It is drawn from PRIVACY.md and the
260930-upo census, not from a fresh source census, and PRIVACY.md's own "Limits of this document"
section applies to it.

**What to say in the application.** No user data goes to the maintainer. Name GOG presence
(presence.gog.com) and its Settings toggle. Point to PRIVACY.md.

**If reviewers require install-time display.** Address it at that point. It is expected to be a
small change, but that is an expectation, not a measurement. The measured state today: the NSIS
installer shows no license or privacy page. The bundle `targets` in `src-tauri/tauri.conf.json`
include `nsis` (line 31). Neither that file nor `src-tauri/tauri.windows.conf.json` configures a
`licenseFile` or any NSIS installer page.

**Re-measured 2026-10-01.**

- `gh release list -R grayson-mitchell/GameLib` still shows the GameLib row as
  `GameLib v0.7.0  Draft  v0.7.0  2026-08-28T21:59:17Z`, plus the same two Pre-releases. Nothing is
  published.
- `gh api user --jq '.two_factor_authentication | tostring'` returned `null`, and
  `gh api user --jq 'has("two_factor_authentication")'` returned `false`. The
  `two_factor_authentication` key is absent from this token's response, which is why the field
  reads as null. MFA still cannot be measured from here. This refines the 260930-upo section's
  "null for this token" wording without revising it.

**Remaining operator steps.** Unchanged from the 260930-upo section below.

1. Publish a non-Draft release, with a link titled "Code signing policy" in its release notes
   pointing at the README section.
2. Confirm MFA on GitHub, and on SignPath once the account exists.
3. Apply at https://signpath.org/apply.

Step 4 of that section (attribution and the Finding 4 ordering, on approval) is also unchanged.

## STATUS 2026-09-30 (quick 260930-v7y)

This section does not revise anything below it. It records which README residuals quick 260930-v7y
closed and what remains.

**Closed by 260930-v7y** (README commit `a85c447d7`). These are the four residuals the
260930-upo section below listed.

- The packaging-script references are replaced by the release workflow's Tauri build sequence
  (`pnpm exec vite build`, `pnpm build:sidecar-sea`, `pnpm exec tauri build` with a `--config`
  override that turns updater artifacts off).
- The standalone-pnpm note is removed.
- The Weblate text now credits Heroic's translators and states that GameLib has no Weblate project.
  The Sponsors section and its Weblate logo are removed.
- Back to top links `#gamelib` and is the last content in the file.

**Also fixed in the same sweep.** The Heroic-hosted screenshots removed, Heroic's chat-server link
removed, the SteamOS Discover line removed, the submodule clone flag dropped, the nonexistent dev
script replaced by `pnpm tauri:dev`, the VS Code build-tasks subsection removed, the Nix paragraph
corrected, and the dead Docker Index entry removed.

**Remaining.**

1. GameLib screenshots. This is an operator follow-up and needs a live app run. README has no
   Screenshots section until then.
2. The README build sequence is derived from `.github/workflows/release-tauri.yml` and was not run
   end to end by this task.
3. Uncertain claims left in place are listed in
   `.planning/quick/260930-v7y-readme-reviewer-facing-fixes-real-build-/260930-v7y-SUMMARY.md`.
4. In-app links in `src/backend/constants/urls.ts` still point at Heroic's chat server, Weblate,
   sponsors page and wiki. A reviewer reading the README will not see them.

## STATUS 2026-09-30 (quick 260930-upo)

This section does not revise anything below it. It records a read-only SignPath eligibility check
and what was done about it the same day.

**Eligibility check.** A read-only check against https://signpath.org/terms on 2026-09-30 found
three blockers and one false claim.

- (a) The only GameLib release, v0.7.0, is a Draft; nothing is published. `gh release list -R
  grayson-mitchell/GameLib` returns `GameLib v0.7.0  Draft  v0.7.0  2026-08-28T21:59:17Z`, plus two
  Pre-releases that hold data assets (`runners-onedir-macos`, `crossover-index`).
- (b) No code signing policy was published.
- (c) No privacy policy existed.
- False claim: README.md carried a SignPath credit inherited from Heroic, its links bearing
  Heroic's campaign tag (`utm_campaign=heroicgameslauncher`), although GameLib has no SignPath
  relationship.

**What quick 260930-upo closed.**

- (b) is closed by README.md's "## Code signing policy" section (commit `3b909eaf3`): Windows stated
  as unsigned, "is applying" wording, the roles table for the sole maintainer, what would be signed,
  the macOS state as measured, a PRIVACY.md link. The section is in the README Index.
- (c) is closed by PRIVACY.md (commit `a646c6a9e`), checked against source at `f32ad5aaa`.
- The false credit, its links and its logo are removed in the README commit `3b909eaf3`.

**Privacy choice.** The policy links PRIVACY.md and does not use SignPath's boilerplate "will not
transfer any information ... unless specifically requested" sentence, because that sentence would be
false for GameLib. The source census found requests made without an explicit per-request user
action: a startup connectivity check to github.com, store.epicgames.com, gog.com and
cloudflare-dns.com; GOG presence updates every 5 minutes while signed in; store library syncs;
game-page metadata lookups; and, on Linux and macOS, startup fetches of community data files from
GitHub. The census also found that the Tauri updater is configured (endpoint in
`src-tauri/tauri.conf.json`) but that no source code triggers an update check, so PRIVACY.md says
GameLib does not currently check for updates on its own.

**Not in the policy yet.** SignPath Foundation's attribution sentence. On approval, copy it
verbatim from https://signpath.org/terms as it reads then. Do not paraphrase it and do not copy it
from memory.

**Remaining operator steps.**

1. Publish a real, non-Draft release, either the v0.7.0 draft or a new tag. SignPath requires the
   project to be already released. The release notes must carry a link titled "Code signing
   policy" pointing at the README section, because the terms require the policy on the
   download/release pages as well as the home page.
2. Confirm MFA on GitHub for every team member (sole maintainer), and on SignPath once the account
   exists. The terms require MFA on both. It could not be measured from here: the `gh api user`
   `two_factor_authentication` field is null for this token.
3. Submit the application at https://signpath.org/apply.
4. On approval, add the attribution (see "Not in the policy yet"), then do Direction step 2 (the
   Finding 4 build, sign, re-sign, upload ordering) BEFORE wiring any credentials.

**Open question, no answer asserted.** The terms bar signing modified upstream versions unless
upstream publishes signed builds and the project is a visible fork. GameLib is a derivative of
Heroic Games Launcher (README.md line 3, `UPSTREAM.md`). Whether SignPath's reviewers treat it as
its own project or as a modified upstream is for the application to settle.

**A second terms clause to answer.** The terms as re-read on 2026-09-30 also say software that
transfers user data to systems the user did not specify must describe this in a privacy policy,
display that policy during installation, and offer installation options to disable those
functions. PRIVACY.md covers the first part. Not checked by this task: whether any installer step displays
the policy, and whether the connectivity check or GOG presence can be switched off at install time
(GOG presence has a Settings toggle). It is recorded here so it is not a surprise.

**README residuals a SignPath reviewer will read.** These were deliberately not fixed by this task.
Line numbers as of `3b909eaf3`:

- README.md:162, 174, 246, 252, 257 reference `pnpm dist:linux`, `dist:win` and `dist:mac`. No
  `dist*` script exists in `package.json` (only `clean:dist-*`).
- README.md:227 carries an electron-builder note in the Development environment steps.
- README.md:135 (and the Credits entry for Weblate) point at Heroic's Weblate project.
- README.md:305 "Back to top" links `#heroic-games-launcher`, an anchor that no longer exists.

**Pointer correction.** The macOS signing todo is at
`.planning/todos/completed/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`, not under
`pending/`. The README's macOS statement rests on its STATUS 2026-09-23 and 2026-09-24 sections:
signed and notarized build verified on the v0.7.0 draft, nothing published.

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
