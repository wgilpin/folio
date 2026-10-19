import * as path from 'node:path';
import { getRequestListener } from '@hono/node-server';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { createApp } from './src/server/app.js';

try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional if environment variables are already set
}

function folioApiPlugin(): Plugin {
  return {
    name: 'folio-hono-api',
    configureServer(server) {
      const workspaceDir =
        process.env.FOLIO_WORKSPACE ?? path.resolve(process.cwd(), 'workspace');
      const app = createApp({ workspaceDir });
      const listener = getRequestListener(app.fetch);

      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api')) {
          void listener(req, res);
          return;
        }
        next();
      });
    },
  };
}

const port = Number(process.env.PORT ?? 4321);

export default defineConfig({
  plugins: [react(), folioApiPlugin()],
  server: {
    host: '127.0.0.1',
    port,
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/client/__tests__/setup.ts'],
  },
});
