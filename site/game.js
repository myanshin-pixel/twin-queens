/* Twin Queens — game UI (vs computer / two players on one device) */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const boardEl=$('board');
let LANG=tqLang(),T=TQ_I18N[LANG];
const PIECE=(c,t)=>'assets/pieces/'+c+t.toUpperCase()+'.svg';
const img=(c,t,cls)=>'<img class="'+(cls||'')+'" src="'+PIECE(c,t)+'" alt="" draggable="false">';

let settings={mode:'pc',side:'w',level:2,time:600};
let G=null,flipped=false,selected=null,targets=[],thinking=false,reqId=0,promoPending=null,overlayHidden=false,drag=null;

/* ---------- engine worker ---------- */
let worker=null;
try{
  worker=new Worker('engine-worker.js');
  worker.onmessage=e=>{if(worker&&worker._finish&&e.data.id===worker._id){const f=worker._finish;worker._finish=null;f(e.data.m)}};
  worker.onerror=()=>{const f=worker&&worker._finish,id=worker&&worker._id;worker=null;if(f){const s=cur();setTimeout(()=>{if(id===reqId)f(bestMove(s,G.level))},20)}};
}catch(e){worker=null}

/* ---------- helpers ---------- */
const cur=()=>G.states[G.states.length-1];
const sqName=i=>FILES[i%F]+(((i/F)|0)+1);
function key(s){return s.b.map(p=>p||'.').join('')+s.t+(s.c.K?'K':'')+(s.c.Q?'Q':'')+(s.c.k?'k':'')+(s.c.q?'q':'')+s.ep}
function humanCan(c){return G.mode==='pvp'||c===G.human}
function san(s,m,legal){
  let str;const p=s.b[m.from],t=p.toLowerCase(),capture=!!s.b[m.to]||m.flag==='e';
  if(m.flag==='K')str='O-O';
  else if(m.flag==='Q')str='O-O-O';
  else if(t==='p')str=(capture?FILES[m.from%F]+'x':'')+sqName(m.to)+(m.promo?'='+m.promo.toUpperCase():'');
  else{
    const amb=legal.filter(o=>o.to===m.to&&o.from!==m.from&&s.b[o.from]===p);
    let dis='';
    if(amb.length){
      const sf=amb.some(o=>o.from%F===m.from%F),sr=amb.some(o=>((o.from/F)|0)===((m.from/F)|0));
      dis=!sf?FILES[m.from%F]:!sr?String(((m.from/F)|0)+1):sqName(m.from);
    }
    str=t.toUpperCase()+dis+(capture?'x':'')+sqName(m.to);
  }
  const ns=apply(s,m);
  if(inCheck(ns))str+=legalMoves(ns).length?'+':'#';
  return str;
}
/* results are stored as codes so they re-translate when the language changes */
function detectEnd(s){
  const moves=legalMoves(s);
  if(!moves.length){
    if(inCheck(s))return {score:s.t==='w'?'0–1':'1–0',code:'mate',who:opp(s.t)};
    return {score:'½–½',code:'stalemate',who:s.t};
  }
  if(s.hm>=100)return {score:'½–½',code:'fifty'};
  const k=key(s);if(G.keys.filter(x=>x===k).length>=3)return {score:'½–½',code:'threefold'};
  const rest=s.b.filter(p=>p&&p.toLowerCase()!=='k');
  if(!rest.length||(rest.length===1&&'nb'.includes(rest[0].toLowerCase())))return {score:'½–½',code:'material'};
  return null;
}
function resText(r){
  switch(r.code){
    case 'mate':return [T.mate,T.won[r.who]];
    case 'stalemate':return [T.stalemate,T.noMoves[r.who]];
    case 'timeout':return [T.timeout,T.wonTime[r.who]];
    default:return [T.draw,T[r.code]];
  }
}

