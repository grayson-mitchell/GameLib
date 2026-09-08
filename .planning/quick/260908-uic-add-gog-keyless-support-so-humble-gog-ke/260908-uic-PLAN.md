---
phase: 260908-uic
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/humble/classify.ts
  - src/common/humble/keyTypePresentation.ts
  - src/backend/humble/__tests__/classify.test.ts
  - src/backend/humble/__tests__/keyTypePresentation.test.ts
  - src/backend/humble/__tests__/fixtures/tpks.ts
autonomous: true
requirements: [QT-260908-UIC-01]

must_haves:
  truths:
    - "A Humble order whose only entitlement is key_type=gog_keyless with direct_redeem:true classifies to exactly ONE key row (today: zero)."
    - "That row presents as branded GOG with the existing gog logo."
    - "That row NEVER receives a code-based redeem deep link — it falls through to HUMBLE_REDEEM_HELP_URL."
    - "The existing 'gog' keyed-key behaviour (branded GOG + gog.com/redeem deep link) is unchanged."
    - "No new user-facing translatable string is introduced (no locale file is touched)."
  artifacts:
    - path: "src/backend/humble/classify.ts"
      provides: "'gog_keyless' member of KNOWN_GAME_KEY_TYPES (~L174)"
      contains: "'gog_keyless'"
    - path: "src/common/humble/keyTypePresentation.ts"
      provides: "gog_keyless entry in KEY_TYPE_PRESENTATIONS, and NO entry in REDEEM_URL_BUILDERS"
      contains: "gog_keyless: { kind: 'branded', name: 'GOG', logo: 'gog' }"
    - path: "src/backend/humble/__tests__/fixtures/tpks.ts"
      provides: "gogKeylessDirectRedeemOrder — the live-evidenced order shape"
      contains: "gogKeylessDirectRedeemOrder"
  key_links:
    - from: "KNOWN_GAME_KEY_TYPES"
      to: "isDirectRedeemEntitlement"
      via: "protective override — set membership negates the direct_redeem drop"
      pattern: "KNOWN_GAME_KEY_TYPES\\.has\\(tpk\\.key_type\\)"
    - from: "KEY_TYPE_PRESENTATIONS"
      to: "getKeyTypePresentation"
      via: "record lookup"
      pattern: "KEY_TYPE_PRESENTATIONS\\[keyType\\]"
    - from: "REDEEM_URL_BUILDERS"
      to: "gog_keyless"
      via: "DELIBERATE ABSENCE — this link must NOT exist"
      pattern: "NEGATIVE: no gog_keyless key inside the REDEEM_URL_BUILDERS literal"
---

<objective>
Add `gog_keyless` as a recognised Humble key type so GOG entitlements delivered
as direct-redeem are no longer silently discarded, and so they render as GOG in
the keys UI — WITHOUT ever building a code-based redeem URL for them.

Purpose: a live, operator-evidenced data-loss defect. A purchased GOG game is
absent from GameLib entirely.
Output: two one-line source changes, three test files extended, RED-first.
</objective>

<evidence>
Measured 2026-09-08 from the operator's own Humble sync log. Do NOT re-derive
this; it is the authority for the change.

    Humble sync finished: gamekeys=33 fetched=5/5 frozen=28 ok=5 schema_error=0
      denied=0 expired=0 transient=0 zeroKeyOrders=1 keysCached=32
    Humble sync: order classified to zero keys: <gamekey redacted>
      tpkd_dict.all_tpks=array(1)
      skipped=[[0]:direct-redeem-entitlement(key_type=gog_keyless key_type_human_name=GOG Keyless)]

The order fetches and parses fine. Its single entitlement is discarded by
`isDirectRedeemEntitlement` because `KNOWN_GAME_KEY_TYPES` lists `origin_keyless`
and `epic_keyless` but not `gog_keyless`. That set's own doc comment states it
exists as "a protective override so the direct_redeem entitlement signal below
can never drop a key whose key_type attests a known store" — `gog_keyless`
attests a known store, so its omission is a straightforward bug, not a policy.

