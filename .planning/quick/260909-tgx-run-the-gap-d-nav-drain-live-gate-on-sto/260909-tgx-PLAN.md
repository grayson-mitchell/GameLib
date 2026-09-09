---
phase: quick-260909-tgx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260909-tgx-run-the-gap-d-nav-drain-live-gate-on-sto/260909-tgx-LIVE-GATE.md
  - .planning/quick/260909-tgx-run-the-gap-d-nav-drain-live-gate-on-sto/260909-tgx-SUMMARY.md
  - .planning/todos/pending/2026-09-05-confirm-the-gap-d-nav-drain-on-store-gog-on-real-hardware.md
  - .planning/todos/completed/2026-09-05-confirm-the-gap-d-nav-drain-on-store-gog-on-real-hardware.md
  - .planning/todos/completed/2026-09-05-in-embed-navigation-never-reaches-the-renderer-back-forward-de.md
  - .planning/todos/pending/2026-09-05-in-embed-navigation-never-reaches-the-renderer-back-forward-de.md
autonomous: false
requirements: [REQ-40-06]

must_haves:
  truths:
    - "The bundle the gesture ran against is proven to post-date the GAP-D fix commits, by measured mtime, not by assumption"
    - "The gesture's outcome is recorded verbatim from an operator who witnessed it, never composed by an agent"
    - "Back-enablement and host-label movement are recorded as two independent observations, not collapsed into one verdict"
    - "A gesture that could not measure the drain is recorded as NOT MEASURED, never as FAIL"
    - "The pending confirm-todo leaves pending/ on any measured outcome; a FAIL additionally reopens the original defect todo out of completed/"
    - "`pnpm planning-gates` is green after the todo moves"
  artifacts:
    - path: ".planning/quick/260909-tgx-run-the-gap-d-nav-drain-live-gate-on-sto/260909-tgx-LIVE-GATE.md"
      provides: "Preconditions (measured), the verbatim gesture record, and the verdict"
      contains: "VERDICT"
    - path: ".planning/quick/260909-tgx-run-the-gap-d-nav-drain-live-gate-on-sto/260909-tgx-SUMMARY.md"
      provides: "Quick task summary naming the verdict and where each todo landed"
  key_links:
    - from: "260909-tgx-LIVE-GATE.md"
      to: "src-tauri/target/release/bundle/macos/GameLib.app"
      via: "recorded sha256 + mtime of the exact binary under test"
      pattern: "sha256"
    - from: "260909-tgx-LIVE-GATE.md"
      to: "2026-09-05-confirm-the-gap-d-nav-drain-on-store-gog-on-real-hardware.md"
      via: "verdict drives which directory the todo lands in"
      pattern: "confirm-the-gap-d-nav-drain"
---

<objective>
Run the one outstanding manual gesture from quick `260905-e61`'s second definition-of-done line —
on `/store/gog`, does an in-page link click enable Back and move the host label off the affiliate
host — and record the outcome verbatim.

Purpose: this is the **confirmation of a shipped fix**, not a defect hunt. The automated half is
already green (`260905-e61-SUMMARY.md` §Verification). One live observation on real macOS hardware
is all that stands between the queue and closure.

Output: `260909-tgx-LIVE-GATE.md` (preconditions, verbatim observations, verdict), the pending
confirm-todo resolved out of `pending/`, and — only on a FAIL — the original defect todo reopened
out of `completed/`.

**Nothing in this plan changes product code.** The deliverables are records.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-09-05-confirm-the-gap-d-nav-drain-on-store-gog-on-real-hardware.md
@.planning/quick/260905-e61-fix-gap-d-in-embed-navigation-never-reac/260905-e61-SUMMARY.md
@.planning/todos/completed/2026-09-05-in-embed-navigation-never-reaches-the-renderer-back-forward-de.md
@CLAUDE.md

<established_facts>
Do not re-derive these. Do not plan work to re-check them.

