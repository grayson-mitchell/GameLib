---
phase: 35
slug: electron-cutover-remove-the-electron-build
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-28
updated: 2026-08-28
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

**Standing caveat for this phase, stated once and applying to every row below:** a green jest run is
never sufficient here. Three of this phase's central claims — D-03's electron absence, D-01's
`isTauri()` absence, and D-19's packaged asset root — fail SILENTLY under a passing suite. A
leftover `isTauri` call reaches `dispatchInvoke()`, returns `UNPORTED_CHANNEL_MARKER`, and
`bootErrorSurface.ts` swallows it as a `console.warn`; a `publicDir` resolution defect is invisible
to every test that does not run against a packaged artifact. The automated commands below are the
sampling mechanism, not the closure mechanism.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 via `ts-jest`, multi-project; plus `cargo test` for `src-tauri/` |
| **Config file** | `jest.config.js` (projects: `Backend`, `Common`, `Frontend`, `Preload`, `Meta`) · `src-tauri/Cargo.toml` |
| **Quick run command** | `pnpm test --selectProjects <Project> -- <file>` |
| **Full suite command** | `pnpm test` · `cargo test --manifest-path src-tauri/Cargo.toml` |
| **Estimated runtime** | targeted ~10-40s · full jest ~4-6 min · `cargo test` ~1-3 min (cold build longer) |

**Two recorded traps that make these commands fail OPEN if used carelessly:**
- `--selectProjects` is CASE-SENSITIVE and exits **0** on a name that matches nothing. `Backend`,
  `Common`, `Frontend`, `Preload`, `Meta` — capital first letter. `meta` matches nothing and passes.
- A full `pnpm test` under load manufactures a DIFFERENT failure set than targeted runs. Re-run any
  full-suite red result individually before treating it as a regression.

---

## Sampling Rate

- **After every task commit:** the task's own `<automated>` command (targeted jest, `cargo test`, or
  a `node -e` structural assertion).
- **After every plan wave:** `pnpm test` plus `cargo test --manifest-path src-tauri/Cargo.toml`
  for any wave touching `src-tauri/`.
- **After waves 8-12** (post point-of-no-return): additionally `pnpm exec vite build` and
  `pnpm build:sidecar` — the esbuild resolution leg is NOT covered by `tsc` or jest, and a
  `backend/platform` resolution failure appears only there.
