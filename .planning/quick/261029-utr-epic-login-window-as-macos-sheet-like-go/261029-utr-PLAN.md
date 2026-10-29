---
phase: quick-261029-utr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/main.rs
  - src/backend/__tests__/tauriShellSource.test.ts
  - .planning/milestones/v0.8-REQUIREMENTS.md
autonomous: false
requirements: [QUICK-261029-utr, REQ-34.4.2-10]

must_haves:
  truths:
    - "On macOS, Epic's launcher account login opens as a sheet attached to the main window, like GOG, Humble and Amazon"
    - "The Epic sheet is still the pristine WKWebView with zero injected JS, and Epic's login completes end-to-end inside it with no 403 on /id/api/email/exists and no challenge"
    - "The native × button, Esc, and a successful login each dismiss the Epic sheet and return the app to idle"
    - "Epic takes part in the T-34.4.2-39 single-flight latch: its visible window arms the latch, and a second visible login while it is pending or presented is refused"
    - "The Epic sheet is 464x592, like every other login sheet, and the login page fits it (live-gate size check)"
    - "REQ-34.4.2-10 records the Epic descope as lifted by operator request (quick-261029-utr), pending the live gate"
  artifacts:
    - path: "src-tauri/src/main.rs"
      provides: "open_pristine_login_sheet (renamed and generalised from open_gog_login_sheet, with a store tag); humble_login_open routes Epic and GOG after the latch"
      contains: "fn open_pristine_login_sheet("
    - path: "src/backend/__tests__/tauriShellSource.test.ts"
      provides: "Pins updated on purpose for the rename and the new Epic routing, each citing quick-261029-utr"
    - path: ".planning/milestones/v0.8-REQUIREMENTS.md"
      provides: "REQ-34.4.2-10 descope-lifted note"
      contains: "261029-utr"
  key_links:
    - from: "humble_login_open arm"
      to: "open_pristine_login_sheet"
      via: "host-keyed branch `if is_epic_login || is_gog_login {` placed AFTER the `if visible == true {` latch block"
      pattern: "if is_epic_login \\|\\| is_gog_login \\{"
    - from: "open_pristine_login_sheet"
      to: "open_pristine_epic_login_window"
      via: "as_sheet = visible (unchanged pristine body)"
      pattern: "open_pristine_epic_login_window\\(app, label, url, visible, user_agent, visible\\)"
    - from: "open_pristine_login_sheet"
      to: "present_login_window_as_sheet"
      via: "watchdog-raced thread (unchanged from GOG)"
      pattern: "present_login_window_as_sheet\\(&app_for_sheet"
---

<objective>
Present Epic's launcher account login on macOS as an AppKit sheet attached to `main`, the same
way GOG's pristine login has been presented since quick `261029-o1w`. This lifts the
REQ-34.4.2-10 Epic descope at the operator's request. The request itself is the decision. The
spec is the Problem and Solution sections of
`.planning/todos/pending/2026-10-29-epic-login-window-as-macos-sheet-like-gog.md`.

Out of scope: the in-store Sign in button inside the `/store/epic` embed. It already works and
passed Phase 50 UAT Item 2.

Purpose: Epic is the only login still free-floating. Today it can fall behind the main window,
it does not join the single-flight latch, and it has no native × button.

Output: Epic routed through the shared pristine-sheet helper after the latch. Test pins updated
on purpose. REQ-34.4.2-10 annotated. A blocking live gate.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-10-29-epic-login-window-as-macos-sheet-like-gog.md
@.planning/quick/261029-o1w-gog-login-window-as-macos-sheet-with-nat/261029-o1w-SUMMARY.md
@.claude/skills/gamelib-conventions/SKILL.md

Current state of src-tauri/src/main.rs. Line numbers are approximate, so grep for each one.
Quick `261029-o1w` and its follow-ups `261029-osq`, `eaf461137` and `78a108850` already did all
the hard work:

- `fn open_pristine_epic_login_window(app, label, url, visible, user_agent, as_sheet: bool)`
  (~3821). With `as_sheet == true`, the window is built ordered-out (`.visible(visible && !as_sheet)`,
  not centred, not focused), sized `.inner_size(464.0, 592.0)`, and given the native bar/×
  through `install_native_login_bar`. With `as_sheet == false` it is sized
  `.inner_size(900.0, 700.0)`, centred and focused. So passing `true` already gives Epic the
  464x592 sheet size, a native × and an ordered-out build. **The pristine body needs no edit at
  all.**
