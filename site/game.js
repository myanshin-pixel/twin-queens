/* Twin Queens — game UI (vs computer / two players on one device) */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const boardEl=$('board');
let LANG=tqLang(),T=TQ_I18N[LANG];
const PIECE=(c,t)=>'assets/pieces/'+c+t.toUpperCase()+'.svg';
const img=(c,t,cls)=>'<img class="'+(cls||'')+'" src="'+PIECE(c,t)+'" alt="" draggable="false">';

let settings={mode:'pc',side:'w',level:2,time:600,inc:0};
let prefs={sound:true,dests:true,anim:true,autoQueen:false,coords:true};
let G=null,flipped=false,selected=null,targets=[],thinking=false,reqId=0,promoPending=null,overlayHidden=false,drag=null;
let viewPly=null;          /* null = live position, otherwise index into G.states */
let premove=null,preMode=false;
let shapes=[],rdrag=null;  /* right-click arrows and circles */
let confirmAct=null,confirmTimer=0;

/* ---------- sounds (synthesised, no external files) ---------- */
const SND={ctx:null,noise:null};
function ac(){
  if(!prefs.sound)return null;
  try{
    if(!SND.ctx){
      const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;
      SND.ctx=new C();
      const len=Math.floor(SND.ctx.sampleRate*.25),buf=SND.ctx.createBuffer(1,len,SND.ctx.sampleRate),d=buf.getChannelData(0);
      for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
      SND.noise=buf;
    }
    if(SND.ctx.state==='suspended')SND.ctx.resume();
    return SND.ctx;
  }catch(e){return null}
}
function knock(c,t,vol,freq,decay){
  const n=c.createBufferSource();n.buffer=SND.noise;
  const bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=freq;bp.Q.value=1.1;
  const g=c.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.002);g.gain.exponentialRampToValueAtTime(.0008,t+decay);
  n.connect(bp);bp.connect(g);g.connect(c.destination);n.start(t);n.stop(t+decay+.02);
}
function tone(c,t,freq,vol,dur,type,attack){
  const o=c.createOscillator();o.type=type||'sine';o.frequency.setValueAtTime(freq,t);
  const g=c.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+(attack||.003));g.gain.exponentialRampToValueAtTime(.0008,t+dur);
  o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+dur+.02);
}
function wood(c,t,v){knock(c,t,.55*v,2300,.05);tone(c,t,170,.38*v,.07);tone(c,t,340,.12*v,.04,'triangle')}
function play(kind){
  if(kind==='start'&&!SND.ctx)return;
  const c=ac();if(!c)return;const t=c.currentTime+.005;
  switch(kind){
    case 'move':wood(c,t,1);break;
    case 'capture':knock(c,t,.9,1500,.08);tone(c,t,120,.55,.1);knock(c,t+.03,.4,2600,.05);break;
    case 'castle':wood(c,t,1);wood(c,t+.1,.8);break;
    case 'check':wood(c,t,1);tone(c,t+.04,1046,.12,.25);tone(c,t+.04,1568,.05,.2);break;
    case 'promote':wood(c,t,1);tone(c,t+.05,784,.1,.18);tone(c,t+.16,1175,.1,.3);break;
    case 'start':tone(c,t,523,.12,.5,'sine',.02);tone(c,t+.12,784,.12,.6,'sine',.02);break;
    case 'end':tone(c,t,784,.12,.4,'sine',.02);tone(c,t+.16,659,.12,.4,'sine',.02);tone(c,t+.32,523,.13,.8,'sine',.02);break;
    case 'low':tone(c,t,1500,.08,.06,'square');tone(c,t+.12,1500,.08,.06,'square');break;
  }
}

/* ---------- engine worker ---------- */
let worker=null;
try{
  worker=new Worker('engine-worker.js');
  worker.onmessage=e=>{if(worker&&worker._finish&&e.data.id===worker._id){const f=worker._finish;worker._finish=null;f(e.data.m)}};
  worker.onerror=()=>{const f=worker&&worker._finish,id=worker&&worker._id;worker=null;if(f){const s=cur();setTimeout(()=>{if(id===reqId)f(bestMove(s,G.level))},20)}};
}catch(e){worker=null}

