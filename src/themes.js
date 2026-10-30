// ===== 推薦主題:每套含淺/深兩個配色 + 字體 + 佈局組合 =====
// 配色用 RGB 十六進制,生成時再轉成 Rime 的 0xBBGGRR。
// p: bg 面板底色 / bd 邊框 / tx 文字 / lb 序號 / cm 註釋 / hi 選中底色 / ht 選中文字 / hl 選中序號與註釋
const THEMES = [
  {
    id: 'vaporwave', name: 'Vaporwave',
    light: { bg: 'F7F1FF', bd: 'E3D2FA', tx: '2B1B4A', lb: '0A8A9C', cm: '7B5FB0', hi: 'FF77D4', ht: '2B1048', hl: '6A2B7A' },
    dark:  { bg: '1B1035', bd: '3E2C73', tx: 'F2E9FF', lb: '3FE0F0', cm: 'A58BE0', hi: 'FF71CE', ht: '1B1035', hl: '5B1E5F' },
    font:   { face: 'Futura,PingFang TC', pt: 19, labelPt: 14, commentPt: 15 },
    layout: { corner: 14, hcorner: 10, bw: 6, bh: 3, line: 6, spacing: 10, shadow: 7, trans: false, orient: 'linear' },
    labels: 'fullwidth'
  },
  {
    id: 'sunset', name: 'Sunset Blvd',
    light: { bg: 'FFF4EC', bd: 'F4D9C9', tx: '3A1A26', lb: 'A5617A', cm: 'A0627A', hi: 'FF7A59', ht: '3A0F1A', hl: '7A2A22' },
    dark:  { bg: '1D0F23', bd: '45254F', tx: 'FFE8D9', lb: 'D391AA', cm: 'BE86A0', hi: 'FF8A5B', ht: '2B0F1E', hl: '7A2E2E' },
    font:   { face: 'Avenir Next,PingFang TC', pt: 19, labelPt: 14, commentPt: 15 },
    layout: { corner: 12, hcorner: 9, bw: 6, bh: 3, line: 6, spacing: 10, shadow: 6, trans: false, orient: 'linear' },
    labels: 'filled'
  },
  {
    id: 'obsidian', name: 'Obsidian',
    light: { bg: 'F7F7F9', bd: 'E2E2E8', tx: '1A1A1F', lb: '767684', cm: '767684', hi: '6D4AE6', ht: 'FFFFFF', hl: 'DCD3FF' },
    dark:  { bg: '121214', bd: '2B2B31', tx: 'E6E6EB', lb: '8A8A96', cm: '8A8A96', hi: '7155F0', ht: 'FFFFFF', hl: 'DCD4FF' },
    font:   { face: 'Helvetica Neue,PingFang TC', pt: 18, labelPt: 14, commentPt: 14 },
    layout: { corner: 10, hcorner: 7, bw: 6, bh: 3, line: 6, spacing: 10, shadow: 6, trans: false, orient: 'linear' },
    labels: 'arabic'
  },
  {
    id: 'graphite', name: 'Graphite',
    light: { bg: 'F5F5F7', bd: 'DCDCE0', tx: '1D1D1F', lb: '76767C', cm: '6E6E73', hi: 'D9DADF', ht: '111113', hl: '55565C' },
    dark:  { bg: '232326', bd: '3A3A3F', tx: 'E8E8EA', lb: '8E8E93', cm: '98989D', hi: '4A4B52', ht: 'FFFFFF', hl: 'C6C6CC' },
    font:   { face: 'Helvetica Neue,PingFang TC', pt: 17, labelPt: 14, commentPt: 14 },
    layout: { corner: 9, hcorner: 6, bw: 6, bh: 3, line: 6, spacing: 10, shadow: 6, trans: true, orient: 'linear' },
    labels: 'arabic'
  },
  {
    id: 'midtown', name: 'Midtown Manhattan',
    light: { bg: 'F2F3F5', bd: 'D8DCE2', tx: '14181F', lb: '566475', cm: '566475', hi: 'F7B500', ht: '14181F', hl: '4A3700' },
    dark:  { bg: '10141A', bd: '2A3340', tx: 'F2F4F7', lb: '8B9BB0', cm: '8B9BB0', hi: 'FFC72C', ht: '10141A', hl: '5A4300' },
    font:   { face: 'Helvetica Neue,PingFang TC', pt: 18, labelPt: 14, commentPt: 14 },
    layout: { corner: 6, hcorner: 3, bw: 6, bh: 3, line: 6, spacing: 10, shadow: 6, trans: false, orient: 'linear' },
    labels: 'filled'
  },
  {
    id: 'nordic', name: 'Nordic Frost',
    light: { bg: 'ECEFF4', bd: 'D8DEE9', tx: '2E3440', lb: '65748E', cm: '65748E', hi: '4C6A94', ht: 'FFFFFF', hl: 'DCE6F4' },
    dark:  { bg: '2E3440', bd: '434C5E', tx: 'ECEFF4', lb: '8F9BB3', cm: '8F9BB3', hi: '88C0D0', ht: '2E3440', hl: '3B4252' },
    font:   { face: 'Avenir Next,PingFang TC', pt: 18, labelPt: 14, commentPt: 14 },
    layout: { corner: 10, hcorner: 7, bw: 6, bh: 3, line: 6, spacing: 10, shadow: 5, trans: true, orient: 'linear' },
    labels: 'arabic'
  },
  {
    id: 'boston', name: 'Boston',
    light: { bg: 'F6F1E8', bd: 'E0D4C0', tx: '1F2A3A', lb: '8A5A4E', cm: '5F6E84', hi: '9A3B2F', ht: 'FFF6EC', hl: 'F2D2C6' },
    dark:  { bg: '0E1A2B', bd: '233650', tx: 'E9EEF6', lb: '8DA4C4', cm: '8DA4C4', hi: 'B84436', ht: 'FFFFFF', hl: 'FBD9D1' },
    font:   { face: 'Baskerville,PingFang TC', pt: 19, labelPt: 14, commentPt: 15 },
    layout: { corner: 8, hcorner: 5, bw: 6, bh: 3, line: 6, spacing: 11, shadow: 5, trans: false, orient: 'linear' },
    labels: 'roman'
  },
  {
    id: 'mint', name: 'Mint Sorbet',
    light: { bg: 'F2FBF7', bd: 'CDEBDF', tx: '1E3A32', lb: '4F8574', cm: '4F8574', hi: '6FE3BE', ht: '0F3B2E', hl: '1F6B55' },
    dark:  { bg: '0F1F1B', bd: '24443A', tx: 'DDF5EC', lb: '7FB5A2', cm: '7FB5A2', hi: '52D8AE', ht: '07241B', hl: '135E48' },
    font:   { face: 'Gill Sans,PingFang TC', pt: 19, labelPt: 14, commentPt: 15 },
    layout: { corner: 18, hcorner: 13, bw: 6, bh: 3, line: 6, spacing: 10, shadow: 5, trans: false, orient: 'linear' },
    labels: 'letters'
  }
];

