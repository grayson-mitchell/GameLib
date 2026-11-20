// Structural probe. My min-height:0 fix did not shrink .settingsDialogContent,
// which falsifies the flex-item diagnosis. Stop guessing: dump the actual box
// model and the real DOM path from the Paper down to the log box.
const out = {};
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

  const describe = (el, label) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      label,
      tag: el.tagName,
      cls: String(el.className).slice(0, 70),
      display: cs.display,
      flexDirection: cs.flexDirection,
      flexGrow: cs.flexGrow,
      flexShrink: cs.flexShrink,
      flexBasis: cs.flexBasis,
      minHeight: cs.minHeight,
      height: cs.height,
      maxHeight: cs.maxHeight,
      overflowY: cs.overflowY,
      position: cs.position,
      boxSizing: cs.boxSizing,
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
      rect_h: px(r.height),
      rect_top: px(r.top),
      clientH: el.clientHeight,
      scrollH: el.scrollHeight
    };
  };

  out.paper = describe(paper, 'PAPER');

  // Every direct child of the Paper -- this is what determines whether the
  // content is a flex item at all.
  out.paperChildren = Array.from(paper.children).map((c, i) =>
    describe(c, 'paperChild[' + i + ']')
  );

  // Walk from paper down to the log box, describing each node on the path.
  const target = paper.querySelector('.setting.log-box') || paper.querySelector('.logs-wrapper');
  const path = [];
  if (target) {
    let n = target;
    while (n && n !== paper) { path.unshift(n); n = n.parentElement; }
  }
  out.pathPaperToLogBox = path.map((n, i) => describe(n, 'path[' + i + ']'));

  out.note_contentIsDirectChildOfPaper = (() => {
    const c = paper.querySelector('.settingsDialogContent');
    return c ? c.parentElement === paper : null;
  })();
} catch (e) {
  out.fatal = 'threw: ' + String(e && e.stack ? e.stack : e);
}
return JSON.stringify(out, null, 2);
