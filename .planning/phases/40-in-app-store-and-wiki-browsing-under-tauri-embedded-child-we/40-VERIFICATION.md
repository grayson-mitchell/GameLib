---
phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
verified: 2026-09-05T10:40:00Z
status: gaps_found
score: 11/14 requirements verified; 2 PARTIAL (REQ-40-06, REQ-40-14); 1 requirement's own gates left RED by the phase (REQ-40-10's i18n-scope pin)
overrides_applied: 0
verified_against_commit: cabc2c7d1
note_on_head: >
  HEAD moved to f200869e1 mid-verification (a concurrent orchestrator commit touching
  .planning/STATE.md only). `git diff --name-only cabc2c7d1..f200869e1` = one file,
  .planning/STATE.md. Zero source files differ, so every measurement below holds at HEAD.
gaps:
  - truth: "`pnpm lint` exits 0 — the Phase 39 ratchet holds"
    status: failed
    reason: >
      4159 warnings against a `--max-warnings 4157` ratchet. This is NOT pre-existing: measured
      with `--no-cache` on a `git archive` of 8ac3a8c12 (the last commit before Phase 40's first),
      the count is 4153 — four UNDER the ratchet, i.e. GREEN. Phase 40 added 20 warnings and
      removed 14, net +6, taking it to 4159. Every file in the before/after delta is a Phase 40
      file. `pnpm lint` runs in `.github/workflows/lint.yml` on every PR to main/stable AND in
      `.husky/pre-push`, so this blocks both push and CI.
    artifacts:
      - path: "src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts"
        issue: "+6 warnings (1 no-unsafe-assignment, 5 no-unsafe-return) — new file, plan 40-04"
      - path: "src/backend/storeManagers/gog/__tests__/logoutCookies.test.ts"
        issue: "+4 warnings (1 no-unsafe-assignment, 3 no-unsafe-return) — new file, plan 40-04"
      - path: "src/backend/storeManagers/gog/user.ts"
        issue: "+2 (9 -> 11): no-unsafe-assignment / no-unsafe-member-access / restrict-template-expressions"
      - path: "src/backend/storeManagers/nile/user.ts"
        issue: "+2 (8 -> 10): same rule family plus one require-await"
      - path: "src/frontend/components/UI/NavShell/__tests__/useSuppressStoreEmbedWhile.test.tsx"
        issue: "+2 react-hooks/rules-of-hooks — new file, plan 40-06"
      - path: "src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx"
        issue: "+2 no-unsafe-assignment"
      - path: "src/frontend/components/UI/NavShell/__tests__/StoreEmbedSuppressionContext.test.tsx"
        issue: "+1 react-hooks/rules-of-hooks"
      - path: "src/backend/storeManagers/gog/__tests__/user.test.ts"
        issue: "+1 (no-floating-promises / no-unsafe-assignment / unbound-method)"
    missing:
      - "Fix at least 2 of the 20 added warnings (or 6 to restore the 4153 headroom the phase inherited) so `pnpm lint` exits 0 at the existing 4157 ratchet"
      - "Do NOT raise the ratchet: Phase 39 REQ-39-01 established it as a monotonic-downward gate, and raising it to absorb Phase 40's own additions inverts that requirement"
  - truth: "`pnpm test:ci` exits 0 — no jest suite is left red by this phase"
    status: failed
    reason: >
      `hardcodedStringGate` FAILS at HEAD with exactly one violation, and that violation is in a
      Phase 40 file. Proven a regression, not a known-red baseline item: a hookless git worktree at
      8ac3a8c12 (`git -c core.hooksPath=/dev/null worktree add --detach`) runs
      `jest genI18nGateScope hardcodedStringGate` GREEN — 2 suites passed, 159 passed / 1 skipped.
      At HEAD the same two suites give 2 failed / 3 failing tests. `test:ci` is
      `jest --runInBand --silent` with no project filter, so the Meta project is in scope and
      `.github/workflows/test.yml` is red.
    artifacts:
      - path: "src/frontend/screens/WebView/index.tsx"
        issue: "line 29, column 49: hardcoded user-facing-shaped literal `last-url-` inside `lastUrlStorageKey` (plan 40-09). Fails `hardcodedStringGate › scope orchestration › scans the whole committed scope and finds zero violations outside the allowlist (D-12: blocking, no advisory grace period)` and the `W4: no collateral` sibling assertion."
    missing:
      - "Either move the `last-url-` prefix out of the gate's scanned argument position, or add it to the gate's allowlist with a written reason (it is a storage-key prefix, not a user-facing string — this is a false positive by intent but a real RED by measurement)"
      - "Re-run `npx jest hardcodedStringGate` and require 133/133 as at the 8ac3a8c12 baseline"
  - truth: "The A-17 i18n fork-scope pin stays consistent with the live tree (REQ-40-10's own dispositioned gate)"
    status: failed
    reason: >
      `genI18nGateScope › staleness guard -- the reverse direction (REQ-34.10-14) › with a real git
      diff against the upstream merge-base › A-17 ANTI-ROT: the committed
      meta/i18nForkTouchedFiles.json equals the LIVE git derivation` FAILS at HEAD with five files
      present in the live derivation and absent from the committed pin. Plan 40-01 correctly
      dispositioned the two DELETED-file pins (210 -> 208) and verified green at that point
      (40-01-SUMMARY.md:123). Plans 40-06/07/08/09 then ADDED five new frontend files carrying
      user-facing strings and nobody re-ran the gate, so the pin is now stale in the opposite
      direction. Same suite is green at 8ac3a8c12.
    artifacts:
      - path: "meta/i18nForkTouchedFiles.json"
        issue: "208 entries; live derivation wants 213. Missing: src/frontend/components/UI/NavShell/StoreEmbedSuppressionContext.tsx, src/frontend/components/UI/StoreEmbedControls/index.tsx, src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx, src/frontend/screens/WebView/storeEmbedOrigins.ts, src/frontend/screens/WebView/useStoreEmbedHost.ts"
      - path: "meta/__tests__/genI18nGateScope.test.ts"
        issue: "count pins hardcoded to 208 (lines 760/761, 787, 810/823, 828/841 and the docstring at :231) — they must move to 213 in the same commit that grows the JSON, exactly as plan 40-01 moved them 210 -> 208"
    missing:
      - "Add the five files to meta/i18nForkTouchedFiles.json (surgical hand-edit with generatedAt frozen, per the 40-01 precedent and the recorded `regenerating-an-artifact-breaks-the-pins-that-guard-it` lesson)"
      - "Update the 208 count pins in meta/__tests__/genI18nGateScope.test.ts to 213"
      - "Re-run `npx jest genI18nGateScope` and require 26 passed / 1 skipped"
  - truth: "The store chrome's back/forward availability and host label reflect the embed's actual current page"
    status: partial
    reason: >
      REQ-40-06's inversion is only half-built. Rust records main-frame history correctly
      (`main.rs:4913-4922`, `on_page_load` + `PageLoadEvent::Finished` -> `StoreEmbedState::push`,
      with seven passing unit tests for the cursor semantics). But NOTHING carries that state back
      to the renderer. The `on_page_load` closure only mutates the Mutex — it emits no event.
      `StoreEmbedSeam.takeNavEvents()` throws a declared-unimplemented Error
      (`storeEmbedFlowRegistration.ts:236-241`), `RUST_STORE_EMBED_TAKE_NAV_EVENTS` has no Rust
      dispatch arm (the nine registered arms at `main.rs:7322-7406` do not include it), and the
      renderer runs no poller. The renderer's `navState` is therefore only ever updated by
      `applyNavResult` from the RETURN VALUE of a back/forward/reload/navigate call the user
      themselves initiated (`useStoreEmbedHost.ts:99-111`).
      USER-VISIBLE CONSEQUENCE: open /store/steam, click a game — Rust's `canGoBack` is now true,
      the renderer's is still `false`, and `StoreEmbedControls` renders
      `disabled={!backAvailable}` (`StoreEmbedControls/index.tsx:82`), so the Back button stays
      greyed out and the user cannot go back. The host label is likewise frozen at the start URL's
      host, which is user-visible on /store/gog where the start URL is the affiliate host
      `af.gog.com` and the landing page is `www.gog.com`. Only pressing Reload resynchronises.
      The live gate did exercise an in-page link click, but Item 2's pass condition is input FEEL,
      not chrome correctness — nobody looked at the Back button. The seam's own doc comment says
      "no future plan has been assigned ownership yet", and there is no todo, no backlog row and
      no Phase 38 ledger entry for it: the item currently exists in code comments only. That is
      the exact three-prose-locations-and-zero-queues shape this phase's own ROADMAP preamble
      exists to prevent.
    artifacts:
      - path: "src-tauri/src/main.rs"
        issue: "line ~4913 `on_page_load` pushes to STORE_EMBED_STATE but emits nothing; no `store_embed_take_nav_events` arm exists in the dispatch table at 7322-7406"
      - path: "src/backend/sidecar/storeEmbedFlowRegistration.ts"
        issue: "takeNavEvents() throws takeNavEventsUnimplementedError(); RUST_STORE_EMBED_TAKE_NAV_EVENTS deliberately left unimported"
      - path: "src/frontend/screens/WebView/useStoreEmbedHost.ts"
        issue: "navState is only written by applyNavResult from user-initiated call return values; no subscription, no poll"
      - path: "src/frontend/components/UI/StoreEmbedControls/index.tsx"
        issue: "back/forward disabled purely from props that never update after an in-embed navigation"
    missing:
      - "Either implement the push: a `store_embed_take_nav_events` Rust arm draining a queue that `on_page_load` writes, plus a renderer poll/drain anchored to a survivor per the 013-015 rule; or an emit-to-renderer channel"
      - "Or, if it is to stay unbuilt, file it as a real queue item (todo or Phase 38/41 ledger row) naming the user-visible symptom above — a declared gap living only in a doc comment is what REQ-40-12's own preamble calls out"
      - "Add a test that fails today: assert canGoBack/host update after a simulated in-embed page load"
  - truth: "Every user-facing string this phase mints gets the project's standard localisation treatment in-phase (REQ-40-14 final clause)"
    status: failed
    reason: >
      Measured by flattening every `public/locales/*/gamelib.json`: 49 locales carry the catalog;
      exactly ONE (en) holds any of the six newly minted keys. de and fr — the two locales the
      project's own D-08 per-phase machine-fill convention targets — hold 0/6. 48 locales still
      hold the two RETIRED keys (`webview.unavailable.heading`, `webview.unavailable.body`) that
      no longer exist in en. `GAMELIB_MT_LOCALES=de,fr pnpm machine-fill-gamelib` failed HTTP 401
      because ANTHROPIC_API_KEY in the execution environment was the literal placeholder
      `sk-ant-...`. That is an honest environment limitation, correctly recorded in
      40-I18N-CENSUS.md and 40-10-SUMMARY.md:143-161 — but it was never routed into a queue. No
      todo, no backlog row, no ledger entry names it.
    artifacts:
      - path: "public/locales/de/gamelib.json"
        issue: "0/6 minted keys; still holds webview.unavailable.heading and webview.unavailable.body"
      - path: "public/locales/fr/gamelib.json"
        issue: "0/6 minted keys; same two stale keys"
    missing:
      - "Re-run `GAMELIB_MT_LOCALES=de,fr pnpm machine-fill-gamelib` with a live ANTHROPIC_API_KEY"
      - "File a todo so the item is queued rather than living only in 40-I18N-CENSUS.md prose"
      - "Optionally prune the two retired keys from the 48 non-English catalogs (the census itself flags this and correctly scopes it out; it needs an owner, not silence)"
deferred:
  - truth: "`Window::add_child` works on the Windows WebView2 backend"
    addressed_in: "Phase 38"
    evidence: "ROADMAP.md Phase 38 ledger item 38-E01, filed by plan 40-10 (D-04); Cargo.toml target-gates `unstable` to cfg(target_os = \"macos\") so no Windows code path exists to test"
  - truth: "`Window::add_child` works on the Linux webkit2gtk backend"
    addressed_in: "Phase 38"
    evidence: "ROADMAP.md Phase 38 ledger item 38-E02"
  - truth: "Retina/HiDPI embed geometry at scale factors other than 2.0, and 2.0 on any other host"
    addressed_in: "Phase 38"
    evidence: "ROADMAP.md Phase 38 ledger item 38-E03, with the explicit return half recorded 2026-09-05 stating 40-11's macOS PASS does NOT close it"
  - truth: "Drag-resize latency on any other hardware/backend"
    addressed_in: "Phase 38"
    evidence: "ROADMAP.md Phase 38 ledger item 38-E04, same non-closure return half"
  - truth: "Whether Epic's Talon guards store browsing inside an embedded child webview the way it guards the login endpoint"
    addressed_in: "Spike 024"
    evidence: ".planning/spikes/MANIFEST.md:267 — spike 024 `epic-store-in-embedded-child-webview`, status PLANNED, runs alongside Phase 40 and blocks nothing"
  - truth: "12 pre-existing clippy errors in src-tauri/src/main.rs"
    addressed_in: "Not this phase"
    evidence: "phase deferred-items.md — confirmed pre-existing via `git diff --stat -- src-tauri/src/main.rs` showing zero changes at the time of the clippy run; `cargo clippy` is not in any CI workflow"
---

# Phase 40: In-app store and wiki browsing under Tauri — embedded child webview — Verification Report

**Phase Goal:** Restore the store and wiki browsing surface that the Tauri rearchitecture left
showing an apology panel — replace `WebviewUnavailablePanel` with a real embedded child webview
(Tauri `Window::add_child`, macOS, `unstable` feature) — and unwind the now-dead Electron
`<webview>` path behind it.

**Verified:** 2026-09-05T10:40:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification
**Verified against:** `cabc2c7d1` (source-identical to `f200869e1`, the concurrent HEAD)

---

## Goal achievement, goal-backward

Working backwards from the outcome rather than from the plan list:

**What must be TRUE for the goal to be achieved?**

1. A macOS user on `/store/{gog,amazon,zoom,steam}`, `/wiki` and an embeddable
   `store-page?store-url=` sees a real, live third-party page inside the app instead of the
   apology panel. — **TRUE.** The whole chain is present and reachable end to end, and the live
   gate rendered the real Steam store inside the window on real hardware
   (`40-LIVE-GATE.md`, Item 1 PASS, pixel-measured).
2. The chrome around it behaves like a browser's. — **PARTIALLY TRUE.** Reload, open-in-browser,
   host display, insecure-scheme treatment and the Rust history model are all correct and
   unit-proven. **Back and forward are not**: nothing carries an in-embed navigation back to the
   renderer, so both buttons stay disabled after the user clicks any in-page link. See GAP-D.
3. Overlay UI is never occluded by the native subview. — **TRUE.** One reference-counted context,
   four mounting-based wirings, and a live human gesture that measured the slot rect identical
   across before/during/after with a 0 px delta.
4. The Electron `<webview>` model is gone — one webview model, not two. — **TRUE.** A
   mutation-proven, runner-discovered predicate gate enforces it and passes with the tree clean.
5. The scope fence (macOS-only, Epic-excluded) is honest to users and owned in a queue. — **TRUE.**
6. The repo is left in a shippable state — its own gates green. — **FALSE.** Phase 40 leaves
   `pnpm lint`, `pnpm test:ci` and therefore `.husky/pre-push` RED, all three independently
   proven to be regressions introduced by this phase, none of them recorded in any SUMMARY or in
   `deferred-items.md`.

**Verdict: the phase's user-facing goal is substantially delivered, but the phase does not close.**
The embed is real, reachable, threat-modelled and human-verified. Three CI-blocking regressions
and one unqueued functional hole in the chrome stand between this and `passed`.

---

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Store/wiki routes render a live embedded child webview on macOS | ✓ VERIFIED | `WebView/index.tsx:474-494` returns the chrome + slot; `useStoreEmbedHost.ts:159-172` opens via `window.api.storeEmbedOpen`; preload `storeEmbed.ts:7` -> `handlers.ts:227 registerStoreEmbedFlows()` -> `requestRustInvoke(RUST_STORE_EMBED_OPEN)` -> `main.rs:7322 "store_embed_open"` -> `window.add_child(builder, LogicalPosition, LogicalSize)` at `main.rs:4983`. Live-proven: `40-LIVE-GATE.md` Item 1. |
| 2 | The wire shape actually crosses the TS→Rust boundary | ✓ VERIFIED | The live gate's `store_embed_open:bad-args` defect is fixed AND double-end pinned: `meta/fixtures/store-embed-wire-args.json` is asserted by `storeEmbedWireContract.test.ts` (TS) and by `include_str!` in `main.rs:9244` (Rust). Four Rust tests incl. `store_embed_wire_contract_rejects_the_positional_shape_that_shipped` — all pass. |
| 3 | Renderer is the sole geometry owner | ✓ VERIFIED | Exactly one renderer `setBounds` call site (`useStoreEmbedHost.ts:168`), fed only by `slot.getBoundingClientRect()`; exactly one Rust bounds writer (`main.rs:5038-5041`); preload courier throws on non-finite (`preload/api/storeEmbed.ts:24-36`); no fallback rect anywhere. |
| 4 | Overlays suppress the embed by mounting | ✓ VERIFIED | `StoreEmbedSuppressionContext.tsx` (ref-counted reducer, clamped at 0, both misuse modes warn); provider at `App.tsx:138`; four consumers: `Dialog.tsx:78`, `Dropdown/index.tsx:28`, `HumbleExpiryToast/index.tsx:42`, `TourContext.tsx:126`. Live gate Item 1 PASS, 0 px slot-rect delta A/B/C. |
| 5 | Model A is fully retired | ✓ VERIFIED | `model-a-retirement-gate.py` exit 0, 8 self-tests both directions, `git status --porcelain` empty after; zero `WebviewTag`/`DidFailLoadEvent`/`<webview>` in `src/` outside comments; `UI/WebviewControls/` and `humbleLoginChromeCss.ts` deleted; `MINIMUM_EXPECTED_GATES = 8` (`meta/runPlanningGates.py:50`). |
| 6 | Chrome back/forward reflect the live page | ✗ FAILED | See GAP-D. Rust history is correct; nothing pushes it to the renderer. |
| 7 | Repo gates stay green | ✗ FAILED | See GAP-A, GAP-B, GAP-C. |
| 8 | Newly minted strings are localised in-phase | ✗ FAILED | See GAP-E. 1 of 49 locales. |

**Score:** 5/8 truths verified.

---

## Per-requirement verdicts (REQ-40-01 .. REQ-40-14)

### REQ-40-01 — `Window::add_child` on the existing `main` window, `unstable` target-gated to macOS with the exclusion PROVEN by measurement — ✓ VERIFIED

Independently re-measured, not read from the SUMMARY:

- `cargo tree -e features --target x86_64-pc-windows-msvc` → 3207 lines, **zero** occurrences of
  `tauri feature "unstable"`.
- `cargo tree -e features` (macOS host) → `├── tauri feature "unstable"` present.

The two-declaration shape the requirement warned might unify features back in does **not** unify:
`Cargo.toml:113` `[target.'cfg(target_os = "macos")'.dependencies]` carries
`tauri = { version = "2", features = ["unstable"] }` at `:127`, while the base `[dependencies]`
entry carries only `["tray-icon", "image-png"]`. The base line's rationale comment was amended,
not replaced (`Cargo.toml:15-36`). `main.rs:4983` calls `window.add_child(...)` on
`app.get_window(MAIN_WINDOW_LABEL)` — no window restructuring.

### REQ-40-02 — renderer is the ONLY geometry owner, structurally — ✓ VERIFIED

One renderer `setBounds` call site; one Rust bounds writer; both carry the "do not add a second"
doc comment. No fallback rect: the null-ref path logs and returns `undefined`
(`useStoreEmbedHost.ts:154-159`) rather than substituting `window.innerWidth/innerHeight`. The
courier throws at two layers (preload `storeEmbed.ts:24-36`, sidecar `assertFiniteBounds`).
`open()` seeds the identical `slot.getBoundingClientRect()` rect, so creation and update share one
oracle. `useStoreEmbedHost.test.tsx` passes.

### REQ-40-03 — one reference-counted suppression context every overlay joins by MOUNTING — ✓ VERIFIED

`suppressionCountReducer` is a pure exported function (testable without jsdom); release below zero
warns and clamps; `defaultSuppressionValue` warns rather than silently no-opping for a consumer
outside the provider; `useSuppressStoreEmbed` is symmetric-by-construction so React 18 strict-mode
double-mounting nets to exactly one hold. Four wirings confirmed by grep at their real call sites
(not asserted). Route lifecycle is `hide()` on leave / `close()` only behind a `beforeunload`
flag (`useStoreEmbedHost.ts:246-268`). `StoreEmbedPlaceholder` renders inside the still-mounted,
still-measurable slot (`WebView/index.tsx:491-493`). `LoginWarning` correctly stays driven by
per-runner auth state — `showLoginWarningFor`'s effect reads `epic.username`/`gog.username`/
`amazon.user_id`/`zoom.username`, never a cookie.

### REQ-40-04 — one shared cookie jar retained deliberately; GOG/Amazon logout jar leak FIXED — ✓ VERIFIED

No `data_store_identifier` anywhere in the tree. `clearGogCookiesForLogout`
(`gog/user.ts:46-83`) and `clearAmazonCookiesForLogout` (`nile/user.ts:48-`) each do an
independent BEFORE census, call the existing label-independent
`clear_default_data_store_cookies_for_domain` path, and **warn** on a verified-zero against a
non-empty before-census rather than reading it as success. Credential-side cleanup runs FIRST and
is not blocked by cookie failure: `GOGUser.logout()` does `clearCache` / `configStore.clear()` /
`unlinkSync` before entering the `try { await clearGogCookiesForLogout() } catch` at `:361-368`.
Zoom is absent, as required. `cookie_domain_matches` remains the only domain comparator. New
suites `gog/__tests__/logoutCookies.test.ts` and `nile/__tests__/logoutCookies.test.ts` pass.

### REQ-40-05 — the 013-015 rules carry over unchanged — ✓ VERIFIED

`STORE_EMBED_USER_AGENT` (`main.rs:4664`) is
`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ... Chrome/142.0.0.0 Safari/537.36`, a real
shipping version, marked "MAINTAINED VALUE ... Reviewed: 2026-09-04". The synthetic
`Chrome/200.0` was not ported. `.user_agent(STORE_EMBED_USER_AGENT)` is set on the child builder
(`main.rs:4912`). History uses `on_page_load` + `PageLoadEvent::Finished` (main-frame only). The
recorded refinement holds: the scheme BLOCKER lives in `on_navigation` (`main.rs:4930-4945`) where
subframe coverage is the feature, with an in-place comment saying exactly that. No
`cookies_for_url` on the embed path. Every renderer read of embed state tolerates an absent embed
by logging and keeping last-known state (`useStoreEmbedHost.ts:104-110`).

### REQ-40-06 — chrome REBUILT with Rust-pushed back/forward — ⚠ PARTIAL (see GAP-D)

**Satisfied:** D-25 discharged in writing against vendored source
(`40-EMBED-API-VERIFICATION.md` Q1/Q2). The history stack is a Rust-side model with
browser-correct cursor semantics, proven by seven passing unit tests —
`store_embed_state_back_moves_the_cursor_it_does_not_append_a_new_entry`,
`store_embed_state_push_from_middle_truncates_forward_entries`,
`store_embed_state_reload_does_not_push_a_duplicate_entry`, plus four more. Zero page-side JS
injection (no `eval`, no `history.back()`). `StoreEmbedControls` is hookless besides
`useTranslation`, holds no handle and no subscription, displays HOST only, renders empty on an
unparseable URL, and does not reproduce the router-history fallback. It sits structurally above
the slot so NavShell needed no changes.

**Not satisfied:** the requirement's central inversion — "back/forward availability becomes state
Rust **pushes** to the renderer". No push exists. Detail and consequence in GAP-D below.

### REQ-40-07 — restore RE-DERIVED for Model B, not ported — ✓ VERIFIED

(a) `validStoredUrl`'s substring test is gone; `storeEmbedOrigins.ts` does
`hostname === apex || hostname.endsWith('.' + apex)` plus an `https:` requirement, and its suite
is adversarial in exactly the two directions the requirement names: `rejects the prefix-label
attack evil-gog.com.attacker.net for gog` and `rejects the suffix-label attack evilgog.com for
gog`, plus `resolves GOG's real affiliate start-URL host (af.gog.com) to the gog key`.
(b) Storage moved `sessionStorage` → `localStorage`, with the measurement that forced it recorded
in-place (`WebView/index.tsx:171-186`). Validation happens on **read**
(`WebView/index.tsx:188-197`) and additionally requires the resolved store to equal the ROUTE's
store, so a drifted value is removed rather than used. One table, five stores.

### REQ-40-08 — adtraction: derive-or-declare — ✓ VERIFIED (declared, correctly)

The warning `Dialog` is REMOVED, not left unreachable, and its orphaned state was deleted too. The
gap is logged at the point the detection would have run, gated on `store === 'gog'`
(`WebView/index.tsx:296-317`) so it fires once per GOG visit, and the log line cites
`40-EMBED-API-VERIFICATION.md` Q3: ABSENT. The todo
`.planning/todos/pending/2026-09-04-adtraction-ad-block-detection-has-no-derivable-signal-under-tauri.md`
exists, carries the vendored-source citation, and corrects D-32's own inverted caveat.
`WebViewAdtractionGapDeclared.test.ts` passes.

### REQ-40-09 — `store-page?store-url=` embeds only known embeddable origins — ✓ VERIFIED

`resolveStoreForUrl` gates the deep link (`WebView/index.tsx:212-222`); a non-match fires
`window.api.openExternalUrl` automatically (`:319-330`) **and** renders the panel with the
escape-hatch button as a fallback (`:441-443`), so the non-match case is never a blank screen. The
"this is not redundant with the Rust scheme policy" comment is present at the check
(`:200-210`), naming why a future reader must not delete it. No sixth identity: `storeKey` falls
back to `deepLinkConfig?.key` (`:257-258`), reusing that store's own restore key, UA and stack.

### REQ-40-10 — Model A FULLY retired, one webview model — ✓ VERIFIED (with GAP-C attached)

Gate `model-a-retirement-gate.py` exits 0, is discovered by `meta/runPlanningGates.py` (8/8, exit
0), and is mutation-proven in both directions — three RED self-tests against reintroduced tokens
and five accept-side self-tests covering the known false-positive risks (`WebviewUnavailablePanel`
prefix collision, comment-only occurrences, the gate's own docstring, Rust `WebviewBuilder`/
`WebviewUrl` lookalikes, `*.test.tsx` scope exclusion). `git status --porcelain` is empty after the
run, so the synthetic mutation file is cleaned up. Census outcome confirmed against the live tree:
`WebviewTag`/`DidFailLoadEvent` gone from `src/`, `platform/index.ts` re-export gone,
`UI/WebviewControls/` deleted, `humbleLoginChromeCss.ts` deleted, and `humbleGetLoginUserAgent`
plus `humbleLoginNavigated` removed after the four-surface sweep (channel count 6 → 4, recorded at
`humbleLoginFlowRegistration.ts:340-341` and pinned by `flowRegistrationCensus.test.ts`).
`getWebviewPreloadPath` survives untouched, as required. Both invalidated gates were dispositioned
in-plan: `hasTwoDistinctArms` is inverted with self-tests that REJECT a re-added guard
(`WebviewUnavailablePanel.test.tsx:462, :472`), and the two deleted-file pins were removed from
`meta/i18nForkTouchedFiles.json` (210 → 208) — every remaining pinned path exists on disk (checked
programmatically: zero missing). The anti-vacuity floor was raised to 8 in the same area
(`runPlanningGates.py:50`).

**Attached failure:** the pin was dispositioned for the DELETIONS but never for the ADDITIONS this
phase made — see GAP-C. The requirement's own gate is red at HEAD.

### REQ-40-11 — full store-browser threat model; the capability CONJUNCTION — ✓ VERIFIED

`40-THREAT-MODEL.md` carries 4 trust boundaries, a 10-row STRIDE register (T-40-04-01..09 plus
T-40-04-SC) each with a disposition, and a `## Controls verified` section separating proven from
asserted. Conjunction half (i) re-measured by me: `src-tauri/capabilities/default.json` is the
only capability file and declares **no** `remote` key — the object's keys are
`$schema`/`identifier`/`description`/`windows`/`permissions`. Half (ii) — the `webviews`-scoping
defence-in-depth attempt — was REVERTED with the falsification recorded in the threat model and
mirrored into `default.json`'s own description, which is the requirement's stated acceptable
outcome. Containment verified in source: `on_navigation` runs the named, unit-tested
`store_embed_navigation_policy` (`main.rs:4868`) — five passing Rust tests cover
`blocks_the_apps_own_scheme`, `hands_off_steam_scheme`, `allows_http_freely`,
`allows_https_freely`, `default_denies_unknown_schemes`; `on_new_window` returns
`NewWindowResponse::Deny` and routes to `open_external` (`main.rs:4948-4964`); `on_download`
returns `false` and routes likewise (`:4966-4980`). Navigation stays free — no origin allowlist
exists in the Rust policy (grep-confirmed: it dispatches on scheme only).

### REQ-40-12 — macOS-only, Epic-excluded scope honest to users AND to the ledger — ✓ VERIFIED

`WebviewUnavailablePanel` takes a `reason: 'platform' | 'epic'` prop with four NEW keys (never
edits of the old defaults). Platform copy names macOS, not "this build"
(`WebView/index.tsx:452-460`, `platform !== 'darwin'`). Epic copy is provisional and
non-accusatory — the suite asserts it: `D-08: epic copy asserts no blocking/accusatory claim about
Epic` and `never mentions signing in or login for the epic reason`. Both paths keep the
open-in-browser hatch. The Epic tile stays (`StoresPanel/index.tsx:39`). Ledger: `38-E01`..`38-E04`
exist in ROADMAP.md's Phase 38 section with the **return half** recorded 2026-09-05 stating that
`40-11`'s macOS PASS does not close `38-E03`/`38-E04`, and the matching non-closure is on the
gate's side too (`40-LIVE-GATE.md:788`). Spike `024 epic-store-in-embedded-child-webview` is
filed PLANNED at `spikes/MANIFEST.md:267` with the mechanism note and the existing harness path.

### REQ-40-13 — the two unanswerable questions settled by a human on real hardware — ✓ VERIFIED

`40-11-PLAN.md:10` carries `autonomous: false` and a blocking `checkpoint:human-verify`.
`40-LIVE-GATE.md` frontmatter: `status: complete`, `items_total: 3`, `items_passed: 3`,
`verdict: PASS — all 3 items pass. Item 3 passed only on RE-RUN after fix b4517366e; FAILED on
first run (54ca5b400)`. The contract was authored before the run, by a different actor from the
runner, with every RESULT slot reading "NOT YET RUN" until the run — the recorded
auto-mode-answers-its-own-gate failure mode did not occur. Item 1 is pixel-measured (0 px slot-rect
delta across A/B/C) with the requirement-PAIR problem handled (geometry captured before the
overlay and again after dismissal). Items 2 and 3 record the operator's verbatim words. Item 3's
original FAIL produced a real fix (`b4517366e`, leading-edge throttle replacing a trailing
debounce in `useStoreEmbedHost.ts:174-217`) and a re-run, not a caveat. The artifact's
"Not established" table has six rows, each with a named queue owner. **Freshness confirmed:**
`git diff --name-only b4517366e..cabc2c7d1` touches only `.planning/` — no source changed after
the gated build, so the live evidence still describes HEAD.

### REQ-40-14 — every minted string in `gamelib.json`, COUNTED from the catalog diff — ⚠ PARTIAL

**Satisfied and independently re-measured:** `public/locales/en/translation.json` is untouched by
this phase; all six new keys are in `en/gamelib.json`; the changed-key count is **zero** (the four
panel keys are new paths, not edits of `webview.unavailable.heading`/`.body`); the two existing
localised keys `webview.unavailable.next-step` and `.open-in-browser` are REUSED, and the four
`webview.controls.*` labels are reused by `StoreEmbedControls` rather than re-minted; every added
key's consumer is real (`StoreEmbedPlaceholder.tsx:33`, `StoreEmbedControls/index.tsx:114`,
`WebviewUnavailablePanel.tsx:68/72/79/83`); and the census names the gates' blind spots instead of
overclaiming.

