---
status: diagnosed
phase: 50
source: [50-01-SUMMARY.md, 50-02-SUMMARY.md, 50-03-SUMMARY.md, 50-04-SUMMARY.md, 50-05-SUMMARY.md, 50-CONTEXT.md, 50-UI-SPEC.md, ROADMAP.md]
started: 2026-10-13T22:00:00Z
updated: 2026-10-14T06:00Z
---

## Current Test

[testing paused — 5 items outstanding: 4 blocked (3, 13, 14, 15) + 1 issue (16); item 18 skipped by its own condition]

## Protocol

This is the blocking macOS live gate for Phase 50 — the native Rust-managed raw `WKWebView`
subview that embeds the Epic Games Store inside GameLib's existing main window. This file is authored per
`Skill("spike-findings-gamelib")`'s `live-gate-contract-authoring.md` reference and the UAT item
shape in `Skill("gamelib-conventions")`.

### Hard ordering constraints

1. **Cold-before-warm, selected by BINARY FLAVOUR — never by a jar clear, and never by a fake
   HOME.** The original draft of this constraint used a disposable `createFakeHomeProfile()`
   profile for Launch 1. **That premise is refuted and must not be used.** WebKit resolves its
   data store from the user account and the binary's own identity, not from `$HOME`, and the Epic
   surface deliberately attaches to the shared persistent
   `WKWebsiteDataStore::defaultDataStore()` (`src-tauri/src/macos_epic_embed.rs:674`; L-3 locked,
   `nonPersistentDataStore` is spike-only and forbidden in production). A fake-HOME run therefore
   reuses the operator's **real** WebKit session — measured 2026-10-08, when a Humble login sheet
   on a throwaway HOME loaded an already-signed-in page and closed itself
   (`fake-home-does-not-isolate-webkit-cookies.md`).

   The lever that does work is **which binary you launch**: the dev binary keys its stores off its
   process name, the packaged app off its bundle id. Measured 2026-10-13, read-only, by counting
   domains in each jar:

   | jar | launched by | `epicgames.com` entries |
   | --- | --- | --- |
   | `~/Library/HTTPStorages/gamelib-shell.binarycookies` | `pnpm tauri:dev*` (dev binary) | 8 — **warm** |
   | `~/Library/HTTPStorages/com.gamelib.shell.binarycookies` | the packaged `.app` | 0 — **genuinely cold** |

   **Re-measured 2026-10-13T08:49:05Z, immediately before Launch 1, after tearing down a leftover
   dev session.** Both premises hold, and the warm count has MOVED:

   | jar | entries | file mtime |
   | --- | --- | --- |
   | `gamelib-shell` (dev) | epic **13**, steam 3 | Oct 13 21:48:24 |
   | `com.gamelib.shell` (packaged) | epic **0**, steam 4 | Oct 11 10:05:20 |

   The dev jar rose 8 → 13 with an mtime equal to the second the dev process was killed: WebKit
   flushes its cookie store on exit, so the five new entries are the tail of a dev-build Epic
   browsing session that happened before this gate's first launch (see the mis-scored-arm note in
   Item 1's result). This does not weaken either premise — the warm arm needs only a non-zero
   count, and the packaged jar's mtime is two days stale, proving it was never touched. It does
   mean **the warm figure to quote for Item 5 is 13, not 8**; Item 5's own criterion is written as
   "must still be non-zero", which is what is actually load-bearing, so its text stands unchanged.

   So Launch 1 runs the **packaged** build and Launches 2–4 the **dev** build, which yields a real
   cold jar and a real warm jar with **no sign-out and no cache eviction anywhere in this gate**.
   Manufacturing coldness by clearing stays prohibited: a cookie-only clear on this machine left a
   stale WebKit HTTP disk-cache entry that was replayed to the next cold attempt and locked the
   operator's Epic account for ~8 hours on 2026-09-28
   (`logging-out-of-epic-is-a-one-way-door-on-a-cold-jar.md`). "Cold" here means a jar that never
   had an Epic session — never one that had it removed.

   **THE COLD JAR IS NOW SPENT — recorded 2026-10-13T09:21Z, after Launch 1.** The packaged
   `com.gamelib.shell` jar went 0 -> 6 (Item 1's anonymous store load) -> **22** (Item 2's
   completed sign-in) and now holds a real Epic session. There is therefore **no cold Epic jar
   left on this machine**, and Item 1 and Item 2 are not re-runnable as written: a re-run would
   silently measure the warm, signed-in path while claiming to measure the cold one. This is a
   one-shot resource that has now been consumed, in the same class as the ONE-SHOT-RESOURCE pair
   the Structural Reachability Review's Test 5 identified for Item 12 — but across sessions rather
   than within one, which is why it is recorded here instead of being left to inference. Restoring
   coldness is **prohibited** by Hard ordering constraint 1 above: clearing is what caused the
   ~8-hour Epic lockout on 2026-09-28. A genuinely cold re-run needs a new WebKit identity (a
   different bundle id or a different macOS user account), not a cleared jar.

   **Named confound.** This splits jar state across two build flavours, so Launch 1 differs from
   Launch 2 in more than its jar. The sharpest difference is CSP: it applies only to bundled HTML
   and there is **no policy at all** under `tauri dev`
   (`tauri-csp-applies-only-to-bundled-html-and-its-style-nonce-nullifies-unsafe-inline.md`). Any
   Launch-1-only failure must be re-checked on the dev build before it is attributed to the cold
   jar, and `grep 'CSP violation' gamelib.log` is the first thing to read when one appears.
2. **Online arms before the timeout-induction arm.** All arms that depend on the Epic store
   actually reaching the network (Launches 1–2) run before Launch 3's offline/timeout arm. The
   timeout is induced via a **host-level block** (an `/etc/hosts` entry routing Epic's store
   host to an unroutable address, reverted immediately after the arm), never by disabling the
   machine's network interface wholesale — a host-level block is scoped and reversible without
   touching WebKit's cookie jar or risking any Epic-side lockout, and it leaves every other arm
   in the same launch unaffected.
3. **Steam runs as the positive control in the same session as the Epic arms.** Item 7 (Steam
   embed) is observed inside Launch 2, immediately alongside the Epic warm-jar arms — not on a
   separate day or a separate launch — so it is a contemporaneous control for the shared
   embedding mechanism (Rust-owned subview attach, compositor paint), ruling out "the whole
   embed subsystem is broken" as an explanation for any Epic-specific failure.

### Environment constraint

**Quit any running `tauri dev` process before Launch 1.** A live `tauri dev` session relaunches
on every commit and has previously consumed a live-gate's as-found profile fixture roughly 20
minutes before a gate was run (`a-running-tauri-dev-consumes-a-live-gate-fixture-on-rebuild.md`).
Confirm via `pgrep -f 'tauri dev'` returns empty before the first launch of this gate, and ask
the operator to quit any IDE-attached dev session first if it is not. This bars a **pre-existing**
dev session owned by another window; it does not bar the gate's own dev launches below, which the
gate starts itself and keeps commit-free for their duration.

### Launch command (pinned — the command selects the jar)

| launch | command | why this one |
| ------ | ------- | ------------ |
| 1 (cold jar) | `pnpm tauri:dev:packaged`, then open the bundled `GameLib.app` | runs `tauri build --debug`; the packaged identity `com.gamelib.shell` is the jar measured at **0** `epicgames.com` entries |
| 2 (warm jar) | `pnpm tauri:dev:keyring` | dev identity `gamelib-shell` holds the **8** warm `epicgames.com` entries, plus the **3** `steampowered.com` entries Item 6's positive control needs |
| 3 (host block) | `pnpm tauri:dev:keyring` | same warm jar as Launch 2, per constraint 2 |
| 4 (quit + relaunch) | `pnpm tauri:dev:keyring` | same warm jar; the restart arm is about last-URL restore, not jar state |

**Launch 1 provenance — added 2026-10-13, before the first launch.** "Open the bundled
`GameLib.app`" is under-specified in a way that has already produced a false FAIL on this repo. Two
artifacts sit beside each other in `src-tauri/target/debug/bundle/`, and
`GameLib.app.tar.gz` in `bundle/macos/` is the **updater** artifact, which `tauri build --debug`
does **not** refresh (measured two days stale beside a minutes-old DMG —
`tauri-dev-packaged-ships-a-stale-sea-sidecar.md`). On 2026-09-09 an equivalent ambiguity led to a
four-day-stale tarball being un-tarred and scored, which would have filed a false FAIL against a
correct fix (`tauri-build-deletes-the-app-after-bundling-the-dmg.md`). So, before scoring any
Launch-1 item, tie provenance **by hash, never by timestamp** — a directory's own mtime moves on a
rebuild while the artifact inside it stays stale:

```
shasum -a 256 src-tauri/target/debug/gamelib-shell \
              src-tauri/target/debug/bundle/macos/GameLib.app/Contents/MacOS/gamelib-shell
```

