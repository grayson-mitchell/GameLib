---
phase: quick-260930-rph
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: false
requirements:
  - QUICK-260930-RPH
files_modified:
  - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/title-watch.ps1
  - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/rph-rescore.cjs
  - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-build-identity.txt
  - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-prediction.md
  - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-selftest.txt
  - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-selftest-fix-timeline.jsonl
  - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-selftest-bug-timeline.jsonl
  - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-selftest-notitle-timeline.jsonl
  - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-smoke.txt
  - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-live.txt
  - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-timeline.jsonl
  - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-shell-lines.txt
  - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-loadprobe.jsonl
  - .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-rescore.txt
  - .planning/todos/pending/2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md
  - .planning/todos/completed/2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md

estimate:
  tokens: 120000
  raw_tokens: 120000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - 'The INSTALLED %LOCALAPPDATA%\GameLib\gamelib-shell.exe (CI NSIS build of b48e8948f, a descendant of the 260927-o3h Started-only guard ae5968b07, title-path source identical to HEAD) is launched by the instrument, and the store login window the operator opens from Manage Accounts gets a title timeline sampled from app launch until after that window closes, at a p99 loop gap of 50 ms or less'
    - 'On PASS the login window first shows the bare origin (e.g. https://www.humblebundle.com), then <origin> U+2014 <document title>, and its final title is that composed form, held continuously for at least 60 s (FIN-B) or at least 15 s after an observed load-complete (FIN-A), with no bare-origin episode of 2 s or longer after the first composed title. The 38-W03 revert signature is absent'
    - 'The pass/fail/inconclusive criteria are committed to git BEFORE any login window opens. The scorer is proven on synthetic timelines to score the bug shape FAIL, the fix shape PASS and a no-title shape INCONCLUSIVE, and an independent node re-score agrees on C2-C5 for every synthetic and live timeline'
    - 'In every outcome (PASS, FAIL, INCONCLUSIVE, timeout, thrown error) zero gamelib-shell.exe and gamelib-sidecar.exe processes remain afterwards, and the operator''s own instance is never killed'
    - 'Committed evidence holds only window titles (origin plus the public page title), three whitelisted [shell] humble_login_open line shapes carrying lengths, hwnds, pids, timings, counts and the load-probe busy bit. It holds no app stdout, no other stderr line, no shell-log message text and no screenshots'
    - 'On PASS the todo is committed at completed/ via a pure R100 rename plus a separate content commit, with dated Result and Resolution sections, status: RESOLVED, severity/platform/ready intact, and a note that 38-W03''s accepted FAIL is superseded. On FAIL/INCONCLUSIVE it stays in pending/ with a dated Result and no src/ or src-tauri/ change'
  artifacts:
    - path: .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/title-watch.ps1
      provides: 'The instrument: launcher with whitelisted stderr pipe, 5 ms title sampler, MSAA load probe, harness close, pid-scoped teardown, scorer, synthetic target, SelfTest/Smoke/Live modes'
      contains: 'VERDICT: '
    - path: .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/rph-rescore.cjs
      provides: 'Independent node re-implementation of login-window identification and C2-C5/HOLD, written from the prediction text rather than ported from the PowerShell'
      contains: 'FINAL_TITLE_COMPOSED'
    - path: .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-prediction.md
      provides: 'Pre-registered checks, FIN rule, verdict mapping and real-profile-arm declaration, committed before the live run'
      contains: '## Pass criteria'
    - path: .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-live.txt
      provides: 'The scored live run: C0-C9, FIN path, bounds, counts, VERDICT line'
      contains: 'VERDICT: '
    - path: .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-timeline.jsonl
      provides: 'Deduplicated, timestamped top-level-window title timeline for the launched shell pid'
    - path: .planning/todos/completed/2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md
      provides: 'The closed todo (PASS branch only)'
      contains: '## Resolution'
  key_links:
    - from: 'title-watch.ps1 launcher (ProcessStartInfo, RedirectStandardError on an inherited pipe)'
      to: 'the eprintln! lines [shell] humble_login_open: title change applied len=N / presentation requested ...'
      via: 'The release build is windows_subsystem = "windows" and the login arm never calls shell_diag, so without an inherited stderr handle those lines reach nothing (gamelib-shell.log holds 0 humble_login_open lines)'
      pattern: 'RedirectStandardError'
    - from: 'sampler thread (EnumWindows filtered by GetWindowThreadProcessId == launched pid, GetWindowTextW)'
      to: 'the login window caption that tao writes via set_title'
      via: 'A cross-process GetWindowTextW reads the stored caption without sending WM_GETTEXT, so a busy app UI thread cannot stall the sampler'
      pattern: 'GetWindowTextW'
    - from: 'teardown order inside the C# finally'
      to: 'the stderr pipe read end'
      via: 'The app tree is killed and WaitForExit drains the async readers BEFORE the pipe closes. eprintln! panics on a broken pipe, so closing the reader first could crash the app mid-run'
      pattern: 'WaitForExit'
    - from: 'rph-prediction.md (Task 1 commit)'
      to: 'rph-live.txt VERDICT (Task 3)'
      via: 'git history orders pre-registration before the run; the scorer implements exactly the committed criteria'
      pattern: 'Pass criteria'
---

<objective>
Close the todo
`.planning/todos/pending/2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md`
by live-verifying on this Windows 11 machine that a store login window's title bar shows the
origin immediately, then `<origin> — <document title>`, and does NOT revert to the bare origin
after `PageLoadEvent::Finished`. That is the runtime half of quick 260927-o3h's fix (`ae5968b07`,
which guards `on_page_load`'s `set_title` to `Started` only). It is also the live check `38-W03`
failed in sitting 4 (2026-09-26) and accepted as a deviation.

Purpose: 260927-o3h pinned the source shape with a regression test. Nothing has watched the title
bar since. macOS renders the login window as a titleless AppKit sheet, so this machine is the
only surface available. The installed CI build already carries the fix.

Output:
- a pure-ASCII PowerShell 5.1 instrument with SelfTest, Smoke and Live modes, plus an independent
  node re-scorer
- pre-registered criteria, committed before any login window opens
- scored evidence
- the todo closed (PASS), or a FAIL or INCONCLUSIVE result recorded in its pending copy

No product code changes in any branch. If the title reverts, STOP and report. Do not fix code.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/todos/pending/2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md
@.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/260930-qmu-PLAN.md
@.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/r4-hijack-repair-check.ps1
@.planning/quick/260930-o75-phase-38-sitting-13-windows-38-e01-38-w0/hwnd_sampler.ps1

Read from `src-tauri/src/main.rs` by SYMBOL, never by line number. A rebase onto origin/main landed
quick-260930-q11 during planning and moved the arm by about 108 lines. Locate the code with
`graphify query "humble_login_open on_page_load on_document_title_changed"`, or grep for the anchors
quoted below. The symbols to read are:
- `login_window_title`
- the `"humble_login_open" =>` match arm, specifically its `if visible {` builder block, its
  `.on_page_load(` closure and the post-`.build()` `if visible {` blocks
- `push_login_window_event`

Also read:
- `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md`,
  the `## Sitting 4` section and its `38-W03` paragraph

## Facts measured at planning time (2026-09-30, evening +13)

Re-measure every one of these at execution. None of them authorizes a launch, a window close or
a process kill by itself. Only the live preconditions, observed immediately before the action, do.

**The only title path, quoted from source.**
- `login_window_title(origin, document_title)` returns `format!("{origin} — {title}")` when the
  document title is `Some` and non-empty, and otherwise the origin alone. The separator is space,
  U+2014 EM DASH, space.
- In the `"humble_login_open"` arm, `origin` is `url.origin().ascii_serialization()` of the
  validated https URL. Off macOS, `let initial_visible = visible;`, so the window is presented
  directly with no sheet.
- Inside `if visible {`:
  - `builder = builder.title(login_window_title(&origin, None));`
  - `.on_document_title_changed(...)`: on an empty title it logs
    `[shell] humble_login_open: title change SKIPPED len=0 (empty document title; previous title retained)`
    and returns.
  - Otherwise it runs `window.set_title(&login_window_title(&origin_now, Some(&title)))`, then
    `eprintln!("[shell] humble_login_open: title change applied len={}", title.len())`. The length
    is in BYTES, and the title string itself is never logged.
