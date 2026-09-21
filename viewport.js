// The canvas camera: panning, zooming, and fit-to-view.
//
// Camera coordinates are independent of graph coordinates and of undo history, so moving
// the view never counts as an edit. The camera is expressed as the world point at the
// canvas's top-left plus a zoom factor, and is projected through the SVG viewBox.

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 3;

const GRID_SIZE = 25;
const ZOOM_BUTTON_STEP = 1.2;
const WHEEL_ZOOM_SENSITIVITY = 0.006;
const WHEEL_LINE_HEIGHT = 16;       // px per line when a wheel reports deltas in lines
const CLICK_SUPPRESSION_MS = 100;   // a pan must not also register as a click
const FIT_PADDING = 28;
const MIN_FIT_EXTENT = 100;
const SAFE_MARGIN_X = 65;           // keeps a dragged state clear of the canvas edges
const SAFE_MARGIN_TOP = 65;
const SAFE_MARGIN_BOTTOM = 100;
const LEFT_BUTTON = 0;
const MIDDLE_BUTTON = 1;

/** Zooms to `nextZoom` while holding the world point under `point` in place. */
export function zoomAt(camera, nextZoom, point) {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
  return {
    x: camera.x + point.x / camera.zoom - point.x / zoom,
    y: camera.y + point.y / camera.zoom - point.y / zoom,
    zoom
  };
}

/**
 * Wires panning and zooming to `svg` and returns the controls the editor needs.
 *
 * `isHandTool` reports whether the pan tool is selected, and `onNavigate` fires before any
 * camera change so the editor can dismiss a selection or a half-drawn connection.
 */
