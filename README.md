# Mist — a foggy mirror

A full-screen website that turns the Mac camera into a mirrored reflection behind
soft condensation. **Raise only your index finger to wipe/draw; open your hand to
pause.** One **Defog mirror / Fog mirror** button clears the view or restores fresh
fog. Mouse dragging and touch work without a camera.

## Open it

**[Open live Mist](https://mist-fog-mirror-softtech10.vercel.app)** in a normal
browser tab and allow camera access after clicking **Enable mirror**.
**[GitHub source](https://github.com/Dheeraj-Baghel/mist-fog-mirror)** is private.
Vercel automatically deploys pushes to `main`; the Git-triggered production build
and live checks passed. See [deployment and safe updates](DEPLOYMENT.md).

The local development address is **http://127.0.0.1:4321**.

To restart, use Node.js 24.x in this folder:

```sh
npm start
```

There are no runtime npm dependencies; local use needs no build step. Vercel runs
`npm run build` to copy only the four public assets. Do not double-click the HTML
as a file: browser ES modules and webcam permissions need a local web server or
HTTPS. The development server binds to this Mac only by default; production
publishes an allowlisted static build, not this local Node server.

1. Open the local address in Chrome on your Mac.
2. Click **Enable mirror** and allow the browser's camera permission.
3. Keep your hand visible, with the palm generally facing the camera. Raise your
   index finger and curl the other three fingers to draw. Move slowly at first.
4. Open your hand to lift the pen and reposition; raise only the index finger to
   start the next stroke. Either hand works.
5. **Defog mirror** reveals the whole live mirror. **Fog mirror** restores an
   unmarked fog layer. Previous strokes are intentionally discarded.
6. **Turn camera off** stops the media tracks. Mouse/touch remains available.

Bright, even lighting and a visible, unobstructed hand help detection. The drawing
cursor follows the mirrored fingertip, including the video's `object-fit: cover`
crop on tall or wide screens. Very fast jumps and offscreen tips do not create
long accidental connecting strokes.

## Privacy and permissions

- All camera processing happens in the browser. No video recording, upload,
  account, analytics, or drawing storage is implemented.
- The camera is requested only after a click, without microphone access.
- Google MediaPipe Tasks Vision **0.10.21**, its WASM runtime, and Google's hand
  landmark model are downloaded when the camera is enabled. Google Fonts loads
  the typography. These asset requests need internet; camera frames are not sent.
- GPU inference falls back to CPU if initialization fails. If tracking cannot
  load, the live mirror and mouse/touch mode still work and show an honest error.
- Disable the camera using the visible control. Leaving/reloading the page also
  stops the stream. Camera use remains visible in the page and browser indicators.
- If blocked, check browser site permissions and macOS **System Settings → Privacy
  & Security → Camera**. A browser embed may block cameras; use a normal tab.

## Design and implementation

- [Page](index.html), [styles](styles.css), [behavior](app.js), and
  [coordinate/gesture helpers](geometry.js).
- A low-resolution, blurred copy of the mirrored live video forms the fog, with
  seeded grain, droplets, and subtle gravity trails. A persistent alpha mask
  removes fog to reveal the sharp video, instead of painting a colored line.
- High-DPI canvases are capped at 1.5×. Inference is capped at 25 Hz, animation
  pauses while hidden, and the static camera-off scene does not redraw endlessly.
- The backdrop flower is a welcome illustration, not a detected camera gesture;
  enabling the mirror clears it. There is no fake reflection presented as camera
  footage. Camera off is explicitly labeled.
- Resizing scales existing marks. Nothing is saved after a reload.
- Semantic controls, visible focus rings, polite status announcements, a camera
  kill switch, reduced-motion support, and a mobile layout are included.

## Verification

```sh
npm install
npm test
# With npm start running in another terminal:
npm run test:browser
```

**13 unit tests and 12 Chrome browser checks passed.** Browser checks cover true
alpha erasure, fog reset, preserved drawing on resize, mobile touch, permission
failure fallback, explicit camera shutdown, mirrored coordinates, gesture/pause
integration, and absence of upload requests/uncaught exceptions. The real
MediaPipe CDN module, WASM, model, and camera API initialize successfully.

**Boundaries:** the automated camera is Chrome's synthetic webcam, not the Mac's
physical camera. Deterministic synthetic landmarks separately test stroke and
pause integration; those do not prove real-person tracking accuracy. Real hand
feel/lighting, the user's native permission prompt, and Safari remain user checks.

- [Full browser results](artifacts/testing/results.json)
- [Desktop preview](artifacts/testing/desktop.png)
- [Mobile preview](artifacts/testing/mobile.png)
- [Fogged synthetic camera](artifacts/testing/camera-fogged.png)
- [Clear synthetic camera](artifacts/testing/camera-clear.png)

**Hosted release (2026-10-17):** all 12 Chrome browser checks passed again against
the anonymous HTTPS production URL, including real MediaPipe startup with a
synthetic webcam. All 12 HTTP checks passed: public asset bytes match the source,
camera/security headers are present, and development/credential/test-artifact
paths return 404. The production dependency audit has zero vulnerabilities.
See [hosted browser results](artifacts/hosting/results.json),
[HTTP results](artifacts/hosting/http-checks.json),
[hosted desktop](artifacts/hosting/desktop.png), and
[hosted mobile](artifacts/hosting/mobile.png). Physical camera/hand quality and
Safari still need user testing.

The user authorized GitHub and Vercel publication. No paid API, hosting upgrade
or physical camera capture is part of deployment. Camera frames and drawings
remain on-device on the hosted site too.
