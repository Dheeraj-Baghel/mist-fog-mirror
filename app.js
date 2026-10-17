// Mist: a local-only camera mirror. MediaPipe runs hand inference in the browser.
// Video is never recorded or uploaded. CDN requests fetch code/model assets only.
import { coverGeometry, gestureState, mirroredTip } from './geometry.js';

const $ = (id) => document.getElementById(id);
const mirror = $('mirror');
const video = $('camera');
const fog = $('fog');
const droplets = $('condensation');
const ctx = fog.getContext('2d');
const dropCtx = droplets.getContext('2d');
const mask = document.createElement('canvas');
const maskCtx = mask.getContext('2d');
const frost = document.createElement('canvas');
const frostCtx = frost.getContext('2d');
const reflection = document.createElement('canvas');
const reflectionCtx = reflection.getContext('2d');
const dropTexture = document.createElement('canvas');
const dropTextureCtx = dropTexture.getContext('2d');
const grain = document.createElement('canvas');
const grainCtx = grain.getContext('2d');
const finger = $('finger');
const startButton = $('start-camera');
const cameraToggle = $('camera-toggle');
const fogToggle = $('fog-toggle');
const welcome = $('welcome');
const errorBox = $('error');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let width = 0;
let height = 0;
let ratio = 1;
let fogged = true;
let stream = null;
let tracker = null;
let trackerPromise = null;
let generation = 0;
let tracking = false;
let starting = false;
let pointerId = null;
let lastPoint = null;
let smoothTip = null;
let previousVideoTime = -1;
let lastPaint = 0;
let lastInference = 0;
let lastHandSeen = 0;
let gestureFrames = 0;
let dismissed = false;
let animationId = 0;
let resizeTimer;
let currentStatus = '';

function status(text, active = false) {
  if (currentStatus !== text) {
    $('status-text').textContent = text;
    currentStatus = text;
  }
  $('status-dot').classList.toggle('active', active);
}

function showError(text) {
  errorBox.textContent = text;
  errorBox.hidden = !text;
}

function dismissWelcome() {
  if (dismissed) return;
  dismissed = true;
  welcome.classList.add('dismissed');
  welcome.inert = true;
}

function hideFinger() {
  finger.classList.remove('visible', 'drawing');
  lastPoint = null;
}

function showFinger(point, drawing) {
  finger.style.transform = `translate3d(${point.x - 16}px, ${point.y - 16}px, 0)`;
  finger.classList.add('visible');
  finger.classList.toggle('drawing', drawing);
}

// The wipe mask persists between video frames. Feathering makes a wiped edge
// look like a fingertip clearing condensation, not a hard digital paintbrush.
function wipe(point, from = lastPoint, radius = 20) {
  if (!fogged) return;
  maskCtx.save();
  maskCtx.scale(ratio, ratio);
  maskCtx.strokeStyle = '#fff';
  maskCtx.fillStyle = '#fff';
  maskCtx.lineCap = 'round';
  maskCtx.lineJoin = 'round';
  maskCtx.lineWidth = radius * 2;
  maskCtx.shadowColor = '#fff';
  maskCtx.shadowBlur = 5;
  maskCtx.beginPath();
  if (from) {
    maskCtx.moveTo(from.x, from.y);
    maskCtx.lineTo(point.x, point.y);
    maskCtx.stroke();
  } else {
    maskCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    maskCtx.fill();
  }
  maskCtx.restore();
  lastPoint = point;
}

