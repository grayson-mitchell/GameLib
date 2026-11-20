---
phase: quick-260710-nwb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spike/crossover-compat-lookup.mjs
  - spike/crossover-compat-FINDINGS.md
autonomous: true
requirements: [SPIKE-CROSSOVER-COMPAT]
must_haves:
  truths:
    - "Script slugifies titles to CrossOver's kebab-case format"
    - "Script fetches each slug URL with a Chrome UA and distinguishes 200 (hit) from 404 (miss)"
    - "Script parses schema.org JSON-LD and extracts ratingValue/ratingCount for hits"
    - "Script prints a per-title result table and an overall match-rate summary line"
    - "A findings note records the measured match rate and a go/no-go recommendation"
  artifacts:
    - path: "spike/crossover-compat-lookup.mjs"
      provides: "Standalone throwaway spike script (fetch + parse + match rate)"
      min_lines: 60
    - path: "spike/crossover-compat-FINDINGS.md"
      provides: "Measured match rate + go/no-go recommendation for backend+pill"
  key_links:
    - from: "spike/crossover-compat-lookup.mjs"
      to: "https://www.codeweavers.com/compatibility/crossover/{slug}"
      via: "fetch with desktop Chrome User-Agent header"
      pattern: "User-Agent"
---

<objective>
Prove feasibility of a CrossOver (CodeWeavers) compatibility lookup by slug BEFORE committing to a backend + UI pill. Measure the real slug match rate against a representative sample of game titles.

Purpose: De-risk the CrossOver compatibility feature. If slug match rate is high, greenlight a backend service + compatibility pill. If low, the lookup-by-slug approach is unreliable and needs a different strategy (search API, manual mapping, etc.).
Output: A standalone throwaway Node script under `spike/` plus a short findings note with the match rate and a go/no-go recommendation. NO application source is touched.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<notes>
THROWAWAY SPIKE — do NOT wire into the app, do NOT add UI, do NOT touch src/. The script lives under spike/ and is runnable with a single command.

VERIFIED FACTS (do not re-derive):
- Per-app URL: https://www.codeweavers.com/compatibility/crossover/{slug}
- Site 403s non-browser UAs; a desktop Chrome UA string works. robots.txt allows /compatibility for `User-agent: *` (AI-bot UAs are Disallow: /, so use a normal desktop browser UA). No Crawl-delay. Keep it on-demand/reference, not a bulk harvest.
- Slug format is kebab-case: lowercase, strip diacritics, replace non-alphanumeric runs with a single hyphen, trim leading/trailing hyphens. Real examples: "007 Nightfire" -> "007-nightfire", "10,000,000" -> "10-000-000", "001 Game Creator" -> "001-game-creator".
- A hit (e.g. 007-nightfire) returns HTTP 200 with exactly ONE <script type="application/ld+json"> whose @graph holds a VideoGame node: aggregateRating {ratingValue, ratingCount}, applicationCategory, operatingSystem (e.g. "macOS, Linux"), publisher.name, sameAs [pcgamingwiki, winehq appdb], plus Review nodes with @id ending #review-mac / #review-linux.
- A miss returns HTTP 404.
- axios is already a dependency, but built-in Node fetch (Node 18+) is simplest for a throwaway .mjs — either is acceptable.
</notes>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write the CrossOver compatibility lookup spike script</name>
  <files>spike/crossover-compat-lookup.mjs</files>
  <action>
Create a standalone Node ESM script (runnable via `node spike/crossover-compat-lookup.mjs`, no build step).

1. Hardcode a representative sample of ~8-12 real game titles spanning easy and hard cases. Include at minimum: a plain title ("Hades"), a numeric/subtitle title ("007 Nightfire"), a title with punctuation/colon/apostrophe ("Half-Life 2", "Baldur's Gate 3"), an edition-suffix title ("The Witcher 3: Wild Hunt"), a diacritic case ("Pokémon" or "Ori and the Blind Forest"), and 2-3 likely-to-miss oddballs.

