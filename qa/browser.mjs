import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import assert from 'node:assert/strict';
import {levels} from '../challenges.js';
function referenceMachine(level){const states=[level.start],map=new Map([[JSON.stringify(level.start),0]]),nodes=[],edges=[];for(let i=0;i<states.length;i++){nodes.push({id:i,x:430+(i%5)*180,y:220+Math.floor(i/5)*220,accept:level.accepts(states[i])});for(const symbol of level.alphabet){const next=level.next(states[i],symbol),key=JSON.stringify(next);if(!map.has(key)){map.set(key,states.length);states.push(next);}edges.push({from:i,to:map.get(key),symbol});}}return {mode:'DFA',alphabet:level.alphabet,start:0,nodes,edges};}
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4173');
async function seed(data){await page.evaluate(data=>localStorage.setItem('dfa-kitchen-v2',JSON.stringify(data)),data);await page.reload();}
const drafts=Object.fromEntries(levels.map(l=>[l.id,referenceMachine(l)]));await seed({levelIndex:0,drafts,collapsed:false});
assert.equal(await page.locator('#level option').count(),20);
await page.locator('#toggle-challenge').click();assert.equal(await page.locator('#challenge-body').isVisible(),false);await page.reload();assert.equal(await page.locator('#challenge-body').isVisible(),false);await page.locator('#toggle-challenge').click();
for(let i=0;i<levels.length;i++){
 await page.locator('#level').selectOption(String(i));assert.equal(await page.locator('#rule').innerText(),levels[i].rule);assert.deepEqual(await page.locator('#alphabet-symbols span').allTextContents(),levels[i].alphabet);
 for(const mode of ['DFA','NFA']){await page.locator('#mode').selectOption(mode);await page.locator('#check').click();await page.waitForFunction(()=>document.querySelector('#result strong').textContent==='Perfect recipe. You did it!');await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#result strong').textContent==='String accepted.');}
}
console.log('PASS: all 20 challenges exact-checked and sample-run via UI in both modes.');
const branching={mode:'NFA',alphabet:['0','1'],start:0,nodes:[{id:0,x:400,y:330,accept:false},{id:1,x:630,y:330,accept:false},{id:2,x:930,y:210,accept:true},{id:3,x:930,y:470,accept:false}],edges:[{from:0,to:1,symbol:'ε'},{from:1,to:0,symbol:'ε'},{from:1,to:2,symbol:'0'},{from:1,to:3,symbol:'0'},{from:2,to:2,symbol:'1'}]};
await seed({levelIndex:0,drafts:{'ends-1':branching},collapsed:false});await page.locator('#test-input').fill('01');await page.locator('#step').click();await page.waitForFunction(()=>!document.querySelector('#step').disabled);assert.deepEqual(await page.locator('.state.active').evaluateAll(ns=>ns.map(n=>Number(n.dataset.id))),[2,3]);await page.screenshot({path:fileURLToPath(new URL('../demo-nfa.png',import.meta.url)),fullPage:true});
await page.locator('#step').click();await page.waitForFunction(()=>document.querySelector('#result strong').textContent==='String accepted.');assert.deepEqual(await page.locator('.state.active').evaluateAll(ns=>ns.map(n=>Number(n.dataset.id))),[2]);assert.equal(await page.locator('.state[data-id="3"]').evaluate(n=>n.classList.contains('dead')),true);
await page.locator('#test-input').fill('00');await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#result strong').textContent==='String rejected.');assert.equal(await page.locator('.state.active').count(),0);
await page.locator('#mode').selectOption('DFA');assert.equal(await page.locator('#mode').inputValue(),'NFA');assert.match(await page.locator('#toast').innerText(),/Cannot switch/);
await page.locator('[data-tool="select"]').click();await page.locator('.state[data-id="1"] .body').click();await page.locator('#accepting').check();await page.locator('#test-input').fill('');await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#result strong').textContent==='String accepted.');
// Alphabet isolation and per-challenge drafts.
await page.locator('#level').selectOption('16');assert.equal(await page.locator('.state').count(),0);assert.deepEqual(await page.locator('[data-symbol]').allTextContents(),['a','b','c']);await page.locator('#mode').selectOption('NFA');assert.deepEqual(await page.locator('[data-symbol]').allTextContents(),['a','b','c','ε']);await page.locator('#test-input').fill('010');await page.locator('#run').click();assert.match(await page.locator('#result').innerText(),/Invalid input/);
await page.locator('#level').selectOption('0');assert.equal(await page.locator('.state').count(),4);assert.equal(await page.locator('#mode').inputValue(),'NFA');
// Real connection editor allows NFA branching and epsilon; forbids exact duplicate arrows.
await page.locator('[data-tool="connect"]').click();await page.locator('.state[data-id="0"] .body').click();await page.locator('.state[data-id="2"] .body').click();await page.locator('[data-symbol="0"]').click();const count=await page.locator('.edge-label').count();await page.locator('.state[data-id="0"] .body').click();await page.locator('.state[data-id="3"] .body').click();await page.locator('[data-symbol="0"]').click();assert.equal(await page.locator('.edge-label').count(),count+1);
await page.locator('.state[data-id="0"] .body').click();await page.locator('.state[data-id="3"] .body').click();await page.locator('[data-symbol="0"]').click();assert.equal(await page.locator('.edge-label').count(),count+1);assert.match(await page.locator('#toast').innerText(),/already exists/);await page.keyboard.press('Escape');
await page.locator('.state[data-id="3"] .body').click();await page.locator('.state[data-id="3"] .body').click();await page.locator('[data-symbol="ε"]').click();assert.equal(await page.locator('.edge-label').count(),count+2);
// Mode changes and undo remain consistent, persisted challenge survives reload.
await page.reload();assert.equal(await page.locator('#mode').inputValue(),'NFA');assert.equal(await page.locator('.edge-label').count(),count+2);
// Check real concurrent motion, step locking, and cancellation while tokens are in flight.
await seed({levelIndex:0,drafts:{'ends-1':branching},collapsed:false});
await page.emulateMedia({reducedMotion:'no-preference'});
await page.locator('#test-input').fill('01');await page.locator('#step').click();
await page.waitForFunction(()=>document.querySelectorAll('#travelers circle').length===2);
assert.equal(await page.locator('#step').isDisabled(),true);assert.equal(await page.locator('#run').isDisabled(),true);
await page.waitForFunction(()=>!document.querySelector('#step').disabled);
assert.deepEqual(await page.locator('.state.active').evaluateAll(ns=>ns.map(n=>Number(n.dataset.id))),[2,3]);
await page.locator('#step').click();await page.waitForFunction(()=>document.querySelectorAll('#travelers circle').length===1);
await page.locator('#clear').click();await page.waitForTimeout(650);assert.equal(await page.locator('.state').count(),0);assert.equal(await page.locator('#travelers circle').count(),0);assert.match(await page.locator('#result').innerText(),/Ready when you are/);
await page.locator('#undo').click();assert.equal(await page.locator('.state').count(),4);
console.log('PASS: simultaneous animated branch tokens, locked stepping, and clean cancellation during playback.');
await page.setViewportSize({width:390,height:844});await page.locator('#fit-view').click();await page.screenshot({path:fileURLToPath(new URL('../demo-mobile.png',import.meta.url)),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#toggle-challenge').click();assert.equal(await page.locator('#challenge-body').isVisible(),false);
assert.deepEqual(errors,[]);console.log('PASS: collapse persistence, NFA branching/death, epsilon cycles/empty input, DFA restrictions, alphabets, drafts, editor duplicate handling, persistence, mobile layout, no browser errors.');await browser.close();
