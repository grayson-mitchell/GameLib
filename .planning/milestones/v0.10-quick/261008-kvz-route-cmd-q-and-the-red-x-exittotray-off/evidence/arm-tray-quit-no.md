# Optional - tray Quit, lock ARMED, exitToTray false (launch L2, pid 19258)
gesture 18:35:08: AX click menu bar item 1 of menu bar 2, then menu item Quit (frontmost == 19258)
shell log: 1791437711 pid=19258 quit (tray Quit): handed to the sidecar handleExit
panel: win=63147 owner=UserNotificationCenter onscreen=1; capture arm-tray-quit-confirm-panel.png
answer 18:35:27 Return -> gone <=0.5s; shell+sidecar alive, main window win=63102 onscreen=1, zero kill lines
RESULT: PASS (first live observation of the 2026-10-05 tray fix)
