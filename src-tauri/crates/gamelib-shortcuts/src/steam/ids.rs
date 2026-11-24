//! The Steam ids of a non-Steam shortcut, ported from `steamhelper.ts` (which copied them from
//! steam-rom-manager's `generate-app-id.ts`). All four come from the CRC-32 of `exe + app name`, the
//! same bytes Node's `zlib.crc32` hashed, so a shortcut keeps the id (and the grid art Steam files under it)
//! it had before the port. The 94-07 `ids-*` goldens pin every value.

/// The preliminary 64-bit id: the CRC with the top bit set, shifted up 32 bits, plus `0x02000000`.
fn preliminary_id(exe: &str, app_name: &str) -> u64 {
    let mut key = String::with_capacity(exe.len() + app_name.len());
    key.push_str(exe);
    key.push_str(app_name);
    let top = u64::from(crc32fast::hash(key.as_bytes())) | 0x8000_0000;
    (top << 32) | 0x0200_0000
}

/// The id Big Picture's grid files are named by.
pub fn generate_app_id(exe: &str, app_name: &str) -> String {
    preliminary_id(exe, app_name).to_string()
}

/// The id every other grid file is named by (the high 32 bits).
pub fn generate_short_app_id(exe: &str, app_name: &str) -> String {
    (preliminary_id(exe, app_name) >> 32).to_string()
}

/// The `appid` stored in `shortcuts.vdf`: the short id as the int32 bit pattern (always negative, as the
/// top bit is set).
pub fn generate_shortcut_id(exe: &str, app_name: &str) -> i64 {
    (preliminary_id(exe, app_name) >> 32) as i64 - 0x1_0000_0000
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_empty_key_is_the_bare_flag_bit() {
        // crc32("") = 0, so the top is just the flag bit: 2147483648.
        assert_eq!(generate_short_app_id("", ""), "2147483648");
        assert_eq!(generate_shortcut_id("", ""), -2_147_483_648);
        assert_eq!(generate_app_id("", ""), "9223372036888330240");
    }

    #[test]
    fn the_key_is_the_exe_followed_by_the_name() {
        assert_eq!(
            generate_short_app_id("\"a\"", "bc"),
            generate_short_app_id("\"a\"b", "c")
        );
        assert_ne!(
            generate_short_app_id("\"a\"", "bc"),
            generate_short_app_id("\"a\"", "cb")
        );
    }

    #[test]
    fn the_three_ids_agree_with_each_other() {
        let (exe, name) = ("\"/opt/GameLibOracle/GameLib\"", "Oracle Game");
        let short: u64 = generate_short_app_id(exe, name).parse().expect("a number");
        let app: u64 = generate_app_id(exe, name).parse().expect("a number");
        assert_eq!(app, (short << 32) | 0x0200_0000);
        assert_eq!(
            generate_shortcut_id(exe, name),
            short as i64 - 0x1_0000_0000
        );
        assert!(generate_shortcut_id(exe, name) < 0);
    }
}
