---
status: testing
phase: 50
source: [50-01-SUMMARY.md, 50-02-SUMMARY.md, 50-03-SUMMARY.md, 50-04-SUMMARY.md, 50-05-SUMMARY.md, 50-CONTEXT.md, 50-UI-SPEC.md, ROADMAP.md]
started: 2026-10-13T22:00:00Z
updated: 2026-10-13T22:00:00Z
---

## Current Test

number: 1
name: Cold jar: Epic store boots and paints (launch 1)
expected: |
  On the packaged build launched via `pnpm tauri:dev:packaged` — whose jar was re-measured at 0
  `epicgames.com` entries on 2026-10-13 at session start — opening Stores → Epic shows the Epic
  store's own page rendered inside the native subview, not a blank rect and not a one-colour
  unpainted frame, within the 45s load window (D-01). A Cloudflare/Turnstile challenge instead of
  the store is a real cold-jar outcome for this arm, not a flake to retry.
awaiting: user response

## Protocol

This is the blocking macOS live gate for Phase 50 — the native Rust-managed raw `WKWebView`
subview that embeds the Epic Games Store inside GameLib's existing main window. No item below
has been run yet; every `result:` is `pending`. This file is authored per
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

   So Launch 1 runs the **packaged** build and Launches 2–4 the **dev** build, which yields a real
   cold jar and a real warm jar with **no sign-out and no cache eviction anywhere in this gate**.
   Manufacturing coldness by clearing stays prohibited: a cookie-only clear on this machine left a
   stale WebKit HTTP disk-cache entry that was replayed to the next cold attempt and locked the
   operator's Epic account for ~8 hours on 2026-09-28
   (`logging-out-of-epic-is-a-one-way-door-on-a-cold-jar.md`). "Cold" here means a jar that never
   had an Epic session — never one that had it removed.

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
result: pending

### 2. Sign in button reachable and in place (launch 1)
expected: On the same cold packaged jar, Epic's own "Sign in" control is visible and clickable in the embedded page (L-1). Clicking it is observed through to one of three outcomes — a completed sign-in, a Cloudflare/Turnstile challenge, or an HTTP 403 — and the outcome is recorded verbatim; this arm never instructs signing OUT of any account, only exercises the page's own sign-in entry point on a jar that never had an Epic session to begin with. GameLib's own sign-in affordance is unaffected by jar state either way: it is sourced from the local `legendary` credential probe, not a cookie read.
result: pending

### 3. Subview transparency [ASSUMED] (launch 1)
expected: The native subview's background, observed by eye against the surrounding GameLib chrome while Epic's page is loading and after it paints, behaves per D-06's `[ASSUMED]` call — recorded as either confirmed or refuted, since this assumption has not yet been checked live.
result: pending

### 4. Zoom-aware bounds at 120% and 80% (launch 1)
expected: With the webview zoom control set to 120%, the Epic subview's bounds scale to match the measured slot rect with no clipping and no offset gap; repeating at 80% shows the same with no stale bounds left over from the 120% pass (`storeEmbedZoom.ts`, quick 261012-gn8's W8 property, previously PASS on Windows — this is its first macOS/Epic observation).
result: pending

### Launch 2 — warm jar, dev build via `pnpm tauri:dev:keyring` (the operator's existing Epic session)

### 5. Warm signed-in jar: Epic store boots and paints (launch 2)
expected: Before this launch, confirm the premise is still true today (Test 6) — and confirm it against the jar this arm actually reads, not the operator's browser: `strings ~/Library/HTTPStorages/gamelib-shell.binarycookies | grep -c epicgames.com` must still be non-zero (it was 8 on 2026-10-13). Then, on the dev build (shared default `WKWebsiteDataStore`, L-3), opening Stores → Epic shows the store boot and paint using the existing session — no sign-in prompt appears, no action is taken to sign in or out. If that count has fallen to 0, this launch has no warm jar to measure: stop and re-establish the premise rather than scoring the arm.
result: pending

### 6. Steam embed positive control, same session (launch 2)
expected: Immediately after Item 5, in the same launch, opening Stores → Steam renders the Steam embed normally — confirming the shared embedding mechanism itself (Rust-owned subview attach, compositor paint) is healthy and contemporaneous with the Epic observations in this launch.
result: pending

### 7. Occlusion recovery (launch 2)
expected: With Epic's subview painted and visible, covering the GameLib window fully with another window and then uncovering it again shows the Epic store still boots and paints correctly — no stuck blank frame survives the occlusion (established #8).
result: pending

### 8. Minimize/restore and fullscreen survive (launch 2)
expected: With Epic's subview visible, minimizing then restoring the window, and separately toggling fullscreen on and off, leaves the subview correctly tracking the measured slot rect afterward in both cases — it never outlives its route and never detaches from the window (D-02).
result: pending

### 9. Back/forward/URL parity with the GOG embed (launch 2)
expected: Navigating three distinct pages deep inside the Epic embed and observing `StoreEmbedControls`' back/forward enabled/disabled state at each step, then repeating the identical three-page navigation inside the GOG embed, shows the same back/forward state-transition pattern in both — no Epic-specific divergence in the shared delegate-driven native state.
result: pending

### 10. Epic → Steam → Epic switch (launch 2)
expected: Switching from the Stores → Epic tab to Stores → Steam and back to Stores → Epic shows the Epic subview correctly hidden while Steam is active and correctly shown again on return, with its prior state intact — it is never left visible behind Steam's subview and never torn down early (D-02).
result: pending

