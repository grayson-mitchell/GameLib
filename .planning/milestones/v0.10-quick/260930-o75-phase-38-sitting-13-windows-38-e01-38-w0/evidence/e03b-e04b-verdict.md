# 38-E03 branch (b) and 38-E04 branch (b), Windows WebView2: sitting 13, 2026-09-30

Both are scored on the spike 027 feasibility harness, NOT the shipped app. `src-tauri/Cargo.toml`
target-gates `unstable` to macOS and Linux, so GameLib's own Windows build compiles no embed. Both
items STAY OPEN for their branch (a), other macOS displays and hardware, and their branch (c), the
unbuilt GTK-box-native Linux layout.

## Harness changes made this sitting (after 38-E01 was scored on the unmodified source)

1. **Slot sync:** `dist/index.html`'s ResizeObserver handler was ported from a pure trailing
   debounce (`clearTimeout` + restart, 40 ms) to the shipped app's `useStoreEmbedHost.ts`
   `scheduleFlush`: a leading-edge throttle with a trailing flush, interval still 40 ms. The old
   form is the exact defect plan 40-11's live gate found. Measuring drag latency against it would
   measure the harness.
2. **Async command wrappers:** from the panel, `create_embed` hung on Windows. The log showed
   `[embed] add_child` with no `OK`/`FAILED`, while the window kept pumping messages
   (`Responding=True`). Both it and `create_multi_window` were SYNC `#[tauri::command]`s, which run
   on the main thread, and Tauri documents creating webviews from sync commands as a Windows
   deadlock. The bodies became `create_embed_impl`/`create_multi_window_impl`, which the autorun
   still calls through `run_on_main_thread` exactly as in E01, and `async` commands under the
   original names wrap them. **Relevance to GameLib:** the shipped `store_embed_open`
   (`main.rs`, macOS/Linux only today) is not a Tauri command. It is reached through the sidecar
   RPC dispatch, so it does not have this shape. A future Windows un-gating must keep it that way:
   never create the embed from inside a sync command.

## 38-E04 (b): drag-resize latency, at 1.25. **PASS**

Interactive run: the operator created a Steam-store embed from the panel, then drag-resized the
window corner for about 8.4 s (`e04b-hwnd/hwnd-samples.jsonl`, sampler `-NoShots`, measured cadence
median 28 ms).

- **Operator (the item's own wording):** "kept up fine, no tearing or spilling".
- **M1, tracking:** 187 embed-rect updates during the drag. The inter-update gap had a median of
  **43 ms**, a p90 of 61 ms and a max of 245 ms (a single outlier). That is the 40 ms throttle
  plus IPC, and there was no debounce-style stall.
- **M2, settle:** 0 ms at sampler resolution. The final embed rect landed within one sample of the
  last client-size change.
- **M3, overflow:** 47 of 334 samples show the container past the client edge by up to 32 px, all
  transient during shrinking. The operator did not see it, so it is not scored as a visible
  artefact, per the pre-registration.
- **Limit:** the sampler cannot see sub-28 ms frames. The operator's eyes cover those, and they
  reported none.

## 38-E03 (b): HiDPI at scale_factor 2.0. **PASS**

The operator set the single 3440×1440 display to 200% (1720×720 logical). The autorun ran with
screenshots (`e03b-*`).

- **H1:** the API `scaleFactor` read 2.0 (6 readbacks) and the window DPI 192.
- **H2:** the OS container rects at 1a `580,192 1520×1120`, 4a `580,192 1800×1400` (bottom clipped
  by the 1399-px client, recorded) and 4b `20,800 800×600` are all EXACTLY the logical rect ×2,
  with 0 px error. 4c fractional `581,193 1521×1122` equals ×2 rounded half up. With the throttle,
  4c was not overwritten this time.
- **H3:** the slot sync landed the container at `564,112`, the slot's logical 282,56 ×2.
- **H4:** at 1:1 (`e03b-hwnd/e03b-4b-crop-1to1.png`) the embed's text is rendered at device
  resolution, as sharp as the host panel's text, with no ×2 upscale blur. The embed's top-left
  corner is exactly at 20,800. The Windows taskbar overlaps the window bottom only because the
  900-logical-px window no longer fits a 720-px screen; that is not an embed artefact.
- **Hide/show/destroy and probe B** behaved as at 1.25.
- **Not covered:** mixed-DPI multi-monitor setups and external displays. This host has one
  display.
- **Recurrence:** the probe-B slot anomaly E01 recorded reproduced at 2.0 (`564,181 22×602`, left
  edge = slot x ×2). That strengthens, but does not prove, the "panel slot sync reads a momentary
  layout" explanation.
