---
status: awaiting_human_verify
trigger: "Download queue crashes with 'Cannot find module backend/storeManagers' — wedges the DownloadManager on any download completion AND on the in-app Cancel button."
created: 2026-07-21
updated: 2026-07-21
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "The synchronous require('backend/storeManagers') in downloadqueue.ts's getLibraryManagerMapSync() (and the identical pattern in launcher.ts's getRunnerCallWithoutCredentials) compiles to a literal, unresolvable require(\"backend/storeManagers\") in the electron-vite production bundle, because Rollup only resolves the vite `resolve.alias` for static `import`/`import()` specifiers, never for arbitrary `require()` call expressions — causing every sync call (cancel/stop/completion-notification, and legendary command-arg building) to throw at runtime."
  confirming_evidence:
    - "Rebuilt with `electron-vite build` BEFORE the fix and grepped build/main: exactly 2 literal `require(\"backend/storeManagers\")` occurrences, both in the same emitted chunk (index-Bw6zvhW0.js) — one traced to downloadqueue.ts's getLibraryManagerMapSync, one to launcher.ts's getRunnerCallWithoutCredentials. The `await import('backend/storeManagers')` call sites in the same files were NOT left literal — they were properly resolved/inlined."
    - "Read package.json/main.ts/electron.vite.config.ts: no runtime module-alias resolver exists (no `_moduleAliases`, no `module-alias` dep, no tsconfig-paths register) — 'backend' is ONLY a build-time vite resolve.alias, confirming require() of that alias can never resolve at runtime in the packaged app."
    - "Confirmed the codebase already proves static top-level `import { libraryManagerMap } from 'backend/storeManagers'` is safe for synchronous dereference inside a function body in this exact circular-dependency shape: utils/uninstaller.ts line 107 (`libraryManagerMap[runner].getGame(appName)`, sync, non-awaited) and shortcuts/shortcuts.ts line 84 already do this successfully today. storeManagers/index.ts's `libraryManagerMap` is constructed eagerly (synchronously, at module top level, no async init needed) and neither downloadqueue.ts nor launcher.ts dereferences it at their own module top level (only inside function bodies) — so Rollup's live-binding handling of the cycle is safe regardless of which side of the cycle evaluates first."
  falsification_test: "If, after converting to a static top-level import, `libraryManagerMap` were read at the OTHER module's top-level eval time (before storeManagers/index.ts finished constructing it) OR before this module's own top-level finished, it would throw a TDZ/undefined-property error instead of the require() error. Verified this does NOT happen: grepped both downloadqueue.ts and launcher.ts for top-level (non-function-body) uses of libraryManagerMap — none found; all uses are inside cancelCurrentDownload/stopCurrentDownload/processNotification/addToQueue (downloadqueue.ts) and getRunnerCallWithoutCredentials/launchEventCallback (launcher.ts)."
  fix_rationale: "Replaces the unresolvable require() with a static import that electron-vite/Rollup DOES resolve at build time (proven: it already resolves the `await import()` forms in the same files), while keeping the exact same synchronous, non-Promise call shape the callers need (D-UAT-05). Addresses the root cause (wrong resolution mechanism for the alias) rather than the symptom (the crash), and does not reintroduce the circular-dependency init-order problem the original lazy require was written to avoid, per the falsification check above."
  blind_spots: "utils.ts's getGame() has the SAME bug shape but via a relative require('./storeManagers') (not the 'backend/storeManagers' alias) — it is NOT caught by the acceptance gate's grep and was left UNFIXED (out of this debug session's scope; likely a follow-up debug session). Did not exhaustively test every runner's LibraryManager class for behavior differences under this cycle order — relied on the existing proven call sites (uninstaller.ts, shortcuts.ts) as the safety precedent rather than tracing every store manager's own top-level code."

hypothesis: CONFIRMED — see reasoning_checkpoint above.
test: Rebuilt with electron-vite build and grepped build/main for the literal alias string; ran the downloadmanager + storeManagers jest suites; ran tsc --noEmit.
expecting: Zero literal `require("backend/storeManagers")` in build/main; jest green; tsc clean.
next_action: Awaiting human confirmation that a real download cancel + a real download completion no longer crash/wedge in the packaged app (self-verification below is build/test-level, not a live end-to-end repro of the original crash).

## Symptoms

expected: Cancelling a download, or a download reaching 100%, cleanly updates the DownloadManager queue (item moves to finished / is removed).
actual: The app throws "A uncaught exception occured: Error: Cannot find module 'backend/storeManagers'" (Require stack: build/main/chunks/index-*.js -> build/main/main.js). On completion the item wedges in the queue at 100% (endTime:0) and blocks the next queued item; on Cancel it throws the dialog.
errors: |
  Error: Cannot find module 'backend/storeManagers'
  Require stack:
  - /Users/graysonmitchell/Projects/GameLib/build/main/chunks/index-Bw6zvhW0.js
  - /Users/graysonmitchell/Projects/GameLib/build/main/main.js
    at _r (src/backend/downloadmanager/downloadqueue.ts:38:20)
