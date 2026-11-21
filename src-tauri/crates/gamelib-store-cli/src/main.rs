//! Headless front end over `gamelib_store`. It reads no environment variable except, for
//! `open --dry-run` without `--scratch`, the system temp directory, and it never touches the Keychain
//! (the crate has no keyring dependency).
//!
//! `roundtrip <file> --flavour store|settings|compact`
//!     parse the file and write it back in the named flavour; print `identical` (exit 0) or
//!     `differs at byte N` (exit 1). A file that is not valid JSON exits 2 with the parse error on
//!     stderr.
//! `open <userData> [--app-folder <dir>] [--dry-run] [--scratch <dir>]`
//!     open every table row's file and every `GamesConfig/*.json` under the profile through the real
//!     engine (migrating what is outdated) and print one `<key> <outcome>` line per file that exists.
//!     `--app-folder` is where `config.json` and `GamesConfig/` live (default: `<userData>`).
//!     `--dry-run` first copies the files it would open, backups included, into a scratch directory
//!     (default: the system temp directory) and opens the copy, so the profile is never written; the
//!     scratch directory is removed afterwards. Without it the profile is migrated in place.
//! anything else: usage on stderr (exit 64)

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::exit;
use std::time::SystemTime;

use gamelib_store::backup::is_side_file;
use gamelib_store::engine::{open_file, OpenOutcome, ReadOnlyReason};
use gamelib_store::json::{parse, to_compact_bytes, to_settings_bytes, to_store_bytes};
use gamelib_store::migrate::Chains;
use gamelib_store::table::{self, TableRow};

const USAGE: &str = "usage: gamelib-store-cli roundtrip <file> --flavour store|settings|compact\n       gamelib-store-cli open <userData> [--app-folder <dir>] [--dry-run] [--scratch <dir>]";

fn usage() -> ! {
    eprintln!("{USAGE}");
    exit(64)
}

fn first_difference(a: &[u8], b: &[u8]) -> Option<usize> {
    let common = a.len().min(b.len());
    match a.iter().zip(b.iter()).position(|(x, y)| x != y) {
        Some(i) => Some(i),
        None if a.len() != b.len() => Some(common),
        None => None,
    }
}

fn roundtrip(file: &str, flavour: &str) {
    let write: fn(&gamelib_store::json::Json) -> Vec<u8> = match flavour {
        "store" => to_store_bytes,
        "settings" => to_settings_bytes,
        "compact" => to_compact_bytes,
        _ => usage(),
    };
    let bytes = match std::fs::read(file) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("cannot read {file}: {e}");
            exit(2)
        }
    };
    let value = match parse(&bytes) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("parse error: {e}");
            exit(2)
        }
    };
    match first_difference(&bytes, &write(&value)) {
        None => println!("identical"),
        Some(n) => {
            println!("differs at byte {n}");
            exit(1)
        }
    }
}

/// The files one table row stands for under the profile: `(label, path)`, only those that exist.
fn files_of(row: &TableRow, user_data: &Path, app_folder: &Path) -> Vec<(String, PathBuf)> {
    let mut out = Vec::new();
    match row.key.as_str() {
        "settings/global" => out.push((row.key.clone(), app_folder.join("config.json"))),
        "settings/game" => {
            let mut games: Vec<(String, PathBuf)> = fs::read_dir(app_folder.join("GamesConfig"))
                .into_iter()
                .flatten()
                .flatten()
                .filter_map(|e| {
                    let name = e.file_name().to_string_lossy().into_owned();
                    let stem = name.strip_suffix(".json")?.to_string();
                    (!stem.is_empty() && !is_side_file(&name))
                        .then(|| (format!("settings/game/{stem}"), e.path()))
                })
                .collect();
            games.sort();
            out.extend(games);
        }
        _ => {
            if let Some(name) = &row.name {
                out.push((
                    row.key.clone(),
                    user_data.join(&row.dir).join(format!("{name}.json")),
                ));
            }
        }
    }
    out.retain(|(_, p)| p.is_file());
    out
}

fn describe(outcome: &OpenOutcome) -> String {
    match outcome {
        OpenOutcome::Missing => "missing".to_string(),
        OpenOutcome::Ok => "ok".to_string(),
        OpenOutcome::Adopted => "adopted".to_string(),
        OpenOutcome::Migrated { from, to, .. } => format!("migrated v{from} v{to}"),
        OpenOutcome::CacheDiscarded => "cache-discarded".to_string(),
        OpenOutcome::ReadOnly {
            reason: ReadOnlyReason::Newer,
            ..
        } => "read-only newer".to_string(),
        OpenOutcome::ReadOnly {
            reason: ReadOnlyReason::Failed,
            ..
        } => "read-only failed".to_string(),
        OpenOutcome::StartEmpty { .. } => "start-empty".to_string(),
    }
}

