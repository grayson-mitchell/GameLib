import {
  HumbleKey,
  HumbleKeyState,
  HumbleOrderCacheEntry
} from 'common/types/humble'
import { OrderDetail } from './adapter'

/**
 * Pure 5-state classification (D-30, HSYNC-01/02/03). No I/O, no logging, no
 * store import — every input is passed in by the caller (library.ts, Plan 02)
 * so this module is unit-testable with zero mocking of axios/electron-store.
 */

/**
 * Classifies a single tpk's already-derived signals into exactly one of the
 * five states.
 *
 * Precedence is literal and intentional. Expiry (D-30, unchanged — a past
 * `expiration` OR the real API's `is_expired` boolean, see classifyOrder)
 * beats every other signal — even a retroactively-expired local-redeemed
 * mark reclassifies UNREDEEMABLE. Do not "fix" this by reordering the
 * expiry check; it is a locked user decision, not an oversight.
 *
 * Phase 14 gap closure (14-07, UAT tests 2/3): `redeemedKeyValuePresent`
 * means REVEALED, NOT REDEEMED. Humble's reveal endpoint is literally
 * `/humbler/redeemkey` — populating this field only means the key value has
 * been revealed to the user; Humble has no knowledge of whether the key was
 * ever activated on Steam (or any other platform). REDEEMED is therefore a
 * LOCAL-ONLY overlay, produced solely by the user's explicit "Mark as
 * redeemed" action (`isLocallyRedeemed`) and always undoable — it can never
 * be derived from server data. This supersedes the prior D-30/D-77 reading
 * (see PROJECT.md's amended D-30 decision record).
 */
export function classifyTpk(
  tpk: {
    redeemedKeyValuePresent: boolean
    expiration: string | null
    isExpired?: boolean
  },
  isLocallyRevealed: boolean,
  isLocallyRedeemed: boolean,
  now: Date = new Date()
): HumbleKeyState {
  if (
    tpk.isExpired ||
    (tpk.expiration && new Date(tpk.expiration).getTime() <= now.getTime())
  ) {
    return 'UNREDEEMABLE'
  }
  // Local overlay wins over mere revealed-ness: once the user has explicitly
  // marked a key redeemed, that local fact takes precedence for display even
  // if the server also happens to carry a revealed key value.
  if (isLocallyRedeemed) {
    return 'REDEEMED'
  }
  // Server truth: a present redeemed_key_val OR our own locally-persisted
  // REVEALED flag both mean the key has been revealed — never redeemed.
  if (tpk.redeemedKeyValuePresent || isLocallyRevealed) {
    return 'REVEALED'
  }
  return 'UNREVEALED'
}

/**
 * The single source of truth for "terminal" (D-24 freeze eligibility).
 * Exported (WR-01, 14-REVIEW re-review) so library.ts's patchCachedState can
 * recompute `allTerminal` with the exact same predicate classifyOrder uses —
 * the two must never drift, or an undone key could stay frozen (or a frozen
 * order thaw) inconsistently with what a fresh sync would compute.
 */
export function isTerminal(state: HumbleKeyState): boolean {
  return state === 'REDEEMED' || state === 'UNREDEEMABLE'
}

/**
 * Server-side terminality (14-08 gap closure — Fix 2, restores the D-24
 * freeze benefit and cuts the standing Cloudflare/WAF re-fetch exposure).
 * Distinct from `isTerminal` (user-journey terminality: REDEEMED/
 * UNREDEEMABLE only, unchanged above): REVEALED is ALSO server-final — once
 * Humble populates `redeemed_key_val` it never un-populates it or changes
 * its value, so a REVEALED key needs no further re-fetch on THAT basis.
 * See `isFreezeEligible` for the one caveat this predicate alone does not
 * capture (a pending future expiration on a REVEALED key).
 */
export function isServerTerminal(state: HumbleKeyState): boolean {
  return (
    state === 'REVEALED' || state === 'REDEEMED' || state === 'UNREDEEMABLE'
  )
}

