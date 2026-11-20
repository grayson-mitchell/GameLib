#!/usr/bin/env node
// Quick task 261011-kqx, Task 3.
//
// A standalone, from-scratch reimplementation of the contrast resolver in
// `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts`. It does
// NOT import from that file -- the point is two independent implementations
// of the same var()/color-mix()/WCAG arithmetic, so they can be cross-checked
// against each other and against the plan's own census table.
//
// Usage (run from the repo root):
//   node .planning/quick/261011-kqx-winetricks-tab-contrast-misses-in-nord-l/261011-kqx-contrast-table.mjs
//   node .planning/quick/261011-kqx-winetricks-tab-contrast-misses-in-nord-l/261011-kqx-contrast-table.mjs --all
//
// Exit codes: 0 iff every non-record row PASSes in every printed theme and the
// before-check holds; 1 on any FAIL or unreproduced/unexpectedly-reproduced
// before-check row; 2 on a structural error (bad path, unresolvable colour,
// malformed color-mix(), drift-guard miss).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REPO_ROOT = process.cwd();

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

if (!fs.existsSync(path.join(REPO_ROOT, 'src/frontend/themes.scss'))) {
  console.error('run from the repo root');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Comment stripping -- exact two-stage algorithm from
// src/backend/testUtils/stripSourceComments.ts: block comments first, then
// whole-line `//`/`*`/`/*` lines. Trailing same-line `//` is NOT stripped
// (deliberate, so string literals like "steam://..." are never truncated).
// ---------------------------------------------------------------------------
function stripSourceComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

const RAW_SOURCE_CACHE = new Map();
const STRIPPED_SOURCE_CACHE = new Map();

function readRaw(relPath) {
  if (RAW_SOURCE_CACHE.has(relPath)) return RAW_SOURCE_CACHE.get(relPath);
  const full = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(full)) fail(`file not found: ${relPath}`);
  const raw = fs.readFileSync(full, 'utf8');
  RAW_SOURCE_CACHE.set(relPath, raw);
  return raw;
}

function read(relPath) {
  if (STRIPPED_SOURCE_CACHE.has(relPath)) return STRIPPED_SOURCE_CACHE.get(relPath);
  const stripped = stripSourceComments(readRaw(relPath));
  STRIPPED_SOURCE_CACHE.set(relPath, stripped);
  return stripped;
}

const THEMES_SCSS = 'src/frontend/themes.scss';
const COLORS_SCSS = 'src/frontend/styles/_colors.scss';
const WINETRICKS_INDEX_SCSS = 'src/frontend/screens/Settings/sections/WinetricksSettings/index.scss';
const WINETRICKS_ROW_SCSS = 'src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss';
const WINETRICKS_STICKY_BAR_SCSS =
  'src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss';
const WINETRICKS_LOG_PANEL_SCSS =
  'src/frontend/screens/Settings/sections/WinetricksSettings/LogPanel/index.scss';
const WINETRICKS_EVERYTHING_ELSE_SCSS =
  'src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss';

// Exact order from themeTokens.test.ts's `themeSelectors`.
const THEME_SELECTORS = [
  'body.midnightMirage',
  'body.cyberSpaceOasis',
  'body.gruvbox_dark',
  'body.high-contrast',
  'body.dracula',
  'body.nord-light',
  'body.nord-dark',
  'body.marine',
  'body.zombie',
  'body.sweet'
];
const ALL_THEME_NAMES = THEME_SELECTORS.map((s) => s.slice('body.'.length));
const DEFAULT_THEME_NAMES = ['nord-light', 'midnightMirage'];

// ---------------------------------------------------------------------------
// Structural parsing (brace-depth tracking), independent reimplementation.
// ---------------------------------------------------------------------------
function cssBlock(source, selector) {
  const needle = `${selector} {`;
  const start = source.indexOf(needle);
  if (start === -1) fail(`selector ${selector} not found`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  fail(`unterminated block for ${selector}`);
}

function allBlocksFor(source, selector) {
  const needle = `${selector} {`;
  const out = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf(needle, from);
    if (start === -1) break;
    const open = source.indexOf('{', start);
    let depth = 0;
    let i = open;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}' && --depth === 0) break;
    }
    if (depth !== 0) fail(`unterminated block for ${selector}`);
    out.push(source.slice(open + 1, i));
    from = i;
  }
  if (out.length === 0) fail(`selector ${selector} not found`);
  return out;
}

