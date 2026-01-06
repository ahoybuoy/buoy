import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/bin.ts'],
  format: ['esm'],
  dts: false, // Skip DTS for now due to MCP SDK module resolution
  clean: true,
  sourcemap: true,
  target: 'node18',
  shims: true,
});
