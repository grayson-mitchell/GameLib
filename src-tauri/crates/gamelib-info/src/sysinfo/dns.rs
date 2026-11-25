//! The `pci.ids` TXT lookup (`<ids>.pci.id.ucw.cz`), the one network read of the system-information
//! probes. Node used `dns.resolveTxt`; no DNS crate is in the lockfile (Task 2 of 88.1-09: the operator
//! chose an in-repo query over UDP, option A).
//!
//! - [`TxtResolver`] is the seam: the production [`SystemTxtResolver`] speaks DNS to the system's
//!   resolvers, a test installs a scripted one that answers the recorded `dns.json`.
//! - One query shape: a recursive TXT query, one question, no EDNS, over UDP (a truncated answer is not
//!   retried over TCP: `pci.ids` answers are short single strings).
//! - The answer is untrusted input (T-88.1-18). [`parse_reply`] checks every length against the packet,
//!   never follows a compression pointer (so nothing recurses or loops: a pointer must point backward
//!   into the message, and is skipped over, not read through), caps the answers it walks, and reads no
//!   more than the packet holds. A reply that does not echo our id and question is dropped. The answer is
//!   used only as a display name and is never logged.
//! - The whole lookup is bounded to [`LOOKUP_TIMEOUT`] (T-88.1-19) and gives up at once when the
//!   application is shutting down. It holds a shutdown registrant for exactly as long as it is in flight.
//! - A failed lookup logs nothing: the TS swallowed the error without a line (`.catch(() => [])`) and the
//!   goldens record no event for it, and a hostname, address or answer must not reach `gamelib.log`
//!   (prohibition 1).

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;

use gamelib_core::process::BoxFuture;
use gamelib_core::shutdown::Shutdown;
use tokio::net::UdpSocket;
use tokio::time::Instant;

/// The total bound on one lookup (every resolver tried, the answer read).
pub const LOOKUP_TIMEOUT: Duration = Duration::from_secs(5);
/// How long one resolver gets before the next is tried.
const PER_SERVER_TIMEOUT: Duration = Duration::from_millis(2_000);
/// At most this many of the system's resolvers are asked.
const MAX_SERVERS: usize = 3;
/// The receive buffer: the cap on an answer's size. A larger datagram is cut by the OS or refused,
/// and either way is not parsed as a whole answer.
const MAX_PACKET: usize = 4_096;
/// At most this many answer records are walked.
const MAX_ANSWERS: usize = 32;
/// A name's total length on the wire (RFC 1035).
const MAX_NAME_WIRE: usize = 255;
const HEADER_LEN: usize = 12;
const TYPE_TXT: u16 = 16;
const CLASS_IN: u16 = 1;

/// Resolves a TXT name to the first string of its first record, with a leading `i=` removed
/// (`pciIdDnsQuery`). `None` is "no answer" for any reason: the TS answered `false` for a lookup
/// error, a missing name and a missing record alike.
pub trait TxtResolver: Send + Sync {
    fn lookup(&self, name: &str) -> BoxFuture<Option<String>>;
}

/// What one datagram from a resolver amounts to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Reply {
    /// A TXT record's first string, `i=` already removed.
    Answer(String),
    /// A valid reply that holds no usable TXT: the name does not exist, has no TXT, or the answer was
    /// truncated. Definitive, so no other resolver is asked.
    NoAnswer,
    /// The resolver failed (SERVFAIL, REFUSED, ...): the next one may do better.
    ServerFailed,
    /// Not a reply to our query, or malformed: dropped, and the wait goes on.
    Invalid,
}

fn be16(packet: &[u8], at: usize) -> Option<u16> {
    let bytes = packet.get(at..at.checked_add(2)?)?;
    Some(u16::from_be_bytes([bytes[0], bytes[1]]))
}

