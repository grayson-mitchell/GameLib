//! The macOS shortcut icon (94-14, D-13, D-25): `png_to_icns` decodes a PNG or a JPEG, resizes to
//! width 512 keeping the aspect, crops 512x512 from the centre and writes an `.icns` holding one raw
//! `ic11` element; `write_mac_app` falls back to the iconless bundle when the icon is missing or
//! undecodable.
//!
//! Two kinds of check:
//!
//! - Synthetic inputs (tall, wide, square, small, a JPEG, garbage), run on every host. Their
//!   expected colours are computed from the documented centred geometry (the band the source pixel
//!   under each output sample belongs to), never typed; samples within a few pixels of a band edge
//!   are skipped because a resampler blends there.
//! - The four `icon_geometry` goldens (94-07), recorded from the shipped `sips` chain on a Mac.
//!   They do not exist yet: the replay is `#[ignore]`d with the reason and the todo that records
//!   them, and `icon_geometry_goldens_are_replayed_once_recorded` fails as soon as the goldens
//!   appear while the replay is still ignored, so this cannot rot into a silent pass.

use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use gamelib_shortcuts::ctx::ShortcutPaths;
use gamelib_shortcuts::icns::{icns_bytes, png_to_icns};
use gamelib_shortcuts::mac::write_mac_app;
use gamelib_testutil::FakeHome;
use icns::{IconFamily, OSType};
use image::{ImageFormat, Rgb, RgbImage, RgbaImage};
use serde_json::Value;

type Colour = [u8; 3];

const RED: Colour = [220, 30, 30];
const GREEN: Colour = [30, 200, 30];
const BLUE: Colour = [30, 30, 220];

/// A synthetic input, shaped like the oracle's: bands across the whole image, no gradient.
#[derive(Clone)]
struct Banded {
    width: u32,
    height: u32,
    /// `horizontal`: bands stack top to bottom. Otherwise they run left to right.
    horizontal: bool,
    bands: Vec<Colour>,
}

impl Banded {
    /// The band a source pixel is in (the oracle's `bandedPng` rule).
    fn colour_at(&self, x: u32, y: u32) -> Colour {
        let along = if self.horizontal {
            f64::from(y) / f64::from(self.height)
        } else {
            f64::from(x) / f64::from(self.width)
        };
        let index = ((along * self.bands.len() as f64).floor() as usize).min(self.bands.len() - 1);
        self.bands[index]
    }

    fn image(&self) -> RgbImage {
        RgbImage::from_fn(self.width, self.height, |x, y| Rgb(self.colour_at(x, y)))
    }

    fn png(&self) -> Vec<u8> {
        encode(&self.image(), ImageFormat::Png)
    }
}

fn encode(image: &RgbImage, format: ImageFormat) -> Vec<u8> {
    let mut out = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut out), format)
        .expect("encode");
    out
}

/// The oracle's sample points: fractions of the output size along the two centre lines.
fn sample_points(width: u32, height: u32) -> Vec<(u32, u32)> {
    const FRACTIONS: [f64; 5] = [0.03, 0.12, 0.5, 0.88, 0.97];
    let at = |fraction: f64, size: u32| ((fraction * f64::from(size)).floor() as u32).min(size - 1);
    let mut points: Vec<(u32, u32)> = FRACTIONS
        .iter()
        .map(|&f| (at(0.5, width), at(f, height)))
        .collect();
    points.extend(FRACTIONS.iter().map(|&f| (at(f, width), at(0.5, height))));
    points
}

/// What the file at `icns_path` holds: exactly one element, `ic11`, whose data is a PNG.
fn read_icns(icns_path: &Path) -> RgbaImage {
    let family = IconFamily::read(fs::File::open(icns_path).expect("the icns exists"))
        .expect("the icns decodes with IconFamily::read");
    assert_eq!(family.elements.len(), 1, "exactly one element");
    let element = &family.elements[0];
    assert_eq!(element.ostype, OSType(*b"ic11"), "the raw ic11 element");
    assert_eq!(
        &element.data[..8],
        &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A],
        "the element is a raw PNG"
    );
    image::load_from_memory_with_format(&element.data, ImageFormat::Png)
        .expect("the element's PNG decodes")
        .to_rgba8()
}

/// Converts `source` through `png_to_icns` in a fresh profile and returns the decoded icon.
fn convert(source: &[u8]) -> RgbaImage {
    let home = FakeHome::new("gamelib-icns-");
    let icon = home.root().join("icon.jpg");
    let dest = home.root().join("shortcut.icns");
    fs::write(&icon, source).expect("write the icon");
    png_to_icns(&icon, &dest).expect("the conversion succeeds");
    read_icns(&dest)
}

