# GameLib — Living Retrospective

## Milestone: v0.1 — Steam Platform

**Shipped:** 2026-06-29
**Phases:** 4 | **Plans:** 16 (+5 quick tasks)

### What Was Built

Steam as a first-class platform in a Heroic fork: QR + credential/SteamGuard auth (`steam-session`/`steam-user`), unified library with ACF install-state + playtime + store metadata, launch/install/uninstall via `steam://` with an ACF poller owning real status, Proton delegation on Linux, and a full GameLib rebrand. Audit: passed, 14/14 requirements, 0 blockers.

### What Worked

- **Auth-first phase sequencing** — building authentication before library/ops meant every downstream phase had a real authenticated account to integrate against.
- **Reusing Heroic's Runner/storeManager abstractions** — `satisfies Record<Runner, LibraryManager>` made Steam genuinely first-class with compile-time guarantees, not a bolt-on.
- **The ACF poller as the single owner of Steam operation status** — once established, it cleanly resolved the install/uninstall badge-flash by guarding the shared DownloadManager emissions with `runner === 'steam'`.
- **Real-environment human UAT** — caught three integration bugs that all the unit tests and static analysis missed.

### What Was Inefficient

- **Static-only debugging burned cycles.** The email/credential SteamGuard bug took FOUR passes: two fixes (casing normalization, then `loginTimeout`) were diagnosed from reading code without the real error, and both shipped before being disproven by real-environment testing. The shared-session race was a third wrong turn. The actual cause (no session listeners during the guard wait → DeviceConfirmation poll silently cancels) only surfaced once diagnostic logging exposed the real steam-session error and `validActions`.
- **Swallowed errors hid the root cause.** The credential path logged a generic "invalid code" while the real `EResult`/message was discarded — the single biggest contributor to the wasted cycles.
- **SUMMARY `requirements_completed` frontmatter was never populated**, weakening the milestone audit's automated 3-source cross-reference and forcing manual reconciliation.
- **Stale status fields** (UAT `reopened`, VERIFICATION `human_needed`, REQUIREMENTS checkboxes, the milestone audit `gaps_found`) all lagged the actual work and had to be reconciled at close.

### Patterns Established

- **steam-session lifecycle is subtle:** QR, credential, and DeviceConfirmation flows all poll and can self-cancel; any flow that returns control to the UI mid-login MUST attach `authenticated`/`error`/`timeout` listeners for the session's whole lifetime (the QR flow did this; the credential flow didn't — that was the v0.1 bug).
- **`steam://` is fire-and-forget:** never derive completion status from the protocol call; an ACF `StateFlags` poller is the source of truth.
- **Guard shared cross-store code (DownloadManager) with `runner === 'steam'`** rather than forking it — keeps Epic/GOG/Amazon byte-for-byte unchanged and stays upstream-mergeable.

### Key Lessons

1. **For anything that touches a live external service, instrument and get real data before proposing a fix.** Static code reading produced three confident-but-wrong diagnoses here.
2. **Never swallow an external library's error** — log the real `EResult`/message permanently. The fix that finally worked also made this permanent.
3. **Populate requirement-completion frontmatter as phases close** so milestone audits can verify automatically instead of by hand.

### Cost Observations

- Model mix: opus for planning/orchestration; sonnet for execution/debugging/integration-checking.
- Heavy use of worktree-isolated executors + background agents for the fix → merge cycles.
- Notable: the single SteamGuard bug consumed more agent time than any phase — almost entirely due to static-first diagnosis before instrumenting.

## Milestone: v0.8 — Tauri Shell

**Shipped:** 2026-10-16 (override closeout)
**Phases:** 45 | **Plans:** 554 (1,212 tasks; 235 quick tasks still unarchived under `.planning/quick/`)

### What Was Built

A Rust/Tauri v2 shell with a headless Node sidecar replaced Electron end to end: real OS-keyring token storage, ~200 IPC channels re-plumbed slice by slice behind a declared ported-vs-stubbed seam, Windows/Linux/macOS packaging with signing, notarization and a fork-pointed updater, and the Electron cutover verified against a genuine release artifact. After the cutover: embedded login and store webviews under WKWebView, the card-tab navigation and library-filter redesign, Steam install-time bottle parity, Humble key identity and a unified keys screen, the native Winetricks UI, and cross-store signed-out/offline mode. 6,240 commits over 88 days.

### What Worked

