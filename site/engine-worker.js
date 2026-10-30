importScripts('engine.js');
onmessage=function(e){postMessage({id:e.data.id,m:bestMove(e.data.s,e.data.level)})};