function createTexture() {
  grain.width = 192;
  grain.height = 192;
  const pixels = grainCtx.createImageData(grain.width, grain.height);
  let seed = 9173;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < pixels.data.length; i += 4) {
    const tone = Math.floor(140 + random() * 110);
    pixels.data[i] = tone;
    pixels.data[i + 1] = tone;
    pixels.data[i + 2] = tone - 8;
    pixels.data[i + 3] = Math.floor(random() * 30);
  }
  grainCtx.putImageData(pixels, 0, 0);
  frostCtx.clearRect(0, 0, width, height);
  const wash = frostCtx.createLinearGradient(0, 0, width, height);
  wash.addColorStop(0, 'rgba(179,191,177,.55)');
  wash.addColorStop(.45, 'rgba(173,188,174,.38)');
  wash.addColorStop(1, 'rgba(135,157,145,.57)');
  frostCtx.fillStyle = wash;
  frostCtx.fillRect(0, 0, width, height);
  for (let i = 0; i < 12; i++) {
    const x = random() * width;
    const y = random() * height;
    const r = Math.max(width, height) * (.15 + random() * .3);
    const cloud = frostCtx.createRadialGradient(x, y, 0, x, y, r);
    cloud.addColorStop(0, 'rgba(222,226,206,.08)');
    cloud.addColorStop(1, 'rgba(222,226,206,0)');
    frostCtx.fillStyle = cloud;
    frostCtx.fillRect(0, 0, width, height);
  }
  frostCtx.fillStyle = frostCtx.createPattern(grain, 'repeat');
  frostCtx.fillRect(0, 0, width, height);
  // Tiny, stable droplets and a few gravity trails; no distracting particle animation.
  dropTextureCtx.clearRect(0, 0, width, height);
  const count = Math.min(1500, Math.floor(width * height / 1100));
  for (let i = 0; i < count; i++) {
    const x = random() * width;
    const y = random() * height;
    const r = .35 + random() ** 3 * 2.7;
    dropTextureCtx.beginPath();
    dropTextureCtx.ellipse(x, y, r * .76, r, -.15, 0, Math.PI * 2);
    dropTextureCtx.fillStyle = `rgba(211,225,211,${.07 + random() * .2})`;
    dropTextureCtx.fill();
    dropTextureCtx.beginPath();
    dropTextureCtx.arc(x + r * .2, y + r * .3, r * .6, 0, Math.PI);
    dropTextureCtx.strokeStyle = 'rgba(15,35,30,.15)';
    dropTextureCtx.lineWidth = .6;
    dropTextureCtx.stroke();
    if (i % 71 === 0) {
      dropTextureCtx.beginPath();
      dropTextureCtx.moveTo(x, y);
      dropTextureCtx.bezierCurveTo(x - 1, y + 16, x + 2, y + 35, x, y + 50 + random() * 100);
      dropTextureCtx.strokeStyle = 'rgba(226,235,218,.09)';
      dropTextureCtx.lineWidth = .7;
      dropTextureCtx.stroke();
    }
  }
}

// A small hand-wiped botanical doodle on the welcome screen invites interaction.
function welcomeDoodle() {
  if (width < 760 || dismissed) return;
  const x = width * .753;
  const y = height * .46;
  const r = Math.min(86, width * .065);
  maskCtx.save();
  maskCtx.scale(ratio, ratio);
  maskCtx.lineWidth = 10;
  maskCtx.lineCap = 'round';
  maskCtx.lineJoin = 'round';
  maskCtx.strokeStyle = 'rgba(255,255,255,.75)';
  maskCtx.shadowBlur = 5;
  maskCtx.shadowColor = '#fff';
  maskCtx.beginPath();
  for (let i = 0; i <= 240; i++) {
    const theta = i / 240 * Math.PI * 2;
    const radial = r * (.76 + .23 * Math.cos(theta * 6));
    const px = x + Math.cos(theta) * radial;
    const py = y + Math.sin(theta) * radial;
    if (i === 0) maskCtx.moveTo(px, py);
    else maskCtx.lineTo(px, py);
  }
  maskCtx.stroke();
  maskCtx.beginPath();
  maskCtx.arc(x + 1, y, r * .25, 0, Math.PI * 2);
  maskCtx.stroke();
  maskCtx.beginPath();
  maskCtx.moveTo(x + 4, y + r * .9);
  maskCtx.bezierCurveTo(x + 16, y + r * 1.8, x - 27, y + r * 2, x - 20, y + r * 2.7);
  maskCtx.moveTo(x - 3, y + r * 1.7);
  maskCtx.bezierCurveTo(x - 65, y + r * 1.65, x - 73, y + r * 1.15, x - 10, y + r * 1.52);
  maskCtx.stroke();
  maskCtx.restore();
}

