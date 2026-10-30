// 推薦主題的對比度檢查(WCAG):文字 ≥ 4.5,序號/註釋 ≥ 3。用法: node tests/contrast.js
const fs=require("fs");eval(fs.readFileSync(require("path").join(__dirname,"../src/themes.js"),"utf8").replace(/^const /gm,"var "));
const L=h=>{h=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(c=>c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4));return .2126*h[0]+.7152*h[1]+.0722*h[2]};
const cr=(a,b)=>{const x=L(a),y=L(b);return ((Math.max(x,y)+.05)/(Math.min(x,y)+.05))};
let bad=0,n=0;
const variants=[];
for(const t of THEMES){
  if(t.accents){ t.accents.forEach((a,i)=>variants.push([t.name+"/"+a.n,t,Object.assign({},a)])) } else variants.push([t.name,t,null]);
}
for(const [nm,t,acc] of variants) for(const m of["light","dark"]){
  const p=Object.assign({},t[m],acc||{});
  for(const [lab,a,b,lim] of [["文字/底",p.tx,p.bg,4.5],["序號/底",p.lb,p.bg,3],["註釋/底",p.cm,p.bg,3],["選中字/選中底",p.ht,p.hi,4.5],["選中序號註釋/選中底",p.hl,p.hi,3],["選中底/面板底",p.hi,p.bg,1.12]]){
    n++; const r=cr(a,b); if(r<lim){bad++;console.log("LOW",nm,m,lab,r.toFixed(2),"需≥"+lim,a,b)}}}
console.log("檢查",n,"項,不達標",bad);
process.exit(bad?1:0);
