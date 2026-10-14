---
phase: quick-261014-vot
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/epic_embed_state.rs
  - src-tauri/src/macos_epic_embed.rs
  - .planning/todos/pending/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md
  - .planning/todos/completed/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md
  - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md
autonomous: true
requirements:
  - 2026-10-14-epic-embed-subview-does-not-repaint-after-reload
  - 50-UAT-16-recovery-half

estimate:
  tokens: 55000
  raw_tokens: 55000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "`epic_embed_reload()` on a surface that has NEVER committed a main-frame navigation re-issues
      the last chrome-requested URL via `loadRequest` instead of calling `WKWebView::reload()`.
      This is the whole defect: WebKit's `FrameLoader::reload` returns early when the current
      document loader's request URL is empty, so the banner's Reload was a silent no-op in exactly
      the state the banner appears in (nothing ever committed). The module already asserted this at
      `macos_epic_embed.rs:1799-1800`; this change acts on it."
    - "`epic_embed_reload()` on a surface that HAS committed keeps calling `WKWebView::reload()`,
      byte-for-byte the old behaviour. UAT Launch 3 proved that path works — a mid-session hosts
      blackhole on an already-committed Epic page produced `didFailProvisionalNavigation --
      NSURLErrorCancelled (-999)` on each Reload click, i.e. the native reload fired and cancelled
      the hung load. Nothing about the committed path may change."
    - "The decision is a pure total function over two booleans, unit-tested on every OS. It lives in
      `epic_embed_state.rs`, which `main.rs:62` declares WITHOUT a `#[cfg(target_os)]` gate (unlike
      `macos_epic_embed` at `main.rs:56-57`), so `cargo test` covers all four combinations on Linux
      CI too, where the AppKit module never compiles."
    - "`did_finish_navigation` emits a success line naming the HOST ONLY. The todo's own
      `## Suggested instrument` section is explicit that this is the reason the arm is unresolved:
      the delegate speaks only on failure, so absence of log lines after a Reload click cannot
      distinguish 'nothing happened' from 'it worked silently'. After this change it can."
    - "The two literals other UAT arms pin are unchanged: `[shell] macos_epic_embed: load timed out
      past 45s` (item 16) and `[shell] macos_epic_embed: {caller} -- {description}` (item 17, scored
      `pass`). A new literal is ADDED; none is edited."
    - "No log line anywhere in this change contains a URL. Host or scheme only — the module's
      standing discipline (T-28-04)."
    - "The todo is in `.planning/todos/completed/` with a `## Resolution` section that states
      plainly that the live recovery arm remains UNOBSERVED on hardware and the DNS-cache confound
      the todo itself raises remains UNMEASURED. The fix is reasoned from WebKit semantics plus the
      Launch 3 / Launch 5 discrimination, not from a re-run."
  artifacts:
    - path: "src-tauri/src/epic_embed_state.rs"
      provides: "`EpicEmbedReloadAction` + `epic_embed_reload_action(has_committed,
        has_last_requested_url)` — the cfg-free decision table — plus one `#[test]` per combination."
      contains: "epic_embed_reload_action"
    - path: "src-tauri/src/macos_epic_embed.rs"
      provides: "`has_committed` / `last_requested_url` on `EpicEmbedSurface`; a
        `webView:didCommitNavigation:` hook that sets the flag; the three chrome-side `loadRequest`
        sites recording the URL; `reload()` routed through the decision helper; a host-only success
        eprintln in `did_finish_navigation`."
      contains: "didCommitNavigation"
    - path: ".planning/todos/completed/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md"
      provides: "The closed todo with its `## Resolution` section."
      contains: "## Resolution"
  key_links:
    - "`loadRequest` / `reload` must be called with the surface `Mutex` NOT held. Both fire
      `didStartProvisionalNavigation` SYNCHRONOUSLY, and that hook takes the same lock
      (`macos_epic_embed.rs:1405`) — holding it across the call self-deadlocks the main thread.
      `navigate()` (`:913-926`) and the cold-path observer registration (`:746-748`) are the two
      in-module precedents for this exact hazard; follow their shape."
    - "`reload()`'s closure runs inside `navigate_webview_on_main_thread`, which itself locks the
      surface AFTER `action(webview)` returns (`:845-848`, for `nav_flags()`). A guard still alive
      when the closure returns deadlocks that read. Scope the guard so it drops before the match
      arms run."
    - "Only the THREE chrome-initiated `loadRequest` sites write `last_requested_url` — `open()`
      warm (`:660-665`), `open()` cold (`:715-718`), `navigate()` (`:923-926`). No delegate hook and
      no page-initiated navigation may write it, or Reload could re-issue a page-chosen URL."
    - "`has_committed` is set ONLY by `didCommitNavigation` and cleared ONLY by `close()` and the
      cold `open()` path (a brand-new `WKWebView` has committed nothing). It is deliberately NOT
      cleared by either failure hook: a failure after a successful commit leaves a real current URL
      that `reload()` can still act on, which is precisely the Launch 3 behaviour that worked."