/// The wire form of `name` (`labels`, a terminating zero), or `None` when it is not a name a resolver
/// would take: an empty label, a label over 63 bytes, a name over 253 characters, or a byte outside the
/// printable ASCII range.
fn encode_name(name: &str) -> Option<Vec<u8>> {
    let name = name.strip_suffix('.').unwrap_or(name);
    if name.is_empty() || name.len() > MAX_NAME_WIRE - 2 {
        return None;
    }
    let mut wire = Vec::with_capacity(name.len() + 2);
    for label in name.split('.') {
        if label.is_empty()
            || label.len() > 63
            || !label.bytes().all(|b| (0x21..=0x7E).contains(&b))
        {
            return None;
        }
        wire.push(label.len() as u8);
        wire.extend_from_slice(label.as_bytes());
    }
    wire.push(0);
    Some(wire)
}

/// A recursive TXT query for `name` carrying `id`: the header, one question. `None` for an invalid name.
pub fn build_query(id: u16, name: &str) -> Option<Vec<u8>> {
    let wire = encode_name(name)?;
    let mut packet = Vec::with_capacity(HEADER_LEN + wire.len() + 4);
    packet.extend_from_slice(&id.to_be_bytes());
    packet.extend_from_slice(&0x0100u16.to_be_bytes()); // a standard query, recursion desired
    packet.extend_from_slice(&1u16.to_be_bytes()); // one question
    packet.extend_from_slice(&[0; 6]); // no answer, authority or additional records
    packet.extend_from_slice(&wire);
    packet.extend_from_slice(&TYPE_TXT.to_be_bytes());
    packet.extend_from_slice(&CLASS_IN.to_be_bytes());
    Some(packet)
}

/// Where the name that starts at `pos` ends. A compression pointer is two bytes and ends the name; it
/// is not followed, and it must point backward into the message past the header (so a self-pointing or
/// forward pointer, the shapes of a loop, is malformed). A reserved label type, a label past the end of
/// the packet or a name over 255 bytes is `None`.
fn skip_name(packet: &[u8], pos: usize) -> Option<usize> {
    let start = pos;
    let mut at = pos;
    loop {
        let byte = *packet.get(at)?;
        match byte & 0xC0 {
            0x00 => {
                if byte == 0 {
                    return Some(at + 1);
                }
                at += 1 + usize::from(byte);
                if at > packet.len() || at - start > MAX_NAME_WIRE {
                    return None;
                }
            }
            0xC0 => {
                let low = *packet.get(at + 1)?;
                let target = (usize::from(byte & 0x3F) << 8) | usize::from(low);
                if target < HEADER_LEN || target >= at {
                    return None;
                }
                return Some(at + 2);
            }
            _ => return None,
        }
    }
}

/// The first character-string of a TXT record's data. The string's length byte must fit inside the
/// record's RDLENGTH; invalid UTF-8 is replaced (`pci.ids` names are text; a bad byte must not drop the
/// GPU).
fn first_txt_string(rdata: &[u8]) -> Option<String> {
    let len = usize::from(*rdata.first()?);
    let text = rdata.get(1..1 + len)?;
    Some(String::from_utf8_lossy(text).into_owned())
}