Both must print the same digest. If they differ, recover the app from the DMG
(`hdiutil attach src-tauri/target/debug/bundle/dmg/*.dmg -nobrowse -quiet -mountpoint "$T/m"`, then
`ditto "$T/m/GameLib.app" "$T/GameLib.app"`, then `hdiutil detach "$T/m" -quiet`) and re-check the
recovered copy's hash. Never un-tar `GameLib.app.tar.gz` for this gate.

A further consequence worth stating because it bounds what Launch 1 can prove: a `--debug`
"packaged" app is **not self-contained**. `use_dev_sidecar()` is `cfg!(debug_assertions)`, so the
bundle spawns `node <repo>/build/main/sidecar.js` out of the working tree at its build-time absolute
path, rather than the bundled `gamelib-sidecar`. Launch 1 is therefore a valid test of the
**packaged WebKit jar identity** — which is the only thing this gate needs it for — and is *not* a
stand-in for a release artifact.

**Never `pnpm tauri:dev` (nor its `tauri:dev:vault` alias) for any arm of this gate.** That script
sets `GAMELIB_DEV_SECRET_VAULT=1`, which swaps the real keyring for a dev vault
(`src/backend/sidecar/devSecretVault.ts`), so Item 6's Steam positive control would read as signed
out for a reason that has nothing to do with the embed — a green-check-proving-nothing arm in the
one place this gate relies on a control. `tauri:dev:keyring` is the only dev variant that reads the
real keyring.

### Capture standard (dual-sink, append-and-archive)

Implemented verbatim per `live-gate-contract-authoring.md` Section 3:

- **One session directory**, created once: `/tmp/gamelib-gate-<ISO8601-UTC>/`.
- **Terminal transcript is appended, never overwritten**: every terminal command for this gate
  runs through `tee -a <session-dir>/terminal.log` — never a bare `tee`, never `>`.
- **Exact per-launch delimiter**, greppable via `grep -n '^=== GATE LAUNCH'`:
  ```
  echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a <session-dir>/terminal.log
  ```
- **`gamelib.log` is archived per launch, before the next launch's first write renames it to
  `.old`** (`src/backend/logger/log_writer.ts:72-74`):
  ```
  cp ~/Library/Logs/GameLib/gamelib.log <session-dir>/gamelib-launch-${N}.log
  ```
  Any pre-existing `.old` file is archived once, on the very first pass, before Launch 1.
- **Every item below records its launch ordinal** (see the per-launch grouping after the
  Structural Reachability Review).
- **Closing inventory**, captured during the run, not reconstructed after: `ls -la
  <session-dir>/` and `wc -l <session-dir>/*`.
- **Single-instance assertion — flavour-aware, BOTH patterns, before EVERY launch.** The two
  flavours appear under different command lines, so one pattern cannot see the other and a
  leftover instance of the wrong flavour would sit on the jar being measured:
  ```
  pgrep -f 'target/debug/gamelib-shell'                  # dev binary (Launches 2-4)
  pgrep -f 'GameLib.app/Contents/MacOS/gamelib-shell'    # packaged bundle (Launch 1)
  ```
  **CORRECTED 2026-10-13, before the first launch.** This file originally spelled the packaged
  pattern `GameLib.app/Contents/MacOS/GameLib`. The bundle's executable is **`gamelib-shell`**, not
  `GameLib` — verified live on this tree in all three bundles present
  (`/Applications/GameLib.app`, `target/debug/bundle/macos`, `target/release/bundle/macos` each
  contain `gamelib-shell` and `gamelib-sidecar`, no `GameLib`). `pgrep -f` is case-sensitive, so the
  original pattern matched nothing and Launch 1's single-instance assertion would have been
  vacuously green in both directions — it could neither have found a leftover packaged instance nor
  confirmed exactly one after launch. This is the exact trap
  `tauri-build-deletes-the-app-after-bundling-the-dmg.md` names: "plans that hard-code
  `Contents/MacOS/GameLib` silently test nothing." The two patterns do not collide: the packaged
  path under `target/debug/bundle/macos/...` contains `target/debug/` but never the literal
  `target/debug/gamelib-shell`.
  **Both** must be empty immediately before each launch; after the window appears, exactly one of
  them returns exactly one PID and the other stays empty. Record the PID once the window appears;
  record it again at teardown. If either count is ever wrong at any check, **abort that launch and
  re-run it** rather than scoring it. A launch absorbed by a cross-session orphan has happened here
  before, and the window on screen was another pid
  (`a-launch-can-be-absorbed-by-a-cross-session-orphan-instance.md`).

  **A THIRD PROCESS CAN BLOCK A DEV LAUNCH, AND NEITHER PATTERN ABOVE SEES IT — added
  2026-10-13 after it bit this gate.** `pnpm tauri:dev:*` starts a `vite` dev server on port
  **5173** as a `beforeDevCommand` child. Killing the `tauri dev` wrapper and the app binary does
  **not** reap it. A leftover `vite` makes the NEXT dev launch die at startup with
  `error when starting dev server: Error: Port 5173 is already in use`, after which
  `beforeDevCommand` terminates non-zero and the whole launch exits — having already printed
  `Running target/debug/gamelib-shell`, so the transcript looks as though the app started. Both
  single-instance patterns are empty in that state, so the assertion above passes while there is
  no app at all. Measured here: pids 76061 (`pnpm exec vite`) and 76074
  (`./node_modules/.bin/vite`, holding `[::1]:5173 LISTEN`) survived the teardown of Launch 2 and
  killed the first attempt at Launch 2b. Add to the pre-launch assertion, for dev launches only:
  ```
  lsof -nP -iTCP:5173            # must print no LISTEN row
  pgrep -f 'bin/vite'            # must be empty
  pgrep -f 'sidecar.js'          # must be empty (orphan sidecar holds an authenticated session)
  ```
  The exit-code reading is also a trap in its own right: the harness reported this failed launch as
  "completed (exit code 0)", because the status came from the `tee` pipeline rather than from
  `pnpm`. Read the transcript tail, not the exit status.

  **A HARNESS-BACKGROUNDED LAUNCH CAN BE OOM-KILLED MID-ARM — added 2026-10-13 after it happened
  to Launch 2b.** `pnpm tauri:dev:*` under an agent's background-task runner is subject to the
  host's memory pressure, and Launch 2b was terminated with "stopped because the system is running
  low on memory" while Item 11 was being set up. Every process went with it — dev binary,
  `tauri dev`, `vite` and the sidecar were all gone in the same instant — so there was no partial
  arm to salvage and nothing to score. Two consequences for whoever runs this gate next:
  - **The transcript's last line is `[killed]`, not an error**, and the arm in flight has no
    evidence either way. Check for it BEFORE reading an absent log literal as a FAIL: an absent
    literal and a killed launch look identical at the grep, and only the transcript tail
    distinguishes them.
  - **Re-assert the single-instance patterns after any kill.** A kill is not a clean quit, so an
    orphan `vite` on 5173 or an orphan `sidecar.js` holding an authenticated session is the
    expected residue (see the preceding note). Measured here all four were in fact dead, but that
    was luck rather than design.
  Salvaged from the killed transcript, recorded because it is real evidence even though its own arm
  was not running: `[shell] macos_epic_embed: didFailNavigation -- The operation couldn't be
  completed. (NSURLErrorDomain error -999.)` confirms **Item 17's emitter, its
  `{caller} -- {description}` format, and its sink all work**, ahead of that arm being formally
  run. `-999` is `NSURLErrorCancelled` — a superseded navigation, not the network failure Item 17
  induces — so it corroborates the SHAPE only, and Item 17 still needs its own run under the
  Launch-3 host block.

### Non-arms (explicit — does NOT ship, per ROADMAP.md)

The following are out of scope for this gate and must not be exercised as if they were arms:
Epic on Windows or Linux; any change to the login seam or `open_pristine_epic_login_window`; the
sign-in hand-off beyond what the Sign in arm (Item 2) itself measures; per-store jar isolation;
and anything behind sign-in beyond the Sign in arm's own boundary (D-07).

---

## Structural Reachability Review

The seven defect-class tests from `live-gate-contract-authoring.md` Section 2 were applied to
this draft before its first run. Findings specific to this gate, not a restatement of the
methodology:

**Test 1 (origin/scheme reachability).** Checked every induction mechanism below (host-level
block, window occlusion, zoom-level change, popup trigger, custom-scheme navigation) against
`storeEmbedOrigins.ts`'s actual gating: Epic's `embeddableOn` is `['darwin']` only (confirmed
live, `storeEmbedOrigins.ts:68`), so every arm below is reachable on this machine without first
needing a second platform. No arm here depends on an origin or scheme this build does not
already recognize.

**Test 2 (concurrency reachability).** The timeout, challenge, and navigation-failure arms
(Items 5, 18, 19) all share one host-level-block induction mechanism within Launch 3. Confirmed
this does not race the single-timeout-monitor-thread-per-surface invariant (T-50-07, `50-02-PLAN.md`):
a host-level block does not spawn a second surface or a second monitor thread — it only starves
the one Epic surface's existing monitor of a response, which is exactly the condition D-07/D-08
are designed to detect.