/**
 * Single-sourced freeze-eligibility predicate (14-08 gap closure). BOTH
 * classifyOrder (fresh sync) and library.ts's patchCachedState (undo/mark
 * recompute) call this EXACT function so the two can never drift out of
 * sync with partitionGamekeys' frozen/skip decision — an order a fresh sync
 * would freeze and an order an undo just recomputed must always agree.
 *
 * REVEALED is server-final (the key value cannot change once revealed), so
 * it is freeze-eligible by default — EXCEPT in two cases:
 *
 * 1. A pending FUTURE expiration: confirmed during 14-08 planning, the ONLY
 *    way a key's expiry is ever re-evaluated is by re-fetching a
 *    non-terminal order (no standalone retroactive-expiry recompute exists)
 *    — so a frozen REVEALED(future-exp) key would never flip to
 *    UNREDEEMABLE once its expiration passes.
 * 2. CR-01 (14-08 re-review): the revealed key VALUE is not actually
 *    present. A key can classify REVEALED purely from the local write-ahead
 *    flag (humbleRevealedStore) with NO server value at all — the state the
 *    D-78 `ambiguous` and WR-06 `rejected_by_server` reveal outcomes
 *    deliberately produce. Those keys depend on every-sync re-fetch for
 *    their "unconfirmed — sync to check" reconciliation AND for the D-66
 *    website-reveal value pickup; freezing them would strand both forever
 *    (no thaw path exists short of a classifier-version bump). Only a
 *    value-backed REVEALED key is genuinely server-final. Callers supply
 *    `revealedKeyValuePresent` from whichever value signal exists at their
 *    site (classifyOrder: the string side-channel; library.ts: the
 *    internal `revealedKeyValue` field) — absent/undefined is treated as
 *    NOT present, the safe default (keep re-fetching).
 *
 * REDEEMED/UNREDEEMABLE deliberately get NO expiry or value guard — they
 * keep their pre-existing always-eligible freeze behavior exactly.
 */
export function isFreezeEligible(key: {
  state: HumbleKeyState
  expiration: string | null
  revealedKeyValuePresent?: boolean
}): boolean {
  if (!isServerTerminal(key.state)) {
    return false
  }
  if (key.state === 'REVEALED') {
    return key.expiration === null && key.revealedKeyValuePresent === true
  }
  return true
}

/**
 * D-29 key-evidence gate (live-UAT round 5): a tpk becomes a key ROW only when
 * it carries a `key_type` field with a string value. Both working integrations
 * gate on exactly this field — Playnite HumbleKeysLibrary only surfaces tpks
 * whose `Tpk.key_type` matches its platform whitelist, and
 * UncleGoogle/galaxy-integration-humblebundle's Key model reads
 * `data['key_type']` unconditionally. Entries WITHOUT it are DRM-free download
 * entitlements (the tester's PDF/ebook bundle contents), which D-29 excludes
 * from the inventory entirely.
 *
 * IMPORTANT (D-28): this is a key-vs-download-entitlement filter, NOT a
 * platform whitelist — ANY string key_type (steam, gog, epic, ubisoft, origin,
 * generic, ...) still classifies. This is the ONE minimal requirement
 * deliberately added back on top of round 3's "a tpk needs nothing beyond
 * being an object" tolerance (debug: humble-zero-keys-from-valid-orders);
 * everything else stays maximally tolerant.
 */
function hasKeyEvidence(tpk: Record<string, unknown>): boolean {
  return typeof tpk.key_type === 'string'
}

/**
 * Evidenced game-store key_type values (live-UAT round 6, D-29 v2). Union of
 * the two working integrations' key-type models:
 *  - Playnite HumbleKeysLibrary keyTypeWhitelist (Models + Settings): gog,
 *    nintendo_direct, origin, origin_keyless, steam (+ epic/epic_keyless
 *    noted in-source as valid key types);
 *  - UncleGoogle/galaxy-integration-humblebundle KEY_TYPE enum
 *    (src/model/types.py): steam, origin, uplay, epic, battlenet, gog.
 *
 * IMPORTANT: this is NOT a required whitelist (that would break D-28 for
 * future/unknown platforms) — it is a protective override so the
 * direct_redeem entitlement signal below can never drop a key whose key_type
 * attests a known store. Galaxy's REAL capture (tests/data/orders_keys.json)
 * proves the need: Rayman Legends is a real uplay key carrying
 * `direct_redeem: true` WITH a redeemed key value.
 */
const KNOWN_GAME_KEY_TYPES = new Set([
  'steam',
  'gog',
  'origin',
  'origin_keyless',
  'uplay',
  'epic',
  'epic_keyless',
  'battlenet',
  'nintendo_direct'
])

