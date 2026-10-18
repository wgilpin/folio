import * as path from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const workspaceDir =
  process.env.FOLIO_WORKSPACE ?? path.resolve(process.cwd(), 'workspace');

const app = createApp({ workspaceDir });

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Folio server listening on http://localhost:${info.port}`);
  }
);
