//! The icon of a Windows `.lnk` (D-12), ported from `resolveWindowsShortcutIcon` in
//! `backend/shortcuts/shortcuts/windowsShortcutIcon.ts`.
//!
//! Source chain, first hit wins:
//!   1. the store's own executable, when it exists on disk;
//!   2. the game's exe, found by a bounded local scan of the install directory;
//!   3. the GameLib shell exe.
//!
//! Only an existing `.exe`, `.ico` or `.dll` is ever returned: an `IconLocation` extracts an icon resource
//! from such a file, so artwork (`.jpg`, `.png`) is never a valid answer.
//!
//! The scan is bounded by construction: at most [`MAX_DEPTH`] levels below the install root, at most
//! [`ENTRY_BUDGET`] directory entries READ in total (a directory is read lazily and only up to what is
//! left of the budget, so a directory of millions of files costs 20,000 reads), symlinks and junctions
//! skipped, a directory that cannot be read skipped. It is blocking file I/O, so
//! [`resolve_windows_shortcut_icon`] runs it on the blocking pool.
//!
//! JavaScript semantics this module copies on purpose (the 94-07 goldens pin them): names are normalised
//! with `toLowerCase` and `[^\p{L}\p{N}]`, lengths are UTF-16 lengths, the helper and `.exe` / `.ico` /
//! `.dll` tests fold ASCII case only (a JS `i` flag without `u` never maps a non-ASCII character onto an
//! ASCII one), and ties on the relative path compare UTF-16 code units.

use std::cmp::Ordering;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use regex::Regex;

use crate::registry::{win32_is_absolute, win32_normalize};

/// Directory levels below the install root that the scan descends into.
pub const MAX_DEPTH: usize = 3;

/// Directory entries read before the scan stops and ranks what it has found.
pub const ENTRY_BUDGET: usize = 20_000;

/// Executables that ship beside a game but are not it, matched case-insensitively against the path
/// RELATIVE to the install root. An exe whose name equals the install directory or the title is never
/// excluded (a game called "Crash Bandicoot" is not a crash handler).
const HELPER_WORDS: [&str; 13] = [
    "crash",
    "unins",
    "setup",
    "redist",
    "dxsetup",
    "directx",
    "oalinst",
    "easyanticheat",
    "workshop",
    "editor",
    "installer",
    "repair",
    "wipe",
];

/// Where an icon came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IconSource {
    StoreExecutable,
    InstallDir,
    GamelibShell,
}

impl IconSource {
    /// The TS's name for the source.
    pub fn as_str(self) -> &'static str {
        match self {
            IconSource::StoreExecutable => "store-executable",
            IconSource::InstallDir => "install-dir",
            IconSource::GamelibShell => "gamelib-shell",
        }
    }
}

/// The answer: a file to extract an icon resource from, and which index (always the first).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowsShortcutIcon {
    pub icon: PathBuf,
    pub icon_index: i32,
    pub source: IconSource,
}

/// What the chain needs to know about a game (the TS `game` argument).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct IconGame {
    pub title: String,
    pub install_path: Option<PathBuf>,
    pub store_executable: Option<String>,
}

/// What a directory entry is, without following links.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryKind {
    File,
    Dir,
    Symlink,
    Other,
}

/// One directory entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DirItem {
    pub name: String,
    pub kind: EntryKind,
}

/// The file system the chain reads, so the budget cases can inject filler entries the way the oracle did.
pub trait IconFs: Send + Sync {
    /// At most `limit` entries of `dir`, in the order the file system lists them. An error skips the whole
    /// directory, as the TS swallowed a failed `readdir`.
    fn read_dir(&self, dir: &Path, limit: usize) -> io::Result<Vec<DirItem>>;
    /// The size of `path`, following links (the TS `stat`).
    fn file_len(&self, path: &Path) -> io::Result<u64>;
    /// Whether `path` is a regular file, following links.
    fn is_file(&self, path: &Path) -> bool;
}

/// The real file system.
pub struct RealFs;