/**
 * D-29 v2 (live-UAT round 6): the tester's PDF-bundle tpks DO carry
 * `key_type`, so round 5's presence check passed them. Their live signature —
 * `direct_redeem`, `custom_instructions_html`/`instructions_html`,
 * `show_custom_instructions_in_user_libraries` — marks auto-redeemed
 * download/custom entitlements. Evidence rules out the simpler candidates:
 *  - `direct_redeem === true` ALONE drops a real uplay game key (Rayman
 *    Legends, Galaxy real capture) — D-28 violation;
 *  - `custom_instructions_html` presence drops real origin game keys (Sims 3
 *    Late Night / Populous, Galaxy origin_bundle_order.json) — D-28 violation.
 * Therefore: exclude ONLY when `direct_redeem === true` (strict — a mistyped
 * truthy value never excludes) AND key_type is NOT an evidenced game-store
 * platform. Any-platform keys without the positive entitlement signal always
 * survive (D-28 intact). If the live discriminator is still wrong, the
 * round-6 diagnostics log the skipped entries' key_type /
 * key_type_human_name VALUES (C5-permitted type labels) so the next run is
 * conclusive.
 */
function isDirectRedeemEntitlement(tpk: Record<string, unknown>): boolean {
  return (
    tpk.direct_redeem === true &&
    !(
      typeof tpk.key_type === 'string' && KNOWN_GAME_KEY_TYPES.has(tpk.key_type)
    )
  )
}

/**
 * A tpk becomes an inventory key ROW iff it carries key evidence (round 5)
 * AND is not a direct-redeem entitlement (round 6). Shared by classifyOrder
 * and every diagnostic so "is a key" can never diverge between them.
 */
function isInventoryKeyTpk(tpk: Record<string, unknown>): boolean {
  return hasKeyEvidence(tpk) && !isDirectRedeemEntitlement(tpk)
}

/**
 * Redacted `key_type=<v> key_type_human_name=<v>` label pair for diagnostics.
 * These VALUES are platform/type labels ("steam", "Download") — explicitly
 * C5-permitted, unlike key values (redeemed_key_val), which must NEVER be
 * logged.
 */
function tpkTypeLabels(tpk: Record<string, unknown>): string {
  const keyType = typeof tpk.key_type === 'string' ? tpk.key_type : 'absent'
  const humanName =
    typeof tpk.key_type_human_name === 'string'
      ? tpk.key_type_human_name
      : 'absent'
  return `key_type=${keyType} key_type_human_name=${humanName}`
}

// Candidate field names for an ABSOLUTE expiration date on a tpk. The real
// Humble field name is NOT conclusively documented in any public source
// (live-UAT round 4): Playnite HumbleKeysLibrary + official PlayniteExtensions
// HumbleLibrary, FailSpy humble-steam-key-redeemer, Hayden Schiff's API docs
// and saik0's client all model ONLY the `is_expired` boolean, never a tpk-level
// date. The single concrete code reference to a tpk date field is FailSpy fork
// DIASILEDU/humble-steam-key-redeemer (`tpk.get("expiry_date")`), and Humble's
// own web UI verifiably renders a date (GreasyFork "Humble Bundle Expiration
// CSV Exporter" scrapes `.expiration-messaging strong`) — so a date exists in
// the payload under an as-yet-unconfirmed name. We read a small tolerant
// candidate set (best-evidence `expiry_date` first) so a live payload populates
// `HumbleKey.expiration` regardless of the exact name, and diagnose (field
// NAMES only, C5) via describeMissingExpirationTpks when none match, so the
// next live run confirms the true field.
const ABSOLUTE_EXPIRATION_FIELDS = [
  'expiry_date',
  'expiration_date',
  'expiration',
  'expires'
] as const

// Relative form CONFIRMED present in real Humble payloads (the round-2 realistic
// order fixture, authored from a real capture, carries `num_days_until_expired`
// alongside `is_expired`): a count of days until the key expires. Converted to
// an absolute ISO timestamp anchored on the sync time so the row display +
// expiring-soonest sort stay meaningful and HSYNC-03 retroactive-expiry keeps
// working. IMPORTANT: a value of 0 (or negative) means "no expiry window", NOT
// "expires today" — real non-expiring keys carry `num_days_until_expired: 0`
// with `is_expired: false`, so only a strictly-positive count yields a date.
const RELATIVE_EXPIRATION_DAYS_FIELD = 'num_days_until_expired'

const MS_PER_DAY = 86_400_000

