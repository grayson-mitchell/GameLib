---
phase: quick-261014-rso
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx
  - src-tauri/src/epic_embed_state.rs
  - src-tauri/src/macos_epic_embed.rs
  - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md
  - .planning/todos/pending/2026-10-14-epic-timeout-banner-fix-needs-a-live-gate-re-run.md
autonomous: true
requirements:
  - G-50-16

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "A single 250 ms drain batch that contains a `loadTimedOut: true` event followed by one or more `loadTimedOut: false` events surfaces `loadTimedOut === true` from the hook. The raise is no longer coalesced away by a later event in the SAME batch. This is the exact live-run shape of G-50-16: raise, then the -999 failure, then the next provisional start, all landing inside one poll interval."
    - "A LATER drain batch carrying only `loadTimedOut: false` still clears the flag. The fix latches within a batch, not forever: D-07's 'a genuine finish clears the banner' survives, and the banner is not made permanently sticky."
    - "A drain batch from a non-Epic surface, which carries no `loadTimedOut` field at all, never latches anything. The merge tests `=== true`, so `undefined` is inert."
    - "A `WKNavigationDelegate` navigation FAILURE no longer clears `load_timed_out`. The other three lifecycle events (provisional start, finish, content-process termination) still clear it. The asymmetry is encoded once, in a cfg-free module, with one unit test per arm, so it is covered by `cargo test --bin gamelib-shell` on BOTH CI legs rather than only the macOS one."
    - "`cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell` reports 0 failed, and `npx jest src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx` reports 0 failed, with the two new named properties present in the output."
    - "G-50-16 stays `status: failed` in 50-UAT.md, annotated with the code fix that landed and with the live-gate re-run it is still waiting on. A `pending/` todo carries that re-run at `severity: major` / `platform: macos` / `ready: live-gate`, and `pnpm planning-gates` passes."
  artifacts:
    - path: "src/frontend/screens/WebView/useStoreEmbedHost.ts"
      provides: "The GAP-D drain merges `loadTimedOut` stickily across every event in one batch before calling `setNavState`, instead of applying only `events[events.length - 1]` wholesale."
      contains: "loadTimedOut"
    - path: "src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx"
      provides: "Property 46 (the observed-red race: a non-empty batch ending in `false` after a `true` raise) and Property 47 (the boundary guard: a later all-false batch still clears)."
    - path: "src-tauri/src/epic_embed_state.rs"
      provides: "`EpicEmbedNavLifecycle` plus `epic_embed_clears_load_timeout`, the one cfg-free table saying which lifecycle events may clear a timeout raise, with a unit test per arm."
      contains: "epic_embed_clears_load_timeout"
    - path: "src-tauri/src/macos_epic_embed.rs"
      provides: "All four `load_timed_out = false` sites consult `epic_embed_clears_load_timeout` instead of clearing unconditionally."
    - path: ".planning/todos/pending/2026-10-14-epic-timeout-banner-fix-needs-a-live-gate-re-run.md"
      provides: "The owed macOS live-gate re-run of UAT Item 16, with the three CI-enforced triage keys."
  key_links:
    - "Rust `load_timed_out` -> `EpicEmbedSurface::nav_flags` -> `epic_nav_state_with_flags` -> the pending nav-event ring -> `storeEmbedTakeNavEvents` -> this hook's 250 ms drain -> `navState.loadTimedOut` -> `StoreEmbedHostState.loadTimedOut` -> `StoreEmbedTimeoutBanner`'s `timedOut` prop. The drain is the one lossy hop in that chain; Task 1 fixes the loss, Task 2 shortens the window in which a loss is possible."
---

<objective>
Fix G-50-16: the Epic embed's `load_timed_out` raise is un-latched, so the 45 s timeout banner
never surfaced on the Phase 50 macOS live gate even though the backend literal fired three times.