/// The output size the documented geometry gives: width 512, height scaled with the aspect (the
/// image is not padded), clamped to 512 by the centred crop.
fn expected_size(case: &Banded) -> (u32, u32, u32) {
    if case.width == 512 {
        return (
            512,
            case.height.min(512),
            case.height.saturating_sub(512) / 2,
        );
    }
    let resized = (f64::from(case.height) * 512.0 / f64::from(case.width)).round() as u32;
    (512, resized.min(512), resized.saturating_sub(512) / 2)
}

/// Checks every sample whose colour the centred geometry determines (not within 6 output pixels of
/// a band edge) against the band the model names. Returns how many samples were checked.
fn check_bands(case: &Banded, icon: &RgbaImage) -> usize {
    let (width, height, top) = expected_size(case);
    assert_eq!(
        (icon.width(), icon.height()),
        (width, height),
        "output size"
    );
    let resized_height = if case.width == 512 {
        case.height
    } else {
        (f64::from(case.height) * 512.0 / f64::from(case.width)).round() as u32
    };
    let n = case.bands.len();
    let mut checked = 0;
    for (x, y) in sample_points(width, height) {
        // The position along the banded axis, in resized pixels, and the length of that axis.
        let (position, length) = if case.horizontal {
            (f64::from(y + top) + 0.5, f64::from(resized_height))
        } else {
            (f64::from(x) + 0.5, 512.0)
        };
        let near_edge = (1..n).any(|k| (position - length * k as f64 / n as f64).abs() < 6.0);
        if near_edge {
            continue;
        }
        let band = ((position / length * n as f64).floor() as usize).min(n - 1);
        let want = case.bands[band];
        let got = icon.get_pixel(x, y).0;
        assert_eq!(
            [got[0], got[1], got[2], got[3]],
            [want[0], want[1], want[2], 255],
            "sample ({x}, {y}) of a {}x{} input",
            case.width,
            case.height
        );
        checked += 1;
    }
    checked
}

fn tall() -> Banded {
    Banded {
        width: 600,
        height: 900,
        horizontal: true,
        bands: vec![RED, GREEN, BLUE],
    }
}

fn wide() -> Banded {
    Banded {
        width: 900,
        height: 400,
        horizontal: false,
        bands: vec![RED, GREEN, BLUE],
    }
}

fn square() -> Banded {
    Banded {
        width: 512,
        height: 512,
        horizontal: true,
        bands: vec![RED, GREEN, BLUE],
    }
}

fn small() -> Banded {
    Banded {
        width: 100,
        height: 300,
        horizontal: true,
        bands: vec![RED, GREEN, BLUE],
    }
}

#[test]
fn a_tall_icon_is_resized_to_512_wide_and_cropped_from_the_centre() {
    let icon = convert(&tall().png());
    assert_eq!((icon.width(), icon.height()), (512, 512));
    // Three bands in the middle 512 of 768 rows: the crop loses the top and bottom equally, so the
    // top sample is still red and the bottom blue, and the centre is the green band.
    assert!(check_bands(&tall(), &icon) >= 4);
}

#[test]
fn a_wide_icon_keeps_its_aspect_and_is_not_padded() {
    let icon = convert(&wide().png());
    let (width, height, _) = expected_size(&wide());
    assert_eq!((icon.width(), icon.height()), (width, height));
    assert!(
        icon.height() < 512,
        "a wide icon is shorter than 512 after the resize"
    );
    assert!(check_bands(&wide(), &icon) >= 4);
}

#[test]
fn a_512_square_icon_passes_through_unchanged() {
    let source = square();
    let icon = convert(&source.png());
    assert_eq!((icon.width(), icon.height()), (512, 512));
    for (x, y, pixel) in icon.enumerate_pixels() {
        let want = source.colour_at(x, y);
        assert_eq!(
            pixel.0,
            [want[0], want[1], want[2], 255],
            "pixel ({x}, {y})"
        );
    }
}

#[test]
fn a_small_icon_is_scaled_up_to_fill_the_square() {
    let icon = convert(&small().png());
    assert_eq!((icon.width(), icon.height()), (512, 512));
    assert!(check_bands(&small(), &icon) >= 4);
}

