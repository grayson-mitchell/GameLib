use super::*;

mod invite_picker;
pub(crate) use invite_picker::*;
mod humble_cookies;
pub(crate) use humble_cookies::*;
mod humble_reveal;
pub(crate) use humble_reveal::*;
mod humble_open;
pub(crate) use humble_open::*;
mod devtools;
pub(crate) use devtools::*;
mod humble_helpers;
pub(crate) use humble_helpers::*;
mod windows_cdp;
#[cfg(any(target_os = "macos", windows))]
pub(crate) use windows_cdp::*;
#[cfg(target_os = "macos")]
mod pristine_epic;
#[cfg(target_os = "macos")]
pub(crate) use pristine_epic::*;
#[cfg(target_os = "macos")]
mod sheet;
#[cfg(target_os = "macos")]
pub(crate) use sheet::*;

// ---- Login-window (child WebviewWindow) support (Phase 34.4.1 Plan 01, D-01/D-02) ----
//
// D-02's resolved shape: a runner-agnostic set of `dispatch_rust_channel` arms -- nothing
// below knows what Humble is -- reached only via `requestRustInvoke()` from the headless
// Node sidecar, the same pattern as the keyring/dialog_open/clipboard arms above and
// below. Pure logic (label generation, URL validation, the domain-suffix filter, event
// shaping) is extracted into `AppHandle`-free functions here, proven by
// `#[cfg(test)] mod tests`; the arms' actual `WebviewWindowBuilder`/`cookies()`/
// `delete_cookie()` calls are proven empirically instead, by this phase's REQ-34.4.1-12
// blocking live gate (`34.4.1-LIVE-GATE.md`), the same split Phase 34.3's clipboard arms
// use.

/// Monotonic counter feeding `next_login_window_label()`. Process-static, mirrors this
/// file's existing `SidecarState::next_id()` counter shape.
static LOGIN_WINDOW_LABEL_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Navigation events observed by the `on_page_load` hook (Pattern 4 below), queued per
/// window label and drained by `humble_login_take_events`. `Mutex<Option<HashMap<..>>>`
/// rather than `Mutex<HashMap<..>>` because `HashMap::new()` is not a `const fn` (its
/// default `RandomState` seed is not const-constructible) -- the map is created lazily on
/// first use instead.
pub(crate) static LOGIN_WINDOW_EVENTS: Mutex<Option<HashMap<String, Vec<Value>>>> = Mutex::new(None);

/// Per-label cap on `LOGIN_WINDOW_EVENTS`, oldest-dropped past this bound (threat
/// T-34.4.1-09): a page that navigates in a loop must not grow the queue without bound
/// between `humble_login_take_events` drains.
const LOGIN_WINDOW_EVENTS_CAP: usize = 50;

/// Canonical label for the app's single Tauri-managed main window (the only entry in
/// `tauri.conf.json`'s `app.windows` array). Used both by the always-compiled tray/devtools
/// call sites below (`main()`'s `.setup()` closure) and by the macOS-only login-window
/// attachment helpers this phase adds (Phase 34.4.2 Plan 02) -- kept as a single plain
/// `const`, not `#[cfg(target_os = "macos")]`-gated, so the label has exactly one definition
/// across the whole file regardless of which call sites end up using it on a given platform.
pub(crate) const MAIN_WINDOW_LABEL: &str = "main";

