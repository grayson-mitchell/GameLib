---
created: 2026-09-12
title: "Live-gate scripts that run the compiled sidecar directly need fake-HOME isolation by default"
area: sidecar / live-gate methodology
severity: medium
platform: any
ready: code
status: pending
source: quick-260912-e6k (fix sidecar uncaughtException guard EPIPE self-feed), Task 3 live gate
files:
  - src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts
resolves_phase: null
---

# Live-gate scripts that run the compiled sidecar directly need fake-HOME isolation by default

## What was observed

During quick-260912-e6k's Task 3 live gate, an early diagnostic run of the raw pre-fix SEA
sidecar binary — launched directly, without overriding `HOME`/`XDG_STATE_HOME`/`LOCALAPPDATA` —
captured real local GOG session data into a scratchpad log file: a `gogConfigStore` entry
containing what appear to be genuine `userId`/`username`/`galaxyUserId` values, read from the
operator's actual local config on this machine. The file was deleted immediately and never
committed anywhere, but the exposure happened because nothing about running the compiled binary
directly enforces the isolation `spawnCapture()` (in `lzmaNativeSeaRealBuild.test.ts`) already
applies by convention: it always sets a fake `HOME` before spawning.

That convention only protects callers that go through `spawnCapture()`. A one-off shell
invocation of the binary — exactly the kind a live gate needs — has no such guard and will
happily read (and potentially echo into logs) the operator's real config.

## Why this matters

This is a live-gate-specific hazard, not a shipping-code defect: the binary reading its own real
local config when given a real `HOME` is correct behaviour for an actual app run. The risk is
purely in how *investigators* invoke it outside the app (scratchpad scripts, ad-hoc terminal
commands, future live-gates) without thinking to isolate `HOME` first.

## Suggested next step

1. Decide whether this deserves a standing convention/checklist item (e.g. in a live-gate
   methodology doc or CLAUDE.md) that any direct invocation of a compiled sidecar binary MUST set
   `HOME`/`XDG_STATE_HOME`/`LOCALAPPDATA` to a disposable directory first — the same discipline
   `spawnCapture()` already has, generalized to ad-hoc scripts.
2. Consider whether a small reusable scratchpad helper (a one-line wrapper that creates a fake
   HOME dir and exports the three env vars) is worth keeping around for future live-gates, rather
   than re-deriving it each time.
3. No code change is required in shipping code — this is a process/methodology gap, not a bug.

## 2026-09-13 update (quick-260913-901) — the hazard RECURRED, and its opposite was measured

Quick `260913-901` (fix `pnpm smoke:sidecar`) ran the compiled sidecar directly many times and
produced hard evidence on both sides of this decision. It does not settle the todo — it sharpens
what the decision actually is.

### A. The hazard recurred, and a WRITTEN mitigation did not prevent it

901's plan carried an explicit threat-model entry (T-901-01): from the one permitted real-`HOME`
diagnostic, extract only the `libuv`/`javascriptStack`/`nativeStack` sections **and delete the raw
report**. At the end of the task the raw reports were still on disk — `real-hang.json` (49 KB) and
`coldfake-hang.json` (53 KB) — and a Node diagnostic report embeds `environmentVariables`,
`commandLine` and `cwd` verbatim (confirmed by grep: one occurrence of each). Alongside them,
`real.out` held the live `gogConfigStore`/`userData` frame carrying the operator's GOG username and
userId, exactly as this todo's original observation describes.

Nothing leaked into a commit — `FINDING.md` redacts the values deliberately and says so — but the
raw captures persisted until they were deleted by hand on 2026-09-13.

**The lesson for "Suggested next step" item 2: a helper that only exports env vars solves the
smaller half.** The isolation was specified, agreed, and still the unredacted artefacts survived.
Cleanup and redaction have to be owned by the harness (a trap/`finally` that shreds raw reports and
`*.out` captures), not by the investigator remembering at the end of a long task.

### B. The counter-finding: fake-`HOME` isolation HID a real, CI-blocking defect

This is the part that changes the shape of the decision. The defect 901 fixed — an un-`unref()`-ed
5-minute `setInterval` armed by `setPresence()` at `gog/presence.ts:39` — is created only behind
`GOGUser.isLoggedIn()`. Measured the same day, same tree, same command:

| env | outcome |
| --- | --- |
| real `HOME` | **never exits** — no exit at 120s, reproduced twice |
| cold empty fake `HOME`, 1st run | exit 0 in 27.7s |
| same fake `HOME`, 2nd run | exit 0 in 1.0s |

Under an empty fake `HOME`, `isLoggedIn()` is false, the interval is never armed, and the process
exits cleanly. **A live gate isolated by default would have been permanently, confidently green
against a defect that blocked every PR to `main`/`stable` and that leaves a real user's sidecar
unable to die when the shell quits** (the same orphan mechanism as the standing
`tauri-dev-shell-does-not-reap-its-node-sidecar` finding).

So the question this todo poses — "isolate by default: yes or no?" — has no safe single answer.
What the evidence supports is a **two-profile discipline**:

- **isolated by default**, for every run whose purpose is not profile-dependent; and
- a **named, deliberate real-profile arm** for defects that can only arm under a populated profile,
  with redaction and shredding owned by the harness rather than by the operator's memory.

A convention that says only "always fake the HOME" would buy safety by making a whole class of
real-profile-only defects structurally invisible — which is the same failure mode as a gate that
cannot see the crash it was built for.

### C. Bounded good news on Keychain

macOS Keychain is **not** isolated by `HOME`, so a fake-`HOME` run can in principle still pull real
secrets. Measured across both fake-`HOME` trees 901 used: `"username"`, `"userId"`, `accessToken`,
`refresh_token` and `@gmail` all returned **0 occurrences**. Isolation did hold here. Do not
generalise it to flows that read Keychain directly — this was measured for the sidecar boot path
only.

### D. The env set that actually worked

Wider than the three this todo names. 901 used all of: `HOME`, `XDG_STATE_HOME`, `XDG_CONFIG_HOME`,
`XDG_DATA_HOME`, `LOCALAPPDATA`, `APPDATA`. Any wrapper should set the full set.

### E. Cost, if a helper makes a fresh profile per invocation

A **cold** fake profile is not free: ~51 MB on disk and ~27 s of wall time per fresh `HOME`, because
a cold boot does real network work. A warm reuse of the same directory ran in ~1.0 s. A helper that
mints a new disposable `HOME` every call will make cold-boot cost the default — which matters, since
a separate filed defect records that a cold boot already consumes ~26 s of the smoke gate's 30 s
budget.

### Triage note

Superseded — see "Decisions taken" below. Severity is now `medium` and `ready` is now `code`.

## 2026-09-13 — DECISIONS TAKEN (operator, in session)

All four open questions were ruled on directly by the operator. **This todo is no longer a
decision; it is a specification.** `ready:` moved `human` -> `code` because everything below is desk
work: no live gate, no second machine. `severity:` moved `minor` -> `medium` because "latent trap
with no live consequence" is now false — the consequence has been realised twice (real GOG session
data written to disk in `260912-e6k`, again in `260913-901`), against a named and bounded
population, with "do it by hand" as the existing workaround.

### Facts established while deciding (none of these were in the todo before)

- **The repo already implements this discipline once, for jest, and it stops at the jest boundary.**
  `src/backend/jest.setupContainment.ts` redirects **eight** variables — `HOME`, `USERPROFILE`,
  `APPDATA`, `LOCALAPPDATA`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`
  — into an `mkdtempSync` root, and `testContainment.test.ts` enforces it. It also records a
  measured finding that `mkdtemp`'s `0700` is the real security control, because umask can only
  ever remove bits.
- **It cannot be reused as-is.** It exports only `{ containmentRoot, realHomeAtSetup }` and is wired
  as a jest `setupFiles` entry; it mutates its OWN process env, so it cannot build a child-process
  env for a spawned binary.
- **Three hand-rolled spawn blocks exist, each narrower than the standard one directory away:**
  `lzmaNativeSeaRealBuild.test.ts:209` and `:297`, and `decompressWorkerRealBuild.test.ts:115`.
  Each sets roughly `HOME`/`XDG_STATE_HOME`/`LOCALAPPDATA` — missing five of the eight. So these
  sites are not merely unconventioned, they are **measurably leakier than the jest containment
  beside them**. That is a defect, not a style gap.
- Those two jest sites DO already clean up correctly (`mkdtempSync` + `afterAll(rmSync recursive
  force)`). The hygiene gap is not there — it is in ad-hoc scratchpad runs, which is exactly where
  `260913-901` left 103 MB and two unredacted diagnostic reports sitting until deleted by hand.
- **`meta/` holds three more sidecar-spawning scripts:** `buildSidecarSea.ts`,
  `captureShellScrollback.ts`, and `sidecarStartupSmoke.cjs`. The smoke gate calls
  `spawnSync(process.execPath, [BUNDLE], { cwd, encoding, timeout })` with **no `env` key**, so it
  inherits the operator's real environment on every run.
- The two RealBuild suites are ACTIVE (un-skipped 2026-09-12), so any cost the helper imposes is
  paid on every normal test run.

### D1 — the convention exists, and lives in CLAUDE.md

Written under the existing `## Conventions` heading as a sibling to the todo-triage rule, and
**derived from `jest.setupContainment.ts` rather than written fresh**. `.planning/spikes/CONVENTIONS.md`
was rejected as the host: it is scoped to spikes (Stack/Structure/Patterns/Tools).

