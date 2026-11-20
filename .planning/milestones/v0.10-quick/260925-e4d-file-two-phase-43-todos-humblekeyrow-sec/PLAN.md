---
task: 260925-e4d
title: File the two Phase 43 defects that UAT item 8 and the 2026-09-22 probe left unowned
created: 2026-09-25
status: complete
type: docs
---

## Why

Phase 43 is 10/10 plans executed and **not closed**. Its only open item is `43-UAT.md` item 8
(`severity: major`) — the `gog_keyless` "Claim on Humble" button is unresponsive. The 2026-09-22
free observation recorded in `43-PROBE-D-43-11.md` then split that one report into **two** distinct
defects and closed neither:

1. the original dead button, whose live repro has since **disappeared** (the operator linked GOG,
   so `gog_keyless` no longer occurs in this library);
2. a **new, inferred** defect — Racine is now `REVEALED`, so it should take an earlier branch and
   render "Finish activation", a dead end for a keyless entitlement.

Neither had a todo. Both were reachable only by reading a UAT gap block and a probe appendix, which
is how items rot. This task files them so they are greppable by `ready:` like everything else.

## Scope

Documentation only. **No source change** — both todos describe defects in
`src/frontend/screens/Humble/Keys/`, and neither is fixed here.

## Tasks

1. Re-confirm the branch ordering the probe inferred (`index.tsx:496` before `:533`) rather than
   trusting the probe's static read. **Done** — confirmed, and `onFinish` traced to
   `openWizard(key, 'finish')` at `Keys/index.tsx:435`.
2. Re-read `useStoreEmbedHost.ts:17-22` and adjudicate the UAT's "forbidden in writing" claim
   rather than copying it forward. **Done** — the claim is partly overstated; correction written
   into the todo (the hook's single-writer rule names `storeEmbedSetBounds`, and this call site
   uses `storeEmbedOpen`; the non-arguable half is the absent host/slot lifecycle).
3. Write both todos to `.planning/todos/pending/` with the three CLAUDE.md triage keys.
4. Gates: `todo-frontmatter-gate.py`, `npx prettier --check` over the exact paths written,
   `pnpm planning-gates`.

## Verify

- `python3 .planning/todos/todo-frontmatter-gate.py` → PASS (21 pending todos in vocabulary)
- `npx prettier --check <the two paths>` → "All matched files use Prettier code style!"
- `pnpm planning-gates` → 13/13
