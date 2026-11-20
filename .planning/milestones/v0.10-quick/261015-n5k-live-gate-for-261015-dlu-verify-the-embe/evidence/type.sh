#!/bin/bash
# type.sh "<js line>"  -- asserts gamelib-shell is frontmost, clicks the Web Inspector console
# prompt (bottom-left of the window, inspector docked at the bottom), types the line, Return.
set -e
SD=/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/f496c457-5feb-4de4-817b-51e266d6fdd1/scratchpad
LINE="$1"
PROMPT_DX="${PROMPT_DX:-60}"
PROMPT_DY="${PROMPT_DY:-18}"   # from the window's bottom edge
osascript -e 'tell application "System Events" to set frontmost of process "gamelib-shell" to true' >/dev/null
sleep 0.4
front=$(osascript -e 'tell application "System Events" to get name of first process whose frontmost is true')
[ "$front" = "gamelib-shell" ] || { echo "NOT FRONTMOST: $front" >&2; exit 3; }
read -r WID PID OWNER X Y W H REST < <("$SD/winlist" gamelib | awk '$7>300{print; exit}')
[ -n "$WID" ] || { echo "no window" >&2; exit 4; }
px=$((X + PROMPT_DX)); py=$((Y + H - PROMPT_DY))
"$SD/click" "$px" "$py" >/dev/null
sleep 0.3
front=$(osascript -e 'tell application "System Events" to get name of first process whose frontmost is true')
[ "$front" = "gamelib-shell" ] || { echo "LOST FOCUS: $front" >&2; exit 3; }
osascript - "$LINE" <<'EOF'
on run argv
  set theLine to item 1 of argv
  tell application "System Events"
    keystroke theLine
    delay 0.2
    key code 36
  end tell
end run
EOF
echo "typed into $WID at $px,$py: $LINE"
