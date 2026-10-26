# Quick 261026-ous: Lift Hoard (63000) from bridge knownBad

Removed the Hoard `does-not-run` entry from `bridge-allowlist.json` knownBad (now [200510, 411300]); the 261026-ng9 known-fix profile made it run.

- Commit: 90ebe6db7
- Module doc in allowlist.ts updated; allowlist.test.ts real-bundle assertions flipped, with a positive `knownBadReason('63000') === null` test citing 261026-ng9.
- bridgeCensus.test.ts: three Hoard does-not-run fixtures relabelled to ELEX 411300; the first fixture's exe arch changed to x64 and still passes.
- Gates: allowlist 32/32, census 106/106, steam suites + known-fixes + route-notice 71 suites / 2756 tests passing, both tsc clean, prettier clean, graphify updated.
- Deviations: none. Hoard not added to seed.

## Self-Check: PASSED
