---
created: 2026-08-29
found_during: phase 35 plan 11, Task 3 live gate (boot auto-resume verification)
severity: high
area: frontend/game-page
---

# The Pause/Cancel button opens the install modal instead of pausing (non-Steam games)

## Symptom

Operator-observed 2026-08-29 while installing **Alan Wake** (non-Steam). Mid-download, the game
page's main button reads **Pause / Cancel** — clicking it **opens the install dialog** instead of
pausing or cancelling the download.

## Diagnosis — a missing guard, and the label/action disagree

`src/frontend/screens/Game/GamePage/components/MainButton.tsx:305`:

```js
onClick={async () => {
  if (!is_installed && !is.queued && gameInfo.runner !== 'steam') {
    openInstallGameModal({ appName, runner, gameInfo, action: 'install' })
    return
  }
  handleInstall(is_installed)
}}
```

The guard tests `!is_installed`, `!is.queued` and `runner !== 'steam'`. It does **not** test
`!is.installing`. During a download of a non-Steam game all three hold, so the early return fires
and `handleInstall` — which contains the pause/cancel path — is never reached.

The same component's `getButtonLabel()` (:222) *does* consult that flag:

```js
if (is.installing) {
  return <span className="buttonWithIcon"><Pause />{t('button.cancel')}</span>
}
```

So the label is computed from `is.installing` and the action ignores it. The button is rendered at
all during install because its wrapper condition is `(!is_installed || is.queued)`.

## Scope — Steam is the ONLY runner that works

Counter-intuitively, `runner !== 'steam'` is what SHIELDS Steam games: it sends them to
`handleInstall`, whose own guard (`GamePage/index.tsx:705`) correctly tests both
`!is_installed && !isInstalling` and falls through to `install({ ..., isInstalling, ... })`.

So: **legendary / gog / nile / sideload are broken; steam is correct.** An initial diagnosis
against the Steam branch at `GamePage/index.tsx:701` was WRONG and is recorded here so it is not
re-derived — that branch guards `!is_installed` without `!isInstalling` too, but it is unreachable
in this scenario and is not what the operator hit.

## Fix

Add `&& !is.installing` to the `MainButton.tsx:305` guard. One line. The deeper point is that a
button computing its LABEL from a status flag its ONCLICK ignores is a defect shape worth grepping
for elsewhere in this component — `is.updating`, `is.repairing` and `is.moving` deserve the same
question.

## Survives the cutover

Shared frontend code. Nothing here is Electron-specific, so this outlives plan 35-14 exactly as the
`moveInstall` rsync defect does. Filed WITHOUT `resolves_phase:` so it cannot be auto-closed by
association with phase 35.
