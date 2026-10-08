# Arm 3b - red X, NOTHING pending (lock absent), exitToTray false (launch L5, fix binary, pid 24288)
gesture 18:39:41: AX click AXCloseButton (frontmost == 24288). Polled CGWindowList every 0.25s: no confirm panel ever appeared.
timing: gesture -> shell pid gone in 0.71s

    ps before:
    24050 24035 23996 sh -c node meta/tauriDevPreflight.cjs && pnpm build:sidecar && pnpm build:decompress-worker-
    24109 24050 23996 node /Users/graysonmitchell/Projects/GameLib/node_modules/.bin/tauri dev
    24288 24109 23996 target/debug/gamelib-shell
    24326 24288 24326 /Users/graysonmitchell/.nvm/versions/node/v26.2.0/bin/node /Users/graysonmitchell/Projects/G
    ps after:
    shell log:
    1791437981 pid=24288 quit (window close): handed to the sidecar handleExit
    1791437982 pid=24288 exit requested (code=Some(0))
    gamelib.log:
    (18:39:41) [INFO]:    [Backend]:         [GAMELIB_SIDECAR_SEND_HANDLER] quit
    (18:39:42) [INFO]:    [Gog]:             GOG presence deleted

RESULT: PASS
