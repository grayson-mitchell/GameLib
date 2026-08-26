---
quick_id: 260826-w4c
slug: clear-34-6-review-wr-01-wr-02-wr-03
created: 2026-08-26
description: "Fix the three open warnings in 34.6-REVIEW.md so the review can honestly reach status: resolved"
autonomous: true
files_modified:
  - src/backend/sidecar/enrichmentFlowRegistration.ts
  - src/backend/steamgrid/ipc_handler.ts
  - src/backend/sidecar/steamgridSecretStore.ts
  - src/frontend/components/UI/SearchBar/index.tsx
  - .planning/phases/34.6-.../34.6-REVIEW.md
---

## Tasks

**WR-01 — validate the key at BOTH IPC boundaries.** `enrichmentFlowRegistration.ts:264` is
`args[0] as string` (a cast, not a check) and `ipc_handler.ts:20` forwards its param untyped.
A non-string reaching `SLOT_STORE.setToken()` gets `requestRustInvoke` awaited FIRST — so the write
may actually be issued as a serialized `null` — and only then does `token.length` throw, landing in
a catch that logs "failed" for a write that may have succeeded with a corrupted value. Guard with
`typeof key !== 'string'` → warn and return.

**WR-02 — replicate the Electron trim/empty-as-clear on the sidecar path.**
`secretStore.ts:99` does `value.trim()` and treats whitespace-only as an explicit clear;
`steamgridSecretStore.ts:87` passes `value` straight through. Byte-identical user input therefore
behaves differently per build, and the whitespace-only "clear the key" gesture does not clear on
the sidecar. Apply the review's own suggested body.

**WR-03 — correct the stale comment.** `SearchBar/index.tsx:89` asserts the focus race is "the
cause of live-gate Step 4's FAIL", "Proven by measurement", under "DO NOT REMOVE THIS HANDLER".
That causal claim is contradicted twice over: the `:focus-within` theory was withdrawn as DISPROVEN
by live re-drive, and the 2026-08-26 Step 4 re-drive points at search/hover/selection-commit.
Per the review's prescribed fix: KEEP the mechanical description of what `preventDefault()` does
(still accurate and useful), drop the causal claim and the overconfident framing.

**Then** refresh `34.6-REVIEW.md`: `resolution:` all four → resolved, `status:` → `resolved`.

## Constraints

- Do NOT remove the `preventDefault` handler itself — the focus-race mechanism it mitigates is
  real and worth keeping. Only the comment's *causal claim* is unsupported.
- Do NOT edit the findings' original text in the review; only the resolution metadata.
- Tests for the two behavioural fixes must fail against the pre-fix code, not merely pass after.