**Test 3 (log-line emitter reachability, the SINK clause).** Every arm anchored to a log literal
below was checked against the actual emitter in `src-tauri/src/macos_epic_embed.rs` (exact line
and literal text recorded per item) to confirm the specific operator gesture in that arm's
`expected:` actually reaches the `eprintln!` call site that produces it, and that the sink
(`~/Library/Logs/GameLib/gamelib.log`, via `log_writer.ts`) will receive it before this gate's
per-launch archive step runs. This check surfaced that **D-13 (native JS alert/confirm/prompt)
has no log emitter at all** — `present_native_js_alert`/`_confirm`/`_prompt` in `main.rs:4101-4116`
only construct and run an `NSAlert`, with no logging — so Item 15 is marked visual-only evidence
by design, not an oversight.

**TEST 3 WAS WRONG ABOUT THE SINK — CORRECTED 2026-10-13, after Launch 1, before any
literal-anchored arm ran.** The clause above names the sink as
"`~/Library/Logs/GameLib/gamelib.log`, via `log_writer.ts`". That is false, and it would have cost
this gate five false FAILs. Measured on the live Launch-1 process (pid 70842) and confirmed in
source:

| fact | evidence |
| --- | --- |
| the embed's literals are `eprintln!`, i.e. **stderr** | 25 `eprintln!` sites and **0** `shell_diag` calls in `macos_epic_embed.rs` |
| `gamelib.log` is the **Node sidecar's** log, written by `log_writer.ts` | no Rust line can reach it; `grep -c '\[shell\]' gamelib.log` = **0** |
| a **packaged** app's stderr is **discarded entirely** | `main.rs:11935` — "`shell_diag`, not `eprintln!`: LaunchServices discards a bundled app's stderr"; `main.rs:11269` says the same |
| a **dev** run's stderr goes to the **terminal** | the only two files on this machine containing `[shell]` are `gamelib.scrollback.346-04.log` and `.346-12.log` — captured terminal scrollback, not `gamelib.log` |

Consequences, both load-bearing:

1. **The correct grep target for every literal-anchored arm is this gate's own
   `<session-dir>/terminal.log`**, which the Capture standard already appends via `tee -a`. The
   evidence was always being captured; the contract simply pointed at the wrong file. Items 11,
   14, 16, 17 and 18 have been amended accordingly.
2. **On a packaged launch those literals are unobservable at all.** This happens to cost nothing,
   because Launch 1 is the only packaged launch and none of its four items (1–4) is anchored to a
   log literal — they are all visual. Every literal-anchored arm sits in Launches 2–4, which run
   the dev build. Had the launch split been drawn differently, this defect would have made those
   arms unobservable rather than merely mis-addressed.

`macos_epic_embed.rs` using `eprintln!` rather than `shell_diag` is a real observability gap in
the shipped code, not just a documentation error — it is filed separately as a todo and is **not**
scored by this gate, whose arms all run on the dev build where stderr is visible.

**Test 4 (absence-observability).** For items whose pass criterion is an absence rather than a
presence — Item 12 ("issues none when state unchanged", D-04) and Item 18's "not sticky" half
(D-11) — the `expected:` text below states explicitly what proves the absence (a second,
subsequent observation showing normal, un-reloaded or un-challenged rendering) rather than
treating silence or "nothing visibly happened" as sufficient on its own.

**Test 5 (requirement-interaction / PAIR reachability — RESTARTS / TRUNCATES-OVERWRITES / CLEARS
/ RESETS / env-var-changes / one-shot-resource).** Three pair-defects were found and designed
around in this draft, not discovered after the fact:
- **CLEARS pair:** running the cold-jar arm (Item 1) and the warm-jar arm (Item 3) against the
  *same* profile, reset between them, would both destroy the warm arm's premise and risk the
  8-hour lockout. Resolved by using two separate profiles (Hard ordering constraint 1).
- **TRUNCATES-OVERWRITES pair:** `log_writer.ts` renames the previous `gamelib.log` to `.old` on
  the *next* process's first write. If the per-launch archive step ran once at the end of the
  whole gate instead of after each launch, every launch before the last would have its evidence
  silently overwritten. Resolved by archiving immediately after each launch (Capture standard,
  above), before the next launch starts.
- **ONE-SHOT-RESOURCE pair:** Item 12 (D-04, auth-triggered reload) manipulates GameLib's local
  `legendary` credential file to flip the app's *resolved* Epic sign-in state. If run before
  Item 3 (warm jar), it would consume/alter the exact "already signed in" baseline Item 3 needs
  intact. Resolved by ordering Item 12 last within Launch 2, after Item 3 has already been
  observed, and by using an isolated fixture copy of the credential file rather than editing the
  operator's live one in place (see Item 12's own note on this).

