const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalViewBounds, shouldShowEmbeddedView } = require('../electron/view-layout.cjs');

test('video follows the full-width workspace below the top navigation', () => {
  for (const x of [16, 20.4, 24.6, 32, 64]) {
    const bounds = normalViewBounds({ x, y: 128, width: 1440 - x - 16, height: 700 });
    assert.equal(bounds.x, Math.round(x));
    assert.equal(bounds.width + bounds.x, 1424);
  }
});

test('late fullscreen geometry cannot cover navigation or caption controls', () => {
  assert.equal(normalViewBounds({ x: 0, y: 0, width: 1440, height: 940 }), null);
  assert.equal(normalViewBounds({ x: 224, y: 32, width: 1200, height: 900 }), null);
  assert.equal(normalViewBounds({ x: 0, y: 128, width: 1400, height: 700 }), null);
});

test('invalid and collapsed video slots never reach native setBounds', () => {
  for (const rect of [null, {}, { x: 208, y: 128, width: 0, height: 700 }, { x: 208, y: 128, width: Infinity, height: 700 }, { x: '208', y: 128, width: 1000, height: 700 }]) {
    assert.equal(normalViewBounds(rect), null);
  }
});

test('opening navigation or search conceals even the active fullscreen video until the overlay closes', () => {
  assert.equal(shouldShowEmbeddedView('player-1','player-1',true),false);
  assert.equal(shouldShowEmbeddedView('player-1','player-1',false),true);
  assert.equal(shouldShowEmbeddedView('player-2','player-1',false),false);
  assert.equal(shouldShowEmbeddedView('player-1',null,false),false);
});