/**
 * Pure, tolerant expiration extraction. Reads whichever recognized field a live
 * tpk carries and normalizes it to an ISO-8601 string:
 *  - an absolute date string (any of ABSOLUTE_EXPIRATION_FIELDS) -> parsed and
 *    re-emitted as ISO (an unparseable string is ignored, never thrown on);
 *  - a relative, strictly-positive `num_days_until_expired` number -> `now + N
 *    days` as ISO (0/negative means "no expiry window" — see the field note).
 * Returns null when no recognized, parseable expiration is present. Never
 * throws — a malformed value simply yields null (Pitfall 2 / T-11-05).
 */
export function extractExpiration(
  tpk: Record<string, unknown>,
  now: Date = new Date()
): string | null {
  for (const field of ABSOLUTE_EXPIRATION_FIELDS) {
    const value = tpk[field]
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = new Date(value)
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString()
      }
    }
  }
  const days = tpk[RELATIVE_EXPIRATION_DAYS_FIELD]
  if (typeof days === 'number' && Number.isFinite(days) && days > 0) {
    // WR-02: a drifted/hostile day count > ~1e8 overflows the ECMAScript
    // time range — the resulting invalid Date's .toISOString() THROWS
    // RangeError, breaking this function's "never throws" contract (and,
    // unguarded via describeMissingExpirationTpks, previously rejected the
    // whole sync). Validate the candidate before serializing.
    const candidate = new Date(now.getTime() + days * MS_PER_DAY)
    if (!Number.isNaN(candidate.getTime())) {
      return candidate.toISOString()
    }
  }
  return null
}

/**
 * Classifies an entire fresh order-detail response into a cache-ready entry.
 *
 * `rawOrder` must always be the freshly-fetched response — never a
 * previously-cached record merged forward (Pitfall 5). The only
 * locally-carried-forward state is the `isRevealed` lookup, which reads a
 * separate keyed store (humbleRevealedStore, injected by the caller) rather
 * than being embedded in this order data.
 *
 * Phase 14 (HCLAIM-01/D-77): `isLocallyRedeemed` is a SECOND injected
 * predicate, composite-keyed by `(gamekey, machineName)` (unlike
 * `isRevealed`'s machineName-only lookup — Pattern 3, learning from
 * 13-REVIEW's WR-01 machineName collision). Defaulted to "never redeemed" so
 * every pre-Phase-14 caller (library.ts's sync orchestration, existing
 * fixtures/tests) keeps compiling and behaving identically without an update
 * — library.ts's own local-redeemed-store wiring lands in Plan 03.
 *
 * The return value is widened (via intersection, not a breaking reshape) to
 * also carry `keyIndexByComposite` — a backend-only side-channel lookup of
 * each tpk's `keyindex` field, composite-keyed the same way. `keyindex` is
 * NEVER placed on the public `HumbleKey` type broadcast over
 * `humbleKeysUpdated` (14-RESEARCH.md: no display purpose, needlessly widens
 * the IPC surface) — callers that need it (the Phase 14 reveal IPC handler)
 * read this side-channel directly instead.
 *
 * CR-01 (14-REVIEW re-review): `revealedKeyValueByComposite` is a SECOND
 * backend-only side-channel carrying the server-provided plaintext key value
 * (`redeemed_key_val`) for keys the user revealed on Humble's WEBSITE — those
 * classify REVEALED with no local reveal record and no locally-persisted
 * value, yet the wizard's finish mode must still be able to show the key
 * without re-firing the reveal POST (D-66). Same discipline as keyindex:
 * NEVER placed on HumbleKey (C4/T-14-02) and NEVER logged (C5) — library.ts
 * merges it onto the cache entry's internal-only `revealedKeyValue` field.
 * Strings only: some non-Steam key types carry an OBJECT here (see
 * redeemedKeyValuePresent below), which cannot back the string-typed internal
 * field — those keys keep the honest Pitfall-B "unconfirmed" path.
 */
