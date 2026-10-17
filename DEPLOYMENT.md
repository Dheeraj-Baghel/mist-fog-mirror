# Mist - deployment

The user authorized pushing this app to GitHub and setting up Vercel deployment.
**[GitHub repository](https://github.com/Dheeraj-Baghel/mist-fog-mirror)** is now
private and published. Vercel's GitHub integration is connected to `main`.
The production website will be public, with this project's Vercel authentication
protection disabled. First deployment and hosted verification are in progress,
not yet confirmed.

## Scope and build

- Publish only this independent app, not the containing Designer workspace.
- GitHub repository: `Dheeraj-Baghel/mist-fog-mirror`, branch `main`.
- Vercel project: `mist-fog-mirror-softtech10`, in the existing
  `softtech10` Hobby scope. Hobby is for personal/non-commercial use and is
  subject to its quotas; no paid upgrade, add-on, or domain purchase is planned.
- Node.js 24.x; no production dependencies, secrets, database or server functions.
- Vercel install command `node --version` deliberately skips development-only
  package installation. `npm run build` uses only Node's standard library.
- [Build script](scripts/build.mjs) publishes only the page, styles and two
  JavaScript modules into the ignored build output directory.
- [Hosting configuration](vercel.json) preserves local camera permission policy,
  disables microphone/geolocation access, and forbids embedded frames.
- Local credentials, dependencies and Vercel link metadata are ignored by Git.
  Test artifacts and development guidance are excluded from deployment inputs.

## Privacy and verification boundaries

The site is public, but camera frames, inference and drawings stay in the browser.
There is no recording, account, drawing storage or upload implementation. Camera
access requires the user's click and browser permission. The model/runtime and
fonts are downloaded from Google/jsDelivr; these requests are not frame uploads.

The 13 geometry unit tests pass locally before publication. Hosted checks will use
an explicitly synthetic webcam, never the user's physical camera. Real hand
accuracy, lighting, physical devices and Safari remain user checks.

## Updates

The GitHub integration is configured; this push will verify an automatic build
from `main`. Run unit tests, build and browser checks before future pushes.
A failed build should leave the previous successful production alias intact.
Do not push the containing workspace or commit local credential files.
