import * as path from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { LearnerProfileStore } from './profile.js';

try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional if environment variables are already set
}

const port = Number(process.env.PORT ?? 4321);
const profile = await new LearnerProfileStore().loadProfile();
const workspaceDir =
  process.env.FOLIO_WORKSPACE ??
  profile.workspaceDir ??
  path.resolve(process.cwd(), 'workspace');

const app = createApp({ workspaceDir });

serve(
  {
    fetch: app.fetch,
    hostname: '127.0.0.1',
    port,
  },
  (info) => {
    console.log(`Folio server listening on http://127.0.0.1:${info.port}`);
  }
);