Purpose: `StoreEmbedTimeoutBanner` is the only affordance a hung Epic store gives the user
(Reload, Open in browser). D-08's "one timer, one banner" half is currently violated.

Output: a sticky intra-batch merge in the renderer drain, a cfg-free Rust table that stops a
navigation failure from clearing a raise, two new jest properties (one of which is red before the
change), four new Rust unit tests, and the bookkeeping that keeps the owed live-gate re-run
visible.
</objective>

<context>
@.planning/debug/epic-timeout-banner-never-visible.md

Read `## Gaps` -> `G-50-16` only (the file is 76 KB; the block is at :477-509):
@.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md

Project rules that bind this task:
@CLAUDE.md

A knowledge graph exists at `graphify-out/`. Orient with `graphify query "<question>"` before
opening a source file you have not been pointed at. Never read `graphify-out/GRAPH_REPORT.md`
(~324k tokens) or `graphify-out/graph.json` (~13.4M tokens).
</context>

## Diagnosis, re-verified at planning time

Every line number below was re-measured on `a9fdf76ae` (2026-10-14) and is live. If any claim here
is false when you read it, stop and report that rather than build on it.

**The renderer loses the raise.** `src/frontend/screens/WebView/useStoreEmbedHost.ts:310-330` is
the GAP-D drain. At `:321-322` it takes `events[events.length - 1]` and calls `setNavState(latest)`
— the comment at `:319-320` states the intent ("Apply the LAST event only") and the reasoning is
correct for `url`/`host`, which genuinely are superseded states. It is wrong for a one-shot raise.
`:253` derives `const loadTimedOut = navState.loadTimedOut ?? false`, and `:849` exposes it; that
derivation is fine.

**Rust clears the flag at four sites in `src-tauri/src/macos_epic_embed.rs`**, all unconditional:

| line | hook | bumps `nav_generation`? |
|------|------|-------------------------|
| :1378 | `did_finish_navigation` | no |
| :1402 | `did_start_provisional_navigation` | yes, at :1400 |
| :1703 | `epic_embed_handle_navigation_failure` (shared by `didFailNavigation` :1425 / `didFailProvisionalNavigation` :1435) | no |
| :1793 | `epic_embed_handle_content_process_termination` | yes, at :1791 |

**Why `nav_generation` alone cannot carry this fix** — the measurement that chose the mechanism.
`nav_generation` is bumped at exactly two of those four sites (`:1400`, `:1791`). The raise at
`:542` already uses it in the opposite direction (`:532` discards a stale raise). But:

1. Gating a clear on "the generation has not moved" would also stop `did_finish_navigation`
   (`:1378`) from clearing, and that one SHOULD clear — `:1375-1376` says so in the code: a
   slow-but-eventually-successful load must drop the banner (D-07). So a blanket generation gate
   trades this bug for a stuck banner on a recovered page.
2. Even a gate narrowed to the failure hook does not fix the observed run. The live sequence was
   raise -> `-999` failure -> next `didStartProvisionalNavigation`. That last event bumps the
   generation and so clears the flag *legitimately*, and it lands in the same 250 ms batch. The
   batch still ends in `false`, so the renderer still coalesces the raise away.

**Therefore the renderer-side sticky merge is the necessary and sufficient half, and it is where
the race actually is; the Rust half is a real but secondary durability improvement.** Both are
planned, in that order, with the renderer first because it is the half that makes the banner
appear. They cover different orderings: the merge covers raise-and-reset-in-one-batch (the
observed run); the Rust change covers a `-999` failure landing in a batch LATER than the raise,
where an intra-batch merge sees only the `false`.

The Rust change narrows to one claim: **a navigation failure must never clear a raise.** This is
behaviour-preserving everywhere except the bug. Every navigation gets a
`didStartProvisionalNavigation` first, and that hook already clears the flag, so the only state in
which the failure hook finds the flag set is "the navigation that just failed is the one that
timed out" — the hang's own conclusion, for which the banner (Reload / Open in browser) is the
correct UI. `nav_started_at = None` at `:1702` stays, so the monitor cannot re-raise (`:509`
requires `nav_started_at.is_some()`).