**Correction to the census's own framing:** the census reports 6 added keys, which is right. The
`webview.unavailable.*` namespace at HEAD holds 6 keys in en, of which 4 are new; de/fr hold 2 of
those 6, both being the pre-existing reused pair.

**Not satisfied:** the final clause — "The newly minted keys get the project's standard
localisation treatment in-phase." See GAP-E.

---

## Gaps

### GAP-A (BLOCKER) — `pnpm lint` is RED, and Phase 40 caused it

| | |
|---|---|
| Measured at HEAD | `npx eslint --no-cache -f json .` → **0 errors, 4159 warnings**, 1150 files |
| Ratchet | `package.json:44` — `eslint --cache --max-warnings 4157` |
| Measured at baseline | `git archive 8ac3a8c12 \| tar -x` + same eslint binary + `--no-cache` → **4153 warnings**, 1129 files |
| Delta | +20 added, −14 removed, **net +6**, every changed file a Phase 40 file |
| Blast radius | `.github/workflows/lint.yml` (`pnpm lint` on every PR to main/stable) and `.husky/pre-push` (`pnpm codecheck && pnpm lint && ...`) |

**This corrects the standing assumption that the RED is pre-existing.** The ratchet was set to
4157 by Phase 39 plan 09 (`e98174032`). The commit used to "prove pre-existing", `c78ff3d30`, is
itself INSIDE Phase 40 — `git log --oneline -1 c78ff3d30` is
`docs(state): Phase 40 at its blocking human gate (10/11 plans)`, i.e. after plans 01–10 landed.
Measuring there measured a Phase-40 tree. At the true pre-phase commit the count is 4153.

