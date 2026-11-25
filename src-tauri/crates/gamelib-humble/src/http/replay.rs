//! A recorded case served as an [`Http`], for the golden tests (D-10, Pitfall 4).
//!
//! The case is the 94-06 wire recorder's `exchanges.json`: a list of `{id, request: {method, target,
//! headers, body?, multipart?}, response: {status, headers, bodyFile?}}`, recorded from the
//! TypeScript's requests as they arrived on a socket. `Replay` answers each request from its recorded
//! twin and PINS the request to it:
//!
//! - the method, the scheme (https) and host (the recorded `Host`), the path and the decoded query
//!   pairs in order;
//! - the headers the TypeScript sets ([`PINNED_HEADERS`], both ways: a pinned header the recording
//!   lacks is drift too). The transport headers axios, undici and reqwest add on their own
//!   (`Accept-Encoding`, `Connection`, `Host`, `Content-Length`, `Sec-Fetch-Mode`) are left out;
//! - the body, or for a multipart body the field names, filenames and values in order (the boundary is
//!   normalised to `<BOUNDARY>` as the recorder does).
//!
//! A value the recorder redacted (it wrote the bare word `REDACTED` in a cookie, a gamekey path
//! segment, a body field) matches any NON-EMPTY live value at that place; everything around it must be
//! equal. A request with no twin, or one that differs, fails naming the request and what differs
//! WITHOUT printing a value (a cookie, a referer or a body can hold a gamekey). The first failure is
//! sticky: [`Replay::finish`] reports it even if the caller swallowed the error.

use std::path::{Component, Path};
use std::sync::{Mutex, MutexGuard};

use serde_json::Value;
use url::Url;

use super::{Http, HttpError, HttpFuture, Request, Response};

/// The request headers a recorded request pins. Names are compared case-insensitively.
pub const PINNED_HEADERS: [&str; 9] = [
    "accept",
    "accept-language",
    "content-type",
    "cookie",
    "next-action",
    "next-router-state-tree",
    "origin",
    "referer",
    "user-agent",
];

/// The headers the HTTP stacks add on their own (axios, undici and reqwest differ here and servers
/// decode them the same), which a recording carries and a replay deliberately does not pin.
pub const TRANSPORT_HEADERS: [&str; 5] = [
    "accept-encoding",
    "connection",
    "content-length",
    "host",
    "sec-fetch-mode",
];

/// Headers whose values a failure message must never print (a cookie, a referer or an origin can
/// carry a gamekey).
const HIDDEN_HEADERS: [&str; 4] = ["cookie", "referer", "origin", "authorization"];

/// What the recorder writes in place of a secret.
const REDACTED: &str = "REDACTED";

/// What the recorder writes in place of a multipart boundary.
const BOUNDARY_TOKEN: &str = "<BOUNDARY>";

#[derive(Debug, Clone, PartialEq, Eq)]
struct Part {
    name: String,
    filename: Option<String>,
    value: Option<String>,
}

struct Exchange {
    id: String,
    method: String,
    path: String,
    query: Vec<(String, String)>,
    headers: Vec<(String, String)>,
    body: Option<String>,
    multipart: Option<Vec<Part>>,
    status: u16,
    response_headers: Vec<(String, String)>,
    response_body: Vec<u8>,
    ts_only: bool,
    /// A request only Rust makes: the TS made no such call, so a recorder added it. A request that
    /// matches it and an older twin is served by this one first, so the exchange the TS also made
    /// stays left over as `tsOnly`.
    rust_only: bool,
    /// The recorded call produced no response: the request is matched and consumed like any other,
    /// then fails as a transport error.
    network_error: bool,
    consumed: bool,
}

#[derive(Default)]
struct State {
    exchanges: Vec<Exchange>,
    ts_only_ids: Vec<String>,
    failures: Vec<String>,
}

/// Serves recorded exchanges and pins each request to its recorded twin. An exchange a request
/// matched is consumed; [`Replay::finish`] fails on any exchange left over unless it is `tsOnly`.
pub struct Replay {
    state: Mutex<State>,
}

fn lock(state: &Mutex<State>) -> MutexGuard<'_, State> {
    state.lock().unwrap_or_else(|e| e.into_inner())
}