/// Bound on how long `keyring_get` waits for its worker-thread Keychain read before classifying
/// the call as `keyring:timeout` (34.4.1 gap cycle 2 plan 26, F-9 observability half,
/// T-34.4.1-114/T-34.4.1-115; raised 8s -> 45s by Phase 34.5 gap cycle 4 plan 35, closing Routing
/// item 3). This is OBSERVABILITY, not a fix for F-9's underlying cause, which this plan does NOT
/// establish as a single clean answer (see
/// `keyring_read_timing_hypothesis_absent_vs_present_entry`'s own doc comment and
/// `34.4.1-26-SUMMARY.md` for the full timed verdict).
///
/// Chosen from that harness's own recorded timings on this machine: an absent-entry read
/// completed in 40-102ms across two runs (fast, `NoEntry`, no authorization needed). A
/// present-entry read against the real `steam-refresh-token` account took 48.9s on one run and
/// **291s** on another, both ultimately resolving `PlatformFailure(-60008, "Unable to obtain
/// authorization for this operation")` -- live, hardware-measured evidence for
/// `deferred-items.md`'s ad-hoc-signature/Keychain-ACL theory, reproduced from this same-machine,
/// non-interactive `cargo test` process (a different code identity than the built `gamelib-shell`
/// app, so these exact numbers are illustrative of the MECHANISM, not a promise about the app's
/// own timing).
///
/// **Why 8s was wrong and 45s is the replacement.** A 2026-08-01 live session recorded TWO
/// separate macOS Keychain approval prompts for the same `steam-refresh-token` slot, 19:22:57 and
/// 19:24:38 -- the exact outcome plan 34.5-25's own decision rule defines as FALSIFIED. 8 seconds
/// is shorter than the time a human plausibly takes to notice, read and approve a Keychain
/// authorization dialog, so a human-speed approval could never complete inside the old bound; the
/// read timed out, the worker thread that eventually got the real (human-approved) answer was
/// already abandoned, and the next caller had to prompt again. Two selecting constraints pick 45s:
/// it must exceed ordinary human Keychain-approval time (8s demonstrably does not), and it must
/// stay strictly under the sidecar's own `RUST_INVOKE_TIMEOUT_MS` (60_000ms,
/// `src/backend/sidecar/sidecarRpc.ts`) with enough round-trip headroom that a slow read is still
/// reported as the specific, named `keyring:timeout` rather than degrading into an opaque
/// transport timeout raised by that outer layer instead. 45s satisfies both: comfortably above
/// human approval time, and 15s of raw headroom under the 60s invoke bound -- of which this
/// file's own `#[cfg(test)]` assertion
/// (`keyring_read_timeout_stays_strictly_under_the_sidecar_invoke_bound_with_round_trip_headroom`)
/// enforces at least 10s as a minimum round-trip margin.
///
/// **45s does NOT cover the 291s worst case measured above, and that is deliberate.** That
/// worst-case number is attributed to `deferred-items.md`'s ad-hoc-code-signing /
/// Keychain-ACL-non-persistence theory -- a likely DEV-BUILD severity modifier (an ad-hoc dev
/// signature means the Keychain ACL never persists, so every run re-triggers a slow authorization
/// negotiation), not an established production cause, and this plan does not investigate or fix
/// it. A read that genuinely takes 291s will still time out under the new bound exactly as it did
/// under the old one; only the human-speed-approval case (the live-confirmed defect) is fixed
/// here.
///
/// A timed-out worker thread is ABANDONED, not cancelled: `SecItemCopyMatching` has no interrupt
/// API, so this bound protects the RPC round trip, not the underlying OS call -- the abandoned
/// thread keeps running (and, per this harness's own measurement, may keep running for minutes)
/// on its own.
pub(crate) const KEYRING_READ_TIMEOUT: Duration = Duration::from_secs(45);

/// Host this arm uses to decide whether the window it is about to open is Epic's --
/// the ONLY signal available here, since `LoginWindowSeam.open()` (`loginWindowSeam.ts`)
/// takes no `runner` argument and `humble_login_open` is runner-agnostic by design. Mirrors
/// the literal host of `EPIC_LOGIN_URL` (`frontend/screens/WebView/loginRoutes.ts:45`,
/// READ ONLY, never imported -- this file has no access to frontend source at build time)
/// without changing that constant, per this cycle's hard constraint.
pub(crate) const EPIC_LOGIN_HOST: &str = "www.epicgames.com";

/// GOG's login entry host (`GOG_LOGIN_URL`, `loginRoutes.ts`). GOG added a Cloudflare Turnstile
/// check that fails inside the Tauri-injected login window, so on macOS it takes the same
/// pristine (injection-free) WKWebView route as Epic. Host-keyed like `EPIC_LOGIN_HOST`; never
/// caller-chosen. The function/delegate keep their Epic names (historical).
pub(crate) const GOG_LOGIN_HOST: &str = "auth.gog.com";