The stale-`.eslintcache` hypothesis is not needed to explain the earlier "green at exactly 4157"
SUMMARY reports: no `.eslintcache` exists in the tree now, and the count crossed 4157 partway
through the phase, so an early plan reporting green would have been reporting a true value at its
own commit. The reports were not wrong when written; they were never re-taken at the end.

Per-file delta is in the frontmatter. Note that 12 of the 20 additions are in NEW test files
(`logoutCookies.test.ts` ×2 = 10, `useSuppressStoreEmbedWhile.test.tsx` = 2), which makes this
cheap to close.

### GAP-B (BLOCKER) — `hardcodedStringGate` is RED, and Phase 40 caused it

Three failing tests across two suites at HEAD; the same two suites are GREEN at 8ac3a8c12 measured
in a hookless git worktree (`git -c core.hooksPath=/dev/null worktree add --detach`, so the
`git checkout` post-checkout download hazard was sidestepped): **2 suites passed, 159 passed,
1 skipped**.

The single violation:

```
{"column": 49, "file": "src/frontend/screens/WebView/index.tsx", "kind": "argument",
 "line": 29, "text": "last-url-"}
```

That is Phase 40 plan 40-09's own new helper:

```ts
const lastUrlStorageKey = (storeKey: string) => `last-url-${storeKey}`
```

