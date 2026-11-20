//! The criterion-4 adversarial path table (Phase 82 D-18). Every fixture is built inside a
//! `FakeHome`, every path segment by segment, and every row asserts that a sentinel OUTSIDE the
//! target (and anything inside a link referent) still exists after both `check_removal` and
//! `remove_tree`. Link rows go through `make_dir_link` + `require_link`: a runner that cannot
//! create a link panics when CI is set and only skips locally, never a silent pass.
//!
//! Rows that depend on the volume (case, NFC/NFD) inject the `CaseMode`, and assert the
//! `Sensitive` direction only when the volume under test is itself case-sensitive.

use gamelib_safety::remove::{check_removal, remove_tree};
use gamelib_safety::safe_path::{probe_case_insensitive, CaseMode};
use gamelib_safety::tri::{Probe, Tri};
use gamelib_safety::wire::{
    Known, Outcome, Reason, RemoveReply, Reply, Request, Target, TargetKind,
};
use gamelib_testutil::{make_dir_link, require_link, FakeHome, LinkKind};
use std::fs;
use std::path::{Path, PathBuf, MAIN_SEPARATOR};

const PREFIX: &str = "gamelib-safety-adv-";

// ---------------------------------------------------------------- helpers

fn ci() -> bool {
    std::env::var_os("CI").is_some()
}

fn s(p: &Path) -> String {
    p.to_str().expect("utf-8 path").to_string()
}

/// Joins segment by segment (never `join("a/b")`: Windows CI rule).
fn seg(base: &Path, parts: &[&str]) -> PathBuf {
    parts
        .iter()
        .fold(base.to_path_buf(), |p, part| p.join(part))
}

fn touch(p: &Path) {
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).expect("mkdir");
    }
    fs::write(p, b"x").expect("write");
}

/// A file outside any target: must survive every row.
fn sentinel(home: &FakeHome) -> PathBuf {
    let p = seg(home.root(), &["outside", "sentinel.txt"]);
    touch(&p);
    p
}

fn exists(p: &Path) -> bool {
    fs::symlink_metadata(p).is_ok()
}

fn tgt(id: &str, path: String, kind: TargetKind, trust: Option<&Path>) -> Target {
    Target {
        id: id.to_string(),
        path,
        kind,
        trust_root: trust.map(s),
        executable: None,
    }
}

fn known(key: &str, path: &Path) -> Known {
    Known {
        key: key.to_string(),
        path: s(path),
    }
}

fn request(
    targets: Vec<Target>,
    known_installs: Option<Vec<Known>>,
    self_key: Option<&str>,
    protected: Vec<String>,
) -> Request {
    Request {
        targets,
        known_installs,
        self_key: self_key.map(str::to_string),
        protected_roots: protected,
    }
}

fn link_kinds() -> Vec<LinkKind> {
    if cfg!(windows) {
        vec![LinkKind::Junction, LinkKind::Symlink]
    } else {
        vec![LinkKind::Symlink]
    }
}

fn link(target: &Path, at: &Path, kind: LinkKind) -> bool {
    require_link(
        make_dir_link(target, at, kind),
        &format!("{kind:?} link"),
        ci(),
    )
}

struct Fixture {
    req: Request,
    case: CaseMode,
    /// The first target, to assert whether it is gone.
    target: PathBuf,
    /// Files that must exist after every call (outside the target, or inside a link referent).
    precious: Vec<PathBuf>,
}

struct Expect {
    overall: Tri,
    /// The first item's reason; `None` asserts only that the op refuses.
    reason: Option<Reason>,
    other_key: Option<&'static str>,
    target_gone: bool,
}

fn refused(reason: Reason) -> Expect {
    Expect {
        overall: Tri::No,
        reason: Some(reason),
        other_key: None,
        target_gone: false,
    }
}

fn unknown_with(reason: Reason) -> Expect {
    Expect {
        overall: Tri::Unknown,
        reason: Some(reason),
        other_key: None,
        target_gone: false,
    }
}

fn removed() -> Expect {
    Expect {
        overall: Tri::Yes,
        reason: Some(Reason::Ok),
        other_key: None,
        target_gone: true,
    }
}

fn assert_precious(fx: &Fixture, when: &str) {
    for p in &fx.precious {
        assert!(exists(p), "{when}: {} was deleted", p.display());
    }
}

/// Checks, then removes, asserting the verdict, the outcome, that the check deleted nothing and
/// that every precious file survived both calls. Returns the removal reply.
fn run(name: &str, fx: &Fixture, ex: &Expect) -> RemoveReply {
    let reply = check_removal(&fx.req, fx.case);
    assert_eq!(reply.overall, ex.overall, "{name}: overall");
    let first = reply.items.first().expect("an item");
    if let Some(reason) = ex.reason {
        assert_eq!(first.reason, reason, "{name}: reason");
    }
    assert_eq!(first.other_key.as_deref(), ex.other_key, "{name}: otherKey");
    assert_precious(fx, &format!("{name}: after check_removal"));
    assert!(
        exists(&fx.target),
        "{name}: check_removal must delete nothing"
    );

    let rm = remove_tree(&fx.req, fx.case);
    let want = if ex.overall == Tri::Yes {
        Outcome::Removed
    } else {
        Outcome::Refused
    };
    assert_eq!(rm.outcome, want, "{name}: outcome");
    assert_eq!(rm.overall, ex.overall, "{name}: remove overall");
    assert_precious(fx, &format!("{name}: after remove_tree"));
    assert_eq!(
        !exists(&fx.target),
        ex.target_gone,
        "{name}: target presence after remove_tree"
    );
    rm
}