**Out of scope, deliberately:**

- `applyNavResult` at `:227` (`setNavState(result.navState)`, the direct-return path). The gap's
  own `ruled_out` list covers stale-invoke-reply clobbering and the prompt instructs not to
  re-investigate it. Do not touch it.
- The toolbar Reload `SvgButton` at `src/frontend/components/UI/StoreEmbedControls/index.tsx:107-113`
  stays enabled during a hung load. Back (`:95`) and forward (`:102`) keep their `disabled` props;
  Reload keeps having none. That asymmetry is a closed decision — do not add a `disabled` prop.
- Re-running the macOS live gate. This task ends at a green test suite. Task 3 files the owed run.
- Item 17's `-999` explanation, already corrected in `50-UAT.md:451`.

## Measured baselines (all on `a9fdf76ae`, 2026-10-14, all commands run from the checkout root)

| command | baseline |
|---------|----------|
| `npx jest src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx` | 1 suite passed, **56 passed / 56 total** |
| `cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell` | **390 passed; 0 failed; 2 ignored** |
| `pnpm codecheck` | exit 0 |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | exit 0, no output |
| `npx prettier --check` on the two TS paths | "All matched files use Prettier code style!" |
| `pnpm planning-gates` | 12/12 passed |

Counts are context for comparison, not gates. Pin `0 failed` plus the presence of the new test
names; do not pin a total, because a concurrent change to either suite would make an exact pin
unsatisfiable rather than merely stale.

The highest existing jest property number in `useStoreEmbedHost.test.tsx` is **45** (`:1752`), so
the new ones are **46** and **47**. Property 26 (`:1256-1282`) is the existing neighbour and the
`drainEpicNavEvent` helper at `:1232-1254` is the existing single-event shape to model on.

## Formatter check, decided per `Skill("gamelib-conventions")` (probed under prettier 3.7.4, today)

| path | `npx prettier --file-info` | so the check is |
|------|---------------------------|-----------------|
| `src/frontend/screens/WebView/useStoreEmbedHost.ts` | `{ "ignored": false, "inferredParser": "typescript" }` | **run it** |
| `src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx` | `{ "ignored": false, "inferredParser": "typescript" }` | **run it** |
| `src-tauri/src/epic_embed_state.rs` | `{ "ignored": false, "inferredParser": null }` | **omitted** — prettier has no Rust parser. `npx prettier --check src-tauri/src/epic_embed_state.rs` ERRORS: `[error] No parser could be inferred`. Measured today. Use `cargo fmt -- --check` instead; it is the real formatter for these paths. |
| `src-tauri/src/macos_epic_embed.rs` | `{ "ignored": false, "inferredParser": null }` | same — `cargo fmt -- --check` |
| `.planning/phases/50-.../50-UAT.md` | `{ "ignored": true, "inferredParser": null }` | **omitted** — prettier-ignored, so a `--check` over it would prove nothing. Hand-match the surrounding corpus's indentation instead. |
| `.planning/todos/pending/...md` | under prettier-ignored `.planning` | **omitted**, same reason. `pnpm planning-gates` is the real gate for this file. |

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Sticky intra-batch loadTimedOut merge in the GAP-D drain, plus the regression test for the uncovered race</name>
  <files>src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx, src/frontend/screens/WebView/useStoreEmbedHost.ts</files>
  <behavior>
    Two new properties in the Epic nav-signal section of `useStoreEmbedHost.test.tsx`, placed
    directly after property 27 so they sit with the other `loadTimedOut` properties rather than at
    the end of the file.

    - **Property 46 — the observed-red one, and the whole reason G-50-16 shipped.** One drain tick
      resolves a NON-EMPTY batch of three events in this order, reproducing the live run:
      `[{ loadTimedOut: true }, { loadTimedOut: false }, { loadTimedOut: false }]`, each otherwise
      shaped like `drainEpicNavEvent`'s single event (same url/host/canGoBack/canGoForward,
      `surface: 'epic'`). After the tick, the hook must report `loadTimedOut === true`.
      RED BEFORE THE FIX: today's drain applies `events[events.length - 1]`, so this reads `false`
      and the assertion fails. Mock the batch with one `storeEmbedTakeNavEvents.mockResolvedValueOnce`
      and advance 250 ms, matching `drainEpicNavEvent`'s own `advanceTimersByTime(250)` plus two
      `await Promise.resolve()` ticks.
    - **Property 47 — the boundary guard, green both before and after.** Surface a raise first
      (reuse `drainEpicNavEvent` with `{ loadTimedOut: true }`), assert `true`, then drain a second
      NON-EMPTY batch carrying only `{ loadTimedOut: false }` and assert the flag is now `false`.
      This pins that the fix latches within a batch and not forever: a genuine finish must still
      drop the banner (D-07). State in its comment that it is a guard against over-fixing, not an
      observed-red property — do not claim a red it does not have.

    Property 26 at `:1260-1282` (empty tick cannot erase) and property 27 must stay byte-for-byte
    unchanged and green.
  </behavior>
  <action>