fn headers_of(value: &Value) -> Result<Vec<(String, String)>, String> {
    match value {
        Value::Null => Ok(Vec::new()),
        Value::Array(pairs) => pairs
            .iter()
            .map(|pair| match pair.as_array().map(Vec::as_slice) {
                Some([Value::String(k), Value::String(v)]) => Ok((k.clone(), v.clone())),
                _ => Err("a header pair must be [name, value] strings".to_string()),
            })
            .collect(),
        _ => Err("headers must be a list of [name, value] pairs".to_string()),
    }
}

fn field<'a>(value: &'a Value, name: &str, id: &str) -> Result<&'a Value, String> {
    value
        .get(name)
        .ok_or_else(|| format!("exchange {id}: missing {name}"))
}

/// The decoded path and query pairs of a request target (`/path?a=b`).
fn split_target(target: &str) -> Result<(String, Vec<(String, String)>), String> {
    let url = Url::parse(&format!("https://placeholder.invalid{target}"))
        .map_err(|_| "the recorded target is not a path".to_string())?;
    Ok((url.path().to_string(), pairs(&url)))
}

fn pairs(url: &Url) -> Vec<(String, String)> {
    url.query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect()
}

fn parts_of(value: &Value, id: &str) -> Result<Vec<Part>, String> {
    let Some(list) = value.as_array() else {
        return Err(format!("exchange {id}: multipart must be a list"));
    };
    list.iter()
        .map(|part| {
            let name = part
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| format!("exchange {id}: a multipart part needs a name"))?;
            Ok(Part {
                name: name.to_string(),
                filename: part
                    .get("filename")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                value: part
                    .get("value")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            })
        })
        .collect()
}

impl Replay {
    /// Reads `<dir>/exchanges.json`, with each response body in the `bodyFile` beside it.
    /// `networkError: true` on an exchange makes it a transport failure: it matches and is consumed
    /// like any other, then answers [`HttpError::Network`] instead of a response.
    pub fn from_recorded(dir: &Path) -> Result<Replay, String> {
        let text = std::fs::read_to_string(dir.join("exchanges.json"))
            .map_err(|e| format!("cannot read exchanges.json: {}", e.kind()))?;
        let list: Value = serde_json::from_str(&text)
            .map_err(|_| "exchanges.json is not valid JSON".to_string())?;
        let Some(items) = list.as_array() else {
            return Err("exchanges.json must be a list".to_string());
        };
        let mut exchanges = Vec::with_capacity(items.len());
        for (n, item) in items.iter().enumerate() {
            let id = match item.get("id") {
                Some(Value::String(s)) => s.clone(),
                Some(Value::Number(n)) => n.to_string(),
                _ => format!("#{n}"),
            };
            let request = field(item, "request", &id)?;
            let response = field(item, "response", &id)?;
            let method = field(request, "method", &id)?
                .as_str()
                .ok_or_else(|| format!("exchange {id}: method must be a string"))?
                .to_ascii_uppercase();
            let target = field(request, "target", &id)?
                .as_str()
                .ok_or_else(|| format!("exchange {id}: target must be a string"))?;
            let (path, query) = split_target(target).map_err(|e| format!("exchange {id}: {e}"))?;
            let (body, multipart) = (
                match request.get("body") {
                    None | Some(Value::Null) => None,
                    Some(body) => match (body.get("utf8"), body.get("base64")) {
                        (Some(Value::String(s)), _) => Some(s.clone()),
                        (_, Some(_)) => {
                            return Err(format!(
                            "exchange {id}: a base64 request body is not supported by this replay"
                        ))
                        }
                        _ => {
                            return Err(format!("exchange {id}: a body is {{utf8}} or {{base64}}"))
                        }
                    },
                },
                request
                    .get("multipart")
                    .map(|m| parts_of(m, &id))
                    .transpose()?,
            );
            let status = field(response, "status", &id)?
                .as_u64()
                .and_then(|s| u16::try_from(s).ok())
                .ok_or_else(|| format!("exchange {id}: status must be a number"))?;
            let response_body = match response.get("bodyFile").and_then(Value::as_str) {
                None => Vec::new(),
                Some(file) => {
                    let relative = Path::new(file);
                    if !relative
                        .components()
                        .all(|c| matches!(c, Component::Normal(_)))
                    {
                        return Err(format!(
                            "exchange {id}: bodyFile must stay inside the case directory"
                        ));
                    }
                    std::fs::read(dir.join(relative))
                        .map_err(|e| format!("exchange {id}: cannot read bodyFile: {}", e.kind()))?
                }
            };
            exchanges.push(Exchange {
                method,
                path,
                query,
                headers: request
                    .get("headers")
                    .map(headers_of)
                    .transpose()
                    .map_err(|e| format!("exchange {id}: {e}"))?
                    .unwrap_or_default(),
                body,
                multipart,
                status,
                response_headers: response
                    .get("headers")
                    .map(headers_of)
                    .transpose()
                    .map_err(|e| format!("exchange {id}: {e}"))?
                    .unwrap_or_default(),
                response_body,
                ts_only: item.get("tsOnly").and_then(Value::as_bool).unwrap_or(false),
                rust_only: item
                    .get("rustOnly")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                network_error: item
                    .get("networkError")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                consumed: false,
                id,
            });
        }
        Ok(Replay {
            state: Mutex::new(State {
                exchanges,
                ..State::default()
            }),
        })
    }

