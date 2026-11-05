---
sketch: 005
name: views-section-distinction
question: 'How does the Views section read as a different KIND of control from the facet groups below it?'
winner: 'D'
tags: [library, filtering, tier-2, selection-state, theme-survival]
---

# Sketch 005: Views Section Distinction

## Design Question

In the shipped Games tier-2 panel, **Views** (All games / Installed / Recently
played / Favourites) is the only section with no header, and its active row is
styled identically to Collections' active row. Three sections, three different
selection semantics, two of them visually indistinguishable:

| Section | Header | Semantics | Active row |
| --- | --- | --- | --- |
| Views (`FilterViewList`) | **none** | single-select, **no off state** | tinted bar + colour |
| Collections | `COLLECTIONS` disclosure | single-select, *clearable* | tinted bar + colour |
| Store / Runnability / More | disclosure | multi-select | tinted bar + checkbox |

So: what gives Views a title, and what makes "selected" read as *where you
are* rather than *what you switched on*?

## How to View

```
open .planning/sketches/005-views-section-distinction/index.html
```

## Variants

- **A: Labelled baseline** — `VIEWS` micro-label, tinted bar kept. The control.
  One string and one `<span>`; tests whether a header alone is sufficient.
- **B: Accent rail** — `SHOW` micro-label, 3px leading rail, tinted background
  dropped. Frees the bar to mean *toggled on* everywhere else in the panel.
  Paints from the chain the facet stylesheet already uses, so no new token.
- **C: Segmented control** — no micro-label; a bordered, rounded block of four
  cells with a filled active cell. Views becomes a control rather than a list.
  No header string to translate. Paints from `--accent-overlay`, skipping
  `--navbar-active` — real chroma in every theme, at the cost of a new chain.
- **D: Synthesis — C's block + A's header** ★ **WINNER** — C's segmented block
  with A's `VIEWS` micro-label above it. D reuses C's stylesheet verbatim and
  adds only the label plus its bottom gap, so C and D cannot diverge on
  anything that isn't under test.

## Outcome

**Variant D.** Views becomes a bordered segmented block — structurally a
*control*, not a list — carried by a `VIEWS` micro-label in the same uppercase
type as the facet disclosures below it.

The two complaints that opened this sketch are answered by different halves of
D, which is why neither A nor C won alone:

- **"No general title"** → A's header. C's structural separation left the block
  unnamed.
- **"A highlighted bar doesn't look right"** → C's filled cell. A's header
  alone left selection signalled by a grey lightness step.

The worry about D — that a header matching `COLLECTIONS` would pull the block
back toward reading as a fifth facet group, undoing C's separation — did not
materialise. The border and the filled cell hold the distinction on their own;
the label names the section without competing with them.

All three render the real panel contents beneath Views (Collections, Store with
exclude-own-facet counts, Runnability, More filters) plus the chip row and grid,
because the question is contrast *against those*, not Views in isolation.

## The Measurement That Drives This

Taken from `src/frontend/themes.scss`, not estimated:

| Token | Declared in | Role |
| --- | --- | --- |
| `--navbar-active-background` | **11 of 11** theme blocks | the tinted bar |
| `--navbar-active` | **4 of 11** theme blocks | active row text |

The bar is the well-supported token — but it is a **desaturated grey in 10 of
11 themes**. The literal values are `#3a435c`, `#514f4e`, `#4a4a4a`, `#555869`,
`#60697a`, `#4f545f`, `#23515d`, `#515151`, `#515151`, `#482f48`, each
commented *"lighter than --navbar-background, so the active row stands out."*
It is a lightness step, not a colour. Only `midnightMirage` uses `color-mix()`.

Per stress theme:

- **gruvbox_dark** — `--navbar-active: var(--navbar-accent)`, i.e. `#f9f5d7`,
  **the same colour the inactive rows use**. The active row differs from an
  inactive one by the grey bar and by nothing else. Any treatment leaning on
  active text colour is invisible here, **including variant B's rail**.
- **midnightMirage** — active `#a5edfd` against inactive `#caf3fd`. The active
  row is *dimmer* than its neighbours.
- **dracula** — `#bd93f9`. The only theme where selection is genuinely
  coloured, and therefore the least informative one to judge in.

