---
phase: quick-260911-ftc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/humble/library.ts
  - src/common/types/humble.ts
  - src/backend/humble/__tests__/library.test.ts
  - src/frontend/screens/Humble/Keys/index.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx
  - .planning/todos/pending/2026-09-10-a-rejected-reveal-writes-a-revealedat-annotation-and-strands-the-key.md
autonomous: true
requirements: [TODO-2026-09-10-STRANDED-KEY]

must_haves:
  truths:
    - "A server-rejected reveal leaves NO revealedAt entry in humbleRevealedStore for that machineName"
    - "A key whose reveal was rejected classifies UNREVEALED on the next sync and can be revealed again through GameLib"
    - "The refusal is durably recorded and readable per-key after an app restart"
    - "A later successful reveal supersedes the refusal record; a key revealed on Humble's website never carries one"
    - "Re-clicking Claim on a previously-refused key shows the honest 'Humble declined…' warning BEFORE the reveal re-fires"
    - "Zero new user-visible strings are added (no new gamelib.json key, no new (locale, key) presence pairs)"
  artifacts:
    - path: "src/backend/humble/library.ts"
      provides: "rejected_by_server rollback + audit-derived revealRefusedAt"
      contains: "revealRefusedAt"
    - path: "src/common/types/humble.ts"
      provides: "ClaimAnnotation.revealRefusedAt"
      contains: "revealRefusedAt"
    - path: "src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx"
      provides: "prior-refusal banner on the warning step"
      contains: "priorRefusalAt"
  key_links:
    - from: "src/backend/humble/library.ts"
      to: "humbleAuditStore"
      via: "getClaimAnnotations reads the last reveal-outcome record"
      pattern: "humbleAuditStore\\.get"
    - from: "src/frontend/screens/Humble/Keys/index.tsx"
      to: "HumbleClaimWizard"
      via: "openWizard passes annotation.revealRefusedAt"
      pattern: "priorRefusalAt"
---

<objective>
A Humble reveal that the server REFUSES currently keeps its write-ahead
`revealedAt` flag. That flag makes `classifyTpk` return `REVEALED`, and both
`doRevealKey`'s own eligibility gate and `ipc_handler`'s re-validation then
refuse every future attempt — one refusal permanently removes the only in-app
claim path for a key the user owns and never received.

Purpose: restore the claim path after a refusal WITHOUT reverting to the
opposite unconditional assumption ("a denial means nothing was consumed").
Output: rollback on refusal, a durable audit-derived "attempted, refused,
cause unknown" fact on `ClaimAnnotation`, and that fact rendered as a warning
on the wizard step the user must pass through before the reveal re-fires.
</objective>

<design_decisions>

These are the decisions this plan takes. An executor that disagrees must stop
and say so, not silently substitute a different shape.

**DD-1 — Roll back the write-ahead flag on `rejected_by_server`.**
`library.ts:1390` already performs exactly this rollback for the definitive-
failure branch; the refusal branch gets the same `humbleRevealedStore.delete(
machineName)`.

WR-06's stated rationale (`library.ts:1364-1372`) is that a denial can mean
"already redeemed upstream", so rolling back would misreport "nothing was used
up". That rationale is **superseded by measurement AND by a mechanism already
in the code**:

- Measured (Phase 43 probe D-43-11): the server declined and gog.com was never
  granted. "Humble said no" and "Humble already gave it to you" are different
  facts and the denial does not distinguish them.
- Mechanism: if the key genuinely IS consumed server-side, the very next sync
  says so on its own. `classify.ts:409` sets `redeemedKeyValuePresent` from a
  truthy `redeemed_key_val`, and `classifyTpk` (`classify.ts:56-60`) returns
  `REVEALED` on server truth alone, with no local flag involved. Rolling back
  therefore surrenders NOTHING that WR-06 was protecting — it only stops the
  app from *guessing* a fact the server reports itself one sync later.

**DD-2 — NO sixth `HumbleKeyState`. The refusal is attempt metadata.**
The todo asks for "a state that means attempted, refused, cause unknown". This
plan reads that as a requirement for a durable, surfaced FACT, not for a new
member of `HumbleKeyState`. Reasons:

