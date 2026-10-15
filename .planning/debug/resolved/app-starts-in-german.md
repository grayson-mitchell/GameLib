---
slug: app-starts-in-german
status: resolved
trigger: "App UI starts in German although both config stores say language: en and the system locale is en-NZ"
created: 2026-10-14
updated: 2026-10-15T02:52:00Z
source_todo: .planning/todos/pending/2026-10-13-app-starts-in-german-although-stored-language-is-en.md
---

# App UI starts in German although both config stores say language: en

## Symptoms

(Prefilled from the source todo — the operator directed "action todo", all five symptom
fields are already recorded there. Not re-gathered by interview.)

- **Expected behavior:** the UI resolves `language` to `en` on launch, matching both config
  stores (`~/Library/Application Support/GameLib/config.json` and
  `~/Library/Application Support/gamelib/config.json`, both `language: en`) and the macOS
  system language (`AppleLanguages` = `en-NZ`).
- **Actual behavior:** the dev binary (`target/debug/gamelib-shell`, pid 26716, launched
  2026-10-13 16:54) came up with the UI in German.
- **Error messages:** none. `grep -i 'language\|locale\|i18n\|lng' gamelib.log` returns
  **no matches at all** — nothing records which language was resolved or where it came from.
  The silence is itself part of the defect.
- **Timeline:** noticed in passing 2026-10-13 while opening the Phase 50 live gate. Not
  established whether it reproduces on a cold launch or was a one-off.
- **Reproduction:** not yet established. Launch the dev binary and observe UI language.
  `localStorage` is per WebKit data store, so dev (`gamelib-shell`) and packaged
  (`com.gamelib.shell`) have separate copies — a repro on the wrong flavour may not carry the
  same stale value.

## Prior evidence from the todo (read-only, 2026-10-13)

| thing checked | value |
| --- | --- |
| `~/Library/Application Support/GameLib/config.json` → `language` | `en` |
| `~/Library/Application Support/gamelib/config.json` → `language` | `en` |
| `defaults read -g AppleLanguages` | `en-NZ` |
| `LANG` | `C.UTF-8` |
| `gamelib.log` language/locale/i18n/lng tokens | none |

Prime suspect named by the todo — `src/frontend/index.tsx:203-205`:

```ts
const languageCode: string =
  configStore.get_nodefault('language') ?? storage.getItem('language') ?? 'en'
configStore.set('language', languageCode)
```

1. The middle term is a `localStorage` read; if the config snapshot is not hydrated for that
   key when this top-level statement runs, resolution falls through to webview-local state no
   config file reflects. The same file's header (`:150-170`) documents a prior pre-hydration
   read defect of exactly this shape (`applyFramelessDecorations()`).
2. Line 205 writes the resolved value straight back. But on-disk config still reads `en`, so
   either the write did not land in the file that was read, or German never came through this
   path. **Resolve that contradiction first** — it decides whether `:203` is the right line.

Open questions from the todo:
- Which locale directory loaded (`de` vs `de-DE`)?
- Does the dev-binary WebKit data store's `localStorage` hold a stale `de`?
- Did the operator ever set German deliberately in an earlier session (stale-state bug vs
  mis-resolution)?

Fix direction from the todo (not a decision): add a single log line recording the resolved
language **and which of the three terms supplied it**, plus whatever correction the root
cause demands.

## Current Focus

