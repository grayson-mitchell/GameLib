import './index.css'

import { useContext, useEffect, useMemo, useState } from 'react'
import { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSyncAlt } from '@fortawesome/free-solid-svg-icons'
import { MenuItem, SelectChangeEvent } from '@mui/material'
import classNames from 'classnames'

import ContextProvider from 'frontend/state/ContextProvider'
import WarningMessage from 'frontend/components/UI/WarningMessage'
import SearchBar from 'frontend/components/UI/SearchBar'
import SelectField from 'frontend/components/UI/SelectField'
import ToggleSwitch from 'frontend/components/UI/ToggleSwitch'
import {
  humbleLoginPath,
  steamLoginPath,
  gogLoginPath,
  epicLoginPath
} from 'frontend/screens/Login'

import { ClaimAnnotation, HumbleKey } from 'common/types/humble'
import {
  compareWaiting,
  matchesKeySearch,
  isGiftable,
  WAITING_STATES,
  REDEEMABLE_ONLY_STATES
} from 'common/humble/viewFilters'
import { GENERIC_KEY_PLATFORM } from 'common/humble/genericKeyPlatform'
import { getUrgencyTier } from 'common/humble/urgencyBadge'
import {
  getGameLibLoginStore,
  HumbleGameLibLoginStore
} from 'common/humble/keyTypePresentation'
import HumbleKeyRow from './components/HumbleKeyRow'
import HumbleClaimWizard from './components/HumbleClaimWizard'

// Local formatRelativeTime (mirrors LibraryHeader's, returns the bare
// duration phrase — the "ago"/"showing data from" wrapper lives in the
// caller's i18n string). 4 buckets: <1 minute / minutes / hours / days.
function formatRelativeTime(ms: number, t: TFunction): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) {
    return t('gamelib:humble.lessThanAMinute', 'less than a minute')
  }
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  }
  const hours = Math.floor(ms / 3600000)
  if (hours < 24) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  }
  const days = Math.floor(ms / 86400000)
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

type SortOption = 'expiring' | 'alphabetical'

// D-43-02: static, well-known deep link to Humble's Choice picks page — same
// static-literal discipline as Spares' old GIFT_URL (D-57/A1, T-13-07): never
// interpolate a per-key value into this string. There is no per-key
// evidenced choice URL to link to instead — `classify.ts` reads
// `rawProduct.choice_url` only as an existence gate when synthesising the
// UNPICKED pseudo-entry, it never persists the value onto `HumbleKey` — so a
// per-order deep link would require a backend/classifier change, out of this
// plan's scope (same category as D-43-05's deferred "Most recent" sort gap).
const HUMBLE_CHOICE_URL = 'https://www.humblebundle.com/subscription/home'

// D-43-12/D-43-13: the one GameLib route that connects each login store.
// Exhaustive switch — `pnpm codecheck` fails if `HumbleGameLibLoginStore`
// ever grows a fourth member without a matching route here.
function loginPathForStore(store: HumbleGameLibLoginStore): string {
  switch (store) {
    case 'steam':
      return steamLoginPath
    case 'gog':
      return gogLoginPath
    case 'epic':
      return epicLoginPath
    default: {
      const _exhaustive: never = store
      return _exhaustive
    }
  }
}

