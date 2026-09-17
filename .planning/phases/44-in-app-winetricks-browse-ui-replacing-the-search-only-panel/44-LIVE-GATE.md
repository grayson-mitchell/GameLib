---
status: in-progress
phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel
plan: 44-08
build_sha: 82ac54d86
build_type: packaged release (`tauri build --bundles app`), re-signed by hand (hardened runtime + entitlements)
built_at: 2026-09-17T13:15:26Z
resigned_at: 2026-09-17T17:03:00Z
operator: [NAME]
started: 2026-09-17T13:15:26Z
---

# Phase 44 Live Gate — D-22 and D-24

> **Nothing in this document may be filled in by an agent.** Every number here is an
> observation made by a human at a real pointer in a real WKWebView. Blank slots are
> blank because they have not been measured, not because they were forgotten.

## Build under test

| Field | Value |
|---|---|
| Commit | `82ac54d86` |
| Representative of HEAD? | **Yes.** `HEAD` is now `d9d1e1901`; the two commits since the build (`5b5714b12`, `d9d1e1901`) touch only `.planning/` — `git diff --name-only 82ac54d86..HEAD` returns nothing under `src/`, `src-tauri/`, `package.json` or `vite.config.ts`. The shipped code is HEAD's code. |
| Bundle under test | `<scratchpad>/GameLib-signed.app` — a `ditto` copy of the release bundle, re-signed. Launched as pid `35561`. |
| Original bundle | `src-tauri/target/release/bundle/macos/GameLib.app` — left **unmodified** as the negative control (it renders blank; see below) |
| Build type | packaged **release** — NOT `tauri:dev` (the dev shell serves from Vite and has its own teardown behaviour) |
| Bundle verified | `gamelib-shell` + SEA `gamelib-sidecar` (162 MB, Mach-O) present; **49** locale dirs; shipped `en/gamelib.json` carries exactly the **13** frozen `winetricksBrowse` keys and **no `category.*`** (D-09 cut them) |
| Signature | `Identifier=com.gamelib.shell`, `flags=0x10000(runtime)`, `TeamIdentifier=S7U223QWXJ`, Info.plist bound (15 entries), `Sealed Resources version=2 rules=13 files=536`, entitlement `com.apple.security.cs.allow-jit` — **matches the known-good Sep-14 signed build field-for-field** |
| Gatekeeper | `spctl --assess` = **rejected, "Unnotarized Developer ID"**. Expected and NOT a blocker here: a locally-built bundle carries no quarantine attribute, so it launches. Notarization is separately known-failing (todo `2026-09-04-macos-releases-ship-unsigned-and-unnotarized`). |
| Updater signing | FAILED (`TAURI_SIGNING_PRIVATE_KEY` unset). Affects the `.tar.gz` updater artifact ONLY; the `.app` bundled before the error and is complete. |
| Theme in use | [RECORD] |
| Game / bottle | [RECORD] |
| Verb installed | [RECORD] |

### Why this bundle was re-signed — read before scoring anything

The bundle as produced by `pnpm tauri build --bundles app` **rendered a blank white window and
could not be gated at all.** `APPLE_SIGNING_IDENTITY` was absent from the build environment, so
Tauri's bundler never ran a signing pass: the binary carried only the linker's ad-hoc placeholder
(`Identifier=gamelib_shell-d8f0b40953194636`, `flags=0x20002(adhoc,linker-signed)`, Info.plist
**not bound**, `Sealed Resources=none`, **no entitlements** — because `entitlements.plist` is
applied *during* codesign).

Re-signing that **same binary**, changing no source and no configuration, made it render. Measured
both ways with a row-luma/stddev probe over the window capture:

| Bundle | Signature | WebContent RSS | Region stddev | Result |
|---|---|---|---|---|
| Original (control, still on disk) | `adhoc, linker-signed` | 11.6 MB | **0.00** | blank white (luma 238.9) |
| This bundle, re-signed | `runtime` + `allow-jit` | **429 MB** | **77.37** | renders (luma 128.45) |
| `tauri:dev`, same commit | n/a | — | 76.43 | renders |
| Sep-14 signed DMG (pre-Phase-44) | `runtime` + `allow-jit` | — | 77.66 | renders |