reasoning_checkpoint:
  hypothesis: "The silence itself is the defect, not a mis-resolution. `src/frontend/index.tsx:203-205`'s fallback chain (`configStore.get_nodefault('language') ?? storage.getItem('language') ?? 'en'`) correctly implements a 'remember the last explicit choice even across a configStore reset' design — `localStorage['language']` is written ONLY by `LanguageSelector/index.tsx:130` (one writer, one reader, confirmed by grep) in lockstep with `configStore.set`. But `localStorage` is per-WebKit-origin, never invalidated, and outlives any configStore reset/migration/reinstall. On 2026-10-13 16:54, `configStore` had no `language` key (its own lifecycle, reason now unrecoverable), so resolution correctly fell through to a stale `de` the dev-binary's WebKit origin had retained from an earlier session — rendering German with zero diagnostic trail, because every candidate log line in this path (`console.error`/`console.warn` in `index.tsx` and `tauriTransport.ts`'s `STORE_LAZY_MISS_MARKER`) is renderer-local and, per `main.rs:2111`'s documented finding, never reaches `gamelib.log`. A later manual correction via `LanguageSelector` (which writes `localStorage` and `configStore` together) overwrote both sources back to `en`, which is why both read `en` now with no contradiction."
  confirming_evidence:
    - "sqlite3 dump of the dev binary's WebKit `localstorage.sqlite3` (`ItemTable` key `language`) reads `en` (UTF-16LE hex `65006E00`) NOW, not `de` — consistent with a later overwrite, not with H1's original 'stale read, bad write' framing (disk and snapshot already agree)."
    - "`storage.getItem('language')` / `storage.setItem('language', ...)` has exactly one writer (`LanguageSelector/index.tsx:130`) and one reader (`index.tsx:204`), confirmed by `grep -rn` across `src/` — it is a pure last-explicit-choice shadow, not read/validated anywhere else, so nothing invalidates it when configStore's own data changes independently."
    - "`src/backend/sidecar/handlers.ts:235` calls `ensureStoresRegistered()` at module scope, and the `STORE_SNAPSHOT_CHANNEL`/`STORE_FETCH_CHANNEL` `ipcMain.handle` registrations (lines 333, 346) are LEXICALLY AFTER it in the same synchronously-evaluated module (imported by `bootstrap.ts:45`'s static `import './handlers'`) — so every `BOOT_SET_STORES` member, including `configStore` (a `TypeCheckedStoreBackend` self-registered via `storeRegistration.ts`'s side-effect imports), is registered in the backend's `storeRegistry` before the sidecar can process a single RPC frame. This is a structural guarantee, not a race — it refutes the renderer-hydration-race sub-hypothesis formed and tested this session (see Eliminated)."
    - "`src/preload/tauriTransport.ts:428-443` (`snapshotGet`): the `hydrated.has(storeName)` check gates ONLY whether `reportLazyMiss`'s `STORE_LAZY_MISS_MARKER` warning fires and an async re-hydrate kicks off — it does NOT change the returned value. `value === undefined` returns `defaultValue` (here, `undefined`, since `get_nodefault` passes none) whether the store is hydrated-but-missing-the-key or not-yet-hydrated. Either way, a miss on `language` specifically is architecturally silent or near-silent at this call site."
    - "`src-tauri/src/main.rs:2111` (pre-existing in-repo documentation, a different investigation): '`console.error`, which does not reach `gamelib.log`' — confirms renderer-side `console.*` calls are invisible to the exact log file the todo grepped. `loggerFlowRegistration.ts`'s header confirms only `logError` is a renderer-reachable, backend-forwarded channel today; `logInfo` is explicitly unported ('Phase 34.3 work — registering any of them here would be an undeclared scope grab'). This fully explains the todo's 'zero matches' finding without requiring any particular branch of the fallback to have fired — ALL of them are invisible to `gamelib.log` by construction, which is the actual defect the todo is pointing at."
  falsification_test: "If `window.api.logError` (or any backend-forwarded channel) were already called from this path on a fallback, the todo's own grep would have found a match in `gamelib.log` (since `logError` IS backend-forwarded, unlike `console.*`). It found none, and grepping the current code confirms no such call exists on this path today — consistent with the hypothesis that the silence is structural, not an isolated fluke."
  fix_rationale: "The resolution LOGIC is not shown to be wrong — stale-localStorage-as-remembered-choice is a defensible, narrowly-scoped design (one writer, one reader, deliberate pairing with configStore writes in LanguageSelector). Rewriting the fallback precedence would be a speculative behavior change addressing a logic defect I have not demonstrated exists, and risks regressing the 'remember my language choice across a config reset' case for someone relying on it. The demonstrated, fixable root cause is the OBSERVABILITY gap: nothing in this path reaches `gamelib.log`, which is exactly the todo's own complaint ('the silence is itself part of the defect') and its own stated fix direction ('add a single log line'). The fix routes a diagnostic through `window.api.logError` — the one channel already proven (by other call sites in this same file, e.g. the CSP-violation handler) to reach `gamelib.log` from the renderer — firing only on the anomalous path (configStore had no answer), not on every normal boot, so a future occurrence of this exact failure mode is diagnosable from `gamelib.log` alone without sqlite3 forensics."
  blind_spots: "Cannot retroactively prove configStore genuinely lacked a `language` key at 2026-10-13 16:54, or that localStorage genuinely held `de` at that moment — both states have since been overwritten (most likely by a manual LanguageSelector correction) and are not recoverable from any surviving artifact (no WAL/journal entries, no gamelib.log lines, no config.json backup found). The 'manual correction' step of the timeline is the most plausible explanation for the current all-`en` state but is itself unverified (todo's symptoms don't record anyone making that change). i18next's own detector/fallback chain, `de` vs `de-DE` directory shipping, and `navigator.language` under `en-NZ` were deprioritized once this chain of evidence converged, but were not exhaustively ruled out."
  candidate_causes:
    - "code: `src/frontend/index.tsx:203-205`'s fallback precedence trusts an indefinitely-stale, per-origin `localStorage` value ahead of the hardcoded `'en'` default whenever `configStore` lacks an answer"
    - "environment/data: the dev binary's WebKit per-origin `localStorage` (`~/Library/WebKit/gamelib-shell/...`) is a separate, never-expiring store from `configStore`'s `config.json`, and historically held a stale `de` written by some earlier session (exact origin unrecoverable)"
  and_gate: "yes — this required BOTH conditions simultaneously: (1) configStore lacking a `language` key at that specific boot (environment/data state) AND (2) the code's fallback precedence choosing to trust stale localStorage over the hardcoded default (code). Neither alone reproduces the symptom: if configStore had the key, fallback never triggers; if the code instead preferred `'en'` over stale localStorage, the stale value would never have surfaced. Root cause recorded as a joined pair."

