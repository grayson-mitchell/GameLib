---
phase: 57-opt-in-known-fix-sharing-via-relay
plan: 12
subsystem: relay
tags: [relay, cloudflare-workers, d1, github-app, known-fixes, uat]
requires: [57-02, 57-08, 57-11]
provides:
  - deployed production relay at https://gamelib-fix-relay.gamelib.workers.dev
  - app pointed at the live relay, with a sentinel test against the pending URL
  - live done-when gate passed on this Mac (5/5 UAT items)
  - relay-written seed-style notes.<key> in fix files
affects: [steam known-fix reporting, public/fixes seeding]
tech-stack:
  added: []
  patterns: [workerd fetch redirect 'manual'; fixed per-key notes text with validated version and first-seen date]
key-files:
  created: [.planning/phases/57-opt-in-known-fix-sharing-via-relay/57-UAT.md]
  modified: [relay/wrangler.jsonc, relay/src, src/backend/utils/macArch.ts, PRIVACY.md]
key-decisions:
  - "Mach-O candidate selection prefers Info.plist CFBundleExecutable and keeps it first under the 8-file cap"
  - "Relay adds notes.<key> to fix files (operator-requested scope addition); never overwrites hand-written notes"
requirements-completed: [D-01, D-02, D-04, D-05, D-09, D-10, D-11]
duration: multi-session
completed: 2026-11-02
---

# Phase 57 Plan 12: Deploy relay and live done-when gate Summary

The relay is deployed to Cloudflare, the app posts to it, and a fresh 32-bit install with sharing ON opened a correct PR on the known-fixes repo while reinstall and sharing-OFF sent nothing.

## Operator infrastructure completed

- Cloudflare account and workers.dev subdomain `gamelib.workers.dev`.
- D1 databases: production `231222f4-6b99-4bfd-a0c5-a1048a8c084c`, staging `7bb3b29f-e09c-4ecf-a84e-4de3b294f50c`.
- GitHub App id 5572986, installation 177665978; secrets set via `wrangler secret put`.
- Staging worker `gamelib-fix-relay-staging` against private repo `known-fixes-staging`: verified 201 created PR, and a closed PR counted as 200.
- Production `https://gamelib-fix-relay.gamelib.workers.dev` (current version 8686a82f).

## UAT results (57-UAT.md, all pass)

Title A = 98800 (Dungeons of Dredmor), title B = 41500 (Torchlight).

1. Toggle in General with (i) on the label line, OFF by default.
2. 15:48:13 resolved appId 98800 to mac_arch '32'; `Known-fix report: sending appId 98800 macArch=32 op=add (macho, GameLib 0.8.0)`; 15:48:20 HTTP 201 (created). The 15:42 first attempt was inconclusive (deviation d).
3. PR https://github.com/grayson-mitchell/Known-Fixes/pull/1, branch report/steam-98800, single file steam/98800-steam.json = {title "Dungeons of Dredmor", macArch "32"}, 2-space indent and trailing newline, body cites GameLib 0.8.0 and the Mach-O check, "Reports received: 1". Left open. Commit 9bc5236 backfilled notes.macArch (deviation e).
4. Reinstall of 98800 with toggle ON (15:56:14): no new sending line, branch head unchanged at 4261106a5.
5. Toggle OFF, Torchlight 41500 installed 15:57:58: Mach-O 32-bit and mac_arch '32' lines present, no sending line, no report/steam-41500 branch or PR.

The UAT precondition was corrected: the real gate (`verifyMacArchGroundTruth`, steam/library.ts) skips only when `mac_arch_verified` is true or mac_arch is '32' from a non-known-fix source; `unknown`/`64` with source `minos` is library-sync metadata and does not disqualify a title.

## Deviations from Plan

**1. [Rule 1 - Bug] workerd rejects fetch `redirect: 'error'`** - Every live Steam lookup and GitHub call failed as 503 on staging because the fake-fetch tests never exercised the runtime. Switched to `'manual'` (non-2xx still treated as failure); 3xx cases added to githubFiles tests. Commit ca4d80563.

**2. [Rule 3 - Blocking] relay/src missing from tsconfig.eslint.json** - Relay files were typed-lint parsing errors, so `pnpm lint` went red. Added relay/src. Commit 7b1a39d14.

**3. [Rule 1 - Bug] Literal bidi character in a test** - The RLO test char is now spelled via `String.fromCodePoint`. Commit 001ec4ff8.

**4. [Rule 1 - Bug] Pre-existing Mach-O locator bug** - `firstBundleBinary` took `readdir()[0]`, which for Dredmor was DredmorSchema.xsd, so the check was inconclusive (no verdict, no prompt, no report). It now prefers Info.plist `CFBundleExecutable`, and `locateMachOCandidates` puts it first so the 8-file cap cannot drop it. src/backend/utils/macArch.ts. Commit c08346ded.

**5. [Scope addition, user-requested] Seed-style notes** - The relay writes `notes.<key>` from fixed per-key text, the validated version and first-seen date; it never overwrites a hand-written note or a non-object notes, and removal drops notes.macArch. Commit 5c1768a46. Deployed to staging (PR #2 verified, closed) and production; PR #1 backfilled (9bc5236 on known-fixes).

## Commits

- 001ec4ff8: test(57-05): spell the RLO test char as a code point, not a literal bidi char
- 7b1a39d14: fix(57): include relay/src in the eslint tsconfig so pnpm lint parses relay files
- ca4d80563: fix(57): use redirect 'manual' for relay fetches; workerd rejects 'error'
- 2ed7d15ef: feat(57-12): point app at deployed relay, add sentinel test, UAT gate
- c08346ded: fix(57-12): read CFBundleExecutable before the first MacOS entry in the Mach-O check
- 5c1768a46: feat(57-12): relay writes a seed-style notes.<key> into fix files

## Known unrelated issues (out of scope, not fixed)

- tsc error in src/backend/storeManagers/steam/engine/__tests__/engineSwitch.test.ts from another session's uncommitted work.
- Jest suites steamFlows, skeletonFlows and getDefaultLegendarySavePathRefresh fail identically without phase-57 changes.
- Engine-download percentage shows while the button reads "Install" during a bottle reinstall (phase 59 UI area).

## Cleanup left to operator

- Remove `known-fixes-staging` from the GitHub App installation.
- Delete `~/Downloads/gamelib-fix-relay.2026-11-01.private-key.pem` and `~/Downloads/app-pkcs8.pem`.

## Known Stubs

None.

## Self-Check: PASSED

Verified all six commit hashes resolve in git log and 57-UAT.md / 57-12-SUMMARY.md exist.
