---
created: 2026-09-20
title: "--dialog-margin-horizontal is declared on a bare .Dialog class that no element ever carries"
area: ui-dialogs
severity: medium
platform: any
ready: code
source: "quick-260921-nub, surfaced while measuring the .Dialog__content/.Dialog__headerTitle census"
files:
  - src/frontend/components/UI/Dialog/index.css
  - src/frontend/components/UI/Dialog/components/Dialog.tsx
  - src/frontend/screens/Library/components/InstallModal/index.scss
  - src/frontend/components/UI/Winetricks/index.scss
---

# `.Dialog` (bare) is never applied to any element — its one surviving token likely resolves nowhere

## Measured facts

`Dialog/index.css` declares `--dialog-margin-horizontal` on `.Dialog`, but **no element in `src/`
is ever given the bare class `Dialog`**: `Dialog.tsx` does not add it, and all ~25 consumers pass a
different literal through `PaperProps={{ className }}` (`notLoggedIn`, `uninstall-modal`,
`AboutDialog`, `InstallModal__dialog`, `errorDialog`, `progressDialog`, `ModifyInstall__dialog`).

So the token is declared in a scope that matches nothing, and its two external references resolve
to nothing at runtime:

- `InstallModal/index.scss:27` — `margin: var(--space-md) var(--dialog-margin-horizontal) 0` on
  the anticheat banner
- `Winetricks/index.scss:3` — `margin: 0 var(--dialog-margin-horizontal)` on the installWrapper

Both are non-inherited `margin` shorthands referencing the undefined token, but they do not fail
identically:

- `InstallModal/index.scss:27`'s shorthand covers all four sides of `.anticheatInfo` in one
  declaration. Because the token is undefined, the WHOLE declaration is invalid at computed-value
  time, so **all four margins** — top, right, bottom, and left — fall back to `0px`, not just the
  horizontal pair the shorthand names.
- `Winetricks/index.scss`'s `.installWrapper` keeps its `16px` top/bottom margins, because
  `margin-block: 1rem` is a SEPARATE declaration from the invalid
  `margin: 0 var(--dialog-margin-horizontal)` shorthand and survives the shorthand's invalidation
  independently. Only its inline (left/right) margins collapse to `0px`.

## Why the gate stays green

This is `cssTokenSweep.test.ts`'s own documented **blind spot B** ("this gate checks NAMES, not
SCOPES"), the same class as its worked `--search-bar-border` example. The gate is green and will
stay green — it can prove every `var(--x)` names something declared somewhere, but it cannot prove
the declaration's selector ever matches an element. The declaration must NOT be deleted to "fix"
this, because deleting it turns the gate red for the two references above
(`cssTokenSweep.test.ts`'s `ALLOWLIST` is `[]`).

## Measured live under WKWebView

2026-09-21, quick 260921-pec — measured live in a real browser engine, not inferred from source.
Evidence: `.planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults.json`.

**Method:** a compiled Swift harness loaded the app's real Vite-served frontend
(`http://localhost:5173/`) into a real off-screen `WKWebView` — the same engine GameLib ships —
and evaluated a probe against it via `callAsyncJavaScript`. The app booted properly in that
harness: 143 stylesheets loaded, `bodyClass: midnightMirage`, `window.api` present.

**Margins, as shipped vs. under a `.Dialog` ancestor (positive control):**

| element | as shipped | under `.Dialog` ancestor (positive control) |
| --- | --- | --- |
| `.anticheatInfo` | `0px` top/right/bottom/left | `16px` top, `32px` right, `0px` bottom, `32px` left |
| `.installWrapper` | `16px` top/bottom, `0px` left/right | `16px` top/bottom, `32px` left/right |

**Token resolution:** `tokenAtRoot` and `tokenAtBody` both read `""` after the full
143-stylesheet boot. The same getter read `sanity_spaceMd` as `1em`, so the blank reading means
the token is genuinely undefined anywhere reachable in the cascade — not that the probe itself is
broken.

**Scope limit, stated plainly:** this measured CSS cascade resolution and selector parsing in
WebKit against the app's real stylesheets. It did NOT use the running app's own webview instance,
its React tree, or emotion's runtime-injected styles. For this question — does a custom property
declared on an unmatched selector resolve through the cascade? — that scope is sufficient: the
question is purely about cascade resolution, and it is now settled.

**Contamination warning:** the evidence JSON's `elementsCarryingBareDialogClass: 2` is NOT a
finding about the shipped app. It is an artifact of the probe itself, which injected exactly two
`.Dialog` wrapper elements as positive controls BEFORE counting, specifically so the "under a
`.Dialog` ancestor" column above would have something to measure against. Do not read that field
as evidence that any shipped element carries the bare `.Dialog` class — per `## Measured facts`
above, none does.

## Severity and readiness reasoning

`severity: medium`: this is a real defect with a live consequence on two surfaces —
`.anticheatInfo` loses all four margins and `.installWrapper` loses its two inline margins,
instead of the intended `32px` on each — now MEASURED rather than inferred. The blast radius is
unchanged: bounded to the same two `margin` declarations, not a `minor` polish item, but not
`major` either since neither surface is broken, just unmargined.

`ready: code`: the live question — what does the browser actually do with this undefined token? —
is now measured above, not merely inferred from source. Nothing further needs a live run to score.
What remains is a DECISION about where the token should live (re-scope it to a class that is
actually applied, move the declaration to `:root`, or repoint the two consumers to a token that
resolves) plus the edit itself — desk work against a known, measured cascade outcome, not a live
gate.

## Not fixed here

Quick task `260921-nub` kept the declaration exactly as it was (see the in-situ comment above it in
`Dialog/index.css`) and did not attempt a remedy. Quick task `260921-pec` measured the live
cascade behaviour and re-triaged this file; it did not attempt a remedy either — no file under
`src/` or `src-tauri/` is touched by that task.