export function createViewport(svg, {isHandTool, onNavigate}) {
  const container = svg.parentElement;
  const zoomIn = document.querySelector('#zoom-in');
  const zoomOut = document.querySelector('#zoom-out');
  const zoomLevel = document.querySelector('#zoom-level');
  const selectToolButton = document.querySelector('[data-tool="select"]');

  let camera = {x: 0, y: 0, zoom: 1};
  let pan = null;             // {id, x, y, originX, originY} while a pan is in progress
  let spaceHeld = false;
  let suppressClickUntil = 0;

  const rect = () => svg.getBoundingClientRect();

  /** Pushes the camera into the viewBox, the background grid, and the zoom readout. */
  function apply() {
    const {width, height} = rect();
    svg.setAttribute('viewBox', `${camera.x} ${camera.y} ${width / camera.zoom} ${height / camera.zoom}`);
    svg.style.backgroundSize = `${GRID_SIZE * camera.zoom}px ${GRID_SIZE * camera.zoom}px`;
    svg.style.backgroundPosition = `${-camera.x * camera.zoom}px ${-camera.y * camera.zoom}px`;
    zoomLevel.textContent = `${Math.round(camera.zoom * 100)}%`;
    zoomOut.disabled = camera.zoom <= MIN_ZOOM;
    zoomIn.disabled = camera.zoom >= MAX_ZOOM;
  }

  /** Reflects grab-and-drag affordances on the container. */
  function cursor() {
    container.classList.toggle('pan-ready', spaceHeld || isHandTool());
    container.classList.toggle('panning', !!pan);
  }

  function zoomTo(value, point) {
    const {width, height} = rect();
    camera = zoomAt(camera, value, point || {x: width / 2, y: height / 2});
    apply();
  }

  /**
   * Panning starts on the middle button, or on the left button when the user is holding
   * Space, using the pan tool, or dragging empty canvas while the select tool is active.
   */
  function startsPan(event) {
    if (event.button === MIDDLE_BUTTON) return true;
    if (event.button !== LEFT_BUTTON) return false;
    if (spaceHeld || isHandTool()) return true;
    const onBackground = !event.target.closest('.state,.edge-label');
    return onBackground && selectToolButton.classList.contains('active');
  }

  function stopPan(event) {
    if (!pan || (event && event.pointerId !== pan.id)) return;
    suppressClickUntil = performance.now() + CLICK_SUPPRESSION_MS;
    if (svg.hasPointerCapture(pan.id)) svg.releasePointerCapture(pan.id);
    pan = null;
    cursor();
  }

  // Capture-phase listeners: a pan must win over the editor's own pointer handling.
  svg.addEventListener('pointerdown', event => {
    if (!startsPan(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    svg.focus({preventScroll: true});
    onNavigate();
    pan = {id: event.pointerId, x: event.clientX, y: event.clientY, originX: camera.x, originY: camera.y};
    svg.setPointerCapture(event.pointerId);
    cursor();
  }, true);

  svg.addEventListener('pointermove', event => {
    if (!pan || event.pointerId !== pan.id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    camera.x = pan.originX - (event.clientX - pan.x) / camera.zoom;
    camera.y = pan.originY - (event.clientY - pan.y) / camera.zoom;
    apply();
  }, true);

  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    svg.addEventListener(name, stopPan);
  }

  // Swallow the click that ends a pan, and the middle-button auxclick that would autoscroll.
  svg.addEventListener('click', event => {
    if (performance.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  svg.addEventListener('auxclick', event => {
    if (event.button === MIDDLE_BUTTON) event.preventDefault();
  });

  svg.addEventListener('wheel', event => {
    event.preventDefault();
    if (pan) return;
    onNavigate();
    const bounds = rect();
    const unit = wheelUnit(event, bounds.height);
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd + wheel, and trackpad pinch, zoom around the pointer.
      const factor = Math.exp(-event.deltaY * unit * WHEEL_ZOOM_SENSITIVITY);
      zoomTo(camera.zoom * factor, {x: event.clientX - bounds.left, y: event.clientY - bounds.top});
      return;
    }
    // Otherwise scroll; Shift turns vertical wheel movement into horizontal panning.
    camera.x += ((event.shiftKey ? event.deltaY : event.deltaX) * unit) / camera.zoom;
    camera.y += ((event.shiftKey ? 0 : event.deltaY) * unit) / camera.zoom;
    apply();
  }, {passive: false});

  document.addEventListener('keydown', event => {
    const typing = event.target.closest('input,select,textarea,button');
    if (event.code !== 'Space' || typing || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    spaceHeld = true;
    cursor();
  });
  document.addEventListener('keyup', event => {
    if (event.code !== 'Space') return;
    spaceHeld = false;
    cursor();
  });
  window.addEventListener('blur', () => {
    spaceHeld = false;
    stopPan();
    cursor();
  });

  zoomIn.onclick = () => {
    onNavigate();
    zoomTo(camera.zoom * ZOOM_BUTTON_STEP);
  };
  zoomOut.onclick = () => {
    onNavigate();
    zoomTo(camera.zoom / ZOOM_BUTTON_STEP);
  };
  zoomLevel.onclick = () => {
    onNavigate();
    zoomTo(1);
  };

  new ResizeObserver(apply).observe(svg);

  return {
    apply,
    cursor,

    /**
     * Frames `bounds`, never magnifying past 100%. `leftInset` is the width of the overlay
     * panel covering the canvas, so the content is centred in the space that remains.
     */
    fit(bounds, leftInset = 0) {
      const {width, height} = rect();
      const usableWidth = Math.max(MIN_FIT_EXTENT, width - leftInset - FIT_PADDING * 2);
      const usableHeight = Math.max(MIN_FIT_EXTENT, height - FIT_PADDING * 2);
      const zoom = Math.max(MIN_ZOOM, Math.min(
        1,
        usableWidth / (bounds.right - bounds.left),
        usableHeight / (bounds.bottom - bounds.top)
      ));
      camera = {
        zoom,
        x: (bounds.left + bounds.right) / 2 - (leftInset + (width - leftInset) / 2) / zoom,
        y: (bounds.top + bounds.bottom) / 2 - height / 2 / zoom
      };
      apply();
    },

    /**
     * Clamps a world point so a state placed or dragged there stays fully on screen.
     * On a small or heavily zoomed canvas the margins shrink rather than invert.
     */
    safePoint(point) {
      const {width, height} = rect();
      const right = camera.x + width / camera.zoom;
      const bottom = camera.y + height / camera.zoom;
      const marginX = Math.min(SAFE_MARGIN_X, width / camera.zoom / 2);
      const marginTop = Math.min(SAFE_MARGIN_TOP, height / camera.zoom / 2);
      const marginBottom = Math.min(SAFE_MARGIN_BOTTOM, height / camera.zoom / 2);
      return {
        x: Math.max(camera.x + marginX, Math.min(right - marginX, point.x)),
        y: Math.max(camera.y + marginTop, Math.min(bottom - marginBottom, point.y))
      };
    }
  };
}

/** Wheel deltas arrive in pixels, lines, or pages; normalise them to pixels. */
function wheelUnit(event, viewportHeight) {
  if (event.deltaMode === 1) return WHEEL_LINE_HEIGHT;
  if (event.deltaMode === 2) return viewportHeight;
  return 1;
}