/// Reads one datagram as the answer to `query` (our own packet, whose id and question the reply must
/// echo). Never panics, whatever `packet` holds.
pub fn parse_reply(packet: &[u8], query: &[u8]) -> Reply {
    let Some(question) = query.get(HEADER_LEN..) else {
        return Reply::Invalid;
    };
    let (Some(id), Some(flags), Some(questions), Some(answers)) = (
        be16(packet, 0),
        be16(packet, 2),
        be16(packet, 4),
        be16(packet, 6),
    ) else {
        return Reply::Invalid;
    };
    if Some(id) != be16(query, 0) {
        return Reply::Invalid;
    }
    // A response (QR) to a standard query (opcode 0) that repeats our one question.
    if flags & 0x8000 == 0 || flags & 0x7800 != 0 || questions != 1 {
        return Reply::Invalid;
    }
    let Some(echoed) = packet.get(HEADER_LEN..HEADER_LEN + question.len()) else {
        return Reply::Invalid;
    };
    if !echoed.eq_ignore_ascii_case(question) {
        return Reply::Invalid;
    }
    if flags & 0x0200 != 0 {
        // Truncated: the answer is not all here and there is no TCP retry.
        return Reply::NoAnswer;
    }
    match flags & 0x000F {
        0 => {}
        3 => return Reply::NoAnswer,
        _ => return Reply::ServerFailed,
    }

    let mut pos = HEADER_LEN + question.len();
    for _ in 0..usize::from(answers).min(MAX_ANSWERS) {
        let Some(after_name) = skip_name(packet, pos) else {
            return Reply::Invalid;
        };
        let (Some(kind), Some(class), Some(rdlength)) = (
            be16(packet, after_name),
            be16(packet, after_name + 2),
            be16(packet, after_name + 8),
        ) else {
            return Reply::Invalid;
        };
        let start = after_name + 10;
        let Some(rdata) = packet.get(start..start + usize::from(rdlength)) else {
            return Reply::Invalid;
        };
        if kind == TYPE_TXT && class == CLASS_IN {
            return match first_txt_string(rdata) {
                Some(text) => Reply::Answer(text.strip_prefix("i=").unwrap_or(&text).to_string()),
                None => Reply::Invalid,
            };
        }
        pos = start + usize::from(rdlength);
    }
    Reply::NoAnswer
}

/// The TXT answer in `packet`, or `None` for anything else (malformed, wrong id or question, no TXT,
/// an error code).
pub fn parse_txt_response(packet: &[u8], query: &[u8]) -> Option<String> {
    match parse_reply(packet, query) {
        Reply::Answer(text) => Some(text),
        _ => None,
    }
}

/// The nameservers `/etc/resolv.conf` lists, in order, as the OS resolver reads them: `nameserver
/// <address>` lines, `#` and `;` comments, an address with a zone (`fe80::1%en0`) skipped because a
/// plain socket address cannot carry its scope.
pub fn parse_resolv_conf(text: &str) -> Vec<IpAddr> {
    text.lines()
        .filter_map(|line| {
            let line = line.split(['#', ';']).next().unwrap_or("");
            let mut words = line.split_whitespace();
            if words.next()? != "nameserver" {
                return None;
            }
            words.next()?.parse::<IpAddr>().ok()
        })
        .collect()
}

#[cfg(not(windows))]
fn system_nameservers() -> Vec<IpAddr> {
    std::fs::read_to_string("/etc/resolv.conf")
        .map(|text| parse_resolv_conf(&text))
        .unwrap_or_default()
}

/// The IPv4 DNS servers Windows lists (`GetNetworkParams`).
#[cfg(windows)]
fn system_nameservers() -> Vec<IpAddr> {
    use windows_sys::Win32::NetworkManagement::IpHelper::{GetNetworkParams, FIXED_INFO_W2KSP1};

    const ERROR_BUFFER_OVERFLOW: u32 = 111;
    let mut size: u32 = 0;
    // SAFETY: a null buffer with a zero length only asks for the size needed.
    let first = unsafe { GetNetworkParams(std::ptr::null_mut(), &mut size) };
    if first != ERROR_BUFFER_OVERFLOW || size == 0 {
        return Vec::new();
    }
    // u64 elements: the structure wants 8-byte alignment.
    let mut buffer = vec![0u64; (size as usize).div_ceil(8)];
    let info = buffer.as_mut_ptr().cast::<FIXED_INFO_W2KSP1>();
    // SAFETY: `info` points at `size` writable, suitably aligned bytes.
    if unsafe { GetNetworkParams(info, &mut size) } != 0 {
        return Vec::new();
    }
    let mut servers = Vec::new();
    // SAFETY: the call succeeded, so `info` holds a FIXED_INFO whose `DnsServerList` is the head of a
    // linked list living inside `buffer`; each `Next` is read only while non-null and at most
    // `MAX_SERVERS` nodes are followed.
    unsafe {
        let mut node: *const _ = &(*info).DnsServerList;
        let mut walked = 0;
        while !node.is_null() && walked < MAX_SERVERS {
            let text: Vec<u8> = (*node)
                .IpAddress
                .String
                .iter()
                .take_while(|c| **c != 0)
                .map(|c| *c as u8)
                .collect();
            if let Some(addr) = std::str::from_utf8(&text)
                .ok()
                .and_then(|t| t.parse::<IpAddr>().ok())
            {
                servers.push(addr);
            }
            node = (*node).Next;
            walked += 1;
        }
    }
    servers
}