2. Implement `slugify(title)`: lowercase; Unicode NFKD normalize + strip combining diacritical marks; replace every run of non-alphanumeric characters with a single hyphen; trim leading/trailing hyphens. Validate against the known-good examples in <notes> (007 Nightfire -> 007-nightfire, 10,000,000 -> 10-000-000, 001 Game Creator -> 001-game-creator) — include those three as inline assertions or a self-check so a wrong slugifier fails loudly.

3. For each title, fetch `https://www.codeweavers.com/compatibility/crossover/{slug}` sequentially (NOT parallel) with a desktop Chrome User-Agent request header. Await a ~1-2s delay between requests to be polite. Treat HTTP 200 as a hit and 404 as a miss; log any other status distinctly (do not count as a clean hit/miss).

4. On a 200, extract the FIRST `<script type="application/ld+json">...</script>` block via regex, JSON.parse it, walk `@graph` to find the node with `@type` "VideoGame", and read aggregateRating.ratingValue + aggregateRating.ratingCount (guard for missing aggregateRating). Optionally also capture applicationCategory, operatingSystem, publisher.name, and sameAs for the findings note. Wrap parsing in try/catch so a malformed page degrades to "hit but unparsed" rather than crashing the run.

5. Print a per-title result table with columns: title, slug, HTTP status, hit/miss, ratingValue, ratingCount. End with a summary line: overall match rate = hits / total (count + percentage).

Keep dependencies to built-ins only (Node 18+ global fetch). Add a top-of-file comment marking this as a throwaway feasibility spike.
  </action>
  <verify>
    <automated>node --check spike/crossover-compat-lookup.mjs</automated>
  </verify>
  <done>Script exists, passes `node --check`, contains slugify with the three known-good self-checks, a sequential fetch loop with a Chrome UA + inter-request delay, JSON-LD VideoGame extraction, a per-title table, and a match-rate summary line.</done>
</task>

<task type="auto">
  <name>Task 2: Run the spike and record findings + go/no-go</name>
  <files>spike/crossover-compat-FINDINGS.md</files>
  <action>
Run `node spike/crossover-compat-lookup.mjs` and capture its full output. If the network is unreachable in this environment, note that explicitly in the findings and record the slug outputs (which are deterministic offline) plus the expected verification steps for the user to run locally.

Write `spike/crossover-compat-FINDINGS.md` containing:
- The sample titles used and their generated slugs.
- The captured per-title result table (status, hit/miss, ratingValue, ratingCount).
- The measured overall match rate (hits / total).
- Observations on failure modes (which title shapes missed and why — colons, editions, apostrophes, trademark symbols, subtitle handling).
- A clear GO / NO-GO recommendation for building a backend service + compatibility pill, with a one-line rationale tied to the observed match rate.
- A reminder that this is throwaway spike code and the script/dir can be deleted after the decision.
  </action>
  <verify>
    <automated>test -f spike/crossover-compat-FINDINGS.md && grep -qiE 'match rate' spike/crossover-compat-FINDINGS.md && grep -qiE 'GO|NO-GO' spike/crossover-compat-FINDINGS.md</automated>
  </verify>
  <done>FINDINGS.md exists with the per-title results (or an explicit offline note), a stated match rate, and a GO/NO-GO recommendation.</done>
</task>

</tasks>

<verification>
- `node --check spike/crossover-compat-lookup.mjs` passes.
- Running the script prints a per-title table and a match-rate summary line.
- `spike/crossover-compat-FINDINGS.md` records the match rate and a go/no-go recommendation.
- No files under `src/` were modified (this is a throwaway spike).
</verification>

<success_criteria>
- A single-command runnable spike script exists under `spike/`.
- The script slugifies, fetches (Chrome UA, sequential, polite delay), parses JSON-LD, and reports a match rate.
- A findings note captures the measured match rate and a clear go/no-go recommendation for the backend + pill.
- Application source (`src/`) is untouched.
</success_criteria>

<output>
Create `.planning/quick/260710-nwb-crossover-compatibility-lookup-spike/260710-nwb-SUMMARY.md` when done.
</output>
