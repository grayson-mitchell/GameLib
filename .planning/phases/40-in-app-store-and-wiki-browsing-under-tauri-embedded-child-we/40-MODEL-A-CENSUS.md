# Phase 40 Plan 01 — Model A Census

Predicate-derived census of every Model A (renderer-owned Electron `<webview>`) site remaining in
the tree, taken against the live tree rather than copied from the ROADMAP's list. Re-run the
commands in "Reproducing command" to verify these counts have not drifted before trusting them.

**Tree state measured against:** `cd81174e8` (`git rev-parse --short HEAD`)

## Reproducing command

```bash
cd /Users/graysonmitchell/Projects/GameLib
echo "=== <webview ==="
grep -rn '<webview' src/
echo "=== WebviewTag ==="
grep -rn 'WebviewTag' src/
echo "=== DidFailLoadEvent ==="
grep -rn 'DidFailLoadEvent' src/
echo "=== webviewPreloadPath ==="
grep -rn 'webviewPreloadPath\|getWebviewPreloadPath' src/
# Negative predicate — proves the ROADMAP's Sidebar/index.tsx line is stale:
find src -path "*Sidebar/index.tsx"
test -f src/frontend/components/UI/Sidebar/index.tsx && echo EXISTS || echo MISSING
```

## Bucket legend

- **(a) LIVE RENDER OR EFFECT** — deleted by this plan (Task 2)
- **(b) TYPE SHIM AND ITS PIN** — `src/backend/platform/types.ts`, `index.ts`,
  `__tests__/types.usage.test.ts` — OUT OF SCOPE, owned by plan `40-03`
- **(c) BACKEND DECLARED-EMPTY RETURN** — `appShellFlowRegistration.ts:262-266` and its test —
  KEEP, this is the fact that makes the census correct, not Model A itself
- **(d) COMMENT-ONLY MENTIONS** — prose describing the retired flow; none are code

## Predicate 1: `<webview` (literal token)

| File:Line | Verdict | Bucket | Note |
|---|---|---|---|
| `src/frontend/screens/WebView/index.tsx:226-227` | KEEP-COMMENT-ONLY | (d) | Comment inside the `/loginweb/nile` no-op effect explaining why the old `<webview>`-fed Amazon flow no longer exists. Historical rationale, not code; not in Task 2's deletion list. |
| `src/frontend/screens/WebView/index.tsx:541` | DELETE | (a) | The live `<webview>` render inside the branch Task 2 deletes wholesale. |
| `src/frontend/screens/WebView/components/HumbleLoginSurface.tsx:29` | DELETE | (a) | Module doc comment describing a render order ending in `<webview>` — Task 2 rewrites this doc comment per its own instruction. |
| `src/frontend/screens/WebView/components/HumbleLoginSurface.tsx:186` | DELETE | (a) | The live `<webview>` render — Task 2 target. |
| `src/frontend/screens/WebView/useTauriOAuthLogin.ts:21` | KEEP-COMMENT-ONLY | (d) | Historical rationale comment; file not in this plan's `files_modified`. |
| `src/frontend/screens/WebView/__tests__/WebViewAmazonLoginDataSpawn.test.ts:16` | KEEP-COMMENT-ONLY (pending Task 3) | (d)/test-pin | This file is one of Task 3's three dispositioned pins — see Task 3's verdict for whether this comment text itself is edited. Not a Task 1 deletion. |
| `src/frontend/screens/WebView/components/humbleLoginChromeCss.ts:4` | DELETE | (a) | Whole file is deleted by Task 2. |
| `src/frontend/screens/Login/components/HumbleLogin/index.scss:14` | KEEP-COMMENT-ONLY | (d) | Comment contrasting the Tauri panel's footprint against "the Electron embedded webview"; file not in `files_modified`, purely descriptive, harmless staleness accepted (bucket (d) instruction: record and decide KEEP or REWORD — KEEP chosen, out of this plan's file list). |
| `src/backend/platform/types.ts:133,163-164` | OUT-OF-SCOPE-THIS-PLAN | (b) | The `WebviewTag` shim's own section header/doc comment. Owned by plan `40-03`. |
| `src/backend/sidecar/oauthLoginCapture.ts:129` | KEEP-COMMENT-ONLY | (d) | Comment noting a regex is untouched for the (dead) `<webview>` path; not in `files_modified`. |
| `src/backend/sidecar/appShellFlowRegistration.ts:21,266` | KEEP | (c) | Module doc / log line naming the declared-empty return's rationale (D-12). This is the backend fact that makes Model A provably dead everywhere else — not Model A itself. |
| `src/common/humble/loginChromeCss.ts:4,93` | KEEP-COMMENT-ONLY | (d) | Doc comments naming "the Electron `<webview>`" as one of the surfaces this shared CSS helper serves. File SURVIVES (3 importers, confirmed by grep below) — comment is accurate background, not a live reference to code being deleted. |
| `src/preload/api/tauriChildWindows.ts:16,18` | KEEP-COMMENT-ONLY | (d) | Doc comment explicitly says "Explicitly NOT implemented here: the `<webview>` login story" — describes scope boundary, not Model A code. |