- The GAP-D fix landed in `b1fb9da27` / `1a98652ca` / `b4de6820a`, all on **2026-09-05 between
  10:27 and 10:28 +1200**. `b4de6820a` (the renderer drain poll) is the latest at
  **2026-09-05T10:28:18+1200**. That timestamp is this plan's freshness floor.
- The bundle that sat at `src-tauri/target/release/bundle/macos/` before this session
  (`GameLib.app.tar.gz`, 2026-09-05 07:52) **pre-dates all three fix commits**. Running the
  gesture against it would reproduce the pre-fix frozen chrome and record a **false FAIL**. It is
  not a fallback. Neither is `tauri:dev` (serves from Vite, stale static bundle) nor
  `tauri build --debug` (runs node, not the SEA sidecar).
- A fresh release build (`vite build && build:sidecar-sea && build:decompress-worker-dev &&
  tauri build`) was started in the background before this plan was written. Task 1 does not build;
  it **measures** whatever is on disk and refuses to proceed if it is not fresh enough.
- The 250 ms drain poll means the chrome updates up to a quarter-second after the page lands.
  That lag is the designed feel, not a defect. Scoring the click instantly is how a correct fix
  gets recorded as a FAIL.
</established_facts>

<record_shapes>
Resolved todos in this repo move to `.planning/todos/completed/` and carry the resolution in
frontmatter. Two live shapes, both acceptable — match a sibling, do not invent a third:

- `.planning/todos/completed/2026-09-05-in-embed-navigation-never-reaches-the-renderer-back-forward-de.md`
  uses `resolved_by:` / `resolved_date:` / `resolution:` as separate keys.
- `.planning/todos/completed/2026-09-06-queued-gog-playtime-never-drains-at-boot.md`
  carries the whole resolution prose inside a quoted `status:` value.

`.planning/todos/todo-frontmatter-gate.py` (run by `pnpm planning-gates`, and it runs in CI)
requires `severity` / `platform` / `ready` on **every** file in `pending/`, matched **bare,
lowercase, exact**, from closed vocabularies:

    severity: critical | major | medium | minor
    platform: macos | windows | linux | any
    ready:    code | live-gate | human | blocked

Scope is `pending/` only; `completed/` is deliberately exempt. **Never widen a vocabulary to admit
a value that failed** — the gate's own docstring forbids it in those words.
</record_shapes>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Prove the bundle under test post-dates the fix and actually contains it</name>
  <files>.planning/quick/260909-tgx-run-the-gap-d-nav-drain-live-gate-on-sto/260909-tgx-LIVE-GATE.md</files>
  <action>
Create the LIVE-GATE record and fill its `## Preconditions` section with **measured** values only.
Every number below is copied from command output. Predicting one and then observing it later is
the failure mode this task exists to prevent.

Set `APP=src-tauri/target/release/bundle/macos/GameLib.app` and `BIN=$APP/Contents/MacOS/GameLib`.

1. **Existence.** If `$BIN` does not exist, **STOP the plan here** and report that the release
   build has not finished. Do not un-tar `GameLib.app.tar.gz`, do not fall back to `tauri:dev`,
   do not fall back to `--debug`. Any of those three records a result about a binary that is not
   the one under test.

2. **Freshness.** Record `stat -f '%Sm' -t '%Y-%m-%dT%H:%M:%S' "$BIN"` verbatim. It must be later
   than **2026-09-05T10:28:18** (`b4de6820a`). If it is earlier, this is the stale pre-fix bundle
   — STOP, per the same rule as (1).

3. **Identity.** Record `shasum -a 256 "$BIN"` and `git rev-parse HEAD`, both verbatim. These pin
   *which* binary the operator's observations in Task 2 describe.

4. **Content proof, Rust side.** The drain arm is a string literal in `main.rs`:

       strings -a "$BIN" | grep -c 'store_embed_take_nav_events'

   Record the count. Also record the **corpus size** (`strings -a "$BIN" | wc -l`) on the same
   line. A count with no corpus size is unfalsifiable: a zero from an empty corpus means the
   search was broken, not that the fix is absent.

