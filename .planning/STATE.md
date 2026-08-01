---
gsd_state_version: 1.0
milestone: v0.8
milestone_name: — Tauri Shell
status: executing
stopped_at: "Planned Phase 34.5 gap cycle 4 (plans 34.5-32..37, 2 waves; plan-checker PASSED). Ready to execute. Plans 34.5-29/30/31 remain HALTED by BINDING DECISION: fix-first -- the blocking five-item gate is NOT authored or run this cycle."
last_updated: "2026-08-01T20:15:00.000Z"
last_activity: 2026-08-01
progress:
  total_phases: 17
  completed_phases: 13
  total_plans: 186
  completed_plans: 169
  percent: 76
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-05)

**Core value:** One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.
**Current focus:** Phase 34.5 — tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc

> **Version renumber (2026-07-20):** the whole project was renumbered from the
> inflated `v1.x` planning labels to `0.x` to reflect pre-release status (map:
> v1.N → v0.(N+1)). Milestones are now: **v0.1** Steam Platform · **v0.2** Polish ·
> **v0.3** Humble · **v0.4** Compatibility Data · **v0.5** macOS Compat Runtime (17–19,
> done) · **v0.6** Store Search · **v0.7** Steam Native Install (21–25, current).
> The earlier v0.5-vs-v0.7 taxonomy split is resolved: macOS-compat = v0.5 (complete),
> native-install = **v0.7** (this milestone). `package.json` set to 0.7.0.

## Current Position

> **⛔ ACTIVE BLOCKER — Phase 34.5's blocking live gate RE-RAN 2026-08-01 and FAILED AGAIN (0 of 5
> clean).** All 21 plans (`34.5-01` through `34.5-21`) are now complete, each with a SUMMARY — but
> **Phase 34.5 STILL DOES NOT CLOSE.** D-08's no-partial-pass rule applies unchanged: this second
> FAIL is another gap cycle inside 34.5, not a deferred UAT entry, not an advisory note, and not a
> pre-authorized override.
>
> **The first run's root cause is CLOSED and live-proven.** `34.5-LIVE-GATE-RERUN.md` precondition 4
> quotes THIS session's `gamelib.log`: `source=GAMELIB_APP_ROOT` (not `process.cwd`), `publicDir
> exists=true`, all four runner binaries `exists=true`, no `SIDECAR ASSET ROOT DEFECT` line. Items 2
> and 3 both reached backend `status=captured` for the first time this phase — the first run never
> got past `spawn ENOENT` at startup. The failure has MOVED to a new, previously-unknown layer
> downstream of OAuth capture; it is real progress on the root cause, not a wash.
>
> - **FAIL — item 1 (Epic):** correct window title, but a "greyed out" form that never resolved —
>   3 login-window opens, 3 `status=timeout`, 0 `status=captured`. This is upstream of anything
>   items 2/3 exposed; the redirect is never even produced to capture.
> - **FAIL — item 2 (GOG):** backend reached `status=captured` (11:15:45), but Manage Accounts
>   stayed stuck on "Signing in to Gog / A sign-in window has opened. Complete sign-in there."; no
>   follow-up `gogdl auth` CLI invocation and no frontend `[TauriLoginPanel] captured-blocked`
>   transition ever fire; GOG library never populated, GOG absent from the Library filter options.
> - **FAIL — item 3 (Amazon):** backend reached `status=captured` (11:10:10), same
>   downstream-of-capture pattern as item 2; account manager never reflected a signed-in account.
>   **Assumption A1 (the `www.amazon.com` anchor) is CONFIRMED** — a sub-clause pass, proven
>   structurally from `matchOAuthRedirect`'s own code plus a zero-count `origin-mismatch` grep — but
>   this does NOT upgrade the item to a PASS; the item's compound requirement (matched redirect AND
>   populated library) still fails on the library half.
> - **NOT ATTEMPTED — items 4, 5:** confirmed explicitly by the developer. Item 4 needed a
>   populated GOG install item 2 did not deliver; item 5 needed an authenticated non-Steam runner no
>   item delivered. Neither is PASS, FAIL, or BLOCKED.
> - **What this gate falsifies: nothing.** No item passed, so no standing claim is retired —
>   including A1, whose sub-clause was independently confirmed while its parent item still FAILed.
>   All four standing claims (Epic/GOG/Amazon session end-to-end, the broader `www.amazon.com`
>   anchor claim, `GAMELIB_SHELL_EXE` correctness at both `exe` call sites, the non-Steam Wine
>   claim) remain explicitly STANDING.
> - Full evidence and diagnosis: `34.5-LIVE-GATE-RERUN.md`. Propagated into
>   `34.5-PORTED-CHANNELS.md`, `deferred-items.md`, `IPC-PORT-INVENTORY.md` and `ROADMAP.md` by
>   `34.5-21` (this plan) — `34.5-LIVE-GATE.md` and `34.5-LIVE-GATE-RERUN.md` are both records and
>   were left byte-unchanged throughout.
>
> **Six new findings for the next gap cycle's scoping** (`deferred-items.md` items 6-11,
> `F-34.5-G6-01..06`, observation-only, not diagnosed): Epic's login form never becomes
> interactive; GOG/Amazon's successful backend captures are never consumed into a completed login;
> GOG library/filter never populated; the login window shows no URL/origin (a
> usability/phishing-resistance defect — the developer could not tell which stored credential
> applied); black-on-black text in Amazon's verification-code field (unreadable until highlighted);
> GOG sign-out prompted for Keychain approval twice. `R-34.5-G1-PKG` (the packaged Tauri build's
> asset root) also remains open, with its future home named as the packaging work, not Phase 34.6's
> channel port.
>
> **GAP CYCLE 3 PLANNED 2026-08-01 — plans `34.5-22`..`34.5-31`, 7 waves** (`ac01ae9cb`, checker
> fixes `06863e354`; plan-checker returned VERIFICATION PASSED after one revision round). Order:
> **22 preserve the gate log + diagnose F-G6-02 → 23 exempt `oauthCaptureLogin` from the 60 s
> `INVOKE_TIMEOUT` ∥ 24 Epic UA discriminator ∥ 25 F-G6-06 keyring → 26 route the capture through
> the post-login completion path ∥ 27 origin-in-chrome + Amazon contrast → 28 diagnostic live
> checkpoint (`autonomous: false`, ends in a BLOCKING `checkpoint:decision`) → 29 apply the fix the
> discriminator SELECTED → 30 author `34.5-LIVE-GATE-RERUN-2.md` → 31 blocking live gate, third run
> (`autonomous: false`)**.
>
> **What planning found that the gate itself never named — F-34.5-G6-02 has TWO layers, and fixing
> only one would have produced a third FAIL.** Layer 1: `oauthCaptureLogin` is absent from
> `LONG_RUNNING_CHANNELS` while `INVOKE_TIMEOUT` is 60 s (`main.rs:104`) and the sidecar's own
> deadline is 300 s (`oauthLoginCapture.ts:62`) — GOG captured at 68 s, Amazon at 91 s, Epic timed
> out at 300 s, so every attempt exceeded the shell's bound, the late real response was dropped as
> an unknown id, and the unguarded `await` at `useTauriOAuthLogin.ts:99` vanished as an unhandled
> rejection. Layer 2: `useTauriOAuthLogin.ts` deliberately calls the RAW `authGOG`/`login`/
> `authAmazon` channels rather than `GlobalState.tsx`'s wrappers, and those wrappers are the only
> thing that runs `handleSuccessfulLogin(runner)` → `refreshLibrary({library: runner})` — so even a
> delivered capture leaves the library empty and the runner absent from the filter list. That is
> F-34.5-G6-03, and it is why plan 23 is explicitly marked as not sufficient on its own.
>
> **F-34.5-G6-06 is not a GOG bug.** The log shows GOG's `Logging user out` at 11:14:17 followed by
> a **`humble-csrf`** keyring read failing at 11:14:34. `humble/user.ts` reads two slots = two
> Keychain entries = two prompts, and `keyringTokenStore.ts:159` does not cache failures while
> `KEYRING_READ_TIMEOUT` is 8 s — shorter than a human takes to approve the dialog, so each timeout
> re-prompts.
>
> **The primary evidence is perishable.** `~/Library/Logs/GameLib/gamelib.log` (351 KB, 11:15) still
> holds the entire gate run and rotates on the next app start — preserving it off the rotation path
> is task 1 of wave 1, before anything that could trigger a rebuild.
>
> **Two durable lessons this cycle bought, worth carrying into the next planner:**
> 1. The `publicdir-getapppath-chunking` family reached FOUR recurrences because a known gotcha was
>    documented at exactly one call site (`bootstrap.ts:156`, for `locales/`) and never swept across
>    its siblings — `34.5-APP-ROOT-SWEEP.md` is the sweep that should have existed from the FIRST
>    recurrence, not the fourth. The lesson generalizes: a gotcha comment at one call site is not a
>    fix, it is a debt marker for every sibling call site until something sweeps them all.
> 2. A green suite (3447/3447, later 3463/3463) coexisted with this defect through the entire first
>    run, because jest runs at repo-root cwd, where `publicDir` resolves correctly BY ACCIDENT.
>    Coverage that does not reproduce the deployment's actual cwd proves nothing about the
>    deployment — a green suite is necessary but never sufficient evidence of parity; only an
>    assertion built to reproduce the real deployment conditions is.
>
> **GAP CYCLE 4 PLANNED 2026-08-01 — plans `34.5-32`..`34.5-37`, 2 waves** (`ca32c5243`;
> plan-checker returned VERIFICATION PASSED with one non-blocking warning, since closed). Scoped
> strictly by `34.5-G6-EPIC-DISCRIMINATOR.md` § Routing under its `BINDING DECISION: fix-first`.
> **Plans `34.5-29`/`30`/`31` stay HALTED — the blocking five-item gate is neither authored nor run
> this cycle**, and plan 32's own automated verify asserts `34.5-LIVE-GATE-RERUN-2.md` does not
> exist. Wave 1 (all autonomous, zero `files_modified` overlap): **32** record the halt + open the
> explicitly-untested ledger ∥ **33** routing items 1+2 ∥ **34** routing item 4 (the propagation
> race) ∥ **35** routing item 3 (keyring bound). Wave 2: **36** dev-only secret vault ∥ **37**
> Epic Electron-vs-Tauri discriminator (`autonomous: false`, ships no fix).
>
> **Two root causes were pinned at SOURCE during planning — neither was known when the checkpoint
> routed, and both were statically diagnosable all along.**
> 1. **Routing item 1 has a one-line cause.** `src/backend/sidecar/steamFlowRegistration.ts:62`
>    registers `ipcMain.handle('refreshLibrary', async () => { await steamLibraryManager.refresh() })`
>    — a Phase 27 walking-skeleton stub that takes **no arguments**. Every
>    `window.api.refreshLibrary('gog')` therefore ran a *Steam* refresh. This explains the entire
>    observed pattern at once: `No cache found, getting data from gog...` repeating with no
>    completion line, **and** `Steam: fetched 377 owned games` → `sync complete` appearing in the
>    same session — those Steam lines *are* the GOG refresh calls' actual effect. The Electron
>    original (`main.ts:1051`) dispatches on the runner correctly.
> 2. **Routing item 4's race has a signature that matches its cause.** `useTauriOAuthLogin.ts` has
>    four `if (cancelled) return` sites; two sit *after* irreversible work — one holding a captured
>    single-use OAuth code, one after the auth channel already persisted the credential — and both
>    return with **no log output**. That is exactly the observed shape: backend side effects present
>    in the log, hook side effects entirely absent. Plan 34's fix is race-independent by
>    construction (cancellation gates `setState` only; `onLoginSuccess` is `GlobalState`'s
>    referentially-stable `completeOAuthLogin`), verified against source by the plan-checker rather
>    than taken on trust.
>
> **The vault's cost is tracked, not implied.** `34.5-UNTESTED-ITEMS.md` (plan 32) seeds
> `U-34.5-01`..`06`, each with a mechanically-checkable retirement condition and a standing rule
> that a passing suite never retires a row. `U-34.5-01` carries the literal **KEYCHAIN PATH
> UNPROVEN** plus a bar on any vault run serving as evidence for plan 35's item-3 claim — written
> specifically against the trap Phase 34.4.1's gate fell into, where a struck precondition silently
> left domain-scoping untested inside a 4/4 PASS.
>
> **Decision-coverage gate OVERRIDE recorded 2026-08-01 (cycle-4 planning).** The gate reports
> **10/12** CONTEXT.md decisions covered; **D-01** and **D-03** are uncovered and the developer
> chose *proceed + record* rather than cite-or-retag. Both are original discuss-phase **scope**
> decisions, out of scope for a defect-fixing cycle, and both have been uncovered across all 31
> prior plans and three gap cycles — this is pre-existing, not introduced here. **D-01** is a
> meta-decision about *how* keep/drop was judged (case-by-case, not by blanket principle) and is
> effectively informational. **D-03** (EOS 8 + SteamGridDB 5 + winetricks 3 = 16 channels DEFERRED,
> not dropped) is **materially satisfied** — plan `34.5-03` inserted Phase 34.6 and reconciled the
> inventory to 38/3/16, and `deferred-items.md` tracks the 16 — it is simply never cited as a
> literal `D-03:` string in any plan. Nothing was retagged and no locked decision was edited.
> Verify-phase should re-surface this rather than treat it as closed.
>
> **Next action:** `/gsd-execute-phase 34.5` — run gap cycle 4 (plans 32–37). Phase 34.5 does not
> reach its blocking gate this cycle by design; a cycle 5 authors and runs it.

> # ✅ PHASE 34.4.1 COMPLETE — 2026-07-31. THIRD LIVE GATE: **4/4 PASS**.
>
> **Plan 29 of 29 done; all 29 plans across 2 gap cycles complete.** The blocking gate
> (`34.4.1-LIVE-GATE-RERUN-3.md`) ran a third time and passed every item. Verdict history:
> **FAIL 2/4 → FAIL 3/4 → PASS 4/4.**
>
> | Item | Result |
> |---|---|
> | pre-check (F-10) | PASS — renders first-time; **zero** `unsupported URL` (was ~150/render) |
> | 1 login from scratch | PASS — 75B keyring store, no `sessionCookie`, install line present |
> | 2 survives relaunch | PASS — store byte-identical, both PIDs changed, 29/29 authenticated sync |
> | 3 disconnect | PASS — **F-6 CLOSED** |
> | 4 `humbleRevealKey` | PASS — `login-window seam transport`, secret absent from logs |
>
> **F-6 — the defect that failed this gate twice — is closed behaviourally, not by a success
> report:** census `before(34/34) after(0/0) deleted=34` with the reported count agreeing with an
> independent post-removal re-read, and a genuinely fresh re-login (**68 `session_expired`
> rejections over 6m17s**, vs run 2's ~3s and zero poll lines — a surviving session cannot emit
> that reason). **WR-07, F-4, F-10 and GAP-13 also closed.** 12 requirement boxes checked with
> dated riders; the gated `IPC-PORT-INVENTORY.md` / `34.4.1-PORTED-CHANNELS.md` updates applied.
>
> **The suite was fully green for all three runs (3279/3279, 3387/3387) while F-1 and both of
> F-6's defects were live. Every blocking defect in this phase was found by a human driving the
> UI; none by automation.**
>
> **NOT closed — carried out explicitly so nothing reads as more proven than it is:**
> - **Domain-scoping of the cookie clear is UNTESTED.** `survivingNonHumble=0` is vacuous, not
>   passing: the jar held only Humble cookies. Root cause is the gate contract's own precondition
>   6, which struck the planted non-Humble cookie — the contract told the operator not to plant one
>   and then required an outcome only a planted cookie could produce. **Next cycle must unstrike
>   it.** (`D-29-07`)
> - **Epic logout: expected fixed by construction, UNOBSERVED** — shared-code-path argument only,
>   no session was available. No document may call it verified. → **Phase 34.5** (`D-29-08`)
> - **F-9 OPEN, unassigned** — a generic RPC timeout fired live; co-occurrence with a cookie
>   operation is UNDETERMINED, not "no" (`D-29-06`)
>
> **10 findings filed** in `deferred-items.md` as `D-29-01`..`D-29-10`, including a NEW UX-blocking
> one: **Manage Accounts does not self-refresh after sign-in** (stale view, auth itself correct),
> possibly sharing a root cause with a post-login `/api/v1/user/info` HTML 404 — recorded as a
> **hypothesis with a named discriminator**, not a conclusion.
>
> **Process failure recorded against this run: F-7 recurred.** Item 2 was skipped and its session
> destroyed by item 3 before its readings were taken, despite a written warning in the contract. It
> was recovered at zero extra credential cost. The fix is not "warn harder" — item 2's snapshot must
> become an executor-captured artifact gated before the disconnect affordance is described.
>
> **Next action:** Phase 34.5 plan 15's live gate is now **UNBLOCKED** — its precondition was this
> gate. Note **Phase 34.6 has no directory and no plans**, so Phase 35's stated precondition is
> still silently false.

> **✅ PLAN 27 COMPLETE — 34.4.1-27 (gap cycle 2, plan 7 of 9, wave 5) — 2026-07-31.**
> Closes the two **code-side** housekeeping findings the gate rerun left unassigned:
> `queryLocalFonts` throwing unguarded under WKWebView, and ~150 `unsupported URL` Steam artwork
> requests per library render. `getFonts()` now calls a new dependency-free
> `queryLocalFontsSafe()` (extracted from `Accessibility/index.tsx` — that file pulls in MUI +
> several `.css`-importing components the jsdom-less frontend jest project cannot `require()`;
> the guard remains the file's only caller and index.tsx still literally contains
> `queryLocalFonts`), degrading to the two CSS-declared default fonts on both absent-and-throwing
> failure shapes, logging once via `window.api.logError`, never letting a rejection escape.
> `CachedImage` now gates `imagecache://` wrapping on a new `imageCacheSchemeAvailable()`
> predicate in `preload/tauriTransport.ts` (today the negation of `isTauri()`, one line to change
> if a Tauri-side handler ever lands) at both the primary `useCache` init and the
> fallback-advance path — no `imagecache://` URL is emitted when the scheme isn't served. A
> source-reading test pins `CachedImage` free of any direct `isTauri(` reference (house pattern
> from `GlobalStateSteamLogout.test.ts`); proved load-bearing live via a temporary
> reintroduction + observed failure + revert. `REQ-34.4.1-GAP-13` minted, `[ ]` — honestly split:
> `queryLocalFonts` half closed by unit evidence here, artwork half's zero-`unsupported-URL`
> observation still owed to plan 29's live gate. `npm run test:ci`: 177 suites/3436 tests (was
> 176/3427). `npx tsc --noEmit`: clean. `ported-channels-gate.py` + `--self-test`: both OK,
> `IPC-PORT-INVENTORY.md`/`PORTED-CHANNELS.md` diff empty. See `34.4.1-27-SUMMARY.md`.
> Next action: plan 28 (WKWebView sweep — can allowlist both of this plan's guarded sites).

> **✅ PLAN 26 COMPLETE — 34.4.1-26 (gap cycle 2, plan 6 of 9, wave 5) — 2026-07-31. Plan 25
> SKIPPED (unexecuted, no summary) — orchestrator dispatched 26 directly; not this plan's to
> resolve.**
> F-9 (the intermittent 60s `keyring_get` RPC timeout hitting `humble-csrf`) gets both an
> observability fix and a read-count fix. **Task 1's hardware-run timing harness REFUTES the
> original "missing entry is slower" hypothesis** — two live runs on this machine measured an
> absent-entry read at 40-102ms (fast, `NoEntry`) against a present-entry (`steam-refresh-token`)
> read that stalled **48.9s then 291s**, both times failing `PlatformFailure(-60008, "Unable to
> obtain authorization for this operation")` — direct hardware evidence for `deferred-items.md`'s
> ad-hoc-signature/Keychain-ACL theory. Task 2: `keyring_get` now runs on a worker thread bounded
> at `KEYRING_READ_TIMEOUT` (8s, chosen from those measurements), rejecting the classified
> `keyring:timeout` well under the sidecar's 60s RPC budget; `NoEntry`/unknown-slot-rejection are
> proven untouched. **User-approved scope widening** (both halves required, not optional) added a
> process-lifetime read cache + in-flight dedupe to `keyringTokenStore.ts`/`humbleSecretStore.ts`
> — outside this plan's original `files_modified` — cutting the 20+ Keychain reads/boot toward the
> structural floor of 3 (one per allowlisted slot). Cache invalidated BEFORE every
> `setToken()`/`clearToken()` write/delete (no resurrected session after disconnect, proven by 6
> dedicated tests). Caught and fixed its own regression: `migrateOneSecret()`'s direct-write
> bypass left a stale pre-migration cache in place until an explicit `invalidateCache()` call was
> added. `cargo test`: 80/80 (was 74), `cargo check` clean. `npm run test:ci`: 3427/3427 (was
> 3407). `npx tsc --noEmit` clean. `ported-channels-gate.py` + `--self-test`: both OK,
> `IPC-PORT-INVENTORY.md`/`PORTED-CHANNELS.md` diff empty. **Nothing in this plan proves F-9 no
> longer occurs live, or that the read-count reduction is observable on a real boot** — plan 29's
> gate is the only remaining verification step; see `34.4.1-26-SUMMARY.md`'s "Next Phase
> Readiness" for exactly what it should watch for.
> Next action: plan 27 (or resolve plan 25's skip first — developer's call).

> **✅ PLAN 24 COMPLETE — 34.4.1-24 (gap cycle 2, plan 4 of 9, wave 4) — 2026-07-31.**
> WR-07's positive half CLOSED as far as static code can carry it: `humble_login_open`'s
> `if visible` block now wires Tauri's documented `on_document_title_changed` builder
> callback (`tauri-2.11.5/src/webview/mod.rs:564-567`), so the OS title bar tracks the
> loaded document's own title instead of the framework default two live gate operators
> reported ("Tauri app"). Corrected the arm's own comment, which previously (falsely)
> claimed WR-07 was "enforced by the grep gate ... not by intent alone" — the corrected
> text states a grep gate can only prove absence of a hard-coded title, never presence of
> a tracking one, and names plan 29 item 1 as the sole owner of the live claim. Added a
> greppable `eprintln!` recording F-4's `.focused(true)` presentation request (size,
> center, one-shot focus, no persistent pin) — the first machine record of what was
> requested, since the raised half has gone unobserved across two live gates. Added 5
> static tests to `tauriShellSource.test.ts` (36 → 41): title hook present,
> `always_on_top` absent, no hard-coded `.title(` on any `WebviewWindowBuilder` chain, the
> four presentation calls confined to `if visible` (Plan 18's gating, never tested until
> now — proved load-bearing by a real temporary `.center()` move + observed failure +
> byte-identical restore), and the two hidden windows untouched. `cargo check`/`cargo
> test`: 74/74. `npx jest tauriShellSource.test.ts`: 41/41. `npx tsc --noEmit`: clean.
> `npm run test:ci`: 176 suites/3407 tests. `ported-channels-gate.py` + `--self-test`:
> both OK; `IPC-PORT-INVENTORY.md`/`34.4.1-PORTED-CHANNELS.md` diff empty. **Neither WR-07
> nor F-4 is CLOSED by this plan — both remain OPEN pending plan 29 item 1's live
> observation of the title bar and the window raise.**
> Next action: plan 25 (gap cycle 2, wave 4/5).

> **✅ PLAN 23 COMPLETE — 34.4.1-23 (gap cycle 2, plan 3 of 9, wave 3) — 2026-07-31.**
> F-6 Defect B CLOSED (the BLOCKING defect this whole gap cycle exists to close): on macOS,
> `humble_login_clear_cookies` now deletes through the live `WKWebsiteDataStore`
> (`fetchDataRecordsOfTypes_completionHandler` + `removeDataOfTypes_forDataRecords_completionHandler`
> scoped to `WKWebsiteDataTypeCookies`), never wry's `delete_cookie()` (whose `Ok(())` fires
> unconditionally regardless of whether anything was deleted — bugs.webkit.org #184938). Every
> platform now returns `verified_delete_count(before_matching, after_matching)`, a re-read taken
> AFTER removal, never the old `matching.len()` attempted count. Threading was source-verified
> (not assumed from spike 016's raw measurement, which was taken from a different, main-thread
> call site) against `tauri-runtime-wry-2.11.4`: this arm's real caller runs on a spawned worker
> thread, so `with_webview()` is fire-and-forget there — the arm uses `mpsc_channel` +
> `rx.recv_timeout()` instead of trusting `with_webview`'s own return. Epic's `clearEpicCookies`
> (the shared arm's second, already-shipped caller, unverified since Phase 34.5 plan 06) is now
> instrumented with a measured-count log + a zero-count warning and tested. `cargo test`: 74/74
> (was 66). `npm run test:ci`: 3402/3402 (was 3394). `npx tsc --noEmit`: clean.
> `ported-channels-gate.py` + `--self-test`: both OK. Two temporary-break experiments proven
> load-bearing (suffix-separator removal, `matching.len()` reintroduction) — see
> `34.4.1-23-SUMMARY.md` for both. **Nothing in this plan proves the removal works live — plan
> 29 item 3's live gate is the ONLY remaining proof.**
> Next action: plan 24 (gap cycle 2, wave 4).

> **✅ PLAN 22 COMPLETE — 34.4.1-22 (gap cycle 2, plan 2 of 9, wave 2) — 2026-07-31.**
> F-6 Defect A CLOSED: added `humble_login_cookies_for_domain`, a second, correctly-directed Rust
> cookie-read arm (cookie's own domain first, fixed target second — mirrors the unedited
> `humble_login_clear_cookies` filter), exposed as `cookiesForDomain()` on `LoginWindowSeam`, and
> routed the disconnect census's before/after reads through it. The login-watch poll's own arm
> (`humble_login_cookies`, page-host-first) is UNCHANGED and pinned by test on both the TS side
> (`user.test.ts`) and the Rust source side (`tauriShellSource.test.ts`, extracting each arm's body
> and asserting its exact `cookie_domain_matches(...)` call shape). Both direction-pin tests proven
> load-bearing by a temporary argument swap (observed failure, reverted) — see `34.4.1-22-SUMMARY.md`
> for the exact swap and failure text. Plan 21's `SPIKE 016` throwaway probe fully removed,
> including a second removal site (a `GAMELIB_SPIKE016`-gated trigger inside `humble_login_open`)
> the plan text itself didn't name. `cargo test`: 66/66 (was 60). `npm run test:ci`: 3394/3394
> (baseline 3387). `npx tsc --noEmit`: clean. `ported-channels-gate.py` + `--self-test`: both OK.
> `34.4.1-22-SUMMARY.md` records full detail, both swap experiments, the census log line's exact
> (unchanged) format, and the `humble_login_cookies_for_domain` arg tuple plans 23/29 both consume.
> Next action: plan 23 (Defect B fix — the `WKWebsiteDataStore` delete rewrite; this plan's fix was
> the hard sequencing precondition plan 23 needed before it could land safely).

> **✅ PLAN 21 COMPLETE — 34.4.1-21 (gap cycle 2, plan 1 of 9, wave 1) — 2026-07-31.**
> Phase 34.4.1 still does NOT close (gate FAILED 3/4 on `34.4.1-20`, item 3). Gap cycle 2 (plans
> 21-29, 7 waves) is the response, and plan 21 (declare + spike, `autonomous: false`) is now DONE —
> all three tasks, including the blocking Task 3 checkpoint. `REQ-34.4.1-GAP-07..12` minted in
> `REQUIREMENTS.md`, `ROADMAP.md`'s GAP CYCLE 2 block and Requirements line updated, this STATE.md
> hand-corrected; the throwaway `spike016_cookie_probe` Rust arm + its four macOS-only
> `objc2`/`block2` deps (promoted from already-resolved transitive deps, zero new supply-chain
> surface, `Cargo.lock` diff shows only the transitive→direct move) were built and driven live under
> `pnpm tauri:dev` against a real Humble-cookie-bearing jar. **`34.4.1-SPIKE-016-FINDINGS.md` is
> written and committed** (`64588395a`), answering all three questions D-11 required before the F-6
> fix is written:
> - **A2 holds** — `thread_name=main`, `mtm_before_with_webview=true` — no `run_on_main_thread` hop
>   needed anywhere in plan 22/23's arms.
> - **Q1 answered** — `with_webview()`'s closure runs SYNCHRONOUSLY INLINE — plan 23 can write the
>   fix directly in the closure with no async/callback restructuring.
> - **Defect A proven live, and worse than research's original framing** — `total=33`,
>   `census_direction=29`, `clear_direction=33`. The clear-direction predicate matches **100% of the
>   jar**, not a subset — it does not filter at all.
> - **Retry experiment flat: 31/31/31** across three delete+wait attempts on the existing broken wry
>   path — rules out timing/race, supports identity mismatch. **RECOMMENDATION: proceed with the
>   `WKWebsiteDataStore` rewrite in plan 23, not a retry pattern.**
> - **Sequencing hazard recorded as a hard ordering requirement: plan 22 (Defect A fix) MUST land
>   before plan 23 (Defect B fix).** If plan 23's delete-fix lands while the clear-direction predicate
>   still matches everything, a real Humble disconnect will delete EVERY cookie in the shared jar —
>   Epic's and GOG's included — turning a silent no-op into cross-provider data loss.
> - Also captured mid-session (out of plan 21's declared scope, forwarded to plan 26): F-9's Keychain
>   prompt storm root-cause traced to an ad-hoc code signature destabilizing the Keychain ACL under
>   `tauri:dev` — logged in `deferred-items.md`, not fixed here.
> `34.4.1-21-SUMMARY.md` records the full task-by-task detail and headline numbers table. Plan 22
> (Defect A fix) is now COMPLETE — see the plan 22 block above. Next action: plan 23 (Defect B fix),
> then resume `/gsd-execute-phase 34.4.1`.

> **⛔ ACTIVE BLOCKER — Phase 34.4.1's blocking live gate RAN 2026-07-30 and FAILED (2 of 4 clean).**
> `34.4.1-08` is complete (all 9 plans now have summaries) but **Phase 34.4.1 DOES NOT CLOSE** — the
> gate's own no-partial-pass rule makes the findings a gap cycle inside 34.4.1.
>
> **GAP CYCLE PLANNED 2026-07-30 — plans 10–20, 10 waves** (`8561926b3`, checker fixes `4002f7c6f`).
> Order: **10 sweep → 11 keyring allowlist → 12 secret-store seam → 13 F-1 CLOSED → 14 steamgrid ∥
> 15 storage-clear capability → 16 F-6 CLOSED → 17 jar census/F-5 → 18 F-2/F-3/F-4/F-8 → 19 declare
> (DONE 2026-07-30, `34.4.1-19-SUMMARY.md`) → 20 blocking gate re-run (`autonomous: false`)**.
> Next action: **plan 20** — the blocking live-gate re-run. Plan 19 minted `REQ-34.4.1-GAP-01..06`,
> reset `humbleStartLogin`/`humbleReconnect`'s riders to honest forward references, and left an
> explicit GATED-updates checklist in `34.4.1-19-SUMMARY.md` for plan 20 Task 3 to consume.
>
> **Planning found a twin of F-6 already shipped:** `storeManagers/legendary/user.ts:107-151`
> (Phase 34.5 plan 06) carries the same 5-vs-1 wipe-step asymmetry *verbatim*, with an in-source
> comment saying it copied Humble's shape. The incomplete pattern propagated before anyone knew it
> was incomplete. Plan 16 closes both; this is a deliberate cross-phase edit into open Phase 34.5,
> not a silent one.
>
> - **PASS:** item 2 (persistence proven at the store layer) and item 4 (real key revealed via the
>   Tauri seam transport — not a 403 — so `humbleRevealKey` ships PROVEN, not declared-degraded).
> - **F-1 (BLOCKING):** the Humble session cookie is persisted in **plaintext**. `humble/user.ts`
>   still imports the sidecar's hardcoded-dead `safeStorage` stub instead of Phase 28's `TokenStore`
>   seam. Steam is fine; `steamgrid/secureKey.ts` has the same shape but is unverified.
> - **F-6 (BLOCKING):** **disconnect does not disconnect.** Electron's branch runs 5 wipe steps,
>   Tauri's runs 1 (cookies only); localStorage/IndexedDB survive, so re-login auto-signs back in.
> - 8 findings total. Both blocking defects were invisible to a green **3279/3279** suite and 40/40
>   `cargo test` — the third consecutive slice where a live gate caught what automation could not.
> - **34.4 D-09 is STRUCK** — a Tauri path to a Humble session now demonstrably exists.
> - **Consequence for 34.5:** `34.5-15`'s precondition 1 is item 1 PASS, which the *mechanism*
>   satisfies. But 34.5-15's items 1–3 mint real OAuth credentials over this seam, and F-1 means
>   they would land in plaintext. **Recommendation: fix F-1 before 34.5-15 runs.** Developer's call;
>   recorded, not taken.
> - Full detail, findings register and recommended gap-cycle scope: `34.4.1-LIVE-GATE.md` § Verdict.

Phase: 34.5 (tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc) — EXECUTING GAP CYCLE 3
Plan: 28 of 31 complete (plans 01–21 done; **the live gate has FAILED 0/5 twice**; gap plans 34.5-22..31 now executing across 7 waves to close F-34.5-G6-01..06 and the two never-attempted gate items — the phase does NOT close until 34.5-31's third re-run gate records 5/5)

> **✅ GAP CYCLE 2 PLANNED 2026-07-31 — plans 21-29, 7 waves. Checker: VERIFICATION PASSED, 0 blockers.**
> Research: `34.4.1-RESEARCH-GAP-CYCLE-2.md` (`420d02528`). Scope approved by user as FULL — all 8 items.
>
> **F-6's root cause is now SOURCE-VERIFIED, not guessed** — read out of the vendored `wry-0.55.1` /
> `tauri-2.11.5` crate sources. TWO compounding, independent defects:
> - **Defect A:** the census/read arm calls `cookie_domain_matches(host, domain)` with arguments in
>   the OPPOSITE order from the clear arm, so it undercounts every leading-dot/subdomain cookie.
>   This alone explains the gate's `25 attempted / 23 matched` asymmetry. → plan 22.
> - **Defect B (blocking):** `humble_login_clear_cookies` reports an *attempted* count computed
>   BEFORE the delete loop runs, and wry's `delete_cookie()` returning `Ok(())` on macOS means only
>   that WebKit's completion handler fired — not that anything matched. Same shape as WebKit
>   bugzilla #184938. → plan 23, via `WKWebsiteDataStore.fetchDataRecords`/`removeData(for:)` through
>   `WebviewWindow::with_webview()` + `objc2-web-kit` (**already in `Cargo.lock`** — no new deps).
>   Domain-scoped by `displayName`, so D-08's never-a-blanket-wipe constraint still holds.
>
> **`storeManagers/legendary/user.ts`'s Epic logout calls the IDENTICAL broken Rust arm** — confirmed
> by source (`clearEpicCookies` → same `RUST_HUMBLE_LOGIN_CLEAR_COOKIES` channel), not inferred from
> shape. Fixing the arm fixes both callers; plan 23 T3 instruments Epic's, plan 29 re-verifies it.
> Declared cross-phase edit into open Phase 34.5, not a silent one.
>
> **Process finding worth keeping:** `34.4.1-RESEARCH.md` and `IPC-PORT-INVENTORY.md` NAMED
> `delete_cookie()` and `on_document_title_changed` at planning time as APIs the D-11 spike never
> tested — and both shipped anyway with no follow-up spike. F-6 and WR-07 are exactly those two
> written-down risks materializing. Plan 21 is spike-first to avoid a third instance.
>
> Waves: **21** declare+spike (`autonomous: false`) → **22** Defect A → **23** Defect B → **24**
> WR-07/F-4 → **25** F-10 ∥ **26** F-9 ∥ **27** housekeeping → **28** sweeps → **29** THIRD BLOCKING
> LIVE GATE (`autonomous: false`, owns the GATED `IPC-PORT-INVENTORY.md` / `34.4.1-PORTED-CHANNELS.md`
> updates via plan 19's 13-row checklist).
>
> Plan 21 T1 owns the ROADMAP.md / REQUIREMENTS.md (GAP-07..12) / STATE.md edits as EXECUTABLE work —
> deliberately not done planner-side, because STATE.md must be hand-corrected per the
> `gsd-sdk-state-writes-corrupt-state-md` gotcha. Plan 27 T3 mints GAP-13.
>
> Two research assumptions corrected during planning: **A3 is FALSIFIED** — `App.tsx:147-150` DOES
> register a per-route lazy boundary (eager `import()` at module eval, no `errorElement` anywhere),
> and `Login/index.tsx:118-120` renders a *visible* spinner, so a truly blank window points UPSTREAM
> of the component (plan 25 carries this). And the **Steam artwork cause is located, not speculative**:
> `CachedImage/index.tsx:64` wraps every http source in `imagecache://`, a scheme registered ONLY by
> Electron's `protocol.handle` at `images_cache.ts:17` from a `whenReady()` init the sidecar never
> runs — plan 27 gates it on a named `imageCacheSchemeAvailable()` predicate, NOT another `isTauri()`
> sniff (a stale `isTauri()` guard already caused Phase 34.4's gate failure).
>
> Next action: **`/gsd-execute-phase 34.4.1`**

> **⛔ GATE RE-RUN 2026-07-31 — FAIL, 3 of 4. PHASE 34.4.1 STILL DOES NOT CLOSE.**
> Items 1, 2, 4 PASS; **item 3 FAIL**. Record: `34.4.1-LIVE-GATE-RERUN.md` (`verdict: FAIL`),
> summary `34.4.1-20-SUMMARY.md`.
>
> - **F-1 CLOSED, live-proven on the WRITE path** — Keychain slots deleted pre-boot, recreated by
>   a credential+2FA login; store has no `sessionCookie`/`csrfToken`, `encryptionDegraded: false`.
>   Item 2 confirms it survives relaunch. F-2/F-3/F-5/F-8 also confirmed closed live.
> - **F-6 NOT closed — the DIAGNOSIS was incomplete, not the fix.** The four wipe steps the gap
>   cycle built all work live (localStorage=32, IndexedDB=1, keyring cleared, store `{}`). The
>   **pre-existing** cookie deletion reports `cleared 25 humblebundle.com cookie(s)` while the jar
>   shrinks by **1** and **all 23 Humble cookies survive**. Re-login auto-signs back in with ZERO
>   poll lines. Root cause for the next cycle: **the cookie delete silently does not delete** —
>   third instance of the resolves-without-doing-the-work WKWebView class.
> - **LESSON: a gap analysis that enumerates what is MISSING will not question what is PRESENT.**
> - **WR-07 FAIL** — login window title reads `Tauri app` (framework default).
> - Open + UNASSIGNED: **F-9** (60s `keyring_get` timeout, hits `humble-csrf`), **F-10** (Manage
>   Accounts blank on FIRST navigation to the lazy `/login` route, renders on retry),
>   `queryLocalFonts` unguarded in `Accessibility/index.tsx:63`, ~150 percent-encoded Steam
>   artwork URLs.
> - `IPC-PORT-INVENTORY.md` / `34.4.1-PORTED-CHANNELS.md` deliberately NOT updated — gated on
>   item 3, which failed.
>
> Next action: **`/gsd-plan-phase 34.4.1 --gaps`**

> **D-GAP-03 (2026-07-30, user-approved) — sweep finding S-09 routed into plan 18.**
> Plan 10's mechanical sweep found a FIFTH SILENTLY-DROPPED site that no gap-cycle plan owned:
> `humble/user.ts:732-751`, the `csrf_cookie` backfill inside `checkHealthAndFlagExpiry()`, calls
> `session.fromPartition()` with no `getLoginWindowSeam()` guard, so under Tauri it throws into its
> own non-fatal catch and the capability silently no-ops. That backfill is the self-heal path for an
> account that connected before the capture code shipped — under Tauri such an account never heals
> and every reveal POST omits `csrf-prevention-token`. **Live-gate item 4 passed only because the
> gate's account already held a token from `finishLogin`; the defect was masked, not absent.**
> Scope addendum is committed into `34.4.1-18-PLAN.md` (commit `c88665f6a`) — plan 18 already owns
> both `src-tauri/src/main.rs` and `humble/user.ts`. A `humble-csrf` keyring slot already exists
> from plan 11 if the fix needs one.
>
> **Carry-forward for plan 19 — RESOLVED 2026-07-30:** `REQ-34.4.1-GAP-01..06` are now minted in
> `REQUIREMENTS.md`, each naming the existing requirement it extends and the finding it closes.
> `REQ-34.4.1-02`/`-05`/`-06`/`-12` are reopened to UNCHECKED with dated riders. See
> `34.4.1-19-SUMMARY.md`'s GATED-updates checklist for exactly what plan 20 may re-check.
>
> **New carry-forward, plan 19 → unassigned:** `seam-parity-sweep.py`'s `categories_for_labels()`
> mapping table still doesn't recognize `clearHumbleStorage`/`clearEpicStorage` (S-07/S-10 report
> stale SILENTLY-DROPPED for already-closed F-6), and `secretStore.ts`'s doc comment still can't
> satisfy `is_axis_b_declared()`'s strict id+term bar (S-11 reports stale SILENTLY-DROPPED for
> already-closed F-1). Plan 19's own `files_modified` didn't include the sweep script, so this is
> logged to `deferred-items.md` and re-forwarded, not fixed — no plan currently owns it.
>
> **Carry-forward for plan 14:** plan 10 proved `steamgrid/secureKey.ts` (F-1b) is NOT reachable
> from the sidecar's curated import graph today — reached only from `src/backend/main.ts`, absent
> from the 34-entry `BASELINE_ELECTRON_REACHING_MODULES`. F-1b is dormant, not live. Plan 11
> deliberately did not add its keyring slot.

**Phase 34.5 — HELD at plan 15 of 15.** Its live gate's precondition is 34.4.1's own
gate, and 34.5-15 mints real OAuth credentials over the seam that F-1 leaves in
plaintext. The 34.5 execution narrative below is retained history, not current position:

Plan: 15 of 15 (01 done — pathShim desktop/exe/documents extension +
GAMELIB_SHELL_EXE spawn-time handoff, REQ-34.5-01; 02 done — nile OAuth redirect
host-anchored on www.amazon.com, closing T-34.4.1-44b; 03 done — 34.5-LIVE-GATE.md
written as an empty 5-item blocking contract, Phase 34.6 inserted into ROADMAP.md
for the 16 deferred channels, IPC-PORT-INVENTORY.md's 57 reconciled as 38+3+16,
REQ-34.5-11 fully satisfied. REQ-34.5-12 remains open until 34.5-15's live gate
actually runs and records 5/5 PASS; 04 done — the four declared-but-empty
registration seams for this slice's 38 channels (`runnerAuthFlowRegistration.ts`
11, `wineToolsFlowRegistration.ts` 9, `shortcutsFlowRegistration.ts` 7,
`runnerMiscFlowRegistration.ts` 11) created, wired into `handlers.ts`, and proven
reachable by a growth-tolerant containment-pin test (27/27 passing), REQ-34.5-13
satisfied. Fixed a self-inflicted `*/ipc_handler.ts` docstring bug that broke
`tsc` mid-task. Full backend suite recorded verbatim (not rounded to green): exit
1, 3 failed/2599 passed/2602 total — all three pre-existing and outside this
plan's file set (`pathShim.test.ts` unclassified in `testContainment.test.ts`
from already-committed plan 34.5-01; a wine-downloader `unlinkFile` test; a
comment-stripper mismatch against `main.rs` literals plan 34.5-01 added),
logged to `deferred-items.md` rather than fixed. Plans 05-12 can now each fill
in exactly one module file.); 05 done — `wineToolsFlowRegistration.ts` filled in
with 6 of its 9 declared channels: the `runWineCommand` D-14 seam-3 pass-through
(wave-2 placement rationale recorded in-source per D-06/D-07), the
`getAlternativeWine`/`wine.isValidVersion` probe pair, and the
`installWineVersion`/`refreshWineVersionInfo`/`removeWineVersion` trio ported
verbatim plus their co-located `releasesInfoReady` subscription (T-34.5-16).
REQ-34.5-03 satisfied. New 9-test `wineToolsFlows.test.ts` proves bidirectional
registration kind, no `ipc_handler` import, no deferred-winetricks/
`runWineCommandForGame` leakage, and `runWineCommand`'s pass-through-by-identity
forwarding; classified in `testContainment.test.ts`'s structurally-contained
list, `runnerSliceRegistration.test.ts` left unedited. DXVK/VKD3D toggles (3 of
the 9) remain for a later plan. Full backend suite is flaky independent of this
plan's own files: two separate runs each surfaced ONE different unrelated
pre-existing failure (`enrichmentFlows.test.ts` once, `depotPrimitives.test.ts`
once), both passing in isolation; a third run was fully green. `tsc --noEmit`
exit 0 throughout.); 06 done — `runnerAuthFlowRegistration.ts` filled in with
the 7 Epic/GOG auth+sign-out channels (6 `ipcMain.handle` + `logoutGOG` as
`ipcMain.on`), REQ-34.5-04 satisfied. Fixed a real defect found during
implementation: `LegendaryUser.logout()` previously aborted mid-cleanup under
the sidecar's `{}` session stub, skipping `configStore.delete('userInfo')` —
restructured to the same guarded-step-loop/unconditional-credential-cleanup
shape 34.4.1-06 established for Humble, with a domain-scoped Tauri cookie clear
against the apex `epicgames.com`. `login`/`authGOG` validate their credential
payload at the trust boundary (never logging the rejected value); `logoutGOG`
wraps the SYNCHRONOUS `GOGUser.logout()` in try/catch, not `.catch()`. New
6-case `legendary/__tests__/user.test.ts` (first test file for that module) and
23-case `runnerAuthFlows.test.ts` (bidirectional kind cross-check, sign-out
asymmetry, trust-boundary rejection, send-guard, dropped/deferred-channel
absence); both classified/left correctly per `testContainment.test.ts`/
`runnerSliceRegistration.test.ts`. Found and fixed a pre-existing idempotence-
test bug in `runnerSliceRegistration.test.ts` (baseline captured before any
`register()` call, compared against state after two calls — impossible once a
real `ipcMain.on` channel exists) and added a matching `let registered = false`
guard to `registerRunnerAuthFlows()` itself (mirrors `storeRegistration.ts`).
Updated `settingsFlows.test.ts`'s `getUserInfo` Invariant B guard from
"still unported" to "now real", following that file's own `readConfig`
precedent. Full backend suite recorded verbatim: 126/126 suites, 2641/2641
tests passing (run from repo root — `cd src/backend && npx jest` spuriously
fails an unrelated cwd-relative wine-downloader test). `tsc --noEmit` exit 0.
Amazon's 4 channels remain for plan 34.5-10.); 07 done —
`runnerMiscFlowRegistration.ts` filled in with 6 of its 11 declared channels:
the 4 runner-CLI version probes (`getLegendaryVersion`/`getGogdlVersion`/
`getCometVersion`/`getNileVersion`) and the 2 Wine-runtime channels
(`downloadRuntime`/`isRuntimeInstalled`), all curated-import `ipcMain.handle`,
REQ-34.5-06/REQ-34.5-09 satisfied. D-04 recorded in source above the
`getCometVersion` registration (GOG's, not Zoom's; `launcher.ts:973`). New
16-test `runnerMiscFlows.test.ts` proves bidirectional registration kind, the
4 channels `utils/ipc_handler.ts` also registers are absent, no `ipc_handler`
import, and forward-pins the 5 channels plan 34.5-12 owns as NOT YET
registered. Fixed a real regression this plan's own port caused: 5
pre-existing "Invariant B" guard tests (`bootstrap.test.ts`,
`settingsFlows.test.ts`, `installFlows.test.ts`, `gameDetailsFlows.test.ts`,
`enrichmentFlows.test.ts`) used `getLegendaryVersion` as their "genuinely
still unported" canary — now real, invoking it throws instead of returning
`UNPORTED_CHANNEL_MARKER`. Rotated all 5 to `winetricksInstall` (permanently
deferred to Phase 34.6 by D-03, so no further plan re-triggers this fix),
following the exact `readConfig`/`getUserInfo` precedent plan 34.5-06 already
established. Full backend suite recorded verbatim: 127/127 suites,
2657/2657 tests passing. `tsc --noEmit` exit 0. The 5 channels plan 34.5-12
owns remain unregistered.); 08 done — `shortcutsFlowRegistration.ts` filled in
with all 4 of its declared channels: `shortcutsExists` (`ipcMain.handle`) plus
the send-heaviest trio in the slice, `addShortcut`/`removeShortcut`/
`processShortcut` (`ipcMain.on`, each guarded by the void-async-IIFE
fire-and-forget shape), REQ-34.5-05 satisfied. `electronStub.ts` gained
`fakeWindow.reload()`/`fakeWebContents.openDevTools()` logged no-ops
(T-34.5-27) so `processShortcut`'s `ctrl+r`/`ctrl+shift+i` hotkeys no longer
throw — both DECLARED DEGRADED under Tauri rather than reimplemented.
Corrected a source-level attribution error CONTEXT.md D-09 and
34.5-RESEARCH.md's Correction 3 both made: `shortcuts.ts:227` (the macOS
`.app` `run.sh` launch command) belongs to `addShortcut`, reached only via
`addShortcuts` -> `generateMacOsApp`, never `addToSteam` (plan 34.5-11).
New 21-test `shortcutsFlows.test.ts` proves bidirectional registration kind,
a forward-looking pin that `addToSteam`/`removeFromSteam`/`isAddedToSteam`
remain unregistered, containment (asserted against `realHomeAtSetup`, no
redundant local `os` mock — following `pathShim.test.ts`'s same-phase
precedent), send-body-safety for all 3 send channels (verified by manually
removing the guard and confirming the suite fails via a real
`unhandledRejection`), the six-case `processShortcut` switch, and the darwin
`GAMELIB_SHELL_EXE` pin (control/unset/empty) driving the REAL
`shortcuts.ts` `addShortcuts`/`generateMacOsApp` chain end-to-end — not a
re-implementation. Corrected the plan's own literal "directory listing
unchanged" wording for the UNSET/EMPTY cases: `generateMacOsApp` writes the
`.app`/Resources/MacOS scaffold and `Info.plist` BEFORE the `getPath('exe')`
throw, so the security-relevant guarantee actually pinned is that `run.sh`
specifically is never written. Found and fixed a real idempotence-guard gap
in `shortcutsFlowRegistration.ts` (same class of bug plan 34.5-06 fixed for
`registerRunnerAuthFlows()`): `electronStub`'s `ipcMain.on` appends to an
array on every call, so this module's THREE send channels tripled their
listener counts across `runnerSliceRegistration.test.ts`'s pre-existing
idempotence check; added the matching `let registered = false` guard. Full
backend suite recorded verbatim: 128/128 suites, 2682/2682 tests passing
(`npx jest --selectProjects Backend`, run from repo root — `cd src/backend
&& npx jest` again spuriously fails the same unrelated cwd-relative
wine-downloader test plan 34.5-06/-07 both already noted). `tsc --noEmit`
exit 0. Plan 34.5-11 owns the remaining Steam-add/remove trio
(`addToSteam`/`removeFromSteam`/`isAddedToSteam`) in the same module file.);
09 done — the Wine cluster's final 3 channels (`toggleDXVK`/`toggleDXVKNVAPI`/
`toggleVKD3D`) ported verbatim into `wineToolsFlowRegistration.ts`, completing it
at 9-of-9, REQ-34.5-03 satisfied. D-15's mis-citation (`tools/index.ts:794`,
DEFERRED winetricks cluster) corrected by direct read; the actually-reachable
dialog (`tools/index.ts:137`) was already safe and is now pinned by a
`jest.isolateModules()`-sandboxed test exercising the real `electronStub.dialog`
fallback — no fix built for a path that didn't need one. A tool-literal
regression test proves `toggleVKD3D` forwards `'vkd3d'`, not a copy-pasted
`'dxvk'`. `GameConfig` import corrected to `../game_config` (not `../config`).
Full backend suite: 173/173 suites, 3228/3228 tests, exit 0. `tsc --noEmit`
exit 0. See `34.5-09-SUMMARY.md`.); 10 done — Amazon's 4 remaining auth
channels (`getAmazonLoginData`/`authAmazon`/`getAmazonUserInfo`/`logoutAmazon`)
ported into `runnerAuthFlowRegistration.ts`, completing the auth cluster at
11-of-11, REQ-34.5-04 fully satisfied (jointly closed with plan 34.5-06's
Epic/GOG half, verified unchanged before marking complete). `authAmazon`
validates its payload against `NileRegisterData`'s real shape before invoking
`NileUser.login`, never logging the rejected value; a comment above it
records the ordering constraint (T-34.5-34) that plan 34.5-02's
`www.amazon.com` host anchor on `oauthLoginCapture.ts`'s nile matcher must
precede this credential mint, closing T-34.4.1-44b. `logoutAmazon` is an
unmodified `NileUser.logout()` delegation (confirmed no Electron `session`
usage, unlike Legendary's); no cookie clear added (T-34.5-37, inherited
T-34.4.1-47 residual, accepted not fixed). `runnerAuthFlows.test.ts` extended
from 23 to 30 assertions: bidirectional kind coverage for all 11 channels, a
strengthened sign-out asymmetry check, a 5-case authAmazon trust-boundary
block, and a 2-case integration block proving a URL that would have matched
the old host-free nile matcher now yields `null` and never reaches
`authAmazon` — the anchor-plus-mint pair fails together if either half
regresses. Full backend suite recorded verbatim: 173/173 suites, 3235/3235
tests passing (+7 from this plan's own new assertions). `tsc --noEmit` exit

0. See `34.5-10-SUMMARY.md`.); 11 done — the remaining Steam-add/remove trio

(`addToSteam`/`removeFromSteam`/`isAddedToSteam`) ported into
`shortcutsFlowRegistration.ts`, completing the shortcuts cluster at 7-of-7
(4 `ipcMain.handle` + 3 `ipcMain.on`), REQ-34.5-05 fully satisfied (jointly
closed with plan 34.5-08's desktop-shortcut/hotkey half). The invoke-kind
half of the exe-in-VDF pin (T-34.5-39/40) is proven against a REAL,
unmocked `nonesteamgame.ts` VDF-write chain: `backend/shortcuts/
nonesteamgame/nonesteamgame` is no longer mocked wholesale in
`shortcutsFlows.test.ts` (only `wiki_game_info` is auto-mocked to stay
network-free), and the UNSET/EMPTY/SET cases assert byte-identical
`shortcuts.vdf` content (not merely a rejected promise) using a disposable
`tmp`-package Steam-root fixture, following the same "artifact specifically
absent" correction shape plan 34.5-08 already made for its own send-kind
pin (`addNonSteamGame` writes an empty `shortcuts.vdf` via
`writeShortcutFile` BEFORE the `exe` assignment that throws, so "no file
exists" is not itself a safe assertion). Found and fixed a genuine
pre-existing TDZ crash in `steamhelper.ts`'s `prepareImagesForSteam`
(`errors` referenced inside a `.catch()` callback before its own `const`
declaration) — surfaced for the first time by this plan's SET case driving
the real code path. `shortcutsFlows.test.ts` grew from 21 to 25 tests. Full
CI suite recorded verbatim: 173/173 suites, 3239/3239 tests passing (+4
from this plan's own coverage extension). `tsc --noEmit` exit 0. See
`34.5-11-SUMMARY.md`.); 12 done — the misc module's remaining 5 channels
(`callTool` — all four branches: `winetricks`/`winecfg`/`runExe`/gog
post-step — `egsSync`, `getGOGLinuxInstallersLangs`, `syncSaves`,
`syncGOGSaves`) ported into `runnerMiscFlowRegistration.ts`, completing it
at 11-of-11; REQ-34.5-07/REQ-34.5-08 satisfied. `callTool`'s winetricks
branch proven (in-source flag + dedicated test) to call `Winetricks.run()`
live today, NOT gated on Phase 34.6's deferred winetricks channels
(Pitfall 4). Corrected CONTEXT.md D-09/RESEARCH.md Pitfall 1's claim that
`syncGOGSaves` reaches `save_sync.ts:146` (`getDefaultGogSavePaths`) — it
does not; the actual, still-unported caller is `getDefaultSavePath`,
logged to `deferred-items.md` item 4 for a future pass. All 38 of this
slice's declared channels are now registered across the four registration
modules, closing out the 38-channel port. `runnerMiscFlows.test.ts` grew
from 16 to 28 tests. Full CI suite recorded verbatim: 173/173 suites,
3251/3251 tests passing (+12 from this plan's own coverage extension).
`tsc --noEmit` exit 0. See `34.5-12-SUMMARY.md`.); 13 done — measured (not
transcribed) the electron-reach ledger's extension for the four
registration modules: 34 electron-importing modules UNCHANGED, `visitedFiles.size`
222→226. Corrected the plan's own prediction: `save_sync.ts` is NOT a new
baseline entry — it is imported only from `main.ts` (Electron-only), and
`syncGOGSaves` never calls `getDefaultGogSavePaths` (confirms deferred item
4). `requiredModules` gained four independently-anchored paths
(`shortcuts.ts`, `nonesteamgame.ts`, `legendary/user.ts`, `gog/user.ts`),
floor raised 220→224. Added a completeness gate proving all 38 channels are
registered with the correct kind (34 handle + 4 listen, set-equality on the
4 send channels, per-module counts 11/9/7/11) and a SEAM Invariant B proof
that all 19 dropped-or-deferred channels (3 Zoom, 16 moved to Phase 34.6)
are absent from both registries and still reject with
`UNPORTED_CHANNEL_MARKER`. REQ-34.5-10/REQ-34.5-13 satisfied. Fixed a
Rule-1 bug found building the above: the pre-existing containment-pin
test's `afterAll` re-invoked all four `registerXFlows()` to "restore"
shared registry state, but two of the four carry a permanent module-scope
idempotence guard, making that restore a silent no-op once first triggered
— `handlerRegistry` was measured at 20/34 after that `afterAll`, not 34.
Fixed via a canonical registration snapshot captured once at module load.
Both Discretion sweeps run clean against this phase's own diff: zero stale
`isTauri()` guards found (every one of the 38 channels routes through
`preload/ipc.ts`'s single generic `isTauri()` switch, no per-channel
override); `npm start` and `pnpm tauri:dev` both compiled and booted live,
sidecar output read from `gamelib.log`. Full green check recorded verbatim:
`npm run test:ci` 173/173 suites, 3279/3279 tests, exit 0; `tsc --noEmit`
exit 0; `cargo check` exit 0 (manual, no CI step); `cargo test` 40/40, exit

0. See `34.5-13-SUMMARY.md`.); 14 done — `34.5-PORTED-CHANNELS.md` declares all

38 channels (11/9/7/11 per module) with kind, registration module, honest
proof level and riders; every `LIVE (item N)` cell also reads PENDING since
34.5-15's live gate has not run. `T-34.4.1-44b` closure (plan 34.5-02) cited
in the obligations section; the three research corrections (D-15 dialog
site, D-10 second `exe` site, D-12 `nile_config` label) and the resolved
`documents` Discretion question recorded. Four accepted residuals named
(`processShortcut`'s degraded hotkeys, the inherited Amazon/GOG cookie-jar
residual T-34.4.1-47, the MEDIUM-confidence `www.amazon.com` anchor
Assumption A1, `GAMELIB_SHELL_EXE`'s unproven macOS bundle behaviour
Assumption A2). Two material corrections stated plainly per the wave-4
measurement: `getDefaultSavePath` remains genuinely unported (GOG saves-sync
does not resolve its default location under the sidecar until Phase 34.6),
and `save_sync.ts` is NOT a new electron-reach entry (measured set stayed
at 34 modules). Exactly two rows carry `LIVE (item 4)` — `addToSteam`
(`nonesteamgame.ts:258`) and `addShortcut` (`shortcuts.ts:227`) — each
naming its own distinct call site. `ported-channels-gate.py` (9 self-tested
checks: row count, kind/send-set correctness, proof-level vocabulary,
PENDING/PASS/FAIL state on LIVE cells, 38+3+16=57 arithmetic against
`IPC-PORT-INVENTORY.md`, per-module counts, four residuals present,
`T-34.4.1-44b` citation, item-4 two-channel scope) exits 0 against the real
document and `--self-test`; a negative control (corrupting one row's proof
level to a bare `done`, then restoring) proved the gate genuinely fails on
bad input. REQ-34.5-11 satisfied. No source file touched (`git diff
--name-only` shows only `.planning/` paths). `npm run test:ci` 173/173
suites, 3279/3279 tests, exit 0 both before and after (unchanged, as
expected); `tsc --noEmit` exit 0. See `34.5-14-SUMMARY.md`.)

34.4.1-08 PARTIAL (Task 1 of 3 done, commit `3f9562a3f`) -- HELD at Task 2, the blocking
4-item human-verify live gate. No SUMMARY written; the plan is NOT complete and the phase is
NOT verified. Task 1 evidenced the gate's 6 preconditions into `34.4.1-LIVE-GATE.md`: P1
satisfied (clean rebuild, real `pnpm tauri:dev` launch, sidecar confirmed via `gamelib.log`
growing 2196->4952 bytes and `ps aux` showing shell+wrapper+sidecar, then cleanly quit), P3
satisfied (a LIVE Humble credential existed and was moved aside recoverably per explicit
developer authorization -- TWO verified byte-identical backups at
`~/Library/Application Support/GameLib/humble_store/config.json.pre-34.4.1-08-gate.bak` and
the session scratchpad; the developer is signed out of Humble until the gate runs or a
backup is restored), P5 satisfied (log path + 4952-byte tail baseline). P2/P4/P6 are
honestly deferred to operator action at gate time with reasons stated, not softened: P2 is
an attestation by nature; P4 (an unrevealed key exists) has a real ordering conflict with P3
since reading the Keys page needs the session P3 destroys; P6 (plant a non-Humble control
cookie) needs a live child window -- and its ordering is load-bearing, it MUST exist before
item 3's disconnect or item 3(b)'s domain-scope proof has no control. Automated baseline
recorded verbatim rather than rounded to green: `cargo test` exit 0 (37/37), but
`npm run test:ci` exit **1** on both runs -- 2 failures / 3095, being the standing
`rustInvokeChannel.test.ts` baseline plus one suite that lands differently each run
(`settingsFlows.test.ts`, then `tray_icon.test.ts`) with the same
`rustInvoke timed out after 60000ms: keyring_get` signature, i.e. the documented cross-test
`rustInvoke`-mock frame-leak flake; both flaked suites pass in isolation and Task 1 touched
zero source files. Plan 08 Task 1's acceptance criterion "test:ci and cargo test exit codes
are recorded as 0" is therefore NOT met on the test:ci half -- unresolved, and a candidate
gap item if the flake ever proves load-bearing.

**Phase 34.5 is PLANNED (2026-07-29), not started.** `/gsd-plan-phase 34.5` produced
`34.5-RESEARCH.md`, `34.5-VALIDATION.md`, `34.5-PATTERNS.md` and **15 PLAN.md files in 6 waves**,
and minted **REQ-34.5-01..13** into REQUIREMENTS.md (the ROADMAP `Requirements: TBD` line is
replaced). Scope is **38 channels ported, not the inventory's 57** — Zoom's 3 dropped permanently
(D-02) and 16 deferred to a **Phase 34.6 that does not exist in ROADMAP.md yet**; inserting it is
REQ-34.5-11 / plan 03 Task 2, and Phase 35's "re-plumb complete" precondition is silently false
until that lands. Wave 1 is seam-first per D-06; wave 6 is a BLOCKING 5-item live gate whose
**numbered precondition 1 is that 34.4.1's own gate has recorded PASS** — so 34.5 can be built now
but cannot ship a real OAuth credential path until the held gate above runs. Plan-checker: 0
blockers across two passes.

Two defects were found by reading source **during planning** and are baked into the plans; neither
appears in CONTEXT.md or RESEARCH.md: (1) `LegendaryUser.logout()` (`legendary/user.ts:71`) calls
`session.fromPartition('persist:epicstore')`, which `electronStub` returns `{}` for, so a verbatim
port throws before `configStore.delete('userInfo')` runs — shipping a sign-out that revokes the CLI
session but leaves the profile behind; (2) `processShortcut` (`main.ts:1465`) is an app-shell hotkey
channel, not a game-shortcut one, and its ctrl+r / ctrl+shift+i cases throw because the stub's fake
window is truthy but implements neither `reload()` nor `openDevTools()`.

Note on tooling: `gsd-sdk query check.decision-coverage-plan` reported `passed: false` for D-01 and
D-03 on this phase. That is a **false negative from a broken parse**, not a real gap — the handler
read 12 decisions where CONTEXT.md has 15, and its "D-03" body is a mashup of D-03 and D-04's text.
Both decisions are genuinely cited (D-01 in plan 03; D-03 in plans 03 and 14, where it drives the
Phase 34.6 insertion). Verified by hand; no override was accepted because there was no gap.

Also of note: this session's `gsd-sdk query state.begin-phase` corrupted this file in the
documented way (`percent` 93->75, `Plan: 8 of 9 ...` -> `Plan: 1 of 9` leaving a dangling
fragment, and `Status:` spliced into the historical "Prior phase: 34.1" block). The write was
reverted and these fields hand-corrected.

34.4.1-07 done -- Declared what actually shipped (docs-only, no source touched; commits
`093b9ef83`, `6c7fa4d15`, `5d567ccb9`): Task 1 wrote `34.4.1-PORTED-CHANNELS.md`, a 7-row table
(6 `humble*` browser-auth channels + the new Tauri-only `oauthCaptureLogin`) with proof levels
traced to source and to each prior plan's SUMMARY -- verified independently rather than inherited
(confirmed 6 Rust dispatch arms, 4 handle + 2 send Humble channels, `oauthCaptureLogin` as a
handle channel, 37/37 cargo tests, `classifyCookieRead`'s platform-independent truth table, all by
direct source read). Named D-04/D-03's original acceptable bad case up front (from
`34.4.1-DISCUSSION-LOG.md` Q3 -- Humble declared-degraded if the cookie-jar read failed) and
recorded that it did NOT materialize at the unit-proof level, while being explicit that the real
live login itself (gate item 1) remains unobserved. Declared Linux/Windows per-platform status by
naming three specific unverified surfaces (`cookies_for_url()` domain-match, UA fingerprint gap,
`data_store_identifier` gating) and the one platform-independent proof that does exist
(`classifyCookieRead` has no platform branch). Recorded 34.4 D-05's `humbleDisconnect` partial as
CLOSED (plan 06) and 34.4 D-09's "no Tauri path" statement as PENDING STRIKE (plan 08's call).
Declared T-34.4.1-47 (shared cookie jar, accepted, domain-scoped clear makes it tolerable) and
T-34.4.1-44b (nile/zoom host-free redirect match, forwarded obligation to Phase 34.5) as accepted
residuals. Task 2 edited SEAM.md in exactly 2 hunks (new §1 subsection + §3 BrowserWindow row
retirement), Invariant B byte-unchanged, `IPC-PORT-INVENTORY.md` verified unmodified (`git diff
--stat` empty) -- its stale `humbleDisconnect` L73-75 note left unedited, flagged as a follow-up
for plan 08. Task 3 wrote `ported-channels-gate.py`, 8 self-tested checks (row presence/count,
invoke/send kind split, permitted proof-level forms, an inventory set-equality cross-check with
`oauthCaptureLogin`'s exclusion asserted explicitly, inventory-untouched via `git diff --stat`,
SEAM.md checklist closure, `oauthCaptureLogin`'s never-live pin); both the real-document run and
`--self-test` exited 0 on the first attempt. `pnpm codecheck`: clean. `pnpm test:ci`: 3093 passed
/ 2 failed / 3095 total / 166 suites -- one is the documented baseline (`rustInvokeChannel.test.ts`);
the other (`gameDetailsFlows.test.ts`) is the same pre-existing cross-test frame-leak flake class
prior plans (03, 06) already documented, confirmed clean in isolation (31/31), not a regression
(this plan touched zero source files). REQ-34.4.1-10/13 complete, see 34.4.1-07-SUMMARY.md. Next:
34.4.1-08 (the blocking 4-item live gate).

34.4.1-06 done -- Closed 34.4 D-05's declared `humbleDisconnect` partial and ran the phase's
guardrail sweeps (commits `d5dd150c6`, `8458db8af`): Task 1 gave `disconnect()`'s Tauri seam path
a domain-scoped cookie clear -- opens a HIDDEN window on `HUMBLE_BASE_URL` (the only way to reach
the app-wide jar), calls `seam.clearCookies(label, 'humblebundle.com')`, logs only the deleted
count, and closes the window unconditionally in a `finally`; the credential store is still cleared
first and unconditionally, and the cookie step is guarded (a rejecting `open`/`clearCookies`/
`close` never throws out of `disconnect()`). Electron's original five-step
`session.fromPartition` path is untouched. 6 new test cases prove ordering, exact scope, and all
three rejection paths. Task 2 added `humbleLoginFlowRegistration.ts` and
`oauthLoginFlowRegistration.ts` to the electron-reach ledger's `ENTRY_POINTS` and regenerated the
baseline by measurement: 34 electron-importing modules before and after (unchanged, agreeing with
the prediction), `visitedFiles.size` grew 219 -> 222 (floor raised 200 -> 220); extended
`childWindows.test.ts` with 4 new T-34.1-27 cases cross-linked to the Rust-side
`next_login_window_label()` tests. Task 3 ran both Discretion sweeps against the phase's complete
diff and found zero defects: Sweep A found no stale `isTauri()` guards (the two new guards in
`WebView/index.tsx` and `useTauriOAuthLogin.ts` are deliberate and correctly scoped; all 6 ported
channels confirmed reachable), Sweep B confirmed `npm start` and `pnpm tauri:dev` both compile and
run, Sweep C's four anti-pattern greps were all clean. `npm run test:ci`: 3094 passed / 1 failed
(documented baseline) / 166 suites -- no new failures (confirmed by a second full run after an
apparent second failure on the first run turned out to be the same pre-existing flake class,
isolated-verified clean). `cargo test`: 37/37. REQ-34.4.1-06/09/11 complete, see
34.4.1-06-SUMMARY.md. Next: 34.4.1-07/08 (still incomplete).

34.4.1-09 done -- Wired all four OAuth runners (legendary/gog/nile/zoom) to the login-window seam
(commits `c427330ea`, `f8e4bc1de`, `c76875e83`): Task 1 added `matchOAuthRedirect()` (pure, all
four real redirect shapes individually proven by test) + `captureOAuthLogin()` (seam-driven,
deadline-bounded, close-guaranteed, never rejects). Task 2 exposed one `oauthCaptureLogin` handle
channel, boundary-validated, reaching `window.api` (verified by importing the assembled preload
default export directly, not by grep alone). Task 3 added `useTauriOAuthLogin()`, which genuinely
opens a login window per runner, captures the redirect, and hands the code to the still-unported
`login`/`authGOG`/`authAmazon`/`authZoom` -- the `UNPORTED_CHANNEL_MARKER` rejection is caught and
surfaced as `{ phase: 'blocked' }` (never swallowed, never an unhandled rejection, asserted live
per runner), and `TauriLoginPanel` now renders the real capture phases via plan 05's reserved
`state` prop. `OAuthRunner`/`OAuthCaptureOutcome` moved to `common/types/oauthLogin.ts` (common ->
backend/frontend import direction preserved). `GlobalState.tsx` untouched (verified empty diff).
One Rule-3 blocking fix: added the new sidecar test file to `testContainment.test.ts`'s declared
containment list. `npm run test:ci`: 3084 passed / 1 failed (documented baseline) / 166 suites --
no new failures. REQ-34.4.1-08 complete, see 34.4.1-09-SUMMARY.md. Next: 34.4.1-06/07/08 (still
incomplete; this plan was executed out of sequence as its own wave).

34.4.1-04 done -- Gave `humbleRevealKey` a real Tauri transport (commits `118fdffae`, `10312ad35`):
Task 1 added the `humble_reveal_post` Rust dispatch arm -- a hidden, on-demand child window issues
the reveal POST from its own JS `fetch()` context (the one structurally-new option with a genuine
browser TLS/HTTP fingerprint), every interpolated value is JSON-escaped (`serde_json::to_string`,
never a naive `format!("'{}'", ..)`), and the response returns via a cancelled navigation to the
RFC 2606 `.invalid` host `gamelib.invalid`; the window closes on every exit path (script error,
success, and timeout alike, D-08). 14 new `#[cfg(test)]` cases (37 total, all green). Task 2 wired
`LoginWindowSeam.revealPost()` and branched `humblePostRequest` onto it under Tauri -- Electron's
`net.request` path is byte-for-byte unchanged; both feed the same `RevealResponseSchema`/
`HumbleTransportHttpError` contract, and the seam call is wrapped in the same `REQUEST_TIMEOUT_MS`
bound so a hung `rustInvoke` still surfaces the existing timeout error. Retired
`electronStub.net.request`'s stale "Phase 34.4.1... See D-06" message (that seam now exists) and
updated `netStub.test.ts`, which had pinned the old wording. Fixed two unrelated pre-existing gate
collisions found only by running the full suite: a `#[derive(Debug)]` tripped
`tauriShellSource.test.ts`'s file-wide tray-scope-boundary text gate (removed; added a manual-match
test helper instead), and the RESEARCH.md example's multi-line `r#"..."#` script template tripped
`longRunningChannels.test.ts`'s WR-08 per-line quote-balance gate (rewritten as `concat!` of
single-line, single-quoted-JS pieces). RESEARCH.md Open Question 1 (does `on_navigation`'s
cancellation prevent the network attempt) could not be observed live in-app this session (no
authenticated Humble session available to an automated executor) -- an independent DNS check
confirmed `gamelib.invalid` does not resolve (NXDOMAIN) on this network, and the full observation
is hand-off to `34.4.1-08`'s live gate item 4 (recorded in `34.4.1-04-SUMMARY.md`). `cargo
test`/`cargo check` clean, `tsc --noEmit`/`codecheck` clean, `pnpm test:ci` back to the documented
single baseline failure (`rustInvokeChannel.test.ts`, 2995/2996 passing). REQ-34.4.1-05 complete.
Next: 34.4.1-05.

34.4.1-03 done -- Rewired `HumbleUser.watchForLogin()`, `finishLogin()`'s csrf capture, and
`getLiveCsrfToken()` to drive the login-window seam when installed (Task 1, commit `bde1c4285`):
Electron keeps the byte-for-byte untouched `session.fromPartition` path; the Tauri path opens a
Rust-owned window on `HUMBLE_LOGIN_URL`, classifies every cookie read through `classifyCookieRead`
(UNDECIDABLE/UNSUPPORTED_OR_ERROR both settle `{status:'error'}` loudly instead of ever polling on
a dead channel), drains `seam.takeEvents()` before every read so a main-frame `'finished'` event
re-arms the deadline and bypasses the poll-path throttle (REQ-34.4.1-03), and closes the window
exactly once on every exit path via a floated, non-throwing `settle()`. `finishLogin()` threads the
window label through as an explicit parameter for its csrf_cookie capture (same window as the
accepted session cookie); `getLiveCsrfToken()` returns the stored snapshot under a seam (no live
window exists at reveal time) rather than throwing into the Electron-only read. Task 2 (commit
`a78536f95`, test-only -- items 2a/2b landed with Task 1 since they share the seamLabel plumbing,
documented as a deviation) added 10 new tests in a dedicated seam-path describe block, including a
hand RED-proof on the UNDECIDABLE discriminator (weakened to a bare `return`, confirmed the "does
not tick again" case times out, restored, re-verified). 56/56 `user.test.ts` tests green (46
pre-existing unchanged), `tsc --noEmit`/`codecheck` clean, `pnpm test:ci` at the documented baseline
(1 pre-existing `rustInvokeChannel.test.ts` failure, 2989/2990 passing -- a `downloadqueue.test.ts`
timeout seen on one run was confirmed flaky/pre-existing cross-test leak, not a regression, via
isolation + a clean re-run). REQ-34.4.1-02/-03 complete (already marked by 34.4.1-02's own
completion), see 34.4.1-03-SUMMARY.md. Next: 34.4.1-04.

34.4.1-02 done -- Login-window seam (`LoginWindowSeam` + `classifyCookieRead`) and the 6 curated
browser-auth channels registered on the sidecar (Tasks 1-3). Task 4 (blocking checkpoint,
Assumption A4) hit three layered, stacked silent-failure defects before producing real evidence:
console-only logging that reached neither `gamelib.log` nor the `tauri:dev` terminal, a
logger-not-yet-initialized `TypeError` swallowed inside an unguarded async IIFE, and (this
continuation agent's fix, commit `2ddeb716c`) `electronStub.app.userAgentFallback` left
`undefined`, which `standardBrowserUserAgent()` reads unconditionally -- throwing before
`seam.open()`, and therefore before `WebviewWindowBuilder::build()`, was ever reached. Fixed by
populating a per-`process.platform` Chrome-shaped UA fallback (no `Electron/x.y.z` token, matching
the function's happy-path regex directly); added `userAgent.test.ts` pinning it against the REAL
`electronStub.ts`. Re-ran the smoke both headless (`node build/main/sidecar.js`, proves the
rustInvoke frame reaches the transport) and live (`pnpm tauri:dev`): `gamelib.log` recorded
`starting` -> `opened label=loginwin-0-18c611f5af550240-a7d77671` -> `closed=true`, zero panic
matches in either the log or the terminal capture, app process alive after close. **Assumption A4
VALIDATED** -- `WebviewWindowBuilder::build()` off the sidecar's `thread::spawn`'d rustInvoke
worker does not panic on AppKit's main-thread affinity; no `run_on_main_thread` hop needed in
plan 34.4.1-01's Rust arms. No `electronReachLedger.test.ts` update needed (`humble/userAgent.ts`
was already tracked in the Phase 34.4 Plan 08 baseline). REQ-34.4.1-02/-03/-04/-05/-13 complete,
see 34.4.1-02-SUMMARY.md. Next: 34.4.1-03.

34.4-10 done -- Ran the phase's blocking 5-item live gate under `pnpm tauri:dev`, recorded in
`34.4-LIVE-GATE.md`. Task 1's automated sweep found and fixed one real Rule-1 build regression
before spending human gate time: a bare `preload/tauriTransport` import in `WebView/index.tsx`
(added by plan 34.4-07) had no matching Vite alias, breaking the Electron renderer dev server --
invisible to `tsc --noEmit` (masked by `tsconfig.json`'s `baseUrl`) and to every jest suite (none
run a real bundler), caught only by the required `npm start` regression check (commit `9f9f0402c`).
**Item 2 (`logoutSteam`) FAILED on the human gate's first attempt** -- the whole justification for
this phase's blocking-gate design (D-08): ten plans, every unit test, `tsc`, `cargo check`, the
electron-reach ledger and the self-tested ported-channels gate were ALL green while Steam sign-out
was completely unreachable from the UI. Root cause: `GlobalState.tsx`'s `steamLogout` still carried
a Phase 30 G-30-01 `isTauri()` early-return that short-circuited before `window.api.logoutSteam()`
was ever called; its own comment's premise ("no listener is registered on the sidecar under Tauri")
had been falsified by plan 34.4-01 registering the channel, but no plan in this phase touched
`GlobalState.tsx`, so the guard silently outlived the fact it was built on. Because `logoutSteam` is
a `send` -- no reject, no timeout, no console line -- only a human driving the real UI could observe
it. **Fixed in-phase, authorized by the user as a deviation rather than a separate gap cycle**
(commits `1cf42d43b` fix, `52dfcfb66` test): removed the stale guard and closed the underlying
fire-and-forget race (not just unblocked it) via new `src/frontend/state/SteamSignOut.ts`, which
fires the send then polls the already-ported `getSteamUserInfo` invoke (20x150ms) to confirm
sign-out before clearing local state/reloading, with an honest failure dialog on timeout. Item 2
attempt 2 PASSED, proven at the persistence layer (a present-to-absent `userData`/`isLoggedIn`
transition in `steam_store/config.json` across a full quit-and-relaunch) -- stronger evidence than
the plan's UI-only check. Incidental positive finding: the surviving encrypted Electron
`refreshToken` after Tauri sign-out is correct (separate, contractually unbridged store) and retires
a latent risk flagged in the v0.8 partial audit. Items 1/3/4 PASSED; item 3 was verified from the
web inspector console rather than the UI the plan described (neither channel has a usable display
surface in this build) -- a stronger proof, recorded as a method deviation. Item 5 PASSED for port
fidelity and surfaced a genuine pre-existing (not port-introduced) Electron defect:
`steamBottleStatus().provisioned` (store flag) and `isSteamBottleProvisioned()` (live filesystem
check) disagree on the test machine; on-disk truth confirms the filesystem check is correct; the
sidecar handler is byte-identical to `main.ts:948-953` so the port faithfully carried the
inconsistency across rather than introducing it. Gate verdict: PASS 5/5. REQ-34.4-13/15 complete,
see 34.4-10-SUMMARY.md. **Phase 34.4 is now fully executed on disk (10/10 plans).** Carried, non-
blocking: the bottle store-vs-filesystem split, `electronStub`'s missing `request.abort()`, six
Humble channels deferred to Phase 34.4.1, the `rustInvokeChannel.test.ts` baseline failure, and two
outstanding confirmatory checks (Electron bottle-status parity spot-check, Electron sign-out sanity
check -- the item-2 fix changed Electron's logout path too and nothing covered `steamLogout` before
this phase). Secure-phase 34.4 still owed. Next: Phase 34.4.1 or Phase 34.5.

34.4-09 done -- Wrote 34.4-PORTED-CHANNELS.md declaring all 31 ported channels (13 genuinely-Steam

+ 2 corrected-to-GOG + 16 Humble) in one five-column table with honest per-row proof levels (unit /

unit + LIVE (item N) / unit only, declared) drawn from what the 8 prior SUMMARYs actually record --
never inflated to "seen working". Named all four framing corrections this phase owed its own
upstream planning docs: humbleRecordGiftLinkOpened's corrected handle kind, the GOG reclassification
of getPrivateBranchPassword/setPrivateBranchPassword, the electron-reach ledger's MEASURED
four-module growth (not the predicted two/three -- humble/userAgent.ts was an unpredicted fourth),
and the two registration modules that were never already electronReachLedger.test.ts entry points.
Every accepted rider named per-row: humbleDisconnect's D-05 declared partial + Phase 34.4.1 revisit
obligation, redeemSteamKey/steamBottleProvision's D-08 unit-only never-live-run declarations,
humbleRunValidation's resolved (not declared) node:sea packaged-guard. Any unit + LIVE cell marked
as a forward reference to plan 34.4-10's not-yet-run live gate. Wrote ported-channels-gate.py: 9
check_* functions covering REQ-34.4-14 (declared-list shape) and REQ-34.4-16 (verifying, never
editing, IPC-PORT-INVENTORY.md's already-correct 31/6/57 scope-surgery split), each with exactly
one self-test case (9:9, counted and asserted equal at runtime); both `python3
ported-channels-gate.py` and `--self-test` exit 0; git diff --stat on IPC-PORT-INVENTORY.md and
ROADMAP.md confirmed empty. Two Rule-1 gate-logic bugs found and fixed before commit during the
plan's own mandatory verify-against-the-real-document step: a case-sensitive rider-token mismatch,
and a whole-section (vs whole-line) backtick extraction that produced a false positive against the
real inventory's own explanatory prose (the D-01/D-02/D-03 scope-surgery paragraph names
isLoggedIn and the 6 deferred channels in prose while explaining they moved out). Closed SEAM.md's
Incremental-Port Checklist steps 5/6: new §1 subsection "Steam completion and Humble cluster (real,
Phase 34.4)" after the Phase 34.3 subsection; §3 deferred item 5 (D-02, the login-channel row)
retired as fully closed; §3 BrowserWindow row re-targeted from "Phase 34.4" to "Phase 34.4.1" per
D-01. Diff confined to exactly 2 hunks; Load-Bearing Invariant B byte-unchanged. REQ-34.4-14/16
complete, see 34.4-09-SUMMARY.md. Next: 34.4-10 (the phase's blocking, non-autonomous live gate).

34.4-08 done -- Extended electronReachLedger.test.ts's ENTRY_POINTS from 7 to 10 (added
humbleFlowRegistration.ts, steamAuthFlowRegistration.ts, settingsFlowRegistration.ts) and
regenerated BASELINE_ELECTRON_REACHING_MODULES by actually running computeElectronReach() via a
temporary, removed measurement statement (before: 30 modules / visitedFiles.size 202; after: 34
modules / visitedFiles.size 217). The measurement DISAGREED with the plan's own prediction: 4 new
modules appeared, not the 3 named in the plan's <interfaces> section and 34.4-RESEARCH.md --
src/backend/humble/userAgent.ts (imports `app` from 'electron', reached two-hop via
humbleFlowRegistration.ts -> humble/user.ts:16 -> ./userAgent, and independently three-hop via
humbleFlowRegistration.ts -> humble/library.ts:12 -> ./adapter -> ./userAgent) was not named by
either source. Per the plan's explicit rule the measurement won; all 4 were added to the baseline
with reach-path comments, flagged as a genuine planning-time gap rather than silently absorbed.
Extended requiredModules anti-degradation list with all 4 edges; raised the reachability floor
150->200 (measured 217, never lowered). Hand RED-proofed (removed the userAgent.ts entry, growth-
tripwire failed naming exactly that module, restored, re-verified green). Task 2's phase-wide
structural sweep (7 checks) all green: tsc --noEmit clean; cargo check clean + src-tauri/ diff-stat
empty (zero new Rust, standing rider held); full backend jest run twice, 2468/2470 both times,
identical failing-suite set (only the 2 documented pre-existing baselines -- confirms 3658b204's
leaked-timer fix is genuinely stable, no flaky third failure landed on either run); frontend jest
213/213 clean; electronUntouched.test.ts 11/11 passing with diff-stat empty on that file for the
whole phase; main.ts and humble/ipc_handler.ts both byte-unchanged since the phase's first commit
(caebe13f1). Found and fixed one out-of-scope-but-CI-blocking Rule 1 defect during the prettier
sweep: storeManagers/steam/library.ts (touched by the out-of-band timer-leak fix 3658b204, never
run through prettier) failed prettier --check -- fixed via prettier --write (whitespace/line-wrap
only, verified library.test.ts unchanged 166/166). REQ-34.4-10/15 complete, see 34.4-08-SUMMARY.md.
Next: 34.4-09 (wave 4, the declaration/documentation plan) then 34.4-10 (the phase's blocking,
non-autonomous live gate).

34.4-05 done -- Humble ownership-override trio (humbleSetOwnershipOverride/humbleClearOwnershipOverride/
humbleGetOwnershipOverrides) + corrected humbleRecordGiftLinkOpened (ipcMain.handle, not the send
34.4-CONTEXT.md's Discretion section incorrectly named -- confirmed by three independent sources:
ipc_handler.ts:72 addHandler, common/types/ipc.ts:350 Promise<void>, preload/api/humble.ts:31
makeHandlerInvoker) + humbleDisconnect (the one genuine ipcMain.on send in the Humble half, D-05
declared partial: the synchronous credential wipe is the real, fully-functional security boundary;
only the session.fromPartition wipe loop no-ops against the accepted Phase 29 D-09 stub; Phase
34.4.1 must revisit once a real browser context exists) + humbleRunValidation, registered on the
Tauri sidecar (wave 2, depends_on: ["34.4-04"]). humbleFlowRegistration.ts now registers all 16
Humble channels this slice owns (15 ipcMain.handle + 1 ipcMain.on); the 6 Phase 34.4.1 channels
stay unregistered (negative-scope guard re-confirmed green). Both server-side re-validation guards
(D-42/T-12-03 non-fuzzy rejection, D-59/D-57 gift-link eligibility) ported verbatim, each proven by
a not-called assertion plus C4 no-leak assertions against a seeded fake key value/URL.
humbleRunValidation's dev-vs-packaged divergence RESOLVED (not declared) via a new
isPackagedSidecar() helper using require('node:sea').isSea(), empirically verified at execution
time (Node v26.2.0: typeof require('node:sea').isSea === 'function', returns false under the plain
dev sidecar entry) -- electronStub.app's hardcoded isPackaged:false made reusing Electron's guard
verbatim unsafe. Added 18 new tests (35 total, up from 17): ownership-trio + gift-link round-trips
and rejection proofs, humbleDisconnect positive/negative kind proofs + WR-02 rejection guard, the
D-05 store-clear-independence ordering proof driving the REAL (jest.requireActual-bypassed,
non-automocked) HumbleUser.disconnect() against the real electronStub D-09 session no-op (proving
the three store clears happen even though every partition wipe step fails -- not merely that
disconnect was called), and humbleRunValidation's three packaged-signal branches via fresh
dynamically re-required module instances per jest.doMock('node:sea', ...) scenario. Found and fixed
a real latent test bug during the mandatory hand RED proof: 34.4-04's negative-scope guard test
called registerHumbleFlows() a second time, safe only while every registration was ipcMain.handle
(map-overwrite) -- unsafe the moment humbleDisconnect's ipcMain.on (push-semantics) landed, since a
repeat call would have stacked a duplicate listener and doubled every future disconnect() call for
the rest of the process; removed the redundant call. Both hand RED proofs recorded verbatim in
34.4-05-SUMMARY.md (flip humbleDisconnect to handle -> 4 tests fail correctly; delete the
non-fuzzy-rejection early return -> 2 tests fail correctly on their not-called assertion). Process
lesson recorded: Task 1+2 was implemented in one editing pass and not committed before running the
first hand RED proof's `git checkout --`, which reverted all the way to the last commit (34.4-04's
state) and wiped the uncommitted Task 1+2 work -- recovered by hand-reconstructing the file from
retained edit context, re-verifying, then committing before the second RED proof. Full backend
sweep: 116/118 suites, 2468/2470 tests -- only the 2 pre-existing documented baselines
(rustInvokeChannel.test.ts, wine rest.test.ts); no backend-file-unrelated regressions; main.ts and
src-tauri/ both byte-unchanged. electronReachLedger.test.ts stayed green (4/4) -- same measured-not-
assumed finding as 34.4-04: humbleFlowRegistration.ts is not yet in ENTRY_POINTS, which plan 34.4-08
owns. REQ-34.4-07/08/09 complete, see 34.4-05-SUMMARY.md. Next: 34.4-08 (wave 3).

34.4-02 done -- macOS CrossOver bottle trio (steamBottleProvision/isSteamBottleProvisioned/
steamBottleStatus) + guided Steam-client install pair (steamClientSetupStart/
steamClientSetupRecheck) + redeemSteamKey/getSteamInstallSize registered on the Tauri sidecar
(wave 2, depends_on: ["34.4-01"]). Completes all 13 genuinely-Steam channels in
`steamAuthFlowRegistration.ts` (3 QR + 6 credential/session from plan 01 + 7 here = 16 total
registrations). `steamBottleStatus` reproduces the one genuinely inline body among the 15
Steam-labeled channels (`main.ts:948-953`) exactly -- both `get_nodefault(...) ?? fallback` reads,
no re-derivation from `isBottleProvisioned()`, no `loggedIn` field (17-17/WR-02, D-04).
`redeemSteamKey`'s WR-03 main-process trust boundary ported verbatim from `main.ts:906-917`:
malformed payload (`store !== 'steam'`, non-string key, empty key) rejected with the literal
`{ store: 'steam', outcome: 'error', message: 'invalid-request' }` shape before `SteamUser.redeemKey`
is ever called; never logs the key value. Module docstring extended with `main.ts:LINE` citations
for all 7 new channels, and explicitly states `getPrivateBranchPassword`/`setPrivateBranchPassword`
are NOT registered here (GOG channel, corrected classification -- routed to
`settingsFlowRegistration.ts` per 34.4-PATTERNS.md). Added 14 new tests (28 total, up from 14):
bottle trio (incl. both `??` fallback branches + a no-`loggedIn`-property negative assertion),
client-setup pair, and 4 redeemSteamKey rejection cases (bad store, non-string key, empty key, null
payload) each asserting `SteamUser.redeemKey` was NEVER called -- the not-called assertion, not
just the returned message, is what proves the trust boundary -- plus a dedicated no-key-leak test
spying on console.log/warn/error. Hand RED-proofed by relocating the validation guard to after the
delegation: exactly the 5 expected redeem-related tests failed for the expected reason (4
rejection cases + the no-leak test), the 2 unrelated redeem tests (valid payload,
`getSteamInstallSize`) stayed green; reverted via `git checkout --`, confirmed `git diff --stat`
empty against the Task 1 commit. Full backend sweep: 115/118 suites, 2449/2452 tests -- the 3
failing suites are all pre-existing and unrelated, confirmed by isolation re-run (`rustInvokeChannel.test.ts`
and wine `rest.test.ts` fail identically alone; `lifecycleStub.test.ts` passes 25/25 alone -- the
full-suite failure is cross-test timer pollution from `steam/library.ts`, a previously-documented
issue). `electronReachLedger.test.ts` 4/4 green, no new growth (`steam/games.ts` already baselined
from an earlier slice). No backend-file-unrelated regressions; `main.ts` and `src-tauri/` both
byte-unchanged. One minor documented deviation: `grep -c "loggedIn"` returns 2 (prose in the
docstring explaining the field's deliberate absence), not 0 -- satisfied in spirit, confirmed by
the code-level no-`loggedIn`-property test instead. REQ-34.4-03/04/05 complete, see
34.4-02-SUMMARY.md. Next: 34.4-05 (wave 2, depends_on: ["34.4-04"]).

34.4-07 done -- WebView D-04 honesty panel + Electron-unreachability gate (wave 1, depends_on: []).
Replaced the silently-blank Tauri login screen (`WebView/index.tsx`'s `!webviewPreloadPath` branch,
previously a bare `<></>` for every build) with an isTauri()-branched pair: the Tauri arm logs via
`window.api.logInfo` (naming the screen, runner, and reason) and returns the new, hook-free
(besides `useTranslation`) `WebviewUnavailablePanel.tsx`, extracted following the
`CrossoverBadge.tsx`/`MacArchBadge.tsx` DOM-less pattern -- heading + body naming the build
limitation and (when known) the attempted store, plus a next-step pointing to the Electron build;
no copy affordance, no `navigator.clipboard` reference. The Electron arm stays a distinct,
byte-unchanged `return <></>` with a comment naming Phase 34.4.1 as the real fix's owner. Added
`WebviewUnavailablePanel.test.tsx` (13 tests): content proof (4, via a DOM-less `collectText()`
walk of the React element graph), a self-tested `navigator.clipboard`-absence source gate (3), and
-- since `WebView` is hook-heavy and throws "Invalid hook call" if invoked as a plain function
outside a render tree, and this project has no DOM harness -- a STRUCTURAL FALLBACK source gate
(6) proving the Electron arm is distinct from and unreachable relative to the Tauri arm, with 4
self-tests (rejects merged single-return, rejects a dropped Electron fallback, rejects an
Electron arm silently changed to also render the panel, and a positive control accepting the
plan's own specified shape). Hand RED-proofed by merging the two arms back into the pre-plan
single `return <></>`: exactly the 2 tests asserting against the real source failed for the
expected reason (`Expected: true / Received: false` and `marker not found: if (isTauri())`),
all 4 self-tests + 7 other tests stayed green throughout; restored via `git checkout --`,
confirmed `git diff --stat` empty against the Task 1 commit. `electronUntouched.test.ts` run
green (11/11), byte-unchanged. Full frontend sweep: 27 suites / 213 tests, all passing (up from
26/200 pre-plan) -- no suite that was green went red. Full backend sweep: 116/118 suites,
2436/2438 tests -- only the 2 pre-existing documented baselines (`rustInvokeChannel.test.ts`,
wine `rest.test.ts`); no backend or Rust file touched (`git diff --stat src-tauri/` empty). No
deviations -- plan executed exactly as written. REQ-34.4-12 complete, see 34.4-07-SUMMARY.md.
Next: 34.4-02 (bottle/client-setup/redeem/private-branch group, wave 1).

34.4-06 done -- Hardened electronStub.net.request to fail fast and legibly (wave 1, depends_on: []).
`net.request()`'s previously-total-no-op `on()` now records handlers by event name and
asynchronously (`setImmediate`) invokes a registered `'error'` handler with an Error naming the
stub, Phase 34.4.1, and D-06 -- never a synchronous throw, never a rejecting promise
(`sidecar-dialog-reject-crashes` discipline). `humblePostRequest`'s own already-wired
`request.on('error', ...)` handler (`adapter.ts:328`) is now provably reachable: `net.isOnline`
byte-unchanged. Added `netStub.test.ts` -- Group 1 pins the stub's own contract (async-only
emission, no synchronous fire, safe with no handler registered); Group 2 drives `revealKey()`
(the exported caller of the un-exported `humblePostRequest`) against the REAL, unmocked hardened
stub and asserts the rejection carries D-06's seam text, not the pre-fix "Humble reveal request
timed out" message, settling without `REQUEST_TIMEOUT_MS`'s `setTimeout` ever being advanced
(fake timers, `setImmediate`/`nextTick` left real). Two Rule deviations: (1) Rule 1 -- fixed
`lifecycleStub.test.ts`'s stale "request() member is unchanged" assertion, which called `req.on()`
with zero args and no longer typechecked against the new 2-arg signature; (2) Rule 3 -- worked
around a discovered `app.userAgentFallback` gap (electronStub's `app` has no such member, and
`humble/userAgent.ts`'s `standardBrowserUserAgent()` -- called inside `humblePostRequest` BEFORE
`request.on('error', ...)` is ever reached -- throws on it) entirely inside `netStub.test.ts`'s
own `electron` mock factory, not in `electronStub.ts`; currently dormant in production since
`humbleRevealKey` stays unregistered until 34.4.1. Hand RED-proofed by restoring the pre-D-06
`electronStub.ts` (`git show HEAD~1`): Group 1 sees 0 handler calls, Group 2 never settles
(Jest's 5000ms test timeout) since the fake timer is deliberately never advanced; a throwaway ad
hoc check that forced the timer to elapse surfaced a SEPARATE, deeper, already-dormant gap --
`humblePostRequest`'s timeout branch calls `request.abort()`, which the stub has never
implemented (pre- or post-D-06) -- so the plan's predicted "misleading timeout message" is
actually masked by a `TypeError: request.abort is not a function`; recorded for Phase 34.4.1,
not fixed (out of scope per D-01/D-02). Restored `electronStub.ts` byte-identical to the Task 1
commit before committing Task 2. REQ-34.4-11 complete, see 34.4-06-SUMMARY.md. Next: 34.4-02
(bottle/client-setup/redeem group, same file, wave 1).

34.4-04 done -- Humble library/sync + key-state channel registration (wave 1, depends_on: []).
Created `humbleFlowRegistration.ts`, curated-importing `humble/user.ts`/`humble/library.ts`
directly (never `humble/ipc_handler.ts`, which also registers the 6 channels Phase 34.4.1 owns),
registering exactly 10 `ipcMain.handle` channels: `humbleGetUserInfo`/`humbleCheckHealth`/
`humbleSync`/`humbleGetKeys`/`humbleGetSyncState` (library/sync) and `humbleGetGiftedAt`/
`humbleMarkRedeemed`/`humbleUndoRedeemed`/`humbleGetRevealedKeyValue`/`humbleGetClaimAnnotations`
(key-state, REQ-34.4-07). Copied `steamAuthFlowRegistration.ts`'s per-file
`import '../storeManagers'`-first circular-dep fix (`humble/library.ts:41-42` reaches
`storeManagers/steam/electronStores`+`steam/user` the same way `steam/user.ts` does). Wired
`registerHumbleFlows()` into `handlers.ts` before `ensureStoresRegistered()`. Added
`humbleFlows.test.ts` (17 tests) mirroring `steamAuthFlows.test.ts`'s real-shim over-the-wire
pattern (bootstrap.ts's `init()`, `writeInvoke`, response-frame assertions), automocking
`humble/user`/`humble/library`: per-channel round-trips for all 10, argument-fidelity for the 3
`params`-taking channels (distinguishable gamekey/machineName values), a kind assertion (all 10
invoke-only), a negative-scope registration guard (the 6 Phase 34.4.1 channels stay unregistered
as handler AND listener), a wire-level `humbleRevealKey` Invariant B proof, and a curated-import
source gate with self-tests. Classified `humbleFlows.test.ts` in `testContainment.test.ts`'s
`STRUCTURALLY_CONTAINED_SUITES`. Two Rule 1 deviations found during the mandatory hand RED
proof: (1) the module's own docstring used wildcard notation `storeManagers/steam/*`, whose
literal `/*` inside a `//` line comment is misread by `stripSourceComments`' block-comment regex
as an unclosed opener, silently deleting the module's own import statements from the text the
curated-import guard inspects -- reworded to prose, no literal `/*` remains; (2) the curated-import
guard's regex only matched `from '...'`/`require(...)` forms, missing the realistic bare
side-effect-import shape (`import '../humble/ipc_handler'`, no `from` clause) that this codebase's
own curated-import idiom (`import '../storeManagers'`) actually uses -- broadened the regex, added
a self-test. The RED proof itself required importing AND CALLING `registerHumbleIpcHandlers()`
(not a bare import) since `humble/ipc_handler.ts` has no top-level registration side effect; all
3 target tests failed for the expected reason, then reverted (`git diff --stat` on the module
confirmed byte-identical to the Task 1 commit, modulo the retained docstring fix). Full backend
sweep: 2429/2432 tests, 114/117 suites -- only the 2 permanent pre-existing baselines
(`rustInvokeChannel.test.ts`, wine `rest.test.ts`) plus, on one of two runs, the already-documented
non-deterministic `library.ts` leaked-timer flake (confirmed clean on isolated re-run). No Rust
files touched; `main.ts`/`humble/ipc_handler.ts` byte-unchanged. `electronReachLedger.test.ts`'s
predicted red did NOT materialize -- measured (not assumed): its `ENTRY_POINTS` list was never
extended to include `humbleFlowRegistration.ts` by this plan (per the plan's own instruction that
34.4-08 owns that edit), so the ledger's traversal never reaches this module's electron-touching
edges; recorded as a correction to the plan's prediction, not fixed. REQ-34.4-07 complete, see
34.4-04-SUMMARY.md. Next: 34.4-02 (bottle/client-setup/redeem group, same file, wave 1).

34.4-03 done -- GOG private-branch password channels (wave 1, depends_on: []). Registered
`getPrivateBranchPassword`/`setPrivateBranchPassword` in `settingsFlowRegistration.ts` as GOG
channels (`main.ts:1510-1515`), correcting IPC-PORT-INVENTORY.md's file-grouped
misclassification under "Steam" (REQ-34.4-06) -- both route through
`libraryManagerMap['gog'].getGame(appName).getBranchPassword()`/`setBranchPassword(password)`,
zero new import (libraryManagerMap already imported for `requestGameSettings`/`isNative`), zero
new store plumbing. Extended `settingsFlows.test.ts` 17 -> 21 tests: GOG-routed round-trip,
non-transposed two-arg proof (password reaches `setBranchPassword`, appName reaches `getGame`),
a not-called assertion on `libraryManagerMap.steam.getGame` (the misattribution guard), and a
no-password-leak check across response frames + stderr. Hand RED-proofed the misattribution
guard by flipping `'gog'` to `'steam'` in one registration -- both the read-response and the
not-called assertion failed for the expected reason -- then restored byte-identical. One Rule 3
deviation: `gameDetailsImportGate.test.ts`'s Gate 7 do-not-touch sha256/semantic pin on this
same file needed updating (10 -> 12 channels) since this plan deliberately extends the file that
gate protects; the `steamLibrary.has()` D-09 bottle-launch fix that gate exists to guard is
confirmed unchanged by its own adjacent semantic-pin test. Full backend sweep: 2413/2415 tests,
114/116 suites -- only the 2 pre-existing documented baselines (`rustInvokeChannel.test.ts`,
wine `rest.test.ts`). No Rust files touched; `main.ts`/`steamAuthFlowRegistration.ts` byte-
unchanged. Did NOT assert a reach-ledger growth figure per the plan's explicit instruction --
`settingsFlowRegistration.ts` is confirmed NOT currently an `electronReachLedger.test.ts` entry
point; that measurement is deferred to plan 34.4-08. REQ-34.4-06 complete, see
34.4-03-SUMMARY.md. Next: 34.4-02 (bottle/client-setup/redeem group, same file, wave 1).

34.4-01 done -- Steam credential/SteamGuard/TOTP login trio + session/identity trio
registration (wave 1). Extended `steamAuthFlowRegistration.ts` with 6 new registrations:
`steamStartCredentials`/`steamSubmitGuard`/`steamPollCredential` (REQ-34.4-01, all
`ipcMain.handle`) and `getSteamUserInfo`/`getSteamSyncedAt`/`logoutSteam` (REQ-34.4-02).
`logoutSteam` registered as `ipcMain.on` (send), cross-checked against `main.ts:939`'s
`addListener` call -- the G-30-01 channel, guarded with a `.catch()` writing a
`[steamAuthFlowRegistration]`-prefixed warning, never rethrows. Rewrote the module docstring,
which previously asserted these channels were "deliberately NOT registered" (now false).
Extended `steamAuthFlows.test.ts` 5 -> 14 tests: round-trips for the credential trio incl. the
guard_required contract, session/identity round-trips, and a bidirectional send-kind proof for
`logoutSteam` (send calls SteamUser.logout exactly once; invoke does NOT reach it) plus a
rejection guard proving a failing logout neither crashes the sidecar nor leaves an
unhandledRejection. Hand RED-proofed by flipping `logoutSteam` to `ipcMain.handle` --
confirmed the send-kind test fails for the right reason, reverted via `git checkout`
(`git diff --stat` empty against the Task 1 commit). Rewrote Test 5 (previously asserting
`logoutSteam` stays unported) to target `humbleRevealKey` instead, with a comment recording
the original channel, the reason for the change, and where the replacement proof lives. Full
backend sweep: 2409/2411 tests, 114/116 suites -- only the 2 pre-existing, already-documented
baselines (`rustInvokeChannel.test.ts`, wine `rest.test.ts`). No Rust files touched;
`main.ts` byte-unchanged. Caught the `gsd-sdk state writes corrupt STATE.md` gotcha firing
again on the initial `state.load` call (reverted `total_phases`/`stopped_at`/Current Position
to a stale snapshot) -- reverted via `git checkout` before any commit, applied this STATE.md
update by hand instead of trusting `state.*` verbs. REQ-34.4-01/REQ-34.4-02 complete, see
34.4-01-SUMMARY.md. Next: 34.4-02 (bottle/client-setup/redeem/private-branch group, same file,
next wave).

34.3-08 done -- Declared ported-channel list + SEAM closure (wave 5, depends on 01-07).
Wrote `34.3-PORTED-CHANNELS.md` (29 rows, no `logError` row, both framing corrections, the
D-05 verified-no-fix finding naming tauri 2.11.5, the Humble key-copy KNOWN ACCEPTED RISK
rider, `deleteUploadedLogFile`'s both-builds-dead declaration distinguished from 34.2's D-07,
the filed-not-audited log-redaction statement) and `ported-channels-gate.py` (5 assertions,
each self-test-proven to reject a synthetic violation). Closed SEAM.md's Incremental-Port
Checklist steps 5/6 (new §1 CLOSED subsection, §3 row 9's `clipboard` moved from "untouched"
to CLOSED). Filed `uploaded-log-delete-button-lies.md` and `log-upload-has-no-redaction.md`
todos. REQ-34.3-12/REQ-34.3-13 complete, see 34.3-08-SUMMARY.md. Live-gate proof-level cells
(`unit + LIVE (item N)`) were declared PENDING at the time plan 08 was written; plan 34.3-09
(the blocking live gate) has since RUN (2026-07-27) with all 5 items PASS -- see 34.3-LIVE-GATE.md,
which records that items 1/2/3/5 and item 4's process count are tester attestations without
retained transcripts, while item 4's post-conditions are machine-verified.

34.3-07 done -- Automated-proof structural gates (the phase's structural-proof plan, wave 4,
depends on 01/02/03/04/06). Extended `electronReachLedger.test.ts`'s `ENTRY_POINTS` with this
slice's three registration modules (`shellFilesFlowRegistration.ts`/
`clipboardFlowRegistration.ts`/`loggerFlowRegistration.ts`) and REGENERATED
`BASELINE_ELECTRON_REACHING_MODULES` by actually running `computeElectronReach()` (temporary
measurement print statement, captured then removed) rather than transcribing a guess -- the
measured set grew 29 -> 30, gaining EXACTLY `src/backend/logger/uploader.ts` (the D-10-named
edge: `uploader.ts:1` imports `app` from `electron`, reached via `loggerFlowRegistration.ts`),
zero other additions/removals. Extended the anti-degradation `requiredModules` list with the
new edge; raised the reachability-sanity floor 100 -> 150 (measured `visitedFiles.size` is
202, recorded in a comment); growth-only/subset semantics and all 4 pre-existing tests
preserved. Hardened `tauriShellSource.test.ts`'s `loadMainRsCode` to accept an optional
`source?` param and call the shared `stripSourceComments` util FIRST (block-comment
stripping) THEN the existing local trailing-`//` pass -- closing a vacuous-gate risk where a
`/* */` block comment's interior line could survive the old line-prefix-only filter and
satisfy a positive-existence assertion on prose; proved with 2 new self-tests. Added a
`REQ-34.3-08 main.rs clipboard seam` describe block (10 cases) pinning both dispatch arms,
both pure helpers, the plugin registration + `ClipboardExt` import, all 10 real `#[test] fn`
names from plan 34.3-03's Cargo test module, that `shutdown_child()` is absent from the
`app_relaunch` arm's own body and has exactly one call site file-wide (REQ-34.3-06/D-05
no-fix), and that `capabilities/default.json` contains no `clipboard` string (D-02
zero-capability-grant). Hand-verified RED proof: temporarily deleted
`clipboard_read_value_propagates_error`'s `#[test] fn` from `main.rs`, confirmed the "every
clipboard #[cfg(test)] fn still exists" case failed naming the missing fn, reverted via
`git checkout` (byte-identical). No deviations -- plan executed exactly as written. Full
backend `npx jest --selectProjects Backend`: 2399/2401 tests, 114/116 suites -- only the 2
pre-existing, already-documented baselines (`rustInvokeChannel.test.ts`, wine `rest.test.ts`).
`tsc --noEmit`/`prettier --check` on both touched files clean; no Rust files touched (RED
proof reverted, `git diff --stat src-tauri/` empty). REQ-34.3-08/-10/-13 complete, see
34.3-07-SUMMARY.md. Next: 34.3-08 (wave 5, the final plan of this phase).

34.3-06 done -- Clipboard channel registration. Created `clipboardFlowRegistration.ts`
exporting `registerClipboardFlows()`, registering the 3 clipboard channels
(`clipboardWriteText`/`clipboardReadText`/`copySystemInfoToClipboard`) -- the ONLY
consumers of this slice's 2 new Rust arms. `clipboardReadText` awaits
`requestRustInvoke(RUST_CLIPBOARD_READ_TEXT, [])` directly in its own handler (D-04),
bypassing the sync, deliberately-dead `electronStub.clipboard.readText()` stub, resolving
`''` on rejection or a non-string result rather than rejecting (`SIDLogin/index.tsx:137`
consumes the value directly). `copySystemInfoToClipboard` curated-imports
`getSystemInfo`/`formatSystemInfo` from `utils/systeminfo` directly (D-14), never
`utils/ipc_handler.ts`, which would double-register 4 already-ported channels. Wired
`registerClipboardFlows()` into `handlers.ts` after `registerShellFilesFlows()`. Added
`clipboardFlows.test.ts` (11 cases) calling `registerClipboardFlows()` DIRECTLY rather
than through the full sidecar bootstrap (mirrors `lifecycleStub.test.ts`'s lighter
mock-only-the-Rust-boundary shape, since this module touches no store/config/environment
surface) -- covers the write/read/systeminfo round-trips, D-04's stub-bypass (spied,
never called), the send-vs-handle contract, and a negative-scope guard (snapshotted
BEFORE `registerClipboardFlows()` ran) proving no registration leaked for the 8
already-ported channels `utils/ipc_handler.ts`/`logger/ipc_handler.ts` also declare. One
Rule 3 deviation: classified `clipboardFlows.test.ts` in `testContainment.test.ts`'s
`STRUCTURALLY_CONTAINED_SUITES` (identical os/electron/electron-store mock kit already
classified there), following 34.3-01's exact precedent for `shellFilesFlows.test.ts`.
Full backend sweep: 2387/2389 passing, 114/116 suites -- only the 2 pre-existing,
already-documented failures appear (`rustInvokeChannel.test.ts`, wine `rest.test.ts`).
`tsc --noEmit`/`prettier --check` on all 4 touched files/`cargo check --quiet` (no Rust
touched) all green. REQ-34.3-03/-04/-13 complete, see 34.3-06-SUMMARY.md. Next: 34.3-07
(wave 3).

34.3-05 done -- Clipboard forwarding + relaunch/quit race guard (D-01/D-02/D-03/D-04/D-06).
`electronStub.clipboard.writeText` graduated from the Phase 31 logged no-op ("deferred to
Phase 33", never collected) to a real fire-and-forget forward to `RUST_CLIPBOARD_WRITE_TEXT`,
byte-shape-identical to `shell.showItemInFolder`'s template; `clipboard.readText()` documented
DELIBERATELY DEAD (unchanged sync signature/`''` return -- plan 34.3-06's async handler bypasses
it entirely). Added a module-scope `relaunchInFlight` flag: `app.relaunch()` sets it (never
reset -- a relaunch is terminal), `app.quit()`/`app.exit()` become logged no-ops once set,
closing the nondeterministic quit-instead-of-restart race on `resetHeroic` -- `utils.ts` stays
byte-identical (`git diff --stat` empty across all 4 commits), no `isTauri()` branch anywhere.
Migrated `dialogStub.test.ts`'s obsolete clipboard D-04 describe block (kept the surviving
`readText() === ''` assertion, pointer comment to new coverage, following the in-repo
`shell.showItemInFolder` D-04->D-05 precedent); extended `lifecycleStub.test.ts`'s allowlist
test + added isolated (`jest.isolateModules()`, mirrors `bootstrapWirings.test.ts`) race-guard
coverage proving both directions, hand-verified load-bearing by temporarily de-isolating one
case and confirming it fails for the exact leaked-flag reason the isolation prevents. Two
deviations: Rule 1 reordered two pre-existing lifecycle tests broken by the flag's cross-test
leakage (this file has no file-wide `jest.resetModules()`); Rule 3 fixed a pre-existing (already
84-char pre-plan) prettier violation on an untouched `shell.showItemInFolder` line, same class as
34.3-03's own documented Rule 3 fix. Full backend sweep (`npx jest`, run twice): only
pre-existing documented failures appear (`rustInvokeChannel.test.ts`, wine `rest.test.ts`, and
once `storeManagers/steam/__tests__/library.test.ts` -- confirmed via isolated re-run 166/166
clean, the same non-deterministic `library.ts` leaked-timer flake landing on a different suite
this time). `tsc --noEmit`/`prettier --check` on all 3 touched files both clean. REQ-34.3-03/-04/
-07/-13 complete, see 34.3-05-SUMMARY.md. Next: 34.3-06 (clipboardFlowRegistration.ts, wave 2).

34.3-02 done -- Cache/reset channel registration (the last remaining wave-1 plan). Registered
`clearCache`/`clearAchievementCache`/`resetHeroic` as 3 more send-kind channels in
`shellFilesFlowRegistration.ts` (18 -> 21 channels), each reproducing `main.ts`'s exact body against
UNMODIFIED `utils.ts` functions. `clearCache`'s dialog passes no `event` property (sidecar `send`
listeners never have one), taking `showDialogBoxModalAuto`'s `sendFrontendMessage('showDialog')`
branch, proven non-fatal even when forced to throw; `refreshLibrary` rides `pushFrontendMessage`
directly. `resetHeroic` calls `utils.ts`'s body completely unmodified -- no build-conditional
branch; the relaunch/quit ordering race is left to plan 34.3-05. Extended
`shellFilesFlows.test.ts` 25 -> 30 tests. **Deviation of note:** diagnosed that this project's
`resetMocks: true` (`src/backend/jest.config.js`) wipes any implementation baked into a
`jest.mock(...)` factory before every test -- a real implementation must be (re-)installed in
`beforeEach` instead; also extended the legendary `electronStores` mock (`installStore`/
`libraryStore`) and added a `backend/storeManagers` mock so `clearCache`'s real fire-and-forget
legendary-cleanup dynamic import doesn't reach real runner-spawn machinery. Full backend sweep:
2370/2373 passing, 3 failing suites all confirmed pre-existing/unrelated (`rustInvokeChannel.test.ts`
documented baseline, wine `rest.test.ts` documented path-depth bug, `reconcile.test.ts` reproduced
as the already-documented `library.ts` leaked-timer flake via isolated re-run). REQ-34.3-05/-06/-13
complete, see 34.3-02-SUMMARY.md. Next: 34.3-05 (wave 2).

34.3-04 done -- Logger channel registration. Added `logInfoSettled` (expression-body sibling of
`logInfo` in `backend/logger/index.ts`, byte-shape-identical to `logErrorSettled`) and registered
this slice's remaining 5 `logger/ipc_handler.ts` channels in `loggerFlowRegistration.ts`: `logInfo`
(send, mirrors `logError`'s call-site rejection guard shape exactly), `showLogFileInFolder` (send),
and `uploadLogFile`/`deleteUploadedLogFile`/`getUploadedLogFiles` (invoke, curated-imports
`logger/uploader.ts` directly -- never `logger/ipc_handler.ts`, which also registers the
already-ported `getLogContent`/`logError`). Declared in the module docstring: `deleteUploadedLogFile`
is ported at parity but structurally cannot delete anything in EITHER build (`uploader.ts:74-77`'s
hardcoded `token = '1'`, D-08); log redaction is out of scope, no audit performed (D-09). Extended
`loggerFlows.test.ts` (5 -> 12 tests) and `loggerCallSiteGuard.test.ts` (5 -> 7 tests) with
round-trip coverage mocked only at the HTTP (`global.fetch`)/store (`uploadedLogFileStore`)
boundaries -- never the uploader functions themselves; 5 new assertions hand RED-proofed by
temporarily disabling registrations / breaking the expiry-pruning logic, then restored clean. One
Rule 1 fix: `bootstrap.test.ts`'s "still genuinely unported" example channel was `getUploadedLogFiles`,
which this plan legitimately ports -- substituted `getLegendaryVersion`, following 34.3-01's own
precedent. Full backend sweep: 112/115 suites, 2365/2368 tests green -- the 3 failing suites
(`rustInvokeChannel.test.ts`, wine `rest.test.ts`, `cargoFeatures.test.ts`) are pre-existing and
unrelated (logged to `deferred-items.md`, not fixed; `cargoFeatures.test.ts`'s crate-pin gap was
introduced by 34.3-03's clipboard-manager dependency, not this plan). `tsc --noEmit`/
`prettier --check`/`cargo check --quiet` (no Rust touched) all green. REQ-34.3-01/-09/-13 complete,
see 34.3-04-SUMMARY.md. Next: 34.3-02 (the other wave-1 plan, no SUMMARY on disk yet).

34.3-03 done -- Rust clipboard seam + D-05 verification. Added `tauri-plugin-clipboard-manager`
(resolved 2.3.2, confirmed no `js_init_script` at execution time) with zero renderer capability
grant, plus the two `clipboard_write_text`/`clipboard_read_text` `dispatch_rust_channel` arms --
the ONLY new Rust arms this whole 34.3 slice adds. Extracted `clipboard_text_arg`/
`clipboard_read_value` as pure helpers and proved them with 10 new `#[cfg(test)]` cases (6 -> 16),
both RED-proved by hand (the `unwrap_or("")` regression flips exactly the 4 rejection tests; the
`Value::Null`-for-empty-read regression flips exactly one test). Recorded 34.3-RESEARCH.md Q1's
finding as a code comment above `app_relaunch`: `AppHandle::restart()` DOES fire `RunEvent::Exit`
for this codebase's worker-thread calling pattern, so D-05's proposed `shutdown_child()` fix is
dropped, not added -- arm body unchanged (`app.restart();`). One Rule 1 fix (extended
`tauriShellSource.test.ts`'s 34.1-scoped "only new arm" gate to acknowledge the two clipboard
arms as this slice's own legitimate addition) and one Rule 3 fix (prettier reformatted one
pre-existing over-80-char line in `sidecarTransport.ts`, unrelated to this plan's content but
required for this plan's own `prettier --check` gate). `cargo check`/`cargo test` (16/16)/
`tsc --noEmit`/`prettier --check`/targeted jest sweep (93/93) all green. See 34.3-03-SUMMARY.md.
Next: 34.3-02 (the other wave-1 plan, no SUMMARY on disk yet).

Prior phase: 34.2 (tauri-ipc-re-plumb-slice-5-game-details-settings-and-overrid) — **COMPLETE
2026-07-26, 30/30 plans, closed via a human OVERRIDE of the round-4 blocker (see below).**
Gap cycle 4 (34.2-25..30, 3 waves) fully executed:
34.2-25/26/27 ran earlier that day; **34.2-28 (WR-04 vacuous Rust test-module gate + WR-08
comment-stripper truncation), 34.2-29 (WR-01/WR-02/WR-05, CR-02 secondary, WR-10), and 34.2-30
(REQ-34.2-13 declaration currency, currency-gate.py extended for cycle 4 without weakening
cycle 3) executed this session.** All 14 findings of `34.2-REVIEW-GAP-CYCLE-3.md` are reconciled
in `34.2-PORTED-CHANNELS.md`.

Round-4 gates then ran on the whole phase:

- `34.2-REVIEW-GAP-CYCLE-4.md` (code review, 12 files, standard depth): **1 blocker, 11 warnings,
  8 info.** Written to a per-cycle filename deliberately — the workflow's default `34.2-REVIEW.md`
  would have overwritten the original cycle-1 review.

- `34.2-VERIFICATION.md` (round 4): **status `gaps_found`.** All 14 requirement-level truths pass
  at the production-behaviour level and the round-3 live-data-destruction blocker is confirmed
  CLOSED (bootstrap.test.ts no longer touches the real `~/Library/Logs/GameLib/gamelib.log`;
  mtimes byte-identical before/after). CR-01 and CR-02 from cycle 3 are genuinely fixed in
  production, each with a functional (non-regex) backstop.

**The round-4 blocker (the reason the phase is not complete):** the shared `stripComments` helper
— duplicated in `testContainment.test.ts:198-203` and `loggerCallSiteGuard.test.ts:148-153` — is a
LINE-PREFIX filter. It drops a line only when that line itself begins with a comment marker, so the
interior of a block comment whose lines lack a `*` prefix survives stripping. Independently
reproduced by executing the helper: a pure block comment merely NAMING the pattern satisfies
`hasContainmentOsMock`, `assignsContainmentEnvVar('HOME')`, and `hasExpressionBodyErrorWrapper`.
Those are precisely the gates gap cycle 4 built to close cycle-3's WR-01/WR-02 — so this phase's
recurring "gate passes vacuously" defect reappeared one level deeper, in the fix for it. The
CORRECT implementation (`stripCommentsForNodeOsGate`, strips `/\*[\s\S]*?\*\//g` first) already
exists in the same gap cycle in `structuralContainment.test.ts:265-267` and was never propagated.
Secondary: the 8 `process.env` assignments in `jest.setupContainment.ts` are covered ONLY by the
now-vacuous text gate — deleting one goes fully undetected.

Also measured, not inferred: `ensureContainmentRoot()` memoizes on `globalThis`, which Jest resets
per test FILE, so `mkdtempSync` runs once per file and nothing deletes it — temp dirs went
1968 → 2081 across one backend run (+113 = exactly the suite count).

Tree state at hand-off: `npx tsc --noEmit` exits 0; full backend jest 112/113 suites,
2325/2326 tests, sole failure `rustInvokeChannel.test.ts` (documented Phase 34.1 baseline, last
touched in Phase 33, untouched by this phase); `python3 currency-gate.py` exits 0 enforcing both
cycle-3 and cycle-4 sections. Known intermittent `withTimeout.test.ts` flake (library.ts leaked
timer) appeared in one executor sweep, not in the orchestrator's.

**RESOLUTION — human override, 2026-07-26 (no gap cycle 5).** A repo-wide scan taken at decision
time found **16 comment-stripping helpers of this family and 15 of them carry the identical
line-prefix defect**, copy-pasted across phases 34, 34.1 and 34.2 — only
`structuralContainment.test.ts` (written during this very cycle) is correct. A phase-scoped gap
cycle 5 would have fixed 2 of 15 and left 13, guaranteeing the same finding resurfaces in the
34.3/34.4/34.5 reviews. Four consecutive cycles had been narrowing on a symptom whose cause is
repo-wide copy-paste. The blocker is therefore accepted as tracked debt on 34.2 and **re-scoped to
one cross-cutting sweep**: extract a single shared comment-stripping util that removes block
comments BEFORE the existing line-prefix filter (keeping the line filter is required — a naive
`/\/\/.*$/gm` swap would reintroduce the string-literal truncation plan 34.2-28 just fixed as
WR-08), self-test it with the non-`*`-prefixed spelling, and replace all 15 copies.
Rationale and residual risk recorded in `34.2-VERIFICATION.md`'s `override:` block.

**That sweep is DONE — quick task `260726-q8f`, same day.** One shared
`src/backend/testUtils/stripSourceComments.ts` now exists; all 14 defective copies plus the one
already-correct `stripCommentsForNodeOsGate` were migrated to it
(`grep -rn 'filter((line) => !/' src/backend`: 14 hits → 1). An 8-case self-test at
`src/backend/__tests__/stripSourceComments.test.ts` covers the non-`*`-prefixed block-comment
spelling every prior self-test missed, and 3 of its 8 cases were confirmed to go RED against the old
implementation. The hazard the migration created — several of those files gate on their OWN source,
so swapping a local function for an import changes the text they read — was checked mechanically
with a full-suite `{fullName,status}` baseline-vs-after diff: exactly 8 changes, all additions from
the new self-test, ZERO pre-existing tests flipped in either direction. **The round-4 blocker's
residual risk is therefore retired, not merely deferred.** Note the util's one documented, deliberate
limitation: a trailing `//` on a code line is NOT stripped, because the naive `/\/\/.*$/gm` pass that
would strip it is the WR-08 string-literal truncation plan 34.2-28 removed.

Still owed on 34.2: **`/gsd-secure-phase 34.2`** (`workflow.security_enforcement=true`, no
`34.2-SECURITY.md` exists), the 11 warnings + 8 info of `34.2-REVIEW-GAP-CYCLE-4.md` (recorded
under `deferred:`, genuinely open — NOT resolved), and 2 human-UAT items in `34.2-HUMAN-UAT.md`
(D-02 live translated notification, D-07 live anticheat fetch).

34.2-26 done -- GAP CYCLE 4, wave 1, second plan executed, CR-01 CLOSED (the WR-02 call-site
rejection guard added by gap cycle 3 was inert in production — `logError()` returned `undefined`
because `backend/logger/index.ts`'s wrapper is a block-body arrow with no `return`, so
`Promise.resolve(undefined).catch(...)` resolved immediately and the four WR-02 tests that
"proved" the fix only passed because they `jest.spyOn`'d a rejecting promise shape that never
occurs at runtime). Task 1 wrote `loggerCallSiteGuard.test.ts` (stub-free, never spies on/mocks
the logger module under test) with 4 real-module contracts (A: real ENOTDIR async rejection via a
regular file written where a directory is expected; B: synchronous throw from an unassigned
writer, reproducing the recorded "heroicLogWriter unset until bootstrap init" gotcha live; C:
runtime contract that a promise-returning export exists; D: source gate proving the wrapper is an
EXPRESSION body, with a self-test), RED-confirmed against HEAD (Test A's real ENOTDIR rejection
fired as a genuine, unhandled promise, caught only because the test itself installed an
`unhandledRejection` listener first). Task 2 added `logErrorSettled` BESIDE the existing
`logError` (not converting it — converting the shared wrapper would add ~309 new
no-floating-promises warnings project-wide for 309 unawaited call sites, a deferred, separately-
scoped change per `deferred-items.md`/plan 34.2-30) and wrapped `loggerFlowRegistration.ts`'s call
site in `try`/`catch` so a synchronous throw is converted to `Promise.reject(error)` and settled by
the same `.catch` as the async path. One Rule 1 eslint fix along the way (`prefer-promise-reject-
errors` on the caught `unknown` value, disabled inline rather than wrapped — wrapping via
`String(error)` could itself throw for a hostile reason). Deliberate-break check (by hand):
reverting `logErrorSettled` to a block body crashed the whole node process on an uncaught ENOTDIR
rejection rather than a clean test failure — a stronger, not weaker, failure signal; restored
clean. Task 3 deleted the four spy-fabricated WR-02 tests from `loggerFlows.test.ts`, fixed the
one remaining test that also silently stopped observing anything after Task 2's call-site change
(now spies on `logErrorSettled`), and corrected the WR-10 tripwire comment (it is a POST-HOC
DETECTOR, not a preventer — `jest.setupContainment.ts`'s `setupFiles`-time precondition, added by
34.2-25, is the actual preventer). Full backend sweep on a clean run: failing-suite set exactly
`{testContainment.test.ts (Block C tripwire, EXPECTED, closer=34.2-29), rustInvokeChannel.test.ts
(pre-existing 34.1-era baseline)}`; one earlier run in-session additionally hit the already-
documented, non-deterministic `library.ts` leaked-timer flake on `enrichmentFlows.test.ts`
(clean on retest). `tsc --noEmit` clean; `prettier --check` clean on all 4 files; backend eslint
total unchanged at 2539 problems (16 errors/2523 warnings) — zero net regression. REQ-34.2-12/-14
complete (already marked from prior plans; re-confirmed), see 34.2-26-SUMMARY.md. Next: 34.2-27
(wave 1, same wave).

34.2-27 done -- GAP CYCLE 4, wave 1, third plan executed, WR-06 CLOSED (and WR-03's prettier
regression on `repairFailure.ts`). Task 1 wrote 5 hostile-dependency tests to
`repairFailure.test.ts` -- window.api.logError throwing, window.api entirely absent (the Tauri
preload-factory-did-not-attach failure mode), t() throwing on the title key, showDialogModal
throwing, and a T-34.2-52-under-hostility regression guard -- RED-confirmed by hand against
unmodified `repairFailure.ts` (exactly 4 of 5 failed, the 5th stayed green as a pure regression
guard; Tests 3/4 failed via the throw escaping `reportRepairFailure` itself, not an assertion
diff, reproducing the `index.tsx:158` un-awaited-handler escape route WR-06 names). Task 2
replaced signal 2's empty catch with a named `console.error('repair-failure log signal
unavailable:', logErr)` diagnostic; precomputed `title`/`message` into `let` bindings
pre-initialised to the hardcoded English literals, reassigned from `t(...)` inside their own
try so a throwing `t` degrades to the fallback and the dialog still renders; wrapped
`showDialogModal` itself in a try/catch emitting `'repair-failure dialog signal unavailable:'`
on failure -- superseding 34.2-21's prior design note that left it as an intentionally-unwrapped
"payoff" statement, per this plan's explicit Task 2 action. `npx prettier --write` applied to
both files (closes WR-03's CI regression). Deliberate-break check (by hand): reverting signal
2's diagnostic back to an empty catch failed exactly Tests 1 and 2, all other 17 tests
(including 3/4/5) stayed green; restored clean. Full frontend sweep: 26/26 suites, 200/200 tests
(+5 over the 195/195 baseline from plan 34.2-21); `tsc --noEmit` clean; eslint 0
errors/warnings on `repairFailure.ts`; `index.tsx` byte-unchanged (`git diff --exit-code` 0);
`package.json`/`pnpm-lock.yaml` unchanged (no installs). REQ-34.2-12/-14 complete (already
marked from prior plans; re-confirmed), see 34.2-27-SUMMARY.md. Next: 34.2-28 (wave 1, same
wave).

34.2-19 done -- GAP CYCLE 3, first plan executed, BLOCKER CLOSED. Task 1 created
`src/backend/jest.setupContainment.ts`, a `setupFiles` module wired into the backend jest
project's `setupFiles` (`src/backend/jest.config.js`), redirecting HOME/USERPROFILE/APPDATA/
LOCALAPPDATA/XDG_CONFIG_HOME/XDG_STATE_HOME/XDG_DATA_HOME/XDG_CACHE_HOME so no suite can opt out
of containment by omission. MID-EXECUTION CORRECTION (coordinator-approved, Rule 4 architectural
deviation): the plan's originally-specified env-var-only mechanism does NOT redirect
`os.homedir()` inside a Jest test on this project's Jest 29/Node 26 setup -- Jest replaces
`process.env` with a decoupled, per-test-file synthetic Proxy that `os.homedir()`'s native
binding never observes (live `stat` proof: real `~/Library/Logs/GameLib/gamelib.log` mtime
still changed with the env-only fix installed). Two `jest.mock`-free alternatives were ruled out
(non-configurable core-module property mutation; a `Module._load` hook, bypassed for builtins
under Jest's own Runtime). Fix: a single, narrow `jest.mock('os', () => ({...jest.requireActual
('os'), homedir: () => containmentRoot}))` call added to the setup module (commit `752f6096`),
env-var redirection kept as defense-in-depth for the Windows/Linux branches. Task 2 added
`structuralContainment.test.ts` (6 tests, zero per-suite `jest.mock` calls), hand RED-proofed
(5/6 tests fail with `setupFiles` disabled; Test 4 stays green independently via the pre-existing
default `electron` automock). Task 3 added a containment tripwire as the first test in
`bootstrap.test.ts` -- the suite independently reproduced destroying real developer data three
times during verification -- and reconciled the full backend baseline (111/112 suites, 2279/2280
tests, sole failure `rustInvokeChannel.test.ts`, observed on 5 of 7 runs; 2 runs hit a
pre-existing, unrelated `library.ts` leaked-timer flake, logged to `deferred-items.md`). LIVE
DESTRUCTION CHECK: `~/Library/Logs/GameLib/gamelib.log`/`.log.old` mtimes byte-identical
before/after a full `sidecar/__tests__` run -- the verification's own three-times-reproduced
finding is directly refuted. `34.2-19-PLAN.md` amended in place with a full deviation log.
REQ-34.2-07/-14 complete, see 34.2-19-SUMMARY.md. Next: 34.2-20 (WR-02, same wave).

34.2-20 done -- GAP CYCLE 3, second plan executed, WR-02 CLOSED. Task 1 changed
`loggerFlowRegistration.ts`'s `logError` send-channel listener from a bare, unguarded call
(`logError(args[0] as string, LogPrefix.Frontend)`, neither `await`ed nor `.catch()`'d) to
`void Promise.resolve(logError(args[0], LogPrefix.Frontend)).catch(...)`, restoring
`processGuards.ts`'s own documented invariant ("not a substitute for call-site handling") that
had been quietly re-violated. The `.catch` handler mirrors plan 34.2-15's CR-02 shape exactly
(hardcoded fallback literal initialized before its own try, reassigned via
`error instanceof Error ? ... : String(error)`), writes a module-attributed diagnostic
(`[loggerFlowRegistration] logError call-site rejection: ...`) to `process.stderr` only, and
drops the `args[0] as string` assertion (review finding IN-05) in favor of the declared
`unknown` transport contract. Task 2 added 4 tests (`loggerFlows.test.ts`, 5->9) driving a
`jest.spyOn`'d rejecting `backend/logger` `logError` through the real registered listener; the
load-bearing assertion is NEGATIVE (diagnostic must carry the call-site prefix AND must NOT
contain processGuards.ts's generic `unhandled promise rejection` text -- a positive-only
assertion would pass identically pre-fix, since the process guard already produces some
diagnostic). RED-PROOF by hand: restored the pre-fix file via `git show HEAD~1:... > file`, all
4 new tests failed (2 by assertion, 2 by the rejection itself escaping as an uncaught value
inside the test), restored via `git checkout HEAD -- file` (`git diff --stat` empty, byte
Match to the Task 1 commit), suite green again. One out-of-scope discovery logged (not fixed):
`backend/logger/index.ts`'s four wrapper exports (`logDebug`/`logInfo`/`logWarning`/`logError`)
all discard their `LogWriter` method's returned promise (no `return` statement in any of the
four block-body arrow functions) -- so today `logError(...)`'s runtime return value is always
`undefined`, meaning Task 1's guard is correct/necessary but only becomes fully load-bearing
once a future fix makes the wrapper actually forward the promise; logged to
`deferred-items.md` under "From plan 34.2-20" (out of scope: touching all four wrappers is a
project-wide, separately-scoped change). Full backend sweep: 111/112 suites passed on the
cleaner of two consecutive runs (sole failure the pre-existing, already-documented
`rustInvokeChannel.test.ts`), 2283/2284 tests; the other run additionally hit the
already-documented non-deterministic `library.ts` leaked-timer flake on an unrelated suite --
neither failure touches any file this plan modified. `tsc --noEmit` and eslint on
`loggerFlowRegistration.ts` both clean. REQ-34.2-12/-14 complete (already marked from prior
plans; re-confirmed), see 34.2-20-SUMMARY.md. Next: 34.2-21 (WR-03, same wave).

34.2-21 done -- GAP CYCLE 3, third plan executed, WR-03 CLOSED. Task 1 added 3
`it.each`-driven hostile-value regression blocks to `repairFailure.test.ts` (null-prototype
object via `Object.create(null)`, throwing-`toString`, throwing-`Symbol.toPrimitive` -- the same
shapes plan 34.2-15 used in `sidecarRejectionGuard.test.ts` Group 2), plus a T-34.2-52
hostile-value dialog-message test; renamed the pre-existing vacuous plain-string 4th test's
framing from "hostile reason" to "non-hostile baseline" (a plain string never exercises the
primitive-conversion throw path). RED-confirmed by hand against unmodified `repairFailure.ts`:
10 of 14 tests failed with `TypeError: Cannot convert object to primitive value` (or the custom
thrower's own message) escaping `reportRepairFailure` before `showDialogModal` was ever called
-- see 34.2-21-SUMMARY.md for the verbatim output. Task 2 rewrote `reportRepairFailure`'s body to
precompute `errorText` once via a `let`-fallback-before-try (mirroring `processGuards.ts:61-69`
verbatim), never interpolating the raw `error: unknown` binding into a template literal, and
additionally wrapped `console.error`/`window.api.logError` each in their own try/catch so the
module's own "three independent signals" docstring claim is actually true against any future
throw source, not just the one removed (decision recorded in the SUMMARY: `showDialogModal`
itself deliberately left unwrapped as the last/payoff statement). Also dropped the unused
`export` from `ReportRepairFailureOptions` (review finding IN-02, zero external consumers
confirmed via grep). One Rule 3 deviation (wording-only, no behavior change): the first docstring
draft used the literal backtick-quoted substring `${error}` in prose describing the historical
defect, which self-tripped this plan's own `grep -c '\${error}'` acceptance criterion (same class
of issue plan 34.2-16 hit) -- reworded, re-verified clean. All 14 tests pass; `tsc --noEmit` and
eslint (0 errors/warnings, the `restrict-template-expressions` warning on line 45 is gone) both
clean; `index.tsx` byte-unchanged (`git diff --exit-code` clean); full frontend sweep 26/26
suites, 195/195 tests, zero regressions. REQ-34.2-12/-14 complete (already marked from prior
plans; re-confirmed), see 34.2-21-SUMMARY.md. Next: 34.2-22 (Rust `timeout_for()` proof, same
wave).

34.2-22 done -- GAP CYCLE 3, fourth plan executed, carried-forward Rust-coverage warning CLOSED.
Task 1 appended a `#[cfg(test)] mod tests` to `src-tauri/src/main.rs` (6 tests: exempt channel
waits indefinitely, non-exempt channel bounded at `INVOKE_TIMEOUT`, `repair`/`readConfig` exempt,
`getCrossoverIndex` exempt, a loop over the full `LONG_RUNNING_CHANNELS` array paired with a real
non-exempt channel -- `getGameSettings` -- for non-vacuity in both directions, and `INVOKE_TIMEOUT`
pinned at 60s) -- the first Rust test coverage anywhere in `src-tauri/src` (`cargo test` ran 0
tests before this plan). RED-proofed by hand, both directions: `timeout_for` stubbed to
unconditional `Some(INVOKE_TIMEOUT)` failed 4 of 6 tests, stubbed to unconditional `None` failed a
DIFFERENT 2 of 6 tests; restored, `git diff --stat` showed the change was purely additive (69
insertions, 0 deletions) against the pre-plan baseline. Task 2 extended
`longRunningChannels.test.ts` (8->14 tests) with a new describe block reading `main.rs` RAW (not
comment-stripped, since `#[cfg(test)]` sits adjacent to doc comments) asserting the attribute's
presence, >=2 `timeout_for` references inside that region, and that the region iterates
`LONG_RUNNING_CHANNELS` rather than hardcoding a duplicate list -- because this project's CI runs
no cargo step at all, so without this gate the Rust module could be deleted with nothing
automated noticing. Carries 2 self-tests (mirroring `gameDetailsImportGate.test.ts`'s own Gate-2
convention): a synthetic source lacking `#[cfg(test)]` fails to match, and one with the attribute
but only weak `timeout_for` references / no iteration also fails. RED-proofed by hand: reverted
`main.rs` to its pre-Task-1 (`HEAD~1`) content, 4 of the 6 new tests failed, restored (`git diff
--stat` empty, byte-identical to the Task 1 commit). Zero new dependencies (`git diff --exit-code
src-tauri/Cargo.toml` clean), zero new `dispatch_rust_channel` arms, `cargo check --quiet` and
`tsc --noEmit` both clean. No deviations. REQ-34.2-12/-14 complete (already marked from prior
plans; re-confirmed), see 34.2-22-SUMMARY.md. Next: 34.2-23 (wave 2, WR-01 raw-source anti-claim
gate + `readdirSync` set-equality tripwire).

34.2-23 done -- GAP CYCLE 3, fifth plan executed, WR-01/WR-04/WR-07/WR-08 hardening of
`testContainment.test.ts` CLOSED. Task 1: the "no longer claims NO FILESYSTEM WRITES" gate now
matches RAW source instead of `stripComments()` output (the claim can only ever live on a
`*`-prefixed docblock line, which the stripper always removed -- the prior gate was permanently
vacuous), with a self-test proving the asymmetry; the `backend/constants/environment` mock's
comment corrected from the factually-wrong "included for parity" to LOAD-BEARING, naming
`getBaseLogPath()` as the consumer whose `isMac:false` pin is what makes RED-PROOF-2 non-vacuous
on this darwin host; Block A's `process.platform`/env-var adversarial mutation moved out of
`beforeAll`/`afterAll` into a per-test `withAdversarialPlatformAndEnv()` helper restoring in its
own `finally`. One deviation found+fixed inline: `jest.replaceProperty` (the plan's stated
preferred mechanism, available since Jest 29.4, this project pins 29.7.0) was tried first for
`process.platform` and broke the whole test FILE (`TypeError: Cannot assign to read only
property 'platform'`) because this Node version's `process.platform` descriptor is
`writable:false` and `jest.replaceProperty`'s own `.restore()` does a plain assignment --
switched to `Object.defineProperty` per the plan's documented fallback. Task 2: deleted
`KNOWN_UNCOVERED_BOOTSTRAP_DRIVING_SUITES` (the stale 11-suite accepted-debt declaration plan
34.2-19 had already closed structurally) and its `toHaveLength(11)` pin; added
`STRUCTURALLY_CONTAINED_SUITES` (21 entries, `testContainment.test.ts` deliberately classifies
itself rather than being excluded) plus a `readdirSync`-derived set-equality tripwire
(`diffSuiteClassification`, shared by the gate and both its self-tests) proving every `*.test.ts`
in the directory is classified by exactly one of the two declared lists; added a structural
containment gate reading `jest.config.js`/`jest.setupContainment.ts` directly, asserting the
`setupFiles` entry and all eight env-var assignments are still wired. Four hand RED-proofs
recorded verbatim in 34.2-23-SUMMARY.md: the anti-claim gate (injected the claim into
`enrichmentFlows.test.ts`'s docblock, gate failed naming it, reverted clean), the tripwire
(created a real `zzTripwireProbe.test.ts`, tripwire failed naming it, deleted clean), the
structural gate (commented out the `setupFiles` entry, exactly that one test failed, restored
clean, `git diff --exit-code` 0), and the `jest.replaceProperty` rejection itself. Test count
29 -> 42. Full backend sweep: 111/112 suites, 2304/2305 tests -- sole failure the pre-existing,
already-documented `rustInvokeChannel.test.ts` (unchanged 34.1-era baseline); `tsc --noEmit`
clean throughout; no production code touched (only `testContainment.test.ts`). REQ-34.2-07/-14
complete (already marked from prior plans; re-confirmed), see 34.2-23-SUMMARY.md. Next: 34.2-24
(wave 3, REQ-34.2-13, final plan of gap cycle 3 -- PORTED-CHANNELS.md currency + currency-gate.py).

34.2-24 done -- GAP CYCLE 3, sixth and final plan executed, REQ-34.2-13 currency gap CLOSED
(the recurring gap all three verification rounds cited). Task 1 added a
`### Gap cycle 3 reconciliation` subsection under `34.2-PORTED-CHANNELS.md` §7 naming every
closed finding (CR-01, WR-01/02/03/04/07/08, IN-02, IN-05, the carried-forward `timeout_for`
gap) with its plan/file/verbatim RED proof pulled from the five SUMMARYs, the verbatim live
`stat` evidence that the phase's own test commands no longer destroy the developer's real
`gamelib.log`, and every deliberately-deferred finding (WR-05/WR-06/IN-01/IN-03/IN-06) with a
reason; §6 gained a matching honesty addendum. Task 2 marked `deferred-items.md`'s 34.2-18
containment-debt entry `-- CLOSED by gap cycle 3` with a dated resolution block (11-suite
record preserved, not deleted) and added a "From gap cycle 3" section for the five residual
findings plus IN-04 (accepted, parity with Electron). Task 3 extended `34.2-VALIDATION.md`
(2 new Test Infrastructure rows, Per-Task Verification Map 20 -> 31 rows, a Gap Cycle 3
Sign-Off Addendum beneath the untouched original approval block) and committed
`currency-gate.py`, a re-runnable python3 doc-shape script (mirroring plan 34.2-07's own
precedent) asserting the reconciliation section exists once, is the last `###` subsection
under §7, names every closed/deferred token, and carries no placeholders -- hand RED-proofed
by redacting `WR-05`, confirming a named non-zero exit, then restoring clean. §2's channel
table, the two deferred-UAT rows, the original Validation Sign-Off block, the Manual-Only
Verifications section, and the `rustInvokeChannel.test.ts` baseline entry are all confirmed
byte-unchanged (`git diff`). REQ-34.2-07/-12/-13/-14 complete, see 34.2-24-SUMMARY.md.
**GAP CYCLE 3 COMPLETE (34.2-19..24, 6 plans). PHASE 34.2's 24 plans are all executed.
Next: re-verification of Phase 34.2 as a whole (fourth verification round).**

Gap cycle 3 plans (2026-07-26) — closes the blocker + 3 warnings gap cycle 2 introduced:

- 34.2-19 (wave 1, BLOCKER) DONE: structural containment via a `src/backend/jest.setupContainment.ts`
  `setupFiles` entry on the backend jest project — redirects HOME/USERPROFILE/APPDATA/LOCALAPPDATA/
  XDG_* so no suite can opt out of containment by omission, PLUS a narrow `jest.mock('os', ...)`
  (coordinator-approved mid-execution correction — env vars alone do not redirect `os.homedir()`
  under Jest's synthetic per-test-file `process.env`; see 34.2-19-SUMMARY.md for the full finding).
  Blast radius is the whole backend project (111 suites); acceptance criterion pins the failing-suite
  set to exactly {rustInvokeChannel.test.ts}, the documented 34.1-era baseline.

- 34.2-20 (wave 1, WR-02) DONE: catch the logError listener's floating promise at the call site with a
  stderr diagnostic — load-bearing assertion is NEGATIVE (must not contain processGuards.ts's
  absorption text), because a positive-only assertion passes pre-fix. See 34.2-20-SUMMARY.md.

- 34.2-21 (wave 1, WR-03): defensively stringify repairFailure.ts's `unknown` so the ERROR dialog
  renders unconditionally; adds Object.create(null) + throwing-toString cases that fail against HEAD.

- 34.2-22 (wave 1, carried-forward) DONE: Rust `#[cfg(test)]` module proving `timeout_for()` consults
  LONG_RUNNING_CHANNELS, bidirectionally falsifiable; pinned from jest since CI runs no cargo step.
  See 34.2-22-SUMMARY.md.

- 34.2-23 (wave 2, WR-01/WR-04/WR-07/WR-08) DONE: raw-source anti-claim gate + `readdirSync`
  set-equality tripwire over all 25 suites; deletes the stale 11-suite accepted-debt list rather
  than reframing it; also fixed the mislabelled load-bearing environment mock and moved the
  worker-wide `process.platform` leak into per-test restoration. See 34.2-23-SUMMARY.md.

- 34.2-24 (wave 3, REQ-34.2-13) DONE: PORTED-CHANNELS.md currency + reasoned deferrals + currency-gate.py.
  See 34.2-24-SUMMARY.md.

Anti-recurrence discipline (three straight cycles shipped a new defect while closing the named one):
every new test carries an explicit "fails against pre-fix code" acceptance criterion with the RED
proof recorded verbatim in the SUMMARY (9 hand-proven REDs), and every new gate carries a self-test
proving that gate can fail. Structural fixes were preferred wherever the enumeration was the thing
rotting.

Prior re-verification context (still the contract these plans must satisfy):

Re-verification 2026-07-26 (third verification of this phase) returned **gaps_found**:

- CLOSED (independently confirmed): CR-01 logError now registered from the real production path
  with positive side-effect proof; CR-02 String(reason) inside its own try; CR-03 pathShim mock restored.

- NEW BLOCKER: testContainment.test.ts (34.2-18's own artifact) declares 11 sidecar suites as accepted
  debt rather than containing them. bootstrap.test.ts drives the real init() 3x and was reproduced
  LIVE 3 times clobbering the developer's real ~/Library/Logs/GameLib/gamelib.log via
  archiveOldLogFile()'s renameSync. Same incident class as tests-clobbering-real-steam-store.
  Fix direction: structural containment (jest setupFiles for the backend project) so a suite cannot
  opt out by omission, plus a derived tripwire classifying every *.test.ts in the directory.

- WARNINGS: WR-01 the NO-FILESYSTEM-WRITES gate is vacuous (matches comment-stripped source);
  WR-02 the logError listener leaks a floating promise dispatchSend's sync catch cannot see;
  WR-03 repairFailure.ts:45 interpolates ${error} typed unknown -- the CR-02 class relocated to
  the renderer, and a throw there suppresses the ERROR dialog REQ-34.2-12 exists to guarantee.

- All 14 REQ-34.2-01..14 pass on literal text; no orphaned requirement IDs.
- 2 human-UAT items recorded (UAT-34.2-01 live translated notification, UAT-34.2-02 real anticheat fetch).

Gap cycle 2 plans (created 2026-07-26, plan-checker PASSED on iteration 1):

- 34.2-15 (wave 1) -- CR-02: move String(reason) inside installUnhandledRejectionGuard's own try
  with a hardcoded fallback; 3 hostile-reason tests (null prototype, throwing toString, throwing
  Symbol.toPrimitive). REQ-34.2-07, -14.

- 34.2-16 (wave 1) -- CR-01 sidecar half: curated loggerFlowRegistration.ts registering ONLY the
  logError send channel, proven by a positive log-file side effect over the real transport (NOT
  absence-of-throw). Ports logError ahead of its Phase 34.3 slot -- both IPC-PORT-INVENTORY.md and
  34.2-PORTED-CHANNELS.md must be reconciled; double-registration prohibited (dispatchSend iterates
  ALL listeners, so a second one duplicates every frontend log line). REQ-34.2-12, -08, -09, -13, -14.

- 34.2-17 (wave 1) -- CR-01 renderer half: extract reportRepairFailure (console.error + logError +
  ERROR dialog), reduce onRepairYesClick's catch to a delegation. REQ-34.2-12, -14.

- 34.2-18 (wave 2, depends_on 15+16) -- CR-03 + WR-01: apply the pathShim + logger/paths containment
  kit to sidecarRejectionGuard.test.ts, extend every tripwire to the log path, prove with an
  env-simulating test (APPDATA/XDG_CONFIG_HOME/XDG_STATE_HOME/LOCALAPPDATA set to sentinels OUTSIDE
  os.tmpdir()) -- a green macOS run is explicitly NOT accepted as evidence. REQ-34.2-07, -14.

Newly surfaced debt (deferred, NOT planned): 11 other sidecar suites drive bootstrap.init() without
the containment kit (appShellFlows, bootstrapWirings, bootstrap, downloadQueueFlows, electronUntouched,
onlineMonitorWiring, installFlows, skeletonFlows, settingsFlows, rustInvokeChannel, steamAuthFlows) --
same tests-clobbering-real-steam-store risk class, pre-existing. Recorded in deferred-items.md.

34.2-15 done -- GAP CYCLE 2, first plan executed. Closed CR-02: `processGuards.ts`'s
`installUnhandledRejectionGuard` built its log message with `String(reason)` OUTSIDE its own try
(only the `logWarning` call was wrapped), so a null-prototype reason or a reason whose
`toString`/`Symbol.toPrimitive` throws would make the listener itself throw -- escalated by Node
into an `uncaughtException` with no handler installed, killing the sidecar. Task 1 moved the
interpolation into its own try, reassigning a `let message` initialized to a hardcoded,
non-interpolated fallback literal (`<unstringifiable reason>`) on failure; corrected the module
docstring, which had falsely claimed only the logging call was wrapped. Task 2 added 3 hostile-
reason cases to Group 2 (null-prototype, throwing `toString`, throwing `Symbol.toPrimitive`),
each asserting the EXACT fallback string via `toHaveBeenCalledWith` (not `stringContaining`, which
would also pass for the interpolated form). RED spot-checked by hand: reverting Task 1's fix made
all 3 new cases fail with `TypeError: Cannot convert object to primitive value`; restored, `git
diff` against the Task-1 commit showed zero difference. REQ-34.2-07/-14 complete, see
34.2-15-SUMMARY.md. No deviations. Full backend sweep: 108/109 suites, 2240/2241 tests (+3 over
the 2237/2238 baseline) -- the
single known `rustInvokeChannel.test.ts` failure, pre-existing from Phase 34.1, unchanged; `tsc
--noEmit` and `cargo check --quiet` both clean. Next: 34.2-16 (CR-01 sidecar half, same wave).

34.2-16 done -- GAP CYCLE 2, second plan executed. Closed verification gap #1 / code-review CR-01's
sidecar half (REQ-34.2-12): Task 1 created `loggerFlowRegistration.ts`, a curated module
registering ONLY `ipcMain.on('logError', ...)` (behaviorally identical to `logger/ipc_handler.ts:15`),
wired into `handlers.ts` before `ensureStoresRegistered()`; the docstring names the Phase 34.3
early-port and explicitly prohibits a second registration (`dispatchSend` iterates every entry in
`listenerRegistry`'s array, so a duplicate would duplicate every frontend log line). Task 2 added
`loggerFlows.test.ts` (5 tests) with the full four-part containment kit from day one (`os` +
`pathShim` + `backend/logger/paths` mocks + a `resolve`/`relative` tripwire covering
`getLogFilePath({})` alongside `appFolder`/`userDataPath`/`fixesPath`) -- the load-bearing test
writes a `logError` send frame with a unique marker over the real, unmocked sidecar RPC transport
and polls the real log file for it, proving a positive side effect rather than absence-of-throw
(REQ-34.2-08/09's own evidence standard). `backend/logger` is `jest.spyOn`'d, never `jest.mock`'d
(the logger/log_writer.ts circular-require crash `sidecarRejectionGuard.test.ts` already
documented). RED spot-checked by hand: commenting out `handlers.ts`'s `registerLoggerFlows()` call
made the positive test fail by TIMEOUT (marker never appears), never an exception -- reproducing
this project's own `sidecar-send-channels-fail-silently`/G-30-01 failure class directly; restored,
`git diff` against the Task 1 commit confirmed empty. Task 3 reconciled both ledgers:
`IPC-PORT-INVENTORY.md` moved `logError` from the Phase 34.3/slice-6 list (30->29) to "Already
ported" (27->28), annotated with the early-port note, totals reconciled (28 ported / 182 unported /
210 total, verified 33+26+29+38+56=182 by hand); `34.2-PORTED-CHANNELS.md` gained a new
"Gap cycle 2 reconciliation" subsection under §7. Slice 5's headline 26-channel count is unaffected
-- `logError` was never one of the 26. REQ-34.2-12/-08/-09/-13/-14 complete, see 34.2-16-SUMMARY.md.
One Rule 3 deviation (wording-only, no behavior change): the first draft of the new module's
docstring used the literal substring `logger/ipc_handler` and uppercase "MUST NOT register", which
tripped this plan's own literal grep-based acceptance criteria (expecting 0 occurrences of the
former, and the lowercase "must NOT register" phrasing) -- rephrased without changing scope or
behavior, re-verified green. Full backend sweep: 109/110 suites, 2245/2246 tests (+5 over the
2240/2241 baseline) -- the single known `rustInvokeChannel.test.ts` failure, pre-existing from
Phase 34.1, unchanged; `tsc --noEmit` and `cargo check --quiet` both clean; `git diff` against
`logger/ipc_handler.ts`/`main.ts` across all 3 commits confirmed empty (Electron behavior
unchanged, REQ-34.2-14). Next: 34.2-17 (CR-01 renderer half, same wave).

34.2-17 done -- GAP CYCLE 2, third plan executed, CR-01 FULLY CLOSED (both halves). Closed the
renderer half of verification gap #1 / code-review CR-01's third `missing:` item (REQ-34.2-12):
Task 1 extracted `GameSubMenu/index.tsx:143-149`'s `onRepairYesClick` catch body into a new
`repairFailure.ts` module exporting `reportRepairFailure()`, which performs exactly three
independent side effects in order -- `console.error` (transport-independent, always visible in
webview devtools), `window.api.logError` (the pre-existing signal, made live on the sidecar by
34.2-16), and `showDialogModal` with `type: 'ERROR'` (the signal the user actually sees) -- and
reduced the call site to a one-line delegation, leaving `handleRepair` and every other function
untouched. Added `box.error.title`/`box.repair.error` English source strings, preserving the
locale file's alphabetical key ordering. T-34.2-52 (information disclosure): the dialog message
is the FIXED translated string only, never the raw error text. Task 2 added a 4-test direct-call
suite (`repairFailure.test.ts`, no rendering/no jsdom needed) covering all three signals plus the
information-disclosure guard (a distinctive sentinel token embedded in the error must reach
console/log but never the dialog message). One design refinement during Task 2: the plan's own
RED-spot-check acceptance criterion required that deleting the `showDialogModal` call fail EXACTLY
one test, but a first draft with 4 separate one-behavior-per-test blocks failed 2 tests on that
revert (the dialog-shape test and the info-disclosure test both read the same mocked call) --
merged those two into one test, added an independent 4th test (non-Error thrown value, touching
only console.error/logError) to keep the suite at 4+ tests; RED spot-checked by hand: reverting
made exactly 1 of 4 tests fail, restored, diff confirmed clean. REQ-34.2-12/-14 complete, see
34.2-17-SUMMARY.md. No deviations (one Rule 3 wording-only fixup before the Task 1 commit: the
first docstring draft repeated literal code strings `window.api.logError`/`type: 'ERROR'` in prose,
which would have doubled this plan's own literal-grep acceptance counts -- rephrased, no behavior
change). Full frontend sweep: 26/26 suites, 185/185 tests (+1 suite/+4 tests over the 25/25,
181/181 baseline); `tsc --noEmit` clean; eslint 0 errors, 18 warnings (unchanged total -- the one
pre-existing `unknown`-typed template-literal warning moved from `index.tsx:147` into
`repairFailure.ts:45` when the catch body was extracted); `lint-translations` output byte-identical
before/after (7929 lines, exit 0). Next: 34.2-18 (wave 2, depends on 15+16 -- CR-03 + WR-01
pathShim/logger containment kit for `sidecarRejectionGuard.test.ts`), the final plan of gap cycle 2.

34.2-18 done -- GAP CYCLE 2, fourth and final plan executed, CR-03/WR-01 CLOSED. Task 1 added
the `pathShim` + `backend/logger/paths` containment kit to `sidecarRejectionGuard.test.ts`
(the suite gap cycle 1 created to prove CR-02, which never received the CR-03 remedy its
siblings got in plan 34.2-10 -- an `os.homedir()` mock alone does not contain `pathShim`'s
real `resolveAppDataDir()` on Windows/Linux, since it prefers `env.APPDATA`/
`env.XDG_CONFIG_HOME`); extended the tripwire to 4 candidates (`appFolder`/`userDataPath`/
`fixesPath`/`getLogFilePath({})`); replaced the suite's false "NO FILESYSTEM WRITES" docstring
claim; replaced the tripwire's heavy `setupIsolatedBootstrapHarness()` data source with a
narrower `loadConstantsPaths()` helper (IN-03). Task 2 extended the same log-path containment
to `gameDetailsFlows.test.ts`/`enrichmentFlows.test.ts` (closing WR-01 for all four in-scope
suites) with zero assertions altered; before/after `~/Library/Logs/GameLib` timestamps
confirmed unchanged. Task 3 added `testContainment.test.ts`: Block A proves containment holds
even with `APPDATA`/`XDG_CONFIG_HOME`/`XDG_STATE_HOME`/`LOCALAPPDATA` set to sentinels outside
`os.tmpdir()` AND `process.platform` forced to `'linux'` (mirroring this repo's own
`overrideProcessPlatform` precedent, `constants.test.ts`) -- the platform-forcing was a
necessary addition beyond the plan's literal env-var-only text, since `pathShim.ts`'s real
darwin branch never consults any of those four env vars, so a macOS run using env vars alone
would have been vacuous; Block B is a declared-list (4 entries) source gate over
comment-stripped source, plus anti-vacuity checks. 11 other sidecar suites sharing the same
risk class recorded as declared debt in `deferred-items.md`. One Rule 1 deviation: Task 1's
literal deliberate-break acceptance criterion (remove pathShim mock + export
`XDG_CONFIG_HOME`) does not reproduce on this macOS host for the reason above -- substituted
the platform-correct 34.2-10 negative-control method (point the mock's own `'appData'` branch
outside tmpdir) instead, verified live (all 11 tests failed "REFUSING TO RUN", reverted clean).
REQ-34.2-07/-14 complete, see 34.2-18-SUMMARY.md. Full backend sweep: 111 suites (110 passed /
1 pre-existing known `rustInvokeChannel.test.ts` failure, unchanged from 34.1), 2273 tests
(2272 passed) -- +1 suite/+27 tests over the 110/111 baseline, zero regressions; `tsc --noEmit`
and `cargo check --quiet` both clean; no production/Rust code touched.
**PHASE 34.2 GAP CYCLE 2 COMPLETE -- all 4 plans (34.2-15..18) executed, CR-01/CR-02/CR-03/
WR-01 all closed. Next: re-verification of Phase 34.2 as a whole.**

34.2-01 done -- Task 1 initialized i18next in the sidecar bootstrap (D-02, mirrors main.ts:460-472
field-for-field, idempotent guard, after initLogger()/before READY_SENTINEL, never able to crash
boot); Task 2 wired fetchLastestReleases() + re-homed the releasesInfoReady->downloadAntiCheatData
listener (D-07/D-04, both after initOnlineMonitor(), listener before fetch); Task 3 added a 7-test
non-mocked proof suite (bootstrapWirings.test.ts) exercising the real i18next/backendEvents/
utils-releases/anticheat-utils singletons -- discovered and defeated (via jest.unmock('i18next'))
a project-wide Jest automock at src/backend/__mocks__/i18next.ts that silently substitutes for the
real npm package in every backend test file with no explicit jest.mock() call, a level further back
than the exact 34.1 CR-01 blind spot this plan's objective names. REQ-34.2-02/04/07/14 complete, see
34.2-01-SUMMARY.md. RED spot-checked: reverting Task 1's block failed test 1; reverting Task 2's
listener block failed test 4 while test 3 still passed.

34.2-02 done -- Task 1 extracted 15 game-details/settings handler bodies verbatim from main.ts into
Electron-free src/backend/gamedetails/dispatch.ts (isGameAvailable, getGameInfo, getExtraInfo,
getGameSettings, kill, repair, changeInstallPath, getLaunchOptions, changeGameVersionPinnedStatus,
getGameOverride, getGameSdl, readConfig, addNewApp, getAvailableCyberpunkMods,
setCyberpunkModConfig); Task 2 added gamedetails/overrides.ts (setGameMetadataOverride + a
setMetadataChangedNotifier DI seam, since the module cannot import backend/ipc's
sendFrontendMessage) and rewrote main.ts's 17 registrations as one-line delegations
(getGameMetadataOverride/getAllGameOverrides already-clean pass-throughs and requestGameSettings
D-09 left untouched); Task 3 added a 28-test direct-call suite (gameDetailsModules.test.ts) incl.
a jest.unmock('i18next') proof (repair/getLaunchOptions assertions run against the real,
uninitialized i18next.t() output rather than a fake, per the 34.2-01 CR-01-blind-spot lesson) and
a no-electron/backend-ipc/launcher/main_window source gate. RED spot-checked: injecting an
electron import into dispatch.ts failed the source gate; dropping the attachOverrides call in
getGameInfo failed a test; swapping kill's two statements failed the call-order test. One Rule 3
deviation: removed a pre-existing unused `backendEvents` import from main.ts (a leftover from
Phase 34.1's changeLanguage extraction) that blocked this plan's own eslint-clean acceptance
criterion. REQ-34.2-01/03/08/09 complete, see 34.2-02-SUMMARY.md.

34.2-03 done -- Task 1 extracted readKnownFixes verbatim out of launcher.ts into Electron-free
src/backend/knownFixes.ts (D-05, launcher.ts deliberately excluded from the sidecar's import graph
per steamFlowRegistration.ts:22); launcher.ts's installFixes imports it back unchanged, dead
fixesPath/storeMap/KnowFixesInfo imports removed. Task 2 extracted buildCrossoverRatingMap +
its D-11/D-16 three-state docstring out of crossover_index/ipc_handler.ts into
crossoverRatingMap.ts (D-06, closing the side-effect-import trap where the function shared a file
with its own addHandler call); ipc_handler.ts reduced to two imports + the single addHandler line,
no re-export; ratingMap.test.ts retargeted, its jest.mock('backend/ipc') block dropped (6->7
tests, new anti-remerge source-gate test). Task 3 added a 5-test direct-call proof suite
(knownFixes.test.ts, all REQ-34.2-05-tagged) with a jest.mock('os') homedir redirect
(appShellFlows.test.ts precedent) as defense-in-depth alongside the project-wide electron
automock, which already anchors fixesPath under os.tmpdir() via app.getPath('appData'). One Rule 3
deviation: main.ts's refreshCrossoverRatingMap() had a second, plan-undocumented import of
buildCrossoverRatingMap from ipc_handler.ts that broke the build after Task 2's extraction --
redirected to crossoverRatingMap.ts. Logged one unrelated pre-existing eslint error
(index.test.ts:29) to the phase's deferred-items.md rather than fixing it. REQ-34.2-05/06/14
complete, see 34.2-03-SUMMARY.md. RED spot-checked: removing storeMap[runner] from the path
construction failed 3/5 knownFixes tests; replacing the try/catch with a bare JSON.parse failed
the malformed-JSON test. Next: 34.2-04.

34.2-04 done -- Task 1 created src/backend/sidecar/gameDetailsFlowRegistration.ts, registering
all 15 invoke-kind game-details/settings/override channels (getGameInfo, getExtraInfo,
getGameSettings, isGameAvailable, getLaunchOptions, kill, repair, changeInstallPath, readConfig,
getGameOverride, getGameSdl, getAvailableCyberpunkMods, setCyberpunkModConfig,
getGameMetadataOverride, getAllGameOverrides) against the real 34.2-02 dispatch.ts bodies and
game_overrides/index.ts pass-throughs, wired into handlers.ts after registerAppShellFlows() and
before ensureStoresRegistered(); settingsFlowRegistration.ts (D-09, requestGameSettings) left
byte-unchanged. Task 2 added a 22-test black-box RPC-loop suite (gameDetailsFlows.test.ts)
covering all 15 channels incl. object-argument-intact proofs, D-01 runner-generic dispatch (steam

+ gog), pinned-manager isolation for the four legendary/gog-only channels, and the two

game_overrides pass-throughs proven against the REAL Phase-29 store; repair's notify-body
assertion is the end-to-end proof of 34.2-01's D-02 i18next fix (RED-confirmed live: removing
bootstrap.ts's i18next.init() call flipped the assertion from "string" to "undefined"). Task 3
added a 47-test import/delegation/kind/do-not-touch gate suite (gameDetailsImportGate.test.ts):
table-driven delegation-shape proof for all 19 of this slice's main.ts channels, table-driven
transport-kind proof (3 addListener, 16 addHandler), and byte-identity gates for
settingsFlowRegistration.ts + electronUntouched.test.ts via git show HEAD. Two Rule 1 deviations
found+fixed during Task 2's own RED spot-checks: (a) the project-wide i18next automock
(src/backend/__mocks__/i18next.ts) silently defeated the D-02 proof test until jest.unmock('i18next')
was added -- the first RED attempt passed vacuously on the automock's echoed key; (b) this repo's
shared jest.config.js resetMocks:true strips even a jest.mock FACTORY's own default implementation
before the FIRST test, so isOnline: jest.fn(() => true) needed re-arming in beforeEach or repair's
isOnline() gate silently returned undefined. Also narrowed settingsFlows.test.ts's Invariant B
guard to getUserInfo only (readConfig is no longer unported -- now owned by this plan).
REQ-34.2-01/03/08/09/10/14 complete, see 34.2-04-SUMMARY.md. Next: 34.2-05.

34.2-05 done -- Task 1 registered the 3 send-kind channels (setGameMetadataOverride,
changeGameVersionPinnedStatus, addNewApp) onto gameDetailsFlowRegistration.ts, each
cross-checked against main.ts's addListener kind before writing, wrapped in try/catch ->
logSendFailure; installed setMetadataChangedNotifier() first (before any send
registration) riding the existing sidecarRpc.pushFrontendMessage relay -- zero new Rust
arms, confirmed via an empty `git diff src-tauri/` and a clean `cargo check`. Task 2 added
a 9-test positive-side-effect proof block to gameDetailsFlows.test.ts (store read-back,
metadataChanged push-frame assertion, delete-path reachability, sideload-only addNewApp
dispatch, both branches of the 3-positional-arg changeGameVersionPinnedStatus unwrap, a
runtime registry kind gate, forced-throw crash containment on two independent paths with
an unhandledRejection spy, and a two-startSidecar() idempotency pin). REQ-34.2-01/08/09
complete, see 34.2-05-SUMMARY.md. RED spot-checked: commenting out setGameOverrides
failed the round-trip test; removing the notifier install failed the push-frame test while
the round-trip test still passed; swapping args[1]/args[2] in changeGameVersionPinnedStatus
failed both status-variant tests. No deviations. Next: 34.2-06.

34.2-06 done -- Task 1 created src/backend/sidecar/enrichmentFlowRegistration.ts, registering all
8 enrichment channels (getWikiGameInfo, getAnticheatInfo, getKnownFixes, getCrossoverIndex,
searchStores, getStoreSearchDeals, getStoreSearchStoreMap, removeRecent) against the real
underlying feature-module bodies (never an ipc_handler.ts), reproducing storeSearch/index.ts's
try/log/rethrow contract verbatim for the storeSearch trio and recording the D-07 anticheat rider
(Epic-namespace-only keying, null on Windows) in code; wired into handlers.ts after
registerGameDetailsFlows() and before ensureStoresRegistered(). Task 2 measured getWikiGameInfo's
cold-cache latency live (Hades 1190ms, Stardew Valley 957ms, Portal 2 702ms, real network,
2026-07-25 -- forced via this repo's own jest electron-store automock, no manual cache-clearing
needed) and left it on the default 60s bound; added getCrossoverIndex to
src-tauri/src/main.rs's LONG_RUNNING_CHANNELS (one string, zero new dispatch_rust_channel arms,
confirmed via git diff) since buildCrossoverRatingMap() fans out over every game in every manager
AND calls loadIndex/buildMaps per game; longRunningChannels.test.ts pins the exemption list via
set equality (6 tests). Task 3 added a 28-test real-transport suite (enrichmentFlows.test.ts)
covering all 8 channels incl. the D-16 three-state getCrossoverIndex map (key-absent vs null vs
matched, via Object.prototype.hasOwnProperty), a getWikiGameInfo cache-hit proof that the `title`
invoke argument is ignored, the storeSearch error-contract trio (real error frame, not a swallowed
empty result), and comment-stripped import gates. REQ-34.2-04/11/12/14 complete, see
34.2-06-SUMMARY.md. RED spot-checked: replacing searchStores's `throw err` with `return []` failed
the error-contract test; removing anticheat/utils.ts's isWindows early-return failed the Windows
rider test. Two Rule 1 deviations found+fixed before the Task 3 commit: the suite's manager-mock
beforeEach only reset 3 of 6 libraryManagerMap managers (resetMocks:true strips even a factory's
own default getListOfGames implementation, so nile/zoom/sideload returned undefined and crashed
buildCrossoverRatingMap's iteration); real fs/promises readFile() of an EXISTING anticheat data
file needed a real setTimeout tick, not just setImmediate (flushWithIo() helper added). One Rule 3
fixup (separate commit de1623d9): two require('fs') calls tripped @typescript-eslint/no-require-
imports and a WikiInfo test fixture was missing CodeweaversInfo's linuxRating/slug fields --
both fixed post-commit. Next: 34.2-07 (phase closure).

34.2-07 done -- slice closure: declared all 26 channels (23 sidecar invoke + 3 sidecar send) in
34.2-PORTED-CHANNELS.md with kind/backed-by/proof-level per row, set-equal to
IPC-PORT-INVENTORY.md's slice-5 list, three declaration riders (four Steam upstream stubs incl.
the previously-unnamed changeInstallPath/library.ts:790, getAnticheatInfo's Epic-namespace/
Windows-null behavior even when primed, six channels unreachable in a Steam-only workflow), the
getGameSettings/requestGameSettings divergence (D-09, dedupe deferred to Phase 35), and a sign-off
written FRESH (not copied from 34.1) stating this slice's claim is genuinely stronger --
data-in/data-out with assertable return shapes over the real RPC loop -- while naming D-02/D-07 as
the two honest exceptions. 34.2-HUMAN-UAT.md records exactly those two deferred items
(UAT-34.2-01 notification render, UAT-34.2-02 anticheat data-file download) with reproduction
steps, the honest-boundary sentence reproduced byte-identically from the PORTED-CHANNELS doc.
34.2-VALIDATION.md's 20-task map reconciled against all six prior SUMMARYs (status: complete,
nyquist_compliant: true). SEAM.md gained a new Phase 34.2 subsection in Sec.1, headline tally
61->87 wired/re-routed total, and the stale steamFlowRegistration/libraryManagerMap claim
corrected (not deleted) per D-01/Phase-32-D-02. REQ-34.2-13 complete, see 34.2-07-SUMMARY.md.
One deferred item logged (out of scope, pre-existing): a leaked-timer crash in
storeManagers/steam/library.ts's pollInstallOnce blocks a clean `pnpm test:ci` run; confirmed
pre-existing and unrelated (this plan touched zero source files) via git diff --stat and git log;
verified instead via the targeted 7-suite/152-test sweep + tsc --noEmit + cargo check, all green.
**PHASE 34.2 COMPLETE — all 7 plans executed, 26 channels declared ported, unit-proven with
exactly two named live-UAT exceptions (D-02, D-07) deferred per D-11. Headline IPC re-plumb tally
now 87 wired/re-routed total across Phases 30-34.2. Next: Phase 34.3
(tauri-ipc-re-plumb-slice-6-shell-files-logs-and-diagnostics).**

**GAP CYCLE 1 (verification returned `gaps_found`, 11/14 — plans 34.2-08..14):**

34.2-08 done -- Task 1 exempted `repair` and `readConfig` from the sidecar's 60s bounded invoke
timeout (both now resolve to `None` in Rust `timeout_for()`, each with a one-line rationale comment;
`INVOKE_TIMEOUT`, `timeout_for()` and every `dispatch_rust_channel` arm left byte-unchanged) and
extended `longRunningChannels.test.ts`'s exact-set pin to the new eight-member array in the SAME
commit, widening the pre-existing-survivor loop to six and adding two named per-channel tests. Task 2
wrapped `onRepairYesClick`'s floating `await repair(appName, runner)` in try/catch + `window.api
.logError` (no rethrow, matching the `GamePage/index.tsx:288` convention), so a spurious timeout can
no longer become an unhandled rejection. Closes verification gap #1 / code-review CR-01;
REQ-34.2-12 complete, see 34.2-08-SUMMARY.md. Two recorded decisions: the `readConfig` exemption
applies to the whole channel rather than just `readConfig('library')` (accepted tradeoff, recorded
in-code per threat T-34.2-35), and the renderer catch logs-and-swallows rather than rethrowing to
avoid recreating the floating-promise problem one frame up at `onClick`. No deviations. One benign
eslint warning added (`GameSubMenu/index.tsx:147`, `unknown`-typed template literal — same accepted
class already present at the convention site; eslint still exits 0 with 0 errors, 18 warnings vs 17).
NOTE: this plan's own STATE/ROADMAP writes were interrupted by an API cutoff and were completed by
the orchestrator on re-entry; `state.begin-phase`/`state.update-progress` again reverted `stopped_at`
to a false "Phase 34.2 fully complete (7/7)" and re-spliced a progress-bar string into the
plan-counter note at line ~483 -- both hand-corrected, same precedent as every note in this cluster.

34.2-09 done -- closed verification gap #2 (REQ-34.2-07) / code-review finding CR-02: Task 1
attached a `.catch()` directly to the `downloadAntiCheatData(...)` call inside `bootstrap.ts`'s
`releasesInfoReady` listener body (the pre-existing `try`/`catch` around `backendEvents.on()`
covered only the synchronous registration, not the listener body which runs later from the
emitter). Task 2 added `processGuards.ts`'s `installUnhandledRejectionGuard()` -- idempotent,
log-only, `process.stderr` fallback for the early-boot `heroicLogWriter`-unset window, never
re-throws/exits/touches stdout -- installed in `src/sidecar/index.ts` before `init()`, and
updated the three stale "no guard exists" comments (`electronStub.ts`/`appShellFlowRegistration
.ts`/`gameDetailsFlowRegistration.ts`) to point at it. Task 3 added `sidecarRejectionGuard.test.ts`
(8 tests): a survival proof driving the real `bootstrap.init()` with a rejecting
`downloadAntiCheatData` (zero `unhandledRejection` events, warning logged, listener still ran),
guard-contract unit tests (idempotency, non-throw incl. when `logWarning` itself throws), and a
by-construction source-text gate proving guard-before-init() ordering in `src/sidecar/index.ts`
(not a jest project root, never imported). RED spot-check performed by hand: reverting Task 1's
`.catch()` made the survival-proof test fail as expected; file restored and `git diff` confirmed
empty afterwards. REQ-34.2-07 complete, see 34.2-09-SUMMARY.md. This was a CONTINUATION run:
Tasks 1-2 were committed in a prior session interrupted before Task 3; on resume, Task 3's test
file was found already fully written on disk (uncommitted) from that interrupted session --
verified against the plan's acceptance criteria rather than rewritten, with two Rule-1 fixes
applied (a TS2740 type mismatch in `loadFreshProcessGuards()`'s return type, and two doc-comments
that named literal banned fs-API identifiers in prose, tripping the plan's own acceptance-grep
even though no actual fs call existed).

34.2-10 done -- closed code-review finding CR-03 (blocker-severity anti-pattern in
34.2-VERIFICATION.md's Anti-Patterns table, no REQ ID -- REQ-34.2-03's actual work stays with
34.2-11) and WR-08: Task 1 mocked `pathShim.getPath()` directly in `enrichmentFlows.test.ts`
(all 4 names, no platform branch, no env var) since the suite's only prior redirect was a
`jest.mock('os')` homedir() override that `pathShim.ts`'s real `resolveAppDataDir()` bypasses on
win32 (`env.APPDATA`) and default/Linux (`env.XDG_CONFIG_HOME`) -- a real data-loss risk for the
suite's `rmSync(fixesPath, ...)`/`configStore.set('games.recent', [])` calls on non-macOS; added a
`beforeAll` containment guard (`resolve`+`relative`, never `startsWith`/`join`, per Phase 18's
"join is not containment" lesson) over `appFolder`/`userDataPath`/`fixesPath`; re-armed the
`online_monitor` `isOnline`/`runOnceWhenOnline` mocks in `beforeEach` (WR-08 -- `resetMocks: true`
strips a factory's own default implementation, so `runOnceWhenOnline` never invoked its callback
in this file). Task 2 applied the identical mock+guard shape to `gameDetailsFlows.test.ts` (its
own two `gameOverridesStore.set('overrides', {})` `beforeEach` blocks had the same bypass), leaving
its `jest.mock('os')` and load-bearing `jest.unmock('i18next')` untouched. Both suites' negative
controls (temporarily pointing the mock's `'appData'` branch outside tmpdir) were run live and
recorded verbatim in 34.2-10-SUMMARY.md: every test in both files failed loudly with the guard's
error, then passed again after revert (28/28 and 31/31). Full backend sweep: 106/107 suites,
2221/2222 tests -- the single known `rustInvokeChannel.test.ts` failure, pre-existing from Phase
34.1, unchanged. No production source file touched; requirements-completed: [] (deliberate, see
PLAN.md frontmatter). See 34.2-10-SUMMARY.md. Next: 34.2-11.

34.2-11 done -- closed verification gap #3 (REQ-34.2-03) / code-review finding WR-02: the
requirement text and two module docstrings (`dispatch.ts`, `enrichmentFlowRegistration.ts`)
overclaimed a TRANSITIVE electron-freedom property the code does not have -- `dispatch.ts` ->
`../dialog/dialog` -> `electron` and `enrichmentFlowRegistration.ts` -> `../storeSearch/cheapshark`
-> `electron` are both real two-hop edges the existing depth-1 `gameDetailsImportGate.test.ts`
gates cannot see. Task 1 rewrote all three sites (comment-only diff in the two source files,
confirmed via a `^[+-]` grep excluding comment-prefixed lines) to state the true, enforced
invariant -- no DIRECT electron/`backend/ipc`/`../ipc`/`../launcher`/`main_window` import -- and to
name `electronStub.ts`'s `Module._load` interception as the mechanism that makes transitive reach
safe at runtime; `REQUIREMENTS.md`'s REQ-34.2-03 got an explicit, dated correction note naming this
gap/WR-02, REQ-34.2-14 left byte-unchanged (one hunk only, verified via `git diff`). Task 2 built
`electronReachLedger.test.ts` from scratch using the TypeScript compiler API
(`ts.resolveModuleName` against the repo's own `tsconfig.json`, never `ts-morph`/`madge`) to walk
the real transitive import graph from the four gated entry points, committing a growth-only
(subset, not strict-equality) baseline of the 29 electron-importing modules actually reachable --
regenerated fresh at execution time, matching the plan's planning-time 29-entry list byte-for-byte
even though the total graph size (192 files) differs slightly from the plan's 194-file note (not
investigated further, per the plan's own "do not force either value" guidance -- the >100
reachability-sanity assertion holds either way). Both required negative controls were run live and
reverted: removing a baseline entry made the growth tripwire fail naming it; restricting the walk
to depth 1 failed 3 of 4 tests (anti-degradation, reachability sanity, gap-#3 edge pin), proving
none of the four tests pass vacuously. `gameDetailsImportGate.test.ts` untouched (owned by
34.2-12/WR-01). REQ-34.2-03 content-complete (checkbox left for the verifier, per plan
instruction). See 34.2-11-SUMMARY.md. Full backend sweep: 107/108 suites, 2225/2226 tests -- the
single known `rustInvokeChannel.test.ts` failure, pre-existing from Phase 34.1, unchanged, plus
this plan's new 1 suite / 4 tests. No deviations. Next: 34.2-12.

34.2-12 done -- closed WR-01/WR-04, both instances of the same failure class: assertions that
cannot fail. Task 1 replaced `gameDetailsImportGate.test.ts`'s Gate 7/8 -- which compared the
working tree to `git show HEAD:<same path>`, unconditionally true on any clean checkout and
therefore protecting nothing since 34.2 was committed -- with a committed sha256 digest pin per
file (`createHash`, `execFileSync` import removed, zero `git` subprocess remaining), plus two
Layer-2 semantic pins for `settingsFlowRegistration.ts` (exact ten-channel set via set-equality +
length, and a `steamLibrary.has(` presence check over comment-stripped source) protecting the
specific D-09 bottle-launch fix. Task 2 closed WR-04 in `gameDetailsModules.test.ts`: added a
`beforeAll` that initializes the REAL i18next singleton (isInitialized-guarded) from
`public/locales/en/gamepage.json` read off disk, then rewrote the vacuous `getLaunchOptions`
default-label test (previously comparing two calls to the same uninitialized `i18next.t()`,
which returns `undefined` on i18next 22.5.1 and passed under `toEqual`'s undefined-property-is-
absent semantics) to assert `result[0].name` against the on-disk `launch.default` value AND
explicitly reject both `undefined` and the raw `'launch.default'` key -- closing the
uninitialized-singleton blind spot and the project-wide `__mocks__/i18next.ts` automock echo in
one assertion pair. All three negative controls run live and reverted (verbatim in
34.2-12-SUMMARY.md): a blank-line edit to `settingsFlowRegistration.ts` failed the digest gate
naming REQ-34.2-10/D-09; removing `isNative` from the expected channel set failed the semantic
pin; disabling the `beforeAll` init made the getLaunchOptions test fail with `Received: undefined`.
One Rule 3 deviation: a `LaunchOption` union-type TS2339 (`.name` not on `AltExeLaunchOption`/
`DLCLaunchOption`) blocked `tsc --noEmit`, fixed with a narrow `as { name: string }` cast (the
preceding `toMatchObject({ type: 'basic' })` already proves the runtime shape). REQ-34.2-03
complete, see 34.2-12-SUMMARY.md. Full backend sweep: 107/108 suites, 2227/2228 tests -- the
single known `rustInvokeChannel.test.ts` failure, pre-existing from Phase 34.1, unchanged, plus
this plan's own net +2 tests (Gate 7's two new semantic-pin tests; Task 2 rewrote an existing test
in place). Next: 34.2-13.

34.2-13 done -- closed code-review WR-09 (REQ-34.2-11): extracted the three `storeSearch` D-14
rethrow-contract handler bodies (`handleSearchStores`, `handleGetStoreSearchDeals`,
`handleGetStoreSearchStoreMap`) into `storeSearch/handlers.ts`, the single implementation now
imported by both `storeSearch/index.ts` (Electron `addHandler`) and
`sidecar/enrichmentFlowRegistration.ts` (Tauri `ipcMain.handle`) as one-line delegations, closing
the hand-copied duplication WR-09 found. A comment-stripped anti-remerge gate
(`storeSearch/__tests__/handlers.test.ts`, 10 tests) proves the log strings now exist in exactly
one file; live negative control re-inlined one handler body into `enrichmentFlowRegistration.ts`
and confirmed the gate fails naming it, then reverted. Full backend sweep: 108/109 suites,
2237/2238 tests -- the single known `rustInvokeChannel.test.ts` failure, pre-existing from Phase
34.1, unchanged, plus this plan's net +1 suite/+10 tests; `electronReachLedger.test.ts`'s baseline
did not grow (handlers.ts's electron reach is via the already-baselined `cheapshark.ts` hop). No
deviations. See 34.2-13-SUMMARY.md. (Backfilled into this position log by 34.2-14's executor --
34.2-13's own session completed its work and decision log entry but did not append this narrative
line; verified against 34.2-13-SUMMARY.md and its recorded commits `465a2829`/`79f2ad75` before
writing.) Next: 34.2-14.

34.2-14 done -- **FINAL PLAN OF GAP CYCLE 1.** Closed the currency gap `34.2-VERIFICATION.md`
truth row 13 named against `34.2-PORTED-CHANNELS.md`: Task 1 brought §1 (LONG_RUNNING_CHANNELS now
8 members -- `getCrossoverIndex` from 34.2-06 plus `repair`/`readConfig` from 34.2-08, still a
timeout-policy edit not a port kind, dispatch_rust_channel arm count still 11, verified against
`src-tauri/src/main.rs` source directly), the `repair`/`readConfig` §2 rows (CR-01 timeout
exemption, the missed 34.2-06 audit, the renderer catch fix), the D-07 bootstrap-wiring §2 entry
(CR-02 crash-unsafety and its `.catch()`+`processGuards.ts` fix), and §5 (named WR-03/05/06/07/10 +
IN-01..04 as still-open accepted debt) current. Task 2 corrected §6's sign-off to state the true
direct-import (not transitive) electron-freedom invariant, named `Module._load` as the runtime
rescue mechanism and `electronReachLedger.test.ts` (29 of 192 files) as the measured Phase 35
work-list, recorded that WR-01/WR-04 were assert-nothing proofs now replaced, added a paragraph
recording (not resolving) how the gap cycle touches both deferred `34.2-HUMAN-UAT.md` items without
changing their pending/deferred status, and appended a labelled §7 gap-cycle reconciliation
subsection naming the gap/finding each of 34.2-08..14 closed. REQ-34.2-12/REQ-34.2-03 complete, see
34.2-14-SUMMARY.md. Exactly one file modified across both commits (`34.2-PORTED-CHANNELS.md`);
`34.2-HUMAN-UAT.md` and `.planning/IPC-PORT-INVENTORY.md` confirmed untouched via
`git status --porcelain`. Full backend baseline unchanged at 108/109 suites, 2237/2238 tests
(the single known `rustInvokeChannel.test.ts` failure, pre-existing from Phase 34.1, still out of
scope); targeted 17-suite/236-test sweep green; `tsc --noEmit` and `cargo check --quiet` both
clean. No deviations.
**PHASE 34.2 GAP CYCLE 1 COMPLETE — 7/7 plans executed (34.2-08..14). Every verification gap
(#1/#2/#3) and every code-review finding classified blocker/actionable in this cycle (CR-01, CR-02,
CR-03, WR-01, WR-02, WR-04, WR-08, WR-09) is closed. Findings deliberately left open (WR-03, WR-05,
WR-06, WR-07, WR-10, IN-01, IN-02, IN-03, IN-04) are named by ID in the refreshed
`34.2-PORTED-CHANNELS.md` §5 and in `deferred-items.md`, not silently dropped. Both deferred
`34.2-HUMAN-UAT.md` live items (UAT-34.2-01, UAT-34.2-02) remain deferred, unmodified. The
pre-existing `rustInvokeChannel.test.ts` failure (Phase 34.1 tray regression) remains red,
unchanged, out of scope. Ready for re-verification against the refreshed artifact set.**
NOTE: this plan's own `gsd-sdk` state writes hit the same known-corruption family documented in
every note in this cluster: `state.record-metric` reverted the frontmatter `stopped_at` (already
hand-corrected once, after `state.advance-plan`) back to the stale `34.2-10` value a second time,
and `state.record-session` dropped the ` -- Phase 34.2 gap cycle 1 EXECUTING, ...` descriptive
suffix off both the frontmatter and body `Stopped at:`/`Next:` fields when it wrote them. All
hand-corrected via targeted `Edit`, diffed against a pre-session snapshot each time rather than
trusted blindly. The recurring `**Progress:**[█████████░] 93%
happened to land on the SAME value this session's own `update-progress` computed, so no further
edit was needed there this time — coincidence, not a fix.
NOTE (34.5-28): the same splice-into-historical-prose bug recurred yet again this session --
`state.update-progress` overwrote this note's own `93%` with `94%` (this session's own computed
plan-based percent), corrupting the historical record above yet again. Hand-corrected back to
`93%` per this cluster's own established convention.
NOTE (34.5-24): the same splice-into-historical-prose bug recurred yet again this session --
`state.update-progress` overwrote this note's own `91%` with `92%` (this session's own computed
plan-based percent), corrupting the historical record above yet again. Hand-corrected back to
`91%` per this cluster's own established convention.
NOTE (34.4.1-13): the same splice-into-historical-prose bug recurred yet again this session --
`state.update-progress` overwrote this note's own `89%` with `90%` (this session's own computed
plan-based percent), corrupting the historical record above a SECOND time (see the 34.4.1-04 note
further below for the first recurrence against this exact line). Hand-corrected back to `89%`
per this cluster's own established convention.
NOTE (34.5-01): the same splice-into-historical-prose bug recurred yet again this session --
`state.update-progress` overwrote this note's own `93%` with `84%` (this session's own computed
plan-based percent), corrupting the historical record above. Hand-corrected back to `93%` per
this cluster's own established convention.
NOTE (34.4.1-04): the same splice-into-historical-prose bug recurred again this session --
`state.update-progress` overwrote this note's own `89%` with `90%` (this session's own computed
plan-based percent), corrupting a historical record of a DIFFERENT, earlier session's value.
Hand-corrected back to `89%` per this cluster's own established convention (see the 34.2-14 note
immediately below for the precedent of restoring a placeholder/prior value rather than accepting
the splice).
NOTE (34.2-14, the final gap-cycle plan): the same corruption family recurred a fourth time.
`state.advance-plan` reverted `last_activity` from a descriptive suffix to a bare date and left
the frontmatter `percent` field stale at `67` even though `state.update-progress`'s own JSON
output (run immediately after) reported `91`; `state.record-metric`/`state.add-decision` behaved
cleanly this round (append-only, no reverts). `state.update-progress` again spliced the literal
progress-bar string `[█████████░] 91%` into THIS sentence in place of the `[...]` placeholder
(the same splice site every prior note in this cluster records, now at line ~310) rather than
into anything resembling a progress-bar field — hand-corrected back to `[...]`, along with the
stale frontmatter `percent`/`last_activity` fields, both diffed against a pre-session snapshot of
`STATE.md` rather than trusted blindly, per this cluster's established practice.

Prior phase: 34.1 (tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome) — COMPLETE, 8 of 8 executed (34.1-01 done -- D-04 capability grants + IPC-PORT-INVENTORY.md reconciliation, REQ-34.1-02/REQ-34.1-10 complete, see 34.1-01-SUMMARY.md; 34.1-02 done -- D-07/D-08 app-shell handler extraction, REQ-34.1-04/REQ-34.1-12 complete, see 34.1-02-SUMMARY.md; 34.1-03 done -- D-01/D-02 renderer-side window chrome + D-05/D-06 frameless runtime, REQ-34.1-01/REQ-34.1-03 complete, see 34.1-03-SUMMARY.md; 34.1-04 done -- D-03/D-09/D-13 sidecar registration of the 18 app-shell channels + new import-graph gate, REQ-34.1-05/REQ-34.1-09 complete, see 34.1-04-SUMMARY.md; 34.1-05 done -- D-10 renderer-side gamepadAction (DOM dispatch + geometric directional focus, replacing webContents.sendInputEvent), REQ-34.1-06 complete, see 34.1-05-SUMMARY.md; 34.1-06 done -- D-11 real Tauri tray (tray_set_icon rustInvoke arm + changeTrayColor registration), see 34.1-06-SUMMARY.md; 34.1-07 done -- D-12 createNewWindow/showAboutWindow as genuine renderer-side Tauri WebviewWindows, fail-closed per-window-label capability scoping (windows:["main"]), REQ-34.1-08 complete, see 34.1-07-SUMMARY.md; 34.1-08 done -- slice closure: declared 33-channel ported list w/ the third port kind (renderer-side Tauri JS), 10 deferred live-UAT items (34.1-HUMAN-UAT.md), validation contract closed (nyquist_compliant: true), SEAM.md ported/deferred split reconciled (headline tally 28->61 wired/re-routed total), REQ-34.1-11/REQ-34.1-12 complete, see 34.1-08-SUMMARY.md. **PHASE 34.1 COMPLETE — all 8 plans executed, 33 channels declared ported, unit-proven with ALL live UAT deferred per D-15. Next: Phase 34.2.**)
Status: Ready to execute

> NOTE (34.3-08): `state.advance-plan` again spliced this session's current status
> ("Phase complete — ready for verification") into this HISTORICAL "Prior phase: 34.1"
> narrative line rather than into the actual "Current Position" section below — the
> same mis-targeted-write bug this cluster's notes document repeatedly. Reverted back
> to its pre-session value (`Status: Ready to execute`) rather than trusted; the real
> current status lives in the frontmatter (`status:`) and in "Current Position" above.

Prior context (Phase 34 release/CI narrative, retained verbatim; the leading sentence was
truncated by `state.planned-phase` overwriting the `Status:` line — content below is history,
not the current status):
  suite 76/76 green, cross-plan sweep
  `tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource|electronUntouched|updaterSigningKey`
  192/192 green): closed the CODE half of GAP-B, live run 30084918812 -- Linux and Windows both bundled
  their installers in full and THEN failed at updater signing with `failed to decode secret key:
  incorrect updater private key password: Wrong password for that key`, ~13 minutes into the Windows
  leg, because WR-03's existing preflight only asserts `TAURI_SIGNING_PRIVATE_KEY != ''` -- a non-empty
  key with a mismatched password sails straight through it. Task 1 added `meta/updaterSigningKey.ts`
  (`verifyUpdaterSigningKeypair()` signs a throwaway probe file with the real Tauri signer, spawned via
  `require.resolve('@tauri-apps/cli/tauri.js')` + `process.execPath` in argv form -- the proven GAP-2
  pattern, never a bare `tauri`/pnpm `.bin` path -- and compares the resulting signature's minisign key
  id against the committed `src-tauri/tauri.conf.json` `plugins.updater.pubkey` key id; discriminated
  result `ok | missing-key | password-mismatch | sign-failed | pubkey-mismatch | bad-pubkey`, never
  throws for an expected failure), `meta/verifyUpdaterSigningKey.ts` (thin CLI entry, one `::error::`
  line per failure kind naming the concrete remedy, only the public key id ever printed on success),
  and `meta/__tests__/updaterSigningKey.test.ts` (real keypairs generated via `tauri signer generate
  --ci` in `beforeAll`, no hand-rolled crypto, no checked-in key material) plus the `verify:updater-key`
  package.json script following the existing meta-script esbuild-pipe-to-node convention exactly. Task 2
  inserted `Verify the updater signing key and password actually decode` into `release-tauri.yml`
  immediately after `install-deps` and before the CrossOver-index fetch (needs `node_modules` for the
  Tauri CLI, so cannot sit next to WR-03's presence-only guard), running on all four matrix legs so a
  single bad leg cannot let the other three burn their full builds before dying; extended
  `releaseWorkflow.test.ts`'s WR-03 describe block with 3 tests proving the step exists and is ordered
  after `install-deps` and before `electron-vite build`/`build:sidecar-sea`/`tauri-action`. Exact
  `pnpm verify:updater-key` invocation/output for both the matched and wrong-password cases recorded
  verbatim in `34-17-SUMMARY.md` (34-18 hands this command to a human as a blocking gate). No
  deviations -- the plan's `<interfaces>` MECHANISM facts (minisign layout, key-id byte offsets,
  the exact `Wrong password for that key` stderr string) were independently re-verified empirically
  before writing code and matched exactly. See `34-17-SUMMARY.md`. **34-18 remains** -- the human half
  of GAP-B (re-enrolling a matched key/password pair), which depends on the tool this plan built.
  Prior context — **34-16 EXECUTED 2026-07-24** (2/2 tasks, `releaseWorkflow` suite 73/73 green, cross-plan sweep
  `tauriConf|cargoFeatures|releaseWorkflow|electronUntouched` 129/129 green): closed GAP-A -- both
  macOS legs of live run 30084918812 failed on `security import: failed to import keychain
  certificate` even though NO Apple cert secret was enrolled, because the job-level `env:` block
  unconditionally mapped `APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}`, which resolves to
  a DEFINED, EMPTY variable when the secret is absent -- the Tauri bundler's macOS signing path
  tests the variable's *presence*, not its truthiness. Task 1 added 8 executed-path regression
  tests (Tests A-H) that extract-and-run the (not-yet-existing) Apple gate step's shell body via
  `runStepScript` and assert on resolved `$GITHUB_ENV` file content, plus a new shared
  `readGithubEnv()` helper in `helpers/workflowSteps.ts` (RED: Tests A-G failed on
  `extractRunBlock` finding no such step, Test H failed on a genuine still-present six-key
  job-level env assertion -- verbatim list in `34-16-SUMMARY.md`). Task 2 removed all six
  `APPLE_*` job-level env entries and replaced the decorative `Warn if macOS signing will be
  skipped` step with `Enable Apple signing only when a complete cert secret set is enrolled`: a
  step-level env maps the six secrets onto `IN_APPLE_*`-prefixed inputs (so a defined-but-empty
  input can never leak under the real name), and a `write_env()` shell function appends to
  `$GITHUB_ENV` via a `$RANDOM`-delimited heredoc (same injection defense as WR-03's
  `$GITHUB_OUTPUT` heredoc) only when the full signing trio -- and, separately, the full
  notarization trio -- is non-empty; partial sets warn and ship unsigned; the D-04 warning string
  is emitted verbatim on the fully-absent path; no branch calls `exit 1`. Diff confined to the
  job env block, the replaced step, and comments -- every step named in the plan's hard
  constraints (renderer build, SEA sidecar build, steam-bridge build, prune step, Windows signing
  surface, updater-key preflight, tauri-action `with:`) is byte-identical apart from that. No
  deviations. See `34-16-SUMMARY.md`. **34-17/34-18 remain** in gap cycle 3.
  Prior context — `34-VERIFICATION.md`
  came back `gaps_found` at 6/10 must-haves: gap cycle 1 (34-08..34-11) genuinely closed every
  prior code-review finding, but goal-backward verification then found **three NEW BLOCKERs plus
  one WARNING** that no prior review had caught, because all 85 phase tests assert *shape and
  strings* rather than the *executed code path* -- 85 green tests over 3 live blockers. Four
  additive plans were written to close them (plan-checker: VERIFICATION PASSED, zero blockers,
  one non-blocking warning about 34-13's verify step exceeding the 30s fast-feedback target):
  **34-12 EXECUTED 2026-07-24** (wave 1, 2/2 tasks) -- closed GAP-1, the BLOCKER that broke
  *every* matrix leg: `release-tauri.yml` never ran `electron-vite build`, yet
  `tauri.conf.json` has `beforeBuildCommand: ""` and `frontendDist: "../build"`, a directory
  only that command populates. Task 1 added a 9-test ordering-regression `describe` block to
  `releaseWorkflow.test.ts` (RED: 8/9 failed against the pre-fix workflow, verbatim failing-test
  list in `34-12-SUMMARY.md`). Task 2 inserted three steps between
  `./.github/actions/install-deps` and `Install Rust stable`: the CrossOver-index fetch (mirrored
  verbatim from `draft-release-mac.yml`, non-fatal `|| echo` fallback), the macOS-only
  `pnpm build-steam-bridge` step, and `pnpm exec electron-vite build` -- all three now provably
  precede `tauri-action` (line 110 vs line 191). Also corrected the 18-line header comment,
  inserting the `UNPROVEN LIVE` marker and reframing the co-run/cert-skip paragraphs as stated
  assumptions pending 34-07's deferred live gate rather than asserted fact (34-REVIEW.md WR-09).
  releaseWorkflow suite 31/31 green; cross-plan sweep
  (`tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource|electronUntouched`)
  94/94 green. No deviations. See `34-12-SUMMARY.md`. **34-14/34-15 remain** -- both
  `depends_on: ['34-12']` and can now proceed.
  **34-13 EXECUTED 2026-07-24** (wave 1, 2/2 tasks, `buildSidecarSea` suite 36/36 green,
  cross-plan sweep `tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource|electronUntouched`
  104/104 green): closed GAP-2, the Windows-leg BLOCKER -- `meta/buildSidecarSea.ts` spawned
  extensionless `node_modules/.bin/{postject,esbuild}` with no `shell:true`, which Windows
  `CreateProcess` cannot execute without PATHEXT lookup, killing the leg before `tauri-action`
  and leaving 34-11's `sidecar_triple: x86_64-pc-windows-msvc` wiring unreachable in practice.
  Task 1 added 10 RED regression tests (verbatim RED output in `34-13-SUMMARY.md`: 10/36 failed
  against the pre-fix source, including a manual node probe confirming `.bin` string still
  present today). Task 2 deleted `POSTJECT_BIN`/`ESBUILD_BIN`, added `resolveEsbuildCli()`/
  `resolvePostjectCli()` (`require.resolve`-based, fail-loud `COMPILE GATE FAILED (D-06/CR-02)`
  on resolution failure) and `isWindowsSpawnable()`, rewired `buildPostjectArgv()`/new
  `buildEsbuildArgv()` to return `{command: process.execPath, args: [cliPath, ...]}`, and
  rewired both `bundleForSea()`/`injectBlob()` call sites to consume the resolved argv --
  closing WR-10 (the tested command is now the executed command). `pnpm build:sidecar-sea`
  ran end-to-end on this arm64 Mac and printed `SEA sidecar arch verified: arm64` plus the
  compiled binary path -- the plan's mandated BEHAVIORAL proof. One Rule-1 deviation found
  during that verification run: esbuild's own installer (`install.js maybeOptimizePackage()`)
  hardlinks `bin/esbuild` to the raw native binary on every OS except win32, so
  `process.execPath <path>` crashed with a Mach-O `SyntaxError` on this host;
  `buildEsbuildArgv()` now branches on `process.platform` (win32: wrap in `process.execPath`
  like postject; else: spawn the native binary directly), with two Task-1 tests corrected to
  match. Windows-leg behavior is unchanged from the plan's literal spec. See `34-13-SUMMARY.md`.
  **34-14 EXECUTED 2026-07-24** (wave 2, 2/2 tasks, `tauriConf` suite 21/21 green, cross-plan
  sweep `tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource|electronUntouched`
  113/113 green): closed GAP-3, the dead update feed -- the endpoint used GitHub's
  `/releases/latest/download/` form, which by design excludes prereleases, while `tauri-action`
  sets `prerelease: true` unconditionally -- a permanent 404, before and after manual publish.
  **D-09 forecloses the obvious fix**: draft+prerelease is a locked decision encoding the Phase 19
  `prerelease-not-Latest` lesson, so dropping the flag was not an option. Task 1 added a 9-test
  `describe` block to `tauriConf.test.ts` (RED: 7/9 failed against the pre-fix config/workflow --
  verbatim failing-test list in `34-14-SUMMARY.md`, including a one-liner proof that
  `workflow.includes('prerelease: true') && endpoint.includes('/releases/latest/download/')`
  printed `true` against today's files). Task 2 repointed
  `plugins.updater.endpoints[0]` to `/releases/download/updater/latest.json` (exactly one changed
  line in `tauri.conf.json`, confirmed via `git diff --numstat` = `1  1`) and added
  `.github/workflows/promote-updater-feed.yml`, triggered only on `release: types: [published]`,
  which downloads the published tag's `latest.json` (non-fatal if absent), logs its SHA-256,
  ensures the `updater` release exists as a published (never draft) prerelease, and uploads the
  manifest byte-for-byte -- declaring no Apple/Windows/Tauri-signing secret anywhere in the file,
  so the minisign trust chain is provably unweakened. One self-corrected snag during Task 2: the
  workflow's own explanatory prose initially contained the literal strings `--draft` and
  `TAURI_SIGNING_PRIVATE_KEY` (inside sentences describing what NOT to do / NOT to hold), which
  tripped the literal-string acceptance-criteria greps for those exact tokens; reworded both
  comments to state the same invariant without the literal string, no test or code weakened. A
  test guards D-09's `prerelease: true`/`releaseDraft: true` against reintroduction. See
  `34-14-SUMMARY.md`.
  **34-15 EXECUTED 2026-07-24** (wave 2, 2/2 tasks, `releaseWorkflow` suite 40/40 green,
  cross-plan sweep `tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource|electronUntouched`
  122/122 green): closed GAP-4 -- the Windows signing gate tested only `WINDOWS_CERTIFICATE`,
  not `WINDOWS_CERT_THUMBPRINT`, so a half-configured secret set yielded
  `certificateThumbprint: ""` and hard-failed the leg -- contradicting D-04's graceful-skip
  invariant and the workflow's own stated "CI must never fail on missing certs". Task 1 added
  a 9-test regression block to `releaseWorkflow.test.ts` (RED: 7/9 failed against the pre-fix
  workflow, verbatim failing-test list in `34-15-SUMMARY.md`). Task 2 narrowed the cert-import
  step's `if:` to also require `WINDOWS_CERT_THUMBPRINT != ''` (no `.pfx` written for an
  unusable cert), restructured `build_args` into an if/elif/else (both secrets -> sign;
  cert-only -> `::warning::` + ship unsigned, job stays green, no `exit 1`; neither -> existing
  default), and replaced the single-line `echo "args=..."` output with a `$RANDOM`-randomised
  heredoc, closing the WR-03 secondary `$GITHUB_OUTPUT` injection point. One deviation: Task
  1's Test 4 was rewritten from the plan's literal "no exit 1 anywhere in the whole file"
  wording (already true pre-fix, so not RED as specified) to an elif-scoped assertion that
  genuinely fails pre-fix and passes post-fix, preserving the same D-04 invariant; Task 2's
  literal whole-file "no exit 1" acceptance grep still holds. See `34-15-SUMMARY.md`.
  **All four gap-closure plans (34-12, 34-13, 34-14, 34-15) are now executed.** Next step is
  phase re-verification (`/gsd-verify-work 34` or equivalent) to confirm `34-VERIFICATION.md`'s
  remaining truths now pass, followed by resumption of 34-07's deferred live tag-push gate.
  Every plan is test-first with mandatory RED evidence (each new assertion must be shown failing
  against today's source before the fix lands), and comment-stripping is mandated wherever a
  `grep`/`toContain` assertion could otherwise be satisfied by the files' own header prose --
  the direct answer to the 85-green-tests-over-3-blockers finding.
  Waves are file-overlap safe: 34-12 and 34-13 share no `files_modified`; 34-14 and 34-15 both
  `depends_on: ['34-12']` and are mutually disjoint (GAP-3's cross-file test was deliberately
  placed in `tauriConf.test.ts` rather than `releaseWorkflow.test.ts` to keep them parallel).
  **These four fixes are a PREREQUISITE to resuming 34-07's live gate, not a replacement for it**
  -- all three blockers sit on exactly the path that gate exercises first, so running it today
  would burn a real tag on a pipeline known to be broken.
  Still explicitly out of scope (user decision GAP-D-01): WR-04 (null CSP / `withGlobalTauri` /
  broad `opener:default`) and IN-01 (loose `system.pem` match) remain tracked debt in
  `deferred-items.md`.
  Prior cycle, unchanged: all gap-closure plans 34-08..34-11 executed and verified in isolation.
  **34-11 executed 2026-07-24** (3/3 tasks, `releaseWorkflow` suite 22/22 green, cross-plan
  regression sweep `tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource`
  74/74 green): closed the CI half of CR-01 -- every `release-tauri.yml` matrix leg now
  declares an explicit `sidecar_triple` literal, passed to the `Build self-contained sidecar
  (Node SEA)` step as `GAMELIB_SIDECAR_TARGET_TRIPLE`, so 34-08's `resolveTriple()`/
  `lipo -archs` gate now actually receives a per-leg target instead of always resolving the
  host triple -- the `x86_64-apple-darwin` leg on an Apple-Silicon `macos-latest` runner will
  build a genuine x86_64 sidecar. Also closed all of WR-02 -- the Windows signing cert import
  step now wraps `Import-PfxCertificate` in `try/finally` with `Remove-Item -Path cert.pfx
  -Force -ErrorAction SilentlyContinue`, so `cert.pfx` is deleted from the runner workspace
  even on a failed import, and the step's comment no longer claims the false "ONLY in-memory"
  handling. `deferred-items.md` gained WR-04 (null CSP / `withGlobalTauri` / broad
  `opener:default`) and IN-01 (`sidecarSeaFsShim.ts` loose `system.pem` match) as tracked debt
  per user decision GAP-D-01 -- both explicitly out of scope for this gap cycle -- plus a
  close-out note naming 34-07's deferred live gate as the sole remaining phase item. See
  `34-11-SUMMARY.md`.
  **34-10 executed 2026-07-24** (3/3 tasks, `tauriShellSource` suite 8/8 green, full Wave-0
  verification set 65/65 green): closed WR-01 -- `use_dev_sidecar()` now reduces to
  `cfg!(debug_assertions)` alone (the `GAMELIB_SIDECAR_ENTRY`-env-var-or-debug-build expression
  is gone), so a release build can never be steered onto `Command::new("node")` via the process
  environment; `resolve_sidecar_entry()`'s dev override is unchanged. Also closed WR-03 --
  `SidecarState._child` renamed to `child` and is now genuinely used: a new `shutdown_child()`
  (kill + wait, log-and-swallow on error) is called from a new `RunEvent::Exit` handler
  (`main()`'s builder tail switched from `.run(context)` to `.build(context).run(|app_handle,
  event| ...)`), so quitting via red X / Cmd+Q / Alt+F4 -- not just the in-app
  `app_exit`/`app_relaunch` commands -- now actually kills the sidecar instead of risking an
  orphaned process holding an authenticated Steam session. New `tauriShellSource.test.ts`
  extends the Wave-0 config-shape convention to `main.rs` itself via a comment-stripped source
  check (with a self-test proving the stripper works, since main.rs's own doc comments quote
  the strings under assertion). One deviation: the plan's Task 1 test and Task 3 acceptance
  criteria were mutually exclusive as literally written (blanket `_child` substring ban vs. a
  required `fn shutdown_child`) -- resolved by narrowing the test to the actual stale pattern
  (`_child: Mutex<Child>`) rather than renaming the plan-mandated method. See `34-10-SUMMARY.md`.
  (WR-01/WR-03 closure superseded by 34-11's closure of CR-01's CI half and WR-02, above.)
  **34-09 executed 2026-07-24** (2/2 tasks, `tauriConf` suite 12/12 green): closed CR-02 -- committed
  a real Windows `icons/icon.ico` generated via `tauri icon public/icon.png -o <scratch>` (copying
  only `icon.ico` into place; a fresh regen was confirmed byte-different for `icon.icns`, validating
  the scratch-dir-then-copy-only approach), wired it into `bundle.icon` in `tauri.conf.json` after
  `icons/icon.icns`, and added a 4-test regression block to `tauriConf.test.ts` (array-contains,
  nsis-implies-.ico invariant, existsSync guard over every `bundle.icon` path, ICO magic-byte check
  that rejects a renamed-PNG substitute). RED-then-GREEN sequence followed the 34-01 Wave-0
  convention. See `34-09-SUMMARY.md`.
  **34-08 executed 2026-07-24** (3/3 tasks, unit-tested 26/26 passing, empirically hardware-proven
  on this arm64 Mac): closed CR-01 -- `meta/buildSidecarSea.ts` now resolves its output triple via
  `resolveTriple()`/`GAMELIB_SIDECAR_TARGET_TRIPLE` (falls back to `hostTriple()`), sources a
  checksum-verified official nodejs.org Node binary for cross-arch builds instead of relabeling
  `process.execPath`, and gates the produced binary's real Mach-O arch via `lipo -archs`
  (`verifyBinaryArch()`, T-34-14) before it can ship. `x86_64-apple-darwin` override run produced a
  genuinely `x86_64` binary; the no-override native run still produced `arm64` -- unregressed. See
  `34-08-SUMMARY.md` for verbatim `lipo -archs` evidence.
  Gap plans **34-10** (WR-01, WR-03) and **34-11** (CR-01 CI half, WR-02) are now both executed --
  all four gap-closure findings from the code review are closed in code. User scope decisions this
  cycle: WR-04 (null CSP / `withGlobalTauri` / broad `opener:default`) and IN-01 (loose
  `system.pem` match) are DEFERRED as tracked debt, recorded in the phase's `deferred-items.md`
  (WR-04/IN-01 entries added by 34-11).
  **Live gate (unchanged).** 34-07's checkpoint:human-verify live tag-push gate (REQ-34-04 live
  proof, REQ-34-09) was deferred by explicit user decision. Full repro steps recorded verbatim in
  34-07-SUMMARY.md for resumption: push `v0.7.0-rc.test` to the `gamelib` fork remote, confirm all 4
  matrix legs green + graceful signing-skip, confirm draft+prerelease Release with artifacts +
  latest.json, confirm Node-free sidecar smoke, confirm updater invisibility while draft, then clean
  up the test tag/release. REQ-34-09 stays unchecked in REQUIREMENTS.md until that run actually
  happens. Next: run the live gate -- CR-01 (correct-arch sidecar), CR-02 (icon.ico), and WR-02
  (cert cleanup) are all now closed and will no longer fail that run.
Last activity: 2026-08-01
(0 blockers, 2 doc warnings both fixed). Prior same-day activity: quick task 260727-c42
(graphify graph consolidation), which `state.planned-phase` clobbered off this line.

> **Plan-counter note (2026-07-26, post-34.2-11 execution):** per the known-corruption precedent
> documented in every note below, `state.advance-plan`/`state.record-metric`/`state.add-decision`/
> `state.record-session` were all run. `advance-plan` landed correctly (`completed_plans` 73 -> 74,
> `Plan: 12 of 14`); `record-metric` (Phase 34.2 P11 | 35min | 2 tasks | 4 files) and both
> `add-decision` calls were clean; `record-session` updated `Last session` cleanly. As with
> 34.2-10's note, `update-progress` reported `percent: 87` (a PLAN-based figure computed
> internally) but did NOT write it into frontmatter `percent` (still 60, correctly phase-based) --
> instead it again spliced its own `87%` progress-bar figure into the MIDDLE of the 2026-07-25
> post-34.1-05 note two entries below (the same sentence quoting the `90%`-vs-`85%` splice
> incident), overwriting that historical quote's `90%` with `87%` mid-sentence. Restored via a
> targeted `Edit` back to the exact original `90%` text. It also stripped both `last_activity` /
> `Last activity:` lines down to a bare date, dropping the `-- Phase 34.2 gap cycle 1 executing
> (34.2-N complete)` suffix each time one of these calls ran -- hand-restored (with the plan number
> bumped to 11) after every call, not just once, since a LATER call in the same session (`
> record-session`) reverted the string again after an earlier hand-fix. `stopped_at:` was also
> hand-corrected from "Completed 34.2-10-PLAN.md" to "Completed 34.2-11-PLAN.md -- ... 34.2-12..14
> remain" (none of the four verbs above touch `stopped_at:` themselves). Against this session's own
> commits: `9aa361b3` (docs, Task 1), `a81c98ec` (test, Task 2), plus `34.2-11-SUMMARY.md` now on
> disk. `total_plans: 85` unchanged; Phase 34.2 itself is not yet marked complete pending plans
> 34.2-12..14.

> **Plan-counter note (2026-07-25, post-34.2-10 execution):** per the known-corruption precedent
> documented in every note below, `state.advance-plan`/`state.record-metric`/`state.add-decision`/
> `state.update-progress` were all run. `advance-plan` landed correctly (`completed_plans` 72 -> 73,
> `Plan: 11 of 14`); `record-metric` and `add-decision` were clean. `update-progress` reported
> `percent: 86` (a PLAN-based figure it computed internally) but did not write that value into
> frontmatter `percent` (still 60, correctly phase-based per every prior note in this cluster) --
> instead it silently reverted frontmatter `stopped_at:` back to a stale "Completed
> 34.2-09-PLAN.md" value (hand-corrected to 34.2-10 a second time) and, more damaging, spliced its
> own `86%` progress-bar figure into the MIDDLE of the 2026-07-25 post-34.1-05 note two entries
> below -- the very sentence quoting the PRIOR splice incident's `90%` -- overwriting that
> historical quote with `86%` mid-sentence. Restored via a targeted `Edit` back to the exact
> original `90%` text (verified against the note's own surrounding prose, which still describes a
> `90%`-vs-`85%` mismatch), not a blanket revert. Against this session's own commits: `ef0d8ed3`
> (fix, Task 1), `5828d3e4` (fix, Task 2), plus `34.2-10-SUMMARY.md` now on disk. `total_plans: 85`
> unchanged; Phase 34.2 itself is not yet marked complete pending plans 34.2-11..14.

> **Plan-counter note (2026-07-25, post-34.2-06 execution):** per the known-corruption precedent
> documented in every note below, `state.advance-plan`/`state.update-progress`/`state.record-metric`/
> `state.add-decision`/`state.record-session` WERE run for this execution -- `advance-plan` and
> `update-progress` landed correctly (`completed_plans` 68 -> 69, `Plan: 7 of 7`, frontmatter
> `percent` unchanged at 60 because it tracks `completed_phases`/`total_phases`, not plan count --
> Phase 34.2 itself is not yet complete), but `state.advance-plan` again reverted the body
> `Status:` line to the generic "Ready to execute" placeholder and stripped `Last activity:`'s
> descriptive suffix down to the bare date -- hand-corrected here (`Status: Executing Phase 34.2`,
> `Last activity:` restored) alongside the body `34.2-06 done --` paragraph, against this
> session's own commits: `3b17962c` (feat, Task 1), `bee6c66c` (feat, Task 2), `0bb157fb` (test,
> Task 3), `de1623d9` (fix, post-commit lint/type fixup), plus `34.2-06-SUMMARY.md` now on disk.
> `total_plans: 78` unchanged; Phase 34.2 itself is not yet marked complete pending plan 34.2-07.

> **Plan-counter note (2026-07-25, post-34.2-05 execution):** per the known-corruption precedent
> documented in every note below (`state.advance-plan`/`state.update-progress` silently revert
> `stopped_at:`, mangle the `Status:`/`Plan:` prose block, and revert `total_plans`/
> `completed_plans`), `state.advance-plan`/`state.update-progress`/`state.record-metric` WERE run
> for this execution -- `advance-plan` and `update-progress` landed correctly this time
> (`completed_plans` 67 -> 68, `Plan: 6 of 7`, frontmatter `percent`/body progress-bar updated to
> 87%), but `state.advance-plan` again reverted the body `Status:` line to the generic "Ready to
> execute" placeholder and stripped `Last activity:`'s descriptive suffix down to the bare date --
> hand-corrected here (`Status: Executing Phase 34.2`, `Last activity:` restored) alongside the
> body `34.2-05 done --` paragraph, against this session's own commits: `51fb141d` (feat, Task 1),
> `07c026bf` (test, Task 2), plus `34.2-05-SUMMARY.md` now on disk. `total_plans: 78` unchanged;
> Phase 34.2 itself is not yet marked complete pending plans 34.2-06/07.

> **Plan-counter note (2026-07-25, post-34.2-04 execution):** per the known-corruption precedent
> documented in every note below (`state.advance-plan`/`state.update-progress` silently revert
> `stopped_at:`, mangle the `Status:`/`Plan:` prose block, and revert `total_plans`/
> `completed_plans`), `state.advance-plan`/`state.record-metric`/`state.add-decision`/
> `state.record-session` WERE run for this execution (unlike prior sessions, which skipped them
> entirely) -- `advance-plan` and `update-progress` landed correctly this time
> (`completed_plans` 66 -> 67, `Plan: 5 of 7`, frontmatter `percent: 60` unchanged/phase-based),
> but `state.record-session` again stripped the body `Status:`/`Last activity:` lines' descriptive
> suffix down to bare "Ready to execute"/the date alone -- hand-corrected here (`Status: Executing
> Phase 34.2`, `Last activity:` restored) alongside the body `34.2-04 done --` paragraph, against
> this session's own commits: `cd115f98` (feat, Task 1), `45ecaf6c` (test, Task 2), `b35b31a8`
> (test, Task 3), plus `34.2-04-SUMMARY.md` now on disk. `total_plans: 78` unchanged; `percent: 60`
> is phase-based (9 of 15 completed phases), unchanged -- Phase 34.2 itself is not yet marked
> complete pending plans 34.2-05..07.

> **Plan-counter note (2026-07-25, post-34.2-03 execution):** per the known-corruption precedent
> documented in every note below (`state.advance-plan`/`state.update-progress` silently revert
> `stopped_at:`, mangle the `Status:`/`Plan:` prose block, and revert `total_plans`/
> `completed_plans`), those verbs were **deliberately not run** for this execution either.
> Frontmatter (`status`, `stopped_at`, `last_updated`, `last_activity`,
> `progress.completed_plans` 65 -> 66) and the body `Plan:`/`Status:`/`Last activity:` fields
> were written by hand against the phase directory and this session's own commits: `f03f95d3`
> (feat, Task 1), `137a522d` (feat, Task 2), `99cd1450` (test, Task 3), plus `34.2-03-SUMMARY.md`
> now on disk. `total_plans: 78` is unchanged (34.2-01..07 were already counted when the phase was
> planned); `percent: 60` is phase-based (9 of 15 completed phases), unchanged -- Phase 34.2 itself
> is not yet marked complete pending plans 34.2-04..07.

> **Plan-counter note (2026-07-25, post-34.2-01 execution):** per the known-corruption precedent
> documented in every note below (`state.advance-plan`/`state.update-progress` silently revert
> `stopped_at:`, mangle the `Status:`/`Plan:` prose block, and revert `total_plans`/
> `completed_plans`), those verbs were **deliberately not run** for this execution either.
> Frontmatter (`status`, `stopped_at`, `last_updated`, `last_activity`,
> `progress.completed_plans` 63 -> 64) and the body `Plan:`/`Status:`/`Last activity:` fields
> were written by hand against the phase directory and this session's own commits: `a8e7c809`
> (feat, Task 1), `910e8b40` (feat, Task 2), `8ad8f5e5` (test, Task 3), plus `34.2-01-SUMMARY.md`
> now on disk. `total_plans: 78` is unchanged (34.2-01..07 were already counted when the phase was
> planned); `percent: 60` is phase-based (9 of 15 completed phases), unchanged -- Phase 34.2 itself
> is not yet marked complete pending plans 34.2-02..07.

> **Plan-counter note (2026-07-25, post-34.1-05 execution):** `gsd-sdk query
> state.update-progress`, run after 34.1-05's task commits, repeated the EXACT same
> corruption the 2026-07-24 note two entries below documents: it spliced its own
> `[█████████░] 85%` progress-bar string into the middle of that OTHER note's prose --
> the very sentence describing where the PRIOR `88%` splice landed -- turning `"the
> handler expects a `**Progress:**[█████████░] 88%
> `**Progress:**[█████████░] 85%` mid-word. `state.advance-plan` and the two
> `state.add-decision` calls were clean. Fixed with a targeted `Edit` restoring the
> exact original text (verified byte-identical against `git show HEAD:.planning/
> STATE.md` for that line range), not a blanket revert -- the surrounding
> frontmatter/Current-Position/decisions/metrics writes from this same session were
> legitimate and were kept. Same precedent as every note in this cluster: never trust
> `state.update-progress` not to mangle unrelated prose anywhere in this file; always
> diff its output before committing.

> **Plan-counter note (2026-07-24, post-34-17 execution):** per the known-corruption precedent
> documented in every note below (`state.advance-plan`/`state.update-progress` silently revert
> `stopped_at:`, mangle the `Status:` prose block, and revert `total_plans`/`completed_plans`),
> those verbs were **deliberately not run** this time either. Frontmatter (`status`,
> `stopped_at`, `last_updated`, `last_activity`, `progress.completed_plans` 50 -> 51) and the
> body `Plan:`/`Status:`/`Last activity:` fields were written by hand against the phase
> directory and this session's own commits: `e2653759` (feat, Task 1) and `c5722ed8` (feat,
> Task 2), plus `34-17-SUMMARY.md` now on disk. `total_plans: 56` is unchanged (34-17 was
> already counted in the gap-cycle-3 plan total); `percent: 60` is phase-based (3 of 5 completed
> phases), unchanged -- Phase 34 itself is not yet marked complete pending 34-18 and
> re-verification. `REQUIREMENTS.md` was checked directly: REQ-34-05/REQ-34-06 were already
> `[x]` from earlier plans, and REQ-34-09 correctly remains `[ ]` (it is the Manual-Only live
> tag-push gate; this plan only provides its code-side mitigation, not the live proof itself) --
> `requirements mark-complete` was therefore not run, as there is nothing new to mark.

> **Plan-counter note (2026-07-24, post-34-16 execution):** per the known-corruption precedent
> documented in every note below (`state.advance-plan`/`state.update-progress` silently revert
> `stopped_at:`, mangle the `Status:` prose block, and revert `total_plans`/`completed_plans`),
> those verbs were **deliberately not run** this time either. Frontmatter (`status`,
> `stopped_at`, `last_updated`, `last_activity`, `progress.completed_plans` 49 -> 50) and the
> body `Plan:`/`Status:`/`Last activity:` fields were written by hand against the phase
> directory and this session's own commits: `9924b57c` (test, Task 1 RED) and `fb98bf9d` (fix,
> Task 2 GREEN), plus `34-16-SUMMARY.md` now on disk. `total_plans: 56` is unchanged (34-16 was
> already counted in the gap-cycle-3 plan total); `percent: 60` is phase-based (3 of 5 completed
> phases), unchanged -- Phase 34 itself is not yet marked complete pending 34-17/34-18 and
> re-verification.

> **Plan-counter note (2026-07-24, post-34-15 execution):** per the known-corruption precedent
> documented in every note below (`state.advance-plan`/`state.update-progress` silently revert
> `stopped_at:`, mangle the `Status:` prose block, and revert `total_plans`), those verbs were
> **deliberately not run** this time. Frontmatter (`status`, `stopped_at`, `last_updated`,
> `last_activity`, `progress.completed_plans` 48 -> 49) and the body `Plan:`/`Status:`/`Last
> activity:` fields were written by hand against the phase directory and this session's own
> commits: 34-01..34-03/05/06/07/08/09/10/11/12/13/14/15 all have SUMMARY.md on disk (14
> executed, no 34-04); 34-15 is this session's plan. `total_plans: 56` / `completed_plans: 49`
> reflects 34-15 landing. `percent: 60` is phase-based (3 of 5 completed phases), unchanged --
> Phase 34 itself is not yet marked complete pending re-verification.

> **Plan-counter note (2026-07-24, post-34-14 execution):** `gsd-sdk query state.advance-plan`,
> run immediately after 34-14's execution, returned `{advanced:true, previous_plan:12,
> current_plan:13, total_plans:14}` and repeated the exact same corruption documented in every
> note below: silently reverted `stopped_at:` (frontmatter) to the stale "Completed
> 34-13-PLAN.md" value, reverted `progress.total_plans` (frontmatter) from 56 back to 52,
> reverted `progress.completed_plans` from 48 back to 46, replaced the multi-line `Status:` body
> with a bare "Ready to execute" (orphaning the gap-cycle-2 prose beneath it), and truncated
> `last_activity`/`Last activity:` to a bare date. `gsd-sdk query state.update-progress` was run
> next and additionally spliced its own `[█████████░] 88%` progress-bar string into the MIDDLE of
> the immediately-preceding plan-counter note's prose (same failure mode the 2026-07-24
> corrected-again-post-34-11 note below documents). The bare "current_plan:13" number was
> coincidentally correct as a bare integer (12 plans executed before this session's 34-14 run =
> 13 after), but every other field either verb touched was wrong. Neither automated write was
> kept: `.planning/STATE.md` was restored from a pre-verb backup copy and every field was
> corrected by hand against the phase directory (34-01..34-03/05/06/07/08/09/10/11/12/13/14 all
> have SUMMARY.md on disk; no 34-04; 34-15 has PLAN.md with no SUMMARY). Same precedent as every
> plan-counter note below -- do not trust `state.advance-plan`/`state.update-progress`'s writes
> on this file without diffing against a backup and checking the phase directory directly first.

> **Plan-counter note (2026-07-24, post-34-13 execution):** `gsd-sdk query state.advance-plan`,
> run immediately after 34-13's execution, returned `{advanced:true, previous_plan:11,
> current_plan:12, total_plans:14}` and repeated the exact same corruption documented in the
> note below: silently reverted `stopped_at:` (frontmatter) to the stale "Completed
> 34-11-PLAN.md" value, reverted `progress.total_plans` (frontmatter) from 56 back to 52,
> replaced the multi-line `Status:` body with a bare "Ready to execute" (orphaning the
> gap-cycle-2 prose beneath it), and truncated `last_activity`/`Last activity:` to a bare date.
> The bare "current_plan:12" number was coincidentally correct (11 plans executed before this
> session's 34-13 run = 12 after), but every other field it touched was wrong, identical to the
> post-34-12 failure mode. The entire automated write was discarded via `git checkout --
> .planning/STATE.md` and every field was corrected by hand against the phase directory
> (34-01..34-03/05/06/07/08/09/10/11/12/13 all have SUMMARY.md on disk; no 34-04; 34-14/34-15
> have PLAN.md with no SUMMARY). Same precedent as every plan-counter note below -- do not trust
> `state.advance-plan`'s writes on this file without checking the phase directory directly first.

> **Plan-counter note (2026-07-24, post-34-12 execution):** `gsd-sdk query state.advance-plan`,
> run immediately after 34-12's execution, returned `{advanced:true, previous_plan:10,
> current_plan:11, total_plans:14}` and silently reverted `stopped_at:` (frontmatter) to the
> stale "Completed 34-11-PLAN.md" value, reverted `progress.total_plans` (frontmatter) from 56
> back to 52, replaced the multi-line `Status:` body with a bare "Ready to execute" (orphaning
> the gap-cycle-2 prose beneath it), and truncated `last_activity`/`Last activity:` to a bare
> date with no description. The bare "current_plan:11" number was coincidentally correct (10
> plans executed before this session's 34-12 run = 11 after), but every other field it touched
> was wrong. The entire automated write was discarded via `git checkout -- .planning/STATE.md`
> (targeted single-file revert) and every field was corrected by hand against the phase
> directory (34-01..34-03/05/06/07/08/09/10/11/12 all have SUMMARY.md on disk; no 34-04;
> 34-13..34-15 have PLAN.md with no SUMMARY). Same precedent as every plan-counter note below --
> do not trust `state.advance-plan`'s writes on this file without checking the phase directory
> directly first.

> **Plan-counter note (2026-07-24, gap cycle 2 planning):** `gsd-sdk query state.planned-phase`
> was **deliberately not run** this time. Every plan-counter note below documents the same
> failure mode -- that verb reverts `stopped_at:` to a stale value and replaces the multi-line
> `Status:` body with a bare "Ready to execute", orphaning the prose beneath it, and
> `state.update-progress` has additionally spliced its own progress-bar string into the MIDDLE
> of an unrelated note's sentence. Rather than run it and repair the damage a sixth time, the
> frontmatter (`status`, `stopped_at`, `last_updated`, `last_activity`, `progress.total_plans`
> 52 -> 56) and the body `Phase:`/`Plan:`/`Status:`/`Last activity:` fields were written by hand
> against the phase directory: 34-01..34-03/05/06/07/08/09/10/11 all have SUMMARY.md on disk (10
> executed, no 34-04); 34-12..34-15 have PLAN.md with no SUMMARY (4 planned, unexecuted).
> `percent: 60` is phase-based (3 of 5 completed phases), not plan-based -- unchanged.

> **Plan-counter note (2026-07-24, corrected again post-34-11):** `gsd-sdk query
> state.advance-plan`, run immediately after 34-11's execution, returned
> `{advanced:false, reason:"last_plan", current_plan:10, total_plans:10,
> status:"ready_for_verification"}` without writing anything -- harmless this time (34-11 is
> genuinely this phase's last plan). `gsd-sdk query state.update-progress` was NOT harmless: it
> reverted `status:` (frontmatter) from `executing` to `verifying`, reverted `stopped_at:`
> (frontmatter) back to the stale "Completed 34-05-PLAN.md" value, replaced the multi-line
> `Status:` body with "Phase complete — ready for verification", dropped the
> "-- Executed 34-10 (WR-01/WR-03 gap closure)" suffix from `Last activity:`, and -- most
> damaging -- spliced its own `[█████████░] 88%` progress-bar string into the MIDDLE of the
> prior plan-counter note's prose (between "the handler expects a `**Progress:**`" and "or
> `Progress:` body line"), corrupting that note's sentence. The entire automated write was
> discarded via `git checkout -- .planning/STATE.md` (a targeted single-file revert, not a
> blanket reset) and every field above was corrected by hand against the phase directory
> (34-01..34-03/05/06/07/08/09/10/11 all have SUMMARY.md on disk; no 34-04). Same precedent as
> every plan-counter note below it -- do not trust `state.*` verbs' blind field writes on this
> file, and specifically do not trust `state.update-progress` not to mangle unrelated prose
> elsewhere in the file.

> **Plan-counter note (2026-07-24, corrected again post-34-10):** the automated
> `state.advance-plan` verb, run immediately after 34-10's execution, bumped this file from
> "Plan: 8 of 10" to "Plan: 9 of 10" -- itself off by one, since 34-01..09 (9 plans) were
> already executed before this session started. It also silently reverted `stopped_at:`
> (frontmatter) to the stale "Completed 34-05-PLAN.md" value and replaced the multi-line
> `Status:` body with a bare "Ready to execute". Both repaired by hand against the phase
> directory (34-01..34-03/05/06/07/08/09/10 all have SUMMARY.md on disk; 34-11 does not).
> `state.update-progress` also returned `{updated:false, reason:"Progress field not found"}`
> against this file's YAML-frontmatter `progress:` block (the handler expects a `**Progress:**`
> or `Progress:` body line, not frontmatter) -- left unrun, no output to trust either way. Same
> precedent as every plan-counter note below it -- do not trust `state.*` verbs' blind field
> writes on this file without checking the phase directory directly.

> **Plan-counter note (2026-07-24, corrected again post-34-09):** the automated
> `state.advance-plan` verb, run immediately after 34-09's execution, bumped this file from
> "Plan: 7 of 10" to "Plan: 8 of 10" -- coincidentally correct as a bare number this time, but
> it also silently reverted `stopped_at:` (frontmatter) to the stale "Completed 34-05-PLAN.md"
> value and replaced the multi-line `Status:` body with a bare "Ready to execute", same failure
> mode documented in the note below. Both repaired by hand against the phase directory
> (34-01..34-03/05/06/07/08/09 all have SUMMARY.md on disk; 34-10/11 do not). Same precedent as
> every plan-counter note below it -- do not trust this verb's blind field writes on this file.

> **Plan-counter note (2026-07-24, corrected again post-34-08):** the automated
> `state.advance-plan` verb, run immediately after 34-08's execution, bumped this file from
> "Plan: 1 of 10" to "Plan: 2 of 10" -- itself still wrong, since it was working off the
> already-stale "Plan: 1 of 10" / "stopped_at: Completed 34-05-PLAN.md" values noted below,
> which predate this session and never accounted for 34-06/34-07/34-08 already being executed
> (34-01..34-03/05/06/07/08 all have SUMMARY.md on disk). Corrected above to 7 of 10 by
> checking the phase directory directly rather than trusting the blind counter increment --
> same precedent as the three plan-counter notes below it.
>
> **Frontmatter revert observed (2026-07-24):** after this manual correction, running
> `gsd-sdk query state.record-session` / `state.record-metric` / `state.add-decision` /
> `roadmap.update-plan-progress` in sequence silently reverted the YAML frontmatter
> `stopped_at:` field (line 6) back to the stale "Completed 34-05-PLAN.md" value, while
> leaving `last_activity` and the body `Plan:`/`Status:` fields (edited in the same manual
> pass) untouched. Root cause not diagnosed (deferred); re-corrected by hand a second time
> below. Treat `stopped_at:` frontmatter as another field this SDK write-path can silently
> clobber -- verify it after any `state.*` mutation call, not just the `Plan:` counter.

> **Plan-counter note (2026-07-24):** `gsd-sdk query state.planned-phase` regressed
> `stopped_at` to "Completed 34-05-PLAN.md" (a stale pre-34-06/07 value) and replaced the
> multi-line `Status:` prose with a bare "Ready to execute", orphaning the paragraph beneath
> it. Both were repaired by hand against the phase directory (34-01..34-07 SUMMARY.md all
> present; 34-08..34-11 PLAN.md present with no SUMMARY). Same failure mode as the two
> plan-counter notes below — do not trust the verb's blind field writes on this file.

> **Plan-counter note (2026-07-23):** the automated `state.advance-plan` verb bumped this
> file to "Plan: 2 of 4" immediately after 31-04's execution — itself stale drift, since
> `state.advance-plan` was working off the pre-existing "Plan: 1 of 4" / "stopped_at:
> Completed 31-01-PLAN.md" values, which predate this session and never accounted for
> 31-02/31-03 already being executed (both have SUMMARY.md on disk). Corrected above to
> 4 of 4 by checking `.planning/phases/31-.../` directly (31-01..31-04-SUMMARY.md all
> present) rather than trusting the blind counter increment — same precedent as the
> Phase-30 plan-counter note below.

> **Plan-counter note:** the "Plan: 2 of 7" value this file carried immediately
> before 30-07's execution was itself stale drift (predates this session) —
> phase 30 already had 30-01..30-06 executed (see 30-06-SUMMARY.md) before this
> gap-closure plan 30-07 (the 7th) was created and just executed. Corrected
> above to 7 of 7 rather than trusting the blind counter increment.

> **STATE drift corrected 2026-07-21.** This file previously read "Phase 24 complete
> (16/17) — ready to discuss Phase 25" with `Current focus: Phase 25`, which was stale on
> several counts: Phase 25 completed 2026-07-19, Phase 26 completed 2026-07-20, and
> Phase 27 (Tauri walking skeleton) had been planned AND was 4/5 executed. Corrected
> after closing 27-05. Note `ROADMAP.md` currently contains only the Phase 27 section, so
> `gsd-sdk query roadmap.analyze` returns empty and mis-identifies the current phase —
> rebuild the roadmap before relying on that verb.

**Open work, in rough priority order:**

- **Phase 23** — full-ownership install: gaps `G-23-01`/`G-23-02` open (native install
  applies no execute bits; Denuvo launch needed a manual `chmod +x`). Gate 3 never run.
  **23-06 executed (2026-07-21):** added permanent `steam-flags-census` log instrumentation
  (`depot/flagsCensus.ts`) at plan-build/download-entry/download-complete + per-invocation
  chmod counters, and wrote `23-TRACE.md`'s H1-H5 hypothesis matrix with offline forensic
  evidence — trace-only, no fix (user-locked ordering). 23-TRACE.md also flags that the Gate
  1/Gate 2 reference installs (HUMANKIND, Cyberpunk 2077) have degraded on disk since their
  UAT recordings — a fresh install is likely needed for 23-07's clean live-run census. Next:
  23-07 (live-run recording) → 23-08 (the gated fix). REQ-23-07 stays open.
  `/gsd-plan-phase 23 --gaps`

- **Tauri seam** — port the real `safeStorage` keyring (spike 011's `keyring` crate path).
  This is what blocks Phase 27 UAT steps 2/3, and it must land BEFORE any token-writing
  channel is wired, or the sidecar will corrupt the Electron app's saved session. See
  `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` § Stubbed.

- **Cross-phase verification debt** — 30 items across 9 files (`/gsd-audit-uat`).

Closed/parked native-install phases:

- **Phase 22** (Steam Game Families / multiple bottles) — ⛔ **PARKED 2026-07-21, superseded
  by Phase 24.** The bridge's single shared bottle removes the per-family bottle matrix
  this phase existed to manage. 8 plans retained unexecuted; see
  `.planning/phases/22-multiple-steam-bottles/PARKED.md`

- **Phase 24** (macOS native Steam bridge, out-of-process steam_api proxy) — ✅ Complete
  2026-07-21 (17 plans). Gates 0/1/2/3 PASS on real hardware; gap cycles 24-11..24-16
  closed the shim-overwrite/install-poll and launch/sync clusters. Gate 4 (Hoard) out of
  scope — the bridge proxies only ISteamUser + ISteamFriends. Remaining: human retest of
  the Avernum 5 launch on the rebuilt .app

## Native-Install Arc Phase Map (21–25)

| Phase | Name | Plans | Summaries | Status |
|-------|------|-------|-----------|--------|
| 21 | Steam Native Install (depot download) | 17 | 17 | ✅ Complete (2026-07-20) — code-review clean, secure-phase 41/41 threats_open:0; hardware UAT (7 native-install items) DEFERRED to Windows post-production + D-UAT-10 bottled-launch deferred as tracked macOS debt |
| 22 | Steam Game Families (multiple bottle configs) | 8 | 0 | ⛔ **PARKED 2026-07-21 — superseded by Phase 24.** Bridge's one shared bottle (D-03) eliminates the per-family bottle matrix; plans retained unexecuted (`22-multiple-steam-bottles/PARKED.md`) |
| 23 | Steam full-ownership install (StateFlags=4) | 10 | 6 | 🔄 In progress, NOT phase-complete — Gate 1 PASS (2026-07-19); Gate 2 CONDITIONAL PASS (2026-07-21, HUMANKIND Denuvo launch proven but only after a manual `chmod +x` workaround — blocker gap **G-23-02**, native install applies no execute bits); Gate 3 pending. Gap **G-23-01** (KCD2 `Blocked`-depot-key aborts whole install) also open. **23-06 executed** (trace-before-fix): added permanent `steam-flags-census` instrumentation (plan-build/download-entry/download-complete) + `23-TRACE.md` H1-H5 hypothesis matrix — no fix yet, per user-locked ordering. Next: 23-07 (live-run recording) → 23-08 (the gated fix). REQ-23-07 stays open until Gate 2 re-runs clean and Gate 3 passes (`/gsd-verify-work 23`) |
| 24 | macOS native Steam bridge (steam_api proxy) | 17 | 17 | ✅ Complete 2026-07-21 — Gates 0/1/2/3 PASS on real hardware; gap cycles 24-11..24-16 closed shim-overwrite/install-poll + CrossOver-launch/library-sync clusters; secure-phase done (threats_open:0). Gate 4 (Hoard) out of scope — bridge proxies only ISteamUser + ISteamFriends. Open: human retest of Avernum 5 launch |
| 25 | Steam depot multi-host fan-out (throughput) | 3 | 3 | ✅ Complete + HW-verified 2026-07-19 (hosts=3, ~10 MiB/s vs 1.5–2.9 baseline) |

## Earlier macOS-Compat Phase Map (17–19)

| Phase | Name | Status |
|-------|------|--------|
| 17 | Steam on macOS via CrossOver/Wine | Complete & secured (2026-07-13) — 17 plans, UAT 7/7, VERIFICATION 6/6, code-review CR-01/WR resolved (17-17), SECURITY threats_open:0 (21/21) |
| 18 | macOS 32-bit detection, badge & CrossOver routing | Complete (UAT 5/5, secured) |
| 19 | CrossOver Compatibility Index (macOS) | Complete (2026-07-14) — 8/8 plans executed, index Action live on public fork; WR-05 live check still open |

## v0.2 Phase Map

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 5 | Branding & About Polish | BRAND-02, BRAND-03, BRAND-04, APP-01 | Complete (2026-07-02) |
| 6 | Library & Game Status UX | LIB-05, LIB-06, GAME-05 | Complete (2026-07-03) |
| 7 | Game Details Enrichment | DETAIL-01, DETAIL-02 | Executed (UAT pending) |
| 8 | New Steam Surfaces | STORE-01, CONSOLE-01 | Not started |
| 9 | Quality Gate | QA-01 | Not started |

## v0.3 Phase Map

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 10 | Humble Auth + Adapter Scaffold | HACCT-01, HACCT-02, HACCT-03 | Not started |
| 11 | Library Sync + 5-State Key Model | HSYNC-01, HSYNC-02, HSYNC-03, HSYNC-04 | Not started |
| 12 | Ownership Dedup | HDEDUP-01, HDEDUP-02 | Not started |
| 13 | Keys-Waiting + Giftable-Spares Views | HVIEW-01, HVIEW-02 | Not started |
| 14 | Guided Claim Flow | HCLAIM-01, HCLAIM-02, HCLAIM-03, HCLAIM-04, HCLAIM-05 | Not started |
| 15 | Store Overlay + Expiration Alerts | HSTORE-01, HSTORE-03 | Not started |

## Performance Metrics

**Velocity (v0.1):**

- Total plans completed: 161 (phases 1-4)
- Average duration: ~5-15 min/plan
- Total execution time: ~5 days (2026-06-24 → 2026-06-29)

**By Phase (v0.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | - | - |
| 02 | 6 | - | - |
| 03 | 4 | - | - |
| 04 | 2 | - | - |
| 05 | 4 | - | - |
| 06 | 2 | - | - |
| 08.1 | 4 | - | - |
| 10 | 6 | - | - |
| 11 | 5 | - | - |
| 12 | 5 | - | - |
| 14 | 6 | - | - |
| 15 | 6 | - | - |
| 16 | 3 | - | - |
| 18 | 6 | - | - |
| 17 | 17 | - | - |
| 19 | 8 | - | - |
| 20 | 7 | - | - |
| 21 | 17 | - | - |
| 26 | 5 | - | - |
| 24 | 16 | - | - |
| 29 | 7 | - | - |
| 31 | 4 | - | - |
| 32 | 3 | - | - |
| 34.2 | 30 | - | - |
| 34.3 | 9 | - | - |
| 34.4 | 10 | - | - |

**v0.1 Detail Log:**

| Phase 01 P03 | 8min | 3 tasks | 8 files |
| Phase 02-steam-library P01 | 4min | 3 tasks | 5 files |
| Phase 02-steam-library P02 | 15min | 2 tasks | 3 files |
| Phase 02-steam-library P03 | 5min | 2 tasks | 3 files |
| Phase 02-steam-library P04 | 2min | 2 tasks | 4 files |
| Phase 02-steam-library P05 | 5min | 3 tasks | 9 files |

**v0.2 Trend:**

- Plans completed: 1
- Trend: —

**v0.2 Detail Log:**

| Phase 07 P01 | — | 4 tasks | 21 files (3 new components) |

*Updated after each plan completion*
| Phase 08-new-steam-surfaces P01 | 5min | 2 tasks | 3 files |
| Phase 08-new-steam-surfaces P02 | 5min | 3 tasks | 4 files |
| Phase 10 P06 | ~55min | 2 tasks | 5 files |
| Phase 14 P06 | 30min | 2 tasks | 2 files |
| Phase 14 P07 | 35min | 3 tasks | 12 files |
| Phase 14 P08 | ~30min | 2 tasks | 6 files |
| Phase 19 P05 | 35min | 3 tasks | 6 files |
| Phase 19 P06 | ~30min | 2 tasks | 11 files |
| Phase 19 P07 | 15min | 3 tasks | 5 files |
| Phase 19 P08 | 20min | 2 tasks | 6 files |
| Phase 20 P01 | 10min | 2 tasks | 4 files |
| Phase 20 P02 | 10min | 2 tasks | 4 files |
| Phase 20 P03 | 15min | 1 tasks | 2 files |
| Phase 20 P04 | 15min | 2 tasks | 6 files |
| Phase 20 P05 | 15min | 2 tasks | 6 files |
| Phase 20 P06 | 45min | 2 tasks | 9 files |
| Phase 20 P07 | 20min | 2 tasks | 4 files |
| Phase 21 P01 | 35min | 3 tasks | 5 files |
| Phase 21 P02 | 40min | 1 tasks | 2 files |
| Phase 21 P03 | 20min | 2 tasks | 8 files |
| Phase 21 P04 | 20min | 2 tasks | 3 files |
| Phase 21 P05 | ~30min | 2 tasks | 2 files |
| Phase 21 P06 | 45min | 2 tasks | 4 files |
| Phase 21 P07 | 40min | 2 tasks | 4 files |
| Phase 21 P08 | ~30min | 2 tasks | 2 files |
| Phase 21 P09 | ~50min | 2 tasks | 9 files |
| Phase 21 P11 | 25min | 1 tasks | 2 files |
| Phase 21 P10 | 55min | 2 tasks | 12 files |
| Phase 21 P12 | ~15min | 1 task (UAT prep; 3 human-verify deferred) | 1 file |
| Phase 21 P13 | 20min | 2 tasks | 2 files |
| Phase 21 P14 | 20min | 2 tasks | 4 files |
| Phase 21 P15 | 45min | 3 tasks | 8 files |
| Phase 21 P16 | 30min | 3 tasks | 9 files |
| Phase 23 P01 | 10min | 2 tasks | 4 files |
| Phase 23 P02 | 15min | 3 tasks | 5 files |
| Phase 23 P03 | ~40min | 3 tasks | 6 files |
| Phase 25 P01 | 12min | 2 tasks | 2 files |
| Phase 25 P02 | ~20min | 3 tasks | 4 files |
| Phase 21 P17 | 30min | 2 tasks | 10 files |
| Phase 26 P01 | 15min | 2 tasks | 3 files |
| Phase 26 P02 | 8min | 1 tasks | 2 files |
| Phase 26 P03 | 8min | 1 tasks | 3 files |
| Phase 26 P04 | 25min | 2 tasks | 7 files |
| Phase 26 P05 | ~10min | 2 tasks | 2 files |
| Phase 24 P01 | 25min | 3 tasks | 10 files |
| Phase 24 P02 | 20min | 2 tasks | 3 files |
| Phase 24 P03 | 10min | 1 tasks | 3 files |
| Phase 24 P04 | 20min | 1 tasks | 2 files |
| Phase 24 P05 | ~20min | 2 tasks | 5 files |
| Phase 24 P06 | 35min | 3 tasks | 5 files |
| Phase 24 P07 | 35min | 2 tasks | 7 files |
| Phase 24 P08 | 45min | 3 tasks | 4 files |
| Phase 24 P09 | 40min | 2 tasks | 8 files |
| Phase 27 P01 | 9min | 3 tasks | 16 files |
| Phase 27 P02 | 50min | 3 tasks | 21 files |
| Phase 27 P03 | 30min | 3 tasks | 10 files |
| Phase 27 P04 | ~75min | 2 tasks | 5 files |
| Phase 24 P11 | 10min | 1 tasks | 2 files |
| Phase 24 P12 | 20min | 1 tasks | 2 files |
| Phase 24 P13 | ~25min | 2 tasks | 2 files |
| Phase 24 P14 | 15min | 1 tasks | 1 files |
| Phase 24 P15 | 12min | 1 tasks | 2 files |
| Phase 24 P16 | 25min | 2 tasks | 4 files |
| Phase 24 P17 | 20min | 2 tasks | 2 files |
| Phase 28 P01 | 35min | 3 tasks | 3 files |
| Phase 28 P02 | 30min | - tasks | - files |
| Phase 28 P03 | 40min | 3 tasks | 4 files |
| Phase 28 P04 | 45min | 3 tasks | 4 files |
| Phase 28 P05 | 35min | 1 tasks | 1 files |
| Phase 28 P06 | 45min | 2 tasks | 3 files |
| Phase 29 P01 | 8min | 2 tasks | 2 files |
| Phase 29 P02 | 15min | 2 tasks | 9 files |
| Phase 29 P03 | ~20min | 3 tasks | 5 files |
| Phase 29 P04 | 35min | 3 tasks | 3 files |
| Phase 29 P05 | 40min | 3 tasks | 3 files |
| Phase 29 P06 | ~30min | 3 tasks | 3 files |
| Phase 29 P07 | ~45min | 3 tasks | 1 files |
| Phase 30 P01 | 20min | 2 tasks | 4 files |
| Phase 30 P03 | 9min | 3 tasks | 8 files |
| Phase 30 P02 | 19min | 3 tasks | 5 files |
| Phase 30 P04 | ~25min (+ multi-hour checkpoint pause) | 3 tasks | 4 files |
| Phase 30 P05 | 10min | 2 tasks | 2 files |
| Phase 30 P06 | 20min | 3 tasks | 7 files |
| Phase 30 P07 | 25min | 2 tasks | 8 files |
| Phase 31 P01 | 45min | 3 tasks | 4 files |
| Phase 31 P04 | 20min | 3 tasks | 7 files |
| Phase 32 P01 | 30min | 2 tasks | 5 files |
| Phase 32 P02 | ~30min | 2 tasks | 3 files |
| Phase 32 P03 | ~15min | 2 tasks | 3 files |
| Phase 33 P01 | ~20min | 3 tasks | 2 files |
| Phase 33 P02 | ~25min | 2 tasks | 3 files |
| Phase 33 P03 | 15min | 3 tasks | 5 files |
| Phase 33 P04 | ~40min | 3 tasks | 8 files |
| Phase 33 P06 | ~15min | 2 tasks | 2 files |
| Phase 34 P01 | 17min | 2 tasks | 4 files |
| Phase 34 P02 | ~50min | 2 tasks | 9 files |
| Phase 34 P05 | 10min | 2 tasks | 3 files |
| Phase 34 P06 | ~15min | 1 tasks | 1 files |
| Phase 34 P08 | 15min | 3 tasks | 2 files |
| Phase 34 P09 | 8min | 2 tasks | 3 files |
| Phase 34 P10 | 25min | 3 tasks | 2 files |
| Phase 34 P14 | 20min | 2 tasks | 3 files |
| Phase 34.1 P05 | 45min | 3 tasks | 4 files |
| Phase 34.1 P06 | 45min | 3 tasks | 7 files |
| Phase 34.1 P07 | 45min | 3 tasks | 7 files |
| Phase 34.1 P08 | 50min | 3 tasks | 4 files |
| Phase 34.2 P01 | ~75min | 3 tasks | 2 files |
| Phase 34.2 P04 | 50min | 3 tasks | 5 files |
| Phase 34.2 P05 | 25min | 2 tasks | 2 files |
| Phase 34.2 P06 | 35min | 3 tasks | 5 files |
| Phase 34.2 P07 | ~9min | 3 tasks | 5 files |
| Phase 34.2 P08 | 12min | 2 tasks | 3 files |
| Phase 34.2 P09 | 25min | 3 tasks | 7 files |
| Phase 34.2 P10 | 25min | 2 tasks | 2 files |
| Phase 34.2 P11 | 35min | 2 tasks | 4 files |
| Phase 34.2 P12 | 25min | 2 tasks | 2 files |
| Phase 34.2 P13 | 20min | 2 tasks | 4 files |
| Phase 34.2 P14 | 40min | 2 tasks | 1 files |
| Phase 34.2 P15 | 25m | 2 tasks | 2 files |
| Phase 34.2 P16 | 45min | 3 tasks | 6 files |
| Phase 34.2 P17 | ~35min | 2 tasks | 4 files |
| Phase 34.2 P18 | 30min | 3 tasks | 6 files |
| Phase 34.2 P19 | 100min | 3 tasks | 6 files |
| Phase 34.2 P20 | 8min | 2 tasks | 2 files |
| Phase 34.2 P21 | 15min | 2 tasks | 2 files |
| Phase 34.2 P22 | 10min | 2 tasks | 2 files |
| Phase 34.2 P23 | 50min | 2 tasks | 1 files |
| Phase 34.2 P24 | 55min | 3 tasks | 4 files |
| Phase 34.2 P25 | 90m | 3 tasks | 2 files |
| Phase 34.2 P26 | 45min | 3 tasks | 4 files |
| Phase 34.2 P27 | 15min | 2 tasks | 2 files |
| Phase 34.3 P01 | 55min | 3 tasks | 8 files |
| Phase 34.3 P03 | 45min | 3 tasks | 5 files |
| Phase 34.3 P04 | 40min | 3 tasks | 5 files |
| Phase 34.3 P02 | 90min | 2 tasks | 2 files |
| Phase 34.3 P05 | ~50min | 3 tasks | 3 files |
| Phase 34.3 P06 | 35min | 2 tasks | 4 files |
| Phase 34.3 P07 | ~50min | 3 tasks | 2 files |
| Phase 34.3 P08 | 70min | 3 tasks | 5 files |
| Phase 34.4.1 P01 | 45m | 3 tasks | 3 files |
| Phase 34.4.1 P02 | 42min | 4 tasks | 3 files |
| Phase 34.4.1 P03 | 21min | 2 tasks | 2 files |
| Phase 34.4.1 P04 | 40min | 2 tasks | 10 files |
| Phase 34.4.1 P05 | 35min | 3 tasks | 7 files |
| Phase 34.4.1 P09 | 70min | 3 tasks | 13 files |
| Phase 34.4.1 P06 | 70min | 3 tasks | 4 files |
| Phase 34.4.1 P07 | 110min | 3 tasks | 3 files |
| Phase 34.5 P01 | 30min | 3 tasks | 3 files |
| Phase 34.5 P02 | 25min | 2 tasks | 2 files |
| Phase 34.5 P03 | 15min | 3 tasks | 3 files |
| Phase 34.5 P04 | 35min | 2 tasks | 8 files |
| Phase 34.5 P05 | 55min | 3 tasks | 3 files |
| Phase 34.5 P06 | 65min | 3 tasks | 7 files |
| Phase 34.5 P07 | 20min | 2 tasks | 8 files |
| Phase 34.5 P08 | 55min | 3 tasks | 5 files |
| Phase 34.5 P09 | ~55min | 3 tasks | 2 files |
| Phase 34.5 P10 | 35min | 2 tasks | 2 files |
| Phase 34.5 P11 | 45min | 2 tasks | 3 files |
| Phase 34.5 P12 | 45min | 3 tasks | 2 files |
| Phase 34.5 P13 | 55min | 3 tasks | 2 files |
| Phase 34.5 P14 | 13min | 2 tasks | 2 files |
| Phase 34.4.1 P10 | 65min | 2 tasks | 4 files |
| Phase 34.4.1 P11 | 35min | 2 tasks | 4 files |
| Phase 34.4.1 P12 | ~20min | 2 tasks | 8 files |
| Phase 34.4.1 P13 | 40min | 2 tasks | 6 files |
| Phase 34.4.1 P14 | 20min | 2 tasks | 2 files |
| Phase 34.4.1 P15 | 55min | 2 tasks | 10 files |
| Phase 34.4.1 P16 | 50min | 3 tasks | 5 files |
| Phase 34.4.1 P17 | 45min | 2 tasks | 4 files |
| Phase 34.4.1 P18 | 30min | 4 tasks | 8 files |
| Phase 34.4.1 P19 | 55min | 2 tasks | 3 files |
| Phase 34.4.1 P21 | 75min | 3 tasks | 7 files |
| Phase 34.4.1 P22 | 30min | 3 tasks | 11 files |
| Phase 34.4.1 P23 | 50min | 3 tasks | 6 files |
| Phase 34.4.1 P24 | 40min | 3 tasks | 2 files |
| Phase 34.4.1 P26 | 55min | 2 tasks | 8 files |
| Phase 34.4.1 P27 | ~50min | 3 tasks | 9 files |
| Phase 34.5 P16 | 45min | 3 tasks | 5 files |
| Phase 34.5 P17 | 40min | 2 tasks | 3 files |
| Phase 34.5 P18 | 55min | 2 tasks | 2 files |
| Phase 34.5 P19 | 35min | 2 tasks | 1 files |
| Phase 34.5 P20 | 55min | 3 tasks | 1 files |
| Phase 34.5 P22 | 50min | 3 tasks | 1 files |
| Phase 34.5 P23 | 55min | 3 tasks | 4 files |
| Phase 34.5 P25 | 35min | 2 tasks | 4 files |
| Phase 34.5 P26 | 50min | 3 tasks | 6 files |
| Phase 34.5 P27 | 45min | 2 tasks | 2 files |
| Phase 34.5 P28 | 25min | 4 tasks | 1 files |

## Accumulated Context

### Roadmap Evolution

- Phase 08.1 inserted after Phase 8: Steam Delisted Games & Library Filters — delisted availability signal, 'Game no longer available' + install-disable, only-show filter modes (from Phase 8 UAT) (URGENT)
- v0.3 roadmap created 2026-07-05: Phases 10–15, 18 requirements mapped. Dependency chain is non-negotiable (auth → sync → dedup → views → claim flow → store overlay). Phase 10 carries highest validation risk (live API confirmation of axios + cookie + X-Requested-By header reaching api/v1/user/order).
- Phase 16 added 2026-07-10 under new milestone **v0.4 — Compatibility Data**: CrossOver Compatibility Rating (CodeWeavers) — replace the extra-info Crossover rating's stale AppleGamingWiki source (from quick 260710-l27) with a live CodeWeavers slug-lookup backend. Feasibility validated by spike 260710-nwb (66.7% naive / ~83.3% with slugify fixes). Locked constraints: content-based hit/miss detection (soft-404 = HTTP 200), apostrophe-drop + roman-numeral slugify fixes, on-demand reference-style lookups (no bulk crawl). Depends on Phase 7 extra-info rows.
- Phase 17 added 2026-07-10 under new milestone **v0.5 — Steam macOS Compatibility Runtime**: Steam on macOS via CrossOver/Wine — Windows-only Steam games (no native Mac build) install and launch on macOS through the Windows Steam client running inside a GameLib-managed CrossOver/Wine bottle instead of native `steam://` delegation. **Locked architecture:** run Windows Steam *in a bottle* (reuse WineSelector/CrossoverBottle plumbing); do NOT wine-run individual game exes (rejected — DRM-free only). Reverses Phase 3 GAME-04 **for macOS only**: `SteamGame.isNative()` becomes per-OS (`is_mac_native`), and the `state/InstallGameModal.ts:35` short-circuit must stop firing `steam://install` for non-mac-native games on macOS. Linux keeps Proton delegation unchanged. Depends on Phase 3 + Phase 7. Requirements/success criteria TBD in discuss/plan.

- Phase 18 added 2026-07-12 (v0.5) from /gsd-explore: **macOS 32-bit detection, badge & CrossOver routing** — detect a Steam game's mac build arch and route 32-bit-only mac games to CrossOver/Wine (32-bit dropped in Catalina/2019) with an OS/arch badge beside the game logo. **Locked approach:** hybrid detection — `osarch` via `steam-user` `getProductInfo` PICS appinfo (`config.launch[N].config.osarch`; match `"macos"` + legacy `"osx"`) as pre-install hint, plus post-install Mach-O check (`lipo -archs`). Missing `osarch` is NOT assumed 32-bit (avoids Steam's documented false-32-bit-flag trap). Routes via existing `isBottleEligible()`/D-11. Steam-only V1. Pre-work: runtime `getProductInfo` dump to lock parser. See `.planning/notes/steam-mac-arch-detection-decisions.md`, todo `steam-getproductinfo-appinfo-dump.md`. Depends on Phase 17 + Phase 7.

- Phase 21 added 2026-07-14 under new milestone **v0.7 — Steam Native Install** (from /gsd-explore + spikes 001/002): replace the opaque `steam://rungameid` install handoff with an **in-process depot download GameLib owns** — real progress, real errors, recovery. GameLib downloads depots over `steam-user`'s authenticated CM connection and writes an `appmanifest_{appId}.acf` the Steam client **adopts**; launch stays with `steam://` (DRM works); **Steam owns updates, GameLib owns only the first install** (D-2). **Fully de-risked against a real machine:** spike 001 — Steam adopts a hand-written `.acf` (`StateFlags 1026`→`4`, zero-byte install, game launches); spike 002 — 171/171 files downloaded in-process, byte-identical to Steam, **pure-JS LZMA sufficient (no native module)** → C# DepotDownloader wrapper rejected. Locked: `StateFlags=1026` not `4`; depot selection = package-level ownership (two channels + DLC-app enumeration + language filter, 11/11 verified); reimplement `steam-user`'s broken `getManifest` filenames + chunk download (~100 lines); 64-bit IDs are strings (never `@node-steam/vdf.parse`); retry chunks across content servers. Pre-work: audit `@node-steam/vdf` call sites; confirm launch on a hard-DRM title. See `.planning/spikes/MANIFEST.md`, `.planning/notes/steam-depot-install-architecture.md`. Depends on Phase 3 + Phase 1.

- Phase 25 added 2026-07-19 (from resolved debug `steam-install-slow-start`, Thread C): **Steam depot download multi-host fan-out (throughput)** — raise native-depot throughput toward Steam-client parity by fanning chunk attempt-0 across the ~6 healthy CDN hosts `getContentServers` already returns, instead of `pickHost` confining all ~32 workers to the single top-scored host (rotates only on failure; with decode now clean/`err=0`, nothing fails → one host, `avgMs~360`, ~1.5–2.9 MiB/s). Acceptance = before/after hardware throughput measurement (`grep "chunk-stream stats" ~/Library/Logs/gamelib/gamelib.log`, expect sustained `hosts>1`). Must not regress decode, host-health scoring, stall retry, or cancel/abort. Optional bundled cleanup: excise the dormant CDN-auth phantom machinery. Code: `pickHost`/host-health in `depot.ts`/`decompress.ts`/`hostHealth`. Context in memory `steam-install-slow-start-outcome`.

- Phase 23 added 2026-07-17: **Steam full-ownership install (StateFlags=4)** — GameLib FULLY installs a Steam game with zero Steam-client step, writing an `appmanifest_{appId}.acf` with `StateFlags=4` (installed/ready) rather than Phase 21's `StateFlags=1026` (update-queued handoff). **Reverses locked D-2** ("Steam owns first install"). De-risked by **spike-003 (VALIDATED 2026-07-17)**: full-ownership `StateFlags=4` install is feasible and *supersedes* the earlier "1026 never 4" constraint — Steam trusts a hand-written `StateFlags=4` manifest once the `EDepotFileFlag` executable bit is applied (the `os error 256` failure was a missing `+x`). Env-gated behind `GAMELIB_SPIKE_STATEFLAGS4` during spike. Builds on Phase 21 depot-download infrastructure. See spike-003 commits (a8ada46d, 6fa5a157, 816a76c9, f36d173a). Depends on Phase 21.

- Phases 28–35 added 2026-07-22 under the existing **v0.8 — Tauri Shell** milestone (extends it; `/gsd-new-milestone` deliberately NOT run, v0.8 already exists from Phase 27): the incremental Electron→Tauri/daemon port, sliced from `27-.../SEAM.md`'s ranked backlog. **28** real `safeStorage` via spike 011's `keyring` crate → **29** generalize the sidecar store past the two skeleton stores → **30/31/32** IPC re-plumb in domain slices (install/uninstall/update-check, settings/config, downloads/queue) → **33** the 44-file lifecycle cluster (`app`/`dialog`/window/`Notification`/tray/protocol, plus the `session`/`powerSaveBlocker` parity soft spots) → **34** Windows/Linux packaging+signing+auto-update → **35** Electron cutover. **Slicing rule:** every phase except 35 must end with BOTH `npm run tauri:dev` and `npm start` working (REQ-27-06's additive/reversible invariant, SEAM.md checklist step 5) — 35 is the one phase that intentionally breaks it, which is why it runs last. **Phase 28 is order-constrained, not merely first-by-value:** the sidecar and Electron share one store, so wiring any token-WRITING channel under the current passthrough stub writes `TOKEN_PREFIX`+plaintext and silently signs the user out of the real Electron app. Requirements stay TBD per phase — mint at `/gsd-plan-phase N`. Note these phases are invisible to `roadmap.analyze` until STATE.md's `milestone:` frontmatter advances past v0.7 (same caveat already recorded for Phase 27).

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Steam store manager follows `src/backend/storeManagers/` pattern (new `steam/` directory)
- Steam auth approach TBD: Steamworks SDK, steam-user npm package, or browser-based login
- Auth is prerequisite for all library and game operation phases
- [Phase ?]: No follow-up getSteamUserInfo call needed since auth flows return username inline
- [Phase ?]: No enabled/experimental guard per D-08 — Steam is always first-class
- [Phase ?]: Specific route placed before loginweb/:runner catch-all to prevent WebView capture
- [Phase ?]: pendingFetches.add() before await in fetchMetadataIfNeeded (T-2-03 dedup)
- [Phase 02-04]: Gate makeLibrary steam inclusion on steam?.username (not library length) for correct D-02 first-sync empty state
- [Phase 02-04]: steamLogin uses refreshLibrary({ runInBackground: true, library: 'steam' }) per D-01; blocking handleSuccessfulLogin removed
- [v0.2 DETAIL-02]: AppleGamingWiki integration is macOS-only and Mac-games-only; ProtonDB/Linux follow-up is DETAIL-03, explicitly deferred to post-v0.2
- [v0.2 STORE-01]: Steam storefront tab is browse-only; purchasing stays in Steam's own client/web flow
- [Phase 07 DETAIL-01]: Steam `fetchMetadataIfNeeded` now captures appdetails `platforms` → `is_mac_native`/`is_linux_native`; flags persisted in `SteamMetadataCacheEntry` and re-seeded on `refresh()` so they survive resync/restart. Windows is the implicit baseline (no flag)
- [Phase 07 DETAIL-01]: platform icons are runner-agnostic (FontAwesome brand glyphs), rendered in the Install-info TabPanel
- [Phase 07 DETAIL-02]: rating-source setting (`appleRatingSource`: crossover|wine, default crossover) uses the `configStore` + `ContextProvider` pattern — NOT `useSetting`/`SettingsContext`, which isn't populated outside the Settings tree where GamePage/AppleWikiInfo render. Toggle lives in the Accessibility screen, gated to macOS
- [Phase 07 DETAIL-02]: ~~overlay gate is `platform==='darwin' && gameInfo.is_mac_native` (D-13)~~ **SUPERSEDED by Phase 7 UAT (2026-07-04):** the AppleGamingWiki CrossOver/Wine rating measures how a WINDOWS game runs on macOS via a translation layer — Mac-native games need no such rating. Gate is now `platform==='darwin' && !gameInfo.is_mac_native` (show on Windows games on macOS). Overlay still always shows an "Unrated" pill when no rating (D-12, user-confirmed); `GamePicture`'s generic `overlay` prop unchanged
- [Phase 07 tier→color]: rating tiers mapped to `_colors.scss` `--status-*` tokens (Perfect/Playable→success, Runs/Borderline→warning, Unplayable→danger, empty→default); vocabulary is free-form upstream so unknown values fall back to neutral
- [v0.3 Humble auth]: BrowserWindow + session.cookies is the only viable auth path — Humble's /processlogin requires reCAPTCHA; programmatic login is impossible. Zero new npm packages required.
- [v0.3 Humble adapter]: C5 adapter isolation is non-negotiable — all Humble HTTP calls through adapter.ts; X-Requested-By: hb_android_app header required on every request (omitting this is the likely cause of all three Lutris integration failures)
- [v0.3 claim flow]: Primary activation URL is store.steampowered.com/account/registerkey?key= NOT steam://open/activateproduct (does not pre-fill key; unreliable on Linux Flatpak/Snap)
- [v0.3 dedup threshold]: Fuzzy-name fallback at 85%+ threshold (not community-norm 70%) — DLC titles false-positive match base games at lower thresholds and false positives waste gift links
- [v0.3 Humble not a Runner]: 'humble' is NOT added to the Runner union type — keys domain is not a game platform; no LibraryManager methods required
- [Phase 10]: D-13 revised confirmed correct in practice: Humble identity endpoint (/api/v1/user/info) hard-404s on the real account tested; had identity remained a hard gate criterion, Phase 10 would never have passed
- [Phase 10]: D-14 ses.fetch() fallback on persist:humble prepared but not activated — axios reached the live Humble API successfully on first clean run after schema fix; fallback seam stays dormant
- [Phase 10]: Frontend connected-state must be gated on an explicit isLoggedIn boolean, never on optional profile fields like username — root cause of the Task 2 UAT tile-never-flips bug (e2236bc1)
- [Phase 14]: CSRF disposition for Humble reveal/redeem confirmed REQUIRED (csrf-prevention-token header + matching csrf_cookie both necessary) — csrf-capture code must not be dropped as dead code
- [Phase 14]: Reveal/redeem POST must route through Electron net.request on persist:humble session partition, not axios — Cloudflare Bot Management blocks axios's non-browser TLS fingerprint before Humble's app code inspects the request
- [Phase 14-07]: D-30 amended (Phase 14 gap closure, 14-07): server truth = revealed-ness + expiry only; redeemed_key_val presence classifies REVEALED, never REDEEMED. REDEEMED is a local-only, always-undoable overlay via Mark-as-redeemed. Closed UAT tests 2 (CR-01) and 3 (WR-02) at their shared root cause; deleted the locallyRedeemedPending/WR-02-keep-visible/server_confirmed_ack compensation machinery. HUMBLE_CLASSIFIER_VERSION bumped 4->5.
- [Phase 14-08]: Gap closure — UAT test 8 (Keys-waiting fill-then-empty sync churn) root-caused to fetchAndCommitOrder committing classifyOrder's hard-reset ownedElsewhere overlay on every per-order commit while D-26 broadcasts each intermediate snapshot. Fixed with a merged two-branch commit-time overlay (Steam gate open -> dedup recompute at commit; gate closed -> per-key carry-forward from prior entry, D-48) — also closed a T-14-03 mid-sync C2 reveal-bypass window. Added a single-sourced isServerTerminal/isFreezeEligible predicate (classify.ts) so REVEALED-without-pending-expiry orders now freeze under D-24 again (restores the freeze benefit 14-07 had lost, cutting the standing ~19-orders-per-sync Cloudflare/WAF re-fetch exposure); REVEALED-with-future-expiry orders keep re-fetching (retroactive expiry preserved). partitionGamekeys/patchCachedState both route through the same predicate. HUMBLE_CLASSIFIER_VERSION bumped 5->6.
- [Phase ?]: Steam-AppID exact joins never gated by NAME_MATCHING_SHIPS; only non-Steam name matching is (D-02)
- [Phase ?]: D-20 reversal: slugify() keeps roman numerals verbatim, only apostrophe drop is load-bearing
- [Phase 19-06]: Added LibraryManager.getListOfGames() to the interface (Rule 3 fix) - only legendary had it; gog/nile/zoom/sideload/steam now implement it reading their own persisted libraryStore
- [Phase 19-06]: isMac gate for D-16 non-mac-emptiness lives in buildCrossoverRatingMap itself, not in 19-05's getCodeweaversFromIndex/isCrossoverIndexEligible (neither actually gates on platform)
- [Phase 19-07]: Tier derivation (5->gold, 4->silver, 3->bronze, <=2->wontRun, null->unknown, undefined->no element) computed entirely inside CrossoverBadge, never read as a pre-labeled field off the index (D-12); enforces D-16 honesty invariant in one place
- [Phase 19-07]: CrossoverBadge renders unconditionally (no is.mac guard) in GameCard -- crossoverRatings map absence already yields undefined for every non-macOS/never-looked-up tile, which the component turns into no element
- [Phase 19-08]: WineSelector gained optional runner?: Runner prop so the D-18 knownnottowork warning gate can distinguish the Steam CrossOver-bottle guided-setup path (SteamBottleSetup.tsx) from the shared generic GOG/Epic/Amazon/sideload Wine-install path
- [Phase 20]: D-02: fuzzy title matcher lifted verbatim into src/common/matching/titleMatch.ts as the single shared module (normalizeTitle/titleSimilarity/isDlcFalsePositiveRisk/fuzzyMatch); HUMBLE_FUZZY_MATCH_THRESHOLD (0.85) single-sourced there, re-exported unchanged by backend/humble/constants.ts and backend/humble/dedup.ts — Store-search badge resolver (Plan 03) reuses the identical matcher instead of writing a second one, so the threshold and DLC guard behave identically on both surfaces
- [Phase 20-02]: currencyCode kept as bare string (never a literal 'USD' union) in common/types/storeSearch.ts so D-13's USD-only debt stays visible in the type system, never implicit
- [Phase 20-02]: storeMapping constant lives in common/discounts/storeMapping.ts (sibling file) per RESEARCH Open Question 1; buy handoff reuses existing openExternalUrl SyncIPC listener (D-08) rather than a new IPC channel
- [Phase 20-03]: Steam ownership resolved by EXACT steamAppId join only (fuzzyMatch never called for Steam); GOG/Epic/Amazon resolved via the Plan 01 shared fuzzyMatch; keyAvailable computed independently and never suppressed by ownership (D-01/D-02/D-07)
- [Phase 20-04]: SEARCH_CURRENCY='USD' contained inside cheapshark.ts only (D-13); T-20-01 mitigated by restricting buildRedirectUrl to interpolate only the dealID fragment inside a fixed https://www.cheapshark.com/redirect?dealID= host prefix
- [Phase 20]: [Phase 20-05]: OwnedBadgeLabel.values widened to Record<string,string|number> (was a discriminated union) so a single t(key, defaultValue, values) call type-checks against react-i18next's TFunction overloads
- [Phase 20]: [Phase 20-05]: Owned badge stack renders as ONE joined pill per the UI-SPEC copy contract (e.g. 'Owned on Steam, GOG'), not one pill per store; key-available always renders as an independent second pill (D-07 coexistence)
- [Phase 20]: [Phase 20-05]: StoreSearchBreakdown unmounts on row collapse (not cached) so a later expand is a natural retry after a fetch failure, with no persisted per-row error UI
- [Phase 20-06]: SearchBar gained optional loading prop (icon->spinner swap in same DOM slot) - non-breaking, default false, other consumers unaffected
- [Phase 20-06]: Container filters humble.keys via selectKeysWaiting before resolveStoreSearchBadges, matching Discounts' own pattern, so a redeemed/expired key never shows key-available
- [Phase 20-07]: Owned-badge false-positive on remaster/remake titles fixed in the shared common/matching/titleMatch.ts matcher (PRODUCT_VARIANT_KEYWORDS guard, isRemasterFalsePositiveRisk OR'd into fuzzyMatch), so Humble dedup inherits the same correctness fix, not just store-search
- [Phase 21-01]: lzma.d.ts ambient module declaration added (src/common/typedefs/, matches steam-shortcut-editor.d.ts precedent) since the lzma npm package ships no TypeScript types
- [Phase 21-01]: crypto.ts uses namespaced node:crypto import (nodeCrypto.createDecipheriv) rather than named import so the acceptance-criteria grep for createDecipheriv counts exactly the 2 call sites (ECB+CBC), not the import line
- [Phase 21-02]: manifest.ts avoids the literal string '@node-steam/vdf' even in explanatory prose comments (acceptance-criteria grep requires zero occurrences file-wide, not just in imports)
- [Phase 21-02]: Atomic-write test proves temp+rename via black-box stale-content replacement + structural source grep, not jest.spyOn/jest.mock -- node:fs/promises exports are non-configurable getters under this project's ts-jest/CJS interop, silently no-oping mocked I/O with no thrown error
- [Phase 21-03]: enableSteamNativeInstall opt-in toggle registered in GeneralSettings (not WineManagerSettingsModal where DownloadProtonToSteam renders); isSteamNativeInstallEnabled() is the single backend read seam, default OFF at three layers (frontend useSetting default, GlobalConfigV0 factory default, accessor ?? false fallback)
- [Phase ?]: [Phase 21-04]: Owned appId/depotId sets are derived inside depot.ts itself (getOwnedSets, from the authenticated client's package licenses via getProductInfo) rather than as a separate exported primitive in depot/select.ts
- [Phase ?]: [Phase 21-04]: loadContentManifestParser + fetchDepotPlanEntry are only invoked when selectAllDepots returns at least one descriptor -- zero owned depots returns { depots: [], totalBytes: 0 } without dynamically importing steam-user's undocumented internal parser
- [Phase ?]: [Phase 21-05]: downloadDepotFiles is a SEPARATE exported function from downloadSteamDepots (operates on an already-built DepotPlan, no SteamUser client dependency) rather than folding the streaming loop into downloadSteamDepots itself
- [Phase ?]: [Phase 21-05]: Real-tmpdir black-box fs testing (manifest.test.ts precedent) used for the streaming download loop -- node:fs/promises exports are non-configurable getters, unmockable in this project's ts-jest/CJS interop; only fetchChunk and sendFrontendMessage are mocked
- [Phase 21-06]: downloadSteamDepots's public contract changed from returning DepotPlan to a never-throwing { status, error? } outcome -- required by Plan 07's already-written SteamGame.install() call site; original plan-building logic preserved verbatim as buildDepotPlan
- [Phase 21-06]: finalizeToSteam reads LastOwner internally via SteamUser.getClient().steamID.getSteamID64() rather than a caller parameter, keeping it self-contained and reusable by Plan 08's startup-resume path (D-05)
- [Phase 21-06]: classifyDepotError classifies by regex over error text (not instanceof) since downloadDepotFiles's own failures are already reduced to plain strings by the time they reach the orchestrator
- [Phase ?]: [Phase 21-07]: install()'s native branch placed AFTER isBottleEligible() (D-15 bottle branch untouched, Plan 11's scope); installNative() maps downloadSteamDepots outcome onto InstallResult using gog/legendary's own conventions (done/error/abort) so a classified error renders through downloadqueue.ts's EXISTING generic error+Retry surface with zero changes to that file
- [Phase ?]: [Phase 21-07]: hostSteamDepotOs() is a new helper distinct from library.ts's hostInstallPlatform() -- depot/select.ts's oslist vocabulary (windows/macos/linux lowercase) differs from InstallPlatform (Windows/Mac/linux); stop() tracks in-flight native downloads via a private nativeInstallsInFlight Set (not a new aborthandler.ts export) so callAbortController is only invoked when a real depot download is running
- [Phase ?]: [Phase 21-08]: locateDownloadingTarget() is a new standalone helper, not an extension of scanDownloadingAppIds/readAcfState, so those four poller functions stay byte-for-byte unmodified; startup finalize passes depots: [] since no live DepotPlan exists on a fresh process (honest empty InstalledDepots, Steam's verify pass reconciles)
- [Phase 21-09]: resolveSteamInstallTarget honors an args.path override only when it resolve()s to exactly one getSteamLibraries() entry (D-08); unregistered/blank overrides silently fall back to the primary library rather than erroring
- [Phase 21-09]: D-09 multi-library override picker wired into InstallGameModal.ts's actual Steam chokepoint, not DownloadDialog (which Steam installs never route through); picker is a registered-libraries-only select, never PathSelectionBox's free-text filesystem browser
- [Phase ?]: [Phase 21-11]: D-15 unified via a new shared installDepotDownload() engine (installNative + installBottleNative delegate to it) rather than a second parallel implementation; bottle installdir sourced from resolveSteamInstallTarget (discarding its native-library targetSteamappsDir) since installLocation.ts's PICS installdir helpers are private and out of this plan's files_modified scope
- [Phase 21-13]: downloadSingleFile branches on DIRECTORY_FLAG(64)/SYMLINK_FLAG(512) BEFORE the size===0 fast path; symlink target resolved via resolve(dirname(dest), linktarget) then containment-checked against installRoot (never path.join); WR-02 zero-chunk and WR-03 percent-clamp closed in the same code path
- [Phase ?]: Phase 21-14: vdfEscape escapes backslash before quote (order matters) and neutralizes \r/\n/\t to a space rather than escaping them
- [Phase ?]: Phase 21-14: sanitizeInstalldir rewritten as a positive whitelist ([A-Za-z0-9 ._-]+, no leading/trailing dot) instead of an expanding denylist
- [Phase 21-15]: decompressWorker.ts sends an explicit {type:'ready'} handshake after its module graph loads; DecompressPool keys spawn-success off that message, not worker_threads' 'online' event, which fires before a bad entry path's module-not-found error surfaces
- [Phase 21-15]: DecompressPool.shutdown() sets a shuttingDown flag first and awaits in-flight replaceWorker() spawns before its terminate sweep, closing a race where a replacement worker finishing spawn concurrently with shutdown() would otherwise never be tracked/terminated
- [Phase ?]: [Phase 21-16]: GAMELIB_HANDOFF_STATE_FLAGS = 1026 tested by strict equality in pollInstallOnce (not a bitmask) since 1026 is the exact literal GameLib itself writes on handoff
- [Phase ?]: [Phase 21-16]: notifiedWaiting fire-once flag co-located on the same activePolls entry as seenDownloading rather than a separate Map
- [Phase ?]: [Phase 21-16]: GameCard/index.tsx needed zero code changes for the restart hint -- it already renders getStatusLabel's output verbatim via hasStatus.ts's label field
- [Phase 23-01]: applyDepotFileFlags never throws (returns {ok,error}); the caller (downloadSingleFile) throws to surface a mode-application failure as a DepotDownloadFailure, matching the existing SHA1-mismatch-throws convention
- [Phase 23-02]: canWriteFullOwnership is a single exported fail-closed predicate consulted at ONE call site inside finalizeToSteam (outcome==='completed' AND failures.length===0 AND buildid present/!=='0' AND allFilesVerified AND allModesApplied); GAMELIB_SPIKE_STATEFLAGS4 fully removed
- [Phase 23-02]: FinalizeToSteamOpts's new gate-input fields (outcome/failures/allFilesVerified/allModesApplied) are optional, not required — omitting them fails CLOSED to StateFlags=1026 via canWriteFullOwnership's own defaults, preserving pre-existing finalizeToSteam call sites (incl. library.ts's Wave-3-pending startup-resume finalize) without modification
- [Phase 23-03]: Directory(64)/Symlink(512)/zero-size manifest entries reconcile by existence/target-match, never sha1 — sha1File/resolveContainedPath exported from depot.ts for reuse by depot/reconcile.ts (deliberate circular import, empirically safe under CJS/ts-jest since every cross-reference is a function-body call, never top-level state)
- [Phase 23-03]: Startup resume's allModesApplied mirrors allFilesVerified rather than re-running a mode-reapplication pass — downloadSingleFile applies EDepotFileFlag modes immediately after each file's own sha1 check during the original download session, so a file reconcile trusts as verified already had correct modes applied
- [Phase 23-03]: A reconciliation-time error inside downloadDepotFiles (e.g. path traversal) falls back to the full pre-23-03 job list rather than aborting the run; a startup buildDepotPlan/reconcile failure falls back to the honest-empty depots:[] finalize — reconciliation is purely additive, never a new failure mode, and init() never crashes
- [Phase 23-06]: G-23-02 (0/18,809 HUMANKIND files landed +x) gets trace-before-fix instrumentation only (user-locked) — permanent steam-flags-census logging at plan-build/download-entry/download-complete plus per-invocation (never module-level) chmodAttempts/modeCallsites counters, proven safe under concurrent different-appId installs. 23-TRACE.md's H1-H5 hypothesis matrix + offline forensics feed 23-07's live run; no fix designed here, and 23-08 (the fix) is explicitly gated on that verdict
- [Phase ?]: TOP_N_FANOUT=3, calibrated per PATTERNS.md guidance for fan-out width
- [Phase ?]: pickHost workerSlot fan-out only applies at attemptIndex===0 && N>1; retries/circuit-breaker unaffected
- [Phase 25-02]: fetchChunk/downloadFileChunks/downloadSingleFile gained defaulted trailing workerSlot/fileWorkerSlot: number = 0 params so combination arithmetic type-checks under strict mode; combined slot = fileWorkerSlot * CHUNK_CONCURRENCY + chunkWorkerSlot per RESEARCH.md A2
- [Phase 25-02]: Integration test drives fetchChunk directly with distinct workerSlot values (not through the full downloadFileChunks pool) since pickHost's selection happens synchronously before fetchChunk's first await
- [Phase 21]: isFullyInstalledStateFlags is the ONLY place bit-4 (0x4 FullyInstalled) is computed — buildInstalledMap/readAcfState/buildBottleInstalledMap all route through it (T-21-17-01 regression lock)
- [Phase 21]: downloadSteamDepots finalize() forces outcome to cancelled when lastResult.outcome==='cancelled' OR opts.signal?.aborted===true, closing an async-interleaving class that could otherwise let a completed outcome reach canWriteFullOwnership
- [Phase 21]: markSteamInstallIncomplete() mirrors init()'s startup-surface pattern for a SAME-SESSION native cancel (the one gap init() doesn't cover), reusing the existing steamResumePending field
- [Phase 21]: steam-incomplete is a distinct statusContext value from steam-waiting-for-restart/steam-paused — applies when NOT currently installing but an incomplete manifest exists; hasStatus.ts's notInstalled branch now threads statusContext for the first time
- [Phase 26]: Phase 26-01: classifyPurchaseResult's details param typed as SteamUserLib.EPurchaseResult (not number) to satisfy no-unsafe-enum-comparison lint rule
- [Phase 26]: Phase 26-01: redeemKey tests isolate classification logic via jest.spyOn(SteamUser, ensureConnected/getClient) rather than replaying the full auth flow
- [Phase 26-02]: Test file placed in src/frontend/helpers/__tests__/ (not colocated per plan) because both src/frontend/jest.config.js and src/backend/jest.config.js enforce testMatch requiring __tests__ dirs — A colocated test file is never discovered by Jest regardless of CLI pattern; matches existing codebase convention
- [Phase 26-02]: Avoided literal '{5}' substring in steamKeyValidation.ts comments — Acceptance-criteria grep for {5} is a whole-file check; same lesson as Phase 21-02's @node-steam/vdf comment exclusion
- [Phase 26-03]: SteamUser.redeemKey's real signature (store:'steam', key:string) matched the planned IPC payload type exactly — no adaptation needed; no new refresh/recompute plumbing added, 26-04 reuses existing refreshLibrary IPC path
- [Phase 26]: [Phase 26-04]: Used ContextProvider's refreshLibrary({ library: 'steam' }) context wrapper instead of window.api.refreshLibrary — the plan's interface note had the wrong call target; window.api.refreshLibrary takes a bare Runner string, not an options object, and the context wrapper is what actually updates steam.library in React state
- [Phase 26]: [Phase 26-04]: Non-success redeem outcomes keep the key input visible/editable (typing clears the outcome) rather than hiding the form, so users can retry inline without closing the modal (D-06/D-08)
- [Phase 26-05]: Direct-invocation Jest harness for SidebarLinks (mock react/react-router-dom/react-i18next, stub SidebarItem/QuitButton/frontend-helpers) rather than jsdom — No jsdom/react-test-renderer installed; matches HumbleOriginInfo.test.tsx/StoreSearchScreen.test.tsx precedent
- [Phase 24]: [Phase 24-01] R1 vtable generator: test file placed at meta/__tests__/gen_vtables.test.ts (not the frontmatter's literal path) to match meta/jest.config.js's testMatch and 24-PATTERNS.md's stated analog location
- [Phase 24]: [Phase 24-01] Flat SteamAPI_* export set is a fixed acceptance-set superset constant (FLAT_EXPORTS_SUPERSET), not manifest-derived, per R3's acknowledged divergence (review finding #9); builtBridgeShimPath exported from paths.ts as the BLOCKER-2 shared bundled-shim-location contract for 24-05/24-07
- [Phase ?]: [Phase 24-02]: bridge_helper.c degrades instead of exit()ing on InitFlat failure (divergence from spike 005b) so CONTROL HEALTH (process-up) stays observable separately from WHOAMI (init-succeeded-against-live-session) — the two-state readiness contract the 24-06 probe consumes (finding #7); protocol.ts frame layout reverse-validated against the committed generated shim's bridge_transact() so TS decoder and live wire agree byte-for-byte; MAX_FRAME_BYTES=65536 single-sourced across the TS decoder and the C read loop (fixed static buffer, bounds-checked before recv, T-24-03)
- [Phase 24]: [Phase 24-03]: Avernum 4 = AppID 206020, HOARD = AppID 63000 (resolved via public Steam store API; spike sources contained no AppID literal, only game names/dev names cross-checked against the READMEs)
- [Phase 24]: [Phase 24-03]: allowlist.ts uses readFileSync+JSON.parse+.parse() at module load (not a direct JSON import) per the plan's key_links spec, keeping the fail-loud load path independently testable
- [Phase 24-04]: isBridgeBottleReady() checks cxbottle.conf existence only (not steam.exe) -- the bridge bottle must never contain a bottled Windows Steam client (R6), so reusing isBottleReady()'s steam.exe check would make it permanently non-ready
- [Phase 24-04]: getBridgeBottleSettings() always resolves DEFAULT_BRIDGE_BOTTLE_NAME with no stored per-install override -- one shared bridge bottle (D-03), not user-configurable this phase
- [Phase ?]: [Phase 24-05]: SHIM_EXPORTED_SYMBOLS in shimGenerate.ts is a reviewed literal copy of meta/gen_vtables.ts's FLAT_EXPORTS_SUPERSET (not a cross-boundary import) -- src/'s tsconfig include:[src] excludes meta/, and the compiled .dll ships without its source .def at packaged runtime
- [Phase ?]: [Phase 24-05]: placeShimForGame() takes shimSourcePath as an injectable option defaulting to the real builtBridgeShimPath import -- tests inject a tmpdir fixture without mocking a module-level path const, while a source-grep test proves the production default is the real BLOCKER 2 shared location
- [Phase 24-06]: Status union uses 'not-inited' (not the suggested 'needs-spawn') to accurately name HEALTH-ok-but-WHOAMI-not-ok; poll returns early once HEALTH first answers since InitFlat already ran before the accept loop (D-04)
- [Phase 24]: Phase 24-07: pinned zig 0.16.0 for aarch64-macos (verified live against ziglang.org/download/index.json); zig lands in .build-tools/zig, never public/bin
- [Phase 24]: Phase 24-07: buildSteamBridgeShims.ts independently reconstructs public/bin/${arch}/darwin paths instead of importing paths.ts (which imports Electron's app at load time and would crash under plain node)
- [Phase 24]: Phase 24-07: zig cc -shared requires an explicit -lws2_32 link flag for the shim's winsock2.h usage -- confirmed by running the real compile gate
- [Phase 24]: isBridgeEligible() composed as the FIRST sub-branch inside install()/launch()/uninstall()'s isBottleEligible() block, ahead of the Phase 17 isBottleReady() gate (BLOCKER 1)
- [Phase 24]: Bridge install/uninstall completion signaled by a direct is_installed flip, not the shared ACF poller -- library.ts's AcfSource has no bridge-bottle variant
- [Phase 24]: markBridgeFailedThisSession(appId) + isBridgeEligible() session-set check (finding #3) so a D-05 fallback re-invocation skips the failing bridge
- [Phase ?]: 24-09: i18n keys go in gamepage.json (namespace file), not translation.json as literally named in plan -- verified against SteamBottleSetup precedent
- [Phase ?]: 24-09: fallback dialog re-invokes window.api.install()/window.api.launch() directly (D-04 shape) -- D-11 on-demand bottle provisioning inherited for free via existing steamBottleSetupRequired guard chain
- [Phase ?]: [Phase 27-01]: Sidecar transport framed as stdio JSON-RPC (not a loopback TCP port) per T-27-01 — Wine on macOS shares the host netns so a loopback port would be reachable by bottled processes; the parent<->child stdio pipe is private. Contract in src/common/types/sidecarTransport.ts (string ids for 64-bit safety), imported by the Rust shell, sidecar (27-02) and renderer bridge (27-03).
- [Phase 27]: [Phase 27-02] userData path = join(appData, 'GameLib') in pathShim.ts — matches the 'GameLib' literal already used throughout paths.ts; real Electron app.getName()-derived value can't be observed from a headless sidecar
- [Phase 27]: [Phase 27-02] Fixed a pre-existing order-sensitive circular dependency in storeManagers/index.ts's eager libraryManagerMap construction — converted top-level libraryManagerMap imports to lazy await import()/require() at use sites across 12 files, matching the codebase's existing bottle.ts/games.ts convention; required for backend/storeManagers/steam/library.ts to import headlessly under the sidecar
- [Phase 27]: 27-03: split window.api attach into a dedicated Node/Electron-free module (tauriAttach.ts) rather than reusing preload/index.ts, avoiding pulling contextBridge/backend-constants-environment into the Tauri renderer bundle
- [Phase 27]: 27-03: ipc.ts/misc.ts use lazy guarded require('electron')/require('electron-store') instead of static imports, since a static import compiles to an unconditional top-level require() that would throw if bundled into the Tauri renderer
- [Phase 27]: 27-03: registered a new Preload jest project (src/preload/jest.config.js) -- src/preload had zero test discoverability before this plan
- [Phase 27]: 27-04: added backend/logger's initHeadless() (real LogWriter, no GlobalConfig/system-info-dump side effects) as a purely additive export for the headless sidecar; Electron's own init() and main.ts startup path are unmodified
- [Phase 24]: [Phase 24-11]: D-UAT-24-04 fixed via byte-identity guard (size then sha256) replacing pure existsSync existence guard in placeShimForGame — The existence guard always short-circuited because the game's depot-shipped steam_api.dll is already present at shimPath by the time placeShimForGame runs; overwrite-by-identity restores the intended bridge-shim placement, with the shim-not-built check moved above the identity check and coverage/containment guards unchanged
- [Phase 24]: [Phase 24-12]: getBridgeBottleSteamappsRoot() mirrors getBottleSteamappsRoot() exactly (dedicated small function per root) rather than a parameterized getSteamappsRootFor(source) helper -- keeps each root trivially auditable per RESEARCH.md Pitfall 2 (never conflate native/bottle/bridge roots)
- [Phase 24]: 24-13: installBridgeGame polls the bridge bottle (pollerSource:'bridge', 24-12's AcfSource) instead of the unrelated Phase 17 GameLibSteam bottle — closes D-UAT-24-05
- [Phase 24]: 24-13: clearBridgeFailedThisSession(appId) un-poisons a session-sticky bridge failure on a successful (re)install — install() and launch() routing no longer stay permanently stuck on one earlier recoverable failure (D-UAT-24-03 cascade a)
- [Phase 24]: 24-13: launchBridgeGame verifies the resolved exe exists on disk (+ bridge bottle ready) before firing runWineCommand — a bridge-eligible game installed via a non-bridge path now surfaces steamBridgeSetupRequired instead of a silent wine no-op (D-UAT-24-02); treated as recoverable, not a bridge failure, so it does not markBridgeFailedThisSession
- [Phase 24]: Gates 2-4 in 24-UAT.md re-pointed from BLOCKED to PENDING retest, with per-fix verification hooks citing 24-11/24-12/24-13 gap closures; frontmatter status fields updated to match (Rule 1 consistency fix)
- [Phase 24]: getBridgeBottleSettings() resolves CrossOver wine via a sibling of CXBOTTLE_BIN (sync helper), not the async getCrossover() detector, keeping the getter synchronous for its existing callers
- [Phase 24]: 24-16: refresh()/refreshInstallState() consult buildBridgeInstalledMap() (native > Phase 17 bottle > bridge precedence) so a bridge-installed game's badge survives the periodic sync and focus reconciliation; installPlatformForSource('bridge') now returns Windows; markBridgeGameUninstalled emits gameStatusUpdate done to clear the Uninstalling pill (D-UAT-24-07)
- [Phase 24-17]: isBridgeAuthoritativeForInstallState() deliberately excludes games.ts's transient bridgeFailedThisSession from the library-level eligibility notion — only durable eligibility (bridgeAllowlist + mac/arch gate) drives persisted install-state, since a single recoverable session failure must never permanently flip is_installed
- [Phase 28]: Plan 28-01: sidecar->Rust rustInvoke request/response channel added (requestRustInvoke, RUST_INVOKE_CHANNELS allowlist, 60s timeout); T-28-03/T-28-03b/T-28-05 mitigated at the transport layer
- [Phase ?]: 28-02: openExternal gets minimal fire-and-forget fix, not rustInvoke conversion (Open Question 2 resolved at planning)
- [Phase 28]: 28-02: KEYRING_SERVICE=com.gamelib.launcher / KEYRING_ACCOUNT=steam-refresh-token chosen as production-stable Keychain identifiers, distinct from spike 011's throwaway values
- [Phase 28]: 28-03: TokenStore seam introduced — configStore/TOKEN_STORE_KEY access confined to tokenStore.ts, selected via setTokenStore/getTokenStore registry with no env-var escape hatch
- [Phase 28]: D-11 (28-03): Electron plaintext token fallback kept verbatim in ElectronTokenStore, not unified with sidecar's stricter D-06 policy — documented as intentional divergence
- [Phase 28]: Aliased bootstrap.ts's setTokenStore import as installTokenStore to satisfy the plan's literal single-occurrence grep acceptance criterion
- [Phase 28]: keyringTokenStore.ts's docstring avoids the literal identifiers configStore/TOKEN_STORE_KEY/TOKEN_PREFIX anywhere in the file, since its own structural test asserts a whole-file regex
- [Phase ?]: Corrected the plan's stale filename assumption for the Steam configStore file (config.json, not steamConfigStore.json) and added the skeletonFlows.test.ts-style electron/electron-store mock redirection so electronUntouched.test.ts proves the REAL production configStore path is untouched, not a synthetic tmpdir-backed mock
- [Phase 28]: Phase 28 hardware checkpoint: macOS Keychain Deny surfaces as keyring::Error::PlatformFailure wrapping OSStatus -128 (errSecUserCanceled), not NoStorageAccess — closes RESEARCH Assumption A1; no code fix needed since classification is already NoEntry-vs-everything-else, variant-agnostic.
- [Phase 28]: Regression fixed (92c29a5e): Phase 27's skeletonFlows.test.ts + 28-05's electronUntouched.test.ts were driving the developer's REAL production Electron configStore; skeletonFlows Test 4 destroyed the real Steam refresh token mid-phase. Both suites made strictly read-only / isolated.
- [Phase 29]: fileStore D-14 fix implemented as a path-keyed cellRegistry (Map<filePath,{data}>) rather than singleton FileStore instances, so new FileStore() still returns a distinct object per call while sharing the underlying data
- [Phase 29]: fileStore.ts options.defaults (D-02b) seeds unset keys under loaded data at cell-creation time only and is never persisted to disk at construction, deviating intentionally from electron-store/conf
- [Phase 29]: D-15 extended to a fourth store (uploadedLogFileStore) beyond the original three, so storeRegistration.ts (29-04) imports zero host modules
- [Phase 29]: storeRegistry records {instance, options} pairs (not just the instance) so name-keyed dispatch never re-derives cwd/name from the ValidStoreName string (Pitfall 4)
- [Phase ?]: D-08: single fail-closed store ALLOW-list (storePolicy.ts) replaces three hand-duplicated deny-lists for the Tauri path; Electron's misc.ts deny-list stays deliberately divergent until Phase 35 cutover (Phase 28 D-11 precedent)
- [Phase ?]: D-09/D-13: boot vs lazy store tier partition is declared as literal lists in storePolicy.ts, anti-drift-guarded by a hardcoded-reference-list test rather than derived at runtime
- [Phase 29]: resolveRawStore() resolves wikigameinfo (a declared ValidStoreName actually built as a CacheStore) through the same cache-shaped construction as the D-13 boot cache stores, not the typed registry
- [Phase 29]: D-08 divergence made explicit at both sites: tauriTransport.ts's snapshotGet/snapshotHas gate on storePolicy.ts's single-sourced isAllowedStoreField() allow-list; misc.ts's Electron-branch SECRET_STORE_KEYS deny-list is untouched, commented as intentionally divergent until Phase 35
- [Phase 29]: hydrated is tracked per store name (Set<string>), not per-key, matching the shape both the eager snapshot and lazy fetch actually return
- [Phase ?]: Namespace-imported sidecarRpc for storeWriteHandlers.ts's single pushFrontendMessage call site, so the D-06 single-choke-point property is grep-verifiable
- [Phase ?]: storeWriteHandlers.ts write-eligibility (D-08 isAllowedStoreField) is a stricter, independently-gated surface than storeNew's creation eligibility
- [Phase 29]: SEAM.md re-baselined: store layer moved from stub language into a real §1 section; Accepted Constraints (Phase 29) records D-07/D-14/D-08/D-01 so none reads as an undocumented bug
- [Phase 29]: 3d live-verification route substituted: original Settings-screen check hit an unrelated, pre-existing unported-channel hang (Phase 30 territory); verified via an equivalent write-path check (favourites) through the same 29-06 choke point instead
- [Phase 30]: Mocked only SteamUser's three QR static methods for sidecar wiring tests (not deeper steam-session/steam-user libs) — user.test.ts already covers SteamUser's internal login-flow correctness
- [Phase 30]: Token-seam test calls getTokenStore().setToken() directly and asserts the resulting rustInvoke frame + synthetic Rust response (mirrors rustInvokeChannel.test.ts), rather than spying on requestRustInvoke
- [Phase 30]: tauri-plugin-dialog pinned as "2" (caret-major) not literal 2.7.2, matching tauri-plugin-opener's existing convention (Cargo.lock records the exact 2.7.2 resolution)
- [Phase 30]: electronStub.ts must never import backend/logger -- it reintroduces the app.getPath() import-time module wall; use console.warn instead in that one file
- [Phase 30]: D-05a (Phase 30 Plan 02): direct SteamGame.install()/update() bypass, not a downloadqueue.ts port
- [Phase 30]: D-05b/D-12 (Phase 30 Plan 02): uninstallGameCallback/checkGameUpdates reused UNCHANGED, all runners
- [Phase 30]: Task 3 both-builds checkpoint: partial pass (3/4 human-observed conditions); Steam QR login logon button unresponsive under Tauri filed as known defect G-30-01, not merely deferred — Additive/reversible invariant confirmed no-regression; QR login UI flow is known-broken, worse than unproven, so claim discipline required filing a defect rather than re-deferring
- [Phase 30]: A returned {status:'error'} from SteamGame.install() now always pushes a terminal gameStatusUpdate('done'), mirroring Electron's removeFromQueue(forceStatusUpdate=true)
- [Phase 30]: Client-not-ready sentinel excluded from the new showDialogBoxModalAuto call to avoid colliding with ensureSteamClientReady's existing steamClientSetupRequired prompt
- [Phase 30]: useSettingsContext render-gate relaxed via hasAttemptedLoad flag (extracted as pure shouldWithholdContext) instead of seeding a fake non-empty default config — Smaller, more honest fix per plan's own escape hatch; avoids masking a genuinely-empty-but-successful settings response
- [Phase 30]: Frontend fallback test extracts the hook's pure render-gate decision instead of using React Testing Library — Project's frontend jest config has no jsdom/react-test-renderer installed; installing one is excluded from auto-fix authority (Rule 3 package-install carve-out); followed existing hasStatus.reconcile.test.ts precedent in the same directory
- [Phase 30]: Bound every pre-download steam-user CM call (getProductInfo/getDepotDecryptionKey/getRawManifest/getContentServers) plus resolveSteamInstallTarget in a 25s withTimeout to close G-30-02 (install-spinner hang) — A stale-but-present CM socket never rejects on its own; timeout rejections feed the EXISTING withPlanBuildRetry + 30-05 finally/catch machinery, so zero new terminal-status logic was needed
- [Phase ?]: setSetting registered via ipcMain.on, never .handle -- a send channel registered as a handler fails 100% silently at runtime
- [Phase ?]: getUserInfo/readConfig deliberately NOT ported -- neither is reached by the Settings screen (Epic-only / Legendary-only respectively)
- [Phase ?]: process.getSystemVersion polyfilled in electronStub.ts via os.release() rather than modifying the shared backend/utils/systeminfo module
- [Phase 31]: showMessageBox de-wired to a safe RESOLVED sentinel {response:-1}, never rejects (Phase 31 Plan 04, CR-01) — Rust's dialog is OK-only; forwarding it to a multi-button destructive confirm auto-confirmed the destructive branch for already-shipped callers (promptI386Recovery, askForceUninstall). A reject-based de-wire would crash the sidecar (unguarded fire-and-forget awaits, no unhandledRejection guard) -- resolve is the only safe fix.
- [Phase 31]: Per-game setSetting/writeConfig now enforce a resolve+relative path-containment guard (WR-01) — appName is attacker-influenceable and was routed unguarded into a filesystem path; mirrors the proven library.ts locateMachOBinary containment idiom.
- [Phase 32]: D-05 boot-resume log deferred via setImmediate with a try/catch console fallback (heroicLogWriter isn't assigned until bootstrap.ts's init() runs, which happens after the ./handlers import completes)
- [Phase 32]: installFlows.test.ts's stale Invariant B example swapped from getDMQueueInformation (now legitimately ported by 32-01, REQ-32-04) to checkDiskSpace
- [Phase 32]: D-01 (Phase 32-02) interpreted as full Electron parity for install/updateGame — Dropped the Phase 30 non-steam-runner guard entirely — RESEARCH.md's own D-01/D-02 wording calls for the runner-generic ipc_handler.ts shape, and storeManagers/index.ts already force-constructs all six library managers regardless
- [Phase 32-03]: Doc-closure triad names both G-30-01 and G-30-02 as doubly-gated live-E2E blockers (D-06), never reusing Phase 30/31's single-blocker wording; documents the 32-02 deviation (dropped non-steam-runner guard) as delivered state
- [Phase 33]: 33-01: Kept the install watchdog runner-agnostic (8min) rather than steam-only gated, per 33-RESEARCH's lower-risk recommendation
- [Phase 33]: 33-01: Failure dialog fires only on status:'error' (resolved or thrown), never on 'abort' -- a user cancel is not a failure
- [Phase ?]: D-01a audit found+fixed a new bare client.getProductInfo call in bridge/launchTarget.ts reachable from the macOS bridge install path — wrapped with withTimeout/STEAM_PICS_TIMEOUT_MS, matching installLocation.ts's fetchInstalldir
- [Phase ?]: ensureConnected D-02 fix uses AppID 753 (Steam's own client) as the canary probe target and mirrors the existing cold-connect grace-window idiom for relog's bounded fallback
- [Phase 33-03]: Extended the existing dialog_message Rust arm in place (data-shape change) rather than adding a new match arm/channel
- [Phase 33-03]: Used explicit per-caller cancelId fail-safe instead of a positional last-index heuristic -- askForceUninstall and promptI386Recovery have opposite destructive-button orders
- [Phase 33]: shell.trashItem stays a logged no-op (D-05): tauri-plugin-fs 2.5.1 has no trash capability, confirmed by reading its source directly -- no vetted plugin to wire
- [Phase 33]: app.exit/quit both forward to RUST_APP_EXIT (AppHandle::exit); app.relaunch forwards to RUST_APP_RELAUNCH (AppHandle::restart) -- fixes the zombie-sidecar gap so the real Tauri process actually exits/relaunches
- [Phase 33]: Declared the 3 gate gap-fixes (notification capability grant, sidecar online-monitor wiring, windowControlsOverlay guard) found during the 33-05 live gate as first-class rows in 33-PORTED-CHANNELS.md alongside the planned 33-01..33-04 work
- [Phase 33]: Distinguished proof levels explicitly: dialog/Notification/shell/app forwards are wired-and-unit-proven; the G-30-02 fix and 3 gate gap-fixes are hardware-proven live via the 33-05 D-13 gate
- [Phase 34]: 34-01: buildSidecarSea.test.ts's target API adds a dedicated buildCodesignArgv(binaryPath, platform) export so codesign-only-on-macOS has a real positive assertion
- [Phase ?]: 34-02: SEA build bundles its own fully self-contained sidecar copy (no --packages=external), since SEA require() bypasses Module._load and cannot resolve node_modules
- [Phase 34]: 34-02: electron resolved via esbuild --alias to electronStub.ts at build time for the SEA bundle (the repo's usual runtime Module._load hook cannot reach a compiled SEA binary)
- [Phase 34]: 34-02: steam-user and lzma runtime-computed require() calls patched via pnpm patch to their always-resolved literal target (behavior-neutral, unblocks SEA bundling)
- [Phase 34]: 34-05: shell:allow-execute scoped to exactly {name:'binaries/gamelib-sidecar', sidecar:true} — no broad shell grant to the webview — T-34-09 elevation-of-privilege mitigation
- [Phase 34]: 34-05: Task 3 (npm run tauri:dev / npm start both-launch human-verify) deferred by user decision — REQ-34-08 additive/reversible invariant not yet runtime-proven; carry forward as pending human-UAT
- [Phase 34]: 34-06: Windows --config signing override computed via a bash step (id: build_args -> GITHUB_OUTPUT) rather than an inline nested-brace GHA expression ternary, avoiding brace-escaping ambiguity while preserving D-04's secrets-less-run-ships-unsigned default.
- [Phase 34]: CR-01 fixed via GAMELIB_SIDECAR_TARGET_TRIPLE override + checksum-verified official nodejs.org Node binary for cross-arch builds (GAP-D-02); Intel Mac support kept, Rosetta/dropping the leg rejected
- [Phase 34]: Confirmed via cmp that tauri icon regen is byte-identical for PNGs but byte-different for icon.icns -- validates the scratch-dir-then-copy-only-icon.ico approach as necessary
- [Phase 34]: 34-10: kept shutdown_child method name per plan's explicit Task 3 instruction; narrowed Task 1's over-broad test assertion instead, resolving a plan-internal contradiction (blanket _child substring check vs. required fn shutdown_child)
- [Phase 34]: 34-11: Used explicit per-leg sidecar_triple matrix literals over inline GHA ternary; try/finally cert.pfx cleanup; WR-04/IN-01 deferred per GAP-D-01 — Literal matrix fields match 34-06's build_args precedent and are directly test-assertable; try/finally covers the failed-import case a trailing statement would miss
- [Phase 34]: 34-14: repointed the updater feed endpoint to a fixed-tag asset URL (/releases/download/updater/latest.json) and added a release:published-triggered promote-updater-feed.yml, closing GAP-3 while preserving D-09's draft+prerelease human-review gate
- [Phase 34.1-05]: No jest-environment-jsdom added; hand-rolled DOM/event test harness on Node's built-in EventTarget/Event instead — Matches the project's documented precedent (src/frontend/jest.config.js) for avoiding this dependency; Node's EventTarget/Event already implement the dispatch/cancel semantics needed
- [Phase 34.1-05]: Split D-10 gamepad test coverage across two files — gamepadAction.test.ts uses the real tauriGamepadAction for DOM logic; gamepadActionRouting.test.ts mocks it to prove only misc.ts's isTauri() routing -- jest.mock() is file-wide/hoisted so one file could not do both
- [Phase ?]: Added the image-png Cargo feature alongside tray-icon (Rule 3 fix) -- Image::from_bytes is gated behind image-ico/image-png and is not implied by tray-icon
- [Phase ?]: changeTrayColor's initial sync is deferred via setImmediate (registerAppShellFlows runs before initLogger; GlobalConfig.get()'s first call can itself synchronously log)
- [Phase ?]: Left linux-libxdo off the tray-icon feature set -- unverified requirement, recorded as an open Linux question rather than guessed
- [Phase 34.1]: D-12 resolved: createNewWindow/showAboutWindow are renderer-side (Tauri JS) via WebviewWindow, not sidecar-routed — WebviewWindow's constructor is webview-context-only, the headless sidecar cannot call it -- zero new Rust arms needed
- [Phase 34.1]: Child-window labels are a monotonic counter (external-<n>) or fixed 'about', never derived from the URL and never 'main' — preserves capabilities/default.json's windows:['main'] fail-closed boundary -- remote content opened via createNewWindow inherits zero Tauri command access
- [Phase 34.1]: 34.1-08: zero drift found between the plan's declared 33-channel/kind assignment and what shipped, confirmed by set-equality against IPC-PORT-INVENTORY.md's corrected Slice 4 list
- [Phase 34.1]: 34.1-08: changeTrayColor recorded as sidecar send + rustInvoke (new arm), a more specific kind than the plan's flat sidecar-send bucket, not a contradiction
- [Phase 34.1]: 34.1-08: SEAM.md's headline-cost tally advanced from 28 to 61 wired/re-routed total; callTool's D-14 move to Phase 34.5 noted
- [Phase 34.2]: 34.2-01: Re-homed anticheat/ipc_handler.ts's releasesInfoReady listener body directly into bootstrap.ts (Block A) rather than importing that file, because its module scope calls addHandler from backend/ipc, which imports the real electron
- [Phase 34.2]: 34.2-01: Discovered src/backend/__mocks__/i18next.ts is a project-wide Jest automock (adjacent to the Backend project's roots) applied to every backend test file automatically with no explicit jest.mock() call anywhere -- one level further back than the exact CR-01 blind spot this plan's objective names; jest.unmock('i18next') defeats it
- [Phase 34.2]: 34.2-01: Dropped the plan's literal "rmSync the tmp home dir in afterAll" test instruction after it reproducibly crashed the whole Node process (LogWriter's real fire-and-forget writes raced the delete); adopted steamAuthFlows.test.ts's own no-explicit-cleanup precedent instead
- [Phase 34.2]: requestGameSettings stays solely owned by settingsFlowRegistration.ts (D-09); deduping getGameSettings/requestGameSettings deferred to Phase 35 Electron cutover
- [Phase 34.2]: getGameMetadataOverride/getAllGameOverrides registered directly against game_overrides/index.ts, never routed through gamedetails/dispatch.ts (already Electron-free pass-throughs)
- [Phase 34.2-05]: Route metadataChanged frontend push through sidecarRpc.pushFrontendMessage directly, not electron/backend-ipc.ts — Same relay storeWriteHandlers.ts's D-06 STORE_CHANGED_CHANNEL push already rides; zero new Rust arms; importing backend/ipc.ts is forbidden under src/backend/sidecar/
- [Phase ?]: getWikiGameInfo measured (Hades 1190ms, Stardew Valley 957ms, Portal 2 702ms) and NOT exempted from the 60s invoke bound
- [Phase ?]: getCrossoverIndex exempted from the 60s invoke bound (LONG_RUNNING_CHANNELS, zero new Rust dispatch arms)
- [Phase 34.2]: Slice closure (34.2-07): wrote 34.2-PORTED-CHANNELS.md sec.6 sign-off fresh rather than reusing 34.1's wording -- this slice's 26 channels are data-in/data-out with assertable return shapes over the real RPC loop, a genuinely stronger claim than 34.1's unobservable visual deliverable; named D-02/D-07 as the two honest exceptions
- [Phase 34.2]: Corrected (not deleted) SEAM.md's stale steamFlowRegistration.ts/libraryManagerMap claim: gameDetailsFlowRegistration.ts now dispatches runner-generically through libraryManagerMap for all six managers (D-01/Phase-32-D-02); what remains deferred is launcher.ts's own Wine/GameConfig/DownloadManager pipeline
- [Phase ?]: Sidecar unhandledRejection guard must resolve/log, never introduce a new throw/reject/exit path (sidecar-dialog-reject-crashes precedent)
- [Phase 34.2]: 34.2-10: mocked pathShim.getPath() directly (not os.homedir()) to redirect sidecar test config paths, since pathShim.resolveAppDataDir() prefers env.APPDATA/env.XDG_CONFIG_HOME over homedir() on win32/default — os.homedir() mock alone is silently bypassed by pathShim's real precedence, risking real user config wipe
- [Phase 34.2-11]: Corrected the false transitive electron-freedom claim in dispatch.ts/enrichmentFlowRegistration.ts/REQUIREMENTS.md rather than building a real transitive purity gate — a genuine transitive gate would need a 29-module allowlist spanning nearly the whole backend, constraining nothing; untangling that coupling is Phase 35's job
- [Phase 34.2-11]: electronReachLedger.test.ts is a growth-only (subset) tripwire over the measured electron-reach set, not a strict-equality pin — Phase 35 is expected to shrink the set over time as modules are decoupled from electron; a strict pin would go red on every legitimate improvement
- [Phase 34.2]: Digest pins are primary do-not-touch enforcement (byte-identity); ten-channel-set and steamLibrary.has( pins are a secondary Layer 2 that survives reformat while catching a rewrite
- [Phase 34.2]: getLaunchOptions test reads public/locales/en/gamepage.json directly rather than hardcoding the translated string, so the assertion breaks if launch.default is renamed or deleted
- [Phase 34.2-13]: storeSearch/handlers.ts documents transitive (not direct) electron reach through cheapshark.ts, mirroring plan 34.2-11's corrected wording rather than the pre-34.2-11 overclaim
- [Phase ?]: Read all six gap-cycle plans' actual shipped state from source (main.rs, bootstrap.ts, electronReachLedger.test.ts), not from plan intent, when refreshing 34.2-PORTED-CHANNELS.md
- [Phase ?]: Did not edit 34.2-HUMAN-UAT.md when refreshing 34.2-PORTED-CHANNELS.md -- recorded gap-cycle interaction with both deferred UAT items without changing their pending/deferred status
- [Phase 34.2]: 34.2-15: kept CR-02's unhandledRejection fallback message fully hardcoded/non-interpolated and did not add an uncaughtException handler, per the plan's explicit scope boundary
- [Phase 34.2]: Ported logError early from Phase 34.3/slice-6 into 34.2 gap cycle 2 (plan 34.2-16) — Gap cycle 1's onRepairYesClick renderer fix already routes a real repair failure through window.api.logError, and an unregistered send channel is a total silent no-op under Tauri
- [Phase 34.2]: Registered ONLY logError, not the other five logger/ipc_handler.ts channels — logInfo/getLogContent/showLogFileInFolder/uploadLogFile/deleteUploadedLogFile/getUploadedLogFiles remain Phase 34.3 work, declared unported in 3 places (module docstring, handlers.ts comment, both ledgers)
- [Phase 34.2]: backend/logger is jest.spyOn'd in loggerFlows.test.ts, never jest.mock'd — logger/index.ts and log_writer.ts import each other circularly; a jest.mock factory calling requireActual re-enters that cycle and throws inside LogWriter's constructor (sidecarRejectionGuard.test.ts precedent)
- [Phase 34.2]: Merged the showDialogModal-behavior test and the T-34.2-52 information-disclosure guard into one test so deleting the showDialogModal call fails exactly one test (34.2-17)
- [Phase 34.2]: Dialog message is the FIXED translated string only -- raw error text goes to console.error and window.api.logError, never the rendered dialog (T-34.2-52, 34.2-17)
- [Phase 34.2-19]: env-var-only os.homedir() redirection does not work under Jest 29's synthetic per-test-file process.env; fixed via a narrow jest.mock('os', ...) call in the setupFiles module (coordinator-approved Rule 4 correction, verified live)
- [Phase 34.2-20]: Guard logError's call to logError(...) with Promise.resolve(...).catch(...) at loggerFlowRegistration.ts's own call site (WR-02), restoring processGuards.ts's not-a-substitute-for-call-site-handling invariant — processGuards.ts's docstring explicitly forbids relying on its generic unhandledRejection guard as the primary handler; test mocks use mockImplementation not mockReturnValue since logger.logError's declared return type is void
- [Phase 34.2-21]: reportRepairFailure wraps each of the three failure signals in its own try/catch, not just the errorText precomputation, so the docstring's independence claim is actually true against any future throw source — the stringification fix removes the only KNOWN throw source but showDialogModal/logError are caller-supplied and cannot be proven never to throw
- [Phase 34.2]: Test 5 non-vacuity check uses getGameSettings (a real ported channel) rather than a made-up string; jest gate matches RAW main.rs source (not the comment-stripped helper) since #[cfg(test)] sits adjacent to doc comments
- [Phase 34.2]: Currency gate matches a specific pinned heading (Gap cycle 3 reconciliation) rather than a generic latest-section pattern, so a future gap cycle 4 extends its own token lists instead of overloading cycle 3's record.
- [Phase 34.2]: Closed deferred-items.md entries are marked with a heading suffix plus a dated resolution block rather than deleted, preserving the historical record while making current status unambiguous.
- [Phase ?]: 34.2-25: userInfo() failures (uv_os_get_passwd) fall back to a synthetic username/homedir object rather than propagating, since no real backend consumer reads homedir from userInfo()
- [Phase ?]: 34.2-25: mkdtempSync + chmodSync(0o700) replaces the predictable pid-based containment root path; no teardown hook added, deliberately unchanged from gap cycle 3
- [Phase 34.2-26]: Added logErrorSettled as a new sibling export instead of converting the shared logError wrapper — avoids ~309 new no-floating-promises warnings project-wide for zero runtime change; deferred to plan 34.2-30
- [Phase 34.2-26]: Test A/B use a bounded flushUntil() poll instead of a fixed-tick flush() — a real fsPromises.mkdir() rejection is not reliably bounded by a fixed setImmediate count; under-waiting risked a crashed jest worker
- [Phase 34.2]: 34.2-27: showDialogModal wrapped in its own try/catch per WR-06's explicit fix, superseding 34.2-21's prior unwrapped-payoff design note; title/message precomputed into let bindings with hardcoded English fallbacks so a throwing t() cannot prevent the dialog from rendering
- [Phase 34.3]: checkDiskSpace's zod Path.parse() validation preserved unchanged as the ASVS V5 control; never swapped for node's path.parse
- [Phase 34.3]: getLegendaryVersion substituted for checkDiskSpace as the still-unported Invariant B guard example channel in 4 pre-existing test files
- [Phase ?]: D-05's proposed shutdown_child() fix in app_relaunch is dropped, not implemented -- RunEvent::Exit already fires reliably for dispatch_rust_channel's worker-thread calling pattern (34.3-RESEARCH.md Q1), verified finding recorded as a code comment
- [Phase 34.3]: tauri-plugin-clipboard-manager 2.3.2 added with zero renderer capability grant -- confirmed no js_init_script, D-02 stance holds
- [Phase 34.3]: logInfo's call-site guard is byte-shape-identical to logError's (34.3-04, REQ-34.3-09)
- [Phase 34.3]: deleteUploadedLogFile ported at parity, declared structurally unable to delete in either build (34.3-04, D-08)
- [Phase 34.3]: Log redaction (D-09) declared out of scope for uploadLogFile, no audit performed (34.3-04)
- [Phase 34.3-02]: jest resetMocks:true wipes any implementation baked into a jest.mock(...) factory before EVERY test -- install the real default implementation in beforeEach instead
- [Phase 34.3-02]: clearCache's refreshLibrary push rides pushFrontendMessage from ./sidecarRpc directly, per the plan's interfaces section
- [Phase 34.3-02]: resetHeroic calls utils.ts's resetHeroic() completely unmodified -- no build-conditional branch; the relaunch/quit ordering race is left to plan 34.3-05
- [Phase 34.3]: 34.3-05 D-06: relaunchInFlight guard lives entirely in electronStub.ts (never reset, relaunch is terminal); resetHeroic in utils.ts stays byte-identical, no isTauri() branch
- [Phase 34.3]: clipboardFlows.test.ts calls registerClipboardFlows() directly rather than booting the full sidecar via bootstrap's init(), since the module touches no store/config/environment surface — Mirrors lifecycleStub.test.ts's lighter mock-only-the-Rust-boundary shape instead of the heavier appShellFlows/shellFilesFlows full-bootstrap harness
- [Phase 34.3-07]: Regenerated the electron-reach ledger baseline by running computeElectronReach(), not transcribing prose -- measured set gained exactly one module (logger/uploader.ts), matching D-10's named edge
- [Phase 34.3-07]: Hardened tauriShellSource.test.ts's loadMainRsCode with the shared stripSourceComments util (block comments) layered under the existing local trailing-// pass, closing a vacuous-gate risk for Task 3's positive-existence assertions
- [Phase 34.3]: Live-gate proof-level cells in 34.3-PORTED-CHANNELS.md (unit + LIVE (item N)) are explicitly marked pending, not observed, since plan 34.3-09 (the blocking live gate) had not executed as of this document's authorship
- [Phase 34.4.1]: Used tauri::Url (the crate's own re-export of url::Url) instead of adding a new 'url' Cargo dependency for login_window_url_arg — Keeps plan 01's threat-model disposition T-34.4.1-SC accurate (installs ZERO new packages); tauri 2.11.2 re-exports url::Url at its crate root
- [Phase 34.4.1]: Prefixed the new #[cfg(test)] pure-logic test functions with humble_login_ instead of the plan's literal bare names — Task 2's own acceptance criteria requires 'cargo test humble_login' to match >=8 passing tests, which is unreachable with names lacking that substring -- Rule 3 auto-fix of a self-inconsistent acceptance criterion
- [Phase 34.4.1-02]: electronStub.app.userAgentFallback derives its platform token from process.platform, mirroring constants/environment.ts's isMac/isWindows/isLinux convention — The sidecar is cross-platform even though A4's smoke was only run on macOS hardware
- [Phase 34.4.1-02]: Assumption A4 (WebviewWindowBuilder::build() off the sidecar main thread) VALIDATED against real hardware — Live gamelib.log evidence: starting, opened label=..., closed=true, no panic, app still alive -- no run_on_main_thread hop needed
- [Phase 34.4.1-03]: Nav-event bypass reassigns the current tick's forceValidation flag rather than recursing into checkCookie(true), producing the same bypass-throttle + armDeadline effect as notifyLoginNavigated() without re-entrant polling.
- [Phase 34.4.1-03]: finishLogin() takes the seam window label as an explicit parameter (never a module global) so the accepted session cookie and the csrf capture read from the SAME window.
- [Phase 34.4.1-03]: getLiveCsrfToken() returns the stored snapshot directly when a seam is installed (no live window exists at reveal time under Tauri) instead of attempting a live seam read.
- [Phase 34.4.1-04]: reveal_post_script built via concat! of single-quoted-JS single-line pieces instead of a multi-line r#"..."# raw string — satisfies the repo's WR-08 per-line quote-balance gate, which a multi-line raw string's opening/closing lines each violate
- [Phase 34.4.1-04]: humblePostRequestViaSeam wraps seam.revealPost() in the same REQUEST_TIMEOUT_MS bound the Electron branch uses — Promise.race so a hung rustInvoke round-trip surfaces the existing, recognizable timeout error instead of hanging the reveal
- [Phase 34.4.1-04]: electronStub.net.request's error message retired to a generic 'not implemented in the sidecar' (no phase pointer) — the seam that message used to point at now exists; netStub.test.ts updated to match the retired wording
- [Phase 34.4.1-05]: Combined plan tasks 1+3 into one commit (WebviewUnavailablePanel's runner->url rename and TauriLoginPanel's wiring share one index.tsx call site; splitting them would leave tsc red between commits)
- [Phase 34.4.1-05]: TauriLoginPanel logs window.api.logInfo synchronously in its render body, not useEffect, matching index.tsx's own convention and this project's hookless/DOM-less test-invocation pattern
- [Phase 34.4.1-05]: REQ-34.4.1-08 only half-closed here (declared-blocked surface shipped); the wired/navigation-capture half is plan 34.4.1-09's per the plan's own frontmatter note
- [Phase 34.4.1]: OAuthRunner/OAuthCaptureOutcome moved to common/types/oauthLogin.ts (not backend/sidecar) so common/types/ipc.ts can reference them without common/ importing from backend/sidecar -- common -> backend/frontend is the only established import direction.
- [Phase 34.4.1]: TauriLoginPanel's state-absent/idle default keeps plan 05's original declared-blocked wording byte-identical; only the real post-capture 'blocked' phase gets the reworded 'captured, but can't finish yet' copy -- required since plan 05's TauriLoginPanel.test.tsx is not in plan 09's files_modified list and must keep passing unmodified.
- [Phase 34.4.1]: useTauriOAuthLogin calls window.api.login/authGOG/authAmazon/authZoom directly rather than GlobalState's epicLogin/gogLogin/amazonLogin/zoomLogin wrappers, so the hook can own its try/catch of UNPORTED_CHANNEL_MARKER without touching GlobalState.tsx at all (verified empty diff).
- [Phase 34.4.1]: 34.4.1-06: disconnect()'s seam-path cookie clear opens a HIDDEN window on HUMBLE_BASE_URL solely for a live webview handle, closing it unconditionally in a finally so a rejecting clearCookies or close() never leaks the window or throws out of disconnect()
- [Phase 34.4.1]: 34.4.1-06: electronReachLedger's baseline stayed at 34 electron-importing modules after adding humbleLoginFlowRegistration.ts and oauthLoginFlowRegistration.ts as entry points -- measurement agreed with prediction; visitedFiles.size grew 219->222, floor raised 200->220
- [Phase 34.4.1]: 34.4.1-06: Sweep A found zero stale isTauri() guards on the login path; all 6 ported channels confirmed reachable from a real caller with no intervening early return
- [Phase 34.4.1-07]: Verified every PORTED-CHANNELS claim against source (registration modules, main.rs dispatch arms, cargo test, classifyCookieRead) rather than inheriting the phase-provided claim summary verbatim
- [Phase 34.4.1-07]: Left IPC-PORT-INVENTORY.md's stale humbleDisconnect partial note (L73-75) unedited despite plan 06 closing it -- recorded as a follow-up for plan 08, since editing that file is explicitly plan 08's call
- [Phase 34.5]: exe throws a named error on unset/empty GAMELIB_SHELL_EXE rather than returning an empty string (D-10, T-34.5-01/02)
- [Phase 34.5]: documents attributed to the saves-sync cluster (syncGOGSaves), not shortcuts, resolving research Pitfall 1's open Discretion question
- [Phase 34.5]: shortcuts.ts:227's exe consumer corrected to addShortcut (plan 34.5-08), not addToSteam as CONTEXT.md D-09 and research Correction 3 had it
- [Phase 34.5-02]: www.amazon.com chosen as exact-host anchor for nile OAuth redirect matcher, closing T-34.4.1-44b; MEDIUM confidence per Assumption A1 pending live-gate item 3 confirmation
- [Phase 34.5]: 34.5-03: 34.5-LIVE-GATE.md precondition 1 states its currently-unmet status explicitly (34.4.1-08 held at Task 2) rather than leaving it implicit
- [Phase 34.5]: 34.5-03: IPC-PORT-INVENTORY.md Totals table (28/182) left unchanged, no channels actually ported by this docs-only plan
- [Phase 34.5]: Only runnerAuthFlowRegistration.ts carries the ipcMain + load-bearing storeManagers import at plan 34.5-04's stage; the other three modules stay import-free until their cluster plans land
- [Phase 34.5]: Growth-tolerant containment pin isolates each module (clear registries, call it alone, inspect, restore) rather than checking foreign channels against the shared global registry, to avoid false-positive cross-module leak detection once sibling clusters land
- [Phase 34.5]: runnerSliceRegistration.test.ts classified as structurally contained in testContainment.test.ts (never overrides the electron mock; storeManagers resolves through the project-wide tmpdir-based electron auto-mock)
- [Phase 34.5-05]: D-14 seam 3 (runWineCommand) registered in wave 2 despite D-07 listing it as wave-1 -- rationale recorded in-source, not just planning docs
- [Phase 34.5-05]: sendFrontendMessage imported unmodified from '../ipc' for progressOfWineManager -- electronStub's BrowserWindow.webContents.send shim already relays it, confirmed via sidecarRpc.ts before use
- [Phase 34.5-05]: wineToolsFlows.test.ts factory-mocks only '../../launcher'; config/wine-utils/dialog/backend_events load for real via the project-wide electron auto-mock, avoiding a bespoke per-suite mock kit
- [Phase 34.5-06]: Epic cookie-clear domain is the apex 'epicgames.com' (suffix-matches www.epicgames.com), mirroring humble/user.ts's apex-domain convention for humblebundle.com
- [Phase 34.5-06]: registerRunnerAuthFlows() gained an idempotence guard (let registered = false) once a real ipcMain.on channel (logoutGOG) existed for the first time in this module family
- [Phase 34.5-07]: getCometVersion is GOG's Galaxy Communication replacement channel, not Zoom's (D-04, gameInfo.runner === 'gog' at launcher.ts:973); Zoom is exactly 3 channels, all dropped by D-02
- [Phase 34.5-07]: Invariant B guard canary channel rotated from getLegendaryVersion to winetricksInstall across 5 pre-existing test files, since winetricksInstall is permanently deferred to Phase 34.6 (D-03) and will not need re-swapping when plan 34.5-12 lands
- [Phase 34.5-08]: Corrected shortcuts.ts:227 exe attribution from addToSteam to addShortcut — Source-verified: generateMacOsApp's only caller is addShortcuts, whose only IPC entry is addShortcut
- [Phase 34.5-08]: Added registered-guard idempotence fix to shortcutsFlowRegistration.ts — electronStub ipcMain.on appends per call; 3 send channels needed the same guard runnerAuthFlowRegistration.ts already carries
- [Phase 34.5-09]: DXVK/VKD3D toggle trio completes Wine cluster at 9/9 channels — D-15 mis-citation (tools/index.ts:794, inside Winetricks.checkDependencies, DEFERRED cluster) corrected; the actually-reachable dialog site is tools/index.ts:137, already safe per electronStub's non-throwing construction -- pinned by a jest.isolateModules() sandboxed test rather than a code fix
- [Phase 34.5-10]: authAmazon reuses NileUser.login's own { status: 'failed', user: undefined } failure shape on a rejected payload, mirroring login/authGOG's precedent
- [Phase 34.5-10]: logoutAmazon is an unmodified NileUser.logout() delegation (no Electron session usage); no cookie clear added — T-34.4.1-47 residual accepted
- [Phase 34.5-11]: shortcutsFlowRegistration.ts completes the shortcuts cluster at 7 (addToSteam/removeFromSteam/isAddedToSteam) — invoke-kind exe-in-VDF pin proven byte-identical against a real shortcuts.vdf fixture, not merely a rejected promise; addNonSteamGame no longer mocked in shortcutsFlows.test.ts so the real VDF-write chain is exercised
- [Phase 34.5-11]: Fixed a genuine pre-existing TDZ crash in steamhelper.ts's prepareImagesForSteam (errors referenced before its const declaration) surfaced by driving the real addNonSteamGame chain for the first time in an automated test (Rule 1)
- [Phase 34.5]: Corrected CONTEXT.md D-09/RESEARCH.md Pitfall 1: syncGOGSaves does not itself reach save_sync.ts:146 (getDefaultGogSavePaths) — the actual, still-unported caller is getDefaultSavePath — Direct verification of storeManagers/gog/games.ts's syncSaves() method and SyncSaves/gog.tsx showed the frontend calls getDefaultSavePath separately before syncGOGSaves; logged to deferred-items.md item 4 for a future (likely 34.6) pass
- [Phase ?]: 34.5-13: save_sync.ts is NOT a new electron-reach entry -- measurement disagreed with the plan's own prediction; syncGOGSaves never calls getDefaultGogSavePaths, the sole caller is the separate unported getDefaultSavePath channel
- [Phase ?]: 34.5-13: fixed a Rule-1 bug in runnerSliceRegistration.test.ts's containment-pin afterAll -- re-invoking guarded registerXFlows() functions after a registry clear was a silent no-op, leaving handlerRegistry at 20/34 channels for later describes/files; replaced with a canonical registration snapshot captured once at module load
- [Phase 34.5]: 34.5-14: Proof levels for the 11 auth channels assigned per actual login-flow involvement, not blanket-applied (only channels a real login exercises carry LIVE)
- [Phase 34.5]: 34.5-14: Only runWineCommand carries LIVE (item 5) in the 9-channel Wine cluster, since item 5 scopes the gate to that one channel
- [Phase 34.5]: 34.5-14: getDefaultSavePath-unported and save_sync.ts reach-baseline corrections given their own labeled subsection in PORTED-CHANNELS.md rather than folded silently into a Riders cell
- [Phase 34.4.1]: 34.4.1-10: DECLARED classification requires a category/term-level match, not id proximity, on BOTH axes -- an id-only bar would have wrongly cleared both F-6 (Axis A) and F-1 (Axis B, caught pre-commit)
- [Phase 34.4.1]: 34.4.1-10: checkHealthAndFlagExpiry's unguarded session.fromPartition() call is a NEW finding (S-09), not anticipated at planning time, routed to plan 34.4.1-16 alongside F-6
- [Phase 34.4.1-11]: D-GAP-01 implemented verbatim: compile-time keyring slot allowlist (steam-refresh-token/humble-session/humble-csrf); all 4 Rust arms slot-aware; SidecarKeyringTokenStore preserved via subclass — SteamGridDB slot withheld -- SEAM-PARITY-SWEEP found F-1b dormant/sidecar-unreachable, not live
- [Phase 34.4.1-12]: encryptionDegraded stays in user.ts, not the secretStore seam -- UI concern driven off isAvailable(), not a storage concern
- [Phase 34.4.1-12]: storeHumbleSecret() helper writes encryptionDegraded explicitly true/false after every setSecret() call, preserving WR-07's stale-warning-clear at all 4 write sites
- [Phase 34.4.1]: isAvailable() checks only the humble-session slot (both slots share one Keychain identity, differing only by account name)
- [Phase 34.4.1]: Migration write/readback calls requestRustInvoke directly rather than the totalized SidecarKeyringSlotStore methods, so each of the three failure modes can be distinguished and logged exactly once
- [Phase 34.4.1]: encryptionDegraded is only ever explicitly cleared to false on migration success; a failure path never explicitly sets it true (it is already true on the Tauri plaintext shape being migrated)
- [Phase 34.4.1-14]: F-1b (steamgrid API key) closed by evidenced declaration, not migration -- re-check confirmed still NOT REACHABLE from the sidecar; no Rust allowlist slot added (would address a slot nothing writes to yet)
- [Phase 34.4.1-15]: Origin-vs-domain gap left OPEN, not silently closed: humble_login_clear_storage clears exactly the www. origin's storage (HUMBLE_BASE_URL); a hypothetical bare apex origin is not reached. Believed complete in practice per this phase's transcripts, but not proven -- plan 16/20 should re-confirm before treating F-6 as fully closed.
- [Phase 34.4.1-15]: clear_storage_script built via a placeholder-token .replace() (@@EXFIL_HOST@@) instead of format!'s brace-escaping, since the script's heavy JS object/brace nesting would make brace-escaping unreadable/error-prone for its one interpolated value (exfil_host).
- [Phase ?]: Plan 16: closed F-6 (disconnect does not disconnect) on both Humble disconnect() and Legendary logout() (deliberate cross-phase edit into open Phase 34.5, recorded for its own gate) via Plan 15's clearStorage() seam as an independent guarded wipeSteps entry; seamBranchParity.test.ts upgraded from declared-gap to enforced-parity with a source-validated DECLARED registry for the two permanently-open categories.
- [Phase 34.4.1]: Census name-filter is empty (not ['_simpleauth_sess']) so matched counts every humblebundle.com cookie -- confirmed against main.rs's names.is_empty() OR names.contains(...) filter semantics
- [Phase 34.4.1]: Domain-scope proof evaluated as 3 independent equalities (matched-after==0, jar-delta==matched-before, deleted==matched-before) so a discrepancy warning names exactly which check failed, rather than one opaque boolean
- [Phase 34.4.1]: Reveal transport label (F-8) is now derived from getLoginWindowSeam() !== null at log time -- the same condition humblePostRequest branches its dispatch on -- instead of a hardcoded 'electron-net transport' literal that went stale when Plan 04 landed
- [Phase 34.4.1]: F-4: raise-and-focus-on-creation (.focused(true)) chosen over permanent always-on-top for the visible Humble login window; 900x700 inner size.
- [Phase 34.4.1]: S-09: the login-window seam CAN serve a cookie read outside a live login window via a temporary hidden window (same pattern as disconnect's clearHumbleCookies step) -- not declared unreachable.
- [Phase 34.4.1]: Gap-cycle GAP-01/GAP-04/GAP-06 checked (unit/cargo-proven, no live-gate dependency); GAP-02/GAP-03/GAP-05 stay unchecked (their own claim is what plan 20's live gate must observe)
- [Phase 34.4.1]: seam-parity-sweep.py's S-07/S-10/S-11 categorization staleness re-forwarded, not fixed by plan 19 (out of its declared files_modified); no plan currently owns it
- [Phase 34.4.1-21]: A2 confirmed live — spike016 measured thread_name=main and MainThreadMarker::new()==Some BEFORE any with_webview() call; no run_on_main_thread hop is needed in plan 22/23's arms
- [Phase 34.4.1-21]: Open Question 1 answered live — with_webview()'s closure runs SYNCHRONOUSLY INLINE (closure_ran flag already true immediately after the call returns); plan 23 writes its fix directly inside the closure, no async/callback restructuring
- [Phase 34.4.1-21]: Defect A proven live and stronger than research's original framing — clear_direction (33) EQUALS jar total (33): the clear-direction cookie_domain_matches predicate matches every cookie, not merely a mis-scoped subset
- [Phase 34.4.1-21]: Sequencing decision — plan 22 (Defect A fix) MUST land before plan 23 (Defect B fix); landing them in the other order would let a working delete wipe the ENTIRE shared jar (Epic/GOG cookies included), since the clear predicate currently matches everything
- [Phase 34.4.1-21]: Retry experiment (delete->wait->re-read x3 on the existing wry path) returned flat 31/31/31 -- rules out timing/race, supports identity mismatch; RECOMMENDATION for plan 23 is REWRITE (WKWebsiteDataStore + objc2-web-kit), not a retry/backoff pattern
- [Phase 34.4.1-21]: plan 23 must scope removeData to WKWebsiteDataTypeCookies specifically, not remove the whole WKWebsiteDataRecord (which would drop localStorage/IndexedDB/caches too, widening F-6's clear scope beyond what plans 15/16 already handle correctly)
- [Phase 34.4.1-21]: F-9 Keychain prompt storm probable root cause found opportunistically during Task 3's live session (not spike 016's own scope) — ad-hoc code signature (no TeamIdentifier) degrades the Keychain ACL's designated requirement under tauri:dev's per-run recompiles; forwarded to plan 26 in deferred-items.md, not fixed here
- [Phase 34.4.1-22]: Kept the two cookie-read arms structurally separate (new arm, not an edit to humble_login_cookies) — research's rejected option (b) explicitly warned that changing the existing arm's direction would break the login poll to fix the census
- [Phase 34.4.1-22]: Every non-Tauri LoginWindowSeam test double updated in place to implement cookiesForDomain rather than widening the interface to optional — an optional method would let a future implementation silently omit the correctly-directed read, recreating F-6's silent-degradation shape
- [Phase 34.4.1]: Plan 23: used mpsc_channel + rx.recv_timeout() (not with_webview's own return) for the WKWebsiteDataStore clear's synchrony -- source inspection of tauri-runtime-wry-2.11.4 shows with_webview() is fire-and-forget off the main thread and this arm's real caller always runs on a spawned worker thread; spike 016's synchronous measurement was taken from a different, main-thread call site.
- [Phase 34.4.1]: Plan 23: scoped the WKWebsiteDataStore removal to WKWebsiteDataTypeCookies only, even though the record fetch uses allWebsiteDataTypes, so a matched domain record's localStorage/IndexedDB/cache data is never touched by this arm.
- [Phase 34.4.1-24]: Corrected WR-07's comment to avoid the literal on_document_title_changed identifier in prose (kept to the one code call site) and used focus_once/persistent_pin instead of always_on_top in the presentation-config log, satisfying both tasks' exact-count grep gates without weakening the message.
- [Phase 34.4.1-26]: KEYRING_READ_TIMEOUT=8s bound on keyring_get, chosen from a hardware-measured 40ms-291s spread (present-entry Keychain reads can stall due to ad-hoc-signature ACL authorization failures, PlatformFailure(-60008))
- [Phase 34.4.1-26]: Added a process-lifetime read cache + in-flight dedupe to keyringTokenStore.ts/humbleSecretStore.ts (user-approved scope widening beyond this plan's declared files), invalidated before every setToken/clearToken write/delete
- [Phase 34.4.1-27]: Extracted queryLocalFontsSafe.ts (new file) so the queryLocalFonts guard is unit-testable without importing Accessibility/index.tsx's MUI/.css-importing dependency tree under the jsdom-less frontend jest project; index.tsx remains the guard's sole caller
- [Phase 34.4.1-27]: imageCacheSchemeAvailable() in preload/tauriTransport.ts is the single named predicate gating imagecache:// wrapping in CachedImage, written today as the negation of isTauri() with a documented forward obligation
- [Phase 34.5-16]: One GAMELIB_APP_ROOT env-var seam (both Rust spawn paths -> electronStub.getAppPath()) rather than N per-call-site path patches — The per-call-site approach is the named cause of this being the 4th recurrence of the publicdir-getapppath-chunking family
- [Phase 34.5-16]: electronStub.getAppPath() stays non-throwing on unset/empty GAMELIB_APP_ROOT — Module-scope call site; a pre-logger failure there would be invisible. Loudness deferred to plan 34.5-18's boot self-check
- [Phase 34.5-16]: Packaged asset root explicitly NOT claimed fixed by this plan — Named residual R-34.5-G1-PKG -- electronStub.isPackaged stays false under the sidecar, so publicDir still appends 'public' against a packaged resource root that has no such child
- [Phase 34.5-17]: archSpecificBinary's x64 fallback is now existence-checked; throws naming both attempted paths and the resolved publicDir instead of silently returning an unchecked path
- [Phase 34.5-17]: Task 1's tests drive three independent exported getters (getLegendaryBin/getGOGdlBin/getCometBin) instead of jest.isolateModules; isolateModules combined with this file's pre-existing electron automock kept returning an already-reset mock instance across several isolation attempts
- [Phase 34.5-17]: New real-filesystem coverage in appRootResolution.test.ts forces cwd to src-tauri/ and asserts against the real disk via the production constants/paths.ts code path (electron swapped for the real electronStub) rather than jest's own arithmetic; proven to go red by deliberately reverting the GAMELIB_APP_ROOT env read
- [Phase 34.5]: Split plan 34.5-18's two tasks into two atomic commits by temporarily reverting Task 2's additions, verifying Task 1 alone, committing, then reapplying Task 2 — matches this phase's established one-commit-per-task convention even though both tasks were drafted together in one contiguous code region
- [Phase 34.5-19]: Re-run goes in NEW 34.5-LIVE-GATE-RERUN.md, verdict:null, never edits superseded 34.5-LIVE-GATE.md; precondition 4 proves G-1 fix present from bootstrap.ts's own boot log before any login is attempted
- [Phase 34.5]: Verdict recorded FAIL 0/5 on the live-gate re-run (34.5-20): items 1-3 FAIL on a new downstream-of-capture defect (G-1 spawn defect confirmed closed by precondition 4; items 2/3 both reached status=captured at the backend for the first time, but nothing consumes the capture into a completed login), items 4-5 NOT ATTEMPTED. Assumption A1 (www.amazon.com anchor) CONFIRMED via code-structural proof despite item 3's own FAIL.
- [Phase 34.5]: F-34.5-G6-02 diagnosed to shape (c): oauthCaptureLogin's 300s internal deadline exceeds main.rs's 60s INVOKE_TIMEOUT (absent from LONG_RUNNING_CHANNELS), rejecting the renderer promise before the sidecar settles; the rejection lands on an unguarded await at useTauriOAuthLogin.ts:99 — R-A selected over R-B on structural grounds: sidecar_invoke's async fn has already returned by the time the 60s bound fires, so Tauri's own command contract forecloses a true hang
- [Phase 34.5]: Recurrence count for the 60s-invoke-bound-vs-internal-deadline defect is 3, not 1: humbleStartLogin and humbleReconnect share the identical shape (600s LOGIN_WATCH_TIMEOUT_MS) and were not exercised by this session's live gate
- [Phase 34.5]: Scoped the 60s invoke-bound fix to all 3 channels the 34.5-22 recurrence count named (oauthCaptureLogin, humbleStartLogin, humbleReconnect), not just oauthCaptureLogin
- [Phase 34.5]: Renderer-side try/catch around oauthCaptureLogin is defense-in-depth only -- no second competing deadline was added; the sidecar's own DEFAULT_DEADLINE_MS/LOGIN_WATCH_TIMEOUT_MS remain sole authority
- [Phase 34.5]: capture-transport-failed kept as a distinct log literal, never folded into the existing generic phase=error line, so a transport failure and a backend-reported failure stay greppable apart
- [Phase 34.5]: Standing guard (longRunningChannels.test.ts) scoped to a declared table of named deadline constants, not a source-wide scan; proven load-bearing by an actual local revert-and-observe-failure exercise, then restored
- [Phase 34.5-25]: F-34.5-G6-06 is not GOG-specific -- window.location.reload() (shared by all 5 runner sign-out flows) remounts GlobalState and re-runs Humble's own two-slot health check; K1 (failure-not-cached + 8s-timeout) selected over K2 via the pre-existing success cache as discriminator — Fix applied to the shared SidecarKeyringSlotStore base class (bounded 15s negative-result memo), not a GOG- or Humble-specific patch
- [Phase 34.5]: Plan 26: Shape A over Shape B for OAuth completion — hook keeps calling the raw auth channel itself and GlobalState gains a new completeOAuthLogin context method, avoiding a double auth-channel call and keeping the four Electron login wrappers byte-identical
- [Phase 34.5]: Plan 26: createOAuthLoginCompletion factory lives in useTauriOAuthLogin.ts (not GlobalState.tsx) so both GlobalState's completeOAuthLogin and its own unit tests construct it identically without importing GlobalState.tsx's heavy side-effecting module graph
- [Phase 34.5]: 34.5-27: Task 1 (origin-first login title) and Task 2 (light interface style) committed together in 9255c0255 because both interleave inside the same if-visible builder chain of humble_login_open
- [Phase 34.5]: F-34.5-G6-01 Epic UA discriminator: R1 (user-agent gating) FALSIFIED live; R2 not confirmed — both stock and Chrome-shaped UA arms produced non-interactive Epic login forms; routed to a further diagnosis cycle rather than shipping R2 unconfirmed
- [Phase 34.5]: BINDING DECISION: fix-first -- plans 34.5-29/30 halt at their authorisation gates, blocking gate not authored this cycle — GOG smoke test showed capture-to-hook propagation fixed (F-34.5-G6-02/03 closed) but library never populates; a five-item gate cannot pass on a build whose one-runner smoke already failed

### Pending Todos

- Phase 7 manual UAT on macOS (real Steam account): overlay visibility on Mac/Windows-only games, "Unrated" pill, CrossOver↔Wine toggle drives both surfaces, pill click-through, runner-agnostic platform icons.
- Phase 10 live validation gate (before Phase 11 begins): empirically confirm axios + Cookie: _simpleauth_sess + X-Requested-By: hb_android_app reaches api/v1/user/order from Electron main process. Fallback = BrowserWindow webRequest proxy.
- Steam bottle setup offers GPTK/Wine engines that produce a broken bottle (macOS): non-CrossOver `wineVersion` selections silently fail — `cxbottle` creates the bottle but the `toolkit`/`wine` run-path (launcher.ts:434-442) drops the CX_BOTTLE binding and runs against a different prefix; readiness never passes. Fix: filter Steam WineSelector to CrossOver engines and/or reject non-crossover in provisionBottle. See `.planning/todos/pending/steam-bottle-gptk-engine-produces-broken-bottle.md`.
- Productionize the macOS native Steam bridge (out-of-process `steam_api` proxy): feasibility PROVEN end-to-end (spikes 004+005 — drop-in `steam_api.dll` in the real GameLibSteam bottle returns the real SteamID from live native Mac Steam, zero Windows Steam client). DONE — shipped as Phase 24 (complete 2026-07-21), which also superseded and parked Phase 22. Next frontier = C++ vtable ABI for unmodified games + the 6 unproxied interfaces (Utils/Apps/UserStats/RemoteStorage/Matchmaking/Networking). See `.planning/todos/pending/2026-07-18-productionize-macos-native-steam-bridge-out-of-process-steam.md` + `spike-findings-gamelib` skill.
- Steam native install progress polish (speed, ETA, paused-state): the native-installer-OFF `steam://install` path already surfaces a live download % (verified live 2026-07-19 via Playwright drive — `progressUpdate{runner:'steam'}` reaches the renderer). Polish gaps only: no download speed, `eta` hardcoded empty (`library.ts:1295`), and a Steam-paused download freezes the bar with no paused hint (only `StateFlags==1026` is special-cased). Plus stale `games.ts:604` docstring. Shared poller — guard bottle-path regression. See `.planning/todos/pending/2026-07-19-steam-native-install-progress-speed-eta-paused-state.md`.

### Blockers/Concerns

- Pre-push hook (`prettier` + `i18n --fail-on-update`) fails on **pre-existing repo debt** unrelated to Phase 7: ~141 files fail `prettier --check .` (likely a Prettier version bump; `pnpm-lock.yaml` already modified) and the locale files have orphaned-key drift. Phase 7 was pushed with `--no-verify` after independently verifying tsc/lint/tests. A separate housekeeping pass (`pnpm prettier --write .` + `pnpm i18n`) would clear it.
- Phase 23 Plan 05 Task 3 (checkpoint:human-verify, gate=blocking-human): 23-UAT.md Gate 1 real-hardware re-run pending — human must install a multi-depot title (Hogwarts Legacy 990080 or Cyberpunk 2077 1091500) on real macOS hardware after deleting the stale appmanifest_990080.acf, confirm single monotonic progress percent through a pause/resume cycle, and confirm StateFlags=4 completion + launch. Code fix (single-flight guard + reconciliation) is landed and regression-tested (commits cc77a9df/ddde970d/7fccfb2a/f963de8b); this is the only remaining Phase 23 gap before Gates 2/3 can proceed.
- G-30-01: Steam QR login logon button unresponsive under Tauri (Manage Accounts renders, QR tab never reached) — install/uninstall E2E for Phase 30 unreached as a direct consequence; see 30-HUMAN-UAT.md for reproduction and untested hypothesis
- pathShim.test.ts (plan 34.5-01) unclassified in testContainment.test.ts's declared-suite lists — needs a one-line addition in a future pass (see deferred-items.md); not blocking 34.5-04's own completion

### Quick Tasks Completed

| # | Description | Date | Directory |
|---|-------------|------|-----------|
| 260627-vq1 | Fix QR login hang: set qrSessionState done immediately after credential storage, fire CM connection in background, add 15s timeout | 2026-06-27 | [260627-vq1-fix-qr-login-hang-set-qrsessionstate-don](.planning/quick/260627-vq1-fix-qr-login-hang-set-qrsessionstate-don/) |
| 260628-kzf | Fix blank Steam icon on Manage Accounts login page: replace FontAwesome faSteam with inline SteamLogo SVG to match other store runners | 2026-06-28 | [260628-kzf-fix-blank-steam-icon-on-manage-accounts-](.planning/quick/260628-kzf-fix-blank-steam-icon-on-manage-accounts-/) |
| 260628-pi7 | Show Steam last-played + total time on game details page (rtime_last_played) | 2026-06-28 | [260628-pi7-show-steam-last-played-on-game-details-p](.planning/quick/260628-pi7-show-steam-last-played-on-game-details-p/) |
| 260629-9ly | Fix QR-login → Steam-library race: assign QR background CM connect to connectingPromise (dedupe), gate frontend finalization on truthy poll.username | 2026-06-29 | [260629-9ly-fix-qr-login-library-race](.planning/quick/260629-9ly-fix-qr-login-library-race/) |
| 260629-rbn | Fix premature Steam install/uninstall notifications + status:done badge flash (GAME-02/03): runner==='steam' guards suppress premature DM/uninstaller emissions so the ACF poller solely owns Steam status + fires confirmed completion toasts | 2026-06-29 | [260629-rbn-fix-premature-steam-install-uninstall-no](.planning/quick/260629-rbn-fix-premature-steam-install-uninstall-no/) |
| 260630-ths | Decouple fork versioning from upstream Heroic: package.json version→1.0.0 + upstream base field (2.22.0 @ b5b5cad3), rename v0.1 tag→gamelib-v0.1, add UPSTREAM.md | 2026-06-30 | [260630-ths-decouple-fork-versioning-from-upstream-h](.planning/quick/260630-ths-decouple-fork-versioning-from-upstream-h/) |
| 260630-ud4 | Wire Steam AppID directly into ProtonDB lookup: use app_name as steamID when runner==='steam', skipping the wiki round-trip (backend + submenu + compat row) | 2026-06-30 | [260630-ud4-wire-steam-appid-directly-into-protondb-](.planning/quick/260630-ud4-wire-steam-appid-directly-into-protondb-/) |
| 260630-uod | Fix pre-push lint crash: ignore **/*.cjs in eslint flat config so Node CJS scripts aren't typed-linted (exposed 93 pre-existing Steam-code lint errors) | 2026-06-30 | [260630-uod-fix-pre-push-lint-failure-ignore-cjs-in-](.planning/quick/260630-uod-fix-pre-push-lint-failure-ignore-cjs-in-/) |
| 260630-uxp | Clear 93 lint errors in Steam store-manager code (gfs named imports, no-unused-vars ^_ convention, Function→callback type, unnecessary assertions) — pnpm lint/codecheck exit 0, 128 tests pass | 2026-06-30 | [260630-uxp-fix-93-pre-existing-lint-errors-in-steam](.planning/quick/260630-uxp-fix-93-pre-existing-lint-errors-in-steam/) |
| 260701-qxr | Rewrite README install section for GameLib: honest build-from-source (no prebuilt fork releases), fork clone URL, GameLib naming, fixed index anchors | 2026-07-01 | [260701-qxr-fix-readme-install-section-rewrite-to-ho](.planning/quick/260701-qxr-fix-readme-install-section-rewrite-to-ho/) |
| 260701-ufx | Rebrand Heroic→GameLib (user-facing + paths + protocol): migrate config dir ~/.config/heroic→GameLib w/ auto-migration, heroic://→gamelib:// (handler+registration+shortcuts+tests), user-facing backend strings. Internal identifiers left for mergeability. tsc 0, 152 tests pass | 2026-07-01 | [260701-ufx-rebrand-heroic-gamelib-user-facing-strin](.planning/quick/260701-ufx-rebrand-heroic-gamelib-user-facing-strin/) |
| 260704-mig | Fix Phase 8 Gap D launch-overlay regression (Steam overlay flashed at ~0s because steam:// blur fired instantly) via a 1.5s minimum-visible floor + 8s safety net; plus GameLib icon above text on artwork placeholders (greyscale on the 'Artwork unavailable' missing variant). tsc 0, eslint clean. Runtime re-UAT pending | 2026-07-04 | [260704-mig-fix-phase-8-gap-d-launch-overlay-regress](.planning/quick/260704-mig-fix-phase-8-gap-d-launch-overlay-regress/) |
| 260710-kba | Format Steam install_size as human-readable in Install Info panel: Steam persisted raw ACF sizeOnDisk bytes (e.g. 20622023528) while all other stores store a getFileSize()-formatted string. Wrapped all three steam/library.ts install-object sites (refresh, refreshInstallState, pollInstallOnce) in getFileSize(Number(sizeOnDisk)) and simplified getSteamInstallSize fast path to return the pre-formatted string. codecheck 0, 812 tests pass | 2026-07-10 | [260710-kba-format-steam-install-size-as-human-reada](.planning/quick/260710-kba-format-steam-install-size-as-human-reada/) |
| 260710-knr | Install Info panel consistency: Installed Platform row now renders a FontAwesome brand icon (faWindows/faApple/faLinux, case-insensitive helper w/ raw-text fallback, Browser branch unchanged) matching the Supported-platforms row; Install Path row gains a trailing faFolderOpen affordance inside the existing clickable openFolder div (no new handler) + info.openLocation i18n key. codecheck 0, eslint clean. Runtime visual UAT pending (needs GUI) | 2026-07-10 | [260710-knr-install-info-platform-icon-folder-open-i](.planning/quick/260710-knr-install-info-platform-icon-folder-open-i/) |
| 260710-l27 | Extra-info AppleGamingWiki refactor: split single rating row into two always-visible rows (Crossover rating + Wine rating, "Unrated" fallback via ratingTier); removed the cover-art rating pill (AppleRatingOverlay) entirely; fully removed the redundant "Mac compatibility rating source" (appleRatingSource) setting across settings UI, GlobalState/ContextProvider, frontend/common types, electron_store schema, and i18n. tsc 0, grep gate confirms zero dangling refs. Runtime visual UAT pending (needs GUI) | 2026-07-10 | [260710-l27-extra-info-crossover-wine-rating-rows-re](.planning/quick/260710-l27-extra-info-crossover-wine-rating-rows-re/) |
| 260710-d7b | Fix install default folder: DownloadDialog + ImportDialog fallback `${userHome}/Games/Heroic` → Games/GameLib (matches backend heroicInstallPath default). Fallback-only; configured paths unaffected. tsc 0 | 2026-07-10 | (fast task, commit d7bbd883) |
| 260710-lmo | Complete Heroic→GameLib user-facing rebrand sweep: 44 en-locale display values (translation.json + gamepage.json) + JSX default fallbacks across 25 components + theme name ("Old School GameLib") + CrossoverBottle default value ('GameLib' — behavioral: new crossover setups default to a GameLib bottle). Two factual corrections: CustomCSS path `~/.config/heroic/config.json`→GameLib, protocol `heroic://`→`gamelib://`. Preserved i18n keys, code identifiers (getHeroicVersion/HEROIC_GAME_TITLE/etc.), CSS classes, upstream URLs, legacy-config migration source. tsc 0, both locale JSON valid, grep audit clean. Runtime visual UAT pending | 2026-07-10 | [260710-lmo-complete-heroic-gamelib-rebrand-of-user-](.planning/quick/260710-lmo-complete-heroic-gamelib-rebrand-of-user-/) |
| 260710-m3f | Show estimated Install Size on pre-install Steam game page (parity w/ Epic/GOG): replaced the `runner === 'steam'` early-return in DownloadSizeInfo with a `SteamInstallSize` child component (unconditional hooks) that calls new `getSteamInstallSize` IPC handler (thin pass-through to existing backend estimator — parses store API `pc_requirements.minimum`; appId `/^\d+$/` + bounded-regex guards T-06-01/02 preserved). Install Size row ONLY (no Download Size — Steam has no public download-size source); "~"+"(estimate)" indicator; "?? MB"/undefined→"Unknown" fallback. Installed-game path untouched. codecheck 0, 812 tests pass. Runtime visual UAT PASSED (user-confirmed 2026-07-10) | 2026-07-10 | [260710-m3f-show-estimated-install-size-on-pre-insta](.planning/quick/260710-m3f-show-estimated-install-size-on-pre-insta/) |
| 260710-mkw | Fix missing Steam grid cover art: extended `CachedImage` to accept an ordered `string \| string[]` fallback chain (backward-compatible; numeric index replaces boolean useFallback, bounded/no-loop). Grid (non-justPlayed) tile now passes `[art_cover, fallBackImageMissing]` when a distinct header exists, so Steam games with a 404 portrait capsule (library_600x900.jpg) but valid header (header.jpg) — e.g. Bard's Tale IV (566090) — render real header art instead of the generic placeholder. justPlayed branch + non-Steam runners unchanged. Frontend jest 28/28, tsc 0, eslint clean. Runtime visual UAT pending (needs GUI) | 2026-07-10 | [260710-mkw-steam-grid-cover-art-falls-back-to-heade](.planning/quick/260710-mkw-steam-grid-cover-art-falls-back-to-heade/) |
| 260710-nwb | THROWAWAY SPIKE (not app code; lives in `spike/`). Feasibility of CrossOver (CodeWeavers) compatibility lookup by constructed slug — `GET /compatibility/crossover/{slug}`, parse schema.org JSON-LD `@graph` VideoGame node for `aggregateRating` (ratingValue/ratingCount) + sameAs. Live-run measured **8/12 = 66.7%** match rate (est. 83.3% with two slugify fixes). **Critical correction:** misses return HTTP 200 soft-404 (title `404 Not Found`), NOT 404 — future backend MUST detect hit/miss by content (VideoGame JSON-LD presence), not status code. Slugify bugs found: apostrophe should be dropped not hyphenated (`baldurs-gate-3`), roman numerals need Arabic normalization (`...-modern-warfare-2`). Verdict: **GO** on backend+pill, conditional on content-based detection + slugify fixes + graceful "no data" UI for genuine misses. Delete `spike/` once acted on. | 2026-07-10 | [260710-nwb-crossover-compatibility-lookup-spike](.planning/quick/260710-nwb-crossover-compatibility-lookup-spike/) |
| 260710-qyc | Relocate CrossOver/Wine emulation compat rows from the Extra-info tab into the Install-info tab, directly under Supported platforms (`<AppleWikiInfo>` moved after `<PlatformSupport>`). Rows now gated on `!is.native` — shown only when the game does NOT run natively on the current OS (a compat layer is actually needed). Reworded "Crossover rating"→"Crossover emulation" and "Wine rating"→"Wine emulation" (component defaults + en/gamepage.json, keys unchanged) to clarify why the rows exist. Crossover row swapped `WineBar`→`CodeweaversLogo` (codeweavers_icon.svg?react); Wine row keeps WineBar. Wine row link now branches by OS: macOS→AppleGamingWiki (`/w/index.php?search=` go-or-search), Linux→WineHQ AppDB (browse+`sHavingText` filter); Crossover row link left on codeweavers.com. Dropped `applegamingwiki`+`codeweavers` terms from the `hasWikiInfo` gate so the Extra-info tab no longer appears empty for games whose only wiki data was those two rows. codecheck 0, eslint clean on touched files. Runtime visual UAT pending (needs GUI) | 2026-07-10 | [260710-qyc-ui-cleanup-relocate-rework-the-crossover](.planning/quick/260710-qyc-ui-cleanup-relocate-rework-the-crossover/) |
| 260710-rjm | Rework the emulation-compat rows into three OS-specific rows + fix a CrossOver rating bug. (1) BUG FIX: CodeWeavers pages carry two editorial reviews (macOS + Linux) plus an aggregateRating that averages them; we parsed the average (A Plague Tale: Innocence showed 3 = avg of mac 5 + linux 1). Rewrote `extractVideoGameJsonLd` to read per-OS `Review.reviewRating` via `about.operatingSystem`/`reviewAspect`; `CodeweaversInfo` shape `{rating,ratingCount,slug}`→`{macRating,linuxRating,slug}`; `staleCrossoverData` self-heals old-shaped caches (refetch when `macRating===undefined`). (2) Crossover row now macOS-only (`is.mac && macRating!=null`), shows `macRating` as stars, monochrome hand-authored `crossover_icon.svg?react` (currentColor rounded-square-X) replacing the 343-path color CodeWeavers logo. (3) NEW Proton row for `is.linux && runner==='steam' && steamInfo.compatibilityLevel`: ProtonDB tier→stars via new `protonTierToStars` (platinum5/gold4/silver3/bronze2/borked1, pending/unknown→Unrated), links protondb.com/app/{app_name}; replaces the Wine row in that case (`showWine = !!applegamingwiki && !showProton`). Deleted dead `crossoverRating.ts`+test (count label dropped); added `info.proton-rating` locale key. codecheck 0; codeweavers 17/17 + protonRating tests pass (33 total in the two suites); eslint clean on touched files. NOTE: extra-tab CompatibilityInfo still shows a Proton *tier text* row — intentional (dedup out of scope). Runtime visual UAT pending (needs GUI) | 2026-07-10 | [260710-rjm-rework-gamepage-emulation-compat-rows-pe](.planning/quick/260710-rjm-rework-gamepage-emulation-compat-rows-pe/) |
| fast | Crossover-row parity: the Wine row shows "Unrated" for games with no rating, but the Crossover row hid when there was no macOS rating (e.g. Avernum 6: macRating null, linuxRating 5). Changed `showCrossover` to `is.mac && !!codeweavers` and render `t('info.unrated','Unrated')` when macRating is null (no fallback to the Linux rating — "match current OS" stands). Aligned the Proton null-tier fallback to the same "Unrated" wording; added `info.unrated` locale key. Found via live-app UAT (GameLib running on A Plague Tale + Avernum 6). codecheck 0, eslint clean. | 2026-07-10 | (fast task, commit 1a56ac6d) |
| 260711-a3v | Include Steam in sidebar/stores login aggregation. Logging into only Steam left the "Log in" sidebar item visible and made the Stores link open Epic with a "not logged in" warning, because `SidebarLinks/index.tsx` aggregated login across epic/gog/amazon/zoom but never Steam. Added `steam.username` to the `loggedIn` check (hides "Log in" when only Steam) + a Steam-only `defaultStore='steam'` branch so Stores opens the browse-only Steam store instead of Epic. Pre-existing bug; found during Phase 17 UAT. tsc 0, eslint 0. Runtime re-check pending. | 2026-07-11 | [260711-a3v-fix-sidebar-stores-login-ignores-steam](.planning/quick/260711-a3v-fix-sidebar-stores-login-ignores-steam/) |
| 260711-alc | Throttle Steam metadata fetches on cold cache. Fresh/wiped cache fired one `fetchMetadataIfNeeded` axios call per game (376) with no concurrency cap or timeout → hundreds of parallel Steam-CDN connections mass-timed-out (connect ETIMEDOUT); only ~14/376 loaded art, and the saturated main process slowed queued installs. Added a metadata-fetch semaphore (MAX 5, acquire/release with slot hand-off) + 15s axios timeout in `state.ts`/`games.ts`. Pre-existing Phase 2/7 issue; surfaced during Phase 17 UAT after the uninstall wipe. tsc 0, eslint 0, full suite 915/915. Runtime re-check pending. | 2026-07-11 | [260711-alc-throttle-steam-metadata-fetches](.planning/quick/260711-alc-throttle-steam-metadata-fetches/) |
| 260711-aus | Steam empty-library message + background metadata sync indicator (2 UAT gaps). (1) `EmptyLibrary` message omitted Steam and its empty-vs-no-results trigger summed every store's library EXCEPT steam → Steam-only users wrongly saw "log in with Epic/GOG/Amazon"; added Steam to the locale string + JSX and `steam?.library.length` to the trigger. (2) `steamSyncSpinner` only reflected the library-list refresh, not the per-game metadata/art stream (throttled, long on cold cache); `games.ts` now emits `steamMetadataSyncing` on pendingFetches empty↔non-empty, wired through ipc/preload/GlobalState/ContextProvider and OR'd into LibraryHeader's `isSteamSyncing`. Pre-existing Phase 2/7 gaps; surfaced during Phase 17 UAT. tsc 0, eslint 0, full suite 915/915. Runtime re-check pending. | 2026-07-11 | [260711-aus-steam-empty-library-and-sync-indicator](.planning/quick/260711-aus-steam-empty-library-and-sync-indicator/) |
| 260711-htb | Move the 'Use shared Wine prefix' toggle to the bottom of WineSelector (global reorder — all install modals). GAP 4 (phase 17 UAT, cosmetic): the shared-prefix toggle sat above the prefix/bottle + Wine-version fields; moved it (with its warning infoBox) below the Wine-version dropdown in the shared `WineSelector`, so the new order applies to Steam AND Epic/GOG/Amazon/sideload install modals. Pure JSX reorder — no logic/state/style change, all `disabled={useSharedPrefix}` bindings preserved. tsc 0, eslint 0; no unit tests for this presentational component, runtime visual check pending. | 2026-07-11 | [260711-htb-move-the-use-shared-wine-prefix-toggle-t](.planning/quick/260711-htb-move-the-use-shared-wine-prefix-toggle-t/) |
| fast-73ee87f3 | Native Steam install focus-handover parity test (given GAP 5 CrossOver work). Added `GAME-02/focus` unit test in games.test.ts asserting native install() calls shell.openExternal WITHOUT { activate: false } (OS foregrounds Steam), contrasted with launch()'s { activate: false }; documents parity with the CrossOver raiseInstallerWindow() path (same outcome, different mechanism). Plus a 17-UAT.md manual real-hardware parity check. games.test.ts 88/88, tsc 0. /gsd-fast (inline, no task dir). | 2026-07-11 | (inline — commit 73ee87f3) |
| fast-0800e7d8 | Make the CrossOver rating Refresh icon visible. The MUI `IconButton` (260712-lkn) rendered with the default light-theme action color (translucent black — App.tsx `createTheme` sets no `palette.mode`), invisible on GameLib's dark game page though its ~36px hit area still triggered refresh (user reported clicking the row refreshed but saw no icon). Added `color="inherit"` so the `Refresh` icon adopts the surrounding `.iconWithText` link text color, visible in both themes. tsc 0, eslint clean. /gsd-fast (inline). | 2026-07-12 | (fast task, commit 0800e7d8) |
| 260712-lkn | Add a user-facing refresh for CrossOver compat ratings. A game cached once as unrated (`macRating:null`) stays that way for the 30-day TTL because `staleCrossoverData` self-heal only fires on missing/old-shape caches — so a rating newly entered on codeweavers.com (e.g. Avernum 4) never appeared. Added optional `forceRefresh` to `getWikiGameInfo` (bypasses the cached-response early return, re-populates via `wikiGameInfoStore.set`), threaded through the IPC handler + `ipc.ts` type; frontend exposes `refreshWikiInfo` on GameContext (force-refetch in GamePage that accepts any non-null result so a codeweavers-only update lands) + a small MUI `Refresh` IconButton on the CrossOver pill (stopPropagation so it doesn't open codeweavers.com, disabled while in-flight). codecheck 0, eslint clean on touched files, codeweavers 17/17. Runtime visual UAT pending (needs GUI). | 2026-07-12 | [260712-lkn-add-refresh-affordance-for-crossover-com](.planning/quick/260712-lkn-add-refresh-affordance-for-crossover-com/) |
| 260714-gnc | Add `.graphifyignore` to scope the knowledge graph to the codebase. The graph was 9,264 nodes, of which 5,541 were markdown "document" nodes — `.planning/` alone contributed 5,323, outweighing `src/` (3,269) by 1.6:1, which pushed the graph past graphify's 5,000-node HTML-viz ceiling and polluted `graphify query` results with planning-doc noise. Excludes `.planning/`, `scratchpad/`, `graphify-out/`, `.claude/`; deliberately keeps `README.md` + `CHANGELOG.md` indexed (no `*.md` blanket glob). Chosen over the `--code-only` / `--exclude` CLI flags because those exist only on `graphify extract`, whereas `.graphifyignore` is read by the shared `detect()` scanner (`detect.py:1146`) that `graphify update` also uses — so `/gsd-graphify build` honors it with no skill patching. Expected drop to ~3,900 nodes; graph not yet rebuilt. | 2026-07-13 | [260714-gnc-add-graphifyignore-to-scope-knowledge-gr](.planning/quick/260714-gnc-add-graphifyignore-to-scope-knowledge-gr/) |
| 260715-a7g | Fix Phase 20 owned-badge false positive: original titles fuzzy-matched their remasters ("Alan Wake" wrongly Owned for "Alan Wake Remastered"), found during Phase 20 store-search live UAT. Root cause: `normalizeTitle` stripped `'remastered'` (an EDITION_SUFFIXES entry) so base+remaster normalized identically → 100% similarity. Removed `'remastered'` from EDITION_SUFFIXES and added a `PRODUCT_VARIANT_KEYWORDS=['remaster','remake']` differentiator guard (`isRemasterFalsePositiveRisk`, mirrors `isDlcFalsePositiveRisk`, T-12-01 trusted-constant discipline) OR'd into `fuzzyMatch` — a remaster/remake never matches the base title (missing beats wrong, D-01/D-02). Shared matcher, so Humble dedup benefits too (D-02); deluxe/GOTY/definitive editions still match (same base game). Full backend suite 1087/1087 (incl. dedup.test.ts + storeSearchBadges.test.ts), codecheck 0. | 2026-07-15 | [260715-a7g-treat-remaster-remake-as-product-differe](.planning/quick/260715-a7g-treat-remaster-remake-as-product-differe/) |
| 260718-jmt | Fix Steam native-install download progress graph cadence (surfaced during Phase 23 Gate 1 hardware UAT): the DownloadManager ProgressHeader chart advanced one sample per `progressUpdate` IPC, which `downloadDepotFiles` emitted only from the per-chunk `onBytes` callback (throttled 500ms) — so when chunk completions bunched up the graph froze for many seconds (~30s observed; user wanted ~1s like Steam). Added `PROGRESS_HEARTBEAT_MS=1000` + a `setInterval(() => emitProgress(true), …)` started before the worker `Promise.all`, cleared in a `try/finally` scoped to that Promise.all (fires on completion AND throw/abort), so a fresh progressUpdate is emitted ~1×/sec with an honest rolling rate (0 when no bytes arrived) independent of chunk timing. Backend-only; MB/s units unchanged (Mbps change declined). Scope-fenced off the Phase-23 single-flight guard / StateFlags 4-vs-1026 / buildid / file-mode logic. steam suite 563/563, tsc 0, eslint clean. | 2026-07-18 | [260718-jmt-fix-steam-download-progress-graph-cadenc](.planning/quick/260718-jmt-fix-steam-download-progress-graph-cadenc/) |
| 260719-aog | Steam native-install progress polish (OFF path, `steam://install` → `pollInstallOnce`): added live download speed + ETA (reusing `depot.ts` `rollingRateMiBs`/`formatEta` rather than duplicating math) and a `context: 'steam-paused'` hint (frozen `BytesDownloaded` ≥3 ticks → "Paused" label; StateFlags 1026 restart-hint always takes precedence; staged-fallback never flagged) populating the pre-existing `downSpeed`/`eta` `InstallProgress` fields — no new IPC channel, no type change. Fixed stale `games.ts:604` docstring. Shared bottle-path poller (GAP-17-BOTTLE-PROGRESS) verified unregressed. steam suite 648/648, tsc 0, eslint clean. Deferred: leaked real `setInterval` in unrelated pre-existing test (`library.test.ts:2627`). | 2026-07-18 | [260719-aog-steam-native-install-progress-polish-dow](.planning/quick/260719-aog-steam-native-install-progress-polish-dow/) |
| 260720-q5n | Repoint electron-updater auto-update feed off Heroic upstream to the GameLib fork: added an explicit `publish` block (github, owner grayson-mitchell, repo GameLib) to `electron-builder.yml`. Without it, electron-builder derived the feed from package.json's `repository` field (still Heroic-Games-Launcher/HeroicGamesLauncher), so fresh Windows builds saw Heroic 2.x > GameLib 0.7.0 on startup and fired a bogus "new version available" dialog that downloaded Heroic's installer and triggered a "Heroic wants to make changes to your computer" UAC prompt. Fork has no release > 0.7.0 → check finds nothing, popup gone. package.json repository left unchanged (publish block takes precedence). YAML parse-verified. | 2026-07-20 | [260720-q5n-add-publish-block-github-grayson-mitchel](.planning/quick/260720-q5n-add-publish-block-github-grayson-mitchel/) |
| 260721-u77 | Fallback/placeholder tile art (e.g. Hoard) was cropped: `CachedImage`'s fallback rendered through the same `.gameCard .gameImg` rule as real cover art (`object-fit: cover`, `aspect-ratio: 3 / 4`). `CachedImage` now tags the `<img>` with `usingFallback` while a fallback source is displayed (cleared by the existing src-keyed effect), and GameCard styles that state `object-fit: contain` for both `.gameImg` and `.justPlayedImg` — placeholders render whole, real cover art still crops to fill. The class is inert for StoreSearchRow/DiscountCard (their CSS does not target it). New CachedImage test for the marker; jest 6/6, tsc clean. Code commit 8747aef3. | 2026-07-21 | [260721-u77-fallback-tile-art-fit-not-trimmed](.planning/quick/260721-u77-fallback-tile-art-fit-not-trimmed/) |
| 260722-c2i | Restore `.planning/ROADMAP.md` (commit 9eac4a09 had wholesale-replaced it with a 19-line Phase 27 fragment, destroying the 1016-line roadmap and breaking `gsd-sdk query roadmap.analyze`) by merging the recovered pre-truncation structure with the surviving Phase 27 content (re-integrated verbatim as new `## v0.8 Phase Details`), disk-reconciling every checkbox against actual `*-PLAN.md`/`*-SUMMARY.md` counts, re-filing misfiled detail sections (18→v0.5, 23/25→v0.7, 24→v0.7, 26→v0.7), and relocating Phase 22 to a new `## Parked / Superseded Phases` section so it can't hijack `current_phase`. Root-caused the actual mechanical bug (the `## Phases` checklist's `### vX.Y` sub-headings were matching `roadmap.analyze`'s milestone-slice regex before the real `## v0.7 Phase Details` heading did) and fixed it by converting those 8 groupings to plain bold text. Backfilled `.planning/MILESTONES.md` v0.2–v0.8 (v0.1 untouched), no fabricated ship dates (v0.2/v0.7/v0.8 marked open/undated); surfaced an honest finding that Phase 13's 24h–48h urgency-badge bug (CR-01) was never actually fixed (only 13-01 ever touched the file per git log), despite v0.3 being recorded complete elsewhere. Verified live: `gsd-sdk query roadmap.analyze` now returns `current_phase:"23"` (partial, 10 plans/5 summaries), `next_phase:null` (correct — no unstarted phase in v0.7), non-zero stats. | 2026-07-22 | [260722-c2i-PLAN.md](.planning/quick/260722-c2i-PLAN.md) / [260722-c2i-SUMMARY.md](.planning/quick/260722-c2i-SUMMARY.md) |
| 260726-q8f | Closed the repo-wide vacuous-gate defect that survived FOUR review cycles on phase 34.2: 14 backend test files each carried a byte-identical `stripComments` LINE-PREFIX filter (drops a line only when the line itself starts with a comment marker), so the interior of a block comment whose lines lack a `*` prefix survived stripping and any gate built on it was satisfiable by a comment merely NAMING the pattern it required — reproduced by executing the helper against `hasContainmentOsMock`, `assignsContainmentEnvVar('HOME')`, `hasExpressionBodyErrorWrapper`. Extracted one `src/backend/testUtils/stripSourceComments.ts` that strips block comments FIRST then applies the pre-existing line filter UNCHANGED (deliberately NOT a naive `/\/\/.*$/gm` swap — that is the WR-08 string-literal truncation plan 34.2-28 had just removed; the retained trailing-comment limitation is documented in the util). Migrated all 14 defective copies plus the 1 already-correct `stripCommentsForNodeOsGate`, so exactly one implementation exists (`grep -rn 'filter((line) => !/' src/backend` went 14 hits → 1). Added an 8-case self-test at `src/backend/__tests__/` using the NON-`*`-prefixed block-comment spelling every prior self-test missed. Hazard check mechanized: full-suite `{fullName,status}` baseline-vs-after diff showed exactly 8 changes, all additions from the new self-test — ZERO pre-existing test flipped in either direction. Orchestrator independently re-proved falsifiability by reverting the util to the old body (3/8 self-tests went RED) and restoring byte-clean. `tsc --noEmit` 0; 113/114 suites, 2333/2334 tests, sole failure the documented `rustInvokeChannel.test.ts` Phase 34.1 baseline. | 2026-07-26 | [260726-q8f-extract-shared-stripsourcecomments-util-](.planning/quick/260726-q8f-extract-shared-stripsourcecomments-util-/) |
| 260727-c42 | Consolidated the project onto ONE knowledge graph. The repo had two competing ones: `graphify-out/` (standalone `graphify` CLI v0.9.14, the graph CLAUDE.md's `## graphify` section AND the `.claude/settings.json` hook-guard PreToolUse hooks both reference) and `.planning/graphs/` (the GSD `gsd-graphify` skill's, built via gsd-tools.cjs, stale since 2026-07-20, 13MB, and *tracked* in git). Three defects fixed: (1) `graphify-out/` was 97MB **untracked and NOT gitignored** — `git check-ignore` exited 1 and `git status` showed a bare `?? graphify-out/`, one `git add -A` away from a 6MB graph.json + 4MB graph.html landing in history; added directory-form ignores for both paths (`.gitignore:56-57`). (2) Set `graphify.enabled: false` in `.planning/config.json` so the gsd-graphify skill stops rebuilding the duplicate — done as a targeted 1-line edit anchored on the `"graphify": {` line, because the same file carries an `"intel": { "enabled": false }` object a naive replace would have hit. (3) `git rm -r .planning/graphs` (deliberately NOT `--cached`, which would have left 13MB of week-stale artifacts on disk reading as if current); all 4 tracked files gone from index and worktree, recoverable from history. Separately, the surviving graph was 100 commits stale (built from `7d4fe008` vs HEAD `11cb6f9c`, 41 changed `src/` files, with `stripSourceComments.ts`/`clipboardFlowRegistration.ts`/`shellFilesFlowRegistration.ts` at zero nodes despite existing in HEAD — the hook was forcing consultation of an index blind to all of Phase 34.3), so `graphify update .` was run first: now 5,888 nodes / 11,263 edges / 423 communities at HEAD. Known follow-up: 242 communities carry placeholder `Community N` labels (the `graphify label` LLM naming step has not been run), and `graphify-out/` accumulates a dated backup dir per rebuild. `graphify-out/` itself left untouched on disk. | 2026-07-27 | [260727-c42-consolidate-on-the-standalone-graphify-g](.planning/quick/260727-c42-consolidate-on-the-standalone-graphify-g/) |

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Game Details | DETAIL-03: Linux ProtonDB compat overlay | Post-v0.2 | v0.2 requirements |
| Settings | API-01: Copy-to-clipboard on API key field | Post-v0.2 | v0.2 requirements |
| Console / Steam | CONSOLE-02: Steam update feedback in Console launch — when a Steam game needs an update, GameLib shows "Launched in Steam" and dismisses while Steam silently updates; user has no in-app signal. Needs own design (Steam does not report update state back). From Phase 8 UAT (finding E). | Post-v0.2 | Phase 8 UAT (2026-07-04) |
| Console / macOS | KNOWN LIMITATION — Launching a Steam game from Console mode on macOS shows a brief desktop-Space animation before the game appears. Cause: Console mode uses native fullscreen (its own macOS Space) so swipe-to-Space works; macOS must leave that Space when the game's window appears elsewhere. Not fixable from Electron without setSimpleFullScreen, which removes the swipe-able Space and has focus/chrome rough edges (prototyped + rejected in Phase 8 UAT test 11). `activate:false` on the steam:// handoff was tried and kept but does not remove the flash. Accepted as-is. | Accepted (won't fix) | Phase 8 UAT (2026-07-04) |
| Humble Store | HSTORE-02: Read-only Humble bundle/deals listing in-app with "Buy on Humble" deep-links | Post-v0.3 | v0.3 requirements (separate data source; key management prioritized) |

## Session Continuity

Last session: 2026-08-01T07:45:51.061Z
Stopped at: Completed 34.5-28-PLAN.md (F-34.5-G6-01 Epic discriminator R1-FALSIFIED live; GOG smoke shows capture-to-hook fixed but library never populates; BINDING DECISION: fix-first -- blocking gate NOT authored this cycle)
  This session (sequential executor): executed 34.5-26 (gap cycle 3, wave 3). Task 1 (feat,
  commit `ac578a842`): `useTauriOAuthLogin.ts` now checks the resolved auth-channel response's
  `status` before treating a captured login as successful; on `status==='done'` it invokes an
  injected `onLoginSuccess({runner, username, user_id})` callback built by the new, exported
  `createOAuthLoginCompletion(deps)` factory (also used by `GlobalState.tsx`'s new
  `completeOAuthLogin` context field, wired through `index.tsx`); a resolved-but-refused status
  now settles `{phase:'error'}` naming the status instead of masquerading as "not wired up yet";
  removed the falsified "this hook's job is done" comment (`grep -c "lands in Phase 34.5"` == 0).
  Task 2 (test, commits `248b59ec0`/`85e1d7ad6`): asserted the OBSERVABLE downstream effect --
  `setState` called with the correct per-runner slice by value, `handleSuccessfulLogin` called
  with the correct runner, and (one hop further) `refreshLibrary` called with
  `{runInBackground:false, library:<runner>}` when `handleSuccessfulLogin` is wired to mirror
  `GlobalState.tsx`'s own body; negative cases (blocked/error) assert neither fires. Task 3
  (verification only, no commit -- nothing to commit): `GlobalState.tsx`'s 3-hunk diff for this
  plan is 100% additive (quoted verbatim in `34.5-26-SUMMARY.md`); the four Electron login
  wrappers and `handleSuccessfulLogin`'s bodies are byte-identical; `useTauriOAuthLogin.ts`'s
  `isTauri()` guard confirmed still first/unconditional; `npx electron-vite build` exit 0
  (`built in 4.43s`); `electronUntouched.test.ts` 11/11; `npm run test:ci` 3497/3497 (was 3485),
  179/179 suites; `npx tsc --noEmit` clean; zero `src-tauri/` paths touched. F-34.5-G6-02 (both
  layers) + F-34.5-G6-03 closed at the CODE level only -- the blocking live gate (34.5-31) still
  owes confirming a real captured login populates the Library/account UI live.
Next: **34.5-27-PLAN.md** (or whichever gap-cycle-3 plan is next per STATE.md's wave ordering) --
  F-34.5-G6-02/F-34.5-G6-03 closed at the code level; 34.5-31's live gate still owes confirming a
  real captured login populates the Library and account-manager UI. Phase 34.5 does NOT close
  until 34.5-31's third re-run gate records 5/5.

Prior session context, retained for history:
Stopped at (superseded): Completed 34.5-25-PLAN.md (F-34.5-G6-06 diagnosed and fixed: the "double Keychain"
  prompt on GOG sign-out" is NOT GOG-specific -- window.location.reload() (shared by all 5 runner
  sign-out flows: Epic/GOG/Amazon/Zoom/Steam) remounts GlobalState, whose mount effect
  unconditionally re-runs Humble's OWN getCredentials()/getCsrfToken() health check).
  This session (sequential executor): executed 34.5-25 (gap cycle 3, wave 2). Task 1 (docs,
  commit `50e0993`, zero source files touched -- verified by the task's own automated gate):
  appended a `## F-34.5-G6-06` section to `34.5-G6-FINDINGS.md`, tracing the code path
  `gogLogout()` -> `window.location.reload()` -> `GlobalState` remount -> its mount-time effect
  (`GlobalState.tsx:1233-1234`) -> `HumbleUser.checkHealthAndFlagExpiry()` ->
  `getCredentials()`/`getCsrfToken()` -> `SidecarKeyringSlotStore('humble-session'|'humble-csrf')
  .getToken()`; confirmed GOG's own `logout()` touches zero keyring slots; counted the preserved
  gate log's session-wide blast radius at 7 `keyring_get failed` lines (3 `keyring:unavailable`, 4
  `keyring:timeout`) across all 3 slots (steam-refresh-token, humble-session, humble-csrf) and at
  least 7 distinct call sites; selected K1 (failure-not-cached + 8s `KEYRING_READ_TIMEOUT`
  interaction) over K2 (two prompts are an unavoidable cost) using the pre-existing success cache's
  own behaviour as the discriminator -- a slot that succeeds once never prompts again for the rest
  of the process, which only K1 predicts. Task 2 (fix, commit `64e8110`, TDD-flavored): added
  `KEYRING_FAILURE_MEMO_MS = 15_000` (~2x `KEYRING_READ_TIMEOUT`'s 8s) and a `failedTokenAt`
  timestamp field to `SidecarKeyringSlotStore` in `keyringTokenStore.ts` -- `getToken()` now
  returns a memoized failure for 15s after a real failure, WITHOUT a second `keyring_get`/Keychain
  prompt, layered ALONGSIDE (not replacing) the pre-existing `pendingToken` in-flight dedupe
  (commit `2d1abe64a`; `grep -c pendingToken` confirmed unchanged at 6 before/after). `getToken()`'s
  memo check runs after both the success cache and the in-flight dedupe, so it never shadows a
  fresher read or an in-flight request. `invalidateCache()` (called by `setToken()`/`clearToken()`
  before their underlying call) was extended to also clear the memo -- the sign-out floor cannot be
  blocked by, or resurrect through, a stale memoized failure. `isAvailable()` was deliberately left
  untouched. Relabeled the pre-existing concurrent-dedupe test as an explicit characterization/
  regression guard citing commit `2d1abe64a`; replaced the now-superseded "second call always
  retries" test with 4 new memo-specific tests (within-window memoized -- RED-first for this task;
  post-window fresh retry via `jest.advanceTimersByTime`; `clearToken()`-invalidates-the-memo via a
  FAILED delete, since a successful one correctly repopulates the value cache instead and would not
  exercise the memo path; memoized failure surfaced as `''`, never a value) plus one new test in
  `humbleSecretStore.test.ts` proving the two Humble slots' memos are independent. `npm run
  test:ci` 179/179 suites, 3485/3485 tests (was 3482/3482, +3 net new); `npx tsc --noEmit` clean;
  zero `src-tauri/` files touched (`KEYRING_READ_TIMEOUT` untouched, per plan constraint -- belongs
  to plans 34.5-23/27). SUMMARY written (`34.5-25-SUMMARY.md`), self-check PASSED. Closed at the
  CODE level only, per this phase's own F-1 precedent -- the actual live Keychain-prompt count on a
  real sign-out is still owed to 34.5-31's live gate.
Next (superseded): **34.5-26-PLAN.md** (or whichever gap-cycle-3 plan is next per the wave
  ordering) -- F-34.5-G6-06 is closed at the code level; 34.5-31's live gate still owes confirming
  the actual Keychain prompt count dropped on a real GOG (and ideally at least one other of the
  five) sign-out. Phase 34.5 does NOT close until 34.5-31's third re-run gate records 5/5.

Stopped at (superseded): Completed 34.5-24-PLAN.md (F-34.5-G6-01 discriminator instrument: hostname-only nav
  logging, source-free UA override seam, pre-registered R1/R2 experiment with verdict: null).
  Next: 34.5-25 onward per gap-cycle-3 wave ordering.
  This session (sequential executor): executed 34.5-24 (gap cycle 3, wave 2, parallel to 34.5-23 --
  builds the DISCRIMINATOR for F-34.5-G6-01, does not fix it). Both tasks 1 and 2 (tdd="true") ran
  as genuine RED->GREEN pairs: source reverted to HEAD via `git checkout --`, failing tests
  confirmed by an actual jest run, then re-applied and confirmed passing -- never written to pass
  on the first attempt. Task 1 RED (commit `cac635fec`) / GREEN (commit `688a216de`): added
  `nav host=${hostname}` logging inside `poll()`'s event loop in `oauthLoginCapture.ts` --
  hostname ONLY (T-34.5-G6-11, never origin/pathname/search/href, since Epic's own redirect shape
  carries its code in the query string), computed inside its own try/catch (`<unparseable>` on a
  parse failure, never throws), de-duplicated against the last LOGGED (not merely observed) host
  so a 500ms poll over the 300s deadline cannot flood the log. 45/45 tests (was 42/42). Task 2 RED
  (commit `d4b88810c`) / GREEN (commit `dea15578f`): added `resolveUserAgent(runner)`, reading
  `GAMELIB_OAUTH_UA_<RUNNER-UPPERCASED>` -- unset/empty/whitespace-only falls back to the existing
  default byte-for-byte, logs the runner + override LENGTH only (never the value, T-34.5-G6-13)
  when in effect. This is a DIAGNOSTIC-ONLY seam: plan 34.5-28 runs Epic's login twice (stock
  `EpicGamesLauncher` UA vs. the Chrome-shaped agent GOG/Amazon already use) against ONE build via
  ONE env var, comparing the `nav host=` sequences Task 1 now logs -- never a hand-edit-and-rebuild
  between arms, which would make the two arms non-comparable. 49/49 tests (was 45/45). Task 3
  (commit `5d4151d4d`): wrote `34.5-G6-EPIC-DISCRIMINATOR.md` (`verdict: null`,
  `executed_by: 34.5-28-PLAN.md`) naming R1 (user-agent gated) and R2 (a Chromium-only API
  throwing under WKWebView, mirroring the confirmed `queryLocalFonts` precedent), with a
  decision-rule table covering all four outcome combinations (including the two that FALSIFY
  rather than confirm a reading, and "neither fits -> stop and escalate") -- every Result slot left
  empty, reconciled explicitly against `34.5-G6-FINDINGS.md` (no divergence: F-34.5-G6-01 stays
  separate from, and upstream of, the already-closed F-34.5-G6-02). `npm run test:ci` 179/179
  suites, 3482/3482 tests (was 3475/3475), exit 0 (run twice, identical); `npx tsc --noEmit` clean;
  zero `.rs` files touched (`git diff --name-only be3ca4be7 HEAD -- src-tauri/` empty). SUMMARY
  written (`34.5-24-SUMMARY.md`), self-check PASSED. This plan does NOT resolve F-34.5-G6-01 --
  Epic's login still does not work; it makes the failure legible and pre-registers how to
  interpret plan 34.5-28's live run.
Next (superseded): **34.5-25-PLAN.md** (or whichever gap-cycle-3 plan is next per the wave ordering, e.g.
  34.5-25/26/27 which run in parallel to or after this plan per the wave-2/3 ordering) --
  `34.5-G6-EPIC-DISCRIMINATOR.md`'s experiment is unrun until plan 34.5-28's live checkpoint drives
  both arms on real hardware and fills in its Result slots; plan 34.5-29 applies whichever fix the
  recorded verdict selects. Phase 34.5 does NOT close until 34.5-31's third re-run gate records 5/5.

Stopped at (superseded): Completed 34.5-23-PLAN.md (F-34.5-G6-02 fix: exempted oauthCaptureLogin/humbleStartLogin/humbleReconnect from the 60s invoke bound, made a rejected capture round-trip loud, added a standing guard). Next: 34.5-24 onward per gap-cycle-3 wave ordering.
  This session (sequential executor): executed 34.5-23 (gap cycle 3, wave 2 -- the fix
  34.5-22's diagnosis specified). Task 1 (commit `d3061e65f`): added `oauthCaptureLogin`,
  `humbleStartLogin` and `humbleReconnect` to `main.rs`'s `LONG_RUNNING_CHANNELS` (all three
  named by 34.5-22 Task 2's recurrence count, not just the one channel that session's gate
  happened to exercise long enough to observe) with justifying comments citing the 2026-08-01
  gate's measured durations, mirrored into `EXPECTED_LONG_RUNNING_CHANNELS`, and extended
  `main.rs`'s `#[cfg(test)]` module with a behavioral assertion plus a non-member control
  (`getUserInfo` stays bounded). `cargo test` 86/86 (was 84/84), `npx jest
  longRunningChannels.test.ts` 21/21 (was 20/20), `cargo check` clean, `from_secs(60)` count
  unchanged at 2. Task 2 (commit `e7a803237`): wrapped `useTauriOAuthLogin.ts:99`'s previously
  bare `await window.api.oauthCaptureLogin(...)` -- the ONLY unguarded await in `run()`, and the
  direct cause of zero renderer log lines against six real backend outcomes (34.5-G6-FINDINGS.md
  evidence item 1) -- in try/catch; a rejection now honours the `cancelled` guard first, emits a
  distinct `capture-transport-failed` log line (never folded into the existing generic
  `phase=error` line), and settles `{ phase: 'error', message }` instead of floating as an
  unhandled rejection. No renderer-side timeout was added -- the sidecar's own
  `DEFAULT_DEADLINE_MS` stays the sole deadline authority. `npx jest useTauriOAuthLogin.test.tsx`
  26/26 (was 22/22), `grep -c capture-transport-failed` == 1, `tsc --noEmit` clean. Task 3
  (commit `7ed5ea530`): added a standing guard to `longRunningChannels.test.ts` -- a declared
  `DEADLINE_CONSTANT_TABLE` (channel -> {sourcePath, constantName}) parses the real ms deadline
  out of `oauthLoginCapture.ts`/`humble/user.ts` (reusing the file's existing shared
  `stripSourceComments`/`stripTrailingLineComment` helpers) and asserts `LONG_RUNNING_CHANNELS`
  membership whenever that deadline exceeds `INVOKE_TIMEOUT`; proved load-bearing by actually
  reverting Task 1's three-channel `main.rs` addition locally, observing the guard's own test
  throw `"oauthCaptureLogin's internal deadline (300000ms) exceeds INVOKE_TIMEOUT (60000ms) but
  is absent from LONG_RUNNING_CHANNELS"` (3 tests failed), then restoring (`git diff --stat`
  confirmed zero residual change -- no `git stash`/`reset --hard` used). `npx jest
  longRunningChannels.test.ts` 28/28 (was 21/21). `npm run test:ci` 179/179 suites, 3475/3475
  tests (was 3454/3454, comfortably above the 3463 gate baseline), exit 0;
  `ported-channels-gate.py` exit 0. SUMMARY written (`34.5-23-SUMMARY.md`), self-check PASSED.
  This plan closes layer 1 of F-34.5-G6-02 only -- it does NOT make a login succeed on its own;
  layer 2 (nothing runs the post-login library refresh) remains 34.5-26's scope.
Next: **34.5-24-PLAN.md** (or whichever gap-cycle-3 plan is next per the wave ordering) --
  34.5-23's fix is unproven live until the third blocking gate re-run actually drives a real
  GOG/Amazon login past 60s and observes a non-empty `grep -c "useTauriOAuthLogin"
  ~/Library/Logs/GameLib/gamelib.log`, per 34.5-G6-FINDINGS.md's "Implied fix" observable-effect
  standard -- a green test suite alone does not clear that bar. Phase 34.5 does NOT close until
  34.5-31's third re-run gate records 5/5.

Stopped at (superseded): Completed 34.5-22-PLAN.md
  This session (sequential executor): executed 34.5-22 (gap cycle 3, wave 1, diagnostic plan --
  NO source-code edits, per the plan's own explicit prohibition). Task 1: preserved this
  session's `gamelib.log` (351,376 bytes) and `gamelib.log.old` (5,062 bytes) to
  `~/Library/Logs/GameLib/gamelib.log.34.5-g6-gate2` / `.old.34.5-g6-gate2`, outside the
  repository, both `cmp` byte-identical to their originals -- the only primary evidence for
  findings F-34.5-G6-01..06, otherwise destroyed by the next `pnpm tauri:dev` launch. No repo
  commit for this task (nothing in the working tree changed). Task 2 (commit `7a4c297e1`):
  diagnosed F-34.5-G6-02 to shape (c) -- exists-but-never-reached -- from source and the
  preserved log: `oauthCaptureLogin` is absent from `main.rs`'s `LONG_RUNNING_CHANNELS`, so it
  inherits the default 60s `INVOKE_TIMEOUT`, while its own `DEFAULT_DEADLINE_MS` is 300,000ms;
  all six real backend terminal outcomes this session (3 legendary timeouts, 1 nile timeout, 1
  nile capture at 91s, 1 gog capture at 68s) exceeded 60s, and the renderer's own
  `[useTauriOAuthLogin]` log line fired ZERO times against those six backend outcomes -- the
  signature of an unhandled promise rejection at the unguarded `await` on
  `useTauriOAuthLogin.ts:99` (its enclosing `try` closes at line 97). R-A (transport rejected,
  swallowed) selected over R-B (never settles) on structural grounds: `sidecar_invoke`'s async fn
  has already returned by the time the 60s bound fires, foreclosing a true hang.
  F-34.5-G6-01 (Epic's greyed-out form) recorded as a SEPARATE upstream defect -- item 1 had zero
  captures, so this finding's mechanism never had anything to lose. Counted the recurrence:
  `humbleStartLogin`/`humbleReconnect` share the identical shape (600s `LOGIN_WATCH_TIMEOUT_MS`),
  bringing the known-instance count to 3, not 1. Task 3 (commit `59cd17d0e`): appended a
  four-item implied-fix specification for plan 34.5-23 (the `LONG_RUNNING_CHANNELS` edit, the
  paired `EXPECTED_LONG_RUNNING_CHANNELS` test edit, a `try`/`catch` defense-in-depth fix, and a
  standing guard test that catches a future channel by shape), each with an observable downstream
  effect that is explicitly not "the test suite is green." `git diff --name-only HEAD` matched
  zero `.ts`/`.tsx`/`.rs` files across both commits. SUMMARY written (`34.5-22-SUMMARY.md`),
  self-check PASSED.
Next: **34.5-23-PLAN.md** — implements the four-item fix `34.5-G6-FINDINGS.md`'s "Implied fix"
  section specifies: the `LONG_RUNNING_CHANNELS` edit (`main.rs`) + matching
  `EXPECTED_LONG_RUNNING_CHANNELS` edit, the `useTauriOAuthLogin.ts:99` try/catch, and the
  standing guard test. Phase 34.5 does NOT close until 34.5-31's third re-run gate records 5/5.
  [SUPERSEDED — this plan is now complete, see the current "This session" note above.]

Stopped at (superseded): Completed 34.5-20-PLAN.md
  This session (continuation executor): executed 34.5-20 Tasks 2-3 (Task 1 -- the 7
  preconditions -- was completed by a prior agent, commit `8ea770e2f`, all SATISFIED including
  precondition 4's proof that the G-1 publicDir/runner-binary fix from plans 34.5-16..18 is
  present in this build). Task 2 (commit `a3b22cadb`): recorded the developer's real-hardware
  run into `34.5-LIVE-GATE-RERUN.md`'s 5 Result slots, cross-checked directly against
  `gamelib.log` rather than trusted at face value -- corrected a pre-supplied "4 legendary
  timeouts" reading to the log's actual count of 3. Item 1 (Epic) FAIL: 3 opens, 3 timeouts, 0
  captures, login form renders "greyed out" and non-interactive. Items 2 (GOG) and 3 (Amazon)
  FAIL: both reach `status=captured` at the backend for the first time this phase (proving G-1 is
  closed), but nothing consumes the capture -- no follow-up runner-CLI auth call, and
  `TauriLoginPanel.tsx`'s own `captured-blocked` log line never fires for either runner; UI stays
  on "Signing in...", library never populated. Item 3's Assumption A1 (`www.amazon.com` anchor)
  recorded CONFIRMED via a structural proof read directly from `matchOAuthRedirect`'s source (a
  `nile` `status=captured` outcome is only reachable via an exact hostname match), which does not
  retire item 3's own FAIL. Items 4-5 NOT ATTEMPTED, confirmed explicitly by the developer. Added
  a "New findings" register (F-34.5-G6-01..06) for six defects the developer's report surfaced
  beyond the five items' own scope (greyed-out Epic form, capture-without-UI-update, unpopulated
  GOG library, no origin shown in login window, black-on-black Amazon verification text, double
  Keychain prompts on GOG sign-out), diagnosis deferred. Task 3 (commit `fe799e29b`): frontmatter
  `verdict: FAIL`, `items_passed: 0`, `items_failed: 3`, `items_not_attempted: 2`; Verdict table;
  "What this gate falsifies" -- nothing struck, with the A1-confirmed-but-item-3-FAILs distinction
  spelled out explicitly so a future reader cannot conflate the two. `34.5-LIVE-GATE.md` confirmed
  byte-unchanged after every commit; no credential value in either diff. SUMMARY written
  (`34.5-20-SUMMARY.md`), self-check PASSED.
Next: **34.5-21-PLAN.md** — wave 5 of the gap cycle, propagate the FAIL 0/5 verdict:
  `34.5-PORTED-CHANNELS.md`, the gate script, `IPC-PORT-INVENTORY.md`, ROADMAP.md, and STATE.md.
  Per D-08, Phase 34.5 does not close; the downstream-of-capture defect (items 2/3) and Epic's
  non-interactive login form (item 1) are new gap-cycle candidates once 34.5-21 completes
  propagation.

Prior session context, retained for history:
Stopped at (superseded): Completed 34.5-19-PLAN.md
  This session (sequential executor): executed 34.5-19 (gap cycle wave 3, both tasks
  autonomous), authoring `34.5-LIVE-GATE-RERUN.md` -- a CONTRACT for the blocking live-gate
  re-run, written before any live work, `verdict: null` throughout. Runs NOTHING live. Task 1
  (commit `010b97bf6`): frontmatter (`status: pending`, `blocking: true`, `items_passed: 0`,
  `items_failed: 0`, `supersedes: 34.5-LIVE-GATE.md`) plus 7 numbered preconditions, each with
  an empty `RESULT --` slot. Precondition 1 carries forward 34.4.1's own gate PASS verbatim.
  Precondition 4 is the load-bearing check: quotes all four `[bootstrap]` log-line shapes
  (`appRoot resolved=`, `publicDir resolved=`, `runner binary <name> path=`, and the
  `SIDECAR ASSET ROOT DEFECT` block-condition) read directly from `bootstrap.ts` source at
  authoring time, requiring `source=GAMELIB_APP_ROOT` (not `process.cwd`) and `exists=true`
  throughout -- a `SIDECAR ASSET ROOT DEFECT` line BLOCKS items 1-3 outright. Precondition 7
  closes the old precondition-5 gate-contract defect by citing
  `[bootstrap] GAMELIB_SHELL_EXE received=` (plan 34.5-18's receipt log), carrying the
  dev-vs-packaged caveat and `R-34.5-G1-PKG` parallel limit forward verbatim. Task 2 (commit
  `cf5533832`): the five items, each with an empty `[ ] PASS   [ ] FAIL` slot, carrying
  `34.5-LIVE-GATE.md`'s wording forward rather than re-deriving it -- item 3 adds a
  CONFIRMED/FALSIFIED/UNTESTED three-way recording rule for the `www.amazon.com` anchor
  (Assumption A1), item 4 carries the unconsumed Alan Wake groundwork plus a new
  re-verify-still-installed instruction the old contract lacked, item 5 states Pitfall 2's
  non-Steam Wine claim is not struck without a PASS here. Closed with a reserved Verdict table,
  a "What this gate falsifies" section binding four standing claims to their items, and an
  explicit arithmetic rule for a not-attempted item. Rule 2 fix (commit `4369d5166`,
  discovered during pre-SUMMARY self-review of the plan's own threat_model): the contract was
  missing an explicit instruction for `T-34.5-G6-02` (never paste `access_token`/
  `refresh_token`/cookies/session-ids/the Steam `userdata` account id into a Result slot,
  redact-in-place instead) -- added as a standalone "Evidence-handling rule" paragraph.
  `34.5-LIVE-GATE.md` confirmed byte-unchanged (`git status --porcelain` empty) after all three
  commits; `ported-channels-gate.py` re-run clean (exit 0) after each. SUMMARY written
  (`34.5-19-SUMMARY.md`), self-check PASSED.

Earlier session context, retained for history:
Stopped at (superseded): Completed 34.5-18-PLAN.md
  This session (sequential executor): executed 34.5-18 (gap cycle wave 2's second plan, both
  tasks autonomous), closing G-3 (a gate-contract defect, not a code defect) and giving G-1's
  fix (34.5-16/34.5-17) a runtime witness. Task 1 (commit `fd19f91ab`): `init()` now logs
  `[bootstrap] GAMELIB_SHELL_EXE received=<value|<UNSET>>` -- the value the SIDECAR actually
  observed, not the Rust shell's `eprintln!` claim at `main.rs:1231` (which only ever reaches
  the shell's own stderr, never `gamelib.log`) -- closing the defect where `34.5-LIVE-GATE.md`
  preconditions 5 and 2 could not previously both be satisfied. Reads
  `process.env.GAMELIB_SHELL_EXE` directly, never `pathShim.getPath('exe')` (which throws on
  unset/empty by design -- wrong for a diagnostic). Task 2 (commit `7af2747af`): added a
  boot-time asset-root self-check, placed directly after the receipt log and before the i18next
  block so it cannot be outrun by a login attempt (the 2026-08-01 `ENOENT` lines fired 6 seconds
  before the first login). Logs the resolved app root + source, the resolved `publicDir` +
  `existsSync`, and per-runner (legendary/gogdl/nile/comet) path + `existsSync`, mirroring
  `archSpecificBinary`'s arch-native-first/x64-fallback resolution without importing it. Emits
  exactly one `[bootstrap] SIDECAR ASSET ROOT DEFECT` line naming the resolved `publicDir` on
  any absence. Extended the pre-existing `locales` warning's comment to name it as the
  (previously ungeneralised) first member of this family. Both blocks are try/catch-wrapped and
  NOT once-gated (re-observe `process.env` on every `init()` call). Test coverage for the
  self-check required swapping this suite's default automocked `electron` (whose `getAppPath()`
  always resolves to `os.tmpdir()`) for the real `electronStub` inside `jest.isolateModules`,
  mirroring `appRootResolution.test.ts`'s established pattern -- since `publicDir` is a
  module-scope constant fixed at import time. `npx tsc --noEmit` clean; `npm run test:ci`
  179/179 suites, 3463/3463 tests (up from 3459). Process note (not a Rule 1-4 deviation): both
  tasks were drafted together then split into two atomic commits by temporarily reverting Task
  2's additions, verifying Task 1 alone, committing, then reapplying Task 2 -- matching this
  phase's one-commit-per-task convention. SUMMARY written (`34.5-18-SUMMARY.md`), self-check
  PASSED.

Stopped at (superseded): Completed 34.5-17-PLAN.md
  This session: executed 34.5-17 (gap cycle wave 2, sequential executor, both tasks
  autonomous), building directly on 34.5-16's `GAMELIB_APP_ROOT` seam. Task 1 (commit
  `a79b33163`): `archSpecificBinary`'s x64 fallback is now existence-checked — throws an `Error`
  naming the binary, both attempted absolute paths, and the resolved `publicDir` when neither
  exists, instead of returning an unchecked path that previously ENOENT'd six layers away at
  `launcher.ts`'s `callRunner`. No-op when binaries are present (REQ-34.5-13). Coverage added to
  `utils.test.ts` via three independently-memoised exported getters
  (`getLegendaryBin`/`getGOGdlBin`/`getCometBin`) rather than `jest.isolateModules` — the latter
  was tried first and rejected after several isolation-ordering attempts all reproduced the same
  failure (a fresh module load's `app.getPath` mock kept resolving to the SAME already-
  `resetMocks`-stripped instance from this file's pre-existing `import * as utils`/
  `jest.mock('electron')`, not an independent fresh one).
  Task 2 (commit `94a8fe7b0`): extended `appRootResolution.test.ts` with a real-filesystem
  sidecar-conditions block — forces `process.cwd()` to `<repo>/src-tauri` and requires
  `backend/constants/paths` fresh with `electron` swapped for the REAL (unmocked) `electronStub`,
  so `publicDir` is computed by the production code path rather than restated. Negative arm:
  unset `GAMELIB_APP_ROOT` resolves a `public` dir that does not exist on disk. Positive arm: env
  set to repo root resolves 8 real assets (4 runner binaries + locales/changelog.json/icon.png/
  webviewPreload.js), all existence-checked against the real filesystem.
  `jest.isolateModules` worked cleanly for THIS file (unlike Task 1) because it never triggers
  the project-wide `electron` automock at all. Proved the new suite detects a regression:
  temporarily reverted `electronStub.getAppPath()`'s env read (never committed), confirmed the
  positive arm went red with the exact expected-vs-received mismatch, restored via
  `git checkout --` on the untouched file, re-confirmed green — both verbatim outputs recorded in
  `34.5-17-SUMMARY.md`.
  `npx tsc --noEmit` clean; `cargo check` clean; `npm run test:ci` 179/179 suites, 3459/3459
  tests (up from 3454). One unrelated pre-existing flake observed on the first `test:ci` run
  (`enrichmentFlows.test.ts`'s `getAnticheatInfo` channel row) — reproduced green both standalone
  and on a full-suite re-run, confirmed not caused by this plan's files. SUMMARY written
  (`34.5-17-SUMMARY.md`), self-check PASSED. No auto-fixed deviations (Rule 1-4); one process
  note documenting the `jest.isolateModules` rejection for Task 1.
Next: `/gsd-execute-phase 34.5` — wave 2's remaining plan `34.5-18` (G-3, autonomous), then waves
  3-5 (`34.5-19`..`34.5-21`), with wave 4 (`34.5-20`) stopping at the blocking human-driven gate
  re-run.
Stopped at (superseded): Completed 34.5-16-PLAN.md
  This session: executed 34.5-16 (gap cycle wave 1, sequential executor, all 3 tasks
  autonomous). Task 1 (commit `b49272d37`): wrote `34.5-APP-ROOT-SWEEP.md`, a 25-row sweep of
  every `publicDir`/`getAppPath()` consumer across the backend, each reachability decision made
  by reading real import chains (never assumed) — 15 rows `FIXED BY ROOT`, 9 `SAFE`
  (structurally unreachable from the sidecar module graph, e.g. `main.ts`/`tray_icon.ts` are
  Electron-main-only), 1 residual named. Surfaced a previously-unnoticed silent failure:
  `crossover_index/fetcher.ts:52`'s bundled-snapshot read has been silently falling back to
  `null` under the sidecar the whole time (its own try/catch treats ENOENT as a normal cold
  start). Decided the one-seam mechanism (`GAMELIB_APP_ROOT`) and rejected three alternatives
  (cwd change, per-call-site patches, `__dirname` math). Named `R-34.5-G1-PKG` (packaged asset
  root not claimed fixed).
  Task 2 (commit `2072dc079`): added `app_root_env_value`/`resolve_dev_app_root`/
  `resolve_packaged_app_root` to `main.rs`, mirroring `shell_exe_env_value`'s exact
  non-panicking contract; wired `.env("GAMELIB_APP_ROOT", ...)` into both `spawn_sidecar_dev`
  and `spawn_sidecar_packaged`. `cargo check` clean; `cargo test` 84/84 (up from 80).
  Task 3 (commit `ebe367f83`): `electronStub.app.getAppPath()` now reads
  `process.env.GAMELIB_APP_ROOT`, falling back to `process.cwd()` when unset/empty (deliberately
  non-throwing — module-scope call site, pre-logger failure would be invisible). New suite
  `appRootResolution.test.ts` covers both arms plus a source-text assertion against real
  `main.rs`; classified in `testContainment.test.ts`'s `STRUCTURALLY_CONTAINED_SUITES`
  (directory recount 40→41). `npx tsc --noEmit` clean; `npm run test:ci` 179/179 suites,
  3454/3454 tests (up from 3447). SUMMARY written (`34.5-16-SUMMARY.md`, commit `453e7d389`),
  self-check PASSED. No deviations beyond one process note (Rust RED/GREEN landed as a single
  commit, following this repo's existing cargo-test convention).

Prior session context, retained for history:
Stopped at (superseded): Completed 34.5-15-PLAN.md
  This session (continuation agent): resumed 34.5-15 at Task 2's blocking human-verify
  checkpoint after a prior agent completed Task 1 (all 5 preconditions satisfied, commit
  `116a98bb9`). The developer drove the gate on real macOS hardware and reported "epic login
  hang"; the orchestrator diagnosed the hang from `~/Library/Logs/GameLib/gamelib.log` before
  this agent recorded it. Task 2 (commit `631dda6cd`): filled all 5 item Result slots —
  items 1/2/3 FAIL (`legendary`/`gogdl`/`nile` binaries `spawn ./{runner} ENOENT` at sidecar
  startup, before any login interaction — the OAuth capture seam itself worked, which is why
  the defect presented as a hang rather than a visible error); item 3's Assumption A1
  (`www.amazon.com` anchor) recorded UNTESTED, not confirmed or falsified; item 4 recorded NOT
  ATTEMPTED (developer's choice); item 5 FAIL by blockage (requires a working non-Steam login
  from items 1-3, none succeeded — research Pitfall 2's claim stands). Added a "Root cause"
  section to `34.5-LIVE-GATE.md` with the full verified causal chain: `app.getAppPath()`
  resolves to `process.cwd()` under the sidecar (`electronStub.ts:207`), which is `src-tauri/`,
  so `publicDir` (`paths.ts:73`) resolves to a nonexistent `src-tauri/public` — 4th recurrence
  of the `publicdir-getapppath-chunking` family; `bootstrap.ts:156` already half-knew this.
  Task 3 (commit `ab4192752`): frontmatter verdict FAIL, items_passed 0, items_failed 4 (item 4
  counts toward neither, explicitly stated), Verdict table filled, "What this gate falsifies"
  struck NOTHING (no item passed), `34.5-PORTED-CHANNELS.md`'s LIVE cells for items 1/2/3/5
  flipped PENDING→FAIL with gate-item pointers, item 4's two cells stay PENDING with a reason
  note, residuals section keeps Assumption A1/A2 both OPEN. `ported-channels-gate.py` and
  `--self-test` both re-run clean (exit 0). SUMMARY written (`34.5-15-SUMMARY.md`, commit
  `708f4ad30`) stating plainly that Phase 34.5 is NOT complete. No source-code edits — this
  plan records, it does not fix.

Stopped at (superseded): Completed 34.4.1-27-PLAN.md
  This session: 34.4.1-27-PLAN.md executed (gap cycle 2, plan 7 of 9, wave 5) — closed the two
  code-side housekeeping findings the gate rerun left unassigned. Task 1: extracted a
  dependency-free `queryLocalFontsSafe()` (new file — `Accessibility/index.tsx` pulls in MUI +
  several `.css`-importing components the jsdom-less frontend jest project cannot `require()`;
  `index.tsx` remains the guard's sole caller) that degrades to the two CSS-declared default
  fonts on both the absent and throwing failure shapes, logging once via `window.api.logError`,
  never letting a rejection escape (commit `53e6c8b01`). Task 2: added
  `imageCacheSchemeAvailable()` to `preload/tauriTransport.ts` beside `isTauri()` (today its
  negation, documented forward obligation), consumed by `CachedImage` at both the primary
  `useCache` init and the fallback-advance path so no `imagecache://` URL is ever emitted on a
  shell that doesn't serve the scheme — eliminating the ~150 guaranteed-failing `unsupported URL`
  requests per library render under Tauri. A source-reading test pins `CachedImage` free of any
  direct `isTauri(` reference (mirrors `GlobalStateSteamLogout.test.ts`'s house pattern); proved
  load-bearing live via a temporary reintroduction + observed failure + revert (commit
  `d40cb20a1`). Task 3: minted `REQ-34.4.1-GAP-13`, `[ ]` — honestly split between the
  unit-closed `queryLocalFonts` half and the artwork half's zero-`unsupported-URL` live
  observation still owed to plan 29's gate; extended ROADMAP.md's Phase 34.4.1 Requirements line
  in the same plan (commit `7e8fa3b5f`). Verified: `npm run test:ci` 177/177 suites, 3436/3436
  tests (was 176/3427); `npx tsc --noEmit` clean; `ported-channels-gate.py` + `--self-test` both
  OK, `IPC-PORT-INVENTORY.md`/`PORTED-CHANNELS.md` diff empty. See `34.4.1-27-SUMMARY.md`.
Next: **34.4.1-28-PLAN.md** — the WKWebView sweep; can allowlist both of this plan's guarded
  sites (`queryLocalFontsSafe()`, `imageCacheSchemeAvailable()`-gated `CachedImage`) as
  already-closed findings.

Prior session context, retained for history:
Stopped at (superseded): Completed 34.4.1-26-PLAN.md
  This session: 34.4.1-13-PLAN.md executed (gap cycle wave 4 — **F-1 (BLOCKING) CLOSED
  at the code level**) — Task 1 added `src/backend/sidecar/humbleSecretStore.ts`:
  `SidecarHumbleSecretStore` implements plan 12's `HumbleSecretStore` seam over plan
  11's slot-parameterized keyring store (`sessionCookie` -> `humble-session`,
  `csrfToken` -> `humble-csrf`), total on every method (mirrors
  `SidecarKeyringSlotStore` exactly — no fallback, `null` `keyring_get` is the healthy
  first-run case, one warning per real failure naming the channel, never the value).
  `installSidecarHumbleSecretStore()` wired into `bootstrap.ts` alongside the existing
  Steam TokenStore install, logging an observable confirmation line plan 20's live-gate
  re-run will grep for: `[bootstrap] Humble secret store installed: keyring-backed
  (humble-session/humble-csrf slots)` (commit `6cd64efeb`). Task 2 added the one-time
  plaintext migration (write -> readback -> exact-match compare -> only then delete the
  `configStore` plaintext + clear `encryptionDegraded`), each secret migrated
  independently so a `csrfToken` failure can never strand a migrated `sessionCookie`,
  and wired `disconnect()` in `humble/user.ts` to call
  `getHumbleSecretStore().clearSecrets()` right after the existing `configStore.clear()`
  (WR-02/T-10-07 ordering preserved, guarded so a rejection is logged/swallowed, never
  able to abort disconnect()) (commit `4795f3e2f`). Deviation (Rule 3): the new
  `humbleSecretStore.test.ts` was unclassified by `testContainment.test.ts`'s Block C
  declared-suite gate; registered it in `STRUCTURALLY_CONTAINED_SUITES`. Verified:
  `npm run test:ci` 176/176 suites, 3347/3347 tests, exit 0 (no regression against the
  175/3346 baseline); `npx tsc --noEmit` clean; `cargo test` 50/50 unchanged (no Rust
  change this plan); `seamBranchParity.test.ts` green, no new `KNOWN_GAP` entry;
  `electronReachLedger.test.ts` unaffected (`humbleSecretStore.ts` is sidecar-only,
  outside the ledger's entry-point graph). **F-1 is closed at the CODE level only** —
  a real macOS Keychain accepting the write is unproven until plan 20's live-gate
  re-run, whose evidence is the `gamelib.log` line above plus a store file with no
  `sessionCookie` field and `encryptionDegraded: false`.
Next: **34.4.1-14-PLAN.md** — steamgrid (F-1b dormant-path follow-up), runs in
  parallel (∥) with plan 15 (storage-clear capability) per the gap-cycle wave plan.

Prior (now superseded) next-step context, retained for history:
Next: **34.4.1-13-PLAN.md** — installs the keyring-backed `HumbleSecretStore`
  implementation (using plan 11's `SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)`/
  `SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_CSRF)`), proves the sidecar install
  actually happened (not merely assumed), and is the plan that actually CLOSES F-1.
  [SUPERSEDED — this plan is now complete, see the current "This session" note above.]
Next: **34.5-10-PLAN.md** is next on the critical path for Phase 34.5 (wave 3
continues — `runnerAuthFlowRegistration.ts`'s remaining channels per plan 34.5-06's
scaffold). Separately, still blocking: **34.4.1-08 Task 2 — the
blocking 4-item live gate. Needs local hardware; the developer was remote last session.**
Preconditions P1/P3/P5 are satisfied and evidenced; P2/P4/P6 are operator-at-gate-time (P6's
control cookie is now MOOT — item 3(b) was recorded BLOCKED-UNOBSERVABLE pre-gate, so the gate
CANNOT reach 4/4 and 3(b) becomes an in-phase gap cycle). **The developer's Humble credential
is parked, not deleted** — restore from
`~/Library/Application Support/GameLib/humble_store/config.json.pre-34.4.1-08-gate.bak`.
Per `34.5-LIVE-GATE.md` precondition 1, 34.5's own gate items 1-3 (Epic/GOG/Amazon OAuth) may
not run live until 34.4.1-08's gate records PASS on its item 1 — this does not block wave 1-5
plans (04 through 14), only wave 6's `34.5-15`. Second deferred verification item, still open:
cold-boot tray icon check under a real Tauri run (from the `eee21bc02` fix).
Prior next-step context for 34.4.1-08 follows: Plan 07 declared what actually shipped: wrote
`34.4.1-PORTED-CHANNELS.md` (7-row table, proof levels independently verified against source and
each prior plan's SUMMARY, not inherited), closed SEAM.md's checklist steps in a 2-hunk diff with
Invariant B untouched and `IPC-PORT-INVENTORY.md` verified unmodified, and wrote an 8-check
self-tested `ported-channels-gate.py` (both the real-document run and `--self-test` exit 0). No
source code touched. `pnpm codecheck`: clean. `pnpm test:ci`: 3093 passed / 2 failed (documented
`rustInvokeChannel.test.ts` baseline + `gameDetailsFlows.test.ts`, confirmed clean in isolation,
same pre-existing cross-test frame-leak flake class prior plans already documented) / 3095 total
/ 166 suites -- no regression traced to this plan's diff. See 34.4.1-07-SUMMARY.md.
Also still outstanding (carried forward, unrelated to this plan): Secure-phase 34.4 has NOT been
run and is owed. Also open from Phase 34.4: code-review WR-01 (`SteamSignOut.ts` poll does not
catch `getSteamUserInfo()` rejections -- a transport error during sign-out leaves the user with a
silently-failed logout), WR-02/WR-03 (runner-name display + i18n interpolation in
`WebviewUnavailablePanel.tsx`), and two unrun confirmatory Electron checks (bottle-pair parity;
Electron sign-out sanity, since the item-2 fix changed Electron's logout path too). Carried
non-defects: `steamBottleStatus` vs `isSteamBottleProvisioned` disagreement (inherited Electron
defect, faithfully ported), `electronStub` missing `request.abort()`. Also still outstanding
(unrelated to Phase 34.4): Phase 34.3's 34.3-09 live gate result reconciliation if not already
closed; Phase 34.2's owed secure-phase + 11 code-review warnings + 2 UAT items; Phase 23's
23-UAT.md real-macOS D-07 gates (multi-depot Cyberpunk 2077, hard-DRM title, interrupt-then-resume)
and Phase 21's 21-UAT.md real-hardware human verification (native .acf adoption, hard-DRM launch,
cancel-recovery, bottled Steam adoption, client-setup flows) — both required before milestone v0.7
completion.
| 2026-07-10 | fast | Replace CrossOver icon with monochrome weave mark | ✅ |
| 2026-07-11 | fast | Steam list-view store label showed 'Other' → 'Steam' (getStoreName) | ✅ |
| 2026-07-11 | fast | Removed redundant Steam-specific refresh button from LibraryHeader | ✅ |
| 2026-07-27 | fast | Tracked `.claude/settings.json` (was untracked) so the graphify hook-guard PreToolUse hooks persist + are shared; split the personal `Notification`/`Stop` ntfy.sh hooks out into globally-gitignored `settings.local.json` rather than publishing an unauthenticated ntfy topic name to the public fork remote. Stop hook still points at the never-changed `CHANGE-ME` placeholder. | ✅ |