/// A game-install fixture under `<root>/common`, trust root `common`, no known installs.
struct Common {
    home: FakeHome,
    common: PathBuf,
    sentinel: PathBuf,
}

fn common() -> Common {
    let home = FakeHome::new(PREFIX);
    let common = seg(home.root(), &["common"]);
    fs::create_dir_all(&common).unwrap();
    let sentinel = sentinel(&home);
    Common {
        home,
        common,
        sentinel,
    }
}

fn game_fixture(c: &Common, target: &Path, known_installs: Vec<Known>) -> Fixture {
    Fixture {
        req: request(
            vec![tgt(
                "game",
                s(target),
                TargetKind::GameInstall,
                Some(&c.common),
            )],
            Some(known_installs),
            Some("self"),
            vec![],
        ),
        case: CaseMode::Auto,
        target: target.to_path_buf(),
        precious: vec![c.sentinel.clone()],
    }
}

// ------------------------------------------------------------------- rows

/// D-09: the known co-install bug. Target `common/Studio` holds another game's install.
#[test]
fn nested_installdir_refuses_and_names_the_other_game() {
    let c = common();
    let studio = seg(&c.common, &["Studio"]);
    let game_b = seg(&studio, &["GameB"]);
    touch(&seg(&game_b, &["b.exe"]));
    touch(&seg(&studio, &["a.exe"]));
    let mut fx = game_fixture(&c, &studio, vec![known("gameb", &game_b)]);
    fx.precious.push(seg(&game_b, &["b.exe"]));
    fx.precious.push(seg(&studio, &["a.exe"]));
    let mut ex = refused(Reason::NestedKnownInstall);
    ex.other_key = Some("gameb");
    run("nested installdir", &fx, &ex);
}

#[test]
fn target_equal_to_another_known_install_is_nested() {
    let c = common();
    let other = seg(&c.common, &["Other"]);
    touch(&seg(&other, &["o.exe"]));
    let mut fx = game_fixture(&c, &other, vec![known("other", &other)]);
    fx.precious.push(seg(&other, &["o.exe"]));
    let mut ex = refused(Reason::NestedKnownInstall);
    ex.other_key = Some("other");
    run("equal to another install", &fx, &ex);
}

#[test]
fn reverse_nesting_target_inside_another_install_is_refused() {
    let c = common();
    let studio = seg(&c.common, &["Studio"]);
    let game_b = seg(&studio, &["GameB"]);
    touch(&seg(&game_b, &["b.exe"]));
    let mut fx = game_fixture(&c, &game_b, vec![known("studio", &studio)]);
    fx.precious.push(seg(&game_b, &["b.exe"]));
    let mut ex = refused(Reason::InsideKnownInstall);
    ex.other_key = Some("studio");
    run("inside known install", &fx, &ex);
}

#[test]
fn self_known_install_is_not_a_sibling() {
    let c = common();
    let game = seg(&c.common, &["Game"]);
    touch(&seg(&game, &["g.exe"]));
    let fx = game_fixture(&c, &game, vec![known("self", &game)]);
    run("self key excluded", &fx, &removed());
}

#[test]
fn unrelated_siblings_with_a_shared_name_prefix_are_not_nested() {
    let c = common();
    let game = seg(&c.common, &["Studio"]);
    let sibling = seg(&c.common, &["StudioTwo"]);
    touch(&seg(&game, &["g.exe"]));
    touch(&seg(&sibling, &["s.exe"]));
    let mut fx = game_fixture(&c, &game, vec![known("two", &sibling)]);
    fx.precious.push(seg(&sibling, &["s.exe"]));
    run("component compare, not string prefix", &fx, &removed());
}

/// Lexical rows: a raw string judged identically on every OS. `.\x`, `C:\x` and UNC are
/// relative on Unix; on Windows `C:\x` and UNC are real absolute paths and fall to containment.
struct Lexical {
    name: &'static str,
    raw: String,
    unix: Reason,
    windows: Option<Reason>,
}