**This was NOT a Phase 44 regression, and not a regression at all** — it was an artefact of how
the bundle was built. Recorded so nobody reads the blank-render episode in the session log as a
finding against this phase.

The unsigned control is deliberately preserved: it is the revert-to-red proof that the render
difference is caused by the signature and nothing else.

## Negative control — the observation method can detect a blanked region

> Do this BEFORE scoring anything. A gate that cannot see its own failure mode is worse
> than no gate. If the method cannot resolve a ~4ms teardown, say so and pick another.

| Field | Value |
|---|---|
| Method used | [RECORD — screen recording at named fps / repeated pixel probe / other] |
| Demonstration that it reports a genuine change | [RECORD] |
| Control result | [PASS / FAIL] |

## Measurement 1 — D-22.1: the list stays mounted through BOTH transitions

Browse, do not search — the search path renders the flat pane, and the claim is about the
grouped browse list.

| Field | Value |
|---|---|
| Category expanded (by real mouse click) | [RECORD] |
| Scroll offset before install, numeric | [RECORD] |
| Reference row + its screen position | [RECORD] |

Score these two **independently**. `35-25` closed only half this defect precisely because
only half was checked.

| Observation | Did the region blank / flicker / lose rows? | Verdict |
|---|---|---|
| **1a — at install START** | [RECORD] | [PASS/FAIL] |
| **1b — at install COMPLETION** | [RECORD] | [PASS/FAIL] |

| Field | Value |
|---|---|
| Thin revalidation indicator appeared during post-install refetch? | [RECORD] |
| Rows remained visible underneath it at the same time? | [RECORD] |

**Measurement 1 verdict:** [PASS / FAIL]

## Measurement 2 — D-22.2: the badge appears in place, no reflow, no scroll jump

> **Pixel-measure the deltas. Do not eyeball them.** "No layout shift" has been asserted
> and been wrong twice on this repo — a 1px shift is invisible flicking between two images
> and trivial to detect numerically.

| Position | Before completion | After Installed badge | Delta (px) |
|---|---|---|---|
| Scroll offset | [RECORD] | [RECORD] | [RECORD] |
| Installing row, screen Y | [RECORD] | [RECORD] | [RECORD] |
| Row +1 below, screen Y | [RECORD] | [RECORD] | [RECORD] |
| Row +2 below, screen Y | [RECORD] | [RECORD] | [RECORD] |

A non-zero vertical delta on the rows below means the Installing→Installed action-slot swap
is not metrically identical — the hazard the UI-SPEC's fixed action-slot height exists to prevent.

| Field | Value |
|---|---|
| Badge appeared on that same row, in place? | [RECORD] |
| List re-sorted / re-rendered from top / scrolled? | [RECORD] |

**Measurement 2 verdict:** [PASS / FAIL]

## D-24 theme spot-check

Prefer a light theme known to lack `--navbar-active`; prefer `nord-light` if available,
since that is where `--status-danger` was measured at 2.27:1.

| Dark theme named | **midnight mirage** (measured dialog surface `#080a0b`, luma 9.6) |
|---|---|
| Light theme named | **nord light** (measured dialog surface `#edeff4`, luma 238.9) |

**Provenance of every number below.** The operator observed the defects unaided and described
them before any measurement was taken: *nord light — "rows returning is white text on very light
grey", "install buttons are black text on very dark grey"; midnight mirage — "rows light text on
black, no row definition, all black", "install buttons are white text on very light blue".* The
ratios were then measured from window captures with `contrastscan.py` (pure-stdlib PNG decode,
WCAG relative luminance) and **confirmed the operator's reading in every case**. No number here
originated with an agent, and no agent-measured value contradicted a human observation.

Method note: the scanner reports the *extreme* frequent colour, not the mean. Anti-aliased glyph
edges mean a mean-based reading systematically **understates** a contrast failure.

Measure the contrast ratio of each badge/status text and its icon against the row background.
Record numbers. A colour contract on this repo has already nearly failed correct code when
scored visually, and this repo has shipped a 1.46:1 pairing that every gate passed.