/// The domain-suffix targets `humble_login_clear_cookies`'s pristine-window fallback (below)
/// gates on -- MUST stay paired, entry for entry, with `legendary/user.ts`'s own
/// `EPIC_COOKIE_HOSTS` constant, whose `clearEpicCookies` step passes these values as `domain`
/// ONE AT A TIME, one `humble_login_clear_cookies` call per entry. The two lists are
/// hand-maintained mirrors of each other (this file has no build-time access to frontend or
/// backend TS source, so nothing can derive one from the other); each names the other in its
/// own comment so a reviewer editing one is told, in place, that the other exists.
///
/// APEX domains, deliberately, not hostnames: `cookie_domain_matches` (above) does the suffix
/// work, so `epicgames.com` covers `www.epicgames.com`, `.ecosec.on.epicgames.com` and every
/// other subdomain a session cookie may be scoped to. That is also why this is NOT derived from
/// `EPIC_LOGIN_HOST`, which is a full hostname (`www.epicgames.com`) rather than the
/// cookie-domain suffix Epic's session cookies are actually set against.
///
/// Why a LIST and not the single `epicgames.com` this used to be (Phase 35 plan 09, operator
/// decision D-09-CORRECTED, 2026-08-29): `35-AB-RETEST.md` Item 7 measured `EPIC_DEVICE`
/// surviving an Epic logout on `.fortnite.com`, `.twinmotion.com`, `.unrealengine.com` and
/// `.metahuman.com`. An `epicgames.com` suffix filter cannot match any of those BY
/// CONSTRUCTION, so the fix is to widen the filter -- NOT to change the mechanism. The blanket
/// browsing-data wipe this file prohibits in three separate places stays banned (REQ-34.4.1-06);
/// this doc comment deliberately does NOT spell that API's name, so a `grep -c` of it over this
/// file keeps returning exactly those three prohibitions and nothing else. The jar is app-wide,
/// and a blanket wipe would sign the user out of storefronts they never touched.
///
/// Accepted cost, chosen explicitly by the operator over a filter that cannot match: this list
/// is maintained BY HAND and can go stale if Epic adds a domain. It is scoped to Epic-owned
/// apexes only -- widening it to any non-Epic domain would recreate exactly the over-broad
/// clear `REQ-34.4.1-06` closed, which is why `epic_cookie_domain_matches` below is tested in
/// BOTH directions (every member matches; Humble/GOG/Amazon still do not).
#[cfg(target_os = "macos")]
pub(crate) const EPIC_COOKIE_DOMAINS: &[&str] = &[
    "epicgames.com",
    "fortnite.com",
    "unrealengine.com",
    "twinmotion.com",
    "metahuman.com",
];

/// True when `domain` is (or is a subdomain of) ANY Epic-owned apex in `EPIC_COOKIE_DOMAINS`.
///
/// Delegates every comparison to `cookie_domain_matches` (above) -- the ONE domain comparator in
/// this file, born from F-34.4.2-19 and weeks of silent Humble-login failure. A hand-rolled
/// suffix test here would be a SECOND comparator, which is exactly how Plan 22's Defect A
/// happened. Argument order matches the call site this replaces (`cookie_domain_matches(domain,
/// Some(...))` -- the value being cleared first, the fixed target second), deliberately
/// unchanged.
#[cfg(target_os = "macos")]
pub(crate) fn epic_cookie_domain_matches(domain: &str) -> bool {
    EPIC_COOKIE_DOMAINS
        .iter()
        .any(|epic| cookie_domain_matches(domain, Some(epic)))
}

/// GOG/Amazon cookie-domain allow-list for the D-15 fix (Phase 40 plan 04, T-40-04-07/-08).
/// GOG and Amazon logout leave stale session cookies in the shared default cookie jar -- the
/// embed this phase adds is what makes that leak user-visible for the first time, because it
/// now carries a visible, navigable GOG/Amazon tab whose cookies never get cleared on sign-out.
///
/// Mirrors `EPIC_COOKIE_DOMAINS` exactly, including the SAME apex-domain reasoning:
/// `cookie_domain_matches`'s suffix rule already covers every subdomain a session cookie may be
/// scoped to (`login.gog.com`, `www.amazon.com`, etc. all match their bare apex), so listing the
/// apex alone is sufficient -- no need to enumerate every observed subdomain by hand. Deliberately
/// a SEPARATE list from `EPIC_COOKIE_DOMAINS` rather than a widening of it: Epic's list stays
/// scoped to Epic-owned domains only, and this repository's convention (this const's own sibling
/// above) is that widening a storefront-scoped allow-list to a different storefront is exactly
/// the over-broad-clear shape REQ-34.4.1-06 forbids. Scoped to GOG and Amazon ONLY -- this list
/// must never be widened to any other storefront (Humble already has its own always-a-window
/// path and needs no fallback here; Steam has no browser-cookie session to clear at all).
///
/// PAIRED LIST -- keep this in lockstep with `GOG_COOKIE_HOSTS` (`gog/user.ts`) and
/// `AMAZON_COOKIE_HOSTS` (`nile/user.ts`), which name this constant back. A domain added on one
/// side and not the other is a silent half-fix, exactly the T-35-41 drift risk
/// `EPIC_COOKIE_DOMAINS`'s own doc comment describes for Epic's list.
#[cfg(target_os = "macos")]
const STORE_LOGOUT_COOKIE_DOMAINS: &[&str] = &["gog.com", "amazon.com"];