fn lexical_table(c: &Common) -> Vec<Lexical> {
    let root = s(&c.common);
    let sep = MAIN_SEPARATOR;
    vec![
        Lexical {
            name: "dot segment, absolute",
            raw: format!("{root}{sep}.{sep}Studio"),
            unix: Reason::DotSegment,
            windows: Some(Reason::DotSegment),
        },
        Lexical {
            name: "dotdot segment, absolute",
            raw: format!("{root}{sep}..{sep}common{sep}Studio"),
            unix: Reason::DotSegment,
            windows: Some(Reason::DotSegment),
        },
        Lexical {
            name: ".\\Studio",
            raw: r".\Studio".to_string(),
            unix: Reason::NotAbsolute,
            windows: Some(Reason::NotAbsolute),
        },
        Lexical {
            name: "Studio\\.",
            raw: r"Studio\.".to_string(),
            unix: Reason::NotAbsolute,
            windows: Some(Reason::NotAbsolute),
        },
        Lexical {
            name: ".\\..\\x",
            raw: r".\..\x".to_string(),
            unix: Reason::NotAbsolute,
            windows: Some(Reason::NotAbsolute),
        },
        Lexical {
            name: "relative name",
            raw: "Studio".to_string(),
            unix: Reason::NotAbsolute,
            windows: Some(Reason::NotAbsolute),
        },
        Lexical {
            name: "empty string",
            raw: String::new(),
            unix: Reason::NotAbsolute,
            windows: Some(Reason::NotAbsolute),
        },
        Lexical {
            name: "nul byte",
            raw: format!("{root}{sep}Stu\0dio"),
            unix: Reason::NulByte,
            windows: Some(Reason::NulByte),
        },
        Lexical {
            name: "C:\\x drive prefix",
            raw: r"C:\x\y".to_string(),
            unix: Reason::NotAbsolute,
            windows: Some(Reason::OutsideTrustRoot),
        },
        Lexical {
            name: "UNC string",
            raw: r"\\server\share\x".to_string(),
            unix: Reason::NotAbsolute,
            windows: None,
        },
        Lexical {
            name: "UNC verbatim",
            raw: r"\\?\UNC\server\share\x".to_string(),
            unix: Reason::NotAbsolute,
            windows: None,
        },
    ]
}

fn lexical_rows(filter: &[&str]) {
    let c = common();
    // The real folder these strings try to alias: it and the sentinel must survive.
    let studio = seg(&c.common, &["Studio"]);
    touch(&seg(&studio, &["a.exe"]));
    for row in lexical_table(&c)
        .into_iter()
        .filter(|r| filter.iter().any(|f| r.name.starts_with(f)))
    {
        let mut fx = game_fixture(&c, &studio, vec![]);
        fx.req.targets[0].path = row.raw.clone();
        fx.precious.push(seg(&studio, &["a.exe"]));
        let want = if cfg!(windows) {
            row.windows
        } else {
            Some(row.unix)
        };
        let reply = check_removal(&fx.req, fx.case);
        assert!(
            !reply.overall.allows(),
            "{}: must refuse, got {:?}",
            row.name,
            reply
        );
        if let Some(reason) = want {
            assert_eq!(reply.items[0].reason, reason, "{}", row.name);
        }
        let rm = remove_tree(&fx.req, fx.case);
        assert_eq!(rm.outcome, Outcome::Refused, "{}", row.name);
        assert_precious(&fx, row.name);
        assert!(exists(&studio), "{}: aliased folder deleted", row.name);
    }
}

#[test]
fn dot_segment_rows_are_refused() {
    lexical_rows(&[
        "dot segment",
        "dotdot",
        ".\\Studio",
        "Studio\\.",
        ".\\..\\x",
    ]);
}

#[test]
fn relative_empty_and_nul_rows_are_refused() {
    lexical_rows(&["relative name", "empty string", "nul byte"]);
}

#[test]
fn drive_prefix_row_is_refused() {
    lexical_rows(&["C:\\x"]);
}

#[test]
fn unc_string_and_verbatim_rows_are_refused() {
    lexical_rows(&["UNC"]);
}

#[cfg(windows)]
#[test]
fn unc_reason_is_never_ok_on_windows() {
    // Windows resolves UNC as a real absolute path; whatever the share lookup answers, a path
    // outside the trust root must not be a Yes. (The table above asserts the refusal itself.)
    let c = common();
    let studio = seg(&c.common, &["Studio"]);
    touch(&seg(&studio, &["a.exe"]));
    let mut fx = game_fixture(&c, &studio, vec![]);
    fx.req.targets[0].path = r"\\?\UNC\server\share\x".to_string();
    assert_ne!(check_removal(&fx.req, fx.case).overall, Tri::Yes);
}

#[test]
fn zero_targets_is_yes_with_no_items_and_deletes_nothing() {
    let c = common();
    let req = request(vec![], Some(vec![]), None, vec![]);
    let reply: Reply = check_removal(&req, CaseMode::Auto);
    assert_eq!(reply.overall, Tri::Yes);
    assert!(reply.items.is_empty());
    let rm = remove_tree(&req, CaseMode::Auto);
    assert_eq!(rm.outcome, Outcome::Removed);
    assert!(rm.items.is_empty());
    assert!(exists(&c.sentinel));
    assert!(exists(&c.common));
}

