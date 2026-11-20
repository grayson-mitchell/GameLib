---
status: complete
quick_id: 260925-re8
date: 2026-09-25
---

# 260925-re8 — Vite dev watcher no longer walks `graphify-out/`

Actioned pending todo
`2026-09-25-vite-watcher-still-walks-graphify-out-so-graphify-update-can.md`
(`severity: medium`, `platform: windows`, `ready: live-gate`).

## Outcome

RED, fixed, confirmed. `vite.config.ts`'s `server.watch.ignored` now reads
`['**/src-tauri/target/**', '**/graphify-out/**']`.

## The gate was run differently than the todo prescribed — deliberately

The todo asked for `pnpm tauri:dev` + `graphify update .`. That arm was **not**
run, on operator decision, for two reasons found at dispatch time:

- A live dev server (PID 14020, started 18:41:49) was already up with the Tauri
  window attached (PID 8876, `gamelib-shell.exe` 0.7.0). `strictPort: true` meant
  a second `pnpm exec vite` could not bind 5173.
- `graphify update .` rewrites the directory **that** server was watching, so the
  destructive arm endangered the operator's live session regardless of which vite
  process was nominally under test. There was no safe variant.

Instead the watcher was asked directly, read-only, through vite's Node API:
`createServer({ configFile: 'vite.config.ts' })` → `listen()` →
`server.watcher.getWatched()`.

## Measurement

| watched subtree     | before | after |
| ------------------- | -----: | ----: |
| `graphify-out/`     | 8 dirs / **3485 entries** | **0 / 0** |
| `src-tauri/target/` | 0 (control) | 0 |
| `build/`            | 169 | 169 (declined) |
| total entries       | 11922 | 8439 |
| `CONTROL src_dirs`  | 383 | 383 |

The two controls are what make the numbers usable: `src-tauri/target = 0` proves
the ignore mechanism works and that the probe distinguishes covered from
uncovered subtrees; `src_dirs = 383` unchanged after the fix proves the zero is
an ignore taking effect, not a blind probe.

## Two harness errors worth recording, because both produced a false green

1. **`createServer()` without `listen()` watches almost nothing** — the first
   probe reported 3 watched dirs and `graphify_out = 0`, which looked like "the
   defect is already fixed". It was an artifact. Vite's root walk populates after
   `listen()`; the real number is 1390 dirs.
2. **The standalone chokidar cross-check used the wrong chokidar.** The repo's
   top-level `chokidar` is **4.0.3**, which dropped glob support in `ignored`,
   while vite bundles **^3.6.0**. That run reported `src-tauri/target = 735`
   watched dirs — an artifact of dead globs, not evidence about vite. Caught
   because the control row disagreed with a known-good fix.

Both were caught by the controls rather than by inspection, which is the argument
for carrying controls in a gate like this at all.

## `build/` — decided DECLINE, re-filed not dropped

`build/` is measurably watched (169 dirs) and is **not** auto-ignored:
`resolveChokidarOptions()` appends the outDir to `ignored` only when
`emptyOutDir` is true, and this config sets it `false`. `public/bin` is watched
for a similar reason (vite adds `publicDir` as an explicit watch target).

Declined because every entry in that array is currently a *measured failure*, and
neither path has been observed failing. Adding them on reasoning alone would
dilute the property that makes the array auditable — the same instinct that kept
`src-tauri/**` narrow. Filed as
`.planning/todos/pending/2026-09-25-vite-dev-watcher-also-walks-build-and-public-bin-both-written-while-serving.md`
(`minor` / `windows` / `live-gate`) with the reproduction recipe.

## Honest limits

- **EBUSY was never re-observed on the post-fix config.** This must not be cited
  as a reproduction of the crash on the fixed config. The write→EBUSY link rests
  on the original stack firing at `_addToNodeFs` on
  `graphify-out/2026-09-23/graph.json`; what this task added was proof that the
  post-fix config still *watched* that path.
- If `graphify update` wrote atomically (temp + rename), EBUSY would not fire.
  graphify's write strategy was not independently verified.
- The fix is pinned by assertions, not by a live gate. Nothing in CI starts a dev
  server and counts watched directories, so a regression here would surface as a
  failing unit assertion, not as a caught crash.

## Files changed

- `vite.config.ts` — added `'**/graphify-out/**'`; extended (did not replace) the
  `260924-vat` comment with the second member of the class and the
  observation-only rule.
- `meta/__tests__/viteRendererConfig.test.ts` — added invariant 7 to the header;
  three new assertions (graphify-out present; the array pinned **exactly** so
  `build/`/`public/bin` cannot be added silently; the rationale comment retained).
  43 tests pass.
- `.planning/quick/260925-re8-.../260925-re8-GATE.md` — gate record.
- `.planning/todos/completed/2026-09-25-vite-watcher-still-walks-graphify-out-...md`
  — moved from `pending/`, outcome prepended.
- `.planning/todos/pending/2026-09-25-vite-dev-watcher-also-walks-build-and-public-bin-...md`
  — new.

## Verification run

- `npx prettier --check vite.config.ts meta/__tests__/viteRendererConfig.test.ts` → pass.
  (`.planning/` paths deliberately **not** prettier-checked: `.planning` is in
  `.prettierignore`, so `prettier --check` on them matches zero files and exits 0
  — a vacuous green.)
- `npx jest meta/__tests__/viteRendererConfig.test.ts` → 43/43 pass.
- `pnpm codecheck` → exit 0.
- `pnpm planning-gates` → 13/13 pass.
- Post-fix probe → `graphify_out_dirs: 0`, `ignored_covers_graphify_out: true`.
