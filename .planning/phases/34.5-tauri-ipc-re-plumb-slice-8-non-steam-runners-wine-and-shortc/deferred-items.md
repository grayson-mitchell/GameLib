# Phase 34.5 — Deferred Items (out-of-scope discoveries)

Items found during plan execution that are pre-existing and NOT caused by the current task's
changes. Logged per the executor's scope-boundary rule rather than fixed inline.

## Found during 34.5-04 (full backend suite run, Task 2)

1. **`src/backend/sidecar/__tests__/testContainment.test.ts` Block C — `pathShim.test.ts` is
   unclassified.** Plan 34.5-01 added `pathShim.test.ts` (commit `5a7c4b1aa`,
   "test(34.5-01): add pathShim.test.ts — getPath()'s first dedicated suite") but never added it
   to `testContainment.test.ts`'s `STRUCTURALLY_CONTAINED_SUITES` (or `IN_SCOPE_SUITES`) list.
   Confirmed pre-existing by isolating: with only `pathShim.test.ts` present (plan 34.5-04's own
   `runnerSliceRegistration.test.ts` temporarily removed), the same `unclassified: ["pathShim.test.ts"]`
   failure reproduces. Plan 34.5-04 added its own new suite
   (`runnerSliceRegistration.test.ts`) to `STRUCTURALLY_CONTAINED_SUITES` (in scope, since that
   suite is this plan's own addition), but did not touch `pathShim.test.ts`'s entry — that file
   belongs to a different, already-committed plan (34.5-01) and is out of this plan's scope per
   the executor's scope-boundary rule. Needs a one-line addition to
   `STRUCTURALLY_CONTAINED_SUITES` (or `IN_SCOPE_SUITES`, if pathShim's own env-var/homedir
   mocking pattern matches the in-scope kit) in a future plan/pass.

2. **`src/backend/wine/manager/downloader/__tests__/utilities/rest.test.ts` — `unlinkFile` test
   failure.** Fails with `Couldn't remove <filePath>!` inside `utilities.ts:140`'s `unlinkFile`
   catch block. Unrelated to this phase's file set (Wine/DXVK downloader utilities, last touched
   by pre-2026 upstream commits). Not investigated further — out of scope for this plan's file
   set (`runnerAuthFlowRegistration.ts`/`wineToolsFlowRegistration.ts`/
   `shortcutsFlowRegistration.ts`/`runnerMiscFlowRegistration.ts`/`handlers.ts`/
   `runnerSliceRegistration.test.ts`).

3. **`src/backend/__tests__/longRunningChannels.test.ts` — stripper-integrity self-check fails
   against the real `main.rs`.** The "every line of the stripped output has a balanced quote
   count" assertion finds 2 unbalanced lines in `main.rs` (`assert!(!value.starts_with('"'));` /
   `assert!(!value.ends_with('"'));`, single-quoted double-quote-char literals). These lines were
   introduced by an already-committed prior plan in this same wave (34.5-01, commit `97450f701`,
   "feat(34.5-01): hand GAMELIB_SHELL_EXE down from both Rust spawn paths") or an earlier phase's
   `#[cfg(test)]` module — not touched by this plan (34.5-04 touches no `.rs` file). Out of scope
   for this plan; flagged here for a future pass to either fix the stripper's char-literal
   handling or adjust the offending Rust literals.

### Resolution — Wave 1 post-merge gate (orchestrator, 2026-07-29)

- **Item 1 — RESOLVED.** `pathShim.test.ts` added to `STRUCTURALLY_CONTAINED_SUITES` with a
  classification docstring. It declares no `jest.mock(...)` at all (it imports real `os`
  `homedir` + `realHomeAtSetup` so it can assert `getPath()` resolves under the containment
  root), so it is contained by construction and cannot be an `IN_SCOPE_SUITE` — those must
  carry a `jest.mock('../pathShim', ...)`, and this is the suite that tests `pathShim`. Stale
  "30 files" count in the docstring recomputed to 34 (4 in-scope + 30 contained).
