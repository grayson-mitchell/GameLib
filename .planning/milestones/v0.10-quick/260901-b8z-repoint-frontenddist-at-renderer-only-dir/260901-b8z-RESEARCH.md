# Quick 260901-b8z — Repoint `frontendDist` at a renderer-only directory

**Researched:** 2026-09-01
**Domain:** vite/rollup output layout × Tauri `frontendDist` codegen embedding
**Confidence:** HIGH on the census (Q1), the plugin fates (Q3) and the pin locations (Q4);
MEDIUM on the build wall-clock estimate (Q6) — labelled where it applies.

Every number below states its derivation. Every claim is backed by a `file:line` or by a
command run in this session and its output. Where I am uncertain I say so and route it to
§8 as a labelled unknown.

---

## 0. Method note (graphify)

`graphify-out/graph.json` exists and was queried first per CLAUDE.md
(`graphify query "vite config frontendDist outDir build renderer"`,
`graphify explain "publicDir"`, `graphify query "what reads assets relative to the frontend
dist root over tauri protocol"`).

**The graph under-reports for this task and must not be relied on as the census.**
`graphify explain "publicDir"` returns `Degree: 3` with only `utils.ts`, `bootstrap.ts` and
`paths.ts` as connections. A direct grep finds **five** importers — it misses
`src/backend/crossover_index/fetcher.ts:6` and
`src/backend/utils/graphics/vulkan/index.ts:1`. It also has no node for `about.html`,
`index.html`, `locales/` or any non-code asset, which is precisely the subject matter here.
Graphify was used to orient; the authoritative census below is grep + built-bundle analysis,
and each sweep names its own method so its completeness is auditable.

---

## 1. Settled findings — do not re-litigate

### 1a. D2 fails the size criterion on arithmetic. CONFIRMED, with one important nuance.

**Measured `build/` today** (clean tree, 2026-09-01, apparent bytes = Σ `lstat().st_size`
over regular files only, symlinks excluded — `du` deliberately NOT used, per the a2w
`<the_du_trap>` finding that APFS block allocation produced a ~7,916 KiB phantom delta on
byte-identical trees):