**This corrects standing assumption A1 (phase 42).** Until now `gog` was
evidenced only from Playnite's `keyTypeWhitelist` and GOG Galaxy's `KEY_TYPE`
enum — never observed live. Humble in fact sends `gog_keyless` for this GOG
entitlement. `gog` is NOT removed: it remains the evidenced value for a real
keyed GOG key. This adds a second, separately-evidenced value with a DIFFERENT
provenance (live observation, not third-party integration source).
</evidence>

<the_critical_constraint>
`gog_keyless` MUST NOT receive a redeem deep link.

`REDEEM_URL_BUILDERS` maps `gog: (code) => https://www.gog.com/redeem/${code}`.
A "keyless" entitlement is direct-redeem: Humble redeems it straight to the
linked GOG account and there is NO key code. Interpolating into that URL would
produce a broken or misleading link, and (T-42-01) the help fallback exists
precisely so a secret code is never carried into a URL we fabricated.

`epic_keyless` is the exact precedent already in the file: `kind: 'branded'`
with a logo, and NO entry in the redeem-URL map. Copy that shape exactly.

Target: `gog_keyless: { kind: 'branded', name: 'GOG', logo: 'gog' }` in
`KEY_TYPE_PRESENTATIONS`, and NOTHING added to `REDEEM_URL_BUILDERS`.
</the_critical_constraint>

<planner_findings>
Two things were checked so the executor does not have to hunt for them.

**1. The exhaustiveness switch does NOT need updating — verified, not assumed.**
The compile-level pin is `assertExhaustivePresentation` at the bottom of
`src/backend/humble/__tests__/keyTypePresentation.test.ts`. It switches on
`presentation.kind` (`'branded' | 'named' | 'unknown'`), NOT on `key_type`.
The two frontend switches are likewise keyed on the discriminant, not the key
type: `HumbleKeyRow/index.tsx:34` switches on `presentation.kind`, and `:62`
switches on `HumbleStoreLogoId` where `'gog'` is already a case returning the
existing `gog-logo.svg`.
Because `gog_keyless` reuses an existing `kind` AND an existing `logo` id, it
adds no new variant to any switch. `KEY_TYPE_PRESENTATIONS` is a
`Record<string, …>` with a runtime miss-fallback, so it has no compile-level
key census either. **No exhaustiveness edit is in scope.** If the executor
finds a switch that does need a new arm, STOP and report — that would mean this
finding is wrong.

**2. No new locale string is required — confirmed, not assumed.**
`keyTypePresentation.ts`'s own doc comment (L72-79) states its display names
are "untranslated proper nouns — do-not-translate per meta/i18nGlossary.json"
and that the file is deliberately absent from `meta/i18nGateScope.json`. The
name `'GOG'` already exists verbatim as the `gog` entry's name; `gog_keyless`
reuses that same literal. Nothing is added to `public/locales/**`. Task 3
asserts this negatively.

**3. Public-repo hazard: do NOT commit the raw gamekey.**
GameLib is a public fork. The live gamekey from the sync log is an order
identifier tied to the operator's Humble account, and the purchased game title
is personal purchase data. The new fixture must use a SYNTHETIC gamekey and a
synthetic human_name, reproducing the real SHAPE only. Cite the evidence as
"operator's live Humble sync, 2026-09-08" — never paste the gamekey or the
title into source, comments, or commit messages.
</planner_findings>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@./CLAUDE.md

@src/backend/humble/classify.ts
@src/common/humble/keyTypePresentation.ts
@src/backend/humble/__tests__/classify.test.ts
@src/backend/humble/__tests__/keyTypePresentation.test.ts
@src/backend/humble/__tests__/fixtures/tpks.ts

<interfaces>
<!-- Extracted during planning. No codebase exploration needed. -->