- `.on_page_load(...)` maps `PageLoadEvent::Started => ("started", true)` and
  `Finished => ("finished", false)`.
  - It pushes `{event, url}` via `push_login_window_event`, with NO log line.
  - Under `if visible` it runs `if is_started { let _ = window.set_title(&login_window_title(&new_origin, None)); }`.
    This is the o3h guard.
- After `.build()`, under `if visible`:
  - `eprintln!` of
    `[shell] humble_login_open: presentation requested visible=true width=900 height=700 center=true focus_once=true persistent_pin=false light_theme_requested=true sheet_presented={sheet_presented}`,
    where `sheet_presented` is `false` off macOS
  - `window.set_title(&login_window_title(&origin, None))`, which seeds the title
- The title-selected lines are byte-identical between `b48e8948f` and HEAD. The measure: grep each
  side's main.rs for `set_title\(|builder\.title\(login_window_title|if is_started \{|PageLoadEvent::(Started|Finished) =>|title change (applied|SKIPPED)|format!\("\{origin\} — \{title\}"\)`,
  strip the line numbers, and diff.

**The page-load mapping.** `Cargo.lock` pins wry `0.55.1` at both `b48e8948f` and HEAD. Its
`src/webview2/mod.rs` (in `~/.cargo/registry/src/index.crates.io-*/wry-0.55.1/`) maps:
- `add_ContentLoading` to `PageLoadEvent::Started`
- `add_NavigationCompleted` to `PageLoadEvent::Finished`
- `add_DocumentTitleChanged` to the title handler, which reads `webview.DocumentTitle`

WebView2 raises NavigationCompleted when the document has fully loaded or loading stopped.

**Which windows take this path.** Every visible store login on Windows goes through this one arm:
- Humble: `src/backend/humble/user.ts` calls `seam.open(HUMBLE_LOGIN_URL, { visible: true, ... })`,
  with `HUMBLE_LOGIN_URL = 'https://www.humblebundle.com/login'`. `HumbleLoginSurface.tsx` starts
  the login on mount, so opening Humble's Manage Accounts tile opens the window.
- GOG, Epic, Amazon and Zoom go through `captureOAuthLogin` in
  `src/backend/sidecar/oauthLoginCapture.ts`.
- The one non-shared route, `open_pristine_epic_login_window`, is `#[cfg(target_os = "macos")]`.

Humble is the target: its expected origin is `https://www.humblebundle.com`.

**Observability. This paragraph is load-bearing.**
- Every line in the login arm is `eprintln!`, and the arm never calls `shell_diag`.
- The release build is `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`, so
  stderr goes nowhere unless the parent hands the process a handle.
- `~/.config/gamelib/gamelib-shell.log` held 186 lines, 0 of them containing `humble_login_open`.
- NO line anywhere marks Started or Finished:
  - `on_page_load` pushes its events silently.
  - Humble's `checkCookie` consumes `'finished'` silently.
  - `captureOAuthLogin` logs only `nav host=<host>`, and only on a host change.
- So `Finished` has NO direct observable channel in the shipped build. With the fix in, Finished's
  only former visible effect, the bare-origin reset, is exactly what the fix removed.
- The orchestrator asked for a "pid-matched, offset-scoped shell log" cross-check. It is kept as
  C9, a record that the channel is empty, which is what the source predicts.
- The real in-process cross-check is C6: the arm's own stderr lines, captured through an inherited
  pipe.
- Finished itself is bounded by the pre-registered FIN rule (FIN-A or FIN-B, below). This is
  stated as a limit, not hidden.

**Why Humble discriminates: the 38-W03 positive control.** Sitting 4 ran on 2026-09-26 on this
machine, with the pre-fix installed build from `5b6201e26`.
- It recorded `[shell] humble_login_open: presentation requested ... sheet_presented=false` and
  `[shell] humble_login_open: title change applied len=22`.
- The bar read `https://www.humblebundle.com` and never became
  `https://www.humblebundle.com — Humble Bundle - Log In`.
- On this page, on this machine, a 22-byte document title therefore arrived and was overwritten by
  the pre-fix Finished reset before a human could see it. Finished follows the title within
  human-imperceptible time here.
- That is what makes a composed title held for 60 s a discriminating result on Humble's page, and
  only on that page.

**Why the operator clicks.**
- The Manage Accounts sign-in control is `<div className="runnerLogin" onClick=...>`, in
  `src/frontend/screens/Login/components/Runner/index.tsx`.
- React delegates listeners to the root, so Chromium exposes no default action on that element and
  UIA InvokePattern is not reliable.
- A synthesized click would take over the cursor of an operator who is sitting at the machine.

**Other environment facts.**
- WebView2 child classes under a Tauri window were measured in sitting 13, in
  `.planning/quick/260930-o75-phase-38-sitting-13-windows-38-e01-38-w0/evidence/e01-hwnd/hwnd-samples.jsonl`:
  `WRY_WEBVIEW`, `Chrome_WidgetWin_0`, `Chrome_WidgetWin_1`, `Chrome_RenderWidgetHostHWND`.
- The main window title is `GameLib` (`src-tauri/tauri.conf.json`, label `main`).

**Build under test.**
- The installed shell is `%LOCALAPPDATA%\GameLib\gamelib-shell.exe`: 16554496 bytes, mtime
  2026-09-29 23:44.
- Its sha256 is
  `5adce1beb48ccc8f82695f98164062e6e53f45581dd0f188269015eba6c63a9f`, equal to
  `.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-build-identity.txt`,
  which is the CI NSIS build of release-tauri.yml run `36556473399` at `b48e8948f`.
- `git merge-base --is-ancestor ae5968b07 b48e8948f` succeeds. So does
  `git merge-base --is-ancestor b48e8948f HEAD`.
- `grep -c -a -F` on the exe returns 1 for each of these literals:
  - `humble_login_open: title change applied len=`
  - `humble_login_open: title change SKIPPED len=0`
  - `humble_login_open: presentation requested visible=true`
- No `gamelib-*` process was running.

**Environment (qmu lessons, re-applied).**
- `pwsh` is absent. `powershell.exe` is Windows PowerShell 5.1.26100.
  - It reads a BOM-less `.ps1` as ANSI, so the script must be pure ASCII. Build U+2014 with
    `[char]0x2014`.
  - Its `Add-Type` compiles with the .NET Framework C# 5 compiler: no string interpolation, no
    `?.`, no `out var` and no expression-bodied members.
  - Under `$ErrorActionPreference = 'Stop'`, merged native stderr becomes a terminating error, so
    every native call gets `2>$null`.
  - Every teardown step is wrapped in its own try/catch. The qmu first attempt crashed inside its
    finally block exactly this way.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File <repo-relative forward-slash path> -Mode X`
  works from the repo root in Git Bash, and the exit code propagates.
- The launch environment inherits `HOME=C:\Users\grays`, which equals `USERPROFILE`, and `CI` is empty.
- A powershell process detached with `Start-Process` survived the end of its Bash call (measured).
  It is NOT relied on: the live run is foreground.

**Gates.**
- `PYTHONUTF8=1 pnpm planning-gates` gives `12/12 planning gates passed`. Without it, the known
  cp1252 crash gives 11/12.
- `npx prettier --file-info` reports `{ "ignored": true, "inferredParser": null }` for both new
  script paths under `.planning/`.

**Citations of the todo's pending/ path.**
- NONE under `src/`, `src-tauri/` or `meta/`.
- Four under `.planning/`. Three are history and are left as written:
  - `260927-o3h-SUMMARY.md`
  - `260928-raq-PLAN.md`
  - the forward pointer inside
    `.planning/todos/completed/2026-09-26-login-window-on-page-load-overwrites-the-composed-title.md`,
    which says "filed as a standing item at ...": a historical fact, per the qmu precedent
- The fourth is the pending-todo list in `.planning/STATE.md`. It belongs to the orchestrator, not
  this executor.

**`38-VERIFICATION.md`.** `38-W03` already sits in `human_verification_discharged` as the accepted
FAIL. No documented reason exists to edit it, so it is NOT edited. The todo records the
supersession instead.

## Pre-registered criteria (Task 1 copies these into evidence/rph-prediction.md verbatim in substance)

**Terms.**
- O is an origin matching `^https://[A-Za-z0-9.-]+(:[0-9]+)?$`.
- EM is the 3 characters space, U+2014, space.
- A composed title is `O + EM + X`, with X non-empty.

