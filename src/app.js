// ===== Rime 外觀設計器 · 界面 =====
(function () {
  'use strict';
  const RC = window.RC, PV = window.PV;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'value') e.value = v;
      else if (k === 'checked') e.checked = !!v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
    for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return e;
  }
  // 線條圖標(20×20)
  const ICONS = {
    sun: '<circle cx="10" cy="10" r="3.2"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>',
    moon: '<path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z"/>',
    plus: '<path d="M10 4.5v11M4.5 10h11"/>',
    check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
    restore: '<path d="M4.5 10a5.5 5.5 0 1 0 1.8-4.1M4.5 4.2v3.6h3.6"/>',
    more: '<circle cx="5" cy="10" r=".7"/><circle cx="10" cy="10" r=".7"/><circle cx="15" cy="10" r=".7"/>',
    save: '<path d="M5 3.5h10v13l-5-3.2-5 3.2z"/>',
    code: '<path d="M7.5 6 3.5 10l4 4M12.5 6l4 4-4 4"/>',
    disk: '<path d="M4 4h9.5L16 6.5V16H4z"/><path d="M7 4v4h6V4M7 16v-5h6v5"/>',
    exit: '<path d="M8 4H4.5v12H8M12 6.5 15.5 10 12 13.5M15.5 10H8"/>',
    edit: '<path d="M4 16h3l8.5-8.5-3-3L4 13z"/>',
    trash: '<path d="M4.5 6h11M8 6V4h4v2M6 6l.8 10h6.4L14 6"/>',
    swap: '<path d="M5 7h10l-3-3M15 13H5l3 3"/>'
  };
  function icon(n) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 20 20'); s.setAttribute('class', 'ico'); s.innerHTML = ICONS[n] || '';
    return s;
  }
  const toast = (msg, kind, ms) => {
    const t = h('div', { class: 'toast ' + (kind || '') }, msg);
    const box = $('#toasts'); while (box.children.length >= 3) box.firstChild.remove();
    box.append(t);
    setTimeout(() => t.remove(), ms || (kind === 'err' ? 7000 : 3200));
  };
  async function api(method, path, body) {
    const r = await fetch(path, { method, headers: { 'X-Token': __TOKEN, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    let j = {};
    try { j = await r.json(); } catch (e) { /* ignore */ }
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const lum = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mixHex = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
  const pick = (o, ks) => Object.fromEntries(ks.map(k => [k, o[k]]));
  const MODE_NAME = { light: '淺色', dark: '深色' };

  let ST = null;                 // 全局狀態:m = 界面裏正在編輯的配置,m0 = 磁盤上的配置
  let SAVED = [];                // 我的方案(服務端保存)
  let PEEK = null;               // 臨時預覽 {m, label}:懸停主題卡片、按住「對比」時用
  let GFILTER = 'all';           // 主題庫篩選
  let SHOW_BUILTIN = false;      // 「全部」視圖里是否展開鼠鬚管自帶方案
  const THEME_SCOPE = { colors: true, font: true, layout: true, labels: false };
  const SYNC = {};               // 各分頁里需要跟着數據刷新的控件:{pane: [fn]}
  const TAGS = [];               // 主題卡片上的「使用中」標記:[{el, card, fn}]

  // ================= 啟動 =================
  async function boot() {
    // 啟動器靠心跳判斷窗口是否成功加載頁面,所以越早發越好;並把頁面里的 JS 錯誤報給服務,方便排查
    api('POST', '/api/ping', {}).catch(() => {});
    const report = (m) => { try { api('POST', '/api/clientlog', { msg: String(m) }).catch(() => {}); } catch (e) { /* ignore */ } };
    window.addEventListener('error', (e) => report('error: ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
    window.addEventListener('unhandledrejection', (e) => report('rejection: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)));
    try {
      const s = await api('GET', '/api/state');
      initFrom(s, null);
    } catch (e) { return fatal('無法連接本地服務:' + e.message + '。請關閉此窗口,重新打開「Rime 外觀設計器」。'); }
    await loadSaved();
    $('#app').hidden = false;
    const dl = $('#fontlist'); window.FONT_LIST.forEach(f => dl.append(h('option', { value: f })));
    const setTopH = () => document.documentElement.style.setProperty('--toph', $('.top').offsetHeight + 'px');
    setTopH(); window.addEventListener('resize', setTopH);
    buildSampleSel(); bindTop(); buildAll(); updatePreview(); updateDirty(); histReset();
    api('POST', '/api/ping', {}).catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) api('POST', '/api/ping', {}).catch(() => {}); });
    setInterval(() => api('POST', '/api/ping', {}).catch(() => { ST.pingFail = (ST.pingFail || 0) + 1; if (ST.pingFail === 3) toast('與本地服務的連接中斷了,請重新打開應用', 'err', 20000); }), 8000);
  }
  function fatal(msg) { $('#fatal').hidden = false; $('#fatal').textContent = msg; $('#app').hidden = true; }

  function initFrom(s, keep) {
    const imp = () => RC.importConfig(s.files['squirrel.custom.yaml'], s.files['default.custom.yaml'], s.builtin);
    const m = imp();
    const prefDark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
    ST = Object.assign({ slot: prefDark ? 'dark' : 'light', sample: 0, hi: 0, tab: 'themes' }, keep || {});
    ST.api = s; ST.m = m; ST.m0 = imp();
    ST.snapSq0 = RC.snapSq(m); ST.snapDef0 = RC.snapDef(m);
    const chip = $('#envchip');
    chip.title = s.rimeDir || '';
    if (!s.rimeDirExists) { chip.className = 'chip bad'; chip.textContent = '找不到 Rime 目錄'; }
    else if (!s.squirrelFound) { chip.className = 'chip bad'; chip.textContent = '未找到鼠鬚管 · 只能保存'; }
    else { chip.className = 'chip ok'; chip.textContent = s.squirrelVersion ? '鼠鬚管 ' + s.squirrelVersion : '已連接鼠鬚管'; chip.title = '配置目錄:' + String(s.rimeDir || '').replace(/^\/Users\/[^/]+/, '~'); }
    window.__ST = ST;
  }

  // ================= 撤銷 / 重做 =================
  const HIST = { stack: [], idx: -1, timer: null };
  function histReset() { HIST.stack = [JSON.stringify(ST.m)]; HIST.idx = 0; refreshUndo(); }
  function histMark() { clearTimeout(HIST.timer); HIST.timer = setTimeout(histCommit, 350); }
  function histCommit() {
    clearTimeout(HIST.timer);
    const s = JSON.stringify(ST.m);
    if (s === HIST.stack[HIST.idx]) return;
    HIST.stack = HIST.stack.slice(0, HIST.idx + 1); HIST.stack.push(s);
    if (HIST.stack.length > 120) HIST.stack.shift();
    HIST.idx = HIST.stack.length - 1; refreshUndo();
  }
  function histReplace() { HIST.stack[HIST.idx] = JSON.stringify(ST.m); refreshUndo(); }
  function refreshUndo() { $('#btnUndo').disabled = HIST.idx <= 0; $('#btnRedo').disabled = HIST.idx >= HIST.stack.length - 1; }
  function undo() { histCommit(); if (HIST.idx <= 0) return; HIST.idx--; histRestore('已撤銷'); }
  function redo() { if (HIST.idx >= HIST.stack.length - 1) return; HIST.idx++; histRestore('已重做'); }
  function histRestore(msg) {
    ST.m = JSON.parse(HIST.stack[HIST.idx]); window.__ST = ST; PEEK = null;
    buildAll(); updatePreview(); updateDirty(); refreshUndo(); toast(msg);
  }

  // ================= 改動與預覽 =================
  const curScheme = () => ST.m.schemes[ST.m.slots[ST.slot]];
  const uniq = (base) => { let id = base, i = 2; while (ST.m.schemes[id]) id = base + '_' + i++; return id; };
  const biName = (n) => { const i = String(n).indexOf('/'); const j = String(n).indexOf('／'); const k = j >= 0 ? j : i; return k >= 0 ? String(n).slice(k + 1).trim() || String(n) : String(n); };
  const schemeLabel = (sc) => (sc ? (sc.builtin ? (sc.id === 'native' ? '系統配色' : biName(sc.name)) : sc.name) : '?');

  // 取得可編輯的方案:內置方案先複製成自訂方案
  function editableFor(mode) {
    const m = ST.m, id = m.slots[mode];
    const sc = m.schemes[id];
    if (!sc.builtin) return sc;
    const nid = uniq('my_' + id), c = RC.clone(sc);
    const hadOv = Object.keys(sc.styleOv || {}).length;
    Object.assign(c, { id: nid, builtin: false, name: schemeLabel(sc) + '(自訂)', styleOv: {}, dropped: [] });
    m.schemes[nid] = c;
    for (const md of ['light', 'dark']) if (m.slots[md] === id) m.slots[md] = nid;   // 兩個模式共用時一起換,保持「跟隨系統」狀態不變
    toast('已把鼠鬚管自帶的「' + schemeLabel(sc) + '」複製為你自己的方案再修改,原件不受影響' + (hadOv ? '(它自帶的字體/佈局覆蓋已去除,改用你的設置)' : ''));
    refreshColorsHead(); buildModeCard();
    return c;
  }
  const editable = () => editableFor(ST.slot);

  function touch() {
    updatePreview(); updateDirty(); histMark(); buildLook(); refreshTags();
    for (const k of Object.keys(SYNC)) for (const fn of SYNC[k]) { try { fn(); } catch (e) { /* 控件已移除 */ } }
  }

  function updatePreview() {
    const m = PEEK ? PEEK.m : ST.m, sample = window.SAMPLES[ST.sample];
    const sc = m.schemes[m.slots[ST.slot]];
    const ps = Math.max(1, Math.min(9, Number(m.menu.page_size) || 5));
    const n = Math.min(ps, sample.c.length);
    const hi = ST.hi === 'last' ? n - 1 : Math.min(ST.hi, n - 1);
    const stage = $('#stage');
    stage.className = 'stage ' + ST.slot + (PEEK ? ' peek' : '');
    $('#fakeBefore').textContent = sample.before || '';
    const fp = $('#fakePre'); fp.textContent = sample.preedit; fp.style.display = m.style.inline_preedit ? '' : 'none';
    const panel = PV.renderPanel($('#preview'), { style: m.style, scheme: sc, mode: ST.slot, sample, labels: RC.padLabels(m.menu.labels, ps), pageSize: ps, hi, interactive: !PEEK, onPick: (i) => { ST.hi = i; updatePreview(); } });
    PV.placePanel(stage, $('#preview'), $('#fakeCaret'), panel, stage.clientWidth);
    const badge = $('#stageBadge'); badge.hidden = !PEEK; if (PEEK) badge.textContent = PEEK.label;
    $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === ST.slot));
  }
  function updateDirty() {
    const d = RC.snapSq(ST.m) !== ST.snapSq0 || (!ST.m.defBroken && RC.snapDef(ST.m) !== ST.snapDef0);
    ST.dirty = d;
    const b = $('#btnApply');
    b.classList.toggle('dirty', d); b.classList.toggle('clean', !d);
    b.querySelector('.lbl').textContent = d ? '套用並部署' : '重新部署';
    b.title = d ? '把改動寫入配置,並讓鼠鬚管重新部署(⌘S)' : '沒有未套用的改動。點擊可讓鼠鬚管重新部署一次(⌘S)';
    $('#btnCompare').disabled = !d;
  }
  window.addEventListener('beforeunload', (e) => { if (ST && ST.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // 臨時預覽(懸停主題卡片時;不改動配置)
  let peekT = null;
  function peek(fn, label) {
    clearTimeout(peekT);
    peekT = setTimeout(() => { const m = clone(ST.m); fn(m); PEEK = { m, label }; updatePreview(); }, 80);
  }
  function unpeek() { clearTimeout(peekT); if (PEEK) { PEEK = null; updatePreview(); } }

  function buildAll() { TAGS.length = 0; buildThemes(); buildStyle(); buildColors(); buildCand(); buildLook(); buildModeCard(); }
  function afterBigChange() { clearTimeout(peekT); PEEK = null; ST.hi = 0; buildAll(); touch(); }

  // ================= 主題、我的方案、自帶方案:對配置模型的修改(純數據)=================
  const themeScheme = (t, mode) => {
    const p = t[mode], C = (x) => RC.rgbFromHex(x.toLowerCase());
    return { id: 'ui_' + t.id + '_' + mode, name: t.name + (mode === 'light' ? '·淺色' : '·深色'), author: 'Rime 外觀設計器', color_space: 'srgb', builtin: false, styleOv: {}, extra: {}, dropped: [],
      colors: { back_color: C(p.bg), border_color: C(p.bd), text_color: C(p.tx), hilited_text_color: C(p.tx), hilited_back_color: C(p.hi),
        candidate_text_color: C(p.tx), label_color: C(p.lb), comment_text_color: C(p.cm),
        hilited_candidate_text_color: C(p.ht), hilited_candidate_back_color: C(p.hi), hilited_candidate_label_color: C(p.hl), hilited_comment_text_color: C(p.hl) } };
  };
  const themeStyle = (t) => ({ font_face: t.font.face, font_point: t.font.pt, label_font_face: '', label_font_point: t.font.labelPt, comment_font_face: '', comment_font_point: t.font.commentPt,
    corner_radius: t.layout.corner, hilited_corner_radius: t.layout.hcorner, border_width: t.layout.bw, border_height: t.layout.bh, line_spacing: t.layout.line,
    spacing: t.layout.spacing, shadow_size: t.layout.shadow, translucency: t.layout.trans, candidate_list_layout: t.layout.orient });
  const labelsOf = (id) => (window.LABEL_PRESETS.find(p => p.id === id) || window.LABEL_PRESETS[0]).labels;
  const THEME_FONT_KEYS = ['font_face', 'font_point', 'label_font_face', 'label_font_point', 'comment_font_face', 'comment_font_point'];
  const THEME_LAYOUT_KEYS = ['corner_radius', 'hilited_corner_radius', 'border_width', 'border_height', 'line_spacing', 'spacing', 'shadow_size', 'translucency', 'candidate_list_layout'];

  function putTheme(m, t, which, scope) {
    if (which === 'light' || which === 'dark') { const s = themeScheme(t, which); m.schemes[s.id] = s; m.slots[which] = s.id; return; }
    if (scope.colors) for (const mode of ['light', 'dark']) { const s = themeScheme(t, mode); m.schemes[s.id] = s; m.slots[mode] = s.id; }
    if (scope.font || scope.layout) Object.assign(m.style, pick(themeStyle(t), [].concat(scope.font ? THEME_FONT_KEYS : [], scope.layout ? THEME_LAYOUT_KEYS : [])));
    if (scope.labels) m.menu.labels = labelsOf(t.labels).slice();
  }
  const normStyle = (st) => { const o = {}; for (const [k] of RC.STYLE_SPEC) o[k] = RC.normStyleVal(k, st ? st[k] : undefined); return o; };
  function savedScheme(rec, mode) {
    const p = rec[mode] || rec.light, colors = {};
    for (const ck of RC.COLOR_KEYS) if (p.colors && p.colors[ck.k]) colors[ck.k] = { hex: p.colors[ck.k].hex, a: p.colors[ck.k].a };
    return { id: 'sv_' + rec.id + '_' + mode, name: rec.name + (mode === 'light' ? '·淺色' : '·深色'), author: 'Rime 外觀設計器', color_space: p.color_space || 'srgb',
      builtin: false, styleOv: {}, extra: RC.clone(p.extra || {}), dropped: [], colors };
  }
  // which: 'all' 整套 | 'light' | 'dark'(只換該模式的配色)
  function putSaved(m, rec, which) {
    const modes = which === 'light' ? ['light'] : which === 'dark' ? ['dark'] : ['light', 'dark'];
    for (const mode of modes) { const s = savedScheme(rec, mode); m.schemes[s.id] = s; m.slots[mode] = s.id; }
    if (which === 'all') {
      const r = normStyle(rec.style);
      for (const [k] of RC.STYLE_SPEC) if (rec.style && k in rec.style) m.style[k] = r[k];
      if (rec.labels && rec.labels.length) m.menu.labels = rec.labels.slice();
      if (rec.page_size) m.menu.page_size = rec.page_size;
    }
  }
  function putBuiltin(m, sc, which) { for (const mode of (which === 'both' ? ['light', 'dark'] : [which])) m.slots[mode] = sc.id; }

  // 當前某個模式的配色來自哪套推薦主題 / 我的方案
  function baseOf(mode, m) {
    m = m || ST.m;
    const mt = /^ui_(.+)_(light|dark)$/.exec(m.slots[mode] || '');
    if (!mt || mt[2] !== mode) return null;
    return window.THEMES.find((t) => t.id === mt[1]) || null;
  }
  const baseTheme = () => baseOf('light') || baseOf('dark');
  function savedOf(mode) { const mt = /^sv_(u_[0-9a-f]+)_(light|dark)$/.exec(ST.m.slots[mode] || ''); return mt ? (SAVED.find((x) => x.id === mt[1]) || null) : null; }
  const savedBase = () => savedOf(ST.slot) || savedOf(ST.slot === 'light' ? 'dark' : 'light');
  const effStyle = () => { const sc = curScheme(); return Object.assign({}, ST.m.style, sc.builtin ? sc.styleOv : {}); };
  const sameColors = (a, b) => RC.COLOR_KEYS.every((ck) => { const x = a[ck.k], y = b[ck.k]; return (!x && !y) || (x && y && x.hex === y.hex && x.a === y.a); });

  // 相對主題原樣改了哪些地方
  const TWEAK_NAMES = { font_face: '字體', font_point: '字號', label_font_point: '序號字號', comment_font_point: '註釋字號', corner_radius: '圓角', hilited_corner_radius: '高亮圓角',
    line_spacing: '行距', spacing: '預編輯間距', shadow_size: '陰影', translucency: '磨砂', border_width: '橫向內距', border_height: '縱向內距', candidate_list_layout: '排列' };
  function diffOf(t) {
    if (!t) return [];
    const s = ST.m.style, ts = themeStyle(t), out = [];
    for (const k of Object.keys(TWEAK_NAMES)) if (String(s[k] == null ? '' : s[k]) !== String(ts[k] == null ? '' : ts[k])) out.push(TWEAK_NAMES[k]);
    for (const mode of ['light', 'dark']) {
      if (baseOf(mode) !== t) continue;
      if (!sameColors(ST.m.schemes[ST.m.slots[mode]].colors, themeScheme(t, mode).colors)) out.push(MODE_NAME[mode] + '配色');
    }
    return out;
  }
  // 當前外觀是否和我的方案完全一致(配色、樣式、序號、每頁候選數)
  function sameLook(rec) {
    const m = ST.m;
    for (const mode of ['light', 'dark']) {
      const sc = m.schemes[m.slots[mode]], p = rec[mode];
      if (!p || (sc.color_space || 'srgb') !== (p.color_space || 'srgb')) return false;
      if (!sameColors(sc.colors, p.colors || {})) return false;
    }
    const e = normStyle(effStyle()), r = normStyle(rec.style);
    for (const [k] of RC.STYLE_SPEC) if (JSON.stringify(e[k]) !== JSON.stringify(r[k])) return false;
    const ps = Number(m.menu.page_size) || 5;
    return ps === rec.page_size && JSON.stringify(RC.padLabels(m.menu.labels, ps)) === JSON.stringify(RC.padLabels(rec.labels || [], ps));
  }

  // ---- 套用(帶界面刷新)----
  function applyTheme(t, which, scopeOv) {
    putTheme(ST.m, t, which, scopeOv || THEME_SCOPE);
    if (which === 'light' || which === 'dark') toast(`${MODE_NAME[which]}模式改用 ${t.name} 的${MODE_NAME[which]}版配色`, 'ok');
    else toast(scopeOv ? `已還原為 ${t.name} 的原樣` : `已套用 ${t.name}。滿意了就點右上角「套用並部署」`, 'ok');
    afterBigChange();
  }
  function applySaved(rec, which) {
    putSaved(ST.m, rec, which);
    toast(which === 'all' ? `已套用我的方案「${rec.name}」` : `${MODE_NAME[which]}模式改用「${rec.name}」的${MODE_NAME[which]}配色`, 'ok');
    afterBigChange();
  }
  function applyBuiltin(sc, which) {
    putBuiltin(ST.m, sc, which);
    toast(`${which === 'both' ? '淺色與深色' : MODE_NAME[which]}模式改用鼠鬚管自帶的「${schemeLabel(sc)}」`, 'ok');
    afterBigChange();
  }

  // ================= 頂欄 =================
  function bindTop() {
    $$('#modeSeg button').forEach(b => b.onclick = () => setSlot(b.dataset.m));
    $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
    $('#btnApply').onclick = () => doApply(true);
    $('#btnBackups').onclick = () => openBackups();
    $('#btnMore').onclick = (e) => openMenu(e.currentTarget, [
      { icon: 'disk', label: '只保存,不重新部署', run: () => doApply(false) },
      { icon: 'code', label: '查看將寫入的配置文件', run: openYaml },
      '-',
      { icon: 'exit', label: '退出設計器', run: quitApp }
    ]);
    const cmp = $('#btnCompare');
    const on = (e) => { if (cmp.disabled) return; e.preventDefault(); PEEK = { m: ST.m0, label: '改動之前(目前生效的配置)' }; updatePreview(); };
    const off = () => { if (PEEK && PEEK.m === ST.m0) { PEEK = null; updatePreview(); } };
    cmp.addEventListener('pointerdown', on); cmp.addEventListener('pointerup', off); cmp.addEventListener('pointerleave', off); window.addEventListener('blur', off);
    $('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) setTab(b.dataset.t); };
    $('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if ($('#menuLayer').firstChild) closeMenu(); else if (!$('#modal').hidden) closeModal(); return; }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || !$('#modal').hidden) return;
      const k = e.key.toLowerCase();
      const texty = e.target.matches && e.target.matches('input[type=text], input[type=number], textarea, input:not([type])');
      if (k === 's') { e.preventDefault(); doApply(true); }
      else if (k === 'z' && !texty) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (k === 'y' && !texty) { e.preventDefault(); redo(); }
    });
  }
  function setTab(t) {
    if (ST.tab !== t) { const tabs = $('#tabs'); const y = tabs.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(tabs).top) || 0); if (scrollY > y) scrollTo({ top: y }); }
    ST.tab = t;
    $$('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.t === t));
    $$('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + t));
  }
  function setSlot(mode) {
    if (ST.slot === mode) return;
    ST.slot = mode; updatePreview(); buildColors(); buildLook();
  }
  function buildSampleSel() {
    const sel = $('#sampleSel');
    window.SAMPLES.forEach((s, i) => sel.append(h('option', { value: i }, s.n)));
    sel.onchange = () => { ST.sample = Number(sel.value); ST.hi = 0; updatePreview(); };
  }
  async function quitApp() {
    if (ST.dirty && !(await ask('還有未套用的改動,確定退出?', { title: '退出', ok: '仍然退出', danger: true }))) return;
    try { await api('POST', '/api/quit', {}); } catch (e) { /* 服務已退出 */ }
    document.body.innerHTML = '<div class="fatal"><h2>已退出</h2><p>可以關閉這個窗口了。</p></div>';
  }

  // ---- 彈出菜單 ----
  let menuOff = null;
  function openMenu(anchor, items) {
    closeMenu();
    const mn = h('div', { class: 'menu', role: 'menu' }, items.map((it) => it === '-' ? h('hr') :
      h('button', { class: it.danger ? 'danger' : '', role: 'menuitem', onclick: () => { closeMenu(); it.run(); } }, it.icon ? icon(it.icon) : null, it.label, it.key ? h('small', {}, it.key) : null)));
    $('#menuLayer').append(mn);
    const r = anchor.getBoundingClientRect(), w = mn.offsetWidth, hh = mn.offsetHeight;
    mn.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
    mn.style.top = (r.bottom + 6 + hh > innerHeight - 8 ? Math.max(8, r.top - hh - 6) : r.bottom + 6) + 'px';
    const outside = (e) => { if (!mn.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeMenu(); };
    setTimeout(() => document.addEventListener('mousedown', outside), 0);
    menuOff = () => document.removeEventListener('mousedown', outside);
  }
  function closeMenu() { if (menuOff) menuOff(); menuOff = null; $('#menuLayer').textContent = ''; }

  // ================= 左欄:當前外觀 =================
  function lookInfo() {
    const m = ST.m, bl = baseOf('light'), bd = baseOf('dark'), sv = savedBase();
    const scL = m.schemes[m.slots.light], scD = m.schemes[m.slots.dark];
    const same = SAVED.find((r) => sameLook(r));          // 和某個我的方案完全一致(比如剛存下來)
    if (same) return { name: same.name, kind: '我的方案', saved: same, same: true };
    if (bl && bd && bl !== bd) return { name: `${bl.name} / ${bd.name}`, kind: '推薦主題混搭', diff: [] };
    const t = bl || bd;
    if (t) return { name: t.name, kind: '推薦主題', diff: diffOf(t), theme: t };
    if (sv) return { name: sv.name, kind: '我的方案', saved: sv, same: sameLook(sv) };
    const nm = scL === scD ? schemeLabel(scL) : `${schemeLabel(scL)} / ${schemeLabel(scD)}`;
    return { name: nm, kind: scL.builtin && scD.builtin ? '鼠鬚管自帶配色' : '自訂配色', diff: [] };
  }
  function buildLook() {
    const box = $('#lookCard'); if (!box) return;
    box.textContent = '';
    const info = lookInfo();
    const diff = h('div', { class: 'ldiff' });
    if (info.theme) {
      if (info.diff.length) {
        diff.append(h('span', { class: 'mut' }, '已微調:'), ...info.diff.map((x) => h('span', { class: 'kind' }, x)),
          h('button', { class: 'btn small ghost', title: '把字體、版式和淺/深配色全部還原為主題原樣(序號和每頁候選數不變)', onclick: () => applyTheme(info.theme, 'both', { colors: true, font: true, layout: true, labels: false }) }, icon('restore'), '還原原樣'));
      } else diff.append(h('span', { class: 'mut' }, '和主題原樣一致'));
    } else if (info.saved) {
      if (info.same) diff.append(h('span', { class: 'mut' }, '和存檔一致'));
      else diff.append(h('span', { class: 'kind' }, '與存檔不同'), h('button', { class: 'btn small ghost', title: '把存檔「' + info.saved.name + '」的內容換成現在的外觀', onclick: () => overwriteSaved(info.saved) }, icon('save'), '更新存檔'),
        h('button', { class: 'btn small ghost', onclick: () => applySaved(info.saved, 'all') }, icon('restore'), '還原存檔'));
    } else diff.append(h('span', { class: 'mut' }, '可在右側挑一套主題,或直接細調'));
    box.append(
      h('div', { class: 'lhead' }, h('span', { class: 'eyebrow' }, '當前外觀'), h('span', { class: 'grow' }), h('span', { class: 'kind' }, info.kind)),
      h('div', { class: 'lname', style: 'margin-top:2px' }, info.name),
      diff,
      h('div', { class: 'lact' },
        h('button', { class: 'btn small', id: 'btnSaveTheme', title: '把這套外觀(淺/深配色、字體、版式、序號)存成一個有名字的方案,以後一鍵套用', onclick: () => saveCurrent() }, icon('save'), '存為我的方案…'),
        ST.dirty ? h('button', { class: 'btn small ghost', id: 'btnDiscard', title: '回到目前生效的配置(可以撤銷)', onclick: discardChanges }, icon('restore'), '放棄未套用的改動') : null));
  }
  async function discardChanges() {
    if (!(await ask('放棄所有還沒套用的改動,回到目前生效的配置?\n(放棄後仍可用 ⌘Z 撤銷。)', { title: '放棄改動', ok: '放棄改動', danger: true }))) return;
    ST.m = clone(ST.m0); window.__ST = ST; afterBigChange(); toast('已回到目前生效的配置');
  }

  // ================= 左欄:深淺色 =================
  const schemeIsDark = (sc) => !!(sc && sc.colors.back_color && lum(sc.colors.back_color.hex) < 0.35);
  // 給某個模式找一套「配對」的配色:推薦主題/我的方案的另一半;都沒有就用系統配色(它本身會隨系統深淺變)
  function counterpart(curId, mode) {
    const m = ST.m;
    let mt = /^ui_(.+)_(light|dark)$/.exec(curId);
    const t = mt && window.THEMES.find((x) => x.id === mt[1]);
    if (t) { const s = themeScheme(t, mode); m.schemes[s.id] = s; return s.id; }
    mt = /^sv_(u_[0-9a-f]+)_(light|dark)$/.exec(curId);
    const rec = mt && SAVED.find((x) => x.id === mt[1]);
    if (rec) { const s = savedScheme(rec, mode); m.schemes[s.id] = s; return s.id; }
    if (m.schemes.native && curId !== 'native') return 'native';
    const g = window.THEMES.find((x) => x.id === 'graphite') || window.THEMES[0];
    const s = themeScheme(g, mode); m.schemes[s.id] = s; return s.id;
  }
  function setFollow(on) {
    const m = ST.m;
    if (on) {
      if (m.slots.light !== m.slots.dark) return;
      const cur = m.slots.light, isDark = schemeIsDark(m.schemes[cur]);
      const other = isDark ? 'light' : 'dark';
      m.slots[other] = counterpart(cur, other);
      ST.slot = other;
      toast(`已打開「跟隨系統」:淺色時用「${schemeLabel(m.schemes[m.slots.light])}」,深色時用「${schemeLabel(m.schemes[m.slots.dark])}」。可在左側分別更換`, 'ok', 6000);
    } else {
      const keep = m.slots[ST.slot];
      m.slots.light = m.slots.dark = keep;
      toast(`已關閉「跟隨系統」:淺色、深色都用「${schemeLabel(m.schemes[keep])}」`, 'ok');
    }
    afterBigChange();
  }
  // 配色選擇器:推薦主題的淺/深版、我的方案、配置裏已有的自訂方案、鼠鬚管自帶方案
  function schemeValue(id) {
    let mt = /^ui_(.+)_(light|dark)$/.exec(id);
    if (mt && window.THEMES.some((t) => t.id === mt[1])) return 't:' + mt[1] + ':' + mt[2];
    mt = /^sv_(u_[0-9a-f]+)_(light|dark)$/.exec(id);
    if (mt && SAVED.some((r) => r.id === mt[1])) return 's:' + mt[1] + ':' + mt[2];
    return 'id:' + id;
  }
  function schemePicker(curId, onPick) {
    const m = ST.m, curVal = schemeValue(curId), sc0 = m.schemes[curId];
    const sel = h('select', { onchange: (e) => onPick(e.target.value) });
    const mod = (val, ref) => (val === curVal && ref && sc0 && !sameColors(sc0.colors, ref.colors) ? '(已改)' : '');
    const og = (label, opts) => { if (opts.length) sel.append(h('optgroup', { label }, opts)); };
    og('推薦主題', window.THEMES.flatMap((t) => ['light', 'dark'].map((md) => { const v = 't:' + t.id + ':' + md; return h('option', { value: v }, `${t.name} · ${MODE_NAME[md]}版${mod(v, themeScheme(t, md))}`); })));
    og('我的方案', SAVED.flatMap((r) => ['light', 'dark'].map((md) => { const v = 's:' + r.id + ':' + md; return h('option', { value: v }, `${r.name} · ${MODE_NAME[md]}版${mod(v, savedScheme(r, md))}`); })));
    const custom = Object.values(m.schemes).filter((s) => !s.builtin && schemeValue(s.id).startsWith('id:'));
    og('配置裏的方案', custom.map((s) => h('option', { value: 'id:' + s.id }, s.name)));
    const bi = Object.values(m.schemes).filter((s) => s.builtin).sort((a, b) => (a.id === 'native' ? -1 : b.id === 'native' ? 1 : 0));
    og('鼠鬚管自帶', bi.map((s) => h('option', { value: 'id:' + s.id }, s.id === 'native' ? '系統配色(隨 macOS 自動深淺)' : biName(s.name))));
    sel.value = curVal;
    return sel;
  }
  function pickScheme(which, v) {
    const m = ST.m; let id;
    const [kind, a, b] = v.split(':');
    if (kind === 't') { const t = window.THEMES.find((x) => x.id === a); const s = themeScheme(t, b); m.schemes[s.id] = s; id = s.id; }
    else if (kind === 's') { const r = SAVED.find((x) => x.id === a); const s = savedScheme(r, b); m.schemes[s.id] = s; id = s.id; }
    else id = v.slice(3);
    if (!m.schemes[id]) return;
    if (which === 'both') { m.slots.light = m.slots.dark = id; } else { m.slots[which] = id; ST.slot = which; }
    afterBigChange();
  }
  function buildModeCard() {
    const box = $('#modeCard'); if (!box) return;
    box.textContent = '';
    const m = ST.m, follow = m.slots.light !== m.slots.dark;
    const mrow = (which) => h('div', { class: 'mrow' },
      h('span', {}, which === 'both' ? '始終用' : [icon(which === 'light' ? 'sun' : 'moon'), MODE_NAME[which] + '時']),
      schemePicker(which === 'both' ? m.slots.light : m.slots[which], (v) => pickScheme(which, v)));
    box.append(
      h('div', { class: 'mhead' }, h('b', {}, '深淺色'), h('span', { class: 'grow' }),
        h('label', { class: 'switch', title: '淺色、深色模式分別用不同配色,系統切換外觀時鼠鬚管自動跟着換' }, h('span', { class: 'mut', style: 'font-size:12.5px' }, '跟隨系統'),
          h('input', { type: 'checkbox', id: 'followSys', checked: follow, onchange: (e) => setFollow(e.target.checked) }))),
      h('div', { class: 'sub' }, follow ? 'macOS 切換淺色 / 深色外觀時,鼠鬚管會自動換成對應的配色。' : '現在不管系統是淺色還是深色,都用同一套配色。打開「跟隨系統」可以分開設定。'),
      ...(follow ? [mrow('light'), mrow('dark')] : [mrow('both')]));
  }

  // ================= 主題庫 =================
  const smp = () => ({ preedit: '', before: '', c: window.SAMPLES[0].c.slice(0, 3), m: [] });
  function refreshTags() { for (const x of TAGS) { const v = x.fn(); x.el.hidden = !v; if (v) x.el.textContent = v; if (x.card) x.card.classList.toggle('cur', !!v); } }
  function tcard(o) {
    // o: {cls, previews: [[box,mode,scheme,style,labels]], name, nameTitle, kind, meta, tagFn, peek, peekLabel, apply, actions}
    const tp = h('div', { class: 'tp' + (o.previews.length === 1 ? ' one' : ''), title: '點擊套用' + (o.peek ? ';鼠標停在卡片上可在左側預覽' : ''), onclick: o.apply });
    for (const [mode, scheme, style, labels] of o.previews) {
      const box = h('div', { class: mode === 'dark' ? 'd' : 'l' });
      PV.renderPanel(box, { style: Object.assign({}, style, { inline_preedit: true }), scheme, mode, sample: smp(), labels, pageSize: 3, hi: 0, zoom: 0.62 });
      tp.append(box);
    }
    const tag = h('span', { class: 'tag', hidden: true });
    const card = h('div', { class: 'tcard ' + (o.cls || '') }, tp,
      h('div', { class: 'tb' },
        h('div', { class: 'tt' }, h('b', { title: o.nameTitle || o.name }, o.name), tag, o.kind || null),
        o.meta ? h('div', { class: 'meta' }, o.meta) : null,
        o.desc ? h('div', { class: 'td' }, o.desc) : null,
        h('div', { class: 'tbtn' }, o.actions)));
    if (o.tagFn) TAGS.push({ el: tag, card, fn: o.tagFn });
    if (o.peek) { card.addEventListener('mouseenter', () => peek(o.peek, o.peekLabel)); card.addEventListener('mouseleave', unpeek); }
    return card;
  }
  const modeBtns = (fnLight, fnDark, what) => [
    h('button', { class: 'btn small icon', title: `只把${what}的淺色版配色用於淺色模式`, 'aria-label': '只用於淺色模式', onclick: fnLight }, icon('sun')),
    h('button', { class: 'btn small icon', title: `只把${what}的深色版配色用於深色模式`, 'aria-label': '只用於深色模式', onclick: fnDark }, icon('moon'))];

  function buildThemes() {
    const pane = $('#pane-themes'); pane.textContent = '';
    for (let i = TAGS.length - 1; i >= 0; i--) if (!document.body.contains(TAGS[i].el) || pane.contains(TAGS[i].el)) TAGS.splice(i, 1);
    const bi = Object.values(ST.m.schemes).filter((s) => s.builtin).sort((a, b) => (a.id === 'native' ? -1 : b.id === 'native' ? 1 : 0));
    pane.append(h('div', { class: 'lead' },
      h('span', { class: 'step' }, h('i', {}, '1'), '挑一套主題'), h('span', { class: 'arrow' }, '→'),
      h('span', { class: 'step' }, h('i', {}, '2'), '在「字體與版式」「配色」裏細調'), h('span', { class: 'arrow' }, '→'),
      h('span', { class: 'step' }, h('i', {}, '3'), '右上角「套用並部署」')));
    const seg = h('div', { class: 'seg', id: 'gfilter' });
    for (const [k, l, n] of [['all', '全部'], ['rec', '推薦主題', window.THEMES.length], ['mine', '我的方案', SAVED.length], ['bi', '鼠鬚管自帶', bi.length]]) {
      seg.append(h('button', { class: GFILTER === k ? 'on' : '', 'data-f': k, onclick: () => { GFILTER = k; buildThemes(); refreshTags(); } }, l, n != null ? h('span', { class: 'n' }, String(n)) : null));
    }
    pane.append(h('div', { class: 'gtool' }, seg, h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: () => saveCurrent() }, icon('save'), '存為我的方案…')));

    const showMine = GFILTER === 'mine' || (GFILTER === 'all' && SAVED.length);
    const showRec = GFILTER === 'all' || GFILTER === 'rec';
    const showBi = GFILTER === 'bi' || (GFILTER === 'all' && SHOW_BUILTIN);

    // ---- 我的方案 ----
    if (showMine) {
      pane.append(h('div', { class: 'sechead' }, h('h3', {}, '我的方案'), h('span', { class: 'sub' }, '你保存過的整套外觀(配色、字體、版式、序號)')));
      if (!SAVED.length) {
        pane.append(h('div', { class: 'empty' }, '還沒有。調好一套喜歡的外觀後存下來,以後一鍵套用。', h('br'),
          h('button', { class: 'btn small primary', onclick: () => saveCurrent() }, icon('save'), '把當前外觀存為方案…')));
      } else {
        const g = h('div', { class: 'gallery' });
        for (const rec of SAVED) {
          const st = Object.assign({}, ST.m.style, normStyle(rec.style)), lbl = rec.labels && rec.labels.length ? rec.labels : ST.m.menu.labels;
          const ff = String((rec.style || {}).font_face || '').split(',')[0].trim() || '系統字體';
          const more = h('button', { class: 'btn small icon ghost', title: '更多', 'aria-label': '更多操作' }, icon('more'));
          more.onclick = () => openMenu(more, [
            { icon: 'edit', label: '重命名…', run: () => renameSaved(rec) },
            { icon: 'swap', label: '用當前外觀替換它', run: () => overwriteSaved(rec) },
            '-',
            { icon: 'trash', label: '刪除', danger: true, run: () => deleteSaved(rec) }]);
          g.append(tcard({ cls: 'sv', name: rec.name,
            previews: [['light', savedScheme(rec, 'light'), st, lbl], ['dark', savedScheme(rec, 'dark'), st, lbl]],
            meta: `${ff} ${(rec.style || {}).font_point || ''}pt · 保存於 ${tsText(rec.updated || rec.created || 0)}`,
            tagFn: () => (sameLook(rec) ? '使用中' : savedOf('light') === rec || savedOf('dark') === rec ? '部分使用' : ''),
            peek: (m) => putSaved(m, rec, 'all'), peekLabel: '預覽:' + rec.name + '(未套用)',
            apply: () => applySaved(rec, 'all'),
            actions: [h('button', { class: 'btn small primary', title: '配色(淺+深)、字體、版式、序號、每頁候選數全部換成這個方案的', onclick: () => applySaved(rec, 'all') }, '套用'),
              ...modeBtns(() => applySaved(rec, 'light'), () => applySaved(rec, 'dark'), '它'), h('span', { class: 'grow' }), more] }));
        }
        pane.append(g);
      }
    }

    // ---- 推薦主題 ----
    if (showRec) {
      const scope = h('div', { class: 'scope' }, '套用時一併換:');
      const drawScope = () => {
        scope.textContent = '套用時一併換:';
        for (const [k, l] of [['colors', '配色'], ['font', '字體'], ['layout', '版式'], ['labels', '序號']]) {
          scope.append(h('button', { class: 'pill' + (THEME_SCOPE[k] ? ' on' : ''), 'aria-pressed': String(THEME_SCOPE[k]), 'data-scope': k,
            title: k === 'labels' ? '默認不動你的序號樣式(比如蘇州碼子)' : '', onclick: () => { THEME_SCOPE[k] = !THEME_SCOPE[k]; drawScope(); } }, THEME_SCOPE[k] ? [icon('check'), l] : l));
        }
      };
      drawScope();
      pane.append(h('div', { class: 'sechead' }, h('h3', {}, '推薦主題'), h('span', { class: 'sub' }, '每套都有淺色、深色兩個版本'), h('span', { class: 'grow' }), scope));
      const g = h('div', { class: 'gallery' });
      for (const t of window.THEMES) {
        const base = Object.assign({}, ST.m.style, themeStyle(t)), lbl = labelsOf(t.labels);
        g.append(tcard({ name: t.name,
          previews: [['light', themeScheme(t, 'light'), base, lbl], ['dark', themeScheme(t, 'dark'), base, lbl]],
          meta: `${t.font.face.split(',')[0]} ${t.font.pt}pt · 圓角 ${t.layout.corner} · ${window.LABEL_PRESETS.find(p => p.id === t.labels).name}${t.layout.trans ? ' · 磨砂' : ''}`,
          tagFn: () => { const l = baseOf('light') === t, d = baseOf('dark') === t; return l && d ? '使用中' : l ? '淺色在用' : d ? '深色在用' : ''; },
          peek: (m) => putTheme(m, t, 'both', THEME_SCOPE), peekLabel: '預覽:' + t.name + '(未套用)',
          apply: () => applyTheme(t, 'both'),
          actions: [h('button', { class: 'btn small primary', onclick: () => applyTheme(t, 'both') }, '套用'),
            ...modeBtns(() => applyTheme(t, 'light'), () => applyTheme(t, 'dark'), '這套主題')] }));
      }
      pane.append(g);
    }

    // ---- 鼠鬚管自帶配色方案 ----
    if (bi.length && GFILTER === 'all') {
      pane.append(h('div', { class: 'biswitch' }, h('button', { class: 'btn', id: 'btnBuiltin', 'aria-expanded': String(SHOW_BUILTIN),
        onclick: () => { SHOW_BUILTIN = !SHOW_BUILTIN; buildThemes(); refreshTags(); } }, (SHOW_BUILTIN ? '▾ 收起' : '▸ 展開') + `鼠鬚管自帶的配色方案(${bi.length} 套)`)));
    }
    if (bi.length && showBi) {
      pane.append(h('div', { class: 'sechead' }, h('h3', {}, '鼠鬚管自帶'), h('span', { class: 'sub' }, '安裝時自帶的方案,只有配色。改顏色時會自動複製成你自己的方案,原件不動')));
      const bg = h('div', { class: 'gallery compact' });
      for (const sc of bi) {
        const back = sc.colors.back_color, dark = back ? lum(back.hex) < 0.35 : false;
        bg.append(tcard({ cls: 'bi', name: schemeLabel(sc), nameTitle: sc.name,
          previews: [[dark ? 'dark' : 'light', sc, ST.m.style, RC.padLabels(ST.m.menu.labels, 3)]],
          kind: Object.keys(sc.styleOv || {}).length ? h('span', { class: 'kind', title: '這個方案自帶字體/佈局設置,會蓋過你的設置' }, '自帶版式') : null,
          desc: !back ? '不指定顏色,跟隨 macOS 系統外觀自動深淺。' : null,
          tagFn: () => { const l = ST.m.slots.light === sc.id, d = ST.m.slots.dark === sc.id; return l && d ? '使用中' : l ? '淺色在用' : d ? '深色在用' : ''; },
          peek: (m) => putBuiltin(m, sc, 'both'), peekLabel: '預覽:' + schemeLabel(sc) + '(未套用)',
          apply: () => applyBuiltin(sc, 'both'),
          actions: [h('button', { class: 'btn small primary', title: '淺色、深色模式都用它', onclick: () => applyBuiltin(sc, 'both') }, '套用'),
            h('button', { class: 'btn small icon', title: '只用於淺色模式', 'aria-label': '只用於淺色模式', onclick: () => applyBuiltin(sc, 'light') }, icon('sun')),
            h('button', { class: 'btn small icon', title: '只用於深色模式', 'aria-label': '只用於深色模式', onclick: () => applyBuiltin(sc, 'dark') }, icon('moon'))] }));
      }
      pane.append(bg);
    }
    refreshTags();
  }

  // ---------- 我的方案:保存 / 改名 / 替換 / 刪除 ----------
  async function loadSaved() { try { SAVED = (await api('GET', '/api/saved')).themes || []; } catch (e) { SAVED = []; } }
  function snapshotCurrent(name) {
    const m = ST.m;
    const part = (mode) => { const sc = m.schemes[m.slots[mode]]; return { color_space: sc.color_space || 'srgb', colors: RC.clone(sc.colors), extra: RC.clone(sc.extra || {}) }; };
    return { name, light: part('light'), dark: part('dark'), style: normStyle(effStyle()), labels: m.menu.labels.slice(), page_size: Number(m.menu.page_size) || 5 };
  }
  async function savedCall(body, okMsg) {
    try { const r = await api('POST', '/api/saved', body); SAVED = r.themes || []; if (okMsg) toast(okMsg, 'ok'); buildThemes(); buildLook(); buildModeCard(); return r; }
    catch (e) { toast('操作失敗:' + e.message, 'err'); return null; }
  }
  async function saveCurrent() {
    const t = baseTheme(), sv = savedBase(), base = sv ? sv.name : t ? '我的 ' + t.name : '我的方案';
    const used = new Set(SAVED.map((x) => x.name)); let nm = base, i = 2; while (used.has(nm)) nm = base + ' ' + i++;
    const name = await promptText({ title: '把當前外觀存為我的方案', value: nm, ok: '保存',
      msg: '會保存這套外觀的全部內容:淺色與深色配色、字體、版式、序號樣式、候選格式、每頁候選數。\n保存不會改動你的 Rime 配置;以後在「主題 → 我的方案」裏一鍵套用。' });
    if (name == null) return;
    const dup = SAVED.find((x) => x.name === name);
    if (dup && !(await ask(`已經有一個叫「${name}」的方案。用當前外觀替換它?`, { title: '替換方案', ok: '替換', danger: true }))) return;
    const r = await savedCall({ op: 'save', id: dup ? dup.id : undefined, theme: snapshotCurrent(name) });
    if (r) toast(`已存為「${name}」,在「主題 → 我的方案」裏可以套用、改名或刪除`, 'ok', 5000);
  }
  async function renameSaved(rec) {
    const name = await promptText({ title: '重命名方案', value: rec.name, ok: '重命名' });
    if (name == null || name === rec.name) return;
    await savedCall({ op: 'rename', id: rec.id, name }, `已改名為「${name}」`);
  }
  async function overwriteSaved(rec) {
    if (!(await ask(`用當前的外觀替換方案「${rec.name}」?\n(名字不變,內容換成現在的配色、字體、版式和序號。)`, { title: '替換方案內容', ok: '替換', danger: true }))) return;
    await savedCall({ op: 'save', id: rec.id, theme: snapshotCurrent(rec.name) }, `已更新「${rec.name}」`);
  }
  async function deleteSaved(rec) {
    if (!(await ask(`刪除我的方案「${rec.name}」?\n(只刪這條存檔,不影響當前正在用的配置。)`, { title: '刪除方案', ok: '刪除', danger: true }))) return;
    await savedCall({ op: 'delete', id: rec.id }, `已刪除「${rec.name}」`);
  }

  // ================= 通用控件 =================
  const sync = (pane, fn) => { (SYNC[pane] = SYNC[pane] || []).push(fn); };
  const row = (label, ctrl, hint) => h('div', { class: 'row' }, h('label', {}, label), ctrl, hint ? h('div', { class: 'hint' }, hint) : null);
  function sliderRow(pane, label, key, min, max, step, hint, unit) {
    const get = () => ST.m.style[key];
    const rng = h('input', { type: 'range', min, max, step, value: get(), 'aria-label': label }), num = h('input', { type: 'number', min, max, step, value: get(), 'aria-label': label });
    const on = (v) => { v = Number(v); if (isNaN(v)) return; ST.m.style[key] = v; rng.value = v; num.value = v; touch(); };
    rng.addEventListener('input', () => on(rng.value)); num.addEventListener('change', () => on(num.value));
    sync(pane, () => { if (document.activeElement !== num) num.value = get(); rng.value = get(); });
    return row(label, h('div', { class: 'slide' }, rng, num, unit ? h('span', { class: 'unit' }, unit) : null), hint);
  }
  function switchRow(pane, label, key, hint) {
    const inp = h('input', { type: 'checkbox', checked: !!ST.m.style[key], 'aria-label': label, onchange: (e) => { ST.m.style[key] = e.target.checked; touch(); } });
    sync(pane, () => { inp.checked = !!ST.m.style[key]; });
    return row(label, h('label', { class: 'switch' }, inp), hint);
  }
  function segRow(pane, label, key, opts, hint) {
    const box = h('div', { class: 'seg' });
    const draw = () => { box.textContent = ''; opts.forEach(([v, t]) => box.append(h('button', { class: ST.m.style[key] === v ? 'on' : '', onclick: () => { ST.m.style[key] = v; draw(); touch(); } }, t))); };
    draw(); sync(pane, draw);
    return row(label, box, hint);
  }

  // ================= 字體與版式 =================
  function fontStat(faceKey, optional) {
    const stat = h('span', { class: 'fontchk' });
    const chk = () => {
      const first = String(ST.m.style[faceKey] || '').split(',')[0].trim();
      if (!first) { stat.textContent = optional ? '跟隨候選字體' : ''; stat.className = 'fontchk'; return; }
      if (first.startsWith('.')) { stat.textContent = '系統字體'; stat.className = 'fontchk ok'; return; }
      const ok = PV.fontInstalled(first);
      stat.textContent = ok ? '✓ 本機已安裝' : '⚠ 本機沒找到「' + first + '」,鼠鬚管會改用系統字體';
      stat.className = 'fontchk ' + (ok ? 'ok' : 'bad');
    };
    chk();
    return { stat, chk };
  }
  function faceInput(pane, faceKey, optional) {
    const { stat, chk } = fontStat(faceKey, optional);
    const face = h('input', { type: 'text', list: 'fontlist', value: ST.m.style[faceKey] || '', placeholder: optional ? '留空 = 跟隨候選字體' : '字體名;多個用逗號分隔,前面的缺字時用後面的' });
    face.addEventListener('input', () => { ST.m.style[faceKey] = face.value.trim(); chk(); touch(); });
    sync(pane, () => { if (document.activeElement !== face) face.value = ST.m.style[faceKey] || ''; chk(); });
    return h('div', {}, face, stat);
  }
  function ptRow(pane, label, ptKey) {
    const s = () => ST.m.style;
    const val = () => (s()[ptKey] != null ? s()[ptKey] : s().font_point);
    const rng = h('input', { type: 'range', min: 8, max: 48, step: 1, value: val() }), num = h('input', { type: 'number', min: 8, max: 48, value: val() });
    const own = h('input', { type: 'checkbox', checked: s()[ptKey] != null });
    const setPt = (v) => { v = Number(v); if (isNaN(v)) return; s()[ptKey] = v; own.checked = true; touch(); };
    rng.addEventListener('input', () => setPt(rng.value)); num.addEventListener('change', () => setPt(num.value));
    own.addEventListener('change', () => { if (own.checked) setPt(rng.value); else { s()[ptKey] = null; touch(); } });
    sync(pane, () => { rng.value = val(); if (document.activeElement !== num) num.value = val(); own.checked = s()[ptKey] != null; rng.disabled = num.disabled = !own.checked; });
    rng.disabled = num.disabled = !own.checked;
    return row(label, h('div', { class: 'slide' }, h('label', { class: 'tog', title: '不勾選 = 和候選字號一樣' }, own), rng, num, h('span', { class: 'unit' }, 'pt')));
  }
  function buildStyle() {
    const pane = $('#pane-style'); if (!pane) return;
    pane.textContent = ''; SYNC.style = [];
    const s = () => ST.m.style;
    pane.append(h('div', { class: 'subnav' }, [['st-font', '字體與字號'], ['st-arr', '排列'], ['st-shape', '形狀與間距'], ['st-fx', '效果與行為']].map(([id, l]) =>
      h('a', { href: '#' + id, onclick: (e) => { e.preventDefault(); $('#' + id).scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, l))));

    // ---- 字體與字號 ----
    let scaleAll = true, base = null;   // base:開始拖動時的三種字號,按比例縮放都從它算,避免來回拖動累積誤差
    const ptRng = h('input', { type: 'range', min: 10, max: 40, step: 1, value: s().font_point, 'aria-label': '字號' }), ptNum = h('input', { type: 'number', min: 8, max: 48, value: s().font_point, 'aria-label': '字號' });
    const snap = () => ({ pt: Number(s().font_point) || 16, label: s().label_font_point != null ? Number(s().label_font_point) : null, comment: s().comment_font_point != null ? Number(s().comment_font_point) : null });
    const setFont = (v) => {
      v = Number(v); if (isNaN(v) || v < 6) return;
      const b = base || snap(), r = v / b.pt;
      s().font_point = v;
      if (scaleAll) {
        if (b.label != null) s().label_font_point = Math.max(8, Math.round(b.label * r));
        if (b.comment != null) s().comment_font_point = Math.max(8, Math.round(b.comment * r));
      }
      touch();
    };
    ptRng.addEventListener('pointerdown', () => { base = snap(); });
    ptRng.addEventListener('change', () => { base = null; });
    ptRng.addEventListener('input', () => setFont(ptRng.value)); ptNum.addEventListener('change', () => { base = null; setFont(ptNum.value); });
    sync('style', () => { ptRng.value = s().font_point; if (document.activeElement !== ptNum) ptNum.value = s().font_point; });
    const scaleChk = h('label', { class: 'tog', style: 'font-size:12.5px;color:var(--mut)' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { scaleAll = e.target.checked; } }), '序號、註釋按比例一起變');
    const pairs = h('div', { class: 'chips' });
    const drawPairs = () => { pairs.textContent = ''; window.FONT_PAIRS.forEach(p => pairs.append(h('button', { class: 'pill' + (s().font_face === p.face ? ' on' : ''), onclick: () => { s().font_face = p.face; touch(); } }, p.n))); };
    drawPairs(); sync('style', drawPairs);
    pane.append(h('div', { class: 'sec' }, h('div', { class: 'card' },
      h('div', { class: 'blk', id: 'st-font' },
        row('字號', h('div', {}, h('div', { class: 'slide' }, ptRng, ptNum, h('span', { class: 'unit' }, 'pt')), scaleChk)),
        row('字體搭配', pairs, '點一下就用於候選文字。'),
        row('候選字體', faceInput('style', 'font_face', false), '可填家族名(如 PingFang TC)或 PostScript 名;逗號後面的是回退字體,查罕用字、古籍字時很有用。'),
        h('details', { class: 'more' }, h('summary', {}, '分別設定序號、註釋的字體和字號'),
          row('序號字體', faceInput('style', 'label_font_face', true)),
          ptRow('style', '序號字號', 'label_font_point'),
          row('註釋字體', faceInput('style', 'comment_font_face', true)),
          ptRow('style', '註釋字號', 'comment_font_point'))))));

    // ---- 排列 ----
    pane.append(h('div', { class: 'sec' }, h('div', { class: 'card' }, h('div', { class: 'blk', id: 'st-arr' },
      segRow('style', '候選排列', 'candidate_list_layout', [['linear', '連排(連成一串)'], ['stacked', '疊排(一個一行)']]),
      segRow('style', '文字方向', 'text_orientation', [['horizontal', '橫向'], ['vertical', '豎向(古書式)']], '豎向時:疊排 = 每個候選一列,從右往左排開;連排 = 所有候選連成一整列,從上往下。候選框出現在光標的左下方。'),
      switchRow('style', '翻頁箭頭', 'show_paging', '在候選框左側(豎向時在上方)顯示翻頁小三角,能翻的方向才是實心。')))));

    // ---- 形狀與間距 ----
    pane.append(h('div', { class: 'sec' }, h('div', { class: 'card' }, h('div', { class: 'blk', id: 'st-shape' },
      sliderRow('style', '面板圓角', 'corner_radius', 0, 30, 1),
      sliderRow('style', '高亮塊圓角', 'hilited_corner_radius', 0, 20, 1, '選中候選的底色塊的圓角。'),
      sliderRow('style', '橫向內距', 'border_width', -6, 24, 1, '面板左右留白 = 這個值 + 面板圓角;負值更緊湊(默認 -2)。有邊框色時,邊框粗細取橫、縱內距中較小的一個(≤0 不畫邊框)。'),
      sliderRow('style', '縱向內距', 'border_height', -6, 24, 1, '面板上下留白 = 這個值 + 面板圓角;橫排、豎排都是上下。'),
      sliderRow('style', '行間距', 'line_spacing', 0, 24, 1, '疊排時各候選之間的距離,也是高亮塊的厚度(連排時不起作用)。'),
      sliderRow('style', '預編輯間距', 'spacing', 0, 30, 1, '拼音串與候選之間的距離;只在關閉「拼音串嵌在文字裏」時看得到。'),
      sliderRow('style', '高亮陰影', 'shadow_size', 0, 16, 1, '陰影加在「選中的候選」周圍,不是整個面板;0 為無。')))));

    // ---- 效果與行為 ----
    pane.append(h('div', { class: 'sec' }, h('div', { class: 'card' }, h('div', { class: 'blk', id: 'st-fx' },
      switchRow('style', '半透明磨砂', 'translucency', '背景半透明並模糊後面的內容(配色里背景的不透明度也要調低)。'),
      switchRow('style', '拼音串嵌在文字裏', 'inline_preedit', '開:拼音串直接顯示在正在輸入的文字中;關:顯示在候選框頂部。'),
      switchRow('style', '首選嵌在文字裏', 'inline_candidate', '在正在輸入的文字裏直接顯示首選詞。'),
      switchRow('style', '記住候選框尺寸', 'memorize_size', '翻頁、換候選時候選框不來回伸縮。'),
      switchRow('style', '互斥高亮(高級)', 'mutual_exclusive', '鼠鬚管的高級選項,不確定就保持關閉。')))));
  }

  // ================= 配色 =================
  const HILITE_SWATCHES = ['#0a64d6', '#6a45d6', '#d6338a', '#ff7a59', '#f7b500', '#22a06b', '#11a3b5', '#4c6a94', '#806246', '#4a4b52', '#d9dadf', '#ffffff'];
  // 換高亮色時自動挑選選中項的文字色(白或近黑,取對比度高的),並生成配套的序號/註釋色
  function setHighlight(mode, hex) {
    const sc = editableFor(mode), dark = '#14181f', white = '#ffffff';
    const textHex = ratio(hex, white) >= ratio(hex, dark) ? white : dark;
    const sub = textHex === white ? mixHex(hex, white, 0.78) : mixHex(hex, dark, 0.62);
    const put = (k, h2) => { sc.colors[k] = { hex: h2, a: 255 }; };
    put('hilited_candidate_back_color', hex); put('hilited_back_color', hex);
    put('hilited_candidate_text_color', textHex); put('hilited_candidate_label_color', sub); put('hilited_comment_text_color', sub);
    const ord = {}; for (const ck of RC.COLOR_KEYS) if (sc.colors[ck.k]) ord[ck.k] = sc.colors[ck.k]; sc.colors = ord;
    touch();
  }
  let refreshColorsHead = () => {};
  function buildColors() {
    const pane = $('#pane-colors'); if (!pane) return;
    pane.textContent = ''; SYNC.colors = [];
    const m = ST.m, follow = m.slots.light !== m.slots.dark;
    // ---- 頭部:編輯哪個模式、方案名稱與操作 ----
    const modeSeg = h('div', { class: 'seg' }, ['light', 'dark'].map((md) => h('button', { class: ST.slot === md ? 'on' : '', onclick: () => setSlot(md) }, icon(md === 'light' ? 'sun' : 'moon'), MODE_NAME[md] + '模式')));
    const nameInp = h('input', { type: 'text', id: 'schemeName', 'aria-label': '配色方案名稱', onchange: (e) => { const sc = editable(); sc.name = e.target.value.trim() || sc.id; touch(); buildModeCard(); } });
    const delBtn = h('button', { class: 'btn small danger', id: 'btnDelScheme', onclick: delScheme }, icon('trash'), '刪除');
    const csSel = h('select', { title: '色彩空間', onchange: (e) => { editable().color_space = e.target.value; touch(); } }, h('option', { value: 'srgb' }, 'sRGB'), h('option', { value: 'display_p3' }, 'Display P3'));
    const banners = h('div');
    refreshColorsHead = () => {
      const sc = curScheme();
      nameInp.value = sc.builtin ? schemeLabel(sc) : sc.name; nameInp.disabled = sc.builtin;
      delBtn.disabled = sc.builtin || m.slots.light === m.slots.dark;
      delBtn.title = sc.builtin ? '鼠鬚管自帶方案不能刪除' : m.slots.light === m.slots.dark ? '兩個模式都在用這套,不能刪除' : '從配置裏刪除這套配色,這個模式改用另一個模式的配色';
      csSel.value = sc.color_space || 'srgb';
      banners.textContent = '';
      if (sc.builtin) banners.append(h('div', { class: 'banner info' }, h('span', {}, `這是鼠鬚管自帶的「${schemeLabel(sc)}」。改任何顏色時,會自動複製成你自己的方案再改,原件不受影響。`)));
      if (sc.builtin && Object.keys(sc.styleOv || {}).length) banners.append(h('div', { class: 'banner' }, h('span', {}, '這個自帶方案還帶着自己的字體/版式設置,會蓋過「字體與版式」頁的設置。'),
        h('button', { class: 'btn small', onclick: () => { editable(); touch(); buildColors(); } }, '轉為我自己的方案')));
      if (!Object.keys(sc.colors).length) banners.append(h('div', { class: 'banner info' }, h('span', {}, '這套方案沒有指定顏色(系統配色),實際顏色由 macOS 決定,預覽只是示意。改任何顏色都會變成固定顏色。')));
    };
    pane.append(h('div', { class: 'sec' }, h('div', { class: 'card' },
      h('div', { class: 'schemebar' }, modeSeg, h('span', { class: 'mut', style: 'font-size:12.5px' }, follow ? '淺色、深色各有一套配色' : '兩個模式共用這一套(在左側「深淺色」打開跟隨系統可分開)')),
      h('div', { class: 'schemebar', style: 'margin-top:10px' }, nameInp,
        h('button', { class: 'btn small', title: '複製一份這套配色(只含顏色),當前模式改用副本', onclick: saveAsNew }, icon('plus'), '另存副本'), delBtn, csSel),
      h('div', { style: 'margin-top:10px' }, banners))));
    refreshColorsHead();

    // ---- 快速換高亮色 ----
    const sw = h('div', { class: 'swatches' });
    const contrast = h('span', { class: 'contrast' });
    const drawSw = () => {
      const sc = curScheme(), c = RC.resolveColor(sc, 'hilited_candidate_back_color', ST.slot), cur = c ? c.hex : '';
      sw.textContent = '';
      for (const hx of HILITE_SWATCHES) sw.append(h('button', { class: 'sw' + (hx === cur ? ' on' : ''), style: 'background:' + hx, title: hx, 'aria-label': '高亮色 ' + hx, onclick: () => setHighlight(ST.slot, hx) }));
      const ci = h('input', { type: 'color', value: cur || '#888888', 'aria-label': '自選高亮色', oninput: (e) => setHighlight(ST.slot, e.target.value) });
      sw.append(h('span', { class: 'sw custom' + (cur && !HILITE_SWATCHES.includes(cur) ? ' on' : ''), title: '自選顏色' }, ci));
      const t = RC.resolveColor(sc, 'hilited_candidate_text_color', ST.slot);
      if (c && t) { const r = ratio(c.hex, t.hex); contrast.textContent = `文字對比度 ${r.toFixed(1)}` + (r < 4.5 ? ' · 偏低' : ' · 清晰'); contrast.className = 'contrast ' + (r < 4.5 ? 'bad' : 'ok'); }
      else contrast.textContent = '';
      sw.append(contrast);
    };
    drawSw();
    sync('colors', () => { if (!sw.contains(document.activeElement)) drawSw(); });
    pane.append(h('div', { class: 'sec' }, h('div', { class: 'card', style: 'padding-top:12px' },
      h('div', { class: 'blk' }, h('h4', {}, '高亮色', h('small', {}, `選中候選的底色;文字色和序號色會自動配好(${MODE_NAME[ST.slot]}模式)`)), sw))));

    // ---- 全部顏色 ----
    const colorsCard = h('div', { class: 'card', style: 'padding-top:10px' });
    let lastG = null;
    for (const ck of RC.COLOR_KEYS) {
      if (ck.g !== lastG) { colorsCard.append(h('div', { class: 'cgroup' }, ck.g)); lastG = ck.g; }
      colorsCard.append(colorRow(ck));
    }
    colorsCard.append(h('div', { class: 'note' }, '沒勾選的項目不寫入配置,由鼠鬚管用回退色(比如「序號」默認跟隨候選文字色)。寫入時自動轉成 Rime 的 0xBBGGRR 格式。'));
    pane.append(h('div', { class: 'sec' }, h('div', { class: 'sechead', style: 'margin-top:4px' }, h('h3', {}, '全部顏色'), h('span', { class: 'sub' }, MODE_NAME[ST.slot] + '模式 · ' + schemeLabel(curScheme()))), colorsCard));
  }
  function colorRow(ck) {
    const sc = curScheme(), c = sc.colors[ck.k], eff = RC.resolveColor(sc, ck.k, ST.slot) || RC.rgbFromHex('888888'), on = !!c;
    const show = c || eff;
    const col = h('input', { type: 'color', value: show.hex, disabled: ck.opt && !on, 'aria-label': ck.l });
    const hex = h('input', { type: 'text', class: 'hx', value: show.hex, maxlength: 7, disabled: ck.opt && !on, 'aria-label': ck.l + ' 十六進制' });
    const alpha = h('input', { type: 'range', min: 0, max: 100, value: Math.round(show.a / 2.55), disabled: ck.opt && !on, 'aria-label': ck.l + ' 不透明度' });
    const apv = h('span', {}, Math.round(show.a / 2.55) + '%');
    const set = (patch) => { const s = editable(); const cur = s.colors[ck.k] || { hex: show.hex, a: show.a }; s.colors[ck.k] = Object.assign({}, cur, patch); const v = s.colors[ck.k]; col.value = v.hex; hex.value = v.hex; alpha.value = Math.round(v.a / 2.55); apv.textContent = Math.round(v.a / 2.55) + '%'; touch(); };
    col.addEventListener('input', () => set({ hex: col.value }));
    hex.addEventListener('change', () => { let v = hex.value.trim(); if (!v.startsWith('#')) v = '#' + v; if (/^#[0-9a-fA-F]{6}$/.test(v)) set({ hex: v.toLowerCase() }); else { hex.value = (curScheme().colors[ck.k] || show).hex; toast('請輸入 6 位十六進制顏色,如 #3a5f9e', 'err'); } });
    alpha.addEventListener('input', () => set({ a: Math.round(alpha.value * 2.55) }));
    const rowEl = h('div', { class: 'crow' + (ck.opt && !on ? ' off' : '') },
      ck.opt ? h('input', { type: 'checkbox', checked: on, title: '寫入此項(不勾選則由鼠鬚管用回退色)', onchange: (e) => {
        const s = editable();
        if (e.target.checked) s.colors[ck.k] = RC.clone(RC.resolveColor(s, ck.k, ST.slot) || RC.rgbFromHex('888888')); else delete s.colors[ck.k];
        const ord = {}; for (const k2 of RC.COLOR_KEYS) if (s.colors[k2.k]) ord[k2.k] = s.colors[k2.k]; s.colors = ord;
        rowEl.replaceWith(colorRow(ck)); touch();
      } }) : h('span'),
      h('span', {}, ck.l), col, hex, h('div', { class: 'alpha' }, alpha, apv));
    sync('colors', () => {
      const s2 = curScheme(), v = s2.colors[ck.k] || RC.resolveColor(s2, ck.k, ST.slot);
      if (!v || document.activeElement === hex) return;
      col.value = v.hex; hex.value = v.hex; if (document.activeElement !== alpha) { alpha.value = Math.round(v.a / 2.55); apv.textContent = Math.round(v.a / 2.55) + '%'; }
    });
    return rowEl;
  }
  function saveAsNew() {
    const m = ST.m, src = curScheme(), nid = uniq('my_scheme'), c = RC.clone(src);
    Object.assign(c, { id: nid, builtin: false, name: schemeLabel(src).replace(/(\s*\(自訂\)|\s*副本.*)$/, '') + ' 副本', styleOv: {}, dropped: [] });
    m.schemes[nid] = c; m.slots[ST.slot] = nid; toast('已另存為「' + c.name + '」,' + MODE_NAME[ST.slot] + '模式改用這份副本');
    afterBigChange();
  }
  async function delScheme() {
    const m = ST.m, sc = curScheme(), other = m.slots[ST.slot === 'light' ? 'dark' : 'light'];
    if (sc.builtin || sc.id === other) return;
    if (!(await ask('從配置裏刪除配色方案「' + sc.name + '」?\n' + MODE_NAME[ST.slot] + '模式會改用另一個模式的配色。套用之前不會影響實際配置,也可以撤銷。', { title: '刪除配色方案', ok: '刪除', danger: true }))) return;
    delete m.schemes[sc.id]; m.slots[ST.slot] = other; afterBigChange();
  }

  // ================= 候選與序號 =================
  function buildCand() {
    const pane = $('#pane-cand'); if (!pane) return;
    pane.textContent = ''; SYNC.cand = [];
    const m = ST.m;
    // 每頁候選數
    const rng = h('input', { type: 'range', min: 3, max: 9, step: 1, value: m.menu.page_size, 'aria-label': '每頁候選數' }), num = h('input', { type: 'number', min: 3, max: 9, value: m.menu.page_size, 'aria-label': '每頁候選數' });
    const warnBox = h('div', { class: 'hint' });
    const warn = () => { warnBox.textContent = ST.m.menu.labels.length < ST.m.menu.page_size ? `⚠ 序號只有 ${ST.m.menu.labels.length} 個,少於每頁 ${ST.m.menu.page_size} 個候選,缺的會用阿拉伯數字補上。` : ''; };
    const setPs = (v) => { v = Math.max(3, Math.min(9, Number(v) || 5)); ST.m.menu.page_size = v; rng.value = v; num.value = v; warn(); touch(); };
    rng.addEventListener('input', () => setPs(rng.value)); num.addEventListener('change', () => setPs(num.value));
    sync('cand', () => { rng.value = ST.m.menu.page_size; if (document.activeElement !== num) num.value = ST.m.menu.page_size; warn(); });
    warn();
    // 序號
    const custom = h('input', { type: 'text', value: m.menu.labels.join(' '), placeholder: '用空格分隔,如:〡 〢 〣 〤 〥 〦 〧', 'aria-label': '自定義序號' });
    const grid = h('div', { class: 'lblgrid' });
    const same = (a, b) => a.length >= 1 && a.slice(0, 9).join('|') === b.slice(0, a.length).join('|');
    const drawLabels = () => {
      grid.textContent = '';
      window.LABEL_PRESETS.forEach(p => grid.append(h('button', { class: 'lblopt' + (same(ST.m.menu.labels, p.labels) ? ' on' : ''), onclick: () => setLabels(p.labels.slice()) },
        h('b', {}, p.labels.slice(0, 5).join(' ')), h('small', {}, p.name))));
      if (document.activeElement !== custom) custom.value = ST.m.menu.labels.join(' ');
    };
    const setLabels = (arr) => { ST.m.menu.labels = arr; warn(); touch(); };
    custom.addEventListener('change', () => { const v = custom.value.trim(); const arr = /[\s,]/.test(v) ? v.split(/[\s,]+/).filter(Boolean) : Array.from(v); if (arr.length) setLabels(arr); });
    drawLabels(); sync('cand', drawLabels);
    // 候選格式
    const fmt = h('input', { type: 'text', value: m.style.candidate_format, class: 'mono', 'aria-label': '候選格式' });
    fmt.addEventListener('input', () => { ST.m.style.candidate_format = fmt.value; touch(); });
    const tok = h('div', { class: 'chips', style: 'margin-top:6px' }, ['[label]', '[candidate]', '[comment]'].map(t => h('button', { class: 'pill mono', onclick: () => { fmt.value += t; fmt.dispatchEvent(new Event('input')); } }, '+ ' + t)));
    const fpills = h('div', { class: 'chips' });
    const drawFmt = () => {
      fpills.textContent = '';
      window.FORMAT_PRESETS.forEach(p => fpills.append(h('button', { class: 'pill' + (ST.m.style.candidate_format === p.f ? ' on' : ''), title: p.f, onclick: () => { ST.m.style.candidate_format = p.f; touch(); } }, p.n)));
      if (document.activeElement !== fmt) fmt.value = ST.m.style.candidate_format;
    };
    drawFmt(); sync('cand', drawFmt);
    pane.append(
      h('div', { class: 'sec' }, h('div', { class: 'card' }, (() => { const r = row('每頁候選數', h('div', { class: 'slide' }, rng, num), '一頁顯示幾個候選(3~9)。'); r.append(warnBox); return r; })())),
      h('div', { class: 'sec' }, h('div', { class: 'card', style: 'padding-top:12px' }, h('div', { class: 'blk' }, h('h4', {}, '序號樣式'), grid),
        row('自定義序號', custom, '單字符的序號也可以不加空格連寫,如 一二三四五六七。'))),
      h('div', { class: 'sec' }, h('div', { class: 'card', style: 'padding-top:12px' }, h('div', { class: 'blk' }, h('h4', {}, '候選格式'), fpills),
        row('格式串', h('div', {}, fmt, tok), '[label] 序號、[candidate] 候選、[comment] 註釋;其餘字符(如「. 」)用序號的字體與顏色顯示。默認格式末尾有個空格,沒有註釋時會留在行末。'))),
      h('div', { class: 'note' }, '每頁候選數和序號寫在 default.custom.yaml,其他外觀設置寫在 squirrel.custom.yaml。'));
  }

  // ================= YAML 預覽 =================
  function openYaml() {
    const m = ST.m, dlg = $('#dlg'); dlg.className = 'dlg'; dlg.textContent = '';
    const chSq = RC.snapSq(m) !== ST.snapSq0, chDef = !m.defBroken && RC.snapDef(m) !== ST.snapDef0;
    const copy = (t) => copyText(t).then(() => toast('已複製'), () => toast('複製失敗,請手動選中文字複製', 'err'));
    const block = (name, text, changed) => [h('div', { class: 'yhead' }, h('span', {}, name + ' ', h('span', { class: 'chip ' + (changed ? 'bad' : '') }, changed ? '有改動,套用時會寫入' : '沒有改動,不會被改寫')), h('button', { class: 'btn small', onclick: () => copy(text) }, '複製')), h('pre', { class: 'yaml' }, text)];
    dlg.append(h('div', {}, h('div', { class: 'dhead' }, h('h2', {}, '將寫入的配置文件'), h('button', { class: 'btn small', onclick: closeModal }, '關閉')),
      h('div', { class: 'note' }, '每次寫入前,舊文件都會自動備份(「備份」裏可一鍵還原)。重新生成時原文件裏的注釋會丟失,舊版本的注釋保留在備份裏。'),
      m.notes.length ? h('div', { class: 'banner', style: 'display:block;margin-top:10px' }, h('b', {}, '導入時做了這些整理:'), h('ul', { style: 'margin:4px 0 0 18px;padding:0' }, m.notes.map(n => h('li', {}, n)))) : null,
      block('squirrel.custom.yaml', RC.genSquirrel(m), chSq), block('default.custom.yaml', RC.genDefault(m), chDef)));
    openModal();
  }

  // ================= 套用 / 保存 =================
  let busy = false;
  async function doApply(deploy) {
    if (busy) return; busy = true;
    const btn = $('#btnApply'); btn.disabled = true;
    btn.querySelector('.lbl').textContent = deploy ? '部署中…' : '保存中…';
    histCommit();
    try {
      const m = ST.m;
      const chSq = RC.snapSq(m) !== ST.snapSq0, chDef = !m.defBroken && RC.snapDef(m) !== ST.snapDef0;
      let msg = '';
      if (chSq || chDef) {
        const files = {};
        if (chSq) files['squirrel.custom.yaml'] = RC.genSquirrel(m);
        if (chDef) files['default.custom.yaml'] = RC.genDefault(m);
        // 自檢:生成物必須能被解析,且重新導入後語義不變
        const chk = RC.importConfig(files['squirrel.custom.yaml'] || ST.api.files['squirrel.custom.yaml'], files['default.custom.yaml'] || ST.api.files['default.custom.yaml'], ST.api.builtin);
        if (RC.snapSq(chk) !== RC.snapSq(m) || (chDef && RC.snapDef(chk) !== RC.snapDef(m))) throw new Error('自檢失敗:生成的配置與界面狀態不一致,已取消寫入(沒有改動任何文件)');
        const r = await api('POST', '/api/apply', { files });
        msg = r.backups.length ? '已保存(舊版本已備份)' : (r.unchanged.length === Object.keys(files).length ? '內容與磁盤上一致,沒有需要寫入的' : '已保存(舊版本已有相同備份,未重複保存)');
        if (!deploy) toast(msg, 'ok');
      } else if (!deploy) { toast('沒有需要保存的改動'); }
      if (deploy) {
        const d = await api('POST', '/api/deploy', {});
        if (d.ok) toast((msg ? msg + ';' : '') + '已觸發重新部署,約需數秒。完成後在輸入框裏打字看看', 'ok', 6000);
        else toast((msg ? msg + ';' : '') + '但重新部署失敗:' + (d.error || '未知錯誤') + '。可在鼠鬚管選單裏手動點「重新部署」', 'err');
      }
      const s = await api('GET', '/api/state');
      initFrom(s, { slot: ST.slot, sample: ST.sample, hi: ST.hi, tab: ST.tab });
      buildAll(); updatePreview(); updateDirty(); histReplace();
    } catch (e) { toast('出錯:' + e.message, 'err'); }
    finally { busy = false; btn.disabled = false; updateDirty(); }
  }

  // ================= 對話框、剪貼板 =================
  let modalCancel = null;
  function openModal(onCancel) { closeMenu(); $('#modal').hidden = false; modalCancel = onCancel || null; }
  function closeModal() { $('#modal').hidden = true; $('#dlg').className = 'dlg'; const c = modalCancel; modalCancel = null; if (c) c(); }
  // 頁內確認框:獨立窗口(WKWebView)里瀏覽器自帶的 confirm() 不可用,所以全部用這個
  function ask(msg, o) {
    o = o || {};
    return new Promise((res) => {
      const dlg = $('#dlg'); dlg.className = 'dlg narrow'; dlg.textContent = '';
      const done = (v) => { modalCancel = null; $('#modal').hidden = true; dlg.className = 'dlg'; res(v); };
      const okBtn = h('button', { class: 'btn ' + (o.danger ? 'danger' : 'primary'), onclick: () => done(true) }, o.ok || '確定');
      dlg.append(h('h2', {}, o.title || '請確認'), h('p', { class: 'askmsg' }, msg),
        h('div', { class: 'askbtn' }, h('button', { class: 'btn', onclick: () => done(false) }, o.cancel || '取消'), okBtn));
      openModal(() => res(false));
      setTimeout(() => okBtn.focus(), 0);
    });
  }
  // 頁內文本輸入框(獨立窗口里 prompt() 不可用)
  function promptText(o) {
    return new Promise((res) => {
      const dlg = $('#dlg'); dlg.className = 'dlg narrow'; dlg.textContent = '';
      const inp = h('input', { type: 'text', maxlength: 40, value: o.value || '', placeholder: o.placeholder || '' });
      const done = (v) => { modalCancel = null; $('#modal').hidden = true; dlg.className = 'dlg'; res(v); };
      const go = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } done(v); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      dlg.append(h('h2', {}, o.title), o.msg ? h('p', { class: 'askmsg' }, o.msg) : null, h('div', { style: 'margin:8px 0 4px' }, inp),
        h('div', { class: 'askbtn', style: 'margin-top:14px' }, h('button', { class: 'btn', onclick: () => done(null) }, '取消'), h('button', { class: 'btn primary', onclick: go }, o.ok || '確定')));
      openModal(() => res(null));
      setTimeout(() => { inp.focus(); inp.select(); }, 0);
    });
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return; } catch (e) { /* 退回 execCommand */ }
    const ta = h('textarea', { style: 'position:fixed;left:-9999px;top:0' }); ta.value = t; document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); if (!ok) throw new Error('copy failed');
  }

  // ================= 備份與還原 =================
  const BK = { tab: 'versions', data: null, sel: new Set(), editing: null, creating: false };
  const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB');
  const stampText = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}`;
  const tsText = (t) => { const d = new Date(t * 1000), p = (n) => String(n).padStart(2, '0'); return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const KIND = { squirrel: '外觀', default: '候選數/序號' };

  function groupsOf(loc) {
    const map = new Map();
    for (const it of BK.data.items) {
      if (it.loc !== loc) continue;
      let g = map.get(it.stamp);
      if (!g) { g = { stamp: it.stamp, loc, files: [], size: 0, note: it.note || '', trashedAt: it.trashedAt, reason: it.reason }; map.set(it.stamp, g); }
      g.files.push(it); g.size += it.size;
    }
    return [...map.values()].sort((a, b) => (a.stamp < b.stamp ? 1 : -1));
  }
  async function loadBk() {
    BK.data = await api('GET', '/api/backups');
    const live = new Set(groupsOf('normal').map((g) => g.stamp));
    for (const s of [...BK.sel]) if (!live.has(s)) BK.sel.delete(s);
  }
  async function openBackups(tab) {
    if (tab) BK.tab = tab;
    const dlg = $('#dlg'); dlg.className = 'dlg'; dlg.textContent = '載入中…'; openModal();
    try { await loadBk(); renderBk(); } catch (e) { dlg.textContent = '讀取備份失敗:' + e.message; }
  }
  async function bkAct(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg, 'ok'); await loadBk(); renderBk(); } catch (e) { toast('操作失敗:' + e.message, 'err'); }
  }

  function renderBk() {
    const dlg = $('#dlg'); dlg.className = 'dlg'; dlg.textContent = '';
    const d = BK.data, t = d.totals, nN = groupsOf('normal').length, nP = groupsOf('pinned').length, nT = groupsOf('trash').length;
    dlg.append(h('div', { class: 'dhead' }, h('h2', {}, '備份與還原'), h('button', { class: 'btn small', onclick: closeModal }, '關閉')));
    dlg.append(h('div', { class: 'bktabs' }, [['versions', `版本(${nN + nP})`], ['trash', `回收站(${nT})`], ['settings', '設置']].map(([k, l]) =>
      h('button', { class: BK.tab === k ? 'on' : '', onclick: () => { BK.tab = k; BK.editing = null; renderBk(); } }, l))));
    dlg.append(h('div', { class: 'note', style: 'margin:8px 0 10px' },
      `共占用 ${fmtSize(t.normal.bytes + t.pinned.bytes + t.trash.bytes)}(版本 ${fmtSize(t.normal.bytes + t.pinned.bytes)} · 回收站 ${fmtSize(t.trash.bytes)})。每次套用改動前,舊配置會自動存一份;一個版本通常只有 2~3 KB。`));
    if (BK.tab === 'versions') renderVersions(dlg); else if (BK.tab === 'trash') renderTrash(dlg); else renderBkSettings(dlg);
    const ed = dlg.querySelector('.bknote-input'); if (ed) { ed.focus(); ed.select(); }
  }

  function bkRow(g) {
    const pinned = g.loc === 'pinned', trash = g.loc === 'trash';
    const noteEl = BK.editing === g.stamp
      ? h('input', { type: 'text', class: 'bknote-input', value: g.note, maxlength: 80, placeholder: '備註,如:穩定版、改圓角前',
          onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { BK.editing = null; renderBk(); } },
          onblur: (e) => { if (BK.editing !== g.stamp) return; BK.editing = null; const v = e.target.value.trim(); if (v !== g.note) bkAct(() => api('POST', '/api/backup/note', { stamp: g.stamp, note: v })); else renderBk(); } })
      : h('span', { class: 'bknote' + (g.note ? '' : ' empty'), title: '點擊編輯備註', onclick: () => { BK.editing = g.stamp; renderBk(); } }, g.note || '添加備註…');
    const chips = g.files.map((f) => h('span', { class: 'kind' }, KIND[f.kind] || f.kind));
    const main = [];
    if (!trash) {
      main.push(h('button', { class: 'btn small' + (pinned ? ' pinon' : ''), title: pinned ? '取消固定(之後和普通版本一樣參與輪換)' : '設為基幹版本(永不被自動清理)',
        onclick: async () => {
          if (pinned && !(await ask('取消固定後,這個版本會和普通版本一樣參與輪換,變成最舊時會被移入回收站。繼續?', { title: '取消固定', ok: '取消固定' }))) { renderBk(); return; }
          bkAct(() => api('POST', '/api/backup/pin', { stamps: [g.stamp], pinned: !pinned }), pinned ? '已取消固定' : '已設為基幹版本,不會被自動清理');
        } }, pinned ? '★ 基幹' : '☆ 固定'));
    }
    main.push(h('button', { class: 'btn small', onclick: () => viewBk(g) }, '查看'));
    if (!trash) main.push(h('button', { class: 'btn small', onclick: () => restoreBk(g) }, '還原並部署'));
    if (g.loc === 'normal') main.push(h('button', { class: 'btn small danger', onclick: () => bkAct(() => api('POST', '/api/backup/delete', { stamps: [g.stamp] }), '已移入回收站') }, '刪除'));
    return h('div', { class: 'bkrow' + (pinned ? ' pinned' : '') },
      g.loc === 'normal' ? h('input', { type: 'checkbox', checked: BK.sel.has(g.stamp), onchange: (e) => { e.target.checked ? BK.sel.add(g.stamp) : BK.sel.delete(g.stamp); renderBk(); } }) : h('span'),
      h('div', { class: 'bkmain' }, h('div', { class: 'bktime' }, stampText(g.stamp), ' ', chips, h('small', {}, ' ' + fmtSize(g.size))), noteEl),
      h('div', { class: 'bkbtn' }, main));
  }

  function renderVersions(dlg) {
    const pins = groupsOf('pinned'), norm = groupsOf('normal'), S = BK.data.settings;
    const tool = h('div', { class: 'bktool' });
    if (BK.creating) {
      const note = h('input', { type: 'text', maxlength: 80, placeholder: '給這個基幹版本起個備註(可留空)', style: 'flex:1;min-width:180px' });
      const go = () => { BK.creating = false; bkAct(() => api('POST', '/api/backup/create', { note: note.value, pin: true }), '已把當前配置存為基幹版本'); };
      note.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      tool.append(note, h('button', { class: 'btn small primary', onclick: go }, '保存'), h('button', { class: 'btn small', onclick: () => { BK.creating = false; renderBk(); } }, '取消'));
      setTimeout(() => note.focus(), 0);
    } else {
      tool.append(h('button', { class: 'btn small primary', onclick: () => { BK.creating = true; renderBk(); } }, '＋ 把磁盤上的當前配置存為基幹版本'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn small', disabled: !BK.sel.size, onclick: () => bkAct(async () => { await api('POST', '/api/backup/delete', { stamps: [...BK.sel] }); BK.sel.clear(); }, '已移入回收站') }, `刪除所選(${BK.sel.size})`));
    }
    dlg.append(tool);
    dlg.append(h('div', { class: 'bksec' }, `基幹版本(${pins.length})`, h('small', {}, ' 永不被自動清理,也不占用下面的保留名額')));
    if (!pins.length) dlg.append(h('div', { class: 'note' }, '還沒有。把你最滿意、最不想丟的版本設為基幹:點上面的按鈕,或點某個歷史版本右側的「☆ 固定」。'));
    pins.forEach((g) => dlg.append(bkRow(g)));
    dlg.append(h('div', { class: 'bksec' }, `歷史版本(${norm.length} / 保留最近 ${S.keep} 個)`,
      norm.length ? h('label', { class: 'tog selall' }, h('input', { type: 'checkbox', checked: BK.sel.size === norm.length, onchange: (e) => { BK.sel = new Set(e.target.checked ? norm.map((g) => g.stamp) : []); renderBk(); } }), '全選') : null));
    if (!norm.length) dlg.append(h('div', { class: 'note' }, '還沒有歷史版本。每次套用改動前,舊文件會自動保存在這裏;內容和上一份相同時不會重複保存。'));
    norm.forEach((g) => dlg.append(bkRow(g)));
  }

  function renderTrash(dlg) {
    const tr = groupsOf('trash'), S = BK.data.settings, now = BK.data.now;
    dlg.append(h('div', { class: 'bktool' }, h('span', { class: 'note', style: 'margin:0' }, S.trash_days > 0 ? `回收站里的版本 ${S.trash_days} 天後自動永久刪除。` : '回收站不會自動清理(可在「設置」里改)。'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn small danger', disabled: !tr.length, onclick: async () => {
        if (await ask(`永久刪除回收站里的全部 ${tr.length} 個版本?\n這個操作無法撤銷。`, { title: '清空回收站', ok: '永久刪除', danger: true })) await bkAct(() => api('POST', '/api/backup/purge', {}), '回收站已清空'); else renderBk();
      } }, '清空回收站')));
    if (!tr.length) { dlg.append(h('div', { class: 'note' }, '回收站是空的。')); return; }
    for (const g of tr) {
      const left = S.trash_days > 0 ? Math.max(0, Math.ceil((g.trashedAt + S.trash_days * 86400 - now) / 86400)) : null;
      const row2 = bkRow(g);
      row2.querySelector('.bkbtn').prepend(
        h('button', { class: 'btn small primary', onclick: () => bkAct(() => api('POST', '/api/backup/untrash', { stamps: [g.stamp] }), '已放回版本列表') }, '放回'));
      row2.querySelector('.bkbtn').append(h('button', { class: 'btn small danger', onclick: async () => {
        if (await ask(`永久刪除 ${stampText(g.stamp)} 這個版本?\n這個操作無法撤銷。`, { title: '永久刪除', ok: '永久刪除', danger: true })) await bkAct(() => api('POST', '/api/backup/purge', { stamps: [g.stamp] }), '已永久刪除'); else renderBk();
      } }, '永久刪除'));
      row2.querySelector('.bktime').append(h('span', { class: 'kind ' + (g.reason === 'auto' ? 'auto' : '') }, g.reason === 'auto' ? '自動輪換' : '手動刪除'),
        h('small', {}, ` 刪除於 ${tsText(g.trashedAt)}` + (left != null ? ` · ${left} 天後自動清理` : '')));
      dlg.append(row2);
    }
  }

  function renderBkSettings(dlg) {
    const S = BK.data.settings;
    const numRow = (label, hint, key, min, max) => row(label, h('div', {}, h('input', { type: 'number', min, max, value: S[key], style: 'width:90px',
      onchange: (e) => { const v = Math.round(Number(e.target.value)); if (isNaN(v) || v < min || v > max) { toast(`請輸入 ${min}~${max} 的整數`, 'err'); e.target.value = S[key]; return; } bkAct(() => api('POST', '/api/settings', { [key]: v }), '已保存設置'); } }),
      h('div', { class: 'hint2' }, hint)));
    dlg.append(h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h3', {}, '自動清理'),
      numRow('保留最近 N 個歷史版本', '超出的最舊版本先進回收站,不是直接刪除。基幹版本不計入、永不被自動清理。範圍 5~200。', 'keep', 5, 200),
      numRow('回收站保留(天)', '回收站里的版本超過這個天數後永久刪除。填 0 表示永不自動清理。', 'trash_days', 0, 365)));
    dlg.append(h('div', { class: 'card' }, h('h3', {}, '存放位置'), h('div', { class: 'note', style: 'user-select:text;word-break:break-all' }, BK.data.dir),
      h('div', { class: 'note' }, 'backups = 歷史版本 · pinned = 基幹版本 · trash = 回收站 · saved_themes.json = 我的方案(.prev 是它的上一版)。想徹底手動清理備份,直接刪那三個文件夾里的文件也安全。')));
  }

  async function viewBk(g) {
    try {
      const parts = await Promise.all(g.files.map((f) => api('GET', '/api/backup?name=' + encodeURIComponent(f.name))));
      const dlg = $('#dlg'); dlg.textContent = '';
      dlg.append(h('div', { class: 'dhead' }, h('h2', {}, stampText(g.stamp) + (g.note ? ' · ' + g.note : '')), h('button', { class: 'btn small', onclick: renderBk }, '返回列表')));
      parts.forEach((p, i) => dlg.append(h('div', { class: 'yhead' }, h('span', {}, g.files[i].kind === 'squirrel' ? 'squirrel.custom.yaml' : 'default.custom.yaml')), h('pre', { class: 'yaml' }, p.content)));
    } catch (e) { toast(e.message, 'err'); }
  }

  async function restoreBk(g) {
    if (ST.dirty && !(await ask('界面里還有未套用的改動,還原後會被丟棄。繼續?', { title: '放棄未套用的改動', ok: '繼續還原', danger: true }))) { renderBk(); return; }
    const what = g.files.map((f) => KIND[f.kind]).join('、');
    if (!(await ask(`把 ${stampText(g.stamp)} 這個版本(${what})還原為當前配置,並重新部署?\n當前版本會先自動保存一份,所以這次還原也可以撤銷。`, { title: '還原版本', ok: '還原並部署' }))) { renderBk(); return; }
    try {
      await api('POST', '/api/restore', { names: g.files.map((f) => f.name) });
      const d = await api('POST', '/api/deploy', {});
      toast(d.ok ? '已還原並觸發重新部署' : '已還原,但重新部署失敗,請在鼠鬚管選單手動點「重新部署」', d.ok ? 'ok' : 'err');
      const s = await api('GET', '/api/state'); initFrom(s, { slot: ST.slot, sample: ST.sample, hi: ST.hi, tab: ST.tab });
      buildAll(); updatePreview(); updateDirty(); histCommit(); closeModal();
    } catch (e) { toast('還原失敗:' + e.message, 'err'); renderBk(); }
  }

  // 測試與排查用:改完 __ST.m 後讓界面重新渲染
  window.__refresh = () => { buildAll(); updatePreview(); updateDirty(); };
  window.__preview = () => updatePreview();

  boot();
})();