- **Before `/gsd:verify-work`:** full jest green, `cargo test` green, `pnpm build:sidecar` green.
- **Max feedback latency:** ~40s for targeted runs; ~6 min at wave boundaries.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 1 | REQ-35-11 | T-35-01 | `isSea()` agrees across worker/main, or the D-14 unification is blocked | probe | `pnpm codecheck` + OQ-1 disposition check | ❌ W0 (`meta/probeSeaInWorker.ts`) | ⬜ pending |
| 35-01-02 | 01 | 1 | REQ-35-16/20 | T-35-03 | deep-link sources routed through one validation choke point | structural | `node -e` 35-PREFLIGHT structure check | ❌ W0 | ⬜ pending |
| 35-02-01 | 02 | 1 | REQ-35-15 | T-35-05 | every observation names its log sink | structural | `node -e` protocol structure check | ❌ W0 (`35-AB-RETEST.md`) | ⬜ pending |
| 35-02-02 | 02 | 1 | REQ-35-15 | T-35-04 | log excerpts redacted before commit | manual | human checkpoint + `node -e` completeness check | ❌ W0 | ⬜ pending |
| 35-03-01 | 03 | 2 | REQ-35-08 | T-35-08/09 | symlink plugin survives; `emptyOutDir` stays false | unit | `pnpm test --selectProjects Meta -- viteRendererConfig` | ❌ W0 | ⬜ pending |
| 35-03-02 | 03 | 2 | REQ-35-09 | T-35-07 | `frontendDist` untouched; dev-vs-packaged limitation documented | structural | `node -e` config assertion | ✅ | ⬜ pending |
| 35-04-01 | 04 | 3 | REQ-35-11 | T-35-11/12/13 | one fail-closed `isPackaged` derivation; guardrail (c) intact | unit | `pnpm test --selectProjects Backend -- isPackagedSidecar devSecretVault` | ❌ W0 (`isPackagedSidecar.test.ts`) | ⬜ pending |
| 35-04-02 | 04 | 3 | REQ-35-10 | T-35-14/15 | no Electron output bundled; targets under `build/` | structural | `node -e` bundle.resources assertion | ✅ | ⬜ pending |
| 35-04-03 | 04 | 3 | REQ-35-10/11 | T-35-15 | packaged artifact carries the locale tree | manual | human-check on a packaged `.app` | n/a | ⬜ pending |
| 35-05-01 | 05 | 3 | REQ-35-03 | T-35-SC-05 | `conf` legitimacy dispositioned by a human before install | manual | human-check on npmjs.com | n/a | ⬜ pending |
| 35-05-02 | 05 | 3 | REQ-35-03 | T-35-16 | explicit `cwd`; no orphaned credential files | unit | `pnpm test --selectProjects Backend -- cache storeChangeNotifier` | ✅ | ⬜ pending |
| 35-05-03 | 05 | 3 | REQ-35-03 | T-35-17/18/19 | dot-notation round-trip preserved | unit | `pnpm test --selectProjects Backend -- cache storeChangeNotifier` | ✅ | ⬜ pending |
| 35-06-01 | 06 | 2 | REQ-35-04 | T-35-20/21/22 | `recent:` id parsing validated; no `gamelib://` round trip | unit | `cargo test --manifest-path src-tauri/Cargo.toml` | ✅ | ⬜ pending |
| 35-06-02 | 06 | 2 | REQ-35-04 | T-35-24 | no unhonoured tray toggle ships | unit | `pnpm codecheck && pnpm test --selectProjects Frontend` | ✅ | ⬜ pending |
| 35-06-03 | 06 | 2 | REQ-35-04 | T-35-22/24 | tray fails non-fatally; About reachable | manual | human-check | n/a | ⬜ pending |
| 35-07-01 | 07 | 4 | REQ-35-05 | T-35-27 | single-instance choice made against D-44-A's record | manual | human decision checkpoint | n/a | ⬜ pending |
| 35-07-02 | 07 | 4 | REQ-35-05 | T-35-SC | plugin legitimacy confirmed before `cargo add` | manual | human-check on crates.io | n/a | ⬜ pending |
| 35-07-03 | 07 | 4 | REQ-35-05/16 | T-35-25/26/30 | every URL re-validated; no payload logged | unit | `cargo test --manifest-path src-tauri/Cargo.toml` | ✅ | ⬜ pending |
| 35-07-04 | 07 | 4 | REQ-35-05/16 | T-35-25/28 | packaged OS registration delivers to the running instance | manual | human-check on a packaged `.app` | n/a | ⬜ pending |
| 35-08-01 | 08 | 5 | REQ-35-06 | T-35-32/33/34 | unrecognised assertion kind rejected, not defaulted | unit | `cargo test --manifest-path src-tauri/Cargo.toml` | ✅ | ⬜ pending |
| 35-08-02 | 08 | 5 | REQ-35-06 | T-35-31 | `stop(id)` releases exactly what `start` returned | unit | `pnpm test --selectProjects Backend -- wakeLock` | ❌ W0 (`wakeLock.test.ts`) | ⬜ pending |
| 35-08-03 | 08 | 5 | REQ-35-06 | T-35-31 | no assertion survives a force-quit | manual | `pmset -g assertions` human-check | n/a | ⬜ pending |
| 35-09-01 | 09 | 6 | REQ-35-07 | T-35-35/36/39/40 | residual cookie count maps to `Err`, never `Ok` | unit | `cargo test --manifest-path src-tauri/Cargo.toml` | ✅ | ⬜ pending |
| 35-09-02 | 09 | 6 | REQ-35-07 | T-35-35 | a failed clear does not report a successful logout | unit | `pnpm test --selectProjects Backend -- webviewDataClear` | ❌ W0 (`webviewDataClear.test.ts`) | ⬜ pending |
| 35-09-03 | 09 | 6 | REQ-35-07 | T-35-35/37 | credentials required again after logout | manual | human-check, 34.6 Step 8 re-run | n/a | ⬜ pending |
| 35-10-01 | 10 | 7 | REQ-35-16 | T-35-41/42 | debounce preserved; watcher teardown works | unit | `pnpm test --selectProjects Backend -- installedJsonWatcher` | ❌ W0 | ⬜ pending |
| 35-10-02 | 10 | 7 | REQ-35-16 | T-35-43/44 | send channel reaches a handler; RED-proven | unit | `pnpm test --selectProjects Backend -- winetricksInstallChannel` | ❌ W0 | ⬜ pending |
| 35-11-01 | 11 | 3 | REQ-35-17 | T-35-45/49 | destructive dialog's cancel path intact | unit | `pnpm codecheck && pnpm test --selectProjects Backend` | ✅ | ⬜ pending |
| 35-11-02 | 11 | 3 | REQ-35-17 | T-35-46/47/48 | auto-resume suppression enforced, not intended | unit | `pnpm test --selectProjects Backend` + SEAM disposition check | ✅ | ⬜ pending |
| 35-11-03 | 11 | 3 | REQ-35-17 | T-35-45 | both dialogs render in light and dark | manual | human-check | n/a | ⬜ pending |
| 35-12-01 | 12 | 4 | REQ-35-12 | T-35-50/52/53 | no script or workflow points at a deleted path | structural | `node -e` flatpak/flathub assertion | ✅ | ⬜ pending |
| 35-12-02 | 12 | 4 | REQ-35-12 | T-35-51 | over-reach control: `nsis`/`dmg` survive | unit | `pnpm test --selectProjects Meta -- artifactTargets` | ❌ W0 | ⬜ pending |
| 35-13-01 | 13 | 7 | REQ-35-01 | T-35-54/55/57/58 | alias repointed; esbuild leg proven separately | unit | `pnpm build:sidecar && pnpm test --selectProjects Backend Meta` | ✅ | ⬜ pending |
| 35-13-02 | 13 | 7 | REQ-35-02 | T-35-56 | declarations proven against real usage while electron still exists | unit | `pnpm codecheck && pnpm test --selectProjects Backend` | ❌ W0 (type-usage assertion module) | ⬜ pending |
| 35-14-01 | 14 | 8 | REQ-35-14 | T-35-59/60 | zero `MISSING` rows; tag pushed before deletion | structural | `git cat-file -t` + checklist assertion | ❌ W0 (`35-CUTOVER-CHECKLIST.md`) | ⬜ pending |
| 35-14-02 | 14 | 8 | REQ-35-14 | T-35-64 | e2e coverage loss dispositioned, not silent | manual | human decision checkpoint | n/a | ⬜ pending |
| 35-14-03 | 14 | 8 | REQ-35-13/14 | T-35-61/62/63/65 | `preload/api/*` intact; alias + `electron` survive | build | `pnpm exec vite build && pnpm build:sidecar && pnpm codecheck && pnpm test` | ✅ | ⬜ pending |
| 35-15-01 | 15 | 9 | REQ-35-01 | T-35-70 | no module deleted without an importer grep | unit | `pnpm codecheck && pnpm test --selectProjects Backend` | ✅ | ⬜ pending |
| 35-15-02 | 15 | 9 | REQ-35-01/02 | T-35-66/67/69 | one line changed per file; esbuild leg green | build+unit | `pnpm build:sidecar && pnpm codecheck && pnpm test --selectProjects Backend` | ✅ | ⬜ pending |
| 35-15-03 | 15 | 9 | REQ-35-02 | T-35-68/71 | baseline tracks the real graph, both directions | unit | `pnpm test --selectProjects Backend -- electronReachLedger` | ✅ | ⬜ pending |
| 35-16-01 | 16 | 10 | REQ-35-18 | T-35-72/73/74/75 | allow-list subsumes deny-list BEFORE deletion | unit | `pnpm test --selectProjects Common -- storePolicy` | ✅ | ⬜ pending |
| 35-16-02 | 16 | 10 | REQ-35-18/03 | T-35-76 | all three colliding concerns in one edit | unit | `pnpm test --selectProjects Preload Common && pnpm codecheck` | ✅ | ⬜ pending |
| 35-16-03 | 16 | 10 | REQ-35-02 | T-35-77/78 | no `any` widening; grep-invisible forms cleared | unit | `pnpm codecheck && pnpm test --selectProjects Preload Frontend Common` | ✅ | ⬜ pending |
| 35-17-01 | 17 | 11 | REQ-35-19 | T-35-79/83 | per-form tally sums to the measured count | unit | `pnpm codecheck && pnpm test --selectProjects Backend Frontend Preload Common` | ✅ | ⬜ pending |
| 35-17-02 | 17 | 11 | REQ-35-19 | T-35-80/81/82 | static gate, un-anchored, mutation-proven | unit | `pnpm test` + zero-match grep | ❌ W0 (absence gate) | ⬜ pending |
| 35-18-01 | 18 | 12 | REQ-35-02 | T-35-84/87/88 | inverted guard; mock proven to still apply | build+unit | `pnpm build:sidecar && pnpm build:decompress-worker-dev && pnpm test --selectProjects Meta Backend` | ✅ | ⬜ pending |
| 35-18-02 | 18 | 12 | REQ-35-02 | T-35-85/86 | reference-form gate, mutation-proven 4 ways | unit | `pnpm test --selectProjects Meta -- electronAbsence` | ❌ W0 | ⬜ pending |
| 35-18-03 | 18 | 12 | REQ-35-21 | T-35-89 | every accepted gap stated in user language | structural | `node -e` release-notes structure check | ❌ W0 (`35-RELEASE-NOTES.md`) | ⬜ pending |
| 35-19-01 | 19 | 13 | REQ-35-20 | T-35-91/92 | contract passes the 7 defect-class tests | structural | `node -e` contract structure check | ❌ W0 (`35-LIVE-GATE.md`) | ⬜ pending |
| 35-19-02 | 19 | 13 | REQ-35-20 | T-35-96 | "plus a smoke launch" has a named owner | manual | human decision checkpoint | n/a | ⬜ pending |
| 35-19-03 | 19 | 13 | REQ-35-20 | T-35-90/93/94/95/97 | measured on the packaged artifact; FAIL stays FAIL | manual | human-check + `node -e` completeness assertion | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Every `❌ W0` row above names a file the plan that owns it creates as part of its own work. There is
no separate Wave 0 plan and no framework install is needed — jest, `ts-jest`, `cargo test` and the
existing `electronStub`/`protocol`/`devSecretVault`/`storePolicy`/`electronReachLedger` suites are
all present in the tree today. The list, grouped by owner:

