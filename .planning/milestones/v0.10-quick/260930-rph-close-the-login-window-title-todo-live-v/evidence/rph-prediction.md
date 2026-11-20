# Login-window title live-verification: pre-registered prediction (quick-260930-rph)

Committed BEFORE any login window has been opened by this instrument. Task 3 (a later,
separate task) runs Live against an operator-chosen store; this file fixes in advance what
counts as PASS, FAIL and INCONCLUSIVE, so Task 3 cannot retroactively rationalize a result.

## Source facts

Quoted from `src-tauri/src/main.rs`, re-read at execution time by symbol (a rebase moved line
numbers by ~108 lines during planning; anchors below are textual, not positional):

- `login_window_title(origin, document_title)` returns `format!("{origin} \u2014 {title}")`
  when the document title is `Some` and non-empty, and otherwise the origin alone. The
  separator is space, U+2014 EM DASH, space.
- In the `"humble_login_open"` match arm: `origin` is
  `url.origin().ascii_serialization()` of the validated https URL. Off macOS,
  `let initial_visible = visible;`, so the window presents directly with no sheet.
- Inside `if visible {`:
  - `builder = builder.title(login_window_title(&origin, None));` seeds a provisional,
    origin-only title so the window never shows the framework default.
  - `.on_document_title_changed(...)`: an empty title is a no-op, logged as
    `title change SKIPPED len=0 (empty document title; previous title retained)`. A
    non-empty title composes `login_window_title(&origin_now, Some(&title))`, calls
    `window.set_title`, and logs `title change applied len=<N>` (byte length only, never the
    string itself).
  - `.on_page_load(...)` maps `PageLoadEvent::Started => ("started", true)` and
    `Finished => ("finished", false)`, pushing a silent navigation event via
    `push_login_window_event`. Under `if visible`, ONLY `if is_started { set_title(origin,
    None) }` runs -- this is quick 260927-o3h's guard (`ae5968b07`). Before that fix,
    `Finished` also reset the title to the bare origin; that reset is the 38-W03 signature
    this run tests for.
  - After `.build()`, under `if visible`: `presentation requested visible=true width=900
    height=700 center=true focus_once=true persistent_pin=false light_theme_requested=true
    sheet_presented=<bool>` is logged (`sheet_presented=false` off macOS), then the title is
    seeded again via `set_title(login_window_title(&origin, None))`.
- The title-selecting lines are byte-identical between `b48e8948f` (the installed build's
  commit) and `HEAD`, confirmed by `evidence/rph-build-identity.txt`.
- wry `0.55.1` (pinned identically in both commits' `Cargo.lock`) maps WebView2's
  `add_ContentLoading` to `PageLoadEvent::Started`, `add_NavigationCompleted` to
  `PageLoadEvent::Finished`, and `add_DocumentTitleChanged` to the title-changed hook (reads
  `webview.DocumentTitle`). `NavigationCompleted` fires once the document has fully loaded or
  loading has stopped.

## Observability

`Finished` has NO direct observable channel in this shipped, release-mode build:

- Every line in the login arm is `eprintln!`; the arm never calls `shell_diag`.
- The release build is `windows_subsystem = "windows"`, so stderr goes nowhere unless the
  parent process hands the child an inherited pipe handle -- which is exactly what this
  instrument's launcher does (`RedirectStandardError`).
- `on_page_load` pushes its Started/Finished events silently (no log line for either).
  Humble's own `checkCookie` consumes the `'finished'` event silently too.
- So the only in-process evidence this instrument can see for `Finished` having happened is
  indirect: the MSAA load probe's busy-to-clear transition on the login window's
  `Chrome_RenderWidgetHostHWND` (FIN-A), or, failing that, an anchored hold-duration argument
  on the one page (Humble) where the pre-fix behavior was directly observed on this machine
  (FIN-B). This is a stated limit, not a hidden one -- see "Known limits in advance" below.
- Smoke confirmed the stderr channel is real: `stderr_channel: available` (18 total lines
  during a run that opens no login window, 0 kept -- the login arm's lines simply never fire
  when no login window opens, exactly as predicted).
- Smoke also confirmed the MSAA load probe plumbing works end-to-end against the real
  installed app's own `Chrome_RenderWidgetHostHWND` (`probe_plumbing: ok`, `probe_found: yes`,
  a real `accName` of length 20 read back). FIN-A is therefore NOT pre-registered
  UNAVAILABLE for Live.

## Expected sequence (Humble)