### 11. Popup → system browser handoff (launch 2)
expected: Clicking the specific externally-opening control on Epic's page identified on the day of the run (Test 7 — not "any link"; `createWebViewWithConfiguration` only fires for a real `window.open()` call) is denied a second native in-app surface, the exact literal `[shell] macos_epic_embed: denied window.open request, routing to the system browser (D-12)` appears in `gamelib.log`, and the operator's default system browser opens to the target URL.
result: pending

### 12. Popup rate-limited, not handed off (launch 2)
expected: Triggering the same popup-opening gesture from Item 11 repeatedly within the shared `STORE_EMBED_POPUP_THROTTLE` window shows the first admitted and handed off as in Item 11, and at least one subsequent attempt within the window denied with the exact literal `[shell] macos_epic_embed: denied window.open request, rate-limited -- not routed to the system browser` — and critically, no second browser window opens for the rate-limited attempt.
result: pending

### 13. Native JS dialog (launch 2)
expected: Having first identified, on the day of the run, which specific on-page action on Epic's live site currently triggers a native confirm/alert/prompt (Test 7 — this is driven entirely by Epic's own page), performing that action presents a real native `NSAlert` modal to the main window, dismissible by the operator. No log literal exists for this path (D-13's delegate methods have no emitter — Test 3) — evidence here is a screenshot of the modal, by design, not a log line.
result: pending

### 14. Blocked Epic Games Launcher scheme notice (launch 2)
expected: Clicking Play/Launch on a game the operator's Epic account actually owns, inside the embedded store (Test 7 — this is the one path that issues a `com.epicgames.launcher://` navigation), shows the navigation blocked, the exact literal `[shell] macos_epic_embed: blocked a navigation to the Epic Games Launcher scheme ('com.epicgames.launcher://') -- D-14` in `gamelib.log`, and `EpicLauncherBlockedNotice` rendered with its locked copy ("Install from your Library instead — this view can't open the Epic Games Launcher."), auto-dismissing. At the app's minimum window width the notice row's message and its accent/icon stay fully visible and wrapped, never clipped by the window edge (UI-SPEC E5, as actually shipped: a bounded-width row under `StoreEmbedControls`, not the floating-toast shape UI-SPEC's draft originally described before Plan 03's Option 2A decision superseded it); repeating with the longest of the 49 translations of this string shows the same — the notice grows vertically, never past its max width.
result: pending

### 15. One reload on return when Epic sign-in state changed (launch 2)
expected: This arm manipulates only GameLib's local `legendary` credential fixture file (a disposable copy, not the operator's live credential), never the Epic account session or the embedded WebView's cookie jar, and is run last in this launch per the Structural Reachability Review's one-shot-resource finding (Test 5) so it cannot consume Item 5's warm-jar premise. Changing the fixture's resolved value between two visits to the Stores tab issues exactly one `storeEmbedReload()` of the Epic subview; a second, subsequent visit with no further change issues none — proving the "issues none when unchanged" half (Test 4, absence-observability) rather than assuming it from silence (D-04).
result: pending

### Launch 3 — host-level block induced, same real profile, reverted immediately after

### 16. Timeout → reload path (launch 3)
expected: With Epic's store host routed to an unroutable address via a scoped `/etc/hosts` entry (reverted immediately after this item), opening Stores → Epic shows no paint within 45s, the exact literal `[shell] macos_epic_embed: load timed out past 45s` in `gamelib.log`, and `StoreEmbedTimeoutBanner` rendered with both Reload and Open in browser visible on one row at the app's minimum window width (UI-SPEC E3) — repeating with the longest of the 49 translations of the banner's message shows the same single-row shape, message may ellipsise, actions never clip. Reverting the hosts entry and clicking Reload shows the store recover and paint normally (D-05/D-07/D-08).
result: pending

### 17. Navigation failure delegate literal (launch 3)
expected: During the same host-level-block window as Item 16, the literal `[shell] macos_epic_embed: {caller} -- {description}` appears in `gamelib.log` with `{caller}` equal to either `didFailNavigation` or `didFailProvisionalNavigation` (whichever the native delegate actually reports for this failure mode) and `{description}` equal to the real `NSError.localizedDescription()` text — recorded verbatim, not paraphrased.
result: pending

### 18. Challenge fallback with Try again, not sticky (launch 3, CONDITIONAL)
expected: If a Cloudflare/Turnstile challenge is encountered on Epic's main frame at any point in this gate (most likely during Item 2 or Item 16's induced conditions), the exact literal `[shell] macos_epic_embed: main-frame response flagged as challenged (D-09)` appears in `gamelib.log`, `WebviewUnavailablePanel` renders with `reason="epic-challenged"` (heading "Epic Store browsing is temporarily blocked", body "Epic asked for a security check this view can't complete.") and a Try again button. Clicking Try again re-attempts the load; if the challenge has cleared, the panel reverts to normal Epic rendering on the next successful load — proving "not sticky" (Test 4, absence-observability) by a second, subsequent observation rather than assuming it. This item is CONDITIONAL per the ROADMAP's locked "challenge reputation" decision: if no challenge is ever encountered during this gate, record this item as skipped with the reason, not as a failure.
result: pending

### Launch 4 — full quit and relaunch, same real profile

### 19. Last-URL restore across app restart (launch 4)
expected: With Epic's embed navigated to a specific sub-page (not the store's root), fully quitting GameLib and relaunching it shows the Epic embed restore to that same last URL via the validated restore path on its first load — not the store's root, and with no visible reload loop (D-03).
result: pending

## Summary

total: 19
passed: 0
issues: 0
pending: 19
skipped: 0
blocked: 0

## Gaps

[none yet]
