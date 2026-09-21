/* Probe body for the WKWebView harness. Runs via callAsyncJavaScript, so top-level
 * `await` is legal and the returned value is the resolved JSON string.
 *
 * Every probe carries a POSITIVE CONTROL. A bare "0px" with no control cannot be
 * told apart from "the rule never matched", which is the silent-negative failure
 * this repo keeps recording.
 */
var out = { href: location.href };

function el(cls, tag) {
  var d = document.createElement(tag || 'div');
  if (cls) d.className = cls;
  return d;
}
function offscreen(node) {
  node.style.position = 'fixed';
  node.style.left = '-99999px';
  node.style.top = '0px';
  node.style.width = '900px';
  document.body.appendChild(node);
  return node;
}
function margins(node) {
  var c = getComputedStyle(node);
  return { top: c.marginTop, right: c.marginRight, bottom: c.marginBottom, left: c.marginLeft };
}

/* ---- boot state, before we inject anything ---- */
out.boot = {
  title: document.title,
  styleSheetsAtLoad: document.styleSheets.length,
  bodyClass: document.body ? document.body.className : '(no body)',
  hasTauriGlobal: typeof window.__TAURI__ !== 'undefined',
  hasWindowApi: typeof window.api !== 'undefined'
};

/* ---- explicitly load the stylesheets under test, straight from Vite ----
 * The app's React tree may not boot here (no Tauri IPC), so we do not rely on
 * it having imported these for us.
 */
var sheets = [
  '/src/frontend/components/UI/Dialog/index.css',
  '/src/frontend/screens/Library/components/InstallModal/index.scss',
  '/src/frontend/components/UI/Winetricks/index.scss',
  '/src/frontend/App.css',
  '/src/frontend/index.scss'
];
out.sheetLoads = {};
for (var s = 0; s < sheets.length; s++) {
  try {
    await import(/* @vite-ignore */ sheets[s]);
    out.sheetLoads[sheets[s]] = 'ok';
  } catch (e) {
    out.sheetLoads[sheets[s]] = 'FAILED: ' + String(e);
  }
}
out.styleSheetsAfterInject = document.styleSheets.length;

/* ---- P1: does --dialog-margin-horizontal resolve where it is used? ---- */
try {
  var p1 = {};
  p1.tokenAtRoot = getComputedStyle(document.documentElement).getPropertyValue('--dialog-margin-horizontal');
  p1.tokenAtBody = getComputedStyle(document.body).getPropertyValue('--dialog-margin-horizontal');

  // TARGET as shipped: .InstallModal__dialog > .anticheatInfo, no .Dialog ancestor
  var hostA = offscreen(el('InstallModal__dialog'));
  var kidA = el('anticheatInfo');
  kidA.textContent = 'x';
  hostA.appendChild(kidA);
  p1.anticheatInfo_asShipped = margins(kidA);
  p1.anticheatInfo_tokenSeen = getComputedStyle(kidA).getPropertyValue('--dialog-margin-horizontal');

  // POSITIVE CONTROL: same subtree under a .Dialog ancestor, the one selector
  // that declares the token. 32px here + 0px above == rule live, token missing.
  var wrapB = offscreen(el('Dialog'));
  var hostB = el('InstallModal__dialog');
  var kidB = el('anticheatInfo');
  kidB.textContent = 'x';
  hostB.appendChild(kidB);
  wrapB.appendChild(hostB);
  p1.anticheatInfo_underDialogAncestor = margins(kidB);

  // SECOND SITE: .progressDialog.winetricksDialog .installWrapper
  var hostC = offscreen(el('progressDialog winetricksDialog'));
  var kidC = el('installWrapper');
  kidC.textContent = 'x';
  hostC.appendChild(kidC);
  p1.installWrapper_asShipped = margins(kidC);

  var wrapD = offscreen(el('Dialog'));
  var hostD = el('progressDialog winetricksDialog');
  var kidD = el('installWrapper');
  kidD.textContent = 'x';
  hostD.appendChild(kidD);
  wrapD.appendChild(hostD);
  p1.installWrapper_underDialogAncestor = margins(kidD);

  // SANITY: a token that certainly exists, read the same way. A blank reading
  // above then means "undefined", not "my getter is broken".
  p1.sanity_spaceMd = getComputedStyle(kidA).getPropertyValue('--space-md');
  p1.elementsCarryingBareDialogClass = document.querySelectorAll('.Dialog').length;

  out.p1_dialogMarginHorizontal = p1;
} catch (e) { out.p1_dialogMarginHorizontal = { error: String(e) }; }