**1. Confirm the diagnosis before changing anything.** Read `useStoreEmbedHost.ts:306-337` (the
drain), `:253` (the `loadTimedOut` derivation) and `:216-230` (`navState` plus `applyNavResult`).
Confirm the drain applies only the last event and that `loadTimedOut` is an optional field on the
nav-state type. If either is false, stop and report it.

**2. RED.** Add properties 46 and 47 to `useStoreEmbedHost.test.tsx` after property 27, following
the file's house comment style: each property's comment names the mutation that turns it red (for
46) or states plainly that it is a boundary guard (for 47). Run the scoped suite and keep the
output: property 46 must FAIL on its assertion, and the other 56 must pass. If 46 passes before
you touch production code, the test does not reproduce the race — fix the test, do not proceed.

**3. GREEN.** In the drain's `.then((events) => ...)` handler, keep `events[events.length - 1]` as
the base state for every other field, then merge the raise stickily across the batch before
calling `setNavState`: if any event in `events` has `loadTimedOut` strictly equal to `true`, set
state to that base with `loadTimedOut` forced to `true`; otherwise set the base unchanged. Use
strict equality against `true`, not truthiness, so a non-Epic batch (where the field is absent on
every event, per the REQUIRED-on-epic / FORBIDDEN-otherwise coercion in
`src/backend/sidecar/storeEmbedFlowRegistration.ts:146-162`) latches nothing. Leave the existing
`if (latest) ...` empty-batch guard intact — property 26 depends on it.

**4. Document the asymmetry at the call site.** Rewrite the "Apply the LAST event only" comment at
`:319-320` so it says both halves: superseded fields take the newest value, and a one-shot raise is
merged across the batch instead. Cite G-50-16 and point at the `blocked_launcher_scheme_count`
comment at `:256-261`, which is the same coalescing problem solved for a counter — this is the
boolean case that was left without the equivalent protection.

Do not touch `applyNavResult` at `:227`, and do not add a second poll loop, a new ref, or a new
state slot. The merge is a pure expression over the batch the drain already has in hand.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx prettier --check src/frontend/screens/WebView/useStoreEmbedHost.ts src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx</automated>
  </verify>
  <done>
The scoped jest run reports 0 failed, and properties `46.` and `47.` both appear in its output as
passing (baseline for comparison: 56 passed; this suite is SCOPED to one file and a green here is
not a suite-wide pass). The RED evidence from step 2 shows property 46 failing before the
production edit — record the assertion text in the SUMMARY. `pnpm codecheck` exits 0. Prettier
reports both TS paths clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: Stop a navigation failure from clearing a timeout raise, via a cfg-free lifecycle table</name>
  <files>src-tauri/src/epic_embed_state.rs, src-tauri/src/macos_epic_embed.rs</files>
  <action>