**Identification.**
- MAIN is the first top-level window of the launched pid ever observed visible.
- LOGIN is a top-level window of that pid, other than MAIN, that is observed visible and whose
  first visible title matches `O` or `O + EM + X`.
- LOGIN's scored samples are its visible samples from first visibility to vanish, or to the end.
- `t_open` is LOGIN's first visible sample.
- `t_comp` is the first composed sample.
- `t_last` is the last title change before close.
- `t_close` is the vanish time.
- `HOLD = t_close - t_last`.

**Checks.**
- **C0 cadence:** the p99 of consecutive sampler-loop gaps over the run is 50 ms or less, and the
  max gap within `[t_open - 1 s, t_open + 15 s]` is 250 ms or less. Otherwise INCONCLUSIVE
  (instrument).
- **C1 window:** exactly one LOGIN. 0 gives INCONCLUSIVE(no-window); more than 1 gives
  INCONCLUSIVE(multiple).
- **C2 shape:**
  - Every scored LOGIN title is `O` or `O + EM + X`. Any other title is FAIL, the anti-phishing
    shape of WR-07 / T-34.5-G6-23: empty, `GameLib`, a framework default, or text before the origin.
  - Record `first_title_bare: yes|no`.
  - For `-Store humble`, the first O must equal `https://www.humblebundle.com`. A mismatch is
    recorded as `origin_mismatch`, is not a FAIL, and disables FIN-B.
- **C3 composed:** at least one composed LOGIN sample. None gives INCONCLUSIVE(no-document-title):
  the page never set a title, or the hook never fired, so the revert is untestable.
- **C4 no revert episode:** after `t_comp`, every maximal run of bare-O samples lasts under
  2000 ms and is followed by a composed sample.
  - A bare run of 2000 ms or more after `t_comp` is FAIL.
  - Shorter runs are listed as `nav_reset_episodes`. They are consistent with a Started reset for a
    new navigation, which the fix deliberately keeps.
- **C5 final:** LOGIN's last title before `t_close` is composed. A bare O is FAIL: it is exactly the
  38-W03 signature.
- **C6 in-process cross-check:** APPLIED is the set of whitelisted `title change applied len=N`
  lines received between launch and `t_close`.
  - If the stderr channel delivered zero lines of ANY kind during the run, C6 is UNAVAILABLE.
  - Otherwise it requires all of the following, and a mismatch gives INCONCLUSIVE(cross-check):
    - APPLIED has 1 or more lines
    - the last APPLIED `N` equals the UTF-8 byte length of X in LOGIN's final title
    - exactly one `presentation requested visible=true ... sheet_presented=false` line
- **C7 Finished evidence (FIN):**
  - **FIN-A (load probe).** It is available iff the MSAA probe saw STATE_SYSTEM_BUSY (0x800) set on
    LOGIN's `Chrome_RenderWidgetHostHWND` document in at least one sample and clear in a later one.
    `t_loaded` is the last set-to-clear transition.
    - If available, it requires `t_loaded >= t_comp - 250 ms`. Otherwise the result is
      INCONCLUSIVE(non-discriminating): the title arrived after the load, so the pre-fix code would
      also have ended composed.
    - It also requires the final composed title to be held continuously from
      `max(t_loaded, t_last)` to `t_close`, with `t_close - t_loaded` at least 15000 ms.
    - Busy still set at the last probe sample before `t_close` gives
      INCONCLUSIVE(load-not-complete).
    - The mapping from busy-clear to load-complete is [ASSUMED]. It is validated only by requiring
      busy to be seen SET at least once.
  - **FIN-B (control anchor).** FIN-A is unavailable, AND LOGIN's final O equals the CONTROLLED
    origin (`https://www.humblebundle.com` for `-Store humble`, and none for any other store),
    AND `HOLD >= 60000 ms`.
  - C7 holds iff FIN-A holds, OR FIN-A is unavailable and FIN-B holds. If FIN-A is available but
    fails, FIN-B cannot rescue it. A non-Humble store therefore needs FIN-A.
- **C8 teardown:** zero gamelib-shell.exe and gamelib-sidecar.exe after teardown. A violation
  gives exit 3, the loudest outcome.
- **C9 informational:** the shell log read after the pre-launch byte offset. Record the new-line
  count, the count of lines matching `pid=<launched pid> `, and the count containing
  `humble_login_open` (predicted: 0). No message text is recorded.

**Verdict order.**
1. FAIL if C2, C4 or C5 fails. A persistent terminal state does not depend on cadence.
2. Otherwise INCONCLUSIVE if C1, C3, C0, C6 (mismatch) or C7 is unmet.
3. Otherwise PASS.

**Expected for Humble.**
1. The first title is `https://www.humblebundle.com`.
2. It then becomes `https://www.humblebundle.com` + EM + `Humble Bundle - Log In`. X is 22 bytes,
   matching 38-W03's `len=22`. There may be an interim X that is WebView2's URL-shaped default
   title.
3. The final title is composed, held about 90 s, until the harness posts WM_CLOSE.
4. The last C6 `N` is 22, and C9 finds 0 `humble_login_open` lines.

## Deliberate real-profile arm (CLAUDE.md two-profile rule, half 2)

The live run uses the INSTALLED app on the operator's REAL profile, with the inherited `HOME` and
`USERPROFILE` and no env block edits. This is declared, not an oversight.

**Why it is the real profile:**
1. quick-260930-o75 measured that on Windows the Tauri shell resolves its own folders through the
   known-folder API regardless of the eight variables. That includes the WebView2 cookie jar the
   login window uses.
   - A fake HOME would therefore isolate the sidecar's store data but NOT the login webview's jar.
   - The result is a split-brain profile, where the sidecar believes every store is disconnected
     while the login page sees the real session.
   - That is the appearance of isolation over exactly the thing that is not isolated.
2. The title path has no environment dependency, so faking HOME buys nothing for the thing under
   test.
3. The todo names the real app's Manage Accounts route.

**Mitigations:**
- No credentials are typed, and no sign-in is attempted.
- The harness closes the login window.
- Stderr is read in memory and only three anchored line shapes carrying lengths are kept. Stdout
  is only counted.
- There are no screenshots. Unlike sitting 13's sampler, the capture step is deliberately dropped.
- The shell log contributes counts only.
- The load probe records only a busy bit and the document name.
- A privacy grep runs over `evidence/` before every commit.
</context>

<tasks>

<!-- planner-discipline-allow: SELFTEST-DROPPED-MARKER -->
<!-- Rationale: the synthetic target must emit a stderr line carrying this exact marker so the
     SelfTest can prove the whitelist DROPS non-whitelisted lines. Its absence from every file
     under evidence/ is the proof. The literal lives in title-watch.ps1 (not scanned) and in this
     plan; evidence prose refers to it only as "the dropped-line marker". -->

<task type="tracer">
  <name>Task 1: Build the title instrument and prove it end-to-end -- synthetic bug/fix/no-title controls score FAIL/PASS/INCONCLUSIVE with an agreeing independent re-score, the real installed app launches, streams stderr and tears down to zero -- then pre-register the criteria and commit before any login window opens</name>
  <files>.planning/quick/260930-rph-close-the-login-window-title-todo-live-v/title-watch.ps1, .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/rph-rescore.cjs, .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-build-identity.txt, .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-prediction.md, .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-selftest.txt, .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-selftest-fix-timeline.jsonl, .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-selftest-bug-timeline.jsonl, .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-selftest-notitle-timeline.jsonl, .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-smoke.txt</files>
  <read_first>src-tauri/src/main.rs (the symbols named in context, by anchor text), .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/r4-hijack-repair-check.ps1 (PS 5.1 structure, preconditions, per-step try/catch teardown), .planning/quick/260930-o75-phase-38-sitting-13-windows-38-e01-38-w0/hwnd_sampler.ps1 (the EnumWindows/GetWindowThreadProcessId/GetWindowText Add-Type pattern), .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-build-identity.txt</read_first>
  <action>