export function classifyOrder(
  rawOrder: OrderDetail,
  isRevealed: (machineName: string) => boolean,
  now: Date = new Date(),
  isLocallyRedeemed: (gamekey: string, machineName: string) => boolean = () =>
    false
): HumbleOrderCacheEntry & {
  keyIndexByComposite: Record<string, string | number>
  revealedKeyValueByComposite: Record<string, string>
} {
  const gamekey = rawOrder.gamekey ?? ''
  const keyIndexByComposite: Record<string, string | number> = {}
  const revealedKeyValueByComposite: Record<string, string> = {}
  const rawProduct = rawOrder.product as
    | {
        category?: string | null
        choice_url?: string | null
        human_name?: string | null
      }
    | null
    | undefined
  const orderLabel =
    (rawOrder as { human_name?: string }).human_name ??
    rawProduct?.human_name ??
    gamekey

  const rawTpks = rawOrder.tpkd_dict?.all_tpks ?? []
  const keys: HumbleKey[] = []

  for (const rawTpk of rawTpks) {
    // T-11-05: a malformed/partial tpk entry must never throw out of the
    // loop — skip it, other tpks in the same order still classify.
    if (!rawTpk || typeof rawTpk !== 'object') {
      continue
    }
    try {
      const tpk = rawTpk as Record<string, unknown>
      // D-29 (rounds 5+6): skip download entitlements — no key_type
      // (round 5) or a direct-redeem entitlement signature (round 6) means
      // no row. Skipped entries stay discoverable via the redacted
      // diagnostics (describeZeroKeyOrder / describeSkippedEntitlements in
      // library.ts), which log the type-label VALUES for round-6 skips.
      if (!isInventoryKeyTpk(tpk)) {
        continue
      }
      const machineName =
        typeof tpk.machine_name === 'string'
          ? tpk.machine_name
          : `${gamekey}:${keys.length}`
      // Real API field is `redeemed_key_val` (verified against Playnite
      // HumbleKeysLibrary's Tpk model and FailSpy's redeemer — live-UAT
      // round 3); the spec's `redeemed_key_value` is kept as a fallback.
      // Truthiness (not string-typing) on purpose: for some non-Steam key
      // types the redeemed value is an OBJECT, not a string.
      const redeemedKeyValuePresent = Boolean(
        tpk.redeemed_key_val ?? tpk.redeemed_key_value
      )
      // Tolerant multi-candidate extraction (live-UAT round 4): the spec's
      // single `expiration` string name never matched the live payload, so
      // every row showed "No expiration". extractExpiration reads the real
      // absolute/relative field (see ABSOLUTE_EXPIRATION_FIELDS) and normalizes
      // to ISO so (a) rows display the date, (b) the expiring-soonest sort is
      // meaningful, (c) a PAST date still classifies UNREDEEMABLE below.
      const expiration = extractExpiration(tpk, now)
      // Real API expiry signal is `is_expired: bool` (same sources); the
      // spec's `expiration` timestamp is kept as a fallback. Strict === true
      // so a mistyped value never expires a live key by accident.
      const isExpired = tpk.is_expired === true
      const locallyRedeemed = isLocallyRedeemed(gamekey, machineName)
      const state = classifyTpk(
        { redeemedKeyValuePresent, expiration, isExpired },
        isRevealed(machineName),
        locallyRedeemed,
        now
      )
      // Phase 14 (HCLAIM-01): capture the reveal endpoint's third form field
      // into the backend-only side-channel — NEVER onto HumbleKey (see the
      // function-level doc comment). Tolerant of the field arriving as
      // either a number or string; any other shape is simply omitted.
      const rawKeyIndex = tpk.keyindex
      if (typeof rawKeyIndex === 'string' || typeof rawKeyIndex === 'number') {
        keyIndexByComposite[`${gamekey}:${machineName}`] = rawKeyIndex
      }
      // CR-01 (14-REVIEW re-review): capture the server-side revealed key
      // value into the backend-only side-channel (see the function-level doc
      // comment) — strings only, non-empty; an OBJECT-shaped value (some
      // non-Steam key types) is deliberately omitted.
      const rawRevealedValue = tpk.redeemed_key_val ?? tpk.redeemed_key_value
      if (typeof rawRevealedValue === 'string' && rawRevealedValue !== '') {
        revealedKeyValueByComposite[`${gamekey}:${machineName}`] =
          rawRevealedValue
      }
      // D-28: platform label is derived from key_type for ANY platform —
      // classification itself is fully platform-agnostic. Guaranteed a
      // string here by the hasKeyEvidence gate above.
      const platform = tpk.key_type as string
      const title =
        typeof tpk.human_name === 'string' ? tpk.human_name : orderLabel

      // Phase 12 (HDEDUP-02 linchpin): capture the Steam AppID directly
      // carried by the live tpk. Only for platform === 'steam' — other
      // platforms never carry a meaningful steam_app_id. Stringified to
      // match GameInfo.app_name; tolerant of the field arriving as either a
      // number or a string (validation.ts confirms both are seen live). Any
      // other shape (object, boolean, missing) yields undefined rather than
      // throwing — this read stays inside the existing per-tpk try/catch
      // (T-11-05 precedent).
      const rawAppId = tpk.steam_app_id
      const steamAppId =
        platform === 'steam' &&
        (typeof rawAppId === 'string' || typeof rawAppId === 'number')
          ? String(rawAppId)
          : undefined

      keys.push({
        gamekey,
        machineName,
        state,
        title,
        platform,
        expiration,
        origin: orderLabel,
        steamAppId,
        // Overlay fields default here; dedup.ts (later plan) fills them in.
        ownedElsewhere: false,
        matchConfidence: 'none'
      })
    } catch {
      // Defensive net for any unexpected shape not caught by the guards
      // above — never let one bad entry fail the whole order.
      continue
    }
  }

  // D-27: an unpicked Humble Choice month is a single UNPICKED pseudo-entry
  // at the order/product level — only when no tpks were allocated at all.
  // Never throws when choice_url/deadline are absent; simply omits the
  // pseudo-entry (Pitfall 2 defensive handling, Assumption A1/A2).
  if (keys.length === 0 && rawProduct) {
    if (
      rawProduct.category === 'subscriptioncontent' &&
      rawProduct.choice_url
    ) {
      // WR-07: normalize the deadline through the SAME tolerant helper as
      // every tpk expiration. The field name is speculative (Assumption A2),
      // so an unparseable live value must degrade to null (-> the
      // no-deadline display) — a raw copy previously rendered the literal
      // "Invalid Date" and produced NaN comparisons in byExpiringSoonest.
      const rawDeadline = (rawProduct as Record<string, unknown>).deadline_date
      const deadline =
        typeof rawDeadline === 'string'
          ? extractExpiration({ expiry_date: rawDeadline }, now)
          : null
      keys.push({
        gamekey,
        machineName: `${gamekey}:unpicked`,
        state: 'UNPICKED',
        title: rawProduct.human_name ?? orderLabel,
        platform: 'humble-choice',
        expiration: deadline,
        origin: orderLabel,
        ownedElsewhere: false,
        matchConfidence: 'none'
      })
    }
  }
  // D-29: no key-evidenced tpks and no subscriptioncontent product (a
  // DRM-free-only entitlement order — empty all_tpks OR all entries lacking
  // key_type) -> keys stays empty. DRM-free downloads are excluded from the
  // inventory entirely.

  const allTerminal =
    keys.length > 0 && keys.every((key) => isTerminal(key.state))
  // 14-08 gap closure (Fix 2): computed alongside allTerminal via the
  // single-sourced isFreezeEligible helper — distinct semantic (server-side
  // terminality, restores D-24 freeze for REVEALED-without-pending-expiry
  // orders), never conflated with allTerminal's user-journey meaning.
  // CR-01 (14-08 re-review): a REVEALED key is only freeze-eligible when its
  // value is actually present. The signal here is the STRING side-channel
  // (revealedKeyValueByComposite) — the same signal library.ts persists onto
  // the internal `revealedKeyValue` field — so this computation and
  // fetchAndCommitOrder's recompute over the merged keys agree exactly for a
  // fresh order. Deliberate consequence: a non-Steam key whose server value
  // is an OBJECT (omitted from the string side-channel above) never
  // freezes and keeps re-fetching — consistent with its honest Pitfall-B
  // "unconfirmed" getRevealedKeyValue path, and stale-safe (a residual
  // re-fetch, never a stranded key).
  const freezeEligible =
    keys.length > 0 &&
    keys.every((key) =>
      isFreezeEligible({
        state: key.state,
        expiration: key.expiration,
        revealedKeyValuePresent:
          `${gamekey}:${key.machineName}` in revealedKeyValueByComposite
      })
    )

  return {
    gamekey,
    keys,
    allTerminal,
    freezeEligible,
    keyIndexByComposite,
    revealedKeyValueByComposite
  }
}

