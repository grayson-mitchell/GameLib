//! The Steam grid art of a non-Steam shortcut, ported from `steamhelper.ts` (`prepareImagesForSteam` and
//! `removeImagesFromSteam`). Steam looks a shortcut's art up in `<userdata>/<user>/config/grid/` by the ids in
//! [`super::ids`]:
//!
//! | file                      | from                                                                 |
//! | ------------------------- | -------------------------------------------------------------------- |
//! | `<short>p.jpg` (cover)    | the Steam CDN's `library_600x900_2x.jpg`, else the game's `art_square` |
//! | `<short>.jpg` (header)    | the CDN's `header.jpg`, else the game's `art_cover`                   |
//! | `<short>_hero.jpg`        | the CDN's `library_hero.jpg`; with no Steam id there is none          |
//! | `<short>_logo.jpg`        | the CDN's `logo.png`, else the game's `art_logo`, else a 1x1 transparent PNG |
//!
//! A file already there, as a `.png` or a `.jpg`, is left alone and not requested again. A URL starting `http`
//! is downloaded (atomically, through the crate's `Http`, holding a `shortcuts-steam-art` shutdown
//! registrant); anything else is taken for an image data URL and re-encoded as a JPEG at quality 90, as the TS
//! did with Electron's `nativeImage`. One file failing is a fixed-text log line and the rest go on.
//!
//! Removal deletes only the five file names the ids of the removed entry give (the four above and the Big
//! Picture `<big>.jpg`), under that user's `grid` folder, through `gamelib-safety` with the grid folder as its
//! trust root (T-94-37). It looks for a `.png` or a `.jpg` of each name but deletes only the `.jpg` the name
//! gives, as the TS did, so a `.png` of the same stem stays.

use std::io::Cursor;
use std::path::{Path, PathBuf};

use gamelib_safety::remove::remove_tree;
use gamelib_safety::safe_path::CaseMode;
use gamelib_safety::wire::{Outcome, Request, Target, TargetKind};
use image::codecs::jpeg::JpegEncoder;
use image::{ImageReader, Limits};

use super::ids::{generate_app_id, generate_short_app_id};
use crate::ctx::ShortcutsCtx;
use crate::game::ShortcutGame;
use crate::icons::download_to;

/// Where a game's Steam art comes from when its Steam id is known.
const STEAM_CDN: &str = "https://cdn.cloudflare.steamstatic.com/steam/apps";

/// A 1x1 transparent PNG: the logo of a game with none, which keeps Steam from drawing the title over its art.
const TRANSPARENT_LOGO_HEX: &str = "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b494441541895636000020000050001d69f16cd0000000049454e44ae426082";

/// The decoded size a data URL image may have: a cover is a few hundred KiB.
const MAX_DATA_URL_BYTES: usize = 32 * 1024 * 1024;
const MAX_DECODED_SIDE: u32 = 16_384;
const MAX_ALLOC_BYTES: u64 = 256 * 1024 * 1024;

/// The ids a shortcut's art is filed under.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtIds {
    /// Big Picture's grid id (`<big>.jpg`).
    pub big_picture: String,
    /// The id every other grid file is named by.
    pub other_grid: String,
}

impl ArtIds {
    /// The ids of the entry whose `Exe` and `AppName` are given.
    pub fn of(exe: &str, app_name: &str) -> ArtIds {
        ArtIds {
            big_picture: generate_app_id(exe, app_name),
            other_grid: generate_short_app_id(exe, app_name),
        }
    }
}

struct Grid {
    cover: PathBuf,
    header: PathBuf,
    background: PathBuf,
    big_picture: PathBuf,
    logo: PathBuf,
}

fn grid_files(grid: &Path, ids: &ArtIds) -> Grid {
    let short = &ids.other_grid;
    Grid {
        cover: grid.join(format!("{short}p.jpg")),
        header: grid.join(format!("{short}.jpg")),
        background: grid.join(format!("{short}_hero.jpg")),
        big_picture: grid.join(format!("{}.jpg", ids.big_picture)),
        logo: grid.join(format!("{short}_logo.jpg")),
    }
}

/// Whether `file` is already there as a `.png` or a `.jpg` (the TS `checkImageExistsAlready`).
fn exists_already(file: &Path) -> bool {
    let (Some(dir), Some(stem)) = (file.parent(), file.file_stem().and_then(|s| s.to_str())) else {
        return false;
    };
    ["png", "jpg"]
        .iter()
        .any(|ext| dir.join(format!("{stem}.{ext}")).exists())
}

