---
phase: quick-260923-uvt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md
  - .planning/todos/pending/2026-09-23-steam-bridge-helper-never-spawned-by-the-sidecar-only-direct-exec-proven.md
  - .planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
  - .planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
  - .planning/todos/pending/2026-09-23-macos-updater-manifest-can-never-gain-a-macos-entry-bundle-targets-omits-app.md
  - .planning/STATE.md
autonomous: true
requirements:
  - UVT-01
  - UVT-02
  - UVT-03
  - UVT-04
  - UVT-05
must_haves:
  truths:
    - 'Every residual the notarization todo carried has a live home BEFORE the todo is closed — nothing is discarded by the move.'
    - 'The parent 2026-09-04 todo records that three of its own five Verification bullets are SATISFIED on a real published artifact, and that its browser-download bullet is still owed.'
    - 'The parent todo''s fifth Verification bullet no longer instructs a reader to grep for a string that is present in a PASSING run log.'
    - 'The notarization todo lives in `completed/` with `status: completed`, `resolved: 2026-09-23`, `resolved_by: quick-260923-uvt`, and the STAGED blob proves it — not the worktree.'
    - 'No LIVE pending todo points at the old `todos/pending/` path for the notarization todo.'
    - 'Nothing under `src/`, `meta/`, `src-tauri/` or `.github/` changed.'
  artifacts:
    - path: '.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md'
      provides: 'The parent signing todo, still OPEN, now recording the satisfied bullets, the corrected fifth bullet, and residual (a)'
      contains: 'STATUS 2026-09-23 (quick-260923-uvt)'
    - path: '.planning/todos/pending/2026-09-23-steam-bridge-helper-never-spawned-by-the-sidecar-only-direct-exec-proven.md'
      provides: 'Residual (b) — the sidecar-spawned-helper confirmation errand'
      contains: 'ready: live-gate'
    - path: '.planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md'
      provides: 'The closed notarization todo, naming where each residual went'
      contains: 'resolved_by: quick-260923-uvt'
    - path: '.planning/todos/pending/2026-09-23-macos-updater-manifest-can-never-gain-a-macos-entry-bundle-targets-omits-app.md'
      provides: 'A repointed source: that resolves to a file that exists'
      contains: 'source: ''.planning/todos/completed/2026-09-17-notarization-rejects'
    - path: '.planning/STATE.md'
      provides: 'The 260923-uvt quick-task row and a rewritten Last activity line'
      contains: '260923-uvt'
  key_links:
    - from: '.planning/todos/pending/2026-09-23-macos-updater-manifest-can-never-gain-a-macos-entry-bundle-targets-omits-app.md'
      to: '.planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md'
      via: 'frontmatter source:'
      pattern: "source: '\\.planning/todos/completed/2026-09-17-notarization-rejects"
    - from: 'the closed notarization todo'
      to: '.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md'
      via: 'a named destination for residual (a)'
      pattern: '2026-09-04-macos-releases-ship-unsigned-and-unnotarized'
    - from: 'the closed notarization todo'
      to: '.planning/todos/pending/2026-09-23-steam-bridge-helper-never-spawned-by-the-sidecar-only-direct-exec-proven.md'
      via: 'a named destination for residual (b)'
      pattern: 'steam-bridge-helper-never-spawned-by-the-sidecar'
---

<objective>
`.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md`
is `severity: minor`, `ready: live-gate`, `needs: quarantined-first-launch-and-sidecar-spawned-helper`.
Its own final section — `### STATUS 2026-09-23 (quick-260923-u3o)` — states in item 9 that every
clause of its title is now measured FALSE as a live condition, and RECOMMENDS that a later session
close it and move it to `completed/`, **once item 8's residuals are carried into a todo of their
own**. That "once" is the whole job. This task closes the todo, and does the carrying FIRST.

Purpose: close a defect that is measurably discharged, without discarding the untested siblings that
live in its BODY rather than its title. This repo's own lesson
(`closing-a-todo-on-a-false-title-discards-its-untested-siblings`) is that the rival candidates for
"what is still open here" are never in the title, and that closing on a false title throws them away.

Output: one todo updated in place, one new todo created, one todo closed and moved, one stale pointer
repaired, `STATE.md` updated. **DOCUMENTATION ONLY.** Nothing under `src/`, `meta/`, `src-tauri/` or
`.github/` may change, and the verify block asserts that as a hard gate.

**No `<threat_model>` section.** Stated rather than omitted silently: this plan writes five Markdown
files under `.planning/`, installs no package, adds no dependency, crosses no trust boundary, and
touches no executable path. The STRIDE register would be empty and an empty register is a green check
proving nothing.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
@.planning/quick/260923-u3o-record-live-gate-results-extract-updater-todo/EVIDENCE.md
@.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md
@.planning/todos/completed/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md
@CLAUDE.md

**Reuse the strings in `EVIDENCE.md` verbatim. Do not re-derive any of them, do not paraphrase, do
not round.** Every measured value in this plan came from that file or from a command run during
planning; where a value was measured DURING PLANNING it is labelled as such below.
</context>

<planning_measurements>

Six things were measured at HEAD `6dabb9e37` while writing this plan. They are recorded here so the
executor does not re-derive them and so a later reader can tell measurement from assumption.

1. **`pnpm planning-gates` is 12/12 at HEAD.** That is the baseline the verify block ratchets
   against. Recorded because this repo's `a-plans-verify-blocks-rot-against-its-own-baseline-sha`
   lesson is that a plan asserting a gate count against an unstated baseline produces false reds.

2. **The reference census is exactly as the brief describes.** 21 files under `.planning/` mention
   the notarization todo's filename. Exactly three matching lines live in `todos/pending/`:

   | file | line | shape | breaks on move? |
   | --- | --- | --- | --- |
   | `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` | 71 | bare filename, no directory | **no** |
   | `2026-09-23-macos-updater-manifest-...-omits-app.md` | 9 | `source:` with a FULL `todos/pending/` path | **YES** |
   | `2026-09-23-macos-updater-manifest-...-omits-app.md` | 143 | bare filename in `## Related` | no |

   Every other hit is a quick-task `PLAN.md`/`SUMMARY.md` or a file already in `completed/` — HISTORY.
   Leave all of them byte-unchanged.