function resize() {
  const nextWidth = mirror.clientWidth;
  const nextHeight = mirror.clientHeight;
  if (nextWidth === width && nextHeight === height) return;
  const hadSize = width > 0 && height > 0;
  const oldMask = document.createElement('canvas');
  oldMask.width = mask.width;
  oldMask.height = mask.height;
  if (mask.width) oldMask.getContext('2d').drawImage(mask, 0, 0);
  width = nextWidth;
  height = nextHeight;
  ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  for (const canvas of [fog, droplets, mask]) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  for (const canvas of [frost, dropTexture]) {
    canvas.width = width;
    canvas.height = height;
  }
  reflection.width = Math.max(1, Math.ceil(width / 7));
  reflection.height = Math.max(1, Math.ceil(height / 7));
  createTexture();
  if (hadSize) maskCtx.drawImage(oldMask, 0, 0, mask.width, mask.height);
  else welcomeDoodle();
  lastPoint = null;
  smoothTip = null;
  paint();
}

function drawReflection() {
  const rw = reflection.width;
  const rh = reflection.height;
  reflectionCtx.clearRect(0, 0, rw, rh);
  if (stream && video.readyState >= 2) {
    const crop = coverGeometry(video.videoWidth, video.videoHeight, rw, rh);
    reflectionCtx.save();
    reflectionCtx.translate(rw, 0);
    reflectionCtx.scale(-1, 1);
    reflectionCtx.drawImage(video, crop.offsetX, crop.offsetY, crop.width, crop.height);
    reflectionCtx.restore();
  } else {
    const gradient = reflectionCtx.createLinearGradient(0, 0, rw, rh);
    gradient.addColorStop(0, '#354548');
    gradient.addColorStop(.45, '#58665b');
    gradient.addColorStop(1, '#253d36');
    reflectionCtx.fillStyle = gradient;
    reflectionCtx.fillRect(0, 0, rw, rh);
  }
}

