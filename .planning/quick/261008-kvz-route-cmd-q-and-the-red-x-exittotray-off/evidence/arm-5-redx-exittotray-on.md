# Arm 5 - red X, exitToTray ON, lock ARMED (launch L1, fix binary, pid 14613)
time: 2026-10-08 15:31:12 NZDT
gesture: AX click AXCloseButton of window 1, frontmost pid asserted == 14613
armed: GamesConfig/lock present (isLocked disjunct), exitToTray=true (config.json count of '"exitToTray": true' = 1)

## ps after gesture
14378 14359 14313 sh -c node meta/tauriDevPreflight.cjs && pnpm build:sidecar && pnpm build:decompress-worker-dev && tauri dev
14436 14378 14313 node /Users/graysonmitchell/Projects/GameLib/node_modules/.bin/tauri dev
14613 14436 14313 target/debug/gamelib-shell
14735 14613 14735 /Users/graysonmitchell/.nvm/versions/node/v26.2.0/bin/node /Users/graysonmitchell/Projects/GameLib/src-tauri/../build/main/sidecar.js

## CGWindowList (pid 14613, >=60pt tall)
win=62655 layer=0 onscreen=0 x=132 y=361 w=1280 h=800 name=GameLib

## shell log lines since mark
(end)
## quit (window close) lines: 0
