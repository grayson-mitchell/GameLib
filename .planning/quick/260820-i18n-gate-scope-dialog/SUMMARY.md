---
name: i18n-gate-scope-dialog
status: complete
date: 2026-08-20
---

# Quick task: repair `genI18nGateScope` A-17 anti-rot

## What broke, and who broke it

Quick task `260820-kq0` commit `1b7fa0eaa` made a **styling-only** change to
`src/frontend/components/UI/Dialog/components/Dialog.tsx` (`borderRadius: '10px'` on
`StyledPaper`, plus a `Slide` `TransitionComponent` at 500ms). It did not update the i18n gate's
scope bookkeeping, so `Dialog.tsx` became fork-touched while the committed
`meta/i18nForkTouchedFiles.json` still listed 180 files without it. `A-17 ANTI-ROT` compares the
committed artifact against the live git derivation and failed by name.

**That task was reported at the time as "108/108 suites, 1821/1821 tests green."** That was the
*frontend* jest project only. `test:ci` also runs the `meta/` project, which was never run — so two
CI-breaking changes shipped under a green report. The sibling `hardcodedStringGate` failure from the
same task was repaired separately at `5b7481b2e`.

## The fix

Two files:

- `meta/i18nForkTouchedFiles.json` — regenerated via `pnpm gen-i18n-gate-scope` (no
  `--rewrite-scope`). 180 → 181, adding `Dialog.tsx`.
- `meta/__tests__/genI18nGateScope.test.ts` — `DECLARED_UNSCANNED_DEBT` 18 → 19 entries
  (`Dialog.tsx` in sorted position); the four fixture-sanity pins `toBe(180)` → `toBe(181)`; six
  present-tense prose/test-name counts corrected.

Untouched by design: `meta/i18nGateScope.json`, `meta/i18nGateAllowlist.json`,
`meta/genI18nGateScope.ts`, `Dialog.tsx`.

## Decision: declared as DEBT, not brought into scope

`Dialog.tsx`'s only i18n-relevant string is `aria-label="close"` (`Dialog.tsx:123`) — everything
else is MUI props, `window.api` arguments and CSS values. The change that made it fork-touched
introduced no strings. Scanning it would mean wrapping that `aria-label` in `t()`, minting a key and
editing a primitive with **25 consumers** — scope creep inside a CI repair.

**Follow-up candidate, recorded so the debt stays visible:** `aria-label="close"` at `Dialog.tsx:123`
is unlocalised.

## No gate was weakened

`expect(scopeSnapshot.files.length).toBe(162)` **stays 162** — that is the assertion protecting the
blocking gate's *scanned* set, and it remains armed. The four `180` literals (A0 fixture sanity ×2,
A3 positive control, A4 bootstrap) are reached through `freshSnapshot()`; they pin the fixture to
current reality and guard nothing about scope growth. A-03 and A2 were **satisfied** via the
ratchet's own sanctioned "declare it as debt" branch, not softened; their non-vacuity specs are
untouched. A5 (provenance) stays unreached because the hand-curated scope file is never written.
Historical prose recording past transitions (`160 -> 178 at 34.13`, `178 -> 180 at 34.15-09`) was
deliberately left as history.

## Verification — real output

```
npx jest genI18nGateScope hardcodedStringGate
Test Suites: 2 passed, 2 total
Tests:       1 skipped, 154 passed, 155 total
```

Baseline at HEAD `426046130` was `1 failed, 1 skipped, 153 passed`. Target met exactly.

## Execution note

The assigned executor hit a session limit mid-task. It had regenerated the JSON but not yet updated
the test file — leaving the tree in the 5-failure intermediate state (the A-03 ratchet plus four
literal pins), which is strictly worse than the 1-failure state it started from. The orchestrator
finished the remaining edits inline rather than re-spawning, and applied the change under assertions
that the `toBe(162)` ratchet survived and the `toBe(162)` count was unchanged.
