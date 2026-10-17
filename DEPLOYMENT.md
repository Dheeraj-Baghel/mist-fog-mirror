# Mist - deployment

The user authorized pushing this app to GitHub and setting up Vercel deployment.
**[GitHub repository](https://github.com/Dheeraj-Baghel/mist-fog-mirror)** is now
private and published. Vercel's GitHub integration is connected to `main`.
**[Live Mist](https://mist-fog-mirror-softtech10.vercel.app)** is public, with this
project's Vercel authentication protection disabled. First deployment and hosted
verification passed on 2026-10-17; no Vercel login or bypass token was used for QA.

## Scope and build

- Publish only this independent app, not the containing Designer workspace.
- GitHub repository: `Dheeraj-Baghel/mist-fog-mirror`, branch `main`.
- Vercel project: `mist-fog-mirror-softtech10`, in the existing
  `softtech10` Hobby scope. Hobby is for personal/non-commercial use and is
  subject to its quotas; no paid upgrade, add-on, or domain purchase was made.
- Node.js 24.x; no production dependencies, secrets, database or server functions.
- Vercel install command `node --version` deliberately skips development-only
  package installation. `npm run build` uses only Node's standard library.
- [Build script](scripts/build.mjs) publishes only the page, styles and two
  JavaScript modules into the ignored build output directory.
- [Hosting configuration](vercel.json) preserves local camera permission policy,
  disables microphone/geolocation access, and forbids embedded frames.
- Local credentials, dependencies and Vercel link metadata are ignored by Git.
  Test artifacts and development guidance are excluded from deployment inputs.
- CLI linking generated a local `.env.local` OIDC token. That file is ignored
  by Git and deployment inputs; no application environment variables are needed.
- Other workspace applications and Vercel projects were not changed or uploaded.

## Privacy and verification boundaries

The site is public, but camera frames, inference and drawings stay in the browser.
There is no recording, account, drawing storage or upload implementation. Camera
access requires the user's click and browser permission. The model/runtime and
fonts are downloaded from Google/jsDelivr; these requests are not frame uploads.

The 13 geometry unit tests pass locally. Hosted checks used an explicitly
synthetic webcam, never the user's physical camera. Real hand accuracy, lighting,
physical devices and Safari remain user checks.

## Verified release

The first verified GitHub-triggered production deployment is commit
`9723e1794c5b7998fd267b62b1ad10707ce09f0a`, Vercel deployment
`dpl_5C5e58xGFMvdZPAAVDHv4yKLiw5q`. The API confirms `source: git`, branch `main`,
matching commit SHA, `READY` and production alias assignment. Later documentation
and QA-artifact commits do not change the four browser assets.

- Actual Vercel Linux build used Node 24.x, skipped package installation and
  copied exactly four public files. No server function or runtime dependency.
- **12/12 live browser checks passed:** desktop/mobile, actual transparent wipe,
  fog toggle, resize, real CDN/WASM/model startup with fake camera, camera stop,
  permission denial, touch, mirrored synthetic gestures, pause and lost-hand lift.
- No uncaught page errors or non-GET/HEAD upload requests in the recorded check.
- **12/12 anonymous HTTP checks passed:** exact public asset bytes, intended
  camera/security headers, and 404 for credentials, Git metadata, local server,
  development files, test screenshot and unknown routes.
- **13/13 unit tests**, static-output allowlist check and local build passed.
  `npm audit --omit=dev` reports zero vulnerabilities.
- Desktop and mobile screenshots were visually inspected after the live run.

Evidence:

- [Hosted browser results](artifacts/hosting/results.json)
- [Hosted HTTP results](artifacts/hosting/http-checks.json)
- [Desktop](artifacts/hosting/desktop.png) and [mobile](artifacts/hosting/mobile.png)

Reproduce from this repository with Node 24.x and installed Google Chrome:

```sh
npm ci
npm test
npm run build
MIST_URL=https://mist-fog-mirror-softtech10.vercel.app \
MIST_ARTIFACTS_DIR=../artifacts/hosting/ npm run test:browser
node tests/hosted-http.mjs
```

## Updates

1. Make app-local changes and run unit tests, build and browser checks.
2. Review `git status` and the diff. Commit only intended app-local files.
3. Push to `main`. Vercel's GitHub integration automatically builds production;
   this was observed, not merely configured. No GitHub Actions workflow is needed.
4. Recheck the stable live URL. A failed build leaves the previous successful
   production alias intact.

Use Vercel's deployment history to promote a known-good release, or revert the
source change and push to `main`. Do not delete/recreate unrelated projects.
Do not push the containing workspace or commit local credential files.
