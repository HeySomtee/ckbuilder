import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearProgressPoint,
  progressCorners,
  nearestProgressCorner,
} from './src/features/direct/progress-position.ts';

test('Progress corners stay clear of mobile header, navigation and saved slip', () => {
  const bounds = { left: 16, top: 16, right: 374, bottom: 828 };
  const obstacles = [
    { left: 0, top: 0, right: 390, bottom: 140 },
    { left: 16, top: 750, right: 374, bottom: 828 },
    { left: 16, top: 670, right: 374, bottom: 738 },
  ];
  const corners = progressCorners(bounds, obstacles);
  assert.equal(Object.keys(corners).length, 4);
  for (const point of Object.values(corners))
    assert.ok(clearProgressPoint(point, bounds, obstacles));
  assert.deepEqual(corners['top-left'], { x: 16, y: 152 });
  assert.deepEqual(corners['bottom-right'], { x: 318, y: 602 });
  assert.equal(nearestProgressCorner({ x: 0, y: 844 }, corners)[0], 'bottom-left');
});

test('Overlays and resized viewports cannot force the progress button outside safe bounds', () => {
  for (const height of [300, 460, 640, 844]) {
    const bounds = { left: 24, top: 36, right: 296, bottom: height - 28 };
    const obstacles = [
      { left: 0, top: 0, right: 140, bottom: 220 },
      { left: 0, top: height - 90, right: 320, bottom: height },
    ];
    for (const point of Object.values(progressCorners(bounds, obstacles)))
      assert.ok(clearProgressPoint(point, bounds, obstacles));
  }
  const bounds = { left: 16, top: 16, right: 304, bottom: 624 };
  assert.deepEqual(progressCorners(bounds, [{ left: 0, top: 0, right: 320, bottom: 640 }]), {});
  assert.equal(nearestProgressCorner({ x: 20, y: 20 }, {}), undefined);
  assert.deepEqual(progressCorners({ left: 16, top: 16, right: 40, bottom: 40 }, []), {});
});