#[test]
fn outside_and_equal_to_the_trust_root_are_refused() {
    let c = common();
    let outside = seg(c.home.root(), &["elsewhere", "Game"]);
    touch(&seg(&outside, &["g.exe"]));
    let mut fx = game_fixture(&c, &outside, vec![]);
    fx.precious.push(seg(&outside, &["g.exe"]));
    run(
        "outside trust root",
        &fx,
        &refused(Reason::OutsideTrustRoot),
    );

    let fx = game_fixture(&c, &c.common, vec![]);
    run("equal to trust root", &fx, &refused(Reason::IsTrustRoot));

    // `commonX` shares a string prefix with the trust root `common` but is not inside it.
    let lookalike = seg(c.home.root(), &["commonX", "Game"]);
    touch(&seg(&lookalike, &["g.exe"]));
    let mut fx = game_fixture(&c, &lookalike, vec![]);
    fx.precious.push(seg(&lookalike, &["g.exe"]));
    run(
        "string-prefix lookalike",
        &fx,
        &refused(Reason::OutsideTrustRoot),
    );
}

#[test]
fn protected_root_equal_to_the_target_is_refused() {
    let c = common();
    let mut fx = game_fixture(&c, &c.common, vec![]);
    // No trust root, so only the protected-root check stands between the target and a delete.
    fx.req.targets[0].trust_root = Some(s(c.home.root()));
    fx.req.protected_roots = vec![s(&c.common)];
    run(
        "target == protected root",
        &fx,
        &refused(Reason::IsProtectedRoot),
    );
}

#[test]
fn protected_root_inside_the_target_is_refused() {
    let c = common();
    let lib = seg(c.home.root(), &["lib"]);
    let default_install = seg(&lib, &["steamapps", "common"]);
    fs::create_dir_all(&default_install).unwrap();
    let mut fx = game_fixture(&c, &lib, vec![]);
    fx.req.targets[0].trust_root = Some(s(c.home.root()));
    fx.req.protected_roots = vec![s(&default_install)];
    run(
        "target is an ancestor of a protected root",
        &fx,
        &refused(Reason::IsProtectedRoot),
    );
}

#[cfg(unix)]
#[test]
fn a_filesystem_root_is_always_protected() {
    let c = common();
    let mut fx = game_fixture(&c, Path::new("/"), vec![]);
    fx.target = c.common.clone(); // `run` asserts this still exists; `/` obviously does
    fx.req.targets[0].path = "/".to_string();
    let reply = check_removal(&fx.req, CaseMode::Auto);
    assert_eq!(reply.overall, Tri::No);
    assert_eq!(reply.items[0].reason, Reason::IsProtectedRoot);
    assert_eq!(
        remove_tree(&fx.req, CaseMode::Auto).outcome,
        Outcome::Refused
    );
    assert!(exists(&c.sentinel));
}

#[test]
fn symlink_root_is_unlinked_and_the_referent_survives() {
    for kind in link_kinds() {
        let c = common();
        let victim = seg(c.home.root(), &["victim"]);
        let precious = seg(&victim, &["precious.txt"]);
        touch(&precious);
        let game = seg(&c.common, &["Game"]);
        if !link(&victim, &game, kind) {
            continue;
        }
        let mut fx = game_fixture(&c, &game, vec![]);
        fx.precious.push(precious.clone());
        fx.precious.push(victim.clone());
        let rm = run(&format!("{kind:?} root"), &fx, &removed());
        assert!(rm.items[0].is_link, "{kind:?}: reported as a link");
    }
}

#[test]
fn symlink_root_with_a_trailing_separator_is_still_unlinked_not_followed() {
    for kind in link_kinds() {
        let c = common();
        let victim = seg(c.home.root(), &["victim"]);
        let precious = seg(&victim, &["precious.txt"]);
        touch(&precious);
        let game = seg(&c.common, &["Game"]);
        if !link(&victim, &game, kind) {
            continue;
        }
        let mut fx = game_fixture(&c, &game, vec![]);
        fx.req.targets[0].path = format!("{}{}", s(&game), MAIN_SEPARATOR);
        fx.precious.push(precious.clone());
        fx.precious.push(victim.clone());
        run(
            &format!("{kind:?} root with trailing separator"),
            &fx,
            &removed(),
        );
    }
}

#[test]
fn symlink_inside_the_tree_is_unlinked_not_followed() {
    for kind in link_kinds() {
        let c = common();
        let victim = seg(c.home.root(), &["victim"]);
        let precious = seg(&victim, &["precious.txt"]);
        touch(&precious);
        let game = seg(&c.common, &["Game"]);
        touch(&seg(&game, &["g.exe"]));
        if !link(&victim, &seg(&game, &["inner"]), kind) {
            continue;
        }
        let mut fx = game_fixture(&c, &game, vec![]);
        fx.precious.push(precious.clone());
        run(&format!("{kind:?} inside the tree"), &fx, &removed());
    }
}

