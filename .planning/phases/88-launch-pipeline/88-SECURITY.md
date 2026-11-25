---
phase: "88"
slug: "launch-pipeline"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-25"
---

# Phase 88 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Scope: sub-phase 88 (known-fixes to Rust, shared launch scaffolding). Register authored at plan time in 88-01..88-17 `<threat_model>` blocks; verified at ASVS L1 (grep depth) by `/gsd-secure-phase 88` on 2026-11-25.

---

## Trust Boundaries

| Boundary | Description | First named in |
|----------|-------------|----------------|
| operator machine -> repo | gate evidence (logs, paths, hashes) recorded into a committed file | 88-01 |
| repo docs -> test | the schedule test reads ROADMAP.md to decide which deletedBy values are legal | 88-02 |
| signed app -> overlay host | the catalogue's sha256 pins are the trust anchor for every overlay download (88-10) | 88-03 |
| real user profile -> test process | the harness must keep real HOME and shell variables out of recorded goldens | 88-04 |
| renderer -> known-fix reader | `appName` arrives as a free string through `getKnownFixes` | 88-05 |
| remote feed -> fixes/ | a GitHub-hosted file becomes the remote layer | 88-05 |
| overlay host -> overlays/ | a downloaded archive is extracted under the app folder | 88-06 |
| tier-2 profile -> wine registry | profile data becomes `reg add` arguments | 88-06 |
| GitHub raw feed -> fixes/ | remote bodies become the remote known-fix layer | 88-07 |
| client -> fix relay | an opt-in report leaves the machine | 88-07 |
| renderer -> knownfix native channels | `appName` and `runner` arrive from the renderer | 88-08 |
| fixes/ remote layer -> reader | a downloaded file is parsed | 88-08 |
| fix file -> exe path | `exeOverride` from a local, bundled or remote file selects the binary a game launch runs | 88-09 |
| sidecar -> Rust rustInvoke | TS sends app names, runners and install paths to Rust ops | 88-12 |
| twin vs Rust owner | two implementations of one reader must not diverge | 88-13 |
| repo history -> runtime | a deleted TS path must not be revived as a second owner | 88-16 |
| local repo -> remote main | a push publishes the sub-phase's commits | 88-17 |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-88-01 | Information disclosure | 88-HUMAN-UAT.md evidence rules | medium | mitigate | Preflight requires recording only process names, counts, file names, hashes and `~` paths; never tokens, Keychain values or full args lines (Task 1) — evidence: 88-01-SUMMARY Threat Flags | closed |
| T-88-02 | Tampering | operator bottles, saves and scripts during the gate | medium | mitigate | `ditto` copy before item 1, restore after the item that changed them; the operator names every title (Task 1) — evidence: 88-01-SUMMARY Threat Flags | closed |
| T-88-03 | Tampering | schedule deletedBy rule | low | mitigate | The allowed set is derived from roadmap headings in 87..99 only; a planted 88.4 self-test proves a typo cannot pass (Task 1) — evidence: 88-02-SUMMARY Threat Flags | closed |
| T-88-04 | Repudiation | rollback flag reintroduced silently | medium | mitigate | noRollbackFlag scans raw text in src, src-tauri/src and the crates with floors and planted self-tests (Task 3) — evidence: 88-02-SUMMARY Threat Flags | closed |
| T-88-05 | Tampering | 88 coding over unexecuted 87 gap code | medium | mitigate | The prerequisite check fails on any 87 code plan without a SUMMARY, with a parse floor (Task 1) — evidence: 88-02-SUMMARY Threat Flags | closed |
| T-88-06 | Tampering | overlay catalogue pins | high | mitigate | The pins move into one compiled-in JSON both languages read; an equality test with a mutation self-test stops either side drifting (Task 2) — evidence: 88-03-SUMMARY Threat Flags | closed |
| T-88-07 | Elevation of privilege | new crates reaching keyring or tauri | medium | mitigate | cargo tree assertions in the verify fail if keyring or tauri appear in either crate's tree (Task 1) — evidence: 88-03-SUMMARY Threat Flags | closed |
| T-88-08 | Information disclosure | recorded env in goldens | medium | mitigate | `withPinnedBaseEnv` replaces process.env wholly (fake HOME's eight variables plus three pinned keys) and the tracer asserts exactly 11 keys and no DYLD_/LD_/real HOME (Task 1) — evidence: 88-04-SUMMARY Threat Flags | closed |
| T-88-09 | Repudiation | dropped incident scenario | low | mitigate | `assertCasesCoverTitles` fails on any TS test title with no case and no reasoned exclusion; an empty list fails (Task 3) — evidence: 88-04-SUMMARY Threat Flags | closed |
| T-88-10 | Tampering | reader path containment (WR-06) | high | mitigate | Traversal appNames (`../x`, backslash, absolute) are named golden cases whose recorded answer is null plus the warning; 88-08 replays them (Task 1) — evidence: 88-05-SUMMARY Threat Flags | closed |
| T-88-11 | Elevation of privilege | remote layer carrying tier-2 keys | high | mitigate | Pairwise rows with tier-2 keys in a remote tier-1 file record that no tier-2 data results and non-allow-listed keys are dropped (Task 1) — evidence: 88-05-SUMMARY Threat Flags | closed |
| T-88-12 | Tampering | overlay archive zip-slip | high | mitigate | Traversal, non-regular, unexpected-path and over-cap archives are named golden cases with recorded rejections that 88-10 replays (Task 3) — evidence: 88-06-SUMMARY Threat Flags | closed |
| T-88-13 | Tampering | registry argument injection | medium | mitigate | `validateRegistryFixes` rejects are recorded per incident; command parts are argv arrays recorded per (fix, view) (Task 2) — evidence: 88-06-SUMMARY Threat Flags | closed |
| T-88-14 | Denial of service | stuck `reg add` or download | medium | mitigate | Timeout cases (15 s per fix, 120 s per download) record the kill and the null result (Tasks 2, 3) — evidence: 88-06-SUMMARY Threat Flags | closed |
| T-88-15 | Tampering | remote feed body | high | mitigate | Cases record filter-at-write through the tier-1 allow-list and that indeterminate answers write and delete nothing (Task 2) — evidence: 88-07-SUMMARY Threat Flags | closed |
| T-88-16 | Information disclosure | report payload | medium | mitigate | Cases record the exact body (appId, key, value, op, version only), the no-redirect setting and the skip-local rule; headers redacted in fixtures (Task 2) — evidence: 88-07-SUMMARY Threat Flags | closed |
| T-88-17 | Tampering / Information disclosure | `read_within` path containment | high | mitigate | resolve-plus-relative containment before any open; traversal cases replayed from golden/reader; a rejected runner is a fixed literal that never echoes input (Tasks 1, 2) — evidence: 88-08-SUMMARY Threat Flags | closed |
| T-88-18 | Elevation of privilege | remote layer tier-2 | high | mitigate | Tier-2 reader lists local and bundled only; the tier-1 filter is the 12-key allow-list; golden cases replayed (Task 2) — evidence: 88-08-SUMMARY Threat Flags | closed |
| T-88-19 | Information disclosure | gamelib.log reader warnings | medium | mitigate | Warnings go through EngineCtx.log (87-61 redactor) with no path (Task 1) — evidence: 88-08-SUMMARY Threat Flags | closed |
| T-88-20 | Elevation of privilege | exeOverride symlink escape | high | mitigate | realpath on both sides, relative containment, regular-file check; symlink-escape golden cases replayed (Task 1) — evidence: 88-09-SUMMARY Threat Flags | closed |
| T-88-21 | Tampering | `reg add` argument injection | medium | mitigate | validate_registry_fixes ports every TS reject; command parts are an argv vector to run_wine_command, never a shell string (Task 2) — evidence: 88-09-SUMMARY Threat Flags | closed |
| T-88-22 | Denial of service | stuck `reg add` | medium | mitigate | 15 s cancel per (fix, view) through gamelib-proc's helper kill; the op holds the knownfix registrant via `guarded` (Tasks 2, 3) — evidence: 88-09-SUMMARY Threat Flags | closed |
| T-88-23 | Tampering | overlay archive zip-slip or oversized extraction | high | mitigate | Strict reader: regular files, exact path set, no `..`, ASCII 99-byte names, declared sizes, byte cap; replayed from goldens (Task 1) — evidence: 88-10-SUMMARY Threat Flags | closed |
| T-88-24 | Tampering | substituted overlay payload | high | mitigate | Archive sha256 and per-file sha256 pins from the compiled-in catalogue; a mismatch installs nothing (Task 2) — evidence: 88-10-SUMMARY Threat Flags | closed |
| T-88-25 | Denial of service | stuck overlay download at launch | medium | mitigate | 120 s bound, body capped at archiveSize, shutdown-token cancel, registrant via `guarded`; fail-open launches without the overlay (Task 2) — evidence: 88-10-SUMMARY Threat Flags | closed |
| T-88-26 | Tampering | destructive cleanup outside overlays/ | high | mitigate | Every recursive removal goes through gamelib-safety; no `remove_dir_all` (Task 2) — evidence: 88-10-SUMMARY Threat Flags | closed |
| T-88-27 | Tampering | remote feed body | high | mitigate | Filter at write through the tier-1 allow-list; indeterminate answers write and delete nothing; containment on the destination (Task 1) — evidence: 88-11-SUMMARY Threat Flags | closed |
| T-88-28 | Tampering | stale-file delete | medium | mitigate | Delete only when every applicable source answers 404, after the same containment check (Task 1) — evidence: 88-11-SUMMARY Threat Flags | closed |
| T-88-29 | Information disclosure | report payload and redirects | medium | mitigate | Exact body shape from the goldens, no redirects, Content-Type and User-Agent only, opt-in `enabled` and skip-local rule (Task 3) — evidence: 88-11-SUMMARY Threat Flags | closed |
| T-88-30 | Spoofing | relay URL override | low | accept | The override is read once by the shell from GAMELIB_FIX_RELAY_URL as today; a local env var is already operator-controlled — accepted (see log) | closed |
| T-88-31 | Tampering | rustInvoke args | medium | mitigate | zod args on the TS side and generated serde decode with `deny_unknown_fields` in the arm; rejections are fixed literals that never echo input (Tasks 1, 2) — evidence: 88-12-SUMMARY Threat Flags | closed |
| T-88-32 | Denial of service | a hung Rust call blocking a launch | low | mitigate | Both channels stay under the 60 s RUST_INVOKE_TIMEOUT_MS bound (Task 1, 2) — evidence: 88-12-SUMMARY Threat Flags | closed |
| T-88-33 | Information disclosure | processEnvBase | low | mitigate | Only `KNOWN_FIX_OVERLAY_BASE_ENV_KEYS` cross the boundary, never the whole env (Task 1) — evidence: 88-13-SUMMARY Threat Flags | closed |
| T-88-34 | Tampering | twin drift from the Rust reader | medium | mitigate | The twin is pinned to the same goldens Rust replays, with a planted-mismatch self-test (Task 2) — evidence: 88-13-SUMMARY Threat Flags | closed |
| T-88-35 | Tampering | bridge registry args | medium | mitigate | The op reads the Steam profile itself from its layers; the bridge sends only appId, label, settings and the bottle path it computes today, decoded by `deny_unknown_fields` (Task 1) — evidence: 88-14-SUMMARY Threat Flags | closed |
| T-88-36 | Tampering | twin drift for the bridge | medium | mitigate | Five twins pinned to four golden slices with the planted-mismatch self-test (Task 2) — evidence: 88-14-SUMMARY Threat Flags | closed |
| T-88-37 | Information disclosure | report opt-in | medium | mitigate | `enabled` is computed from `shareDetectedFixes === true` at each call site exactly as `knownFixReportDeps.isEnabled` did; Rust's report golden replays the disabled outcome (Task 1) — evidence: 88-15-SUMMARY Threat Flags | closed |
| T-88-38 | Repudiation | a silently swallowed report failure | low | mitigate | The fire-and-forget call keeps a logged `.catch` with app id and outcome only (Task 1) — evidence: 88-15-SUMMARY Threat Flags | closed |
| T-88-39 | Tampering | revived known-fix TS or a second owner | medium | mitigate | knownFixPortComplete forbids the deleted files, identifiers, TS registrations of the knownfix slice and the flag (Task 1) — evidence: 88-16-SUMMARY Threat Flags | closed |
| T-88-40 | Repudiation | an unscheduled survivor | low | mitigate | knownFixSurvivors compares exports and schedule rows both ways with a planted self-test (Task 2) — evidence: 88-16-SUMMARY Threat Flags | closed |
| T-88-41 | Tampering | pushing an unproven head | medium | mitigate | The push needs the operator's recorded choice and an empty `git diff --name-only P HEAD` outside .planning measured immediately before it (Tasks 2, 3) — evidence: 88-17-SUMMARY Threat Flags | closed |
| T-88-42 | Repudiation | CI legs not actually running the goldens | low | mitigate | Each leg's log is checked for the six golden binaries by name (Task 3) — evidence: 88-17-SUMMARY Threat Flags | closed |
| T-88-SC | Tampering | npm/pip/cargo installs | high | mitigate | No package or crate added by any plan (88-01, 88-02, 88-03, 88-04, 88-05, 88-06, 88-07, 88-08, 88-09, 88-10, 88-11, 88-12, 88-13, 88-14, 88-15, 88-16, 88-17); each SUMMARY records it | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

L1 code evidence for the high-severity rows (2026-11-25): no `remove_dir_all` in `gamelib-knownfix` or `gamelib-launch` (removals via `gamelib_safety` in `overlay/install.rs`); sha256 pins in `catalogue.rs` and `overlay/{mod,install}.rs`; `canonicalize` on both sides in `launch.rs`; `read_within` containment in `reader.rs`; `deny_unknown_fields` decodes in `catalogue.rs` and `lib.rs`; no shell-string spawn; seven golden replay binaries green on three OSes (run 45533129411).

### Observations (not register threats)

- `registry.rs` echoes a rejected registry or dllOverrides entry through `shown()` without `redact_urls`, and `launch.rs` echoes a rejected `exeOverride`, into gamelib.log. The values come from a local, bundled or filtered remote fix file, not from credentials. Recorded by 88-17 against prohibition 1, which stays `unresolved` (no wired check descriptor). Below the high block threshold; not counted in `threats_open`.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-88-01 | T-88-30 | The relay URL override is read once by the shell from `GAMELIB_FIX_RELAY_URL`, as before the port; a local env var is already operator-controlled | plan 88-11 threat model | 2026-11-25 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-25 | 43 | 43 | 0 | /gsd-secure-phase 88 (orchestrator, L1 short-circuit) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-25
