// Round 2 for quick 260921-qru. Round 1 produced two readings I refuse to
// interpret without evidence:
//   (a) paper rect.top = 550 in a 500px viewport -- suspected artifact of the
//       offscreen NSWindow never compositing MUI's Slide transform, NOT a real
//       off-screen dialog. Test by reading the transform directly.
//   (b) content scrollHeight 522 inside a 400px paper -- if the paper caps at
//       400 and does not scroll, my fix CLIPS log content. That would be a
//       regression the fix introduced, and it must not be glossed.
const out = { viewport: { w: window.innerWidth, h: window.innerHeight } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const px = (n) => Math.round(n * 100) / 100;

try {
  const mod = await import('/src/frontend/state/GlobalStateV2.ts');
  const store = mod.default;
  const gameInfo = {
    app_name: '260921-qru-probe',
    title: 'Probe Game',
    runner: 'sideload',
    install: { platform: 'Mac', install_path: '/tmp/probe' },
    is_installed: true,
    art_cover: '', art_square: '', canRunOffline: true,
    cloud_save_enabled: false, namespace: '', developer: '',
    extra: { about: { description: '', shortDescription: '' }, reqs: [] },
    folder_name: '', save_folder: '',
    is_mac_native: true, is_linux_native: false
  };
  store.setState({ settingsModalProps: { isOpen: true, type: 'log', gameInfo } });

  let paper = null;
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    await sleep(150);
    const c = document.querySelector('.MuiDialog-paper');
    if (c && c.querySelector('.logs-wrapper')) { paper = c; break; }
  }
  if (!paper) {
    out.fatal = 'no paper with .logs-wrapper within 12s';
    return JSON.stringify(out, null, 2);
  }
  await sleep(1500);

  const cs = getComputedStyle(paper);
  const rect = paper.getBoundingClientRect();

  out.sentinel_borderRadius = cs.borderRadius;
  out.computed_maxHeight = cs.maxHeight;
  out.rendered_height = px(rect.height);
  out.viewport_h = window.innerHeight;
  out.eighty_pct = px(window.innerHeight * 0.8);

  // (a) Is the offset a transform (transition artifact) or real layout?
  out.a_transform = cs.transform;
  out.a_opacity = cs.opacity;
  out.a_rect_top = px(rect.top);
  out.a_rect_bottom = px(rect.bottom);
  // offsetTop is layout position, unaffected by transform.
  out.a_offsetTop = paper.offsetTop;
  out.a_offsetHeight = paper.offsetHeight;
  const container = paper.parentElement;
  if (container) {
    const crect = container.getBoundingClientRect();
    out.a_container_class = container.className;
    out.a_container_rect = { top: px(crect.top), h: px(crect.height) };
    out.a_container_alignItems = getComputedStyle(container).alignItems;
  }
  // Force the transition to its end state and re-read, to separate
  // "mid-animation" from "genuinely positioned off-screen".
  const prevTransition = paper.style.transition;
  const prevTransform = paper.style.transform;
  paper.style.transition = 'none';
  paper.style.transform = 'none';
  await sleep(120);
  const rect2 = paper.getBoundingClientRect();
  out.a_rect_top_transformCleared = px(rect2.top);
  out.a_rect_bottom_transformCleared = px(rect2.bottom);
  out.a_height_transformCleared = px(rect2.height);
  out.a_spills_after_clearing =
    rect2.bottom > window.innerHeight + 0.5 || rect2.top < -0.5;
  paper.style.transition = prevTransition;
  paper.style.transform = prevTransform;

  // (b) Clipping: is log content actually cut off?
  out.b_paper_overflowY = cs.overflowY;
  out.b_paper_scrollHeight = paper.scrollHeight;
  out.b_paper_clientHeight = paper.clientHeight;
  out.b_paper_canScroll = paper.scrollHeight > paper.clientHeight + 1;

  const content = paper.querySelector('.settingsDialogContent');
  if (content) {
    const ccs = getComputedStyle(content);
    const crect = content.getBoundingClientRect();
    out.b_content_overflowY = ccs.overflowY;
    out.b_content_scrollHeight = content.scrollHeight;
    out.b_content_clientHeight = content.clientHeight;
    out.b_content_rect_h = px(crect.height);
    out.b_content_canScroll = content.scrollHeight > content.clientHeight + 1;
    // Does the content box extend past the paper's box?
    out.b_content_bottom_minus_paper_bottom = px(crect.bottom - rect.bottom);
  }

  const lw = paper.querySelector('.logs-wrapper');
  if (lw) {
    const lrect = lw.getBoundingClientRect();
    out.b_logsWrapper_height = getComputedStyle(lw).height;
    out.b_logsWrapper_rect_h = px(lrect.height);
    out.b_logsWrapper_bottom_minus_paper_bottom = px(lrect.bottom - rect.bottom);
    // The log text box itself -- the thing a user reads.
    const box = lw.querySelector('.log-box, textarea, pre');
    if (box) {
      const brect = box.getBoundingClientRect();
      out.b_logBox_rect_h = px(brect.height);
      out.b_logBox_bottom_minus_paper_bottom = px(brect.bottom - rect.bottom);
      out.b_logBox_scrollHeight = box.scrollHeight;
      out.b_logBox_clientHeight = box.clientHeight;
    } else {
      out.b_logBox = 'not found';
    }
  }

  // Ancestor chain overflow -- who, if anyone, provides scrolling?
  const chain = [];
  let n = paper;
  for (let i = 0; i < 4 && n; i++) {
    const ncs = getComputedStyle(n);
    chain.push({
      cls: String(n.className).slice(0, 60),
      overflowY: ncs.overflowY,
      h: px(n.getBoundingClientRect().height),
      scrollH: n.scrollHeight,
      clientH: n.clientHeight
    });
    n = n.parentElement;
  }
  out.b_chain = chain;
} catch (e) {
  out.fatal = 'probe threw: ' + String(e && e.stack ? e.stack : e);
}
return JSON.stringify(out, null, 2);