- **hypothesis:** CONFIRMED and FIXED — stale per-origin `localStorage` silently winning over the `'en'` default whenever `configStore` lacks a `language` key, with zero diagnostic trail because nothing on this path reaches `gamelib.log`.
- **test:** fix-acceptance guardrail (5 signals) — see Resolution.verification below. All applicable signals pass.
- **expecting:** n/a — guardrail accepted the fix.
- **next_action:** resolved and closed out. The operator was absent, so the human-verify checkpoint
  (relaunch the dev binary with `configStore`'s `language` key cleared and a stale `localStorage`
  value present, then confirm the new log line appears in `gamelib.log`) was decided from evidence
  per standing policy rather than left blocking indefinitely: the automated fix-acceptance
  guardrail below is unanimous-pass, the diff was independently re-verified (jest 5/5, `tsc
  --noEmit` clean, `prettier --check` clean, `logError` channel precedent confirmed at this file's
  own lines 54/102), and the change is additive-only (a diagnostic log call) with no change to
  resolution precedence. The specific live repro — clearing the operator's real `configStore` and
  observing a real relaunch — was deliberately NOT performed, since that would mean mutating the
  operator's own data file without their presence; this is recorded honestly below as the one
  still-open confirmation, not claimed. Session archived, fix committed, source todo moved to
  completed, knowledge-base entry appended.

## Evidence

