---
status: awaiting_human_verify
trigger: "Phase 11 Humble key sync live-UAT round 3: 'Humble sync finished: gamekeys=25 fetched=25/25 frozen=0 ok=25 schema_error=0 denied=0 expired=0 transient=0 keysCached=0' — all orders fetched and parsed ok, zero keys extracted; account verifiably has 1 direct-purchase Steam key + several gift keys"
created: 2026-07-06T00:00:00Z
updated: 2026-07-06T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED (to the limit of no-live-access) — see reasoning_checkpoint
test: cross-referenced two working integrations' source (Playnite HumbleKeysLibrary, FailSpy humble-steam-key-redeemer) against our adapter/classify; full code trace proves parse/classify/store cannot lose a PRESENT all_tpks
expecting: fix = request `?all_tpkds=true` + real-field-name tolerant classification + zero-keys structural diagnostics so the next live run is conclusive either way
next_action: DONE — fix applied, red/green demonstrated (17 new tests fail pre-fix across 3 suites), targeted suite 139/139 + codecheck + npm test 440/440 green, committed. Awaiting human live re-test: keys appear, or the new per-order "zero keys" diagnostic lines name the exact structural failure.

reasoning_checkpoint:
  hypothesis: "Zero keys from 25 ok-parsed orders because the adapter's order-detail request omits the `?all_tpkds=true` query param that every working Humble integration sends (Playnite HumbleKeysLibrary orderUrlMask, FailSpy humble-steam-key-redeemer) — without it Humble does not reliably include the full tpkd_dict.all_tpks allocation, so classifyOrder receives no tpks to classify. Two additional evidenced field-name divergences make classification wrong even when tpks DO arrive: the real redeemed field is `redeemed_key_val` (not the spec's `redeemed_key_value`) and the real expiry signal is `is_expired: bool` (not an `expiration` string)."
  confirming_evidence:
    - "Code trace: classifyOrder produces a HumbleKey for EVERY object element of all_tpks (all field reads individually guarded with fallbacks) — zero keys across 25 orders is only possible if all_tpks was absent/empty/non-object-elements in every parsed response"
    - "Round 2 scratch experiment (prior session) already proved a payload WITH all_tpks parses through the real OrderDetailSchema and classifies to 1 key — parse-side loss eliminated; realstore test proves store commit/read-back with real conf works"
    - "Playnite HumbleKeysLibrary Services/HumbleKeysAccountClient.cs line 20: orderUrlMask = 'https://www.humblebundle.com/api/v1/order/{0}?all_tpkds=true'; FailSpy humblesteamkeysredeemer.py line 88: `${HUMBLE_ORDER_DETAILS_API}${order['gamekey']}?all_tpkds=true` — GameLib requests /api/v1/order/{gamekey} with NO query param in every version since Phase 10"
    - "Playnite Models/Order.cs Tpk model (real-payload ground truth): fields are machine_name, gamekey, key_type, visible, key_type_human_name, human_name, class, library_family_name, steam_app_id, is_expired (bool), redeemed_key_val (JToken) — NO `redeemed_key_value`, NO `expiration` string; FailSpy reads key['redeemed_key_val'] and exports is_expired, corroborating"
    - "Round-3 log line ok=25 schema_error=0 keysCached=0 printed successfully — getKeys() in the template literal iterated 25 committed entries without throwing, so all entries carried keys: [] (classify returned zero keys 25 times; store exonerated)"
  falsification_test: "If live all_tpks were present with object elements, classifyOrder MUST produce keys (code trace + round-2 experiment). Post-fix falsification on next live run: if keys STILL don't appear, the new zero-key structural diagnostics will log per-order whether tpkd_dict/all_tpks is absent, empty, or populated-but-skipped, with field names — if they show all_tpks POPULATED and keys still zero, this hypothesis chain is wrong and the log names the exact structural check that failed"
  fix_rationale: "Request-side: append ?all_tpkds=true so Humble is actually ASKED for the full tpk allocation — the same request every working integration sends; this addresses the root cause (data never requested), not the symptom. Classification-side: read redeemed_key_val ?? redeemed_key_value and honor is_expired === true, so real payloads classify to the correct 5-state values (latent misclassification fixed at the same seam). Diagnosability: any order committing zero keys now logs a redacted structural diagnosis (field names/types/skip reasons only) so a residual live mismatch is self-diagnosing"
  blind_spots: "Cannot reach the live API: (1) cannot confirm which order types omit all_tpks without the param — the Phase 10 gate DID observe all_tpks+steam_app_id on ONE order without it (2026-07-05, same account), so omission is conditional (order type, session freshness, or Humble-side variance), and the param may not be the whole story; (2) the exact live shape of redeemed_key_val for non-steam keys is unverified (Playnite types it JToken — could be an object; Boolean() truthiness handles it); (3) response could theoretically carry tpks in a location other than tpkd_dict.all_tpks for some order types — the new diagnostics log top-level and tpkd_dict field names, which would reveal this on the next run"