/* ---------- persistence (resume the game after closing the app) ---------- */
function save(){try{localStorage.setItem('tq-game',JSON.stringify({G,settings,flipped}))}catch(e){}}
function load(){try{const d=JSON.parse(localStorage.getItem('tq-game')||'null');if(d&&d.G&&d.G.states&&d.settings)return d}catch(e){}return null}

/* ---------- game flow ---------- */
function newGame(){
  reqId++;thinking=false;selected=null;targets=[];promoPending=null;overlayHidden=false;
  if(worker)worker._finish=null;
  const s0=startState();
  const human=settings.side==='r'?(Math.random()<.5?'w':'b'):settings.side;
  G={states:[s0],hist:[],keys:[key(s0)],result:null,human,mode:settings.mode,level:settings.level,
     time:settings.time,clocks:{w:settings.time*1000,b:settings.time*1000},tickAt:0};
  flipped=settings.mode==='pc'&&human==='b';
  render();save();maybeEngine();
}
function doMove(m){
  const s=cur(),legal=legalMoves(s);
  const real=legal.find(o=>o.from===m.from&&o.to===m.to&&(o.promo||null)===(m.promo||null));
  if(!real)return;
  const sanStr=san(s,real,legal);
  const ns=apply(s,real);
  G.states.push(ns);G.hist.push({m:real,san:sanStr,mover:s.t});G.keys.push(key(ns));
  G.tickAt=performance.now();
  G.result=detectEnd(ns);
  selected=null;targets=[];
  render();save();maybeEngine();
}
function maybeEngine(){
  if(G.result||G.mode!=='pc'||cur().t===G.human)return;
  thinking=true;renderStatus();
  const id=++reqId,s=cur(),level=G.level,started=performance.now();
  const finish=m=>{const wait=Math.max(0,350-(performance.now()-started));setTimeout(()=>onEngine(id,m),wait)};
  if(worker){worker._finish=finish;worker._id=id;worker.postMessage({id,s,level})}
  else setTimeout(()=>{if(id!==reqId)return;finish(bestMove(s,level))},40);
}
function onEngine(id,m){
  if(id!==reqId||G.result)return;
  thinking=false;
  if(m)doMove(m);else render();
}
function undo(){
  if(G.hist.length===0)return;
  if(thinking){reqId++;thinking=false;if(worker)worker._finish=null}
  const pop=()=>{G.states.pop();G.hist.pop();G.keys.pop()};
  pop();
  if(G.mode==='pc'&&cur().t!==G.human&&G.hist.length)pop();
  G.result=null;overlayHidden=false;selected=null;targets=[];promoPending=null;G.tickAt=performance.now();
  render();save();maybeEngine();
}

/* ---------- clock ---------- */
setInterval(()=>{
  if(!G||G.result||!G.time||G.hist.length===0)return;
  const now=performance.now(),t=cur().t;
  G.clocks[t]-=now-G.tickAt;G.tickAt=now;
  if(G.clocks[t]<=0){
    G.clocks[t]=0;reqId++;thinking=false;
    G.result={score:t==='w'?'0–1':'1–0',code:'timeout',who:opp(t)};
    selected=null;targets=[];render();save();return;
  }
  renderClocks();
},100);
setInterval(()=>{if(G&&G.time&&!G.result&&G.hist.length)save()},2000);
function fmt(ms){
  ms=Math.max(0,ms);const tot=Math.ceil(ms/1000),m=Math.floor(tot/60),s=tot%60;
  if(ms<20000){const t=(ms/1000).toFixed(1);return '0:'+(t.length<4?'0':'')+t}
  return m+':'+String(s).padStart(2,'0');
}

