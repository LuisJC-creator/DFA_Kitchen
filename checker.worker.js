import {check,levels} from './automata.js';
self.onmessage=({data})=>{try{self.postMessage(check(data.machine,levels[data.levelIndex]));}catch{self.postMessage({error:'The checker could not finish. No correctness verdict was made.'});}};
