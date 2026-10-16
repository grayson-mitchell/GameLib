---
phase: 34
slug: tauri-packaging-windows-and-linux-builds-signing-auto-update
status: verified
threats_open: 0
asvs_level: 2
created: 2026-07-25
---

# Phase 34 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Register origin: `register_authored_at_plan_time: true`. All 17 plan files (34-01..34-18,
no 34-04) carry a `<threat_model>` STRIDE block. This audit verifies each declared
mitigation exists in the shipped implementation — it does not scan for new threats.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|----------------|
| GitHub Actions secrets store → runner process env | Signing certs + minisign private key enter a CI runner at build time | `TAURI_SIGNING_*`, `WINDOWS_*`, `APPLE_*` secrets |
| Runner env file (`$GITHUB_ENV`/`$GITHUB_OUTPUT`) → subsequent steps | Anything written is readable by every later step/action | Apple cert base64, Windows thumbprint-derived args |
| updater client → GitHub Releases feed | Installed app polls a remote `latest.json` and executes an installer it downloads | minisign-signed manifest |
| Published release assets → feed-holder `updater` release | Promotion workflow copies an artifact across releases in the same repo | `latest.json` (byte-identical) |
| renderer webview → Rust IPC (capabilities) | Capability grants gate what webview JS can invoke | `shell:allow-execute` scoped to the sidecar only |
| process environment → packaged app | Env vars present at launch influence which binary the shell executes | `GAMELIB_SIDECAR_ENTRY` (dev-only), `use_dev_sidecar()` |
| nodejs.org → build machine | Remote archive downloaded and becomes base bytes of a shipped executable | Node SEA base binary + SHASUMS256.txt |
| npm/crates registries → build | Third-party packages enter the supply chain | `@tauri-apps/*`, `postject`, `keyring` crate features |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-34-01 | Spoofing | updater feed endpoint | mitigate | Hardcoded `grayson-mitchell/GameLib` feed literal in `tauri.conf.json:42-44`; `tauriConf.test.ts:126-128` asserts `Heroic-Games-Launcher` never appears | closed |
| T-34-02 | Tampering | release draft/prerelease flags | mitigate | `release-tauri.yml:434-435` sets `releaseDraft: true`/`prerelease: true`; `releaseWorkflow.test.ts:122-129` regression-guards both | closed |
| T-34-04 | Denial of Service | secrets-less CI run | mitigate/verify | Windows/macOS signing gated behind non-empty secret checks (`release-tauri.yml:228-392`), no `exit 1` on any skip branch; LIVE-PROVEN green on run 30123449346 (`34-VERIFICATION.md`) | closed |
| T-34-05 | Information Disclosure | minisign key / Apple / Windows certs in CI | mitigate | Secrets read only via `env:`/`secrets` context (auto-redacted); `cert.pfx` written+deleted inside `try/finally` (`release-tauri.yml:322-333`); no `*.key` file ever committed (git history checked) | closed |
| T-34-06 | Tampering/Downgrade | forged or downgraded latest.json | mitigate | `plugins.updater.pubkey` committed in `tauri.conf.json:41`; `tauri-plugin-updater` verifies every artifact before install | closed |
| T-34-07 | Tampering | compiled sidecar substitution build→bundle | accept/mitigate | `build:sidecar-sea` runs in the same CI leg that bundles (`release-tauri.yml:191-194`, before `tauri-action`) — no cross-job hand-off window | closed |
| T-34-08 | Denial of Service | keyring feature gap Win/Linux | mitigate | `src-tauri/Cargo.toml:21`: `keyring = {..., features = ["apple-native","windows-native","sync-secret-service"]}` | closed |
| T-34-09 | Elevation of Privilege | shell:allow-execute + use_dev_sidecar | mitigate | `capabilities/default.json:12-14` scopes `shell:allow-execute` to `{name:"binaries/gamelib-sidecar", sidecar:true}` only; `main.rs:571-573` `use_dev_sidecar()` is `cfg!(debug_assertions)` only, no env override reachable in release | closed |
| T-34-10 | Tampering | base config signing fields absent | mitigate | `tauri.conf.json` has no `certificateThumbprint`/`signCommand`; signing merged in only via CI `--config` override | closed |
| T-34-11 | Spoofing | artifact-name collision on shared release | mitigate | `electron-builder.yml` uses `-Setup-`/`-Portable-`/`-macOS-`/`-linux-` segments; Tauri's default NSIS/AppImage/dmg naming convention does not share these segments — structurally non-colliding, documented in `release-tauri.yml:11-19` | closed |
| T-34-12 | Elevation of Privilege | draft/prerelease/Latest state | verify | LIVE-PROVEN: `34-HUMAN-UAT.md` — draft release created, no `release: published` event fired, `promote-updater-feed.yml` did not run | closed |
| T-34-13 | Tampering | unsigned artifact supply-chain exposure | accept | Documented D-03 state: 0.x ships unsigned; minisign signature on `latest.json` remains the trust anchor | closed (accepted) |
| T-34-14 | DoS/Tampering | cross-arch sidecar binary (CR-01) | mitigate | `buildSidecarSea.ts` `resolveTriple()` (L344) target-driven; `verifyBinaryArch()` (L714-742) runs `lipo -archs` and throws on mismatch | closed |
| T-34-15 | Tampering (supply chain) | downloaded nodejs.org base binary | mitigate | `obtainCrossNodeBinary()` (`buildSidecarSea.ts:545-624`) verifies SHA-256 against `SHASUMS256.txt` before extraction, deletes on mismatch | closed |
| T-34-16 | Tampering / Info Disclosure | `gh release download crossover-index`; orphaned sidecar (WR-03) | mitigate | `release-tauri.yml:131-135` scoped via `github.token`, `--pattern`, non-fatal `|| echo`; `main.rs:133-157` `shutdown_child()` called from `RunEvent::Exit` (`main.rs:884-886`) | closed |
| T-34-17 | Info Disclosure / Tampering | job-level signing secrets; sidecar exec-path integrity (WR-01) | accept/mitigate | Pre-existing job-level `env:` scoping (accepted, new build steps run before cert import); release-build sidecar exec path is exclusively `spawn_sidecar_packaged()` (no env override, `main.rs:571-609`) | closed |
| T-34-18 | Tampering | electron-vite build output bundled | accept | Renderer built from the checked-out, reviewed source tree by the repo's own committed config; no widened input set vs. existing Electron pipeline | closed (accepted) |
| T-34-19 | Tampering | spawnArgv() argv construction | mitigate | `buildSidecarSea.ts:296-313` argv-form only, `shell:true` never passed; `grep -c "shell: true"` = 0 | closed |
| T-34-20 | Elevation of Privilege | relative node_modules/.bin tool lookup | mitigate | `resolveEsbuildCli()`/`resolvePostjectCli()` (`buildSidecarSea.ts:143-163`) use `require.resolve`, spawned via `process.execPath` — no PATH/PATHEXT lookup | closed |
| T-34-21 | Tampering | SEA bundle flags | mitigate | `buildEsbuildArgv()` (`buildSidecarSea.ts:254-272`) fixed flag set incl. `--alias:electron`, `--inject:sidecarSeaFsShim`, no `--packages=external`; asserted element-by-element in `buildSidecarSea.test.ts` | closed |
| T-34-22 | Denial of Service | unresolvable esbuild/postject module | mitigate | `resolveEsbuildCli()`/`resolvePostjectCli()` throw a named `COMPILE GATE FAILED (D-06/CR-02)` error instead of an opaque `spawn ENOENT` | closed |
| T-34-23 | Spoofing | relocated updater feed `/releases/download/updater/latest.json` | mitigate | `promote-updater-feed.yml:138-146` copies `latest.json` byte-identical, no signing secret declared (`grep -c "TAURI_SIGNING"` = 0), client-side minisign verify unchanged | closed |
| T-34-24 | Tampering | manifest rewriting during promotion | mitigate | No transform step; `sha256sum` audit line logged (`promote-updater-feed.yml:110-119`) | closed |
| T-34-25 | Elevation of Privilege | premature exposure of unreviewed build | mitigate | `promote-updater-feed.yml:31-32` triggers only on `release: types: [published]`; drafts never fire it | closed |
| T-34-26 | Denial of Service | promote workflow self-retrigger loop | mitigate | `if: startsWith(github.event.release.tag_name, 'v')` (`promote-updater-feed.yml:46`) excludes the `updater` tag; `concurrency` group serializes runs (`:34-36`) | closed |
| T-34-27 | Info Disclosure | promotion job credential surface | mitigate | `promote-updater-feed.yml:48-51` declares only `GH_TOKEN: github.token`; no `APPLE_*`/`WINDOWS_*`/`TAURI_SIGNING_*` referenced | closed |
| T-34-28 | Repudiation | which build the feed serves | mitigate | Source tag + manifest SHA-256 logged to `$GITHUB_STEP_SUMMARY` (`promote-updater-feed.yml:117-119`) | closed |
| T-34-29 | Tampering | `$GITHUB_OUTPUT` secret-derived value | mitigate | `release-tauri.yml:377-398` heredoc with `$RANDOM`-delimited terminator, not single-line `key=value` | closed |
| T-34-30 | Info Disclosure | cert.pfx written for unusable cert | mitigate | Import step `if:` requires `WINDOWS_CERT_THUMBPRINT != ''` in addition to the cert (`release-tauri.yml:323`) | closed |
| T-34-31 | Denial of Service | pipeline availability under half-configured secrets | mitigate | `elif` warn-and-skip branches (`release-tauri.yml:257-270`, `384-389`); no `exit 1` on any Windows/Apple partial-secret branch | closed |
| T-34-32 | Spoofing | unsigned Windows artifact presented as signed | mitigate | Explicit `::warning::` naming the missing secret on every skip branch (`release-tauri.yml:265,267,269,285,385,388`) | closed |
| T-34-33 | Repudiation | which runs shipped signed vs unsigned | accept | Determinable from run-log warning lines; structured signing provenance out of scope | closed (accepted) |
| T-34-34 | Info Disclosure | Apple cert base64 to `$GITHUB_ENV` | mitigate | `write_env()` (`release-tauri.yml:239-278`) writes only when all three signing secrets are enrolled; never on the 0.x default path | closed |
| T-34-35 | Tampering | newline-bearing Apple secret injecting env keys | mitigate | `write_env()` uses `$RANDOM`-delimited heredoc per value (`release-tauri.yml:242-247`) | closed |
| T-34-36 | Denial of Service | half-enrolled Apple secret set hard-failing macOS leg | mitigate | All-or-nothing signing + notarization gates, warn-and-skip on any partial set, no `exit 1` (`release-tauri.yml:250-278`); LIVE-PROVEN fixed in run 30123449346 | closed |
| T-34-37 | Info Disclosure | private key in `meta/updaterSigningKey.ts` | mitigate | Key/password cross only via child-process `env:` (`updaterSigningKey.ts:199-210`), never disk/argv/error string; probe file+`.sig` removed in `finally` | closed |
| T-34-38 | Tampering | wrong private key enrolled → unverifiable updates | mitigate | `verifyUpdaterSigningKeypair()` key-id comparison against committed pubkey (`updaterSigningKey.ts:239-246`); wired into CI as `pnpm verify:updater-key` (`release-tauri.yml:120-122`) | closed |
| T-34-39 | Elevation of Privilege | spawning CLI via pnpm .bin shim / PATH lookup | mitigate | `resolveTauriCli()` (`updaterSigningKey.ts:93-102`) uses `require.resolve` + `process.execPath`, argv form, no `shell:true` | closed |
| T-34-40 | Info Disclosure | private key/password during re-enrolment | mitigate | Documented safe procedure (`34-18-PLAN.md`); executed per `34-18-SUMMARY.md` Task 1 (matched pair enrolled via file/stdin, not argv) | closed |
| T-34-41 | Spoofing | regenerated keypair without updating committed pubkey | mitigate | `tauri.conf.json:41` pubkey key id `9A02F7E0C9FC04C7` confirmed to match the enrolled key (`34-VERIFICATION.md` gaps_closed); `verifyUpdaterSigningKeypair()` fails CI on any mismatch | closed |
| T-34-42 | Repudiation | which key is authoritative after regeneration | accept | Only public key IDs recorded (`34-18-SUMMARY.md`); old key superseded, never shipped in a release, no revocation path needed | closed (accepted) |
| T-34-SC | Tampering | npm/cargo/pip installs + third-party GitHub Actions (all plans) | mitigate/accept | Package Legitimacy Audit (`34-RESEARCH.md`) all `[OK]`; versions pinned (`@tauri-apps/plugin-updater@2.10.1`, `@tauri-apps/plugin-shell@2.3.5`, `postject@1.0.0-alpha.6`); Actions pinned (`actions/checkout@v6`, `dtolnay/rust-toolchain@stable`, `swatinem/rust-cache@v2`, `tauri-apps/tauri-action@v1`); most plans add zero new deps (`git diff package.json` empty, confirmed by summaries) | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-34-01 | T-34-07 | SEA sidecar compile + tauri-action bundle run in the same CI leg with no cross-job artifact hand-off window; residual risk is a compromised runner mid-job, out of scope for this phase | Phase 34 plan 34-02/34-06/34-08 | 2026-07-25 |
| AR-34-02 | T-34-13 | 0.x ships without OS code-signing certs (D-03); minisign signature on `latest.json` remains the auto-update trust anchor while OS signing is deferred to a future milestone | Phase 34 plan 34-07 | 2026-07-25 |
| AR-34-03 | T-34-17 | Job-level `env:` exposes `TAURI_SIGNING_*`/`WINDOWS_*` secrets to all steps in the job, including the 3 new build steps added in 34-12; residual risk bounded because those steps run before the Windows cert import step and no cert material is materialized on disk during their execution; narrowing to step-level `env:` is out of scope for this gap cycle | Phase 34 plan 34-12 | 2026-07-25 |
| AR-34-04 | T-34-18 | `pnpm exec electron-vite build` output is bundled into installers from the same checked-out, reviewed source tree the Electron pipeline already ships; does not widen the input set | Phase 34 plan 34-12 | 2026-07-25 |
| AR-34-05 | T-34-33 | Which CI runs shipped signed vs. unsigned artifacts is determinable only from ephemeral run-log `::warning::` lines, not structured/persisted provenance; adding that is out of scope for this gap cycle | Phase 34 plan 34-15 | 2026-07-25 |
| AR-34-06 | T-34-42 | After the updater keypair regeneration (34-18 Branch B), only public key IDs are recorded; the superseded key was never used to sign a shipped release, so no revocation mechanism is needed | Phase 34 plan 34-18 | 2026-07-25 |
| AR-34-07 | WR-04 (34-REVIEW.md, deferred) | `tauri.conf.json` sets `security.csp: null` + `withGlobalTauri: true` + `opener:default` capability grant — pre-existing since Phase 27 (commit `83dc57a7`), not introduced by Phase 34. Explicitly DEFERRED by user decision (GAP-D-01) pending a dedicated live-retest cycle for a real CSP. **Residual exposure:** any future renderer-side XSS from network-supplied store/game metadata has materially higher impact than under a baseline CSP — flagged, not closed, tracked for a future phase. | User (GAP-D-01) | 2026-07-24 |
| AR-34-08 | IN-01 (34-REVIEW.md, deferred) | `meta/sidecarSeaFsShim.ts` `isSteamSystemPemPath` matches any path ending in `system.pem`, broader than its intended `@doctormckay/steam-crypto` target. Build-time only, not attacker-reachable at runtime — low practical risk. Explicitly DEFERRED by user decision (GAP-D-01). | User (GAP-D-01) | 2026-07-24 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-25 | 42 (T-34-01..42 + T-34-SC, deduplicated across 17 plans) | 42 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-25