It fails both
`hardcodedStringGate › scope orchestration › scans the whole committed scope and finds zero
violations outside the allowlist (D-12: blocking, no advisory grace period)` and the `W4: no
collateral` assertion in the facetLabels/chipLabels ratchet describe.

`pnpm test:ci` is `jest --runInBand --silent` with no project filter, so the Meta project is in
scope and `.github/workflows/test.yml` is red.

### GAP-C (BLOCKER) — the A-17 i18n-scope pin is stale in the ADD direction

`genI18nGateScope › ... › A-17 ANTI-ROT: the committed meta/i18nForkTouchedFiles.json equals the
LIVE git derivation` fails at HEAD with five files in the live derivation and absent from the pin:

- `src/frontend/components/UI/NavShell/StoreEmbedSuppressionContext.tsx` (plan 40-06)
- `src/frontend/components/UI/StoreEmbedControls/index.tsx` (plan 40-07)
- `src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx` (plan 40-06)
- `src/frontend/screens/WebView/storeEmbedOrigins.ts` (plan 40-09)
- `src/frontend/screens/WebView/useStoreEmbedHost.ts` (plan 40-08)

Plan 40-01 did its half correctly (210 → 208 for the two deleted files, `generatedAt` frozen,
count pins moved, positive-control regeneration run — `40-01-SUMMARY.md:122-123` records 26 passed
/ 1 skipped at that point). What did not happen is a re-run after waves 3–6 minted five new
string-carrying frontend files. This is the recorded
`deleting-a-scoped-source-file-breaks-three-gates` failure shape running in reverse.