All paths are relative to the repo root; run everything from the repo root in Git Bash. TD is
`.planning/quick/260930-rph-close-the-login-window-title-todo-live-v` and E is `TD/evidence`.

**Evidence file rules.** Every evidence file is:
- UTF-8 without a BOM, with LF line endings
- pure ASCII: every character outside 0x20-0x7E inside a title is written as `\uXXXX`, so U+2014
  appears as `\u2014`. Prose in `rph-prediction.md` writes it as "U+2014".
- `key: value` lines wherever a key is named

Evidence prose must describe credentials and account identifiers only generically. Task 3's verify
block holds the exact negative-grep term list, and no evidence file may contain any term on it.
Write files with `[System.IO.File]::WriteAllText` and `New-Object System.Text.UTF8Encoding $false`,
never `Set-Content -Encoding utf8`, which writes a BOM in 5.1.

**Step 1 -- Build identity (bash, read-only).** Write `E/rph-build-identity.txt` with these keys:
- `installed_exe`, `size_bytes`, `mtime`, `sha256`
- `sha256_match: yes|no`, compared case-insensitively against the sha256 line in qmu's
  `r4-build-identity.txt`
- `ancestor_ae5968b07_of_b48e8948f: yes|no`
- `ancestor_b48e8948f_of_head: yes|no`
- `title_path_identical_b48e8948f_vs_head: yes|no`, measured as described in context
- `wry_version_b48e8948f` and `wry_version_head`, from each side's `src-tauri/Cargo.lock`
- one `literal_count: <literal> = <n>` line for each of the three exe literals in context

STOP and report if `sha256_match` is no, either ancestry is no, the title path differs, or any
literal count is 0. The build under test would then no longer be the one whose fix provenance was
established.

**Step 2 -- Write `TD/title-watch.ps1`.**
- It targets Windows PowerShell 5.1, with `Set-StrictMode -Version Latest` and
  `$ErrorActionPreference = 'Stop'`.
- It must be pure ASCII, including comments.
- Every native command gets `2>$null`, and every teardown step is wrapped in its own try/catch.
- Parameters:
  - `-Mode`: `SelfTest`, `Smoke`, `Live` or `SyntheticTarget`
  - `-EvidenceDir`: default `$PSScriptRoot\evidence`
  - `-Store`: `humble`, `gog`, `epic` or `amazon`, for Live only
  - `-Shape`: `fix`, `bug` or `notitle`, for SyntheticTarget only

Put the timing-critical work in ONE C# type compiled with Add-Type. Respect the C# 5 limits noted in
context. The type contains:

(a) **Launcher.**
- A ProcessStartInfo with `UseShellExecute` false, `RedirectStandardError` true,
  `RedirectStandardOutput` true and `RedirectStandardInput` false.
- `CreateNoWindow` is a caller flag. It is true for the synthetic target, so no console window
  appears.
- WorkingDirectory is the exe's directory.
- The environment is inherited UNMODIFIED: no env block edits. That is the real-profile arm.
- `ErrorDataReceived` timestamps each line with the ONE shared Stopwatch, started at launch.
  - A line is kept ONLY if it matches one of three anchored regexes:
    - `^\[shell\] humble_login_open: title change applied len=\d+$`
    - `^\[shell\] humble_login_open: title change SKIPPED len=0 \(empty document title; previous title retained\)$`
    - `^\[shell\] humble_login_open: presentation requested visible=true width=900 height=700 center=true focus_once=true persistent_pin=false light_theme_requested=true sheet_presented=(true|false)$`
  - Every other line only increments `stderr_lines_total`, and is never stored or written.
- `OutputDataReceived` only counts.

(b) **Sampler thread.**
- Call `timeBeginPeriod(1)` from winmm, paired with `timeEndPeriod(1)` in a finally.
- Loop:
  - `EnumWindows`, keeping top-level windows whose `GetWindowThreadProcessId` equals the launched pid
  - for each one, `IsWindowVisible` plus `GetWindowTextW`, sized by `GetWindowTextLengthW`
  - diff against a per-hwnd last state
  - append a deduplicated event (`appear`, `change`, `vis` or `vanish`) carrying `t_ms` (Stopwatch,
    0.1 ms), `utc`, `hwnd` (hex), `vis` and `title`
  - record every loop gap for the C0 stats: p50, p99, max, and the max inside the C0 window
  - sleep about 5 ms
- Identify MAIN and LOGIN live, by the identification rule in context, and publish LOGIN to (c)
  and (d).

(c) **Load-probe thread.** It is an STA background thread polling every 100 ms, and it only starts
once LOGIN is known.
- Find the `Chrome_RenderWidgetHostHWND` descendant through `EnumChildWindows(LOGIN)`.
- Call `AccessibleObjectFromWindow(child, OBJID_CLIENT, IID_IAccessible)`, then read `accState(0)`
  masked with 0x800, and `accName(0)`.
- Reference `Accessibility.dll` by full path from
  `[System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()`.
- Record transitions only, plus the `found`, `not_found` and `error` counters.
- Every exception is counted, never propagated. The probe must never stall or kill the sampler.
- If it cannot be made to work within this task, ship it as `probe: disabled`. FIN-A is then
  unavailable by pre-registration, and only Humble can PASS.

(d) **Harness close.**
- When LOGIN's title has been unchanged for `QuiescenceMs`, AND the probe does not currently report
  busy set:
  - re-check that `GetWindowThreadProcessId(LOGIN)` equals the launched pid
  - post `WM_CLOSE` (0x0010) with `PostMessage`
  - record `close_posted_t_ms`
- After LOGIN vanishes, wait `TailMs`, then run the teardown in (e).

(e) **Teardown, in a finally that runs in every outcome, in this order.**
1. Run `taskkill.exe /PID <pid> /T`, which is graceful WM_CLOSE.
2. Wait up to 10 s.
3. Run `taskkill.exe /PID <pid> /T /F`.
4. Wait for exit.
5. Call `WaitForExit()` to drain the async readers.
6. Only then dispose.

The pipe read end must outlive the app, because `eprintln!` panics on a broken pipe. This step is
pid-scoped only.

