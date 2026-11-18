//! The `steamClientProcess.ts` probe and parser cases (moved from tests/hold.rs, Phase 81 D-11).

use gamelib_steampoll::host::RunOutput;
use gamelib_steampoll::profile::Platform;
use gamelib_steampoll::steam_process::*;
use gamelib_steampoll::testing::ScriptedRunner;
use std::collections::HashMap;

const PGREP: &str = "/usr/bin/pgrep -x steam_osx";

fn out(code: i32, stdout: &str) -> RunOutput {
    RunOutput {
        code: Some(code),
        stdout: stdout.into(),
        stderr: String::new(),
    }
}

fn tokens(pairs: &[(u32, &str)]) -> HashMap<u32, String> {
    pairs.iter().map(|(p, t)| (*p, t.to_string())).collect()
}

#[test]
fn parses_tasklist_rows() {
    assert_eq!(
        parse_tasklist_steam_pids("\"steam.exe\",\"4812\",\"Console\",\"1\",\"1 K\"\r\n"),
        vec![4812]
    );
    assert_eq!(
        parse_tasklist_steam_pids("\"STEAM.EXE\",\"1\"\n\"steam.exe\",\"22\"\n"),
        vec![1, 22]
    );
    assert!(parse_tasklist_steam_pids(
        "INFO: No tasks are running which match the specified criteria.\n\"steamwebhelper.exe\",\"9\"\n\"steamservice.exe\",\"8\"\n"
    )
    .is_empty());
    assert!(parse_tasklist_steam_pids("\"steam.exe\",\"abc\"\n\"steam.exe\",\"0\"\n").is_empty());
}

#[test]
fn parses_pgrep_and_pid_token_lines() {
    assert_eq!(parse_pgrep_pids("111\n 222 \n\nabc\n0\n"), vec![111, 222]);
    let m =
        parse_pid_token_lines("111 Mon Nov  2 10:00:00 2026\n  222   638000000000000000\nnoise\n");
    assert_eq!(m[&111], "Mon Nov 2 10:00:00 2026");
    assert_eq!(m[&222], "638000000000000000");
    assert_eq!(m.len(), 2);
}

#[tokio::test]
async fn pgrep_codes_map_to_pids_empty_or_unknown() {
    let r = ScriptedRunner::default();
    r.on(PGREP, vec![out(0, "30\n10\n")]);
    assert_eq!(
        list_steam_client_pids(&r, Platform::Darwin).await,
        Some(vec![30, 10])
    );
    r.on(PGREP, vec![out(1, "")]);
    assert_eq!(
        list_steam_client_pids(&r, Platform::Darwin).await,
        Some(vec![])
    );
    r.on(PGREP, vec![out(2, "")]);
    assert_eq!(list_steam_client_pids(&r, Platform::Darwin).await, None);
    // A spawn failure or timeout carries no exit code.
    r.on(PGREP, vec![RunOutput::default()]);
    assert_eq!(list_steam_client_pids(&r, Platform::Darwin).await, None);
    r.on("pgrep -x steam", vec![out(0, "5\n")]);
    assert_eq!(
        list_steam_client_pids(&r, Platform::Linux).await,
        Some(vec![5])
    );
}

#[tokio::test]
async fn start_tokens_probe_by_platform() {
    let r = ScriptedRunner::default();
    assert_eq!(
        read_steam_process_start_tokens(&r, Platform::Darwin, &[]).await,
        Some(HashMap::new())
    );
    assert!(r.calls().is_empty(), "no spawn for an empty pid list");
    assert_eq!(
        read_steam_process_start_tokens(&r, Platform::Darwin, &[0]).await,
        Some(HashMap::new())
    );

    r.on(
        "/bin/ps -o pid=,lstart= -p 111,222",
        vec![out(0, "111 T1\n333 other\n")],
    );
    let t = read_steam_process_start_tokens(&r, Platform::Darwin, &[111, 222])
        .await
        .unwrap();
    assert_eq!(t, tokens(&[(111, "T1")]), "only asked-for pids appear");

    r.on("ps -o pid=,lstart= -p 5", vec![out(1, "")]);
    assert_eq!(
        read_steam_process_start_tokens(&r, Platform::Linux, &[5]).await,
        Some(HashMap::new())
    );
    r.on("ps -o pid=,lstart= -p 6", vec![out(3, "")]);
    assert_eq!(
        read_steam_process_start_tokens(&r, Platform::Linux, &[6]).await,
        None
    );
}