src/backend/humble/classify.ts ~L174 (the drop site):

  const KNOWN_GAME_KEY_TYPES = new Set([
    'steam', 'gog', 'origin', 'origin_keyless', 'uplay',
    'epic', 'epic_keyless', 'battlenet', 'nintendo_direct'
  ])

  function isDirectRedeemEntitlement(tpk) {
    return tpk.direct_redeem === true &&
      !(typeof tpk.key_type === 'string' && KNOWN_GAME_KEY_TYPES.has(tpk.key_type))
  }

  function isInventoryKeyTpk(tpk) {
    return hasKeyEvidence(tpk) && !isDirectRedeemEntitlement(tpk)
  }

The two diagnostic sites that emit `direct-redeem-entitlement(...)` (~L643 and
~L702) both call `isDirectRedeemEntitlement` — they need NO edit. Fixing the set
fixes the classifier and both diagnostics at once, which is why the set is the
single correct edit point.

src/common/humble/keyTypePresentation.ts:

  export type HumbleStoreLogoId = 'steam' | 'gog' | 'epic'
  export type HumbleKeyTypePresentation =
    | { kind: 'branded'; name: string; logo: HumbleStoreLogoId }
    | { kind: 'named'; name: string }
    | { kind: 'unknown' }

  const KEY_TYPE_PRESENTATIONS: Record<string, HumbleKeyTypePresentation> = { ... }
  const REDEEM_URL_BUILDERS: Record<string, (code: string) => string> = { steam, gog }

  export function getKeyTypePresentation(keyType: string): HumbleKeyTypePresentation
  export function getRedeemTarget(keyType: string, code: string): HumbleRedeemTarget
  export const HUMBLE_REDEEM_HELP_URL = 'https://support.humblebundle.com/hc/en-us'
</interfaces>
</context>

<project_rules>
- Backend jest AUTO-MOCKS i18next to echo KEYS. Assert on keys, never English,
  in backend tests. (This change adds no translated string, so this should not
  arise — if it does, the design is wrong.)
- Scoped jest only. `--selectProjects Backend` is the correct, case-correct
  name (`displayName: 'Backend'` in `src/backend/jest.config.js`). It is
  CASE-SENSITIVE and exits 0 on a miss, so every jest verify below must confirm
  a NONZERO test count, not merely exit 0.
- Never chain a write and a jest run in one command (`... && npx jest` reads a
  stale tree). Edit, then run jest as a SEPARATE invocation.
- Do NOT run full `pnpm test:ci`: it exits 1 at baseline with ZERO failing tests
  (leaked 60s timer), and `src/backend/sidecar/__tests__/electronUntouched.test.ts:306`
  is a known unrelated red.
- Do NOT call any `gsd-sdk state.*`, `roadmap.*` or `phase.complete` verb — a
  recorded corruption vector in this repo. The orchestrator owns STATE.md and
  ROADMAP.md.
- Scope lock: two source files plus tests. Do NOT refactor the classifier, do
  NOT speculatively add other missing key types, do NOT touch the sync path, do
  NOT touch the frontend.