**Test 6 (pre-existing external-state reachability — unit of review = the item's PREMISE).**
Item 3's premise ("the shared default WebKit store already holds a signed-in Epic session") is
not assumed from memory — it is checked by the operator immediately before running Launch 2
(e.g., confirming the Epic website is currently signed in via the normal system browser), since
a long enough gap between plan authorship and the live run could let that premise go quietly
false (natural session expiry) without anyone noticing until the arm "fails" for an unrelated
reason.

**Test 7 (UI-level reachability, distinct from backend-logic reachability — unit of review = the
GESTURE SEQUENCE).** Three arms had their induction gesture made concrete rather than left vague:
Item 13 (popup handoff) names that the operator must click a specific externally-opening control
on Epic's page (not just "any link"), Item 16 (blocked launcher scheme) names that the operator
must click Play/Launch on an **owned** game inside the embed specifically (the one path that
issues a `com.epicgames.launcher://` navigation), and Item 15 (native JS dialog) requires the
operator to first identify, on the day of the run, which specific on-page action currently
triggers a native confirm/alert on Epic's live site, since this is driven entirely by Epic's own
page and not by anything in this codebase.

---

## Tests

### Launch 1 — cold jar, packaged build (`com.gamelib.shell`, never had an Epic session)

### 1. Cold jar: Epic store boots and paints (launch 1)

expected: On the packaged build launched via `pnpm tauri:dev:packaged` — whose jar was measured at 0 `epicgames.com` entries on 2026-10-13 — opening Stores → Epic shows the Epic store's own page rendered inside the native subview, not a blank rect and not a one-colour unpainted frame, within the 45s load window (D-01). A Cloudflare/Turnstile challenge instead of the store is a real cold-jar outcome for this arm, not a flake to retry: record it verbatim and carry on to the challenge-fallback arm rather than re-running the launch.
result: pass — 2026-10-13T08:52Z, packaged `--debug` bundle, pid 70842, cold jar. Operator observed the Epic store's own page rendered inside the native subview, well within the 45s window; no challenge, no blank rect, no one-colour frame. Evidence: single-instance assertion clean both before (both patterns empty) and after (exactly one packaged PID, dev empty); provenance tied by hash, `fcf59e2256c42b8368847331e591a3581e703e67ebd2e001f639bc73778d5d7e` identical for `target/debug/gamelib-shell` and the bundle's `Contents/MacOS/gamelib-shell`; loaded sidecar confirmed as child pid 70866 running `build/main/sidecar.js` (mtime 21:48, same build chain) rather than the bundled `gamelib-sidecar`, which is the documented `--debug` behaviour; jar `com.gamelib.shell` at 0 `epicgames.com` entries with a two-day-stale mtime, so the cold premise was real and untouched; `gamelib.log` corroborates with `[WebView] store/wiki route pathname=/store/epic startUrl=https://www.epicgames.com/store/en/` at 21:52:33; `grep -c 'CSP violation'` returned 0, which is meaningful here and only here, because this is the one launch of the gate running bundled HTML under a live policy. **A PRIOR `pass` ON THIS ITEM WAS REJECTED, 2026-10-13, and the rejection is kept deliberately** — an earlier operator `pass` was not scored, because the arm it names was never run. Measured at the moment of that report: zero packaged instances existed (`pgrep -f 'GameLib.app/Contents/MacOS/gamelib-shell'` empty), the only GameLib process was pid 26716 `target/debug/gamelib-shell` — the **dev** binary on the **warm** jar — and it was a child of a leftover Phase 49 `tauri dev` (pid 99626, started 07:58) that the Environment constraint above bars outright. Independently, provenance would have failed: the packaged bundle was then dated Oct 9 20:46 against a dev binary of Oct 13 16:54, and Oct 9 predates every Phase 50 commit, so that bundle did not contain the Epic embed at all — opening it would have produced a false FAIL rather than a pass. Corroborated afterwards by the jar re-measurement above (dev jar 8 → 13 Epic entries, flushed at the kill), which places the observed session on the warm dev build. Recorded because "the operator said pass" and "the arm ran" are different facts, and this gate has now produced one of each for the same item.

### 2. Sign in button reachable and in place (launch 1)

expected: On the same cold packaged jar, Epic's own "Sign in" control is visible and clickable in the embedded page (L-1). Clicking it is observed through to one of three outcomes — a completed sign-in, a Cloudflare/Turnstile challenge, or an HTTP 403 — and the outcome is recorded verbatim; this arm never instructs signing OUT of any account, only exercises the page's own sign-in entry point on a jar that never had an Epic session to begin with. GameLib's own sign-in affordance is unaffected by jar state either way: it is sourced from the local `legendary` credential probe, not a cookie read.
result: pass — 2026-10-13T09:06Z, same Launch-1 process (pid 70842, no relaunch between Items 1 and 2). Operator: "pass, normal login sequence" — i.e. the **completed sign-in** branch of the three permitted outcomes, not a challenge and not a 403. Evidence: the packaged jar's `epicgames.com` entry count rose 6 → **22** with mtime 22:04:38, which is session cookies landing; `grep -c 'flagged as challenged'` over the session transcript returned **0**; no `403` line anywhere in `gamelib.log`; 18 `store/wiki route pathname=/store/epic` lines accumulated across the launch. Worth stating because it is the risk this whole phase was built against: a real Epic sign-in completed inside the Rust-managed raw `WKWebView` on a jar that had never held an Epic session, **unchallenged**. Note the ordering dependency this creates: Item 1 needed the jar cold and Item 2 has now made it signed-in, so the two could not have been run in the other order.

### 3. Subview transparency [ASSUMED] (launch 1)

expected: The native subview's background, observed by eye against the surrounding GameLib chrome while Epic's page is loading and after it paints, behaves per D-06's `[ASSUMED]` call — recorded as either confirmed or refuted, since this assumption has not yet been checked live. **D-06's claim, stated concretely so this arm is observable (added 2026-10-13, before the arm ran — the original text named the decision without stating it, which left the operator nothing specific to look at):** the `WKWebView` is set non-opaque (`drawsBackground` off via `setValue:forKey:`), so in the window BEFORE Epic's first paint the styled `StoreEmbedPlaceholder` shows THROUGH the slot and is what the user sees (UI-SPEC E6), and specifically nothing flashes white — the dark-theme failure mode this decision exists to prevent. The active theme is the `midnightMirage` default (no `theme` key in `config.json`), which is dark, so a white flash would be unmistakable. The state is a TRANSIENT: force a fresh load (switch to another Stores tab and back, or press Reload) and watch the slot DURING the load, not after it.
result: blocked — 2026-10-14T05:46Z, Launch 3. Re-arm attempted under the host block and CONFOUNDED, so still not observed. What the operator saw in the slot was the text "Paused while a window is open" — that is `StoreEmbedPlaceholder`, which is D-19's SUPPRESSION filler shown while `StoreEmbedSuppressionContext` reports the embed suppressed, i.e. the subview was HIDDEN (`storeEmbedHide()`), not attached-and-transparent. D-06 concerns a subview that is PRESENT and VISIBLE but not yet painted, with the placeholder showing THROUGH its transparency; both states look like "the placeholder is there", and only one is under test, so this was deliberately not scored. Suppression is a REFERENCE COUNT acquired by any overlay MOUNTING via `useSuppressStoreEmbed()` (consumers include Dialog, Dropdown, TourContext, HumbleLogin, OAuthLogin), and **what was holding it is unexplained**: the operator confirmed no dialog was open, and a changelog-on-startup guess was wrong (that dialog is modal and was not open). The suppression later released on its own with no action taken, after which the slot showed Epic's cached 404 page — so by the time the subview was visible there was a painted page in it and the unpainted window was gone again. Candidate worth checking, unverified: `TourContext` also acquires suppression, and this repo has a known defect where an introjs tooltip renders nothing while still mounted — an invisible-but-mounted tour step would hold the refcount with no window for the operator to close, which matches the observation exactly.
blocked_by: other
reason: "twice attempted, twice confounded, by two DIFFERENT causes — a sub-millisecond transient on a warm page in Launch 1, and an unexplained suppression that hid the subview entirely in Launch 3. A third attempt should (a) first establish that the embed is NOT suppressed, by confirming the slot does not read 'Paused while a window is open', and (b) hold the unpainted state open with the host block as here. Both halves are needed; Launch 3 supplied only the second. Note the stronger option: D-06 is a one-line property of the native view (`drawsBackground` NO at macos_epic_embed.rs:694-695) and could be asserted directly from the Rust side far more cheaply than by eye — a test reading back `webview.value(forKey: 'drawsBackground')` would settle it permanently and is recommended over a fourth live attempt. Carried forward from this item's earlier, superseded note, because both facts still hold: the pre-paint transient is unobservably short on a warm page, which is why it was re-armed in Launch 3 under the host-level block, holding the attached-but-unpainted state open for the full 45s instead of a few milliseconds. Flavour is immaterial for this arm: `drawsBackground` is set in shared Rust (`macos_epic_embed.rs:694-695`), identically for the dev and packaged builds, so observing it on Launch 3's dev build tests the same code path. This does NOT violate Hard ordering constraint 2 — Item 3 moves INTO the timeout-induction launch rather than pulling induction forward into an online launch."

### 4. Zoom-aware bounds at 120% and 80% (launch 1)

expected: With the webview zoom control set to 120%, the Epic subview's bounds scale to match the measured slot rect with no clipping and no offset gap; repeating at 80% shows the same with no stale bounds left over from the 120% pass (`storeEmbedZoom.ts`, quick 261012-gn8's W8 property, previously PASS on Windows — this is its first macOS/Epic observation).
result: pass — 2026-10-13T09:21Z, Launch 1, pid 70842, packaged `--debug` bundle. Operator set Accessibility -> Zoom to 120%, viewed Stores -> Epic, then repeated at 80%: the subview matched its slot rect at both stops, with no clipping, no offset gap against the surrounding GameLib chrome, and no stale bounds carried over from the 120% pass into the 80% pass. This is `storeEmbedZoom.ts`'s W8 property's FIRST macOS/Epic observation — it had previously passed only on Windows (quick 261012-gn8) — so it is new coverage rather than a regression check. Both stops are exact slider positions (the control is min 60 / max 200 / step 10), so neither reading depended on hitting an approximate value.

### Launch 2 — warm jar, dev build via `pnpm tauri:dev:keyring` (the operator's existing Epic session)

### 5. Warm signed-in jar: Epic store boots and paints (launch 2)

expected: Before this launch, confirm the premise is still true today (Test 6) — and confirm it against the jar this arm actually reads, not the operator's browser: the jar must hold an AUTHENTICATED session, which a domain count CANNOT establish — **this instrument was wrong and was corrected 2026-10-13 after it passed against a jar that was never signed in**. Count session cookies by NAME: `for n in EPIC_BEARER_TOKEN EPIC_SSO EPIC_SSO_RM; do strings ~/Library/HTTPStorages/gamelib-shell.binarycookies | grep -c "^$n$"; done` must be non-zero. The old check (`grep -c epicgames.com`, pinned at 8) returned 13 against a jar holding only `EPIC_SESSION_AP` and `EPIC_DEVICE` — anonymous device cookies — and so declared a signed-out jar warm. Then, on the dev build (shared default `WKWebsiteDataStore`, L-3), opening Stores → Epic shows the store boot and paint using the existing session — no sign-in prompt appears, no action is taken to sign in or out. If that count has fallen to 0, this launch has no warm jar to measure: stop and re-establish the premise rather than scoring the arm.
result: pass — 2026-10-13T09:50Z, Launch 2b, dev pid 79500, re-armed. Operator confirmed the Epic store boots, paints, and shows them SIGNED IN with no sign-in prompt and no click required. **This is a strictly stronger result than the item as written.** The original arm asked only whether a pre-existing session was reused; what was actually measured is that a session written by a PREVIOUS process survived a full application quit and was picked up on a cold start, which is a direct test of the shared persistent `WKWebsiteDataStore` (L-3) rather than of in-process state. Evidence: `EPIC_BEARER_TOKEN`/`EPIC_SSO`/`EPIC_SSO_RM` were all verified present in `~/Library/HTTPStorages/gamelib-shell.binarycookies` AFTER pid 76106 had exited and before pid 79500 started, so the carrier was the on-disk jar and nothing else; the relaunch asserted exactly one dev instance, zero packaged instances, and `GAMELIB_DEV_SECRET_VAULT` absent (real keyring, corroborated live by `[shell] keyring keyring_get account=steam-refresh-token outcome=found`). **HISTORY, kept deliberately — this item first recorded BLOCKED on a false premise:** 2026-10-13T09:27Z, Launch 2, dev pid 76106. **The premise was false, and the contract's own instrument is what hid it.** Operator: "opened, but not signed in". Half the criterion did pass and is worth keeping: the Epic store booted and painted on the dev build. The other half — "using the existing session, no sign-in prompt" — never armed, because there was no session in this jar to use. Measured directly by cookie NAME rather than by domain count: the dev jar holds `EPIC_BEARER_TOKEN`=0, `EPIC_SSO`=0, `EPIC_SSO_RM`=0, with only `EPIC_SESSION_AP`=1 and `EPIC_DEVICE`=1 — anonymous device cookies, not an authenticated session. The packaged jar, by contrast, holds `EPIC_BEARER_TOKEN`=1, `EPIC_SSO`=1, `EPIC_SSO_RM`=1 from Item 2's sign-in. Jars are keyed per binary identity, so that session cannot reach the dev build. The operator's observation is therefore CORRECT BEHAVIOUR, not a defect: nothing was signed in, so nothing could be restored. **REFINED after the re-arm sign-in:** the operator signed in by CLICKING ONLY, with no username or password required, which means Epic re-authenticated from what was already in the jar. So the precise state was a RECOVERABLE IDENTITY (`EPIC_SESSION_AP` + `EPIC_DEVICE`) without an ACTIVE SESSION (`EPIC_BEARER_TOKEN`/`EPIC_SSO`/`EPIC_SSO_RM` all absent) — not the blanker "never had a session" this result first said. Post-sign-in the dev jar holds all three of those plus `EPIC_EG1` and `EPIC_LOGIN_ID`, 21 `epicgames.com` entries, mtime 22:30:34. Recorded because the distinction is the whole reason the original domain-count instrument passed on a signed-out jar: a recoverable identity leaves cookies behind that look exactly like a session to anything counting domains. Also recorded because a FIRST attempt to re-measure this read as unchanged — the terminal output was collapsed as identical to the previous block — and only a re-measure in a different output shape showed the three tokens had in fact appeared.

