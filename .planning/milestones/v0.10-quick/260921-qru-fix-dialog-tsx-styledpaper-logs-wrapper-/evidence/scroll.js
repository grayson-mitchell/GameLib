// Corrective probe. My earlier run measured `.settingsDialogContent` and the
// Paper, and concluded log content "spills past the dialog and nothing
// scrolls". The structural dump showed `.settingsDialogContent` is NOT the
// Paper's child -- MUI's own `MuiDialogContent-root` sits between them and is
// the actual scroll container. A child's getBoundingClientRect() inside a
// scrollport legitimately extends past it; that is scrollable overflow, not
// clipped content.
//
// This probe tests the thing that actually matters to a user: can the bottom of
// the log content be REACHED by scrolling?
const out = { viewport: { w: window.innerWidth, h: window.innerHeight } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const px = (n) => Math.round(n * 100) / 100;

try {
  const mod = await import('/src/frontend/state/GlobalStateV2.ts');
  const gameInfo = {
    app_name: '260921-qru-probe', title: 'Probe Game', runner: 'sideload',
    install: { platform: 'Mac', install_path: '/tmp/probe' }, is_installed: true,
    art_cover: '', art_square: '', canRunOffline: true, cloud_save_enabled: false,
    namespace: '', developer: '',
    extra: { about: { description: '', shortDescription: '' }, reqs: [] },
    folder_name: '', save_folder: '', is_mac_native: true, is_linux_native: false
  };
  mod.default.setState({ settingsModalProps: { isOpen: true, type: 'log', gameInfo } });

  let paper = null;
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    await sleep(150);
    const c = document.querySelector('.MuiDialog-paper');
    if (c && c.querySelector('.logs-wrapper')) { paper = c; break; }
  }
  if (!paper) { out.fatal = 'no paper'; return JSON.stringify(out, null, 2); }
  await sleep(1500);

  out.sentinel_borderRadius = getComputedStyle(paper).borderRadius;
  out.paper_maxHeight = getComputedStyle(paper).maxHeight;
  out.paper_h = px(paper.getBoundingClientRect().height);

  const sc = paper.querySelector('.MuiDialogContent-root');
  if (!sc) { out.fatal = 'no MuiDialogContent-root'; return JSON.stringify(out, null, 2); }

  const scs = getComputedStyle(sc);
  out.scrollContainer = {
    overflowY: scs.overflowY,
    clientH: sc.clientHeight,
    scrollH: sc.scrollHeight,
    canScroll: sc.scrollHeight > sc.clientHeight + 1,
    hiddenPx: sc.scrollHeight - sc.clientHeight
  };

  // THE decisive test: drive it to the bottom and see whether it actually moves
  // and whether the last piece of log content comes into view.
  const logBox = paper.querySelector('.setting.log-box') || paper.querySelector('.logs-wrapper');
  const beforeTop = sc.scrollTop;
  const logBoxBottomBefore = logBox ? px(logBox.getBoundingClientRect().bottom) : null;

  sc.scrollTop = sc.scrollHeight; // request max scroll
  await sleep(250);

  out.scroll_before = beforeTop;
  out.scroll_after = sc.scrollTop;
  out.scroll_moved = sc.scrollTop > beforeTop;
  out.scroll_reachedBottom =
    Math.abs(sc.scrollTop + sc.clientHeight - sc.scrollHeight) <= 2;

  if (logBox) {
    const r = logBox.getBoundingClientRect();
    const scr = sc.getBoundingClientRect();
    out.logBox_bottom_before = logBoxBottomBefore;
    out.logBox_bottom_after = px(r.bottom);
    // Is the log box's bottom edge now inside the scrollport?
    out.logBox_bottom_within_scrollport = r.bottom <= scr.bottom + 2;
    out.scrollport_bottom = px(scr.bottom);
  }

  // Restore, so nothing downstream sees a scrolled state.
  sc.scrollTop = beforeTop;
} catch (e) {
  out.fatal = 'threw: ' + String(e && e.stack ? e.stack : e);
}
return JSON.stringify(out, null, 2);