    /// How many exchanges the case holds.
    pub fn exchange_count(&self) -> usize {
        lock(&self.state).exchanges.len()
    }

    /// Lists exchanges (by id) that TS makes and Rust will not, besides any flagged `tsOnly` in the
    /// case file.
    pub fn with_ts_only(self, ids: &[&str]) -> Replay {
        lock(&self.state)
            .ts_only_ids
            .extend(ids.iter().map(|i| (*i).to_string()));
        self
    }

    /// Fails on any request that did not match its recorded twin, and on any recorded exchange that
    /// was never requested unless it is TS-only.
    pub fn finish(&self) -> Result<(), String> {
        let st = lock(&self.state);
        let mut problems = st.failures.clone();
        let left: Vec<&str> = st
            .exchanges
            .iter()
            .filter(|e| !e.consumed && !e.ts_only && !st.ts_only_ids.contains(&e.id))
            .map(|e| e.id.as_str())
            .collect();
        if !left.is_empty() {
            problems.push(format!(
                "unconsumed recorded exchange(s): {}",
                left.join(", ")
            ));
        }
        if problems.is_empty() {
            Ok(())
        } else {
            Err(problems.join("\n"))
        }
    }

    fn serve(&self, request: &Request) -> Result<Response, HttpError> {
        let mut st = lock(&self.state);
        let fail = |st: &mut State, message: String| {
            st.failures.push(message.clone());
            Err(HttpError::Network(message))
        };
        let Ok(url) = Url::parse(&request.url) else {
            return fail(
                &mut st,
                "replay: the request url is not absolute".to_string(),
            );
        };
        let method = request.method.as_str();
        let name = format!("{method} {}", shown_path(url.path()));
        let wanted = pairs(&url);
        let free =
            |e: &Exchange| !e.consumed && e.method == method && path_matches(&e.path, url.path());
        let twin = |e: &Exchange| free(e) && query_matches(&e.query, &wanted);
        let index = st
            .exchanges
            .iter()
            .position(|e| e.rust_only && twin(e))
            .or_else(|| st.exchanges.iter().position(twin))
            .or_else(|| st.exchanges.iter().position(free));
        let Some(index) = index else {
            return fail(&mut st, format!("replay: unmatched request: {name}"));
        };
        let diffs = differences(&st.exchanges[index], request, &url, &wanted);
        if !diffs.is_empty() {
            let message = format!(
                "replay: request {name} differs from exchange {}: {}",
                st.exchanges[index].id,
                diffs.join("; ")
            );
            return fail(&mut st, message);
        }
        let exchange = &mut st.exchanges[index];
        // The request was made and matched, so it is consumed whether or not its answer fits.
        exchange.consumed = true;
        if exchange.response_body.len() > request.max_body {
            return Err(HttpError::TooLarge);
        }
        if exchange.network_error {
            return Err(HttpError::Network("Network Error".to_string()));
        }
        Ok(Response {
            status: exchange.status,
            headers: exchange.response_headers.clone(),
            body: exchange.response_body.clone(),
        })
    }
}

impl Http for Replay {
    fn send(&self, request: Request) -> HttpFuture<'_> {
        Box::pin(async move { self.serve(&request) })
    }
}

// ------------------------------------------------------------------------------------------------
// Matching
// ------------------------------------------------------------------------------------------------

