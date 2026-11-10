/* Twin Queens browser bridge for Fairy-Stockfish WASM. */
(function(){
'use strict';
const VARIANT_INI=[
  '[twinqueens:chess]',
  'maxFile = 9',
  'maxRank = 8',
  'startFen = rnbqkqnbr/ppppppppp/9/9/9/9/PPPPPPPPP/RNBQKQNBR w KQkq - 0 1',
  'castlingKingsideFile = g',
  'castlingQueensideFile = c',
  'castlingRookKingsideFile = i'
].join('\n');
let enginePromise=null,engine=null,queue=Promise.resolve(),activeSearch=null,originalPrompt=null;
function installInput(lines){
  if(originalPrompt===null)originalPrompt=window.prompt;
  const input=lines.slice();
  window.prompt=function(){return input.length?input.shift():''};
}
function restoreInput(){if(originalPrompt!==null){window.prompt=originalPrompt;originalPrompt=null}}
function command(text,lines=[],done='readyok',timeout=15000){
  return new Promise((resolve,reject)=>{
    const output=[];let settled=false,timer;
    const finish=fn=>{if(settled)return;settled=true;clearTimeout(timer);engine.removeMessageListener(onLine);restoreInput();fn()};
    const onLine=line=>{line=String(line||'');output.push(line);if(line===done)finish(()=>resolve(output))};
    timer=setTimeout(()=>finish(()=>reject(new Error('Fairy-Stockfish timed out.'))),timeout);
    engine.addMessageListener(onLine);if(lines.length)installInput(lines);
    try{engine.postMessage(text);if(done==='readyok')engine.postMessage('isready')}
    catch(e){finish(()=>reject(e))}
  });
}
function serial(task){const next=queue.then(task,task);queue=next.catch(()=>{});return next}
function init(){
  if(enginePromise)return enginePromise;
  enginePromise=(async()=>{
    if(typeof window.Stockfish!=='function')throw new Error('Fairy-Stockfish WASM is missing.');
    engine=await window.Stockfish();
    const marker='TQ_VARIANT_EOF_'+Date.now();
    await command('load <<'+marker,[...VARIANT_INI.split('\n'),marker]);
    await command('setoption name UCI_Variant value twinqueens');
    await command('setoption name Threads value 1');
    return engine;
  })().catch(e=>{enginePromise=null;engine=null;throw e});
  return enginePromise;
}
function square(i){return 'abcdefghi'[i%9]+(Math.floor(i/9)+1)}
function moveText(m){return square(m.from)+square(m.to)+(m.promo||'')}
function getBestMove(state,history,level,remainingMs){
  return serial(async()=>{
    const e=await init();
    const skill=[1,5,10,20][Math.max(0,Math.min(3,(level|0)-1))];
    await command('setoption name Skill Level value '+skill);
    const moves=history.map(x=>moveText(x.m));
    await command('position startpos'+(moves.length?' moves '+moves.join(' '):''));
    const base=[350,800,1800,4000][Math.max(0,Math.min(3,(level|0)-1))];
    const budget=remainingMs>0?Math.max(150,Math.min(base,remainingMs-100)):base;
    return new Promise((resolve,reject)=>{
      let settled=false,timer;
      const finish=fn=>{if(settled)return;settled=true;clearTimeout(timer);e.removeMessageListener(onLine);activeSearch=null;fn()};
      const onLine=line=>{
        const match=String(line||'').match(/^bestmove\s+(\S+)/);if(!match)return;
        const uci=match[1];
        if(uci==='(none)'||uci==='0000'){finish(()=>resolve(null));return}
        const files='abcdefghi',fromFile=files.indexOf(uci[0]),fromRank=Number(uci[1])-1,toFile=files.indexOf(uci[2]),toRank=Number(uci[3])-1;
        if(fromFile<0||toFile<0||fromRank<0||fromRank>7||toRank<0||toRank>7){finish(()=>reject(new Error('Unexpected Fairy-Stockfish move: '+uci)));return}
        finish(()=>resolve({from:fromRank*9+fromFile,to:toRank*9+toFile,promo:uci.length>4?uci[4]:null}));
      };
      activeSearch={stop:()=>{try{e.postMessage('stop')}catch(_){}finish(()=>resolve(null))}};
      e.addMessageListener(onLine);
      timer=setTimeout(()=>{try{e.postMessage('stop')}catch(_){}finish(()=>reject(new Error('Fairy-Stockfish move timed out.')))},Math.max(12000,budget+8000));
      e.postMessage('go movetime '+budget);
    });
  });
}
window.tqFairyEngine={bestMove:getBestMove,stop:()=>{if(activeSearch)activeSearch.stop()}};
})();