#[test]
fn symlink_to_another_known_install_removes_the_link_only() {
    for kind in link_kinds() {
        let c = common();
        let game_b = seg(&c.common, &["GameB"]);
        let b_exe = seg(&game_b, &["b.exe"]);
        touch(&b_exe);
        let alias = seg(&c.common, &["Alias"]);
        if !link(&game_b, &alias, kind) {
            continue;
        }
        let mut fx = game_fixture(&c, &alias, vec![known("gameb", &game_b)]);
        fx.precious.push(b_exe.clone());
        fx.precious.push(game_b.clone());
        run(&format!("{kind:?} to a known install"), &fx, &removed());
    }
}

/// Whether the volume holding `dir` folds case (the real, un-injected probe).
fn volume_is_case_insensitive(dir: &Path) -> bool {
    let canon = dunce_canonical(dir);
    matches!(probe_case_insensitive(&canon), Probe::Present(true))
}

fn dunce_canonical(p: &Path) -> PathBuf {
    fs::canonicalize(p).expect("canonicalize")
}

#[test]
fn case_insensitive_mode_refuses_a_differently_cased_nested_install() {
    // Known install spelled `common/studio/GameB`; the target is `common/Studio`.
    let build = |mode: CaseMode| -> (Common, Fixture) {
        let c = common();
        let studio = seg(&c.common, &["Studio"]);
        let game_b = seg(&studio, &["GameB"]);
        touch(&seg(&game_b, &["b.exe"]));
        let spelled = seg(&c.common, &["studio", "GameB"]);
        let mut fx = game_fixture(&c, &studio, vec![known("gameb", &spelled)]);
        fx.case = mode;
        fx.precious.push(seg(&game_b, &["b.exe"]));
        (c, fx)
    };
    let (_c, fx) = build(CaseMode::Insensitive);
    let mut ex = refused(Reason::NestedKnownInstall);
    ex.other_key = Some("gameb");
    run("case, insensitive", &fx, &ex);

    let (c, fx) = build(CaseMode::Sensitive);
    if volume_is_case_insensitive(&c.common) {
        // The volume itself folds case: `common/studio/GameB` resolves to the real folder, so
        // even a Sensitive comparison of canonical paths refuses.
        run("case, sensitive on an insensitive volume", &fx, &ex);
    } else {
        // Two distinct names on a case-sensitive volume.
        run("case, sensitive", &fx, &removed());
    }
}

#[test]
fn nfc_and_nfd_spellings_match_only_when_insensitive() {
    // Target named with NFC e-acute; the known install spelled with NFD e + U+0301.
    let nfc = "Caf\u{e9}";
    let nfd = "Cafe\u{301}";
    let build = |mode: CaseMode| -> (Common, Fixture) {
        let c = common();
        let studio = seg(&c.common, &[nfc]);
        let game_b = seg(&studio, &["GameB"]);
        touch(&seg(&game_b, &["b.exe"]));
        let spelled = seg(&c.common, &[nfd, "GameB"]);
        let mut fx = game_fixture(&c, &studio, vec![known("gameb", &spelled)]);
        fx.case = mode;
        fx.precious.push(seg(&game_b, &["b.exe"]));
        (c, fx)
    };
    let (_c, fx) = build(CaseMode::Insensitive);
    let mut ex = refused(Reason::NestedKnownInstall);
    ex.other_key = Some("gameb");
    run("nfc/nfd, insensitive", &fx, &ex);

    let (c, fx) = build(CaseMode::Sensitive);
    // APFS and NTFS treat the two spellings as one name; ext4 keeps them distinct.
    let same_name = exists(&seg(&c.common, &[nfd]));
    if same_name {
        run("nfc/nfd, sensitive on a normalising volume", &fx, &ex);
    } else {
        run("nfc/nfd, sensitive", &fx, &removed());
    }
}

#[test]
fn auto_probe_answers_on_the_real_volume() {
    let c = common();
    let canon = dunce_canonical(c.home.root());
    let probe = probe_case_insensitive(&canon);
    assert!(matches!(probe, Probe::Present(_)), "probe: {probe:?}");
    eprintln!("volume case-insensitive: {probe:?}");
}

fn prefix_fixture(c: &Common, name: &str) -> (PathBuf, Fixture) {
    let prefixes = seg(c.home.root(), &["prefixes"]);
    let prefix = seg(&prefixes, &[name]);
    fs::create_dir_all(&prefix).unwrap();
    let fx = Fixture {
        req: request(
            vec![tgt(
                "prefix",
                s(&prefix),
                TargetKind::Prefix,
                Some(&prefixes),
            )],
            Some(vec![]),
            None,
            vec![],
        ),
        case: CaseMode::Auto,
        target: prefix.clone(),
        precious: vec![c.sentinel.clone()],
    };
    (prefix, fx)
}

#[test]
fn not_a_prefix_refuses_a_populated_folder_without_drive_c_or_pfx() {
    let c = common();
    let (prefix, mut fx) = prefix_fixture(&c, "notes");
    touch(&seg(&prefix, &["my-documents", "thesis.docx"]));
    fx.precious
        .push(seg(&prefix, &["my-documents", "thesis.docx"]));
    run("not a prefix", &fx, &refused(Reason::NotAPrefix));
}

