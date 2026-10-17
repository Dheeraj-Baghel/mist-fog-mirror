// Deployment intent: publish only these four browser assets, never development
// files, test webcam screenshots, credentials, or the local Node server.
// No runtime packages or paid services are needed; camera inference stays local.
import { copyFile, mkdir, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const publicFiles = ['index.html', 'styles.css', 'app.js', 'geometry.js'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of publicFiles) {
  await copyFile(new URL(file, root), new URL(file, output));
}
console.log(`Built ${publicFiles.length} public assets into dist/ (no dependencies).`);