## Predicate 2: `WebviewTag`

| File:Line | Verdict | Bucket | Note |
|---|---|---|---|
| `src/frontend/screens/WebView/index.tsx:18,69` | DELETE | (a) | Import + `useRef<WebviewTag>(null)` — Task 2 target. |
| `src/frontend/screens/WebView/components/HumbleLoginSurface.tsx:7,34` | DELETE | (a) | Import + `useRef<WebviewTag>(null)` — Task 2 target. |
| `src/frontend/components/UI/WebviewControls/index.tsx:11,15` | DELETE | (a) | Whole file deleted by Task 2. |
| `src/backend/platform/__tests__/types.usage.test.ts` (lines 35,47,216,223,259,263-277,572,670) | OUT-OF-SCOPE-THIS-PLAN | (b) | D-12's pin — owned by plan `40-03`. |
| `src/backend/platform/types.ts:9,137-139,167` | OUT-OF-SCOPE-THIS-PLAN | (b) | The shim declaration itself and its "Consumed by" doc comment (which names this plan's own three deleted call sites — expected to go stale once `40-03` deletes the shim; not this plan's job to pre-empt). |
| `src/backend/platform/index.ts:1128` | OUT-OF-SCOPE-THIS-PLAN | (b) | Barrel re-export — owned by plan `40-03`. |

## Predicate 3: `DidFailLoadEvent`

| File:Line | Verdict | Bucket | Note |
|---|---|---|---|
| `src/frontend/screens/WebView/index.tsx:18,333` | DELETE | (a) | Import + the `onerror` destructure inside the deleted `useLayoutEffect` — Task 2 target. |
| `src/backend/platform/index.ts:1127` | OUT-OF-SCOPE-THIS-PLAN | (b) | Barrel re-export — owned by plan `40-03`. |
| `src/backend/platform/types.ts:125,155,184,189` | OUT-OF-SCOPE-THIS-PLAN | (b) | Shim declaration — owned by plan `40-03`. |
| `src/backend/platform/__tests__/types.usage.test.ts` (lines 46,184,188,201,247,249,679) | OUT-OF-SCOPE-THIS-PLAN | (b) | D-12's pin — owned by plan `40-03`. |

## Predicate 4: `webviewPreloadPath` / `getWebviewPreloadPath`