### 6. Steam embed positive control, same session (launch 2)

expected: Immediately after Item 5, in the same launch, opening Stores → Steam renders the Steam embed normally — confirming the shared embedding mechanism itself (Rust-owned subview attach, compositor paint) is healthy and contemporaneous with the Epic observations in this launch.
result: pass — 2026-10-13T09:52Z, Launch 2b, dev pid 79500, same launch and same session as Item 5. Operator: "navigated to steam it renders normally". The control holds: the shared embedding mechanism (Rust-owned subview attach, compositor paint) is demonstrably healthy CONTEMPORANEOUSLY with this launch's Epic observations, so "the whole embed subsystem is broken" is ruled out as an explanation for any Epic-specific failure recorded later in this gate. Run against real credentials, not the dev vault: `GAMELIB_DEV_SECRET_VAULT` was asserted absent on pid 79500 and the keyring answered `[shell] keyring keyring_get account=steam-refresh-token outcome=found`, with 3 `steampowered.com` entries in the dev jar — which is exactly why the contract bars `pnpm tauri:dev` for this gate, since under the dev vault Steam would read as signed out for a reason unrelated to the embed and this control would prove nothing.

### 7. Occlusion recovery (launch 2)

expected: With Epic's subview painted and visible, covering the GameLib window fully with another window and then uncovering it again shows the Epic store still boots and paints correctly — no stuck blank frame survives the occlusion (established #8).
result: pass — 2026-10-13T09:53Z, Launch 2b, dev pid 79500. Operator fully occluded the GameLib window with another window and then uncovered it; the Epic subview was still painting correctly afterwards, with no stuck blank frame. Note what this arm does and does not claim: the non-render WHILE occluded is expected, established behaviour (spike 024 found 3/3 apparently stalled arms had fully loaded but gone unpainted purely because the window was occluded, and that an occluder reproduces it on demand) — so the pass condition measured here is the RECOVERY, not the absence of blanking during occlusion.

### 8. Minimize/restore and fullscreen survive (launch 2)

expected: With Epic's subview visible, minimizing then restoring the window, and separately toggling fullscreen on and off, leaves the subview correctly tracking the measured slot rect afterward in both cases — it never outlives its route and never detaches from the window (D-02).
result: pass — 2026-10-13T09:54Z, Launch 2b, dev pid 79500. BOTH halves exercised as separate gestures and both correct: minimize then restore, and separately fullscreen on then off. After each the Epic subview still tracked its measured slot rect — correctly sized and positioned, never detached from the window, never left painting where the slot no longer was (D-02). The two halves were called out explicitly to the operator rather than collapsed into one instruction, because a previous live gate on this repo nearly signed off a window-state criterion having omitted the minimize/restore half, which was the half that had already failed — fullscreen passing is not evidence about minimize.

### 9. Back/forward/URL parity with the GOG embed (launch 2)

expected: Navigating three distinct pages deep inside the Epic embed and observing `StoreEmbedControls`' back/forward enabled/disabled state at each step, then repeating the identical three-page navigation inside the GOG embed, shows the same back/forward state-transition pattern in both — no Epic-specific divergence in the shared delegate-driven native state.
result: pass — 2026-10-13T09:56Z, Launch 2b, dev pid 79500. Operator navigated three distinct pages deep in the Epic embed while watching `StoreEmbedControls`' back/forward enabled state at each step, then performed the same three-step navigation in the GOG embed: the state-transition pattern matched in both, with no Epic-specific divergence. The GOG half is what gives this arm its value — the two surfaces share the same delegate-driven native state, so GOG acts as a same-session reference for what the pattern should be, rather than the arm resting on the tester's expectation of correct back/forward behaviour.

### 10. Epic → Steam → Epic switch (launch 2)

expected: Switching from the Stores → Epic tab to Stores → Steam and back to Stores → Epic shows the Epic subview correctly hidden while Steam is active and correctly shown again on return, with its prior state intact — it is never left visible behind Steam's subview and never torn down early (D-02).
result: pass — 2026-10-13T09:59Z, Launch 2b, dev pid 79500. Switching Epic -> Steam -> Epic behaved correctly on all three counts: Epic's subview was fully hidden while Steam was active (no bleed-through and nothing painting behind Steam's subview — the relevant failure mode here, since native subviews are siblings in one window and a missed hide shows as one store painting over or under the other), it was shown again on return with its prior page state intact rather than reloaded to the store root, and it had not been torn down early. Distinct from Item 9: that measured navigation WITHIN a surface, this measures lifecycle ACROSS surfaces (D-02).

### 11. Popup → system browser handoff (launch 2)