/// True when `domain` is (or is a subdomain of) ANY apex in `STORE_LOGOUT_COOKIE_DOMAINS`.
/// Delegates to `cookie_domain_matches`, exactly like `epic_cookie_domain_matches` above --
/// see that function's own doc comment for why a hand-rolled suffix test here would be a SECOND
/// comparator (the mistake Plan 22's Defect A already made once).
#[cfg(target_os = "macos")]
pub(crate) fn store_logout_cookie_domain_matches(domain: &str) -> bool {
    STORE_LOGOUT_COOKIE_DOMAINS
        .iter()
        .any(|store_domain| cookie_domain_matches(domain, Some(store_domain)))
}

/// Fixes the live-observed Epic logout defect (`humble_login_clear_cookies` rejecting with
/// `humble_login:no-window:{label}` on EVERY Epic logout, `gamelib.log`, 2026-08-03): Epic's
/// login window is ALWAYS the pristine, webview-less `WindowBuilder` window
/// `open_pristine_epic_login_window` builds (`humble_login_open`'s `is_epic_login` branch,
/// unconditional on macOS -- there is no "Epic but not pristine" case to preserve), so
/// `app.get_webview_window(label)` structurally can never find it, for ANY label, fresh or
/// stale. The label was never a real lookup key for cookie data in the first place: the
/// pristine webview's `WKWebViewConfiguration::new(mtm)` uses no custom `websiteDataStore`
/// override, so its cookies live in the SAME process-wide `WKWebsiteDataStore::defaultDataStore()`
/// every Tauri-managed window already shares -- D-08's own "the jar is app-wide" comment on
/// `humble_login_clear_cookies` above. Clearing that store directly needs no window handle at
/// all, live or closed, Tauri-managed or raw -- so this function is deliberately
/// label-independent, taking only the domain to filter on.
///
/// Removal mechanism is the SAME one `humble_login_clear_cookies`'s existing per-window macOS
/// branch already proved correct (Plan 23, F-6 Defect B): `WKWebsiteDataStore
/// .removeDataOfTypes(forDataRecords:completionHandler:)`, scoped to
/// `WKWebsiteDataTypeCookies` + `WKWebsiteDataTypeDiskCache` + `WKWebsiteDataTypeMemoryCache`
/// (debug session `epic-cold-jar-login-timeout`, 2026-09-28 -- see the removal call site's own
/// doc comment for why the disk/memory cache had to be added) and to records whose
/// `displayName()` domain-suffix-matches `domain` -- never
/// `WKHTTPCookieStore.deleteCookie()` (the filed WebKit defect, bugs.webkit.org #184938, that
/// reports success while silently deleting nothing; see that branch's own doc comment). The
/// measured count comes from `WKHTTPCookieStore.getAllCookies()` -- a real per-cookie read,
/// genuinely INDEPENDENT of the data-record removal path above it -- taken both before and
/// after the removal and reduced through the same `verified_delete_count` (before-after,
/// saturating) contract every other clear path in this file uses. This function can never
/// report success while removing nothing: the count it returns is never the mutating call's
/// own report, always a fresh re-read (the discipline the file's D-08 comment establishes and
/// this function's own doc note repeats because F-6 already proved a mutating call's own
/// "it completed" signal is not proof of anything on this platform).
#[cfg(target_os = "macos")]
pub(crate) fn clear_default_data_store_cookies_for_domain(
    app: &AppHandle,
    domain: &str,
) -> Result<Value, String> {
    let count_matching_cookies = |domain: &str| -> Result<usize, String> {
        let (tx, rx) = mpsc_channel::<Result<usize, String>>();
        let domain_owned = domain.to_string();
        if let Err(e) = app.run_on_main_thread(move || {
            let outcome: Result<(), String> = (|| {
                let mtm = objc2::MainThreadMarker::new().ok_or_else(|| {
                    "humble_login_clear_cookies:default-store:no-main-thread-marker".to_string()
                })?;
                // SAFETY: `mtm` proves this closure is running on the main thread.
                let data_store =
                    unsafe { objc2_web_kit::WKWebsiteDataStore::defaultDataStore(mtm) };
                let cookie_store = unsafe { data_store.httpCookieStore() };
                let target_domain = domain_owned.clone();
                let tx_fetch = tx.clone();
                // SAFETY: `getAllCookies` hands the completion handler a valid, live array
                // pointer for the duration of this call; `tx_fetch` outlives it.
                let completion = block2::RcBlock::new(
                    move |cookies: std::ptr::NonNull<
                        objc2_foundation::NSArray<objc2_foundation::NSHTTPCookie>,
                    >| {
                        let cookies_ref = unsafe { cookies.as_ref() };
                        // Never logged (T-34.4.1-21/T-28-04/T-34.4.1-39/-75/-91) -- each
                        // cookie's domain is read only to feed the pure, count-only
                        // `cookie_domain_matches` filter, never printed.
                        let count = cookies_ref
                            .to_vec()
                            .iter()
                            .filter(|cookie| {
                                cookie_domain_matches(
                                    &cookie.domain().to_string(),
                                    Some(&target_domain),
                                )
                            })
                            .count();
                        let _ = tx_fetch.send(Ok(count));
                    },
                );
                unsafe {
                    cookie_store.getAllCookies(&completion);
                }
                Ok(())
            })();
            if let Err(e) = outcome {
                let _ = tx.send(Err(e));
            }
        }) {
            return Err(format!(
                "humble_login_clear_cookies:default-store:dispatch-failed:{e}"
            ));
        }
        match rx.recv_timeout(CLEAR_COOKIES_TIMEOUT) {
            Ok(inner) => inner,
            // Mirrors the per-window branch above: a timeout here means the SIGNAL was
            // missed, not that the read itself is meaningless -- there is nothing to fall
            // back to for a COUNT specifically (unlike the removal below, which always has
            // a re-read to fall through to), so this one case does surface as an error.
            Err(_) => Err("humble_login_clear_cookies:default-store:timeout".to_string()),
        }
    };

    let before_matching = count_matching_cookies(domain)?;
    if before_matching == 0 {
        return Ok(Value::Number(0.into()));
    }

    let (tx, rx) = mpsc_channel::<()>();
    let domain_for_removal = domain.to_string();
    if let Err(e) = app.run_on_main_thread(move || {
        let Some(mtm) = objc2::MainThreadMarker::new() else {
            // Structurally should not happen inside a run_on_main_thread closure; fail safe
            // by signalling "done, nothing removed" rather than hanging until the timeout.
            let _ = tx.send(());
            return;
        };
        // SAFETY: `mtm` proves this closure is running on the main thread.
        let data_store = unsafe { objc2_web_kit::WKWebsiteDataStore::defaultDataStore(mtm) };
        let data_store_for_removal = data_store.clone();
        let all_types = unsafe { objc2_web_kit::WKWebsiteDataStore::allWebsiteDataTypes(mtm) };
        let tx_fetch = tx.clone();
        let target_domain = domain_for_removal.clone();
        let fetch_completion = block2::RcBlock::new(
            move |records: std::ptr::NonNull<
                objc2_foundation::NSArray<objc2_web_kit::WKWebsiteDataRecord>,
            >| {
                // SAFETY: WebKit hands the completion handler a valid, live array pointer for
                // the duration of this call.
                let records_ref = unsafe { records.as_ref() };
                let all_records: Vec<objc2::rc::Retained<objc2_web_kit::WKWebsiteDataRecord>> =
                    records_ref.to_vec();
                let matching_records: Vec<&objc2_web_kit::WKWebsiteDataRecord> = all_records
                    .iter()
                    .filter(|record| {
                        // SAFETY: `displayName()` is a simple ObjC accessor; `record` is a
                        // live, retained object from `all_records`. Never logged -- passed
                        // only into the pure, count-only `website_data_record_matches_domain`
                        // filter.
                        let display_name = unsafe { record.displayName() }.to_string();
                        website_data_record_matches_domain(&display_name, &target_domain)
                    })
                    .map(|record| &**record)
                    .collect();
                if matching_records.is_empty() {
                    let _ = tx_fetch.send(());
                    return;
                }
                // Scoped to WKWebsiteDataTypeCookies PLUS the native HTTP disk/memory
                // cache -- a matched record may also carry localStorage/IndexedDB/
                // Cache-Storage(fetch) data for the same domain; `humble_login_clear_storage`
                // (a separate, already-shipped step) owns THOSE, via injected JS
                // (localStorage.clear()/indexedDB/`caches`/service-worker unregister).
                //
                // CORRECTION (debug session `epic-cold-jar-login-timeout`, 2026-09-28):
                // this comment previously read "cache data... `humble_login_clear_storage`
                // owns those", which conflated two distinct WebKit concepts. The JS-observable
                // `caches` Cache Storage API (`WKWebsiteDataTypeFetchCache`) IS covered by
                // `humble_login_clear_storage`'s injected script. WebKit's own native HTTP
                // resource cache (`WKWebsiteDataTypeDiskCache`/`WKWebsiteDataTypeMemoryCache`,
                // the one backing `NetworkResourceLoader::retrieveCacheEntry`) is NOT --
                // there is no JS API for it, only this native `removeDataOfTypes` call. Left
                // uncovered, a disk-cache entry written by an earlier authenticated session
                // (e.g. a real Epic login) survives this cookie-only clear indefinitely inside
                // the shared, process-wide `WKWebsiteDataStore::defaultDataStore()`, and gets
                // replayed verbatim (confirmed live: `retrieveCacheEntry: HTTP
                // (foundCachedEntry=1)`, zero network round-trips, first-ever load of the page
                // in the window) to the next cold-jar sign-in attempt -- serving
                // authenticated-shaped markup to a webview with no cookies, which then polls
                // session-dependent subresources that can never resolve for the full 300s
                // client timeout. Adding the two disk/memory-cache types here closes that gap,
                // still scoped to `matching_records` (this domain only) -- not a blanket wipe
                // (REQ-34.4.1-06).
                //
                // SAFETY: `WKWebsiteDataTypeCookies`/`WKWebsiteDataTypeDiskCache`/
                // `WKWebsiteDataTypeMemoryCache` are valid static `NSString`s this crate
                // exposes; reading an extern static is the only unsafe part of this line.
                let cookies_type: &objc2_foundation::NSString =
                    unsafe { objc2_web_kit::WKWebsiteDataTypeCookies };
                let disk_cache_type: &objc2_foundation::NSString =
                    unsafe { objc2_web_kit::WKWebsiteDataTypeDiskCache };
                let memory_cache_type: &objc2_foundation::NSString =
                    unsafe { objc2_web_kit::WKWebsiteDataTypeMemoryCache };
                let cookies_type_set = objc2_foundation::NSSet::from_slice(&[
                    cookies_type,
                    disk_cache_type,
                    memory_cache_type,
                ]);
                let matched_record_count = matching_records.len();
                let records_array = objc2_foundation::NSArray::from_slice(&matching_records);
                let tx_remove = tx_fetch.clone();
                let remove_completion = block2::RcBlock::new(move || {
                    let _ = tx_remove.send(());
                });
                shell_eprintln!(
                    "[shell] humble_login_clear_cookies: default-store evicting cookies + HTTP disk/memory cache for {matched_record_count} matching data record(s) (domain-scoped, count only)"
                );
                // SAFETY: `data_store_for_removal` is a live object obtained on the main
                // thread above; `cookies_type_set`/`records_array` are freshly built, live
                // objects; `remove_completion` outlives the call.
                unsafe {
                    data_store_for_removal.removeDataOfTypes_forDataRecords_completionHandler(
                        &cookies_type_set,
                        &records_array,
                        &remove_completion,
                    );
                }
            },
        );
        // SAFETY: `data_store`/`all_types` are live objects obtained above on the main
        // thread; `fetch_completion` outlives the call.
        unsafe {
            data_store.fetchDataRecordsOfTypes_completionHandler(&all_types, &fetch_completion);
        }
    }) {
        shell_eprintln!("[shell] humble_login_clear_cookies: default-store dispatch failed: {e}");
        return Err(format!(
            "humble_login_clear_cookies:default-store:dispatch:{e}"
        ));
    }

    if rx.recv_timeout(CLEAR_COOKIES_TIMEOUT).is_err() {
        shell_eprintln!(
            "[shell] humble_login_clear_cookies: default-store WKWebsiteDataStore removal timed out waiting for the completion signal"
        );
    }

    let after_matching = count_matching_cookies(domain)?;
    Ok(Value::Number(
        verified_delete_count(before_matching, after_matching).into(),
    ))
}

