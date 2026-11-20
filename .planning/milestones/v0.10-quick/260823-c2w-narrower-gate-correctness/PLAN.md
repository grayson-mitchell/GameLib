---
quick_id: 260823-c2w
slug: narrower-gate-correctness
created: 2026-08-23
status: complete
---

# Fix 34.2 gap-cycle-4 WR-02, IN-02, IN-08 — narrower gate correctness

The last three open findings of gap cycle 4. Each is a gate or guard whose scope
is wrong: too permissive (IN-02), too narrow while claiming otherwise (IN-08a),
or absent where its sibling has it (WR-02).

## WR-02 — the predictable-`/tmp`-path pattern survives in two files

`loggerFlows.test.ts` and `testContainment.test.ts` both derive their containment
root as `join(os.tmpdir(), 'gamelib-…-test-home-' + process.pid)` — predictable,
created implicitly by `mkdir(recursive)` with default permissions, no atomicity.
`loggerFlows.test.ts` drives the real `bootstrap.init()` and writes a real
`gamelib.log` there. Cycle 3's WR-07 closed this vector in
`jest.setupContainment.ts` and nowhere else.

**Fix:** one `mock`-prefixed `mkdtempSync` root per file, read by all three mock
factories. Collapses three duplicated literals into one source of truth.

## IN-02 — the `node:os` allowlist matches by basename

`NODE_OS_GATE_EXEMPT_FILES.includes(basename(filePath))` exempts any file
anywhere under `src/backend` sharing one of three names.

**Fix:** hold backend-relative paths, match with `relative(backendRoot, filePath)`.

## IN-08 — Block E is depth-1, and flags trailing comments

(a) The comment claims the gate "converts that assumption into an enforced
invariant"; it inspects direct import specifiers only.

(b) `const x = 1 // import a from 'backend/logger'` is reported as a violation.
Measured today. The review's remedy is wrong — CR-01's shared stripper has
landed and deliberately does not strip trailing comments.

## Gates

- RED proof for each; self-tests must fail against the unfixed predicate.
- Concurrent session's working-tree entries unchanged after every commit.
