---
created: 2026-08-29T00:00:00.000Z
title: "\"Import Game\" does not say what it does and sits in the primary install row — rename it, demote it, and settle whether the feature earns its keep"
area: ui
status: OPEN
severity: minor
platform: any
ready: human
files:
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx:301
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx:399
  - src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx:303
  - src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx:795
  - src/frontend/screens/Library/components/InstallModal/ImportDialog/index.tsx
  - public/locales/en/translation.json (gamepage `button.import`, `box.importpath`)
  - public/locales/en/gamelib.json (destination for any new strings)
---

## Observed

Raised by the operator on 2026-08-29, from the user's seat rather than a gate: *"the feature to
'import' a game confuses me. There is an 'add game' button that makes sense... import confuses me,
if i am in a game page from a store, why in hell would i want to import that game?"*

The confusion is a **naming and placement** defect, not a functional one. What the feature actually
does is adopt an existing on-disk copy of a game the user already owns, instead of re-downloading
it — `legendary import <appName> <folder>` verifies the folder against the store manifest and
writes the `installed.json` entry (`src/backend/storeManagers/legendary/games.ts:807`; GOG, Nile,
sideload and zoom carry parallel `importGame` implementations). None of that is legible from the
word "Import", which in almost every other app means import/export of *data*.

Three separate problems, and they should be settled in this order:

**1. The label carries none of the meaning.** `button.import` renders as "Import Game" in the
`gamepage` namespace. A self-describing label — "Already Installed?", "Locate Existing Install",
"Use Files on Disk" — states the precondition and the payoff. Note the repo rule: **new strings go
in `gamelib.json`, never `translation.json`**, so this is a new key plus a call-site change, not an
in-place edit of the existing value. There is no explanatory copy anywhere in `ImportDialog` either
— the dialog is a bare path picker with an "Import" button, so a user who guessed wrong at the
button gets no correction inside the dialog.

**2. It is promoted far above its frequency.** The button renders in the `installButtons` row
directly beside the primary Install button (`MainButton.tsx:399`), gated only on
`!is_installed || is.queued` and `runner !== 'steam'`. This is a recovery/advanced action — dual
boot, a restored backup, a moved drive, a GameLib reinstall that lost `installed.json` — and it is
currently drawing the same visual weight as the action ~99% of visits want. The second, better-sited
door already exists: `handleSwitchToImport` inside DownloadDialog (`:303`, rendered at `:795`),
which puts the offer at the exact moment the user is looking at a download size and thinking "wait,
I already have this." Candidate resolution: make the DownloadDialog escape hatch the primary door
and drop the MainButton instance, or demote the latter into `GameSubMenu`.

**3. Open product question — does it survive at all?** The operator's own challenge: *"still
debating the value, pretty much all broadband these days means redownloading is not a big
constraint?"* Worth resolving explicitly rather than leaving implicit, because the answer decides
whether 1 and 2 are worth doing. Arguments on the keep side, none yet tested against real telemetry:

- Bandwidth is not the only cost. Metered/capped connections, satellite and mobile tethering, and
  data caps outside dense urban markets are still real. Modern install sizes (100–200 GB) turn a
  "fast" 100 Mbit line into a multi-hour job.
- The strongest case is not the fresh install — it is the **recovery** case. A user whose
  `installed.json` was lost, who moved a library to a new drive, or who is migrating from the
  native Epic/GOG launcher to GameLib has the bytes sitting on disk and correct. Without import,
  GameLib's only offer is "re-download what you already have," which is a bad first impression for
  exactly the migrating user GameLib is trying to win.
- **Migration is GameLib's acquisition path.** Every new user arrives with an existing library
  already installed by another launcher. Deleting import makes the onboarding story worse precisely
  where it matters most. That argues the feature is not merely worth keeping but is arguably
  *under*-exposed — just exposed in the wrong place, phrased in the wrong words.
- Deleting it is also not free: five store managers implement `importGame`, the sidecar flow is
  registered and path-hardened, and two open todos already track its correctness. Removal is a
  real deletion across backend + IPC + UI, not a button hide.

Recommendation on record: **keep the feature, fix the label and the placement.** But this is the
operator's call and the question is logged here so it gets answered rather than assumed.

## Solution

TBD — sequence once question 3 is settled:

1. Decide keep vs. delete (operator).
2. If keep: add a self-describing key to `gamelib.json`, repoint the call sites, and add one line
   of explanatory copy inside `ImportDialog` above the path picker.
3. Demote the `MainButton` instance — either remove it in favour of the DownloadDialog hatch, or
   move it into `GameSubMenu`. Check the DownloadDialog hatch is reachable on every runner that
   implements `importGame` before removing the MainButton door, or the feature becomes
   unreachable for whichever runner it is not offered on.
4. Localisation is a standing requirement — any new key needs the de/fr fill, and note the existing
   `gamelib.json` de/fr gap todo (`2026-08-28-gamelib-json-de-fr-missing-five-keys-machine-fill-401s`).

## Related

- `2026-08-24-importgame-does-not-validate-the-folder-matches-the-selected-game` — backend
  correctness; if import is deleted, that todo dies with it.
- `2026-08-24-importgame-wineprefix-wineversion-not-contained-by-34-6-11` — same dependency.

## Resolution

Closed by `quick-260916-cdb`. The operator's 2026-09-16 decision on the open product question (item
3) was **keep the feature; fix the label and the placement** — the "keep" branch of the
recommendation on record above, decided explicitly rather than assumed:

1. **Keep.** No backend, IPC or store-manager code touched. All five `importGame` implementations
   (legendary, gog, nile, sideload, zoom) are unchanged; the sidecar flow and its path hardening are
   untouched.
2. **Label.** Three new self-describing English keys minted in `gamelib.json` under
   `installFlows`: `importDoorLabel` ("Locate existing installation…", the door label used at both
   remaining doors), `importConfirmLabel` ("Use this installation", the ImportDialog confirm
   button — deliberately a DIFFERENT string from the door label so a user does not read the same
   sentence twice in one flow), and `importExplainer` (the one line of explanatory copy item 2 of
   the old Solution section asked for, now rendered inside `ImportDialog` above the path picker).
   All three keys are filled, non-empty, across all 49 `gamelib.json` catalogs (en + 48 translated),
   by hand — not machine-filled — so they are permanent under `machineFillGamelib.ts`'s
   never-overwrite rule.
3. **Placement.** The `MainButton.tsx` instance (the old `:399`/`button.import` primary-install-row
   door referenced above) was demoted, not deleted in favour of the DownloadDialog hatch — the
   Solution section's own caveat held: `sideload` and `thirdPartyManagedApp` runners never reach
   `DownloadDialog` (`InstallModal/index.tsx:629`, `:706-761`), so removing the MainButton door
   without a replacement would have made import unreachable for them. It was rebuilt inside
   `GameSubMenu` instead, gated `!isInstalled && !isSteam`, with no `isThirdPartyManaged` exclusion
   (D-02), and is proven reachable there for those two runners by a source-shaped census, not a
   render test — `GameSubMenu` cannot be called bare in this repo's jest setup (imports
   `./index.css` with no `moduleNameMapper`, six `useState` hooks plus effects).

**Five call sites repointed:** `MainButton.tsx` (import door removed entirely — pinned red by
`MainButton.importDemotion.test.tsx` via a revert-and-check), `GameSubMenu/index.tsx` (import door
added), `DownloadDialog/index.tsx` (footer hatch relabelled), `ImportDialog/index.tsx` (explainer
line added, confirm button relabelled), `SideloadDialog/index.tsx` (hint copy relabelled).

**Both Related todos stay OPEN.** They said "if import is deleted, that todo dies with it" — import
was not deleted, so their backend-correctness scope (`importGame` folder validation; wineprefix/
wineVersion containment) is unaffected by this quick and remains outstanding.

**What was NOT done, by design:** `gamepage.json`'s `button.import` key (the old label, "Import
Game") is deliberately left orphaned — unread by any call site, in en and all 47 other translated
locales. Removing an upstream-owned key from `gamepage.json` was out of scope (it is not a
`gamelib.json` fork-owned catalog) and the key's presence is harmless once nothing reads it.

**Follow-up filed, not fixed here:** `2026-09-16-sideload-import-hint-trans-uses-key-not-i18nkey.md`
— a pre-existing, unrelated `<Trans key=... >` vs `i18nKey=...` bug in `SideloadDialog` that predates
this quick and was deliberately left alone (see that todo for why fixing the prop is not a one-line
change).