- `HumbleKeyState` classifies the KEY (is it revealed / redeemed / expired). A
  refused attempt changes nothing about the key: it is still unrevealed, still
  owned, still claimable. Encoding attempt history in it would put a fact that
  DECAYS (a later success supersedes it) into a union that `classifyOrder`
  recomputes from a fresh server payload every sync, with `isRevealed` as the
  only locally-carried-forward input (Pitfall 5, `classify.ts:302-307`).
- Cost: a 6th member cascades through `stateLabels.ts`, `viewFilters.ts`
  (`WAITING_STATES`), `urgencyBadge.ts`, `expirationDisplay.ts`,
  `HumbleKeyRow`, `ipc_handler.ts` and ~13 test files, and mints a new
  user-visible state label — see DD-4 for why a new string is expensive here.
- The todo's own operative requirement — "the claim path must stay reachable
  from that state" — is satisfied by DD-1 returning the key to `UNREVEALED`.

**DD-3 — Derive the refusal from the EXISTING audit trail, not a new store.**
`appendAudit` already writes `reveal_rejected` with `outcome:
'rejected_by_server'` to `humbleAuditStore` — composite-keyed and
disconnect-exempt (D-04 exemption). `getClaimAnnotations` derives
`revealRefusedAt` by scanning that trail for the LAST reveal-OUTCOME record and
emitting its `at` only when that record is `reveal_rejected`.

This buys supersession for free and costs nothing:
- a later `reveal_success` / `reveal_failed` / `reveal_ambiguous` supersedes it
  automatically — no second writer to keep in sync with the audit trail;
- a key revealed on Humble's WEBSITE (D-66) has no audit records at all, so it
  can never carry a refusal;
- no new `CacheStore` ⇒ the mirrored-registration-list hazard does not arise.
  (Verified: `humble_audit` is already in the recognized-names list at
  `src/backend/__tests__/cache.test.ts:140`.)