The convention is NOT "always fake the HOME". It is the **two-profile rule**: isolated by default,
plus a named deliberate real-profile arm for defects that can only arm under a populated profile.

### D2 — enforce what is enforceable, and say so about the rest

Gate the in-repo spawn sites (a test can assert no in-repo file spawns the compiled sidecar/SEA
binary with a hand-rolled env). Write the ad-hoc/scratchpad half as a stated rule whose own text
**admits it rests on discipline, not enforcement**. Rejected: extending the gate to cover ad-hoc
shell invocations — nothing can observe a command typed into a scratchpad, and a gate that appeared
to cover it would be the green-check-proving-nothing pattern this project keeps stamping out.

### D3 — the helper, and the exemption that is its real content

Helper lives in `src/backend/testUtils/`. It owns exactly three things:

1. the full **eight-variable** env block (per `jest.setupContainment.ts`, not the three this todo
   originally named, and not the six `260913-901` used);
2. an `mkdtemp` `0700` root;
3. a disposing handle that shreds the profile **and any captures** on the way out.

Mandatory for: `lzmaNativeSeaRealBuild.test.ts` (both sites), `decompressWorkerRealBuild.test.ts`,
and `captureShellScrollback.ts`. `buildSidecarSea.ts` to be decided on inspection.

**`meta/sidecarStartupSmoke.cjs` is EXPLICITLY EXEMPT, and the reason must be written into its
header.** It has to see a real profile, because that is the only way it catches profile-dependent
hangs. Had it been isolated by default, it would have been permanently green against the defect
`260913-901` fixed — a `major` defect that blocked every PR. **The exemption, not the helper, is the
valuable part of this work.** The helper is about twenty lines; the thing worth writing down is why
one site must not use it.

### D4 — fresh profile per invocation, always

No reuse-for-speed. The framing that reuse buys speed was **wrong**: the cold cost is not caused by
freshness, it is caused by the boot doing real network work into an empty profile (see the sibling
todo on ~25 pooled keep-alive TLS sockets for ~26s). Reuse does not make that work cheaper, it just
caches the symptom. If a call site is too slow, the lever is pinning that run offline or stubbing
the network — never recycling a profile, because a reused profile is a different experiment that
carries state capable of masking a defect.

Reuse is permitted only as an explicitly-named opt-in for a test whose *purpose* is warm-path
behaviour, justified at the call site.

**Honest limit on the cost numbers:** the 27.7s cold / 1.0s warm / ~51 MB figures were measured
against `build/main/sidecar.js`, **NOT** against the SEA binaries the two suites actually spawn.
The cold-vs-warm delta for those suites is UNMEASURED. `d1` was chosen on correctness grounds
(a passing test means what it says), not because the cost was shown to be acceptable — if the
implementation finds it painful, measure it rather than reaching for reuse.

### What implementation now owes

1. `CLAUDE.md` `## Conventions` — the two-profile rule, with the unenforceable half labelled as such.
2. The helper in `src/backend/testUtils/`, with the eight-var block, `mkdtemp 0700`, and disposal.
3. Convert the three hand-rolled sites (this fixes the five-missing-vars leak on its own merits).
4. `captureShellScrollback.ts` converted; `buildSidecarSea.ts` inspected and decided.
5. The exemption comment in `meta/sidecarStartupSmoke.cjs`, stating why isolation would break it.
6. A gate asserting no in-repo file spawns the compiled binary with a hand-rolled env.
