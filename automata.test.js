// Logic tests for the automata engine and the twenty reference machines.
//
// The reference machines are what declare each challenge correct, so they cannot be
// trusted to test themselves. Every level is therefore checked against an independently
// written predicate: a plain string property or an anchored regular expression, derived
// from the challenge wording rather than from the transition builders in references.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import {levels, check, validate, initialStates, advanceStates, runMachine, closure} from './automata.js';

const ones = word => [...word].filter(symbol => symbol === '1').length;
const zeros = word => [...word].filter(symbol => symbol === '0').length;

/** One predicate per level, in the same order as `levels`. */
const predicates = [
  word => word.endsWith('1'),                                          // ends-1
  word => ones(word) === 2,                                            // two-1
  word => ones(word) === 2 && word.includes('010'),                    // two-1-and-010
  word => [...word].every((c, i) => i % 2 === 1 || c === '1'),         // odd-positions
  word => zeros(word) % 2 === 1 || ones(word) === 2,                   // odd-0-or-two-1
  word => word.includes('000'),                                        // contains-000
  word => word.endsWith('101'),                                        // ends-101
  word => word.includes('000') && word.endsWith('101'),                // 000-and-101
  word => word !== '11101',                                            // except-11101
  word => zeros(word) === 2,                                           // two-0
  word => word.endsWith('bbb'),                                        // ends-bbb
  word => word.length > 0 && word.endsWith('0'),                       // even-binary
  word => word.includes('abb'),                                        // contains-abb
  word => /^(?:(?:aa)*bb|ab)*$/.test(word),                            // block-repeat
  word => /^(?:ab)*a(?:ba)*$/.test(word),                              // ab-a-ba
  word => /^(?:b(?:aaaaa)*bb|bab)$/.test(word),                        // five-a
  word => word.startsWith('a') && word.endsWith('c'),                  // a-to-c
  word => [...word].every((c, i) => !i || word[i - 1] !== c),          // no-repeat
  word => ['a', 'b', 'c'].every(symbol => word.includes(symbol)),      // all-three
  word => [...word].filter(symbol => symbol === 'a').length % 3 === 0  // a-mod-three
];

/** Every word over `alphabet` up to length `max`, shortest first. */
function* words(alphabet, max) {
  let current = [''];
  yield '';
  for (let length = 1; length <= max; length++) {
    current = current.flatMap(word => alphabet.map(symbol => word + symbol));
    yield* current;
  }
}

/** Runs a level's reference machine directly. */
function referenceAccepts(level, word) {
  let state = level.start;
  for (const symbol of word) state = level.next(state, symbol);
  return level.accepts(state);
}

/**
 * Explores a level's reference machine into an explicit DFA in this app's own format, so
 * it can be fed back through `check`. Only reachable states are enumerated, which is what
 * makes the mutation test below sound.
 */
function referenceMachine(level) {
  const states = [level.start];
  const indexByKey = new Map([[JSON.stringify(level.start), 0]]);
  const nodes = [];
  const edges = [];

  for (let i = 0; i < states.length; i++) {
    nodes.push({id: i, accept: level.accepts(states[i])});
    for (const symbol of level.alphabet) {
      const target = level.next(states[i], symbol);
      const key = JSON.stringify(target);
      if (!indexByKey.has(key)) {
        indexByKey.set(key, states.length);
        states.push(target);
      }
      edges.push({from: i, to: indexByKey.get(key), symbol});
    }
  }
  return {mode: 'DFA', alphabet: level.alphabet, start: 0, nodes, edges};
}

// A fixed-seed linear congruential generator, so a failing run can be reproduced exactly.
let randomSeed = 0x4325;
function random() {
  randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0;
  return randomSeed / 2 ** 32;
}

test('exactly 20 unique challenges with valid, accepted example strings', () => {
  assert.equal(levels.length, 20);
  assert.equal(new Set(levels.map(level => level.id)).size, 20);
  levels.forEach((level, i) => {
    assert.ok([...level.example].every(symbol => level.alphabet.includes(symbol)));
    assert.ok(predicates[i](level.example), level.id);
  });
});

