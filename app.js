import {createViewport} from './viewport.js';
import {levels,EPSILON,validate,closure,initialStates,advanceStates,accepts} from './automata.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const svg=$('#canvas'), ns='http://www.w3.org/2000/svg';
let machine,levelIndex=0,tool='select',selected=null,source=null,pending=null,editing=null,drag=null,history=[],simulation=null,playing=false,runVersion=0;
let drafts={},collapsed=false,checker=null,checkTimer=null;
const starter=()=>({mode:'DFA',alphabet:['0','1'],start:0,nodes:[{id:0,x:560,y:300,accept:false},{id:1,x:880,y:300,accept:true}],edges:[{from:0,to:0,symbol:'0'},{from:0,to:1,symbol:'1'},{from:1,to:0,symbol:'0'}]});
try {
 const saved=JSON.parse(localStorage.getItem('dfa-kitchen-v2'));
 if(saved){drafts=saved.drafts||{};levelIndex=Math.max(0,Math.min(levels.length-1,saved.levelIndex||0));collapsed=!!saved.collapsed;machine=drafts[levels[levelIndex].id];}
 else {const legacy=JSON.parse(localStorage.getItem('dfa-kitchen-v1'));if(legacy?.machine){machine=legacy.machine;levelIndex=Math.max(0,Math.min(2,legacy.levelIndex||0));}}
}catch{}
machine??=starter();machine.mode??='DFA';machine.alphabet=levels[levelIndex].alphabet;
const el=(name,attrs={},text)=>{const n=document.createElementNS(ns,name);for(const [key,val] of Object.entries(attrs))n.setAttribute(key,val);if(text!==undefined)n.textContent=text;return n;};
const sub=id=>String(id).replace(/\d/g,c=>'₀₁₂₃₄₅₆₇₈₉'[Number(c)]);
const node=id=>machine.nodes.find(n=>n.id===id);
function save(){drafts[levels[levelIndex].id]=structuredClone(machine);try{localStorage.setItem('dfa-kitchen-v2',JSON.stringify({drafts,levelIndex,collapsed}));}catch{}}
function remember(){history.push(JSON.stringify(machine));if(history.length>60)history.shift();$('#undo').disabled=false;}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),3200);}
function result(title,description='',kind=''){const target=$('#result');target.className='result '+kind;target.querySelector('strong').textContent=title;target.querySelector('small').textContent=description;}
function stopCheck(){checker?.terminate();checker=null;clearTimeout(checkTimer);$('#check').disabled=false;$('#check').innerHTML='Check my machine <span>↗</span>';}
function resetSimulation(){stopCheck();runVersion++;playing=false;simulation=null;$('#run').innerHTML='<span>▶</span> Run string';$('#run').disabled=false;$('#step').disabled=false;$('#travelers').replaceChildren();$('#input-tokens').replaceChildren();$$('.state.active,.state.dead').forEach(n=>n.classList.remove('active','dead'));$$('.edge-path.running').forEach(n=>n.classList.remove('running'));result('Ready when you are.','Watch your machine think.');}
function changed(){resetSimulation();syncMode();save();render();}
function geometry(e){const a=node(e.from),b=node(e.to);if(!a||!b)return null;if(a.id===b.id){const loops=machine.edges.filter(t=>t.from===a.id&&t.to===a.id),index=loops.indexOf(e),angle=loops.length===1?-Math.PI/2:-Math.PI/2+(index-(loops.length-1)/2)*1.35;const u={x:Math.cos(angle),y:Math.sin(angle)},v={x:-u.y,y:u.x};const p=(out,side)=>`${a.x+u.x*out+v.x*side} ${a.y+u.y*out+v.y*side}`;return {d:`M ${p(43,-27)} C ${p(185,-94)}, ${p(185,94)}, ${p(43,27)}`,x:a.x+u.x*151,y:a.y+u.y*151};}
const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;const reverse=machine.edges.some(t=>t.from===b.id&&t.to===a.id),parallel=machine.edges.filter(t=>t.from===a.id&&t.to===b.id),index=parallel.indexOf(e);const bend=reverse?60+index*75:(index-(parallel.length-1)/2)*85;const cx=(a.x+b.x)/2-uy*bend,cy=(a.y+b.y)/2+ux*bend;const al=Math.hypot(cx-a.x,cy-a.y)||1,bl=Math.hypot(cx-b.x,cy-b.y)||1;const sx=a.x+(cx-a.x)/al*57,sy=a.y+(cy-a.y)/al*57,ex=b.x+(cx-b.x)/bl*64,ey=b.y+(cy-b.y)/bl*64;return {d:`M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`,x:.25*sx+.5*cx+.25*ex,y:.25*sy+.5*cy+.25*ey};}
function render(){
  $('#edges').replaceChildren();$('#nodes').replaceChildren();
  machine.edges.forEach((e,i)=>{const g=geometry(e);if(!g)return;const path=el('path',{d:g.d,class:'edge-path',id:'edge-'+i});$('#edges').append(path);const badge=el('g',{class:'edge-label',transform:`translate(${g.x},${g.y})`,tabindex:0,role:'button','aria-label':`Edit transition q${e.from} to q${e.to} on ${e.symbol}`});badge.append(el('rect',{x:-17,y:-17,width:34,height:34,rx:11}),el('text',{'text-anchor':'middle',y:6},e.symbol));badge.addEventListener('click',event=>{event.stopPropagation();openEdgeEditor(i,g);});badge.addEventListener('keydown',event=>{if(event.key==='Enter')openEdgeEditor(i,g);});$('#edges').append(badge);});
  machine.nodes.forEach(n=>{
    const group=el('g',{class:`state${selected===n.id?' selected':''}${source===n.id?' source':''}${simulation?.active.includes(n.id)?' active':''}${simulation?.dead?.includes(n.id)?' dead':''}`,transform:`translate(${n.x},${n.y})`,'data-id':n.id,tabindex:0,role:'button','aria-label':`State q${n.id}${n.accept?', accepting':''}${machine.start===n.id?', starting state':''}`});
    group.append(el('ellipse',{cx:0,cy:58,rx:44,ry:10,fill:'#7c8763',opacity:.17,filter:'url(#shadow)'}),el('circle',{r:64,class:'selection-ring'}));
    const body=el('g',{class:'body'});body.append(el('circle',{cy:8,r:51,fill:n.accept?'#cb5030':'#12759d'}),el('circle',{r:51,fill:n.accept?'url(#orange)':'url(#blue)'}),el('path',{d:'M -33 -29 Q -6 -51 28 -33',fill:'none',stroke:'#ffffff',opacity:.28,'stroke-width':3,'stroke-linecap':'round'}));if(n.accept)body.append(el('circle',{r:40,fill:'none',stroke:'#ffe9ce','stroke-width':2.5,opacity:.85}));body.append(el('text',{class:'name','text-anchor':'middle',y:9},'q'+sub(n.id)));group.append(body);
    if(machine.start===n.id){group.append(el('path',{d:'M -110 0 H -70 M -78 -7 L -70 0 L -78 7',class:'start-arrow'}),el('text',{x:-93,y:20,'text-anchor':'middle',class:'state-caption'},'START'));}
    group.append(el('text',{class:'state-caption','text-anchor':'middle',y:88},n.accept?'ACCEPT':'STATE'));group.addEventListener('pointerdown',event=>stateDown(event,n));group.addEventListener('dblclick',event=>{event.preventDefault();if(tool==='select'){remember();n.accept=!n.accept;changed();showInspector(n.id);}});group.addEventListener('keydown',event=>{if(event.key==='Enter'){if(tool==='connect')connectClick(n.id);else {selected=n.id;showInspector(n.id);render();}}});$('#nodes').append(group);
  });
  $('#counts').textContent=`${machine.nodes.length} STATES · ${machine.edges.length} ARROWS`;$('#undo').disabled=!history.length;
}
function coords(event){return new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());}
function setTool(value){cancel();tool=value;svg.focus({preventScroll:true});$$('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));svg.style.cursor=tool==='state'?'crosshair':tool==='connect'?'crosshair':'default';viewport.cursor();$('#canvas-tip').textContent=tool==='state'?'Click an empty spot to place a state.':tool==='connect'?'Click a source, then a destination. Esc to cancel.':'Drag empty space to pan · Ctrl + scroll to zoom';$('#inspector').hidden=true;selected=null;render();}
function cancel(){source=null;pending=null;editing=null;$('#symbol-picker').hidden=true;$('#symbol-picker .delete-edge')?.remove();$('#preview').setAttribute('d','');render();}
function stateDown(event,n){if(event.button!==0)return;event.stopPropagation();if(tool==='connect'){connectClick(n.id);return;}if(tool==='state')return;source=null;pending=null;editing=null;$('#symbol-picker').hidden=true;$('#preview').setAttribute('d','');selected=n.id;const p=coords(event);drag={id:n.id,dx:p.x-n.x,dy:p.y-n.y,x:p.x,y:p.y,moved:false};showInspector(n.id);$$('.state').forEach(g=>g.classList.toggle('selected',Number(g.dataset.id)===n.id));}
function connectClick(id){if(source===null){source=id;resetSimulation();render();$('#canvas-tip').textContent='Now choose a destination. Same state makes a loop.';}else{pending={from:source,to:id};const n=node(id);showPicker(n.x,n.y-90);$('#preview').setAttribute('d','');}}
function showPicker(x,y){const pt=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());const rect=$('.playground').getBoundingClientRect(),picker=$('#symbol-picker');picker.style.left=Math.max(95,Math.min(rect.width-95,pt.x-rect.left))+'px';picker.style.top=Math.max(65,pt.y-rect.top)+'px';picker.hidden=false;picker.querySelector('button').focus();}
function openEdgeEditor(i,g){cancel();editing=i;showPicker(g.x,g.y-47);const button=document.createElement('button');button.className='delete-edge';button.textContent='Delete';button.onclick=()=>{remember();machine.edges.splice(i,1);cancel();changed();};$('#symbol-picker').append(button);}
svg.addEventListener('pointermove',event=>{const p=coords(event);if(drag){const n=node(drag.id);if(!drag.moved&&Math.hypot(p.x-drag.x,p.y-drag.y)>3){remember();resetSimulation();drag.moved=true;}if(drag.moved){svg.setPointerCapture(event.pointerId);const safe=viewport.safePoint({x:p.x-drag.dx,y:p.y-drag.dy});n.x=safe.x;n.y=safe.y;render();}}else if(source!==null&&!pending){const n=node(source);$('#preview').setAttribute('d',`M ${n.x} ${n.y} L ${p.x} ${p.y}`);}});
window.addEventListener('pointerup',()=>{if(drag?.moved)save();drag=null;});svg.addEventListener('pointercancel',()=>{drag=null;save();});
svg.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('.state,.edge-label'))return;if(tool==='state'){if(machine.nodes.length>=40){toast('This demo supports up to 40 states.');return;}const p=viewport.safePoint(coords(event));if(machine.nodes.some(n=>Math.hypot(p.x-n.x,p.y-n.y)<125)){toast('Place states farther apart.');return;}remember();let id=0;while(node(id))id++;machine.nodes.push({id,x:p.x,y:p.y,accept:false});if(machine.nodes.length===1)machine.start=id;changed();}else{cancel();selected=null;$('#inspector').hidden=true;render();}});
$('.playground').addEventListener('contextmenu',event=>{event.preventDefault();cancel();});
$('#symbol-options').onclick=event=>{
 const button=event.target.closest('[data-symbol]');if(!button)return;
 const symbol=button.dataset.symbol,edge=editing!==null?machine.edges[editing]:pending;if(!edge)return;
 const duplicate=machine.edges.some((e,i)=>i!==editing&&e.from===edge.from&&e.symbol===symbol&&(machine.mode==='DFA'||e.to===edge.to));
 if(duplicate){toast(machine.mode==='DFA'?`q${edge.from} already has an outgoing ${symbol} arrow.`:'That transition already exists.');return;}
 remember();if(editing!==null)machine.edges[editing].symbol=symbol;else machine.edges.push({...pending,symbol});cancel();changed();$('#canvas-tip').textContent='Connected. Pick another source, or press V to move.';
};$('#cancel-edge').onclick=cancel;
function showInspector(id){const n=node(id);if(!n)return;$('#inspector').hidden=false;$('#selected-name').textContent='q'+sub(id);$('#accepting').checked=n.accept;$('#make-start').textContent=machine.start===id?'✓ Starting state':'Set as starting state →';$('#make-start').disabled=machine.start===id;}
$('#close-inspector').onclick=()=>{$('#inspector').hidden=true;selected=null;render();};$('#accepting').onchange=event=>{if(selected===null)return;remember();node(selected).accept=event.target.checked;changed();};$('#make-start').onclick=()=>{if(selected===null)return;remember();machine.start=selected;changed();showInspector(selected);};
function deleteSelected(){if(selected===null)return;remember();machine.nodes=machine.nodes.filter(n=>n.id!==selected);machine.edges=machine.edges.filter(e=>e.from!==selected&&e.to!==selected);if(machine.start===selected)machine.start=machine.nodes[0]?.id??null;selected=null;$('#inspector').hidden=true;changed();}
$('#delete-selected').onclick=deleteSelected;$$('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));$('#undo').onclick=()=>{if(!history.length)return;machine=JSON.parse(history.pop());selected=null;$('#inspector').hidden=true;cancel();changed();};$('#clear').onclick=()=>{remember();machine={mode:machine.mode,alphabet:levels[levelIndex].alphabet,start:null,nodes:[],edges:[]};selected=null;cancel();changed();setTool('state');toast('Canvas cleared. Use Undo to restore it.');};
function syncMode(){
 $('#mode').value=machine.mode;
 $('#mode-rule').textContent=machine.mode==='NFA'?'Branching and ε-transitions allowed. Any accepting branch wins after the full input.':'One outgoing arrow per symbol. Missing transitions reject.';
 $('#symbol-options').replaceChildren(...[...levels[levelIndex].alphabet,...(machine.mode==='NFA'?[EPSILON]:[])].map(symbol=>{const b=document.createElement('button');b.dataset.symbol=symbol;b.textContent=symbol;b.title=symbol===EPSILON?'Epsilon: consumes no input':`Read ${symbol}`;return b;}));
}
function changeLevel(){const level=levels[levelIndex];machine.alphabet=level.alphabet;
 $('#level').value=levelIndex;$('#rule').textContent=level.rule;$('#level-detail').textContent=level.detail;$('#challenge-source').textContent=level.source;$('#level-count').textContent=`${String(levelIndex+1).padStart(2,'0')} / ${levels.length}`;
 $('#alphabet-symbols').replaceChildren(...level.alphabet.map(c=>{const span=document.createElement('span');span.textContent=c;return span;}));
 $('#input-label').textContent=level.alphabet.join('')==='01'?'BINARY INPUT':'INPUT · '+level.alphabet.join(', ');
 $('#test-input').value=level.example;resetSimulation();syncMode();save();render();
}
levels.forEach((level,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${String(i+1).padStart(2,'0')}. ${level.name}`;$('#level').append(option);});
$('#level').onchange=event=>{save();levelIndex=Number(event.target.value);machine=structuredClone(drafts[levels[levelIndex].id]||{mode:levels[levelIndex].preferredMode,alphabet:levels[levelIndex].alphabet,start:null,nodes:[],edges:[]});history=[];selected=null;drag=null;cancel();$('#inspector').hidden=true;changeLevel();setTool(machine.nodes.length?'select':'state');fitView();};
$('#mode').onchange=event=>{const mode=event.target.value;const proposed={...machine,mode};const error=machine.nodes.length?validate(proposed,levels[levelIndex].alphabet):null;
 if(error){$('#mode').value=machine.mode;toast('Cannot switch modes: '+error);return;}remember();machine.mode=mode;cancel();changed();};
function setCollapsed(value){collapsed=value;$('.challenge-panel').classList.toggle('collapsed',value);$('#challenge-body').hidden=value;$('#toggle-challenge').setAttribute('aria-expanded',String(!value));$('#toggle-challenge').title=value?'Expand challenge':'Collapse challenge';$('#collapse-icon').textContent=value?'+':'−';save();}
$('#toggle-challenge').onclick=()=>setCollapsed(!collapsed);
function prepare(){const input=$('#test-input').value,level=levels[levelIndex];if([...input].some(c=>!level.alphabet.includes(c))){result('Invalid input symbol.',`Use only ${level.alphabet.join(', ')}. Leave empty to test ε.`,'failure');return false;}
 const error=validate(machine,level.alphabet);if(error){toast(error);return false;}
 simulation={word:input,index:0,active:[machine.start],dead:[],initialized:false,finished:false};$('#input-tokens').replaceChildren(...[...input].map(()=>document.createElement('span')));render();return true;
}
async function animateEdges(indices,version,epsilon=false){
 const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:epsilon?260:550;
 const paths=indices.map(i=>({index:i,path:$('#edge-'+i)})).filter(x=>x.path);if(!paths.length)return;
 const tokens=paths.map(({path,index})=>{const token=el('circle',{r:8,fill:epsilon?'#bea2de':'#fbd34d',stroke:'#fffaf0','stroke-width':3});$('#travelers').append(token);path.classList.add('running');return {token,index,length:path.getTotalLength(),path};});
 const start=performance.now();await new Promise(resolve=>{function frame(now){if(version!==runVersion){resolve();return;}const progress=duration?Math.min(1,(now-start)/duration):1;
 for(const {token,index,path,length} of tokens){const current=$('#edge-'+index)||path;const p=current.getPointAtLength((current===path?length:current.getTotalLength())*progress*progress*(3-2*progress));token.setAttribute('cx',p.x);token.setAttribute('cy',p.y);}
 if(progress<1)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
 for(const {token,index} of tokens){token.remove();$('#edge-'+index)?.classList.remove('running');}
}
async function followEpsilon(seeds,waves,version){simulation.active=[...seeds];render();for(const wave of waves){result('Following ε-transitions.','No input symbol is consumed.');await animateEdges(wave,version,true);if(version!==runVersion)return false;simulation.active=[...new Set([...simulation.active,...wave.map(i=>machine.edges[i].to)])];render();}return true;}
function finish(){if(!simulation)return;simulation.finished=true;const pass=accepts(machine,simulation.active);
 result(pass?'String accepted.':'String rejected.',pass?(machine.mode==='NFA'?'At least one accepting branch remains after the full input.':'Finished in an accepting state.'):!simulation.active.length?'All computation branches have stopped.':'No accepting state remains after the full input.',pass?'success':'failure');
}
async function advance(){if(!simulation||simulation.finished)return;
 const version=runVersion;
 if(!simulation.initialized){const initial=closure(machine,[machine.start]);if(!await followEpsilon([machine.start],initial.waves,version))return;simulation.active=initial.states;simulation.initialized=true;render();}
 if(simulation.index===simulation.word.length){finish();return;}
 const symbol=simulation.word[simulation.index],next=advanceStates(machine,simulation.active,symbol);
 simulation.dead=next.dead;render();result(`Reading ${symbol}.`,`${next.transitions.length} matching transition${next.transitions.length===1?'':'s'}.`);
 await animateEdges(next.transitions,version);if(version!==runVersion)return;
 if(!await followEpsilon(next.destinations,next.epsilonWaves,version))return;
 simulation.active=next.states;simulation.index++;[...$('#input-tokens').children].forEach((n,i)=>n.classList.toggle('read',i<simulation.index));render();
 result(`Read ${symbol} · ${next.states.length} active state${next.states.length===1?'':'s'}.`,next.dead.length?`${next.dead.map(id=>'q'+id).join(', ')} had no ${symbol} transition; those paths stop.`:`${simulation.index} of ${simulation.word.length} symbols.`);
 if(!next.states.length||simulation.index===simulation.word.length)finish();
}
$('#run').onclick=async()=>{if(playing){resetSimulation();render();return;}resetSimulation();if(!prepare())return;playing=true;const version=runVersion;$('#run').innerHTML='<span>■</span> Stop';$('#step').disabled=true;
 while(simulation&&!simulation.finished&&version===runVersion)await advance();if(version===runVersion){playing=false;$('#run').innerHTML='<span>▶</span> Run again';$('#step').disabled=false;}};
$('#step').onclick=async()=>{if(!simulation||simulation.finished){resetSimulation();if(!prepare())return;}const version=runVersion;$('#step').disabled=true;$('#run').disabled=true;try{await advance();}finally{if(version===runVersion){$('#step').disabled=false;$('#run').disabled=false;}}};$('#test-input').addEventListener('input',resetSimulation);
$('#check').onclick=()=>{resetSimulation();const version=runVersion;$('#check').disabled=true;$('#check').textContent='Checking…';result('Checking the complete language.','Exploring reachable state combinations.');
 checker=new Worker('./checker.worker.js',{type:'module'});
 checker.onmessage=({data:verdict})=>{if(version!==runVersion)return;stopCheck();if(verdict.error){result(verdict.inconclusive?'Check incomplete.':'Check your machine.',verdict.error,'failure');return;}
 if(verdict.equivalent){result('Perfect recipe. You did it!','Your machine recognizes exactly this language.','success');svg.classList.remove('celebrate');requestAnimationFrame(()=>svg.classList.add('celebrate'));setTimeout(()=>svg.classList.remove('celebrate'),900);toast('Every string checks out.');}
 else{$('#test-input').value=verdict.word;result(`Try ${verdict.word||'ε (the empty string)'}.`,verdict.expected?'This should be accepted, but your machine rejects it.':'This should be rejected, but your machine accepts it.','failure');toast('Found the shortest counterexample. Run it to explore.');}};
 checker.onerror=()=>{stopCheck();result('Check incomplete.','The checker could not finish. No correctness verdict was made.','failure');};
 checker.postMessage({machine,levelIndex});checkTimer=setTimeout(()=>{stopCheck();result('Check incomplete.','Time limit reached. No correctness verdict was made. Simplify the machine and retry.','failure');},8000);
};
$('#help').onclick=()=>$('#help-dialog').showModal();$('#close-help').onclick=()=>$('#help-dialog').close();$('#reset-example').onclick=()=>{save();levelIndex=0;history=[];machine=starter();selected=null;cancel();changeLevel();changed();$('#help-dialog').close();setTool('select');fitView();};
document.addEventListener('keydown',event=>{if(event.key==='Escape'){cancel();$('#inspector').hidden=true;selected=null;render();return;}if(event.target.matches('input,select,textarea')||$('#help-dialog').open)return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();$('#undo').click();return;}if(event.ctrlKey||event.metaKey||event.altKey)return;const tools={v:'select',s:'state',c:'connect',h:'hand'};if(tools[event.key.toLowerCase()])setTool(tools[event.key.toLowerCase()]);if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();if(editing!==null){$('#symbol-picker .delete-edge')?.click();}else deleteSelected();}});
function navigate(){cancel();selected=null;$('#inspector').hidden=true;render();}
const viewport=createViewport(svg,{isHandTool:()=>tool==='hand',onNavigate:navigate});
function fitView(){
  navigate();
  const bounds=machine.nodes.length?{left:Math.min(...machine.nodes.map(n=>n.x-130)),right:Math.max(...machine.nodes.map(n=>n.x+115)),top:Math.min(...machine.nodes.map(n=>n.y-180)),bottom:Math.max(...machine.nodes.map(n=>n.y+105))}:{left:400,right:1000,top:100,bottom:500};
  const panel=$('.challenge-panel').getBoundingClientRect(),canvas=svg.getBoundingClientRect();
  viewport.fit(bounds,innerWidth>760&&!collapsed?Math.max(0,panel.right-canvas.left+25):0);
}
$('#fit-view').onclick=fitView;
window.addEventListener('resize',()=>{cancel();viewport.apply();});
setCollapsed(collapsed);changeLevel();render();fitView();
