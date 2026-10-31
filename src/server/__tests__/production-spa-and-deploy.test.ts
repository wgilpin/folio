import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { WorkspaceStore } from '../store.js';

describe('Epic 01 — Production SPA Server, Raw Markdown Endpoint, OrbStack Container & Caddy Auth Config', () => {
  let workspaceDir: string;
  let clientDistDir: string;

  beforeEach(async () => {
    workspaceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'folio-prod-spa-ws-')
    );
    clientDistDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'folio-prod-spa-dist-')
    );
  });

  afterEach(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
    await fs.rm(clientDistDir, { recursive: true, force: true });
  });

  it('serves compiled SPA assets, GET /api/health, GET /api/doc/:id/markdown, and enforces optional bearer token auth', async () => {
    // Prepare fixture SPA assets in clientDistDir
    await fs.writeFile(
      path.join(clientDistDir, 'index.html'),
      '<!doctype html><html><head><link rel="manifest" href="/manifest.json" /></head><body><div id="root">Folio SPA</div></body></html>',
      'utf8'
    );
    await fs.writeFile(
      path.join(clientDistDir, 'manifest.json'),
      JSON.stringify({
        name: 'Folio — Concept-Block Notebook',
        short_name: 'Folio',
        start_url: '/',
        display: 'standalone',
        background_color: '#FAF8F5',
        theme_color: '#18181B',
      }),
      'utf8'
    );

    // Seed a document in workspaceDir
    const store = new WorkspaceStore(workspaceDir);
    const seeded = await store.seedRootDocument({
      title: 'Hamiltonian Mechanics',
      shortTitle: 'Hamiltonian Mechanics',
      blocks: [
        '## Prerequisites & Orientation\n\n- Classical Lagrangian Mechanics',
        '## Phase Space & Canonical Coordinates\n\nHamiltonian mechanics formulates dynamics on $(q, p)$ phase space.',
      ],
    });
    const docId = seeded.document!.id;
    expect(docId).toBe('hamiltonian-mechanics');
    await store.setBlockDone(seeded.blocks[1]!.id, true, docId);

    const app = createApp({
      workspaceDir,
      clientDistDir,
      apiKey: 'secret-token',
    });

    // 1. GET /api/health is always public (no token required)
    const healthRes = await app.request('/api/health');
    expect(healthRes.status).toBe(200);
    expect(await healthRes.json()).toEqual({ status: 'ok' });

    // 2. GET /api/doc/hamiltonian-mechanics/markdown without auth returns 401
    const unauthRes = await app.request(
      `/api/doc/${docId}/markdown`
    );
    expect(unauthRes.status).toBe(401);
    expect(await unauthRes.json()).toEqual({ error: 'Unauthorized' });

    // Wrong token also returns 401
    const wrongTokenRes = await app.request(
      `/api/doc/${docId}/markdown`,
      {
        headers: { Authorization: 'Bearer wrong-token' },
      }
    );
    expect(wrongTokenRes.status).toBe(401);

    // 3. Called with Authorization: Bearer secret-token returns 200 with raw & clean markdown
    const bearerRes = await app.request(
      `/api/doc/${docId}/markdown?clean=true`,
      {
        headers: { Authorization: 'Bearer secret-token' },
      }
    );
    expect(bearerRes.status).toBe(200);
    const bearerJson = await bearerRes.json();
    expect(bearerJson.docId).toBe('hamiltonian-mechanics');
    expect(bearerJson.title).toBe('Hamiltonian Mechanics');
    expect(bearerJson.filename).toBe('hamiltonian-mechanics.md');
    expect(bearerJson.markdown).toContain('## Phase Space & Canonical Coordinates');
    expect(bearerJson.markdown).not.toContain('<!-- folio:block');
    expect(bearerJson.doneCount).toBe(1);
    expect(bearerJson.totalBlocks).toBe(2);

    // 4. Called with Remote-User header (tinyauth forward_auth) also succeeds
    const proxyRes = await app.request(
      `/api/doc/markdown?id=${docId}`,
      {
        headers: { 'Remote-User': 'will' },
      }
    );
    expect(proxyRes.status).toBe(200);
    const proxyJson = await proxyRes.json();
    expect(proxyJson.docId).toBe('hamiltonian-mechanics');
    expect(proxyJson.markdown).toContain('<!-- folio:block');

    // 5. Static SPA assets and fallback from clientDistDir (no API auth required for static assets)
    const rootRes = await app.request('/');
    expect(rootRes.status).toBe(200);
    expect(rootRes.headers.get('content-type')).toContain('text/html');
    expect(await rootRes.text()).toContain('Folio SPA');

    const manifestRes = await app.request('/manifest.json');
    expect(manifestRes.status).toBe(200);
    expect(manifestRes.headers.get('content-type')).toContain('application/json');
    const manifestJson = await manifestRes.json();
    expect(manifestJson.short_name).toBe('Folio');

    // SPA client routing fallback for non-API route
    const fallbackRes = await app.request('/notebook/hamiltonian-mechanics');
    expect(fallbackRes.status).toBe(200);
    expect(fallbackRes.headers.get('content-type')).toContain('text/html');
    expect(await fallbackRes.text()).toContain('Folio SPA');
  });

  it('validates OrbStack Dockerfile, docker-compose.yml web-routing config, and Caddy tinyauth + bearer bypass config', async () => {
    const repoRoot = path.resolve(import.meta.dirname, '../../..');

    const dockerfile = await fs.readFile(
      path.join(repoRoot, 'Dockerfile'),
      'utf8'
    );
    expect(dockerfile).toContain('FROM node:24-alpine');
    expect(dockerfile).toContain('npm run build');
    expect(dockerfile).toContain('4321');

    const compose = await fs.readFile(
      path.join(repoRoot, 'docker-compose.yml'),
      'utf8'
    );
    expect(compose).toContain('container_name: folio');
    expect(compose).toContain('127.0.0.1:4321:4321');
    expect(compose).toContain('web-routing');
    expect(compose).toContain('external: true');
    expect(compose).toContain('FOLIO_WORKSPACE=/root/.folio');
    expect(compose).toContain('TELEOSIS_API_KEY');

    const caddyfile = await fs.readFile(
      path.join(repoRoot, 'deploy/caddy/Caddyfile.folio'),
      'utf8'
    );
    expect(caddyfile).toContain('(protected)');
    expect(caddyfile).toContain('request_header -Remote-User');
    expect(caddyfile).toContain('not header Authorization "Bearer {$TELEOSIS_API_KEY}"');
    expect(caddyfile).toContain('forward_auth @browser tinyauth:3000');
    expect(caddyfile).toContain('uri /api/auth/caddy');
    expect(caddyfile).toContain('http://folio.teleosis.ai');
    expect(caddyfile).toContain('name folio');
    expect(caddyfile).toContain('port 4321');
    expect(caddyfile).toContain('refresh 10s');

    const tinyauthCompose = await fs.readFile(
      path.join(repoRoot, 'deploy/caddy/docker-compose.tinyauth.yml'),
      'utf8'
    );
    expect(tinyauthCompose).toContain('ghcr.io/steveiliop56/tinyauth:v3');
    expect(tinyauthCompose).toContain('container_name: tinyauth');
    expect(tinyauthCompose).toContain('https://auth.teleosis.ai');
    expect(tinyauthCompose).toContain('web-routing');

    const repoIndexHtml = await fs.readFile(
      path.join(repoRoot, 'index.html'),
      'utf8'
    );
    expect(repoIndexHtml).toContain('rel="manifest" href="/manifest.json"');

    const repoManifest = JSON.parse(
      await fs.readFile(path.join(repoRoot, 'public/manifest.json'), 'utf8')
    );
    expect(repoManifest.short_name).toBe('Folio');
    expect(repoManifest.display).toBe('standalone');
  });
});