function customProps(blockBody) {
  const out = new Map();
  let depth = 0;
  let buf = '';
  for (const ch of blockBody) {
    if (ch === '{') {
      depth++;
      buf = '';
    } else if (ch === '}') {
      depth--;
      buf = '';
    } else if (ch === ';' && depth === 0) {
      const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(buf);
      if (m) out.set(m[1], m[2].trim().replace(/\s+/g, ' '));
      buf = '';
    } else {
      buf += ch;
    }
  }
  return out;
}

function declsAtDepthZero(blockBody, prop) {
  const out = [];
  const pattern = new RegExp(String.raw`^\s*${prop}\s*:\s*([\s\S]+)$`);
  const take = (statement) => {
    const m = pattern.exec(statement);
    if (m) out.push(m[1].trim().replace(/\s+/g, ' '));
  };
  let depth = 0;
  let buf = '';
  for (const ch of blockBody) {
    if (ch === '{') {
      depth++;
      buf = '';
    } else if (ch === '}') {
      depth--;
      buf = '';
    } else if (ch === ';' && depth === 0) {
      take(buf);
      buf = '';
    } else if (depth === 0) {
      buf += ch;
    }
  }
  take(buf); // a final declaration may omit its `;`
  return out;
}

function nestedRules(blockBody) {
  const out = [];
  let depth = 0;
  let buf = '';
  let selector = '';
  let bodyStart = 0;
  for (let i = 0; i < blockBody.length; i++) {
    const ch = blockBody[i];
    if (ch === '{') {
      if (depth === 0) {
        selector = buf.trim();
        bodyStart = i + 1;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        out.push({ selector, body: blockBody.slice(bodyStart, i) });
        buf = '';
      }
    } else if (depth === 0) {
      buf = ch === ';' ? '' : buf + ch;
    }
  }
  return out;
}

function nestedRule(body, selector) {
  const rule = nestedRules(body).find((r) => r.selector === selector);
  if (!rule) fail(`no rule '${selector}' found`);
  return rule.body;
}

function globalTokens() {
  const src = read(COLORS_SCSS);
  const out = new Map();
  for (const m of src.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
    if (!out.has(m[1])) out.set(m[1], m[2].trim());
  }
  return out;
}

function themeTokens(themesScss, selector) {
  const merged = new Map(customProps(cssBlock(themesScss, 'body')));
  for (const body of allBlocksFor(themesScss, selector)) {
    for (const [k, v] of customProps(body)) merged.set(k, v);
  }
  return merged;
}

function winetricksScope(themesScss, selector, indexScss) {
  const merged = new Map(themeTokens(themesScss, selector));
  for (const [k, v] of customProps(cssBlock(indexScss, '.WinetricksSettings'))) merged.set(k, v);
  return merged;
}

// ---------------------------------------------------------------------------
// var() resolution, with a cycle guard.
// ---------------------------------------------------------------------------
function resolveValue(value, scope, globals, seen = new Set()) {
  const v = value.trim();
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(v);
  if (!m) return v;
  const [, name, fallback] = m;
  if (!seen.has(name)) {
    const next = scope.get(name) ?? globals.get(name);
    if (next !== undefined) {
      const r = resolveValue(next, scope, globals, new Set(seen).add(name));
      if (r !== null) return r;
    }
  }
  return fallback !== undefined ? resolveValue(fallback, scope, globals, seen) : null;
}

// ---------------------------------------------------------------------------
// Colour acceptance + WCAG arithmetic.
// ---------------------------------------------------------------------------
const NAMED_COLOURS = { white: '#ffffff', black: '#000000', gray: '#808080' };

