import {count,literal,product,regular,seq,alt,star} from './references.js';
const binary=['0','1'],ab=['a','b'],abc=['a','b','c'];
const oddZeros={start:0,next:(q,c)=>c==='0'?1-q:q,accepts:q=>q===1};
const twoOnes=count('1',2),zeroRun=literal('000',true),suffix101=literal('101');
function challenge(id,name,alphabet,rule,detail,example,reference,source='Original challenge',preferredMode='DFA'){return {id,name,alphabet,rule,detail,example,source,preferredMode,...reference};}
export const levels=[
 challenge('ends-1','Ends in 1',binary,'All binary strings that end in 1.','The empty string is rejected.','00101',literal('1')),
 challenge('two-1','Exactly two 1s',binary,'All binary strings with exactly two 1s.','Any number of 0s. Exactly two 1s.','01010',twoOnes),
 challenge('two-1-and-010','Two 1s + 010',binary,'Exactly two 1s, and the substring 010.','Both conditions must hold.','0101',product([twoOnes,literal('010',true)],a=>a.every(Boolean))),
 challenge('odd-positions','1s at odd positions',binary,'Every odd position contains 1.','Positions start at 1. The empty string qualifies.','10111',{start:0,next:(q,c)=>q===2?2:q===0?(c==='1'?1:2):0,accepts:q=>q!==2},'Practice 1 · 3(a); Practice 2 · 1(a)'),
 challenge('odd-0-or-two-1','Odd 0s OR two 1s',binary,'An odd number of 0s, or exactly two 1s.','Inclusive OR: either condition, or both.','011',product([oddZeros,twoOnes],a=>a.some(Boolean)),'Practice 1 · 3(b); Practice 2 · 1(b)','NFA'),
 challenge('contains-000','Contains 000',binary,'Contains the substring 000.','The three 0s must be consecutive.','10001',zeroRun,'Practice 1 · 3(c); Practice 2 · 1(c)','NFA'),
 challenge('ends-101','Ends in 101',binary,'Ends with the substring 101.','Earlier symbols are unrestricted.','00101',suffix101,'Practice 1 · 3(d); Practice 2 · 1(d)','NFA'),
 challenge('000-and-101','Contains 000; ends 101',binary,'Contains 000 and ends with 101.','Both conditions must hold.','000101',product([zeroRun,suffix101],a=>a.every(Boolean)),'Practice 2 · 1(e)','NFA'),
 challenge('except-11101','Everything except 11101',binary,'Every binary string except exactly 11101.','The empty string and longer extensions qualify.','111010',{start:0,next:(q,c)=>q===6?6:q===5?6:c==='11101'[q]?q+1:6,accepts:q=>q!==5},'Practice 2 · 1(f)','NFA'),
 challenge('two-0','Exactly two 0s',binary,'Contains exactly two 0s.','Interprets “has two 0s” as exactly two.','10101',count('0',2),'Practice 2 · 2(a)','NFA'),
 challenge('ends-bbb','Ends in bbb',ab,'All strings over {a,b} that end in bbb.','At least three consecutive bs at the end.','abbbb',literal('bbb'),'Practice 2 · 2(b)','NFA'),
 challenge('even-binary','Even binary numbers',binary,'Nonempty binary representations of even numbers.','Leading zeros allowed. 0 qualifies; ε does not.','1010',{start:0,next:(_,c)=>c==='0'?1:0,accepts:q=>q===1},'Practice 2 · 2(d)','NFA'),
 challenge('contains-abb','Contains abb',ab,'Contains the substring abb.','Equivalent to (a ∪ b)* abb (a ∪ b)*.','aabba',literal('abb',true),'Practice 2 · 3(a)','NFA'),
 challenge('block-repeat','Repeated aa/bb or ab blocks',ab,'Recognize (((aa)*bb) ∪ ab)*.','Each block is ab, or an even number of as followed by bb. Zero blocks allowed.','aabbab',regular(star(alt(seq(star('aa'),'bb'),'ab')),ab),'Practice 2 · 3(b)','NFA'),
 challenge('ab-a-ba','(ab)* a (ba)*',ab,'Recognize (ab)*a(ba)*.','Zero or more ab pairs, then a, then zero or more ba pairs.','ababa',regular(seq(star('ab'),'a',star('ba')),ab),'Practice 2 · 3(c)','NFA'),
 challenge('five-a','b(aaaaa)*bb OR bab',ab,'Recognize b(aaaaa)*bb ∪ bab.','Choose bab, or b followed by a multiple of five as and then bb.','baaaaabb',regular(alt(seq('b',star('aaaaa'),'bb'),'bab'),ab),'Practice 2 · 3(d)','NFA'),
 challenge('a-to-c','Starts a; ends c',abc,'Starts with a and ends with c.','Middle symbols may be a, b, or c. Minimum length 2.','abac',regular(seq('a',star(alt('a','b','c')),'c'),abc)),
 challenge('no-repeat','No adjacent repeats',abc,'No two adjacent symbols are equal.','Reject aa, bb, or cc anywhere. The empty string qualifies.','abacbc',{start:'',next:(q,c)=>q==='#'||q===c?'#':c,accepts:q=>q!=='#'}),
 challenge('all-three','Contains a, b, and c',abc,'Contains each of a, b, and c at least once.','Any order; extra occurrences are allowed.','cabac',{start:0,next:(q,c)=>q|({a:1,b:2,c:4}[c]),accepts:q=>q===7}),
 challenge('a-mod-three','Number of as divisible by 3',abc,'The number of as is a multiple of 3.','Zero as qualifies. bs and cs do not affect the count.','abaca',{start:0,next:(q,c)=>(q+Number(c==='a'))%3,accepts:q=>q===0})
];