**1. Add the table to `src-tauri/src/epic_embed_state.rs`** (cfg-free, alongside
`EpicEmbedNavFlags` at `:91-96` and `epic_nav_state_with_flags` at `:102`):

- An `EpicEmbedNavLifecycle` enum with one variant per hook that can end a navigation:
  provisional-navigation-started, navigation-finished, navigation-failed,
  content-process-terminated. Derive `Debug, Clone, Copy, PartialEq, Eq`, matching
  `EpicEmbedNavFlags`'s own derives.
- `epic_embed_clears_load_timeout(event: EpicEmbedNavLifecycle) -> bool`, returning `false` for
  the failure variant and `true` for the other three. Keep both items `pub(crate)`, matching the
  module's existing visibility.
- A doc comment carrying the reasoning, in the module's established voice: every navigation gets a
  provisional-start callback first and that hook already clears the flag, so the only state in
  which the failure hook finds the flag set is that the navigation which just failed is the one
  that timed out. That is the hang's own conclusion, and the banner is the right UI for it. Name
  G-50-16 and note that the renderer's intra-batch merge (Task 1) is the other half: the next
  provisional start still clears the flag legitimately, so this change alone would not surface the
  banner.
- Four unit tests in the existing `#[cfg(test)] mod tests` block (`:126`), one per variant, in the
  module's existing naming style (snake-case sentences, no `test_` prefix).

**2. Route all four call sites in `src-tauri/src/macos_epic_embed.rs` through it.** Extend the
import brace list at `:62-64` with the two new names. Then at each of `:1378`
(`did_finish_navigation`), `:1402` (`did_start_provisional_navigation`), `:1703`
(`epic_embed_handle_navigation_failure`) and `:1793`
(`epic_embed_handle_content_process_termination`), guard the existing
`guard.load_timed_out = false;` on `epic_embed_clears_load_timeout(<that site's variant>)`. All
four sites consult the table so the asymmetry is stated once and the behaviour of each hook is
readable where it lives; only the failure site changes behaviour.

Leave everything else alone: `nav_started_at` assignments, the `nav_generation` bumps at `:1400`
and `:1791`, the raise at `:542`, the monitor's pre-check at `:508` and re-check at `:535`, and the
`load_timed_out: bool` field type at `:285`. No new field, no type change.

