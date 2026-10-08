# Arm 3a - Cmd+Q, NOTHING pending (lock absent), exitToTray false (launch L4, fix binary, pid 23708)
gesture 18:38:43: keystroke Cmd+Q (frontmost == 23708). Polled CGWindowList every 0.25s: no confirm panel ever appeared.
timing: gesture -> shell pid gone in 0.76s

    ps before:
    23471 23456 23417 sh -c node meta/tauriDevPreflight.cjs && pnpm build:sidecar && pnpm build:decompress-worker-
    23529 23471 23417 node /Users/graysonmitchell/Projects/GameLib/node_modules/.bin/tauri dev
    23708 23529 23417 target/debug/gamelib-shell
    23748 23708 23748 /Users/graysonmitchell/.nvm/versions/node/v26.2.0/bin/node /Users/graysonmitchell/Projects/G
    ps after:
    shell log:
    1791437923 pid=23708 quit (Cmd+Q): handed to the sidecar handleExit
    1791437923 pid=23708 exit requested (code=Some(0))
    gamelib.log:
    (18:38:43) [INFO]:    [Backend]:         [GAMELIB_SIDECAR_SEND_HANDLER] quit
    (18:38:43) [INFO]:    [Gog]:             GOG presence deleted
    dev log tail:
    [shell] quit (Cmd+Q): handed to the sidecar handleExit
    [shell] exit requested (code=Some(0))
    [shell] sidecar terminated on exit

RESULT: PASS (shell line + sidecar marker + 'exit requested (code=Some(0))'; no alert)