/// Label-independent per-domain cookie CENSUS read against the process-wide default data
/// store (closes D-35-29-01, the sole remaining blocker on Phase 35's re-verification).
///
/// The census arm resolved its window with `app.get_webview_window(label)` and rejected with a
/// `no-window:{label}` error whenever that returned `None`. For Epic that was EVERY call --
/// see `clear_default_data_store_cookies_for_domain`'s own doc comment directly above for why
/// the label was never a real lookup key for cookie data, and why the pristine login window's
/// cookies live in the SAME `WKWebsiteDataStore::defaultDataStore()` this function reads. That
/// is not restated here; it is the same defect, on the read side.
///
/// The consequence was measured live (packaged 0.7.0, 2026-08-31): all five Epic-owned hosts
/// logged `before(total=unavailable, matched=unavailable, verdict=UNSUPPORTED_OR_ERROR)`, so
/// the census had never once produced a reading -- and BOTH consuming branches in
/// `legendary/user.ts` (`brokenHosts`, which needs `SUPPORTED_NONEMPTY`, and the non-fatal
/// already-empty branch, which needs `SUPPORTED_BUT_EMPTY`) were structurally unreachable.
/// The broken-per-host detector was dead code on the only path it serves. This function is
/// the read-side mirror of the clear-side fallback above, deliberately identical in shape so
/// the two label-independent paths sit together and diverge only in what they do with the
/// cookies they find.
///
/// F-34.4.2-12 round-trip accounting, which this function is required to preserve, recorded
/// here as numbers so a future edit has to argue with a measurement rather than a feeling:
///
/// | | wry `.cookies()` per host (macOS) | native `getAllCookies` per host |
/// | --- | --- | --- |
/// | before this fix | 0 | 2 (the clear path's before/after, default store) |
/// | after this fix  | 0 -- UNCHANGED | 4 (adds this census's before/after, default store) |
///
/// The macOS wry `.cookies()` count stays at ZERO. The two added reads reuse the exact shape
/// `clear_default_data_store_cookies_for_domain`'s `count_matching_cookies` closure already
/// runs twice per host, live, without deadlock: `run_on_main_thread` a closure that only
/// REGISTERS a `block2::RcBlock` completion on `getAllCookies` and returns immediately, with
/// the `mpsc` wait done on the CALLING (worker) thread, never nested inside the main-thread
/// closure. Nothing here is bound to a window, so `with_webview` reentrancy -- the other half
/// of the reproduced deadlock -- is not in play either.
#[cfg(target_os = "macos")]
pub(crate) fn default_data_store_cookies_for_domain(
    app: &AppHandle,
    domain: &str,
    names: &[&str],
) -> Result<Value, String> {
    let (tx, rx) = mpsc_channel::<Result<(usize, Vec<Value>), String>>();
    let target_domain = domain.to_string();
    let target_names: Vec<String> = names.iter().map(|n| n.to_string()).collect();
    if let Err(e) = app.run_on_main_thread(move || {
        let outcome: Result<(), String> = (|| {
            let mtm = objc2::MainThreadMarker::new().ok_or_else(|| {
                "humble_login_cookies_for_domain:default-store:no-main-thread-marker".to_string()
            })?;
            // SAFETY: `mtm` proves this closure is running on the main thread.
            let data_store = unsafe { objc2_web_kit::WKWebsiteDataStore::defaultDataStore(mtm) };
            let cookie_store = unsafe { data_store.httpCookieStore() };
            let filter_domain = target_domain.clone();
            let filter_names = target_names.clone();
            let tx_fetch = tx.clone();
            // SAFETY: `getAllCookies` hands the completion handler a valid, live array
            // pointer for the duration of this call; `tx_fetch` outlives it.
            let completion = block2::RcBlock::new(
                move |cookies: std::ptr::NonNull<
                    objc2_foundation::NSArray<objc2_foundation::NSHTTPCookie>,
                >| {
                    let cookies_ref = unsafe { cookies.as_ref() };
                    let all_cookies = cookies_ref.to_vec();
                    // The UNFILTERED jar size. This is `legendary/user.ts`'s liveness proof
                    // (`everProvedLive`) -- the property that makes a later zero mean
                    // "genuinely empty" rather than "the read channel silently did nothing".
                    let total = all_cookies.len();
                    // Never logs a cookie name, value or domain (T-34.4.1-02, T-34.4.1-94):
                    // domains and names are read only to feed the pure filters below, values
                    // go solely into the returned payload the caller already explicitly
                    // requested over the already-allowlisted rustInvoke channel.
                    //
                    // Census direction, matching the arm this backs and
                    // `humble_login_clear_cookies`'s own filter: the cookie's OWN domain
                    // first, the caller's FIXED target second (spike 016 measured the other
                    // direction undercounting 29/33 against a fixed apex).
                    let matched: Vec<Value> = all_cookies
                        .into_iter()
                        .filter(|c| {
                            cookie_domain_matches(&c.domain().to_string(), Some(&filter_domain))
                        })
                        .filter(|c| {
                            filter_names.is_empty()
                                || filter_names
                                    .iter()
                                    .any(|n| n.as_str() == c.name().to_string())
                        })
                        .map(|c| {
                            serde_json::json!({
                                "name": c.name().to_string(),
                                "domain": c.domain().to_string(),
                                "value": c.value().to_string()
                            })
                        })
                        .collect();
                    let _ = tx_fetch.send(Ok((total, matched)));
                },
            );
            unsafe {
                cookie_store.getAllCookies(&completion);
            }
            Ok(())
        })();
        if let Err(e) = outcome {
            let _ = tx.send(Err(e));
        }
    }) {
        return Err(format!(
            "humble_login_cookies_for_domain:default-store:dispatch:{e}"
        ));
    }
    match rx.recv_timeout(CLEAR_COOKIES_TIMEOUT) {
        Ok(Ok((total, matched))) => Ok(serde_json::json!({ "total": total, "matched": matched })),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("humble_login_cookies_for_domain:default-store:timeout".to_string()),
    }
}

