---
phase: "82"
slug: "guardrails-hygiene-and-shared-safety-primitives"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-21"
---

# Phase 82 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| renderer → sidecar | Uninstall, bottle-removal and resetHeroic requests come from the webview | appName, runner, flags (untrusted, zod-validated) |
| sidecar → shell (rustInvoke) | `safety_check_removal` / `safety_remove_tree` over the sidecar RPC | SafetyRequest: target paths, known installs, protected and trust roots (strict zod tuples; crate re-parses with `deny_unknown_fields`) |
| shell → gamelib-safety → filesystem | The only place a recursive delete is authorised and run; re-checks at delete time | filesystem paths, links, junctions (destructive) |
| settings / paths → roots | Protected and trust roots are derived from `paths.*` and settings, never from the renderer | host paths |
| sidecar → renderer | `removalRefusedNotice` push | closed-set kind / outcome / reason + title (no paths) |
| CI / supply chain | New crates and lockfile entries | `gamelib-safety`, `gamelib-testutil`, `unicode-normalization` 0.1.26 |

---

## Threat Register

61 threats from the 20 plan `<threat_model>` blocks (T-82-01..60 plus T-82-SC, merged across plans 01-16 and 20). T-82-57..60 (gap-closure plan 82-20) verified at L1 on 2026-11-21; T-82-SC re-checked: no package or lockfile change in the 82-20 commits. Evidence is file:line as of the audit; the auditor ran `cargo test -p gamelib-safety -p gamelib-testutil` (green), 24 jest suites / 459 tests (green), `check:ipc-contract` and `planning-gates` 12/12.

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-82-01 | Tampering | storeKinds / themeTokens / clippy pins | high | mitigate | Per-item cause + commit in 82-TEST-LEDGER.md; no `#[allow]`, no knip-baseline additions over the phase range | closed |
| T-82-02 | Repudiation | test-ledger measurement | medium | mitigate | Clean detached-worktree proof head `a8eb655b5` with verbatim counts | closed |
| T-82-03 | Tampering | census gates | high | mitigate | `censusFloor.ts:19-34`; D-05 non-vacuity blocks in ipcDomainCensus / flowRegistrationCensus | closed |
| T-82-04 | Repudiation | floor values | medium | mitigate | Measured counts in 82-02-SUMMARY; floor constants only added, never lowered | closed |
| T-82-05 | Tampering | safe_path lexical + containment | high | mitigate | `safe_path.rs:29-64,182-208`, `remove.rs:92`; adversarial lexical / UNC / verbatim rows | closed |
| T-82-06 | Tampering | links in remove_tree | critical | mitigate | Link located by canonical parent + name, never followed (`safe_path.rs:97-110`); `remove_link` (`remove.rs:326-360`); referent-survives rows | closed |
| T-82-07 | Tampering | check-then-delete race | high | mitigate | `remove_tree` re-evaluates every target and re-reads link-ness at delete time (`remove.rs:351-375`); rust 1.77.2 std race fix | closed |
| T-82-08 | Tampering | sibling deletion | critical | mitigate | Protected roots incl. drive/UNC roots, cross-store nested/inside known installs, sideload shared-folder heuristic (`remove.rs:50-64,113-135,221-253`); `knownInstalls.ts` null when unreadable | closed (residual WR-06, IN-04) |
| T-82-09 | Information Disclosure | crate output | low | mitigate | No logging in the crate; closed-set `Reason` replies (`wire.rs:60-93`) | closed |
| T-82-10 | Denial of Service | dispatch | low | mitigate | `:bad-args`, `deny_unknown_fields`, `catch_unwind` → `:panic` (`lib.rs:27-58`); no `panic = "abort"` | closed |
| T-82-11 | Denial of Service | fileStore deletion | medium | mitigate | Stop clause fired (~27 live test importers); not deleted; D-19 override; follow-up todo | closed |
| T-82-12 | Repudiation | jestMock baseline / ledger line | medium | mitigate | No deletion, so nothing due; nothing added | closed |
| T-82-13 | Elevation of Privilege | rustSafety.ts adapter | critical | mitigate | Single catch site; rejection/timeout → unknown/failed, malformed → bad-reply, remove only after `yes` (`rustSafety.ts:92-170`) | closed |
| T-82-14 | Tampering | rustInvoke args | high | mitigate | `.strict()` zod tuples (`rustInvoke.ts:231-252`); generated `from_args`; crate `deny_unknown_fields` | closed |
| T-82-15 | Information Disclosure | safety_dispatch.rs | low | mitigate | No logging; `safetyChannelParity.test.ts:77` pins it | closed |
| T-82-16 | Spoofing | protected / trust roots | high | mitigate | Roots from `paths.*` / settings only (`protectedRoots.ts:26-45`, gog, bridge, gameUninstall); cancel-delete root gated on settings-derived `allowedRoots` | closed |
| T-82-17 | Information Disclosure | notice payload / log line | medium | mitigate | Closed sets + title only; log line carries kind/outcome/reason | closed |
| T-82-18 | Tampering | renderer store | low | mitigate | `z.strictObject`, `max(300)`; closed-set filtering in `RemovalRefusedNotice.ts:64-98` | closed |
| T-82-19 | Repudiation | notice copy | medium | mitigate | "Nothing was deleted" only for `refused` with a non-`delete-failed` reason; component tests pin it | closed |
| T-82-20 | Tampering | prefix delete on uninstall | high | mitigate | Pre-flight `checkRemoval` before `game.uninstall` (`uninstaller.ts:219-241`); guarded prefix removal | closed |
| T-82-21 | Tampering | sideload delete-files | critical | mitigate | `checkRemoval` (`sideload-folder`) before any mutation; guarded removal; store write after the guard | closed (guard dormant: UI never passes `deleteFiles`) |
| T-82-22 | Denial of Service | library store on refusal | medium | mitigate | Refusal returns before the store write (GOG and sideload) | closed |
| T-82-23 | Tampering | resetHeroic | high | mitigate | `app-data` targets with `trustRoot = appFolder`; refusal returns with no relaunch; timer `unref`'d (`utils.ts:392-435`) | closed |
| T-82-24 | Tampering | appName join in fix/settings deletes | medium | accept | Superseded by a mitigation: quick 261120-ux8 sends `app-data` targets with trust roots; `../escape` refused (`uninstaller.test.ts:133-147`) | closed |
| T-82-25 | Tampering | cxbottle on a symlinked bottle | critical | mitigate | `checkRemoval` before wineserver/cxbottle; a link only via `guardedRemoveTree` (`bridgeBottleLifecycle.ts:207-241`) | closed (residual WR-09) |
| T-82-26 | Repudiation | bottle `refused` status | medium | mitigate | Explicit union member handled in all callers; never counted as removed | closed |
| T-82-27 | Tampering | bridge install root | high | mitigate | Trust root `<bottle>/steamapps/common` + cross-store known installs (`gameUninstall.ts:330-345`) | closed |
| T-82-28 | Tampering | bottle-direct uninstall | critical | mitigate | installdir-shape / conflict refusals kept; `guardedRemoveTree` with trustRoot `commonRoot` | closed |
| T-82-29 | Tampering | native / remove-copies route | high | mitigate | `checkRemoval` on the copy root before `remove_copy` (`acfState.ts:310-365`) | closed (residual WR-05) |
| T-82-30 | Tampering | cancel-delete of a partial install | high | mitigate | `checkRemoval` before the final in-flight check; sync `rmSync` allowlisted by name with reason | closed (residual WR-09) |
| T-82-31 | Tampering | CI=e2e gogdl stub | medium | mitigate | `gog/e2eMock.ts` deleted; `e2eSurfaceGone` passes | closed |
| T-82-32 | Denial of Service | removed gogdl IPC channels | medium | mitigate | Census tests and `check:ipc-contract` pass | closed |
| T-82-33 | Repudiation | proof measurement | medium | mitigate | Ledger provenance: clean worktree, sha read back, 53 ancestors verified | closed |
| T-82-34 | Elevation of Privilege | push to main | high | mitigate | Blocking human checkpoint; one fast-forward push, hook exit 0, no `--no-verify` (documentary) | closed |
| T-82-35 | Tampering | retiring a red suite | high | mitigate | No `.skip` added; only the deleted stub's test removed; "Nothing was retired" | closed |
| T-82-36 | Tampering | suite retirement | high | mitigate | Operator per-suite keep-fixing decisions recorded; none retired | closed |
| T-82-37 | Repudiation | final proof | medium | mitigate | Ledger Verdict names final sha `2345c2686` and run ids | closed |
| T-82-38 | Denial of Service | dead-export / proxy-types deletions | medium | mitigate | `proxy-types.ts` kept after codecheck showed 808 errors; only unused symbols touched | closed |
| T-82-39 | Repudiation | knip baseline | medium | mitigate | 22 lines removed, none added; `knipRatchet.cjs` exact identity set | closed |
| T-82-40 | Repudiation | inventory / ownership docs | low | mitigate | "line (at sha)" column refreshed at the proof head; measurement head recorded | closed |
| T-82-41 | Tampering | CI=e2e legendary/nile stub | medium | mitigate | Both stubs deleted; `e2eSurfaceGone` passes | closed |
| T-82-42 | Denial of Service | removed TestSync channels | medium | mitigate | `DECLARATIONS_FLOOR` 284; census and contract pass | closed |
| T-82-43 | Tampering | remaining CI=e2e branches | medium | mitigate | Zero-hit gate, floor 500, empty-scan case (`e2eSurfaceGone.test.ts:36-100`) | closed |
| T-82-44 | Denial of Service | removed boot branches | medium | mitigate | codecheck, build:sidecar, smoke:sidecar recorded in 82-16-SUMMARY (documentary); gate passes | closed |
| T-82-45 | Elevation of Privilege | absent trust-root branch | high | mitigate | Absent root admits only absent targets; `remove_tree` skips absent targets; adversarial + contract rows | closed |
| T-82-46 | Denial of Service | symlinked trust root | medium | mitigate | Existing root canonicalised with links followed (`safe_path.rs:173-174`) | closed |
| T-82-47 | Tampering | empty trustRoot (WR-04) | high | mitigate | `Some("")` → `unknown(NoTrustRoot)` first (`remove.rs:83`); contract row 12 | closed |
| T-82-48 | Repudiation | lexical_rows drift / emptied fixture | medium | mitigate | Every filter must match a row (`should_panic` probe); `CONTRACT_FLOOR = 12` | closed |
| T-82-49 | Denial of Service | GOG / cancel refused when root absent | high | mitigate | `resolve_trust_root`; contract rows 3-5; three-OS CI; UAT 1b live GOG uninstall with gog-support absent | closed |
| T-82-50 | Tampering | raw recursive delete via DI member call | high | mitigate | Detector matches rm-family calls on any receiver; anti-vacuity injections in both gates | closed (see WR-10) |
| T-82-51 | Tampering | recursive delete with opaque options | medium | mitigate | `opaque-options` reported; gates inject `rmSync(prefix, OPTS)` | closed |
| T-82-52 | Tampering | remaining detector blind spots | low | accept | Non-goals written in `rawRecursiveDeletes.ts:18-25`; Rust delete-time re-check is the primary control | closed (accepted) |
| T-82-53 | Denial of Service | safety_remove_tree cut at 60 s | medium | mitigate | `RUST_SAFETY_REMOVE_TREE` in `UNBOUNDED_RUST_CHANNELS`; check channel stays bounded; pinned in dialogOptionForwarding (G-82-2) | closed (residual IN-06) |
| T-82-54 | Repudiation | fake diverging from the crate | high | mitigate | Fake models the trust-root rule with no off switch; shared fixture with floor 12 on both sides | closed |
| T-82-55 | Tampering | fake deleting outside the temp dir | medium | mitigate | `insideTmp` confinement throws otherwise | closed (residual IN-07) |
| T-82-56 | Repudiation | deferred findings lost | low | mitigate | All 19 review findings dispositioned; deferred-findings todo with valid triage frontmatter; planning-gates 12/12 | closed |
| T-82-57 | Tampering | sharedRedistInstall.test.ts waits (82-20) | medium | mitigate | Every `yieldUntil` (test.ts:960, 1006, 1161, 1281) is followed by an explicit `toHaveLength(1)`; deadline 15 s (:234) inside the 30 s per-test timeout (:222); 5 ms mutant failed; 0 skip/only/retryTimes | closed |
| T-82-58 | Denial of service | 82-20 soak busy loops | low | mitigate | Self-expiring 150 s loops killed by EXIT trap; no busy-loop processes remain after execution | closed |
| T-82-59 | Tampering | 82-20 deadlineMutant test file | low | mitigate | No mutant file in `bridge/__tests__/`; 82-20 commits stage only the test file and ledger | closed |
| T-82-60 | Repudiation | ledger record of the G-82-2-r2 recurrence | low | mitigate | 82-TEST-LEDGER.md:94, :269, :272 name run 44850161668, sha 90ca09d02 and fix commits e5651c5c6 / e91beb1da | closed |
| T-82-SC | Tampering | npm / cargo installs | high | mitigate | package.json / pnpm-lock untouched; lock gains only gamelib-safety, gamelib-testutil, unicode-normalization 0.1.26; `cargoFeatures.test.ts` pins names; legitimacy audit in 82-RESEARCH | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-82-01 | T-82-52 | The raw-delete source gate is a backstop with written non-goals (aliased imports, computed access, rimraf, wrappers, shell rm, unlisted files); the Rust delete-time re-check is the primary control | plan 82-18 threat model | 2026-11-20 |
| AR-82-02 | T-82-25, T-82-30 (WR-09) | The cxbottle delete and the cancel-install `rmSync` run after the Rust check, outside its delete-time re-check; the declared check-then-synchronous-delete under the Phase 75 invariant is present | operator via 82-REVIEW-DISPOSITION.md (deferred, todo 2026-11-21-phase-82-deferred-review-findings) | 2026-11-21 |
| AR-82-03 | T-82-29 (WR-05) | `refuseUnsafeCopy` skips the guard when it cannot place the copy; `remove_copy` keeps its own guards (bounded, D-21) | operator via 82-REVIEW-DISPOSITION.md | 2026-11-21 |
| AR-82-04 | T-82-08 (WR-06, IN-04) | Sideload shared-folder heuristic ignores sub-directories; known-install list skips not-yet-installed entries; both over- or under-refuse in bounded ways | operator via 82-REVIEW-DISPOSITION.md | 2026-11-21 |
| AR-82-05 | T-82-53 (IN-06) | An unresponsive filesystem can hang `safety_remove_tree` without a timeout; the trade-off against cutting a large delete is documented in `sidecarRpc.ts:132-138` | plan 82-18 / review disposition | 2026-11-21 |
| AR-82-06 | T-82-55 (IN-07) | The test fake's temp-dir confinement is lexical, not realpath-based; test-only and latent | operator via 82-REVIEW-DISPOSITION.md | 2026-11-21 |
| AR-82-07 | (unregistered flag, 82-12) | `RUSTSEC-2026-0545` / `-0548` ignored in `src-tauri/deny.toml:17-18` with a written reason; no `UpdaterExt` / `.updater(` use in `src-tauri/src`, though the updater plugin is still registered (`main.rs:1893`) and an endpoint is configured (`tauri.conf.json:71-74`) | operator (82-12-SUMMARY) | 2026-11-21 |

*Accepted risks do not resurface in future audit runs.*

**Open, non-register items noted by the audit (not threats, non-blocking):**
- WR-10: `rawRecursiveDeletes.ts:218` (`if (close < 0) continue`) silently drops a rm call it cannot parse, and `.call`/`.apply` are not on the non-goals list. This weakens the T-82-50 backstop only; the fix is a one-line throw.
- IN-08: POSIX path literals in steam `games.test.ts`. Since fixed for Windows by the 2026-11-20 validation gap fill (`289bd75f9`).
- T-82-21: the sideload-folder guard is unreachable from the UI (82-UAT.md deferred follow-up 2).

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-21 | 57 | 57 | 0 | gsd-security-auditor (ASVS L1, block_on high), via /gsd-secure-phase 82 |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-21