#[test]
fn a_real_prefix_and_an_empty_folder_are_removable() {
    for (name, marker) in [
        ("wine", Some("drive_c")),
        ("proton", Some("pfx")),
        ("empty", None),
    ] {
        let c = common();
        let (prefix, fx) = prefix_fixture(&c, name);
        if let Some(m) = marker {
            touch(&seg(&prefix, &[m, "system.reg"]));
        }
        run(&format!("prefix {name}"), &fx, &removed());
    }
}

fn sideload_fixture(c: &Common, exe: &str) -> (PathBuf, Fixture) {
    let folder = seg(c.home.root(), &["sideload", "Game"]);
    fs::create_dir_all(&folder).unwrap();
    let mut t = tgt("sideload", s(&folder), TargetKind::SideloadFolder, None);
    t.executable = Some(s(&seg(&folder, &[exe])));
    let fx = Fixture {
        // A sideload folder has no single trust root: protected roots carry the weight.
        req: request(vec![t], Some(vec![]), None, vec![s(c.home.root())]),
        case: CaseMode::Auto,
        target: folder.clone(),
        precious: vec![c.sentinel.clone()],
    };
    (folder, fx)
}

#[test]
fn sideload_shared_when_a_second_exe_sits_beside_the_game() {
    let c = common();
    let (folder, mut fx) = sideload_fixture(&c, "game.exe");
    touch(&seg(&folder, &["game.exe"]));
    touch(&seg(&folder, &["Other-Setup.EXE"]));
    fx.precious.push(seg(&folder, &["Other-Setup.EXE"]));
    run("second exe", &fx, &refused(Reason::FolderLooksShared));
}

#[test]
fn sideload_shared_when_a_second_app_bundle_sits_beside_the_game() {
    let c = common();
    let (folder, mut fx) = sideload_fixture(&c, "game.exe");
    touch(&seg(&folder, &["game.exe"]));
    touch(&seg(&folder, &["Another.app", "Contents", "Info.plist"]));
    fx.precious
        .push(seg(&folder, &["Another.app", "Contents", "Info.plist"]));
    run(
        "second app bundle",
        &fx,
        &refused(Reason::FolderLooksShared),
    );
}

#[cfg(unix)]
#[test]
fn sideload_shared_when_an_executable_bit_file_sits_beside_the_game() {
    use std::os::unix::fs::PermissionsExt;
    let c = common();
    let (folder, mut fx) = sideload_fixture(&c, "game");
    touch(&seg(&folder, &["game"]));
    let helper = seg(&folder, &["installer"]);
    touch(&helper);
    fs::set_permissions(&helper, fs::Permissions::from_mode(0o755)).unwrap();
    fx.precious.push(helper);
    run("exec-bit file", &fx, &refused(Reason::FolderLooksShared));
}

#[test]
fn a_dedicated_sideload_folder_is_removable() {
    let c = common();
    let (folder, fx) = sideload_fixture(&c, "game.exe");
    touch(&seg(&folder, &["game.exe"]));
    touch(&seg(&folder, &["data.pak"]));
    touch(&seg(&folder, &["README.txt"]));
    touch(&seg(&folder, &["bin", "helper.dll"]));
    run("dedicated folder", &fx, &removed());
}

#[test]
fn a_sideload_apps_own_bundle_counts_as_its_own_executable() {
    let c = common();
    let (folder, fx) = sideload_fixture(&c, "Game.app/Contents/MacOS/Game");
    touch(&seg(&folder, &["Game.app", "Contents", "MacOS", "Game"]));
    touch(&seg(&folder, &["save.dat"]));
    run("own app bundle", &fx, &removed());
}

#[test]
fn sideload_without_any_protected_root_has_no_trust_root() {
    let c = common();
    let (folder, mut fx) = sideload_fixture(&c, "game.exe");
    touch(&seg(&folder, &["game.exe"]));
    fx.req.protected_roots = vec![];
    run(
        "sideload, nothing to anchor on",
        &fx,
        &unknown_with(Reason::NoTrustRoot),
    );
}

#[test]
fn app_data_file_inside_its_trust_root_is_removed_alone() {
    let c = common();
    let app = seg(c.home.root(), &["appdata"]);
    let config = seg(&app, &["config.json"]);
    let neighbour = seg(&app, &["other.json"]);
    touch(&config);
    touch(&neighbour);
    let fx = Fixture {
        req: request(
            vec![tgt("config", s(&config), TargetKind::AppData, Some(&app))],
            Some(vec![]),
            None,
            vec![],
        ),
        case: CaseMode::Auto,
        target: config,
        precious: vec![c.sentinel.clone(), neighbour],
    };
    run("app-data file", &fx, &removed());
}