This is why the original complaint is correct and not a matter of taste: in two
of three stress themes, "selected" is signalled by a slightly lighter grey band
alone, which reads as a stuck hover state.

## What to Look For

1. **Switch to gruvbox_dark first.** It is the theme that decides this. In A,
   can you tell which view is selected without hovering? In B, what colour does
   the rail actually become — and does bold carry it once the bar is gone?
2. **Then dracula.** Everything looks good here. Check that C's filled cell
   doesn't read as a *disabled* block against the lighter navbar.
3. **Hover an inactive row while another is active** (all variants). The
   shipped hover uses the same `--navbar-active-background` as the active
   state plus a 4px text indent. In A, hover and active are nearly the same
   paint — that is the "stuck hover" effect.
4. **Does the Views block read as a peer or a parent?** A and B give it the
   same uppercase header as `COLLECTIONS`, which may make it look like a fifth
   facet group. C removes the header entirely.
5. **Collapse Collections and Store.** With the groups shut, does Views still
   look like it belongs to the same panel?

## Implementation Notes Carried Into This Sketch

- Views' header is a `<span>`, **not** a `Dropdown` disclosure, in A and B.
  Views has no off state, so a collapsible Views group would hide the one
  filter that is always active.
- Variant B's rail must be an absolutely-positioned `::before`, **not**
  `border-inline-start` (shifts the label) and **not** `box-shadow: inset`
  (collides with the focus ring at `NavItem/index.scss:65-73`).
- Suppressing the inherited bar needs a deliberate specificity bump:
  `.NavShell__tier2 .NavItem.active:not(.NavItem--sub)` is (0,4,0), so the
  obvious override ties and source order decides. Precedent for escalating
  with a comment: the `260815-mk1` block in `FilterFacetGroup/index.scss`.
### Carried by the winner (D)

- **One new `gamelib:` catalogue key** for the `VIEWS` header, with the l10n
  fill behind it. C would have needed zero; D re-adds that cost deliberately.
- **D paints from `var(--accent-overlay, var(--accent))`, not from the
  `--navbar-active` chain.** This is the open decision, and it must be settled
  before implementation rather than discovered during it:
  `themeTokens.test.ts`'s `NAVBAR_ACTIVE_CONSUMERS` census asserts every
  phase-34.11 stylesheet resolves `--navbar-active` through the one chain
  `NavItem/index.scss` established. D's chain skips that token entirely — so
  the new stylesheet is **not** a `--navbar-active` consumer and the census
  will not see it at all. That is either correct (it genuinely does not consume
  the token) or a silent gap (a second active-state chain now exists in the
  panel with nothing asserting it survives all 11 themes).

  The gate exists because this exact defect class already shipped once: CR-03
  left a bare `--navbar-active` in `FilterFacetGroup`, and the checked-checkbox
  fill silently stopped painting in 7 of 11 themes. Do not pick the option that
  makes the gate green by being invisible to it.
- The segmented block does **not** inherit `NavItem`'s active background, so
  the (0,4,0) specificity trap that variant B had to fight does not arise —
  D's cells are a new bordered container, not an override of an existing row
  state. Confirm when implementing; do not assume.
- Views must stay non-collapsible. It has no off state, so a collapsible Views
  group would hide the one filter that is always active. D's header is a
  `<span>`, not a `Dropdown` disclosure.

## Open Question This Sketch Does Not Settle

D sidesteps the gruvbox chroma problem rather than fixing it: it gets gold
(`#d79921`) by using a chain that avoids `--navbar-active` altogether. The
underlying fact is untouched — **in `gruvbox_dark`, `--navbar-active` and
`--navbar-accent` are the same `#f9f5d7`**, so every *other* active row in the
app (Collections, and the facet rows' checked state) still differs from an
inactive one by a grey lightness step alone.

Fixing that properly means giving `gruvbox_dark` a `--navbar-active` distinct
from `--navbar-accent` in `themes.scss`. That token is consumed app-wide by
`NavTabs` and `GamePage`, so it is a separate decision with a blast radius well
beyond this panel — worth filing as its own todo rather than smuggling into
this one.
