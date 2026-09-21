// Editor shell: owns the machine being edited and wires the DOM to it.
//
// The pure parts live elsewhere — automata.js runs machines, geometry.js positions arrows,
// shapes.js builds their SVG, storage.js persists drafts, viewport.js drives the camera.
// What remains here is mutable editor state and the event handlers that change it.
//
// Rendering is wholesale: any change to `machine` calls render(), which rebuilds the two
// SVG layers from scratch. The graphs are small enough that this is simpler and faster to
// reason about than patching the DOM.

import {createViewport} from './viewport.js';
import {levels, EPSILON, validate, closure, advanceStates, accepts} from './automata.js';
import {$, $$, htmlElement, svgElement, subscript} from './dom.js';
import {edgeGeometry} from './geometry.js';
import {stateShape, edgeShape, edgeLabelShape, edgePathId} from './shapes.js';
import {loadSession, saveSession} from './storage.js';

// ───────────────────────────── Element references ─────────────────────────────

const canvas = $('#canvas');
const edgeLayer = $('#edges');
const nodeLayer = $('#nodes');
const travelerLayer = $('#travelers');
const previewPath = $('#preview');
const playground = $('.playground');
const canvasTip = $('#canvas-tip');
const counts = $('#counts');
const toolButtons = $$('[data-tool]');

const symbolPicker = $('#symbol-picker');
const symbolOptions = $('#symbol-options');
const inspector = $('#inspector');
const acceptingToggle = $('#accepting');
const makeStartButton = $('#make-start');
const undoButton = $('#undo');

const challengePanel = $('.challenge-panel');
const levelSelect = $('#level');
const modeSelect = $('#mode');
const checkButton = $('#check');
const helpDialog = $('#help-dialog');

const testInput = $('#test-input');
const inputTokens = $('#input-tokens');
const runButton = $('#run');
const stepButton = $('#step');
const resultBox = $('#result');
const toastBox = $('#toast');

// ─────────────────────────────── Editor state ───────────────────────────────

const MAX_STATES = 40;
const MIN_STATE_SPACING = 125;
const DRAG_THRESHOLD = 3;
const UNDO_LIMIT = 60;
const TOAST_MS = 3200;

/** The ends-in-1 DFA: shown on a first visit, and restored by "Load starter example". */
const starterMachine = () => ({
  mode: 'DFA',
  alphabet: ['0', '1'],
  start: 0,
  nodes: [
    {id: 0, x: 560, y: 300, accept: false},
    {id: 1, x: 880, y: 300, accept: true}
  ],
  edges: [
    {from: 0, to: 0, symbol: '0'},
    {from: 0, to: 1, symbol: '1'},
    {from: 1, to: 0, symbol: '0'}
  ]
});

const emptyMachine = level => ({
  mode: level.preferredMode,
  alphabet: level.alphabet,
  start: null,
  nodes: [],
  edges: []
});

let {drafts, levelIndex, collapsed, machine} = loadSession(levels);
machine ??= starterMachine();
machine.mode ??= 'DFA';
machine.alphabet = levels[levelIndex].alphabet;

let tool = 'select';
let selected = null;   // id of the selected state
let source = null;     // id of the pending connection's source, while choosing a destination
let pending = null;    // {from, to} awaiting a symbol
let editing = null;    // index of the edge whose label is open
let drag = null;       // {id, dx, dy, x, y, moved} while a state is being dragged
let undoStack = [];
let toastTimer;

let simulation = null; // {word, index, active, dead, initialized, finished} while playing
let playing = false;
let runVersion = 0;    // bumped to invalidate animations still in flight
let checker = null;
let checkTimer = null;

const nodeById = id => machine.nodes.find(state => state.id === id);
const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

// ──────────────────────────────── Persistence ────────────────────────────────

/** Stores the current graph as this challenge's draft and persists the session. */
function save() {
  drafts[levels[levelIndex].id] = structuredClone(machine);
  saveSession({drafts, levelIndex, collapsed});
}