1. The login window's first title is the bare origin: `https://www.humblebundle.com`.
2. It then becomes `https://www.humblebundle.com` + EM + `Humble Bundle - Log In` (22 bytes
   of document title, matching 38-W03's own `len=22` observation on this same machine, same
   page, pre-fix). An interim WebView2 URL-shaped default title may appear first.
3. The final title, held until the harness posts `WM_CLOSE`, is the composed form -- for
   roughly 90 seconds (`QuiescenceMs` 90000 + `TailMs` 5000), not the bare origin 38-W03 saw.
4. The last whitelisted `title change applied len=<N>` line's `N` equals 22, and C9 (the
   shell log, read after the pre-launch byte offset) finds 0 lines containing
   `humble_login_open`, because the release build's `eprintln!` never reaches that log file
   at all (it is a stderr-only channel this instrument alone reads, via its inherited pipe).

## Checks

Terms: `O` is an origin matching `^https://[A-Za-z0-9.-]+(:[0-9]+)?$`. `EM` is the 3
characters space, U+2014, space. A composed title is `O + EM + X`, `X` non-empty.

Identification: MAIN is the first non-helper top-level window of the launched pid ever
observed visible (helper windows -- tao's internal event-dispatch window, IME/TSF windows --
are excluded from identification, though still recorded in the timeline; this was added
after Smoke's own MAIN identification raced against `Tao Thread Event Target` reporting
visible within single-digit milliseconds of the real Tauri window). LOGIN is a top-level
window of the same pid, other than MAIN, first observed visible with a title matching `O` or
`O + EM + X`. `t_open`/`t_comp`/`t_last`/`t_close`/`HOLD` are as defined in the plan.

- **C0 cadence:** sampler-loop p99 gap <= 50 ms over the whole run, and max gap within
  `[t_open - 1s, t_open + 15s]` <= 250 ms. Otherwise INCONCLUSIVE (instrument).
- **C1 window:** exactly one LOGIN candidate. 0 -> INCONCLUSIVE(no-window); >1 ->
  INCONCLUSIVE(multiple).
- **C2 shape:** every scored LOGIN title is `O` or `O + EM + X`; anything else (empty,
  `GameLib`, a framework default, text before the origin) is FAIL -- the anti-phishing shape
  WR-07/T-34.5-G6-23 exists to prevent. For `-Store humble` the first `O` must equal
  `https://www.humblebundle.com`; a mismatch is `origin_mismatch` (not itself a FAIL) and
  disables FIN-B.
- **C3 composed:** at least one composed LOGIN sample exists. None -> INCONCLUSIVE
  (no-document-title): the page never set a title, or the hook never fired, so the revert
  this todo is about is untestable on this run.
- **C4 no revert episode:** after `t_comp`, every maximal run of bare-origin samples lasts
  under 2000 ms and is followed by a composed sample; the closing boundary for a run still
  open at end-of-observation is `t_close` (the vanish time), never the timestamp of the last
  recorded title-change EVENT -- a title that never changes again after reverting produces no
  further sampler events until vanish, so using the last event's own timestamp would silently
  truncate an in-progress bare run to zero duration (a bug caught and fixed live during this
  task, in both the PowerShell scorer and the independent node re-scorer, via the SelfTest
  `bug` shape). A bare run >= 2000 ms after `t_comp` is FAIL; shorter runs are
  `nav_reset_episodes` (consistent with a `Started` reset for a new navigation, which the fix
  deliberately keeps).
- **C5 final:** LOGIN's last title before `t_close` is composed; a bare `O` is FAIL -- exactly
  the 38-W03 signature. Only meaningful once C3 holds (`t_comp` achieved): without ever having
  reached a composed title there is nothing to have reverted FROM, so a page whose document
  title never arrives scores C5 INCONCLUSIVE rather than FAIL (proven live by the SelfTest
  `notitle` shape, which scores VERDICT INCONCLUSIVE rather than FAIL).
- **C6 in-process cross-check:** APPLIED is the set of whitelisted `title change applied
  len=N` lines. If the stderr channel delivered zero lines of any kind, C6 is UNAVAILABLE (not
  pre-registered here: Smoke measured the channel available). Otherwise requires >=1 APPLIED
  line, the last APPLIED `N` equal to the UTF-8 byte length of the final title's `X`, and
  exactly one `presentation requested ... sheet_presented=<bool>` line; a mismatch is
  INCONCLUSIVE(cross-check).