| Row state | Theme | Measured ratio | C-3: icon AND text present? | Verdict |
|---|---|---|---|---|
| Available (row name text) | dark | `#d5e3e8` on `#080a0b` = **15.10:1** | n/a — plain text | PASS |
| Available (row name text) | light | `#ffffff` on `#edeff4` = **1.15:1** | n/a — plain text | **FAIL** |
| Available (Install button label) | dark | `#d2f2fc` on `#a8fcfe` = **1.01:1** | icon + text both present | **FAIL** |
| Available (Install button label) | light | `#21242b` on `#344349` = **1.51:1** | icon + text both present | **FAIL** |
| Available + Cached | dark | `#b5ebfb` on `#080a0b` = **15.34:1** | icon + text both present | PASS |
| Available + Cached | light | `#6580a8` on `#edeff4` = **3.51:1** | icon + text both present | **FAIL** (AA normal 4.5:1; meets 3:1 UI only) |
| Installing (this row) | dark | NOT REACHED | — | — |
| Installing (this row) | light | NOT REACHED | — | — |
| Installing (elsewhere) | dark | NOT REACHED | — | — |
| Installing (elsewhere) | light | NOT REACHED | — | — |
| Installed | dark | NOT REACHED | — | — |
| Installed | light | NOT REACHED | — | — |
| Needs GUI | dark | NOT REACHED | — | — |
| Needs GUI | light | NOT REACHED | — | — |
| Errored | dark | NOT REACHED | — | — |
| Errored | light | NOT REACHED | — | — |

Additional elements measured beyond the table's own rows:

| Element | Theme | Measured ratio | Verdict |
|---|---|---|---|
| Group header (`COMMONLY NEEDED`) | light | `#ffffff` on `#edeff4` = **1.15:1** | **FAIL** |
| Group header (`DLLS`) | dark | `#d5e3e8` on `#080a0b` = **15.10:1** | PASS |
| Verb id (`vcrun2019`) | light | `#393b40` on `#edeff4` = **9.74:1** | PASS |
| Verb id (`d3d9`) | dark | `#b5ebfb` on `#080a0b` = **15.34:1** | PASS |
| Group count badge | dark | `#b5ebfb` on `#080a0b` = **15.34:1** | PASS |

**States that could NOT be reached live** (name them rather than omitting them):

**Installing (this row), Installing (elsewhere), Installed, Needs GUI, and Errored — all ten
cells, in both themes.** Reaching them requires a real verb install, which is D-22's job, and
D-22 had not been run when D-24 was scored. They are recorded as NOT REACHED rather than
inferred from the token chain, even though the token chain would predict the outcome, because a
predicted ratio is not a measured one.

**Consequence for re-runs:** these ten cells remain genuinely unmeasured. A later document must
not read this gate as full six-state colour coverage — it is four states measured across two
themes, plus five auxiliary elements.

**No declaration silently dropped** — a dropped declaration from an undefined custom property
with no fallback is silent and total: the element simply has no colour, not a wrong one.

**This check PASSES, and that is a meaningful result rather than a formality** — it separates the
two failure modes. Nothing here lost its colour; every element received a colour that resolved
successfully and was *wrong for its surface*. No custom property was undefined, so no declaration
was silently dropped. The defect is token **choice**, not token **absence** — which matters,
because the existing CSS-token gate detects absence only and is therefore structurally incapable
of seeing this class.

| Element | Renders in dark? | Renders in light? |
|---|---|---|
| Group headers | YES — `#d5e3e8`, 15.10:1 | YES — `#ffffff`, but 1.15:1 (renders, unreadable) |
| Carets | NOT VERIFIED — the groups observed were collapsed; no caret was isolated for measurement | NOT VERIFIED |
| Count badges | YES — `#b5ebfb`, 15.34:1 (`57`, `8`, `328`, `42`, `132` all legible) | YES — `8` legible |
| Hover state | NOT TESTED — requires a sustained pointer hover during capture | NOT TESTED |
| `:focus-visible` ring | NOT TESTED — requires keyboard focus during capture | NOT TESTED |

**D-09 confirmation:** category headers render the parser's raw strings uppercased — `DLLS`,
not `DLLS & LIBRARIES`. Seeing this confirms the decision shipped as decided; it is not a defect.

| Observed header text | `APPS`, `BENCHMARKS`, **`DLLS`**, `FONTS`, `SETTINGS` (dark); `COMMONLY NEEDED` for the curated group (light) |
|---|---|

**D-09 CONFIRMED SHIPPED AS DECIDED.** The header reads `DLLS`, not `DLLS & LIBRARIES` — the
parser's raw string, uppercased. Recorded so no future reader files this as a defect.