5. **Content proof, renderer side.** Search `$APP/Contents/Resources` for the seam method
   `takeNavEvents`, and, because minification may rename a property, also for the channel constant
   `RUST_STORE_EMBED_TAKE_NAV_EVENTS`. Record both counts, which files matched, and the corpus
   size (count of files searched). **At least one of the two must be non-zero.**

6. **Anti-vacuity rule for (4) and (5).** If a grep returns 0, do not write "the fix is absent"
   until you have shown its corpus was non-empty. A zero over an empty corpus is a broken search;
   record it as `SEARCH BROKEN`, not as evidence about the fix.

If steps 2, 4 and 5 all pass, write `PRECONDITIONS: MET` into the record and leave the
`## Observations` and `## Verdict` sections **empty with an explicit placeholder** reading
`AWAITING OPERATOR — an agent that did not witness this run must not fill this in.`
  </action>
  <verify>
    <automated>APP=src-tauri/target/release/bundle/macos/GameLib.app; BIN="$APP/Contents/MacOS/GameLib"; test -x "$BIN" && test "$(stat -f '%m' "$BIN")" -gt "$(date -j -f '%Y-%m-%dT%H:%M:%S%z' '2026-09-05T10:28:18+1200' '+%s')" && test "$(strings -a "$BIN" | grep -c 'store_embed_take_nav_events')" -ge 1 && grep -q 'PRECONDITIONS: MET' .planning/quick/260909-tgx-run-the-gap-d-nav-drain-live-gate-on-sto/260909-tgx-LIVE-GATE.md</automated>
  </verify>
  <done>
`260909-tgx-LIVE-GATE.md` exists with a `## Preconditions` section holding the measured mtime,
sha256, HEAD sha, and both content-proof counts each paired with its corpus size. `## Observations`
and `## Verdict` carry the AWAITING OPERATOR placeholder and nothing else.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Nothing was built by this task. Task 1 proved the packaged binary at
`src-tauri/target/release/bundle/macos/GameLib.app` post-dates the GAP-D fix and carries the
drain arm. What remains is the one gesture that has never been run.

**This checkpoint may not be auto-answered.** `autonomous: false` on this plan is load-bearing:
a live gate's outcome must come from whoever watched the screen. An agent that did not witness
the run writes nothing into `## Observations`.
  </what-built>
  <how-to-verify>
Launch the packaged app **from the bundle Task 1 pinned**, with a log, so the record has one:

    src-tauri/target/release/bundle/macos/GameLib.app/Contents/MacOS/GameLib 2>&1 \
      | tee .planning/quick/260909-tgx-run-the-gap-d-nav-drain-live-gate-on-sto/gamelib-gate.log

Then:

1. Navigate to `/store/gog`. **Read the host label in the embed chrome and write down exactly
   what it says, character for character.**

2. **Negative-control precondition — check this before clicking anything.** The gesture only
   measures the drain if the label starts on a host the click will move it *off*. Expect
   `af.gog.com`. If the label already reads `www.gog.com` at step 1, this run measures nothing
   about in-embed navigation: pick a link whose destination host differs from the label's current
   host, or record the run as **NOT MEASURED**. A pass scored over a label that never had
   anywhere to move is a pass covering an unreachable surface.

3. Note whether **Back is enabled or greyed out** at this point, before the click.

4. Click any in-page link. **Do not press Reload at any point** — Reload resynchronises the chrome
   by another route entirely and would make the observation say nothing about the drain.

5. **Wait at least one full second** after the page lands before scoring anything. The drain polls
   every 250 ms; scoring instantly can record a correct fix as a FAIL.

6. Record **three** things, independently — do not collapse them into a single verdict:
   - (a) Back button: enabled, or still greyed out?
   - (b) Host label after: exactly what does it read now?
   - (c) Roughly how long after the click did each change (immediate, under a second, a second or
     two, never)?

**Three outcomes are legitimate. Report whichever actually happened:**

