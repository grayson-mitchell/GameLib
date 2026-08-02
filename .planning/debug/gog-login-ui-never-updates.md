---
status: root_cause_found
trigger: "GOG login completes fully in the backend but the frontend never updates: login window vanishes, Manage Accounts stays on 'logging into gog', Library spinner never resolves and no games appear"
created: 2026-08-03T01:00:00Z
updated: 2026-08-03T01:00:00Z
phase: 34.5
tracks: F-34.5-G6-12 / F-34.5-G6-03 (gate item 2 clause d)
evidence_log: ~/Library/Logs/GameLib/gamelib.log.34.5-uat-20260803
---

## Current Focus

hypothesis: |
  CONFIRMED (static) — the renderer's Tauri store snapshot is hydrated ONCE at boot for the
  four BOOT_SET cache stores and is never invalidated by a SIDECAR-initiated write. The
  sidecar persists the GOG library to `store_cache/gog_library.json`; the renderer's
  in-memory snapshot still holds the boot value; `CacheStore.get('games', [])` therefore
  returns `[]` for the rest of the session, so `loadGOGLibrary()` is empty, `refresh()`
  logs "No cache found, getting data from gog...", triggers another backend refresh that
  rewrites the same file, and finds `[]` again — deterministically, forever.
test: |
  In devtools, after a GOG login, compare the renderer snapshot against disk:
    window.api.storeGet('gog_library', 'games')          // expect [] or undefined
    window.api.storeHas('gog_library', 'games')          // expect false
  vs.
    cat "~/Library/Application Support/GameLib/store_cache/gog_library.json"  // 7 games
expecting: |
  Renderer says empty / has=false while disk holds 7 games. That disagreement IS the bug.
  If instead the renderer returns the 7 games, this hypothesis is FALSIFIED and the defect
  is downstream in React state/render, not in the snapshot.
next_action: |
  Run the devtools discriminator above to convert this from statically-confirmed to
  live-confirmed, THEN fix. Do not fix before the discriminator runs — see
  `f10-diagnosis-process-lesson` (this project shipped a plausible correlation as a cause
  once already).

