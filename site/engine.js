/* Twin Queens engine — 9x8 board, two queens per side. Rules, move generation and a small alpha-beta search. */
var F=9,R=8,N=72,FILES='abcdefghi',INF=1e9,MATE=100000;
var BACK=['r','n','b','q','k','q','n','b','r'];
var KN=[[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
var KG=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
var DG=[[1,1],[1,-1],[-1,1],[-1,-1]],OR=[[1,0],[-1,0],[0,1],[0,-1]];
var VAL={p:100,n:310,b:330,r:500,q:900,k:0};
function col(p){return p===p.toUpperCase()?'w':'b'}
function opp(c){return c==='w'?'b':'w'}
function on(f,r){return f>=0&&f<F&&r>=0&&r<R}
function startState(){
  var b=new Array(N).fill(null);
  for(var f=0;f<F;f++){b[f]=BACK[f].toUpperCase();b[F+f]='P';b[6*F+f]='p';b[7*F+f]=BACK[f]}
  return {b:b,t:'w',c:{K:true,Q:true,k:true,q:true},ep:-1,hm:0};
}
function isAttacked(b,sq,by){
  var f=sq%F,r=(sq/F)|0,i,d,nf,nr,p;
  var pr=by==='w'?r-1:r+1,pp=by==='w'?'P':'p';
  if(pr>=0&&pr<R){if(f>0&&b[pr*F+f-1]===pp)return true;if(f<F-1&&b[pr*F+f+1]===pp)return true}
  var kn=by==='w'?'N':'n',kg=by==='w'?'K':'k';
  var r1=by==='w'?'R':'r',q1=by==='w'?'Q':'q',b1=by==='w'?'B':'b';
  for(i=0;i<8;i++){nf=f+KN[i][0];nr=r+KN[i][1];if(on(nf,nr)&&b[nr*F+nf]===kn)return true}
  for(i=0;i<8;i++){nf=f+KG[i][0];nr=r+KG[i][1];if(on(nf,nr)&&b[nr*F+nf]===kg)return true}
  for(d=0;d<4;d++){nf=f+OR[d][0];nr=r+OR[d][1];
    while(on(nf,nr)){p=b[nr*F+nf];if(p){if(p===r1||p===q1)return true;break}nf+=OR[d][0];nr+=OR[d][1]}}
  for(d=0;d<4;d++){nf=f+DG[d][0];nr=r+DG[d][1];
    while(on(nf,nr)){p=b[nr*F+nf];if(p){if(p===b1||p===q1)return true;break}nf+=DG[d][0];nr+=DG[d][1]}}
  return false;
}
function kingSq(b,c){var k=c==='w'?'K':'k';for(var i=0;i<N;i++)if(b[i]===k)return i;return -1}
function inCheck(s){return isAttacked(s.b,kingSq(s.b,s.t),opp(s.t))}
function pseudo(s){
  var out=[],b=s.b,us=s.t,them=opp(us),i,j,k,p,t,f,r,nf,nr,q;
  function pawnPush(from,to,flag){
    var tr=(to/F)|0;
    if(tr===R-1||tr===0){['q','r','b','n'].forEach(function(pc){out.push({from:from,to:to,promo:pc})})}
    else out.push(flag?{from:from,to:to,flag:flag}:{from:from,to:to});
  }
  for(i=0;i<N;i++){
    p=b[i];if(!p||col(p)!==us)continue;
    t=p.toLowerCase();f=i%F;r=(i/F)|0;
    if(t==='p'){
      var d=us==='w'?1:-1,st=us==='w'?1:R-2,r1=r+d;
      if(on(f,r1)&&!b[r1*F+f]){
        pawnPush(i,r1*F+f);
        if(r===st&&!b[(r+2*d)*F+f])out.push({from:i,to:(r+2*d)*F+f,flag:'d'});
      }
      for(k=-1;k<=1;k+=2){nf=f+k;if(!on(nf,r1))continue;j=r1*F+nf;
        if(b[j]&&col(b[j])===them)pawnPush(i,j);
        else if(j===s.ep)out.push({from:i,to:j,flag:'e'});
      }
    }else if(t==='n'||t==='k'){
      var offs=t==='n'?KN:KG;
      for(k=0;k<8;k++){nf=f+offs[k][0];nr=r+offs[k][1];if(!on(nf,nr))continue;j=nr*F+nf;
        if(!b[j]||col(b[j])===them)out.push({from:i,to:j})}
      if(t==='k'){
        var base=us==='w'?0:7*F,rook=us==='w'?'R':'r';
        if(i===base+4&&!isAttacked(b,i,them)){
          if(s.c[us==='w'?'K':'k']&&b[base+8]===rook&&!b[base+5]&&!b[base+6]&&!b[base+7]&&!isAttacked(b,base+5,them)&&!isAttacked(b,base+6,them))
            out.push({from:i,to:base+6,flag:'K'});
          if(s.c[us==='w'?'Q':'q']&&b[base]===rook&&!b[base+1]&&!b[base+2]&&!b[base+3]&&!isAttacked(b,base+3,them)&&!isAttacked(b,base+2,them))
            out.push({from:i,to:base+2,flag:'Q'});
        }
      }
    }else{
      var dirs=t==='r'?OR:t==='b'?DG:OR.concat(DG);
      for(k=0;k<dirs.length;k++){nf=f+dirs[k][0];nr=r+dirs[k][1];
        while(on(nf,nr)){j=nr*F+nf;q=b[j];
          if(!q)out.push({from:i,to:j});
          else{if(col(q)===them)out.push({from:i,to:j});break}
          nf+=dirs[k][0];nr+=dirs[k][1]}}
    }
  }
  return out;
}
function apply(s,m){
  var b=s.b.slice(),us=s.t,p=b[m.from],cap=b[m.to];
  b[m.to]=m.promo?(us==='w'?m.promo.toUpperCase():m.promo):p;b[m.from]=null;
  if(m.flag==='e'){var ci=m.to+(us==='w'?-F:F);cap=b[ci];b[ci]=null}
  var base=us==='w'?0:7*F;
  if(m.flag==='K'){b[base+5]=b[base+8];b[base+8]=null}
  if(m.flag==='Q'){b[base+3]=b[base];b[base]=null}
  var c={K:s.c.K,Q:s.c.Q,k:s.c.k,q:s.c.q};
  if(p==='K'){c.K=c.Q=false}if(p==='k'){c.k=c.q=false}
  [m.from,m.to].forEach(function(x){if(x===0)c.Q=false;if(x===8)c.K=false;if(x===63)c.q=false;if(x===71)c.k=false});
  return {b:b,t:opp(us),c:c,ep:m.flag==='d'?(m.from+m.to)/2:-1,hm:(p.toLowerCase()==='p'||cap)?0:s.hm+1};
}
function isLegalAfter(s,m){var ns=apply(s,m);return isAttacked(ns.b,kingSq(ns.b,s.t),opp(s.t))?null:ns}
function legalMoves(s){var ps=pseudo(s),out=[];for(var i=0;i<ps.length;i++)if(isLegalAfter(s,ps[i]))out.push(ps[i]);return out}
function evaluate(s){
  var sc=0,b=s.b,i,p,t,w,f,r,rr,v,cf,cr;
  for(i=0;i<N;i++){p=b[i];if(!p)continue;t=p.toLowerCase();w=p!==t;f=i%F;r=(i/F)|0;rr=w?r:R-1-r;v=VAL[t];
    cf=4-Math.abs(f-4);cr=3.5-Math.abs(r-3.5);
    if(t==='p')v+=rr*rr*2+(cf>=3&&rr>=2?10:0);
    else if(t==='n')v+=(cf+cr)*7-14;
    else if(t==='b')v+=(cf+cr)*4;
    else if(t==='r')v+=rr===6?15:0;
    else if(t==='q')v+=(cf+cr)*2;
    else v+=rr===0?(cf<=2?18:6):-12*rr;
    sc+=w?v:-v}
  return s.t==='w'?sc:-sc;
}
function orderMoves(s,ms){
  for(var i=0;i<ms.length;i++){var m=ms[i],cap=s.b[m.to];
    m.o=(cap?VAL[cap.toLowerCase()]*10-VAL[s.b[m.from].toLowerCase()]/10:0)+(m.flag==='e'?1000:0)+(m.promo?(m.promo==='q'?9000:500):0)}
  ms.sort(function(a,b){return b.o-a.o});
}
function quiesce(s,a,be,qd){
  var stand=evaluate(s);if(stand>=be)return stand;if(stand>a)a=stand;if(qd>=3)return a;
  var ps=pseudo(s),caps=[];for(var i=0;i<ps.length;i++){var m=ps[i];if(s.b[m.to]||m.flag==='e'||m.promo==='q')caps.push(m)}
  orderMoves(s,caps);
  for(i=0;i<caps.length;i++){var ns=isLegalAfter(s,caps[i]);if(!ns)continue;
    var v=-quiesce(ns,-be,-a,qd+1);if(v>=be)return v;if(v>a)a=v}
  return a;
}
function negamax(s,depth,a,be,ply){
  var ms=legalMoves(s);
  if(!ms.length)return inCheck(s)?-MATE+ply:0;
  if(s.hm>=100)return 0;
  if(depth<=0)return quiesce(s,a,be,0);
  orderMoves(s,ms);
  for(var i=0;i<ms.length;i++){var v=-negamax(apply(s,ms[i]),depth-1,-be,-a,ply+1);if(v>=be)return v;if(v>a)a=v}
  return a;
}
function bestMove(s,level){
  var ms=legalMoves(s);if(!ms.length)return null;orderMoves(s,ms);
  var depth=level===1?1:level===2?2:level===3?3:4,noise=level===1?90:level===2?18:0;
  var best=ms[0],bestV=-INF,alpha=-INF;
  for(var i=0;i<ms.length;i++){
    var v=-negamax(apply(s,ms[i]),depth-1,-INF,noise?INF:-alpha,1);
    if(noise)v+=(Math.random()*2-1)*noise;
    if(v>bestV){bestV=v;best=ms[i]}
    if(!noise&&v>alpha)alpha=v;
  }
  return {from:best.from,to:best.to,flag:best.flag,promo:best.promo};
}