for (const [i, level] of levels.entries()) {
  test(`${i + 1}: ${level.name} — exhaustive short strings and 500 longer strings`, () => {
    const maxLength = level.alphabet.length === 3 ? 8 : 10;
    for (const word of words(level.alphabet, maxLength)) {
      assert.equal(referenceAccepts(level, word), predicates[i](word), `${level.id}: ${JSON.stringify(word)}`);
    }
    for (let n = 0; n < 500; n++) {
      let word = '';
      const length = Math.floor(random() * 129);
      for (let j = 0; j < length; j++) word += level.alphabet[Math.floor(random() * level.alphabet.length)];
      assert.equal(referenceAccepts(level, word), predicates[i](word), level.id + ': ' + word);
    }
  });

  test(`${i + 1}: exact equivalence for DFA and branching epsilon NFA; mutations produce valid shortest witnesses`, () => {
    const dfa = referenceMachine(level);
    assert.deepEqual(check(dfa, level), {equivalent: true});

    // The same language rebuilt as an awkward NFA: every state gets an ε-linked twin that
    // carries the real transitions, plus an arrow on every symbol into a dead sink. Both
    // the branching and the dying branches must leave the language unchanged.
    const size = dfa.nodes.length;
    const dead = size * 2;
    const branchingNfa = {
      mode: 'NFA',
      alphabet: level.alphabet,
      start: 0,
      nodes: [
        ...dfa.nodes,
        ...dfa.nodes.map(node => ({id: node.id + size, accept: false})),
        {id: dead, accept: false}
      ],
      edges: [
        ...dfa.nodes.flatMap(node => [
          {from: node.id, to: node.id + size, symbol: 'ε'},
          {from: node.id + size, to: node.id, symbol: 'ε'}
        ]),
        ...dfa.edges.map(edge => ({...edge, from: edge.from + size})),
        ...dfa.nodes.flatMap(node => level.alphabet.map(symbol => ({from: node.id, to: dead, symbol})))
      ]
    };
    assert.deepEqual(check(branchingNfa, level), {equivalent: true});
    for (const word of words(level.alphabet, 4)) {
      assert.equal(runMachine(branchingNfa, word), predicates[i](word));
    }

    // Every reference state is reachable, so flipping its acceptance must change the
    // language — and the witness `check` returns must really be the shortest such word.
    for (const node of dfa.nodes) {
      const mutant = structuredClone(dfa);
      mutant.nodes[node.id].accept = !node.accept;
      const verdict = check(mutant, level);
      assert.equal(verdict.equivalent, false);
      assert.equal(verdict.expected, predicates[i](verdict.word));
      assert.equal(verdict.actual, runMachine(mutant, verdict.word));
      assert.notEqual(verdict.actual, verdict.expected);

      if (verdict.word.length > 7) continue;  // exhaustive search below would be too slow
      for (const shorter of words(level.alphabet, verdict.word.length - 1)) {
        if (shorter.length < verdict.word.length) {
          assert.equal(runMachine(mutant, shorter), predicates[i](shorter));
        }
      }
    }
  });
}

/** A four-state NFA over {a,b}; `edges` are [from, to, symbol] triples. */
const nfa = (accepting, edges) => ({
  mode: 'NFA',
  alphabet: ['a', 'b'],
  start: 0,
  nodes: [0, 1, 2, 3].map(id => ({id, accept: accepting.includes(id)})),
  edges: edges.map(([from, to, symbol]) => ({from, to, symbol}))
});

test('one dying branch does not kill another; all dying branches reject', () => {
  const machine = nfa([3], [[0, 1, 'a'], [0, 2, 'a'], [2, 3, 'b']]);
  const first = advanceStates(machine, initialStates(machine), 'a');
  assert.deepEqual(first.states, [1, 2]);
  const second = advanceStates(machine, first.states, 'b');
  assert.deepEqual(second.dead, [1]);
  assert.deepEqual(second.states, [3]);
  assert.equal(runMachine(machine, 'ab'), true);
  assert.equal(runMachine(machine, 'aa'), false);
});

test('an accepting branch cannot ignore trailing input', () => {
  const machine = nfa([1], [[0, 1, 'a']]);
  assert.equal(runMachine(machine, 'a'), true);
  assert.equal(runMachine(machine, 'ab'), false);
});