impl IconFs for RealFs {
    fn read_dir(&self, dir: &Path, limit: usize) -> io::Result<Vec<DirItem>> {
        let mut items = Vec::new();
        for entry in std::fs::read_dir(dir)?.take(limit) {
            let entry = entry?;
            let kind = match entry.file_type() {
                Ok(t) if t.is_symlink() => EntryKind::Symlink,
                Ok(t) if t.is_dir() => EntryKind::Dir,
                Ok(t) if t.is_file() => EntryKind::File,
                _ => EntryKind::Other,
            };
            // A name that is not valid Unicode cannot be matched or ranked here; the TS saw it as a
            // string, which a Windows name with a lone surrogate is not, so it is simply not a candidate.
            if let Some(name) = entry.file_name().to_str() {
                items.push(DirItem {
                    name: name.to_string(),
                    kind,
                });
            }
        }
        Ok(items)
    }

    fn file_len(&self, path: &Path) -> io::Result<u64> {
        std::fs::metadata(path).map(|m| m.len())
    }

    fn is_file(&self, path: &Path) -> bool {
        std::fs::metadata(path).is_ok_and(|m| m.is_file())
    }
}

/// UTF-16 length, the JS `.length`.
fn len16(text: &str) -> usize {
    text.encode_utf16().count()
}

/// Lowercase, keeping only Unicode letters and digits (`value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')`).
fn normalize(value: &str) -> String {
    static NOT_WORD: OnceLock<Regex> = OnceLock::new();
    let pattern = NOT_WORD.get_or_init(|| match Regex::new(r"[^\p{L}\p{N}]") {
        Ok(regex) => regex,
        Err(e) => unreachable!("the name pattern is a constant: {e}"),
    });
    pattern.replace_all(&value.to_lowercase(), "").into_owned()
}

/// `/\.(exe|ico|dll)$/i`, ASCII case folding.
fn is_icon_file_name(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    [".exe", ".ico", ".dll"]
        .iter()
        .any(|ext| lower.ends_with(ext))
}

/// `/\.exe$/i`.
fn is_exe_name(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(".exe")
}

/// The helper test over the RELATIVE path (`HELPER_EXE.test(relativePath)`).
fn is_helper(relative: &str) -> bool {
    let lower = relative.to_ascii_lowercase();
    HELPER_WORDS.iter().any(|word| lower.contains(word))
}

/// Node's `path.win32.basename` for the install folder: the last component, trailing separators dropped,
/// a bare drive prefix removed. Both separators split, so the answer does not depend on the host.
fn basename(path: &str) -> &str {
    let trimmed = path.trim_end_matches(['\\', '/']);
    let last = trimmed.rsplit(['\\', '/']).next().unwrap_or(trimmed);
    let bytes = last.as_bytes();
    if bytes.len() >= 2
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && last.len() == trimmed.len()
    {
        &last[2..]
    } else {
        last
    }
}

/// `path.parse(name).name`: the name without its final extension (a leading dot is not an extension).
fn parse_name(name: &str) -> &str {
    match name.rfind('.') {
        Some(at) if at > 0 => &name[..at],
        _ => name,
    }
}

/// 0: the exe name equals the install directory or the title. 1: one contains the other (the shorter at
/// least three UTF-16 units). 2: neither.
fn match_tier(exe_name: &str, names: &[String]) -> u8 {
    let base = normalize(parse_name(exe_name));
    if base.is_empty() {
        return 2;
    }
    if names.contains(&base) {
        return 0;
    }
    let contained = names.iter().any(|name| {
        let (short, long) = if len16(&base) <= len16(name) {
            (base.as_str(), name.as_str())
        } else {
            (name.as_str(), base.as_str())
        };
        len16(short) >= 3 && long.contains(short)
    });
    if contained {
        1
    } else {
        2
    }
}

struct Candidate {
    path: PathBuf,
    /// Relative to the install root with the Windows separator, as `path.relative` gives on Windows.
    relative: String,
    name: String,
    depth: usize,
    size: u64,
}