expected: Clicking the specific externally-opening control on Epic's page identified on the day of the run (Test 7 — not "any link"; `createWebViewWithConfiguration` only fires for a real `window.open()` call) is denied a second native in-app surface, the exact literal `[shell] macos_epic_embed: denied window.open request, routing to the system browser (D-12)` appears in this gate's `<session-dir>/terminal.log` (NOT `gamelib.log` — the embed's literals are `eprintln!` to stderr; see the Test 3 sink correction), and the operator's default system browser opens to the target URL. **CORRECTED 2026-10-13, before this arm ran:** the parenthetical above says `createWebViewWithConfiguration` "only fires for a real `window.open()` call", which is too strict and would send the operator hunting for a gesture that may not exist on Epic's current store page. WebKit routes ANY navigation whose `targetFrame` is nil through that delegate method, which includes a plain `target="_blank"` anchor as well as `window.open()`. Either gesture reaches the D-12 path, so an ordinary open-in-new-tab link (e.g. Epic's footer social links) is a valid and far more reachable induction. Also pinned from source so the literal is not mis-grepped: the emitter is `macos_epic_embed.rs:1567`, written with a Rust `\` line continuation, which strips the newline AND the next line's leading whitespace — so it concatenates to exactly the one-line literal quoted here. A grep for the literal as spelled in the SOURCE across two lines will not match; grep the concatenated form. The admission gate is `STORE_EMBED_HANDOFF_MIN_GAP` = **2 seconds**, and `STORE_EMBED_POPUP_THROTTLE` is a single GLOBAL static shared with the other store surfaces — so this arm's click arms the throttle that Item 12 then measures, and the two must be run as a timed pair. **INDUCTION CORRECTED AGAIN 2026-10-14, after a first attempt failed to arm.** The operator could not find a social/external link and reported that "all links seem to be on epic domain", concluding the arm was unreachable. That conclusion is wrong, and the item's wording invited it by saying "externally-opening control": the policy is **DOMAIN-AGNOSTIC**. `store_embed_browser_handoff_policy` (`store_embed_handoff_policy.rs:44-50`) matches on SCHEME only — any `http`/`https` URL with a non-empty host returns `HandToSystemBrowser`, with no host comparison anywhere. An `epicgames.com` link therefore hands off exactly like a third-party one. What the arm actually requires is a navigation with **no target frame**, which is what reaches `createWebViewWithConfiguration`. The most reliable induction, needing no particular link on the page: **Cmd+click any link** (macOS's open-in-new-tab gesture), or right-click a link and choose Open Link in New Window. Both produce a frame-less navigation regardless of destination. Verified not-armed rather than assumed: `grep -c 'denied window.open'` over the Launch-2c transcript returned 0, so no popup was ever attempted and the operator's "no second window appeared" was trivially true.
result: pass — 2026-10-14T04:34Z, Launch 2c, dev pid 7576, on the THIRD induction attempt. Operator widened the window, found the footer's social row ("found them no headings just icons" — which is why two earlier attempts failed to locate it), clicked one icon, and it "imediatly opened in default browser". All three criteria met: no second in-app surface, the default system browser opened to the target, and the literal fired EXACTLY ONCE, byte-identical to the pinned text — `[shell] macos_epic_embed: denied window.open request, routing to the system browser (D-12)` at line 61 of the Launch-2c transcript — with no accompanying `popup hand-off to open_external failed` line. **This arm is also the first empirical confirmation of this file's log-sink correction:** the literal appeared in the session transcript, where the corrected items now point, and could not have appeared in `gamelib.log`, where the original text sent the operator to look. Two reachability facts worth keeping, because two attempts were spent on them: the footer social row is RESPONSIVE and hidden at narrow window widths, and it is unlabelled (bare icons, no "Follow Us" heading), so an operator scanning for text will not find it; separately, Cmd+click on Epic's ordinary in-page links (tried on the EULA link and one other) does NOT reach this delegate — it navigated in place with zero literals emitted, consistent with Epic's store being an SPA whose click handlers preventDefault and route via the history API, swallowing the new-tab gesture. A real `target="_blank"` anchor is required.

### 12. Popup rate-limited, not handed off (launch 2)

expected: Triggering the same popup-opening gesture from Item 11 repeatedly within the shared `STORE_EMBED_POPUP_THROTTLE` window shows the first admitted and handed off as in Item 11, and at least one subsequent attempt within the window denied with the exact literal `[shell] macos_epic_embed: denied window.open request, rate-limited -- not routed to the system browser` — and critically, no second browser window opens for the rate-limited attempt.
result: pass — 2026-10-14T04:48Z, Launch 2c, dev pid 7576. Operator reported the hedged "yes seems to work", which was NOT taken as the result: this arm's failure mode (a second click that never reached the webview, because the system browser steals focus within ~1s of the first) is indistinguishable from success by eye, so it was settled from the transcript instead. Lines 61-70 record ten popup events in strict throttle alternation: 61 and 62 admitted, 63 and 64 refused, then 65/67/69 admitted and 66/68/70 refused — **5 admitted, 5 refused**. That is exactly `STORE_EMBED_HANDOFF_MIN_GAP` = 2s behaving as specified, and the refusal literal is byte-identical to the pinned text: `[shell] macos_epic_embed: denied window.open request, rate-limited -- not routed to the system browser`. The pass condition is the ABSENCE the Structural Reachability Review's Test 4 asks for, and it is measured rather than assumed from silence: 10 gestures produced 5 hand-offs, so 5 browser tabs opened and the 5 refused attempts opened none — had the throttle been inert, all 10 would have been admitted.

### 13. Native JS dialog (launch 2)

expected: Having first identified, on the day of the run, which specific on-page action on Epic's live site currently triggers a native confirm/alert/prompt (Test 7 — this is driven entirely by Epic's own page), performing that action presents a real native `NSAlert` modal to the main window, dismissible by the operator. No log literal exists for this path (D-13's delegate methods have no emitter — Test 3) — evidence here is a screenshot of the modal, by design, not a log line.
result: blocked — 2026-10-14T04:53Z, Launch 2c. Operator: "nothing" — no action found on Epic's live store triggered a native alert/confirm/prompt. Blocked on reachability, NOT a defect: D-13's delegates can only fire if the PAGE calls one of those three functions, and modern commercial sites essentially never do. The contract's own Test 7 already conceded this arm depends entirely on Epic's page rather than on anything in this codebase.
blocked_by: third-party
reason: "requires Epic's own live page to call alert/confirm/prompt, which it does not. Two independent facts make this arm unverifiable here rather than merely unlucky: D-13's `present_native_js_alert`/`_confirm`/`_prompt` have NO log emitter (Structural Reachability Review Test 3), so there is no trace to find even if it did fire; and the raw Epic WKWebView sets no `inspectable` flag anywhere in `macos_epic_embed.rs`, so unlike the main wry webview it cannot be attached to Safari's Develop menu and the dialog cannot be induced from a devtools console. Arming it would need either a page under our control loaded into the Epic surface, or an `inspectable` flag in a debug build — both are code changes, not gate gestures. Recommend covering D-13 by unit/integration test instead, and filing the `inspectable` gap separately."

### 14. Blocked Epic Games Launcher scheme notice (launch 2)

expected: Clicking Play/Launch on a game the operator's Epic account actually owns, inside the embedded store (Test 7 — this is the one path that issues a `com.epicgames.launcher://` navigation), shows the navigation blocked, the exact literal `[shell] macos_epic_embed: blocked a navigation to the Epic Games Launcher scheme ('com.epicgames.launcher') -- D-14` in this gate's `<session-dir>/terminal.log` (NOT `gamelib.log` — the embed's literals are `eprintln!` to stderr; see the Test 3 sink correction), and `EpicLauncherBlockedNotice` rendered with its locked copy ("Install from your Library instead — this view can't open the Epic Games Launcher."), auto-dismissing. At the app's minimum window width the notice row's message and its accent/icon stay fully visible and wrapped, never clipped by the window edge (UI-SPEC E5, as actually shipped: a bounded-width row under `StoreEmbedControls`, not the floating-toast shape UI-SPEC's draft originally described before Plan 03's Option 2A decision superseded it); repeating with the longest of the 49 translations of this string shows the same — the notice grows vertically, never past its max width. **LITERAL CORRECTED 2026-10-14, before this arm ran:** the pinned text carried `('com.epicgames.launcher://')`; the emitter interpolates `EPIC_GAMES_LAUNCHER_SCHEME`, which is `"com.epicgames.launcher"` with **no `://`** (`store_embed_handoff_policy.rs:26`), so the line actually emitted ends `scheme ('com.epicgames.launcher') -- D-14` and a grep for the old pinned form matches nothing. The `{what}` placeholder resolves to `navigation` from the navigation hook (`macos_epic_embed.rs:1341`) and to `window.open request` from the popup hook (`:1586`) — both funnel into the same emitter at `:1714`, so either entry point raises the same notice and this arm must use the Play/Launch navigation path to get `navigation`. **The notice copy as pinned is CORRECT and was verified, not assumed:** `gamelib.json`'s `webview.epicEmbed.launcherBlocked.message` reads "Install from your Library instead — this view can't open the Epic Games Launcher.", including the "the". Recorded because a first pass over compressed grep output appeared to show that word missing from BOTH the literal and the copy, and reading the source directly refuted half of that — only the `://` discrepancy is real.
result: blocked — 2026-10-14T05:04Z, Launch 2c. The gesture the arm names DOES NOT EXIST on Epic's live web store for this machine. Operator, on an owned game's page: "rather than buy button has 'in library' greyed out button" — a DISABLED control, not a Play/Launch affordance, so there is nothing to click that could issue a `com.epicgames.launcher://` navigation. Root cause measured rather than guessed: the Epic Games Launcher is **not installed** (`/Applications/Epic Games Launcher.app` absent) and **no `com.epicgames.launcher` handler is registered** with LaunchServices (`lsregister -dump` has no entry). Epic's web store probes for that protocol handler and only renders a launcher hand-off when it is present; with no handler it renders the inert "In Library" state instead. **This is not a GameLib defect and not a failure of D-14.** The code path is real and was read in source during this gate: the navigation hook at `macos_epic_embed.rs:1341` and the popup hook at `:1586` both call the single emitter at `:1714`. What is missing is the third-party precondition that makes Epic emit the scheme at all. Baseline confirmed clean: `grep -c 'Epic Games Launcher scheme'` over the Launch-2c transcript returned 0 both before and after the attempt, so nothing was blocked because nothing was attempted.
blocked_by: third-party
reason: "Epic's web store emits a com.epicgames.launcher:// navigation only when it detects the launcher's protocol handler, and the Epic Games Launcher is not installed on this machine. Re-arming needs ONE of: (a) install the Epic Games Launcher, which is a heavy and persistent change to the operator's machine for a single arm — note it would NOT invalidate D-14, since the block happens in-embed before any hand-off; (b) induce the popup entry point instead, which needs a devtools console the raw Epic WKWebView does not expose (no `inspectable` flag — same gap that blocked Item 13); or (c) treat D-14 as unit/integration-test territory and drop it from the live gate, which is the cheapest honest option given both entry points share one emitter at macos_epic_embed.rs:1714 and `EpicLauncherBlockedNotice` already has a component test. UNVERIFIED BY THIS GATE and worth carrying forward: the notice's minimum-window-width wrapping (UI-SPEC E5) and its longest-of-49-translations behaviour were never observed, because the notice itself never rendered."

### 15. One reload on return when Epic sign-in state changed (launch 2)

