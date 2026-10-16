#!/bin/bash
# type.sh "<js line>" -- focus gamelib-shell, click the inspector console prompt, type the line, Return.
# PROMPT_X / PROMPT_Y are absolute screen coords of the console prompt (set after locating the inspector).
set -e
SD=/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/28ad5abc-4e9c-4608-8145-b83ca52bbab1/scratchpad
LINE="$1"
osascript -e 'tell application "System Events" to set frontmost of process "gamelib-shell" to true' >/dev/null
sleep 0.4
front=$(osascript -e 'tell application "System Events" to get name of first process whose frontmost is true')
[ "$front" = "gamelib-shell" ] || { echo "NOT FRONTMOST: $front" >&2; exit 3; }
"$SD/click" "$PROMPT_X" "$PROMPT_Y" >/dev/null
sleep 0.3
osascript - "$LINE" <<'EOS'
on run argv
  set theLine to item 1 of argv
  tell application "System Events"
    keystroke theLine
    delay 0.2
    key code 36
  end tell
end run
EOS
echo "typed at $PROMPT_X,$PROMPT_Y: $LINE"
