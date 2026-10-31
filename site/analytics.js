/* Twin Queens Chess — visit statistics (Yandex Metrica) with a cookie-consent banner.
   Nothing is loaded until the visitor agrees. tqTrack(name, params) records a goal. */
(function(){
  'use strict';
  var C=window.TQ_CONFIG||{},id=parseInt(C.metrikaId,10);
  var inApp=!!window.Capacitor||/TwinQueensApp/.test(navigator.userAgent);
  var queue=[],ready=false;
  window.tqTrack=function(name,params){
    if(!id||inApp)return;
    if(ready&&window.ym){try{ym(id,'reachGoal',name,params||{})}catch(e){}}
    else if(queue.length<50)queue.push([name,params]);
  };
  if(!id||inApp)return;

  function getConsent(){try{return localStorage.getItem('tq-consent')}catch(e){return null}}
  function setConsent(v){try{localStorage.setItem('tq-consent',v)}catch(e){}}
  function load(){
    (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();
      k=e.createElement(t),a=e.getElementsByTagName(t)[0];k.async=1;k.src=r;a.parentNode.insertBefore(k,a)})
      (window,document,'script','https://mc.yandex.ru/metrika/tag.js','ym');
    ym(id,'init',{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:false});
    ready=true;
    queue.splice(0).forEach(function(q){window.tqTrack(q[0],q[1])});
  }
  var c=getConsent();
  if(c==='yes'){load();return}
  if(c==='no')return;

  var ru=typeof tqLang==='function'?tqLang()==='ru':/^(ru|uk|be|kk)/i.test(navigator.language||'');
  var b=document.createElement('div');b.className='consent';
  b.innerHTML='<p>'+(ru?'Мы используем cookie и Яндекс Метрику, чтобы считать посещения и партии. Подробнее — в <a href="privacy.html">политике конфиденциальности</a>.'
    :'We use cookies and Yandex Metrica to count visits and games. See our <a href="privacy.html">privacy policy</a>.')+'</p>'+
    '<div><button class="btn" data-c="no">'+(ru?'Только необходимые':'Necessary only')+'</button>'+
    '<button class="btn primary" data-c="yes">'+(ru?'Принять':'Accept')+'</button></div>';
  b.addEventListener('click',function(e){var x=e.target.closest('[data-c]');if(!x)return;setConsent(x.dataset.c);b.remove();if(x.dataset.c==='yes')load()});
  function show(){document.body.appendChild(b)}
  if(document.body)show();else document.addEventListener('DOMContentLoaded',show);
})();