/** Snapshots the graph for undo. Call before mutating, never after. */
function pushUndo() {
  undoStack.push(JSON.stringify(machine));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  undoButton.disabled = false;
}

/** Everything a graph edit needs afterwards: playback is stale, so it is discarded. */
function commitEdit() {
  resetSimulation();
  syncMode();
  save();
  render();
}

// ────────────────────────────── Status messages ──────────────────────────────

function toast(message) {
  toastBox.textContent = message;
  toastBox.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastBox.classList.remove('visible'), TOAST_MS);
}

/** The persistent verdict line under the input. `kind` is '', 'success', or 'failure'. */
function showResult(title, description = '', kind = '') {
  resultBox.className = 'result ' + kind;
  resultBox.querySelector('strong').textContent = title;
  resultBox.querySelector('small').textContent = description;
}

// ───────────────────────────────── Rendering ─────────────────────────────────

function render() {
  renderEdges();
  renderStates();
  counts.textContent = `${machine.nodes.length} STATES · ${machine.edges.length} ARROWS`;
  undoButton.disabled = !undoStack.length;
}

function renderEdges() {
  edgeLayer.replaceChildren();
  machine.edges.forEach((edge, index) => {
    const geometry = edgeGeometry(machine, edge);
    if (!geometry) return;  // an endpoint was deleted; the edge goes with it
    const label = edgeLabelShape(edge, geometry);
    label.addEventListener('click', event => {
      event.stopPropagation();
      openEdgeEditor(index, geometry);
    });
    label.addEventListener('keydown', event => {
      if (event.key === 'Enter') openEdgeEditor(index, geometry);
    });
    edgeLayer.append(edgeShape(index, geometry), label);
  });
}

function renderStates() {
  nodeLayer.replaceChildren();
  for (const state of machine.nodes) {
    const shape = stateShape(state, {
      isStart: machine.start === state.id,
      isSelected: selected === state.id,
      isSource: source === state.id,
      isActive: !!simulation?.active.includes(state.id),
      isDead: !!simulation?.dead?.includes(state.id)
    });
    shape.addEventListener('pointerdown', event => beginStateInteraction(event, state));
    shape.addEventListener('dblclick', event => {
      event.preventDefault();
      if (tool !== 'select') return;
      pushUndo();
      state.accept = !state.accept;
      commitEdit();
      showInspector(state.id);
    });
    shape.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      if (tool === 'connect') {
        connectClick(state.id);
        return;
      }
      selected = state.id;
      showInspector(state.id);
      render();
    });
    nodeLayer.append(shape);
  }
}

/** Screen coordinates to graph coordinates, through the current camera. */
const canvasPoint = event =>
  new DOMPoint(event.clientX, event.clientY).matrixTransform(canvas.getScreenCTM().inverse());

// ─────────────────────────── Tools and selection ───────────────────────────

const DEFAULT_TIP = 'Drag empty space to pan · Ctrl + scroll to zoom';
const TOOL_TIPS = {
  state: 'Click an empty spot to place a state.',
  connect: 'Click a source, then a destination. Esc to cancel.'
};
const CROSSHAIR_TOOLS = new Set(['state', 'connect']);

function setTool(name) {
  cancel();
  tool = name;
  canvas.focus({preventScroll: true});
  toolButtons.forEach(button => button.classList.toggle('active', button.dataset.tool === tool));
  canvas.style.cursor = CROSSHAIR_TOOLS.has(tool) ? 'crosshair' : 'default';
  viewport.cursor();
  canvasTip.textContent = TOOL_TIPS[tool] ?? DEFAULT_TIP;
  inspector.hidden = true;
  selected = null;
  render();
}

/** Abandons any half-finished connection or open arrow label. */
function cancel() {
  source = null;
  pending = null;
  editing = null;
  symbolPicker.hidden = true;
  symbolPicker.querySelector('.delete-edge')?.remove();
  previewPath.setAttribute('d', '');
  render();
}

/** Drops the selection as well — used whenever the camera moves. */
function dismissSelection() {
  cancel();
  selected = null;
  inspector.hidden = true;
  render();
}