In the PowerShell layer, after the C# teardown, Smoke and Live ALSO run an image-name sweep. It
`Stop-Process -Force`s any gamelib-shell.exe or gamelib-sidecar.exe whose ExecutablePath is under
`%LOCALAPPDATA%\GameLib\`. P1 proved none existed before, so any found is ours. Then:
- wait up to 10 s for zero; that result is C8
- count, informationally, the msedgewebview2.exe processes whose CommandLine contains
  `gamelib-shell.exe.WebView2`

SelfTest NEVER sweeps by image name. powershell.exe is shared with the executor's own shells.

**Timeline JSONL format.**
- The first line is `{"ev":"meta",...}`, carrying pid, launch utc and the bounds.
- Then one line per event.
- The last line is `{"ev":"end","t_ms":...}`.

**Scorer.** Implement ONE PowerShell scorer function, with exactly the criteria in context. Its
inputs are:
- the timeline
- the kept stderr lines
- the probe transitions
- `HoldMs`, the FIN-B hold
- `ControlledOrigin`
- `ExpectOrigin`

It emits these lines:
- `C0:` through `C9:`, each giving `PASS`, `FAIL`, `INCONCLUSIVE`, `UNAVAILABLE` or `INFO` plus
  the observed values
- `fin_path: A|B|none`
- `nav_reset_episodes: <n>`
- `first_title`, `final_title` and `hold_ms`
- a final line, exactly `VERDICT: PASS`, `VERDICT: FAIL` or `VERDICT: INCONCLUSIVE`

**Preconditions (Smoke and Live).** All of these are read-only and run before any launch. On
failure, write the reason, launch nothing, and exit 2.
- P1: zero gamelib-shell.exe and zero gamelib-sidecar.exe, via `Get-CimInstance Win32_Process`.
  A running instance is the operator's: STOP, and NEVER kill it.
- P2: the installed exe exists and its `Get-FileHash -Algorithm SHA256` equals the Step 1 sha256.
- P3: `$env:CI` is not `e2e`.
- P4 (recorded only): `home_set` and `home_equals_userprofile`.
- P5 (recorded only): the shell log path `Join-Path $env:HOME '.config\gamelib\gamelib-shell.log'`,
  its existence, its byte length as `shell_log_offset_bytes`, and its line count. Never any
  message text.

**Modes.**

- **SyntheticTarget.** A WinForms process.
  - Show a main form titled `GameLib`.
  - At +1000 ms, show a second form titled `https://selftest.invalid` and write the whitelisted
    `presentation requested ... sheet_presented=false` line to stderr.
  - For `fix` and `bug` only:
    - at +1400 ms, write `[shell] humble_login_open: title change applied len=16` to stderr and
      set the title to origin + EM + `Synthetic Log In`, which is 16 bytes
    - at +1700 ms, set origin + EM + `Transient` for 60 ms, then restore the composed title
  - For `bug` only: at +2000 ms, set the bare origin and leave it there. This is the terminal
    38-W03 revert.
  - Also write one stdout line, and one stderr line containing `SELFTEST-DROPPED-MARKER`.
  - Build the em dash from `[char]0x2014`.
  - A WM_CLOSE on the second form closes only it. A graceful taskkill closes the main form and
    ends the process.

- **SelfTest.** For each shape (`fix`, `bug`, `notitle`):
  - Launch `powershell.exe -NoProfile -ExecutionPolicy Bypass -File <this script> -Mode SyntheticTarget -Shape <s>`
    through the SAME launcher, with `CreateNoWindow` true, `QuiescenceMs` 4000, `TailMs` 1000 and
    a hard bound of 30 s.
  - Score with `HoldMs` 3000 and `ControlledOrigin` = `ExpectOrigin` = `https://selftest.invalid`.
  - Write `E/rph-selftest-<shape>-timeline.jsonl`.
  - Run `node <TD>/rph-rescore.cjs <timeline>`, and require its `C2:` to `C5:` status words to equal
    the PowerShell scorer's.

  `SELFTEST: PASS` requires all of the following, and `E/rph-selftest.txt` lists every one of them:
  - `fix` scores VERDICT PASS
  - `bug` scores VERDICT FAIL, with C5 FAIL and C4 FAIL
  - `notitle` scores VERDICT INCONCLUSIVE, with C3 unmet
  - the `fix` and `bug` timelines both contain the `Transient` state, proving a 60 ms state is
    captured
  - the kept stderr lines are exactly the whitelisted ones: presentation plus applied for `fix`
    and `bug`, and presentation only for `notitle`
  - the dropped-line marker is absent from every file written
  - C0 PASS for every shape
  - `rescore_agrees_<shape>: yes` for every shape
  - zero processes remain in each synthetic pid tree, checked by pid and never by image name

  The last line is `SELFTEST: PASS` or `SELFTEST: FAIL`, and the exit code is 0 or 1.

- **Smoke.**
  - Run P1-P5.
  - Launch the installed exe through the launcher.
  - Wait up to 60 s for a visible top-level window titled `GameLib`, then observe for 15 s more.
  - Exercise the probe plumbing ONCE against MAIN's `Chrome_RenderWidgetHostHWND`. Record
    `probe_plumbing: ok|failed`, the busy bit, and the accName length.
  - Tear down, then sweep.
  - Write `E/rph-smoke.txt` with these keys:
    - `main_window_seen`, `main_window_title` and `t_main_ms`
    - `stderr_lines_total`, `stderr_kept`, predicted 0 because no login window opens
    - `stdout_lines_total`
    - `stderr_channel: available|unavailable`, which is available iff `stderr_lines_total` is 1 or
      more
    - the C0 stats, the C8 result, and the C9 counts
    - `webview2_informational`
  - `SMOKE: PASS` iff MAIN was seen AND C8 found zero.
  - If `stderr_channel` is unavailable, `rph-prediction.md` MUST pre-register C6 as UNAVAILABLE for
    Live.

- **Live** (Task 3 runs it).
  - Run P1-P5.
  - Launch the app and run the sampler and probe.
  - Bounds: LOGIN must appear within 300 s of launch; `QuiescenceMs` is 90000; `TailMs` is 5000;
    the hard bound is 510 s from launch.
  - When a bound is reached, the harness closes LOGIN and tears down.
  - Teardown, sweep, then read the C9 shell log after the P5 offset.
  - Score with `HoldMs` 60000.
    - For `-Store humble`, `ControlledOrigin` and `ExpectOrigin` are both
      `https://www.humblebundle.com`.
    - For any other store, both are empty, so FIN-A is required.
  - Write these files:
    - `E/rph-timeline.jsonl`
    - `E/rph-shell-lines.txt`, one `<t_ms> <kept line>` per line
    - `E/rph-loadprobe.jsonl`
    - `E/rph-live.txt`, recording:
      - `run: performed`, the store, `launched_pid`, and the P1-P5 results
      - the LOGIN hwnd, `t_open`/`t_comp`/`t_last`/`t_close`/`close_posted_t_ms`
      - the stderr and stdout counts
      - the scorer output, ending `VERDICT: <v>`
  - Exit 0 on PASS, 1 on FAIL, 4 on INCONCLUSIVE, 2 on an unmet precondition, and 3 if C8 fails
    after teardown.

**Step 3 -- Write `TD/rph-rescore.cjs`.** Node, no dependencies, CommonJS.
- Usage: `node rph-rescore.cjs <timeline.jsonl>`.
- Skip the `meta` and `end` lines.
- Apply the identification rule and the C2-C5 and HOLD definitions from the prediction TEXT.
  Re-implement them; do NOT port the PowerShell. Independence is the point.
- Print these lines, and always exit 0:
  - `C2: <status>` through `C5: <status>`
  - `HOLD_MS: <n>`
  - `FINAL_TITLE: <escaped>`
  - `FINAL_TITLE_COMPOSED: yes|no`

**Step 4 -- Pre-register `E/rph-prediction.md`** (ASCII only). Give it these sections:
- `## Source facts`, quoting the context's source anchors and the wry mapping
- `## Observability`, stating plainly that Finished has no direct channel in this build and why
- `## Expected sequence (Humble)`
- `## Checks`, covering C0-C9 and the FIN-A/FIN-B rule, with verbatim substance from context
- `## Pass criteria`
- `## Verdict mapping`
- `## Real-profile arm`, with the three reasons and the mitigations in your own words
- `## Known limits in advance`, covering string-level not pixel-level observation, one host and
  one launch, FIN-B being an anchored argument rather than a timestamp, and the probe enabling
  Chromium accessibility, which is what a screen reader does and touches no title or navigation
  event

If Smoke found `stderr_channel: unavailable`, state that C6 is pre-registered UNAVAILABLE.

**Step 5 -- Run SelfTest, then Smoke.**
- Run SelfTest into `E` (not the temp dir the verify uses), then Smoke, each with the commands in
  this task's verify.
- An instrument bug may be fixed, and both modes re-run.
- A precondition failure in Smoke (exit 2) means STOP and report. Never kill anything.

**Step 6 -- Commit (the pre-registration commit).**
- Stage exactly: `TD/title-watch.ps1`, `TD/rph-rescore.cjs`, and the evidence files listed in this
  task's `<files>`.
- Run the Task 3 privacy grep over `E` first.
- Commit as `docs(quick-260930-rph): build and self-test the login-window title instrument, pre-register criteria (Task 1)`,
  ending with the session's attribution trailer.
- Do NOT stage PLAN, SUMMARY or STATE.md.