/// Copies the regular files directly inside `from` that pass `keep` into `to` (created 0700 on Unix).
/// Symlinks are skipped, never followed.
fn copy_dir_files(from: &Path, to: &Path, keep: &dyn Fn(&str) -> bool) -> io::Result<()> {
    let Ok(rd) = fs::read_dir(from) else {
        return Ok(());
    };
    let mut made = false;
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if !keep(&name) || !e.file_type().is_ok_and(|t| t.is_file()) {
            continue;
        }
        if !made {
            make_private_dir(to)?;
            made = true;
        }
        fs::copy(e.path(), to.join(&name))?;
    }
    Ok(())
}

fn make_private_dir(path: &Path) -> io::Result<()> {
    let mut b = fs::DirBuilder::new();
    b.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        b.mode(0o700);
    }
    b.create(path)
}

fn same_dir(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(x), Ok(y)) => x == y,
        _ => a == b,
    }
}

/// The profile's openable files, copied under `scratch`; returns the copy's `(userData, appFolder)`.
fn copy_profile(
    user_data: &Path,
    app_folder: &Path,
    scratch: &Path,
) -> io::Result<(PathBuf, PathBuf)> {
    let user_copy = scratch.join("userData");
    let shared = same_dir(user_data, app_folder);
    let app_copy = if shared {
        user_copy.clone()
    } else {
        scratch.join("appFolder")
    };
    make_private_dir(&user_copy)?;
    make_private_dir(&app_copy)?;
    for row in table::table().iter().filter(|r| r.store_kind().is_some()) {
        match row.key.as_str() {
            "settings/global" => copy_dir_files(app_folder, &app_copy, &|n| {
                n.starts_with("config.") && n.ends_with(".json")
            })?,
            "settings/game" => copy_dir_files(
                &app_folder.join("GamesConfig"),
                &app_copy.join("GamesConfig"),
                &|_| true,
            )?,
            _ => copy_dir_files(
                &user_data.join(&row.dir),
                &user_copy.join(&row.dir),
                &|_| true,
            )?,
        }
    }
    Ok((user_copy, app_copy))
}

struct OpenArgs {
    user_data: PathBuf,
    app_folder: Option<PathBuf>,
    dry_run: bool,
    scratch: Option<PathBuf>,
}

fn parse_open(args: &[String]) -> Option<OpenArgs> {
    let (user_data, mut rest) = args.split_first()?;
    let mut parsed = OpenArgs {
        user_data: PathBuf::from(user_data),
        app_folder: None,
        dry_run: false,
        scratch: None,
    };
    while let Some((flag, tail)) = rest.split_first() {
        rest = tail;
        match flag.as_str() {
            "--dry-run" => parsed.dry_run = true,
            "--app-folder" | "--scratch" => {
                let (value, tail) = rest.split_first()?;
                rest = tail;
                let slot = if flag == "--app-folder" {
                    &mut parsed.app_folder
                } else {
                    &mut parsed.scratch
                };
                *slot = Some(PathBuf::from(value));
            }
            _ => return None,
        }
    }
    Some(parsed)
}

fn open_profile(args: OpenArgs) {
    let app_folder = args
        .app_folder
        .clone()
        .unwrap_or_else(|| args.user_data.clone());
    if !args.user_data.is_dir() || !app_folder.is_dir() {
        eprintln!("not a directory: {}", args.user_data.display());
        exit(2)
    }
    let scratch = args.dry_run.then(|| {
        let base = args.scratch.clone().unwrap_or_else(std::env::temp_dir);
        let nanos = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos());
        base.join(format!("gamelib-store-cli-{}-{nanos}", std::process::id()))
    });
    let (user_data, app_folder) = match &scratch {
        Some(dir) => copy_profile(&args.user_data, &app_folder, dir).unwrap_or_else(|e| {
            eprintln!("cannot copy the profile: {e}");
            exit(2)
        }),
        None => (args.user_data.clone(), app_folder),
    };
    let chains = Chains::baseline();
    let now = SystemTime::now();
    for row in table::table() {
        let Some(kind) = row.store_kind() else {
            continue;
        };
        for (label, path) in files_of(row, &user_data, &app_folder) {
            let opened = open_file(&path, row.flavour, kind, row.chain_key(), &chains, now);
            println!("{label} {}", describe(&opened.outcome));
        }
    }
    if let Some(dir) = scratch {
        // Only the directory this run created.
        let _ = fs::remove_dir_all(dir);
    }
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    match argv.as_slice() {
        [cmd, file, flag, flavour] if cmd == "roundtrip" && flag == "--flavour" => {
            roundtrip(file, flavour)
        }
        [cmd, rest @ ..] if cmd == "open" => match parse_open(rest) {
            Some(args) => open_profile(args),
            None => usage(),
        },
        _ => usage(),
    }
}
