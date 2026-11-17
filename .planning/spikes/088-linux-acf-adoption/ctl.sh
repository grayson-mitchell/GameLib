#!/usr/bin/env bash
# usage: ctl.sh status|remove|write 4|write 1026|restore|quit|start|url-exit|url-run
APP=${APP:-1628350}
S=$HOME/.steam/debian-installation
ACF=$S/steamapps/appmanifest_$APP.acf
D=$(cd "$(dirname "$0")" && pwd)
case "$1" in
  status) pgrep -xa steam; ls -l --time-style=full-iso "$ACF" 2>&1; grep -E 'StateFlags|LauncherPath' "$ACF" 2>&1;;
  remove) [ -f "$D/backup/appmanifest_$APP.acf" ] || cp -p "$ACF" "$D/backup/"; mv "$ACF" "$D/out/appmanifest_$APP.$(date +%H%M%S).acf";;
  write) # atomic tmp+rename like production; field set = Steam's own minus Steam-only keys
    cp "$D/backup/appmanifest_$APP.acf" "$ACF.tmp"
    if [ "$2" = 1026 ]; then sed -i 's/"StateFlags"\t\t"4"/"StateFlags"\t\t"1026"/' "$ACF.tmp"; fi
    mv "$ACF.tmp" "$ACF"; touch "$ACF"; grep StateFlags "$ACF";;
  restore) cp -p "$D/backup/appmanifest_$APP.acf" "$ACF";;
  quit) steam -shutdown;;
  start) nohup steam >/dev/null 2>&1 & ;;
  url-exit) xdg-open steam://exit;;
  url-run) xdg-open steam://rungameid/$APP;;
esac
