//! The CrossOver index loader, ported from `src/backend/crossover_index/fetcher.ts` (`loadIndex`): a
//! cached copy inside its 24 hours is served with no request; otherwise the release asset is fetched,
//! gunzipped, parsed and validated ([`super::schema`]) and stored with the loader's own `fetchedAt`. On
//! ANY failure the last good copy is kept and returned, and a bad payload never replaces a good one
//! (D-09, T-19-01, T-19-05).
//!
//! The cache is `store_cache/crossover_index.json` through [`CacheView`] with the TS store's parameters
//! (24 hours, `invalidate: Never`, key `index`): an expired entry is never evicted on read, it is only
//! replaced by a validated newer one, and the loader reads `fetchedAt` itself to decide staleness.
//!
//! Diagnostic lines go to [`InfoCtx::note`] as fixed text plus a status number or a category word,
//! never a URL, a server message or any of the payload.

use std::io::Read;
use std::time::Duration;

use flate2::read::MultiGzDecoder;
use gamelib_store::json::{Json, Num, Obj};
use serde_json::Value;

use super::schema::{validate, Index, Reject};
use super::{BUNDLED_FILE, INDEX_KEY, TTL_MINUTES};
use crate::cache_view::{CacheView, CROSSOVER_INDEX};
use crate::ctx::InfoCtx;
use crate::http::{HttpError, Request};

/// The compressed-body cap (`MAX_CONTENT_LENGTH`, T-19-02): 5 MiB, enforced by the HTTP seam.
pub const MAX_COMPRESSED_BYTES: usize = 5 * 1024 * 1024;
/// The decompressed-size cap (T-86-45): a gzip bomb inside 5 MiB would otherwise expand without bound.
/// The live payload is about 240 KB of JSON; 32 MiB is generous and still bounded. The TS had none.
pub const MAX_INFLATED_BYTES: usize = 32 * 1024 * 1024;
/// One request's bound (the axios client's `timeout: 10 * 1000`).
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

/// What [`load_index`] answers: the validated payload and the document the TS returned for it.
/// A cache hit returns the stored object as it is (so a key this port does not read, such as the live
/// payload's per-entry `label` that an older cache file may still hold, survives), a fresh fetch or the
/// bundled snapshot the schema's output (unknown keys dropped). Lookups read only `index`.
#[derive(Debug, Clone)]
pub struct Loaded {
    pub index: Index,
    pub data: Json,
}

/// The stored `{ data, fetchedAt }` of the cache key `index`.
#[derive(Debug, Clone)]
pub struct Cached {
    pub index: Index,
    /// `data` as stored.
    pub data: Json,
    /// Epoch milliseconds the payload was fetched. `None` (absent or not a number) is JS `NaN`: never
    /// fresh.
    pub fetched_at: Option<f64>,
}

fn open(ctx: &InfoCtx) -> std::io::Result<CacheView> {
    CacheView::open(
        &ctx.host,
        &ctx.paths.user_data,
        CROSSOVER_INDEX,
        ctx.clock.clone(),
    )
}

/// `crossoverIndexStore.get('index')`: the last good payload and its `fetchedAt`, whatever its age
/// (`invalidate: Never`). `None` for an absent entry, a store that cannot be opened, or a payload that
/// no longer passes the schema (the TS could not have written one; a hand-damaged file reads as empty
/// and is refetched rather than served).
pub fn read_cached(ctx: &InfoCtx) -> Option<Cached> {
    let view = open(ctx).ok()?;
    let Json::Obj(entry) = view.get_opt(INDEX_KEY)? else {
        return None;
    };
    let data = entry.get("data")?.clone();
    let index = validate(&data.to_value()).ok()?;
    Some(Cached {
        index,
        data,
        fetched_at: entry.get("fetchedAt").and_then(Json::as_f64),
    })
}

/// `crossoverIndexStore.set('index', { data, fetchedAt: now })`.
fn write_cached(ctx: &InfoCtx, index: &Index, now_ms: u64) -> std::io::Result<()> {
    let mut entry = Obj::new();
    entry.insert_js("data", index.to_json());
    entry.insert_js("fetchedAt", Json::Num(Num::U(now_ms)));
    open(ctx)?.set(INDEX_KEY, Json::Obj(entry))
}

