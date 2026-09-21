import test from 'node:test';
import assert from 'node:assert/strict';
import {zoomAt,MIN_ZOOM,MAX_ZOOM} from './viewport.js';
test('zoom preserves the world point under the pointer',()=>{
 const camera={x:-1400,y:2800,zoom:.45},pointer={x:735,y:219};
 for(const target of [.01,.1,1,3,100]){
  const next=zoomAt(camera,target,pointer);
  assert.ok(Math.abs((camera.x+pointer.x/camera.zoom)-(next.x+pointer.x/next.zoom))<1e-9);
  assert.ok(Math.abs((camera.y+pointer.y/camera.zoom)-(next.y+pointer.y/next.zoom))<1e-9);
  assert.ok(next.zoom>=MIN_ZOOM&&next.zoom<=MAX_ZOOM);
 }
});
test('zooming out and back restores the camera',()=>{
 const initial={x:100,y:-800,zoom:1},point={x:300,y:200};
 assert.deepEqual(zoomAt(zoomAt(initial,.25,point),1,point),initial);
});