**DD-4 — ZERO new user-visible strings. Reuse the shipped wizard copy.**
The warning is rendered on the wizard's EXISTING `warning` step using the
already-shipped key `humbleKeys.revealRejectedBody` ("Humble declined to reveal
this key — it may already be redeemed or expired. Sync to check its current
status."), verified present in `public/locales/en/translation.json` and already
used at `HumbleClaimWizard/index.tsx:556`.

No row-level annotation is added, deliberately:
- Measured 2026-09-11: the `gamelib` presence baseline
  (`meta/i18nCatalogPresenceBaseline.json`) is at `totalPairs: 0` while the live
  gap is **816** pairs (17 keys × 48 locales). R13 in
  `meta/__tests__/lintTranslations.test.ts` is therefore ALREADY red at HEAD,
  and one new key would deepen it by 48 more pairs. Do not regenerate that
  baseline (its own `reason` string forbids it) and do not add a key here.
- The wizard's `warning` step is the surface every claim passes through
  (`HumbleClaimWizard/index.tsx:88-90`: Steam always, non-Steam on
  `entryMode === 'claim'`), so the warning lands at the moment of decision
  rather than as passive row chrome. The row's plain Claim button IS the
  restored claim path the todo demands; it is not a naked retry, because the
  click opens a confirm step that now carries the refusal notice.

**DD-5 — The `ambiguous` (adapter threw) branch is OUT OF SCOPE.** It is a
different fact: we genuinely do not know whether Humble processed the reveal,
so keeping the flag and reporting "unconfirmed — sync to check" is honest.
Do not touch `library.ts:1417-1443`.

**DD-6 — Do NOT widen the C5 redaction** to read Humble's error message. The
todo rules it out of scope explicitly, and nothing in this plan needs it: the
recorded fact is deliberately "refused, cause unknown".

</design_decisions>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-09-10-a-rejected-reveal-writes-a-revealedat-annotation-and-strands-the-key.md

Source anchors verified 2026-09-11 at branch `fix/steam-native-install-stability`:
- `src/backend/humble/library.ts:1313` — write-ahead `humbleRevealedStore.set`
- `src/backend/humble/library.ts:1363-1385` — the `rejected_by_server` branch
- `src/backend/humble/library.ts:1390` — the definitive-failure rollback to copy
- `src/backend/humble/library.ts:804-819` — `appendAudit`
- `src/backend/humble/library.ts:838-857` — `getClaimAnnotations`
- `src/common/types/humble.ts:230-242` — `ClaimAnnotation`
- `src/backend/humble/__tests__/library.test.ts:2849` — the WR-06 test to INVERT
- `src/frontend/screens/Humble/Keys/index.tsx:294-321` — `openWizard`
- `src/frontend/screens/Humble/Keys/index.tsx:413-437` — `claimAction` build
- `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx:50-57` — `Props`
- `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx:421-470` — `warning` step (Steam + non-Steam branches)
- `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.css:128` — `.humbleClaimWizardRejectedNote`

<interfaces>
Current, from `src/common/types/humble.ts:230-242`:

```typescript
export interface ClaimAnnotation {
  revealedAt?: number
  redeemedAt?: number
  redeemedSource?: 'user' | 'ownership-exact'
  keyindexResolved: boolean
}
```

Current, from `src/backend/humble/electronStores.ts`:

```typescript
export interface AuditRecord {
  event: string
  at: number
  outcome?: string
  title: string
  platform: string
}
// humbleAuditStore: CacheStore<AuditRecord[], string>, composite `gamekey:machineName`
```

Current, from `HumbleClaimWizard/index.tsx:50-57`:

```typescript
type Props = {
  humbleKey: HumbleKey
  entryMode: 'claim' | 'finish'
  onDone: () => void
}
```
</interfaces>

Executor notes (measured, do not re-derive):
- Baseline 2026-09-11: `npx jest src/backend/humble/__tests__/library.test.ts`
  is GREEN at 133 tests. That is your before-picture.
- The repo has PRE-EXISTING red gates at HEAD (`pnpm lint`, parts of the
  backend suite, and R13's 816-pair gamelib presence gap). Scope every
  verification claim to the touched files. Do NOT claim repo-wide green.
- Run jest as its OWN command, never chained after a write in the same shell
  invocation — a `write && npx jest` reads a stale tree.
- Jest projects are declared by PATH (`jest.config.js`), with no
  `displayName`; select suites by file path, not `--selectProjects`.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Roll back the refused reveal and record the refusal from the audit trail</name>
  <files>src/backend/humble/library.ts, src/common/types/humble.ts, src/backend/humble/__tests__/library.test.ts</files>
  <behavior>
    Write these as failing tests FIRST in `src/backend/humble/__tests__/library.test.ts`,
    against the existing `mockAdapterRevealKey` / `revealedData` / `auditData` harness.

    Rollback (`describe('HumbleLibrary.revealKey()')`):
    - Test 1 — INVERT the existing WR-06 test at line 2849. Rename it to state the
      new contract, keep every other assertion it makes (audit events
      `['reveal_attempt','reveal_rejected']`, `outcome: 'rejected_by_server'`,
      no cooldown, `getRevealedKeyValue` null, return `{status:'rejected_by_server'}`),
      and flip `expect(revealedData.has('gk1_key')).toBe(true)` to `.toBe(false)`.
      Replace its WR-06 comment block with the DD-1 rationale. Do NOT delete the test.
    - Test 2 — claim path reachable: after a `rejected_by_server` reveal, a SECOND
      `revealKey('gk1','gk1_key')` reaches the adapter (assert
      `mockAdapterRevealKey` called twice, and the second outcome is not
      `{status:'ineligible'}`).
    - Test 3 — `D-78 ambiguous` (line ~2872) is UNCHANGED and still asserts
      `revealedData.has('gk1_key') === true` (DD-5 guard: prove the two branches
      did not get collapsed).

    Derivation (`describe('HumbleLibrary.getClaimAnnotations()')`):
    - Test 4 — after a `rejected_by_server` reveal, `getClaimAnnotations()['gk1:gk1_key']`
      has `revealRefusedAt` equal to the `at` of the `reveal_rejected` record and
      `revealedAt` undefined.
    - Test 5 — supersession by success: a `reveal_rejected` followed by a later
      `reveal_success` record yields `revealRefusedAt` undefined.
    - Test 6 — supersession by a later `reveal_failed` and by a later
      `reveal_ambiguous`: both yield `revealRefusedAt` undefined.
    - Test 7 — an audit trail containing ONLY `reveal_attempt` (write-ahead marker,
      no outcome yet) yields `revealRefusedAt` undefined.
    - Test 8 — a key with NO audit records at all (the D-66 website-revealed shape)
      yields `revealRefusedAt` undefined.
    - Test 9 — a non-reveal record appended AFTER the refusal (e.g. `mark_redeemed`
      or `ownership_settled`) does NOT clear it: only reveal-outcome events count.
  </behavior>
  <action>
Make the tests above pass with three edits.

(a) `src/common/types/humble.ts` — add to `ClaimAnnotation` (L230-242) an optional
`revealRefusedAt?: number`, documented as: the timestamp of the LAST reveal
attempt when that attempt was REFUSED by Humble's server and no later reveal
outcome has superseded it. Explicitly state it means "attempted, refused, cause
unknown" — never "already redeemed", because the server's reason is redacted
under C5 and the D-43-11 probe measured a refusal where nothing was consumed.
Never carries a key value.

(b) `src/backend/humble/library.ts`, the `rejected_by_server` branch at 1363-1385
— insert `humbleRevealedStore.delete(machineName)` alongside the existing
`appendAudit(... 'reveal_rejected' ...)`, mirroring the definitive-failure
rollback at 1390. Rewrite the WR-06 comment to record DD-1: a denial is NOT
evidence of consumption (measured, Phase 43 probe D-43-11 — Humble declined and
gog.com was never granted); if the key genuinely IS consumed server-side the
next sync reports it through `redeemed_key_val` → `classifyTpk`'s server-truth
arm, so nothing WR-06 protected is lost. Keep the log line but change
"keeping REVEALED flag" to say the flag was rolled back — the old text would
otherwise assert the opposite of what the code now does. Keep the audit append,
keep "no cooldown", keep the `rejected_by_server` return, and keep T-14-05:
never auto-resubmit.

(c) `src/backend/humble/library.ts`, `getClaimAnnotations` (838-857) — inside the
per-key loop read `humbleAuditStore.get(composite, [])`, walk it BACKWARDS to
the first record whose `event` is one of
`reveal_success | reveal_rejected | reveal_failed | reveal_ambiguous`, and set
`revealRefusedAt` to that record's `at` only when the event is `reveal_rejected`;
otherwise leave it undefined. Define the outcome-event set as a module-level
`const` so the exclusion of `reveal_attempt` is explicit and greppable —
`reveal_attempt` is the write-ahead marker, is ALWAYS present, and would mask
the real outcome if it were treated as one. Document in the function's doc
comment that this is derived (DD-3), not stored, so a later outcome supersedes
it with no second writer to drift.

Do not add a CacheStore. Do not touch `HumbleKeyState`, `classify.ts`,
`ipc_handler.ts`, or the `ambiguous` branch.
  </action>
  <verify>
    <automated>npx jest src/backend/humble/__tests__/library.test.ts</automated>
  </verify>
  <done>The humble library suite passes with strictly more than its 133 baseline tests; a refused reveal leaves no `revealedAt` behind, a second attempt reaches the adapter, and `revealRefusedAt` is reported only when the last reveal outcome was a refusal.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Warn on the wizard's confirm step before a previously-refused reveal re-fires</name>
  <files>src/frontend/screens/Humble/Keys/index.tsx, src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx, src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx</files>
  <behavior>
    In `HumbleClaimWizard/__tests__/index.test.tsx`, following the file's existing
    render/prop conventions:
    - Test 1 — non-Steam key, `entryMode="claim"`, `priorRefusalAt={1788999862004}`:
      the warning step renders the `humbleKeys.revealRejectedBody` copy, AND still
      renders its existing confirm action (the reveal is offered, not blocked).
    - Test 2 — same key with `priorRefusalAt={null}` (and with the prop omitted
      entirely): that copy is absent.
    - Test 3 — Steam key, `entryMode="claim"`, `priorRefusalAt` set: the copy
      renders on the Steam branch of the warning step too.
    - Test 4 — zero-new-strings guard: assert the rendered notice resolves through
      the EXISTING key `humbleKeys.revealRejectedBody` (match the shipped English
      default), not a new key.
  </behavior>
  <action>
`HumbleClaimWizard/index.tsx`: add `priorRefusalAt?: number | null` to `Props`
(L50-57), defaulting to `null` in the destructure. In the `warning` step
(L421-470) render, in BOTH the Steam branch and the non-Steam branch, directly
above the existing body paragraph and only when `priorRefusalAt != null`:

  a `<p className="humbleClaimWizardRejectedNote">` containing
  `t('humbleKeys.revealRejectedBody', 'Humble declined to reveal this key — it
  may already be redeemed or expired. Sync to check its current status.')`

Reuse that exact existing key and default verbatim (it is already used at L556
and is present in `public/locales/en/translation.json`). ADD NO NEW i18n KEY —
see DD-4. Reuse `.humbleClaimWizardRejectedNote`, already defined at
`HumbleClaimWizard/index.css:128`; add no new CSS class. Comment the block with
why the refusal is a warning and not a block: the D-43-11 measurement showed a
refusal that consumed nothing, so the user keeps the only in-app claim path,
but never as a silent retry.

`Keys/index.tsx`: widen `openWizard` (L294) to
`openWizard(key, entryMode, priorRefusalAt: number | null = null)` and forward
it to BOTH `<HumbleClaimWizard>` instances. At the `claimAction` build
(L413-437) change `onClaim` to
`() => openWizard(key, 'claim', annotation?.revealRefusedAt ?? null)`. Leave
`onFinish` alone — a refused key is `UNREVEALED` and never renders Finish.

Do NOT widen `ClaimAction` and do NOT modify `HumbleKeyRow/index.tsx`: the
`onClaim` closure already has `annotation` in scope, so the row needs no new
prop. Add no new source FILE (a new file would fall outside the committed
`meta/i18nGateScope.json` snapshot).
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Humble/Keys</automated>
  </verify>
  <done>Both Humble Keys frontend suites pass; clicking Claim on a previously-refused key opens the confirm step carrying the "Humble declined…" notice, and `git diff public/locales` is empty.</done>
</task>

<task type="auto">
  <name>Task 3: Close the source todo and record the decision</name>
  <files>.planning/todos/pending/2026-09-10-a-rejected-reveal-writes-a-revealedat-annotation-and-strands-the-key.md</files>
  <action>
Append a `## Resolution (2026-09-11, quick 260911-ftc)` section to the todo
recording, in this order: the rollback (DD-1) and the measured reason WR-06's
inference was wrong; the explicit answer to the todo's "a state that means
attempted, refused, cause unknown" — NO sixth `HumbleKeyState`, the fact lives
on `ClaimAnnotation.revealRefusedAt` as attempt metadata (DD-2), with the
reason; that it is DERIVED from `humbleAuditStore` rather than stored, so a
later outcome supersedes it (DD-3); that zero new user-visible strings were
added and why (DD-4, the 816-pair presence gap); and that the C5 redaction was
NOT widened and the `ambiguous` branch was NOT touched (DD-5/DD-6). Name the
regression tests by describe/test name so a future reader can grep them.

Then `git mv` the file from `.planning/todos/pending/` to
`.planning/todos/completed/`. Do not edit its frontmatter: the
`severity`/`platform`/`ready` triage gate
(`.planning/todos/todo-frontmatter-gate.py`) scopes to `pending/` only and
`completed/` is deliberately exempt.
  </action>
  <verify>
    <automated>test ! -e .planning/todos/pending/2026-09-10-a-rejected-reveal-writes-a-revealedat-annotation-and-strands-the-key.md && test -e .planning/todos/completed/2026-09-10-a-rejected-reveal-writes-a-revealedat-annotation-and-strands-the-key.md && python3 .planning/todos/todo-frontmatter-gate.py</automated>
  </verify>
  <done>The todo is gone from `pending/`, present in `completed/` with a Resolution section, and the triage gate still passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Humble server → `doRevealKey` | An untrusted, deliberately opaque outcome decides local persistence |
| backend → renderer (`humbleGetClaimAnnotations`) | A widened IPC payload crosses to the frontend |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ftc-01 | Information disclosure | `ClaimAnnotation.revealRefusedAt` | mitigate | Emit a NUMBER only, derived from `AuditRecord.at`. `appendAudit` never accepts a key value (C4/D-76), and the derivation reads only `event`/`at` — no `title`, no `outcome` string, and never Humble's redacted error message (DD-6). |
| T-ftc-02 | Tampering | reveal retry loop | mitigate | The rollback makes retry POSSIBLE, never AUTOMATIC. `revealsInFlight` (`library.ts:1188-1211`) still blocks concurrent double-fire, T-14-05's no-auto-resubmit is unchanged, and every retry passes the wizard's confirm step now carrying the refusal notice. |
| T-ftc-03 | Repudiation | refusal record | accept | The refusal is derived from the append-only, disconnect-exempt `humbleAuditStore`; a disconnect/reconnect cannot erase it. Deriving (not storing) removes the risk of a second writer drifting from the audit trail. |
| T-ftc-SC | Tampering | package installs | n/a | This plan installs no packages. No `package.json` change; the legitimacy gate does not apply. |
</threat_model>

<verification>
Scoped to the touched files — the repo has pre-existing red gates at HEAD
(`pnpm lint`, parts of the backend suite, R13's 816-pair gamelib presence gap).
Do NOT claim repo-wide green.

1. `npx jest src/backend/humble/__tests__/library.test.ts` — green, test count
   strictly above the 133 baseline.
2. `npx jest src/frontend/screens/Humble/Keys` — green.
3. `npx tsc --noEmit -p tsconfig.json` — no NEW errors attributable to the six
   touched source files (compare against a HEAD-stash baseline if any errors
   pre-exist; name the sha you baselined against).
4. `git diff --stat public/locales meta/i18nCatalogPresenceBaseline.json` —
   MUST be empty. A non-empty diff means DD-4 was violated.
5. `git diff src/common/types/humble.ts | grep -c "HumbleKeyState"` — MUST be 0
   (DD-2: no sixth state member).
6. `grep -n "reveal_attempt" src/backend/humble/library.ts` — the outcome-event
   set must NOT contain it.
</verification>

<success_criteria>
- A `rejected_by_server` reveal leaves `humbleRevealedStore` with no entry for
  that `machineName`, and a second `revealKey` for the same key reaches the
  adapter — proven by tests, not by reading the diff.
- `getClaimAnnotations()` reports `revealRefusedAt` exactly when the last reveal
  OUTCOME record for that composite key is `reveal_rejected`, and never for a
  website-revealed key or a key with only a `reveal_attempt` marker.
- The wizard's confirm step shows the shipped "Humble declined…" copy before a
  previously-refused reveal can re-fire, on both the Steam and non-Steam branch.
- `public/locales/**` and `meta/i18nCatalogPresenceBaseline.json` are byte-
  unchanged.
- `HumbleKeyState` is unchanged; `classify.ts`, `ipc_handler.ts`,
  `HumbleKeyRow/index.tsx` and the `ambiguous` branch are untouched.
- The source todo is in `.planning/todos/completed/` with a Resolution section
  that names DD-1..DD-6.
</success_criteria>

<output>
Create `.planning/quick/260911-ftc-fix-the-stranded-key-bug-a-server-reject/260911-ftc-SUMMARY.md` when done.
</output>