#[test]
fn a_jpeg_input_works_like_a_png_input() {
    let case = tall();
    let jpeg = encode(&case.image(), ImageFormat::Jpeg);
    assert_eq!(&jpeg[..2], &[0xFF, 0xD8], "the input is a JPEG");
    let icon = convert(&jpeg);
    assert_eq!((icon.width(), icon.height()), (512, 512));
    // JPEG is lossy: compare the centre of each band with a tolerance, not the exact colour.
    let (_, _, top) = expected_size(&case);
    // The resized image is 512 wide and 768 tall; band `k` spans resized rows 256k..256(k+1), of
    // which the crop keeps rows `top..top + 512`. Sample the middle of each band's visible part.
    let band_rows = 768 / case.bands.len() as u32;
    for (band, want) in case.bands.iter().enumerate() {
        let band_top = band as u32 * band_rows;
        let low = band_top.max(top);
        let high = (band_top + band_rows).min(top + 512);
        let row = (low + high) / 2 - top;
        let got = icon.get_pixel(256, row).0;
        for channel in 0..3 {
            let off = (i16::from(got[channel]) - i16::from(want[channel])).abs();
            assert!(
                off <= 16,
                "band {band} channel {channel}: {got:?} vs {want:?}"
            );
        }
    }
}

#[test]
fn the_icns_is_one_raw_ic11_element_in_a_well_formed_container() {
    let bytes = icns_bytes(tall().png()).expect("container");
    assert_eq!(&bytes[..4], b"icns");
    let declared = u32::from_be_bytes(bytes[4..8].try_into().expect("length"));
    assert_eq!(
        declared as usize,
        bytes.len(),
        "the declared length is the file length"
    );
    assert_eq!(&bytes[8..12], b"ic11", "the first element's type");
    let element = u32::from_be_bytes(bytes[12..16].try_into().expect("element length"));
    assert_eq!(
        element as usize,
        bytes.len() - 8,
        "one element fills the container"
    );
}

#[test]
fn undecodable_icons_are_errors_and_write_nothing() {
    let home = FakeHome::new("gamelib-icns-");
    let dest = home.root().join("shortcut.icns");
    let png = tall().png();
    let cases: [(&str, Vec<u8>); 5] = [
        ("empty file", Vec::new()),
        ("text", b"not an image at all".to_vec()),
        ("truncated PNG", png[..png.len() / 2].to_vec()),
        (
            "GIF header",
            b"GIF89a\x01\x00\x01\x00\x00\x00\x00;".to_vec(),
        ),
        ("PNG signature only", png[..8].to_vec()),
    ];
    for (what, bytes) in cases {
        let icon = home.root().join("icon.bin");
        fs::write(&icon, bytes).expect("write");
        assert!(png_to_icns(&icon, &dest).is_err(), "{what}");
        assert!(!dest.exists(), "{what}: nothing is written");
    }
    assert!(
        png_to_icns(&home.root().join("missing.jpg"), &dest).is_err(),
        "missing file"
    );
    assert!(!dest.exists());
}

#[test]
fn an_icon_far_taller_than_wide_is_refused_not_built() {
    let home = FakeHome::new("gamelib-icns-");
    let icon = home.root().join("sliver.png");
    let sliver = Banded {
        width: 1,
        height: 3000,
        horizontal: true,
        bands: vec![RED, GREEN],
    };
    fs::write(&icon, sliver.png()).expect("write");
    let dest = home.root().join("shortcut.icns");
    assert!(png_to_icns(&icon, &dest).is_err());
    assert!(!dest.exists());
}

// ------------------------------------------------------------------ write_mac_app's icon arm

struct Profile {
    home: FakeHome,
    paths: ShortcutPaths,
}

impl Profile {
    fn new() -> Profile {
        let home = FakeHome::new("gamelib-icns-app-");
        let root = home.root().to_path_buf();
        let paths = ShortcutPaths {
            user_home: root.clone(),
            app_data: None,
            desktop_dir: None,
            icon_folder: root.join("icons"),
            shell_exe: root.join("shell-exe"),
            cwd: root.clone(),
        };
        Profile { home, paths }
    }

    fn write(&self, icon: Option<&Path>) -> gamelib_shortcuts::mac::MacAppWritten {
        write_mac_app(
            &self.paths,
            "Icon Game",
            "icongame",
            "legendary",
            &self.paths.shell_exe,
            icon,
        )
        .expect("the bundle is written")
    }

    fn plist(&self) -> String {
        fs::read_to_string(
            self.home
                .root()
                .join("Applications")
                .join("Icon Game.app")
                .join("Contents")
                .join("Info.plist"),
        )
        .expect("Info.plist")
    }
}

