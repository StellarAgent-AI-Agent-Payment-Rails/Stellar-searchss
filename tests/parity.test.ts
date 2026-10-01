import { test, describe, before, after, assert } from 'node:assert';
import http, { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app';
import handler from '../api/index';

type ParityCase = {
  name: string;
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
};

const cases: ParityCase[] = [
  { name: 'health happy path', method: 'GET', path: '/health' },
  { name: 'search happy path', method: 'GET', path: '/api/search?q=Stellar+blockchain' },
  { name: 'search missing query', method: 'GET', path: '/api/search' },
  { name: 'search empty query', method: 'GET', path: '/api/search?q=' },
  { name: 'suggestions happy path', method: 'GET', path: '/api/suggestions?q=stellar' },
  { name: 'suggestions missing query', method: 'GET', path: '/api/suggestions' },
  { name: 'unknown route', method: 'GET', path: '/definitely-not-a-route' },
  {
    name: 'post search with body',
    method: 'POST',
    path: '/api/search',
    body: { q: 'Stellar blockchain' },
    headers: { 'content-type': 'application/json' },
  },
  {
    name: 'post search with invalid json',
    method: 'POST',
    path: '/api/search',
    body: '{ not json',
    headers: { 'content-type': 'application/json' },
  },
];

interface ResponseSnapshot {
  status: number;
  body: unknown;
}

function normalizeBody(raw: string, contentType: string | undefined): unknown {
  if (contentType && contentType.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  if (raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function listen(server: Server): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to bind test server'));
        return;
      }
      resolve(addr);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function callExpress(
  baseUrl: string,
  testCase: ParityCase,
): Promise<ResponseSnapshot> {
  const headers: Record<string, string> = { ...testCase.headers };
  let body: string | undefined;
  if (testCase.body !== undefined) {
    body = typeof testCase.body === 'string' ? testCase.body : JSON.stringify(testCase.body);
  }
  const res = await fetch(new URL(testCase.path, baseUrl), {
    method: testCase.method,
    headers,
    body,
  });
  const raw = await res.text();
  return {
    status: res.status,
    body: normalizeBody(raw, res.headers.get('content-type') ?? undefined),
  };
}

async function callServerless(testCase: ParityCase): Promise<ResponseSnapshot> {
  const url = new URL(testCase.path, 'http://localhost');
  const headers: Record<string, string> = { ...testCase.headers };
  let body: string | undefined;
  if (testCase.body !== undefined) {
    body = typeof testCase.body === 'string' ? testCase.body : JSON.stringify(testCase.body);
  }

  const req = {
    method: testCase.method,
    url: url.pathname + url.search,
    headers,
    body,
    query: Object.fromEntries(url.searchParams.entries()),
  } as unknown as Parameters<typeof handler>[0];

  const result = await handler(req);
  const status = result.statusCode ?? 200;
  const contentType = result.headers?.['content-type'] ?? result.headers?.['Content-Type'];
  const raw = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
  return { status, body: normalizeBody(raw, contentType)};
}

describe('parity between Express and serverless handlers', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp();
    server = http.createServer(app);
    const addr = await listen(server);
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (server) await close(server);
  });

  for (const testCase of cases) {
    test(`the Express and serverless handlers agree on ${testCase.name}`, async () => {
      const [expressResponse, serverlessResponse] = await Promise.all([
        callExpress(baseUrl, testCase),
        callServerless(testCase),
      ]);

      assert.strictEqual(
        serverlessResponse.status,
        expressResponse.status,
        `status code diverged for ${testCase.name}: Express = ${expressResponse.status}, serverless = ${serverlessResponse.status}`,
      );
      assert.deepStrictEqual(
        serverlessResponse.body,
        expressResponse.body,
        `response body diverged for ${testCase.name}`,
      );
    });
  }
});
