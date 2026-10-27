#!/usr/bin/env node

/**
 * Zero-dependency CLI helper for querying Folio across Macs (`https://folio.teleosis.ai` or localhost).
 *
 * Usage:
 *   node skills/folio/scripts/folio-query.mjs profile
 *   node skills/folio/scripts/folio-query.mjs search "<query>" [hybrid|fts|semantic]
 *   node skills/folio/scripts/folio-query.mjs docs
 *   node skills/folio/scripts/folio-query.mjs doc <docId>
 */

const baseUrl = (
  process.env.FOLIO_URL || 'https://folio.teleosis.ai'
).replace(/\/+$/, '');
const apiKey = (
  process.env.TELEOSIS_API_KEY ||
  process.env.FOLIO_API_KEY ||
  ''
).trim();

function buildHeaders() {
  const headers = { Accept: 'application/json' };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function fetchJson(pathname) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: 'GET',
    headers: buildHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} on ${pathname}: ${text}`);
  }
  return res.json();
}

const [, , command = 'profile', arg1 = '', arg2 = 'hybrid'] = process.argv;

async function main() {
  if (command === 'profile') {
    const data = await fetchJson('/api/profile');
    console.log(JSON.stringify(data.profile ?? data, null, 2));
    return;
  }

  if (command === 'search') {
    if (!arg1) {
      throw new Error('Usage: folio-query.mjs search "<query>" [hybrid|fts|semantic]');
    }
    const params = new URLSearchParams({
      q: arg1,
      mode: arg2,
      limit: '10',
    });
    const data = await fetchJson(`/api/search?${params.toString()}`);
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (command === 'docs') {
    const data = await fetchJson('/api/doc');
    console.log(
      JSON.stringify(
        {
          workspaceDir: data.workspaceDir,
          activeDocId: data.document?.id ?? null,
          documents: data.documents ?? {},
        },
        null,
        2
      )
    );
    return;
  }

  if (command === 'doc') {
    if (!arg1) {
      throw new Error('Usage: folio-query.mjs doc <docId>');
    }
    const data = await fetchJson(
      `/api/doc/${encodeURIComponent(arg1)}/markdown?clean=true`
    );
    console.log(`# ${data.title} (${data.doneCount}/${data.totalBlocks} blocks done)\n`);
    console.log(data.markdown);
    return;
  }

  throw new Error(
    `Unknown command "${command}". Expected one of: profile, search, docs, doc`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