---

<objective>
Close todo `2026-10-14-epic-embed-subview-does-not-repaint-after-reload`: on macOS the Epic store
embed's timeout-banner `Reload` does nothing when nothing ever committed, because
`macos_epic_embed::reload()` calls `WKWebView::reload()`, which WebKit short-circuits on a view with
an empty current-request URL.

Purpose: the banner's only recovery action is currently inert in exactly the state the banner
appears in. Give `reload()` a first-commit fallback that re-issues the last chrome-requested URL,
and add the success-path log line the todo asks for so the next live arm is measurable at all.

Output: a cfg-free decision helper with unit tests, the native fallback wired through it, a
host-only `didFinishNavigation` instrument, the todo moved to `completed/` with a `## Resolution`,
and 50-UAT item 16's `result:` paragraph extended with the diagnosis.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md

Load `Skill("gamelib-conventions")` before touching the UAT file or writing a `<verify>` block.

**Codebase exploration rule (CLAUDE.md, mandatory):** `graphify-out/graph.json` exists. Run
`graphify query "<question>"` before grepping or reading raw source. Read raw files only afterwards,
to pin specific lines. Never read `graphify-out/GRAPH_REPORT.md` or `graph.json`.

**Every line number below was verified live at planning time (2026-10-14).** Re-grep before editing;
if a number has drifted, trust the symbol name over the number.

| What | Where |
|---|---|
| `struct EpicEmbedSurface` | `src-tauri/src/macos_epic_embed.rs:260-299` |
| `open()` warm path — lock block / `if load {` / `loadRequest` | `:648-658` / `:660` / `:663` |
| `open()` cold path — `loadRequest` / guard field writes | `:715-718` / `:731-735` |
| `navigate_webview_on_main_thread` (locks AFTER `action`) | `:825-861`, lock at `:845-848` |
| `reload()` — doc comment / body | `:886-888` / `:889-893` |
| `navigate()` — lock block / `loadRequest` | `:913-922` / `:923-926` |
| `close()` — field reset block | `:1000-1010` |
| `define_class!` / `unsafe impl WKNavigationDelegate` | `:1244` / `:1298` |
| `did_finish_navigation` (`host` computed `:1373-1375`, moved `:1378`) | `:1364-1391` |
| `did_start_provisional_navigation` (takes the lock at `:1405`) | `:1398-1426` |
| `epic_embed_handle_content_process_termination` doc comment / bare reload | `:1796-1801` / `:1815-1817` |
| `epic_embed_clears_load_timeout` / `epic_kvo_event_is_new` / `mod tests` | `src-tauri/src/epic_embed_state.rs:142-144` / `:146-153` / `:155` |
| `### 16.` heading / its single-line `result:` / `### 17.` / `## Summary` | `50-UAT.md:443` / `:446` / `:448` / `:466` |

**Facts established at planning time — do not re-derive:**

- `epic_embed_state` is declared at `main.rs:62` with only
  `#[cfg_attr(not(target_os = "macos"), allow(dead_code))]` — NOT `#[cfg(target_os = "macos")]`.
  Its tests run on Linux. `macos_epic_embed` at `main.rs:56-57` IS macOS-gated. This is why the
  helper goes in `epic_embed_state.rs`.