/* ---------- rendering ---------- */
function displayOrder(){
  const out=[];
  for(let row=0;row<R;row++)for(let c=0;c<F;c++){
    const r=flipped?row:R-1-row,f=flipped?F-1-c:c;out.push(r*F+f);
  }
  return out;
}
function renderBoard(){
  const s=cur(),last=G.hist.length?G.hist[G.hist.length-1].m:null;
  const chk=inCheck(s)?kingSq(s.b,s.t):-1;
  boardEl.classList.toggle('flipped',flipped);
  let html='';
  displayOrder().forEach((i,idx)=>{
    const f=i%F,r=(i/F)|0,light=(f+r)%2===1;
    let cls='sq '+(light?'l':'d');
    if(last&&(i===last.from||i===last.to))cls+=' last';
    if(i===selected)cls+=' sel';
    if(i===chk)cls+=' check';
    const tg=targets.find(m=>m.to===i);
    if(tg)cls+=(s.b[i]||tg.flag==='e')?' cap':' move';
    if(drag&&drag.moved&&drag.from===i)cls+=' dragfrom';
    let inner='';
    if(idx%F===0)inner+='<span class="coord rk">'+(r+1)+'</span>';
    if(idx>=F*(R-1))inner+='<span class="coord fl">'+FILES[f]+'</span>';
    const p=s.b[i];
    if(p)inner+=img(col(p),p.toLowerCase(),'piece');
    html+='<div class="'+cls+'" data-sq="'+i+'">'+inner+'</div>';
  });
  if(promoPending){
    html+='<div class="overlay"><div class="card"><h2>'+T.promo+'</h2><p>'+T.promoSub+'</p><div class="promo">'+
      ['q','r','b','n'].map(t=>'<button data-promo="'+t+'" aria-label="'+t+'">'+img(s.t,t)+'</button>').join('')+'</div></div></div>';
  }else if(G.result&&!overlayHidden){
    const [title,detail]=resText(G.result);
    html+='<div class="overlay"><div class="card"><div class="score gold">'+G.result.score+'</div><h2>'+title+'</h2><p>'+detail+'</p>'+
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn primary" data-act="again">'+T.again+'</button><button class="btn" data-act="view">'+T.view+'</button></div></div></div>';
  }
  boardEl.innerHTML=html;
}
function material(b){
  const cnt={w:{p:0,n:0,b:0,r:0,q:0},b:{p:0,n:0,b:0,r:0,q:0}};let w=0,bl=0;
  b.forEach(p=>{if(!p)return;const t=p.toLowerCase();if(t==='k')return;cnt[col(p)][t]++;if(col(p)==='w')w+=VAL[t];else bl+=VAL[t]});
  return {cnt,w,b:bl};
}
const START={p:9,n:2,b:2,r:2,q:2};
function renderBar(el,c){
  const s=cur(),mat=material(s.b),o=opp(c);
  let name,sub='';
  if(G.mode==='pvp')name=c==='w'?T.white:T.black;
  else if(c===G.human)name=T.you;
  else{name=T.computer;sub=T.levels[G.level-1]}
  let caps='';
  ['q','r','b','n','p'].forEach(t=>{const miss=Math.max(0,START[t]-mat.cnt[o][t]);for(let k=0;k<miss;k++)caps+=img(o,t)});
  const diff=Math.round(((c==='w'?mat.w-mat.b:mat.b-mat.w))/100);
  if(diff>0)caps+='<span class="adv">+'+diff+'</span>';
  el.innerHTML='<div class="avatar '+c+'">'+img(c,'k')+'</div>'+
    '<div class="pinfo"><div class="pname">'+name+(sub?'<small>'+sub+'</small>':'')+'</div><div class="caps">'+caps+'</div></div>'+
    (G.time?'<div class="clock" data-clock="'+c+'"></div>':'');
}
function renderClocks(){
  document.querySelectorAll('[data-clock]').forEach(el=>{
    const c=el.dataset.clock,ms=G.clocks[c];
    el.textContent=fmt(ms);
    el.classList.toggle('on',!G.result&&cur().t===c&&G.hist.length>0);
    el.classList.toggle('low',ms<30000);
  });
}
function renderStatus(){
  const el=$('status'),s=cur();
  el.classList.toggle('end',!!G.result);
  if(G.result){const [a,b]=resText(G.result);el.innerHTML=a+' · '+b+' <span style="margin-left:auto;font-family:var(--f-mono)">'+G.result.score+'</span>';return}
  let txt=G.mode==='pc'?(s.t===G.human?T.yourMove:T.pcMove):T.moveOf[s.t];
  if(inCheck(s))txt+=T.check;
  el.innerHTML='<span class="dot '+s.t+'"></span>'+txt+(thinking?'<span class="thinking"><i></i><i></i><i></i></span>':'');
}
function renderMoves(){
  const el=$('moves');
  if(!G.hist.length){el.innerHTML='<div class="empty">'+T.movesHint+'</div>';return}
  let html='';
  for(let i=0;i<G.hist.length;i+=2){
    const a=G.hist[i],b=G.hist[i+1],last=G.hist.length-1;
    html+='<div class="mrow"><span class="n">'+(i/2+1)+'.</span><span class="'+(i===last?'cur':'')+'">'+a.san+'</span><span class="'+(i+1===last?'cur':'')+'">'+(b?b.san:'')+'</span></div>';
  }
  el.innerHTML=html;el.scrollTop=el.scrollHeight;
}
function render(){
  renderBoard();
  renderBar($('topBar'),flipped?'w':'b');
  renderBar($('botBar'),flipped?'b':'w');
  renderClocks();renderStatus();renderMoves();
  $('undoBtn').disabled=!G.hist.length;
}