// ──────────────────────── Placing and dragging states ────────────────────────

function beginStateInteraction(event, state) {
  if (event.button !== 0) return;
  event.stopPropagation();
  if (tool === 'connect') {
    connectClick(state.id);
    return;
  }
  if (tool === 'state') return;

  // Move tool: select the state and arm a drag that only starts once the pointer moves.
  source = null;
  pending = null;
  editing = null;
  symbolPicker.hidden = true;
  previewPath.setAttribute('d', '');
  selected = state.id;
  const point = canvasPoint(event);
  drag = {id: state.id, dx: point.x - state.x, dy: point.y - state.y, x: point.x, y: point.y, moved: false};
  showInspector(state.id);
  // Move the selection ring by hand rather than re-rendering under the live pointer.
  $$('.state').forEach(shape => shape.classList.toggle('selected', Number(shape.dataset.id) === state.id));
}

canvas.addEventListener('pointermove', event => {
  const point = canvasPoint(event);
  if (drag) {
    dragState(event, point);
    return;
  }
  // While choosing a destination, rubber-band a line from the source to the pointer.
  if (source === null || pending) return;
  const from = nodeById(source);
  previewPath.setAttribute('d', `M ${from.x} ${from.y} L ${point.x} ${point.y}`);
});

function dragState(event, point) {
  const state = nodeById(drag.id);
  if (!drag.moved && Math.hypot(point.x - drag.x, point.y - drag.y) > DRAG_THRESHOLD) {
    // Record undo once, when a click turns out to be a drag.
    pushUndo();
    resetSimulation();
    drag.moved = true;
  }
  if (!drag.moved) return;
  canvas.setPointerCapture(event.pointerId);
  const safe = viewport.safePoint({x: point.x - drag.dx, y: point.y - drag.dy});
  state.x = safe.x;
  state.y = safe.y;
  render();
}

window.addEventListener('pointerup', () => {
  if (drag?.moved) save();
  drag = null;
});
canvas.addEventListener('pointercancel', () => {
  drag = null;
  save();
});

canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest('.state,.edge-label')) return;
  if (tool === 'state') {
    placeState(canvasPoint(event));
    return;
  }
  cancel();
  selected = null;
  inspector.hidden = true;
  render();
});

function placeState(where) {
  if (machine.nodes.length >= MAX_STATES) {
    toast(`This demo supports up to ${MAX_STATES} states.`);
    return;
  }
  const point = viewport.safePoint(where);
  if (machine.nodes.some(state => Math.hypot(point.x - state.x, point.y - state.y) < MIN_STATE_SPACING)) {
    toast('Place states farther apart.');
    return;
  }
  pushUndo();
  const id = lowestUnusedId();
  machine.nodes.push({id, x: point.x, y: point.y, accept: false});
  if (machine.nodes.length === 1) machine.start = id;
  commitEdit();
}

/** New states reuse the lowest free number, so ids stay small after deletions. */
function lowestUnusedId() {
  let id = 0;
  while (nodeById(id)) id++;
  return id;
}

// ──────────────────────────────── Connections ────────────────────────────────

const PICKER_ABOVE_STATE = 90;
const PICKER_ABOVE_LABEL = 47;
const PICKER_EDGE_MARGIN = 95;
const PICKER_TOP_MARGIN = 65;

/** Connect tool: first click picks the source, second opens the symbol picker. */
function connectClick(id) {
  if (source === null) {
    source = id;
    resetSimulation();
    render();
    canvasTip.textContent = 'Now choose a destination. Same state makes a loop.';
    return;
  }
  pending = {from: source, to: id};
  const state = nodeById(id);
  showPicker(state.x, state.y - PICKER_ABOVE_STATE);
  previewPath.setAttribute('d', '');
}

