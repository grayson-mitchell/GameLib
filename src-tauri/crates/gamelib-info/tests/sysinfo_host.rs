//! The per-OS smoke of `RealHostFacts` (88.1-10, SC2, D-13): the golden replay injects the host's facts,
//! so it cannot show that the production reads (`/proc` on Linux, `sysctl` and `mach` on macOS, the
//! registry and `GlobalMemoryStatusEx` on Windows) equal what Node's `os` module reported. This runs the
//! real reads on whatever OS the test runs on (all three CI legs) and asserts what any machine satisfies:
//! a CPU with a model, at least one core, memory with the used part below the total, and a kernel release.
//!
//! No program is spawned and no environment variable or profile path is read: the facts come from the OS,
//! and the three environment-derived ones (`FLATPAK_ID`, `APPIMAGE`, the Steam Deck game-mode flag) are
//! handed in through `HostEnv`.

use gamelib_info::sysinfo::host::{HostEnv, HostFacts, RealHostFacts, OS_RELEASE_PATHS};

fn host() -> RealHostFacts {
    RealHostFacts::new(HostEnv::default())
}

#[test]
fn the_host_lists_at_least_one_cpu_and_the_first_has_a_model() {
    let cpus = host().cpu_models();
    assert!(!cpus.is_empty(), "the host listed no CPU");
    assert!(
        !cpus[0].trim().is_empty(),
        "the first CPU has no model name"
    );
}

#[test]
fn the_host_memory_is_a_positive_total_with_the_free_part_inside_it() {
    let facts = host();
    let (total, free) = (facts.total_mem(), facts.free_mem());
    assert!(total > 0, "total memory is zero");
    assert!(
        free <= total,
        "free memory {free} is above the total {total}"
    );
}

#[test]
fn the_host_reports_a_kernel_release() {
    let release = host().release();
    assert!(!release.trim().is_empty(), "the release is empty");
}

#[test]
fn the_three_environment_facts_are_the_ones_handed_in_and_nothing_else() {
    // The default env says none of them is set; the crate reads no variable of its own.
    let none = host();
    assert_eq!(none.flatpak_id(), None);
    assert_eq!(none.appimage(), None);
    assert!(!none.steam_deck_game_mode());
    let set = RealHostFacts::new(HostEnv {
        flatpak_id: Some("org.example.App".to_string()),
        appimage: Some("/tmp/x.AppImage".to_string()),
        steam_deck_game_mode: true,
    });
    assert_eq!(set.flatpak_id().as_deref(), Some("org.example.App"));
    assert_eq!(set.appimage().as_deref(), Some("/tmp/x.AppImage"));
    assert!(set.steam_deck_game_mode());
}

#[test]
fn a_missing_os_release_file_is_none_and_the_known_paths_are_read_cleanly() {
    let facts = host();
    assert_eq!(
        facts.read_os_release("/definitely/not/an/os-release-file"),
        None
    );
    // Each of the three locations either holds text or is absent; reading one never panics or errors.
    for path in OS_RELEASE_PATHS {
        let _ = facts.read_os_release(path);
    }
}

/// On Linux the operating-system probe finds the os-release file at one of its three paths or answers
/// the TS's "Unknown Linux Distribution"; either way it names the system.
#[cfg(target_os = "linux")]
#[test]
fn the_linux_os_probe_names_the_system_from_a_real_os_release_or_the_fallback() {
    use std::sync::Arc;

    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform};
    use gamelib_info::http::ReqwestHttp;
    use gamelib_info::sysinfo::os_info::get_os_info;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;

    let home = FakeHome::new("info-sysinfo-host-");
    let user_data = home.root().join("userData");
    let ctx = InfoCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        Platform::Linux,
        InfoPaths {
            app_folder: user_data.clone(),
            user_data,
            temp: home.root().join("temp"),
            public_dir: None,
        },
        "0.0.0-test".to_string(),
        Shutdown::new(),
        Arc::new(ReqwestHttp::new()),
    );
    let facts = host();
    let found = OS_RELEASE_PATHS
        .iter()
        .any(|path| facts.read_os_release(path).is_some());
    let runtime = tokio::runtime::Builder::new_current_thread()
        .build()
        .expect("runtime");
    let os = runtime
        .block_on(get_os_info(&ctx, &facts))
        .expect("the Linux probe spawns nothing and cannot fail");
    assert!(!os.name.trim().is_empty());
    if !found {
        assert_eq!(os.name, "Unknown Linux Distribution");
    }
}