/// Classifies a raw `keyring` crate outcome (`Entry::new(...).and_then(|e| e.get_password())`)
/// into the arm's `Value`/`String` contract (34.4.1 gap cycle 2 plan 26, F-9 observability
/// half). Extracted as its own pure function so this classification is directly testable
/// without a live Keychain (mirrors `keyring_account`'s own "pure function, directly testable"
/// precedent) -- Task 2's acceptance criteria requires the `NoEntry`-still-null path proven,
/// and this is the seam that proves it. `NoEntry` is the healthy first-run state (Pitfall 1 /
/// D-06) and resolves `Value::Null`, never an error; every other variant collapses into the
/// file's existing flat `keyring:unavailable:{e}` string convention.
pub(crate) fn keyring_get_result(result: Result<String, keyring::Error>) -> Result<Value, String> {
    match result {
        Ok(secret) => Ok(Value::String(secret)),
        Err(keyring::Error::NoEntry) => Ok(Value::Null),
        Err(e) => Err(format!("keyring:unavailable:{e}")),
    }
}

/// The closed set of successful keyring-operation outcomes a `shell_diag()` line may report
/// (quick 261001-p0s, closing the "keyring RPC arms are success-silent" todo). A closed enum
/// rather than a free `&str` parameter: a free string would make it possible to pass a secret
/// as the token, which this type cannot do by construction -- mirrors `afb0fe744`'s
/// `WriteDirection` reasoning in `devSecretVault.ts`, ported to Rust.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum KeyringOutcome {
    Found,
    Absent,
    Stored,
    Deleted,
}

