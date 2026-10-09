---
created: 2026-10-09T21:30:00.000Z
title: 'Amazon sign-in probe is a no-op with nothing installed: nile list-updates exits before auth (A4, F-49-R1-4)'
area: auth
severity: medium
platform: any
ready: code
found_by: "plan 49-12, Phase 49 macOS live gate Run 1 (49-LIVE-GATE.md)"
files:
  - src/backend/signInProbe/runnerProbes.ts
  - src/backend/signInProbe/classify.ts
---

# nile list-updates never reaches auth when installed.json is empty

Run 1, item 6 (`49-LIVE-GATE.md` § Run 1, F-49-R1-4). Observed 7× across launches: with
`installed.json = []`, `nile list-updates --json` prints `[]` and
`ERROR [CLI]: No games installed` and exits; no token refresh is attempted, so the probe reports
`healthy` whatever the credential state. A user with no installed Amazon game is never told their
sign-in expired. nile's `library sync` (which the app runs anyway at boot) does exercise the
token: `INFO [LIBRARY]: Synchronizing library … Successfully synced`. Consider probing with the
sync command, or classify the no-games case as `unknown` rather than `healthy`.

## Fix (2026-10-10, quick 261010-h9n, commit `268bae390`)

Took the second route: `classifyNileOutput` now returns `unknown` for any observed, non-aborted
capture containing `No games installed` that carries no auth-failure refresh line. A spawn that
never reached an auth call is zero evidence about the credential either way, so it must not read
`healthy` (260822-vov: `healthy` needs positive evidence from the classifier's own spawn). The
store therefore shows no row for a zero-installed profile instead of a false `connected`.

Re-measured before fixing, against the bundled `public/bin/arm64/darwin/nile/nile` with an
isolated `NILE_CONFIG_PATH`: exit 0, stdout `[]`, stderr `ERROR [CLI]:<TAB> No games installed`,
identical with and without an `installed.json`. The marker is the bare phrase; the prefix and its
whitespace are not pinned.

The first route (`nile library sync` as the probe) was NOT taken: 49-CONTEXT D-16 says the pass
never triggers a library sync for any store (49-RESEARCH rejected it on that ground), and the
49-SPEC boundary row gates any replacement command on the Amazon induction live gate
(`2026-10-10-amazon-expiry-strings-need-a-real-induction.md`, `ready: live-gate`), because a
replacement's expired-token output cannot be measured until then. That question stays open there.

Pinned in `classify.test.ts` (both stdout/stderr orders, auth-failure precedence, the marker
literal) and `runnerProbes.test.ts` (probe-level outcome from the two live chunks). Mutation
check: with the guard removed exactly the three negative rows fail (3 failed / 66 passed); with
it, `src/backend/signInProbe` is 191/191. `tsc --noEmit`, eslint and `prettier --check` clean
on the four source paths.