/** Positions the symbol picker at a graph point, kept inside the playground. */
function showPicker(x, y) {
  const point = new DOMPoint(x, y).matrixTransform(canvas.getScreenCTM());
  const bounds = playground.getBoundingClientRect();
  const left = Math.max(PICKER_EDGE_MARGIN, Math.min(bounds.width - PICKER_EDGE_MARGIN, point.x - bounds.left));
  symbolPicker.style.left = `${left}px`;
  symbolPicker.style.top = `${Math.max(PICKER_TOP_MARGIN, point.y - bounds.top)}px`;
  symbolPicker.hidden = false;
  symbolPicker.querySelector('button').focus();
}

/** Reopens an existing arrow for relabelling, with a Delete button alongside. */
function openEdgeEditor(index, geometry) {
  cancel();
  editing = index;
  showPicker(geometry.x, geometry.y - PICKER_ABOVE_LABEL);
  const remove = htmlElement('button', {className: 'delete-edge', textContent: 'Delete'});
  remove.onclick = () => {
    pushUndo();
    machine.edges.splice(index, 1);
    cancel();
    commitEdit();
  };
  symbolPicker.append(remove);
}

symbolOptions.onclick = event => {
  const button = event.target.closest('[data-symbol]');
  if (!button) return;
  const symbol = button.dataset.symbol;
  const edge = editing !== null ? machine.edges[editing] : pending;
  if (!edge) return;

  // A DFA conflicts with any other arrow leaving the same state on this symbol; an NFA
  // may branch, so only an identical arrow is a duplicate.
  const duplicate = machine.edges.some((other, index) =>
    index !== editing &&
    other.from === edge.from &&
    other.symbol === symbol &&
    (machine.mode === 'DFA' || other.to === edge.to));
  if (duplicate) {
    toast(machine.mode === 'DFA'
      ? `q${edge.from} already has an outgoing ${symbol} arrow.`
      : 'That transition already exists.');
    return;
  }

  pushUndo();
  if (editing !== null) machine.edges[editing].symbol = symbol;
  else machine.edges.push({...pending, symbol});
  cancel();
  commitEdit();
  canvasTip.textContent = 'Connected. Pick another source, or press V to move.';
};

$('#cancel-edge').onclick = cancel;

// ───────────────────────────── State inspector ─────────────────────────────

function showInspector(id) {
  const state = nodeById(id);
  if (!state) return;
  inspector.hidden = false;
  $('#selected-name').textContent = 'q' + subscript(id);
  acceptingToggle.checked = state.accept;
  makeStartButton.textContent = machine.start === id ? '✓ Starting state' : 'Set as starting state →';
  makeStartButton.disabled = machine.start === id;
}

$('#close-inspector').onclick = () => {
  inspector.hidden = true;
  selected = null;
  render();
};

acceptingToggle.onchange = event => {
  if (selected === null) return;
  pushUndo();
  nodeById(selected).accept = event.target.checked;
  commitEdit();
};

makeStartButton.onclick = () => {
  if (selected === null) return;
  pushUndo();
  machine.start = selected;
  commitEdit();
  showInspector(selected);
};

/** Deleting a state takes every arrow touching it, and hands off the start marker. */
function deleteSelected() {
  if (selected === null) return;
  pushUndo();
  machine.nodes = machine.nodes.filter(state => state.id !== selected);
  machine.edges = machine.edges.filter(edge => edge.from !== selected && edge.to !== selected);
  if (machine.start === selected) machine.start = machine.nodes[0]?.id ?? null;
  selected = null;
  inspector.hidden = true;
  commitEdit();
}

$('#delete-selected').onclick = deleteSelected;
toolButtons.forEach(button => {
  button.onclick = () => setTool(button.dataset.tool);
});

undoButton.onclick = () => {
  if (!undoStack.length) return;
  machine = JSON.parse(undoStack.pop());
  selected = null;
  inspector.hidden = true;
  cancel();
  commitEdit();
};

$('#clear').onclick = () => {
  pushUndo();
  machine = {mode: machine.mode, alphabet: levels[levelIndex].alphabet, start: null, nodes: [], edges: []};
  selected = null;
  cancel();
  commitEdit();
  setTool('state');
  toast('Canvas cleared. Use Undo to restore it.');
};

// ───────────────────────────── Challenge and mode ─────────────────────────────

