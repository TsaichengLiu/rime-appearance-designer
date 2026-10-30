// ===== 核心邏輯:顏色、YAML 讀入、配置生成(純函數,瀏覽器與 Node 通用)=====
(function (root) {
  'use strict';
  const Y = () => root.jsyaml;

  // ---------- 顏色 ----------
  // Rime/鼠鬚管 的顏色是 0xBBGGRR 或 0xAABBGGRR(AA 為不透明度,FF 不透明)
  // 內部統一存成 {hex:'#rrggbb', a:0..255}
  function parseColor(v) {
    if (v == null) return null;
    let s = typeof v === 'number' ? v.toString(16) : String(v).trim();
    s = s.replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]+$/.test(s) || s.length > 8) return null;
    let a = 255;
    if (s.length > 6) { a = parseInt(s.slice(0, s.length - 6), 16); s = s.slice(-6); }
    s = s.padStart(6, '0');
    const bb = s.slice(0, 2), gg = s.slice(2, 4), rr = s.slice(4, 6);
    return { hex: ('#' + rr + gg + bb).toLowerCase(), a };
  }
  function toRimeColor(c) {
    const h = c.hex.replace('#', '').toUpperCase();
    const rr = h.slice(0, 2), gg = h.slice(2, 4), bb = h.slice(4, 6);
    const a = Math.max(0, Math.min(255, Math.round(c.a == null ? 255 : c.a)));
    return '0x' + (a >= 255 ? '' : a.toString(16).toUpperCase().padStart(2, '0')) + bb + gg + rr;
  }
  const rgba = (c, mul) => {
    const n = parseInt(c.hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${((c.a == null ? 255 : c.a) / 255 * (mul == null ? 1 : mul)).toFixed(3)})`;
  };
  const rgbFromHex = (h) => ({ hex: '#' + h.toLowerCase(), a: 255 });

  // ---------- 鍵定義 ----------
  // 配色鍵;opt:true 表示可不設置(鼠鬚管有回退);fb 為回退鏈(預覽用)
  const COLOR_KEYS = [
    { k: 'back_color',                   g: '面板',       l: '面板背景' },
    { k: 'border_color',                 g: '面板',       l: '面板邊框',               opt: true },
    { k: 'text_color',                   g: '輸入串',     l: '輸入串文字' },
    { k: 'hilited_text_color',           g: '輸入串',     l: '輸入串選中部分的文字',   opt: true, fb: ['text_color'] },
    { k: 'hilited_back_color',           g: '輸入串',     l: '輸入串選中部分的底色',   opt: true },
    { k: 'preedit_back_color',           g: '輸入串',     l: '輸入串區域背景',         opt: true },
    { k: 'candidate_text_color',         g: '候選項',     l: '候選文字',               opt: true, fb: ['text_color'] },
    { k: 'label_color',                  g: '候選項',     l: '序號',                   opt: true, fb: ['candidate_text_color', 'text_color'] },
    { k: 'comment_text_color',           g: '候選項',     l: '註釋',                   opt: true, fb: ['label_color', 'candidate_text_color', 'text_color'] },
    { k: 'candidate_back_color',         g: '候選項',     l: '未選中候選的底色',       opt: true },
    { k: 'hilited_candidate_text_color', g: '選中的候選', l: '選中候選的文字',         opt: true, fb: ['hilited_text_color', 'text_color'] },
    { k: 'hilited_candidate_back_color', g: '選中的候選', l: '選中候選的底色(高亮塊)', opt: true, fb: ['hilited_back_color'] },
    { k: 'hilited_candidate_label_color',g: '選中的候選', l: '選中候選的序號',         opt: true, fb: ['hilited_candidate_text_color', 'hilited_text_color', 'text_color'] },
    { k: 'hilited_comment_text_color',   g: '選中的候選', l: '選中候選的註釋',         opt: true, fb: ['hilited_candidate_label_color', 'hilited_candidate_text_color', 'text_color'] }
  ];
  const COLOR_KEY_SET = new Set(COLOR_KEYS.map(c => c.k));

  // 樣式鍵(全局 style/ 下);o:true 表示為空時不輸出
  const STYLE_SPEC = [
    ['candidate_list_layout', 'linear'], ['text_orientation', 'horizontal'],
    ['inline_preedit', true], ['inline_candidate', false], ['translucency', false],
    ['mutual_exclusive', false], ['memorize_size', true], ['show_paging', false],
    ['corner_radius', 7], ['hilited_corner_radius', 0], ['border_height', 0], ['border_width', 0],
    ['line_spacing', 5], ['spacing', 8], ['shadow_size', 0],
    ['font_face', '', true], ['font_point', 16],
    ['label_font_face', '', true], ['label_font_point', null, true],
    ['comment_font_face', '', true], ['comment_font_point', null, true],
    ['candidate_format', '[label]. [candidate] [comment]']
  ];
  const STYLE_KEYS = new Set(STYLE_SPEC.map(s => s[0]));
  // 方案內可能出現的舊/廢棄鍵,導入時丟棄並記錄
  const OBSOLETE_SCHEME_KEYS = new Set(['horizontal', 'color_scheme', 'color_scheme_dark', 'vertical']);
  const MANAGED_SCHEME_META = new Set(['name', 'author', 'color_space']);

  // ---------- YAML 讀 ----------
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  // 把 0x... 十六進制標量先轉成字符串,避免被當成整數丟失原樣
  const preHex = (t) => t.replace(/(:[ \t]+|-[ \t]+)(0[xX][0-9A-Fa-f]+)([ \t]*(?:#.*)?)$/gm, '$1"$2"$3');
  function loadYaml(text) {
    if (!text || !text.trim()) return {};
    const d = Y().load(preHex(text), { json: true });   // json:true 容忍重複鍵(後者覆蓋)
    return isObj(d) ? d : {};
  }

  // patch 中的鍵既可寫成 "a/b": v,也可寫成嵌套 a: {b: v};統一攤平到一級
  function splitPatch(patch) {
    const style = {}, schemes = {}, other = {};
    for (const [k, v] of Object.entries(patch || {})) {
      if (k === 'style' && isObj(v)) Object.assign(style, v);
      else if (k.startsWith('style/')) style[k.slice(6)] = v;
      else if (k === 'preset_color_schemes' && isObj(v)) { for (const [id, sv] of Object.entries(v)) schemes[id] = Object.assign(schemes[id] || {}, sv); }
      else if (k.startsWith('preset_color_schemes/')) {
        const rest = k.slice('preset_color_schemes/'.length);
        const i = rest.indexOf('/');
        if (i < 0) schemes[rest] = isObj(v) ? Object.assign(schemes[rest] || {}, v) : v;
        else { const id = rest.slice(0, i); (schemes[id] = schemes[id] || {})[rest.slice(i + 1)] = v; }
      } else other[k] = v;
    }
    return { style, schemes, other };
  }

  function schemeFromRaw(id, raw, builtin) {
    const sc = { id, name: String(raw.name || id), author: raw.author != null ? String(raw.author) : '', color_space: raw.color_space || 'srgb',
      colors: {}, builtin: !!builtin, styleOv: {}, extra: {}, dropped: [] };
    for (const [k, v] of Object.entries(raw)) {
      if (MANAGED_SCHEME_META.has(k)) continue;
      if (COLOR_KEY_SET.has(k)) { const c = parseColor(v); if (c) sc.colors[k] = c; else sc.extra[k] = v; }
      else if (STYLE_KEYS.has(k)) sc.styleOv[k] = v;
      else if (OBSOLETE_SCHEME_KEYS.has(k)) sc.dropped.push(k);
      else sc.extra[k] = v;
    }
    // 顏色鍵按固定順序存放,保證「是否有改動」的判斷不受原文件鍵序影響
    const ordered = {};
    for (const ck of COLOR_KEYS) if (sc.colors[ck.k]) ordered[ck.k] = sc.colors[ck.k];
    sc.colors = ordered;
    return sc;
  }

  // ---------- 導入 ----------
  function importConfig(sqText, defText, builtinText) {
    const m = { style: {}, extraStyle: {}, schemes: {}, slots: { light: null, dark: null },
      menu: { page_size: 5, labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], form: 'flat', touched: false },
      extraSq: {}, extraDef: {}, extraMenu: {}, notes: [] };
    // 默認值
    for (const [k, d] of STYLE_SPEC) m.style[k] = d;
    // 內置(已合併)配置:作為基底
    let builtin = {};
    try { builtin = loadYaml(builtinText); } catch (e) { m.notes.push('無法解析 build/squirrel.yaml,改用內置默認值'); }
    const bStyle = isObj(builtin.style) ? builtin.style : {};
    for (const [k, v] of Object.entries(bStyle)) if (STYLE_KEYS.has(k)) m.style[k] = normStyleVal(k, v);
    const bSchemes = isObj(builtin.preset_color_schemes) ? builtin.preset_color_schemes : {};

    // 用戶 patch
    let sq = {};
    try { sq = loadYaml(sqText); } catch (e) { throw new Error('squirrel.custom.yaml 解析失敗:' + e.message); }
    const sp = splitPatch(isObj(sq.patch) ? sq.patch : {});
    const userSchemeIds = new Set(Object.keys(sp.schemes));
    for (const [id, raw] of Object.entries(bSchemes)) {
      if (!isObj(raw) || userSchemeIds.has(id)) continue;
      m.schemes[id] = schemeFromRaw(id, raw, true);
    }
    for (const [id, raw] of Object.entries(sp.schemes)) if (isObj(raw)) m.schemes[id] = schemeFromRaw(id, raw, false);

    let light = sp.style.color_scheme != null ? String(sp.style.color_scheme) : (bStyle.color_scheme != null ? String(bStyle.color_scheme) : 'native');
    let dark = sp.style.color_scheme_dark != null ? String(sp.style.color_scheme_dark) : light;
    for (const [k, v] of Object.entries(sp.style)) {
      if (k === 'color_scheme' || k === 'color_scheme_dark') continue;
      if (STYLE_KEYS.has(k)) m.style[k] = normStyleVal(k, v); else m.extraStyle[k] = v;
    }
    for (const id of [dark, light]) {              // 用戶方案內寫的樣式鍵(舊式寫法)併入全局
      const sc = m.schemes[id];
      if (sc && !sc.builtin && Object.keys(sc.styleOv).length) {
        for (const [k, v] of Object.entries(sc.styleOv)) m.style[k] = normStyleVal(k, v);
        m.notes.push(`方案「${sc.name}」里的字體/佈局設置已移到全局 style(行為不變,結構更清晰)`);
        sc.styleOv = {};
      }
    }
    for (const sc of Object.values(m.schemes)) if (!sc.builtin && sc.dropped.length) { m.notes.push(`方案「${sc.name}」里的過時鍵已清理:${sc.dropped.join('、')}`); sc.dropped = []; }
    if (!m.schemes[light]) { m.notes.push(`配色方案 ${light} 不存在,已改用 native`); light = 'native'; }
    if (!m.schemes[dark]) dark = light;
    if (!m.schemes[light]) m.schemes[light] = schemeFromRaw(light, { name: '系統配色' }, true);
    if (!m.schemes[dark]) m.schemes[dark] = m.schemes[light];
    m.slots.light = light; m.slots.dark = dark;
    m.extraSq = sp.other;

    // default.custom.yaml
    let df = {};
    try { df = loadYaml(defText); } catch (e) { m.notes.push('default.custom.yaml 解析失敗,候選數/序號按默認顯示,且不會被改寫'); m.defBroken = true; }
    const dpatch = isObj(df.patch) ? df.patch : {};
    for (const [k, v] of Object.entries(dpatch)) {
      if (k === 'menu' && isObj(v)) {
        m.menu.form = 'nested';
        for (const [mk, mv] of Object.entries(v)) {
          if (mk === 'page_size') m.menu.page_size = Number(mv);
          else if (mk === 'alternative_select_labels' && Array.isArray(mv)) m.menu.labels = mv.map(String);
          else m.extraMenu[mk] = mv;
        }
      } else if (k === 'menu/page_size') m.menu.page_size = Number(v);
      else if (k === 'menu/alternative_select_labels' && Array.isArray(v)) m.menu.labels = v.map(String);
      else m.extraDef[k] = v;
    }
    return m;
  }
  function normStyleVal(k, v) {
    const d = STYLE_SPEC.find(s => s[0] === k)[1];
    if (typeof d === 'number' || d === null) { if (v === '' || v == null) return d; const n = Number(v); return isNaN(n) ? d : n; }
    if (typeof d === 'boolean') return v === true || v === 'true';
    return v == null ? '' : String(v);
  }

  // ---------- YAML 寫 ----------
  const isScalar = (v) => v == null || typeof v !== 'object';
  const RESERVED = /^(true|false|null|yes|no|on|off|y|n|~|[-+]?(\d[\d_]*)(\.\d*)?([eE][-+]?\d+)?|[-+]?\.\d+|0[xXoObB][0-9a-fA-F]+|\.inf|\.nan)$/i;
  function scalar(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    const s = String(v);
    if (/^0x[0-9A-Fa-f]+$/.test(s)) return s;                    // 顏色保持原樣
    if (s === '' || /^\s|\s$|[\u0000-\u001f]/.test(s) || /^[-?:,\[\]{}#&*!|>'"%@`]/.test(s) || /: | #/.test(s) || RESERVED.test(s)) return JSON.stringify(s);
    return s;
  }
  const keyStr = (k) => (/^[A-Za-z0-9_]+$/.test(k) ? k : JSON.stringify(k));
  const flow = (arr) => '[ ' + arr.map(scalar).join(', ') + ' ]';
  function emitBlock(v, ind) {
    const pad = '  '.repeat(ind), out = [];
    if (Array.isArray(v)) {
      for (const x of v) {
        if (isObj(x) && Object.keys(x).length) { const sub = emitBlock(x, ind + 1); out.push(pad + '- ' + sub[0].trimStart()); out.push(...sub.slice(1)); }
        else if (Array.isArray(x)) out.push(pad + '- ' + flow(x));
        else out.push(pad + '- ' + scalar(x));
      }
    } else if (isObj(v)) {
      for (const [k, x] of Object.entries(v)) {
        if (isObj(x) && Object.keys(x).length) { out.push(pad + keyStr(k) + ':'); out.push(...emitBlock(x, ind + 1)); }
        else if (Array.isArray(x) && x.length) {
          if (x.every(isScalar)) out.push(pad + keyStr(k) + ': ' + flow(x));
          else { out.push(pad + keyStr(k) + ':'); out.push(...emitBlock(x, ind + 1)); }
        } else if (isObj(x)) out.push(pad + keyStr(k) + ': {}');
        else if (Array.isArray(x)) out.push(pad + keyStr(k) + ': []');
        else out.push(pad + keyStr(k) + ': ' + scalar(x));
      }
    }
    return out;
  }

  const HEADER = [
    '# 本文件由「Rime 外觀設計器」生成。可繼續手動編輯;再次用設計器套用時,',
    '# 注釋會被重寫(每次寫入前都會自動備份舊版本,可隨時還原)。'
  ];

  function genSquirrel(m) {
    const L = [...HEADER, 'patch:'];
    const put = (k, v) => L.push('  ' + JSON.stringify(k) + ': ' + scalar(v));
    put('style/color_scheme', m.slots.light);
    put('style/color_scheme_dark', m.slots.dark);
    for (const [k, , opt] of STYLE_SPEC) {
      const v = m.style[k];
      if (opt && (v === '' || v == null)) continue;
      put('style/' + k, v);
    }
    for (const [k, v] of Object.entries(m.extraStyle)) put('style/' + k, v);
    const mine = Object.values(m.schemes).filter(s => !s.builtin);
    mine.sort((a, b) => (usedRank(m, a.id) - usedRank(m, b.id)));
    for (const sc of mine) {
      L.push('');
      L.push('  ' + JSON.stringify('preset_color_schemes/' + sc.id) + ':');
      L.push('    name: ' + scalar(sc.name));
      if (sc.author) L.push('    author: ' + scalar(sc.author));
      L.push('    color_space: ' + scalar(sc.color_space || 'srgb'));
      for (const ck of COLOR_KEYS) { const c = sc.colors[ck.k]; if (c) L.push('    ' + ck.k + ': ' + toRimeColor(c)); }
      for (const [k, v] of Object.entries(sc.extra)) L.push(...emitBlock({ [k]: v }, 2));
    }
    if (Object.keys(m.extraSq).length) { L.push(''); L.push(...emitBlock(m.extraSq, 1)); }
    return L.join('\n') + '\n';
  }
  const usedRank = (m, id) => (id === m.slots.light ? 0 : id === m.slots.dark ? 1 : 2);

  function genDefault(m) {
    const L = [...HEADER, 'patch:'];
    const ps = Math.max(1, Math.min(9, Number(m.menu.page_size) || 5));
    const labels = padLabels(m.menu.labels, ps);
    if (m.menu.form === 'nested') {
      L.push('  menu:');
      L.push('    page_size: ' + ps);
      L.push('    alternative_select_labels: ' + flow(labels));
      for (const [k, v] of Object.entries(m.extraMenu)) L.push(...emitBlock({ [k]: v }, 2));
    } else {
      L.push('  "menu/page_size": ' + ps);
      L.push('  "menu/alternative_select_labels": ' + flow(labels));
    }
    if (Object.keys(m.extraDef).length) L.push(...emitBlock(m.extraDef, 1));
    return L.join('\n') + '\n';
  }
  // 序號數量必須 ≥ 每頁候選數;不足時用阿拉伯數字補齊
  function padLabels(labels, n) {
    const out = (labels || []).slice(0, n);
    while (out.length < n) out.push(String(out.length + 1));
    return out;
  }

  // 改動檢測用的快照:規範化(固定字段順序、固定方案順序),避免「同一內容、不同對象鍵序」造成誤報
  function snapSq(m) {
    const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const schemes = Object.values(m.schemes).filter(s => !s.builtin).sort(byId).map(s => [
      s.id, s.name, s.author || '', s.color_space || 'srgb',
      COLOR_KEYS.map(ck => (s.colors[ck.k] ? [ck.k, s.colors[ck.k].hex, s.colors[ck.k].a] : null)),
      JSON.stringify(s.extra || {})
    ]);
    return JSON.stringify([m.slots.light, m.slots.dark, STYLE_SPEC.map(([k]) => (m.style[k] === undefined ? null : m.style[k])), JSON.stringify(m.extraStyle), schemes]);
  }
  // 只比較真正會寫入文件的部分(序號只寫前 page_size 個)
  function snapDef(m) {
    const ps = Math.max(1, Math.min(9, Number(m.menu.page_size) || 5));
    return JSON.stringify([ps, padLabels((m.menu.labels || []).map(String), ps)]);
  }

  // 預覽用:取一個配色鍵的最終顏色(含回退鏈)
  function resolveColor(sc, key, fallbackMode) {
    const spec = COLOR_KEYS.find(c => c.k === key);
    if (sc && sc.colors[key]) return sc.colors[key];
    for (const fk of (spec && spec.fb) || []) { const r = resolveColor(sc, fk, fallbackMode); if (r) return r; }
    if (key === 'back_color') return rgbFromHex(fallbackMode === 'dark' ? '2b2b2b' : 'f6f6f6');
    if (key === 'text_color') return rgbFromHex(fallbackMode === 'dark' ? 'e8e8e8' : '222222');
    // 完全不指定顏色的方案(如「系統配色」):實際由 macOS 決定,預覽里用接近系統的藍色高亮示意
    if (sc && !Object.keys(sc.colors).length) {
      if (key === 'hilited_candidate_back_color') return rgbFromHex('0a64d6');
      if (key === 'hilited_candidate_text_color') return rgbFromHex('ffffff');
    }
    return null;
  }

  root.RC = { parseColor, toRimeColor, rgba, rgbFromHex, COLOR_KEYS, STYLE_SPEC, STYLE_KEYS, importConfig, genSquirrel, genDefault,
    padLabels, snapSq, snapDef, resolveColor, loadYaml, clone, isObj, scalar, normStyleVal };
})(typeof window !== 'undefined' ? window : globalThis);