const LABEL_PRESETS = [
  { id: 'arabic',    name: '阿拉伯數字', labels: ['1','2','3','4','5','6','7','8','9'] },
  { id: 'fullwidth', name: '全角數字',   labels: ['１','２','３','４','５','６','７','８','９'] },
  { id: 'filled',    name: '實心圈數字', labels: ['❶','❷','❸','❹','❺','❻','❼','❽','❾'] },
  { id: 'circled',   name: '帶圈數字',   labels: ['①','②','③','④','⑤','⑥','⑦','⑧','⑨'] },
  { id: 'roman',     name: '羅馬數字',   labels: ['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ'] },
  { id: 'letters',   name: '小寫字母',   labels: ['a','b','c','d','e','f','g','h','i'] },
  { id: 'paren',     name: '帶括號數字', labels: ['⑴','⑵','⑶','⑷','⑸','⑹','⑺','⑻','⑼'] },
  { id: 'hanzi',     name: '漢字數字',   labels: ['一','二','三','四','五','六','七','八','九'] },
  { id: 'suzhou',    name: '蘇州碼子',   labels: ['〡','〢','〣','〤','〥','〦','〧','〨','〩'] }
];

const FORMAT_PRESETS = [
  { f: '[label]. [candidate] [comment]', n: '默認(序號. 候選 註釋)' },
  { f: '[label][candidate] [comment]',   n: '序號緊貼候選' },
  { f: '[label] [candidate] [comment]',  n: '序號空格候選' },
  { f: '[label].[candidate][comment]',   n: '緊湊' },
  { f: '[candidate] [comment]',          n: '不顯示序號' },
  { f: '[label]. [candidate]',           n: '不顯示註釋' }
];