## Symptoms

expected: After sync, keysCached >= number of Steam keys on the account (1 direct purchase + several gift keys); Humble Keys list non-empty
actual: keysCached=0 and empty keys list, while ALL 25 orders fetch and schema-parse ok (ok=25 schema_error=0 denied=0 expired=0 transient=0)
errors: none — sync completes cleanly; the failure is silent key loss between parsed order and committed HumbleKey
reproduction: dev build at HEAD 3545d4c4 (includes round-2 fixes), real Humble account, run sync; observe summary log line
started: has never worked live (rounds 1-2 fixed spinner/store/propagation issues; this is the first run where all orders fetch+parse clean)

## Eliminated

- hypothesis: (round 2, carried) Whole-order zod schema failure on real object payloads
  evidence: ok=25 schema_error=0 in round-3 log; every OrderDetailSchema field is optional/nullish/passthrough
  timestamp: 2026-07-06

- hypothesis: (round 2, carried) Per-order failures (HTML interstitial schema_error / 429 denial) leaving list empty
  evidence: round-3 log shows schema_error=0 denied=0 transient=0 — round 2's own falsification test for this explanation triggered
  timestamp: 2026-07-06

## Evidence

- timestamp: 2026-07-06
  checked: knowledge base + prior debug sessions (humble-sync-spinner-never-ends, humble-keys-empty-list-flashing-sync)
  found: round 1 fixed CacheStore.entries() __timestamp pseudo-entry leak; round 2 fixed sync-state propagation + added the summary log now in evidence; round 2's scratch experiment proved a realistic payload WITH all_tpks parses through the REAL OrderDetailSchema and classifies to 1 UNREVEALED steam key
  implication: parse+classify chain is proven to produce keys when all_tpks is present with object elements

- timestamp: 2026-07-06
  checked: classify.ts classifyOrder loop (full read)
  found: the ONLY skip conditions are (a) rawOrder.tpkd_dict?.all_tpks absent -> rawTpks=[]; (b) element is falsy or typeof !== 'object'; (c) defensive catch (isRevealed() or Date could throw). Every field access is individually guarded with typeof checks and fallbacks — machine_name, key_type, human_name, redeemed_key_value, expiration can ALL be absent/mistyped and the tpk still classifies (D-28 compliant; no steam_app_id requirement anywhere)
  implication: an object element in all_tpks CANNOT be dropped except via a thrown isRevealed(); zero keys from 25 ok orders forces all_tpks to be absent/empty/non-object-elements at classify time for every order

- timestamp: 2026-07-06
  checked: adapter.ts OrderDetailSchema (current) vs Phase 10 gate version (git 43b73e00)
  found: both versions declare all_tpks explicitly and passthrough everywhere; zod cannot strip a declared, successfully-parsed array; union with z.unknown() means elements are never rejected. Request URL identical in both: GET /api/v1/order/{gamekey} with X-Requested-By hb_android_app — NO all_tpks query param in ANY version
  implication: parse-side data loss impossible; request has never asked for all_tpks explicitly

