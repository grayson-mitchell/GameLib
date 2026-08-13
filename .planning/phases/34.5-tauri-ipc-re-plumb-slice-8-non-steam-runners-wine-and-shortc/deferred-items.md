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

## Found during the 34.5-40/34.5-41 blocking live-gate RE-RUN 2 (2026-08-02) — gap cycle 5

Verdict `FAIL`: `items_passed: 0`, `items_failed: 2` (items 2, 4), `items_blocked: 1` (item 1),
`items_not_attempted: 2` (items 3, 5). Evidence: `34.5-LIVE-GATE-RERUN-2.md`. The run spanned two
sessions with different secret-store arms — session A (21:23:55) `keyring`, a deviation from
D-CYCLE5-B; session B (21:42:53) `dev-vault`. Both preserved as
`~/Library/Logs/GameLib/gamelib.log.34.5-g6-gate3-sessionA` / `-sessionB`.

### Disposition of items 6-11 (F-34.5-G6-01..06) against this run

> **UPDATE 2026-08-03T22:15 — item 6 / F-34.5-G6-01 is now CLOSED.** The "STILL OPEN" text below is
> the accurate record of the 2026-08-02 gate-3 run and is left unedited. Closed by the debug session
> `.planning/debug/resolved/epic-login-non-interactive.md` (archived): the 403 was Talon
> fingerprinting Tauri's injected globals, fixed by building Epic's login window as a raw
> `WKWebView` with zero Tauri injection (`03b75211a`); the post-auth redirect is now captured
> natively by `decidePolicyForNavigationAction`, so no in-page JS is injected anywhere and the
> `epic_oauth_redirect_observer_script` referenced below has been DELETED (`da529ca86`). Live-proven
> 2026-08-03 20:26-20:28 — the first genuinely logged-out Epic login ever driven under Tauri —
> `nav host=www.epicgames.com` → `nav host=localhost` → `status=captured` → `Game list updated, got
> 15 games & DLCs`, operator-confirmed in the UI. `U-34.5-06` retired; `U-34.5-11` retired as
> subject-deleted. Phase 34.5 closure is unaffected and remains open.

- **Item 6 / F-34.5-G6-01 (Epic non-interactive) — STILL OPEN.** This run drove two login windows
  and reproduced the parked pre-auth defect: operator-observed HTTP 403 on `/id/api/email/exists`
  (webview devtools, not in the log) plus two `[oauthLoginCapture] runner=legendary status=timeout`
  lines (21:31:10, 21:32:33) and zero `status=captured`. 403 and `timeout` are recorded as DISTINCT
  observations, per the debug file's own instruction not to treat them as interchangeable. Whether
  `epic_oauth_redirect_observer_script` injected was NOT OBSERVED — recorded as not observed, not as
  absent.
- **Item 7 / F-34.5-G6-02 (capture reaches the backend, nothing consumes it) — CLOSED, live-proven.**
  `[useTauriOAuthLogin] runner=gog phase=idle (login completed, library refresh triggered)` fired
  TWICE (21:30:41, 21:31:51), against run 2's six backend terminal outcomes and zero such lines. The
  full chain ran: capture → `gogdl auth` → `refreshLibrary complete runner=gog managers=1` →
  7 games persisted to `store_cache/gog_library.json`.
- **Item 8 / F-34.5-G6-03 (GOG library not populated) — STILL OPEN, but RE-CHARACTERISED.** It is no
  longer a data-acquisition failure: the backend persisted 7 titles. The remaining defect is
  frontend-render-only — a third distinct layer, downstream of both prior runs' root causes. See
  item 19 below.
- **Item 9 / F-34.5-G6-04 (login window shows no URL/origin) — NOT RE-OBSERVED.** The title-bar
  transcription items 1-3 require was not gathered. The log does show a backend nav-origin change
  (`host=login.gog.com` 21:30:02 → `host=embed.gog.com` 21:30:30), which is log-observed, NOT the
  title-bar transcription the item asks for.
- **Item 10 / F-34.5-G6-05 (black-on-black Amazon code field) — NOT RE-OBSERVED.** Item 3 was NOT
  ATTEMPTED; no Amazon login window was opened.
- **Item 11 / F-34.5-G6-06 (GOG sign-out prompted for Keychain twice) — NOT RE-OBSERVED.** Session A
  ran the `keyring` arm but its reads TIMED OUT rather than prompting to completion
  (`keyring failure memoized slot=humble-session class=timeout ms=120000` and the same for
  `slot=steam-refresh-token`, both 21:24:40). Session B ran `dev-vault` and issues no real
  `keyring_get` at all.

