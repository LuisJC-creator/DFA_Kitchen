// Camera coordinates are independent of graph coordinates and undo history.
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 3;
export function zoomAt(camera, nextZoom, point) {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
  return {x:camera.x + point.x / camera.zoom - point.x / zoom,
    y:camera.y + point.y / camera.zoom - point.y / zoom, zoom};
}
export function createViewport(svg, {isHandTool, onNavigate}) {
  let camera={x:0,y:0,zoom:1}, pan=null, space=false, suppressClickUntil=0;
  const container=svg.parentElement;
  const rect=()=>svg.getBoundingClientRect();
  function apply() {
    const {width,height}=rect();
    svg.setAttribute('viewBox',`${camera.x} ${camera.y} ${width/camera.zoom} ${height/camera.zoom}`);
    svg.style.backgroundSize=`${25*camera.zoom}px ${25*camera.zoom}px`;
    svg.style.backgroundPosition=`${-camera.x*camera.zoom}px ${-camera.y*camera.zoom}px`;
    document.querySelector('#zoom-level').textContent=`${Math.round(camera.zoom*100)}%`;
    document.querySelector('#zoom-out').disabled=camera.zoom<=MIN_ZOOM;
    document.querySelector('#zoom-in').disabled=camera.zoom>=MAX_ZOOM;
  }
  function cursor(){container.classList.toggle('pan-ready',space||isHandTool());container.classList.toggle('panning',!!pan);}
  function zoomTo(value, point) {const r=rect();camera=zoomAt(camera,value,point||{x:r.width/2,y:r.height/2});apply();}
  function stop(event) {if(!pan || (event && event.pointerId!==pan.id))return;
    suppressClickUntil=performance.now()+100;
    if(svg.hasPointerCapture(pan.id))svg.releasePointerCapture(pan.id);
    pan=null;cursor();
  }
  svg.addEventListener('pointerdown',event=>{
    const background=!event.target.closest('.state,.edge-label');
    if(event.button!==1 && !(event.button===0&&(space||isHandTool()||(background&&document.querySelector('[data-tool="select"]').classList.contains('active')))))return;
    event.preventDefault();event.stopImmediatePropagation();svg.focus({preventScroll:true});onNavigate();
    pan={id:event.pointerId,x:event.clientX,y:event.clientY,originX:camera.x,originY:camera.y};
    svg.setPointerCapture(event.pointerId);cursor();
  },true);
  svg.addEventListener('pointermove',event=>{if(!pan||event.pointerId!==pan.id)return;
    event.preventDefault();event.stopImmediatePropagation();
    camera.x=pan.originX-(event.clientX-pan.x)/camera.zoom;
    camera.y=pan.originY-(event.clientY-pan.y)/camera.zoom;apply();
  },true);
  for(const name of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(name,stop);
  svg.addEventListener('click',event=>{if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
  svg.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();});
  svg.addEventListener('wheel',event=>{
    event.preventDefault();if(pan)return;onNavigate();const r=rect();
    const unit=event.deltaMode===1?16:event.deltaMode===2?r.height:1;
    if(event.ctrlKey||event.metaKey)zoomTo(camera.zoom*Math.exp(-event.deltaY*unit*.006),{x:event.clientX-r.left,y:event.clientY-r.top});
    else {camera.x+=(event.shiftKey?event.deltaY:event.deltaX)*unit/camera.zoom;camera.y+=(event.shiftKey?0:event.deltaY)*unit/camera.zoom;apply();}
  },{passive:false});
  document.addEventListener('keydown',event=>{if(event.code!=='Space'||event.target.closest('input,select,textarea,button')||document.querySelector('dialog[open]'))return;event.preventDefault();space=true;cursor();});
  document.addEventListener('keyup',event=>{if(event.code==='Space'){space=false;cursor();}});
  window.addEventListener('blur',()=>{space=false;stop();cursor();});
  document.querySelector('#zoom-in').onclick=()=>{onNavigate();zoomTo(camera.zoom*1.2);};
  document.querySelector('#zoom-out').onclick=()=>{onNavigate();zoomTo(camera.zoom/1.2);};
  document.querySelector('#zoom-level').onclick=()=>{onNavigate();zoomTo(1);};
  new ResizeObserver(apply).observe(svg);
  return {apply,cursor,
    fit(bounds,leftInset=0) {
      const {width,height}=rect();
      const padding=28, available=Math.max(100,width-leftInset-padding*2);
      const zoom=Math.max(MIN_ZOOM,Math.min(1,available/(bounds.right-bounds.left),Math.max(100,height-padding*2)/(bounds.bottom-bounds.top)));
      camera={zoom,x:(bounds.left+bounds.right)/2-(leftInset+(width-leftInset)/2)/zoom,y:(bounds.top+bounds.bottom)/2-height/2/zoom};apply();
    },
    safePoint(point) {
      const {width,height}=rect(), right=camera.x+width/camera.zoom,bottom=camera.y+height/camera.zoom;
      const mx=Math.min(65,width/camera.zoom/2),mt=Math.min(65,height/camera.zoom/2),mb=Math.min(100,height/camera.zoom/2);
      return {x:Math.max(camera.x+mx,Math.min(right-mx,point.x)),y:Math.max(camera.y+mt,Math.min(bottom-mb,point.y))};
    }
  };
}
