import { useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ContextProvider from 'frontend/state/ContextProvider'
import { ClaimAnnotation, HumbleKey } from 'common/types/humble'
import {
  selectKeysWaiting,
  partitionWaitingByUrgency
} from 'common/humble/viewFilters'
import { getUrgencyTier } from 'common/humble/urgencyBadge'
import HumbleKeyRow from '../components/HumbleKeyRow'
import HumbleClaimWizard from '../components/HumbleClaimWizard'

// HVIEW-01: Keys waiting is a single flat list (D-56, no section headers,
// unlike the All-keys tab's HumbleKeyGroup) sorted soonest-expiring first via
// the pure selectKeysWaiting helper. Reads `humble.keys` from
// ContextProvider directly — same shape as the pre-refactor Keys/index.tsx
// render body this tab is descended from.
//
// D-86/D-87/D-88/D-89 (Phase 15, HSTORE-03): keys within the urgency window
// are lifted into a pinned "Expiring soon" section above this flat list —
// moved, never duplicated (D-88) — and the section renders nothing at all
// when empty (D-89). The pinned heading is static/non-interactive (no
// collapse), unlike the All-keys tab's HumbleKeyGroup toggle button.
export default function HumbleKeysWaiting() {
  const { t } = useTranslation()
  const { humble, showDialogModal } = useContext(ContextProvider)
  const [annotations, setAnnotations] = useState<
    Record<string, ClaimAnnotation>
  >({})
  // WR-04 (14-REVIEW): machineName->overriddenAt map — an overridden key
  // (D-42 "Not the same game") recomputes to unowned and lands on THIS tab,
  // so the reversal affordance must render here, keyed off the override
  // record (the fuzzy/owned flags were cleared by the override itself).
  const [overrides, setOverrides] = useState<Record<string, number>>({})

  // 14-07 gap closure: membership no longer depends on annotations — a
  // GameLib-revealed key naturally stays REVEALED (not REDEEMED) across
  // sync, and every REDEEMED key is now a local, undoable overlay that stays
  // visible on its own. Annotations are still fetched below for the row's
  // revealedAt/redeemedAt/keyindexResolved display + button wiring.
  //
  // D-86: partition the waiting set once (single pass, D-88) into the pinned
  // "Expiring soon" keys and everything else — never filter twice
  // independently, which would risk a key landing in both/neither section.
  const { pinned, rest } = partitionWaitingByUrgency(
    selectKeysWaiting(humble?.keys ?? [])
  )

  // WR-02 (14-REVIEW re-review): component-lifetime mounted flag shared by
  // every refreshAnnotations() call site (not just the mount effect's old
  // per-effect `cancelled` local) so a late IPC resolution after the user
  // navigates away never calls setAnnotations/setOverrides on an unmounted
  // component. A stable mutable box via useState — object identity survives
  // re-renders exactly like a ref, and the mount effect's cleanup is the
  // single writer that flips it.
  const [mountedRef] = useState({ current: true })

  // D-67/Plan 03: per-key reveal/redeem annotations + the Pitfall-C
  // keyindexResolved disabled-state signal, mirroring Spares' giftedMap
  // mount-time fetch pattern. Debug session humble-reveal-key-fails (round
  // 7): unlike Spares' giftedMap (which is updated optimistically in-place
  // by openGiftDialog itself), this map was previously fetched ONLY once at
  // mount and never refreshed — a successful reveal/mark-redeemed/undo
  // updates `humble.keys` (via the backend's humbleKeysUpdated push) but
  // left this annotations map stale, so HumbleKeyRow kept reading a
  // revealedAt/redeemedAt of `null` and rendered the original "Claim"
  // button (or the pre-undo "Redeemed" annotation) even after the
  // underlying key's `state` had already advanced. `refreshAnnotations` is
  // re-invoked after every claim-flow mutation exits (wizard close covers
  // reveal + mark-redeemed; the standalone undo action below covers the
  // row's direct IPC call) so the two sources of truth (`humble.keys` and
  // this map) never diverge for longer than one IPC round trip.
  //
  // WR-02: both fetches carry a .catch — an IPC rejection (renderer channel
  // torn down, backend error) must never escape as an unhandled promise
  // rejection. Annotations are advisory display state, so the honest
  // recovery is keeping the last-known map; `humble.keys` (the authoritative
  // state) still updates via the humbleKeysUpdated push. Same discipline as
  // HumbleClaimWizard's WR-05 fix.
  function refreshAnnotations() {
    window.api
      .humbleGetClaimAnnotations()
      .then((map) => {
        if (mountedRef.current) {
          setAnnotations(map)
        }
      })
      .catch(() => {
        // Keep the last-known annotations map — advisory only.
      })
    window.api
      .humbleGetOwnershipOverrides()
      .then((map) => {
        if (mountedRef.current) {
          setOverrides(map)
        }
      })
      .catch(() => {
        // Keep the last-known overrides map — advisory only.
      })
  }

  // Quick task 260823-n5b: a stable identity for the KEY SET, not the array
  // reference. `humble.keys` is replaced wholesale on every `humbleKeysUpdated`
  // push, so depending on the reference would refetch on every unrelated push;
  // depending on `.length` alone would miss a same-size swap. The composite is
  // the SAME `${gamekey}:${machineName}` the annotations map is keyed by, so
  // "the set changed" and "the map needs refetching" are the same question.
  //
  // Deliberately derived from `humble?.keys` ONLY. `refreshAnnotations` writes
  // `annotations` AND `overrides`, so keying this off either would be an
  // infinite refetch loop.
  const keySetIdentity = useMemo(
    () =>
      (humble?.keys ?? [])
        .map((k) => `${k.gamekey}:${k.machineName}`)
        .sort()
        .join('|'),
    [humble?.keys]
  )

  // Lifecycle ONLY — this effect must keep its empty dependency array.
  //
  // `mountedRef` is a COMPONENT-LIFETIME flag (WR-02) that every
  // `refreshAnnotations` call site checks before setState. Adding dependencies
  // here would run this cleanup on every change, permanently latching
  // `mountedRef.current = false` and silently killing all future annotation
  // updates -- a worse and much less visible version of the very defect
  // 260823-n5b fixes. The fetch therefore lives in its own effect below.
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Quick task 260823-n5b: refetch whenever the key set changes, NOT only at
  // mount. Runs on the first render too, so the previous mount-time fetch is
  // preserved with no double-fetch.
  //
  // The defect: `refreshAnnotations` had exactly three call sites -- this
  // effect (then `[]`-keyed), `closeWizard`, and the undo action -- and none
  // fired on a library SYNC. A sync updates `humble.keys` via the
  // `humbleKeysUpdated` push, so a newly-bought key's row rendered, while this
  // map stayed at its mount-time snapshot with no entry for it;
  // `keyindexResolved ?? false` then disabled Claim and rendered
  // "Sync to enable claiming". Syncing again took the identical path.
  // Navigating away and back remounted and appeared to "fix" it.
  //
  // Keying on the key set rather than adding a fourth manual call site is
  // deliberate: sync is not the only non-claim writer of `humble.keys`, and the
  // next one would reproduce this again. The comment above already records this
  // map being fixed ONCE for claim-flow mutations only -- this is that same
  // defect's other half.
  useEffect(() => {
    refreshAnnotations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySetIdentity])

  function closeWizard() {
    showDialogModal({ showDialog: false })
    // The wizard's onDone fires on EVERY exit path (dismiss-without-reveal,
    // successful reveal, mark-redeemed, sync-now) — refetching unconditionally
    // is a single cheap IPC call and guarantees no exit path is missed,
    // rather than threading an outcome flag back through every wizard step.
    refreshAnnotations()
  }

  // D-65: one stateful wizard mount per open, entryMode drives where it
  // starts (D-66: 'finish' resumes at the post-reveal step, never re-reveals).
  function openWizard(key: HumbleKey, entryMode: 'claim' | 'finish') {
    showDialogModal({
      showDialog: true,
      title: t('humbleKeys.claimWizardTitle', 'Claim this key'),
      message:
        entryMode === 'finish' ? (
          <HumbleClaimWizard
            humbleKey={key}
            entryMode="finish"
            onDone={closeWizard}
          />
        ) : (
          <HumbleClaimWizard
            humbleKey={key}
            entryMode="claim"
            onDone={closeWizard}
          />
        ),
      buttons: []
    })
  }

  // Shared row renderer for both the pinned "Expiring soon" section and the
  // normal rest list — HumbleKeyRow/UrgencyBadge are reused completely
  // unchanged in both places (locked user decision 2: the inherited 24-48h
  // countdown copy defect, Phase 13 CR-01, is intentionally not touched here).
  function renderKeyRow(key: HumbleKey) {
    const composite = `${key.gamekey}:${key.machineName}`
    const annotation = annotations[composite]
    return (
      <HumbleKeyRow
        key={composite}
        humbleKey={key}
        urgencyTier={getUrgencyTier(key.state, key.expiration)}
        // WR-04: render the undo-override reversal wherever the
        // overridden key now appears — keyed off the override
        // record, not the (cleared) fuzzy/owned flags.
        undoOverride={overrides[key.machineName] !== undefined}
        claimAction={{
          revealedAt: annotation?.revealedAt ?? null,
          redeemedAt: annotation?.redeemedAt ?? null,
          // Pitfall C: default to false (not resolved) when the
          // annotations fetch hasn't landed yet, so no wizard opens
          // against a key whose keyindex status is still unknown.
          keyindexResolved: annotation?.keyindexResolved ?? false,
          onClaim: () => openWizard(key, 'claim'),
          onFinish: () => openWizard(key, 'finish'),
          // WR-02: a rejected undo IPC call must neither escape as
          // an unhandled rejection nor leave the row silently stale
          // ("Redeemed + Undo" showing although nothing changed) —
          // refresh on BOTH settle paths so the row re-reads the
          // backend's actual truth either way.
          onUndoRedeem: () =>
            void window.api
              .humbleUndoRedeemed({
                gamekey: key.gamekey,
                machineName: key.machineName
              })
              .then(() => refreshAnnotations())
              .catch(() => refreshAnnotations())
        }}
      />
    )
  }

  return (
    <div className="humbleKeysTabPanel">
      <p className="humbleKeysBlurb">
        {t(
          'humbleKeys.waitingBlurb',
          "Keys you don't own yet — claim them before they expire."
        )}
      </p>
      {/* D-89: the pinned block (heading + list) renders nothing at all when
          empty — not a zero-row heading, not a display:none container. */}
      {pinned.length > 0 && (
        <section className="humbleKeyGroup humbleKeysPinnedSection">
          {/* D-86/UI-SPEC: static, non-interactive heading — unlike
              HumbleKeyGroup's collapsible <button>, this has no chevron, no
              aria-expanded, no onClick. */}
          <div className="humbleKeyGroupHeading humbleKeyGroupHeading--static">
            <span className="humbleKeyGroupLabel">
              {t('humbleKeys.expiringSoon', 'Expiring soon')}
            </span>
            <span className="humbleKeyGroupCount">{pinned.length}</span>
          </div>
          <ul className="humbleKeyGroupList">
            {pinned.map((key) => renderKeyRow(key))}
          </ul>
        </section>
      )}
      {rest.length > 0 ? (
        <ul className="humbleKeysFlatList">
          {rest.map((key) => renderKeyRow(key))}
        </ul>
      ) : pinned.length === 0 ? (
        <div className="humbleKeysEmptyState">
          <h5>{t('humbleKeys.waitingEmptyTitle', "You're all caught up")}</h5>
          <p>
            {t(
              'humbleKeys.waitingEmptyBody',
              'No keys are waiting to be claimed. Check the All keys tab to see your full inventory.'
            )}
          </p>
        </div>
      ) : null}
    </div>
  )
}