3. **The `.prettierignore` exemption is real.** Line 29 is a bare `.planning` entry. CLAUDE.md
   mandates `npx prettier --check` in every task's `<verify>`; on these paths that check is VACUOUS —
   it exits 0 while checking nothing (memory `prettier-check-over-a-planning-path-is-vacuous`). The
   verify block states this in as many words and does NOT cite a prettier exit code as evidence.

4. **Tag `v0.7.0-notarize-test3` is ALREADY GONE.** Measured during planning:
   `git ls-remote --tags origin | grep -i notarize` returns nothing, and
   `git for-each-ref refs/tags | grep -i notarize` returns nothing. The notarization todo's u3o item
   10 records it as "still on origin and locally **as of this writing**". That phrase is correctly
   scoped as history and must NOT be edited — p95 item 8 sets the precedent: discharge by ADDITION,
   in new text. Task 2's closing section discharges it that way.

5. **The helper's spawn path, for FILE B's verification recipe.**
   `src/backend/storeManagers/steam/games.ts:2164` — `launchBridgeGame()` awaits
   `ensureBridgeHelperReady(this.appId)`, reached only when `isBottleEligible()` and
   `isBridgeEligible()` both hold, i.e. an allowlisted title (`bridge/allowlist.ts`). That call
   spawns the helper at `src/backend/storeManagers/steam/bridge/helperProcess.ts:151`. So the in-app
   trigger is "launch a bridge-allowlisted Steam game", not "open the Steam tab".

6. **FILE A's frontmatter is already gate-valid.** `severity: major` / `platform: macos` /
   `ready: live-gate`, in that order, at lines 6-8. The frontmatter gate forces NO change to it.

</planning_measurements>

<finding_a_third_live_item>

**The brief instructed: grep the body for any other open item beyond the two residuals, and if a
third is found, STOP and report it rather than closing over it. Two were found. They are reported
here, and this plan carries both rather than discarding them.**

Superseded items were excluded: hazards 2 and 3 (np3 items 3-4) were answered by p95; hazard 4
(q6w) was answered by u3o item 6; the updater manifest (p95 item 8) was already extracted by u3o.
What survives that filter:

**THIRD LIVE ITEM — u3o item 8(c): recipe step 6's in-app invocations were never performed.** Epic
login via `legendary`, an Amazon library refresh via `nile`, a GOG action via `gogdl`. The todo
itself classifies it as "real but is a human-gated errand rather than a defect risk" and
deliberately excluded it from `needs:`, which names only (a) and (b). Measured during planning:
`grep -rln 'Epic login via legendary' .planning/todos/` returns the notarization todo and **nothing
else** — it is tracked in exactly one place, the file being closed.

**FOURTH LIVE ITEM — p95 item 6 / u3o item 4: the 60-minute bound shipped by quick-260923-mrx.**
Apple exposes `uploadDate` and no `completedDate`, so np3's 2h05m37s of silence cannot be attributed
between "Apple was slow" and "`notarytool`'s wait hung". u3o item 4 adds ONE datapoint that
SUPPORTS — and explicitly does not settle — the second reading. Measured during planning:
`grep -rn 'timeout-minutes\|260923-mrx' .planning/todos/pending/` matches the notarization todo and
**nothing else**.

**Disposition, and why neither warrants its own file.**

- (c) is a **verification errand against a published artifact, gated on credentials and a human** —
  structurally identical to the parent 2026-09-04 todo's browser-download bullet, which is already
  `ready: live-gate` and already in that todo's `needs:`. It belongs in FILE A next to its twin, as a
  named second still-owed arm. A separate file would split one live-gate sitting across two todos.
- (4) is a risk about `timeout-minutes: 60` in `.github/workflows/release-tauri.yml` — it belongs to
  mrx's change, not to the 253-binary signing defect. With 1m09s measured against a 60-minute bound
  the observed headroom is ~52x, so it is `minor` by CLAUDE.md's vocabulary ("a latent trap with no
  live consequence"). One recorded sentence in FILE A is proportionate; a new `major` todo would be
  inflation, and inflation is how a todo corpus stops carrying triage information.

Both are carried in Task 1. If the operator disagrees with either disposition, the correct move is a
separate file — but it must be made deliberately, not defaulted into, and not skipped.

</finding_a_third_live_item>

<proposals_for_the_operator>

**Proposed but NOT done by this plan. The brief instructs proposing rather than acting silently.**

**Proposal 1 — FILE A's `severity: major` is arguably now `minor`.** CLAUDE.md defines `major` as "a
feature is broken or a measurement is silently contaminated". The feature — a signed, notarized,
stapled macOS build — is now MEASURED WORKING on a published artifact (`GameLib_0.7.0_aarch64.dmg`,
`source=Notarized Developer ID`, `stapler` rc=0). What remains is two unverified arms with no known
defect behind either, which is CLAUDE.md's `minor`: "polish, rough edge, or a latent trap with no
live consequence". This is the SAME reasoning u3o item 9 applied when it moved the notarization todo
`major -> minor`. **Not applied here** because the brief explicitly fenced this file's `severity:`,
`needs:` and `status:`.

**Proposal 2 — FILE A's TITLE is now partly false.** It reads "no signed/notarized artifact has ever
been published or verified". One has. The title is fine as a historical record of why the todo
exists, on the same footing the notarization todo's own title now sits — but if the operator wants
titles to describe the world rather than the origin, this is the one to change. **Not applied here.**

Task 1 states both of these inside FILE A's new STATUS section as open proposals, so they are visible
to the next reader of the todo and not only to the reader of this plan.

</proposals_for_the_operator>

<tasks>

<task type="auto">
  <name>Task 1: Carry BOTH residuals to a live home — update the parent todo, create the new one</name>
  <files>
.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md,
.planning/todos/pending/2026-09-23-steam-bridge-helper-never-spawned-by-the-sidecar-only-direct-exec-proven.md
  </files>
  <action>
