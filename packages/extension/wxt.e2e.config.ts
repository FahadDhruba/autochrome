import { defineConfig } from 'wxt';
import base from './wxt.config';

// `pnpm test:e2e` builds with `--mode e2e`, which keeps the test hooks (see src/schedules/testHook.ts)
// that production builds leave out, into a folder of its own so `.output` stays the real build.
// Vite treats any mode but `production` as development (React's dev build, which runs effects
// twice), so NODE_ENV is pinned to what the shipped extension uses.
process.env.NODE_ENV = 'production';

export default defineConfig({ ...base, outDir: '.output-e2e' });