/// Breadth-first over `install_path`: at most [`MAX_DEPTH`] levels, at most [`ENTRY_BUDGET`] entries.
fn scan_for_executables(fs: &dyn IconFs, install_path: &Path) -> Vec<Candidate> {
    let mut found = Vec::new();
    // (directory, its path relative to the root, depth)
    let mut queue: Vec<(PathBuf, String, usize)> =
        vec![(install_path.to_path_buf(), String::new(), 0)];
    let mut budget = ENTRY_BUDGET;
    let mut head = 0usize;
    while head < queue.len() && budget > 0 {
        let (dir, prefix, depth) = queue[head].clone();
        head += 1;
        let Ok(entries) = fs.read_dir(&dir, budget) else {
            continue;
        };
        budget = budget.saturating_sub(entries.len());
        for entry in entries {
            let relative = if prefix.is_empty() {
                entry.name.clone()
            } else {
                format!("{prefix}\\{}", entry.name)
            };
            match entry.kind {
                EntryKind::Symlink | EntryKind::Other => {}
                EntryKind::Dir => {
                    if depth < MAX_DEPTH {
                        queue.push((dir.join(&entry.name), relative, depth + 1));
                    }
                }
                EntryKind::File => {
                    if is_exe_name(&entry.name) {
                        let path = dir.join(&entry.name);
                        // Vanished or unreadable between the listing and the stat: not a candidate.
                        if let Ok(size) = fs.file_len(&path) {
                            found.push(Candidate {
                                path,
                                relative,
                                name: entry.name,
                                depth,
                                size,
                            });
                        }
                    }
                }
            }
        }
    }
    found
}

/// Name match first, then shallower, then larger, then the relative path for determinism.
fn pick_installed_executable(fs: &dyn IconFs, install_path: &Path, title: &str) -> Option<PathBuf> {
    let install = install_path.to_string_lossy();
    let names: Vec<String> = [normalize(basename(&install)), normalize(title)]
        .into_iter()
        .filter(|n| !n.is_empty())
        .collect();
    let mut ranked: Vec<(u8, Candidate)> = scan_for_executables(fs, install_path)
        .into_iter()
        .map(|candidate| (match_tier(&candidate.name, &names), candidate))
        .filter(|(tier, candidate)| *tier == 0 || !is_helper(&candidate.relative))
        .collect();
    ranked.sort_by(|(ta, a), (tb, b)| {
        ta.cmp(tb)
            .then(a.depth.cmp(&b.depth))
            .then(b.size.cmp(&a.size))
            .then_with(|| compare_utf16(&a.relative, &b.relative))
    });
    ranked
        .into_iter()
        .next()
        .map(|(_, candidate)| candidate.path)
}