// Cap on field-name lists in the zero-key diagnosis — enough to recognize a
// stripped/drifted response shape without an unbounded log line.
const MAX_DIAGNOSED_FIELDS = 15

/** Redacted zero-key extraction diagnosis (see describeZeroKeyOrder). */
export interface ZeroKeyDiagnosis {
  /**
   * true when the structure is UNEXPECTED for a zero-key order: tpkd_dict or
   * all_tpks absent/null/mistyped, or a NON-EMPTY all_tpks with entries that
   * should have classified but didn't. false only for the legitimate D-29
   * exclusion shapes — an explicit empty all_tpks array (DRM-free order) or
   * a non-empty array whose entries are ALL download entitlements (objects
   * without key_type, e.g. a PDF/ebook bundle — round 5).
   */
  anomalous: boolean
  /** Structural summary: field NAMES/paths, types and skip reasons only. */
  detail: string
}

function fieldNames(value: object): string {
  const names = Object.keys(value)
  const shown = names.slice(0, MAX_DIAGNOSED_FIELDS).join(',')
  const suffix =
    names.length > MAX_DIAGNOSED_FIELDS
      ? `,+${names.length - MAX_DIAGNOSED_FIELDS} more`
      : ''
  return `[${shown}${suffix}]`
}

/**
 * Pure, fully-redacted structural diagnosis for an order that classified to
 * ZERO HumbleKeys (live-UAT round 3, debug session
 * humble-zero-keys-from-valid-orders: 25/25 orders parsed ok yet keysCached=0
 * with no way to tell WHY from the logs). Reports only structure — field
 * NAMES, value TYPES, array lengths and per-element skip reasons. NEVER a
 * field value, key value or cookie (C5/T-11-04). No I/O and no logging here
 * (module discipline) — library.ts logs the returned detail.
 */
