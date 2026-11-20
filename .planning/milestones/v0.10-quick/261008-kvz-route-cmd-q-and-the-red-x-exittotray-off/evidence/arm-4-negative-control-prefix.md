# Arm 4 - NEGATIVE CONTROL: Cmd+Q on the PRE-FIX binary (BASE f79d3a27c main.rs), lock ARMED, exitToTray true (launch L7, pid 25528)
build identity: dev-L7-negative-control.log has the OLD stderr line 'exitToTray: close handler attached; the setting is re-read on every close'; the post-fix 'app menu: Quit (Cmd+Q) routed' line is ABSENT for this pid (grep count 0 in gamelib-shell.log)
gesture 18:42:55: keystroke Cmd+Q (frontmost == 25528)
observed: shell and sidecar gone in 0.45s; confirm panel NEVER appeared (CGWindowList polled every 0.25s); NO 'quit (Cmd+Q)' line; NO 'exit requested' line; NO sidecar marker; gamelib.log empty for the window

    ps before:
    25293 25278 25245 sh -c node meta/tauriDevPreflight.cjs && pnpm build:sidecar && pnpm build:decompress-worker-
    25353 25293 25245 node /Users/graysonmitchell/Projects/GameLib/node_modules/.bin/tauri dev
    25528 25353 25245 target/debug/gamelib-shell
    25617 25528 25617 /Users/graysonmitchell/.nvm/versions/node/v26.2.0/bin/node /Users/graysonmitchell/Projects/G
    ps after:
    shell log since mark:
    gamelib.log since mark:
    dev log tail:
    [sidecar:err] [storeWriteHandlers] storeNew ignored renderer-supplied options for 'steam_library' — using the hardcoded 
    [sidecar:err] [storeWriteHandlers] storeNew ignored renderer-supplied options for 'nile_library' — using the hardcoded c
    [sidecar:err] [sidecar/handlers] no live store instance for 'gog_api_info' — returning {}
    [shell] sidecar terminated on exit

RESULT: PASS (bypass reproduced on the pre-fix binary under the identical arm)
Source restore: cp from scratchpad snapshot of the committed fix; git diff --quiet -- src-tauri exits 0.