#[test]
fn unknown_a_path_component_that_is_a_file_cannot_be_canonicalised() {
    let c = common();
    let file = seg(&c.common, &["file.txt"]);
    touch(&file);
    let mut fx = game_fixture(&c, &seg(&file, &["Game"]), vec![]);
    fx.target = file.clone();
    fx.precious.push(file);
    run(
        "file in the path",
        &fx,
        &unknown_with(Reason::CanonicalizeFailed),
    );
}

#[test]
fn unknown_known_installs_unreadable_refuses() {
    let c = common();
    let game = seg(&c.common, &["Game"]);
    touch(&seg(&game, &["g.exe"]));
    let mut fx = game_fixture(&c, &game, vec![]);
    fx.req.known_installs = None;
    fx.precious.push(seg(&game, &["g.exe"]));
    run(
        "known installs None",
        &fx,
        &unknown_with(Reason::KnownInstallsUnreadable),
    );
}

#[test]
fn unknown_a_known_install_that_cannot_be_resolved_refuses() {
    let c = common();
    let game = seg(&c.common, &["Game"]);
    touch(&seg(&game, &["g.exe"]));
    let file = seg(&c.common, &["file.txt"]);
    touch(&file);
    let broken = seg(&file, &["Inside"]);
    let fx = game_fixture(&c, &game, vec![known("broken", &broken)]);
    let mut fx = fx;
    fx.precious.push(seg(&game, &["g.exe"]));
    run(
        "known path through a file",
        &fx,
        &unknown_with(Reason::CanonicalizeFailed),
    );
}

#[test]
fn unknown_a_relative_known_install_path_refuses() {
    let c = common();
    let game = seg(&c.common, &["Game"]);
    touch(&seg(&game, &["g.exe"]));
    let mut fx = game_fixture(
        &c,
        &game,
        vec![Known {
            key: "rel".to_string(),
            path: "relative/path".to_string(),
        }],
    );
    fx.precious.push(seg(&game, &["g.exe"]));
    run(
        "relative known path",
        &fx,
        &unknown_with(Reason::NotAbsolute),
    );
}

#[test]
fn unknown_no_trust_root_for_a_support_folder_or_bottle() {
    for kind in [
        TargetKind::GameSupport,
        TargetKind::Bottle,
        TargetKind::AppData,
    ] {
        let c = common();
        let dir = seg(c.home.root(), &["support", "Thing"]);
        touch(&seg(&dir, &["f.txt"]));
        let mut fx = game_fixture(&c, &dir, vec![]);
        fx.req.targets[0].kind = kind;
        fx.req.targets[0].trust_root = None;
        fx.precious.push(seg(&dir, &["f.txt"]));
        run(
            &format!("{kind:?} without a trust root"),
            &fx,
            &unknown_with(Reason::NoTrustRoot),
        );
    }
}

#[test]
fn unknown_a_missing_trust_root_refuses() {
    let c = common();
    let game = seg(&c.common, &["Game"]);
    touch(&seg(&game, &["g.exe"]));
    let mut fx = game_fixture(&c, &game, vec![]);
    fx.req.targets[0].trust_root = Some(s(&seg(c.home.root(), &["no", "such", "root"])));
    fx.precious.push(seg(&game, &["g.exe"]));
    run(
        "trust root missing",
        &fx,
        &unknown_with(Reason::CanonicalizeFailed),
    );
}

#[test]
fn absent_target_is_yes_and_nothing_is_touched() {
    let c = common();
    let missing = seg(&c.common, &["Gone"]);
    let fx = game_fixture(&c, &missing, vec![]);
    // `run` asserts the target exists after the check, which an absent target cannot: inline.
    let reply = check_removal(&fx.req, fx.case);
    assert_eq!(reply.overall, Tri::Yes);
    assert!(reply.items[0].absent);
    assert_eq!(reply.items[0].reason, Reason::Ok);
    let rm = remove_tree(&fx.req, fx.case);
    assert_eq!(rm.outcome, Outcome::Removed);
    assert!(rm.items[0].absent);
    assert!(exists(&c.sentinel) && exists(&c.common));
    assert!(!exists(&missing));

    // Several missing ancestors still resolve against the nearest existing one.
    let deeper = seg(&c.common, &["a", "b", "c"]);
    let fx = game_fixture(&c, &deeper, vec![]);
    let reply = check_removal(&fx.req, fx.case);
    assert_eq!(reply.overall, Tri::Yes);
    assert!(reply.items[0].absent);
    assert!(
        !exists(&seg(&c.common, &["a"])),
        "an absent target must not be created"
    );
}

#[test]
fn twice_removing_is_idempotent() {
    let c = common();
    let game = seg(&c.common, &["Game"]);
    touch(&seg(&game, &["g.exe"]));
    let fx = game_fixture(&c, &game, vec![]);
    let first = remove_tree(&fx.req, fx.case);
    assert_eq!(first.outcome, Outcome::Removed);
    assert!(!first.items[0].absent);
    assert!(!exists(&game));
    let second = remove_tree(&fx.req, fx.case);
    assert_eq!(second.outcome, Outcome::Removed);
    assert_eq!(second.overall, Tri::Yes);
    assert!(
        second.items.iter().all(|i| i.absent),
        "second run: every target absent"
    );
    assert!(exists(&c.sentinel) && exists(&c.common));
}