export function describeZeroKeyOrder(rawOrder: OrderDetail): ZeroKeyDiagnosis {
  const rawTpkdDict = (rawOrder as Record<string, unknown>).tpkd_dict

  if (rawTpkdDict === undefined || rawTpkdDict === null) {
    return {
      anomalous: true,
      detail: `tpkd_dict=${rawTpkdDict === null ? 'null' : 'absent'} order_fields=${fieldNames(rawOrder)}`
    }
  }
  if (typeof rawTpkdDict !== 'object') {
    return {
      anomalous: true,
      detail: `tpkd_dict=non-object(${typeof rawTpkdDict}) order_fields=${fieldNames(rawOrder)}`
    }
  }

  const rawAllTpks = (rawTpkdDict as Record<string, unknown>).all_tpks
  if (rawAllTpks === undefined || rawAllTpks === null) {
    return {
      anomalous: true,
      detail: `tpkd_dict.all_tpks=${rawAllTpks === null ? 'null' : 'absent'} tpkd_dict_fields=${fieldNames(rawTpkdDict)}`
    }
  }
  if (!Array.isArray(rawAllTpks)) {
    return {
      anomalous: true,
      detail: `tpkd_dict.all_tpks=non-array(${typeof rawAllTpks}) tpkd_dict_fields=${fieldNames(rawTpkdDict)}`
    }
  }

  if (rawAllTpks.length === 0) {
    // The one legitimate zero-key shape (DRM-free order / unpicked month
    // handled separately by the UNPICKED branch).
    return { anomalous: false, detail: 'tpkd_dict.all_tpks=array(0)' }
  }

  // Non-empty tpk array that still yielded zero keys: name the structural
  // check each element failed. classifyOrder skips falsy/non-object elements
  // and (D-29 rounds 5+6) download entitlements — objects without a string
  // key_type, or direct-redeem entitlements. Field NAMES only for shapes
  // (C5); the round-6 branch additionally carries the key_type /
  // key_type_human_name VALUES (C5-permitted type labels) so a wrong
  // discriminator is conclusively visible on the next live run.
  const skipped = rawAllTpks
    .slice(0, MAX_DIAGNOSED_FIELDS)
    .map((element, index) => {
      if (!element || typeof element !== 'object') {
        return `[${index}]:non-object(${element === null ? 'null' : typeof element})`
      }
      const tpk = element as Record<string, unknown>
      if (typeof tpk.key_type !== 'string') {
        return `[${index}]:no-key_type(fields=${fieldNames(tpk)})`
      }
      if (isDirectRedeemEntitlement(tpk)) {
        return `[${index}]:direct-redeem-entitlement(${tpkTypeLabels(tpk)})`
      }
      // An inventory-key object element should have classified — if we are
      // here anyway, the guarded loop's defensive catch fired (e.g.
      // isRevealed threw).
      return `[${index}]:object-skipped-by-defensive-catch fields=${fieldNames(tpk)}`
    })
  // A non-empty array whose entries are ALL download entitlements (objects
  // without key_type — round 5 — or direct-redeem entitlements — round 6) is
  // the LEGITIMATE zero-key shape: a PDF/ebook bundle excluded per D-29.
  // Anything else (non-object elements, or an inventory-key entry that still
  // got skipped) is anomalous. Checked over the FULL array, not the capped
  // detail slice.
  const allDownloadEntitlements = rawAllTpks.every(
    (element) =>
      element !== null &&
      typeof element === 'object' &&
      !isInventoryKeyTpk(element as Record<string, unknown>)
  )
  return {
    anomalous: !allDownloadEntitlements,
    detail: `tpkd_dict.all_tpks=array(${rawAllTpks.length}) skipped=[${skipped.join(' ')}]`
  }
}