| File:Line | Verdict | Bucket | Note |
|---|---|---|---|
| `src/frontend/screens/WebView/index.tsx` (81,265,268,373,490,501,514,516,548) | DELETE | (a) | The state, its fetch effect, its effect-dependency use, and the `!webviewPreloadPath` guard itself — Task 2 target. The guard's two arms are hoisted unconditional per Task 2's instructions; comments at 490/514/516 reference the guard by name and are rewritten alongside it. |
| `src/frontend/screens/WebView/components/HumbleLoginSurface.tsx` (36,39,174,191) | DELETE | (a) | Same shape — state, fetch effect, guard — Task 2 target. |
| `src/frontend/screens/WebView/loginRoutes.ts:5` | KEEP-COMMENT-ONLY | (d) | Doc comment says the store/wiki split happens "inside the `!webviewPreloadPath` branch" — becomes mildly stale once the guard is hoisted away, but this file is not in `files_modified` and the underlying routing logic (`isLoginPathname`) this file provides is unchanged; not worth an out-of-scope edit for a doc comment describing a still-true high-level split (login vs. store/wiki), only no longer literally gated by that guard's name. |
| `src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx` (204,214,266,278,296,312) | Task 3 pin (INVERT) | test-pin | `hasTwoDistinctArms()`'s literal-string extraction of `if (!webviewPreloadPath)` — dispositioned in Task 3, not deleted here. |
| `src/backend/constants/paths.ts:121` | OUT-OF-SCOPE-THIS-PLAN | n/a | A backend constant `webviewPreloadPath` (distinct from the frontend state variable of the same name) that builds a `file://…/webviewPreload.js` path. Confirmed by grep to have **zero importers anywhere in `src/`** — it is already dead code, orphaned by an earlier phase. Not in this plan's `files_modified`, not part of D-09's frontend-scoped census; left for a future cleanup pass, recorded here so it is not silently missed. |
| `src/backend/sidecar/appShellFlowRegistration.ts` (20,183,262-266) | KEEP | (c) | `getWebviewPreloadPath`'s declared-empty-string IPC handler — the backend fact that makes `!webviewPreloadPath` always true. This is explicitly NOT Model A; deleting it would remove the very channel the frontend calls (harmlessly, since it's declared-dead) and is out of this plan's scope regardless. |
| `src/backend/sidecar/__tests__/appShellFlows.test.ts:398,400` | KEEP | (c) | Test proving the declared-empty return — same rationale as above. |
| `src/common/types/ipc.ts:461` | OUT-OF-SCOPE-THIS-PLAN | n/a | IPC channel type declaration for `getWebviewPreloadPath` — the channel itself is untouched by this plan. |
| `src/preload/api/misc.ts:103` | OUT-OF-SCOPE-THIS-PLAN | n/a | Preload invoker wiring for the same channel — untouched. |

## Negative predicate: `Sidebar/index.tsx` — the ROADMAP's line is FALSIFIED

```
$ find src -path "*Sidebar/index.tsx"
(zero results)
$ test -f src/frontend/components/UI/Sidebar/index.tsx && echo EXISTS || echo MISSING
MISSING
```

**The ROADMAP's `Sidebar/index.tsx:92,103` line is stale and explicitly falsified by this
measurement.** That file does not exist anywhere under `src/`. It was deleted by Phase 34.10's
NavShell, which replaced the left sidebar with the two-tier horizontal card-tab navigation shell
(`src/frontend/components/UI/NavShell/`). Three files under `NavShell/` still carry `Sidebar/index.tsx`
in their own comments purely as a "ported from" historical citation
(`NavShell/index.tsx:19,33`, `NavShell/components/DownloadsRing/index.tsx:14`,
`NavShell/__tests__/NavShell.test.tsx:4`) — none of these are Model A, none are touched by this
plan, and none contradict the falsification above; they cite a file that used to exist, not one
that still does.

This census does **not** restore a `Sidebar/index.tsx` deletion task — there is nothing there to
delete. The correct census of Model A's live sites is the DELETE rows in the four predicate
tables above.

## Summary — DELETE bucket (Task 2's worklist)

| File | Action |
|---|---|
| `src/frontend/screens/WebView/index.tsx` | Edit in place — delete every row above marked DELETE |
| `src/frontend/screens/WebView/components/HumbleLoginSurface.tsx` | Edit in place — delete every row above marked DELETE |
| `src/frontend/screens/WebView/components/humbleLoginChromeCss.ts` | Delete whole file |
| `src/frontend/components/UI/WebviewControls/index.tsx` | Delete whole file (directory removed entirely) |
| `src/frontend/components/UI/WebviewControls/index.css` | Delete whole file (directory removed entirely) |

## Model A sites found by this census that this plan does NOT delete

| Site | Reason not deleted here | Owning plan |
|---|---|---|
| `src/backend/platform/types.ts` (`WebviewTag`/`DidFailLoadEvent` shim) | D-09/D-12: the shim's reason to exist dies with this plan's deletions, but removing the shim itself, its barrel re-export, and its test pin is explicitly deferred | Plan `40-03` |
| `src/backend/platform/index.ts:1128` (re-export) | Same as above | Plan `40-03` |
| `src/backend/platform/__tests__/types.usage.test.ts` (D-12's pin) | Same as above | Plan `40-03` |
| `src/backend/constants/paths.ts:121` (`webviewPreloadPath` constant) | Zero importers, already dead, but never named by this plan's `files_modified` or by D-09's frontend-scoped census | Not yet owned — flagged here for a future pass |