// 都是 macOS 自帶字體(Latin 字體缺 CJK 字形,後面接 PingFang TC 作回退)
const FONT_LIST = [
  'PingFang TC','PingFang SC','PingFang HK','Hiragino Sans','Hiragino Sans GB','Heiti TC','Lantinghei TC',
  'Helvetica Neue','Avenir','Avenir Next','Futura','Optima','Gill Sans','Menlo','Monaco','Lucida Grande',
  'Didot','Baskerville','Palatino','Georgia','Charter','Iowan Old Style','American Typewriter','Trebuchet MS','Verdana',
  'Songti TC','Songti SC','Kaiti TC','Yuanti TC','Source Han Sans TC','Source Han Serif TC','HanaMinA','HanaMinB','Jigmo'
];

const FONT_PAIRS = [
  { n: 'Helvetica Neue(中性)',     face: 'Helvetica Neue,PingFang TC' },
  { n: 'Avenir Next(圓潤現代)',    face: 'Avenir Next,PingFang TC' },
  { n: 'Futura(幾何、復古未來)',   face: 'Futura,PingFang TC' },
  { n: 'Optima(優雅人文)',         face: 'Optima,PingFang TC' },
  { n: 'Gill Sans(英倫)',          face: 'Gill Sans,PingFang TC' },
  { n: 'Menlo(等寬、程序員)',      face: 'Menlo,PingFang TC' },
  { n: 'Didot(時裝雜誌)',          face: 'Didot,PingFang TC' },
  { n: '蘋方(系統默認)',           face: 'PingFang TC' },
  { n: '罕用字友好(蘋方 + 花園明朝)', face: 'PingFang TC,HanaMinA,HanaMinB' }
];

// 預覽示例:before 是假窗口里輸入串前面已有的文字;候選都是該讀音下真實可成詞的選項,首選符合上下文
const SAMPLES = [
  { n: '日常聊天', before: '週末有空嗎?我們約個', preedit: 'shi jian',
    c: ['時間','事件','實踐','世間','時艱','詩箋','史鑑','試劍','十間'], m: [] },
  { n: '長詞聯想', before: '最近在讀一本談', preedit: 'ren gong zhi neng',
    c: ['人工智能','人工智慧','人工','人','任','忍','仁','認','刃'], m: [] },
  { n: '帶讀音註釋', before: '這首詩的第一個字', preedit: 'chang',
    c: ['長','常','場','唱','暢','嘗','腸','廠','昌'], m: ['cháng / zhǎng','cháng','chǎng','chàng','chàng','cháng','cháng','chǎng','chāng'] },
  { n: '古籍史料', before: '此事見於', preedit: 'shi ji',
    c: ['史籍','史記','詩集','世紀','實際','時機','事蹟','市集','試劑'], m: [] },
  { n: '中英混輸', before: '把這個頁面的', preedit: 'design',
    c: ['design','Design','DESIGN','designs','designer','designed','designing'], m: [] }
];
