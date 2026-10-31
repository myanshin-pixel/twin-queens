/* Tilt-glass effect for cards and panels (same idea as on creativ-lab.com).
   Any element with data-tilt tilts toward the cursor; data-tilt-strength sets the angle (default 12°).
   Works for elements added later too, because it listens on the whole document. */
(function(){
  'use strict';
  if(window.matchMedia&&(matchMedia('(pointer: coarse)').matches||matchMedia('(prefers-reduced-motion: reduce)').matches))return;
  var live=new Set(),raf=0;
  function st(el){
    if(!el._tilt)el._tilt={x:0,y:0,tx:0,ty:0,px:50,py:50};
    return el._tilt;
  }
  function loop(){
    raf=0;
    live.forEach(function(el){
      var s=st(el);
      s.x+=(s.tx-s.x)*.16;s.y+=(s.ty-s.y)*.16;
      el.style.setProperty('--xv',s.x.toFixed(3));
      el.style.setProperty('--yv',s.y.toFixed(3));
      el.style.setProperty('--px',s.px.toFixed(1)+'%');
      el.style.setProperty('--py',s.py.toFixed(1)+'%');
      if(!el.matches(':hover')&&Math.abs(s.x)<.02&&Math.abs(s.y)<.02){
        el.style.setProperty('--xv',0);el.style.setProperty('--yv',0);live.delete(el);
      }
    });
    if(live.size)raf=requestAnimationFrame(loop);
  }
  function kick(){if(!raf)raf=requestAnimationFrame(loop)}
  document.addEventListener('mousemove',function(e){
    var el=e.target.closest&&e.target.closest('[data-tilt]');
    if(!el)return;
    var r=el.getBoundingClientRect(),s=st(el),k=parseFloat(el.dataset.tiltStrength)||12;
    var fx=(e.clientX-r.left)/r.width,fy=(e.clientY-r.top)/r.height;
    s.tx=(fy-.5)*-k;s.ty=(fx-.5)*k;s.px=fx*100;s.py=fy*100;
    live.add(el);kick();
  },{passive:true});
  document.addEventListener('mouseout',function(e){
    var el=e.target.closest&&e.target.closest('[data-tilt]');
    if(!el||(e.relatedTarget&&el.contains(e.relatedTarget)))return;
    var s=st(el);s.tx=0;s.ty=0;live.add(el);kick();
  });
})();