/// Why a refresh produced no usable payload. [`Failure::word`] is what the log line says.
#[derive(Debug)]
enum Failure {
    Transport(HttpError),
    Status(u16),
    /// The body was not gzip.
    Gzip,
    /// The decompressed body passed [`MAX_INFLATED_BYTES`].
    Inflated,
    Json,
    Rejected(Reject),
    /// The validated payload could not be written.
    Store,
}

impl Failure {
    fn line(&self) -> String {
        match self {
            Failure::Transport(HttpError::Timeout) => {
                "crossover index refresh failed (timeout), keeping the last good copy".to_string()
            }
            Failure::Transport(HttpError::Network(_)) => {
                "crossover index refresh failed (network), keeping the last good copy".to_string()
            }
            Failure::Transport(HttpError::TooLarge) => {
                "crossover index refresh failed (over 5 MiB), keeping the last good copy"
                    .to_string()
            }
            Failure::Transport(HttpError::Cancelled) => {
                "crossover index refresh failed (cancelled), keeping the last good copy".to_string()
            }
            Failure::Status(status) => format!(
                "crossover index refresh failed (status {status}), keeping the last good copy"
            ),
            Failure::Gzip => {
                "crossover index refresh failed (not gzip), keeping the last good copy".to_string()
            }
            Failure::Inflated => {
                "crossover index refresh failed (inflated size), keeping the last good copy"
                    .to_string()
            }
            Failure::Json => {
                "crossover index refresh failed (not JSON), keeping the last good copy".to_string()
            }
            Failure::Rejected(reject) => format!(
                "crossover index payload rejected ({}), keeping the last good copy",
                reject.word()
            ),
            Failure::Store => {
                "crossover index refresh failed (store write), keeping the last good copy"
                    .to_string()
            }
        }
    }
}

/// `gunzipSync`: every gzip member, bounded by [`MAX_INFLATED_BYTES`].
fn gunzip(body: &[u8]) -> Result<Vec<u8>, Failure> {
    let mut out = Vec::new();
    let limit = MAX_INFLATED_BYTES as u64 + 1;
    MultiGzDecoder::new(body)
        .take(limit)
        .read_to_end(&mut out)
        .map_err(|_| Failure::Gzip)?;
    if out.len() > MAX_INFLATED_BYTES {
        return Err(Failure::Inflated);
    }
    Ok(out)
}

/// Gunzip, parse and validate one payload.
fn parse_payload(body: &[u8]) -> Result<Index, Failure> {
    let inflated = gunzip(body)?;
    // `Buffer.toString('utf-8')`: invalid bytes become U+FFFD rather than an error.
    let text = String::from_utf8_lossy(&inflated);
    let value: Value = serde_json::from_str(&text).map_err(|_| Failure::Json)?;
    validate(&value).map_err(Failure::Rejected)
}

/// One refresh: request, status, payload, and the write of the validated copy.
async fn refresh(ctx: &InfoCtx, url: &str, now_ms: u64) -> Result<Index, Failure> {
    // The shared axios client's headers: its `User-Agent` and axios's default `Accept`.
    let request = Request::get(url, REQUEST_TIMEOUT)
        .max_body(MAX_COMPRESSED_BYTES)
        .header("Accept", "application/json, text/plain, */*")
        .header(
            "User-Agent",
            &format!(
                "GameLib/{} (+https://github.com/grayson-mitchell/GameLib)",
                ctx.app_version
            ),
        );
    let response = ctx.http.send(request).await.map_err(Failure::Transport)?;
    // axios throws for a status outside 200..=299.
    if !(200..300).contains(&response.status) {
        return Err(Failure::Status(response.status));
    }
    let index = parse_payload(&response.body)?;
    write_cached(ctx, &index, now_ms).map_err(|_| Failure::Store)?;
    Ok(index)
}