expected: This arm manipulates only GameLib's local `legendary` credential fixture file (a disposable copy, not the operator's live credential), never the Epic account session or the embedded WebView's cookie jar, and is run last in this launch per the Structural Reachability Review's one-shot-resource finding (Test 5) so it cannot consume Item 5's warm-jar premise. Changing the fixture's resolved value between two visits to the Stores tab issues exactly one `storeEmbedReload()` of the Epic subview; a second, subsequent visit with no further change issues none — proving the "issues none when unchanged" half (Test 4, absence-observability) rather than assuming it from silence (D-04). **THE NAMED MECHANISM CANNOT WORK — established 2026-10-14, by reading the code BEFORE touching the operator's credential.** This item, and the Structural Reachability Review's Test 5 ONE-SHOT-RESOURCE finding that ordered the whole of Launch 2 around protecting it, both assume that manipulating the local `legendary` credential file flips the app's RESOLVED Epic sign-in state. It does not. `signInState` is computed in `WebView/index.tsx:343` from `epic.username` held in renderer context, which `GlobalState.tsx:1885` sets from `epicUserInfo.displayName` on login/refresh events; the only file watcher in the backend is `installedJsonWatcher.ts`, for `installed.json`, and **nothing watches `user.json`**. So a mid-session move of that file is invisible to the running app, and after a restart the D-04 baseline is simply re-recorded at load, so no change is detected either way. The arm was NOT run on that basis and no credential was touched. The induction that would actually work is GameLib's own Epic sign-out (Manage Accounts), which updates `epic.username` in context immediately — at the cost of a real logout and re-login. **Second, independent observability problem:** the D-04 reload logs NOTHING on success — `useStoreEmbedHost.ts:698-706` and `:747-755` log only via `logNavCallFailure`, and the Rust `reload()` at `macos_epic_embed.rs:885` emits no line either. So "exactly one reload" versus "none" is a VISUAL judgement, like Item 13, and the "issues none when unchanged" half that Test 4 flagged for absence-observability has no instrument behind it at all.
result: blocked — 2026-10-14T05:25Z, Launch 2c. Not run, by a deliberate cost/benefit decision taken with the operator after the mechanism analysis above. No credential was touched. The only working induction is a real GameLib Epic sign-out, and what it buys is a purely VISUAL observation, because neither half of the criterion has an instrument: the success path logs nothing in the renderer (`logNavCallFailure` only) and nothing in Rust (`macos_epic_embed.rs:885`). Trading a genuine account logout for an eyeball reading of a change-detection rule is a poor exchange, and the "issues none when unchanged" half would have rested on exactly the "nothing visibly happened" inference the Structural Reachability Review's Test 4 exists to forbid.
blocked_by: other
reason: "the credential-fixture mechanism this item specifies cannot flip the resolved sign-in state (see the expected: note — nothing watches user.json), and the one induction that works costs a real Epic logout and re-login. RECOMMENDATION, not a deferral: cover D-04 with a unit test on `recordSignInBaseline` instead. It is a pure function over (storeKey, signInState) with a recorded baseline, so both halves — 'exactly one reload on change' and 'none when unchanged' — are directly and deterministically assertable in a test, which is strictly better evidence than this arm could ever have produced by eye. If a live arm is still wanted, give the D-04 reload a log line first; without one the arm is unmeasurable regardless of how it is induced."

### Launch 3 — host-level block induced, same real profile, reverted immediately after

### 16. Timeout → reload path (launch 3)

expected: With Epic's store host routed to an unroutable address via a scoped `/etc/hosts` entry (reverted immediately after this item), opening Stores → Epic shows no paint within 45s, the exact literal `[shell] macos_epic_embed: load timed out past 45s` in this gate's `<session-dir>/terminal.log` (NOT `gamelib.log` — the embed's literals are `eprintln!` to stderr; see the Test 3 sink correction), and `StoreEmbedTimeoutBanner` rendered with both Reload and Open in browser visible on one row at the app's minimum window width (UI-SPEC E3) — repeating with the longest of the 49 translations of the banner's message shows the same single-row shape, message may ellipsise, actions never clip. Reverting the hosts entry and clicking Reload shows the store recover and paint normally (D-05/D-07/D-08).
result: issue — 2026-10-14T05:46Z, Launch 3, dev pid 12135. **Split result: the backend half PASSED and the UI half FAILED.** Passed: with `www.epicgames.com` and `store.epicgames.com` blackholed to 203.0.113.1 (verified resolving there, while `store.steampowered.com` still resolved normally, so the block was scoped), Epic did not paint, and the exact pinned literal `[shell] macos_epic_embed: load timed out past 45s` appeared **3 times**. Failed: the operator saw **no banner at any point** — asked directly and answered "no banner" — so `StoreEmbedTimeoutBanner` never became visible, and with it the UI-SPEC E3 checks it carries (Reload and Open-in-browser on one row at minimum window width, and the longest-of-49 translations behaviour) are all unobserved. The operator was actively watching the slot throughout the first 45s window for Item 3, so this is not simple inattention. Also unobserved for the same reason: the recovery half (revert the hosts entry, click Reload, store repaints), since there was no banner to click Reload in. Suppression is NOT the explanation and was ruled out in source: `StoreEmbedTimeoutBanner` is a SIBLING of the slot in `WebView/index.tsx:628`, driven only by `embedHost.loadTimedOut`, while `embedSuppressed` gates only `StoreEmbedSlotContents` INSIDE the slot — so a suppressed embed still renders the banner. Nor is it the known stale-invoke-reply class: Rust merges `load_timed_out` onto every nav event via `enqueue_nav_event`/`epic_nav_state_with_flags` AND onto the direct-return path in `navigate_webview_on_main_thread`, so a late reply still carries the flag. The leading hypothesis, NOT established, is that the flag is cleared by a subsequent load before it can be seen: the transcript interleaves 11 `didFailProvisionalNavigation` lines with the 3 timeouts, which means loads kept being re-attempted, and each new load legitimately resets the flag. If those retries are not operator-driven they also contradict D-08's "No silent retry. One timer, one banner." outright. Epic's own cached SPA then rendered its 404 page ("Page not found" with an unresponsive "Back to store" — both strings absent from this codebase, so Epic's, not ours), which would ALSO legitimately clear the banner on main-frame finish per D-07.

### 17. Navigation failure delegate literal (launch 3)

expected: During the same host-level-block window as Item 16, the literal `[shell] macos_epic_embed: {caller} -- {description}` appears in this gate's `<session-dir>/terminal.log` (NOT `gamelib.log` — the embed's literals are `eprintln!` to stderr; see the Test 3 sink correction) with `{caller}` equal to either `didFailNavigation` or `didFailProvisionalNavigation` (whichever the native delegate actually reports for this failure mode) and `{description}` equal to the real `NSError.localizedDescription()` text — recorded verbatim, not paraphrased.
result: pass — 2026-10-14T05:46Z, Launch 3, dev pid 12135, under the host-level block. The literal appeared **11 times** with `{caller}` = `didFailProvisionalNavigation` and `{description}` = the real `NSError.localizedDescription()` text, recorded verbatim: `[shell] macos_epic_embed: didFailProvisionalNavigation -- The operation couldn't be completed. (NSURLErrorDomain error -999.)`. `-999` is `NSURLErrorCancelled`, and the arm accepts whichever of the two callers the delegate actually reports, so `didFailProvisionalNavigation` rather than `didFailNavigation` satisfies it as written. **THE PASS STANDS, BUT ITS STATED CAUSE WAS WRONG — corrected 2026-10-14 during G-50-16's diagnosis.** This result originally read "the timeout monitor cancelled the hung provisional navigation". That is unsupported by the code: `stopLoading` and `.cancel(` appear **zero** times in `macos_epic_embed.rs`, and `spawn_load_timeout_monitor` (:499-555) only reads nav state via `nav_state_json` and enqueues an event — it never issues a cancel. The `-999`s are WebKit's own response to a second `reload()`/`loadRequest` landing on top of an outstanding one, i.e. they were produced by the operator's reload clicks, not by the monitor. The arm's own criterion is unaffected (it required the literal with a real caller and a real `localizedDescription`, which it got), so this is an explanation correction, not a re-score. Recorded because the wrong explanation would have mis-set the baseline for anyone later reading -999 as evidence the timeout path cancels loads — it does not. Corroborating the shape independently: the same literal with the same `-999` description had already been captured in the killed Launch-2b transcript before this arm was formally run.

### 18. Challenge fallback with Try again, not sticky (launch 3, CONDITIONAL)

expected: If a Cloudflare/Turnstile challenge is encountered on Epic's main frame at any point in this gate (most likely during Item 2 or Item 16's induced conditions), the exact literal `[shell] macos_epic_embed: main-frame response flagged as challenged (D-09)` appears in this gate's `<session-dir>/terminal.log` (NOT `gamelib.log` — the embed's literals are `eprintln!` to stderr; see the Test 3 sink correction), `WebviewUnavailablePanel` renders with `reason="epic-challenged"` (heading "Epic Store browsing is temporarily blocked", body "Epic asked for a security check this view can't complete.") and a Try again button. Clicking Try again re-attempts the load; if the challenge has cleared, the panel reverts to normal Epic rendering on the next successful load — proving "not sticky" (Test 4, absence-observability) by a second, subsequent observation rather than assuming it. This item is CONDITIONAL per the ROADMAP's locked "challenge reputation" decision: if no challenge is ever encountered during this gate, record this item as skipped with the reason, not as a failure.
result: skipped — 2026-10-14T05:46Z. CONDITIONAL arm, and its condition never occurred: no Cloudflare/Turnstile challenge was encountered at any point in this gate. `grep -c 'flagged as challenged'` returned **0** across every launch transcript (1, 2, 2b, 2c and 3), and no `WebviewUnavailablePanel` with `reason="epic-challenged"` was ever seen. The item's own text directs that this be recorded as skipped with the reason rather than as a failure, per the ROADMAP's locked "challenge reputation" decision. Worth stating as a positive result in its own right, because it is the risk the phase was built against: across a cold packaged jar, a full sign-in, a restored warm session and a starved-network launch, Epic never once challenged this WKWebView.
reason: "no challenge was ever encountered, so the fallback path had nothing to fall back from. UNVERIFIED and carried forward: the 'epic-challenged' panel copy, its Try again button, and the not-sticky half (Test 4 absence-observability) all remain unobserved by any live gate. Of the three, 'not sticky' is the one a unit test cannot easily cover, since it is about a second successful load clearing a latched reason."