| top-level entry | apparent bytes | webview-reachable? |
|---|---:|---|
| `bin/` | 317,967,812 | no |
| `main/` | 41,468,888 | no (dead Electron main bundle under Tauri) |
| `sidecar-prep.blob` | 27,172,214 | no |
| `assets/` | 24,993,390 | **partly** — 5,453,018 fresh / 19,540,372 stale (see §1c) |
| `locales/` | 4,072,387 | **yes** |
| `icon.icns` | 1,501,038 | no |
| `mac-icon.icns` | 1,501,038 | no |
| `icon.png` | 667,342 | **yes** (via `public/about.html`'s `<img src="./icon.png">`) |
| `preload/` | 295,784 | no |
| `dmg.png` | 243,639 | no (electron-builder leftover) |
| `win_icon.ico` | 112,728 | no |
| `icon-tray-*`, `icon-dark*`, `icon-light*` (15 files) | 55,592 | no |
| `.DS_Store` | 6,148 | no |
| `changelog.json` | 2,002 | no (backend reads it from `publicDir`, `utils.ts:893`) |
| `about.html` | 1,909 | **yes** |
| `index.html` | 707 | **yes** |
| `webviewPreload.js` | 387 | no (`file://` absolute, `paths.ts:122`) |
| `entitlements.mac.plist` | 375 | no |
| `sea-config.json` | 308 | no |
| `manifest.json` | 266 | **no — vestigial, nothing links it** (§2) |
| `robots.txt` | 67 | no — vestigial |
| **TOTAL** | **420,056,993** | |

*(The brief's "~419.5 MB" is the same measurement minus `preload/`, `dmg.png`,
`sea-config.json`, `.DS_Store` and the stale `icon-dark*`/`icon-light*` set — 549,352 B of
items it did not enumerate. The two agree.)*

**Brotli ratio, derived rather than assumed.** The release build that produced
`__const = 223,766,872 B` (recorded in `260901-8rm-MEASUREMENTS.md`) was committed at
`55808ce51`, which precedes the a2w prune commits (`681fa1344`, `90bb5a08d`) —
`git log --oneline` confirms the ordering. So at that build `build/bin` still carried the
182 stale files worth 48,906,861 B, and the embedded input was
`420,056,993 + 48,906,861 = 468,963,854 B`. Ratio = **223,766,872 / 468,963,854 = 47.7 %**.

**D2 (exclude only `bin/`), proved on the LOCAL path:**
`420,056,993 − 317,967,812 = 102,089,181 B` × 0.477 ≈ **48.7 MB `__const`**, against a
required `< ~30,000,000`. **D2 FAILS.** The conclusion is robust across the whole plausible
ratio band (0.477 → 48.7 MB; 0.533 → 54.4 MB; 0.60 → 61.3 MB). Nothing in that band passes.

**The nuance the todo does not record, and which the planner should know:**
`.github/workflows/release-tauri.yml:418-427` already runs a step
`Prune non-frontend build intermediates before bundling` that does
`rm -rf build/main build/preload build/node-dist` and
`rm -f build/sea-config.json build/sidecar-prep.blob` **before tauri-action reads
frontendDist**. So in **CI**, D2's embed input would be roughly
`102,089,181 − 41,468,888 − 295,784 − 27,172,214 − 308 = 33,151,987 B` → ≈ **15.8 MB
`__const`**, which would *pass*. That split is itself disqualifying: D2 would pass in CI and
fail on the local artifact the todo's own "How it must be proven" section mandates. It is
unprovable by the prescribed method. D1 has no such split. **This strengthens D1; it does not
reopen the choice.**

### 1b. "Does Tauri's resource copier preserve symlinks?" — ANSWERED: no.

`260901-8rm-MEASUREMENTS.md` measured it on a real artifact: repo `build/bin/arm64/darwin`
147,024 KB / 12 symlinks / 461 files → shipped 193,860 KB / **0 symlinks** / 467 files, a
46,836 KB inflation that accounts for the difference exactly (15,612 KB × 3 runners). The
question D2's write-up flagged as "blocking, not yet measured" was already resolved by
Cause 3. Fixing it is a separate item and is **out of scope here** (§ scope boundaries).

**New, related, and load-bearing for the design — `tauri-codegen` DOES follow symlinks.**
`~/.cargo/registry/src/index.crates.io-*/tauri-codegen-2.6.3/src/embedded_assets.rs:121-122`:

```rust
WalkDir::new(&path)
  .follow_links(true)
```

Two consequences: (i) a symlinked `build/renderer/locales -> ../locales` *would* embed
correctly, so symlinks are a viable way to avoid on-disk duplication — but they are **not
portable to the Windows CI leg** (symlink creation needs Developer Mode/admin), so real
copies are recommended; (ii) a **dangling** symlink under `frontendDist` makes walkdir yield
an `Err`, which `embedded_assets.rs:145-149` propagates — the Rust build fails loudly rather
than silently skipping. Good failure mode; the assembly step must simply never leave one.

Also from the same walker: there is **no ignore list**. Every regular file under
`frontendDist` is embedded, including `build/.DS_Store` (6,148 B, embedded today).

### 1c. NEW settled finding — 19,540,372 B of `build/assets` is STALE and currently embedded.

Method: parsed `build/index.html` for `./assets/<name>` references, then BFS'd the emitted
JS/CSS following both `"./name"` and bare `new URL("name", import.meta.url)` forms until
closure.

```
reachable assets files: 78 / 263
reachable bytes:         5,453,018
all assets bytes:       24,993,390
stale bytes:            19,540,372
```

This is `emptyOutDir: false` doing exactly what its own comment warns about
(`vite.config.ts:106-112`), one directory over from `build/bin` — the a2w fix covered
`build/bin` only. **Today all 263 files are brotli'd into the shell binary; only 78 are
reachable.** A renderer directory assembled from rollup's own emitted-file list fixes this as
a side effect, with no change to `emptyOutDir`.

---

## 2. Q1 — the webview-reachable census (definitive)

Everything that resolves relative to `frontendDist` — i.e. against `tauri://localhost/`.

### The table

| Path (relative to `frontendDist` root) | Referenced by | How | MUST be in the renderer dir? |
|---|---|---|---|
| `index.html` | main window, **implicitly** | `tauri.conf.json:14-23` declares `windows[0]` with **no `url` key**; `tauri-utils-2.9.3 src/config.rs:122-126` — `impl Default for WebviewUrl { fn default() -> Self { Self::App("index.html".into()) } }` | **YES** |
| `assets/**` (78 files, 5,453,018 B) | `build/index.html` `<script src="./assets/index-*.js">` + 2 `<link href="./assets/*">`, then transitively | rollup-rewritten, all `./`-relative to the chunk's own dir | **YES** (fresh set only) |
| `locales/{lng}/{ns}.json` (147 files, 4,072,387 B) | `src/frontend/index.tsx:116` — `loadPath: 'locales/{{lng}}/{{ns}}.json'` on `i18next-http-backend` | **bare relative** — resolves to `tauri://localhost/locales/...` | **YES** |
| `about.html` (1,909 B) | `src/preload/api/tauriChildWindows.ts:177` — `url: 'about.html?v=' + encodeURIComponent(version)` inside `new WebviewWindow('about', {...})` | bare relative, `WebviewUrl::App` | **YES** |
| `icon.png` (667,342 B) | `public/about.html:50` — `<img src="./icon.png" alt="GameLib" />` | `./`-relative from `about.html` at the root ⇒ `tauri://localhost/icon.png` | **YES** |
| `manifest.json` (266 B) | **NOTHING** | — | **NO — vestigial** |
| `robots.txt` (67 B) | **NOTHING** | — | **NO — vestigial** |
| `changelog.json` | backend only — `src/backend/utils.ts:893` `join(publicDir,'changelog.json')` | filesystem, via `bundle.resources` target | no |
| `webviewPreload.js` | `src/backend/constants/paths.ts:122` — `join('file://', publicDir, 'webviewPreload.js')` | **absolute `file://`**, never `tauri://` | no |
| `icon-tray-*.png` | Rust, `src-tauri/src/main.rs:103/107/112` — `include_bytes!("../../public/icon-tray-*.png")` | compiled into the binary from `public/`, not from `build/` | no |
| `bin/**`, `main/**`, `preload/**`, `sidecar-prep.blob`, `sea-config.json`, `*.icns`, `win_icon.ico`, `dmg.png`, `entitlements.mac.plist`, `.DS_Store` | nothing webview-side | — | no |

**Total required renderer-dir payload: 10,195,363 B (≈ 9.72 MiB)**
= 5,453,018 (assets) + 4,072,387 (locales) + 667,342 (icon.png) + 1,909 (about.html)
+ 707 (index.html).

Predicted `__const` ≈ 10,195,363 × 0.477 ≈ **4.9 MB** — well under the 30,000,000 criterion,
with a ~6× margin. (Real-world it will be a little different in either direction: JS/CSS
brotli far better than 47.7 %, PNG/JPG/WOFF2 far worse. The margin absorbs both.)

### The sweeps, and the method for each (so the census is auditable)

1. **Every window/webview creation site and its `url:`.**
   *Method:* `grep -rn "WebviewWindow|new Webview|createWebviewWindow" src --include=*.ts
   --include=*.tsx`, plus `grep -n "WebviewWindowBuilder|WebviewUrl::|WindowBuilder::new"
   src-tauri/src/main.rs`.
   *Result:* **three** JS creation sites — `tauriChildWindows.ts:92` (`url` is the
   caller-supplied **remote** URL; `externalWindowTitle` parses it as an absolute `URL`, so
   it is never frontendDist-relative), `tauriChildWindows.ts:176` (`about.html?v=…` — the
   only relative one), and `WebviewWindow.getByLabel('about')` at `:168` (a lookup, not a
   creation). Rust: **every** `WebviewWindowBuilder::new` uses
   `tauri::WebviewUrl::External(...)` — `main.rs:5229`, `:6308-6311`, `:6375-6378`. Plus
   `main.rs:2924` `tauri::WindowBuilder::new` (a plain window, no webview URL). `main.rs:710`
   is a **doc comment** about the About window, not a URL construction — the tray item at
   `main.rs:634` (`MenuItemBuilder::with_id("about", "About GameLib")`) reaches the About
   window by `window.eval("window.api?.showAboutWindow?.()")` at `main.rs:729`, i.e. through
   the same preload function. **No second `about.html` load site exists.**

2. **Relative `fetch` / `XMLHttpRequest` in `src/frontend` and `src/preload`.**
   *Method:* `grep -rnE "fetch\(['\"\`][^h/]|new XMLHttpRequest|\.open\(['\"](GET|POST)"` and
   then an unfiltered `grep -rn "fetch("` across `src/frontend src/preload src/common`.
   *Result:* **ZERO** matches other than one prose mention in
   `src/common/types/sidecarTransport.ts:367`. All renderer→backend traffic goes over the
   Tauri invoke transport, not HTTP. The only HTTP the renderer does is i18next's, via
   `i18next-http-backend`'s internal `request`.

3. **`src=` / `href=` / `url(...)` inside `index.html`, `public/about.html`, and their
   closure.**
   *Method:* `cat index.html`, `cat public/about.html`;
   `grep -rnE 'src=["\x27][^h{]' src/frontend --include=*.tsx` and the `href=` equivalent;
   then `cat build/assets/*.css | grep -o 'url([^)]*)' | sort -u` and count anything not
   matching `url(./…)`, `url(data:…)`, `url(#…)`.
   *Result:* source `index.html` has one `<script type="module" src="/src/frontend/index.tsx">`
   (a rollup input, rewritten at build). `public/about.html:50` has `<img src="./icon.png">`
   — **the third consumer, exactly as the orchestrator found; the todo's set of two was
   incomplete.** In tsx, one inert `href=""` at
   `src/frontend/screens/Settings/components/NvidiaPrime.tsx:53`, nothing else. In the built
   CSS: the count of `url()` values that are **not** `./`-relative-into-assets and not
   `data:` is **0**. The `--imageUrl: url(/src/frontend/assets/controllers/...)` custom
   properties in `src/frontend/components/UI/ControllerHints/index.css:32-116` and
   `src/frontend/screens/ConsoleMode/index.scss:404-411` **are** rewritten by rollup into
   `./PS5_Dpad-CUUVZ112.png` &c. Nothing escapes `assets/`.

4. **Anything `public/manifest.json` references; is `manifest.json` linked at all?**
   *Method:* `cat public/manifest.json`; `grep -rn "manifest.json" --include=*.html
   --include=*.ts --include=*.tsx --include=*.json .` (excluding node_modules/.planning).
   *Result:* `manifest.json` declares `"icons":[{"src":"icon.png",…}]` and
   `"start_url":"."` — **but `index.html` contains no `<link rel="manifest">` and nothing
   else in the repo links it.** The only `manifest.json` hits are unrelated:
   `meta/gen_vtables.ts` (Steam SDK interface manifests) and
   `src/backend/constants/environment.ts:11` (`/app/manifest.json`, the Flatpak manifest at
   an absolute filesystem path). **`manifest.json` and `robots.txt` are a vestigial CRA/PWA
   scaffold.** They are not webview-reachable, and `icon.png`'s reachability comes from
   `about.html`, not from the manifest. Including them anyway costs 333 B; excluding them is
   correct. Either is defensible — recommend excluding and saying so in the plan, so a future
   reader does not think it was an oversight.

5. **Rust-side path resolution against the frontend dist root.**
   *Method:* `grep -rn "resource_dir()|GAMELIB_APP_ROOT|frontendDist|index.html"
   src-tauri/src/`.
   *Result:* **none.** The only Rust path resolution is
   `resolve_packaged_app_root` (`main.rs:6985-6988`) →
   `app.path().resource_dir()` → `GAMELIB_APP_ROOT`, which is `Contents/Resources` and is
   populated by `bundle.resources` **target** paths, not by `frontendDist`.
   `src-tauri/build.rs:3` and `main.rs:4` mention `../build` in **comments only** — stale
   prose that should be updated for accuracy but has no runtime effect.

6. **`import.meta.env.BASE_URL` / `<base href>`.**
   *Method:* `grep -rn "BASE_URL|<base " src/ index.html public/`.
   *Result:* **zero** in the renderer. The only `BASE_URL` hits are
   `HUMBLE_BASE_URL` (`src/backend/humble/constants.ts:13`), an unrelated remote origin.
   `base: './'` in `vite.config.ts:89` is the production setting and stays as-is.

7. **Service worker / PWA / Workers.**
   *Method:* `grep -rn "serviceWorker|workbox|registerSW|new Worker\(|new SharedWorker\("
   src/frontend src/preload`.
   *Result:* **zero matches.** There is no service worker, no Workbox, no renderer-side
   `Worker`. Combined with sweep 4, the `manifest.json` + `robots.txt` pair is confirmed
   **vestigial scaffold, not a live PWA**.

8. **Catch-all over the actual shipped bundle** (the strongest completeness check, because it
   sees what the source sweeps might miss).
   *Method:* over the 78-file reachable closure of `build/assets`, regex every string literal
   matching a filename with a web-asset extension, then classify each by reading 90 chars of
   surrounding context.
   *Result:* six candidates, all resolved:

   | literal | verdict |
   |---|---|
   | `locales/{{lng}}/{{ns}}.json` | **REAL** — the i18next `loadPath`. Already in the table. |
   | `gamelib-icon-B0ktIo4B.png` | benign — `new URL("…", import.meta.url).href`; the chunk lives in `assets/`, the file is emitted into `assets/`. Self-contained. |
   | `gamelib_card-Bv2CpHlk.svg` | same |
   | `gamelib_card_missing-Bv06edlW.svg` | same |
   | `pause-icon.svg` | **not a URL** — Inkscape `sodipodi:docname` metadata inside an svgr-inlined SVG. |
   | `to.css` | **not a URL** — a postcss source-map default filename. |

   **`icon.png` appears in ZERO built JS chunks** (`grep -l 'icon\.png' build/assets/*.js`
   returns nothing) — confirming its only consumer is `about.html`'s markup, which is exactly
   why the todo's source-level sweep missed it.

9. **`addPath` — dead config or live? ANSWERED: DEAD.**
   `src/frontend/index.tsx:114-117` sets both
   `addPath: 'build/locales/{{lng}}/{{ns}}'` and `loadPath: 'locales/{{lng}}/{{ns}}.json'`.
   *Method:* read the installed library, not the docs.
   `node_modules/i18next-http-backend/lib/index.js:110-123` — `addPath` is used **only**
   inside `create()`. `create()` is reached only via `backendConnector.saveMissing`, which
   `node_modules/i18next/dist/cjs/i18next.js:699-704` gates behind
   `if (this.options.saveMissing)`. `grep -rn "saveMissing|missingKeyHandler" src/` returns
   **zero** hits repo-wide, so `saveMissing` is its default `false`.
   **`addPath` is never exercised at runtime.** It is harmless to leave, but it is also
   actively misleading (its `build/…` prefix would be wrong under any design). Recommend
   deleting the line in this task, with a one-line comment saying why; that is a
   zero-behaviour-change edit that removes a false signal a future reader would trip on.

### What this census does NOT prove

It is a static analysis over source plus one existing build. It cannot see a URL constructed
at runtime from concatenated fragments that never appear as a single literal. I found no such
construction and no plausible site for one (sweeps 2 and 8 both came back clean), but the
honest statement is *"no evidence of one"*, not *"proven impossible"*. The plan's live gate
(§7) is what closes that residual: a packaged run with the Web Inspector Network tab open
will show any 404 against `tauri://localhost/` directly.

---

## 3. Q2 — mechanism, and what happens to `publicDir`

### Recommendation: **Option B+** — keep `outDir: 'build'`, assemble `build/renderer/` from rollup's own emitted-file list.

The brief's Option B, refined so the asset selection is **exact rather than heuristic**.

- `vite.config.ts`: `outDir` stays `'build'`, `publicDir` stays default, `emptyOutDir` stays
  `false`, `rollupOptions.input` stays `path.resolve('index.html')`. **None of the three
  existing plugins move or change.**
- Add one new plugin — `meta/assembleRendererDist.ts`, registered **last** in the plugins
  array with `apply: 'build'`, `enforce: 'post'`:
  - `generateBundle(_options, bundle)` — capture `Object.keys(bundle)`. Rollup's bundle keys
    are the exact set of files **this** build emits, relative to `outDir`, `/`-separated.
    That is `index.html` plus the 78 fresh `assets/*` — and, critically, it **excludes**
    everything vite's publicDir copy wrote and everything left over from a previous build.
    This is what makes the stale-asset problem (§1c) disappear without touching
    `emptyOutDir`.
  - `closeBundle()` — `rm -rf build/renderer`, then copy each captured key from
    `build/<key>` → `build/renderer/<key>`, plus the explicit static set
    `about.html`, `icon.png`, `locales/**`.
  - Then **fail loudly** on a fixed post-condition: `build/renderer/index.html` exists,
    `build/renderer/assets` holds ≥ 1 file, `build/renderer/about.html` exists,
    `build/renderer/icon.png` exists, `build/renderer/locales` holds ≥ 1 `*.json`. An
    assembly that silently produced an empty or partial tree is the R-34.5-G1-PKG shape all
    over again, and this plugin is the only thing standing between that and a shipped white
    screen.
  - **Ordering:** must run after `preserveRunnerSymlinksPlugin` (also `closeBundle`,
    `enforce: 'post'`). Vite runs same-hook, same-enforce plugins in array order, so placing
    it after in the array is sufficient — but that is an array-position dependency, unlike
    the buildStart/closeBundle separation the prune plugin enjoys. **In practice it does not
    matter**: the symlink plugin only touches `build/bin`, and nothing under `bin/` is copied
    into `build/renderer`. State that explicitly in the plugin's own comment so nobody later
    "fixes" a non-existent ordering hazard.
- `src-tauri/tauri.conf.json:7`: `"frontendDist": "../build"` → `"../build/renderer"`.
- `bundle.resources` — **unchanged**, all four base entries and all three overlays keep
  sourcing from `../build/…` and targeting `build/…`.
- `src/backend/constants/paths.ts` — **unchanged** (see §6).

**Why B+ over A (`publicDir: false` + explicit copy).** A's blast radius is much larger and
its risk profile is worse:

| | Option A (`publicDir:false`, `outDir: build/renderer`) | **Option B+ (recommended)** |
|---|---|---|
| `bundle.resources` sources | must be re-pointed or a full `public/`→`build/` copy re-implemented | untouched |
| `pruneStaleHelperBinariesPlugin` | its `build/bin` default is `join(__dirname,'..','build','bin')`, hard-coded — depends entirely on whether the hand-written copy still writes there | untouched, still fires |
| `preserveRunnerSymlinksPlugin` | a hand-written `cp -R`-style copy **preserves** symlinks ⇒ this plugin has nothing to repair ⇒ **silently retires F-34.9-01's guard** | untouched, still restores 12 |
| `check:build-bin-mirror` | same silent-retire exposure | untouched |
| release-workflow prune step + its 6 executing tests | `build/index.html` disappears ⇒ **`test -f build/index.html` at line 425 hard-fails the release job**; 3 of the 6 tests go red | `build/index.html` still exists ⇒ **step and tests unchanged** |
| `viteRendererConfig.test.ts:87-88` | both assertions go red | **both stay green** |
| Repo disk cost | none | +10,195,363 B (≈ 9.72 MiB), gitignored |
| Fixes the 19.5 MB stale-asset embed | only via `emptyOutDir: true` | **yes, inherently** (rollup bundle keys) |

**Is the ~9.72 MiB duplication acceptable? YES — say so explicitly in the plan.** `/build` is
gitignored (`.gitignore:12`), jest ignores it (`jest.config.js:15`), prettier ignores it
(`.prettierignore:3`), eslint ignores it (`eslint.config.mjs:93`). It costs zero bytes in the
shipped artifact (`build/renderer` is not a `bundle.resources` source, and the embed is the
brotli'd copy that replaces a 420 MB one). It is 2.3 % of what `build/` already holds. Note
that the brief's "~29.8 MB duplicated" estimate was computed against the stale-inflated
`build/assets`; the real figure is 9.72 MiB.

**Two duplications are structurally REQUIRED under any design, not an artefact of B+:**
- `locales/` must exist **twice** — under `frontendDist` for the renderer's i18next
  (`index.tsx:116`, over `tauri://`) *and* under `Contents/Resources/build/locales` for the
  **sidecar's** i18next-fs-backend (`src/backend/sidecar/bootstrap.ts:472,500-502`,
  `loadPath: join(publicDir,'locales','{{lng}}','{{ns}}.json')`). Two different loaders, two
  different roots. Anyone who "deduplicates" this breaks backend-side translated strings.
- `icon.png` likewise — `frontendDist` for `about.html`, and
  `Contents/Resources/build/icon.png` for `windowIcon` (`paths.ts:137`).

### Rejected: repoint `bundle.resources` sources at `../public/…`

Not needed under B+, and it carries two costs. (i) It bypasses
`preserveRunnerSymlinksPlugin` entirely — the symlinks in `public/bin` are intact, but Tauri
dereferences on copy regardless (§1b), so there is **no size benefit** and the plugin's guard
is silently retired. (ii) It breaks a pin the todo's list of five misses:
`src/backend/__tests__/packagingConfig.test.ts:133` hard-codes
``const fullSource = `../build/bin/${relPath}` ``. Leave the sources on `../build/…`.

### `rollupOptions.input` and how `about.html` reaches the renderer dir

**No change to `rollupOptions.input`.** It stays `path.resolve('index.html')` — and
`meta/__tests__/viteRendererConfig.test.ts:96-104` pins that shape, so changing it costs
another pin.

`about.html` reaches `build/renderer/` by **explicit copy from `build/about.html`** (which
vite's publicDir copy already produces). Adding it as a second rollup input was considered
and rejected: vite emits multi-page inputs at their path **relative to `root`**, so
`public/about.html` would land at `build/renderer/public/about.html`, breaking the
`'about.html?v='` URL at `tauriChildWindows.ts:177`. Making it work would mean moving
`about.html` to the repo root — a bigger change with a preload edit attached, for no benefit.
The explicit copy also preserves the file byte-for-byte, which matters: `about.html` carries
its own `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src
'self'; …">` (`public/about.html:14-17`), and `./icon.png` at the frontendDist root is
same-origin under it. Rollup processing would have rewritten `./icon.png` into a hashed
`assets/icon-*.png` — still same-origin and still fine, but it would silently create a
**second** copy of the 667 KB icon in the embed.

---

## 4. Q3 — fate of the three plugins and the standalone gate

Under **B+ every one of these keeps working byte-for-byte identically**, because `outDir`,
`publicDir` and `emptyOutDir` are all unchanged and the publicDir copy still writes the same
`build/` tree. That is the single largest argument for B+ and the planner should treat it as
the decision's load-bearing consequence.

The verdicts below therefore split into "under B+" (the recommendation) and "under A" (what
the plan must handle if it deviates).

### (a) `pruneStaleHelperBinariesPlugin()` — `meta/pruneStaleHelperBinaries.ts:403-421`

**Decision: KEEP, unchanged, under B+.**

*Mechanism, read not assumed.* Default dirs are hard-coded at `:404-405`:
```ts
const buildBinDir = options?.buildBinDir ?? join(__dirname, '..', 'build', 'bin')
const publicBinDir = options?.publicBinDir ?? join(__dirname, '..', 'public', 'bin')
```
Neither is derived from `config.build.outDir`. Hook is `buildStart`, `enforce: 'pre'`,
`apply: 'build'`.

*The silent-no-op is REAL and CONFIRMED.* `pruneStaleHelperBinaries()` (same file) opens with:
```ts
const pruneSet = computePruneSet(buildBinDir, publicBinDir)
if (pruneSet.length === 0) {
  return { pruned: [], bytesFreed: 0, guardEvaluated: false }
}
```
and `collectEntries(root)` (`:85-90`) returns an **empty Map** when `root` does not exist. So
if `build/bin` ever stops being populated, `computePruneSet` returns `[]`, the population
guard is **never evaluated** (`guardEvaluated: false`), and the plugin logs
`[prune-stale-helper-binaries] nothing to prune` and exits clean. **Yesterday's 46.64 MiB fix
would die under a green check.** Under B+ this cannot happen, because vite's publicDir copy
still populates `build/bin` exactly as today.

*Under A:* the hand-written `public/`→`build/` copy MUST still write `build/bin` for this
plugin to have a subject. If the plan deviates to A, it must add an **anti-vacuity**
assertion — e.g. assert `guardEvaluated === true` on a tree with a seeded stale entry, or
assert `collectEntries('build/bin').size > 0` at `buildStart` — because "nothing to prune" and
"nothing to look at" are today indistinguishable from the log line alone.

### (b) `check:build-bin-mirror` — `meta/checkBuildBinMirror.ts`, `package.json:52`

**Decision: KEEP, unchanged, under B+ — and record that it is not automatically enforced.**

*Mechanism.* `:202-203` hard-codes
`join(process.cwd(),'build','bin')` / `join(process.cwd(),'public','bin')`.

*Does it fail loudly on a missing `build/bin`? YES — verified by reading the branches.* The
anti-vacuity guard at `:95-106` only refuses on an empty **`public`** side. With `build/bin`
absent, `buildFiles = []` while `publicFiles` has 307 entries, so check (b) at `:118-127`
("only in public/bin") fires 307 times (capped at 40 + `…and 267 more`) and `process.exitCode
= 1` at `:223`. **The failure is loud, not silent.** That is the opposite of (a) and worth
recording, because the two gates yesterday's task shipped together behave differently under
the same condition.

*The finding the planner needs:* `grep -rn "check:build-bin-mirror" .github/ .husky/
package.json` returns **only the package.json definition**. **Nothing invokes it** — not CI,
not the pre-push hook. Its enforcement today is "a human remembers to type it". That is a
pre-existing gap, out of scope for this task, but the plan should not lean on it as a
regression guard.

### (c) `preserveRunnerSymlinksPlugin()` — `meta/preserveRunnerSymlinks.ts:217-253`

**Decision: KEEP, unchanged, under B+.**

*Mechanism.* Defaults at `:221-222`:
`sourceDir = join(__dirname,'..','public')`, `destDir = join(__dirname,'..','build')` —
again hard-coded, not `outDir`-derived. Hook `closeBundle`, `enforce: 'post'`. It **throws**
on any skipped or rejected symlink (`:236-251`), so it is one of the few genuinely fail-loud
things in this pipeline.

*Does it still have anything to repair under B+?* **Yes — all 12.** vite's publicDir copy is
untouched, so it still dereferences the Python.framework links in `build/bin`, and this
plugin still restores them. The live log line
`[preserve-runner-symlinks] restored 12 symlink(s), skipped 0, rejected 0` should be
byte-identical before and after this task, and the plan should **assert that** as a
no-regression check.

*Does `bundle.resources` sourcing from an intact-symlink location change anything?* **No.**
Tauri dereferences on copy regardless (§1b). F-34.9-01's codesign concern lives on the
**repo-side `build/` tree** that codesign never sees in the Tauri path — but the plugin's
value is that `build/bin`'s shape matches `public/bin`'s, which is exactly what
`check:build-bin-mirror`'s symlink checks (c)/(d) rely on. Retiring it would break that gate.

*Under A:* a symlink-preserving hand-written copy would make this plugin restore **0**
symlinks and still log a cheerful `restored 0 symlink(s)`. **That is the vacuous green.** If
the plan deviates to A it MUST either (i) keep the copy symlink-dereferencing so the plugin
keeps its subject, or (ii) explicitly retire the plugin AND move its guarantee into the copy
step with its own fail-loud post-condition (`build/bin` symlink count === `public/bin` symlink
count, targets equal) — never just delete it.

### (d) Shared-constant check

**None of the three read `build/` from a shared constant.** Three independent hard-codings:
`preserveRunnerSymlinks.ts:222` (`__dirname`-relative), `pruneStaleHelperBinaries.ts:404`
(`__dirname`-relative), `checkBuildBinMirror.ts:202` (`process.cwd()`-relative — deliberately
different, per its own `:197-201` comment about esbuild bundling). Under B+ none needs
touching. If a future task ever moves `outDir`, all three must move together and there is no
single place to change.

---

## 5. Q4 — the five pinned assertions, re-located by search, plus three the list misses

All line numbers below were obtained by `grep -n` in this session, not from the todo.

| # | Pin | Current location | Assertion (verbatim) | Under B+ |
|---|---|---|---|---|
| 1 | `outDir` / `emptyOutDir` | `meta/__tests__/viteRendererConfig.test.ts:87-88` | `expect(config.build?.outDir).toBe('build')` / `expect(config.build?.emptyOutDir).toBe(false)` | **NO CHANGE** |
| 2 | F-34.9-01 symlink plugin | `src/backend/__tests__/packagingConfig.test.ts:388-404` (describe at `:388`; the two tests at `:393` and `:400`) | `expect(stripped).toMatch(/import\s*\{\s*preserveRunnerSymlinksPlugin\s*\}…/)`; `expect(stripped).toContain('preserveRunnerSymlinksPlugin()')` | **NO CHANGE** |
| 3 | Executing release-workflow prune | `src/backend/__tests__/releaseWorkflow.test.ts` — `PRUNE_STEP_NAME` const at `:433`; describe `:436-549`; `seedBuildTree` `:442`; the six tests at `:479`, `:488`, `:506`, `:524`, `:533`, `:541`. `:506` asserts `build/index.html` survives; `:524` asserts the step **fails** when it does not | **NO CHANGE** — `build/index.html` still exists under B+ |
| 4 | Release-job hard guard | `.github/workflows/release-tauri.yml:418-427`. Full step body: `rm -rf build/main build/preload build/node-dist` (`:423`), `rm -f build/sea-config.json build/sidecar-prep.blob` (`:424`), `test -f build/index.html` (`:425`), `if [ "$IS_MACOS" = "true" ]; then test -d build/bin; fi` (`:426-428`) | **ADD ONE LINE**, change none: append `test -f build/renderer/index.html` after `:425`. See below |
| 5 | `emptyOutDir: false` rationale | `vite.config.ts:112` (value), `:106-111` (the comment) | **NO CHANGE — and the comment's premise still holds.** See below |

**On #4 — I read the whole step, as instructed.** Two findings.
(i) The prune deletes exactly the five non-frontend intermediates; **none of them is anything
`build/renderer` needs**, so it cannot eat the new tree. (ii) It does **not** fail to delete
anything newly dead — `build/main` and `build/preload` are already in its list. **But** the
step's `test -f build/index.html` guard becomes a guard over a directory that is **no longer
the embed root**. It would keep passing while `build/renderer` was empty. That is a
fail-open of exactly the shape recorded in
`fixing-a-fail-open-gate-can-create-its-sibling.md` — the key must be re-derived, not
inherited. **Adding `test -f build/renderer/index.html` is mandatory; it is the only change to
this file and it is additive.** Mirror it in `releaseWorkflow.test.ts` by extending
`seedBuildTree` (`:442`) to create `build/renderer/index.html`, adding it to the "kept" list
at `:506`, and adding a seventh test that removes it and asserts a non-zero exit — otherwise
the new guard is untested and could be a no-op typo.

**On #5 — `emptyOutDir` stays `false`, and the a2w comment's premise SURVIVES.** The comment
at `vite.config.ts:106-111` says `emptyOutDir` must stay false because `build/` also holds
`bin/`, `locales/`, the SEA prep blob and the sidecar output. Under B+ **that is still exactly
true** — `outDir` is still `build`, and emptying it would still destroy all of those. The
19.5 MB stale-`assets` problem (§1c) that `emptyOutDir: true` would otherwise be the natural
fix for is solved instead by the assembly step copying only rollup's own emitted keys. **Under
A the comment's premise would collapse** and `emptyOutDir: true` on `build/renderer` would
become correct and necessary — record that as the A-branch delta if the plan deviates.

### Three additional pins the todo's list of five misses

| # | Pin | Location | Breaks under… |
|---|---|---|---|
| 6 | `bundle.resources` **source** prefix | `src/backend/__tests__/packagingConfig.test.ts:133` — ``const fullSource = `../build/bin/${relPath}` `` | any repoint of resource sources to `../public/…`. **Not** under B+ |
| 7 | `frontendDist` prose | `src-tauri/build.rs:3` and `src-tauri/src/main.rs:4` — both say `../build (the electron-vite renderer output)` | nothing (comments) — but both are now doubly wrong (wrong path AND "electron-vite"). Fix as part of this task |
| 8 | Resource **target** shape | `packagingConfig.test.ts:230-236` (`every target subpath begins with "build/"`), `:238-243` (no `..` in targets), `:245-262` (every publicDir asset class carried), `:264-277` (`/main`,`/preload`,`sea-config`,`sidecar-prep` NEVER bundled) | nothing under B+ — targets are unchanged. Listed so the planner can confirm they are green, not assume it |

### Everything else pinning `outDir` / `frontendDist` / `build/` — searched, and clean

*Method:* `grep -rn "frontendDist"` repo-wide (excluding node_modules); `grep -rn "'build'|
\"build\"|/build/|join(.*'build')" meta/*.ts`; `grep -rn "build/" .github/workflows/`;
`python3` scan of every `package.json` script for a `build/` path literal; and the four
ignore-files.

- **No test anywhere asserts `frontendDist === "../build"`.** The only non-comment hits are
  `src-tauri/tauri.conf.json:7` itself and six unrelated spike `tauri.conf.json`s under
  `.claude/skills/` and `.planning/spikes/` (all `"frontendDist": "dist"`, self-contained
  sample apps, untouched).
- `meta/` `build/` literals: `buildDecompressWorkerDev.ts:81,119`, `buildSidecarSea.ts:157,
  161,162,174,275,685,710,739`, `verifyRunnerBundle.ts:237`, plus the three plugin defaults
  already covered. **All are non-renderer output paths.** None breaks.
- `.github/workflows/`: only `release-tauri.yml`. Lines `140`, `163`, `179`, `401-412` are
  comments (`:161-165` explains that `pnpm exec vite build` at `:166-168` is the ONLY producer
  of `build/index.html`); the live lines are `423-427`.
- `package.json` scripts: exactly one `build/` literal —
  `build:sidecar` → `--outfile=build/main/sidecar.js`. Unaffected.
- Ignore files: `.gitignore:12` `/build`, `jest.config.js:15` `<rootDir>/build`,
  `.prettierignore:3` `build`, `eslint.config.mjs:93` `'build/'` — **all cover
  `build/renderer` recursively already.** No change needed.
- `meta/__tests__/viteRendererConfig.test.ts` has a `pluginNames(config)` helper used at
  `:119` and `:126`. The plan **should** add
  `expect(pluginNames(config)).toContain('gamelib-assemble-renderer-dist')` alongside them, so
  a dropped plugin is caught the same way the other two are.

---

## 6. Q5 — `src/backend/constants/paths.ts`: VERDICT — NO CHANGE. Verified, not assumed.

**The resolution, read verbatim** (`paths.ts:80-83`):
```ts
export const publicDir = resolve(
  app.getAppPath(),
  app.isPackaged || process.env.CI === 'e2e' ? 'build' : 'public'
)
```

**Both inputs traced to their sources:**
- `app.getAppPath()` — `src/backend/platform/index.ts:300`:
  `getAppPath: (): string => process.env.GAMELIB_APP_ROOT || process.cwd()`.
  `GAMELIB_APP_ROOT` is set at sidecar spawn time by the Rust shell from
  `app.path().resource_dir()` (`main.rs:6985-6988`), i.e. `Contents/Resources` when packaged.
- `app.isPackaged` — `platform/index.ts:277-279`, a **getter** delegating to
  `isPackagedSidecar()` (the single derivation; the module comment at `:256-276` is emphatic
  that it must not be re-derived).

So packaged → `publicDir = Contents/Resources/build`, which is populated **entirely** by
`bundle.resources` **TARGET** paths (`build/locales`, `build/changelog.json`,
`build/webviewPreload.js`, `build/icon.png`, and each overlay's `build/bin/…`).
`packagingConfig.test.ts:230-236` already pins that every target starts with `build/`.
**`frontendDist` does not participate in this resolution at any point.** The claim is
CONFIRMED, and under B+ the targets do not move, so `paths.ts` needs no change.

**Every `publicDir` consumer swept** (`grep -rn "publicDir" src/ meta/ --include=*.ts
--include=*.tsx`, minus `__tests__`) — nine consumers, all filesystem, none webview:

| Consumer | Location | Reads | Dev-vs-packaged divergence D1/B+ would introduce? |
|---|---|---|---|
| `fakeEpicExePath` | `paths.ts:85-87` | `bin/x64/win32/EpicGamesLauncher.exe` | none |
| `galaxyCommunicationExePath` | `paths.ts:89-91` | `bin/x64/win32/GalaxyCommunication.exe` | none |
| `builtBridgeShimPath` | `paths.ts:103-105` | `bin/{arch}/darwin/steam_api.dll` | none |
| `steamBridgeHelperPath` | `paths.ts:117-119` | `bin/{arch}/darwin/steam-bridge-helper` | none |
| `webviewPreloadPath` | `paths.ts:121-123` | `file://…/webviewPreload.js` | none |
| `windowIcon` | `paths.ts:137` | `icon.png` | none |
| runner resolution | `utils.ts:555-595` | `bin/{arch}/{platform}/…` | none |
| changelog | `utils.ts:893` | `changelog.json` | none |
| vulkan helper | `utils/graphics/vulkan/index.ts:7` | `bin/{arch}/{platform}/vulkan-helper` | none |
| CrossOver snapshot | `crossover_index/fetcher.ts:52` + `index.ts:20` | `crossover-index.json.gz` | **none from this task — but see below** |
| sidecar i18n | `sidecar/bootstrap.ts:472,490-502` | `locales/{lng}/{ns}.json` | **none** — but this is the second, filesystem-side locales consumer; see §3's "required duplications" |

**Incidental, pre-existing, NOT this task's problem — record it, don't fix it.**
`crossover_index/index.ts:20` declares `bundledPath: 'crossover-index.json.gz'` and
`fetcher.ts:52` reads `join(publicDir, 'crossover-index.json.gz')`. That file exists in
**neither** `public/` nor `build/` (`ls` on both: No such file), and **no
`bundle.resources` entry carries it** — it is produced only by the
`build-crossover-index` workflow into a GitHub release. The bundled-fallback path is
therefore already dead in every artifact. Independent of this task, unaffected by it, and it
should be its own todo rather than scope creep here.

---

## 7. Q6 — build and live-verification mechanics

### 7a. There is no `tauri:build` script — CONFIRMED

`package.json` scripts (read via `python3 -c "json.load(...)"`):
```
tauri:dev           : pnpm build:sidecar && pnpm build:decompress-worker-dev && tauri dev
tauri:dev:packaged  : pnpm exec vite build && pnpm build:sidecar && pnpm build:decompress-worker-dev && tauri build --debug
build:sidecar-sea   : pnpm build:sidecar && node meta/runTs.cjs … meta/buildSidecarSea.ts
```
No `tauri:build`. The release-build command previous runs used, reconstructed from
`260901-8rm-MEASUREMENTS.md`'s release section:
```bash
pnpm exec vite build
pnpm build:sidecar-sea
pnpm exec tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

**The updater-signing situation is UNCHANGED — verified this session:**
- `echo "${TAURI_SIGNING_PRIVATE_KEY:-<unset>}"` → `<unset>`
- `ls -la ~/.tauri/` → `gamelib-updater-v2.key` (348 B, Jul 25) present, password-protected,
  password unavailable
- `src-tauri/tauri.conf.json:47` → `"createUpdaterArtifacts": true`

So the `--config` **command-line** override is still required, and it must stay a
command-line override — **never a repo edit**. This is also the mechanism behind the
`criterion-17-blocked-by-updater-signing-key` memory record.

**Never use plain `pnpm tauri:dev` for any of this.** `vite.config.ts:11-27` spells out why:
`tauri:dev` serves over `devUrl` (`http://localhost:5173`) and resolves **no** bundled static
asset, so it is structurally blind to every failure this task can cause. And per
`tauri-dev-noops-against-a-running-instance.md`, it can exit 0 without replacing a running
instance.

### 7b. Artifact inspection — the procedure, confirmed from the 8rm doc

Tauri deletes the intermediate `.app` when `dmg` (not `app`) is the requested target, so
inspect by mounting:
```bash
hdiutil attach -nobrowse -readonly src-tauri/target/release/bundle/dmg/GameLib_0.7.0_aarch64.dmg
#   -> /Volumes/GameLib/GameLib.app
size -m /Volumes/GameLib/GameLib.app/Contents/MacOS/gamelib-shell | grep -A1 __TEXT
strings /Volumes/GameLib/GameLib.app/Contents/MacOS/gamelib-shell | grep -c 'bin/x64/win32/gogdl.exe'
hdiutil detach /Volumes/GameLib
```
Two `__const` sections exist; the one this gate tracks is **`__TEXT,__const`**, not
`__DATA_CONST,__const` (944,424 B). The 8rm doc is explicit on this.

**Baselines, matched to their build kind — do not cross them:**

| | `--debug` (`tauri:dev:packaged`) | release |
|---|---:|---:|
| `__TEXT,__const` | 235,074,112 | 223,766,872 |
| `__TEXT,__text` | 19,375,224 | 5,856,736 |
| `strings … grep -c gogdl.exe` | 1 | 1 |
| `tauri-codegen-assets` staging dir | 250 MB | — |

**Success criteria 1 & 2:** `__const < ~30,000,000` and the gogdl `strings` count `== 0`.
Predicted under B+: `__const ≈ 4.9 MB` (§2). A **third, cheap, highly diagnostic** signal the
plan should also capture: the `tauri-codegen-assets` staging directory should fall from
~250 MB to ~10 MB — locate it as the newest-mtime
`src-tauri/target/{release,debug}/build/gamelib-shell-*/out/tauri-codegen-assets`.

**Measurement discipline (this task has already produced two retracted rationales):** compare
**OLD SHIPPED vs NEW SHIPPED** only. Never `repo build/ − shipped`. Use apparent bytes
(`stat -f %z` summed / `lstat().st_size`), never `du`. Before explaining any miss, re-check
the subtraction is between the two things you meant to compare.

### 7c. Success criterion 3 — a non-English locale renders. **HUMAN GESTURE. Concrete recipe.**

The locale is read at `src/frontend/index.tsx:125-128`:
```ts
const languageCode: string =
  configStore.get_nodefault('language') ?? storage.getItem('language') ?? 'en'
```
`configStore` is `TypeCheckedStoreFrontend('configStore', …)`
(`src/frontend/helpers/electronStores.ts:120`), backed by
`TypeCheckedStoreBackend('configStore', { cwd: 'store' })`
(`src/backend/constants/key_value_stores.ts:3-5`). **Located on disk and read this session:**
`~/Library/Application Support/gamelib/store/config.json`, whose top-level keys are
`['window-props','userHome','language','settings','games','theme','zoomPercent',
'disableAnimations']` and whose `language` is currently `'en'`.

**Gesture (deterministic, no console required):**
1. Quit any running GameLib. Back up the store:
   `cp ~/Library/Application\ Support/gamelib/store/config.json /tmp/gamelib-config.bak`
2. Set the language:
   `python3 -c "import json,pathlib; p=pathlib.Path.home()/'Library/Application Support/gamelib/store/config.json'; d=json.loads(p.read_text()); d['language']='fr'; p.write_text(json.dumps(d,indent=2))"`
3. Mount the DMG, drag `GameLib.app` to `/Applications` (or launch straight from the mounted
   volume), and open it.
4. **Observe:** the sidebar / library chrome is in **French**. `public/locales/fr/` exists and
   holds `gamelib.json`, `gamepage.json`, `login.json`, `translation.json` (verified by `ls`).
5. **The anti-vacuity half, which is the part that actually proves the fix:** a missing
   `locales/` does **not** blank the UI — i18next falls back to the key or to `fallbackLng:
   'en'` (`index.tsx:150`). So "the app opened" proves nothing. The gate is *"French text
   appears where English was"*. Independently corroborate with the **Web Inspector Network
   tab** (open it **before** step 3's launch): a request to
   `tauri://localhost/locales/fr/translation.json` returning **200**, not 404.
6. Restore: `cp /tmp/gamelib-config.bak ~/Library/Application\ Support/gamelib/store/config.json`

Note the two memory constraints: the Tauri DevTools console **cannot be pasted into**
(`tauri-devtools-console-paste-unusable.md`) and a wedged Web Inspector console executes
nothing (`driving-the-tauri-web-inspector-console.md` — run a side-effect control first). The
recipe above deliberately needs **no console input at all** — it drives everything from the
filesystem and reads the Network tab. That is why it is preferred over an in-page
`i18next.changeLanguage()` call.

**A `--debug` packaged artifact is sufficient for this gesture** — the renderer fetches
locales from `frontendDist` over `tauri://`, so the sidecar's identity (which under `--debug`
is `node build/main/sidecar.js`, per `tauri-dev-packaged-ships-a-stale-sea-sidecar.md`) is
irrelevant here.

### 7d. Success criterion 4 — the About window opens **with its icon**. **HUMAN GESTURE.**

**There is no renderer UI button.** `grep -rn "showAboutWindow" src/frontend` returns
**zero**. The only trigger is the **tray menu item**: `src-tauri/src/main.rs:634`
`MenuItemBuilder::with_id("about", "About GameLib")`, handled by
`open_about_window_from_tray` (`main.rs:722-732`) which does
`window.eval("window.api?.showAboutWindow?.()")` → `src/preload/api/helpers.ts:14` →
`tauriShowAboutWindow` → `showAboutWindowAsync` (`tauriChildWindows.ts:167-191`).

**Gesture:**
1. With the packaged app running, click the **menu-bar tray icon** → **"About GameLib"**.
2. **Observe THREE things, and score them separately** — a window that opens is not a pass:
   - a 420×380 window titled **"About GameLib"** appears (proves `about.html` resolved; a 404
     yields an empty/error webview, not no window);
   - the **GameLib icon renders at the top** (proves `icon.png` resolved from the
     frontendDist root — *this is the consumer the todo missed, so it is the highest-value
     observation in the whole gate*);
   - the version line reads `Version: 0.7.0`, not `Version: unknown`. **This third one is
     informational only** — `resolveAboutVersion` (`tauriChildWindows.ts:157-165`) races
     `getHeroicVersion()` against a 1 s timeout (`ABOUT_VERSION_TIMEOUT_MS`,
     `:154`) and resolves `'unknown'` on timeout, so `unknown` on a `--debug` artifact
     indicates a slow sidecar, **not** a frontendDist failure. Do not let it fail the gate.
3. Corroborate in the Web Inspector Network tab for the **`about` window's** webview:
   `tauri://localhost/about.html?v=0.7.0` → 200 and `tauri://localhost/icon.png` → 200.

**Both gestures require the human.** State that plainly in the plan. Exactly what they must
do: (a) edit one JSON key, launch, read the sidebar language, restore the key; (b) click the
tray icon, choose "About GameLib", confirm window + icon. Nothing else.

### 7e. Wall-clock budget — ESTIMATE, labelled

`src-tauri/target/release` is 5.2 G and `src-tauri/target/debug` is 80 G (`du -sh`), so both
dependency graphs are warm and only `gamelib-shell` itself recompiles.

| Step | Estimate | Basis |
|---|---|---|
| `pnpm exec vite build` | 60–120 s | 263 modules→78 chunks; **LOW confidence — not timed this session** |
| `pnpm build:sidecar-sea` | 60–180 s | downloads/reuses a ~58 MB Node dist (`buildSidecarSea.ts:275`); cache state unknown |
| `tauri build` (warm target) | 4–10 min | shell crate recompile + codegen embed + DMG creation |
| **total, release** | **~7–14 min** | |

**The embed step should get materially faster** — brotli over ~10 MB instead of ~420 MB. If
it does not, that is itself evidence the assembly did not take effect and is worth treating
as a signal.

Budget **two** full builds: one before (to re-baseline `__const` on the *current* tree —
important, because the 223,766,872 figure predates the a2w prune, §1a) and one after. If
budget is tight, a single `tauri:dev:packaged` before/after pair against the 235,074,112
debug baseline is a valid, cheaper substitute — **but the two builds must be the same kind.**

---

## 8. Open questions / unknowns for the planner — explicitly labelled

1. **UNKNOWN — exact `vite build` and `tauri build` wall-clock on this machine.** Not timed
   this session. §7e is an estimate with LOW confidence. If the plan has a hard time budget,
   time `pnpm exec vite build` once first.

2. **UNKNOWN — whether rollup's `generateBundle` keys are the complete emitted set for THIS
   config.** I am confident they are (vite emits `index.html` through `generateBundle`, and
   publicDir files are copied outside rollup so they are correctly absent), but I did not
   execute a build to print `Object.keys(bundle)`. **Cheapest de-risk: the plan's first task
   should be a throwaway plugin that logs `Object.keys(bundle)` during one `pnpm exec vite
   build` and compares it against the 78-file closure computed in §1c.** If they disagree,
   the whole B+ mechanism needs rethinking, and finding that out in 90 seconds is worth it.

3. **UNKNOWN — whether `tauri build` errors or warns if `frontendDist` resolves to a
   directory containing only `index.html` and nothing else.** Not tested. Expected to be
   fine, but the assembly plugin's own fail-loud post-condition (§3) makes this moot in
   practice.

4. **RESIDUAL — the census (§2) is static.** It cannot see a URL assembled at runtime from
   fragments that never appear as one literal. Sweeps 2 and 8 found no evidence of one and no
   plausible site for one. The honest statement is *"no evidence"*, not *"impossible"*. The
   Network-tab observation in §7c/§7d is what closes it.

5. **DECISION FOR THE PLANNER — `manifest.json` + `robots.txt` (333 B combined).** Proven
   unreferenced (§2 sweeps 4 and 7). Excluding them is correct; including them is harmless.
   Pick one and write down which, so a future reader does not read the absence as an
   oversight. My recommendation: exclude, with a one-line comment in the assembly plugin
   naming them as vestigial CRA/PWA scaffold.

6. **DECISION FOR THE PLANNER — delete the dead `addPath` at `src/frontend/index.tsx:115`?**
   Proven inert (§2 sweep 9). Deleting it is a zero-behaviour-change edit that removes a
   `build/…`-prefixed string which would be actively wrong under the new layout. Slight scope
   creep; I recommend doing it *with a comment*, because leaving a wrong-looking path in the
   i18n config right next to the one path this whole task is about is a trap for the next
   reader.

7. **OUT OF SCOPE, LOGGED, DO NOT FIX HERE:** (a) `crossover-index.json.gz` is referenced by
   `crossover_index/fetcher.ts:52` but exists in neither `public/` nor `build/` nor
   `bundle.resources` — the bundled-fallback path is already dead in every artifact (§6);
   (b) `check:build-bin-mirror` is invoked by nothing — no CI job, no husky hook (§4b);
   (c) `build/` root carries stale `icon-dark*.png` / `icon-light*.png` (15 files, 55,592 B)
   that no longer exist in `public/` — the a2w prune covered `build/bin` only. Each deserves
   its own todo.

8. **NOT A DEFECT IN THE SETTLED ARITHMETIC, but the planner should know it:** D2 would have
   passed the `< 30,000,000` criterion in **CI** (~15.8 MB) because the release workflow
   already prunes `build/main`, `build/preload` and `sidecar-prep.blob` before tauri-action
   reads `frontendDist` (§1a). It fails on the **local** artifact the todo's proof method
   mandates (~48.7 MB). That split makes D2 unprovable by the prescribed method and is an
   additional argument for D1/B+, not a reason to revisit the choice.