/**
 * Redacted skipped-entitlement diagnosis for orders that DID produce keys
 * (live-UAT rounds 5+6). classifyOrder skips all_tpks entries without a
 * string `key_type` (round 5) and direct-redeem entitlements (round 6, D-29
 * v2); for a MIXED order (keys + entitlements) the zero-key diagnosis above
 * never runs, so this helper keeps those skips discoverable. no-key_type
 * skips carry field NAMES only; direct-redeem skips carry the key_type /
 * key_type_human_name VALUES (C5-permitted type labels — never a key value)
 * so a wrong round-6 discriminator is conclusively visible on the next live
 * run. Returns null when nothing was skipped. No I/O and no logging here
 * (module discipline) — library.ts logs the detail.
 */
export function describeSkippedEntitlements(
  rawOrder: OrderDetail
): string | null {
  const rawTpks = rawOrder.tpkd_dict?.all_tpks ?? []
  const skipped: string[] = []
  let noKeyType = 0
  let directRedeem = 0

  for (const [index, rawTpk] of rawTpks.entries()) {
    if (!rawTpk || typeof rawTpk !== 'object') {
      continue
    }
    const tpk = rawTpk as Record<string, unknown>
    if (typeof tpk.key_type !== 'string') {
      noKeyType += 1
      if (skipped.length < MAX_DIAGNOSED_FIELDS) {
        skipped.push(`[${index}]:no-key_type(fields=${fieldNames(tpk)})`)
      }
      continue
    }
    if (isDirectRedeemEntitlement(tpk)) {
      directRedeem += 1
      if (skipped.length < MAX_DIAGNOSED_FIELDS) {
        skipped.push(
          `[${index}]:direct-redeem-entitlement(${tpkTypeLabels(tpk)})`
        )
      }
    }
  }

  if (noKeyType + directRedeem === 0) {
    return null
  }
  return `skippedNoKeyType=${noKeyType} skippedDirectRedeem=${directRedeem} skipped=[${skipped.join(' ')}]`
}

/**
 * Redacted expiration-field discovery diagnosis (live-UAT round 4). Because the
 * real Humble expiration field name is not conclusively documented anywhere
 * (see ABSOLUTE_EXPIRATION_FIELDS), extractExpiration reads a best-evidence
 * candidate set — this pure helper surfaces, for tpks where we still could NOT
 * date the key AND `is_expired` is not already `true` (i.e. a live/active key
 * that ought to show a future expiration but rendered "No expiration"), the
 * DISTINCT field NAMES present on those tpks. Names only, never values
 * (C5/T-11-04) — so the next live run reveals the true date field to add to the
 * candidate set. Returns null when every tpk was datable or already expired
 * (nothing to diagnose). No I/O and no logging here (module discipline) —
 * library.ts logs the returned detail.
 */
export function describeMissingExpirationTpks(
  rawOrder: OrderDetail,
  now: Date = new Date()
): string | null {
  const rawTpks = rawOrder.tpkd_dict?.all_tpks ?? []
  const names = new Set<string>()
  let missing = 0

  for (const rawTpk of rawTpks) {
    if (!rawTpk || typeof rawTpk !== 'object') {
      continue
    }
    const tpk = rawTpk as Record<string, unknown>
    // Download entitlements (no key_type — round 5 — or direct-redeem
    // entitlements — round 6, D-29 v2) are not keys — they never become
    // rows, so an undatable one is not a "No expiration" bug.
    if (!isInventoryKeyTpk(tpk)) {
      continue
    }
    // Already-expired keys (is_expired === true) classify correctly without a
    // date, so they are not the "No expiration" bug we are hunting — skip them.
    if (tpk.is_expired === true) {
      continue
    }
    if (extractExpiration(tpk, now) !== null) {
      continue
    }
    missing += 1
    for (const name of Object.keys(tpk)) {
      names.add(name)
    }
  }

  if (missing === 0) {
    return null
  }
  const shown = [...names].slice(0, MAX_DIAGNOSED_FIELDS).join(',')
  const suffix =
    names.size > MAX_DIAGNOSED_FIELDS
      ? `,+${names.size - MAX_DIAGNOSED_FIELDS} more`
      : ''
  return `tpksMissingExpiration=${missing} candidateFields=[${shown}${suffix}]`
}
