#!/bin/zsh
# 1 s poll: probe status + move progress + where WazHack's ACF and files are.
# Usage: PROBE=<bin> ./watch.sh <appId> <seconds> >> watch.jsonl
app=$1; n=${2:-90}
A="$HOME/Library/Application Support/Steam/steamapps"
B="$HOME/GameLibParity/SteamLibrary/steamapps/steamapps"
for i in $(seq 1 $n); do
  s=$($PROBE status $app 2>/dev/null | head -1)
  p=$($PROBE progress $app 2>/dev/null | head -1)
  a=$([ -f "$A/appmanifest_$app.acf" ] && echo 1 || echo 0)
  b=$([ -f "$B/appmanifest_$app.acf" ] && echo 1 || echo 0)
  da=$(du -sk "$A/common/WazHack" 2>/dev/null | cut -f1); db=$(du -sk "$B/common/WazHack" 2>/dev/null | cut -f1)
  echo "{\"ts\":\"$(date -u +%FT%T)\",\"acfMain\":$a,\"acfSecond\":$b,\"kbMain\":${da:-0},\"kbSecond\":${db:-0},\"status\":${s:-null},\"progress\":${p:-null}}"
  sleep 1
done