Closure needs the JSON grown to 213 **and** the `208` count pins in
`meta/__tests__/genI18nGateScope.test.ts` moved to 213 in the same commit, per the
`regenerating-an-artifact-breaks-the-pins-that-guard-it` lesson.

### GAP-D (BLOCKER, functional) — an in-embed navigation never reaches the renderer, so Back is permanently disabled

The requirement (REQ-40-06) inverts control so that Rust **pushes** navigation state. Rust does
half of it and nothing does the other half:

- `main.rs:4913-4922` — `on_page_load` / `PageLoadEvent::Finished` pushes the URL into
  `STORE_EMBED_STATE`. It emits nothing.
- `RUST_STORE_EMBED_TAKE_NAV_EVENTS` is declared in `sidecarTransport.ts:448` but has **no Rust
  dispatch arm** — the nine registered arms are `open`, `set_bounds`, `hide`, `show`, `close`,
  `back`, `forward`, `reload`, `navigate` (`main.rs:7322-7406`).
- `StoreEmbedSeam.takeNavEvents()` throws a declared-unimplemented Error
  (`storeEmbedFlowRegistration.ts:236-241`).
- The renderer runs no poller and no subscription. `navState` is written only by `applyNavResult`
  from the return value of a call the user initiated (`useStoreEmbedHost.ts:99-111`).