- timestamp: 2026-07-06
  checked: 10-VALIDATION.md live gate (2026-07-05, same account, same adapter URL)
  found: gate criterion 3 PASSED — tpkd_dict.all_tpks[n].steam_app_id present on at least one entry of the FIRST gamekey. So at gate time at least one order returned populated all_tpks without the query param
  implication: absence-at-source is conditional, not universal — response content varies (by order type, session freshness, or Humble-side behavior). Tension with round-3 zero-keys means diagnosis MUST be instrumented; fix must be request-side + tolerant + diagnosable

- timestamp: 2026-07-06
  checked: library.ts commit path + cache.ts + library.realstore.test.ts + electron-store mock
  found: realstore test runs REAL conf in tmp dir; entries() __timestamp exclusion covers both shapes; a throw in classify/set would reject sync before the summary line prints, and getKeys() in the template literal would throw on non-iterable entry.keys — the line printed, so 25 entries committed with keys: [] each
  implication: store read-back exonerated; classifyOrder literally returned zero keys 25 times

- timestamp: 2026-07-06
  checked: working third-party integrations' order-detail request construction (web research)
  found: Playnite HumbleKeysLibrary (Services/HumbleKeysAccountClient.cs:20) uses 'https://www.humblebundle.com/api/v1/order/{0}?all_tpkds=true'; FailSpy humble-steam-key-redeemer (humblesteamkeysredeemer.py:88) uses '${gamekey}?all_tpkds=true'. GameLib sends NO query param (never has, any version)
  implication: the community-standard request for full tpk enumeration is ?all_tpkds=true (note the 'd' — tpkDs); its absence is the leading explanation for orders arriving without usable all_tpks

- timestamp: 2026-07-06
  checked: real-payload tpk field names (Playnite Models/Order.cs Tpk class + FailSpy field reads)
  found: real fields are redeemed_key_val (JToken/any — NOT redeemed_key_value) and is_expired (bool — NOT an expiration string); also steam_app_id, key_type_human_name, visible, class, library_family_name. HUMBLE-SPEC-SOURCE.md's redeemed_key_value/expiration names do not match either working integration
  implication: even when tpks arrive, classify.ts would misclassify REDEEMED as UNREVEALED and never detect expiry — latent state bugs fixed at the same seam; fixtures pass because they were authored from the spec's (inaccurate) field names

## Eliminated (round 3 additions)

- hypothesis: classifyOrder skips real tpks via a strict field/steam_app_id requirement (primary-hypothesis strict form)
  evidence: full code trace — every field read is individually guarded with typeof checks and fallbacks; no steam_app_id check exists; any object element always pushes a key (D-28 compliant)
  timestamp: 2026-07-06

- hypothesis: zod union degradation to z.unknown() causes classify to discard tpks
  evidence: z.unknown() branch passes the raw element through unchanged; classify reads the raw object with guarded access — degraded elements still classify
  timestamp: 2026-07-06

- hypothesis: CacheStore commit/read-back loses committed keys (getKeys returns [] despite non-empty entries)
  evidence: library.realstore.test.ts exercises real conf; round-3 summary line's getKeys() iterated all 25 entries without throwing — entries existed with keys: []
  timestamp: 2026-07-06

## Resolution

root_cause: |
  The tpk-extraction path diverges from the REAL Humble API (as modelled by the two working
  integrations, Playnite HumbleKeysLibrary and FailSpy humble-steam-key-redeemer) in three ways:
  (1) PRIMARY — the order-detail request omitted the `?all_tpkds=true` query param that every
  working integration sends on GET /api/v1/order/{gamekey}. Without it Humble does not reliably
  include the full tpkd_dict.all_tpks allocation, so classifyOrder received no tpks to classify:
  25/25 orders parse ok (every schema field optional/passthrough), classify to keys: [], commit,
  and the sync reports ok=25 keysCached=0 with zero log evidence. Code trace proves classify
  cannot drop an object tpk and the store read-back is sound (round-1 fix + realstore tests) —
  absence-at-source is the only shape consistent with the round-3 log line.
  (2) LATENT — the real redeemed field is `redeemed_key_val` (any JSON type), not the spec's
  `redeemed_key_value`; live REDEEMED keys would have classified UNREVEALED.
  (3) LATENT — the real expiry signal is `is_expired: bool`, not an `expiration` timestamp
  string; live expirations would never have been detected.
  Fixtures passed while live failed because they were authored from HUMBLE-SPEC-SOURCE.md's
  (inaccurate) field names and always embed populated all_tpks; no test asserted the request URL.
  Caveat (blind spot, instrumented): the Phase 10 gate observed all_tpks WITHOUT the param on one
  order (2026-07-05, same account), so omission is conditional (order type / session variance) —
  the new zero-key diagnostics make the next live run conclusive even if the param is not the
  whole story.