/** Mirrors machine.mode into the panel and rebuilds the available arrow labels. */
function syncMode() {
  modeSelect.value = machine.mode;
  $('#mode-rule').textContent = machine.mode === 'NFA'
    ? 'Branching and ε-transitions allowed. Any accepting branch wins after the full input.'
    : 'One outgoing arrow per symbol. Missing transitions reject.';

  const symbols = [...levels[levelIndex].alphabet];
  if (machine.mode === 'NFA') symbols.push(EPSILON);
  symbolOptions.replaceChildren(...symbols.map(symbol => {
    const button = htmlElement('button', {
      textContent: symbol,
      title: symbol === EPSILON ? 'Epsilon: consumes no input' : `Read ${symbol}`
    });
    button.dataset.symbol = symbol;
    return button;
  }));
}

/** Repaints everything that describes the current challenge. */
function changeLevel() {
  const level = levels[levelIndex];
  machine.alphabet = level.alphabet;
  levelSelect.value = levelIndex;
  $('#rule').textContent = level.rule;
  $('#level-detail').textContent = level.detail;
  $('#challenge-source').textContent = level.source;
  $('#level-count').textContent = `${String(levelIndex + 1).padStart(2, '0')} / ${levels.length}`;
  $('#alphabet-symbols').replaceChildren(
    ...level.alphabet.map(symbol => htmlElement('span', {textContent: symbol}))
  );
  $('#input-label').textContent = level.alphabet.join('') === '01'
    ? 'BINARY INPUT'
    : 'INPUT · ' + level.alphabet.join(', ');
  testInput.value = level.example;
  resetSimulation();
  syncMode();
  save();
  render();
}

levels.forEach((level, index) => {
  levelSelect.append(htmlElement('option', {
    value: index,
    textContent: `${String(index + 1).padStart(2, '0')}. ${level.name}`
  }));
});

levelSelect.onchange = event => {
  save();  // keep the draft of the challenge being left
  levelIndex = Number(event.target.value);
  machine = structuredClone(drafts[levels[levelIndex].id] || emptyMachine(levels[levelIndex]));
  undoStack = [];  // undo never crosses challenges
  selected = null;
  drag = null;
  cancel();
  inspector.hidden = true;
  changeLevel();
  setTool(machine.nodes.length ? 'select' : 'state');
  fitView();
};

modeSelect.onchange = event => {
  const mode = event.target.value;
  // Switching to DFA is refused rather than repaired: a branching or ε-NFA would have to
  // lose arrows to become deterministic, and that is the user's decision to make.
  const error = machine.nodes.length ? validate({...machine, mode}, levels[levelIndex].alphabet) : null;
  if (error) {
    modeSelect.value = machine.mode;
    toast('Cannot switch modes: ' + error);
    return;
  }
  pushUndo();
  machine.mode = mode;
  cancel();
  commitEdit();
};

function setCollapsed(value) {
  collapsed = value;
  const toggle = $('#toggle-challenge');
  challengePanel.classList.toggle('collapsed', value);
  $('#challenge-body').hidden = value;
  toggle.setAttribute('aria-expanded', String(!value));
  toggle.title = value ? 'Expand challenge' : 'Collapse challenge';
  $('#collapse-icon').textContent = value ? '+' : '−';
  save();
}

$('#toggle-challenge').onclick = () => setCollapsed(!collapsed);

// ─────────────────────────── Simulation playback ───────────────────────────

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');
const SYMBOL_TRAVEL_MS = 550;
const EPSILON_TRAVEL_MS = 260;
const TOKEN_RADIUS = 8;
const SYMBOL_TOKEN_FILL = '#fbd34d';
const EPSILON_TOKEN_FILL = '#bea2de';

/** Ease-in-out, so tokens leave and arrive gently. */
const smoothstep = t => t * t * (3 - 2 * t);

