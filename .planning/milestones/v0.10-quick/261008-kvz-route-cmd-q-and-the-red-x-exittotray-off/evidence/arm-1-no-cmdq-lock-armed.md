# Arm 1-No - Cmd+Q, lock ARMED, exitToTray false (launch L2, fix binary, pid 19258)
gesture 18:33:46 NZDT: System Events keystroke q using command down, frontmost pid asserted == 19258
armed: GamesConfig/lock present (isLocked disjunct, not a running download)
shell log: 1791437626 pid=19258 quit (Cmd+Q): handed to the sidecar handleExit
gamelib.log: (18:33:46) [GAMELIB_SIDECAR_SEND_HANDLER] quit
panel: CGWindowList win=63134 owner=UserNotificationCenter(pid 2555) layer=8 onscreen=1 260x218pt; window-scoped capture arm-1-no-confirm-panel.png (pending-operations text, NO highlighted default)
answer: 18:34:21 keystroke Return (frontmost pid == 19258); panel gone within 0.5s
after: shell 19258 and sidecar 19301 alive; main window win=63102 onscreen=1; lock present; zero 'Trying to kill' lines in gamelib.log since the gesture

Note: earlier on launch L1 the same Cmd+Q gesture produced the same panel (CGWindowList + capture) but the No answer could not be delivered (screen locked / focus held by another app); that attempt is not scored.
