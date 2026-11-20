---
phase: quick-260916-gdg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/research/questions.md
  - .planning/todos/pending/2026-08-27-answer-q2-what-cheapshark-to-isthereanydeal-migration-actual.md
  - .planning/seeds/aggregated-discovery-multi-provider-deals.md
  - .planning/notes/aggregated-store-search-foundations.md
autonomous: true
requirements:
  - 260916-gdg-R1   # questions.md Q2 marked ANSWERED using the Q3 blockquote convention, digest only
  - 260916-gdg-R2   # pending todo re-premised: 4 of 5 answered, 3 named human gates remain, stays OPEN / ready: human
  - 260916-gdg-R3   # seed + note cross-referenced to the findings only where it genuinely helps a reader
user_setup: []

must_haves:
  truths:
    - "A reader opening .planning/research/questions.md sees Q2 marked ANSWERED in the same blockquote shape Q3 uses, and can tell from that blockquote alone that search migration is recommended and the Discounts half is gated on a written reply from ITAD."
    - "The Q2 digest preserves evidence grades: country/currency coverage is stated as UNKNOWN, and the Steam AppID batch lookup is stated as MEASURED live without a key."
    - "The Q2 question body below the blockquote is left intact, exactly as Q3/Q4 leave theirs."
    - "The pending todo no longer claims the answer is unknown, and names the three remaining human gates explicitly."
    - "The pending todo is still OPEN, still ready: human, and still passes the CI triage-frontmatter gate."
    - "No file under src/ is modified by this task."
  artifacts:
    - path: ".planning/research/questions.md"
      provides: "Q2 ANSWERED digest under the Q2 heading"
      contains: "ANSWERED"
    - path: ".planning/todos/pending/2026-08-27-answer-q2-what-cheapshark-to-isthereanydeal-migration-actual.md"
      provides: "Re-premised todo scoped to the three remaining human gates"
      contains: "ready: human"
    - path: ".planning/quick/260916-gdg-answer-q2-cheapshark-to-itad-migration-cost/260916-gdg-RESEARCH.md"
      provides: "The authoritative findings (pre-existing, READ ONLY — do not edit)"
  key_links:
    - from: ".planning/research/questions.md"
      to: ".planning/quick/260916-gdg-answer-q2-cheapshark-to-itad-migration-cost/260916-gdg-RESEARCH.md"
      via: "path citation inside the Q2 blockquote"
      pattern: "260916-gdg"
    - from: ".planning/todos/pending/2026-08-27-answer-q2-what-cheapshark-to-isthereanydeal-migration-actual.md"
      to: ".planning/quick/260916-gdg-answer-q2-cheapshark-to-itad-migration-cost/260916-gdg-RESEARCH.md"
      via: "path citation in frontmatter files: list and in the body"
      pattern: "260916-gdg"
---

<objective>
Record an answer that has already been researched. `.planning/research/questions.md` Q2
(CheapShark → IsThereAnyDeal migration cost, open since 2026-07-12) is answered by
`260916-gdg-RESEARCH.md` in this directory. This plan writes that answer into the three
places a future reader will actually look, and re-premises the pending todo so it stops
claiming "we have not checked".

Purpose: an answered question that is only answered in a quick-task directory is an
unanswered question everywhere else.

Output: four edited planning documents. **Zero source files.**

Requirement IDs used in this plan (local to this quick task — there is no REQUIREMENTS.md):
- **R1** — questions.md Q2 marked ANSWERED, Q3's convention, digest not transcript
- **R2** — pending todo re-premised to the three remaining human gates, stays OPEN
- **R3** — seed + note cross-referenced, only where it earns its place
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260916-gdg-answer-q2-cheapshark-to-itad-migration-cost/260916-gdg-RESEARCH.md
@.planning/research/questions.md
@.planning/todos/pending/2026-08-27-answer-q2-what-cheapshark-to-isthereanydeal-migration-actual.md
@.planning/seeds/aggregated-discovery-multi-provider-deals.md
@.planning/notes/aggregated-store-search-foundations.md
@./CLAUDE.md
</context>

