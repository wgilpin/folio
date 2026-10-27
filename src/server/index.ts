import * as fs from 'node:fs';
import * as path from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { LearnerProfileStore } from './profile.js';

try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional if environment variables are already set
}

const hostname = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 4321);
const profile = await new LearnerProfileStore().loadProfile();
const workspaceDir =
  process.env.FOLIO_WORKSPACE ??
  profile.workspaceDir ??
  path.resolve(process.cwd(), 'workspace');

const candidateDistDir =
  process.env.FOLIO_CLIENT_DIST ?? path.resolve(process.cwd(), 'dist');
const clientDistDir = fs.existsSync(path.join(candidateDistDir, 'index.html'))
  ? candidateDistDir
  : undefined;

const app = createApp({
  workspaceDir,
  ...(clientDistDir ? { clientDistDir } : {}),
  ...(process.env.FOLIO_API_KEY ? { apiKey: process.env.FOLIO_API_KEY } : {}),
});

serve(
  {
    fetch: app.fetch,
    hostname,
    port,
  },
  (info) => {
    console.log(
      `Folio server listening on http://${hostname}:${info.port}`
    );
  }
);