- `webView_didCommitNavigation` IS available. `objc2-web-kit-0.3.2`'s
  `src/generated/WKNavigationDelegate.rs:253-259` declares it `#[optional]` behind
  `#[cfg(all(feature = "WKNavigation", feature = "WKWebView", feature = "objc2-app-kit"))]` plus
  `#[cfg(target_os = "macos")]`. All three features are already in `src-tauri/Cargo.toml`'s
  `objc2-web-kit` list (`WKWebView`, `WKNavigation`, and `objc2-app-kit` at `:240`).
  **No `Cargo.toml` change is needed and none may be made.** In particular do NOT add a
  back-forward-list feature — `Cargo.toml:232` declines it in writing; the Rust-side
  `has_committed` flag is the discriminator instead.
- Signature shape: `(&self, webview: &WKWebView, _navigation: Option<&WKNavigation>)`, matching
  `did_finish_navigation` at `:1365`.
- Rust formatting: `cargo fmt --manifest-path src-tauri/Cargo.toml --check` exits **0 with zero
  output** on this tree today. Measured, so it cannot be red for an unrelated reason.
- Scoped test baseline: `cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell
  epic_embed` → **46 passed; 0 failed; 350 filtered out**.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Give reload() a first-commit fallback, behind a unit-tested pure decision</name>
  <files>src-tauri/src/epic_embed_state.rs, src-tauri/src/macos_epic_embed.rs</files>
  <behavior>
    Four `#[test]` cases in `epic_embed_state.rs`'s existing `#[cfg(test)] mod tests` (`:155`),
    named in the sibling style already there (full-sentence snake_case, e.g.
    `clearing_the_challenge_does_not_un_hide_a_user_hidden_surface`):

    - committed = true,  has URL = true   -> `NativeReload`
    - committed = true,  has URL = false  -> `NativeReload`
    - committed = false, has URL = true   -> `LoadLastRequested`   (the defect's case)
    - committed = false, has URL = false  -> `NativeReload`        (nothing better to do)

    Write these FIRST and watch them fail to compile against the absent function, then implement.
    The one asymmetric row is the third; the other three all collapse to the old behaviour, which
    is the point — the committed path must be provably untouched.
  </behavior>
  <action>
    Run `graphify query "epic embed reload path and navigation delegate commit hook"` first, then
    re-grep the symbols in the context table to confirm the line numbers before editing.

    **A. `src-tauri/src/epic_embed_state.rs`** — add, next to `epic_embed_clears_load_timeout`
    (`:142`) and ahead of the `#[cfg(test)] mod tests` block at `:155`:

    A `pub(crate)` enum with `#[derive(Debug, Clone, Copy, PartialEq, Eq)]` named
    `EpicEmbedReloadAction`, variants `NativeReload` and `LoadLastRequested`. And a `pub(crate) fn
    epic_embed_reload_action(has_committed: bool, has_last_requested_url: bool) ->
    EpicEmbedReloadAction` returning `LoadLastRequested` only when `!has_committed &&
    has_last_requested_url`, `NativeReload` otherwise.

    Carry a doc comment in this module's established register — it must say WHY, not what:
    WebKit's `FrameLoader::reload` returns early when the current document loader's request URL is
    empty, so `WKWebView::reload()` is a no-op on a view that has never committed a main-frame
    navigation; the surface's own `has_committed` flag is the discriminator because a
    back-forward-list feature is declined in `Cargo.toml`. Note that a committed surface keeps the
    native reload unconditionally, because a post-commit failure still leaves a real current URL
    (the Launch 3 behaviour, where each Reload click produced its own `-999` cancellation).

    Add the four tests from `<behavior>`.

    **B. `src-tauri/src/macos_epic_embed.rs`** — six edits plus one import, all inside the existing
    shapes.

    0. **Import.** Extend the existing `use crate::epic_embed_state::{ ... };` block at `:62-65`
    with `epic_embed_reload_action` and `EpicEmbedReloadAction`, keeping that block's established
    ordering (free functions first, then types, each group alphabetical — `cargo fmt` will not
    reorder them for you).

    1. **Struct fields** (`:260-299`). Add two fields with the verbose per-field doc comments every
    neighbour carries (`nav_generation` at `:269-275` is the register to match):
    - `has_committed: bool` — set only by `didCommitNavigation`; cleared only by `close()` and the
      cold `open()` path. State in the comment that it is deliberately NOT cleared by either failure
      hook, and why (a failure after a commit leaves a reloadable current URL).
    - `last_requested_url: Option<String>` — the last URL CHROME asked for, written at exactly the
      three `loadRequest` call sites. State in the comment that no page-initiated navigation and no
      delegate hook may ever write it, because `reload()` re-issues it.
    Both are `Default`-derivable, so `#[derive(Default)]` at `:259` still holds.

    2. **Record the URL at all three `loadRequest` sites.**
    - `open()` warm (`:648-665`): inside the existing `{ let mut guard = ... }` block, after `load`
      is computed, set `guard.last_requested_url = Some(url_string.clone())` when `load` is true.
      Keep it to the one lock acquisition already there; do not add a second.
    - `open()` cold (`:731-735`): alongside the existing `guard.top_level_host = None;`, set
      `guard.last_requested_url = Some(url_string.clone())` and `guard.has_committed = false`. The
      cold path builds a brand-new `WKWebView`, which has committed nothing — write it explicitly
      rather than leaning on `Default`.
    - `navigate()` (`:913-922`): inside the existing `Ok(mut guard)` arm, set
      `guard.last_requested_url = Some(url_string.clone())`. `url_string` is already moved into the
      closure and borrowed at `:903`, hence the clone.

    3. **New delegate hook.** In the `unsafe impl WKNavigationDelegate` block (`:1298`), immediately
    BEFORE `did_finish_navigation` (`:1364`) so the lifecycle reads in order, add
    `#[unsafe(method(webView:didCommitNavigation:))]` with body: lock the surface, set
    `guard.has_committed = true`, and on a poisoned lock emit the module's existing verbatim warning
    `[shell] WARN: macos_epic_embed surface registry poisoned -- continuing` (copy it from `:1388`).
    Do not enqueue a nav event and do not touch any other field — `didFinishNavigation` and
    `didStartProvisionalNavigation` already own the rest of the lifecycle. The `webview` parameter
    is unused; name it with a leading underscore.

    4. **`close()` reset** (`:1000-1010`). Alongside `guard.top_level_host = None;` and
    `guard.pending_nav_events.clear();`, add `guard.has_committed = false;` and
    `guard.last_requested_url = None;`.

    5. **`reload()`** (`:886-893`). Keep it on `navigate_webview_on_main_thread` with the same
    `"epic_embed_reload"` op string. Inside the closure:
    - Read `(has_committed, last_requested_url.clone())` under the surface lock and compute the
      action via `epic_embed_reload_action`. On a poisoned lock, log the module's verbatim warning
      and fall through to the native reload.
    - **Drop the guard before calling into WebKit.** Scope the lock so it is released before either
      branch runs. This is load-bearing twice over: `loadRequest`/`reload` synchronously invoke
      `didStartProvisionalNavigation`, which takes the same lock (`:1405`), and
      `navigate_webview_on_main_thread` re-locks after `action` returns (`:845-848`). Either one
      deadlocks the main thread against a live guard. `navigate()` at `:913-926` is the in-module
      precedent — same lock, drop, then call ordering.
    - On `LoadLastRequested` with a URL: build `NSURL`/`NSURLRequest` exactly as `navigate()` does
      at `:903` and `:923-926`, log a line in the module's existing `[shell] macos_epic_embed: `
      prefix style stating that a reload arrived before the first commit and the last requested URL
      is being re-issued — **host and scheme at most, never the URL**, and the clearest form is to
      name neither — then `webview.loadRequest(&request)`. If `NSURL::URLWithString` returns `None`,
      log in the shape of `:904` and fall back to `webview.reload()` rather than silently doing
      nothing.
    - Otherwise `webview.reload()`, unchanged.
    No renderer change is needed or wanted: the resulting `didStartProvisionalNavigation` already
    clears `load_timed_out` and un-hides the subview (`:1408-1420`), so the banner clears through
    the path that already exists.

    6. **Instrument** (`did_finish_navigation`, `:1364-1391`). Add an `eprintln!` reporting success
    with the HOST only. `host` is already computed at `:1373-1375` and MOVED into
    `guard.top_level_host` at `:1378`, so log before the lock or use `host.as_deref()`. Give the
    `None` case a non-URL placeholder. The todo's `## Suggested instrument` section is the
    requirement being met here.

    **Doc-comment maintenance** (this module's comments are load-bearing and are read as
    specification):
    - Rewrite `reload()`'s doc comment (`:886-888`). It currently promises the webview's own current
      page via `WKWebView::reload()`; it must now describe both branches and keep the existing
      guarantee that `canGoBack`/`canGoForward` are never touched.
    - Amend `epic_embed_handle_content_process_termination`'s comment (`:1796-1801`), which cites
      "`reload()` is a no-op on a view that never committed a URL" as live justification for leaning
      on the 45 s banner. **That hook keeps its bare `webview.reload()` at `:1815-1817` — do not
      change its behaviour in this task.** Amend the comment to say that the public `reload()` now
      has a first-commit fallback while this hook deliberately still does not, and that the timeout
      re-arm remains its backstop. Record the inconsistency as an open observation in the SUMMARY
      rather than fixing it here: it has no test and no live observation behind it.

    **Do not** add any `Cargo.toml` feature. **Do not touch the two pinned log literals** — the
    load-timeout `eprintln!` at `:548` (format string plus the `EPIC_EMBED_LOAD_TIMEOUT` constant at
    `:96`, which together render what UAT item 16 pins) and the navigation-failure `eprintln!` at
    `:1711` (which UAT item 17 scored `pass` against). Leave all three of those lines byte-identical.
    Those literal texts are deliberately not reproduced here: `<verify>` greps for them, and prose
    pasted into a nearby comment would skew the count — see this task's `<done>` for why the gates
    target the format strings rather than the rendered text. A new literal is ADDED by this task;
    none is edited.
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell epic_embed</automated>
    <automated>cargo fmt --manifest-path src-tauri/Cargo.toml --check</automated>
    <automated>grep -v '^\s*//' src-tauri/src/macos_epic_embed.rs | grep -cF 'macos_epic_embed: {caller} -- {description}'</automated>
    <automated>grep -v '^\s*//' src-tauri/src/macos_epic_embed.rs | grep -cF 'EPIC_EMBED_LOAD_TIMEOUT: Duration = Duration::from_secs(45)'</automated>
    <automated>grep -v '^\s*//' src-tauri/src/macos_epic_embed.rs | grep -cF 'load timed out past {EPIC_EMBED_LOAD_TIMEOUT:?}'</automated>
    <automated>grep -c 'unsafe(method(webView:didCommitNavigation:))' src-tauri/src/macos_epic_embed.rs</automated>
    <automated>grep -c 'epic_embed_reload_action' src-tauri/src/epic_embed_state.rs src-tauri/src/macos_epic_embed.rs</automated>
    <human-check>
      FORMATTER CHECK — deliberately omitted, with the measurement that justifies it.
      `npx prettier --file-info` was run on every path this task writes, at planning time, under the
      repo's pinned prettier:
        src-tauri/src/macos_epic_embed.rs -> { "ignored": false, "inferredParser": null }
        src-tauri/src/epic_embed_state.rs -> { "ignored": false, "inferredParser": null }
      Both report a NULL `inferredParser`: prettier has no parser for `.rs` and matches nothing here.
      `npx prettier --check src-tauri/src/epic_embed_state.rs` was measured directly and exits **2**
      with `[error] No parser could be inferred` — so the mandated check would not merely be
      vacuous on these paths, it would be RED for a reason unrelated to this task.
      Per `Skill("gamelib-conventions")` it is therefore stated and omitted rather than carried as a
      green that proves nothing. `cargo fmt --check` above is the honest analogue, and it was
      measured clean on this tree before any edit, so a failure there is this task's own.
    </human-check>
  </verify>
  <done>
    `cargo test ... epic_embed` reports **50 passed; 0 failed**, with the same **350 filtered out**
    (baseline measured pre-edit: 46 / 0 / 350). `cargo fmt --check` exits 0 with no output.

    The three comment-filtered `grep -cF` gates each return **1** — measured at these exact values
    on the pre-edit tree, so a 0 means the pin was broken and a 2 means prose was pasted into code:
    - the timeout format string (its definition site is `:548`)
    - the 45-second constant (`:96`)
    - the navigation-failure format string (`:1711`)

    **Why those three are pinned as format strings and not as rendered text.** Measured at planning
    time: the runtime literal UAT item 16 pins does NOT exist anywhere in the source — a plain
    `grep -c` for the rendered `45s` form over `macos_epic_embed.rs` returns **0**. The line emits a
    format string interpolating `EPIC_EMBED_LOAD_TIMEOUT`, whose `{:?}` renders the `45s`. A gate
    written against the rendered text would be permanently, confidently green while measuring
    nothing, and it would stay green if the constant were changed to 60 seconds — which would break
    item 16's pin outright. Hence one gate on the format string and a SECOND on the constant: both
    halves have to hold for the runtime literal to be what the UAT arm pins.

    The `webView:didCommitNavigation:` selector attribute appears exactly once, and
    `epic_embed_reload_action` appears in both files (defined in `epic_embed_state.rs`, called from
    `macos_epic_embed.rs`). No `Cargo.toml` diff, no `Cargo.lock` diff.
  </done>
  <reversibility rating="reversible">
    Two additive struct fields, one additive optional delegate hook, and one branch in `reload()`
    whose default arm is the existing behaviour. Revertable by dropping the branch.
  </reversibility>
</task>

<task type="auto">
  <name>Task 2: Close the todo and record the diagnosis on 50-UAT item 16</name>
  <files>.planning/todos/completed/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md, .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md</files>
  <action>
    Load `Skill("gamelib-conventions")` before editing the UAT file — the item-shape rule governs
    this edit and nothing in CI checks it.

    **A. Move and close the todo.** Run, from the checkout root:
    `git mv .planning/todos/pending/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md .planning/todos/completed/`
    Then append a `## Resolution` section to the moved file. Leave the frontmatter alone: the
    `severity`/`platform`/`ready` triad is already present and correct, and `completed/` is exempt
    from the frontmatter gate anyway.

    The `## Resolution` must state, in this repo's measured-vs-reasoned register:
    - **Cause.** `macos_epic_embed::reload()` called `WKWebView::reload()`, which WebKit
      short-circuits on a view whose current document loader has an empty request URL — i.e. one
      that has never committed a main-frame navigation. The module had already written this down at
      `macos_epic_embed.rs:1799-1800` without acting on it.
    - **The discrimination that located it,** since this is the evidence and it is not a re-run:
      Launch 3 applied the hosts blackhole MID-session on an already-committed page and each Reload
      click produced a `didFailProvisionalNavigation -- NSURLErrorCancelled (-999)` line, so the
      native reload fired. Launch 5 applied the blackhole BEFORE launch, nothing ever committed, and
      the confirmed Reload click produced ZERO navigation lines. Same code, opposite outcomes,
      separated by exactly whether a commit had happened.
    - **Fix.** Track `has_committed` (a `didCommitNavigation` hook) and `last_requested_url` (the
      three chrome-side `loadRequest` sites); when nothing has committed, re-issue the last
      requested URL via `loadRequest` instead of `reload()`. The decision is the pure, unit-tested
      `epic_embed_reload_action` in `epic_embed_state.rs`, which compiles and is tested on every OS.
    - **Instrument.** `did_finish_navigation` now logs success with the host only, closing the gap
      the todo's own `## Suggested instrument` section names: until now the delegate spoke only on
      failure, so an absence of log lines could not distinguish a no-op from a silent success.
    - **What is still NOT established, stated as plainly as the cause:** the live recovery arm is
      **UNOBSERVED on hardware** — no Mac has seen this fix repaint the store. And the DNS/connection
      caching confound the todo raises in its own `## Where to look` is **UNMEASURED**: the process
      may have cached the blackholed address for the session's lifetime, which would make a reload
      keep failing legitimately after the hosts revert. Neither is closed by this change. The fix is
      reasoned from WebKit semantics plus the Launch 3 / Launch 5 discrimination. A Mac re-run of
      the recovery half is still owed, with a fresh process after the revert so the two causes
      separate.

    **B. 50-UAT.md item 16.** The `### 16.` heading is at `:443` and its `result:` is the single long
    line at `:446` (`### 17.` follows at `:448`).
    - **APPEND to the END of that one line.** Do not reflow it, do not wrap it, do not insert a line
      break into it.
    - **Keep the opening status word `issue` exactly as it is.** The recovery half is still
      unobserved, so the item's status does not improve. Prose may follow the status word; it may
      never precede it.
    - Do NOT touch the `## Summary` section at `:466` or any count in it.
    - Do NOT edit item 17 — its pinned literal is unchanged by this work.

    The appended prose states: the native cause (a never-committed subview plus WebKit's no-op
    `reload()`), that the quick task `261014-vot` fixed it with a first-commit `loadRequest`
    fallback plus a host-only `didFinishNavigation` success line, the fix commit's real short hash,
    and that a Mac re-run of the recovery half is still owed — with the blackhole applied before
    launch, so the never-committed state is the one actually re-tested, and with a fresh process
    after the hosts revert so the DNS-cache confound is excluded rather than argued about.

    **The commit hash is a real value, not a placeholder.** Commit Task 1 first, read its short hash
    with `git rev-parse --short HEAD`, and write that. Do not leave a placeholder token in the file.

    Do NOT edit `.planning/ROADMAP.md` or `.planning/STATE.md` — the orchestrator owns STATE.
  </action>
  <verify>
    <automated>test -f .planning/todos/completed/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md && test ! -e .planning/todos/pending/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md && echo MOVED</automated>
    <automated>grep -c '^## Resolution' .planning/todos/completed/2026-10-14-epic-embed-subview-does-not-repaint-after-reload.md</automated>
    <automated>awk '/^### 16\./{f=1} f&&/^### 17\./{exit} f&&/^### 16\./{h=1} f&&/^result: issue/{r=1} END{print (h&&r)?"SHAPE-OK":"SHAPE-DRIFT"}' .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md</automated>
    <automated>awk '/^### 16\./{f=1} f&&/^### 17\./{exit} f' .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md | grep -c '^result:'</automated>
    <automated>node -e "const c=require('fs').readFileSync('.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md','utf8');const m=c.match(/^### 16[.].*?(?=^### 17[.])/ms)[0];const r=m.match(/^result: (\S+)/m);console.log('status='+r[1], 'cites_quick='+/261014-vot/.test(m));"</automated>
    <automated>pnpm planning-gates</automated>
    <human-check>
      FORMATTER CHECK — deliberately omitted, with the measurement that justifies it.
      `npx prettier --file-info` at planning time:
        .planning/phases/50-.../50-UAT.md -> { "ignored": true, "inferredParser": null }
        .planning/todos/pending/2026-10-14-epic-embed-...md -> { "ignored": true, "inferredParser": null }
      Both are `"ignored": true` — `.prettierignore` lists `.planning` wholesale. A measured
      `npx prettier --check` on the UAT path exits 0 having matched nothing, which is exactly the
      vacuous green `Skill("gamelib-conventions")` forbids writing into a `<verify>` block. Omitted
      and stated instead. What keeps these two files consistent is hand-matching the surrounding
      corpus: item 16's `result:` stays ONE unwrapped line, and the todo's `## Resolution` matches
      the wrap width already in that file.
    </human-check>
  </verify>
  <done>
    The todo is in `completed/`, absent from `pending/`, and carries exactly one `## Resolution`
    heading naming both the cause and the two things still unmeasured (the live recovery arm, the
    DNS-cache confound). 50-UAT.md item 16 still has `### 16.` at column 0, exactly one `result:`
    line, still opening with the bare word `issue`, now carrying the diagnosis and the real short
    hash of the Task 1 commit. `## Summary` is byte-unchanged. `pnpm planning-gates` passes at its
    12/12 floor.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Epic's page content -> the WKWebView subview | Fully untrusted remote content runs here; it can initiate navigations and so influence delegate-hook timing. |
| The subview -> the Rust shell's `EpicEmbedSurface` state | Delegate callbacks are driven by page activity; what they are permitted to write into shell state is a trust decision. |
| The Rust shell -> `eprintln!` on stderr (`terminal.log`) | Operator-readable, pasted into UAT artifacts and todos. Anything logged is effectively published. |

## STRIDE Threat Register

Threat IDs continue this quick task's own series; the phase-50 `T-50-NN` series is untouched.

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261014-vot-01 | Tampering | `EpicEmbedSurface::last_requested_url` -> `reload()` | medium | mitigate | `reload()` re-issues this URL verbatim, so a page-controlled write would let remote content choose what Reload loads. Mitigated structurally: the field is written at exactly the three CHROME-initiated `loadRequest` sites (`:660-665`, `:715-718`, `:923-926`), whose URLs come from the store-key routing in `main.rs`. No delegate hook and no page-initiated navigation writes it — Task 1's action states this as a hard constraint and the struct field's doc comment records it. Verified by the `grep -n 'epic_embed_reload_action'` gate plus review of the three named sites. |
| T-261014-vot-02 | Information Disclosure | the new `eprintln!` lines in `reload()` and `did_finish_navigation` | medium | mitigate | A store URL can carry a session or campaign identifier in its path or query, and `terminal.log` is pasted verbatim into UAT results and todos. Mitigated by logging the HOST only in `did_finish_navigation` (the `host` variable at `:1373-1375` is already host-only) and by naming no URL at all in the `reload()` fallback line — the module's standing T-28-04 discipline. Task 1's action forbids URL text in both. |
| T-261014-vot-03 | Spoofing | `reload()`'s choice of branch | low | accept | A wrong `has_committed` reading would pick the wrong branch. Both failure modes are benign: a false `true` reproduces today's no-op exactly, a false `false` issues a `loadRequest` for a URL the chrome itself last asked for. Neither loads anything the user did not navigate to, and `epic_embed_reload_action` is total over both booleans with a unit test per combination. |
| T-261014-vot-SC | Tampering | npm/pip/cargo installs | high | mitigate | **No package is installed, added, or upgraded.** `webView_didCommitNavigation` is reachable under features already present in `src-tauri/Cargo.toml` (`WKWebView`, `WKNavigation`, `objc2-app-kit` at `:240`) — verified against the vendored `objc2-web-kit-0.3.2` source at planning time. Task 1 forbids any `Cargo.toml` edit and Task 1's `<done>` requires a zero `Cargo.toml`/`Cargo.lock` diff, so the package-legitimacy gate has nothing to audit. |
</threat_model>

<verification>
From the checkout root:

1. `cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell epic_embed` — 50 passed,
   0 failed, 350 filtered out (baseline was 46 / 0 / 350).
2. `cargo fmt --manifest-path src-tauri/Cargo.toml --check` — exit 0, no output (measured clean
   pre-edit).
3. `git diff --exit-code -- src-tauri/Cargo.toml src-tauri/Cargo.lock` — no diff.
4. `pnpm planning-gates` — passes at its 12/12 floor.
5. The two pinned literals (`load timed out past 45s`, `{caller} -- {description}`) are unchanged;
   one new host-only success literal is added.
6. No `eprintln!` added by this plan contains a URL.
7. Envelope hygiene — the executor greps its own written files for stray closing-tag text before
   committing, per the standing planner/executor leak lesson.

Not verifiable off-hardware, and not claimed: that the Reload now repaints the Epic store. That is
the owed macOS re-run, recorded as such in both the todo's `## Resolution` and 50-UAT item 16.
</verification>

<success_criteria>
- `epic_embed_reload_action` exists in `epic_embed_state.rs` with four passing unit tests, compiled
  and run on every OS (the module is not macOS-gated).
- `reload()` re-issues `last_requested_url` via `loadRequest` when nothing has committed, and is
  otherwise byte-equivalent in behaviour to today's `WKWebView::reload()`.
- A `webView:didCommitNavigation:` hook sets `has_committed`; `close()` and the cold `open()` path
  clear it; neither failure hook touches it.
- `did_finish_navigation` emits a host-only success line.
- No `Cargo.toml` or `Cargo.lock` change.
- The todo is in `completed/` with a `## Resolution` that names the cause, the fix, and both
  unmeasured items (live recovery arm, DNS-cache confound).
- 50-UAT item 16 keeps its shape (`### 16.` at column 0, one `result:` line opening with `issue`)
  and carries the diagnosis plus the real fix-commit short hash; `## Summary` is untouched.
</success_criteria>

<output>
Create `.planning/quick/261014-vot-fix-todo-2026-10-14-epic-embed-subview-d/261014-vot-SUMMARY.md`
when done. Record as open observations: (a) the macOS re-run of UAT item 16's recovery half is owed,
with the blackhole applied pre-launch and a fresh process after the revert; (b)
`epic_embed_handle_content_process_termination` (`:1815-1817`) deliberately keeps a bare
`webview.reload()` with no first-commit fallback, which is now inconsistent with the public
`reload()` — left unchanged in this task because it has neither a test nor a live observation behind
it.
</output>