<ground_rules>
These are not style preferences. Each one is derived from a specific measured failure in this
repo; violating one produces a document that reads correctly and is wrong.

1. **RESEARCH.md is authoritative and READ-ONLY.** Do not re-derive, re-verify, re-probe, or
   "double-check" any claim in it. No network calls. No ITAD requests. No API key. If you find
   yourself wanting to confirm something, cite it instead.

2. **Never promote an evidence grade.** RESEARCH.md grades every claim MEASURED / SPEC /
   UNKNOWN and says explicitly: "Do not promote a grade when citing this file." Two grades are
   load-bearing here and are the easiest to get wrong in a digest:
   - The **list of covered countries/currencies is UNKNOWN** — the 14-country shop sweep
     returned an identical 34-shop list for every country, which *disproves* that endpoint as a
     coverage measure. The mechanism (a per-request `country` param, ISO 3166-1 alpha-2,
     default `US`) is SPEC and maps 1:1 onto `CatalogLocaleSettings.countryCode`. Do not let
     "the mechanism is answered" render as "coverage is answered".
   - The **Steam AppID batch lookup IS MEASURED live** — `POST /lookup/id/shop/61/v1` returned
     HTTP 200 with real gids and **no API key**. Say so. This is the single best news in the
     file and understating it is as wrong as overstating the others.
   - Rate limits (1000 req / 5 min), the terms-of-use clauses, and the `/deals/v2` capability
     set are **SPEC** — read from docs, not exercised. The `/deals/v2` freshness observation
     and the 34-shop list (incl. the **Amazon Games absence**) are MEASURED.

3. **Digest, do not transcribe.** RESEARCH.md is 268 lines. The Q2 blockquote is a signpost:
   verdict, gates, pointer. Q3's precedent is three lines. Do not paste tables or sections.

4. **Do not touch `src/`.** Specifically not `src/backend/storeSearch/cheapshark.ts`. The
   migration is *not* authorised by this task; only recording the answer is. `SEARCH_CURRENCY =
   'USD'` stays exactly where it is.

5. **Do not close the todo, and do not soften it to `ready: code`.** It genuinely still needs a
   human. Repo memory records a recurring failure mode — shipping part of a todo while leaving
   it open makes its *title* false. Guard against that here by re-premising the body rather
   than leaving a stale premise under a partially-satisfied title.

6. **Git staging:** use plain `git add <explicit paths>`. Do **not** use `gsd-sdk query commit`
   — it stages the whole tree, and this tree carries unrelated untracked files
   (`.claude/skills/archify/`, `skills-lock.json`, spike PNGs, an untracked `.scss`). Staging
   them into this docs commit would be a silent scope leak.
</ground_rules>

<tasks>

<task type="auto">
  <name>Task 1: Mark questions.md Q2 ANSWERED with a graded digest (R1)</name>
  <files>.planning/research/questions.md</files>
  <action>
Insert an `ANSWERED` blockquote immediately below the `## Q2 — What does migrating from
CheapShark to IsThereAnyDeal actually cost?` heading and above the `**Raised:**` line — the
exact position and shape Q3 and Q4 already use (`> **ANSWERED — YES.** …`, blockquote lines
prefixed `> `, blank line after). Leave every line of the existing Q2 body below it untouched;
Q3 and Q4 both preserve their original question bodies and this must match.

Q2's verdict is not a bare YES, so do not force one. Open with a split verdict — the two halves
carry different risk and RESEARCH.md's own recommendation splits them. The blockquote must
convey, in roughly 8–12 lines:

- **Verdict, split:** the StoreSearch price-checker migration is recommended — Phase 20's
  provider-neutral types survive essentially intact and `SEARCH_CURRENCY = 'USD'` is close to
  the only line that dies. The ITAD-backed **Discounts** screen must not be built yet.
- **The hard gate:** ITAD's terms say a client MUST NOT build "a competition to
  IsThereAnyDeal". A price-checker inside a launcher is plausibly fine; an aggregate
  deals-browsing screen is much closer to ITAD's own core product. This needs a written reply
  from `api@isthereanydeal.com` — a human asking, not code.
