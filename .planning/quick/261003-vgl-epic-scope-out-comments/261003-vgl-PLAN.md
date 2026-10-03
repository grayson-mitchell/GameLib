---
phase: 261003-vgl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx
autonomous: true
requirements: [REQ-40-12]

estimate:
  tokens: 35000
  raw_tokens: 35000
  tasks: 2
  confidence: low # DERIVED: `estimate-calibration` reports sample_count=0, factor=1, applied=false

must_haves:
  truths:
    - 'D-05 mechanism restated -- the index.tsx scope-out comment attributes the block to the Cloudflare Turnstile gate spike 024 MEASURED, not to the 2026-08-03 Talon login-endpoint fingerprint'
    - 'Refutation recorded in both comments -- the injected globals were present in the run that rendered AND in the runs that were challenged, so the login-endpoint mechanism does not explain the store gate'
    - 'Status flipped in both comments -- closed and permanent (follow-up todo closed WONTFIX 2026-09-15), no longer predicted with a pending spike'
    - 'Evidence reachable from either comment by repo-relative path to the spike 024 README'
    - 'Honest limits kept in both comments -- run 1 rendered so it is not a capability question, the single-residential-IP confounder is unresolved, signed-in surfaces were deliberately untouched, and neither comment flatly accuses Epic of blocking in-app browsing'
    - 'Preserved -- D-05/D-08 and REQ-40-12 in both files, File 1 upstream-never-stopped-it note plus the D-08 Epic-tile rationale, and every File 2 paragraph other than the two bullets in scope'
    - 'Platform bullet corrected -- the embed ships on macOS AND Linux (Linux per the positioning todo 2026-09-28 decision (a)), and Windows is the ONLY platform that now reaches this panel'
    - 'Platform bullet rationale corrected -- the claim that the only embed evidence is macOS-only is falsified by spikes 025/026/028/029 (native Linux) and 027 (live Windows PASS 2026-09-30), while D-02, D-04 and the Phase 38 ledger pointer survive'
    - 'No overclaim on Windows -- 027 discharged 38-E01 on a HARNESS, not the shipped app, so the bullet must not read as though Windows embedding exists'
    - 'Zero behaviour change -- every non-comment line in both files byte-identical to the pre-edit blob, 15-suite WebView surface still green'
  artifacts:
    - 'src/frontend/screens/WebView/index.tsx -- comment block above the store === epic guard'
    - 'src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx -- the epic reason bullet'
  key_links:
    - 'Both comments -> .planning/spikes/024-epic-store-in-embedded-child-webview/README.md, the ONLY route from source to measurement'
    - 'Strip-comment identity diff -> proof the rewrite did not move the guard that IS the entire scope-out mechanism'
---

<objective>
Rewrite three stale source comments so they state what was measured instead of what was predicted.

