export {levels} from './challenges.js';
export const EPSILON='ε';
const ordered=states=>[...new Set(states)].sort((a,b)=>a-b);
export function validate(machine,alphabet=machine.alphabet||['0','1'],mode=machine.mode||'DFA') {
 if(!['DFA','NFA'].includes(mode))return 'Choose DFA or NFA mode.';
 if(!machine.nodes.length)return 'Place a state to get started.';
 const ids=new Set(machine.nodes.map(n=>n.id));
 if(ids.size!==machine.nodes.length)return 'State identifiers must be unique.';
 if(!ids.has(machine.start))return 'Choose a starting state.';
 const seen=new Set();
 for(const e of machine.edges){
  if(!ids.has(e.from)||!ids.has(e.to)||(!alphabet.includes(e.symbol)&&!(mode==='NFA'&&e.symbol===EPSILON)))return 'A transition uses an invalid state or symbol for this mode and alphabet.';
  const key=mode==='DFA'?JSON.stringify([e.from,e.symbol]):JSON.stringify([e.from,e.symbol,e.to]);
  if(seen.has(key))return mode==='DFA'?'A DFA can only have one outgoing arrow per symbol from each state.':'This transition already exists.';
  seen.add(key);
 }
 return null;
}
export function closure(machine,seeds){
 const active=new Set(seeds),waves=[];let frontier=[...active];
 if(machine.mode!=='NFA')return {states:ordered(active),waves};
 while(frontier.length){const indices=[],next=[];
  machine.edges.forEach((e,i)=>{if(e.symbol===EPSILON&&frontier.includes(e.from)){indices.push(i);if(!active.has(e.to)){active.add(e.to);next.push(e.to);}}});
  if(indices.length)waves.push(indices);frontier=next;
 }
 return {states:ordered(active),waves};
}
export function initialStates(machine){return closure(machine,[machine.start]).states;}
export function advanceStates(machine,states,symbol){
 const current=closure(machine,states).states,transitions=[],destinations=[],outgoing=new Set();
 machine.edges.forEach((e,i)=>{if(e.symbol===symbol&&current.includes(e.from)){transitions.push(i);destinations.push(e.to);outgoing.add(e.from);}});
 const after=closure(machine,destinations);
 return {states:after.states,transitions,epsilonWaves:after.waves,destinations:ordered(destinations),dead:current.filter(id=>!outgoing.has(id))};
}
export function accepts(machine,states){const active=Array.isArray(states)?states:[states];return machine.nodes.some(n=>n.accept&&active.includes(n.id));}
export function step(machine,state,symbol){return machine.edges.find(e=>e.from===state&&e.symbol===symbol)?.to??null;}
export function runMachine(machine,word){let active=initialStates(machine);for(const c of word)active=advanceStates(machine,active,c).states;return accepts(machine,active);}
// Search the product of the reachable NFA subsets and the reference DFA.
// Predecessor links recover a shortest counterexample without storing every prefix.
export function check(machine,level,{maxPairs=25000}={}) {
 const error=validate(machine,level.alphabet);if(error)return {error};
 const first={user:initialStates(machine),target:level.start,parent:-1,symbol:''};
 const queue=[first],key=q=>JSON.stringify([q.user,q.target]),visited=new Set([key(first)]);
 function wordAt(i){const word=[];while(queue[i].parent!==-1){word.push(queue[i].symbol);i=queue[i].parent;}return word.reverse().join('');}
 for(let i=0;i<queue.length;i++){
  const {user,target}=queue[i],actual=accepts(machine,user),expected=level.accepts(target);
  if(actual!==expected)return {equivalent:false,word:wordAt(i),actual,expected};
  for(const symbol of level.alphabet){const next={user:advanceStates(machine,user,symbol).states,target:level.next(target,symbol),parent:i,symbol};const k=key(next);if(visited.has(k))continue;
   if(queue.length>=maxPairs)return {inconclusive:true,error:'Check limit reached. No correctness verdict was made. Simplify the machine and try again.'};
   visited.add(k);queue.push(next);
  }
 }
 return {equivalent:true};
}