- **The sleeper cost:** the rate limit is per-key (SPEC: 1000 req / 5 min) and a desktop
  launcher ships one embedded key, so that budget is shared across the whole user base. A
  result cache becomes required rather than optional. Name it as a product decision still open.
- **The good news, graded MEASURED:** exact Steam AppID → ITAD gid mapping works in batch
  with no API key (`POST /lookup/id/shop/61/v1`), which is *better* than CheapShark's
  per-result `steamAppID` and does not consume the shared key budget. The owned-badge does not
  fall back to fuzzy matching.
- **The explicit UNKNOWN:** the list of covered countries/currencies is still unmeasured and
  needs a registered key. The region *mechanism* (per-request `country` param) is SPEC and maps
  1:1 onto `CatalogLocaleSettings.countryCode`.
- **Pointer:** full findings, with per-claim evidence grades, in
  `.planning/quick/260916-gdg-answer-q2-cheapshark-to-itad-migration-cost/260916-gdg-RESEARCH.md`.

Carry the grade words themselves (MEASURED / SPEC / UNKNOWN) into the blockquote where a claim
could otherwise be misread as measured. A reader must not have to open RESEARCH.md to learn
which of these were exercised live.

Do not edit Q1 or Q3–Q7. Do not renumber anything. Leave Q2's `**Blocks:**` line as-is — the
blockquote now qualifies it, and rewriting it would desynchronise the remaining reference to
the seed.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && Q2=$(awk '/^## Q2 /{f=1} f&&/^## Q3 /{exit} f' .planning/research/questions.md) && echo "$Q2" | grep -q '^> \*\*ANSWERED' && echo "$Q2" | grep -q 'UNKNOWN' && echo "$Q2" | grep -q 'MEASURED' && echo "$Q2" | grep -q '260916-gdg-RESEARCH.md' && echo "$Q2" | grep -q 'api@isthereanydeal.com' && test "$(echo "$Q2" | grep -c '^> ')" -ge 8 && test "$(echo "$Q2" | grep -c '^> ')" -le 16 && echo "$Q2" | grep -q '^\*\*Raised:\*\* 2026-07-12' && echo "$Q2" | grep -q '5. \*\*Interface delta\*\*' && test "$(grep -c '^## Q[1-7] ' .planning/research/questions.md)" -eq 7 && echo Q2_OK</automated>
  </verify>
  <done>
The Q2 section opens with an `> **ANSWERED` blockquote of 8–16 quoted lines that names the split
verdict, the ITAD terms email gate, a MEASURED claim, an UNKNOWN claim, and the RESEARCH.md
path. The original Q2 body (`**Raised:**` through item 5 and "Why it matters") is still present.
All seven question headings still exist. Negative control for this gate was confirmed at plan
time: the Q2 section contained zero occurrences of `ANSWERED` before this task.
  </done>
</task>

<task type="auto">
  <name>Task 2: Re-premise the pending todo to its three remaining human gates (R2)</name>
  <files>.planning/todos/pending/2026-08-27-answer-q2-what-cheapshark-to-isthereanydeal-migration-actual.md</files>
  <action>
The todo's premise — "`questions.md` Q2 … is still unanswered" — is now false for 4 of its 5
questions and for the additional 2026-08-27 Discounts question. Rewrite the body so the file
describes what is actually left, and add the findings file to the frontmatter `files:` list.

**Frontmatter — treat as CI-enforced, change only what is listed:**
- Keep `severity: minor`, `platform: any`, `ready: human` — bare, lowercase, in that order,
  unquoted. The gate (`.planning/todos/todo-frontmatter-gate.py`) parses only the block between
  the first `---` and the next `---`, and matches these values exactly and case-sensitively.