/** Clears playback and invalidates any animation still running. */
function resetSimulation() {
  stopCheck();
  runVersion++;
  playing = false;
  simulation = null;
  runButton.innerHTML = '<span>▶</span> Run string';
  runButton.disabled = false;
  stepButton.disabled = false;
  travelerLayer.replaceChildren();
  inputTokens.replaceChildren();
  $$('.state.active,.state.dead').forEach(shape => shape.classList.remove('active', 'dead'));
  $$('.edge-path.running').forEach(path => path.classList.remove('running'));
  showResult('Ready when you are.', 'Watch your machine think.');
}

/** Validates the input and arms a fresh run. Returns false if it cannot start. */
function startSimulation() {
  const word = testInput.value;
  const level = levels[levelIndex];
  if ([...word].some(symbol => !level.alphabet.includes(symbol))) {
    showResult('Invalid input symbol.', `Use only ${level.alphabet.join(', ')}. Leave empty to test ε.`, 'failure');
    return false;
  }
  const error = validate(machine, level.alphabet);
  if (error) {
    toast(error);
    return false;
  }
  simulation = {word, index: 0, active: [machine.start], dead: [], initialized: false, finished: false};
  inputTokens.replaceChildren(...[...word].map(() => htmlElement('span')));
  render();
  return true;
}

/**
 * Sends a token along every edge in `edgeIndices` at once, resolving when they arrive.
 * Resolves early once `version` goes stale, which is how a restart or an edit cancels
 * playback that is already in flight.
 */