reproduction: On a production `electron-vite build`, either click the in-app Cancel button on an active download, or let any download reach 100% (processNotification fires). Confirmed live 2026-07-21: Alan Wake (GOG) hit 100% then wedged in the queue; HUMANKIND queued behind it never started.
started: Commit af318c50 (2026-07-20) introduced getLibraryManagerMapSync()'s synchronous require. Never ran successfully before now — the app was boot-broken by a separate bridge-allowlist ENOENT from the same window until it was fixed earlier this session.

## Evidence

- checked: downloadqueue.ts:28-42 (getLibraryManagerMapSync)
  found: Uses synchronous `require('backend/storeManagers')` deliberately (comment: break circular dep downloadqueue.ts <-> storeManagers/index.ts, see storeManagers/gog/user.ts load-bearing comment). Callers are the SYNC functions cancelCurrentDownload / stopCurrentDownload / processNotification. Async functions in the same file use `await import('backend/storeManagers')` instead.
  implication: The sync path is the only one using require() of the alias; the await-import forms differ.
- checked: package.json + main.ts for a runtime alias resolver
  found: no `_moduleAliases`, no `module-alias` dependency, no tsconfig-paths register. The `backend` alias exists ONLY as a build-time vite resolve.alias (electron.vite.config.ts srcAliases).
  implication: `require('backend/storeManagers')` can only work if the bundler inlines it at build time; nothing resolves it at runtime.
- checked: built output build/main/chunks/index-Bw6zvhW0.js
  found: contains 2 literal `require("backend/storeManagers")` calls (grep count = 2). The `await import('backend/storeManagers')` forms elsewhere ARE bundled/resolved.
  implication: electron-vite's production build resolves the alias for import() but NOT for the synchronous require() — leaving an unresolvable runtime require. This is the crash.

## Fix Options (for session manager to evaluate)

- Option A: module-level cache populated via the already-working `await import('backend/storeManagers')` (e.g. in initQueue and/or a fire-and-forget at module load), sync accessor returns the cache. Must handle the pre-initQueue ~5s startup window (D-UAT-05: sync cancel must still work then) — e.g. eager fire-and-forget populate at module load + null-safe accessor.
- Option B: static top-level `import { libraryManagerMap } from 'backend/storeManagers'` with the binding dereferenced ONLY at call time inside the sync functions. Rollup bundles circular ESM via live bindings; safe IFF storeManagers/index.ts (and gog/user.ts) do not dereference the downloadqueue export at module-init time. VERIFY the cycle before choosing this.

## Verification Plan

- `npx electron-vite build` then `grep -rl 'backend/storeManagers' build/main` — must be EMPTY (no literal require left).
- `npx jest src/backend/downloadmanager src/backend/storeManagers` — green.
- `npx tsc --noEmit` — clean.
- Post-fix manual recovery (NOT part of the code fix): with the app force-quit, clear the two stuck `queue` entries (Alan Wake 1207659037, HUMANKIND 1124300) in ~/Library/Application Support/gamelib/store/download-manager.json.

## Evidence (continued)