/// Whether `got` is `recorded`, where each `REDACTED` in `recorded` stands for one or more
/// characters. Without a `REDACTED` it is plain equality. The pieces between the wildcards must occur
/// in order, the first at the start and the last at the end.
pub(crate) fn wild_eq(recorded: &str, got: &str) -> bool {
    if !recorded.contains(REDACTED) {
        return recorded == got;
    }
    let pieces: Vec<&str> = recorded.split(REDACTED).collect();
    let (first, last) = (pieces[0], pieces[pieces.len() - 1]);
    if got.len() < first.len() + last.len() + (pieces.len() - 1) {
        return false;
    }
    if !got.starts_with(first) || !got.ends_with(last) {
        return false;
    }
    // The room the middle pieces and the wildcards may use: after the first piece, before the last.
    let (mut pos, end) = (first.len(), got.len() - last.len());
    for (i, piece) in pieces.iter().enumerate().skip(1) {
        // Each wildcard takes at least one character (a whole one: stay on a char boundary).
        let from = pos + got[pos..].chars().next().map_or(1, char::len_utf8);
        if i == pieces.len() - 1 {
            return end >= from;
        }
        if from > end {
            return false;
        }
        match got[from..end].find(piece) {
            Some(offset) => pos = from + offset + piece.len(),
            None => return false,
        }
    }
    true
}

/// A path for a failure message: the gamekey segment of an order path is never printed.
fn shown_path(path: &str) -> String {
    let segments: Vec<&str> = path.split('/').collect();
    segments
        .iter()
        .enumerate()
        .map(|(i, segment)| {
            let after_order = i >= 2
                && matches!(
                    (segments[i - 2], segments[i - 1]),
                    ("home", "library") | ("v1", "order") | ("v1", "orders")
                );
            if after_order && !segment.is_empty() {
                "<redacted>"
            } else {
                segment
            }
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn path_matches(recorded: &str, got: &str) -> bool {
    let (r, g): (Vec<&str>, Vec<&str>) = (recorded.split('/').collect(), got.split('/').collect());
    r.len() == g.len() && r.iter().zip(&g).all(|(r, g)| wild_eq(r, g))
}

fn query_matches(recorded: &[(String, String)], wanted: &[(String, String)]) -> bool {
    recorded.len() == wanted.len()
        && recorded
            .iter()
            .zip(wanted)
            .all(|(r, w)| r.0 == w.0 && wild_eq(&r.1, &w.1))
}

fn header<'a>(headers: &'a [(String, String)], name: &str) -> Option<&'a str> {
    headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(name))
        .map(|(_, v)| v.as_str())
}

/// A header value as the recorder writes it: the multipart boundary is the token.
fn normalised_header_value(value: &str) -> String {
    let lower = value.to_ascii_lowercase();
    if !lower.starts_with("multipart/form-data") {
        return value.to_string();
    }
    match lower.find("boundary=") {
        Some(i) => {
            let start = i + "boundary=".len();
            let rest = &value[start..];
            let end = if let Some(quoted) = rest.strip_prefix('"') {
                quoted.find('"').map_or(rest.len(), |q| q + 2)
            } else {
                rest.find([';', ' ']).unwrap_or(rest.len())
            };
            format!("{}{}{}", &value[..start], BOUNDARY_TOKEN, &rest[end..])
        }
        None => value.to_string(),
    }
}

fn boundary_of(content_type: &str) -> Option<String> {
    let lower = content_type.to_ascii_lowercase();
    let i = lower.find("boundary=")? + "boundary=".len();
    let rest = &content_type[i..];
    let value = match rest.strip_prefix('"') {
        Some(quoted) => quoted.split('"').next()?,
        None => rest.split([';', ' ']).next()?,
    };
    (!value.is_empty()).then(|| value.to_string())
}

/// The first `name="..."` (or `filename="..."`) value in a part's header block.
fn quoted_param(head: &str, param: &str) -> Option<String> {
    let needle = format!("{param}=\"");
    let mut from = 0;
    while let Some(found) = head[from..].find(&needle) {
        let at = from + found;
        // `name="` must not be the tail of `filename="`.
        if param == "name" && head[..at].ends_with("file") {
            from = at + needle.len();
            continue;
        }
        let rest = &head[at + needle.len()..];
        let mut out = String::new();
        let mut chars = rest.chars();
        while let Some(c) = chars.next() {
            match c {
                '\\' => {
                    if let Some(next) = chars.next() {
                        out.push(next);
                    }
                }
                '"' => return Some(out),
                other => out.push(other),
            }
        }
        return None;
    }
    None
}