Prettier: every path this task writes is under `.planning/`, which prettier ignores (both script
paths measured `{ "ignored": true, "inferredParser": null }`). A `--check` would be vacuous, so it
is omitted by design, per CLAUDE.md.
  </action>
  <verify>
    <automated>TD=.planning/quick/260930-rph-close-the-login-window-title-todo-live-v; E=$TD/evidence; T=$(mktemp -d); perl -ne '$n++ if /[^\x00-\x7F]/; END { exit($n ? 1 : 0) }' $TD/title-watch.ps1 $TD/rph-rescore.cjs && powershell.exe -NoProfile -ExecutionPolicy Bypass -File $TD/title-watch.ps1 -Mode SelfTest -EvidenceDir "$(cygpath -w "$T")" && grep -qx 'SELFTEST: PASS' "$T/rph-selftest.txt" && grep -qx 'SELFTEST: PASS' $E/rph-selftest.txt && grep -qx 'SMOKE: PASS' $E/rph-smoke.txt && grep -qx 'main_window_title: GameLib' $E/rph-smoke.txt && MSYS_NO_PATHCONV=1 tasklist /FI "IMAGENAME eq gamelib-shell.exe" /NH | grep -q "No tasks" && MSYS_NO_PATHCONV=1 tasklist /FI "IMAGENAME eq gamelib-sidecar.exe" /NH | grep -q "No tasks" && grep -qx 'sha256_match: yes' $E/rph-build-identity.txt && grep -qx 'ancestor_ae5968b07_of_b48e8948f: yes' $E/rph-build-identity.txt && grep -qx 'ancestor_b48e8948f_of_head: yes' $E/rph-build-identity.txt && grep -qx 'title_path_identical_b48e8948f_vs_head: yes' $E/rph-build-identity.txt && grep -qx '## Pass criteria' $E/rph-prediction.md && grep -q 'FIN-B' $E/rph-prediction.md && grep -q 'VERDICT: ' $TD/title-watch.ps1 && ! grep -rqF 'SELFTEST-DROPPED-MARKER' $E/ "$T" && ! grep -rq $'\r' $E/ && perl -ne '$n++ if /[^\x00-\x7F]/; END { exit($n ? 1 : 0) }' $E/* && [ -n "$(git log -1 --format=%H -- $E/rph-prediction.md)" ] && [ -z "$(git status --porcelain -- $TD/title-watch.ps1 $TD/rph-rescore.cjs $E)" ]; rc=$?; rm -rf "$T"; [ $rc -eq 0 ] && echo TASK1_OK</automated>
  </verify>
  <done>
- The instrument and the re-scorer are pure ASCII.
- SelfTest passes, and it re-passes on a fresh temp dir. The scorer rates the fix shape PASS, the
  bug shape FAIL and the no-title shape INCONCLUSIVE, and the independent node re-score agrees on
  C2-C5 for all three.
- A 60 ms state is captured.
- The stderr whitelist keeps exactly the expected lines and drops the marker.
- Smoke launched the real installed app, saw the `GameLib` main window, recorded whether the
  inherited stderr pipe carries lines, and tore it down to zero processes.
- Build identity is re-confirmed: the hash, both ancestries and the byte-identical title path.
- The prediction and the instrument are committed before any login window has ever been opened.
  No login window has been opened.
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Operator readiness -- quit GameLib, choose a store whose sign-in can open without logging out, then reply so the live run launches</name>
  <action>The operator confirms GameLib is fully quit, and names the store whose Manage Accounts sign-in they will click once the instrument launches the app. Clicking that tile is the one step with no reliable automation: the tile is a plain div with a delegated React handler, so there is no UIA action, and a synthesized click would take over the operator's cursor.</action>
  <instructions>
Claude has built and self-tested the title instrument. It also proved the instrument can launch
and tear down your installed GameLib (Task 1, committed). No GameLib is running now, and no
sign-in window has been opened.

Before you reply:
1. Make sure GameLib is FULLY quit: tray icon, then Quit. The instrument must launch it itself,
   and it will stop without touching anything if it finds GameLib already running.
2. Choose the store. Prefer **Humble Bundle**, if its Manage Accounts tile shows a sign-in button
   rather than "Connected" / "Logout". Humble is the page where the pre-fix bug was seen on this
   machine, which makes it the strongest test.
   - Otherwise pick GOG, Epic or Amazon, whichever is not connected.
   - **Never click "Logout" on any tile.**

Reply `go humble` (or `go gog` / `go epic` / `go amazon`). Reply `none` if every store is connected.

What happens after you reply `go ...`:
- Within about 2 minutes GameLib opens on its own. Do not launch it yourself.
- When it appears, open **Manage Accounts** and click the chosen store's sign-in. For Humble, the
  "Sign in to Humble Bundle" panel opens a separate sign-in window by itself.
- Once the separate sign-in window is on screen, **take your hands off**:
  - do not type anything
  - do not click inside it
  - do not close it
- The instrument closes the sign-in window itself, after its title has stayed unchanged for about
  90 seconds. It then quits GameLib; watching GameLib disappear is the end. The whole thing takes
  roughly 3 to 5 minutes, and nothing needs to be done afterwards.
- If the sign-in window navigates away or closes by itself (for example because a saved session
  signs you straight in), just let it be. The run will be scored INCONCLUSIVE and you will be told.
  </instructions>
  <verification>Task 3 step 1 re-checks, before launching, that no gamelib-shell.exe or gamelib-sidecar.exe is running. The instrument's P1 re-checks it again at launch, and exits 2 without killing anything if either is present.</verification>
  <resume-signal>Reply `go humble`, `go gog`, `go epic` or `go amazon` when GameLib is fully quit and you are ready at the machine, or `none` if no store can open a sign-in window without logging out</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Run Live against the operator's store, re-score independently, tear down in every outcome, then record -- on PASS close the todo to completed/ via a pure rename; on FAIL/INCONCLUSIVE record in pending/ and stop</name>
  <files>.planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-live.txt, .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-timeline.jsonl, .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-shell-lines.txt, .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-loadprobe.jsonl, .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-rescore.txt, .planning/todos/pending/2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md, .planning/todos/completed/2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md</files>
  <precondition>Task 1 is committed with `SELFTEST: PASS` and `SMOKE: PASS`; the operator replied `go <store>` or `none`; no gamelib-shell.exe or gamelib-sidecar.exe is running.</precondition>
  <reversibility rating="reversible">The run changes only the app's runtime state, which is torn down. The one side effect on the real profile is a sign-in the page itself might complete from a saved session. It is surfaced, not caused, by the harness. The todo move is a git rename.</reversibility>
  <read_first>.planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-prediction.md, .planning/quick/260930-rph-close-the-login-window-title-todo-live-v/evidence/rph-smoke.txt, .planning/todos/pending/2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md, .planning/todos/completed/2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md (the qmu Result/Resolution/frontmatter shape to match)</read_first>
  <action>
TD and E are as in Task 1. N is the todo basename
`2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md`.
Act fast: the operator is waiting for GameLib to appear, so run steps 1 and 2 before reading
anything else at length.

**Step 0 -- The reply.**
- `none`: skip steps 1 to 3. Write `E/rph-live.txt` containing `run: not-performed`,
  `reason: operator reports no store can open a sign-in window without logging out`, and
  `VERDICT: INCONCLUSIVE`. Then go to the FAIL/INCONCLUSIVE branch.
- `go <store>`: pass `<store>` as `-Store`.

**Step 1 -- Re-observe.** In bash, run `MSYS_NO_PATHCONV=1 tasklist /FI "IMAGENAME eq <image>" /NH`
for both images. If either is running, STOP and report: the operator must fully quit GameLib, and
the task is then re-run from here. Never kill it.

**Step 2 -- Run Live ONCE, in the FOREGROUND.** Run
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File TD/title-watch.ps1 -Mode Live -Store <store>`
with a Bash tool timeout of 600000 ms. The script's own hard bound is 510 s.

**Step 3 -- Independent post-checks** from bash, through different processes and code paths.
- tasklist must report neither image.
- Run `node TD/rph-rescore.cjs E/rph-timeline.jsonl` and write its output to `E/rph-rescore.txt`.
  Compare each of its `C2:` to `C5:` status words with `rph-live.txt`, then append
  `RESCORE_AGREES: yes` or `RESCORE_AGREES: no`.
- Re-count C9 yourself. Take the bytes of `$HOME/.config/gamelib/gamelib-shell.log` after
  `shell_log_offset_bytes`, using `tail -c +$((OFF+1))`, count the lines containing
  `humble_login_open`, and require the count to equal the instrument's.
- A `RESCORE_AGREES: no` or a count mismatch is an instrument defect: see Triage.

**Recovery.** Use this only on exit 3, a surviving process, or an interrupted run.
1. Run `MSYS_NO_PATHCONV=1 taskkill /IM gamelib-shell.exe /T /F`, then the same for
   gamelib-sidecar.exe. P1 proved at launch that neither was the operator's. The single-instance
   guard hands any later launch to our instance.
2. Re-verify zero.
3. STOP and report. Do not close the todo.

**Triage -- an instrument defect is not a product result.**
- **Exit 2:** a precondition was unmet and nothing was launched. Report it. Never bypass a
  precondition.
- **A thrown PowerShell or C# error unrelated to the product, or a re-score disagreement:**
  1. Fix the instrument.
  2. Re-run SelfTest into a temp dir; it must still PASS.
  3. Rename every prior live evidence file to `-attempt-N`, so no attempt is lost.
  4. Re-run from Task 2. A new operator click is needed.
- **INCONCLUSIVE** (no window, hold short, no title, non-discriminating, cross-check mismatch, or
  the sign-in window closing or navigating by itself): record it. The orchestrator may re-run
  Tasks 2 and 3 once, with the same attempt renaming.
- **A genuine product FAIL** (C2, C4 or C5): do NOT retry it into a pass. Do NOT touch `src/` or
  `src-tauri/`. Record it and report.

**Step 4 -- Privacy grep, then commit the evidence.**
- Run the privacy grep from this task's verify over `E` before committing. If it hits, redact by
  re-deriving the file from the instrument's rules. Never hand-edit a count or a title.
- Commit the live evidence files as `docs(quick-260930-rph): live login-window title run -- VERDICT: <v> (Task 3)`,
  with the attribution trailer.

**PASS branch (`VERDICT: PASS`, `RESCORE_AGREES: yes`).**

1. **Rename commit.** `git mv .planning/todos/pending/N .planning/todos/completed/N` with NO content
   change. Commit it on its own as
   `docs(quick-260930-rph): move the login-window title todo to completed/`, so git records it as
   R100.

2. **Frontmatter.** In the completed copy:
   - Keep `severity: minor`, `platform: windows` and `ready: live-gate` exactly as they are, in
     place.
   - Add `status: RESOLVED` immediately after `ready:`, then `resolved: 2026-09-30`.
   - Change nothing else in the frontmatter.

3. **Result section.** Append `## Result (quick-260930-rph, 2026-09-30)`. Keep it concise, cite
   evidence files, and use a real em dash in this markdown. State:
   - the build: path, sha256, run `36556473399` / `b48e8948f`, a descendant of `ae5968b07`, with
     title-path source byte-identical to HEAD
   - the real-profile arm, in one sentence with its reason
   - the store and origin, the first title, `t_comp` and the composed title, the final title and
     HOLD, and `nav_reset_episodes`
   - C0 (p99 and max gap)
   - C6: the applied lines, and `len` matching the final title's byte length
   - the FIN path used, stated honestly:
     - FIN-A with `t_loaded`, or
     - FIN-B anchored on sitting 4's pre-fix observation of the same page on this machine
     - either way, that no log channel marks Finished in this build
   - C8, and C9 (0 lines, as predicted)
   - that the independent re-score agreed
   - that `38-W03`'s FAIL accepted in sitting 4 (2026-09-26, pre-fix build `5b6201e26`) is
     superseded by this result, and that `38-VERIFICATION.md` is deliberately unedited, because no
     documented reason exists and the item stays in `human_verification_discharged` as the
     historical record

   Close the section with an honest-limits paragraph:
   - one host, one launch, one page
   - the observation is the caption string, not the drawn pixels
   - FIN-B, if used, is an anchored argument rather than a timestamp
   - the probe enabled Chromium accessibility
   - the Linux half is not exercised, though the todo requires Windows OR Linux

4. **Resolution section.** Append `## Resolution`: the runtime half of quick 260927-o3h's fix
   (`ae5968b07`) is confirmed live on Windows by quick 260930-rph, and the source-shape half is
   pinned by `src/backend/__tests__/tauriShellSource.test.ts`.

5. **Citations.** Re-run the citation search over `src/`, `src-tauri/` and `meta/` for
   `todos/pending/2026-09-27-login-window-title-bar`. None exist at planning time.
   - If one has appeared since, change only its `pending` segment to `completed`.
   - Then run `npx prettier --check <that exact path>` (a real check: re-measure with
     `--file-info`, which must report `"ignored": false`).
   - Then run `pnpm exec jest <basename without .test.ts>` and confirm the trailing
     `Ran all test suites matching` line. `jest <path>` does not filter on Windows.
   - Leave the `.planning/` history citations listed in context as written. The `STATE.md` list
     is the orchestrator's.

6. **Content commit.** Commit the completed todo as
   `docs(quick-260930-rph): close the login-window title todo -- composed title survives Finished live on Windows (38-W03 superseded)`,
   with the attribution trailer.

**FAIL/INCONCLUSIVE branch** (including `run: not-performed`).
1. Append `## Result (quick-260930-rph, 2026-09-30) -- FAIL`, or `-- INCONCLUSIVE`, to the PENDING
   copy. Give:
   - the failing or unmet check ids with their observed values
   - the FIN status
   - C8
   - the attempt count
   - for a FAIL, the verbatim final title from the timeline
2. Leave the frontmatter unchanged, do not move the file, and touch nothing under `src/` or
   `src-tauri/`.
3. Commit it as `docs(quick-260930-rph): record login-window title live <FAIL|INCONCLUSIVE> ...`.
4. Report to the orchestrator.

Do NOT stage PLAN, SUMMARY or STATE.md in either branch; the orchestrator commits those.

**Formatter.** Every path this task writes is under `.planning/`, which prettier ignores, so the
check is omitted by design. The only exception is a newly appeared `src/` citation in PASS step 5,
which gets the real check described there.
  </action>
  <verify>
    <automated>TD=.planning/quick/260930-rph-close-the-login-window-title-todo-live-v; E=$TD/evidence; N=2026-09-27-login-window-title-bar-composed-title-survives-finished-needs-a-windows-linux-sitting.md; C=.planning/todos/completed/$N; P=.planning/todos/pending/$N; grep -Eqx 'VERDICT: (PASS|FAIL|INCONCLUSIVE)' $E/rph-live.txt && ! grep -rq $'\r' $E/ && perl -ne '$n++ if /[^\x00-\x7F]/; END { exit($n ? 1 : 0) }' $E/* && MSYS_NO_PATHCONV=1 tasklist /FI "IMAGENAME eq gamelib-shell.exe" /NH | grep -q "No tasks" && MSYS_NO_PATHCONV=1 tasklist /FI "IMAGENAME eq gamelib-sidecar.exe" /NH | grep -q "No tasks" && ! grep -rEl '[0-9]{17}|refresh_?token|access_?token|passw|galaxyUserId|userId|username|_simpleauth|SELFTEST-DROPPED-MARKER' $E/ && { grep -qx 'run: not-performed' $E/rph-live.txt || { test -s $E/rph-timeline.jsonl && grep -qx 'RESCORE_AGREES: yes' $E/rph-rescore.txt; }; } && if grep -qx 'VERDICT: PASS' $E/rph-live.txt; then test -f $C && ! test -e $P && [ -z "$(git ls-files -- $P)" ] && [ -n "$(git ls-files -- $C)" ] && RN=$(git log -M --follow --name-status --format= -- $C) && grep -q '^R100' <<<"$RN" && grep -qx '## Result (quick-260930-rph, 2026-09-30)' $C && grep -qx '## Resolution' $C && FM=$(awk '/^---$/{c++; next} c==1' $C) && grep -qx 'severity: minor' <<<"$FM" && grep -qx 'platform: windows' <<<"$FM" && grep -qx 'ready: live-gate' <<<"$FM" && grep -qx 'status: RESOLVED' <<<"$FM" && grep -q '38-W03' $C && grep -qx 'FINAL_TITLE_COMPOSED: yes' $E/rph-rescore.txt && grep -Eqx 'C5: PASS.*' $E/rph-live.txt && grep -Eqx 'fin_path: (A|B)' $E/rph-live.txt; else test -f $P && ! test -e $C && grep -Eq '^## Result \(quick-260930-rph, 2026-09-30\) -- (FAIL|INCONCLUSIVE)$' $P; fi && [ -z "$(git log --format= --name-only --grep='quick-260930-rph' -- src-tauri)" ] && [ -z "$(grep -rln 'todos/pending/2026-09-27-login-window-title-bar' src src-tauri meta 2>/dev/null)" ] && [ -z "$(git status --porcelain -- .planning/todos $E $TD/title-watch.ps1 $TD/rph-rescore.cjs)" ] && PYTHONUTF8=1 pnpm planning-gates 2>&1 | grep -q '12/12 planning gates passed' && echo TASK3_OK</automated>
  </verify>
  <done>
**Every branch.**
- `rph-live.txt` ends in a VERDICT line.
- Zero gamelib-shell.exe and gamelib-sidecar.exe remain, checked by the instrument and again by
  bash tasklist.
- The evidence is ASCII, LF-only and passes the privacy grep.
- For a performed run, the independent node re-score agrees on C2-C5.
- No `quick-260930-rph` commit touches `src-tauri/`.
- Planning gates are 12/12 under `PYTHONUTF8=1`.

**PASS branch.**
- The todo is at `completed/`, via a separate R100 rename commit plus a content commit.
- It carries `## Result (quick-260930-rph, 2026-09-30)` and `## Resolution`.
- `severity: minor`, `platform: windows` and `ready: live-gate` are intact, with `status: RESOLVED`
  added.
- It records that 38-W03's accepted FAIL is superseded.
- The final login title is the composed form. C5 passes, and FIN path A or B is satisfied.

**FAIL/INCONCLUSIVE branch.**
- The todo stays in `pending/` with a dated `-- FAIL` or `-- INCONCLUSIVE` Result.
- No source file is changed.
- The orchestrator has been told which checks failed or were unmet, and whether a re-run is
  worthwhile.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| installed app (real profile) -> harness stdout/stderr pipes | The shell forwards the sidecar's stderr line-prefixed onto its own, and that stream can carry profile and library data. Anything stored from it can reach a committed file. |
| harness -> running processes | The harness launches and kills processes. A wrong target could kill the operator's GameLib or the executor's own powershell. A missed one orphans a sidecar holding authenticated sessions. |
| harness -> login window | The harness posts WM_CLOSE. The wrong hwnd would close someone else's window. |
| login webview (real cookie jar) -> store | The page may act on a saved session without any typing. |
| instrument -> verdict | A vacuous instrument or scorer could stamp PASS on a defect that was never exercised. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-RPH-01 | Information disclosure | stderr/stdout capture, evidence/ | high | mitigate | Stderr is read from an in-memory pipe and never written raw to disk. Only three anchored `[shell] humble_login_open:` shapes, which carry lengths, are kept. Every other line is counted and dropped, and SelfTest proves the drop with a marker line. Stdout is count-only. There are no screenshots. The shell log contributes counts only. The probe keeps only the busy bit and the document name. A privacy grep runs over evidence/ before every commit, and a pure-ASCII check runs on every evidence file. |
| T-RPH-02 | Repudiation | PASS verdict | high | mitigate | Criteria are committed before any login window opens (the Task 1 commit). The scorer is proven to rate the synthetic bug shape FAIL, the fix shape PASS and the no-title shape INCONCLUSIVE. An independent node re-score, re-implemented from the text, must agree on C2-C5. C0 gates cadence. The C7 FIN rule forbids a PASS where Finished is unevidenced: FIN-A is gated on seeing busy SET, and FIN-B is only valid on the Humble page with the 38-W03 control. FIN-A's ordering check turns a title that arrived after the load into INCONCLUSIVE rather than PASS. |
| T-RPH-03 | Denial of service | gamelib-shell.exe / gamelib-sidecar.exe | high | mitigate | The C# teardown runs in a finally: graceful `taskkill /T`, then `/T /F`, then WaitForExit. The PowerShell layer then sweeps by ExecutablePath under `%LOCALAPPDATA%\GameLib\`. C8 must count zero, bash tasklist re-checks it, and the documented Recovery covers the rest. The app is killed BEFORE the stderr pipe closes, because `eprintln!` panics on a broken pipe. |
| T-RPH-04 | Spoofing | process targeting | medium | mitigate | P1 requires zero GameLib processes, and Task 3 step 1 re-observes that. An operator instance means STOP, never a kill. SelfTest teardown is pid-tree only and never sweeps powershell.exe by image name. |
| T-RPH-05 | Tampering | WM_CLOSE target | low | mitigate | WM_CLOSE is posted only to the identified LOGIN hwnd, after re-checking that `GetWindowThreadProcessId` equals the launched pid immediately before posting. |
| T-RPH-06 | Elevation of privilege | real-profile login webview | low | accept | No credentials are typed and no sign-in is attempted; the operator is told hands-off. If a saved session signs in without typing, that is the product's own behaviour, surfaced as INCONCLUSIVE and reported to the operator, and not caused by the harness. |
| T-RPH-07 | Tampering | measurement perturbation | low | accept | The MSAA probe enables Chromium accessibility, which is what any screen reader does. It touches no title or navigation event, and it is declared in the prediction and the Result limits. |
| T-RPH-SC | Tampering | npm/pip/cargo installs | high | accept | This plan installs nothing. It uses only preinstalled OS tools (`powershell.exe` 5.1, `tasklist`, `taskkill`), .NET Framework assemblies already on the box (WinForms, `Accessibility.dll`), and the repo's existing node. |
</threat_model>

<verification>
- **Task 1:** it leaves a pure-ASCII instrument and re-scorer, with SelfTest PASS: bug scored FAIL,
  fix PASS and no-title INCONCLUSIVE, the re-score agreeing, the transient captured and the marker
  dropped. Smoke PASS shows the real app launched, the main window seen, the stderr channel
  measured, and zero processes left. Build identity is re-confirmed. All of it, including the
  prediction, is committed before any login window opens.
- **Task 2:** the operator has quit GameLib and named a store that can open without a logout.
- **Task 3:** it leaves a VERDICT, with zero GameLib processes and an agreeing independent
  re-score.
  - On PASS, the todo is closed through an R100 rename plus a content commit, with keys intact,
    `status: RESOLVED`, and 38-W03 noted as superseded.
  - On FAIL or INCONCLUSIVE, the todo stays pending with a dated Result.
- Planning gates are 12/12 under `PYTHONUTF8=1`.
- No commit of this task touches `src-tauri/`.
</verification>

<success_criteria>
- The installed CI build's login window, opened from Manage Accounts on this Windows 11 machine:
  - shows the bare origin first
  - then shows `<origin> — <document title>`
  - still shows that composed title 60 s or more later, or 15 s or more after an observed
    load-complete, with no revert to the bare origin
- The claim rests on a 5 ms sampler whose scorer was proven able to see the 38-W03 failure shape,
  on criteria committed before the run, and on an independent re-score.
- The process table is back to zero GameLib processes in every outcome.
- The todo is closed to `completed/` on PASS. On FAIL or INCONCLUSIVE the result is recorded in
  `pending/` and reported, and no code is changed.
</success_criteria>

<output>
Create `.planning/quick/260930-rph-close-the-login-window-title-todo-live-v/260930-rph-SUMMARY.md` when done.
</output>
