---
created: 2026-09-15T00:00:00.000Z
title: "Humble expiration digest leak-sentinel is the bare string \"7\", which the EXPIRY DATE supplies — the test self-heals to green in August without being fixed"
area: test
severity: minor
platform: any
ready: code
status: completed
resolved: 2026-09-15
resolved_by: "quick-260915-g9p"
found_by: 'quick-260914-vbw, 2026-09-14 — appeared as a backend suite red while verifying an unrelated macOS entitlements change; measured pre-existing at baseline sha 7346ac7e6 in a clean worktree'
files:
  - src/backend/humble/__tests__/expirationAlerts.test.ts
---

## Problem

`expirationAlerts.test.ts`, test **"Pitfall 5: digest copy reads only title/expiration — never
revealedKeyValue/keyindex"**, asserts that the generated digest copy does not contain the
substring `"7"`, using it as a sentinel for a leaked `revealedKeyValue`/`keyindex`.

The digest copy legitimately contains the expiry date:

```
Expected substring: not "7"
Received string:    "Safe Title's Humble key now expires on 7/31/2026"
```

**The date supplies the `7`.** `7/31/2026` is July, so the sentinel matches the very string the
test is asserting about, and the assertion fails for a reason that has nothing to do with a leak.

## Why it matters — the failure mode is the GREEN, not the red

A red test is annoying. This one is worse than annoying, because **it will pass again on its own**
as soon as the fixture's expiry date stops rendering a `7` — any month outside July, or a
day-of-month without a 7. Nothing will have been fixed. The next person to look sees green and
concludes the sentinel is protecting against `revealedKeyValue` leakage, when in fact:

- while the date contains a `7`, the test fails for the wrong reason, and
- while the date does NOT contain a `7`, the test passes **whether or not a real leak exists** —
  because `"7"` is a one-character substring that a leaked key value would only coincidentally
  contain.

So in both states the assertion is uninformative about the thing it names. This is the
`flake-baselines-can-be-undiagnosed-bugs` shape: a calendar-dependent test that looks like
intermittency but is a defective assertion.

## Direction

Replace the bare `"7"` sentinel with something that cannot collide with rendered copy:

1. Give the fixture a `revealedKeyValue`/`keyindex` containing a **distinctive, improbable**
   token (e.g. `ZZ-LEAK-SENTINEL-ZZ`) and assert the digest does not contain **that**.
2. Alternatively assert structurally — that the digest is built only from the permitted fields —
   rather than by substring absence, which is inherently a weak negative.
3. Whichever is chosen, **freeze the date** in the fixture so the test is not calendar-dependent
   at all. A test whose result depends on today's date cannot be trusted either way.

Do not simply change the fixture's expiry month. That turns it green while leaving the assertion
just as uninformative, and re-arms the same trap for whichever month collides next.

## Verification

- `npx jest --selectProjects Backend --testPathPattern expirationAlerts` — note the project name
  is **`Backend`** (capital B; `backend` matches nothing and exits 0), and this repo is on
  jest 29.7.0 where the flag is `--testPathPattern` singular, not `--testPathPatterns`.
- Prove the sentinel actually detects a leak: inject a fixture whose `revealedKeyValue` IS in the
  digest and confirm the test goes RED. A negative assertion that has never been observed failing
  for the right reason is not yet a test.
- Confirm the result does not change when the system date is moved across a month boundary.

## Related

- Pre-existing, not introduced by quick-260914-vbw. Measured at baseline sha `7346ac7e6` in a
  clean worktree: fails there identically, with the same test name and message.
- `2026-09-11-humble-keys-title-wrap-sort-label-and-owned-badge-contrast-unverified-live.md` —
  neighbouring Humble-keys work.

## Correction — the premise was wrong

This todo's own title claims "the EXPIRY DATE supplies" the `7` and reads that as a July date.
Measurement done at execution time (quick-260915-g9p) found that claim false.

The fixture is `expiration: '2026-08-01'` — **August 1**, not July. The `7` came from a
**UTC-to-local timezone shift**, not from a legitimately-July date. `new Date('2026-08-01')`
parses a bare `YYYY-MM-DD` string as UTC midnight; `.toLocaleDateString()` then renders it in the
host's LOCAL timezone, and any zone west of UTC rolls that instant back to the previous calendar
day:

| TZ                  | rendered   |
| ------------------- | ---------- |
| UTC                 | 8/1/2026   |
| Europe/Berlin       | 8/1/2026   |
| Asia/Tokyo          | 8/1/2026   |
| America/New_York    | 7/31/2026  |
| America/Los_Angeles | 7/31/2026  |