/// JavaScript's `<` on strings: UTF-16 code units, not scalar values.
fn compare_utf16(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

/// `path.join(base, rel)` as Node does it on Windows: separators normalised. Off Windows the path is a real
/// path of the host (the replay's temp tree), so it is a plain join.
fn join_like_node(base: &Path, rel: &str) -> PathBuf {
    if cfg!(windows) {
        PathBuf::from(win32_normalize(&format!(
            "{}\\{rel}",
            base.to_string_lossy()
        )))
    } else {
        base.join(rel)
    }
}

/// An existing `.exe`, `.ico` or `.dll` regular file.
fn is_usable_icon_file(fs: &dyn IconFs, path: &Path) -> bool {
    is_icon_file_name(&path.to_string_lossy()) && fs.is_file(path)
}

/// The chain over an injected file system. Blocking; see [`resolve_windows_shortcut_icon`].
pub fn resolve_with(
    fs: &dyn IconFs,
    game: &IconGame,
    shell_exe: Option<&Path>,
) -> Option<WindowsShortcutIcon> {
    let hit = |icon: PathBuf, source: IconSource| WindowsShortcutIcon {
        icon,
        icon_index: 0,
        source,
    };
    let install = game
        .install_path
        .as_deref()
        .filter(|p| !p.as_os_str().is_empty());

    if let Some(store) = game.store_executable.as_deref().filter(|s| !s.is_empty()) {
        let path = match install {
            Some(root) if !win32_is_absolute(store) => join_like_node(root, store),
            _ => PathBuf::from(store),
        };
        if is_usable_icon_file(fs, &path) {
            return Some(hit(path, IconSource::StoreExecutable));
        }
    }

    if let Some(root) = install {
        if let Some(scanned) = pick_installed_executable(fs, root, &game.title) {
            return Some(hit(scanned, IconSource::InstallDir));
        }
    }

    let shell = shell_exe.filter(|p| !p.as_os_str().is_empty())?;
    if is_usable_icon_file(fs, shell) {
        return Some(hit(shell.to_path_buf(), IconSource::GamelibShell));
    }
    None
}

/// The Windows icon of a shortcut for `game`: the store exe, else the install scan, else `shell_exe` (the
/// shell supplies it; `None` when it has none). Never fails: no usable file is `None`. The scan runs on the
/// blocking pool and is bounded by [`MAX_DEPTH`] and [`ENTRY_BUDGET`].
pub async fn resolve_windows_shortcut_icon(
    game: IconGame,
    shell_exe: Option<PathBuf>,
) -> Option<WindowsShortcutIcon> {
    tokio::task::spawn_blocking(move || resolve_with(&RealFs, &game, shell_exe.as_deref()))
        .await
        .ok()
        .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering as AtomicOrdering};

    /// A directory of a million virtual files: the scan must read at most the budget of them.
    struct Endless {
        produced: AtomicUsize,
        calls: AtomicUsize,
    }

    impl IconFs for Endless {
        fn read_dir(&self, dir: &Path, limit: usize) -> io::Result<Vec<DirItem>> {
            self.calls.fetch_add(1, AtomicOrdering::SeqCst);
            let count = limit.min(1_000_000);
            self.produced.fetch_add(count, AtomicOrdering::SeqCst);
            let mut items: Vec<DirItem> = (0..count)
                .map(|i| DirItem {
                    name: format!("f{i}.dat"),
                    kind: EntryKind::File,
                })
                .collect();
            if dir == Path::new("root") {
                // Subdirectories first, so a naive scan would recurse without end.
                items.insert(
                    0,
                    DirItem {
                        name: "sub".to_string(),
                        kind: EntryKind::Dir,
                    },
                );
            }
            Ok(items)
        }
        fn file_len(&self, _: &Path) -> io::Result<u64> {
            Ok(1)
        }
        fn is_file(&self, _: &Path) -> bool {
            false
        }
    }

    #[test]
    fn a_huge_directory_costs_the_budget_and_nothing_more() {
        let fs = Endless {
            produced: AtomicUsize::new(0),
            calls: AtomicUsize::new(0),
        };
        let game = IconGame {
            title: "Zeta".to_string(),
            install_path: Some(PathBuf::from("root")),
            store_executable: None,
        };
        assert_eq!(resolve_with(&fs, &game, None), None);
        assert!(
            fs.produced.load(AtomicOrdering::SeqCst) <= ENTRY_BUDGET,
            "{} entries were read",
            fs.produced.load(AtomicOrdering::SeqCst)
        );
        // The root spent the whole budget, so the subdirectory it listed was never opened.
        assert_eq!(fs.calls.load(AtomicOrdering::SeqCst), 1);
    }

    #[test]
    fn names_are_normalised_like_the_ts() {
        assert_eq!(normalize("The Dig!"), "thedig");
        assert_eq!(normalize("THE_dig"), "thedig");
        assert_eq!(
            normalize("\u{5E7B}\u{60F3}\u{90F7}"),
            "\u{5E7B}\u{60F3}\u{90F7}"
        );
        assert_eq!(normalize("a-b.c 9"), "abc9");
    }

    #[test]
    fn helper_words_fold_ascii_case_only() {
        assert!(is_helper("Tools\\CrashHandler.exe"));
        assert!(is_helper("UNINS000.exe"));
        assert!(is_helper("wipe.exe"));
        // U+017F and U+212A are not ASCII `s` and `k` to a JS `i` regex without `u`.
        assert!(!is_helper("cra\u{17F}h.exe"));
        assert!(!is_helper("Game.exe"));
    }

    #[test]
    fn the_name_helpers_follow_node() {
        assert_eq!(basename("C:\\Games\\Zeta\\"), "Zeta");
        assert_eq!(basename("/tmp/x/Games/Zeta"), "Zeta");
        assert_eq!(basename("C:Zeta"), "Zeta");
        assert_eq!(parse_name("a.b.exe"), "a.b");
        assert_eq!(parse_name(".exe"), ".exe");
        assert_eq!(match_tier("Zeta.exe", &["zeta".to_string()]), 0);
        assert_eq!(match_tier("Som.exe", &["somelongtitle".to_string()]), 1);
        assert_eq!(match_tier("zz.exe", &["zzz".to_string()]), 2);
        assert_eq!(match_tier("---.exe", &["zeta".to_string()]), 2);
    }

    #[test]
    fn icon_files_are_exe_ico_or_dll() {
        for yes in ["a.exe", "A.EXE", "x.ico", "y.Dll"] {
            assert!(is_icon_file_name(yes), "{yes}");
        }
        for no in ["a.png", "a.jpg", "exe", "a.exe.bak", ""] {
            assert!(!is_icon_file_name(no), "{no}");
        }
    }
}
