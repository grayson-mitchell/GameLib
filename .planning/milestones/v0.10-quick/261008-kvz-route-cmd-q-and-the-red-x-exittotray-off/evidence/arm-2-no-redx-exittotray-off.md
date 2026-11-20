# Arm 2-No - red X, exitToTray OFF, lock ARMED (launch L2, fix binary, pid 19258)
gesture 18:32:14 NZDT: AX click AXCloseButton, frontmost pid asserted == 19258
armed: GamesConfig/lock present (isLocked disjunct, NOT a running download); config.json has exitToTray=false
observed: shell line '1791437535 pid=19258 quit (window close): handed to the sidecar handleExit'; gamelib.log '(18:32:15) [GAMELIB_SIDECAR_SEND_HANDLER] quit'
panel: CGWindowList win=63128 owner=UserNotificationCenter(pid 2555) layer=8 onscreen=1 260x218pt at (626,183) -> window-scoped capture arm-2-no-confirm-panel.png (text 'There are pending operations, are you sure?', title Exit, NO is the highlighted default)
answer: 18:32:44 keystroke Return with frontmost pid == 19258. 3s later a panel was still listed; by 18:33:00 it was gone (my follow-up mouse click found no panel and was NOT delivered).
after (18:33+): shell 19258 alive, sidecar 19301 ppid=19258 alive, main window win=63102 onscreen=1 (1280x800 at 116,65) -- window NOT hidden, lock still present, gamelib.log has no 'Trying to kill' lines since the gesture
shellpid=19258
sidecar: 19301 ppid=19258
main-window: win=63102 layer=0 onscreen=1 x=116 y=65 w=1280 h=800 name=GameLib
lock: /Users/graysonmitchell/Library/Application Support/gamelib/GamesConfig/lock
panel: []

## Clean repeat 18:34:41 (same launch L2, exitToTray=false, lock armed)
gesture: AX click AXCloseButton (frontmost == 19258); shell line '1791437682 pid=19258 quit (window close): handed to the sidecar handleExit'
panel: win=63138 owner=UserNotificationCenter onscreen=1 260x218pt (same panel as arm-2-no-confirm-panel.png); main window win=63102 stayed onscreen=1 while the panel was up
answer: 18:34:43 Return (frontmost == 19258) -> panel gone within 0.5s
after: shell 19258, sidecar 19301 alive; main window win=63102 onscreen=1 (the close was prevented before the hand-off); zero 'Trying to kill' lines
RESULT: PASS
