#!/bin/bash
# Poll app-manager status + ACF fields every 2 s into watch.jsonl; mirror new content_log lines.
APP=${1:-333300}
P=${PROBE:?set PROBE to the compiled probe}
SC="$HOME/Library/Application Support/Steam"
ACF="$SC/steamapps/appmanifest_$APP.acf"
DIR=$(cd "$(dirname "$0")" && pwd)
tail -n0 -F "$SC/logs/content_log.txt" >> "$DIR/content_log.txt" 2>/dev/null &
TP=$!
trap 'kill $TP' EXIT
while true; do
  s=$("$P" status "$APP" | grep '"step":"status"')
  a=$(grep -E '"(StateFlags|buildid|TargetBuildID|BytesToDownload|BytesDownloaded|UpdateResult|AutoUpdateBehavior|BetaKey)"' "$ACF" 2>/dev/null | tr -s '\t' ' ' | tr -d '"' | tr '\n' ';')
  echo "{\"t\":\"$(date -u +%FT%TZ)\",\"acf\":\"$a\",\"s\":$s}" >> "$DIR/watch.jsonl"
  sleep 2
done
