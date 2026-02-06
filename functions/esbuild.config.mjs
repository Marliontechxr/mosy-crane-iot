// =============================================================================
// MOSY — esbuild config for Azure Functions
// Bundles all function code + workspace deps into a single dist/index.js
// =============================================================================

import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  minify: false,
  // Keep Azure SDKs external (they use CJS require() for Node builtins like 'net')
  // Deploy script installs these via npm (flat node_modules) for Azure compatibility
  external: [
    '@azure/functions',
    '@azure/cosmos',
    '@azure/storage-blob',
    '@azure/communication-sms',
    '@azure/identity',
    '@azure/web-pubsub-client',
    'pdfkit',
  ],
  banner: {
    js: '// MOSY Azure Functions — bundled with esbuild',
  },
});

console.log('Build complete: dist/index.js');