#[test]
fn recheck_a_yes_check_does_not_authorise_a_later_delete() {
    let c = common();
    let studio = seg(&c.common, &["Studio"]);
    touch(&seg(&studio, &["a.exe"]));
    let mut fx = game_fixture(&c, &studio, vec![]);
    assert_eq!(check_removal(&fx.req, fx.case).overall, Tri::Yes);

    // After the Yes, another game's install appears under the target and the request is rebuilt
    // with it. The delete call must re-check and refuse.
    let game_b = seg(&studio, &["GameB"]);
    touch(&seg(&game_b, &["b.exe"]));
    fx.req.known_installs = Some(vec![known("gameb", &game_b)]);
    fx.precious.push(seg(&game_b, &["b.exe"]));
    fx.precious.push(seg(&studio, &["a.exe"]));
    let rm = remove_tree(&fx.req, fx.case);
    assert_eq!(rm.outcome, Outcome::Refused);
    assert_eq!(rm.items[0].reason, Reason::NestedKnownInstall);
    assert_precious(&fx, "recheck");
    assert!(exists(&studio));
}

#[test]
fn several_targets_are_all_or_nothing_and_reported_in_request_order() {
    let c = common();
    let fine = seg(&c.common, &["Fine"]);
    let studio = seg(&c.common, &["Studio"]);
    let game_b = seg(&studio, &["GameB"]);
    touch(&seg(&fine, &["f.exe"]));
    touch(&seg(&game_b, &["b.exe"]));
    let mut req = request(
        vec![
            tgt("fine", s(&fine), TargetKind::GameInstall, Some(&c.common)),
            tgt(
                "studio",
                s(&studio),
                TargetKind::GameInstall,
                Some(&c.common),
            ),
        ],
        Some(vec![known("gameb", &game_b)]),
        Some("self"),
        vec![],
    );
    let reply = check_removal(&req, CaseMode::Auto);
    let ids: Vec<&str> = reply.items.iter().map(|i| i.id.as_str()).collect();
    assert_eq!(ids, ["fine", "studio"]);
    assert_eq!(reply.items[0].verdict, Tri::Yes);
    assert_eq!(reply.items[1].verdict, Tri::No);
    assert_eq!(reply.overall, Tri::No, "Yes AND No");
    assert_eq!(
        reply,
        check_removal(&req, CaseMode::Auto),
        "equal inputs, equal replies"
    );

    let rm = remove_tree(&req, CaseMode::Auto);
    assert_eq!(rm.outcome, Outcome::Refused);
    assert!(
        exists(&seg(&fine, &["f.exe"])),
        "D-14: a passing target is not deleted alone"
    );
    assert!(exists(&seg(&game_b, &["b.exe"])) && exists(&c.sentinel));

    // Yes AND Unknown is Unknown (No would beat it, but there is none here).
    req.known_installs = None;
    assert_eq!(check_removal(&req, CaseMode::Auto).overall, Tri::Unknown);
}

#[cfg(unix)]
#[test]
fn a_delete_failure_stops_the_loop_and_is_reported() {
    use std::os::unix::fs::PermissionsExt;
    let c = common();
    let stuck = seg(&c.common, &["Stuck"]);
    let inner = seg(&stuck, &["inner"]);
    touch(&seg(&inner, &["f.txt"]));
    let later = seg(&c.common, &["Later"]);
    touch(&seg(&later, &["l.exe"]));
    // An unwritable directory: its file cannot be unlinked (unless the runner is root).
    fs::set_permissions(&inner, fs::Permissions::from_mode(0o500)).unwrap();
    let req = request(
        vec![
            tgt("stuck", s(&stuck), TargetKind::GameInstall, Some(&c.common)),
            tgt("later", s(&later), TargetKind::GameInstall, Some(&c.common)),
        ],
        Some(vec![]),
        None,
        vec![],
    );
    let rm = remove_tree(&req, CaseMode::Auto);
    // Restore before asserting so FakeHome can clean up whatever the assertions decide.
    fs::set_permissions(&inner, fs::Permissions::from_mode(0o700)).unwrap();
    if rm.outcome == Outcome::Removed {
        eprintln!("SKIPPED: this runner ignores directory permissions (root)");
        return;
    }
    assert_eq!(rm.outcome, Outcome::Failed);
    assert_eq!(rm.items[0].reason, Reason::DeleteFailed);
    assert_eq!(rm.items[0].verdict, Tri::No);
    assert_eq!(
        rm.overall,
        Tri::No,
        "overall stays the Kleene AND of the items"
    );
    assert!(
        exists(&seg(&later, &["l.exe"])),
        "later targets are not attempted"
    );
    assert!(exists(&c.sentinel));
}