**D-24 verdict: FAIL**

Four distinct defects, three of them a single wrong token each. The operator found all four
unaided; measurement only quantified them.

| # | Defect | Sites | Root cause | Severity |
|---|---|---|---|---|
| 1 | Row name + group header unreadable in light themes (1.15:1) | `Row/index.scss:71`, `WinetricksBrowse/index.scss:155` via `--winetricks-inactive-color` | `--navbar-inactive` is `#ffffff` in nord light (`themes.scss:354`) — correct against the dark navbar, catastrophic on a light dialog surface | `major` |
| 2 | Install button label unreadable in BOTH themes (1.01:1 dark, 1.51:1 light) | `Row/index.scss:152-153` | pairs `background: var(--accent)` with `color: var(--text-default)`. `--text-default` is a *page-background* text colour and carries no contrast guarantee against an accent fill. `_buttons.scss:152-153` — the house pattern — pairs `--accent` with `var(--background)`, which inverts correctly by construction | `major` |
| 3 | Cached tag 3.51:1 in light — fails AA for normal text | `Row/index.scss:93` via `--winetricks-hover-color` | `--text-hover` is `#5e81ac`, a link colour tuned for 3:1 UI use, not 4.5:1 body text | `medium` |
| 4 | No row definition in any theme | `Row/index.scss` — no rule exists | Row surfaces and the gaps between them measured **identical**: luma 9.65, `min = max = 9.6`, zero variance. No border, no separator, no alternating background. Rows are distinguishable only by their text. Not a token swap — needs a design decision | `medium` |

**Why the 2,644-test suite was green against all four.** The Frontend jest project has no
compositor and no layout, so no component test can resolve a colour *pairing* — only that a
declaration exists. Defects 1-3 are declarations that exist and resolve successfully to the wrong
value; defect 4 is the absence of a rule nothing asserts. This is precisely the coverage gap D-21
records, and the reason this phase was not accepted on component tests alone.

**The light/dark asymmetry is the load-bearing finding.** Defect 1 manifests *only* in light
themes: in midnight mirage the same wrong token yields white-on-black and scores 15.10:1, looking
perfect. A single-theme spot-check would have passed it. D-24's insistence on a named dark theme
AND a named light theme is what caught it.

Also worth recording: `--text-secondary` — already consumed three lines away in the same file for
the verb id, and measured at **9.74:1** in nord light — was the correct token the whole time.

## Not covered by this gate (D-23)

Required by D-23, and written down so no later document claims coverage this phase does not have.

The following were **not** selected for live coverage and rest on component tests alone:

- **Needs-GUI routing** for the 8 unattended-incapable verbs.
- **Pointer-driven browse and search** interaction beyond the single install path measured above.

## Verification posture (D-21)

D-21 records what the coverage that *does* exist is made of; D-23 above records what is not covered.

This phase rests on component tests **plus** this one live gate. **Neither alone was accepted
as sufficient.**

- **What the component tests carry:** row-state precedence and per-verb error attribution
  (44-01), the six-state action slot and the C-4 Needs-GUI invariant proved across all 64
  parametrized cases (44-03), the single-scroll-region assertion against *compiled* CSS
  (44-04), and the D-17/D-18 remount-safety structural proof (44-05). Every one of these
  carries a recorded revert-to-red negative control.
- **What only this gate can carry:** the Frontend jest project has no DOM, no pointer and no
  compositor. Reflow and scroll position are not observable without layout. Every prior defect
  on this exact surface — mouse-dead Install, the remount race, the hover highlight — was
  invisible to the suite and appeared only under a real pointer in a real WKWebView.

## Overall verdict

**FAIL** — D-24 failed on four defects (table above). D-22 was **not run**: it was deferred by
operator decision because the unreadable surface made further visual observation an eye-strain
cost for no diagnostic gain. The colour defects do not block D-22 mechanically — the Install
button is unreadable but still clickable — so D-22 is simply outstanding, not blocked.

**Sequencing decided with the operator:** fix defects 1-4, then run D-22 against a legible
surface, then re-run D-24 to confirm the fixes. That ordering also means D-24's ten NOT REACHED
cells get measured on the re-run rather than needing a third pass.

Phase 44 therefore does **not** complete green. Plan 44-08 stays open.