**3. Update the two stale doc comments** that now describe the old behaviour:
- the `load_timed_out` field comment at `:281-285` ("Cleared by the next
  `didStartProvisionalNavigation` or by `didFinishNavigation`/either failure hook") — the failure
  hooks no longer clear it;
- the shared failure-handler comment at `:1692-1696` ("a genuine failure is NOT a timeout — it
  clears `nav_started_at`/`load_timed_out`") — it still clears the clock, no longer the flag.

**Why this module and not a test inside `macos_epic_embed.rs`** — measured, and it corrects the
framing in the task brief. `.github/workflows/rust-test.yml:79` runs
`cargo test --bin gamelib-shell` on a matrix of `[windows-latest, macos-latest]`. There is **no
Linux leg** at all (the workflow says so itself in its own "What this does NOT catch" note, around
`:56`). So the real discriminator is the **windows-latest** leg, not Linux: a
`#[cfg(target_os = "macos")]`-gated test runs on one leg, a cfg-free test in `epic_embed_state.rs`
runs on both. Put the logic in the cfg-free module.
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell</automated>
    <automated>cargo fmt --manifest-path src-tauri/Cargo.toml -- --check</automated>
    <automated>test "$(grep -v '^[[:space:]]*//' src-tauri/src/macos_epic_embed.rs | grep -c 'epic_embed_clears_load_timeout(')" -eq 4</automated>
  </verify>
  <done>
`cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell` reports **0 failed** with the
four new lifecycle tests named in its output (baseline for comparison: 390 passed / 0 failed / 2
ignored). `cargo fmt -- --check` exits 0. The comment-stripped count of
`epic_embed_clears_load_timeout(` call sites in `macos_epic_embed.rs` is exactly 4 — the grep
filters `//` lines first, so doc comments and the import line cannot inflate it. Prettier is
deliberately NOT run over these paths: it reports `inferredParser: null` for `.rs` and
`npx prettier --check` over one errors with "No parser could be inferred", so `cargo fmt` is the
formatter gate here.
  </done>
</task>

<task type="auto">
  <name>Task 3: Record the fix against G-50-16 and file the owed macOS live-gate re-run</name>
  <files>.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md, .planning/todos/pending/2026-10-14-epic-timeout-banner-fix-needs-a-live-gate-re-run.md</files>
  <action>
**1. Annotate the G-50-16 gap block** at `50-UAT.md:477-509`. Keep `status: failed` — the code fix
is not a live observation and the gate has not been re-run. Add one `fix_applied:` key beside the
existing keys, at the same 2-space indentation as `root_cause:`/`debug_session:`, recording: the
renderer sticky intra-batch merge in `useStoreEmbedHost.ts`, the cfg-free
`epic_embed_clears_load_timeout` table and the failure hook that no longer clears the flag, the
two new jest properties (46, 47) with 46 named as the observed-red one, the four new Rust unit
tests, and that re-verification is gated on a macOS live-gate re-run of Item 16, naming the todo
file from step 2. Also strike the last `missing:` bullet (the toolbar-Reload question) and record
its resolution: the Reload stays enabled during a hung load, clicking through a hang is an accepted
operator action the banner must survive.

Edit only the `G-50-16` block. Do not touch any `### N.` item heading, any `expected:` line, or
any `result:` line anywhere in this 509-line file — the item shape those follow is a repo
convention with no CI gate behind it, so a stray edit there is both easy and unnoticed.

**2. File the live-gate todo** at
`.planning/todos/pending/2026-10-14-epic-timeout-banner-fix-needs-a-live-gate-re-run.md`. Copy the
frontmatter key order used by the existing pending todos — `created`, `title`, `area`, `severity`,
`platform`, `ready`, `found_by`, `files` — and carry the three CI-enforced keys bare, lowercase and
exact, in that order:

    severity: major
    platform: macos
    ready: live-gate

(`major`: the gap's own severity, and the banner is the only affordance a hung Epic store offers.
`macos`: the raw-WKWebView embed only exists there. `live-gate`: it needs the operator's Mac and a
scoped host block.) `/gsd-add-todo`'s template omits all three — add them by hand.

The body states what to re-run (UAT Item 16: scoped `/etc/hosts` blackhole of
`store.epicgames.com` and `www.epicgames.com`, open Stores -> Epic, watch the slot through the
first 45 s window), what now has to be observed (the banner appears, with Reload and Open in
browser on one row at minimum window width), the three UI-SPEC items the original failure left
unverified (listed under `also_unverified_because_of_this` in the gap block), and the recovery half
(revert the hosts entry, click Reload in the banner, the store repaints).

One known hazard to write into the todo, from this project's own live-gate history: a running
`pnpm tauri:dev` relaunches on every commit and will consume an as-found fixture. Ask the operator
to quit any live dev instance before the arm.
  </action>
  <verify>
    <automated>pnpm planning-gates</automated>
    <automated>test -f .planning/todos/pending/2026-10-14-epic-timeout-banner-fix-needs-a-live-gate-re-run.md</automated>
    <automated>grep -c 'fix_applied:' .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md</automated>
  </verify>
  <done>
`pnpm planning-gates` passes (baseline for comparison: 12/12, including
`.planning/todos/todo-frontmatter-gate.py`). The todo exists and carries `severity: major`,
`platform: macos`, `ready: live-gate` bare and in that order. The gap block has one `fix_applied:`
key and still reads `status: failed`. No prettier check is run over either path: `.planning` is
prettier-ignored (`{ "ignored": true, "inferredParser": null }`, measured), so a `--check` there
would carry a green that proves nothing.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Rust nav-event ring -> `storeEmbedTakeNavEvents` -> renderer drain | The only boundary this plan touches. It carries app-generated state (a boolean the shell's own timeout monitor set), never page-controlled content, and it already exists — no port, channel, field or call site is added. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261014-rso-01 | Information Disclosure | this change's total attack surface | low | accept | **No new attack surface, and here is the reason rather than the assertion:** the change is a local UI-state latch. It adds no IPC channel, command or event; no nav-state field (`loadTimedOut` already crosses, Phase 50 Plan 02); no network call, credential, token, file or process. The renderer edit is a pure expression over an array the drain already holds. The Rust edit removes one assignment and adds a pure total function over a four-variant enum with no I/O. Nothing page-controlled reaches either: `loadTimedOut` is set only by `spawn_load_timeout_monitor` (`macos_epic_embed.rs:542`) from the shell's own clock, and the renderer's merge tests `=== true` so an absent or non-boolean field is inert. |
| T-261014-rso-02 | Spoofing | `StoreEmbedTimeoutBanner` shown when the page actually loaded | low | mitigate | An over-eager latch would leave the banner over a working store page, which is a misleading claim about app state. Property 47 (Task 1) pins that a later all-false batch still clears the flag, and `did_finish_navigation` (`:1378`) keeps clearing it, so a recovered page drops the banner. The latch is per-batch, never permanent. |
| T-261014-rso-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed, added or upgraded. No `package.json` or `Cargo.toml` dependency change, so the package-legitimacy gate has nothing to audit. |
</threat_model>

<verification>
From the checkout root:

1. `npx jest src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx` — 0 failed,
   properties 46 and 47 present. SCOPED to one suite; this is not a suite-wide pass. The tree's
   full baseline is 547 suites / 11894 tests passing, 3 skipped, 0 failed (measured on
   `8d32de558`); run `pnpm test` before pushing if you want that claim.
2. `cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell` — 0 failed, the four new
   lifecycle tests present.
3. `pnpm codecheck` — exit 0.
4. `npx prettier --check src/frontend/screens/WebView/useStoreEmbedHost.ts src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx` — clean.
5. `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — exit 0.
6. `pnpm planning-gates` — passes.

Not verified by anything here, and stated plainly: that the banner actually appears on a hung Epic
store. That needs the macOS live gate, which Task 3 files as an owed run. Jest exercises the drain
at the `storeEmbedTakeNavEvents` mock seam, not a real IPC round trip; the Rust tests exercise a
pure function, not a `WKNavigationDelegate` callback.
</verification>

<success_criteria>
- A non-empty drain batch whose last event carries `loadTimedOut: false`, arriving after a `true`
  raise in the same batch, surfaces `loadTimedOut === true` from the hook.
- That property was observed RED before the production edit, with the failing assertion recorded.
- A later all-false batch still clears the flag.
- A navigation failure no longer clears `load_timed_out`; the other three lifecycle hooks still do;
  the decision lives in a cfg-free module with a test per arm.
- All six verification commands above are green.
- G-50-16 stays `status: failed`, annotated with the fix and the owed live-gate re-run, which exists
  as a `pending/` todo with the three triage keys.
</success_criteria>

<output>
Create `.planning/quick/261014-rso-latch-epic-embed-load-timed-out/261014-rso-SUMMARY.md` when done.
Record in it: the RED assertion text from Task 1 step 2, the measured before/after counts for both
test suites, and any claim in `## Diagnosis` that turned out to be false.
</output>