/* ---------- input ---------- */
function sqFromPoint(x,y){const el=document.elementFromPoint(x,y);const sq=el&&el.closest&&el.closest('.sq');return sq&&boardEl.contains(sq)?+sq.dataset.sq:null}
function canInteract(){return !G.result&&!thinking&&!promoPending&&humanCan(cur().t)}
function trySelect(i){
  const s=cur(),p=s.b[i];
  if(p&&col(p)===s.t&&humanCan(s.t)){selected=i;targets=legalMoves(s).filter(m=>m.from===i);return true}
  return false;
}
function attempt(from,to){
  const opts=targets.filter(m=>m.from===from&&m.to===to);
  if(!opts.length)return false;
  if(opts.length>1&&opts[0].promo){promoPending={from,to};render();return true}
  doMove(opts[0]);return true;
}
boardEl.addEventListener('pointerdown',e=>{
  const pb=e.target.closest('[data-promo]');
  if(pb){const t=pb.dataset.promo,pp=promoPending;promoPending=null;doMove({from:pp.from,to:pp.to,promo:t});return}
  const act=e.target.closest('[data-act]');
  if(act){if(act.dataset.act==='again')newGame();else{overlayHidden=true;render()}return}
  if(e.button!==undefined&&e.button!==0)return;
  const sqEl=e.target.closest('.sq');if(!sqEl||!canInteract())return;
  const i=+sqEl.dataset.sq;
  if(selected!==null&&i!==selected&&attempt(selected,i))return;
  const wasSel=selected===i;
  if(!trySelect(i)){selected=null;targets=[];render();return}
  render();
  const size=boardEl.getBoundingClientRect().width/F;
  drag={from:i,x0:e.clientX,y0:e.clientY,moved:false,wasSel,size,ghost:null,hover:null};
  try{boardEl.setPointerCapture(e.pointerId)}catch(_){}
  e.preventDefault();
});
boardEl.addEventListener('pointermove',e=>{
  if(!drag)return;
  if(!drag.moved&&Math.hypot(e.clientX-drag.x0,e.clientY-drag.y0)<5)return;
  if(!drag.moved){
    drag.moved=true;
    const p=cur().b[drag.from];
    const g=document.createElement('img');
    g.className='ghost';g.src=PIECE(col(p),p.toLowerCase());g.style.width=g.style.height=(drag.size*1.05)+'px';
    document.body.appendChild(g);drag.ghost=g;
    const fromEl=boardEl.querySelector('[data-sq="'+drag.from+'"]');if(fromEl)fromEl.classList.add('dragfrom');
  }
  drag.ghost.style.left=e.clientX+'px';drag.ghost.style.top=e.clientY+'px';
  const h=sqFromPoint(e.clientX,e.clientY);
  if(h!==drag.hover){
    if(drag.hover!==null){const o=boardEl.querySelector('[data-sq="'+drag.hover+'"]');if(o)o.classList.remove('hover')}
    drag.hover=h;
    if(h!==null&&targets.some(m=>m.to===h)){const o=boardEl.querySelector('[data-sq="'+h+'"]');if(o)o.classList.add('hover')}
  }
});
function endDrag(e,cancel){
  if(!drag)return;
  const d=drag;drag=null;
  if(d.ghost)d.ghost.remove();
  if(cancel){render();return}
  if(d.moved){
    const to=sqFromPoint(e.clientX,e.clientY);
    if(to!==null&&to!==d.from&&attempt(d.from,to))return;
    render();
  }else if(d.wasSel){selected=null;targets=[];render()}
}
boardEl.addEventListener('pointerup',e=>endDrag(e,false));
boardEl.addEventListener('pointercancel',e=>endDrag(e,true));

