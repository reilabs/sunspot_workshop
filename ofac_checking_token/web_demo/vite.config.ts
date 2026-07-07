import { defineConfig } from 'vite';

const coopCoep = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  // `credentialless` (not `require-corp`) so wallet extensions inject.
  // Keeps `crossOriginIsolated=true` for the wasm prover's SharedArrayBuffer.
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  server: { headers: coopCoep },
  preview: { headers: coopCoep },
  // Trailing slash forces resolution to the npm `buffer` package instead of
  // vite's empty Node-builtin shim. Required for @solana/spl-token etc.
  resolve: { alias: { buffer: 'buffer/' } },
  optimizeDeps: {
    include: ['buffer'],
    exclude: ['@reilabs/sunspot_js'],
  },
  worker: {
    format: 'es',
  },
});
