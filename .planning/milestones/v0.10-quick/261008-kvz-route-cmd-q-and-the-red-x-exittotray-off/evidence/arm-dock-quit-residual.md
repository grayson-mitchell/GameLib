# Optional residual - Dock Quit, lock ARMED (launch L6, fix binary, pid 24868)
gesture 18:40:46: System Events on process Dock: AXShowMenu on the gamelib-shell tile, then menu item Quit
observed: NO confirm panel at any poll; shell and sidecar gone; shell log has NO 'quit (...)' routing line and NO 'exit requested' line; gamelib.log has NO sidecar marker (the sidecar never saw a quit frame)
dev log tail:
    [sidecar:err] [storeWriteHandlers] storeNew ignored renderer-supplied options for 'nile_library' — using the hardcoded c
    [sidecar:err] [sidecar/handlers] no live store instance for 'gog_api_info' — returning {}
    [shell] sidecar terminated on exit

    ps before:
    24628 24612 24573 sh -c node meta/tauriDevPreflight.cjs && pnpm build:sidecar && pnpm build:decompress-worker-
    24687 24628 24573 node /Users/graysonmitchell/Projects/GameLib/node_modules/.bin/tauri dev
    24868 24687 24573 target/debug/gamelib-shell
    24902 24868 24902 /Users/graysonmitchell/.nvm/versions/node/v26.2.0/bin/node /Users/graysonmitchell/Projects/G
    ps after:
    shell log:
    gamelib.log:

RESULT: RESIDUAL CONFIRMED (Dock Quit still bypasses the confirm via terminate:) - measured, not source-derived only