### New findings, carried observation-only and undiagnosed

13. **F-34.5-G6-07 — the `nativeImage` sidecar stub structurally blocks every macOS `.app`
    shortcut.** `src/backend/sidecar/electronStub.ts:651` exports
    `nativeImage = { createFromPath, createFromDataURL, createEmpty }`, each returning a bare `{}`;
    `createFromBuffer` does not exist. `convertPngToICNS` (`shortcuts.ts:256-263`) calls
    `nativeImage.createFromBuffer(...)` and throws `TypeError: import_electron20.nativeImage.createFromBuffer is not a function`,
    caught into `return false`, surfacing only as the generic `Error generating MacOS App`
    (21:59:52). Even with `createFromBuffer` present, the chained `.resize().crop().toPNG()` would
    throw on the bare `{}`. **This makes `addShortcut` → `generateMacOsApp` → `shortcuts.ts:227`
    unreachable for EVERY macOS game — not target-specific, not icon-format-specific.** Same family
    as the known `safeStorage` dead-stub defect; the stub is commented "safe no-ops; out of scope per
    27-CONTEXT". Scope for gap cycle 6.
14. **F-34.5-G6-08 — `addToSteam` returns `undefined` instead of a boolean while its side effect
    succeeds.** `await window.api.addToSteam('1207659037','gog')` returned `undefined`, yet
    `shortcuts.vdf` was written and `Alan Wake was successfully added to Steam.` logged (22:00:22).
    `GameSubMenu/index.tsx:220` does `.then((added) => setAddedToSteam(added))`, so the UI toggle
    would never flip even on success.
15. **F-34.5-G6-09 — the Tauri shell ignores Electron-shaped launch arguments and boots a second
    instance.** Running the VDF's own recorded invocation
    (`gamelib-shell --no-gui --no-sandbox "gamelib://launch?appName=1207659037&runner=gog"`) started
    a whole second GameLib: it spawned its own sidecar, opened devtools and re-initialised the
    library stores. It did not honour `--no-gui`, did not handle the `gamelib://` deep link (zero
    `handleProtocol` lines) and did not detect the running instance. `--no-sandbox` is an Electron
    flag.
16. **F-34.5-G6-10 — `getInstallInfo` is unported AND absent from `IPC-PORT-INVENTORY.md`.** It is a
    real channel (`src/common/types/ipc.ts:218`, `src/preload/api/helpers.ts:43` via
    `makeHandlerInvoker`), it is not registered in the sidecar, and it appears in none of the
    inventory's buckets. It blocked the game page entirely
    (`[GAMELIB_UNPORTED_CHANNEL] No handler registered for channel 'getInstallInfo'`).
    **The inventory that gates Phase 35 is therefore not exhaustive**; `ported-channels-gate.py`
    verifies the 38+3+16=57 split reconciles internally, NOT that the inventory covers the real
    preload surface. No audit of that surface has been done, so **the extent is UNKNOWN and must not
    be assumed to be one channel.**