/* ---------- helpers ---------- */
const cur=()=>G.states[G.states.length-1];
const livePly=()=>G.states.length-1;
const shownPly=()=>viewPly===null?livePly():viewPly;
const shown=()=>G.states[shownPly()];
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
    case 'resign':return [T.resignT,T.won[r.who]];
    case 'agreed':return [T.draw,T.agreed];
    default:return [T.draw,T[r.code]];
  }
}
function soundFor(s,m,ns){
  if(inCheck(ns))return 'check';
  if(m.promo)return 'promote';
  if(m.flag==='K'||m.flag==='Q')return 'castle';
  if(s.b[m.to]||m.flag==='e')return 'capture';
  return 'move';
}
/* squares whose pieces move during m (the king/pawn and, for castling, the rook) */
function movedPieces(m,s){
  const out=[{from:m.from,to:m.to}];
  if(m.flag==='K'||m.flag==='Q'){const base=s.t==='w'?0:7*F;out.push(m.flag==='K'?{from:base+8,to:base+5}:{from:base,to:base+3})}
  return out;
}

/* ---------- persistence (resume the game after closing the app) ---------- */
function save(){try{localStorage.setItem('tq-game',JSON.stringify({G,settings,flipped}))}catch(e){}}
function load(){try{const d=JSON.parse(localStorage.getItem('tq-game')||'null');if(d&&d.G&&d.G.states&&d.settings)return d}catch(e){}return null}
function savePrefs(){try{localStorage.setItem('tq-prefs',JSON.stringify(prefs))}catch(e){}}

/* ---------- game flow ---------- */
function clearUi(){selected=null;targets=[];preMode=false;premove=null;promoPending=null;shapes=[]}
function newGame(){
  reqId++;thinking=false;overlayHidden=false;viewPly=null;clearUi();
  if(worker)worker._finish=null;
  const s0=startState();
  const human=settings.side==='r'?(Math.random()<.5?'w':'b'):settings.side;
  G={states:[s0],hist:[],keys:[key(s0)],result:null,human,mode:settings.mode,level:settings.level,
     time:settings.time,inc:settings.inc||0,clocks:{w:settings.time*1000,b:settings.time*1000},tickAt:0,lowWarned:{}};
  flipped=settings.mode==='pc'&&human==='b';
  render();save();play('start');maybeEngine();
  if(window.tqTrack)tqTrack('game_start',{mode:G.mode,level:G.mode==='pc'?G.level:0,time:G.time+'+'+G.inc});
}
function doMove(m,opts){
  opts=opts||{};
  const s=cur(),legal=legalMoves(s);
  const real=legal.find(o=>o.from===m.from&&o.to===m.to&&(o.promo||null)===(m.promo||null));
  if(!real)return false;
  const sanStr=san(s,real,legal);
  const ns=apply(s,real);
  if(G.time&&G.hist.length>=1)G.clocks[s.t]+=G.inc*1000;
  G.states.push(ns);G.hist.push({m:real,san:sanStr,mover:s.t});G.keys.push(key(ns));
  G.tickAt=performance.now();
  G.result=detectEnd(ns);
  selected=null;targets=[];shapes=[];viewPly=null;
  render(opts.noAnim?null:movedPieces(real,s));save();
  play(soundFor(s,real,ns));
  if(G.result){setTimeout(()=>play('end'),250);trackEnd()}
  maybeEngine();
  if(!G.result&&premove&&humanCan(ns.t))setTimeout(playPremove,30);
  return true;
}
function playPremove(){
  const p=premove;premove=null;
  if(!p||G.result||thinking||!humanCan(cur().t)){render();return}
  const opts=legalMoves(cur()).filter(m=>m.from===p.from&&m.to===p.to);
  if(!opts.length){render();return}
  doMove(opts.find(m=>m.promo==='q')||opts[0]);
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
  thinking=false;preMode=false;
  if(m)doMove(m);else render();
}
function undo(){
  if(G.hist.length===0)return;
  if(thinking){reqId++;thinking=false;if(worker)worker._finish=null}
  const pop=()=>{G.states.pop();G.hist.pop();G.keys.pop()};
  pop();
  if(G.mode==='pc'&&cur().t!==G.human&&G.hist.length)pop();
  G.result=null;overlayHidden=false;viewPly=null;clearUi();G.tickAt=performance.now();
  render();save();maybeEngine();
}
function trackEnd(){if(window.tqTrack&&G.result)tqTrack('game_end',{mode:G.mode,result:G.result.code,score:G.result.score,moves:G.hist.length})}
function finishBy(result){
  reqId++;thinking=false;if(worker)worker._finish=null;
  G.result=result;overlayHidden=false;viewPly=null;clearUi();
  render();save();play('end');trackEnd();
}
function resign(){
  if(G.result)return;
  const loser=G.mode==='pc'?G.human:cur().t;
  finishBy({score:loser==='w'?'0–1':'1–0',code:'resign',who:opp(loser)});
}
function agreeDraw(){if(!G.result)finishBy({score:'½–½',code:'agreed'})}

