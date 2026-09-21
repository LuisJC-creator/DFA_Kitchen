// The twenty challenges, each paired with a reference machine that defines its language
// exactly. `check` in automata.js compares the user's machine against that reference, so a
// reference must recognise the rule as written — not merely agree on the example string.

import {count, literal, product, regular, seq, alt, star} from './references.js';

const BINARY = ['0', '1'];
const AB = ['a', 'b'];
const ABC = ['a', 'b', 'c'];

// Reference machines shared by more than one challenge.
const oddZeros = {
  start: 0,
  next: (parity, read) => (read === '0' ? 1 - parity : parity),
  accepts: parity => parity === 1
};
const twoOnes = count('1', 2);
const containsZeroRun = literal('000', true);
const endsIn101 = literal('101');

// 1-indexed positions: every odd position must hold a 1, even positions are unrestricted.
// State 0 = the next symbol sits at an odd position, 1 = at an even position, 2 = rejected.
const onesAtOddPositions = {
  start: 0,
  next: (position, read) => {
    if (position === 2) return 2;
    if (position === 0) return read === '1' ? 1 : 2;
    return 0;
  },
  accepts: position => position !== 2
};

// Everything except the single string 11101. State q below FORBIDDEN.length means the input
// so far is exactly the first q symbols of it; the extra state means the input has already
// diverged, which is the accepting outcome.
const FORBIDDEN = '11101';
const DIVERGED = FORBIDDEN.length + 1;
const allBut11101 = {
  start: 0,
  next: (matched, read) => {
    if (matched >= FORBIDDEN.length) return DIVERGED;
    return read === FORBIDDEN[matched] ? matched + 1 : DIVERGED;
  },
  accepts: matched => matched !== FORBIDDEN.length
};

// A nonempty binary numeral is even exactly when its last digit is 0.
const endsInZero = {start: 0, next: (_state, read) => (read === '0' ? 1 : 0), accepts: state => state === 1};

// The state is the previous symbol ('' before the first one); '#' is the rejecting sink.
const REPEATED = '#';
const noAdjacentRepeats = {
  start: '',
  next: (previous, read) => (previous === REPEATED || previous === read ? REPEATED : read),
  accepts: previous => previous !== REPEATED
};

// A bitmask of which symbols have been seen.
const SYMBOL_BIT = {a: 0b001, b: 0b010, c: 0b100};
const ALL_SYMBOLS = 0b111;
const containsEachOfABC = {
  start: 0,
  next: (seen, read) => seen | SYMBOL_BIT[read],
  accepts: seen => seen === ALL_SYMBOLS
};

const aCountDivisibleByThree = {
  start: 0,
  next: (remainder, read) => (remainder + Number(read === 'a')) % 3,
  accepts: remainder => remainder === 0
};

/**
 * Flattens a challenge definition: the reference machine's {start, next, accepts} are
 * spread onto the level itself, which is the shape `check` and the UI both consume.
 */
function challenge({
  id, name, alphabet, rule, detail, example, reference,
  source = 'Original challenge',
  preferredMode = 'DFA'
}) {
  return {id, name, alphabet, rule, detail, example, source, preferredMode, ...reference};
}

