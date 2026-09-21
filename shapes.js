// Builds the SVG for one state or one arrow. These functions are pure: they return
// detached elements, and app.js attaches the event listeners.

import {svgElement, subscript} from './dom.js';

// A state is drawn as a tilted disc: a shadow, the disc's side, its lit face, and a
// highlight. Accepting states get the classic inner ring.
const SELECTION_RING_RADIUS = 64;
const BODY_RADIUS = 51;
const BODY_DEPTH = 8;
const ACCEPT_RING_RADIUS = 40;
const HIGHLIGHT_PATH = 'M -33 -29 Q -6 -51 28 -33';
const CAPTION_OFFSET = 88;
const SIDE_FILL = {accepting: '#cb5030', plain: '#12759d'};
const FACE_FILL = {accepting: 'url(#orange)', plain: 'url(#blue)'};

// The unattached arrow that marks the start state, drawn to its left.
const START_ARROW_PATH = 'M -110 0 H -70 M -78 -7 L -70 0 L -78 7';
const START_CAPTION_X = -93;
const START_CAPTION_Y = 20;

// The rounded square holding an arrow's symbol.
const LABEL_SIZE = 34;
const LABEL_CORNER_RADIUS = 11;

/**
 * One state, positioned and classed for the current selection and simulation.
 * `flags` carries everything the shape cannot read off the state itself.
 */
export function stateShape(state, flags) {
  const group = svgElement('g', {
    class: stateClasses(flags),
    transform: `translate(${state.x},${state.y})`,
    'data-id': state.id,
    tabindex: 0,
    role: 'button',
    'aria-label': `State q${state.id}` +
      (state.accept ? ', accepting' : '') +
      (flags.isStart ? ', starting state' : '')
  });

  group.append(
    svgElement('ellipse', {cx: 0, cy: 58, rx: 44, ry: 10, fill: '#7c8763', opacity: 0.17, filter: 'url(#shadow)'}),
    svgElement('circle', {r: SELECTION_RING_RADIUS, class: 'selection-ring'}),
    stateBody(state)
  );
  if (flags.isStart) group.append(...startMarker());
  group.append(svgElement(
    'text',
    {class: 'state-caption', 'text-anchor': 'middle', y: CAPTION_OFFSET},
    state.accept ? 'ACCEPT' : 'STATE'
  ));
  return group;
}

function stateClasses({isSelected, isSource, isActive, isDead}) {
  const classes = ['state'];
  if (isSelected) classes.push('selected');
  if (isSource) classes.push('source');
  if (isActive) classes.push('active');
  if (isDead) classes.push('dead');
  return classes.join(' ');
}

function stateBody(state) {
  const tone = state.accept ? 'accepting' : 'plain';
  const body = svgElement('g', {class: 'body'});
  body.append(
    svgElement('circle', {cy: BODY_DEPTH, r: BODY_RADIUS, fill: SIDE_FILL[tone]}),
    svgElement('circle', {r: BODY_RADIUS, fill: FACE_FILL[tone]}),
    svgElement('path', {
      d: HIGHLIGHT_PATH,
      fill: 'none',
      stroke: '#ffffff',
      opacity: 0.28,
      'stroke-width': 3,
      'stroke-linecap': 'round'
    })
  );
  if (state.accept) {
    body.append(svgElement('circle', {
      r: ACCEPT_RING_RADIUS,
      fill: 'none',
      stroke: '#ffe9ce',
      'stroke-width': 2.5,
      opacity: 0.85
    }));
  }
  body.append(svgElement('text', {class: 'name', 'text-anchor': 'middle', y: 9}, 'q' + subscript(state.id)));
  return body;
}

function startMarker() {
  return [
    svgElement('path', {d: START_ARROW_PATH, class: 'start-arrow'}),
    svgElement(
      'text',
      {x: START_CAPTION_X, y: START_CAPTION_Y, 'text-anchor': 'middle', class: 'state-caption'},
      'START'
    )
  ];
}

/** The curve for one arrow. Its id lets the playback animation find it again. */
export function edgeShape(index, geometry) {
  return svgElement('path', {d: geometry.d, class: 'edge-path', id: edgePathId(index)});
}

/** The clickable badge showing an arrow's symbol, centred on the curve. */
export function edgeLabelShape(edge, geometry) {
  const label = svgElement('g', {
    class: 'edge-label',
    transform: `translate(${geometry.x},${geometry.y})`,
    tabindex: 0,
    role: 'button',
    'aria-label': `Edit transition q${edge.from} to q${edge.to} on ${edge.symbol}`
  });
  label.append(
    svgElement('rect', {
      x: -LABEL_SIZE / 2,
      y: -LABEL_SIZE / 2,
      width: LABEL_SIZE,
      height: LABEL_SIZE,
      rx: LABEL_CORNER_RADIUS
    }),
    svgElement('text', {'text-anchor': 'middle', y: 6}, edge.symbol)
  );
  return label;
}

/** The DOM id given to the curve of the edge at `index` in machine.edges. */
export const edgePathId = index => `edge-${index}`;