- **Slice-by-slice porting behind `SEAM.md`** — each IPC domain slice declared its ported channels in a `NN-PORTED-CHANNELS.md`, so the boundary was always written down rather than discovered; porting ran at ~12 channels a day.
- **Live gates on real hardware as the arbiter** — every WKWebView-vs-Chromium divergence (8 by August, more after) was found by a human driving the app, never by the ~3,500-test suite. Phases that scheduled a blocking live gate (34.4.2, 48, 49) closed cleanly; the ones that did not (45) still owe one.
- **Measuring before fixing** — the App.css shell-column hypothesis (261015-dlu) was refuted in two headless engines before any CSS changed; the histogram-contrast "defect" turned out to be a sampler artifact. Both saved a wrong fix.
- **Acknowledge-at-close tooling** — the `audit-open acknowledge` writer made the 569-item pre-close audit tractable; 429 markers are verdict-preserving and self-invalidating.

### What Was Inefficient

- **Verification lagged execution by months.** 26 of 45 phases closed without a passed VERIFICATION.md — Phase 27 never had one; 28/30/32/33/34/35 sat at `human_needed` since July. The close had to be an override. The v0.1 lesson ("stale status fields all lagged the actual work") repeated at ten times the scale.
- **Executor self-reports were false in bulk.** Phase 50's four executor "Self-Check: PASSED" claims were all wrong (filtered run read as full pass, invented blame date, silent disclosure, nonexistent field). Re-measuring against a pre-wave baseline became mandatory.
- **The milestone was never audited at full scope.** The only audit is a July partial over Phases 27–28; nothing audited 29–50 before close.
- **Milestones v0.2–v0.7 were never archived**, so ROADMAP.md grew to 6,008 lines and REQUIREMENTS.md to 2,354 with no v0.8 section at all; the v0.8 archive swept them up under one label.
- **Planning-ledger shapes defeated the tooling.** 7 quick-task frontmatters were unparseable YAML; 140 evidence-table rows in five ledgers can never carry an acknowledgment marker; three entries had prose on their `**Status:**` line that the writer would have destroyed.

### Patterns Established

- **Two profiles for every spawn test**: `createFakeHomeProfile()` isolation by default, plus a named real-profile arm where the defect only arms under a populated profile.
- **Sidecar exit contract**: `unref()` every handle AND bound in-flight boot work; exit is by event-loop drain at stdin EOF.
- **UAT item shape** (`### N.` at column 0, inline `expected:`, `result:` opening with a status word) and the mandatory scoped `npx prettier --check` in every `<verify>` block.
- **Dev vault vs real keyring**: `pnpm tauri:dev` is a dev vault — a warm signed-in gate arm measures nothing; `tauri:dev:keyring` is the only real-keyring variant.
- **Raise renderer state from the Web Inspector console** by wrapping the `window.api` drain, instead of hosts blackholes and 45 s timeouts.

### Key Lessons

1. **Schedule the VERIFICATION.md as part of the phase, not after it.** A phase whose verification is `human_needed` for three months is not closed; the milestone inherits the debt and the close becomes an override.
2. **Run `/gsd-audit-milestone` at full scope before `/gsd-complete-milestone`.** The pre-flight here found 569 open artifacts the partial audit never saw.
3. **Archive each milestone when it ships.** Six unarchived milestones made the v0.8 archive a 6,000-line roadmap and a requirements file with no section for the milestone being closed.
4. **Treat every executor green claim as self-asserted** and re-measure against a pre-wave worktree baseline.
5. **Keep `deferred-items.md` ledgers marker-friendly**: no prose on the `status:` line, and evidence tables are not deferred work — put them in the phase's UAT or SUMMARY instead, or the audit will count every row as open forever.

### Cost Observations

- Model mix: opus for planning/orchestration/live-gate adjudication; sonnet for executors and reviewers. Sequential executors routinely took 35 minutes before their first write; gates were ~26 s of a 55-minute run, subagent round-trips ~70%.
- Sessions: not counted; 235 quick tasks and 21 debug sessions in the milestone window.
- Notable: three sessions once worked the same task in one tree; `ListAgents` first and an in-prompt HEAD assertion became the rule.

## Cross-Milestone Trends

| Milestone | Phases | Plans | Audit | Notable |
|-----------|--------|-------|-------|---------|
| v0.1 Steam Platform | 4 | 16 (+5 quick) | passed | 4-pass SteamGuard debug; instrument-first lesson |
| v0.2–v0.7 | 22 | ~200 | v0.2 gaps_found; others none | never archived; v0.7 never closed (Phase 23 gaps) |
| v0.8 Tauri Shell | 45 | 554 (+235 quick) | partial, gaps_found (27–28 only) | override closeout; 26/45 unverified; 429 acknowledged, 140 table rows un-markable |