/// The fields of a multipart body, in order: name, filename and (for a text part) the value.
fn parse_multipart(body: &[u8], boundary: &str) -> Vec<Part> {
    let delimiter = format!("--{boundary}");
    let mut parts = Vec::new();
    let mut chunks: Vec<&[u8]> = Vec::new();
    let mut rest = body;
    let delim = delimiter.as_bytes();
    while let Some(at) = rest.windows(delim.len()).position(|w| w == delim) {
        chunks.push(&rest[..at]);
        rest = &rest[at + delim.len()..];
    }
    chunks.push(rest);
    for chunk in chunks {
        let chunk = chunk.strip_prefix(b"\r\n").unwrap_or(chunk);
        if chunk.is_empty() || chunk.starts_with(b"--") {
            continue;
        }
        let Some(split) = chunk.windows(4).position(|w| w == b"\r\n\r\n") else {
            continue;
        };
        let head = String::from_utf8_lossy(&chunk[..split]).into_owned();
        let Some(name) = quoted_param(&head, "name") else {
            continue;
        };
        let filename = quoted_param(&head, "filename");
        let raw = &chunk[split + 4..];
        let raw = raw.strip_suffix(b"\r\n").unwrap_or(raw);
        parts.push(Part {
            name,
            value: filename
                .is_none()
                .then(|| String::from_utf8_lossy(raw).into_owned()),
            filename,
        });
    }
    parts
}

fn parts_match(recorded: &[Part], got: &[Part]) -> Result<(), String> {
    if recorded.len() != got.len() {
        return Err(format!(
            "multipart has {} field(s), recorded {}",
            got.len(),
            recorded.len()
        ));
    }
    for (i, (r, g)) in recorded.iter().zip(got).enumerate() {
        if r.name != g.name {
            return Err(format!(
                "multipart field {i} is named {:?}, recorded {:?}",
                g.name, r.name
            ));
        }
        if r.filename != g.filename {
            return Err(format!("multipart field {i} ({}) filename differs", r.name));
        }
        let same = match (&r.value, &g.value) {
            (Some(r), Some(g)) => wild_eq(r, g),
            (None, None) => true,
            _ => false,
        };
        if !same {
            // The name is a fixed protocol token; the value can be a gamekey.
            return Err(format!("multipart field {i} ({}) value differs", r.name));
        }
    }
    Ok(())
}

fn shown(name: &str, value: Option<&str>) -> String {
    match value {
        None => "<absent>".to_string(),
        Some(_) if HIDDEN_HEADERS.contains(&name) => "<hidden>".to_string(),
        Some(v) => format!("{v:?}"),
    }
}