- [ ] `meta/probeSeaInWorker.ts` — plan 35-01, the `node:sea` worker-thread probe (**security-gating**)
- [ ] `35-PREFLIGHT.md`, `35-AB-RETEST.md`, `35-CUTOVER-CHECKLIST.md`, `35-RELEASE-NOTES.md`, `35-LIVE-GATE.md` — planning artifacts with structural assertions
- [ ] `meta/__tests__/viteRendererConfig.test.ts` — plan 35-03
- [ ] `src/backend/sidecar/__tests__/isPackagedSidecar.test.ts` — plan 35-04 (**security-gating**)
- [ ] `src/backend/sidecar/__tests__/wakeLock.test.ts` — plan 35-08
- [ ] `src/backend/sidecar/__tests__/webviewDataClear.test.ts` — plan 35-09 (**security-gating**)
- [ ] `src/backend/sidecar/__tests__/installedJsonWatcher.test.ts` and `winetricksInstallChannel.test.ts` — plan 35-10
- [ ] `meta/__tests__/artifactTargets.test.ts` — plan 35-12
- [ ] a type-usage assertion module for `backend/platform/types.ts` — plan 35-13, and it **must be authored while the real `electron` types still exist to compare against**; after plan 35-18 that comparison is impossible
- [ ] the `isTauri` static absence gate — plan 35-17
- [ ] `meta/__tests__/electronAbsence.test.ts` — plan 35-18

