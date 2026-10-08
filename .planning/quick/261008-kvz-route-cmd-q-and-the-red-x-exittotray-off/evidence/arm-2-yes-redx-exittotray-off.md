# Arm 2-Yes - red X, exitToTray OFF, lock ARMED, answer Yes (launch L3, fix binary, pid 22995)
gesture 18:37:38: AX click AXCloseButton (frontmost == 22995); panel win=63168 (capture arm-2-yes-confirm-panel.png); main window win=63157 onscreen=1 while the panel was up
answer 18:37:41: CGEvent click on YES at (697,371.5) from panel bounds
exit: shell and sidecar gone within ~4s (ps after is empty)

    ps before:
    22760 22745 22705 sh -c node meta/tauriDevPreflight.cjs && pnpm build:sidecar && pnpm build:decompress-worker-
    22820 22760 22705 node /Users/graysonmitchell/Projects/GameLib/node_modules/.bin/tauri dev
    22995 22820 22705 target/debug/gamelib-shell
    23038 22995 23038 /Users/graysonmitchell/.nvm/versions/node/v26.2.0/bin/node /Users/graysonmitchell/Projects/G
    ps after:
    shell log:
    1791437858 pid=22995 quit (window close): handed to the sidecar handleExit
    1791437862 pid=22995 exit requested (code=Some(0))
    gamelib.log:
    (18:37:38) [INFO]:    [Backend]:         [GAMELIB_SIDECAR_SEND_HANDLER] quit
    (18:37:41) [INFO]:    [Backend]:         Killed legendary
    (18:37:41) [INFO]:    [Backend]:         Trying to kill gogdl
    (18:37:41) [INFO]:    [Backend]:         Killed gogdl
    (18:37:41) [INFO]:    [Backend]:         Trying to kill nile
    (18:37:41) [INFO]:    [Backend]:         Trying to kill legendary
    (18:37:41) [INFO]:    [Backend]:         Killed nile
    (18:37:42) [INFO]:    [Gog]:             GOG presence deleted
    dev log tail:
    [shell] quit (window close): handed to the sidecar handleExit
    [shell] exit requested (code=Some(0))
    [shell] sidecar terminated on exit

Proof of route: 'quit (window close): handed to the sidecar handleExit', sidecar marker, Yes-branch kill lines, 'exit requested (code=Some(0))', 'sidecar terminated on exit'.
RESULT: PASS
