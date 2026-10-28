import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  // Workspace and schema code is bundled; `ws` and the MCP SDK stay real dependencies.
  noExternal: ['@autochrome/shared', 'zod'],
});
