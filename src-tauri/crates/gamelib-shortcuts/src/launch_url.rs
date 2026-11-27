//! The `gamelib://launch` URL a shortcut opens. Ported from the three places the TypeScript builds
//! it (`shortcuts.ts`): the macOS `run.sh` and the Windows `.lnk` percent-encode `appName` and
//! `runner` with this `encodeURIComponent` port (T-34.5-C6-17); the Linux `.desktop` `Exec=` writes
//! them raw.
//!
//! This encoder stays JavaScript-exact, `'` included, because the Windows `.lnk` goldens pin it. The
//! macOS arm writes `'` as `%27` on top of it, in `mac.rs` (`run_sh_url`).
//!
//! The raw Linux form is reproduced byte for byte (the goldens pin it), including its defect: a
//! name holding a space or `&` is not encoded there. That is recorded in the 94-14 summary and in
//! `.planning/todos/pending/2026-11-28-linux-desktop-exec-writes-app-name-and-runner-unencoded.md`.

/// JavaScript `encodeURIComponent`'s unreserved set besides ASCII letters and digits.
const UNRESERVED_MARKS: &[u8] = b"-_.!~*'()";

/// The URL was not well formed: a lone UTF-16 surrogate, where JavaScript throws a `URIError`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MalformedUri;

fn push_escaped(out: &mut String, byte: u8) {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    out.push('%');
    out.push(char::from(HEX[usize::from(byte >> 4)]));
    out.push(char::from(HEX[usize::from(byte & 0x0F)]));
}

/// `encodeURIComponent` over text: UTF-8 bytes outside the unreserved set become `%XX` (upper case
/// hex). A `&str` cannot hold a lone surrogate, so this never fails; see
/// [`encode_uri_component_utf16`] for the form that can.
pub fn encode_uri_component(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for &byte in text.as_bytes() {
        if byte.is_ascii_alphanumeric() || UNRESERVED_MARKS.contains(&byte) {
            out.push(char::from(byte));
        } else {
            push_escaped(&mut out, byte);
        }
    }
    out
}

/// `encodeURIComponent` over UTF-16 code units, failing like JavaScript on a lone surrogate.
pub fn encode_uri_component_utf16(units: &[u16]) -> Result<String, MalformedUri> {
    let mut text = String::with_capacity(units.len());
    for decoded in char::decode_utf16(units.iter().copied()) {
        text.push(decoded.map_err(|_| MalformedUri)?);
    }
    Ok(encode_uri_component(&text))
}

/// `gamelib://launch?appName=<app_name>&runner=<runner>`, each value percent-encoded when `encode`.
/// macOS and Windows encode; Linux does not.
pub fn launch_url(app_name: &str, runner: &str, encode: bool) -> String {
    if encode {
        format!(
            "gamelib://launch?appName={}&runner={}",
            encode_uri_component(app_name),
            encode_uri_component(runner)
        )
    } else {
        format!("gamelib://launch?appName={app_name}&runner={runner}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use percent_encoding::percent_decode_str;

    /// Expected values for the URL itself come from the recorded goldens (`tests/golden_text.rs`);
    /// these pin the properties of the encoder that do not depend on a recorded value.
    #[test]
    fn unreserved_characters_pass_through_and_everything_else_is_escaped() {
        let all_ascii: String = (0u8..=127).map(char::from).collect();
        let encoded = encode_uri_component(&all_ascii);
        assert!(encoded.is_ascii());
        for byte in 0u8..=127 {
            let single = encode_uri_component(&char::from(byte).to_string());
            let unreserved = byte.is_ascii_alphanumeric() || UNRESERVED_MARKS.contains(&byte);
            assert_eq!(single.len() == 1, unreserved, "byte {byte:#04x}: {single}");
        }
        assert!(!encoded.contains(['$', '`', ';', '&', '|', ' ', '"', '\\', '<', '>']));
    }

    #[test]
    fn encoding_round_trips_through_a_percent_decode() {
        for text in [
            "",
            "plain",
            "a b&c=d/é",
            "😀 astral",
            "$(touch pwned)",
            "`x`;|&",
        ] {
            let encoded = encode_uri_component(text);
            let decoded = percent_decode_str(&encoded).decode_utf8().expect("utf-8");
            assert_eq!(decoded, text);
        }
    }

    #[test]
    fn a_lone_surrogate_is_malformed_and_a_pair_is_not() {
        assert_eq!(
            encode_uri_component_utf16(&[0x61, 0xD83C, 0x62]),
            Err(MalformedUri)
        );
        assert_eq!(encode_uri_component_utf16(&[0xDF6E]), Err(MalformedUri));
        let pair: Vec<u16> = "🎮".encode_utf16().collect();
        assert_eq!(
            encode_uri_component_utf16(&pair),
            Ok(encode_uri_component("🎮"))
        );
    }

    #[test]
    fn the_raw_form_encodes_nothing() {
        assert_eq!(
            launch_url("a b&c", "r'x", false),
            "gamelib://launch?appName=a b&c&runner=r'x"
        );
        assert_ne!(
            launch_url("a b&c", "r", true),
            launch_url("a b&c", "r", false)
        );
    }
}