reasoning_checkpoint:
  hypothesis: |
    `src/preload/tauriTransport.ts` maintains a synchronous in-memory `snapshot` so the
    renderer's `CacheStore`/`TypeCheckedStoreFrontend` can keep electron-store's SYNCHRONOUS
    read API under Tauri, where IPC is async. `gog_library` is one of four BOOT_SET cache
    stores (`storePolicy.ts:181-186`), eagerly hydrated at boot by `hydrateStoreSnapshot()`,
    which does `hydrated.add(storeName)` (tauriTransport.ts:231).

    After that point the snapshot for a boot-set store can ONLY change via `snapshotSet`
    or `snapshotDelete` — i.e. writes the RENDERER itself performs. The GOG library is
    written by the SIDECAR (`Saved games data`), which never touches the renderer snapshot.

    Both synchronous read entry points then fail closed and SILENTLY:
      snapshotHas():  found=false; `if (!found && !hydrated.has(storeName))` is FALSE
                      because the store IS hydrated → returns false with no lazy-miss
                      warning and no re-hydrate.
      snapshotGet():  value===undefined; same `!hydrated.has()` guard is FALSE → returns
                      defaultValue with no warning and no re-hydrate.

    `CacheStore.get()` (electronStores.ts:90-93) returns the caller fallback the moment
    `storeHas` is false. So `gogLibraryStore.get('games', [])` → `[]`.
  confirming_evidence:
    - "storePolicy.ts:181-186 — BOOT_SET_CACHE_STORE_NAMES = ['legendary_library','gog_library','nile_library','zoom_library']"
    - "tauriTransport.ts:154 — `const hydrated = new Set<string>()`; grep shows ONLY `.add` at lines 231 and 261. Never `.delete`, never `.clear`. No invalidation path exists."
    - "tauriTransport.ts:355 — `hydrateStore()` is called from exactly one place, `reportLazyMiss()`, which is itself only reachable from the `!hydrated.has(storeName)` branches at lines 392 and 405. A hydrated store can therefore never re-hydrate."
    - "tauriTransport.ts:438-448 — `snapshotSet` is the only writer into `snapshot`, and it is renderer-initiated only. No sidecar->renderer store-invalidation message exists."
    - "electronStores.ts:90-93 — `CacheStore.get()` returns `fallback` immediately when `storeHas` is false, before any timestamp/lifespan logic."
    - "GlobalState.tsx:932-937 — refresh() only logs 'No cache found, getting data from gog...' when `!gogLibrary.length || !gog.library.length`; it then awaits refreshLibrary('gog') and re-reads via the SAME stale path."
    - "GlobalState.tsx:675-685 — `gogLogout` ends with `window.location.reload()`. THIS is what emptied the snapshot: the reload re-runs `hydrateStoreSnapshot()` against the disk state at 00:42:56 (just-logged-out, library cleared), and the 00:43:44 sidecar write that repopulates disk lands 48s later, after hydration is already done and `hydrated` is already set. Completes the timeline: boot-hydrate at 00:19:10 had the gate-3 games, which is why they rendered at 00:31/00:34; the logout reload replaced that snapshot with an empty one; nothing could refill it."
    - "LOG: the loop is deterministic and repeats verbatim at 00:43:44, 00:46:09 and 00:52:24 — each time backend `Saved games data` + `refreshLibrary complete`, each time frontend 'No cache found'. 8 backend `refreshLibrary complete` lines total."
    - "LOG: zero errors — `Library refresh failed` count 0, `Force Update` count 0. Consistent with a silent fail-closed read, inconsistent with a throw/rejection."
    - "DISK: store_cache/gog_library.json, 9867 bytes, 7 titles, mtime 00:46 — the backend half demonstrably works."
  falsification_test: |
    Mechanism A (allow-list block) was the competing explanation: if
    `isAllowedStoreField('gog_library','games')` were false, `snapshotHas` returns false at
    line 402 before any hydration logic, producing identical symptoms.
    ELIMINATED by direct read: `gog_library` is in BOOT_SET_CACHE_STORE_NAMES →
    RECOGNIZED_CACHE_STORE_NAMES, recognized cache stores are `'*'` (fully readable,
    storePolicy.ts:146-148), and DENIED_CACHE_STORES contains only `humble_library`
    (storePolicy.ts:175). The read is permitted. Mechanism A cannot be the cause.

    Remaining live falsifier: if the devtools discriminator shows the renderer DOES return
    the 7 games, this whole hypothesis is wrong.
  blind_spots: |
    1. The PERPETUAL SPINNER is not fully explained by this root cause and must not be
       claimed as explained. `refresh()` completes each cycle (the awaited
       `refreshLibrary('gog')` resolves — backend `refreshLibrary complete` fires after
       each), so `refreshing:false` should be set at GlobalState.tsx:978. The empty-library
       symptom is nailed; the never-ending spinner needs its own observation. It may be the
       Library screen's own loading state keyed on an empty library, or
       `refreshingInTheBackground:false` (set by `handleSuccessfulLogin`'s
       `runInBackground:false`) driving a full-screen spinner. UNRESOLVED.
    2. The frozen "logging into gog" Manage Accounts panel is likewise NOT explained by
       this root cause. That panel is rendered by the WebView screen that owns
       `useTauriOAuthLogin`, and `phase=teardown inflight=true` /
       `phase=cancelled-midflight` both fire at 00:43:29. The original unmount hypothesis
       may still be correct FOR THAT SYMPTOM specifically. Two defects may be in play.
    3. Static confirmation only. No live devtools read has been taken.

## Pre-registered predictions (written BEFORE the experiment ran)

The `gogLogout` reload finding (GlobalState.tsx:675-685) completes the causal chain and
makes the restart itself a valid discriminator, so it is recorded here in advance. Any
result that contradicts these predictions FALSIFIES the hypothesis — this section must not
be edited after the run, only answered.

**Experiment:** fully quit the app and relaunch `pnpm tauri:dev`. Do NOT log in to GOG
again. Disk holds 7 titles in `store_cache/gog_library.json` (9867 bytes, mtime 00:46).