Two concern the `/store/epic` scope-out (`WebView/index.tsx`'s guard comment and
`WebviewUnavailablePanel`'s `reason="epic"` bullet): both attribute it to the 2026-08-03 Talon
login-endpoint fingerprint and describe the settling spike as still pending. Spike 024 ran five
times, refuted that mechanism, identified a Cloudflare Turnstile gate instead, and closed WONTFIX
on 2026-09-15.

The third is the same panel's `reason="platform"` (D-02) bullet, approved for inclusion after it
surfaced during planning: it says the embed is "macOS-only" and pairs Windows with Linux as
platforms that reach this panel. `index.tsx` admits `darwin` AND `linux`, so Linux is supported and
Windows alone falls through. Its stated rationale — that the only embed evidence is macOS-only —
is falsified too, by five spikes that postdate it.

Purpose: these comments are the only in-source explanation of two guards, one of which
single-handedly keeps `/store/epic` out of the embed. A reader who believes the stale Epic
mechanism would conclude that guard is removable once the injected globals are suppressed, which
spike 024 falsified; a reader who believes the stale platform bullet would conclude Linux users get
no embed, which they do.
Output: three edited comment blocks across two files. Zero behaviour change.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/spikes/024-epic-store-in-embedded-child-webview/README.md
</context>

<!-- Allowlist markers for Comment-Text Discipline (#429): these literals appear in
     `<verify>` grep regexes below and must not trip the planner gate. -->
<!-- planner-discipline-allow: would reproduce -->
<!-- planner-discipline-allow: deliberately provisional -->
<!-- planner-discipline-allow: MANIFEST.md -->
<!-- planner-discipline-allow: macOS-only -->
<!-- planner-discipline-allow: Windows and Linux -->
     <!-- MANIFEST.md is the one real echo inside a task action: Task 2 must NAME the pointer it
          deletes, and its verify negative-greps the same literal. `macOS-only` and
          `Windows and Linux` are quoted ONLY in this plan's verification table (to show which
          claims are being removed) and in the verify regexes — both actions were rephrased to
          avoid echoing them, so an executor copying action prose cannot trip either gate.
          Self-checked 2026-10-03; the remaining literals appear in no task action body.
          NOTE: this plan deliberately avoids writing the bare action/verify TAG tokens in prose.
          A literal one here created a false span in the first run of that self-check, which
          reported every literal as echoed — a detector matching prose, not a real echo. -->
<!-- planner-discipline-allow: Session ID -->
<!-- planner-discipline-allow: windowNumber -->

## Grounded facts this plan was written against

Measured 2026-10-03 at `HEAD` = `3f7a1f306`, branch `quick-261002-b63`. Every `<automated>`
command below was RUN before being written into this plan, with its before-value recorded, so each
gate genuinely flips rather than passing vacuously.

| Fact | Measured value |
|---|---|
| `npx prettier --file-info` on BOTH target files | `{ "ignored": false, "inferredParser": "typescript" }` — prettier SEES them, so `--check` is NOT vacuous here |
| `pnpm codecheck` | green, **7.7 s** |
| `npx jest --config src/frontend/jest.config.js src/frontend/screens/WebView` | green, **15 suites / 305 tests, ~1.0 s** |
| `npx prettier --check` on both target files | green |
| `index.tsx` comment wrap | comment lines run to **99 cols** (214 of 559 lines exceed 80). The house wrap for THIS file's comments is ~95-99, NOT 80 |
| `WebviewUnavailablePanel.tsx` wrap | max line **79**, comment max **78**, **zero** lines over 80. Its JSDoc wraps tight |
| Positive-gate tokens (`024-epic-store-…`, `turnstile`, `WONTFIX`) | **0** in both files today — each gate flips 0 -> >=1 |
| Stale literals | `would reproduce` = 1 in File 1; `deliberately provisional` = 1 in File 2 — each flips 1 -> 0 |
| Preservation anchors | File 1: `embeddable: false`=1, `StoresPanel`=1, `D-05`=4, `D-08`=2, `REQ-40-12`=1. File 2: `reason="platform"`=1, `TauriLoginPanel`=1, `CrossoverBadge`=1, `T-34.4.1-26`=1, `D-05`=1, `D-08`=4, `REQ-40-12`=2 |
| Tests asserting on comment text | **none** — grep for `Talon`/`root-caused`/`provisional`/`scoped out`/`PREDICTED` across both WebView `__tests__` dirs returns zero NON-comment matches, so no test pins the prose being rewritten |
| Platform-bullet gate tokens in File 2 | `macOS-only` = **2** and `Windows and Linux` = **1** today (both flip to 0); `2026-09-28` = **0** and `027` = **0** (both flip to >=1). Preservation: `D-02`=3, `D-04`=1, `Phase 38`=1, `016/017/018`=1 |
| Scope of the "macOS-only" staleness | A `grep -rn "macOS-only\|macOS only"` census across `src/` and `src-tauri/` returns 41 hits; only the **2** on File 2's lines 26 and 28 concern the embed's platform scope. Every other hit is an unrelated and still-correct macOS-only claim (CrossOver filter, `sips`, tray template image, sheet dismissal, login-window fallback). There is no third site to chase |

**Honest limit on the mandated prettier check.** Prettier does not reflow comment TEXT. Over a
comments-only change `--check` therefore proves only that nothing structural was damaged (a
mangled `*/`, wrong indentation, a broken JSDoc) — it cannot catch an over-wide comment line. It is
still mandatory and still non-vacuous (both paths report `"ignored": false`), but it is weak for
this task, which is why each task also carries an explicit, file-specific width gate derived from
that file's own measured corpus.

**Inverted grep hygiene, deliberately.** CLAUDE.md's rule is to strip comments before a `grep -c`
gate so header prose cannot self-satisfy it. Here the comments ARE the deliverable, so the positive
greps match comment text ON PURPOSE. The usual hygiene is inverted by construction, not forgotten.

### The platform bullet — what I verified, and the one trap in it

The live `reason="platform"` bullet makes three claims. **All three are stale, and the third is the
one that matters**, because it is the stated *rationale*: "every spike behind the embed
(016/017/018) is macOS-only and none of that evidence transfers to the Windows/Linux wry backends".

| Claim in the bullet | Verified state |
|---|---|
| the live embed is "macOS-only" | FALSE. `src/frontend/screens/WebView/index.tsx:514` guards `if (platform !== 'darwin' && platform !== 'linux')`, and its own comment at `:506-507` attributes the Linux arm to "the positioning todo's 2026-09-28 decision (a): a real GTK-box-native embed rather than none" |
| "Windows and Linux name the platform as the reason" | FALSE for Linux. That same comment says "Every other platform (**Windows**) falls through to the `WebviewUnavailablePanel`" — Windows alone reaches this panel |
| the only embed evidence is macOS-only and none transfers | FALSE on both halves. **025** VALIDATED a native Linux `add_child` (2 ms, real store page, real cookies); **026** PARTIAL found the Linux-specific `GtkBox` / `set_bounds` and `data_store_identifier` no-ops; **028** then **029** measured the GtkFixed reparent lever at 30/30 EXACT and allocation at **100/100**; **027** cross-checked Windows and got a live Windows 11 PASS on 2026-09-30 (quick `260930-o75`), 0 px error, which MANIFEST records as "`38-E01` DISCHARGED" |

**THE TRAP — do not let the rewrite overclaim Windows.** MANIFEST line 419 is explicit about that
live Windows run: "**Harness only, NOT the shipped app.**" So 38-E01's *question* ("does `add_child`
attach and position on Windows at all") is discharged, while Windows embedding is still unbuilt and
unshipped. That distinction is exactly why Windows still reaches this panel, and it means the
bullet's `D-04` / Phase 38 ledger pointer is still the correct pointer to the remaining work — it
is the bullet's conclusion-for-Windows and its ledger reference that survive, and its
evidence-does-not-transfer reasoning that dies.

I did NOT find a reason recorded anywhere for why Windows is unshipped beyond "not built yet" plus
027's note that synchronous `#[tauri::command]` webview creation hangs on Windows. The rewrite must
therefore NOT assert a shipping rationale — point at the ledger and stop.

<tasks>

<task type="tracer">
  <name>Task 1: rewrite the `/store/epic` scope-out comment block in WebView/index.tsx</name>
  <files>src/frontend/screens/WebView/index.tsx</files>
  <precondition>Run this task's `<verify>` BEFORE committing. Two gates compare the working tree
  against `git show HEAD:<file>`, so `HEAD` must still be the pre-edit commit for this file. (Task
  2's gates are scoped to its own file, which Task 1 does not touch, so Task 1 committing first is
  safe for Task 2.)</precondition>
  <read_first>
    - `.planning/spikes/024-epic-store-in-embedded-child-webview/README.md` IN FULL. It is the
      source of truth; treat the summary below as a pointer, and take every number from the README.
    - The live comment block in `src/frontend/screens/WebView/index.tsx` sitting immediately above
      `if (store === 'epic')`. AUTHORIZE THE EDIT SCOPE FROM YOUR OWN READ of that block, not from
      any line number — it was at roughly 521-529 on 2026-10-03 and may have moved.
    - The neighbouring comment block above `if (platform !== 'darwin' && platform !== 'linux')`,
      to match voice and wrap width.
  </read_first>
  <action>
Replace ONLY that one comment block. Touch no executable line.

KEEP (all four are load-bearing and must survive the rewrite):
  1. The `Phase 40 Plan 10 (D-05/D-08, REQ-40-12)` citation and the Rule-2-deviation framing.
  2. The note that nothing upstream of this point — the `urls` map, `useStoreEmbedHost`, and
     `storeEmbedOrigins.ts`'s `embeddable: false` flag, which the deep-link/restore path above
     consults and this direct route never does — ever stopped `/store/epic` reaching the live embed
     render below, so this ONE guard is the whole mechanism.
  3. That the scope-out applies on EVERY platform, macOS included.
  4. That the Epic tile stays per D-08 in `NavShell/components/StoresPanel/index.tsx` and now lands
     on the panel instead — a tile leading to a working open-in-browser escape hatch beats no tile.

REPLACE the mechanism sentence. The old text named the injected globals as the confirmed
login-endpoint fingerprint and predicted that embedding Epic here would re-trigger it. Spike 024
measured otherwise; state the measurement:
  - The gate is a Cloudflare Turnstile challenge, not a bare 403.
  - The injected globals (`isTauri`, `__TAURI__`, `__TAURI_INTERNALS__`, `ipc`, `__TAURI_IIFE__`)
    were read from INSIDE the loaded Epic page and were present in all three unattended runs
    INCLUDING the one that rendered fine. The same fingerprint both passed and failed, so the
    2026-08-03 Talon login-endpoint mechanism does NOT explain the store gate. Say REFUTED, in
    those terms — a future reader must not re-derive the dead theory from this comment.
  - Unattended runs 1-3 (2026-09-05): run 1, a fresh container and this IP's first contact,
    rendered the store fully (`bodyLen=89181`); runs 2 and 3 hit the interstitial
    (`bodyLen=18450`, empty text), and run 3 used a brand-new container, which falsifies the
    cookie/container-state explanation. Steam's positive control rendered in all three, so no run
    is a dead harness.
  - Interactive run 5 (2026-09-15, quick `260915-hza`), at a pixel-verified 986x630: a human
    clicked the verify box and the challenge was RE-ISSUED rather than cleared, twice. Run 4 is
    discarded — a harness defect squeezed the embed to 969x58.

CHANGE THE STATUS from predicted-and-pending to measured-and-closed: the scope-out is PERMANENT,
not "for now"; the follow-up todo closed WONTFIX on 2026-09-15; what would reopen it is a change in
Epic's posture, not a change in our code.

CITE the evidence by path: `.planning/spikes/024-epic-store-in-embedded-child-webview/README.md`.

DO NOT OVERCLAIM — these three limits come from the spike's own "What is NOT established" and must
appear:
  - Run 1 rendered, so this is not a capability question: the store CAN render in a Tauri-managed
    child webview.
  - All five runs share ONE residential IP, so "the Tauri webview is blocked" cannot be separated
    here from "this IP's reputation is spent"; the surviving untested explanation for run 1 is
    IP/behaviour reputation accrued over the session. Testing it needs a different network — and it
    does not change the product decision, since the gate cannot be conditional on a user's IP.
  - Anything behind sign-in was deliberately untouched (D-07).
  Do not write a flat accusation that Epic blocks in-app browsing, and do not imply the mechanism
  is fully explained.

DISCLOSURE CONSTRAINT (this repo is a PUBLIC fork): quote only non-identifying measurements — body
lengths, navigation counts, container names, viewport sizes, dates. The spike's run-5 challenge
card carried operator-identifying values that are redacted in the committed PNG; transcribe none of
them, and no window identifiers from the run log.

WRAP to match this file's own comments: `// ` prefix, continuation lines wrapped at the same width
as the neighbouring blocks (measured: up to 99 cols; the file's comments do NOT wrap at 80).
  </action>
  <verify>
    <automated>! grep -q 'would reproduce' src/frontend/screens/WebView/index.tsx</automated>
    <automated>grep -q '024-epic-store-in-embedded-child-webview' src/frontend/screens/WebView/index.tsx</automated>
    <automated>grep -qi 'turnstile' src/frontend/screens/WebView/index.tsx</automated>
    <automated>grep -q 'WONTFIX' src/frontend/screens/WebView/index.tsx</automated>
    <automated>grep -q 'D-05' src/frontend/screens/WebView/index.tsx &amp;&amp; grep -q 'D-08' src/frontend/screens/WebView/index.tsx &amp;&amp; grep -q 'REQ-40-12' src/frontend/screens/WebView/index.tsx</automated>
    <automated>grep -q 'embeddable: false' src/frontend/screens/WebView/index.tsx &amp;&amp; grep -q 'StoresPanel' src/frontend/screens/WebView/index.tsx</automated>
    <automated>test "$(awk '/^[[:space:]]*\/\// &amp;&amp; length>99' src/frontend/screens/WebView/index.tsx | wc -l | tr -d ' ')" = 0</automated>
    <automated>B=$(git show HEAD:src/frontend/screens/WebView/index.tsx) &amp;&amp; diff &lt;(printf '%s\n' "$B" | grep -vE '^[[:space:]]*(//|\*|/\*)') &lt;(grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/screens/WebView/index.tsx)</automated>
    <automated>D=$(git diff HEAD -U0 -- src/frontend/screens/WebView/index.tsx) &amp;&amp; ! printf '%s\n' "$D" | grep -E '^\+[^+]' | grep -qEi '([0-9]{1,3}\.){3}[0-9]{1,3}|Session ID|windowNumber'</automated>
    <automated>npx prettier --check src/frontend/screens/WebView/index.tsx</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx jest --config src/frontend/jest.config.js src/frontend/screens/WebView</automated>
  </verify>
  <done>
The block above the `store === 'epic'` guard names the Cloudflare Turnstile gate measured by spike
024, says the injected-globals/login-fingerprint theory was refuted by it, reads as permanent and
WONTFIX-closed, cites the spike README by path, and carries the three honest limits. D-05/D-08,
REQ-40-12, the "nothing upstream stopped it" note and the D-08 tile rationale survive. The
strip-comment identity diff against `HEAD` is EMPTY, so no executable line moved; 15 suites / 305
tests and `pnpm codecheck` stay green.
  </done>
  <reversibility rating="reversible">Comment text in one tracked file; `git checkout --` restores
  it, and nothing downstream reads the prose.</reversibility>
</task>

<task type="auto">
  <name>Task 2: rewrite BOTH stale bullets in WebviewUnavailablePanel's docstring (epic + platform)</name>
  <files>src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx</files>
  <precondition>Run this task's `<verify>` BEFORE committing: its identity and disclosure gates
  compare against `git show HEAD:` for THIS file, which Task 1 did not modify.</precondition>
  <read_first>
    - `.planning/spikes/024-epic-store-in-embedded-child-webview/README.md` (already read in Task 1
      — do not re-read).
    - The component docstring in `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx`.
      AUTHORIZE SCOPE FROM YOUR OWN READ: on 2026-10-03 the `reason="platform"` bullet was at
      roughly lines 26-30 and the `reason="epic"` bullet at roughly 31-44. Edit THOSE TWO BULLETS
      ONLY.
    - Task 1's finished comment block, so the Epic story is told the same way at two lengths.
    - This plan's "The platform bullet — what I verified" table above. Its spike readings were
      verified against `.planning/spikes/MANIFEST.md` on 2026-10-03; if you want to re-check one,
      read the MANIFEST rows for 025/026/027/028/029 and lines 411-419 — do NOT re-derive them from
      the spike READMEs, which is far more context than this needs.
  </read_first>
  <action>
Rewrite the `reason="epic"` bullet to carry the same substance as Task 1's block, compressed to
docstring length. This is a component docstring, not the guard's full rationale — point at Task 1's
block and at the spike rather than repeating every run.

The bullet must, after the rewrite:
  - Keep its `(D-05/D-08)` citation and keep "`/store/epic` is scoped out of the embed on EVERY
    platform, including macOS".
  - Name the Cloudflare Turnstile challenge as the measured gate.
  - State that spike 024 REFUTED the injected-globals/login-fingerprint attribution this bullet
    used to carry: the globals were present in the run that rendered as well as in the runs that
    were challenged, so the 2026-08-03 login-endpoint mechanism does not explain the store gate.
  - Read as closed and permanent — spike 024 measured it across five runs and the follow-up todo
    closed WONTFIX on 2026-09-15. Delete the sentence describing a spike that runs alongside Phase
    40 and settles an open question, and the `.planning/spikes/MANIFEST.md` pointer with it; that
    status claim is the stale half of this bullet.
  - Cite `.planning/spikes/024-epic-store-in-embedded-child-webview/README.md`.
  - Keep the restraint, but re-grounded in the measurement rather than in a prediction: the copy is
    still never a flat accusation that Epic blocks in-app browsing, because run 1 rendered the
    store fully and all five runs share one residential IP, leaving reputation-vs-webview
    unseparated. Say that the user-facing copy is unchanged by this edit.
  - Keep the D-08 sentence: the Epic tile stays in `NavShell/components/StoresPanel/index.tsx`
    because a tile leading to a working open-in-browser escape hatch beats no tile.

THEN rewrite the `reason="platform"` (D-02) bullet, which is stale in all three of its claims — see
this plan's verification table above for what each one actually measures. After the rewrite it must:
  - Keep its `(D-02)` citation, and keep the point that the panel names the PLATFORM as the reason
    rather than blaming the build.
  - Say the live embed ships on macOS AND Linux, with the Linux arm attributed the way
    `index.tsx:506-507` already attributes it — the positioning todo's 2026-09-28 decision (a), a
    real GTK-box-native embed rather than none. Reuse that citation; do not invent a different one.
  - Say WINDOWS is now the only platform that reaches this panel. Do NOT pair the two non-Mac
    platforms together as jointly unsupported — that pairing is precisely the stale half.
  - Replace the dead rationale. Dropping the claim that the only embed evidence is Mac-restricted
    is the point of this edit: name the Linux embed spikes (025/026, and 028/029 for the GtkFixed
    reparent lever and the 100/100 allocation reliability) and the Windows cross-check (027), whose
    live Windows 11 run on 2026-09-30 produced a 0 px-error `WS_CHILD` attach and discharged
    `38-E01`.
  - PRESERVE the `D-04` reference and the Phase 38 ledger pointer — they are still the correct
    pointer to the remaining Windows work. Keep the `016/017/018` citation too: those three are
    still the macOS embed evidence; what is false is the claim that they are the ONLY evidence.
  - NOT OVERCLAIM WINDOWS. 027's live run was a HARNESS, not the shipped app (MANIFEST line 419
    says so in those words), so `38-E01`'s question is discharged while Windows embedding remains
    unbuilt. Write it that way. Do NOT assert a reason Windows is unshipped beyond the ledger —
    none is recorded, and 027's note about synchronous webview creation hanging on Windows is an
    observation, not a decision.

DO NOT TOUCH anything else in this file: the `Props` JSDoc, the Phase-34.4.1 login-case paragraph,
the no-hooks/`CrossoverBadge` paragraph, the `T-34.4.1-26` "Open in browser" paragraph, the
`WebviewUnavailableReason` type, and every executable line all stay exactly as they are. The
user-facing i18n copy for both reasons is unchanged by this task.

Same PUBLIC-FORK disclosure constraint as Task 1: non-identifying measurements only.

WRAP to this file's own measured convention: ` * ` JSDoc prefix, every line at or under 79 columns
(the file currently has ZERO lines over 80 — do not be the first). This bites harder now that two
bullets grow; wrap, do not widen.
  </action>
  <verify>
    <automated>! grep -q 'deliberately provisional' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx</automated>
    <automated>! grep -q 'MANIFEST.md' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx</automated>
    <automated>! grep -q 'macOS-only' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx</automated>
    <automated>! grep -q 'Windows and Linux' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx</automated>
    <automated>grep -q '2026-09-28' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx</automated>
    <automated>grep -q '027' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx</automated>
    <automated>grep -q 'D-02' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx &amp;&amp; grep -q 'D-04' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx &amp;&amp; grep -q 'Phase 38' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx &amp;&amp; grep -q '016/017/018' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx</automated>
    <automated>grep -q '024-epic-store-in-embedded-child-webview' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx</automated>
    <automated>grep -qi 'turnstile' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx</automated>
    <automated>grep -q 'WONTFIX' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx</automated>
    <automated>grep -q 'D-05' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx &amp;&amp; grep -q 'D-08' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx &amp;&amp; grep -q 'REQ-40-12' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx</automated>
    <automated>grep -q 'reason="platform"' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx &amp;&amp; grep -q 'TauriLoginPanel' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx &amp;&amp; grep -q 'CrossoverBadge' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx &amp;&amp; grep -q 'T-34.4.1-26' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx</automated>
    <automated>test "$(awk 'length>80' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx | wc -l | tr -d ' ')" = 0</automated>
    <automated>B=$(git show HEAD:src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx) &amp;&amp; diff &lt;(printf '%s\n' "$B" | grep -vE '^[[:space:]]*(//|\*|/\*)') &lt;(grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx)</automated>
    <automated>D=$(git diff HEAD -U0 -- src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx) &amp;&amp; ! printf '%s\n' "$D" | grep -E '^\+[^+]' | grep -qEi '([0-9]{1,3}\.){3}[0-9]{1,3}|Session ID|windowNumber'</automated>
    <automated>npx prettier --check src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx jest --config src/frontend/jest.config.js src/frontend/screens/WebView</automated>
  </verify>
  <done>
The `reason="epic"` bullet names the Turnstile gate, records the refutation, reads as WONTFIX-closed
and permanent, cites the spike README by path, and keeps the no-accusation restraint on
measurement-based grounds. The pending-spike sentence and its MANIFEST pointer are gone.

The `reason="platform"` bullet says the embed ships on macOS and Linux (Linux attributed to the
2026-09-28 decision (a)), names Windows as the only platform reaching this panel, cites the Linux
and Windows embed spikes in place of the falsified macOS-only-evidence rationale, and keeps D-02,
D-04, the Phase 38 ledger pointer and the 016/017/018 citation. It reads 027's live Windows run as
a discharged harness question, NOT as shipped Windows support.

Every other paragraph, the `Props` JSDoc, the type and all executable lines are unchanged — the
strip-comment identity diff is EMPTY. No line exceeds 80 columns. 15 suites / 305 tests and
`pnpm codecheck` green.
  </done>
  <reversibility rating="reversible">Docstring text only.</reversibility>
</task>

</tasks>

<threat_model>
Comments-only change, so the threat surface is genuinely thin. Written at that weight rather than
inflated. ASVS level 1, blocking threshold `high`.

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo -> public internet | This is a PUBLIC fork. Anything written into a tracked source comment is published. |
| `/store/epic` route -> embedded child webview | NOT crossed at runtime by this change, but the `store === 'epic'` guard that enforces it sits one line below the text being edited, and the comments are the only thing explaining why it must stay. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-VGL-01 | Information Disclosure | the two rewritten comment blocks | medium | mitigate | Cite spike 024 by repo-relative PATH and quote only non-identifying measurements (body lengths, nav counts, container names, viewport sizes, dates). Cloudflare printed the operator's residential IP and a session identifier on the run-5 challenge card (redacted in the committed PNG) — transcribe none of it, and no window identifiers from the run log. Enforced per task by a grep over ADDED diff lines for a dotted quad and those two token names; controls run 2026-10-03: clean tree -> pass, synthetic added line carrying an IP -> fail, legitimate measurement text -> pass. |
| T-VGL-02 | Tampering | `if (store === 'epic')` guard in `WebView/index.tsx`; `WebviewUnavailablePanel` props/type | high | mitigate | An accidental edit here un-gates `/store/epic` into the embed, and this guard is the WHOLE mechanism — nothing upstream blocks that route. Enforced per task by a strip-comment identity diff against `git show HEAD:<file>` (must be empty), plus the 15-suite / 305-test WebView surface, several of whose gates read the raw source text of these files. Controls run 2026-10-03: unmodified tree -> exit 0, simulated comment-only edit -> exit 0, simulated change of `'epic'` to `'gog'` in the guard -> exit 1. The gate has teeth. |
| T-VGL-03 | Repudiation | the claim a future reader relies on | medium | mitigate | A comment that overstates a finding would license removing a guard for the wrong reason, or keeping it on a claim the evidence does not support. Two concrete overclaims are in reach and both are explicitly fenced in the task actions: (a) "Epic blocks in-app browsing" as a flat accusation — mitigated by mandating spike 024's own three unresolved limits in both Epic blocks; (b) reading spike 027's live Windows PASS as shipped Windows support — mitigated by requiring the harness-vs-shipped distinction MANIFEST line 419 draws, and by forbidding any invented rationale for why Windows is unshipped. Both cite their source by path, so each claim is auditable rather than asserted. |
| T-VGL-SC | Tampering | npm/pip/cargo installs | high | mitigate | NO package installs in this task. Nothing is added to `package.json`; every command invokes an already-present devDependency (`prettier` 3.7.4, `jest`, `tsc`) via `npx`/`pnpm`. No RESEARCH.md legitimacy table is required because there are no install tasks — if one becomes necessary, HALT for the blocking human legitimacy checkpoint rather than installing. |
</threat_model>

<verification>
Per-task gates above are the real verification. Two whole-change checks to run once at the end:

1. Comment-only across the WHOLE task, independent of per-task commit order. `3f7a1f306` was this
   branch's `HEAD` when the plan was written; substitute the actual pre-task commit if it moved:
   ```
   for f in src/frontend/screens/WebView/index.tsx \
            src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx; do
     B=$(git show 3f7a1f306:$f) || { echo "GIT READ FAILED FOR $f"; continue; }
     diff <(printf '%s\n' "$B" | grep -vE '^[[:space:]]*(//|\*|/\*)') \
          <(grep -vE '^[[:space:]]*(//|\*|/\*)' $f) || echo "NON-COMMENT CHANGE IN $f"
   done
   ```
   The `B=$(...)` capture is deliberate: with `git show` piped directly inside the process
   substitution, a failed read (bad ref, renamed file) is swallowed and the gate reports clean.
   Controls run 2026-10-03 — clean tree exit 0, simulated guard change exit 1, bad ref exit 128.
2. `npx prettier --check` over the two exact paths (never a bare `.` — the root printWidth is 80
   and `src/preload/.prettierrc` overrides it to 120, but neither file is under `src/preload`, so
   the root config applies). Both paths report `"ignored": false` with a real `inferredParser`, so
   the check is not vacuous — match that JSON with a space-tolerant pattern such as
   `grep -Eq '"ignored":[[:space:]]*false'` if you re-confirm it. Remember the limit recorded
   above: prettier does not reflow comment text, so the width gates are the ones with teeth.

This plan file itself lives under `.planning/`, which `.prettierignore` covers
(`--file-info` reports `{ "ignored": true, "inferredParser": null }`), so no formatter check is
claimed over it — its wrap is hand-matched to the surrounding planning corpus instead.

No TDD (`tdd="true"`) on either task, deliberately: the change produces no behaviour, and writing a
test that pins comment PROSE would create exactly the rot this task exists to clean up. The
behaviour guarantee comes from the identity diff, which is stronger than a prose assertion.
</verification>

<success_criteria>
- Both comments name the Cloudflare Turnstile gate and the spike-024 refutation of the
  injected-globals attribution.
- Both read as closed and permanent (WONTFIX, 2026-09-15), not predicted and pending.
- Both cite `.planning/spikes/024-epic-store-in-embedded-child-webview/README.md`.
- Both carry the spike's three unresolved limits and neither overclaims.
- The `reason="platform"` bullet names macOS AND Linux as supported (Linux per the 2026-09-28
  decision (a)) and Windows as the only platform reaching the panel, replaces the falsified
  only-evidence-is-Mac-restricted rationale with the Linux and Windows embed spikes, and reads
  027's live run as a discharged harness question rather than shipped Windows support.
- D-05/D-08/REQ-40-12, File 1's upstream note and tile rationale, File 2's D-02 / D-04 / Phase 38
  ledger / 016-017-018 references, and File 2's other paragraphs all survive.
- Strip-comment identity diff empty for both files; `pnpm codecheck` green; 15 suites / 305 tests
  green; `npx prettier --check` green on both explicit paths; no line over the file's measured
  comment width; no identifying value in any added line.
</success_criteria>

## Out of scope — found live, NOT fixed here, needs an operator decision

Recording rather than silently fixing: the request scoped this task to two files, and a planner has
no authority to widen the file set. Each of these carries the SAME staleness being fixed above.

> A third finding — the `reason="platform"` bullet's stale macOS-only scope — was recorded here on
> first pass and has since been APPROVED for inclusion. It is now Task 2's second half, not an
> out-of-scope item.

1. **`src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx` (CR-01 rationale block,
   ~line 683)** says a store->store switch navigated the embed into a page that "carries the
   root-caused Talon fingerprint". Stale by the same spike finding — the fingerprint is present on
   pages that render fine; the gate is Turnstile. The test's four pinned properties are correct and
   unaffected; only the prose misattributes. Recommend a follow-up quick task or a `minor` /
   `ready: code` todo.
2. **`.planning/spikes/MANIFEST.md`** — the 024 row (~line 267) still says "3 runs" and lists
   "whether a HUMAN can click through Turnstile" as the key open question; the Idea-C summary line
   (~line 383) also says "3 runs". Runs 4-5 answered that question on 2026-09-15 and the README's
   own frontmatter says RESOLVED. The MANIFEST is prettier-ignored planning state, so it needs
   hand-matching, not a formatter.
Both remaining items are now the ONLY known stale siblings of this staleness. Neither blocks
anything: `useStoreEmbedHost.test.tsx`'s properties pass and the MANIFEST's own 024 README already
says RESOLVED, so each is prose drift rather than a live defect.

## Planner contributions — considered, not fired

Recorded rather than fabricated. `api-coverage`: no external API/SDK/service is integrated by a
comment rewrite, so no COVERAGE.md matrix is invented. `assumption-delta`: no
singular->plural, required->optional or derived->chosen transition; advisory and non-blocking
regardless. `schema-gate`: neither file matches an ORM/schema pattern. The unconditional
`<threat_model>` contribution IS honored above, at honest weight.

<output>
Create `.planning/quick/261003-vgl-epic-scope-out-comments/261003-vgl-SUMMARY.md` when done.
</output>
