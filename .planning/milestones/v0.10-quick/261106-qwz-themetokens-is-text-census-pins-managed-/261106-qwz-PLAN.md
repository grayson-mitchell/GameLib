---
quick_id: 261106-qwz
type: quick
autonomous: true
files_modified:
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
---

# Quick 261106-qwz: pin the Managed-by-Steam row's two `button is-text` sites in the themeTokens census

Todo: `.planning/todos/pending/2026-11-06-themetokens-is-text-census-red-after-steam-managed-row.md`

## Decision (todo step 1–2)

The Pause and Cancel buttons in `SteamManagedItemView.tsx` (added by 261105-vfq,
`c4c6d434f`) are meant to be `button is-text`: they copy the Downloads "Clear
List" button (`DownloadManager/index.tsx:179`) verbatim. The contrast reasoning
covers them: the 261011-pjv and 261015-7tt checks measure `.button.is-text`
text against its own fill and its own `:hover` fill, both theme-global and
independent of the surface behind them. No Downloads stylesheet overrides
`.button` colour; the row's only button rule is
`.steamManagedItem__actions .button:disabled { opacity: 0.5 }`. That only
affects the disabled Pause button, and disabled controls are exempt from the
contrast checks.

## Task 1: re-pin the census

<files>src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts</files>
<action>Add a `STEAM_MANAGED_ITEM_VIEW_TSX` constant next to `DOWNLOAD_MANAGER_TSX`
with a comment naming 261105-vfq; raise the total to 29; add a 2-site arm for
that file; update the `it(...)` title.</action>
<verify>
npx jest src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
npx prettier --check src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
</verify>
<done>Census green at 29; every other arm is unchanged.</done>