17. **F-34.5-G6-11 — the contract's own prescribed item-4 invocation would have been a guaranteed
    non-event.** This machine's globals are `addDesktopShortcuts: false`, `addStartMenuShortcuts:
    false`, `addSteamShortcuts: false`; `shortcuts.ts:65,71` gate the writes on
    `if (addDesktopShortcuts || fromMenu)` / `if (addStartMenuShortcuts || fromMenu)`. The
    preflight's `addShortcut(appName, runner, false)` (`fromMenu=false`) would have written nothing
    and raised nothing. The operator used `true`. Recorded as a DEVIATION from the contract AND as a
    contract/preflight defect of the same class the preflight itself caught for item 5's
    toolkit/VKD3D traps.
18. **F-34.5-G6-12 — GOG's backend chain fully succeeds while the UI renders nothing.** 7 titles
    persisted (`store_cache/gog_library.json`, 9867 bytes, 21:33) with no games visible in the
    Library. A third distinct failure layer.
19. **F-34.5-G6-13 — `phase=cancelled-midflight at=auth authStatus=done` fires immediately before
    each successful `phase=idle`** (21:30:41, 21:31:51). Recorded without diagnosis.
20. **F-34.5-G6-14 — `[refreshLibrary] runner=all origin=unknown` still occurs** (21:32:47),
    violating item 2's clause (g) requirement that every `[refreshLibrary]` line carry a
    non-`unknown` origin.
21. **F-34.5-G6-15 — `gamelib.log` rotated mid-gate and the live file lost the run.** Evidence was
    recovered from `gamelib.log.old` and preserved under the `.34.5-g6-gate3-sessionA/B` suffixes. A
    gate that reads its evidence from the live log is one rotation away from losing it.
22. **REQUIREMENTS.md inconsistency, for gap cycle 6 to scope.** REQ-34.5-01/02/03/04/05/12 are
    already checked `[x]` from earlier build-out plans, predating any gate run — yet those
    requirements carry gate-passing conditions that have now FAILED three times. Flagged by plan
    34.5-41 and left untouched by both 34.5-41 and 34.5-42, since `REQUIREMENTS.md` is in neither
    plan's `files_modified`.

### 23. Steam identity in the repo — DEVELOPER DECISION RECORDED 2026-08-02: redact forward, do not rewrite history

Found by plan 34.5-42's credential sweep. **Two values for the same identity, with opposite exposure:**

| Value | Files at HEAD | Already published | Earliest commit |
|---|---|---|---|
| SteamID3 account id (`userdata/<id>`) | 4, all `.planning/phases` | **0** | `49fdaad79`, 2026-07-29, unpushed |
| SteamID64 (the profile-URL number) | 37 | **37 — public since 2026-07-14** | `fb84eb850`, published |

The two are trivially interconvertible (`SteamID64 = accountid + 76561197960265728`), so redacting
one while the other is public changes nothing about what is findable. The published one spans
`.claude/skills/`, `.planning/spikes/`, `.acf` snapshots and
`src/backend/storeManagers/steam/bridge/__tests__/`.

**Decision (developer, 2026-08-02): redact forward only.**
- The 4 unpublished planning files were scrubbed to `userdata/<REDACTED>` — free, since none had
  been pushed.
- The 37 published files and all git history are **left untouched, deliberately.** A SteamID64 is a
  public identifier, not a credential; it grants no access. The exposure is identity linkage
  (GitHub ↔ Steam profile), which the developer accepts. Rewriting published history would require a
  force-push, would leave orphaned objects on GitHub until a support request, and would not reach
  existing clones or caches — real cost for partial erasure of an already-indexed public value.
- **New documents must use `userdata/<REDACTED>`**, which `T-34.5-C5-06` already requires and gap
  cycle 5's own documents already follow.

**This item is CLOSED by decision, not by remediation.** Future credential sweeps will still match
the SteamID64 in those 37 published files — that is expected and must NOT be re-raised as a new
finding or spent another cycle on. Anything genuinely new (a token, cookie, session id, OAuth code,
or a NEW unredacted account id in an unpublished file) is still in scope and still blocks.

## Found during gap cycle 6 (plan 34.5-50) — the fourth blocking-gate contract's authoring

### 24. D-CYCLE6-A — Epic login is DESCOPED from Phase 34.5's blocking gate; Phase 34.7 is the OWNER

Recorded per `34.5-CYCLE6-ROUTING.md` § D-CYCLE6-A, at the authoring of the fourth blocking live
gate (`34.5-LIVE-GATE-RERUN-3.md`), so the descope is on record in a place a future reader will
find before citing the gate's own item count as an oversight.

**What is descoped, and to whom.** Gate item 1 (Epic login completed from scratch, populated
library) is **DESCOPED** from Phase 34.5's blocking live gate. **Phase 34.7 is the OWNER** — the
phase that builds Epic's replacement login path. The blocker mechanism, named precisely: the
**operator decision of 2026-08-05**. No further time is ever spent on the Epic alt-login/403
defect, ever, and Phase 34.7 **deletes the interactive Epic login outright**, making device-auth
bootstrap the single Epic sign-in path.

**Why this cannot be gated in 34.5 at all, stated so it is not re-litigated.** Gating 34.5's
closure on a login path that Phase 34.7 deletes can never be durably satisfied: a PASS on that item
would certify code that is scheduled for removal, and a FAIL would block Phase 34.5 on work the
2026-08-05 parking decision explicitly forbids spending further time on. Neither outcome is a
coherent gate result, so the item is removed from the gate rather than carried as an unwinnable
one.

**What travels with the descope, and what does not.** UAT tests **11 (the Epic half), 12
(`egsSync`) and 13 (legendary save sync)** travel with the descope to Phase 34.7. **Amazon's half
of UAT test 11 stays in Phase 34.5**, as the fourth gate's item 2.

**The descope retires nothing.** Two ledger rows already carry Epic's history, and neither is a
retirement credit for this descope:
- **`U-34.5-06`** (Epic's success path end to end) **RETIRED 2026-08-03** on its own named
  observation: `runner=legendary status=captured` at 20:28:00, followed by `phase=idle` in the
  same session (`34.5-UNTESTED-ITEMS.md`'s own cell for that row).
- **`U-34.5-11`** (the OAuth-redirect-capture exfil mechanism) **RETIRED 2026-08-03 as SUBJECT
  DELETED** (commit `da529ca86`) — its own row is explicit that this is not a pass, and the
  mechanism was never once exercised in its entire lifetime.

Neither row retired **by this descope** — both retired on their own dates, for their own reasons,
before this descope was ever recorded. This descope is a scope decision at gate-authoring time,
not a test result, and it must never be read as "Epic passed" or as adding to either row's own
retirement credit.

## Found during the fourth blocking live gate (2026-08-12, plan 34.5-51) — gap cycle 7 to scope

Verdict `FAIL`: `items_passed: 2, items_failed: 1, items_blocked: 0, items_not_attempted: 1`.
Evidence: `34.5-LIVE-GATE-RERUN-3.md`. Full work-list: `34.5-CYCLE7-ROUTING.md`.

25. **`F-34.5-G6-16` — the anti-phishing origin title (Phase 34.5 Plan 27) is never visible on
    macOS, because the login window is always presented as a titleless AppKit sheet (Phase
    34.4.2's CR-01 fix).** `main.rs`'s `humble_login_open` arm unconditionally builds the login
    window `.visible(false)` on macOS and presents it exclusively via
    `present_login_window_as_sheet`/`beginSheet:`. AppKit sheets render no title bar UI at all.
    `on_document_title_changed`'s composed origin+title string is still set on the underlying
    `NSWindow` every time, but has zero visible effect. Elevated to item 1's own scored FAIL by
    developer decision (the observation is complete and positive: the feature does not exist, not
    merely unproven). Needs a code fix — either stop presenting this window as a sheet, or find an
    AppKit-supported way to surface origin text on a sheet — before any future gate run of this
    item can pass.
26. **`F-34.5-G6-17` — `nile`'s own DEBUG-level "Got register data" log line writes the raw OAuth
    `code` value unredacted, inside a JSON blob, to `gamelib.log`.** Observed live during a real
    Amazon login; the command-line echo of the same value IS correctly redacted, but the very next
    DEBUG line is not. Not diagnosed — unknown whether this is `nile`'s own stdout relayed
    verbatim, or a GameLib-side logger call.
27. **`F-34.5-G6-18` — the gate contract itself cited the wrong "definitive" evidence line for
    item 4's DXVK-toggle clause.** The install/backup direction (turning the toggle ON, the only
    direction this item's own steps ever exercise) never calls `runWineCommand` at all — it
    copies DXVK `.dll` files directly via Node's `copyFile`. `launcher.ts:1581`'s `Running Wine
    command: ...` is only reached on the RESTORE direction. The corrected evidence line is
    `tools/index.ts:369`'s `installing dxvk-macOS on...`. Any future gate contract re-attempting
    this item must cite the corrected line.
28. **`U-34.5-29`/`U-34.5-30` opened** (ledger now 30 rows) — Amazon library population has never
    been observed live by any gate run (the test account owns zero games); the DXVK toggle action
    has never been observed live either (the one opportunity found the switch already on, a
    week-old stale value, never actually clicked).

## Found during gap cycle 7 planning (2026-08-13, plan 34.5-54) — three findings against findings

None of these three came from a live run: all three were found by reading current source during
planning, two of them (29, 30) because a brief instructed re-verification and the third (31)
because a census was recounted with the defect's own predicate rather than the assumed channel
names.

29. **`F-34.5-G6-19` — `F-34.5-G6-18`'s own text is PARTIALLY WRONG.** Its clause "the install/
    backup direction... never calls `runWineCommand` at all" is FALSE. Re-reading current source
    (`src/backend/tools/index.ts`, `DXVK.installRemove`) confirms two of `F-34.5-G6-18`'s three
    clauses hold — the install direction dispatches via `logInfo([\`installing ${tool} on...\`,
    prefix], LogPrefix.ToolInstaller)` at `tools/index.ts:369`, and the DLL copy at `:376-421` is
    genuinely Node's `copyFile`, not Wine — but immediately AFTER the copy, `:423-465` runs the
    DLL-registration loops, and every iteration calls `runWineCommand` with `['reg', 'add',
    'HKEY_CURRENT_USER\Software\Wine\DllOverrides', '/v', <dll>, '/d', 'native,builtin', '/f']` —
    at `tools/index.ts:438` (64-bit loop) and `:459` (32-bit loop). `runWineCommand` **IS** reached
    on the install/ON direction.
    **Consequence, stated explicitly: under the uncorrected reading, a DXVK-ON PASS would retire
    nothing, because the item's own subject is `runWineCommand` executing for a non-Steam runner
    under the sidecar (research Pitfall 2).** Corrected, a genuine DXVK-ON click on a
    storefront-authenticated runner can retire Pitfall 2.
    **Two further sub-corrections to the same finding's text:** the `Running Wine command:`
    emitter is at `src/backend/launcher.ts:1520`, not `launcher.ts:1581`, and it is a `logDebug`,
    not a `logInfo` (`logDebug` does reach `gamelib.log` — `F-34.5-G6-17`'s own observation was a
    DEBUG line in that same file). And the registration loops are `dlls32.forEach(async (dll) => {
    await runWineCommand(...) })` — an **un-awaited** `async` callback inside a synchronous
    `forEach`. `installRemove` can therefore resolve, and the UI switch can flip ON, **before** the
    `reg add` commands finish; a settle window is required in any gate step that reads the log
    immediately after the switch flips, not optional.
    All five corrected facts (dispatch marker exists and precedes the early return; the install
    direction reaches `runWineCommand` via the `reg add` loops at `:438`/`:459`; the restore
    direction's `wineboot -u`/`reg delete` precede the install marker; the version-marker write
    follows it; the `launcher.ts:1520` `logDebug` emitter) are pinned by
    `src/backend/tools/__tests__/dxvkEvidenceLines.test.ts` (this plan, RED-proven against three
    injected regressions). Names plan 34.5-56 as the consumer of the corrected evidence set.

30. **`F-34.5-G6-20` — a SECOND nile credential-logging site**, `src/backend/storeManagers/nile/
    user.ts:62`, `logInfo(['Register data is:', output], LogPrefix.Nile)`, leaking
    `NileLoginData.code_verifier` (PKCE material) at INFO level plus the full authorize URL. Not
    observed by any gate — `F-34.5-G6-17` recorded only the DEBUG-level `code` site at `:91`. Both
    sites are GameLib-side logger calls, which closes `F-34.5-G6-17`'s own open question ("nile's
    stdout relayed verbatim, or a GameLib-side logger call") — it is the latter. INFO level makes
    this site the more exposed of the two. Names plan 34.5-53 as the fix.

31. **`F-34.5-G6-21` — the winetricks half of `34.5-PORTED-CHANNELS.md` correction 3's sweep
    command is structurally incapable of finding its own subject.** The command greps
    `window\.api\.(steamgriddb|winetricksAvailable|winetricksInstall|winetricksInstalled)` — but
    `winetricksAvailable` and `winetricksInstalled` are **channel** names, while the frontend calls
    the **preload API method** names `winetricksListAvailable` and `winetricksListInstalled`
    (`src/preload/api/wine.ts:15-16` maps `winetricksListInstalled -> 'winetricksInstalled'` and
    `winetricksListAvailable -> 'winetricksAvailable'`). The two real call sites at
    `src/frontend/components/UI/Winetricks/index.tsx:26` and `:45` therefore could never be found
    by that command. The fourth gate ran it verbatim and reported **8** call sites; the correct
    census is 10. The two missed sites are the WORST shape in the set — both are `await`ed
    inside a `try { } catch { }` that swallows the rejection into an empty array, so an unported
    channel renders a confident, false "no components installed / none available" panel rather
    than declining. Corrected sweep pattern:
    `window\.api\.(steamgriddb|winetricksListAvailable|winetricksInstall|winetricksListInstalled)`.
    Names plan 34.5-55 as the fix. Cross-references this project's own standing lesson that a
    census must be parsed with the defect's own predicate, never with the names the previous
    document assumed.
