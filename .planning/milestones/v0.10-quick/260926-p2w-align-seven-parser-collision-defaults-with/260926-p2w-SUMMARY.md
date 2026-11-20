---
phase: quick-260926-p2w
plan: 01
status: complete
subsystem: i18n
tags: [i18n, i18next-parser, legacy-translation-namespace, copy]
dependency-graph:
  requires: ["quick-260926-k4t"]
  provides: ["four-parser-collisions-cleared", "three-key-reuse-defects-filed", "uninstall-error-key-defect-filed"]
affects:
  - "src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx"
  - "src/frontend/screens/Game/GamePage/components/DownloadSizeInfo.tsx"
  - "src/frontend/screens/Settings/components/AlternativeExe.tsx"
  - "src/frontend/screens/Settings/sections/SyncSaves/gog.tsx"
  - "src/backend/utils.ts"
  - "src/backend/sidecar/shellFilesFlowRegistration.ts"
tech-stack:
  added: []
  patterns: ["align an inert t() default with its catalog value", "triage a warning class by cause before fixing it"]
---

# [QUICK-260926-p2w] Summary

## The finding that shaped this: the seven were THREE different problems

The task arrived as "the seven pre-existing parser collisions", as if one class. Extracting every
call-site default and diffing it against its catalog value showed otherwise:

| class | keys | nature |
|---|---|---|
| **A — typo** | `gamepage:game.getting-install-size` | two of three sites read `'Geting install size'`. Catalog is correct. |
| **B — cosmetic variance** | `translation:box.ok`, `box.select.exe`, `settings.saves.not_supported` | `'Ok'` vs `'OK'`; `'Select EXE...'` vs `'Select EXE'`; two wordings of the same sentence. |
| **C — one key, two MEANINGS** | `translation:box.shortcuts.title`, `setting.eosOverlay.updating`, `wine.manager.settings` | `'Shortcuts'` vs **`'Shortcuts Removed'`**; `'Updating...'` vs **`'The EOS Overlay is being updated...'`**; `'Settings'` vs **`'Wine Manager Settings'`**. |

Class C is not a style question, and **aligning it would have been the wrong fix** — it would cement the
loss of copy someone deliberately wrote. Fixed A and B; filed C.

## What changed

Six one-line edits, aligning each divergent default with its catalog value:

- `DownloadDialog/index.tsx`, `DownloadSizeInfo.tsx` — `'Geting'` → `'Getting'`
- `backend/utils.ts`, `sidecar/shellFilesFlowRegistration.ts` — `'Ok'` → `'OK'`
- `AlternativeExe.tsx` — `'Select EXE...'` → `'Select EXE'`
- `SyncSaves/gog.tsx` — `'Cloud Saves are not supported by this game.'` →
  `'This game does not support Cloud Saves.'`

## A second typo the parser CANNOT see, found only by grepping after the fix

Fixing `'Geting install size'` and then grepping `src/` for `Geting` turned up **two more sites**
carrying the identical misspelling under a *different* key — `gamepage:game.getting-download-size`,
in the same two files (`DownloadSizeInfo.tsx:90`, `DownloadDialog/index.tsx:641`).

**i18next-parser is structurally blind to it, and the reason generalises: both sites agree on the
typo, so there is no value to collide.** The parser only ever reports *disagreement*. A defect
replicated consistently across every call site is invisible to it by construction. Fixed both; the
parser output did not move, which is the expected result and is itself the evidence.

The catalog is correct (`'Getting download size'`) and present in all locale `gamepage.json`
files, so this typo was inert too — never on screen.

## Measured

`pnpm i18n` collision set **7 → 3**. The three survivors are exactly class C, and the two
`already mapped to a map or parent` lines are untouched — that residue is the non-vacuity control:
had the whole warning class vanished, the check would have been muted rather than satisfied.

The parser writes catalogs, so this was checked rather than assumed:
`git status --porcelain public/locales` empty after every run. **No catalog file was touched.**

`pnpm codecheck` clean. `pnpm lint` exit 0, **production PASS / tests PASS**, 638 warnings —
unchanged, and that ceiling has zero headroom so any drift would have failed it.
`npx prettier --check` over the six exact paths: clean. No test pins any of the old strings
(grepped `*.test.ts`/`*.test.tsx` for all four before editing).

## What is NOT claimed

**No user-visible text changed.** Every one of these defaults is inert: all six keys resolve from
the catalog, so the catalog string was being shown before and is still being shown now. The
`'Geting'` typo was never on screen. What changes is (a) the source stops contradicting itself,
and (b) a catalog regenerated from source can no longer pick up the typo or the wrong variant.

## Filed, not fixed

- `2026-09-26-three-translation-keys-are-reused-for-two-different-meanings.md` — class C.
  `minor`/`ready: human`, because it is a copy decision: keep the shared key and delete the dead
  default (free, and already the shipped state), or mint distinct keys (needs 47 translations in
  `gamelib`, or ships untranslated in `translation`).
- `2026-09-26-notify-uninstalled-error-can-never-resolve-in-any-locale.md` — the other warning
  class, and the only genuine bug in the set. `uninstaller.ts:123` calls
  `t('notify.uninstalled.error', ...)` but `notify.uninstalled` is a **string in 47 of 47**
  catalogs, so the key can never resolve and all 46 non-English locales get the hardcoded English.
  Filed `ready: code` — renaming it to a sibling key is correct under every branch of the
  translate-it-or-not question and changes nothing on screen, so the unknown is made not worth
  knowing rather than dissolved.

## Worth knowing beyond this task

**`lint-translations` is scoped to the `gamelib` namespace, so the entire legacy `translation`
namespace is ungated for key presence.** Measured: `notify.uninstallNotConfirmed`, a GameLib-added
`translation` key, exists in **1 of 47** locale files — English-only, shipped, invisible. Both
filed todos name this, because it makes "just put the new key in `translation`" look free when it
is simply unmeasured.