fn differences(
    exchange: &Exchange,
    request: &Request,
    url: &Url,
    wanted: &[(String, String)],
) -> Vec<String> {
    let mut diffs = Vec::new();
    if url.scheme() != "https" {
        diffs.push("the request is not https".to_string());
    }
    if let Some(recorded_host) = header(&exchange.headers, "host") {
        let got = match url.port() {
            Some(port) => format!("{}:{port}", url.host_str().unwrap_or_default()),
            None => url.host_str().unwrap_or_default().to_string(),
        };
        if !recorded_host.eq_ignore_ascii_case(&got) {
            diffs.push(format!("host is {got}, recorded {recorded_host}"));
        }
    }
    if !query_matches(&exchange.query, wanted) {
        if exchange.query.len() != wanted.len() {
            diffs.push(format!(
                "query has {} pair(s), recorded {}",
                wanted.len(),
                exchange.query.len()
            ));
        } else if let Some(i) = (0..wanted.len()).find(|i| {
            let (r, w) = (&exchange.query[*i], &wanted[*i]);
            !(r.0 == w.0 && wild_eq(&r.1, &w.1))
        }) {
            diffs.push(format!("query pair {i} ({}) differs", exchange.query[i].0));
        }
    }
    for name in PINNED_HEADERS {
        let recorded = header(&exchange.headers, name).map(normalised_header_value);
        let got = header(&request.headers, name).map(normalised_header_value);
        let same = match (&recorded, &got) {
            (None, None) => true,
            (Some(r), Some(g)) => wild_eq(r, g),
            _ => false,
        };
        if !same {
            diffs.push(format!(
                "header {name}: recorded {}, got {}",
                shown(name, recorded.as_deref()),
                shown(name, got.as_deref())
            ));
        }
    }
    let live_body = request.body.as_deref().filter(|b| !b.is_empty());
    match &exchange.multipart {
        Some(recorded) => {
            let boundary = header(&request.headers, "content-type").and_then(boundary_of);
            match (live_body, boundary) {
                (Some(body), Some(boundary)) => {
                    if let Err(why) = parts_match(recorded, &parse_multipart(body, &boundary)) {
                        diffs.push(why);
                    }
                }
                _ => diffs.push("the request has no multipart body".to_string()),
            }
        }
        None => {
            let live = live_body.map(|b| String::from_utf8_lossy(b).into_owned());
            let same = match (&exchange.body, &live) {
                (None, None) => true,
                (Some(r), Some(g)) => wild_eq(r, g),
                _ => false,
            };
            if !same {
                diffs.push(format!(
                    "body differs (recorded {} byte(s), got {})",
                    exchange.body.as_ref().map_or(0, String::len),
                    live.as_ref().map_or(0, String::len)
                ));
            }
        }
    }
    diffs
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn a_redacted_token_stands_for_one_or_more_characters() {
        assert!(wild_eq("abc", "abc"));
        assert!(!wild_eq("abc", "abd"));
        assert!(wild_eq("_simpleauth_sess=REDACTED", "_simpleauth_sess=xyz"));
        assert!(!wild_eq("_simpleauth_sess=REDACTED", "_simpleauth_sess="));
        assert!(!wild_eq("_simpleauth_sess=REDACTED", "other=xyz"));
        assert!(wild_eq(
            "[\"REDACTED\",\"REDACTED\",\"$undefined\"]",
            "[\"GKONE\",\"7\",\"$undefined\"]"
        ));
        assert!(!wild_eq(
            "[\"REDACTED\",\"REDACTED\",\"$undefined\"]",
            "[\"GKONE\",\"$undefined\"]"
        ));
        assert!(wild_eq("REDACTED", "x"));
        assert!(!wild_eq("REDACTED", ""));
        // The wildcards are not greedy past the pieces that must follow them.
        assert!(wild_eq("aREDACTEDbREDACTEDc", "a1b2b3c"));
        assert!(!wild_eq("aREDACTEDbREDACTEDc", "ab c"));
    }

    #[test]
    fn a_multipart_boundary_is_normalised_to_the_recorders_token() {
        assert_eq!(
            normalised_header_value("multipart/form-data; boundary=----abc123"),
            "multipart/form-data; boundary=<BOUNDARY>"
        );
        assert_eq!(
            normalised_header_value("multipart/form-data; boundary=\"q\"; x=1"),
            "multipart/form-data; boundary=<BOUNDARY>; x=1"
        );
        assert_eq!(normalised_header_value("text/plain"), "text/plain");
    }

    #[test]
    fn a_built_multipart_body_parses_back_to_its_fields() {
        use crate::http::MultipartValue;
        let request = Request::post("https://x.test/", Duration::from_secs(1)).multipart(vec![
            ("a".to_string(), MultipartValue::Text("1".to_string())),
            ("b".to_string(), MultipartValue::Text(String::new())),
            (
                "c".to_string(),
                MultipartValue::File {
                    filename: "f.txt".to_string(),
                    content_type: "text/plain".to_string(),
                    bytes: b"body".to_vec(),
                },
            ),
        ]);
        let content_type = header(&request.headers, "content-type").unwrap();
        let parsed = parse_multipart(
            request.body.as_deref().unwrap(),
            &boundary_of(content_type).unwrap(),
        );
        assert_eq!(
            parsed,
            [
                Part {
                    name: "a".to_string(),
                    filename: None,
                    value: Some("1".to_string())
                },
                Part {
                    name: "b".to_string(),
                    filename: None,
                    value: Some(String::new())
                },
                Part {
                    name: "c".to_string(),
                    filename: Some("f.txt".to_string()),
                    value: None
                },
            ]
        );
    }

    fn case(dir: &Path, exchanges: &str) -> Replay {
        std::fs::write(dir.join("exchanges.json"), exchanges).unwrap();
        Replay::from_recorded(dir).expect("the case loads")
    }

    const POST_CASE: &str = r#"[{
      "id": 1,
      "request": {
        "method": "POST", "target": "/home/library/REDACTED?x=1",
        "headers": [["host","www.humblebundle.com"],["Cookie","_simpleauth_sess=REDACTED"],
                    ["User-Agent","UA"],["content-type","multipart/form-data; boundary=<BOUNDARY>"],
                    ["accept-encoding","gzip"],["content-length","<LENGTH>"]],
        "multipart": [{"name":"_1_page","value":"1"},{"name":"0","value":"[\"REDACTED\"]"}]
      },
      "response": {"status": 200, "headers": [["content-type","text/plain"]]}
    }]"#;

    fn post(fields: Vec<(&str, &str)>, cookie: &str) -> Request {
        use crate::http::MultipartValue;
        Request::post(
            "https://www.humblebundle.com/home/library/GKSECRET?x=1",
            Duration::from_secs(1),
        )
        .header("Cookie", cookie)
        .header("User-Agent", "UA")
        .multipart(
            fields
                .into_iter()
                .map(|(n, v)| (n.to_string(), MultipartValue::Text(v.to_string())))
                .collect(),
        )
    }

    #[tokio::test]
    async fn a_matching_request_is_served_and_a_redacted_value_matches_any_real_one() {
        let dir = tempfile::tempdir().unwrap();
        let replay = case(dir.path(), POST_CASE);
        let response = replay
            .send(post(
                vec![("_1_page", "1"), ("0", "[\"GKSECRET\"]")],
                "_simpleauth_sess=REAL-COOKIE",
            ))
            .await
            .expect("the twin answers");
        assert_eq!(response.status, 200);
        replay
            .finish()
            .expect("nothing differs and nothing is left");
    }

    /// Multipart field order is pinned: the same fields in another order fail, and the message names
    /// the position and the field, never a value.
    #[tokio::test]
    async fn a_different_multipart_field_order_fails_without_printing_a_value() {
        let dir = tempfile::tempdir().unwrap();
        let replay = case(dir.path(), POST_CASE);
        let error = replay
            .send(post(
                vec![("0", "[\"GKSECRET\"]"), ("_1_page", "1")],
                "_simpleauth_sess=REAL-COOKIE",
            ))
            .await
            .expect_err("the order differs");
        let text = error.to_string();
        assert!(text.contains("multipart field 0"), "{text}");
        for secret in ["GKSECRET", "REAL-COOKIE"] {
            assert!(!text.contains(secret), "{text} carries {secret}");
        }
        let finished = replay.finish().unwrap_err();
        assert!(finished.contains("multipart field 0"));
    }

    #[tokio::test]
    async fn a_missing_empty_or_extra_pinned_header_is_drift() {
        let dir = tempfile::tempdir().unwrap();
        // A cookie the recording lacks is drift too.
        let replay = case(
            dir.path(),
            r#"[{"id":1,"request":{"method":"GET","target":"/api/storesearch/?term=A&l=english&cc=US",
              "headers":[["Host","store.steampowered.com"],["User-Agent","GameLib"]]},
              "response":{"status":200,"headers":[]}}]"#,
        );
        let base = || {
            Request::get(
                "https://store.steampowered.com/api/storesearch/?term=A&l=english&cc=US",
                Duration::from_secs(1),
            )
        };
        let extra = replay
            .send(
                base()
                    .header("User-Agent", "GameLib")
                    .header("Cookie", "a=b"),
            )
            .await
            .expect_err("a pinned header the recording lacks");
        assert!(extra.to_string().contains("header cookie"), "{extra}");

        let other_ua = case(
            dir.path(),
            r#"[{"id":1,"request":{"method":"GET","target":"/api/storesearch/?term=A&l=english&cc=US",
              "headers":[["Host","store.steampowered.com"],["User-Agent","GameLib"]]},
              "response":{"status":200,"headers":[]}}]"#,
        );
        let wrong = other_ua
            .send(base().header("User-Agent", "axios/1"))
            .await
            .expect_err("a different user agent");
        assert!(wrong.to_string().contains("header user-agent"), "{wrong}");

        // A transport header is not pinned.
        let transport = case(
            dir.path(),
            r#"[{"id":1,"request":{"method":"GET","target":"/api/storesearch/?term=A&l=english&cc=US",
              "headers":[["Host","store.steampowered.com"],["User-Agent","GameLib"],
                         ["Accept-Encoding","gzip, compress, deflate, br"],["Connection","keep-alive"]]},
              "response":{"status":200,"headers":[]}}]"#,
        );
        transport
            .send(base().header("User-Agent", "GameLib"))
            .await
            .expect("transport headers are not pinned");
        transport.finish().unwrap();
    }

    #[tokio::test]
    async fn a_wrong_host_scheme_query_or_an_unmatched_request_fails_and_stays_failed() {
        let dir = tempfile::tempdir().unwrap();
        let recorded = r#"[{"id":1,"request":{"method":"GET","target":"/api/storesearch/?term=A+B&l=english&cc=US",
              "headers":[["Host","store.steampowered.com"]]},"response":{"status":200,"headers":[]}}]"#;
        let get = |url: &str| Request::get(url.to_string(), Duration::from_secs(1));

        // The query is compared decoded, so `+` and `%20` are the same term.
        let ok = case(dir.path(), recorded);
        ok.send(get(
            "https://store.steampowered.com/api/storesearch/?term=A%20B&l=english&cc=US",
        ))
        .await
        .expect("a decoded query matches");
        ok.finish().unwrap();

        let host = case(dir.path(), recorded);
        let error = host
            .send(get(
                "https://evil.example/api/storesearch/?term=A+B&l=english&cc=US",
            ))
            .await
            .unwrap_err();
        assert!(error.to_string().contains("host is"), "{error}");

        let scheme = case(dir.path(), recorded);
        let error = scheme
            .send(get(
                "http://store.steampowered.com/api/storesearch/?term=A+B&l=english&cc=US",
            ))
            .await
            .unwrap_err();
        assert!(error.to_string().contains("not https"), "{error}");

        let query = case(dir.path(), recorded);
        let error = query
            .send(get(
                "https://store.steampowered.com/api/storesearch/?term=A+C&l=english&cc=US",
            ))
            .await
            .unwrap_err();
        assert!(error.to_string().contains("query pair 0"), "{error}");

        let unmatched = case(dir.path(), recorded);
        let error = unmatched
            .send(get("https://store.steampowered.com/other"))
            .await
            .unwrap_err();
        assert!(error.to_string().contains("unmatched request"), "{error}");
        // The failure is sticky, and the exchange nobody matched is reported too.
        let finished = unmatched.finish().unwrap_err();
        assert!(finished.contains("unmatched request") && finished.contains("unconsumed"));
    }

    #[tokio::test]
    async fn network_error_and_ts_only_exchanges_behave_as_flagged() {
        let dir = tempfile::tempdir().unwrap();
        let replay = case(
            dir.path(),
            r#"[{"id":"a","networkError":true,"request":{"method":"GET","target":"/x","headers":[]},
                 "response":{"status":0,"headers":[]}},
                {"id":"b","tsOnly":true,"request":{"method":"GET","target":"/y","headers":[]},
                 "response":{"status":200,"headers":[]}}]"#,
        );
        let error = replay
            .send(Request::get("https://h.test/x", Duration::from_secs(1)))
            .await
            .unwrap_err();
        assert_eq!(error, HttpError::Network("Network Error".to_string()));
        // `b` is TS-only, so leaving it unrequested is fine.
        replay.finish().unwrap();
        assert_eq!(replay.exchange_count(), 2);
    }

    #[test]
    fn a_base64_body_or_a_body_file_outside_the_case_is_refused_at_load() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("exchanges.json"),
            r#"[{"id":1,"request":{"method":"POST","target":"/x","headers":[],"body":{"base64":"AAAA"}},
                 "response":{"status":200,"headers":[]}}]"#,
        )
        .unwrap();
        assert!(Replay::from_recorded(dir.path())
            .err()
            .unwrap()
            .contains("base64"));
        std::fs::write(
            dir.path().join("exchanges.json"),
            r#"[{"id":1,"request":{"method":"GET","target":"/x","headers":[]},
                 "response":{"status":200,"headers":[],"bodyFile":"../x"}}]"#,
        )
        .unwrap();
        assert!(Replay::from_recorded(dir.path())
            .err()
            .unwrap()
            .contains("inside the case directory"));
    }
}
