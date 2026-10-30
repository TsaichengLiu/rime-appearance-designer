// ===== 候選框預覽渲染(近似鼠鬚管的真實效果)=====
(function (root) {
  'use strict';
  const RC = root.RC;

  // 字體鏈 → CSS font-family。Squirrel 用逗號分隔的字體名,這裏原樣轉成 CSS 並補上通用 CJK 回退
  function fam(s) {
    const parts = String(s || '').split(',').map(x => x.trim()).filter(Boolean);
    const q = parts.map(p => (/^[A-Za-z0-9_-]+$/.test(p) ? p : '"' + p.replace(/"/g, '') + '"'));
    return q.concat(['"PingFang TC"', '"Hiragino Sans"', '"Noto Sans CJK TC"', 'sans-serif']).join(',');
  }

  // 檢測某字體是否裝在本機:與兩種通用字體對比渲染寬度
  const _cv = document.createElement('canvas').getContext('2d');
  const _cache = {};
  function fontInstalled(name) {
    name = String(name || '').trim();
    if (!name) return true;
    if (name in _cache) return _cache[name];
    const t = 'mmmmmmmmmmlliWW中文國字體𠮷';
    const w = (f) => { _cv.font = '64px ' + f; return _cv.measureText(t).width; };
    const a = w('monospace'), b = w('serif');
    const q = '"' + name.replace(/"/g, '') + '"';
    const ok = w(q + ',monospace') !== a || w(q + ',serif') !== b;
    return (_cache[name] = ok);
  }

  // 解析 candidate_format → 片段列表
  function parseFormat(f) {
    const out = [];
    // 鼠鬚管的舊式寫法:%c = 序號,%@ = 候選(鼠鬚管自帶的幾個方案還在用)
    String(f == null ? '' : f).replace(/%c/g, '[label]').replace(/%@/g, '[candidate]').split(/(\[label\]|\[candidate\]|\[comment\])/).forEach(p => {
      if (!p) return;
      if (p === '[label]') out.push({ t: 'label' });
      else if (p === '[candidate]') out.push({ t: 'cand' });
      else if (p === '[comment]') out.push({ t: 'comment' });
      else out.push({ t: 'lit', s: p });
    });
    return out;
  }

  /**
   * opts: {style, scheme, mode, sample, labels, pageSize, hi, zoom, interactive, onPick}
   * 返回面板元素(已掛到 target 下)
   *
   * 幾何規則照鼠鬚管(SquirrelTheme / SquirrelPanel / SquirrelView)的原始碼來:
   *  - 面板內距:左右 = border_width + corner_radius,上下 = border_height + corner_radius(橫排、縱排都按屏幕方向算,不隨方向對調)
   *  - 邊框線寬 = min(border_width, border_height),畫在面板內側;必須有 border_color 才會畫,≤0 時不畫
   *  - stacked:每個候選獨佔一「行」(縱排時是一「列」,第一個在最右邊,往左排),高亮塊鋪滿整行(整列),
   *    行高 = 文字 + line_spacing;linear:候選用兩個空格連成一串(縱排時是一整列、從上到下),高亮塊只包住該候選
   *  - spacing 只管「預編輯」與候選區之間的距離(inline_preedit 關閉時才看得到)
   *  - shadow_size > 0 時,陰影畫在「高亮的候選」周圍,不是整個面板
   *  - show_paging:左側(縱排時是上側)留出一條放翻頁三角形
   */
  function renderPanel(target, o) {
    target.textContent = '';
    const st = Object.assign({}, o.style, (o.scheme && o.scheme.builtin) ? o.scheme.styleOv : {});
    const sc = o.scheme, mode = o.mode;
    const col = (k) => RC.resolveColor(sc, k, mode);
    const css = (c) => (c ? RC.rgba(c) : 'transparent');
    const vertical = st.text_orientation === 'vertical';
    const stacked = st.candidate_list_layout === 'stacked';
    const fp = Number(st.font_point) || 16;
    const lp = st.label_font_point != null && st.label_font_point !== '' ? Number(st.label_font_point) : fp;
    const cp = st.comment_font_point != null && st.comment_font_point !== '' ? Number(st.comment_font_point) : fp;
    const ffC = fam(st.font_face), ffL = fam(st.label_font_face || st.font_face), ffM = fam(st.comment_font_face || st.font_face);
    const bw = Number(st.border_width) || 0, bh = Number(st.border_height) || 0;
    const cr = Math.max(0, Number(st.corner_radius) || 0), hcr = Math.max(0, Number(st.hilited_corner_radius) || 0);
    const lineSp = Math.max(0, Number(st.line_spacing) || 0), spacing = Math.max(0, Number(st.spacing) || 0);
    const shadow = Math.max(0, Number(st.shadow_size) || 0);
    const scale = o.zoom && o.zoom !== 1 ? o.zoom : 1;

    // 屏幕方向的內距;along = 沿文字走向(橫排=左右,縱排=上下),stack = 垂直於走向(橫排=上下,縱排=左右)
    const exs = Math.max(0, bw + cr), eys = Math.max(0, bh + cr);
    const aIn = vertical ? eys : exs, sIn = vertical ? exs : eys;
    const lineW = Math.max(0, Math.min(bw, bh));
    const po = st.show_paging ? Math.max(8, Math.round(fp * 0.9)) : 0;   // 翻頁條寬度
    const gapSpacing = spacing + hcr / 2;                                // 預編輯與候選區之間

    const wrap = document.createElement('div');
    wrap.className = 'sq-wrap';
    if (scale !== 1) wrap.style.zoom = scale;
    const panel = document.createElement('div');
    panel.className = 'sq-panel' + (vertical ? ' v' : '');
    const back = col('back_color'), border = col('border_color');
    const trans = !!st.translucency;
    panel.style.background = css(back && trans ? Object.assign({}, back, { a: Math.round(back.a * 0.86) }) : back);
    if (trans) { panel.style.backdropFilter = 'blur(18px) saturate(1.3)'; panel.style.webkitBackdropFilter = 'blur(18px) saturate(1.3)'; }
    panel.style.borderRadius = cr + 'px';
    panel.style.boxShadow = `0 ${mode === 'dark' ? 6 : 5}px 18px rgba(0,0,0,${mode === 'dark' ? 0.55 : 0.26})`;
    if (po) { if (vertical) panel.style.paddingTop = po + 'px'; else panel.style.paddingLeft = po + 'px'; }

    const body = document.createElement('div');
    body.className = 'sq-body' + (vertical ? ' v' : '');
    // 疊放方向的外圍內距:stacked 的高亮塊自帶 line_spacing/2,所以這裏先扣掉
    const sPad = Math.max(0, sIn - (stacked ? lineSp / 2 : 0));
    const hasPre = !st.inline_preedit && !!o.sample.preedit;
    const setStackPad = (el, first, last) => {   // first/last:疊放方向起點(橫排=上,縱排=右)/終點內距
      if (vertical) { el.style.paddingRight = first + 'px'; el.style.paddingLeft = last + 'px'; }
      else { el.style.paddingTop = first + 'px'; el.style.paddingBottom = last + 'px'; }
    };
    const setAlongPad = (el, v) => { if (vertical) { el.style.paddingTop = v + 'px'; el.style.paddingBottom = v + 'px'; } else { el.style.paddingLeft = v + 'px'; el.style.paddingRight = v + 'px'; } };
    setStackPad(body, hasPre ? sIn : sPad, sPad);

    // 輸入串(未內嵌時顯示在面板裏)
    if (hasPre) {
      const pre = document.createElement('div');
      pre.className = 'sq-pre';
      pre.style.cssText = `font:${fp}px ${ffC};color:${css(col('text_color'))};line-height:1.25`;
      setAlongPad(pre, aIn);
      const pb = col('preedit_back_color');
      if (pb) { pre.style.background = css(pb); pre.style.borderRadius = hcr + 'px'; }
      if (vertical) pre.style.marginLeft = gapSpacing + 'px'; else pre.style.marginBottom = gapSpacing + 'px';
      pre.textContent = o.sample.preedit + '‸';
      body.appendChild(pre);
    }

    const list = document.createElement('div');
    list.className = 'sq-list ' + (stacked ? 'stacked' : 'linear');
    const padAlongLin = Math.round(Math.max(3, hcr * 0.6 + 2));
    if (stacked) {
      // 每個候選是一整行/整列,高亮塊鋪滿;文字距面板邊緣 aIn
    } else {
      setAlongPad(list, Math.max(0, aIn - padAlongLin));
      const g = Math.max(2, Math.round(fp * 0.6) - padAlongLin);
      list.style.gap = g + 'px';
    }
    const fmt = parseFormat(st.candidate_format);
    const n = Math.min(o.pageSize || 7, o.sample.c.length);
    let firstItem = null;
    for (let i = 0; i < n; i++) {
      const hl = i === o.hi;
      const item = document.createElement('div');
      item.className = 'sq-item' + (hl ? ' hi' : '');
      if (stacked) {
        setAlongPad(item, aIn);
        const h2 = lineSp / 2;
        if (vertical) { item.style.paddingRight = h2 + 'px'; item.style.paddingLeft = h2 + 'px'; }
        else { item.style.paddingTop = h2 + 'px'; item.style.paddingBottom = h2 + 'px'; }
      } else {
        const ps = Math.round(lineSp / 2);
        if (vertical) { item.style.padding = `${padAlongLin}px ${ps}px`; }
        else { item.style.padding = `${ps}px ${padAlongLin}px`; }
      }
      item.style.borderRadius = hcr + 'px';
      const bgc = hl ? col('hilited_candidate_back_color') : col('candidate_back_color');
      item.style.background = css(bgc);
      if (hl && shadow > 0) item.style.boxShadow = `${shadow / 2}px ${shadow / 2}px ${shadow}px rgba(0,0,0,${mode === 'dark' ? 0.5 : 0.32})`;
      const cCand = hl ? col('hilited_candidate_text_color') : col('candidate_text_color');
      const cLab = hl ? col('hilited_candidate_label_color') : col('label_color');
      const cCom = hl ? col('hilited_comment_text_color') : col('comment_text_color');
      const comment = (o.sample.m && o.sample.m[i]) || '';
      for (const p of fmt) {
        const sp = document.createElement('span');
        if (p.t === 'label') { sp.textContent = (o.labels && o.labels[i]) != null ? o.labels[i] : String(i + 1); sp.style.cssText = `font:${lp}px ${ffL};color:${css(cLab)}`; }
        else if (p.t === 'lit') { sp.textContent = p.s; sp.style.cssText = `font:${lp}px ${ffL};color:${css(cLab)};white-space:pre`; }
        else if (p.t === 'cand') { sp.textContent = o.sample.c[i]; sp.style.cssText = `font:${fp}px ${ffC};color:${css(cCand)}`; }
        else { sp.textContent = comment; sp.style.cssText = `font:${cp}px ${ffM};color:${css(cCom)}`; if (!comment) sp.style.display = 'none'; }
        sp.style.lineHeight = '1.25';
        item.appendChild(sp);
      }
      if (o.interactive) { item.style.cursor = 'pointer'; item.addEventListener('click', () => o.onPick && o.onPick(i)); }
      list.appendChild(item);
      if (!firstItem) firstItem = item;
    }
    body.appendChild(list);
    panel.appendChild(body);

    // 邊框:畫在面板內側,蓋在高亮塊上面
    if (lineW > 0 && border && border.a > 0) {
      const bd = document.createElement('div');
      bd.className = 'sq-bd';
      bd.style.borderRadius = cr + 'px';
      bd.style.boxShadow = `inset 0 0 0 ${lineW}px ${css(border)}`;
      panel.appendChild(bd);
    }
    wrap.appendChild(panel);
    target.appendChild(wrap);

    // 翻頁三角形:放在預留的條裏,對着第一個候選(可上翻的才實心;示例是第一頁,所以「上翻」淡化)
    if (po && firstItem) {
      const pr = panel.getBoundingClientRect(), fr = firstItem.getBoundingClientRect();
      const r = Math.max(3, Math.min(po / 2, 2 * Math.max(fr.height, fr.width) / scale / 9 * 1.0));
      const lbl = css(col('label_color') || col('text_color'));
      const mk = (dir, dim) => {
        const s = document.createElement('i');
        s.className = 'sq-tri'; s.style.cssText = `border-color:transparent;opacity:${dim ? 0.28 : 0.9}`;
        const w = r * 1.7, hh = r * 1.5;
        if (dir === 'up') s.style.cssText += `;border-width:0 ${w / 2}px ${hh}px ${w / 2}px;border-bottom-color:${lbl}`;
        else if (dir === 'down') s.style.cssText += `;border-width:${hh}px ${w / 2}px 0 ${w / 2}px;border-top-color:${lbl}`;
        else if (dir === 'left') s.style.cssText += `;border-width:${w / 2}px ${hh}px ${w / 2}px 0;border-right-color:${lbl}`;
        else s.style.cssText += `;border-width:${w / 2}px 0 ${w / 2}px ${hh}px;border-left-color:${lbl}`;
        return s;
      };
      const strip = document.createElement('div');
      strip.className = 'sq-pgstrip';
      if (!vertical) {      // 左側一條:上翻在上、下翻在下,對着第一行
        const top = (fr.top - pr.top) / scale, hgt = fr.height / scale;
        strip.style.cssText = `left:0;width:${po}px;top:${top}px;height:${hgt}px;flex-direction:column;justify-content:space-around`;
        strip.append(mk('up', true), mk('down', false));
      } else {              // 上側一條(內容順時針轉了 90°):左邊是「下翻」,右邊是「上翻」,對着第一列
        const left = (fr.left - pr.left) / scale, wd = fr.width / scale;
        strip.style.cssText = `top:0;height:${po}px;left:${left}px;width:${wd}px;flex-direction:row;justify-content:space-around`;
        strip.append(mk('left', false), mk('right', true));
      }
      panel.appendChild(strip);
    }
    panel._geo = { vertical, po };
    return panel;
  }

  // 把面板放到「光標」旁邊(照鼠鬚管 SquirrelPanel.show 的規則):
  //  橫排:面板左緣對齊光標(翻頁條向左多出一條),頂緣在光標下方 5px
  //  縱排:面板右緣在光標左邊 5px,頂緣在光標下方(翻頁條向上多出一條),整體往下、往左展開
  // slot 是定位在舞台裏的容器;太寬時橫排整體縮小,縱排太高時舞台自己長高。
  function placePanel(stage, slot, caretEl, panel, avail) {
    const geo = panel._geo || {}, wrap = panel.parentElement;
    wrap.style.zoom = 1; stage.style.minHeight = '';
    const sr = stage.getBoundingClientRect(), cr = caretEl.getBoundingClientRect();
    const cx = cr.left - sr.left, cb = cr.bottom - sr.top;
    let w = panel.offsetWidth, h = panel.offsetHeight;
    const maxW = (avail || sr.width) - 12;
    let z = 1;
    if (w > maxW && maxW > 100) z = maxW / w;
    // 縱排的 linear 是一整列、從上到下,候選多時很高:預覽最多縮到 0.7 倍,讓舞台高度保持在 560px 左右
    if (geo.vertical) z = Math.min(z, Math.max(0.7, (560 - (cb + 5)) / h));
    if (z < 1) { wrap.style.zoom = z.toFixed(3); w *= z; h *= z; }
    let left, top;
    const po = (geo.po || 0) * z;
    if (geo.vertical) { left = cx - 5 - w; top = cb + 5 - po; }
    else { left = cx - po; top = cb + 5; }
    left = Math.max(6, Math.min(left, sr.width - w - 6));
    slot.style.left = left + 'px'; slot.style.top = top + 'px';
    stage.style.minHeight = Math.max(250, Math.ceil(top + h + 16)) + 'px';
  }

  root.PV = { renderPanel, placePanel, fontInstalled, fam, parseFormat };
})(window);
