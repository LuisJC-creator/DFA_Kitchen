// Execution and validation for the machines the editor builds.
//
// A machine is a plain object {mode, alphabet, start, nodes, edges}, where a node is
// {id, accept} (plus editor-only x/y) and an edge is {from, to, symbol}. DFA and NFA
// share one representation: a DFA is simply an NFA that validation keeps deterministic
// and ε-free, so the same execution path serves both.
//
// Every function here is pure. Nothing touches the DOM or module state.

export {levels} from './challenges.js';

/** Label for a transition that consumes no input. NFA mode only. */
export const EPSILON = 'ε';

/** State lists are deduplicated and sorted so they compare and serialise consistently. */
const ordered = states => [...new Set(states)].sort((a, b) => a - b);

/**
 * Returns a message explaining why the machine cannot run, or null when it is well formed.
 * The messages are shown to the user, so they name the offending rule rather than the code.
 */
export function validate(machine, alphabet = machine.alphabet || ['0', '1'], mode = machine.mode || 'DFA') {
  if (!['DFA', 'NFA'].includes(mode)) return 'Choose DFA or NFA mode.';
  if (!machine.nodes.length) return 'Place a state to get started.';

  const ids = new Set(machine.nodes.map(node => node.id));
  if (ids.size !== machine.nodes.length) return 'State identifiers must be unique.';
  if (!ids.has(machine.start)) return 'Choose a starting state.';

  // A DFA allows one edge per (source, symbol). An NFA may branch, so only an exact
  // duplicate of (source, symbol, destination) is a conflict.
  const seen = new Set();
  for (const edge of machine.edges) {
    const knownSymbol = alphabet.includes(edge.symbol) || (mode === 'NFA' && edge.symbol === EPSILON);
    if (!ids.has(edge.from) || !ids.has(edge.to) || !knownSymbol) {
      return 'A transition uses an invalid state or symbol for this mode and alphabet.';
    }
    const key = mode === 'DFA'
      ? JSON.stringify([edge.from, edge.symbol])
      : JSON.stringify([edge.from, edge.symbol, edge.to]);
    if (seen.has(key)) {
      return mode === 'DFA'
        ? 'A DFA can only have one outgoing arrow per symbol from each state.'
        : 'This transition already exists.';
    }
    seen.add(key);
  }
  return null;
}

/**
 * Expands `seeds` along ε-transitions until no new state is reachable.
 *
 * `waves` groups the edge indices crossed on each round so playback can animate one hop
 * at a time; revisited states end a branch, which is what makes ε-cycles terminate.
 * A DFA has no ε-transitions, so its seeds stand alone.
 */
export function closure(machine, seeds) {
  const active = new Set(seeds);
  const waves = [];
  if (machine.mode !== 'NFA') return {states: ordered(active), waves};

  let frontier = [...active];
  while (frontier.length) {
    const wave = [];
    const discovered = [];
    machine.edges.forEach((edge, index) => {
      if (edge.symbol !== EPSILON || !frontier.includes(edge.from)) return;
      wave.push(index);
      if (active.has(edge.to)) return;
      active.add(edge.to);
      discovered.push(edge.to);
    });
    if (wave.length) waves.push(wave);
    frontier = discovered;
  }
  return {states: ordered(active), waves};
}

/** The states the machine occupies before reading any input. */
export function initialStates(machine) {
  return closure(machine, [machine.start]).states;
}

/**
 * Reads one symbol from `states`.
 *
 * Returns the resulting states along with everything playback needs to narrate the step:
 * which edges fired, which ε-waves followed them, where those edges landed before the
 * closure, and which branches died because their state had no matching outgoing edge.
 */
export function advanceStates(machine, states, symbol) {
  const current = closure(machine, states).states;
  const transitions = [];
  const destinations = [];
  const departed = new Set();

  machine.edges.forEach((edge, index) => {
    if (edge.symbol !== symbol || !current.includes(edge.from)) return;
    transitions.push(index);
    destinations.push(edge.to);
    departed.add(edge.from);
  });

  const settled = closure(machine, destinations);
  return {
    states: settled.states,
    transitions,
    epsilonWaves: settled.waves,
    destinations: ordered(destinations),
    dead: current.filter(id => !departed.has(id))
  };
}

/** True when any of the given states is accepting. Accepts one state or a list. */
export function accepts(machine, states) {
  const active = Array.isArray(states) ? states : [states];
  return machine.nodes.some(node => node.accept && active.includes(node.id));
}

/** The single DFA successor of `state` on `symbol`, or null when there is none. */
export function step(machine, state, symbol) {
  return machine.edges.find(edge => edge.from === state && edge.symbol === symbol)?.to ?? null;
}

/** Runs `word` to completion and reports whether the machine accepts it. */
export function runMachine(machine, word) {
  let active = initialStates(machine);
  for (const symbol of word) active = advanceStates(machine, active, symbol).states;
  return accepts(machine, active);
}

/**
 * Decides whether the machine recognises exactly the challenge's language.
 *
 * Breadth-first search over the product of the reachable subsets of the user's machine
 * and the challenge's reference DFA. Because the search is breadth-first, the first pair
 * whose acceptance disagrees yields the shortest counterexample; parent links rebuild that
 * word without storing a prefix on every pair.
 *
 * Pair count is capped: hitting the cap returns `inconclusive` rather than a verdict, so a
 * machine is never declared correct on an unfinished search.
 */
export function check(machine, level, {maxPairs = 25000} = {}) {
  const error = validate(machine, level.alphabet);
  if (error) return {error};

  const keyOf = pair => JSON.stringify([pair.user, pair.target]);
  const root = {user: initialStates(machine), target: level.start, parent: -1, symbol: ''};
  const queue = [root];
  const visited = new Set([keyOf(root)]);

  /** Walks parent links back to the root to rebuild the word that reached `index`. */
  const wordAt = index => {
    const symbols = [];
    for (let i = index; queue[i].parent !== -1; i = queue[i].parent) symbols.push(queue[i].symbol);
    return symbols.reverse().join('');
  };

  for (let i = 0; i < queue.length; i++) {
    const {user, target} = queue[i];
    const actual = accepts(machine, user);
    const expected = level.accepts(target);
    if (actual !== expected) return {equivalent: false, word: wordAt(i), actual, expected};

    for (const symbol of level.alphabet) {
      const next = {
        user: advanceStates(machine, user, symbol).states,
        target: level.next(target, symbol),
        parent: i,
        symbol
      };
      const key = keyOf(next);
      if (visited.has(key)) continue;
      if (queue.length >= maxPairs) {
        return {
          inconclusive: true,
          error: 'Check limit reached. No correctness verdict was made. Simplify the machine and try again.'
        };
      }
      visited.add(key);
      queue.push(next);
    }
  }
  return {equivalent: true};
}
