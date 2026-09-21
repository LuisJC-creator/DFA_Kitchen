// Finite reference machines used by the exact language checker.
export const count=(symbol,n)=>({start:0,next:(q,c)=>Math.min(n+1,q+Number(c===symbol)),accepts:q=>q===n});
export function literal(pattern,contains=false){
 return {start:0,next:(q,c)=>{if(contains&&q===pattern.length)return q;const s=pattern.slice(0,q)+c;for(let i=pattern.length;i>=0;i--)if(s.endsWith(pattern.slice(0,i)))return i;},accepts:q=>q===pattern.length};
}
export function product(parts,accept){return {start:JSON.stringify(parts.map(p=>p.start)),next:(q,c)=>JSON.stringify(JSON.parse(q).map((v,i)=>parts[i].next(v,c))),accepts:q=>accept(JSON.parse(q).map((v,i)=>parts[i].accepts(v)))};}
export const seq=(...parts)=>({kind:'seq',parts});
export const alt=(...parts)=>({kind:'alt',parts});
export const star=part=>({kind:'star',part});
// Thompson construction followed by subset construction; only an explicit AST is accepted.
export function regular(ast,alphabet){
 let id=0;const edges=[];const add=(a,b,c=null)=>edges.push({a,b,c});
 function compile(expr){const s=id++,t=id++;
  if(typeof expr==='string'){let a=s;for(let i=0;i<expr.length;i++){const b=i===expr.length-1?t:id++;add(a,b,expr[i]);a=b;}if(!expr.length)add(s,t);}
  else if(expr.kind==='seq'){let a=s;for(const part of expr.parts){const [b,c]=compile(part);add(a,b);a=c;}add(a,t);}
  else if(expr.kind==='alt'){for(const part of expr.parts){const [a,b]=compile(part);add(s,a);add(b,t);}}
  else {const [a,b]=compile(expr.part);add(s,t);add(s,a);add(b,a);add(b,t);}
  return [s,t];
 }
 const [start,end]=compile(ast);
 function closure(states){const found=new Set(states),todo=[...states];for(let i=0;i<todo.length;i++)for(const e of edges)if(e.a===todo[i]&&e.c===null&&!found.has(e.b)){found.add(e.b);todo.push(e.b);}return [...found].sort((a,b)=>a-b);}
 const initial=closure([start]),sets=[initial],map=new Map([[initial.join(','),0]]),table=[],accepting=[];
 for(let i=0;i<sets.length;i++){table[i]={};accepting[i]=sets[i].includes(end);for(const c of alphabet){const next=closure(edges.filter(e=>e.c===c&&sets[i].includes(e.a)).map(e=>e.b)),key=next.join(',');if(!map.has(key)){map.set(key,sets.length);sets.push(next);}table[i][c]=map.get(key);}}
 return {start:0,next:(q,c)=>table[q][c],accepts:q=>accepting[q]};
}