// Unified Humble Keys screen (Phase 43): one leaf route (`/humble-keys`)
// rendering a single flat, searchable, sortable list — replacing the old
// three-tab shell (Keys waiting / Giftable spares / All keys) + <Outlet/>
// this file used to render above. The three tabs' list-membership
// predicates are retired: what used to decide WHICH LIST a key appeared in
// is now per-row KEY-column state, resolved entirely inside HumbleKeyRow's
// 8-scenario resolver. This file renders every key once, filtered by the
// search box and (optionally) to actionable/"waiting" states only, sorted
// by one of two comparators (D-43-05/D-43-06). The three annotation/gift/
// settle lifecycles that used to live in Waiting/Spares/All respectively
// are merged into ONE lifecycle here, carrying forward the Waiting tab's
// mountedRef + keySetIdentity discipline (260823-n5b) rather than the All
// tab's weaker mount-only variant.
export default function HumbleKeys() {
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const { humble, steam, gog, epic, showDialogModal } =
    useContext(ContextProvider)
  const navigate = useNavigate()

  const [cooldownUntil, setCooldownUntil] = useState<number | undefined>(
    undefined
  )
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)

  // WR-02 (14-REVIEW re-review): component-lifetime mounted flag shared by
  // every refreshAnnotations() call site (not just the mount effect's old
  // per-effect `cancelled` local) so a late IPC resolution after the user
  // navigates away never calls setAnnotations/setOverrides on an unmounted
  // component. A stable mutable box via useState — object identity survives
  // re-renders exactly like a ref, and the mount effect's cleanup is the
  // single writer that flips it.
  const [mountedRef] = useState({ current: true })

  const [annotations, setAnnotations] = useState<
    Record<string, ClaimAnnotation>
  >({})
  // WR-04 (14-REVIEW): machineName->overriddenAt map — an overridden key
  // (D-42 "Not the same game") recomputes to unowned, so the reversal
  // affordance renders keyed off the override record (the fuzzy/owned flags
  // were cleared by the override itself).
  const [overrides, setOverrides] = useState<Record<string, number>>({})

  // Gift lifecycle (from Spares/index.tsx): gifted-at annotations, fetched
  // mount-only — this map has no claim-flow mutation inside this component
  // that would require a keySetIdentity-keyed refetch the way the claim
  // annotations map does.
  const [giftedMap, setGiftedMap] = useState<Record<string, number>>({})

  // Controls state (D-43-07): nothing here persists — no localStorage, no
  // lifted route state, no URL param. The checkbox initialises to `true`
  // (D-43-09); "Expiring soonest" is the locked default sort (D-43-06).
  const [query, setQuery] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>('expiring')
  const [redeemableOnly, setRedeemableOnly] = useState(true)

  // Quick task 260823-n5b: a stable identity for the KEY SET, not the array
  // reference. `humble.keys` is replaced wholesale on every
  // `humbleKeysUpdated` push, so depending on the reference would refetch on
  // every unrelated push; depending on `.length` alone would miss a
  // same-size swap. The composite is the SAME `${gamekey}:${machineName}`
  // the annotations map is keyed by, so "the set changed" and "the map
  // needs refetching" are the same question.
  //
  // Deliberately derived from `humble?.keys` ONLY. `refreshAnnotations`
  // writes `annotations` AND `overrides`, so keying this off either would be
  // an infinite refetch loop.
  const keySetIdentity = useMemo(
    () =>
      (humble?.keys ?? [])
        .map((k) => `${k.gamekey}:${k.machineName}`)
        .sort()
        .join('|'),
    [humble?.keys]
  )

  // Cooldown lives in humbleSyncStore (D-33), not the context slice — fetch
  // it directly on mount and again whenever a sync just finished.
  useEffect(() => {
    void window.api
      .humbleGetSyncState()
      .then((state) => setCooldownUntil(state.cooldownUntil))
  }, [])

  useEffect(() => {
    const removeListener = window.api.handleHumbleSyncProgress((_e, p) => {
      setProgress(p)
    })
    return () => removeListener()
  }, [])

  // Refetch on sync end AND on a syncError change: a denied sync now pushes
  // its fresh syncError via humbleSyncStateChanged (live-UAT round 2), and
  // the cooldown gate below needs the matching cooldownUntil from the store.
  useEffect(() => {
    if (!humble?.syncing) {
      void window.api
        .humbleGetSyncState()
        .then((state) => setCooldownUntil(state.cooldownUntil))
      setProgress(null)
    }
  }, [humble?.syncing, humble?.syncError])

  // WR-06: `inCooldown` is computed from Date.now() at render time, and
  // during a denial cooldown no sync events arrive to trigger a re-render —
  // on an idle Keys screen the refresh button stayed disabled (with a frozen
  // remaining-minutes tooltip) past the cooldown's actual expiry. Arm a
  // timer to clear the local cooldown state exactly when it elapses.
  useEffect(() => {
    if (!cooldownUntil || cooldownUntil <= Date.now()) {
      return
    }
    const id = setTimeout(
      () => setCooldownUntil(undefined),
      cooldownUntil - Date.now()
    )
    return () => clearTimeout(id)
  }, [cooldownUntil])

  // Lifecycle ONLY — this effect must keep its empty dependency array.
  //
  // `mountedRef` is a COMPONENT-LIFETIME flag (WR-02) that every
  // `refreshAnnotations` call site checks before setState. Adding
  // dependencies here would run this cleanup on every change, permanently
  // latching `mountedRef.current = false` and silently killing all future
  // annotation updates -- a worse and much less visible version of the very
  // defect 260823-n5b fixes. The fetch therefore lives in its own effect
  // below.
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Quick task 260823-n5b: refetch whenever the key set changes, NOT only at
  // mount. Runs on the first render too, so the previous mount-time fetch is
  // preserved with no double-fetch.
  useEffect(() => {
    refreshAnnotations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySetIdentity])

  // D-67/Plan 03: per-key reveal/redeem annotations + the gifted-at map,
  // mirrored mount-time fetch pattern (Spares' original giftedMap effect).
  useEffect(() => {
    let cancelled = false
    void window.api.humbleGetGiftedAt().then((map) => {
      if (!cancelled) {
        setGiftedMap(map)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // D-20: route guard — a disconnected user never sees this page rendered
  // disconnected; deep links / back-button bounce to the login route.
  if (!humble?.isLoggedIn) {
    return <Navigate to={humbleLoginPath} replace />
  }

  // WR-02: both fetches carry a .catch — an IPC rejection (renderer channel
  // torn down, backend error) must never escape as an unhandled promise
  // rejection. Annotations are advisory display state, so the honest
  // recovery is keeping the last-known map; `humble.keys` (the authoritative
  // state) still updates via the humbleKeysUpdated push.
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

  function closeWizard() {
    showDialogModal({ showDialog: false })
    // The wizard's onDone fires on EVERY exit path (dismiss-without-reveal,
    // successful reveal, mark-redeemed, sync-now) — refetching
    // unconditionally is a single cheap IPC call and guarantees no exit
    // path is missed, rather than threading an outcome flag back through
    // every wizard step.
    refreshAnnotations()
  }

  // D-65: one stateful wizard mount per open, entryMode drives where it
  // starts (D-66: 'finish' resumes at the post-reveal step, never
  // re-reveals).
  function openWizard(
    key: HumbleKey,
    entryMode: 'claim' | 'finish',
    priorRefusalAt: number | null = null
  ) {
    showDialogModal({
      showDialog: true,
      // 260823-op3: a Steam key is activated in one click, so the dialog
      // chrome says so; every other platform still runs the reveal-and-claim
      // choreography the original title describes.
      title:
        key.platform === 'steam'
          ? tGamelib(
              'gamelib:humbleKeys.activateWizardTitle',
              'Activate this key'
            )
          : tGamelib('gamelib:humbleKeys.claimWizardTitle', 'Claim this key'),
      message:
        entryMode === 'finish' ? (
          <HumbleClaimWizard
            humbleKey={key}
            entryMode="finish"
            onDone={closeWizard}
            priorRefusalAt={priorRefusalAt}
          />
        ) : (
          <HumbleClaimWizard
            humbleKey={key}
            entryMode="claim"
            onDone={closeWizard}
            priorRefusalAt={priorRefusalAt}
          />
        ),
      buttons: []
    })
  }

  // D-58: every gift action is gated behind this confirmation dialog, every
  // time — no "don't ask again" checkbox, no auto-gift, no bulk action.
  function openGiftDialog(key: HumbleKey) {
    showDialogModal({
      showDialog: true,
      title: tGamelib('gamelib:humbleKeys.giftConfirmTitle', 'Gift this key?'),
      message: tGamelib(
        'gamelib:humbleKeys.giftConfirmBody',
        "Anyone with this link can claim the key — once redeemed, it's gone for good. You'll finish gifting it on Humble's own site."
      ),
      buttons: [
        {
          text: t('button.cancel', 'Cancel'),
          onClick: () => showDialogModal({ showDialog: false })
        },
        {
          text: tGamelib('gamelib:humbleKeys.giftConfirmAction', 'Open Humble'),
          onClick: () => {
            void window.api.humbleRecordGiftLinkOpened(key.machineName)
            window.api.openExternalUrl('https://www.humblebundle.com/home/keys')
            setGiftedMap((prev) => ({
              ...prev,
              [key.machineName]: Date.now()
            }))
            showDialogModal({ showDialog: false })
          }
        }
      ]
    })
  }

  // D-42-01/D-42-06: resolves the settle-undo affordance for a key, or
  // undefined when it does not apply. Gated EXPLICITLY on
  // `redeemedSource === 'ownership-exact'` — never on `redeemedAt` alone,
  // and never via a `!== 'user'` inversion. A missing stored `source` reads
  // as `'user'` (every pre-Phase-42 record was written by the explicit
  // "Mark as redeemed" action), so an inversion would put a second Undo on
  // every legacy explicitly-marked key.
  function settleActionFor(key: HumbleKey) {
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

  function isStoreLoginConnected(store: HumbleGameLibLoginStore): boolean {
    switch (store) {
      case 'steam':
        return !!steam.username
      case 'gog':
        return !!gog.username
      case 'epic':
        return !!epic.username
      default: {
        const _exhaustive: never = store
        return _exhaustive
      }
    }
  }

  // D-53's Keys-waiting membership predicate, reused here as the per-row
  // gate for the claim affordance (not for list membership — D-43-01 keeps
  // every key, including generic-platform ones, as an ordinary list member;
  // this only decides whether THIS row gets a claim/undo-redeem button).
  // REDEEMED is included: every REDEEMED key is a local, undoable overlay
  // (14-07 gap closure) whose "Redeemed {{date}}" + Undo row must keep
  // rendering here even while the checkbox hides it from the filtered view.
  function hasClaimEligibleState(key: HumbleKey): boolean {
    return WAITING_STATES.has(key.state) || key.state === 'REDEEMED'
  }

  function renderKeyRow(key: HumbleKey) {
    const composite = `${key.gamekey}:${key.machineName}`
    const annotation = annotations[composite]

    const claimAction =
      !key.ownedElsewhere &&
      key.platform !== GENERIC_KEY_PLATFORM &&
      hasClaimEligibleState(key)
        ? {
            revealedAt: annotation?.revealedAt ?? null,
            redeemedAt: annotation?.redeemedAt ?? null,
            // Pitfall C: default to false (not resolved) when the
            // annotations fetch hasn't landed yet, so no wizard opens
            // against a key whose keyindex status is still unknown.
            keyindexResolved: annotation?.keyindexResolved ?? false,
            onClaim: () =>
              openWizard(key, 'claim', annotation?.revealRefusedAt ?? null),
            onFinish: () => openWizard(key, 'finish'),
            onUndoRedeem: () =>
              void window.api
                .humbleUndoRedeemed({
                  gamekey: key.gamekey,
                  machineName: key.machineName
                })
                .then(() => refreshAnnotations())
                .catch(() => refreshAnnotations())
          }
        : undefined

    // 260911-nyq: gated on `isGiftable` (may this key be given away at all),
    // NOT `isGiftableSpare` (is this key surplus to me). The spare test
    // requires `ownedElsewhere` and the claim gate above requires
    // `!ownedElsewhere`, so gating the affordance on the classification made
    // the UI-SPEC scenario-2 Claim+Gift pair unreachable for every key.
    const giftAction = isGiftable(key)
      ? {
          giftedAt: giftedMap[key.machineName] ?? null,
          onGift: () => openGiftDialog(key)
        }
      : undefined

    const loginStore = getGameLibLoginStore(key.platform)

    return (
      <HumbleKeyRow
        key={composite}
        humbleKey={key}
        urgencyTier={getUrgencyTier(key.state, key.expiration)}
        // WR-04: render the undo-override reversal wherever the overridden
        // key now appears — keyed off the override record, not the
        // (cleared) fuzzy/owned flags.
        undoOverride={overrides[key.machineName] !== undefined}
        claimAction={claimAction}
        giftAction={giftAction}
        settleAction={settleActionFor(key)}
        storeLoginConnected={
          loginStore === null ? undefined : isStoreLoginConnected(loginStore)
        }
        onLoginAndClaim={
          loginStore === null
            ? undefined
            : () => navigate(loginPathForStore(loginStore))
        }
        onPickOnHumble={
          key.state === 'UNPICKED'
            ? () => window.api.openExternalUrl(HUMBLE_CHOICE_URL)
            : undefined
        }
      />
    )
  }

  const keys = humble.keys ?? []

  const now = Date.now()
  const syncedAt = humble.syncedAt ?? null
  const relativeTime =
    syncedAt !== null ? formatRelativeTime(now - syncedAt, tGamelib) : null

  const inCooldown =
    humble.syncError === 'denied' && !!cooldownUntil && cooldownUntil > now

  const showProgress = !!(humble.syncing && progress && progress.total > 1)

  const cooldownMinutes = cooldownUntil
    ? Math.max(1, Math.ceil((cooldownUntil - now) / 60000))
    : 0

  const showBanner = !!humble.syncError && humble.syncError !== 'none'

  // D-43-21: search and the redeemable-only checkbox combine with AND.
  // D-43-10: search matches `key.title` only. D-43-06: "Expiring soonest"
  // (compareWaiting, dated-first/undated-alphabetical) is the default;
  // "Alphabetical" is the only other shipped option.
  //
  // 260911-t0p: this checkbox filters on REDEEMABLE_ONLY_STATES
  // ({UNPICKED, UNREVEALED}), not the WAITING_STATES set used above for
  // the claim gate and by selectKeysWaiting — a REVEALED key is
  // deliberately excluded here even though it is still a WAITING_STATES
  // member, superseding the original Phase 43 D-43-08 selection.
  const filteredKeys = keys
    .filter((key) => matchesKeySearch(key, query))
    .filter((key) => !redeemableOnly || REDEEMABLE_ONLY_STATES.has(key.state))
    .sort(
      sortOption === 'alphabetical'
        ? (a, b) => a.title.localeCompare(b.title)
        : compareWaiting
    )

  // Filtered-to-zero recovery (D-43-09/UI-SPEC "Empty States"): resets the
  // query to '' and the checkbox to `false` — NOT back to its `true`
  // default, since re-applying the default is what produced this state.
  function clearFilters() {
    setQuery('')
    setRedeemableOnly(false)
  }

  return (
    <div className="humbleKeysScreen">
      <div className="humbleKeysHeader">
        <div className="humbleKeysHeaderTop">
          <h4 className="humbleKeysTitle">
            {tGamelib('gamelib:humbleKeys.title', 'Humble Keys')}
          </h4>
          <SearchBar
            value={query}
            onInputChanged={setQuery}
            placeholder={tGamelib(
              'gamelib:humbleKeys.searchPlaceholder',
              'Search your keys'
            )}
          />
          <button
            className={classNames('humbleKeysRefreshButton', {
              spinning: humble.syncing
            })}
            aria-label={tGamelib(
              'gamelib:humbleKeys.refresh',
              'Refresh Humble Keys'
            )}
            title={
              inCooldown
                ? tGamelib(
                    'gamelib:humbleKeys.cooldown',
                    'Temporarily unavailable — retry in {{minutes}}m',
                    { minutes: cooldownMinutes }
                  )
                : tGamelib('gamelib:humbleKeys.refresh', 'Refresh Humble Keys')
            }
            disabled={humble.syncing || inCooldown}
            onClick={() => window.api.humbleSync()}
          >
            <FontAwesomeIcon
              icon={faSyncAlt}
              className={classNames({ 'fa-spin': humble.syncing })}
            />
          </button>
        </div>
        {showProgress ? (
          <span className="humbleKeysSyncIndicator">
            <FontAwesomeIcon
              icon={faSyncAlt}
              className="humbleKeysSyncSpinner"
            />
            {tGamelib(
              'gamelib:humbleKeys.syncing',
              'Syncing… {{done}}/{{total}} orders',
              {
                done: progress?.done ?? 0,
                total: progress?.total ?? 0
              }
            )}
          </span>
        ) : (
          relativeTime !== null && (
            <span className="humbleKeysSyncIndicator">
              {tGamelib(
                'gamelib:humbleKeys.lastSynced',
                'Last synced {{time}} ago',
                {
                  time: relativeTime
                }
              )}
            </span>
          )
        )}
      </div>

      {showBanner && (
        <WarningMessage className="humbleSyncBanner">
          {humble.syncError === 'partial'
            ? tGamelib(
                'gamelib:humbleKeys.syncErrorPartial',
                "Couldn't finish refresh — showing the latest data available"
              )
            : tGamelib(
                'gamelib:humbleKeys.syncError',
                "Couldn't refresh — showing data from {{time}}",
                { time: relativeTime ?? '' }
              )}
        </WarningMessage>
      )}

      <div className="humbleKeysControlsRow">
        <SelectField
          htmlId="humbleKeysSortPicker"
          extraClass="humbleKeysSortPicker"
          label={tGamelib('gamelib:humbleKeys.sortLabel', 'Sort')}
          value={sortOption}
          onChange={(event: SelectChangeEvent) =>
            setSortOption(event.target.value as SortOption)
          }
        >
          <MenuItem value="expiring">
            {tGamelib(
              'gamelib:humbleKeys.sortExpiringSoonest',
              'Expiring soonest'
            )}
          </MenuItem>
          <MenuItem value="alphabetical">
            {tGamelib('gamelib:humbleKeys.sortAlphabetical', 'Alphabetical')}
          </MenuItem>
        </SelectField>
        <ToggleSwitch
          htmlId="humbleKeysRedeemableOnly"
          title={tGamelib(
            'gamelib:humbleKeys.redeemableOnly',
            'Redeemable keys only'
          )}
          value={redeemableOnly}
          handleChange={(event) => setRedeemableOnly(event.target.checked)}
        />
      </div>

      <div className="humbleKeysColumnHeader">
        <span>{tGamelib('gamelib:humbleKeys.columnType', 'Type')}</span>
        <span>{tGamelib('gamelib:humbleKeys.columnGame', 'Game')}</span>
        <span>{tGamelib('gamelib:humbleKeys.columnKey', 'Key')}</span>
      </div>

      {keys.length === 0 ? (
        <div className="humbleKeysEmptyState">
          <h5>
            {tGamelib('gamelib:humbleKeys.emptyHeading', 'No Humble keys yet')}
          </h5>
          <p>
            {tGamelib(
              'gamelib:humbleKeys.emptyBody',
              'Sync your Humble Bundle account to see your keys here.'
            )}
          </p>
        </div>
      ) : filteredKeys.length === 0 ? (
        <div className="humbleKeysFilteredEmptyState">
          <h5>
            {tGamelib(
              'gamelib:humbleKeys.filteredEmptyHeading',
              'No keys match'
            )}
          </h5>
          <p>
            {tGamelib(
              'gamelib:humbleKeys.filteredEmptyBody',
              'Try a different search, or turn off "Redeemable keys only."'
            )}
          </p>
          <button type="button" onClick={clearFilters}>
            {tGamelib(
              'gamelib:humbleKeys.clearFilters',
              'Clear search and filters'
            )}
          </button>
        </div>
      ) : (
        <ul className="humbleKeysFlatList">
          {filteredKeys.map((key) => renderKeyRow(key))}
        </ul>
      )}
    </div>
  )
}
