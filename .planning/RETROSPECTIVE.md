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

## Cross-Milestone Trends

| Milestone | Phases | Plans | Audit | Notable |
|-----------|--------|-------|-------|---------|
| v0.1 Steam Platform | 4 | 16 (+5 quick) | passed | 4-pass SteamGuard debug; instrument-first lesson |