- `fn open_gog_login_sheet(app, label, url, visible, user_agent)` (~5060) does the following.
  It calls the pristine fn with `as_sheet = visible`, and on `Err` calls
  `clear_pending_visible_login_window` and returns. When `visible`, it takes
  `app.get_window(label)` and adds a second Destroyed hook: `dismiss_login_window_sheet`,
  `forget_native_login_bar`, `clear_pending_visible_login_window`. It then races
  `present_login_window_as_sheet` on a thread against
  `recv_timeout(LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT)`. If the result is unconfirmed, it logs a
  WARN and falls back to `show()`/`set_focus()`. It logs `[shell] humble_login_open:gog-sheet: sheet_presented={attached}`.
  Finally it calls `clear_pending_visible_login_window(label)` once and returns `Ok(result)`.
  None of this is GOG-specific except the log text.
- `"humble_login_open" =>` arm (~8158) computes `is_epic_login` (EPIC_LOGIN_HOST) and
  `is_gog_login` (GOG_LOGIN_HOST), each with `#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]`.
  Then, in order:
  (a) `#[cfg(target_os = "macos")] if is_epic_login { return open_pristine_epic_login_window(app, &label, url, visible, user_agent, false); }`
  (b) the T-34.4.2-39 latch, `#[cfg(target_os = "macos")] if visible == true { ... }`. Its literal text must not change.
  (c) `#[cfg(target_os = "macos")] if is_gog_login { return open_gog_login_sheet(app, &label, url, visible, user_agent); }`
  (d) `let current_origin`, followed by the untouched WebviewWindowBuilder path.
