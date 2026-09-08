import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ContextProvider from 'frontend/state/ContextProvider'
import { ClaimAnnotation, HumbleKey } from 'common/types/humble'
import { GROUP_ORDER, groupAndSortKeys } from 'common/humble/groupKeys'
import HumbleKeyGroup from '../components/HumbleKeyGroup'

// D-21 grouping + round-7 generic->Other partition live in the pure
// common/humble/groupKeys helper (unit-tested from the backend jest
// project) — this tab only renders the groups it receives, in order. Moved
// verbatim from the pre-refactor Humble/Keys/index.tsx render body
// (Pitfall 4: do not alter spacing, group order, or collapse defaults).
// This is the All-keys tab (/humble-keys/all) — uncounted (D-52), no header
// blurb (D-64 only applies to the two focused tabs).
export default function HumbleKeysAll() {
  const { t } = useTranslation()
  const { humble } = useContext(ContextProvider)

  // D-42-01/D-42-06: per-key claim annotations, fetched here for the FIRST
  // time in this tab — needed solely to resolve the settle-undo affordance
  // for an ownership-inferred REDEEM (see settleActionFor below). Mirrors
  // Waiting/index.tsx's annotation lifecycle structurally rather than
  // inventing a second pattern.
  const [annotations, setAnnotations] = useState<
    Record<string, ClaimAnnotation>
  >({})

  // WR-02 (14-REVIEW re-review), carried across from Waiting/index.tsx:
  // component-lifetime mounted flag so a late IPC resolution after the user
  // navigates away never calls setAnnotations on an unmounted component. A
  // stable mutable box via useState — object identity survives re-renders
  // exactly like a ref, and the mount effect's cleanup is the single writer
  // that flips it.
  const [mountedRef] = useState({ current: true })

  // `humble.keys` updates independently via the backend's humbleKeysUpdated
  // push while this map does not — the two sources of truth must not
  // diverge for longer than one IPC round trip, so every mutation below
  // re-invokes this on BOTH the resolve and reject paths (WR-02: annotations
  // are advisory display state, so the honest recovery on rejection is
  // keeping the last-known map, never letting the rejection escape
  // unhandled).
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
  }

  // Mount-only fetch, unlike Waiting/index.tsx's key-set-keyed refetch
  // (260823-n5b) — this tab has no equivalent claim-flow wizard mutating
  // `humble.keys` from inside it, so a single `[]`-keyed effect is safe:
  // it runs exactly once, so combining the fetch with the mountedRef
  // cleanup here carries none of Waiting's re-latching hazard (that hazard
  // only arises when the SAME effect re-runs on a changing dependency array
  // — this one never does). The undo action below is the only mutation this
  // tab makes, and it refreshes explicitly on both its resolve and reject
  // paths rather than relying on this effect to re-fire.
  useEffect(() => {
    refreshAnnotations()
    return () => {
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // D-42-01/D-42-06: resolves the settle-undo affordance for a key, or
  // undefined when it does not apply. Gated EXPLICITLY on
  // `redeemedSource === 'ownership-exact'` — never on `redeemedAt` alone,
  // and never via a `!== 'user'` inversion. Plan 42-02 makes a missing
  // stored `source` read as `'user'` (every pre-Phase-42 record was written
  // by the explicit "Mark as redeemed" action), so an inversion would put a
  // second Undo on every legacy explicitly-marked key.
  const settleActionFor = (key: HumbleKey) => {
    const annotation = annotations[`${key.gamekey}:${key.machineName}`]
    if (annotation?.redeemedSource !== 'ownership-exact') {
      return undefined
    }
    if (annotation.redeemedAt === undefined) {
      return undefined
    }
    return {
      settledAt: annotation.redeemedAt,
      onUndoSettle: () =>
        void window.api
          .humbleUndoRedeemed({
            gamekey: key.gamekey,
            machineName: key.machineName
          })
          .then(() => refreshAnnotations())
          .catch(() => refreshAnnotations())
    }
  }

  const keys = humble?.keys ?? []
  const groups = groupAndSortKeys(keys)
  const hasKeys = keys.length > 0

  return hasKeys ? (
    <div className="humbleKeysGroupList">
      {GROUP_ORDER.map((group) => {
        const groupKeys = groups[group]
        if (!groupKeys?.length) {
          return null
        }
        return (
          <HumbleKeyGroup
            key={group}
            group={group}
            keys={groupKeys}
            settleActionFor={settleActionFor}
          />
        )
      })}
    </div>
  ) : (
    <div className="humbleKeysEmptyState">
      <h5>{t('humbleKeys.emptyTitle', 'No Humble keys yet')}</h5>
      <p>
        {t(
          'humbleKeys.emptyBody',
          'Your synced key inventory will appear here once your account has orders.'
        )}
      </p>
    </div>
  )
}