fn resources(profile: &Profile) -> PathBuf {
    profile
        .home
        .root()
        .join("Applications")
        .join("Icon Game.app")
        .join("Contents")
        .join("Resources")
}

#[test]
fn a_decodable_icon_gives_an_icns_and_the_icon_key_pair() {
    let profile = Profile::new();
    let icon = profile.home.root().join("cover.jpg");
    fs::write(&icon, tall().png()).expect("icon");
    let written = profile.write(Some(&icon));
    assert!(written.icon);
    assert!(profile.plist().contains("<key>CFBundleIconFile</key>"));
    let icns = read_icns(&resources(&profile).join("shortcut.icns"));
    assert_eq!((icns.width(), icns.height()), (512, 512));
}

#[test]
fn an_undecodable_icon_falls_back_to_the_iconless_bundle() {
    let profile = Profile::new();
    let icon = profile.home.root().join("cover.jpg");
    fs::write(&icon, b"<html>an error page, not an image</html>").expect("icon");
    let written = profile.write(Some(&icon));
    assert!(!written.icon);
    assert!(!profile.plist().contains("CFBundleIconFile"));
    assert!(!resources(&profile).join("shortcut.icns").exists());
    let run_sh = profile
        .home
        .root()
        .join("Applications")
        .join("Icon Game.app")
        .join("Contents")
        .join("MacOS")
        .join("run.sh");
    assert!(run_sh.is_file(), "the .app is still written");
}

#[test]
fn no_icon_and_a_missing_icon_file_both_give_the_iconless_bundle() {
    let none = Profile::new();
    assert!(!none.write(None).icon);
    assert!(!none.plist().contains("CFBundleIconFile"));
    let missing = Profile::new();
    let absent = missing.home.root().join("absent.jpg");
    assert!(!missing.write(Some(&absent)).icon);
    assert!(!missing.plist().contains("CFBundleIconFile"));
    assert_eq!(none.plist(), missing.plist());
}

// ------------------------------------------------------------------ the icon_geometry goldens

fn geometry_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("golden")
        .join("icon_geometry")
}

/// The cases the 94-07 oracle records: tall, wide, square and small.
const GEOMETRY_FLOOR: usize = 4;

fn geometry_cases() -> Vec<(String, Value)> {
    let mut cases = Vec::new();
    for entry in fs::read_dir(geometry_dir()).expect("the icon_geometry directory") {
        let path = entry.expect("an entry").path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();
        if name.ends_with(".json") && name != "MANIFEST.json" {
            let text = fs::read_to_string(&path).expect("a golden");
            let value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name}: {e}"));
            cases.push((name.trim_end_matches(".json").to_string(), value));
        }
    }
    cases
}

/// Replays every recorded case: the same banded input through `png_to_icns`, then the recorded
/// size and the recorded colour at every recorded sample point (alpha included). Returns the
/// disagreements.
fn replay_geometry(cases: &[(String, Value)]) -> Vec<String> {
    let mut failures = Vec::new();
    for (id, case) in cases {
        let input = &case["input"];
        let bands: Vec<Colour> = input["bands"]
            .as_array()
            .expect("bands")
            .iter()
            .map(|b| {
                let c = |i: usize| b[i].as_u64().expect("a channel") as u8;
                [c(0), c(1), c(2)]
            })
            .collect();
        let source = Banded {
            width: input["width"].as_u64().expect("width") as u32,
            height: input["height"].as_u64().expect("height") as u32,
            horizontal: input["orientation"].as_str() == Some("horizontal"),
            bands,
        };
        let home = FakeHome::new("gamelib-icns-geometry-");
        let icon = home.root().join("input.png");
        let dest = home.root().join("shortcut.icns");
        fs::write(&icon, source.png()).expect("write the input");
        let converted = png_to_icns(&icon, &dest);
        let output = &case["output"];
        if output["threw"].as_bool() == Some(true) {
            // The TS chain threw, so `convertPngToICNS` returned false and the bundle is iconless.
            if converted.is_ok() {
                failures.push(format!(
                    "{id}: the recorded chain threw, the port converted"
                ));
            }
            continue;
        }
        if let Err(e) = converted {
            failures.push(format!(
                "{id}: the port failed ({e}); the recorded chain converted"
            ));
            continue;
        }
        let got = read_icns(&dest);
        let want_size = (
            output["width"].as_u64().expect("width") as u32,
            output["height"].as_u64().expect("height") as u32,
        );
        if (got.width(), got.height()) != want_size {
            failures.push(format!(
                "{id}: size {}x{}, golden {want_size:?}",
                got.width(),
                got.height()
            ));
            continue;
        }
        for sample in output["samples"].as_array().expect("samples") {
            let (x, y) = (
                sample["x"].as_u64().expect("x") as u32,
                sample["y"].as_u64().expect("y") as u32,
            );
            let want: Vec<u8> = sample["rgba"]
                .as_array()
                .expect("rgba")
                .iter()
                .map(|c| c.as_u64().expect("a channel") as u8)
                .collect();
            let pixel = got.get_pixel(x, y).0;
            if pixel.as_slice() != want.as_slice() {
                failures.push(format!("{id}: ({x}, {y}) is {pixel:?}, golden {want:?}"));
            }
        }
    }
    failures
}

