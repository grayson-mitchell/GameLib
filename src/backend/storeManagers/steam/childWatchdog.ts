/**
 * quick 261105-svg: parent-death watchdog for the Steam download monitor's script/nettop child.
 *
 * A hard-killed sidecar (SIGKILL, Force Quit) skips both the Node stop paths and the Rust
 * shutdown_child, which left an orphaned nettop idling for days (field: nettop ppid 1, no
 * `script` parent, most likely because script died of SIGPIPE writing to the dead sidecar's pipe
 * and reparented nettop to launchd). Killing script alone would therefore miss nettop, so the
 * watchdog records the inner process's children on every tick and kills those too.
 *
 * The parent pid is passed explicitly and polled with `kill -0`. `$PPID` is never used: it stays
 * frozen at its start-time value after the parent dies and sh is reparented.
 *
 * Accepted risk: a kill aimed at a recycled pid is possible inside one 1s tick after the recorded
 * process exits. macOS pids increment and the kill is same-uid only, so this is negligible.
 *
 * The program is a constant. Pids and the inner argv travel as positional parameters ($1, $2,
 * "$@") and are never interpolated into the script string.
 */
export const WATCHDOG_SH = `p=$1; w=$2; shift 2
"$@" &
m=$!
g=
s=
cleanup() {
  c=$(pgrep -P "$m" 2>/dev/null)
  [ -n "$c" ] && g=$c
  [ -n "$s" ] && kill "$s" 2>/dev/null
  [ -n "$g" ] && kill $g 2>/dev/null
  kill "$m" 2>/dev/null
  exit 0
}
trap cleanup TERM INT HUP
while kill -0 "$p" 2>/dev/null && kill -0 "$m" 2>/dev/null && kill -0 "$w" 2>/dev/null; do
  c=$(pgrep -P "$m" 2>/dev/null)
  [ -n "$c" ] && g=$c
  sleep 1 &
  s=$!
  wait "$s"
done
cleanup
`

export function buildWatchdogSpawn(
  parentPid: number,
  watchPid: number,
  inner: string[]
): { file: string; args: string[] } {
  return {
    file: '/bin/sh',
    args: [
      '-c',
      WATCHDOG_SH,
      'gamelib-watchdog',
      String(parentPid),
      String(watchPid),
      ...inner
    ]
  }
}