/* ---------- clock ---------- */
setInterval(()=>{
  if(!G||G.result||!G.time||G.hist.length===0)return;
  const now=performance.now(),t=cur().t;
  G.clocks[t]-=now-G.tickAt;G.tickAt=now;
  if(G.clocks[t]<=0){
    G.clocks[t]=0;
    finishBy({score:t==='w'?'0–1':'1–0',code:'timeout',who:opp(t)});return;
  }
  const lowAt=Math.min(10000,G.time*1000*.1);
  if(G.clocks[t]<lowAt&&!G.lowWarned[t]&&humanCan(t)){G.lowWarned[t]=true;play('low')}
  renderClocks();
},100);
setInterval(()=>{if(G&&G.time&&!G.result&&G.hist.length)save()},2000);
function fmt(ms){
  ms=Math.max(0,ms);const tot=Math.ceil(ms/1000),m=Math.floor(tot/60),s=tot%60;
  if(ms<20000){const t=(ms/1000).toFixed(1);return '0:'+(t.length<4?'0':'')+t}
  return m+':'+String(s).padStart(2,'0');
}

/* ---------- rendering ---------- */
const dcol=i=>flipped?F-1-(i%F):i%F;
const drow=i=>flipped?((i/F)|0):R-1-((i/F)|0);
function displayOrder(){
  const out=[];
  for(let row=0;row<R;row++)for(let c=0;c<F;c++){
    const r=flipped?row:R-1-row,f=flipped?F-1-c:c;out.push(r*F+f);
  }
  return out;
}
function shapesSvg(){
  const list=shapes.slice();
  if(rdrag&&rdrag.to!==null&&rdrag.to!==undefined)list.push({a:rdrag.from,b:rdrag.to,c:rdrag.c});
  if(!list.length)return '';
  const COL={g:'#15781b',r:'#882020',b:'#003088',y:'#e68f00'};
  let defs='',body='';
  Object.keys(COL).forEach(k=>{defs+='<marker id="ah-'+k+'" orient="auto" markerWidth="4" markerHeight="8" refX="2.05" refY="2"><path d="M0,0 V4 L3,2 Z" fill="'+COL[k]+'"/></marker>'});
  list.forEach(s=>{
    const x1=dcol(s.a)+.5,y1=drow(s.a)+.5;
    if(s.a===s.b){body+='<circle cx="'+x1+'" cy="'+y1+'" r=".46" fill="none" stroke="'+COL[s.c]+'" stroke-width=".07" opacity=".85"/>';return}
    let x2=dcol(s.b)+.5,y2=drow(s.b)+.5;const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy);
    x2-=dx/L*.36;y2-=dy/L*.36;
    body+='<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+COL[s.c]+'" stroke-width=".16" stroke-linecap="round" marker-end="url(#ah-'+s.c+')" opacity=".8"/>';
  });
  return '<svg class="shapes" viewBox="0 0 9 8" preserveAspectRatio="none"><defs>'+defs+'</defs>'+body+'</svg>';
}
function renderBoard(anim){
  const ply=shownPly(),s=G.states[ply],live=viewPly===null;
  const last=ply>0?G.hist[ply-1].m:null;
  const chk=inCheck(s)?kingSq(s.b,s.t):-1;
  boardEl.classList.toggle('flipped',flipped);
  boardEl.classList.toggle('past',!live);
  boardEl.classList.toggle('nocoords',!prefs.coords);
  let html='';
  displayOrder().forEach((i,idx)=>{
    const f=i%F,r=(i/F)|0,light=(f+r)%2===1;
    let cls='sq '+(light?'l':'d');
    if(last&&(i===last.from||i===last.to))cls+=' last';
    if(live&&i===selected)cls+=preMode?' presel':' sel';
    if(i===chk)cls+=' check';
    if(live&&premove&&(i===premove.from||i===premove.to))cls+=' pre';
    if(live&&prefs.dests){const tg=targets.find(m=>m.to===i);if(tg)cls+=(s.b[i]||tg.flag==='e')?' cap':' move'}
    if(drag&&drag.moved&&drag.from===i)cls+=' dragfrom';
    let inner='';
    if(idx%F===0)inner+='<span class="coord rk">'+(r+1)+'</span>';
    if(idx>=F*(R-1))inner+='<span class="coord fl">'+FILES[f]+'</span>';
    const p=s.b[i];
    if(p)inner+=img(col(p),p.toLowerCase(),'piece');
    html+='<div class="'+cls+'" data-sq="'+i+'">'+inner+'</div>';
  });
  html+=shapesSvg();
  if(promoPending){
    html+='<div class="overlay"><div class="card glass" data-tilt data-tilt-strength="10"><h2>'+T.promo+'</h2><p>'+T.promoSub+'</p><div class="promo">'+
      ['q','r','b','n'].map(t=>'<button data-promo="'+t+'" aria-label="'+t+'">'+img(s.t,t)+'</button>').join('')+'</div></div></div>';
  }else if(G.result&&!overlayHidden&&live){
    const [title,detail]=resText(G.result);
    html+='<div class="overlay"><div class="card glass" data-tilt data-tilt-strength="10"><div class="score gold">'+G.result.score+'</div><h2>'+title+'</h2><p>'+detail+'</p>'+
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn primary" data-act="again">'+T.again+'</button><button class="btn" data-act="view">'+T.view+'</button></div></div></div>';
  }
  boardEl.innerHTML=html;
  if(anim&&prefs.anim)animate(anim);
}
function animate(list){
  const size=boardEl.getBoundingClientRect().width/F;
  list.forEach(a=>{
    const el=boardEl.querySelector('[data-sq="'+a.to+'"] .piece');if(!el)return;
    const dx=(dcol(a.from)-dcol(a.to))*size,dy=(drow(a.from)-drow(a.to))*size;
    el.classList.add('anim');el.style.transition='none';el.style.transform='translate('+dx+'px,'+dy+'px)';
    el.getBoundingClientRect();
    el.style.transition='transform 170ms cubic-bezier(.25,.8,.35,1)';el.style.transform='';
    setTimeout(()=>el.classList.remove('anim'),200);
  });
}
function material(b){
  const cnt={w:{p:0,n:0,b:0,r:0,q:0},b:{p:0,n:0,b:0,r:0,q:0}};let w=0,bl=0;
  b.forEach(p=>{if(!p)return;const t=p.toLowerCase();if(t==='k')return;cnt[col(p)][t]++;if(col(p)==='w')w+=VAL[t];else bl+=VAL[t]});
  return {cnt,w,b:bl};
}
const START={p:9,n:2,b:2,r:2,q:2};
function renderBar(el,c){
  const s=shown(),mat=material(s.b),o=opp(c);
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
  el.innerHTML='<span class="dot '+s.t+'"></span>'+txt+(thinking?'<span class="thinking"><i></i><i></i><i></i></span>':'')+
    (premove?'<span class="pretag">'+T.premove+'</span>':'');
}
function renderMoves(){
  const el=$('moves');
  if(!G.hist.length){el.innerHTML='<div class="empty">'+T.movesHint+'</div>';return}
  const at=shownPly();
  let html='';
  for(let i=0;i<G.hist.length;i+=2){
    const a=G.hist[i],b=G.hist[i+1];
    html+='<div class="mrow"><span class="n">'+(i/2+1)+'.</span><span data-ply="'+(i+1)+'" class="mv'+(at===i+1?' cur':'')+'">'+a.san+'</span>'+
      (b?'<span data-ply="'+(i+2)+'" class="mv'+(at===i+2?' cur':'')+'">'+b.san+'</span>':'<span></span>')+'</div>';
  }
  if(G.result)html+='<div class="mres">'+G.result.score+'</div>';
  el.innerHTML=html;
  const c=el.querySelector('.cur');
  if(viewPly===null)el.scrollTop=el.scrollHeight;
  else if(c){const top=c.offsetTop-el.offsetTop;if(top<el.scrollTop||top>el.scrollTop+el.clientHeight-24)el.scrollTop=top-el.clientHeight/2}
}
function renderNav(){
  const at=shownPly(),n=livePly();
  $('navFirst').disabled=$('navPrev').disabled=at===0;
  $('navNext').disabled=$('navLast').disabled=at===n;
}
function renderTools(){
  const over=!!G.result;
  $('resignBtn').disabled=over;
  $('drawBtn').disabled=over;
  $('drawBtn').hidden=G.mode!=='pvp';
  $('resignBtn').querySelector('span').textContent=confirmAct==='resign'?T.sure:T.resign;
  $('drawBtn').querySelector('span').textContent=confirmAct==='draw'?T.sure:T.offerDraw;
  $('resignBtn').classList.toggle('confirm',confirmAct==='resign');
  $('drawBtn').classList.toggle('confirm',confirmAct==='draw');
}
function render(anim){
  renderBoard(anim);
  renderBar($('topBar'),flipped?'w':'b');
  renderBar($('botBar'),flipped?'b':'w');
  renderClocks();renderStatus();renderMoves();renderNav();renderTools();
  $('undoBtn').disabled=!G.hist.length;
}