function toRgb(colour) {
  if (typeof colour !== 'string') return null;
  const c = (NAMED_COLOURS[colour.toLowerCase()] ?? colour).trim();
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(c);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('');
  if (hex.length === 8) {
    if (hex.slice(6).toLowerCase() !== 'ff') return null; // only opaque 8-digit accepted
    hex = hex.slice(0, 6);
  }
  if (hex.length !== 6) return null;
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function relativeLuminance([r, g, b]) {
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(fg, bg) {
  const a = toRgb(fg);
  const b = toRgb(bg);
  if (!a || !b) fail(`uncomparable colours: '${fg}' / '${bg}'`);
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const DERIVATIONS = [];

function mixSrgb(a, b, weightA, deriveLabel) {
  const rgbA = toRgb(a);
  const rgbB = toRgb(b);
  if (!rgbA || !rgbB) fail(`mixSrgb: uncomparable colours: '${a}' / '${b}'`);
  const mixed = rgbA.map((channelA, i) => Math.round(channelA * weightA + rgbB[i] * (1 - weightA)));
  const hex = '#' + mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('');
  if (deriveLabel) {
    DERIVATIONS.push(
      `  ${deriveLabel}: ${weightA.toFixed(2)} x ${a} + ${(1 - weightA).toFixed(2)} x ${b} = ${hex}`
    );
  }
  return hex;
}

function splitTopLevelCommas(source) {
  const out = [];
  let depth = 0;
  let buf = '';
  for (const ch of source) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out;
}

function parseColourMixArg(arg) {
  const trimmed = arg.trim();
  const m = /^([\s\S]+?)\s+(\d+)%$/.exec(trimmed);
  if (m) return { colourExpr: m[1], weight: Number(m[2]) };
  return { colourExpr: trimmed, weight: null };
}

function resolveColour(value, scope, globals, deriveLabel) {
  const resolved = resolveValue(value, scope, globals);
  if (resolved === null) fail(`unresolved value: '${value}'`);
  if (!resolved.startsWith('color-mix(')) return resolved;

  const inner = resolved.slice('color-mix('.length, resolved.length - 1).trim();
  const args = splitTopLevelCommas(inner);
  if (args.length !== 3) fail(`expected 3 color-mix() arguments, found ${args.length}: ${resolved}`);
  const [colourSpace, argA, argB] = args;
  if (colourSpace.trim() !== 'in srgb') fail(`expected 'in srgb' color-mix(), found '${colourSpace.trim()}'`);

  const a = parseColourMixArg(argA);
  const b = parseColourMixArg(argB);
  const colourA = resolveColour(a.colourExpr, scope, globals);
  const colourB = resolveColour(b.colourExpr, scope, globals);
  if (!toRgb(colourA)) fail(`color-mix() argument is not a resolvable colour: '${a.colourExpr}' -> '${colourA}'`);
  if (!toRgb(colourB)) fail(`color-mix() argument is not a resolvable colour: '${b.colourExpr}' -> '${colourB}'`);

  let weightA;
  if (a.weight !== null && b.weight !== null) {
    const sum = a.weight + b.weight;
    weightA = sum === 0 ? 50 : (a.weight / sum) * 100;
  } else if (a.weight !== null) weightA = a.weight;
  else if (b.weight !== null) weightA = 100 - b.weight;
  else weightA = 50;

  return mixSrgb(colourA, colourB, weightA / 100, deriveLabel);
}

// ---------------------------------------------------------------------------
// Winetricks-specific element extraction.
// ---------------------------------------------------------------------------
const UA_PLACEHOLDER = '#a9a9a9'; // WebKit/Chromium UA `darkgray` default.

function rowSurfaces(rowScss, scope, globals, deriveLabel) {
  const rowBody = cssBlock(rowScss, '.WinetricksRow');
  const rowColourDecls = declsAtDepthZero(rowBody, 'color');
  if (rowColourDecls.length !== 1) fail(`expected exactly one depth-0 color in .WinetricksRow, found ${rowColourDecls.length}`);
  const rowColour = resolveColour(rowColourDecls[0], scope, globals);

  const hoverBody = nestedRule(rowBody, '&:hover');
  const hoverBgDecls = declsAtDepthZero(hoverBody, 'background');
  if (hoverBgDecls.length !== 1) fail(`expected exactly one depth-0 background in &:hover, found ${hoverBgDecls.length}`);
  const pctMatch = /currentColor\s+(\d+)%/.exec(hoverBgDecls[0]);
  if (!pctMatch) fail(`could not find a currentColor percentage in &:hover background: ${hoverBgDecls[0]}`);
  const p = Number(pctMatch[1]) / 100;

  const rest = [
    { label: 'modal', value: 'var(--modal-background)' },
    { label: 'body', value: 'var(--body-background)' }
  ];
  const out = [];
  for (const { label, value } of rest) {
    const surface = resolveColour(value, scope, globals);
    out.push({ label, colour: surface });
    out.push({
      label: `hovered ${label}`,
      colour: mixSrgb(rowColour, surface, p, deriveLabel ? `hovered row colour over ${label}` : null)
    });
  }
  return out;
}

function restRowSurfaces(rowScss, scope, globals) {
  return rowSurfaces(rowScss, scope, globals, false).filter((s) => !s.label.startsWith('hovered'));
}

function dangerTagColourDecl(rowScss) {
  const tagBody = cssBlock(rowScss, '.WinetricksRow__tag');
  const erroredBody = nestedRule(tagBody, '&--errored');
  const decls = declsAtDepthZero(erroredBody, 'color');
  if (decls.length !== 1) fail(`expected exactly one depth-0 color in the Row tag errored rule, found ${decls.length}`);
  return decls[0];
}

function dangerIconColourDecl(rowScss) {
  const iconBody = cssBlock(rowScss, '.WinetricksRow__icon');
  const erroredBody = nestedRule(iconBody, '&--errored');
  const decls = declsAtDepthZero(erroredBody, 'color');
  if (decls.length !== 1) fail(`expected exactly one depth-0 color in the Row icon errored rule, found ${decls.length}`);
  return decls[0];
}

function dangerFailedCountColourDecl(stickyBarScss) {
  const body = cssBlock(stickyBarScss, '.WinetricksStickyBar .WinetricksStickyBar__failed');
  const decls = declsAtDepthZero(body, 'color');
  if (decls.length !== 1) fail(`expected exactly one depth-0 color in StickyBar__failed, found ${decls.length}`);
  return decls[0];
}

function dangerLogErrorColourDecl(logPanelScss) {
  const body = cssBlock(logPanelScss, '.WinetricksLogPanel .log-error');
  const decls = declsAtDepthZero(body, 'color');
  if (decls.length !== 1) fail(`expected exactly one depth-0 color in .log-error, found ${decls.length}`);
  return decls[0];
}

function winetricksRowBoxBody(rowScss) {
  return nestedRule(cssBlock(rowScss, '.WinetricksSettings'), '.WinetricksRow__box');
}

function borderColourDecl(ruleBody) {
  const borderColourDecls = declsAtDepthZero(ruleBody, 'border-color');
  if (borderColourDecls.length > 0) return borderColourDecls[0];
  const borderDecls = declsAtDepthZero(ruleBody, 'border');
  for (const decl of borderDecls) {
    const idx = decl.indexOf('var(');
    if (idx !== -1) return decl.slice(idx);
  }
  fail('no border or border-color declaration found');
}

function queuedIndicator(rowScss) {
  const checkboxBody = cssBlock(rowScss, '.WinetricksRow__checkbox');
  const queuedRule = nestedRules(checkboxBody).find((rule) => rule.selector === "&:disabled[aria-checked='true']");
  if (queuedRule) {
    const alphaDecls = declsAtDepthZero(queuedRule.body, 'opacity');
    if (alphaDecls.length !== 1) fail(`expected exactly one depth-0 opacity in the queued rule, found ${alphaDecls.length}`);
    const boxBody = nestedRule(queuedRule.body, '.WinetricksRow__box');
    const afterBody = nestedRule(boxBody, '&::after');
    const colourDecls = declsAtDepthZero(afterBody, 'border-color');
    if (colourDecls.length !== 1) fail(`expected exactly one depth-0 border-color in the queued tick, found ${colourDecls.length}`);
    return { colourDecl: colourDecls[0], alphaDecl: alphaDecls[0] };
  }
  const checkedBody = nestedRule(checkboxBody, "&[aria-checked='true'] .WinetricksRow__box");
  const colourDecls = declsAtDepthZero(checkedBody, 'background');
  if (colourDecls.length !== 1) fail(`expected exactly one depth-0 background in the checked rule, found ${colourDecls.length}`);
  const disabledBody = nestedRule(checkboxBody, '&:disabled');
  const alphaDecls = declsAtDepthZero(disabledBody, 'opacity');
  if (alphaDecls.length !== 1) fail(`expected exactly one depth-0 opacity in &:disabled, found ${alphaDecls.length}`);
  return { colourDecl: colourDecls[0], alphaDecl: alphaDecls[0] };
}

function placeholderColourDecl(inputBody) {
  const placeholderRule = nestedRules(inputBody).find((rule) => rule.selector === '&::placeholder');
  if (!placeholderRule) return UA_PLACEHOLDER;
  const decls = declsAtDepthZero(placeholderRule.body, 'color');
  if (decls.length !== 1) fail(`expected exactly one depth-0 color in &::placeholder, found ${decls.length}`);
  return decls[0];
}

function cancelBorderColourDecl(stickyBarScss) {
  const cancelBody = nestedRule(cssBlock(stickyBarScss, '.WinetricksSettings'), '.WinetricksStickyBar .WinetricksStickyBar__cancel');
  return borderColourDecl(cancelBody);
}

function disabledApplyBorderColourDecl(stickyBarScss) {
  const applyBody = cssBlock(stickyBarScss, '.WinetricksStickyBar .WinetricksStickyBar__apply');
  const disabledBody = nestedRule(applyBody, '&:disabled');
  const decls = declsAtDepthZero(disabledBody, 'border-color');
  if (decls.length !== 1) fail(`expected exactly one depth-0 border-color in the disabled Apply rule, found ${decls.length}`);
  return decls[0];
}

function cancelDisabled(stickyBarScss) {
  const cancelBody = nestedRule(cssBlock(stickyBarScss, '.WinetricksSettings'), '.WinetricksStickyBar .WinetricksStickyBar__cancel');
  const disabledBody = nestedRule(cancelBody, '&:disabled');
  const colourDecls = declsAtDepthZero(disabledBody, 'color');
  const opacityDecls = declsAtDepthZero(disabledBody, 'opacity');
  if (colourDecls.length !== 1 || opacityDecls.length !== 1) {
    fail(`expected exactly one depth-0 color and opacity in Cancel &:disabled, found ${colourDecls.length}/${opacityDecls.length}`);
  }
  return { colourDecl: colourDecls[0], opacityDecl: Number(opacityDecls[0]) };
}

function inputBody(everythingElseScss) {
  return cssBlock(everythingElseScss, '.WinetricksEverythingElse__input');
}

function inputBorderColourDecl(everythingElseScss) {
  return borderColourDecl(inputBody(everythingElseScss));
}

function inputPlaceholderColourDecl(everythingElseScss) {
  return placeholderColourDecl(inputBody(everythingElseScss));
}

function searchWrapperSurfaceDecl(everythingElseScss) {
  const body = cssBlock(everythingElseScss, '.WinetricksEverythingElse__search');
  const decls = declsAtDepthZero(body, 'background');
  if (decls.length !== 1) fail(`expected exactly one depth-0 background in the search wrapper, found ${decls.length}`);
  return decls[0];
}

function inputSurfaceDecl(everythingElseScss) {
  const decls = declsAtDepthZero(inputBody(everythingElseScss), 'background');
  if (decls.length !== 1) fail(`expected exactly one depth-0 background in the input, found ${decls.length}`);
  return decls[0];
}

// ---------------------------------------------------------------------------
// Per-theme context.
// ---------------------------------------------------------------------------
function buildContext(themeName) {
  const selector = `body.${themeName}`;
  const themesScss = read(THEMES_SCSS);
  const indexScss = read(WINETRICKS_INDEX_SCSS);
  const globals = globalTokens();
  const scope = winetricksScope(themesScss, selector, indexScss);
  return {
    themeName,
    selector,
    scope,
    globals,
    rowScss: read(WINETRICKS_ROW_SCSS),
    stickyBarScss: read(WINETRICKS_STICKY_BAR_SCSS),
    everythingElseScss: read(WINETRICKS_EVERYTHING_ELSE_SCSS),
    logPanelScss: read(WINETRICKS_LOG_PANEL_SCSS),
    indexScss
  };
}

function surfaceColour(ctx, varText) {
  return resolveColour(varText, ctx.scope, ctx.globals);
}

// ---------------------------------------------------------------------------
// The 13-row table: the 11 todo rows plus 2 census-found rows.
// ---------------------------------------------------------------------------
const ROWS = [
  {
    id: 1,
    theme: 'nord-light',
    element: 'Install failed tag text',
    file: WINETRICKS_ROW_SCSS,
    bar: 4.5,
    live: 3.56,
    expectedAfterText: 'var(--winetricks-danger-text, var(--danger, #cc3333))',
    getAfterFg: (ctx) => dangerTagColourDecl(ctx.rowScss),
    beforeFgText: 'var(--danger, #cc3333)',
    getAfterSurfaces: (ctx) => rowSurfaces(ctx.rowScss, ctx.scope, ctx.globals, false),
    getBeforeSurfaces: (ctx) => restRowSurfaces(ctx.rowScss, ctx.scope, ctx.globals)
  },
  {
    id: 2,
    theme: 'nord-light',
    element: "bar '1 failed'",
    file: WINETRICKS_STICKY_BAR_SCSS,
    bar: 4.5,
    live: 3.03,
    expectedAfterText: 'var(--winetricks-danger-text, var(--danger, #cc3333))',
    getAfterFg: (ctx) => dangerFailedCountColourDecl(ctx.stickyBarScss),
    beforeFgText: 'var(--danger, #cc3333)',
    getAfterSurfaces: (ctx) => [{ label: 'sticky-bar', colour: surfaceColour(ctx, 'var(--input-background)') }]
  },
  {
    id: 3,
    theme: 'nord-light',
    element: 'Unchecked checkbox border',
    file: WINETRICKS_ROW_SCSS,
    bar: 3,
    live: 1.95,
    expectedAfterText: 'var(--text-secondary, #a8aeaf)',
    getAfterFg: (ctx) => borderColourDecl(winetricksRowBoxBody(ctx.rowScss)),
    beforeFgText: 'var(--neutral-05, #a8aeaf)',
    getAfterSurfaces: (ctx) => restRowSurfaces(ctx.rowScss, ctx.scope, ctx.globals)
  },
  {
    id: 4,
    theme: 'nord-light',
    element: 'Queued (locked) checkbox',
    file: WINETRICKS_ROW_SCSS,
    bar: 3,
    live: 2.87,
    tokenPreNote: '2.52 (accent @ opacity 0.5)',
    expectedAfterText: 'var(--accent, #0080ff)',
    getAfterFg: (ctx) => queuedIndicator(ctx.rowScss).colourDecl,
    getAfterAlpha: (ctx) => Number(queuedIndicator(ctx.rowScss).alphaDecl),
    beforeFgText: 'var(--accent, #0080ff)',
    beforeAlpha: 0.5,
    getAfterSurfaces: (ctx) => restRowSurfaces(ctx.rowScss, ctx.scope, ctx.globals)
  },
  {
    id: 5,
    theme: 'nord-light',
    element: 'Search placeholder',
    file: WINETRICKS_EVERYTHING_ELSE_SCSS,
    bar: 4.5,
    live: 2.04,
    expectedAfterText: 'var(--text-secondary, #a8aeaf)',
    getAfterFg: (ctx) => inputPlaceholderColourDecl(ctx.everythingElseScss),
    beforeFgText: UA_PLACEHOLDER,
    getAfterSurfaces: (ctx) => [{ label: 'input', colour: surfaceColour(ctx, inputSurfaceDecl(ctx.everythingElseScss)) }]
  },
  {
    id: 6,
    theme: 'nord-light',
    element: 'Cancel / disabled Apply borders',
    file: WINETRICKS_STICKY_BAR_SCSS,
    bar: 3,
    live: 1.66,
    expectedAfterText: 'var(--text-secondary, #a8aeaf)',
    getAfterFg: (ctx) => disabledApplyBorderColourDecl(ctx.stickyBarScss),
    beforeFgText: 'var(--neutral-05, #a8aeaf)',
    getAfterSurfaces: (ctx) => [{ label: 'sticky-bar', colour: surfaceColour(ctx, 'var(--input-background)') }]
  },
  {
    id: 7,
    theme: 'nord-light',
    element: 'Cancel remaining DISABLED text (record-only)',
    file: WINETRICKS_STICKY_BAR_SCSS,
    bar: 'record',
    live: 3.1,
    tokenPreNote: '3.09 (untouched)',
    expectedAfterText: 'var(--text-secondary, #a8aeaf)',
    getAfterFg: (ctx) => cancelDisabled(ctx.stickyBarScss).colourDecl,
    getAfterAlpha: (ctx) => cancelDisabled(ctx.stickyBarScss).opacityDecl,
    beforeFgText: 'var(--text-secondary, #a8aeaf)',
    beforeAlpha: 0.6,
    recordOnly: true,
    getAfterSurfaces: (ctx) => [{ label: 'sticky-bar', colour: surfaceColour(ctx, 'var(--input-background)') }]
  },
  {
    id: 8,
    theme: 'midnightMirage',
    element: 'Install failed tag text',
    file: WINETRICKS_ROW_SCSS,
    bar: 4.5,
    live: 2.84,
    expectedAfterText: 'var(--winetricks-danger-text, var(--danger, #cc3333))',
    getAfterFg: (ctx) => dangerTagColourDecl(ctx.rowScss),
    beforeFgText: 'var(--danger, #cc3333)',
    getAfterSurfaces: (ctx) => rowSurfaces(ctx.rowScss, ctx.scope, ctx.globals, false),
    getBeforeSurfaces: (ctx) => restRowSurfaces(ctx.rowScss, ctx.scope, ctx.globals)
  },
  {
    id: 9,
    theme: 'midnightMirage',
    element: 'Danger icon',
    file: WINETRICKS_ROW_SCSS,
    bar: 3,
    live: 2.84,
    expectedAfterText: 'var(--winetricks-danger-text, var(--danger, #cc3333))',
    getAfterFg: (ctx) => dangerIconColourDecl(ctx.rowScss),
    beforeFgText: 'var(--danger, #cc3333)',
    getAfterSurfaces: (ctx) => restRowSurfaces(ctx.rowScss, ctx.scope, ctx.globals)
  },
  {
    id: 10,
    theme: 'midnightMirage',
    element: "bar '1 failed'",
    file: WINETRICKS_STICKY_BAR_SCSS,
    bar: 4.5,
    live: 1.95,
    expectedAfterText: 'var(--winetricks-danger-text, var(--danger, #cc3333))',
    getAfterFg: (ctx) => dangerFailedCountColourDecl(ctx.stickyBarScss),
    beforeFgText: 'var(--danger, #cc3333)',
    getAfterSurfaces: (ctx) => [{ label: 'sticky-bar', colour: surfaceColour(ctx, 'var(--input-background)') }]
  },
  {
    id: 11,
    theme: 'midnightMirage',
    element: 'Disabled Apply border',
    file: WINETRICKS_STICKY_BAR_SCSS,
    bar: 3,
    live: 1.36,
    tokenPreNote: '6.07, NOT reproduced',
    expectedAfterText: 'var(--text-secondary, #a8aeaf)',
    getAfterFg: (ctx) => disabledApplyBorderColourDecl(ctx.stickyBarScss),
    beforeFgText: 'var(--neutral-05, #a8aeaf)',
    getAfterSurfaces: (ctx) => [{ label: 'sticky-bar', colour: surfaceColour(ctx, 'var(--input-background)') }],
    reproExpectation: 'not-reproduced'
  },
  {
    id: 12,
    theme: 'census',
    element: 'Log error line',
    file: WINETRICKS_LOG_PANEL_SCSS,
    bar: 4.5,
    expectedAfterText: 'var(--winetricks-danger-text, var(--danger, #cc3333))',
    getAfterFg: (ctx) => dangerLogErrorColourDecl(ctx.logPanelScss),
    beforeFgText: 'var(--danger, #cc3333)',
    getAfterSurfaces: (ctx) => [{ label: 'log-panel', colour: surfaceColour(ctx, 'var(--input-background)') }],
    reproExpectation: 'skip'
  },
  {
    id: 13,
    theme: 'census',
    element: 'Search input border (vs its wrapper)',
    file: WINETRICKS_EVERYTHING_ELSE_SCSS,
    bar: 3,
    expectedAfterText: 'var(--text-secondary, #a8aeaf)',
    getAfterFg: (ctx) => inputBorderColourDecl(ctx.everythingElseScss),
    beforeFgText: 'var(--neutral-05, #a8aeaf)',
    getAfterSurfaces: (ctx) => [
      { label: 'search wrapper', colour: surfaceColour(ctx, searchWrapperSurfaceDecl(ctx.everythingElseScss)) },
      { label: 'input', colour: surfaceColour(ctx, inputSurfaceDecl(ctx.everythingElseScss)) }
    ],
    reproExpectation: 'skip'
  }
];

// ---------------------------------------------------------------------------
// Drift guard.
// ---------------------------------------------------------------------------
function normalizeDecl(s) {
  return s.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
}

function runDriftGuard() {
  for (const row of ROWS) {
    const source = read(row.file);
    const haystack = normalizeDecl(source);
    const needle = normalizeDecl(row.expectedAfterText);
    if (!haystack.includes(needle)) {
      fail(`drift guard: row ${row.id} ('${row.element}') expected '${row.expectedAfterText}' in ${row.file}, not found`);
    }
  }
}

// ---------------------------------------------------------------------------
// Evaluation.
// ---------------------------------------------------------------------------
function evaluate(fgText, alpha, surfaces, ctx) {
  const resolvedFg = resolveColour(fgText, ctx.scope, ctx.globals);
  const evaluated = surfaces.map(({ label, colour }) => {
    const composed = alpha >= 1 ? resolvedFg : mixSrgb(resolvedFg, colour, alpha);
    return { label, colour, composed, ratio: contrastRatio(composed, colour) };
  });
  evaluated.sort((a, b) => a.ratio - b.ratio);
  return { binding: evaluated[0], resolvedFg };
}

function rowAfterEval(row, ctx) {
  const fgText = row.getAfterFg(ctx);
  const alpha = row.getAfterAlpha ? row.getAfterAlpha(ctx) : 1;
  const surfaces = row.getAfterSurfaces(ctx);
  return evaluate(fgText, alpha, surfaces, ctx);
}

function rowBeforeEval(row, ctx) {
  const alpha = row.beforeAlpha ?? 1;
  const surfaces = row.getBeforeSurfaces ? row.getBeforeSurfaces(ctx) : row.getAfterSurfaces(ctx);
  return evaluate(row.beforeFgText, alpha, surfaces, ctx);
}

function printDerivations(ctx) {
  DERIVATIONS.length = 0;
  const dangerText = ctx.scope.get('--winetricks-danger-text') ?? ctx.globals.get('--winetricks-danger-text');
  if (dangerText) resolveColour(dangerText, ctx.scope, ctx.globals, '--winetricks-danger-text');
  rowSurfaces(ctx.rowScss, ctx.scope, ctx.globals, true);
  if (DERIVATIONS.length > 0) {
    console.log(`-- derivations [${ctx.themeName}] --`);
    for (const line of DERIVATIONS) console.log(line);
  }
}

function printTheme(themeName) {
  const ctx = buildContext(themeName);
  printDerivations(ctx);

  console.log(`\n== ${themeName} ==`);
  console.log('element | theme | fg | bg | before | ratio | bar | result');
  let anyFail = false;
  for (const row of ROWS) {
    const after = rowAfterEval(row, ctx);
    const before = rowBeforeEval(row, ctx);
    const bar = row.bar;
    const result = bar === 'record' ? 'record' : after.binding.ratio >= bar ? 'PASS' : 'FAIL';
    if (result === 'FAIL') anyFail = true;
    console.log(
      `${row.element} | ${themeName} | ${after.resolvedFg} | ${after.binding.colour} (${after.binding.label}) | ${before.binding.ratio.toFixed(2)} | ${after.binding.ratio.toFixed(2)} | ${bar} | ${result}`
    );
  }
  return anyFail;
}

function runBeforeCheck(themeNames) {
  console.log('\n-- before-check (reproduction of the live gate failures) --');
  let ok = true;
  for (const row of ROWS) {
    if (row.reproExpectation === 'skip' || row.recordOnly) {
      console.log(`row ${row.id} (${row.element}): skipped (census/record-only, no live reproduction claim)`);
      continue;
    }
    if (!themeNames.includes(row.theme)) continue;
    const ctx = buildContext(row.theme);
    const before = rowBeforeEval(row, ctx);
    const ratio = before.binding.ratio;
    if (row.reproExpectation === 'not-reproduced') {
      if (ratio < row.bar) {
        console.error(
          `row ${row.id} (${row.element}, ${row.theme}): expected NOT REPRODUCED but token now reproduces the live miss (${ratio.toFixed(2)} < ${row.bar})`
        );
        ok = false;
      } else {
        console.log(`row ${row.id} (${row.element}, ${row.theme}): NOT REPRODUCED (live ${row.live}, token ${ratio.toFixed(2)})`);
      }
    } else {
      if (ratio >= row.bar) {
        console.error(`row ${row.id} (${row.element}, ${row.theme}): script does not see the reported defect (token ${ratio.toFixed(2)} >= ${row.bar})`);
        ok = false;
      } else {
        console.log(`row ${row.id} (${row.element}, ${row.theme}): REPRODUCED (live ${row.live}, token ${ratio.toFixed(2)})`);
      }
    }
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
const requestAll = process.argv.includes('--all');
const themeNames = requestAll ? ALL_THEME_NAMES : DEFAULT_THEME_NAMES;

runDriftGuard();

let anyFail = false;
for (const themeName of themeNames) {
  anyFail = printTheme(themeName) || anyFail;
}

const beforeCheckOk = runBeforeCheck(themeNames);

if (anyFail) {
  console.error('\nRESULT: FAIL (one or more non-record rows failed their bar)');
  process.exit(1);
}
if (!beforeCheckOk) {
  console.error('\nRESULT: FAIL (before-check did not hold)');
  process.exit(1);
}
console.log('\nRESULT: PASS');
process.exit(0);