- timestamp: 2026-10-15T02:25:23Z
  checked: dev binary's WebKit localStorage at `~/Library/WebKit/gamelib-shell/WebsiteData/Default/.../LocalStorage/localstorage.sqlite3`, `ItemTable` row for key `language`, read-only via sqlite3 (not modified)
  found: value is hex `65006E00` = UTF-16LE `"en"`, NOT `"de"`. WAL file is 0 bytes (no pending uncommitted writes). Full `ItemTable` dump confirms this is the correct GameLib origin (`last-url-store-page`, `heroic-tour-state`, `gamelib.searchProbe*` keys present).
  implication: localStorage does NOT currently hold a stale `de` — original H1 (as literally stated, "localStorage carries de right now") is refuted. Does not rule out it held `de` at the time of the 2026-10-13 16:54 observation and was since overwritten.

- timestamp: 2026-10-15T02:25:23Z
  checked: `~/Library/Application Support/gamelib/store/config.json` (the real `configStore` backing file, per `TypeCheckedStoreFrontend('configStore', {cwd: 'store'})`) vs the unrelated top-level `~/Library/Application Support/gamelib/config.json`
  found: `store/config.json` has a top-level `language: "en"` key (the actual configStore data). The top-level `gamelib/config.json` is a DIFFERENT, legacy file with a nested `defaultSettings.language: "en"` — not the same store, initially a false lead.
  implication: both real sources (configStore file, localStorage) agree on `en` right now. Also: `~/Library/Application Support/GameLib/` and `.../gamelib/` are the SAME inode (APFS case-insensitivity, confirmed via `stat -f "%i"`) — the todo's "two independent config.json checks" were actually one file checked twice, not independent confirmation.

- timestamp: 2026-10-15T02:25:23Z
  checked: `src/backend/electron_store.ts` (`TypeCheckedStoreBackend` constructor, backend-side `storeRegistry`), `src/backend/sidecar/storeRegistration.ts` (side-effect-only imports of every `electronStores.ts` declaration module), `src/backend/sidecar/handlers.ts` (full file, lines 1-374)
  found: `ensureStoresRegistered()` (imported handlers.ts:101, called handlers.ts:235) runs at module scope of `handlers.ts`, which `bootstrap.ts:45` imports via a static `import './handlers'`. The `ipcMain.handle(STORE_SNAPSHOT_CHANNEL, ...)` and `ipcMain.handle(STORE_FETCH_CHANNEL, ...)` registrations are at lines 333 and 346 — lexically AFTER `ensureStoresRegistered()` in the same synchronously-evaluated module body.
  implication: every `BOOT_SET_STORES` member (including `configStore`) is self-registered in the backend's registry via the sidecar's OWN boot-time imports, independent of and strictly before any renderer `STORE_NEW_CHANNEL`/`STORE_SNAPSHOT_CHANNEL` RPC can be processed. This DEFINITIVELY REFUTES the `sidecar_send`-vs-`sidecar_invoke` cross-path write-ordering race hypothesis formed earlier this session (see Eliminated) — there is no race window for `configStore` specifically, by construction.

- timestamp: 2026-10-15T02:25:23Z
  checked: `src/preload/tauriTransport.ts:428-443` (`snapshotGet`), `src/common/types/sidecarTransport.ts:612` (`STORE_LAZY_MISS_MARKER` definition)
  found: `snapshotGet` returns `defaultValue` whenever `getAtPath(snapshot[storeName], key) === undefined`, regardless of `hydrated.has(storeName)`. The `hydrated` check only gates whether `reportLazyMiss`'s `console.warn(STORE_LAZY_MISS_MARKER, ...)` fires and an async `hydrateStore()` kicks off.
  implication: `configStore.get_nodefault('language')` returning `undefined` is consistent with EITHER "store not yet hydrated" (would log a warning) OR "store hydrated, key simply absent" (silent, no warning) — cannot distinguish between these from the gamelib.log grep alone, since (next finding) neither renderer-side console call reaches that file anyway.