fn transparent_logo() -> Vec<u8> {
    TRANSPARENT_LOGO_HEX
        .as_bytes()
        .chunks(2)
        .filter_map(|pair| {
            let text = std::str::from_utf8(pair).ok()?;
            u8::from_str_radix(text, 16).ok()
        })
        .collect()
}

/// Puts the grid art of a new shortcut in `<config_dir>/grid`. `steam_id` is the game's Steam app id when the
/// wiki knew one (never empty).
pub async fn prepare_images(
    ctx: &ShortcutsCtx,
    config_dir: &Path,
    ids: &ArtIds,
    game: &ShortcutGame,
    steam_id: Option<&str>,
) {
    let grid = config_dir.join("grid");
    if !grid.exists() && std::fs::create_dir(&grid).is_err() && !grid.is_dir() {
        ctx.note("shortcuts steam: the grid folder could not be created");
        return;
    }
    let files = grid_files(&grid, ids);
    let own = |art: &Option<String>| art.clone().unwrap_or_default();
    let cdn = |name: &str| steam_id.map(|id| format!("{STEAM_CDN}/{id}/{name}"));

    let mut images: Vec<(PathBuf, String)> = vec![
        (
            files.cover,
            cdn("library_600x900_2x.jpg").unwrap_or_else(|| own(&game.art_square)),
        ),
        (
            files.header,
            cdn("header.jpg").unwrap_or_else(|| own(&game.art_cover)),
        ),
        // The background used to be rendered in the main window; a game with no Steam id gets none.
        (
            files.background,
            cdn("library_hero.jpg").unwrap_or_default(),
        ),
    ];
    let mut failures = 0usize;
    if let Some(url) = cdn("logo.png") {
        images.push((files.logo, url));
    } else if let Some(logo) = game.art_logo.as_deref().filter(|logo| !logo.is_empty()) {
        images.push((files.logo, logo.to_string()));
    } else if std::fs::write(&files.logo, transparent_logo()).is_err() {
        failures += 1;
    }

    let token = ctx.shutdown.token();
    for (file, url) in images {
        if token.is_cancelled() {
            break;
        }
        if exists_already(&file) || url.is_empty() {
            continue;
        }
        let done = if url.starts_with("http") {
            download_to(ctx, &url, &file, "shortcuts-steam-art").await
        } else {
            write_data_url_jpeg(&url, &file)
        };
        if !done {
            failures += 1;
        }
    }
    if failures > 0 {
        ctx.note("shortcuts steam: some grid art could not be prepared");
    }
}

/// Decodes an image data URL and writes it as a JPEG at quality 90 (Electron's `toJPEG(90)`). `false` when it
/// is not a base64 image data URL, does not decode, or cannot be written.
fn write_data_url_jpeg(url: &str, file: &Path) -> bool {
    let Some(jpeg) = data_url_to_jpeg(url) else {
        return false;
    };
    std::fs::write(file, jpeg).is_ok()
}

fn data_url_to_jpeg(url: &str) -> Option<Vec<u8>> {
    let (meta, payload) = url.strip_prefix("data:")?.split_once(',')?;
    if !meta.to_ascii_lowercase().ends_with(";base64") {
        return None;
    }
    let bytes = base64_decode(payload)?;
    let mut limits = Limits::no_limits();
    limits.max_image_width = Some(MAX_DECODED_SIDE);
    limits.max_image_height = Some(MAX_DECODED_SIDE);
    limits.max_alloc = Some(MAX_ALLOC_BYTES);
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?;
    reader.limits(limits);
    // A JPEG has no alpha channel: composite nothing, drop it.
    let decoded = reader.decode().ok()?.to_rgb8();
    let mut out = Vec::new();
    JpegEncoder::new_with_quality(&mut out, 90)
        .encode_image(&decoded)
        .ok()?;
    Some(out)
}

