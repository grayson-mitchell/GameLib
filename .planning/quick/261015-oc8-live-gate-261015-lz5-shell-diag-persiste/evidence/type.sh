#!/bin/bash
# type.sh "<js line>" -- asserts gamelib-shell frontmost, clicks the UNDOCKED Web Inspector
# window's console prompt (bottom-left), types the line, Return.
set -e
SD=/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/2d36cfcb-a5f7-4560-a0ea-d9acb2791def/scratchpad
LINE="$1"
osascript -e 'tell application "System Events" to set frontmost of process "gamelib-shell" to true' >/dev/null
sleep 0.4
read -r WID PID OWNER X Y W H REST < <("$SD/winlist" gamelib | grep 'Web Inspector' | head -1)
[ -n "$WID" ] || { echo "no inspector window" >&2; exit 4; }
px=$((X + 60)); py=$((Y + H - 18))
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
echo "typed into inspector $WID (pid $PID) at $px,$py: $LINE"