/* ---------- move list navigation ---------- */
function goTo(ply){
  const n=livePly();ply=Math.max(0,Math.min(n,ply));
  const from=shownPly();if(ply===from)return;
  viewPly=ply===n?null:ply;selected=null;targets=[];preMode=false;
  let anim=null;
  if(ply===from+1){const h=G.hist[from];anim=movedPieces(h.m,G.states[from]);play(soundFor(G.states[from],h.m,G.states[ply]))}
  else if(ply===from-1){const h=G.hist[ply];anim=movedPieces(h.m,G.states[ply]).map(a=>({from:a.to,to:a.from}));play('move')}
  render(anim);
}
$('navFirst').onclick=()=>goTo(0);
$('navPrev').onclick=()=>goTo(shownPly()-1);
$('navNext').onclick=()=>goTo(shownPly()+1);
$('navLast').onclick=()=>goTo(livePly());
$('moves').addEventListener('click',e=>{const m=e.target.closest('[data-ply]');if(m)goTo(+m.dataset.ply)});

/* ---------- input ---------- */
function sqFromPoint(x,y){const el=document.elementFromPoint(x,y);const sq=el&&el.closest&&el.closest('.sq');return sq&&boardEl.contains(sq)?+sq.dataset.sq:null}
function canInteract(){return !G.result&&!thinking&&!promoPending&&humanCan(cur().t)}
function canPremove(){return !G.result&&!promoPending&&G.mode==='pc'&&cur().t!==G.human}
/* destinations for a premove: where the piece could go if it were our turn on this board */
function premoveTargets(i){
  const s=cur(),s2={b:s.b,t:G.human,c:s.c,ep:-1,hm:0};
  const seen={},out=[];
  pseudo(s2).forEach(m=>{if(m.from===i&&!seen[m.to]){seen[m.to]=1;out.push({from:m.from,to:m.to})}});
  /* pawns may also premove a capture onto a square that is empty now */
  const p=s.b[i];
  if(p&&p.toLowerCase()==='p'){const d=G.human==='w'?1:-1,f=i%F,r=((i/F)|0)+d;
    [-1,1].forEach(k=>{const nf=f+k;if(nf>=0&&nf<F&&r>=0&&r<R){const j=r*F+nf;if(!seen[j]){seen[j]=1;out.push({from:i,to:j})}}})}
  return out;
}
function trySelect(i){
  const s=cur(),p=s.b[i];
  if(canInteract()){
    if(p&&col(p)===s.t&&humanCan(s.t)){selected=i;preMode=false;targets=legalMoves(s).filter(m=>m.from===i);return true}
  }else if(canPremove()){
    if(p&&col(p)===G.human){selected=i;preMode=true;targets=premoveTargets(i);return true}
  }
  return false;
}
function attempt(from,to){
  const opts=targets.filter(m=>m.from===from&&m.to===to);
  if(!opts.length)return false;
  if(preMode){premove={from,to};selected=null;targets=[];preMode=false;render();return true}
  if(opts.length>1&&opts[0].promo){
    if(prefs.autoQueen){doMove(opts.find(m=>m.promo==='q'),{noAnim:true});return true}
    promoPending={from,to};render();return true;
  }
  doMove(opts[0]);return true;
}
function rightColor(e){return e.shiftKey?'r':(e.altKey||e.metaKey)?'b':e.ctrlKey?'y':'g'}
boardEl.addEventListener('contextmenu',e=>e.preventDefault());
boardEl.addEventListener('pointerdown',e=>{
  ac();
  const pb=e.target.closest('[data-promo]');
  if(pb){const t=pb.dataset.promo,pp=promoPending;promoPending=null;doMove({from:pp.from,to:pp.to,promo:t});return}
  const act=e.target.closest('[data-act]');
  if(act){if(act.dataset.act==='again')newGame();else{overlayHidden=true;render()}return}
  const sqEl=e.target.closest('.sq');
  if(e.button===2){
    if(sqEl){rdrag={from:+sqEl.dataset.sq,to:+sqEl.dataset.sq,c:rightColor(e)};try{boardEl.setPointerCapture(e.pointerId)}catch(_){}}
    e.preventDefault();return;
  }
  if(e.button!==undefined&&e.button!==0)return;
  if(shapes.length){shapes=[];}
  if(premove){premove=null;selected=null;targets=[];preMode=false;render();return}
  if(viewPly!==null){viewPly=null;render();return}
  if(!sqEl){render();return}
  const i=+sqEl.dataset.sq;
  if(selected!==null&&i!==selected&&attempt(selected,i))return;
  const wasSel=selected===i;
  if(!trySelect(i)){selected=null;targets=[];preMode=false;render();return}
  render();
  const size=boardEl.getBoundingClientRect().width/F;
  drag={from:i,x0:e.clientX,y0:e.clientY,moved:false,wasSel,size,ghost:null,hover:null};
  try{boardEl.setPointerCapture(e.pointerId)}catch(_){}
  e.preventDefault();
});
boardEl.addEventListener('pointermove',e=>{
  if(rdrag){const h=sqFromPoint(e.clientX,e.clientY);if(h!==null&&h!==rdrag.to){rdrag.to=h;renderBoard()}return}
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
  if(rdrag){
    const r=rdrag;rdrag=null;
    if(!cancel){
      const to=r.to,idx=shapes.findIndex(s=>s.a===r.from&&s.b===to);
      if(idx>=0&&shapes[idx].c===r.c)shapes.splice(idx,1);
      else{if(idx>=0)shapes.splice(idx,1);shapes.push({a:r.from,b:to,c:r.c})}
    }
    renderBoard();return;
  }
  if(!drag)return;
  const d=drag;drag=null;
  if(d.ghost)d.ghost.remove();
  if(cancel){render();return}
  if(d.moved){
    const to=sqFromPoint(e.clientX,e.clientY);
    if(to!==null&&to!==d.from){
      const opts=targets.filter(m=>m.from===d.from&&m.to===to);
      if(opts.length){
        if(preMode){premove={from:d.from,to};selected=null;targets=[];preMode=false;render();return}
        if(opts.length>1&&opts[0].promo){
          if(prefs.autoQueen){doMove(opts.find(m=>m.promo==='q'),{noAnim:true});return}
          promoPending={from:d.from,to};render();return;
        }
        doMove(opts[0],{noAnim:true});return;
      }
    }
    render();
  }else if(d.wasSel){selected=null;targets=[];preMode=false;render()}
}
boardEl.addEventListener('pointerup',e=>endDrag(e,false));
boardEl.addEventListener('pointercancel',e=>endDrag(e,true));

/* ---------- PGN ---------- */
function pgn(){
  const d=new Date(),pad=n=>String(n).padStart(2,'0');
  const res=!G.result?'*':G.result.score==='1–0'?'1-0':G.result.score==='0–1'?'0-1':'1/2-1/2';
  const name=c=>G.mode==='pvp'?(c==='w'?T.white:T.black):(c===G.human?T.you:T.computer+' ('+T.levels[G.level-1]+')');
  const tc=G.time?G.time+'+'+(G.inc||0):'-';
  let h='[Event "Twin Queens casual game"]\n[Site "https://twinqueens.com"]\n[Date "'+d.getFullYear()+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate())+'"]\n'+
    '[White "'+name('w')+'"]\n[Black "'+name('b')+'"]\n[Result "'+res+'"]\n[Variant "Twin Queens 9x8"]\n'+
    '[FEN "rnbqkqnbr/ppppppppp/9/9/9/9/PPPPPPPPP/RNBQKQNBR w KQkq - 0 1"]\n[TimeControl "'+tc+'"]\n';
  if(G.result)h+='[Termination "'+resText(G.result).join(' — ')+'"]\n';
  let body='';
  G.hist.forEach((x,i)=>{if(i%2===0)body+=(i/2+1)+'. ';body+=x.san+' '});
  body+=res;
  /* wrap at 80 columns */
  const words=body.split(' ');let line='',out='';
  words.forEach(w=>{if((line+' '+w).trim().length>80){out+=line.trim()+'\n';line=w}else line+=' '+w});
  return h+'\n'+out+line.trim()+'\n';
}
function toast(msg){
  let t=document.querySelector('.toast');
  if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t)}
  t.textContent=msg;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),1800);
}
function copyText(txt){
  const done=()=>toast(T.copied);
  if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(txt).then(done,()=>fallback());else fallback();
  function fallback(){const ta=document.createElement('textarea');ta.value=txt;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done()}catch(e){}ta.remove()}
}
$('pgnCopy').onclick=()=>copyText(pgn());
$('pgnSave').onclick=()=>{
  const blob=new Blob([pgn()],{type:'application/x-chess-pgn'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download='twin-queens-'+Date.now()+'.pgn';document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
};

/* ---------- controls ---------- */
const selMode=$('selMode'),selSide=$('selSide'),selLevel=$('selLevel'),selTime=$('selTime');
/* [seconds, increment, locked]. Locked controls stay visible but greyed out until there are
   enough players online, so everyone meets in the few most popular controls. Set the third
   value to false to open one. */
const TIMES=[[0,0],[60,0],[120,1,true],[180,0],[180,2,true],[300,0],[300,3,true],[600,0],[600,5],[900,10,true],[1800,0],[1800,20,true]];
const timeLocked=v=>TIMES.some(([t,i,l])=>l&&t+'+'+i===v);
function fillSelects(){
  const opt=(v,t)=>'<option value="'+v+'">'+t+'</option>';
  selMode.innerHTML=opt('pc',T.computer)+opt('pvp',T.friend);
  selSide.innerHTML=opt('w',T.white)+opt('b',T.black)+opt('r',T.random);
  selLevel.innerHTML=T.levels.map((n,i)=>opt(i+1,n)).join('');
  selTime.innerHTML=TIMES.map(([t,i,l])=>'<option value="'+t+'+'+i+'"'+(l?' disabled':'')+'>'+(t?(t/60)+' + '+i:T.noClock)+(l?' — '+T.soon:'')+'</option>').join('');
  selMode.value=settings.mode;selSide.value=settings.side;selLevel.value=String(settings.level);
  selTime.value=settings.time+'+'+(settings.inc||0);
  if(selTime.selectedIndex<0||timeLocked(selTime.value)){selTime.value='600+0';settings.time=600;settings.inc=0}
  selSide.disabled=selLevel.disabled=settings.mode==='pvp';
}
function fillPrefs(){
  document.querySelectorAll('[data-pref]').forEach(el=>{el.checked=!!prefs[el.dataset.pref]});
}
function applyLang(){
  T=TQ_I18N[LANG];document.documentElement.lang=LANG;
  document.querySelectorAll('[data-t]').forEach(el=>{el.textContent=T[el.dataset.t]});
  document.querySelectorAll('[data-tt]').forEach(el=>{el.title=T[el.dataset.tt];el.setAttribute('aria-label',T[el.dataset.tt])});
  $('langBtn').textContent=T.lang;
  fillSelects();fillPrefs();if(G)render();
}
function readSettings(){
  const [t,i]=selTime.value.split('+').map(Number);
  settings={mode:selMode.value,side:selSide.value,level:+selLevel.value,time:t,inc:i};
  selSide.disabled=selLevel.disabled=settings.mode==='pvp';
  try{localStorage.setItem('tq-settings',JSON.stringify(settings))}catch(e){}
}
function confirmable(name,fn){
  return ()=>{
    if(confirmAct===name){confirmAct=null;clearTimeout(confirmTimer);fn();renderTools();return}
    confirmAct=name;renderTools();clearTimeout(confirmTimer);
    confirmTimer=setTimeout(()=>{confirmAct=null;renderTools()},3000);
  };
}
$('undoBtn').onclick=undo;
$('flipBtn').onclick=()=>{flipped=!flipped;render();save()};
$('newBtn').onclick=newGame;
$('resignBtn').onclick=confirmable('resign',resign);
$('drawBtn').onclick=confirmable('draw',agreeDraw);
$('langBtn').onclick=()=>{LANG=LANG==='ru'?'en':'ru';tqSetLang(LANG);applyLang()};
[selMode,selSide,selTime].forEach(el=>el.addEventListener('change',()=>{readSettings();newGame()}));
selLevel.addEventListener('change',()=>{readSettings();if(G){G.level=settings.level;render();save()}});
document.querySelectorAll('[data-pref]').forEach(el=>el.addEventListener('change',()=>{
  prefs[el.dataset.pref]=el.checked;savePrefs();
  if(el.dataset.pref==='sound'&&el.checked)play('move');
  render();
}));
document.addEventListener('keydown',e=>{
  if(e.target&&/^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName))return;
  if(e.key==='Escape'){selected=null;targets=[];preMode=false;premove=null;shapes=[];render();return}
  if(e.key==='ArrowLeft'){goTo(shownPly()-1);e.preventDefault()}
  else if(e.key==='ArrowRight'){goTo(shownPly()+1);e.preventDefault()}
  else if(e.key==='ArrowUp'||e.key==='Home'){goTo(0);e.preventDefault()}
  else if(e.key==='ArrowDown'||e.key==='End'){goTo(livePly());e.preventDefault()}
  else if(e.key==='f'||e.key==='F'||e.key==='а'||e.key==='А'){flipped=!flipped;render();save()}
});
/* the browser only lets us play sound after the first tap or click on the page */
document.addEventListener('pointerdown',()=>{ac()},{once:true,capture:true});

/* ---------- start ---------- */
try{const s=JSON.parse(localStorage.getItem('tq-settings')||'null');if(s&&s.mode)settings=Object.assign(settings,s)}catch(e){}
try{const p=JSON.parse(localStorage.getItem('tq-prefs')||'null');if(p)prefs=Object.assign(prefs,p)}catch(e){}
const q=new URLSearchParams(location.search);
const forced=q.get('mode');
if(forced==='pc'||forced==='pvp')settings.mode=forced;
applyLang();
const saved=load();
if(saved&&!forced&&!saved.G.result){
  G=saved.G;flipped=!!saved.flipped;G.tickAt=performance.now();G.inc=G.inc||0;G.lowWarned=G.lowWarned||{};
  render();maybeEngine();
}else newGame();
if(forced)history.replaceState(null,'',location.pathname);
})();