- **C7 Finished evidence (FIN):**
  - **FIN-A (load probe):** available iff the MSAA probe saw `STATE_SYSTEM_BUSY` (0x800) set
    on LOGIN's `Chrome_RenderWidgetHostHWND` in at least one sample and later clear;
    `t_loaded` is the last set-to-clear transition. Requires `t_loaded >= t_comp - 250 ms`
    (otherwise INCONCLUSIVE(non-discriminating): the title arrived after the load, so
    pre-fix code would also have ended composed) and the final composed title held
    continuously from `max(t_loaded, t_last)` to `t_close`, with `t_close - t_loaded >= 15000
    ms`. Busy still set at the last pre-close sample gives INCONCLUSIVE(load-not-complete).
    The busy-clear-to-load-complete mapping is [ASSUMED], validated only by requiring busy to
    have been seen SET at least once. FIN-A is available for this run (Smoke proved the probe
    plumbing works against the real app), so it is the primary path even for Humble.
  - **FIN-B (control anchor):** only reachable when FIN-A is unavailable, AND LOGIN's final
    `O` equals the CONTROLLED origin (`https://www.humblebundle.com` for `-Store humble`,
    none for any other store), AND `HOLD >= 60000 ms`.
  - C7 holds iff FIN-A holds, or FIN-A is unavailable and FIN-B holds. A non-Humble store
    needs FIN-A (FIN-B has no controlled origin to anchor to).
- **C8 teardown:** zero `gamelib-shell.exe` and `gamelib-sidecar.exe` after teardown. A
  violation is exit 3, the loudest outcome.
- **C9 informational:** the shell log read after the pre-launch byte offset -- new-line count,
  count matching `pid=<launched pid> `, and count containing `humble_login_open` (predicted:
  0, since the release build's `eprintln!` never reaches this file). No message text is ever
  recorded.

## Pass criteria

On Humble: the login window's first title is `https://www.humblebundle.com`; it becomes
composed with the arriving document title; the final title (held to the harness's own
`WM_CLOSE`) is still composed; C0, C1, C3, C6 (if available) and C7 all hold; C2, C4 and C5
never fail; C8 counts zero processes.

## Verdict mapping

1. FAIL if C2, C4 or C5 fails (a persistent terminal state does not depend on cadence).
2. Otherwise INCONCLUSIVE if C1, C3, C0, C6 (mismatch) or C7 is unmet.
3. Otherwise PASS.

Exit codes for Live: 0 PASS, 1 FAIL, 2 precondition unmet (nothing launched), 3 C8 violated
after teardown, 4 INCONCLUSIVE.

## Real-profile arm

The live run uses the INSTALLED app on the operator's REAL profile (inherited `HOME` /
`USERPROFILE`, no env block edits). Declared, not an oversight:

1. Quick 260930-o75 measured that on Windows the Tauri shell resolves its own folders through
   the OS known-folder API regardless of the eight fake-HOME variables -- including the
   WebView2 cookie jar the login window itself uses. A fake HOME would isolate the sidecar's
   own store data but NOT the login webview's cookie jar, producing a split-brain profile
   (sidecar believes every store disconnected while the login page sees the real session) --
   the appearance of isolation over exactly the one thing that is not isolated.
2. The title path under test has no environment dependency at all, so faking HOME buys
   nothing for the thing this run actually verifies.
3. The todo names the real app's own Manage Accounts route as the thing to verify.

Mitigations: no credentials are typed and no sign-in is attempted; the harness (not the
operator) closes the login window; stderr is read in memory and only the three whitelisted
`[shell] humble_login_open:` line shapes (carrying lengths, hwnds implicitly, and booleans,
never page content) are ever written to disk; stdout is count-only; there are no
screenshots; the shell log contributes counts only, never message text; the load probe
records only a busy bit and an accessible-name LENGTH, never the name string itself; a
privacy grep runs over `evidence/` before every commit.

## Known limits in advance

- The observation is the window's caption STRING, not the drawn pixels -- a Win32
  `GetWindowTextW` read, not a screenshot or OCR of what a human eye would actually see
  rendered.
- One host (this Windows 11 machine), one launch, one page (Humble, unless the operator
  names a different store). The Linux half of "Windows or Linux" in the todo's own title is
  not exercised by this run.
- FIN-B, when it is the path actually used, is an anchored argument (a control comparison
  against 38-W03's own pre-fix observation on this exact page, this exact machine) rather
  than a timestamp derived from the page's own load event -- it does not independently prove
  `Finished` fired, only that if it did, the fix held through it for long enough to
  discriminate from the pre-fix behavior.
- The MSAA load probe works by enabling Chromium's accessibility tree (calling
  `AccessibleObjectFromWindow` on the render widget), which is exactly what a screen reader
  does. It touches no title-bar API and no navigation event, but it is still an active
  accessibility client attached to the page for the run's duration, and is recorded here as
  a measurement perturbation (accepted, T-RPH-07 in the plan's threat register), not hidden.