function paint() {
  ctx.clearRect(0, 0, fog.width, fog.height);
  dropCtx.clearRect(0, 0, droplets.width, droplets.height);
  if (!fogged) return;
  drawReflection();
  ctx.save();
  ctx.scale(ratio, ratio);
  ctx.filter = 'blur(12px) saturate(65%)';
  ctx.drawImage(reflection, -20, -20, width + 40, height + 40);
  ctx.filter = 'none';
  ctx.drawImage(frost, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(mask, 0, 0);
  ctx.restore();
  dropCtx.drawImage(dropTexture, 0, 0, droplets.width, droplets.height);
  dropCtx.save();
  dropCtx.globalCompositeOperation = 'destination-out';
  dropCtx.drawImage(mask, 0, 0);
  dropCtx.restore();
}

function setFog(value) {
  fogged = value;
  mirror.classList.toggle('clear', !fogged);
  fogToggle.setAttribute('aria-pressed', String(fogged));
  $('fog-label').textContent = fogged ? 'Defog mirror' : 'Fog mirror';
  maskCtx.clearRect(0, 0, mask.width, mask.height);
  lastPoint = null;
  gestureFrames = 0;
  finger.classList.remove('drawing');
  paint();
  if (!fogged) status('Mirror cleared. Fog it again for a fresh canvas.');
  else if (tracking) status('Raise your index finger to draw.', true);
  else status('Fresh fog. Draw with your mouse or touch.');
}

function releasePointer() {
  if (pointerId !== null && mirror.hasPointerCapture?.(pointerId)) mirror.releasePointerCapture(pointerId);
  pointerId = null;
  hideFinger();
}

mirror.addEventListener('pointerdown', (event) => {
  if (event.target.closest('button, a, .topbar, .controls, .welcome, .error, .status-pill')) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (!fogged || pointerId !== null) return;
  dismissWelcome();
  pointerId = event.pointerId;
  mirror.setPointerCapture(pointerId);
  lastPoint = null;
  const point = { x: event.clientX, y: event.clientY };
  wipe(point);
  showFinger(point, true);
  status('A little mark, just for this moment.', true);
  paint();
});
mirror.addEventListener('pointermove', (event) => {
  if (event.pointerId !== pointerId) return;
  const point = { x: event.clientX, y: event.clientY };
  wipe(point);
  showFinger(point, true);
  paint();
});
mirror.addEventListener('pointerup', releasePointer);
mirror.addEventListener('pointercancel', releasePointer);
mirror.addEventListener('lostpointercapture', () => { pointerId = null; hideFinger(); });
fogToggle.addEventListener('click', () => setFog(!fogged));

async function loadTracker() {
  if (tracker) return tracker;
  if (!trackerPromise) {
    trackerPromise = (async () => {
      const { HandLandmarker, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/+esm');
      const fileset = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
      const baseOptions = {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      };
      const options = {
        baseOptions: { ...baseOptions, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: .6,
        minHandPresenceConfidence: .6,
        minTrackingConfidence: .6,
      };
      try {
        tracker = await HandLandmarker.createFromOptions(fileset, options);
      } catch {
        tracker = await HandLandmarker.createFromOptions(fileset, { ...options, baseOptions: { ...baseOptions, delegate: 'CPU' } });
      }
      return tracker;
    })().catch((error) => { trackerPromise = null; throw error; });
  }
  return trackerPromise;
}

function updateCameraUI() {
  const on = Boolean(stream);
  mirror.classList.toggle('camera-on', on);
  $('camera-indicator').textContent = on ? 'camera on · local only' : 'camera off';
  cameraToggle.textContent = on ? 'Turn camera off' : 'Enable camera';
  cameraToggle.setAttribute('aria-label', on ? 'Turn camera off' : 'Enable camera');
  cameraToggle.title = on ? 'Stop the camera and hand tracking' : 'Enable the mirror and hand tracking';
  startButton.disabled = starting;
  startButton.firstChild.textContent = starting ? 'Opening camera… ' : 'Enable mirror ';
}

async function startCamera() {
  if (starting || stream) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    showError('Camera access needs localhost or an HTTPS address. Start the local server described in the guide. Mouse and touch still work.');
    status('Camera unavailable here. You can still draw with mouse or touch.');
    return;
  }
  const token = ++generation;
  starting = true;
  showError('');
  updateCameraUI();
  status('Waiting for camera permission…');
  try {
    const nextStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
      audio: false,
    });
    if (token !== generation) { nextStream.getTracks().forEach((track) => track.stop()); return; }
    stream = nextStream;
    video.srcObject = stream;
    await video.play();
    if (token !== generation) return;
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (token !== generation || !stream) return;
      stopCamera();
      showError('The camera disconnected. Reconnect it and enable the mirror again.');
    }, { once: true });
    starting = false;
    updateCameraUI();
    dismissWelcome();
    // Start with a completely fresh fog layer, not the decorative welcome doodle.
    maskCtx.clearRect(0, 0, mask.width, mask.height);
    lastPoint = null;
    status('Mirror ready. Loading on-device hand tracking…', true);
    try {
      await loadTracker();
      if (token !== generation || !stream) return;
      tracking = true;
      previousVideoTime = -1;
      lastHandSeen = performance.now();
      status(fogged ? 'Raise one index finger to draw · open hand to pause' : 'Mirror cleared. Fog it to start drawing.', true);
    } catch (error) {
      if (token !== generation) return;
      console.warn('Hand tracking could not load:', error);
      showError('Your mirror is working, but hand tracking could not load. Check your internet connection, then turn the camera off and on to retry. You can draw with your mouse or touch.');
      status('Camera on · mouse and touch drawing available.', true);
    }
  } catch (error) {
    if (token !== generation) return;
    stopCamera();
    const messages = {
      NotAllowedError: 'Camera permission was denied. Allow camera access in your browser’s address bar and macOS System Settings → Privacy & Security → Camera, then try again.',
      NotFoundError: 'No camera was found. Connect a webcam or enable your Mac’s built-in camera, then try again.',
      NotReadableError: 'Your camera may be in use by another app. Close that app and try again.',
      AbortError: 'The camera could not start. Please try again.',
      SecurityError: 'Your browser blocked camera access. Use localhost or HTTPS and check camera permissions.',
    };
    showError(`${messages[error.name] || 'The camera could not start. Check camera permissions and try again.'} Mouse and touch still work.`);
    status('Camera not connected · mouse and touch are ready.');
  } finally {
    if (token === generation) { starting = false; updateCameraUI(); }
  }
}