/* ---- P2: is a rule with the stray paren kept or dropped by WebKit? ---- */
try {
  var p2 = {};
  // Reproduce the emotion-shaped pair exactly: one well-formed, one malformed.
  var st = document.createElement('style');
  st.textContent =
    '.probe-paren:has(.logs-wrapper) { max-height: 71%; }\n' +
    '.probe-paren:has(.logs-wrapper)) { max-height: 80%; }\n' +
    '.probe-paren-after { color: rgb(1, 2, 3); }\n';
  document.head.appendChild(st);

  var kept = [];
  for (var j = 0; j < st.sheet.cssRules.length; j++) kept.push(st.sheet.cssRules[j].cssText);
  p2.rulesKeptFromInjectedPair = kept;
  p2.ruleCount = st.sheet.cssRules.length;

  // Does error recovery stop at the bad rule, or eat the next one too?
  var after = offscreen(el('probe-paren-after'));
  p2.ruleAfterMalformedStillApplies = getComputedStyle(after).color;

  // And measure the real consequence: an element matching the malformed rule.
  var holder = offscreen(el('probe-paren'));
  var lw = el('logs-wrapper');
  holder.appendChild(lw);
  p2.maxHeightOnMatchingElement = getComputedStyle(holder).maxHeight;

  p2.hasSupported = CSS.supports('selector(:has(.x))');
  p2.malformedSelectorThrowsInQuerySelector = (function () {
    try { document.querySelector(':has(.logs-wrapper))'); return false; }
    catch (e) { return String(e.name); }
  })();

  out.p2_logsWrapperParen = p2;
} catch (e) { out.p2_logsWrapperParen = { error: String(e) }; }

/* ---- P3: does anything in the app style a bare <input>? ---- */
try {
  var p3 = {};
  var props = ['backgroundColor', 'color', 'borderTopWidth', 'borderTopStyle', 'borderTopColor',
    'borderRadius', 'paddingTop', 'paddingLeft', 'fontFamily', 'fontSize', 'width', 'height'];
  function snap(node) {
    var c = getComputedStyle(node), o = {};
    for (var k = 0; k < props.length; k++) o[props[k]] = c[props[k]];
    return o;
  }
  var host3 = offscreen(el(''));
  var inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = 'Enter your Steam key';
  host3.appendChild(inp);
  p3.appInput = snap(inp);

  // CONTROL: pristine input in an iframe carrying none of the app's stylesheets.
  var ifr = document.createElement('iframe');
  ifr.style.cssText = 'position:fixed;left:-99999px;top:0;width:900px;height:200px;';
  document.body.appendChild(ifr);
  var idoc = ifr.contentDocument;
  idoc.open();
  idoc.write('<!doctype html><html><body><input type="text" placeholder="Enter your Steam key"></body></html>');
  idoc.close();
  p3.pristineInput = snap(idoc.body.firstChild);

  var diff = [];
  for (var q = 0; q < props.length; q++) {
    if (p3.appInput[props[q]] !== p3.pristineInput[props[q]]) diff.push(props[q]);
  }
  p3.differingProperties = diff;
  p3.identicalToPristine = diff.length === 0;

  // NEGATIVE CONTROL for the method itself: a class that IS styled must show a
  // difference. If this comes back "identical", the method cannot detect styling
  // at all and the result above is meaningless.
  var styledProbe = offscreen(el('Dialog__footer'));
  p3.methodControl_dialogFooterDisplay = getComputedStyle(styledProbe).display;

  out.p3_steamKeyInput = p3;
} catch (e) { out.p3_steamKeyInput = { error: String(e) }; }

return JSON.stringify(out, null, 2);