fix: |
  - adapter.ts: getOrderDetail now requests /api/v1/order/{gamekey}?all_tpkds=true (community-
    standard param, spelling verified against Playnite + FailSpy). OrderDetailTpkSchema documents
    the real fields (redeemed_key_val: z.unknown().nullish(), is_expired: z.boolean().nullish())
    while keeping spec names as fallbacks; gamekey/tpkd_dict/all_tpks are .nullish() so a live
    null degrades to "no tpks" (diagnosed) instead of failing the whole order into schema_error.
    .passthrough() preserved at every level; a tpk needs nothing beyond being an object.
  - classify.ts: redeemedKeyValuePresent = Boolean(tpk.redeemed_key_val ?? tpk.redeemed_key_value)
    (truthiness on purpose — non-Steam redeemed values can be objects); is_expired === true now
    classifies UNREDEEMABLE at the same D-30 precedence tier as a past expiration (expiry still
    beats redeemed + local reveal; ordering untouched). New pure describeZeroKeyOrder() returns a
    fully-redacted structural diagnosis (field NAMES, types, array lengths, per-element skip
    reasons — never values).
  - library.ts: any ok order that classifies to zero keys logs the diagnosis (logWarning for
    anomalous shapes: tpkd_dict/all_tpks absent/null/mistyped or a non-empty array yielding
    nothing; logInfo for the one legitimate shape, an explicit empty array per D-29). The sync
    summary line now carries zeroKeyOrders=N.
verification: |
  Red/green demonstrated: with adapter.ts/classify.ts/library.ts stashed to pre-fix state, 17 of
  the new tests fail across 3 suites (missing ?all_tpkds=true URL, tpkd_dict:null schema_error,
  redeemed_key_val ignored, is_expired ignored, describeZeroKeyOrder absent, no zero-key log, no
  zeroKeyOrders counter); with the fix restored all pass. `npx jest src/backend/humble/__tests__
  src/backend/__tests__/cache.test.ts --no-coverage` → 6 suites, 139 tests, exit 0. `npm run
  codecheck` → exit 0. `npm test` → 29 suites, 440 tests, exit 0 (pre-existing worker force-exit
  warning unchanged). Live re-verify required: keys appear, or gamelib.log's per-order
  'zero keys' lines + summary zeroKeyOrders name the exact structural failure.
files_changed:
  - src/backend/humble/adapter.ts (?all_tpkds=true on order detail; real-field tpk schema; nullish tolerance for gamekey/tpkd_dict/all_tpks)
  - src/backend/humble/classify.ts (redeemed_key_val fallback chain; is_expired flag at D-30 expiry tier; pure describeZeroKeyOrder diagnosis)
  - src/backend/humble/library.ts (zero-key structural diagnostic logging; zeroKeyOrders in sync summary)
  - src/backend/humble/__tests__/fixtures/tpks.ts (real-world payload fixtures: direct purchase, redeemed_key_val, is_expired, gift key, minimal {} tpk, stripped no-tpkd_dict order)
  - src/backend/humble/__tests__/adapter.test.ts (URL param regression; null tolerance; real-shape retention)
  - src/backend/humble/__tests__/classify.test.ts (real-shape classification; is_expired precedence; describeZeroKeyOrder incl. C5 redaction)
  - src/backend/humble/__tests__/library.test.ts (zero-key diagnostic fires; severity split; zeroKeyOrders summary; C5 key-value redaction sweep)