- Keep `status: OPEN`. Keep `created:`, `title:`, `area:`.
- `title:` may stay as-is ("Answer Q2 — what a CheapShark → IsThereAnyDeal migration actually
  costs") **only if** the body makes unmissable that the research half is done and what remains
  is three human actions. If you judge the title now misleads, retitle it to name the residue
  (e.g. an ITAD-access/terms/key-strategy framing) rather than leaving a false title over a
  re-premised body. State which you chose, and why, in the summary.
- Add `.planning/quick/260916-gdg-answer-q2-cheapshark-to-itad-migration-cost/260916-gdg-RESEARCH.md`
  to `files:`.
- Do **not** add `resolves_phase:` or any auto-close marker. This todo is not resolved.

**Body — replace `## Problem` and `## Solution` with content that says:**

1. **What is now answered** (brief, linked, graded): access is self-service but carries a "no
   competition" clause; region is a per-request `country` param mapping 1:1 onto
   `CatalogLocaleSettings`; rate limits are 1000/5min *per key* with one key shipped in the
   binary; Steam AppID matching works exactly and in batch with no key (**MEASURED**); the
   interface delta is small and `buildRedirectUrl()` plus the Phase 20 double-encoding pitfall
   both delete themselves. One sentence each, pointing at RESEARCH.md for detail.

2. **What is still open, as three named human actions** — this is the part the todo now exists
   for, so make it the most prominent section:
   - **Register an ITAD app** at `isthereanydeal.com/apps/my/`. Needs a human account. Unblocks
     the country/currency coverage measurement, which is still **UNKNOWN**, and any live test of
     search / prices / deals.
   - **Email `api@isthereanydeal.com`** about the "MUST NOT build a competition to
     IsThereAnyDeal" clause — describing GameLib as a desktop launcher and asking explicitly
     whether an in-app aggregate deals browser is permitted. State plainly that **this gates the
     Discounts-screen half only** and blocks nothing about the StoreSearch price-checker.
   - **Decide the shared embedded-key strategy** — request a raised limit, per-user keys, or a
     GameLib-owned proxy. Each has a friction or infra cost; this is a product decision.

3. **What this does NOT authorise.** Recording the answer is not permission to migrate.
   `src/backend/storeSearch/cheapshark.ts` is untouched and `SEARCH_CURRENCY = 'USD'` still
   ships. A migration needs its own plan.

4. **Preserve, do not delete, the 2026-08-27 Heroic GMG/Humble reasoning** (the impact.com
   credential/mirror-repo argument and the 2026-08-15 decision not to port). It is still live
   context and is the reason the Discounts question matters. Update it with the two findings
   that now bear on it, both citing their grade: ITAD's 34-shop list subsumes GMG, Humble, GOG,
   Epic, Steam and Fanatical with no mirror repo (**MEASURED**), and `hideOwned` /
   `wishlistOnly` — impossible under the static-feed model — become possible via ITAD OAuth
   (**SPEC**). Also record the coverage gap in the same breath: **Amazon Games is absent from
   ITAD's shop list (MEASURED)**, so an ITAD-backed Discounts screen is structurally blind to
   one of GameLib's four stores. Do not let the good news land without it.

Keep the file readable at a glance — a reader landing here cold should know within ten seconds
that the research is done, the todo is open, and three specific human actions are why.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && T=.planning/todos/pending/2026-08-27-answer-q2-what-cheapshark-to-isthereanydeal-migration-actual.md && FM=$(awk 'NR==1&&/^---$/{f=1;next} f&&/^---$/{exit} f' "$T") && BODY=$(awk 'NR==1&&/^---$/{f=1;next} f&&/^---$/{f=0;b=1;next} b' "$T") && echo "$FM" | grep -qx 'severity: minor' && echo "$FM" | grep -qx 'platform: any' && echo "$FM" | grep -qx 'ready: human' && echo "$FM" | grep -qx 'status: OPEN' && echo "$FM" | grep -q '260916-gdg-RESEARCH.md' && ! echo "$FM" | grep -q 'resolves_phase' && echo "$BODY" | grep -q 'isthereanydeal.com/apps/my/' && echo "$BODY" | grep -q 'api@isthereanydeal.com' && echo "$BODY" | grep -qi 'Amazon Games' && echo "$BODY" | grep -q 'MEASURED' && echo "$BODY" | grep -q 'UNKNOWN' && echo "$BODY" | grep -q '260916-gdg-RESEARCH.md' && python3 .planning/todos/todo-frontmatter-gate.py && echo TODO_OK</automated>
  </verify>
  <done>
The todo still carries `severity: minor` / `platform: any` / `ready: human` / `status: OPEN` bare
and in order, `todo-frontmatter-gate.py` passes, `files:` cites the RESEARCH.md, and the body
names all three human gates (app registration, the terms email, the key strategy) plus the
Amazon Games coverage gap, with MEASURED and UNKNOWN grades intact. No `resolves_phase:` was
added.
  </done>
</task>

<task type="auto">
  <name>Task 3: Cross-reference the seed and the note, then run the gates (R3)</name>
  <files>.planning/seeds/aggregated-discovery-multi-provider-deals.md, .planning/notes/aggregated-store-search-foundations.md</files>
  <action>
RESEARCH.md says Q2 gated both of these documents, so both now have a stale forward-reference.
Judge each on whether a pointer genuinely helps a future reader; add a *brief* cross-reference
only where it does, and say in the summary what you decided for each and why. Do not pad, and do
not restate the findings in either file — one or two sentences plus a path, maximum.

Two specific stale references were identified at plan time; both are strong candidates:

- **`.planning/seeds/aggregated-discovery-multi-provider-deals.md`, step 2 of "What pull the
  seed looks like"** currently says "Prefer IsThereAnyDeal … — see the ITAD migration research
  question", pointing at a question that is now answered. The answer materially changes this
  seed in two directions at once and a reader deserves both: ITAD's 34-shop list subsumes
  Heroic's GMG and Humble feeds with no mirror repo, which strengthens the 2026-08-15
  do-not-port decision — *and* **Amazon Games is absent from ITAD (MEASURED)**, so an
  ITAD-backed aggregated browse surface is structurally blind to one of GameLib's four stores,
  which the seed's "deals across *every* store" ambition does not currently anticipate. Also
  note that the seed's step 2 is now **gated on a written reply from `api@isthereanydeal.com`**
  about the "no competition" clause — that gate is the single most useful thing this file can
  tell someone who picks the seed up.

- **`.planning/notes/aggregated-store-search-foundations.md:97`** currently reads "The migration
  cost is scoped in `.planning/research/questions.md` (IsThereAnyDeal migration)." That cost is
  now measured. Update the pointer to name the findings file and add the one-line headline the
  note's own "CheapShark → ITAD debt" section was waiting for: the provider-neutral types minted
  in Phase 20 survive the migration essentially intact, and `SEARCH_CURRENCY = 'USD'` is close
  to the only line that dies — i.e. the knowingly-accepted debt turned out to be cheap. Keep the
  surrounding "decided with eyes open" narrative intact; this is an update to a pointer, not a
  rewrite of the decision record.

Do not edit the note's or the seed's frontmatter. Do not change `title:`, `date:`, `context:`,
`trigger_condition:`, or `planted_date:` in either file.

Finally, run `python3 meta/runPlanningGates.py`. **The baseline is already measured, so you do
not need to establish it:** at sha `e202150c3`, with this PLAN.md present in the working tree and
before any Task 1–3 edit, the gates were **11/11 green** (including
`.planning/planning-frontmatter-gate.py` and `.planning/todos/todo-frontmatter-gate.py`). Any red
you see is therefore caused by this task — fix it, do not report it as pre-existing. Note the
suite is a fixed 11-gate population; a run reporting fewer than 11 means discovery broke, which
is itself a failure even if every reported gate says PASS.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test -z "$(git diff --name-only HEAD -- src/)" && grep -q '260916-gdg' .planning/notes/aggregated-store-search-foundations.md && grep -qi 'Amazon' .planning/seeds/aggregated-discovery-multi-provider-deals.md && head -6 .planning/seeds/aggregated-discovery-multi-provider-deals.md | grep -q 'planted_date: 2026-07-12' && head -5 .planning/notes/aggregated-store-search-foundations.md | grep -q 'date: 2026-07-12' && python3 meta/runPlanningGates.py && echo GATES_OK</automated>
  </verify>
  <done>
`git diff --name-only HEAD -- src/` is empty (zero source files touched). The note cites the
findings file by its `260916-gdg` path and the seed records the Amazon Games gap. Both files'
frontmatter is unchanged. `meta/runPlanningGates.py` reports 11/11 passed (baseline measured
green at `e202150c3` before any edit).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none crossed | This plan edits four Markdown files under `.planning/`. It adds no code path, no input parsing, no network call, and no dependency. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gdg-01 | Information disclosure | the Q2 digest and the todo body | mitigate | RESEARCH.md was produced with **no ITAD account registered**, so it contains no API key or credential to leak forward. Do not add one, and do not paste any key into a planning document if one is later obtained. |
| T-gdg-02 | Tampering | git staging scope | mitigate | Stage with explicit `git add <path>` only. `gsd-sdk query commit` stages the whole tree and this tree carries unrelated untracked files, which would silently widen the commit. |
| T-gdg-03 | Repudiation | evidence grades in the digest | mitigate | Every cited claim carries its RESEARCH.md grade. Promoting UNKNOWN coverage to "answered" would make a planning record assert something nobody measured — the failure this register exists to prevent. |
| T-gdg-04 | Elevation of privilege | `src/backend/storeSearch/cheapshark.ts` | accept | Out of scope by construction and asserted by the Task 3 gate (`git diff --name-only HEAD -- src/` must be empty). |
| T-gdg-SC | Tampering | npm/pip/cargo installs | n/a | **No package-manager installs in this plan.** No `package.json` change, so the Package Legitimacy Gate does not arm. |
</threat_model>

<verification>
Run from the repo root after all three tasks:

1. `awk '/^## Q2 /{f=1} f&&/^## Q3 /{exit} f' .planning/research/questions.md` — Q2 opens with an
   `> **ANSWERED` blockquote; the original question body survives beneath it.
2. `python3 .planning/todos/todo-frontmatter-gate.py` — exits 0.
3. `python3 meta/runPlanningGates.py` — exits 0 and reports **11/11**. Baseline measured green
   at `e202150c3` before any edit, so red here is caused by this task.
4. `test -z "$(git diff --name-only HEAD -- src/)"` — zero source files touched. Use this
   form, not `| wc -l | grep -qx '0'`: BSD `wc` pads its output with whitespace, so the `wc`
   form is a false red on macOS even when no source file changed.
5. `git status --porcelain .planning/` — exactly the four intended files modified; no new
   untracked planning files beyond this plan and its SUMMARY.
</verification>

<success_criteria>
- Q2 in `.planning/research/questions.md` is marked ANSWERED in Q3's blockquote shape, digests
  the verdict in 8–16 quoted lines, and cites `260916-gdg-RESEARCH.md`.
- The digest preserves grades: coverage list UNKNOWN, Steam AppID batch lookup MEASURED.
- The pending todo is OPEN, `ready: human`, passes the CI triage gate, and names exactly the
  three remaining human gates.
- The seed and the note either carry a brief, justified pointer to the findings or are
  explicitly and reasonedly left alone in the summary.
- Zero files under `src/` changed. `SEARCH_CURRENCY = 'USD'` still ships.
- `python3 meta/runPlanningGates.py` reports 11/11, matching the pre-edit baseline at `e202150c3`.
- Changes committed with explicit paths (`git add <path>`), not a whole-tree stage.
</success_criteria>

<output>
Create `.planning/quick/260916-gdg-answer-q2-cheapshark-to-itad-migration-cost/260916-gdg-SUMMARY.md`
when done. Record in it: the title decision made in Task 2 (kept or retitled, and why), the
per-file cross-reference decision made in Task 3 (added or skipped, and why), and the planning
gates result (expected 11/11, baseline `e202150c3`).
</output>
