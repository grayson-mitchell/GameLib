---
quick_id: 260822-tpn
slug: knownfixes-path-containment-and-docstring
completed: 2026-08-22
status: complete
findings_closed: [34.2 round-1 WR-06, 34.2 round-1 WR-03]
files_modified:
  - src/backend/knownFixes.ts
  - src/backend/__tests__/knownFixes.test.ts
  - .planning/phases/34.2-.../34.2-REVIEW-FIX.md
---

# Quick 260822-tpn — SUMMARY

Closed round-1 **WR-06** (path traversal) and **WR-03** (false docstring), both in
`src/backend/knownFixes.ts`.

## WR-06 — path traversal

`readKnownFixes` built its path with `join(fixesPath, `${appName}-...`)` where `appName` is a free
string from the renderer (`getKnownFixes` channel). `join` normalises `..` rather than rejecting
it, so a traversing appName escaped `fixesPath` and the function `readFileSync`'d and
`JSON.parse`'d whatever it landed on — an arbitrary-file read primitive, bounded only by the value
having to parse as JSON.

Fixed with the project's own `resolve`+`relative` idiom, copied in shape from
`sidecar/fileStore.ts:121-133` (which carries the note *"Phase 18's lesson applies: `path.join` is
not containment"*), including its `startsWith('..') || isAbsolute || === ''` triple.

**Returns `null` + `logWarning` rather than throwing**, deliberately diverging from `fileStore`.
Every existing failure mode of this function (absent file, malformed JSON) yields `null`, and all
three call sites rely on it — `launcher.ts:985` is `if (!knownFixes) return`, `launcher.ts:1022`
is `knownFixes?.envVariables`. Throwing would have changed the contract under callers that were
verified not to expect it.

`runner` needed no guard: closed `Runner` union, indexed through `storeMap`.

## WR-03 — false docstring

The docstring claimed `launcher.ts` "is deliberately excluded from the Node sidecar's import
graph". False, and phase 34.2 is what made it false. Replaced with the true, narrower invariant
(this module avoids a *direct* import) and the real chain named inline —
`gameDetailsFlowRegistration.ts` -> `dispatch.ts` -> `storeManagers/index.ts` ->
`gog/library.ts:51` -> `launcher` — so the next reader can re-check it rather than trust it. The
accurate, load-bearing parts (bundle-size rationale, the MUST-NOT-import-electron rule) were kept.
Same correction shape plan 34.2-11 applied to WR-02.

## Verification

| Check | Result |
|-------|--------|
| RED proof, pre-fix | 2 traversal tests FAIL against unfixed code |
| Anti-vacuity | passes pre-fix and post-fix — guard does not reject ordinary input |
| knownFixes suite | 8/8 |
| Full backend suite | 170/170 suites, 3927 passed, 2 skipped, **0 failed** |
| `npx tsc --noEmit` | clean |
| eslint (severity 2) | 0 |
| `prettier --check` on both touched files | clean |

**One test was rewritten mid-task.** The first "absolute-path appName" case PASSED against the
unfixed code — it returned `null` because the escape target did not exist, not because of
containment. That is a vacuous test that would have shipped looking like coverage. Replaced with a
deeper-traversal case that **creates the escape target first**, so `null` can only come from the
guard. Both traversal cases then failed pre-fix, as a containment test must.

Also removed a now-unused `join` import that would otherwise have become a lint error — caught
before running lint, not by it.

## Not done

The other 7 open round-1 findings. WR-05 and WR-07 are deliberate design decisions that want
reclassifying rather than fixing; WR-10, IN-01, IN-02, IN-03, IN-04 are cosmetic or need a
judgment call on intent. `34.2-REVIEW-FIX.md` is updated to 10 closed / 7 open, counts re-gated
mechanically, status stays `partial`.
