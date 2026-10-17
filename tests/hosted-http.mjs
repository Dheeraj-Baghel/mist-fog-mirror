// Anonymous production checks: no Vercel login cookie or protection bypass token.
// Assert exact public asset bytes and that development/credential paths are absent.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const origin = new URL(process.env.MIST_URL || 'https://mist-fog-mirror-softtech10.vercel.app');
assert.equal(origin.protocol, 'https:');
const root = new URL('../', import.meta.url);
const output = new URL('artifacts/hosting/', root);
const results = [];
const publicFiles = ['index.html', 'styles.css', 'app.js', 'geometry.js'];
const privatePaths = ['.env', '.env.local', '.git/config', 'package.json', 'server.js', 'README.md', 'artifacts/testing/camera-clear.png', 'not-a-real-route'];
const headers = {
  'permissions-policy': 'camera=(self), microphone=(), geolocation=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

for (const name of [...publicFiles, ...privatePaths]) {
  const path = name === 'index.html' ? '/' : `/${name}`;
  try {
    const response = await fetch(new URL(path, origin), { redirect: 'error', signal: AbortSignal.timeout(20000) });
    const status = publicFiles.includes(name) ? 200 : 404;
    assert.equal(response.status, status, path);
    const observedHeaders = Object.fromEntries(Object.keys(headers).map((key) => [key, response.headers.get(key)]));
    if (status === 200) {
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(new URL(name, root)), `${path} differs from source`);
      assert.deepEqual(observedHeaders, headers, `${path} security headers`);
    } else {
      await response.arrayBuffer();
    }
    results.push({ path, status: response.status, passed: true, headers: observedHeaders });
    console.log(`PASS ${path}: HTTP ${response.status}`);
  } catch (error) {
    results.push({ path, passed: false, error: error.message });
    console.error(`FAIL ${path}: ${error.message}`);
    process.exitCode = 1;
  }
}
await mkdir(output, { recursive: true });
await writeFile(new URL('http-checks.json', output), JSON.stringify({ testedAt: new Date().toISOString(), origin: origin.origin, anonymous: true, results }, null, 2) + '\n');
assert.ok(results.every((result) => result.passed), 'One or more hosted HTTP checks failed');
console.log(`${results.length} hosted HTTP checks passed.`);
