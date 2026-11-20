---
phase: quick-260923-vnv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md
  - .planning/todos/completed/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md
  - .planning/todos/pending/2026-09-16-the-2026-08-27-depot-stall-cause-is-unidentified-with-no-proposed-experiment.md
  - .planning/todos/completed/2026-08-27-stall-watchdog-leaves-the-download-running.md
autonomous: true
requirements:
  - VNV-01
  - VNV-02
  - VNV-03
  - VNV-04
must_haves:
  truths:
    - 'The todo lives in `completed/` and carries a Resolution section recording the desk measurement that refuted it, with the per-capture census in the file.'
    - 'The Resolution states the mechanism, not just the verdict: `eresult=1` is OK, the body is a constant 8 bytes, and `CDN auth token acquired` has never once been logged in any preserved capture.'
    - 'The todo''s own `## Traps` claim that the line is "emitted per attempt" is corrected in place, with the 60s negativeCache cooldown named as the real cadence and the gateB 17:46:46 / 17:53:12 spacing cited as proof.'
    - 'The Resolution states honestly what the measurement does NOT cover: every capture is from one account and one IP, so a permanently-throttled-account reading is not formally excluded — only the within-session causal claim the todo actually posed is refuted.'
    - 'The sibling stall-cause todo records account/IP throttling as ELIMINATED in its ruled-out table, and its Related pointer resolves to the `completed/` path.'
    - 'The closed parent todo''s Related pointer for this residual resolves to the `completed/` path.'
    - 'No LIVE planning document points at the old `todos/pending/` path for this todo.'
    - '`git diff -- src/` is zero lines — this is docs-only, enforced not asserted.'
    - 'The five triage frontmatter keys stay bare/lowercase/exact; only `status:` changes value.'
  artifacts:
    - path: '.planning/todos/completed/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md'
      provides: 'The closed todo carrying the desk-measured refutation and the corrected trap'
      contains: 'rawBodyBytes=8'
    - path: '.planning/todos/pending/2026-09-16-the-2026-08-27-depot-stall-cause-is-unidentified-with-no-proposed-experiment.md'
      provides: 'The sibling with throttling eliminated and a live Related pointer'
      contains: 'completed/2026-09-16-whether-the-cdn-auth-token'
  key_links:
    - from: 'the sibling stall-cause todo Related section'
      to: 'the completed self-infliction todo'
      via: 'a corrected bullet naming the completed/ path'
      pattern: 'completed/2026-09-16-whether-the-cdn-auth-token'
    - from: 'the closed parent todo Related section'
      to: 'the completed self-infliction todo'
      via: 'a corrected residual bullet'
      pattern: 'completed/2026-09-16-whether-the-cdn-auth-token'
---

<objective>
The todo asks whether Steam's empty `GetCDNAuthToken` responses are **self-inflicted** by starting
and cancelling several large downloads in one session. It is `ready: live-gate` and prescribes a
three-step experiment: measure the rate of empty-token responses from a cold session, perform two
or three large cancels, re-measure, compare.

**That experiment cannot answer the question, and the question is already answered on disk.**

Measured at the desk on 2026-09-23 against five distinct preserved captures — no live run, no
network manipulation, no new install:

| capture | date | app / depot | hosts hit | eresult | rawBodyBytes | `token acquired` |
|---|---|---|---|---|---|---|
| `gamelib.log.35-02-ab-electron` | 2026-08-28 | depot 40701 | all 3 | 1 | 8 | **0** |
| `gamelib.log.35-02-ab-tauri-part1` | 2026-08-28 | depot 40701 | all 3 | 1 | 8 | **0** |
| `260909-nzb/gamelib-control.log` | 2026-09-09 | Avadon `112100` / depot 112102 | all 3 | 1 | 8 | **0** |
| `260909-nzb/gamelib-gateA.log` | 2026-09-09 | depot 112102 | all 3 | 1 | 8 | **0** |
| `260909-nzb/gamelib-gateB.log` | 2026-09-09 | depot 112102 | all 3 (+1 repeat) | 1 | 8 | **0** |

(`260907-ov3-evidence-35-02-ab-tauri-part1.log` is `md5`-identical to the tauri capture and is not
counted twice.) Add the already-recorded Californium `402060` observations — depots 402062 and
402064, all three hosts, `eresult=1`, on 2026-08-27 and again on 2026-09-07 — and the record spans
**three titles, four depots, three dates**.

Three findings close it:

1. **There is no non-degraded baseline to degrade away from.** `CDN auth token acquired` — the
   success line at `cdnAuth.ts` `fetch()` — appears **zero** times in every capture ever preserved.
   A "self-inflicted degradation" hypothesis needs a working state to be degraded *from*. None has
   ever been observed.

2. **The causal claim is refuted directly by the control log.** Cold CM connect at 17:46:40
   (`cellID=22`, `cold-connect path took 1629ms`), plan built 17:46:41, and all three hosts return
   empty tokens at **17:46:46** — the *first* CDN token request of that session, with no prior
   cancelled large download in it. The condition is present at first touch.