| # | Prediction if hypothesis is CORRECT | Strength |
|---|---|---|
| P1 | The GOG games appear in the Library **with no login performed** — boot re-hydrates the snapshot from a disk that already has them | **PRIMARY** — decisive either way |
| P2 | GOG is present as a Library filter option | strong |
| P3 | `No cache found, getting data from gog...` does NOT fire on this boot | secondary, see caveat |
| P4 | `window.api.storeHas('gog_library','games')` → `true`, and `storeGet` returns 7 entries (the inverse of what it would have returned in the broken session) | confirmatory |

**P3's caveat, stated in advance so it is not read as a failure:** the guard is
`gog.username && (!gogLibrary.length || !gog.library.length)`. `gog.library` is React state.
If it is initialised from the store in GlobalState's constructor it will already be
populated and P3 holds; if it initialises empty, the line fires ONCE harmlessly even in the
healthy case. Evidence that P3 is the real behaviour: the 00:19:10 boot of the failing
session — which had a populated `gog_library.json` from gate 3 — produced NO "No cache
found" line at all, and games rendered (observed at 00:31/00:34). So P3 held once already
under exactly these conditions.

**What FALSIFIES the hypothesis:** games still absent after restart with no login (P1
fails). That would mean disk-to-renderer is broken at a layer deeper than snapshot
staleness, and this entire diagnosis is wrong.

**What this experiment does NOT prove even if all four hold:** that re-hydrating is the
correct FIX. It confirms the mechanism only. A fix must still decide where invalidation
belongs (a sidecar->renderer store-changed signal, re-hydrate after login, or dropping the
`hydrated` short-circuit for cache stores) — and must cover `legendary_library` and
`nile_library`, not just GOG.

### Result

[awaiting run]

## Symptoms

expected: |
  After a GOG login completes, the Manage Accounts panel shows the signed-in account and
  the Library renders the user's GOG games with GOG available as a filter option.
actual: |
  Login window vanishes; Manage Accounts stays frozen on "logging into gog"; Library shows
  a spinner that never resolves and zero games. Backend meanwhile completes fully and
  persists 7 titles.
errors: |
  None. Zero errors in the log across the whole failing sequence — no `Library refresh
  failed`, no unported-channel rejection for any store channel, no unhandled rejection.
  The silence is itself diagnostic: both snapshot read paths fail CLOSED and return a
  caller default without warning once a store is marked hydrated.
reproduction: |
  1. `pnpm tauri:dev`
  2. Sign out of GOG (Manage Accounts)
  3. Sign back in with real credentials
  4. Observe: backend completes (gamelib.log), UI does not update
  Reproduced 2026-08-03 during `/gsd-verify-work 34.5`; the same render-layer failure was
  recorded independently by gate 3 on 2026-08-02 (F-34.5-G6-12).
started: |
  Observed as gate item 2's THIRD failure layer. Runs 1 and 2 failed upstream (publicDir/
  spawn, then capture-to-propagation) and never reached the render layer, so this defect
  could not have surfaced before those two were closed.

## Blast radius

**This is not GOG-specific.** All four BOOT_SET cache stores share the identical mechanism:

| Store | Written by sidecar after boot | Renderer snapshot refreshed? |
|---|---|---|
| `gog_library` | yes (GOG login/refresh) | **no** — confirmed this session |
| `legendary_library` | yes (Epic login/refresh) | **no** — same code path |
| `nile_library` | yes (Amazon login/refresh) | **no** — same code path |
| `zoom_library` | n/a (Zoom dropped, D-02) | n/a |

So gate items 1 (Epic) and 3 (Amazon) are expected to hit this SAME render-layer defect the
moment their upstream blockers clear — item 1 on the parked pre-auth 403, item 3 never
attempted. Fixing this is a precondition for those items passing, not only item 2's.

Any post-boot, sidecar-initiated write to a boot-set store is invisible to the renderer for
the rest of the session. A restart repairs it, because boot re-hydrates.

## Relationship to already-known defects

- **CR-03 (same file, lines 295-304) is the same SHAPE, already fixed, different CAUSE.**
  That one was `snapshotSet` writing flat while reads resolved dot-paths, so the RENDERER's
  own writes read back stale — "Only a restart repaired it, because the sidecar's
  `FileStore` does split on dots, so disk was always correct." Our defect is the
  SIDECAR's writes never reaching the renderer at all. The fix for CR-03 does not cover it.
