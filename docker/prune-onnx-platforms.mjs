// ONNX ships binaries for several operating systems in the same npm package.
// Keep the current build platform's CPU binaries and JavaScript unchanged.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { createRequire } from 'node:module';

const resolve = createRequire(path.join(process.cwd(), 'package.json')).resolve;
const packageDirectory = path.dirname(resolve('onnxruntime-node/package.json'));
const binaryDirectory = path.join(packageDirectory, 'bin', 'napi-v3');
const targetDirectory = path.join(binaryDirectory, process.platform, process.arch);
if (!fs.existsSync(path.join(targetDirectory, 'onnxruntime_binding.node'))) {
  throw new Error('Expected ONNX native binding is missing; refusing to prune');
}

for (const platform of fs.readdirSync(binaryDirectory, { withFileTypes: true })) {
  if (!platform.isDirectory()) continue;
  const platformDirectory = path.join(binaryDirectory, platform.name);
  if (platform.name !== process.platform) {
    fs.rmSync(platformDirectory, { recursive: true });
    continue;
  }
  for (const architecture of fs.readdirSync(platformDirectory, { withFileTypes: true })) {
    if (architecture.isDirectory() && architecture.name !== process.arch) {
      fs.rmSync(path.join(platformDirectory, architecture.name), { recursive: true });
    }
  }
}
console.log(`Kept ONNX native binaries for ${process.platform}/${process.arch}`);