/// `loadBundledSnapshot`: the build-time snapshot from `<public_dir>/crossover-index.json.gz`, validated
/// like any other external payload (T-19-01). An ABSENT snapshot (a fresh clone, or a contributor build
/// without the gitignored artifact) is a NORMAL cold start, not an error: one info line, `None`. Any other
/// read, gunzip, parse or validation failure is treated the same way; this is a best-effort fallback and
/// never a requirement. The path is the shell's own app root plus `public`, never from TS or the renderer
/// (T-86-46); this read is the scratch-file exception for a read-only bundled asset (D-18).
fn load_bundled(ctx: &InfoCtx) -> Option<Index> {
    let read = ctx
        .paths
        .public_dir
        .as_ref()
        .map(|dir| dir.join(BUNDLED_FILE))
        .and_then(|path| std::fs::read(path).ok());
    let Some(bytes) = read else {
        ctx.note("crossover index: no bundled snapshot, cold start");
        return None;
    };
    match parse_payload(&bytes) {
        Ok(index) => Some(index),
        Err(_) => {
            ctx.note("crossover index: the bundled snapshot failed validation, cold start");
            None
        }
    }
}

/// WR-01: with neither a cached last-good copy nor a fresh fetch, the bundled snapshot is the only data
/// there is, and it is WRITTEN into the cache as well as returned: the synchronous self-heal probe
/// ([`read_cached`] via `index_has`) reads that store and never loads, so on a machine whose network
/// fetch has never succeeded it would otherwise stay empty forever. `fetchedAt` is now, which treats
/// "fell back to the bundled snapshot" like "just fetched" for the TTL (D-08's daily cadence); it
/// self-heals to the real payload the next time the TTL lapses and a fetch succeeds.
///
/// A failed write propagates (the TS had no `try` around this call); the callers' `catch` answers null.
fn persist_bundled(ctx: &InfoCtx, now_ms: u64) -> Result<Option<Loaded>, String> {
    let Some(index) = load_bundled(ctx) else {
        return Ok(None);
    };
    write_cached(ctx, &index, now_ms)
        .map_err(|_| "info_crossover:store-write-failed".to_string())?;
    Ok(Some(Loaded {
        data: index.to_json(),
        index,
    }))
}

/// The degraded answer when no fresh copy can be had: the last good copy, else the bundled snapshot.
fn degraded(ctx: &InfoCtx, cached: Option<Cached>, now_ms: u64) -> Result<Option<Loaded>, String> {
    match cached {
        Some(c) => Ok(Some(Loaded {
            index: c.index,
            data: c.data,
        })),
        None => persist_bundled(ctx, now_ms),
    }
}

/// How long a failed refresh suppresses further requests (`FAILURE_BACKOFF_MINUTES`).
pub const FAILURE_BACKOFF_MINUTES: f64 = 5.0;

/// `withinFailureBackoff`: `(now - failedAt) / 1000 / 60 <= 5`.
fn within_failure_backoff(ctx: &InfoCtx, now_ms: u64) -> bool {
    ctx.crossover.last_failure_ms().is_some_and(|failed| {
        (now_ms as f64 - failed as f64) / 1000.0 / 60.0 <= FAILURE_BACKOFF_MINUTES
    })
}

/// WR-04: the "MUST be https" rule (T-19-03) enforced at run time, BEFORE the cache chain runs. A
/// scheme violation is a programming error to fail on loudly, not a transient failure to degrade through.
fn assert_https(url: &str) -> Result<(), String> {
    if url.starts_with("https://") {
        Ok(())
    } else {
        Err(format!("IndexDescriptor '{INDEX_KEY}' url must be https"))
    }
}

