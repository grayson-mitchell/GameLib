---
phase: quick-260903-vwi
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: []
files_modified:
  - src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx
  - src/frontend/components/UI/NavShell/__tests__/SettingsPanel.test.tsx
  - public/locales/en/gamelib.json
  - .planning/todos/pending/2026-09-03-nav-tour-shows-stale-heroic-branding-in-28-locales.md
  - .planning/STATE.md
  - .planning/quick/260903-vwi-rename-the-ko-fi-settings-row-to-donate/260903-vwi-SUMMARY.md
must_haves:
  truths:
    - "The settings row renders the English word `Donate`, sourced from a catalog key -- NOT from a bare string literal in the component."
    - "`donate.navLabel` exists in `public/locales/en/gamelib.json` and is reachable by the i18next-parser (direct `tGamelib('gamelib:...', 'Donate')` call, not a tuple)."
    - "The row's behaviour is untouched: same `handleKofiClick`, same `faCoffee` icon, same `window.api.openKofiPage`, same `data-tour=\"nav-community\"`, same position between About and App Tour."
    - "The SettingsPanel docstring no longer claims `Ko-fi` is a do-not-translate glossary term -- a claim that is false against the committed 28-term `meta/i18nGlossary.json`."
    - "`SettingsPanel.test.tsx` finds the row by its new label and its three click-behaviour tests still pass."
    - "`hardcodedStringGate` stays green: `Donate` is a common noun with no glossary exemption, so a bare literal would now be a real violation."
  artifacts:
    - path: "public/locales/en/gamelib.json"
      provides: "New fork-owned key donate.navLabel"
      contains: "donate"
    - path: "src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx"
      provides: "Translated Donate row + corrected rationale comment"
---

# Quick task: rename the Ko-fi settings row to "Donate"

## Why this is not a one-word edit

`label="Ko-fi"` is a **bare, deliberately untranslated literal**. That was defensible for a brand
name. `Donate` is an ordinary English verb, so the same treatment would ship an untranslatable
English word to 48 locales and would be a genuine `hardcodedStringGate` violation -- the glossary
exemption that (supposedly) covered `Ko-fi` cannot cover `Donate`.

So the rename is really: **retire a literal, mint a key.**

Minting a NEW key (rather than reusing an existing one) is also the only technique in this repo
that keeps translations honest. Nothing here detects English-side drift: `gamelibCatalogParity`
walks the *translated* catalog and only asks whether each key exists in `en` and passes
placeholder/plural/glossary rules; the `.mt.json` provenance sidecar stores `locale`, `model`,
`filledAt` and a list of key NAMES, with no source text and no hash to compare against. A new key
is absent from every locale, and the parity gate permits that -- absent and empty entries fall back
to English -- so all 48 locales render the new English rather than an old translation of something
else.

## Tasks

### Task 1 -- mint the key

`public/locales/en/gamelib.json`: add `donate.navLabel = "Donate"`, mirroring the existing
`about.navLabel` shape. Keep the file's alphabetical top-level ordering.

### Task 2 -- render it

`SettingsPanel/index.tsx`:

1. `label="Ko-fi"` becomes `label={tGamelib('gamelib:donate.navLabel', 'Donate')}`. Direct call,
   not the `[key, default]` tuple idiom -- the tuple form does not gate-trace once the key carries
   a `gamelib:` prefix, and the alias must stay literally `tGamelib` to remain visible to
   `i18next-parser`'s configured `functions` list.
2. Change **nothing else about the row**: `handleKofiClick`, `faCoffee`, `data-tour="nav-community"`
   and its position all stay. The destination is still ko-fi.com; only the visible word changes.
3. Rewrite the docstring paragraph. It currently asserts the label "is an exact do-not-translate
   glossary term". **That is false** -- `meta/i18nGlossary.json` holds 28 terms and `Ko-fi` is not
   among them. Replace it with what is now true and why.

### Task 3 -- update the test

`SettingsPanel.test.tsx`: the ordered label list and the three `findNavItem(tree, 'Ko-fi')` lookups
plus their test names. The suite mocks `t` to return its default argument, so the new label
resolves to `Donate` there.

### Task 4 -- cross-reference the todo

`2026-09-03-nav-tour-shows-stale-heroic-branding-in-28-locales.md`: this row is the
`data-tour="nav-community"` anchor for **tour step 10**, whose copy is "Join our community on
Discord and support Heroic's development". The row it points at no longer says Ko-fi, which is a
second reason that step's copy needs deciding -- on top of the branding and the
English/translation Discord drift already recorded.

## Out of scope

- **The 48 locale fills.** English key coverage is the stated compliance bar; machine translation
  of other locales is polish, owned by the existing coverage todo. Until then every non-English
  locale renders `Donate`, which is correct-and-untranslated rather than wrong.
- **The `faCoffee` icon**, the `kofiPage` URL, the `openKofiPage` IPC channel and the
  `handleKofiClick` handler name -- the service is still Ko-fi.

## Verification

- `pnpm jest --selectProjects Frontend` green.
- `hardcodedStringGate` green (`pnpm jest --selectProjects meta`).
- The key is present in `en/gamelib.json` and the component contains no bare `"Ko-fi"` label.
- `pnpm codecheck`, eslint and prettier clean on the changed files.