### Launch 4 — full quit and relaunch, same real profile

### 19. Last-URL restore across app restart (launch 4)

expected: With Epic's embed navigated to a specific sub-page (not the store's root), fully quitting GameLib and relaunching it shows the Epic embed restore to that same last URL via the validated restore path on its first load — not the store's root, and with no visible reload loop (D-03).
result: pass — 2026-10-14T06:00Z, Launch 4, dev pid 14798 then 15946 across a full quit. Verified objectively rather than by eye, because the persisted value is readable from disk: before the quit, `last-url-epic` in the main webview's localStorage (`~/Library/WebKit/gamelib-shell/WebsiteData/Default/.../localstorage.sqlite3`, UTF-16 value) read `https://store.epicgames.com/p/risk-of-rain-2`. After a full quit (all of dev binary, `tauri dev`, `vite` and sidecar confirmed gone, port 5173 free) and a cold relaunch, the embed restored to that exact URL: 4 `startUrl=https://store.epicgames.com/p/risk-of-rain-2` lines and **0** `startUrl=https://www.epicgames.com/store/en/` lines, so it never fell back to the store root. The two differ by HOST (`store.` vs `www.`), which makes the pass and fail cases impossible to confuse in the log — chosen deliberately as the discriminator. No visible reload loop, confirmed two ways: the operator observed it settle once, and the launch transcript has 0 `load timed out` and 0 `didFail*` lines.

## Summary

total: 19
passed: 13
issues: 1
pending: 0
skipped: 1
blocked: 4

## Gaps

- gap_id: G-50-16
  truth: "On a load timeout the Epic embed renders StoreEmbedTimeoutBanner, with Reload and Open in browser both visible on one row at the app's minimum window width (D-07, UI-SPEC E3)"
  status: failed
  reason: "User reported: no banner. The backend half passed — the exact literal 'load timed out past 45s' fired 3 times under a scoped host-level block — but StoreEmbedTimeoutBanner never became visible, despite the operator actively watching the slot through the whole first 45s window for Item 3."
  severity: major
  test: 16
  ruled_out:
    - "suppression: StoreEmbedTimeoutBanner is a sibling of the slot (WebView/index.tsx:628) driven only by embedHost.loadTimedOut; embedSuppressed gates only StoreEmbedSlotContents inside the slot, so a suppressed embed still renders the banner"
    - "stale invoke reply clobbering the flag: Rust merges load_timed_out onto every nav event (enqueue_nav_event -> epic_nav_state_with_flags) AND onto the direct-return path in navigate_webview_on_main_thread, so a late reply still carries it"
  leading_hypothesis: "the flag is cleared by a subsequent load before it can be seen. The Launch-3 transcript interleaves 11 didFailProvisionalNavigation lines with the 3 timeouts, so loads were re-attempted repeatedly and each new load legitimately resets loadTimedOut. If those retries are not operator-driven they additionally contradict D-08 ('No silent retry. One timer, one banner.'). Epic's own cached SPA 404 completing a main-frame load would also clear the banner legitimately per D-07, which is a second, independent way the banner could be correct-but-invisible."
  also_unverified_because_of_this:
    - "UI-SPEC E3: Reload and Open in browser on one row at minimum window width"
    - "the longest-of-49-translations single-row shape for the banner message"
    - "the recovery half: revert the host block, click Reload, store repaints (there was no banner to click Reload in)"
  root_cause: "The `load_timed_out` raise is un-latched: FOUR nav-lifecycle hooks in `macos_epic_embed.rs` set `load_timed_out = false` unconditionally, and the renderer's 250 ms drain applies only the LAST event of each batch. Any reset event landing after a raise and drained in the same batch erases the only signal the banner reads, before the renderer ever surfaces `true`. The asymmetry is explicit in the code: `nav_generation` ALREADY guards the opposite direction (`macos_epic_embed.rs:532` discards a stale RAISE whose generation moved), and `blocked_launcher_scheme_count` in the same struct is deliberately a monotonic `u64` to survive exactly this coalescing drain -- the timeout flag got neither protection."
  d08_verdict: "Operator-driven, NOT a silent code retry -- so D-08's 'no silent retry' half is NOT violated. Every `storeEmbedReload()` call site was enumerated: 3 are single-shot D-04 auth-change reloads gated on `recordSignInBaseline` detecting an actual sign-in flip, the 4th is the plain user-click callback. No loop, timer, or on-failure auto-reload exists. D-08's 'one timer, one banner' half IS violated, by the un-latched reset, and that holds regardless of what triggers the subsequent event."
  corrects_item_17: "Item 17's result claims '-999 ... the timeout monitor cancelled the hung provisional navigation'. That is unsupported: `stopLoading` and `.cancel(` appear ZERO times in `macos_epic_embed.rs`, and `spawn_load_timeout_monitor` only reads nav state via `nav_state_json` and enqueues. The -999s are WebKit's own response to a second `reload()`/`loadRequest` landing on an outstanding one. Item 17 still PASSES as written -- it required only the literal with a real caller and description -- but the explanation was wrong and is corrected in its result."
  artifacts:
    - path: "src-tauri/src/macos_epic_embed.rs"
      issue: "FOUR unconditional `load_timed_out = false` resets, none gated on `nav_generation`: :1378 `did_finish_navigation`, :1402 `did_start_provisional_navigation`, :1703 `epic_embed_handle_navigation_failure`, :1793 `epic_embed_handle_content_process_termination`"
    - path: "src/frontend/screens/WebView/useStoreEmbedHost.ts"
      issue: "the GAP-D drain at ~:306-337 applies only `events[events.length - 1]` ('Apply the LAST event only'), with no sticky merge and no ack for an undrained raise"
    - path: "src/frontend/components/UI/StoreEmbedControls/index.tsx"
      issue: "the Reload SvgButton at :107-113 carries no `disabled` prop, unlike back (:95) and forward (:102) -- the proximate trigger in this run, clickable during a hung load"
    - path: "src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx"
      issue: "Property 26 (:1256-1260) pins only that an EMPTY drain tick cannot erase a surfaced flag; no test exercises a non-empty batch whose last event is a legitimate `false` arriving after a `true` raise -- the actual race"
  missing:
    - "Latch the timeout raise so a reset cannot retroactively erase it before the renderer drains it -- reuse the EXISTING `nav_generation` field rather than adding a mechanism; it already guards the stale-raise direction at macos_epic_embed.rs:532"
    - "Or, equivalently, make the renderer drain merge `loadTimedOut` stickily across every event in a batch instead of taking only the last"
    - "A regression test for the uncovered race: a non-empty drain batch ending in a `false` reset, arriving after a `true` raise"
    - "Correct Item 17's -999 explanation in this file (the pass itself stands)"
    - "RESOLVED, not a defect: the toolbar Reload stays enabled during an active or hung load -- clicking through a hang is an accepted operator action the banner must survive. No `disabled` prop is added."
  debug_session: ".planning/debug/epic-timeout-banner-never-visible.md"
  fix_applied: "quick-261014-rso: the renderer's GAP-D drain (useStoreEmbedHost.ts) now merges loadTimedOut stickily across every event in a 250ms batch instead of applying only the last event, so a true raise survives a later false in the same batch -- the observed live sequence. Added the cfg-free EpicEmbedNavLifecycle table plus epic_embed_clears_load_timeout (epic_embed_state.rs), routed through all four load_timed_out=false sites in macos_epic_embed.rs, so a navigation failure no longer clears a raise (the other three lifecycle hooks still do). New jest properties 46 (observed-red before this fix) and 47 (boundary guard: a later all-false batch still clears, D-07). Four new Rust unit tests, one per lifecycle variant. Re-verification is gated on a macOS live-gate re-run of Item 16 -- see .planning/todos/pending/2026-10-14-epic-timeout-banner-fix-needs-a-live-gate-re-run.md."