- **`steam-relogin-no-autorefresh` (knowledge base, 2026-07-21)** matched on symptom text
  ("spinner keeps spinning, library never auto-refreshes, refreshing stuck true") and was a
  genuine lead, but its root cause — `refreshLibrary`'s catch not resetting `refreshing` —
  is ALREADY FIXED and present at GlobalState.tsx:1017-1028. It is not this bug: no
  exception is thrown here at all.
- **Same family as the `publicdir-getapppath-chunking` recurrences**: the hazard is
  documented in-file (CR-03's comment describes the stale-snapshot failure mode precisely)
  but the implication was never generalized from "renderer's own dot-path writes" to
  "every sidecar-initiated write".

## Eliminated

- hypothesis: "The Tauri store allow-list blocks the `gog_library`/`games` read"
  eliminated_by: |
    `gog_library` is in BOOT_SET_CACHE_STORE_NAMES → RECOGNIZED_CACHE_STORE_NAMES
    (storePolicy.ts:181-200); recognized cache stores are `'*'`, fully readable
    (storePolicy.ts:146-148); DENIED_CACHE_STORES holds only `humble_library`
    (storePolicy.ts:175). `isAllowedStoreField('gog_library','games')` is true.
    Would also have produced a visible `snapshotGet: blocked read` console warning.

- hypothesis: "A rejected/thrown refresh wedges `this.state.refreshing` (the 2026-07-21 defect recurring)"
  eliminated_by: |
    That fix is present at GlobalState.tsx:1017-1028 and its catch resets `refreshing:false`.
    More decisively: `Library refresh failed` appears ZERO times in the log, and each cycle's
    awaited backend refresh demonstrably resolves (`refreshLibrary complete` ×8). Nothing
    throws.

- hypothesis: "The OAuth capture or credential mint fails"
  eliminated_by: |
    Fully disproven by the log — `status=captured` 00:43:19, `Login Successful` 00:43:24,
    `phase=idle` 00:43:29, 7 titles persisted. F-34.5-G6-02 stays CLOSED. The failure is
    strictly downstream of a completely working backend.

## Evidence

- timestamp: 2026-08-03T00:43-00:52
  checked: gamelib.log.34.5-uat-20260803, full failing sequence
  found: |
    Deterministic 3x repetition of: frontend `[refreshLibrary]` → backend refresh →
    `Saved games data` → `refreshLibrary complete` → frontend "No cache found, getting data
    from gog..." → second backend refresh → still nothing rendered. Zero errors throughout.
  implication: |
    The frontend re-reads the store after a successful backend write and still sees nothing.
    Points at the renderer's READ path, not at acquisition, transport, or persistence.

- timestamp: 2026-08-03
  checked: src/preload/tauriTransport.ts — `hydrated` set lifecycle
  found: |
    `hydrated` is added to at lines 231 and 261 and never removed anywhere. `hydrateStore()`
    has exactly one caller (`reportLazyMiss`, line 355), reachable only when
    `!hydrated.has(storeName)`.
  implication: |
    A boot-set store is permanently marked hydrated. Its snapshot can never be refreshed
    from disk again for the lifetime of the renderer.

- timestamp: 2026-08-03
  checked: src/frontend/helpers/electronStores.ts:88-110 (`CacheStore.get`)
  found: |
    Returns `fallback` immediately when `window.api.storeHas(...)` is false, before the
    timestamp/lifespan logic runs.
  implication: |
    A stale-empty snapshot yields the caller's `[]` default with no error and no signal.

- timestamp: 2026-08-03
  checked: src/frontend/state/GlobalState.tsx:932-937 (`refresh`)
  found: |
    `if (gog.username && (!gogLibrary.length || !gog.library.length))` → log "No cache
    found" → `await window.api.refreshLibrary('gog')` → `gogLibrary = this.loadGOGLibrary()`
    re-reading through the same stale snapshot.
  implication: |
    Explains the self-perpetuating loop exactly: the remedy the code reaches for (another
    backend refresh) cannot fix a renderer-side staleness problem.

## Resolution

root_cause: |
  PENDING live confirmation via the devtools discriminator in `next_action`. Statically
  confirmed: the renderer's Tauri store snapshot has no invalidation path for
  sidecar-initiated writes to BOOT_SET cache stores.
fix: ""
verification: ""
files_changed: []