/// `loadIndex`: the index, or `None` when there is neither a usable cached copy nor a fresh one.
/// `Err` is only a refused URL (see [`assert_https`]); every other failure degrades to the last good
/// copy or `None`.
pub async fn load_index(ctx: &InfoCtx, url: &str) -> Result<Option<Loaded>, String> {
    assert_https(url)?;
    let _one_at_a_time = ctx.crossover.load_lock().lock().await;
    let now_ms = ctx.clock.now_ms();
    let cached = read_cached(ctx);

    if let Some(cached) = &cached {
        // `(now - fetchedAt) / 1000 / 60 <= ttl`; a missing `fetchedAt` is NaN, never fresh.
        let fresh = cached
            .fetched_at
            .is_some_and(|at| (now_ms as f64 - at) / 1000.0 / 60.0 <= TTL_MINUTES);
        if fresh {
            return Ok(Some(Loaded {
                index: cached.index.clone(),
                data: cached.data.clone(),
            }));
        }
    }

    // WR-07: the cache is stale (or absent) and a refresh failed recently, so serve the degraded value
    // without trying again. Past the window the next call retries normally, so a transient outage
    // self-heals; the point is to collapse a burst of callers, not to ration retries.
    if within_failure_backoff(ctx, now_ms) {
        return degraded(ctx, cached, now_ms);
    }

    match refresh(ctx, url, now_ms).await {
        Ok(index) => {
            ctx.crossover.clear_failure();
            Ok(Some(Loaded {
                data: index.to_json(),
                index,
            }))
        }
        Err(failure) => {
            ctx.note(&failure.line());
            ctx.crossover.record_failure(now_ms);
            degraded(ctx, cached, now_ms)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::Write;

    fn gz(bytes: &[u8]) -> Vec<u8> {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
        encoder.write_all(bytes).unwrap();
        encoder.finish().unwrap()
    }

    #[test]
    fn gunzip_reads_every_member_as_nodes_gunzip_sync_does() {
        let mut body = gz(b"ab");
        body.extend(gz(b"cd"));
        assert_eq!(gunzip(&body).unwrap(), b"abcd");
    }

    #[test]
    fn a_body_that_is_not_gzip_is_refused() {
        assert!(matches!(
            gunzip(b"this is not a gzip stream"),
            Err(Failure::Gzip)
        ));
        // An empty body inflates to nothing, which is then not JSON: still a refusal, one stage later.
        assert!(matches!(
            parse_payload(b""),
            Err(Failure::Json | Failure::Gzip)
        ));
    }

    #[test]
    fn a_gzip_bomb_is_cut_off_at_the_inflated_cap() {
        // About 32 KB on the wire, 32 MiB + 1 inflated: the compressed cap alone would let it through.
        let bomb = gz(&vec![0u8; MAX_INFLATED_BYTES + 1]);
        assert!(bomb.len() < MAX_COMPRESSED_BYTES, "{}", bomb.len());
        assert!(matches!(gunzip(&bomb), Err(Failure::Inflated)));
        // At the cap exactly it is read whole.
        let at_cap = gz(&vec![b' '; MAX_INFLATED_BYTES]);
        assert_eq!(gunzip(&at_cap).unwrap().len(), MAX_INFLATED_BYTES);
    }

    #[test]
    fn each_stage_of_a_payload_has_its_own_refusal() {
        assert!(matches!(
            parse_payload(&gz(b"not json")),
            Err(Failure::Json)
        ));
        assert!(matches!(
            parse_payload(&gz(b"{\"version\":2}")),
            Err(Failure::Rejected(_))
        ));
        assert!(matches!(parse_payload(b"plain"), Err(Failure::Gzip)));
    }

    #[test]
    fn only_an_https_url_is_accepted_and_the_refusal_is_the_ts_text() {
        assert!(assert_https("https://github.com/x").is_ok());
        for bad in [
            "http://github.com/x",
            "ftp://x",
            "",
            "HTTPS://github.com/x",
            " https://x",
        ] {
            assert_eq!(
                assert_https(bad),
                Err("IndexDescriptor 'index' url must be https".to_string()),
                "{bad:?}"
            );
        }
    }

    #[test]
    fn a_refresh_failure_line_is_fixed_text_with_no_url() {
        for failure in [
            Failure::Transport(HttpError::Timeout),
            Failure::Transport(HttpError::Network(
                "https://secret.example/?key=abc".to_string(),
            )),
            Failure::Transport(HttpError::TooLarge),
            Failure::Transport(HttpError::Cancelled),
            Failure::Status(503),
            Failure::Gzip,
            Failure::Inflated,
            Failure::Json,
            Failure::Rejected(Reject::Version),
            Failure::Store,
        ] {
            let line = failure.line();
            assert!(
                !line.contains("://") && !line.contains("secret") && !line.contains("key"),
                "{line}"
            );
        }
        assert!(Failure::Status(503).line().contains("503"));
    }
}