/// A random message id. `RandomState` is seeded by the OS, so no extra crate is needed for it.
fn random_id() -> u16 {
    (RandomState::new().build_hasher().finish() & 0xFFFF) as u16
}

/// Asks one resolver. A connected socket only receives datagrams from that address.
async fn ask(server: SocketAddr, query: &[u8], timeout: Duration) -> Reply {
    let bind: SocketAddr = if server.is_ipv6() {
        (std::net::Ipv6Addr::UNSPECIFIED, 0).into()
    } else {
        (Ipv4Addr::UNSPECIFIED, 0).into()
    };
    let Ok(socket) = UdpSocket::bind(bind).await else {
        return Reply::ServerFailed;
    };
    if socket.connect(server).await.is_err() || socket.send(query).await.is_err() {
        return Reply::ServerFailed;
    }
    let deadline = Instant::now() + timeout;
    let mut buffer = vec![0u8; MAX_PACKET];
    loop {
        match tokio::time::timeout_at(deadline, socket.recv(&mut buffer)).await {
            Ok(Ok(len)) => match parse_reply(&buffer[..len], query) {
                Reply::Invalid => continue,
                reply => return reply,
            },
            _ => return Reply::ServerFailed,
        }
    }
}

async fn resolve(servers: &[SocketAddr], name: &str) -> Option<String> {
    let query = build_query(random_id(), name)?;
    let deadline = Instant::now() + LOOKUP_TIMEOUT;
    for server in servers.iter().take(MAX_SERVERS) {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            break;
        }
        match ask(*server, &query, left.min(PER_SERVER_TIMEOUT)).await {
            Reply::Answer(text) => return Some(text),
            Reply::NoAnswer => return None,
            Reply::ServerFailed | Reply::Invalid => {}
        }
    }
    None
}

/// The production resolver: the system's nameservers, read when a lookup starts.
pub struct SystemTxtResolver {
    shutdown: Shutdown,
    servers: Option<Vec<SocketAddr>>,
}

impl SystemTxtResolver {
    /// Asks the resolvers the OS lists; a lookup in flight ends when `shutdown` is cancelled.
    pub fn new(shutdown: Shutdown) -> SystemTxtResolver {
        SystemTxtResolver {
            shutdown,
            servers: None,
        }
    }

    /// Asks exactly these servers instead of the OS's (tests, a local stub).
    pub fn with_servers(shutdown: Shutdown, servers: Vec<SocketAddr>) -> SystemTxtResolver {
        SystemTxtResolver {
            shutdown,
            servers: Some(servers),
        }
    }
}