function stopCamera() {
  generation++;
  tracking = false;
  starting = false;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.pause();
  video.srcObject = null;
  smoothTip = null;
  gestureFrames = 0;
  previousVideoTime = -1;
  hideFinger();
  updateCameraUI();
  showError('');
  status('Camera off. Draw with your mouse or touch.');
  paint();
}

function trackHand(now) {
  if (!tracking || !tracker || !stream || video.readyState < 2 || pointerId !== null) return;
  if (video.currentTime === previousVideoTime || now - lastInference < 40) return;
  previousVideoTime = video.currentTime;
  lastInference = now;
  let result;
  try {
    result = tracker.detectForVideo(video, now);
  } catch (error) {
    console.warn('Hand tracking paused:', error);
    tracking = false;
    hideFinger();
    showError('Hand tracking stopped. Turn the camera off and on to retry. Mouse and touch drawing still work.');
    status('Camera on · draw with mouse or touch.', true);
    return;
  }
  const landmarks = result.landmarks?.[0];
  if (!landmarks) {
    gestureFrames = 0;
    smoothTip = null;
    hideFinger();
    if (fogged && now - lastHandSeen > 900) status('Show one hand with your index finger raised.', true);
    return;
  }
  lastHandSeen = now;
  const tip = mirroredTip(landmarks[8], video.videoWidth, video.videoHeight, width, height);
  if (tip.x < 0 || tip.x > width || tip.y < 0 || tip.y > height) {
    gestureFrames = 0;
    smoothTip = null;
    hideFinger();
    status('Bring your fingertip into the mirror.', true);
    return;
  }
  smoothTip = smoothTip ? { x: smoothTip.x + (tip.x - smoothTip.x) * .48, y: smoothTip.y + (tip.y - smoothTip.y) * .48 } : tip;
  const gesture = gestureState(landmarks, video.videoWidth / video.videoHeight);
  if (gesture === 'draw' && fogged) gestureFrames++;
  else gestureFrames = 0;
  const drawing = gestureFrames >= 2 && fogged;
  showFinger(smoothTip, drawing);
  if (drawing) {
    // Do not connect a new gesture to the previous stroke across an open-hand pause.
    if (gestureFrames === 2) lastPoint = null;
    // Tracking glitches must never leave a long accidental slash.
    if (lastPoint && Math.hypot(smoothTip.x - lastPoint.x, smoothTip.y - lastPoint.y) > Math.min(width, height) * .22) lastPoint = null;
    wipe({ ...smoothTip }, lastPoint, Math.max(13, Math.min(22, width * .014)));
    status('Drawing · open your hand to lift your finger', true);
  } else {
    lastPoint = null;
    status(!fogged ? 'Mirror cleared. Fog it to draw again.' : gesture === 'draw' ? 'Hold your finger up…' : 'Paused · raise only your index finger to draw', true);
  }
}

function frame(now) {
  if (!document.hidden) {
    trackHand(now);
    if (stream && now - lastPaint > (reducedMotion ? 66 : 40)) {
      paint();
      lastPaint = now;
    }
  }
  animationId = requestAnimationFrame(frame);
}

startButton.addEventListener('click', startCamera);
cameraToggle.addEventListener('click', () => { if (stream || starting) stopCamera(); else startCamera(); });
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 100);
});
window.addEventListener('blur', () => { releasePointer(); gestureFrames = 0; smoothTip = null; });
document.addEventListener('visibilitychange', () => {
  releasePointer();
  gestureFrames = 0;
  smoothTip = null;
});
window.addEventListener('pagehide', () => {
  stopCamera();
  cancelAnimationFrame(animationId);
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) animationId = requestAnimationFrame(frame);
});
resize();
updateCameraUI();
status('You can also draw with your mouse or touch.');
animationId = requestAnimationFrame(frame);