test('epsilon closure at start, after symbols, and cycles terminates', () => {
  const machine = nfa([3], [[0, 1, 'ε'], [1, 0, 'ε'], [1, 2, 'a'], [2, 3, 'ε'], [3, 2, 'ε']]);
  assert.deepEqual(initialStates(machine), [0, 1]);
  assert.deepEqual(advanceStates(machine, [0, 1], 'a').states, [2, 3]);
  assert.equal(runMachine(machine, 'a'), true);
  assert.equal(runMachine(machine, ''), false);
  machine.nodes[1].accept = true;
  assert.equal(runMachine(machine, ''), true);
  assert.ok(closure(machine, [0]).waves.length <= machine.nodes.length);
});

test('merged branches deduplicate states, not acceptance opportunities', () => {
  const machine = nfa([3], [[0, 1, 'a'], [0, 2, 'a'], [1, 3, 'b'], [2, 3, 'b']]);
  const next = advanceStates(machine, [1, 2], 'b');
  assert.deepEqual(next.states, [3]);
  assert.equal(next.transitions.length, 2);
  assert.equal(runMachine(machine, 'ab'), true);
});

test('DFA forbids duplicate symbol and epsilon; NFA permits branching but not duplicate edges', () => {
  const machine = nfa([1], [[0, 1, 'a'], [0, 2, 'a']]);
  assert.equal(validate(machine), null);
  assert.ok(validate({...machine, mode: 'DFA'}));
  machine.edges.push({from: 0, to: 1, symbol: 'a'});
  assert.ok(validate(machine));

  const epsilon = nfa([1], [[0, 1, 'ε']]);
  assert.equal(validate(epsilon), null);
  assert.ok(validate({...epsilon, mode: 'DFA'}));
});

test('alphabet, endpoints, unique state ids, and start state validated', () => {
  const machine = nfa([1], [[0, 1, 'c']]);
  assert.ok(validate(machine));                     // symbol outside the alphabet
  machine.edges = [{from: 0, to: 999, symbol: 'a'}];
  assert.ok(validate(machine));                     // edge to a state that does not exist
  machine.edges = [];
  machine.start = 99;
  assert.ok(validate(machine));                     // start state does not exist
  machine.start = 0;
  machine.nodes.push({...machine.nodes[0]});
  assert.ok(validate(machine));                     // duplicate state id
});

test('resource limit is inconclusive and cannot claim a win', () => {
  const result = check(referenceMachine(levels[0]), levels[0], {maxPairs: 1});
  assert.equal(result.inconclusive, true);
  assert.equal(result.equivalent, undefined);
});

test('empty-string and shortest missing-loop counterexamples', () => {
  const machine = referenceMachine(levels[0]);
  machine.nodes[0].accept = true;
  assert.equal(check(machine, levels[0]).word, '');

  const dfa = {
    mode: 'DFA',
    start: 0,
    nodes: [{id: 0, accept: false}, {id: 1, accept: true}],
    edges: [{from: 0, to: 0, symbol: '0'}, {from: 0, to: 1, symbol: '1'}, {from: 1, to: 0, symbol: '0'}]
  };
  assert.equal(check(dfa, levels[0]).word, '11');
});

/**
 * An independent NFA interpreter: a search over (state, input position) configurations,
 * with no subset construction and no shared code with advanceStates.
 */
function independentNFA(machine, word) {
  const pending = [[machine.start, 0]];
  const seen = new Set();
  for (let i = 0; i < pending.length; i++) {
    const [state, position] = pending[i];
    const key = state + ':' + position;
    if (seen.has(key)) continue;
    seen.add(key);
    if (position === word.length && machine.nodes.find(node => node.id === state).accept) return true;
    for (const edge of machine.edges) {
      if (edge.from !== state) continue;
      if (edge.symbol === 'ε') pending.push([edge.to, position]);
      else if (position < word.length && edge.symbol === word[position]) pending.push([edge.to, position + 1]);
    }
  }
  return false;
}

test('150 generated NFAs agree with independent path exploration', () => {
  for (let trial = 0; trial < 150; trial++) {
    const machine = nfa([0, 1, 2, 3].filter(() => random() < 0.4), []);
    for (let from = 0; from < 4; from++) {
      for (let to = 0; to < 4; to++) {
        for (const symbol of ['a', 'b', 'ε']) {
          if (random() < 0.12) machine.edges.push({from, to, symbol});
        }
      }
    }
    for (const word of words(['a', 'b'], 5)) {
      assert.equal(runMachine(machine, word), independentNFA(machine, word), JSON.stringify({trial, word, machine}));
    }
  }
});