3. **The response is a deliberate, well-formed OK.** `eresult=1` is `k_EResultOK` — the code only
   reaches the empty-token branch *after* passing `eresult !== ERESULT_OK`. The body is a constant
   `rawBodyBytes=8` across three unrelated titles on three dates. That is the signature of "this
   depot carries no token auth", not of an account being throttled.

And the prescribed instrument is **saturated by construction**: 3 of 3 hosts fail on first touch,
so there is no headroom for a throttling effect to raise. Worse, the todo's own `## Traps` section
is factually wrong about the cadence — it says the line is "emitted per attempt", but
`cdnAuth.ts`'s `negativeCache` puts each depot+host into a `CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS`
(60s) cooldown in which `getToken` returns `''` with **no network call and no log line**. gateB
proves it: three lines at 17:46:46, the fourth at 17:53:12. Normalising "per attempt" as the todo
directs would measure our own chunk concurrency, not Steam's disposition.

Purpose: close the todo on the measurement, correct the trap that would have misled the next
reader, and carry the one finding the sibling needs — throttling is eliminated as a candidate
mechanism for the 2026-08-27 wedge.

Output: three edited planning files, one of them moved, one commit. No source changes.
</objective>

<requirements>

**VNV-01 — Record the refutation in the todo and close it.**
Add a `## Resolution` section carrying the five-capture census table, the three findings, and the
saturation argument. Set `status: RESOLVED`. Move the file to `.planning/todos/completed/`.
Leave `severity`/`platform`/`ready` byte-identical — the triage vocabulary is gate-enforced and
`completed/` is exempt, so there is nothing to re-grade.

**VNV-02 — Correct the false trap in place.**
The `## Traps` bullet asserting the line is "emitted per attempt" is wrong and would misdirect
anyone who reads this file later for the cadence. Correct it where it stands, naming the 60s
`negativeCache` cooldown and the gateB spacing. Do not delete the bullet — a reader who
remembers the old claim needs to find its correction, not its absence.

**VNV-03 — State the honest limit.**
Every capture is from one account and one IP. What is refuted is the *within-session* causal claim
the todo actually posed. A standing, permanent throttle on this account is not formally excluded by
this evidence and cannot be excluded without a second account. Say so in the Resolution rather than
overclaiming a clean result.

**VNV-04 — Repoint the two live pointers and carry the sibling finding.**
- Sibling `2026-09-16-the-2026-08-27-depot-stall-cause...md`: add a row to its **What has been
  ruled out — do not re-run these** table recording account/IP throttling as ELIMINATED with the
  desk measurement as the how; repoint its Related bullet at `completed/`.
- Closed parent `2026-08-27-stall-watchdog-leaves-the-download-running.md`: repoint its residual
  bullet at `completed/`.
- Historical artifacts (`260916-bes` PLAN/SUMMARY) cite the pending path as a record of what was
  true then — leave them byte-unchanged.

</requirements>

<verify>

```bash
# VNV-01: closed, moved, census present
test -f .planning/todos/completed/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md
test ! -e .planning/todos/pending/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md
grep -c 'rawBodyBytes=8' .planning/todos/completed/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md
grep -q '^status: RESOLVED' .planning/todos/completed/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md

# VNV-02: the trap is corrected, not deleted
grep -q 'CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS' .planning/todos/completed/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md

# VNV-03: the limit is stated
grep -qi 'one account' .planning/todos/completed/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md

# VNV-04: no LIVE doc points at the old pending path; sibling carries the finding
grep -rl 'todos/pending/2026-09-16-whether-the-cdn-auth-token' .planning/todos/ | wc -l   # must be 0
grep -q 'ELIMINATED' .planning/todos/pending/2026-09-16-the-2026-08-27-depot-stall-cause-is-unidentified-with-no-proposed-experiment.md

# triage frontmatter gate still green (pending/ scope)
pnpm planning-gates

# docs-only, enforced not asserted
test -z "$(git diff -- src/)"

# formatter over the exact paths written
npx prettier --check \
  .planning/todos/completed/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md \
  .planning/todos/pending/2026-09-16-the-2026-08-27-depot-stall-cause-is-unidentified-with-no-proposed-experiment.md \
  .planning/todos/completed/2026-08-27-stall-watchdog-leaves-the-download-running.md \
  .planning/quick/260923-vnv-close-cdn-auth-self-infliction-todo-refu/260923-vnv-PLAN.md
```

**Note on the prettier step:** `.prettierignore` contains a bare `.planning`, so this check is
known-vacuous over these paths (it exits 0 without inspecting them). It is run anyway because
CLAUDE.md requires a formatter check over every written path, and because the ignore entry could
change. Do not read its exit 0 as evidence these files are formatted.

**Note on `git mv`:** `git mv` commits HEAD content and drops unstaged edits. Edit the file in
`pending/`, then move with a plain `mv` and `git add -A`, and verify the staged content carries the
new text with `git show :<path> | grep -c` **before** committing.

</verify>
