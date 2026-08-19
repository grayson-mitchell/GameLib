---
created: 2026-08-19T13:10:00.000Z
title: "A native install that fails at plan-build still writes a StateFlags=1026 stub manifest — with buildid 0 and NO InstalledDepots — which can clobber a complete install's manifest"
area: steam-depot
needs: code-fix
status: OPEN
severity: major
surfaced_by: "Phase 23.2 prep — the KCD2 plan-build selection census, 2026-08-19"
files:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/manifest.ts
  - src/backend/storeManagers/steam/games.ts
related:
  - .planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md  # asserts the OPPOSITE — see "Contradiction" below
---

## Symptom

A native depot install that **fails during plan-build and downloads zero bytes** still writes an
`appmanifest_<appId>.acf`. The written manifest is a stub:

```
StateFlags       "1026"      # verify/repair me
buildid          "0"
SizeOnDisk       "96422090071"
InstalledDepots  <ABSENT ENTIRELY>
```

402 bytes, versus the 989-byte real manifest it replaced.

**Why that is dangerous:** `StateFlags 1026` with **no `InstalledDepots`** tells Steam the app needs an
update/verify and that nothing is installed. If a complete install already existed at that path, its
manifest is replaced by this stub, and the next Steam start will treat a fully-installed game as needing
a full verify — or a re-download.

## Observed, 2026-08-19 (real hardware)

KCD2 (appId 1771300) is installed in the `GameLibSteam` CrossOver bottle at **90 G**. Its manifest was
temporarily moved aside so GameLib would offer Install (this was deliberate, to capture a plan-build
depot-selection census). GameLib's install then aborted exactly as expected:

```
The installation of Kingdom Come: Deliverance II failed: This depot appears to be blocked for your
account or region right now. ... (couldn't get decryption key for depot 1771304 (app 1771300): Blocked)
```

Zero bytes downloaded; no `steamapps/downloading/1771300` directory was created. **And yet a
`appmanifest_1771300.acf` was present afterwards** — the stub above. The original was restored by hand
and verified byte-identical to a pre-taken backup (`StateFlags 4`, `buildid 23914554`, `InstalledDepots`
1771302/1771303/1771306). Evidence copy of the stub:
`scratchpad/kcd2-gamelib-failed-install-stub.acf` (session-local; re-derivable by repeating the above).

**Note the blast radius is not limited to this contrived setup.** The manifest was hidden here on
purpose, but the same write happens on any plan-build failure — including the ordinary case of a user
retrying an install over an existing one, or any title where GameLib's install-state view disagrees with
what is on disk.

## Contradiction this creates — one of two records is wrong

1. `.planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md` states plainly: *"the `.acf`
   is only written on a successful completion"*, and builds its whole argument on partial residue being
   invisible to the reconciler **because no manifest exists**.
2. `23-UAT.md` Gate 2 Attempt 1 (2026-07-21) records the **same failure mode on the same title** as
   *"install failed during plan-build, before any `.acf` was written"*.

Today's run contradicts both. Three candidate explanations, none yet established:

- **Behaviour changed** between 2026-07-21 and now (several depot/finalize changes landed in between).
- **The two failure modes differ** — a mid-download abort may write nothing while a plan-build key
  failure writes a stub through a different path. If so, both records are right about their own case and
  wrong as generalisations.
- **The 2026-07-21 negative was checked in the wrong directory.** KCD2 is a Windows title and lives in
  the CrossOver bottle's `steamapps`, not the macOS Steam `steamapps`. A check run against the macOS
  library would correctly find nothing and wrongly conclude "no manifest was written". This is the
  cheapest to confirm and the most likely.

Resolve which, and correct whichever record is wrong — a stale "no manifest is ever written" belief is
load-bearing for the reconciler argument in the related todo.

## Lead worth following first — the size field is already correct

The stub's `SizeOnDisk` is **96,422,090,071**. That is exactly the sum of the four selected depots
**minus the blocked one**:

```
1771302   199,419,496
1771303  82,572,274,727
1771304     735,856,088   <- blocked, excluded
1771306  13,650,395,848
         --------------
total    97,157,946,159
- 1771304                 = 96,422,090,071   == stub SizeOnDisk
                                             == official Steam client's SizeOnDisk for its
                                                complete 3-depot install
```

So GameLib's failure path **already computes a completion size that correctly excludes the depot it
could not fetch**, and that figure agrees byte-for-byte with what the official client reports for a
genuinely complete install. Two consequences:

- Independent corroboration that depot 1771304 is genuinely not part of a complete KCD2 install
  (see G-23-01 / Phase 23.2).
- The size accounting needed for **skip-and-warn** may already exist. Establish where this number is
  computed before designing Phase 23.2's policy — the fix may be far smaller than it looks.

## Fix direction (not prescriptive)

A run that downloaded nothing should write nothing. At minimum, do not replace an existing manifest with
a stub that has no `InstalledDepots` — either write no manifest on a pre-download failure, or preserve
the prior manifest when the new one would be strictly less informative. Whatever is chosen must not
regress the Phase 21 `1026` verify-handoff, which legitimately writes `1026` on paths that DID download.

## Guard against a vacuous test

A test that asserts "no manifest after a failed install" must be run against the **bottle** path for a
Windows title as well as the macOS path — checking only the macOS `steamapps` is very likely how this
went unnoticed for a month (see explanation 3 above). Assert on the manifest's *content*
(`InstalledDepots` present, `buildid` non-zero) rather than merely on file presence: presence checks are
what let the clobber look like a successful restore during this session.