impl KeyringOutcome {
    pub(crate) fn token(self) -> &'static str {
        match self {
            KeyringOutcome::Found => "found",
            KeyringOutcome::Absent => "absent",
            KeyringOutcome::Stored => "stored",
            KeyringOutcome::Deleted => "deleted",
        }
    }
}

/// Renders one keyring success line. Pure and side-effect-free -- same split as
/// `format_panic_record` above, so a test can assert what the line carries without writing to
/// the operator's real log file. No `[shell] ` prefix: `shell_diag` prepends that itself, and a
/// second copy here would double it.
///
/// `account: &'static str` is load-bearing, not a style choice: any secret value is a
/// runtime-derived `String`, which does not coerce to `&'static str`, so the compiler -- not a
/// reviewer -- forbids passing one here. Only `keyring_account()`'s allowlisted return satisfies
/// this parameter; the raw, caller-supplied `keyring_slot_arg()` text never does.
pub(crate) fn keyring_outcome_message(
    channel: &str,
    account: &'static str,
    outcome: KeyringOutcome,
) -> String {
    format!(
        "keyring {channel} account={account} outcome={}",
        outcome.token()
    )
}

/// Classifies a `keyring_get` result into `Found`/`Absent` by reading the `Value`
/// DISCRIMINANT only -- never the payload. That is the whole reason this takes `&Value` and
/// returns an enum rather than formatting anything itself: even the fact of which secret was
/// read must never carry any part of the secret.
pub(crate) fn keyring_get_outcome(value: &Value) -> KeyringOutcome {
    if value.is_null() {
        KeyringOutcome::Absent
    } else {
        KeyringOutcome::Found
    }
}