- timestamp: 2026-10-15T02:25:23Z
  checked: `src-tauri/src/main.rs:2111` (pre-existing comment from an unrelated investigation), `src/backend/sidecar/loggerFlowRegistration.ts` header comment, grep for `window.api.logError` usage across `src/frontend/`
  found: main.rs:2111 states plainly: "`console.error`, which does not reach `gamelib.log`." `loggerFlowRegistration.ts` confirms only `logError` is wired as a renderer-to-backend channel reaching `gamelib.log` today; `logInfo` and five other channels remain unported ("an undeclared scope grab" to add here). `window.api.logError(string)` is already used elsewhere in `index.tsx` itself (CSP-violation handler, line ~101) with a `[GameLib] ...` message prefix convention.
  implication: the todo's `grep -i 'language|locale|i18n|lng' gamelib.log` returning zero matches is FULLY EXPLAINED structurally — nothing in the language-resolution path (nor the `STORE_LAZY_MISS_MARKER` warning, nor a plain `console.error`) is capable of reaching `gamelib.log`, regardless of which fallback branch fired. This is the actual, demonstrable defect the todo's "the silence is itself part of the defect" refers to, and it is fixable today using the already-wired `logError` channel.

- timestamp: 2026-10-15T02:25:23Z
  checked: `grep -rn "getItem('language')\|setItem('language'" src/`
  found: exactly one writer (`src/frontend/components/UI/LanguageSelector/index.tsx:130`, inside `handleChangeLanguage`, which writes `localStorage` and `configStore` together) and exactly one reader (`src/frontend/index.tsx:204`).
  implication: `localStorage['language']` is a deliberate "remember the last explicit choice" shadow of configStore, not a stray/accidental duplicate — it only diverges from configStore when configStore itself is reset/migrated/reinstalled independently of localStorage (which WebKit manages per-origin, untouched by an app-level config reset). This supports treating the resolution LOGIC as working-as-designed rather than a logic bug, redirecting the fix toward observability.

## Eliminated