async function animateEdges(edgeIndices, version, epsilon = false) {
  const duration = REDUCED_MOTION.matches ? 0 : epsilon ? EPSILON_TRAVEL_MS : SYMBOL_TRAVEL_MS;
  const found = edgeIndices.map(index => ({index, path: $('#' + edgePathId(index))})).filter(({path}) => path);
  if (!found.length) return;

  const travellers = found.map(({index, path}) => {
    const token = travelToken(epsilon);
    travelerLayer.append(token);
    path.classList.add('running');
    return {token, index, path, length: path.getTotalLength()};
  });

  const startedAt = performance.now();
  await new Promise(resolve => {
    const frame = now => {
      if (version !== runVersion) {
        resolve();
        return;
      }
      const progress = duration ? Math.min(1, (now - startedAt) / duration) : 1;
      for (const traveller of travellers) moveToken(traveller, progress);
      if (progress < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });

  for (const {token, index} of travellers) {
    token.remove();
    $('#' + edgePathId(index))?.classList.remove('running');
  }
}

/** The moving dot standing for one branch of the computation. */
function travelToken(epsilon) {
  return svgElement('circle', {
    r: TOKEN_RADIUS,
    fill: epsilon ? EPSILON_TOKEN_FILL : SYMBOL_TOKEN_FILL,
    stroke: '#fffaf0',
    'stroke-width': 3
  });
}

/** A re-render replaces the path element, so the live one is looked up every frame. */
function moveToken({token, index, path, length}, progress) {
  const live = $('#' + edgePathId(index)) || path;
  const travelled = (live === path ? length : live.getTotalLength()) * smoothstep(progress);
  const point = live.getPointAtLength(travelled);
  token.setAttribute('cx', point.x);
  token.setAttribute('cy', point.y);
}

/** Walks the ε-closure one wave at a time so branching is visible. */
async function followEpsilon(seeds, waves, version) {
  simulation.active = [...seeds];
  render();
  for (const wave of waves) {
    showResult('Following ε-transitions.', 'No input symbol is consumed.');
    await animateEdges(wave, version, true);
    if (version !== runVersion) return false;
    const arrived = wave.map(index => machine.edges[index].to);
    simulation.active = [...new Set([...simulation.active, ...arrived])];
    render();
  }
  return true;
}

function finish() {
  if (!simulation) return;
  simulation.finished = true;
  if (accepts(machine, simulation.active)) {
    showResult('String accepted.', machine.mode === 'NFA'
      ? 'At least one accepting branch remains after the full input.'
      : 'Finished in an accepting state.', 'success');
    return;
  }
  showResult('String rejected.', simulation.active.length
    ? 'No accepting state remains after the full input.'
    : 'All computation branches have stopped.', 'failure');
}

/** Reads one symbol, animating the transitions and any ε-moves that follow. */
async function advance() {
  if (!simulation || simulation.finished) return;
  const version = runVersion;

  if (!simulation.initialized) {
    const {states, waves} = closure(machine, [machine.start]);
    if (!await followEpsilon([machine.start], waves, version)) return;
    simulation.active = states;
    simulation.initialized = true;
    render();
  }

  if (simulation.index === simulation.word.length) {
    finish();
    return;
  }

  const symbol = simulation.word[simulation.index];
  const next = advanceStates(machine, simulation.active, symbol);
  simulation.dead = next.dead;
  render();
  showResult(`Reading ${symbol}.`, `${plural(next.transitions.length, 'matching transition')}.`);

  await animateEdges(next.transitions, version);
  if (version !== runVersion) return;
  if (!await followEpsilon(next.destinations, next.epsilonWaves, version)) return;

  simulation.active = next.states;
  simulation.index++;
  [...inputTokens.children].forEach((token, i) => token.classList.toggle('read', i < simulation.index));
  render();
  showResult(
    `Read ${symbol} · ${plural(next.states.length, 'active state')}.`,
    next.dead.length
      ? `${next.dead.map(id => 'q' + id).join(', ')} had no ${symbol} transition; those paths stop.`
      : `${simulation.index} of ${simulation.word.length} symbols.`
  );
  if (!next.states.length || simulation.index === simulation.word.length) finish();
}

runButton.onclick = async () => {
  if (playing) {  // the button reads "Stop" mid-run
    resetSimulation();
    render();
    return;
  }
  resetSimulation();
  if (!startSimulation()) return;
  playing = true;
  const version = runVersion;
  runButton.innerHTML = '<span>■</span> Stop';
  stepButton.disabled = true;
  while (simulation && !simulation.finished && version === runVersion) await advance();
  if (version !== runVersion) return;  // a newer run took over; it owns the buttons now
  playing = false;
  runButton.innerHTML = '<span>▶</span> Run again';
  stepButton.disabled = false;
};

stepButton.onclick = async () => {
  if (!simulation || simulation.finished) {
    resetSimulation();
    if (!startSimulation()) return;
  }
  const version = runVersion;
  // Both buttons stay locked until this step's animation finishes.
  stepButton.disabled = true;
  runButton.disabled = true;
  try {
    await advance();
  } finally {
    if (version === runVersion) {
      stepButton.disabled = false;
      runButton.disabled = false;
    }
  }
};

testInput.addEventListener('input', resetSimulation);

// ─────────────────────────── Exact language check ───────────────────────────

const CHECK_TIMEOUT_MS = 8000;
const CELEBRATION_MS = 900;

/** Tears down the worker and restores the button, whether it finished or not. */
function stopCheck() {
  checker?.terminate();
  checker = null;
  clearTimeout(checkTimer);
  checkButton.disabled = false;
  checkButton.innerHTML = 'Check my machine <span>↗</span>';
}

checkButton.onclick = () => {
  resetSimulation();
  const version = runVersion;
  checkButton.disabled = true;
  checkButton.textContent = 'Checking…';
  showResult('Checking the complete language.', 'Exploring reachable state combinations.');

  checker = new Worker('./checker.worker.js', {type: 'module'});
  checker.onmessage = ({data: verdict}) => {
    if (version !== runVersion) return;  // the user moved on while we were checking
    stopCheck();
    reportVerdict(verdict);
  };
  checker.onerror = () => {
    stopCheck();
    showResult('Check incomplete.', 'The checker could not finish. No correctness verdict was made.', 'failure');
  };
  checker.postMessage({machine, levelIndex});
  checkTimer = setTimeout(() => {
    stopCheck();
    showResult('Check incomplete.', 'Time limit reached. No correctness verdict was made. Simplify the machine and retry.', 'failure');
  }, CHECK_TIMEOUT_MS);
};

function reportVerdict(verdict) {
  if (verdict.error) {
    showResult(verdict.inconclusive ? 'Check incomplete.' : 'Check your machine.', verdict.error, 'failure');
    return;
  }
  if (verdict.equivalent) {
    showResult('Perfect recipe. You did it!', 'Your machine recognizes exactly this language.', 'success');
    celebrate();
    toast('Every string checks out.');
    return;
  }
  // Load the shortest counterexample into the input so it can be stepped through.
  testInput.value = verdict.word;
  showResult(
    `Try ${verdict.word || 'ε (the empty string)'}.`,
    verdict.expected
      ? 'This should be accepted, but your machine rejects it.'
      : 'This should be rejected, but your machine accepts it.',
    'failure'
  );
  toast('Found the shortest counterexample. Run it to explore.');
}

/** Restarts the celebration animation even if one is already playing. */
function celebrate() {
  canvas.classList.remove('celebrate');
  requestAnimationFrame(() => canvas.classList.add('celebrate'));
  setTimeout(() => canvas.classList.remove('celebrate'), CELEBRATION_MS);
}

// ──────────────────────────────── Help dialog ────────────────────────────────

$('#help').onclick = () => helpDialog.showModal();
$('#close-help').onclick = () => helpDialog.close();
$('#reset-example').onclick = () => {
  save();
  levelIndex = 0;
  undoStack = [];
  machine = starterMachine();
  selected = null;
  cancel();
  changeLevel();
  commitEdit();
  helpDialog.close();
  setTool('select');
  fitView();
};

// ───────────────────────────── Keyboard shortcuts ─────────────────────────────

const TOOL_SHORTCUTS = {v: 'select', s: 'state', c: 'connect', h: 'hand'};

document.addEventListener('keydown', event => {
  // Escape works everywhere, including from a focused field.
  if (event.key === 'Escape') {
    cancel();
    inspector.hidden = true;
    selected = null;
    render();
    return;
  }
  if (event.target.matches('input,select,textarea') || helpDialog.open) return;

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undoButton.click();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const shortcut = TOOL_SHORTCUTS[event.key.toLowerCase()];
  if (shortcut) setTool(shortcut);

  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    // With an arrow label open, delete removes that arrow rather than the selected state.
    if (editing !== null) symbolPicker.querySelector('.delete-edge')?.click();
    else deleteSelected();
  }
});

// ──────────────────────────────── Camera ────────────────────────────────

const viewport = createViewport(canvas, {isHandTool: () => tool === 'hand', onNavigate: dismissSelection});

// Room around the graph when fitting, for the START arrow and the captions under states.
const FIT_MARGIN = {left: 130, right: 115, top: 180, bottom: 105};
const EMPTY_VIEW = {left: 400, right: 1000, top: 100, bottom: 500};
const PANEL_GAP = 25;
const PANEL_OVERLAY_WIDTH = 760;  // below this the panel stacks instead of floating

function fitView() {
  dismissSelection();
  const bounds = machine.nodes.length ? graphBounds() : EMPTY_VIEW;
  const panel = challengePanel.getBoundingClientRect();
  const canvasBounds = canvas.getBoundingClientRect();
  // On wide screens the expanded panel sits over the canvas, so fit into what it leaves.
  const inset = innerWidth > PANEL_OVERLAY_WIDTH && !collapsed
    ? Math.max(0, panel.right - canvasBounds.left + PANEL_GAP)
    : 0;
  viewport.fit(bounds, inset);
}

function graphBounds() {
  const xs = machine.nodes.map(state => state.x);
  const ys = machine.nodes.map(state => state.y);
  return {
    left: Math.min(...xs) - FIT_MARGIN.left,
    right: Math.max(...xs) + FIT_MARGIN.right,
    top: Math.min(...ys) - FIT_MARGIN.top,
    bottom: Math.max(...ys) + FIT_MARGIN.bottom
  };
}

$('#fit-view').onclick = fitView;
window.addEventListener('resize', () => {
  cancel();
  viewport.apply();
});

// ───────────────────────────────── Start up ─────────────────────────────────

setCollapsed(collapsed);
changeLevel();
render();
fitView();