So the todo's own title is itself zone-dependent: "the expiry date supplies the `7`" is only true
in western-hemisphere zones. In UTC or anything east of it, the rendered date never contains a
`7` at all, and the previously-bare single-digit assertion would have passed regardless of
whether a real leak existed — the flaw this todo names was present on both sides of that boundary.

This means "freeze the date" (this todo's direction, item 3) was **necessary but not sufficient**.
The fixture date was already a frozen literal — the test never read today's date — and a frozen
bare date still renders differently per host zone. Pinning the fixture to a non-colliding month
would have re-armed the identical trap for whichever month collides next in whichever zone runs
the suite.

The fix (quick-260915-g9p) closes the timezone axis directly: the test's expected value is now
rendered by the exact same `new Date(iso).toLocaleDateString()` call used by the code under test,
in the same process, so both sides shift together under any host timezone. No `TZ` environment
variable is pinned anywhere — see the design rationale recorded in that plan's D-1. Distinctive
sentinel tokens (`ZZ-LEAK-SENTINEL-REVEALED-ZZ` / `ZZ-LEAK-SENTINEL-KEYINDEX-ZZ`) replace the bare
single-digit substring check named in this todo's Direction section, and each was observed failing
for the right reason under a temporary, reverted injection into `buildDigestCopy`.

## Duplicate capture — this todo was resurrected after it was closed (quick-260919-8nr, 2026-09-19)

**A second copy of this file reappeared in `pending/` a day after it was closed, and sat there for
four days.** It was actioned again on 2026-09-19 as though it were open work.

The mechanism, measured:

| commit      | author date               | commit date               | effect                                    |
| ----------- | ------------------------- | ------------------------- | ----------------------------------------- |
| `fa2ad5030` | 2026-09-15 06:34:55 -0700 | 2026-09-15 06:34:55 -0700 | filed this todo in `pending/`              |
| `6652c5519` | 2026-09-15 12:17:13 -0700 | 2026-09-15 12:17:13 -0700 | closed it, moved it to `completed/`        |
| `ab8709ff1` | 2026-09-15 06:34:55 -0700 | 2026-09-16 14:57:01 +1200 | **re-added the `pending/` path**           |

`ab8709ff1` carries the *same author date and the same commit message* as `fa2ad5030` but a commit
date a day later in a different timezone, and `git merge-base --is-ancestor 6652c5519 ab8709ff1`
returns false — it is a **replay of the original filing commit from a line that had not seen the
close**. The rebase/cherry-pick preserved the author date, so the duplicate looked older than the
close and sorted as if it had always been there.

**Why the `git log` reads confusingly:** `--follow` on the `pending/` path lists `ab8709ff1` first
and `fa2ad5030` last with identical subjects, which looks like one filing commit reported twice.
Only `--diff-filter=A` distinguishes them — it names `ab8709ff1` alone as the commit that added the
file now on disk.

**What was re-verified on 2026-09-19 rather than taken on this document's word.** A green run of
this test proves nothing, because self-healing to green is the exact defect this todo names — so
the prior SUMMARY's claim that the negative control was observed is a document, not a measurement.
Both arms were re-run independently: injecting `revealedKeyValue` into `buildDigestCopy` failed at
line 461 naming `ZZ-LEAK-SENTINEL-REVEALED-ZZ`; injecting `keyindex` failed at line 462 naming
`ZZ-LEAK-SENTINEL-KEYINDEX-ZZ`. Each arm failed at the assertion naming its *own* sentinel. The
source was reverted with the Edit tool (not `git checkout --`, which fires this repo's
post-checkout hook) and confirmed byte-identical to HEAD by `git diff --exit-code`; the suite
returned to 15/15. **The shipped fix is real.**

The `pending/` duplicate was deleted after `diff` proved this copy is a strict superset of it —
it differed only by the resolution frontmatter and the `Correction` section above, so no untested
sibling was discarded. The one residual concern (date correctness west of UTC) was already carried
by its own live todo, `2026-09-15-humble-expiry-dates-may-render-one-day-early-west-of-utc.md`,
which remains open.

**The generalisable trap:** a todo being in `completed/` does not mean it is absent from
`pending/`. A corpus-wide scan for files present in both directories found this was the only such
pair (1 of 26 pending files); that scan is cheap and is the check that would have caught this on
day one.