/// PENDING: the four `icon_geometry` goldens need a Mac (`/usr/bin/sips`); see the todo. Un-ignore
/// this test once they are committed (the guard below fails until you do).
#[test]
#[ignore = "pending: 94-07 macOS icon_geometry goldens (todo 2026-11-24-record-macos-icon-geometry-goldens-on-a-mac)"]
fn icon_geometry_goldens_replay() {
    let cases = geometry_cases();
    assert!(
        cases.len() >= GEOMETRY_FLOOR,
        "icon_geometry holds {} goldens, the floor is {GEOMETRY_FLOOR}",
        cases.len()
    );
    let failures = replay_geometry(&cases);
    assert!(
        failures.is_empty(),
        "icon_geometry mismatches:\n{}",
        failures.join("\n")
    );
    println!("icon_geometry replayed: {} cases", cases.len());
}

/// Absent goldens are loudly pending, never a quiet pass; present goldens must be replayed, so the
/// ignore must be gone and the directory complete.
#[test]
fn icon_geometry_goldens_are_replayed_once_recorded() {
    if !geometry_dir().exists() {
        eprintln!(
            "PENDING: golden/icon_geometry is not recorded yet (94-07 needs a Mac with /usr/bin/sips); \
             the .icns geometry replay is ignored. See .planning/todos/pending/2026-11-24-record-macos-icon-geometry-goldens-on-a-mac.md"
        );
        return;
    }
    let cases = geometry_cases();
    assert!(
        cases.len() >= GEOMETRY_FLOOR,
        "golden/icon_geometry exists with {} cases; it needs at least {GEOMETRY_FLOOR}",
        cases.len()
    );
    // The marker is assembled so this test's own source does not contain it.
    let marker = ["#[ignore = \"pending", ": 94-07"].concat();
    assert!(
        !include_str!("icns.rs").contains(&marker),
        "golden/icon_geometry is recorded: remove the #[ignore] on icon_geometry_goldens_replay and run it"
    );
    let failures = replay_geometry(&cases);
    assert!(
        failures.is_empty(),
        "icon_geometry mismatches:\n{}",
        failures.join("\n")
    );
}

#[test]
fn the_replay_itself_discriminates() {
    // The replay machinery runs now against a golden built from the port's own output, with one
    // sample altered: it must name the altered sample, and pass the unaltered one.
    let source = square();
    let icon = convert(&source.png());
    let sample =
        |x: u32, y: u32, rgba: [u8; 4]| serde_json::json!({ "x": x, "y": y, "rgba": rgba });
    let pixel = icon.get_pixel(256, 256).0;
    let golden = |rgba: [u8; 4]| {
        serde_json::json!({
            "input": { "width": 512, "height": 512, "orientation": "horizontal", "bands": [RED, GREEN, BLUE] },
            "output": { "width": 512, "height": 512, "samples": [sample(256, 256, rgba)] }
        })
    };
    assert!(replay_geometry(&[("same".to_string(), golden(pixel))]).is_empty());
    let mut off = pixel;
    off[1] = off[1].wrapping_add(7);
    let failures = replay_geometry(&[("altered".to_string(), golden(off))]);
    assert_eq!(failures.len(), 1, "{failures:?}");
    assert!(failures[0].starts_with("altered: (256, 256)"));
    let threw = serde_json::json!({
        "input": { "width": 512, "height": 512, "orientation": "horizontal", "bands": [RED, GREEN, BLUE] },
        "output": { "threw": true, "message": "x" }
    });
    assert_eq!(replay_geometry(&[("threw".to_string(), threw)]).len(), 1);
}