- **PASS** — Back became enabled AND the host label moved to track the page shown.
- **FAIL** — either or both stayed frozen. Say *which*; (a) and (b) can disagree and that
  distinction is diagnostic.
- **NOT MEASURED** — the app would not start, `/store/gog` would not load, the network was down,
  or the step-2 precondition did not hold. This is **not** a FAIL. A gate that could not measure
  anything must never be recorded as a failed one.

Paste your raw observations back verbatim, including anything odd you noticed that this script did
not ask about. Also paste the tail of `gamelib-gate.log` if anything looked wrong.
  </how-to-verify>
  <resume-signal>Report the outcome as PASS, FAIL, or NOT MEASURED, with your verbatim observations for (a), (b) and (c).</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Record the outcome verbatim and settle the queue on the branch that actually happened</name>
  <files>.planning/quick/260909-tgx-run-the-gap-d-nav-drain-live-gate-on-sto/260909-tgx-LIVE-GATE.md, .planning/todos/pending/2026-09-05-confirm-the-gap-d-nav-drain-on-store-gog-on-real-hardware.md, .planning/todos/completed/2026-09-05-in-embed-navigation-never-reaches-the-renderer-back-forward-de.md</files>
  <action>
Write the operator's words into `## Observations` **verbatim** — quoted, not paraphrased, not
tidied. Then set `## Verdict` to exactly one of `VERDICT: PASS`, `VERDICT: FAIL`, or
`VERDICT: NOT MEASURED`, and record observations (a), (b) and (c) as three separate lines so a
later reader can see which half moved if only one did.

Then take **one** of these three branches.

**Branch PASS**

1. `git mv` the pending confirm-todo to `.planning/todos/completed/`. Add the resolution in a
   sibling's shape (see `<record_shapes>`): `resolved_by: 260909-tgx`, `resolved_date: 2026-09-09`,
   and a `resolution:` line naming the verdict and pointing at `260909-tgx-LIVE-GATE.md`. Leave
   `severity`/`platform`/`ready` in place — harmless in `completed/`, and deleting them loses the
   triage history.