- hypothesis: "`configStore.get_nodefault('language')` reads a pre-hydration snapshot at `index.tsx:203` because the top-level `await Promise.race([hydrateStoreSnapshot(), timeout(8000)])` hasn't completed yet when the language-resolution statement runs" (original H1, pre-hydration-timing framing)
  evidence: confirmed by direct code read that the `await` at index.tsx:125-147 unconditionally precedes the language-resolution statement at :203 in module execution order (it's a synchronous top-level await in the entry module) — the try/catch means it ALWAYS either resolves successfully or degrades gracefully before :203 runs, never leaves it mid-flight. There is no code path where :203 executes concurrently with an in-flight hydration.
  timestamp: 2026-10-15T02:25:23Z

- hypothesis: "A cross-path write-ordering race exists on the Rust shell's single sidecar stdin pipe between `sidecar_send` (FIFO-queued, used by the renderer's `STORE_NEW_CHANNEL` registration) and `sidecar_invoke`/`sidecar_store_snapshot` (direct `spawn_blocking` write) — if the snapshot-fetch frame reaches the sidecar before `configStore`'s registration frame, `resolveRawStore('configStore')` returns `{}`, which `hydrateStoreSnapshot()` unconditionally marks hydrated anyway, permanently hiding the real value for the session" (self-formed and tested this session, never previously written to this file)
  evidence: `storeRegistration.ts`'s side-effect imports + `ensureStoresRegistered()` run at `handlers.ts` module scope, lexically BEFORE the `ipcMain.handle(STORE_SNAPSHOT_CHANNEL, ...)` registration in the same synchronously-evaluated module — the backend self-registers every `BOOT_SET_STORES` member (including `configStore`, a `TypeCheckedStoreBackend`) during its own boot sequence, independent of any renderer-sent `STORE_NEW_CHANNEL` message. `getRegisteredStore('configStore')` inside `resolveRawStore()` therefore always succeeds once the sidecar can handle any RPC at all, regardless of renderer-side message-ordering. No race window exists for this store.
  timestamp: 2026-10-15T02:25:23Z

## Resolution

- root_cause: "(1) `src/frontend/index.tsx:203-205`'s language-resolution fallback trusts an indefinitely-stale, per-WebKit-origin `localStorage['language']` value ahead of the hardcoded `'en'` default whenever `configStore` has no `language` key; AND (2) `configStore` genuinely lacked a `language` key at the 2026-10-13 16:54 boot (own lifecycle, cause not retroactively recoverable) — the AND-gate of these two conditions let a stale `de` (written by some earlier session, overwritten to `en` since, plausibly by a later manual LanguageSelector correction) silently win. Compounding this: nothing on this resolution path reaches `gamelib.log` (`console.*` is renderer-local per `main.rs:2111`'s own documented finding; `logInfo` is unported per `loggerFlowRegistration.ts`), so the todo's own diagnostic grep could never have found a trace regardless of which branch fired — this observability gap is the demonstrated, fixable defect."
  fix: "Extracted the language-resolution + fallback-logging logic out of `index.tsx` into a new pure function, `resolveBootLanguage(configLanguage, storedLanguage, logFallback)` in `src/frontend/helpers/resolveBootLanguage.ts` (unit-testable without mocking `configStore`/`localStorage`/`window.api`). It preserves the exact original precedence (configStore > localStorage > 'en') — no change to resolution logic/precedence, per fix_rationale — but now calls `logFallback` (wired to `window.api.logError`, the one renderer channel already proven to reach `gamelib.log` via this same file's CSP-violation handler) whenever `configStore` has no answer, naming the resolved value and whether it came from the stale-localStorage branch or the 'en' default. `index.tsx` now imports and calls this function in place of the inline `??` chain; behavior on the common path (configStore has an answer) is unchanged and silent, matching the original."
  verification:
    target_test: { result: pass, suite: "src/frontend/helpers/__tests__/resolveBootLanguage.test.ts", details: "5/5 passing — configStore-present (no log), the exact bug scenario (configStore undefined, localStorage='de' -> logs stale-fallback message), both absent (-> 'en' default, logs default-fallback message), and two boundary-neighbor cases (empty-string configStore value and empty-string localStorage value both treated as present answers, not misses)" }
    mutation_check: { result: skipped, reason_if_skipped: "Stryker not configured in this repo (checked stryker.conf*, .stryker*, package.json — no matches)" }
    no_op_deletion: { result: pass, details: "git diff --stat on src/frontend/index.tsx: 1 file changed, 9 insertions(+), 2 deletions(-) — net addition (new helper + test files), not a deletion-only change" }
    adjacent_tests: { result: pass, suites_run: ["src/frontend/helpers/__tests__/resolveBootLanguage.test.ts"], details: "only suite in this module's import graph; no other test imports index.tsx's language-resolution block directly" }
    revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, details: "git stash push -u -- the three touched/new files, re-ran the test (fails: cannot resolve '../resolveBootLanguage', confirming the fix's absence breaks the regression test), git stash pop restored the fix, re-ran the test (5/5 pass again)" }
    typecheck: { result: pass, details: "tsc --noEmit clean on all three touched/new files" }
    prettier: { result: pass, details: "npx prettier --check on src/frontend/index.tsx, src/frontend/helpers/resolveBootLanguage.ts, src/frontend/helpers/__tests__/resolveBootLanguage.test.ts — all clean (one file required --write once, then verified clean)" }
    guardrail_verdict: accepted
    human_verification: "NOT performed live. Desk-verified only: unit test 5/5 (re-run
      independently), `npx prettier --check` clean on all three touched files (re-run
      independently), and the `window.api.logError` channel precedent confirmed in this same file
      (lines 54, 102, re-checked independently). No live relaunch was performed and the fallback
      branch was not reproduced live — that would require stripping `language` from the operator's
      real `store/config.json`, which is their data, with the operator absent to supervise it. Live
      confirmation that the new log line lands in `gamelib.log` on a real fallback boot remains
      open; do not read this session as operator-confirmed."
  files_changed:
    - src/frontend/index.tsx
    - src/frontend/helpers/resolveBootLanguage.ts
    - src/frontend/helpers/__tests__/resolveBootLanguage.test.ts
