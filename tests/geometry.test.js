import test from 'node:test';
import assert from 'node:assert/strict';
import { coverGeometry, mirroredTip, gestureState } from '../geometry.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≠ ${b}`);

function hand(extended = [true, false, false, false]) {
  const points = Array.from({ length: 21 }, () => ({ x: .5, y: .78, z: 0 }));
  points[0] = { x: .5, y: .95, z: 0 };
  for (let finger = 0; finger < 4; finger++) {
    const base = 5 + finger * 4;
    const x = .35 + finger * .1;
    points[base] = { x, y: .7, z: 0 };
    points[base + 1] = { x, y: .5, z: 0 };
    points[base + 2] = { x: x + (extended[finger] ? 0 : .055), y: extended[finger] ? .36 : .55, z: 0 };
    points[base + 3] = { x: x + (extended[finger] ? 0 : .04), y: extended[finger] ? .22 : .69, z: 0 };
  }
  return points;
}

const transformed = (points, angle, flip = false) => points.map((p) => {
  const x = (p.x - .5) * (flip ? -1 : 1);
  const y = p.y - .5;
  return { x: .5 + x * Math.cos(angle) - y * Math.sin(angle), y: .5 + x * Math.sin(angle) + y * Math.cos(angle), z: 0 };
});

test('cover matches a landscape feed to a portrait screen without distortion', () => {
  const crop = coverGeometry(1280, 720, 390, 844);
  near(crop.height, 844);
  assert.ok(crop.width > 390);
  near(crop.offsetX, (390 - crop.width) / 2);
  near(crop.offsetY, 0);
});
test('cover crops vertically for a wide screen', () => {
  const crop = coverGeometry(640, 480, 1440, 800);
  near(crop.width, 1440);
  near(crop.height, 1080);
  near(crop.offsetY, -140);
});
test('cover rejects invalid or not-yet-ready video dimensions', () => {
  for (const n of [0, -1, NaN, Infinity]) assert.throws(() => coverGeometry(n, 720, 1280, 720), RangeError);
});
test('fingertip x is mirrored exactly once', () => {
  near(mirroredTip({ x: .2, y: .4 }, 1280, 720, 1280, 720).x, 1024);
  near(mirroredTip({ x: .2, y: .4 }, 1280, 720, 1280, 720).y, 288);
});
test('center fingertip remains centered across aspect ratios', () => {
  for (const [w, h] of [[390, 844], [1440, 900], [800, 800]]) {
    const p = mirroredTip({ x: .5, y: .5 }, 1280, 720, w, h);
    near(p.x, w / 2);
    near(p.y, h / 2);
  }
});
test('cropped-away fingertip stays offscreen instead of clamping into a false stroke', () => {
  assert.ok(mirroredTip({ x: 0, y: .5 }, 1280, 720, 390, 844).x > 390);
});
test('index-only pointing draws', () => assert.equal(gestureState(hand()), 'draw'));
test('an open hand pauses', () => assert.equal(gestureState(hand([true, true, true, true])), 'pause'));
test('a fist pauses', () => assert.equal(gestureState(hand([false, false, false, false])), 'pause'));
test('two fingers pause', () => assert.equal(gestureState(hand([true, true, false, false])), 'pause'));
test('either hand and rotated wrists support pointing', () => {
  for (const flip of [false, true]) {
    for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 3]) {
      assert.equal(gestureState(transformed(hand(), angle, flip)), 'draw');
      assert.equal(gestureState(transformed(hand([true, true, true, true]), angle, flip)), 'pause');
    }
  }
});
test('landmark geometry supports camera aspect correction', () => {
  const points = hand().map((p) => ({ ...p, x: .5 + (p.x - .5) / (16 / 9) }));
  assert.equal(gestureState(points, 16 / 9), 'draw');
});
test('missing, malformed, and degenerate hands pause safely', () => {
  for (const points of [undefined, [], hand().slice(0, 20), hand().map(() => ({ x: .5, y: .5 })), hand().map(() => ({ x: NaN, y: 0 }))]) {
    assert.equal(gestureState(points), 'pause');
  }
});
