// Pure geometry for the arrows between states: where each curve starts and ends,
// and where its label sits. Nothing here touches the DOM or app state.

// A self-loop leaves and re-enters the state at a fixed distance, bowing outwards.
const LOOP_ANCHOR_DISTANCE = 43;
const LOOP_ANCHOR_SPREAD = 27;
const LOOP_CONTROL_DISTANCE = 185;
const LOOP_CONTROL_SPREAD = 94;
const LOOP_LABEL_DISTANCE = 151;
const LOOP_FAN_RADIANS = 1.35;

// Curves between two states bow aside so neighbouring arrows stay distinguishable.
const OPPOSITE_BEND = 60;
const OPPOSITE_BEND_STEP = 75;
const PARALLEL_BEND_STEP = 85;
const SOURCE_GAP = 57;
const TARGET_GAP = 64;

/**
 * Returns {d, x, y} for an edge: the SVG path data, plus the point its label hangs on.
 * Returns null when either endpoint has been deleted.
 */
export function edgeGeometry(machine, edge) {
  const from = machine.nodes.find(node => node.id === edge.from);
  const to = machine.nodes.find(node => node.id === edge.to);
  if (!from || !to) return null;
  return from.id === to.id ? selfLoop(machine, edge, from) : curve(machine, edge, from, to);
}

/**
 * A loop drawn as a cubic curve leaving the top of the state. Several loops on the same
 * state fan out evenly around that direction so their labels do not collide.
 */
function selfLoop(machine, edge, state) {
  const loops = machine.edges.filter(other => other.from === state.id && other.to === state.id);
  const index = loops.indexOf(edge);
  const fan = loops.length === 1 ? 0 : (index - (loops.length - 1) / 2) * LOOP_FAN_RADIANS;
  const angle = -Math.PI / 2 + fan;

  const out = {x: Math.cos(angle), y: Math.sin(angle)};  // away from the state
  const across = {x: -out.y, y: out.x};                  // perpendicular to that
  const point = (along, sideways) =>
    `${state.x + out.x * along + across.x * sideways} ${state.y + out.y * along + across.y * sideways}`;

  return {
    d: `M ${point(LOOP_ANCHOR_DISTANCE, -LOOP_ANCHOR_SPREAD)} ` +
      `C ${point(LOOP_CONTROL_DISTANCE, -LOOP_CONTROL_SPREAD)}, ` +
      `${point(LOOP_CONTROL_DISTANCE, LOOP_CONTROL_SPREAD)}, ` +
      `${point(LOOP_ANCHOR_DISTANCE, LOOP_ANCHOR_SPREAD)}`,
    x: state.x + out.x * LOOP_LABEL_DISTANCE,
    y: state.y + out.y * LOOP_LABEL_DISTANCE
  };
}

/** A quadratic curve between two distinct states. */
function curve(machine, edge, from, to) {
  const span = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const unit = {x: (to.x - from.x) / span, y: (to.y - from.y) / span};

  // An arrow steps aside to clear its mirror image, and arrows sharing a direction
  // spread symmetrically around the straight line between the two states.
  const hasOpposite = machine.edges.some(other => other.from === to.id && other.to === from.id);
  const parallel = machine.edges.filter(other => other.from === from.id && other.to === to.id);
  const index = parallel.indexOf(edge);
  const bend = hasOpposite
    ? OPPOSITE_BEND + index * OPPOSITE_BEND_STEP
    : (index - (parallel.length - 1) / 2) * PARALLEL_BEND_STEP;

  const control = {
    x: (from.x + to.x) / 2 - unit.y * bend,
    y: (from.y + to.y) / 2 + unit.x * bend
  };

  // Pull both ends back to the rim of their state so the curve does not run underneath it.
  const start = towards(from, control, SOURCE_GAP);
  const end = towards(to, control, TARGET_GAP);

  return {
    d: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    // The curve's midpoint, where the label reads most clearly.
    x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
    y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y
  };
}

/** Steps `distance` away from `origin` in the direction of `target`. */
function towards(origin, target, distance) {
  const span = Math.hypot(target.x - origin.x, target.y - origin.y) || 1;
  return {
    x: origin.x + ((target.x - origin.x) / span) * distance,
    y: origin.y + ((target.y - origin.y) / span) * distance
  };
}