</project_rules>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED-first tests for both halves</name>
  <files>
    src/backend/humble/__tests__/fixtures/tpks.ts,
    src/backend/humble/__tests__/classify.test.ts,
    src/backend/humble/__tests__/keyTypePresentation.test.ts
  </files>
  <behavior>
    Classifier half (must FAIL before the fix):
    - An order whose single tpk is `{ key_type: 'gog_keyless',
      key_type_human_name: 'GOG Keyless', direct_redeem: true }` yields exactly
      ONE key, with `platform === 'gog_keyless'`. Today it yields zero.
    - The existing test "D-28: every evidenced game-store key_type survives even
      with direct_redeem:true" (~L437) grows `'gog_keyless'` in its `platforms`
      array; its `toEqual(platforms)` assertion then fails until the fix lands.

    Presentation half (must FAIL before the fix):
    - `getKeyTypePresentation('gog_keyless')` equals
      `{ kind: 'branded', name: 'GOG', logo: 'gog' }`. Today it returns
      `{ kind: 'unknown' }`.

    Constraint PINS (these PASS before the fix too — they are guards against the
    fix going wrong, not RED evidence; label them as pins in-source so a future
    reader does not mistake a passing pin for proof of the feature):
    - `getRedeemTarget('gog_keyless', code)` is `{ kind: 'help', url: HUMBLE_REDEEM_HELP_URL }`.
    - The help-branch security pin (T-42-01): the result URL contains no
      'SECRET-CODE' substring.
    - Regression: `getRedeemTarget('gog', 'GOG-KEY-1')` still deep-links to
      `https://www.gog.com/redeem/GOG-KEY-1`.
  </behavior>
  <action>
    In `fixtures/tpks.ts`, export a new `gogKeylessDirectRedeemOrder` beside the
    existing `directRedeemEntitlementOrder`, mirroring that file's established
    shape. Use a SYNTHETIC gamekey (e.g. 'order-gog-keyless-direct') and a
    synthetic human_name — see planner finding 3; the real gamekey and game
    title must never enter this public repo. Its single tpk carries
    `machine_name`, `key_type: 'gog_keyless'`, `key_type_human_name: 'GOG Keyless'`
    and `direct_redeem: true`, matching the live log line exactly in structure.

    Above it, add a short comment recording the provenance: live-observed on the
    operator's Humble sync, 2026-09-08; this is a DIFFERENT provenance from the
    Playnite/Galaxy union cited at ~L458-460 of the same file.

    In `classify.test.ts`, add a test inside the existing
    "classifyOrder — direct-redeem entitlements" describe block using that
    fixture, asserting one key and `platform === 'gog_keyless'`. Separately add
    `'gog_keyless'` to the `platforms` array in the existing survives-with-
    direct_redeem test at ~L437.

    In `keyTypePresentation.test.ts`, add the branded-GOG assertion next to the
    existing `'epic_keyless'` test, and add `'gog_keyless'` to the three
    key-type census arrays that already enumerate `epic_keyless`/`origin_keyless`:
    the `allKeyTypes` logo check (~L104), the "every other key_type -> help
    fallback" `test.each` (~L162), and the T-42-01 security-pin `test.each`
    (~L184). Those arrays are test-local censuses, not compile gates — they must
    be edited by hand or the new key type is simply unmeasured.

    Do NOT touch any source file in this task. Do NOT touch the frontend
    `HumbleKeyRow` test: it is a table-driven sample, not an exhaustive census,
    and the behaviour it would cover is the pure function already covered here.
  </action>
  <verify>
    <automated>
    npx jest --selectProjects Backend src/backend/humble/__tests__/classify.test.ts src/backend/humble/__tests__/keyTypePresentation.test.ts 2>&1 | tail -40
    </automated>
    EXPECTED: RED. The run MUST report a nonzero total test count (a zero count
    means --selectProjects failed open and the run measured nothing — treat that
    as a failed verification, not a pass). At least TWO failures must appear:
    the gog_keyless classifier test and the gog_keyless presentation test.
    Record the observed failure count.
  </verify>
  <done>Both new assertions fail for the right reason (key dropped / unknown presentation), the total test count is nonzero, and no source file has been modified.</done>
</task>

