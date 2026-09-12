# gog-logo.svg centring — live re-measure, 2026-09-12

Closes `.planning/todos/pending/2026-09-12-gog-logo-live-remeasure-humble-keys-and-gamepage-owed.md`.

## Build identity (the staleness question, answered before measuring)

| | |
|---|---|
| app | `/private/tmp/gamelib-gate-20260912T164819Z/GameLib.app` (release, from DMG, built 09:49) |
| binary sha256 | `e7bbeb6641d50219aa90ea8076a04ef6e60d20b82cf26cb2f30d378cbf75c3b5` — re-hashed live, matches the build record in `terminal.log` |
| source sha | `16ec08de3` |
| carries the fix | `d0a6a3a45` (asset flattened), `e2b6f5980` (GamePage override deleted), `39e1e62bb` (Runner override deleted) — all three confirmed ancestors of `16ec08de3` |
| repo HEAD | `2b3d3d05f`, **10 commits ahead of the build** |

The 10 post-build commits were checked against this measurement: `git diff 16ec08de3..HEAD` touches
**none** of `gog-logo.svg`, `GamePage/index.css`, `Runner/index.css`, `Humble/Keys/index.css`, and
redefines **none** of `--text-md`, `--space-2xs`, `--space-3xs`,
`--humble-key-row-title-line-height`. `Login/index.scss` and `themes.scss` did change, but only
font-family and colour tokens — no geometry. The build is therefore valid for this measurement and
no rebuild was taken.

**Bundle-grep verification is NOT available on this app** and must not be attempted: `grep -ra` over
`GameLib.app` finds nothing, *including a positive control* (`gogIcon`), because the frontend bundle
is compressed into the Tauri binary. A "no old markers found" result there is vacuous.

## Method

Devtools is unreachable in a release build (`open_devtools()` is `#[cfg(debug_assertions)]`-only), AX
reports no windows for this app, and no Python on this machine has pyobjc. So: window geometry via a
compiled Swift `CGWindowListCopyWindowInfo` helper, capture via
`screencapture -x -o -l <windowid>` (**`-o` is required** — the shadowed capture is 2696×1736 and
destroys the scale), decode + measure via a pure-Python PNG decoder (no PIL on this machine).

Window `1280×800` pt → capture `2560×1600` px, **SCALE 2.0 exact**. CSS px = device px ÷ 2.

## Prediction, fixed before looking at the app

Old and new assets rendered into an *identical* 384px square viewport (the live embedding: fixed
square box, default `preserveAspectRatio`):

| | ink | TOP gap | BOTTOM gap | centroid offset |
|---|---|---|---|---|
| OLD (`xMidYMax`, bottom-flush) | 384×351 | 33 | 0 | **+1.726 device** |
| NEW (`xMidYMid`, centred) | 384×350 | 17 | 17 | **+0.032 device** |

Scaled to the live 38.4px Humble box: old = 3.30/0.00, new = 1.70/1.70.

## Surface 1 — Humble Keys row (`.humbleKeyRowStoreLogo`, 19.2 CSS box)

The screen carries exactly **one** GOG row: "Racine" (`platform: gog_keyless` →
`keyTypePresentation.ts:89` → `'gog'`). Steam rows are the control — `steam-logo.svg`'s 496:512
viewBox fills the box vertically, so Steam's ink top/bottom *are* the box edges.

The box is not painted, so centring is measured as an intensity-weighted **centroid** offset from
each row's separator, GOG vs the mean of three Steam rows.

| theme | Steam ink | GOG ink | GOG − Steam(mean) |
|---|---|---|---|
| nord-light | 19.0 × 19.0 CSS (×3 rows) | 19.0 × 18.0 CSS | **−0.088 device (−0.044 CSS)** |
| nord-dark | 19.0 × 19.0 CSS (×3 rows) | 19.0 × 18.0 CSS | **+0.415 device (+0.208 CSS)** |

against **+0.032 predicted for centred** and **+1.726 for bottom-flush**. Both themes land on the
centred prediction; neither is within 1.3 device px of bottom-flush. **PASS.**

Stability: sweeping the ink threshold 16/28/40 moves the light-theme offset by 0.002 device
(−0.091 → −0.093). Steam's own row-to-row spread is 1.499 device, so the honest uncertainty on the
Steam mean is ≈±0.43 — the dark-theme +0.415 sits inside ~1σ of centred and ~3σ from bottom-flush.

