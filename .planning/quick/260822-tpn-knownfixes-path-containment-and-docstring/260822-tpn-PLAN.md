---
quick_id: 260822-tpn
slug: knownfixes-path-containment-and-docstring
created: 2026-08-22
status: planned
source_findings: [34.2-REVIEW.md round 1 WR-06, 34.2-REVIEW.md round 1 WR-03]
files_to_modify:
  - src/backend/knownFixes.ts
  - src/backend/__tests__/knownFixes.test.ts
---

# Quick 260822-tpn — knownFixes path containment (WR-06) + docstring correction (WR-03)

Closes two round-1 findings from `34.2-REVIEW.md`, both in `src/backend/knownFixes.ts`. They are
one task because they are the same 20-line file: WR-06 is the code, WR-03 is the docstring
directly above it. Dispositioned as open in `34.2-REVIEW-FIX.md`.

## WR-06 — path traversal (the substantive half)

`knownFixes.ts:33` builds `join(fixesPath, `${appName}-${storeMap[runner]}.json`)`.

- `runner` is typed `Runner`, a closed union, and is indexed through `storeMap` — constrained.
- **`appName` is a free string that originates at the renderer** via the `getKnownFixes` IPC
  channel. `join` normalises `..` segments rather than rejecting them, so
  `appName = '../../../../etc/passwd'` escapes `fixesPath` and the function then `readFileSync`s
  and `JSON.parse`s whatever is there.

Impact is bounded — the value must parse as JSON and is returned as `KnowFixesInfo` — but it is
an arbitrary-file read primitive driven by renderer input, and the project already has a named
idiom for exactly this.

**Fix:** apply the established `resolve`+`relative` containment from
`src/backend/sidecar/fileStore.ts:121-133`, which carries the project's own note *"Phase 18's
lesson applies: `path.join` is not containment — use resolve+relative."* Match that shape,
including its `startsWith('..') || isAbsolute(...) || === ''` triple.

**Behaviour on violation: `logWarning` + `return null`, NOT throw.** `fileStore` throws, but
`readKnownFixes`'s established contract is to return `null` for every failure (missing file,
malformed JSON) and its callers rely on that. Throwing would change the contract and could take
down a caller. Logging keeps it loud rather than silent, matching the malformed-JSON branch.

## WR-03 — false docstring (the honesty half)

`knownFixes.ts:5-9` asserts:

> `launcher.ts` is deliberately excluded from the Node sidecar's import graph

That is false and this slice is what made it false:
`sidecar/gameDetailsFlowRegistration.ts` -> `gamedetails/dispatch.ts` -> `storeManagers/index.ts`
-> `storeManagers/gog/library.ts:51` -> `import { callRunner } from '../../launcher'`.
Verified still present 2026-08-22.

The rest of the docstring is accurate and load-bearing (bundle-size rationale, and the MUST NOT
import electron rule). **Correct the false sentence only; do not delete the paragraph.** Same
correction shape plan 34.2-11 applied to WR-02's false transitive-electron-freedom claim: replace
the false claim with the true invariant rather than removing the guidance.

## Tasks

1. **Write the RED test first.** Add a containment case to
   `src/backend/__tests__/knownFixes.test.ts` asserting that a traversing `appName` returns `null`
   and does not read the out-of-tree file. Record that it fails against current code before the
   fix lands — a test that has never been RED proves nothing.
2. **Apply the WR-06 fix** in `knownFixes.ts` using the `fileStore.ts` idiom.
3. **Correct the WR-03 sentence** in the docstring, naming the real import chain.
4. **Verify:** the new test passes, the 5 existing `readKnownFixes` tests still pass,
   `npx tsc --noEmit` clean.
5. **Update `34.2-REVIEW-FIX.md`** — move WR-06 and WR-03 from the Open table to Closed, and
   re-gate the counts (they are mechanically checked: rows must equal `findings.total: 17`).

## Out of scope

The other 7 open round-1 findings. WR-05 and WR-07 are deliberate design decisions that should be
reclassified rather than fixed; WR-10, IN-01, IN-02, IN-03, IN-04 are cosmetic or need a judgment
call on intent.