- timestamp: 2026-07-21
  checked: storeManagers/index.ts (full read) and downloadqueue.ts's actual import graph (grep for who imports downloadqueue.ts / who imports launcher.ts)
  found: The real circular dependency is downloadqueue.ts <-> storeManagers/index.ts (index.ts statically imports `addToQueue` from downloadqueue.ts at its own top level, line 9) and launcher.ts <-> storeManagers/index.ts (index.ts's gog/legendary/nile library.ts imports all statically import launcher.ts). storeManagers/gog/user.ts's load-bearing comment describes a DIFFERENT, narrower cycle (a headless sidecar requiring steam/library.ts directly before index.ts resolves, causing `new SteamLibraryManager()` to fault) — not the same shape as downloadqueue.ts's or launcher.ts's cycle.
  implication: downloadqueue.ts's and launcher.ts's `libraryManagerMap` is constructed eagerly at storeManagers/index.ts module top level with no async dependency on either file's exports at top level (only used inside function bodies in both directions) — so a static top-level import is safe for both files, unlike the narrower gog/user.ts sidecar scenario.
- timestamp: 2026-07-21
  checked: grep for other call sites of `libraryManagerMap` imported via static top-level `import` from 'backend/storeManagers'
  found: utils/uninstaller.ts (line 107, sync, inside a non-async function) and shortcuts/shortcuts/shortcuts.ts (line 84) already use this exact pattern successfully in production today.
  implication: Static import + call-time dereference (Option B) is a proven-safe pattern already shipping in this codebase for a synchronous call site in the same cycle — chosen over Option A (cache-via-await-import) since it needs no eager fire-and-forget populate-at-load workaround for the pre-initQueue startup window.
- timestamp: 2026-07-21
  checked: pre-fix production build (`npx electron-vite build`), grepped build/main
  found: exactly 2 literal `require("backend/storeManagers")` occurrences in build/main/chunks/index-Bw6zvhW0.js — one from downloadqueue.ts's getLibraryManagerMapSync, one from launcher.ts's getRunnerCallWithoutCredentials (both use the `backend/storeManagers` alias form). A third, related but out-of-scope bug: utils.ts's getGame() has a `require("./storeManagers")` (relative form) in the same chunk — NOT caught by the acceptance gate's alias-string grep, left unfixed.
  implication: launcher.ts had to be fixed too (not just downloadqueue.ts) for the acceptance gate's `grep -rl 'backend/storeManagers' build/main` to return zero matches, since both compile into the same literal string in the same chunk.
- timestamp: 2026-07-21
  checked: post-fix production build + verification gate
  found: "`npx electron-vite build` succeeded; `grep -rl 'backend/storeManagers' build/main` returned empty (exit 1, no matches). `npx jest src/backend/downloadmanager src/backend/storeManagers` → 25 suites / 825 tests passed (one known pre-existing leaked-timer warning from steam/library.ts's pollInstallOnce, unrelated to this fix — already tracked in project memory as a separate issue). `npx tsc --noEmit` → clean, no output."
  implication: All three hard-acceptance-gate checks pass. D-UAT-05 (sync cancel/stop must work during the pre-initQueue ~5s startup window) is preserved — libraryManagerMap is now resolved as a static import (available before app startup even begins), so the previously-crashing sync path now just works, including during that window.

## Eliminated

- hypothesis: "Option A (module-level cache populated via `await import()`, sync accessor reads cache) was the fix to apply."
  evidence: "Not eliminated as unsafe, but superseded by Option B once the cycle shape was confirmed safe for a plain static import (proven by uninstaller.ts/shortcuts.ts precedent) — Option B needs no extra eager-populate-at-module-load machinery or null-handling for the pre-initQueue startup window, so it's the simpler fix for the same guarantee."
  timestamp: 2026-07-21

## Resolution

root_cause: "downloadqueue.ts's getLibraryManagerMapSync() and launcher.ts's getRunnerCallWithoutCredentials() used a synchronous CJS `require('backend/storeManagers')` against a path that only exists as a build-time vite `resolve.alias`, with no runtime resolver. electron-vite's production build (Rollup) resolves that alias for static `import`/`import()` specifiers but leaves literal, unresolvable `require(\"backend/storeManagers\")` calls untouched in the emitted chunk, so every synchronous call path (cancel, stop, download-completion notification, legendary command-arg building) threw `Cannot find module 'backend/storeManagers'` at runtime in the packaged app."
fix: "Replaced both synchronous require() calls with a static top-level `import { libraryManagerMap } from 'backend/storeManagers'` in each file, dereferenced only inside the existing function bodies (never at module top level) — safe against the downloadqueue.ts<->storeManagers/index.ts and launcher.ts<->storeManagers/index.ts circular dependencies because libraryManagerMap is constructed eagerly and unconditionally at storeManagers/index.ts's module top level with no dependency on either file's own exports. This mirrors an already-proven-safe pattern in utils/uninstaller.ts and shortcuts/shortcuts.ts. Removed the now-redundant getLibraryManagerMapSync() helper and a redundant local `await import('backend/storeManagers')` inside downloadqueue.ts's addToQueue (now uses the shared top-level binding)."
verification: "electron-vite build succeeds; grep -rl 'backend/storeManagers' build/main returns zero matches (was 2); npx jest src/backend/downloadmanager src/backend/storeManagers passes 25/25 suites, 825/825 tests; npx tsc --noEmit is clean. Human verification still needed: confirm a real Steam/GOG download cancel and a real download reaching 100% no longer crash/wedge in the packaged app (this session only verified build+test level, not a live repro of the original crash)."
files_changed:
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/launcher.ts
  - src/backend/utils.ts

followup_applied: |
  2026-07-21 (orchestrator): closed the flagged blind_spot in the SAME pass. utils.ts's getGame()
  used the same-shape bug via a RELATIVE `require('./storeManagers')` (not the alias, so the
  acceptance-gate grep missed it) — and it is on the uninstall path (askForceUninstall(getGame(...))),
  which the current Phase 23 Gate 3 flow hits. Applied the identical fix: static top-level
  `import { libraryManagerMap } from './storeManagers'`, dereferenced only inside getGame(). Re-verified:
  post-rebuild `grep -rhoE 'require\("[^"]*storeManagers[^"]*"\)' build/main` returns ZERO (the last
  literal `require("./storeManagers")` is gone); `npx jest src/backend/utils src/backend/downloadmanager
  src/backend/storeManagers` → 29 suites / 844 tests pass; `npx tsc --noEmit` clean. All three sync
  storeManagers-require sites (downloadqueue.ts, launcher.ts, utils.ts) are now bundler-resolvable.