- **Item 3 — RESOLVED.** Root cause was the WR-08 guard, not the Rust. `assert!(!value.
  ends_with('"'))` is a valid Rust CHAR literal contributing one `"` to its line; the guard's
  naive `"`-count has no char-literal awareness, so it flagged untruncated code. Added
  `stripRustCharLiterals()` (`/'(?:\\.|[^\\'])'/g` — requires a closing `'` right after one
  char/escape, so lifetimes like `'static` are untouched) and applied it in both WR-08
  assertions, plus a self-test pinning that `'"'` vanishes while a genuinely truncated
  `"steam://` still reads as odd. The guard now measures truncated STRING literals, which is
  the property it was written for. The Rust was left unchanged.
- **Item 2 — NOT REPRODUCED.** `rest.test.ts`'s `unlinkFile` failure did not occur in either
  orchestrator full-suite run (`src/backend`, 123/123 suites, 2603/2603 tests, twice). Treat as
  environment-dependent/flaky rather than a standing failure — but per this project's standing
  lesson ("a flake baseline can be an undiagnosed bug"), it should be reproduced in isolation
  before being dismissed if it reappears.

None of the three items above block this plan's own acceptance criteria (Task 1/Task 2 verify
clauses concern only `npx tsc --noEmit`, the new
`runnerSliceRegistration.test.ts` suite itself, and the recorded exit code/counts of the full
suite — see `34.5-04-SUMMARY.md`'s verbatim recording).

## Found during 34.5-12

4. **`getDefaultSavePath` (`save_sync.ts:17-27`, `main.ts` handler) is genuinely unported and
   is the ACTUAL live caller of `getDefaultGogSavePaths`/`save_sync.ts:146`'s
   `getPath('documents')`, not `syncGOGSaves`.** CONTEXT.md's D-09 and 34.5-RESEARCH.md's Pitfall
   1 both state `getPath('documents')` is "reached via `syncGOGSaves`". Direct verification for
   this plan (reading `storeManagers/gog/library.ts:94`'s `getGame()` and
   `storeManagers/gog/games.ts`'s `syncSaves()` method in full, plus
   `SyncSaves/gog.tsx`'s `getLocations()`) shows `syncGOGSaves`'s own handler chain
   (`getGame(appName).syncSaves(arg, '', gogSaves)`) never calls `getDefaultGogSavePaths` — it
   only iterates the already-resolved `gogSaves` array it is given. The actual (and only) caller
   of `getDefaultGogSavePaths` is the separate `getDefaultSavePath` channel, invoked by the
   frontend BEFORE `syncGOGSaves`, in its own round trip. `getDefaultSavePath` is not one of this
   slice's 38 channels (confirmed absent from `34.5-RESEARCH.md`'s channel list and from every
   sidecar registration module via `grep -rn getDefaultSavePath src/backend/sidecar/`) and remains
   genuinely unported after this plan. This does not change the Discretion question's resolution
   (`documents` still belongs to the saves-sync domain, not shortcuts) — only the specific claim
   about which channel's runtime call path reaches the line. Out of scope for this plan (adding
   `getDefaultSavePath` is a new channel this plan's task list does not include); flagged here for
   a future pass (likely Phase 34.6, alongside the other genuinely-deferred saves-sync/winetricks
   work) to port `getDefaultSavePath` so the frontend's GOG saves-sync settings panel
   (`SyncSaves/gog.tsx`) works end-to-end under the sidecar. See `34.5-12-SUMMARY.md` for the full
   trace and `runnerMiscFlowRegistration.ts`'s header docstring for the in-source correction.

5. **`Jest did not exit one second after the test run has completed` warning on the full
   `npm run test:ci` run (173/173 suites, 3251/3251 tests, exit 0).** This warning is emitted by
   Jest's own process-teardown check across the WHOLE suite, not isolated to this plan's file —
   running `runnerMiscFlows.test.ts` alone (28/28 tests) completes in ~0.2s with no such warning,
   and none of this plan's own mocks start a timer/interval/listener that could explain it. Exit
   code is 0 either way (the warning does not fail the run). Not investigated further — out of
   scope for this plan's two-file change set.

## Found during the 34.5-19/34.5-20 blocking live-gate RE-RUN (2026-08-01), scoped for the next gap cycle