2. **Correct the now-false prose in the already-completed defect todo**
   `2026-09-05-in-embed-navigation-never-reaches-the-renderer-back-forward-de.md`. Two edits, and
   both matter because that file is the record a future reader hits first:
   - its `resolution:` frontmatter line currently ends `...the live /store/gog confirmation
     remains OUTSTANDING.` That becomes false on a PASS. Amend it to record the confirmation, with
     the date and this quick id.
   - its Definition of done section's second box is `- [ ] **Manual confirmation on /store/gog**
     ... **NOT DONE**`. Tick it and replace the NOT DONE clause with the measured outcome. A stale
     "NOT DONE" left standing sends the next reader to re-run a gate that has now been run.
3. Do **not** file any new todo.

**Branch FAIL**

1. The confirm-todo's DoD is "run once, outcome recorded verbatim (**pass or fail**)". A FAIL
   satisfies it. `git mv` it to `completed/` exactly as in the PASS branch, with a `resolution:`
   that names the FAIL and points at the record.
2. **Reopen the original defect todo rather than filing a new item**, as its own DoD instructs:
   `git mv .planning/todos/completed/2026-09-05-in-embed-navigation-never-reaches-the-renderer-back-forward-de.md`
   into `.planning/todos/pending/`.
3. **That move will redden `pnpm planning-gates` unless its frontmatter is brought into the
   pending vocabulary first.** As it stands the file has `severity: high` — which is *not* in the
   closed set `{critical, major, medium, minor}` — and carries **no** `platform:` and **no**
   `ready:` key at all. Fix the file, never the gate. Default mapping:
   - `severity: high` → `severity: major`
   - add `platform: macos` (this is the hardware that can reproduce it)
   - add `ready: live-gate` (any candidate fix needs this same gesture to confirm it)
   Place `platform:` immediately after `severity:` and `ready:` immediately after `platform:`,
   per CLAUDE.md. **Record the `high` → `major` flattening as an explicit line in
   `260909-tgx-LIVE-GATE.md`** so the loss of that spelling is deliberate and visible rather than
   silent.
4. Amend that file's `resolution:` line to state that the fix's automated half held but the live
   gate failed on 2026-09-09, keeping the `260905-e61` history rather than deleting it. Untick its
   second DoD box's outcome accordingly and record what was actually observed.

**Branch NOT MEASURED**

1. Move **nothing**. Both todos stay exactly where they are.
2. Record in `260909-tgx-LIVE-GATE.md` precisely why the run could not measure the drain, and what
   would have to be true to retry.
3. Append a short "unrun, retry needed" note to the pending confirm-todo — it stays in `pending/`,
   so keep its three triage keys valid.

Finally, write `260909-tgx-SUMMARY.md`. It must state the verdict, the sha256 of the binary the
verdict is about, and where each of the two todo files ended up. Do not describe the fix; it
shipped four days ago and is described in `260905-e61-SUMMARY.md`.
  </action>
  <verify>
    <automated>pnpm planning-gates && grep -qE '^VERDICT: (PASS|FAIL|NOT MEASURED)$' .planning/quick/260909-tgx-run-the-gap-d-nav-drain-live-gate-on-sto/260909-tgx-LIVE-GATE.md && test -f .planning/quick/260909-tgx-run-the-gap-d-nav-drain-live-gate-on-sto/260909-tgx-SUMMARY.md</automated>
    <human-check>The Observations section quotes the operator's own words. If any sentence in it reads like an agent wrote it, that is the failure this whole plan exists to prevent.</human-check>
  </verify>
  <done>
`260909-tgx-LIVE-GATE.md` carries a single unambiguous `VERDICT:` line, the verbatim observations
behind it, and (a)/(b)/(c) as separate lines. The two todo files sit in the directories the verdict
dictates. `pnpm planning-gates` exits 0. `260909-tgx-SUMMARY.md` names the verdict, the binary's
sha256, and both todo destinations.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| operator observation → written record | The only place a false claim can enter. No code, no network input, no package install crosses any boundary in this plan. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-tgx-01 | Repudiation | `260909-tgx-LIVE-GATE.md` verdict | mitigate | Verdict is pinned to a measured sha256 + mtime of the exact binary (Task 1), so it cannot later be claimed of a different build |
| T-tgx-02 | Tampering | Observations section | mitigate | `autonomous: false` + explicit AWAITING OPERATOR placeholder; no agent may compose an outcome it did not witness |
| T-tgx-03 | Information disclosure | `gamelib-gate.log` | accept | Local app log from a store-browsing gesture; no credentials are entered during it |

No package-manager install occurs in this plan, so the supply-chain threat `T-*-SC` does not
arise. That is a statement about this plan's contents, not a claim that the repo's package
posture was audited here.
</threat_model>

<verification>
- The binary under test post-dates 2026-09-05T10:28:18+1200 by measured mtime — not assumed, not
  inferred from the fact that a build was started.
- Both content proofs record a count **and** its corpus size, so a zero cannot be misread as
  evidence about the fix.
- `## Observations` contains the operator's verbatim words and nothing an agent authored.
- Exactly one `VERDICT:` line, from the closed set of three.
- Todo file locations match the verdict's branch, and `pnpm planning-gates` exits 0 afterwards.
- On PASS: no "OUTSTANDING" / "NOT DONE" prose about this live gate survives anywhere in
  `.planning/todos/`.
</verification>

<success_criteria>
The GAP-D nav-drain gesture has been run once on real macOS hardware against a release bundle
proven to carry the fix; its outcome is recorded verbatim; and the queue reflects that outcome —
the confirm-todo out of `pending/` on any measured result, and the original defect todo reopened
out of `completed/` if and only if the gesture failed.
</success_criteria>

<output>
Create `.planning/quick/260909-tgx-run-the-gap-d-nav-drain-live-gate-on-sto/260909-tgx-SUMMARY.md` when done.
</output>