<task type="auto">
  <name>Task 2: The two-line fix, plus provenance corrections</name>
  <files>src/backend/humble/classify.ts, src/common/humble/keyTypePresentation.ts, src/backend/humble/__tests__/fixtures/tpks.ts</files>
  <action>
    1. `src/backend/humble/classify.ts` (~L174): add `'gog_keyless'` to
       `KNOWN_GAME_KEY_TYPES`. Place it directly after `'gog'` so the keyed and
       keyless GOG values read together.

    2. `src/common/humble/keyTypePresentation.ts`: add
       `gog_keyless: { kind: 'branded', name: 'GOG', logo: 'gog' }` to
       `KEY_TYPE_PRESENTATIONS`, directly after the `gog` entry. Add NOTHING to
       `REDEEM_URL_BUILDERS` — see the critical constraint; `epic_keyless` is
       the precedent.

    3. Provenance corrections. Both doc comments currently assert the evidenced
       set IS the Playnite + Galaxy union. After this change that assertion is
       FALSE, so leaving them untouched would ship a comment that inverts its
       own cited source. Amend both, minimally:
       - `classify.ts` ~L160-173 (the `KNOWN_GAME_KEY_TYPES` doc comment): note
         that `gog_keyless` is NOT from either third-party source but from a
         live GameLib sync observation on 2026-09-08, and that it corrects the
         phase-42 A1 assumption that Humble sends `gog` for GOG entitlements.
         State explicitly that `gog` is RETAINED as the evidenced keyed value.
       - `fixtures/tpks.ts` ~L458-460 (the "evidenced game-store key_type set
         (union)" bullet): same one-line correction, so the census there does
         not contradict the code.
       No gamekey, no game title (planner finding 3).

    Change nothing else. If tsc reports a required exhaustiveness arm anywhere,
    STOP and report — planner finding 1 says none exists, and that being wrong
    changes the shape of the task.
  </action>
  <verify>
    <automated>
    npx jest --selectProjects Backend src/backend/humble/__tests__/classify.test.ts src/backend/humble/__tests__/keyTypePresentation.test.ts 2>&1 | tail -20
    </automated>
    Run this as a SEPARATE invocation after the edits land — never chained to a
    write with `&&`, which reads a stale tree. EXPECTED: GREEN, with the same
    nonzero total test count seen in Task 1 plus the new tests, and 0 failures.
  </verify>
  <done>Both previously-RED tests pass; total test count is nonzero and no lower than Task 1's; `REDEEM_URL_BUILDERS` is unchanged.</done>
</task>

<task type="auto">
  <name>Task 3: Structural pins, regression sweep, and negative assertions</name>
  <files>(no edits — verification only; fix any failure in the file it points at)</files>
  <action>
    Prove the three things a passing unit test does not, by themselves, prove:
    the absence of a deep link is STRUCTURAL, no neighbouring Humble test
    regressed, and no locale file was touched.

    Each grep below is paired with a positive control, because a selector that
    matches nothing exits 0 and looks like a pass. Comment lines are stripped
    before counting, because prose that merely names the token would otherwise
    satisfy a source gate.
  </action>
  <verify>
    <automated>
    # (a) NEGATIVE pin with positive control: gog_keyless is absent from the
    #     redeem-URL builders, and the extracted range is genuinely the builders.
    sed -n '/^const REDEEM_URL_BUILDERS/,/^}/p' src/common/humble/keyTypePresentation.ts \
      | grep -vE '^[[:space:]]*(\*|//|/\*)' > /tmp/builders.txt
    echo "control_gog=$(grep -c 'gog:' /tmp/builders.txt)   # MUST be 1"
    echo "negative_keyless=$(grep -c 'gog_keyless' /tmp/builders.txt)   # MUST be 0"

    # (b) POSITIVE pins, comment-stripped so prose cannot satisfy them.
    echo "classify_set=$(grep -vE '^[[:space:]]*(\*|//|/\*)' src/backend/humble/classify.ts | grep -c \"'gog_keyless'\")   # MUST be 1"
    echo "presentation=$(sed -n '/^const KEY_TYPE_PRESENTATIONS/,/^}/p' src/common/humble/keyTypePresentation.ts | grep -c \"gog_keyless: { kind: 'branded', name: 'GOG', logo: 'gog' }\")   # MUST be 1"

    # (c) No locale file touched — finding 2 asserted negatively.
    echo "locales_touched=$(git diff --name-only -- public/locales | wc -l)   # MUST be 0"

    # (d) Regression sweep across the whole Humble backend suite (separate run).
    npx jest --selectProjects Backend src/backend/humble 2>&1 | tail -20

    # (e) Types and format on the touched files only (repo-wide prettier is red
    #     at baseline; do not widen the scope, and do not check a temp copy).
    pnpm codecheck 2>&1 | tail -20
    npx prettier --check src/backend/humble/classify.ts src/common/humble/keyTypePresentation.ts src/backend/humble/__tests__/classify.test.ts src/backend/humble/__tests__/keyTypePresentation.test.ts src/backend/humble/__tests__/fixtures/tpks.ts
    npx eslint src/backend/humble/classify.ts src/common/humble/keyTypePresentation.ts
    </automated>
    EXPECTED: control_gog=1, negative_keyless=0, classify_set=1, presentation=1,
    locales_touched=0; (d) green with a nonzero test count; (e) clean.
  </verify>
  <done>All five counters hold, the full Humble backend suite is green with a nonzero test count, and codecheck/prettier/eslint are clean on the touched files.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Humble API -> classifier | `key_type` is attacker-influenceable remote string data reaching a Set lookup and a Record lookup. |
| revealed key code -> outbound URL | A secret value that must never be interpolated into a fabricated URL. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-UIC-01 | Information disclosure | `getRedeemTarget` | mitigate | `gog_keyless` is added ONLY to `KEY_TYPE_PRESENTATIONS`, never to `REDEEM_URL_BUILDERS`; a keyless entitlement has no code, so any built URL would either be broken or carry a secret. Enforced by the Task 3 (a) negative pin with positive control, plus the T-42-01 help-branch test that asserts no 'SECRET-CODE' substring. |
| T-UIC-02 | Spoofing | `KEY_TYPE_PRESENTATIONS` lookup | accept | A hostile `key_type` still cannot reach a fabricated URL: `REDEEM_URL_BUILDERS` remains the same closed two-key literal, and the existing T-42-02 test (a full URL as key_type) is unchanged and still passes. |
| T-UIC-03 | Information disclosure | fixture / comments / commit message | mitigate | The live gamekey and purchased game title are operator purchase data and this repo is PUBLIC. Fixture uses a synthetic gamekey and human_name; provenance is cited by date only. |
| T-UIC-04 | Tampering | dependencies | n/a | No package is installed or upgraded by this task. |
</threat_model>

<verification>
The defect is closed when a `gog_keyless` + `direct_redeem:true` tpk becomes a
HumbleKey instead of a `direct-redeem-entitlement` skip, AND that key renders as
GOG, AND it resolves to the help URL rather than a fabricated redeem link.

The live confirmation (out of band, operator-run, NOT part of this plan): on the
next Humble sync the log should show `zeroKeyOrders=0` and `keysCached=33`, and
the GOG title should appear in the keys list. Note that the tests above prove the
pure classification and presentation logic only — they do not exercise the sync
path, which is deliberately out of scope.
</verification>

<success_criteria>
- `classifyOrder` on the live-shaped `gog_keyless` order returns exactly 1 key with `platform === 'gog_keyless'`.
- `getKeyTypePresentation('gog_keyless')` === `{ kind: 'branded', name: 'GOG', logo: 'gog' }`.
- `getRedeemTarget('gog_keyless', code)` === `{ kind: 'help', url: HUMBLE_REDEEM_HELP_URL }`, and `REDEEM_URL_BUILDERS` structurally contains no `gog_keyless`.
- `getRedeemTarget('gog', 'GOG-KEY-1')` still deep-links — no regression on the keyed path.
- Both doc comments name the live 2026-09-08 provenance and record that `gog` is retained; neither still claims the set is purely the Playnite/Galaxy union.
- No file under `public/locales/` is modified.
- Full `src/backend/humble` backend suite green with a nonzero test count; codecheck, prettier and eslint clean on the touched files.
</success_criteria>

<output>
Create `.planning/quick/260908-uic-add-gog-keyless-support-so-humble-gog-ke/260908-uic-SUMMARY.md` when done.

Record in the summary: the Task 1 RED failure count and the Task 3 counter
values (control_gog, negative_keyless, classify_set, presentation,
locales_touched). Also record explicitly that the phase-42 A1 assumption is now
corrected — Humble sends `gog_keyless` for a direct-redeem GOG entitlement, and
`gog` remains the evidenced value for a keyed one.
</output>
</content>
</invoke>