**User-visible consequence.** Open `/store/steam`, click a game. Rust's `canGoBack` is now `true`;
the renderer's is still `false`; `StoreEmbedControls` renders `disabled={!backAvailable}`
(`index.tsx:82`). The Back button is greyed out and the user cannot go back. Same for Forward.
The host label is frozen at the start URL's host — visible on `/store/gog`, whose start URL is the
affiliate host `af.gog.com` while the page lands on `www.gog.com`. Pressing Reload is the only
resynchronisation path, and it is not discoverable.

**Why no gate caught it.** Every store-embed jest suite drives the renderer against a mocked
`window.api`, so "the renderer never receives a push" is invisible — there is no counterparty to
push. The Rust suite proves the history model in isolation. The live gate's Item 2 did exercise an
in-page link click, but its pass condition is input FEEL (`"click feel fine"`); nobody looked at
the Back button. This is the same shape as the `store_embed_open:bad-args` defect the live gate
found: both halves correct, no test spanning the seam.

**Why it is a gap and not an accepted deferral.** The seam's own comment says "No future plan has
been assigned ownership yet", and I found no todo, no backlog row, no ledger entry and no line in
`deferred-items.md` or the live gate's six-row "Not established" table. It exists in code comments
only. That is precisely the three-prose-locations-and-zero-queues condition this phase's ROADMAP
preamble was written to end.