Observation-only findings from `34.5-LIVE-GATE-RERUN.md` (its own "New findings" section) plus the
developer's own verbatim reports. None diagnosed here, per that document's own instruction — this
entry exists so the next gap-cycle plan has a single place to start scoping from, in addition to the
gate document itself. Root causes are UNKNOWN; do not assume any of these share a single fix.

6. **F-34.5-G6-01 — Epic (`legendary`) login form renders but is non-interactive ("greyed out"),
   never resolves.** Item 1's own evidence: 3 login-window opens, 3 `status=timeout`, 0
   `status=captured`, across three separate attempts. Developer, verbatim: *"there is a 'greyed
   out' form. that does not resolve."* Blocks item 1 upstream of everything items 2/3 exposed — the
   OAuth redirect is never even produced to capture. See `34.5-LIVE-GATE-RERUN.md` item 1.

7. **F-34.5-G6-02 — GOG and Amazon both reach `status=captured` at the backend, but nothing
   consumes the capture into a completed, UI-visible login.** Evidence: `runner=gog status=captured`
   (11:15:45) and `runner=nile status=captured` (11:10:10) — in both cases, no follow-up runner-CLI
   auth invocation (`gogdl auth ...` / `nile auth --login ...`) appears anywhere in the log
   afterward, and the frontend's own `[TauriLoginPanel] captured-blocked: runner=...` log line never
   fires for either runner (only the pre-capture `declared-blocked` line is present). The UI stays on
   the "Signing in..." panel. This is downstream of the OAuth capture mechanism itself, which both
   cases prove works — the gap is in whatever is supposed to consume
   `{status: 'captured', code, redirectUrl}` and finish the login. See `34.5-LIVE-GATE-RERUN.md`
   items 2 and 3, and the "Item 2/3 downstream-of-capture" pattern in its Verdict section.

8. **F-34.5-G6-03 — GOG library not populated post-login; GOG absent from the Library filter
   options.** Developer, verbatim: *"I confirmed that GOG games are not showing in Library and Gog
   is not available as a filter option."* Likely the same root cause as item 7 above (nothing
   consumes the capture), but recorded separately since it is the user-visible SYMPTOM the next gap
   cycle will verify against, distinct from the log-level evidence in item 7.

9. **F-34.5-G6-04 — the login window displays no URL/origin to the user.** Developer, verbatim: *"as
   there is no url displayed in the logon flow could not be sure which logon to use."* A usability
   and phishing-resistance defect: the user cannot verify which site they are entering credentials
   into, nor disambiguate between multiple stored credentials for the same domain (the developer
   went to their password manager and could not tell which Amazon login applied).

10. **F-34.5-G6-05 — black-on-black text in the Amazon verification-code field, unreadable until
    highlighted.** Developer, verbatim: *"the text was black on black so could not tell my cut and
    paste worked until i highlighted."* A contrast/theming defect surfacing specifically under the
    embedded WKWebView-driven login window.

11. **F-34.5-G6-06 — signing out of GOG prompted for Keychain approval twice.** Developer, verbatim:
    *"when i signed out was asked to approve keycahin twice."*

12. **`R-34.5-G1-PKG` — the packaged Tauri build's asset root is unresolved; NOT covered by this gap
    cycle's G-1 fix.** Named in `34.5-APP-ROOT-SWEEP.md` § 3: the `GAMELIB_APP_ROOT` handoff (plan
    34.5-16) and the boot self-check (plan 34.5-18) are both proven correct/loud for a **dev** build
    only (`pnpm tauri:dev`, precondition 2/3 of both live-gate contracts). In a packaged build, the
    handed-down root is Tauri's `resource_dir()`, which has no `public/` child — `publicDir`'s
    unconditional `'public'` append (since `electronStub.app.isPackaged` stays `false` under the
    sidecar) would resolve to a path that does not exist, the same defect shape this cycle just
    closed for dev. **Future home: the packaging work, not Phase 34.6's channel port** — this is not
    an unported IPC channel (Phase 34.6 scopes 16 specific channel names: EOS overlay, SteamGridDB,
    winetricks), it is a build/bundle-layout question that only a real `.app` packaging pass can
    resolve and self-check. Whichever plan first exercises a packaged (non-dev) build is the correct
    place to close this residual.
