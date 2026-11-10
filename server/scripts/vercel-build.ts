/* eslint-disable no-console */
/**
 * npm run build:vercel  (run by Vercel after `npm --prefix client run build`)
 *
 * Writes a Vercel Build Output API v3 bundle to `<repo>/.vercel/output`:
 *   static/              the built React app (client/dist)
 *   functions/api.func/  the Express API bundled into one ES module
 *   config.json          routing: /api/* → the function, everything else → the SPA
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(serverRoot, '..');
const clientDist = path.join(repoRoot, 'client', 'dist');
const outputDir = path.join(repoRoot, '.vercel', 'output');
const functionDir = path.join(outputDir, 'functions', 'api.func');

async function main() {
  if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
    throw new Error('client/dist is missing. Run `npm --prefix client run build` first.');
  }

  fs.rmSync(outputDir, { recursive: true, force: true });

  // 1. Static website
  fs.cpSync(clientDist, path.join(outputDir, 'static'), { recursive: true });

  // 2. API function
  await build({
    entryPoints: [path.join(serverRoot, 'src', 'vercel.ts')],
    outfile: path.join(functionDir, 'index.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    legalComments: 'none',
    // Express and some of its dependencies are CommonJS and call require().
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    logLevel: 'warning',
  });
  fs.writeFileSync(
    path.join(functionDir, '.vc-config.json'),
    JSON.stringify(
      {
        runtime: 'nodejs22.x',
        handler: 'index.mjs',
        launcherType: 'Nodejs',
        shouldAddHelpers: false,
        maxDuration: 10,
      },
      null,
      2,
    ),
  );

  // 3. Routing
  fs.writeFileSync(
    path.join(outputDir, 'config.json'),
    JSON.stringify(
      {
        version: 3,
        routes: [
          {
            src: '^/assets/(.*)$',
            headers: { 'cache-control': 'public, max-age=31536000, immutable' },
            continue: true,
          },
          { src: '^/api(/.*)?$', dest: '/api' },
          { handle: 'filesystem' },
          { src: '^/(.*)$', dest: '/index.html' },
        ],
      },
      null,
      2,
    ),
  );

  const size = fs.statSync(path.join(functionDir, 'index.mjs')).size;
  console.log(`Vercel output written to ${path.relative(repoRoot, outputDir)}`);
  console.log(`  API bundle: ${(size / 1024).toFixed(0)} kB`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