### GAP-E (WARNING) — the newly minted keys are localised in 1 of 49 locales

Measured by flattening every `public/locales/*/gamelib.json`:

| | |
|---|---|
| Locales carrying `gamelib.json` | 49 |
| Locales holding ≥1 of the 6 newly minted keys | **1** (`en`) |
| `de` / `fr` coverage of the 6 minted keys | **0/6** each |
| Locales still holding the 2 RETIRED keys | **48** |

`GAMELIB_MT_LOCALES=de,fr pnpm machine-fill-gamelib` returned HTTP 401 because
`ANTHROPIC_API_KEY` in the execution environment was the literal placeholder `sk-ant-...`. That is
an honest environment limitation, correctly diagnosed and recorded in `40-I18N-CENSUS.md` and
`40-10-SUMMARY.md:143-161`, with `git status` confirming no partial write. What is missing is a
queue entry: the item is in two prose documents and zero queues.

Note also the recorded project rule holds — `translation.json` is untouched (added=0, removed=0,
changed=0), and `lint-translations:gamelib` / `i18n-churn-guard` both stay green, which is exactly
the blindness REQ-40-14 says to expect rather than rely on.

---

## Determination on the three known-outstanding items

**1. `pnpm lint` — the "pre-existing" reading is WRONG. Phase 40 introduced it.**
4153 at `8ac3a8c12` (green, four under the ratchet) → 4159 at HEAD (red, two over). The commit used
to establish "pre-existing", `c78ff3d30`, is a Phase 40 commit
(`docs(state): Phase 40 at its blocking human gate (10/11 plans)`), so that measurement was taken
on a Phase 40 tree. The stale-`.eslintcache` theory is not needed and is not supported: no
`.eslintcache` exists in the tree, and the count crossed the ratchet mid-phase, so an early plan's
"green at 4157" was true when taken and simply never re-taken at phase end. See GAP-A.

**2. i18n — the counts are worse than "de/fr 1/5", and the shape of the claim needs restating.**
There are **6** newly minted keys, not 5, and they are not all in the `webview.unavailable.*`
namespace: four are (`platform.heading`, `platform.body`, `epic.heading`, `epic.body`) and two are
elsewhere (`webview.embedPlaceholder.message`, `webview.storeEmbedControls.hostLabel`). `de` and
`fr` hold **0 of 6**, not 1 of 5 — the one key each that appears present under
`webview.unavailable.*` is `next-step`/`open-in-browser`, pre-existing keys this phase deliberately
REUSED rather than minted. Coverage across all 49 locales carrying the catalog is 1/49. 48 locales
additionally still hold the two retired keys. The project rule was followed: all six went into
`gamelib.json`; `translation.json` has a zero diff. See GAP-E.

**3. The unidentified intermediate test failure — it is not flaky; there are two permanent ones.**
I found no flake. Phase 40's own suites are deterministic: 24 suites / 521 tests green, then the
core store-embed + WebView + NavShell + state set run three consecutive times at 926/926 each. The
full touched-area sweep (`src/backend/sidecar`, `src/backend/platform`, `storeManagers/gog`,
`storeManagers/nile`, `src/preload`, `src/frontend/components/UI`, `src/frontend/screens/WebView`,
`src/frontend/state`, `src/backend/humble`) is 159 suites / 3120 tests green. What is red is the
Meta project, permanently and reproducibly: `hardcodedStringGate` (2 tests) and
`genI18nGateScope` (1 test), both GREEN at the pre-phase baseline in a hookless worktree. The
intermediate failure that "passed on re-run" is most likely one of these observed before the
offending file landed or before a mid-phase cache state; either way, the standing red is not
intermittent and is now measured. See GAP-B and GAP-C.

---

## Checks run (exit codes captured directly, never through a pipe)

