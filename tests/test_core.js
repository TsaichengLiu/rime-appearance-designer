// 核心邏輯測試:讀入配置 → 生成 YAML → 再讀入,語義必須完全不變
// 用法: node tests/test_core.js
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..');
globalThis.jsyaml = require(path.join(R, 'vendor/js-yaml/js-yaml.min.js'));
require(path.join(R, 'src/core.js'));
const RC = globalThis.RC;
const F = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');
let ok = 0, bad = 0;
const check = (name, cond, extra) => { if (cond) { ok++; console.log('  ok  ', name); } else { bad++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const sq = F('squirrel.custom.yaml'), df = F('default.custom.yaml'), bi = F('squirrel.yaml');
const m = RC.importConfig(sq, df, bi);
console.log('— 導入');
check('淺色/深色都指向 night_owl', m.slots.light === 'night_owl' && m.slots.dark === 'night_owl', m.slots);
check('內置方案被識別為只讀', m.schemes.aqua.builtin && m.schemes.luna.builtin && !m.schemes.night_owl.builtin);
check('方案裏的舊式樣式鍵移到全局 style', m.style.font_point === 20 && m.style.candidate_list_layout === 'linear' && Object.keys(m.schemes.night_owl.styleOv).length === 0, m.style);
check('過時鍵 horizontal 被清理並記錄', m.notes.some((n) => n.includes('horizontal')), m.notes);
check('顏色 0xBBGGRR → #rrggbb', m.schemes.night_owl.colors.back_color.hex === '#1a1f2b', m.schemes.night_owl.colors.back_color);
check('帶透明度的顏色 0xAABBGGRR', m.schemes.night_owl.colors.text_color.a === 0x7f && m.schemes.night_owl.colors.text_color.hex === '#ffffff');
check('每頁候選數與序號', m.menu.page_size === 7 && m.menu.labels.join('') === '〡〢〣〤〥〦〧');
check('default.custom.yaml 的其他鍵原樣保留', !!m.extraDef.schema_list);

console.log('— 生成與往返');
const outSq = RC.genSquirrel(m), outDf = RC.genDefault(m);
check('生成的 YAML 能被解析', !!jsyaml.load(outSq) && !!jsyaml.load(outDf));
check('同時寫出 color_scheme 與 color_scheme_dark', /"style\/color_scheme": night_owl/.test(outSq) && /"style\/color_scheme_dark": night_owl/.test(outSq));
check('內置方案不會被複製進用戶配置', !/preset_color_schemes\/aqua/.test(outSq));
check('顏色寫回 Rime 格式', /back_color: 0x2B1F1A/.test(outSq) && /text_color: 0x7FFFFFFF/.test(outSq), outSq);
const m2 = RC.importConfig(outSq, outDf, bi);
check('往返:slots', same(m.slots, m2.slots));
check('往返:style', same(m.style, m2.style));
check('往返:方案顏色', same(m.schemes.night_owl.colors, m2.schemes.night_owl.colors));
check('往返:候選數與序號', same([m.menu.page_size, m.menu.labels], [m2.menu.page_size, m2.menu.labels]));
check('往返:改動檢測快照一致', RC.snapSq(m) === RC.snapSq(m2) && RC.snapDef(m) === RC.snapDef(m2));

console.log('— 分開淺色/深色');
m.slots.light = 'aqua';
const outSq2 = RC.genSquirrel(m), m3 = RC.importConfig(outSq2, outDf, bi);
check('淺色用內置 aqua、深色用 night_owl', m3.slots.light === 'aqua' && m3.slots.dark === 'night_owl', m3.slots);

console.log('— 顏色換算');
for (const v of ['0x123456', '0xFF123456', '0x80ABCDEF']) check('往返 ' + v, RC.toRimeColor(RC.parseColor(v)).toUpperCase() === v.toUpperCase().replace(/^0XFF/, '0X'), RC.toRimeColor(RC.parseColor(v)));
check('序號不足時用數字補齊', same(RC.padLabels(['a', 'b'], 4), ['a', 'b', '3', '4']));

console.log(`\n結果: ${ok} 通過 ${bad} 失敗`);
process.exit(bad ? 1 : 0);