/// Runs `read` on a worker thread and bounds the wait for its result at `bound`, returning
/// `Err("keyring:timeout")` if `read` has not completed in time (34.4.1 gap cycle 2 plan 26,
/// T-34.4.1-114/T-34.4.1-115). Follows `humble_reveal_post`'s existing `mpsc_channel` +
/// `rx.recv_timeout()` shape rather than inventing a second one. Generic over the read
/// operation specifically so the timeout path is provable in a unit test with an injected
/// slow/never-returning closure, never by waiting on a real Keychain (this plan's own
/// acceptance criteria) -- see `bounded_keyring_read_times_out_as_keyring_timeout_on_a_never_
/// returning_operation` below.
///
/// A timed-out worker thread is ABANDONED, not cancelled -- there is no API to interrupt a
/// blocked platform call, so this function protects the caller's wait, not the underlying
/// operation. If `read` eventually completes after the bound has already elapsed, its result is
/// sent into a channel whose receiver has already been dropped; `Sender::send` on a
/// disconnected channel simply returns an `Err` this function discards, so the abandoned
/// thread's late result is silently dropped rather than causing a panic.
pub(crate) fn bounded_keyring_read<F>(bound: Duration, read: F) -> Result<Value, String>
where
    F: FnOnce() -> Result<Value, String> + Send + 'static,
{
    let (tx, rx) = mpsc_channel::<Result<Value, String>>();
    thread::spawn(move || {
        let _ = tx.send(read());
    });
    match rx.recv_timeout(bound) {
        Ok(result) => result,
        Err(_) => Err("keyring:timeout".to_string()),
    }
}

