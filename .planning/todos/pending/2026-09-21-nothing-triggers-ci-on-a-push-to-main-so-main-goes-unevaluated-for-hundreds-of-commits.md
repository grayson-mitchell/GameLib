---
created: 2026-09-21T00:00:00.000Z
title: "Nothing triggers CI on a push to `main`, so this direct-to-main repo went 226 commits with no automatic evaluation — and `smoke:sidecar`, which only has value in CI, is the sole gate for a contract that broke 3 times in 3 weeks"
area: tooling
severity: major
platform: any
ready: code
found_by: "quick-260922-9um (the source todo's own deliberately-unbundled observation)"
files:
  - .github/workflows/test.yml
  - .github/workflows/lint.yml
  - .github/workflows/codecheck.yml
  - .husky/pre-push
---

## Measured at `48215a893`

All three quality workflows trigger on `pull_request` plus `workflow_dispatch` and **nothing else**:

| workflow          | triggers                                              | runs                              |
| ----------------- | ----------------------------------------------------- | --------------------------------- |
| `test.yml`        | `pull_request: [main, stable]`, `workflow_dispatch`   | `pnpm test:ci`, `pnpm smoke:sidecar` |
| `lint.yml`        | `pull_request: [main, stable]`, `workflow_dispatch`   | `lint`, `prettier`, `find-deadcode`  |
| `codecheck.yml`   | `pull_request: [main, stable]`, `workflow_dispatch`   | `tsc --noEmit`                       |

The only `push:` triggers anywhere in `.github/workflows/` are `create-pr-from-stable.yml` (on
`stable`) and `release-tauri.yml` (on `v*` tags). **No workflow fires on a push to `main`.**

This repo works direct-to-main at volume:

- **226 commits** since the last `pull_request`-triggered run (`fa2ad5030`, 2026-09-15).
- **136 commits** since the last merge commit (`dd5c44663`, 2026-09-16).
- **1714 commits** in the last 30 days.

So CI evaluated `main` on 2026-09-21 only because someone dispatched it **by hand**. Absent that,
nothing would have.

## Why `severity: major` and not `medium`

Not because something is red right now — it is not. Because of **what is ungated, and for how long**.

`CLAUDE.md`'s sidecar-exit-contract section says of it, verbatim: *"What enforces this, honestly:
almost nothing. `pnpm smoke:sidecar` (`.github/workflows/test.yml:32`) is the only gate"*, that
**"No test asserts the invariant"**, and — the load-bearing part — that it *"runs warm locally and
only ever sees the cold path in CI."*

That contract has **broken three times in three weeks** (`ef77e4a1e`, `9e8e1b224`, and the open
`260913-m9c`), and the first of those was caught precisely *because* `smoke:sidecar` went red.

Put together: the one gate for a thrice-broken invariant derives its value from running in CI, and
CI has not fired on `main` automatically for 226 commits. It is not that the measurement is
contaminated — **it is absent**, on the branch this project actually develops on.

`pre-push` does not close this. It runs five gates and **zero jest**:

```
pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update && pnpm find-deadcode
```

`pnpm test:ci` and `pnpm smoke:sidecar` — the whole of `test.yml` — run **nowhere** automatically.
`.husky/pre-commit` is entirely commented out (`#pnpm lint-fix`), so it enforces nothing either.

**Argued down from `critical`** deliberately: the absence is *visible* to anyone who opens the
Actions tab, any contributor can dispatch a run by hand, and `pre-push` does cover 4 of `lint.yml`'s
and all of `codecheck.yml`'s ground since `260922-9um`. Bounded, with a workaround. But the jest and
sidecar-smoke half has no local counterpart at all.

## This has already caused exactly one proven failure

`260922-9um` closed a todo whose whole subject was `lint.yml` being **red since 2026-07-14** —
five recorded runs, all failing, across two months — with nobody learning. Its root cause was that
`find-deadcode` was absent from `pre-push`; its *reason for going unnoticed for two months* was
this trigger gap. That todo recorded the gap as a separate observation and explicitly declined to
bundle it. This is that todo.

## `ready: code` — the cost objection dissolves on measurement

This looks like a policy/cost decision, which would make it `ready: human`. It is not, for two
measured reasons:

1. **The repo is PUBLIC** (`grayson-mitchell/GameLib`, `visibility=PUBLIC`), so GitHub Actions
   minutes are free. There is no billing trade-off to decide.
2. **75% of the volume is not code.** 433 of the 579 commits in the last 14 days touch no `src/`,
   `meta/`, or `src-tauri/` path at all — they are `.planning/` and docs commits. A `paths-ignore`
   filter removes three quarters of the would-be runs before any other tuning.

## Suggested remedy

Add to `test.yml`, `lint.yml` and `codecheck.yml`:

```yaml
on:
  push:
    branches: [main, stable]
    paths-ignore:
      - '.planning/**'
      - '**.md'
  pull_request:
    branches: [main, stable]
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Notes so this is not "fixed" wrongly:

- **This does not double-run PRs.** A PR from a topic branch pushes to *that* branch, which is not
  in `push.branches`, so only the `pull_request` event fires. Double runs would need the PR's
  source branch listed under `push`.
- **`cancel-in-progress` is a deliberate trade**: rapid successive pushes cancel earlier runs, so
  an intermediate commit's failure can be missed while the tip is still evaluated. For rot
  detection that is the right choice; if per-commit bisectability ever matters more, drop it.
- **Consider a scheduled backstop too** — a nightly `schedule:` on `main` catches rot within 24h
  even if the `paths-ignore` filter is wrong about what counts as code. `build-crossover-index.yml`
  already establishes the cron idiom in this repo.

**Rejected: adding `pnpm test:ci` to `pre-push`.** It would not buy what it looks like it buys.
`CLAUDE.md` records that `smoke:sidecar` *"runs warm locally and only ever sees the cold path in
CI"* — a local pre-push run is the warm path, which is the one that cannot see the defect the gate
exists for. Local execution is not a substitute for CI execution here; it is the weaker half.

## Open question, not answered here

Whether `pnpm test:ci` is green at `48215a893` was being measured when this was filed and is
**not** recorded as a result — see the Quick Tasks row for `260922-9um` if it landed there. The
2026-09-21 hand dispatch at `b7686dcbb` reported `Test … success`, and HEAD is **24 commits** past
that point, so the honest statement is that the last 24 commits are unevaluated rather than that
anything is known to be broken.
