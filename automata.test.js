import test from 'node:test';
import assert from 'node:assert/strict';
import {levels,check,validate,initialStates,advanceStates,runMachine,closure} from './automata.js';
const ones=w=>[...w].filter(c=>c==='1').length,zeros=w=>[...w].filter(c=>c==='0').length;
// Independent definitions: string properties / anchored JS patterns, not the reference transition builders.
const predicates=[
 w=>w.endsWith('1'),w=>ones(w)===2,w=>ones(w)===2&&w.includes('010'),
 w=>[...w].every((c,i)=>i%2===1||c==='1'),w=>zeros(w)%2===1||ones(w)===2,
 w=>w.includes('000'),w=>w.endsWith('101'),w=>w.includes('000')&&w.endsWith('101'),
 w=>w!=='11101',w=>zeros(w)===2,w=>w.endsWith('bbb'),w=>w.length>0&&w.endsWith('0'),
 w=>w.includes('abb'),w=>/^(?:(?:aa)*bb|ab)*$/.test(w),w=>/^(?:ab)*a(?:ba)*$/.test(w),w=>/^(?:b(?:aaaaa)*bb|bab)$/.test(w),
 w=>w.startsWith('a')&&w.endsWith('c'),w=>[...w].every((c,i)=>!i||w[i-1]!==c),
 w=>['a','b','c'].every(c=>w.includes(c)),w=>[...w].filter(c=>c==='a').length%3===0
];
function* words(alphabet,max){let current=[''];yield '';for(let n=1;n<=max;n++){current=current.flatMap(w=>alphabet.map(c=>w+c));yield*current;}}
function referenceAccepts(level,word){let q=level.start;for(const c of word)q=level.next(q,c);return level.accepts(q);}
function referenceMachine(level){const states=[level.start],keys=new Map([[JSON.stringify(level.start),0]]),edges=[],nodes=[];for(let i=0;i<states.length;i++){nodes.push({id:i,accept:level.accepts(states[i])});for(const c of level.alphabet){const target=level.next(states[i],c),key=JSON.stringify(target);if(!keys.has(key)){keys.set(key,states.length);states.push(target);}edges.push({from:i,to:keys.get(key),symbol:c});}}return {mode:'DFA',alphabet:level.alphabet,start:0,nodes,edges};}
let randomSeed=0x4325;function random(){randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;return randomSeed/2**32;}
test('exactly 20 unique challenges with valid, accepted example strings',()=>{assert.equal(levels.length,20);assert.equal(new Set(levels.map(l=>l.id)).size,20);levels.forEach((l,i)=>{assert.ok([...l.example].every(c=>l.alphabet.includes(c)));assert.ok(predicates[i](l.example),l.id);});});
for(const [i,level] of levels.entries()){
 test(`${i+1}: ${level.name} — exhaustive short strings and 500 longer strings`,()=>{
  for(const word of words(level.alphabet,level.alphabet.length===3?8:10))assert.equal(referenceAccepts(level,word),predicates[i](word),`${level.id}: ${JSON.stringify(word)}`);
  for(let n=0;n<500;n++){let word='';const length=Math.floor(random()*129);for(let j=0;j<length;j++)word+=level.alphabet[Math.floor(random()*level.alphabet.length)];assert.equal(referenceAccepts(level,word),predicates[i](word),level.id+': '+word);}
 });
 test(`${i+1}: exact equivalence for DFA and branching epsilon NFA; mutations produce valid shortest witnesses`,()=>{
  const dfa=referenceMachine(level);assert.deepEqual(check(dfa,level),{equivalent:true});
  const size=dfa.nodes.length,dead=size*2;
  const nfa={mode:'NFA',alphabet:level.alphabet,start:0,nodes:[...dfa.nodes,...dfa.nodes.map(n=>({id:n.id+size,accept:false})),{id:dead,accept:false}],edges:[...dfa.nodes.flatMap(n=>[{from:n.id,to:n.id+size,symbol:'ε'},{from:n.id+size,to:n.id,symbol:'ε'}]),...dfa.edges.map(e=>({...e,from:e.from+size})),...dfa.nodes.flatMap(n=>level.alphabet.map(c=>({from:n.id,to:dead,symbol:c})))]};
  assert.deepEqual(check(nfa,level),{equivalent:true});
  for(const word of words(level.alphabet,4))assert.equal(runMachine(nfa,word),predicates[i](word));
  // Every reference state is reachable, so changing its acceptance changes the language.
  for(const node of dfa.nodes){const mutant=structuredClone(dfa);mutant.nodes[node.id].accept=!node.accept;const verdict=check(mutant,level);assert.equal(verdict.equivalent,false);assert.equal(verdict.expected,predicates[i](verdict.word));assert.equal(verdict.actual,runMachine(mutant,verdict.word));assert.notEqual(verdict.actual,verdict.expected);
   if(verdict.word.length<=7)for(const shorter of words(level.alphabet,verdict.word.length-1)){if(shorter.length<verdict.word.length)assert.equal(runMachine(mutant,shorter),predicates[i](shorter));}
  }
 });
}
const nfa=(accept,edges)=>({mode:'NFA',alphabet:['a','b'],start:0,nodes:[0,1,2,3].map(id=>({id,accept:accept.includes(id)})),edges:edges.map(([from,to,symbol])=>({from,to,symbol}))});
test('one dying branch does not kill another; all dying branches reject',()=>{const m=nfa([3],[[0,1,'a'],[0,2,'a'],[2,3,'b']]);const first=advanceStates(m,initialStates(m),'a');assert.deepEqual(first.states,[1,2]);const second=advanceStates(m,first.states,'b');assert.deepEqual(second.dead,[1]);assert.deepEqual(second.states,[3]);assert.equal(runMachine(m,'ab'),true);assert.equal(runMachine(m,'aa'),false);});
test('an accepting branch cannot ignore trailing input',()=>{const m=nfa([1],[[0,1,'a']]);assert.equal(runMachine(m,'a'),true);assert.equal(runMachine(m,'ab'),false);});
test('epsilon closure at start, after symbols, and cycles terminates',()=>{const m=nfa([3],[[0,1,'ε'],[1,0,'ε'],[1,2,'a'],[2,3,'ε'],[3,2,'ε']]);assert.deepEqual(initialStates(m),[0,1]);assert.deepEqual(advanceStates(m,[0,1],'a').states,[2,3]);assert.equal(runMachine(m,'a'),true);assert.equal(runMachine(m,''),false);m.nodes[1].accept=true;assert.equal(runMachine(m,''),true);assert.ok(closure(m,[0]).waves.length<=m.nodes.length);});
test('merged branches deduplicate states, not acceptance opportunities',()=>{const m=nfa([3],[[0,1,'a'],[0,2,'a'],[1,3,'b'],[2,3,'b']]);const next=advanceStates(m,[1,2],'b');assert.deepEqual(next.states,[3]);assert.equal(next.transitions.length,2);assert.equal(runMachine(m,'ab'),true);});
test('DFA forbids duplicate symbol and epsilon; NFA permits branching but not duplicate edges',()=>{const m=nfa([1],[[0,1,'a'],[0,2,'a']]);assert.equal(validate(m),null);assert.ok(validate({...m,mode:'DFA'}));m.edges.push({from:0,to:1,symbol:'a'});assert.ok(validate(m));const eps=nfa([1],[[0,1,'ε']]);assert.equal(validate(eps),null);assert.ok(validate({...eps,mode:'DFA'}));});
test('alphabet, endpoints, unique state ids, and start state validated',()=>{const m=nfa([1],[[0,1,'c']]);assert.ok(validate(m));m.edges=[{from:0,to:999,symbol:'a'}];assert.ok(validate(m));m.edges=[];m.start=99;assert.ok(validate(m));m.start=0;m.nodes.push({...m.nodes[0]});assert.ok(validate(m));});
test('resource limit is inconclusive and cannot claim a win',()=>{const result=check(referenceMachine(levels[0]),levels[0],{maxPairs:1});assert.equal(result.inconclusive,true);assert.equal(result.equivalent,undefined);});
test('empty-string and shortest missing-loop counterexamples',()=>{const m=referenceMachine(levels[0]);m.nodes[0].accept=true;assert.equal(check(m,levels[0]).word,'');const dfa={mode:'DFA',start:0,nodes:[{id:0,accept:false},{id:1,accept:true}],edges:[{from:0,to:0,symbol:'0'},{from:0,to:1,symbol:'1'},{from:1,to:0,symbol:'0'}]};assert.equal(check(dfa,levels[0]).word,'11');});
// Independent configuration-graph interpreter, including input position and epsilon moves.
function independentNFA(m,word){const todo=[[m.start,0]],seen=new Set();for(let i=0;i<todo.length;i++){const [q,pos]=todo[i],key=q+':'+pos;if(seen.has(key))continue;seen.add(key);if(pos===word.length&&m.nodes.find(n=>n.id===q).accept)return true;for(const e of m.edges)if(e.from===q){if(e.symbol==='ε')todo.push([e.to,pos]);else if(pos<word.length&&e.symbol===word[pos])todo.push([e.to,pos+1]);}}return false;}
test('150 generated NFAs agree with independent path exploration',()=>{for(let trial=0;trial<150;trial++){const m=nfa([0,1,2,3].filter(()=>random()<.4),[]);for(let a=0;a<4;a++)for(let b=0;b<4;b++)for(const c of ['a','b','ε'])if(random()<.12)m.edges.push({from:a,to:b,symbol:c});for(const w of words(['a','b'],5))assert.equal(runMachine(m,w),independentNFA(m,w),JSON.stringify({trial,w,m}));}});