| Check | Command | Result |
|---|---|---|
| Planning gates | `python3 meta/runPlanningGates.py` | **EXIT=0** — 8/8 passed, including `40-.../model-a-retirement-gate.py` |
| Typecheck | `pnpm codecheck` (`tsc --noEmit`) | **EXIT=0** |
| Model A gate standalone | `python3 .planning/phases/40-.../model-a-retirement-gate.py` | **EXIT=0**, 8 self-tests, tree clean after |
| Rust store-embed tests | `cargo test store_embed` | **17 passed, 0 failed** (220 filtered) |
| Phase 40 jest set | `npx jest <24 store-embed/WebView/suppression suites>` | **EXIT=0** — 24 suites, 521 tests |
| Touched-area jest sweep | `npx jest src/backend/sidecar src/backend/platform storeManagers/gog storeManagers/nile src/preload src/frontend/components/UI src/frontend/screens/WebView src/frontend/state src/backend/humble` | **EXIT=0** — 159 suites, 3120 tests |
| Flake probe ×3 | same core set, three consecutive runs | 926/926 each, EXIT=0 each |
| Meta gates | `npx jest genI18nGateScope hardcodedStringGate` | **EXIT=1** — 2 suites failed, 3 tests failed |
| Meta gates at baseline | same, in a hookless worktree at `8ac3a8c12` | **EXIT=0** — 2 suites passed, 159 passed / 1 skipped |
| eslint at HEAD | `npx eslint --no-cache -f json .` | 0 errors, **4159 warnings** (ratchet 4157) |
| eslint at baseline | same binary on `git archive 8ac3a8c12` | 0 errors, **4153 warnings** |
| Feature exclusion | `cargo tree -e features --target x86_64-pc-windows-msvc` | **0** matches for `tauri feature "unstable"` in 3207 lines |
| Feature presence | `cargo tree -e features` (macOS host) | `tauri feature "unstable"` present |
| i18n coverage | flatten all `public/locales/*/gamelib.json` | 49 locales; 1 holds the new keys; 48 hold the retired pair |
| Debt markers | `grep -nE "TBD\|FIXME\|XXX\|HACK\|TODO"` across all 66 phase-40 changed files + `main.rs` | **zero matches** |

A method note worth recording: `timeout` is not on PATH in this shell, and two early
`timeout 180 cargo tree ...` invocations returned "command not found" while a downstream
`grep -c` reported `0` — a false negative that briefly read as "the feature is absent on macOS
too". Re-run without `timeout`, the real answer is the one in the table. This is the same class as
the project's recorded `cmd | tail; echo $?` false green.

---

## What this phase does NOT deliver, and who owns each

| Not delivered | Owner |
|---|---|
| Windows WebView2 `add_child` — no code path exists (`unstable` is target-gated off Windows) | Phase 38 ledger item **38-E01** |
| Linux webkit2gtk `add_child` — same | Phase 38 ledger item **38-E02** |
| Retina/HiDPI geometry at any scale factor other than 2.0, or 2.0 on any other host | Phase 38 ledger item **38-E03** (return half recorded: `40-11`'s PASS does not close it) |
| Drag-resize latency on any other hardware/backend | Phase 38 ledger item **38-E04** (same non-closure) |
| Epic inside the embed — `/store/epic` routes to the panel on every platform | Spike **024** `epic-store-in-embedded-child-webview`, PLANNED |
| Adtraction / ad-block redirect detection — declared absent with a mechanism citation | todo `2026-09-04-adtraction-ad-block-detection-has-no-derivable-signal-under-tauri` |
| In-page state and scroll restoration across a back/forward press (accepted D-22 cost, stated in code) | Accepted, documented at `StoreEmbedControls/index.tsx:14-15` |
| 12 pre-existing clippy errors in `main.rs` | phase `deferred-items.md`; not in any CI workflow |
| **Push of in-embed navigation state to the renderer** | **NOBODY — see GAP-D. This is the gap, not a deferral.** |
| **de/fr (and 46 other) locale fills for the 6 minted keys** | **NOBODY — see GAP-E.** |

---

## Anti-patterns found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/frontend/screens/WebView/index.tsx` | 29 | hardcoded scanned literal `last-url-` | 🛑 Blocker | Breaks `hardcodedStringGate`, therefore `pnpm test:ci`, therefore `.github/workflows/test.yml` |
| `meta/i18nForkTouchedFiles.json` | — | pin stale by 5 added files | 🛑 Blocker | Breaks `genI18nGateScope` A-17 anti-rot |
| 8 files (per GAP-A table) | — | +20 eslint warnings over the ratchet | 🛑 Blocker | Breaks `pnpm lint`, `.husky/pre-push`, `.github/workflows/lint.yml` |
| `src/backend/sidecar/storeEmbedFlowRegistration.ts` | 236-241 | declared-unimplemented method with no owner | ⚠️ Warning | The declaration itself is correct practice (no plausible-default stub); the absence of a queue owner for it is the defect |
| — | — | `TBD`/`FIXME`/`XXX`/`TODO`/`HACK` | ℹ️ Info | **None found** in any of the 66 changed files or `main.rs` |

---

## Gaps Summary

Phase 40 delivers its headline outcome: the apology panel is gone on macOS, a real Tauri child
webview composites the live store and wiki inside the main window, the whole IPC chain is present
and reachable end to end, the Electron `<webview>` model is provably retired behind a
mutation-proven gate, the surface is threat-modelled with a corrected two-leg capability
conjunction, and the three questions no automated check could answer were settled by a human on
real hardware — including one that FAILED, was fixed, and was re-run rather than caveated. Eleven
of fourteen requirements verify clean against the codebase, several of them re-measured
independently rather than read from a SUMMARY.

It does not close, for four reasons that are all observable in the tree today.

Three are CI regressions the phase introduced and did not notice, each proven against a true
pre-phase baseline rather than assumed: `pnpm lint` at 4159 against a 4157 ratchet that had four
warnings of headroom before this phase; `hardcodedStringGate` red on one literal in this phase's
own new code; and the A-17 i18n-scope pin stale by exactly the five string-carrying files this
phase minted. Together they break `.github/workflows/lint.yml`, `.github/workflows/test.yml` and
`.husky/pre-push`. None of the three appears in any SUMMARY, in `deferred-items.md`, or in the live
gate's non-closure table. They are cheap to fix — a handful of lint suppressions or type
annotations, one allowlist entry, and one pin edit with its count assertions.

The fourth is functional and matters more. REQ-40-06 requires back/forward availability to be state
Rust pushes to the renderer. Rust records the history correctly and the chrome consumes the state
correctly, but the channel between them was never built: `takeNavEvents` throws, no Rust arm
exists, nothing emits, and the renderer only learns navigation state as the return value of calls
the user initiated. So after any in-page link click — the ordinary way a browser's history
grows — the Back button stays greyed out and the host label stays stale. Every jest suite mocks
`window.api`, so nothing could see it; the live gate clicked a link but was grading feel. It is the
same seam-spanning blind spot that produced this phase's `store_embed_open:bad-args` defect, and it
currently has no owner anywhere in the project's queues.

The i18n fill (1 of 49 locales) is the smaller sibling of the same disease: correctly diagnosed,
honestly recorded, and routed nowhere.

---

_Verified: 2026-09-05T10:40:00Z_
_Verifier: Claude (gsd-verifier)_