/* ---------- controls ---------- */
const selMode=$('selMode'),selSide=$('selSide'),selLevel=$('selLevel'),selTime=$('selTime');
function fillSelects(){
  const opt=(v,t)=>'<option value="'+v+'">'+t+'</option>';
  selMode.innerHTML=opt('pc',T.computer)+opt('pvp',T.friend);
  selSide.innerHTML=opt('w',T.white)+opt('b',T.black)+opt('r',T.random);
  selLevel.innerHTML=T.levels.map((n,i)=>opt(i+1,n)).join('');
  selTime.innerHTML=opt(0,T.noClock)+[1,3,5,10,15,30].map(m=>opt(m*60,m+' '+T.min)).join('');
  selMode.value=settings.mode;selSide.value=settings.side;selLevel.value=String(settings.level);selTime.value=String(settings.time);
  selSide.disabled=selLevel.disabled=settings.mode==='pvp';
}
function applyLang(){
  T=TQ_I18N[LANG];document.documentElement.lang=LANG;
  document.querySelectorAll('[data-t]').forEach(el=>{el.textContent=T[el.dataset.t]});
  $('langBtn').textContent=T.lang;
  fillSelects();if(G)render();
}
function readSettings(){
  settings={mode:selMode.value,side:selSide.value,level:+selLevel.value,time:+selTime.value};
  selSide.disabled=selLevel.disabled=settings.mode==='pvp';
  try{localStorage.setItem('tq-settings',JSON.stringify(settings))}catch(e){}
}
$('undoBtn').onclick=undo;
$('flipBtn').onclick=()=>{flipped=!flipped;render();save()};
$('newBtn').onclick=newGame;
$('langBtn').onclick=()=>{LANG=LANG==='ru'?'en':'ru';tqSetLang(LANG);applyLang()};
[selMode,selSide,selTime].forEach(el=>el.addEventListener('change',()=>{readSettings();newGame()}));
selLevel.addEventListener('change',()=>{readSettings();if(G){G.level=settings.level;render();save()}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&selected!==null){selected=null;targets=[];render()}});

/* ---------- start ---------- */
try{const s=JSON.parse(localStorage.getItem('tq-settings')||'null');if(s&&s.mode)settings=Object.assign(settings,s)}catch(e){}
const q=new URLSearchParams(location.search);
const forced=q.get('mode');
if(forced==='pc'||forced==='pvp')settings.mode=forced;
applyLang();
const saved=load();
if(saved&&!forced&&!saved.G.result){
  G=saved.G;flipped=!!saved.flipped;G.tickAt=performance.now();
  render();maybeEngine();
}else newGame();
if(forced)history.replaceState(null,'',location.pathname);
})();