**This task runs BEFORE the close, and that ordering is load-bearing, not cosmetic.** A residual with
no home at the moment the file moves to `completed/` is a residual that was discarded. Do not reorder
Tasks 1 and 2.

**FILE A — edit `.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`.
It stays OPEN and stays in `pending/`.**

Two edits, in this order.

**Edit A1 — correct the fifth Verification bullet at line 168.** It currently reads:

  `- Confirm the run log contains NO ::warning::Signing skipped line.`

A reader following that literally on the 2026-09-23 PASSING run reaches the OPPOSITE of the truth.
The string `::warning::Apple notarization credentials are set but signing is not fully configured;
skipping notarization` DOES appear in the macOS job log of run `35841476015` — as the step's own
SCRIPT SOURCE, echoed by the runner with a cyan `[36;1m` prefix, NOT as an emitted annotation. The
only real `##[warning]` in that whole job is the Node.js 20 deprecation notice.

Replace the bullet with guidance that survives contact with a real log: grep for `##[warning]`
specifically (the runner's rendering of an EMITTED annotation) rather than for the bare `::warning::`
form (which matches a script's own source text), and cross-check by counting `Notarizing` lines —
2 means notarization actually ran. Keep it a single bullet in the existing list; state the trap in one
following sub-bullet or parenthetical so the correction travels with the instruction rather than
living only in a STATUS section further down.

**Edit A2 — append a new `## STATUS 2026-09-23 (quick-260923-uvt)` section.** Place it at the same
level as the existing `## STATUS 2026-09-14` / `## STATUS 2026-09-17` sections. Open it with the
convention this file's siblings use: this section does NOT revise the sections above it; each records
what was believed then and is left intact.

It must contain, and nothing here may be softened:

1. **Run identity.** Tag `v0.7.0-notarize-test3` at commit `c946239ce`; GitHub Actions run
   `35841476015`; macOS job `107117309605`; submission `0f65332c-56c8-484d-822a-13163bc14ddb`,
   `Accepted` in 1m09s, then `Stapling app...`. Artifact `GameLib_0.7.0_aarch64.dmg`, 97083599 bytes,
   sha256 `c74717b59421119eaacce55c51ff153222c9e03296f87d817ed422423dba669c`, from draft release
   `378785323`.

2. **Three of THIS TODO'S OWN five Verification bullets are SATISFIED**, on a real published
   artifact rather than a local build. Present them as a table mapping bullet -> verbatim evidence,
   using the strings in `EVIDENCE.md` exactly:
   - `codesign -dv --verbose=4` -> `Authority=Developer ID Application: grayson mitchell (S7U223QWXJ)`,
     `flags=0x10000(runtime)`, `Notarization Ticket=stapled`, `TeamIdentifier=S7U223QWXJ`. Not adhoc.
   - `spctl -a -vvv -t install` -> `GameLib.app: accepted`, `source=Notarized Developer ID`,
     `SPCTL_RC=0`.
   - `xcrun stapler validate` -> `The validate action worked!`, `STAPLER_RC=0`.

3. **The fourth bullet is STILL OWED, and is residual (a).** The browser-download arm. `needs:
   release-run-then-browser-download-verify` already names it and needs no change — this todo has
   been carrying the right `needs:` value all along.

4. **The near-miss, recorded because it is worth recording.** This todo WARNED IN ADVANCE that
   `curl` does not set the quarantine attribute. The 2026-09-23 verification fetched the dmg through
   the GitHub API anyway and hit precisely that trap: `xattr -l` on the downloaded dmg showed
   `com.apple.diskimages.recentcksum` and `com.apple.provenance` only — **no `com.apple.quarantine`**.
   `spctl -t exec` is an assessment performed on request; it is NOT the quarantined first-launch
   dialog a real user meets. The warning was right and was not heeded. Write it that way — not as
   "the check was slightly incomplete".

5. **Residual (c), carried here — see this plan's `<finding_a_third_live_item>`.** Recipe step 6's
   in-app invocations (an Epic login via `legendary`, an Amazon library refresh via `nile`, a GOG
   action via `gogdl`) were NOT performed; they need credentials and a human. State that this arrives
   from the now-closed notarization todo's u3o item 8(c), that it is a human-gated errand rather than
   a defect risk, and that it is tracked here because it is the same shape as the browser-download
   bullet — both are live-gate errands against a published artifact, and they should be run in the
   same sitting. Do NOT add it to `needs:` (that key is fenced by the brief); name it in the prose.

6. **The 60-minute bound, one sentence.** `timeout-minutes: 60` on the `tauri-action` step (shipped
   by quick-260923-mrx) was exercised once and never approached — step 19 took 8m32s end to end, of
   which notarization was 1m09s. Frame it exactly as u3o item 4 did: ONE datapoint, on a DIFFERENT
   submission from np3's; it SUPPORTS but does not prove that np3's 2h05m37s silence was
   `notarytool`'s wait rather than Apple being slow, and it does NOT settle p95 item 6, because Apple
   exposes `uploadDate` and no `completedDate`. Recorded here only because the file that used to hold
   it is being closed.

7. **The title is now partly false — state it plainly.** A signed and notarized artifact HAS been
   published, to the `v0.7.0` draft release, and verified. The todo stays OPEN because the
   browser-download arm of `needs:` is genuinely outstanding. Include the two open proposals from
   this plan's `<proposals_for_the_operator>` (severity `major -> minor`; title restatement) as
   explicitly unapplied proposals awaiting the operator.

8. **A pointer to the closed sibling** at its NEW path:
   `.planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md`,
   closed by `quick-260923-uvt`.

**Do NOT change `needs:`, `status:`, `severity:`, `platform:`, `ready:`, `created:`, `title:`,
`area:`, `found_by:`, `source:` or `files:` on FILE A.** The frontmatter gate forces nothing —
measured during planning, its three triage keys are already valid and in the required order. Line 71's
bare-filename reference to the notarization todo is also left ALONE: it carries no directory, so the
move does not break it.

**FILE B — create
`.planning/todos/pending/2026-09-23-steam-bridge-helper-never-spawned-by-the-sidecar-only-direct-exec-proven.md`.**

Frontmatter, keys in this order, values BARE, lowercase and exact — never quoted, never capitalised
(CLAUDE.md's todo triage section; the gate matches `^severity: (critical|major|medium|minor)$` and
rejects `"minor"`). `platform:` immediately after `severity:`; `ready:` immediately after `platform:`:

  created: 2026-09-23T00:00:00.000Z
  title: '<one line naming the gap: the helper is proven by DIRECT exec from inside the notarized bundle, never spawned BY the sidecar>'
  area: build
  severity: minor
  platform: macos
  ready: live-gate
  needs: <a short kebab phrase naming the gate, e.g. spawn-helper-via-sidecar-with-steam-running>
  status: OPEN
  found_by: 'GitHub Actions run 35841476015, macOS job 107117309605, on tag v0.7.0-notarize-test3 at commit c946239ce. Extracted by quick task 260923-uvt from the notarization todo''s u3o item 8(b).'
  source: '.planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md'
  files:
    - src/backend/storeManagers/steam/bridge/helperProcess.ts
    - meta/signMachOResources.ts
    - meta/steam-bridge-helper.entitlements.plist

**`source:` must point at the `completed/` path** — that is where the file will be when this task's
sibling finishes, and a `source:` that 404s is the exact defect Task 2 repairs on the updater todo.

Body:

- **What IS proven.** `steam-bridge-helper`, run by DIRECT exec from inside the notarized bundle
  (`ditto`'d off the read-only dmg), loaded Valve's `libsteam_api.dylib` and reached
  `SteamAPI_Init()`. Quote the four verbatim log lines from `EVIDENCE.md` — the three `[S_API]`
  lines and the `INIT`/`LISTEN` pair. State the load-bearing reasoning: those `[S_API]` lines are
  emitted BY Valve's dylib, so their presence proves `dlopen` SUCCEEDED; it failed at
  `SteamAPI_Init()` only because Steam was not running, the normal condition on this machine and
  identical to q6w's ad-hoc control (1). The Team ID mismatch that killed the helper in q6w is gone.
  The binary carries exactly one entitlement, `com.apple.security.cs.disable-library-validation`,
  under `flags=0x10000(runtime)` with `TeamIdentifier=S7U223QWXJ`.

- **What is NOT proven.** It was never spawned BY the sidecar. Steam was not running, so the app
  never needed it —
  `src/backend/storeManagers/steam/games.ts:2164` (`launchBridgeGame()` -> `ensureBridgeHelperReady()`)
  is reached only for a bridge-allowlisted title, and it is that call that spawns the helper at
  `src/backend/storeManagers/steam/bridge/helperProcess.ts:151`.

- **Be honest about the risk level rather than inflating it to justify the file.** The
  hardened-runtime library-validation check binds to the binary's OWN signature and entitlement, not
  to whoever spawns it, so this SHOULD behave identically under a sidecar spawn. **This todo exists
  because "permitted is not observed" is the exact assumption that cost this thread a week — it is
  confirmation, not suspicion.** Use those terms. `severity: minor` is justified on exactly that
  basis, in CLAUDE.md's vocabulary: a latent trap with no live consequence.

- **Verification.** With Steam running AND signed in, launch the app from the notarized bundle and
  drive the in-app path that spawns the helper — launch a bridge-allowlisted Steam game. Confirm the
  helper reaches `SteamAPI_Init()` rather than dying at `dlopen` with
  "mapping process and mapped file (non-platform) have different Team IDs". Note the negative
  control that makes a pass meaningful: under an isolated fake `HOME` this defect presents as a
  harmless MISSING-FILE `dlopen` error, because a fresh profile has no Steam installed — so this is
  a deliberate real-profile arm under CLAUDE.md's two-profile rule, and an isolated-only run would
  be green against the defect forever.

- **`## Related`** naming the closed notarization todo at its `completed/` path and the parent
  `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`.

**Envelope-tag hygiene (both files).** `.planning/planning-envelope-tag-gate.py` fails on a file
whose LAST line is a bare closing envelope tag with no opening tag earlier in the file. Do not leave
one. Neither file ends in a tag of any kind.
  </action>
  <verify>
    <automated>
cd /Users/graysonmitchell/Projects/GameLib && set -e
A=.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md
B=.planning/todos/pending/2026-09-23-steam-bridge-helper-never-spawned-by-the-sidecar-only-direct-exec-proven.md

# FILE A: the new section exists, and the fenced frontmatter keys are byte-identical to HEAD.
grep -qc 'STATUS 2026-09-23 (quick-260923-uvt)' "$A"
test "$(git diff "$A" | grep -cE '^[-+](needs|status|severity|platform|ready|created|area|title|found_by|source):')" -eq 0

# FILE A: residual (a) is still named by needs:, unchanged.
grep -q '^needs: release-run-then-browser-download-verify$' "$A"

# FILE A: the fifth bullet no longer tells a reader to grep the bare ::warning:: form as a pass test.
grep -q '##\[warning\]' "$A"

# FILE B: frontmatter triage keys BARE, lowercase, exact, in CLAUDE.md's required order.
awk 'NR>1 && /^---$/{exit} NR>1' "$B" > /tmp/uvt_fm.txt
grep -q '^severity: minor$'     /tmp/uvt_fm.txt
grep -q '^platform: macos$'     /tmp/uvt_fm.txt
grep -q '^ready: live-gate$'    /tmp/uvt_fm.txt
# ORDER: CLAUDE.md requires platform immediately after severity, ready immediately after platform.
test "$(grep -n '^severity:\|^platform:\|^ready:' /tmp/uvt_fm.txt | awk -F'[:]' '{printf "%s ", $2}')" = "severity platform ready "
# CONTROL, other direction: the same construct must REPORT a wrong order rather than silently pass.
printf 'platform: macos\nseverity: minor\nready: live-gate\n' > /tmp/uvt_order_ctl.txt
test "$(grep -n '^severity:\|^platform:\|^ready:' /tmp/uvt_order_ctl.txt | awk -F'[:]' '{printf "%s ", $2}')" = "platform severity ready "

# FILE B: source: points at completed/, NOT pending/ -- a source: that 404s is the defect Task 2 repairs.
grep -q "^source: '\.planning/todos/completed/2026-09-17-notarization-rejects" "$B"
test "$(grep -c "^source: '\.planning/todos/pending/2026-09-17-notarization-rejects" "$B")" -eq 0

# FILE B: carries the verbatim proof, not a paraphrase of it.
grep -q 'SteamAPI_Init()' "$B"
grep -q 'different Team IDs' "$B"

# CONTROL, both directions, for the "source: is not the pending path" assertion above.
# It must FIRE on a string that genuinely contains the pending path -- otherwise a zero proves nothing.
printf "source: '.planning/todos/pending/2026-09-17-notarization-rejects-x.md'\n" > /tmp/uvt_ctl.txt
test "$(grep -c "^source: '\.planning/todos/pending/2026-09-17-notarization-rejects" /tmp/uvt_ctl.txt)" -eq 1

# Envelope-tag gate + triage gate over the new pending population.
pnpm planning-gates 2>&1 | tail -3 | grep -q '12/12 planning gates passed'

# Scope gate.
test "$(git diff --name-only | grep -cE '^(src|meta|src-tauri|\.github)/')" -eq 0
echo "TASK 1 OK"
    </automated>
  </verify>
  <done>
`.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` carries a
`## STATUS 2026-09-23 (quick-260923-uvt)` section recording three SATISFIED Verification bullets with
verbatim evidence, the still-owed browser-download bullet, the curl/quarantine near-miss, residual
(c), the 60-minute sentence, and the two unapplied proposals — with its frontmatter byte-unchanged
and its fifth bullet corrected to `##[warning]` plus a `Notarizing` count.
`.planning/todos/pending/2026-09-23-steam-bridge-helper-never-spawned-by-the-sidecar-only-direct-exec-proven.md`
exists, is gate-valid, `source:`-points at the `completed/` path, and states the risk as confirmation
rather than suspicion. Planning gates 12/12.
  </done>
</task>

<task type="auto">
  <name>Task 2: Close the notarization todo, move it, and repoint the one pointer that breaks</name>
  <files>
.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md,
.planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md,
.planning/todos/pending/2026-09-23-macos-updater-manifest-can-never-gain-a-macos-entry-bundle-targets-omits-app.md
  </files>
  <action>
**Precondition — re-run the third-live-item grep before touching anything.** This plan's
`<finding_a_third_live_item>` found two items beyond residuals (a) and (b), and Task 1 gave both a
home. Confirm nothing else surfaced: grep the body for `STILL OWED`, `NOT VERIFIED`, `Cleanup owed`,
`open risk`, `UNOBSERVED`, `not covered`. Every hit must resolve to one of: superseded by a later
STATUS section (hazards 2/3 by p95, hazard 4 by u3o item 6), extracted already (the updater manifest,
by u3o), or carried by Task 1 (residuals a/b/c and the 60-minute bound). **If a hit resolves to none
of those, STOP and report it rather than closing over it.**

**Edit 1 — frontmatter, matching the Linux todo's closure convention exactly
(`.planning/todos/completed/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md`,
lines 9-11):**

- `status: OPEN` -> `status: completed`
- insert `resolved: 2026-09-23` on the line after `status:`
- insert `resolved_by: quick-260923-uvt` on the line after `resolved:`

**Leave `severity: minor`, `platform: macos`, `ready: live-gate`, `needs:`, `created:`, `title:`,
`area:`, `found_by:`, `source:` and `files:` untouched** — the Linux precedent keeps `needs:` and
`ready:` as-is on close, and the triage gate scopes to `pending/` only, so the moved file leaves that
population entirely and nothing forces a change.

**Edit 2 — append a short closing section** in the style of the Linux todo's
`## Verification — SATISFIED ...`. It must:

- **Point at, not restate,** `### STATUS 2026-09-23 (quick-260923-u3o)`. That section is the evidence
  and it is already in this file. Do not duplicate its tables.
- **State what discharged the todo:** every clause of its TITLE is measured false as a live
  condition. "macOS notarization REJECTED" -> Apple returned `Accepted` for
  `0f65332c-56c8-484d-822a-13163bc14ddb` in 1m09s and stapled the app. "253 unsigned
  Contents/Resources binaries Tauri never signs" -> the survivor count over those same 253 in the
  PUBLISHED artifact is `files=501 mach-o=253 survivors=0`, with both controls run FIRST
  (`survivors=0` negative, `survivors=253` positive). All four helpers carry the Developer ID
  authority under `flags=0x10000(runtime)`; `steam-bridge-helper` reaches `SteamAPI_Init()` from
  inside the notarized bundle.
- **Say WHERE each residual went, by name and path.** (a) quarantined first launch -> the parent
  `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`, whose existing
  `needs: release-run-then-browser-download-verify` already named it and needed no change.
  (b) sidecar-spawned helper -> the new
  `2026-09-23-steam-bridge-helper-never-spawned-by-the-sidecar-only-direct-exec-proven.md`.
  (c) in-app invocations and the 60-minute bound -> also the parent `2026-09-04` todo, with a
  one-line note that this plan considered and rejected giving each its own file, and why.
- **Discharge u3o item 10 BY ADDITION, in this new text, without editing item 10.** Measured
  2026-09-23 during this task's planning: `git ls-remote --tags origin` and
  `git for-each-ref refs/tags` both return nothing matching `notarize`, so tag
  `v0.7.0-notarize-test3` is gone from origin and locally. u3o item 10's "still on origin and locally
  **as of this writing**" was TRUE when written and is correctly scoped as history — p95 item 8 sets
  this precedent explicitly and says not to "fix" it. Do not edit it.
- **Bound the closure honestly.** Closing this file does not mean macOS signing is finished; it means
  THIS defect — Apple rejecting 253 unsigned binaries — is discharged and its residuals have moved.
  The parent `2026-09-04` todo remains OPEN.

**Edit 3 — the move. THIS REPO HAS BEEN BITTEN THREE TIMES; follow the order exactly.**
`git mv` commits HEAD content and silently drops unstaged edits (memory
`git-mv-commits-head-content-not-your-unstaged-edits`; instance #3 was caught PRE-commit only by
inspecting the staged blob). Therefore:

1. Make Edits 1 and 2 in the working tree at the PENDING path.
2. `git add` the file at the PENDING path.
3. ONLY THEN `git mv .planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md .planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md`
4. **Verify the STAGED blob, not the working tree**, with
   `git show :.planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md`.
   It must contain `^status: completed$` and `^resolved_by: quick-260923-uvt$`. Do this BEFORE any
   commit. If the staged blob still reads `status: OPEN`, the `git mv` ate the edits — re-apply them
   at the new path, `git add`, and re-check.

**Edit 4 — repoint the ONE live pointer that breaks.** In
`.planning/todos/pending/2026-09-23-macos-updater-manifest-can-never-gain-a-macos-entry-bundle-targets-omits-app.md`:

- **Line 9** — `source: '.planning/todos/pending/2026-09-17-notarization-...md'` is a FULL PATH that
  becomes wrong. Change `pending` -> `completed`. Nothing else on that line.
- **Line 143** — the `## Related` entry is a BARE FILENAME and does NOT break. Leave the reference
  itself intact; append a short note that the todo is now completed (closed by `quick-260923-uvt`)
  so a reader knows where it lives.

**Touch nothing else.** `2026-09-04-...md` line 71 is a bare filename with no directory — it does not
break, and Task 1 already mentions the closure in prose. Every quick-task `PLAN.md`/`SUMMARY.md` and
every file already under `completed/` that names this filename is HISTORY: leave all 19 of them
byte-unchanged.
  </action>
  <verify>
    <automated>
cd /Users/graysonmitchell/Projects/GameLib && set -e
OLD=.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
NEW=.planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
UPD=.planning/todos/pending/2026-09-23-macos-updater-manifest-can-never-gain-a-macos-entry-bundle-targets-omits-app.md

# The file moved.
test ! -e "$OLD"
test -e "$NEW"

# THE STAGED BLOB is what matters -- git mv has eaten worktree edits here three times.
git show ":$NEW" | awk 'NR>1 && /^---$/{exit} NR>1' > /tmp/uvt_closed_fm.txt
grep -q '^status: completed$'              /tmp/uvt_closed_fm.txt
grep -q '^resolved: 2026-09-23$'           /tmp/uvt_closed_fm.txt
grep -q '^resolved_by: quick-260923-uvt$'  /tmp/uvt_closed_fm.txt
test "$(grep -c '^status: OPEN$' /tmp/uvt_closed_fm.txt)" -eq 0

# CONTROL for the staged-blob check, the other direction: HEAD's copy at the OLD path
# must still read OPEN. If this is also 'completed', the check above proves nothing.
git show "HEAD:$OLD" | awk 'NR>1 && /^---$/{exit} NR>1' | grep -q '^status: OPEN$'
test "$(git show "HEAD:$OLD" | grep -c '^resolved_by:')" -eq 0

# Fenced keys unchanged across the move.
git show ":$NEW" | grep -q '^severity: minor$'
git show ":$NEW" | grep -q '^platform: macos$'
git show ":$NEW" | grep -q '^ready: live-gate$'
git show ":$NEW" | grep -q '^needs: quarantined-first-launch-and-sidecar-spawned-helper$'

# Both residuals have a NAMED destination in the closing text.
git show ":$NEW" | grep -q '2026-09-04-macos-releases-ship-unsigned-and-unnotarized'
git show ":$NEW" | grep -q 'steam-bridge-helper-never-spawned-by-the-sidecar'

# u3o item 10's historical wording was NOT edited.
git show ":$NEW" | grep -q 'still on origin and locally \*\*as of this writing\*\*'

# Git sees a rename, not a delete+add.
git status --porcelain | grep -q '^R.*2026-09-17-notarization-rejects'

# The updater todo's source: resolves to a file that exists.
grep -q "^source: '\.planning/todos/completed/2026-09-17-notarization-rejects" "$UPD"
test -e "$(grep "^source: '" "$UPD" | sed "s/^source: '//; s/'$//")"

# NO live pending file points at the old pending path.
test "$(grep -rl 'todos/pending/2026-09-17-notarization-rejects' .planning/todos/pending/ | wc -l | tr -d ' ')" -eq 0

# CONTROL, both directions, for that absence check -- this repo has shipped greps that
# passed on the UNEDITED tree. The same grep must return 1 against HEAD's copy of the
# updater todo, which genuinely carried the pending path.
test "$(git show "HEAD:$UPD" | grep -c 'todos/pending/2026-09-17-notarization-rejects')" -eq 1

# Historical artifacts left byte-unchanged: no .planning/quick/ file appears in the changed set.
test "$( (git diff --name-only HEAD; git diff --name-only) | sort -u | grep -c '^\.planning/quick/' )" -eq 0

pnpm planning-gates 2>&1 | tail -3 | grep -q '12/12 planning gates passed'
test "$( (git diff --name-only HEAD; git diff --name-only) | sort -u | grep -cE '^(src|meta|src-tauri|\.github)/')" -eq 0
echo "TASK 2 OK"
    </automated>
  </verify>
  <done>
The notarization todo lives at
`.planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md`
with `status: completed` / `resolved: 2026-09-23` / `resolved_by: quick-260923-uvt` **proven in the
STAGED blob**, git records it as a rename, its closing section names where all four carried items
went and discharges the tag cleanup by addition, the updater todo's `source:` resolves to a file that
exists, no live pending file cites the old pending path (control-tested both directions), no
`.planning/quick/` file changed, and planning gates are 12/12.
  </done>
</task>

<task type="auto">
  <name>Task 3: Update STATE.md, then run the full verification battery</name>
  <files>.planning/STATE.md</files>
  <action>
**Edit 1 — add the quick-task row.** The `### Quick Tasks Completed` table starts at line 5568 with
header `| # | Description | Date | Status | Directory |`. Its last row is `260923-u3o` at line 5968.
Append a `260923-uvt` row immediately after it (this also keeps the tail of the table sorted, since
`u3o` < `uvt`). Five columns, matching the siblings:

- **#** — `260923-uvt`
- **Description** — bolded lead sentence then detail, in the house style. Must carry: the
  notarization todo is CLOSED and moved to `completed/`, discharged because every clause of its title
  is measured false (Apple `Accepted` `0f65332c-56c8-484d-822a-13163bc14ddb`, stapled,
  `survivors=0` over 253 in the published artifact); **three of the parent 2026-09-04 todo's OWN five
  Verification bullets are now SATISFIED** on a real published artifact (`codesign` naming the
  Developer ID authority, `spctl` `source=Notarized Developer ID`, `stapler` rc=0), and its
  browser-download bullet is the still-owed residual (a) that its existing `needs:` already named;
  residual (b) became a new `minor` todo; **and the plan's grep found TWO MORE live items in the body
  — recipe step 6's in-app invocations and the 60-minute bound — which were carried into the parent
  todo rather than discarded.** Note the fifth-bullet CORRECTION: the bare `::warning::Signing
  skipped` test is unreliable because the runner echoes a step's own script source with a cyan
  `[36;1m` prefix, so the bullet now says grep `##[warning]` and count `Notarizing` lines.
- **Date** — `2026-09-23`
- **Status** — `**COMPLETE.** Documentation only; no source, workflow, tag or release touched.` plus:
  planning-gates 12/12; the staged blob (not the worktree) was checked for `status: completed` before
  commit, per the three-times-bitten `git mv` trap; **NOT VERIFIED** — quarantined first launch, a
  sidecar-spawned helper, and step 6's in-app invocations all still need a live gate and a human;
  measured during this task: tag `v0.7.0-notarize-test3` is already gone from origin and locally, so
  u3o item 10's cleanup is discharged. Also state the two unapplied proposals on the parent todo
  (severity `major -> minor`, and its now partly-false title).
- **Directory** — `[260923-uvt-close-notarization-todo-extract-residual](.planning/quick/260923-uvt-close-notarization-todo-extract-residual/)`

**Edit 2 — rewrite the WHOLE of line 3944, the `Last activity:` body line.** It is currently 1571
characters and describes 260923-u3o and 260923-o2s.

**REWRITE THE ENTIRE LINE. Do not splice a prefix onto it.** Memory
`state-md-narrative-fields-get-silently-truncated` records a previous session prepending to this
field and leaving a stale suffix behind; the discipline is to emit the whole line and then read it
back in full.

The new line must:
- keep the `Last activity: 2026-09-23 -- ` opening shape;
- lead with 260923-uvt: the notarization todo is CLOSED and moved; residual (a) stays with the parent
  2026-09-04 todo, whose existing `needs:` already named it and three of whose five Verification
  bullets are now SATISFIED; residual (b) became a new `minor` todo; two FURTHER live items found in
  the body (in-app invocations, the 60-minute bound) were carried into the parent rather than
  discarded; the parent's fifth bullet was corrected from the bare `::warning::` grep to `##[warning]`
  plus a `Notarizing` count;
- **PRESERVE the 260923-o2s clause verbatim — it belongs to another session.** It currently ends:
  `(2) Quick task 260923-o2s: fixed isWritable_windows (ACL group-grant blindness), which unblocked
  Phase 38 item 38-S08 -- re-scored PASS the same day in sitting 2 on the operator's Windows host.`
  Carry that sentence through unchanged, as the final clause;
- stay a SINGLE line. No embedded newline.

**Edit 3 — none. Do NOT touch the frontmatter `last_activity` key at line 8.** It is stale
(`260923-b31`) and out of scope. The verify block asserts it was not touched — an out-of-scope key
left alone deliberately is different from one left alone by accident, and only an assertion tells
them apart.

**Then run the full battery below.** Do not run the jest suite — this task writes no code and a
suite run would be a green check over an unrelated population.
  </action>
  <verify>
    <automated>
cd /Users/graysonmitchell/Projects/GameLib && set -e
S=.planning/STATE.md

# The quick-task row exists, in the right table, with 5 columns and the right directory link.
grep -q '^| 260923-uvt |' "$S"
test "$(grep '^| 260923-uvt |' "$S" | awk -F'|' '{print NF}')" -eq 7
grep '^| 260923-uvt |' "$S" | grep -q '260923-uvt-close-notarization-todo-extract-residual'

# Exactly ONE Last activity line, and it is ONE line.
test "$(grep -c '^Last activity:' "$S")" -eq 1

# PREFIX rewritten: it leads with uvt, not u3o.
grep '^Last activity:' "$S" | grep -q '260923-uvt'

# SUFFIX PRESERVED -- the o2s clause belongs to another session. This is the assertion the
# prepend-and-strand trap defeats; memory state-md-narrative-fields-get-silently-truncated.
grep '^Last activity:' "$S" | grep -q "re-scored PASS the same day in sitting 2 on the operator's Windows host\.$"
grep '^Last activity:' "$S" | grep -q '260923-o2s'

# NO stale u3o-led prefix left stranded mid-line.
test "$(grep '^Last activity:' "$S" | grep -c 'TWO CONCURRENT SESSIONS')" -eq 0

# Read the whole line back, in full, for a human eye -- not a truncating scan.
grep '^Last activity:' "$S" | fold -w 110

# The out-of-scope frontmatter key was NOT touched.
test "$(git diff "$S" | grep -cE '^[-+]last_activity:')" -eq 0
test "$(git diff "$S" | grep -cE '^[-+]last_updated:')" -eq 0

# ===== FULL BATTERY =====

# 1. Planning gates hold at the HEAD baseline measured during planning (12/12 at 6dabb9e37).
#    The moved file LEAVES the pending population the triage gate scopes to; the new todo JOINS it.
pnpm planning-gates 2>&1 | tail -3 | grep -q '12/12 planning gates passed'

# 2. The move: present at completed, absent at pending, staged blob correct, recorded as a rename.
test -e .planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
test ! -e .planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
git show ':.planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md' \
  | awk 'NR>1 && /^---$/{exit} NR>1' | grep -q '^status: completed$'
git show ':.planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md' \
  | awk 'NR>1 && /^---$/{exit} NR>1' | grep -q '^resolved_by: quick-260923-uvt$'
git status --porcelain | grep -q '^R.*2026-09-17-notarization-rejects'

# 3. No live pending file cites the old pending path -- control-tested in Task 2 both directions.
test "$(grep -rl 'todos/pending/2026-09-17-notarization-rejects' .planning/todos/pending/ | wc -l | tr -d ' ')" -eq 0

# 4. SCOPE GATE: nothing under src/, meta/, src-tauri/ or .github/ changed, staged or unstaged.
test "$( (git diff --name-only HEAD; git diff --name-only) | sort -u | grep -cE '^(src|meta|src-tauri|\.github)/')" -eq 0
#    CONTROL for that gate, the other direction: the same predicate must MATCH a real such path,
#    otherwise a zero could come from a broken regex rather than from a clean tree.
test "$(printf 'src/backend/x.ts\nmeta/y.ts\n.github/workflows/z.yml\n' | grep -cE '^(src|meta|src-tauri|\.github)/')" -eq 3

# 5. The changed set is EXACTLY the six planned paths and nothing else.
(git diff --name-only HEAD; git diff --name-only) | sort -u > /tmp/uvt_changed.txt
cat /tmp/uvt_changed.txt
test "$(grep -cv -e '^\.planning/todos/' -e '^\.planning/STATE\.md$' -e '^\.planning/quick/260923-uvt' /tmp/uvt_changed.txt)" -eq 0

# 6. PRETTIER IS VACUOUS ON THESE PATHS -- stated, not run as evidence.
#    .prettierignore line 29 is a bare `.planning` entry, so `npx prettier --check` over any path
#    under .planning/ exits 0 while checking NOTHING (memory:
#    prettier-check-over-a-planning-path-is-vacuous). CLAUDE.md's mandatory formatter check is
#    therefore satisfiable-but-meaningless here, and its exit code is NOT accepted as evidence in
#    this plan. This assertion proves the exemption is real rather than assumed:
grep -q '^\.planning$' .prettierignore

# 7. The jest suite was NOT run -- deliberately. No code changed, so a green suite would be a
#    green check over an unrelated population.
echo "TASK 3 OK"
    </automated>
  </verify>
  <done>
`.planning/STATE.md` carries a `260923-uvt` row in `### Quick Tasks Completed` and a wholly-rewritten
single-line `Last activity:` that leads with uvt and ends with the o2s clause byte-preserved, with
the frontmatter `last_activity`/`last_updated` keys provably untouched. Planning gates 12/12; the
notarization todo is at the completed path with a correct STAGED blob and a git-recorded rename; no
live pending file cites the old path; the changed set is exactly the planned `.planning/` paths; and
the prettier exemption is asserted rather than assumed.
  </done>
</task>

</tasks>

<verification>

Phase-level checks, beyond the per-task blocks:

1. **Nothing was discarded.** Four items lived in the closed todo's BODY and none of them lived in
   its title: residual (a) quarantined first launch, residual (b) sidecar-spawned helper, residual
   (c) in-app invocations, and the 60-minute bound. Each must be reachable from a LIVE pending file
   after the move. Check by following each one: (a) and (c) and the 60-minute note in
   `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`; (b) in the new todo.

2. **The ordering held.** Task 1 (carry) ran before Task 2 (close). If the executor reordered them,
   there was a window in which the residuals had no home — re-check the residuals rather than
   trusting the end state.

3. **`git show :` was used, not `cat`.** The whole point of this repo's three `git mv` incidents is
   that the working tree can look right while the index holds HEAD content. A verification that read
   the worktree proves nothing about what is about to be committed.

4. **Both "absence" assertions were control-tested.** The "no live pending file cites the old path"
   grep must have been shown to return 1 against `HEAD`'s copy of the updater todo, and the scope
   regex must have been shown to match a synthetic `src/`/`meta/`/`.github/` path. A bare zero from
   an unproven grep is this repo's most-recorded false green.

</verification>

<success_criteria>

- [ ] `.planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md` exists; the pending path does not; `git status` shows a rename.
- [ ] Its STAGED blob carries `status: completed`, `resolved: 2026-09-23`, `resolved_by: quick-260923-uvt`, with `needs:`, `severity:`, `platform:`, `ready:` unchanged.
- [ ] Its closing section points at the u3o section rather than restating it, names a destination for every carried item, and discharges the tag cleanup by ADDITION without editing u3o item 10.
- [ ] `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` stays OPEN in `pending/` with byte-unchanged frontmatter, gains a `## STATUS 2026-09-23 (quick-260923-uvt)` section, and its fifth Verification bullet now names `##[warning]` and a `Notarizing` count instead of the bare `::warning::` grep.
- [ ] `2026-09-23-steam-bridge-helper-never-spawned-by-the-sidecar-only-direct-exec-proven.md` exists, is triage-gate-valid (`severity: minor` / `platform: macos` / `ready: live-gate`, bare and in order), `source:`-points at the `completed/` path, and frames the risk as confirmation rather than suspicion.
- [ ] The updater todo's `source:` resolves to a file that exists; its `## Related` bare filename is intact with a completed-note appended.
- [ ] No file under `.planning/quick/` or any other `completed/` todo changed.
- [ ] `.planning/STATE.md`: one `260923-uvt` row; one single-line `Last activity:` leading with uvt and ending with the o2s clause verbatim; `last_activity`/`last_updated` frontmatter untouched.
- [ ] `pnpm planning-gates` 12/12 (baseline measured 12/12 at HEAD `6dabb9e37`).
- [ ] `git diff --name-only HEAD` contains nothing under `src/`, `meta/`, `src-tauri/` or `.github/`, with the regex control-tested.
- [ ] Prettier is recorded as VACUOUS on `.planning/` paths (bare `.planning` at `.prettierignore:29`) and its exit code is cited nowhere as evidence.
- [ ] The jest suite was not run.

</success_criteria>

<output>
Create `.planning/quick/260923-uvt-close-notarization-todo-extract-residual/SUMMARY.md` when done.
</output>
