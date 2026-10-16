# Phase 34: Tauri packaging — Windows and Linux builds, signing, auto-update - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-24
**Phase:** 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
**Areas discussed:** Platform scope & formats, Signing & notarization, Build pipeline / CI, Auto-update delivery

---

## Platform scope

| Option | Description | Selected |
|--------|-------------|----------|
| All three (Win+Linux+mac) | Productionize macOS too (.dmg, flip bundle.active:true) alongside Win/Linux; Phase 35 inherits all three on Tauri | ✓ |
| Windows + Linux only | Strictly the goal's named platforms; macOS stays dev build, leaves a mac packaging gap | |
| Windows only first | Narrowest slice; doesn't satisfy phase goal as written | |

**User's choice:** All three (Win+Linux+mac)
**Notes:** Removes any macOS packaging gap before the Phase 35 cutover.

## Bundle formats

| Option | Description | Selected |
|--------|-------------|----------|
| Lean / updater-friendly | Win NSIS, Linux AppImage, mac .dmg — all support the Tauri updater cleanly | |
| Broad Linux reach | Add .deb + .rpm; but they don't auto-update via the feed (need apt/dnf repos) | |
| You decide | Recommend per-platform during research | ✓ |

**User's choice:** You decide
**Notes:** Default to the lean set (NSIS/AppImage/.dmg); evaluate .deb/.rpm as a cheap add during research, understanding they'd be manual-update only.

---

## Signing & notarization

| Option | Description | Selected |
|--------|-------------|----------|
| Plumbing now, certs later | Wire signing/notarization reading from secrets, ship unsigned for 0.x, activate certs later | ✓ |
| Sign for real now | Enroll+pay Apple Dev ($99/yr) + Windows Authenticode (~$200+/yr) now | |
| Split decision | Sign one platform for real, defer others | |

**User's choice:** Plumbing now, certs later
**Notes:** Zero cost / no identity enrollment for a pre-release solo fork.

## No-cert build behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Graceful skip + warn | Detect missing cert secrets, skip signing, warn, still produce working unsigned artifact; CI never fails | ✓ |
| Ad-hoc / self-signed | macOS ad-hoc codesign + generated self-signed Windows cert | |
| Fail loudly | Missing certs = build error | |

**User's choice:** Graceful skip + warn
**Notes:** Keeps the pipeline green until certs are added.

---

## Build pipeline / CI

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions matrix | windows-latest + ubuntu-latest + macos-latest; free for public repos; tauri-action does bundle+sign+draft | ✓ |
| Local/manual | Build each OS by hand on owned hardware/VMs | |
| Hybrid | CI for Win/Linux, macOS local | |

**User's choice:** GitHub Actions matrix
**Notes:** Only viable path — Tauri can't cross-compile and the dev only has a Mac locally.

## Node sidecar bundling

| Option | Description | Selected |
|--------|-------------|----------|
| Compile to single binary | One self-contained executable per OS (SEA/pkg/bun), shipped as Tauri externalBin; no Node on user machine | ✓ |
| Ship Node runtime + JS | Bundle a Node runtime + JS as resources | |
| You decide | Research current sidecar and recommend | |

**User's choice:** Compile to single binary
**Notes:** Clean auto-update story, no external Node dependency.

---

## Auto-update feed hosting

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Releases latest.json | Tauri updater polls a static latest.json on grayson-mitchell/GameLib releases; free, no server | ✓ |
| Self-hosted endpoint | Run own update server | |
| No auto-update yet | Ship installers, no update check | |

**User's choice:** GitHub Releases latest.json
**Notes:** Same host as the already-repointed Electron feed (q5n).

## Updater signing key

| Option | Description | Selected |
|--------|-------------|----------|
| Generate now, secret in CI | Generate Tauri minisign keypair; public key in config, private key+password as GH secrets | ✓ |
| Defer update signing | Ship updater plumbing but leave keypair unconfigured (auto-update inert) | |
| You decide | Set up the standard Tauri way during planning | |

**User's choice:** Generate now, secret in CI
**Notes:** Free / no identity enrollment; auto-update can't function without it.

## Release trigger & prerelease handling

| Option | Description | Selected |
|--------|-------------|----------|
| Tag → draft prerelease | Version tag triggers CI → DRAFT GitHub Release marked prerelease; human publishes manually | ✓ |
| Tag → auto-publish | Tag triggers fully published release, no human gate | |
| Manual dispatch | workflow_dispatch button, no tag | |

**User's choice:** Tag → draft prerelease
**Notes:** Human gate before any auto-update reaches users; draft + prerelease avoids the Phase 19 "prerelease-not-Latest" pitfall. Optional workflow_dispatch may be added for test builds.

---

## Claude's Discretion

- Exact Linux format set beyond AppImage — recommend during research.
- Sidecar single-binary compilation tool (SEA / pkg / bun) — pick lightest path based on the Phase 27 sidecar.
- Whether to add a workflow_dispatch manual trigger alongside the tag trigger for test builds.

## Deferred Ideas

- Paid code-signing certs (Apple Developer + Windows Authenticode) — plumbing now, activation past 0.x.
- Linux .deb/.rpm auto-update repos (apt/dnf) — out of scope; updater covers NSIS/AppImage/.dmg only.
- Electron removal — Phase 35 (cutover).
- App identifier/version bump (0.7.0 → 0.8.0) — confirm during planning.
- Reviewed-not-folded todos: macOS Steam bridge productionization, getProductInfo osarch dump, CrossOver download-resume auto-open — all Steam-runtime items, unrelated to packaging.
