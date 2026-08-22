---
quick_id: 260823-a4o
slug: fix-gap-cycle-4-gates-that-cannot-fail
status: complete
completed: 2026-08-23
commits: [11b5212ed]
closes: [WR-04, WR-06, WR-09, WR-10, IN-01]
---

# Five gates that could not fail

All five verified open at the sites the review named before any edit. Three sat
in `structuralContainment.test.ts`, one each in `longRunningChannels.test.ts`
and `loggerCallSiteGuard.test.ts`.

| Finding | Defect | Fix |
|---|---|---|
| WR-04 | `\|\|`-fold passed if ANY of 3 allowlist entries tripped, while claiming none were decorative | Every entry must trip; failure names which do not |
| WR-06 | Test 8's `uv_os_get_passwd` catch unreachable — the mock catches first | Dead catch deleted; Test 8b drives the mock's real fallback |
| WR-09 | Absence assertion with no presence precondition | Assert presence in raw source first |
| WR-10 | "Load-bearing" loop over a string this suite can never emit | Deleted; comment records what actually discriminates |
| IN-01 | "Anti-vacuity" check compared paths differing on every platform | Log path must not be under the pre-mock real home |

## WR-09 caught a live defect on its first run — ours

The fixture phrase was deleted from `main.rs` by `a6223baf1`, the round-1 IN-03
doc-comment correction made earlier the same day. The self-test had been passing
for the wrong reason ever since, and nothing went red. Second instance this
session of a code-read outliving its own fix.

## RED-proofs (run against real code)

- Removing the `os` mock's fallback fails **Test 8b only**; old Test 8 stays
  green — direct evidence its deleted `catch` never covered that path.
- Removing the production `logError` call-site `.catch` fails Tests A and B
  while the `logInfo` counterparts stay green.
- WR-04 and IN-01 got **permanent** self-tests, not one-off checks.

One process note: the first WR-10 RED attempt silently no-op'd — the target
literal occurs twice (logError and logInfo) — and the count assertion caught it.
A bare replace would have reported a green run as proof.

## Verification

Backend 175/175 suites, 4024 passed. tsc clean, eslint 0 errors, prettier clean,
6/6 planning gates. Temp-dir delta +1 (WR-01 fix holding).