**Three extensions to EXISTING suites are security-gating and are sequenced as gates, not cleanup:**
- [ ] `src/common/types/__tests__/storePolicy.test.ts` — a separately-named assertion per formerly
      deny-listed field plus nested-path cases, **green BEFORE `SECRET_STORE_KEYS` is deleted**
      (plan 35-16). A gap found afterwards is a live credential-exposure regression.
- [ ] `src/backend/sidecar/__tests__/devSecretVault.test.ts` — a worker-thread-context case, required
      only if plan 35-01's OQ-1 disposition is `DIVERGES` (plan 35-04).
- [ ] `src/backend/__tests__/cache.test.ts` — a `conf`-vs-`electron-store` round-trip fixture reading
      a file laid out by the old backend, settling the `userData` path-parity question empirically
      (plan 35-05).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Packaged asset root resolves; locales present in the artifact | REQ-35-10, REQ-35-11 | Requires a real `tauri build` and a mounted/inspected `.app`. The `CI=e2e` harness both the ROADMAP and CONTEXT.md cite is **Electron-backed and does not survive this phase** | 35-04 Task 3 |
| Tray menu, About window, honoured tray settings | REQ-35-04 | Rust-side OS tray; jest cannot reach Rust or the OS menu bar | 35-06 Task 3 |
| OS-level `gamelib://` delivery to a running instance | REQ-35-05 | macOS registers `CFBundleURLTypes` at BUILD time; a dev run cannot prove registration | 35-07 Task 4 |
| Real OS power assertions held and released | REQ-35-06 | `IOPMAssertionCreateWithName` / `SetThreadExecutionState` / `systemd-inhibit` are syscalls unreachable from jest | 35-08 Task 3, via `pmset -g assertions` |
| Logout genuinely clears the session | REQ-35-07 | Verifying a real browser-engine data clear needs a live webview and an independent post-clear read — the spike's own "never trust the removal call's completion signal" discipline | 35-09 Task 3 |
| Dialog rendering in light and dark themes | REQ-35-17 | A CSS class in a mock render tree passes against a 100% dead stylesheet; this project has shipped that failure | 35-11 Task 3 |
| A/B reproduction of 7 parked bugs under both shells | REQ-35-15 | Requires driving two GUI shells; the signal is destroyed permanently after plan 35-14 | 35-02 Task 2 |
| Package legitimacy (`conf`, `tauri-plugin-deep-link`) | REQ-35-03, REQ-35-05 | `[SUS]`/registry verdicts are never auto-approvable | 35-05 Task 1, 35-07 Task 2 |
| Single-instance / Windows deep-link platform choice | REQ-35-05 | A recorded decision (D-44-A) contradicts the research recommendation; the tradeoff is the developer's | 35-07 Task 1 |
| e2e suite disposition | REQ-35-14 | Deletes real test coverage; must not be a side effect of a deletion list | 35-14 Task 2 |
| Windows/Linux smoke-launch ownership | REQ-35-20 | D-16's own wording is ambiguous and CI performs no runtime check | 35-19 Task 2 |
| The packaged macOS arm64 live gate | REQ-35-20 | The phase's blocking closure gate; a green suite never closes a live gate | 35-19 Task 3 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a named Wave 0 dependency, or are `checkpoint:*` tasks with a `<human-check>`
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — the longest manual run is 35-07 Tasks 1-2 (two decision/legitimacy checkpoints), immediately followed by Task 3's `cargo test`
- [x] Wave 0 covers all `❌ W0` references, each assigned to the plan that creates it
- [x] No watch-mode flags in any command
- [x] Feedback latency < 40s for targeted runs
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-28
