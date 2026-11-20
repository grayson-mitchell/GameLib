# Arm 1-Yes - Cmd+Q, lock ARMED, answer Yes (launch L2, fix binary, pid 19258)
gesture 18:35:51: keystroke Cmd+Q (frontmost == 19258); panel win=63153 owner=UserNotificationCenter onscreen=1 (capture arm-1-yes-confirm-panel.png)
answer 18:36:06: CGEvent mouse click on YES at global (697,371.5) computed from panel bounds (626,183)+(71,188.5)pt
exit: shell gone ~1s after the click; sidecar gone too

    ps before:
    19000 18985 18949 sh -c node meta/tauriDevPreflight.cjs && pnpm build:sidecar && pnpm build:decompress-worker-
    19081 19000 18949 node /Users/graysonmitchell/Projects/GameLib/node_modules/.bin/tauri dev
    19258 19081 18949 target/debug/gamelib-shell
    19301 19258 19301 /Users/graysonmitchell/.nvm/versions/node/v26.2.0/bin/node /Users/graysonmitchell/Projects/G
    ps after:
    shell log:
    1791437751 pid=19258 quit (Cmd+Q): handed to the sidecar handleExit
    1791437767 pid=19258 exit requested (code=Some(0))
    gamelib.log:
    (18:35:51) [INFO]:    [Backend]:         [GAMELIB_SIDECAR_SEND_HANDLER] quit
    (18:36:06) [INFO]:    [Backend]:         Trying to kill legendary
    (18:36:06) [INFO]:    [Backend]:         Killed legendary
    (18:36:06) [INFO]:    [Backend]:         Trying to kill gogdl
    (18:36:06) [INFO]:    [Backend]:         Killed nile
    (18:36:06) [INFO]:    [Backend]:         Killed gogdl
    (18:36:06) [INFO]:    [Backend]:         Trying to kill nile
    (18:36:07) [INFO]:    [Gog]:             GOG presence deleted
    dev log tail:
    [shell] quit (tray Quit): handed to the sidecar handleExit
    [shell] quit (Cmd+Q): handed to the sidecar handleExit
    [shell] exit requested (code=Some(0))
    [shell] sidecar terminated on exit
    panel: []

Lines proving routing: 'quit (Cmd+Q): handed to the sidecar handleExit', sidecar marker, then Yes branch 'Trying to kill ...' + 'GOG presence deleted', 'exit requested (code=Some(0))' (app.exit(0) from app_exit, NOT terminate:), and the dev-log reap line 'sidecar terminated on exit'.
RESULT: PASS