/// Standard base64 with optional padding; ASCII whitespace is skipped. `None` for any other byte, a stray
/// padding, or a result over [`MAX_DATA_URL_BYTES`].
fn base64_decode(text: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(text.len() / 4 * 3);
    let (mut acc, mut bits, mut padding) = (0u32, 0u32, 0usize);
    for byte in text.bytes() {
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' => {
                padding += 1;
                continue;
            }
            b' ' | b'\n' | b'\r' | b'\t' => continue,
            _ => return None,
        };
        if padding > 0 {
            return None;
        }
        acc = (acc << 6) | u32::from(value);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
            if out.len() > MAX_DATA_URL_BYTES {
                return None;
            }
        }
    }
    (padding <= 2).then_some(out)
}

/// Removes the grid art of a shortcut that was just taken out of `shortcuts.vdf`: the five names `exe` and
/// `app_name` (the removed entry's own) give.
pub fn remove_images(ctx: &ShortcutsCtx, config_dir: &Path, exe: &str, app_name: &str) {
    let grid = config_dir.join("grid");
    if !grid.exists() {
        return;
    }
    let files = grid_files(&grid, &ArtIds::of(exe, app_name));
    let mut failures = 0usize;
    for file in [
        &files.cover,
        &files.header,
        &files.background,
        &files.big_picture,
        &files.logo,
    ] {
        if exists_already(file) && file.exists() && !delete_art(file, &grid) {
            failures += 1;
        }
    }
    if failures > 0 {
        ctx.note("shortcuts steam: some grid art could not be removed");
    }
}

/// Deletes one grid file through the safety library, the grid folder being the trust root.
fn delete_art(file: &Path, grid: &Path) -> bool {
    let (Some(path), Some(root)) = (file.to_str(), grid.to_str()) else {
        return false;
    };
    let request = Request {
        targets: vec![Target {
            id: "steam-grid-art".to_string(),
            path: path.to_string(),
            kind: TargetKind::AppData,
            trust_root: Some(root.to_string()),
            executable: None,
        }],
        known_installs: Some(Vec::new()),
        self_key: None,
        protected_roots: Vec::new(),
    };
    remove_tree(&request, CaseMode::Auto).outcome == Outcome::Removed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_transparent_logo_is_the_68_byte_png() {
        let png = transparent_logo();
        assert_eq!(png.len(), 68);
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    }

    #[test]
    fn base64_decodes_with_and_without_padding_and_refuses_junk() {
        assert_eq!(base64_decode("aGk="), Some(b"hi".to_vec()));
        assert_eq!(base64_decode("aGk"), Some(b"hi".to_vec()));
        assert_eq!(base64_decode("aGVs\nbG8="), Some(b"hello".to_vec()));
        assert_eq!(base64_decode("a*k="), None);
        assert_eq!(base64_decode("aG=k"), None);
        assert_eq!(base64_decode("aGk==="), None);
        assert_eq!(base64_decode(""), Some(Vec::new()));
    }

    #[test]
    fn a_png_data_url_becomes_a_jpeg_and_anything_else_is_refused() {
        let hex = TRANSPARENT_LOGO_HEX;
        let png: Vec<u8> = (0..hex.len() / 2)
            .map(|i| u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).expect("hex"))
            .collect();
        let b64 = {
            const TABLE: &[u8] =
                b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            let mut out = String::new();
            for chunk in png.chunks(3) {
                let n = chunk
                    .iter()
                    .enumerate()
                    .fold(0u32, |acc, (i, b)| acc | (u32::from(*b) << (16 - 8 * i)));
                for i in 0..4 {
                    if i <= chunk.len() {
                        out.push(TABLE[((n >> (18 - 6 * i)) & 63) as usize] as char);
                    } else {
                        out.push('=');
                    }
                }
            }
            out
        };
        let jpeg = data_url_to_jpeg(&format!("data:image/png;base64,{b64}")).expect("a jpeg");
        assert_eq!(&jpeg[..3], [0xff, 0xd8, 0xff], "a JPEG starts with SOI");
        // Truncated image data, a non-base64 URL and a plain path are no image.
        assert!(data_url_to_jpeg("data:image/png;base64,iVBORw0KGgo=").is_none());
        assert!(data_url_to_jpeg("data:image/png,abc").is_none());
        assert!(data_url_to_jpeg("/some/local/art.png").is_none());
    }

    #[test]
    fn a_png_or_a_jpg_of_the_same_stem_counts_as_present() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let want = dir.path().join("123p.jpg");
        assert!(!exists_already(&want));
        std::fs::write(dir.path().join("123p.png"), "x").expect("write");
        assert!(exists_already(&want));
    }
}
