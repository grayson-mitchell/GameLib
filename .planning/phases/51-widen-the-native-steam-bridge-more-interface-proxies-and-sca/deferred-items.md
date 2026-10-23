# Deferred Items

Pre-existing/out-of-scope findings noticed during plan execution, logged per the
deviation-rules scope boundary (fix only what the current task's changes directly cause).

## 51-07: `node meta/findDeadcode.cjs` reports 20 new `used-in-module` findings

Run at close-out of 51-07 (after Task 2's GREEN commit): 20 new `used-in-module` exports not
in `meta/deadcode-baseline-used-in-module.txt`, across `meta/buildSteamBridgeShims.ts`,
`meta/downloadZig.ts`, `src/backend/storeManagers/steam/bridge/bridgeConfig.ts`,
`importParse.ts`, `interfaceVersions.ts`, and `shimCoverage.ts`.

None of these files are in 51-07's `files_modified` (`bridgeRoute.ts`, `shimGenerate.ts`,
their tests, `paths.ts`) — they land from earlier same-wave plans (51-01 through 51-06,
merged just before 51-07 per the dispatch note). Out of scope for this plan; not fixed here.
Surfacing so a later plan (or a dedicated `find-deadcode` sweep) picks it up.

## 51-10: three pre-existing test suite failures, confirmed unrelated via `git stash`

Running `pnpm jest meta/__tests__ src/backend/storeManagers/steam` at Task 2 close-out
surfaced 3 failing suites: `meta/__tests__/findDeadcode.test.ts` (same baseline drift as the
51-07 entry above, now also naming `meta/buildSteamBridgeShims.ts`'s pre-existing exports),
`meta/__tests__/hardcodedStringGate.test.ts` (6 hardcoded-string violations in
`src/frontend/screens/Game/GamePage/components/GameStatus.tsx`, a file 51-10 never touches),
and `meta/__tests__/genI18nGateScope.test.ts`.

Confirmed pre-existing and unrelated to 51-10: `git stash` (reverting every 51-10 working-tree
change back to the Task 1 commit) reproduces the identical 3-suite failure
(`Test Suites: 3 failed, 3 total`). None of the three touch `gen_vtables.ts`, `bridge_helper.c`,
`buildSteamBridgeShims.ts`'s own exports (beyond the pre-existing ones already named above),
`protocol.ts`, or either steam bridge test file 51-10 modifies. Not fixed here, per the
deviation-rules scope boundary.

## 51-11: `pnpm lint` tests-scope ceiling already exceeded BEFORE this plan (648 vs 638)

`pnpm lint` fails with "ESLint found too many warnings (maximum: 638)" in the tests scope
(648 actual) both with and without this plan's changes. Measured directly via an isolated
`git worktree add /tmp/gamelib-baseline-check 79ed9eb55 --detach` (the commit immediately
before this plan's Task 2 RED commit, i.e. right after 51-10 landed) and running `pnpm lint`
there: **648 problems (0 errors, 648 warnings)** -- the IDENTICAL count measured in the main
tree with every 51-11 change applied. This plan's own new/modified test files
(`extractProtonInventory.test.ts`, `shimCoverage.test.ts`, `shimGenerate.test.ts`,
`gen_vtables.test.ts`) contribute zero warnings of their own (confirmed by grepping the lint
output for each file's name -- none appear). The one genuine lint ERROR this plan did
introduce (a `require()`-style import in `extractProtonInventory.test.ts`'s
`resolveOrdinal` test) was fixed in place (Rule 1) before this entry was written; it is not
part of the pre-existing count above. The 10-over ceiling breach itself predates 51-11
entirely and is not fixed here, per the deviation-rules scope boundary -- a dedicated lint
cleanup pass (or a `lint:tests` baseline re-pin) is the right fix, not a change bundled into
this plan's own task scope.

## 51-11: same three pre-existing failures, re-confirmed via the same `git stash` technique

`pnpm jest meta` at Task 3 close-out reproduced the identical 3-suite failure
(`findDeadcode.test.ts`, `hardcodedStringGate.test.ts` -- same 6 `GameStatus.tsx` violations,
`genI18nGateScope.test.ts`). `git stash --include-untracked` back to 51-11's own Task 2 commit
reproduces the SAME 3 failures byte-for-byte (`Test Suites: 3 failed, 3 total`, `202 passed`
baseline), confirming none of them are caused by this plan's extractor, manifests, generator
out-value extension, or shimCoverage widening. `findDeadcode.test.ts`'s baseline drift will
grow again with this plan's new `meta/extractProtonInventory.ts` exports (not individually
re-measured this run) -- the 51-07 entry's "a later plan (or a dedicated `find-deadcode`
sweep) picks it up" recommendation still stands and now covers one more plan's worth of
exports. Not fixed here, per the deviation-rules scope boundary.

## 51-14: pre-existing sret param-stripping bug in `isteamfriends*.manifest.json` (not regenerated)

`extractProtonInventory.ts`'s `parseProtonThunks` stripped the sret hidden-return-pointer
(`_ret`) from the WRONG end of the real-params list -- it assumed `_ret` was always the
LAST stack param, but Proton's actual MSVC thiscall-sret convention places it FIRST (right
after `this`). This was discovered this plan when `SteamMatchMaking009`'s `GetLobbyOwner`/
`GetLobbyByIndex`/`GetLobbyMemberByIndex` exposed it (methods with a real arg AFTER the
hidden pointer) and fixed in `extractProtonInventory.ts` (commit in this plan's Task 1).

The already-committed `meta/sdk/isteamfriends.manifest.json`, `isteamfriends011.manifest.json`,
and `isteamfriends013.manifest.json` (51-11) have the SAME bug baked into their `methods[]`
arrays for every `GetXByIndex`-shaped sret method (`GetFriendByIndex`, `GetClanByIndex`,
`GetFriendFromSourceByIndex`, `GetClanOwner`, `GetClanOfficerByIndex`, `GetCoplayFriend`,
`GetChatMemberByIndex`) -- their `params[]` lists wrongly keep the synthetic `_ret` entry
and drop a real trailing arg. This is **documentary-only**: `gen_vtables.ts`'s stub
generation (`emitStubBody`) derives its dummy param list purely from `method.stackBytes`,
never from `params[]` by name, so the compiled shim is unaffected either way. Not regenerated
in this plan, per the deviation-rules scope boundary -- these three files are outside this
plan's `files_modified`, and re-running the extractor against them is an unrelated diff. A
future plan touching `ISteamFriends` (or a dedicated extractor-output refresh) should
regenerate them.

## 51-23: review WR-06 deferred

Helper child handles are not `unref()`'d (`src/backend/storeManagers/steam/helperProcess.ts:245-255,295-324`). A leaked helper therefore keeps the sidecar's event loop alive past stdin EOF, and is orphaned when the shell SIGKILLs the sidecar (sidecar exit contract). The review's proposed fix: `child.unref()` plus unref of the stdout/stderr streams, and a stdin-EOF path that calls `shutdownAllBridgeHelpers`. Deferred from this gap round, not dropped, so the phase close sees it.

## 51-27

- `pnpm planning-gates`: preload-surface-gate.py (phase 34.5) fails on channels getSteamBridgeRoute and setSteamBridgeUserRoute missing from IPC-PORT-INVENTORY.md. Pre-existing, unrelated to 51-27 (todo-frontmatter gate passes).
