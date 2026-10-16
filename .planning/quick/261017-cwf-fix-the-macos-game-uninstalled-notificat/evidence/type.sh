#!/bin/bash
set -e
SD=/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/0153252e-55df-4b23-b787-c481ad33a6ca/scratchpad
LINE="$1"
osascript -e 'tell application "System Events" to set frontmost of process "gamelib-shell" to true' >/dev/null
perl -e 'select(undef,undef,undef,0.5)'
front=$(osascript -e 'tell application "System Events" to get name of first process whose frontmost is true')
[ "$front" = "gamelib-shell" ] || { echo "NOT FRONTMOST: $front" >&2; exit 3; }
"$SD/click" "$PROMPT_X" "$PROMPT_Y" >/dev/null
perl -e 'select(undef,undef,undef,0.4)'
osascript - "$LINE" <<'EOS'
on run argv
  set theLine to item 1 of argv
  tell application "System Events"
    keystroke theLine
    delay 0.3
    key code 36
  end tell
end run
EOS
echo "typed at $PROMPT_X,$PROMPT_Y: $LINE"