impl TxtResolver for SystemTxtResolver {
    fn lookup(&self, name: &str) -> BoxFuture<Option<String>> {
        let shutdown = self.shutdown.clone();
        let fixed = self.servers.clone();
        let name = name.to_string();
        Box::pin(async move {
            let token = shutdown.token();
            if token.is_cancelled() {
                return None;
            }
            // Held for exactly the time the lookup is in flight.
            let _registrant = shutdown.register("info-pciids-dns");
            let servers = fixed.unwrap_or_else(|| {
                let mut found: Vec<SocketAddr> = system_nameservers()
                    .into_iter()
                    .map(|ip| SocketAddr::new(ip, 53))
                    .collect();
                if found.is_empty() {
                    // What the OS resolvers fall back to with no configuration.
                    found.push(SocketAddr::new(Ipv4Addr::LOCALHOST.into(), 53));
                }
                found
            });
            tokio::select! {
                _ = token.cancelled() => None,
                found = tokio::time::timeout(LOOKUP_TIMEOUT, resolve(&servers, &name)) => {
                    found.ok().flatten()
                }
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NAME: &str = "e445.1da2.73bf.1002.pci.id.ucw.cz";

    fn query() -> Vec<u8> {
        build_query(0xBEEF, NAME).expect("a valid name")
    }

    /// A reply to `query()`: `flags`, `answers` records appended after the echoed question.
    fn reply_with(flags: u16, answers: u16, records: &[u8]) -> Vec<u8> {
        let q = query();
        let mut packet = q[..2].to_vec();
        packet.extend_from_slice(&flags.to_be_bytes());
        packet.extend_from_slice(&1u16.to_be_bytes());
        packet.extend_from_slice(&answers.to_be_bytes());
        packet.extend_from_slice(&[0; 4]);
        packet.extend_from_slice(&q[HEADER_LEN..]);
        packet.extend_from_slice(records);
        packet
    }

    /// One record named by a pointer to the question's name (offset 12), the given type, class and rdata.
    fn record(kind: u16, class: u16, rdata: &[u8]) -> Vec<u8> {
        let mut rr = vec![0xC0, 0x0C];
        rr.extend_from_slice(&kind.to_be_bytes());
        rr.extend_from_slice(&class.to_be_bytes());
        rr.extend_from_slice(&300u32.to_be_bytes());
        rr.extend_from_slice(&(rdata.len() as u16).to_be_bytes());
        rr.extend_from_slice(rdata);
        rr
    }

    fn txt(strings: &[&str]) -> Vec<u8> {
        strings
            .iter()
            .flat_map(|s| std::iter::once(s.len() as u8).chain(s.bytes()))
            .collect()
    }

    const OK: u16 = 0x8180;

    #[test]
    fn the_query_is_one_recursive_txt_question() {
        let q = build_query(0x1234, "1002.pci.id.ucw.cz").unwrap();
        assert_eq!(&q[..12], &[0x12, 0x34, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0]);
        assert_eq!(&q[12..17], &[4, b'1', b'0', b'0', b'2']);
        assert_eq!(&q[q.len() - 5..], &[0, 0, 16, 0, 1]);
    }

    #[test]
    fn a_name_a_resolver_would_refuse_builds_no_query() {
        assert!(build_query(1, "").is_none());
        assert!(build_query(1, "a..b").is_none());
        assert!(build_query(1, "has space.pci.id.ucw.cz").is_none());
        assert!(build_query(1, "nön.pci.id.ucw.cz").is_none());
        assert!(build_query(1, &format!("{}.cz", "a".repeat(64))).is_none());
        assert!(build_query(1, &format!("{}.cz", "a.".repeat(130))).is_none());
        assert!(build_query(1, "1002.pci.id.ucw.cz.").is_some());
    }

    #[test]
    fn a_txt_answer_gives_its_first_string_without_the_i_prefix() {
        let rr = record(16, 1, &txt(&["i=Navi 21 [Radeon RX 6800]", "ignored"]));
        let packet = reply_with(OK, 1, &rr);
        assert_eq!(
            parse_txt_response(&packet, &query()),
            Some("Navi 21 [Radeon RX 6800]".to_string())
        );
        // Only a leading `i=` goes, and only once.
        let rr = record(16, 1, &txt(&["i=i=x"]));
        assert_eq!(
            parse_txt_response(&reply_with(OK, 1, &rr), &query()),
            Some("i=x".to_string())
        );
        let rr = record(16, 1, &txt(&["no prefix"]));
        assert_eq!(
            parse_txt_response(&reply_with(OK, 1, &rr), &query()),
            Some("no prefix".to_string())
        );
    }

    #[test]
    fn a_txt_record_after_other_records_is_found_and_a_record_without_txt_is_no_answer() {
        let mut records = record(5, 1, &[1, b'x', 0]); // a CNAME first
        records.extend(record(16, 1, &txt(&["i=found"])));
        assert_eq!(
            parse_txt_response(&reply_with(OK, 2, &records), &query()),
            Some("found".to_string())
        );
        let only_other = record(1, 1, &[1, 2, 3, 4]);
        assert_eq!(
            parse_reply(&reply_with(OK, 1, &only_other), &query()),
            Reply::NoAnswer
        );
        assert_eq!(
            parse_reply(&reply_with(OK, 0, &[]), &query()),
            Reply::NoAnswer
        );
    }

    #[test]
    fn error_codes_and_truncation_are_told_apart() {
        assert_eq!(
            parse_reply(&reply_with(0x8183, 0, &[]), &query()),
            Reply::NoAnswer
        );
        assert_eq!(
            parse_reply(&reply_with(0x8182, 0, &[]), &query()),
            Reply::ServerFailed
        );
        assert_eq!(
            parse_reply(&reply_with(0x8185, 0, &[]), &query()),
            Reply::ServerFailed
        );
        let rr = record(16, 1, &txt(&["i=x"]));
        assert_eq!(
            parse_reply(&reply_with(OK | 0x0200, 1, &rr), &query()),
            Reply::NoAnswer
        );
    }

    #[test]
    fn a_reply_that_is_not_ours_is_dropped() {
        let rr = record(16, 1, &txt(&["i=x"]));
        let good = reply_with(OK, 1, &rr);
        // The wrong id.
        let mut wrong_id = good.clone();
        wrong_id[0] ^= 0xFF;
        assert_eq!(parse_reply(&wrong_id, &query()), Reply::Invalid);
        // Not a response (QR clear).
        assert_eq!(
            parse_reply(&reply_with(0x0100, 1, &rr), &query()),
            Reply::Invalid
        );
        // A different question.
        let mut other = good.clone();
        other[HEADER_LEN + 1] ^= 0x01;
        assert_eq!(parse_reply(&other, &query()), Reply::Invalid);
        // The question's letters are matched without case, as resolvers may 0x20-randomise them.
        let mut shouted = good.clone();
        for b in &mut shouted[HEADER_LEN + 1..HEADER_LEN + 5] {
            *b = b.to_ascii_uppercase();
        }
        assert!(matches!(parse_reply(&shouted, &query()), Reply::Answer(_)));
        // Two questions.
        let mut two = good;
        two[5] = 2;
        assert_eq!(parse_reply(&two, &query()), Reply::Invalid);
    }

    // The malicious and malformed packets (T-88.1-18): each answers `None` and none panics.

    #[test]
    fn a_truncated_header_answers_none() {
        let good = reply_with(OK, 1, &record(16, 1, &txt(&["i=x"])));
        for cut in 0..HEADER_LEN {
            assert_eq!(
                parse_txt_response(&good[..cut], &query()),
                None,
                "cut {cut}"
            );
        }
        assert_eq!(parse_txt_response(&[], &query()), None);
    }

    #[test]
    fn a_packet_cut_anywhere_never_panics_and_never_answers() {
        let good = reply_with(OK, 1, &record(16, 1, &txt(&["i=Navi 21"])));
        assert!(parse_txt_response(&good, &query()).is_some());
        for cut in 0..good.len() {
            assert_eq!(
                parse_txt_response(&good[..cut], &query()),
                None,
                "cut {cut}"
            );
        }
    }

    #[test]
    fn a_name_that_runs_past_the_packet_answers_none() {
        // An answer name whose first label claims 63 bytes the packet does not hold.
        let mut rr = vec![63, b'a', b'b'];
        rr.extend_from_slice(&[0, 16, 0, 1, 0, 0, 1, 44, 0, 3, 2, b'i', b'=']);
        assert_eq!(parse_txt_response(&reply_with(OK, 1, &rr), &query()), None);
        // A reserved label type (0x40 / 0x80).
        for lead in [0x40u8, 0x80] {
            let mut rr = vec![lead, 0];
            rr.extend(record(16, 1, &txt(&["i=x"]))[2..].iter());
            assert_eq!(parse_txt_response(&reply_with(OK, 1, &rr), &query()), None);
        }
    }

    #[test]
    fn a_rdlength_past_the_end_of_the_packet_answers_none() {
        let mut rr = record(16, 1, &txt(&["i=x"]));
        let at = rr.len() - 4 - 2; // the RDLENGTH field: 2 bytes before the 4 rdata bytes
        rr[at] = 0x7F;
        rr[at + 1] = 0xFF;
        assert_eq!(parse_txt_response(&reply_with(OK, 1, &rr), &query()), None);
    }

    #[test]
    fn a_txt_string_longer_than_its_rdlength_answers_none() {
        // The string says 40 bytes, the record's data holds 4.
        let mut rdata = vec![40];
        rdata.extend_from_slice(b"abc");
        assert_eq!(
            parse_txt_response(&reply_with(OK, 1, &record(16, 1, &rdata)), &query()),
            None
        );
        // An empty TXT record has no first string at all.
        assert_eq!(
            parse_txt_response(&reply_with(OK, 1, &record(16, 1, &[])), &query()),
            None
        );
    }

    #[test]
    fn compression_pointers_that_loop_or_leave_the_message_answer_none() {
        let tail = [0, 16, 0, 1, 0, 0, 1, 44, 0, 4, 3, b'i', b'=', b'x'];
        let at = HEADER_LEN + query()[HEADER_LEN..].len(); // where the first record starts
        let pointer = |target: usize| {
            let mut rr = vec![0xC0 | (target >> 8) as u8, (target & 0xFF) as u8];
            rr.extend_from_slice(&tail);
            rr
        };
        // To itself, forward past it, into the header, and beyond the packet.
        for target in [at, at + 4, 0, 11, 0x3FFF] {
            assert_eq!(
                parse_txt_response(&reply_with(OK, 1, &pointer(target)), &query()),
                None,
                "pointer to {target}"
            );
        }
        // The legitimate shape (a pointer back to the question's name) still answers.
        assert_eq!(
            parse_txt_response(&reply_with(OK, 1, &pointer(HEADER_LEN)), &query()),
            Some("x".to_string())
        );
        // A pointer cut after its first byte.
        assert_eq!(
            parse_txt_response(&reply_with(OK, 1, &[0xC0]), &query()),
            None
        );
    }

    #[test]
    fn a_huge_answer_count_walks_only_a_few_records_and_a_giant_name_is_refused() {
        // 65535 claimed answers, none of them present.
        assert_eq!(
            parse_txt_response(&reply_with(OK, 0xFFFF, &[]), &query()),
            None
        );
        // A name of 300 bytes built of 1-byte labels.
        let mut rr: Vec<u8> = (0..150).flat_map(|_| [1u8, b'a']).collect();
        rr.push(0);
        rr.extend_from_slice(&[0, 16, 0, 1, 0, 0, 1, 44, 0, 4, 3, b'i', b'=', b'x']);
        assert_eq!(parse_txt_response(&reply_with(OK, 1, &rr), &query()), None);
    }

    #[test]
    fn resolv_conf_lists_the_nameservers_in_order() {
        let text = "# generated\nsearch lan\nnameserver 192.168.1.1\nnameserver  2001:db8::53 # v6\n;nameserver 9.9.9.9\nnameserver fe80::1%en0\nnameserver\noptions edns0\nnameserver 8.8.8.8\n";
        assert_eq!(
            parse_resolv_conf(text),
            vec![
                "192.168.1.1".parse::<IpAddr>().unwrap(),
                "2001:db8::53".parse().unwrap(),
                "8.8.8.8".parse().unwrap(),
            ]
        );
        assert!(parse_resolv_conf("").is_empty());
    }

    /// A one-shot UDP responder on loopback that answers the first query with `respond(query)`.
    async fn responder(respond: impl Fn(&[u8]) -> Vec<Vec<u8>> + Send + 'static) -> SocketAddr {
        let socket = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let addr = socket.local_addr().unwrap();
        tokio::spawn(async move {
            let mut buffer = vec![0u8; 512];
            if let Ok((len, peer)) = socket.recv_from(&mut buffer).await {
                for datagram in respond(&buffer[..len]) {
                    let _ = socket.send_to(&datagram, peer).await;
                }
            }
        });
        addr
    }

    fn reply_to(query: &[u8], flags: u16, answers: u16, records: &[u8]) -> Vec<u8> {
        let mut packet = query[..2].to_vec();
        packet.extend_from_slice(&flags.to_be_bytes());
        packet.extend_from_slice(&1u16.to_be_bytes());
        packet.extend_from_slice(&answers.to_be_bytes());
        packet.extend_from_slice(&[0; 4]);
        packet.extend_from_slice(&query[HEADER_LEN..]);
        packet.extend_from_slice(records);
        packet
    }

    #[tokio::test]
    async fn the_resolver_asks_the_server_and_reads_the_txt_answer() {
        let addr = responder(|q| {
            vec![reply_to(
                q,
                OK,
                1,
                &record(16, 1, &txt(&["i=Example Intel Graphics"])),
            )]
        })
        .await;
        let resolver = SystemTxtResolver::with_servers(Shutdown::new(), vec![addr]);
        assert_eq!(
            resolver.lookup("5678.abcd.1234.8086.pci.id.ucw.cz").await,
            Some("Example Intel Graphics".to_string())
        );
    }

    #[tokio::test]
    async fn a_missing_name_answers_at_once_without_trying_the_next_server() {
        let missing = responder(|q| vec![reply_to(q, 0x8183, 0, &[])]).await;
        // A second server that would answer: it must not be asked after an NXDOMAIN.
        let other = responder(|q| {
            vec![reply_to(
                q,
                OK,
                1,
                &record(16, 1, &txt(&["i=should not be read"])),
            )]
        })
        .await;
        let resolver = SystemTxtResolver::with_servers(Shutdown::new(), vec![missing, other]);
        let started = std::time::Instant::now();
        assert_eq!(resolver.lookup("73bf.1002.pci.id.ucw.cz").await, None);
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    #[tokio::test]
    async fn a_failing_server_hands_over_to_the_next_and_junk_datagrams_are_skipped() {
        let broken = responder(|q| vec![reply_to(q, 0x8182, 0, &[])]).await;
        let noisy = responder(|q| {
            vec![
                vec![1, 2, 3],                                                        // junk
                reply_to(&build_query(0x0001, "other.example").unwrap(), OK, 0, &[]), // not our id
                reply_to(q, OK, 1, &record(16, 1, &txt(&["i=second server"]))),
            ]
        })
        .await;
        let resolver = SystemTxtResolver::with_servers(Shutdown::new(), vec![broken, noisy]);
        assert_eq!(
            resolver.lookup("1002.pci.id.ucw.cz").await,
            Some("second server".to_string())
        );
    }

    #[tokio::test]
    async fn a_cancelled_shutdown_and_an_invalid_name_answer_none_without_a_network_call() {
        let shutdown = Shutdown::new();
        let unused: SocketAddr = "127.0.0.1:9".parse().unwrap();
        let resolver = SystemTxtResolver::with_servers(shutdown.clone(), vec![unused]);
        assert_eq!(resolver.lookup("bad name").await, None);
        shutdown.token().cancel();
        assert_eq!(resolver.lookup("1002.pci.id.ucw.cz").await, None);
    }

    #[tokio::test]
    async fn a_server_that_never_answers_is_given_up_on_within_the_bound() {
        let silent = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let addr = silent.local_addr().unwrap();
        let resolver = SystemTxtResolver::with_servers(Shutdown::new(), vec![addr]);
        let started = std::time::Instant::now();
        assert_eq!(resolver.lookup("1002.pci.id.ucw.cz").await, None);
        let took = started.elapsed();
        assert!(took >= Duration::from_millis(1_500), "{took:?}");
        assert!(took < LOOKUP_TIMEOUT, "{took:?}");
    }
}