**Correction to the todo's stated expectation.** It predicted GOG ink "19.2 × 17.5 CSS". Measured is
**19.0 × 18.0** at thresholds 16–40 (17.5 only appears at threshold ≥60). Width is 19.0 not 19.2
because the ink fills 38 of the box's 38.4 device px. Extent is threshold-dependent and is *not* the
discriminator here; the centroid is, and it is threshold-stable.

## Surface 2 — GamePage store-icon row (`.store-icon > svg`, 46 CSS box)

Here the svg carries `background-color` + `border-radius`, so the **box itself is painted and
directly measurable** — no proxy needed. Alan Wake (GOG) vs 7 Days to Die (Steam); there is only one
store icon per GamePage, so the neighbour comparison is necessarily cross-page.

| case | box | glyph | TOP/BOT | asymmetry |
|---|---|---|---|---|
| GOG nord-light | 268..359 = 92 device (**46.0 CSS**) | 31.0 CSS | 15/15 | **+0.00 CSS** |
| STEAM nord-light | 268..359 = 92 device (**46.0 CSS**) | 33.0 CSS | 13/13 | **+0.00 CSS** |
| GOG nord-dark | 268..359 = 92 device (**46.0 CSS**) | 31.0 CSS | 15/15 | **+0.00 CSS** |
| STEAM nord-dark | 268..359 = 92 device (**46.0 CSS**) | 33.0 CSS | 13/13 | **+0.00 CSS** |

GOG's box is identical to Steam's to the device pixel, in both themes, and its glyph is
symmetrically inset. The deleted `&.gogIcon` override would have produced roughly **+6 device
(+3.0 CSS)** of asymmetry. GOG's glyph being 31.0 CSS vs Steam's 33.0 is the 34:31 vs 496:512 brand
aspect, not a size defect. **PASS.**

## Surface 3 — Login runner tile: resolved by code-read, not measurable live

`Login/index.tsx:302` passes `icon={() => <GOGLogo />}` (imported `?react`), rendered at
`Runner/index.tsx:124` as `<div className={'runnerIcon ' + props.class}>{props.icon()}</div>`. Every
one of the six tiles is an inlined SVG component; **no `<img>` element has ever existed under
`.runnerIcon.gog`**, so the deleted `.runnerIcon.gog img { margin-top: -1px }` rule matched nothing.
The static reading in the todo is confirmed.

A live capture cannot improve on this: "pixel-identical before and after" is a counterfactual that
would need a second release build of `39e1e62bb^`. Recorded as resolved-by-code-read, **not** as a
live PASS.

## Traps hit during this run (all self-caught; each produced a plausible wrong answer first)

1. **Bundle grep proved nothing** — no hits even for the positive control; assets are compressed
   into the binary.
2. **"No GOG rows in Humble"** — my own bug: I counted `store`/`key_type`, but the schema field is
   `platform`. There is one GOG row.
3. **"Theme is persisted nowhere"** — my census globbed `*.json` and `store_cache/*.json` and missed
   `store/config.json`, which holds `theme: nord-light`. The operator corrected this.
4. **Half-max edge estimator** returned Steam at 17.29 CSS when Steam demonstrably fills its 19.0 box
   — invalid for circular/rounded glyphs, whose extreme rows carry little ink. Discarded.
5. **Colour-similarity box detection** reported a 64.0 CSS box in dark theme: Alan Wake's art is
   within tolerance of the dark `--body-background`. Gradient/step detection was required.
6. **Single-seed step walk** stopped at the *glyph* edge, not the box edge, yielding an empty glyph
   range. Two seed rows (272 in the top padding, 350 in the bottom) are required.
7. **JXA `CGWindowListCopyWindowInfo` is unusable here** — `deepUnwrap` fails and `info.count`
   returns `undefined`, i.e. it fails *silently and negatively*. A compiled Swift helper works. AX
   independently reports zero windows for this app.

## Session notes

- An orphaned dev sidecar (pid 86196, alive since 2026-09-11 02:41) was writing into the same
  `gamelib.log` as the gate app — killed before measuring. Quitting the packaged app then re-orphans
  *its own* sidecar (pid 31779 survived its parent); killed too.
- The relaunch raised a `login` keychain prompt for `com.gamelib.launcher`. It was left unanswered
  and **timed out after 45 s** (`keyring_get failed: keyring:timeout`, memoized 120 s). This does not
  affect either surface: `humble.isLoggedIn` resolves from the persisted
  `humble_store/config.json` flag (`true`), not from the keyring, so the `D-20` route guard never
  fires.
- Theme was switched nord-light → nord-dark → **restored to nord-light** (verified in
  `store/config.json` and on screen).
