// Pure helpers shared by the mirror and unit tests. All display coordinates are
// CSS pixels, independent of the high-DPI fog canvas backing resolution.
export function coverGeometry(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every((n) => Number.isFinite(n) && n > 0)) {
    throw new RangeError('Cover geometry requires positive, finite dimensions.');
  }
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { width, height, offsetX: (targetWidth - width) / 2, offsetY: (targetHeight - height) / 2, scale };
}

export function mirroredTip(tip, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const crop = coverGeometry(sourceWidth, sourceHeight, targetWidth, targetHeight);
  return { x: crop.offsetX + (1 - tip.x) * crop.width, y: crop.offsetY + tip.y * crop.height };
}

const distance = (a, b, aspect) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);

function jointAngle(a, b, c, aspect) {
  const ux = (a.x - b.x) * aspect;
  const uy = a.y - b.y;
  const vx = (c.x - b.x) * aspect;
  const vy = c.y - b.y;
  const length = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (length < 1e-9) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / length))) * 180 / Math.PI;
}

export function fingerExtended(landmarks, mcp, pip, dip, tip, aspect = 1) {
  const wrist = landmarks[0];
  return jointAngle(landmarks[mcp], landmarks[pip], landmarks[dip], aspect) > 150
    && jointAngle(landmarks[pip], landmarks[dip], landmarks[tip], aspect) > 145
    && distance(wrist, landmarks[tip], aspect) > distance(wrist, landmarks[pip], aspect) * 1.12;
}

// Distance + joint-angle checks work for either hand and rotated wrists; they
// deliberately avoid the fragile "tip.y < joint.y" vertical-only shortcut.
export function gestureState(landmarks, aspect = 1) {
  if (!landmarks || landmarks.length < 21 || landmarks.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return 'pause';
  const index = fingerExtended(landmarks, 5, 6, 7, 8, aspect);
  const middle = fingerExtended(landmarks, 9, 10, 11, 12, aspect);
  const ring = fingerExtended(landmarks, 13, 14, 15, 16, aspect);
  const little = fingerExtended(landmarks, 17, 18, 19, 20, aspect);
  return index && !middle && !ring && !little ? 'draw' : 'pause';
}