export const levels = [
  challenge({
    id: 'ends-1',
    name: 'Ends in 1',
    alphabet: BINARY,
    rule: 'All binary strings that end in 1.',
    detail: 'The empty string is rejected.',
    example: '00101',
    reference: literal('1')
  }),
  challenge({
    id: 'two-1',
    name: 'Exactly two 1s',
    alphabet: BINARY,
    rule: 'All binary strings with exactly two 1s.',
    detail: 'Any number of 0s. Exactly two 1s.',
    example: '01010',
    reference: twoOnes
  }),
  challenge({
    id: 'two-1-and-010',
    name: 'Two 1s + 010',
    alphabet: BINARY,
    rule: 'Exactly two 1s, and the substring 010.',
    detail: 'Both conditions must hold.',
    example: '0101',
    reference: product([twoOnes, literal('010', true)], parts => parts.every(Boolean))
  }),
  challenge({
    id: 'odd-positions',
    name: '1s at odd positions',
    alphabet: BINARY,
    rule: 'Every odd position contains 1.',
    detail: 'Positions start at 1. The empty string qualifies.',
    example: '10111',
    reference: onesAtOddPositions,
    source: 'Practice 1 · 3(a); Practice 2 · 1(a)'
  }),
  challenge({
    id: 'odd-0-or-two-1',
    name: 'Odd 0s OR two 1s',
    alphabet: BINARY,
    rule: 'An odd number of 0s, or exactly two 1s.',
    detail: 'Inclusive OR: either condition, or both.',
    example: '011',
    reference: product([oddZeros, twoOnes], parts => parts.some(Boolean)),
    source: 'Practice 1 · 3(b); Practice 2 · 1(b)',
    preferredMode: 'NFA'
  }),
  challenge({
    id: 'contains-000',
    name: 'Contains 000',
    alphabet: BINARY,
    rule: 'Contains the substring 000.',
    detail: 'The three 0s must be consecutive.',
    example: '10001',
    reference: containsZeroRun,
    source: 'Practice 1 · 3(c); Practice 2 · 1(c)',
    preferredMode: 'NFA'
  }),
  challenge({
    id: 'ends-101',
    name: 'Ends in 101',
    alphabet: BINARY,
    rule: 'Ends with the substring 101.',
    detail: 'Earlier symbols are unrestricted.',
    example: '00101',
    reference: endsIn101,
    source: 'Practice 1 · 3(d); Practice 2 · 1(d)',
    preferredMode: 'NFA'
  }),
  challenge({
    id: '000-and-101',
    name: 'Contains 000; ends 101',
    alphabet: BINARY,
    rule: 'Contains 000 and ends with 101.',
    detail: 'Both conditions must hold.',
    example: '000101',
    reference: product([containsZeroRun, endsIn101], parts => parts.every(Boolean)),
    source: 'Practice 2 · 1(e)',
    preferredMode: 'NFA'
  }),
  challenge({
    id: 'except-11101',
    name: 'Everything except 11101',
    alphabet: BINARY,
    rule: 'Every binary string except exactly 11101.',
    detail: 'The empty string and longer extensions qualify.',
    example: '111010',
    reference: allBut11101,
    source: 'Practice 2 · 1(f)',
    preferredMode: 'NFA'
  }),
  challenge({
    id: 'two-0',
    name: 'Exactly two 0s',
    alphabet: BINARY,
    rule: 'Contains exactly two 0s.',
    detail: 'Interprets “has two 0s” as exactly two.',
    example: '10101',
    reference: count('0', 2),
    source: 'Practice 2 · 2(a)',
    preferredMode: 'NFA'
  }),
  challenge({
    id: 'ends-bbb',
    name: 'Ends in bbb',
    alphabet: AB,
    rule: 'All strings over {a,b} that end in bbb.',
    detail: 'At least three consecutive bs at the end.',
    example: 'abbbb',
    reference: literal('bbb'),
    source: 'Practice 2 · 2(b)',
    preferredMode: 'NFA'
  }),
  challenge({
    id: 'even-binary',
    name: 'Even binary numbers',
    alphabet: BINARY,
    rule: 'Nonempty binary representations of even numbers.',
    detail: 'Leading zeros allowed. 0 qualifies; ε does not.',
    example: '1010',
    reference: endsInZero,
    source: 'Practice 2 · 2(d)',
    preferredMode: 'NFA'
  }),
  challenge({
    id: 'contains-abb',
    name: 'Contains abb',
    alphabet: AB,
    rule: 'Contains the substring abb.',
    detail: 'Equivalent to (a ∪ b)* abb (a ∪ b)*.',
    example: 'aabba',
    reference: literal('abb', true),
    source: 'Practice 2 · 3(a)',
    preferredMode: 'NFA'
  }),
  challenge({
    id: 'block-repeat',
    name: 'Repeated aa/bb or ab blocks',
    alphabet: AB,
    rule: 'Recognize (((aa)*bb) ∪ ab)*.',
    detail: 'Each block is ab, or an even number of as followed by bb. Zero blocks allowed.',
    example: 'aabbab',
    reference: regular(star(alt(seq(star('aa'), 'bb'), 'ab')), AB),
    source: 'Practice 2 · 3(b)',
    preferredMode: 'NFA'
  }),
  challenge({
    id: 'ab-a-ba',
    name: '(ab)* a (ba)*',
    alphabet: AB,
    rule: 'Recognize (ab)*a(ba)*.',
    detail: 'Zero or more ab pairs, then a, then zero or more ba pairs.',
    example: 'ababa',
    reference: regular(seq(star('ab'), 'a', star('ba')), AB),
    source: 'Practice 2 · 3(c)',
    preferredMode: 'NFA'
  }),
  challenge({
    id: 'five-a',
    name: 'b(aaaaa)*bb OR bab',
    alphabet: AB,
    rule: 'Recognize b(aaaaa)*bb ∪ bab.',
    detail: 'Choose bab, or b followed by a multiple of five as and then bb.',
    example: 'baaaaabb',
    reference: regular(alt(seq('b', star('aaaaa'), 'bb'), 'bab'), AB),
    source: 'Practice 2 · 3(d)',
    preferredMode: 'NFA'
  }),
  challenge({
    id: 'a-to-c',
    name: 'Starts a; ends c',
    alphabet: ABC,
    rule: 'Starts with a and ends with c.',
    detail: 'Middle symbols may be a, b, or c. Minimum length 2.',
    example: 'abac',
    reference: regular(seq('a', star(alt('a', 'b', 'c')), 'c'), ABC)
  }),
  challenge({
    id: 'no-repeat',
    name: 'No adjacent repeats',
    alphabet: ABC,
    rule: 'No two adjacent symbols are equal.',
    detail: 'Reject aa, bb, or cc anywhere. The empty string qualifies.',
    example: 'abacbc',
    reference: noAdjacentRepeats
  }),
  challenge({
    id: 'all-three',
    name: 'Contains a, b, and c',
    alphabet: ABC,
    rule: 'Contains each of a, b, and c at least once.',
    detail: 'Any order; extra occurrences are allowed.',
    example: 'cabac',
    reference: containsEachOfABC
  }),
  challenge({
    id: 'a-mod-three',
    name: 'Number of as divisible by 3',
    alphabet: ABC,
    rule: 'The number of as is a multiple of 3.',
    detail: 'Zero as qualifies. bs and cs do not affect the count.',
    example: 'abaca',
    reference: aCountDivisibleByThree
  })
];
