// Finite reference machines used by the exact language checker.
//
// Each builder returns {start, next(state, symbol), accepts(state)}: a deterministic
// machine over an opaque state value. `check` in automata.js walks one of these in
// lockstep with the user's machine and only ever compares states with ===, so composite
// states are encoded as strings to make that comparison behave by value.

/** Accepts exactly `n` occurrences of `symbol`. The count saturates one past `n`. */
export const count = (symbol, n) => ({
  start: 0,
  next: (seen, read) => Math.min(n + 1, seen + Number(read === symbol)),
  accepts: seen => seen === n
});

/**
 * Accepts strings ending with `pattern`, or containing it when `contains` is set.
 *
 * The state is how much of `pattern` currently matches: state q means the symbols read so
 * far end with `pattern.slice(0, q)`, and that q is the longest such prefix. Backing off to
 * the longest still-valid prefix is what lets overlapping matches work — after `10` of
 * `101`, reading `1` restarts at q = 1 rather than failing. With `contains`, a full match
 * is absorbing, so later symbols cannot undo it.
 */
export function literal(pattern, contains = false) {
  const full = pattern.length;
  return {
    start: 0,
    next(matched, read) {
      if (contains && matched === full) return matched;
      const tail = pattern.slice(0, matched) + read;
      for (let length = full; length >= 0; length--) {
        if (tail.endsWith(pattern.slice(0, length))) return length;
      }
    },
    accepts: matched => matched === full
  };
}

/**
 * Runs `parts` in lockstep and combines their verdicts with `accept`, which receives one
 * boolean per part. The combined state is the JSON of the parts' states.
 */
export function product(parts, accept) {
  const encode = states => JSON.stringify(states);
  const decode = state => JSON.parse(state);
  return {
    start: encode(parts.map(part => part.start)),
    next: (state, read) => encode(decode(state).map((partState, i) => parts[i].next(partState, read))),
    accepts: state => accept(decode(state).map((partState, i) => parts[i].accepts(partState)))
  };
}

// Regular-expression AST nodes for `regular`. A bare string is a literal run of symbols,
// and the empty string is ε.
export const seq = (...parts) => ({kind: 'seq', parts});
export const alt = (...parts) => ({kind: 'alt', parts});
export const star = part => ({kind: 'star', part});

/**
 * Builds a reference machine for a regular expression, given as an explicit AST: Thompson
 * construction to an ε-NFA, then subset construction to a transition table. Only an AST is
 * accepted, never regex source, so there is no pattern syntax to get subtly wrong.
 */
export function regular(ast, alphabet) {
  const {edges, start, end} = thompson(ast);
  return subsetConstruction(edges, start, end, alphabet);
}

/**
 * Thompson construction. Every sub-expression becomes a fragment with exactly one entry
 * and one exit state, which is what lets the cases below wire fragments together without
 * inspecting their insides. Edges are {from, to, symbol}, where a null symbol means ε.
 */
function thompson(ast) {
  let nextId = 0;
  const edges = [];
  const connect = (from, to, symbol = null) => edges.push({from, to, symbol});

  /** Compiles one expression into a fragment and returns its [entry, exit] states. */
  function compile(expr) {
    const entry = nextId++;
    const exit = nextId++;

    if (typeof expr === 'string') {
      // One edge per symbol, chained; the empty string is a bare ε edge.
      if (!expr.length) {
        connect(entry, exit);
        return [entry, exit];
      }
      let from = entry;
      for (let i = 0; i < expr.length; i++) {
        const to = i === expr.length - 1 ? exit : nextId++;
        connect(from, to, expr[i]);
        from = to;
      }
      return [entry, exit];
    }

    if (expr.kind === 'seq') {
      // Thread the fragments end to end, then out to the exit.
      let from = entry;
      for (const part of expr.parts) {
        const [partEntry, partExit] = compile(part);
        connect(from, partEntry);
        from = partExit;
      }
      connect(from, exit);
      return [entry, exit];
    }

    if (expr.kind === 'alt') {
      // Fan out to every branch and back in again.
      for (const part of expr.parts) {
        const [partEntry, partExit] = compile(part);
        connect(entry, partEntry);
        connect(partExit, exit);
      }
      return [entry, exit];
    }

    if (expr.kind === 'star') {
      const [partEntry, partExit] = compile(expr.part);
      connect(entry, exit);           // skip the body entirely
      connect(entry, partEntry);      // enter it
      connect(partExit, partEntry);   // go round again
      connect(partExit, exit);        // leave
      return [entry, exit];
    }

    throw new Error(`Unsupported expression node: ${JSON.stringify(expr)}`);
  }

  const [start, end] = compile(ast);
  return {edges, start, end};
}

/**
 * Subset construction: each state of the resulting machine is a set of ε-NFA states, so
 * the nondeterminism is resolved up front and `next` is a plain table lookup.
 */
function subsetConstruction(edges, start, end, alphabet) {
  /** Every state reachable from `states` without consuming input. */
  const closure = states => {
    const found = new Set(states);
    const pending = [...states];
    for (let i = 0; i < pending.length; i++) {
      for (const edge of edges) {
        if (edge.from !== pending[i] || edge.symbol !== null || found.has(edge.to)) continue;
        found.add(edge.to);
        pending.push(edge.to);
      }
    }
    return [...found].sort((a, b) => a - b);
  };

  const initial = closure([start]);
  const subsets = [initial];
  const indexByKey = new Map([[initial.join(','), 0]]);
  const transitions = [];
  const accepting = [];

  // Newly discovered subsets are appended as the loop runs, so it keeps going until the
  // table is closed under every symbol.
  for (let i = 0; i < subsets.length; i++) {
    transitions[i] = {};
    accepting[i] = subsets[i].includes(end);
    for (const symbol of alphabet) {
      const landed = edges
        .filter(edge => edge.symbol === symbol && subsets[i].includes(edge.from))
        .map(edge => edge.to);
      const target = closure(landed);
      const key = target.join(',');
      if (!indexByKey.has(key)) {
        indexByKey.set(key, subsets.length);
        subsets.push(target);
      }
      transitions[i][symbol] = indexByKey.get(key);
    }
  }

  return {
    start: 0,
    next: (state, read) => transitions[state][read],
    accepts: state => accepting[state]
  };
}
