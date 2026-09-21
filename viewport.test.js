import test from 'node:test';
import assert from 'node:assert/strict';
import {zoomAt, MIN_ZOOM, MAX_ZOOM} from './viewport.js';

test('zoom preserves the world point under the pointer', () => {
  const camera = {x: -1400, y: 2800, zoom: 0.45};
  const pointer = {x: 735, y: 219};

  // Includes targets outside the allowed range, which must clamp rather than drift.
  for (const target of [0.01, 0.1, 1, 3, 100]) {
    const next = zoomAt(camera, target, pointer);
    const worldX = c => c.x + pointer.x / c.zoom;
    const worldY = c => c.y + pointer.y / c.zoom;
    assert.ok(Math.abs(worldX(camera) - worldX(next)) < 1e-9);
    assert.ok(Math.abs(worldY(camera) - worldY(next)) < 1e-9);
    assert.ok(next.zoom >= MIN_ZOOM && next.zoom <= MAX_ZOOM);
  }
});

test('zooming out and back restores the camera', () => {
  const initial = {x: 100, y: -800, zoom: 1};
  const point = {x: 300, y: 200};
  assert.deepEqual(zoomAt(zoomAt(initial, 0.25, point), 1, point), initial);
});