- These comments go stale once Epic is presented, so update them (comments only, all OUTSIDE
  the pristine body): the `login_window_ns_window` doc comment (~4236-4241, "Epic's label is
  never registered or presented"), the arm's present-block comment (~8563-8566, "The pristine
  Epic login window ... is deliberately NOT wired here or anywhere else -- REQ-34.4.2-10"), the
  latch comment ("Sits AFTER Epic's early return above (structural exemption, D-D)"), the arm
  comment above (a) about the pristine route, and the Esc-monitor comment in `main()`
  `.setup()` (~13340-13343, "Epic non-interference is STRUCTURAL ... Epic is never one --
  REQ-34.4.2-10"). Esc now SHOULD match Epic's presented sheet, which is the point of measurement
  (2).
- Two comments INSIDE the pristine body (~3832-3838) say "Epic stays 900x700" and
  "`as_sheet == false` is Epic's free-floating path". Leave them byte-unchanged. The constraint
  is zero edits to the pristine body. The helper's doc comment records the current truth: the
  `as_sheet == false` branch is now the rollback path and has no live caller.

Pins in src/backend/__tests__/tauriShellSource.test.ts. They run over comment-stripped main.rs.
- `PHASE_34_4_2_NEW_SYMBOLS` scope guard (several tests, around 1711-1860, 2038, 2266, 2335,
  2492). It slices from `fn open_pristine_epic_login_window(` to the next
  `#[cfg(target_os = "macos")]`, plus the first `define_class!(`, and asserts that no
  sheet/latch symbol appears there. It MUST stay green UNMODIFIED. That holds because the
  pristine body is not touched and the helper lives elsewhere. Never weaken it, never edit
  the array, never edit those tests.
- Guard 1/Guard 2 (~1523-1567): the arm's `if visible {` block has 464x592, and the pristine
  body still contains `.inner_size(900.0, 700.0)`. Both stay green unchanged, because the 900
  branch remains in the body as the `!as_sheet` path.
- Plan 07 "Test 1 (INVERTED 2026-08-04, updated quick-261029-o1w)" (~1923): file-wide
  `present_login_window_as_sheet(` count 2, arm count 1, one call inside the slice from
  `fn open_gog_login_sheet(` to the next macOS cfg.
- Plan 07/08 "Test 2 (... updated quick-261029-o1w)" (~1947): `dismiss_login_window_sheet(`
  count 3, one inside the `fn open_gog_login_sheet(` slice.
- Plan 14 "Test 1 (ORDERING)" (~2407): `armBody.indexOf('open_pristine_epic_login_window(')`
  is greater than -1 and less than the index of `PENDING_VISIBLE_LOGIN_WINDOW`, which is less
  than the index of `tauri::WebviewWindowBuilder::new(`. This WILL break once the arm no longer
  calls the pristine fn directly.
- Plan 14 "Test 3 (CLEAR-ON-EVERY-PATH)" (~2441): count 6, three inside the
  `fn open_gog_login_sheet(` slice.
- "Test 3b (quick-261029-o1w ORDERING)" (~2460): `if is_epic_login {` comes before
  `if visible == true {`, which comes before `if is_gog_login {`. This WILL break.
- `if visible == true {` stays the latch's literal text, and the first `if visible {` in the arm
  stays the builder-setup block (loginChromeCssInjection.test.ts relies on this).

Formatter facts for `<verify>` (gamelib-conventions, measured with `npx prettier --file-info`):
- `src/backend/__tests__/tauriShellSource.test.ts` gives `{ ignored: false, inferredParser: "typescript" }`. Prettier-check it.
- `src-tauri/src/main.rs` gives `{ ignored: false, inferredParser: null }`. Prettier has no Rust parser, so a prettier check on it would prove nothing. `rustfmt --check` stands in.
- `.planning/milestones/v0.8-REQUIREMENTS.md` gives `{ ignored: true }`. It is prettier-ignored, so no formatter check applies, and none is carried.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Route Epic through the shared pristine-sheet helper after the latch; update the pins on purpose</name>
  <files>src-tauri/src/main.rs, src/backend/__tests__/tauriShellSource.test.ts</files>
  <action>
Per the source todo (`2026-10-29-epic-login-window-as-macos-sheet-like-gog.md`, Solution) and the
operator's request that lifts REQ-34.4.2-10.

1. Generalise, don't duplicate. The todo asks for an `open_epic_login_sheet` wrapper "mirroring
   `open_gog_login_sheet`". Planner's discretion: a second copy of the same ~50 lines would
   double the latch-clear and dismiss call sites, and the two copies could drift apart. So
   rename `fn open_gog_login_sheet(` to `fn open_pristine_login_sheet(` and add a seventh
   parameter `store: &str` (values `"epic"` / `"gog"`). The body stays exactly as it is, with
   two changes. First, the three log lines use `humble_login_open:{store}-sheet:` in place of
   the literal `gog-sheet`, so GOG still logs `gog-sheet: sheet_presented=..` and Epic logs
   `epic-sheet: sheet_presented=..`. Second, its doc comment is rewritten. The new doc comment
   names both stores. It cites quick-261029-o1w (GOG) and quick-261029-utr (Epic, lifting the
   REQ-34.4.2-10 descope). It says that both stores use 464x592 through `as_sheet = visible`.
   It says that `open_pristine_epic_login_window`'s `as_sheet == false` branch (900x700,
   centred, focused) now has no live caller and is kept on purpose as the rollback path (see
   Task 3). Keep the fn where it is, macOS-gated and outside the pristine slice. Log lines
   carry the label and booleans only, never the URL. No name may contain a
   `PHASE_34_4_2_NEW_SYMBOLS` member as a substring inside the pristine slice. The helper is
   outside that slice, so this is satisfied automatically. Just do not move it.

2. Arm routing in `"humble_login_open" =>`. Delete the Epic early return (a) that sits before
   the latch. Replace (c) with one host-keyed branch, still `#[cfg(target_os = "macos")]`:
   `if is_epic_login || is_gog_login {`. Inside it, set `let store = if is_epic_login { "epic" } else { "gog" };`
   and then `return open_pristine_login_sheet(app, &label, url, visible, user_agent, store);`.
   Keep both `is_*` bindings and their `cfg_attr(... allow(unused_variables))`. Both values come
   only from the validated URL host, never from a caller flag. Do not change the latch block's
   text. Now a refused second login never builds an Epic window, and Epic arms the latch, which
   the helper clears on Err, on resolution, and on Destroyed. Epic on Windows/Linux still falls
   through to the shared WebviewWindowBuilder path exactly as today.

3. Do not edit `open_pristine_epic_login_window` at all, comments included. The only pristine
   change is the call site passing `as_sheet = true` (through `visible`), which the existing
   parameter already supports. Update the stale comments listed in `<context>`, all of which sit
   outside the pristine body, so they say Epic is now presented as a sheet (quick-261029-utr) and
   Esc now covers it.

4. Update these pins on purpose. Each update gets a comment citing quick-261029-utr and the todo.
   The test names get an "updated quick-261029-utr" suffix.
   (i) Plan 07 Test 1 and Plan 07/08 Test 2: change the slice anchor from
   `fn open_gog_login_sheet(` to `fn open_pristine_login_sheet(`. The counts stay 2 and 3, and the
   arm count stays 1.
   (ii) Plan 14 Test 3: same anchor change. The count stays 6, with 3 inside the helper. Update
   its explanatory comment.
   (iii) Plan 14 Test 1 (ORDERING): Epic's structural exemption (D-D) is lifted, so replace the
   `open_pristine_epic_login_window(` lower bound. Assert that `armBody` does NOT contain
   `open_pristine_epic_login_window(` (the pristine window is now reached only through the
   helper). Then assert that the index of `PENDING_VISIBLE_LOGIN_WINDOW` is less than the index
   of `open_pristine_login_sheet(`, which is less than the index of
   `tauri::WebviewWindowBuilder::new(`. Rewrite the ORDERING comment above it.
   (iv) Test 3b: rename it to say Epic and GOG both route after the latch. Assert
   `armBody.indexOf('if is_epic_login {') === -1`, so no pre-latch Epic exemption survives. Then
   assert the index of `if visible == true {` is greater than -1 and less than the index of
   `if is_epic_login || is_gog_login {`.
   Leave every other pin alone, and above all the `PHASE_34_4_2_NEW_SYMBOLS` array and the
   tests that use it, and Guard 1/Guard 2. If any other pin goes red, fix the code, not the pin.
   Run `graphify update .` after the code change (CLAUDE.md).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && S='/^fn open_pristine_epic_login_window\(/{f=1} f&&/^#\[cfg\(target_os = "macos"\)\]/{exit} f' && test -n "$(awk "$S" src-tauri/src/main.rs)" && diff <(git show HEAD:src-tauri/src/main.rs | awk "$S") <(awk "$S" src-tauri/src/main.rs) && echo PRISTINE-BODY-UNCHANGED && cd src-tauri && test -z "$(cargo build 2>&1 | grep -E '^(warning|error)')" && cargo test --quiet 2>&1 | grep -E "^test result: ok" && rustfmt --check --edition 2021 src/main.rs && cd .. && npx jest src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts src/backend/sidecar/__tests__/oauthLoginCapture.test.ts && npx prettier --check src/backend/__tests__/tauriShellSource.test.ts</automated>
    Run the pristine-body diff BEFORE committing, because it compares against HEAD. If you have already committed, substitute the pre-task commit for HEAD. The awk slice runs from the pristine fn's column-0 `fn` line to the next column-0 macOS cfg. That is at least as wide as the jest slice.
    Formatter note (gamelib-conventions): `npx prettier --file-info src-tauri/src/main.rs` reports `inferredParser: null`. Prettier cannot parse Rust, so a prettier check on main.rs is omitted as vacuous and `rustfmt --check` stands in. The .ts test file reports `inferredParser: "typescript"` and is checked by its exact path.
  </verify>
  <done>The pristine body is byte-unchanged (PRISTINE-BODY-UNCHANGED printed). `fn open_gog_login_sheet(` no longer exists and `fn open_pristine_login_sheet(` is called once from the arm, after the latch, for both hosts. `cargo build` reports 0 warnings and 0 errors. cargo tests pass. rustfmt is clean. The three jest suites are green with only the four deliberate pin updates, and the `PHASE_34_4_2_NEW_SYMBOLS` guard and Guard 1/Guard 2 are untouched and green. prettier is clean on the .ts file.</done>
</task>

<task type="auto">
  <name>Task 2: Record the lifted descope on REQ-34.4.2-10</name>
  <files>.planning/milestones/v0.8-REQUIREMENTS.md</files>
  <action>
On the `- [x] **REQ-34.4.2-10**:` bullet (~line 946), append one dated note in the style of the
existing ones. Do not rewrite or delete any earlier text, because the history is the record.
Begin it with `**DESCOPE LIFTED 2026-10-29 (quick-261029-utr, operator request):**`. Say the
following:
- Epic's launcher account login now presents as a macOS sheet on `main` through the shared
  `open_pristine_login_sheet` helper, which GOG has used since quick-261029-o1w. It joins the
  T-34.4.2-39 single-flight latch and uses the native × bar.
- The machine guard's meaning narrows but is not weakened. `open_pristine_epic_login_window`'s
  own body is still free of every `PHASE_34_4_2_NEW_SYMBOLS` member, and the sheet and latch
  plumbing lives in the helper outside it. The original "body unchanged by this phase" clause
  was already overtaken by quick-261029-o1w's `as_sheet` parameter. Say so plainly.
- The lift is PENDING the live gate in `261029-utr-PLAN.md` Task 3. If measurement (1) fails
  (403 or challenge), Epic reverts to free-floating and this note records why.
- The in-store `/store/epic` Sign in button is unaffected.
Keep the box ticked. The guard it encodes still passes. Do not mint, delete or renumber any ID.
Also update the file's `*Last updated:*` footer line only if the file's convention is to update
it for notes. Check the recent notes first. If they did not touch the footer, leave it.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && grep -n "REQ-34.4.2-10" .planning/milestones/v0.8-REQUIREMENTS.md | grep -c "DESCOPE LIFTED 2026-10-29 (quick-261029-utr" | grep -qx 1 && git diff --numstat .planning/milestones/v0.8-REQUIREMENTS.md && echo REQ-NOTE-OK</automated>
    Formatter note: `npx prettier --file-info .planning/milestones/v0.8-REQUIREMENTS.md` reports `{ "ignored": true }`. It is prettier-ignored, so a prettier check would prove nothing and is omitted.
  </verify>
  <done>REQ-34.4.2-10 carries exactly one "DESCOPE LIFTED 2026-10-29 (quick-261029-utr" note that says the lift is pending the live gate and gives the rollback rule. All earlier text is intact and the box stays ticked.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Live macOS gate for the Epic sheet (three measurements and the size check)</name>
  <files>none (live verification only)</files>
  <action>Before you pause, confirm that the verify commands for Tasks 1 and 2 are green and the work is committed. Then pause for the operator's live run on this Mac. Do not ask the operator to do anything Claude can automate. Record the result of each measurement verbatim in the SUMMARY.</action>
  <verify><human-check>Operator runs steps 0-6 under how-to-verify and replies "approved", or reports the failing step</human-check></verify>
  <done>The operator approved measurements (1)-(3) and the size check. Or (1) failed and the rollback below was applied and recorded. Or another step failed and was reported for a follow-up.</done>
  <what-built>Epic's launcher account login now opens as an AppKit sheet on the main window, sized 464x592, with the native × bar. It is still the pristine WKWebView with no injected JS, it routes after the T-34.4.2-39 latch, and Esc cancels it. GOG's behaviour is unchanged apart from the helper's rename.</what-built>
  <how-to-verify>
    0. Restart `tauri dev`. This change is Rust-only (main.rs), and restarting rebuilds main.rs. `tauri dev` does not rebuild the sidecar, but no sidecar code changed here, so that does not matter. If Epic is signed in, sign out first so the full login flow runs.
    1. MEASUREMENT (1), Talon and Turnstile. Go to Stores → Epic → Sign in (the launcher account login, NOT the in-store Sign in button). Expected: the login slides down as a sheet attached to the main window, and the shell log shows `epic-sheet: sheet_presented=true`. Sign in by email: the email step must not 403 (`/id/api/email/exists`) and no challenge or "verify you are human" step may appear. Complete the login. Expected: the sheet dismisses itself, Epic shows signed in, and the main window is usable.
    2. SIZE CHECK. While the sheet is open in step 1, look at Epic's login page at 464x592. Expected: there is no horizontal scrollbar, nothing is clipped at the right edge, every button and field (including any 2FA step) can be reached, and the × does not cover a control. If the page clearly needs more width, report it. Do not resize anything by hand. Widening the window would mean editing the pristine body's `as_sheet` size, which is a separate follow-up.
    3. MEASUREMENT (2), the three exits. Sign out and open the Epic sheet again. (a) Click the × at top right. Expected: the sheet closes, the Epic card returns to idle with no spinner, and the main window is clickable. (b) Open it again and press Esc. Expected: the same as (a). (c) The successful-login dismissal was already measured in step 1.
    4. MEASUREMENT (3), the latch. Open the Epic sheet. The shell log must show `visible login window '<label>' armed as the single pending login flow (T-34.4.2-39)` for Epic's label. Now try to start any other store's visible sign-in while the Epic sheet is up. Expected: it is REFUSED, and the log shows `REFUSED visible login window ... is already pending or presented`. If you cannot reach another sign-in by hand because the sheet is modal (as happened with o1w's GOG step 6), report "unreachable by hand". The armed log line plus the modality is then the recorded evidence, and that caveat is written into the SUMMARY.
    5. Regression check: GOG sign-in still opens as a sheet and logs `gog-sheet: sheet_presented=true`.
    6. Not this change: the Sign in button inside `/store/epic` still completes in place as before.

    ROLLBACK RULE. If measurement (1) fails, for example a 403 on `/id/api/email/exists`, a challenge, or a login that cannot complete inside the sheet, revert Epic to free-floating. Revert this plan's main.rs and test-file changes, which restores the pre-latch `if is_epic_login { return open_pristine_epic_login_window(..., false); }` early return and the GOG-only helper. In the source todo, record what was seen and why the revert happened, and keep `ready: live-gate` there. Replace the REQ-34.4.2-10 note with "lift attempted and reverted" plus the reason. Do NOT work around the failure with JS injection or any other change to the webview's construction.
  </how-to-verify>
  <resume-signal>Type "approved", or describe what differed (step number and what you saw). For step 4, say "refused" or "unreachable by hand".</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Epic login page → pristine WKWebView | An untrusted third-party page that handles credentials. It must see zero injected script (Talon/Turnstile are sensitive to webview construction) and must not be able to trigger shell actions. |
| sidecar → humble_login_open | The URL arg is validated by `login_window_url_arg`. Sheet and latch routing are keyed only on the validated host constants. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-utr-01 | Spoofing | single-flight latch | mitigate | Epic now routes after the `if visible == true {` latch, so no other store's sheet can arrive over Epic's (T-34.4.2-39). The latch is cleared in `open_pristine_login_sheet` on Err, on resolution and on Destroyed (count pinned at 6). |
| T-utr-02 | Elevation | routing flag | mitigate | `is_epic_login`/`store`/`as_sheet` come only from the validated URL host (`EPIC_LOGIN_HOST`/`GOG_LOGIN_HOST`), never from a caller argument. |
| T-utr-03 | Tampering | pristine page | mitigate | The pristine body is byte-unchanged (checked by awk diff) and the `PHASE_34_4_2_NEW_SYMBOLS` guard is unmodified. The × is a native AppKit control and no JS is injected. The rollback rule forbids an injection workaround. |
| T-utr-04 | Denial of service | main window stuck behind a sheet | mitigate | There are three exits (native ×, Esc monitor, programmatic close on success), each of which dismisses and then closes. The watchdog fallback shows a free-standing window if the attach is unconfirmed. |
| T-utr-05 | Information disclosure | logs | mitigate | The new `epic-sheet` log lines carry the label and booleans only, never a URL, origin or title (T-34.4.2-11). |
| T-utr-06 | Denial of service | latch held by an Epic flow that hangs | accept | The existing `PENDING_VISIBLE_LOGIN_WINDOW_TTL` expiry (T-34.4.2-41) bounds it, the same as for every other store. |
</threat_model>

<verification>
- The pristine `open_pristine_epic_login_window` body is byte-unchanged against the pre-task commit.
- `cargo build` emits 0 warnings and 0 errors. `cargo test` passes and rustfmt is clean.
- `tauriShellSource.test.ts`, `loginChromeCssInjection.test.ts` and `oauthLoginCapture.test.ts` are green. The only pin changes are the four deliberate ones, each citing quick-261029-utr. The `PHASE_34_4_2_NEW_SYMBOLS` guard and Guard 1/Guard 2 are unmodified.
- The REQ-34.4.2-10 note is present.
- Live Task 3 is approved, or the rollback is applied and recorded.
</verification>

<success_criteria>
On macOS, Epic's launcher account login is a 464x592 sheet on main with the native ×. The login
completes with no 403 or challenge. ×, Esc and successful login each dismiss it and return the
app to idle. Epic takes part in the single-flight latch. GOG is unchanged. The descope lift is
recorded on REQ-34.4.2-10.
</success_criteria>

<output>
Create `.planning/quick/261029-utr-epic-login-window-as-macos-sheet-like-go/261029-utr-SUMMARY.md` when done. Record each live measurement verbatim, including the step 4 caveat if it applies, and the size-check result.
</output>
